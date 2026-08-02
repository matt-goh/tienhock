-- Green Target July 2026 debtor/account decisions (GT-P4 master data).
--
-- Applies the four user decisions of 31 Jul 2026. This migration moves MASTER
-- DATA ONLY: it creates debtor leaves and records the debtor account each
-- customer/invoice uses. It posts, restores and cancels NO journal — every
-- journal action is delegated to the shipped lifecycle services by
-- dev/import/greentarget-legacy/backfill-july-automatic-journals.mjs, which
-- must be run AFTER this migration.
--
-- Decision 1 - the six blocked July customers are NEW post-cutover customers
--   (each holds exactly one invoice, first issued 1-2 Jul 2026) and are absent
--   from the 30-Jun schedule because they did not exist on 30 Jun. They get
--   their own CD_SD children rather than adopting a lookalike legacy child:
--     CD-ALISSON is JOLLY LEANERS SDN BHD, CD-ABEL is ABEL ROBIN,
--     CD-KELVIN is NEW CUSTOMER, CD-MIMIE is "SKM, KKIP" - different parties.
-- Decision 4 - PAUMIN and NURI ARE their genuine legacy debtors (existing
--   named GTDB leaves under DEBTOR); revenue stays TGA on both invoices, so no
--   revenue_account_code is rewritten anywhere in this file.
--
-- Decisions 2 (restore journals 1706/1707) and 3 (cancel duplicate invoice
-- 342) are journal/document lifecycle actions and are NOT performed here.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF to_regclass('greentarget.account_codes') IS NULL
     OR to_regclass('greentarget.customers') IS NULL
     OR to_regclass('greentarget.invoices') IS NULL THEN
    RAISE EXCEPTION 'GT July decisions guard: Green Target foundation is missing';
  END IF;

  -- GT-P1 account-selection columns must exist, or the writes below are silent.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'greentarget' AND table_name = 'customers'
       AND column_name = 'debtor_account_code')
     OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'greentarget' AND table_name = 'invoices'
       AND column_name = 'debtor_account_code') THEN
    RAISE EXCEPTION 'GT July decisions guard: run 2026-07-30_greentarget_invoice_receipt_parity.sql first';
  END IF;

  -- The CD_SD control must already be the protected parent of the imported
  -- children, or these new leaves would hang off an unmigrated chart.
  IF NOT EXISTS (
    SELECT 1 FROM greentarget.account_codes
     WHERE code = 'CD_SD' AND ledger_type = 'TD' AND is_system = true)
     OR (SELECT count(*) FROM greentarget.account_codes
          WHERE parent_code = 'CD_SD') < 746 THEN
    RAISE EXCEPTION 'GT July decisions guard: run 2026-07-30_greentarget_cd_sd_subledger.sql first';
  END IF;

  -- PAUMIN and NURI must be the real legacy leaves the decision approved.
  IF NOT EXISTS (
    SELECT 1 FROM greentarget.account_codes
     WHERE code = 'PAUMIN' AND ledger_type = 'TD' AND is_active
       AND parent_code = 'DEBTOR')
     OR NOT EXISTS (
    SELECT 1 FROM greentarget.account_codes
     WHERE code = 'NURI' AND ledger_type = 'TD' AND is_active
       AND parent_code = 'DEBTOR') THEN
    RAISE EXCEPTION 'GT July decisions guard: the legacy PAUMIN/NURI debtor leaves are missing';
  END IF;
END;
$guard$;

-- ---------------------------------------------------------------------------
-- 1. The six new post-cutover CD_SD children
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE gt_july_new_debtors (
  customer_id  integer PRIMARY KEY,
  account_code text    NOT NULL,
  description  text    NOT NULL,
  customer_name text   NOT NULL
) ON COMMIT DROP;

INSERT INTO gt_july_new_debtors
  (customer_id, account_code, description, customer_name)
VALUES
  (57, 'CD-ZEXIE',     'ZEXIE CARMELIA', 'Zexie Carmelia'),
  (61, 'CD-MIZAN',     'MIZAN',          'MIZAN'),
  (62, 'CD-ALISWODI',  'ALIS WODI',      'ALIS WODI'),
  (63, 'CD-ABE',       'ABE',            'ABE'),
  (64, 'CD-KELVINYAP', 'KELVIN YAP',     'KELVIN YAP'),
  (65, 'CD-MIMIEE',    'MIMIE E',        'MIMIE E');

-- Refuse to run against a different dataset: each customer must exist under the
-- expected name and must not already carry a debtor account.
DO $verify$
DECLARE
  mismatch text;
BEGIN
  SELECT string_agg(
           format('customer %s expected %L', n.customer_id, n.customer_name),
           '; ')
    INTO mismatch
    FROM gt_july_new_debtors n
    LEFT JOIN greentarget.customers c ON c.customer_id = n.customer_id
   WHERE c.customer_id IS NULL
      OR upper(btrim(c.name)) <> upper(n.customer_name)
      OR COALESCE(btrim(c.debtor_account_code), '') NOT IN ('', n.account_code);
  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'GT July decisions: customer identity mismatch -> %', mismatch;
  END IF;

  -- A proposed code must be free, or already be the leaf this migration made.
  SELECT string_agg(a.code, '; ')
    INTO mismatch
    FROM greentarget.account_codes a
    JOIN gt_july_new_debtors n ON n.account_code = a.code
   WHERE a.parent_code IS DISTINCT FROM 'CD_SD';
  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'GT July decisions: account code already used elsewhere -> %', mismatch;
  END IF;
END;
$verify$;

INSERT INTO greentarget.account_codes
  (code, description, ledger_type, parent_code, level, sort_order,
   is_active, is_system, fs_note, notes, created_by, updated_by)
SELECT n.account_code,
       n.description,
       'TD',
       'CD_SD',
       3,
       (SELECT COALESCE(max(sort_order), 2746) FROM greentarget.account_codes
         WHERE parent_code = 'CD_SD')
         + row_number() OVER (ORDER BY n.customer_id),
       true,
       false,
       '22',
       '[GT-JULY-20260731] New post-cutover trade debtor; no 30-Jun legacy'
       || ' identity exists because the customer was created in July 2026.',
       'gt-july-parity-backfill',
       'gt-july-parity-backfill'
  FROM gt_july_new_debtors n
 WHERE NOT EXISTS (
   SELECT 1 FROM greentarget.account_codes a WHERE a.code = n.account_code);

-- ---------------------------------------------------------------------------
-- 2. Customer defaults (the six new leaves plus the two approved legacy ones)
-- ---------------------------------------------------------------------------
UPDATE greentarget.customers c
   SET debtor_account_code = n.account_code
  FROM gt_july_new_debtors n
 WHERE c.customer_id = n.customer_id
   AND c.debtor_account_code IS DISTINCT FROM n.account_code;

UPDATE greentarget.customers c
   SET debtor_account_code = v.account_code
  FROM (VALUES
          ('PAUMIN HARDWARE SDN BHD',                 'PAUMIN'),
          ('SYARIKAT PENIAGAAN PERABOT NURI SDN BHD', 'NURI')
       ) AS v(customer_name, account_code)
 WHERE upper(btrim(c.name)) = upper(v.customer_name)
   AND c.debtor_account_code IS DISTINCT FROM v.account_code;

-- ---------------------------------------------------------------------------
-- 3. Invoice snapshots for the blocked July invoices
-- ---------------------------------------------------------------------------
-- Only invoices still sitting on the CD_SD control are moved, and only when the
-- customer now has a default. Invoices that already snapshot a real leaf
-- (338/341/343/345) are left exactly as they are.
UPDATE greentarget.invoices i
   SET debtor_account_code = c.debtor_account_code
  FROM greentarget.customers c
 WHERE c.customer_id = i.customer_id
   AND i.date_issued >= DATE '2026-07-01'
   AND i.date_issued <  DATE '2026-08-01'
   AND i.status <> 'cancelled'
   AND COALESCE(btrim(i.debtor_account_code), '') IN ('', 'CD_SD')
   AND COALESCE(btrim(c.debtor_account_code), '') <> '';

-- ---------------------------------------------------------------------------
-- Post-conditions
-- ---------------------------------------------------------------------------
DO $check$
DECLARE
  new_leaves   integer;
  unmapped     text;
  still_cd_sd  text;
BEGIN
  SELECT count(*) INTO new_leaves
    FROM greentarget.account_codes a
    JOIN gt_july_new_debtors n ON n.account_code = a.code
   WHERE a.parent_code = 'CD_SD' AND a.ledger_type = 'TD' AND a.is_active
     AND a.fs_note = '22' AND a.level = 3;
  IF new_leaves <> 6 THEN
    RAISE EXCEPTION 'GT July decisions: expected 6 new CD_SD leaves, found %', new_leaves;
  END IF;

  SELECT string_agg(format('%s %s', c.customer_id, c.name), '; ')
    INTO unmapped
    FROM greentarget.customers c
    JOIN gt_july_new_debtors n ON n.customer_id = c.customer_id
   WHERE c.debtor_account_code IS DISTINCT FROM n.account_code;
  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION 'GT July decisions: customer default not applied -> %', unmapped;
  END IF;

  -- Every live July invoice must now name a real leaf. Invoice 342 is the
  -- known duplicate awaiting cancellation by the backfill and is excluded.
  SELECT string_agg(format('%s %s', i.invoice_id, i.invoice_number), '; ')
    INTO still_cd_sd
    FROM greentarget.invoices i
   WHERE i.date_issued >= DATE '2026-07-01'
     AND i.date_issued <  DATE '2026-08-01'
     AND i.status <> 'cancelled'
     AND i.invoice_id <> 342
     AND COALESCE(btrim(i.debtor_account_code), '') IN ('', 'CD_SD');
  IF still_cd_sd IS NOT NULL THEN
    RAISE EXCEPTION 'GT July decisions: invoice still on the CD_SD control -> %', still_cd_sd;
  END IF;

  RAISE NOTICE 'GT July decisions OK: 6 new CD_SD leaves; PAUMIN/NURI approved; July invoice snapshots resolved.';
END;
$check$;

COMMIT;

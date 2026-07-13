-- =============================================================================
-- Legacy Jan-May 2026 import: conflict clearing and identifier normalization.
--
-- Approved 13 Jul 2026. This migration deliberately does NOT import CSV rows;
-- it prepares the existing database for the staged legacy import by:
--   * normalizing two customer IDs that currently carry trailing spaces;
--   * correcting the shortened Toyota Hilux HP account codes to SWJ9882;
--   * creating the three genuinely missing legacy GL accounts;
--   * registering the IMP journal type;
--   * cancelling pre-cutover REC journals that the legacy import supersedes;
--   * moving THCN/26/1-16 journals from the approximate 31 May parking date to
--     their exact legacy dates (adjustment-document/e-Invoice rows untouched).
--
-- Guarded and idempotent: reruns validate the normalized end state. Any mixed
-- old/new identifier state or unexpected source-owned journal aborts the whole
-- transaction instead of guessing.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- A. Customer primary-key normalization: AMY[space] -> AMY,
--    STELLA[space] -> STELLA. The referenced rows are copied first because the
--    existing foreign keys use NO ACTION on update.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_old_exists BOOLEAN;
  v_new_exists BOOLEAN;
BEGIN
  FOR r IN
    SELECT *
      FROM (VALUES
        ('AMY '::varchar, 'AMY'::varchar),
        ('STELLA '::varchar, 'STELLA'::varchar)
      ) AS renames(old_id, new_id)
  LOOP
    SELECT EXISTS (SELECT 1 FROM customers WHERE id = r.old_id),
           EXISTS (SELECT 1 FROM customers WHERE id = r.new_id)
      INTO v_old_exists, v_new_exists;

    IF v_old_exists AND v_new_exists THEN
      RAISE EXCEPTION 'Cannot normalize customer % -> %: both IDs exist',
        quote_literal(r.old_id), quote_literal(r.new_id);
    ELSIF v_old_exists THEN
      INSERT INTO customers (
        id, name, closeness, salesman, tin_number, id_type, state, email,
        address, city, id_number, phone_number, credit_limit, credit_used,
        updated_at
      )
      SELECT r.new_id, name, closeness, salesman, tin_number, id_type, state,
             email, address, city, id_number, phone_number, credit_limit,
             credit_used, NOW()
        FROM customers
       WHERE id = r.old_id;

      UPDATE customer_branch_mappings SET customer_id = r.new_id WHERE customer_id = r.old_id;
      UPDATE customer_products SET customer_id = r.new_id WHERE customer_id = r.old_id;
      UPDATE receipt_allocations SET customer_id = r.new_id WHERE customer_id = r.old_id;
      UPDATE invoices SET customerid = r.new_id WHERE customerid = r.old_id;
      UPDATE adjustment_documents SET customerid = r.new_id WHERE customerid = r.old_id;
      UPDATE jellypolly.invoices SET customerid = r.new_id WHERE customerid = r.old_id;
      UPDATE jellypolly.adjustment_documents SET customerid = r.new_id WHERE customerid = r.old_id;

      DELETE FROM customers WHERE id = r.old_id;
    ELSIF NOT v_new_exists THEN
      RAISE EXCEPTION 'Cannot normalize customer % -> %: neither ID exists',
        quote_literal(r.old_id), quote_literal(r.new_id);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- B. Account-code normalization. A replacement account row is inserted before
--    every referencing column is moved, then the obsolete code is removed.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_old_exists BOOLEAN;
  v_new_exists BOOLEAN;
BEGIN
  FOR r IN
    SELECT *
      FROM (VALUES
        ('AMY '::varchar, 'AMY'::varchar, NULL::varchar, NULL::varchar),
        ('STELLA '::varchar, 'STELLA'::varchar, NULL::varchar, NULL::varchar),
        ('HPA_SWJ988'::varchar, 'HPA_SWJ9882'::varchar,
         'TOYOTA HILUX DOUBLE CAB (SWJ9882)'::varchar, '16'::varchar),
        ('HPB_SWJ988'::varchar, 'HPB_SWJ9882'::varchar,
         'TOYOTA HILUX DOUBLE CAB (SWJ9882)'::varchar, '23'::varchar)
      ) AS renames(old_code, new_code, new_description, new_fs_note)
  LOOP
    SELECT EXISTS (SELECT 1 FROM account_codes WHERE code = r.old_code),
           EXISTS (SELECT 1 FROM account_codes WHERE code = r.new_code)
      INTO v_old_exists, v_new_exists;

    IF v_old_exists AND v_new_exists THEN
      RAISE EXCEPTION 'Cannot normalize account % -> %: both codes exist',
        quote_literal(r.old_code), quote_literal(r.new_code);
    ELSIF v_old_exists THEN
      INSERT INTO account_codes (
        code, description, ledger_type, parent_code, level, sort_order,
        is_active, is_system, notes, created_at, updated_at, created_by,
        updated_by, fs_note
      )
      SELECT r.new_code,
             COALESCE(r.new_description, description),
             ledger_type, parent_code, level, sort_order, is_active, is_system,
             notes, created_at, NOW(), created_by, 'migration',
             COALESCE(r.new_fs_note, fs_note)
        FROM account_codes
       WHERE code = r.old_code;

      UPDATE account_codes SET parent_code = r.new_code WHERE parent_code = r.old_code;
      UPDATE account_opening_balances SET account_code = r.new_code WHERE account_code = r.old_code;
      UPDATE bank_in_groups SET holding_account = r.new_code WHERE holding_account = r.old_code;
      UPDATE bank_ins SET bank_account = r.new_code WHERE bank_account = r.old_code;
      UPDATE journal_entry_lines SET account_code = r.new_code WHERE account_code = r.old_code;
      UPDATE location_account_mappings SET account_code = r.new_code WHERE account_code = r.old_code;
      UPDATE material_account_mappings SET account_code = r.new_code WHERE account_code = r.old_code;
      UPDATE material_purchase_account_mappings SET purchase_account_code = r.new_code WHERE purchase_account_code = r.old_code;
      UPDATE payments SET bank_account = r.new_code WHERE bank_account = r.old_code;
      UPDATE receipt_allocations SET target_account = r.new_code WHERE target_account = r.old_code;
      UPDATE receipts SET debit_account = r.new_code WHERE debit_account = r.old_code;
      UPDATE self_billed_invoice_lines SET account_code = r.new_code WHERE account_code = r.old_code;
      UPDATE self_billed_invoices SET account_code = r.new_code WHERE account_code = r.old_code;
      UPDATE supplier_payments SET bank_account = r.new_code WHERE bank_account = r.old_code;
      UPDATE adjustment_documents SET bank_account = r.new_code WHERE bank_account = r.old_code;
      UPDATE jellypolly.adjustment_documents SET bank_account = r.new_code WHERE bank_account = r.old_code;

      DELETE FROM account_codes WHERE code = r.old_code;
    ELSIF NOT v_new_exists THEN
      RAISE EXCEPTION 'Cannot normalize account % -> %: neither code exists',
        quote_literal(r.old_code), quote_literal(r.new_code);
    END IF;

    IF r.new_description IS NOT NULL THEN
      UPDATE account_codes
         SET description = r.new_description,
             fs_note = r.new_fs_note,
             updated_at = NOW(),
             updated_by = 'migration'
       WHERE code = r.new_code
         AND (description IS DISTINCT FROM r.new_description
           OR fs_note IS DISTINCT FROM r.new_fs_note);
    END IF;
  END LOOP;
END $$;

-- The only genuinely missing active/non-zero legacy GL codes after the audited
-- alias/rename map. CL_AFI is a contra-receivable, not the unrelated IN_AI
-- other-income account that happens to share its description.
INSERT INTO account_codes (
  code, description, ledger_type, parent_code, level, sort_order,
  is_active, is_system, notes, created_by, updated_by, fs_note
)
VALUES
  ('CA_HINO', 'PREPAYMENT (SD1016T-HINO)', 'GL', 'CA', 2, 0,
   true, false, 'Created for Jan-May 2026 legacy import', 'migration', 'migration', '8'),
  ('OIL920', 'OIL - PERODUA ATIVA QCV920', 'GL', 'OIL', 3, 0,
   true, false, 'Created for Jan-May 2026 legacy import', 'migration', 'migration', '5'),
  ('CL_AFI', 'ALLOWANCE FOR IMPAIRMENT', 'GL', NULL, 1, 0,
   true, false, 'Contra-receivable from legacy opening balance', 'migration', 'migration', '22')
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('CA_HINO', 'PREPAYMENT (SD1016T-HINO)', 'GL', 'CA', '8'),
        ('OIL920', 'OIL - PERODUA ATIVA QCV920', 'GL', 'OIL', '5'),
        ('CL_AFI', 'ALLOWANCE FOR IMPAIRMENT', 'GL', NULL, '22')
      ) AS expected(code, description, ledger_type, parent_code, fs_note)
      LEFT JOIN account_codes ac ON ac.code = expected.code
     WHERE ac.code IS NULL
        OR ac.description IS DISTINCT FROM expected.description
        OR ac.ledger_type IS DISTINCT FROM expected.ledger_type
        OR ac.parent_code IS DISTINCT FROM expected.parent_code
        OR ac.fs_note IS DISTINCT FROM expected.fs_note
        OR ac.is_active IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'One or more legacy import account codes conflict with the approved definition';
  END IF;
END $$;

INSERT INTO journal_entry_types (code, name, description, is_active)
VALUES ('IMP', 'Legacy Import', 'Imported legacy accounting journal', true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_active = true;

-- -----------------------------------------------------------------------------
-- C. Cancel the old-model Jan-May REC journals. Payment rows and their journal
--    links remain as historical provenance; only the superseded journal status
--    changes. Any non-payment-owned row in the target population is a blocker.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM journal_entries je
      LEFT JOIN payments p
        ON p.payment_id::text = je.source_id
       AND p.journal_entry_id = je.id
     WHERE je.entry_type = 'REC'
       AND je.status = 'posted'
       AND je.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
       AND (je.source_type IS DISTINCT FROM 'payment' OR p.payment_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Jan-May posted REC population contains a journal that is not owned by its linked payment';
  END IF;
END $$;

UPDATE journal_entries
   SET status = 'cancelled',
       updated_at = NOW(),
       updated_by = 'migration'
 WHERE entry_type = 'REC'
   AND status = 'posted'
   AND source_type = 'payment'
   AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31';

-- -----------------------------------------------------------------------------
-- D. Exact accounting dates for THCN/26/1-16. Only journal headers move; the
--    adjustment documents and all MyInvois fields remain untouched.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE legacy_cn_dates (
  source_id varchar(255) PRIMARY KEY,
  display_reference varchar(100) NOT NULL,
  target_date date NOT NULL
) ON COMMIT DROP;

INSERT INTO legacy_cn_dates (source_id, display_reference, target_date)
VALUES
  ('CN-2026-0001', 'THCN/26/1',  DATE '2026-01-09'),
  ('CN-2026-0002', 'THCN/26/2',  DATE '2026-01-17'),
  ('CN-2026-0003', 'THCN/26/3',  DATE '2026-02-05'),
  ('CN-2026-0004', 'THCN/26/4',  DATE '2026-02-06'),
  ('CN-2026-0005', 'THCN/26/5',  DATE '2026-02-14'),
  ('CN-2026-0006', 'THCN/26/6',  DATE '2026-02-26'),
  ('CN-2026-0007', 'THCN/26/7',  DATE '2026-03-10'),
  ('CN-2026-0008', 'THCN/26/8',  DATE '2026-03-10'),
  ('CN-2026-0009', 'THCN/26/9',  DATE '2026-03-18'),
  ('CN-2026-0010', 'THCN/26/10', DATE '2026-04-08'),
  ('CN-2026-0011', 'THCN/26/11', DATE '2026-04-08'),
  ('CN-2026-0012', 'THCN/26/12', DATE '2026-04-08'),
  ('CN-2026-0013', 'THCN/26/13', DATE '2026-05-20'),
  ('CN-2026-0014', 'THCN/26/14', DATE '2026-05-28'),
  ('CN-2026-0015', 'THCN/26/15', DATE '2026-05-28'),
  ('CN-2026-0016', 'THCN/26/16', DATE '2026-05-28');

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM legacy_cn_dates expected
    JOIN journal_entries je
      ON je.source_type = 'adjustment'
     AND je.source_id = expected.source_id
     AND je.display_reference = expected.display_reference
     AND je.entry_type = 'CN'
     AND je.status = 'posted'
    JOIN adjustment_documents ad
      ON ad.id = expected.source_id
     AND ad.journal_entry_id = je.id
     AND ad.type = 'credit_note';

  IF v_count <> 16 THEN
    RAISE EXCEPTION 'Expected 16 healthy source-owned THCN journals, found %', v_count;
  END IF;
END $$;

UPDATE journal_entries je
   SET entry_date = expected.target_date,
       updated_at = NOW(),
       updated_by = 'migration'
  FROM legacy_cn_dates expected
 WHERE je.source_type = 'adjustment'
   AND je.source_id = expected.source_id
   AND je.display_reference = expected.display_reference
   AND je.entry_type = 'CN'
   AND je.entry_date IS DISTINCT FROM expected.target_date;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM legacy_cn_dates expected
      LEFT JOIN journal_entries je
        ON je.source_type = 'adjustment'
       AND je.source_id = expected.source_id
       AND je.display_reference = expected.display_reference
       AND je.entry_type = 'CN'
       AND je.status = 'posted'
     WHERE je.id IS NULL OR je.entry_date IS DISTINCT FROM expected.target_date
  ) THEN
    RAISE EXCEPTION 'THCN journal date normalization did not reach the approved exact state';
  END IF;
END $$;

COMMIT;

-- Verification summary.
SELECT entry_type, status, COUNT(*) AS journals,
       SUM(total_debit)::numeric(14,2) AS total_debit
  FROM journal_entries
 WHERE entry_type IN ('REC', 'CN')
   AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
 GROUP BY entry_type, status
 ORDER BY entry_type, status;

SELECT code, description, parent_code, fs_note
  FROM account_codes
 WHERE code IN ('AMY', 'STELLA', 'HPA_SWJ9882', 'HPB_SWJ9882',
                'CA_HINO', 'OIL920', 'CL_AFI')
 ORDER BY code;

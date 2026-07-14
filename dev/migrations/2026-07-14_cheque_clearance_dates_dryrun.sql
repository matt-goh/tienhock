-- =============================================================================
-- 2026-07-14_cheque_clearance_dates_dryrun.sql
-- Read-only preflight / postflight for four Phase-2-migrated customer cheques
-- whose cheque/received dates are in June but whose bank clearance dates are
-- in July.
--
-- This report must not change receipts.received_date or payments.payment_date:
-- those fields retain the cheque/received date.  The companion migration only
-- corrects receipts.posting_date and the owning journal's entry_date.
-- =============================================================================

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- 1. Exactly one receipt and one source-owned posted journal should exist for
--    each expected external reference.  DATE_STATE is OLD before the migration
--    and CORRECTED after it.
WITH expected(display_reference, received_date, clearing_date, total_amount) AS (
  VALUES
    ('CIMBI008054'::varchar, DATE '2026-06-13', DATE '2026-07-07', 11920.60::numeric(12,2)),
    ('MBB932202'::varchar,   DATE '2026-06-30', DATE '2026-07-10', 21270.00::numeric(12,2)),
    ('MBB932202-I'::varchar, DATE '2026-06-30', DATE '2026-07-10',  3420.00::numeric(12,2)),
    ('MBB932202-N'::varchar, DATE '2026-06-30', DATE '2026-07-10',  2479.50::numeric(12,2))
)
SELECT e.display_reference,
       COUNT(r.id) AS receipt_count,
       MIN(r.id) AS receipt_id,
       MIN(r.payment_method) AS payment_method,
       MIN(r.debit_account) AS debit_account,
       MIN(r.received_date) AS received_date,
       MIN(r.posting_date) AS posting_date,
       MIN(r.status) AS receipt_status,
       MIN(r.origin) AS origin,
       MIN(r.total_amount) AS total_amount,
       COUNT(je.id) AS linked_journal_count,
       MIN(je.id) AS journal_id,
       MIN(je.reference_no) AS internal_reference,
       MIN(je.entry_date) AS journal_date,
       MIN(je.status) AS journal_status,
       MIN(je.source_type) AS source_type,
       MIN(je.source_id) AS source_id,
       CASE
         WHEN COUNT(r.id) <> 1
           OR COUNT(je.id) <> 1
           OR MIN(r.payment_method) IS DISTINCT FROM 'cheque'
           OR MIN(r.debit_account) IS DISTINCT FROM 'BANK_PBB'
           OR MIN(r.received_date) IS DISTINCT FROM e.received_date
           OR MIN(r.status) IS DISTINCT FROM 'posted'
           OR MIN(r.origin) IS DISTINCT FROM 'erp'
           OR MIN(r.total_amount) IS DISTINCT FROM e.total_amount
           OR MIN(je.status) IS DISTINCT FROM 'posted'
           OR MIN(je.source_type) IS DISTINCT FROM 'receipt'
           OR MIN(je.source_id) IS DISTINCT FROM MIN(r.id)::text
           OR MIN(je.total_debit) IS DISTINCT FROM e.total_amount
           OR MIN(je.total_credit) IS DISTINCT FROM e.total_amount
           THEN 'CONFLICT'
         WHEN MIN(r.posting_date) = e.received_date
          AND MIN(je.entry_date) = e.received_date THEN 'OLD'
         WHEN MIN(r.posting_date) = e.clearing_date
          AND MIN(je.entry_date) = e.clearing_date THEN 'CORRECTED'
         ELSE 'CONFLICT'
       END AS date_state
  FROM expected e
  LEFT JOIN receipts r ON r.display_reference = e.display_reference
  LEFT JOIN journal_entries je ON je.id = r.journal_entry_id
 GROUP BY e.display_reference, e.received_date, e.clearing_date, e.total_amount
 ORDER BY e.display_reference;

-- 2. Exact allocation and compatibility-payment shape.  Every expected row
--    must report MATCH.  The payment date intentionally remains in June.
WITH expected_allocations(
  display_reference, line_number, invoice_id, customer_id, amount, received_date
) AS (
  VALUES
    ('CIMBI008054'::varchar, 1, '34322'::varchar, 'HAPSENG'::varchar,       1190.60::numeric(12,2), DATE '2026-06-13'),
    ('CIMBI008054'::varchar, 2, '34566'::varchar, 'HAPSENG'::varchar,      10730.00::numeric(12,2), DATE '2026-06-13'),
    ('MBB932202'::varchar,   1, '63731'::varchar, 'TETAPJAYA(M)'::varchar,  7902.70::numeric(12,2), DATE '2026-06-30'),
    ('MBB932202'::varchar,   2, '63839'::varchar, 'TETAPJAYA(M)'::varchar, 13367.30::numeric(12,2), DATE '2026-06-30'),
    ('MBB932202-I'::varchar, 1, '34854'::varchar, 'TETAPJAYA(I)'::varchar,  3420.00::numeric(12,2), DATE '2026-06-30'),
    ('MBB932202-N'::varchar, 1, '34822'::varchar, 'TETAPJAYA(N)'::varchar,  1026.00::numeric(12,2), DATE '2026-06-30'),
    ('MBB932202-N'::varchar, 2, '34896'::varchar, 'TETAPJAYA(N)'::varchar,  1453.50::numeric(12,2), DATE '2026-06-30')
), actual AS (
  SELECT r.display_reference, ra.id AS allocation_id, ra.line_number,
         ra.allocation_type, ra.invoice_id, ra.customer_id, ra.amount,
         ra.legacy_payment_id, p.payment_id, p.payment_date,
         p.amount_paid, p.payment_method, p.payment_reference,
         p.bank_account, p.status AS payment_status,
         p.receipt_allocation_id, p.journal_entry_id AS payment_journal_id,
         p.is_auto_collection
    FROM receipts r
    JOIN receipt_allocations ra ON ra.receipt_id = r.id
    LEFT JOIN payments p ON p.receipt_allocation_id = ra.id
   WHERE r.display_reference IN (
     'CIMBI008054', 'MBB932202', 'MBB932202-I', 'MBB932202-N'
   )
)
SELECT COALESCE(e.display_reference, a.display_reference) AS display_reference,
       COALESCE(e.line_number, a.line_number) AS line_number,
       e.invoice_id AS expected_invoice,
       a.invoice_id AS actual_invoice,
       e.customer_id AS expected_customer,
       a.customer_id AS actual_customer,
       e.amount AS expected_amount,
       a.amount AS allocation_amount,
       a.payment_id,
       a.payment_date,
       a.payment_status,
       CASE
         WHEN e.display_reference IS NULL THEN 'UNEXPECTED ALLOCATION'
         WHEN a.allocation_id IS NULL THEN 'MISSING ALLOCATION'
         WHEN a.allocation_type IS DISTINCT FROM 'invoice'
           OR a.invoice_id IS DISTINCT FROM e.invoice_id
           OR a.customer_id IS DISTINCT FROM e.customer_id
           OR a.amount IS DISTINCT FROM e.amount
           OR a.payment_id IS NULL
           OR a.legacy_payment_id IS DISTINCT FROM a.payment_id
           OR a.receipt_allocation_id IS DISTINCT FROM a.allocation_id
           OR a.payment_date::date IS DISTINCT FROM e.received_date
           OR a.amount_paid::numeric(12,2) IS DISTINCT FROM e.amount
           OR a.payment_method IS DISTINCT FROM 'cheque'
           OR a.payment_reference IS DISTINCT FROM e.display_reference
           OR a.bank_account IS DISTINCT FROM 'BANK_PBB'
           OR a.payment_status IS DISTINCT FROM 'active'
           OR a.payment_journal_id IS NOT NULL
           OR a.is_auto_collection IS DISTINCT FROM false THEN 'CONFLICT'
         ELSE 'MATCH'
       END AS state
  FROM expected_allocations e
  FULL JOIN actual a
    ON a.display_reference = e.display_reference
   AND a.line_number = e.line_number
 ORDER BY 1, 2;

-- 3. Journal lines remain unchanged.  This shows the bank debit and itemized
--    debtor credits that will move as one balanced journal into July.
SELECT r.display_reference, je.id AS journal_id, je.entry_date,
       jel.line_number, jel.account_code,
       jel.debit_amount, jel.credit_amount,
       jel.particulars, jel.cheque_reference
  FROM receipts r
  JOIN journal_entries je ON je.id = r.journal_entry_id
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
 WHERE r.display_reference IN (
   'CIMBI008054', 'MBB932202', 'MBB932202-I', 'MBB932202-N'
 )
 ORDER BY r.display_reference, jel.line_number;

-- 4. These are direct-to-bank cheque receipts, not cash receipts selected in an
--    RV bank-in.  Every dependency_count must be zero.
SELECT r.display_reference, COUNT(bia.id) AS posted_or_cancelled_bank_in_dependencies
  FROM receipts r
  LEFT JOIN bank_in_allocations bia ON bia.receipt_id = r.id
 WHERE r.display_reference IN (
   'CIMBI008054', 'MBB932202', 'MBB932202-I', 'MBB932202-N'
 )
 GROUP BY r.display_reference
 ORDER BY r.display_reference;

-- 5. Expected accounting movement: RM39,090.10 leaves June and enters July.
--    The four journals remain balanced, so current cumulative balances do not
--    change; only period timing changes.
SELECT je.entry_date,
       COUNT(DISTINCT je.id) AS journal_count,
       SUM(jel.debit_amount) FILTER (WHERE jel.account_code = 'BANK_PBB')::numeric(14,2)
         AS bank_pbb_debit,
       SUM(jel.credit_amount) FILTER (WHERE jel.account_code <> 'BANK_PBB')::numeric(14,2)
         AS debtor_credit
  FROM receipts r
  JOIN journal_entries je ON je.id = r.journal_entry_id
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
 WHERE r.display_reference IN (
   'CIMBI008054', 'MBB932202', 'MBB932202-I', 'MBB932202-N'
 )
 GROUP BY je.entry_date
 ORDER BY je.entry_date;

COMMIT;

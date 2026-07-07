-- Backfill sales journals (entry_type 'S') for invoices from 1 June 2026 onward, and
-- re-point posted REC cash-receipt lines from the generic CASH account to CH_REV1/CH_REV2.
--
-- Run AFTER the column migration and the sales-journal code are deployed.
-- Idempotent: re-running inserts no new journals and rewrites no already-migrated lines.
-- Apply: docker exec -i tienhock_dev_db psql -U postgres -d tienhock < migrations/2026_07_07_backfill_sales_journals.sql

BEGIN;

-- Cutoff = 2026-06-01 00:00 Asia/Kuala_Lumpur, as a unix-ms string (invoices.createddate is text ms).
-- 1780243200000 = EXTRACT(EPOCH FROM TIMESTAMP '2026-06-01 00:00' AT TIME ZONE 'Asia/Kuala_Lumpur') * 1000

-- 0. Guard: a sales journal's reference_no is the invoice id. Abort if any existing
--    journal already uses an eligible invoice id as its reference (e.g. a PUR entry keyed
--    to a supplier invoice number that happens to equal a sales bill number).
DO $$
DECLARE
  conflict_count integer;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM journal_entries je
  JOIN invoices i ON i.id = je.reference_no
  WHERE je.entry_type <> 'S'
    AND i.createddate::bigint >= 1780243200000
    AND NOT i.is_consolidated
    AND i.invoice_status <> 'cancelled'
    AND i.totalamountpayable > 0;
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Aborting backfill: % existing non-S journal(s) already use an eligible invoice id as reference_no. Rename them first.', conflict_count;
  END IF;
END $$;

-- 1. Insert S journal headers (one per eligible invoice not already journalled).
WITH eligible AS (
  SELECT i.id, i.paymenttype, i.totalamountpayable, i.createddate,
         COALESCE(c.name, i.customerid) AS cust_name,
         (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS entry_date,
         ROUND(i.totalamountpayable::numeric, 2) AS amount
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customerid
  WHERE i.createddate::bigint >= 1780243200000
    AND NOT i.is_consolidated
    AND i.invoice_status <> 'cancelled'
    AND i.totalamountpayable > 0
    AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_no = i.id)
),
ins AS (
  INSERT INTO journal_entries (
    reference_no, entry_type, entry_date, description,
    total_debit, total_credit, status, created_at
  )
  SELECT
    e.id, 'S', e.entry_date,
    CASE WHEN e.paymenttype = 'CASH'
         THEN 'CASH BILL ' || e.id || ' ' || e.cust_name
         ELSE 'CR SALES ' || e.id || ' ' || e.cust_name END,
    e.amount, e.amount, 'posted', NOW()
  FROM eligible e
  RETURNING id, reference_no
)
-- 2. Two lines per journal: DR TR / CR CASH_SALES|CR_SALES, then link back to the invoice.
, lines AS (
  INSERT INTO journal_entry_lines (
    journal_entry_id, line_number, account_code,
    debit_amount, credit_amount, reference, particulars, created_at
  )
  SELECT ins.id, 1, 'TR', e.amount, 0, e.id,
         CASE WHEN e.paymenttype = 'CASH'
              THEN 'CASH BILL ' || e.id || ' ' || e.cust_name
              ELSE 'CR SALES ' || e.id || ' ' || e.cust_name END,
         NOW()
  FROM ins JOIN eligible e ON e.id = ins.reference_no
  UNION ALL
  SELECT ins.id, 2,
         CASE WHEN e.paymenttype = 'CASH' THEN 'CASH_SALES' ELSE 'CR_SALES' END,
         0, e.amount, e.id,
         CASE WHEN e.paymenttype = 'CASH'
              THEN 'CASH BILL ' || e.id || ' ' || e.cust_name
              ELSE 'CR SALES ' || e.id || ' ' || e.cust_name END,
         NOW()
  FROM ins JOIN eligible e ON e.id = ins.reference_no
)
UPDATE invoices i
SET journal_entry_id = ins.id
FROM ins
WHERE i.id = ins.reference_no;

-- 3. Re-point posted REC cash-debit lines (>= 2026-06-01) to CH_REV1/CH_REV2 by invoice type.
--    Covers overpaid journals too (they have a payments row). Idempotent: no CASH lines remain after.
UPDATE journal_entry_lines l
SET account_code = CASE WHEN i.paymenttype = 'INVOICE' THEN 'CH_REV2' ELSE 'CH_REV1' END
FROM journal_entries je, payments p, invoices i
WHERE je.id = l.journal_entry_id
  AND je.entry_type = 'REC'
  AND je.status = 'posted'
  AND je.entry_date >= DATE '2026-06-01'
  AND l.account_code = 'CASH'
  AND l.debit_amount > 0
  AND p.journal_entry_id = je.id
  AND i.id = p.invoice_id;

COMMIT;

-- Verify (expected on the 7 Jul 2026 prod snapshot: 473 S journals;
--   CASH_SALES total 259,052.40, CR_SALES total 596,959.50; ~317 REC lines re-pointed):
--   SELECT jel.account_code, COUNT(*), SUM(jel.credit_amount)
--   FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
--   WHERE je.entry_type = 'S' AND je.status = 'posted' AND jel.credit_amount > 0
--   GROUP BY jel.account_code;

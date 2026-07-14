-- =============================================================================
-- 2026-07-14_cheque_clearance_dates.sql
-- Correct the accounting/clearance dates of four Phase-2-migrated customer
-- cheques using the July bank-statement evidence supplied by the user.
--
-- Scope:
--   CIMBI008054       RM11,920.60  clears 2026-07-07
--   MBB932202 family  RM27,169.50  clears 2026-07-10
--
-- Intentionally preserved:
--   * receipts.received_date (the cheque/received date)
--   * payments.payment_date (the compatibility payment-history date)
--   * receipt/payment status, allocations, amounts and references
--   * invoice.balance_due and customers.credit_used
--   * journal lines, created audit fields and posted_at
--
-- Only receipts.posting_date and the linked receipt-owned journal's entry_date
-- are corrected, with update audit metadata.  The guards accept either the
-- original date or the already-corrected date, so a rerun makes zero changes.
-- IMPORTANT: run with a client that stops on the first error.  For psql, use
-- `psql -v ON_ERROR_STOP=1 ...`; a raised guard must stop the deployment.
-- Run 2026-07-14_cheque_clearance_dates_dryrun.sql before and after this file.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

SELECT pg_advisory_xact_lock(
  hashtextextended('2026-07-14_cheque_clearance_dates', 0)
);

LOCK TABLE receipts, journal_entries, receipt_allocations, payments,
  journal_entry_lines, bank_in_allocations IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _expected_cheque_clearances (
  display_reference VARCHAR(100) PRIMARY KEY,
  received_date     DATE NOT NULL,
  clearing_date     DATE NOT NULL,
  total_amount      NUMERIC(12,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO _expected_cheque_clearances (
  display_reference, received_date, clearing_date, total_amount
) VALUES
  ('CIMBI008054', DATE '2026-06-13', DATE '2026-07-07', 11920.60),
  ('MBB932202',   DATE '2026-06-30', DATE '2026-07-10', 21270.00),
  ('MBB932202-I', DATE '2026-06-30', DATE '2026-07-10',  3420.00),
  ('MBB932202-N', DATE '2026-06-30', DATE '2026-07-10',  2479.50);

CREATE TEMP TABLE _expected_cheque_allocations (
  display_reference VARCHAR(100) NOT NULL,
  line_number       INTEGER NOT NULL,
  invoice_id        VARCHAR(255) NOT NULL,
  customer_id       VARCHAR(50) NOT NULL,
  amount            NUMERIC(12,2) NOT NULL,
  PRIMARY KEY (display_reference, line_number)
) ON COMMIT DROP;

INSERT INTO _expected_cheque_allocations (
  display_reference, line_number, invoice_id, customer_id, amount
) VALUES
  ('CIMBI008054', 1, '34322', 'HAPSENG',        1190.60),
  ('CIMBI008054', 2, '34566', 'HAPSENG',       10730.00),
  ('MBB932202',   1, '63731', 'TETAPJAYA(M)',   7902.70),
  ('MBB932202',   2, '63839', 'TETAPJAYA(M)',  13367.30),
  ('MBB932202-I', 1, '34854', 'TETAPJAYA(I)',   3420.00),
  ('MBB932202-N', 1, '34822', 'TETAPJAYA(N)',   1026.00),
  ('MBB932202-N', 2, '34896', 'TETAPJAYA(N)',   1453.50);

DO $migration$
DECLARE
  v_receipts_updated INTEGER := 0;
  v_journals_updated INTEGER := 0;
BEGIN
  -- Lock source rows first.  Receipt lifecycle operations also lock these rows,
  -- so the proof below cannot race a confirmation/cancellation/reference edit.
  PERFORM r.id
    FROM receipts r
    JOIN _expected_cheque_clearances e
      ON e.display_reference = r.display_reference
   ORDER BY r.id
   FOR UPDATE OF r;

  PERFORM je.id
    FROM receipts r
    JOIN _expected_cheque_clearances e
      ON e.display_reference = r.display_reference
    JOIN journal_entries je ON je.id = r.journal_entry_id
   ORDER BY je.id
   FOR UPDATE OF je;

  PERFORM ra.id
    FROM receipts r
    JOIN _expected_cheque_clearances e
      ON e.display_reference = r.display_reference
    JOIN receipt_allocations ra ON ra.receipt_id = r.id
   ORDER BY ra.id
   FOR UPDATE OF ra;

  PERFORM p.payment_id
    FROM receipts r
    JOIN _expected_cheque_clearances e
      ON e.display_reference = r.display_reference
    JOIN receipt_allocations ra ON ra.receipt_id = r.id
    JOIN payments p ON p.receipt_allocation_id = ra.id
   ORDER BY p.payment_id
   FOR UPDATE OF p;

  -- Business references are repeatable by design, so require exactly one
  -- receipt for every expected reference before using them as correction keys.
  IF EXISTS (
    SELECT 1
      FROM _expected_cheque_clearances e
      LEFT JOIN receipts r ON r.display_reference = e.display_reference
     GROUP BY e.display_reference
    HAVING COUNT(r.id) <> 1
  ) THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: an expected reference is missing or duplicated';
  END IF;

  -- Require the exact migrated receipt shape and either the original date or
  -- the already-corrected date.  This prevents a broad reference-only rewrite.
  IF EXISTS (
    SELECT 1
      FROM _expected_cheque_clearances e
      JOIN receipts r ON r.display_reference = e.display_reference
     WHERE r.payment_method IS DISTINCT FROM 'cheque'
        OR r.debit_account IS DISTINCT FROM 'BANK_PBB'
        OR r.received_date IS DISTINCT FROM e.received_date
        OR (
             r.posting_date IS DISTINCT FROM e.received_date
         AND r.posting_date IS DISTINCT FROM e.clearing_date
        )
        OR r.status IS DISTINCT FROM 'posted'
        OR r.origin IS DISTINCT FROM 'erp'
        OR r.total_amount IS DISTINCT FROM e.total_amount
        OR r.journal_entry_id IS NULL
        OR r.created_by IS DISTINCT FROM 'migration'
  ) THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: receipt identity/amount/date/state no longer matches the approved cases';
  END IF;

  -- The receipt and journal dates must agree before correction.  Prove source
  -- ownership, journal type/status, internal reference and balanced header.
  IF EXISTS (
    SELECT 1
      FROM _expected_cheque_clearances e
      JOIN receipts r ON r.display_reference = e.display_reference
      LEFT JOIN journal_entries je ON je.id = r.journal_entry_id
     WHERE je.id IS NULL
        OR je.reference_no IS DISTINCT FROM ('REC-M' || r.id::text)
        OR je.entry_type IS DISTINCT FROM 'REC'
        OR je.entry_date IS DISTINCT FROM r.posting_date
        OR je.status IS DISTINCT FROM 'posted'
        OR je.display_reference IS DISTINCT FROM e.display_reference
        OR je.source_type IS DISTINCT FROM 'receipt'
        OR je.source_id IS DISTINCT FROM r.id::text
        OR je.total_debit IS DISTINCT FROM e.total_amount
        OR je.total_credit IS DISTINCT FROM e.total_amount
        OR je.created_by IS DISTINCT FROM 'migration'
  ) THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: linked receipt journal no longer matches the approved source-owned journal';
  END IF;

  -- Every approved allocation must exist with the exact invoice/customer/amount.
  IF EXISTS (
    SELECT 1
      FROM _expected_cheque_allocations e
      JOIN receipts r ON r.display_reference = e.display_reference
      LEFT JOIN receipt_allocations ra
        ON ra.receipt_id = r.id AND ra.line_number = e.line_number
     WHERE ra.id IS NULL
        OR ra.allocation_type IS DISTINCT FROM 'invoice'
        OR ra.invoice_id IS DISTINCT FROM e.invoice_id
        OR ra.customer_id IS DISTINCT FROM e.customer_id
        OR ra.amount IS DISTINCT FROM e.amount
        OR ra.legacy_payment_id IS NULL
  ) OR EXISTS (
    SELECT 1
      FROM receipts r
      JOIN _expected_cheque_clearances h
        ON h.display_reference = r.display_reference
      JOIN receipt_allocations ra ON ra.receipt_id = r.id
      LEFT JOIN _expected_cheque_allocations e
        ON e.display_reference = r.display_reference
       AND e.line_number = ra.line_number
     WHERE e.display_reference IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: receipt allocations no longer match the seven approved invoice allocations';
  END IF;

  -- There must be exactly one compatibility payment per allocation, retaining
  -- the June received date.  These rows are deliberately not updated below.
  IF EXISTS (
    SELECT ra.id
      FROM receipts r
      JOIN _expected_cheque_clearances e
        ON e.display_reference = r.display_reference
      JOIN receipt_allocations ra ON ra.receipt_id = r.id
      LEFT JOIN payments p ON p.receipt_allocation_id = ra.id
     GROUP BY ra.id
    HAVING COUNT(p.payment_id) <> 1
  ) OR EXISTS (
    SELECT 1
      FROM receipts r
      JOIN _expected_cheque_clearances e
        ON e.display_reference = r.display_reference
      JOIN receipt_allocations ra ON ra.receipt_id = r.id
      JOIN payments p ON p.receipt_allocation_id = ra.id
     WHERE ra.legacy_payment_id IS DISTINCT FROM p.payment_id
        OR p.invoice_id IS DISTINCT FROM ra.invoice_id
        OR p.payment_date::date IS DISTINCT FROM e.received_date
        OR p.amount_paid::numeric(12,2) IS DISTINCT FROM ra.amount
        OR p.payment_method IS DISTINCT FROM 'cheque'
        OR p.payment_reference IS DISTINCT FROM e.display_reference
        OR p.bank_account IS DISTINCT FROM 'BANK_PBB'
        OR p.status IS DISTINCT FROM 'active'
        OR p.is_auto_collection IS DISTINCT FROM false
        OR p.journal_entry_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: compatibility payment history no longer matches the preserved June receipt dates';
  END IF;

  -- Prove one bank debit, itemized debtor credits and cent-balanced lines.  No
  -- journal line is rewritten by this migration.
  IF EXISTS (
    SELECT r.id
      FROM _expected_cheque_clearances e
      JOIN receipts r ON r.display_reference = e.display_reference
      JOIN journal_entries je ON je.id = r.journal_entry_id
      LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
     GROUP BY r.id, e.display_reference, e.total_amount
    HAVING COUNT(jel.id) <>
             1 + (
               SELECT COUNT(*)
                 FROM _expected_cheque_allocations ea
                WHERE ea.display_reference = e.display_reference
             )
        OR COALESCE(SUM(jel.debit_amount), 0)::numeric(12,2)
             IS DISTINCT FROM e.total_amount
        OR COALESCE(SUM(jel.credit_amount), 0)::numeric(12,2)
             IS DISTINCT FROM e.total_amount
        OR COUNT(jel.id) FILTER (
             WHERE jel.line_number = 1
               AND jel.account_code = 'BANK_PBB'
               AND jel.debit_amount = e.total_amount
               AND jel.credit_amount = 0
           ) <> 1
  ) OR EXISTS (
    SELECT 1
      FROM _expected_cheque_allocations e
      JOIN receipts r ON r.display_reference = e.display_reference
      LEFT JOIN journal_entry_lines jel
        ON jel.journal_entry_id = r.journal_entry_id
       AND jel.line_number = e.line_number + 1
     WHERE jel.id IS NULL
        OR jel.account_code IS DISTINCT FROM e.customer_id
        OR jel.debit_amount IS DISTINCT FROM 0::numeric
        OR jel.credit_amount IS DISTINCT FROM e.amount
  ) THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: receipt journal lines no longer match the approved balanced journals';
  END IF;

  -- Direct-to-bank cheque receipts must not be connected to an RV bank-in.
  IF EXISTS (
    SELECT 1
      FROM receipts r
      JOIN _expected_cheque_clearances e
        ON e.display_reference = r.display_reference
      JOIN bank_in_allocations bia ON bia.receipt_id = r.id
  ) THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: an approved direct-bank receipt has a bank-in dependency';
  END IF;

  UPDATE receipts r
     SET posting_date = e.clearing_date,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = 'migration'
    FROM _expected_cheque_clearances e
   WHERE r.display_reference = e.display_reference
     AND r.posting_date IS DISTINCT FROM e.clearing_date;
  GET DIAGNOSTICS v_receipts_updated = ROW_COUNT;

  UPDATE journal_entries je
     SET entry_date = e.clearing_date,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = 'migration'
    FROM receipts r,
         _expected_cheque_clearances e
   WHERE r.display_reference = e.display_reference
     AND je.id = r.journal_entry_id
     AND je.entry_date IS DISTINCT FROM e.clearing_date;
  GET DIAGNOSTICS v_journals_updated = ROW_COUNT;

  IF v_receipts_updated <> v_journals_updated THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: receipt updates (%) and journal updates (%) differ',
      v_receipts_updated, v_journals_updated;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _expected_cheque_clearances e
      JOIN receipts r ON r.display_reference = e.display_reference
      JOIN journal_entries je ON je.id = r.journal_entry_id
     WHERE r.received_date IS DISTINCT FROM e.received_date
        OR r.posting_date IS DISTINCT FROM e.clearing_date
        OR je.entry_date IS DISTINCT FROM e.clearing_date
  ) THEN
    RAISE EXCEPTION
      'Cheque-clearance correction aborted: post-update date invariant failed';
  END IF;

  RAISE NOTICE
    'Cheque-clearance dates verified: % receipt rows and % journal rows updated (0/0 is a safe rerun)',
    v_receipts_updated, v_journals_updated;
END
$migration$;

COMMIT;

-- Compact postflight result.  All four rows must show their July posting date
-- while received_date and every payment date remain in June.
SELECT r.display_reference, r.received_date, r.posting_date,
       r.total_amount, je.entry_date AS journal_date,
       COUNT(p.payment_id) AS payment_rows,
       MIN(p.payment_date)::date AS earliest_payment_date,
       MAX(p.payment_date)::date AS latest_payment_date
  FROM receipts r
  JOIN journal_entries je ON je.id = r.journal_entry_id
  JOIN receipt_allocations ra ON ra.receipt_id = r.id
  JOIN payments p ON p.receipt_allocation_id = ra.id
 WHERE r.display_reference IN (
   'CIMBI008054', 'MBB932202', 'MBB932202-I', 'MBB932202-N'
 )
 GROUP BY r.display_reference, r.received_date, r.posting_date,
          r.total_amount, je.entry_date
 ORDER BY r.display_reference;

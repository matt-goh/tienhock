-- =============================================================================
-- MYSHOP-SKT opening-credit reconciliation
--
-- The authoritative debtor ledger carries a RM41.05 credit at 01/01/2026.
-- Invoice 62297 nevertheless retained RM41.05 as due because the historical
-- Credit Note that both cleared that invoice and left the RM41.05 excess is
-- outside the operational adjustment-document history.
--
-- Invoice 63864 was later reduced by CN-2026-0014 to RM1,658.70. Receipt
-- TF010726-3 correctly collected RM1,617.65 on 01/07/2026, leaving exactly the
-- RM41.05 that the customer asked to contra against the old credit. The debtor
-- ledger already closes at RM0.00, so posting another journal would duplicate
-- the credit.
--
-- This guarded correction therefore adds two NON-POSTING payment-history
-- projections:
--   1. the historical CN portion that cleared invoice 62297; and
--   2. the remaining opening credit applied to invoice 63864 on 01/07/2026.
-- It then clears both operational invoice balances and recomputes credit_used.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('myshop_skt_63864_opening_credit_contra', 0)
);

-- Contra is a subledger application of credit already present in accounting;
-- it is intentionally not one of the receipt methods accepted by the API.
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'cheque', 'bank_transfer', 'online', 'contra'));

DO $$
DECLARE
  v_contra_count INTEGER;
  v_credit_used NUMERIC(12,2);
  v_open_invoice_total NUMERIC(12,2);
  v_ledger_balance NUMERIC(12,2);
  v_old_active_total NUMERIC(12,2);
  v_new_active_total NUMERIC(12,2);
BEGIN
  PERFORM id
    FROM customers
   WHERE id = 'MYSHOP-SKT'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer MYSHOP-SKT not found';
  END IF;

  PERFORM id
    FROM invoices
   WHERE id = ANY(ARRAY['62297', '63864']::varchar[])
   ORDER BY id
   FOR UPDATE;
  IF (SELECT COUNT(*) FROM invoices WHERE id IN ('62297', '63864')) <> 2 THEN
    RAISE EXCEPTION 'Expected invoices 62297 and 63864';
  END IF;

  PERFORM payment_id
    FROM payments
   WHERE invoice_id IN ('62297', '63864')
   ORDER BY payment_id
   FOR UPDATE;

  SELECT COUNT(*)
    INTO v_contra_count
    FROM payments
   WHERE internal_reference IN (
     'CONTRA-MYSHOP-SKT-62297',
     'CONTRA-MYSHOP-SKT-63864'
   );

  -- Idempotent success path after the correction has already run.
  IF v_contra_count = 2 THEN
    IF NOT EXISTS (
      SELECT 1
        FROM payments
       WHERE internal_reference = 'CONTRA-MYSHOP-SKT-62297'
         AND invoice_id = '62297'
         AND payment_date::date = DATE '2025-12-31'
         AND amount_paid = 41.05
         AND payment_method = 'contra'
         AND status = 'active'
         AND journal_entry_id IS NULL
         AND receipt_allocation_id IS NULL
    ) OR NOT EXISTS (
      SELECT 1
        FROM payments
       WHERE internal_reference = 'CONTRA-MYSHOP-SKT-63864'
         AND invoice_id = '63864'
         AND payment_date::date = DATE '2026-07-01'
         AND amount_paid = 41.05
         AND payment_method = 'contra'
         AND status = 'active'
         AND journal_entry_id IS NULL
         AND receipt_allocation_id IS NULL
    ) OR EXISTS (
      SELECT 1
        FROM invoices
       WHERE id IN ('62297', '63864')
         AND (balance_due <> 0 OR LOWER(invoice_status) <> 'paid')
    ) THEN
      RAISE EXCEPTION 'Existing MYSHOP-SKT contra correction has drifted';
    END IF;

    SELECT credit_used::numeric(12,2)
      INTO v_credit_used
      FROM customers
     WHERE id = 'MYSHOP-SKT';
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2)
      INTO v_open_invoice_total
      FROM invoices
     WHERE customerid = 'MYSHOP-SKT'
       AND paymenttype = 'INVOICE'
       AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_open_invoice_total) > 0.005 THEN
      RAISE EXCEPTION
        'MYSHOP-SKT credit_used % differs from invoice balance % after prior correction',
        v_credit_used, v_open_invoice_total;
    END IF;
    RETURN;
  ELSIF v_contra_count <> 0 THEN
    RAISE EXCEPTION 'Partial MYSHOP-SKT contra correction found (% rows)', v_contra_count;
  END IF;

  -- Guard the two operational invoice residues being repaired.
  IF NOT EXISTS (
    SELECT 1
      FROM invoices
     WHERE id = '62297'
       AND customerid = 'MYSHOP-SKT'
       AND paymenttype = 'INVOICE'
       AND totalamountpayable = 1368.00
       AND balance_due = 41.05
       AND invoice_status = 'Overdue'
  ) OR NOT EXISTS (
    SELECT 1
      FROM invoices
     WHERE id = '63864'
       AND customerid = 'MYSHOP-SKT'
       AND paymenttype = 'INVOICE'
       AND totalamountpayable = 1710.00
       AND balance_due = 41.05
       AND invoice_status = 'Overdue'
  ) THEN
    RAISE EXCEPTION 'MYSHOP-SKT invoice balances/statuses no longer match the approved case';
  END IF;

  -- Guard the genuine cash/bank settlement evidence. These rows are preserved.
  IF NOT EXISTS (
    SELECT 1
      FROM payments
     WHERE payment_id = 1539
       AND invoice_id = '62297'
       AND payment_date::date = DATE '2025-10-07'
       AND amount_paid = 1326.95
       AND payment_reference = 'TF071025-1'
       AND status = 'active'
  ) OR NOT EXISTS (
    SELECT 1
      FROM payments
     WHERE payment_id = 5720
       AND invoice_id = '63864'
       AND payment_date::date = DATE '2026-07-01'
       AND amount_paid = 1617.65
       AND payment_reference = 'TF010726-3'
       AND status = 'active'
       AND receipt_allocation_id = 273
  ) THEN
    RAISE EXCEPTION 'MYSHOP-SKT payment evidence no longer matches the approved case';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM receipt_allocations ra
      JOIN receipts r ON r.id = ra.receipt_id
     WHERE ra.id = 273
       AND ra.receipt_id = 199
       AND ra.allocation_type = 'invoice'
       AND ra.invoice_id = '63864'
       AND ra.amount = 1617.65
       AND r.display_reference = 'TF010726-3'
       AND r.received_date = DATE '2026-07-01'
       AND r.posting_date = DATE '2026-07-01'
       AND r.status = 'posted'
       AND r.journal_entry_id = 11720
  ) THEN
    RAISE EXCEPTION 'Receipt TF010726-3 no longer matches the approved RM1617.65 posting';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM adjustment_documents
     WHERE id = 'CN-2026-0014'
       AND original_invoice_id = '63864'
       AND type = 'credit_note'
       AND totalamountpayable = 51.30
       AND status = 'active'
       AND journal_entry_id = 2686
  ) THEN
    RAISE EXCEPTION 'Credit Note CN-2026-0014 no longer matches the approved case';
  END IF;

  -- The imported debtor ledger is the proof of the old over-credit and of the
  -- zero accounting balance after the genuine 01/07/2026 receipt.
  IF NOT EXISTS (
    SELECT 1
      FROM account_opening_balances
     WHERE account_code = 'MYSHOP-SKT'
       AND as_of_date = DATE '2026-01-01'
       AND amount = -41.05
  ) OR NOT EXISTS (
    SELECT 1
      FROM account_opening_balances
     WHERE account_code = 'MYSHOP-SKT'
       AND as_of_date = DATE '2026-06-01'
       AND amount = 1617.65
  ) THEN
    RAISE EXCEPTION 'MYSHOP-SKT opening-balance proof changed';
  END IF;

  SELECT anchor.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted'
              AND jel.account_code = 'MYSHOP-SKT'
              AND je.entry_date >= anchor.as_of_date
              AND je.entry_date <= DATE '2026-07-01'
         ), 0)
    INTO v_ledger_balance
    FROM (
      SELECT as_of_date, amount
        FROM account_opening_balances
       WHERE account_code = 'MYSHOP-SKT'
         AND as_of_date <= DATE '2026-07-01'
       ORDER BY as_of_date DESC
       LIMIT 1
    ) anchor;
  IF ABS(v_ledger_balance) > 0.005 THEN
    RAISE EXCEPTION
      'MYSHOP-SKT debtor ledger is %, expected RM0.00 as at 01/07/2026',
      v_ledger_balance;
  END IF;

  SELECT credit_used::numeric(12,2)
    INTO v_credit_used
    FROM customers
   WHERE id = 'MYSHOP-SKT';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2)
    INTO v_open_invoice_total
    FROM invoices
   WHERE customerid = 'MYSHOP-SKT'
     AND paymenttype = 'INVOICE'
     AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - v_open_invoice_total) > 0.005 THEN
    RAISE EXCEPTION
      'MYSHOP-SKT credit_used % differs from invoice balance % before correction',
      v_credit_used, v_open_invoice_total;
  END IF;

  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, internal_reference, bank_account, journal_entry_id,
    notes, status, is_auto_collection, receipt_allocation_id
  ) VALUES
  (
    '62297', DATE '2025-12-31', 41.05, 'contra',
    'LEGACY CN CREDIT', 'CONTRA-MYSHOP-SKT-62297', NULL, NULL,
    'Legacy Credit Note portion applied to close invoice 62297; the remaining RM41.05 is the customer credit carried into 2026.',
    'active', false, NULL
  ),
  (
    '63864', DATE '2026-07-01', 41.05, 'contra',
    'OPENING CREDIT', 'CONTRA-MYSHOP-SKT-63864', NULL, NULL,
    'Applied the MYSHOP-SKT RM41.05 legacy opening credit to invoice 63864. Non-posting contra: the debtor ledger already contains this credit.',
    'active', false, NULL
  );

  UPDATE invoices
     SET balance_due = 0,
         invoice_status = 'paid'
   WHERE id IN ('62297', '63864');

  UPDATE customers
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = 'MYSHOP-SKT'
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE id = 'MYSHOP-SKT';

  SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2)
    INTO v_old_active_total
    FROM payments
   WHERE invoice_id = '62297'
     AND (status IS NULL OR status = 'active');
  SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2)
    INTO v_new_active_total
    FROM payments
   WHERE invoice_id = '63864'
     AND (status IS NULL OR status = 'active');

  IF v_old_active_total <> 1368.00 OR v_new_active_total <> 1658.70 THEN
    RAISE EXCEPTION
      'MYSHOP-SKT settlement totals are % / %, expected 1368.00 / 1658.70',
      v_old_active_total, v_new_active_total;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM invoices
     WHERE id IN ('62297', '63864')
       AND (balance_due <> 0 OR LOWER(invoice_status) <> 'paid')
  ) OR EXISTS (
    SELECT 1
      FROM payments
     WHERE internal_reference IN (
       'CONTRA-MYSHOP-SKT-62297',
       'CONTRA-MYSHOP-SKT-63864'
     )
       AND (journal_entry_id IS NOT NULL OR receipt_allocation_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'MYSHOP-SKT post-correction invoice/payment state is invalid';
  END IF;

  SELECT credit_used::numeric(12,2)
    INTO v_credit_used
    FROM customers
   WHERE id = 'MYSHOP-SKT';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2)
    INTO v_open_invoice_total
    FROM invoices
   WHERE customerid = 'MYSHOP-SKT'
     AND paymenttype = 'INVOICE'
     AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - v_open_invoice_total) > 0.005 THEN
    RAISE EXCEPTION
      'MYSHOP-SKT credit_used % differs from invoice balance % after correction',
      v_credit_used, v_open_invoice_total;
  END IF;
END $$;

COMMIT;

SELECT i.id, i.balance_due, i.invoice_status
  FROM invoices i
 WHERE i.id IN ('62297', '63864')
 ORDER BY i.id;

SELECT payment_id, invoice_id, payment_date::date, amount_paid,
       payment_method, payment_reference, internal_reference, status
  FROM payments
 WHERE internal_reference IN (
   'CONTRA-MYSHOP-SKT-62297',
   'CONTRA-MYSHOP-SKT-63864'
 )
 ORDER BY invoice_id;

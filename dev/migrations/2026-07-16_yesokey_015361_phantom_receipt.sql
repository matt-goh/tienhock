-- =============================================================================
-- 2026-07-16_yesokey_015361_phantom_receipt.sql
-- Data fix: cancel the phantom cash receipt on YESOKEY invoice 015361.
-- Idempotent (guarded on receipts.id = 51 still being 'posted').
--
-- WHAT WENT WRONG
--   Invoice 015361 (13/06/2026, 2,880.00) was first keyed as a CASH bill, so
--   the automatic collection row was written to `payments` (payment_id 5229,
--   notes 'Payment automatically recorded for CASH invoices', payment_date
--   stamped to the invoice's creation instant 2026-06-13 12:06:39 rather than
--   a date-only collection date). The bill was later converted to a credit
--   INVOICE, but the auto-collection row survived the conversion — the same
--   defect whose other four victims were cancelled on 2026-07-06 with the
--   reason 'Data fix: phantom auto-payment left active by CASH-to-INVOICE
--   conversion bug' (026498/WONG-KM, 2004040/CHEONGSENG, 026214/LEE-HL,
--   34123/HAPHUAT). 015361 was missed by that sweep.
--
--   Four days later 2026-07-10_receipts_phase2_columns.sql met the leftover
--   row, read it as "a genuine credit-invoice receipt (e.g. 015361)" and
--   pinned is_auto_collection = false. Phase 2 then promoted it into a real
--   receipt (receipts.id 51, CH_REV2 2,880.00) with a posted REC journal
--   (journal_entries.id 3642). That is the phantom credit being reversed here.
--
-- WHY IT IS PHANTOM, NOT A REAL COLLECTION
--   * The legacy ledger export, printed through 04/07/2026, carries NO credit
--     against 015361: 13/06 015361 -> 15,288.00 DR, 23/06 015368 -> 18,168.00
--     DR, 04/07 015384 -> 22,888.00 DR.
--   * Receipt 51 is the only posted CH_REV2 receipt in the fully banked-in
--     05/06–26/06 window never banked in; its same-day sibling C34923 was.
--   * YESOKEY settles by batched cheque/online transfers (T-references) one to
--     two months in arrears — never same-day cash.
--
-- RESULT
--   YESOKEY 23/06/2026 balance 15,288.00 -> 18,168.00 DR (04/07 -> 22,888.00),
--   invoice 015361 back to Unpaid, customers.credit_used 7,600.00 -> 10,480.00
--   (= 015361 2,880 + 015368 2,880 + 015384 4,720).
-- =============================================================================

BEGIN;

-- 1. Restore the invoice balance (mirrors cancelReceipt in receipt-service.js).
UPDATE invoices i
   SET balance_due = LEAST(i.totalamountpayable, COALESCE(i.balance_due, 0) + 2880.00),
       invoice_status = CASE
         WHEN LEAST(i.totalamountpayable, COALESCE(i.balance_due, 0) + 2880.00) <= 0
           THEN 'paid' ELSE 'Unpaid'
       END
 WHERE i.id = '015361'
   AND i.customerid = 'YESOKEY'
   AND i.paymenttype = 'INVOICE'
   AND EXISTS (SELECT 1 FROM receipts r WHERE r.id = 51 AND r.status = 'posted');

-- 2. Give the credit back to the customer's utilised limit.
UPDATE customers c
   SET credit_used = GREATEST(0, COALESCE(c.credit_used, 0) + 2880.00)
 WHERE c.id = 'YESOKEY'
   AND EXISTS (SELECT 1 FROM receipts r WHERE r.id = 51 AND r.status = 'posted');

-- 3. Reverse the posted REC journal that credits the debtor.
UPDATE journal_entries
   SET status = 'cancelled', updated_at = NOW()
 WHERE id = 3642
   AND status = 'posted'
   AND source_type = 'receipt'
   AND source_id = '51';

-- 4. Cancel the payment-history projection. Same reason text as its four
--    siblings so the whole cohort groups together.
UPDATE payments
   SET status = 'cancelled',
       cancellation_date = NOW(),
       cancellation_reason = 'Data fix: phantom auto-payment left active by CASH-to-INVOICE conversion bug'
 WHERE receipt_allocation_id IN (SELECT id FROM receipt_allocations WHERE receipt_id = 51)
   AND status <> 'cancelled'
   AND EXISTS (SELECT 1 FROM receipts r WHERE r.id = 51 AND r.status = 'posted');

-- 5. Cancel the receipt LAST: every guard above keys off its 'posted' status.
UPDATE receipts
   SET status = 'cancelled',
       cancellation_date = NOW(),
       cancellation_reason = 'Data fix: phantom auto-payment left active by CASH-to-INVOICE conversion bug (auto-collection row from the pre-conversion CASH bill, promoted to a receipt by the Phase 2 migration)',
       cancelled_by = 'data-fix',
       updated_at = NOW(),
       updated_by = 'data-fix'
 WHERE id = 51
   AND status = 'posted';

-- 6. Self-verify against the legacy ledger export, or roll the whole fix back.
DO $$
DECLARE
  v_balance_23jun NUMERIC(12,2);
  v_balance_04jul NUMERIC(12,2);
  v_credit_used   NUMERIC(12,2);
  v_balance_due   NUMERIC(12,2);
BEGIN
  SELECT ob.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_code = 'YESOKEY'
              AND je.status = 'posted'
              AND je.entry_date >= ob.as_of_date
              AND je.entry_date <= DATE '2026-06-23'), 0)
    INTO v_balance_23jun
    FROM account_opening_balances ob
   WHERE ob.account_code = 'YESOKEY' AND ob.as_of_date = DATE '2026-01-01';

  SELECT ob.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_code = 'YESOKEY'
              AND je.status = 'posted'
              AND je.entry_date >= ob.as_of_date
              AND je.entry_date <= DATE '2026-07-04'), 0)
    INTO v_balance_04jul
    FROM account_opening_balances ob
   WHERE ob.account_code = 'YESOKEY' AND ob.as_of_date = DATE '2026-01-01';

  SELECT credit_used INTO v_credit_used FROM customers WHERE id = 'YESOKEY';
  SELECT balance_due INTO v_balance_due FROM invoices WHERE id = '015361';

  IF v_balance_23jun IS DISTINCT FROM 18168.00 THEN
    RAISE EXCEPTION 'YESOKEY 23/06/2026 balance is %, expected 18168.00 (legacy ledger)', v_balance_23jun;
  END IF;
  IF v_balance_04jul IS DISTINCT FROM 22888.00 THEN
    RAISE EXCEPTION 'YESOKEY 04/07/2026 balance is %, expected 22888.00 (legacy ledger)', v_balance_04jul;
  END IF;
  IF v_credit_used IS DISTINCT FROM 10480.00 THEN
    RAISE EXCEPTION 'YESOKEY credit_used is %, expected 10480.00', v_credit_used;
  END IF;
  IF v_balance_due IS DISTINCT FROM 2880.00 THEN
    RAISE EXCEPTION 'Invoice 015361 balance_due is %, expected 2880.00', v_balance_due;
  END IF;
END $$;

COMMIT;

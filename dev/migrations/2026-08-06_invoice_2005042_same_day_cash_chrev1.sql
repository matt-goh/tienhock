-- 2026-08-06 Tien Hock: bill 2005042 (DKJ, RM988, 28/07/2026) -- move its
-- RM392 same-day counter cash from CH_REV2 to CH_REV1, keeping the bill a
-- credit INVOICE with CR_SALES revenue.
--
-- THE RULE (proven, not assumed)
--   CH_REV1  "CASH SALES RECEIVED"      — cash taken at the counter ON the
--            invoice's own sale day. Banked in with that day's cash pool.
--   CH_REV2  "CASH RECEIVED/CR. SALES"  — cash collected LATER against an
--            invoice already on credit. Banked in per receipt.
-- The distinction is the DATE, not the document type. Of the 91 cash receipts
-- against invoices in the immutable Jan-May legacy import, all 5 same-day ones
-- are filed under CH_REV1 and all 86 later ones under CH_REV2, with no
-- exceptions -- and every one of the CH_REV1 five (journals 5278 KITANI,
-- 5358 YONGMAJU, 5540 IRENE, 6341 1M, 6934 BIG-T) is against a credit INVOICE,
-- not a cash bill. Revenue is unaffected by the holding account, so the sale
-- stays in CR_SALES. Confirmed by AMY.
--
-- WHAT WENT WRONG
-- receipt-service.js hardcoded `method === 'cash' ? 'CH_REV2'` with no date
-- test, so the RM392 collected on the sale day was filed as a late debtor
-- collection. Fixed in code (resolveCashHoldingAccount); this migration
-- repairs the one receipt already posted the old way. Receipt 257 is the only
-- same-day cash receipt in the system.
--
-- WHAT THIS DOES
--   * repoints receipt 257 and its journal 12165 debit line from CH_REV2 to
--     CH_REV1 -- the amount, dates, debtor credit, references and status are
--     all unchanged,
--   * corrects the mis-keyed reference C2005041 -> C2005042 (2005041 is a
--     different customer's bill, NEVER-S).
-- The invoice, its S journal (CR_SALES), the online receipt 256 and journal
-- 12164, every payment row and DKJ's credit_used are all left untouched.
--
-- Net ledger effect: CH_REV2 -392.00, CH_REV1 +392.00 on 28/07/2026. Nothing
-- else moves; total debits and credits are unchanged.
--
-- SAFE BECAUSE: 28/07/2026 is in the open accounting period; receipt 257 is in
-- no posted bank-in, so its cash has not been banked as CH_REV2; the 28/07
-- CH_REV1 pool only GROWS, so it cannot become over-banked; journal 12165 is
-- posted and not manual_override.
--
-- Guarded, idempotent and fail-closed: one transaction, every precondition
-- asserted.
--
-- NOTE: an earlier migration in this series
-- (2026-08-06_invoice_2005042_cash_bill_restore.sql, now deleted) converted
-- this bill to a CASH bill and moved its revenue to CASH_SALES. That was based
-- on a wrong reading of CH_REV1 and was reverted before this ran; this file
-- refuses to run unless the bill is back to its correct INVOICE shape.

BEGIN;

DO $$
DECLARE
  v_invoice_id    CONSTANT varchar := '2005042';
  v_receipt_id    CONSTANT integer := 257;
  v_cash_journal  CONSTANT integer := 12165;
  v_sales_journal CONSTANT integer := 12100;
  v_amount        CONSTANT numeric := 392.00;
  v_entry_date    CONSTANT date    := DATE '2026-07-28';
  v_count         integer;
BEGIN
  ------------------------------------------------------------------
  -- Idempotency.
  ------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count FROM receipts
   WHERE id = v_receipt_id AND debit_account = 'CH_REV1';
  IF v_count = 1 THEN
    RAISE NOTICE 'Receipt % is already held in CH_REV1 - correction already applied, no change',
      v_receipt_id;
    RETURN;
  END IF;

  ------------------------------------------------------------------
  -- Preconditions.
  ------------------------------------------------------------------
  -- The bill must be a credit INVOICE crediting CR_SALES: this correction
  -- changes only where the CASH sits, never the revenue account.
  SELECT COUNT(*) INTO v_count FROM invoices
   WHERE id = v_invoice_id
     AND paymenttype = 'INVOICE'
     AND totalamountpayable = 988.00
     AND balance_due = 0
     AND invoice_status = 'paid'
     AND journal_entry_id = v_sales_journal;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Invoice % is not a settled credit INVOICE of RM988.00', v_invoice_id;
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entry_lines
   WHERE journal_entry_id = v_sales_journal
     AND account_code = 'CR_SALES' AND credit_amount = 988.00;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Sales journal % does not credit CR_SALES 988.00', v_sales_journal;
  END IF;

  -- The receipt being repointed, with its exact shape.
  SELECT COUNT(*) INTO v_count FROM receipts r
    JOIN receipt_allocations ra ON ra.receipt_id = r.id
   WHERE r.id = v_receipt_id
     AND r.status = 'posted'
     AND r.origin = 'erp'
     AND r.payment_method = 'cash'
     AND r.debit_account = 'CH_REV2'
     AND r.journal_entry_id = v_cash_journal
     AND r.total_amount = v_amount
     AND r.received_date = v_entry_date
     AND r.posting_date = v_entry_date
     AND ra.allocation_type = 'invoice'
     AND ra.invoice_id = v_invoice_id
     AND ra.amount = v_amount;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Receipt % is not the expected posted RM% CH_REV2 cash receipt on invoice %',
      v_receipt_id, v_amount, v_invoice_id;
  END IF;

  -- The cash was received on the invoice's own sale day: that is the whole
  -- reason it belongs in CH_REV1.
  SELECT COUNT(*) INTO v_count FROM invoices i
   WHERE i.id = v_invoice_id
     AND (to_timestamp(i.createddate::bigint / 1000.0)
            AT TIME ZONE 'Asia/Kuala_Lumpur')::date = v_entry_date;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Invoice % was not sold on %; CH_REV1 would be wrong',
      v_invoice_id, v_entry_date;
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entries
   WHERE id = v_cash_journal AND status = 'posted' AND entry_type = 'REC'
     AND entry_date = v_entry_date
     AND COALESCE(manual_override, false) = false;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Journal % is not a posted, unmodified REC entry dated %',
      v_cash_journal, v_entry_date;
  END IF;

  -- Cash still held in CH_REV2 cannot already have been banked in.
  SELECT COUNT(*) INTO v_count
    FROM bank_in_allocations bia
    JOIN bank_in_groups big ON big.id = bia.group_id
    JOIN bank_ins bi ON bi.id = big.bank_in_id
   WHERE bia.receipt_id = v_receipt_id AND bi.status = 'posted';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Receipt % is included in a posted bank-in; reverse it first', v_receipt_id;
  END IF;

  IF v_entry_date < DATE '2026-06-01' THEN
    RAISE EXCEPTION 'Entry date % is inside locked accounting history', v_entry_date;
  END IF;

  ------------------------------------------------------------------
  -- Repoint the holding account. Amount, dates, debtor credit and
  -- status are untouched -- only WHERE the cash sits changes.
  ------------------------------------------------------------------
  UPDATE journal_entry_lines
     SET account_code = 'CH_REV1'
   WHERE journal_entry_id = v_cash_journal
     AND account_code = 'CH_REV2'
     AND debit_amount = v_amount;

  UPDATE receipts
     SET debit_account = 'CH_REV1',
         display_reference = 'C2005042',  -- was mis-keyed as C2005041 (NEVER-S)
         updated_at = NOW()
   WHERE id = v_receipt_id;

  UPDATE journal_entries
     SET display_reference = 'C2005042', updated_at = NOW()
   WHERE id = v_cash_journal AND display_reference = 'C2005041';

  UPDATE journal_entry_lines
     SET display_reference = 'C2005042'
   WHERE journal_entry_id = v_cash_journal AND display_reference = 'C2005041';

  UPDATE payments
     SET payment_reference = 'C2005042'
   WHERE receipt_allocation_id IN (
           SELECT id FROM receipt_allocations WHERE receipt_id = v_receipt_id)
     AND payment_reference = 'C2005041';

  RAISE NOTICE 'Receipt % (RM%) moved from CH_REV2 to CH_REV1 on %',
    v_receipt_id, v_amount, v_entry_date;
END
$$;

------------------------------------------------------------------
-- Post-conditions.
------------------------------------------------------------------
DO $$
DECLARE
  v_debit  numeric;
  v_credit numeric;
  v_count  integer;
BEGIN
  SELECT SUM(debit_amount), SUM(credit_amount) INTO v_debit, v_credit
    FROM journal_entry_lines WHERE journal_entry_id = 12165;
  IF v_debit IS DISTINCT FROM v_credit OR v_debit <> 392.00 THEN
    RAISE EXCEPTION 'Receipt journal 12165 is unbalanced: DR % / CR %', v_debit, v_credit;
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entry_lines
   WHERE journal_entry_id = 12165 AND account_code = 'CH_REV1' AND debit_amount = 392.00;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Journal 12165 does not debit CH_REV1 392.00';
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entry_lines
   WHERE journal_entry_id = 12165 AND account_code = 'DKJ' AND credit_amount = 392.00;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Journal 12165 no longer credits DKJ 392.00';
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entry_lines
   WHERE journal_entry_id = 12165 AND account_code = 'CH_REV2';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Journal 12165 still carries a CH_REV2 line';
  END IF;

  -- Revenue and the invoice itself must be exactly as they were.
  SELECT COUNT(*) INTO v_count FROM invoices
   WHERE id = '2005042' AND paymenttype = 'INVOICE'
     AND balance_due = 0 AND invoice_status = 'paid';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Invoice 2005042 is no longer a settled credit INVOICE';
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entry_lines
   WHERE journal_entry_id = 12100 AND account_code = 'CR_SALES' AND credit_amount = 988.00;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Sales journal 12100 no longer credits CR_SALES 988.00';
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entry_lines
   WHERE journal_entry_id = 12100 AND account_code IN ('CASH_SALES', 'CH_REV1');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Sales journal 12100 still carries cash-bill lines';
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entries
   WHERE id = 12164 AND status = 'posted' AND total_debit = 596.00;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Online receipt journal 12164 was altered';
  END IF;

  IF (SELECT credit_used FROM customers WHERE id = 'DKJ') <> 0.00 THEN
    RAISE EXCEPTION 'DKJ credit_used should be 0.00';
  END IF;

  RAISE NOTICE 'All post-conditions passed';
END
$$;

COMMIT;

-- =============================================================================
-- 2026-07-16_myshop_km5_64072_debtor_reassign.sql
-- Data fix: repoint invoice 64072's sales journal from the customer it was
-- originally issued to (MYSHOP(KM), PASAR MINI MYSHOP KOTA MARUDU) to the
-- customer it now belongs to (MYSHOP-KM5, PASAR MINI MY SHOP-KM5).
-- Idempotent (guarded on the debtor line still sitting on the old account).
--
-- WHAT WENT WRONG
--   PUT /api/invoices/:id/customer updated invoices.customerid and committed
--   without re-syncing the invoice-owned 'S' journal, so journal 3464 kept
--   debiting MYSHOP(KM). Statements and account ledgers are built from the
--   customer's DEBTOR child ledger, so invoice 64072 vanished from MYSHOP-KM5's
--   statement while inflating MYSHOP(KM)'s by the same 1,646.00. Credit note
--   TH/CN/26/22, raised a day later, read the corrected customerid and posted
--   to MYSHOP-KM5 — which is why the 31/07/2026 statement showed a lone
--   -49.40 with no invoice above it.
--
--   The endpoint is fixed in the same change (src/routes/sales/invoices/
--   invoices.js) to call syncSalesJournalEntry and carry credit_used across.
--   This migration only repairs the one invoice that slipped through; a scan of
--   every non-cancelled invoice found no other debtor/customer mismatch.
--
-- CREDIT NOTE ON THE ASYMMETRIC credit_used AMOUNTS
--   MYSHOP(KM) gives back 1,646.00 — the full amount added when the invoice was
--   created against it; no payment or CN ever reduced its share. MYSHOP-KM5
--   takes on 1,596.60 (= 1,646.00 - 49.40 CN), not 1,646.00: TH/CN/26/22
--   already decremented MYSHOP-KM5's credit_used, but GREATEST(0, ...) clamped
--   it away against a then-zero balance. Both customers therefore land exactly
--   on their true outstanding.
--
-- RESULT
--   MYSHOP-KM5 statement shows 09/07 INV/NO: 64072 DR 1,646.00 then 10/07 CN
--   CR 49.40 -> 1,596.60 due (matches the on-screen balance and the CURRENT
--   MONTH aging). MYSHOP(KM) drops 1,646.00 to its true 1,190.55.
-- =============================================================================

BEGIN;

-- 1. Move the receivable to the correct customer's debtor child account and
--    restate the particulars the way syncSalesJournalEntry would generate them
--    (invoices.accounting_description is NULL, so the auto text applies and a
--    later re-sync will not churn this row).
UPDATE journal_entry_lines
   SET account_code = 'MYSHOP-KM5',
       particulars = 'INV/NO: 64072 - MYSHOP-KM5'
 WHERE id = 9797
   AND journal_entry_id = 3464
   AND account_code = 'MYSHOP(KM)'
   AND debit_amount = 1646.00
   AND credit_amount = 0.00;

-- 2. The CR_SALES contra keeps its account; only the wording carries the name.
UPDATE journal_entry_lines
   SET particulars = 'INV/NO: 64072 - MYSHOP-KM5'
 WHERE id = 9798
   AND journal_entry_id = 3464
   AND account_code = 'CR_SALES'
   AND particulars = 'INV/NO: 64072 - MYSHOP(KM)';

-- 3. Header description follows the same auto-generated shape.
UPDATE journal_entries
   SET description = 'INV/NO: 64072 - MYSHOP-KM5',
       updated_at = NOW()
 WHERE id = 3464
   AND entry_type = 'S'
   AND source_type = 'invoice'
   AND source_id = '64072'
   AND description = 'INV/NO: 64072 - MYSHOP(KM)';

-- 4. Hand the stranded credit back (see the note above on the amounts).
UPDATE customers
   SET credit_used = GREATEST(0, COALESCE(credit_used, 0) - 1646.00)
 WHERE id = 'MYSHOP(KM)'
   AND credit_used = 2836.55;

UPDATE customers
   SET credit_used = GREATEST(0, COALESCE(credit_used, 0) + 1596.60)
 WHERE id = 'MYSHOP-KM5'
   AND credit_used = 0.00;

-- 5. Self-verify both sides of the move, or roll the whole fix back.
DO $$
DECLARE
  v_km5_ledger   NUMERIC(12,2);
  v_km_ledger    NUMERIC(12,2);
  v_km5_credit   NUMERIC(12,2);
  v_km_credit    NUMERIC(12,2);
  v_stray        INTEGER;
BEGIN
  -- Posted debtor-ledger balance as at the 31/07/2026 statement date.
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_km5_ledger
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
   WHERE jel.account_code = 'MYSHOP-KM5' AND je.status = 'posted'
     AND je.entry_date <= DATE '2026-07-31';

  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_km_ledger
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
   WHERE jel.account_code = 'MYSHOP(KM)' AND je.status = 'posted'
     AND je.entry_date <= DATE '2026-07-31';

  SELECT credit_used INTO v_km5_credit FROM customers WHERE id = 'MYSHOP-KM5';
  SELECT credit_used INTO v_km_credit  FROM customers WHERE id = 'MYSHOP(KM)';

  -- No invoice's posted journal may debit a debtor other than its own customer.
  SELECT COUNT(*) INTO v_stray
    FROM invoices i
    JOIN journal_entries je ON je.id = i.journal_entry_id AND je.status = 'posted'
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN account_codes ac ON ac.code = jel.account_code AND ac.parent_code = 'DEBTOR'
   WHERE i.invoice_status <> 'cancelled'
     AND COALESCE(i.is_consolidated, false) = false
     AND jel.account_code <> i.customerid;

  IF v_km5_ledger IS DISTINCT FROM 1596.60 THEN
    RAISE EXCEPTION 'MYSHOP-KM5 ledger at 31/07/2026 is %, expected 1596.60', v_km5_ledger;
  END IF;
  IF v_km_credit IS DISTINCT FROM 1190.55 THEN
    RAISE EXCEPTION 'MYSHOP(KM) credit_used is %, expected 1190.55', v_km_credit;
  END IF;
  IF v_km5_credit IS DISTINCT FROM 1596.60 THEN
    RAISE EXCEPTION 'MYSHOP-KM5 credit_used is %, expected 1596.60', v_km5_credit;
  END IF;
  IF v_stray <> 0 THEN
    RAISE EXCEPTION '% invoice journal(s) still debit the wrong debtor account', v_stray;
  END IF;

  RAISE NOTICE 'MYSHOP-KM5 ledger 1596.60 / MYSHOP(KM) ledger % — reassignment verified', v_km_ledger;
END $$;

COMMIT;

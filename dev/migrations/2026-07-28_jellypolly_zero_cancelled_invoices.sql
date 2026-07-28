\set ON_ERROR_STOP on

-- Backfill: zero the financial data of already-cancelled Jelly Polly invoices.
--
-- Tien Hock's cancel handler has always zeroed both the line items and the
-- invoice totals (src/routes/sales/invoices/invoices.js, "5. Zero out all
-- financial data for cancelled invoice"), which is why every cancelled TH
-- invoice reads RM0 across the details page, the invoice card and the PDF.
-- The Jelly Polly clone (src/routes/jellypolly/invoices.js) only ever set
-- balance_due = 0, so a cancelled JP invoice kept its full Total Payable and
-- its line quantities/prices. The route has now been brought in line with TH;
-- this migration applies the same treatment to the rows cancelled before that.
--
-- Beyond the display inconsistency this also corrects a real number: the JP
-- customer statement's previous-balance query (src/routes/jellypolly/debtors.js)
-- sums totalamountpayable with no invoice_status filter while excluding
-- cancelled payments, so every cancelled JP invoice was inflating that
-- customer's brought-forward balance.
--
-- customers.credit_used is NOT touched. JP maintains it incrementally
-- (updateCustomerCredit adds/subtracts deltas) and the cancel handler already
-- reversed both the invoice total and any payments at cancellation time; it is
-- never recomputed from these columns, so zeroing them here has no credit
-- effect.
--
-- This is destructive and irreversible by design (it matches TH): the billed
-- quantities and prices of a cancelled invoice are discarded, while the product
-- code and description on each line are preserved. Guarded, idempotent and
-- fail-closed - re-running it changes nothing and still succeeds.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_blocked_payments INTEGER;
  v_blocked_adjustments INTEGER;
  v_target_invoices INTEGER;
  v_invoices_zeroed INTEGER;
  v_lines_zeroed INTEGER;
  v_residual INTEGER;
BEGIN
  -- Guard 1: a cancelled invoice must not still carry an ACTIVE payment. The
  -- cancel handler cancels them in the same transaction, so an active one means
  -- money is recorded against this invoice and the row is not safely zeroable.
  SELECT COUNT(*)
    INTO v_blocked_payments
    FROM jellypolly.invoices i
    JOIN jellypolly.payments p ON p.invoice_id = i.id
   WHERE i.invoice_status = 'cancelled'
     AND (p.status IS NULL OR p.status = 'active');

  IF v_blocked_payments > 0 THEN
    RAISE EXCEPTION
      'aborting: % active payment(s) still reference a cancelled JP invoice',
      v_blocked_payments;
  END IF;

  -- Guard 2: an active adjustment document against a cancelled invoice would
  -- mean the two disagree about the amount. Cancellation blocks this today, so
  -- any hit is pre-existing corruption that must be resolved by hand first.
  SELECT COUNT(*)
    INTO v_blocked_adjustments
    FROM jellypolly.invoices i
    JOIN jellypolly.adjustment_documents a ON a.original_invoice_id = i.id
   WHERE i.invoice_status = 'cancelled'
     AND a.status = 'active'
     AND COALESCE(a.is_consolidated, false) = false;

  IF v_blocked_adjustments > 0 THEN
    RAISE EXCEPTION
      'aborting: % active adjustment document(s) reference a cancelled JP invoice',
      v_blocked_adjustments;
  END IF;

  SELECT COUNT(*)
    INTO v_target_invoices
    FROM jellypolly.invoices
   WHERE invoice_status = 'cancelled';

  -- Zero the line items. Code and description are deliberately preserved so the
  -- cancelled document still shows which products were on it (TH behaviour).
  WITH zeroed AS (
    UPDATE jellypolly.order_details od
       SET quantity = 0,
           price = 0,
           total = 0,
           freeproduct = 0,
           returnproduct = 0,
           tax = 0
      FROM jellypolly.invoices i
     WHERE od.invoiceid = i.id
       AND i.invoice_status = 'cancelled'
       AND (od.quantity <> 0 OR od.price <> 0 OR od.total <> 0
            OR od.freeproduct <> 0 OR od.returnproduct <> 0 OR od.tax <> 0)
    RETURNING od.id
  )
  SELECT COUNT(*) INTO v_lines_zeroed FROM zeroed;

  -- Zero the invoice totals.
  WITH zeroed AS (
    UPDATE jellypolly.invoices
       SET total_excluding_tax = 0,
           tax_amount = 0,
           rounding = 0,
           totalamountpayable = 0,
           balance_due = 0
     WHERE invoice_status = 'cancelled'
       AND (total_excluding_tax <> 0 OR tax_amount <> 0 OR rounding <> 0
            OR totalamountpayable <> 0 OR balance_due <> 0)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_invoices_zeroed FROM zeroed;

  -- Post-check: nothing cancelled may carry a non-zero amount afterwards.
  SELECT COUNT(*)
    INTO v_residual
    FROM jellypolly.invoices i
   WHERE i.invoice_status = 'cancelled'
     AND (i.total_excluding_tax <> 0 OR i.tax_amount <> 0 OR i.rounding <> 0
          OR i.totalamountpayable <> 0 OR i.balance_due <> 0
          OR EXISTS (SELECT 1
                       FROM jellypolly.order_details od
                      WHERE od.invoiceid = i.id
                        AND (od.quantity <> 0 OR od.price <> 0 OR od.total <> 0
                             OR od.freeproduct <> 0 OR od.returnproduct <> 0
                             OR od.tax <> 0)));

  IF v_residual > 0 THEN
    RAISE EXCEPTION
      'post-check failed: % cancelled JP invoice(s) still carry a non-zero amount',
      v_residual;
  END IF;

  RAISE NOTICE
    'cancelled JP invoices: % total, % invoice row(s) zeroed, % line(s) zeroed',
    v_target_invoices, v_invoices_zeroed, v_lines_zeroed;
END $$;

COMMIT;

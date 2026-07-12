-- 2026-07-12: Repair invoices whose balance_due already reached 0 but whose
-- invoice_status was left as 'Unpaid'/'Overdue', making them appear in the
-- Payment Form's "Available Unpaid Invoices" list with nothing to collect.
--
-- Root causes (fixed in code the same day):
--   1. Batch/mobile invoice create (src/routes/sales/invoices/invoices.js)
--      left zero-total CREDIT invoices as 'Unpaid'.
--   2. The order-details update recalculated balance_due but never synced
--      invoice_status.
--
-- Idempotent: re-running updates 0 rows.

BEGIN;

UPDATE invoices
SET invoice_status = 'paid'
WHERE balance_due <= 0
  AND invoice_status IN ('Unpaid', 'Overdue');

UPDATE jellypolly.invoices
SET invoice_status = 'paid'
WHERE balance_due <= 0
  AND invoice_status IN ('Unpaid', 'Overdue');

COMMIT;

-- Verification: expect 0 rows from both.
SELECT 'TH' AS company, id, paymenttype, totalamountpayable, balance_due, invoice_status
FROM invoices
WHERE balance_due <= 0
  AND invoice_status IN ('Unpaid', 'Overdue')
UNION ALL
SELECT 'JP', id, paymenttype, totalamountpayable, balance_due, invoice_status
FROM jellypolly.invoices
WHERE balance_due <= 0
  AND invoice_status IN ('Unpaid', 'Overdue');

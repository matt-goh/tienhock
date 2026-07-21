-- 2026-07-21: Overpayment application (apply customer overpayment to unpaid bills)
--
-- Receipt excess allocations (customer-owned overpayments held in CUST_DEP)
-- can now be APPLIED to unpaid invoices from the payment form, in addition to
-- the existing refund path. One payments row + one REC journal
-- (DR CUST_DEP / CR customer debtor child) per applied invoice;
-- overpayment_applications records how the applied amount was distributed
-- across the customer's excess allocations (FIFO) so cancellation can reverse
-- applied_amount exactly.

BEGIN;

-- 1. New payment method for overpayment-application payment rows
ALTER TABLE payments DROP CONSTRAINT payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'cheque', 'bank_transfer', 'online', 'contra', 'overpayment'));

-- 2. FIFO distribution of each applied payment across excess allocations
CREATE TABLE IF NOT EXISTS overpayment_applications (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(payment_id),
  receipt_allocation_id INTEGER NOT NULL REFERENCES receipt_allocations(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_overpayment_applications_payment
  ON overpayment_applications(payment_id);

COMMIT;

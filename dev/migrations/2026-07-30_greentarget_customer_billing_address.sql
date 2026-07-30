-- 2026-07-30: Optional billing address for Green Target customers.
-- A customer's office/billing address is separate from their service
-- (pickup) locations. When set, invoice PDFs and e-Invoices bill to this
-- address instead of the rental location addresses. NULL = fall back to
-- the rental location address(es), i.e. previous behaviour.
ALTER TABLE greentarget.customers
  ADD COLUMN IF NOT EXISTS billing_address text;

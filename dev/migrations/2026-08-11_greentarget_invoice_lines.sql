-- 2026-08-11 Green Target: `greentarget.invoice_lines` — stored, user-editable
-- invoice line items.
--
-- Green Target invoices previously carried no stored lines: the invoice PDF,
-- statement PDF and e-Invoice XML each fabricated a description at render time
-- ("Rental Tong (A/B)" from tong numbers, else "Waste Management Service").
-- This table stores the keyed lines (description / quantity / unit price /
-- amount). It is display + e-Invoice description data only — the journal
-- posting still comes from invoice_revenue_splits and is untouched.
--
-- NO BACKFILL: invoices without rows keep rendering through the existing
-- generator fallbacks, so legacy invoices are byte-identical.
--
-- Guarded and idempotent: safe to re-run.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'greentarget'
       AND table_name = 'invoices'
  ) THEN
    RAISE EXCEPTION 'greentarget.invoices does not exist — aborting';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS greentarget.invoice_lines (
  invoice_id  integer       NOT NULL REFERENCES greentarget.invoices(invoice_id) ON DELETE CASCADE,
  line_number integer       NOT NULL CHECK (line_number > 0),
  description text          NOT NULL,
  quantity    numeric(14,2) NOT NULL CHECK (quantity > 0),
  unit_price  numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  amount      numeric(14,2) NOT NULL CHECK (amount >= 0),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, line_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'greentarget'
       AND table_name = 'invoice_lines'
  ) THEN
    RAISE EXCEPTION 'greentarget.invoice_lines was not created — aborting';
  END IF;
END $$;

COMMIT;

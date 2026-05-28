-- 2026-05-28: Close accounting gaps 1B-3 and 1B-4 — auto-journal General
-- Purchases and add supplier payment tracking.
--
-- 1. Extend self_billed_invoices with journal_entry_id + amount_paid +
--    payment_status so the General Purchase auto-journal (entry_type 'GP')
--    can link to its invoice and supplier payments can track balances.
-- 2. Extend self_billed_invoice_lines with account_code so each GP line
--    debits a user-picked expense GL account (CR side is always 'TP').
-- 3. Register two new journal_entry_types: 'GP' (auto-posted General
--    Purchase) and 'PAY' (auto-posted Supplier Payment).
-- 4. Create supplier_payments — the new AP payment table. invoice_id is a
--    polymorphic FK whose target is whitelisted by invoice_source and
--    validated at runtime. Reuses CASH / BANK_PBB / BANK_ABB from the
--    customer-side payment flow.
--
-- Backward compatibility: account_code is nullable so existing rows keep
-- reading; the API layer rejects new POST/PUT bodies that omit it.

BEGIN;

ALTER TABLE self_billed_invoices
  ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS amount_paid     NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status  VARCHAR(20)   NOT NULL DEFAULT 'unpaid';

ALTER TABLE self_billed_invoices
  DROP CONSTRAINT IF EXISTS self_billed_invoices_payment_status_check;
ALTER TABLE self_billed_invoices
  ADD CONSTRAINT self_billed_invoices_payment_status_check
  CHECK (payment_status IN ('unpaid','partial','paid'));

ALTER TABLE self_billed_invoice_lines
  ADD COLUMN IF NOT EXISTS account_code VARCHAR(20) REFERENCES account_codes(code);

INSERT INTO journal_entry_types (code, name, description, is_active) VALUES
  ('GP',  'General Purchase', 'Auto-posted from self-billed/general purchase invoices', true),
  ('PAY', 'Supplier Payment', 'Auto-posted from supplier payment entries',              true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS supplier_payments (
  payment_id          SERIAL PRIMARY KEY,
  invoice_source      VARCHAR(30) NOT NULL
                      CHECK (invoice_source IN ('purchase_invoices','self_billed_invoices')),
  invoice_id          INTEGER     NOT NULL,
  payment_date        DATE        NOT NULL,
  amount_paid         NUMERIC(15,2) NOT NULL CHECK (amount_paid > 0),
  payment_method      VARCHAR(20) NOT NULL
                      CHECK (payment_method IN ('cash','cheque','bank_transfer','online')),
  bank_account        VARCHAR(20) REFERENCES account_codes(code),
  payment_reference   TEXT,
  internal_reference  TEXT,
  journal_entry_id    INTEGER REFERENCES journal_entries(id),
  notes               TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','pending','cancelled')),
  cancellation_date   TIMESTAMP,
  cancellation_reason TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by          VARCHAR(50) REFERENCES staffs(id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice
  ON supplier_payments (invoice_source, invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_date
  ON supplier_payments (payment_date);

COMMIT;

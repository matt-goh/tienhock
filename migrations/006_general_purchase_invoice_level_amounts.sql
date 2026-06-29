-- 006_general_purchase_invoice_level_amounts.sql
-- General Purchase invoice-level accounting and source-linked General Stock appends.
-- Idempotent: safe to run more than once.

BEGIN;

ALTER TABLE self_billed_invoices
  ADD COLUMN IF NOT EXISTS account_code varchar(50);

UPDATE self_billed_invoices sbi
SET account_code = first_line.account_code
FROM (
  SELECT DISTINCT ON (self_billed_invoice_id)
    self_billed_invoice_id,
    account_code
  FROM self_billed_invoice_lines
  WHERE account_code IS NOT NULL
  ORDER BY self_billed_invoice_id, line_number ASC, id ASC
) first_line
WHERE sbi.id = first_line.self_billed_invoice_id
  AND sbi.account_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'self_billed_invoices'
      AND constraint_name = 'self_billed_invoices_account_code_fkey'
  ) THEN
    ALTER TABLE self_billed_invoices
      ADD CONSTRAINT self_billed_invoices_account_code_fkey
      FOREIGN KEY (account_code) REFERENCES account_codes(code);
  END IF;
END $$;

ALTER TABLE general_stock_adjustments
  ADD COLUMN IF NOT EXISTS source_self_billed_invoice_line_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'general_stock_adjustments'
      AND constraint_name = 'general_stock_adjustments_source_line_fkey'
  ) THEN
    ALTER TABLE general_stock_adjustments
      ADD CONSTRAINT general_stock_adjustments_source_line_fkey
      FOREIGN KEY (source_self_billed_invoice_line_id)
      REFERENCES self_billed_invoice_lines(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS general_stock_adjustments_source_line_unique
  ON general_stock_adjustments (source_self_billed_invoice_line_id)
  WHERE source_self_billed_invoice_line_id IS NOT NULL;

COMMIT;

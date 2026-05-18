-- Migration: General purchases and general stock
-- Date: May 18, 2026
-- Description: Extends the self-billed purchase tables to support local general purchases and all-time general stock tracking.

ALTER TABLE self_billed_invoices
  ADD COLUMN IF NOT EXISTS purchase_kind VARCHAR(20) NOT NULL DEFAULT 'foreign',
  ADD COLUMN IF NOT EXISTS local_supplier_name VARCHAR(300);

ALTER TABLE self_billed_invoices
  DROP CONSTRAINT IF EXISTS self_billed_invoices_purchase_kind_check;

ALTER TABLE self_billed_invoices
  ADD CONSTRAINT self_billed_invoices_purchase_kind_check
  CHECK (purchase_kind IN ('foreign', 'local'));

ALTER TABLE self_billed_invoices
  ALTER COLUMN foreign_supplier_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_purchase_kind
  ON self_billed_invoices(purchase_kind);

CREATE TABLE IF NOT EXISTS general_stock_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  created_by VARCHAR(50) REFERENCES staffs(id),
  updated_by VARCHAR(50) REFERENCES staffs(id)
);

CREATE INDEX IF NOT EXISTS idx_general_stock_categories_active
  ON general_stock_categories(is_active, sort_order, name);

ALTER TABLE self_billed_invoice_lines
  ADD COLUMN IF NOT EXISTS general_stock_category_id INTEGER REFERENCES general_stock_categories(id);

CREATE INDEX IF NOT EXISTS idx_self_billed_invoice_lines_general_stock_category
  ON self_billed_invoice_lines(general_stock_category_id);

CREATE TABLE IF NOT EXISTS general_stock_adjustments (
  id SERIAL PRIMARY KEY,
  self_billed_invoice_line_id INTEGER REFERENCES self_billed_invoice_lines(id) ON DELETE CASCADE,
  general_stock_category_id INTEGER REFERENCES general_stock_categories(id),
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  adjustment_quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  created_by VARCHAR(50) REFERENCES staffs(id),
  updated_by VARCHAR(50) REFERENCES staffs(id)
);

CREATE INDEX IF NOT EXISTS idx_general_stock_adjustments_line
  ON general_stock_adjustments(self_billed_invoice_line_id);

CREATE INDEX IF NOT EXISTS idx_general_stock_adjustments_category
  ON general_stock_adjustments(general_stock_category_id);

CREATE OR REPLACE FUNCTION update_general_stock_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS general_stock_categories_updated_at_trigger ON general_stock_categories;
CREATE TRIGGER general_stock_categories_updated_at_trigger
  BEFORE UPDATE ON general_stock_categories
  FOR EACH ROW EXECUTE FUNCTION update_general_stock_updated_at();

DROP TRIGGER IF EXISTS general_stock_adjustments_updated_at_trigger ON general_stock_adjustments;
CREATE TRIGGER general_stock_adjustments_updated_at_trigger
  BEFORE UPDATE ON general_stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_general_stock_updated_at();

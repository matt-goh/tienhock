-- Migration: Link material purchases to material stock
-- Date: May 18, 2026
-- Description: Stores purchase line stock buckets and turns material_stock_entries into adjustment rows.

-- Purchase lines can optionally feed material stock.
ALTER TABLE purchase_invoice_lines
  ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES material_variants(id),
  ADD COLUMN IF NOT EXISTS stock_bucket VARCHAR(20);

ALTER TABLE purchase_invoice_lines
  DROP CONSTRAINT IF EXISTS purchase_invoice_lines_stock_bucket_check;

ALTER TABLE purchase_invoice_lines
  ADD CONSTRAINT purchase_invoice_lines_stock_bucket_check
  CHECK (stock_bucket IS NULL OR stock_bucket IN ('mee', 'bihun', 'shared'));

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_variant
  ON purchase_invoice_lines(variant_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_stock_bucket
  ON purchase_invoice_lines(stock_bucket);

-- This feature has not been used in production yet; start adjustment stock fresh.
TRUNCATE TABLE material_stock_entries RESTART IDENTITY;

ALTER TABLE material_stock_entries
  DROP CONSTRAINT IF EXISTS material_stock_entries_product_line_check;

ALTER TABLE material_stock_entries
  ADD CONSTRAINT material_stock_entries_product_line_check
  CHECK ((product_line)::text IN ('mee', 'bihun', 'shared'));

ALTER TABLE material_stock_entries
  RENAME COLUMN quantity TO adjustment_quantity;

ALTER TABLE material_stock_entries
  RENAME COLUMN value TO adjustment_value;

ALTER TABLE material_stock_entries
  ALTER COLUMN adjustment_quantity SET DEFAULT 0,
  ALTER COLUMN adjustment_value SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_material_stock_entries_product_line
  ON material_stock_entries(product_line);

-- Allow selected OTH products to record stock-only production without a worker.

BEGIN;

ALTER TABLE production_entries
  ALTER COLUMN worker_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS production_entries_stock_only_unique
  ON production_entries (entry_date, product_id)
  WHERE worker_id IS NULL;

COMMIT;

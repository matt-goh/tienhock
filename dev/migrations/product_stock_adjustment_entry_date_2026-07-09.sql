-- Correct Product Stock adjustment dates and roll back the accidental Material
-- Stock date column added during planning.
--
-- Safe to re-run. Run:
--   docker exec -i tienhock_dev_db psql -U postgres -d tienhock < dev/migrations/product_stock_adjustment_entry_date_2026-07-09.sql

BEGIN;

ALTER TABLE material_stock_entries
  DROP COLUMN IF EXISTS adjustment_date;

UPDATE stock_adjustments
SET entry_date = created_at::date
WHERE reference IS NOT NULL
  AND created_at IS NOT NULL
  AND created_at::date <> entry_date
  AND date_trunc('month', created_at)::date = date_trunc('month', entry_date)::date
  AND entry_date IN (
    (date_trunc('month', entry_date)::date + INTERVAL '1 month - 1 day')::date,
    (date_trunc('month', entry_date)::date + INTERVAL '1 month - 2 day')::date
  );

COMMIT;

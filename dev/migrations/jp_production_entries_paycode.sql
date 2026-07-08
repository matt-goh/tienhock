-- Jelly Polly production entries: per-pay-code quantities.
--
-- Before: one bags_packed per (entry_date, product_id, worker_id). Products map
-- to multiple pay codes (e.g. two carton configs) but only the first was ever
-- paid. Now each (worker, product, day) can hold one quantity row per mapped
-- pay code, so production quantities flow into each specific pay code during
-- JP payroll. Stock still sums bags_packed across the rows = total cartons.
BEGIN;

ALTER TABLE jellypolly.production_entries
  ADD COLUMN IF NOT EXISTS pay_code_id VARCHAR(50)
    REFERENCES jellypolly.pay_codes(id);

-- Migrate legacy single-input rows (pay_code_id IS NULL) onto the product's
-- first mapped pay code so existing quantities keep paying under a code.
UPDATE jellypolly.production_entries pe
SET pay_code_id = sub.pay_code_id
FROM (
  SELECT product_id, MIN(pay_code_id) AS pay_code_id
  FROM jellypolly.product_pay_codes
  GROUP BY product_id
) sub
WHERE pe.pay_code_id IS NULL
  AND pe.worker_id IS NOT NULL
  AND pe.product_id = sub.product_id;

-- Uniqueness now includes pay_code_id.
ALTER TABLE jellypolly.production_entries
  DROP CONSTRAINT IF EXISTS jp_production_entries_date_product_worker_key;

CREATE UNIQUE INDEX IF NOT EXISTS
  jp_production_entries_date_product_worker_paycode_key
  ON jellypolly.production_entries (entry_date, product_id, worker_id, pay_code_id);

COMMIT;

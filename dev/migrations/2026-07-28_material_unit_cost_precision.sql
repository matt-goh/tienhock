-- 2026-07-28: Widen material unit cost columns from 2 to 4 decimal places.
--
-- Problem: material_stock_entries.unit_cost was numeric(10,2), so a keyed unit
-- cost of 0.035 was silently rounded to 0.04 by Postgres on save (and the page
-- then reloaded the rounded value). The same applied to the material / variant
-- default costs, which the Material Stock page writes when it registers a new
-- variant from an entry row.
--
-- Only the per-unit COST columns are widened. The RM value columns
-- (adjustment_value, closing values) stay at 2 decimals - they are money.
--
-- Widening a numeric scale is a metadata-compatible change for existing rows:
-- stored values are unchanged, 0.04 simply becomes 0.0400.

BEGIN;

ALTER TABLE material_stock_entries
  ALTER COLUMN unit_cost TYPE numeric(10, 4);

ALTER TABLE material_variants
  ALTER COLUMN default_unit_cost TYPE numeric(10, 4);

ALTER TABLE materials
  ALTER COLUMN default_unit_cost TYPE numeric(10, 4);

DO $$
DECLARE
  wrong_scale integer;
BEGIN
  SELECT COUNT(*)
    INTO wrong_scale
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (
       (table_name = 'material_stock_entries' AND column_name = 'unit_cost') OR
       (table_name = 'material_variants' AND column_name = 'default_unit_cost') OR
       (table_name = 'materials' AND column_name = 'default_unit_cost')
     )
     AND numeric_scale IS DISTINCT FROM 4;

  IF wrong_scale <> 0 THEN
    RAISE EXCEPTION 'Expected all 3 unit cost columns at scale 4, % still differ', wrong_scale;
  END IF;
END $$;

COMMIT;

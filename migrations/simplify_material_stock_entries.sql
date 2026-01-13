-- Migration: Simplify material_stock_entries table
-- Remove opening/purchases/consumption tracking, just store quantity directly
-- Run this after clearing all entries from material_stock_entries

-- Step 1: Drop the generated column (can't be dropped with regular ALTER)
ALTER TABLE material_stock_entries DROP COLUMN closing_quantity;

-- Step 2: Add the new simple quantity column
ALTER TABLE material_stock_entries ADD COLUMN quantity numeric(15,4) NOT NULL DEFAULT 0;

-- Step 3: Remove opening/purchases/consumption columns
ALTER TABLE material_stock_entries DROP COLUMN opening_quantity;
ALTER TABLE material_stock_entries DROP COLUMN purchases_quantity;
ALTER TABLE material_stock_entries DROP COLUMN consumption_quantity;
ALTER TABLE material_stock_entries DROP COLUMN opening_value;
ALTER TABLE material_stock_entries DROP COLUMN purchases_value;

-- Step 4: Rename closing_value to value
ALTER TABLE material_stock_entries RENAME COLUMN closing_value TO value;

-- Step 5: Drop the old unique constraint (if exists) that doesn't account for variants
-- The correct unique constraint is idx_mse_unique_variant which uses COALESCE
ALTER TABLE material_stock_entries DROP CONSTRAINT IF EXISTS material_stock_entries_year_month_material_id_product_line_key;

-- Verify final structure
-- Table should now have: id, year, month, material_id, product_line, variant_id,
--                        custom_name, custom_description, quantity, unit_cost, value,
--                        notes, created_at, updated_at, created_by
-- Unique constraint: idx_mse_unique_variant on (year, month, material_id, product_line, COALESCE(variant_id::text, custom_description, 'default'))

-- =============================================================================
-- Add is_active field to products table
-- =============================================================================
-- This migration adds soft-delete capability to products
-- Date: 2026-01-13
-- =============================================================================

-- Add is_active column with default TRUE
ALTER TABLE products
ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;

-- Set all existing products to active by default
UPDATE products SET is_active = true;

-- Set specific products as inactive
UPDATE products SET is_active = false
WHERE id IN ('2-MASAK', '2-PADI', 'WE-2UDG', 'WE-360', 'WE-360(5PK)', 'WE-3UDG', 'WE-420', 'WE-MNL');

-- Add index for performance (commonly filtered field)
CREATE INDEX idx_products_is_active ON products(is_active);

-- Add comment
COMMENT ON COLUMN products.is_active IS 'Soft delete flag - false hides product from most views';

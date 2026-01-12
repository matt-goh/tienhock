-- Migration: 005_redesign_materials_stock.sql
-- Date: 2026-01-12
-- Description: Redesign material_stock_entries table with purchases/consumption fields
--              and seed comprehensive material list from materials_closing_stock.pdf

-- =====================================================
-- 1. Backup existing data (if table exists)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'material_stock_entries') THEN
    CREATE TABLE IF NOT EXISTS material_stock_entries_backup AS SELECT * FROM material_stock_entries;
  END IF;
END $$;

-- =====================================================
-- 2. Drop and recreate material_stock_entries table
-- =====================================================
DROP TABLE IF EXISTS material_stock_entries;

CREATE TABLE material_stock_entries (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  product_line VARCHAR(10) NOT NULL CHECK (product_line IN ('mee', 'bihun')),

  -- Per-entry customization
  custom_name VARCHAR(200),           -- Override material.name for this entry
  custom_description TEXT,            -- e.g., "RM120/50kg/bag" or "9.30 x 25kg (H)"

  -- Stock quantities (REDESIGNED)
  opening_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,    -- Set from prev month closing
  purchases_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,  -- User input
  consumption_quantity DECIMAL(15,4) NOT NULL DEFAULT 0, -- User input
  closing_quantity DECIMAL(15,4) GENERATED ALWAYS AS (
    opening_quantity + purchases_quantity - consumption_quantity
  ) STORED,

  -- Pricing (unit_cost editable, values calculated in app)
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  opening_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  purchases_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  closing_value DECIMAL(15,2) NOT NULL DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) REFERENCES staffs(id),

  UNIQUE(year, month, material_id, product_line)
);

COMMENT ON TABLE material_stock_entries IS 'Monthly stock entries with separate purchases and consumption tracking';
COMMENT ON COLUMN material_stock_entries.opening_quantity IS 'Opening stock from previous month closing';
COMMENT ON COLUMN material_stock_entries.purchases_quantity IS 'Purchases added this month';
COMMENT ON COLUMN material_stock_entries.consumption_quantity IS 'Consumption used this month';
COMMENT ON COLUMN material_stock_entries.closing_quantity IS 'Auto-calculated: opening + purchases - consumption';
COMMENT ON COLUMN material_stock_entries.custom_name IS 'Override material name for this entry only';
COMMENT ON COLUMN material_stock_entries.custom_description IS 'Supplier/pricing details like "9.30 x 25kg (H)"';

CREATE INDEX idx_mse_period ON material_stock_entries(year, month);
CREATE INDEX idx_mse_material ON material_stock_entries(material_id);
CREATE INDEX idx_mse_product_line ON material_stock_entries(product_line);

-- =====================================================
-- 3. Add default_description column to materials table
-- =====================================================
ALTER TABLE materials ADD COLUMN IF NOT EXISTS default_description TEXT;
COMMENT ON COLUMN materials.default_description IS 'Default supplier/pricing note from PDF for pre-filling stock entries';

-- =====================================================
-- 4. Seed new materials (PRESERVE EXISTING DATA)
-- =====================================================
-- NOTE: This migration preserves existing materials and only adds new ones
-- Using INSERT ... ON CONFLICT DO NOTHING to skip duplicates

-- Ensure sequence is set correctly (after max existing id)
SELECT setval('materials_id_seq', COALESCE((SELECT MAX(id) FROM materials), 0) + 1, false);

-- =====================================================
-- MEE INGREDIENTS (sort_order 10-49)
-- =====================================================
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, default_description, applies_to, sort_order) VALUES
('M1', 'Garam', 'ingredient', 'kg', '25KG', 0.57, 'RM 14.25 / 25Kg', 'mee', 10),
('M2', 'TH-1', 'ingredient', 'ctn', '25KG', 23.00, 'RM575/25kg/ctn', 'mee', 20),
('M3', 'Soda Ash', 'ingredient', 'kg', '50KG', 2.40, 'RM120/50kg/bag', 'mee', 30),
('M3B', 'Sodium Tripolyphosphate', 'ingredient', 'kg', '50KG', 8.60, 'RM410/50KG/bag', 'mee', 31)
ON CONFLICT (code) DO UPDATE SET default_description = EXCLUDED.default_description;

-- =====================================================
-- BIHUN INGREDIENTS (sort_order 50-89)
-- =====================================================
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, default_description, applies_to, sort_order) VALUES
('B1', 'Sodium Metalbisulphite', 'ingredient', 'kg', '25KG', 5.50, 'RM137.50/25kg Bag', 'bihun', 50),
('B2', 'TH-2', 'ingredient', 'ctn', '20KG', 9.80, 'RM196/20kg/ctn', 'bihun', 60),
('B3', 'Tepung Jagung', 'ingredient', 'kg', NULL, 53.00, 'SWEE HIN CHAN', 'bihun', 70)
ON CONFLICT (code) DO UPDATE SET default_description = EXCLUDED.default_description;

-- =====================================================
-- MEE RAW MATERIALS (sort_order 100-149)
-- =====================================================
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, default_description, applies_to, sort_order) VALUES
('M23', 'Flour - Lahad Datu', 'raw_material', 'bag', '50KG', 44.56, '50kg/bag', 'mee', 100),
('M23B', 'Flour - Johor Bahru', 'raw_material', 'bag', '50KG', 44.54, '50kg/bag', 'mee', 101),
('M23C', 'Flour - Johor Bahru PEN-M', 'raw_material', 'bag', '50KG', 51.43, '50kg/bag', 'mee', 102),
('M23D', 'Stork W - Johor Bahru', 'raw_material', 'bag', '25KG', 82.00, '25kg/bag', 'mee', 103)
ON CONFLICT (code) DO UPDATE SET default_description = EXCLUDED.default_description;

-- =====================================================
-- BIHUN RAW MATERIALS (sort_order 150-199)
-- =====================================================
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, default_description, applies_to, sort_order) VALUES
('B18', 'Tepung Beras 25KG', 'raw_material', 'bag', '25KG', 55.50, 'Yesokey Food S/B', 'bihun', 150),
('B19', 'Beras 50KG', 'raw_material', 'kg', '50KG', 117.50, 'Vietnam (Merah)', 'bihun', 160),
('B20', 'Sago + Transport', 'raw_material', 'kg', NULL, 155.00, 'Nitsei / KK Rice', 'bihun', 170)
ON CONFLICT (code) DO UPDATE SET default_description = EXCLUDED.default_description;

-- =====================================================
-- MEE PACKING MATERIALS (sort_order 200-399)
-- =====================================================
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, default_description, applies_to, sort_order) VALUES
('M4', '2 Udang 150g', 'packing_material', 'roll', '25KG', 232.50, '9.30 x 25kg (H)', 'mee', 200),
('M5', '2 UDG - MEQ', 'packing_material', 'roll', '25KG', 287.50, '11.5 X 25KG (GEN)', 'mee', 201),
('M33', '2 UDG - WEQQ', 'packing_material', 'roll', '25KG', 237.50, '9.50 X 25KG (GEN)', 'mee', 202),
('M6', '2 UDG (MERAH)', 'packing_material', 'roll', '40KG', 303.20, '7.58 X 40KG (HW)', 'mee', 203),
('M6B', '3 UDG - 180G', 'packing_material', 'roll', '25KG', 232.50, '9.30 X 25KG (H)', 'mee', 210),
('M42', '350MM X 240MM (2 UDG 150G)', 'packing_material', 'roll', NULL, 264.00, '1000M X 0.264', 'mee', 220),
('M43', '350MM X 240MM (3 UDG 180GM)', 'packing_material', 'roll', NULL, 264.00, '1000M X 0.264', 'mee', 221),
('M8', 'LABEL 5" X 6"', 'packing_material', 'pcs', NULL, 0.035, 'ME-Q', 'mee', 230),
('M40', 'STICKER LABEL RAMEE (10 types)', 'packing_material', 'pcs', NULL, 0.225, NULL, 'mee', 231),
('M35', 'LABEL 5" X 6" WE-QQ', 'packing_material', 'pcs', NULL, 0.075, 'WE-QQ', 'mee', 232),
('M9', '350G-MEQ/3UDG', 'packing_material', 'roll', '25KG', 237.50, '9.50 x 25KG (UN)', 'mee', 240),
('M36', 'WE-QQ 420G', 'packing_material', 'roll', '25KG', 237.50, '9.50 X 25KG (SA)', 'mee', 241),
('M37', 'WE-QQ 200G', 'packing_material', 'roll', '25KG', 237.50, '9.50 x 25KG (SA)', 'mee', 242),
('M34', 'WE-QQ 360G', 'packing_material', 'roll', '25KG', 237.50, '9.50 X 25KG (GEN)', 'mee', 243),
('M10', '350G-LEBAR MEQ/3UDG', 'packing_material', 'roll', '25KG', 237.50, '9.50 X 25KG (UN)', 'mee', 244),
('M11', '3 UDG - MEQ', 'packing_material', 'roll', '25KG', 237.50, '9.50 x 25KG (SA)', 'mee', 250),
('M11B', 'PP PLASTIC RAMEN (9x14x0.08)', 'packing_material', 'roll', '30KG', 240.00, '8.00 X 30KG (SA)', 'mee', 260),
('M32', 'PP PLASTIC RAMEN (9.5x14x0.08)', 'packing_material', 'roll', '25KG', 200.00, '8.00 x 25kg (SG)', 'mee', 261),
('M30', 'MI KUNING SABAH -500G', 'packing_material', 'pcs', NULL, 0.26, 'Borneo Flexible', 'mee', 270),
('M12', 'EKO 380G', 'packing_material', 'roll', '30KG', 201.00, '6.70 X 30KG', 'mee', 280),
('M13', 'EKO 400G', 'packing_material', 'roll', '30KG', 294.00, '9.80 X 30KG', 'mee', 281),
('M14', '12 x 27 x 0.05 (Merah- MNL)', 'packing_material', 'roll', '25KG', 220.00, '8.80 X 25KG (MB)', 'mee', 290),
('M31', '12 x 27 x 0.50 (Putih - WeQQ)', 'packing_material', 'roll', '25KG', 175.00, '7.00 x 25KG (SA)', 'mee', 291),
('M15', '12 x 24 x 0.05 (Putih- Lebar)', 'packing_material', 'roll', '25KG', 187.50, '7.50 x 25kg (Stellar)', 'mee', 292),
('M16', '13.5 x 24 x 0.03 (Putih -2Udg)', 'packing_material', 'roll', '25KG', 220.00, '8.80 x 25kg (Stellar)', 'mee', 293),
('M17', '13.5 x 24 x 0.03 (Merah -3Udg)', 'packing_material', 'roll', '25KG', 220.00, '8.80 x 25kg', 'mee', 294),
('M18', '27x19x4x0.45 (Merah - Eko)', 'packing_material', 'roll', '35KG', 192.50, '5.50 x 35kg', 'mee', 295),
('M19', '15 x 23 x 0.4 (Merah - Tebal)', 'packing_material', 'roll', '25KG', 195.00, '7.80 X 25KG', 'mee', 296),
('M20', '19 x 30 x 0.05 (Merah-Lebar)', 'packing_material', 'roll', '25KG', 187.50, '7.50 x 25kg (Stellar)', 'mee', 297),
('M28', '18 x 34 x 0.05 (Putih Ramee)', 'packing_material', 'roll', '25KG', 187.50, '7.50 x 25kg (ST)', 'mee', 298),
('M29', '18 x 35 x 0.05 (Putih Ramee)', 'packing_material', 'roll', '25KG', 187.50, '7.50 x 25kg (ST)', 'mee', 299),
('M21', '18 x 29 x 0.05 (Merah-Halus)', 'packing_material', 'roll', '25KG', 187.50, '7.50 x 25kg (ST)', 'mee', 300),
('M22', 'Selotape (Clear)', 'packing_material', 'roll', NULL, 0.35, NULL, 'mee', 310)
ON CONFLICT (code) DO UPDATE SET default_description = EXCLUDED.default_description;

-- =====================================================
-- BIHUN PACKING MATERIALS (sort_order 400-599)
-- =====================================================
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, default_description, applies_to, sort_order) VALUES
('B4', '3 UDG ME-Q (300G)', 'packing_material', 'roll', '30KG', 285.00, '9.50 X 30KG (GEN)', 'bihun', 400),
('B5', '3 UDG & MEQ (300G)', 'packing_material', 'roll', '25KG', 269.50, '10.78 X 25kg (STELLAR)', 'bihun', 401),
('B30', 'WE-QQ 300GM', 'packing_material', 'roll', '25KG', 275.00, '11.00 X 25kg (GEN)', 'bihun', 410),
('B28', 'WE-QQ 600GM', 'packing_material', 'roll', '25KG', 287.50, '11.50 X 25KG (GEN)', 'bihun', 411),
('B6', 'LABEL BNL 5KG', 'packing_material', 'pcs', NULL, 0.16, NULL, 'bihun', 420),
('B6B', 'LABEL BNL 3KG', 'packing_material', 'pcs', NULL, 0.035, NULL, 'bihun', 421),
('B7', '2 UDG 300G -MEQ', 'packing_material', 'roll', '25KG', 237.50, '9.50 X 25KG (GEN)', 'bihun', 430),
('B8', '600G-3UDG/MEQ', 'packing_material', 'roll', '25KG', 275.00, '11 x 25KG (UN)', 'bihun', 431),
('B9', '2 UDG 270G (HIJAU)', 'packing_material', 'roll', '25KG', 287.50, '11.50 X 25KG (GEN)', 'bihun', 432),
('B10', 'CAP TUKANG MASAK', 'packing_material', 'roll', '30KG', 285.00, '9.50 X 30KG (GEN)', 'bihun', 440),
('B11', 'CAP UDANG PADI', 'packing_material', 'roll', '25KG', 237.50, '9.50 X 25KG (GEN)', 'bihun', 441),
('B12', '24 x 38.5 (Putih paling besar)', 'packing_material', 'roll', '25KG', 212.50, '8.50 x 25kg (SG)', 'bihun', 450),
('B31', '48 x 46 x 0.10 (Putih Bundle)', 'packing_material', 'roll', '25KG', 212.50, '8.50 x 25kg (SG)', 'bihun', 451),
('B13', '13.5 x 34 x 0.05 (Merah-BNL 3KG)', 'packing_material', 'roll', '25KG', 233.75, '9.35 x x25Kg (UN)', 'bihun', 460),
('B14', '19 x 34 x 0.05 (Merah-5kg)', 'packing_material', 'roll', '25KG', 212.50, '8.50 X 25kg (SG)', 'bihun', 461),
('B29', '13 x 34 x 0.03MM (Putih-600g) WEQQ', 'packing_material', 'roll', '25KG', 175.00, '7.00 X 25kg (SA)', 'bihun', 470),
('B18A', '12.5 X33X0.03MM (Putih-2Udg)', 'packing_material', 'roll', '25KG', 212.50, '8.5 x 25kg (MULTI)', 'bihun', 471),
('B15', '12.5 x 34 x 0.03 (Merah-NIPIS)', 'packing_material', 'roll', '25KG', 220.00, '8.80 X 25kg (MB)', 'bihun', 480),
('B16', '13 x 34 x 0.035 (Merah-600G)', 'packing_material', 'roll', '25KG', 225.00, '9.00 x 21kg (Sgen)', 'bihun', 481),
('B17', 'Selotape (Merah)', 'packing_material', 'roll', NULL, 1.95, 'MULTI BEST', 'bihun', 490)
ON CONFLICT (code) DO UPDATE SET default_description = EXCLUDED.default_description;

-- =====================================================
-- NOTE: Stock Kilang (finished goods) removed - comes from products table
-- =====================================================

-- =====================================================
-- 5. Create updated_at trigger
-- =====================================================
DROP TRIGGER IF EXISTS material_stock_entries_updated_at_trigger ON material_stock_entries;
CREATE TRIGGER material_stock_entries_updated_at_trigger
  BEFORE UPDATE ON material_stock_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_materials_updated_at();

-- =====================================================
-- 6. Migrate existing stock entries (if backup exists)
-- =====================================================
-- NOTE: Old 'quantity' field becomes 'opening_quantity' in new schema
-- purchases_quantity and consumption_quantity start at 0
-- closing_quantity will auto-calculate to equal opening (0+0-0=0, so need to set properly)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'material_stock_entries_backup') THEN
    -- Check if backup has data
    IF EXISTS (SELECT 1 FROM material_stock_entries_backup LIMIT 1) THEN
      INSERT INTO material_stock_entries (
        year, month, material_id, product_line,
        opening_quantity, purchases_quantity, consumption_quantity,
        unit_cost, opening_value, purchases_value, closing_value,
        notes, created_at, updated_at, created_by
      )
      SELECT
        b.year, b.month, b.material_id, b.product_line,
        COALESCE(b.quantity, 0) as opening_quantity,  -- Old closing becomes new opening
        0 as purchases_quantity,
        0 as consumption_quantity,
        COALESCE(b.unit_cost, 0) as unit_cost,
        COALESCE(b.quantity, 0) * COALESCE(b.unit_cost, 0) as opening_value,
        0 as purchases_value,
        COALESCE(b.quantity, 0) * COALESCE(b.unit_cost, 0) as closing_value,  -- Same as opening (no changes)
        b.notes,
        b.created_at,
        b.updated_at,
        b.created_by
      FROM material_stock_entries_backup b
      WHERE EXISTS (SELECT 1 FROM materials m WHERE m.id = b.material_id)
      ON CONFLICT (year, month, material_id, product_line) DO NOTHING;

      RAISE NOTICE 'Migrated existing stock entries from backup';
    END IF;
  END IF;
END $$;

-- =====================================================
-- Verification
-- =====================================================
-- SELECT COUNT(*) as total_materials FROM materials;
-- SELECT category, COUNT(*) FROM materials GROUP BY category ORDER BY category;
-- SELECT code, name, default_description FROM materials WHERE default_description IS NOT NULL LIMIT 20;
-- SELECT COUNT(*) as migrated_entries FROM material_stock_entries;

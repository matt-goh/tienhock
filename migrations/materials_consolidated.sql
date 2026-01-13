-- =============================================================================
-- MATERIALS SYSTEM - CONSOLIDATED MIGRATION
-- =============================================================================
-- This file consolidates migrations 002, 005, 006, 007, 008, 009, 010
-- Run this on a fresh database to create the complete materials system
-- Date: 2026-01-13
-- =============================================================================

-- =====================================================
-- 1. Create materials table (final schema)
-- =====================================================
CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('ingredient', 'raw_material', 'packing_material')),
  default_unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  applies_to VARCHAR(10) NOT NULL DEFAULT 'both' CHECK (applies_to IN ('mee', 'bihun', 'both')),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

COMMENT ON TABLE materials IS 'Master table for ingredients, raw materials, and packing materials';
COMMENT ON COLUMN materials.code IS 'Unique code identifier (e.g., M1, B19, GARAM)';
COMMENT ON COLUMN materials.category IS 'Type: ingredient, raw_material, packing_material';
COMMENT ON COLUMN materials.applies_to IS 'Which product line uses this: mee, bihun, or both';

CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_materials_is_active ON materials(is_active);
CREATE INDEX IF NOT EXISTS idx_materials_applies_to ON materials(applies_to);

-- =====================================================
-- 2. Create material_variants table
-- =====================================================
CREATE TABLE IF NOT EXISTS material_variants (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  variant_name VARCHAR(100) NOT NULL,
  default_unit_cost NUMERIC(10,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(material_id, variant_name)
);

COMMENT ON TABLE material_variants IS 'Variants for materials with multiple suppliers/types';
COMMENT ON COLUMN material_variants.variant_name IS 'Variant description (e.g., "Vietnam (Coklat)", "RM 14.25 / 25Kg")';

CREATE INDEX IF NOT EXISTS idx_material_variants_material_id ON material_variants(material_id);
CREATE INDEX IF NOT EXISTS idx_material_variants_is_active ON material_variants(is_active);

-- =====================================================
-- 3. Create material_stock_entries table
-- =====================================================
CREATE TABLE IF NOT EXISTS material_stock_entries (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  product_line VARCHAR(10) NOT NULL CHECK (product_line IN ('mee', 'bihun')),
  variant_id INTEGER REFERENCES material_variants(id) ON DELETE SET NULL,

  -- Per-entry customization
  custom_name VARCHAR(200),
  custom_description TEXT,

  -- Stock quantities
  opening_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  purchases_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  consumption_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  closing_quantity DECIMAL(15,4) GENERATED ALWAYS AS (
    opening_quantity + purchases_quantity - consumption_quantity
  ) STORED,

  -- Pricing
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  opening_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  purchases_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  closing_value DECIMAL(15,2) NOT NULL DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

COMMENT ON TABLE material_stock_entries IS 'Monthly stock entries with purchases and consumption tracking';
COMMENT ON COLUMN material_stock_entries.opening_quantity IS 'Opening stock from previous month closing';
COMMENT ON COLUMN material_stock_entries.purchases_quantity IS 'Purchases added this month';
COMMENT ON COLUMN material_stock_entries.consumption_quantity IS 'Consumption used this month';
COMMENT ON COLUMN material_stock_entries.closing_quantity IS 'Auto-calculated: opening + purchases - consumption';
COMMENT ON COLUMN material_stock_entries.variant_id IS 'Links to material_variants for multi-variant materials';

CREATE INDEX IF NOT EXISTS idx_mse_period ON material_stock_entries(year, month);
CREATE INDEX IF NOT EXISTS idx_mse_material ON material_stock_entries(material_id);
CREATE INDEX IF NOT EXISTS idx_mse_product_line ON material_stock_entries(product_line);
CREATE INDEX IF NOT EXISTS idx_mse_variant ON material_stock_entries(variant_id);

-- Unique index for variant support
CREATE UNIQUE INDEX IF NOT EXISTS idx_mse_unique_variant ON material_stock_entries (
  year, month, material_id, product_line,
  COALESCE(variant_id::text, custom_description, 'default')
);

-- =====================================================
-- 4. Create triggers for updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS materials_updated_at_trigger ON materials;
CREATE TRIGGER materials_updated_at_trigger
  BEFORE UPDATE ON materials
  FOR EACH ROW
  EXECUTE FUNCTION update_materials_updated_at();

CREATE OR REPLACE FUNCTION update_material_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_variants_updated_at_trigger ON material_variants;
CREATE TRIGGER material_variants_updated_at_trigger
  BEFORE UPDATE ON material_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_material_variants_updated_at();

DROP TRIGGER IF EXISTS material_stock_entries_updated_at_trigger ON material_stock_entries;
CREATE TRIGGER material_stock_entries_updated_at_trigger
  BEFORE UPDATE ON material_stock_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_materials_updated_at();

-- =====================================================
-- 5. Seed materials data
-- =====================================================

-- MEE INGREDIENTS (sort_order 10-49)
INSERT INTO materials (code, name, category, default_unit_cost, applies_to, sort_order) VALUES
('M1', 'Garam', 'ingredient', 0.57, 'mee', 10),
('M2', 'TH-1', 'ingredient', 23.00, 'mee', 20),
('M3', 'Soda Ash', 'ingredient', 2.40, 'mee', 30),
('M3B', 'Sodium Tripolyphosphate', 'ingredient', 8.60, 'mee', 31)
ON CONFLICT (code) DO NOTHING;

-- BIHUN INGREDIENTS (sort_order 50-89)
INSERT INTO materials (code, name, category, default_unit_cost, applies_to, sort_order) VALUES
('B1', 'Sodium Metalbisulphite', 'ingredient', 5.50, 'bihun', 50),
('B2', 'TH-2', 'ingredient', 9.80, 'bihun', 60),
('B3', 'Tepung Jagung', 'ingredient', 53.00, 'bihun', 70)
ON CONFLICT (code) DO NOTHING;

-- MEE RAW MATERIALS (sort_order 100-149)
INSERT INTO materials (code, name, category, default_unit_cost, applies_to, sort_order) VALUES
('M23', 'Flour - Lahad Datu', 'raw_material', 44.56, 'mee', 100),
('M23B', 'Flour - Johor Bahru', 'raw_material', 44.54, 'mee', 101),
('M23C', 'Flour - Johor Bahru PEN-M', 'raw_material', 51.43, 'mee', 102),
('M23D', 'Stork W - Johor Bahru', 'raw_material', 82.00, 'mee', 103)
ON CONFLICT (code) DO NOTHING;

-- BIHUN RAW MATERIALS (sort_order 150-199)
INSERT INTO materials (code, name, category, default_unit_cost, applies_to, sort_order) VALUES
('B18', 'Tepung Beras 25KG', 'raw_material', 55.50, 'bihun', 150),
('B19', 'Beras 50KG', 'raw_material', 117.50, 'bihun', 160),
('B20', 'Sago + Transport', 'raw_material', 155.00, 'bihun', 170)
ON CONFLICT (code) DO NOTHING;

-- MEE PACKING MATERIALS (sort_order 200-399)
INSERT INTO materials (code, name, category, default_unit_cost, applies_to, sort_order) VALUES
('M4', '2 Udang 150g', 'packing_material', 232.50, 'mee', 200),
('M5', '2 UDG - MEQ', 'packing_material', 287.50, 'mee', 201),
('M33', '2 UDG - WEQQ', 'packing_material', 237.50, 'mee', 202),
('M6', '2 UDG (MERAH)', 'packing_material', 303.20, 'mee', 203),
('M6B', '3 UDG - 180G', 'packing_material', 232.50, 'mee', 210),
('M42', '350MM X 240MM (2 UDG 150G)', 'packing_material', 264.00, 'mee', 220),
('M43', '350MM X 240MM (3 UDG 180GM)', 'packing_material', 264.00, 'mee', 221),
('M8', 'LABEL 5" X 6"', 'packing_material', 0.035, 'mee', 230),
('M40', 'STICKER LABEL RAMEE (10 types)', 'packing_material', 0.225, 'mee', 231),
('M35', 'LABEL 5" X 6" WE-QQ', 'packing_material', 0.075, 'mee', 232),
('M9', '350G-MEQ/3UDG', 'packing_material', 237.50, 'mee', 240),
('M36', 'WE-QQ 420G', 'packing_material', 237.50, 'mee', 241),
('M37', 'WE-QQ 200G', 'packing_material', 237.50, 'mee', 242),
('M34', 'WE-QQ 360G', 'packing_material', 237.50, 'mee', 243),
('M10', '350G-LEBAR MEQ/3UDG', 'packing_material', 237.50, 'mee', 244),
('M11', '3 UDG - MEQ', 'packing_material', 237.50, 'mee', 250),
('M11B', 'PP PLASTIC RAMEN (9x14x0.08)', 'packing_material', 240.00, 'mee', 260),
('M32', 'PP PLASTIC RAMEN (9.5x14x0.08)', 'packing_material', 200.00, 'mee', 261),
('M30', 'MI KUNING SABAH -500G', 'packing_material', 0.26, 'mee', 270),
('M12', 'EKO 380G', 'packing_material', 201.00, 'mee', 280),
('M13', 'EKO 400G', 'packing_material', 294.00, 'mee', 281),
('M14', '12 x 27 x 0.05 (Merah- MNL)', 'packing_material', 220.00, 'mee', 290),
('M31', '12 x 27 x 0.50 (Putih - WeQQ)', 'packing_material', 175.00, 'mee', 291),
('M15', '12 x 24 x 0.05 (Putih- Lebar)', 'packing_material', 187.50, 'mee', 292),
('M16', '13.5 x 24 x 0.03 (Putih -2Udg)', 'packing_material', 220.00, 'mee', 293),
('M17', '13.5 x 24 x 0.03 (Merah -3Udg)', 'packing_material', 220.00, 'mee', 294),
('M18', '27x19x4x0.45 (Merah - Eko)', 'packing_material', 192.50, 'mee', 295),
('M19', '15 x 23 x 0.4 (Merah - Tebal)', 'packing_material', 195.00, 'mee', 296),
('M20', '19 x 30 x 0.05 (Merah-Lebar)', 'packing_material', 187.50, 'mee', 297),
('M28', '18 x 34 x 0.05 (Putih Ramee)', 'packing_material', 187.50, 'mee', 298),
('M29', '18 x 35 x 0.05 (Putih Ramee)', 'packing_material', 187.50, 'mee', 299),
('M21', '18 x 29 x 0.05 (Merah-Halus)', 'packing_material', 187.50, 'mee', 300),
('M22', 'Selotape (Clear)', 'packing_material', 0.35, 'mee', 310)
ON CONFLICT (code) DO NOTHING;

-- BIHUN PACKING MATERIALS (sort_order 400-599)
INSERT INTO materials (code, name, category, default_unit_cost, applies_to, sort_order) VALUES
('B4', '3 UDG ME-Q (300G)', 'packing_material', 285.00, 'bihun', 400),
('B5', '3 UDG & MEQ (300G)', 'packing_material', 269.50, 'bihun', 401),
('B30', 'WE-QQ 300GM', 'packing_material', 275.00, 'bihun', 410),
('B28', 'WE-QQ 600GM', 'packing_material', 287.50, 'bihun', 411),
('B6', 'LABEL BNL 5KG', 'packing_material', 0.16, 'bihun', 420),
('B6B', 'LABEL BNL 3KG', 'packing_material', 0.035, 'bihun', 421),
('B7', '2 UDG 300G -MEQ', 'packing_material', 237.50, 'bihun', 430),
('B8', '600G-3UDG/MEQ', 'packing_material', 275.00, 'bihun', 431),
('B9', '2 UDG 270G (HIJAU)', 'packing_material', 287.50, 'bihun', 432),
('B10', 'CAP TUKANG MASAK', 'packing_material', 285.00, 'bihun', 440),
('B11', 'CAP UDANG PADI', 'packing_material', 237.50, 'bihun', 441),
('B12', '24 x 38.5 (Putih paling besar)', 'packing_material', 212.50, 'bihun', 450),
('B31', '48 x 46 x 0.10 (Putih Bundle)', 'packing_material', 212.50, 'bihun', 451),
('B13', '13.5 x 34 x 0.05 (Merah-BNL 3KG)', 'packing_material', 233.75, 'bihun', 460),
('B14', '19 x 34 x 0.05 (Merah-5kg)', 'packing_material', 212.50, 'bihun', 461),
('B29', '13 x 34 x 0.03MM (Putih-600g) WEQQ', 'packing_material', 175.00, 'bihun', 470),
('B18A', '12.5 X33X0.03MM (Putih-2Udg)', 'packing_material', 212.50, 'bihun', 471),
('B15', '12.5 x 34 x 0.03 (Merah-NIPIS)', 'packing_material', 220.00, 'bihun', 480),
('B16', '13 x 34 x 0.035 (Merah-600G)', 'packing_material', 225.00, 'bihun', 481),
('B17', 'Selotape (Merah)', 'packing_material', 1.95, 'bihun', 490)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 6. Seed material_variants data
-- =====================================================

-- Helper function to get material ID by code
CREATE OR REPLACE FUNCTION get_material_id(p_code VARCHAR) RETURNS INTEGER AS $$
  SELECT id FROM materials WHERE code = p_code;
$$ LANGUAGE SQL;

-- M1 Garam - 3 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M1'), 'RM 14.25 / 25Kg', 14.25, 1 WHERE get_material_id('M1') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M1'), 'RM 14.75 / 25Kg', 14.75, 2 WHERE get_material_id('M1') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M1'), 'RM 575 / 25kg/ctn', 575.00, 3 WHERE get_material_id('M1') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M3 Soda Ash - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M3'), 'RM 120 / 50kg/bag', 120.00, 1 WHERE get_material_id('M3') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M3'), 'RM 160 / 50kg/bag', 160.00, 2 WHERE get_material_id('M3') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M3B Sodium Tripolyphosphate - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M3B'), 'RM 410 / 50KG/bag', 410.00, 1 WHERE get_material_id('M3B') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B1 Sodium Metalbisulphite - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B1'), 'RM 137.50 / 25kg Bag', 137.50, 1 WHERE get_material_id('B1') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B1'), 'RM 97.50 / 25kg Bag', 97.50, 2 WHERE get_material_id('B1') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B2 TH-2 - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B2'), 'RM 196 / 20kg/ctn', 196.00, 1 WHERE get_material_id('B2') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B2'), 'RM 216 / 20kg/ctn', 216.00, 2 WHERE get_material_id('B2') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B3 Tepung Jagung - 4 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B3'), 'SWEE HIN CHAN', 0, 1 WHERE get_material_id('B3') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B3'), 'HOMCO', 0, 2 WHERE get_material_id('B3') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B3'), 'KONG LONG HUAT', 0, 3 WHERE get_material_id('B3') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B3'), 'AGRICORE', 0, 4 WHERE get_material_id('B3') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B18 Tepung Beras 25KG - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B18'), 'Yesokey Food S/B (A)', 0, 1 WHERE get_material_id('B18') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B18'), 'Yesokey Food S/B (B)', 0, 2 WHERE get_material_id('B18') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B19 Beras 50KG - 7 variants (most important)
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B19'), 'Vietnam (Coklat)', 117.50, 1 WHERE get_material_id('B19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B19'), 'Vietnam (Hijau)', 117.50, 2 WHERE get_material_id('B19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B19'), 'Pakistan (Hijau)', 117.50, 3 WHERE get_material_id('B19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B19'), 'Vietnam (Orange)', 117.50, 4 WHERE get_material_id('B19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B19'), 'India (Hitam)', 117.50, 5 WHERE get_material_id('B19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B19'), 'Vietnam (Merah)', 117.50, 6 WHERE get_material_id('B19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B19'), 'Vietnam (Biru)', 117.50, 7 WHERE get_material_id('B19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B20 Sago + Transport - 5 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B20'), 'Phoung', 0, 1 WHERE get_material_id('B20') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B20'), 'KK Rice', 0, 2 WHERE get_material_id('B20') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B20'), 'Nitsei (A)', 0, 3 WHERE get_material_id('B20') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B20'), 'Nitsei (B)', 0, 4 WHERE get_material_id('B20') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B20'), 'Agricore (Wheat)', 0, 5 WHERE get_material_id('B20') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M4 2 Udang 150g - 3 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M4'), '9.30 x 25kg (H)', 9.30, 1 WHERE get_material_id('M4') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M4'), '10.50 x 32.5KG (GEN)', 10.50, 2 WHERE get_material_id('M4') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M4'), '11.5 x 25KG (GEN)', 11.50, 3 WHERE get_material_id('M4') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M5 2 UDG - MEQ - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M5'), '11.5 x 25KG (GEN)', 11.50, 1 WHERE get_material_id('M5') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M33 2 UDG - WEQQ - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M33'), '9.50 x 12.2KG (GEN)', 9.50, 1 WHERE get_material_id('M33') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M33'), '9.50 x 25KG (GEN)', 9.50, 2 WHERE get_material_id('M33') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M6 2 UDG (MERAH) - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M6'), '7.58 x 40KG (HW)', 7.58, 1 WHERE get_material_id('M6') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M6B 3 UDG - 180G - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M6B'), '9.30 x 25KG (H)', 9.30, 1 WHERE get_material_id('M6B') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M42 350MM X 240MM (2 UDG 150G) - 4 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M42'), '9.85 x 25KG (NEW)', 9.85, 1 WHERE get_material_id('M42') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M42'), '9.50 x 25KG (GEN)', 9.50, 2 WHERE get_material_id('M42') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M42'), '10.50 x 25KG (GEN)', 10.50, 3 WHERE get_material_id('M42') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M42'), '9.15 x 25KG (OLD)', 9.15, 4 WHERE get_material_id('M42') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M43 350MM X 240MM (3 UDG 180GM) - 4 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M43'), '9.85 x 25KG (NEW)', 9.85, 1 WHERE get_material_id('M43') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M43'), '9.50 x 25KG (GEN)', 9.50, 2 WHERE get_material_id('M43') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M43'), '10.50 x 25KG (GEN)', 10.50, 3 WHERE get_material_id('M43') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M43'), '9.15 x 25KG (OLD)', 9.15, 4 WHERE get_material_id('M43') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M8 LABEL 5" X 6" - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M8'), 'COC', 0, 1 WHERE get_material_id('M8') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M8'), 'ME-Q', 0, 2 WHERE get_material_id('M8') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M40 STICKER LABEL RAMEE - No variants (single item despite "10 types" in description)

-- M35 LABEL 5" X 6" WE-QQ - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M35'), 'WE-QQ', 0, 1 WHERE get_material_id('M35') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M9 350G-MEQ/3UDG - 4 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M9'), '12.50 x 25KG (H)', 12.50, 1 WHERE get_material_id('M9') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M9'), '12.50 x 25KG (GEN)', 12.50, 2 WHERE get_material_id('M9') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M9'), '12.80 x 25KG (GEN)', 12.80, 3 WHERE get_material_id('M9') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M9'), '10.50 x 25KG (GEN)', 10.50, 4 WHERE get_material_id('M9') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M36 WE-QQ 420G - 3 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M36'), '12.80 x 25KG (GEN)', 12.80, 1 WHERE get_material_id('M36') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M36'), '12.50 x 25KG (GEN)', 12.50, 2 WHERE get_material_id('M36') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M36'), '12.80 x 25KG (H)', 12.80, 3 WHERE get_material_id('M36') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M37 WE-QQ 200G - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M37'), 'UN', 0, 1 WHERE get_material_id('M37') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M37'), 'SA', 0, 2 WHERE get_material_id('M37') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M34 WE-QQ 360G - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M34'), '12.50 x 25KG (GEN)', 12.50, 1 WHERE get_material_id('M34') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M34'), '12.80 x 25KG (GEN)', 12.80, 2 WHERE get_material_id('M34') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M10 350G-LEBAR MEQ/3UDG - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M10'), '12.50 x 25KG (H)', 12.50, 1 WHERE get_material_id('M10') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M11 3 UDG - MEQ - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M11'), '13.80 x 25KG (H)', 13.80, 1 WHERE get_material_id('M11') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M11'), '13.80 x 25KG (GEN)', 13.80, 2 WHERE get_material_id('M11') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M11B PP PLASTIC RAMEN (9x14x0.08) - 3 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M11B'), '6.50 x 23.5KG (KK)', 6.50, 1 WHERE get_material_id('M11B') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M11B'), '6.50 x 16KG (KK)', 6.50, 2 WHERE get_material_id('M11B') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M11B'), '6.50 x 25KG (GEN)', 6.50, 3 WHERE get_material_id('M11B') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M32 PP PLASTIC RAMEN (9.5x14x0.08) - 3 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M32'), '6.50 x 23.5KG (KK)', 6.50, 1 WHERE get_material_id('M32') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M32'), '6.50 x 16KG (KK)', 6.50, 2 WHERE get_material_id('M32') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M32'), '6.50 x 25KG (GEN)', 6.50, 3 WHERE get_material_id('M32') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M30 MI KUNING SABAH -500G - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M30'), 'Borneo Flexible', 0, 1 WHERE get_material_id('M30') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M14 12 x 27 x 0.05 (Merah- MNL) - 3 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M14'), '6.85 x 25KG (HW)', 6.85, 1 WHERE get_material_id('M14') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M14'), '7.20 x 25KG (GEN)', 7.20, 2 WHERE get_material_id('M14') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M14'), '6.80 x 25KG (GEN)', 6.80, 3 WHERE get_material_id('M14') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M31 12 x 27 x 0.50 (Putih - WeQQ) - 3 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M31'), '6.80 x 25KG (HW)', 6.80, 1 WHERE get_material_id('M31') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M31'), '7.20 x 25KG (GEN)', 7.20, 2 WHERE get_material_id('M31') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M31'), '6.80 x 25KG (GEN)', 6.80, 3 WHERE get_material_id('M31') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M15 12 x 24 x 0.05 (Putih- Lebar) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M15'), '6.85 x 25KG (HW)', 6.85, 1 WHERE get_material_id('M15') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M15'), '6.80 x 25KG (GEN)', 6.80, 2 WHERE get_material_id('M15') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M16 13.5 x 24 x 0.03 (Putih -2Udg) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M16'), '4.50 x 25KG (HW)', 4.50, 1 WHERE get_material_id('M16') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M16'), '4.50 x 25KG (GEN)', 4.50, 2 WHERE get_material_id('M16') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M17 13.5 x 24 x 0.03 (Merah -3Udg) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M17'), '4.50 x 25KG (HW)', 4.50, 1 WHERE get_material_id('M17') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M17'), '4.50 x 25KG (GEN)', 4.50, 2 WHERE get_material_id('M17') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M18 27x19x4x0.45 (Merah - Eko) - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M18'), '17.50 x 25KG (HW)', 17.50, 1 WHERE get_material_id('M18') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M19 15 x 23 x 0.4 (Merah - Tebal) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M19'), '10.00 x 25KG (HW)', 10.00, 1 WHERE get_material_id('M19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M19'), '10.00 x 25KG (GEN)', 10.00, 2 WHERE get_material_id('M19') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M20 19 x 30 x 0.05 (Merah-Lebar) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M20'), '11.50 x 25KG (HW)', 11.50, 1 WHERE get_material_id('M20') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M20'), '11.50 x 25KG (GEN)', 11.50, 2 WHERE get_material_id('M20') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M28 18 x 34 x 0.05 (Putih Ramee) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M28'), '8.50 x 25KG (HW)', 8.50, 1 WHERE get_material_id('M28') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M28'), '8.50 x 25KG (GEN)', 8.50, 2 WHERE get_material_id('M28') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M29 18 x 35 x 0.05 (Putih Ramee) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M29'), '8.80 x 25KG (HW)', 8.80, 1 WHERE get_material_id('M29') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M29'), '8.80 x 25KG (GEN)', 8.80, 2 WHERE get_material_id('M29') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- M21 18 x 29 x 0.05 (Merah-Halus) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M21'), '9.00 x 25KG (HW)', 9.00, 1 WHERE get_material_id('M21') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('M21'), '9.00 x 25KG (GEN)', 9.00, 2 WHERE get_material_id('M21') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- BIHUN PACKING MATERIALS variants

-- B4 3 UDG ME-Q (300G) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B4'), '12.60 x 25KG (H)', 12.60, 1 WHERE get_material_id('B4') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B4'), '12.60 x 25KG (GEN)', 12.60, 2 WHERE get_material_id('B4') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B5 3 UDG & MEQ (300G) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B5'), '12.60 x 25KG (H)', 12.60, 1 WHERE get_material_id('B5') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B5'), '12.60 x 25KG (GEN)', 12.60, 2 WHERE get_material_id('B5') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B30 WE-QQ 300GM - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B30'), '12.50 x 25KG (GEN)', 12.50, 1 WHERE get_material_id('B30') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B30'), '12.80 x 25KG (GEN)', 12.80, 2 WHERE get_material_id('B30') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B28 WE-QQ 600GM - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B28'), '12.50 x 25KG (GEN)', 12.50, 1 WHERE get_material_id('B28') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B28'), '12.80 x 25KG (GEN)', 12.80, 2 WHERE get_material_id('B28') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B6 LABEL BNL 5KG - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B6'), 'Standard', 0, 1 WHERE get_material_id('B6') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B6B LABEL BNL 3KG - 1 variant
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B6B'), 'Standard', 0, 1 WHERE get_material_id('B6B') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B7 2 UDG 300G -MEQ - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B7'), '8.90 x 25KG (H)', 8.90, 1 WHERE get_material_id('B7') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B7'), '8.90 x 25KG (GEN)', 8.90, 2 WHERE get_material_id('B7') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B8 600G-3UDG/MEQ - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B8'), '15.00 x 25KG (H)', 15.00, 1 WHERE get_material_id('B8') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B8'), '15.00 x 25KG (GEN)', 15.00, 2 WHERE get_material_id('B8') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B9 2 UDG 270G (HIJAU) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B9'), '8.20 x 25KG (H)', 8.20, 1 WHERE get_material_id('B9') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B9'), '8.20 x 25KG (GEN)', 8.20, 2 WHERE get_material_id('B9') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B10 CAP TUKANG MASAK - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B10'), '8.00 x 25KG (H)', 8.00, 1 WHERE get_material_id('B10') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B10'), '8.00 x 25KG (GEN)', 8.00, 2 WHERE get_material_id('B10') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B11 CAP UDANG PADI - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B11'), '8.00 x 25KG (H)', 8.00, 1 WHERE get_material_id('B11') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B11'), '8.00 x 25KG (GEN)', 8.00, 2 WHERE get_material_id('B11') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B12 24 x 38.5 (Putih paling besar) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B12'), '21.20 x 25KG (HW)', 21.20, 1 WHERE get_material_id('B12') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B12'), '21.20 x 25KG (GEN)', 21.20, 2 WHERE get_material_id('B12') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B31 48 x 46 x 0.10 (Putih Bundle) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B31'), '34.50 x 25KG (HW)', 34.50, 1 WHERE get_material_id('B31') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B31'), '34.50 x 25KG (GEN)', 34.50, 2 WHERE get_material_id('B31') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B13 13.5 x 34 x 0.05 (Merah-BNL 3KG) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B13'), '6.90 x 25KG (HW)', 6.90, 1 WHERE get_material_id('B13') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B13'), '6.90 x 25KG (GEN)', 6.90, 2 WHERE get_material_id('B13') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B14 19 x 34 x 0.05 (Merah-5kg) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B14'), '9.00 x 25KG (HW)', 9.00, 1 WHERE get_material_id('B14') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B14'), '9.00 x 25KG (GEN)', 9.00, 2 WHERE get_material_id('B14') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B29 13 x 34 x 0.03MM (Putih-600g) WEQQ - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B29'), '6.50 x 25KG (HW)', 6.50, 1 WHERE get_material_id('B29') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B29'), '6.50 x 25KG (GEN)', 6.50, 2 WHERE get_material_id('B29') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B18A 12.5 X33X0.03MM (Putih-2Udg) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B18A'), '6.00 x 25KG (HW)', 6.00, 1 WHERE get_material_id('B18A') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B18A'), '6.00 x 25KG (GEN)', 6.00, 2 WHERE get_material_id('B18A') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B15 12.5 x 34 x 0.03 (Merah-NIPIS) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B15'), '6.30 x 25KG (HW)', 6.30, 1 WHERE get_material_id('B15') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B15'), '6.30 x 25KG (GEN)', 6.30, 2 WHERE get_material_id('B15') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B16 13 x 34 x 0.035 (Merah-600G) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B16'), '6.80 x 25KG (HW)', 6.80, 1 WHERE get_material_id('B16') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B16'), '6.80 x 25KG (GEN)', 6.80, 2 WHERE get_material_id('B16') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- B17 Selotape (Merah) - 2 variants
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B17'), 'MULTI BEST', 0, 1 WHERE get_material_id('B17') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;
INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
SELECT get_material_id('B17'), 'INDAH MANIS', 0, 2 WHERE get_material_id('B17') IS NOT NULL
ON CONFLICT (material_id, variant_name) DO NOTHING;

-- Clean up helper function
DROP FUNCTION IF EXISTS get_material_id(VARCHAR);

-- =====================================================
-- 7. Verification
-- =====================================================
SELECT 'Materials created:' as info, COUNT(*) as count FROM materials;
SELECT 'Variants created:' as info, COUNT(*) as count FROM material_variants;
SELECT 'Materials with variants:' as info;
SELECT m.code, m.name, COUNT(v.id) as variant_count
FROM materials m
LEFT JOIN material_variants v ON v.material_id = m.id
WHERE v.id IS NOT NULL
GROUP BY m.code, m.name
ORDER BY m.code;

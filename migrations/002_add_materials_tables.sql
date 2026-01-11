-- Migration: Add Materials and Stock Entry Tables
-- Date: 2026-01-11
-- Description: Creates tables for ingredients, raw materials, and packing materials stock management

-- =====================================================
-- 1. Create materials table
-- =====================================================
CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('ingredient', 'raw_material', 'packing_material')),
  unit VARCHAR(20) NOT NULL,
  unit_size VARCHAR(50),
  default_unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  applies_to VARCHAR(10) NOT NULL DEFAULT 'both' CHECK (applies_to IN ('mee', 'bihun', 'both')),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) REFERENCES staffs(id)
);

COMMENT ON TABLE materials IS 'Master table for ingredients, raw materials, and packing materials';
COMMENT ON COLUMN materials.code IS 'Unique code identifier (e.g., GARAM, TH1, TEPUNG)';
COMMENT ON COLUMN materials.category IS 'Type: ingredient, raw_material, packing_material';
COMMENT ON COLUMN materials.unit IS 'Unit of measurement (kg, ctn, bag, roll, etc.)';
COMMENT ON COLUMN materials.unit_size IS 'Size description (e.g., 25KG, 50KG, 20KG/CTN)';
COMMENT ON COLUMN materials.applies_to IS 'Which product line uses this: mee, bihun, or both';

CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_materials_is_active ON materials(is_active);
CREATE INDEX IF NOT EXISTS idx_materials_applies_to ON materials(applies_to);

-- =====================================================
-- 2. Create material_stock_entries table
-- =====================================================
CREATE TABLE IF NOT EXISTS material_stock_entries (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  product_line VARCHAR(10) NOT NULL CHECK (product_line IN ('mee', 'bihun')),
  quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(10,2) NOT NULL,
  total_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) REFERENCES staffs(id),
  UNIQUE(year, month, material_id, product_line)
);

COMMENT ON TABLE material_stock_entries IS 'Monthly closing stock entries for materials';
COMMENT ON COLUMN material_stock_entries.year IS 'Year of the stock entry';
COMMENT ON COLUMN material_stock_entries.month IS 'Month of the stock entry (1-12)';
COMMENT ON COLUMN material_stock_entries.product_line IS 'Product line: mee or bihun';
COMMENT ON COLUMN material_stock_entries.quantity IS 'Closing stock quantity';
COMMENT ON COLUMN material_stock_entries.unit_cost IS 'Cost per unit at time of entry';
COMMENT ON COLUMN material_stock_entries.total_value IS 'Calculated: quantity * unit_cost';

CREATE INDEX IF NOT EXISTS idx_material_stock_period ON material_stock_entries(year, month);
CREATE INDEX IF NOT EXISTS idx_material_stock_material ON material_stock_entries(material_id);
CREATE INDEX IF NOT EXISTS idx_material_stock_product_line ON material_stock_entries(product_line);

-- =====================================================
-- 3. Seed data for materials
-- =====================================================

-- Ingredients (CS-PU category in old system)
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, applies_to, sort_order) VALUES
('GARAM', 'Garam (Salt)', 'ingredient', 'kg', '25KG', 0.57, 'both', 10),
('GARAM_2', 'Garam 2', 'ingredient', 'kg', '25KG', 0.59, 'both', 11),
('TH1', 'TH-1', 'ingredient', 'ctn', '25KG/CTN', 23.00, 'both', 20),
('SODA_ASH_1', 'Soda Ash (RM120/50KG)', 'ingredient', 'kg', '50KG', 2.40, 'both', 30),
('SODA_ASH_2', 'Soda Ash (RM160/50KG)', 'ingredient', 'kg', '50KG', 3.20, 'both', 31),
('SODIUM_1', 'Sodium Metabisulphite (RM137.5/25KG)', 'ingredient', 'kg', '25KG', 5.50, 'bihun', 40),
('SODIUM_2', 'Sodium Metabisulphite (RM97.50/25KG)', 'ingredient', 'kg', '25KG', 3.90, 'bihun', 41),
('SODIUM_TRIP', 'Sodium Tripolyphosphate', 'ingredient', 'kg', '50KG', 8.60, 'mee', 42),
('TH2', 'TH-2', 'ingredient', 'ctn', '20KG/CTN', 10.80, 'both', 50),
('TH2_2', 'TH-2 (RM196/20KG)', 'ingredient', 'ctn', '20KG/CTN', 9.80, 'both', 51)
ON CONFLICT (code) DO NOTHING;

-- Raw Materials (CS-PM category in old system)
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, applies_to, sort_order) VALUES
('TEPUNG', 'Tepung (Flour)', 'raw_material', 'bag', '500 bags', 65.00, 'both', 100),
('BERAS', 'Beras (Rice)', 'raw_material', 'kg', NULL, 2.50, 'both', 110),
('SAGO', 'Sago', 'raw_material', 'kg', NULL, 3.00, 'both', 120),
('JAGUNG_1', 'Tepung Jagung (HOMCO)', 'raw_material', 'kg', NULL, 54.00, 'bihun', 130),
('JAGUNG_2', 'Tepung Jagung (KONG L/HUAT)', 'raw_material', 'kg', NULL, 54.25, 'bihun', 131),
('JAGUNG_3', 'Tepung Jagung (AGICORE)', 'raw_material', 'kg', NULL, 57.00, 'bihun', 132),
('JAGUNG_4', 'Tepung Jagung (SWEE HIN CHAN)', 'raw_material', 'kg', NULL, 53.00, 'bihun', 133)
ON CONFLICT (code) DO NOTHING;

-- Packing Materials
INSERT INTO materials (code, name, category, unit, unit_size, default_unit_cost, applies_to, sort_order) VALUES
('PM_SMALL', 'Small Plastick', 'packing_material', 'roll', NULL, 0.00, 'both', 200),
('PM_BIG', 'Big Plastick', 'packing_material', 'roll', NULL, 0.00, 'both', 210),
('SELOTAPE', 'Selotape', 'packing_material', 'roll', NULL, 0.00, 'both', 220)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 4. Create trigger to auto-update updated_at
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

DROP TRIGGER IF EXISTS material_stock_entries_updated_at_trigger ON material_stock_entries;
CREATE TRIGGER material_stock_entries_updated_at_trigger
  BEFORE UPDATE ON material_stock_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_materials_updated_at();

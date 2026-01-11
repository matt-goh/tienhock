-- Migration: Green Target Payroll Enhancement
-- File: migrations/003_greentarget_payroll_enhancement.sql
-- Description: Adds pickup destinations, payroll rules, rental add-ons, and new pay codes

-- =====================================================
-- 1. Add pickup_destination to rentals table
-- =====================================================
ALTER TABLE greentarget.rentals
ADD COLUMN IF NOT EXISTS pickup_destination VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN greentarget.rentals.pickup_destination IS 'Destination where dumpster is picked up and sent to (KILANG, MD, MENGGATAL, etc.)';

CREATE INDEX IF NOT EXISTS idx_rentals_pickup_destination ON greentarget.rentals(pickup_destination);

-- =====================================================
-- 2. Create pickup destinations configuration table
-- =====================================================
CREATE TABLE IF NOT EXISTS greentarget.pickup_destinations (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE greentarget.pickup_destinations IS 'Configurable pickup destination options for rentals';

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION greentarget.update_pickup_destinations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pickup_destinations_updated_at ON greentarget.pickup_destinations;
CREATE TRIGGER update_pickup_destinations_updated_at
  BEFORE UPDATE ON greentarget.pickup_destinations
  FOR EACH ROW
  EXECUTE FUNCTION greentarget.update_pickup_destinations_updated_at();

-- Seed default pickup destinations
INSERT INTO greentarget.pickup_destinations (code, name, is_default, sort_order) VALUES
  ('KILANG', 'Kilang', true, 1),
  ('MD', 'Madang', false, 2),
  ('MENGGATAL', 'Menggatal', false, 3)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 3. Create payroll rules configuration table
-- =====================================================
CREATE TABLE IF NOT EXISTS greentarget.payroll_rules (
  id SERIAL PRIMARY KEY,
  rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('PLACEMENT', 'PICKUP')),
  condition_field VARCHAR(50) NOT NULL,
  condition_operator VARCHAR(10) NOT NULL CHECK (condition_operator IN ('<=', '>', '=', '>=', '<', 'ANY')),
  condition_value VARCHAR(100),
  secondary_condition_field VARCHAR(50),
  secondary_condition_operator VARCHAR(10) CHECK (secondary_condition_operator IS NULL OR secondary_condition_operator IN ('<=', '>', '=', '>=', '<', 'ANY')),
  secondary_condition_value VARCHAR(100),
  pay_code_id VARCHAR(50) NOT NULL REFERENCES pay_codes(id),
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE greentarget.payroll_rules IS 'Configurable payroll calculation rules for placement and pickup operations';

CREATE INDEX IF NOT EXISTS idx_payroll_rules_type ON greentarget.payroll_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_payroll_rules_active ON greentarget.payroll_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_payroll_rules_priority ON greentarget.payroll_rules(priority DESC);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION greentarget.update_payroll_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payroll_rules_updated_at ON greentarget.payroll_rules;
CREATE TRIGGER update_payroll_rules_updated_at
  BEFORE UPDATE ON greentarget.payroll_rules
  FOR EACH ROW
  EXECUTE FUNCTION greentarget.update_payroll_rules_updated_at();

-- =====================================================
-- 4. Create rental add-ons table (manual paycodes per rental)
-- =====================================================
CREATE TABLE IF NOT EXISTS greentarget.rental_addons (
  id SERIAL PRIMARY KEY,
  rental_id INTEGER NOT NULL REFERENCES greentarget.rentals(rental_id) ON DELETE CASCADE,
  pay_code_id VARCHAR(50) NOT NULL REFERENCES pay_codes(id),
  quantity DECIMAL(10,2) DEFAULT 1,
  amount DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

COMMENT ON TABLE greentarget.rental_addons IS 'Manual add-on paycodes attached to specific rentals';

CREATE INDEX IF NOT EXISTS idx_rental_addons_rental ON greentarget.rental_addons(rental_id);
CREATE INDEX IF NOT EXISTS idx_rental_addons_paycode ON greentarget.rental_addons(pay_code_id);

-- =====================================================
-- 5. Create manual addon paycodes configuration table
-- =====================================================
CREATE TABLE IF NOT EXISTS greentarget.addon_paycodes (
  id SERIAL PRIMARY KEY,
  pay_code_id VARCHAR(50) NOT NULL REFERENCES pay_codes(id),
  display_name VARCHAR(100) NOT NULL,
  default_amount DECIMAL(10,2) DEFAULT 0,
  is_variable_amount BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE greentarget.addon_paycodes IS 'Configuration for which paycodes are available as manual add-ons';

CREATE INDEX IF NOT EXISTS idx_addon_paycodes_active ON greentarget.addon_paycodes(is_active);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION greentarget.update_addon_paycodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_addon_paycodes_updated_at ON greentarget.addon_paycodes;
CREATE TRIGGER update_addon_paycodes_updated_at
  BEFORE UPDATE ON greentarget.addon_paycodes
  FOR EACH ROW
  EXECUTE FUNCTION greentarget.update_addon_paycodes_updated_at();

-- =====================================================
-- 6. Create new pay codes for Green Target
-- =====================================================
INSERT INTO pay_codes (id, description, pay_type, rate_unit, rate_biasa, rate_ahad, rate_umum, is_active, requires_units_input) VALUES
  -- Pickup destination-based codes
  ('GT_TRIP20', 'GT TRIP RM20 (KILANG <=200 / MENGGATAL)', 'Tambahan', 'Trip', 20.00, 20.00, 20.00, true, true),
  ('GT_TRIP25', 'GT TRIP RM25 (KILANG >200)', 'Tambahan', 'Trip', 25.00, 25.00, 25.00, true, true),
  ('GT_TRIP30', 'GT TRIP RM30 (MD)', 'Tambahan', 'Trip', 30.00, 30.00, 30.00, true, true),
  -- Manual add-on codes
  ('GT_HTRB', 'GT HANTAR BARANG', 'Tambahan', 'Trip', 15.00, 15.00, 15.00, true, true),
  ('GT_1BERAS', 'GT 1 BERAS (1 TONG)', 'Tambahan', 'Fixed', 20.00, 20.00, 20.00, true, false),
  ('GT_2BERAS', 'GT 2 BERAS (2 TONG)', 'Tambahan', 'Fixed', 30.00, 30.00, 30.00, true, false),
  ('GT_KILANG_MINYAK', 'GT KILANG MINYAK', 'Tambahan', 'Fixed', 10.00, 10.00, 10.00, true, false),
  ('GT_MGGT_MINYAK', 'GT MENGGATAL MINYAK', 'Tambahan', 'Fixed', 10.00, 10.00, 10.00, true, false),
  ('GT_TLAIN', 'GT MUATAN/SISA LAIN', 'Tambahan', 'Fixed', 0.00, 0.00, 0.00, true, false)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  rate_biasa = EXCLUDED.rate_biasa,
  rate_ahad = EXCLUDED.rate_ahad,
  rate_umum = EXCLUDED.rate_umum,
  is_active = EXCLUDED.is_active;

-- =====================================================
-- 7. Seed payroll rules
-- =====================================================
-- PLACEMENT Rules (based on invoice amount only)
INSERT INTO greentarget.payroll_rules (rule_type, condition_field, condition_operator, condition_value, pay_code_id, priority, description) VALUES
  ('PLACEMENT', 'invoice_amount', '<=', '180', 'TRIP5', 10, 'Placement: Invoice <= RM180 gets TRIP5'),
  ('PLACEMENT', 'invoice_amount', '>', '180', 'TRIP10', 20, 'Placement: Invoice > RM180 gets TRIP10')
ON CONFLICT DO NOTHING;

-- PICKUP Rules (based on destination and invoice amount)
INSERT INTO greentarget.payroll_rules (rule_type, condition_field, condition_operator, condition_value, secondary_condition_field, secondary_condition_operator, secondary_condition_value, pay_code_id, priority, description) VALUES
  ('PICKUP', 'destination', '=', 'KILANG', 'invoice_amount', '<=', '200', 'GT_TRIP20', 10, 'Pickup KILANG: Invoice <= RM200 gets TRIP20'),
  ('PICKUP', 'destination', '=', 'KILANG', 'invoice_amount', '>', '200', 'GT_TRIP25', 20, 'Pickup KILANG: Invoice > RM200 gets TRIP25'),
  ('PICKUP', 'destination', '=', 'MD', NULL, NULL, NULL, 'GT_TRIP30', 30, 'Pickup MD: Always TRIP30'),
  ('PICKUP', 'destination', '=', 'MENGGATAL', NULL, NULL, NULL, 'GT_TRIP20', 40, 'Pickup MENGGATAL: Always TRIP20')
ON CONFLICT DO NOTHING;

-- =====================================================
-- 8. Seed addon paycodes configuration
-- =====================================================
INSERT INTO greentarget.addon_paycodes (pay_code_id, display_name, default_amount, is_variable_amount, sort_order) VALUES
  ('GT_HTRB', 'Hantar Barang (HTRB)', 15.00, false, 1),
  ('GT_1BERAS', '1 Beras (1 Tong)', 20.00, false, 2),
  ('GT_2BERAS', '2 Beras (2 Tong)', 30.00, false, 3),
  ('GT_KILANG_MINYAK', 'Kilang Minyak', 10.00, false, 4),
  ('GT_MGGT_MINYAK', 'Menggatal Minyak', 10.00, false, 5),
  ('GT_TLAIN', 'Muatan/Sisa Lain', 0.00, true, 6)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 9. Enhance payroll_items for tracking
-- =====================================================
ALTER TABLE greentarget.payroll_items
ADD COLUMN IF NOT EXISTS rental_id INTEGER REFERENCES greentarget.rentals(rental_id),
ADD COLUMN IF NOT EXISTS operation_type VARCHAR(20) CHECK (operation_type IS NULL OR operation_type IN ('PLACEMENT', 'PICKUP', 'ADDON')),
ADD COLUMN IF NOT EXISTS has_invoice BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS invoice_amount DECIMAL(10,2);

CREATE INDEX IF NOT EXISTS idx_payroll_items_rental ON greentarget.payroll_items(rental_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_operation ON greentarget.payroll_items(operation_type);

-- =====================================================
-- 10. Add payroll settings table for configurable defaults
-- =====================================================
CREATE TABLE IF NOT EXISTS greentarget.payroll_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE greentarget.payroll_settings IS 'Global payroll settings and defaults';

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION greentarget.update_payroll_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payroll_settings_updated_at ON greentarget.payroll_settings;
CREATE TRIGGER update_payroll_settings_updated_at
  BEFORE UPDATE ON greentarget.payroll_settings
  FOR EACH ROW
  EXECUTE FUNCTION greentarget.update_payroll_settings_updated_at();

-- Seed default settings
INSERT INTO greentarget.payroll_settings (setting_key, setting_value, description) VALUES
  ('default_invoice_amount', '200', 'Default invoice amount to use when rental has no invoice'),
  ('default_pickup_destination', 'KILANG', 'Default pickup destination code')
ON CONFLICT (setting_key) DO NOTHING;

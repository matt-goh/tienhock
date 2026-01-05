-- Account Code Mapping Enhancement Migration
-- Date: 2026-01-06
-- Description: Adds MEE/BH commission split, cuti tahunan accounts, and related mappings

-- ============================================================================
-- 1. Create MCTB_* account codes for Cuti Tahunan (using GL ledger type)
-- ============================================================================
INSERT INTO account_codes (code, description, ledger_type, is_active, is_system)
VALUES
  ('MCTB_O', 'Cuti Tahunan - Office', 'GL', true, false),
  ('MCTB_SM', 'Cuti Tahunan - Salesman', 'GL', true, false),
  ('MCTB_IL', 'Cuti Tahunan - Ikut Lori', 'GL', true, false),
  ('MCTB_JB', 'Cuti Tahunan - Jaga Boiler', 'GL', true, false),
  ('MCTB_MM', 'Cuti Tahunan - Mesin Mee', 'GL', true, false),
  ('MCTB_PM', 'Cuti Tahunan - Packing Mee', 'GL', true, false),
  ('MCTB_MB', 'Cuti Tahunan - Mesin Bihun', 'GL', true, false),
  ('MCTB_PB', 'Cuti Tahunan - Packing Bihun', 'GL', true, false),
  ('MCTB_TS', 'Cuti Tahunan - Tukang Sapu', 'GL', true, false),
  ('MCTB_M', 'Cuti Tahunan - Maintenance', 'GL', true, false)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. Commission MEE/BH mappings for Location 03 (SALESMAN)
-- ============================================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('03', 'SALESMAN', 'commission_mee', 'MS_SM', 'JVSL', true),
  ('03', 'SALESMAN', 'commission_bh', 'BS_SM', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Commission MEE/BH mappings for Location 04 (IKUT LORI)
-- ============================================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('04', 'IKUT LORI', 'commission_mee', 'MS_IL', 'JVSL', true),
  ('04', 'IKUT LORI', 'commission_bh', 'BS_IL', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. Deactivate old single commission mappings for locations 03 and 04
-- ============================================================================
UPDATE location_account_mappings
SET is_active = false
WHERE location_id IN ('03', '04')
  AND mapping_type = 'commission'
  AND voucher_type = 'JVSL';

-- ============================================================================
-- 5. Cuti Tahunan mappings for all applicable locations
-- ============================================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('02', 'OFFICE', 'cuti_tahunan', 'MCTB_O', 'JVSL', true),
  ('03', 'SALESMAN', 'cuti_tahunan', 'MCTB_SM', 'JVSL', true),
  ('04', 'IKUT LORI', 'cuti_tahunan', 'MCTB_IL', 'JVSL', true),
  ('06', 'JAGA BOILER', 'cuti_tahunan', 'MCTB_JB', 'JVSL', true),
  ('07', 'MESIN & SANGKUT MEE', 'cuti_tahunan', 'MCTB_MM', 'JVSL', true),
  ('08', 'PACKING MEE', 'cuti_tahunan', 'MCTB_PM', 'JVSL', true),
  ('09', 'MESIN BIHUN', 'cuti_tahunan', 'MCTB_MB', 'JVSL', true),
  ('11', 'PACKING BIHUN', 'cuti_tahunan', 'MCTB_PB', 'JVSL', true),
  ('13', 'TUKANG SAPU', 'cuti_tahunan', 'MCTB_TS', 'JVSL', true),
  ('14', 'KILANG KERJA LUAR', 'cuti_tahunan', 'MCTB_M', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Verification queries (run after migration to confirm changes)
-- ============================================================================
-- SELECT code, description, ledger_type FROM account_codes WHERE code LIKE 'MCTB_%';
-- SELECT location_id, location_name, mapping_type, account_code, is_active
-- FROM location_account_mappings
-- WHERE mapping_type IN ('commission_mee', 'commission_bh', 'cuti_tahunan', 'commission')
--   AND voucher_type = 'JVSL'
-- ORDER BY location_id, mapping_type;

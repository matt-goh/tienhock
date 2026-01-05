-- Location Account Mappings Seed Data
-- Generated based on verified JVDR/JVSL voucher analysis

-- Clear existing mappings (if needed)
-- DELETE FROM location_account_mappings;

-- ================================================
-- JVDR - Location 01 (Director's Remuneration)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('01', 'DIRECTOR''S REMUNERATION', 'salary', 'MBDRS', 'JVDR', true),
  ('01', 'DIRECTOR''S REMUNERATION', 'epf_employer', 'MBDRE', 'JVDR', true),
  ('01', 'DIRECTOR''S REMUNERATION', 'socso_employer', 'MBDRSC', 'JVDR', true),
  ('01', 'DIRECTOR''S REMUNERATION', 'sip_employer', 'MBDRSIP', 'JVDR', true),
  ('01', 'DIRECTOR''S REMUNERATION', 'accrual_salary', 'ACD_SAL', 'JVDR', true),
  ('01', 'DIRECTOR''S REMUNERATION', 'accrual_epf', 'ACD_EPF', 'JVDR', true),
  ('01', 'DIRECTOR''S REMUNERATION', 'accrual_socso', 'ACD_SC', 'JVDR', true),
  ('01', 'DIRECTOR''S REMUNERATION', 'accrual_sip', 'ACD_SIP', 'JVDR', true),
  ('01', 'DIRECTOR''S REMUNERATION', 'accrual_pcb', 'ACD_PCB', 'JVDR', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 00 (Staff Accruals)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('00', 'ACCRUALS', 'accrual_salary', 'ACW_SAL', 'JVSL', true),
  ('00', 'ACCRUALS', 'accrual_epf', 'ACW_EPF', 'JVSL', true),
  ('00', 'ACCRUALS', 'accrual_socso', 'ACW_SC', 'JVSL', true),
  ('00', 'ACCRUALS', 'accrual_sip', 'ACW_SIP', 'JVSL', true),
  ('00', 'ACCRUALS', 'accrual_pcb', 'ACW_PCB', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 02 (Office)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('02', 'OFFICE', 'salary', 'MBS_O', 'JVSL', true),
  ('02', 'OFFICE', 'overtime', 'MBS_O', 'JVSL', true),
  ('02', 'OFFICE', 'bonus', 'MBS_O', 'JVSL', true),
  ('02', 'OFFICE', 'rounding', 'MBS_O', 'JVSL', true),
  ('02', 'OFFICE', 'epf_employer', 'MBE_O', 'JVSL', true),
  ('02', 'OFFICE', 'socso_employer', 'MBSC_O', 'JVSL', true),
  ('02', 'OFFICE', 'sip_employer', 'MBSIP_O', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 03 (Salesman)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('03', 'SALESMAN', 'salary', 'MBS_SMO', 'JVSL', true),
  ('03', 'SALESMAN', 'commission', 'MS_SM', 'JVSL', true),
  ('03', 'SALESMAN', 'bonus', 'MS_SM', 'JVSL', true),
  ('03', 'SALESMAN', 'rounding', 'MS_SM', 'JVSL', true),
  ('03', 'SALESMAN', 'epf_employer', 'MBE_SM', 'JVSL', true),
  ('03', 'SALESMAN', 'socso_employer', 'MBSC_SM', 'JVSL', true),
  ('03', 'SALESMAN', 'sip_employer', 'MBSIP_SM', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 04 (Ikut Lori)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('04', 'IKUT LORI', 'salary', 'MBS_ILO', 'JVSL', true),
  ('04', 'IKUT LORI', 'commission', 'MS_IL', 'JVSL', true),
  ('04', 'IKUT LORI', 'rounding', 'MS_IL', 'JVSL', true),
  ('04', 'IKUT LORI', 'epf_employer', 'MBE_IL', 'JVSL', true),
  ('04', 'IKUT LORI', 'socso_employer', 'MBSC_IL', 'JVSL', true),
  ('04', 'IKUT LORI', 'sip_employer', 'MBSIP_IL', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 06 (Jaga Boiler)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('06', 'JAGA BOILER', 'salary', 'MBS_JB', 'JVSL', true),
  ('06', 'JAGA BOILER', 'overtime', 'MBS_JB', 'JVSL', true),
  ('06', 'JAGA BOILER', 'rounding', 'MBS_JB', 'JVSL', true),
  ('06', 'JAGA BOILER', 'epf_employer', 'MBE_JB', 'JVSL', true),
  ('06', 'JAGA BOILER', 'socso_employer', 'MBSC_JB', 'JVSL', true),
  ('06', 'JAGA BOILER', 'sip_employer', 'MBSIP_JB', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 07 (Mesin & Sangkut Mee)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('07', 'MESIN & SANGKUT MEE', 'salary', 'MS_MM', 'JVSL', true),
  ('07', 'MESIN & SANGKUT MEE', 'overtime', 'MS_MM', 'JVSL', true),
  ('07', 'MESIN & SANGKUT MEE', 'rounding', 'MS_MM', 'JVSL', true),
  ('07', 'MESIN & SANGKUT MEE', 'epf_employer', 'ME_MM', 'JVSL', true),
  ('07', 'MESIN & SANGKUT MEE', 'socso_employer', 'MSC_MM', 'JVSL', true),
  ('07', 'MESIN & SANGKUT MEE', 'sip_employer', 'MBSIP_MM', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 08 (Packing Mee)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('08', 'PACKING MEE', 'salary', 'MS_PM', 'JVSL', true),
  ('08', 'PACKING MEE', 'overtime', 'MS_PM', 'JVSL', true),
  ('08', 'PACKING MEE', 'rounding', 'MS_PM', 'JVSL', true),
  ('08', 'PACKING MEE', 'epf_employer', 'ME_PM', 'JVSL', true),
  ('08', 'PACKING MEE', 'socso_employer', 'MSC_PM', 'JVSL', true),
  ('08', 'PACKING MEE', 'sip_employer', 'MBSIP_PM', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 09 (Mesin Bihun)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('09', 'MESIN & SANGKUT BIHUN', 'salary', 'BS_MB', 'JVSL', true),
  ('09', 'MESIN & SANGKUT BIHUN', 'overtime', 'BS_MB', 'JVSL', true),
  ('09', 'MESIN & SANGKUT BIHUN', 'rounding', 'BS_MB', 'JVSL', true),
  ('09', 'MESIN & SANGKUT BIHUN', 'epf_employer', 'BE_MB', 'JVSL', true),
  ('09', 'MESIN & SANGKUT BIHUN', 'socso_employer', 'BSC_MB', 'JVSL', true),
  ('09', 'MESIN & SANGKUT BIHUN', 'sip_employer', 'BSIP_MB', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 10 (Sangkut Bihun) - Combined with Location 09
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('10', 'SANGKUT BIHUN', 'salary', 'BS_MB', 'JVSL', true),
  ('10', 'SANGKUT BIHUN', 'overtime', 'BS_MB', 'JVSL', true),
  ('10', 'SANGKUT BIHUN', 'rounding', 'BS_MB', 'JVSL', true),
  ('10', 'SANGKUT BIHUN', 'epf_employer', 'BE_MB', 'JVSL', true),
  ('10', 'SANGKUT BIHUN', 'socso_employer', 'BSC_MB', 'JVSL', true),
  ('10', 'SANGKUT BIHUN', 'sip_employer', 'BSIP_MB', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 11 (Packing Bihun)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('11', 'PACKING BIHUN', 'salary', 'BS_PB', 'JVSL', true),
  ('11', 'PACKING BIHUN', 'overtime', 'BS_PB', 'JVSL', true),
  ('11', 'PACKING BIHUN', 'rounding', 'BS_PB', 'JVSL', true),
  ('11', 'PACKING BIHUN', 'epf_employer', 'BE_PB', 'JVSL', true),
  ('11', 'PACKING BIHUN', 'socso_employer', 'BSC_PB', 'JVSL', true),
  ('11', 'PACKING BIHUN', 'sip_employer', 'BSIP_PB', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 13 (Tukang Sapu)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('13', 'TUKANG SAPU', 'salary', 'MBS_TS', 'JVSL', true),
  ('13', 'TUKANG SAPU', 'overtime', 'MBS_TS', 'JVSL', true),
  ('13', 'TUKANG SAPU', 'rounding', 'MBS_TS', 'JVSL', true),
  ('13', 'TUKANG SAPU', 'epf_employer', 'MBE_TS', 'JVSL', true),
  ('13', 'TUKANG SAPU', 'socso_employer', 'MBSC_TS', 'JVSL', true),
  ('13', 'TUKANG SAPU', 'sip_employer', 'MBSIP_TS', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Location 14 (Maintenance/Kerja Luar)
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  ('14', 'MAINTENANCE', 'salary', 'MBS_M', 'JVSL', true),
  ('14', 'MAINTENANCE', 'overtime', 'MBS_M', 'JVSL', true),
  ('14', 'MAINTENANCE', 'rounding', 'MBS_M', 'JVSL', true),
  ('14', 'MAINTENANCE', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('14', 'MAINTENANCE', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('14', 'MAINTENANCE', 'sip_employer', 'MBSIP_M', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- ================================================
-- JVSL - Locations 16-24 (Commission/Bonus/Cuti/Special OT)
-- All use Maintenance account codes
-- ================================================
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  -- Location 16 - Comm-Mesin Mee
  ('16', 'COMM-MESIN MEE', 'salary', 'MBS_M', 'JVSL', true),
  ('16', 'COMM-MESIN MEE', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('16', 'COMM-MESIN MEE', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('16', 'COMM-MESIN MEE', 'sip_employer', 'MBSIP_M', 'JVSL', true),
  -- Location 17 - Comm-Mesin Bihun
  ('17', 'COMM-MESIN BIHUN', 'salary', 'MBS_M', 'JVSL', true),
  ('17', 'COMM-MESIN BIHUN', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('17', 'COMM-MESIN BIHUN', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('17', 'COMM-MESIN BIHUN', 'sip_employer', 'MBSIP_M', 'JVSL', true),
  -- Location 18 - Comm-Kilang
  ('18', 'COMM-KILANG', 'salary', 'MBS_M', 'JVSL', true),
  ('18', 'COMM-KILANG', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('18', 'COMM-KILANG', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('18', 'COMM-KILANG', 'sip_employer', 'MBSIP_M', 'JVSL', true),
  -- Location 19 - Comm-Lori
  ('19', 'COMM-LORI', 'salary', 'MBS_M', 'JVSL', true),
  ('19', 'COMM-LORI', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('19', 'COMM-LORI', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('19', 'COMM-LORI', 'sip_employer', 'MBSIP_M', 'JVSL', true),
  -- Location 20 - Comm-Boiler
  ('20', 'COMM-BOILER', 'salary', 'MBS_M', 'JVSL', true),
  ('20', 'COMM-BOILER', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('20', 'COMM-BOILER', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('20', 'COMM-BOILER', 'sip_employer', 'MBSIP_M', 'JVSL', true),
  -- Location 21 - Comm-Forklift/Case
  ('21', 'COMM-FORKLIFT/CASE', 'salary', 'MBS_M', 'JVSL', true),
  ('21', 'COMM-FORKLIFT/CASE', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('21', 'COMM-FORKLIFT/CASE', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('21', 'COMM-FORKLIFT/CASE', 'sip_employer', 'MBSIP_M', 'JVSL', true),
  -- Location 22 - Bonus
  ('22', 'BONUS', 'salary', 'MBS_M', 'JVSL', true),
  ('22', 'BONUS', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('22', 'BONUS', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('22', 'BONUS', 'sip_employer', 'MBSIP_M', 'JVSL', true),
  -- Location 23 - Cuti Tahunan
  ('23', 'CUTI TAHUNAN', 'salary', 'MBS_M', 'JVSL', true),
  ('23', 'CUTI TAHUNAN', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('23', 'CUTI TAHUNAN', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('23', 'CUTI TAHUNAN', 'sip_employer', 'MBSIP_M', 'JVSL', true),
  -- Location 24 - Special OT
  ('24', 'SPECIAL OT', 'salary', 'MBS_M', 'JVSL', true),
  ('24', 'SPECIAL OT', 'epf_employer', 'MBE_M', 'JVSL', true),
  ('24', 'SPECIAL OT', 'socso_employer', 'MBSC_M', 'JVSL', true),
  ('24', 'SPECIAL OT', 'sip_employer', 'MBSIP_M', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- Verify the insertions
SELECT voucher_type, COUNT(*) as count
FROM location_account_mappings
GROUP BY voucher_type
ORDER BY voucher_type;

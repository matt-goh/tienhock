-- Migration: Cleanup Invalid Account Mappings
-- Date: 2026-01-06
-- Description: Remove rounding and MCTB* account codes that don't exist in the reference PDF
--              (payroll_trasnfer_to_journal(accounting).pdf)
-- Also documents the commission split mappings (commission_mee, commission_bh)

-- ============================================================
-- Part 1: Delete ROUNDING mappings (12 rows)
-- Reason: Rounding is no longer used in the new payroll system.
--         All payments are via bank transfer with exact amounts.
-- ============================================================

DELETE FROM location_account_mappings
WHERE mapping_type = 'rounding';

-- Expected: 12 rows deleted
-- Affected account codes: Various rounding codes for each location

-- ============================================================
-- Part 2: Delete MCTB_* mappings (10 rows)
-- Reason: These account codes were incorrectly added and do not
--         exist in the reference PDF. Cuti Tahunan should use
--         MBS_M (Cuti Tahunan & Bonus) only.
-- ============================================================

DELETE FROM location_account_mappings
WHERE account_code LIKE 'MCTB%';

-- Expected: 10 rows deleted
-- Deleted account codes:
--   MCTB_O   - Cuti Tahunan - Office
--   MCTB_SM  - Cuti Tahunan - Salesman
--   MCTB_IL  - Cuti Tahunan - Ikut Lori
--   MCTB_JB  - Cuti Tahunan - Jaga Boiler
--   MCTB_MM  - Cuti Tahunan - Mesin Mee
--   MCTB_PM  - Cuti Tahunan - Packing Mee
--   MCTB_MB  - Cuti Tahunan - Mesin Bihun
--   MCTB_PB  - Cuti Tahunan - Packing Bihun
--   MCTB_TS  - Cuti Tahunan - Tukang Sapu
--   MCTB_M   - Cuti Tahunan - Maintenance

-- ============================================================
-- Verification Queries
-- ============================================================

-- Verify no rounding mappings remain:
-- SELECT COUNT(*) FROM location_account_mappings WHERE mapping_type = 'rounding';
-- Expected: 0

-- Verify no MCTB* codes remain:
-- SELECT COUNT(*) FROM location_account_mappings WHERE account_code LIKE 'MCTB%';
-- Expected: 0

-- List remaining cuti_tahunan mappings (should only be MBS_M):
-- SELECT * FROM location_account_mappings WHERE mapping_type = 'cuti_tahunan';

-- ============================================================
-- Part 3: Commission Split Mappings (Already Exist)
-- These mappings were previously created for MEE/BH commission split.
-- ============================================================

-- Existing commission split mappings (for reference):
-- MS_SM with commission_mee (location 03 SALESMAN)
-- BS_SM with commission_bh (location 03 SALESMAN)
-- MS_IL with commission_mee (location 04 IKUT LORI)
-- BS_IL with commission_bh (location 04 IKUT LORI)

-- Old 'commission' mappings were deactivated:
-- UPDATE location_account_mappings SET is_active = false
-- WHERE mapping_type = 'commission' AND account_code IN ('MS_SM', 'MS_IL');

-- Verify commission split mappings:
-- SELECT account_code, mapping_type, location_id, location_name, is_active
-- FROM location_account_mappings
-- WHERE mapping_type IN ('commission_mee', 'commission_bh')
-- ORDER BY location_id, mapping_type;

-- ============================================================
-- Part 4: Overtime Mappings for Salesman/Ikut Lori
-- Date: 2026-01-06
-- Reason: Salary and overtime are now separate line items in JVSL.
--         Salesman/Ikut Lori salary (non-commission) goes to *_O accounts.
-- ============================================================

-- Add overtime mapping for Salesman (uses same account as salary per PDF format)
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES ('03', 'SALESMAN', 'overtime', 'MBS_SMO', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- Add overtime mapping for Ikut Lori (uses same account as salary per PDF format)
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES ('04', 'IKUT LORI', 'overtime', 'MBS_ILO', 'JVSL', true)
ON CONFLICT DO NOTHING;

-- Verify salary/overtime mappings for Salesman and Ikut Lori:
-- SELECT location_id, location_name, mapping_type, account_code
-- FROM location_account_mappings
-- WHERE location_id IN ('03', '04') AND voucher_type = 'JVSL'
--   AND mapping_type IN ('salary', 'overtime')
-- ORDER BY location_id, mapping_type;

-- ============================================================
-- Part 5: Add 'Bill' Rate Unit to pay_codes Constraint
-- Date: 2026-01-06
-- Reason: Added 'Bill' as a new rate unit type that works
--         identically to 'Hour' (hours-based calculation).
--         Also added 'Trip' which was missing from the constraint.
-- ============================================================

ALTER TABLE pay_codes DROP CONSTRAINT pay_codes_rate_unit_check;
ALTER TABLE pay_codes ADD CONSTRAINT pay_codes_rate_unit_check
  CHECK (rate_unit IN ('Hour', 'Bill', 'Day', 'Bag', 'Trip', 'Fixed', 'Percent'));

-- Verify constraint was updated:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname = 'pay_codes_rate_unit_check';

ALTER TABLE daily_work_log_entries
ADD COLUMN IF NOT EXISTS is_doubled BOOLEAN DEFAULT FALSE;

INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('1-2UDG', 'DME-2UDG'),
('1-3UDG', 'DME-3UDG'),
('1-350G', 'DME-350G'),
('1-MNL', 'DME-MNL'),
('2-APPLE', 'DME-300G'),
('2-BH', 'DME-300G'),
('2-BH2', 'DME-2H'),
('2-BCM3', 'DME-600G'),
('2-BNL', 'DME-3.1KG'),
('2-BNL(5)', 'DME-5KG'),
('2-MASAK', 'DME-300G'),
('2-PADI', 'DME-300G'),
('WE-2UDG', 'DWE-2UDG'),
('WE-3UDG', 'DWE-3UDG'),
('WE-300G', 'DWE-300G'),
('WE-360', 'DWE-350G'),
('WE-360(5PK)', 'DWE-350G'),
('WE-420', 'DWE-420G'),
('WE-600G', 'DWE-600G'),
('WE-MNL', 'DWE-MNL')
ON CONFLICT DO NOTHING;

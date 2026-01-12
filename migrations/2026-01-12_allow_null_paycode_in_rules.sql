-- Migration: Allow NULL pay_code_id in payroll_rules and addon_paycodes
-- Date: 2026-01-12
-- Description: Allows rules and addon paycodes to exist without a pay_code_id mapping,
--              enabling future assignment of paycodes to existing rules

-- Step 1: Alter payroll_rules to allow NULL pay_code_id
ALTER TABLE greentarget.payroll_rules
  ALTER COLUMN pay_code_id DROP NOT NULL;

-- Step 2: Alter addon_paycodes to allow NULL pay_code_id
ALTER TABLE greentarget.addon_paycodes
  ALTER COLUMN pay_code_id DROP NOT NULL;

-- Step 3: Remove GT_ paycodes that were previously used (cleanup)
-- Note: This is safe because we're making pay_code_id nullable first
DELETE FROM greentarget.addon_paycodes WHERE pay_code_id LIKE 'GT_%';
DELETE FROM greentarget.payroll_rules WHERE pay_code_id LIKE 'GT_%';
DELETE FROM pay_codes WHERE id LIKE 'GT_%';

-- Step 4: Recreate PICKUP rules without pay_code_id mappings (for future assignment)
INSERT INTO greentarget.payroll_rules (rule_type, condition_field, condition_operator, condition_value, secondary_condition_field, secondary_condition_operator, secondary_condition_value, pay_code_id, priority, is_active, description)
VALUES
  ('PICKUP', 'destination', '=', 'TH', 'invoice_amount', '>', '200', NULL, 20, true, 'Pickup TH: Invoice > RM200'),
  ('PICKUP', 'destination', '=', 'MD', NULL, NULL, NULL, NULL, 10, true, 'Pickup MD'),
  ('PICKUP', 'destination', '=', 'MENGGATAL', NULL, NULL, NULL, NULL, 10, true, 'Pickup MENGGATAL'),
  ('PICKUP', 'destination', '=', 'KILANG', 'invoice_amount', '<=', '200', NULL, 20, true, 'Pickup KILANG: Invoice <= RM200');

-- Step 5: Recreate addon paycodes without pay_code_id mappings (for future assignment)
INSERT INTO greentarget.addon_paycodes (pay_code_id, display_name, default_amount, is_variable_amount, sort_order, is_active)
VALUES
  (NULL, 'Hantar Barang', 0, true, 1, true),
  (NULL, '1 Beras (1 Tong)', 0, false, 2, true),
  (NULL, '2 Beras (2 Tong)', 0, false, 3, true),
  (NULL, 'TH Minyak', 0, false, 4, true),
  (NULL, 'Menggatal Minyak', 0, false, 5, true),
  (NULL, 'Kilang Minyak', 0, false, 6, true),
  (NULL, 'Muatan/Sisa Lain', 0, true, 7, true);

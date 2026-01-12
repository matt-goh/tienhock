-- Remove GT_ paycodes and update payroll system
-- Step 1: Delete addon paycodes that reference GT_ paycodes
DELETE FROM greentarget.addon_paycodes WHERE pay_code_id LIKE 'GT_%';

-- Step 2: Delete payroll rules that use GT_ paycodes
DELETE FROM greentarget.payroll_rules WHERE pay_code_id LIKE 'GT_%';

-- Step 3: Delete GT_ paycodes from pay_codes table
DELETE FROM pay_codes WHERE id LIKE 'GT_%';

-- Verify the deletions
SELECT 'Remaining GT_ paycodes:' as info, COUNT(*) as count FROM pay_codes WHERE id LIKE 'GT_%'
UNION ALL
SELECT 'Remaining GT_ addon paycodes:', COUNT(*) FROM greentarget.addon_paycodes WHERE pay_code_id LIKE 'GT_%'
UNION ALL
SELECT 'Rules with GT_ paycodes:', COUNT(*) FROM greentarget.payroll_rules WHERE pay_code_id LIKE 'GT_%'
UNION ALL
SELECT 'Total remaining rules:', COUNT(*) FROM greentarget.payroll_rules;

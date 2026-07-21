-- 2026-07-21: Revert the July-2026 OT salary-formula metadata.
-- The OT formula is being removed; OT reverts to configured rate × OT hours.
-- Safe DROPs (IF EXISTS); dev data footprint is only 11 ot_calculation snapshots.
BEGIN;

ALTER TABLE public.staffs                      DROP COLUMN IF EXISTS ot_pay_basis;
ALTER TABLE jellypolly.staffs                  DROP COLUMN IF EXISTS ot_pay_basis;

ALTER TABLE public.pay_codes                   DROP COLUMN IF EXISTS ot_rate_mode;
ALTER TABLE jellypolly.pay_codes               DROP COLUMN IF EXISTS ot_rate_mode;

ALTER TABLE public.monthly_work_log_entries      DROP COLUMN IF EXISTS worked_days;
ALTER TABLE greentarget.monthly_work_log_entries DROP COLUMN IF EXISTS worked_days;
ALTER TABLE jellypolly.monthly_work_log_entries  DROP COLUMN IF EXISTS worked_days;

ALTER TABLE public.employee_payrolls           DROP COLUMN IF EXISTS ot_calculation;
ALTER TABLE greentarget.employee_payrolls      DROP COLUMN IF EXISTS ot_calculation;
ALTER TABLE jellypolly.employee_payrolls       DROP COLUMN IF EXISTS ot_calculation;

COMMIT;

-- 2026-07-19: Payroll OT salary-formula metadata (effective payroll month July 2026)
-- Handover: docs/PAYROLL_OT_CALCULATION_JULY_2026_HANDOVER.md (decisions 4, 5, 10, 15, 16)
--
-- Adds ONLY classification/audit columns. No data is modified; no payroll is
-- reprocessed by this migration (decision 3: users trigger reprocessing).
--
-- 1) staffs.ot_pay_basis            (TH/GT via public.staffs; JP via jellypolly.staffs)
--    'monthly_26'  -> OT numerator / 26 / 8
--    'actual_days' -> OT numerator / actual worked days / 8
--    NULL          -> unclassified; July-2026+ processing BLOCKS the employee
--                     with a clear error if they have formula OT hours (decision 15).
-- 2) pay_codes.ot_rate_mode         (public + jellypolly)
--    'salary_formula' (default) -> Overtime Hour items are priced by the derived
--                                  monthly rate for July 2026+ payrolls
--    'fixed'                    -> keep configured/keyed rates (special payments)
--    Only consulted for pay_type = 'Overtime' AND rate_unit = 'Hour'; other OT
--    codes (Day/Fixed/zero-rate placeholders) always keep their own amounts.
-- 3) monthly_work_log_entries.worked_days (public + greentarget + jellypolly)
--    Manual worked-days input for actual_days employees whose hours are logged
--    only in monthly aggregate (dates are not reconstructible; decision 5).
-- 4) employee_payrolls.ot_calculation (public + greentarget + jellypolly)
--    JSONB audit snapshot of the month's OT rate derivation (formula version,
--    numerator breakdown, divisor, rates) written at processing time.

BEGIN;

-- 1) Employee OT pay basis ---------------------------------------------------
ALTER TABLE public.staffs
  ADD COLUMN IF NOT EXISTS ot_pay_basis varchar(20)
  CHECK (ot_pay_basis IN ('monthly_26', 'actual_days'));

ALTER TABLE jellypolly.staffs
  ADD COLUMN IF NOT EXISTS ot_pay_basis varchar(20)
  CHECK (ot_pay_basis IN ('monthly_26', 'actual_days'));

-- 2) Pay-code OT rate mode ---------------------------------------------------
ALTER TABLE public.pay_codes
  ADD COLUMN IF NOT EXISTS ot_rate_mode varchar(20) NOT NULL DEFAULT 'salary_formula'
  CHECK (ot_rate_mode IN ('salary_formula', 'fixed'));

ALTER TABLE jellypolly.pay_codes
  ADD COLUMN IF NOT EXISTS ot_rate_mode varchar(20) NOT NULL DEFAULT 'salary_formula'
  CHECK (ot_rate_mode IN ('salary_formula', 'fixed'));

-- 3) Worked-days input on monthly work-log entries ---------------------------
ALTER TABLE public.monthly_work_log_entries
  ADD COLUMN IF NOT EXISTS worked_days numeric(4,1)
  CHECK (worked_days IS NULL OR (worked_days > 0 AND worked_days <= 31));

ALTER TABLE greentarget.monthly_work_log_entries
  ADD COLUMN IF NOT EXISTS worked_days numeric(4,1)
  CHECK (worked_days IS NULL OR (worked_days > 0 AND worked_days <= 31));

ALTER TABLE jellypolly.monthly_work_log_entries
  ADD COLUMN IF NOT EXISTS worked_days numeric(4,1)
  CHECK (worked_days IS NULL OR (worked_days > 0 AND worked_days <= 31));

-- 4) Per-employee/month OT calculation snapshot ------------------------------
ALTER TABLE public.employee_payrolls
  ADD COLUMN IF NOT EXISTS ot_calculation jsonb;

ALTER TABLE greentarget.employee_payrolls
  ADD COLUMN IF NOT EXISTS ot_calculation jsonb;

ALTER TABLE jellypolly.employee_payrolls
  ADD COLUMN IF NOT EXISTS ot_calculation jsonb;

COMMIT;

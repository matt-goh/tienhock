-- 2026-08-05: Green Target employee pay-rate overrides.
--
-- GT payroll currently reads the SHARED Tien Hock (public schema) pay-rate
-- rows (public.employee_pay_codes / public.pay_rate_schedules), so a staff
-- member on both companies' payrolls (e.g. directors GOH and WONG) cannot
-- have different rates per company. These two tables are the GT-scoped
-- override set: the staff and pay-code catalogues stay shared
-- (public.staffs / public.pay_codes), only the per-employee overrides and
-- scheduled rate changes are GT-scoped.
--
-- Rate resolution precedence (highest first):
--   greentarget.pay_rate_schedules > greentarget.employee_pay_codes
--     > public.employee_pay_codes > public job/base rate.

BEGIN;

CREATE TABLE IF NOT EXISTS greentarget.employee_pay_codes (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL REFERENCES public.staffs(id) ON DELETE CASCADE,
  pay_code_id VARCHAR(50) NOT NULL REFERENCES public.pay_codes(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,
  override_rate_biasa NUMERIC(10, 2),
  override_rate_ahad NUMERIC(10, 2),
  override_rate_umum NUMERIC(10, 2),
  UNIQUE (employee_id, pay_code_id)
);

CREATE TABLE IF NOT EXISTS greentarget.pay_rate_schedules (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR NOT NULL REFERENCES public.staffs(id) ON DELETE CASCADE,
  pay_code_id VARCHAR NOT NULL REFERENCES public.pay_codes(id) ON DELETE CASCADE,
  effective_year INTEGER NOT NULL,
  effective_month INTEGER NOT NULL CHECK (effective_month >= 1 AND effective_month <= 12),
  rate_biasa NUMERIC(10, 2),
  rate_ahad NUMERIC(10, 2),
  rate_umum NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by VARCHAR,
  UNIQUE (employee_id, pay_code_id, effective_year, effective_month)
);

-- Seed the dual-company directors' first GT overrides (user-confirmed
-- 2026-08-05): GOH and WONG draw RM1,700/month at Green Target versus the
-- shared RM3,500 BULAN_BM override at Tien Hock. Until now the RM1,700 was
-- keyed manually into each GT monthly log. Guarded: only seeds when the
-- shared RM3,500 BULAN_BM override still exists for that employee.
INSERT INTO greentarget.employee_pay_codes
  (employee_id, pay_code_id, is_default, override_rate_biasa)
SELECT epc.employee_id, epc.pay_code_id, epc.is_default, 1700.00
FROM public.employee_pay_codes epc
WHERE epc.employee_id IN ('GOH', 'WONG')
  AND epc.pay_code_id = 'BULAN_BM'
  AND epc.override_rate_biasa = 3500.00
ON CONFLICT (employee_id, pay_code_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'greentarget' AND table_name = 'employee_pay_codes'
  ) THEN
    RAISE EXCEPTION 'greentarget.employee_pay_codes was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'greentarget' AND table_name = 'pay_rate_schedules'
  ) THEN
    RAISE EXCEPTION 'greentarget.pay_rate_schedules was not created';
  END IF;
END $$;

COMMIT;

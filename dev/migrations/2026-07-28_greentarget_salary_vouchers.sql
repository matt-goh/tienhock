-- 2026-07-28: Green Target salary voucher generator foundation.
--
-- Adds the two payroll journal entry types the GT Voucher Generator posts
-- (JBSL = Staff Salary Wages, JWDR = Director Remuneration — the legacy GT
-- names, continuing the imported JBSL/MM/YY and JWDR/MM/YY voucher series),
-- and the per-employee Lori Habuk branch mapping the generator uses to split
-- DRIVER wages between the BW_* (Bongawan) and SS_* account families.
--
-- Seeded branches place every current driver in BW; staff can move a driver
-- to SS from the Voucher Generator page without a code change.

BEGIN;

INSERT INTO greentarget.journal_entry_types (code, name, description, is_active)
VALUES
  ('JBSL', 'Staff Salary Wages', 'Monthly staff salary voucher posted by the Voucher Generator', true),
  ('JWDR', 'Director Remuneration', 'Monthly directors'' remuneration voucher posted by the Voucher Generator', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS greentarget.salary_voucher_branches (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(255) NOT NULL UNIQUE REFERENCES public.staffs(id) ON DELETE CASCADE,
  branch VARCHAR(2) NOT NULL CHECK (branch IN ('BW', 'SS')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

INSERT INTO greentarget.salary_voucher_branches (employee_id, branch, created_by, updated_by)
VALUES
  ('AFRED', 'BW', 'system', 'system'),
  ('JULPAKAL', 'BW', 'system', 'system'),
  ('MASTIN', 'BW', 'system', 'system'),
  ('YONUS', 'BW', 'system', 'system')
ON CONFLICT (employee_id) DO NOTHING;

DO $$
DECLARE
  missing_types integer;
  missing_seeds integer;
BEGIN
  SELECT COUNT(*) INTO missing_types
    FROM (VALUES ('JBSL'), ('JWDR')) AS t(code)
   WHERE NOT EXISTS (
     SELECT 1 FROM greentarget.journal_entry_types jet WHERE jet.code = t.code
   );
  IF missing_types <> 0 THEN
    RAISE EXCEPTION 'Expected JBSL and JWDR in greentarget.journal_entry_types, % missing', missing_types;
  END IF;

  SELECT COUNT(*) INTO missing_seeds
    FROM (VALUES ('AFRED'), ('JULPAKAL'), ('MASTIN'), ('YONUS')) AS e(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM greentarget.salary_voucher_branches b WHERE b.employee_id = e.id
   );
  IF missing_seeds <> 0 THEN
    RAISE EXCEPTION 'Expected 4 seeded driver branches, % missing', missing_seeds;
  END IF;
END $$;

COMMIT;

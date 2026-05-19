ALTER TABLE monthly_work_log_entries
ADD COLUMN IF NOT EXISTS ahad_overtime_hours numeric(6, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS umum_overtime_hours numeric(6, 2) DEFAULT 0;

ALTER TABLE monthly_work_log_activities
ADD COLUMN IF NOT EXISTS description text;

UPDATE monthly_work_log_entries
SET
  ahad_overtime_hours = COALESCE(ahad_overtime_hours, 0),
  umum_overtime_hours = COALESCE(umum_overtime_hours, 0);

UPDATE monthly_work_log_activities mwla
SET description = pc.description
FROM pay_codes pc
WHERE mwla.pay_code_id = pc.id
  AND mwla.description IS NULL;

ALTER TABLE monthly_work_log_entries
ALTER COLUMN ahad_overtime_hours SET DEFAULT 0,
ALTER COLUMN umum_overtime_hours SET DEFAULT 0,
ALTER COLUMN ahad_overtime_hours SET NOT NULL,
ALTER COLUMN umum_overtime_hours SET NOT NULL;

ALTER TABLE monthly_work_log_entries
ADD COLUMN IF NOT EXISTS ahad_hours numeric(6, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS umum_hours numeric(6, 2) DEFAULT 0;

UPDATE monthly_work_log_entries
SET
  ahad_hours = COALESCE(ahad_hours, 0),
  umum_hours = COALESCE(umum_hours, 0);

ALTER TABLE monthly_work_log_entries
ALTER COLUMN ahad_hours SET DEFAULT 0,
ALTER COLUMN umum_hours SET DEFAULT 0,
ALTER COLUMN ahad_hours SET NOT NULL,
ALTER COLUMN umum_hours SET NOT NULL;

ALTER TABLE holiday_calendar
ADD COLUMN IF NOT EXISTS is_cuti_umum boolean DEFAULT true;

UPDATE holiday_calendar
SET is_cuti_umum = true
WHERE is_cuti_umum IS NULL;

ALTER TABLE holiday_calendar
ALTER COLUMN is_cuti_umum SET DEFAULT true;

ALTER TABLE holiday_calendar
ALTER COLUMN is_cuti_umum SET NOT NULL;

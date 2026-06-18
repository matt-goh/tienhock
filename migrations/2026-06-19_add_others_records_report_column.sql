-- 2026-06-19  others_records.report_column
--
-- Adds an optional per-entry override that forces which Salary Report column an
-- Others (Kerja Luar) amount lands in: GAJI / OT / BONUS / CIO / CUTI.
-- NULL = use the automatic bucketing rule (default; existing rows unaffected).
-- Read by src/routes/payroll/salary-report.js; written by src/routes/payroll/others-records.js.
--
-- Idempotent: safe to run more than once and on an already-migrated DB.

ALTER TABLE others_records
  ADD COLUMN IF NOT EXISTS report_column varchar(8);

ALTER TABLE others_records
  DROP CONSTRAINT IF EXISTS others_records_report_column_chk;

ALTER TABLE others_records
  ADD CONSTRAINT others_records_report_column_chk
  CHECK (report_column IS NULL OR report_column IN ('GAJI', 'OT', 'BONUS', 'CIO', 'CUTI'));

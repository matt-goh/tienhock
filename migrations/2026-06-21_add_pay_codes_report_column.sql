-- 2026-06-21  pay_codes.report_column
--
-- Adds an optional pay-code-level override that forces which Salary Report column
-- amounts of this pay code land in: GAJI / OT / BONUS / CIO / CUTI.
-- NULL = use the automatic bucketing rule (default; existing rows unaffected).
--
-- Priority (lowest -> highest):
--   automatic rule  <  pay_codes.report_column  <  others_records.report_column
--
-- Applies to both regular payroll items and Others (Kerja Luar OT) records.
-- Read by src/routes/payroll/salary-report.js; written by src/routes/catalogue/pay-codes.js.
--
-- Idempotent: safe to run more than once and on an already-migrated DB.

ALTER TABLE pay_codes
  ADD COLUMN IF NOT EXISTS report_column varchar(8);

ALTER TABLE pay_codes
  DROP CONSTRAINT IF EXISTS pay_codes_report_column_chk;

ALTER TABLE pay_codes
  ADD CONSTRAINT pay_codes_report_column_chk
  CHECK (report_column IS NULL OR report_column IN ('GAJI', 'OT', 'BONUS', 'CIO', 'CUTI'));

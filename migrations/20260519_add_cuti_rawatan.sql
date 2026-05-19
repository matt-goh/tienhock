-- Cuti Rawatan (Hospital Leave) — 60 days/year for all employees
-- Adds a new leave type alongside cuti_umum / cuti_sakit / cuti_tahunan.
--
-- 1. employee_leave_balances: new cuti_rawatan_total column.
--    NOT NULL DEFAULT 60 → Postgres backfills every existing row to 60.
-- 2. leave_records.leave_type: extend the check constraint so the new
--    value can be persisted.

ALTER TABLE employee_leave_balances
  ADD COLUMN cuti_rawatan_total INTEGER NOT NULL DEFAULT 60;

ALTER TABLE leave_records
  DROP CONSTRAINT leave_records_leave_type_check;

ALTER TABLE leave_records
  ADD CONSTRAINT leave_records_leave_type_check
  CHECK (leave_type IN ('cuti_umum', 'cuti_sakit', 'cuti_tahunan', 'cuti_rawatan'));

-- Remove the payroll Finalize/status system entirely (Tien Hock + Green Target).
-- Payrolls are now always editable; there is no Processing/Finalized state.
-- Also adds employee_payrolls.updated_at, which is stamped on each process/edit and
-- powers the Payroll page "Recent" view recency ordering (last processed time fallback).

BEGIN;

-- New: per-row last-processed/edited timestamp (recency fallback for the "Recent" view).
ALTER TABLE employee_payrolls
  ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

-- Drop the finalize/status columns (TH + Green Target).
ALTER TABLE employee_payrolls DROP COLUMN IF EXISTS status;
ALTER TABLE monthly_payrolls DROP COLUMN IF EXISTS status;
ALTER TABLE greentarget.employee_payrolls DROP COLUMN IF EXISTS status;
ALTER TABLE greentarget.monthly_payrolls DROP COLUMN IF EXISTS status;

COMMIT;

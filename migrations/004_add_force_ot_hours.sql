-- Migration: Add force_ot_hours column to daily_work_log_entries
-- Purpose: Allow forced overtime hours for BIHUN page workers regardless of actual hours worked
-- Date: 2026-01-12

ALTER TABLE daily_work_log_entries
ADD COLUMN force_ot_hours numeric(4,2) DEFAULT 0;

COMMENT ON COLUMN daily_work_log_entries.force_ot_hours IS 'Forced overtime hours for BIHUN page - added to natural OT calculation';

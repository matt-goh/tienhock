-- 010_jp_leave_link.sql
-- Jelly Polly leave 1:1: JP pages record leave into the SHARED
-- public.leave_records table (one leave ledger per person keeps the yearly
-- entitlements/balances correct across companies). Leave created from a JP
-- daily work log links back via jp_work_log_id (the existing work_log_id
-- column references public.daily_work_logs and stays TH-only); deleting the JP
-- log cascades the leave rows away, mirroring TH's work_log_id behaviour.

BEGIN;

ALTER TABLE public.leave_records
  ADD COLUMN jp_work_log_id INTEGER
    REFERENCES jellypolly.daily_work_logs(id) ON DELETE CASCADE;

CREATE INDEX idx_leave_records_jp_work_log
  ON public.leave_records (jp_work_log_id)
  WHERE jp_work_log_id IS NOT NULL;

COMMIT;

-- 2026-06-28: Reset Tambahan pay-code default (auto-select) flags.
--
-- Tambahan pay codes were previously never auto-selected in the work-log entry
-- pages, so the is_default flag on their employee/job mappings was meaningless
-- and many rows had stale is_default = true values. The entry pages now honor
-- is_default for Tambahan (like Base), so those stale flags must be cleared.
--
-- Desired end state: every Tambahan mapping is_default = false, EXCEPT SAPU1,
-- which should auto-select. Idempotent and safe to re-run.

BEGIN;

-- All Tambahan codes default OFF, except SAPU1.
UPDATE employee_pay_codes epc
SET is_default = false
FROM pay_codes pc
WHERE pc.id = epc.pay_code_id
  AND pc.pay_type = 'Tambahan'
  AND epc.pay_code_id <> 'SAPU1'
  AND epc.is_default = true;

UPDATE job_pay_codes jpc
SET is_default = false
FROM pay_codes pc
WHERE pc.id = jpc.pay_code_id
  AND pc.pay_type = 'Tambahan'
  AND jpc.pay_code_id <> 'SAPU1'
  AND jpc.is_default = true;

-- SAPU1 default ON wherever it is mapped.
UPDATE employee_pay_codes
SET is_default = true
WHERE pay_code_id = 'SAPU1'
  AND is_default = false;

UPDATE job_pay_codes
SET is_default = true
WHERE pay_code_id = 'SAPU1'
  AND is_default = false;

COMMIT;

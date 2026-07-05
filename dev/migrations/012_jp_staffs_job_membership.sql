-- ============================================================================
-- 012_jp_staffs_job_membership.sql
-- JP membership pivot: page/payroll membership now derives from
-- jellypolly.staffs.job (TH-style; managed on the JP Job page / staff form)
-- instead of the jellypolly.payroll_employees assignment table.
--
-- Folds the active payroll_employees assignments into staffs.job, then drops
-- the table. Standalone follow-up for databases where JP_PROD_DEPLOY.sql (v2)
-- has already been run (prod + dev). Idempotent: a second run is a no-op.
--
--   psql -U <user> -d tienhock -v ON_ERROR_STOP=1 -f 012_jp_staffs_job_membership.sql
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('jellypolly.payroll_employees') IS NULL THEN
    RAISE NOTICE 'jellypolly.payroll_employees already dropped; nothing to do';
    RETURN;
  END IF;

  -- Merge each staff's active assignments (job_type -> JP job id) into their
  -- staffs.job array, keeping existing jobs and de-duplicating.
  UPDATE jellypolly.staffs s
  SET job = (
        SELECT jsonb_agg(DISTINCT val)
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(s.job, '[]'::jsonb)) AS val
          UNION
          SELECT CASE pe.job_type
                   WHEN 'OFFICE'        THEN 'JP_OFFICE'
                   WHEN 'MAINTENANCE'   THEN 'JP_MAINTEN'
                   WHEN 'SALESMAN'      THEN 'JP_SALESMAN'
                   WHEN 'SALESMAN_IKUT' THEN 'JP_SALESMAN_IKUT'
                   WHEN 'ICE_POLLY'     THEN 'JP_ICE_POLLY'
                   WHEN 'JELLY_CUP'     THEN 'JP_JELLY_CUP'
                   WHEN 'PLASTIC'       THEN 'JP_PLASTIC'
                   WHEN 'PRODUCTION'    THEN 'JP_PACKING'
                 END
          FROM jellypolly.payroll_employees pe
          WHERE pe.employee_id = s.id AND pe.is_active = true
        ) q
        WHERE val IS NOT NULL
      ),
      updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM jellypolly.payroll_employees pe2
    WHERE pe2.employee_id = s.id AND pe2.is_active = true
  );

  DROP TABLE jellypolly.payroll_employees;
END $$;

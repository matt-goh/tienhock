-- Restore Danish's confirmed primary payroll location before August JVSL is
-- generated.
--
-- The Salary Report and payroll Voucher Generator intentionally use the first
-- location on the canonical HEAD staff row as that worker's reporting/JVSL
-- department. The shared staff multi-select had rebuilt selected values in the
-- alphabetically sorted option order, changing Danish from ["09","18"] to
-- ["18","09"] when his record was edited. Location 18 is the supplemental
-- Insentif Tidak Tetap bucket and is deliberately outside the JVSL department
-- model; location 09 is Mesin Bihun, matching his BH_DEPAN job.
--
-- August 2026 proof:
--   gross pay                 RM1,284.08
--   digenapkan                    RM0.52
--   employer EPF                RM138.00
--   employer SOCSO               RM21.85
--   omitted JVSL cost         RM1,444.45
--
-- The migration changes only the order of Danish's existing location values;
-- it preserves any additional locations. It refuses to change the master data
-- if JVSL/08/26 already exists because an existing journal would need its own
-- atomic line rebuild and does not update from staff data automatically.
--
-- Application status:
--   dev  - applied 2026-09-03; idempotent re-run verified
--   prod - pending

BEGIN;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT pg_advisory_xact_lock(
  hashtext('2026-09-03_restore_danish_primary_salary_location')
);

DO $migration$
DECLARE
  v_location jsonb;
  v_reordered_location jsonb;
  v_payroll_count integer;
BEGIN
  SELECT s.location
    INTO v_location
    FROM public.staffs s
   WHERE s.id = 'DANISH'
     AND s.name = 'DANISH MIEGEL BIN EDWAL'
     AND s.head_staff_id = 'DANISH'
     AND s.date_resigned IS NULL
     AND COALESCE(s.job, '[]'::jsonb) @> '["BH_DEPAN"]'::jsonb
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'DANISH is not the expected active canonical BH_DEPAN staff record; refusing to change locations';
  END IF;

  PERFORM 1
    FROM public.job_location_mappings
   WHERE job_id = 'BH_DEPAN'
     AND location_code = '09'
     AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Expected active BH_DEPAN -> location 09 job mapping is missing';
  END IF;

  IF v_location->>0 = '09' THEN
    RAISE NOTICE
      'DANISH already has location 09 first; no data change required';
    RETURN;
  END IF;

  IF v_location->>0 <> '18' OR NOT (v_location ? '09') THEN
    RAISE EXCEPTION
      'Expected DANISH locations to start with 18 and contain 09, found %',
      v_location;
  END IF;

  SELECT COUNT(*)
    INTO v_payroll_count
    FROM public.employee_payrolls ep
    JOIN public.monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
   WHERE ep.employee_id = 'DANISH'
     AND ep.job_type = 'BH_DEPAN'
     AND ep.section = 'Bihun'
     AND ep.gross_pay = 1284.08
     AND ep.digenapkan = 0.52
     AND mp.year = 2026
     AND mp.month = 8;
  IF v_payroll_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one August 2026 DANISH BH_DEPAN payroll row matching the RM1,444.45 reconciliation, found %',
      v_payroll_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.journal_entries
     WHERE reference_no = 'JVSL/08/26'
  ) THEN
    RAISE EXCEPTION
      'JVSL/08/26 already exists; its saved lines will not follow this location repair and require a separate guarded rebuild';
  END IF;

  SELECT jsonb_build_array('09') ||
         COALESCE(
           jsonb_agg(to_jsonb(loc.value) ORDER BY loc.ordinality)
             FILTER (WHERE loc.value <> '09'),
           '[]'::jsonb
         )
    INTO v_reordered_location
    FROM jsonb_array_elements_text(v_location)
         WITH ORDINALITY AS loc(value, ordinality);

  UPDATE public.staffs
     SET location = v_reordered_location,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = 'DANISH';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DANISH location update affected no rows';
  END IF;

  RAISE NOTICE
    'DANISH primary payroll location restored: % -> %',
    v_location,
    v_reordered_location;
END
$migration$;

DO $postconditions$
BEGIN
  PERFORM 1
    FROM public.staffs
   WHERE id = 'DANISH'
     AND location->>0 = '09'
     AND location ? '18';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Postcondition failed: DANISH primary location is not 09 with supplemental location 18 preserved';
  END IF;
END
$postconditions$;

COMMIT;

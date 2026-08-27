-- Link the confirmed red/M production pay-code family to the existing
-- 2UDG 300g Bihun product:
--
--   Product    : 2-BH2
--   Production : PBH_2UM, PBH_2UM_BAG, FULL_B2UM, FULL_B2UM_140,
--                FULL_2UM_40, FULL_2UM_60
--   Salesman   : 2-BH2
--   Ikut Lori  : DME-2H
--
-- The user confirmed this family from the handwritten H/M mapping supplied on
-- 2026-08-27. The six matching green/H production links already exist and are
-- preserved. This migration adds product links only: it does not change any
-- rate, employee assignment, production entry, daily log or processed payroll.
--
-- Application status:
--   dev  - applied 2026-08-27; idempotent re-run verified
--   prod - pending

BEGIN;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT pg_advisory_xact_lock(
  hashtext('2026-08-27_link_2_bh2_2um_production_pay_codes')
);

DO $preconditions$
DECLARE
  v_count integer;
  v_problem_codes text;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.products
   WHERE id = '2-BH2'
     AND type = 'BH'
     AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one active BH product 2-BH2, found %', v_count;
  END IF;

  SELECT string_agg(v.pay_code_id, ', ' ORDER BY v.pay_code_id)
    INTO v_problem_codes
    FROM (
      VALUES
        ('PBH_2UM',       'Base'),
        ('PBH_2UM_BAG',   'Tambahan'),
        ('FULL_B2UM',     'Tambahan'),
        ('FULL_B2UM_140', 'Tambahan'),
        ('FULL_2UM_40',   'Tambahan'),
        ('FULL_2UM_60',   'Tambahan')
    ) AS v(pay_code_id, expected_pay_type)
    LEFT JOIN public.pay_codes pc ON pc.id = v.pay_code_id
   WHERE pc.id IS NULL
      OR pc.pay_type IS DISTINCT FROM v.expected_pay_type
      OR pc.rate_unit IS DISTINCT FROM 'Bag'
      OR pc.is_active IS DISTINCT FROM true;
  IF v_problem_codes IS NOT NULL THEN
    RAISE EXCEPTION
      'Missing, inactive or incompatible 2UM pay codes: %',
      v_problem_codes;
  END IF;

  -- Both confirmed H and M families must remain valid BH production choices.
  SELECT string_agg(v.pay_code_id, ', ' ORDER BY v.pay_code_id)
    INTO v_problem_codes
    FROM (
      VALUES
        ('PBH_2UH'),
        ('PBH_2UH_BAG'),
        ('FULL_B2UH'),
        ('FULL_B2UH_140'),
        ('FULL_2UH_40'),
        ('FULL_2UH_60'),
        ('PBH_2UM'),
        ('PBH_2UM_BAG'),
        ('FULL_B2UM'),
        ('FULL_B2UM_140'),
        ('FULL_2UM_40'),
        ('FULL_2UM_60')
    ) AS v(pay_code_id)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.job_pay_codes jpc
      WHERE jpc.job_id = 'BH_PACKING'
        AND jpc.pay_code_id = v.pay_code_id
   );
  IF v_problem_codes IS NOT NULL THEN
    RAISE EXCEPTION
      'Expected BH_PACKING job links are missing for: %',
      v_problem_codes;
  END IF;

  -- Preserve the six green/H production links shown beside the M family.
  SELECT string_agg(v.pay_code_id, ', ' ORDER BY v.pay_code_id)
    INTO v_problem_codes
    FROM (
      VALUES
        ('PBH_2UH'),
        ('PBH_2UH_BAG'),
        ('FULL_B2UH'),
        ('FULL_B2UH_140'),
        ('FULL_2UH_40'),
        ('FULL_2UH_60')
    ) AS v(pay_code_id)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.product_pay_codes ppc
      WHERE ppc.product_id = '2-BH2'
        AND ppc.pay_code_id = v.pay_code_id
   );
  IF v_problem_codes IS NOT NULL THEN
    RAISE EXCEPTION
      'Expected existing 2-BH2 green/H production links are missing for: %',
      v_problem_codes;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.job_pay_codes
   WHERE job_id = 'SALESMAN'
     AND pay_code_id = '2-BH2';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected Salesman link SALESMAN -> 2-BH2, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.job_pay_codes
   WHERE job_id = 'SALESMAN_IKUT'
     AND pay_code_id = 'DME-2H';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected Ikut Lori job link SALESMAN_IKUT -> DME-2H, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.product_salesman_ikut_pay_codes
   WHERE product_id = '2-BH2'
     AND pay_code_id = 'DME-2H';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected Ikut Lori product link 2-BH2 -> DME-2H, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.product_pay_codes
   WHERE product_id = '2-BH2'
     AND pay_code_id = 'DME-2H';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected product pay-code link 2-BH2 -> DME-2H, found %', v_count;
  END IF;
END
$preconditions$;

INSERT INTO public.product_pay_codes (product_id, pay_code_id)
SELECT '2-BH2', v.pay_code_id
  FROM (
    VALUES
      ('PBH_2UM'),
      ('PBH_2UM_BAG'),
      ('FULL_B2UM'),
      ('FULL_B2UM_140'),
      ('FULL_2UM_40'),
      ('FULL_2UM_60')
  ) AS v(pay_code_id)
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

DO $postconditions$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.product_pay_codes ppc
    JOIN (
      VALUES
        ('PBH_2UM'),
        ('PBH_2UM_BAG'),
        ('FULL_B2UM'),
        ('FULL_B2UM_140'),
        ('FULL_2UM_40'),
        ('FULL_2UM_60')
    ) AS v(pay_code_id) ON v.pay_code_id = ppc.pay_code_id
   WHERE ppc.product_id = '2-BH2';
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'Expected all 6 red/M production links on 2-BH2, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.product_pay_codes ppc
    JOIN (
      VALUES
        ('PBH_2UH'),
        ('PBH_2UH_BAG'),
        ('FULL_B2UH'),
        ('FULL_B2UH_140'),
        ('FULL_2UH_40'),
        ('FULL_2UH_60')
    ) AS v(pay_code_id) ON v.pay_code_id = ppc.pay_code_id
   WHERE ppc.product_id = '2-BH2';
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'The 6 green/H production links on 2-BH2 changed unexpectedly';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.product_salesman_ikut_pay_codes
   WHERE product_id = '2-BH2'
     AND pay_code_id = 'DME-2H';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'The 2-BH2 -> DME-2H Ikut Lori link changed unexpectedly';
  END IF;
END
$postconditions$;

COMMIT;

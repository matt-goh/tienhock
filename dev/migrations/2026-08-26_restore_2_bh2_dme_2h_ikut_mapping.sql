-- Restore the confirmed Tien Hock 2UDG 300g Ikut Lori mapping:
--
--   Product    : 2-BH2
--   Salesman   : 2-BH2
--   Ikut Lori  : DME-2H
--
-- The 2026-08-24 data-driven mapping migration intended to carry forward
-- 2-BH2 -> DME-2H, but it inserted a product mapping only when the pay code
-- already had a SALESMAN_IKUT job link. DME-2H was assigned directly to the
-- six Ikut Lori employees instead, so this one legacy pair was skipped when
-- the hardcoded map was removed. The separate 3UDG rule remains unchanged:
-- 2-BH -> DME-300G.
--
-- This migration changes catalogue/configuration links only. It does not
-- change rates, production mappings, saved daily logs or processed payroll.
--
-- Application status:
--   dev  - applied 2026-08-26; idempotent re-run verified
--   prod - pending

BEGIN;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT pg_advisory_xact_lock(
  hashtext('2026-08-26_restore_2_bh2_dme_2h_ikut_mapping')
);

DO $preconditions$
DECLARE
  v_count integer;
  v_existing_ikut_code varchar;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.products
   WHERE id = '2-BH2'
     AND type = 'BH'
     AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one active BH product 2-BH2, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.pay_codes
   WHERE id = 'DME-2H'
     AND pay_type = 'Base'
     AND rate_unit = 'Bag'
     AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one active Base/Bag pay code DME-2H, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.jobs
   WHERE id = 'SALESMAN_IKUT';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected canonical job SALESMAN_IKUT, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.job_pay_codes
   WHERE job_id = 'SALESMAN'
     AND pay_code_id = '2-BH2';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected existing Salesman link SALESMAN -> 2-BH2, found %', v_count;
  END IF;

  -- This existing product-pay-code row is independent production catalogue
  -- evidence that DME-2H belongs to product 2-BH2.
  SELECT COUNT(*) INTO v_count
    FROM public.product_pay_codes
   WHERE product_id = '2-BH2'
     AND pay_code_id = 'DME-2H';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected existing product_pay_codes link 2-BH2 -> DME-2H, found %', v_count;
  END IF;

  -- Preserve the separately confirmed 3UDG rule exactly as-is.
  SELECT COUNT(*) INTO v_count
    FROM public.product_salesman_ikut_pay_codes
   WHERE product_id = '2-BH'
     AND pay_code_id = 'DME-300G';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected existing Ikut Lori link 2-BH -> DME-300G, found %', v_count;
  END IF;

  SELECT pay_code_id INTO v_existing_ikut_code
    FROM public.product_salesman_ikut_pay_codes
   WHERE product_id = '2-BH2'
   FOR UPDATE;

  IF FOUND AND v_existing_ikut_code <> 'DME-2H' THEN
    RAISE EXCEPTION
      'Product 2-BH2 is already mapped to %, refusing to replace it with DME-2H',
      v_existing_ikut_code;
  END IF;
END
$preconditions$;

INSERT INTO public.job_pay_codes
  (job_id, pay_code_id, is_default,
   override_rate_biasa, override_rate_ahad, override_rate_umum)
VALUES
  ('SALESMAN_IKUT', 'DME-2H', false, NULL, NULL, NULL)
ON CONFLICT (job_id, pay_code_id) DO NOTHING;

INSERT INTO public.product_salesman_ikut_pay_codes
  (product_id, pay_code_id)
VALUES
  ('2-BH2', 'DME-2H')
ON CONFLICT (product_id) DO NOTHING;

DO $postconditions$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.job_pay_codes
   WHERE job_id = 'SALESMAN_IKUT'
     AND pay_code_id = 'DME-2H';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'SALESMAN_IKUT -> DME-2H job link was not established';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.product_salesman_ikut_pay_codes
   WHERE product_id = '2-BH2'
     AND pay_code_id = 'DME-2H';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '2-BH2 -> DME-2H Ikut Lori link was not established';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.product_salesman_ikut_pay_codes
   WHERE product_id = '2-BH'
     AND pay_code_id = 'DME-300G';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '2-BH -> DME-300G changed unexpectedly';
  END IF;
END
$postconditions$;

COMMIT;

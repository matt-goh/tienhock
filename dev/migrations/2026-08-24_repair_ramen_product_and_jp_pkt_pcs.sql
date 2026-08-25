-- Repair the RAMEN product identifier used by the original 2026-08-22
-- migration, connect the existing DME-RA packet rate to SALESMAN_IKUT, and
-- align Jelly Polly's pay-code unit constraint with the shared Pay Code UI.
-- PM_PR is deliberately verified as a pay code; the finished-goods product
-- is 1-PR. No user-set rate is changed.

BEGIN;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT pg_advisory_xact_lock(
  hashtext('2026-08-24_repair_ramen_product_and_jp_pkt_pcs')
);

DO $guard$
DECLARE
  ramen_product_type text;
  packing_pay_code_unit text;
  salesman_pay_code_unit text;
  ikut_pay_code_unit text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = '1-PR') THEN
    RAISE EXCEPTION 'Expected ramen finished-goods product 1-PR was not found';
  END IF;

  SELECT type
  INTO ramen_product_type
  FROM public.products
  WHERE id = '1-PR';

  IF ramen_product_type IS NULL OR ramen_product_type NOT IN ('MEE', 'RAMEN') THEN
    RAISE EXCEPTION
      'Product 1-PR has unexpected type %, expected MEE or RAMEN',
      ramen_product_type;
  END IF;

  IF EXISTS (SELECT 1 FROM public.products WHERE id = 'PM_PR') THEN
    RAISE EXCEPTION
      'PM_PR unexpectedly exists as a product; it must remain the ramen pay code';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_pay_codes
    WHERE product_id = '1-PR' AND pay_code_id = 'PM_PR'
  ) THEN
    RAISE EXCEPTION
      'Expected product-to-packing mapping 1-PR -> PM_PR was not found';
  END IF;

  SELECT rate_unit
  INTO packing_pay_code_unit
  FROM public.pay_codes
  WHERE id = 'PM_PR';

  IF packing_pay_code_unit IS NULL THEN
    RAISE EXCEPTION 'Expected ramen pay code PM_PR was not found';
  END IF;

  IF packing_pay_code_unit <> 'PKT' THEN
    RAISE EXCEPTION
      'Ramen pay code PM_PR has unexpected rate unit %, expected PKT',
      packing_pay_code_unit;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_pay_codes ppc
    JOIN public.products p ON p.id = ppc.product_id
    JOIN public.pay_codes pc ON pc.id = ppc.pay_code_id
    WHERE (
      (p.id = '1-PR' OR p.type = 'RAMEN')
      AND pc.rate_unit IS DISTINCT FROM 'PKT'
    ) OR (
      p.id <> '1-PR'
      AND p.type IS DISTINCT FROM 'RAMEN'
      AND pc.rate_unit = 'PKT'
    )
  ) THEN
    RAISE EXCEPTION
      'An incompatible public product/pay-code unit mapping exists; RAMEN must map only to PKT and PKT only to RAMEN';
  END IF;

  SELECT rate_unit
  INTO salesman_pay_code_unit
  FROM public.pay_codes
  WHERE id = '1-PR';

  IF salesman_pay_code_unit IS NULL THEN
    RAISE EXCEPTION 'Expected ramen salesman pay code 1-PR was not found';
  END IF;

  IF salesman_pay_code_unit <> 'PKT' THEN
    RAISE EXCEPTION
      'Ramen salesman pay code 1-PR has unexpected rate unit %, expected PKT',
      salesman_pay_code_unit;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.job_pay_codes
    WHERE job_id = 'SALESMAN' AND pay_code_id = '1-PR'
  ) THEN
    RAISE EXCEPTION
      'Expected SALESMAN -> 1-PR commission mapping was not found';
  END IF;

  SELECT rate_unit
  INTO ikut_pay_code_unit
  FROM public.pay_codes
  WHERE id = 'DME-RA';

  IF ikut_pay_code_unit IS NULL THEN
    RAISE EXCEPTION 'Expected existing Ramen delivery pay code DME-RA was not found';
  END IF;

  IF ikut_pay_code_unit NOT IN ('Hour', 'PKT') THEN
    RAISE EXCEPTION
      'DME-RA has unexpected rate unit %, expected legacy Hour or repaired PKT',
      ikut_pay_code_unit;
  END IF;

  IF ikut_pay_code_unit = 'Hour' AND (
    EXISTS (
      SELECT 1
      FROM public.daily_work_log_activities
      WHERE pay_code_id = 'DME-RA'
    )
    OR EXISTS (
      SELECT 1
      FROM public.monthly_work_log_activities
      WHERE pay_code_id = 'DME-RA'
    )
  ) THEN
    RAISE EXCEPTION
      'DME-RA has historical work-log activity under its legacy Hour unit; review before converting it to PKT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = 'SALESMAN_IKUT') THEN
    RAISE EXCEPTION 'Expected SALESMAN_IKUT job was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    WHERE constraint_record.conrelid = 'jellypolly.pay_codes'::regclass
      AND constraint_record.contype = 'c'
      AND constraint_record.conname = 'pay_codes_rate_unit_check'
  ) THEN
    RAISE EXCEPTION
      'Expected jellypolly.pay_codes constraint pay_codes_rate_unit_check was not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    WHERE constraint_record.conrelid = 'jellypolly.pay_codes'::regclass
      AND constraint_record.contype = 'c'
      AND constraint_record.conname <> 'pay_codes_rate_unit_check'
      AND pg_get_constraintdef(constraint_record.oid) ILIKE '%rate_unit%'
  ) THEN
    RAISE EXCEPTION
      'An additional Jelly Polly rate_unit constraint exists; refusing an incomplete repair';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jellypolly.product_pay_codes ppc
    JOIN public.products p ON p.id = ppc.product_id
    JOIN jellypolly.pay_codes pc ON pc.id = ppc.pay_code_id
    WHERE (p.type = 'RAMEN') IS DISTINCT FROM (pc.rate_unit = 'PKT')
  ) THEN
    RAISE EXCEPTION
      'An incompatible Jelly Polly product/pay-code unit mapping exists; RAMEN must map only to PKT and PKT only to RAMEN';
  END IF;
END
$guard$;

UPDATE public.products
SET type = 'RAMEN'
WHERE id = '1-PR';

UPDATE public.pay_codes
SET rate_unit = 'PKT',
    requires_units_input = true
WHERE id = 'DME-RA';

INSERT INTO public.job_pay_codes (job_id, pay_code_id, is_default)
VALUES ('SALESMAN_IKUT', 'DME-RA', false)
ON CONFLICT (job_id, pay_code_id) DO NOTHING;

ALTER TABLE jellypolly.pay_codes
  DROP CONSTRAINT pay_codes_rate_unit_check;

ALTER TABLE jellypolly.pay_codes
  ADD CONSTRAINT pay_codes_rate_unit_check
  CHECK (
    rate_unit::text = ANY (
      ARRAY[
        'Hour'::character varying::text,
        'Bill'::character varying::text,
        'Day'::character varying::text,
        'Bag'::character varying::text,
        'Ctn'::character varying::text,
        'Trip'::character varying::text,
        'Fixed'::character varying::text,
        'Percent'::character varying::text,
        'Tray'::character varying::text,
        'Kg'::character varying::text,
        'Karung'::character varying::text,
        'Bundle'::character varying::text,
        'PKT'::character varying::text,
        'PCS'::character varying::text
      ]
    )
  );

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.products
    WHERE id = '1-PR'
      AND type = 'RAMEN'
  ) THEN
    RAISE EXCEPTION 'Ramen product 1-PR was not repaired to type RAMEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_pay_codes
    WHERE product_id = '1-PR' AND pay_code_id = 'PM_PR'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.job_pay_codes
    WHERE job_id = 'SALESMAN' AND pay_code_id = '1-PR'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.job_pay_codes
    WHERE job_id = 'SALESMAN_IKUT' AND pay_code_id = 'DME-RA'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.pay_codes
    WHERE id = 'DME-RA'
      AND rate_unit = 'PKT'
      AND requires_units_input = true
  ) THEN
    RAISE EXCEPTION 'Ramen payroll dependencies were not repaired and verified';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_pay_codes ppc
    JOIN public.products p ON p.id = ppc.product_id
    JOIN public.pay_codes pc ON pc.id = ppc.pay_code_id
    WHERE (p.type = 'RAMEN') IS DISTINCT FROM (pc.rate_unit = 'PKT')
  ) OR EXISTS (
    SELECT 1
    FROM jellypolly.product_pay_codes ppc
    JOIN public.products p ON p.id = ppc.product_id
    JOIN jellypolly.pay_codes pc ON pc.id = ppc.pay_code_id
    WHERE (p.type = 'RAMEN') IS DISTINCT FROM (pc.rate_unit = 'PKT')
  ) THEN
    RAISE EXCEPTION
      'A product/pay-code unit mapping is incompatible after the RAMEN repair';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_class table_record
      ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace schema_record
      ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'jellypolly'
      AND table_record.relname = 'pay_codes'
      AND constraint_record.conname = 'pay_codes_rate_unit_check'
      AND constraint_record.convalidated
      AND pg_get_constraintdef(constraint_record.oid) LIKE '%PKT%'
      AND pg_get_constraintdef(constraint_record.oid) LIKE '%PCS%'
  ) THEN
    RAISE EXCEPTION
      'jellypolly.pay_codes rate-unit constraint was not aligned for PKT/PCS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    WHERE constraint_record.conrelid = 'jellypolly.pay_codes'::regclass
      AND constraint_record.contype = 'c'
      AND constraint_record.conname <> 'pay_codes_rate_unit_check'
      AND pg_get_constraintdef(constraint_record.oid) ILIKE '%rate_unit%'
  ) THEN
    RAISE EXCEPTION
      'An additional restrictive Jelly Polly rate_unit constraint remains';
  END IF;
END
$verify$;

COMMIT;

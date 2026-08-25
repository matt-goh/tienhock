-- Data-driven Salesman Ikut Lori product->pay-code mapping.
--
-- Previously the Tien Hock and Jelly Polly salesman daily-log pages carried a
-- hardcoded PRODUCT_TO_SALESMAN_IKUT_PAYCODE map, so every new product that
-- needs Ikut Lori commission required a developer edit. This migration adds the
-- shared product_salesman_ikut_pay_codes table and backfills it from the exact
-- pairs the code was maintaining, so the pages can read the mapping from data.
--
-- The table is TH-scope: Ikut Lori pay codes (DME/DWE) are public pay codes.
-- Jelly Polly uses the same-id pay code on both JP_SALESMAN jobs and has no
-- separate Ikut mapping. No rate, price, pay code or job mapping is changed.

BEGIN;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT pg_advisory_xact_lock(
  hashtext('2026-08-24_product_paycode_auto_setup')
);

CREATE TABLE IF NOT EXISTS public.product_salesman_ikut_pay_codes (
  product_id character varying NOT NULL
    REFERENCES public.products(id) ON DELETE CASCADE,
  pay_code_id character varying NOT NULL
    REFERENCES public.pay_codes(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id)
);

-- Backfill the pairs the daily-log pages were hardcoding. Only rows whose
-- product, pay code and SALESMAN_IKUT job association all exist are inserted,
-- so a production environment that lacks a legacy code stays consistent.
INSERT INTO public.product_salesman_ikut_pay_codes (product_id, pay_code_id)
SELECT v.product_id, v.pay_code_id
FROM (
  VALUES
    ('1-2UDG',    'DME-2UDG'),
    ('1-3UDG',    'DME-3UDG'),
    ('1-350G',    'DME-350G'),
    ('1-MNL',     'DME-MNL'),
    ('1-PR',      'DME-RA'),
    ('2-APPLE',   'DME-300G'),
    ('2-BH',      'DME-300G'),
    ('2-BH2',     'DME-2H'),
    ('2-BCM3',    'DME-600G'),
    ('2-BNL',     'DME-3.1KG'),
    ('2-BNL(5)',  'DME-5KG'),
    ('2-MASAK',   'DME-300G'),
    ('2-PADI',    'DME-300G'),
    ('WE-2UDG',   'DWE-2UDG'),
    ('WE-3UDG',   'DWE-3UDG'),
    ('WE-300G',   'DWE-300G'),
    ('WE-360',    'DWE-350G'),
    ('WE-360(5PK)', 'DWE-350G'),
    ('WE-420',    'DWE-420G'),
    ('WE-600G',   'DWE-600G'),
    ('WE-MNL',    'DWE-MNL')
) AS v(product_id, pay_code_id)
WHERE EXISTS (
  SELECT 1 FROM public.products p WHERE p.id = v.product_id
) AND EXISTS (
  SELECT 1 FROM public.pay_codes pc WHERE pc.id = v.pay_code_id
) AND EXISTS (
  SELECT 1
  FROM public.job_pay_codes jpc
  WHERE jpc.job_id = 'SALESMAN_IKUT'
    AND jpc.pay_code_id = v.pay_code_id
)
ON CONFLICT (product_id) DO NOTHING;

DO $verify$
DECLARE
  missing_count integer;
BEGIN
  SELECT COUNT(*)
  INTO missing_count
  FROM (
    VALUES
      ('1-2UDG',    'DME-2UDG'),
      ('1-3UDG',    'DME-3UDG'),
      ('1-350G',    'DME-350G'),
      ('1-MNL',     'DME-MNL'),
      ('1-PR',      'DME-RA'),
      ('2-APPLE',   'DME-300G'),
      ('2-BH',      'DME-300G'),
      ('2-BH2',     'DME-2H'),
      ('2-BCM3',    'DME-600G'),
      ('2-BNL',     'DME-3.1KG'),
      ('2-BNL(5)',  'DME-5KG'),
      ('2-MASAK',   'DME-300G'),
      ('2-PADI',    'DME-300G'),
      ('WE-2UDG',   'DWE-2UDG'),
      ('WE-3UDG',   'DWE-3UDG'),
      ('WE-300G',   'DWE-300G'),
      ('WE-360',    'DWE-350G'),
      ('WE-360(5PK)', 'DWE-350G'),
      ('WE-420',    'DWE-420G'),
      ('WE-600G',   'DWE-600G'),
      ('WE-MNL',    'DWE-MNL')
  ) AS v(product_id, pay_code_id)
  WHERE EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = v.product_id
  ) AND EXISTS (
    SELECT 1 FROM public.pay_codes pc WHERE pc.id = v.pay_code_id
  ) AND EXISTS (
    SELECT 1
    FROM public.job_pay_codes jpc
    WHERE jpc.job_id = 'SALESMAN_IKUT'
      AND jpc.pay_code_id = v.pay_code_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.product_salesman_ikut_pay_codes mapped
    WHERE mapped.product_id = v.product_id
      AND mapped.pay_code_id = v.pay_code_id
  );

  IF missing_count <> 0 THEN
    RAISE EXCEPTION '% resolvable Ikut Lori product mappings are missing', missing_count;
  END IF;
END
$verify$;

COMMIT;

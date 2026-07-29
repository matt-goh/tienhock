-- 2026-07-30 Remove the Green Target rental add-ons feature.
--
-- Rental add-ons attached a manual pay code + amount to a rental, which the
-- Daily Lori Habuk prefill turned into an ADDON trip line for the driver's
-- payroll. It was never used: extra pay is keyed with the "Manual Item" button
-- on the payroll details page, which reads the shared pay_codes catalogue and
-- has no connection to these tables.
--
-- Guarded and idempotent. Fails closed if any ADDON trip line exists.

BEGIN;

DO $$
DECLARE
  addon_line_count integer;
BEGIN
  SELECT COUNT(*) INTO addon_line_count
  FROM greentarget.daily_lori_habuk_lines
  WHERE source_type = 'ADDON';

  IF addon_line_count > 0 THEN
    RAISE EXCEPTION
      'Aborting: % greentarget.daily_lori_habuk_lines row(s) still use source_type ADDON. Reclassify them before dropping the value.',
      addon_line_count;
  END IF;
END $$;

DROP TABLE IF EXISTS greentarget.rental_addons;
DROP TABLE IF EXISTS greentarget.addon_paycodes;

ALTER TABLE greentarget.daily_lori_habuk_lines
  DROP CONSTRAINT IF EXISTS daily_lori_habuk_lines_source_type_chk;

ALTER TABLE greentarget.daily_lori_habuk_lines
  ADD CONSTRAINT daily_lori_habuk_lines_source_type_chk
  CHECK (source_type IN ('PLACEMENT', 'PICKUP', 'MANUAL', 'DERIVED'));

COMMIT;

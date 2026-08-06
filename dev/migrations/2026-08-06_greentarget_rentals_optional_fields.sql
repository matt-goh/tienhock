-- 2026-08-06 Green Target: dumpster and rental dates become optional.
--
-- The rental record is no longer used to track the physical tong movement --
-- that is kept in Excel. Green Target rentals now exist to hold the customer's
-- site/address and to carry the invoice -> payment -> journal chain, so the
-- dumpster and both dates are optional metadata.
--
-- tong_no is already nullable; only date_placed still carried a NOT NULL.
-- Guarded and idempotent.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'greentarget'
       AND table_name = 'rentals'
       AND column_name = 'date_placed'
       AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE greentarget.rentals ALTER COLUMN date_placed DROP NOT NULL;
    RAISE NOTICE 'greentarget.rentals.date_placed is now nullable';
  ELSE
    RAISE NOTICE 'greentarget.rentals.date_placed was already nullable - no change';
  END IF;
END
$$;

COMMIT;

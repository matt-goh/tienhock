-- Green Target customer site labels and multi-location signup snapshots.
-- Guarded and idempotent so it can be applied safely during deployment.

BEGIN;

ALTER TABLE greentarget.locations
  ADD COLUMN IF NOT EXISTS site varchar(100);

COMMENT ON COLUMN greentarget.locations.site IS
  'Short customer location label appended after the primary billing address in Green Target e-invoices.';

ALTER TABLE greentarget.customer_signups
  ADD COLUMN IF NOT EXISTS locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS einvoice_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tin_number varchar(20),
  ADD COLUMN IF NOT EXISTS id_type varchar(20),
  ADD COLUMN IF NOT EXISTS email varchar(255),
  ADD COLUMN IF NOT EXISTS state varchar(2),
  ADD COLUMN IF NOT EXISTS einvoice_validated_at timestamptz;

COMMENT ON COLUMN greentarget.customer_signups.locations IS
  'Snapshot array of requested locations, each containing site and address.';
COMMENT ON COLUMN greentarget.customer_signups.einvoice_requested IS
  'True when the public signup requested individual e-invoice details.';
COMMENT ON COLUMN greentarget.customer_signups.einvoice_validated_at IS
  'Time the submitted TIN, ID type and ID number were validated with MyInvois.';

UPDATE greentarget.customer_signups
SET locations = jsonb_build_array(
  jsonb_build_object('site', '', 'address', BTRIM(address))
)
WHERE jsonb_array_length(locations) = 0
  AND NULLIF(BTRIM(address), '') IS NOT NULL;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'greentarget.customer_signups'::regclass
      AND conname = 'customer_signups_locations_array_check'
  ) THEN
    ALTER TABLE greentarget.customer_signups
      ADD CONSTRAINT customer_signups_locations_array_check
      CHECK (jsonb_typeof(locations) = 'array');
  END IF;
END
$constraint$;

COMMIT;

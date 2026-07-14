BEGIN;

ALTER TABLE greentarget.customer_signups
  ADD COLUMN IF NOT EXISTS einvoice_id_number VARCHAR(50);

UPDATE greentarget.customer_signups
SET einvoice_id_number = id_number
WHERE einvoice_requested = TRUE
  AND NULLIF(BTRIM(einvoice_id_number), '') IS NULL;

COMMENT ON COLUMN greentarget.customer_signups.einvoice_id_number IS
  'Identity number paired with id_type and TIN for MyInvois validation; may differ from the signup IC/company number.';

COMMIT;

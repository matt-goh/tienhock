-- PKT/PCS rate units for the pay code system + RAMEN product line.
-- Adds PKT (Packet) and PCS (Pieces) to pay_codes.rate_unit, and re-types
-- the existing ramen product PM_PR from MEE to the new RAMEN product line.

BEGIN;

ALTER TABLE pay_codes DROP CONSTRAINT pay_codes_rate_unit_check;
ALTER TABLE pay_codes
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

-- The existing ramen finished-goods product becomes its own product line.
UPDATE products SET type = 'RAMEN' WHERE id = 'PM_PR';

COMMIT;

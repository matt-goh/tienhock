-- Migration: Add Tray rate unit to pay_codes system
-- Date: 2026-01-09
-- Description: Adds "Tray" as a new rate_unit option and updates BHANGKUT paycode

-- Step 1: Drop existing rate_unit constraint
ALTER TABLE pay_codes DROP CONSTRAINT IF EXISTS pay_codes_rate_unit_check;

-- Step 2: Add new constraint with "Tray" included
ALTER TABLE pay_codes ADD CONSTRAINT pay_codes_rate_unit_check
CHECK (rate_unit::text = ANY (ARRAY['Hour', 'Bill', 'Day', 'Bag', 'Trip', 'Fixed', 'Percent', 'Tray']::text[]));

-- Step 3: Update BHANGKUT paycode to use Tray rate_unit
UPDATE pay_codes
SET rate_unit = 'Tray', requires_units_input = true
WHERE id = 'BHANGKUT';

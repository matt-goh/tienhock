-- Migration: Add location_code to commission_records table
-- This allows commission entries to be mapped to specific locations (16-24) in the salary report

-- Add the location_code column (nullable, as bonus entries don't have locations)
ALTER TABLE commission_records
ADD COLUMN IF NOT EXISTS location_code VARCHAR(2) DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN commission_records.location_code IS 'Location code for commission entries (16-24). NULL for bonus entries.';

-- Create index for efficient querying by location
CREATE INDEX IF NOT EXISTS idx_commission_records_location_code ON commission_records(location_code);

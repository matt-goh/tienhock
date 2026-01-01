-- Job Location Mappings Migration Script
-- This script creates the job_location_mappings table for mapping jobs to salary report locations.
-- Each job maps to exactly one location code (01-24).

-- ============================================
-- 1. Create the job_location_mappings table
-- ============================================
CREATE TABLE IF NOT EXISTS job_location_mappings (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(50) NOT NULL,
  location_code VARCHAR(2) NOT NULL,  -- "01" to "24"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id),  -- Each job maps to exactly ONE location
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_job_location_mappings_job_id ON job_location_mappings(job_id);
CREATE INDEX IF NOT EXISTS idx_job_location_mappings_location_code ON job_location_mappings(location_code);

-- ============================================
-- 2. Location Code Reference
-- ============================================
-- 01 = DIRECTOR'S REMUNERATION
-- 02 = OFFICE
-- 03 = SALESMAN
-- 04 = IKUT LORI
-- 05 = PENGANGKUTAN HABUK
-- 06 = JAGA BOILER
-- 07 = MESIN & SANGKUT MEE
-- 08 = PACKING MEE
-- 09 = MESIN BIHUN
-- 10 = SANGKUT BIHUN
-- 11 = PACKING BIHUN
-- 12 = PEKEBUN
-- 13 = TUKANG SAPU
-- 14 = KILANG KERJA LUAR (Maintenance)
-- 15 = OTHER SABARINA
-- 16 = COMM-MESIN MEE
-- 17 = COMM-MESIN BIHUN
-- 18 = COMM-KILANG
-- 19 = COMM-LORI
-- 20 = COMM-BOILER
-- 21 = COMM-FORKLIFT/CASE
-- 22 = KILANG HABUK
-- 23 = CUTI TAHUNAN (handled separately)
-- 24 = SPECIAL OT (handled separately)

-- ============================================
-- 3. Insert initial job-location mappings
-- ============================================
-- NOTE: Review and adjust these mappings based on actual business requirements.
-- Unmapped jobs will default to location "02" (OFFICE) in the salary report.

-- All job mappings based on actual jobs table
INSERT INTO job_location_mappings (job_id, location_code) VALUES
-- 02 = OFFICE
('OFFICE', '02'),

-- 03 = SALESMAN
('SALESMAN', '03'),
('SALESMAN_IKUT', '03'),

-- 04 = IKUT LORI
('DRIVER_IKUT', '04'),

-- 05 = PENGANGKUTAN HABUK
('DRIVER', '05'),

-- 06 = JAGA BOILER
('BOILER_JAGA', '06'),
('BOILER_MAN', '06'),

-- 07 = MESIN & SANGKUT MEE
('MEE_ROLL', '07'),
('MEE_TEPUNG', '07'),
('MEE_SANGKUT', '07'),
('MEE_FOREMAN', '07'),

-- 08 = PACKING MEE
('MEE_PACKING', '08'),

-- 09 = MESIN BIHUN
('BH_DEPAN', '09'),
('BH_BERAS', '09'),
('BH_CAMPURAN', '09'),
('BH_DRYER', '09'),
('BH_FOREMAN', '09'),
('BIHUN_FOREMAN', '09'),

-- 10 = SANGKUT BIHUN
('BH_SANGKUT', '10'),
('BIHUN_SANGKUT', '10'),

-- 11 = PACKING BIHUN
('BH_PACKING', '11'),

-- 12 = PEKEBUN
('PEKEBUN', '12'),

-- 13 = TUKANG SAPU
('SAPU', '13'),

-- 14 = KILANG KERJA LUAR (Maintenance)
('MAINTEN', '14')

ON CONFLICT (job_id) DO NOTHING;

-- ============================================
-- 4. Verification queries
-- ============================================
-- Check all mappings:
-- SELECT jlm.*, j.name as job_name
-- FROM job_location_mappings jlm
-- LEFT JOIN jobs j ON jlm.job_id = j.id
-- ORDER BY jlm.location_code, jlm.job_id;

-- Find unmapped jobs:
-- SELECT j.id, j.name
-- FROM jobs j
-- LEFT JOIN job_location_mappings jlm ON j.id = jlm.job_id
-- WHERE jlm.job_id IS NULL
-- ORDER BY j.name;

-- Count jobs per location:
-- SELECT jlm.location_code, COUNT(*) as job_count
-- FROM job_location_mappings jlm
-- GROUP BY jlm.location_code
-- ORDER BY jlm.location_code;

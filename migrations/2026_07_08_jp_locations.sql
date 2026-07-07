-- Jelly Polly location catalogue (clone of the TH public.locations system).
-- Adds jellypolly.locations, jellypolly.job_location_mappings and
-- jellypolly.employee_job_location_exclusions, seeded with the 8 JP locations
-- mapped 1:1 onto the 8 JP jobs. Employee direct locations live on the
-- existing jellypolly.staffs.location JSONB array.
-- Idempotent; run via:
--   docker exec -i tienhock_dev_db psql -U postgres -d tienhock < migrations/2026_07_08_jp_locations.sql

BEGIN;

CREATE TABLE IF NOT EXISTS jellypolly.locations (
  id   VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS jellypolly.job_location_mappings (
  id            SERIAL PRIMARY KEY,
  job_id        VARCHAR(20) NOT NULL UNIQUE REFERENCES jellypolly.jobs(id) ON DELETE CASCADE,
  location_code VARCHAR(10) NOT NULL REFERENCES jellypolly.locations(id),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jp_job_location_mappings_job_id
  ON jellypolly.job_location_mappings (job_id);
CREATE INDEX IF NOT EXISTS idx_jp_job_location_mappings_location_code
  ON jellypolly.job_location_mappings (location_code);

CREATE TABLE IF NOT EXISTS jellypolly.employee_job_location_exclusions (
  id            SERIAL PRIMARY KEY,
  employee_id   VARCHAR(255) NOT NULL REFERENCES jellypolly.staffs(id) ON DELETE CASCADE,
  job_id        VARCHAR(20) NOT NULL REFERENCES jellypolly.jobs(id) ON DELETE CASCADE,
  location_code VARCHAR(10) NOT NULL REFERENCES jellypolly.locations(id) ON DELETE CASCADE,
  reason        TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by    VARCHAR(255),
  UNIQUE (employee_id, job_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_jp_exclusions_employee
  ON jellypolly.employee_job_location_exclusions (employee_id);
CREATE INDEX IF NOT EXISTS idx_jp_exclusions_location
  ON jellypolly.employee_job_location_exclusions (location_code);

INSERT INTO jellypolly.locations (id, name) VALUES
  ('01', 'Office'),
  ('02', 'Maintenance'),
  ('03', 'Salesman'),
  ('04', 'Ikut Lori'),
  ('05', 'Ice Polly Machine'),
  ('06', 'Jelly Cup Machine'),
  ('07', 'Plastic Machine'),
  ('08', 'Ice Polly Packing & Jelly Cup Packing')
ON CONFLICT (id) DO NOTHING;

-- Seed job mappings so the reworked salary report matches the previous
-- job_type grouping on day one (editable on the JP Location page).
INSERT INTO jellypolly.job_location_mappings (job_id, location_code) VALUES
  ('JP_OFFICE',        '01'),
  ('JP_MAINTEN',       '02'),
  ('JP_SALESMAN',      '03'),
  ('JP_SALESMAN_IKUT', '04'),
  ('JP_ICE_POLLY',     '05'),
  ('JP_JELLY_CUP',     '06'),
  ('JP_PLASTIC',       '07'),
  ('JP_PACKING',       '08')
ON CONFLICT (job_id) DO NOTHING;

COMMIT;

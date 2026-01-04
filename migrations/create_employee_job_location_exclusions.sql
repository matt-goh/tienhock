-- Create employee_job_location_exclusions table
-- This table stores exclusions to prevent specific employee-job combinations
-- from appearing in a location's salary report

CREATE TABLE IF NOT EXISTS employee_job_location_exclusions (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(20) NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  job_id VARCHAR(50) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  location_code VARCHAR(10) NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(20),
  UNIQUE(employee_id, job_id, location_code)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_exclusions_employee ON employee_job_location_exclusions(employee_id);
CREATE INDEX IF NOT EXISTS idx_exclusions_location ON employee_job_location_exclusions(location_code);

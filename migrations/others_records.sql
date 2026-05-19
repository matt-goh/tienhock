CREATE TABLE IF NOT EXISTS others_records (
  id          SERIAL PRIMARY KEY,
  employee_id VARCHAR NOT NULL REFERENCES staffs(id),
  record_date DATE NOT NULL,
  pay_code_id VARCHAR REFERENCES pay_codes(id),
  description TEXT NOT NULL,
  rate        NUMERIC(10, 2) NOT NULL,
  rate_unit   VARCHAR NOT NULL,
  quantity    NUMERIC(10, 2) NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL,
  created_by  VARCHAR,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS others_records_employee_date_idx
  ON others_records (employee_id, record_date);

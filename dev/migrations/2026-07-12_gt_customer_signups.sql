-- Public Green Target customer registration form: review queue table.
-- Submissions from the open (unauthenticated) signup form land here as 'pending'.
-- Staff review them and one-click convert into greentarget.customers (+ locations).

CREATE TABLE IF NOT EXISTS greentarget.customer_signups (
  signup_id       SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,          -- Nama penuh @ Syarikat
  id_number       VARCHAR(50),                    -- IC No @ No Syarikat
  phone_number    VARCHAR(30),                    -- Telephone No
  address         TEXT,                           -- Alamat
  payment_method  VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash','online','qr')),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processed','rejected')),
  customer_id     INTEGER REFERENCES greentarget.customers(customer_id) ON DELETE SET NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  processed_by    VARCHAR(50),
  submitted_ip    VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_gt_signups_status
  ON greentarget.customer_signups(status, submitted_at DESC);

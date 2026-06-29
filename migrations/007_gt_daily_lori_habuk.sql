-- 007_gt_daily_lori_habuk.sql
-- Green Target Payroll Phase 3 — Daily Lori Habuk driver entry.
-- Records DRIVER pay per day as trip lines (rentals-derived PLACEMENT/PICKUP/
-- ADDON lines prefilled, manual habuk trips added on top, >6-trips/day TRIP_LB6
-- bonus). Monthly processing reads these saved daily logs instead of computing
-- DRIVER pay from live rentals.
--
-- 2-tier, keyed by (log_date, employee_id) to fit the date-centric per-driver
-- card save/load.
--
-- Idempotent: safe to run more than once.

BEGIN;

-- ------------------------------------------------------------------
-- 1. Daily log header (one per driver per day)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.daily_lori_habuk_logs (
  id          SERIAL PRIMARY KEY,
  log_date    DATE NOT NULL,
  employee_id VARCHAR(50) NOT NULL REFERENCES public.staffs(id),
  status      VARCHAR(20) NOT NULL DEFAULT 'Submitted',
  created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by  VARCHAR(50),
  CONSTRAINT daily_lori_habuk_logs_date_emp_uniq UNIQUE (log_date, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_gt_daily_lori_habuk_logs_date
  ON greentarget.daily_lori_habuk_logs (log_date);

-- ------------------------------------------------------------------
-- 2. Daily trip lines (per log)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.daily_lori_habuk_lines (
  id          SERIAL PRIMARY KEY,
  log_id      INTEGER NOT NULL REFERENCES greentarget.daily_lori_habuk_logs(id) ON DELETE CASCADE,
  pay_code_id VARCHAR(50) REFERENCES public.pay_codes(id),
  quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
  rate_used   NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  source_type VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  rental_id   INTEGER REFERENCES greentarget.rentals(rental_id) ON DELETE SET NULL,
  description TEXT,
  is_manual   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT daily_lori_habuk_lines_source_type_chk
    CHECK (source_type IN ('PLACEMENT','PICKUP','ADDON','MANUAL','DERIVED'))
);

CREATE INDEX IF NOT EXISTS idx_gt_daily_lori_habuk_lines_log_id
  ON greentarget.daily_lori_habuk_lines (log_id);

COMMIT;

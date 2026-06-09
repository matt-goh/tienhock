-- account_opening_balances
-- GL opening-balance anchors (gap 1A-7; first used by the Bank Statement report, item 1B-1).
-- One signed amount per (account_code, as_of_date): DR-positive for assets. The Bank
-- Statement report seeds its brought-forward balance from the latest anchor whose
-- as_of_date is on/before the period start, adds posted lines in [as_of_date, period_start),
-- and ignores everything before the anchor (discards pre-cutover/migration noise).
--
-- Apply: docker exec -i tienhock_dev_db psql -U postgres -d tienhock < sql/account_opening_balances.sql

CREATE TABLE IF NOT EXISTS account_opening_balances (
  id          SERIAL PRIMARY KEY,
  account_code VARCHAR(50) NOT NULL REFERENCES account_codes(code),
  as_of_date  DATE NOT NULL,
  amount      NUMERIC(15, 2) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by  VARCHAR(50),
  CONSTRAINT account_opening_balances_unique UNIQUE (account_code, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_account_opening_balances_account
  ON account_opening_balances (account_code, as_of_date);

-- Per-user favourites for the Chart of Accounts list.
-- Idempotent and safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS account_code_favourites (
  id           SERIAL PRIMARY KEY,
  staff_id     VARCHAR(255) NOT NULL
               REFERENCES staffs(id) ON UPDATE CASCADE ON DELETE CASCADE,
  account_code VARCHAR(50) NOT NULL
               REFERENCES account_codes(code) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT account_code_favourites_staff_account_unique
    UNIQUE (staff_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_account_code_favourites_account_code
  ON account_code_favourites (account_code);

COMMENT ON TABLE account_code_favourites IS
  'Per-staff favourite account codes used to prioritise the Chart of Accounts list.';

COMMIT;

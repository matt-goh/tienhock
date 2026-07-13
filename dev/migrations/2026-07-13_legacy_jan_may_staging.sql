-- =============================================================================
-- Auditable staging table for the Jan-May 2026 legacy ledger import.
-- Generated rows are replaced from the hash-validated CSV on every import run;
-- final journals/opening anchors remain in their normal accounting tables.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS import_legacy_rows (
  stage_sequence integer PRIMARY KEY,
  record_kind varchar(20) NOT NULL CHECK (record_kind IN ('opening', 'transaction')),
  source_file varchar(255) NOT NULL,
  source_kind varchar(20) NOT NULL CHECK (source_kind IN ('THLD', 'THDB', 'DERIVED')),
  source_sha256 char(64) NOT NULL,
  source_physical_line integer,
  source_row_index integer,
  injected_after_physical_line integer,
  legacy_account_code varchar(50) NOT NULL,
  account_code varchar(50) NOT NULL,
  account_description text NOT NULL,
  entry_date date NOT NULL,
  journal_ref varchar(100),
  journal_group_key varchar(255),
  line_display_reference varchar(100),
  particulars text,
  cheque_reference varchar(100),
  debit_cents bigint NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents bigint NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  running_balance_cents bigint,
  provenance varchar(100) NOT NULL,
  repaired boolean NOT NULL DEFAULT false,
  repair_reason text,
  special_case varchar(100),
  loaded_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (debit_cents = 0 OR credit_cents = 0),
  CHECK (
    (record_kind = 'opening' AND running_balance_cents IS NOT NULL)
    OR
    (record_kind = 'transaction'
      AND journal_ref IS NOT NULL
      AND journal_group_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_import_legacy_rows_group
  ON import_legacy_rows (entry_date, journal_group_key)
  WHERE record_kind = 'transaction';

CREATE INDEX IF NOT EXISTS idx_import_legacy_rows_account
  ON import_legacy_rows (account_code, entry_date, stage_sequence);

COMMIT;

SELECT COUNT(*) AS staged_rows FROM import_legacy_rows;

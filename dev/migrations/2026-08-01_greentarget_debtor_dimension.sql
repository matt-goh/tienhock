-- Green Target debtor identity / GL-control separation
-- ----------------------------------------------------
-- The legacy system kept two distinct dimensions for sundry debtors:
--   * every counter invoice/receipt posted to the CD_SD GL control; and
--   * the Trade Debtors schedule carried a separate named CD/SD identity.
--
-- GT-P2 temporarily represented the 746 printed schedule identities as active
-- GL children. This migration restores the legacy model without changing a
-- cent: debtor_account_code becomes the logical debtor identity, invoices
-- snapshot the actual receivable GL account separately, and journal lines carry
-- the logical identity as a non-monetary dimension.
--
-- This migration is intentionally fail-closed and idempotent. It accepts only
-- the exact pre-migration checkpoint or its exact post-migration state.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Required predecessor schema and immutable baselines
-- ---------------------------------------------------------------------------

DO $predecessor_guard$
BEGIN
  IF to_regclass('greentarget.account_codes') IS NULL
     OR to_regclass('greentarget.account_opening_balances') IS NULL
     OR to_regclass('greentarget.journal_entries') IS NULL
     OR to_regclass('greentarget.journal_entry_lines') IS NULL
     OR to_regclass('greentarget.customers') IS NULL
     OR to_regclass('greentarget.invoices') IS NULL
     OR to_regclass('greentarget.payments') IS NULL
     OR to_regclass('greentarget.receipts') IS NULL
     OR to_regclass('greentarget.adjustment_documents') IS NULL
     OR to_regclass('greentarget.debtor_subledger_snapshots') IS NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension migration requires the GT accounting, receipt and CD_SD sub-schedule migrations first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'greentarget'
       AND table_name = 'customers'
       AND column_name = 'debtor_account_code'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'greentarget'
       AND table_name = 'invoices'
       AND column_name = 'debtor_account_code'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'greentarget'
       AND table_name = 'invoices'
       AND column_name = 'revenue_account_code'
  ) THEN
    RAISE EXCEPTION
      'GT debtor-dimension migration requires the invoice account-snapshot columns';
  END IF;
END
$predecessor_guard$;

-- These relations are compared again at the tail. The migration deliberately
-- changes no journal header, no amount, and no pre-July opening anchor.
CREATE TEMP TABLE gt_debtor_dimension_header_baseline ON COMMIT DROP AS
SELECT * FROM greentarget.journal_entries;

CREATE TEMP TABLE gt_debtor_dimension_line_money_baseline ON COMMIT DROP AS
SELECT COUNT(*)::bigint AS row_count,
       COALESCE(SUM(debit_amount), 0)::numeric AS debit_total,
       COALESCE(SUM(credit_amount), 0)::numeric AS credit_total
  FROM greentarget.journal_entry_lines;

CREATE TEMP TABLE gt_debtor_dimension_prejuly_anchor_baseline ON COMMIT DROP AS
SELECT *
  FROM greentarget.account_opening_balances
 WHERE as_of_date < DATE '2026-07-01';

-- The evidence set is immutable: 746 printed identities plus one residual
-- metadata row. The residual is NOT a customer/debtor registry identity.
DO $snapshot_guard$
DECLARE
  v_visible_count integer;
  v_residual_count integer;
  v_close numeric;
  v_movement numeric;
  v_incomplete_evidence integer;
  v_duplicate_positions text;
BEGIN
  SELECT COUNT(*) FILTER (WHERE account_code <> 'CD_SD (UNALLOCATED)'),
         COUNT(*) FILTER (WHERE account_code = 'CD_SD (UNALLOCATED)'),
         COALESCE(SUM(closing_balance), 0),
         COALESCE(SUM(movement), 0),
         COUNT(*) FILTER (
           WHERE account_code <> 'CD_SD (UNALLOCATED)'
             AND (source_file IS NULL
                  OR source_sha256 IS NULL
                  OR source_page IS NULL
                  OR source_row IS NULL)
         )
    INTO v_visible_count, v_residual_count, v_close, v_movement,
         v_incomplete_evidence
    FROM greentarget.debtor_subledger_snapshots
   WHERE as_of_month = DATE '2026-06-01';

  IF (v_visible_count, v_residual_count, v_close, v_movement,
      v_incomplete_evidence)
       IS DISTINCT FROM
      (746, 1, 65705.40::numeric, -740.00::numeric, 0) THEN
    RAISE EXCEPTION
      'GT debtor-dimension snapshot guard failed: visible %, residual %, close %, movement %, incomplete evidence %',
      v_visible_count, v_residual_count, v_close, v_movement,
      v_incomplete_evidence;
  END IF;

  SELECT string_agg(format('page %s row %s', source_page, source_row), ', ')
    INTO v_duplicate_positions
    FROM (
      SELECT source_page, source_row
        FROM greentarget.debtor_subledger_snapshots
       WHERE as_of_month = DATE '2026-06-01'
         AND account_code <> 'CD_SD (UNALLOCATED)'
       GROUP BY source_page, source_row
      HAVING COUNT(*) <> 1
    ) duplicate_position;

  IF v_duplicate_positions IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension source-order guard found duplicate positions: %',
      v_duplicate_positions;
  END IF;
END
$snapshot_guard$;

-- The migration accepts either the exact split checkpoint made by GT-P2 or
-- the exact consolidated checkpoint made by a previous successful run.
DO $checkpoint_guard$
DECLARE
  v_child_shells integer;
  v_active_shells integer;
  v_child_anchor_count integer;
  v_child_anchor_total numeric;
  v_control_anchor numeric;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active)
    INTO v_child_shells, v_active_shells
    FROM greentarget.account_codes
   WHERE parent_code = 'CD_SD';

  IF v_child_shells <> 752 OR v_active_shells NOT IN (0, 752) THEN
    RAISE EXCEPTION
      'GT debtor-dimension account-shell guard failed: total %, active % (expected 752 and either 752 or 0)',
      v_child_shells, v_active_shells;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(aob.amount), 0)
    INTO v_child_anchor_count, v_child_anchor_total
    FROM greentarget.account_opening_balances aob
    JOIN greentarget.account_codes child ON child.code = aob.account_code
   WHERE child.parent_code = 'CD_SD'
     AND aob.as_of_date = DATE '2026-07-01';

  SELECT amount
    INTO v_control_anchor
    FROM greentarget.account_opening_balances
   WHERE account_code = 'CD_SD'
     AND as_of_date = DATE '2026-07-01';

  IF NOT (
    (v_child_anchor_count = 746
      AND v_child_anchor_total = 63845.40
      AND v_control_anchor = 1860.00)
    OR
    (v_child_anchor_count = 0
      AND v_child_anchor_total = 0
      AND v_control_anchor = 65705.40)
  ) THEN
    RAISE EXCEPTION
      'GT debtor-dimension anchor guard failed: child rows %, child total %, CD_SD %',
      v_child_anchor_count, v_child_anchor_total, v_control_anchor;
  END IF;
END
$checkpoint_guard$;

-- ---------------------------------------------------------------------------
-- 1. Durable logical-debtor registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS greentarget.debtor_subledger_registry (
  code                  varchar(50) PRIMARY KEY,
  description           varchar(255) NOT NULL,
  control_account_code  varchar(50) NOT NULL,
  kind                  varchar(20) NOT NULL,
  effective_from        date NOT NULL,
  effective_to          date,
  sort_order            integer NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  is_selectable         boolean NOT NULL DEFAULT true,
  source_file           text,
  source_sha256         text,
  source_page           integer,
  source_row            integer,
  provenance            text NOT NULL,
  notes                 text,
  created_by            varchar(50),
  updated_by            varchar(50),
  created_at            timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gt_debtor_subledger_registry_control_fkey
    FOREIGN KEY (control_account_code)
    REFERENCES greentarget.account_codes(code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT gt_debtor_subledger_registry_kind_check
    CHECK (kind IN ('named', 'sundry', 'control', 'reconciliation')),
  CONSTRAINT gt_debtor_subledger_registry_named_control_check
    CHECK (kind <> 'named' OR control_account_code = code),
  CONSTRAINT gt_debtor_subledger_registry_sundry_control_check
    CHECK (kind <> 'sundry' OR control_account_code = 'CD_SD'),
  CONSTRAINT gt_debtor_subledger_registry_dates_check
    -- effective_to is exclusive, so an identity must have a non-empty range.
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT gt_debtor_subledger_registry_source_page_check
    CHECK (source_page IS NULL OR source_page > 0),
  CONSTRAINT gt_debtor_subledger_registry_source_row_check
    CHECK (source_row IS NULL OR source_row > 0),
  CONSTRAINT gt_debtor_subledger_registry_source_hash_check
    CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT gt_debtor_subledger_registry_selectable_check
    CHECK (is_selectable = false OR kind IN ('named', 'sundry'))
);

CREATE UNIQUE INDEX IF NOT EXISTS gt_debtor_subledger_registry_code_ci_uq
  ON greentarget.debtor_subledger_registry (UPPER(BTRIM(code)));

CREATE INDEX IF NOT EXISTS idx_gt_debtor_subledger_registry_control
  ON greentarget.debtor_subledger_registry (control_account_code);

CREATE INDEX IF NOT EXISTS idx_gt_debtor_subledger_registry_effective
  ON greentarget.debtor_subledger_registry (effective_from, effective_to);

DO $registry_shape_guard$
DECLARE
  v_bad text;
BEGIN
  WITH expected(column_name, formatted_type, required) AS (
    VALUES
      ('code', 'character varying(50)', true),
      ('description', 'character varying(255)', true),
      ('control_account_code', 'character varying(50)', true),
      ('kind', 'character varying(20)', true),
      ('effective_from', 'date', true),
      ('effective_to', 'date', false),
      ('sort_order', 'integer', true),
      ('is_active', 'boolean', true),
      ('is_selectable', 'boolean', true),
      ('source_page', 'integer', false),
      ('source_row', 'integer', false),
      ('created_by', 'character varying(50)', false),
      ('updated_by', 'character varying(50)', false)
  )
  SELECT string_agg(expected.column_name, ', ' ORDER BY expected.column_name)
    INTO v_bad
    FROM expected
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = 'greentarget.debtor_subledger_registry'::regclass
     AND attribute.attname = expected.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
   WHERE attribute.attname IS NULL
      OR format_type(attribute.atttypid, attribute.atttypmod) <> expected.formatted_type
      OR (expected.required AND NOT attribute.attnotnull)
      OR (NOT expected.required AND attribute.attnotnull);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension registry has incompatible column(s): %', v_bad;
  END IF;
END
$registry_shape_guard$;

-- The 746 PDF identities are immutable evidence. Operational lifecycle fields
-- may change, but their printed code/name/source position and routing cannot be
-- rewritten by a later UI edit.
CREATE OR REPLACE FUNCTION greentarget.guard_legacy_debtor_registry_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.provenance = 'legacy_cd_sd_trade_debtors_schedule' THEN
      RAISE EXCEPTION
        'Legacy GT debtor identity % is immutable evidence', OLD.code;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.provenance = 'legacy_cd_sd_trade_debtors_schedule'
     AND (NEW.code, NEW.description, NEW.control_account_code, NEW.kind,
          NEW.effective_from, NEW.sort_order, NEW.source_file,
          NEW.source_sha256, NEW.source_page, NEW.source_row, NEW.provenance)
         IS DISTINCT FROM
         (OLD.code, OLD.description, OLD.control_account_code, OLD.kind,
          OLD.effective_from, OLD.sort_order, OLD.source_file,
          OLD.source_sha256, OLD.source_page, OLD.source_row, OLD.provenance) THEN
    RAISE EXCEPTION
      'Legacy GT debtor identity % is immutable evidence', OLD.code;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS gt_guard_legacy_debtor_registry_evidence
  ON greentarget.debtor_subledger_registry;
CREATE TRIGGER gt_guard_legacy_debtor_registry_evidence
BEFORE UPDATE OR DELETE ON greentarget.debtor_subledger_registry
FOR EACH ROW
EXECUTE FUNCTION greentarget.guard_legacy_debtor_registry_evidence();

CREATE TEMP TABLE gt_expected_july_sundry (
  customer_id  integer PRIMARY KEY,
  code         varchar(50) UNIQUE NOT NULL,
  description  varchar(255) NOT NULL
) ON COMMIT DROP;

INSERT INTO gt_expected_july_sundry (customer_id, code, description)
VALUES
  (57, 'CD-ZEXIE',     'ZEXIE CARMELIA'),
  (61, 'CD-MIZAN',     'MIZAN'),
  (62, 'CD-ALISWODI',  'ALIS WODI'),
  (63, 'CD-ABE',       'ABE'),
  (64, 'CD-KELVINYAP', 'KELVIN YAP'),
  (65, 'CD-MIMIEE',    'MIMIE E');

DO $july_identity_guard$
DECLARE
  v_mismatch text;
BEGIN
  SELECT string_agg(expected.code, ', ' ORDER BY expected.code)
    INTO v_mismatch
    FROM gt_expected_july_sundry expected
    LEFT JOIN greentarget.account_codes account ON account.code = expected.code
    LEFT JOIN greentarget.customers customer
      ON customer.customer_id = expected.customer_id
   WHERE account.code IS NULL
      OR account.description IS DISTINCT FROM expected.description
      OR account.parent_code IS DISTINCT FROM 'CD_SD'
      OR account.ledger_type IS DISTINCT FROM 'TD'
      OR customer.customer_id IS NULL
      OR customer.debtor_account_code IS DISTINCT FROM expected.code;

  IF v_mismatch IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension July identity guard failed for: %', v_mismatch;
  END IF;
END
$july_identity_guard$;

CREATE TEMP TABLE gt_desired_debtor_registry (
  code                  varchar(50) PRIMARY KEY,
  description           varchar(255) NOT NULL,
  control_account_code  varchar(50) NOT NULL,
  kind                  varchar(20) NOT NULL,
  -- Nullable only in this staging relation so the explicit first-use guard
  -- below can name any July identity whose evidence date is missing.
  effective_from        date,
  effective_to          date,
  sort_order            integer NOT NULL,
  is_active             boolean NOT NULL,
  is_selectable         boolean NOT NULL,
  source_file           text,
  source_sha256         text,
  source_page           integer,
  source_row            integer,
  provenance            text NOT NULL,
  notes                 text
) ON COMMIT DROP;

-- The 28 direct legacy debtors include 27 selectable named accounts and the
-- non-selectable CD_SD control. Their GL control is themselves.
INSERT INTO gt_desired_debtor_registry (
  code, description, control_account_code, kind,
  effective_from, effective_to, sort_order, is_active, is_selectable,
  source_file, source_sha256, source_page, source_row, provenance, notes
)
SELECT account.code,
       account.description,
       account.code,
       CASE WHEN account.code = 'CD_SD' THEN 'control' ELSE 'named' END,
       DATE '2026-01-01',
       NULL,
       account.sort_order,
       true,
       account.code <> 'CD_SD',
       NULL,
       NULL,
       NULL,
       NULL,
       CASE WHEN account.code = 'CD_SD'
            THEN 'legacy_cd_sd_control'
            ELSE 'legacy_named_trade_debtor'
       END,
       account.notes
  FROM greentarget.account_codes account
 WHERE account.parent_code = 'DEBTOR'
   AND account.ledger_type = 'TD';

-- The 746 printed identities use the June evidence row for immutable name,
-- page/row order and provenance. effective_from is the first available
-- identity-level snapshot month (May 2026, used by June's previous column).
INSERT INTO gt_desired_debtor_registry (
  code, description, control_account_code, kind,
  effective_from, effective_to, sort_order, is_active, is_selectable,
  source_file, source_sha256, source_page, source_row, provenance, notes
)
SELECT snapshot.account_code,
       account.description,
       'CD_SD',
       'sundry',
       DATE '2026-05-01',
       NULL,
       account.sort_order,
       true,
       true,
       snapshot.source_file,
       snapshot.source_sha256,
       snapshot.source_page,
       snapshot.source_row,
       'legacy_cd_sd_trade_debtors_schedule',
       snapshot.notes
  FROM greentarget.debtor_subledger_snapshots snapshot
  JOIN greentarget.account_codes account
    ON account.code = snapshot.account_code
 WHERE snapshot.as_of_month = DATE '2026-06-01'
   AND snapshot.account_code <> 'CD_SD (UNALLOCATED)';

-- The six user-approved July identities append after the frozen legacy order.
-- Their effective date is the first invoice or posting date evidenced on disk.
INSERT INTO gt_desired_debtor_registry (
  code, description, control_account_code, kind,
  effective_from, effective_to, sort_order, is_active, is_selectable,
  source_file, source_sha256, source_page, source_row, provenance, notes
)
SELECT expected.code,
       expected.description,
       'CD_SD',
       'sundry',
       first_use.effective_from,
       NULL,
       account.sort_order,
       true,
       true,
       NULL,
       NULL,
       NULL,
       NULL,
       'july_2026_user_approved_sundry_identity',
       '[GT-JULY-20260731] User-approved post-cutover CD/SD identity.'
  FROM gt_expected_july_sundry expected
  JOIN greentarget.account_codes account ON account.code = expected.code
  CROSS JOIN LATERAL (
    SELECT MIN(event_date)::date AS effective_from
      FROM (
        SELECT invoice.date_issued AS event_date
          FROM greentarget.invoices invoice
         WHERE invoice.debtor_account_code = expected.code
        UNION ALL
        SELECT journal.entry_date AS event_date
          FROM greentarget.journal_entry_lines line
          JOIN greentarget.journal_entries journal
            ON journal.id = line.journal_entry_id
         WHERE line.account_code = expected.code
      ) evidence
  ) first_use;

DO $desired_registry_guard$
DECLARE
  v_rows integer;
  v_named integer;
  v_control integer;
  v_sundry integer;
  v_bad_dates text;
  v_bad_order text;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE kind = 'named'),
         COUNT(*) FILTER (WHERE kind = 'control'),
         COUNT(*) FILTER (WHERE kind = 'sundry')
    INTO v_rows, v_named, v_control, v_sundry
    FROM gt_desired_debtor_registry;

  IF (v_rows, v_named, v_control, v_sundry)
       IS DISTINCT FROM (780, 27, 1, 752) THEN
    RAISE EXCEPTION
      'GT debtor-dimension desired registry failed: rows %, named %, control %, sundry %',
      v_rows, v_named, v_control, v_sundry;
  END IF;

  SELECT string_agg(expected.code, ', ' ORDER BY expected.code)
    INTO v_bad_dates
    FROM gt_expected_july_sundry expected
    JOIN gt_desired_debtor_registry desired ON desired.code = expected.code
   WHERE desired.effective_from IS NULL
      OR desired.effective_from < DATE '2026-07-01'
      OR desired.effective_from >= DATE '2026-08-01';

  IF v_bad_dates IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension July identities lack a July first-use date: %',
      v_bad_dates;
  END IF;

  SELECT string_agg(expected.code, ', ' ORDER BY expected.code)
    INTO v_bad_order
    FROM gt_expected_july_sundry expected
    JOIN gt_desired_debtor_registry desired ON desired.code = expected.code
   WHERE desired.sort_order <= (
     SELECT MAX(legacy.sort_order)
       FROM gt_desired_debtor_registry legacy
      WHERE legacy.kind = 'sundry'
        AND legacy.source_page IS NOT NULL
   );

  IF v_bad_order IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension July identities do not append after legacy order: %',
      v_bad_order;
  END IF;
END
$desired_registry_guard$;

-- Never rewrite evidence-backed registry rows on rerun. An existing mismatch is
-- an audit failure, not something this migration should silently repair.
INSERT INTO greentarget.debtor_subledger_registry (
  code, description, control_account_code, kind,
  effective_from, effective_to, sort_order, is_active, is_selectable,
  source_file, source_sha256, source_page, source_row, provenance, notes,
  created_by, updated_by
)
SELECT code, description, control_account_code, kind,
       effective_from, effective_to, sort_order, is_active, is_selectable,
       source_file, source_sha256, source_page, source_row, provenance, notes,
       'GT_DEBTOR_DIMENSION_20260801', 'GT_DEBTOR_DIMENSION_20260801'
  FROM gt_desired_debtor_registry
ON CONFLICT (code) DO NOTHING;

DO $persisted_registry_guard$
DECLARE
  v_matched integer;
  v_unexpected_residual integer;
BEGIN
  SELECT COUNT(*)
    INTO v_matched
    FROM gt_desired_debtor_registry desired
    JOIN greentarget.debtor_subledger_registry actual
      ON actual.code = desired.code
   WHERE (actual.description, actual.control_account_code, actual.kind,
          actual.effective_from, actual.effective_to, actual.sort_order,
          actual.is_active, actual.is_selectable, actual.source_file,
          actual.source_sha256, actual.source_page, actual.source_row,
          actual.provenance, actual.notes)
         IS NOT DISTINCT FROM
         (desired.description, desired.control_account_code, desired.kind,
          desired.effective_from, desired.effective_to, desired.sort_order,
          desired.is_active, desired.is_selectable, desired.source_file,
          desired.source_sha256, desired.source_page, desired.source_row,
          desired.provenance, desired.notes);

  IF v_matched <> 780 THEN
    RAISE EXCEPTION
      'GT debtor-dimension registry persistence guard matched % of 780 rows',
      v_matched;
  END IF;

  SELECT COUNT(*)
    INTO v_unexpected_residual
    FROM greentarget.debtor_subledger_registry
   WHERE code = 'CD_SD (UNALLOCATED)'
      OR kind = 'reconciliation';

  IF v_unexpected_residual <> 0 THEN
    RAISE EXCEPTION
      'GT debtor-dimension residual must remain snapshot metadata, not a registry identity';
  END IF;
END
$persisted_registry_guard$;

-- ---------------------------------------------------------------------------
-- 2. Invoice GL snapshot and journal-line debtor dimension
-- ---------------------------------------------------------------------------

ALTER TABLE greentarget.invoices
  ADD COLUMN IF NOT EXISTS receivable_account_code varchar(50);

ALTER TABLE greentarget.journal_entry_lines
  ADD COLUMN IF NOT EXISTS debtor_subledger_code varchar(50);

DO $new_column_fk_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'greentarget.invoices'::regclass
       AND conname = 'gt_invoices_receivable_account_code_fkey'
  ) THEN
    ALTER TABLE greentarget.invoices
      ADD CONSTRAINT gt_invoices_receivable_account_code_fkey
      FOREIGN KEY (receivable_account_code)
      REFERENCES greentarget.account_codes(code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'greentarget.journal_entry_lines'::regclass
       AND conname = 'gt_journal_lines_debtor_subledger_code_fkey'
  ) THEN
    ALTER TABLE greentarget.journal_entry_lines
      ADD CONSTRAINT gt_journal_lines_debtor_subledger_code_fkey
      FOREIGN KEY (debtor_subledger_code)
      REFERENCES greentarget.debtor_subledger_registry(code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END
$new_column_fk_guard$;

CREATE INDEX IF NOT EXISTS idx_gt_invoices_receivable_account
  ON greentarget.invoices (receivable_account_code);

CREATE INDEX IF NOT EXISTS idx_gt_journal_lines_debtor_subledger
  ON greentarget.journal_entry_lines (debtor_subledger_code);

-- First use source-owned invoice journals as evidence for invoices that do not
-- already carry an identity. A line tag wins on rerun; otherwise an exact
-- registry code on the old receivable line is deterministic. A bare CD_SD line
-- is not treated as a named identity except for the separately guarded 342.
WITH source_candidates AS (
  SELECT invoice.invoice_id,
         COALESCE(line.debtor_subledger_code, line.account_code) AS debtor_code
    FROM greentarget.invoices invoice
    JOIN greentarget.journal_entries journal
      ON journal.source_type = 'invoice'
     AND journal.source_id = invoice.invoice_id::text
    JOIN greentarget.journal_entry_lines line
      ON line.journal_entry_id = journal.id
    JOIN greentarget.debtor_subledger_registry registry
      ON registry.code = COALESCE(line.debtor_subledger_code, line.account_code)
   WHERE COALESCE(BTRIM(invoice.debtor_account_code), '') = ''
     AND line.debit_amount > 0
     AND COALESCE(line.debtor_subledger_code, line.account_code) <> 'CD_SD'
), unique_candidates AS (
  SELECT invoice_id, MIN(debtor_code) AS debtor_code
    FROM source_candidates
   GROUP BY invoice_id
  HAVING COUNT(DISTINCT debtor_code) = 1
)
UPDATE greentarget.invoices invoice
   SET debtor_account_code = candidate.debtor_code
  FROM unique_candidates candidate
 WHERE invoice.invoice_id = candidate.invoice_id
   AND COALESCE(BTRIM(invoice.debtor_account_code), '') = '';

-- A customer's already-approved identity is the next permissible source. This
-- fills, among others, the one genuine open pre-cutover invoice 324.
UPDATE greentarget.invoices invoice
   SET debtor_account_code = customer.debtor_account_code
  FROM greentarget.customers customer
  JOIN greentarget.debtor_subledger_registry registry
    ON registry.code = customer.debtor_account_code
 WHERE customer.customer_id = invoice.customer_id
   AND COALESCE(BTRIM(invoice.debtor_account_code), '') = '';

DO $explicit_invoice_guard$
DECLARE
  v_324 greentarget.invoices%ROWTYPE;
  v_342 greentarget.invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_324
    FROM greentarget.invoices
   WHERE invoice_id = 324;
  IF NOT FOUND
     OR v_324.invoice_number IS DISTINCT FROM '2026/01000'
     OR v_324.customer_id IS DISTINCT FROM 18
     OR v_324.debtor_account_code IS DISTINCT FROM 'K-TRANSPORT' THEN
    RAISE EXCEPTION
      'GT debtor-dimension invoice 324 is not the evidenced K-TRANSPORT open invoice';
  END IF;

  SELECT * INTO v_342
    FROM greentarget.invoices
   WHERE invoice_id = 342;
  IF NOT FOUND
     OR v_342.invoice_number IS DISTINCT FROM '2026/01009'
     OR v_342.status IS DISTINCT FROM 'cancelled'
     OR v_342.debtor_account_code IS DISTINCT FROM 'CD_SD' THEN
    RAISE EXCEPTION
      'GT debtor-dimension invoice 342 is not the retained cancelled CD_SD duplicate';
  END IF;
END
$explicit_invoice_guard$;

-- The registry determines the GL control. Set only an empty snapshot; a
-- pre-existing mismatch must survive to the following guard and abort.
UPDATE greentarget.invoices invoice
   SET receivable_account_code = registry.control_account_code
  FROM greentarget.debtor_subledger_registry registry
 WHERE registry.code = invoice.debtor_account_code
   AND COALESCE(BTRIM(invoice.receivable_account_code), '') = '';

DO $identity_reference_guard$
DECLARE
  v_bad_customers text;
  v_bad_invoices text;
  v_bad_receivables text;
  v_unresolved_live text;
BEGIN
  SELECT string_agg(format('%s:%s', customer.customer_id, customer.debtor_account_code), ', ')
    INTO v_bad_customers
    FROM greentarget.customers customer
    LEFT JOIN greentarget.debtor_subledger_registry registry
      ON registry.code = customer.debtor_account_code
   WHERE customer.debtor_account_code IS NOT NULL
     AND registry.code IS NULL;

  IF v_bad_customers IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension customer identity is absent from registry: %',
      v_bad_customers;
  END IF;

  SELECT string_agg(format('%s:%s', invoice.invoice_id, invoice.debtor_account_code), ', ')
    INTO v_bad_invoices
    FROM greentarget.invoices invoice
    LEFT JOIN greentarget.debtor_subledger_registry registry
      ON registry.code = invoice.debtor_account_code
   WHERE invoice.debtor_account_code IS NOT NULL
     AND registry.code IS NULL;

  IF v_bad_invoices IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension invoice identity is absent from registry: %',
      v_bad_invoices;
  END IF;

  SELECT string_agg(format('%s:%s/%s', invoice.invoice_id,
                           invoice.debtor_account_code,
                           invoice.receivable_account_code), ', ')
    INTO v_bad_receivables
    FROM greentarget.invoices invoice
    JOIN greentarget.debtor_subledger_registry registry
      ON registry.code = invoice.debtor_account_code
   WHERE invoice.receivable_account_code IS DISTINCT FROM registry.control_account_code;

  IF v_bad_receivables IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension invoice GL snapshot disagrees with registry: %',
      v_bad_receivables;
  END IF;

  SELECT string_agg(format('%s:%s', invoice.invoice_id, invoice.invoice_number), ', ')
    INTO v_unresolved_live
    FROM greentarget.invoices invoice
    LEFT JOIN greentarget.debtor_subledger_registry registry
      ON registry.code = invoice.debtor_account_code
   WHERE invoice.date_issued >= DATE '2026-07-01'
     AND invoice.status IS DISTINCT FROM 'cancelled'
     AND COALESCE(invoice.is_consolidated, false) = false
     AND (registry.code IS NULL
          OR registry.is_active IS DISTINCT FROM true
          OR registry.is_selectable IS DISTINCT FROM true
          OR invoice.receivable_account_code IS DISTINCT FROM registry.control_account_code);

  IF v_unresolved_live IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension active post-cutover invoice is unresolved: %',
      v_unresolved_live;
  END IF;
END
$identity_reference_guard$;

-- debtor_account_code now references the logical registry, not the GL chart.
-- Retain the established constraint names so schema inspection remains stable.
DO $identity_fk_rewire$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'greentarget.customers'::regclass
       AND conname = 'gt_customers_debtor_account_code_fkey'
       AND confrelid = 'greentarget.debtor_subledger_registry'::regclass
  ) THEN
    ALTER TABLE greentarget.customers
      DROP CONSTRAINT IF EXISTS gt_customers_debtor_account_code_fkey;
    ALTER TABLE greentarget.customers
      ADD CONSTRAINT gt_customers_debtor_account_code_fkey
      FOREIGN KEY (debtor_account_code)
      REFERENCES greentarget.debtor_subledger_registry(code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'greentarget.invoices'::regclass
       AND conname = 'gt_invoices_debtor_account_code_fkey'
       AND confrelid = 'greentarget.debtor_subledger_registry'::regclass
  ) THEN
    ALTER TABLE greentarget.invoices
      DROP CONSTRAINT IF EXISTS gt_invoices_debtor_account_code_fkey;
    ALTER TABLE greentarget.invoices
      ADD CONSTRAINT gt_invoices_debtor_account_code_fkey
      FOREIGN KEY (debtor_account_code)
      REFERENCES greentarget.debtor_subledger_registry(code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END
$identity_fk_rewire$;

-- ---------------------------------------------------------------------------
-- 3. Rewrite post-cutover debtor lines to their real GL control
-- ---------------------------------------------------------------------------

-- A line already on a former CD_SD child identifies itself deterministically.
-- Refuse a conflicting pre-existing tag before changing the GL account.
DO $child_line_tag_guard$
DECLARE
  v_conflict text;
BEGIN
  SELECT string_agg(line.id::text, ', ' ORDER BY line.id)
    INTO v_conflict
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.journal_entries journal ON journal.id = line.journal_entry_id
    JOIN greentarget.debtor_subledger_registry registry
      ON registry.code = line.account_code
     AND registry.kind = 'sundry'
     AND registry.control_account_code = 'CD_SD'
   WHERE journal.entry_date >= DATE '2026-07-01'
     AND line.debtor_subledger_code IS NOT NULL
     AND line.debtor_subledger_code IS DISTINCT FROM line.account_code;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension child line has a conflicting debtor tag: %',
      v_conflict;
  END IF;
END
$child_line_tag_guard$;

UPDATE greentarget.journal_entry_lines line
   SET debtor_subledger_code = registry.code,
       account_code = registry.control_account_code
  FROM greentarget.journal_entries journal,
       greentarget.debtor_subledger_registry registry
 WHERE journal.id = line.journal_entry_id
   AND journal.entry_date >= DATE '2026-07-01'
   AND registry.code = line.account_code
   AND registry.kind = 'sundry'
   AND registry.control_account_code = 'CD_SD';

-- Direct control lines must be attributed from source ownership. Never infer
-- identity from particulars or a human-formatted reference.
CREATE TEMP TABLE gt_debtor_line_tag_candidates (
  line_id      integer NOT NULL,
  debtor_code  varchar(50) NOT NULL
) ON COMMIT DROP;

-- Invoice-owned S journal: its debit receivable line belongs to the invoice's
-- snapshotted identity.
INSERT INTO gt_debtor_line_tag_candidates (line_id, debtor_code)
SELECT line.id, invoice.debtor_account_code
  FROM greentarget.journal_entries journal
  JOIN greentarget.invoices invoice
    ON journal.source_type = 'invoice'
   AND journal.source_id = invoice.invoice_id::text
  JOIN greentarget.debtor_subledger_registry registry
    ON registry.code = invoice.debtor_account_code
  JOIN greentarget.journal_entry_lines line
    ON line.journal_entry_id = journal.id
   AND line.account_code = registry.control_account_code
   AND line.debit_amount > 0
 WHERE journal.entry_date >= DATE '2026-07-01';

-- Receipt-owned REC journal: allocation line order is the durable payment_id
-- order used by payment-journal.js. This works for posted and later-cancelled
-- receipts and does not inspect the free-text invoice reference.
WITH receipt_allocations AS (
  SELECT payment.receipt_id,
         invoice.debtor_account_code,
         ROW_NUMBER() OVER (
           PARTITION BY payment.receipt_id
           ORDER BY payment.payment_id
         )::integer AS allocation_line
    FROM greentarget.payments payment
    JOIN greentarget.invoices invoice ON invoice.invoice_id = payment.invoice_id
)
INSERT INTO gt_debtor_line_tag_candidates (line_id, debtor_code)
SELECT line.id, allocation.debtor_account_code
  FROM greentarget.journal_entries journal
  JOIN receipt_allocations allocation
    ON journal.source_type = 'receipt'
   AND journal.source_id ~ '^[0-9]+$'
   AND journal.source_id::integer = allocation.receipt_id
  JOIN greentarget.debtor_subledger_registry registry
    ON registry.code = allocation.debtor_account_code
  JOIN greentarget.journal_entry_lines line
    ON line.journal_entry_id = journal.id
   AND line.line_number = allocation.allocation_line
   AND line.account_code = registry.control_account_code
 WHERE journal.entry_date >= DATE '2026-07-01';

-- The one superseded per-payment path is retained only as cancelled audit
-- history; source_id is payment_id, so its invoice remains deterministic.
INSERT INTO gt_debtor_line_tag_candidates (line_id, debtor_code)
SELECT line.id, invoice.debtor_account_code
  FROM greentarget.journal_entries journal
  JOIN greentarget.payments payment
    ON journal.source_type = 'payment'
   AND journal.source_id ~ '^[0-9]+$'
   AND journal.source_id::integer = payment.payment_id
  JOIN greentarget.invoices invoice ON invoice.invoice_id = payment.invoice_id
  JOIN greentarget.debtor_subledger_registry registry
    ON registry.code = invoice.debtor_account_code
  JOIN greentarget.journal_entry_lines line
    ON line.journal_entry_id = journal.id
   AND line.account_code = registry.control_account_code
 WHERE journal.entry_date >= DATE '2026-07-01';

-- Adjustment-owned CN/DN/RN journals inherit the original invoice identity.
INSERT INTO gt_debtor_line_tag_candidates (line_id, debtor_code)
SELECT line.id, invoice.debtor_account_code
  FROM greentarget.journal_entries journal
  JOIN greentarget.adjustment_documents adjustment
    ON journal.source_type = 'adjustment'
   AND journal.source_id = adjustment.id
  JOIN greentarget.invoices invoice
    ON invoice.invoice_id = adjustment.original_invoice_id
  JOIN greentarget.debtor_subledger_registry registry
    ON registry.code = invoice.debtor_account_code
  JOIN greentarget.journal_entry_lines line
    ON line.journal_entry_id = journal.id
   AND line.account_code = registry.control_account_code
 WHERE journal.entry_date >= DATE '2026-07-01';

DO $line_candidate_guard$
DECLARE
  v_conflict text;
BEGIN
  SELECT string_agg(line_id::text, ', ' ORDER BY line_id)
    INTO v_conflict
    FROM (
      SELECT line_id
        FROM gt_debtor_line_tag_candidates
       GROUP BY line_id
      HAVING COUNT(DISTINCT debtor_code) <> 1
    ) conflict;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension source ownership maps a journal line to multiple identities: %',
      v_conflict;
  END IF;
END
$line_candidate_guard$;

CREATE TEMP TABLE gt_debtor_line_tag_map ON COMMIT DROP AS
SELECT line_id, MIN(debtor_code)::varchar(50) AS debtor_code
  FROM gt_debtor_line_tag_candidates
 GROUP BY line_id;

DO $existing_line_tag_guard$
DECLARE
  v_conflict text;
BEGIN
  SELECT string_agg(line.id::text, ', ' ORDER BY line.id)
    INTO v_conflict
    FROM gt_debtor_line_tag_map mapping
    JOIN greentarget.journal_entry_lines line ON line.id = mapping.line_id
   WHERE line.debtor_subledger_code IS NOT NULL
     AND line.debtor_subledger_code IS DISTINCT FROM mapping.debtor_code;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension source-owned line already has a conflicting tag: %',
      v_conflict;
  END IF;
END
$existing_line_tag_guard$;

UPDATE greentarget.journal_entry_lines line
   SET debtor_subledger_code = mapping.debtor_code
  FROM gt_debtor_line_tag_map mapping
 WHERE mapping.line_id = line.id
   AND line.debtor_subledger_code IS NULL;

DO $post_rewrite_line_guard$
DECLARE
  v_remaining_children text;
  v_untagged_control text;
  v_bad_control text;
  v_bad_active_source text;
BEGIN
  SELECT string_agg(line.id::text, ', ' ORDER BY line.id)
    INTO v_remaining_children
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.account_codes account ON account.code = line.account_code
   WHERE account.parent_code = 'CD_SD';

  IF v_remaining_children IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension journal line(s) still post to former CD_SD GL children: %',
      v_remaining_children;
  END IF;

  SELECT string_agg(line.id::text, ', ' ORDER BY line.id)
    INTO v_untagged_control
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.journal_entries journal ON journal.id = line.journal_entry_id
   WHERE journal.entry_date >= DATE '2026-07-01'
     AND line.account_code = 'CD_SD'
     AND line.debtor_subledger_code IS NULL;

  IF v_untagged_control IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension post-cutover CD_SD line(s) need explicit identity assignment: %',
      v_untagged_control;
  END IF;

  SELECT string_agg(line.id::text, ', ' ORDER BY line.id)
    INTO v_bad_control
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.debtor_subledger_registry registry
      ON registry.code = line.debtor_subledger_code
   WHERE line.debtor_subledger_code IS NOT NULL
     AND line.account_code IS DISTINCT FROM registry.control_account_code;

  IF v_bad_control IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension line tag disagrees with its GL control: %',
      v_bad_control;
  END IF;

  SELECT string_agg(line.id::text, ', ' ORDER BY line.id)
    INTO v_bad_active_source
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.journal_entries journal ON journal.id = line.journal_entry_id
    JOIN greentarget.debtor_subledger_registry registry
      ON registry.code = line.debtor_subledger_code
   WHERE journal.entry_date >= DATE '2026-07-01'
     AND journal.status = 'posted'
     AND journal.source_type IN ('invoice', 'receipt', 'payment', 'adjustment')
     AND registry.control_account_code = 'CD_SD'
     AND (registry.is_active IS DISTINCT FROM true
          OR registry.is_selectable IS DISTINCT FROM true);

  IF v_bad_active_source IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension active organic journal uses a non-selectable identity: %',
      v_bad_active_source;
  END IF;
END
$post_rewrite_line_guard$;

-- ---------------------------------------------------------------------------
-- 4. Restore one CD_SD GL checkpoint and retire the temporary GL shells
-- ---------------------------------------------------------------------------

INSERT INTO greentarget.account_opening_balances (
  account_code, as_of_date, amount, notes, created_by
)
VALUES (
  'CD_SD',
  DATE '2026-07-01',
  65705.40,
  'GT CD_SD consolidated control checkpoint at 2026-07-01: RM63,845.40 evidenced named sub-schedule plus RM1,860.00 printed-control residual. Logical identities live in greentarget.debtor_subledger_registry.',
  'GT_DEBTOR_DIMENSION_20260801'
)
ON CONFLICT (account_code, as_of_date) DO UPDATE
   SET amount = EXCLUDED.amount,
       notes = EXCLUDED.notes,
       created_by = EXCLUDED.created_by,
       updated_at = CURRENT_TIMESTAMP
 WHERE (greentarget.account_opening_balances.amount,
        greentarget.account_opening_balances.notes,
        greentarget.account_opening_balances.created_by)
       IS DISTINCT FROM
       (EXCLUDED.amount, EXCLUDED.notes, EXCLUDED.created_by);

DELETE FROM greentarget.account_opening_balances opening
 USING greentarget.account_codes child
 WHERE opening.account_code = child.code
   AND child.parent_code = 'CD_SD'
   AND opening.as_of_date = DATE '2026-07-01';

DO $shell_retirement_guard$
DECLARE
  v_openings text;
  v_lines text;
  v_revenue_refs text;
  v_bank_refs text;
BEGIN
  SELECT string_agg(opening.account_code, ', ' ORDER BY opening.account_code)
    INTO v_openings
    FROM greentarget.account_opening_balances opening
    JOIN greentarget.account_codes child ON child.code = opening.account_code
   WHERE child.parent_code = 'CD_SD';

  IF v_openings IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension former CD_SD GL shell still has opening anchor(s): %',
      v_openings;
  END IF;

  SELECT string_agg(line.id::text, ', ' ORDER BY line.id)
    INTO v_lines
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.account_codes child ON child.code = line.account_code
   WHERE child.parent_code = 'CD_SD';

  IF v_lines IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension former CD_SD GL shell still has journal line(s): %',
      v_lines;
  END IF;

  SELECT string_agg(invoice.invoice_id::text, ', ' ORDER BY invoice.invoice_id)
    INTO v_revenue_refs
    FROM greentarget.invoices invoice
    JOIN greentarget.account_codes child
      ON child.code = invoice.revenue_account_code
   WHERE child.parent_code = 'CD_SD';

  IF v_revenue_refs IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension former CD_SD shell is used as invoice revenue: %',
      v_revenue_refs;
  END IF;

  SELECT string_agg(receipt.id::text, ', ' ORDER BY receipt.id)
    INTO v_bank_refs
    FROM greentarget.receipts receipt
    JOIN greentarget.account_codes child ON child.code = receipt.bank_account
   WHERE child.parent_code = 'CD_SD';

  IF v_bank_refs IS NOT NULL THEN
    RAISE EXCEPTION
      'GT debtor-dimension former CD_SD shell is used as a receipt bank: %',
      v_bank_refs;
  END IF;
END
$shell_retirement_guard$;

UPDATE greentarget.account_codes
   SET is_active = false,
       notes = CASE
         WHEN COALESCE(notes, '') LIKE '%[GT-DEBTOR-DIMENSION-20260801]%'
           THEN notes
         ELSE CONCAT_WS(' ', NULLIF(notes, ''),
                '[GT-DEBTOR-DIMENSION-20260801] Retired GL shell; the code remains active as a logical debtor identity in greentarget.debtor_subledger_registry and posts through CD_SD.')
       END,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = 'GT_DEBTOR_DIMENSION_20260801'
 WHERE parent_code = 'CD_SD'
   AND (is_active IS DISTINCT FROM false
        OR COALESCE(notes, '') NOT LIKE '%[GT-DEBTOR-DIMENSION-20260801]%');

-- ---------------------------------------------------------------------------
-- 5. Exact post-conditions and monetary invariants
-- ---------------------------------------------------------------------------

DO $structural_tail_guard$
DECLARE
  v_total_shells integer;
  v_active_shells integer;
  v_registry_rows integer;
  v_registry_selectable integer;
  v_child_anchor_count integer;
  v_control_anchor numeric;
  v_header_diff integer;
  v_prejuly_anchor_diff integer;
  v_line_count bigint;
  v_line_debit numeric;
  v_line_credit numeric;
  v_base_count bigint;
  v_base_debit numeric;
  v_base_credit numeric;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active)
    INTO v_total_shells, v_active_shells
    FROM greentarget.account_codes
   WHERE parent_code = 'CD_SD';

  IF (v_total_shells, v_active_shells) IS DISTINCT FROM (752, 0) THEN
    RAISE EXCEPTION
      'GT debtor-dimension shell retirement failed: total %, active %',
      v_total_shells, v_active_shells;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active AND is_selectable)
    INTO v_registry_rows, v_registry_selectable
    FROM greentarget.debtor_subledger_registry registry
   WHERE registry.code IN (SELECT code FROM gt_desired_debtor_registry);

  IF (v_registry_rows, v_registry_selectable) IS DISTINCT FROM (780, 779) THEN
    RAISE EXCEPTION
      'GT debtor-dimension registry activation failed: desired %, selectable %',
      v_registry_rows, v_registry_selectable;
  END IF;

  SELECT COUNT(*)
    INTO v_child_anchor_count
    FROM greentarget.account_opening_balances opening
    JOIN greentarget.account_codes child ON child.code = opening.account_code
   WHERE child.parent_code = 'CD_SD'
     AND opening.as_of_date = DATE '2026-07-01';

  SELECT amount
    INTO v_control_anchor
    FROM greentarget.account_opening_balances
   WHERE account_code = 'CD_SD'
     AND as_of_date = DATE '2026-07-01';

  IF v_child_anchor_count <> 0 OR v_control_anchor IS DISTINCT FROM 65705.40 THEN
    RAISE EXCEPTION
      'GT debtor-dimension consolidated anchor failed: child rows %, control %',
      v_child_anchor_count, v_control_anchor;
  END IF;

  SELECT COUNT(*) INTO v_header_diff
    FROM (
      (SELECT * FROM gt_debtor_dimension_header_baseline
       EXCEPT
       SELECT * FROM greentarget.journal_entries)
      UNION ALL
      (SELECT * FROM greentarget.journal_entries
       EXCEPT
       SELECT * FROM gt_debtor_dimension_header_baseline)
    ) difference;
  IF v_header_diff <> 0 THEN
    RAISE EXCEPTION
      'GT debtor-dimension changed journal header evidence (% differing rows)',
      v_header_diff;
  END IF;

  SELECT COUNT(*) INTO v_prejuly_anchor_diff
    FROM (
      (SELECT * FROM gt_debtor_dimension_prejuly_anchor_baseline
       EXCEPT
       SELECT * FROM greentarget.account_opening_balances
        WHERE as_of_date < DATE '2026-07-01')
      UNION ALL
      (SELECT * FROM greentarget.account_opening_balances
        WHERE as_of_date < DATE '2026-07-01'
       EXCEPT
       SELECT * FROM gt_debtor_dimension_prejuly_anchor_baseline)
    ) difference;
  IF v_prejuly_anchor_diff <> 0 THEN
    RAISE EXCEPTION
      'GT debtor-dimension changed pre-July opening evidence (% differing rows)',
      v_prejuly_anchor_diff;
  END IF;

  SELECT row_count, debit_total, credit_total
    INTO v_base_count, v_base_debit, v_base_credit
    FROM gt_debtor_dimension_line_money_baseline;
  SELECT COUNT(*), COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
    INTO v_line_count, v_line_debit, v_line_credit
    FROM greentarget.journal_entry_lines;

  IF (v_line_count, v_line_debit, v_line_credit)
       IS DISTINCT FROM (v_base_count, v_base_debit, v_base_credit) THEN
    RAISE EXCEPTION
      'GT debtor-dimension changed journal money: rows %/%, DR %/%, CR %/%',
      v_line_count, v_base_count, v_line_debit, v_base_debit,
      v_line_credit, v_base_credit;
  END IF;
END
$structural_tail_guard$;

DO $july_money_guard$
DECLARE
  v_cd_sd_movement numeric;
  v_named_movement numeric;
  v_td_movement numeric;
  v_pbb_movement numeric;
  v_cd_sd_close numeric;
  v_td_close numeric;
BEGIN
  SELECT COALESCE(SUM(line.debit_amount - line.credit_amount), 0)
    INTO v_cd_sd_movement
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.journal_entries journal ON journal.id = line.journal_entry_id
   WHERE journal.status = 'posted'
     AND journal.entry_date >= DATE '2026-07-01'
     AND journal.entry_date < DATE '2026-08-01'
     AND line.account_code = 'CD_SD';

  SELECT COALESCE(SUM(line.debit_amount - line.credit_amount), 0)
    INTO v_named_movement
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.journal_entries journal ON journal.id = line.journal_entry_id
    JOIN greentarget.account_codes account ON account.code = line.account_code
   WHERE journal.status = 'posted'
     AND journal.entry_date >= DATE '2026-07-01'
     AND journal.entry_date < DATE '2026-08-01'
     AND account.parent_code = 'DEBTOR'
     AND account.ledger_type = 'TD'
     AND account.code <> 'CD_SD';

  SELECT COALESCE(SUM(line.debit_amount - line.credit_amount), 0)
    INTO v_td_movement
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.journal_entries journal ON journal.id = line.journal_entry_id
    JOIN greentarget.account_codes account ON account.code = line.account_code
   WHERE journal.status = 'posted'
     AND journal.entry_date >= DATE '2026-07-01'
     AND journal.entry_date < DATE '2026-08-01'
     AND account.parent_code = 'DEBTOR'
     AND account.ledger_type = 'TD';

  SELECT COALESCE(SUM(line.debit_amount - line.credit_amount), 0)
    INTO v_pbb_movement
    FROM greentarget.journal_entry_lines line
    JOIN greentarget.journal_entries journal ON journal.id = line.journal_entry_id
   WHERE journal.status = 'posted'
     AND journal.entry_date >= DATE '2026-07-01'
     AND journal.entry_date < DATE '2026-08-01'
     AND line.account_code = 'PBB_1';

  v_cd_sd_close := 65705.40 + v_cd_sd_movement;

  WITH direct_debtors AS (
    SELECT code
      FROM greentarget.account_codes
     WHERE parent_code = 'DEBTOR'
       AND ledger_type = 'TD'
  ), latest_anchor AS (
    SELECT debtor.code,
           anchor.as_of_date,
           COALESCE(anchor.amount, 0) AS amount
      FROM direct_debtors debtor
      LEFT JOIN LATERAL (
        SELECT opening.as_of_date, opening.amount
          FROM greentarget.account_opening_balances opening
         WHERE opening.account_code = debtor.code
           AND opening.as_of_date <= DATE '2026-07-31'
         ORDER BY opening.as_of_date DESC
         LIMIT 1
      ) anchor ON true
  ), movement AS (
    SELECT debtor.code,
           COALESCE(SUM(
             CASE WHEN journal.id IS NOT NULL
                  THEN line.debit_amount - line.credit_amount
                  ELSE 0
             END
           ), 0) AS amount
      FROM direct_debtors debtor
      LEFT JOIN latest_anchor anchor ON anchor.code = debtor.code
      LEFT JOIN greentarget.journal_entry_lines line
        ON line.account_code = debtor.code
      LEFT JOIN greentarget.journal_entries journal
        ON journal.id = line.journal_entry_id
       AND journal.status = 'posted'
       AND journal.entry_date >= COALESCE(anchor.as_of_date, DATE '2026-01-01')
       AND journal.entry_date <= DATE '2026-07-31'
     GROUP BY debtor.code
  )
  SELECT COALESCE(SUM(anchor.amount + movement.amount), 0)
    INTO v_td_close
    FROM latest_anchor anchor
    JOIN movement ON movement.code = anchor.code;

  IF (v_cd_sd_movement, v_named_movement, v_td_movement,
      v_pbb_movement, v_cd_sd_close, v_td_close)
       IS DISTINCT FROM
      (1710.00::numeric, 410.00::numeric, 2120.00::numeric,
       730.00::numeric, 67415.40::numeric, 158902.22::numeric) THEN
    RAISE EXCEPTION
      'GT debtor-dimension July money failed: CD_SD move %, named move %, TD move %, PBB_1 move %, CD_SD close %, TD close %',
      v_cd_sd_movement, v_named_movement, v_td_movement,
      v_pbb_movement, v_cd_sd_close, v_td_close;
  END IF;
END
$july_money_guard$;

DO $final_notice$
BEGIN
  RAISE NOTICE
    'GT debtor dimension ready: 780 logical identities (779 selectable), 752 GL child shells retired, CD_SD 2026-07-01 control anchor RM65,705.40, July CD_SD movement RM1,710.00, July total TD movement RM2,120.00.';
END
$final_notice$;

COMMIT;

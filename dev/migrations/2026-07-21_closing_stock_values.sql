\set ON_ERROR_STOP on

-- V3 monthly closing stock: keyed report-level injection source, 21 Jul 2026.
--
-- Context: the legacy system injected month-end closing stock into the
-- Balance Sheet (notes 14-1/14-2/14-3), the Income Statement (14-1) and the
-- CoGM (14-2/14-3) at REPORT level from its stock module; the printed legacy
-- Trial Balances carry the CS_* accounts at .00 every month (V1/ST-b proof).
-- The ERP mirrors that mechanism exactly: this table holds the user-keyed
-- confirmed month-end values (one row per year/month/note), the statement
-- engines inject them at report level, and the GL (anchors/journals/TB) is
-- deliberately untouched so TB parity with the printed reports is preserved.
--
-- This migration creates the table and seeds the May 2026 scanned acceptance
-- figures (Balance_Sheet_for_May_2026.pdf): 14-1 = 188,979.60 (finished
-- goods), 14-2 = 336,909.82 (raw materials), 14-3 = 182,194.43 (packing
-- materials), total 708,083.85. Later months are keyed by users on the
-- Material Stock page, not by migrations. Idempotent: a rerun while the exact
-- seeded state holds verifies it and performs zero writes; any drifted May
-- state aborts (like the other one-time legacy-parity gates, the standing
-- verifier is the harness, not a migration rerun).

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

SELECT pg_advisory_xact_lock(
  hashtextextended('closing_stock_values_20260721', 0)
);

-- Preflight: the three closing-stock notes must exist as active Balance Sheet
-- notes (the injection targets) before the table can reference them.
DO $preflight$
BEGIN
  IF NOT (
    SELECT COUNT(*) = 3
      FROM financial_statement_notes
     WHERE code IN ('14-1', '14-2', '14-3')
       AND is_active
       AND report_section = 'balance_sheet'
  ) THEN
    RAISE EXCEPTION 'closing-stock notes 14-1/14-2/14-3 are missing, inactive, or not balance_sheet notes; aborting';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS closing_stock_values (
  id         serial PRIMARY KEY,
  year       integer NOT NULL,
  month      smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  fs_note    varchar(20) NOT NULL REFERENCES financial_statement_notes(code)
             CHECK (fs_note IN ('14-1', '14-2', '14-3')),
  amount     numeric(15,2) NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_by varchar(255),
  updated_by varchar(255),
  UNIQUE (year, month, fs_note)
);

-- State detection: fresh = no May 2026 rows yet; final = the exact seeded
-- rows; anything else is drift and aborts.
CREATE TEMP TABLE cs_state (
  mode varchar(10) PRIMARY KEY CHECK (mode IN ('fresh', 'final'))
) ON COMMIT DROP;

DO $state$
DECLARE
  v_count bigint;
  v_total numeric(15,2);
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_count, v_total
    FROM closing_stock_values
   WHERE year = 2026 AND month = 5;

  IF v_count = 0 THEN
    INSERT INTO cs_state (mode) VALUES ('fresh');
  ELSIF v_count = 3 AND v_total = 708083.85 AND NOT EXISTS (
    SELECT 1
      FROM (VALUES
        ('14-1', 188979.60::numeric),
        ('14-2', 336909.82::numeric),
        ('14-3', 182194.43::numeric)
      ) AS expected (fs_note, amount)
      LEFT JOIN closing_stock_values csv
        ON csv.year = 2026 AND csv.month = 5 AND csv.fs_note = expected.fs_note
     WHERE csv.amount IS NULL OR csv.amount <> expected.amount
  ) THEN
    INSERT INTO cs_state (mode) VALUES ('final');
  ELSE
    RAISE EXCEPTION
      'May 2026 closing_stock_values rows are in a drifted state (% rows, total %); aborting rather than overwriting keyed values',
      v_count, v_total;
  END IF;
END
$state$;

-- Seed the scanned May 2026 acceptance figures (fresh mode only).
INSERT INTO closing_stock_values (year, month, fs_note, amount)
SELECT 2026, 5, expected.fs_note, expected.amount
  FROM (VALUES
    ('14-1', 188979.60::numeric),
    ('14-2', 336909.82::numeric),
    ('14-3', 182194.43::numeric)
  ) AS expected (fs_note, amount)
 WHERE (SELECT mode FROM cs_state) = 'fresh'
ON CONFLICT (year, month, fs_note) DO NOTHING;

-- Post-verification: exactly the three pinned rows with the pinned total.
DO $verify$
DECLARE
  v_count bigint;
  v_total numeric(15,2);
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_count, v_total
    FROM closing_stock_values
   WHERE year = 2026 AND month = 5;

  IF v_count <> 3 OR v_total <> 708083.85 THEN
    RAISE EXCEPTION 'post-check failed: % rows, total % (expected 3 rows, 708083.85)', v_count, v_total;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('14-1', 188979.60::numeric),
        ('14-2', 336909.82::numeric),
        ('14-3', 182194.43::numeric)
      ) AS expected (fs_note, amount)
      LEFT JOIN closing_stock_values csv
        ON csv.year = 2026 AND csv.month = 5 AND csv.fs_note = expected.fs_note
     WHERE csv.amount IS NULL OR csv.amount <> expected.amount
  ) THEN
    RAISE EXCEPTION 'post-check failed: a May 2026 row differs from its pinned scanned figure';
  END IF;

  RAISE NOTICE 'closing_stock_values verified: 3 May 2026 rows totalling 708,083.85';
END
$verify$;

COMMIT;

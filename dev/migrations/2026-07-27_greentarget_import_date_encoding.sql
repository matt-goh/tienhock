-- Green Target Phase G4 - add `date_encoding` to greentarget.import_legacy_rows.
--
-- WHY THIS COLUMN EXISTS (user decision, 26 Jul 2026)
--
-- Handover section 3a's date rule is the single highest-risk item in the whole
-- Green Target project: column B of both workbooks holds entry dates in TWO
-- cell kinds, and reading them the same way silently corrupts 1,570 dates.
--
--   numeric, style s=2 (numFmtId 14, mm-dd-yy)  Excel parsed a DD/MM/YYYY text
--                                               with day <= 12 as a US date and
--                                               TRANSPOSED day and month, so the
--                                               serial must be converted and
--                                               then swapped back.
--   shared string                               day > 12, so Excel could not
--                                               read it as a US date and left it
--                                               verbatim; parse as DD/MM/YYYY.
--
-- prove-date-rule.mjs shows 614 of the numeric cells land outside Jan-Jun 2026
-- without the swap - and the other 956 land INSIDE the period while being
-- silently wrong (2 May read as 5 Feb). `date_encoding` records, per row, which
-- branch recovered that row's date, so a future session can audit any imported
-- date's provenance directly instead of re-running the parser over the
-- workbooks. It is a deliberate divergence from the Tien Hock table shape, in
-- the same spirit as G2's GTLD/GTDB/DERIVED source_kind values.
--
-- Values: 'serial-swapped' (1,569) | 'literal-text' (1,900) | 'derived' (1,434
-- rows synthesised in G4, which have no source cell at all).
--
-- Guarded, idempotent, and reruns as an exact no-op. Touches no Tien Hock table.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regclass('greentarget.import_legacy_rows') IS NULL THEN
    RAISE EXCEPTION
      'greentarget.import_legacy_rows is missing - apply 2026-07-26_greentarget_accounting_foundation.sql first';
  END IF;

  -- The column is provenance for a rule that only makes sense while the two
  -- source kinds exist. If G2's CHECK ever changes, stop and re-read section 3a.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'gt_import_legacy_rows_source_kind_ck'
       AND conrelid = 'greentarget.import_legacy_rows'::regclass
  ) THEN
    RAISE EXCEPTION 'The GTLD/GTDB/DERIVED source_kind CHECK is missing from greentarget.import_legacy_rows';
  END IF;
END
$guard$;

ALTER TABLE greentarget.import_legacy_rows
  ADD COLUMN IF NOT EXISTS date_encoding varchar(20);

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'gt_import_legacy_rows_date_encoding_ck'
       AND conrelid = 'greentarget.import_legacy_rows'::regclass
  ) THEN
    ALTER TABLE greentarget.import_legacy_rows
      ADD CONSTRAINT gt_import_legacy_rows_date_encoding_ck
      CHECK (date_encoding IN ('serial-swapped', 'literal-text', 'derived'));
  END IF;
END
$constraint$;

DO $verify$
DECLARE
  v_th_accounts bigint;
  v_th_journals bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'greentarget'
       AND table_name = 'import_legacy_rows'
       AND column_name = 'date_encoding'
       AND data_type = 'character varying'
  ) THEN
    RAISE EXCEPTION 'date_encoding was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'gt_import_legacy_rows_date_encoding_ck'
       AND conrelid = 'greentarget.import_legacy_rows'::regclass
  ) THEN
    RAISE EXCEPTION 'The date_encoding CHECK was not created';
  END IF;

  -- Any row already loaded must carry a recognised encoding.
  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows WHERE date_encoding IS NULL
  ) THEN
    RAISE EXCEPTION
      'greentarget.import_legacy_rows holds % rows with no date_encoding - reload staging with load-staging.mjs',
      (SELECT COUNT(*) FROM greentarget.import_legacy_rows WHERE date_encoding IS NULL);
  END IF;

  SELECT (SELECT COUNT(*) FROM public.account_codes),
         (SELECT COUNT(*) FROM public.journal_entries)
    INTO v_th_accounts, v_th_journals;
  IF (v_th_accounts, v_th_journals) IS DISTINCT FROM (2827::bigint, 8238::bigint) THEN
    RAISE EXCEPTION 'Tien Hock moved: account_codes %, journal_entries %',
      v_th_accounts, v_th_journals;
  END IF;

  RAISE NOTICE 'G4 date_encoding OK';
END
$verify$;

COMMIT;

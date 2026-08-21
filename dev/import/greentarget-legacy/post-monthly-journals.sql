-- Green Target Phase G4 - post one idempotent month of the hash-validated
-- Jan-Jun 2026 legacy ledger import.
--
--   docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--     -v ON_ERROR_STOP=1 -v month_start=2026-01-01 \
--     -f dev/import/greentarget-legacy/post-monthly-journals.sql
--
-- Run once per month start, 2026-01-01 .. 2026-06-01. Reruns are exact no-ops:
-- the header INSERT is ON CONFLICT (reference_no) DO NOTHING and the line
-- INSERT only fires for headers this statement actually created, so a second
-- run inserts 0 headers and 0 lines and then re-verifies everything.
--
-- The projection below MUST stay identical to the one in verify-import.sql. If
-- the two ever drift, verify-import.sql fails loudly rather than agreeing with
-- a broken loader.
--
-- Conventions (mirroring the 3,863 Tien Hock IMP journals in
-- public.journal_entries, read out of the database rather than guessed):
--   reference_no       IMP-YYYYMMDD-NNNN, deterministic and unique
--   entry_type         'IMP' - the internal type; native GT workflows are not
--                      activated by the import
--   legacy_entry_type  the decoded legacy family, stored verbatim so the column
--                      stays 1:1 with account-aliases.json journalFamilies[]
--   display_reference  the printed legacy reference (e.g. PBEB011/06)
--   posting_sequence   within-MONTH print order. Green Target's legacy report
--                      orders an account's rows by month and then by document
--                      type, NOT by date (JWDR/06/26 dated 30 Jun prints before
--                      PBEB004/06 dated 12 Jun), so a date sort cannot
--                      reproduce it. Measured: ordering by (month, journal_ref)
--                      in C collation reproduces every one of the 502 printed
--                      account sections with zero violations across all six
--                      months. G5 orders a ledger by
--                      (DATE_TRUNC('month', entry_date), posting_sequence,
--                       display_order).
--   source_type/_id    'legacy_import' + the staging journal_group_key, so any
--                      posted line traces back to an exact workbook cell
--   cheque_no          always NULL - GT's cheque numbers are per LINE
--                      (789 PB cheques + 225 PBEB/PBE bank transaction ids)

\set ON_ERROR_STOP on
\if :{?month_start}
\else
  \echo 'month_start is required (allowed: 2026-01-01 through 2026-06-01)'
  \quit 3
\endif

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('greentarget_jan_jun_2026_journal_import', 0)
);

LOCK TABLE greentarget.import_legacy_rows IN SHARE MODE;
LOCK TABLE greentarget.account_codes IN SHARE MODE;
LOCK TABLE greentarget.journal_entries, greentarget.journal_entry_lines
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE import_batch_parameters (
  month_start          date PRIMARY KEY,
  month_end            date    NOT NULL,
  expected_journals    integer NOT NULL,
  expected_lines       integer NOT NULL,
  expected_derived     integer NOT NULL,
  expected_debit_cents bigint  NOT NULL
) ON COMMIT DROP;

INSERT INTO import_batch_parameters
SELECT expected.month_start,
       (expected.month_start + INTERVAL '1 month')::date,
       expected.expected_journals,
       expected.expected_lines,
       expected.expected_derived,
       expected.expected_debit_cents
  FROM (VALUES
    (DATE '2026-01-01', 300, 736, 249, 15790466::bigint),
    (DATE '2026-02-01', 276, 777, 232, 16774455::bigint),
    (DATE '2026-03-01', 276, 716, 226, 16033859::bigint),
    (DATE '2026-04-01', 293, 765, 251, 15790099::bigint),
    (DATE '2026-05-01', 282, 708, 242, 14907765::bigint),
    (DATE '2026-06-01', 278, 699, 233, 15469870::bigint)
  ) AS expected(month_start, expected_journals, expected_lines,
                expected_derived, expected_debit_cents)
 WHERE expected.month_start = DATE :'month_start';

DO $preflight$
DECLARE
  v_total bigint;
  v_opening bigint;
  v_transaction bigint;
  v_derived bigint;
  v_groups bigint;
  v_debit numeric;
  v_credit numeric;
BEGIN
  IF (SELECT COUNT(*) FROM import_batch_parameters) <> 1 THEN
    RAISE EXCEPTION
      'Invalid month_start. Allowed values are the first days of January-June 2026.';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE record_kind = 'opening'),
         COUNT(*) FILTER (WHERE record_kind = 'transaction'),
         COUNT(*) FILTER (WHERE source_kind = 'DERIVED'),
         COUNT(DISTINCT journal_group_key) FILTER (WHERE record_kind = 'transaction'),
         COALESCE(SUM(debit_cents)  FILTER (WHERE record_kind = 'transaction'), 0),
         COALESCE(SUM(credit_cents) FILTER (WHERE record_kind = 'transaction'), 0)
    INTO v_total, v_opening, v_transaction, v_derived, v_groups, v_debit, v_credit
    FROM greentarget.import_legacy_rows;

  IF (v_total, v_opening, v_transaction, v_derived, v_groups, v_debit, v_credit)
     IS DISTINCT FROM
     (4903::bigint, 502::bigint, 4401::bigint, 1434::bigint, 1705::bigint,
      94766514::numeric, 94766514::numeric) THEN
    RAISE EXCEPTION
      'The loaded staging population no longer matches the audited G4 import (rows %, openings %, transactions %, derived %, groups %)',
      v_total, v_opening, v_transaction, v_derived, v_groups;
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE source_sha256 NOT IN (
       '71e32a0189c34fa75f404ca6a702662963c4bd508997da1359cc35e0a62e3f01',
       'fa735c756748e74601605ed479ead44f461ee468a53f99c070857f1c4bf9ab6b'
     )
  ) THEN
    RAISE EXCEPTION 'The loaded staging population contains an unapproved source hash';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM greentarget.journal_entry_types WHERE code = 'IMP' AND is_active
  ) THEN
    RAISE EXCEPTION 'The active IMP journal type is missing from greentarget.journal_entry_types';
  END IF;

  -- The exact imported account identities used by this batch are checked
  -- against desired_import_lines below. The live chart may legitimately hold
  -- additional post-cutover accounts beyond G3's 503-code legacy subset.

  -- Green Target posts organically only from 2026-07-01 (R2). A post-cutover
  -- journal is legitimate beside a rerun; only unexplained historical rows
  -- must stop the immutable Jan-Jun import. JV2606-01 is the sole approved
  -- source-less correction inside the locked period and is accepted only with
  -- its exact guarded-migration fingerprint.
  IF EXISTS (
    SELECT 1 FROM greentarget.journal_entries
     WHERE entry_type <> 'IMP'
       AND entry_date < DATE '2026-07-01'
       AND UPPER(BTRIM(reference_no)) IS DISTINCT FROM 'JV2606-01'
  ) THEN
    RAISE EXCEPTION 'An unexplained non-IMP journal exists before the 2026-07-01 cutover';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM greentarget.journal_entries header
     WHERE UPPER(BTRIM(header.reference_no)) = 'JV2606-01'
       AND (
         header.reference_no = 'JV2606-01'
         AND header.entry_type = 'JV'
         AND header.entry_date = DATE '2026-06-30'
         AND header.description = 'BANK CHARGES MONTH OF JUNE 2026'
         AND header.total_debit = 2.70
         AND header.total_credit = 2.70
         AND header.status = 'posted'
         AND header.display_reference IS NULL
         AND header.posting_sequence = 279
         AND header.source_type IS NULL
         AND header.source_id IS NULL
         AND header.legacy_entry_type IS NULL
         AND header.manual_override IS false
         AND header.cheque_no IS NULL
         AND header.created_by = 'GT_JUNE_BANK_CHARGE_20260821'
         AND header.updated_by = 'GT_JUNE_BANK_CHARGE_20260821'
         AND header.posted_by = 'GT_JUNE_BANK_CHARGE_20260821'
         AND header.posted_at IS NOT NULL
         AND (SELECT COUNT(*) FROM greentarget.journal_entry_lines line
               WHERE line.journal_entry_id = header.id) = 2
         AND EXISTS (
           SELECT 1 FROM greentarget.journal_entry_lines line
            WHERE line.journal_entry_id = header.id
              AND line.line_number = 1
              AND line.account_code = 'BWBC'
              AND line.debit_amount = 2.70
              AND line.credit_amount = 0
              AND line.reference IS NULL
              AND line.particulars = 'BANK CHARGES MONTH OF JUNE 2026'
              AND line.cheque_reference IS NULL
              AND line.display_order = 1
              AND line.display_reference IS NULL
              AND line.debtor_subledger_code IS NULL
         )
         AND EXISTS (
           SELECT 1 FROM greentarget.journal_entry_lines line
            WHERE line.journal_entry_id = header.id
              AND line.line_number = 2
              AND line.account_code = 'PBB_1'
              AND line.debit_amount = 0
              AND line.credit_amount = 2.70
              AND line.reference IS NULL
              AND line.particulars = 'BANK CHARGES MONTH OF JUNE 2026'
              AND line.cheque_reference IS NULL
              AND line.display_order = 2
              AND line.display_reference IS NULL
              AND line.debtor_subledger_code IS NULL
         )
       ) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'JV2606-01 exists but does not match the approved June bank-charge correction';
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- The deterministic projection of this month's staging rows.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE desired_import_headers ON COMMIT DROP AS
WITH staged AS (
  SELECT rows.*
    FROM greentarget.import_legacy_rows rows
   CROSS JOIN import_batch_parameters parameters
   WHERE rows.record_kind = 'transaction'
     AND rows.entry_date >= parameters.month_start
     AND rows.entry_date <  parameters.month_end
), grouped AS (
  SELECT staged.entry_date,
         staged.journal_group_key,
         (ARRAY_AGG(staged.journal_ref ORDER BY staged.stage_sequence))[1]
           AS display_reference,
         SUM(staged.debit_cents)::bigint  AS total_debit_cents,
         SUM(staged.credit_cents)::bigint AS total_credit_cents
    FROM staged
   GROUP BY staged.entry_date, staged.journal_group_key
), described AS (
  -- PRINTED lines only: the derived CD_SD leg was never on the legacy document
  -- and must not inflate the particulars count.
  SELECT staged.journal_group_key,
         (ARRAY_AGG(staged.particulars ORDER BY staged.stage_sequence))[1]
           AS first_particulars,
         COUNT(DISTINCT staged.particulars) AS distinct_particulars
    FROM staged
   WHERE staged.source_kind <> 'DERIVED'
   GROUP BY staged.journal_group_key
), ordered AS (
  SELECT grouped.*,
         described.first_particulars,
         described.distinct_particulars,
         ROW_NUMBER() OVER (
           PARTITION BY DATE_TRUNC('month', grouped.entry_date)
           ORDER BY grouped.display_reference COLLATE "C",
                    grouped.journal_group_key COLLATE "C"
         )::integer AS posting_sequence,
         ROW_NUMBER() OVER (
           PARTITION BY grouped.entry_date
           ORDER BY grouped.display_reference COLLATE "C",
                    grouped.journal_group_key COLLATE "C"
         ) AS day_sequence
    FROM grouped
    JOIN described USING (journal_group_key)
)
SELECT ordered.entry_date,
       ordered.journal_group_key,
       ordered.display_reference,
       ordered.posting_sequence,
       FORMAT(
         'IMP-%s-%s',
         TO_CHAR(ordered.entry_date, 'YYYYMMDD'),
         LPAD(ordered.day_sequence::text, 4, '0')
       )::varchar(50) AS reference_no,
       CASE
         WHEN ordered.distinct_particulars > 1
           THEN ordered.first_particulars
                  || ' (+' || (ordered.distinct_particulars - 1)
                  || ' more particulars)'
         ELSE ordered.first_particulars
       END::text AS description,
       (CASE
          WHEN ordered.display_reference ~ '^RV[0-9]'        THEN 'RV#/#/#'
          WHEN ordered.display_reference ~ '^PBEB'           THEN 'PBEB#/#'
          WHEN ordered.display_reference ~ '^PBE[0-9]'       THEN 'PBE#/#'
          WHEN ordered.display_reference ~ '^PB[0-9]'        THEN 'PB#/#'
          WHEN ordered.display_reference ~ '^JBSL'           THEN 'JBSL/#/#'
          WHEN ordered.display_reference ~ '^JWDR'           THEN 'JWDR/#/#'
          WHEN ordered.display_reference ~ '^JV'             THEN 'JV#/#/#'
          WHEN ordered.display_reference ~ '^I[0-9]'         THEN 'I#/#'
          WHEN ordered.display_reference ~ '^[0-9]+/[0-9]+$' THEN '#/#'
          ELSE NULL
        END)::varchar(10) AS legacy_entry_type,
       (ordered.total_debit_cents::numeric  / 100) AS total_debit,
       (ordered.total_credit_cents::numeric / 100) AS total_credit
  FROM ordered;

ALTER TABLE desired_import_headers
  ADD PRIMARY KEY (journal_group_key),
  ADD UNIQUE (reference_no);

CREATE TEMP TABLE desired_import_lines ON COMMIT DROP AS
SELECT headers.reference_no,
       staged.journal_group_key,
       ROW_NUMBER() OVER (
         PARTITION BY staged.journal_group_key
         ORDER BY staged.stage_sequence
       )::integer AS line_number,
       staged.account_code,
       (staged.debit_cents::numeric  / 100) AS debit_amount,
       (staged.credit_cents::numeric / 100) AS credit_amount,
       headers.reference_no::varchar(100)   AS line_reference,
       staged.particulars,
       staged.cheque_reference,
       ROW_NUMBER() OVER (
         PARTITION BY staged.journal_group_key, staged.account_code
         ORDER BY staged.stage_sequence
       )::integer AS display_order,
       staged.line_display_reference AS display_reference,
       staged.stage_sequence
  FROM greentarget.import_legacy_rows staged
  JOIN desired_import_headers headers
    ON headers.journal_group_key = staged.journal_group_key
 WHERE staged.record_kind = 'transaction';

ALTER TABLE desired_import_lines
  ADD PRIMARY KEY (journal_group_key, line_number);

DO $batch_shape$
DECLARE
  v_lines bigint;
  v_journals bigint;
  v_derived bigint;
  v_debit_cents numeric;
  v_credit_cents numeric;
  v_expected import_batch_parameters%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_expected FROM import_batch_parameters;

  SELECT COUNT(*), COUNT(DISTINCT journal_group_key),
         SUM(ROUND(debit_amount * 100))::bigint,
         SUM(ROUND(credit_amount * 100))::bigint
    INTO v_lines, v_journals, v_debit_cents, v_credit_cents
    FROM desired_import_lines;

  SELECT COUNT(*) INTO v_derived
    FROM greentarget.import_legacy_rows staged
   WHERE staged.record_kind = 'transaction'
     AND staged.source_kind = 'DERIVED'
     AND staged.entry_date >= v_expected.month_start
     AND staged.entry_date <  v_expected.month_end;

  IF (v_lines, v_journals, v_derived, v_debit_cents, v_credit_cents)
     IS DISTINCT FROM
     (v_expected.expected_lines::bigint, v_expected.expected_journals::bigint,
      v_expected.expected_derived::bigint,
      v_expected.expected_debit_cents::numeric,
      v_expected.expected_debit_cents::numeric) THEN
    RAISE EXCEPTION
      'Unexpected batch shape for %: lines %, journals %, derived %, DR %, CR %',
      v_expected.month_start, v_lines, v_journals, v_derived,
      v_debit_cents, v_credit_cents;
  END IF;

  IF EXISTS (
    SELECT 1 FROM desired_import_headers
     WHERE total_debit IS DISTINCT FROM total_credit
  ) THEN
    RAISE EXCEPTION 'Desired batch contains an unbalanced journal';
  END IF;

  IF EXISTS (
    SELECT 1 FROM desired_import_headers WHERE legacy_entry_type IS NULL
  ) THEN
    RAISE EXCEPTION 'Desired batch contains a journal whose legacy family did not decode';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_import_lines desired
      LEFT JOIN greentarget.account_codes accounts
        ON accounts.code = desired.account_code
     WHERE accounts.code IS NULL
        OR accounts.is_active IS DISTINCT FROM true
        OR accounts.fs_note IS NULL
  ) THEN
    RAISE EXCEPTION 'Desired batch contains a missing, inactive, or unmapped account code';
  END IF;
END
$batch_shape$;

-- ---------------------------------------------------------------------------
-- Post.
-- ---------------------------------------------------------------------------
WITH inserted_headers AS (
  INSERT INTO greentarget.journal_entries (
    reference_no, entry_type, entry_date, description,
    total_debit, total_credit, status,
    created_by, updated_by, posted_at, posted_by,
    cheque_no, display_reference, posting_sequence,
    source_type, source_id, legacy_entry_type, manual_override
  )
  SELECT desired.reference_no,
         'IMP',
         desired.entry_date,
         desired.description,
         desired.total_debit,
         desired.total_credit,
         'posted',
         'legacy-import',
         'legacy-import',
         CURRENT_TIMESTAMP,
         'legacy-import',
         NULL,
         desired.display_reference,
         desired.posting_sequence,
         'legacy_import',
         desired.journal_group_key,
         desired.legacy_entry_type,
         false
    FROM desired_import_headers desired
  ON CONFLICT (reference_no) DO NOTHING
  RETURNING id, reference_no
)
INSERT INTO greentarget.journal_entry_lines (
  journal_entry_id, line_number, account_code,
  debit_amount, credit_amount, reference, particulars,
  cheque_reference, display_order, display_reference
)
SELECT inserted.id,
       desired.line_number,
       desired.account_code,
       desired.debit_amount,
       desired.credit_amount,
       desired.line_reference,
       desired.particulars,
       desired.cheque_reference,
       desired.display_order,
       desired.display_reference
  FROM desired_import_lines desired
  JOIN inserted_headers inserted
    ON inserted.reference_no = desired.reference_no
 ORDER BY desired.stage_sequence;

-- ---------------------------------------------------------------------------
-- Verify what is now in the database against the projection.
-- ---------------------------------------------------------------------------
DO $verification$
DECLARE
  v_parameters import_batch_parameters%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_parameters FROM import_batch_parameters;

  IF EXISTS (
    SELECT 1
      FROM desired_import_headers desired
      LEFT JOIN greentarget.journal_entries actual
        ON actual.reference_no = desired.reference_no
     WHERE actual.id IS NULL
        OR actual.entry_type        IS DISTINCT FROM 'IMP'
        OR actual.entry_date        IS DISTINCT FROM desired.entry_date
        OR actual.description       IS DISTINCT FROM desired.description
        OR actual.total_debit       IS DISTINCT FROM desired.total_debit
        OR actual.total_credit      IS DISTINCT FROM desired.total_credit
        OR actual.status            IS DISTINCT FROM 'posted'
        OR actual.display_reference IS DISTINCT FROM desired.display_reference
        OR actual.posting_sequence  IS DISTINCT FROM desired.posting_sequence
        OR actual.legacy_entry_type IS DISTINCT FROM desired.legacy_entry_type
        OR actual.source_type       IS DISTINCT FROM 'legacy_import'
        OR actual.source_id         IS DISTINCT FROM desired.journal_group_key
        OR actual.manual_override   IS DISTINCT FROM false
        OR actual.cheque_no         IS NOT NULL
        OR actual.posted_at         IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more imported journal headers differ from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM greentarget.journal_entries actual
      LEFT JOIN desired_import_headers desired
        ON desired.reference_no = actual.reference_no
     WHERE actual.entry_type = 'IMP'
       AND actual.entry_date >= v_parameters.month_start
       AND actual.entry_date <  v_parameters.month_end
       AND desired.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'An unexpected IMP journal exists in the batch month';
  END IF;

  IF (SELECT COUNT(*)
        FROM greentarget.journal_entries actual
       WHERE actual.entry_type = 'IMP'
         AND actual.entry_date >= v_parameters.month_start
         AND actual.entry_date <  v_parameters.month_end)
     <> v_parameters.expected_journals THEN
    RAISE EXCEPTION 'Imported journal header count differs from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_import_lines desired
      JOIN greentarget.journal_entries header
        ON header.reference_no = desired.reference_no
      LEFT JOIN greentarget.journal_entry_lines actual
        ON actual.journal_entry_id = header.id
       AND actual.line_number = desired.line_number
     WHERE actual.id IS NULL
        OR actual.account_code      IS DISTINCT FROM desired.account_code
        OR actual.debit_amount      IS DISTINCT FROM desired.debit_amount
        OR actual.credit_amount     IS DISTINCT FROM desired.credit_amount
        OR actual.reference         IS DISTINCT FROM desired.line_reference
        OR actual.particulars       IS DISTINCT FROM desired.particulars
        OR actual.cheque_reference  IS DISTINCT FROM desired.cheque_reference
        OR actual.display_order     IS DISTINCT FROM desired.display_order
        OR actual.display_reference IS DISTINCT FROM desired.display_reference
  ) THEN
    RAISE EXCEPTION 'One or more imported journal lines differ from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM greentarget.journal_entries header
      JOIN greentarget.journal_entry_lines actual
        ON actual.journal_entry_id = header.id
      LEFT JOIN desired_import_lines desired
        ON desired.reference_no = header.reference_no
       AND desired.line_number = actual.line_number
     WHERE header.entry_type = 'IMP'
       AND header.entry_date >= v_parameters.month_start
       AND header.entry_date <  v_parameters.month_end
       AND desired.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'An imported journal contains an extra line';
  END IF;

  IF (SELECT COUNT(*)
        FROM greentarget.journal_entries header
        JOIN greentarget.journal_entry_lines actual
          ON actual.journal_entry_id = header.id
       WHERE header.entry_type = 'IMP'
         AND header.entry_date >= v_parameters.month_start
         AND header.entry_date <  v_parameters.month_end)
     <> v_parameters.expected_lines THEN
    RAISE EXCEPTION 'Imported journal line count differs from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM greentarget.journal_entries header
      JOIN greentarget.journal_entry_lines lines
        ON lines.journal_entry_id = header.id
     WHERE header.entry_type = 'IMP'
       AND header.entry_date >= v_parameters.month_start
       AND header.entry_date <  v_parameters.month_end
     GROUP BY header.id, header.total_debit, header.total_credit
    HAVING SUM(lines.debit_amount)  IS DISTINCT FROM header.total_debit
        OR SUM(lines.credit_amount) IS DISTINCT FROM header.total_credit
        OR SUM(lines.debit_amount)  IS DISTINCT FROM SUM(lines.credit_amount)
  ) THEN
    RAISE EXCEPTION 'An imported journal is not balanced against its header';
  END IF;

  IF EXISTS (
    WITH staged AS (
      SELECT desired.account_code,
             SUM(desired.debit_amount)  AS debit_amount,
             SUM(desired.credit_amount) AS credit_amount
        FROM desired_import_lines desired
       GROUP BY desired.account_code
    ), posted AS (
      SELECT lines.account_code,
             SUM(lines.debit_amount)  AS debit_amount,
             SUM(lines.credit_amount) AS credit_amount
        FROM greentarget.journal_entries header
        JOIN greentarget.journal_entry_lines lines
          ON lines.journal_entry_id = header.id
       WHERE header.entry_type = 'IMP'
         AND header.entry_date >= v_parameters.month_start
         AND header.entry_date <  v_parameters.month_end
       GROUP BY lines.account_code
    )
    SELECT 1
      FROM staged
      FULL JOIN posted USING (account_code)
     WHERE staged.debit_amount  IS DISTINCT FROM posted.debit_amount
        OR staged.credit_amount IS DISTINCT FROM posted.credit_amount
  ) THEN
    RAISE EXCEPTION 'Per-account imported movement differs from staging';
  END IF;
END
$verification$;

COMMIT;

SELECT TO_CHAR(header.entry_date, 'YYYY-MM')                AS import_month,
       COUNT(DISTINCT header.id)                            AS journals,
       COUNT(lines.id)                                      AS lines,
       COUNT(lines.id) FILTER (
         WHERE lines.account_code = 'CD_SD')                AS derived_cash_legs,
       MIN(header.posting_sequence)                         AS first_sequence,
       MAX(header.posting_sequence)                         AS last_sequence,
       SUM(lines.debit_amount)::numeric(14,2)               AS debit,
       SUM(lines.credit_amount)::numeric(14,2)              AS credit
  FROM greentarget.journal_entries header
  JOIN greentarget.journal_entry_lines lines
    ON lines.journal_entry_id = header.id
 WHERE header.entry_type = 'IMP'
   AND header.entry_date >= DATE :'month_start'
   AND header.entry_date <  (DATE :'month_start' + INTERVAL '1 month')
 GROUP BY TO_CHAR(header.entry_date, 'YYYY-MM');

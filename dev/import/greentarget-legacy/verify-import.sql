-- Green Target Phase G4 - independent acceptance gates for the Jan-Jun 2026
-- legacy ledger import.
--
-- WRITTEN BEFORE THE LOADER, on purpose (same discipline as G3's
-- verify-chart.mjs). Everything below is a PROPERTY read out of the database
-- and compared against the hash-pinned staging population or against a figure
-- that was independently evidenced in G0/G1 - never a re-run of the loader's
-- own derivation, so a bug in the loader cannot hide behind agreeing with
-- itself.
--
-- Read-only with respect to every application table. Any mismatch raises and
-- aborts before the closing summaries print.
--
--   psql -v ON_ERROR_STOP=1 -f dev/import/greentarget-legacy/verify-import.sql
--
-- The per-account x six-month comparison against the PRINTED Trial Balance
-- scans lives in verify-import.mjs, which can read the G1 fixture CSVs. This
-- file proves the database is a faithful projection of staging and hits every
-- named control total.

\set ON_ERROR_STOP on

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('greentarget_jan_jun_2026_journal_import', 0)
);

LOCK TABLE greentarget.import_legacy_rows IN SHARE MODE;
LOCK TABLE greentarget.journal_entries, greentarget.journal_entry_lines
  IN SHARE MODE;
LOCK TABLE greentarget.account_opening_balances, greentarget.account_codes
  IN SHARE MODE;

-- ---------------------------------------------------------------------------
-- Approved constants. Every figure here was established in G0/G1 and is
-- recorded in a tracked artifact; the pointer is on the line.
-- ---------------------------------------------------------------------------

-- Monthly batch shape. Derived from the hash-pinned staging CSV plus the 1,433
-- approved derived CD_SD lines (user approval 26 Jul 2026; see account-aliases
-- .json unbalancedFamilies and handover section 9, G4).
CREATE TEMP TABLE expected_import_months (
  month_start          date PRIMARY KEY,
  month_end            date   NOT NULL,
  expected_journals    integer NOT NULL,
  expected_lines       integer NOT NULL,
  expected_derived     integer NOT NULL,
  expected_debit_cents bigint  NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_import_months VALUES
  (DATE '2026-01-01', DATE '2026-02-01', 300, 736, 249, 15790466),
  (DATE '2026-02-01', DATE '2026-03-01', 276, 777, 232, 16774455),
  (DATE '2026-03-01', DATE '2026-04-01', 276, 716, 226, 16033859),
  (DATE '2026-04-01', DATE '2026-05-01', 293, 765, 251, 15790099),
  (DATE '2026-05-01', DATE '2026-06-01', 282, 708, 242, 14907765),
  (DATE '2026-06-01', DATE '2026-07-01', 278, 699, 233, 15469870);

-- The six month-end control totals.
--   tb_debit_cents / tb_credit_cents  - the per-account trial balance the GT
--       engine must produce. It is the PRINTED grand total + 101 cents every
--       month, because the printed TB nets the KBOX (-0.01) and RUMAH MERAH
--       (-1.00) credit balances inside its single DEBTOR control line
--       (report-fixtures/source-manifest.json printedTrialBalanceExpectations).
--   debtor_control_cents - the printed DEBTOR / TRADE DEBTOR / APPX 22 line,
--       scan-confirmed for all six months in G1.
--   cd_sd_cents - the CD_SD path G1 derived from the scans and G4 reproduced
--       from the derived cash legs (handover section 9, G1).
CREATE TEMP TABLE expected_month_ends (
  as_of                 date PRIMARY KEY,
  tb_debit_cents        bigint NOT NULL,
  printed_total_cents   bigint NOT NULL,
  debtor_control_cents  bigint NOT NULL,
  cd_sd_cents           bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_month_ends VALUES
  (DATE '2026-01-31', 268118734, 268118633, 18116672, 8591540),
  (DATE '2026-02-28', 272028559, 272028458, 16199537, 7289540),
  (DATE '2026-03-31', 276568774, 276568673, 15905157, 6937740),
  (DATE '2026-04-30', 280913099, 280912998, 16281137, 7195540),
  (DATE '2026-05-31', 285232239, 285232138, 15618077, 6644540),
  (DATE '2026-06-30', 289680954, 289680853, 15678222, 6570540);

-- ---------------------------------------------------------------------------
-- The deterministic projection of staging. This must be byte-for-byte the same
-- derivation post-monthly-journals.sql uses; if the two ever diverge, the
-- header/line comparisons below fail loudly rather than silently passing.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE desired_import_headers ON COMMIT DROP AS
WITH grouped AS (
  SELECT staged.entry_date,
         staged.journal_group_key,
         (ARRAY_AGG(staged.journal_ref ORDER BY staged.stage_sequence))[1]
           AS display_reference,
         SUM(staged.debit_cents)::bigint  AS total_debit_cents,
         SUM(staged.credit_cents)::bigint AS total_credit_cents
    FROM greentarget.import_legacy_rows staged
   WHERE staged.record_kind = 'transaction'
   GROUP BY staged.entry_date, staged.journal_group_key
), described AS (
  -- Description comes from the PRINTED lines only. The derived CD_SD leg was
  -- never on the legacy document, so it must not inflate the particulars count.
  SELECT source.journal_group_key,
         (ARRAY_AGG(source.particulars ORDER BY source.stage_sequence))[1]
           AS first_particulars,
         COUNT(DISTINCT source.particulars) AS distinct_particulars
    FROM greentarget.import_legacy_rows source
   WHERE source.record_kind = 'transaction'
     AND source.source_kind <> 'DERIVED'
   GROUP BY source.journal_group_key
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
       -- The nine journal families decoded in G0, stored verbatim so the column
       -- stays 1:1 with account-aliases.json journalFamilies[].pattern.
       (CASE
          WHEN ordered.display_reference ~ '^RV[0-9]'   THEN 'RV#/#/#'
          WHEN ordered.display_reference ~ '^PBEB'      THEN 'PBEB#/#'
          WHEN ordered.display_reference ~ '^PBE[0-9]'  THEN 'PBE#/#'
          WHEN ordered.display_reference ~ '^PB[0-9]'   THEN 'PB#/#'
          WHEN ordered.display_reference ~ '^JBSL'      THEN 'JBSL/#/#'
          WHEN ordered.display_reference ~ '^JWDR'      THEN 'JWDR/#/#'
          WHEN ordered.display_reference ~ '^JV'        THEN 'JV#/#/#'
          WHEN ordered.display_reference ~ '^I[0-9]'    THEN 'I#/#'
          WHEN ordered.display_reference ~ '^[0-9]+/[0-9]+$' THEN '#/#'
          ELSE NULL
        END)::varchar(10) AS legacy_entry_type,
       (ordered.total_debit_cents::numeric / 100)  AS total_debit,
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
       (staged.debit_cents::numeric / 100)  AS debit_amount,
       (staged.credit_cents::numeric / 100) AS credit_amount,
       headers.reference_no::varchar(100)   AS line_reference,
       staged.particulars,
       staged.cheque_reference,
       ROW_NUMBER() OVER (
         PARTITION BY staged.journal_group_key, staged.account_code
         ORDER BY staged.stage_sequence
       )::integer AS display_order,
       staged.line_display_reference AS display_reference,
       staged.stage_sequence,
       staged.source_kind
  FROM greentarget.import_legacy_rows staged
  JOIN desired_import_headers headers
    ON headers.journal_group_key = staged.journal_group_key
 WHERE staged.record_kind = 'transaction';

ALTER TABLE desired_import_lines
  ADD PRIMARY KEY (journal_group_key, line_number);

-- ---------------------------------------------------------------------------
-- Independent reconstruction of the SOURCE running-balance chain. Walks the
-- printed DR/CR columns of the transcribed rows only (the derived legs are
-- excluded because CD_SD prints no transaction detail at all) and checks the
-- walk against the printed BALANCE column. This is what proves the loaded
-- staging is still the workbook, not just internally consistent.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE reconstructed_source_chain ON COMMIT DROP AS
SELECT staged.stage_sequence,
       staged.account_code,
       staged.running_balance_cents,
       (
         FIRST_VALUE(opening.running_balance_cents) OVER account_chain
         + SUM(staged.debit_cents - staged.credit_cents) OVER (
             PARTITION BY staged.account_code
             ORDER BY staged.stage_sequence
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           )
       )::bigint AS calculated_running_cents
  FROM greentarget.import_legacy_rows staged
  JOIN greentarget.import_legacy_rows opening
    ON opening.account_code = staged.account_code
   AND opening.record_kind = 'opening'
   AND opening.source_kind <> 'DERIVED'
 WHERE staged.record_kind = 'transaction'
   AND staged.source_kind <> 'DERIVED'
   AND staged.running_balance_cents IS NOT NULL
WINDOW account_chain AS (
  PARTITION BY staged.account_code ORDER BY staged.stage_sequence
);

-- ---------------------------------------------------------------------------
-- Expected vs actual per-account month-end closes.
--   expected = staged opening + staged movement (source AND derived)
--   actual   = the anchor in account_opening_balances + posted journal lines
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE expected_monthly_closes ON COMMIT DROP AS
WITH months(as_of) AS (
  SELECT as_of FROM expected_month_ends
), openings AS (
  SELECT account_code,
         SUM(running_balance_cents)::bigint AS opening_cents
    FROM greentarget.import_legacy_rows
   WHERE record_kind = 'opening'
     -- Seeds deliberately removed from the live chart after the G4 load
     -- (PBB1, 2026-07-30: dormant duplicate of PBB_1 with a zero fence -
     -- dev/migrations/2026-07-30_greentarget_remove_pbb1.sql). Their staging
     -- rows remain as historical evidence but no longer have a live anchor.
     AND account_code NOT IN (VALUES ('PBB1'))
   GROUP BY account_code
)
SELECT months.as_of,
       openings.account_code,
       (openings.opening_cents + COALESCE((
          SELECT SUM(moved.debit_cents - moved.credit_cents)
            FROM greentarget.import_legacy_rows moved
           WHERE moved.record_kind = 'transaction'
             AND moved.account_code = openings.account_code
             AND moved.entry_date <= months.as_of
        ), 0))::bigint AS close_cents
  FROM months
 CROSS JOIN openings;

CREATE UNIQUE INDEX ON expected_monthly_closes (as_of, account_code);

CREATE TEMP TABLE actual_monthly_closes ON COMMIT DROP AS
WITH months(as_of) AS (
  SELECT as_of FROM expected_month_ends
)
SELECT months.as_of,
       anchors.account_code,
       (ROUND(anchors.amount * 100)::bigint + COALESCE((
          SELECT SUM(ROUND(lines.debit_amount * 100)
                     - ROUND(lines.credit_amount * 100))::bigint
            FROM greentarget.journal_entries headers
            JOIN greentarget.journal_entry_lines lines
              ON lines.journal_entry_id = headers.id
           WHERE headers.status = 'posted'
             AND lines.account_code = anchors.account_code
             AND headers.entry_date >= anchors.as_of_date
             AND headers.entry_date <= months.as_of
        ), 0))::bigint AS close_cents
  FROM months
 CROSS JOIN greentarget.account_opening_balances anchors;

CREATE UNIQUE INDEX ON actual_monthly_closes (as_of, account_code);

-- ---------------------------------------------------------------------------
-- The gates.
-- ---------------------------------------------------------------------------
DO $acceptance$
DECLARE
  v_total_rows        bigint;
  v_opening_rows      bigint;
  v_transaction_rows  bigint;
  v_derived_rows      bigint;
  v_groups            bigint;
  v_debit_cents       numeric;
  v_credit_cents      numeric;
  v_anchor_count      bigint;
  v_anchor_cents      bigint;
  v_journals          bigint;
  v_lines             bigint;
  v_th_accounts       bigint;
  v_th_journals       bigint;
  v_th_lines          bigint;
  v_th_anchors        bigint;
  v_th_notes          bigint;
  v_row               record;
BEGIN
  -- 1. Staging is the approved population, from the approved sources ---------
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE record_kind = 'opening'),
         COUNT(*) FILTER (WHERE record_kind = 'transaction'),
         COUNT(*) FILTER (WHERE source_kind = 'DERIVED'),
         COUNT(DISTINCT journal_group_key)
           FILTER (WHERE record_kind = 'transaction'),
         COALESCE(SUM(debit_cents)  FILTER (WHERE record_kind = 'transaction'), 0),
         COALESCE(SUM(credit_cents) FILTER (WHERE record_kind = 'transaction'), 0)
    INTO v_total_rows, v_opening_rows, v_transaction_rows, v_derived_rows,
         v_groups, v_debit_cents, v_credit_cents
    FROM greentarget.import_legacy_rows;

  IF (v_total_rows, v_opening_rows, v_transaction_rows, v_derived_rows,
      v_groups, v_debit_cents, v_credit_cents)
     IS DISTINCT FROM
     (4903::bigint, 502::bigint, 4401::bigint, 1434::bigint,
      1705::bigint, 94766514::numeric, 94766514::numeric) THEN
    RAISE EXCEPTION
      'Staging is not the approved G4 population: rows %, openings %, transactions %, derived %, groups %, DR %, CR %',
      v_total_rows, v_opening_rows, v_transaction_rows, v_derived_rows,
      v_groups, v_debit_cents, v_credit_cents;
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE source_sha256 NOT IN (
       '71e32a0189c34fa75f404ca6a702662963c4bd508997da1359cc35e0a62e3f01',
       'fa735c756748e74601605ed479ead44f461ee468a53f99c070857f1c4bf9ab6b'
     )
  ) THEN
    RAISE EXCEPTION 'Staging contains a row from an unapproved source workbook';
  END IF;

  -- 2. Every derived row is a CD_SD cash leg and is unmistakably marked ------
  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE source_kind = 'DERIVED'
       AND (account_code <> 'CD_SD'
         OR provenance <> 'derived_cash_debtors_leg'
         OR repaired IS DISTINCT FROM true
         OR repair_reason IS NULL
         OR special_case <> 'cd_sd_unbanked_counter_cash'
         OR source_physical_line IS NOT NULL
         OR injected_after_physical_line IS NULL)
  ) THEN
    RAISE EXCEPTION 'A DERIVED staging row is not a fully-marked CD_SD cash leg';
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE source_kind <> 'DERIVED'
       AND (provenance <> 'source' OR repaired IS DISTINCT FROM false)
  ) THEN
    RAISE EXCEPTION 'A transcribed source row is marked as derived or repaired';
  END IF;

  -- Exactly one derived OPENING row: the +10,710.00 CD_SD correction.
  IF (SELECT COUNT(*) FROM greentarget.import_legacy_rows
       WHERE source_kind = 'DERIVED' AND record_kind = 'opening') <> 1
     OR (SELECT running_balance_cents FROM greentarget.import_legacy_rows
          WHERE source_kind = 'DERIVED' AND record_kind = 'opening') <> 1071000
  THEN
    RAISE EXCEPTION 'The single derived CD_SD opening correction of 10,710.00 DR is missing or wrong';
  END IF;

  -- 3. Every staged journal group balances ----------------------------------
  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE record_kind = 'transaction'
     GROUP BY journal_group_key
    HAVING SUM(debit_cents) <> SUM(credit_cents)
  ) THEN
    RAISE EXCEPTION 'A staged journal group is still unbalanced';
  END IF;

  -- 4. The source chain still walks its printed BALANCE column --------------
  IF EXISTS (
    SELECT 1 FROM reconstructed_source_chain
     WHERE running_balance_cents IS DISTINCT FROM calculated_running_cents
  ) THEN
    RAISE EXCEPTION 'A reconstructed legacy source running balance does not reconcile';
  END IF;

  IF (SELECT COUNT(*) FROM reconstructed_source_chain) <> 2968 THEN
    RAISE EXCEPTION 'The reconstructed source chain no longer covers all 2,968 printed rows';
  END IF;

  -- 5. Posted population is exactly the projection --------------------------
  FOR v_row IN
    SELECT expected.month_start,
           expected.expected_journals,
           expected.expected_lines,
           expected.expected_derived,
           expected.expected_debit_cents,
           (SELECT COUNT(*) FROM greentarget.journal_entries headers
             WHERE headers.entry_type = 'IMP'
               AND headers.entry_date >= expected.month_start
               AND headers.entry_date <  expected.month_end) AS actual_journals,
           (SELECT COUNT(*) FROM greentarget.journal_entries headers
              JOIN greentarget.journal_entry_lines lines
                ON lines.journal_entry_id = headers.id
             WHERE headers.entry_type = 'IMP'
               AND headers.entry_date >= expected.month_start
               AND headers.entry_date <  expected.month_end) AS actual_lines,
           (SELECT COALESCE(SUM(ROUND(lines.debit_amount * 100)), 0)::bigint
              FROM greentarget.journal_entries headers
              JOIN greentarget.journal_entry_lines lines
                ON lines.journal_entry_id = headers.id
             WHERE headers.entry_type = 'IMP'
               AND headers.entry_date >= expected.month_start
               AND headers.entry_date <  expected.month_end) AS actual_debit_cents,
           (SELECT COALESCE(SUM(ROUND(lines.credit_amount * 100)), 0)::bigint
              FROM greentarget.journal_entries headers
              JOIN greentarget.journal_entry_lines lines
                ON lines.journal_entry_id = headers.id
             WHERE headers.entry_type = 'IMP'
               AND headers.entry_date >= expected.month_start
               AND headers.entry_date <  expected.month_end) AS actual_credit_cents,
           (SELECT COUNT(*) FROM greentarget.import_legacy_rows staged
             WHERE staged.record_kind = 'transaction'
               AND staged.source_kind = 'DERIVED'
               AND staged.entry_date >= expected.month_start
               AND staged.entry_date <  expected.month_end) AS actual_derived
      FROM expected_import_months expected
     ORDER BY expected.month_start
  LOOP
    IF (v_row.actual_journals, v_row.actual_lines, v_row.actual_derived,
        v_row.actual_debit_cents, v_row.actual_credit_cents)
       IS DISTINCT FROM
       (v_row.expected_journals::bigint, v_row.expected_lines::bigint,
        v_row.expected_derived::bigint, v_row.expected_debit_cents,
        v_row.expected_debit_cents) THEN
      RAISE EXCEPTION
        'Month % differs: journals %/%, lines %/%, derived %/%, DR %/%, CR %/%',
        v_row.month_start,
        v_row.actual_journals, v_row.expected_journals,
        v_row.actual_lines, v_row.expected_lines,
        v_row.actual_derived, v_row.expected_derived,
        v_row.actual_debit_cents, v_row.expected_debit_cents,
        v_row.actual_credit_cents, v_row.expected_debit_cents;
    END IF;
  END LOOP;

  -- 6. Header fidelity ------------------------------------------------------
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
        OR actual.created_by        IS DISTINCT FROM 'legacy-import'
  ) THEN
    RAISE EXCEPTION 'One or more imported journal headers differ from staging';
  END IF;

  -- Only IMPORTED journals must come from staging; organic G7 journals
  -- (source_type invoice/payment/adjustment, or NULL for manual ones) live
  -- beside the import from 2026-07-01 onward by design.
  IF EXISTS (
    SELECT 1
      FROM greentarget.journal_entries actual
      LEFT JOIN desired_import_headers desired
        ON desired.reference_no = actual.reference_no
     WHERE actual.source_type = 'legacy_import'
       AND desired.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'An unexpected journal exists in greentarget.journal_entries';
  END IF;

  -- Every family decoded in G0 must have resolved; a NULL means a new one.
  IF EXISTS (
    SELECT 1 FROM greentarget.journal_entries
     WHERE source_type = 'legacy_import' AND legacy_entry_type IS NULL
  ) THEN
    RAISE EXCEPTION 'An imported journal has no decoded legacy family';
  END IF;

  -- 7. Line fidelity --------------------------------------------------------
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
     WHERE header.source_type = 'legacy_import'
       AND desired.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'An imported journal contains an extra line';
  END IF;

  -- The 789 PB cheque numbers and 225 PBEB/PBE bank transaction ids are
  -- per-LINE evidence G5 has to reprint (named trap 5). Organic G7 receipts
  -- carry their own payment references, so the count is scoped to the import.
  IF (SELECT COUNT(*) FROM greentarget.journal_entry_lines lines
       JOIN greentarget.journal_entries header
         ON header.id = lines.journal_entry_id
       WHERE header.source_type = 'legacy_import'
         AND lines.cheque_reference IS NOT NULL) <> 1014 THEN
    RAISE EXCEPTION 'The 1,014 per-line cheque/bank references did not all survive the import';
  END IF;

  -- 8. Every journal balances; global DR = CR -------------------------------
  IF EXISTS (
    SELECT 1
      FROM greentarget.journal_entries header
      JOIN greentarget.journal_entry_lines lines
        ON lines.journal_entry_id = header.id
     GROUP BY header.id, header.total_debit, header.total_credit
    HAVING SUM(lines.debit_amount)  IS DISTINCT FROM header.total_debit
        OR SUM(lines.credit_amount) IS DISTINCT FROM header.total_credit
        OR SUM(lines.debit_amount)  IS DISTINCT FROM SUM(lines.credit_amount)
  ) THEN
    RAISE EXCEPTION 'An imported journal is not balanced against its header';
  END IF;

  SELECT COUNT(DISTINCT header.id), COUNT(lines.id)
    INTO v_journals, v_lines
    FROM greentarget.journal_entries header
    JOIN greentarget.journal_entry_lines lines
      ON lines.journal_entry_id = header.id
   WHERE header.source_type = 'legacy_import';

  IF (v_journals, v_lines) IS DISTINCT FROM (1705::bigint, 4401::bigint) THEN
    RAISE EXCEPTION 'Final imported population is % journals / % lines, expected 1705 / 4401',
      v_journals, v_lines;
  END IF;

  SELECT SUM(ROUND(lines.debit_amount * 100))::bigint,
         SUM(ROUND(lines.credit_amount * 100))::bigint
    INTO v_debit_cents, v_credit_cents
    FROM greentarget.journal_entry_lines lines
    JOIN greentarget.journal_entries header
      ON header.id = lines.journal_entry_id
   WHERE header.source_type = 'legacy_import';

  IF v_debit_cents IS DISTINCT FROM v_credit_cents
     OR v_debit_cents IS DISTINCT FROM 94766514::numeric THEN
    RAISE EXCEPTION 'Global imported DR % <> CR % (expected 94,766,514 cents each)',
      v_debit_cents, v_credit_cents;
  END IF;

  -- The import stays inside its window; organic G7 journals own 2026-07-01+.
  IF EXISTS (
    SELECT 1 FROM greentarget.journal_entries
     WHERE source_type = 'legacy_import'
       AND (entry_date < DATE '2026-01-01' OR entry_date >= DATE '2026-07-01')
  ) THEN
    RAISE EXCEPTION 'An imported journal falls outside the 2026-01-01..2026-06-30 import window';
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.journal_entries
     WHERE source_type IS DISTINCT FROM 'legacy_import'
       AND entry_date < DATE '2026-07-01'
  ) THEN
    RAISE EXCEPTION 'An organic journal predates the 2026-07-01 open date (R8)';
  END IF;

  -- 9. Opening anchors ------------------------------------------------------
  SELECT COUNT(*), COALESCE(SUM(ROUND(amount * 100)), 0)::bigint
    INTO v_anchor_count, v_anchor_cents
    FROM greentarget.account_opening_balances;

  -- Unlike Tien Hock, which shipped a named RM1,456,480.37 opening residue,
  -- Green Target's opening set must balance to EXACTLY zero once CD_SD carries
  -- its true 76,415.40 (G1: printed 65,705.40 + the 10,710.00 unbanked cash).
  IF (v_anchor_count, v_anchor_cents) IS DISTINCT FROM (500::bigint, 0::bigint) THEN
    RAISE EXCEPTION 'Opening anchors are % rows summing to % cents, expected exactly 500 rows summing to 0 (501 G4 fences minus the approved PBB1 removal)',
      v_anchor_count, v_anchor_cents;
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.account_opening_balances
     WHERE as_of_date <> DATE '2026-01-01'
  ) THEN
    RAISE EXCEPTION 'An opening anchor is not dated 2026-01-01 (R4)';
  END IF;

  -- DEBTOR is a control parent and BTFS is the account the scans print
  -- blank/blank. Neither may have an anchor: the absence is what reproduces
  -- BTFS's blank printing (G3 decision 4).
  IF EXISTS (
    SELECT 1 FROM greentarget.account_opening_balances
     WHERE account_code IN ('DEBTOR', 'BTFS')
  ) THEN
    RAISE EXCEPTION 'DEBTOR or BTFS was given an opening anchor';
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.journal_entry_lines
     WHERE account_code IN ('DEBTOR', 'BTFS')
  ) THEN
    RAISE EXCEPTION 'DEBTOR or BTFS received a posted journal line';
  END IF;

  IF (SELECT ROUND(amount * 100)::bigint
        FROM greentarget.account_opening_balances
       WHERE account_code = 'CD_SD') <> 7641540 THEN
    RAISE EXCEPTION 'CD_SD is not anchored at the evidenced 76,415.40';
  END IF;

  -- The anchors are exactly the staged opening set, account for account,
  -- excluding approved post-load removals (PBB1's zero fence, 2026-07-30).
  IF EXISTS (
    WITH staged AS (
      SELECT account_code, SUM(running_balance_cents)::bigint AS cents
        FROM greentarget.import_legacy_rows
       WHERE record_kind = 'opening'
         AND account_code NOT IN (VALUES ('PBB1'))
       GROUP BY account_code
    )
    SELECT 1
      FROM staged
      FULL JOIN greentarget.account_opening_balances anchors USING (account_code)
     WHERE staged.cents IS DISTINCT FROM ROUND(anchors.amount * 100)::bigint
  ) THEN
    RAISE EXCEPTION 'An opening anchor differs from its staged opening balance';
  END IF;

  -- G3 finding 2, re-asserted for untouched seed metadata: every account
  -- originally under a P&L note opens at zero. A live chart override is
  -- intentional and must not rewrite or invalidate the imported balances.
  IF EXISTS (
    SELECT 1
      FROM greentarget.account_opening_balances anchors
      JOIN greentarget.account_codes accounts
        ON accounts.code = anchors.account_code
      JOIN greentarget.financial_statement_notes notes
        ON notes.code = accounts.fs_note
     WHERE notes.report_section = 'income_statement'
       AND accounts.updated_by = 'G3_CHART_LOAD'
       AND anchors.amount <> 0
  ) THEN
    RAISE EXCEPTION 'An income-statement account has a non-zero 1 January opening';
  END IF;

  -- 10. Per-account month-end closes ----------------------------------------
  IF EXISTS (
    SELECT 1
      FROM expected_monthly_closes expected
      FULL JOIN actual_monthly_closes actual USING (as_of, account_code)
     WHERE expected.close_cents IS DISTINCT FROM actual.close_cents
  ) THEN
    RAISE EXCEPTION 'A per-account month-end close differs from staging';
  END IF;

  IF (SELECT COUNT(*) FROM actual_monthly_closes) <> 3000 THEN
    RAISE EXCEPTION 'The month-end close matrix is not 500 accounts x 6 months';
  END IF;

  -- 11. The named control totals -------------------------------------------
  FOR v_row IN
    SELECT target.as_of,
           target.tb_debit_cents,
           target.printed_total_cents,
           target.debtor_control_cents,
           target.cd_sd_cents,
           (SELECT COALESCE(SUM(close_cents) FILTER (WHERE close_cents > 0), 0)
              FROM actual_monthly_closes m WHERE m.as_of = target.as_of) AS dr,
           (SELECT COALESCE(-SUM(close_cents) FILTER (WHERE close_cents < 0), 0)
              FROM actual_monthly_closes m WHERE m.as_of = target.as_of) AS cr,
           (SELECT COALESCE(SUM(m.close_cents), 0)
              FROM actual_monthly_closes m
             WHERE m.as_of = target.as_of
               AND EXISTS (
                 SELECT 1 FROM greentarget.import_legacy_rows source
                  WHERE source.account_code = m.account_code
                    AND source.source_kind = 'GTDB'
               )) AS debtor_control,
           (SELECT close_cents FROM actual_monthly_closes m
             WHERE m.as_of = target.as_of AND m.account_code = 'CD_SD') AS cd_sd
      FROM expected_month_ends target
     ORDER BY target.as_of
  LOOP
    IF v_row.dr IS DISTINCT FROM v_row.cr THEN
      RAISE EXCEPTION 'Trial balance at % does not balance: DR % vs CR %',
        v_row.as_of, v_row.dr, v_row.cr;
    END IF;
    IF v_row.dr IS DISTINCT FROM v_row.tb_debit_cents THEN
      RAISE EXCEPTION 'Trial balance total at % is % cents, expected %',
        v_row.as_of, v_row.dr, v_row.tb_debit_cents;
    END IF;
    -- The printed grand total nets the KBOX/RUMAH MERAH credit balances inside
    -- the DEBTOR control line, so it is exactly 1.01 below the per-account TB.
    IF v_row.dr - v_row.printed_total_cents IS DISTINCT FROM 101::bigint THEN
      RAISE EXCEPTION 'At % the gap to the printed grand total is % cents, expected 101',
        v_row.as_of, v_row.dr - v_row.printed_total_cents;
    END IF;
    IF v_row.debtor_control IS DISTINCT FROM v_row.debtor_control_cents THEN
      RAISE EXCEPTION 'At % the 28 debtor children sum to % cents, printed control is %',
        v_row.as_of, v_row.debtor_control, v_row.debtor_control_cents;
    END IF;
    IF v_row.cd_sd IS DISTINCT FROM v_row.cd_sd_cents THEN
      RAISE EXCEPTION 'At % CD_SD closes at % cents, expected %',
        v_row.as_of, v_row.cd_sd, v_row.cd_sd_cents;
    END IF;
  END LOOP;

  -- 12. Tien Hock is untouched ----------------------------------------------
  SELECT (SELECT COUNT(*) FROM public.account_codes),
         (SELECT COUNT(*) FROM public.journal_entries),
         (SELECT COUNT(*) FROM public.journal_entry_lines),
         (SELECT COUNT(*) FROM public.account_opening_balances),
         (SELECT COUNT(*) FROM public.financial_statement_notes)
    INTO v_th_accounts, v_th_journals, v_th_lines, v_th_anchors, v_th_notes;

  IF (v_th_accounts, v_th_journals, v_th_notes)
     IS DISTINCT FROM (2827::bigint, 8238::bigint, 33::bigint) THEN
    RAISE EXCEPTION
      'Tien Hock moved: account_codes %, journal_entries %, notes % (expected 2827 / 8238 / 33)',
      v_th_accounts, v_th_journals, v_th_notes;
  END IF;

  RAISE NOTICE 'G4 VERIFY OK: 1,705 journals / 4,401 lines / 500 anchors summing to 0.00 (PBB1 fence approved-removed), six month-ends exact';
END
$acceptance$;

-- ---------------------------------------------------------------------------
-- Summaries (only reached when every gate above passed).
-- ---------------------------------------------------------------------------
SELECT TO_CHAR(header.entry_date, 'YYYY-MM')            AS import_month,
       COUNT(DISTINCT header.id)                        AS journals,
       COUNT(lines.id)                                  AS lines,
       COUNT(lines.id) FILTER (
         WHERE lines.account_code = 'CD_SD')            AS derived_cash_legs,
       COUNT(lines.id) FILTER (
         WHERE lines.cheque_reference IS NOT NULL)      AS cheque_refs,
       SUM(lines.debit_amount)::numeric(14,2)           AS debit,
       SUM(lines.credit_amount)::numeric(14,2)          AS credit
  FROM greentarget.journal_entries header
  JOIN greentarget.journal_entry_lines lines
    ON lines.journal_entry_id = header.id
 GROUP BY TO_CHAR(header.entry_date, 'YYYY-MM')
 ORDER BY 1;

SELECT header.legacy_entry_type                AS legacy_family,
       COUNT(DISTINCT header.id)               AS journals,
       COUNT(lines.id)                         AS lines,
       SUM(lines.debit_amount)::numeric(14,2)  AS debit
  FROM greentarget.journal_entries header
  JOIN greentarget.journal_entry_lines lines
    ON lines.journal_entry_id = header.id
 GROUP BY header.legacy_entry_type
 ORDER BY 3 DESC;

SELECT closes.as_of,
       SUM(closes.close_cents) FILTER (WHERE closes.close_cents > 0) / 100.0
         AS trial_balance_debit,
       -SUM(closes.close_cents) FILTER (WHERE closes.close_cents < 0) / 100.0
         AS trial_balance_credit,
       SUM(closes.close_cents) FILTER (
         WHERE closes.account_code = 'CD_SD') / 100.0 AS cd_sd,
       (SELECT SUM(m.close_cents) / 100.0
          FROM actual_monthly_closes m
         WHERE m.as_of = closes.as_of
           AND EXISTS (
             SELECT 1 FROM greentarget.import_legacy_rows source
              WHERE source.account_code = m.account_code
                AND source.source_kind = 'GTDB'
           ))
         AS debtor_control
  FROM actual_monthly_closes closes
 GROUP BY closes.as_of
 ORDER BY closes.as_of;

COMMIT;

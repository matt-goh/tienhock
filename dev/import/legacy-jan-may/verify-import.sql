-- Independent acceptance gates for the Jan-May 2026 legacy journal import.
-- This script is read-only with respect to application tables. Any mismatch
-- raises an exception and aborts before the final summaries are printed.

\set ON_ERROR_STOP on

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('legacy_jan_may_2026_journal_import', 0)
);

LOCK TABLE import_legacy_rows IN SHARE MODE;
LOCK TABLE journal_entries, journal_entry_lines IN SHARE MODE;
LOCK TABLE adjustment_documents, account_opening_balances IN SHARE MODE;

CREATE TEMP TABLE expected_import_months (
  month_start date PRIMARY KEY,
  expected_journals integer NOT NULL,
  expected_lines integer NOT NULL,
  expected_debit_lines integer NOT NULL,
  expected_credit_lines integer NOT NULL,
  expected_zero_lines integer NOT NULL,
  expected_amount_cents bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_import_months VALUES
  (DATE '2026-01-01', 854, 2232, 1316, 900, 16, 310886817),
  (DATE '2026-02-01', 749, 1980, 1171, 783, 26, 245055890),
  (DATE '2026-03-01', 735, 1887, 1094, 775, 18, 274098314),
  (DATE '2026-04-01', 798, 2137, 1281, 840, 16, 253121850),
  (DATE '2026-05-01', 727, 1832, 1041, 775, 16, 267188744);

CREATE TEMP TABLE expected_cn (
  source_id varchar(255) PRIMARY KEY,
  display_reference varchar(100) NOT NULL,
  legacy_reference varchar(100) NOT NULL,
  entry_date date NOT NULL,
  debtor_account varchar(50) NOT NULL,
  amount_cents bigint NOT NULL,
  thld_line integer NOT NULL,
  thld_running_cents bigint NOT NULL,
  thdb_line integer NOT NULL,
  thdb_running_cents bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_cn VALUES
  ('CN-2026-0001', 'THCN/26/1',  'THCN/26/01', DATE '2026-01-09', 'MYSHOP(KM)',  2290,   4651,  -9177530,   6425, 101600),
  ('CN-2026-0002', 'THCN/26/2',  'THCN/26/02', DATE '2026-01-17', 'MYSHOP-QL',   2565,   4714, -24144185,   6738, 253100),
  ('CN-2026-0003', 'THCN/26/3',  'THCN/26/03', DATE '2026-02-05', 'YTF',        105660, 4847, -57915060,  10156, 137340),
  ('CN-2026-0004', 'THCN/26/4',  'THCN/26/04', DATE '2026-02-06', 'MYSHOP-KD1', 2565,   4858, -61902145,   6621, 82935),
  ('CN-2026-0005', 'THCN/26/5',  'THCN/26/05', DATE '2026-02-14', 'MYSHOP-QL',   1540,   4907, -74840565,   6743, 136800),
  ('CN-2026-0006', 'THCN/26/6',  'THCN/26/06', DATE '2026-02-26', 'MYSHOP-LK',   6755,   4968, -90797070,   6675, 218445),
  ('CN-2026-0007', 'THCN/26/7',  'THCN/26/07', DATE '2026-03-10', 'MYSHOP-KM2',  3350,   5035, -105821915,  6636, 108250),
  ('CN-2026-0008', 'THCN/26/8',  'THCN/26/08', DATE '2026-03-10', 'MYSHOP(KM)',  1180,   5036, -105820735,  6429, 37220),
  ('CN-2026-0009', 'THCN/26/9',  'THCN/26/09', DATE '2026-03-18', 'C-CARE(6)',   19572,  5098, -124418383,  1832, 430428),
  ('CN-2026-0010', 'THCN/26/10', 'THCN/26/10', DATE '2026-04-08', 'MYSHOP-QL',   3340,   5201, -148028288,  6749, 218060),
  ('CN-2026-0011', 'THCN/26/11', 'THCN/26/11', DATE '2026-04-08', 'MYSHOP-QL',   3300,   5202, -148024988,  6750, 214760),
  ('CN-2026-0012', 'THCN/26/12', 'THCN/26/12', DATE '2026-04-08', 'MYSHOP(KM)',  1200,   5203, -148023788,  6431, 75970),
  ('CN-2026-0013', 'THCN/26/13', 'THCN/26/13', DATE '2026-05-20', 'MEEWOO-K',    21875,  5458, -214899093,  5945, 422325),
  ('CN-2026-0014', 'THCN/26/14', 'THCN/26/14', DATE '2026-05-28', 'MYSHOP-SKT',  5130,   5509, -229448403,  6757, 161765),
  ('CN-2026-0015', 'THCN/26/15', 'THCN/26/15', DATE '2026-05-28', 'MYSHOP(KM)',  685,    5510, -229447718,  6434, 64555),
  ('CN-2026-0016', 'THCN/26/16', 'THCN/26/16', DATE '2026-05-28', 'MYSHOP-KM2',  2485,   5511, -229445233,  6639, 80365);

CREATE TEMP TABLE expected_cn_projection ON COMMIT DROP AS
SELECT expected.source_id,
       expected.legacy_reference AS journal_reference,
       expected.entry_date,
       projected.source_kind,
       projected.source_physical_line,
       projected.legacy_account_code,
       projected.account_code,
       projected.movement_cents,
       projected.running_balance_cents
  FROM expected_cn expected
 CROSS JOIN LATERAL (VALUES
   ('THLD'::varchar, expected.thld_line, 'CR_SALES'::varchar,
    'CR_SALES'::varchar, expected.amount_cents,
    expected.thld_running_cents),
   ('THDB'::varchar, expected.thdb_line, expected.debtor_account,
    expected.debtor_account, -expected.amount_cents,
    expected.thdb_running_cents)
 ) AS projected(
   source_kind,
   source_physical_line,
   legacy_account_code,
   account_code,
   movement_cents,
   running_balance_cents
 );

CREATE TEMP TABLE desired_import_headers ON COMMIT DROP AS
WITH grouped AS (
  SELECT staged.entry_date,
         staged.journal_group_key,
         MIN(staged.stage_sequence) AS first_stage_sequence,
         (ARRAY_AGG(staged.journal_ref ORDER BY staged.stage_sequence))[1]
           AS display_reference,
         SUM(staged.debit_cents)::bigint AS total_debit_cents,
         SUM(staged.credit_cents)::bigint AS total_credit_cents
    FROM import_legacy_rows staged
   WHERE staged.record_kind = 'transaction'
   GROUP BY staged.entry_date, staged.journal_group_key
), numbered AS (
  SELECT grouped.*,
         ROW_NUMBER() OVER (
           PARTITION BY grouped.entry_date
           ORDER BY grouped.first_stage_sequence, grouped.journal_group_key
         ) AS day_sequence
    FROM grouped
)
SELECT numbered.entry_date,
       numbered.journal_group_key,
       numbered.first_stage_sequence,
       numbered.display_reference,
       FORMAT(
         'IMP-%s-%s',
         TO_CHAR(numbered.entry_date, 'YYYYMMDD'),
         LPAD(numbered.day_sequence::text, 4, '0')
       )::varchar(50) AS reference_no,
       ('Legacy import ' || numbered.display_reference)::text AS description,
       (numbered.total_debit_cents::numeric / 100) AS total_debit,
       (numbered.total_credit_cents::numeric / 100) AS total_credit
  FROM numbered;

CREATE UNIQUE INDEX ON desired_import_headers (reference_no);
CREATE UNIQUE INDEX ON desired_import_headers (journal_group_key);

CREATE TEMP TABLE desired_import_lines ON COMMIT DROP AS
SELECT headers.reference_no,
       staged.journal_group_key,
       ROW_NUMBER() OVER (
         PARTITION BY staged.journal_group_key
         ORDER BY staged.stage_sequence
       )::integer AS line_number,
       staged.account_code,
       (staged.debit_cents::numeric / 100) AS debit_amount,
       (staged.credit_cents::numeric / 100) AS credit_amount,
       headers.reference_no::varchar(100) AS line_reference,
       staged.particulars,
       staged.cheque_reference,
       ROW_NUMBER() OVER (
         PARTITION BY staged.journal_group_key, staged.account_code
         ORDER BY staged.stage_sequence
       )::integer AS display_order,
       staged.line_display_reference AS display_reference,
       staged.stage_sequence
  FROM import_legacy_rows staged
  JOIN desired_import_headers headers
    ON headers.journal_group_key = staged.journal_group_key
   AND headers.entry_date = staged.entry_date
 WHERE staged.record_kind = 'transaction';

CREATE UNIQUE INDEX ON desired_import_lines (journal_group_key, line_number);

CREATE TEMP TABLE actual_import_months ON COMMIT DROP AS
SELECT DATE_TRUNC('month', headers.entry_date)::date AS month_start,
       COUNT(DISTINCT headers.id)::integer AS journals,
       COUNT(lines.id)::integer AS lines,
       COUNT(lines.id) FILTER (WHERE lines.debit_amount > 0)::integer
         AS debit_lines,
       COUNT(lines.id) FILTER (WHERE lines.credit_amount > 0)::integer
         AS credit_lines,
       COUNT(lines.id) FILTER (
         WHERE lines.debit_amount = 0 AND lines.credit_amount = 0
       )::integer AS zero_lines,
       SUM(ROUND(lines.debit_amount * 100))::bigint AS debit_cents,
       SUM(ROUND(lines.credit_amount * 100))::bigint AS credit_cents
  FROM journal_entries headers
  JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
 WHERE headers.entry_type = 'IMP'
 GROUP BY DATE_TRUNC('month', headers.entry_date)::date;

CREATE TEMP TABLE reconstructed_source_chain ON COMMIT DROP AS
WITH source_chain_rows AS (
  SELECT staged.source_kind,
         staged.source_physical_line,
         staged.legacy_account_code,
         staged.account_code,
         staged.entry_date,
         CASE
           WHEN staged.record_kind = 'opening'
             THEN staged.running_balance_cents
           ELSE staged.debit_cents - staged.credit_cents
         END::bigint AS movement_cents,
         staged.running_balance_cents
    FROM import_legacy_rows staged
   WHERE staged.source_kind <> 'DERIVED'
  UNION ALL
  SELECT projected.source_kind,
         projected.source_physical_line,
         projected.legacy_account_code,
         projected.account_code,
         projected.entry_date,
         projected.movement_cents,
         projected.running_balance_cents
    FROM expected_cn_projection projected
), walked AS (
  SELECT source_chain_rows.*,
         SUM(source_chain_rows.movement_cents) OVER (
           PARTITION BY source_chain_rows.source_kind,
                        source_chain_rows.legacy_account_code
           ORDER BY source_chain_rows.source_physical_line
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         )::bigint AS calculated_running_cents
    FROM source_chain_rows
)
SELECT * FROM walked;

CREATE TEMP TABLE expected_source_close ON COMMIT DROP AS
WITH staged_opening AS (
  SELECT staged.account_code,
         SUM(staged.running_balance_cents)::bigint AS opening_cents
    FROM import_legacy_rows staged
   WHERE staged.record_kind = 'opening'
   GROUP BY staged.account_code
), staged_movement AS (
  SELECT staged.account_code,
         SUM(staged.debit_cents - staged.credit_cents)::bigint
           AS movement_cents
    FROM import_legacy_rows staged
   WHERE staged.record_kind = 'transaction'
     AND staged.entry_date <= DATE '2026-05-31'
   GROUP BY staged.account_code
), cn_movement AS (
  SELECT projected.account_code,
         SUM(projected.movement_cents)::bigint AS movement_cents
    FROM expected_cn_projection projected
   WHERE projected.entry_date <= DATE '2026-05-31'
   GROUP BY projected.account_code
), source_accounts AS (
  SELECT account_code FROM staged_opening
  UNION
  SELECT account_code FROM staged_movement
  UNION
  SELECT account_code FROM cn_movement
)
SELECT accounts.account_code,
       COALESCE(opening.opening_cents, 0)
         + COALESCE(staged.movement_cents, 0)
         + COALESCE(credit_notes.movement_cents, 0) AS close_cents
  FROM source_accounts accounts
  LEFT JOIN staged_opening opening USING (account_code)
  LEFT JOIN staged_movement staged USING (account_code)
  LEFT JOIN cn_movement credit_notes USING (account_code);

CREATE UNIQUE INDEX ON expected_source_close (account_code);

CREATE TEMP TABLE expected_monthly_account_closes ON COMMIT DROP AS
WITH staged_opening AS (
  SELECT staged.account_code,
         SUM(staged.running_balance_cents)::bigint AS opening_cents
    FROM import_legacy_rows staged
   WHERE staged.record_kind = 'opening'
   GROUP BY staged.account_code
), staged_cumulative AS (
  SELECT months.month_start,
         staged.account_code,
         SUM(staged.debit_cents - staged.credit_cents)::bigint
           AS movement_cents
    FROM expected_import_months months
    JOIN import_legacy_rows staged
      ON staged.record_kind = 'transaction'
     AND staged.entry_date < (months.month_start + INTERVAL '1 month')
   GROUP BY months.month_start, staged.account_code
), cn_cumulative AS (
  SELECT months.month_start,
         projected.account_code,
         SUM(projected.movement_cents)::bigint AS movement_cents
    FROM expected_import_months months
    JOIN expected_cn_projection projected
      ON projected.entry_date < (months.month_start + INTERVAL '1 month')
   GROUP BY months.month_start, projected.account_code
)
SELECT months.month_start,
       accounts.account_code,
       COALESCE(opening.opening_cents, 0)
         + COALESCE(staged.movement_cents, 0)
         + COALESCE(credit_notes.movement_cents, 0) AS close_cents
  FROM expected_import_months months
 CROSS JOIN expected_source_close accounts
  LEFT JOIN staged_opening opening USING (account_code)
  LEFT JOIN staged_cumulative staged
    ON staged.month_start = months.month_start
   AND staged.account_code = accounts.account_code
  LEFT JOIN cn_cumulative credit_notes
    ON credit_notes.month_start = months.month_start
   AND credit_notes.account_code = accounts.account_code;

CREATE UNIQUE INDEX ON expected_monthly_account_closes (
  month_start,
  account_code
);

CREATE TEMP TABLE actual_monthly_account_closes ON COMMIT DROP AS
WITH staged_opening AS (
  SELECT staged.account_code,
         SUM(staged.running_balance_cents)::bigint AS opening_cents
    FROM import_legacy_rows staged
   WHERE staged.record_kind = 'opening'
   GROUP BY staged.account_code
), import_cumulative AS (
  SELECT months.month_start,
         lines.account_code,
         SUM(
           ROUND(lines.debit_amount * 100)
             - ROUND(lines.credit_amount * 100)
         )::bigint AS movement_cents
    FROM expected_import_months months
    JOIN journal_entries headers
      ON headers.entry_type = 'IMP'
     AND headers.status = 'posted'
     AND headers.entry_date < (months.month_start + INTERVAL '1 month')
    JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
   GROUP BY months.month_start, lines.account_code
), cn_cumulative AS (
  SELECT months.month_start,
         lines.account_code,
         SUM(
           ROUND(lines.debit_amount * 100)
             - ROUND(lines.credit_amount * 100)
         )::bigint AS movement_cents
    FROM expected_import_months months
    JOIN journal_entries headers
      ON headers.source_id IN (SELECT source_id FROM expected_cn)
     AND headers.entry_type = 'CN'
     AND headers.status = 'posted'
     AND headers.entry_date < (months.month_start + INTERVAL '1 month')
    JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
   GROUP BY months.month_start, lines.account_code
)
SELECT months.month_start,
       accounts.account_code,
       COALESCE(opening.opening_cents, 0)
         + COALESCE(imported.movement_cents, 0)
         + COALESCE(credit_notes.movement_cents, 0) AS close_cents
  FROM expected_import_months months
 CROSS JOIN expected_source_close accounts
  LEFT JOIN staged_opening opening USING (account_code)
  LEFT JOIN import_cumulative imported
    ON imported.month_start = months.month_start
   AND imported.account_code = accounts.account_code
  LEFT JOIN cn_cumulative credit_notes
    ON credit_notes.month_start = months.month_start
   AND credit_notes.account_code = accounts.account_code;

CREATE UNIQUE INDEX ON actual_monthly_account_closes (
  month_start,
  account_code
);

DO $acceptance$
DECLARE
  v_count bigint;
  v_amount_cents bigint;
  v_debit_cents bigint;
  v_credit_cents bigint;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(staged.debit_cents)
           FILTER (WHERE staged.record_kind = 'transaction'), 0),
         COALESCE(SUM(staged.credit_cents)
           FILTER (WHERE staged.record_kind = 'transaction'), 0)
    INTO v_count, v_debit_cents, v_credit_cents
    FROM import_legacy_rows staged;

  IF (v_count, v_debit_cents, v_credit_cents) IS DISTINCT FROM
     (12635::bigint, 1350351615::bigint, 1350351615::bigint) THEN
    RAISE EXCEPTION 'Staging no longer matches the approved population';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM import_legacy_rows staged
     WHERE staged.source_sha256 NOT IN (
       '6230d4613768f3f1b51c6195852560446103e39b57b2deb8ac575d8c8ecaa918',
       '6ef5ee949cca9b7903cff5ede201bea5d6e6bc8d341c45e91ea060aeac905a81'
     )
  ) THEN
    RAISE EXCEPTION 'Staging contains an unapproved source hash';
  END IF;

  IF (SELECT COUNT(*) FROM desired_import_headers) <> 3863
     OR (SELECT COUNT(*) FROM desired_import_lines) <> 10068 THEN
    RAISE EXCEPTION 'The deterministic import projection has changed shape';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM expected_import_months expected
      FULL JOIN actual_import_months actual USING (month_start)
     WHERE actual.month_start IS NULL
        OR expected.month_start IS NULL
        OR actual.journals IS DISTINCT FROM expected.expected_journals
        OR actual.lines IS DISTINCT FROM expected.expected_lines
        OR actual.debit_lines IS DISTINCT FROM expected.expected_debit_lines
        OR actual.credit_lines IS DISTINCT FROM expected.expected_credit_lines
        OR actual.zero_lines IS DISTINCT FROM expected.expected_zero_lines
        OR actual.debit_cents IS DISTINCT FROM expected.expected_amount_cents
        OR actual.credit_cents IS DISTINCT FROM expected.expected_amount_cents
  ) THEN
    RAISE EXCEPTION 'One or more monthly import totals differ from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_import_headers desired
      LEFT JOIN journal_entries actual
        ON actual.reference_no = desired.reference_no
     WHERE actual.id IS NULL
        OR actual.entry_type IS DISTINCT FROM 'IMP'
        OR actual.entry_date IS DISTINCT FROM desired.entry_date
        OR actual.description IS DISTINCT FROM desired.description
        OR actual.total_debit IS DISTINCT FROM desired.total_debit
        OR actual.total_credit IS DISTINCT FROM desired.total_credit
        OR actual.status IS DISTINCT FROM 'posted'
        OR actual.display_reference IS DISTINCT FROM desired.display_reference
        OR actual.cheque_no IS NOT NULL
        OR actual.posting_sequence IS NOT NULL
        OR actual.source_type IS NOT NULL
        OR actual.source_id IS NOT NULL
        OR actual.created_by IS DISTINCT FROM 'legacy-import'
        OR actual.updated_by IS DISTINCT FROM 'legacy-import'
        OR actual.posted_by IS DISTINCT FROM 'legacy-import'
        OR actual.posted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more IMP headers differ from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries actual
      LEFT JOIN desired_import_headers desired
        ON desired.reference_no = actual.reference_no
     WHERE actual.entry_type = 'IMP'
       AND desired.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'An unexpected IMP header exists';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_import_lines desired
      JOIN journal_entries headers
        ON headers.reference_no = desired.reference_no
      LEFT JOIN journal_entry_lines actual
        ON actual.journal_entry_id = headers.id
       AND actual.line_number = desired.line_number
     WHERE actual.id IS NULL
        OR actual.account_code IS DISTINCT FROM desired.account_code
        OR actual.debit_amount IS DISTINCT FROM desired.debit_amount
        OR actual.credit_amount IS DISTINCT FROM desired.credit_amount
        OR actual.reference IS DISTINCT FROM desired.line_reference
        OR actual.particulars IS DISTINCT FROM desired.particulars
        OR actual.cheque_reference IS DISTINCT FROM desired.cheque_reference
        OR actual.display_order IS DISTINCT FROM desired.display_order
        OR actual.display_reference IS DISTINCT FROM desired.display_reference
  ) THEN
    RAISE EXCEPTION 'One or more IMP lines differ from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries headers
      JOIN journal_entry_lines actual ON actual.journal_entry_id = headers.id
      LEFT JOIN desired_import_lines desired
        ON desired.reference_no = headers.reference_no
       AND desired.line_number = actual.line_number
     WHERE headers.entry_type = 'IMP'
       AND desired.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'An IMP journal contains an unexpected line';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries headers
      JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
     WHERE headers.entry_type = 'IMP'
     GROUP BY headers.id, headers.total_debit, headers.total_credit
    HAVING SUM(lines.debit_amount) IS DISTINCT FROM headers.total_debit
        OR SUM(lines.credit_amount) IS DISTINCT FROM headers.total_credit
        OR SUM(lines.debit_amount) IS DISTINCT FROM SUM(lines.credit_amount)
  ) THEN
    RAISE EXCEPTION 'An IMP journal is not balanced against its header';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM expected_cn expected
      LEFT JOIN journal_entries headers
        ON headers.source_id = expected.source_id
       AND headers.source_type = 'adjustment'
       AND headers.entry_type = 'CN'
       AND headers.status = 'posted'
       AND headers.display_reference = expected.display_reference
       AND headers.entry_date = expected.entry_date
       AND ROUND(headers.total_debit * 100)::bigint = expected.amount_cents
       AND ROUND(headers.total_credit * 100)::bigint = expected.amount_cents
      LEFT JOIN adjustment_documents documents
        ON documents.id = expected.source_id
       AND documents.journal_entry_id = headers.id
       AND documents.type = 'credit_note'
      LEFT JOIN journal_entry_lines lines
        ON lines.journal_entry_id = headers.id
     GROUP BY expected.source_id, expected.debtor_account,
              expected.amount_cents
    HAVING COUNT(DISTINCT headers.id) <> 1
        OR COUNT(DISTINCT documents.id) <> 1
        OR COUNT(lines.id) <> 2
        OR COUNT(lines.id) FILTER (
             WHERE lines.account_code = 'CR_SALES'
               AND ROUND(lines.debit_amount * 100)::bigint
                     = expected.amount_cents
               AND ROUND(lines.credit_amount * 100)::bigint = 0
           ) <> 1
        OR COUNT(lines.id) FILTER (
             WHERE lines.account_code = expected.debtor_account
               AND ROUND(lines.debit_amount * 100)::bigint = 0
               AND ROUND(lines.credit_amount * 100)::bigint
                     = expected.amount_cents
           ) <> 1
  ) THEN
    RAISE EXCEPTION 'A source-owned CN differs from its exact legacy projection';
  END IF;

  IF (SELECT COUNT(*)
        FROM journal_entries headers
       WHERE headers.entry_type = 'CN'
         AND headers.status = 'posted'
         AND headers.entry_date BETWEEN DATE '2026-01-01'
                                    AND DATE '2026-05-31') <> 16 THEN
    RAISE EXCEPTION 'The Jan-May posted CN population is not exactly 16';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries headers
     WHERE headers.status = 'posted'
       AND headers.entry_date BETWEEN DATE '2026-01-01'
                                  AND DATE '2026-05-31'
       AND headers.entry_type NOT IN ('IMP', 'CN')
  ) THEN
    RAISE EXCEPTION 'An unexpected posted journal exists in Jan-May';
  END IF;

  IF (SELECT COUNT(*) FROM reconstructed_source_chain) <> 12665
     OR EXISTS (
       SELECT 1
         FROM reconstructed_source_chain source
        WHERE source.running_balance_cents
                IS DISTINCT FROM source.calculated_running_cents
     ) THEN
    RAISE EXCEPTION 'A reconstructed legacy source running balance does not reconcile';
  END IF;

  IF (SELECT COUNT(*) FROM expected_source_close) <> 2568
     OR (SELECT SUM(close_cents) FROM expected_source_close)
          IS DISTINCT FROM -145648037::bigint THEN
    RAISE EXCEPTION 'The source-derived 31 May population has changed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM expected_monthly_account_closes expected
      FULL JOIN actual_monthly_account_closes actual
        USING (month_start, account_code)
     WHERE expected.close_cents IS DISTINCT FROM actual.close_cents
  ) THEN
    RAISE EXCEPTION 'A cumulative monthly per-account close differs from source';
  END IF;

  SELECT COUNT(*), SUM(ROUND(anchors.amount * 100))::bigint
    INTO v_count, v_amount_cents
    FROM account_opening_balances anchors
   WHERE anchors.as_of_date = DATE '2026-06-01';

  IF (v_count, v_amount_cents) IS DISTINCT FROM
     (1571::bigint, -261795905::bigint) THEN
    RAISE EXCEPTION 'The 1 June checkpoint anchor population has changed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM account_opening_balances anchors
      LEFT JOIN expected_source_close source USING (account_code)
     WHERE anchors.as_of_date = DATE '2026-06-01'
       AND COALESCE(source.close_cents, 0) IS DISTINCT FROM
             ROUND(anchors.amount * 100)::bigint
  ) THEN
    RAISE EXCEPTION 'A source-derived 31 May close differs from its 1 June anchor';
  END IF;

  IF EXISTS (
    WITH expected(account_code, close_cents) AS (
      VALUES
        ('BANK_PBB'::varchar, 17228816::bigint),
        ('BANK_ABB'::varchar, 20426::bigint),
        ('CH_REV1'::varchar, 3564435::bigint),
        ('CH_REV2'::varchar, 106005::bigint),
        ('C-CARE(1)'::varchar, 874800::bigint)
    )
    SELECT 1
      FROM expected
      LEFT JOIN expected_source_close actual USING (account_code)
     WHERE actual.close_cents IS DISTINCT FROM expected.close_cents
  ) THEN
    RAISE EXCEPTION 'A named 31 May close differs from the approved target';
  END IF;

  IF EXISTS (
    WITH expected(account_code, movement_cents) AS (
      VALUES
        ('CASH_SALES'::varchar, -103768040::bigint),
        ('CR_SALES'::varchar, -229696893::bigint)
    ), actual AS (
      SELECT accounts.account_code,
             COALESCE(staged.movement_cents, 0)
               + COALESCE(credit_notes.movement_cents, 0) AS movement_cents
        FROM expected accounts
        LEFT JOIN (
          SELECT account_code,
                 SUM(debit_cents - credit_cents)::bigint AS movement_cents
            FROM import_legacy_rows
           WHERE record_kind = 'transaction'
           GROUP BY account_code
        ) staged USING (account_code)
        LEFT JOIN (
          SELECT account_code,
                 SUM(movement_cents)::bigint AS movement_cents
            FROM expected_cn_projection
           GROUP BY account_code
        ) credit_notes USING (account_code)
    )
    SELECT 1
      FROM expected
      JOIN actual USING (account_code)
     WHERE actual.movement_cents IS DISTINCT FROM expected.movement_cents
  ) THEN
    RAISE EXCEPTION 'A named Jan-May movement differs from the approved target';
  END IF;

  SELECT COUNT(DISTINCT headers.id),
         COUNT(lines.id),
         SUM(ROUND(lines.debit_amount * 100))::bigint,
         SUM(ROUND(lines.credit_amount * 100))::bigint
    INTO v_count, v_amount_cents, v_debit_cents, v_credit_cents
    FROM journal_entries headers
    JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
   WHERE headers.status = 'posted'
     AND headers.entry_type IN ('IMP', 'CN')
     AND headers.entry_date BETWEEN DATE '2026-01-01'
                                AND DATE '2026-05-31';

  IF (v_count, v_amount_cents, v_debit_cents, v_credit_cents)
     IS DISTINCT FROM
     (3879::bigint, 10100::bigint, 1350535107::bigint,
      1350535107::bigint) THEN
    RAISE EXCEPTION 'The final posted legacy journal population is not exact';
  END IF;
END
$acceptance$;

SELECT actual.month_start,
       actual.journals,
       actual.lines,
       actual.debit_lines,
       actual.credit_lines,
       actual.zero_lines,
       actual.debit_cents,
       actual.credit_cents
  FROM actual_import_months actual
 ORDER BY actual.month_start;

SELECT COUNT(*) AS source_chain_rows,
       COUNT(*) FILTER (
         WHERE running_balance_cents IS DISTINCT FROM calculated_running_cents
       ) AS source_chain_mismatches
  FROM reconstructed_source_chain;

SELECT COUNT(*) AS source_accounts,
       SUM(close_cents)::bigint AS source_close_cents
  FROM expected_source_close;

SELECT COUNT(*) AS june_anchors,
       SUM(ROUND(amount * 100))::bigint AS june_anchor_cents,
       COUNT(*) FILTER (WHERE source.account_code IS NULL)
         AS zero_anchors_absent_from_source,
       COUNT(*) FILTER (
         WHERE COALESCE(source.close_cents, 0)
                 IS DISTINCT FROM ROUND(anchors.amount * 100)::bigint
       ) AS june_anchor_mismatches
  FROM account_opening_balances anchors
  LEFT JOIN expected_source_close source USING (account_code)
 WHERE anchors.as_of_date = DATE '2026-06-01';

COMMIT;

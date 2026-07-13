-- Post one idempotent month of the hash-validated Jan-May 2026 legacy import.
-- Usage example:
--   psql -v ON_ERROR_STOP=1 -v month_start=2026-01-01 \
--     -f post-monthly-journals.sql
-- Run once for each month start from 2026-01-01 through 2026-05-01.

\set ON_ERROR_STOP on
\if :{?month_start}
\else
  \echo 'month_start is required (allowed: 2026-01-01 through 2026-05-01)'
  \quit 3
\endif

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('legacy_jan_may_2026_journal_import', 0)
);

LOCK TABLE import_legacy_rows IN SHARE MODE;
LOCK TABLE journal_entries, journal_entry_lines IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE import_batch_parameters (
  month_start date PRIMARY KEY,
  month_end date NOT NULL,
  expected_lines integer NOT NULL,
  expected_groups integer NOT NULL,
  expected_debit_cents bigint NOT NULL,
  expected_credit_cents bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO import_batch_parameters (
  month_start,
  month_end,
  expected_lines,
  expected_groups,
  expected_debit_cents,
  expected_credit_cents
)
SELECT expected.month_start,
       (expected.month_start + INTERVAL '1 month')::date,
       expected.expected_lines,
       expected.expected_groups,
       expected.expected_debit_cents,
       expected.expected_credit_cents
  FROM (VALUES
    (DATE '2026-01-01', 2232, 854, 310886817::bigint, 310886817::bigint),
    (DATE '2026-02-01', 1980, 749, 245055890::bigint, 245055890::bigint),
    (DATE '2026-03-01', 1887, 735, 274098314::bigint, 274098314::bigint),
    (DATE '2026-04-01', 2137, 798, 253121850::bigint, 253121850::bigint),
    (DATE '2026-05-01', 1832, 727, 267188744::bigint, 267188744::bigint)
  ) AS expected(
    month_start,
    expected_lines,
    expected_groups,
    expected_debit_cents,
    expected_credit_cents
  )
 WHERE expected.month_start = DATE :'month_start';

DO $preflight$
DECLARE
  v_total_rows bigint;
  v_opening_rows bigint;
  v_transaction_rows bigint;
  v_groups bigint;
  v_debit_cents numeric;
  v_credit_cents numeric;
  v_repaired_rows bigint;
BEGIN
  IF (SELECT COUNT(*) FROM import_batch_parameters) <> 1 THEN
    RAISE EXCEPTION 'Invalid month_start. Allowed values are the first days of January-May 2026.';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE record_kind = 'opening'),
         COUNT(*) FILTER (WHERE record_kind = 'transaction'),
         COUNT(DISTINCT journal_group_key)
           FILTER (WHERE record_kind = 'transaction'),
         COALESCE(SUM(debit_cents)
           FILTER (WHERE record_kind = 'transaction'), 0),
         COALESCE(SUM(credit_cents)
           FILTER (WHERE record_kind = 'transaction'), 0),
         COUNT(*) FILTER (WHERE repaired)
    INTO v_total_rows, v_opening_rows, v_transaction_rows, v_groups,
         v_debit_cents, v_credit_cents, v_repaired_rows
    FROM import_legacy_rows;

  IF (v_total_rows, v_opening_rows, v_transaction_rows, v_groups,
      v_debit_cents, v_credit_cents, v_repaired_rows)
     IS DISTINCT FROM
     (12635::bigint, 2567::bigint, 10068::bigint, 3863::bigint,
      1350351615::numeric, 1350351615::numeric, 4::bigint) THEN
    RAISE EXCEPTION 'The loaded staging population no longer matches the audited import';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM import_legacy_rows
     WHERE source_sha256 NOT IN (
       '6230d4613768f3f1b51c6195852560446103e39b57b2deb8ac575d8c8ecaa918',
       '6ef5ee949cca9b7903cff5ede201bea5d6e6bc8d341c45e91ea060aeac905a81'
     )
  ) THEN
    RAISE EXCEPTION 'The loaded staging population contains an unapproved source hash';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM journal_entry_types
     WHERE code = 'IMP'
       AND is_active
  ) THEN
    RAISE EXCEPTION 'The active IMP journal type is missing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries
     WHERE status = 'posted'
       AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
       AND entry_type NOT IN ('CN', 'IMP')
  ) THEN
    RAISE EXCEPTION 'Unexpected posted non-CN/non-IMP journal exists in the import window';
  END IF;

  IF EXISTS (
    WITH expected(source_id, display_reference, target_date) AS (
      VALUES
        ('CN-2026-0001', 'THCN/26/1',  DATE '2026-01-09'),
        ('CN-2026-0002', 'THCN/26/2',  DATE '2026-01-17'),
        ('CN-2026-0003', 'THCN/26/3',  DATE '2026-02-05'),
        ('CN-2026-0004', 'THCN/26/4',  DATE '2026-02-06'),
        ('CN-2026-0005', 'THCN/26/5',  DATE '2026-02-14'),
        ('CN-2026-0006', 'THCN/26/6',  DATE '2026-02-26'),
        ('CN-2026-0007', 'THCN/26/7',  DATE '2026-03-10'),
        ('CN-2026-0008', 'THCN/26/8',  DATE '2026-03-10'),
        ('CN-2026-0009', 'THCN/26/9',  DATE '2026-03-18'),
        ('CN-2026-0010', 'THCN/26/10', DATE '2026-04-08'),
        ('CN-2026-0011', 'THCN/26/11', DATE '2026-04-08'),
        ('CN-2026-0012', 'THCN/26/12', DATE '2026-04-08'),
        ('CN-2026-0013', 'THCN/26/13', DATE '2026-05-20'),
        ('CN-2026-0014', 'THCN/26/14', DATE '2026-05-28'),
        ('CN-2026-0015', 'THCN/26/15', DATE '2026-05-28'),
        ('CN-2026-0016', 'THCN/26/16', DATE '2026-05-28')
    )
    SELECT 1
      FROM expected
      LEFT JOIN journal_entries journals
        ON journals.source_type = 'adjustment'
       AND journals.source_id = expected.source_id
       AND journals.display_reference = expected.display_reference
       AND journals.entry_date = expected.target_date
       AND journals.entry_type = 'CN'
       AND journals.status = 'posted'
      LEFT JOIN adjustment_documents documents
        ON documents.id = expected.source_id
       AND documents.journal_entry_id = journals.id
       AND documents.type = 'credit_note'
     WHERE journals.id IS NULL
        OR documents.id IS NULL
  ) OR (SELECT COUNT(*)
          FROM journal_entries
         WHERE status = 'posted'
           AND entry_type = 'CN'
           AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31') <> 16 THEN
    RAISE EXCEPTION 'The 16 source-owned CN journals are not in the exact approved state';
  END IF;
END
$preflight$;

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
    CROSS JOIN import_batch_parameters parameters
   WHERE staged.record_kind = 'transaction'
     AND staged.entry_date >= parameters.month_start
     AND staged.entry_date < parameters.month_end
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

ALTER TABLE desired_import_lines
  ADD PRIMARY KEY (journal_group_key, line_number);

DO $batch_shape$
DECLARE
  v_actual_lines bigint;
  v_actual_groups bigint;
  v_actual_debit_cents numeric;
  v_actual_credit_cents numeric;
  v_expected import_batch_parameters%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_expected FROM import_batch_parameters;

  SELECT COUNT(*), COUNT(DISTINCT journal_group_key),
         SUM((debit_amount * 100)::bigint),
         SUM((credit_amount * 100)::bigint)
    INTO v_actual_lines, v_actual_groups,
         v_actual_debit_cents, v_actual_credit_cents
    FROM desired_import_lines;

  IF (v_actual_lines, v_actual_groups,
      v_actual_debit_cents, v_actual_credit_cents)
     IS DISTINCT FROM
     (v_expected.expected_lines::bigint, v_expected.expected_groups::bigint,
      v_expected.expected_debit_cents::numeric,
      v_expected.expected_credit_cents::numeric) THEN
    RAISE EXCEPTION
      'Unexpected batch shape for %: lines %, groups %, DR cents %, CR cents %',
      v_expected.month_start, v_actual_lines, v_actual_groups,
      v_actual_debit_cents, v_actual_credit_cents;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_import_headers
     WHERE total_debit IS DISTINCT FROM total_credit
  ) THEN
    RAISE EXCEPTION 'Desired batch contains an unbalanced journal';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_import_lines desired
      LEFT JOIN account_codes accounts ON accounts.code = desired.account_code
     WHERE accounts.code IS NULL
        OR accounts.is_active IS DISTINCT FROM true
        OR accounts.fs_note IS NULL
  ) THEN
    RAISE EXCEPTION 'Desired batch contains a missing, inactive, or unmapped account code';
  END IF;
END
$batch_shape$;

WITH inserted_headers AS (
  INSERT INTO journal_entries (
    reference_no,
    entry_type,
    entry_date,
    description,
    total_debit,
    total_credit,
    status,
    created_by,
    updated_by,
    posted_at,
    posted_by,
    cheque_no,
    display_reference,
    posting_sequence,
    source_type,
    source_id
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
         NULL,
         NULL,
         NULL
    FROM desired_import_headers desired
  ON CONFLICT (reference_no) DO NOTHING
  RETURNING id, reference_no
)
INSERT INTO journal_entry_lines (
  journal_entry_id,
  line_number,
  account_code,
  debit_amount,
  credit_amount,
  reference,
  particulars,
  cheque_reference,
  display_order,
  display_reference
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

DO $verification$
DECLARE
  v_parameters import_batch_parameters%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_parameters FROM import_batch_parameters;

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
        OR actual.posted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more imported journal headers differ from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries actual
      LEFT JOIN desired_import_headers desired
        ON desired.reference_no = actual.reference_no
     WHERE actual.entry_type = 'IMP'
       AND actual.entry_date >= v_parameters.month_start
       AND actual.entry_date < v_parameters.month_end
       AND desired.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'Unexpected IMP journal exists in the batch month';
  END IF;

  IF (SELECT COUNT(*)
        FROM journal_entries actual
       WHERE actual.entry_type = 'IMP'
         AND actual.entry_date >= v_parameters.month_start
         AND actual.entry_date < v_parameters.month_end)
     <> v_parameters.expected_groups THEN
    RAISE EXCEPTION 'Imported journal header count differs from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_import_lines desired
      JOIN journal_entries header
        ON header.reference_no = desired.reference_no
      LEFT JOIN journal_entry_lines actual
        ON actual.journal_entry_id = header.id
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
    RAISE EXCEPTION 'One or more imported journal lines differ from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries header
      JOIN journal_entry_lines actual ON actual.journal_entry_id = header.id
      LEFT JOIN desired_import_lines desired
        ON desired.reference_no = header.reference_no
       AND desired.line_number = actual.line_number
     WHERE header.entry_type = 'IMP'
       AND header.entry_date >= v_parameters.month_start
       AND header.entry_date < v_parameters.month_end
       AND desired.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'An imported journal contains an extra line';
  END IF;

  IF (SELECT COUNT(*)
        FROM journal_entries header
        JOIN journal_entry_lines actual ON actual.journal_entry_id = header.id
       WHERE header.entry_type = 'IMP'
         AND header.entry_date >= v_parameters.month_start
         AND header.entry_date < v_parameters.month_end)
     <> v_parameters.expected_lines THEN
    RAISE EXCEPTION 'Imported journal line count differs from staging';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries header
      JOIN journal_entry_lines lines ON lines.journal_entry_id = header.id
     WHERE header.entry_type = 'IMP'
       AND header.entry_date >= v_parameters.month_start
       AND header.entry_date < v_parameters.month_end
     GROUP BY header.id, header.total_debit, header.total_credit
    HAVING SUM(lines.debit_amount) IS DISTINCT FROM header.total_debit
        OR SUM(lines.credit_amount) IS DISTINCT FROM header.total_credit
        OR SUM(lines.debit_amount) IS DISTINCT FROM SUM(lines.credit_amount)
  ) THEN
    RAISE EXCEPTION 'An imported journal is not balanced against its header';
  END IF;

  IF EXISTS (
    WITH staged AS (
      SELECT desired.account_code,
             SUM(desired.debit_amount) AS debit_amount,
             SUM(desired.credit_amount) AS credit_amount
        FROM desired_import_lines desired
       GROUP BY desired.account_code
    ), posted AS (
      SELECT lines.account_code,
             SUM(lines.debit_amount) AS debit_amount,
             SUM(lines.credit_amount) AS credit_amount
        FROM journal_entries header
        JOIN journal_entry_lines lines ON lines.journal_entry_id = header.id
       WHERE header.entry_type = 'IMP'
         AND header.entry_date >= v_parameters.month_start
         AND header.entry_date < v_parameters.month_end
       GROUP BY lines.account_code
    )
    SELECT 1
      FROM staged
      FULL JOIN posted USING (account_code)
     WHERE staged.debit_amount IS DISTINCT FROM posted.debit_amount
        OR staged.credit_amount IS DISTINCT FROM posted.credit_amount
  ) THEN
    RAISE EXCEPTION 'Per-account imported movement differs from staging';
  END IF;
END
$verification$;

COMMIT;

SELECT TO_CHAR(header.entry_date, 'YYYY-MM') AS import_month,
       COUNT(DISTINCT header.id) AS journals,
       COUNT(lines.id) AS lines,
       SUM(lines.debit_amount)::numeric(14,2) AS debit,
       SUM(lines.credit_amount)::numeric(14,2) AS credit
  FROM journal_entries header
  JOIN journal_entry_lines lines ON lines.journal_entry_id = header.id
 WHERE header.entry_type = 'IMP'
   AND header.entry_date >= DATE :'month_start'
   AND header.entry_date < (DATE :'month_start' + INTERVAL '1 month')
 GROUP BY TO_CHAR(header.entry_date, 'YYYY-MM');

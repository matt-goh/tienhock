-- =============================================================================
-- Jan-May 2026 legacy journal presentation and provenance.
--
-- The imported accounting projection remains immutable `IMP` data with its
-- deterministic internal header references. This migration adds the semantic
-- legacy type used for presentation, attaches each header to its audited
-- staging group, replaces the artificial header description with a
-- deterministic source-particular summary, and restores each line's exact
-- legacy-visible reference.
--
-- Guarded and idempotent. The migration accepts only the untouched import state
-- or its own complete end state; mixed/partial states fail closed.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('legacy_jan_may_2026_journal_presentation', 0)
);

LOCK TABLE import_legacy_rows IN SHARE MODE;
LOCK TABLE journal_entries, journal_entry_lines IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS legacy_entry_type varchar(10);

COMMENT ON COLUMN journal_entries.legacy_entry_type IS
  'Semantic journal type from the legacy books for an imported IMP journal; NULL for ordinary ERP journals.';

COMMENT ON COLUMN journal_entries.source_type IS
  'Owning/provenance source kind; legacy_import identifies the audited Jan-May import, while NULL identifies a manual journal.';

COMMENT ON COLUMN journal_entries.source_id IS
  'Owning source-row identifier; for source_type legacy_import this is import_legacy_rows.journal_group_key.';

DO $column_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'journal_entries'
       AND column_name = 'legacy_entry_type'
       AND data_type = 'character varying'
       AND character_maximum_length = 10
       AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'journal_entries.legacy_entry_type has an unexpected definition';
  END IF;
END
$column_contract$;

INSERT INTO journal_entry_types (code, name, description, is_active)
VALUES
  ('JVDR', 'Director Remuneration',
   'Director remuneration journal voucher', true),
  ('JVSL', 'Staff Salary Wages',
   'Staff salary and wages journal voucher', true)
ON CONFLICT (code) DO NOTHING;

DO $type_registry$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM (VALUES ('JVDR'::varchar), ('JVSL'::varchar)) AS expected(code)
      LEFT JOIN journal_entry_types actual USING (code)
     WHERE actual.code IS NULL
        OR actual.is_active IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'JVDR and JVSL must exist as active journal-entry types';
  END IF;
END
$type_registry$;

-- Pin the complete staging population, including the semantic fingerprint used
-- by the production inventory. Counts/totals alone are insufficient because a
-- count-preserving row edit could otherwise change a type or description.
DO $staging_preflight$
DECLARE
  v_rows bigint;
  v_openings bigint;
  v_transactions bigint;
  v_groups bigint;
  v_debit_cents bigint;
  v_credit_cents bigint;
  v_repaired bigint;
  v_derived bigint;
  v_min_sequence integer;
  v_max_sequence integer;
  v_hashes text;
  v_fingerprint text;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE record_kind = 'opening'),
         COUNT(*) FILTER (WHERE record_kind = 'transaction'),
         COUNT(DISTINCT journal_group_key)
           FILTER (WHERE record_kind = 'transaction'),
         COALESCE(SUM(debit_cents)
           FILTER (WHERE record_kind = 'transaction'), 0)::bigint,
         COALESCE(SUM(credit_cents)
           FILTER (WHERE record_kind = 'transaction'), 0)::bigint,
         COUNT(*) FILTER (WHERE repaired),
         COUNT(*) FILTER (WHERE source_kind = 'DERIVED'),
         MIN(stage_sequence),
         MAX(stage_sequence),
         STRING_AGG(DISTINCT source_sha256, ', ' ORDER BY source_sha256),
         MD5(COALESCE(STRING_AGG(
           JSONB_BUILD_ARRAY(
             stage_sequence,
             record_kind,
             source_kind,
             source_sha256,
             source_physical_line,
             account_code,
             entry_date::text,
             journal_ref,
             journal_group_key,
             line_display_reference,
             particulars,
             cheque_reference,
             debit_cents,
             credit_cents,
             running_balance_cents,
             repaired,
             special_case
           )::text,
           E'\n' ORDER BY stage_sequence
         ), ''))
    INTO v_rows, v_openings, v_transactions, v_groups,
         v_debit_cents, v_credit_cents, v_repaired, v_derived,
         v_min_sequence, v_max_sequence, v_hashes, v_fingerprint
    FROM import_legacy_rows;

  IF (v_rows, v_openings, v_transactions, v_groups,
      v_debit_cents, v_credit_cents, v_repaired, v_derived,
      v_min_sequence, v_max_sequence, v_hashes, v_fingerprint)
     IS DISTINCT FROM
     (12635::bigint, 2567::bigint, 10068::bigint, 3863::bigint,
      1350351615::bigint, 1350351615::bigint, 4::bigint, 2::bigint,
      1, 12635,
      '6230d4613768f3f1b51c6195852560446103e39b57b2deb8ac575d8c8ecaa918, 6ef5ee949cca9b7903cff5ede201bea5d6e6bc8d341c45e91ea060aeac905a81'::text,
      '1ed9fb22ef01068ba686e2c67c6aff13'::text) THEN
    RAISE EXCEPTION
      'Staging differs from the exact audited Jan-May population (rows %, openings %, transactions %, groups %, DR %, CR %, hashes %, fingerprint %)',
      v_rows, v_openings, v_transactions, v_groups,
      v_debit_cents, v_credit_cents, v_hashes, v_fingerprint;
  END IF;
END
$staging_preflight$;

CREATE TEMP TABLE legacy_import_groups ON COMMIT DROP AS
SELECT staged.entry_date,
       staged.journal_group_key,
       MIN(staged.stage_sequence) AS first_stage_sequence,
       (ARRAY_AGG(staged.journal_ref ORDER BY staged.stage_sequence))[1]
         AS display_reference,
       COUNT(*)::integer AS line_count,
       COUNT(DISTINCT staged.journal_ref)::integer
         AS distinct_reference_count,
       COUNT(DISTINCT staged.particulars)::integer
         AS distinct_particular_count,
       (ARRAY_AGG(staged.particulars ORDER BY staged.stage_sequence))[1]
         AS first_particular,
       SUM(staged.debit_cents)::bigint AS debit_cents,
       SUM(staged.credit_cents)::bigint AS credit_cents,
       COUNT(DISTINCT staged.account_code)::integer AS distinct_account_count,
       BOOL_OR(staged.account_code = 'CR_SALES') AS has_cr_sales,
       BOOL_OR(staged.account_code = 'CASH_SALES') AS has_cash_sales,
       BOOL_OR(staged.account_code = 'CH_REV1') AS has_ch_rev1,
       BOOL_OR(staged.account_code = 'CH_REV2') AS has_ch_rev2,
       BOOL_OR(staged.account_code = 'BANK_PBB') AS has_bank_pbb,
       BOOL_OR(staged.account_code = 'BANK_ABB') AS has_bank_abb,
       BOOL_OR(staged.account_code = 'CL_ABB') AS has_cl_abb,
       BOOL_OR(
         staged.account_code ~ '^CR_'
         AND staged.account_code <> 'CR_SALES'
       ) AS has_trade_creditor,
       BOOL_OR(staged.account_code ~ '^(PU_|PM(_|$))')
         AS has_purchase_account,
       BOOL_OR(staged.account_code = 'MBDRS') AS has_director_salary,
       BOOL_OR(staged.account_code = 'ACD_SAL')
         AS has_director_salary_payable,
       BOOL_OR(staged.account_code = 'ACW_SAL')
         AS has_staff_salary_payable,
       BOOL_OR(staged.account_code = 'ACW_EPF') AS has_staff_epf_payable
  FROM import_legacy_rows staged
 WHERE staged.record_kind = 'transaction'
 GROUP BY staged.entry_date, staged.journal_group_key;

ALTER TABLE legacy_import_groups
  ADD PRIMARY KEY (journal_group_key);

DO $group_shape$
BEGIN
  IF (SELECT COUNT(*) FROM legacy_import_groups) <> 3863
     OR EXISTS (
       SELECT 1
         FROM legacy_import_groups
        WHERE line_count < 2
           OR debit_cents IS DISTINCT FROM credit_cents
           OR first_particular IS NULL
           OR first_particular = ''
           OR distinct_particular_count < 1
           OR LENGTH(journal_group_key) > 255
     ) THEN
    RAISE EXCEPTION 'A staged legacy group is missing, unbalanced, or unsuitable for deterministic presentation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM legacy_import_groups
     WHERE distinct_reference_count <> 1
       AND journal_group_key <> '2026-05-26|SPECIAL-015347-CHARLES-C'
  ) OR NOT EXISTS (
    SELECT 1
      FROM legacy_import_groups
     WHERE journal_group_key = '2026-05-26|SPECIAL-015347-CHARLES-C'
       AND entry_date = DATE '2026-05-26'
       AND display_reference = '15347'
       AND distinct_reference_count = 2
       AND line_count = 4
       AND has_cr_sales
       AND has_bank_pbb
  ) THEN
    RAISE EXCEPTION 'The sole approved mixed-reference journal (015347) changed shape';
  END IF;
END
$group_shape$;

-- Candidate rules combine the exact legacy reference family with its required
-- account shape. Prefix text by itself never determines a type.
CREATE TEMP TABLE legacy_import_type_candidates ON COMMIT DROP AS
SELECT journal_group_key, 'S'::varchar(10) AS legacy_entry_type
  FROM legacy_import_groups
 WHERE (
        display_reference ~ '^[0-9]+$'
        AND (has_cr_sales <> has_cash_sales)
        AND NOT has_trade_creditor
        AND NOT has_purchase_account
       )
    OR (
        display_reference ~ '^F[0-9]+$'
        AND has_cash_sales
        AND has_ch_rev1
        AND NOT has_cr_sales
        AND NOT has_trade_creditor
        AND NOT has_purchase_account
       )
UNION ALL
SELECT journal_group_key, 'PUR'::varchar(10)
  FROM legacy_import_groups
 WHERE (
        display_reference ~ '^[0-9]+$'
        OR display_reference ~ '^IV[-_0-9]+$'
        OR display_reference ~ '^IN[0-9]+$'
        OR display_reference ~ '^CV[0-9]+$'
        OR display_reference ~ '^I[0-9]+$'
       )
   AND has_trade_creditor
   AND has_purchase_account
   AND NOT has_cr_sales
   AND NOT has_cash_sales
UNION ALL
SELECT journal_group_key, 'B'::varchar(10)
  FROM legacy_import_groups
 WHERE display_reference ~ '^PBE[0-9]+/[0-9]{2}$'
   AND has_bank_pbb
   AND NOT has_cr_sales
   AND NOT has_cash_sales
UNION ALL
SELECT journal_group_key, 'C'::varchar(10)
  FROM legacy_import_groups
 WHERE display_reference ~ '^PV[0-9]+/[0-9]{2}$'
   AND has_bank_pbb
   AND NOT has_cr_sales
   AND NOT has_cash_sales
UNION ALL
SELECT journal_group_key, 'RV'::varchar(10)
  FROM legacy_import_groups
 WHERE display_reference ~ '^RV[0-9]+/[0-9]{2}$'
   AND has_bank_pbb
   AND NOT has_cr_sales
   AND NOT has_cash_sales
UNION ALL
SELECT journal_group_key, 'REC'::varchar(10)
  FROM legacy_import_groups
 WHERE (
        display_reference ~ '^C[0-9]+(-[0-9]+)?$'
        AND (has_ch_rev1 <> has_ch_rev2)
        AND NOT has_bank_pbb
       )
    OR (
        display_reference ~ '^(TF|TT|TR|T|PBB|PIB|MBB|MIB|TS|CIMBI|RHB|ALB|TJ|HLB|TTT|TE|TJE|MBBI)'
        AND has_bank_pbb
        AND NOT has_cr_sales
        AND NOT has_cash_sales
       )
    OR (
        display_reference ~ '^T[0-9]{7}$'
        AND has_trade_creditor
        AND has_purchase_account
        AND NOT has_bank_pbb
        AND NOT has_cr_sales
        AND NOT has_cash_sales
       )
UNION ALL
SELECT journal_group_key, 'J'::varchar(10)
  FROM legacy_import_groups
 WHERE (
        display_reference ~ '^JV26/[0-9]{2}/[0-9]{2}$'
        AND distinct_account_count >= 2
       )
    OR (
        display_reference ~ '^JVA26[0-9]{2}/[0-9]{2}$'
        AND has_bank_abb
        AND has_cl_abb
        AND distinct_account_count = 2
       )
UNION ALL
SELECT journal_group_key, 'JVDR'::varchar(10)
  FROM legacy_import_groups
 WHERE display_reference ~ '^JVDR/[0-9]{2}/26$'
   AND has_director_salary
   AND has_director_salary_payable
   AND distinct_account_count = 9
UNION ALL
SELECT journal_group_key, 'JVSL'::varchar(10)
  FROM legacy_import_groups
 WHERE display_reference ~ '^JVSL/[0-9]{2}/26$'
   AND has_staff_salary_payable
   AND has_staff_epf_payable
   AND distinct_account_count >= 40;

CREATE INDEX ON legacy_import_type_candidates (journal_group_key);

DO $classification_preflight$
BEGIN
  IF EXISTS (
    SELECT groups.journal_group_key,
           COUNT(candidates.legacy_entry_type) AS candidate_count
      FROM legacy_import_groups groups
      LEFT JOIN legacy_import_type_candidates candidates USING (journal_group_key)
     GROUP BY groups.journal_group_key
    HAVING COUNT(candidates.legacy_entry_type) <> 1
  ) THEN
    RAISE EXCEPTION 'At least one legacy journal has zero or multiple semantic type candidates';
  END IF;

  IF EXISTS (
    WITH expected(legacy_entry_type, expected_count) AS (
      VALUES
        ('S'::varchar, 2121::bigint),
        ('PUR'::varchar, 83::bigint),
        ('B'::varchar, 383::bigint),
        ('C'::varchar, 45::bigint),
        ('RV'::varchar, 410::bigint),
        ('REC'::varchar, 758::bigint),
        ('J'::varchar, 53::bigint),
        ('JVDR'::varchar, 5::bigint),
        ('JVSL'::varchar, 5::bigint)
    ), actual AS (
      SELECT legacy_entry_type, COUNT(*) AS actual_count
        FROM legacy_import_type_candidates
       GROUP BY legacy_entry_type
    )
    SELECT 1
      FROM expected
      FULL JOIN actual USING (legacy_entry_type)
     WHERE expected.expected_count IS DISTINCT FROM actual.actual_count
  ) OR (SELECT COUNT(*) FROM legacy_import_type_candidates) <> 3863 THEN
    RAISE EXCEPTION 'Legacy semantic type counts differ from the audited mapping';
  END IF;
END
$classification_preflight$;

CREATE TEMP TABLE legacy_import_expected_headers ON COMMIT DROP AS
WITH numbered AS (
  SELECT groups.*,
         ROW_NUMBER() OVER (
           PARTITION BY groups.entry_date
           ORDER BY groups.first_stage_sequence, groups.journal_group_key
         ) AS day_sequence
    FROM legacy_import_groups groups
)
SELECT numbered.journal_group_key,
       numbered.entry_date,
       FORMAT(
         'IMP-%s-%s',
         TO_CHAR(numbered.entry_date, 'YYYYMMDD'),
         LPAD(numbered.day_sequence::text, 4, '0')
       )::varchar(50) AS reference_no,
       numbered.display_reference,
       (numbered.debit_cents::numeric / 100) AS total_debit,
       (numbered.credit_cents::numeric / 100) AS total_credit,
       candidates.legacy_entry_type,
       ('Legacy import ' || numbered.display_reference)::text
         AS original_description,
       CASE
         WHEN numbered.distinct_particular_count = 1
           THEN numbered.first_particular
         ELSE FORMAT(
           '%s (+%s more particulars)',
           numbered.first_particular,
           numbered.distinct_particular_count - 1
         )
       END::text AS desired_description
  FROM numbered
  JOIN legacy_import_type_candidates candidates USING (journal_group_key);

ALTER TABLE legacy_import_expected_headers
  ADD PRIMARY KEY (journal_group_key),
  ADD UNIQUE (reference_no);

CREATE TEMP TABLE legacy_import_expected_lines ON COMMIT DROP AS
SELECT headers.journal_group_key,
       headers.reference_no AS header_reference_no,
       ROW_NUMBER() OVER (
         PARTITION BY staged.journal_group_key
         ORDER BY staged.stage_sequence
       )::integer AS line_number,
       staged.account_code,
       (staged.debit_cents::numeric / 100) AS debit_amount,
       (staged.credit_cents::numeric / 100) AS credit_amount,
       headers.reference_no::varchar(100) AS original_line_reference,
       staged.line_display_reference::varchar(100)
         AS desired_line_reference,
       staged.particulars,
       staged.cheque_reference,
       ROW_NUMBER() OVER (
         PARTITION BY staged.journal_group_key, staged.account_code
         ORDER BY staged.stage_sequence
       )::integer AS display_order,
       staged.line_display_reference AS display_reference,
       staged.stage_sequence
  FROM import_legacy_rows staged
  JOIN legacy_import_expected_headers headers
    ON headers.journal_group_key = staged.journal_group_key
   AND headers.entry_date = staged.entry_date
 WHERE staged.record_kind = 'transaction';

ALTER TABLE legacy_import_expected_lines
  ADD PRIMARY KEY (journal_group_key, line_number);

-- Pin every imported accounting field and every unchanged line presentation
-- field before allowing metadata updates.
DO $journal_preflight$
DECLARE
  v_old_headers bigint;
  v_new_headers bigint;
  v_old_lines bigint;
  v_new_lines bigint;
BEGIN
  IF (SELECT COUNT(*) FROM legacy_import_expected_headers) <> 3863
     OR (SELECT COUNT(*) FROM legacy_import_expected_lines) <> 10068 THEN
    RAISE EXCEPTION 'Expected journal projection changed shape';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM legacy_import_expected_headers expected
      LEFT JOIN journal_entries actual
        ON actual.reference_no = expected.reference_no
     WHERE actual.id IS NULL
        OR actual.entry_type IS DISTINCT FROM 'IMP'
        OR actual.entry_date IS DISTINCT FROM expected.entry_date
        OR actual.total_debit IS DISTINCT FROM expected.total_debit
        OR actual.total_credit IS DISTINCT FROM expected.total_credit
        OR actual.status IS DISTINCT FROM 'posted'
        OR actual.display_reference IS DISTINCT FROM expected.display_reference
        OR actual.cheque_no IS NOT NULL
        OR actual.posting_sequence IS NOT NULL
        OR actual.created_by IS DISTINCT FROM 'legacy-import'
        OR actual.posted_by IS DISTINCT FROM 'legacy-import'
        OR actual.posted_at IS NULL
  ) OR EXISTS (
    SELECT 1
      FROM journal_entries actual
      LEFT JOIN legacy_import_expected_headers expected
        ON expected.reference_no = actual.reference_no
     WHERE actual.entry_type = 'IMP'
       AND expected.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'IMP journal headers differ from the exact imported accounting projection';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM legacy_import_expected_lines expected
      JOIN journal_entries header
        ON header.reference_no = expected.header_reference_no
      LEFT JOIN journal_entry_lines actual
        ON actual.journal_entry_id = header.id
       AND actual.line_number = expected.line_number
     WHERE actual.id IS NULL
        OR actual.account_code IS DISTINCT FROM expected.account_code
        OR actual.debit_amount IS DISTINCT FROM expected.debit_amount
        OR actual.credit_amount IS DISTINCT FROM expected.credit_amount
        OR actual.particulars IS DISTINCT FROM expected.particulars
        OR actual.cheque_reference IS DISTINCT FROM expected.cheque_reference
        OR actual.display_order IS DISTINCT FROM expected.display_order
        OR actual.display_reference IS DISTINCT FROM expected.display_reference
  ) OR EXISTS (
    SELECT 1
      FROM journal_entries header
      JOIN journal_entry_lines actual ON actual.journal_entry_id = header.id
      LEFT JOIN legacy_import_expected_lines expected
        ON expected.header_reference_no = header.reference_no
       AND expected.line_number = actual.line_number
     WHERE header.entry_type = 'IMP'
       AND expected.line_number IS NULL
  ) THEN
    RAISE EXCEPTION 'IMP journal lines differ from the exact staged accounting projection';
  END IF;

  SELECT COUNT(*) FILTER (
           WHERE actual.legacy_entry_type IS NULL
             AND actual.source_type IS NULL
             AND actual.source_id IS NULL
             AND actual.description IS NOT DISTINCT FROM expected.original_description
             AND actual.updated_by IS NOT DISTINCT FROM 'legacy-import'
         ),
         COUNT(*) FILTER (
           WHERE actual.legacy_entry_type IS NOT DISTINCT FROM expected.legacy_entry_type
             AND actual.source_type = 'legacy_import'
             AND actual.source_id IS NOT DISTINCT FROM expected.journal_group_key
             AND actual.description IS NOT DISTINCT FROM expected.desired_description
             AND actual.updated_by IS NOT DISTINCT FROM 'legacy_journal_presentation'
         )
    INTO v_old_headers, v_new_headers
    FROM legacy_import_expected_headers expected
    JOIN journal_entries actual
      ON actual.reference_no = expected.reference_no;

  SELECT COUNT(*) FILTER (
           WHERE actual.reference IS NOT DISTINCT FROM expected.original_line_reference
         ),
         COUNT(*) FILTER (
           WHERE actual.reference IS NOT DISTINCT FROM expected.desired_line_reference
         )
    INTO v_old_lines, v_new_lines
    FROM legacy_import_expected_lines expected
    JOIN journal_entries header
      ON header.reference_no = expected.header_reference_no
    JOIN journal_entry_lines actual
      ON actual.journal_entry_id = header.id
     AND actual.line_number = expected.line_number;

  IF NOT (
    (v_old_headers = 3863 AND v_new_headers = 0
      AND v_old_lines = 10068 AND v_new_lines = 0)
    OR
    (v_old_headers = 0 AND v_new_headers = 3863
      AND v_old_lines = 0 AND v_new_lines = 10068)
  ) THEN
    RAISE EXCEPTION
      'Legacy presentation is in a mixed state (old/new headers %/%, old/new lines %/%)',
      v_old_headers, v_new_headers, v_old_lines, v_new_lines;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries actual
      LEFT JOIN legacy_import_expected_headers expected
        ON expected.reference_no = actual.reference_no
     WHERE actual.source_type = 'legacy_import'
       AND expected.reference_no IS NULL
  ) THEN
    RAISE EXCEPTION 'An unrelated journal already uses the reserved legacy_import source type';
  END IF;
END
$journal_preflight$;

CREATE TEMP TABLE legacy_import_header_snapshot ON COMMIT DROP AS
SELECT actual.id,
       actual.reference_no,
       actual.entry_type,
       actual.entry_date,
       actual.total_debit,
       actual.total_credit,
       actual.status,
       actual.cheque_no,
       actual.display_reference,
       actual.posting_sequence,
       actual.created_at,
       actual.created_by,
       actual.posted_at,
       actual.posted_by
  FROM journal_entries actual
  JOIN legacy_import_expected_headers expected
    ON expected.reference_no = actual.reference_no;

ALTER TABLE legacy_import_header_snapshot ADD PRIMARY KEY (id);

CREATE TEMP TABLE legacy_import_line_snapshot ON COMMIT DROP AS
SELECT lines.id,
       lines.journal_entry_id,
       lines.line_number,
       lines.account_code,
       lines.debit_amount,
       lines.credit_amount,
       lines.particulars,
       lines.cheque_reference,
       lines.display_order,
       lines.display_reference,
       lines.created_at
  FROM journal_entries headers
  JOIN legacy_import_expected_headers expected
    ON expected.reference_no = headers.reference_no
  JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id;

ALTER TABLE legacy_import_line_snapshot ADD PRIMARY KEY (id);

UPDATE journal_entries actual
   SET legacy_entry_type = expected.legacy_entry_type,
       source_type = 'legacy_import',
       source_id = expected.journal_group_key,
       description = expected.desired_description,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = 'legacy_journal_presentation'
  FROM legacy_import_expected_headers expected
 WHERE actual.reference_no = expected.reference_no
   AND (
     actual.legacy_entry_type IS DISTINCT FROM expected.legacy_entry_type
     OR actual.source_type IS DISTINCT FROM 'legacy_import'
     OR actual.source_id IS DISTINCT FROM expected.journal_group_key
     OR actual.description IS DISTINCT FROM expected.desired_description
     OR actual.updated_by IS DISTINCT FROM 'legacy_journal_presentation'
   );

UPDATE journal_entry_lines actual
   SET reference = expected.desired_line_reference
  FROM journal_entries header
  JOIN legacy_import_expected_lines expected
    ON expected.header_reference_no = header.reference_no
 WHERE actual.journal_entry_id = header.id
   AND actual.line_number = expected.line_number
   AND actual.reference IS DISTINCT FROM expected.desired_line_reference;

DO $postconditions$
DECLARE
  v_special_line_count bigint;
  v_special_references text[];
BEGIN
  IF EXISTS (
    SELECT 1
      FROM legacy_import_expected_headers expected
      LEFT JOIN journal_entries actual
        ON actual.reference_no = expected.reference_no
     WHERE actual.id IS NULL
        OR actual.entry_type IS DISTINCT FROM 'IMP'
        OR actual.legacy_entry_type IS DISTINCT FROM expected.legacy_entry_type
        OR actual.source_type IS DISTINCT FROM 'legacy_import'
        OR actual.source_id IS DISTINCT FROM expected.journal_group_key
        OR actual.description IS DISTINCT FROM expected.desired_description
  ) OR (SELECT COUNT(*) FROM journal_entries WHERE entry_type = 'IMP') <> 3863 THEN
    RAISE EXCEPTION 'Legacy journal header presentation/provenance postcondition failed';
  END IF;

  IF EXISTS (
    WITH expected(legacy_entry_type, expected_count) AS (
      VALUES
        ('S'::varchar, 2121::bigint),
        ('PUR'::varchar, 83::bigint),
        ('B'::varchar, 383::bigint),
        ('C'::varchar, 45::bigint),
        ('RV'::varchar, 410::bigint),
        ('REC'::varchar, 758::bigint),
        ('J'::varchar, 53::bigint),
        ('JVDR'::varchar, 5::bigint),
        ('JVSL'::varchar, 5::bigint)
    ), actual AS (
      SELECT legacy_entry_type, COUNT(*) AS actual_count
        FROM journal_entries
       WHERE entry_type = 'IMP'
       GROUP BY legacy_entry_type
    )
    SELECT 1
      FROM expected
      FULL JOIN actual USING (legacy_entry_type)
     WHERE expected.expected_count IS DISTINCT FROM actual.actual_count
  ) THEN
    RAISE EXCEPTION 'Final semantic legacy type counts differ from the audited mapping';
  END IF;

  IF (SELECT COUNT(*) FROM journal_entries WHERE source_type = 'legacy_import') <> 3863
     OR (SELECT COUNT(DISTINCT source_id)
           FROM journal_entries
          WHERE source_type = 'legacy_import') <> 3863
     OR EXISTS (
       SELECT source_id
         FROM journal_entries
        WHERE source_type = 'legacy_import'
        GROUP BY source_id
       HAVING COUNT(*) <> 1
     ) THEN
    RAISE EXCEPTION 'Legacy import source links are missing or non-unique';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM legacy_import_expected_lines expected
      JOIN journal_entries header
        ON header.reference_no = expected.header_reference_no
      LEFT JOIN journal_entry_lines actual
        ON actual.journal_entry_id = header.id
       AND actual.line_number = expected.line_number
     WHERE actual.id IS NULL
        OR actual.reference IS DISTINCT FROM expected.desired_line_reference
        OR actual.display_reference IS DISTINCT FROM expected.display_reference
  ) OR (SELECT COUNT(*)
          FROM journal_entries header
          JOIN journal_entry_lines lines ON lines.journal_entry_id = header.id
         WHERE header.entry_type = 'IMP') <> 10068 THEN
    RAISE EXCEPTION 'Legacy line references or line population postcondition failed';
  END IF;

  SELECT COUNT(*),
         ARRAY_AGG(
           DISTINCT lines.reference::text ORDER BY lines.reference::text
         )
    INTO v_special_line_count, v_special_references
    FROM journal_entries header
    JOIN journal_entry_lines lines ON lines.journal_entry_id = header.id
   WHERE header.source_type = 'legacy_import'
     AND header.source_id = '2026-05-26|SPECIAL-015347-CHARLES-C';

  IF (v_special_line_count, v_special_references) IS DISTINCT FROM
     (4::bigint, ARRAY['15347', 'T260526']::text[])
     OR EXISTS (
       SELECT 1
         FROM journal_entries header
         JOIN journal_entry_lines lines ON lines.journal_entry_id = header.id
        WHERE header.source_type = 'legacy_import'
          AND header.source_id = '2026-05-26|SPECIAL-015347-CHARLES-C'
          AND lines.reference IS DISTINCT FROM lines.display_reference
     ) THEN
    RAISE EXCEPTION 'Special invoice 015347 did not retain its mixed 15347/T260526 line references';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM legacy_import_header_snapshot before
      LEFT JOIN journal_entries after USING (id)
     WHERE after.id IS NULL
        OR after.reference_no IS DISTINCT FROM before.reference_no
        OR after.entry_type IS DISTINCT FROM before.entry_type
        OR after.entry_date IS DISTINCT FROM before.entry_date
        OR after.total_debit IS DISTINCT FROM before.total_debit
        OR after.total_credit IS DISTINCT FROM before.total_credit
        OR after.status IS DISTINCT FROM before.status
        OR after.cheque_no IS DISTINCT FROM before.cheque_no
        OR after.display_reference IS DISTINCT FROM before.display_reference
        OR after.posting_sequence IS DISTINCT FROM before.posting_sequence
        OR after.created_at IS DISTINCT FROM before.created_at
        OR after.created_by IS DISTINCT FROM before.created_by
        OR after.posted_at IS DISTINCT FROM before.posted_at
        OR after.posted_by IS DISTINCT FROM before.posted_by
  ) THEN
    RAISE EXCEPTION 'An imported header accounting/identity field changed unexpectedly';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM legacy_import_line_snapshot before
      LEFT JOIN journal_entry_lines after USING (id)
     WHERE after.id IS NULL
        OR after.journal_entry_id IS DISTINCT FROM before.journal_entry_id
        OR after.line_number IS DISTINCT FROM before.line_number
        OR after.account_code IS DISTINCT FROM before.account_code
        OR after.debit_amount IS DISTINCT FROM before.debit_amount
        OR after.credit_amount IS DISTINCT FROM before.credit_amount
        OR after.particulars IS DISTINCT FROM before.particulars
        OR after.cheque_reference IS DISTINCT FROM before.cheque_reference
        OR after.display_order IS DISTINCT FROM before.display_order
        OR after.display_reference IS DISTINCT FROM before.display_reference
        OR after.created_at IS DISTINCT FROM before.created_at
  ) THEN
    RAISE EXCEPTION 'An imported line accounting/source field changed unexpectedly';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries header
      JOIN journal_entry_lines lines ON lines.journal_entry_id = header.id
     WHERE header.entry_type = 'IMP'
     GROUP BY header.id, header.total_debit, header.total_credit
    HAVING COUNT(*) < 2
        OR SUM(lines.debit_amount) IS DISTINCT FROM header.total_debit
        OR SUM(lines.credit_amount) IS DISTINCT FROM header.total_credit
        OR SUM(lines.debit_amount) IS DISTINCT FROM SUM(lines.credit_amount)
  ) OR (
    SELECT (COUNT(DISTINCT header.id), COUNT(lines.id),
            SUM(lines.debit_amount), SUM(lines.credit_amount))
      FROM journal_entries header
      JOIN journal_entry_lines lines ON lines.journal_entry_id = header.id
     WHERE header.entry_type = 'IMP'
  ) IS DISTINCT FROM
  (3863::bigint, 10068::bigint,
   13503516.15::numeric, 13503516.15::numeric) THEN
    RAISE EXCEPTION 'Imported journal counts, amounts, or balance changed';
  END IF;
END
$postconditions$;

COMMIT;

SELECT legacy_entry_type,
       COUNT(*) AS journals
  FROM journal_entries
 WHERE entry_type = 'IMP'
 GROUP BY legacy_entry_type
 ORDER BY legacy_entry_type;

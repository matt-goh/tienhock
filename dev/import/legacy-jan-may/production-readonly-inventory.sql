-- Production state inventory for the Jan-May 2026 legacy rollout.
--
-- This script is deliberately diagnostic only. Snapshot comparison booleans
-- identify drift for human review; they do not authorize a migration.
-- Recommended invocation:
--   psql --no-psqlrc --set ON_ERROR_STOP=1 --file production-readonly-inventory.sql

\set ON_ERROR_STOP on
\pset pager off

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo '=== 1. Database identity and transaction guarantees ==='
SELECT current_database() AS database_name,
       current_user AS database_user,
       CURRENT_SETTING('server_version') AS server_version,
       INET_SERVER_ADDR()::text AS server_address,
       INET_SERVER_PORT() AS server_port,
       PG_IS_IN_RECOVERY() AS is_replica,
       CURRENT_SETTING('transaction_isolation') AS transaction_isolation,
       CURRENT_SETTING('transaction_read_only') AS transaction_read_only,
       CURRENT_TIMESTAMP AS inventory_started_at;

\echo '=== 2. Required June-refactor relations ==='
WITH required(schema_name, relation_name) AS (
  VALUES
    ('public', 'receipts'),
    ('public', 'receipt_allocations'),
    ('public', 'rv_registry'),
    ('public', 'bank_ins'),
    ('public', 'bank_in_groups'),
    ('public', 'bank_in_allocations')
)
SELECT required.schema_name,
       required.relation_name,
       TO_REGCLASS(
         FORMAT('%I.%I', required.schema_name, required.relation_name)
       ) IS NOT NULL AS relation_present
  FROM required
 ORDER BY required.schema_name, required.relation_name;

\echo '=== 3. Required June-refactor columns ==='
WITH required(schema_name, table_name, column_name) AS (
  VALUES
    ('public', 'journal_entries', 'display_reference'),
    ('public', 'journal_entries', 'posting_sequence'),
    ('public', 'journal_entries', 'source_type'),
    ('public', 'journal_entries', 'source_id'),
    ('public', 'journal_entries', 'legacy_entry_type'),
    ('public', 'journal_entry_lines', 'cheque_reference'),
    ('public', 'journal_entry_lines', 'display_order'),
    ('public', 'journal_entry_lines', 'display_reference'),
    ('public', 'payments', 'is_auto_collection'),
    ('public', 'payments', 'receipt_allocation_id'),
    ('public', 'invoices', 'accounting_description')
)
SELECT required.schema_name,
       required.table_name,
       required.column_name,
       columns.column_name IS NOT NULL AS column_present
  FROM required
  LEFT JOIN information_schema.columns columns
    ON columns.table_schema = required.schema_name
   AND columns.table_name = required.table_name
   AND columns.column_name = required.column_name
 ORDER BY required.schema_name, required.table_name, required.column_name;

WITH required_relations(relation_name) AS (
  VALUES
    ('receipts'),
    ('receipt_allocations'),
    ('rv_registry'),
    ('bank_ins'),
    ('bank_in_groups'),
    ('bank_in_allocations')
),
required_columns(table_name, column_name, presentation_only) AS (
  VALUES
    ('journal_entries', 'display_reference', false),
    ('journal_entries', 'posting_sequence', false),
    ('journal_entries', 'source_type', false),
    ('journal_entries', 'source_id', false),
    ('journal_entries', 'legacy_entry_type', true),
    ('journal_entry_lines', 'cheque_reference', false),
    ('journal_entry_lines', 'display_order', false),
    ('journal_entry_lines', 'display_reference', false),
    ('payments', 'is_auto_collection', false),
    ('payments', 'receipt_allocation_id', false),
    ('invoices', 'accounting_description', false)
)
SELECT NOT EXISTS (
         SELECT 1
           FROM required_columns required
           LEFT JOIN information_schema.columns columns
             ON columns.table_schema = 'public'
            AND columns.table_name = required.table_name
            AND columns.column_name = required.column_name
           WHERE columns.column_name IS NULL
       ) AS rollout_columns_queryable,
       NOT EXISTS (
         SELECT 1
           FROM required_columns required
           LEFT JOIN information_schema.columns columns
             ON columns.table_schema = 'public'
            AND columns.table_name = required.table_name
            AND columns.column_name = required.column_name
          WHERE NOT required.presentation_only
            AND columns.column_name IS NULL
       ) AS accounting_columns_queryable,
       NOT EXISTS (
         SELECT 1
           FROM required_relations
          WHERE TO_REGCLASS(
                  FORMAT('%I.%I', 'public', relation_name)
                ) IS NULL
       )
       AND NOT EXISTS (
         SELECT 1
           FROM required_columns required
           LEFT JOIN information_schema.columns columns
             ON columns.table_schema = 'public'
            AND columns.table_name = required.table_name
            AND columns.column_name = required.column_name
          WHERE NOT required.presentation_only
            AND columns.column_name IS NULL
       ) AS june_schema_queryable
\gset

\echo '=== 4. Required indexes and catalog validity ==='
WITH required(index_name) AS (
  VALUES
    ('journal_entries_source_posted_uq'),
    ('journal_entries_source_idx'),
    ('receipts_journal_entry_uq'),
    ('bank_ins_journal_entry_uq'),
    ('payments_receipt_allocation_idx')
)
SELECT required.index_name,
       indexes.indexrelid IS NOT NULL AS index_present,
       COALESCE(indexes.indisvalid, false) AS index_valid,
       COALESCE(indexes.indisready, false) AS index_ready
  FROM required
  LEFT JOIN pg_class index_class
    ON index_class.relname = required.index_name
   AND index_class.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_index indexes ON indexes.indexrelid = index_class.oid
 ORDER BY required.index_name;

SELECT (
         SELECT COUNT(*)
           FROM pg_constraint constraints
          WHERE constraints.connamespace = 'public'::regnamespace
            AND NOT constraints.convalidated
       ) AS unvalidated_public_constraints,
       (
         SELECT COUNT(*)
           FROM pg_index indexes
           JOIN pg_class index_class ON index_class.oid = indexes.indexrelid
          WHERE index_class.relnamespace = 'public'::regnamespace
            AND NOT indexes.indisvalid
       ) AS invalid_public_indexes;

\echo '=== 4a. Optional Jan-May staging population ==='
SELECT TO_REGCLASS('public.import_legacy_rows') IS NOT NULL AS staging_present
\gset

\if :staging_present
  SELECT COUNT(*) AS staged_rows,
         COUNT(*) FILTER (WHERE record_kind = 'opening') AS opening_rows,
         COUNT(*) FILTER (WHERE record_kind = 'transaction')
           AS transaction_rows,
         COUNT(DISTINCT journal_group_key) FILTER (
           WHERE record_kind = 'transaction'
         ) AS transaction_groups,
         COALESCE(SUM(debit_cents) FILTER (
           WHERE record_kind = 'transaction'
         ), 0)::bigint AS transaction_debit_cents,
         COALESCE(SUM(credit_cents) FILTER (
           WHERE record_kind = 'transaction'
         ), 0)::bigint AS transaction_credit_cents,
         COUNT(*) FILTER (WHERE repaired) AS repaired_rows,
         COUNT(*) FILTER (WHERE source_kind = 'DERIVED') AS derived_rows,
         MIN(stage_sequence) AS minimum_sequence,
         MAX(stage_sequence) AS maximum_sequence,
         STRING_AGG(DISTINCT source_sha256, ', ' ORDER BY source_sha256)
           AS embedded_source_hashes,
         COUNT(*) = 12635
           AND COUNT(*) FILTER (WHERE record_kind = 'opening') = 2567
           AND COUNT(*) FILTER (WHERE record_kind = 'transaction') = 10068
           AND COUNT(DISTINCT journal_group_key) FILTER (
                 WHERE record_kind = 'transaction'
               ) = 3863
           AND COALESCE(SUM(debit_cents) FILTER (
                 WHERE record_kind = 'transaction'
               ), 0)::bigint = 1350351615
           AND COALESCE(SUM(credit_cents) FILTER (
                 WHERE record_kind = 'transaction'
               ), 0)::bigint = 1350351615
           AND COUNT(*) FILTER (WHERE repaired) = 4
           AND COUNT(*) FILTER (WHERE source_kind = 'DERIVED') = 2
           AND MIN(stage_sequence) = 1
           AND MAX(stage_sequence) = 12635
           AS matches_audited_staging_population,
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
             debit_cents,
             credit_cents,
             running_balance_cents,
             repaired,
             special_case
           )::text,
           E'\n' ORDER BY stage_sequence
         ), '')) AS staging_semantic_fingerprint_md5
    FROM import_legacy_rows;
\else
  \echo 'Staging table is absent (expected before its rollout migration).'
\endif

\if :june_schema_queryable
  \echo '=== 5. June refactor data-state indicators (review, do not infer approval) ==='
  WITH june_registry AS (
    SELECT registry.*,
           bank_ins.id AS bank_in_id
      FROM rv_registry registry
      LEFT JOIN bank_ins ON bank_ins.rv_registry_id = registry.id
     WHERE registry.rv_year = 2026
       AND registry.rv_month = 6
  )
  SELECT COUNT(*) AS registry_rows,
         COUNT(DISTINCT rv_seq) AS distinct_sequences,
         MIN(rv_seq) AS minimum_sequence,
         MAX(rv_seq) AS maximum_sequence,
         COUNT(*) FILTER (WHERE source_type = 'bank_in') AS bank_in_registry_rows,
         COUNT(*) FILTER (
           WHERE source_type IN ('import', 'manual_journal')
         ) AS manual_or_import_reservations,
         COUNT(*) FILTER (WHERE bank_in_id IS NOT NULL) AS linked_bank_ins,
         COUNT(*) = 83
           AND COUNT(DISTINCT rv_seq) = 83
           AND MIN(rv_seq) = 1
           AND MAX(rv_seq) = 83
           AND COUNT(*) FILTER (WHERE source_type = 'bank_in') = 78
           AND COUNT(*) FILTER (
                 WHERE source_type IN ('import', 'manual_journal')
               ) = 5
           AND COUNT(*) FILTER (WHERE bank_in_id IS NOT NULL) = 78
           AS matches_audited_20260713_snapshot
    FROM june_registry;

  SELECT COUNT(*) AS bank_in_rows,
         COUNT(*) FILTER (WHERE bank_ins.status = 'posted') AS posted_rows,
         COUNT(*) FILTER (
           WHERE bank_ins.status = 'posted'
             AND journals.id IS NOT NULL
             AND journals.status = 'posted'
             AND journals.source_type = 'bank_in'
             AND journals.source_id = bank_ins.id::text
         ) AS healthy_posted_source_journals,
         COALESCE(SUM(ROUND(bank_ins.total_amount * 100)), 0)::bigint
           AS total_cents,
         COUNT(*) = 78
           AND COUNT(*) FILTER (WHERE bank_ins.status = 'posted') = 78
           AND COUNT(*) FILTER (
                 WHERE bank_ins.status = 'posted'
                   AND journals.id IS NOT NULL
                   AND journals.status = 'posted'
                   AND journals.source_type = 'bank_in'
                   AND journals.source_id = bank_ins.id::text
               ) = 78
           AS matches_audited_20260713_snapshot
    FROM bank_ins
    LEFT JOIN journal_entries journals
      ON journals.id = bank_ins.journal_entry_id;

  SELECT COUNT(*) AS receipt_rows,
         COUNT(*) FILTER (WHERE status = 'posted') AS posted_rows,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_rows,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_rows,
         COALESCE(SUM(ROUND(total_amount * 100)), 0)::bigint AS total_cents,
         COUNT(*) = 183 AS matches_audited_20260713_row_count
    FROM receipts;

  SELECT COUNT(*) AS payment_5229_rows,
         COUNT(allocations.id) AS linked_allocation_rows,
         COUNT(DISTINCT receipts.id) AS linked_receipt_rows,
         COUNT(DISTINCT journals.id) AS linked_posted_journal_rows,
         COALESCE(SUM(ROUND(allocations.amount * 100)), 0)::bigint
           AS allocation_cents,
         COUNT(*) = 1
           AND COUNT(allocations.id) = 1
           AND COUNT(DISTINCT receipts.id) = 1
           AND COUNT(DISTINCT journals.id) = 1
           AND COALESCE(SUM(ROUND(allocations.amount * 100)), 0)::bigint = 288000
           AS matches_audited_015361_case
    FROM payments
    LEFT JOIN receipt_allocations allocations
      ON allocations.id = payments.receipt_allocation_id
     AND allocations.legacy_payment_id = payments.payment_id
    LEFT JOIN receipts ON receipts.id = allocations.receipt_id
    LEFT JOIN journal_entries journals
      ON journals.id = receipts.journal_entry_id
     AND journals.status = 'posted'
     AND journals.source_type = 'receipt'
     AND journals.source_id = receipts.id::text
   WHERE payments.payment_id = 5229
     AND payments.invoice_id = '015361';

  SELECT COUNT(*) AS pbb678670_receipt_rows,
         COUNT(*) FILTER (WHERE status = 'posted') AS posted_rows,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_rows,
         COALESCE(SUM(ROUND(total_amount * 100))
           FILTER (WHERE status = 'posted'), 0)::bigint AS posted_cents,
         COUNT(*) = 5
           AND COUNT(*) FILTER (WHERE status = 'posted') = 4
           AND COUNT(*) FILTER (WHERE status = 'cancelled') = 1
           AND COALESCE(SUM(ROUND(total_amount * 100))
                 FILTER (WHERE status = 'posted'), 0)::bigint = 6254340
           AS matches_audited_split_state
    FROM receipts
   WHERE display_reference = 'PBB678670'
      OR display_reference LIKE 'PBB678670-%';
\else
  \echo 'June data-state queries skipped: one or more required relations/columns are absent.'
\endif

\echo '=== 6. June indicators available from core accounting tables ==='
SELECT COUNT(*) AS debtor_child_anchor_rows,
       COALESCE(SUM(ROUND(anchors.amount * 100)), 0)::bigint AS net_cents,
       COUNT(*) = 1566
         AND COALESCE(SUM(ROUND(anchors.amount * 100)), 0)::bigint = 50769772
         AS matches_audited_20260713_snapshot
  FROM account_opening_balances anchors
  JOIN account_codes accounts ON accounts.code = anchors.account_code
 WHERE anchors.as_of_date = DATE '2026-06-01'
   AND accounts.parent_code = 'DEBTOR';

\if :accounting_columns_queryable
  SELECT COUNT(*) AS posted_source_owned_tr_lines,
         COUNT(*) = 0 AS matches_audited_20260713_snapshot
    FROM journal_entry_lines lines
    JOIN journal_entries journals ON journals.id = lines.journal_entry_id
   WHERE journals.status = 'posted'
     AND journals.source_type IN (
           'invoice', 'payment', 'receipt', 'adjustment', 'jp_adjustment'
         )
     AND lines.account_code = 'TR';

  SELECT COUNT(*) AS pce_journals,
         COUNT(*) FILTER (
           WHERE display_reference ~ '^PV00[1-8]/06$'
         ) AS pv_display_references,
         STRING_AGG(
           reference_no || '=>' || COALESCE(display_reference, '<null>'),
           ', ' ORDER BY reference_no
         ) AS reference_mapping,
         COUNT(*) = 8
           AND COUNT(*) FILTER (
                 WHERE display_reference ~ '^PV00[1-8]/06$'
               ) = 8 AS matches_audited_reference_state
    FROM journal_entries
   WHERE entry_type = 'C'
     AND entry_date BETWEEN DATE '2026-06-01' AND DATE '2026-06-30'
     AND reference_no ~ '^PCE00[1-8]/06$';
\else
  \echo 'Source-owned TR and visible PV-reference checks skipped: required columns are absent.'
\endif

\echo '=== 7. Jan-May REC census ==='
SELECT status,
       COUNT(*) AS journals,
       COALESCE(SUM(ROUND(total_debit * 100)), 0)::bigint AS debit_cents,
       COALESCE(SUM(ROUND(total_credit * 100)), 0)::bigint AS credit_cents
  FROM journal_entries
 WHERE entry_type = 'REC'
   AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
 GROUP BY status
 ORDER BY status;

\if :accounting_columns_queryable
  SELECT COUNT(*) FILTER (WHERE journals.source_type = 'payment')
           AS payment_source_rows,
         COUNT(*) FILTER (
           WHERE journals.source_type = 'payment'
             AND payments.payment_id IS NOT NULL
         ) AS linked_payment_owner_rows,
         COUNT(*) FILTER (
           WHERE journals.source_type IS DISTINCT FROM 'payment'
              OR payments.payment_id IS NULL
         ) AS ownership_exception_rows
    FROM journal_entries journals
    LEFT JOIN payments
      ON payments.payment_id::text = journals.source_id
     AND payments.journal_entry_id = journals.id
   WHERE journals.entry_type = 'REC'
     AND journals.status = 'posted'
     AND journals.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31';

  -- This formula intentionally matches the destructive conflict migration
  -- byte-for-byte. Production must return the pinned value before that
  -- migration is allowed to cancel the superseded REC population.
  SELECT 'conflict_migration_rec_v1' AS fingerprint_formula,
         COUNT(*) AS posted_rec_rows,
         COALESCE(SUM(journals.total_debit), 0)::numeric(14,2)
           AS posted_total_debit,
         MD5(STRING_AGG(
           CONCAT_WS('|', journals.id, journals.reference_no,
                     journals.entry_date, journals.total_debit,
                     journals.total_credit, journals.source_type,
                     journals.source_id, payments.payment_id),
           E'\n' ORDER BY journals.id
         )) AS fingerprint_md5,
         COUNT(*) = 2074
           AND COALESCE(SUM(journals.total_debit), 0) = 3259534.63
           AND MD5(STRING_AGG(
                 CONCAT_WS('|', journals.id, journals.reference_no,
                           journals.entry_date, journals.total_debit,
                           journals.total_credit, journals.source_type,
                           journals.source_id, payments.payment_id),
                 E'\n' ORDER BY journals.id
               )) = 'fdd1ef35cdcdf153ea826ce60f7376bb'
           AS matches_conflict_migration_pin
    FROM journal_entries journals
    JOIN payments
      ON payments.payment_id::text = journals.source_id
     AND payments.journal_entry_id = journals.id
   WHERE journals.entry_type = 'REC'
     AND journals.status = 'posted'
     AND journals.source_type = 'payment'
     AND journals.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31';

  -- REC header/source fingerprint v1. This is a deterministic drift detector,
  -- not a security signature. The ordered JSON array fields are:
  -- journal id, date, internal ref, visible ref, DR cents, CR cents,
  -- source type/id, linked payment id/status/amount cents/journal id.
  SELECT 'rec_header_source_v1' AS fingerprint_formula,
         COUNT(*) AS posted_rec_rows,
         COALESCE(SUM(ROUND(journals.total_debit * 100)), 0)::bigint
           AS posted_debit_cents,
         MD5(COALESCE(STRING_AGG(
           JSONB_BUILD_ARRAY(
             journals.id,
             journals.entry_date::text,
             journals.reference_no,
             journals.display_reference,
             ROUND(journals.total_debit * 100)::bigint,
             ROUND(journals.total_credit * 100)::bigint,
             journals.source_type,
             journals.source_id,
             payments.payment_id,
             payments.status,
             ROUND(payments.amount_paid * 100)::bigint,
             payments.journal_entry_id
           )::text,
           E'\n' ORDER BY journals.id
         ), '')) AS fingerprint_md5
    FROM journal_entries journals
    LEFT JOIN payments
      ON payments.payment_id::text = journals.source_id
     AND payments.journal_entry_id = journals.id
   WHERE journals.entry_type = 'REC'
     AND journals.status = 'posted'
     AND journals.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31';

  -- REC line fingerprint v1 fields: journal id, line id/number/display order,
  -- account, DR/CR cents, reference, particulars, cheque and visible reference.
  SELECT 'rec_line_v1' AS fingerprint_formula,
         COUNT(lines.id) AS posted_rec_lines,
         MD5(COALESCE(STRING_AGG(
           JSONB_BUILD_ARRAY(
             journals.id,
             lines.id,
             lines.line_number,
             lines.display_order,
             lines.account_code,
             ROUND(lines.debit_amount * 100)::bigint,
             ROUND(lines.credit_amount * 100)::bigint,
             lines.reference,
             lines.particulars,
             lines.cheque_reference,
             lines.display_reference
           )::text,
           E'\n' ORDER BY journals.id, lines.line_number, lines.id
         ), '')) AS fingerprint_md5
    FROM journal_entries journals
    JOIN journal_entry_lines lines ON lines.journal_entry_id = journals.id
   WHERE journals.entry_type = 'REC'
     AND journals.status = 'posted'
     AND journals.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31';
\else
  \echo 'REC ownership and exact fingerprints skipped: required columns are absent.'
\endif

\echo '=== 8. Jan-May posted journal population ==='
SELECT journals.entry_type,
       journals.status,
       COUNT(DISTINCT journals.id) AS journals,
       COUNT(lines.id) AS lines,
       COALESCE(SUM(ROUND(lines.debit_amount * 100)), 0)::bigint
         AS line_debit_cents,
       COALESCE(SUM(ROUND(lines.credit_amount * 100)), 0)::bigint
         AS line_credit_cents
  FROM journal_entries journals
  LEFT JOIN journal_entry_lines lines ON lines.journal_entry_id = journals.id
 WHERE journals.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
   AND journals.entry_type IN ('REC', 'CN', 'IMP')
 GROUP BY journals.entry_type, journals.status
 ORDER BY journals.entry_type, journals.status;

SELECT entry_type,
       COUNT(*) AS posted_journals,
       COALESCE(SUM(ROUND(total_debit * 100)), 0)::bigint AS debit_cents,
       COALESCE(SUM(ROUND(total_credit * 100)), 0)::bigint AS credit_cents
  FROM journal_entries
 WHERE status = 'posted'
   AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
 GROUP BY entry_type
 ORDER BY entry_type;

\if :rollout_columns_queryable
  \echo '=== 8a. Legacy-import semantic presentation and provenance ==='
  WITH expected(legacy_entry_type, expected_count, sort_order) AS (
    VALUES
      ('S'::varchar, 2121::bigint, 1),
      ('PUR'::varchar, 83::bigint, 2),
      ('B'::varchar, 383::bigint, 3),
      ('C'::varchar, 45::bigint, 4),
      ('RV'::varchar, 410::bigint, 5),
      ('REC'::varchar, 758::bigint, 6),
      ('J'::varchar, 53::bigint, 7),
      ('JVDR'::varchar, 5::bigint, 8),
      ('JVSL'::varchar, 5::bigint, 9)
  ),
  actual AS (
    SELECT journals.legacy_entry_type,
           COUNT(*) AS actual_count
      FROM journal_entries journals
     WHERE journals.source_type = 'legacy_import'
       AND journals.status = 'posted'
     GROUP BY journals.legacy_entry_type
  )
  SELECT COALESCE(expected.legacy_entry_type, actual.legacy_entry_type)
           AS legacy_entry_type,
         expected.expected_count,
         actual.actual_count,
         expected.expected_count IS NOT DISTINCT FROM actual.actual_count
           AS matches_audited_type_count
    FROM expected
    FULL JOIN actual USING (legacy_entry_type)
   ORDER BY expected.sort_order NULLS LAST, actual.legacy_entry_type;

  SELECT COUNT(*) AS legacy_import_journals,
         COUNT(source_id) AS populated_source_links,
         COUNT(DISTINCT source_id) AS unique_source_links,
         COUNT(*) FILTER (
           WHERE entry_type = 'IMP' AND status = 'posted'
         ) AS posted_operational_imp_journals,
         COUNT(*) = 3863
           AND COUNT(source_id) = 3863
           AND COUNT(DISTINCT source_id) = 3863
           AND COUNT(*) FILTER (
                 WHERE entry_type = 'IMP' AND status = 'posted'
               ) = 3863
           AS matches_audited_unique_source_links
    FROM journal_entries
   WHERE source_type = 'legacy_import';

  WITH imported AS (
    SELECT display_reference, entry_date
      FROM journal_entries
     WHERE source_type = 'legacy_import'
  ),
  repeated AS (
    SELECT display_reference,
           COUNT(*) AS journal_count,
           ARRAY_AGG(entry_date ORDER BY entry_date) AS entry_dates
      FROM imported
     GROUP BY display_reference
    HAVING COUNT(*) > 1
  )
  SELECT (SELECT COUNT(*) FROM imported) AS legacy_import_journals,
         (SELECT COUNT(display_reference) FROM imported)
           AS populated_visible_references,
         (SELECT COUNT(DISTINCT display_reference) FROM imported)
           AS distinct_visible_references,
         (SELECT COUNT(*) FROM repeated) AS repeated_reference_values,
         (SELECT STRING_AGG(
                   display_reference || ' @ ' ||
                     ARRAY_TO_STRING(entry_dates, ', '),
                   '; ' ORDER BY display_reference
                 )
            FROM repeated) AS repeated_reference_detail,
         (SELECT COUNT(*) FROM imported) = 3863
           AND (SELECT COUNT(display_reference) FROM imported) = 3863
           AND (SELECT COUNT(DISTINCT display_reference) FROM imported) = 3862
           AND (SELECT COUNT(*) FROM repeated) = 1
           AND COALESCE((
                 SELECT journal_count = 2
                   AND entry_dates = ARRAY[
                         DATE '2026-05-07', DATE '2026-05-08'
                       ]
                   FROM repeated
                  WHERE display_reference = '34847'
               ), false)
           AS matches_audited_visible_reference_state;

  SELECT COUNT(*) AS legacy_import_journals,
         COUNT(*) FILTER (
           WHERE description LIKE 'Legacy import %'
         ) AS artificial_import_descriptions,
         COUNT(*) FILTER (
           WHERE description IS NULL OR BTRIM(description) = ''
         ) AS empty_descriptions,
         COUNT(*) = 3863
           AND COUNT(*) FILTER (
                 WHERE description LIKE 'Legacy import %'
               ) = 0
           AND COUNT(*) FILTER (
                 WHERE description IS NULL OR BTRIM(description) = ''
               ) = 0
           AS matches_source_derived_description_state
    FROM journal_entries
   WHERE source_type = 'legacy_import';

  SELECT COUNT(lines.id) AS legacy_import_lines,
         COUNT(lines.id) FILTER (
           WHERE lines.reference IS NOT DISTINCT FROM lines.display_reference
         ) AS references_matching_display_reference,
         COUNT(lines.id) FILTER (
           WHERE lines.reference IS DISTINCT FROM lines.display_reference
         ) AS reference_mismatches,
         COUNT(lines.id) = 10068
           AND COUNT(lines.id) FILTER (
                 WHERE lines.reference IS NOT DISTINCT FROM lines.display_reference
               ) = 10068
           AS matches_audited_line_reference_state
    FROM journal_entries journals
    JOIN journal_entry_lines lines ON lines.journal_entry_id = journals.id
   WHERE journals.source_type = 'legacy_import';

  SELECT COUNT(lines.id) AS special_015347_lines,
         ARRAY_AGG(
           DISTINCT lines.reference::text ORDER BY lines.reference::text
         ) AS special_015347_references,
         COUNT(lines.id) FILTER (
           WHERE lines.reference IS DISTINCT FROM lines.display_reference
         ) AS special_015347_reference_mismatches,
         COUNT(lines.id) = 4
           AND ARRAY_AGG(
                 DISTINCT lines.reference::text ORDER BY lines.reference::text
               ) = ARRAY['15347', 'T260526']::text[]
           AND COUNT(lines.id) FILTER (
                 WHERE lines.reference IS DISTINCT FROM lines.display_reference
               ) = 0
           AS matches_approved_015347_reference_state
    FROM journal_entries journals
    JOIN journal_entry_lines lines ON lines.journal_entry_id = journals.id
   WHERE journals.source_type = 'legacy_import'
     AND journals.source_id =
           '2026-05-26|SPECIAL-015347-CHARLES-C';

  -- Legacy-import accounting fingerprint v2 deliberately excludes the fields
  -- changed only for presentation/provenance (description, legacy type,
  -- source link, and line.reference). Every included accounting/identity field
  -- is unchanged from the audited import and remains hash-pinned across the
  -- presentation migration.
  SELECT 'legacy_import_accounting_v2' AS fingerprint_formula,
         COUNT(DISTINCT journals.id) AS posted_legacy_import_journals,
         COUNT(lines.id) AS posted_legacy_import_lines,
         COALESCE(SUM(ROUND(lines.debit_amount * 100)), 0)::bigint
           AS line_debit_cents,
         COALESCE(SUM(ROUND(lines.credit_amount * 100)), 0)::bigint
           AS line_credit_cents,
         MD5(COALESCE(STRING_AGG(
           JSONB_BUILD_ARRAY(
             journals.reference_no,
             journals.entry_date::text,
             journals.display_reference,
             ROUND(journals.total_debit * 100)::bigint,
             ROUND(journals.total_credit * 100)::bigint,
             lines.line_number,
             lines.display_order,
             lines.account_code,
             ROUND(lines.debit_amount * 100)::bigint,
             ROUND(lines.credit_amount * 100)::bigint,
             lines.particulars,
             lines.cheque_reference,
             lines.display_reference
           )::text,
           E'\n' ORDER BY journals.reference_no, lines.line_number, lines.id
         ), '')) AS accounting_fingerprint_v2_md5,
         COUNT(DISTINCT journals.id) = 3863
           AND COUNT(lines.id) = 10068
           AND COALESCE(SUM(ROUND(lines.debit_amount * 100)), 0)::bigint
                 = 1350351615
           AND COALESCE(SUM(ROUND(lines.credit_amount * 100)), 0)::bigint
                 = 1350351615
           AND MD5(COALESCE(STRING_AGG(
                 JSONB_BUILD_ARRAY(
                   journals.reference_no,
                   journals.entry_date::text,
                   journals.display_reference,
                   ROUND(journals.total_debit * 100)::bigint,
                   ROUND(journals.total_credit * 100)::bigint,
                   lines.line_number,
                   lines.display_order,
                   lines.account_code,
                   ROUND(lines.debit_amount * 100)::bigint,
                   ROUND(lines.credit_amount * 100)::bigint,
                   lines.particulars,
                   lines.cheque_reference,
                   lines.display_reference
                 )::text,
                 E'\n' ORDER BY journals.reference_no,
                                lines.line_number, lines.id
               ), '')) = '70cc1b6d97fc2fdaeff191c14092f531'
           AS matches_audited_accounting_fingerprint_v2
    FROM journal_entries journals
    LEFT JOIN journal_entry_lines lines ON lines.journal_entry_id = journals.id
   WHERE journals.source_type = 'legacy_import'
     AND journals.status = 'posted';
\else
  \if :accounting_columns_queryable
    \echo 'Legacy presentation checks skipped: legacy_entry_type is absent; using the pre-migration IMP accounting fallback.'
    SELECT 'legacy_import_accounting_v2_pre_migration_imp_fallback'
             AS fingerprint_formula,
           COUNT(DISTINCT journals.id) AS posted_legacy_import_journals,
           COUNT(lines.id) AS posted_legacy_import_lines,
           COALESCE(SUM(ROUND(lines.debit_amount * 100)), 0)::bigint
             AS line_debit_cents,
           COALESCE(SUM(ROUND(lines.credit_amount * 100)), 0)::bigint
             AS line_credit_cents,
           MD5(COALESCE(STRING_AGG(
             JSONB_BUILD_ARRAY(
               journals.reference_no,
               journals.entry_date::text,
               journals.display_reference,
               ROUND(journals.total_debit * 100)::bigint,
               ROUND(journals.total_credit * 100)::bigint,
               lines.line_number,
               lines.display_order,
               lines.account_code,
               ROUND(lines.debit_amount * 100)::bigint,
               ROUND(lines.credit_amount * 100)::bigint,
               lines.particulars,
               lines.cheque_reference,
               lines.display_reference
             )::text,
             E'\n' ORDER BY journals.reference_no,
                            lines.line_number, lines.id
           ), '')) AS accounting_fingerprint_v2_md5,
           COUNT(DISTINCT journals.id) = 3863
             AND COUNT(lines.id) = 10068
             AND COALESCE(SUM(ROUND(lines.debit_amount * 100)), 0)::bigint
                   = 1350351615
             AND COALESCE(SUM(ROUND(lines.credit_amount * 100)), 0)::bigint
                   = 1350351615
             AND MD5(COALESCE(STRING_AGG(
                   JSONB_BUILD_ARRAY(
                     journals.reference_no,
                     journals.entry_date::text,
                     journals.display_reference,
                     ROUND(journals.total_debit * 100)::bigint,
                     ROUND(journals.total_credit * 100)::bigint,
                     lines.line_number,
                     lines.display_order,
                     lines.account_code,
                     ROUND(lines.debit_amount * 100)::bigint,
                     ROUND(lines.credit_amount * 100)::bigint,
                     lines.particulars,
                     lines.cheque_reference,
                     lines.display_reference
                   )::text,
                   E'\n' ORDER BY journals.reference_no,
                                  lines.line_number, lines.id
                 ), '')) = '70cc1b6d97fc2fdaeff191c14092f531'
             AS matches_audited_accounting_fingerprint_v2
      FROM journal_entries journals
      LEFT JOIN journal_entry_lines lines
        ON lines.journal_entry_id = journals.id
     WHERE journals.entry_type = 'IMP'
       AND journals.status = 'posted';
  \else
    \echo 'Legacy-import accounting fingerprint v2 skipped: required display columns are absent.'
  \endif
\endif

\echo '=== 9. Exact source-owned CN checkpoint ==='
\if :accounting_columns_queryable
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
),
source_matched AS (
  SELECT expected.source_id,
         expected.target_date,
         journals.id,
         journals.entry_date
    FROM expected
    LEFT JOIN journal_entries journals
      ON journals.source_type = 'adjustment'
     AND journals.source_id = expected.source_id
     AND journals.display_reference = expected.display_reference
     AND journals.entry_type = 'CN'
     AND journals.status = 'posted'
    LEFT JOIN adjustment_documents documents
      ON documents.id = expected.source_id
     AND documents.journal_entry_id = journals.id
     AND documents.type = 'credit_note'
   WHERE journals.id IS NOT NULL
     AND documents.id IS NOT NULL
)
SELECT 16 AS expected_rows,
       (SELECT COUNT(*) FROM source_matched) AS source_owned_rows,
       (SELECT COUNT(*)
          FROM source_matched
         WHERE entry_date = target_date) AS exact_date_rows,
       (SELECT COUNT(*)
          FROM source_matched
         WHERE entry_date = DATE '2026-05-31') AS parked_31_may_rows,
       (SELECT COUNT(*)
          FROM journal_entries
         WHERE entry_type = 'CN'
           AND status = 'posted'
           AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31')
         AS total_posted_cn_rows,
       (SELECT COALESCE(SUM(ROUND(total_debit * 100)), 0)::bigint
          FROM journal_entries
         WHERE entry_type = 'CN'
           AND status = 'posted'
           AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31')
         AS total_posted_cn_debit_cents,
       (SELECT COUNT(*) FROM source_matched) = 16
         AND (SELECT COUNT(*)
                FROM journal_entries
               WHERE entry_type = 'CN'
                 AND status = 'posted'
                 AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31') = 16
         AND (SELECT COALESCE(SUM(ROUND(total_debit * 100)), 0)::bigint
                FROM journal_entries
               WHERE entry_type = 'CN'
                 AND status = 'posted'
                 AND entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31')
               = 183492
         AND (
           (SELECT COUNT(*)
              FROM source_matched
             WHERE entry_date = target_date) = 16
           OR
           (SELECT COUNT(*)
              FROM source_matched
             WHERE entry_date = DATE '2026-05-31') = 16
         )
       AS matches_audited_pre_or_final_cn_state;
\else
  \echo 'Exact source-owned CN checkpoint skipped: required source/display columns are absent.'
\endif

\echo '=== 10. Identifier/account normalization state ==='
SELECT COUNT(*) AS account_rows,
       COUNT(*) FILTER (WHERE fs_note IS NOT NULL) AS mapped_account_rows,
       MD5(STRING_AGG(
         FORMAT('%s|%s', code, COALESCE(ledger_type, '<null>')),
         E'\n' ORDER BY code COLLATE "C"
       )) AS structure_fingerprint_md5,
       MD5(STRING_AGG(
         FORMAT('%s|%s|%s', code, COALESCE(ledger_type, '<null>'),
                COALESCE(fs_note, '<null>')),
         E'\n' ORDER BY code COLLATE "C"
       )) AS mapping_fingerprint_md5,
       COUNT(*) = 2811
         AND MD5(STRING_AGG(
               FORMAT('%s|%s', code, COALESCE(ledger_type, '<null>')),
               E'\n' ORDER BY code COLLATE "C"
             )) = '798ca9081b9e4cce514d3488122fb0d3'
         AND MD5(STRING_AGG(
               FORMAT('%s|%s|%s', code,
                      COALESCE(ledger_type, '<null>'),
                      COALESCE(fs_note, '<null>')),
               E'\n' ORDER BY code COLLATE "C"
             )) = '465d3404d38f2bbfa2bfab9e5b96e054'
         AS matches_audited_pre_rollout_state,
       COUNT(*) = 2814
         AND MD5(STRING_AGG(
               FORMAT('%s|%s', code, COALESCE(ledger_type, '<null>')),
               E'\n' ORDER BY code COLLATE "C"
             )) = '6acd9b84d895e578e770b816978d3400'
         AND MD5(STRING_AGG(
               FORMAT('%s|%s|%s', code,
                      COALESCE(ledger_type, '<null>'),
                      COALESCE(fs_note, '<null>')),
               E'\n' ORDER BY code COLLATE "C"
             )) = 'b18746387b17147d8d81e76ec0dc62be'
         AS matches_audited_final_remap_state
  FROM account_codes;

WITH renames(object_type, old_value, new_value) AS (
  VALUES
    ('customer', 'AMY ', 'AMY'),
    ('customer', 'STELLA ', 'STELLA'),
    ('account', 'AMY ', 'AMY'),
    ('account', 'STELLA ', 'STELLA'),
    ('account', 'HPA_SWJ988', 'HPA_SWJ9882'),
    ('account', 'HPB_SWJ988', 'HPB_SWJ9882')
)
SELECT object_type,
       QUOTE_LITERAL(old_value) AS old_value,
       QUOTE_LITERAL(new_value) AS new_value,
       CASE object_type
         WHEN 'customer' THEN (
           SELECT COUNT(*) FROM customers WHERE id = old_value
         )
         WHEN 'account' THEN (
           SELECT COUNT(*) FROM account_codes WHERE code = old_value
         )
       END AS old_rows,
       CASE object_type
         WHEN 'customer' THEN (
           SELECT COUNT(*) FROM customers WHERE id = new_value
         )
         WHEN 'account' THEN (
           SELECT COUNT(*) FROM account_codes WHERE code = new_value
         )
       END AS new_rows
  FROM renames
 ORDER BY object_type, old_value;

SELECT expected.code,
       accounts.description,
       accounts.ledger_type,
       accounts.parent_code,
       accounts.fs_note,
       accounts.is_active,
       accounts.code IS NOT NULL AS present
  FROM (VALUES
    ('CA_HINO'::varchar),
    ('OIL920'::varchar),
    ('CL_AFI'::varchar)
  ) AS expected(code)
  LEFT JOIN account_codes accounts ON accounts.code = expected.code
 ORDER BY expected.code;

SELECT code, name, description, is_active
  FROM journal_entry_types
 WHERE code = 'IMP';

\echo '=== 11. January and June opening-anchor populations ==='
WITH target_dates(as_of_date) AS (
  VALUES (DATE '2026-01-01'), (DATE '2026-06-01')
),
aggregated AS (
  SELECT target_dates.as_of_date,
         COUNT(anchors.id) AS anchor_rows,
         COUNT(anchors.id) FILTER (WHERE anchors.amount <> 0) AS nonzero_rows,
         COUNT(anchors.id) FILTER (WHERE anchors.amount = 0) AS zero_rows,
         COUNT(anchors.id) FILTER (WHERE anchors.amount > 0) AS debit_rows,
         COUNT(anchors.id) FILTER (WHERE anchors.amount < 0) AS credit_rows,
         COALESCE(SUM(ROUND(anchors.amount * 100))
           FILTER (WHERE anchors.amount > 0), 0)::bigint AS debit_cents,
         COALESCE(-SUM(ROUND(anchors.amount * 100))
           FILTER (WHERE anchors.amount < 0), 0)::bigint AS credit_cents,
         COALESCE(SUM(ROUND(anchors.amount * 100)), 0)::bigint AS net_cents,
         MD5(COALESCE(STRING_AGG(
           JSONB_BUILD_ARRAY(
             anchors.account_code,
             ROUND(anchors.amount * 100)::bigint
           )::text,
           E'\n' ORDER BY anchors.account_code
         ) FILTER (WHERE anchors.id IS NOT NULL), ''))
           AS anchor_fingerprint_md5
    FROM target_dates
    LEFT JOIN account_opening_balances anchors
      ON anchors.as_of_date = target_dates.as_of_date
   GROUP BY target_dates.as_of_date
)
SELECT aggregated.*,
       CASE aggregated.as_of_date
         WHEN DATE '2026-01-01' THEN
           anchor_rows = 580
           AND nonzero_rows = 291
           AND zero_rows = 289
           AND debit_rows = 168
           AND credit_rows = 123
           AND debit_cents = 1255380603
           AND credit_cents = 1401028640
           AND net_cents = -145648037
         WHEN DATE '2026-06-01' THEN
           anchor_rows = 1571
           AND net_cents = -261795905
       END AS matches_audited_final_population
  FROM aggregated
 ORDER BY as_of_date;

\echo '=== 12. HPB interest-in-suspense and HPI fs_note state ==='
SELECT fs_note,
       COUNT(*) AS accounts,
       STRING_AGG(code, ', ' ORDER BY code) AS account_codes
  FROM account_codes
 WHERE code IN ('HPB', 'CL_HPB', 'HPI')
    OR code LIKE 'HPB\_%' ESCAPE '\'
 GROUP BY fs_note
 ORDER BY fs_note;

SELECT COUNT(*) FILTER (
         WHERE code IN ('HPB', 'CL_HPB')
            OR code LIKE 'HPB\_%' ESCAPE '\'
       ) AS hpb_family_rows,
       COUNT(*) FILTER (
         WHERE (code IN ('HPB', 'CL_HPB')
             OR code LIKE 'HPB\_%' ESCAPE '\')
           AND fs_note = '16'
       ) AS hpb_family_note16_rows,
       COUNT(*) FILTER (
         WHERE (code IN ('HPB', 'CL_HPB')
             OR code LIKE 'HPB\_%' ESCAPE '\')
           AND fs_note IS DISTINCT FROM '16'
       ) AS hpb_family_non_note16_rows,
       COUNT(*) FILTER (WHERE code = 'HPI' AND fs_note = '23')
         AS hpi_note23_rows,
       COUNT(*) FILTER (
         WHERE code IN ('HPB', 'CL_HPB')
            OR code LIKE 'HPB\_%' ESCAPE '\'
       ) >= 32
         AND COUNT(*) FILTER (
               WHERE (code IN ('HPB', 'CL_HPB')
                   OR code LIKE 'HPB\_%' ESCAPE '\')
                 AND fs_note IS DISTINCT FROM '16'
             ) = 0
         AND COUNT(*) FILTER (WHERE code = 'HPI' AND fs_note = '23') = 1
         AS matches_approved_note_state
  FROM account_codes
 WHERE code IN ('HPB', 'CL_HPB', 'HPI')
    OR code LIKE 'HPB\_%' ESCAPE '\';

\echo '=== 13. Jan-May ERP invoice scope (Asia/Kuala_Lumpur local dates) ==='
WITH invoice_window AS (
  SELECT invoices.*,
         (
           TO_TIMESTAMP(invoices.createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date AS local_date,
         ROUND(COALESCE(invoices.totalamountpayable, 0) * 100)::bigint
           AS amount_cents
    FROM invoices
   WHERE (
           TO_TIMESTAMP(invoices.createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
),
populations(population, rows, cents) AS (
  SELECT 'all local-date rows', COUNT(*), COALESCE(SUM(amount_cents), 0)
    FROM invoice_window
  UNION ALL
  SELECT 'cancelled rows', COUNT(*), COALESCE(SUM(amount_cents), 0)
    FROM invoice_window WHERE invoice_status = 'cancelled'
  UNION ALL
  SELECT 'non-cancelled rows', COUNT(*), COALESCE(SUM(amount_cents), 0)
    FROM invoice_window WHERE invoice_status <> 'cancelled'
  UNION ALL
  SELECT 'consolidated wrappers', COUNT(*), COALESCE(SUM(amount_cents), 0)
    FROM invoice_window
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false)
  UNION ALL
  SELECT 'source rows (non-wrapper)', COUNT(*), COALESCE(SUM(amount_cents), 0)
    FROM invoice_window
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false) = false
  UNION ALL
  SELECT 'numeric source rows', COUNT(*), COALESCE(SUM(amount_cents), 0)
    FROM invoice_window
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false) = false
     AND id ~ '^[0-9]+$'
  UNION ALL
  SELECT 'F source rows', COUNT(*), COALESCE(SUM(amount_cents), 0)
    FROM invoice_window
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false) = false
     AND id ~* '^F[0-9]+$'
)
SELECT populations.*,
       CASE population
         WHEN 'all local-date rows' THEN rows = 2208 AND cents = 466188865
         WHEN 'cancelled rows' THEN rows = 40 AND cents = 0
         WHEN 'non-cancelled rows' THEN rows = 2168 AND cents = 466188865
         WHEN 'consolidated wrappers' THEN rows = 5 AND cents = 132682280
         WHEN 'source rows (non-wrapper)' THEN rows = 2163 AND cents = 333506585
         WHEN 'numeric source rows' THEN rows = 2124 AND cents = 333506585
         WHEN 'F source rows' THEN rows = 39 AND cents = 0
       END AS matches_audited_20260713_snapshot
  FROM populations
 ORDER BY CASE population
    WHEN 'all local-date rows' THEN 1
    WHEN 'cancelled rows' THEN 2
    WHEN 'non-cancelled rows' THEN 3
    WHEN 'consolidated wrappers' THEN 4
    WHEN 'source rows (non-wrapper)' THEN 5
    WHEN 'numeric source rows' THEN 6
    WHEN 'F source rows' THEN 7
  END;

WITH invoice_window AS (
  SELECT invoices.*,
         (
           TO_TIMESTAMP(invoices.createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date AS local_date,
         ROUND(COALESCE(invoices.totalamountpayable, 0) * 100)::bigint
           AS amount_cents
    FROM invoices
   WHERE (
           TO_TIMESTAMP(invoices.createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
)
SELECT COUNT(*) FILTER (
         WHERE invoice_status <> 'cancelled'
           AND COALESCE(is_consolidated, false) = false
           AND journal_entry_id IS NOT NULL
       ) AS source_rows_with_journal_link,
       COUNT(*) FILTER (
         WHERE invoice_status <> 'cancelled'
           AND COALESCE(is_consolidated, false) = false
           AND journal_entry_id IS NULL
       ) AS source_rows_without_journal_link,
       MD5(COALESCE(STRING_AGG(
         JSONB_BUILD_ARRAY(
           id,
           local_date::text,
           customerid,
           paymenttype,
           amount_cents,
           invoice_status,
           COALESCE(is_consolidated, false),
           journal_entry_id
         )::text,
         E'\n' ORDER BY id
       ) FILTER (
         WHERE invoice_status <> 'cancelled'
           AND COALESCE(is_consolidated, false) = false
       ), '')) AS source_invoice_fingerprint_md5
  FROM invoice_window;

COMMIT;

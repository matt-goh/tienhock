-- Insert the approved 1 January 2026 opening anchors after verify-import.sql
-- passes. Printed running balances are authoritative; debit/credit columns on
-- opening rows are not. The transaction is idempotent and refuses drift.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('legacy_jan_may_2026_journal_import', 0)
);

LOCK TABLE import_legacy_rows, account_codes IN SHARE MODE;
LOCK TABLE journal_entries, journal_entry_lines, adjustment_documents
  IN SHARE MODE;
LOCK TABLE account_opening_balances IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE expected_cn (
  source_id varchar(255) PRIMARY KEY,
  display_reference varchar(100) NOT NULL,
  entry_date date NOT NULL,
  debtor_account varchar(50) NOT NULL,
  amount_cents bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_cn VALUES
  ('CN-2026-0001', 'THCN/26/1',  DATE '2026-01-09', 'MYSHOP(KM)',  2290),
  ('CN-2026-0002', 'THCN/26/2',  DATE '2026-01-17', 'MYSHOP-QL',   2565),
  ('CN-2026-0003', 'THCN/26/3',  DATE '2026-02-05', 'YTF',        105660),
  ('CN-2026-0004', 'THCN/26/4',  DATE '2026-02-06', 'MYSHOP-KD1', 2565),
  ('CN-2026-0005', 'THCN/26/5',  DATE '2026-02-14', 'MYSHOP-QL',   1540),
  ('CN-2026-0006', 'THCN/26/6',  DATE '2026-02-26', 'MYSHOP-LK',   6755),
  ('CN-2026-0007', 'THCN/26/7',  DATE '2026-03-10', 'MYSHOP-KM2',  3350),
  ('CN-2026-0008', 'THCN/26/8',  DATE '2026-03-10', 'MYSHOP(KM)',  1180),
  ('CN-2026-0009', 'THCN/26/9',  DATE '2026-03-18', 'C-CARE(6)',   19572),
  ('CN-2026-0010', 'THCN/26/10', DATE '2026-04-08', 'MYSHOP-QL',   3340),
  ('CN-2026-0011', 'THCN/26/11', DATE '2026-04-08', 'MYSHOP-QL',   3300),
  ('CN-2026-0012', 'THCN/26/12', DATE '2026-04-08', 'MYSHOP(KM)',  1200),
  ('CN-2026-0013', 'THCN/26/13', DATE '2026-05-20', 'MEEWOO-K',    21875),
  ('CN-2026-0014', 'THCN/26/14', DATE '2026-05-28', 'MYSHOP-SKT',  5130),
  ('CN-2026-0015', 'THCN/26/15', DATE '2026-05-28', 'MYSHOP(KM)',  685),
  ('CN-2026-0016', 'THCN/26/16', DATE '2026-05-28', 'MYSHOP-KM2',  2485);

CREATE TEMP TABLE expected_cn_movements ON COMMIT DROP AS
SELECT expected.entry_date,
       projected.account_code,
       projected.movement_cents
  FROM expected_cn expected
 CROSS JOIN LATERAL (VALUES
   ('CR_SALES'::varchar, expected.amount_cents),
   (expected.debtor_account, -expected.amount_cents)
 ) AS projected(account_code, movement_cents);

-- Printed opening rows supply their signed running balance. The one approved
-- DERIVED transaction account, CHARLES-C, has no printed C/FWD row, so it gets
-- an explicit zero fence to prevent future pre-2026 rows leaking into reports.
CREATE TEMP TABLE desired_opening_anchors ON COMMIT DROP AS
WITH transaction_accounts AS (
  SELECT DISTINCT staged.account_code
    FROM import_legacy_rows staged
   WHERE staged.record_kind = 'transaction'
), printed_openings AS (
SELECT opening.account_code,
       opening.entry_date AS source_opening_date,
       opening.running_balance_cents,
       CASE
         WHEN opening.running_balance_cents = 0
           THEN 'Zero opening fence for active Jan-May 2026 legacy account'
         ELSE 'Legacy Jan-May 2026 opening from hash-validated ledger export'
       END::text AS notes
  FROM import_legacy_rows opening
  LEFT JOIN transaction_accounts transactions USING (account_code)
 WHERE opening.record_kind = 'opening'
   AND (
     opening.running_balance_cents <> 0
     OR transactions.account_code IS NOT NULL
   )
)
SELECT printed.account_code,
       printed.source_opening_date,
       printed.running_balance_cents,
       printed.notes
  FROM printed_openings printed
UNION ALL
SELECT transactions.account_code,
       DATE '2026-01-01' AS source_opening_date,
       0::bigint AS running_balance_cents,
       'Zero opening fence for approved derived Jan-May 2026 account'::text
         AS notes
  FROM transaction_accounts transactions
 WHERE NOT EXISTS (
   SELECT 1
     FROM import_legacy_rows opening
    WHERE opening.record_kind = 'opening'
      AND opening.account_code = transactions.account_code
 );

CREATE UNIQUE INDEX ON desired_opening_anchors (account_code);

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
  SELECT movement.account_code,
         SUM(movement.movement_cents)::bigint AS movement_cents
    FROM expected_cn_movements movement
   WHERE movement.entry_date <= DATE '2026-05-31'
   GROUP BY movement.account_code
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

DO $preflight$
DECLARE
  v_count bigint;
  v_nonzero_count bigint;
  v_debit_count bigint;
  v_credit_count bigint;
  v_zero_count bigint;
  v_debit_cents bigint;
  v_credit_cents bigint;
  v_net_cents bigint;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE running_balance_cents <> 0),
         COUNT(*) FILTER (WHERE running_balance_cents > 0),
         COUNT(*) FILTER (WHERE running_balance_cents < 0),
         COUNT(*) FILTER (WHERE running_balance_cents = 0),
         COALESCE(SUM(running_balance_cents)
           FILTER (WHERE running_balance_cents > 0), 0),
         COALESCE(-SUM(running_balance_cents)
           FILTER (WHERE running_balance_cents < 0), 0),
         COALESCE(SUM(running_balance_cents), 0)
    INTO v_count, v_nonzero_count, v_debit_count, v_credit_count,
         v_zero_count, v_debit_cents, v_credit_cents, v_net_cents
    FROM desired_opening_anchors;

  IF (
    v_count,
    v_nonzero_count,
    v_debit_count,
    v_credit_count,
    v_zero_count,
    v_debit_cents,
    v_credit_cents,
    v_net_cents
  ) IS DISTINCT FROM (
    580::bigint,
    291::bigint,
    168::bigint,
    123::bigint,
    289::bigint,
    1255380603::bigint,
    1401028640::bigint,
    -145648037::bigint
  ) THEN
    RAISE EXCEPTION 'The desired 1 January anchor population has changed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_opening_anchors desired
     WHERE desired.source_opening_date <> DATE '2026-01-01'
  ) THEN
    RAISE EXCEPTION 'A selected opening is not sourced from 1 January';
  END IF;

  IF (SELECT COUNT(*)
        FROM desired_opening_anchors desired
       WHERE desired.notes =
             'Zero opening fence for approved derived Jan-May 2026 account'
         AND desired.account_code = 'CHARLES-C') <> 1 THEN
    RAISE EXCEPTION 'The approved derived CHARLES-C zero fence is missing';
  END IF;

  IF EXISTS (
    SELECT 1
     FROM desired_opening_anchors desired
      LEFT JOIN account_codes accounts ON accounts.code = desired.account_code
     WHERE accounts.code IS NULL
        OR accounts.is_active IS DISTINCT FROM TRUE
        OR accounts.fs_note IS NULL
  ) THEN
    RAISE EXCEPTION 'A desired anchor account is missing, inactive, or unmapped';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM account_opening_balances existing
      LEFT JOIN desired_opening_anchors desired USING (account_code)
     WHERE existing.as_of_date = DATE '2026-01-01'
       AND desired.account_code IS NULL
  ) THEN
    RAISE EXCEPTION 'An unexpected pre-existing 1 January anchor exists';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM account_opening_balances existing
      JOIN desired_opening_anchors desired USING (account_code)
     WHERE existing.as_of_date = DATE '2026-01-01'
       AND ROUND(existing.amount * 100)::bigint
             IS DISTINCT FROM desired.running_balance_cents
  ) THEN
    RAISE EXCEPTION 'A pre-existing 1 January anchor differs from source';
  END IF;

  SELECT COUNT(DISTINCT headers.id),
         COUNT(lines.id),
         SUM(ROUND(lines.debit_amount * 100))::bigint,
         SUM(ROUND(lines.credit_amount * 100))::bigint
    INTO v_count, v_nonzero_count, v_debit_cents, v_credit_cents
    FROM journal_entries headers
    JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
   WHERE headers.entry_type = 'IMP'
     AND headers.status = 'posted';

  IF (v_count, v_nonzero_count, v_debit_cents, v_credit_cents)
     IS DISTINCT FROM
     (3863::bigint, 10068::bigint, 1350351615::bigint,
      1350351615::bigint) THEN
    RAISE EXCEPTION 'The posted IMP population is not exact';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries headers
      JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
     WHERE headers.entry_type = 'IMP'
       AND headers.status = 'posted'
     GROUP BY headers.id, headers.total_debit, headers.total_credit
    HAVING SUM(lines.debit_amount) IS DISTINCT FROM headers.total_debit
        OR SUM(lines.credit_amount) IS DISTINCT FROM headers.total_credit
        OR SUM(lines.debit_amount) IS DISTINCT FROM SUM(lines.credit_amount)
  ) THEN
    RAISE EXCEPTION 'An IMP journal is not balanced against its header';
  END IF;

  IF EXISTS (
    WITH staged AS (
      SELECT account_code,
             SUM(debit_cents - credit_cents)::bigint AS movement_cents
        FROM import_legacy_rows
       WHERE record_kind = 'transaction'
       GROUP BY account_code
    ), posted AS (
      SELECT lines.account_code,
             SUM(
               ROUND(lines.debit_amount * 100)
                 - ROUND(lines.credit_amount * 100)
             )::bigint AS movement_cents
        FROM journal_entries headers
        JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
       WHERE headers.entry_type = 'IMP'
         AND headers.status = 'posted'
       GROUP BY lines.account_code
    )
    SELECT 1
      FROM staged
      FULL JOIN posted USING (account_code)
     WHERE staged.movement_cents IS DISTINCT FROM posted.movement_cents
  ) THEN
    RAISE EXCEPTION 'Per-account IMP movement differs from staging';
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

  IF (SELECT COUNT(*) FROM expected_source_close) <> 2568
     OR (SELECT SUM(close_cents) FROM expected_source_close)
          IS DISTINCT FROM -145648037::bigint THEN
    RAISE EXCEPTION 'The source-derived 31 May population has changed';
  END IF;

  SELECT COUNT(*), SUM(ROUND(anchors.amount * 100))::bigint
    INTO v_count, v_net_cents
    FROM account_opening_balances anchors
   WHERE anchors.as_of_date = DATE '2026-06-01';

  IF (v_count, v_net_cents) IS DISTINCT FROM
     (1571::bigint, -261795905::bigint) THEN
    RAISE EXCEPTION 'The 1 June checkpoint population has changed';
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
END
$preflight$;

INSERT INTO account_opening_balances (
  account_code,
  as_of_date,
  amount,
  notes,
  created_by
)
SELECT desired.account_code,
       DATE '2026-01-01',
       desired.running_balance_cents::numeric / 100,
       desired.notes,
       'legacy-import'
  FROM desired_opening_anchors desired
ON CONFLICT (account_code, as_of_date) DO NOTHING;

DO $verification$
DECLARE
  v_count bigint;
  v_nonzero_count bigint;
  v_debit_count bigint;
  v_credit_count bigint;
  v_zero_count bigint;
  v_debit_cents bigint;
  v_credit_cents bigint;
  v_net_cents bigint;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE ROUND(amount * 100)::bigint <> 0),
         COUNT(*) FILTER (WHERE ROUND(amount * 100)::bigint > 0),
         COUNT(*) FILTER (WHERE ROUND(amount * 100)::bigint < 0),
         COUNT(*) FILTER (WHERE ROUND(amount * 100)::bigint = 0),
         COALESCE(SUM(ROUND(amount * 100))
           FILTER (WHERE amount > 0), 0)::bigint,
         COALESCE(-SUM(ROUND(amount * 100))
           FILTER (WHERE amount < 0), 0)::bigint,
         COALESCE(SUM(ROUND(amount * 100)), 0)::bigint
    INTO v_count, v_nonzero_count, v_debit_count, v_credit_count,
         v_zero_count, v_debit_cents, v_credit_cents, v_net_cents
    FROM account_opening_balances
   WHERE as_of_date = DATE '2026-01-01';

  IF (
    v_count,
    v_nonzero_count,
    v_debit_count,
    v_credit_count,
    v_zero_count,
    v_debit_cents,
    v_credit_cents,
    v_net_cents
  ) IS DISTINCT FROM (
    580::bigint,
    291::bigint,
    168::bigint,
    123::bigint,
    289::bigint,
    1255380603::bigint,
    1401028640::bigint,
    -145648037::bigint
  ) THEN
    RAISE EXCEPTION 'The committed 1 January anchor population is not exact';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM desired_opening_anchors desired
      LEFT JOIN account_opening_balances actual
        ON actual.account_code = desired.account_code
       AND actual.as_of_date = DATE '2026-01-01'
     WHERE actual.id IS NULL
        OR ROUND(actual.amount * 100)::bigint
             IS DISTINCT FROM desired.running_balance_cents
  ) THEN
    RAISE EXCEPTION 'A committed 1 January anchor differs from source';
  END IF;

  IF EXISTS (
    WITH january_opening AS (
      SELECT account_code,
             ROUND(amount * 100)::bigint AS opening_cents
        FROM account_opening_balances
       WHERE as_of_date = DATE '2026-01-01'
    ), posted_movement AS (
      SELECT lines.account_code,
             SUM(
               ROUND(lines.debit_amount * 100)
                 - ROUND(lines.credit_amount * 100)
             )::bigint AS movement_cents
        FROM journal_entries headers
        JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
       WHERE headers.status = 'posted'
         AND headers.entry_date >= DATE '2026-01-01'
         AND headers.entry_date < DATE '2026-06-01'
       GROUP BY lines.account_code
    )
    SELECT 1
      FROM account_opening_balances june
      LEFT JOIN january_opening january USING (account_code)
      LEFT JOIN posted_movement movement USING (account_code)
     WHERE june.as_of_date = DATE '2026-06-01'
       AND COALESCE(january.opening_cents, 0)
             + COALESCE(movement.movement_cents, 0)
             IS DISTINCT FROM ROUND(june.amount * 100)::bigint
  ) THEN
    RAISE EXCEPTION 'Report-semantics 31 May close differs from a 1 June anchor';
  END IF;

  IF EXISTS (
    WITH january_opening AS (
      SELECT account_code,
             ROUND(amount * 100)::bigint AS opening_cents
        FROM account_opening_balances
       WHERE as_of_date = DATE '2026-01-01'
    ), posted_movement AS (
      SELECT lines.account_code,
             SUM(
               ROUND(lines.debit_amount * 100)
                 - ROUND(lines.credit_amount * 100)
             )::bigint AS movement_cents
        FROM journal_entries headers
        JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
       WHERE headers.status = 'posted'
         AND headers.entry_date >= DATE '2026-01-01'
         AND headers.entry_date < DATE '2026-06-01'
       GROUP BY lines.account_code
    ), actual_close AS (
      SELECT accounts.code AS account_code,
             COALESCE(opening.opening_cents, 0)
               + COALESCE(movement.movement_cents, 0) AS close_cents
        FROM account_codes accounts
        LEFT JOIN january_opening opening
          ON opening.account_code = accounts.code
        LEFT JOIN posted_movement movement
          ON movement.account_code = accounts.code
    ), expected(account_code, close_cents) AS (
      VALUES
        ('BANK_PBB'::varchar, 17228816::bigint),
        ('BANK_ABB'::varchar, 20426::bigint),
        ('CH_REV1'::varchar, 3564435::bigint),
        ('CH_REV2'::varchar, 106005::bigint),
        ('C-CARE(1)'::varchar, 874800::bigint)
    )
    SELECT 1
      FROM expected
      LEFT JOIN actual_close actual USING (account_code)
     WHERE actual.close_cents IS DISTINCT FROM expected.close_cents
  ) THEN
    RAISE EXCEPTION 'A named report-semantics close differs from target';
  END IF;
END
$verification$;

COMMIT;

SELECT COUNT(*) AS january_anchors,
       COUNT(*) FILTER (WHERE amount <> 0) AS nonzero_anchors,
       COUNT(*) FILTER (WHERE amount = 0) AS zero_fences,
       SUM(amount)::numeric(14,2) AS signed_net
  FROM account_opening_balances
 WHERE as_of_date = DATE '2026-01-01';

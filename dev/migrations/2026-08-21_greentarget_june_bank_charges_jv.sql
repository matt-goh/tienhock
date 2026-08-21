-- Green Target June 2026 bank charges (JV2606-01)
--
-- User-supplied evidence (2026-08-21):
--   Journal Voucher JV2606-01, dated 30-Jun-2026
--   DR BWBC  BANK CHARGES (BW)                 RM2.70
--   CR PBB_1 PBB-A/C:3137836814 (BW)           RM2.70
--   Cheque process fee                         RM1.50
--   Bank handling charges on 05/06 & 15/06     RM1.20
--
-- The Jan-Jun 2026 legacy import contains the corresponding month-end bank
-- charge journals for January-May, but no June bank-charge journal. June is
-- locked in the application because it is inside the imported period, so the
-- documented direct-migration exception is used instead of reopening that
-- period or modifying an immutable IMP journal.
--
-- Guarded, idempotent, fail-closed and contained in one transaction. A rerun
-- accepts only the exact final voucher; a conflicting use of JV2606-01 or an
-- equivalent already-posted June charge aborts for manual review.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL search_path TO greentarget, public;
SET LOCAL lock_timeout = '5s';

SELECT pg_advisory_xact_lock(
  hashtextextended('greentarget_jv2606_01_bank_charges', 0)
);

DO $migration$
DECLARE
  v_reference CONSTANT varchar(50) := 'JV2606-01';
  v_entry_date CONSTANT date := DATE '2026-06-30';
  v_description CONSTANT text := 'BANK CHARGES MONTH OF JUNE 2026';
  v_actor CONSTANT varchar(50) := 'GT_JUNE_BANK_CHARGE_20260821';
  v_amount CONSTANT numeric(15,2) := 2.70;
  v_existing_id integer;
  v_reference_count bigint;
  v_journal_id integer;
  v_posting_sequence integer;
  v_exact_shape_count bigint;
  v_equivalent_count bigint;
  v_legacy_bank_charge_lines bigint;
  v_legacy_bank_charge_debit_cents bigint;
  v_legacy_journal_count bigint;
  v_legacy_line_count bigint;
  v_bwbc_close_cents bigint;
  v_pbb1_close_cents bigint;
BEGIN
  PERFORM id
    FROM journal_entries
   WHERE UPPER(BTRIM(reference_no)) = v_reference
     FOR UPDATE;

  SELECT COUNT(*), MIN(id)
    INTO v_reference_count, v_existing_id
    FROM journal_entries
   WHERE UPPER(BTRIM(reference_no)) = v_reference;

  IF v_reference_count > 1 THEN
    RAISE EXCEPTION
      'Multiple Green Target journals normalize to reference %; aborting.',
      v_reference;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM journal_entries header
     WHERE header.source_type IS DISTINCT FROM 'legacy_import'
       AND header.entry_date < DATE '2026-07-01'
       AND UPPER(BTRIM(header.reference_no)) IS DISTINCT FROM v_reference
  ) THEN
    RAISE EXCEPTION
      'An unexplained non-import journal exists before the 2026-07-01 Green Target cutover; aborting.';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_exact_shape_count
      FROM journal_entries header
     WHERE header.id = v_existing_id
       AND header.reference_no = v_reference
       AND header.entry_type = 'JV'
       AND header.entry_date = v_entry_date
       AND header.description = v_description
       AND header.total_debit = v_amount
       AND header.total_credit = v_amount
       AND header.status = 'posted'
       AND header.display_reference IS NULL
       AND header.posting_sequence = 279
       AND header.source_type IS NULL
       AND header.source_id IS NULL
       AND header.legacy_entry_type IS NULL
       AND header.manual_override IS false
       AND header.cheque_no IS NULL
       AND header.created_by = v_actor
       AND header.updated_by = v_actor
       AND header.posted_by = v_actor
       AND header.posted_at IS NOT NULL
       AND (
         SELECT COUNT(*)
           FROM journal_entry_lines line
          WHERE line.journal_entry_id = header.id
       ) = 2
       AND EXISTS (
         SELECT 1
           FROM journal_entry_lines line
          WHERE line.journal_entry_id = header.id
            AND line.line_number = 1
            AND line.account_code = 'BWBC'
            AND line.debit_amount = v_amount
            AND line.credit_amount = 0
            AND line.reference IS NULL
            AND line.particulars = v_description
            AND line.cheque_reference IS NULL
            AND line.display_order = 1
            AND line.display_reference IS NULL
            AND line.debtor_subledger_code IS NULL
       )
       AND EXISTS (
         SELECT 1
           FROM journal_entry_lines line
          WHERE line.journal_entry_id = header.id
            AND line.line_number = 2
            AND line.account_code = 'PBB_1'
            AND line.debit_amount = 0
            AND line.credit_amount = v_amount
            AND line.reference IS NULL
            AND line.particulars = v_description
            AND line.cheque_reference IS NULL
            AND line.display_order = 2
            AND line.display_reference IS NULL
            AND line.debtor_subledger_code IS NULL
       );

    IF v_exact_shape_count <> 1 THEN
      RAISE EXCEPTION
        'Green Target journal reference % already exists but does not match the approved June bank-charge voucher; aborting.',
        v_reference;
    END IF;

    v_journal_id := v_existing_id;
    RAISE NOTICE 'Green Target journal % is already present with the exact approved shape; no rows changed.',
      v_reference;
  ELSE

  PERFORM 1
    FROM journal_entry_types
   WHERE code = 'JV'
     AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Green Target journal type JV is missing; aborting.';
  END IF;

  PERFORM 1
    FROM account_codes
   WHERE code = 'BWBC'
     AND description = 'BANK CHARGES (BW)'
     AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Green Target account BWBC is missing, inactive or renamed; aborting.';
  END IF;

  PERFORM 1
    FROM account_codes
   WHERE code = 'PBB_1'
     AND description = 'PBB-A/C:3137836814 (BW)'
     AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Green Target account PBB_1 is missing, inactive or renamed; aborting.';
  END IF;

  -- The immutable import must still contain exactly the five January-May
  -- debit legs shown by the legacy ledger before this post-import adjustment.
  SELECT COUNT(*),
         COALESCE(SUM(ROUND(line.debit_amount * 100)), 0)::bigint
    INTO v_legacy_bank_charge_lines, v_legacy_bank_charge_debit_cents
    FROM journal_entries header
    JOIN journal_entry_lines line
      ON line.journal_entry_id = header.id
   WHERE header.source_type = 'legacy_import'
     AND header.status = 'posted'
     AND header.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'
     AND line.account_code = 'BWBC'
     AND line.debit_amount > 0
     AND line.credit_amount = 0;

  IF (v_legacy_bank_charge_lines, v_legacy_bank_charge_debit_cents)
     IS DISTINCT FROM (5::bigint, 11740::bigint) THEN
    RAISE EXCEPTION
      'The imported BWBC history has drifted: found % debit lines totalling % cents, expected 5 lines / 11740 cents; aborting.',
      v_legacy_bank_charge_lines, v_legacy_bank_charge_debit_cents;
  END IF;

  SELECT (
           SELECT ROUND(anchor.amount * 100)::bigint
                  + COALESCE((
                      SELECT SUM(
                               ROUND(line.debit_amount * 100)
                               - ROUND(line.credit_amount * 100)
                             )::bigint
                        FROM journal_entries header
                        JOIN journal_entry_lines line
                          ON line.journal_entry_id = header.id
                       WHERE header.status = 'posted'
                         AND header.entry_date BETWEEN anchor.as_of_date AND v_entry_date
                         AND line.account_code = anchor.account_code
                    ), 0)
             FROM account_opening_balances anchor
            WHERE anchor.account_code = 'BWBC'
              AND anchor.as_of_date = DATE '2026-01-01'
         ),
         (
           SELECT ROUND(anchor.amount * 100)::bigint
                  + COALESCE((
                      SELECT SUM(
                               ROUND(line.debit_amount * 100)
                               - ROUND(line.credit_amount * 100)
                             )::bigint
                        FROM journal_entries header
                        JOIN journal_entry_lines line
                          ON line.journal_entry_id = header.id
                       WHERE header.status = 'posted'
                         AND header.entry_date BETWEEN anchor.as_of_date AND v_entry_date
                         AND line.account_code = anchor.account_code
                    ), 0)
             FROM account_opening_balances anchor
            WHERE anchor.account_code = 'PBB_1'
              AND anchor.as_of_date = DATE '2026-01-01'
         )
    INTO v_bwbc_close_cents, v_pbb1_close_cents;

  IF (v_bwbc_close_cents, v_pbb1_close_cents)
     IS DISTINCT FROM (11740::bigint, 2846837::bigint) THEN
    RAISE EXCEPTION
      'The pre-correction June balances have drifted: BWBC % cents / PBB_1 % cents, expected 11740 / 2846837; aborting.',
      v_bwbc_close_cents, v_pbb1_close_cents;
  END IF;

  -- Refuse to double-post the same economic entry under another reference.
  SELECT COUNT(*)
    INTO v_equivalent_count
    FROM journal_entries header
   WHERE header.status = 'posted'
     AND header.entry_date = v_entry_date
     AND (
       SELECT COUNT(*)
         FROM journal_entry_lines line
        WHERE line.journal_entry_id = header.id
     ) = 2
     AND EXISTS (
       SELECT 1
         FROM journal_entry_lines line
        WHERE line.journal_entry_id = header.id
          AND line.account_code = 'BWBC'
          AND line.debit_amount = v_amount
          AND line.credit_amount = 0
     )
     AND EXISTS (
       SELECT 1
         FROM journal_entry_lines line
        WHERE line.journal_entry_id = header.id
          AND line.account_code = 'PBB_1'
          AND line.debit_amount = 0
          AND line.credit_amount = v_amount
     );

  IF v_equivalent_count <> 0 THEN
    RAISE EXCEPTION
      'An equivalent 30-Jun-2026 BWBC/PBB_1 RM2.70 journal already exists under another reference; aborting.';
  END IF;

  SELECT COALESCE(MAX(posting_sequence), 0) + 1
    INTO v_posting_sequence
    FROM journal_entries
   WHERE entry_date >= DATE '2026-06-01'
     AND entry_date < DATE '2026-07-01';

  IF v_posting_sequence <> 279 THEN
    RAISE EXCEPTION
      'The next June posting sequence is %, expected 279; aborting.',
      v_posting_sequence;
  END IF;

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
    posting_sequence
  ) VALUES (
    v_reference,
    'JV',
    v_entry_date,
    v_description,
    v_amount,
    v_amount,
    'posted',
    v_actor,
    v_actor,
    CURRENT_TIMESTAMP,
    v_actor,
    v_posting_sequence
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id,
    line_number,
    account_code,
    debit_amount,
    credit_amount,
    reference,
    particulars,
    display_order
  ) VALUES
    (v_journal_id, 1, 'BWBC', v_amount, 0, NULL, v_description, 1),
    (v_journal_id, 2, 'PBB_1', 0, v_amount, NULL, v_description, 2);

  IF NOT EXISTS (
    SELECT 1
      FROM journal_entries header
      JOIN LATERAL (
        SELECT SUM(line.debit_amount) AS debit,
               SUM(line.credit_amount) AS credit,
               COUNT(*) AS line_count
          FROM journal_entry_lines line
         WHERE line.journal_entry_id = header.id
      ) totals ON true
     WHERE header.id = v_journal_id
       AND totals.line_count = 2
       AND totals.debit = header.total_debit
       AND totals.credit = header.total_credit
       AND totals.debit = totals.credit
       AND totals.debit = v_amount
  ) THEN
    RAISE EXCEPTION 'Inserted Green Target journal % failed its balance post-check; aborting.',
      v_reference;
  END IF;

  RAISE NOTICE
    'Inserted Green Target journal % (id %, posting sequence %): DR BWBC / CR PBB_1 RM%.',
    v_reference, v_journal_id, v_posting_sequence, v_amount;
  END IF;

  -- Final live-report gates. The adjustment raises June BWBC to RM120.10 and
  -- reduces the PBB_1 bank close to RM28,465.67 while leaving the immutable
  -- 1,705-header / 4,401-line import population untouched.
  SELECT COUNT(DISTINCT header.id), COUNT(line.id)
    INTO v_legacy_journal_count, v_legacy_line_count
    FROM journal_entries header
    JOIN journal_entry_lines line
      ON line.journal_entry_id = header.id
   WHERE header.source_type = 'legacy_import';

  IF (v_legacy_journal_count, v_legacy_line_count)
     IS DISTINCT FROM (1705::bigint, 4401::bigint) THEN
    RAISE EXCEPTION
      'The immutable Green Target import population changed: % journals / % lines; expected 1705 / 4401.',
      v_legacy_journal_count, v_legacy_line_count;
  END IF;

  SELECT (
           SELECT ROUND(anchor.amount * 100)::bigint
                  + COALESCE((
                      SELECT SUM(
                               ROUND(line.debit_amount * 100)
                               - ROUND(line.credit_amount * 100)
                             )::bigint
                        FROM journal_entries header
                        JOIN journal_entry_lines line
                          ON line.journal_entry_id = header.id
                       WHERE header.status = 'posted'
                         AND header.entry_date BETWEEN anchor.as_of_date AND v_entry_date
                         AND line.account_code = anchor.account_code
                    ), 0)
             FROM account_opening_balances anchor
            WHERE anchor.account_code = 'BWBC'
              AND anchor.as_of_date = DATE '2026-01-01'
         ),
         (
           SELECT ROUND(anchor.amount * 100)::bigint
                  + COALESCE((
                      SELECT SUM(
                               ROUND(line.debit_amount * 100)
                               - ROUND(line.credit_amount * 100)
                             )::bigint
                        FROM journal_entries header
                        JOIN journal_entry_lines line
                          ON line.journal_entry_id = header.id
                       WHERE header.status = 'posted'
                         AND header.entry_date BETWEEN anchor.as_of_date AND v_entry_date
                         AND line.account_code = anchor.account_code
                    ), 0)
             FROM account_opening_balances anchor
            WHERE anchor.account_code = 'PBB_1'
              AND anchor.as_of_date = DATE '2026-01-01'
         )
    INTO v_bwbc_close_cents, v_pbb1_close_cents;

  IF (v_bwbc_close_cents, v_pbb1_close_cents)
     IS DISTINCT FROM (12010::bigint, 2846567::bigint) THEN
    RAISE EXCEPTION
      'The corrected June balances are wrong: BWBC % cents / PBB_1 % cents, expected 12010 / 2846567; aborting.',
      v_bwbc_close_cents, v_pbb1_close_cents;
  END IF;
END
$migration$;

COMMIT;

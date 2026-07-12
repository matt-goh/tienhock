-- =============================================================================
-- 2026-07-10_phase5_reference_fixes.sql
-- Phase 5: deterministic visible-reference/date corrections proven 1:1 by the
-- June bank statement recon (each pair matches on date+amount exactly):
--
--   * TT040626-6 -> TF040626-6 (353.05) and TT040626-7 -> TF040626-7
--     (2,147.60): family-letter keying typos.
--   * TT190626 (6,372.00) <-> TT190626-3 (583.00): suffixes keyed swapped
--     (legacy: TT190626 = 583.00 POOI, TT190626-3 = 6,372.00 C-CARE(5));
--     TF190626-2 (3,739.50) -> TR190626-2.
--   * Manual payment-voucher journals keyed PCE001..008/06 -> legacy prints
--     PV001..008/06 (visible reference only; internal reference_no untouched).
--   * Manual PBE001/06 keyed 01/06 -> legacy clears it 04/06.
--
-- Idempotent (state-guarded). PCE008/06 amount difference (1,427.40 vs legacy
-- PV008/06 11,764.40) and missing PBE037/06 are NOT touched — user worklist.
-- =============================================================================

BEGIN;

-- --- Receipt display-reference fixes (receipts + journals + payment rows) ---
DO $$
DECLARE
  rec RECORD;
  r RECORD;
  v_candidate_count INTEGER;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('TT040626-6',  353.05, 'TF040626-6', 'TF040626'),
      ('TT040626-7', 2147.60, 'TF040626-7', 'TF040626'),
      ('TT190626',   6372.00, 'TT190626-3', 'TT190626'),
      ('TT190626-3',  583.00, 'TT190626',   'TT190626'),
      ('TF190626-2', 3739.50, 'TR190626-2', 'TR190626')
    ) AS t(old_ref, amount, new_ref, cheque_ref)
  LOOP
    SELECT COUNT(*) INTO v_candidate_count
      FROM receipts
     WHERE display_reference IN (rec.old_ref, rec.new_ref)
       AND total_amount = rec.amount
       AND status = 'posted';
    IF v_candidate_count <> 1 THEN
      RAISE EXCEPTION 'Reference fix % -> % for % expected one source/corrected receipt, found %',
        rec.old_ref, rec.new_ref, rec.amount, v_candidate_count;
    END IF;

    SELECT * INTO r FROM receipts
     WHERE display_reference = rec.old_ref AND total_amount = rec.amount AND status = 'posted'
     LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF; -- already fixed (or swapped pair handled)
    UPDATE receipts
       SET display_reference = rec.new_ref, cheque_reference = rec.cheque_ref,
           updated_at = NOW(), updated_by = 'migration'
     WHERE id = r.id;
    UPDATE journal_entries SET display_reference = rec.new_ref, updated_at = NOW()
     WHERE id = r.journal_entry_id;
    UPDATE journal_entry_lines SET cheque_reference = rec.cheque_ref
     WHERE journal_entry_id = r.journal_entry_id AND debit_amount > 0;
    UPDATE payments p SET payment_reference = rec.new_ref
      FROM receipt_allocations ra
     WHERE ra.receipt_id = r.id AND p.receipt_allocation_id = ra.id;
  END LOOP;
END $$;

-- The TT190626 swap crosses itself; the loop above renames whichever still has
-- its old name (a rerun finds neither, so it is safe).

DO $$
DECLARE
  rec RECORD;
  v_count INTEGER;
  v_receipt_id INTEGER;
  v_journal_id INTEGER;
  v_allocation_count INTEGER;
  v_allocation_total NUMERIC(12,2);
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('TT040626-6',  353.05, 'TF040626-6', 'TF040626'),
      ('TT040626-7', 2147.60, 'TF040626-7', 'TF040626'),
      ('TT190626',   6372.00, 'TT190626-3', 'TT190626'),
      ('TT190626-3',  583.00, 'TT190626',   'TT190626'),
      ('TF190626-2', 3739.50, 'TR190626-2', 'TR190626')
    ) AS t(old_ref, amount, new_ref, cheque_ref)
  LOOP
    SELECT COUNT(*), MIN(r.id), MIN(r.journal_entry_id)
      INTO v_count, v_receipt_id, v_journal_id
      FROM receipts r
      JOIN journal_entries je ON je.id = r.journal_entry_id
     WHERE r.display_reference = rec.new_ref
       AND r.total_amount = rec.amount
       AND r.debit_account = 'BANK_PBB'
       AND r.cheque_reference = rec.cheque_ref
       AND r.status = 'posted'
       AND je.entry_type = 'REC'
       AND je.entry_date = r.posting_date
       AND je.display_reference = rec.new_ref
       AND je.status = 'posted'
       AND je.total_debit = rec.amount
       AND je.total_credit = rec.amount
       AND je.source_type = 'receipt'
       AND je.source_id = r.id::text;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Reference fix % -> % for % did not produce one exact receipt/journal',
        rec.old_ref, rec.new_ref, rec.amount;
    END IF;

    IF rec.old_ref <> rec.new_ref AND EXISTS (
      SELECT 1 FROM receipts
       WHERE display_reference = rec.old_ref
         AND total_amount = rec.amount
         AND status = 'posted'
    ) THEN
      RAISE EXCEPTION 'Obsolete receipt reference % for % remains posted', rec.old_ref, rec.amount;
    END IF;

    SELECT COUNT(*), COALESCE(SUM(amount), 0)::numeric(12,2)
      INTO v_allocation_count, v_allocation_total
      FROM receipt_allocations
     WHERE receipt_id = v_receipt_id;
    IF v_allocation_count = 0 OR ABS(v_allocation_total - rec.amount) > 0.005 THEN
      RAISE EXCEPTION 'Corrected receipt % has invalid allocations', rec.new_ref;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM receipt_allocations ra
       WHERE ra.receipt_id = v_receipt_id
         AND (SELECT COUNT(*)
                FROM payments p
               WHERE p.receipt_allocation_id = ra.id
                 AND p.amount_paid = ra.amount
                 AND p.payment_reference = rec.new_ref) <> 1
    ) THEN
      RAISE EXCEPTION 'Corrected receipt % has an invalid linked payment reference', rec.new_ref;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM journal_entry_lines jel
       WHERE jel.journal_entry_id = v_journal_id
       GROUP BY jel.journal_entry_id
      HAVING SUM(jel.debit_amount) = rec.amount
         AND SUM(jel.credit_amount) = rec.amount
         AND COUNT(*) FILTER (
               WHERE jel.account_code = 'BANK_PBB'
                 AND jel.debit_amount = rec.amount
                 AND jel.credit_amount = 0
                 AND jel.cheque_reference = rec.cheque_ref
             ) = 1
    ) THEN
      RAISE EXCEPTION 'Corrected receipt % has an invalid bank/cheque journal line', rec.new_ref;
    END IF;
  END LOOP;
END $$;

-- --- Manual journal visible references: PCE### -> PV### (legacy print) ---
UPDATE journal_entries
   SET display_reference = 'PV' || substring(reference_no FROM '^PCE(\d+/\d+)$'),
       updated_at = NOW()
 WHERE reference_no ~ '^PCE\d+/\d+$'
   AND reference_no ~ '^PCE00[1-8]/06$'
   AND entry_date >= DATE '2026-06-01' AND entry_date < DATE '2026-07-01'
   AND (display_reference IS NULL OR display_reference = reference_no OR display_reference ~ '^PCE');

-- --- Manual PBE001/06: legacy bank clears it on 04/06 (keyed 01/06) ---
UPDATE journal_entries
   SET entry_date = DATE '2026-06-04', updated_at = NOW()
 WHERE entry_date = DATE '2026-06-01'
   AND entry_type = 'B'
   AND status = 'posted'
   AND total_credit = 1316.00
   AND reference_no = 'PBE001/06';

DO $$
DECLARE
  v_seq INTEGER;
  v_pv_count INTEGER;
  v_pbe_count INTEGER;
BEGIN
  FOR v_seq IN 1..8 LOOP
    SELECT COUNT(*) INTO v_pv_count
      FROM journal_entries
     WHERE reference_no = 'PCE' || LPAD(v_seq::text, 3, '0') || '/06'
       AND display_reference = 'PV' || LPAD(v_seq::text, 3, '0') || '/06'
       AND entry_type = 'C'
       AND status = 'posted'
       AND entry_date >= DATE '2026-06-01' AND entry_date < DATE '2026-07-01';
    IF v_pv_count <> 1 THEN
      RAISE EXCEPTION 'Expected one corrected PCE%/06 journal, found %',
        LPAD(v_seq::text, 3, '0'), v_pv_count;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_pbe_count
    FROM journal_entries
   WHERE reference_no = 'PBE001/06' AND entry_type = 'B'
     AND entry_date = DATE '2026-06-04' AND status = 'posted'
     AND total_credit = 1316.00;
  IF v_pbe_count <> 1 THEN
    RAISE EXCEPTION 'Expected one corrected PBE001/06 journal, found %', v_pbe_count;
  END IF;
END $$;

COMMIT;

SELECT 'reference fixes applied' AS status;

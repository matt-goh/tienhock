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
    SELECT * INTO r FROM receipts
     WHERE display_reference = rec.old_ref AND total_amount = rec.amount AND status = 'posted'
     LIMIT 1;
    IF r.id IS NULL THEN CONTINUE; END IF; -- already fixed (or swapped pair handled)
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

-- --- Manual journal visible references: PCE### -> PV### (legacy print) ---
UPDATE journal_entries
   SET display_reference = 'PV' || substring(reference_no FROM '^PCE(\d+/\d+)$'),
       updated_at = NOW()
 WHERE reference_no ~ '^PCE\d+/\d+$'
   AND entry_date >= DATE '2026-06-01' AND entry_date < DATE '2026-07-01'
   AND (display_reference IS NULL OR display_reference = reference_no OR display_reference ~ '^PCE');

-- --- Manual PBE001/06: legacy bank clears it on 04/06 (keyed 01/06) ---
UPDATE journal_entries
   SET entry_date = DATE '2026-06-04', updated_at = NOW()
 WHERE entry_date = DATE '2026-06-01'
   AND status = 'posted'
   AND total_credit = 1316.00
   AND (display_reference = 'PBE001/06' OR reference_no = 'PBE001/06');

COMMIT;

SELECT 'reference fixes applied' AS status;

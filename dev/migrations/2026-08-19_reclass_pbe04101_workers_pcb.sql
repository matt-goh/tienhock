-- Reclass PBE041/01 workers' PCB from ACD_PCB to ACW_PCB (2026-08-19)
--
-- Background: legacy journal 4204 (PBE041/01, 13/01/2026, LHDN-PCB(12/2025),
-- immutable IMP import) keyed BOTH the directors' RM124.65 and the workers'
-- RM5,785.25 into ACD_PCB (ACCRUAL (DIRECTORS' PCB PAYABLE)). Every other
-- month (PBE038/02, PBE032/03, PBE035/04, PBE031/05) keyed the workers' PCB
-- to ACW_PCB (ACCRUAL (PCB PAYABLES)) -- January is the only mis-keying, and
-- the error exists in the legacy source data itself (import_legacy_rows
-- stage_sequence 27 confirms the source row says ACD_PCB).
--
-- The imported journal is immutable by design and inside the locked
-- pre-2026-06-01 period, so -- at Helen's instruction (approved via WhatsApp
-- 2026-08-19) -- the fix is a reclassification journal dated 31/08/2026,
-- mirroring her own JV2608-10 (DR ACW_PCB / CR ACD_PCB 1,446.35 for the
-- 03/2024 director & workers PCB amendment).
--
-- Journal: JV2608-12, entry_type J, 31/08/2026, posted
--   DR ACW_PCB 5,785.25
--   CR ACD_PCB 5,785.25
--
-- Guarded, idempotent, fail-closed, single transaction. No imported row is
-- modified; source data, staging and hash-pinned provenance are untouched.

BEGIN;

DO $$
DECLARE
  v_journal_id INTEGER;
  v_ref CONSTANT TEXT := 'JV2608-12';
BEGIN
  -- Idempotency: already applied -> no-op
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_no = v_ref) THEN
    RAISE NOTICE 'Journal % already exists; skipping.', v_ref;
    RETURN;
  END IF;

  -- Guard 1: the source journal is the expected immutable legacy import
  PERFORM 1 FROM journal_entries
  WHERE id = 4204
    AND reference_no = 'IMP-20260113-0001'
    AND display_reference = 'PBE041/01'
    AND entry_type = 'IMP'
    AND source_type = 'legacy_import'
    AND entry_date = DATE '2026-01-13'
    AND status = 'posted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal 4204 is not the expected posted PBE041/01 legacy import; aborting.';
  END IF;

  -- Guard 2: line 2 is still the mis-keyed ACD_PCB 5,785.25 debit
  PERFORM 1 FROM journal_entry_lines
  WHERE journal_entry_id = 4204
    AND line_number = 2
    AND account_code = 'ACD_PCB'
    AND debit_amount = 5785.25
    AND credit_amount = 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal 4204 line 2 is no longer ACD_PCB DR 5,785.25; aborting.';
  END IF;

  -- Guard 3: target accounts exist and are active
  PERFORM 1 FROM account_codes WHERE code = 'ACW_PCB' AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account ACW_PCB missing or inactive; aborting.';
  END IF;
  PERFORM 1 FROM account_codes WHERE code = 'ACD_PCB' AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account ACD_PCB missing or inactive; aborting.';
  END IF;

  INSERT INTO journal_entries (
    reference_no, entry_type, entry_date, description,
    total_debit, total_credit, status,
    created_at, updated_at, created_by, updated_by,
    posted_at, posted_by
  ) VALUES (
    v_ref, 'J', DATE '2026-08-31',
    'RECLASS PBE041/01 (13/01/2026) LHDN-PCB(12/2025) - WORKERS'' PCB FROM ACD_PCB TO ACW_PCB',
    5785.25, 5785.25, 'posted',
    now(), now(), 'HELEN', 'HELEN',
    now(), 'HELEN'
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id, line_number, account_code,
    debit_amount, credit_amount, reference, particulars
  ) VALUES
    (v_journal_id, 1, 'ACW_PCB', 5785.25, 0, '',
     'RECLASS PBE041/01 LHDN-PCB(12/2025) - WORKERS'' PCB'),
    (v_journal_id, 2, 'ACD_PCB', 0, 5785.25, '',
     'RECLASS PBE041/01 LHDN-PCB(12/2025) - WORKERS'' PCB');

  -- Post-check: journal is balanced
  PERFORM 1 FROM journal_entries
  WHERE id = v_journal_id AND total_debit = total_credit AND total_debit = 5785.25;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inserted journal % is unbalanced; aborting.', v_ref;
  END IF;

  RAISE NOTICE 'Inserted reclassification journal % (id %).', v_ref, v_journal_id;
END $$;

COMMIT;

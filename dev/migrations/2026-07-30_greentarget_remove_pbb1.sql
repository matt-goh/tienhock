-- dev/migrations/2026-07-30_greentarget_remove_pbb1.sql
--
-- Remove the dormant duplicate bank account PBB1 from the Green Target chart.
-- PBB_1 is the correct, active account (594 journal lines, opening anchor
-- 19,797.31). PBB1 is a G3-seeded lookalike with the identical description
-- ("PBB-A/C:3137836814 (BW)"), ZERO journal lines and a single 0.00 opening
-- fence, so removing it changes no balance, no report total and the opening
-- anchor set still sums to exactly 0.00. The legacy import is untouched:
-- no staging row, journal or anchor with a non-zero amount is modified.
--
-- User-directed correction, 2026-07-30. Guarded, fail-closed, one transaction.
--
-- NOTE: a rerun of the historical G3 chart load would re-create PBB1 via
-- ON CONFLICT DO NOTHING. Do not rerun the G3 load after this removal; the
-- verifiers (verify-chart.mjs / verify-import.mjs) record PBB1 as an approved
-- removal instead.

BEGIN;

DO $$
DECLARE
  v_account greentarget.account_codes%ROWTYPE;
  v_anchor_count integer;
  v_anchor_sum numeric;
  v_line_count integer;
  v_child_count integer;
BEGIN
  SELECT * INTO v_account
  FROM greentarget.account_codes
  WHERE code = 'PBB1';

  IF NOT FOUND THEN
    RAISE NOTICE 'PBB1 already removed - nothing to do';
    RETURN;
  END IF;

  IF v_account.is_system THEN
    RAISE EXCEPTION 'PBB1 is a system account - refusing to remove';
  END IF;

  SELECT COUNT(*) INTO v_child_count
  FROM greentarget.account_codes
  WHERE parent_code = 'PBB1';
  IF v_child_count > 0 THEN
    RAISE EXCEPTION 'PBB1 has % child account(s) - refusing to remove', v_child_count;
  END IF;

  SELECT COUNT(*) INTO v_line_count
  FROM greentarget.journal_entry_lines
  WHERE account_code = 'PBB1';
  IF v_line_count > 0 THEN
    RAISE EXCEPTION 'PBB1 has % journal line(s) - refusing to remove', v_line_count;
  END IF;

  -- Only a zero opening fence may be removed. Any non-zero anchor means the
  -- account carries real balance history and must stay.
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_anchor_count, v_anchor_sum
  FROM greentarget.account_opening_balances
  WHERE account_code = 'PBB1';
  IF v_anchor_count > 1 OR v_anchor_sum <> 0 THEN
    RAISE EXCEPTION 'PBB1 has non-zero or multiple opening anchors (% row(s), sum %) - refusing to remove',
      v_anchor_count, v_anchor_sum;
  END IF;
END $$;

-- Idempotent deletes: no rows match when PBB1 was already removed.
DELETE FROM greentarget.account_opening_balances
WHERE account_code = 'PBB1' AND amount = 0;

DELETE FROM greentarget.account_codes
WHERE code = 'PBB1'
  AND is_system = false
  AND NOT EXISTS (
    SELECT 1 FROM greentarget.journal_entry_lines
    WHERE account_code = 'PBB1'
  )
  AND NOT EXISTS (
    SELECT 1 FROM greentarget.account_codes children
    WHERE children.parent_code = 'PBB1'
  )
  AND NOT EXISTS (
    SELECT 1 FROM greentarget.account_opening_balances
    WHERE account_code = 'PBB1' AND amount <> 0
  );

-- Post-check: the opening anchor set must still balance to exactly 0.00.
DO $$
DECLARE
  v_sum numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM greentarget.account_opening_balances;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'Opening anchor set no longer balances to zero (sum %) - aborting', v_sum;
  END IF;
END $$;

COMMIT;

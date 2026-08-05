-- 2026-08-05: PCE002/06 — reclassify the incentives/AL settlement lines from ACWJ_SAL to ACW_SAL.
--
-- June 2026 TB reconciliation (boss-annotated CORRECTED_JUNE_TRIAL_BALANCE.pdf; full narrative in
-- docs/Account/ACCOUNTING_PROGRESS.md §7). The manual C journal PCE002/06 (display PV002/06,
-- 10/06/2026, "CLAIM BILL/DRAWING WORKERS/SALARY WORKERS (05/2026)/INCENTIVES WORKERS(06/2026)/
-- AL WORKERS(06/2026)") debited two settlement lines to ACWJ_SAL ("ACCRUAL THJ (SALARY
-- PAYABLES)"):
--   DR ACWJ_SAL 3,110.48  INCENTIVES WORKERS(06/2026)
--   DR ACWJ_SAL   349.52  ANNUAL LEAVE WORKRS(06/2026)
-- ACWJ_SAL is an account no voucher ever accrues to (no location_account_mappings row, no other
-- journal line in the database), so these debits created a spurious 3,460.00 DR balance. The
-- legacy program settled the same two items against ACW_SAL (its June TB: ACWJ_SAL 0.00,
-- ACW_SAL 59,027.75 CR). Moving the two lines makes both accounts match legacy exactly and drops
-- the June TB totals from 17,109,996.00 to 17,106,536.00 per side (legacy final: 17,106,340.87;
-- remaining 195.13/side residual is tracked separately in §7).
--
-- Guarded, idempotent, fail-closed. Safe to rerun: prints ALREADY FINAL and changes nothing.
-- Data correction only — no schema change.

BEGIN;

DO $$
DECLARE
  j_id INTEGER;
  line_ids INTEGER[];
  remaining INTEGER;
BEGIN
  -- Locate the journal and pin its identity (fail-closed).
  SELECT id INTO j_id FROM journal_entries WHERE reference_no = 'PCE002/06';
  IF j_id IS NULL THEN
    RAISE EXCEPTION 'journal PCE002/06 not found — aborting';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE id = j_id AND entry_type = 'C' AND status = 'posted'
      AND entry_date = '2026-06-10' AND source_type IS NULL
  ) THEN
    RAISE EXCEPTION 'journal % is not the expected posted source-less C entry dated 2026-06-10 — aborting', j_id;
  END IF;

  -- Idempotency: nothing left on ACWJ_SAL => already applied (or fixed via the UI).
  IF NOT EXISTS (
    SELECT 1 FROM journal_entry_lines
    WHERE journal_entry_id = j_id AND account_code = 'ACWJ_SAL'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM journal_entry_lines
      WHERE journal_entry_id = j_id AND account_code = 'ACW_SAL'
        AND debit_amount = 3110.48 AND particulars LIKE 'INCENTIVES WORKERS%'
    ) AND EXISTS (
      SELECT 1 FROM journal_entry_lines
      WHERE journal_entry_id = j_id AND account_code = 'ACW_SAL'
        AND debit_amount = 349.52 AND particulars LIKE 'ANNUAL LEAVE WORKRS%'
    ) THEN
      RAISE NOTICE 'ALREADY FINAL: both lines are on ACW_SAL — no changes made';
      RETURN;
    END IF;
    RAISE EXCEPTION 'no ACWJ_SAL lines on journal % but the expected ACW_SAL lines are missing too — investigate manually', j_id;
  END IF;

  -- Row-level guards: exactly the two evidenced lines may exist on ACWJ_SAL (amount + particulars),
  -- and ACWJ_SAL must carry no other posted line anywhere in the database.
  SELECT array_agg(id) INTO line_ids
  FROM journal_entry_lines
  WHERE journal_entry_id = j_id AND account_code = 'ACWJ_SAL'
    AND ((debit_amount = 3110.48 AND particulars LIKE 'INCENTIVES WORKERS%')
      OR (debit_amount = 349.52 AND particulars LIKE 'ANNUAL LEAVE WORKRS%'));
  IF line_ids IS NULL OR array_length(line_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'expected exactly the two evidenced ACWJ_SAL lines (3110.48 / 349.52) on journal % — aborting', j_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM journal_entry_lines
    WHERE account_code = 'ACWJ_SAL' AND id <> ALL (line_ids)
  ) THEN
    RAISE EXCEPTION 'ACWJ_SAL carries unexpected extra lines outside journal % — aborting', j_id;
  END IF;

  UPDATE journal_entry_lines SET account_code = 'ACW_SAL' WHERE id = ANY (line_ids);
  RAISE NOTICE 'reclassified % lines from ACWJ_SAL to ACW_SAL on journal %', array_length(line_ids, 1), j_id;

  SELECT COUNT(*) INTO remaining FROM journal_entry_lines WHERE account_code = 'ACWJ_SAL';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'post-check failed: % ACWJ_SAL lines remain', remaining;
  END IF;
END $$;

-- Informational: resulting 2026-06-30 trial-balance balances (report anchor semantics).
-- Expected after the fix: ACWJ_SAL 0.00, ACW_SAL -59,027.75 (CR) — both exactly the legacy June TB.
WITH latest_anchors AS (
  SELECT DISTINCT ON (aob.account_code) aob.account_code, aob.as_of_date, aob.amount
  FROM account_opening_balances aob
  WHERE aob.as_of_date <= '2026-06-30'::date
  ORDER BY aob.account_code, aob.as_of_date DESC
),
ap AS (
  SELECT ac.code, la.amount AS anchor, COALESCE(la.as_of_date, '2026-01-01'::date) AS ms
  FROM account_codes ac
  LEFT JOIN latest_anchors la ON la.account_code = ac.code
  WHERE ac.code IN ('ACWJ_SAL', 'ACW_SAL')
),
mv AS (
  SELECT ap.code, SUM(jel.debit_amount - jel.credit_amount) AS net
  FROM ap
  JOIN journal_entry_lines jel ON jel.account_code = ap.code
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.status = 'posted' AND je.entry_date >= ap.ms AND je.entry_date <= '2026-06-30'::date
  GROUP BY ap.code
)
SELECT ap.code, COALESCE(ap.anchor, 0) + COALESCE(mv.net, 0) AS bal_jun30
FROM ap LEFT JOIN mv ON mv.code = ap.code
ORDER BY ap.code;

COMMIT;

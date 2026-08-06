-- 2026-08-05: June 2026 legacy reclassification — SAFE SCOPE ONLY.
--
-- Design: docs/Account/JUNE_RECLASS_DESIGN.md (Phase 1). Our June 2026 manual cash/bank voucher
-- lines were keyed to different expense accounts than the legacy program's. This migration applies
-- the 14 fixture-verified account_code moves plus amount edits E8–E11 so our June movements match
-- the legacy June ledger detail (dev/import/legacy-june-tb/june-2026-legacy-ledgers.json).
--
-- DELIBERATELY EXCLUDED (design §b invariant table + §d.1): amount edits E1–E7 on PCE004/06 net
-- +0.38 and may only be applied together with the pending MRM (−0.32) / MGT (−0.06) offsets, which
-- need the coworker's legacy June ledger detail for MRM (REPAIR AND MAINTENANCE (MEE)) and MGT
-- (REPAIR & MAINTENANCE (MENGGATAL)). Applying them without the offsets would unbalance PCE004/06
-- (and hence CASH) by 0.38. They land in a follow-up migration once the evidence arrives.
--
-- All 18 touched lines sit on manual, source-less, posted C/B journals dated June 2026 — outside
-- the 2026-06-01 period lock, manual_override stays false, nothing detaches. Moves change only
-- account_code; edits E8–E11 net 0.00 per journal (PCE008/06: +0.05/−0.05; PBE054/06: −100/+100),
-- so every journal's totals and the June TB grand totals are unchanged. No credit line is touched.
--
-- Guarded, idempotent, fail-closed. Safe to rerun: lines already in final state are skipped and
-- the post-assertions re-verify the end state. Run with: psql -v ON_ERROR_STOP=1
-- Lines are resolved by (journal reference, account, amount, particulars) — not by dev jel.id —
-- so the same file applies to production (dev ids noted in comments for provenance only).
-- Data correction only — no schema change.

BEGIN;

-- Capture the five journals' header totals before any change (post-migration invariant).
CREATE TEMP TABLE _jr_totals_before ON COMMIT DROP AS
SELECT je.id, je.reference_no, je.total_debit, je.total_credit
FROM journal_entries je
WHERE je.reference_no IN ('PCE002/06', 'PCE004/06', 'PCE007/06', 'PCE008/06', 'PBE054/06');

DO $$
DECLARE
  m RECORD;
  e RECORD;
  lid INTEGER;
  final_cnt INTEGER;
  orig_cnt INTEGER;
  moved INTEGER := 0;
  edited INTEGER := 0;
BEGIN
  -- Journal identity guards (fail-closed): posted, source-less, not detached, expected June date.
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_no = 'PCE002/06' AND entry_type = 'C' AND status = 'posted' AND source_type IS NULL AND manual_override = false AND entry_date = '2026-06-10') THEN
    RAISE EXCEPTION 'PCE002/06 is not the expected posted source-less C entry dated 2026-06-10 — aborting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_no = 'PCE004/06' AND entry_type = 'C' AND status = 'posted' AND source_type IS NULL AND manual_override = false AND entry_date = '2026-06-10') THEN
    RAISE EXCEPTION 'PCE004/06 is not the expected posted source-less C entry dated 2026-06-10 — aborting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_no = 'PCE007/06' AND entry_type = 'C' AND status = 'posted' AND source_type IS NULL AND manual_override = false AND entry_date = '2026-06-23') THEN
    RAISE EXCEPTION 'PCE007/06 is not the expected posted source-less C entry dated 2026-06-23 — aborting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_no = 'PCE008/06' AND entry_type = 'C' AND status = 'posted' AND source_type IS NULL AND manual_override = false AND entry_date = '2026-06-30') THEN
    RAISE EXCEPTION 'PCE008/06 is not the expected posted source-less C entry dated 2026-06-30 — aborting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_no = 'PBE054/06' AND entry_type = 'B' AND status = 'posted' AND source_type IS NULL AND manual_override = false AND entry_date = '2026-06-25') THEN
    RAISE EXCEPTION 'PBE054/06 is not the expected posted source-less B entry dated 2026-06-25 — aborting';
  END IF;

  -- The 14 account_code moves (design §b table; dev jel.id in trailing comment).
  FOR m IN
    SELECT * FROM (VALUES
      ('PCE004/06', 'MBOR',    'BRM',     482.31::numeric, 'TAOBAO-JING XIAN YOU%'),                        -- jel 7779
      ('PCE004/06', 'MBOR',    'MBC',       5.50,          'EMART (SABAH) S/B #LJP08202603240094%'),        -- jel 7668
      ('PCE004/06', 'MBSM_K',  'MBC',      40.00,          'KFC LINTAS JAYA BOULEVARD%'),                   -- jel 7696
      ('PCE004/06', 'MBSM_K',  'MBOR',     29.00,          'MARKET -400256%'),                              -- jel 7760
      ('PCE008/06', 'MBSM_K',  'MBOR',     12.90,          'MIX STORE #79002112261660070037%'),             -- jel 21055
      ('PCE004/06', 'MBSM_O',  'MBSM_K',   26.50,          'HO KEE HAINANESE CHICKEN RICE%'),               -- jel 7689
      ('PCE007/06', 'MBSM_K',  'MBSM_O',  107.70,          'ORIENTAL COFFEE (KL) S/B #SS04/06180%'),        -- jel 8017
      ('PCE008/06', 'MBRM',    'MBRMF',   400.00,          'HV ELECTRICAL S/B #CS-260600975%'),             -- jel 21051
      ('PCE002/06', 'OIL9698', 'R9698',    23.00,          'KK SEAL ENTERPRISE S/B #CSA-21897%'),           -- jel 5993
      ('PCE002/06', 'OIL9698', 'R9698',   100.00,          'DIGNITY BRAND S/B #CS-D081338%'),               -- jel 5994
      ('PCE004/06', 'OIL9698', 'OIL6323',  30.00,          'SHELL BUNDUSAN SERVICE STATION #01001886%'),    -- jel 7731
      ('PCE008/06', 'OIL9882', 'OIL9922',  80.00,          'SHELL SYT. EXCEL SERVICE #01003038%'),          -- jel 21038
      ('PCE007/06', 'OILOTH',  'OIL920',   40.00,          'SHELL BUNDUSAN SERVICE STATION #01002075%'),    -- jel 8016
      ('PCE004/06', 'BRM',     'MRM',       9.05,          'TAOBAO-SHUANG MEI HARDWARE%')                   -- jel 7780
    ) AS v(jref, from_acct, to_acct, amount, pat)
  LOOP
    SELECT COUNT(*) INTO final_cnt
    FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.reference_no = m.jref AND jel.account_code = m.to_acct
      AND jel.debit_amount = m.amount AND jel.particulars LIKE m.pat;
    SELECT COUNT(*) INTO orig_cnt
    FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.reference_no = m.jref AND jel.account_code = m.from_acct
      AND jel.debit_amount = m.amount AND jel.particulars LIKE m.pat;

    IF final_cnt = 1 AND orig_cnt = 0 THEN
      CONTINUE; -- already moved (idempotent rerun)
    END IF;
    IF final_cnt = 0 AND orig_cnt = 1 THEN
      UPDATE journal_entry_lines jel SET account_code = m.to_acct
      FROM journal_entries je
      WHERE je.id = jel.journal_entry_id AND je.reference_no = m.jref
        AND jel.account_code = m.from_acct AND jel.debit_amount = m.amount
        AND jel.particulars LIKE m.pat;
      moved := moved + 1;
      CONTINUE;
    END IF;
    RAISE EXCEPTION 'move guard failed for % % -> % % (%): final=% original=% — aborting',
      m.jref, m.from_acct, m.to_acct, m.amount, m.pat, final_cnt, orig_cnt;
  END LOOP;

  -- Amount edits E8–E11 (design §b; E1–E7 excluded, see header). Each pair nets 0.00 per journal.
  FOR e IN
    SELECT * FROM (VALUES
      ('PCE008/06', 'MBRM',    43.85::numeric,  43.90, 'TAOBAO-GU DE LI QI HANG%'),                          -- E8, jel 21042
      ('PCE008/06', 'MBRM',   629.50,          629.45, 'TAOBAO-HANG ZHOU JIN XIN%'),                         -- E9, jel 21047
      ('PBE054/06', 'MBRMF',  565.00,          465.00, 'PAUMIN HARDWARE S/B #2606-2133-23/06/2026 (CUTTING DISC%'), -- E10, jel 20956
      ('PBE054/06', 'MBSAF',  144.00,          244.00, 'PAUMIN HARDWARE S/B #2606-2133-23/06/2026 (BATIK%')  -- E11, jel 20955
    ) AS v(jref, acct, old_amount, new_amount, pat)
  LOOP
    SELECT COUNT(*) INTO final_cnt
    FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.reference_no = e.jref AND jel.account_code = e.acct
      AND jel.debit_amount = e.new_amount AND jel.particulars LIKE e.pat;
    SELECT COUNT(*) INTO orig_cnt
    FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.reference_no = e.jref AND jel.account_code = e.acct
      AND jel.debit_amount = e.old_amount AND jel.particulars LIKE e.pat;

    IF final_cnt = 1 AND orig_cnt = 0 THEN
      CONTINUE; -- already edited (idempotent rerun)
    END IF;
    IF final_cnt = 0 AND orig_cnt = 1 THEN
      UPDATE journal_entry_lines jel SET debit_amount = e.new_amount
      FROM journal_entries je
      WHERE je.id = jel.journal_entry_id AND je.reference_no = e.jref
        AND jel.account_code = e.acct AND jel.debit_amount = e.old_amount
        AND jel.credit_amount = 0 AND jel.particulars LIKE e.pat;
      edited := edited + 1;
      CONTINUE;
    END IF;
    RAISE EXCEPTION 'edit guard failed for % % % -> % (%): final=% original=% — aborting',
      e.jref, e.acct, e.old_amount, e.new_amount, e.pat, final_cnt, orig_cnt;
  END LOOP;

  IF moved = 0 AND edited = 0 THEN
    RAISE NOTICE 'ALREADY FINAL: all 14 moves and 4 amount edits already applied — no changes made';
  ELSE
    RAISE NOTICE 'applied % account moves and % amount edits', moved, edited;
  END IF;
END $$;

-- Post-assertion 1: every touched journal's header totals are unchanged and still foot to its lines.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT je.reference_no, je.total_debit, je.total_credit,
           tb.total_debit AS before_dr, tb.total_credit AS before_cr,
           (SELECT ROUND(SUM(debit_amount), 2) FROM journal_entry_lines WHERE journal_entry_id = je.id) AS sum_dr,
           (SELECT ROUND(SUM(credit_amount), 2) FROM journal_entry_lines WHERE journal_entry_id = je.id) AS sum_cr
    FROM journal_entries je JOIN _jr_totals_before tb ON tb.id = je.id
  LOOP
    IF r.total_debit <> r.before_dr OR r.total_credit <> r.before_cr THEN
      RAISE EXCEPTION 'journal % header totals changed (%/% -> %/%) — aborting',
        r.reference_no, r.before_dr, r.before_cr, r.total_debit, r.total_credit;
    END IF;
    IF r.sum_dr <> r.total_debit OR r.sum_cr <> r.total_credit THEN
      RAISE EXCEPTION 'journal % lines no longer foot to header (%/% vs %/%) — aborting',
        r.reference_no, r.sum_dr, r.sum_cr, r.total_debit, r.total_credit;
    END IF;
  END LOOP;
END $$;

-- Post-assertion 2: per-account June 2026 movement equals the safe-scope expected values
-- (design §c minus the pending E1–E7 / MRM / MGT deltas, noted inline). Controls included.
DO $$
DECLARE
  r RECORD;
  bad TEXT := '';
BEGIN
  FOR r IN
    WITH expected(account_code, expected_move) AS (VALUES
      ('BRM',      1413.74::numeric),  -- legacy final 1,413.74 — ties exactly
      ('MBC',       959.05),           -- pending E1 +0.05 -> 959.10
      ('MBOR',     1598.80),           -- ties exactly
      ('MBRM',     1811.00),           -- pending E2 -0.05 -> 1,810.95
      ('MBRMF',    5035.60),           -- ties exactly
      ('MBSAF',    1429.56),           -- pending E3 -0.01 -> 1,429.55
      ('MBSM_K',   3086.10),           -- pending E4 +0.40 / E5 -0.01 -> 3,086.49
      ('MBSM_O',   2251.70),           -- ties exactly
      ('OIL6323',   370.35),           -- ties exactly
      ('OIL9698',   315.50),           -- ties exactly
      ('OIL9882',   282.15),           -- ties exactly
      ('OIL920',     40.00),           -- ties exactly
      ('OIL9922',   619.48),           -- ties exactly
      ('OILOTH',    450.00),           -- ties exactly
      ('R9698',     623.00),           -- ties exactly
      ('MRM',      3295.14),           -- pending -0.32 -> 3,294.82 (§d.1)
      ('MGT',      8908.08),           -- pending -0.06 -> 8,908.02 (§d.1)
      -- untouched controls (design §c global assertion i)
      ('OIL9897',   530.00),
      ('OILFORK',   172.00),
      ('OILHT15',   346.00),
      ('OILHT18',   308.00),
      ('R9922',     562.00),
      ('ROTH',     1907.00),
      ('RBFORK',    415.00)
    ),
    actual AS (
      SELECT jel.account_code, ROUND(SUM(jel.debit_amount - jel.credit_amount), 2) AS move
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.status = 'posted'
        AND je.entry_date >= '2026-06-01' AND je.entry_date <= '2026-06-30'
        AND jel.account_code IN (SELECT account_code FROM expected)
      GROUP BY jel.account_code
    )
    SELECT e.account_code, e.expected_move, COALESCE(a.move, 0) AS actual_move
    FROM expected e LEFT JOIN actual a ON a.account_code = e.account_code
  LOOP
    IF r.actual_move <> r.expected_move THEN
      bad := bad || format('%s expected %s got %s; ', r.account_code, r.expected_move, r.actual_move);
    END IF;
  END LOOP;
  IF bad <> '' THEN
    RAISE EXCEPTION 'post-move June movement assertion failed: %', bad;
  END IF;
  RAISE NOTICE 'post-move assertions passed: 24 accounts at expected June movement';
END $$;

-- Informational: resulting June 2026 movement + 2026-06-30 YTD balance (report anchor semantics)
-- vs the legacy printed June YTD. Accounts marked <-- PENDING still need the follow-up E1–E7 /
-- MRM / MGT migration (design §d.1) before they tie to legacy to the cent.
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
  WHERE ac.code IN ('BRM','MBC','MBOR','MBRM','MBRMF','MBSAF','MBSM_K','MBSM_O',
                    'OIL6323','OIL9698','OIL9882','OIL920','OIL9922','OILOTH','R9698','MRM','MGT')
),
mv AS (
  SELECT ap.code,
         SUM(jel.debit_amount - jel.credit_amount) FILTER (WHERE je.entry_date >= '2026-06-01') AS june_move,
         SUM(jel.debit_amount - jel.credit_amount) AS net_since_anchor
  FROM ap
  JOIN journal_entry_lines jel ON jel.account_code = ap.code
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.status = 'posted' AND je.entry_date >= ap.ms AND je.entry_date <= '2026-06-30'::date
  GROUP BY ap.code
)
SELECT ap.code,
       ROUND(COALESCE(mv.june_move, 0), 2) AS june_movement,
       ROUND(COALESCE(ap.anchor, 0) + COALESCE(mv.net_since_anchor, 0), 2) AS ytd_jun30
FROM ap LEFT JOIN mv ON mv.code = ap.code
ORDER BY ap.code;

COMMIT;

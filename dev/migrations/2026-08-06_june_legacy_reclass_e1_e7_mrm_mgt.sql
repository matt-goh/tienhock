-- 2026-08-06: June 2026 legacy reclassification — FOLLOW-UP: E1–E7 + MRM/MGT offsets.
--
-- Design: docs/Account/JUNE_RECLASS_DESIGN.md (Phase 1), §b invariant table + §d.1. The first
-- migration (2026-08-05_june_legacy_reclass.sql) applied the 14 account_code moves and edits
-- E8–E11 but DELIBERATELY excluded E1–E7 on PCE004/06 because they net +0.38 and would have
-- unbalanced the voucher (and hence CASH) without the pending MRM (−0.32) / MGT (−0.06) offsets.
--
-- The offsets are now confirmed by the coworker's legacy June ledger detail for MRM (REPAIR AND
-- MAINTENANCE (MEE)) and MGT (REPAIR & MAINTENANCE (MENGGATAL)) — JUNE_MRM&MGT.pdf (repo root,
-- printed 06 AUG 2026), every digit re-verified at full raster fidelity:
--   MRM PV004/06: HU HAO FLAGSHIP 21.25 (dev 21.29) · SHUANG MEI HARDWARE #511494253448 89.12
--                 (dev 89.10) · FOSHAN NAN FANG 22.65 (dev 23.00)
--   MRM PV008/06: ZHE JIANG SHEN HONG 24.60 (dev 24.55)
--   MGT PV004/06: ZHI CHENG ZHOU CHENG 88.20 (dev 88.21)
--   MGT PV008/06: YI HAO QI HANG #51201609508500360 80.45 (dev 80.50)
-- Legacy keyed the SHUANG MEI HARDWARE 9.05 line itself at exactly 9.05 in MRM (particulars match
-- dev's verbatim), so move #14 from the first migration is now fixture-verified and the
-- "8.73 variant" of §d.1 is disproved.
--
-- Journal-total neutrality (the reason these 13 edits must land together):
--   PCE004/06: E1–E7 net +0.38; MRM 21.29→21.25 (−0.04) + 89.10→89.12 (+0.02) + 23.00→22.65
--              (−0.35) + MGT 88.21→88.20 (−0.01) = −0.38. Net 0.00.
--   PCE008/06: MRM 24.55→24.60 (+0.05) + MGT 80.50→80.45 (−0.05) = 0.00.
-- No journal header total changes; every journal's lines still foot; the June TB grand totals
-- stay 17,102,880.87/side.
--
-- All 13 touched lines sit on manual, source-less, posted C journals dated June 2026 — outside
-- the 2026-06-01 period lock, manual_override stays false, nothing detaches. Amount edits only;
-- no account_code move and no credit line is touched.
--
-- Guarded, idempotent, fail-closed. Safe to rerun: lines already in final state are skipped and
-- the post-assertions re-verify the end state. Run with: psql -v ON_ERROR_STOP=1
-- Lines are resolved by (journal reference, account, amount, particulars) — not by dev jel.id —
-- so the same file applies to production (dev ids noted in comments for provenance only).
-- Data correction only — no schema change.

BEGIN;

-- Capture the two journals' header totals before any change (post-migration invariant).
CREATE TEMP TABLE _jr_totals_before ON COMMIT DROP AS
SELECT je.id, je.reference_no, je.total_debit, je.total_credit
FROM journal_entries je
WHERE je.reference_no IN ('PCE004/06', 'PCE008/06');

DO $$
DECLARE
  e RECORD;
  final_cnt INTEGER;
  orig_cnt INTEGER;
  edited INTEGER := 0;
BEGIN
  -- Journal identity guards (fail-closed): posted, source-less, not detached, expected June date.
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_no = 'PCE004/06' AND entry_type = 'C' AND status = 'posted' AND source_type IS NULL AND manual_override = false AND entry_date = '2026-06-10') THEN
    RAISE EXCEPTION 'PCE004/06 is not the expected posted source-less C entry dated 2026-06-10 — aborting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_no = 'PCE008/06' AND entry_type = 'C' AND status = 'posted' AND source_type IS NULL AND manual_override = false AND entry_date = '2026-06-30') THEN
    RAISE EXCEPTION 'PCE008/06 is not the expected posted source-less C entry dated 2026-06-30 — aborting';
  END IF;

  -- Prerequisite guard: the first migration must already be applied (spot-check its final state).
  IF NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.reference_no = 'PCE004/06' AND jel.account_code = 'MRM'
      AND jel.debit_amount = 9.05 AND jel.particulars LIKE 'TAOBAO-SHUANG MEI HARDWARE #511330410139%'
  ) THEN
    RAISE EXCEPTION 'prerequisite 2026-08-05_june_legacy_reclass.sql not applied (move #14 missing) — aborting';
  END IF;

  -- Amount edits E1–E7 (design §b) + the six MRM/MGT offsets (§d.1, now evidenced).
  FOR e IN
    SELECT * FROM (VALUES
      -- E1–E7 on PCE004/06 (net +0.38)
      ('PCE004/06', 'MBC',     46.60::numeric,  46.65, '100% SUPER SHOP #000024%'),                    -- E1, jel 7765
      ('PCE004/06', 'MBRM',    13.60,           13.55, 'TAOBAO - BOZHEN CAR MAINTENANCE TOOLS%'),      -- E2, jel 7806
      ('PCE004/06', 'MBSAF',  160.56,          160.55, 'TAOBAO-WEI ER DUN%'),                          -- E3, jel 7784
      ('PCE004/06', 'MBSM_K',  54.00,           54.40, 'HONG JIA TING #20260428-0243%'),               -- E4, jel 7759
      ('PCE004/06', 'MBSM_K',  19.30,           19.29, 'GRAB-BOWL & SUPERFOOD%'),                      -- E5, jel 7800
      ('PCE004/06', 'BRM',     26.70,           26.71, 'TAOBAO-PIN SHANG MEI SHUO%'),                  -- E6, jel 7788
      ('PCE004/06', 'BRM',    482.31,          482.30, 'TAOBAO-JING XIAN YOU%'),                       -- E7, jel 7779
      -- MRM offsets: −0.32 total (−0.37 on PCE004/06, +0.05 on PCE008/06)
      ('PCE004/06', 'MRM',     21.29,           21.25, 'TAOBAO-HU HAO%'),                              -- jel 7781
      ('PCE004/06', 'MRM',     89.10,           89.12, 'TAOBAO-SHUANG MEI HARDWARE #511494253448%'),   -- jel 7787
      ('PCE004/06', 'MRM',     23.00,           22.65, 'TAOBAO-FOSHAN NAN FANG%'),                     -- jel 7810
      ('PCE008/06', 'MRM',     24.55,           24.60, 'TAOBAO-ZHEN JIANG SHEN HONG%'),                -- jel 21041
      -- MGT offsets: −0.06 total (−0.01 on PCE004/06, −0.05 on PCE008/06)
      ('PCE004/06', 'MGT',     88.21,           88.20, 'TAOBAO-ZHI CHENG ZHOU CHENG #51153347890%'),   -- jel 7785
      ('PCE008/06', 'MGT',     80.50,           80.45, 'TAOBAO-YI HAO QI HANG #5120160950%')           -- jel 21046
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

  IF edited = 0 THEN
    RAISE NOTICE 'ALREADY FINAL: all 13 amount edits already applied — no changes made';
  ELSE
    RAISE NOTICE 'applied % amount edits', edited;
  END IF;
END $$;

-- Post-assertion 1: both journals' header totals are unchanged and still foot to their lines.
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

-- Post-assertion 2: per-account June 2026 movement equals the legacy June movement EXACTLY
-- (design §c final values; controls included). This is the full tie — no PENDING rows remain.
DO $$
DECLARE
  r RECORD;
  bad TEXT := '';
BEGIN
  FOR r IN
    WITH expected(account_code, expected_move) AS (VALUES
      ('BRM',      1413.74::numeric),
      ('MBC',       959.10),
      ('MBOR',     1598.80),
      ('MBRM',     1810.95),
      ('MBRMF',    5035.60),
      ('MBSAF',    1429.55),
      ('MBSM_K',   3086.49),
      ('MBSM_O',   2251.70),
      ('OIL6323',   370.35),
      ('OIL9698',   315.50),
      ('OIL9882',   282.15),
      ('OIL920',     40.00),
      ('OIL9922',   619.48),
      ('OILOTH',    450.00),
      ('R9698',     623.00),
      ('MRM',      3294.82),
      ('MGT',      8908.02),
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
    RAISE EXCEPTION 'post-edit June movement assertion failed: %', bad;
  END IF;
  RAISE NOTICE 'post-edit assertions passed: 24 accounts at exact legacy June movement';
END $$;

-- Post-assertion 3: 2026-06-30 YTD balance per affected account equals the legacy printed June
-- Trial Balance row EXACTLY (report anchor semantics: latest anchor <= 2026-06-30 + posted lines).
DO $$
DECLARE
  r RECORD;
  bad TEXT := '';
BEGIN
  FOR r IN
    WITH latest_anchors AS (
      SELECT DISTINCT ON (aob.account_code) aob.account_code, aob.as_of_date, aob.amount
      FROM account_opening_balances aob
      WHERE aob.as_of_date <= '2026-06-30'::date
      ORDER BY aob.account_code, aob.as_of_date DESC
    ),
    expected(account_code, expected_ytd) AS (VALUES
      ('BRM',     14890.36::numeric),
      ('MBC',      4954.85),
      ('MBOR',     7972.20),
      ('MBRM',     5382.11),
      ('MBRMF',   36069.39),
      ('MBSAF',    9557.01),
      ('MBSM_K',  15794.98),
      ('MBSM_O',  11242.00),
      ('OIL6323',   758.50),
      ('OIL9698',   849.80),
      ('OIL9882',  1212.15),
      ('OIL920',    203.30),
      ('OIL9922',  3813.09),
      ('OILOTH',   8369.40),
      ('R9698',    1870.00),
      ('MRM',     23078.62),
      ('MGT',     28139.45)
    ),
    ap AS (
      SELECT ac.code, la.amount AS anchor, COALESCE(la.as_of_date, '2026-01-01'::date) AS ms
      FROM account_codes ac
      LEFT JOIN latest_anchors la ON la.account_code = ac.code
      WHERE ac.code IN (SELECT account_code FROM expected)
    ),
    mv AS (
      SELECT ap.code, SUM(jel.debit_amount - jel.credit_amount) AS net_since_anchor
      FROM ap
      JOIN journal_entry_lines jel ON jel.account_code = ap.code
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.status = 'posted' AND je.entry_date >= ap.ms AND je.entry_date <= '2026-06-30'::date
      GROUP BY ap.code
    )
    SELECT e.account_code, e.expected_ytd,
           ROUND(COALESCE(ap.anchor, 0) + COALESCE(mv.net_since_anchor, 0), 2) AS actual_ytd
    FROM expected e
    JOIN ap ON ap.code = e.account_code
    LEFT JOIN mv ON mv.code = e.account_code
  LOOP
    IF r.actual_ytd <> r.expected_ytd THEN
      bad := bad || format('%s expected %s got %s; ', r.account_code, r.expected_ytd, r.actual_ytd);
    END IF;
  END LOOP;
  IF bad <> '' THEN
    RAISE EXCEPTION 'post-edit June YTD assertion failed: %', bad;
  END IF;
  RAISE NOTICE 'post-edit assertions passed: 17 accounts tie to legacy printed June YTD';
END $$;

COMMIT;

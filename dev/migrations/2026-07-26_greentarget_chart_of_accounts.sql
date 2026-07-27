-- ============================================================================
-- Green Target chart of accounts - Phase G3
-- Doc: docs/Account/GT_ACCOUNTING_HANDOVER.md (section 9, G3)
--
-- GENERATED FILE - DO NOT EDIT BY HAND.
--   Regenerate: node dev/import/greentarget-legacy/build-chart.mjs
--   Verify:     node dev/import/greentarget-legacy/verify-chart.mjs
-- The 503 rows below are derived from two independently-validated sources:
--   * dev/import/greentarget-report-fixtures/data/gt-tb-2026-{01..06}.csv
--     (G1: the printed chart with each account's APPX note; identical across
--     all six months, 2,838 exact balance comparisons against the ledger)
--   * dev/import/greentarget-legacy/generated/validation-report.json
--     (G0: 502 ledger section chains, 502/502 balance chains walked)
-- A hand-typed chart could not be re-verified against them; this one can.
--
-- WHAT THIS MIGRATION LOADS
--   503 accounts = 473 real GTLD ledger accounts
--                + BTFS   (printed on all six TBs, no ledger section)
--                + DEBTOR (the netted trade-debtor control line)
--                + 28 GTDB debtor children hanging off DEBTOR
--
-- WHAT IT DOES NOT DO
--   * NO journals, NO journal lines, NO opening anchors - that is G4, and this
--     migration asserts those tables are still empty when it finishes.
--   * It touches NO `public` table. GT accounting data is completely isolated
--     from Tien Hock's, and the tail asserts the TH baseline is unmoved.
--
-- THE FOUR DECISIONS ENCODED HERE (full reasoning in the handover, section 9)
--   1. fs_note = the printed Trial Balance APPX, verbatim. The legacy system's
--      per-account note field IS the APPX; the Balance Sheet / Income Statement
--      line notes are a separate statement layout (proved by the IS printing
--      "HIRE PURCHASE INTEREST" with no note at all). This keeps account_codes
--      1:1 with the legacy account master. Consequence, deliberate and
--      documented: notes 17 and 23 carry zero accounts, and the three accounts
--      whose statement placement differs from their APPX - INPUT.TAX, FC TL,
--      FC HP, all .00 in all six months with 0 ledger rows - record that fact
--      in `notes`. G5's note->line mapping MUST NOT assume APPX = statement note.
--   2. DEBTOR is a real is_system TD/22 control account; the 28 GTDB debtors are
--      its parent_code children. That is the only hierarchy GT's chart has, and
--      greentarget.account_codes_hierarchy (a VIEW) surfaces it directly.
--   3. The 28 debtor children are created here, from the GTDB ledger sections
--      (R6: from the ledger, never from greentarget.customers), so G4's journal
--      lines have accounts to FK to and G4 is purely about journals.
--   4. BTFS is carried active under its printed APPX 2-10 with no ledger
--      movement. G4 must give it NO opening anchor - the report engines only
--      surface accounts with an anchor or a posted line, so that absence is
--      what reproduces its blank/blank printing.
--
--   ledger_type rule, keyed on the printed APPX so it is stable under any
--   reading of fs_note:
--      GTDB section -> TD (+ DEBTOR) | APPX 19 -> BK | APPX 13 -> TC | else GL
--   CS/OS remain seeded but unused (R5: GT is a service company, no stock).
--   Distribution: BK 5 / GL 440 / TC 29 / TD 29.
--
-- IDEMPOTENCY
--   ON CONFLICT DO UPDATE ... WHERE the row actually differs, so an unchanged
--   rerun does not even touch updated_at. A second run is an exact no-op.
--   The load is NON-DESTRUCTIVE (R6): it never deletes or renames an existing
--   account. If it finds a GT account that is not in this payload it ABORTS
--   rather than removing it.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guards - assert the world is what we think it is, abort otherwise
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_notes INT;
BEGIN
  IF to_regclass('greentarget.account_codes') IS NULL
     OR to_regclass('greentarget.financial_statement_notes') IS NULL
     OR to_regclass('greentarget.ledger_types') IS NULL THEN
    RAISE EXCEPTION 'G3 guard: the G2 foundation is missing - run 2026-07-26_greentarget_accounting_foundation.sql first';
  END IF;

  SELECT count(*) INTO v_notes FROM greentarget.financial_statement_notes;
  IF v_notes <> 34 THEN
    RAISE EXCEPTION 'G3 guard: expected the 34-note G2 catalogue, found %', v_notes;
  END IF;

  -- The fs_note FOREIGN KEY is the whole point of G2's divergence from TH: an
  -- account whose APPX does not resolve must abort the load, loudly.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_schema = 'greentarget' AND table_name = 'account_codes'
       AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'account_codes_fs_note_fkey'
  ) THEN
    RAISE EXCEPTION 'G3 guard: greentarget.account_codes.fs_note has no FOREIGN KEY - refusing to load a chart that cannot fail loudly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'greentarget' AND table_name = 'account_codes_hierarchy' AND table_type = 'VIEW'
  ) THEN
    RAISE EXCEPTION 'G3 guard: greentarget.account_codes_hierarchy is not a VIEW';
  END IF;
END $$;

-- Snapshot the TH baseline so the tail of this migration can prove it never moved.
CREATE TEMP TABLE g3_th_baseline ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.account_codes)             AS account_codes,
       (SELECT count(*) FROM public.journal_entries)           AS journal_entries,
       (SELECT count(*) FROM public.journal_entry_lines)       AS journal_entry_lines,
       (SELECT count(*) FROM public.financial_statement_notes) AS fs_notes,
       (SELECT count(*) FROM public.account_opening_balances)  AS opening_balances;

-- ---------------------------------------------------------------------------
-- 1. The derived chart, staged so the payload can be checked before it lands
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE g3_chart (
  code        VARCHAR(50)  NOT NULL,
  description VARCHAR(255) NOT NULL,
  ledger_type VARCHAR(10)  NOT NULL,
  parent_code VARCHAR(50),
  level       INT          NOT NULL,
  sort_order  INT          NOT NULL,
  is_system   BOOLEAN      NOT NULL,
  fs_note     VARCHAR(10)  NOT NULL,
  notes       TEXT
) ON COMMIT DROP;

INSERT INTO g3_chart (code, description, ledger_type, parent_code, level, sort_order, is_system, fs_note, notes) VALUES
  ('AC_2010', 'ACCRUAL-2010', 'GL', NULL, 1, 1, FALSE, '1', NULL),
  ('AC_BM', 'BURNING MATERIALS', 'GL', NULL, 1, 2, FALSE, '1', NULL),
  ('AC_DR', 'DIRECTORS'' REMUNERATION', 'GL', NULL, 1, 3, FALSE, '1', NULL),
  ('AC_GST', 'GST', 'GL', NULL, 1, 4, FALSE, '10', NULL),
  ('AC_LN', 'LOAN REPAYMENT', 'GL', NULL, 1, 5, FALSE, '1', NULL),
  ('AC_OIL', 'DIESEL - ACCRUAL', 'GL', NULL, 1, 6, FALSE, '10', NULL),
  ('AC_TM', 'TELEKOM', 'GL', NULL, 1, 7, FALSE, '10', NULL),
  ('ADD', 'ALLOWANCE FOR DOUBTFUL DEBTS', 'GL', NULL, 1, 8, FALSE, '22', 'Allowance for doubtful debts. Carries APPX 22 like the DEBTOR control but is a GL contra account, NOT a member of the debtor subledger - it stays ledger_type GL and outside DEBTOR''s children so it can never distort the debtor control.'),
  ('AMB1', 'AMB-A/C.NO:025-201-2001556 (KB)', 'BK', NULL, 1, 9, FALSE, '19', NULL),
  ('BKAD', 'ADVERTISEMENT (BW/KB)', 'GL', NULL, 1, 10, FALSE, '5', NULL),
  ('BKAR', 'AUDITORS REMUNERATION (BW/KB)', 'GL', NULL, 1, 11, FALSE, '5', NULL),
  ('BKBC', 'BANK CHARGES (BW/KB)', 'GL', NULL, 1, 12, FALSE, '5', NULL),
  ('BKBD', 'BAD DEBT WRITTEN OFF (BW/KB)', 'GL', NULL, 1, 13, FALSE, '5', NULL),
  ('BKBK', 'BOOK KEEPING FEE (BW/KB)', 'GL', NULL, 1, 14, FALSE, '5', NULL),
  ('BKCE', 'CLEANING EXPENSES (BW/KB)', 'GL', NULL, 1, 15, FALSE, '5', NULL),
  ('BKDON', 'DONATIONS (BW/KB)', 'GL', NULL, 1, 16, FALSE, '5', NULL),
  ('BKEN', 'ENTERTAINMENT (BW/KB)', 'GL', NULL, 1, 17, FALSE, '5', NULL),
  ('BKINS', 'INSURANCE (BW/KB)', 'GL', NULL, 1, 18, FALSE, '5', NULL),
  ('BKLC', 'LICENCE FEE (BW/KB)', 'GL', NULL, 1, 19, FALSE, '5', NULL),
  ('BKLP', 'LEGAL AND PROFESSIONAL FEE (BW/KB)', 'GL', NULL, 1, 20, FALSE, '5', NULL),
  ('BKMED', 'MEDICAL FEE (BW/KB)', 'GL', NULL, 1, 21, FALSE, '5', NULL),
  ('BKNEW', 'NEWSPAPER AND PERIODICAL (BW/KB)', 'GL', NULL, 1, 22, FALSE, '5', NULL),
  ('BKOR', 'OFFICE REFRESHMENT (BW/KB)', 'GL', NULL, 1, 23, FALSE, '5', NULL),
  ('BKPEN', 'PENALTY (BW/KB)', 'GL', NULL, 1, 24, FALSE, '5', NULL),
  ('BKPS', 'PRINTING AND STATIONERY (BW/KB)', 'GL', NULL, 1, 25, FALSE, '5', NULL),
  ('BKQR', 'QUARTERS RENTAL (BW/KB)', 'GL', NULL, 1, 26, FALSE, '5', NULL),
  ('BKSA', 'STAFF AMENITIES (BW/KB)', 'GL', NULL, 1, 27, FALSE, '5', NULL),
  ('BKSAF', 'SAFETY AND HEALTH EXP (BW/KB)', 'GL', NULL, 1, 28, FALSE, '5', NULL),
  ('BKSC_KH', 'MAINTENANCE KILANG HABUK (BW/KB/SW)', 'GL', NULL, 1, 29, FALSE, '2-9', NULL),
  ('BKSEC', 'SECRETARIAL AND FILLING FEE (BW/KB)', 'GL', NULL, 1, 30, FALSE, '5', NULL),
  ('BKSE_KH', 'MAINTENANCE KILANG HABUK (BW/KB/SW)', 'GL', NULL, 1, 31, FALSE, '2-1', NULL),
  ('BKSF', 'SUBCRIPTION FEE (BW/KB)', 'GL', NULL, 1, 32, FALSE, '5', NULL),
  ('BKSP', 'SPONSORSHIP FEE (BW/KB)', 'GL', NULL, 1, 33, FALSE, '5', NULL),
  ('BKST', 'STAFF TRAINING (BW/KB)', 'GL', NULL, 1, 34, FALSE, '5', NULL),
  ('BKSUN', 'SUNDRY EXP (BW/KB)', 'GL', NULL, 1, 35, FALSE, '5', NULL),
  ('BKS_KH', 'MAINTENANCE KILANG HABUK (BW/KB/SW)-SALARIES', 'GL', NULL, 1, 36, FALSE, '2-8', NULL),
  ('BKTEL', 'POSTAGE AND TELEPHONE (BW/KB)', 'GL', NULL, 1, 37, FALSE, '5', NULL),
  ('BKTT', 'TRANSPORTATION AND TRAVELLING (BW/KB)', 'GL', NULL, 1, 38, FALSE, '5', NULL),
  ('BKWP', 'WORKPASS (BW/KB)', 'GL', NULL, 1, 39, FALSE, '5', NULL),
  ('BM_B', 'BURNING MATERIALS (BW)', 'GL', NULL, 1, 40, FALSE, '2', NULL),
  ('BM_BK', 'BURNING MATERIALS (BW & KB)', 'GL', NULL, 1, 41, FALSE, '2', NULL),
  ('BM_K', 'BURNING MATERIALS (KB)', 'GL', NULL, 1, 42, FALSE, '2', NULL),
  ('BM_S', 'BURNING MATERIALS (SAWDUST)', 'GL', NULL, 1, 43, FALSE, '2', NULL),
  ('BR_BW', 'BIG WHEEL GREEN TYRES SDN BHD (48447-D)', 'GL', NULL, 1, 44, FALSE, '7', NULL),
  ('BR_KB', 'BOILER RENTAL (KB)', 'GL', NULL, 1, 45, FALSE, '7', NULL),
  ('BT1325', 'BATTERY SB1325', 'GL', NULL, 1, 46, FALSE, '2-10', NULL),
  ('BT2035', 'BATTERY SAA2035H', 'GL', NULL, 1, 47, FALSE, '2-10', NULL),
  ('BT6312', 'BATTERY SAA6312M', 'GL', NULL, 1, 48, FALSE, '2-10', NULL),
  ('BT6326', 'BATTERY SAA6326M', 'GL', NULL, 1, 49, FALSE, '2-10', NULL),
  ('BT8183', 'BATTERY SAB8183J', 'GL', NULL, 1, 50, FALSE, '2-10', NULL),
  ('BT2390', 'BATTERY -SS2390Y', 'GL', NULL, 1, 51, FALSE, '2-10', NULL),
  ('BT8726', 'BATTERY SA8726M', 'GL', NULL, 1, 52, FALSE, '2-10', NULL),
  ('BTCASE', 'BATTERY CASE', 'GL', NULL, 1, 53, FALSE, '2-10', NULL),
  ('BTFORK', 'BATTERY FORKLIFT SHOVEL', 'GL', NULL, 1, 54, FALSE, '2-10', NULL),
  ('BTFT', 'TOYOTA FORKLIFT (BATTERY)', 'GL', NULL, 1, 55, FALSE, '2-10', NULL),
  ('BTHT60', 'BATTERY HITACHI EX60', 'GL', NULL, 1, 56, FALSE, '2-10', NULL),
  ('BTHT75', 'BATTERY HITACHI EX75', 'GL', NULL, 1, 57, FALSE, '2-10', NULL),
  ('BTKOM', 'BATTERY KOMATSU EXCAVATOR', 'GL', NULL, 1, 58, FALSE, '2-10', NULL),
  ('BTOTH_B', 'BATTERY OTHER', 'GL', NULL, 1, 59, FALSE, '2-10', NULL),
  ('BTOTH_K', 'BATTERY OTHER', 'GL', NULL, 1, 60, FALSE, '2-10', NULL),
  ('BTJCB', 'BATTERY-JCB BACKHOE (KB)', 'GL', NULL, 1, 61, FALSE, '2-10', NULL),
  ('BTFS', 'BATTERY FORKLIFT (KB)', 'GL', NULL, 1, 62, FALSE, '2-10', 'Printed on all six Trial Balances (APPX 2-10, immediately after BTJCB) with DEBIT and CREDIT genuinely blank - not ''.00'' like every other zero-balance row, and the only account printed that way anywhere in the six TBs. It has NO GTLD ledger section (confirmed by grep against the raw staging CSV in G1), so it is a 2026 chart entry that was never exercised. G4 must give it NO opening anchor and no journal line: the report engines only surface accounts with an anchor or a posted line, so that absence is exactly what reproduces the blank/blank printing.'),
  ('BWAD', 'ADVERTISEMENT (BW)', 'GL', NULL, 1, 63, FALSE, '5', NULL),
  ('BWAR', 'AUDITORS REMUNERATION (BW)', 'GL', NULL, 1, 64, FALSE, '5', NULL),
  ('BWBC', 'BANK CHARGES (BW)', 'GL', NULL, 1, 65, FALSE, '5', NULL),
  ('BWBD', 'BAD DEBT WRITTEN OFF (BW)', 'GL', NULL, 1, 66, FALSE, '5', NULL),
  ('BWCE', 'CLEANING EXPENSES (BW)', 'GL', NULL, 1, 67, FALSE, '5', NULL),
  ('BWDON', 'DONATIONS (BW)', 'GL', NULL, 1, 68, FALSE, '5', NULL),
  ('BWDRB', 'DIRECTORS'' REMUNERATION (BONUS) -BW', 'GL', NULL, 1, 69, FALSE, '5', NULL),
  ('BWDRE', 'DIRECTORS'' REMUNERATION (EPF) -BW', 'GL', NULL, 1, 70, FALSE, '5', NULL),
  ('BWDRS', 'DIRESTORS'' REMUNERATION (SALARY)-BW', 'GL', NULL, 1, 71, FALSE, '5', NULL),
  ('BWDRSIP', 'DIRECTORS REMUNERATION (SIP)', 'GL', NULL, 1, 72, FALSE, '5', NULL),
  ('BWDRSC', 'DIRECTORS'' REMUNERATION (SOCSO)-BW', 'GL', NULL, 1, 73, FALSE, '5', NULL),
  ('BWEN', 'ENTERTAINMENT (BW)', 'GL', NULL, 1, 74, FALSE, '5', NULL),
  ('BWEW', 'ELECTRICITY & WATER (BW)', 'GL', NULL, 1, 75, FALSE, '5', NULL),
  ('BWE_BS', 'MAINTENANCE (BW-SEPANGGAR)', 'GL', NULL, 1, 76, FALSE, '2-1', NULL),
  ('BWE_JB', 'JAGA BOILER', 'GL', NULL, 1, 77, FALSE, '2-1', NULL),
  ('BWE_KH', 'KILANG HABUK', 'GL', NULL, 1, 78, FALSE, '2-1', NULL),
  ('BWE_LH', 'PENGANGKUTAN (LORI HABUK)', 'GL', NULL, 1, 79, FALSE, '2-1', NULL),
  ('BWE_M', 'MAINTENANCE', 'GL', NULL, 1, 80, FALSE, '2-1', NULL),
  ('BWE_MO', 'MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 81, FALSE, '2-1', NULL),
  ('BWE_O', 'OFFICE', 'GL', NULL, 1, 82, FALSE, '5', NULL),
  ('BWIF', 'INSPECTION FEE (BW)', 'GL', NULL, 1, 83, FALSE, '2-4', NULL),
  ('BWINS', 'INSURANCE (BW)', 'GL', NULL, 1, 84, FALSE, '5', NULL),
  ('BWLC', 'LICENCE FEE (BW)', 'GL', NULL, 1, 85, FALSE, '5', NULL),
  ('BWLEV', 'LEVY CONTRIBUTIONS (BW)', 'GL', NULL, 1, 86, FALSE, '5', NULL),
  ('BWLP', 'LEGAL AND PROFESSIONAL FEE (BW)', 'GL', NULL, 1, 87, FALSE, '5', NULL),
  ('BWMED', 'MEDICAL FEE (BW)', 'GL', NULL, 1, 88, FALSE, '5', NULL),
  ('BWNEW', 'NEWSPAPER AND PERIODICALS (BW)', 'GL', NULL, 1, 89, FALSE, '5', NULL),
  ('BWOR', 'OFFICE REFRESHMENT (BW)', 'GL', NULL, 1, 90, FALSE, '5', NULL),
  ('BWPEN', 'PENALTY (BW)', 'GL', NULL, 1, 91, FALSE, '5', NULL),
  ('BWPS', 'PRINTING AND STATIONERY (BW)', 'GL', NULL, 1, 92, FALSE, '5', NULL),
  ('BWQR', 'QUARTERS RENTAL (BW)', 'GL', NULL, 1, 93, FALSE, '5', NULL),
  ('BWRM', 'REPAIR AND MAINTENANCE (BW)', 'GL', NULL, 1, 94, FALSE, '2-6', NULL),
  ('BWRMB', 'REPAIR AND MAINTENANCE (BW)', 'GL', NULL, 1, 95, FALSE, '2-6', NULL),
  ('BWRMBS', 'REPAIR MAINTENANCE (BW SEPANGGAR)', 'GL', NULL, 1, 96, FALSE, '2-6', NULL),
  ('BWRMKH', 'REPAIR MAINTENANCE (KILANG HABUK)- BW', 'GL', NULL, 1, 97, FALSE, '2-6', NULL),
  ('BWRMOP', 'REPAIR MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 98, FALSE, '2-6', NULL),
  ('BWSA', 'STAFF AMENITIES (BW)', 'GL', NULL, 1, 99, FALSE, '5', NULL),
  ('BWSAF', 'SAFETY AND HEALTH EXP (BW)', 'GL', NULL, 1, 100, FALSE, '5', NULL),
  ('BWSC_BS', 'MAINTENANCE (BW-SEPANGGAR)', 'GL', NULL, 1, 101, FALSE, '2-9', NULL),
  ('BWSC_JB', 'JAGA BOILER', 'GL', NULL, 1, 102, FALSE, '2-9', NULL),
  ('BWSC_KH', 'KILANG HABUK', 'GL', NULL, 1, 103, FALSE, '2-9', NULL),
  ('BWSC_LH', 'PENGANGKUTAN (LORI HABUK)', 'GL', NULL, 1, 104, FALSE, '2-9', NULL),
  ('BWSC_M', 'MAINTENANCE', 'GL', NULL, 1, 105, FALSE, '2-9', NULL),
  ('BWSC_MO', 'MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 106, FALSE, '2-9', NULL),
  ('BWSC_O', 'OFFICE', 'GL', NULL, 1, 107, FALSE, '5', NULL),
  ('BWSIP_O', 'OFFICE (SIP)', 'GL', NULL, 1, 108, FALSE, '5', NULL),
  ('BWSIP_JB', 'JAGA BOILER (SIP)', 'GL', NULL, 1, 109, FALSE, '5', NULL),
  ('BWSIPC_LH', 'PENGANGKUTAN (LORI HABUK)', 'GL', NULL, 1, 110, FALSE, '2-9', NULL),
  ('SSIP_LH', 'PENGANGKUTAN (SW)', 'GL', NULL, 1, 111, FALSE, '2-9', NULL),
  ('BWSIP_M', 'MAINTENANCE (SIP)', 'GL', NULL, 1, 112, FALSE, '2-9', NULL),
  ('BWSIP_BS', 'MAINTENANCE ( BW-SEPANGGAR)', 'GL', NULL, 1, 113, FALSE, '2-9', NULL),
  ('BWSIP_KH', 'MAINTENANCE (KILANG HABUK)', 'GL', NULL, 1, 114, FALSE, '2-9', NULL),
  ('BWSIP_MO', 'MAINTENANCE (OTHERS PROJECT)', 'GL', NULL, 1, 115, FALSE, '2-9', NULL),
  ('BWSEC', 'SECRETARIAL AND FILLING FEES (BW)', 'GL', NULL, 1, 116, FALSE, '5', NULL),
  ('BWSF', 'SUBCRIPTION FEE (BW)', 'GL', NULL, 1, 117, FALSE, '5', NULL),
  ('BWSP', 'SPONSORSHIP FEE (BW)', 'GL', NULL, 1, 118, FALSE, '5', NULL),
  ('BWST', 'STAFF TRAINING (BW)', 'GL', NULL, 1, 119, FALSE, '5', NULL),
  ('BWSUN', 'SUNDRY EXP (BW)', 'GL', NULL, 1, 120, FALSE, '5', NULL),
  ('BWS_BS', 'MAINTENANCE (BW-SEPANGGAR)', 'GL', NULL, 1, 121, FALSE, '2-8', NULL),
  ('BWS_JB', 'JAGA BOILER', 'GL', NULL, 1, 122, FALSE, '2-8', NULL),
  ('BWS_KH', 'MAINTENANCE (KILANG HABUK)', 'GL', NULL, 1, 123, FALSE, '2-8', NULL),
  ('BWS_LH', 'PENGANGKUTAN (LORI HABUK)', 'GL', NULL, 1, 124, FALSE, '2-8', NULL),
  ('BWS_M', 'MAINTENANCE', 'GL', NULL, 1, 125, FALSE, '2-8', NULL),
  ('BWS_MO', 'MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 126, FALSE, '2-8', NULL),
  ('BWS_O', 'OFFICE', 'GL', NULL, 1, 127, FALSE, '5', NULL),
  ('BWTEL', 'POSTAGE AND TELEPHONE (BW)', 'GL', NULL, 1, 128, FALSE, '5', NULL),
  ('BWTRA', 'TRANSPORTATION (BW)', 'GL', NULL, 1, 129, FALSE, '5', NULL),
  ('BWTRV', 'TRAVELLING AND ACCOMMODATION (BW)', 'GL', NULL, 1, 130, FALSE, '5', NULL),
  ('BWTT', 'TRANSPORTATION & TRAVELLING (BW)', 'GL', NULL, 1, 131, FALSE, '5', NULL),
  ('BWUF', 'UPKEEP OF FACTORY (BW)', 'GL', NULL, 1, 132, FALSE, '2-6', NULL),
  ('BWUM', 'UPKEEP OF MACHINERY (BW)', 'GL', NULL, 1, 133, FALSE, '2-6', NULL),
  ('BWWP', 'WORKPASS (BW)', 'GL', NULL, 1, 134, FALSE, '5', NULL),
  ('BW_ADE', 'DIRECTORS REMUNERATION (EPF)', 'GL', NULL, 1, 135, FALSE, '10', NULL),
  ('BW_ADPCB', 'DIRECTORS REMUNERATION (PCB PAYABLES)', 'GL', NULL, 1, 136, FALSE, '10', NULL),
  ('BW_ADS', 'DIRECTORS REMUNERATION (SALARY PAYABLES)', 'GL', NULL, 1, 137, FALSE, '10', NULL),
  ('BW_ADSC', 'DIRECTORS REMUNERATION (SOCSO)', 'GL', NULL, 1, 138, FALSE, '10', NULL),
  ('BW_AE', 'EPF', 'GL', NULL, 1, 139, FALSE, '10', NULL),
  ('BW_APCB', 'PCB PAYABLES', 'GL', NULL, 1, 140, FALSE, '10', NULL),
  ('BW_AS', 'SALARY PAYABLES', 'GL', NULL, 1, 141, FALSE, '10', NULL),
  ('BW_ASC', 'SOCSO', 'GL', NULL, 1, 142, FALSE, '10', NULL),
  ('BW_ASIP', 'SIP', 'GL', NULL, 1, 143, FALSE, '10', NULL),
  ('BW_ASEB', 'SESB', 'GL', NULL, 1, 144, FALSE, '10', NULL),
  ('BW_ADSIP', 'DIRECTOR REMUNERATION (SIP)', 'GL', NULL, 1, 145, FALSE, '10', NULL),
  ('CA_8183', 'PREPAYMENT-SAB8183J', 'GL', NULL, 1, 146, FALSE, '8', NULL),
  ('CA_BD', 'DEBTORS-BW', 'GL', NULL, 1, 147, FALSE, '8', NULL),
  ('CA_BW', 'O/RECEIVABLE-BIG WHEEL GREEN TYRES S/B', 'GL', NULL, 1, 148, FALSE, '8', NULL),
  ('CA_EX75', 'PREPAYMENT-HITACHI EX75', 'GL', NULL, 1, 149, FALSE, '8', NULL),
  ('CA_GF', 'O/RECEIVABLE-GREEN FAMILY ORGANIC', 'GL', NULL, 1, 150, FALSE, '8', NULL),
  ('CA_GTH', 'GOH THAI HO', 'GL', NULL, 1, 151, FALSE, '9', NULL),
  ('CA_KD', 'DEBTORS-KB', 'GL', NULL, 1, 152, FALSE, '8', NULL),
  ('CA_LNA', 'LNA MANAGEMENT (M) S/B - OTHER RECEIVEABLES', 'GL', NULL, 1, 153, FALSE, '8', NULL),
  ('CA_LC', 'PREPAYMENT- LICENCE FEE', 'GL', NULL, 1, 154, FALSE, '8', NULL),
  ('CA_LPF', 'PREPAYMENT-LICENCE PROCESSING FEE', 'GL', NULL, 1, 155, FALSE, '8', NULL),
  ('CA_SESB', 'ELECTRICITY PREPAYMENT', 'GL', NULL, 1, 156, FALSE, '8', NULL),
  ('CA_TAX', 'TAX RECOVERABLE', 'GL', NULL, 1, 157, FALSE, '25', NULL),
  ('CA_TH', 'TIEN HOCK FOOD IND S/B', 'GL', NULL, 1, 158, FALSE, '8', NULL),
  ('CA_WSF', 'WONG SHUK FUN', 'GL', NULL, 1, 159, FALSE, '9', NULL),
  ('CHEM_B', 'PURCHASE OF CHEMICAL (BW)', 'GL', NULL, 1, 160, FALSE, '2-5', NULL),
  ('CHEM_K', 'PURCHASE OF CHEMICAL (KB)', 'GL', NULL, 1, 161, FALSE, '2-5', NULL),
  ('CH_REV2', 'CAH RECEIVED (2)', 'GL', NULL, 1, 162, FALSE, '6', NULL),
  ('CL_GTH', 'GOH THAI HO', 'GL', NULL, 1, 163, FALSE, '9', NULL),
  ('CL_KC', 'CREDITORS-KB', 'TC', NULL, 1, 164, FALSE, '13', NULL),
  ('CL_PB11', 'PBB -AC:2950230122-11 (KB)', 'GL', NULL, 1, 165, FALSE, '11', NULL),
  ('CL_SC', 'CREDITORS(SW)', 'TC', NULL, 1, 166, FALSE, '13', NULL),
  ('CL_TAX', 'TAXATION (DEFFERRED TAX LIABILITIES)', 'GL', NULL, 1, 167, FALSE, '12', NULL),
  ('CL_WSF', 'WONG SHUK FUN', 'GL', NULL, 1, 168, FALSE, '9', NULL),
  ('COS_DEP', 'DEPRECIATION OF PLANT AND EQUIPMENT', 'GL', NULL, 1, 169, FALSE, '15', NULL),
  ('CR_BB', 'BORNEO BENAR S/B', 'TC', NULL, 1, 170, FALSE, '13', NULL),
  ('CR_ACT', 'ACTION FIELD SDN BHD', 'TC', NULL, 1, 171, FALSE, '13', NULL),
  ('CR_BN', 'BONUSOON WOOD SDN BHD', 'TC', NULL, 1, 172, FALSE, '13', NULL),
  ('CR_BWG0001', 'BIGWHEEL MARKETING SDN BHD', 'TC', NULL, 1, 173, FALSE, '13', NULL),
  ('CR_BWG139', 'BIGWHEEL MARKETING SDN BHD', 'TC', NULL, 1, 174, FALSE, '13', NULL),
  ('CR_CHEM', 'CHEMECH VENTURES', 'TC', NULL, 1, 175, FALSE, '13', NULL),
  ('CR_CR', 'CARL RONOW @ MGR', 'TC', NULL, 1, 176, FALSE, '13', NULL),
  ('CR_GW', 'GREENWOOD', 'TC', NULL, 1, 177, FALSE, '13', NULL),
  ('CR_IN', 'GREENWOOD', 'TC', NULL, 1, 178, FALSE, '13', NULL),
  ('CR_JF', 'JOINT FOCUS SDN BHD', 'TC', NULL, 1, 179, FALSE, '13', NULL),
  ('CR_JG', 'SYT JG (OAC)', 'TC', NULL, 1, 180, FALSE, '13', NULL),
  ('CR_KF', 'KENFOREIGN SDN BHD', 'TC', NULL, 1, 181, FALSE, '13', NULL),
  ('CR_KI', 'CHONG YUN KONG', 'TC', NULL, 1, 182, FALSE, '13', NULL),
  ('CR_KK', 'K.K SEAL SUPPLIES SDN BHD', 'TC', NULL, 1, 183, FALSE, '13', NULL),
  ('CR_KT', 'KETUKANGAN INSPIRASI SDN BHD', 'TC', NULL, 1, 184, FALSE, '13', NULL),
  ('CR_BF', 'BRIKFORM SDN BHD', 'TC', NULL, 1, 185, FALSE, '13', NULL),
  ('CR_LS', 'LUSERA LAMA SDN BHD', 'TC', NULL, 1, 186, FALSE, '13', NULL),
  ('CR_MSR', 'MSR FURNITURE SDN BHD', 'TC', NULL, 1, 187, FALSE, '13', NULL),
  ('CR_PRI', 'PRIMBUMI SDN BHD', 'TC', NULL, 1, 188, FALSE, '13', NULL),
  ('CR_SALES', 'CREDIT SALES', 'TC', NULL, 1, 189, FALSE, '13', NULL),
  ('CR_SG', 'SOGORAYA SDN BHD', 'TC', NULL, 1, 190, FALSE, '13', NULL),
  ('CR_SI', 'SUPERWOOD INDUSTRIES S/B', 'TC', NULL, 1, 191, FALSE, '13', NULL),
  ('CR_SP', 'SERBA POTENSI SDN BHD', 'TC', NULL, 1, 192, FALSE, '13', NULL),
  ('CR_SY', 'SOON YEE AUTO PARTS SDN BHD', 'TC', NULL, 1, 193, FALSE, '13', NULL),
  ('CR_WB', 'WORLD TREND GARDEN FURNITURE S/B', 'TC', NULL, 1, 194, FALSE, '13', NULL),
  ('CR_WL', 'WORLD TREND GARDEN FURNITURE S/B', 'TC', NULL, 1, 195, FALSE, '13', NULL),
  ('CR_XF', 'XIAN FUNG ENTERPRISE', 'TC', NULL, 1, 196, FALSE, '13', NULL),
  ('DEP_WS', 'WANGSA INDUSTRIES SDN BHD', 'GL', NULL, 1, 197, FALSE, '10', NULL),
  ('DEP_MG', 'MEGA GAS STATION', 'GL', NULL, 1, 198, FALSE, '10', NULL),
  ('DEP_BF', 'BRIKFORM SDN BHD', 'GL', NULL, 1, 199, FALSE, '10', NULL),
  ('EPF_B', 'EPF (BW)', 'GL', NULL, 1, 200, FALSE, '2-1', NULL),
  ('FC_B', 'FREIGHT CHARGES (BW)', 'GL', NULL, 1, 201, FALSE, '2-2', NULL),
  ('FC_HP', 'HIRE PURCHASE-INTEREST EXPENSES', 'GL', NULL, 1, 202, FALSE, '16', 'fs_note holds the printed Trial Balance APPX 16 (Hire Purchase Payable), which is the legacy account master''s own note field. The June 2026 Income Statement prints this expense on "HIRE PURCHASE INTEREST" with NO note number at all - GT''s note 23 is Term Loan (TH''s 23 is Hire Purchase Interest), so the GT catalogue has no code for this line. G5''s note->line mapping must place it in finance costs explicitly. .00 in all six months, 0 ledger transaction rows.'),
  ('FC_K', 'FREIGHT CHARGES (KB)', 'GL', NULL, 1, 203, FALSE, '2-2', NULL),
  ('FC_TL', 'TERM LOANS- INTEREST EXPENSES', 'GL', NULL, 1, 204, FALSE, '11', 'fs_note holds the printed Trial Balance APPX 11 (Term Loans), which is the legacy account master''s own note field. The June 2026 Income Statement prints this expense on "TERM LOAN" under note 23, inside LESS:FINANCE COSTS. G5''s note->line mapping must not assume APPX = statement note. .00 in all six months, 0 ledger transaction rows.'),
  ('FD_PBB', 'FIXED DEPOSIT (A/C.NO:1326700027)', 'BK', NULL, 1, 205, FALSE, '19', NULL),
  ('HPA_8183', 'SAB8183J', 'GL', NULL, 1, 206, FALSE, '16', NULL),
  ('HPA_EX75', 'HITACHI EX75', 'GL', NULL, 1, 207, FALSE, '16', NULL),
  ('HPB_8183', 'SAB8183J', 'GL', NULL, 1, 208, FALSE, '16', NULL),
  ('HPB_EX75', 'HITACHI EX75', 'GL', NULL, 1, 209, FALSE, '16', NULL),
  ('HR_B', 'HIRING OF PLANT', 'GL', NULL, 1, 210, FALSE, '2-3', NULL),
  ('HR_K', 'HIRING OF PLANT', 'GL', NULL, 1, 211, FALSE, '2-3', NULL),
  ('ICM_IS', 'ALLOWANCE FOR DOUBTFUL OF DEBTS', 'GL', NULL, 1, 212, FALSE, '18-2', NULL),
  ('ICM_OT', 'PERKESO (PROGRAM SUBSIDI UPAH-PSU)', 'GL', NULL, 1, 213, FALSE, '18-3', NULL),
  ('IF_B', 'INSPECTION FEE (BW)', 'GL', NULL, 1, 214, FALSE, '2-4', NULL),
  ('IF_BK', 'INSPECTION FEE (BW/KB)', 'GL', NULL, 1, 215, FALSE, '2-4', NULL),
  ('IF_K', 'INSPECTION FEE (KB)', 'GL', NULL, 1, 216, FALSE, '2-4', NULL),
  ('INPUT.TAX', 'INPUT TAX', 'GL', NULL, 1, 217, FALSE, '10', 'fs_note holds the printed Trial Balance APPX 10 (Other Creditors), which is the legacy account master''s own note field. The June 2026 Balance Sheet prints this account on its own CURRENT ASSET line "INPUT TAX" under note 17. G5''s note->line mapping must not assume APPX = statement note. .00 in all six months, 0 ledger transaction rows.'),
  ('INS1325', 'INSURANCE SB1325', 'GL', NULL, 1, 218, FALSE, '5', NULL),
  ('INS2035', 'INSURANCE SAA2035', 'GL', NULL, 1, 219, FALSE, '5', NULL),
  ('INS6312', 'INSURANCE SAA6312M', 'GL', NULL, 1, 220, FALSE, '5', NULL),
  ('INS6326', 'INSURANCE SAA6326M', 'GL', NULL, 1, 221, FALSE, '5', NULL),
  ('INS2390', 'INSURANCE -SS2390Y', 'GL', NULL, 1, 222, FALSE, '5', NULL),
  ('INS8183', 'INSURANCE SAB8183J', 'GL', NULL, 1, 223, FALSE, '5', NULL),
  ('INS8726', 'INSURANCE SA8726M', 'GL', NULL, 1, 224, FALSE, '5', NULL),
  ('INSCASE', 'INSURANCE CASE', 'GL', NULL, 1, 225, FALSE, '5', NULL),
  ('INSFORK', 'INSURANCE FORKLIFT SHOVEL', 'GL', NULL, 1, 226, FALSE, '5', NULL),
  ('INSFT', 'TOYOTA FORKLIFT (INSURANCE)', 'GL', NULL, 1, 227, FALSE, '5', NULL),
  ('INSHT60', 'INSURANCE HITACHI EX60', 'GL', NULL, 1, 228, FALSE, '5', NULL),
  ('INSHT75', 'INSURANCE HITACHI EX75', 'GL', NULL, 1, 229, FALSE, '5', NULL),
  ('INSKOM', 'INSURANCE KOMATSU EXCAVATOR', 'GL', NULL, 1, 230, FALSE, '5', NULL),
  ('INSOTH_B', 'INSURANCE OTHER', 'GL', NULL, 1, 231, FALSE, '5', NULL),
  ('INSOTH_K', 'INSURANCE OTHER', 'GL', NULL, 1, 232, FALSE, '5', NULL),
  ('INSJCB', 'INSURANCE-JCB BACKHOE (KB)', 'GL', NULL, 1, 233, FALSE, '5', NULL),
  ('KBAD', 'ADVERTISEMENT (KB)', 'GL', NULL, 1, 234, FALSE, '5', NULL),
  ('KBAR', 'AUDITOR''S REMUNERATION (KB)', 'GL', NULL, 1, 235, FALSE, '5', NULL),
  ('KBBC', 'BANK CHARGES (KB)', 'GL', NULL, 1, 236, FALSE, '5', NULL),
  ('KBBD', 'BAD DEBT WRITTEN OFF (KB)', 'GL', NULL, 1, 237, FALSE, '5', NULL),
  ('KBCE', 'CLEANING EXPENSES (KB)', 'GL', NULL, 1, 238, FALSE, '5', NULL),
  ('KBDON', 'DONATIONS (KB)', 'GL', NULL, 1, 239, FALSE, '5', NULL),
  ('KBDRB', 'DIRECTORS'' REMUNERATION (BONUS) -KB', 'GL', NULL, 1, 240, FALSE, '5', NULL),
  ('KBDRE', 'DIRECTORS'' REMUNERATION (EPF) -KB', 'GL', NULL, 1, 241, FALSE, '5', NULL),
  ('KBDRS', 'DIRECTORS'' REMUNERATION (SALARY)-KB', 'GL', NULL, 1, 242, FALSE, '5', NULL),
  ('KBDRSC', 'DIRECTORS'' REMUNERATION (SOCSO)-KB', 'GL', NULL, 1, 243, FALSE, '5', NULL),
  ('KBEN', 'ENTERTAINMENT (KB)', 'GL', NULL, 1, 244, FALSE, '5', NULL),
  ('KBEW', 'ELECTRICITY & WATER (KB)', 'GL', NULL, 1, 245, FALSE, '5', NULL),
  ('KBE_JB', 'JAGA BOILER', 'GL', NULL, 1, 246, FALSE, '2-1', NULL),
  ('KBE_KH', 'KILANG HABUK', 'GL', NULL, 1, 247, FALSE, '2-1', NULL),
  ('KBE_LH', 'PENGANGKUTAN (LORI HABUK)', 'GL', NULL, 1, 248, FALSE, '2-1', NULL),
  ('KBE_M', 'MAINTENANCE', 'GL', NULL, 1, 249, FALSE, '2-1', NULL),
  ('KBE_MO', 'EPF-MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 250, FALSE, '2-1', NULL),
  ('KBE_O', 'OFFICE', 'GL', NULL, 1, 251, FALSE, '5', NULL),
  ('KBE_OT', 'MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 252, FALSE, '2-1', NULL),
  ('KBIF', 'INSPECTION FEE (KB)', 'GL', NULL, 1, 253, FALSE, '2-4', NULL),
  ('KBINS', 'INSURANCE (KB)', 'GL', NULL, 1, 254, FALSE, '5', NULL),
  ('KBLC', 'LICENCE FEE (KB)', 'GL', NULL, 1, 255, FALSE, '5', NULL),
  ('KBLEV', 'LEVY CONTRIBUTIONS (KB)', 'GL', NULL, 1, 256, FALSE, '5', NULL),
  ('KBLP', 'LEGAL AND PROFESSIONAL FEE (KB)', 'GL', NULL, 1, 257, FALSE, '5', NULL),
  ('KBMED', 'MEDICAL FEE (KB)', 'GL', NULL, 1, 258, FALSE, '5', NULL),
  ('KBNEW', 'NEWSPAPER AND PERIODICALS (KB)', 'GL', NULL, 1, 259, FALSE, '5', NULL),
  ('KBOR', 'OFFICE REFRESHMENT (KB)', 'GL', NULL, 1, 260, FALSE, '5', NULL),
  ('KBPEN', 'PENALTY (KB)', 'GL', NULL, 1, 261, FALSE, '5', NULL),
  ('KBPS', 'PRINTING AND STATIONERY (KB)', 'GL', NULL, 1, 262, FALSE, '5', NULL),
  ('KBQR', 'QUARTERS RENTAL (KB)', 'GL', NULL, 1, 263, FALSE, '5', NULL),
  ('KBRM', 'REPAIR AND MAINTENANCE (KB)', 'GL', NULL, 1, 264, FALSE, '2-7', NULL),
  ('KBRMKH', 'REPAIR MAINTENANCE (KILANG HABUK)-KB', 'GL', NULL, 1, 265, FALSE, '2-7', NULL),
  ('KBRMOP', 'REPAIR MAINTENANCE (OTHER PROJECT)- KB', 'GL', NULL, 1, 266, FALSE, '2-7', NULL),
  ('KBSA', 'STAFF AMENITIES (KB)', 'GL', NULL, 1, 267, FALSE, '5', NULL),
  ('KBSAF', 'SAFETY AND HEALTH EXP (KB)', 'GL', NULL, 1, 268, FALSE, '5', NULL),
  ('KBSC_JB', 'JAGA BOILER', 'GL', NULL, 1, 269, FALSE, '2-9', NULL),
  ('KBSC_KH', 'KILANG HABUK', 'GL', NULL, 1, 270, FALSE, '2-9', NULL),
  ('KBSC_LH', 'PENGANGKUTAN (LORI HABUK)', 'GL', NULL, 1, 271, FALSE, '2-9', NULL),
  ('KBSC_M', 'MAINTENANCE', 'GL', NULL, 1, 272, FALSE, '2-9', NULL),
  ('KBSC_MO', 'MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 273, FALSE, '2-9', NULL),
  ('KBSC_O', 'OFFICE', 'GL', NULL, 1, 274, FALSE, '5', NULL),
  ('KBSC_OT', 'MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 275, FALSE, '2-9', NULL),
  ('KBSIP_JB', 'JAGA BOILER (SIP)', 'GL', NULL, 1, 276, FALSE, '2-9', NULL),
  ('KBSIP_LH', 'PENGANGKUTAN (HABUK)', 'GL', NULL, 1, 277, FALSE, '2-9', NULL),
  ('KBSIP_M', 'MAINTENANCE (SIP)', 'GL', NULL, 1, 278, FALSE, '2-9', NULL),
  ('KBSIP_KH', 'MAINTENANCE (KILANG HABUK)', 'GL', NULL, 1, 279, FALSE, '2-9', NULL),
  ('KBSIP_MO', 'MAINTENANCE (OTHERS PROJECT)', 'GL', NULL, 1, 280, FALSE, '2-9', NULL),
  ('KBSEC', 'SECRETARIAL AND FILLING FEES (KB)', 'GL', NULL, 1, 281, FALSE, '5', NULL),
  ('KBSF', 'SUBCRIPTION FEE', 'GL', NULL, 1, 282, FALSE, '5', NULL),
  ('KBSP', 'SPONSORSHIP FEE (KB)', 'GL', NULL, 1, 283, FALSE, '5', NULL),
  ('KBST', 'STAFF TRAINING (KB)', 'GL', NULL, 1, 284, FALSE, '5', NULL),
  ('KBSUN', 'SUNDRY EXP (KB)', 'GL', NULL, 1, 285, FALSE, '5', NULL),
  ('KBS_JB', 'JAGA BOILER', 'GL', NULL, 1, 286, FALSE, '2-8', NULL),
  ('KBS_KH', 'MAINTENANCE (KILANG HABUK)', 'GL', NULL, 1, 287, FALSE, '2-8', NULL),
  ('KBS_LH', 'PENGANGKUTAN (LORI HABUK)', 'GL', NULL, 1, 288, FALSE, '2-8', NULL),
  ('KBS_M', 'MAINTENANCE', 'GL', NULL, 1, 289, FALSE, '2-8', NULL),
  ('KBS_MO', 'MAINTENANCE (OTHER PROJECT)', 'GL', NULL, 1, 290, FALSE, '2-8', NULL),
  ('KBS_O', 'OFFICE', 'GL', NULL, 1, 291, FALSE, '5', NULL),
  ('KBTEL', 'POSTAGE AND TELEPHONE (KB)', 'GL', NULL, 1, 292, FALSE, '5', NULL),
  ('KBTRA', 'TRANSPORTATION', 'GL', NULL, 1, 293, FALSE, '5', NULL),
  ('KBTRV', 'TRAVELLING AND ACCOMMODATION (KB)', 'GL', NULL, 1, 294, FALSE, '5', NULL),
  ('KBTT', 'TRANSPORTATION & TRAVELLING (KB)', 'GL', NULL, 1, 295, FALSE, '5', NULL),
  ('KBUF', 'UPKEEP OF FACTORY (KB)', 'GL', NULL, 1, 296, FALSE, '2-6', NULL),
  ('KBUM', 'UPKEEP OF MACHINERY (KB)', 'GL', NULL, 1, 297, FALSE, '2-6', NULL),
  ('KBWP', 'WORKPASS (KB)', 'GL', NULL, 1, 298, FALSE, '5', NULL),
  ('KB_ADE', 'DIRECTORS REMUNERATION (EPF)', 'GL', NULL, 1, 299, FALSE, '1', NULL),
  ('KB_ADPCB', 'DIRECTORS REMUNERATION (PCB PAYABLES)', 'GL', NULL, 1, 300, FALSE, '1', NULL),
  ('KB_ADS', 'DIRECTORS REMUNERATION (SALARY PAYABLES)', 'GL', NULL, 1, 301, FALSE, '1', NULL),
  ('KB_ADSC', 'DIRECTORS REMUNERATION (SOCSO)', 'GL', NULL, 1, 302, FALSE, '1', NULL),
  ('KB_ASIP', 'SIP', 'GL', NULL, 1, 303, FALSE, '1', NULL),
  ('KB_AE', 'EPF', 'GL', NULL, 1, 304, FALSE, '1', NULL),
  ('KB_APCB', 'PCB PAYABLES', 'GL', NULL, 1, 305, FALSE, '1', NULL),
  ('KB_AS', 'SALARY PAYABLES', 'GL', NULL, 1, 306, FALSE, '1', NULL),
  ('KB_ASC', 'SOCSO', 'GL', NULL, 1, 307, FALSE, '1', NULL),
  ('KB_ASEB', 'SESB', 'GL', NULL, 1, 308, FALSE, '1', NULL),
  ('LEV', 'LEVY CONTRIBUTIONS', 'GL', NULL, 1, 309, FALSE, '5', NULL),
  ('LT_DT', 'DEFERRED TAX LIABILITIES', 'GL', NULL, 1, 310, FALSE, '12', NULL),
  ('LT_HP', 'HIRE PURCHASE PAYABLES', 'GL', NULL, 1, 311, FALSE, '16', NULL),
  ('OC_AM', 'O/CREDITORS-ANJUR MEGAH', 'GL', NULL, 1, 312, FALSE, '10', NULL),
  ('OC_BC', 'O/CREDITORS- BUSINESS CONNECTION CENTRE', 'GL', NULL, 1, 313, FALSE, '10', NULL),
  ('OC_BW', 'O/CREDITOR-BIGWHEEL GREEN TYRES S/B', 'GL', NULL, 1, 314, FALSE, '10', NULL),
  ('OC_CMK', 'O/CREDITORS-CMK', 'GL', NULL, 1, 315, FALSE, '10', NULL),
  ('OC_PC', 'O/CREDITORS-POONS CONSTRUCTION CO', 'GL', NULL, 1, 316, FALSE, '10', NULL),
  ('OC_RMA', 'O/CREDITOR-R&M SEPANGGAR (ANGKING)', 'GL', NULL, 1, 317, FALSE, '10', NULL),
  ('OC_RMS', 'O/CREDITORS- R&M SEPANGGAR (SHARIP)', 'GL', NULL, 1, 318, FALSE, '10', NULL),
  ('OC_SF', 'O/CREDITOR-S.F TYRE & BATTERY S/B', 'GL', NULL, 1, 319, FALSE, '10', NULL),
  ('OC_TH', 'O/CREDITORS-TIEN HOCK FOOD IND S/B', 'GL', NULL, 1, 320, FALSE, '10', NULL),
  ('OIL1325', 'DIESEL SB1325', 'GL', NULL, 1, 321, FALSE, '2-10', NULL),
  ('OIL2035', 'DIESEL SAA2035H', 'GL', NULL, 1, 322, FALSE, '2-10', NULL),
  ('OIL4T_B', 'HYDRAULIC/ENGINE/GEAR/ATF (BW)', 'GL', NULL, 1, 323, FALSE, '2-10', NULL),
  ('OIL4T_K', 'HYDRAULIC/ENGINE/GEAR/ATF (KB)', 'GL', NULL, 1, 324, FALSE, '2-10', NULL),
  ('OIL6312', 'DIESEL SAA6312M', 'GL', NULL, 1, 325, FALSE, '2-10', NULL),
  ('OIL6326', 'DIESEL SAA6326M', 'GL', NULL, 1, 326, FALSE, '2-10', NULL),
  ('OIL8183', 'DIESEL SAB8183J', 'GL', NULL, 1, 327, FALSE, '2-10', NULL),
  ('OIL2390', 'OIL-SS2390Y', 'GL', NULL, 1, 328, FALSE, '2-10', NULL),
  ('OIL8726', 'DIESEL SA8726M', 'GL', NULL, 1, 329, FALSE, '2-10', NULL),
  ('OILCASE', 'DIESEL CASE', 'GL', NULL, 1, 330, FALSE, '2-10', NULL),
  ('OILFORK', 'DIESEL FORLIFT SHOVEL', 'GL', NULL, 1, 331, FALSE, '2-10', NULL),
  ('OILFT', 'TOYOTA FORKLIFT (DIESEL)', 'GL', NULL, 1, 332, FALSE, '2-10', NULL),
  ('OILHT60', 'DIESEL HITACHI EX60', 'GL', NULL, 1, 333, FALSE, '2-10', NULL),
  ('OILHT75', 'DIESEL HITACHI EX75', 'GL', NULL, 1, 334, FALSE, '2-10', NULL),
  ('OILKOM', 'DIESEL KOMATSU EXCAVATOR', 'GL', NULL, 1, 335, FALSE, '2-10', NULL),
  ('OILOTH_B', 'DIESEL OTHER', 'GL', NULL, 1, 336, FALSE, '2-10', NULL),
  ('OILOTH_K', 'DIESEL OTHER', 'GL', NULL, 1, 337, FALSE, '2-10', NULL),
  ('OILJCB', 'DIESEL JCB BACKHOE-KOTABOX', 'GL', NULL, 1, 338, FALSE, '2-10', NULL),
  ('OTH1', 'OTHERS', 'GL', NULL, 1, 339, FALSE, '7', NULL),
  ('OTH_B', 'OTHERS:SESB (BW)', 'GL', NULL, 1, 340, FALSE, '7', NULL),
  ('OTH_BK', 'OTHERS (BW & KB)', 'GL', NULL, 1, 341, FALSE, '7', NULL),
  ('OTH_BKS', 'OTHERS (BW/KB/SW)', 'GL', NULL, 1, 342, FALSE, '7', NULL),
  ('OTH_K', 'OTHERS:REPAIR & MAINTENANCE CHARGE(TH)', 'GL', NULL, 1, 343, FALSE, '7', NULL),
  ('OTH_S', 'OTHERS (SW)', 'GL', NULL, 1, 344, FALSE, '7', NULL),
  ('OUTPUT.TAX', 'OUTPUT TAX', 'GL', NULL, 1, 345, FALSE, '10', NULL),
  ('PBB1', 'PBB-A/C:3137836814 (BW)', 'BK', NULL, 1, 346, FALSE, '19', NULL),
  ('PBB_1', 'PBB-A/C:3137836814 (BW)', 'BK', NULL, 1, 347, FALSE, '19', NULL),
  ('PBB_2', 'PBB-A/C.NO:3987511409 (KB)', 'BK', NULL, 1, 348, FALSE, '19', NULL),
  ('PE_ADE', 'ACC.DEPRECIATION-EQUIPMENT', 'GL', NULL, 1, 349, FALSE, '4', NULL),
  ('PE_ADH', 'ACC.DEPRECIATION-HEAVY EQUIPMENT', 'GL', NULL, 1, 350, FALSE, '4', NULL),
  ('PE_ADM', 'ACC.DEPRECIATION-MOTOR VEHICLE', 'GL', NULL, 1, 351, FALSE, '4', NULL),
  ('PE_ADO', 'ACC.DEPRECIATION-OFFICE EQUIPMENT', 'GL', NULL, 1, 352, FALSE, '4', NULL),
  ('PE_EQB', 'EQUIPMENT-BW', 'GL', NULL, 1, 353, FALSE, '4', NULL),
  ('PE_EQK', 'EQUIPMENT-KB', 'GL', NULL, 1, 354, FALSE, '4', NULL),
  ('PE_HEQB', 'HEAVY EQUIPMENT-BW', 'GL', NULL, 1, 355, FALSE, '4', NULL),
  ('PE_MVB', 'MOTOR VEHICLE-BW', 'GL', NULL, 1, 356, FALSE, '4', NULL),
  ('PE_MVK', 'MOTOR VEHICLE-KB', 'GL', NULL, 1, 357, FALSE, '4', NULL),
  ('PE_OEQ', 'OFFICE EQUIPMENT', 'GL', NULL, 1, 358, FALSE, '4', NULL),
  ('PR_HEQK', 'HEAVY EQUIPMENT-KB', 'GL', NULL, 1, 359, FALSE, '4', NULL),
  ('PTHT60', 'PATCHING & TUBE -HITACHI EX60 (BW)', 'GL', NULL, 1, 360, FALSE, '2-10', NULL),
  ('PT8726', 'PATCHING & TUBE -SA8726M', 'GL', NULL, 1, 361, FALSE, '2-10', NULL),
  ('PT6312', 'PATCHING & TUBE -SAA6312M', 'GL', NULL, 1, 362, FALSE, '2-10', NULL),
  ('PT2035', 'PATCHING & TUBE -SAA2035H', 'GL', NULL, 1, 363, FALSE, '2-10', NULL),
  ('PT1325', 'PATCHING & TUBE -SB1325', 'GL', NULL, 1, 364, FALSE, '2-10', NULL),
  ('PTOTH', 'PATCHING & TUBE (BW) - OTHERS', 'GL', NULL, 1, 365, FALSE, '2-10', NULL),
  ('PTCASE', 'PATCHING & TUBE - CASE KB', 'GL', NULL, 1, 366, FALSE, '2-10', NULL),
  ('PT6326', 'PATHCING & TUBE -SAA6326M', 'GL', NULL, 1, 367, FALSE, '2-10', NULL),
  ('PT8183', 'PATCHING & TUBE - SAB8183J', 'GL', NULL, 1, 368, FALSE, '2-10', NULL),
  ('PT2390', 'PATCHING TUBE -SS2390Y', 'GL', NULL, 1, 369, FALSE, '2-10', NULL),
  ('PTOTHK', 'PATHCING & TUBE (KB)-OTHERS', 'GL', NULL, 1, 370, FALSE, '2-10', NULL),
  ('PTJCB', 'PATCHING & TUBE-JCB BACKHOE (KB)', 'GL', NULL, 1, 371, FALSE, '2-10', NULL),
  ('PSU', 'PERKESO (PROGRAM SUBSIDI UPAH)', 'GL', NULL, 1, 372, FALSE, '7', NULL),
  ('R1325', 'REPAIR SB1325', 'GL', NULL, 1, 373, FALSE, '2-6', NULL),
  ('R2035', 'REPAIR SAA2035H', 'GL', NULL, 1, 374, FALSE, '2-6', NULL),
  ('R6312', 'REPAIR SAA6312M', 'GL', NULL, 1, 375, FALSE, '2-6', NULL),
  ('R6326', 'REPAIR SAA6326M', 'GL', NULL, 1, 376, FALSE, '2-6', NULL),
  ('R8183', 'REPAIR SAB8183J', 'GL', NULL, 1, 377, FALSE, '2-6', NULL),
  ('R2390', 'REPAIR-SS2390Y', 'GL', NULL, 1, 378, FALSE, '2-6', NULL),
  ('R8726', 'REPAIR SA8726M', 'GL', NULL, 1, 379, FALSE, '2-6', NULL),
  ('RCASE', 'REPAIR CASE', 'GL', NULL, 1, 380, FALSE, '2-6', NULL),
  ('RJCB', 'REPAIR-JCB BACKHOE (KB)', 'GL', NULL, 1, 381, FALSE, '2-6', NULL),
  ('RFORK', 'REPAIR FORKLIFT SHOVEL', 'GL', NULL, 1, 382, FALSE, '2-6', NULL),
  ('RFT', 'TOYOTA FORKLIFT (REPAIR)', 'GL', NULL, 1, 383, FALSE, '2-6', NULL),
  ('RHT60', 'REPAIR HITACHI EX60', 'GL', NULL, 1, 384, FALSE, '2-6', NULL),
  ('RHT75', 'REPAIR HITACHI EX75', 'GL', NULL, 1, 385, FALSE, '2-6', NULL),
  ('RKOM', 'REPAIR KOMATSU EXCAVATOR', 'GL', NULL, 1, 386, FALSE, '2-6', NULL),
  ('RMS_B', 'REPAIR & MAINTENANCE -SAWDUST(BW)', 'GL', NULL, 1, 387, FALSE, '2-8', NULL),
  ('RMS_BKS', 'REPAIR & MAINTENANCE-SAWDUST (BW/KB/SW)', 'GL', NULL, 1, 388, FALSE, '2-8', NULL),
  ('RMS_K', 'REPAIR & MAINTENANCE-SAWDUST (KB)', 'GL', NULL, 1, 389, FALSE, '2-8', NULL),
  ('RMS_S', 'REPAIR & MAINTENANCE-SAWDUST (SW)', 'GL', NULL, 1, 390, FALSE, '2-8', NULL),
  ('RM_BK', 'REPAIR & MAINTENANCE BW/KB', 'GL', NULL, 1, 391, FALSE, '2-6', NULL),
  ('RM_BL', 'REPAIR & MAINTENANCE (BOILER)', 'GL', NULL, 1, 392, FALSE, '2-6', NULL),
  ('RM_BO', 'REPAIR & MAINTENANCE BOILER (OTHER)', 'GL', NULL, 1, 393, FALSE, '2-6', NULL),
  ('RM_BS', 'BIG WHEEL SEPANGGAR', 'GL', NULL, 1, 394, FALSE, '2-6', NULL),
  ('RM_K', 'REPAIR AND MAINTENANCE (KB)', 'GL', NULL, 1, 395, FALSE, '2-6', NULL),
  ('RM_KM', 'PETRONAS TRAINING CENTRE,KIMANIS', 'GL', NULL, 1, 396, FALSE, '2-6', NULL),
  ('RM_KO', 'REPAIR & MAINTENANCE KB (OTHER)', 'GL', NULL, 1, 397, FALSE, '2-6', NULL),
  ('RM_OTH1', 'OTHERS', 'GL', NULL, 1, 398, FALSE, '2-6', NULL),
  ('RM_OTH2', 'OTHERS', 'GL', NULL, 1, 399, FALSE, '2-6', NULL),
  ('RM_Q', 'EQUIPMENT', 'GL', NULL, 1, 400, FALSE, '2-6', NULL),
  ('RM_TG', 'TONG', 'GL', NULL, 1, 401, FALSE, '2-6', NULL),
  ('ROTH_B', 'REPAIR OTHER', 'GL', NULL, 1, 402, FALSE, '2-6', NULL),
  ('ROTH_K', 'REPAIR OTHER', 'GL', NULL, 1, 403, FALSE, '2-6', NULL),
  ('RP', 'RETAINED PROFITS', 'GL', NULL, 1, 404, FALSE, '20', NULL),
  ('SAD', 'ADVETISEMENT (SW)', 'GL', NULL, 1, 405, FALSE, '5', NULL),
  ('SAL_B', 'SALARIES AND WAGES (BW)', 'GL', NULL, 1, 406, FALSE, '2-8', NULL),
  ('SAL_K', 'SALARIES AND WAGES (KB)', 'GL', NULL, 1, 407, FALSE, '2-8', NULL),
  ('SBD', 'BAD DEBT WRITTEN OFF (SW)', 'GL', NULL, 1, 408, FALSE, '5', NULL),
  ('SC', 'SHARE CAPITAL', 'GL', NULL, 1, 409, FALSE, '21', NULL),
  ('SDON', 'DONATIONS (SW)', 'GL', NULL, 1, 410, FALSE, '5', NULL),
  ('SE_KH', 'MAINTENANCE KILANG HABUK (SW)', 'GL', NULL, 1, 411, FALSE, '2-1', NULL),
  ('SE_LH', 'PENGANGKUTAN LORI HABUK (SW)', 'GL', NULL, 1, 412, FALSE, '2-1', NULL),
  ('SOC_B', 'SOCSO (BW)', 'GL', NULL, 1, 413, FALSE, '2-9', NULL),
  ('SSC_KH', 'MAINTENANCE KILANG HABUK(SW)', 'GL', NULL, 1, 414, FALSE, '2-9', NULL),
  ('SSC_LH', 'PENGANGKUTAN HABUK (SW)', 'GL', NULL, 1, 415, FALSE, '2-9', NULL),
  ('SS_KH', 'MAINTENANCE-KILANG HABUK (SALARIES)', 'GL', NULL, 1, 416, FALSE, '2-8', NULL),
  ('SS_LH', 'PENGANGKUTAN LORI HABUK (SALARIES)', 'GL', NULL, 1, 417, FALSE, '2-8', NULL),
  ('STEL', 'POSTAGE AND TELEPHONE (SW)', 'GL', NULL, 1, 418, FALSE, '5', NULL),
  ('SV1325', 'SERVICE SB1325', 'GL', NULL, 1, 419, FALSE, '2-6', NULL),
  ('SV2035', 'SERVICE SAA2035H', 'GL', NULL, 1, 420, FALSE, '2-6', NULL),
  ('SV6312', 'SERVICE SAA6312M', 'GL', NULL, 1, 421, FALSE, '2-6', NULL),
  ('SV6326', 'SERVICE SAA6326M', 'GL', NULL, 1, 422, FALSE, '2-6', NULL),
  ('SV8183', 'SERVICE SAB8183J', 'GL', NULL, 1, 423, FALSE, '2-6', NULL),
  ('SV2390', 'SERVICE -SS2390Y', 'GL', NULL, 1, 424, FALSE, '2-6', NULL),
  ('SV8726', 'SERVICE SA8726M', 'GL', NULL, 1, 425, FALSE, '2-6', NULL),
  ('SVCASE', 'SERVICE CASE', 'GL', NULL, 1, 426, FALSE, '2-6', NULL),
  ('SVFORK', 'SERVICE FORKLIFT SHOVEL', 'GL', NULL, 1, 427, FALSE, '2-6', NULL),
  ('SVFT', 'TOYOTA FORKLIFT (SERVICE)', 'GL', NULL, 1, 428, FALSE, '2-6', NULL),
  ('SVHT60', 'SERVICE HITACHI EX60', 'GL', NULL, 1, 429, FALSE, '2-6', NULL),
  ('SVHT75', 'SERVICE HITACHI EX75', 'GL', NULL, 1, 430, FALSE, '2-6', NULL),
  ('SVKOM', 'SERVICE KOMATSU EXCAVATOR', 'GL', NULL, 1, 431, FALSE, '2-6', NULL),
  ('SVOTH_B', 'SERVICE OTHER', 'GL', NULL, 1, 432, FALSE, '2-6', NULL),
  ('SVOTH_K', 'SERVICE OTHER', 'GL', NULL, 1, 433, FALSE, '2-6', NULL),
  ('SVJCB', 'SERVICE-JCB BACKHOE (KB)', 'GL', NULL, 1, 434, FALSE, '2-6', NULL),
  ('TAX', 'TAX EXPENSE', 'GL', NULL, 1, 435, FALSE, '3', NULL),
  ('TAX1325', 'ROAD TAX SB1325', 'GL', NULL, 1, 436, FALSE, '2-10', NULL),
  ('TAX2035', 'ROAD TAX SAA2035H', 'GL', NULL, 1, 437, FALSE, '2-10', NULL),
  ('TAX6312', 'ROAD TAX SAA6312M', 'GL', NULL, 1, 438, FALSE, '2-10', NULL),
  ('TAX6326', 'ROAD TAX SAA6326M', 'GL', NULL, 1, 439, FALSE, '2-10', NULL),
  ('TAX8183', 'ROAD TAX SAB8183J', 'GL', NULL, 1, 440, FALSE, '2-10', NULL),
  ('TAX2390', 'ROAD TAX-SS2390Y', 'GL', NULL, 1, 441, FALSE, '2-10', NULL),
  ('TAX8726', 'ROAD TAX SA8726M', 'GL', NULL, 1, 442, FALSE, '2-10', NULL),
  ('TAXOTH_B', 'ROAD TAX OTHER', 'GL', NULL, 1, 443, FALSE, '2-10', NULL),
  ('TAXOTH_K', 'ROAD TAX OTHER', 'GL', NULL, 1, 444, FALSE, '2-10', NULL),
  ('TC', 'TRANSPORT CHARGE', 'GL', NULL, 1, 445, FALSE, '7', NULL),
  ('TGA', 'POTONG KAYU/SAMPAH/TONG RENTAL(TONG A)', 'GL', NULL, 1, 446, FALSE, '7', NULL),
  ('TGB', 'SISA BATU & TANAH (TONG B)', 'GL', NULL, 1, 447, FALSE, '7', NULL),
  ('TY1325', 'TYRE SB1325', 'GL', NULL, 1, 448, FALSE, '2-10', NULL),
  ('TY2035', 'TYRE SAA2035H', 'GL', NULL, 1, 449, FALSE, '2-10', NULL),
  ('TY6312', 'TYRE SAA6312M', 'GL', NULL, 1, 450, FALSE, '2-10', NULL),
  ('TY6326', 'TYRE SAA6326M', 'GL', NULL, 1, 451, FALSE, '2-10', NULL),
  ('TY8183', 'TYRE SAB8183J', 'GL', NULL, 1, 452, FALSE, '2-10', NULL),
  ('TY2390', 'TYRE - SS2390Y', 'GL', NULL, 1, 453, FALSE, '2-10', NULL),
  ('TY8726', 'TYRE SA8726M', 'GL', NULL, 1, 454, FALSE, '2-10', NULL),
  ('TYCASE', 'TYRE CASE', 'GL', NULL, 1, 455, FALSE, '2-10', NULL),
  ('TYFORK', 'TYRE FORKLIFT SHOVEL', 'GL', NULL, 1, 456, FALSE, '2-10', NULL),
  ('TYFT', 'TOYOTA FORKLIFT (TYRE)', 'GL', NULL, 1, 457, FALSE, '2-10', NULL),
  ('TYHT60', 'TYRE HITACHI EX60', 'GL', NULL, 1, 458, FALSE, '2-10', NULL),
  ('TYHT75', 'TYRE HITACHI EX75', 'GL', NULL, 1, 459, FALSE, '2-10', NULL),
  ('TYKOM', 'TYRE KOMATSU EXCAVATOR', 'GL', NULL, 1, 460, FALSE, '2-10', NULL),
  ('TYJCB', 'TYRE_JCB BACKHOE (KB)', 'GL', NULL, 1, 461, FALSE, '2-10', NULL),
  ('TYOTH_B', 'TYRE OTHER', 'GL', NULL, 1, 462, FALSE, '2-10', NULL),
  ('TYOTH_K', 'TYRE OTHER', 'GL', NULL, 1, 463, FALSE, '2-10', NULL),
  ('VRE_B', 'VEHICLE RUNNING EXP (BW)', 'GL', NULL, 1, 464, FALSE, '2-10', NULL),
  ('VRE_S', 'VEHICLE RUNNING EXP (SAWDUST)', 'GL', NULL, 1, 465, FALSE, '2-10', NULL),
  ('WS_CR', 'CARL RONOW', 'GL', NULL, 1, 466, FALSE, '7', NULL),
  ('WS_OTH', 'TONG A & B RENTAL (STATEMENT)', 'GL', NULL, 1, 467, FALSE, '7', NULL),
  ('WS_OTH1', 'SOGORAYA SDN BHD', 'GL', NULL, 1, 468, FALSE, '7', NULL),
  ('WS_OTH2', 'REPAIR AND MAINTENANCE', 'GL', NULL, 1, 469, FALSE, '7', NULL),
  ('WS_OTH3', 'TIEN HOCK (TRANSPORT CHARGE)', 'GL', NULL, 1, 470, FALSE, '7', NULL),
  ('WS_OTH4', 'TIEN HOCK (BURNING MATERIALS)', 'GL', NULL, 1, 471, FALSE, '7', NULL),
  ('WS_OTH5', 'OTHERS (BAJA)', 'GL', NULL, 1, 472, FALSE, '7', NULL),
  ('WS_OTH6', 'OTHERS', 'GL', NULL, 1, 473, FALSE, '7', NULL),
  ('WS_SBR', 'SABARINA CORP SDN BHD', 'GL', NULL, 1, 474, FALSE, '7', NULL),
  ('DEBTOR', 'TRADE DEBTOR', 'TD', NULL, 1, 475, TRUE, '22', 'Netted trade-debtor control line, printed as the LAST row of every Trial Balance (APPX 22) after WS SBR, outside the alphabetical chart. Its own GTLD ledger section is a stale 2026-06-30 snapshot and was excluded in G0; the real balances live in the 28 GTDB debtor children that hang off this account. Carries no journal line and no opening anchor of its own.'),
  ('AE ENTERPRISE', 'AE ENTERPRISE', 'TD', 'DEBTOR', 2, 1001, FALSE, '22', NULL),
  ('ALPS', 'GT POLYMER (M) S/B', 'TD', 'DEBTOR', 2, 1002, FALSE, '22', NULL),
  ('BAJA-STONE', 'THE STONE SHOP', 'TD', 'DEBTOR', 2, 1003, FALSE, '22', NULL),
  ('BAKTI', 'SYARIKAT PERKAPALAN & PENGHANTARAN', 'TD', 'DEBTOR', 2, 1004, FALSE, '22', NULL),
  ('BW', 'BIG WHEEL GREEN TYRES SDN BHD (48447-D)', 'TD', 'DEBTOR', 2, 1005, FALSE, '22', NULL),
  ('BWL', 'BIGWHEEL GREEN TYRES SDN BHD', 'TD', 'DEBTOR', 2, 1006, FALSE, '22', NULL),
  ('CD', 'CASH DEBTOR 2016(SUNDRY DEBTORS)', 'TD', 'DEBTOR', 2, 1007, FALSE, '22', NULL),
  ('CD2014', 'CASH DEBTOR 2014', 'TD', 'DEBTOR', 2, 1008, FALSE, '22', NULL),
  ('CD2015', 'CASH DEBTOR 2015', 'TD', 'DEBTOR', 2, 1009, FALSE, '22', NULL),
  ('CD_SD', 'CASH DEBTORS (SUNDRY DEBTORS)', 'TD', 'DEBTOR', 2, 1010, FALSE, '22', 'GTDB debtor section printing only a static 2026-06-30 C/FWD of 65,705.40 with no transaction detail. G1 proved its true 2026-01-01 opening is 76,415.40 (65,705.40 + the 10,710.00 unbanked counter-sale cash that the printed DEBTOR control carries), month-end path 85,915.40 / 72,895.40 / 69,377.40 / 71,955.40 / 66,445.40 / 65,705.40. G4 anchors it at 76,415.40 and derives its movement rows; CH_REV2 is genuinely dormant and is NOT the answer.'),
  ('CHARM', 'CHARMELON ENTERPRISE', 'TD', 'DEBTOR', 2, 1011, FALSE, '22', NULL),
  ('GREAT', 'THE GREAT EMPIRE(LEONG''S EMPIRE)', 'TD', 'DEBTOR', 2, 1012, FALSE, '22', NULL),
  ('INNOSURIA', 'INNOSURIA SDN BHD', 'TD', 'DEBTOR', 2, 1013, FALSE, '22', NULL),
  ('ITCC', 'GOODHELP ENTERPRISE (M) SDN BHD', 'TD', 'DEBTOR', 2, 1014, FALSE, '22', NULL),
  ('JAARI', 'JARRI ENGINEERING S/B', 'TD', 'DEBTOR', 2, 1015, FALSE, '22', NULL),
  ('KBOX', 'KOTABOX PACKAGING SDN BHD', 'TD', 'DEBTOR', 2, 1016, FALSE, '22', NULL),
  ('KEN', 'KEN FATT FURNITURE S/B', 'TD', 'DEBTOR', 2, 1017, FALSE, '22', NULL),
  ('LEE DECOR', 'LEE DECOR SDN BHD', 'TD', 'DEBTOR', 2, 1018, FALSE, '22', NULL),
  ('MARCOCO', 'MARCOCO (SABAH) SDN BHD', 'TD', 'DEBTOR', 2, 1019, FALSE, '22', NULL),
  ('NURI', 'SYT PERNIAGAAN PERABOT NURI S/B', 'TD', 'DEBTOR', 2, 1020, FALSE, '22', NULL),
  ('PAN', 'KINABUILD (SABAH) SDN. BHD.', 'TD', 'DEBTOR', 2, 1021, FALSE, '22', NULL),
  ('PAUMIN', 'PAUMIN HARDWARE SDN. BHD.', 'TD', 'DEBTOR', 2, 1022, FALSE, '22', NULL),
  ('RUMAH MERAH', 'RUMAH MERAH MENGGATAL', 'TD', 'DEBTOR', 2, 1023, FALSE, '22', NULL),
  ('SABARINA', 'SABARINA CORPORATION S/B', 'TD', 'DEBTOR', 2, 1024, FALSE, '22', NULL),
  ('SOGORAYA', 'SOGORAYA SDN BHD', 'TD', 'DEBTOR', 2, 1025, FALSE, '22', NULL),
  ('SUN TARGET', 'DECO VALLEY SDN BHD', 'TD', 'DEBTOR', 2, 1026, FALSE, '22', NULL),
  ('SUTERA', 'SUTERA MEGAH SDN BHD', 'TD', 'DEBTOR', 2, 1027, FALSE, '22', NULL),
  ('TH', 'TIEN HOCK FOOD IND. S/B', 'TD', 'DEBTOR', 2, 1028, FALSE, '22', NULL);

-- ---------------------------------------------------------------------------
-- 2. Payload gates - fail before writing, not after
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows INT; v_codes INT; v_bad TEXT;
BEGIN
  SELECT count(*), count(DISTINCT code) INTO v_rows, v_codes FROM g3_chart;
  IF v_rows <> 503 THEN
    RAISE EXCEPTION 'G3 payload: expected 503 accounts, staged %', v_rows;
  END IF;
  IF v_codes <> v_rows THEN
    RAISE EXCEPTION 'G3 payload: % duplicate code(s) staged - descriptions are NOT unique in this chart, everything must be keyed on code', v_rows - v_codes;
  END IF;

  SELECT string_agg(code || '->' || fs_note, ', ') INTO v_bad
    FROM g3_chart c
   WHERE NOT EXISTS (
     SELECT 1 FROM greentarget.financial_statement_notes n
      WHERE n.code = c.fs_note AND n.is_active = TRUE);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 payload: account(s) whose note does not resolve to an ACTIVE GT note: %', v_bad;
  END IF;

  SELECT string_agg(code || '->' || ledger_type, ', ') INTO v_bad
    FROM g3_chart c
   WHERE NOT EXISTS (SELECT 1 FROM greentarget.ledger_types t WHERE t.code = c.ledger_type);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 payload: unknown ledger_type(s): %', v_bad;
  END IF;

  SELECT string_agg(code, ', ') INTO v_bad
    FROM g3_chart c
   WHERE c.parent_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM g3_chart p WHERE p.code = c.parent_code);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 payload: account(s) pointing at a parent that is not in the payload: %', v_bad;
  END IF;

  -- R6, non-destructive: never silently drop an account somebody else created.
  SELECT string_agg(code, ', ') INTO v_bad
    FROM greentarget.account_codes a
   WHERE NOT EXISTS (SELECT 1 FROM g3_chart c WHERE c.code = a.code);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 payload: greentarget.account_codes holds account(s) this migration does not own: % - refusing to delete them (R6). Resolve by hand.', v_bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Load. ORDER BY level so DEBTOR exists before its 28 children FK to it.
-- ---------------------------------------------------------------------------
INSERT INTO greentarget.account_codes
  (code, description, ledger_type, parent_code, level, sort_order,
   is_active, is_system, notes, fs_note, created_by, updated_by)
SELECT code, description, ledger_type, parent_code, level, sort_order,
       TRUE, is_system, notes, fs_note, 'G3_CHART_LOAD', 'G3_CHART_LOAD'
  FROM g3_chart
 ORDER BY level, sort_order
ON CONFLICT (code) DO UPDATE
  SET description = EXCLUDED.description,
      ledger_type = EXCLUDED.ledger_type,
      parent_code = EXCLUDED.parent_code,
      level       = EXCLUDED.level,
      sort_order  = EXCLUDED.sort_order,
      is_active   = EXCLUDED.is_active,
      is_system   = EXCLUDED.is_system,
      notes       = EXCLUDED.notes,
      fs_note     = EXCLUDED.fs_note,
      updated_by  = EXCLUDED.updated_by
  WHERE (greentarget.account_codes.description,
         greentarget.account_codes.ledger_type,
         greentarget.account_codes.parent_code,
         greentarget.account_codes.level,
         greentarget.account_codes.sort_order,
         greentarget.account_codes.is_active,
         greentarget.account_codes.is_system,
         greentarget.account_codes.notes,
         greentarget.account_codes.fs_note,
         greentarget.account_codes.updated_by)
     IS DISTINCT FROM
        (EXCLUDED.description, EXCLUDED.ledger_type, EXCLUDED.parent_code,
         EXCLUDED.level, EXCLUDED.sort_order, EXCLUDED.is_active,
         EXCLUDED.is_system, EXCLUDED.notes, EXCLUDED.fs_note, EXCLUDED.updated_by);

-- ---------------------------------------------------------------------------
-- 4. Verify - assert the loaded chart, then assert Tien Hock never moved
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INT; v_td INT; v_bk INT; v_tc INT; v_gl INT;
  v_children INT; v_hier INT; v_unused INT; v_bad TEXT;
  v_th g3_th_baseline%ROWTYPE;
BEGIN
  SELECT count(*) INTO v_total FROM greentarget.account_codes;
  IF v_total <> 503 THEN
    RAISE EXCEPTION 'G3 verify: expected 503 GT accounts, found %', v_total;
  END IF;

  -- Every staged row landed byte-for-byte.
  SELECT string_agg(c.code, ', ') INTO v_bad
    FROM g3_chart c
    JOIN greentarget.account_codes a ON a.code = c.code
   WHERE (a.description, a.ledger_type, a.parent_code, a.level, a.sort_order, a.is_system, a.fs_note, a.is_active)
      IS DISTINCT FROM
         (c.description, c.ledger_type, c.parent_code, c.level, c.sort_order, c.is_system, c.fs_note, TRUE);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 verify: loaded row(s) differ from the payload: %', left(v_bad, 400);
  END IF;

  SELECT count(*) FILTER (WHERE ledger_type = 'TD'),
         count(*) FILTER (WHERE ledger_type = 'BK'),
         count(*) FILTER (WHERE ledger_type = 'TC'),
         count(*) FILTER (WHERE ledger_type = 'GL')
    INTO v_td, v_bk, v_tc, v_gl
    FROM greentarget.account_codes;
  IF v_td <> 29 OR v_bk <> 5 OR v_tc <> 29 OR v_gl <> 440 THEN
    RAISE EXCEPTION 'G3 verify: ledger_type distribution is TD % / BK % / TC % / GL %, expected 29 / 5 / 29 / 440',
      v_td, v_bk, v_tc, v_gl;
  END IF;

  -- No account may leak out of the statements.
  IF EXISTS (SELECT 1 FROM greentarget.account_codes WHERE fs_note IS NULL) THEN
    RAISE EXCEPTION 'G3 verify: at least one account has a NULL fs_note';
  END IF;

  -- Exactly notes 17 and 23 are statement-only. This is the DOCUMENTED
  -- consequence of storing the APPX; if the set ever changes, say so loudly.
  SELECT count(*) INTO v_unused
    FROM greentarget.financial_statement_notes n
   WHERE NOT EXISTS (SELECT 1 FROM greentarget.account_codes a WHERE a.fs_note = n.code);
  IF v_unused <> 2
     OR EXISTS (SELECT 1 FROM greentarget.account_codes WHERE fs_note IN ('17','23')) THEN
    RAISE EXCEPTION 'G3 verify: expected exactly notes 17 and 23 to carry zero accounts, found % noteless note(s)', v_unused;
  END IF;

  -- The DEBTOR control and its 28 children.
  SELECT count(*) INTO v_children FROM greentarget.account_codes WHERE parent_code = 'DEBTOR';
  IF v_children <> 28 THEN
    RAISE EXCEPTION 'G3 verify: DEBTOR must have exactly 28 children, found %', v_children;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM greentarget.account_codes
                  WHERE code = 'DEBTOR' AND ledger_type = 'TD' AND fs_note = '22'
                    AND is_system = TRUE AND parent_code IS NULL) THEN
    RAISE EXCEPTION 'G3 verify: DEBTOR must be a root is_system TD/22 control account';
  END IF;
  -- ADD carries APPX 22 too but is a GL contra account, never a debtor child.
  IF NOT EXISTS (SELECT 1 FROM greentarget.account_codes
                  WHERE code = 'ADD' AND ledger_type = 'GL' AND parent_code IS NULL) THEN
    RAISE EXCEPTION 'G3 verify: ADD must stay a flat GL account, outside the debtor subledger';
  END IF;

  -- The named traps.
  IF NOT EXISTS (SELECT 1 FROM greentarget.account_codes WHERE code = 'PBB1')
     OR NOT EXISTS (SELECT 1 FROM greentarget.account_codes WHERE code = 'PBB_1') THEN
    RAISE EXCEPTION 'G3 verify: PBB1 and PBB_1 are two different accounts with the identical description - both must exist';
  END IF;
  SELECT string_agg(code, ', ') INTO v_bad FROM greentarget.account_codes WHERE code LIKE '% %';
  IF v_bad IS DISTINCT FROM 'AE ENTERPRISE, LEE DECOR, RUMAH MERAH, SUN TARGET' THEN
    RAISE EXCEPTION 'G3 verify: only the 4 genuine GTDB codes may contain a space, found: %', COALESCE(v_bad, '(none)');
  END IF;

  -- The hierarchy VIEW must surface the whole chart.
  SELECT count(*) INTO v_hier FROM greentarget.account_codes_hierarchy;
  IF v_hier <> 503 THEN
    RAISE EXCEPTION 'G3 verify: the hierarchy view surfaces % of 503 accounts', v_hier;
  END IF;

  -- G3 loads the chart and nothing else. G4 posts the ledger.
  IF (SELECT count(*) FROM greentarget.journal_entries)          <> 0
  OR (SELECT count(*) FROM greentarget.journal_entry_lines)      <> 0
  OR (SELECT count(*) FROM greentarget.account_opening_balances) <> 0
  OR (SELECT count(*) FROM greentarget.import_legacy_rows)       <> 0 THEN
    RAISE EXCEPTION 'G3 verify: G3 must leave journals and opening anchors empty; G4 populates them';
  END IF;

  -- ZERO IMPACT ON TIEN HOCK.
  SELECT * INTO v_th FROM g3_th_baseline;
  IF (SELECT count(*) FROM public.account_codes)             <> v_th.account_codes
  OR (SELECT count(*) FROM public.journal_entries)           <> v_th.journal_entries
  OR (SELECT count(*) FROM public.journal_entry_lines)       <> v_th.journal_entry_lines
  OR (SELECT count(*) FROM public.financial_statement_notes) <> v_th.fs_notes
  OR (SELECT count(*) FROM public.account_opening_balances)  <> v_th.opening_balances THEN
    RAISE EXCEPTION 'G3 verify: a public/Tien Hock accounting table changed - aborting';
  END IF;

  RAISE NOTICE 'G3 OK: % GT accounts (TD % / BK % / TC % / GL %), DEBTOR + % children, % surfaced by the hierarchy view; journals and anchors still empty; TH tables unchanged.',
    v_total, v_td, v_bk, v_tc, v_gl, v_children, v_hier;
END $$;

COMMIT;

\set ON_ERROR_STOP on

-- Phase V2 PRODUCTION ROLLOUT: exact 2026 legacy-report opening-stock and
-- APPX bridge, re-pinned for the production chart of accounts.
--
-- Identical approved package to 2026-07-20_legacy_report_v2_opening_stock.sql:
--   * close the RM1,456,480.37 Trial Balance residue with 63 explicit CS zero
--     fences and 62 OS debit anchors;
--   * apply the 125 approved direct fs_note changes;
--   * route finished-goods opening stock (3-1) to the Income Statement;
--   * preserve every staged/imported journal and every June checkpoint.
--
-- Only the whole-chart guard constants differ, re-pinned to the production
-- chart of accounts. Named, approved drift versus the development-audited
-- chart:
--   * SUJAYU, NG-SC           - new DEBTOR child accounts from live production
--                               use (17/18 Jul 2026); no Jan-Jun activity.
--   * LGP                     - "Local General Purchases" root account created
--                               manually in production 20 Jul 2026; its
--                               fs_note = '5' comes from the OP-to-LGP
--                               migration (2026-07-20_gp_op_to_lgp.sql).
--   * OP (Overseas Purchases) - fs_note stays NULL: the account is deprecated
--                               (user-confirmed 20 Jul 2026). Reclassing its
--                               balance to another purchase account is a
--                               later, separate step; the resulting report
--                               deviation is intentionally accepted for now.
-- Rollout order (21 Jul 2026 re-pin): run 2026-07-20_gp_op_to_lgp.sql FIRST,
-- then this script. The fresh-state fingerprint therefore pins the
-- post-OP-to-LGP chart (LGP fs_note = '5'); the final-state fingerprint pins
-- the chart after the 125 V2 fs_note changes on top of that. Re-pinned 21 Jul
-- 2026 against a fresh production copy (fresh full mapping
-- 6bafd6262089d7b217ab4ab2b5b1e4b4, final bd034913a5df1c2b9f54e7937cc9b87b;
-- structure 47b88863017669feb7dd3356eba3e051 / 2824 accounts unchanged).
-- Every other guard domain was verified fingerprint-identical to the audited
-- development state on 20 Jul 2026 (staging, IMP journals, January anchors,
-- notes metadata, June checkpoint anchors/equalities, June five-ledger
-- movement). Monthly closing stock is deliberately NOT part of this
-- migration (Phase V3). The script accepts only the exact audited fresh
-- production state or its exact final state. A final-state rerun verifies
-- and performs zero writes.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

SELECT pg_advisory_xact_lock(
  hashtextextended('legacy_jan_may_2026_journal_import', 0)
);
SELECT pg_advisory_xact_lock(
  hashtextextended('legacy_report_verification_v2', 0)
);

LOCK TABLE import_legacy_rows IN SHARE MODE;
LOCK TABLE journal_entries IN SHARE MODE;
LOCK TABLE journal_entry_lines IN SHARE MODE;
LOCK TABLE account_codes IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE financial_statement_notes IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE account_opening_balances IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE v2_anchor_targets (
  code varchar(100) PRIMARY KEY,
  expected_current_cents bigint,
  target_cents bigint NOT NULL,
  expected_current_note varchar(50) NOT NULL,
  target_note varchar(50) NOT NULL,
  evidence text NOT NULL
) ON COMMIT DROP;

INSERT INTO v2_anchor_targets (
  code,
  expected_current_cents,
  target_cents,
  expected_current_note,
  target_note,
  evidence
)
VALUES
  ('CS_B21', -430625, 0, '14-1', '14-3', 'May TB p5 r31'),
  ('CS_B23', -288750, 0, '14-1', '14-3', 'May TB p5 r33'),
  ('CS_B24', -316250, 0, '14-1', '14-3', 'May TB p5 r35'),
  ('CS_B31', -71250, 0, '14-1', '14-3', 'May TB p5 r37'),
  ('CS_B32', -1155000, 0, '14-1', '14-3', 'May TB p5 r38'),
  ('CS_B33', -654280, 0, '14-1', '14-3', 'May TB p5 r39'),
  ('CS_B34', -170756, 0, '14-1', '14-3', 'May TB p5 r40'),
  ('CS_B36', -237500, 0, '14-1', '14-3', 'May TB p5 r42'),
  ('CS_B37', -1494130, 0, '14-1', '14-3', 'May TB p5 r43'),
  ('CS_B3UD', -1697850, 0, '14-1', '14-1', 'May TB p5 r44'),
  ('CS_B5KG1', -42500, 0, '14-1', '14-3', 'May TB p5 r45'),
  ('CS_B600G', -4887300, 0, '14-1', '14-1', 'May TB p5 r46'),
  ('CS_BBER1', -5087750, 0, '14-2', '14-2', 'May TB p6 r2'),
  ('CS_BBER2', -16203250, 0, '14-2', '14-2', 'May TB p6 r3'),
  ('CS_BBER4', -7073500, 0, '14-2', '14-2', 'May TB p6 r5'),
  ('CS_BBER5', -7085250, 0, '14-2', '14-2', 'May TB p6 r6'),
  ('CS_BJAG1', -6475000, 0, '14-2', '14-2', 'May TB p6 r8'),
  ('CS_BLS1', -4397370, 0, '14-1', '14-2', 'May TB p6 r13'),
  ('CS_BNL3', -201500, 0, '14-1', '14-1', 'May TB p6 r15'),
  ('CS_BNL5', -58520, 0, '14-1', '14-1', 'May TB p6 r16'),
  ('CS_BP1', -201875, 0, '14-1', '14-3', 'May TB p6 r17'),
  ('CS_BP2', -1069640, 0, '14-1', '14-3', 'May TB p6 r18'),
  ('CS_BP600', -88340, 0, '14-1', '14-3', 'May TB p5 r34'),
  ('CS_BPB1', -435625, 0, '14-1', '14-3', 'May TB p6 r20'),
  ('CS_BPB2', -23460, 0, '14-1', '14-3', 'May TB p6 r21'),
  ('CS_BPT1', -374000, 0, '14-1', '14-3', 'May TB p6 r22'),
  ('CS_BSDM1', -75873, 0, '14-2', '14-2', 'May TB p6 r25'),
  ('CS_BTAP1', -57915, 0, '14-3', '14-3', 'May TB p6 r27'),
  ('CS_BTM1', -527500, 0, '14-1', '14-3', 'May TB p6 r31'),
  ('CS_BUP1', -249375, 0, '14-1', '14-3', 'May TB p6 r33'),
  ('CS_M2', -238125, 0, '14-1', '14-3', 'May TB p6 r37'),
  ('CS_M21', -383625, 0, '14-1', '14-3', 'May TB p6 r38'),
  ('CS_M25', -106120, 0, '14-1', '14-3', 'May TB p6 r42'),
  ('CS_M2UD', -558600, 0, '14-1', '14-1', 'May TB p7 r1'),
  ('CS_M31', -325500, 0, '14-1', '14-3', 'May TB p7 r5'),
  ('CS_M32', -34880, 0, '14-1', '14-3', 'May TB p7 r6'),
  ('CS_M33', -504000, 0, '14-1', '14-3', 'May TB p7 r7'),
  ('CS_M39', -57500, 0, '14-1', '14-3', 'May TB p7 r13'),
  ('CS_M3UD', -1528350, 0, '14-1', '14-1', 'May TB p7 r14'),
  ('CS_M41', -137500, 0, '14-1', '14-3', 'May TB p7 r16'),
  ('CS_M42', -270960, 0, '14-1', '14-3', 'May TB p7 r17'),
  ('CS_M43', -949026, 0, '14-1', '14-3', 'May TB p7 r18'),
  ('CS_M45', -778390, 0, '14-1', '14-3', 'May TB p7 r20'),
  ('CS_M46', -225625, 0, '14-1', '14-3', 'May TB p7 r21'),
  ('CS_M47', -249375, 0, '14-1', '14-3', 'May TB p7 r22'),
  ('CS_M48', -359092, 0, '14-1', '14-3', 'May TB p7 r23'),
  ('CS_M49', -261250, 0, '14-1', '14-3', 'May TB p7 r24'),
  ('CS_M50', -1593900, 0, '14-1', '14-3', 'May TB p7 r25'),
  ('CS_M51', -739200, 0, '14-1', '14-3', 'May TB p7 r26'),
  ('CS_M52', -765600, 0, '14-1', '14-3', 'May TB p7 r27'),
  ('CS_MGRM1', -54575, 0, '14-1', '14-2', 'May TB p7 r31'),
  ('CS_MK5', -309350, 0, '14-1', '14-1', 'May TB p7 r3'),
  ('CS_ML1', -870760, 0, '14-1', '14-3', 'May TB p7 r33'),
  ('CS_MM1', -941000, 0, '14-1', '14-3', 'May TB p7 r35'),
  ('CS_MM2', -13200, 0, '14-1', '14-3', 'May TB p7 r36'),
  ('CS_MNL1', -3929100, 0, '14-1', '14-1', 'May TB p7 r39'),
  ('CS_MP1', -187230, 0, '14-1', '14-3', 'May TB p7 r40'),
  ('CS_MP2', -528000, 0, '14-1', '14-3', 'May TB p7 r41'),
  ('CS_MSOD1', -34848, 0, '14-1', '14-2', 'May TB p7 r42'),
  ('CS_MT1', -206250, 0, '14-1', '14-3', 'May TB p7 r44'),
  ('CS_MTAP1', -10045, 0, '14-3', '14-3', 'May TB p7 r45'),
  ('CS_MTEP1', -2645676, 0, '14-1', '14-2', 'May TB p7 r46'),
  ('CS_MTEP3', -2031936, 0, '14-1', '14-2', 'May TB p8 r2'),
  ('OS_B21', NULL, 430625, '3-1', '3-7', 'May TB p13 r9'),
  ('OS_B23', NULL, 288750, '3-1', '3-7', 'May TB p13 r11'),
  ('OS_B24', NULL, 316250, '3-1', '3-7', 'May TB p13 r12'),
  ('OS_B31', NULL, 71250, '3-1', '3-7', 'May TB p13 r15'),
  ('OS_B32', NULL, 1127500, '3-1', '3-7', 'May TB p13 r16'),
  ('OS_B33', NULL, 751080, '3-1', '3-7', 'May TB p13 r17'),
  ('OS_B34', NULL, 193900, '3-1', '3-7', 'May TB p13 r18'),
  ('OS_B36', NULL, 237500, '3-1', '3-7', 'May TB p13 r20'),
  ('OS_B37', NULL, 1614560, '3-1', '3-7', 'May TB p13 r21'),
  ('OS_B3UD', NULL, 1846350, '3-1', '3-1', 'May TB p13 r22'),
  ('OS_B5KG1', NULL, 74375, '3-1', '3-7', 'May TB p13 r23'),
  ('OS_B600G', NULL, 1227600, '3-1', '3-1', 'May TB p13 r24'),
  ('OS_BBER2', NULL, 2244250, '3-3', '3-3', 'May TB p13 r27'),
  ('OS_BBER4', NULL, 12208250, '3-3', '3-3', 'May TB p13 r29'),
  ('OS_BBER5', NULL, 11397500, '3-3', '3-3', 'May TB p13 r30'),
  ('OS_BJAG4', NULL, 1187200, '3-3', '3-3', 'May TB p13 r35'),
  ('OS_BLS1', NULL, 5218000, '3-1', '3-3', 'May TB p13 r37'),
  ('OS_BNL3', NULL, 57350, '3-1', '3-1', 'May TB p13 r39'),
  ('OS_BNL5', NULL, 305900, '3-1', '3-1', 'May TB p13 r40'),
  ('OS_BP1', NULL, 213750, '3-1', '3-7', 'May TB p13 r41'),
  ('OS_BP2', NULL, 637560, '3-1', '3-7', 'May TB p13 r42'),
  ('OS_BP600', NULL, 88340, '3-1', '3-7', 'May TB p13 r13'),
  ('OS_BPB1', NULL, 510000, '3-1', '3-7', 'May TB p13 r44'),
  ('OS_BPB2', NULL, 23460, '3-1', '3-7', 'May TB p13 r45'),
  ('OS_BPT1', NULL, 409063, '3-1', '3-7', 'May TB p13 r46'),
  ('OS_BSDM1', NULL, 94875, '3-3', '3-3', 'May TB p14 r3'),
  ('OS_BTAP1', NULL, 138450, '3-7', '3-7', 'May TB p14 r5'),
  ('OS_BTM1', NULL, 527500, '3-1', '3-7', 'May TB p14 r10'),
  ('OS_BUP1', NULL, 249375, '3-1', '3-7', 'May TB p14 r12'),
  ('OS_M2', NULL, 238125, '3-1', '3-7', 'May TB p14 r16'),
  ('OS_M21', NULL, 383625, '3-1', '3-7', 'May TB p14 r17'),
  ('OS_M25', NULL, 106120, '3-1', '3-7', 'May TB p14 r21'),
  ('OS_M2UD', NULL, 376320, '3-1', '3-1', 'May TB p14 r26'),
  ('OS_M31', NULL, 325500, '3-1', '3-7', 'May TB p14 r30'),
  ('OS_M32', NULL, 34880, '3-1', '3-7', 'May TB p14 r31'),
  ('OS_M33', NULL, 577500, '3-1', '3-7', 'May TB p14 r32'),
  ('OS_M39', NULL, 57500, '3-1', '3-7', 'May TB p14 r38'),
  ('OS_M3UD', NULL, 556600, '3-1', '3-1', 'May TB p14 r39'),
  ('OS_M41', NULL, 165000, '3-1', '3-7', 'May TB p14 r41'),
  ('OS_M42', NULL, 270960, '3-1', '3-7', 'May TB p14 r42'),
  ('OS_M43', NULL, 949026, '3-1', '3-7', 'May TB p14 r43'),
  ('OS_M45', NULL, 778390, '3-1', '3-7', 'May TB p14 r45'),
  ('OS_M46', NULL, 225625, '3-1', '3-7', 'May TB p14 r46'),
  ('OS_M47', NULL, 249375, '3-1', '3-7', 'May TB p15 r1'),
  ('OS_M48', NULL, 359092, '3-1', '3-7', 'May TB p15 r2'),
  ('OS_M49', NULL, 261250, '3-1', '3-7', 'May TB p15 r3'),
  ('OS_M50', NULL, 1593900, '3-1', '3-7', 'May TB p15 r4'),
  ('OS_M51', NULL, 884400, '3-1', '3-7', 'May TB p15 r5'),
  ('OS_M52', NULL, 937200, '3-1', '3-7', 'May TB p15 r6'),
  ('OS_MGRM1', NULL, 19547, '3-1', '3-3', 'May TB p15 r10'),
  ('OS_MK5', NULL, 460000, '3-1', '3-1', 'May TB p14 r28'),
  ('OS_ML1', NULL, 1112144, '3-1', '3-7', 'May TB p15 r12'),
  ('OS_MM1', NULL, 996000, '3-1', '3-7', 'May TB p15 r14'),
  ('OS_MM2', NULL, 13200, '3-1', '3-7', 'May TB p15 r15'),
  ('OS_MNL1', NULL, 3609200, '3-1', '3-1', 'May TB p15 r17'),
  ('OS_MP1', NULL, 187230, '3-1', '3-7', 'May TB p15 r19'),
  ('OS_MP2', NULL, 572000, '3-1', '3-7', 'May TB p15 r20'),
  ('OS_MSOD1', NULL, 66096, '3-1', '3-3', 'May TB p15 r21'),
  ('OS_MT1', NULL, 206250, '3-1', '3-7', 'May TB p15 r23'),
  ('OS_MTAP1', NULL, 10465, '3-7', '3-7', 'May TB p15 r24'),
  ('OS_MTEP1', NULL, 1603440, '3-1', '3-3', 'May TB p15 r25'),
  ('OS_MTEP3', NULL, 810992, '3-1', '3-3', 'May TB p15 r27');

CREATE TEMP TABLE v2_mapping_targets (
  code varchar(100) PRIMARY KEY,
  expected_current_note varchar(50) NOT NULL,
  target_note varchar(50) NOT NULL,
  family varchar(20) NOT NULL CHECK (family IN ('stock', 'non_stock'))
) ON COMMIT DROP;

INSERT INTO v2_mapping_targets (
  code,
  expected_current_note,
  target_note,
  family
)
VALUES
  ('BS_IL', '5', '5-1', 'non_stock'),
  ('BS_SM', '5', '5-1', 'non_stock'),
  ('CL_ABB', '10', '11', 'non_stock'),
  ('CL_AFI', '22', '8', 'non_stock'),
  ('CL_GF', '10', '8', 'non_stock'),
  ('CL_GT', '10', '8', 'non_stock'),
  ('CS_B21', '14-1', '14-3', 'stock'),
  ('CS_B23', '14-1', '14-3', 'stock'),
  ('CS_B24', '14-1', '14-3', 'stock'),
  ('CS_B31', '14-1', '14-3', 'stock'),
  ('CS_B32', '14-1', '14-3', 'stock'),
  ('CS_B33', '14-1', '14-3', 'stock'),
  ('CS_B34', '14-1', '14-3', 'stock'),
  ('CS_B36', '14-1', '14-3', 'stock'),
  ('CS_B37', '14-1', '14-3', 'stock'),
  ('CS_B5KG1', '14-1', '14-3', 'stock'),
  ('CS_BLS1', '14-1', '14-2', 'stock'),
  ('CS_BP1', '14-1', '14-3', 'stock'),
  ('CS_BP2', '14-1', '14-3', 'stock'),
  ('CS_BP600', '14-1', '14-3', 'stock'),
  ('CS_BPB1', '14-1', '14-3', 'stock'),
  ('CS_BPB2', '14-1', '14-3', 'stock'),
  ('CS_BPT1', '14-1', '14-3', 'stock'),
  ('CS_BTM1', '14-1', '14-3', 'stock'),
  ('CS_BUP1', '14-1', '14-3', 'stock'),
  ('CS_M2', '14-1', '14-3', 'stock'),
  ('CS_M21', '14-1', '14-3', 'stock'),
  ('CS_M25', '14-1', '14-3', 'stock'),
  ('CS_M31', '14-1', '14-3', 'stock'),
  ('CS_M32', '14-1', '14-3', 'stock'),
  ('CS_M33', '14-1', '14-3', 'stock'),
  ('CS_M39', '14-1', '14-3', 'stock'),
  ('CS_M41', '14-1', '14-3', 'stock'),
  ('CS_M42', '14-1', '14-3', 'stock'),
  ('CS_M43', '14-1', '14-3', 'stock'),
  ('CS_M45', '14-1', '14-3', 'stock'),
  ('CS_M46', '14-1', '14-3', 'stock'),
  ('CS_M47', '14-1', '14-3', 'stock'),
  ('CS_M48', '14-1', '14-3', 'stock'),
  ('CS_M49', '14-1', '14-3', 'stock'),
  ('CS_M50', '14-1', '14-3', 'stock'),
  ('CS_M51', '14-1', '14-3', 'stock'),
  ('CS_M52', '14-1', '14-3', 'stock'),
  ('CS_MGRM1', '14-1', '14-2', 'stock'),
  ('CS_ML1', '14-1', '14-3', 'stock'),
  ('CS_MM1', '14-1', '14-3', 'stock'),
  ('CS_MM2', '14-1', '14-3', 'stock'),
  ('CS_MP1', '14-1', '14-3', 'stock'),
  ('CS_MP2', '14-1', '14-3', 'stock'),
  ('CS_MSOD1', '14-1', '14-2', 'stock'),
  ('CS_MT1', '14-1', '14-3', 'stock'),
  ('CS_MTEP1', '14-1', '14-2', 'stock'),
  ('CS_MTEP3', '14-1', '14-2', 'stock'),
  ('MBE_IL', '5', '5-1', 'non_stock'),
  ('MBE_M', '5', '5-1', 'non_stock'),
  ('MBE_SM', '5', '5-1', 'non_stock'),
  ('MBE_TS', '5', '5-1', 'non_stock'),
  ('MBL_IL', '5', '5-1', 'non_stock'),
  ('MBL_M', '5', '5-1', 'non_stock'),
  ('MBL_SM', '5', '5-1', 'non_stock'),
  ('MBL_TS', '5', '5-1', 'non_stock'),
  ('MBS_ILO', '5', '5-1', 'non_stock'),
  ('MBS_M', '5', '5-1', 'non_stock'),
  ('MBS_SMO', '5', '5-1', 'non_stock'),
  ('MBS_TS', '5', '5-1', 'non_stock'),
  ('MBSC_IL', '5', '5-1', 'non_stock'),
  ('MBSC_M', '5', '5-1', 'non_stock'),
  ('MBSC_SM', '5', '5-1', 'non_stock'),
  ('MBSC_TS', '5', '5-1', 'non_stock'),
  ('MBSIP_IL', '5', '5-1', 'non_stock'),
  ('MBSIP_M', '5', '5-1', 'non_stock'),
  ('MBSIP_SM', '5', '5-1', 'non_stock'),
  ('MBSIP_TS', '5', '5-1', 'non_stock'),
  ('MBSM_K', '5-1', '5', 'non_stock'),
  ('MS_IL', '5', '5-1', 'non_stock'),
  ('MS_SM', '5', '5-1', 'non_stock'),
  ('OC_CMK', '10', '1', 'non_stock'),
  ('OC_MIL', '10', '1', 'non_stock'),
  ('OS_B21', '3-1', '3-7', 'stock'),
  ('OS_B23', '3-1', '3-7', 'stock'),
  ('OS_B24', '3-1', '3-7', 'stock'),
  ('OS_B31', '3-1', '3-7', 'stock'),
  ('OS_B32', '3-1', '3-7', 'stock'),
  ('OS_B33', '3-1', '3-7', 'stock'),
  ('OS_B34', '3-1', '3-7', 'stock'),
  ('OS_B36', '3-1', '3-7', 'stock'),
  ('OS_B37', '3-1', '3-7', 'stock'),
  ('OS_B5KG1', '3-1', '3-7', 'stock'),
  ('OS_BLS1', '3-1', '3-3', 'stock'),
  ('OS_BP1', '3-1', '3-7', 'stock'),
  ('OS_BP2', '3-1', '3-7', 'stock'),
  ('OS_BP600', '3-1', '3-7', 'stock'),
  ('OS_BPB1', '3-1', '3-7', 'stock'),
  ('OS_BPB2', '3-1', '3-7', 'stock'),
  ('OS_BPT1', '3-1', '3-7', 'stock'),
  ('OS_BTM1', '3-1', '3-7', 'stock'),
  ('OS_BUP1', '3-1', '3-7', 'stock'),
  ('OS_M2', '3-1', '3-7', 'stock'),
  ('OS_M21', '3-1', '3-7', 'stock'),
  ('OS_M25', '3-1', '3-7', 'stock'),
  ('OS_M31', '3-1', '3-7', 'stock'),
  ('OS_M32', '3-1', '3-7', 'stock'),
  ('OS_M33', '3-1', '3-7', 'stock'),
  ('OS_M39', '3-1', '3-7', 'stock'),
  ('OS_M41', '3-1', '3-7', 'stock'),
  ('OS_M42', '3-1', '3-7', 'stock'),
  ('OS_M43', '3-1', '3-7', 'stock'),
  ('OS_M45', '3-1', '3-7', 'stock'),
  ('OS_M46', '3-1', '3-7', 'stock'),
  ('OS_M47', '3-1', '3-7', 'stock'),
  ('OS_M48', '3-1', '3-7', 'stock'),
  ('OS_M49', '3-1', '3-7', 'stock'),
  ('OS_M50', '3-1', '3-7', 'stock'),
  ('OS_M51', '3-1', '3-7', 'stock'),
  ('OS_M52', '3-1', '3-7', 'stock'),
  ('OS_MGRM1', '3-1', '3-3', 'stock'),
  ('OS_ML1', '3-1', '3-7', 'stock'),
  ('OS_MM1', '3-1', '3-7', 'stock'),
  ('OS_MM2', '3-1', '3-7', 'stock'),
  ('OS_MP1', '3-1', '3-7', 'stock'),
  ('OS_MP2', '3-1', '3-7', 'stock'),
  ('OS_MSOD1', '3-1', '3-3', 'stock'),
  ('OS_MT1', '3-1', '3-7', 'stock'),
  ('OS_MTEP1', '3-1', '3-3', 'stock'),
  ('OS_MTEP3', '3-1', '3-3', 'stock');

CREATE TEMP TABLE v2_state (
  mode varchar(10) PRIMARY KEY CHECK (mode IN ('fresh', 'final'))
) ON COMMIT DROP;

CREATE TEMP TABLE v2_expected_june_ledgers (
  account_code varchar(100) PRIMARY KEY,
  row_count bigint NOT NULL,
  zero_count bigint NOT NULL,
  debit_cents bigint NOT NULL,
  credit_cents bigint NOT NULL,
  fingerprint text NOT NULL
) ON COMMIT DROP;

INSERT INTO v2_expected_june_ledgers (
  account_code,
  row_count,
  zero_count,
  debit_cents,
  credit_cents,
  fingerprint
)
VALUES
  ('BANK_PBB', 278, 0, 68538869, 64493848, '09209a401c024effb08fa5de3c9b1617'),
  ('CASH_SALES', 236, 29, 0, 21333110, '7e5f2baca14127585be223333a246701'),
  ('CH_REV1', 306, 29, 21333110, 21478490, 'eb0a90c0ab44cbed45ef67834f2946d2'),
  ('CH_REV2', 20, 0, 720270, 814520, 'b80b77bbd503a85a3c93a0fdcef372fc'),
  ('CR_SALES', 190, 5, 15835, 51309680, '84174e30c95a3907225dec9f1d20a32b');

DO $target_definition$
DECLARE
  v_anchor_fingerprint text;
  v_mapping_fingerprint text;
BEGIN
  SELECT MD5(STRING_AGG(
           FORMAT(
             '%s|%s|%s|%s',
             code,
             COALESCE(expected_current_cents::text, '<absent>'),
             target_cents,
             target_note
           ),
           E'\n' ORDER BY code
         ))
    INTO v_anchor_fingerprint
    FROM v2_anchor_targets;

  SELECT MD5(STRING_AGG(
           FORMAT('%s|%s|%s', code, expected_current_note, target_note),
           E'\n' ORDER BY code
         ))
    INTO v_mapping_fingerprint
    FROM v2_mapping_targets;

  IF (
       (SELECT COUNT(*) FROM v2_anchor_targets),
       (SELECT COUNT(*) FROM v2_anchor_targets
          WHERE expected_current_cents IS NOT NULL),
       (SELECT COUNT(*) FROM v2_anchor_targets
          WHERE expected_current_cents IS NULL),
       (SELECT COALESCE(SUM(expected_current_cents), 0)
          FROM v2_anchor_targets),
       (SELECT COALESCE(SUM(target_cents), 0)
          FROM v2_anchor_targets),
       v_anchor_fingerprint
     ) IS DISTINCT FROM (
       125::bigint,
       63::bigint,
       62::bigint,
       -82960522::numeric,
       62687515::numeric,
       'f5453f2cb75ad849c7e14c3af7959c44'::text
     ) THEN
    RAISE EXCEPTION
      'V2 anchor target definition is not the approved 125-account package';
  END IF;

  IF (
       (SELECT COUNT(*) FROM v2_mapping_targets),
       (SELECT COUNT(*) FROM v2_mapping_targets WHERE family = 'stock'),
       (SELECT COUNT(*) FROM v2_mapping_targets WHERE family = 'non_stock'),
       (SELECT COUNT(DISTINCT code)
          FROM (
            SELECT code FROM v2_anchor_targets
            UNION
            SELECT code FROM v2_mapping_targets
          ) target_codes),
       v_mapping_fingerprint
     ) IS DISTINCT FROM (
       125::bigint,
       94::bigint,
       31::bigint,
       156::bigint,
       '93606f2d76e3e9f8b16654598314fddf'::text
     ) THEN
    RAISE EXCEPTION
      'V2 APPX target definition is not the approved 125-change/156-account package';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM v2_mapping_targets
    WHERE expected_current_note = target_note
  ) THEN
    RAISE EXCEPTION 'V2 mapping target contains a no-op row';
  END IF;
END
$target_definition$;

-- Snapshot immutable source/import populations inside the same locked
-- transaction. The fixed semantic fingerprints make the input portable; these
-- complete-row snapshots prove this migration itself changes none of them.
CREATE TEMP TABLE v2_staging_before ON COMMIT DROP AS
SELECT stage_sequence, TO_JSONB(r) AS row_data
FROM import_legacy_rows r;

CREATE UNIQUE INDEX v2_staging_before_pk
  ON v2_staging_before (stage_sequence);

CREATE TEMP TABLE v2_imp_headers_before ON COMMIT DROP AS
SELECT id, TO_JSONB(h) AS row_data
FROM journal_entries h
WHERE h.entry_type = 'IMP';

CREATE UNIQUE INDEX v2_imp_headers_before_pk
  ON v2_imp_headers_before (id);

CREATE TEMP TABLE v2_imp_lines_before ON COMMIT DROP AS
SELECT l.id, TO_JSONB(l) AS row_data
FROM journal_entries h
JOIN journal_entry_lines l ON l.journal_entry_id = h.id
WHERE h.entry_type = 'IMP';

CREATE UNIQUE INDEX v2_imp_lines_before_pk
  ON v2_imp_lines_before (id);

CREATE TEMP TABLE v2_june_anchors_before ON COMMIT DROP AS
SELECT id, TO_JSONB(a) AS row_data
FROM account_opening_balances a
WHERE a.as_of_date = DATE '2026-06-01';

CREATE UNIQUE INDEX v2_june_anchors_before_pk
  ON v2_june_anchors_before (id);

DO $immutable_preflight$
DECLARE
  v_rows bigint;
  v_openings bigint;
  v_transactions bigint;
  v_groups bigint;
  v_debit_cents bigint;
  v_credit_cents bigint;
  v_repaired bigint;
  v_derived bigint;
  v_min_sequence integer;
  v_max_sequence integer;
  v_hashes text;
  v_fingerprint text;
  v_imp_headers bigint;
  v_imp_sources bigint;
  v_imp_distinct_sources bigint;
  v_imp_header_debit bigint;
  v_imp_header_credit bigint;
  v_imp_unbalanced bigint;
  v_imp_header_fingerprint text;
  v_imp_lines bigint;
  v_imp_line_debit bigint;
  v_imp_line_credit bigint;
  v_imp_line_fingerprint text;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE record_kind = 'opening'),
         COUNT(*) FILTER (WHERE record_kind = 'transaction'),
         COUNT(DISTINCT journal_group_key)
           FILTER (WHERE record_kind = 'transaction'),
         COALESCE(SUM(debit_cents)
           FILTER (WHERE record_kind = 'transaction'), 0)::bigint,
         COALESCE(SUM(credit_cents)
           FILTER (WHERE record_kind = 'transaction'), 0)::bigint,
         COUNT(*) FILTER (WHERE repaired),
         COUNT(*) FILTER (WHERE source_kind = 'DERIVED'),
         MIN(stage_sequence),
         MAX(stage_sequence),
         STRING_AGG(DISTINCT source_sha256, ', ' ORDER BY source_sha256),
         MD5(COALESCE(STRING_AGG(
           JSONB_BUILD_ARRAY(
             stage_sequence,
             record_kind,
             source_kind,
             source_sha256,
             source_physical_line,
             account_code,
             entry_date::text,
             journal_ref,
             journal_group_key,
             line_display_reference,
             particulars,
             cheque_reference,
             debit_cents,
             credit_cents,
             running_balance_cents,
             repaired,
             special_case
           )::text,
           E'\n' ORDER BY stage_sequence
         ), ''))
    INTO v_rows, v_openings, v_transactions, v_groups,
         v_debit_cents, v_credit_cents, v_repaired, v_derived,
         v_min_sequence, v_max_sequence, v_hashes, v_fingerprint
    FROM import_legacy_rows;

  IF (
       v_rows,
       v_openings,
       v_transactions,
       v_groups,
       v_debit_cents,
       v_credit_cents,
       v_repaired,
       v_derived,
       v_min_sequence,
       v_max_sequence,
       v_hashes,
       v_fingerprint
     ) IS DISTINCT FROM (
       12635::bigint,
       2567::bigint,
       10068::bigint,
       3863::bigint,
       1350351615::bigint,
       1350351615::bigint,
       8::bigint,
       2::bigint,
       1,
       12635,
       '6230d4613768f3f1b51c6195852560446103e39b57b2deb8ac575d8c8ecaa918, 6ef5ee949cca9b7903cff5ede201bea5d6e6bc8d341c45e91ea060aeac905a81'::text,
       '70865390988ff2205b08ce4a972a0f96'::text
     ) THEN
    RAISE EXCEPTION
      'Staged Jan-May import differs from the exact audited V2 input';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (
           WHERE source_type = 'legacy_import' AND source_id IS NOT NULL
         ),
         COUNT(DISTINCT source_id),
         COALESCE(SUM(ROUND(total_debit * 100)::bigint), 0),
         COALESCE(SUM(ROUND(total_credit * 100)::bigint), 0),
         COUNT(*) FILTER (
           WHERE ROUND(total_debit * 100)::bigint
              <> ROUND(total_credit * 100)::bigint
         ),
         MD5(STRING_AGG(
           JSONB_BUILD_ARRAY(
             reference_no,
             entry_type,
             entry_date::text,
             description,
             ROUND(total_debit * 100)::bigint,
             ROUND(total_credit * 100)::bigint,
             status,
             cheque_no,
             display_reference,
             legacy_entry_type,
             posting_sequence,
             source_type,
             source_id,
             manual_override,
             created_by,
             posted_by
           )::text,
           E'\n' ORDER BY reference_no
         ))
    INTO v_imp_headers, v_imp_sources, v_imp_distinct_sources,
         v_imp_header_debit, v_imp_header_credit, v_imp_unbalanced,
         v_imp_header_fingerprint
    FROM journal_entries
    WHERE entry_type = 'IMP';

  SELECT COUNT(*),
         COALESCE(SUM(ROUND(l.debit_amount * 100)::bigint), 0),
         COALESCE(SUM(ROUND(l.credit_amount * 100)::bigint), 0),
         MD5(STRING_AGG(
           JSONB_BUILD_ARRAY(
             h.reference_no,
             l.line_number,
             l.account_code,
             ROUND(l.debit_amount * 100)::bigint,
             ROUND(l.credit_amount * 100)::bigint,
             l.reference,
             l.particulars,
             l.cheque_reference,
             l.display_order,
             l.display_reference
           )::text,
           E'\n' ORDER BY h.reference_no, l.line_number
         ))
    INTO v_imp_lines, v_imp_line_debit, v_imp_line_credit,
         v_imp_line_fingerprint
    FROM journal_entries h
    JOIN journal_entry_lines l ON l.journal_entry_id = h.id
    WHERE h.entry_type = 'IMP';

  IF (
       v_imp_headers,
       v_imp_sources,
       v_imp_distinct_sources,
       v_imp_header_debit,
       v_imp_header_credit,
       v_imp_unbalanced,
       v_imp_header_fingerprint,
       v_imp_lines,
       v_imp_line_debit,
       v_imp_line_credit,
       v_imp_line_fingerprint
     ) IS DISTINCT FROM (
       3863::bigint,
       3863::bigint,
       3863::bigint,
       1350351615::numeric,
       1350351615::numeric,
       0::bigint,
       '5c40ef347041238a1a45939c87450d4c'::text,
       10068::bigint,
       1350351615::numeric,
       1350351615::numeric,
       '07196fc286a6a951907baed88bbe04da'::text
     ) THEN
    RAISE EXCEPTION
      'Posted IMP journals differ from the exact immutable V2 input';
  END IF;
END
$immutable_preflight$;

DO $state_preflight$
DECLARE
  v_account_count bigint;
  v_active_target_count bigint;
  v_structure_fingerprint text;
  v_full_mapping_fingerprint text;
  v_anchor_actual_fingerprint text;
  v_selected_mapping_fingerprint text;
  v_selected_direct_fingerprint text;
  v_notes_fingerprint text;
  v_jan_count bigint;
  v_jan_nonzero bigint;
  v_jan_zero bigint;
  v_jan_debit_count bigint;
  v_jan_credit_count bigint;
  v_jan_debit_cents bigint;
  v_jan_credit_cents bigint;
  v_jan_net_cents bigint;
  v_jan_fingerprint text;
  v_fresh_anchor_provenance bigint;
  v_final_anchor_provenance bigint;
  v_is_fresh boolean;
  v_is_final boolean;
BEGIN
  SELECT COUNT(*),
         MD5(STRING_AGG(
           FORMAT(
             '%s|%s|%s|%s',
             code,
             COALESCE(ledger_type, '<null>'),
             COALESCE(parent_code, '<null>'),
             COALESCE(is_active::text, '<null>')
           ),
           E'\n' ORDER BY code
         )),
         MD5(STRING_AGG(
           FORMAT(
             '%s|%s|%s|%s|%s',
             code,
             COALESCE(ledger_type, '<null>'),
             COALESCE(parent_code, '<null>'),
             COALESCE(is_active::text, '<null>'),
             COALESCE(fs_note, '<null>')
           ),
           E'\n' ORDER BY code
         ))
    INTO v_account_count, v_structure_fingerprint,
         v_full_mapping_fingerprint
    FROM account_codes;

  IF (
       v_account_count,
       v_structure_fingerprint
     ) IS DISTINCT FROM (
       2824::bigint,
       '47b88863017669feb7dd3356eba3e051'::text
     ) THEN
    RAISE EXCEPTION 'Chart of accounts differs from the exact V2 structure';
  END IF;

  SELECT COUNT(*)
    INTO v_active_target_count
    FROM account_codes ac
    JOIN (
      SELECT code FROM v2_anchor_targets
      UNION
      SELECT code FROM v2_mapping_targets
    ) targets ON targets.code = ac.code
    WHERE ac.is_active = true;

  IF v_active_target_count <> 156 THEN
    RAISE EXCEPTION
      'Expected all 156 V2 target accounts to exist and be active; found %',
      v_active_target_count;
  END IF;

  IF EXISTS (
    SELECT target_note FROM v2_anchor_targets
    UNION
    SELECT target_note FROM v2_mapping_targets
    EXCEPT
    SELECT code FROM financial_statement_notes WHERE is_active = true
  ) THEN
    RAISE EXCEPTION 'A required V2 financial-statement note is missing/inactive';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM v2_anchor_targets t
    JOIN account_opening_balances a ON a.account_code = t.code
    WHERE a.as_of_date = DATE '2026-06-01'
  ) THEN
    RAISE EXCEPTION
      'A V2 target account overlaps a 2026-06-01 checkpoint anchor';
  END IF;

  SELECT MD5(STRING_AGG(
           FORMAT(
             '%s|%s',
             t.code,
             CASE
               WHEN a.id IS NULL THEN '<absent>'
               ELSE ROUND(a.amount * 100)::bigint::text
             END
           ),
           E'\n' ORDER BY t.code
         ))
    INTO v_anchor_actual_fingerprint
    FROM v2_anchor_targets t
    LEFT JOIN account_opening_balances a
      ON a.account_code = t.code
     AND a.as_of_date = DATE '2026-01-01';

  WITH RECURSIVE walk AS (
    SELECT ac.code AS origin, ac.parent_code, ac.fs_note, 0 AS depth
    FROM account_codes ac
    UNION ALL
    SELECT w.origin, parent.parent_code, parent.fs_note, w.depth + 1
    FROM walk w
    JOIN account_codes parent ON parent.code = w.parent_code
    WHERE w.fs_note IS NULL
  ),
  effective AS (
    SELECT DISTINCT ON (origin) origin AS code, fs_note
    FROM walk
    WHERE fs_note IS NOT NULL
    ORDER BY origin, depth
  )
  SELECT MD5(STRING_AGG(
           FORMAT(
             '%s|%s|%s',
             t.code,
             COALESCE(ac.fs_note, '<null>'),
             COALESCE(e.fs_note, '<null>')
           ),
           E'\n' ORDER BY t.code
         ))
    INTO v_selected_mapping_fingerprint
    FROM v2_mapping_targets t
    LEFT JOIN account_codes ac ON ac.code = t.code
    LEFT JOIN effective e ON e.code = t.code;

  SELECT MD5(STRING_AGG(
           FORMAT('%s|%s', t.code, COALESCE(ac.fs_note, '<null>')),
           E'\n' ORDER BY t.code
         ))
    INTO v_selected_direct_fingerprint
    FROM v2_mapping_targets t
    LEFT JOIN account_codes ac ON ac.code = t.code;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE amount <> 0),
         COUNT(*) FILTER (WHERE amount = 0),
         COUNT(*) FILTER (WHERE amount > 0),
         COUNT(*) FILTER (WHERE amount < 0),
         COALESCE(SUM(
           CASE WHEN amount > 0 THEN ROUND(amount * 100)::bigint ELSE 0 END
         ), 0),
         COALESCE(SUM(
           CASE WHEN amount < 0 THEN -ROUND(amount * 100)::bigint ELSE 0 END
         ), 0),
         COALESCE(SUM(ROUND(amount * 100)::bigint), 0),
         MD5(STRING_AGG(
           FORMAT('%s|%s', account_code, ROUND(amount * 100)::bigint),
           E'\n' ORDER BY account_code
         ))
    INTO v_jan_count, v_jan_nonzero, v_jan_zero,
         v_jan_debit_count, v_jan_credit_count,
         v_jan_debit_cents, v_jan_credit_cents, v_jan_net_cents,
         v_jan_fingerprint
    FROM account_opening_balances
    WHERE as_of_date = DATE '2026-01-01';

  SELECT MD5(STRING_AGG(
           FORMAT(
             '%s|%s|%s|%s|%s|%s',
             code,
             category,
             report_section,
             normal_balance,
             COALESCE(parent_note, '<null>'),
             is_active
           ),
           E'\n' ORDER BY code
         ))
    INTO v_notes_fingerprint
    FROM financial_statement_notes;

  SELECT COUNT(*)
    INTO v_fresh_anchor_provenance
    FROM v2_anchor_targets t
    JOIN account_opening_balances a
      ON a.account_code = t.code
     AND a.as_of_date = DATE '2026-01-01'
    WHERE t.expected_current_cents IS NOT NULL
      AND a.notes = 'Legacy Jan-May 2026 opening from hash-validated ledger export'
      AND a.created_by = 'legacy-import';

  SELECT COUNT(*)
    INTO v_final_anchor_provenance
    FROM v2_anchor_targets t
    JOIN account_opening_balances a
      ON a.account_code = t.code
     AND a.as_of_date = DATE '2026-01-01'
    WHERE (
      t.expected_current_cents IS NOT NULL
      AND a.notes =
        'Legacy report V2 zero fence from hash-validated 2026 Trial Balance'
      AND a.created_by = 'legacy-import'
    ) OR (
      t.expected_current_cents IS NULL
      AND a.notes =
        'Legacy report V2 opening stock from hash-validated 2026 Trial Balance'
      AND a.created_by = 'legacy-report-v2'
    );

  v_is_fresh :=
    v_anchor_actual_fingerprint =
      '8259bdce663423b55072b09ff569a3e3'
    AND v_selected_mapping_fingerprint =
      '436f3b19d2afeef3d0574efe21cb9130'
    AND v_full_mapping_fingerprint =
      '6bafd6262089d7b217ab4ab2b5b1e4b4'
    AND v_notes_fingerprint =
      '207672fcc7fa80508a233cc2261be74c'
    AND (
      v_jan_count,
      v_jan_nonzero,
      v_jan_zero,
      v_jan_debit_count,
      v_jan_credit_count,
      v_jan_debit_cents,
      v_jan_credit_cents,
      v_jan_net_cents,
      v_jan_fingerprint
    ) = (
      580::bigint,
      291::bigint,
      289::bigint,
      168::bigint,
      123::bigint,
      1255380603::bigint,
      1401028640::bigint,
      -145648037::bigint,
      'afc4e03012c5052c0fd176d4caef9c48'::text
    )
    AND v_fresh_anchor_provenance = 63
    AND EXISTS (
      SELECT 1
      FROM financial_statement_notes
      WHERE code = '3-1'
        AND name = 'Opening Stock (Finished Products)'
        AND description IS NULL
        AND category = 'cogs'
        AND report_section = 'cogm'
        AND normal_balance = 'debit'
        AND sort_order = 600
        AND parent_note = '3'
        AND is_active = true
    );

  v_is_final :=
    v_anchor_actual_fingerprint =
      '5e1c54ba21a45ee181a7510704c23869'
    AND v_selected_direct_fingerprint =
      'feeb81bf0e1310e1d7d0617b10c34c2d'
    AND v_full_mapping_fingerprint =
      'bd034913a5df1c2b9f54e7937cc9b87b'
    AND v_notes_fingerprint =
      'bff4355c4a1206a2770ad9dac3385d4c'
    AND (
      v_jan_count,
      v_jan_nonzero,
      v_jan_zero,
      v_jan_debit_count,
      v_jan_credit_count,
      v_jan_debit_cents,
      v_jan_credit_cents,
      v_jan_net_cents,
      v_jan_fingerprint
    ) = (
      642::bigint,
      290::bigint,
      352::bigint,
      230::bigint,
      60::bigint,
      1318068118::bigint,
      1318068118::bigint,
      0::bigint,
      '88ed6a12bc372c7d8d2da9ca45342555'::text
    )
    AND v_final_anchor_provenance = 125
    AND EXISTS (
      SELECT 1
      FROM financial_statement_notes
      WHERE code = '3-1'
        AND name = 'Opening Stock (Finished Products)'
        AND description IS NULL
        AND category = 'cogs'
        AND report_section = 'income_statement'
        AND normal_balance = 'debit'
        AND sort_order = 600
        AND parent_note = '3'
        AND is_active = true
    );

  IF v_is_fresh = v_is_final OR NOT (v_is_fresh OR v_is_final) THEN
    RAISE EXCEPTION
      'V2 preflight requires one exact wholly fresh or wholly final state (fresh %, final %)',
      v_is_fresh,
      v_is_final;
  END IF;

  INSERT INTO v2_state (mode)
  VALUES (CASE WHEN v_is_fresh THEN 'fresh' ELSE 'final' END);
END
$state_preflight$;

DO $june_preflight$
DECLARE
  v_count bigint;
  v_net_cents bigint;
  v_fingerprint text;
  v_checkpoint_count bigint;
  v_checkpoint_exact bigint;
  v_ledger_count bigint;
  v_combined_fingerprint text;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(ROUND(amount * 100)::bigint), 0),
         MD5(STRING_AGG(
           FORMAT('%s|%s', account_code, ROUND(amount * 100)::bigint),
           E'\n' ORDER BY account_code
         ))
    INTO v_count, v_net_cents, v_fingerprint
    FROM account_opening_balances
    WHERE as_of_date = DATE '2026-06-01';

  IF (
       v_count,
       v_net_cents,
       v_fingerprint
     ) IS DISTINCT FROM (
       1571::bigint,
       -261795905::bigint,
       'c23e0a2f28a7303e34679eea92b4e302'::text
     ) THEN
    RAISE EXCEPTION 'June checkpoint anchors differ from the audited V2 input';
  END IF;

  WITH movement AS (
    SELECT
      l.account_code,
      SUM(
        COALESCE(l.debit_amount, 0) - COALESCE(l.credit_amount, 0)
      ) AS amount
    FROM journal_entry_lines l
    JOIN journal_entries h ON h.id = l.journal_entry_id
    WHERE h.status = 'posted'
      AND h.entry_date >= DATE '2026-01-01'
      AND h.entry_date < DATE '2026-06-01'
    GROUP BY l.account_code
  ),
  checkpoint_checks AS (
    SELECT
      june.account_code,
      ROUND((
        COALESCE(jan.amount, 0)
        + COALESCE(movement.amount, 0)
        - june.amount
      ) * 100)::bigint AS difference_cents
    FROM account_opening_balances june
    LEFT JOIN account_opening_balances jan
      ON jan.account_code = june.account_code
     AND jan.as_of_date = DATE '2026-01-01'
    LEFT JOIN movement ON movement.account_code = june.account_code
    WHERE june.as_of_date = DATE '2026-06-01'
  )
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE difference_cents = 0)
    INTO v_checkpoint_count, v_checkpoint_exact
    FROM checkpoint_checks;

  IF (
       v_checkpoint_count,
       v_checkpoint_exact
     ) IS DISTINCT FROM (
       1571::bigint,
       1571::bigint
     ) THEN
    RAISE EXCEPTION
      'Only % of % June checkpoint equalities remain exact',
      v_checkpoint_exact,
      v_checkpoint_count;
  END IF;

  WITH actual AS (
    SELECT
      l.account_code,
      COUNT(*) AS row_count,
      COUNT(*) FILTER (
        WHERE l.debit_amount = 0 AND l.credit_amount = 0
      ) AS zero_count,
      COALESCE(SUM(ROUND(l.debit_amount * 100)::bigint), 0) AS debit_cents,
      COALESCE(SUM(ROUND(l.credit_amount * 100)::bigint), 0) AS credit_cents,
      MD5(STRING_AGG(
        JSONB_BUILD_ARRAY(
          h.entry_date::text,
          COALESCE(l.display_reference, h.display_reference, h.reference_no),
          ROUND(l.debit_amount * 100)::bigint,
          ROUND(l.credit_amount * 100)::bigint,
          l.particulars,
          COALESCE(l.cheque_reference, h.cheque_no),
          h.posting_sequence,
          l.display_order
        )::text,
        E'\n' ORDER BY
          h.entry_date,
          h.posting_sequence NULLS LAST,
          h.id,
          l.display_order NULLS LAST,
          l.id
      )) AS fingerprint
    FROM journal_entries h
    JOIN journal_entry_lines l ON l.journal_entry_id = h.id
    WHERE h.status = 'posted'
      AND h.entry_date >= DATE '2026-06-01'
      AND h.entry_date < DATE '2026-07-01'
      AND l.account_code IN (
        'BANK_PBB',
        'CASH_SALES',
        'CH_REV1',
        'CH_REV2',
        'CR_SALES'
      )
    GROUP BY l.account_code
  )
  SELECT COUNT(*)
    INTO v_ledger_count
    FROM actual
    JOIN v2_expected_june_ledgers expected USING (account_code)
    WHERE (
      actual.row_count,
      actual.zero_count,
      actual.debit_cents,
      actual.credit_cents,
      actual.fingerprint
    ) = (
      expected.row_count,
      expected.zero_count,
      expected.debit_cents,
      expected.credit_cents,
      expected.fingerprint
    );

  IF v_ledger_count <> 5 THEN
    RAISE EXCEPTION
      'June five-ledger movement differs from the exact audited V2 input';
  END IF;

  SELECT MD5(STRING_AGG(
           JSONB_BUILD_ARRAY(
             l.account_code,
             h.entry_date::text,
             COALESCE(l.display_reference, h.display_reference, h.reference_no),
             ROUND(l.debit_amount * 100)::bigint,
             ROUND(l.credit_amount * 100)::bigint,
             l.particulars,
             COALESCE(l.cheque_reference, h.cheque_no),
             h.posting_sequence,
             l.display_order
           )::text,
           E'\n' ORDER BY
             l.account_code,
             h.entry_date,
             h.posting_sequence NULLS LAST,
             h.id,
             l.display_order NULLS LAST,
             l.id
         ))
    INTO v_combined_fingerprint
    FROM journal_entries h
    JOIN journal_entry_lines l ON l.journal_entry_id = h.id
    WHERE h.status = 'posted'
      AND h.entry_date >= DATE '2026-06-01'
      AND h.entry_date < DATE '2026-07-01'
      AND l.account_code IN (
        'BANK_PBB',
        'CASH_SALES',
        'CH_REV1',
        'CH_REV2',
        'CR_SALES'
      );

  IF v_combined_fingerprint <> '18428fb1fcf51dddbc1ad4f3aa2e60ba' THEN
    RAISE EXCEPTION
      'Combined June five-ledger fingerprint differs from the V2 baseline';
  END IF;
END
$june_preflight$;

DO $apply_v2$
DECLARE
  v_mode varchar(10);
  v_updated_cs integer := 0;
  v_inserted_os integer := 0;
  v_updated_mappings integer := 0;
  v_updated_note integer := 0;
BEGIN
  SELECT mode INTO STRICT v_mode FROM v2_state;

  IF v_mode = 'fresh' THEN
    UPDATE account_opening_balances a
       SET amount = 0,
           notes =
             'Legacy report V2 zero fence from hash-validated 2026 Trial Balance',
           updated_at = CURRENT_TIMESTAMP
      FROM v2_anchor_targets target
     WHERE target.code = a.account_code
       AND target.expected_current_cents IS NOT NULL
       AND a.as_of_date = DATE '2026-01-01'
       AND ROUND(a.amount * 100)::bigint =
         target.expected_current_cents;
    GET DIAGNOSTICS v_updated_cs = ROW_COUNT;

    INSERT INTO account_opening_balances (
      account_code,
      as_of_date,
      amount,
      notes,
      created_by
    )
    SELECT
      target.code,
      DATE '2026-01-01',
      target.target_cents::numeric / 100,
      'Legacy report V2 opening stock from hash-validated 2026 Trial Balance',
      'legacy-report-v2'
    FROM v2_anchor_targets target
    WHERE target.expected_current_cents IS NULL;
    GET DIAGNOSTICS v_inserted_os = ROW_COUNT;

    UPDATE account_codes ac
       SET fs_note = target.target_note,
           updated_at = CURRENT_TIMESTAMP
      FROM v2_mapping_targets target
     WHERE target.code = ac.code
       AND ac.fs_note = target.expected_current_note;
    GET DIAGNOSTICS v_updated_mappings = ROW_COUNT;

    UPDATE financial_statement_notes
       SET report_section = 'income_statement',
           updated_at = CURRENT_TIMESTAMP
     WHERE code = '3-1'
       AND report_section = 'cogm';
    GET DIAGNOSTICS v_updated_note = ROW_COUNT;

    IF (
         v_updated_cs,
         v_inserted_os,
         v_updated_mappings,
         v_updated_note
       ) IS DISTINCT FROM (
         63,
         62,
         125,
         1
       ) THEN
      RAISE EXCEPTION
        'V2 mutation count mismatch (CS %, OS %, mappings %, note %)',
        v_updated_cs,
        v_inserted_os,
        v_updated_mappings,
        v_updated_note;
    END IF;
  END IF;

  RAISE NOTICE
    'V2 state %: CS updates %, OS inserts %, mapping updates %, note updates %',
    v_mode,
    v_updated_cs,
    v_inserted_os,
    v_updated_mappings,
    v_updated_note;
END
$apply_v2$;

DO $final_postconditions$
DECLARE
  v_account_count bigint;
  v_structure_fingerprint text;
  v_full_mapping_fingerprint text;
  v_notes_fingerprint text;
  v_jan_count bigint;
  v_jan_nonzero bigint;
  v_jan_zero bigint;
  v_jan_debit_count bigint;
  v_jan_credit_count bigint;
  v_jan_debit_cents bigint;
  v_jan_credit_cents bigint;
  v_jan_net_cents bigint;
  v_jan_fingerprint text;
  v_anchor_actual_fingerprint text;
  v_anchor_provenance bigint;
  v_staging_fingerprint text;
  v_imp_header_fingerprint text;
  v_imp_line_fingerprint text;
  v_june_fingerprint text;
  v_checkpoint_count bigint;
  v_checkpoint_exact bigint;
BEGIN
  SELECT COUNT(*),
         MD5(STRING_AGG(
           FORMAT(
             '%s|%s|%s|%s',
             code,
             COALESCE(ledger_type, '<null>'),
             COALESCE(parent_code, '<null>'),
             COALESCE(is_active::text, '<null>')
           ),
           E'\n' ORDER BY code
         )),
         MD5(STRING_AGG(
           FORMAT(
             '%s|%s|%s|%s|%s',
             code,
             COALESCE(ledger_type, '<null>'),
             COALESCE(parent_code, '<null>'),
             COALESCE(is_active::text, '<null>'),
             COALESCE(fs_note, '<null>')
           ),
           E'\n' ORDER BY code
         ))
    INTO v_account_count, v_structure_fingerprint,
         v_full_mapping_fingerprint
    FROM account_codes;

  IF (
       v_account_count,
       v_structure_fingerprint,
       v_full_mapping_fingerprint
     ) IS DISTINCT FROM (
       2824::bigint,
       '47b88863017669feb7dd3356eba3e051'::text,
       'bd034913a5df1c2b9f54e7937cc9b87b'::text
     ) THEN
    RAISE EXCEPTION 'V2 final chart/mapping fingerprint mismatch';
  END IF;

  SELECT MD5(STRING_AGG(
           FORMAT(
             '%s|%s|%s|%s|%s|%s',
             code,
             category,
             report_section,
             normal_balance,
             COALESCE(parent_note, '<null>'),
             is_active
           ),
           E'\n' ORDER BY code
         ))
    INTO v_notes_fingerprint
    FROM financial_statement_notes;

  IF v_notes_fingerprint <> 'bff4355c4a1206a2770ad9dac3385d4c' THEN
    RAISE EXCEPTION 'V2 final financial-note metadata fingerprint mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM financial_statement_notes
    WHERE code = '3-1'
      AND name = 'Opening Stock (Finished Products)'
      AND description IS NULL
      AND category = 'cogs'
      AND report_section = 'income_statement'
      AND normal_balance = 'debit'
      AND sort_order = 600
      AND parent_note = '3'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'V2 final note 3-1 metadata mismatch';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE amount <> 0),
         COUNT(*) FILTER (WHERE amount = 0),
         COUNT(*) FILTER (WHERE amount > 0),
         COUNT(*) FILTER (WHERE amount < 0),
         COALESCE(SUM(
           CASE WHEN amount > 0 THEN ROUND(amount * 100)::bigint ELSE 0 END
         ), 0),
         COALESCE(SUM(
           CASE WHEN amount < 0 THEN -ROUND(amount * 100)::bigint ELSE 0 END
         ), 0),
         COALESCE(SUM(ROUND(amount * 100)::bigint), 0),
         MD5(STRING_AGG(
           FORMAT('%s|%s', account_code, ROUND(amount * 100)::bigint),
           E'\n' ORDER BY account_code
         ))
    INTO v_jan_count, v_jan_nonzero, v_jan_zero,
         v_jan_debit_count, v_jan_credit_count,
         v_jan_debit_cents, v_jan_credit_cents, v_jan_net_cents,
         v_jan_fingerprint
    FROM account_opening_balances
    WHERE as_of_date = DATE '2026-01-01';

  IF (
       v_jan_count,
       v_jan_nonzero,
       v_jan_zero,
       v_jan_debit_count,
       v_jan_credit_count,
       v_jan_debit_cents,
       v_jan_credit_cents,
       v_jan_net_cents,
       v_jan_fingerprint
     ) IS DISTINCT FROM (
       642::bigint,
       290::bigint,
       352::bigint,
       230::bigint,
       60::bigint,
       1318068118::bigint,
       1318068118::bigint,
       0::bigint,
       '88ed6a12bc372c7d8d2da9ca45342555'::text
     ) THEN
    RAISE EXCEPTION 'V2 final January anchor population mismatch';
  END IF;

  SELECT MD5(STRING_AGG(
           FORMAT(
             '%s|%s',
             target.code,
             CASE
               WHEN a.id IS NULL THEN '<absent>'
               ELSE ROUND(a.amount * 100)::bigint::text
             END
           ),
           E'\n' ORDER BY target.code
         )),
         COUNT(*) FILTER (
           WHERE (
             target.expected_current_cents IS NOT NULL
             AND a.notes =
               'Legacy report V2 zero fence from hash-validated 2026 Trial Balance'
             AND a.created_by = 'legacy-import'
           ) OR (
             target.expected_current_cents IS NULL
             AND a.notes =
               'Legacy report V2 opening stock from hash-validated 2026 Trial Balance'
             AND a.created_by = 'legacy-report-v2'
           )
         )
    INTO v_anchor_actual_fingerprint, v_anchor_provenance
    FROM v2_anchor_targets target
    LEFT JOIN account_opening_balances a
      ON a.account_code = target.code
     AND a.as_of_date = DATE '2026-01-01';

  IF (
       v_anchor_actual_fingerprint,
       v_anchor_provenance
     ) IS DISTINCT FROM (
       '5e1c54ba21a45ee181a7510704c23869'::text,
       125::bigint
     ) THEN
    RAISE EXCEPTION 'V2 final target anchors/provenance mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM v2_anchor_targets target
    JOIN account_codes ac ON ac.code = target.code
    WHERE ac.fs_note IS DISTINCT FROM target.target_note
  ) OR EXISTS (
    SELECT 1
    FROM v2_mapping_targets target
    JOIN account_codes ac ON ac.code = target.code
    WHERE ac.fs_note IS DISTINCT FROM target.target_note
  ) THEN
    RAISE EXCEPTION 'V2 final direct APPX mapping mismatch';
  END IF;

  IF EXISTS (
    WITH RECURSIVE walk AS (
      SELECT ac.code AS origin, ac.parent_code, ac.fs_note, 0 AS depth
      FROM account_codes ac
      UNION ALL
      SELECT w.origin, parent.parent_code, parent.fs_note, w.depth + 1
      FROM walk w
      JOIN account_codes parent ON parent.code = w.parent_code
      WHERE w.fs_note IS NULL
    ),
    effective AS (
      SELECT DISTINCT ON (origin) origin AS code, fs_note
      FROM walk
      WHERE fs_note IS NOT NULL
      ORDER BY origin, depth
    ),
    targets AS (
      SELECT code, target_note FROM v2_anchor_targets
      UNION
      SELECT code, target_note FROM v2_mapping_targets
    )
    SELECT 1
    FROM targets
    LEFT JOIN effective ON effective.code = targets.code
    WHERE effective.fs_note IS DISTINCT FROM targets.target_note
  ) THEN
    RAISE EXCEPTION 'V2 final effective APPX mapping mismatch';
  END IF;

  SELECT MD5(COALESCE(STRING_AGG(
           JSONB_BUILD_ARRAY(
             stage_sequence,
             record_kind,
             source_kind,
             source_sha256,
             source_physical_line,
             account_code,
             entry_date::text,
             journal_ref,
             journal_group_key,
             line_display_reference,
             particulars,
             cheque_reference,
             debit_cents,
             credit_cents,
             running_balance_cents,
             repaired,
             special_case
           )::text,
           E'\n' ORDER BY stage_sequence
         ), ''))
    INTO v_staging_fingerprint
    FROM import_legacy_rows;

  SELECT MD5(STRING_AGG(
           JSONB_BUILD_ARRAY(
             reference_no,
             entry_type,
             entry_date::text,
             description,
             ROUND(total_debit * 100)::bigint,
             ROUND(total_credit * 100)::bigint,
             status,
             cheque_no,
             display_reference,
             legacy_entry_type,
             posting_sequence,
             source_type,
             source_id,
             manual_override,
             created_by,
             posted_by
           )::text,
           E'\n' ORDER BY reference_no
         ))
    INTO v_imp_header_fingerprint
    FROM journal_entries
    WHERE entry_type = 'IMP';

  SELECT MD5(STRING_AGG(
           JSONB_BUILD_ARRAY(
             h.reference_no,
             l.line_number,
             l.account_code,
             ROUND(l.debit_amount * 100)::bigint,
             ROUND(l.credit_amount * 100)::bigint,
             l.reference,
             l.particulars,
             l.cheque_reference,
             l.display_order,
             l.display_reference
           )::text,
           E'\n' ORDER BY h.reference_no, l.line_number
         ))
    INTO v_imp_line_fingerprint
    FROM journal_entries h
    JOIN journal_entry_lines l ON l.journal_entry_id = h.id
    WHERE h.entry_type = 'IMP';

  IF (
       v_staging_fingerprint,
       v_imp_header_fingerprint,
       v_imp_line_fingerprint
     ) IS DISTINCT FROM (
       '70865390988ff2205b08ce4a972a0f96'::text,
       '5c40ef347041238a1a45939c87450d4c'::text,
       '07196fc286a6a951907baed88bbe04da'::text
     ) THEN
    RAISE EXCEPTION 'V2 changed immutable staged/imported journal evidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (
        SELECT stage_sequence, row_data FROM v2_staging_before
        EXCEPT
        SELECT stage_sequence, TO_JSONB(r) FROM import_legacy_rows r
      )
      UNION ALL
      (
        SELECT stage_sequence, TO_JSONB(r) FROM import_legacy_rows r
        EXCEPT
        SELECT stage_sequence, row_data FROM v2_staging_before
      )
    ) staging_drift
  ) OR EXISTS (
    SELECT 1
    FROM (
      (
        SELECT id, row_data FROM v2_imp_headers_before
        EXCEPT
        SELECT id, TO_JSONB(h)
        FROM journal_entries h
        WHERE h.entry_type = 'IMP'
      )
      UNION ALL
      (
        SELECT id, TO_JSONB(h)
        FROM journal_entries h
        WHERE h.entry_type = 'IMP'
        EXCEPT
        SELECT id, row_data FROM v2_imp_headers_before
      )
    ) header_drift
  ) OR EXISTS (
    SELECT 1
    FROM (
      (
        SELECT id, row_data FROM v2_imp_lines_before
        EXCEPT
        SELECT l.id, TO_JSONB(l)
        FROM journal_entries h
        JOIN journal_entry_lines l ON l.journal_entry_id = h.id
        WHERE h.entry_type = 'IMP'
      )
      UNION ALL
      (
        SELECT l.id, TO_JSONB(l)
        FROM journal_entries h
        JOIN journal_entry_lines l ON l.journal_entry_id = h.id
        WHERE h.entry_type = 'IMP'
        EXCEPT
        SELECT id, row_data FROM v2_imp_lines_before
      )
    ) line_drift
  ) THEN
    RAISE EXCEPTION 'V2 changed a complete staged/imported row snapshot';
  END IF;

  SELECT MD5(STRING_AGG(
           FORMAT('%s|%s', account_code, ROUND(amount * 100)::bigint),
           E'\n' ORDER BY account_code
         ))
    INTO v_june_fingerprint
    FROM account_opening_balances
    WHERE as_of_date = DATE '2026-06-01';

  IF v_june_fingerprint <> 'c23e0a2f28a7303e34679eea92b4e302'
     OR EXISTS (
       SELECT 1
       FROM (
         (
           SELECT id, row_data FROM v2_june_anchors_before
           EXCEPT
           SELECT id, TO_JSONB(a)
           FROM account_opening_balances a
           WHERE a.as_of_date = DATE '2026-06-01'
         )
         UNION ALL
         (
           SELECT id, TO_JSONB(a)
           FROM account_opening_balances a
           WHERE a.as_of_date = DATE '2026-06-01'
           EXCEPT
           SELECT id, row_data FROM v2_june_anchors_before
         )
       ) june_drift
     ) THEN
    RAISE EXCEPTION 'V2 changed a June checkpoint anchor';
  END IF;

  WITH movement AS (
    SELECT
      l.account_code,
      SUM(
        COALESCE(l.debit_amount, 0) - COALESCE(l.credit_amount, 0)
      ) AS amount
    FROM journal_entry_lines l
    JOIN journal_entries h ON h.id = l.journal_entry_id
    WHERE h.status = 'posted'
      AND h.entry_date >= DATE '2026-01-01'
      AND h.entry_date < DATE '2026-06-01'
    GROUP BY l.account_code
  ),
  checkpoint_checks AS (
    SELECT
      june.account_code,
      ROUND((
        COALESCE(jan.amount, 0)
        + COALESCE(movement.amount, 0)
        - june.amount
      ) * 100)::bigint AS difference_cents
    FROM account_opening_balances june
    LEFT JOIN account_opening_balances jan
      ON jan.account_code = june.account_code
     AND jan.as_of_date = DATE '2026-01-01'
    LEFT JOIN movement ON movement.account_code = june.account_code
    WHERE june.as_of_date = DATE '2026-06-01'
  )
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE difference_cents = 0)
    INTO v_checkpoint_count, v_checkpoint_exact
    FROM checkpoint_checks;

  IF (
       v_checkpoint_count,
       v_checkpoint_exact
     ) IS DISTINCT FROM (
       1571::bigint,
       1571::bigint
     ) THEN
    RAISE EXCEPTION 'V2 final June checkpoint equality mismatch';
  END IF;
END
$final_postconditions$;

DO $completion$
DECLARE
  v_mode varchar(10);
BEGIN
  SELECT mode INTO STRICT v_mode FROM v2_state;
  RAISE NOTICE
    'Legacy report Phase V2 verified in % mode: Jan anchors balance at RM13,180,681.18 per side; monthly closing stock remains V3',
    v_mode;
END
$completion$;

COMMIT;

-- Green Target Phase G4 - 2026-01-01 opening anchors (handover decision R4).
--
-- GENERATED FILE - do not hand-edit.
--   node dev/import/greentarget-legacy/build-import-staging.mjs
--   node dev/import/greentarget-legacy/build-import-staging.mjs --check-only
--
-- 501 anchors, one per legacy ledger section, summing to EXACTLY 0.00.
-- Unlike Tien Hock, which shipped a named RM1,456,480.37 opening residue, Green
-- Target's opening set balances with no residue at all once CD_SD carries its
-- evidenced 76,415.40 (see that row's note).
--
-- DEBTOR and BTFS deliberately get NO anchor. DEBTOR is a control parent whose
-- 28 children carry the balances; BTFS is the one account the six Trial Balance
-- scans print with DEBIT and CREDIT genuinely BLANK rather than .00, and the
-- report engines only surface accounts with an anchor or a posted line - so its
-- absence here is precisely what reproduces that printing (G3 decision 4).
--
-- Anchor semantics (R4): a row at as_of_date <= a report period start seeds the
-- balance and everything before it is ignored. Never a synthetic opening journal.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regclass('greentarget.account_opening_balances') IS NULL THEN
    RAISE EXCEPTION 'greentarget.account_opening_balances is missing - apply the G2 foundation migration first';
  END IF;

  -- G3's 503 evidence-derived codes are a required subset of the live chart.
  -- The 501 postable identities are checked against gt_desired_anchors below;
  -- these are the two deliberate non-anchor identities.
  IF (SELECT COUNT(*) FROM greentarget.account_codes
       WHERE code IN ('DEBTOR', 'BTFS')) <> 2 THEN
    RAISE EXCEPTION 'The required legacy DEBTOR/BTFS chart identities are missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.account_opening_balances
     WHERE as_of_date <> DATE '2026-01-01'
  ) THEN
    RAISE EXCEPTION 'greentarget.account_opening_balances already holds an anchor outside 2026-01-01';
  END IF;
END
$guard$;

CREATE TEMP TABLE gt_desired_anchors (
  account_code varchar(50) PRIMARY KEY,
  amount       numeric(15,2) NOT NULL,
  notes        text NOT NULL
) ON COMMIT DROP;

INSERT INTO gt_desired_anchors (account_code, amount, notes) VALUES
  ('AC_2010', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('AC_BM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('AC_DR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('AC_GST', 639.23, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('AC_LN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('AC_OIL', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('AC_TM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('ADD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('AE ENTERPRISE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('ALPS', 180.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('AMB1', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BAJA-STONE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BAKTI', 510.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BKAD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKAR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKBC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKBD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKBK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKCE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKDON', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKEN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKINS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKLC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKLP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKMED', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKNEW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKOR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKPEN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKPS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKQR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKSA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKSAF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKSC_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKSEC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKSE_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKSF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKSP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKST', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKSUN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKS_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKTEL', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKTT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BKWP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BM_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BM_BK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BM_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BM_S', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BR_BW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BR_KB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BT1325', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BT2035', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BT2390', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BT6312', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BT6326', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BT8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BT8726', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTCASE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTFORK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTFT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTHT60', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTHT75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTJCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTKOM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTOTH_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BTOTH_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWAD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWAR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWBC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWBD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWCE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWDON', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWDRB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWDRE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWDRS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWDRSC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWDRSIP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWEN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWEW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWE_BS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWE_JB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWE_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWE_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWE_M', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWE_MO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWE_O', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWIF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWINS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWL', 80968.58, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BWLC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWLEV', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWLP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWMED', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWNEW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWOR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWPEN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWPS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWQR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWRM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWRMB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWRMBS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWRMKH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWRMOP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSAF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSC_BS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSC_JB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSC_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSC_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSC_M', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSC_MO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSC_O', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSEC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSIPC_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSIP_BS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSIP_JB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSIP_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSIP_M', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSIP_MO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSIP_O', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWST', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWSUN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWS_BS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWS_JB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWS_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWS_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWS_M', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWS_MO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWS_O', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWTEL', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWTRA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWTRV', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWTT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWUF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWUM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BWWP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BW_ADE', -816.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BW_ADPCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BW_ADS', -53803.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BW_ADSC', -41.20, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BW_ADSIP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BW_AE', -4371.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BW_APCB', -85.75, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BW_AS', -13365.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BW_ASC', -845.90, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('BW_ASEB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('BW_ASIP', -73.60, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('CA_8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_BD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_BW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_EX75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_GF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_GTH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_KD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_LC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_LNA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_LPF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_SESB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_TAX', 24139.50, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('CA_TH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CA_WSF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CD2014', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CD2015', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CD_SD', 76415.40, 'Legacy Jan-Jun 2026 opening. The GTDB section prints 65,705.40 dated 2026-06-30 (its close, the only C/FWD in either workbook not dated 2026-01-01); G1 proved from all six Trial Balance scans that it also carries 10,710.00 of unbanked counter cash at 1 January. Anchored at the evidenced 76,415.40, which is what makes the opening set balance to exactly zero.'),
  ('CHARM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CHEM_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CHEM_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CH_REV2', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CL_GTH', 85416.10, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('CL_KC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CL_PB11', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CL_SC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CL_TAX', 43178.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('CL_WSF', 53396.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('COS_DEP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_ACT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_BB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_BF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_BN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_BWG0001', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_BWG139', 81.20, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('CR_CHEM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_CR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_GW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_IN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_JF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_JG', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_KF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_KI', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_KK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_KT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_LS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_MSR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_PRI', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_SALES', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_SG', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_SI', 500.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('CR_SP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_SY', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_WB', 4800.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('CR_WL', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('CR_XF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('DEP_BF', 487.86, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('DEP_MG', 62.46, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('DEP_WS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('EPF_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('FC_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('FC_HP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('FC_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('FC_TL', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('FD_PBB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('GREAT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('HPA_8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('HPA_EX75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('HPB_8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('HPB_EX75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('HR_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('HR_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('ICM_IS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('ICM_OT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('IF_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('IF_BK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('IF_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INNOSURIA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INPUT.TAX', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INS1325', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INS2035', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INS2390', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INS6312', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INS6326', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INS8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INS8726', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSCASE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSFORK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSFT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSHT60', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSHT75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSJCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSKOM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSOTH_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('INSOTH_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('ITCC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('JAARI', 960.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('KBAD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBAR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBBC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBBD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBCE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBDON', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBDRB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBDRE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBDRS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBDRSC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBEN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBEW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBE_JB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBE_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBE_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBE_M', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBE_MO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBE_O', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBE_OT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBIF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBINS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBLC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBLEV', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBLP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBMED', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBNEW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBOR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBOX', -0.01, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('KBPEN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBPS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBQR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBRM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBRMKH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBRMOP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSAF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSC_JB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSC_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSC_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSC_M', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSC_MO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSC_O', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSC_OT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSEC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSIP_JB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSIP_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSIP_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSIP_M', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSIP_MO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBST', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBSUN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBS_JB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBS_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBS_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBS_M', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBS_MO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBS_O', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBTEL', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBTRA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBTRV', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBTT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBUF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBUM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KBWP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_ADE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_ADPCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_ADS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_ADSC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_AE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_APCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_AS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_ASC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_ASEB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KB_ASIP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('KEN', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('LEE DECOR', 420.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('LEV', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('LT_DT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('LT_HP', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('MARCOCO', 2800.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('NURI', 1080.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('OC_AM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OC_BC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OC_BW', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OC_CMK', 3600.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('OC_PC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OC_RMA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OC_RMS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OC_SF', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OC_TH', -24000.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('OIL1325', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OIL2035', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OIL2390', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OIL4T_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OIL4T_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OIL6312', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OIL6326', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OIL8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OIL8726', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILCASE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILFORK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILFT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILHT60', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILHT75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILJCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILKOM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILOTH_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OILOTH_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OTH1', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OTH_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OTH_BK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OTH_BKS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OTH_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OTH_S', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('OUTPUT.TAX', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PAN', 540.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PAUMIN', 230.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PBB1', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PBB_1', 19797.31, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PBB_2', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PE_ADE', -72196.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PE_ADH', -1406846.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PE_ADM', -702177.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PE_ADO', -27081.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PE_EQB', 72222.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PE_EQK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PE_HEQB', 1423227.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PE_MVB', 702185.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PE_MVK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PE_OEQ', 28795.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('PR_HEQK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PSU', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PT1325', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PT2035', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PT2390', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PT6312', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PT6326', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PT8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PT8726', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PTCASE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PTHT60', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PTJCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PTOTH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('PTOTHK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('R1325', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('R2035', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('R2390', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('R6312', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('R6326', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('R8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('R8726', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RCASE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RFORK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RFT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RHT60', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RHT75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RJCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RKOM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RMS_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RMS_BKS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RMS_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RMS_S', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_BK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_BL', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_BO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_BS', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_KM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_KO', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_OTH1', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_OTH2', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_Q', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RM_TG', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('ROTH_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('ROTH_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('RP', -226944.53, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('RUMAH MERAH', -1.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('SABARINA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SAD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SAL_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SAL_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SBD', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SC', -100000.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('SDON', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SE_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SE_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SOC_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SOGORAYA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SSC_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SSC_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SSIP_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SS_KH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SS_LH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('STEL', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SUN TARGET', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SUTERA', 622.00, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('SV1325', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SV2035', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SV2390', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SV6312', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SV6326', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SV8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SV8726', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVCASE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVFORK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVFT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVHT60', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVHT75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVJCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVKOM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVOTH_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('SVOTH_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAX', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAX1325', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAX2035', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAX2390', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAX6312', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAX6326', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAX8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAX8726', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAXOTH_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TAXOTH_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TC', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TGA', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TGB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TH', 5394.35, 'Legacy Jan-Jun 2026 opening from the hash-validated ledger export'),
  ('TY1325', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TY2035', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TY2390', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TY6312', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TY6326', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TY8183', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TY8726', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYCASE', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYFORK', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYFT', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYHT60', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYHT75', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYJCB', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYKOM', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYOTH_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('TYOTH_K', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('VRE_B', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('VRE_S', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_CR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_OTH', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_OTH1', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_OTH2', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_OTH3', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_OTH4', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_OTH5', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_OTH6', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account'),
  ('WS_SBR', 0.00, 'Zero opening fence for active Jan-Jun 2026 legacy account');

DO $preflight$
DECLARE
  v_count bigint;
  v_cents bigint;
  v_missing text;
BEGIN
  SELECT COUNT(*), SUM(ROUND(amount * 100))::bigint INTO v_count, v_cents
    FROM gt_desired_anchors;

  IF (v_count, v_cents) IS DISTINCT FROM (501::bigint, 0::bigint) THEN
    RAISE EXCEPTION 'The generated anchor set is % rows summing to % cents, expected 501 summing to 0',
      v_count, v_cents;
  END IF;

  SELECT string_agg(desired.account_code, ', ' ORDER BY desired.account_code)
    INTO v_missing
    FROM gt_desired_anchors desired
    LEFT JOIN greentarget.account_codes accounts
      ON accounts.code = desired.account_code
   WHERE accounts.code IS NULL OR accounts.is_active IS DISTINCT FROM true;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Anchor accounts missing or inactive in the G3 chart: %', v_missing;
  END IF;

  IF EXISTS (SELECT 1 FROM gt_desired_anchors WHERE account_code IN ('DEBTOR', 'BTFS')) THEN
    RAISE EXCEPTION 'DEBTOR or BTFS reached the generated anchor set';
  END IF;

  -- When staging is loaded, the anchors must agree with it account for account.
  IF (SELECT COUNT(*) FROM greentarget.import_legacy_rows) > 0
     AND EXISTS (
       WITH staged AS (
         SELECT account_code, SUM(running_balance_cents)::bigint AS cents
           FROM greentarget.import_legacy_rows
          WHERE record_kind = 'opening'
          GROUP BY account_code
       )
       SELECT 1
         FROM staged
         FULL JOIN gt_desired_anchors desired USING (account_code)
        WHERE staged.cents IS DISTINCT FROM ROUND(desired.amount * 100)::bigint
     ) THEN
    RAISE EXCEPTION 'The generated anchors disagree with the loaded staging opening set';
  END IF;
END
$preflight$;

INSERT INTO greentarget.account_opening_balances (
  account_code, as_of_date, amount, notes, created_by
)
SELECT desired.account_code, DATE '2026-01-01', desired.amount, desired.notes,
       'legacy-import'
  FROM gt_desired_anchors desired
ON CONFLICT (account_code, as_of_date) DO UPDATE
   SET amount     = EXCLUDED.amount,
       notes      = EXCLUDED.notes,
       created_by = EXCLUDED.created_by,
       updated_at = CURRENT_TIMESTAMP
 WHERE (greentarget.account_opening_balances.amount,
        greentarget.account_opening_balances.notes,
        greentarget.account_opening_balances.created_by)
   IS DISTINCT FROM
       (EXCLUDED.amount, EXCLUDED.notes, EXCLUDED.created_by);

DO $verify$
DECLARE
  v_count bigint;
  v_cents bigint;
  v_th_accounts bigint;
  v_th_journals bigint;
BEGIN
  SELECT COUNT(*), SUM(ROUND(amount * 100))::bigint INTO v_count, v_cents
    FROM greentarget.account_opening_balances;

  IF (v_count, v_cents) IS DISTINCT FROM (501::bigint, 0::bigint) THEN
    RAISE EXCEPTION 'After insert the anchor set is % rows summing to % cents', v_count, v_cents;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM gt_desired_anchors desired
      FULL JOIN greentarget.account_opening_balances actual
        ON actual.account_code = desired.account_code
       AND actual.as_of_date = DATE '2026-01-01'
     WHERE actual.account_code IS NULL
        OR desired.account_code IS NULL
        OR actual.amount IS DISTINCT FROM desired.amount
        OR actual.notes  IS DISTINCT FROM desired.notes
  ) THEN
    RAISE EXCEPTION 'A persisted anchor differs from the generated set';
  END IF;

  IF (SELECT ROUND(amount * 100)::bigint
        FROM greentarget.account_opening_balances
       WHERE account_code = 'CD_SD') <> 7641540 THEN
    RAISE EXCEPTION 'CD_SD is not anchored at the evidenced 76415.40';
  END IF;

  SELECT (SELECT COUNT(*) FROM public.account_codes),
         (SELECT COUNT(*) FROM public.journal_entries)
    INTO v_th_accounts, v_th_journals;
  IF (v_th_accounts, v_th_journals) IS DISTINCT FROM (2827::bigint, 8238::bigint) THEN
    RAISE EXCEPTION 'Tien Hock moved: account_codes %, journal_entries %', v_th_accounts, v_th_journals;
  END IF;

  RAISE NOTICE 'G4 anchors OK: % rows at 2026-01-01 summing to 0.00', v_count;
END
$verify$;

COMMIT;

-- fs_note re-mapping — 8 Jul 2026
-- Re-tags every account code with its financial-statement note (account_codes.fs_note),
-- which the Trial Balance / Income Statement / Balance Sheet / CoGM engines group by.
-- The original Jan-2026 bulk mapping (documented in docs/Account/FINANCIAL_STATEMENTS_MAPPING.md)
-- was lost in a dev-DB refresh; this script is the corrected re-run. Corrections vs the old script:
--   * MB*/vehicle codes -> Note 5 (admin expenses), NOT 5-1 — per LEGACY_SYSTEM_REFERENCE.md prefix table.
--   * Only factory-section salary codes (suffix _MM/_PM/_MB/_PB/_JB/_K) + THJ_* -> 5-1.
--   * CASH% -> 6 no longer clobbers CASH_SALES (revenue); CR_SALES added to revenue.
--   * CH_REV1/CH_REV2 (cash-method receipt holding accounts) -> 6 Cash in Hand, not 18-2.
--   * Taxation codes tagged before the TAX_% -> 5 vehicle road-tax rule.
--   * CL_* family handled: directors 9, term loans 11, taxation 12, inter-co/others 10.
--   * Lean-GL codes added: TP -> 13, PUR -> 3-5, OP -> 5, DEBTOR -> 22.
--   * BE_%/BL_% are payroll (EPF/Levy by section) — removed from the PPE (Note 4) rule.
-- Safe to re-run (idempotent). Run: docker exec -i tienhock_dev_db psql -U postgres -d tienhock < dev/migrations/fs_note_remap_2026-07.sql

BEGIN;

-- STEP 0: clear
UPDATE account_codes SET fs_note = NULL;

-- STEP 1: by ledger type
UPDATE account_codes SET fs_note = '22' WHERE ledger_type = 'TD';
UPDATE account_codes SET fs_note = '13' WHERE ledger_type = 'TC';
UPDATE account_codes SET fs_note = '19' WHERE ledger_type = 'BK';

-- STEP 2: Closing Stock (CS) by product type
UPDATE account_codes SET fs_note = '14-1' WHERE ledger_type = 'CS' AND (code LIKE '%FIN%' OR code = 'CS');
UPDATE account_codes SET fs_note = '14-2' WHERE ledger_type = 'CS' AND fs_note IS NULL AND (code LIKE '%BER%' OR code LIKE '%JAG%' OR code LIKE '%SAG%' OR code LIKE '%SDM%' OR code LIKE '%TH%' OR code LIKE '%CHEM%');
UPDATE account_codes SET fs_note = '14-3' WHERE ledger_type = 'CS' AND fs_note IS NULL AND (code LIKE '%PM%' OR code LIKE '%TAP%');
UPDATE account_codes SET fs_note = '14-1' WHERE ledger_type = 'CS' AND fs_note IS NULL;

-- STEP 3: Opening Stock (OS) by product type
UPDATE account_codes SET fs_note = '3-1' WHERE ledger_type = 'OS' AND (code LIKE '%FIN%' OR code = 'OS');
UPDATE account_codes SET fs_note = '3-3' WHERE ledger_type = 'OS' AND fs_note IS NULL AND (code LIKE '%BER%' OR code LIKE '%JAG%' OR code LIKE '%SAG%' OR code LIKE '%SDM%' OR code LIKE '%TH%' OR code LIKE '%CHEM%');
UPDATE account_codes SET fs_note = '3-7' WHERE ledger_type = 'OS' AND fs_note IS NULL AND (code LIKE '%PM%' OR code LIKE '%TAP%');
UPDATE account_codes SET fs_note = '3-1' WHERE ledger_type = 'OS' AND fs_note IS NULL;

-- STEP 4: Revenue & contra-revenue (before the CASH% cash rule)
UPDATE account_codes SET fs_note = '7' WHERE fs_note IS NULL AND (code IN ('SLS', 'CASH_SALES', 'CR_SALES', 'RETURN', 'BRET') OR code LIKE 'SLS%' OR code LIKE 'SL\_%');

-- STEP 5: Cash in hand — incl. CH_REV1/CH_REV2, the cash-method receipt holding
-- accounts (money received, not yet banked in)
UPDATE account_codes SET fs_note = '6' WHERE fs_note IS NULL AND (code LIKE 'CASH%' OR code LIKE 'CH\_REV%');

-- STEP 6: Equity
UPDATE account_codes SET fs_note = '21' WHERE fs_note IS NULL AND code = 'SC';
UPDATE account_codes SET fs_note = '20' WHERE fs_note IS NULL AND code IN ('RP', 'RP_MTH');

-- STEP 7: Taxation (before vehicle TAX_% -> 5) and deferred tax (accrual per legacy BS)
UPDATE account_codes SET fs_note = '12' WHERE fs_note IS NULL AND code IN ('TAX_CP', 'TAX_IT', 'CL_TAX');
UPDATE account_codes SET fs_note = '1'  WHERE fs_note IS NULL AND code = 'DF_TAX';

-- STEP 8: Accruals
UPDATE account_codes SET fs_note = '1' WHERE fs_note IS NULL AND (code LIKE 'ACC%' OR code LIKE 'AC\_%' OR code LIKE 'ACW%' OR code LIKE 'ACD%');

-- STEP 9: Hire purchase
UPDATE account_codes SET fs_note = '16' WHERE fs_note IS NULL AND (code LIKE 'HPA\_%' OR code = 'CL_HPA');
UPDATE account_codes SET fs_note = '23' WHERE fs_note IS NULL AND (code LIKE 'HPB\_%' OR code IN ('HPI', 'CL_HPB'));

-- STEP 10: PPE & depreciation (NCA_* was missing from the old script; BE_/BL_ are payroll, not PPE)
UPDATE account_codes SET fs_note = '15' WHERE fs_note IS NULL AND code IN ('DPE', 'AE_DEP');
UPDATE account_codes SET fs_note = '4'  WHERE fs_note IS NULL AND (code LIKE 'NCA\_%' OR code LIKE 'AD\_%' OR code IN ('CAR', 'E', 'FV', 'LRY', 'PPE'));

-- STEP 11: Directors, loans, inter-company / other creditors
UPDATE account_codes SET fs_note = '9'  WHERE fs_note IS NULL AND (code IN ('CL_WSF', 'CL_GTH') OR code LIKE 'DR%');
UPDATE account_codes SET fs_note = '11' WHERE fs_note IS NULL AND (code LIKE 'CL\_PB%' OR code IN ('CL_SCB', 'CL_LOAN'));
UPDATE account_codes SET fs_note = '13' WHERE fs_note IS NULL AND code IN ('TP', 'CL_TP');
UPDATE account_codes SET fs_note = '10' WHERE fs_note IS NULL AND (code LIKE 'CL\_%' OR code LIKE 'OC\_%' OR code = 'CUST_DEP');

-- STEP 12: Prepayments, deposits & other current-asset subledger
UPDATE account_codes SET fs_note = '8' WHERE fs_note IS NULL AND code LIKE 'CA\_%';

-- STEP 13: CoGM purchases & freight
UPDATE account_codes SET fs_note = '3-4' WHERE fs_note IS NULL AND code IN ('PU_CHEM', 'PU_MBCHEM');
UPDATE account_codes SET fs_note = '3-5' WHERE fs_note IS NULL AND (code LIKE 'PU\_%' OR code LIKE 'PUR%' OR code = 'RAW');
UPDATE account_codes SET fs_note = '3-2' WHERE fs_note IS NULL AND (code LIKE 'PM\_%' OR code IN ('PM', 'PACKING'));
UPDATE account_codes SET fs_note = '3-6' WHERE fs_note IS NULL AND (code = 'FT' OR code LIKE 'BFT\_%');

-- STEP 14: Factory-section salaries (CoGM 5-1): mesin/packing mee+bihun, jaga boiler, kilang.
-- Prefixes = salary(S)/EPF(E)/SOCSO(SC)/SIP/levy(L) code families posted by the JVSL vouchers.
UPDATE account_codes SET fs_note = '5-1' WHERE fs_note IS NULL AND
  code ~ '^(MS|ME|MSC|ML|MSIP|BS|BE|BSC|BL|BSIP|MBS|MBE|MBSC|MBSIP|MBL|MBSM)_(MM|PM|MB|PB|JB|K)$';
UPDATE account_codes SET fs_note = '5-1' WHERE fs_note IS NULL AND code IN ('THJ_CK', 'THJ_SM'); -- legacy TB puts these under 5-1 (open question #1 in LEGACY_SYSTEM_REFERENCE.md)

-- STEP 15: Other income / disposal gains
UPDATE account_codes SET fs_note = '18-1' WHERE fs_note IS NULL AND code = 'IN_PPE';
UPDATE account_codes SET fs_note = '18-2' WHERE fs_note IS NULL AND (code LIKE 'IN\_%' OR code LIKE 'CH\_%');

-- STEP 16: Debtors control account
UPDATE account_codes SET fs_note = '22' WHERE fs_note IS NULL AND code = 'DEBTOR';

-- STEP 17: catch-all — everything else (MB* admin codes, vehicle running expenses
-- BT*/OIL*/R*/SV*/TAX*/TY*/INS*/PT*, OP overseas purchases, NT_7484, BTRA, ...) -> Note 5
UPDATE account_codes SET fs_note = '5' WHERE fs_note IS NULL;

COMMIT;

-- Verify
SELECT fs_note, count(*) FROM account_codes GROUP BY fs_note ORDER BY fs_note;

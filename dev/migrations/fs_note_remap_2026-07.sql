-- Financial-statement note remap, restored for the Jan-May legacy rollout.
-- Re-tags the exact audited account population from the documented legacy
-- rules. Any account or mapping drift aborts before the first update.

BEGIN;

CREATE TEMP TABLE fs_note_remap_state (
  mode text PRIMARY KEY CHECK (mode IN ('fresh', 'final'))
) ON COMMIT DROP;

DO $guard$
DECLARE
  v_count integer;
  v_structure_fingerprint text;
  v_mapping_fingerprint text;
BEGIN
  SELECT COUNT(*),
         MD5(STRING_AGG(
           FORMAT('%s|%s', code, COALESCE(ledger_type, '<null>')),
           E'\n' ORDER BY code COLLATE "C"
         )),
         MD5(STRING_AGG(
           FORMAT('%s|%s|%s', code, COALESCE(ledger_type, '<null>'),
                  COALESCE(fs_note, '<null>')),
           E'\n' ORDER BY code COLLATE "C"
         ))
    INTO v_count, v_structure_fingerprint, v_mapping_fingerprint
    FROM account_codes;

  IF v_count <> 2814
     OR v_structure_fingerprint <> '6acd9b84d895e578e770b816978d3400' THEN
    RAISE EXCEPTION
      'Account population drifted before fs-note remap: expected 2,814 / %, found % / %',
      '6acd9b84d895e578e770b816978d3400', v_count,
      v_structure_fingerprint;
  END IF;

  IF v_mapping_fingerprint = 'ac5804a0c6db188396d65fc94eaaacd3' THEN
    INSERT INTO fs_note_remap_state (mode) VALUES ('fresh');
  ELSIF v_mapping_fingerprint = 'b18746387b17147d8d81e76ec0dc62be' THEN
    INSERT INTO fs_note_remap_state (mode) VALUES ('final');
  ELSE
    RAISE EXCEPTION
      'Account fs_note mappings drifted before remap: fingerprint %',
      v_mapping_fingerprint;
  END IF;
END
$guard$;

UPDATE account_codes
   SET fs_note = NULL
 WHERE EXISTS (
   SELECT 1 FROM fs_note_remap_state WHERE mode = 'fresh'
 );

-- Ledger-type defaults.
UPDATE account_codes SET fs_note = '22' WHERE fs_note IS NULL AND ledger_type = 'TD';
UPDATE account_codes SET fs_note = '13' WHERE fs_note IS NULL AND ledger_type = 'TC';
UPDATE account_codes SET fs_note = '19' WHERE fs_note IS NULL AND ledger_type = 'BK';

-- Closing stock.
UPDATE account_codes SET fs_note = '14-1' WHERE fs_note IS NULL AND ledger_type = 'CS' AND (code LIKE '%FIN%' OR code = 'CS');
UPDATE account_codes SET fs_note = '14-2' WHERE ledger_type = 'CS' AND fs_note IS NULL AND (code LIKE '%BER%' OR code LIKE '%JAG%' OR code LIKE '%SAG%' OR code LIKE '%SDM%' OR code LIKE '%TH%' OR code LIKE '%CHEM%');
UPDATE account_codes SET fs_note = '14-3' WHERE ledger_type = 'CS' AND fs_note IS NULL AND (code LIKE '%PM%' OR code LIKE '%TAP%');
UPDATE account_codes SET fs_note = '14-1' WHERE ledger_type = 'CS' AND fs_note IS NULL;

-- Opening stock.
UPDATE account_codes SET fs_note = '3-1' WHERE fs_note IS NULL AND ledger_type = 'OS' AND (code LIKE '%FIN%' OR code = 'OS');
UPDATE account_codes SET fs_note = '3-3' WHERE ledger_type = 'OS' AND fs_note IS NULL AND (code LIKE '%BER%' OR code LIKE '%JAG%' OR code LIKE '%SAG%' OR code LIKE '%SDM%' OR code LIKE '%TH%' OR code LIKE '%CHEM%');
UPDATE account_codes SET fs_note = '3-7' WHERE ledger_type = 'OS' AND fs_note IS NULL AND (code LIKE '%PM%' OR code LIKE '%TAP%');
UPDATE account_codes SET fs_note = '3-1' WHERE ledger_type = 'OS' AND fs_note IS NULL;

-- Revenue must precede the CASH% rule.
UPDATE account_codes SET fs_note = '7' WHERE fs_note IS NULL AND (code IN ('SLS', 'CASH_SALES', 'CR_SALES', 'RETURN', 'BRET') OR code LIKE 'SLS%' OR code LIKE 'SL\_%');

-- Cash and receipt holding accounts.
UPDATE account_codes SET fs_note = '6' WHERE fs_note IS NULL AND (code LIKE 'CASH%' OR code LIKE 'CH\_REV%');

-- Equity.
UPDATE account_codes SET fs_note = '21' WHERE fs_note IS NULL AND code = 'SC';
UPDATE account_codes SET fs_note = '20' WHERE fs_note IS NULL AND code IN ('RP', 'RP_MTH');

-- Taxation and accruals.
UPDATE account_codes SET fs_note = '12' WHERE fs_note IS NULL AND code IN ('TAX_CP', 'TAX_IT', 'CL_TAX');
UPDATE account_codes SET fs_note = '1' WHERE fs_note IS NULL AND code = 'DF_TAX';
UPDATE account_codes SET fs_note = '1' WHERE fs_note IS NULL AND (code LIKE 'ACC%' OR code LIKE 'AC\_%' OR code LIKE 'ACW%' OR code LIKE 'ACD%');

-- Hire purchase.
UPDATE account_codes SET fs_note = '16' WHERE fs_note IS NULL AND (code LIKE 'HPA\_%' OR code LIKE 'HPB\_%' OR code IN ('CL_HPA', 'CL_HPB', 'HPB'));
UPDATE account_codes SET fs_note = '23' WHERE fs_note IS NULL AND code = 'HPI';

-- PPE and depreciation.
UPDATE account_codes SET fs_note = '15' WHERE fs_note IS NULL AND code IN ('DPE', 'AE_DEP');
UPDATE account_codes SET fs_note = '4' WHERE fs_note IS NULL AND (code LIKE 'NCA\_%' OR code LIKE 'AD\_%' OR code IN ('CAR', 'E', 'FV', 'LRY', 'PPE'));

-- Directors, loans, trade payables, and creditors. CL_AFI is deliberately
-- assigned first as a contra-receivable so the generic CL_* rule cannot turn
-- it into a liability.
UPDATE account_codes SET fs_note = '22' WHERE fs_note IS NULL AND code = 'CL_AFI';
UPDATE account_codes SET fs_note = '9' WHERE fs_note IS NULL AND (code IN ('CL_WSF', 'CL_GTH') OR code LIKE 'DR%');
UPDATE account_codes SET fs_note = '11' WHERE fs_note IS NULL AND (code LIKE 'CL\_PB%' OR code IN ('CL_SCB', 'CL_LOAN'));
UPDATE account_codes SET fs_note = '13' WHERE fs_note IS NULL AND code IN ('TP', 'CL_TP');
UPDATE account_codes SET fs_note = '10' WHERE fs_note IS NULL AND (code LIKE 'CL\_%' OR code LIKE 'OC\_%' OR code = 'CUST_DEP');

-- Prepayments and deposits.
UPDATE account_codes SET fs_note = '8' WHERE fs_note IS NULL AND code LIKE 'CA\_%';

-- CoGM purchases and freight.
UPDATE account_codes SET fs_note = '3-4' WHERE fs_note IS NULL AND code IN ('PU_CHEM', 'PU_MBCHEM');
UPDATE account_codes SET fs_note = '3-5' WHERE fs_note IS NULL AND (code LIKE 'PU\_%' OR code LIKE 'PUR%' OR code = 'RAW');
UPDATE account_codes SET fs_note = '3-2' WHERE fs_note IS NULL AND (code LIKE 'PM\_%' OR code IN ('PM', 'PACKING'));
UPDATE account_codes SET fs_note = '3-6' WHERE fs_note IS NULL AND (code = 'FT' OR code LIKE 'BFT\_%');

-- Factory-section salaries.
UPDATE account_codes SET fs_note = '5-1' WHERE fs_note IS NULL AND
  code ~ '^(MS|ME|MSC|ML|MSIP|BS|BE|BSC|BL|BSIP|MBS|MBE|MBSC|MBSIP|MBL|MBSM)_(MM|PM|MB|PB|JB|K)$';
UPDATE account_codes SET fs_note = '5-1' WHERE fs_note IS NULL AND code IN ('THJ_CK', 'THJ_SM');

-- Other income and disposal gains.
UPDATE account_codes SET fs_note = '18-1' WHERE fs_note IS NULL AND code = 'IN_PPE';
UPDATE account_codes SET fs_note = '18-2' WHERE fs_note IS NULL AND (code LIKE 'IN\_%' OR code LIKE 'CH\_%');

UPDATE account_codes SET fs_note = '22' WHERE fs_note IS NULL AND code = 'DEBTOR';

-- Documented catch-all: MB* administration, vehicle running expenses,
-- overseas purchases, and other legacy expense codes.
UPDATE account_codes SET fs_note = '5' WHERE fs_note IS NULL;

DO $$
DECLARE
  v_fingerprint text;
BEGIN
  IF EXISTS (SELECT 1 FROM account_codes WHERE fs_note IS NULL) THEN
    RAISE EXCEPTION 'Financial-statement remap left account codes without fs_note';
  END IF;

  SELECT MD5(STRING_AGG(
           FORMAT('%s|%s|%s', code, COALESCE(ledger_type, '<null>'),
                  COALESCE(fs_note, '<null>')),
           E'\n' ORDER BY code COLLATE "C"
         ))
    INTO v_fingerprint
    FROM account_codes;

  IF v_fingerprint <> 'b18746387b17147d8d81e76ec0dc62be' THEN
    RAISE EXCEPTION
      'Financial-statement remap final fingerprint differs: %',
      v_fingerprint;
  END IF;
END $$;

COMMIT;

SELECT fs_note, COUNT(*) AS accounts
  FROM account_codes
 GROUP BY fs_note
 ORDER BY fs_note;

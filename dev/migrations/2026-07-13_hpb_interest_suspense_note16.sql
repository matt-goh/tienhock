-- Classify HP interest-in-suspense balances with their hire-purchase payable
-- contracts on Balance Sheet Note 16. HPI remains the released finance cost
-- on Income Statement Note 23.

BEGIN;

DO $$
DECLARE
  v_target_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM financial_statement_notes
     WHERE code = '16'
       AND category = 'liability'
       AND report_section = 'balance_sheet'
  ) THEN
    RAISE EXCEPTION 'Balance Sheet Note 16 is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM financial_statement_notes
     WHERE code = '23'
       AND category = 'expense'
       AND report_section = 'income_statement'
  ) THEN
    RAISE EXCEPTION 'Income Statement Note 23 is missing or incompatible';
  END IF;

  SELECT COUNT(*)
    INTO v_target_count
    FROM account_codes
   WHERE code IN ('HPB', 'CL_HPB')
      OR code LIKE 'HPB\_%' ESCAPE '\';

  IF v_target_count < 32 THEN
    RAISE EXCEPTION 'Expected at least 32 audited HPB suspense accounts, found %',
      v_target_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM account_codes
     WHERE (code IN ('HPB', 'CL_HPB') OR code LIKE 'HPB\_%' ESCAPE '\')
       AND fs_note IS NOT NULL
       AND fs_note NOT IN ('5', '16', '23')
  ) THEN
    RAISE EXCEPTION 'An HPB suspense account has an unexpected existing fs_note';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account_codes WHERE code = 'HPI' AND fs_note = '23'
  ) THEN
    RAISE EXCEPTION 'HPI must remain mapped to Income Statement Note 23';
  END IF;
END $$;

UPDATE account_codes
   SET fs_note = '16'
 WHERE (code IN ('HPB', 'CL_HPB') OR code LIKE 'HPB\_%' ESCAPE '\')
   AND fs_note IS DISTINCT FROM '16';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM account_codes
     WHERE (code IN ('HPB', 'CL_HPB') OR code LIKE 'HPB\_%' ESCAPE '\')
       AND fs_note IS DISTINCT FROM '16'
  ) THEN
    RAISE EXCEPTION 'One or more HPB suspense accounts were not mapped to Note 16';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account_codes WHERE code = 'HPI' AND fs_note = '23'
  ) THEN
    RAISE EXCEPTION 'HPI changed from Income Statement Note 23';
  END IF;
END $$;

COMMIT;

SELECT fs_note, COUNT(*) AS accounts
  FROM account_codes
 WHERE code IN ('HPB', 'CL_HPB', 'HPI')
    OR code LIKE 'HPB\_%' ESCAPE '\'
 GROUP BY fs_note
 ORDER BY fs_note;

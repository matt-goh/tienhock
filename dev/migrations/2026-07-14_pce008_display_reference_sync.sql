-- Keep the user-edited journal reference for PCE008/06 in sync with the
-- auditor-facing header reference used by Account Ledger and its PDF.
--
-- This is intentionally a one-row presentation repair. It does not change the
-- journal date, amounts, accounts, cheque number, status, or any journal lines.
-- PV001/06 through PV007/06 retain their existing legacy display references.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  target_id INTEGER;
  updated_count INTEGER;
BEGIN
  SELECT id
    INTO target_id
    FROM journal_entries
   WHERE reference_no = 'PCE008/06'
     AND entry_type = 'C'
     AND source_type IS NULL
     AND display_reference IN ('PV008/06', 'PCE008/06')
     FOR UPDATE;

  IF target_id IS NULL THEN
    RAISE EXCEPTION
      'Expected one source-less C journal PCE008/06 with display reference PV008/06 or PCE008/06';
  END IF;

  UPDATE journal_entries
     SET display_reference = reference_no,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = 'pce008_display_reference_sync'
   WHERE id = target_id
     AND display_reference = 'PV008/06';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  PERFORM 1
    FROM journal_entries
   WHERE id = target_id
     AND reference_no = 'PCE008/06'
     AND display_reference = 'PCE008/06'
     AND entry_type = 'C'
     AND source_type IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'PCE008/06 failed its post-update display-reference check';
  END IF;

  RAISE NOTICE 'PCE008/06 display references updated: %', updated_count;
END
$$;

COMMIT;

SELECT id,
       reference_no,
       display_reference,
       entry_type,
       entry_date,
       total_debit,
       total_credit,
       status,
       updated_at,
       updated_by
  FROM journal_entries
 WHERE reference_no = 'PCE008/06';

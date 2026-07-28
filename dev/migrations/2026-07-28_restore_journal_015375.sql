\set ON_ERROR_STOP on

-- Restore sales journal 2991 (invoice 015375, VIVIANA, RM34.00), cancelled by
-- mistake on 2026-07-28.
--
-- The journal is source_type='invoice' AND manual_override=true, so
-- syncSalesJournalEntry returns early (src/routes/accounting/sales-journal.js)
-- and will never rebuild it; editing a cancelled entry is blocked and posted
-- entries cannot be deleted. Invoice 015375 is therefore active and paid with
-- no live GL presence at all, and no workflow can restore it.
--
-- Cancellation here is a pure status flag (no reversing entry was posted), so
-- flipping it back to 'posted' restores the exact pre-cancel state. The guards
-- accept only the exact cancelled state or the exact restored state; any other
-- state aborts the whole transaction.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_header journal_entries%ROWTYPE;
  v_invoice_status TEXT;
  v_invoice_journal_id INTEGER;
  v_debtor_line journal_entry_lines%ROWTYPE;
  v_sales_line journal_entry_lines%ROWTYPE;
  v_line_count INTEGER;
  v_competing_count INTEGER;
  v_rows_updated INTEGER;
BEGIN
  SELECT *
    INTO STRICT v_header
    FROM journal_entries
   WHERE id = 2991
   FOR UPDATE;

  -- Journal identity.
  IF v_header.reference_no IS DISTINCT FROM '015375'
     OR v_header.display_reference IS DISTINCT FROM '015375'
     OR v_header.entry_type IS DISTINCT FROM 'S'
     OR v_header.entry_date IS DISTINCT FROM DATE '2026-06-29'
     OR v_header.source_type IS DISTINCT FROM 'invoice'
     OR v_header.source_id IS DISTINCT FROM '015375'
     OR v_header.manual_override IS DISTINCT FROM TRUE
     OR v_header.total_debit IS DISTINCT FROM 34.00
     OR v_header.total_credit IS DISTINCT FROM 34.00
     OR v_header.description IS DISTINCT FROM 'CASH BILL: 015375 - VIVIANA' THEN
    RAISE EXCEPTION 'journal 2991 identity has drifted';
  END IF;

  -- Never restore into the locked pre-cutover period.
  IF v_header.entry_date < DATE '2026-06-01' THEN
    RAISE EXCEPTION 'journal 2991 is dated inside the locked accounting period';
  END IF;

  -- Line set must still be intact and balanced (nothing was deleted on cancel).
  SELECT *
    INTO STRICT v_debtor_line
    FROM journal_entry_lines
   WHERE journal_entry_id = 2991
     AND line_number = 1
   FOR UPDATE;

  SELECT *
    INTO STRICT v_sales_line
    FROM journal_entry_lines
   WHERE journal_entry_id = 2991
     AND line_number = 2
   FOR UPDATE;

  SELECT COUNT(*)
    INTO v_line_count
    FROM journal_entry_lines
   WHERE journal_entry_id = 2991;

  IF v_debtor_line.account_code IS DISTINCT FROM 'VIVIANA'
     OR v_debtor_line.debit_amount IS DISTINCT FROM 34.00
     OR v_debtor_line.credit_amount IS DISTINCT FROM 0
     OR v_sales_line.account_code IS DISTINCT FROM 'CR_SALES'
     OR v_sales_line.debit_amount IS DISTINCT FROM 0
     OR v_sales_line.credit_amount IS DISTINCT FROM 34.00
     OR v_line_count <> 2 THEN
    RAISE EXCEPTION 'journal 2991 line identity has drifted';
  END IF;

  -- The owning invoice must still be active and still point at THIS journal,
  -- otherwise the cancellation was deliberate rather than accidental.
  SELECT invoice_status, journal_entry_id
    INTO STRICT v_invoice_status, v_invoice_journal_id
    FROM invoices
   WHERE id = '015375'
   FOR UPDATE;

  IF v_invoice_status = 'cancelled' THEN
    RAISE EXCEPTION 'invoice 015375 is cancelled; its journal must stay cancelled';
  END IF;

  IF v_invoice_journal_id IS DISTINCT FROM 2991 THEN
    RAISE EXCEPTION 'invoice 015375 no longer owns journal 2991';
  END IF;

  -- journal_entries_source_posted_uq allows exactly one posted journal per
  -- source; a replacement would make the restore both wrong and impossible.
  SELECT COUNT(*)
    INTO v_competing_count
    FROM journal_entries
   WHERE source_type = 'invoice'
     AND source_id = '015375'
     AND status = 'posted'
     AND id <> 2991;

  IF v_competing_count <> 0 THEN
    RAISE EXCEPTION 'invoice 015375 already has a replacement posted journal';
  END IF;

  IF v_header.status = 'cancelled' THEN
    UPDATE journal_entries
       SET status = 'posted',
           updated_at = NOW(),
           updated_by = 'restore_journal_015375'
     WHERE id = 2991;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      RAISE EXCEPTION 'expected to update journal header 2991 once';
    END IF;
    RAISE NOTICE 'APPLIED: journal 015375 (id 2991) restored to posted';
  ELSIF v_header.status IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION
      'journal 2991 is neither cancelled nor posted (status: %)', v_header.status;
  ELSE
    RAISE NOTICE 'ALREADY FINAL: journal 015375 (id 2991) is posted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM journal_entries je
     WHERE je.id = 2991
       AND je.status = 'posted'
       AND je.total_debit = 34.00
       AND je.total_credit = 34.00
       AND (SELECT COUNT(*) FROM journal_entry_lines WHERE journal_entry_id = je.id) = 2
       AND (SELECT COALESCE(SUM(debit_amount), 0) FROM journal_entry_lines WHERE journal_entry_id = je.id)
         = (SELECT COALESCE(SUM(credit_amount), 0) FROM journal_entry_lines WHERE journal_entry_id = je.id)
  ) THEN
    RAISE EXCEPTION 'postflight failed for journal 2991';
  END IF;
END $$;

COMMIT;

-- Human-readable postflight evidence when run through psql.
SELECT je.id, je.reference_no, je.entry_type, je.entry_date, je.status,
       je.total_debit, je.total_credit, je.manual_override
  FROM journal_entries je
 WHERE je.id = 2991;

SELECT jel.line_number, jel.account_code, jel.debit_amount, jel.credit_amount
  FROM journal_entry_lines jel
 WHERE jel.journal_entry_id = 2991
 ORDER BY jel.line_number;

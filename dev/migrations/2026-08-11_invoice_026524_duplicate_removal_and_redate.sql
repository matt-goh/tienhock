-- 2026-08-11 Tien Hock: bill C026524 -- remove the duplicate C026524A and
-- re-date the original from 10/08/2026 back to 07/08/2026.
--
-- WHAT HAPPENED
-- Cash bill 026524 was keyed on 10/08/2026 but belongs on 07/08/2026. It was
-- already cancelled, and until today the invoice page hid the date-edit button
-- on a cancelled bill, so the date could not be corrected. Rosa re-issued the
-- same bill as 026524A instead, leaving TWO cancelled bills for one sale, both
-- printing on the 10/08 sales summary.
--
-- WHAT THIS DOES
--   Part A -- hard-deletes invoice 026524A and everything it owns: its order
--             details and payment rows (both cascade off invoices), and its
--             cancelled sales journal with its lines. There is no application
--             path for this: DELETE /api/invoices/:id is a SOFT cancel and
--             refuses an already-cancelled bill outright.
--   Part B -- moves invoice 026524's createddate from 10/08/2026 to
--             07/08/2026, keeping its original time of day.
--
-- Part B does exactly what the invoice page's "Change Date & Time" dialog now
-- does for a cancelled bill (the button was restored in the same change), i.e.
-- it touches invoices.createddate ONLY. The bill's own journal and its
-- automatic collection row are already cancelled, so they carry no ledger
-- effect and syncSalesJournalEntry deliberately leaves their dates alone --
-- this script does the same, so SQL and UI can never diverge.
--
-- LEDGER EFFECT: none. Both bills are cancelled, both are zeroed, both of
-- their journals are cancelled, and a cancelled journal is excluded from every
-- report. No posted line, no debtor balance and no customer credit moves.
--
-- Guarded, idempotent and fail-closed: one transaction, every precondition
-- asserted. Part A refuses to run if 026524A turns out to be live, non-zero,
-- receipted, adjusted, consolidated, still valid at MyInvois, or if any journal
-- it owns is still posted or is referenced by another document.

BEGIN;

DO $$
DECLARE
  -- "C" on the printed bill is the cash-bill prefix; the stored ids carry no C.
  v_dup_id       CONSTANT varchar := '026524A';
  v_keep_id      CONSTANT varchar := '026524';
  v_wrong_date   CONSTANT date    := DATE '2026-08-10';
  v_right_date   CONSTANT date    := DATE '2026-08-07';

  v_inv          record;
  v_count        integer;
  v_journal_ids  integer[];
  v_jid          integer;
  v_old_epoch    bigint;
  v_new_epoch    bigint;
  v_local_ts     timestamp;
BEGIN
  ------------------------------------------------------------------
  -- PART A -- delete the duplicate bill 026524A.
  ------------------------------------------------------------------
  SELECT * INTO v_inv FROM invoices WHERE id = v_dup_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'Part A: invoice % does not exist - already deleted, no change', v_dup_id;
  ELSE
    -- It must be a cancelled, fully zeroed bill. We never delete live money.
    IF v_inv.invoice_status <> 'cancelled' THEN
      RAISE EXCEPTION 'Invoice % is % , not cancelled - refusing to delete',
        v_dup_id, v_inv.invoice_status;
    END IF;

    IF COALESCE(v_inv.totalamountpayable, 0) <> 0
       OR COALESCE(v_inv.balance_due, 0) <> 0
       OR COALESCE(v_inv.total_excluding_tax, 0) <> 0
       OR COALESCE(v_inv.tax_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'Invoice % is not fully zeroed (total %, balance %) - refusing to delete',
        v_dup_id, v_inv.totalamountpayable, v_inv.balance_due;
    END IF;

    IF COALESCE(v_inv.is_consolidated, false) THEN
      RAISE EXCEPTION 'Invoice % is a consolidated wrapper - refusing to delete', v_dup_id;
    END IF;

    -- A live e-Invoice at MyInvois must be cancelled there first, or deleting
    -- the local row orphans a valid government document.
    IF v_inv.uuid IS NOT NULL
       AND COALESCE(v_inv.einvoice_status, '') NOT IN ('cancelled', 'invalid') THEN
      RAISE EXCEPTION 'Invoice % still has e-Invoice % in status % - cancel it at MyInvois first',
        v_dup_id, v_inv.uuid, v_inv.einvoice_status;
    END IF;

    -- No other document may reference it.
    SELECT COUNT(*) INTO v_count FROM receipt_allocations WHERE invoice_id = v_dup_id;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Invoice % is allocated by % receipt line(s) - refusing to delete',
        v_dup_id, v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM adjustment_documents WHERE original_invoice_id = v_dup_id;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Invoice % is referenced by % adjustment document(s) - refusing to delete',
        v_dup_id, v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM invoices
     WHERE is_consolidated = true
       AND consolidated_invoices::jsonb ? v_dup_id;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Invoice % is part of % consolidated submission(s) - refusing to delete',
        v_dup_id, v_count;
    END IF;

    -- Every payment row on it must already be cancelled (the invoice
    -- cancellation cascade does this; an active row means something is wrong).
    SELECT COUNT(*) INTO v_count FROM payments
     WHERE invoice_id = v_dup_id AND (status IS NULL OR status = 'active');
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Invoice % still has % active payment row(s) - refusing to delete',
        v_dup_id, v_count;
    END IF;

    ------------------------------------------------------------------
    -- Collect every journal this bill owns: its sales journal, anything
    -- source-linked to it, and any journal hanging off its payment rows.
    ------------------------------------------------------------------
    SELECT ARRAY(
      SELECT DISTINCT j FROM (
        SELECT v_inv.journal_entry_id AS j
        UNION
        SELECT id FROM journal_entries
         WHERE source_type = 'invoice' AND source_id = v_dup_id
        UNION
        SELECT journal_entry_id FROM payments WHERE invoice_id = v_dup_id
      ) s WHERE j IS NOT NULL
    ) INTO v_journal_ids;

    FOREACH v_jid IN ARRAY COALESCE(v_journal_ids, ARRAY[]::integer[]) LOOP
      SELECT COUNT(*) INTO v_count FROM journal_entries
       WHERE id = v_jid AND status = 'cancelled';
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'Journal % owned by invoice % is not cancelled - refusing to delete',
          v_jid, v_dup_id;
      END IF;

      -- Never delete a journal another document still points at.
      SELECT
        (SELECT COUNT(*) FROM receipts             WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM bank_ins             WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM rv_registry          WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM adjustment_documents WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM purchase_invoices    WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM self_billed_invoices WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM supplier_payments    WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM invoices             WHERE journal_entry_id = v_jid
                                                     AND id <> v_dup_id)
      + (SELECT COUNT(*) FROM payments             WHERE journal_entry_id = v_jid
                                                     AND invoice_id IS DISTINCT FROM v_dup_id)
        INTO v_count;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'Journal % is referenced by % other document(s) - refusing to delete',
          v_jid, v_count;
      END IF;
    END LOOP;

    ------------------------------------------------------------------
    -- Delete. order_details and payments cascade off invoices;
    -- journal_entry_lines cascades off journal_entries.
    ------------------------------------------------------------------
    UPDATE invoices SET journal_entry_id = NULL WHERE id = v_dup_id;

    DELETE FROM invoices WHERE id = v_dup_id;

    IF v_journal_ids IS NOT NULL AND array_length(v_journal_ids, 1) > 0 THEN
      DELETE FROM journal_entries WHERE id = ANY(v_journal_ids);
    END IF;

    RAISE NOTICE 'Part A: deleted invoice % and journal(s) %',
      v_dup_id, COALESCE(v_journal_ids, ARRAY[]::integer[]);
  END IF;

  ------------------------------------------------------------------
  -- PART B -- re-date the surviving bill 026524 to 07/08/2026.
  ------------------------------------------------------------------
  SELECT * INTO v_inv FROM invoices WHERE id = v_keep_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found - nothing to re-date', v_keep_id;
  END IF;

  v_old_epoch := v_inv.createddate::bigint;
  v_local_ts  := to_timestamp(v_old_epoch / 1000.0) AT TIME ZONE 'Asia/Kuala_Lumpur';

  IF v_local_ts::date = v_right_date THEN
    RAISE NOTICE 'Part B: invoice % is already dated % - no change', v_keep_id, v_right_date;
  ELSE
    IF v_local_ts::date <> v_wrong_date THEN
      RAISE EXCEPTION 'Invoice % is dated % , expected % - refusing to re-date',
        v_keep_id, v_local_ts::date, v_wrong_date;
    END IF;

    -- Keep the original time of day; only the calendar day moves.
    v_new_epoch := (EXTRACT(EPOCH FROM
                      ((v_right_date + v_local_ts::time) AT TIME ZONE 'Asia/Kuala_Lumpur')
                    ) * 1000)::bigint;

    UPDATE invoices SET createddate = v_new_epoch::text WHERE id = v_keep_id;

    RAISE NOTICE 'Part B: invoice % re-dated % -> % (epoch % -> %)',
      v_keep_id, v_wrong_date, v_right_date, v_old_epoch, v_new_epoch;
  END IF;

  ------------------------------------------------------------------
  -- Post-conditions.
  ------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count FROM invoices WHERE id = v_dup_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Post-check failed: invoice % still exists', v_dup_id;
  END IF;

  SELECT COUNT(*) INTO v_count FROM invoices
   WHERE id = v_keep_id
     AND (to_timestamp(createddate::bigint / 1000.0) AT TIME ZONE 'Asia/Kuala_Lumpur')::date
         = v_right_date;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Post-check failed: invoice % is not dated %', v_keep_id, v_right_date;
  END IF;
END $$;

COMMIT;

-- Verify afterwards:
--   SELECT id, invoice_status, totalamountpayable, journal_entry_id,
--          to_char(to_timestamp(createddate::bigint / 1000.0)
--                  AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI') AS kl_datetime
--     FROM invoices WHERE id IN ('026524', '026524A');
--   -- expect exactly one row: 026524, cancelled, 2026-08-07.

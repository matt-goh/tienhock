-- 2026-07-30 — Green Target: remove cancelled sales journals whose invoice was deleted
--
-- WHY
-- A GT invoice may be cancelled and then hard-deleted (invoices.js DELETE
-- /:invoice_id). Until today that delete removed only the invoice row: the
-- invoice-owned `S` journal stayed behind as status='cancelled', still holding
-- reference_no = the invoice number. `journal_entries_reference_no_key` is
-- unique across ALL statuses, so re-keying that invoice number failed with
--   duplicate key value violates unique constraint "journal_entries_reference_no_key"
-- even though the invoice-number availability check (which only looks at
-- greentarget.invoices) reported the number as free.
--
-- The route now deletes the owned journal together with the invoice; this
-- migration clears the orphans that path already created. They are cancelled,
-- so they have no ledger effect (no report, trial balance or account ledger
-- reads them), and their source document no longer exists, so they can never be
-- restored either — the restore endpoint refuses a journal whose owning
-- document is gone.
--
-- SCOPE (guarded, idempotent, fail-closed, one transaction)
--   * entry_type = 'S' and source_type = 'invoice' only — a legacy import (IMP),
--     a receipt/adjustment journal and a source-less manual journal are all
--     excluded by construction.
--   * status = 'cancelled' only — a posted journal is never touched.
--   * The source invoice must genuinely no longer exist, and no invoice may
--     still back-link to the journal.
--   * Lines cascade (journal_entry_lines FK ON DELETE CASCADE).
--
-- Known target on dev at authoring time: journal 1709, reference 2026/01013,
-- 'INV/NO : 2026/01013 /RIDZUAN', DR CD_SD 250.00 / CR TGA 250.00, invoice 327
-- (deleted). Production may have none or several — the migration is written
-- against the pattern, not that id.

BEGIN;

DO $$
DECLARE
  v_removed_journals INT;
  v_removed_lines    INT;
  v_remaining        INT;
BEGIN
  CREATE TEMP TABLE gt_orphan_invoice_journals ON COMMIT DROP AS
  SELECT je.id, je.reference_no, je.source_id, je.entry_date, je.total_debit
    FROM greentarget.journal_entries je
   WHERE je.entry_type  = 'S'
     AND je.source_type = 'invoice'
     AND je.status      = 'cancelled'
     AND NOT EXISTS (
           SELECT 1 FROM greentarget.invoices i
            WHERE i.invoice_id::text = je.source_id
         )
     AND NOT EXISTS (
           SELECT 1 FROM greentarget.invoices i
            WHERE i.journal_entry_id = je.id
         );

  -- Safety: never touch a journal any other document still points at.
  IF EXISTS (
    SELECT 1
      FROM gt_orphan_invoice_journals o
      JOIN greentarget.payments p ON p.journal_entry_id = o.id
  ) OR EXISTS (
    SELECT 1
      FROM gt_orphan_invoice_journals o
      JOIN greentarget.adjustment_documents a ON a.journal_entry_id = o.id
  ) THEN
    RAISE EXCEPTION
      'Aborting: a GT payment or adjustment document still references an orphaned invoice journal';
  END IF;

  RAISE NOTICE 'Orphaned GT sales journals to remove: %',
    COALESCE(
      (SELECT string_agg(o.id || ' (' || o.reference_no || ')', ', ' ORDER BY o.id)
         FROM gt_orphan_invoice_journals o),
      'none'
    );

  DELETE FROM greentarget.journal_entry_lines l
   USING gt_orphan_invoice_journals o
   WHERE l.journal_entry_id = o.id;
  GET DIAGNOSTICS v_removed_lines = ROW_COUNT;

  DELETE FROM greentarget.journal_entries je
   USING gt_orphan_invoice_journals o
   WHERE je.id = o.id;
  GET DIAGNOSTICS v_removed_journals = ROW_COUNT;

  SELECT COUNT(*) INTO v_remaining
    FROM greentarget.journal_entries je
   WHERE je.entry_type  = 'S'
     AND je.source_type = 'invoice'
     AND je.status      = 'cancelled'
     AND NOT EXISTS (
           SELECT 1 FROM greentarget.invoices i
            WHERE i.invoice_id::text = je.source_id
         )
     AND NOT EXISTS (
           SELECT 1 FROM greentarget.invoices i
            WHERE i.journal_entry_id = je.id
         );

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION
      'Post-check failed: % orphaned cancelled GT sales journal(s) remain', v_remaining;
  END IF;

  RAISE NOTICE 'Removed % orphaned GT sales journal(s) and % line(s)',
    v_removed_journals, v_removed_lines;
END $$;

COMMIT;

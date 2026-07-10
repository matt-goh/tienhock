-- =============================================================================
-- 2026-07-10_receipts_phase2_columns.sql
-- Phase 2 (invoice + receipt posting) column additions. Idempotent.
--
--   * payments.is_auto_collection — explicit flag for the automatic CASH-bill
--     collection row (replaces note-text inference, which the plan forbids).
--     Seeded from the two known historical note texts.
--   * payments.receipt_allocation_id — back-link from the legacy payments row
--     (kept as the invoice-level payment history projection) to the owning
--     receipt allocation. Rows with this set are managed by the receipt:
--     they never carry their own journal and cannot be cancelled row-by-row.
--   * journal_entry_lines.display_reference — per-LINE visible Journal No.
--     Needed because one physical-cash receipt covering several invoices
--     prints one CH_REV2 debit row per invoice, each with its own C{invoice}
--     reference (legacy proof: C015333 / C015337 / C015346 on 06/06/2026).
--     Ledgers resolve COALESCE(line.display_reference,
--     header.display_reference, header.reference_no).
-- =============================================================================

BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS is_auto_collection BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_allocation_id INTEGER REFERENCES receipt_allocations(id) ON DELETE SET NULL;

COMMENT ON COLUMN payments.is_auto_collection IS
  'true = automatic CASH-bill collection row owned by the invoice (non-posting; no own journal). Explicit flag — never infer from notes.';
COMMENT ON COLUMN payments.receipt_allocation_id IS
  'Owning receipt allocation when this row is the projection of a receipt. Set => row is managed by the receipt lifecycle.';

CREATE INDEX IF NOT EXISTS payments_receipt_allocation_idx
  ON payments (receipt_allocation_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx
  ON payments (invoice_id);

-- Seed the auto-collection flag from the two known historical note texts,
-- restricted to cash-method rows (the only kind the auto paths ever created).
UPDATE payments p
   SET is_auto_collection = true
 WHERE p.is_auto_collection = false
   AND p.payment_method = 'cash'
   AND (p.notes LIKE 'Automatic payment%'
     OR p.notes LIKE 'Payment automatically recorded%');

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS display_reference VARCHAR(100);

COMMENT ON COLUMN journal_entry_lines.display_reference IS
  'Per-line visible Journal No. override (e.g. C{invoice} rows of one grouped cash receipt). Fallback: journal_entries.display_reference, then reference_no.';

COMMIT;

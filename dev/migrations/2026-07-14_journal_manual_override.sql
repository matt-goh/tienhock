-- =============================================================================
-- Human-owned ("detached") sales journals.
--
-- Sales journals (entry_type 'S') are normally rebuilt from their invoice by
-- syncSalesJournalEntry on every invoice lifecycle event. This flag lets staff
-- take one over: once a sales journal is edited directly, manual_override is
-- set and the sync stops rebuilding it (invoice cancellation still cancels it
-- via cancelSalesJournalEntry). NULL/false = system-owned, the default.
--
-- Adding a NOT NULL column with a constant default is a metadata-only change in
-- modern PostgreSQL. Guarded and idempotent.
-- =============================================================================

BEGIN;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN journal_entries.manual_override IS
  'true = this journal has been hand-edited and detached from its source, so the source sync no longer rebuilds it. Currently set only when a sales (S) journal is edited directly.';

COMMIT;

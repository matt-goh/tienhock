-- Adds the auto-posted sales journal (entry_type 'S') link to invoices.
-- Run BEFORE deploying the sales-journal code.
-- Apply: docker exec -i tienhock_dev_db psql -U postgres -d tienhock < migrations/2026_07_07_invoices_journal_entry_id.sql

ALTER TABLE invoices ADD COLUMN journal_entry_id INTEGER REFERENCES journal_entries(id);
CREATE INDEX idx_invoices_journal_entry ON invoices(journal_entry_id);

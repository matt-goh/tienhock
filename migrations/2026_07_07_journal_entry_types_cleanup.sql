-- Clean up journal_entry_types: drop vestigial legacy single-letter types that nothing
-- produces (I, R, O, CR, DR — the live system posts REC, S, CN, DN, RN, B, GP, PUR, PAY,
-- JVDR, JVSL, J, C) and register the real sales-adjustment types (CN/DN/RN) so their
-- journals are filterable and named in the Journal Entries list.
-- Apply: docker exec -i tienhock_dev_db psql -U postgres -d tienhock < migrations/2026_07_07_journal_entry_types_cleanup.sql

BEGIN;

-- Remove legacy types (no journal_entries rows reference these codes).
DELETE FROM journal_entry_types WHERE code IN ('I', 'R', 'O', 'CR', 'DR');

-- Register the adjustment-document journal types actually posted by the system.
INSERT INTO journal_entry_types (code, name, description, is_active) VALUES
  ('CN', 'Credit Note', 'Credit note journal (sales adjustment)', true),
  ('DN', 'Debit Note',  'Debit note journal (sales adjustment)',  true),
  ('RN', 'Refund Note', 'Refund note journal (sales adjustment)', true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true;

COMMIT;

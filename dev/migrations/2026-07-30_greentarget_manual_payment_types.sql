-- dev/migrations/2026-07-30_greentarget_manual_payment_types.sql
--
-- Adds the Tien Hock manual journal entry types B (Bank Payment), C (Cash
-- Payment) and J (Journal) to Green Target so staff can key payment vouchers
-- on the GT Journal Entries page exactly like Tien Hock (request 29-30 Jul
-- 2026). Names/descriptions are copied verbatim from
-- public.journal_entry_types. GT keeps its own design: no header cheque_no
-- machinery — cheque/transaction references stay per line.
--
-- Idempotent: ON CONFLICT DO NOTHING, reruns as a no-op. Applies to dev AND
-- production.

INSERT INTO greentarget.journal_entry_types (code, name, description, is_active)
VALUES
  ('B', 'Bank Payment', 'Payment made through bank', true),
  ('C', 'Cash Payment', 'Cash payment entry', true),
  ('J', 'Journal', 'General journal entry', true)
ON CONFLICT (code) DO NOTHING;

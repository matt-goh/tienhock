-- dev/migrations/2026-07-28_greentarget_g7_organic_posting.sql
--
-- Phase G7 foundation (handover docs/Account/GT_ACCOUNTING_HANDOVER.md, phase
-- G7 + decisions R2/R6/R8): organic posting for Green Target from 2026-07-01.
--
--   1. journal_entry_id on greentarget.invoices / payments / adjustment_documents
--      so every operational document can own exactly one journal.
--   2. bank_account on greentarget.payments (the account debited when the
--      payment posts; GT's ledger only uses PBB_1).
--   3. The operational journal entry types (S/REC/CN/DN/RN) plus JV for manual
--      journals. The legacy families keep riding legacy_entry_type; only IMP
--      existed before this migration.
--
-- Guarded and idempotent: the guard proves the G4 import population is intact
-- (so this never runs against a database that has not been rebuilt through
-- G2-G4), and every statement reruns as a no-op.

DO $$
DECLARE
  imp_posted integer;
BEGIN
  SELECT count(*) INTO imp_posted
    FROM greentarget.journal_entries
   WHERE entry_type = 'IMP' AND status = 'posted';
  IF imp_posted <> 1705 THEN
    RAISE EXCEPTION 'G7 guard failed: expected 1705 posted IMP journals from the G4 import, found %. Apply the G2-G4 rebuild first.', imp_posted;
  END IF;
END $$;

ALTER TABLE greentarget.invoices
  ADD COLUMN IF NOT EXISTS journal_entry_id integer
  REFERENCES greentarget.journal_entries(id);

ALTER TABLE greentarget.payments
  ADD COLUMN IF NOT EXISTS journal_entry_id integer
  REFERENCES greentarget.journal_entries(id),
  ADD COLUMN IF NOT EXISTS bank_account varchar(20);

ALTER TABLE greentarget.adjustment_documents
  ADD COLUMN IF NOT EXISTS journal_entry_id integer
  REFERENCES greentarget.journal_entries(id);

INSERT INTO greentarget.journal_entry_types (code, name, description, is_active) VALUES
  ('S',   'Sales',        'Invoice journal posted by the Green Target sales screen', true),
  ('REC', 'Receipt',      'Payment journal posted by the Green Target payments screen', true),
  ('CN',  'Credit Note',  'Credit note journal posted by the Green Target adjustment screen', true),
  ('DN',  'Debit Note',   'Debit note journal posted by the Green Target adjustment screen', true),
  ('RN',  'Refund Note',  'Refund note journal posted by the Green Target adjustment screen', true),
  ('JV',  'Journal Voucher', 'Manually keyed Green Target journal (expenses, bank charges, other postings with no operational screen)', true)
ON CONFLICT (code) DO NOTHING;

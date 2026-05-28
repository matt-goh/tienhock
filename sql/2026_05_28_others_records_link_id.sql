-- Add link_id to others_records so multi-date entries can stay grouped.
-- Rows sharing the same link_id are "linked siblings" that always agree on
-- pay_code_id, description, rate, rate_unit, quantity, amount.
-- One staff per link (link_id always belongs to a single employee_id).
-- NULL link_id = standalone record.

ALTER TABLE others_records
  ADD COLUMN IF NOT EXISTS link_id UUID NULL;

CREATE INDEX IF NOT EXISTS others_records_link_id_idx
  ON others_records(link_id)
  WHERE link_id IS NOT NULL;

-- Add cheque_no column to journal_entries (header-level cheque number for Cash Payment / C type vouchers).
-- Sequential like the reference number (e.g. PBB350779, PBB350780, ...), customizable per entry.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS cheque_no VARCHAR(50);

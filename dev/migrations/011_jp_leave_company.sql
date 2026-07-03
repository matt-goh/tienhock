-- 011_jp_leave_company.sql
-- Company marker on the shared leave ledger. Leave BALANCES stay combined
-- (one entitlement bucket per person across companies), but each company's
-- PAYROLL only pays its own leave records - otherwise a dual-company staff's
-- leave day would be added to gross by both TH and JP processing.

BEGIN;

ALTER TABLE public.leave_records
  ADD COLUMN company VARCHAR(4) NOT NULL DEFAULT 'TH'
    CHECK (company IN ('TH', 'JP'));

CREATE INDEX idx_leave_records_company ON public.leave_records (company);

COMMIT;

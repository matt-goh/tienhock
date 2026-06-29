-- 006_gt_addon_tables.sql
-- Green Target Payroll Phase 2 — earning add-on tables.
-- Mirrors the shared public.commission_records / public.others_records, but
-- scoped to the greentarget schema so GT Bonus / Advance / Kerja Luar OT records
-- stay out of Tien Hock lists and reports (same precedent as
-- greentarget.pinjam_records / greentarget.mid_month_payrolls).
--
-- GT has no locations/salesmen, so the Bonus vs Advance split is carried by the
-- existing is_advance flag (no location_code column):
--   Bonus           -> is_advance = false (pure earning; raises gross + net)
--   Others (Advance)-> is_advance = true  (raises gross, then deducted; net ~0)
--
-- Idempotent: safe to run more than once.

BEGIN;

-- ------------------------------------------------------------------
-- 1. greentarget.commission_records (Bonus + Advance)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.commission_records (
  id              SERIAL PRIMARY KEY,
  employee_id     VARCHAR(50) REFERENCES public.staffs(id),
  commission_date DATE NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  description     TEXT,
  is_advance      BOOLEAN NOT NULL DEFAULT false,
  created_by      VARCHAR(50),
  created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gt_commission_records_employee_date
  ON greentarget.commission_records (employee_id, commission_date);

-- ------------------------------------------------------------------
-- 2. greentarget.others_records (Kerja Luar OT)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.others_records (
  id            SERIAL PRIMARY KEY,
  employee_id   VARCHAR NOT NULL REFERENCES public.staffs(id),
  record_date   DATE NOT NULL,
  pay_code_id   VARCHAR REFERENCES public.pay_codes(id),
  description   TEXT NOT NULL,
  rate          NUMERIC(10,2) NOT NULL,
  rate_unit     VARCHAR NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  link_id       UUID,
  report_column VARCHAR(8),
  created_by    VARCHAR,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT gt_others_records_report_column_chk
    CHECK (report_column IS NULL OR report_column IN ('GAJI','OT','BONUS','CIO','CUTI'))
);

CREATE INDEX IF NOT EXISTS gt_others_records_employee_date_idx
  ON greentarget.others_records (employee_id, record_date);
CREATE INDEX IF NOT EXISTS gt_others_records_link_id_idx
  ON greentarget.others_records (link_id) WHERE link_id IS NOT NULL;

COMMIT;

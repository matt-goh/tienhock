-- Green Target payroll leave system.
-- Separate GT ledger (isolated from public/TH and jellypolly/JP), keyed to
-- public.staffs the same way GT commission_records / others_records /
-- pinjam_records / mid_month_payrolls already are.

CREATE TABLE IF NOT EXISTS greentarget.leave_records (
  id            SERIAL PRIMARY KEY,
  employee_id   VARCHAR(50) REFERENCES public.staffs(id),
  leave_date    DATE NOT NULL,
  leave_type    VARCHAR(20) NOT NULL
                CHECK (leave_type IN ('cuti_umum','cuti_sakit','cuti_tahunan','cuti_rawatan')),
  work_log_id   INTEGER,               -- kept for shape parity; always NULL (GT has no shared daily work-log)
  days_taken    NUMERIC(3,1) DEFAULT 1.0,
  amount_paid   NUMERIC(10,2) DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'approved',
  notes         TEXT,
  created_by    VARCHAR(50),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gt_leave_records_employee_date ON greentarget.leave_records(employee_id, leave_date);
CREATE INDEX IF NOT EXISTS idx_gt_leave_records_date_range    ON greentarget.leave_records(leave_date);

CREATE TABLE IF NOT EXISTS greentarget.employee_leave_balances (
  id                 SERIAL PRIMARY KEY,
  employee_id        VARCHAR(50) REFERENCES public.staffs(id),
  year               INTEGER NOT NULL,
  cuti_umum_total    INTEGER DEFAULT 14,
  cuti_tahunan_total INTEGER NOT NULL,
  cuti_sakit_total   INTEGER NOT NULL,
  cuti_rawatan_total INTEGER NOT NULL DEFAULT 60,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, year)
);

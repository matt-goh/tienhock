-- ============================================================================
-- JP_PROD_DEPLOY.sql - Jelly Polly payroll & production: PRODUCTION deployment
-- ============================================================================
-- Consolidates everything applied to the dev DB for the JP payroll build
-- (dev migrations 008 + 009-structural + 010 + 011), WITHOUT the dev-only
-- mock/test data (no JPT_* staff, no test assignments, no employee overrides).
--
-- Run once against the production database:
--   psql -U <user> -d tienhock -v ON_ERROR_STOP=1 -f JP_PROD_DEPLOY.sql
--
-- Prerequisites (already true in prod): the `jellypolly` schema exists
-- (invoices/payments live there) and the shared public catalogue tables exist.
--
-- After deploying:
--   1. Review/adjust the JP pay code rates in Catalogue -> Pay Codes
--      (the rates below are placeholders).
--   2. Add real staff in Catalogue -> Staff, then assign them on the
--      Jelly Polly -> Payroll -> Staff Assignment page.
--   3. Map JP products to pay codes via the "Mappings" button on the JP
--      Production Entry page (job JP_PACKING needs Bag/Ctn codes mapped for
--      production pay to flow into payroll).
--   4. Enter the JP e-Caruman registration codes on the JP e-Caruman page.

BEGIN;

-- ============================================================
-- 1. JP payroll employee assignments (staff -> page/job)
-- ============================================================
CREATE TABLE jellypolly.payroll_employees (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL REFERENCES public.staffs(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL,
    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    CONSTRAINT jp_payroll_employees_job_type_check CHECK (
        job_type IN ('OFFICE','MAINTENANCE','SALESMAN','SALESMAN_IKUT','ICE_POLLY','JELLY_CUP','PLASTIC','PRODUCTION')
    ),
    CONSTRAINT jp_payroll_employees_employee_job_key UNIQUE (employee_id, job_type)
);
CREATE INDEX idx_jp_payroll_employees_job_type ON jellypolly.payroll_employees (job_type);

-- ============================================================
-- 2. Payroll core
-- ============================================================
CREATE TABLE jellypolly.monthly_payrolls (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    CONSTRAINT jp_monthly_payrolls_year_month_key UNIQUE (year, month)
);

CREATE TABLE jellypolly.employee_payrolls (
    id SERIAL PRIMARY KEY,
    monthly_payroll_id INTEGER REFERENCES jellypolly.monthly_payrolls(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) REFERENCES public.staffs(id),
    job_type VARCHAR(50),
    section VARCHAR(50),
    gross_pay NUMERIC(10,2) DEFAULT 0,
    net_pay NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    employee_job_mapping JSONB,
    digenapkan NUMERIC(10,2) DEFAULT 0,
    setelah_digenapkan NUMERIC(10,2),
    CONSTRAINT jp_employee_payrolls_month_employee_key UNIQUE (monthly_payroll_id, employee_id)
);
CREATE INDEX idx_jp_employee_payrolls_employee ON jellypolly.employee_payrolls (employee_id);

CREATE TABLE jellypolly.payroll_items (
    id SERIAL PRIMARY KEY,
    employee_payroll_id INTEGER REFERENCES jellypolly.employee_payrolls(id) ON DELETE CASCADE,
    pay_code_id VARCHAR(50) REFERENCES public.pay_codes(id),
    description TEXT,
    rate NUMERIC(10,2),
    rate_unit VARCHAR(20),
    quantity NUMERIC(10,2),
    foc_units NUMERIC(10,2) DEFAULT 0,
    amount NUMERIC(10,2),
    is_manual BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    job_type VARCHAR(50),
    source_employee_id VARCHAR(50),
    source_date DATE,
    work_log_id INTEGER,
    work_log_type VARCHAR(20)
);
CREATE INDEX idx_jp_payroll_items_employee_payroll ON jellypolly.payroll_items (employee_payroll_id);

CREATE TABLE jellypolly.payroll_deductions (
    id SERIAL PRIMARY KEY,
    employee_payroll_id INTEGER REFERENCES jellypolly.employee_payrolls(id) ON DELETE CASCADE,
    deduction_type VARCHAR(20) CHECK (deduction_type IN ('epf','socso','sip','income_tax')),
    employee_amount NUMERIC(10,2),
    employer_amount NUMERIC(10,2),
    wage_amount NUMERIC(10,2),
    rate_info JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_jp_payroll_deductions_employee_payroll ON jellypolly.payroll_deductions (employee_payroll_id);

-- ============================================================
-- 3. Monthly work logs (Office / Maintenance) - TH shape incl. Ahad/Umum
-- ============================================================
CREATE TABLE jellypolly.monthly_work_logs (
    id SERIAL PRIMARY KEY,
    log_month INTEGER NOT NULL CHECK (log_month >= 1 AND log_month <= 12),
    log_year INTEGER NOT NULL CHECK (log_year >= 2000 AND log_year <= 2100),
    section TEXT NOT NULL,
    context_data JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'Submitted' CHECK (status IN ('Submitted','Processed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT jp_monthly_work_logs_month_year_section_key UNIQUE (log_month, log_year, section)
);

CREATE TABLE jellypolly.monthly_work_log_entries (
    id SERIAL PRIMARY KEY,
    monthly_log_id INTEGER NOT NULL REFERENCES jellypolly.monthly_work_logs(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES public.staffs(id),
    job_id TEXT NOT NULL REFERENCES public.jobs(id),
    total_hours NUMERIC(6,2) NOT NULL CHECK (total_hours >= 0),
    overtime_hours NUMERIC(6,2) DEFAULT 0 CHECK (overtime_hours >= 0),
    ahad_hours NUMERIC(6,2) DEFAULT 0 NOT NULL,
    umum_hours NUMERIC(6,2) DEFAULT 0 NOT NULL,
    ahad_overtime_hours NUMERIC(6,2) DEFAULT 0 NOT NULL,
    umum_overtime_hours NUMERIC(6,2) DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_jp_monthly_work_log_entries_log ON jellypolly.monthly_work_log_entries (monthly_log_id);
CREATE INDEX idx_jp_monthly_work_log_entries_employee ON jellypolly.monthly_work_log_entries (employee_id);

CREATE TABLE jellypolly.monthly_work_log_activities (
    id SERIAL PRIMARY KEY,
    monthly_entry_id INTEGER NOT NULL REFERENCES jellypolly.monthly_work_log_entries(id) ON DELETE CASCADE,
    pay_code_id TEXT NOT NULL REFERENCES public.pay_codes(id),
    description TEXT,
    hours_applied NUMERIC(6,2),
    units_produced NUMERIC(10,2) DEFAULT NULL,
    rate_used NUMERIC(10,2),
    calculated_amount NUMERIC(10,2),
    is_manually_added BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_jp_monthly_work_log_activities_entry ON jellypolly.monthly_work_log_activities (monthly_entry_id);

-- ============================================================
-- 4. Daily work logs (Salesman, Ice-Polly, Jelly Cup, Plastic) - TH shape
-- ============================================================
CREATE TABLE jellypolly.daily_work_logs (
    id SERIAL PRIMARY KEY,
    log_date DATE NOT NULL,
    shift INTEGER,
    day_type VARCHAR(10) NOT NULL CHECK (day_type IN ('Biasa','Ahad','Umum')),
    context_data JSONB,
    status VARCHAR(20) DEFAULT 'Draft' NOT NULL CHECK (status IN ('Draft','Submitted','Approved','Processed')),
    section VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_jp_daily_work_logs_date_status ON jellypolly.daily_work_logs (log_date, status);
CREATE INDEX idx_jp_daily_work_logs_section ON jellypolly.daily_work_logs (section);

CREATE TABLE jellypolly.daily_work_log_entries (
    id SERIAL PRIMARY KEY,
    work_log_id INTEGER NOT NULL REFERENCES jellypolly.daily_work_logs(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) NOT NULL REFERENCES public.staffs(id) ON DELETE RESTRICT,
    total_hours NUMERIC(4,2) DEFAULT 0 NOT NULL,
    job_id VARCHAR(50) NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
    is_on_leave BOOLEAN DEFAULT false,
    leave_type VARCHAR(20) CHECK (leave_type IN ('cuti_umum','cuti_sakit','cuti_tahunan') OR leave_type IS NULL),
    following_salesman_id VARCHAR(50) REFERENCES public.staffs(id),
    muat_mee_bags INTEGER DEFAULT 0,
    muat_bihun_bags INTEGER DEFAULT 0,
    location_type VARCHAR(20) DEFAULT 'Local' CHECK (location_type IN ('Local','Outstation')),
    is_doubled BOOLEAN DEFAULT false,
    force_ot_hours NUMERIC(4,2) DEFAULT 0
);
CREATE INDEX idx_jp_daily_work_log_entries_work_log ON jellypolly.daily_work_log_entries (work_log_id);
CREATE INDEX idx_jp_daily_work_log_entries_employee ON jellypolly.daily_work_log_entries (employee_id);

CREATE TABLE jellypolly.daily_work_log_activities (
    id SERIAL PRIMARY KEY,
    log_entry_id INTEGER NOT NULL REFERENCES jellypolly.daily_work_log_entries(id) ON DELETE CASCADE,
    pay_code_id VARCHAR(50) NOT NULL REFERENCES public.pay_codes(id) ON DELETE RESTRICT,
    hours_applied NUMERIC(4,2),
    units_produced NUMERIC(10,2),
    rate_used NUMERIC(10,2) NOT NULL,
    calculated_amount NUMERIC(10,2) NOT NULL,
    is_manually_added BOOLEAN DEFAULT false,
    foc_units NUMERIC(10,2) DEFAULT 0
);
CREATE INDEX idx_jp_daily_work_log_activities_entry ON jellypolly.daily_work_log_activities (log_entry_id);

-- ============================================================
-- 5. Add-ons: pinjam, mid-month, bonus/advance, others (Kerja Luar OT)
-- ============================================================
CREATE TABLE jellypolly.pinjam_records (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(255) NOT NULL REFERENCES public.staffs(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    description VARCHAR(255) NOT NULL,
    pinjam_type VARCHAR(20) NOT NULL CHECK (pinjam_type IN ('mid_month','monthly')),
    created_by VARCHAR(10) REFERENCES public.staffs(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jp_pinjam_records_unique_key UNIQUE (employee_id, year, month, description, pinjam_type)
);
CREATE INDEX idx_jp_pinjam_records_employee_date ON jellypolly.pinjam_records (employee_id, year, month);
CREATE INDEX idx_jp_pinjam_records_date ON jellypolly.pinjam_records (year, month);

CREATE TABLE jellypolly.mid_month_payrolls (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL REFERENCES public.staffs(id),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('Cash','Bank','Cheque')),
    status VARCHAR(20) DEFAULT 'Pending' NOT NULL CHECK (status IN ('Pending','Paid','Cancelled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    paid_at TIMESTAMPTZ,
    notes TEXT,
    CONSTRAINT jp_mid_month_payrolls_employee_year_month_key UNIQUE (employee_id, year, month)
);

CREATE TABLE jellypolly.commission_records (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) REFERENCES public.staffs(id),
    commission_date DATE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    description TEXT,
    is_advance BOOLEAN DEFAULT false NOT NULL,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_jp_commission_records_employee_date ON jellypolly.commission_records (employee_id, commission_date);

CREATE TABLE jellypolly.others_records (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR NOT NULL REFERENCES public.staffs(id),
    record_date DATE NOT NULL,
    pay_code_id VARCHAR REFERENCES public.pay_codes(id),
    description TEXT NOT NULL,
    rate NUMERIC(10,2) NOT NULL,
    rate_unit VARCHAR NOT NULL,
    quantity NUMERIC(10,2) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    link_id UUID,
    report_column VARCHAR(8),
    created_by VARCHAR,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT jp_others_records_report_column_chk CHECK (
        report_column IS NULL OR report_column IN ('GAJI','OT','BONUS','CIO','CUTI')
    )
);
CREATE INDEX idx_jp_others_records_employee_date ON jellypolly.others_records (employee_id, record_date);

-- ============================================================
-- 6. JP payroll settings (e-caruman registration codes etc.)
-- ============================================================
CREATE TABLE jellypolly.payroll_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(50) NOT NULL UNIQUE,
    setting_value VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. JP production worker-order scope
-- ============================================================
ALTER TABLE public.production_worker_orders
    DROP CONSTRAINT production_worker_orders_scope_check;
ALTER TABLE public.production_worker_orders
    ADD CONSTRAINT production_worker_orders_scope_check
    CHECK (scope = ANY (ARRAY['BH_PACKING'::text, 'MEE_PACKING'::text, 'JP_PRODUCTION'::text]));

-- ============================================================
-- 8. Shared leave ledger: JP linkage + company marker
--    (balances stay combined; each company's payroll pays only its own leave)
-- ============================================================
ALTER TABLE public.leave_records
  ADD COLUMN jp_work_log_id INTEGER
    REFERENCES jellypolly.daily_work_logs(id) ON DELETE CASCADE;

CREATE INDEX idx_leave_records_jp_work_log
  ON public.leave_records (jp_work_log_id)
  WHERE jp_work_log_id IS NOT NULL;

ALTER TABLE public.leave_records
  ADD COLUMN company VARCHAR(4) NOT NULL DEFAULT 'TH'
    CHECK (company IN ('TH', 'JP'));

CREATE INDEX idx_leave_records_company ON public.leave_records (company);

-- ============================================================
-- 9. JP jobs (shared public.jobs; JP_ prefix keeps TH lists clean)
-- ============================================================
INSERT INTO public.jobs (id, name, section) VALUES
    ('JP_OFFICE',        'JP Office',                'JELLY POLLY'),
    ('JP_MAINTEN',       'JP Maintenance',           'JELLY POLLY'),
    ('JP_SALESMAN',      'JP Salesman',              'JELLY POLLY'),
    ('JP_SALESMAN_IKUT', 'JP Salesman Ikut',         'JELLY POLLY'),
    ('JP_ICE_POLLY',     'JP Ice-Polly Machine',     'JELLY POLLY'),
    ('JP_JELLY_CUP',     'JP Jelly Cup Machine',     'JELLY POLLY'),
    ('JP_PLASTIC',       'JP Plastic Machine',       'JELLY POLLY'),
    ('JP_PACKING',       'JP Production Packing',    'JELLY POLLY')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 10. JP pay codes (shared public.pay_codes; PLACEHOLDER rates - adjust in
--     Catalogue -> Pay Codes before the first real payroll month)
-- ============================================================
INSERT INTO public.pay_codes
    (id, description, pay_type, rate_unit, rate_biasa, rate_ahad, rate_umum, is_active, requires_units_input)
VALUES
    ('JP_BULAN',       'GAJI POKOK (BASIC SALARY) - JP',        'Base',     'Fixed', 0.00,  0.00,  0.00,  true, false),
    ('JP_OT_OFFICE',   'OT X 1.5 (JP OFFICE)',                  'Overtime', 'Hour',  0.00,  0.00,  0.00,  true, false),
    ('JP_MAINTEN_JAM', 'KERJA PENYELENGGARAAN (JP MAINTENANCE)','Base',     'Hour',  10.00, 13.00, 20.00, true, false),
    ('JP_OT_MAINTEN',  'OT X 1.5 (JP MAINTENANCE)',             'Overtime', 'Hour',  7.50,  7.50,  7.50,  true, false),
    ('JP_MESIN_JAM',   'KERJA MESIN (JP)',                      'Base',     'Hour',  8.00,  10.50, 16.00, true, false),
    ('JP_OT_MESIN',    'OT X 1.5 (JP MESIN)',                   'Overtime', 'Hour',  6.00,  6.00,  6.00,  true, false),
    ('JP_CTN_30ML',    'PLASTIK 30ML (1 CTN) - JP',             'Base',     'Ctn',   0.50,  0.50,  0.50,  true, true),
    ('JP_CTN_70ML',    'PLASTIK 70ML (1 CTN) - JP',             'Base',     'Ctn',   0.70,  0.70,  0.70,  true, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 11. Job -> pay code mappings. Salesman/ikut reuse the EXISTING ice-polly Ctn
--     codes (same ids as the JP products); guarded so missing codes are skipped.
-- ============================================================
INSERT INTO public.job_pay_codes (job_id, pay_code_id, is_default)
SELECT v.job_id, v.pay_code_id, v.is_default
FROM (VALUES
    ('JP_OFFICE',        'JP_BULAN',       true),
    ('JP_OFFICE',        'JP_OT_OFFICE',   false),
    ('JP_MAINTEN',       'JP_MAINTEN_JAM', true),
    ('JP_MAINTEN',       'JP_OT_MAINTEN',  false),
    ('JP_ICE_POLLY',     'JP_MESIN_JAM',   true),
    ('JP_ICE_POLLY',     'JP_OT_MESIN',    false),
    ('JP_JELLY_CUP',     'JP_MESIN_JAM',   true),
    ('JP_JELLY_CUP',     'JP_OT_MESIN',    false),
    ('JP_PLASTIC',       'JP_CTN_30ML',    true),
    ('JP_PLASTIC',       'JP_CTN_70ML',    true),
    ('JP_SALESMAN',      'MEQ-25ML',       true),
    ('JP_SALESMAN',      'MEQ-60ML',       true),
    ('JP_SALESMAN',      'S-25ML',         true),
    ('JP_SALESMAN',      'S-60ML',         true),
    ('JP_SALESMAN',      'SALESMAN_OT',    false),
    ('JP_SALESMAN_IKUT', '25MEQ',          false),
    ('JP_SALESMAN_IKUT', '60ML',           false),
    ('JP_SALESMAN_IKUT', '70ML',           false),
    ('JP_SALESMAN_IKUT', 'MUAT_25MEQ',     false),
    ('JP_SALESMAN_IKUT', 'MUAT_25ML',      false),
    ('JP_SALESMAN_IKUT', 'MUAT_60ML',      false),
    ('JP_SALESMAN_IKUT', 'MUAT_70ML',      false)
) AS v(job_id, pay_code_id, is_default)
WHERE EXISTS (SELECT 1 FROM public.pay_codes pc WHERE pc.id = v.pay_code_id)
  AND NOT EXISTS (
      SELECT 1 FROM public.job_pay_codes jpc
      WHERE jpc.job_id = v.job_id AND jpc.pay_code_id = v.pay_code_id
  );

COMMIT;

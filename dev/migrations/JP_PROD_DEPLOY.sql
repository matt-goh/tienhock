-- ============================================================================
-- JP_PROD_DEPLOY.sql - Jelly Polly payroll & production: PRODUCTION deployment
-- (v2 - OWN CATALOGUE design)
-- ============================================================================
-- JP has its OWN catalogue in the jellypolly schema (staffs, jobs, pay_codes,
-- job/employee pay-code mappings, pay-rate schedules, leave, production) -
-- nothing shared with the Tien Hock catalogue. Products remain shared
-- (public.products, type='JP').
--
-- Consolidates dev migrations 008 (v2) + the structural seeds of 009 (jobs,
-- pay codes, job mappings), WITHOUT the dev-only mock data (no JPT_* staff).
--
-- Run once against the production database:
--   psql -U <user> -d tienhock -v ON_ERROR_STOP=1 -f JP_PROD_DEPLOY.sql
--
-- After deploying:
--   1. Adjust the JP pay code rates in Jelly Polly -> Catalogue -> Pay Codes
--      (the rates below are placeholders).
--   2. Add real staff in Jelly Polly -> Catalogue -> Staff, then give each
--      staff their JP job(s) (Catalogue -> Job "Manage Staff", or the staff
--      form) — holding a JP_* job puts them on the matching payroll pages.
--   3. Map JP products to pay codes via the "Mappings" button on the JP
--      Production Entry page (job JP_PACKING carries the packing Ctn codes).
--   4. Enter the JP e-Caruman registration codes on the JP e-Caruman page.
--   5. Set leave entitlements per staff/year via the JP Cuti Management page
--      (jellypolly.employee_leave_balances).

-- The shared leave ledger's company marker (TH-side payroll filters reference
-- it; JP keeps its own jellypolly.leave_records and never writes here).
ALTER TABLE public.leave_records
  ADD COLUMN IF NOT EXISTS company VARCHAR(4) NOT NULL DEFAULT 'TH'
    CHECK (company IN ('TH', 'JP'));
CREATE INDEX IF NOT EXISTS idx_leave_records_company ON public.leave_records (company);

BEGIN;

-- ============================================================
-- 0. Cleanup of the previous shared-catalogue build (safe no-op when absent)
-- ============================================================
DROP TABLE IF EXISTS
    jellypolly.payroll_items,
    jellypolly.payroll_deductions,
    jellypolly.employee_payrolls,
    jellypolly.monthly_payrolls,
    jellypolly.monthly_work_log_activities,
    jellypolly.monthly_work_log_entries,
    jellypolly.monthly_work_logs,
    jellypolly.daily_work_log_activities,
    jellypolly.daily_work_log_entries,
    jellypolly.daily_work_logs,
    jellypolly.payroll_employees,
    jellypolly.pinjam_records,
    jellypolly.mid_month_payrolls,
    jellypolly.commission_records,
    jellypolly.others_records,
    jellypolly.payroll_settings
    CASCADE;

-- v1 wrote mock data + JP rows into the SHARED catalogue — remove them.
-- (Exact ids only: JP_IP / JP_STOCK / JPTOCK are real TH pay codes.)
DELETE FROM public.leave_records WHERE employee_id LIKE 'JPT\_%';
DELETE FROM public.production_entries WHERE worker_id LIKE 'JPT\_%';
DELETE FROM public.production_worker_orders WHERE scope = 'JP_PRODUCTION';
DELETE FROM public.product_pay_codes WHERE pay_code_id IN
    ('JP_BULAN','JP_OT_OFFICE','JP_MAINTEN_JAM','JP_OT_MAINTEN','JP_MESIN_JAM','JP_OT_MESIN','JP_CTN_30ML','JP_CTN_70ML');
DELETE FROM public.employee_pay_codes WHERE employee_id LIKE 'JPT\_%' OR pay_code_id IN
    ('JP_BULAN','JP_OT_OFFICE','JP_MAINTEN_JAM','JP_OT_MAINTEN','JP_MESIN_JAM','JP_OT_MESIN','JP_CTN_30ML','JP_CTN_70ML');
DELETE FROM public.job_pay_codes WHERE job_id IN
    ('JP_OFFICE','JP_MAINTEN','JP_SALESMAN','JP_SALESMAN_IKUT','JP_ICE_POLLY','JP_JELLY_CUP','JP_PLASTIC','JP_PACKING');
DELETE FROM public.pay_rate_schedules WHERE job_id IN
    ('JP_OFFICE','JP_MAINTEN','JP_SALESMAN','JP_SALESMAN_IKUT','JP_ICE_POLLY','JP_JELLY_CUP','JP_PLASTIC','JP_PACKING')
    OR employee_id LIKE 'JPT\_%'
    OR pay_code_id IN ('JP_BULAN','JP_OT_OFFICE','JP_MAINTEN_JAM','JP_OT_MAINTEN','JP_MESIN_JAM','JP_OT_MESIN','JP_CTN_30ML','JP_CTN_70ML');
DELETE FROM public.staffs WHERE id LIKE 'JPT\_%';
DELETE FROM public.jobs WHERE id IN
    ('JP_OFFICE','JP_MAINTEN','JP_SALESMAN','JP_SALESMAN_IKUT','JP_ICE_POLLY','JP_JELLY_CUP','JP_PLASTIC','JP_PACKING');
DELETE FROM public.pay_codes WHERE id IN
    ('JP_BULAN','JP_OT_OFFICE','JP_MAINTEN_JAM','JP_OT_MAINTEN','JP_MESIN_JAM','JP_OT_MESIN','JP_CTN_30ML','JP_CTN_70ML');

-- v1 widened the TH worker-order scope; JP now has its own table
ALTER TABLE public.production_worker_orders DROP CONSTRAINT IF EXISTS production_worker_orders_scope_check;
ALTER TABLE public.production_worker_orders
    ADD CONSTRAINT production_worker_orders_scope_check
    CHECK (scope = ANY (ARRAY['BH_PACKING'::text, 'MEE_PACKING'::text]));

-- v1 linked JP leave into the shared ledger; JP now has its own leave tables
ALTER TABLE public.leave_records DROP COLUMN IF EXISTS jp_work_log_id;
-- (public.leave_records.company stays — TH-side payroll filters reference it
--  and it future-proofs the shared ledger; JP simply never writes there.)

-- ============================================================
-- 1. JP catalogue: staffs / jobs / pay codes / mappings / rate schedules
-- ============================================================
CREATE TABLE jellypolly.staffs (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    telephone_no VARCHAR(255),
    email VARCHAR(255),
    gender VARCHAR(50),
    nationality VARCHAR(255),
    birthdate DATE,
    address TEXT,
    job JSONB,
    location JSONB,
    date_joined DATE,
    ic_no VARCHAR(255),
    bank_account_number VARCHAR(255),
    epf_no VARCHAR(255),
    income_tax_no VARCHAR(255),
    socso_no VARCHAR(255),
    document VARCHAR(255),
    payment_type VARCHAR(255),
    payment_preference VARCHAR(255),
    race VARCHAR(255),
    agama VARCHAR(255),
    date_resigned DATE,
    password VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT now(),
    marital_status VARCHAR(20) DEFAULT 'Single',
    spouse_employment_status VARCHAR(20),
    number_of_children INTEGER DEFAULT 0,
    kwsp_number VARCHAR(20),
    department VARCHAR(50),
    head_staff_id VARCHAR,
    epf_age_override VARCHAR(20),
    epf_nationality_override VARCHAR(20),
    socso_age_override VARCHAR(20),
    sip_age_override VARCHAR(20),
    CONSTRAINT jp_staffs_id_no_whitespace CHECK ((id)::text !~ '[[:space:]]'::text),
    CONSTRAINT jp_staffs_marital_status_check CHECK (marital_status IN ('Single','Married')),
    CONSTRAINT jp_staffs_number_of_children_check CHECK (number_of_children >= 0),
    CONSTRAINT jp_staffs_spouse_employment_status_check CHECK (spouse_employment_status IN ('Employed','Unemployed') OR spouse_employment_status IS NULL),
    CONSTRAINT jp_staffs_epf_age_override_check CHECK (epf_age_override IS NULL OR epf_age_override IN ('under_60','over_60','none')),
    CONSTRAINT jp_staffs_epf_nationality_override_check CHECK (epf_nationality_override IS NULL OR epf_nationality_override IN ('local','foreign')),
    CONSTRAINT jp_staffs_socso_age_override_check CHECK (socso_age_override IS NULL OR socso_age_override IN ('under_60','over_60','none')),
    CONSTRAINT jp_staffs_sip_age_override_check CHECK (sip_age_override IS NULL OR sip_age_override IN ('under_60','over_60','none'))
);

CREATE TABLE jellypolly.jobs (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    section VARCHAR(100) NOT NULL
);

CREATE TABLE jellypolly.pay_codes (
    id VARCHAR(50) PRIMARY KEY,
    description TEXT,
    pay_type VARCHAR(20) NOT NULL CHECK (pay_type IN ('Base','Tambahan','Overtime')),
    rate_unit VARCHAR(20) NOT NULL CHECK (rate_unit IN ('Hour','Bill','Day','Bag','Ctn','Trip','Fixed','Percent','Tray','Kg','Karung','Bundle')),
    rate_biasa NUMERIC(10,2) DEFAULT 0 NOT NULL,
    rate_ahad NUMERIC(10,2) DEFAULT 0 NOT NULL,
    rate_umum NUMERIC(10,2) DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true,
    requires_units_input BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    report_column VARCHAR(8),
    CONSTRAINT jp_pay_codes_report_column_chk CHECK (report_column IS NULL OR report_column IN ('GAJI','OT','BONUS','CIO','CUTI'))
);

CREATE TABLE jellypolly.job_pay_codes (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(50) NOT NULL REFERENCES jellypolly.jobs(id) ON DELETE CASCADE,
    pay_code_id VARCHAR(50) NOT NULL REFERENCES jellypolly.pay_codes(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false,
    override_rate_biasa NUMERIC(10,2),
    override_rate_ahad NUMERIC(10,2),
    override_rate_umum NUMERIC(10,2),
    CONSTRAINT jp_job_pay_codes_job_id_pay_code_id_key UNIQUE (job_id, pay_code_id)
);

CREATE TABLE jellypolly.employee_pay_codes (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL REFERENCES jellypolly.staffs(id) ON DELETE CASCADE,
    pay_code_id VARCHAR(50) NOT NULL REFERENCES jellypolly.pay_codes(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false,
    override_rate_biasa NUMERIC(10,2),
    override_rate_ahad NUMERIC(10,2),
    override_rate_umum NUMERIC(10,2),
    CONSTRAINT jp_employee_pay_codes_employee_id_pay_code_id_key UNIQUE (employee_id, pay_code_id)
);

CREATE TABLE jellypolly.pay_rate_schedules (
    id SERIAL PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('pay_code','job','employee')),
    job_id VARCHAR REFERENCES jellypolly.jobs(id) ON DELETE CASCADE,
    employee_id VARCHAR REFERENCES jellypolly.staffs(id) ON DELETE CASCADE,
    pay_code_id VARCHAR NOT NULL REFERENCES jellypolly.pay_codes(id) ON DELETE CASCADE,
    effective_year INTEGER NOT NULL,
    effective_month INTEGER NOT NULL CHECK (effective_month >= 1 AND effective_month <= 12),
    rate_biasa NUMERIC(10,2),
    rate_ahad NUMERIC(10,2),
    rate_umum NUMERIC(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by VARCHAR,
    CONSTRAINT jp_pay_rate_schedules_scope_shape CHECK (
        (scope = 'employee' AND employee_id IS NOT NULL AND job_id IS NULL) OR
        (scope = 'job' AND job_id IS NOT NULL AND employee_id IS NULL) OR
        (scope = 'pay_code' AND job_id IS NULL AND employee_id IS NULL)
    ),
    CONSTRAINT jp_pay_rate_schedules_unique UNIQUE (scope, job_id, employee_id, pay_code_id, effective_year, effective_month)
);

-- Effective-rate resolver over the JP catalogue (mirror of
-- public.get_effective_pay_rate; precedence employee > job > pay_code).
CREATE OR REPLACE FUNCTION jellypolly.get_effective_pay_rate(
    p_employee_id character varying, p_job_id character varying,
    p_pay_code_id character varying, p_year integer, p_month integer)
 RETURNS TABLE(rate_biasa numeric, rate_ahad numeric, rate_umum numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH emp AS (
    SELECT s.rate_biasa, s.rate_ahad, s.rate_umum FROM jellypolly.pay_rate_schedules s
    WHERE s.scope = 'employee' AND s.employee_id = p_employee_id AND s.pay_code_id = p_pay_code_id
      AND (s.effective_year * 12 + s.effective_month) <= (p_year * 12 + p_month)
    ORDER BY s.effective_year DESC, s.effective_month DESC LIMIT 1
  ),
  job AS (
    SELECT s.rate_biasa, s.rate_ahad, s.rate_umum FROM jellypolly.pay_rate_schedules s
    WHERE s.scope = 'job' AND s.job_id = p_job_id AND s.pay_code_id = p_pay_code_id
      AND (s.effective_year * 12 + s.effective_month) <= (p_year * 12 + p_month)
    ORDER BY s.effective_year DESC, s.effective_month DESC LIMIT 1
  ),
  pc AS (
    SELECT s.rate_biasa, s.rate_ahad, s.rate_umum FROM jellypolly.pay_rate_schedules s
    WHERE s.scope = 'pay_code' AND s.pay_code_id = p_pay_code_id
      AND (s.effective_year * 12 + s.effective_month) <= (p_year * 12 + p_month)
    ORDER BY s.effective_year DESC, s.effective_month DESC LIMIT 1
  )
  SELECT
    COALESCE((SELECT e.rate_biasa FROM emp e), epc.override_rate_biasa,
             (SELECT j.rate_biasa FROM job j), jpc.override_rate_biasa,
             (SELECT p.rate_biasa FROM pc p), pcd.rate_biasa),
    COALESCE((SELECT e.rate_ahad FROM emp e), epc.override_rate_ahad,
             (SELECT j.rate_ahad FROM job j), jpc.override_rate_ahad,
             (SELECT p.rate_ahad FROM pc p), pcd.rate_ahad),
    COALESCE((SELECT e.rate_umum FROM emp e), epc.override_rate_umum,
             (SELECT j.rate_umum FROM job j), jpc.override_rate_umum,
             (SELECT p.rate_umum FROM pc p), pcd.rate_umum)
  FROM jellypolly.pay_codes pcd
  LEFT JOIN jellypolly.employee_pay_codes epc ON epc.employee_id = p_employee_id AND epc.pay_code_id = p_pay_code_id
  LEFT JOIN jellypolly.job_pay_codes jpc ON jpc.job_id = p_job_id AND jpc.pay_code_id = p_pay_code_id
  WHERE pcd.id = p_pay_code_id;
$function$;

-- Product -> JP pay code mapping (products stay in the shared public.products)
CREATE TABLE jellypolly.product_pay_codes (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    pay_code_id VARCHAR(50) NOT NULL REFERENCES jellypolly.pay_codes(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jp_product_pay_codes_product_id_pay_code_id_key UNIQUE (product_id, pay_code_id)
);

-- ============================================================
-- 2. JP payroll membership
-- ============================================================
-- Derived from jellypolly.staffs.job (TH-style): holding a JP_* job id makes
-- the staff a member of the matching payroll page/section. No table needed.
-- (An earlier version of this script created jellypolly.payroll_employees
-- here; databases that ran it should apply 012_jp_staffs_job_membership.sql,
-- which folds the assignments into staffs.job and drops the table.)

-- ============================================================
-- 3. Payroll core
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
    employee_id VARCHAR(255) REFERENCES jellypolly.staffs(id),
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
    pay_code_id VARCHAR(50) REFERENCES jellypolly.pay_codes(id),
    description TEXT,
    rate NUMERIC(10,2),
    rate_unit VARCHAR(20),
    quantity NUMERIC(10,2),
    foc_units NUMERIC(10,2) DEFAULT 0,
    amount NUMERIC(10,2),
    is_manual BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    job_type VARCHAR(50),
    source_employee_id VARCHAR(255),
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
-- 4. Monthly work logs (Office / Maintenance) — TH shape incl. Ahad/Umum
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
    employee_id TEXT NOT NULL REFERENCES jellypolly.staffs(id),
    job_id TEXT NOT NULL REFERENCES jellypolly.jobs(id),
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
    pay_code_id TEXT NOT NULL REFERENCES jellypolly.pay_codes(id),
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
-- 5. Daily work logs (Salesman, Ice-Polly, Jelly Cup, Plastic) — TH shape
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
    employee_id VARCHAR(255) NOT NULL REFERENCES jellypolly.staffs(id) ON DELETE RESTRICT,
    total_hours NUMERIC(4,2) DEFAULT 0 NOT NULL,
    job_id VARCHAR(50) NOT NULL REFERENCES jellypolly.jobs(id) ON DELETE RESTRICT,
    is_on_leave BOOLEAN DEFAULT false,
    leave_type VARCHAR(20) CHECK (leave_type IN ('cuti_umum','cuti_sakit','cuti_tahunan') OR leave_type IS NULL),
    following_salesman_id VARCHAR(255) REFERENCES jellypolly.staffs(id),
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
    pay_code_id VARCHAR(50) NOT NULL REFERENCES jellypolly.pay_codes(id) ON DELETE RESTRICT,
    hours_applied NUMERIC(4,2),
    units_produced NUMERIC(10,2),
    rate_used NUMERIC(10,2) NOT NULL,
    calculated_amount NUMERIC(10,2) NOT NULL,
    is_manually_added BOOLEAN DEFAULT false,
    foc_units NUMERIC(10,2) DEFAULT 0
);
CREATE INDEX idx_jp_daily_work_log_activities_entry ON jellypolly.daily_work_log_activities (log_entry_id);

-- ============================================================
-- 6. Leave (JP-owned ledger + entitlements; 1:1 with TH's leave system)
-- ============================================================
CREATE TABLE jellypolly.leave_records (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(255) REFERENCES jellypolly.staffs(id),
    leave_date DATE NOT NULL,
    leave_type VARCHAR(20) NOT NULL,
    work_log_id INTEGER REFERENCES jellypolly.daily_work_logs(id) ON DELETE CASCADE,
    days_taken NUMERIC(3,1) DEFAULT 1.0,
    amount_paid NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'approved',
    notes TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_jp_leave_records_employee_date ON jellypolly.leave_records (employee_id, leave_date);
CREATE INDEX idx_jp_leave_records_date ON jellypolly.leave_records (leave_date);
CREATE INDEX idx_jp_leave_records_work_log ON jellypolly.leave_records (work_log_id) WHERE work_log_id IS NOT NULL;

CREATE TABLE jellypolly.employee_leave_balances (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(255) REFERENCES jellypolly.staffs(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    cuti_umum_total INTEGER DEFAULT 14,
    cuti_tahunan_total INTEGER NOT NULL,
    cuti_sakit_total INTEGER NOT NULL,
    cuti_rawatan_total INTEGER DEFAULT 60 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jp_employee_leave_balances_employee_id_year_key UNIQUE (employee_id, year)
);

-- ============================================================
-- 7. Add-ons: pinjam, mid-month, bonus/advance, others (Kerja Luar OT)
-- ============================================================
CREATE TABLE jellypolly.pinjam_records (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(255) NOT NULL REFERENCES jellypolly.staffs(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    description VARCHAR(255) NOT NULL,
    pinjam_type VARCHAR(20) NOT NULL CHECK (pinjam_type IN ('mid_month','monthly')),
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jp_pinjam_records_unique_key UNIQUE (employee_id, year, month, description, pinjam_type)
);
CREATE INDEX idx_jp_pinjam_records_employee_date ON jellypolly.pinjam_records (employee_id, year, month);
CREATE INDEX idx_jp_pinjam_records_date ON jellypolly.pinjam_records (year, month);

CREATE TABLE jellypolly.mid_month_payrolls (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(255) NOT NULL REFERENCES jellypolly.staffs(id),
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
    employee_id VARCHAR(255) REFERENCES jellypolly.staffs(id),
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
    employee_id VARCHAR(255) NOT NULL REFERENCES jellypolly.staffs(id),
    record_date DATE NOT NULL,
    pay_code_id VARCHAR REFERENCES jellypolly.pay_codes(id),
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
-- 8. JP payroll settings (e-caruman registration codes etc.)
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
-- 9. JP production (products shared; workers are JP staff)
-- ============================================================
CREATE TABLE jellypolly.production_entries (
    id SERIAL PRIMARY KEY,
    entry_date DATE NOT NULL,
    product_id VARCHAR(50) NOT NULL REFERENCES public.products(id),
    worker_id VARCHAR(255) REFERENCES jellypolly.staffs(id),
    bags_packed NUMERIC(10,2) DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    CONSTRAINT jp_production_entries_date_product_worker_key UNIQUE (entry_date, product_id, worker_id)
);
CREATE INDEX idx_jp_production_entries_date ON jellypolly.production_entries (entry_date);

CREATE TABLE jellypolly.production_worker_orders (
    scope TEXT NOT NULL CHECK (scope IN ('JP_PRODUCTION')),
    worker_id VARCHAR(255) NOT NULL REFERENCES jellypolly.staffs(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50),
    PRIMARY KEY (scope, worker_id)
);

COMMIT;

BEGIN;
-- Structural seeds (jobs, pay codes, job mappings) - rates are placeholders

-- ============================================================
-- 1. JP jobs (jellypolly.jobs — JP's own job catalogue)
-- ============================================================
INSERT INTO jellypolly.jobs (id, name, section) VALUES
    ('JP_OFFICE',        'Office',                'OFFICE'),
    ('JP_MAINTEN',       'Maintenance',           'MAINTENANCE'),
    ('JP_SALESMAN',      'Salesman',              'SALESMAN'),
    ('JP_SALESMAN_IKUT', 'Salesman Ikut',         'SALESMAN'),
    ('JP_ICE_POLLY',     'Ice-Polly Machine',     'ICE_POLLY'),
    ('JP_JELLY_CUP',     'Jelly Cup Machine',     'JELLY_CUP'),
    ('JP_PLASTIC',       'Plastic Machine',       'PLASTIC'),
    ('JP_PACKING',       'Production Packing',    'PRODUCTION')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. JP pay codes (jellypolly.pay_codes; placeholder rates).
--    Salesman codes are named after the JP PRODUCT ids — the salesman entry
--    maps each sold product to the pay code with the same id (TH convention).
-- ============================================================
INSERT INTO jellypolly.pay_codes
    (id, description, pay_type, rate_unit, rate_biasa, rate_ahad, rate_umum, is_active, requires_units_input)
VALUES
    ('JP_BULAN',       'GAJI POKOK (BASIC SALARY)',              'Base',     'Fixed', 0.00,  0.00,  0.00,  true, false),
    ('JP_OT_OFFICE',   'OT X 1.5 (OFFICE)',                      'Overtime', 'Hour',  0.00,  0.00,  0.00,  true, false),
    ('JP_MAINTEN_JAM', 'KERJA PENYELENGGARAAN (MAINTENANCE)',    'Base',     'Hour',  10.00, 13.00, 20.00, true, false),
    ('JP_OT_MAINTEN',  'OT X 1.5 (MAINTENANCE)',                 'Overtime', 'Hour',  7.50,  7.50,  7.50,  true, false),
    ('JP_MESIN_JAM',   'KERJA MESIN',                            'Base',     'Hour',  8.00,  10.50, 16.00, true, false),
    ('JP_OT_MESIN',    'OT X 1.5 (MESIN)',                       'Overtime', 'Hour',  6.00,  6.00,  6.00,  true, false),
    ('JP_CTN_30ML',    'PLASTIK 30ML (1 CTN)',                   'Base',     'Ctn',   0.50,  0.50,  0.50,  true, true),
    ('JP_CTN_70ML',    'PLASTIK 70ML (1 CTN)',                   'Base',     'Ctn',   0.70,  0.70,  0.70,  true, true),
    ('JP_SALESMAN_OT', 'LEBIH MASA BEKERJA (SALESMAN)',          'Overtime', 'Hour',  5.00,  0.00,  0.00,  true, false),
    -- product-named salesman commission codes (1 CTN sold)
    ('S-25ML',         'SALES 1 CTN - 25ML ICE-POLLY',           'Base',     'Ctn',   0.30,  0.30,  0.30,  true, true),
    ('S-60ML',         'SALES 1 CTN - 60ML ICE-POLLY',           'Base',     'Ctn',   0.30,  0.30,  0.30,  true, true),
    ('MEQ-25ML',       'SALES 1 CTN - 25ML ICE-POLLY (ME-Q)',    'Base',     'Ctn',   0.30,  0.30,  0.30,  true, true),
    ('MEQ-60ML',       'SALES 1 CTN - 60ML ICE-POLLY (ME-Q)',    'Base',     'Ctn',   0.30,  0.30,  0.30,  true, true),
    ('AQ-60ML',        'SALES 1 CTN - 60ML ICE-POLLY (AQUILA)',  'Base',     'Ctn',   0.30,  0.30,  0.30,  true, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. Job -> pay code mappings. The salesman product codes are mapped to BOTH
--    salesman jobs; the ikut job carries a lower override rate.
-- ============================================================
INSERT INTO jellypolly.job_pay_codes (job_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum)
VALUES
    ('JP_OFFICE',        'JP_BULAN',       true,  NULL, NULL, NULL),
    ('JP_OFFICE',        'JP_OT_OFFICE',   false, NULL, NULL, NULL),
    ('JP_MAINTEN',       'JP_MAINTEN_JAM', true,  NULL, NULL, NULL),
    ('JP_MAINTEN',       'JP_OT_MAINTEN',  false, NULL, NULL, NULL),
    ('JP_ICE_POLLY',     'JP_MESIN_JAM',   true,  NULL, NULL, NULL),
    ('JP_ICE_POLLY',     'JP_OT_MESIN',    false, NULL, NULL, NULL),
    ('JP_JELLY_CUP',     'JP_MESIN_JAM',   true,  NULL, NULL, NULL),
    ('JP_JELLY_CUP',     'JP_OT_MESIN',    false, NULL, NULL, NULL),
    ('JP_PLASTIC',       'JP_CTN_30ML',    true,  NULL, NULL, NULL),
    ('JP_PLASTIC',       'JP_CTN_70ML',    true,  NULL, NULL, NULL),
    ('JP_PACKING',       'JP_CTN_30ML',    false, NULL, NULL, NULL),
    ('JP_PACKING',       'JP_CTN_70ML',    false, NULL, NULL, NULL),
    ('JP_SALESMAN',      'S-25ML',         true,  NULL, NULL, NULL),
    ('JP_SALESMAN',      'S-60ML',         true,  NULL, NULL, NULL),
    ('JP_SALESMAN',      'MEQ-25ML',       true,  NULL, NULL, NULL),
    ('JP_SALESMAN',      'MEQ-60ML',       true,  NULL, NULL, NULL),
    ('JP_SALESMAN',      'AQ-60ML',        true,  NULL, NULL, NULL),
    ('JP_SALESMAN',      'JP_SALESMAN_OT', false, NULL, NULL, NULL),
    ('JP_SALESMAN_IKUT', 'S-25ML',         false, 0.15, 0.15, 0.15),
    ('JP_SALESMAN_IKUT', 'S-60ML',         false, 0.15, 0.15, 0.15),
    ('JP_SALESMAN_IKUT', 'MEQ-25ML',       false, 0.15, 0.15, 0.15),
    ('JP_SALESMAN_IKUT', 'MEQ-60ML',       false, 0.15, 0.15, 0.15),
    ('JP_SALESMAN_IKUT', 'AQ-60ML',        false, 0.15, 0.15, 0.15)
ON CONFLICT (job_id, pay_code_id) DO NOTHING;

COMMIT;

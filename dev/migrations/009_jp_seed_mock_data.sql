-- 009_jp_seed_mock_data.sql (v2 — OWN CATALOGUE design)
-- Seeds the JP catalogue (jobs + pay codes + mappings) and dev-only MOCK staff.
-- Mock staff ids are prefixed JPT_ and names carry "(JP TEST)" for easy cleanup:
--   DELETE FROM jellypolly.staffs WHERE id LIKE 'JPT_%';
-- Rates are placeholders; users edit them in the JP Catalogue pages.

BEGIN;

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

-- ============================================================
-- 4. MOCK staff (jellypolly.staffs; DEV ONLY — delete before real data entry).
--    JPT_ALI / JPT_ALI_P are the HEAD / sub-ID pair. JPT_SITI shares her NAME
--    with a TH staff row only if one exists — the cross-company card matches
--    by name across the two catalogues.
-- ============================================================
INSERT INTO jellypolly.staffs
    (id, name, gender, nationality, birthdate, date_joined, ic_no, job, location,
     payment_type, payment_preference, marital_status, number_of_children,
     bank_account_number, head_staff_id)
VALUES
    ('JPT_SITI',  'SITI AMINAH (JP TEST)',   'female', 'Malaysian', '1992-04-15', '2026-01-01', '920415-12-5001',
     '["JP_OFFICE"]'::jsonb, '[]'::jsonb, 'Monthly', 'Bank', 'Single', 0, '3141592653', NULL),
    ('JPT_RAZAK', 'RAZAK BIN OSMAN (JP TEST)', 'male', 'Malaysian', '1988-09-02', '2026-01-01', '880902-12-5003',
     '["JP_MAINTEN"]'::jsonb, '[]'::jsonb, 'Monthly', 'Cash', 'Single', 0, NULL, NULL),
    ('JPT_KUMAR', 'KUMAR A/L RAJU (JP TEST)', 'male', 'Malaysian', '1990-01-20', '2026-01-01', '900120-12-5005',
     '["JP_SALESMAN"]'::jsonb, '[]'::jsonb, 'Monthly', 'Bank', 'Single', 0, '2718281828', NULL),
    ('JPT_ARIF',  'ARIF BIN HAMID (JP TEST)', 'male', 'Malaysian', '1995-06-11', '2026-01-01', '950611-12-5007',
     '["JP_SALESMAN_IKUT"]'::jsonb, '[]'::jsonb, 'Monthly', 'Cash', 'Single', 0, NULL, NULL),
    ('JPT_DAUD',  'DAUD BIN YUSOF (JP TEST)', 'male', 'Malaysian', '1993-11-30', '2026-01-01', '931130-12-5009',
     '["JP_ICE_POLLY"]'::jsonb, '[]'::jsonb, 'Monthly', 'Cash', 'Single', 0, NULL, NULL),
    ('JPT_MEI',   'CHONG MEI LING (JP TEST)', 'female', 'Malaysian', '1996-02-08', '2026-01-01', '960208-12-5011',
     '["JP_JELLY_CUP"]'::jsonb, '[]'::jsonb, 'Monthly', 'Cash', 'Single', 0, NULL, NULL),
    ('JPT_ALI',   'ALI BIN ABU (JP TEST)',    'male', 'Malaysian', '1991-07-25', '2026-01-01', '910725-12-5013',
     '["JP_PLASTIC"]'::jsonb, '[]'::jsonb, 'Monthly', 'Cash', 'Single', 0, NULL, NULL),
    ('JPT_ALI_P', 'ALI BIN ABU (JP TEST)',    'male', 'Malaysian', '1991-07-25', '2026-02-01', '910725-12-5013',
     '["JP_PLASTIC"]'::jsonb, '[]'::jsonb, 'Monthly', 'Cash', 'Single', 0, NULL, 'JPT_ALI'),
    ('JPT_LENG',  'LENG SWEE HOCK (JP TEST)', 'male', 'Malaysian', '1994-03-17', '2026-01-01', '940317-12-5015',
     '["JP_PACKING"]'::jsonb, '[]'::jsonb, 'Monthly', 'Cash', 'Single', 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Employee pay-code override: SITI's office monthly salary (mock RM1800)
INSERT INTO jellypolly.employee_pay_codes (employee_id, pay_code_id, is_default, override_rate_biasa)
VALUES ('JPT_SITI', 'JP_BULAN', true, 1800.00)
ON CONFLICT (employee_id, pay_code_id) DO NOTHING;

-- Assignments (jellypolly.payroll_employees)
INSERT INTO jellypolly.payroll_employees (employee_id, job_type, notes) VALUES
    ('JPT_SITI',  'OFFICE',        'Mock seed'),
    ('JPT_RAZAK', 'MAINTENANCE',   'Mock seed'),
    ('JPT_KUMAR', 'SALESMAN',      'Mock seed'),
    ('JPT_ARIF',  'SALESMAN_IKUT', 'Mock seed'),
    ('JPT_DAUD',  'ICE_POLLY',     'Mock seed'),
    ('JPT_MEI',   'JELLY_CUP',     'Mock seed'),
    ('JPT_ALI',   'PLASTIC',       'Mock seed (HEAD)'),
    ('JPT_ALI_P', 'PLASTIC',       'Mock seed (sub-ID of JPT_ALI)'),
    ('JPT_LENG',  'PRODUCTION',    'Mock seed')
ON CONFLICT (employee_id, job_type) DO NOTHING;

-- Leave entitlements for the mock staff (2026)
INSERT INTO jellypolly.employee_leave_balances
    (employee_id, year, cuti_umum_total, cuti_tahunan_total, cuti_sakit_total, cuti_rawatan_total)
SELECT id, 2026, 14, 8, 14, 60 FROM jellypolly.staffs WHERE id LIKE 'JPT\_%'
ON CONFLICT (employee_id, year) DO NOTHING;

-- Mock production mapping: packing pay for the S-25ML product (30ML ctn code)
INSERT INTO jellypolly.product_pay_codes (product_id, pay_code_id)
SELECT 'S-25ML', 'JP_CTN_30ML'
WHERE EXISTS (SELECT 1 FROM public.products WHERE id = 'S-25ML')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

COMMIT;

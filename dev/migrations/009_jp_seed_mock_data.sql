-- 009_jp_seed_mock_data.sql
-- Jelly Polly Phase 0 seeds: JP jobs + pay codes in the shared catalogue,
-- plus MOCK/TEST staff and assignments for testing the JP system.
-- Mock staff ids are prefixed JPT_ and names carry "(JP TEST)" for easy cleanup:
--   DELETE FROM public.staffs WHERE id LIKE 'JPT_%';
-- Real staff/pay codes will be entered by users later; rates here are placeholders.

BEGIN;

-- ============================================================
-- 1. JP jobs (shared public.jobs; JP_ prefix keeps TH lists clean)
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
-- 2. JP pay codes (shared public.pay_codes; placeholder rates)
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
-- 3. Job -> pay code mappings (job_pay_codes)
--    Salesman/ikut reuse the EXISTING ice-polly Ctn codes (same ids as JP products).
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

-- ============================================================
-- 4. Mock staff (public.staffs). All Malaysian, under 60, single, no children
--    so EPF/SOCSO/SIP apply predictably. JPT_SITI also holds TH OFFICE to
--    exercise the cross-company take-home card. JPT_ALI / JPT_ALI_P are the
--    HEAD / sub-ID pair (same name, head_staff_id set on the sub).
-- ============================================================
INSERT INTO public.staffs
    (id, name, gender, nationality, birthdate, date_joined, ic_no, job, location,
     payment_type, payment_preference, marital_status, number_of_children,
     bank_account_number, head_staff_id)
VALUES
    ('JPT_SITI',  'SITI AMINAH (JP TEST)',   'female', 'Malaysian', '1992-04-15', '2026-01-01', '920415-12-5001',
     '["JP_OFFICE","OFFICE"]'::jsonb, '[]'::jsonb, 'Monthly', 'Bank', 'Single', 0, '3141592653', NULL),
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

-- ============================================================
-- 5. Employee pay-code override: SITI's office monthly salary (mock RM1800)
-- ============================================================
INSERT INTO public.employee_pay_codes (employee_id, pay_code_id, is_default, override_rate_biasa)
VALUES ('JPT_SITI', 'JP_BULAN', true, 1800.00)
ON CONFLICT (employee_id, pay_code_id) DO NOTHING;

-- ============================================================
-- 6. JP payroll assignments (jellypolly.payroll_employees)
-- ============================================================
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

COMMIT;

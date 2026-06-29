-- 005_gt_habuk_paycodes.sql
-- Green Target Daily Lori Habuk pay codes (Phase 0).
-- Adds/repairs the habuk trip pay codes from the legacy DAILY LORI HABUK ENTRY
-- screen and maps them to the DRIVER ("Driver Lori Habuk") and DRIVER_IKUT
-- (follower) jobs. Rates follow the legacy screen (authoritative). Trip codes
-- use rate_unit='Trip' (quantity = number of trips, amount = rate x trips).
--
-- Scope note: these codes are referenced only by DRIVER/DRIVER_IKUT (no TH
-- staff, no employee_pay_codes), so re-rating is safe. The rentals
-- PLACEMENT/PICKUP rules reference some of these codes (e.g. TRIP5/TRIP10);
-- re-rating intentionally updates that derived pay too.
--
-- Idempotent: safe to run more than once.

BEGIN;

-- ------------------------------------------------------------------
-- 1. Repair existing DRIVER trip codes (re-rate + switch to Trip unit)
-- ------------------------------------------------------------------
UPDATE pay_codes SET rate_biasa = 5.00,  rate_unit = 'Trip', requires_units_input = true, updated_at = now() WHERE id = 'TRIP5';
UPDATE pay_codes SET rate_biasa = 6.00,  rate_unit = 'Trip', requires_units_input = true, updated_at = now() WHERE id = 'TRIP6';
UPDATE pay_codes SET                     rate_unit = 'Trip', requires_units_input = true, updated_at = now() WHERE id = 'TRIP7';
UPDATE pay_codes SET                     rate_unit = 'Trip', requires_units_input = true, updated_at = now() WHERE id = 'TRIP8';
UPDATE pay_codes SET                     rate_unit = 'Trip', requires_units_input = true, updated_at = now() WHERE id = 'TRIP9';
UPDATE pay_codes SET                     rate_unit = 'Trip', requires_units_input = true, updated_at = now() WHERE id = 'TRIP10';
UPDATE pay_codes SET                     rate_unit = 'Trip', requires_units_input = true, updated_at = now() WHERE id = 'TRIP_HS';
-- CUCUK HABUK (PEMANDU) -> driver per-trip, RM5
UPDATE pay_codes SET rate_biasa = 5.00,  rate_unit = 'Trip', requires_units_input = true, updated_at = now() WHERE id = 'TRIP_CUCUK';
-- > 6 TRIP SISA KAYU & HABUK SEHARI: daily bonus, keep Day unit
UPDATE pay_codes SET rate_biasa = 5.00,  rate_unit = 'Day',  requires_units_input = true, updated_at = now() WHERE id = 'TRIP_LB6';

-- ------------------------------------------------------------------
-- 2. New DRIVER trip codes (TRIP11..TRIP35) + special codes
-- ------------------------------------------------------------------
INSERT INTO pay_codes (id, description, pay_type, rate_unit, rate_biasa, rate_ahad, rate_umum, is_active, requires_units_input) VALUES
  ('TRIP11', 'TRIP RM 11', 'Tambahan', 'Trip', 11.00, 0, 0, true, true),
  ('TRIP12', 'TRIP RM 12', 'Tambahan', 'Trip', 12.00, 0, 0, true, true),
  ('TRIP13', 'TRIP RM 13', 'Tambahan', 'Trip', 13.00, 0, 0, true, true),
  ('TRIP14', 'TRIP RM 14', 'Tambahan', 'Trip', 14.00, 0, 0, true, true),
  ('TRIP15', 'TRIP RM 15', 'Tambahan', 'Trip', 15.00, 0, 0, true, true),
  ('TRIP16', 'TRIP RM 16', 'Tambahan', 'Trip', 16.00, 0, 0, true, true),
  ('TRIP17', 'TRIP RM 17', 'Tambahan', 'Trip', 17.00, 0, 0, true, true),
  ('TRIP18', 'TRIP RM 18', 'Tambahan', 'Trip', 18.00, 0, 0, true, true),
  ('TRIP19', 'TRIP RM 19', 'Tambahan', 'Trip', 19.00, 0, 0, true, true),
  ('TRIP20', 'TRIP RM 20', 'Tambahan', 'Trip', 20.00, 0, 0, true, true),
  ('TRIP25', 'TRIP RM 25', 'Tambahan', 'Trip', 25.00, 0, 0, true, true),
  ('TRIP30', 'TRIP RM 30', 'Tambahan', 'Trip', 30.00, 0, 0, true, true),
  ('TRIP35', 'TRIP RM 35', 'Tambahan', 'Trip', 35.00, 0, 0, true, true),
  -- TARIK TONG (BERBAYAR): per-tong paid pull, RM5
  ('COMM_TARIK', 'TARIK TONG (BERBAYAR)', 'Tambahan', 'Trip', 5.00, 0, 0, true, true),
  -- COMM TAMBAHAN: IN-CHARGE ALL DAY: fixed RM20 (qty per day)
  ('COMM_TAMBAHAN', 'COMM TAMBAHAN: IN-CHARGE ALL DAY', 'Tambahan', 'Fixed', 20.00, 0, 0, true, true),
  -- TRIP: MASA / CUKUP 6 TRIPS KE ATAS: daily on-time bonus, RM17
  ('TRIP_MASA', 'TRIP: MASA / CUKUP 6 TRIPS KE ATAS', 'Tambahan', 'Day', 17.00, 0, 0, true, true),
  -- TRIP TAMBAHAN BIASA LB6: daily, RM5
  ('TRIP_BIASA_LB6', 'TRIP TAMBAHAN BIASA LB6', 'Tambahan', 'Day', 5.00, 0, 0, true, true),
  -- TAMBAHAN TRIP RM 5: per-trip, RM5
  ('TBH5', 'TAMBAHAN TRIP RM 5', 'Tambahan', 'Trip', 5.00, 0, 0, true, true),
  -- Follower (IKUT LORI) reduced-rate variants
  ('TRIP5_IKUT', 'TRIP RM 5 (IKUT LORI)', 'Tambahan', 'Trip', 1.50, 0, 0, true, true),
  ('TRIP6_IKUT', '> LEBIH TRIP RM 6 (IKUT LORI)', 'Tambahan', 'Trip', 2.50, 0, 0, true, true),
  ('TRIP_LB6_IL', '> 6 TRIP SISA KAYU & HABUK (IKUT)', 'Tambahan', 'Day', 3.00, 0, 0, true, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------
-- 3. Map DRIVER job to all driver-side habuk codes (idempotent)
-- ------------------------------------------------------------------
INSERT INTO job_pay_codes (job_id, pay_code_id, is_default)
SELECT 'DRIVER', code, false
FROM (VALUES
  ('TRIP6'), ('TRIP11'), ('TRIP12'), ('TRIP13'), ('TRIP14'), ('TRIP15'),
  ('TRIP16'), ('TRIP17'), ('TRIP18'), ('TRIP19'), ('TRIP20'), ('TRIP25'),
  ('TRIP30'), ('TRIP35'), ('TRIP_CUCUK'), ('COMM_TARIK'), ('COMM_TAMBAHAN'),
  ('TRIP_MASA'), ('TRIP_BIASA_LB6'), ('TBH5')
) AS v(code)
WHERE NOT EXISTS (
  SELECT 1 FROM job_pay_codes jpc
  WHERE jpc.job_id = 'DRIVER' AND jpc.pay_code_id = v.code
);

-- ------------------------------------------------------------------
-- 4. Follower job DRIVER_IKUT: drop driver-rate codes, add _IKUT codes
-- ------------------------------------------------------------------
DELETE FROM job_pay_codes
WHERE job_id = 'DRIVER_IKUT'
  AND pay_code_id IN ('TRIP5', 'TRIP6', 'TRIP_CUCUK', 'TRIP_LB6');

INSERT INTO job_pay_codes (job_id, pay_code_id, is_default)
SELECT 'DRIVER_IKUT', code, false
FROM (VALUES ('TRIP5_IKUT'), ('TRIP6_IKUT'), ('TRIP_LB6_IL')) AS v(code)
WHERE NOT EXISTS (
  SELECT 1 FROM job_pay_codes jpc
  WHERE jpc.job_id = 'DRIVER_IKUT' AND jpc.pay_code_id = v.code
);

COMMIT;

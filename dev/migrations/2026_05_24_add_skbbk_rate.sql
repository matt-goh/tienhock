-- 2026-05-24: Add SKBBK (Skim Bencana Bukan Kerja) employee rate to socso_rates.
-- PERKESO gazetted a new sub-scheme that adds an employee-side contribution on top
-- of the existing KEILATAN rate. SKBBK is the same value for under-60 and 60+ in
-- every wage row, so a single column is sufficient.
--
-- Effect:
--   under 60: employee_total = employee_rate (KEILATAN) + employee_rate_skbbk
--   60+:      employee_total = employee_rate_skbbk        (was 0 before)
--   employer rates unchanged.

BEGIN;

ALTER TABLE socso_rates
  ADD COLUMN IF NOT EXISTS employee_rate_skbbk numeric(10,2);

UPDATE socso_rates SET employee_rate_skbbk = 0.20  WHERE wage_from = 0     AND wage_to = 30;
UPDATE socso_rates SET employee_rate_skbbk = 0.30  WHERE wage_from = 30    AND wage_to = 50;
UPDATE socso_rates SET employee_rate_skbbk = 0.50  WHERE wage_from = 50    AND wage_to = 70;
UPDATE socso_rates SET employee_rate_skbbk = 0.65  WHERE wage_from = 70    AND wage_to = 100;
UPDATE socso_rates SET employee_rate_skbbk = 0.90  WHERE wage_from = 100   AND wage_to = 140;
UPDATE socso_rates SET employee_rate_skbbk = 1.25  WHERE wage_from = 140   AND wage_to = 200;
UPDATE socso_rates SET employee_rate_skbbk = 1.85  WHERE wage_from = 200   AND wage_to = 300;
UPDATE socso_rates SET employee_rate_skbbk = 2.65  WHERE wage_from = 300   AND wage_to = 400;
UPDATE socso_rates SET employee_rate_skbbk = 3.35  WHERE wage_from = 400   AND wage_to = 500;
UPDATE socso_rates SET employee_rate_skbbk = 4.15  WHERE wage_from = 500   AND wage_to = 600;
UPDATE socso_rates SET employee_rate_skbbk = 4.85  WHERE wage_from = 600   AND wage_to = 700;
UPDATE socso_rates SET employee_rate_skbbk = 5.65  WHERE wage_from = 700   AND wage_to = 800;
UPDATE socso_rates SET employee_rate_skbbk = 6.35  WHERE wage_from = 800   AND wage_to = 900;
UPDATE socso_rates SET employee_rate_skbbk = 7.15  WHERE wage_from = 900   AND wage_to = 1000;
UPDATE socso_rates SET employee_rate_skbbk = 7.85  WHERE wage_from = 1000  AND wage_to = 1100;
UPDATE socso_rates SET employee_rate_skbbk = 8.65  WHERE wage_from = 1100  AND wage_to = 1200;
UPDATE socso_rates SET employee_rate_skbbk = 9.35  WHERE wage_from = 1200  AND wage_to = 1300;
UPDATE socso_rates SET employee_rate_skbbk = 10.15 WHERE wage_from = 1300  AND wage_to = 1400;
UPDATE socso_rates SET employee_rate_skbbk = 10.85 WHERE wage_from = 1400  AND wage_to = 1500;
UPDATE socso_rates SET employee_rate_skbbk = 11.65 WHERE wage_from = 1500  AND wage_to = 1600;
UPDATE socso_rates SET employee_rate_skbbk = 12.35 WHERE wage_from = 1600  AND wage_to = 1700;
UPDATE socso_rates SET employee_rate_skbbk = 13.15 WHERE wage_from = 1700  AND wage_to = 1800;
UPDATE socso_rates SET employee_rate_skbbk = 13.85 WHERE wage_from = 1800  AND wage_to = 1900;
UPDATE socso_rates SET employee_rate_skbbk = 14.65 WHERE wage_from = 1900  AND wage_to = 2000;
UPDATE socso_rates SET employee_rate_skbbk = 15.35 WHERE wage_from = 2000  AND wage_to = 2100;
UPDATE socso_rates SET employee_rate_skbbk = 16.15 WHERE wage_from = 2100  AND wage_to = 2200;
UPDATE socso_rates SET employee_rate_skbbk = 16.85 WHERE wage_from = 2200  AND wage_to = 2300;
UPDATE socso_rates SET employee_rate_skbbk = 17.65 WHERE wage_from = 2300  AND wage_to = 2400;
UPDATE socso_rates SET employee_rate_skbbk = 18.35 WHERE wage_from = 2400  AND wage_to = 2500;
UPDATE socso_rates SET employee_rate_skbbk = 19.15 WHERE wage_from = 2500  AND wage_to = 2600;
UPDATE socso_rates SET employee_rate_skbbk = 19.85 WHERE wage_from = 2600  AND wage_to = 2700;
UPDATE socso_rates SET employee_rate_skbbk = 20.65 WHERE wage_from = 2700  AND wage_to = 2800;
UPDATE socso_rates SET employee_rate_skbbk = 21.35 WHERE wage_from = 2800  AND wage_to = 2900;
UPDATE socso_rates SET employee_rate_skbbk = 22.15 WHERE wage_from = 2900  AND wage_to = 3000;
UPDATE socso_rates SET employee_rate_skbbk = 22.85 WHERE wage_from = 3000  AND wage_to = 3100;
UPDATE socso_rates SET employee_rate_skbbk = 23.65 WHERE wage_from = 3100  AND wage_to = 3200;
UPDATE socso_rates SET employee_rate_skbbk = 24.35 WHERE wage_from = 3200  AND wage_to = 3300;
UPDATE socso_rates SET employee_rate_skbbk = 25.15 WHERE wage_from = 3300  AND wage_to = 3400;
UPDATE socso_rates SET employee_rate_skbbk = 25.85 WHERE wage_from = 3400  AND wage_to = 3500;
UPDATE socso_rates SET employee_rate_skbbk = 26.65 WHERE wage_from = 3500  AND wage_to = 3600;
UPDATE socso_rates SET employee_rate_skbbk = 27.35 WHERE wage_from = 3600  AND wage_to = 3700;
UPDATE socso_rates SET employee_rate_skbbk = 28.15 WHERE wage_from = 3700  AND wage_to = 3800;
UPDATE socso_rates SET employee_rate_skbbk = 28.85 WHERE wage_from = 3800  AND wage_to = 3900;
UPDATE socso_rates SET employee_rate_skbbk = 29.65 WHERE wage_from = 3900  AND wage_to = 4000;
UPDATE socso_rates SET employee_rate_skbbk = 30.35 WHERE wage_from = 4000  AND wage_to = 4100;
UPDATE socso_rates SET employee_rate_skbbk = 31.15 WHERE wage_from = 4100  AND wage_to = 4200;
UPDATE socso_rates SET employee_rate_skbbk = 31.85 WHERE wage_from = 4200  AND wage_to = 4300;
UPDATE socso_rates SET employee_rate_skbbk = 32.65 WHERE wage_from = 4300  AND wage_to = 4400;
UPDATE socso_rates SET employee_rate_skbbk = 33.35 WHERE wage_from = 4400  AND wage_to = 4500;
UPDATE socso_rates SET employee_rate_skbbk = 34.15 WHERE wage_from = 4500  AND wage_to = 4600;
UPDATE socso_rates SET employee_rate_skbbk = 34.85 WHERE wage_from = 4600  AND wage_to = 4700;
UPDATE socso_rates SET employee_rate_skbbk = 35.65 WHERE wage_from = 4700  AND wage_to = 4800;
UPDATE socso_rates SET employee_rate_skbbk = 36.35 WHERE wage_from = 4800  AND wage_to = 4900;
UPDATE socso_rates SET employee_rate_skbbk = 37.15 WHERE wage_from = 4900  AND wage_to = 5000;
UPDATE socso_rates SET employee_rate_skbbk = 37.85 WHERE wage_from = 5000  AND wage_to = 5100;
UPDATE socso_rates SET employee_rate_skbbk = 38.65 WHERE wage_from = 5100  AND wage_to = 5200;
UPDATE socso_rates SET employee_rate_skbbk = 39.35 WHERE wage_from = 5200  AND wage_to = 5300;
UPDATE socso_rates SET employee_rate_skbbk = 40.15 WHERE wage_from = 5300  AND wage_to = 5400;
UPDATE socso_rates SET employee_rate_skbbk = 40.85 WHERE wage_from = 5400  AND wage_to = 5500;
UPDATE socso_rates SET employee_rate_skbbk = 41.65 WHERE wage_from = 5500  AND wage_to = 5600;
UPDATE socso_rates SET employee_rate_skbbk = 42.35 WHERE wage_from = 5600  AND wage_to = 5700;
UPDATE socso_rates SET employee_rate_skbbk = 43.15 WHERE wage_from = 5700  AND wage_to = 5800;
UPDATE socso_rates SET employee_rate_skbbk = 43.85 WHERE wage_from = 5800  AND wage_to = 5900;
UPDATE socso_rates SET employee_rate_skbbk = 44.65 WHERE wage_from = 5900  AND wage_to = 6000;
UPDATE socso_rates SET employee_rate_skbbk = 44.65 WHERE wage_from = 6000  AND wage_to >= 999999;

-- Sanity check: should be 0
DO $$
DECLARE
  null_count int;
BEGIN
  SELECT COUNT(*) INTO null_count FROM socso_rates WHERE employee_rate_skbbk IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'SKBBK backfill incomplete: % rows still NULL', null_count;
  END IF;
END $$;

ALTER TABLE socso_rates
  ALTER COLUMN employee_rate_skbbk SET NOT NULL;

COMMIT;

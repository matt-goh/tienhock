-- ============================================================================
-- Payroll cleanup: phantom SOCSO/SIP on zero-wage months + deletion of Jan-Apr 2026
-- Date run: 2026-06-27
-- Context: HR cleaning up unreliable Jan-Apr 2026 payroll. Zero-gross employee
--   payrolls were charged the minimum SOCSO/SIP because the lowest statutory
--   bracket starts at wage_from = 0.00. EPF self-guards (wage <= RM10 -> 0).
--   Code guard added separately in src/routes/payroll/employee-payrolls.js
--   (SOCSO and SIP now require grossPay > 0). May/June data was correct and
--   left untouched.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. INVESTIGATION (read-only)
-- ----------------------------------------------------------------------------

-- Monthly payrolls for 2026
SELECT id, year, month, status, created_at
FROM monthly_payrolls WHERE year = 2026 ORDER BY month;

-- Employee payrolls Jan-Apr (all gross_pay = 0, negative net from phantom deductions)
SELECT mp.month, ep.id AS ep_id, ep.employee_id, ep.gross_pay, ep.net_pay, ep.status
FROM employee_payrolls ep
JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
WHERE mp.year = 2026 AND mp.month IN (1,2,3,4)
ORDER BY mp.month, ep.employee_id;

-- The phantom deductions: wage_amount = 0 but employee/employer amounts > 0
SELECT mp.month, ep.employee_id, pd.deduction_type, pd.employee_amount, pd.employer_amount, pd.wage_amount
FROM payroll_deductions pd
JOIN employee_payrolls ep ON ep.id = pd.employee_payroll_id
JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
WHERE mp.year = 2026 AND mp.month IN (1,2,3,4)
ORDER BY mp.month, ep.employee_id, pd.deduction_type;

-- Lowest statutory brackets (root cause: wage_from = 0.00 charges a minimum)
SELECT id, wage_from, wage_to, employee_rate, employee_rate_skbbk, employer_rate, employer_rate_over_60
FROM socso_rates WHERE is_active = true ORDER BY wage_from LIMIT 3;
SELECT id, wage_from, wage_to, employee_rate, employer_rate
FROM sip_rates WHERE is_active = true ORDER BY wage_from LIMIT 3;

-- Scope: zero-gross payrolls and phantom deductions per month
SELECT mp.month,
       COUNT(*) FILTER (WHERE ep.gross_pay = 0) AS zero_gross_payrolls,
       COUNT(pd.id) FILTER (WHERE ep.gross_pay = 0 AND pd.deduction_type IN ('socso','sip')) AS phantom_deductions
FROM employee_payrolls ep
JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
LEFT JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id
WHERE mp.year = 2026
GROUP BY mp.month ORDER BY mp.month;

-- Confirm none of the zero-gross workers have a mid-month advance
SELECT mp.month, COUNT(*) AS zero_gross_with_midmonth
FROM employee_payrolls ep
JOIN monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
JOIN mid_month_payrolls mmp ON mmp.employee_id = ep.employee_id
  AND mmp.year = mp.year AND mmp.month = mp.month AND mmp.status <> 'Cancelled'
WHERE mp.year = 2026 AND mp.month IN (1,2,3,4) AND ep.gross_pay = 0
GROUP BY mp.month ORDER BY mp.month;


-- ----------------------------------------------------------------------------
-- 2. CLEANUP: remove phantom deductions, recompute net_pay & rounding
--    (run as one transaction)
-- ----------------------------------------------------------------------------
BEGIN;

-- Delete phantom SOCSO/SIP deductions on zero-gross payrolls (deleted 131 rows)
DELETE FROM payroll_deductions pd
USING employee_payrolls ep, monthly_payrolls mp
WHERE pd.employee_payroll_id = ep.id
  AND ep.monthly_payroll_id = mp.id
  AND mp.year = 2026 AND mp.month IN (1,2,3,4)
  AND ep.gross_pay = 0
  AND pd.deduction_type IN ('socso','sip');

-- Recompute net_pay = gross_pay - sum(employee deductions) for affected rows
UPDATE employee_payrolls ep
SET net_pay = ep.gross_pay - COALESCE((
  SELECT SUM(pd.employee_amount) FROM payroll_deductions pd
  WHERE pd.employee_payroll_id = ep.id
), 0)
FROM monthly_payrolls mp
WHERE ep.monthly_payroll_id = mp.id
  AND mp.year = 2026 AND mp.month IN (1,2,3,4)
  AND ep.gross_pay = 0;

-- Reset stale rounding fields (no mid-month advances -> jumlah = 0 -> both 0)
UPDATE employee_payrolls ep
SET digenapkan = 0, setelah_digenapkan = 0
FROM monthly_payrolls mp
WHERE ep.monthly_payroll_id = mp.id
  AND mp.year = 2026 AND mp.month IN (1,2,3,4)
  AND ep.gross_pay = 0;

COMMIT;


-- ----------------------------------------------------------------------------
-- 3. DELETE the entire Jan-Apr 2026 payroll (confirmed)
--    (run as one transaction)
-- ----------------------------------------------------------------------------
BEGIN;

DELETE FROM payroll_deductions pd
USING employee_payrolls ep, monthly_payrolls mp
WHERE pd.employee_payroll_id = ep.id
  AND ep.monthly_payroll_id = mp.id
  AND mp.year = 2026 AND mp.month IN (1,2,3,4);

DELETE FROM payroll_items pi
USING employee_payrolls ep, monthly_payrolls mp
WHERE pi.employee_payroll_id = ep.id
  AND ep.monthly_payroll_id = mp.id
  AND mp.year = 2026 AND mp.month IN (1,2,3,4);

DELETE FROM employee_payrolls ep
USING monthly_payrolls mp
WHERE ep.monthly_payroll_id = mp.id
  AND mp.year = 2026 AND mp.month IN (1,2,3,4);

DELETE FROM monthly_payrolls
WHERE year = 2026 AND month IN (1,2,3,4);

COMMIT;

-- Final state after step 3: only months 5 (May) and 6 (June) remain for 2026.
SELECT month FROM monthly_payrolls WHERE year = 2026 ORDER BY month;


-- ----------------------------------------------------------------------------
-- 4. DELETE every payroll BEFORE May 2026 (confirmed)
--    Catches leftover 2025 payrolls (Oct/Nov/Dec) plus any 2026 month < 5.
--    (run as one transaction)
-- ----------------------------------------------------------------------------

-- Pre-check: what exists before May 2026
SELECT mp.id, mp.year, mp.month, mp.status,
  COUNT(DISTINCT ep.id) AS employee_payrolls,
  COUNT(DISTINCT pi.id) AS payroll_items,
  COUNT(DISTINCT pd.id) AS payroll_deductions
FROM monthly_payrolls mp
LEFT JOIN employee_payrolls ep ON ep.monthly_payroll_id = mp.id
LEFT JOIN payroll_items pi ON pi.employee_payroll_id = ep.id
LEFT JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id
WHERE (mp.year < 2026) OR (mp.year = 2026 AND mp.month < 5)
GROUP BY mp.id, mp.year, mp.month, mp.status ORDER BY mp.year, mp.month;

BEGIN;

DELETE FROM payroll_deductions pd
USING employee_payrolls ep, monthly_payrolls mp
WHERE pd.employee_payroll_id = ep.id
  AND ep.monthly_payroll_id = mp.id
  AND ((mp.year < 2026) OR (mp.year = 2026 AND mp.month < 5));

DELETE FROM payroll_items pi
USING employee_payrolls ep, monthly_payrolls mp
WHERE pi.employee_payroll_id = ep.id
  AND ep.monthly_payroll_id = mp.id
  AND ((mp.year < 2026) OR (mp.year = 2026 AND mp.month < 5));

DELETE FROM employee_payrolls ep
USING monthly_payrolls mp
WHERE ep.monthly_payroll_id = mp.id
  AND ((mp.year < 2026) OR (mp.year = 2026 AND mp.month < 5));

DELETE FROM monthly_payrolls
WHERE (year < 2026) OR (year = 2026 AND month < 5);

COMMIT;

-- Final state: only May (5) and June (6) 2026 remain.
SELECT year, month FROM monthly_payrolls ORDER BY year, month;

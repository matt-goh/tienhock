-- Consolidate employee_leave_balances by name for multi-ID employees.
--
-- Backstory: the leave system used employee_id as the unique-person key, but
-- some staff have multiple staffs.id rows sharing one full name (the payroll
-- system already groups them this way). Every duplicate ID was getting its
-- own balance row + its own allowance, which let people double their cuti.
--
-- This migration keeps ONLY the row tied to the senior sibling (earliest
-- date_joined; tie-breaker: lowest staff.id) for each (name, year). Before
-- deleting the others, we lift the senior row's totals to the MAX seen
-- across the sibling group so nobody loses entitlement during cleanup.

BEGIN;

-- 1. Senior sibling per name (earliest date_joined wins, then lowest id).
WITH name_seniors AS (
  SELECT DISTINCT ON (s.name)
    s.name,
    s.id AS senior_id,
    s.date_joined,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.date_joined))::int AS years_of_service
  FROM staffs s
  ORDER BY s.name, s.date_joined ASC, s.id ASC
),
-- 2. For each (senior_id, year) where the group has multiple balance rows,
--    capture the MAX total currently held by ANY sibling. We'll bump the
--    senior's row up to that level so cleanup never lowers an entitlement.
group_max_totals AS (
  SELECT
    ns.senior_id,
    lb.year,
    MAX(lb.cuti_tahunan_total) AS max_tahunan,
    MAX(lb.cuti_sakit_total)   AS max_sakit,
    MAX(lb.cuti_rawatan_total) AS max_rawatan
  FROM name_seniors ns
  JOIN staffs s ON s.name = ns.name
  JOIN employee_leave_balances lb ON lb.employee_id = s.id
  GROUP BY ns.senior_id, lb.year
)
UPDATE employee_leave_balances target
SET cuti_tahunan_total = GREATEST(target.cuti_tahunan_total, gmt.max_tahunan),
    cuti_sakit_total   = GREATEST(target.cuti_sakit_total,   gmt.max_sakit),
    cuti_rawatan_total = GREATEST(target.cuti_rawatan_total, gmt.max_rawatan),
    updated_at         = CURRENT_TIMESTAMP
FROM group_max_totals gmt
WHERE target.employee_id = gmt.senior_id
  AND target.year = gmt.year;

-- 3. If the senior has NO balance row for a year but a junior sibling does,
--    create one for the senior using the max sibling totals OR the standard
--    allowance (whichever is higher). That way we don't drop an entitlement
--    on deletion.
WITH name_seniors AS (
  SELECT DISTINCT ON (s.name)
    s.name,
    s.id AS senior_id,
    s.date_joined,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.date_joined))::int AS years_of_service
  FROM staffs s
  ORDER BY s.name, s.date_joined ASC, s.id ASC
)
INSERT INTO employee_leave_balances (
  employee_id, year, cuti_tahunan_total, cuti_sakit_total, cuti_rawatan_total
)
SELECT
  ns.senior_id,
  lb.year,
  GREATEST(
    MAX(lb.cuti_tahunan_total),
    CASE WHEN ns.years_of_service < 2 THEN 8
         WHEN ns.years_of_service < 5 THEN 12
         ELSE 16 END
  ),
  GREATEST(
    MAX(lb.cuti_sakit_total),
    CASE WHEN ns.years_of_service < 2 THEN 14
         WHEN ns.years_of_service < 5 THEN 18
         ELSE 22 END
  ),
  GREATEST(MAX(lb.cuti_rawatan_total), 60)
FROM name_seniors ns
JOIN staffs s ON s.name = ns.name AND s.id <> ns.senior_id
JOIN employee_leave_balances lb ON lb.employee_id = s.id
LEFT JOIN employee_leave_balances existing
  ON existing.employee_id = ns.senior_id AND existing.year = lb.year
WHERE existing.id IS NULL
GROUP BY ns.senior_id, lb.year, ns.years_of_service;

-- 4. Delete every non-senior duplicate. The senior row is now authoritative.
WITH name_seniors AS (
  SELECT DISTINCT ON (s.name)
    s.name,
    s.id AS senior_id
  FROM staffs s
  ORDER BY s.name, s.date_joined ASC, s.id ASC
)
DELETE FROM employee_leave_balances lb
USING staffs s, name_seniors ns
WHERE s.id = lb.employee_id
  AND ns.name = s.name
  AND lb.employee_id <> ns.senior_id;

COMMIT;

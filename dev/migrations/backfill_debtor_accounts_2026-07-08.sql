-- Backfill missing Trade Debtor child accounts from customers.
--
-- Each customer should have one child under account_codes.code='DEBTOR':
--   code = customer.id, or customer.id || '-D' when the raw ID collides with
--   another account code (for example CASH -> CASH-D).
-- Safe to re-run. Run:
--   docker exec -i tienhock_dev_db psql -U postgres -d tienhock < dev/migrations/backfill_debtor_accounts_2026-07-08.sql

BEGIN;

WITH missing_customers AS (
  SELECT c.id, c.name
  FROM customers c
  WHERE NOT EXISTS (
    SELECT 1
    FROM account_codes d
    WHERE d.parent_code = 'DEBTOR'
      AND d.code IN (c.id, c.id || '-D')
  )
),
new_debtors AS (
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM account_codes a WHERE a.code = m.id)
        THEN m.id || '-D'
      ELSE m.id
    END AS code,
    m.name,
    ROW_NUMBER() OVER (ORDER BY m.id) AS sort_offset
  FROM missing_customers m
),
base_sort AS (
  SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
  FROM account_codes
  WHERE parent_code = 'DEBTOR'
)
INSERT INTO account_codes (
  code, description, ledger_type, parent_code,
  level, sort_order, is_active, is_system, fs_note
)
SELECT
  n.code,
  n.name,
  'TD',
  'DEBTOR',
  2,
  b.max_sort_order + n.sort_offset,
  TRUE,
  FALSE,
  '22'
FROM new_debtors n
CROSS JOIN base_sort b
WHERE NOT EXISTS (
  SELECT 1
  FROM account_codes a
  WHERE a.code = n.code
);

COMMIT;

SELECT
  (SELECT COUNT(*) FROM customers) AS customers,
  (SELECT COUNT(*) FROM account_codes WHERE parent_code = 'DEBTOR') AS children,
  (SELECT COUNT(*)
   FROM customers c
   WHERE NOT EXISTS (
     SELECT 1
     FROM account_codes a
     WHERE a.parent_code = 'DEBTOR'
       AND a.code IN (c.id, c.id || '-D')
   )) AS unmapped;

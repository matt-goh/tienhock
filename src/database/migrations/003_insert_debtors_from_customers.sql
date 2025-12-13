-- Insert Trade Debtors (TD) from Customers Table
-- This script dynamically creates debtor accounts for all customers in the system
-- Pattern: Code = customer.id, Description = customer.name, Parent = DEBTOR
-- Following the old system structure where all customer debtors are children of DEBTOR account

-- Generate debtor accounts for all customers
INSERT INTO account_codes (code, description, ledger_type, parent_code, level, sort_order, is_active, is_system)
SELECT
    c.id::TEXT AS code,
    c.name AS description,
    'TD' AS ledger_type,
    'DEBTOR' AS parent_code,
    2 AS level,
    ROW_NUMBER() OVER (ORDER BY c.id) AS sort_order,
    TRUE AS is_active,
    FALSE AS is_system
FROM customers c
ORDER BY c.id;

COMMIT;

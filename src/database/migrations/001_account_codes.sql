-- Account Codes Management Schema
-- This schema supports the Chart of Accounts with hierarchical relationships

-- Ledger Types Table (TL column from Chart of Accounts)
-- Fixed set of ledger types: CS, GL, OS, TD, TC, BK, etc.
CREATE TABLE IF NOT EXISTS ledger_types (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE, -- System types cannot be deleted
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default ledger types based on Chart of Accounts analysis
INSERT INTO ledger_types (code, name, description, is_system) VALUES
    ('CS', 'Closing Stock', 'Closing stock/inventory accounts', TRUE),
    ('OS', 'Opening Stock', 'Opening stock/inventory accounts', TRUE),
    ('GL', 'General Ledger', 'General ledger accounts', TRUE),
    ('TD', 'Trade Debtor', 'Trade debtor/receivables accounts', TRUE),
    ('TC', 'Trade Creditor', 'Trade creditor/payables accounts', TRUE),
    ('BK', 'Bank', 'Bank accounts', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Account Codes Table
-- Stores all account codes with hierarchical relationships
CREATE TABLE IF NOT EXISTS account_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255) NOT NULL,
    ledger_type VARCHAR(10) REFERENCES ledger_types(code),
    parent_code VARCHAR(50) REFERENCES account_codes(code) ON DELETE SET NULL,

    -- Hierarchy level (1 = top level, 2 = sub-account, etc.)
    level INTEGER DEFAULT 1,

    -- For ordering within same parent
    sort_order INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE, -- System accounts cannot be deleted

    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    updated_by VARCHAR(50)
);

-- Index for faster parent-child lookups
CREATE INDEX IF NOT EXISTS idx_account_codes_parent ON account_codes(parent_code);
CREATE INDEX IF NOT EXISTS idx_account_codes_ledger_type ON account_codes(ledger_type);
CREATE INDEX IF NOT EXISTS idx_account_codes_active ON account_codes(is_active);

-- Journal Entries Header Table
-- Each journal entry has a header and multiple line items
CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    reference_no VARCHAR(50) UNIQUE NOT NULL, -- e.g., PBE002/06

    -- Entry type: B=Bank Payment, C=Cash, I=Invoice, S=Sales, J=Journal, R=Receipt, DR=Debit, CR=Credit, O=Other
    entry_type VARCHAR(10) NOT NULL,

    entry_date DATE NOT NULL,
    description TEXT,

    -- Totals (calculated from line items)
    total_debit DECIMAL(15, 2) DEFAULT 0,
    total_credit DECIMAL(15, 2) DEFAULT 0,

    -- Status
    status VARCHAR(20) DEFAULT 'draft', -- draft, posted, cancelled

    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    updated_by VARCHAR(50),
    posted_at TIMESTAMP,
    posted_by VARCHAR(50)
);

-- Index for reference number lookups
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference_no);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_type ON journal_entries(entry_type);

-- Journal Entry Line Items Table
CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id SERIAL PRIMARY KEY,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL, -- Order within the journal entry

    account_code VARCHAR(50) NOT NULL REFERENCES account_codes(code),

    -- Either debit or credit, not both
    debit_amount DECIMAL(15, 2) DEFAULT 0,
    credit_amount DECIMAL(15, 2) DEFAULT 0,

    -- Additional reference (e.g., cheque number, invoice number)
    reference VARCHAR(100),
    particulars TEXT, -- Line item description

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure either debit or credit is set, not both
    CONSTRAINT chk_debit_or_credit CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (debit_amount = 0 AND credit_amount > 0) OR
        (debit_amount = 0 AND credit_amount = 0)
    )
);

-- Index for faster account lookups
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_code);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_entry_lines(journal_entry_id);

-- Journal Entry Types Reference Table
CREATE TABLE IF NOT EXISTS journal_entry_types (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- Insert default entry types
INSERT INTO journal_entry_types (code, name, description) VALUES
    ('B', 'Bank Payment', 'Payment made through bank'),
    ('C', 'Cash Payment', 'Cash payment entry'),
    ('I', 'Invoice', 'Invoice entry'),
    ('S', 'Sales', 'Sales entry'),
    ('J', 'Journal', 'General journal entry'),
    ('R', 'Receipt', 'Receipt/collection entry'),
    ('DR', 'Debit Note', 'Debit note entry'),
    ('CR', 'Credit Note', 'Credit note entry'),
    ('O', 'Other', 'Other entry type')
ON CONFLICT (code) DO NOTHING;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_account_codes_updated_at ON account_codes;
CREATE TRIGGER update_account_codes_updated_at
    BEFORE UPDATE ON account_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_journal_entries_updated_at ON journal_entries;
CREATE TRIGGER update_journal_entries_updated_at
    BEFORE UPDATE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ledger_types_updated_at ON ledger_types;
CREATE TRIGGER update_ledger_types_updated_at
    BEFORE UPDATE ON ledger_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for account codes with hierarchy path
CREATE OR REPLACE VIEW account_codes_hierarchy AS
WITH RECURSIVE account_tree AS (
    -- Base case: top-level accounts (no parent)
    SELECT
        id,
        code,
        description,
        ledger_type,
        parent_code,
        level,
        sort_order,
        is_active,
        is_system,
        code::TEXT AS path,
        ARRAY[code::TEXT] AS path_array,
        1 AS depth
    FROM account_codes
    WHERE parent_code IS NULL

    UNION ALL

    -- Recursive case: child accounts
    SELECT
        ac.id,
        ac.code,
        ac.description,
        ac.ledger_type,
        ac.parent_code,
        ac.level,
        ac.sort_order,
        ac.is_active,
        ac.is_system,
        at.path || ' > ' || ac.code::TEXT AS path,
        at.path_array || ac.code::TEXT AS path_array,
        at.depth + 1 AS depth
    FROM account_codes ac
    INNER JOIN account_tree at ON ac.parent_code = at.code
)
SELECT * FROM account_tree
ORDER BY path_array;

-- Migration: Add Financial Statement Notes Support
-- Date: 2026-01-09
-- Description: Adds fs_note column to account_codes and creates financial_statement_notes table

-- =====================================================
-- 1. Add fs_note column to account_codes
-- =====================================================
ALTER TABLE account_codes ADD COLUMN IF NOT EXISTS fs_note VARCHAR(10);
CREATE INDEX IF NOT EXISTS idx_account_codes_fs_note ON account_codes(fs_note);
COMMENT ON COLUMN account_codes.fs_note IS 'Financial statement note reference (e.g., 1, 3-1, 14-2)';

-- =====================================================
-- 2. Create financial_statement_notes table
-- =====================================================
CREATE TABLE IF NOT EXISTS financial_statement_notes (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  report_section VARCHAR(50),
  normal_balance VARCHAR(10) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  parent_note VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE financial_statement_notes IS 'Financial statement note definitions for grouping account codes in reports';
COMMENT ON COLUMN financial_statement_notes.code IS 'Note reference code (e.g., 1, 3-1, 14-2)';
COMMENT ON COLUMN financial_statement_notes.category IS 'asset, liability, equity, revenue, expense, cogs';
COMMENT ON COLUMN financial_statement_notes.report_section IS 'balance_sheet, income_statement, cogm';
COMMENT ON COLUMN financial_statement_notes.normal_balance IS 'debit or credit';

-- =====================================================
-- 3. Seed standard financial statement notes
-- =====================================================
INSERT INTO financial_statement_notes (code, name, category, report_section, normal_balance, sort_order, parent_note) VALUES
-- Balance Sheet - Assets
('4', 'Property, Plant & Equipment', 'asset', 'balance_sheet', 'debit', 100, NULL),
('6', 'Cash in Hand', 'asset', 'balance_sheet', 'debit', 110, NULL),
('8', 'Prepayments & Deposits', 'asset', 'balance_sheet', 'debit', 120, NULL),
('14-1', 'Closing Stock (Finished Goods)', 'asset', 'balance_sheet', 'debit', 130, '14'),
('14-2', 'Closing Stock (Raw Materials)', 'asset', 'balance_sheet', 'debit', 131, '14'),
('14-3', 'Closing Stock (Packing Materials)', 'asset', 'balance_sheet', 'debit', 132, '14'),
('17', 'Input Tax', 'asset', 'balance_sheet', 'debit', 140, NULL),
('19', 'Cash at Bank', 'asset', 'balance_sheet', 'debit', 150, NULL),
('22', 'Trade Receivables', 'asset', 'balance_sheet', 'debit', 160, NULL),

-- Balance Sheet - Liabilities
('1', 'Accruals', 'liability', 'balance_sheet', 'credit', 200, NULL),
('9', 'Amount Due to Director', 'liability', 'balance_sheet', 'credit', 210, NULL),
('10', 'Other Creditors', 'liability', 'balance_sheet', 'credit', 220, NULL),
('11', 'Term Loans', 'liability', 'balance_sheet', 'credit', 230, NULL),
('12', 'Taxation', 'liability', 'balance_sheet', 'credit', 240, NULL),
('13', 'Trade Payables', 'liability', 'balance_sheet', 'credit', 250, NULL),
('16', 'Hire Purchase Payable', 'liability', 'balance_sheet', 'credit', 260, NULL),

-- Balance Sheet - Equity
('20', 'Retained Profit B/F', 'equity', 'balance_sheet', 'credit', 300, NULL),
('21', 'Share Capital', 'equity', 'balance_sheet', 'credit', 310, NULL),

-- Income Statement - Revenue
('7', 'Revenue/Sales', 'revenue', 'income_statement', 'credit', 400, NULL),
('18-1', 'Gain on Disposal of PPE', 'revenue', 'income_statement', 'credit', 410, '18'),
('18-2', 'Other Income', 'revenue', 'income_statement', 'credit', 411, '18'),

-- Income Statement - Expenses
('3', 'Tax Expenses', 'expense', 'income_statement', 'debit', 500, NULL),
('5', 'Administrative Expenses (Salaries)', 'expense', 'income_statement', 'debit', 510, NULL),
('15', 'Depreciation', 'expense', 'income_statement', 'debit', 520, NULL),
('23', 'Hire Purchase Interest', 'expense', 'income_statement', 'debit', 530, NULL),

-- Cost of Goods Manufactured (COGM)
('3-1', 'Opening Stock (Finished Products)', 'cogs', 'cogm', 'debit', 600, '3'),
('3-2', 'Purchases (Packing Material)', 'cogs', 'cogm', 'debit', 610, '3'),
('3-3', 'Opening Stock (Raw Materials)', 'cogs', 'cogm', 'debit', 620, '3'),
('3-4', 'Purchase of Chemical', 'cogs', 'cogm', 'debit', 630, '3'),
('3-5', 'Purchase of Raw Material', 'cogs', 'cogm', 'debit', 640, '3'),
('3-6', 'Freight & Transportation', 'cogs', 'cogm', 'debit', 650, '3'),
('3-7', 'Opening Stock (Packing Material)', 'cogs', 'cogm', 'debit', 660, '3'),
('5-1', 'Factory Worker Salaries', 'cogs', 'cogm', 'debit', 670, '5')
ON CONFLICT (code) DO NOTHING;

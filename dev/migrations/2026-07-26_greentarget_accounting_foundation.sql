-- ============================================================================
-- Green Target accounting foundation - Phase G2
-- Doc: docs/Account/GT_ACCOUNTING_HANDOVER.md (R1, R3, R4, R5, section 3b/3c)
--
-- Clones the accounting tables into the `greentarget` schema and seeds the GT
-- financial-statement-note catalogue transcribed from the six validated Trial
-- Balances plus the June 2026 Balance Sheet and Income Statement (Phase G1).
--
-- WHAT THIS MIGRATION DOES NOT DO
--   * It creates NO account codes. The 474-code chart is loaded in G3.
--   * It creates NO journals, NO journal lines, NO opening anchors. That is G4.
--   * It touches NO `public` table. GT accounting data is completely isolated
--     from Tien Hock's (handover "Core principle"). The only `public` object it
--     reuses is the stateless trigger function update_updated_at_column().
--
-- IDEMPOTENCY
--   Every object is CREATE ... IF NOT EXISTS / CREATE OR REPLACE. Every seed is
--   ON CONFLICT DO UPDATE ... WHERE the row actually differs, so an unchanged
--   rerun does not even touch updated_at. A second run is an exact no-op.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guards - assert the world is what we think it is, abort otherwise
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'greentarget') THEN
    RAISE EXCEPTION 'G2 guard: schema "greentarget" does not exist';
  END IF;

  IF to_regclass('public.account_codes') IS NULL
     OR to_regclass('public.journal_entries') IS NULL
     OR to_regclass('public.financial_statement_notes') IS NULL THEN
    RAISE EXCEPTION 'G2 guard: expected public accounting tables are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'G2 guard: public.update_updated_at_column() is missing';
  END IF;

  -- account_codes_hierarchy is a VIEW in public, never a table. If that ever
  -- changes, the GT view below is the wrong shape and must be revisited.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_codes_hierarchy'
      AND table_type = 'VIEW'
  ) THEN
    RAISE EXCEPTION 'G2 guard: public.account_codes_hierarchy is not a VIEW';
  END IF;
END $$;

-- Snapshot the TH baseline so the tail of this migration can prove it moved.
CREATE TEMP TABLE g2_th_baseline ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.account_codes)             AS account_codes,
       (SELECT count(*) FROM public.journal_entries)           AS journal_entries,
       (SELECT count(*) FROM public.journal_entry_lines)       AS journal_entry_lines,
       (SELECT count(*) FROM public.financial_statement_notes) AS fs_notes,
       (SELECT count(*) FROM public.account_opening_balances)  AS opening_balances;

-- ---------------------------------------------------------------------------
-- 1. greentarget.ledger_types  (exact clone of public.ledger_types)
--
--    Seeded with all six TH rows. CS/OS are stock ledgers GT will never use
--    (R5: no stock machinery), but keeping the lookup identical costs nothing
--    and lets R7's shared pages render both companies from one code path.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.ledger_types (
  code        VARCHAR(10)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  is_system   BOOLEAN      DEFAULT FALSE,
  is_active   BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_gt_ledger_types_updated_at ON greentarget.ledger_types;
CREATE TRIGGER update_gt_ledger_types_updated_at
  BEFORE UPDATE ON greentarget.ledger_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO greentarget.ledger_types (code, name, description, is_system, is_active) VALUES
  ('BK', 'Bank',           'Bank accounts',                     TRUE, TRUE),
  ('CS', 'Closing Stock',  'Closing stock/inventory accounts',  TRUE, TRUE),
  ('GL', 'General Ledger', 'General ledger accounts',           TRUE, TRUE),
  ('OS', 'Opening Stock',  'Opening stock/inventory accounts',  TRUE, TRUE),
  ('TC', 'Trade Creditor', 'Trade creditor/payables accounts',  TRUE, TRUE),
  ('TD', 'Trade Debtor',   'Trade debtor/receivables accounts', TRUE, TRUE)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      is_system = EXCLUDED.is_system, is_active = EXCLUDED.is_active
  WHERE (greentarget.ledger_types.name, greentarget.ledger_types.description,
         greentarget.ledger_types.is_system, greentarget.ledger_types.is_active)
     IS DISTINCT FROM
        (EXCLUDED.name, EXCLUDED.description, EXCLUDED.is_system, EXCLUDED.is_active);

-- ---------------------------------------------------------------------------
-- 2. greentarget.journal_entry_types  (exact clone)
--
--    Seeded with IMP only - the one type G4's legacy import needs (R3). The
--    nine decoded legacy journal families (#/#, I#/#, RV#/#/#, PB#/#, PBEB#/#,
--    PBE#/#, JBSL/#/#, JWDR/#/#, JV#/#/#) ride in journal_entries.
--    legacy_entry_type, which is unconstrained free text in TH too. Operational
--    types arrive with the services that post them, in G7.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.journal_entry_types (
  code        VARCHAR(10) PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  description TEXT,
  is_active   BOOLEAN     DEFAULT TRUE
);

INSERT INTO greentarget.journal_entry_types (code, name, description, is_active) VALUES
  ('IMP', 'Legacy Import', 'Imported legacy accounting journal (Jan-Jun 2026 GTLD/GTDB)', TRUE)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = EXCLUDED.is_active
  WHERE (greentarget.journal_entry_types.name, greentarget.journal_entry_types.description,
         greentarget.journal_entry_types.is_active)
     IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.is_active);

-- ---------------------------------------------------------------------------
-- 3. greentarget.financial_statement_notes
--
--    Clone of public.financial_statement_notes PLUS one GT-only column:
--    `statement_block`, the printed block a note is rendered in.
--
--    WHY statement_block EXISTS. The TH report engine derives placement from
--    `category` alone. That cannot express GT's printed layout, which differs
--    from TH's in three independent ways:
--      * note 4 is a NON-CURRENT asset under its own heading;
--      * note 9 is a director account printed INSIDE current assets as a debit;
--      * note 12 is a liability printed in a LONG-TERM LIABILITIES block that
--        the TH layout does not render at all.
--    category/report_section/normal_balance are kept (same vocabulary as TH, so
--    R7's shared pages work unchanged); statement_block is authoritative for
--    where a line actually prints.
--
--    parent_note is NULL for EVERY GT note, deliberately. On TH, 3-x/14-x/18-x
--    genuinely roll up into a parent. On GT's printed statements nothing rolls
--    up: note 2 "BURNING MATERIAL" and note 2-1 "EPF CONTRIBUTION" are sibling
--    direct-cost lines each carrying its own amount. Setting parent_note='2'
--    would falsely assert that EPF sums into Burning Material.
--
--    report_section is CHECK-constrained to exclude 'cogm' - R5 (GT is a
--    service company: no CoGM, no stock) enforced by the database.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.financial_statement_notes (
  code            VARCHAR(10)  PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  category        VARCHAR(50)  NOT NULL,
  report_section  VARCHAR(50),
  statement_block VARCHAR(40),
  normal_balance  VARCHAR(10)  NOT NULL,
  sort_order      INTEGER      DEFAULT 0,
  parent_note     VARCHAR(10),
  is_active       BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gt_fs_notes_category_ck CHECK (
    category IN ('asset', 'liability', 'equity', 'revenue', 'expense', 'cogs')),
  CONSTRAINT gt_fs_notes_normal_balance_ck CHECK (
    normal_balance IN ('debit', 'credit')),
  -- R5: GT has no CoGM report. 'cogm' is rejected outright.
  CONSTRAINT gt_fs_notes_report_section_ck CHECK (
    report_section IN ('balance_sheet', 'income_statement')),
  CONSTRAINT gt_fs_notes_statement_block_ck CHECK (
    statement_block IN (
      -- balance sheet, in printed order
      'non_current_assets', 'current_assets', 'current_liabilities',
      'equity', 'long_term_liabilities',
      -- income statement, in printed order
      'revenue', 'direct_costs', 'other_operating_income',
      'administrative_expenses', 'finance_costs', 'tax')),
  -- a block may only appear on the statement it belongs to
  CONSTRAINT gt_fs_notes_block_section_ck CHECK (
    (report_section = 'balance_sheet' AND statement_block IN (
      'non_current_assets', 'current_assets', 'current_liabilities',
      'equity', 'long_term_liabilities'))
    OR
    (report_section = 'income_statement' AND statement_block IN (
      'revenue', 'direct_costs', 'other_operating_income',
      'administrative_expenses', 'finance_costs', 'tax')))
);

DROP TRIGGER IF EXISTS update_gt_fs_notes_updated_at ON greentarget.financial_statement_notes;
CREATE TRIGGER update_gt_fs_notes_updated_at
  BEFORE UPDATE ON greentarget.financial_statement_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The 34-note GT catalogue. Every row is transcribed from a printed line; the
-- description records the scan line and the Trial Balance APPX evidence.
-- Stock notes (3-1..3-7, 14-1..14-3), 5-1 and 18-1 are deliberately ABSENT -
-- see handover section 3c: drop them rather than carry dead rows.
INSERT INTO greentarget.financial_statement_notes
  (code, name, description, category, report_section, statement_block, normal_balance, sort_order, parent_note, is_active)
VALUES
  -- === BALANCE SHEET :: NON-CURRENT ASSET ===================================
  ('4', 'Property, Plant And Equipment',
   'BS "PROPERTY,PLANT AND EQUIPMENT" (GT_BALANCE_SHEET.pdf p1 line 2) = 18,129.00. TB APPX 4, 11 accounts.',
   'asset', 'balance_sheet', 'non_current_assets', 'debit', 100, NULL, TRUE),

  -- === BALANCE SHEET :: CURRENT ASSETS ======================================
  ('22', 'Trade Receivable',
   'BS "TRADE RECEIVABLE" (p1 line 4) = 156,782.22. TB APPX 22 = ADD, DEBTOR.',
   'asset', 'balance_sheet', 'current_assets', 'debit', 110, NULL, TRUE),
  ('8', 'Non-Trade Receivables, Deposit & Prepayments',
   'BS "NON-TRADE RECEIVABLES,DEPOSIT & PREPAYMENTS" (p1 line 5) = .00. TB APPX 8, 11 accounts.',
   'asset', 'balance_sheet', 'current_assets', 'debit', 111, NULL, TRUE),
  ('9', 'Amount Due To Directors',
   'BS "AMOUNT DUE TO DIRECTORS" (p1 line 6) = 138,812.10, printed INSIDE current assets as a DEBIT. TB APPX 9 = CA GTH, CA WSF, CL GTH, CL WSF. GT/TH COLLISION: public note 9 is a credit liability, "Amount Due to Director".',
   'asset', 'balance_sheet', 'current_assets', 'debit', 112, NULL, TRUE),
  ('25', 'Tax Recoverable',
   'BS "TAX RECOVERABLE" (p1 line 7) = 24,139.50. TB APPX 25 = CA TAX. Does not exist in the TH catalogue.',
   'asset', 'balance_sheet', 'current_assets', 'debit', 113, NULL, TRUE),
  ('17', 'Input Tax',
   'BS "INPUT TAX" (p1 line 8) = ( .00). STATEMENT-ONLY NOTE: no Trial Balance account carries APPX 17 - the INPUT.TAX account is filed under APPX 10. G3 must map it explicitly; do not assume APPX equals the statement note.',
   'asset', 'balance_sheet', 'current_assets', 'debit', 114, NULL, TRUE),
  ('6', 'Cash In Hand',
   'BS "CASH IN HAND" (p1 line 9) = .00. TB APPX 6 = CH REV2, which G0/G1 proved is genuinely dormant (the unbanked counter cash sits in CD_SD).',
   'asset', 'balance_sheet', 'current_assets', 'debit', 115, NULL, TRUE),
  ('19', 'Cash At Bank',
   'BS "CASH AT BANK" (p1 line 10) = 28,468.37. TB APPX 19, 5 accounts.',
   'asset', 'balance_sheet', 'current_assets', 'debit', 116, NULL, TRUE),

  -- === BALANCE SHEET :: LESS: CURRENT LIABILITIES ===========================
  ('13', 'Trade Payable',
   'BS "TRADE PAYABLE" (p1 line 13) = ( 5,621.20). TB APPX 13, 29 accounts.',
   'liability', 'balance_sheet', 'current_liabilities', 'credit', 200, NULL, TRUE),
  ('1', 'Accruals',
   'BS "ACCRUALS" (p1 line 14) = .00. TB APPX 1, 14 accounts.',
   'liability', 'balance_sheet', 'current_liabilities', 'credit', 201, NULL, TRUE),
  ('10', 'Other Creditors',
   'BS "OTHER CREDITORS" (p1 line 15) = 91,566.25. TB APPX 10, 28 accounts - which also include INPUT.TAX, an asset the Balance Sheet prints as note 17.',
   'liability', 'balance_sheet', 'current_liabilities', 'credit', 202, NULL, TRUE),
  ('16', 'Hire Purchase Payable',
   'BS "HIRE PURCHASE PAYABLE" (p1 line 16) = .00. TB APPX 16, 6 accounts. One of them, FC HP "HIRE PURCHASE-INTEREST EXPENSES", is an EXPENSE filed under this liability note on the TB; the Income Statement prints its own "HIRE PURCHASE INTEREST" line carrying NO note at all.',
   'liability', 'balance_sheet', 'current_liabilities', 'credit', 203, NULL, TRUE),
  ('11', 'Term Loans',
   'BS "TERM LOANS" (p1 line 17) = .00. TB APPX 11 = CL PB11, FC TL. FC TL "TERM LOANS- INTEREST EXPENSES" is an EXPENSE filed under this liability note on the TB; the Income Statement prints it as note 23.',
   'liability', 'balance_sheet', 'current_liabilities', 'credit', 204, NULL, TRUE),

  -- === BALANCE SHEET :: FINANCED BY =========================================
  ('21', 'Share Capital',
   'BS "SHARE CAPITAL" (p1 line 22) = 100,000.00. TB APPX 21 = SC.',
   'equity', 'balance_sheet', 'equity', 'credit', 300, NULL, TRUE),
  ('20', 'Retained Profit B/F',
   'BS "RETAINED PROFIT - B/F" (p1 line 23) = 226,944.53. TB APPX 20 = RP.',
   'equity', 'balance_sheet', 'equity', 'credit', 301, NULL, TRUE),

  -- === BALANCE SHEET :: LONG-TERM LIABILITIES ===============================
  ('12', 'Deferred Tax Liabilities',
   'BS "DEFERRED TAX LIABILITIES" (p1 line 27) = ( 62,928.00), printed in the LONG-TERM LIABILITIES block that the TH Balance Sheet layout does not render. TB APPX 12 = CL TAX, LT DT.',
   'liability', 'balance_sheet', 'long_term_liabilities', 'credit', 400, NULL, TRUE),

  -- === INCOME STATEMENT :: REVENUE ==========================================
  ('7', 'Revenue',
   'IS "REVENUE" (GT_INCOME_STATEMENT.pdf p1 line 1) = 265,208.20, the six-month Jan-Jun movement. TB APPX 7, 21 accounts.',
   'revenue', 'income_statement', 'revenue', 'credit', 500, NULL, TRUE),

  -- === INCOME STATEMENT :: LESS: DIRECT COSTS ===============================
  ('2', 'Burning Material',
   'IS "BURNING MATERIAL" (p1 line 3) = .00. TB APPX 2, 4 accounts.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 600, NULL, TRUE),
  ('15', 'Depreciation Of Plant And Equipment',
   'IS "DEPRECIATION OF PLANT AND EQUIPMENT" (p1 line 4) = .00. TB APPX 15 = COS DEP. GT prints depreciation INSIDE direct costs, not as a standalone expense as TH does.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 601, NULL, TRUE),
  ('2-1', 'Employee''s Provident Fund Contribution',
   'IS "EMPLOYEE''S PROVIDENT FUND CONTRIBUTION" (p1 line 5) = 8,206.00. TB APPX 2-1, 16 accounts.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 602, NULL, TRUE),
  ('2-2', 'Freight Charges',
   'IS "FREIGHT CHARGES" (p1 line 6) = .00. TB APPX 2-2 = FC B, FC K.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 603, NULL, TRUE),
  ('2-3', 'Hiring Of Plants',
   'IS "HIRING OF PLANTS" (p1 line 7) = .00. TB APPX 2-3 = HR B, HR K.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 604, NULL, TRUE),
  ('2-4', 'Inspection Fee',
   'IS "INSPECTION FEE" (p1 line 8) = .00. TB APPX 2-4, 5 accounts.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 605, NULL, TRUE),
  ('2-5', 'Purchase Of Chemical',
   'IS "PURCHASE OF CHEMICAL" (p1 line 9) = .00. TB APPX 2-5 = CHEM B, CHEM K.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 606, NULL, TRUE),
  ('2-6', 'Repair And Maintenance',
   'IS "REPAIR AND MAINTENANCE" (p1 line 10) = 65,868.30. TB APPX 2-6, 52 accounts.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 607, NULL, TRUE),
  ('2-7', 'Repair And Parts',
   'IS "REPAIR AND PARTS" (p1 line 11) = .00. TB APPX 2-7, 3 accounts.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 608, NULL, TRUE),
  ('2-8', 'Salaries And Wages',
   'IS "SALARIES AND WAGES" (p1 line 12) = 63,485.50. TB APPX 2-8, 20 accounts.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 609, NULL, TRUE),
  ('2-9', 'SOCSO Contribution',
   'IS "SOCSO CONTRIBUTION" (p1 line 13) = 1,238.10. TB APPX 2-9, 27 accounts.',
   'cogs', 'income_statement', 'direct_costs', 'debit', 610, NULL, TRUE),
  ('2-10', 'Vehicle Running Expenses',
   'IS "VEHICLE RUNNING EXPENSES" (p1 line 14) = 37,929.35. TB APPX 2-10, 74 accounts - including BTFS "BATTERY FORKLIFT (KB)", which is printed on all six TBs with blank debit AND credit and has no section anywhere in the G0 ledger (G1 finding, pending a G3/G4 decision).',
   'cogs', 'income_statement', 'direct_costs', 'debit', 611, NULL, TRUE),

  -- === INCOME STATEMENT :: ADD: OTHER OPERATING INCOME ======================
  ('18-3', 'Other Income',
   'IS "OTHER INCOME" (p1 line 18) = .00. TB APPX 18-3 = ICM OT. Does not exist in the TH catalogue at all - TH files "Other Income" under 18-2.',
   'revenue', 'income_statement', 'other_operating_income', 'credit', 700, NULL, TRUE),
  ('18-2', 'Installation Services',
   'IS "INSTALLATION SERVICES" (p1 line 19) = .00. TB APPX 18-2 = ICM IS. GT/TH COLLISION: public note 18-2 is "Other Income", which in GT is note 18-3.',
   'revenue', 'income_statement', 'other_operating_income', 'credit', 701, NULL, TRUE),

  -- === INCOME STATEMENT :: LESS: ADMINISTRATIVE EXPENSES ====================
  ('5', 'Administrative Expenses (Schedule 5)',
   'IS "(SCHEDULE 5)" (p1 line 23) = 72,111.34. TB APPX 5, 125 accounts. The referenced Schedule 5 is not present in the scanned PDF; G1 reconstructed the total exactly from the APPX 5 accounts.',
   'expense', 'income_statement', 'administrative_expenses', 'debit', 800, NULL, TRUE),

  -- === INCOME STATEMENT :: LESS: FINANCE COSTS ==============================
  ('23', 'Term Loan',
   'IS "TERM LOAN" (p1 line 28, under LESS:FINANCE COSTS) = .00. STATEMENT-ONLY NOTE: no Trial Balance account carries APPX 23 - FC TL is filed under APPX 11. GT/TH COLLISION: public note 23 is "Hire Purchase Interest".',
   'expense', 'income_statement', 'finance_costs', 'debit', 900, NULL, TRUE),

  -- === INCOME STATEMENT :: LESS: TAX EXPENSES ===============================
  ('3', 'Tax Expenses',
   'IS "LESS : TAX EXPENSES" (p1 line 31) = .00. TB APPX 3 = TAX. GT keeps the bare note 3 only; the TH stock sub-notes 3-1..3-7 are not part of the GT catalogue (R5).',
   'expense', 'income_statement', 'tax', 'debit', 1000, NULL, TRUE)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      category = EXCLUDED.category, report_section = EXCLUDED.report_section,
      statement_block = EXCLUDED.statement_block, normal_balance = EXCLUDED.normal_balance,
      sort_order = EXCLUDED.sort_order, parent_note = EXCLUDED.parent_note,
      is_active = EXCLUDED.is_active
  WHERE (greentarget.financial_statement_notes.name,
         greentarget.financial_statement_notes.description,
         greentarget.financial_statement_notes.category,
         greentarget.financial_statement_notes.report_section,
         greentarget.financial_statement_notes.statement_block,
         greentarget.financial_statement_notes.normal_balance,
         greentarget.financial_statement_notes.sort_order,
         greentarget.financial_statement_notes.parent_note,
         greentarget.financial_statement_notes.is_active)
     IS DISTINCT FROM
        (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category,
         EXCLUDED.report_section, EXCLUDED.statement_block, EXCLUDED.normal_balance,
         EXCLUDED.sort_order, EXCLUDED.parent_note, EXCLUDED.is_active);

-- ---------------------------------------------------------------------------
-- 4. greentarget.account_codes
--
--    Clone of public.account_codes. `code` is UNIQUE within this table only, so
--    GT's 69 codes that collide with TH codes (CR_SALES, CH_REV2, CL_TAX,
--    CL_WSF, CA_LC, AC_DR, AC_GST, FD_PBB, the BT*/CR_* families) live here
--    safely with their own meanings - handover section 3b.
--
--    DIVERGENCE FROM TH, deliberate and user-approved: fs_note carries a FOREIGN
--    KEY to greentarget.financial_statement_notes. TH left it unconstrained. GT's
--    catalogue is fully evidenced from six validated Trial Balances plus both
--    statements, so an unknown note means a transcription or mapping error, and
--    G3's chart load should abort loudly rather than silently leak an account
--    out of every financial statement.
--
--    BTFS accommodation: nothing here requires an account to have ledger
--    movement. BTFS "BATTERY FORKLIFT (KB)" can be seeded in G3 as an ordinary
--    row (fs_note '2-10', is_active TRUE) with zero journal lines and zero
--    opening anchor. No schema change is needed for it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.account_codes (
  id          SERIAL       PRIMARY KEY,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  ledger_type VARCHAR(10)  REFERENCES greentarget.ledger_types(code),
  parent_code VARCHAR(50)  REFERENCES greentarget.account_codes(code) ON DELETE SET NULL,
  level       INTEGER      DEFAULT 1,
  sort_order  INTEGER      DEFAULT 0,
  is_active   BOOLEAN      DEFAULT TRUE,
  is_system   BOOLEAN      DEFAULT FALSE,
  notes       TEXT,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  created_by  VARCHAR(50),
  updated_by  VARCHAR(50),
  fs_note     VARCHAR(10)  REFERENCES greentarget.financial_statement_notes(code)
);

CREATE INDEX IF NOT EXISTS idx_gt_account_codes_active      ON greentarget.account_codes (is_active);
CREATE INDEX IF NOT EXISTS idx_gt_account_codes_fs_note     ON greentarget.account_codes (fs_note);
CREATE INDEX IF NOT EXISTS idx_gt_account_codes_ledger_type ON greentarget.account_codes (ledger_type);
CREATE INDEX IF NOT EXISTS idx_gt_account_codes_parent      ON greentarget.account_codes (parent_code);

DROP TRIGGER IF EXISTS update_gt_account_codes_updated_at ON greentarget.account_codes;
CREATE TRIGGER update_gt_account_codes_updated_at
  BEFORE UPDATE ON greentarget.account_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. greentarget.account_codes_hierarchy  --  a VIEW, not a table
--
--    public.account_codes_hierarchy is a VIEW (recursive CTE), so GT's copy is
--    one too. Cloning it as a physical table would create a stale snapshot that
--    G3's 474-code chart load would silently desynchronise from the real chart.
--    Identical definition, re-pointed at greentarget.account_codes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW greentarget.account_codes_hierarchy AS
WITH RECURSIVE account_tree AS (
  SELECT ac.id, ac.code, ac.description, ac.ledger_type, ac.parent_code,
         ac.level, ac.sort_order, ac.is_active, ac.is_system,
         ac.code::text AS path,
         ARRAY[ac.code::text] AS path_array,
         1 AS depth
    FROM greentarget.account_codes ac
   WHERE ac.parent_code IS NULL
  UNION ALL
  SELECT ac.id, ac.code, ac.description, ac.ledger_type, ac.parent_code,
         ac.level, ac.sort_order, ac.is_active, ac.is_system,
         (at.path || ' > '::text) || ac.code::text AS path,
         at.path_array || ac.code::text AS path_array,
         at.depth + 1 AS depth
    FROM greentarget.account_codes ac
    JOIN account_tree at ON ac.parent_code::text = at.code::text
)
SELECT id, code, description, ledger_type, parent_code, level, sort_order,
       is_active, is_system, path, path_array, depth
  FROM account_tree
 ORDER BY path_array;

-- ---------------------------------------------------------------------------
-- 6. greentarget.journal_entries  (full TH column set)
--
--    R3 needs every one of the presentation/provenance columns: display_reference
--    for the printed legacy ref, posting_sequence for within-day print order,
--    source_type='legacy_import' + source_id=staging group key, legacy_entry_type
--    for the decoded journal family, manual_override for detaching a system
--    journal. The partial unique index enforcing ONE posted journal per source is
--    retained verbatim.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.journal_entries (
  id                SERIAL        PRIMARY KEY,
  reference_no      VARCHAR(50)   NOT NULL UNIQUE,
  entry_type        VARCHAR(10)   NOT NULL,
  entry_date        DATE          NOT NULL,
  description       TEXT,
  total_debit       NUMERIC(15,2) DEFAULT 0,
  total_credit      NUMERIC(15,2) DEFAULT 0,
  status            VARCHAR(20)   DEFAULT 'draft',
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  created_by        VARCHAR(50),
  updated_by        VARCHAR(50),
  posted_at         TIMESTAMP,
  posted_by         VARCHAR(50),
  cheque_no         VARCHAR(50),
  display_reference VARCHAR(100),
  posting_sequence  INTEGER,
  source_type       VARCHAR(30),
  source_id         VARCHAR(255),
  legacy_entry_type VARCHAR(10),
  manual_override   BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_gt_journal_entries_date      ON greentarget.journal_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_gt_journal_entries_reference ON greentarget.journal_entries (reference_no);
CREATE INDEX IF NOT EXISTS idx_gt_journal_entries_status    ON greentarget.journal_entries (status);
CREATE INDEX IF NOT EXISTS idx_gt_journal_entries_type      ON greentarget.journal_entries (entry_type);
CREATE INDEX IF NOT EXISTS gt_journal_entries_source_idx    ON greentarget.journal_entries (source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS gt_journal_entries_source_posted_uq
  ON greentarget.journal_entries (source_type, source_id)
  WHERE status = 'posted' AND source_type IS NOT NULL;

DROP TRIGGER IF EXISTS update_gt_journal_entries_updated_at ON greentarget.journal_entries;
CREATE TRIGGER update_gt_journal_entries_updated_at
  BEFORE UPDATE ON greentarget.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. greentarget.journal_entry_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.journal_entry_lines (
  id                SERIAL        PRIMARY KEY,
  journal_entry_id  INTEGER       NOT NULL
                                  REFERENCES greentarget.journal_entries(id) ON DELETE CASCADE,
  line_number       INTEGER       NOT NULL,
  account_code      VARCHAR(50)   NOT NULL REFERENCES greentarget.account_codes(code),
  debit_amount      NUMERIC(15,2) DEFAULT 0,
  credit_amount     NUMERIC(15,2) DEFAULT 0,
  reference         VARCHAR(100),
  particulars       TEXT,
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  cheque_reference  VARCHAR(100),
  display_order     INTEGER,
  display_reference VARCHAR(100),
  CONSTRAINT gt_chk_debit_or_credit CHECK (
    (debit_amount >  0 AND credit_amount =  0) OR
    (debit_amount =  0 AND credit_amount >  0) OR
    (debit_amount =  0 AND credit_amount =  0))
);

CREATE INDEX IF NOT EXISTS idx_gt_journal_entry_lines_account ON greentarget.journal_entry_lines (account_code);
CREATE INDEX IF NOT EXISTS idx_gt_journal_entry_lines_entry   ON greentarget.journal_entry_lines (journal_entry_id);

-- ---------------------------------------------------------------------------
-- 8. greentarget.account_opening_balances
--
--    R4: openings are 2026-01-01 anchors with explicit 0.00 fences for active
--    zero-opening accounts, never a synthetic opening journal. Same anchor
--    semantics as TH: a row at as_of_date <= period start seeds the balance and
--    everything before as_of_date is ignored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.account_opening_balances (
  id           SERIAL        PRIMARY KEY,
  account_code VARCHAR(50)   NOT NULL REFERENCES greentarget.account_codes(code),
  as_of_date   DATE          NOT NULL,
  amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  created_by   VARCHAR(50),
  CONSTRAINT gt_account_opening_balances_unique UNIQUE (account_code, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_gt_account_opening_balances_account
  ON greentarget.account_opening_balances (account_code, as_of_date);

-- ---------------------------------------------------------------------------
-- 9. greentarget.import_legacy_rows
--
--    Auditable staging/provenance for the hash-pinned Jan-Jun 2026 GT legacy
--    ledger import. One change from the TH shape: source_kind accepts
--    GTLD/GTDB/DERIVED instead of THLD/THDB/DERIVED.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greentarget.import_legacy_rows (
  stage_sequence               INTEGER      PRIMARY KEY,
  record_kind                  VARCHAR(20)  NOT NULL,
  source_file                  VARCHAR(255) NOT NULL,
  source_kind                  VARCHAR(20)  NOT NULL,
  source_sha256                CHAR(64)     NOT NULL,
  source_physical_line         INTEGER,
  source_row_index             INTEGER,
  injected_after_physical_line INTEGER,
  legacy_account_code          VARCHAR(50)  NOT NULL,
  account_code                 VARCHAR(50)  NOT NULL,
  account_description          TEXT         NOT NULL,
  entry_date                   DATE         NOT NULL,
  journal_ref                  VARCHAR(100),
  journal_group_key            VARCHAR(255),
  line_display_reference       VARCHAR(100),
  particulars                  TEXT,
  cheque_reference             VARCHAR(100),
  debit_cents                  BIGINT       NOT NULL DEFAULT 0 CHECK (debit_cents  >= 0),
  credit_cents                 BIGINT       NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  running_balance_cents        BIGINT,
  provenance                   VARCHAR(100) NOT NULL,
  repaired                     BOOLEAN      NOT NULL DEFAULT FALSE,
  repair_reason                TEXT,
  special_case                 VARCHAR(100),
  loaded_at                    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gt_import_legacy_rows_record_kind_ck CHECK (
    record_kind IN ('opening', 'transaction')),
  -- GT source files, not TH's
  CONSTRAINT gt_import_legacy_rows_source_kind_ck CHECK (
    source_kind IN ('GTLD', 'GTDB', 'DERIVED')),
  CONSTRAINT gt_import_legacy_rows_one_sided_ck CHECK (
    debit_cents = 0 OR credit_cents = 0),
  CONSTRAINT gt_import_legacy_rows_kind_shape_ck CHECK (
    (record_kind = 'opening'     AND running_balance_cents IS NOT NULL) OR
    (record_kind = 'transaction' AND journal_ref IS NOT NULL AND journal_group_key IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_gt_import_legacy_rows_account
  ON greentarget.import_legacy_rows (account_code, entry_date, stage_sequence);
CREATE INDEX IF NOT EXISTS idx_gt_import_legacy_rows_group
  ON greentarget.import_legacy_rows (entry_date, journal_group_key)
  WHERE record_kind = 'transaction';

-- ---------------------------------------------------------------------------
-- 10. Verification - fail the whole transaction if anything is off
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ledger_types  INTEGER;
  v_entry_types   INTEGER;
  v_notes         INTEGER;
  v_notes_bs      INTEGER;
  v_notes_is      INTEGER;
  v_stray         INTEGER;
  v_th            RECORD;
BEGIN
  SELECT count(*) INTO v_ledger_types FROM greentarget.ledger_types;
  SELECT count(*) INTO v_entry_types  FROM greentarget.journal_entry_types;
  SELECT count(*) INTO v_notes        FROM greentarget.financial_statement_notes;
  SELECT count(*) INTO v_notes_bs     FROM greentarget.financial_statement_notes WHERE report_section = 'balance_sheet';
  SELECT count(*) INTO v_notes_is     FROM greentarget.financial_statement_notes WHERE report_section = 'income_statement';

  IF v_ledger_types <> 6 THEN
    RAISE EXCEPTION 'G2 verify: expected 6 GT ledger types, found %', v_ledger_types;
  END IF;
  IF v_entry_types <> 1 THEN
    RAISE EXCEPTION 'G2 verify: expected 1 GT journal entry type (IMP), found %', v_entry_types;
  END IF;
  IF v_notes <> 34 THEN
    RAISE EXCEPTION 'G2 verify: expected 34 GT financial statement notes, found %', v_notes;
  END IF;
  IF v_notes_bs <> 16 OR v_notes_is <> 18 THEN
    RAISE EXCEPTION 'G2 verify: expected 16 balance-sheet / 18 income-statement notes, found % / %',
      v_notes_bs, v_notes_is;
  END IF;

  -- No stock note, no CoGM note, no "DN" printer marker may exist in GT.
  SELECT count(*) INTO v_stray FROM greentarget.financial_statement_notes
   WHERE code IN ('3-1','3-2','3-3','3-4','3-5','3-6','3-7',
                  '14-1','14-2','14-3','5-1','18-1','DN','14','18');
  IF v_stray <> 0 THEN
    RAISE EXCEPTION 'G2 verify: % note(s) that must not exist in the GT catalogue are present', v_stray;
  END IF;

  -- The three GT/TH semantic collisions must be encoded the GT way.
  IF NOT EXISTS (SELECT 1 FROM greentarget.financial_statement_notes
                  WHERE code = '9' AND category = 'asset' AND normal_balance = 'debit'
                    AND statement_block = 'current_assets') THEN
    RAISE EXCEPTION 'G2 verify: GT note 9 must be a debit asset inside current_assets';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM greentarget.financial_statement_notes
                  WHERE code = '18-2' AND name = 'Installation Services') THEN
    RAISE EXCEPTION 'G2 verify: GT note 18-2 must be "Installation Services"';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM greentarget.financial_statement_notes
                  WHERE code = '23' AND name = 'Term Loan' AND statement_block = 'finance_costs') THEN
    RAISE EXCEPTION 'G2 verify: GT note 23 must be "Term Loan" under finance_costs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM greentarget.financial_statement_notes
                  WHERE code = '12' AND statement_block = 'long_term_liabilities') THEN
    RAISE EXCEPTION 'G2 verify: GT note 12 must sit in the long_term_liabilities block';
  END IF;

  -- G2 loads no data. G3/G4 do.
  IF (SELECT count(*) FROM greentarget.account_codes)             <> 0
  OR (SELECT count(*) FROM greentarget.journal_entries)           <> 0
  OR (SELECT count(*) FROM greentarget.journal_entry_lines)       <> 0
  OR (SELECT count(*) FROM greentarget.account_opening_balances)  <> 0
  OR (SELECT count(*) FROM greentarget.import_legacy_rows)        <> 0 THEN
    RAISE EXCEPTION 'G2 verify: G2 must leave the GT data tables empty; G3/G4 populate them';
  END IF;

  -- The hierarchy view must be queryable (it returns 0 rows on an empty chart).
  PERFORM count(*) FROM greentarget.account_codes_hierarchy;

  -- ZERO IMPACT ON TIEN HOCK.
  SELECT * INTO v_th FROM g2_th_baseline;
  IF (SELECT count(*) FROM public.account_codes)             <> v_th.account_codes
  OR (SELECT count(*) FROM public.journal_entries)           <> v_th.journal_entries
  OR (SELECT count(*) FROM public.journal_entry_lines)       <> v_th.journal_entry_lines
  OR (SELECT count(*) FROM public.financial_statement_notes) <> v_th.fs_notes
  OR (SELECT count(*) FROM public.account_opening_balances)  <> v_th.opening_balances THEN
    RAISE EXCEPTION 'G2 verify: a public/Tien Hock accounting table changed - aborting';
  END IF;

  RAISE NOTICE 'G2 OK: 8 tables + 1 view in schema greentarget; % ledger types, % entry type(s), % notes (% BS / % IS); TH tables unchanged.',
    v_ledger_types, v_entry_types, v_notes, v_notes_bs, v_notes_is;
END $$;

COMMIT;

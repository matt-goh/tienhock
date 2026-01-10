# Financial Statements Account Code Mapping Guide

## Current Status

**MAPPING COMPLETE:** All account codes have been assigned to financial statement notes.

```
Total Active Account Codes: 2,754
Account Codes with fs_note assigned: 2,754 (100%)
```

Last bulk mapping performed: **January 2026**

---

## How the Financial Reports Work

### Data Flow
1. **Journal Entries** → `journal_entry_lines` table stores debit/credit amounts per account code
2. **Account Codes** → `account_codes.fs_note` column maps each account to a financial statement note
3. **Financial Statement Notes** → `financial_statement_notes` table defines report line items
4. **Reports** → Backend aggregates journal entries by `fs_note` to generate reports
5. **Invoice-Based Overrides** → Note 22 & Note 7 are calculated directly from `invoices` table

### Key Tables
- `account_codes` - Contains `fs_note` column linking to financial statement notes
- `financial_statement_notes` - Defines 33 report line items with category/section
- `journal_entry_lines` - Transaction data with debit/credit amounts
- `invoices` - Source for Trade Receivables (Note 22) and Revenue (Note 7)

---

## Financial Statement Notes Reference (33 Notes)

### Balance Sheet - Assets (9 notes)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **4** | Property, Plant & Equipment | Fixed assets, vehicles, machinery, accumulated depreciation | 25 |
| **6** | Cash in Hand | Petty cash, cash on hand | 2 |
| **8** | Prepayments & Deposits | Prepaid expenses, deposits paid | 31 |
| **14-1** | Closing Stock (Finished Goods) | Finished product inventory | 108 |
| **14-2** | Closing Stock (Raw Materials) | Raw material inventory | 22 |
| **14-3** | Closing Stock (Packing Materials) | Packing material inventory | 10 |
| **17** | Input Tax | GST/SST input tax claimable | 0 |
| **19** | Cash at Bank | Bank balances | 4 |
| **22** | Trade Receivables | Customer receivables (all TD accounts) | 1,511 |

### Balance Sheet - Liabilities (7 notes)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **1** | Accruals | Accrued expenses (salaries, EPF, SOCSO) | 22 |
| **9** | Amount Due to Director | Director loans/advances | 6 |
| **10** | Other Creditors | Non-trade payables | 1 |
| **11** | Term Loans | Long-term bank loans (non-current) | 0 |
| **12** | Taxation | Tax payable | 1 |
| **13** | Trade Payables | Supplier payables (all TC accounts) | 82 |
| **16** | Hire Purchase Payable | HP liability (non-current) | 34 |

### Balance Sheet - Equity (2 notes)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **20** | Retained Profit B/F | Brought forward profits | 2 |
| **21** | Share Capital | Issued share capital | 1 |

### Income Statement - Revenue (3 notes)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **7** | Revenue/Sales | Product sales | 8 |
| **18-1** | Gain on Disposal of PPE | Asset disposal gains | 0 |
| **18-2** | Other Income | Miscellaneous income | 2 |

### Income Statement - Expenses (4 notes)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **3** | Tax Expenses | Income tax expense | 0 |
| **5** | Administrative Expenses | Office/admin salaries, vehicle expenses | 537 |
| **15** | Depreciation | Depreciation expense | 2 |
| **23** | Hire Purchase Interest | HP interest expense | 30 |

### COGM - Cost of Goods Manufactured (8 notes)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **3-1** | Opening Stock (Finished Products) | Finished goods opening stock | 109 |
| **3-2** | Purchases (Packing Material) | Packing purchases | 8 |
| **3-3** | Opening Stock (Raw Materials) | Raw material opening stock | 24 |
| **3-4** | Purchase of Chemical | Chemical purchases | 0 |
| **3-5** | Purchase of Raw Material | Raw material purchases | 20 |
| **3-6** | Freight & Transportation | Freight in on materials | 1 |
| **3-7** | Opening Stock (Packing Material) | Packing opening stock | 10 |
| **5-1** | Factory Worker Salaries | Factory labor costs | 140 |

---

## Mapping Rules Applied

### By Ledger Type
| Ledger Type | Note | Logic |
|-------------|------|-------|
| **TD** (Trade Debtor) | 22 | All 1,511 customer accounts → Trade Receivables |
| **TC** (Trade Creditor) | 13 | All 82 supplier accounts → Trade Payables |
| **BK** (Bank) | 19 | All 4 bank accounts → Cash at Bank |
| **CS** (Closing Stock) | 14-1/14-2/14-3 | Split by product type (finished/raw/packing) |
| **OS** (Opening Stock) | 3-1/3-3/3-7 | Split by product type (finished/raw/packing) |
| **GL** (General Ledger) | Various | See pattern-based rules below |

### GL Account Patterns
| Pattern | Note | Description |
|---------|------|-------------|
| `CASH*` | 6 | Cash in Hand |
| `SLS*`, `SL_*` | 7 | Revenue/Sales |
| `ACC*`, `AC_*`, `ACW*`, `ACD*` | 1 | Accruals |
| `HPA_*` | 16 | Hire Purchase Principal |
| `HPB_*`, `HPI` | 23 | Hire Purchase Interest |
| `AD_*`, `CAR`, `E`, `FV`, `LRY`, `PPE` | 4 | Property, Plant & Equipment |
| `DPE`, `AE_DEP` | 15 | Depreciation |
| `CA_*` | 8 | Prepayments & Deposits |
| `DR*` | 9 | Amount Due to Director |
| `PU_*`, `PUR_*`, `RAW` | 3-5 | Purchase of Raw Materials |
| `PM*`, `PACKING` | 3-2 | Purchase of Packing Materials |
| `FT` | 3-6 | Freight & Transportation |
| `BS_*`, `MS_*`, `MB*` (factory) | 5-1 | Factory Worker Salaries |
| `AE_*`, `SAL*`, `SW`, vehicle codes | 5 | Administrative Expenses |
| `SC` | 21 | Share Capital |
| `RP`, `RP_MTH` | 20 | Retained Profit |

---

## Maintenance Guide

### Adding New Account Codes
When creating a new account code, assign the appropriate `fs_note`:

1. **Determine the account type:**
   - Asset, Liability, Equity, Revenue, or Expense?

2. **Find the matching note:**
   - Refer to the tables above
   - Use the ledger type rules first
   - Then check pattern matching

3. **Update via SQL or UI:**
   ```sql
   UPDATE account_codes SET fs_note = 'XX' WHERE code = 'NEW_CODE';
   ```

### Bulk Re-mapping
If notes need to be re-assigned in bulk:

```sql
-- Clear existing mappings for a ledger type
UPDATE account_codes SET fs_note = NULL WHERE ledger_type = 'GL';

-- Re-apply mappings (use the scripts in this section)
```

### Verifying Mappings
```sql
-- Check unmapped accounts
SELECT code, description, ledger_type
FROM account_codes
WHERE is_active = true AND fs_note IS NULL;

-- Count by note
SELECT fs_note, COUNT(*) as count
FROM account_codes
WHERE is_active = true AND fs_note IS NOT NULL
GROUP BY fs_note
ORDER BY fs_note;
```

---

## Troubleshooting

### Reports Show No Data
1. **Check fs_note assignments:**
   ```sql
   SELECT COUNT(*) as total, COUNT(fs_note) as mapped
   FROM account_codes WHERE is_active = true;
   ```

2. **Check journal entries exist:**
   ```sql
   SELECT COUNT(*) FROM journal_entry_lines
   WHERE entry_date BETWEEN '2025-01-01' AND '2025-01-31';
   ```

3. **Check note definitions:**
   ```sql
   SELECT * FROM financial_statement_notes ORDER BY sort_order;
   ```

### Balance Sheet Doesn't Balance
- Check that all asset accounts have asset notes (4, 6, 8, 14-*, 17, 19, 22)
- Check that liability accounts have liability notes (1, 9, 10, 11, 12, 13, 16)
- Check that equity accounts have equity notes (20, 21)
- Verify accumulated depreciation (AD_*) is under Note 4 (contra-asset)

### Missing Categories in Reports
- Ensure `financial_statement_notes` table has all 33 notes seeded
- Check the `category` and `report_section` columns are correct

---

## SQL Scripts for Full Re-mapping

If you need to completely re-apply all mappings from scratch:

```sql
-- STEP 1: Clear all existing mappings
UPDATE account_codes SET fs_note = NULL;

-- STEP 2: Map by ledger type
UPDATE account_codes SET fs_note = '22' WHERE ledger_type = 'TD';
UPDATE account_codes SET fs_note = '13' WHERE ledger_type = 'TC';
UPDATE account_codes SET fs_note = '19' WHERE ledger_type = 'BK';

-- STEP 3: Map Closing Stock (CS)
UPDATE account_codes SET fs_note = '14-1' WHERE ledger_type = 'CS' AND (code LIKE '%FIN%' OR code = 'CS');
UPDATE account_codes SET fs_note = '14-2' WHERE ledger_type = 'CS' AND fs_note IS NULL AND (code LIKE '%BER%' OR code LIKE '%JAG%' OR code LIKE '%SAG%' OR code LIKE '%SDM%' OR code LIKE '%TH%' OR code LIKE '%CHEM%');
UPDATE account_codes SET fs_note = '14-3' WHERE ledger_type = 'CS' AND fs_note IS NULL AND (code LIKE '%PM%' OR code LIKE '%TAP%');
UPDATE account_codes SET fs_note = '14-1' WHERE ledger_type = 'CS' AND fs_note IS NULL;

-- STEP 4: Map Opening Stock (OS)
UPDATE account_codes SET fs_note = '3-1' WHERE ledger_type = 'OS' AND (code LIKE '%FIN%' OR code = 'OS');
UPDATE account_codes SET fs_note = '3-3' WHERE ledger_type = 'OS' AND fs_note IS NULL AND (code LIKE '%BER%' OR code LIKE '%JAG%' OR code LIKE '%SAG%' OR code LIKE '%SDM%' OR code LIKE '%TH%' OR code LIKE '%CHEM%');
UPDATE account_codes SET fs_note = '3-7' WHERE ledger_type = 'OS' AND fs_note IS NULL AND (code LIKE '%PM%' OR code LIKE '%TAP%');
UPDATE account_codes SET fs_note = '3-1' WHERE ledger_type = 'OS' AND fs_note IS NULL;

-- STEP 5: Map GL - Revenue & Equity
UPDATE account_codes SET fs_note = '7' WHERE ledger_type = 'GL' AND code IN ('SLS', 'SL_MBH', 'SL_THJ', 'CASH_SALES', 'SLS_B', 'SLS_M', 'SLS_SC');
UPDATE account_codes SET fs_note = '6' WHERE ledger_type = 'GL' AND code LIKE 'CASH%';
UPDATE account_codes SET fs_note = '21' WHERE ledger_type = 'GL' AND code = 'SC';
UPDATE account_codes SET fs_note = '20' WHERE ledger_type = 'GL' AND code IN ('RP', 'RP_MTH');

-- STEP 6: Map GL - Liabilities
UPDATE account_codes SET fs_note = '1' WHERE ledger_type = 'GL' AND (code LIKE 'ACC%' OR code LIKE 'AC\_%' OR code LIKE 'ACW%' OR code LIKE 'ACD%');
UPDATE account_codes SET fs_note = '16' WHERE ledger_type = 'GL' AND code LIKE 'HPA\_%';
UPDATE account_codes SET fs_note = '23' WHERE ledger_type = 'GL' AND (code LIKE 'HPB\_%' OR code = 'HPI');

-- STEP 7: Map GL - Assets & Depreciation
UPDATE account_codes SET fs_note = '15' WHERE ledger_type = 'GL' AND (code = 'DPE' OR code = 'AE_DEP');
UPDATE account_codes SET fs_note = '4' WHERE ledger_type = 'GL' AND fs_note IS NULL AND (code LIKE 'AD\_%' OR code IN ('CAR', 'E', 'FV', 'LRY', 'PPE') OR code LIKE 'BE\_%' OR code LIKE 'BL\_%');
UPDATE account_codes SET fs_note = '8' WHERE ledger_type = 'GL' AND fs_note IS NULL AND code LIKE 'CA\_%';

-- STEP 8: Map GL - COGM
UPDATE account_codes SET fs_note = '3-5' WHERE ledger_type = 'GL' AND fs_note IS NULL AND (code LIKE 'PU\_%' OR code LIKE 'PUR\_%' OR code = 'RAW');
UPDATE account_codes SET fs_note = '3-2' WHERE ledger_type = 'GL' AND fs_note IS NULL AND (code LIKE 'PM\_%' OR code = 'PM' OR code = 'PACKING');
UPDATE account_codes SET fs_note = '3-6' WHERE ledger_type = 'GL' AND fs_note IS NULL AND code = 'FT';

-- STEP 9: Map GL - Factory Labor (COGM)
UPDATE account_codes SET fs_note = '5-1' WHERE ledger_type = 'GL' AND fs_note IS NULL AND (code LIKE 'BS\_%' OR code LIKE 'BSC\_%' OR code LIKE 'BSIP\_%' OR code LIKE 'BRM%' OR code LIKE 'MS\_%' OR code LIKE 'MSC\_%' OR code LIKE 'MSIP\_%' OR code LIKE 'MRM%' OR code LIKE 'MB%');

-- STEP 10: Map GL - Admin Expenses
UPDATE account_codes SET fs_note = '5' WHERE ledger_type = 'GL' AND fs_note IS NULL AND (code LIKE 'AE\_%' OR code LIKE 'SAL%' OR code = 'SW' OR code LIKE 'CAR\_%' OR code LIKE 'LRY\_%' OR code LIKE 'FV\_%' OR code LIKE 'E\_%' OR code LIKE 'R\_%' OR code LIKE 'SV\_%' OR code LIKE 'TAX\_%' OR code LIKE 'PT\_%' OR code IN ('EN', 'EPF', 'SOCSO', 'SIP', 'EW', 'REN', 'PS', 'LC', 'LP', 'DON', 'SF', 'SS', 'SM', 'SA', 'SAF', 'ST', 'SU', 'SUN', 'BC', 'BK', 'ADV', 'SEC', 'WP', 'PEN', 'LEV', 'LEVY', 'BLEV'));

-- STEP 11: Map GL - Director & Others
UPDATE account_codes SET fs_note = '12' WHERE ledger_type = 'GL' AND fs_note IS NULL AND code IN ('TAX_CP', 'TAX_IT', 'DF_TAX');
UPDATE account_codes SET fs_note = '9' WHERE ledger_type = 'GL' AND fs_note IS NULL AND code LIKE 'DR%';
UPDATE account_codes SET fs_note = '18-2' WHERE ledger_type = 'GL' AND fs_note IS NULL AND code LIKE 'CH\_%';
UPDATE account_codes SET fs_note = '7' WHERE ledger_type = 'GL' AND fs_note IS NULL AND code IN ('RETURN', 'BRET');

-- STEP 12: Catch-all for remaining GL accounts
UPDATE account_codes SET fs_note = '5' WHERE ledger_type = 'GL' AND fs_note IS NULL;

-- STEP 13: Catch-all for any remaining
UPDATE account_codes SET fs_note = '5' WHERE is_active = true AND fs_note IS NULL;
```

---

## Data Sources by Note

This section documents where each financial statement note gets its data from.

---

### AUTOMATED (Already Working)

**Note 1 - Accruals**
- Source: Payroll Voucher System
- Voucher types: `JVSL` (salary), `JVDR` (director)
- Account codes: ACW_*, ACD_* (salary, EPF, SOCSO, SIP, PCB accruals)

**Note 5-1 - Factory Worker Salaries**
- Source: Payroll Voucher System
- Same vouchers as above
- Account codes: BS_*, MS_*, MB* (factory labor by section)

**Note 22 - Trade Receivables** ✅ IMPLEMENTED
- Source: `invoices` table (direct calculation, bypasses journal entries)
- Calculation: `SUM(balance_due)` from unpaid/overdue invoices
- Filter: `invoice_status IN ('Unpaid', 'Overdue') AND balance_due > 0.01`
- Date logic: Cumulative - all outstanding invoices up to period end date
- Implementation: `getTradeReceivables()` in `financial-reports.js`

**Note 7 - Revenue/Sales** ✅ IMPLEMENTED
- Source: `invoices` table (direct calculation, bypasses journal entries)
- Calculation: `SUM(total_excluding_tax)` from all invoices (accrual basis)
- Date logic: YTD - from January 1 to end of selected month
- Implementation: `getRevenue()` in `financial-reports.js`

---

### SHOULD BE AUTOMATED (Data Exists, Needs Implementation)

**Note 19 - Cash at Bank**
- Expected source: `payments` table
- Current data: 0 completed payments
- Needs: Payment → Journal Entry system

**Note 13 - Trade Payables**
- Expected source: Supplier invoices/purchases
- Current data: No automated system
- Needs: AP module or manual entry

**Notes 14-1, 14-2, 14-3 - Closing Stock**
- Expected source: `production_entries`, `stock_adjustments`
- Current data: 0 records
- Needs: Stock valuation → Journal Entry at period end

**Notes 3-1, 3-3, 3-7 - Opening Stock**
- Expected source: Previous period closing stock
- Current data: 0 records
- Needs: Period-end closing process

---

### NEEDS CLARIFICATION (Ask Coworker)

**Assets:**
- **Note 4** - Property, Plant & Equipment: How are fixed asset purchases recorded?
- **Note 6** - Cash in Hand: Is there a petty cash module?
- **Note 8** - Prepayments & Deposits: How are deposits tracked?

**Liabilities:**
- **Note 9** - Amount Due to Director: Are director loans tracked separately?
- **Note 10** - Other Creditors: What goes here? Staff loans?
- **Note 11** - Term Loans: Is there a loan tracking module?
- **Note 12** - Taxation: How is tax computed and recorded?
- **Note 16** - Hire Purchase Payable: Is there an HP tracking module?
- **Note 23** - Hire Purchase Interest: Same as above

**Expenses:**
- **Note 5** - Administrative Expenses: What are the sources? Petty cash? AP?
- **Note 15** - Depreciation: Calculated automatically or manually?
- **Notes 3-2, 3-5** - Purchases (Packing/Raw Material): How are purchases recorded?
- **Note 3-6** - Freight & Transportation: How is freight-in recorded?

**Other:**
- **Note 18-1** - Gain on Disposal of PPE: How are asset disposals handled?
- **Note 18-2** - Other Income: What counts as other income?
- **Note 20** - Retained Profit B/F: Manual or automated year-end closing?
- **Note 21** - Share Capital: Static or does it change?

---

### Implementation Priority

**Completed** ✅:
1. ~~Invoices → Trade Receivables + Revenue~~ - **DONE** (Note 22 & Note 7 now pull directly from invoices)

**High Priority** (data waiting to be converted):
2. Payments → Cash/Bank (Note 19)

**Medium Priority** (needs stock system first):
3. Stock entries → Closing/Opening Stock
4. Production → COGM entries

**Lower Priority** (likely manual):
5. Fixed asset purchases
6. Purchases/AP
7. Petty cash
8. Depreciation

---

## Report Locations

| Report | Route | Page File |
|--------|-------|-----------|
| Trial Balance | `/accounting/reports/trial-balance` | `TrialBalancePage.tsx` |
| Income Statement | `/accounting/reports/income-statement` | `IncomeStatementPage.tsx` |
| Balance Sheet | `/accounting/reports/balance-sheet` | `BalanceSheetPage.tsx` |
| COGM | `/accounting/reports/cogm` | `CogmPage.tsx` |

Backend API: `src/routes/accounting/financial-reports.js`

---

## Date Range Logic

All financial reports now use **Year-to-Date (YTD)** date ranges:

| Selected Month | Data Range |
|----------------|------------|
| August 2025 | January 1, 2025 → August 31, 2025 |
| December 2025 | January 1, 2025 → December 31, 2025 |

- **Trial Balance**: YTD journal entries + invoice-based Note 22 & Note 7
- **Income Statement**: YTD revenue/expenses, Note 7 from invoices
- **Balance Sheet**: YTD balances, Note 22 from invoices (cumulative outstanding)
- **COGM**: YTD cost of goods manufactured

---

*Last Updated: January 2026*
*All 2,754 account codes mapped*
*Note 22 (Trade Receivables) and Note 7 (Revenue) now automated from invoices*

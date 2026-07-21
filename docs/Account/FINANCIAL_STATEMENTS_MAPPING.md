# Financial Statements Account Code Mapping Guide

## Current Status

**MAPPING COMPLETE (legacy-report V2 verified on development 20 Jul 2026):** every active account has an effective `fs_note`. The 8 Jul base remap is followed by the exact 125-change V2 override proved against the printed APPX column (94 stock-family and 31 non-stock changes across 156 audited accounts).

The original January 2026 bulk mapping was **lost in a dev-DB refresh** (only 2 codes still had `fs_note`), which left the Income Statement / Balance Sheet / CoGM completely empty. The mapping was re-applied on 8 Jul 2026 with the corrected base script [`dev/migrations/fs_note_remap_2026-07.sql`](../../dev/migrations/fs_note_remap_2026-07.sql). The scan-evidenced exceptions are now owned by [`dev/migrations/2026-07-20_legacy_report_v2_opening_stock.sql`](../../dev/migrations/2026-07-20_legacy_report_v2_opening_stock.sql); do not re-run the base remap over that final state. Both migrations fail closed on unreviewed drift. Corrections vs the old script embedded in earlier versions of this doc:

- `MB*` admin-by-nature codes and vehicle codes → Note **5**, not 5-1 (per the legacy prefix table in [LEGACY_SYSTEM_REFERENCE.md](LEGACY_SYSTEM_REFERENCE.md)); only factory-section salary codes (suffix `_MM/_PM/_MB/_PB/_JB/_K`) + `THJ_*` → **5-1**.
- `CASH% → 6` no longer clobbers `CASH_SALES` (revenue); `CR_SALES` added to Note 7.
- `CH_REV1`/`CH_REV2` (cash-method receipt holding accounts = cash received, not yet banked) → Note **6**, not 18-2.
- Taxation codes (`TAX_CP`, `TAX_IT`, `CL_TAX`) tagged Note 12 *before* the vehicle road-tax `TAX_%` → 5 rule; `DF_TAX` → Note 1 (legacy BS convention).
- `CL_*` family handled: `CL_WSF`/`CL_GTH` → 9, `CL_PB%`/`CL_SCB`/`CL_LOAN` → 11, other `CL_%`/`OC_%`/`CUST_DEP` → 10.
- Lean-GL codes added: `TP`/`CL_TP` → 13, `PUR%` → 3-5, `NCA_%` → 4, `DEBTOR` → 22, `OP` (Overseas Purchases, used by GP journals) → 5 ⚠️ *provisional — confirm with the user whether GP overseas purchases belong in admin expenses (5) or raw-material purchases (3-5)*.
- `BE_%`/`BL_%` are payroll codes (EPF/Levy per section), removed from the old PPE (Note 4) rule.

---

## How the Financial Reports Work

### Data Flow
1. **Journal Entries** → `journal_entry_lines` table stores debit/credit amounts per account code
2. **Account Codes** → `account_codes.fs_note` column maps each account to a financial statement note
3. **Financial Statement Notes** → `financial_statement_notes` table defines report line items
4. **Effective Note Inheritance** → a child account without its own `fs_note` inherits the nearest ancestor's note
5. **As-of Reports** → Trial Balance and Balance Sheet use the latest account opening anchor on or before period end, plus posted movement from the anchor date
6. **Profit-and-loss Reports** → Income Statement and Current Year Profit add exact 1 January opening-stock anchors for Notes 3-1/3-3/3-7 once to posted YTD movement; CoGM adds only Notes 3-3/3-7. Later anchors never replace fiscal opening stock

### Key Tables
- `account_codes` - Contains `fs_note` column linking to financial statement notes
- `financial_statement_notes` - Defines 33 report line items with category/section
- `journal_entry_lines` - Transaction data with debit/credit amounts
- `journal_entries` - Supplies posting status and accounting date
- `account_opening_balances` - Signed DR-positive anchors used by Trial Balance/Balance Sheet and, only for exact fiscal-year opening-stock notes, the Income Statement/Current Year Profit/CoGM

---

## Financial Statement Notes Reference (33 Notes)

### Balance Sheet - Assets (9 notes)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **4** | Property, Plant & Equipment | Fixed assets, vehicles, machinery, accumulated depreciation | 25 |
| **6** | Cash in Hand | Petty cash, cash on hand | 2 |
| **8** | Prepayments & Deposits | Prepaid expenses, deposits paid | 31 |
| **14-1** | Closing Stock (Finished Goods) | Finished product inventory | 61 |
| **14-2** | Closing Stock (Raw Materials) | Raw material inventory | 27 |
| **14-3** | Closing Stock (Packing Materials) | Packing material inventory | 52 |
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

### Income Statement - Opening Finished Goods (1 note)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **3-1** | Opening Stock (Finished Products) | Finished goods opening stock included in cost of sales | 62 |

### COGM - Cost of Goods Manufactured (7 notes)

| Note | Name | Description | Mapped Count |
|------|------|-------------|--------------|
| **3-2** | Purchases (Packing Material) | Packing purchases | 8 |
| **3-3** | Opening Stock (Raw Materials) | Raw material opening stock | 29 |
| **3-4** | Purchase of Chemical | Chemical purchases | 0 |
| **3-5** | Purchase of Raw Material | Raw material purchases | 20 |
| **3-6** | Freight & Transportation | Freight in on materials | 1 |
| **3-7** | Opening Stock (Packing Material) | Packing opening stock | 52 |
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
| `HPA_*`, `HPB`, `CL_HPB`, `HPB_*` | 16 | Hire Purchase principal/payable and paired interest in suspense |
| `HPI` | 23 | Released Hire Purchase Interest expense |
| `AD_*`, `CAR`, `E`, `FV`, `LRY`, `PPE` | 4 | Property, Plant & Equipment |
| `DPE`, `AE_DEP` | 15 | Depreciation |
| `CA_*` | 8 | Prepayments & Deposits |
| `DR*` | 9 | Amount Due to Director |
| `PU_*`, `PUR*`, `RAW` | 3-5 | Purchase of Raw Materials (`PU_CHEM`/`PU_MBCHEM` → 3-4) |
| `PM`, `PM_*`, `PACKING` | 3-2 | Purchase of Packing Materials |
| `FT`, `BFT_*` | 3-6 | Freight & Transportation |
| Salary-family prefixes with factory suffix `_MM/_PM/_MB/_PB/_JB/_K`, plus `THJ_*` | 5-1 | Factory Worker Salaries (mesin/packing mee+bihun, jaga boiler, kilang) |
| `MB*` (admin by nature), `AE_*`, `SAL*`, `SW`, vehicle codes (`BT*/OIL*/R*/SV*/TAX*/TY*/INS*/PT*`) | 5 | Administrative Expenses |
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

The complete, corrected re-mapping script lives at [`dev/migrations/fs_note_remap_2026-07.sql`](../../dev/migrations/fs_note_remap_2026-07.sql) — idempotent, wrapped in a transaction, ends with a per-note count for verification. Run with:

```bash
docker exec -i tienhock_dev_db psql -U postgres -d tienhock < dev/migrations/fs_note_remap_2026-07.sql
```

Do **not** copy SQL from older versions of this doc — the pre-Jul-2026 embedded script had ordering bugs (`CASH%` clobbered `CASH_SALES`, `TAX_%` → 5 ran before taxation codes) and mis-bucketed `MB*` under 5-1 and `BE_%/BL_%` under Note 4.

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
- Source: effective-Note-22 account balances (the per-customer TD children)
- Calculation: latest signed opening anchor on or before period end + posted debits/credits from the anchor date
- Unanchored accounts: posted movement from 1 January to period end
- Includes invoice, receipt and adjustment journals; current invoice status is not a report override

**Note 7 - Revenue/Sales** ✅ IMPLEMENTED
- Source: posted journal lines on effective-Note-7 accounts
- Calculation: credit movement less debit movement (sales less posted adjustments)
- Date logic: YTD - from January 1 to end of selected month
- Used consistently by the Trial Balance, Income Statement and Current Year Profit calculation

---

### AUTOMATED SINCE (status 8 Jul 2026)

**Note 19 - Cash at Bank** ✅ — `REC` receipt journals (customer payments), `PAY` supplier payments, `B`/PBE payroll bank payments, manual `J`/`C` entries.

**Note 13 - Trade Payables** ✅ — `PUR` material purchase invoices and `GP` general purchases credit `TP`/`CR_*`; `PAY` supplier payments debit them.

**Notes 3-2 / 3-5 - Purchases (Packing / Raw Material)** ✅ — `PUR` journals debit the purchase account by material category (`material_purchase_account_mappings`).

**Notes 1 / 5 / 5-1 - Accruals & salaries** ✅ — `JVSL`/`JVDR` monthly payroll vouchers.

### STILL NOT AUTOMATED (report gaps)

**Notes 14-1/14-2/14-3 (Closing Stock)** ✅ — exact-month values are keyed in `closing_stock_values` via the Material Stock page "Closing Stock (Financial Statements)" card and injected at report level (BS 14-* assets plus Current Year Profit; IS all three as negative cogs; CoGM 14-2/14-3), never a GL posting. May 2026 is seeded from the legacy scans (188,979.60 / 336,909.82 / 182,194.43). The evidenced 2026 opening values in Notes 3-1/3-3/3-7 are included from exact 1 January anchors. (Phase V3, 21 Jul 2026 — development; production pending.)

**Note 4 (PPE) / Note 15 (Depreciation)** — needs the fixed-asset register (gap 1A-4).

**Note 23 (HP Interest) / Note 16 (HP Payable)** — `HPI` records released
finance cost in Note 23. `HPA_*` principal and the paired `HPB_*` interest in
suspense remain together in Balance Sheet Note 16. The full HP schedule is
still needed (gap 1A-6); currently only manual journals exist.

**Notes 20/21 (Retained Profit, Share Capital)** — pure opening-balance items read through the Balance Sheet anchor engine.

**Note 3 (Tax Expenses), 3-6 (Freight In), 18-1/18-2 (Other income)** — manual journals only.

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
1. Notes 22 and 7 are derived from posted journals, with no invoice-table override
2. Trial Balance and Balance Sheet use the latest applicable opening anchor per account
3. Income Statement and Balance Sheet Current Year Profit include exact 1 January opening stock for Notes 3-1/3-3/3-7; CoGM includes 3-3/3-7 only
4. The May 2026 Balance Sheet is balanced with keyed monthly closing stock (V3, 21 Jul 2026: exact-month `closing_stock_values` injected at report level, never a GL posting)

**Medium Priority** (needs stock system first):
5. Stock entries → monthly Closing Stock
6. Production → COGM entries

**Lower Priority** (likely manual):
7. Fixed asset purchases
8. Purchases/AP
9. Petty cash
10. Depreciation

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

Income Statement and CoGM use **Year-to-Date (YTD)** movement:

| Selected Month | Data Range |
|----------------|------------|
| August 2025 | January 1, 2025 → August 31, 2025 |
| December 2025 | January 1, 2025 → December 31, 2025 |

- **Trial Balance**: for each account, latest anchor with `as_of_date <= period_end` + posted movement in `[anchor_date, period_end]`; an unanchored account uses `[January 1, period_end]`. Anchor-only and explicit zero-fence accounts remain in the unfiltered result.
- **Income Statement**: posted YTD revenue, CoGM and expense movement grouped by effective `fs_note`, plus exact `YYYY-01-01` opening-stock anchors for Notes 3-1/3-3/3-7 once.
- **Balance Sheet**: the same per-account anchor rule as Trial Balance, rolled up by effective `fs_note`. Equity also includes a no-note **Current Year Profit** line calculated from the same YTD Income Statement/CoGM movement plus exact Notes 3-1/3-3/3-7 fiscal opening stock.
- **COGM**: posted YTD cost-of-goods-manufactured movement plus exact `YYYY-01-01` opening-stock anchors for Notes 3-3/3-7 once. Finished-goods opening Note 3-1 is excluded.

Anchors represent the balance at the **start** of `as_of_date`, so movement on the anchor date is included. For TB/BS account balances, a later anchor fences off all earlier anchors and journal activity for that account. For the profit-and-loss opening-stock calculation, only the exact fiscal-year start is read; a later checkpoint is deliberately ignored.

---

*Last Updated: 20 Jul 2026 — development includes the guarded legacy-report V2 opening-stock anchors, exact APPX overrides and narrow fiscal-opening report semantics. Production rollout remains separately approved. Per-note "Mapped Count" figures above remain approximate.*

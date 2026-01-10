# Fresh Accounting System Plan

## Overview

**Decision:** Create a fresh, simplified accounting system instead of migrating the old complex system.

**Rationale:**
- Old system has 2,754 account codes to produce ~25 line items in financial statements (100:1 complexity ratio)
- Per-product stock codes (140+), per-vehicle expense codes, per-supplier creditor codes are unnecessary
- Manual journal vouchers required for every payment, stock entry, etc.
- New system should focus on **statement outputs**, not replicating old complexity

**Goal:** ~50 account codes with automated data flows from existing ERP tables

---

## What Already Works (KEEP)

| Component | Status | Notes |
|-----------|--------|-------|
| Journal Entry System | Working | Solid validation, double-entry, workflow |
| Financial Statement Notes | Working | 33 notes defined, hierarchy in place |
| Note 22 (Trade Receivables) | Automated | Pulls from `invoices.balance_due` |
| Note 7 (Revenue/Sales) | Automated | Pulls from `invoices.total_excluding_tax` |
| Note 1 (Accruals) | Semi-automated | From payroll vouchers (JVSL, JVDR) |
| Note 5-1 (Factory Salaries) | Semi-automated | From payroll vouchers |
| Report Pages | Working | Trial Balance, Income Statement, Balance Sheet, COGM |
| PDF Export | Working | Infrastructure in place |

---

## What Needs Building (Priority Order)

### Phase 1: Closing Stock System (FIRST PRIORITY)

**Why First:** This is the blocker. Financial statements need inventory values.

**Current State:**
- `stock_adjustments` table exists but has 0 records
- `stock_opening_balances` table exists
- Stock movement tracking exists in `/src/routes/stock/stock.js`
- No UI for entering closing stock counts

**What to Build:**

1. **Closing Stock Entry Page**
   - Simple form to enter month-end stock counts
   - Categories: Finished Goods, Raw Materials, Packing Materials
   - NOT per-product (like old system) - aggregate by category
   - Auto-calculate value based on standard costs

2. **Database Table:** `closing_stock_entries`
   ```sql
   CREATE TABLE closing_stock_entries (
     id SERIAL PRIMARY KEY,
     year INTEGER NOT NULL,
     month INTEGER NOT NULL,
     category VARCHAR(20) NOT NULL, -- 'finished', 'raw', 'packing'
     quantity DECIMAL(15,2),
     unit_cost DECIMAL(15,2),
     total_value DECIMAL(15,2) NOT NULL,
     notes TEXT,
     created_at TIMESTAMP DEFAULT NOW(),
     created_by INTEGER REFERENCES staffs(id),
     updated_at TIMESTAMP,
     UNIQUE(year, month, category)
   );
   ```

3. **Auto-populate Opening Stock**
   - Previous month's closing = current month's opening
   - First month needs manual entry

4. **Financial Report Integration**
   - Note 14-1, 14-2, 14-3 → pull from `closing_stock_entries`
   - Note 3-1, 3-3, 3-7 → pull from previous period closing

---

### Phase 2: Bank/Cash System (Note 19)

**Current State:**
- `payments` table exists in sales module
- Tracks customer payments with invoice linkage
- NOT integrated with accounting GL

**What to Build:**

1. **Auto-Journal from Payments**
   - When payment recorded: DR Bank, CR Trade Receivables
   - Status change triggers GL entry

2. **Bank Account Register**
   - Simple view of bank movements
   - Reconciliation helper (bank statement vs system)

3. **Financial Report Integration**
   - Note 19 (Cash at Bank) → SUM of bank account balances
   - Calculate from: Opening balance + Receipts - Payments

---

### Phase 3: Simplified Chart of Accounts

**Replace 2,754 codes with ~50:**

| Category | New Accounts | Old Approach |
|----------|--------------|--------------|
| Stock | 3 (Finished, Raw, Packing) | 140+ individual product codes |
| Trade Receivables | 1 | 1,511 customer codes |
| Trade Payables | 1 | 82 supplier codes |
| Vehicle Expenses | 5-6 categories | 40+ per-vehicle codes |
| Bank | 2-3 actual banks | 4 codes |
| HP | 1 aggregate | 34 individual vehicle codes |

**Migration Approach:**
- Keep existing `account_codes` table for reference
- Create new simplified accounts with clear `fs_note` mappings
- Reports pull from new simplified structure

---

### Phase 4: COGM Automation

**Depends on:** Phase 1 (Stock System)

**Formula:**
```
Opening Raw Materials
+ Purchases (Raw Materials)
+ Freight & Transportation
- Closing Raw Materials
= Raw Materials Used

Opening Packing Materials
+ Purchases (Packing Materials)
- Closing Packing Materials
= Packing Materials Used

Factory Salaries (from payroll)

COGM = Raw Materials Used + Packing Materials Used + Factory Salaries
```

**Data Sources:**
- Opening/Closing Stock → Phase 1 system
- Purchases → Need simple purchase entry or import
- Factory Salaries → Already working from payroll vouchers

---

## Simplified Financial Statement Structure

### Balance Sheet
```
NON-CURRENT ASSETS
  Property, Plant & Equipment     Note 4

CURRENT ASSETS
  Inventories                     Note 14 (from stock system)
  Trade Receivables               Note 22 (from invoices)
  Other Receivables & Prepayments Note 8
  Cash at Bank                    Note 19 (from bank system)

CURRENT LIABILITIES
  Trade Payables                  Note 13
  Accruals                        Note 1 (from payroll)
  Amount Due to Directors         Note 9
  Taxation                        Note 12

EQUITY
  Share Capital                   Note 21
  Retained Profits                Note 20
```

### Income Statement
```
Revenue                           Note 7 (from invoices)
- Cost of Sales
  - Opening Stock                 Note 3-1 (from stock system)
  - COGM                          Note CGM (calculated)
  - Closing Stock                 Note 14-1 (from stock system)
= Gross Profit

+ Other Income                    Note 18
- Administrative Expenses         Note 5
- Finance Costs                   Note 23
= Profit Before Tax
```

---

## Old System Analysis (Reference)

### What the Old PDFs Showed

**Account Code Documents (Balance sheet information.pdf):**
- Individual codes per product for Opening Stock (OS-*) and Closing Stock (CS-*)
- Individual codes per supplier (CR-LYF, CR-IM, CR-JM, etc.)
- Individual codes per vehicle for expenses
- Individual codes per hire purchase agreement (HPA-*, HPB-*)

**Trial Balance (core_tienhock_acc_docs.pdf - 22 pages!):**
- 500+ account codes listed
- Per-product closing stock codes: CS_M3UD, CS_B3UD, CS_BAPL, etc.
- Per-vehicle codes: BT6304, INS6304, R6304, SV6304, TAX6304, TY6304, OIL6304, PT6304
- Most codes showing 0.00 balance (inactive but still in system)

**The Core Problem:**
- User must manually create journal vouchers for:
  - Every customer payment (PBB_1 → CL_LOAN type mappings)
  - Every stock valuation entry (140+ products)
  - Every expense allocation

---

## Implementation Approach

### Don't Rebuild What Works
- Keep existing journal entry system
- Keep existing report generation logic
- Keep existing invoice-based overrides (Note 7, Note 22)

### Add New Automated Data Sources
- Stock system → Inventory notes
- Bank system → Cash at Bank note
- Keep payroll vouchers for salary-related notes

### Simplify Account Structure
- Create new simplified accounts
- Map to existing `fs_note` codes
- Reports continue to work but with cleaner data

---

## Questions to Clarify

1. **Stock Categories:** Should we use the 3 categories (Finished, Raw, Packing) or need more granularity?

2. **Stock Valuation:** Standard cost per category, or need weighted average/FIFO?

3. **Purchase Tracking:** Is there an existing purchase/AP module, or do purchases need to be entered manually?

4. **Bank Accounts:** How many bank accounts need tracking? Just the 2 PBB accounts mentioned in PDFs?

5. **Historical Data:** Should the new system start fresh from a specific date, or need to migrate historical balances?

---

## Files to Reference

| Purpose | Location |
|---------|----------|
| Financial Reports Backend | `src/routes/accounting/financial-reports.js` |
| Stock Backend | `src/routes/stock/stock.js` |
| Payments Backend | `src/routes/sales/invoices/payments.js` |
| Report Pages | `src/pages/Accounting/Reports/*.tsx` |
| Account Codes | `src/routes/accounting/account-codes.js` |
| Journal Entries | `src/routes/accounting/journal-entries.js` |
| Old System Mapping | `docs/FINANCIAL_STATEMENTS_MAPPING.md` |

---

## Next Steps: Start with Stock System

When ready, provide context on:
1. How stock counts are currently done (physical count process)
2. What categories/products need tracking
3. Whether you want per-product or category-level entry
4. How stock values are determined (cost basis)

We'll build the Closing Stock Entry page first, then integrate with financial reports.

---

*Plan created: January 10, 2026*
*Status: Awaiting user context on stock system*

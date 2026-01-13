# Accounting System Implementation Plan

## Executive Summary

**Core Answer: KEEP the journal system, but automate transaction flows into it.**

The journal entry system is the correct foundation for a double-entry accounting system. The problem with the old system wasn't the journal entries themselves - it was the lack of automation and over-granular account codes. Modern accounting systems still use journals; they just hide them behind transaction screens.

**Strategy:** Build specialized transaction entry screens (invoices, payments, purchases, stock) that automatically generate journal entries, similar to how payroll currently works with JVDR/JVSL.

---

## First Principles: Why Keep Journals

### Malaysian Accounting Standards Perspective

1. **Audit Trail Requirements**: Malaysian Companies Act 2016 requires maintaining proper accounting records with sufficient detail to explain transactions. Journal entries provide this trail.

2. **SST & Tax Compliance**: LHDN (Inland Revenue Board) requires supporting documentation for all transactions. Auto-generated journals from source documents (invoices, payments) satisfy this.

3. **Double-Entry Integrity**: Journal entries enforce the fundamental accounting equation (Assets = Liabilities + Equity). Abandoning this would require rebuilding it elsewhere.

4. **Adjusting Entries**: Period-end adjustments (accruals, depreciation, provisions) don't originate from transactions - they MUST be manual journal entries.

### What Modern Systems Do

- **SAP, Oracle, QuickBooks, Xero**: All use journal entries internally
- **User Experience**: Transaction forms (invoice, payment, purchase order) that auto-post to GL
- **Your Current Success**: JVDR/JVSL payroll automation proves this works well

**Recommendation:** Keep journals as the "engine," build better "interfaces" (transaction screens) that feed into them.

---

## Simplified Chart of Accounts Structure

### Current Problem: 2,754 codes → ~25 line items (100:1 ratio)

### Proposed Structure: ~60 accounts

**Note Mapping Strategy:** Using semantic codes (BS_CA_CASH, IS_REV_SALES) instead of numeric codes (6, 7, 22) for clarity.

#### Assets (15 accounts)

**Current Assets:**
- CASH - Cash In Hand → `BS_CA_CASH`
- BANK_PBB - Public Bank Berhad → `BS_CA_BANK`
- BANK_ABB - Alliance Bank Berhad → `BS_CA_BANK`
- TR - Trade Receivables → `BS_CA_TR`
- 1200 - Other Receivables → `BS_CA_OTHER_RECV`
- 1300 - Prepayments → `BS_CA_PREPAY`
- 1410 - Inventory - Finished Goods (Mee) → `BS_CA_INV_FG_MEE`
- 1420 - Inventory - Finished Goods (Bihun) → `BS_CA_INV_FG_BIHUN`
- 1430 - Inventory - Raw Materials → `BS_CA_INV_RM`
- 1440 - Inventory - Packing Materials → `BS_CA_INV_PM`

**Non-Current Assets (Property, Plant & Equipment):**
- 1510 - Factory Building → `BS_NCA_PPE_BUILDING`
- 1520 - Plant & Machinery → `BS_NCA_PPE_MACHINERY`
- 1530 - Motor Vehicles → `BS_NCA_PPE_VEHICLE`
- 1540 - Furniture & Fittings → `BS_NCA_PPE_FURNITURE`
- 1550 - Office Equipment & Computers → `BS_NCA_PPE_EQUIPMENT`

#### Liabilities (12 accounts)

**Current Liabilities:**
- 2010 - Trade Payables → `BS_CL_TP`
- 2100 - Accrued Salaries & Wages → `BS_CL_ACCR_SAL`
- 2110 - Accrued EPF Payable → `BS_CL_ACCR_EPF`
- 2120 - Accrued SOCSO Payable → `BS_CL_ACCR_SOCSO`
- 2130 - Accrued SIP Payable → `BS_CL_ACCR_SIP`
- 2140 - Accrued PCB Payable → `BS_CL_ACCR_PCB`
- 2150 - Accrued Utilities (SESB, Telekom, Levy) → `BS_CL_ACCR_UTIL`
- 2200 - Amount Due to Directors → `BS_CL_DUE_DIRECTORS`
- 2300 - Taxation Payable → `BS_CL_TAX`
- 2400 - Deferred Tax Liabilities → `BS_CL_DEF_TAX`

**Non-Current Liabilities:**
- 2510 - Hire Purchase Payables → `BS_NCL_HP`
- 2520 - HP Interest in Suspense → `BS_NCL_HP_INT`

#### Equity (2 accounts)

- 3000 - Share Capital → `BS_EQ_SHARE_CAP`
- 3100 - Retained Profits → `BS_EQ_RETAINED`

#### Revenue (2 accounts)

- 4000 - Sales Revenue → `IS_REV_SALES`
- 4100 - Other Income → `IS_REV_OTHER`

#### Cost of Goods Sold (8 accounts)

- 5010 - Opening Stock - Finished Goods (Mee) → `IS_COGS_OS_FG_MEE`
- 5020 - Opening Stock - Finished Goods (Bihun) → `IS_COGS_OS_FG_BIHUN`
- 5030 - Opening Stock - Raw Materials → `IS_COGS_OS_RM`
- 5040 - Opening Stock - Packing Materials → `IS_COGS_OS_PM`
- 5100 - Purchases - Raw Materials → `IS_COGS_PURCH_RM`
- 5200 - Purchases - Packing Materials → `IS_COGS_PURCH_PM`
- 5300 - Factory Salaries & Wages → `IS_COGS_SAL_FACTORY`
- 5400 - Factory Overheads → `IS_COGS_OVERHEAD`

#### Expenses (21 accounts)

**Salaries & Related:**
- 6010 - Administrative Salaries → `IS_EXP_SAL_ADMIN`
- 6020 - Sales Salaries & Commissions → `IS_EXP_SAL_SALES`
- 6030 - Overtime Payments → `IS_EXP_SAL_OT`
- 6040 - Bonus & Allowances → `IS_EXP_SAL_BONUS`
- 6050 - EPF Employer Contribution → `IS_EXP_EPF`
- 6060 - SOCSO Employer Contribution → `IS_EXP_SOCSO`
- 6070 - SIP Employer Contribution → `IS_EXP_SIP`

**Vehicle-Related (consolidated):**
- 6200 - Vehicle Fuel & Oil → `IS_EXP_VEH_FUEL`
- 6210 - Vehicle Insurance → `IS_EXP_VEH_INS`
- 6220 - Vehicle Repairs & Maintenance → `IS_EXP_VEH_REPAIR`
- 6230 - Vehicle Road Tax → `IS_EXP_VEH_TAX`
- 6240 - Vehicle Tyres & Accessories → `IS_EXP_VEH_TYRE`

**Utilities & Premises:**
- 6300 - Electricity (SESB) → `IS_EXP_UTIL_ELEC`
- 6310 - Telecommunications → `IS_EXP_UTIL_TELCO`
- 6320 - Water & Other Utilities → `IS_EXP_UTIL_WATER`

**Administrative:**
- 6400 - Bank Charges → `IS_EXP_BANK_CHRG`
- 6410 - Auditor's Remuneration → `IS_EXP_AUDIT`
- 6420 - Cleaning & Sanitation → `IS_EXP_CLEANING`
- 6430 - Transportation & Freight → `IS_EXP_TRANSPORT`
- 6490 - General Administrative Expenses → `IS_EXP_ADMIN_GEN`

**Finance Costs:**
- 6900 - Interest Expense - HP → `IS_EXP_INT_HP`
- 6910 - Other Finance Costs → `IS_EXP_INT_OTHER`

**Total: 60 accounts** (vs 2,754 in old system)

### Financial Statement Note Code Structure

**Prefix Meanings:**
- `BS_` = Balance Sheet
- `IS_` = Income Statement
- `CA_` = Current Asset
- `NCA_` = Non-Current Asset
- `CL_` = Current Liability
- `NCL_` = Non-Current Liability
- `EQ_` = Equity
- `REV_` = Revenue
- `COGS_` = Cost of Goods Sold
- `EXP_` = Expense

**Examples:**
- `BS_CA_CASH` = Balance Sheet → Current Assets → Cash In Hand
- `IS_REV_SALES` = Income Statement → Revenue → Sales
- `IS_EXP_VEH_FUEL` = Income Statement → Expenses → Vehicle Fuel

**Benefits:**
- Self-documenting (no need to look up what "Note 22" means)
- Many accounts can map to one note (e.g., BANK_PBB + BANK_ABB → BS_CA_BANK)
- Flexible reorganization (change note display name without touching accounts)
- Standard accounting separation (Chart of Accounts vs Financial Statement Presentation)

### Key Simplifications

1. **No per-product codes**: 3 inventory categories instead of 140+ product codes
2. **No per-supplier codes**: 1 Trade Payables account with subledger tracking
3. **No per-customer codes**: 1 Trade Receivables account (already works via invoices table)
4. **No per-vehicle codes**: Consolidated vehicle expense categories
5. **Vehicle expenses aggregated**: All BT6304, INS6304, R6304 → consolidated accounts

---

## Analysis of 29 Trial Balance Categories

### Category 1: Automate via Subledger → Journal

These should have dedicated transaction screens that auto-generate journal entries:

| Category | Implementation | Auto-Journal Trigger | Priority |
|----------|----------------|---------------------|----------|
| **DEBTOR** | Already working | Invoice creation → DR Trade Receivables, CR Revenue | ✅ Done |
| **CR_*** (Creditors) | Purchase Invoice system | Purchase entry → DR Expenses/Inventory, CR Trade Payables | **HIGH** |
| **PU_*** (Purchases) | Same as CR_* | Purchase entry → DR Inventory, CR Trade Payables | **HIGH** |
| **CS_***, **OS_*** (Stock) | Stock adjustment system | Month-end closing → DR/CR Inventory, DR/CR COGS | **HIGH** |
| **PM_*** (Packing) | Integrated with stock | Same as above | **HIGH** |
| Payments | Payment recording | Payment → DR Trade Payables/Expenses, CR Bank | **MEDIUM** |
| **IN_OTH** (Other Income) | Receipt screen | Receipt → DR Bank, CR Other Income | **MEDIUM** |

### Category 2: Auto-Generate from Data (Like Payroll)

These have source data and should auto-generate journals:

| Category | Source Data | Journal Pattern | Priority |
|----------|-------------|-----------------|----------|
| Payroll (MB*) | employee_payrolls | JVDR, JVSL (already done) | ✅ Done |
| **HPA_***, **HPB_*** | HP schedule table | Monthly: DR Interest, CR HP Payable | **LOW** |
| **AD_*** (Depreciation) | Fixed assets register | Monthly: DR Depreciation, CR Accum. Depr. | **LOW** |

### Category 3: Keep as Manual Journal Entries

These are period-end adjustments with no source transactions:

| Category | Nature | Frequency | Priority |
|----------|--------|-----------|----------|
| **AC_*** (Accruals) | Utility accruals | Monthly | Manual JE |
| **DF_TAX** (Deferred Tax) | Tax accounting adjustment | Yearly | Manual JE |
| **CL_TAX** (Taxation) | Tax provision | Yearly | Manual JE |
| **RP** (Retained Profit) | Closing entry | Yearly | Manual JE |
| **CL_GT/GF/JP** | Inter-company | As needed | Manual JE |

### Category 4: Consolidate into Simplified Accounts

These over-granular codes should map to single accounts:

| Old Codes | New Account | Rationale |
|-----------|-------------|-----------|
| BT6304, BT6305, BT6306... | 6200 - Vehicle Fuel | No need for per-vehicle tracking |
| INS6304, INS6305... | 6210 - Vehicle Insurance | Consolidated |
| R6304, R6305... (Repair) | 6220 - Vehicle Repairs | Consolidated |
| SV* (Service) | 6220 - Vehicle Repairs | Same as repairs |
| TAX6304, TAX6305... | 6230 - Vehicle Road Tax | Consolidated |
| TY6304, TY6305... (Tyres) | 6240 - Vehicle Tyres | Consolidated |
| OIL6304, OIL6305... | 6200 - Vehicle Fuel | Same as fuel |
| PT* (Patching) | 6240 - Vehicle Tyres | Same as tyres |
| MB* (Various expenses) | 6010-6490 (by nature) | Group by expense type, not department |
| **NCA_*** (PP&E) | 1510-1550 (7 asset classes) | By asset type |
| **NT_7484**, **BTRA**, **THJ_CK** | Map to appropriate expense account | Special cases |

---

## Implementation Phases

### Phase 1: Purchases & Payables System (FIRST PRIORITY)

**Why First:** Largest untracked transaction volume; materials stock system needs purchase data.

**What to Build:**

1. **Purchase Invoice Entry Screen**
   - Form fields: Supplier, date, invoice number, items (material/expense), amounts, tax
   - Save to new `purchase_invoices` table
   - Button: "Post to GL"

2. **Auto-Journal Generation**
   ```
   On Post:
   DR 5100 - Purchases - Raw Materials (IS_COGS_PURCH_RM)     RM 10,000
   DR 2010 - Trade Payables Input Tax (BS_CL_TP)              RM 600 (SST)
       CR 2010 - Trade Payables (BS_CL_TP)                    RM 10,600

   Reference: Purchase Invoice #INV123
   ```

3. **Database Tables:**
   ```sql
   CREATE TABLE purchase_invoices (
     id SERIAL PRIMARY KEY,
     supplier_id INTEGER REFERENCES suppliers(id),
     invoice_number VARCHAR(50) UNIQUE NOT NULL,
     invoice_date DATE NOT NULL,
     total_amount DECIMAL(15,2),
     tax_amount DECIMAL(15,2),
     total_payable DECIMAL(15,2),
     payment_status VARCHAR(20) DEFAULT 'unpaid',
     journal_entry_id INTEGER REFERENCES journal_entries(id),
     created_at TIMESTAMP DEFAULT NOW(),
     created_by INTEGER REFERENCES staffs(id)
   );

   CREATE TABLE purchase_invoice_lines (
     id SERIAL PRIMARY KEY,
     purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
     material_id INTEGER REFERENCES materials(id),
     account_code VARCHAR(20) REFERENCES account_codes(code),
     description TEXT,
     quantity DECIMAL(15,2),
     unit_cost DECIMAL(15,2),
     amount DECIMAL(15,2)
   );

   CREATE TABLE suppliers (
     id SERIAL PRIMARY KEY,
     code VARCHAR(20) UNIQUE,
     name VARCHAR(200) NOT NULL,
     contact_person VARCHAR(100),
     phone VARCHAR(50),
     email VARCHAR(100),
     address TEXT,
     payment_terms INTEGER DEFAULT 30,
     is_active BOOLEAN DEFAULT true,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

4. **Supplier Subledger**
   - Track balances per supplier (similar to customer invoices)
   - Reconcile to GL account 2010 (Trade Payables)

5. **Integration with Materials Stock**
   - Purchase entries for materials → auto-update `material_stock_entries.purchases_quantity`
   - Link: purchase_invoice_lines.material_id → materials.id

**Files to Create/Modify:**
- Backend: `src/routes/accounting/purchases.js`
- Backend: `src/routes/accounting/suppliers.js`
- Frontend: `src/pages/Accounting/Purchases/PurchaseInvoiceEntryPage.tsx`
- Frontend: `src/pages/Accounting/Purchases/PurchaseInvoicesListPage.tsx`
- Frontend: `src/pages/Accounting/Purchases/SuppliersPage.tsx`
- Migration: `migrations/add_purchases_system.sql`

---

### Phase 2: Payment System (Auto-Journal on Payment)

**Why Second:** Completes the purchase-to-payment cycle; critical for cash flow tracking.

**What to Build:**

1. **Enhanced Payment Recording**
   - Current `payments` table only handles customer payments
   - Add supplier payment recording

2. **Auto-Journal on Payment Posting**

   **Account Selection Logic:**
   - Cash payment → Debit: `CASH`
   - Cheque/Bank Transfer/Online → Debit: `payment.bank_account` (BANK_PBB or BANK_ABB, selected by user)
   - All customer payments → Credit: `TR` (Trade Receivables)

   **Pending Cheque Handling:**
   - Status `pending` (uncashed cheques): NO journal entry created yet
   - Status `active` (confirmed): Create journal entry immediately
   - Confirm cheque action: Create journal entry at confirmation time
   - Cancel payment: Set `journal_entry.status = 'cancelled'`

   **Reference Number Format:** `REC{seq}/{month}` (e.g., REC001/01, REC002/01)

   **Customer Payment (already have table, add auto-journal):**
   ```
   DR BANK_PBB - Public Bank (BS_CA_BANK)       RM 5,000
       CR TR - Trade Receivables (BS_CA_TR)     RM 5,000

   Reference: Payment REC001/01 for Invoice #INV123
   Entry Type: REC (Receipt)
   Status: posted (immediately)
   ```

   **Supplier Payment (new):**
   ```
   DR 2010 - Trade Payables (BS_CL_TP)          RM 10,600
       CR BANK_PBB - Public Bank (BS_CA_BANK)   RM 10,600

   Reference: Payment PMTSUP001 for Purchase Invoice #PINV123
   ```

3. **Database Enhancement:**
   ```sql
   CREATE TABLE supplier_payments (
     id SERIAL PRIMARY KEY,
     purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
     payment_date DATE NOT NULL,
     amount_paid DECIMAL(15,2) NOT NULL,
     payment_method VARCHAR(50),
     payment_reference VARCHAR(100),
     bank_account_code VARCHAR(20) REFERENCES account_codes(code),
     journal_entry_id INTEGER REFERENCES journal_entries(id),
     notes TEXT,
     created_at TIMESTAMP DEFAULT NOW(),
     created_by INTEGER REFERENCES staffs(id)
   );

   -- Add to existing payments table:
   ALTER TABLE payments
   ADD COLUMN bank_account VARCHAR(20) DEFAULT NULL,
   ADD COLUMN journal_entry_id INTEGER REFERENCES journal_entries(id);

   COMMENT ON COLUMN payments.bank_account IS 'Target account: CASH, BANK_PBB, or BANK_ABB';
   COMMENT ON COLUMN payments.journal_entry_id IS 'Links to auto-generated journal entry';
   ```

4. **Bank Reconciliation Helper**
   - Simple page showing: Opening balance + Receipts - Payments = Closing balance
   - Compare with bank statement

**Files to Create/Modify:**

Customer Payment Journals:
- Backend: `src/routes/accounting/payment-journal.js` (NEW helper module)
- Backend: `src/routes/sales/invoices/payments.js` (enhance existing)
- Frontend: `src/components/Invoice/PaymentForm.tsx` (add bank account dropdown)
- Frontend: `src/types/types.ts` (update Payment interface)

Supplier Payments (future):
- Backend: `src/routes/accounting/supplier-payments.js`
- Frontend: `src/pages/Accounting/Payments/SupplierPaymentEntryPage.tsx`

Bank Reconciliation:
- Frontend: `src/pages/Accounting/BankReconciliationPage.tsx`

Migration:
- `migrations/add_payment_journals.sql`

5. **Frontend Implementation Details**

   **File: `src/components/Invoice/PaymentForm.tsx`**

   Add "Deposit To" dropdown field for bank account selection:

   ```typescript
   // Add to formData state
   const [formData, setFormData] = useState({
     payment_date: new Date().toISOString().split("T")[0],
     payment_method: "cheque" as Payment["payment_method"],
     payment_reference: "",  // Customer's cheque/bank reference (existing)
     bank_account: "BANK_PBB",  // NEW: Company's receiving bank (Public Bank default)
     notes: "",
   });

   // Bank account options
   const bankAccountOptions = [
     { id: "BANK_PBB", name: "Public Bank" },
     { id: "BANK_ABB", name: "Alliance Bank" },
   ];

   // Conditional rendering (show only for non-cash)
   {formData.payment_method !== 'cash' && (
     <FormListbox
       name="bank_account"
       label="Deposit To"
       value={formData.bank_account}
       onChange={(value) => setFormData({ ...formData, bank_account: value })}
       options={bankAccountOptions}
       disabled={isSubmitting}
     />
   )}

   // Update submission payload
   const result = await api.post(apiEndpoint, {
     invoice_id: invoice.id,
     payment_date: formData.payment_date,
     amount_paid: amountToPay,
     payment_method: formData.payment_method,
     payment_reference: formData.payment_reference || undefined,
     bank_account: formData.payment_method === 'cash' ? 'CASH' : formData.bank_account,
     notes: formData.notes || undefined,
   });
   ```

   **File: `src/types/types.ts`**

   Update Payment interface:
   ```typescript
   interface Payment {
     // ... existing fields
     bank_account?: 'CASH' | 'BANK_PBB' | 'BANK_ABB';
     journal_entry_id?: number;
   }
   ```

---

### Phase 3: Stock Valuation Journals

**Why Third:** Depends on purchases system; needed for accurate COGS.

**What to Build:**

1. **Month-End Stock Closing Process**
   - User enters physical count in materials stock system (already being built)
   - Button: "Generate Stock Adjustment Journal"

2. **Auto-Journal Generation**
   ```
   Opening Stock (start of period):
   DR 5030 - Opening Stock - Raw Materials (IS_COGS_OS_RM)    RM 5,000
       CR 1430 - Inventory - Raw Materials (BS_CA_INV_RM)     RM 5,000

   Purchases (sum of month):
   DR 1430 - Inventory - Raw Materials (BS_CA_INV_RM)         RM 25,000
       CR [Already posted via purchase invoices]

   Closing Stock (end of period):
   DR 1430 - Inventory - Raw Materials (BS_CA_INV_RM)         RM 8,000
       CR 5030 - Opening Stock - Raw Materials (IS_COGS_OS_RM)    RM 8,000

   Net effect: COGS = Opening + Purchases - Closing
   ```

3. **Integration:**
   - Read from `material_stock_entries` table (opening, purchases, closing quantities)
   - Apply unit_cost to calculate values
   - Generate journal entry with reference to stock entry

**Files to Modify:**
- Backend: `src/routes/accounting/materials.js` (add journal generation endpoint)
- Frontend: Stock entry pages (add "Post to GL" button)

---

### Phase 4: Expense Recording Screens

**Why Fourth:** Lower complexity; many expenses can be recorded ad-hoc.

**What to Build:**

1. **Quick Expense Entry Form**
   - Date, Expense Type (dropdown of expense accounts), Amount, Description, Payment Method
   - Automatically generates journal:
   ```
   DR 6200 - Vehicle Fuel (IS_EXP_VEH_FUEL)      RM 150
       CR BANK_PBB - Public Bank (BS_CA_BANK)    RM 150
   ```

2. **Bulk Expense Import**
   - Upload bank statement CSV
   - Map transactions to expense accounts
   - Generate batch journal entry

3. **Recurring Expense Setup**
   - Monthly utilities, rent, subscriptions
   - Auto-generate on first of month

**Files to Create:**
- Frontend: `src/pages/Accounting/Expenses/ExpenseEntryPage.tsx`
- Frontend: `src/pages/Accounting/Expenses/RecurringExpensesPage.tsx`
- Backend: `src/routes/accounting/expenses.js`

---

### Phase 5: Fixed Assets & Depreciation (Optional - Lower Priority)

**What to Build:**

1. **Fixed Assets Register**
   - Track: Asset name, category (7 types), cost, purchase date, useful life, depreciation method
   - Save to new `fixed_assets` table

2. **Monthly Depreciation Journal Auto-Generation**
   ```
   DR 6800 - Depreciation Expense           RM 2,500
       CR 1510-A - Accum. Depr - Building   RM 1,000
       CR 1520-A - Accum. Depr - Machinery  RM 1,000
       CR 1530-A - Accum. Depr - Vehicles   RM 500
   ```

3. **Asset Disposal Recording**
   - Automatically reverse cost and accumulated depreciation
   - Calculate gain/loss on disposal

**Note:** Lower priority because depreciation is typically calculated yearly or with accountant's help.

---

### Phase 6: Hire Purchase System (Optional)

**What to Build:**

1. **HP Schedule Table**
   - Track: Vehicle/asset, principal, interest rate, monthly payment, term
   - Calculate monthly interest vs principal split

2. **Monthly HP Journal Auto-Generation**
   ```
   DR 2510 - HP Payables                    RM 1,200
   DR 6900 - Interest Expense - HP          RM 300
       CR 1010 - Cash at Bank               RM 1,500
   ```

---

## Simplified Account Mapping for Old Codes

### Vehicle Expenses Consolidation

Old codes like `BT6304`, `INS6304`, `R6304`, `OIL6304`, `TAX6304`, `TY6304` should ALL map to the new consolidated accounts:

- All `BT*`, `OIL*`, `PT*` → 6200 (Vehicle Fuel & Oil)
- All `INS*` → 6210 (Vehicle Insurance)
- All `R*`, `SV*` → 6220 (Vehicle Repairs & Maintenance)
- All `TAX*` → 6230 (Vehicle Road Tax)
- All `TY*` → 6240 (Vehicle Tyres & Accessories)

**Implementation:**
- Create mapping table or configuration
- When importing historical data, batch-update old codes to new codes
- Old account_codes can remain in database (is_active=false) for historical reference

### MB* Expenses Classification

The large `MB*` section should be classified by expense nature:

- Salaries from JVSL → 6010 (Admin Salaries), 6020 (Sales Salaries)
- Advertisement → 6490 (General Admin)
- Bank charges → 6400 (Bank Charges)
- Cleaning → 6420 (Cleaning)
- Donations → 6490 (General Admin)
- Transportation → 6430 (Transportation)
- Auditor remuneration → 6410 (Auditor's Remuneration)

---

## Database Schema Changes Summary

### New Tables:
1. `suppliers` - Supplier master data
2. `purchase_invoices` - Purchase invoice headers
3. `purchase_invoice_lines` - Purchase invoice line items
4. `supplier_payments` - Payments to suppliers
5. `fixed_assets` (Phase 5) - Asset register
6. `hp_schedules` (Phase 6) - Hire purchase schedules

### Modified Tables:
1. `payments` - Add `journal_entry_id` column
2. `account_codes` - Already has `fs_note`, may need to add `is_system` flag for protected accounts
3. `material_stock_entries` - Add `journal_entry_id` column for linkage

### New Columns:
- Most transaction tables need `journal_entry_id INTEGER REFERENCES journal_entries(id)`
- This creates the audit trail: Transaction → Journal Entry

---

## Month-End Closing Process

### Recommended Workflow:

1. **Transaction Recording (Daily/Weekly)**
   - Enter purchase invoices → auto-posts to GL
   - Record payments → auto-posts to GL
   - Payroll processing → generate JVDR/JVSL → manual post

2. **Month-End Tasks (Manual)**
   - Physical stock count → enter in materials system → generate stock journals
   - Review accruals (utilities, salary accruals) → manual journal entry
   - Review prepayments/deferrals → manual journal entry
   - Generate depreciation (if implemented) → auto-journal

3. **Review & Lock**
   - Print Trial Balance → verify debits = credits
   - Print Income Statement, Balance Sheet → review for reasonableness
   - Reconcile bank accounts
   - "Close" the month (prevent further posting to that period)

4. **Reporting**
   - Export financial statements to PDF
   - Share with directors/accountant

---

## Migration from Old System

### Approach: Fresh Start with Opening Balances

1. **Select Cutoff Date** (e.g., Jan 1, 2026)

2. **Enter Opening Balances**
   - Create journal entry type "OPB" (Opening Balance)
   - One entry per new account with balance as of cutoff date
   - Ensures Assets = Liabilities + Equity

3. **Map Old → New Codes**
   - Create reference document: Old code → New code mapping
   - Useful for historical queries if needed

4. **Historical Data**
   - Keep old system read-only for reference
   - No need to migrate transaction history
   - Only opening balances matter

---

## Key Design Principles Applied

### 1. Automation over Manual Entry
- Every repetitive transaction type should auto-generate journals
- Reduces errors and saves time

### 2. Subledgers for Detail, GL for Summary
- Track supplier balances in `purchase_invoices` (subledger)
- Summarize to single GL account 2010 (Trade Payables)
- Same for customers: `invoices` table → GL 1100

### 3. Transaction → Journal Linkage
- Every auto-generated journal stores source transaction ID
- Every transaction stores resulting journal_entry_id
- Bidirectional audit trail

### 4. Immutable Posted Entries
- Once posted, journals cannot be edited
- Corrections via reversal + new entry
- Maintains audit integrity

### 5. Separation of Concerns
- Transaction screens: User-friendly, business-focused
- Journal entries: Technical, accounting-focused
- Financial reports: Summary, decision-focused

---

## API Endpoints to Build

### Purchases Module
- `POST /api/accounting/purchases` - Create purchase invoice
- `GET /api/accounting/purchases` - List with filters
- `GET /api/accounting/purchases/:id` - Get single purchase
- `POST /api/accounting/purchases/:id/post` - Post to GL (generate journal)
- `DELETE /api/accounting/purchases/:id` - Delete (if not posted)

### Suppliers Module
- `POST /api/accounting/suppliers` - Create supplier
- `GET /api/accounting/suppliers` - List all
- `GET /api/accounting/suppliers/:id` - Get single supplier
- `PUT /api/accounting/suppliers/:id` - Update supplier
- `GET /api/accounting/suppliers/:id/balance` - Get outstanding balance

### Payments Module (Enhance Existing)
- `POST /api/accounting/customer-payments/:id/post` - Post customer payment to GL
- `POST /api/accounting/supplier-payments` - Create supplier payment
- `POST /api/accounting/supplier-payments/:id/post` - Post supplier payment to GL

### Expenses Module
- `POST /api/accounting/expenses` - Quick expense entry (auto-posts to GL)
- `GET /api/accounting/expenses` - List expenses

### Materials Integration
- `POST /api/accounting/materials/generate-stock-journal/:year/:month` - Generate stock adjustment journal

---

## Testing & Verification

After implementing each phase:

1. **Unit Tests**
   - Journal generation logic (debits = credits)
   - Account code validation
   - Date range calculations

2. **Integration Tests**
   - Purchase invoice → Journal → Trial Balance flow
   - Payment → Journal → Bank balance flow
   - Stock entry → Journal → COGS calculation flow

3. **Manual Verification**
   - Enter test transactions
   - Check Trial Balance balances
   - Verify financial statements calculations
   - Ensure subledger (invoices) = GL (Trade Receivables)
   - Ensure supplier subledger = GL (Trade Payables)

4. **Reconciliation Reports**
   - Trade Receivables subledger vs GL
   - Trade Payables subledger vs GL
   - Bank subledger vs GL

---

## Critical Files Reference

### Existing (Don't Modify Core Logic):
- `src/routes/accounting/journal-entries.js` - Core journal CRUD
- `src/routes/accounting/journal-vouchers.js` - JVDR/JVSL payroll automation
- `src/routes/accounting/financial-reports.js` - Report generation

### To Create:
- `src/routes/accounting/purchases.js`
- `src/routes/accounting/suppliers.js`
- `src/routes/accounting/supplier-payments.js`
- `src/routes/accounting/expenses.js`
- `src/pages/Accounting/Purchases/*.tsx`
- `src/pages/Accounting/Suppliers/*.tsx`
- `src/pages/Accounting/Payments/*.tsx` (enhance)
- `src/pages/Accounting/Expenses/*.tsx`

### Database Migrations:
- `migrations/add_purchases_system.sql`
- `migrations/add_payment_journals.sql`
- `migrations/add_simplified_accounts.sql`

---

## Summary: The Modern Approach

**Old System:**
- 2,754 account codes
- Manual journal entry for every transaction
- Per-product, per-vehicle, per-supplier codes
- Complex, error-prone

**New System:**
- ~60 account codes (simplified)
- Transaction screens auto-generate journals
- Subledgers track detail (suppliers, customers, stock)
- GL tracks summary (Trade Payables, Trade Receivables, Inventory)
- Clean, automated, maintainable

**The journal system stays** - it's the correct accounting foundation. We're just building better roads into it.

---

## Migrating Financial Statement Note Codes

### From Numeric to Semantic Codes

The existing system uses numeric codes ('6', '7', '19', '22') which are not self-documenting. This plan uses semantic codes for clarity.

**Migration Steps:**

1. **Add new semantic codes to financial_statement_notes table**
   ```sql
   -- Create new notes with semantic codes
   INSERT INTO financial_statement_notes (code, name, category, report_section, normal_balance, sort_order, is_active)
   VALUES
     ('BS_CA_CASH', 'Cash In Hand', 'asset', 'balance_sheet', 'debit', 10, true),
     ('BS_CA_BANK', 'Cash At Bank', 'asset', 'balance_sheet', 'debit', 20, true),
     ('BS_CA_TR', 'Trade Receivables', 'asset', 'balance_sheet', 'debit', 30, true),
     ('IS_REV_SALES', 'Sales Revenue', 'revenue', 'income_statement', 'credit', 10, true),
     -- ... etc for all 60 accounts
   ```

2. **Update account_codes.fs_note mappings**
   ```sql
   -- Example migrations:
   UPDATE account_codes SET fs_note = 'BS_CA_CASH' WHERE code = 'CASH';
   UPDATE account_codes SET fs_note = 'BS_CA_BANK' WHERE code IN ('BANK_PBB', 'BANK_ABB');
   UPDATE account_codes SET fs_note = 'BS_CA_TR' WHERE code = 'TR';
   UPDATE account_codes SET fs_note = 'IS_REV_SALES' WHERE code = '4000';
   ```

3. **Update report queries**
   ```javascript
   // Change from:
   WHERE fsn.code IN ('6', '19', '22')

   // To:
   WHERE fsn.code IN ('BS_CA_CASH', 'BS_CA_BANK', 'BS_CA_TR')
   ```

4. **Update invoice-based overrides**
   ```javascript
   // In financial-reports.js
   // Change Note 7 override from:
   if (row.code === "7") { amount = invoiceRevenue; }

   // To:
   if (row.code === "IS_REV_SALES") { amount = invoiceRevenue; }

   // Change Note 22 override from:
   if (row.code === "22") { amount = tradeReceivables; }

   // To:
   if (row.code === "BS_CA_TR") { amount = tradeReceivables; }
   ```

5. **Keep old numeric codes for reference**
   - Set `is_active = false` on old numeric codes
   - Maintain for historical data queries if needed

**Benefits of this migration:**
- Self-documenting code (no need to memorize that "22" means Trade Receivables)
- Easier maintenance and onboarding
- Clear separation between report types (BS_ vs IS_)
- Consistent naming convention across the system

---

## Next Steps

1. **User confirms approach** ✓
2. **Implement Phase 1: Purchases & Payables System** (highest priority)
3. **Test with real supplier invoices**
4. **Implement Phase 2: Payment journals**
5. **Continue through phases based on business priority**

**Estimated Complexity:**
- Phase 1 (Purchases): ~3-4 days (tables, backend, frontend forms)
- Phase 2 (Payments): ~2-3 days (enhance existing, add journals)
- Phase 3 (Stock journals): ~1-2 days (integrate with existing stock system)
- Phase 4 (Expenses): ~2-3 days (quick entry forms)

**Total core system: ~10-14 days development time**

---

*Plan created: January 2026*
*Updated: January 13, 2026 - Migrated to semantic note codes (BS_CA_CASH, IS_REV_SALES) and integrated with BANK_CASH_SYSTEM_PLAN.md*
*Status: Ready for implementation*

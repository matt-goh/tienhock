# Accounting System Implementation Plan

## Executive Summary

**Core Answer: KEEP the journal system, but automate transaction flows into it.**

The journal entry system is the correct foundation for a double-entry accounting system. The problem with the old system wasn't the journal entries themselves - it was the lack of automation and over-granular account codes. Modern accounting systems still use journals; they just hide them behind transaction screens.

**Strategy:** Build specialized transaction entry screens (invoices, payments, purchases, stock) that automatically generate journal entries, similar to how payroll currently works with JVDR/JVSL.

**Implementation Progress:**
- ✅ **Phase 2: Customer Payment Journals** - Completed January 13, 2026
  - Auto-generates journal entries (type REC) for customer payments
  - Bank account selection (CASH, BANK_PBB, BANK_ABB)
  - Pending cheque handling with deferred journal creation
  - Full payment-to-journal audit trail established
- 🔜 **Phase 1: Purchases & Payables** - Next priority
- ⏳ **Phase 3-6** - Pending

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

### Phase 2: Payment System (Auto-Journal on Payment) ✅ COMPLETED

**Why Second:** Completes the purchase-to-payment cycle; critical for cash flow tracking.

**Status:** ✅ Implemented January 13, 2026

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
   - See **Phase 2.2: Bank Statement from Journal Report** for full implementation
   - Generates statement from journal entries for comparison with actual bank statement

**Files to Create/Modify:**

Customer Payment Journals:
- Backend: `src/routes/accounting/payment-journal.js` (NEW helper module)
- Backend: `src/routes/sales/invoices/payments.js` (enhance existing)
- Frontend: `src/components/Invoice/PaymentForm.tsx` (add bank account dropdown)
- Frontend: `src/types/types.ts` (update Payment interface)

Supplier Payments (future):
- Backend: `src/routes/accounting/supplier-payments.js`
- Frontend: `src/pages/Accounting/Payments/SupplierPaymentEntryPage.tsx`

Bank Statement from Journal (Phase 2.2):
- Backend: `src/routes/accounting/bank-statement.js`
- Frontend: `src/pages/Accounting/BankStatementPage.tsx`
- PDF: `src/utils/accounting/BankStatementPDF.tsx`

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

#### Phase 2 Implementation Summary (January 13, 2026)

**What Was Actually Implemented:**

1. **Database Migration** - `migrations/add_payment_journals.sql`
   - Added `bank_account` and `journal_entry_id` columns to `payments` table
   - Created account codes: CASH, BANK_PBB, BANK_ABB, TR
   - Added journal entry type: REC (Receipt)
   - Backfilled 2,516 existing payments with bank_account based on payment_method

2. **Backend Implementation**
   - **NEW:** `src/routes/accounting/payment-journal.js`
     - `generateReceiptReference()` - Generates REC{seq}/{month} reference numbers
     - `createPaymentJournalEntry()` - Auto-generates journal entries for payments
     - `cancelPaymentJournalEntry()` - Cancels journal when payment is cancelled
   - **Enhanced:** `src/routes/sales/invoices/payments.js`
     - POST `/api/payments` - Now accepts `bank_account` and auto-creates journal for active payments
     - PUT `/api/payments/:id/confirm` - Creates journal when pending cheque is confirmed
     - PUT `/api/payments/:id/cancel` - Cancels associated journal entry
   - **Helper:** `src/utils/payment-helpers.js`
     - `determineBankAccount()` - Maps payment method to correct account (CASH/BANK_PBB/BANK_ABB)

3. **Frontend Implementation**
   - **Enhanced:** `src/components/Invoice/PaymentForm.tsx`
     - Added "Deposit To" bank account dropdown (Public Bank/Alliance Bank)
     - Conditional rendering: only shows for non-cash payments
     - Default: BANK_PBB (Public Bank)
   - **Enhanced:** `src/pages/Invoice/InvoiceDetailsPage.tsx`
     - Complete UI/UX overhaul of payment form with better layout
     - Added bank account selection to payment form
     - Added bank account selection to payment confirmation dialog
     - Added "Journal Entry" column to payment history table with clickable links
     - Pre-populates confirmation dialog with payment's existing bank account
   - **Enhanced:** `src/components/Invoice/PaymentTable.tsx`
     - Added bank account selection to confirmation dialog
     - Pre-populates with existing bank account to preserve user selection
   - **Enhanced:** `src/components/GreenTarget/GreenTargetPaymentTable.tsx`
     - Added bank account selection to confirmation dialog
     - Pre-populates with existing bank account to preserve user selection
   - **Updated:** `src/types/types.ts`
     - Added `bank_account` and `journal_entry_id` fields to Payment interface

4. **Business Logic Implemented**
   - Cash payments → automatically use CASH account
   - Non-cash payments → user selects Public Bank or Alliance Bank
   - Active payments → journal entry created immediately
   - Pending cheques → journal entry deferred until confirmation
   - Cancelled payments → journal entry marked as cancelled (not deleted)
   - Bank account selection preserved throughout payment confirmation flow

5. **Bug Fixes**
   - Fixed issue where Alliance Bank selection was being overwritten during payment confirmation
   - Solution: Pre-populate confirmation dialog with payment's existing bank_account value

**Journal Entry Structure Created:**
```
Reference: REC001/01 (sequential per month)
Type: REC (Receipt)
Status: posted (immediately posted)

Lines:
  DR BANK_PBB/BANK_ABB/CASH (increase asset)
  CR TR (Trade Receivables - decrease asset)
```

**Testing Status:**
- Manual testing guide provided in `docs/PAYMENT_JOURNAL_IMPLEMENTATION_SUMMARY.md`
- Ready for production use
- Currently: 2,529 active/pending payments, 2,516 with bank_account assigned

**Known Limitations:**
- Supplier payments not yet implemented (planned for future)
- Bank reconciliation page not yet implemented (planned for future)
- Historical payments do not have journal entries (pre-dates feature)

**Next Steps:**
- Test manually with different payment scenarios (see testing guide)
- Monitor production for any issues
- Proceed to Phase 1: Purchases & Payables System (highest remaining priority)

---

#### Phase 2.1: Cash Receipt Voucher PDF System (January 13, 2026)

**Problem Solved:** Staff had to double-key cash payments - once in the payment system, then manually create a voucher document elsewhere.

**What Was Implemented:**

1. **Backend Endpoint** - `GET /api/journal-entries/:id/receipt-voucher`
   - Location: `src/routes/accounting/journal-entries.js`
   - Fetches payment + customer + invoice details for REC journal entries
   - Validates entry is type 'REC' and not cancelled
   - Returns complete voucher data including journal lines

2. **PDF Component** - `src/utils/accounting/CashReceiptVoucherPDF.tsx`
   - Professional voucher layout using @react-pdf/renderer
   - Company header with logo
   - Amount displayed with "amount in words" conversion
   - Payment details (customer, invoice, method, reference, bank account)
   - Journal entry lines table (DR/CR)
   - Signature lines for "Received By" and "Approved By"

3. **Preview Modal** - `src/components/Accounting/CashReceiptVoucherModal.tsx`
   - PDF preview in iframe
   - Print button (opens browser print dialog)
   - Download PDF button
   - Loading states

4. **UI Integration** - `src/pages/Accounting/JournalDetailsPage.tsx`
   - "Print Voucher" button (only shows for REC entries that aren't cancelled)
   - Fetches voucher data and opens modal

5. **Types** - `src/types/types.ts`
   - Added `CashReceiptVoucherData` interface
   - Added `CashReceiptVoucherLine` interface

**How to Use:**
1. Record a payment (cash, bank transfer, or confirm a cheque)
2. Navigate to **Accounting → Journal Entries**
3. Find the auto-generated REC entry for that payment
4. Click "Print Voucher" button
5. Preview, print, or download the PDF voucher

**Voucher Contains:**
- Voucher number (REC reference)
- Date, Customer name, Amount (numeric + words)
- Invoice reference, Payment method, Bank account
- Journal entry lines showing DR/CR accounts
- Signature lines

---

### Phase 2.2: Bank Statement from Journal Report

**Why Critical:** This is the primary reconciliation tool - staff generate this report and compare the closing balance against the actual bank statement. If they match, all bank transactions are correctly recorded.

**Reference:** See `bank_statement_from_journal.pdf` for the old system's output format.

**What to Build:**

1. **Bank Statement Report Page**
   - Filter by: Bank Account (BANK_PBB / BANK_ABB / CASH), Date Range
   - Shows all journal entry lines affecting the selected account
   - Calculates running balance

2. **Report Columns** (matching old system):
   | Column | Description |
   |--------|-------------|
   | Date | Journal entry date |
   | Journal | Reference number (REC001/01, PV005/12, JVSL/01/26) |
   | Particulars | Journal description |
   | Cheque | Payment reference (cheque number, transfer ref) |
   | Debit | Money OUT (payments) |
   | Credit | Money IN (receipts) |
   | Balance | Running balance |

3. **Balance Calculation:**
   - Bank accounts are DEBIT balance (Assets)
   - Credit to bank = money IN (increases balance)
   - Debit to bank = money OUT (decreases balance)
   - Running Balance = Opening + Credits - Debits

4. **Reconciliation Helper:**
   - Input: "Bank Statement Balance" (from actual bank)
   - Shows: Difference = Journal Balance - Bank Statement Balance
   - Visual indicator: Green if matched, Red if unreconciled

5. **PDF Export:**
   - Match old system format for familiarity
   - Header: Company name, Bank account, Date range
   - Summary: Opening, Total Debits, Total Credits, Closing

**Backend Query:**
```sql
SELECT
  je.entry_date,
  je.reference_no,
  je.description,
  jel.reference as cheque_ref,
  CASE WHEN jel.debit_amount > 0 THEN jel.debit_amount ELSE NULL END as debit,
  CASE WHEN jel.credit_amount > 0 THEN jel.credit_amount ELSE NULL END as credit
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE jel.account_code = :bank_account
  AND je.entry_date BETWEEN :from_date AND :to_date
  AND je.status != 'cancelled'
ORDER BY je.entry_date, je.id
```

**Files to Create:**
- Backend: `src/routes/accounting/bank-statement.js`
- Frontend: `src/pages/Accounting/BankStatementPage.tsx`
- PDF: `src/utils/accounting/BankStatementPDF.tsx`

**API Endpoints:**
- `GET /api/accounting/bank-statement?account=BANK_PBB&from=2025-12-01&to=2025-12-31`
- `GET /api/accounting/bank-statement/opening-balance?account=BANK_PBB&date=2025-12-01`

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

## Account Mappings Reference

This section documents all account code mappings used throughout the ERP system for auto-journal generation.

### 1. Customer Payment Journal Mappings (REC)

**Trigger:** Customer payment creation/confirmation
**Files:**
- `src/routes/accounting/payment-journal.js`
- `src/routes/sales/invoices/payments.js`
- `src/utils/payment-helpers.js`

**Reference Format:** `REC-YYYYMM-XXXX` (e.g., REC-202601-0001)

**Regular Payments (reduces Trade Receivables):**
| Payment Method | Debit Account | Credit Account | Description |
|----------------|---------------|----------------|-------------|
| Cash | `CASH` | `TR` | Cash in Hand → Trade Receivables |
| Cheque/Transfer (Public Bank) | `BANK_PBB` | `TR` | Public Bank → Trade Receivables |
| Cheque/Transfer (Alliance Bank) | `BANK_ABB` | `TR` | Alliance Bank → Trade Receivables |

**Overpaid Payments (excess amount → Customer Deposits liability):**
| Payment Method | Debit Account | Credit Account | Description |
|----------------|---------------|----------------|-------------|
| Cash | `CASH` | `CUST_DEP` | Cash in Hand → Customer Deposits |
| Cheque/Transfer (Public Bank) | `BANK_PBB` | `CUST_DEP` | Public Bank → Customer Deposits |
| Cheque/Transfer (Alliance Bank) | `BANK_ABB` | `CUST_DEP` | Alliance Bank → Customer Deposits |

**Account Details:**
| Code | Description | Ledger Type | Parent |
|------|-------------|-------------|--------|
| `CASH` | CASH IN HAND | GL | CA |
| `BANK_PBB` | Public Bank Berhad | BK | - |
| `BANK_ABB` | Alliance Bank Berhad | BK | - |
| `TR` | Trade Receivables | TD | - |
| `CUST_DEP` | Customer Deposits/Advances | GL | CL |

**Logic in `determineBankAccount()`:**
```javascript
if (paymentMethod === 'cash') return 'CASH';
return bankAccount || 'BANK_PBB'; // Default to Public Bank
```

---

### 2. Payroll Journal Voucher Mappings

#### 2.1 Director's Remuneration (JVDR) - Location 01

**Reference Format:** `JVDR/MM/YY` (e.g., JVDR/01/26)

**Debit Accounts (Expenses):**
| Mapping Type | Account Code | Description |
|--------------|--------------|-------------|
| `salary` | `MBDRS` | Director's Salary |
| `epf_employer` | `MBDRE` | Director's EPF Employer |
| `socso_employer` | `MBDRSC` | Director's SOCSO Employer |
| `sip_employer` | `MBDRSIP` | Director's SIP Employer |

**Credit Accounts (Accruals):**
| Mapping Type | Account Code | Description |
|--------------|--------------|-------------|
| `accrual_salary` | `ACD_SAL` | Accrual Directors Salary |
| `accrual_epf` | `ACD_EPF` | Accrual Directors EPF |
| `accrual_socso` | `ACD_SC` | Accrual Directors SOCSO |
| `accrual_sip` | `ACD_SIP` | Accrual Directors SIP |
| `accrual_pcb` | `ACD_PCB` | Accrual Directors PCB |

#### 2.2 Staff Salary (JVSL) - Locations 00-24

**Reference Format:** `JVSL/MM/YY` (e.g., JVSL/01/26)

**Credit Accounts - Location 00 (Accruals):**
| Mapping Type | Account Code | Description |
|--------------|--------------|-------------|
| `accrual_salary` | `ACW_SAL` | Accrual Salary Payables |
| `accrual_epf` | `ACW_EPF` | Accrual EPF |
| `accrual_socso` | `ACW_SC` | Accrual SOCSO |
| `accrual_sip` | `ACW_SIP` | Accrual SIP |
| `accrual_pcb` | `ACW_PCB` | Accrual PCB Payables |

**Debit Accounts by Location:**

| Loc | Location Name | Salary/OT/Bonus | EPF | SOCSO | SIP |
|-----|---------------|-----------------|-----|-------|-----|
| 02 | OFFICE | `MBS_O` | `MBE_O` | `MBSC_O` | `MBSIP_O` |
| 03 | SALESMAN | `MBS_SMO`, `MS_SM`¹ | `MBE_SM` | `MBSC_SM` | `MBSIP_SM` |
| 04 | IKUT LORI | `MBS_ILO`, `MS_IL`² | `MBE_IL` | `MBSC_IL` | `MBSIP_IL` |
| 06 | JAGA BOILER | `MBS_JB` | `MBE_JB` | `MBSC_JB` | `MBSIP_JB` |
| 07 | MESIN & SANGKUT MEE | `MS_MM` | `ME_MM` | `MSC_MM` | `MBSIP_MM` |
| 08 | PACKING MEE | `MS_PM` | `ME_PM` | `MSC_PM` | `MBSIP_PM` |
| 09 | MESIN & SANGKUT BIHUN | `BS_MB` | `BE_MB` | `BSC_MB` | `BSIP_MB` |
| 10 | SANGKUT BIHUN | `BS_MB` | `BE_MB` | `BSC_MB` | `BSIP_MB` |
| 11 | PACKING BIHUN | `BS_PB` | `BE_PB` | `BSC_PB` | `BSIP_PB` |
| 13 | TUKANG SAPU | `MBS_TS` | `MBE_TS` | `MBSC_TS` | `MBSIP_TS` |
| 14 | MAINTENANCE | `MBS_M` | `MBE_M` | `MBSC_M` | `MBSIP_M` |
| 16-24 | COMMISSION/BONUS/SPECIAL³ | `MBS_M` | `MBE_M` | `MBSC_M` | `MBSIP_M` |

**Notes:**
- ¹ `MS_SM` used for bonus/commission
- ² `MS_IL` used for commission
- ³ Locations 16-24 (Commission Mesin Mee, Commission Mesin Bihun, Commission Kilang, Commission Lori, Commission Boiler, Commission Forklift/Case, Bonus, Cuti Tahunan, Special OT) all map to Maintenance accounts

---

### 3. Account Mapping Types

The `location_account_mappings` table supports these mapping types:

| Mapping Type | Description | Used In |
|--------------|-------------|---------|
| `salary` | Base salary expense | JVDR, JVSL |
| `overtime` | Overtime pay | JVSL |
| `bonus` | Bonus payments | JVSL |
| `commission` | Sales commission | JVSL |
| `epf_employer` | EPF employer contribution | JVDR, JVSL |
| `socso_employer` | SOCSO employer contribution | JVDR, JVSL |
| `sip_employer` | SIP employer contribution | JVDR, JVSL |
| `accrual_salary` | Salary accrual (credit) | JVDR, JVSL |
| `accrual_epf` | EPF accrual (credit) | JVDR, JVSL |
| `accrual_socso` | SOCSO accrual (credit) | JVDR, JVSL |
| `accrual_sip` | SIP accrual (credit) | JVDR, JVSL |
| `accrual_pcb` | PCB/Tax accrual (credit) | JVDR, JVSL |

---

### 4. Journal Entry Types

| Type Code | Description | Auto-Generated By |
|-----------|-------------|-------------------|
| `REC` | Receipt (Customer Payment) | Payment creation/confirmation |
| `JVDR` | Director's Remuneration | Monthly payroll processing |
| `JVSL` | Staff Salary | Monthly payroll processing |
| `JV` | General Journal | Manual entry |

---

### 5. Unique Account Codes Summary

**Payment System (5 codes):**
- `CASH`, `BANK_PBB`, `BANK_ABB`, `TR`, `CUST_DEP`

**Director's Remuneration (9 codes):**
- Debits: `MBDRS`, `MBDRE`, `MBDRSC`, `MBDRSIP`
- Credits: `ACD_SAL`, `ACD_EPF`, `ACD_SC`, `ACD_SIP`, `ACD_PCB`

**Staff Salary Accruals (5 codes):**
- `ACW_SAL`, `ACW_EPF`, `ACW_SC`, `ACW_SIP`, `ACW_PCB`

**Staff Salary by Department (~40 codes):**
- Office: `MBS_O`, `MBE_O`, `MBSC_O`, `MBSIP_O`
- Salesman: `MBS_SMO`, `MS_SM`, `MBE_SM`, `MBSC_SM`, `MBSIP_SM`
- Ikut Lori: `MBS_ILO`, `MS_IL`, `MBE_IL`, `MBSC_IL`, `MBSIP_IL`
- Boiler: `MBS_JB`, `MBE_JB`, `MBSC_JB`, `MBSIP_JB`
- Mesin Mee: `MS_MM`, `ME_MM`, `MSC_MM`, `MBSIP_MM`
- Packing Mee: `MS_PM`, `ME_PM`, `MSC_PM`, `MBSIP_PM`
- Mesin Bihun: `BS_MB`, `BE_MB`, `BSC_MB`, `BSIP_MB`
- Packing Bihun: `BS_PB`, `BE_PB`, `BSC_PB`, `BSIP_PB`
- Tukang Sapu: `MBS_TS`, `MBE_TS`, `MBSC_TS`, `MBSIP_TS`
- Maintenance/Commission: `MBS_M`, `MBE_M`, `MBSC_M`, `MBSIP_M`

**Total Unique Codes Used in Auto-Journals: ~60 codes**

---

### 6. Configuration Files

| File | Purpose |
|------|---------|
| `src/configs/journalVoucherMappings.ts` | Hardcoded location-to-account mappings (legacy) |
| `src/routes/accounting/journal-vouchers.js` | Dynamic CRUD for `location_account_mappings` |
| `src/utils/payment-helpers.js` | Payment method → bank account mapping |
| `src/routes/accounting/payment-journal.js` | REC journal generation logic |

---

### 7. Database Tables

| Table | Purpose |
|-------|---------|
| `location_account_mappings` | Location → Account code mappings for payroll |
| `account_codes` | Master list of all GL account codes |
| `journal_entries` | Journal entry headers |
| `journal_entry_lines` | Journal entry line items with DR/CR |
| `journal_entry_types` | Valid entry types (REC, JVDR, JVSL, JV, etc.) |

---

## Next Steps

1. **User confirms approach** ✅
2. **Implement Phase 2: Payment journals** ✅ COMPLETED (January 13, 2026)
3. **Implement Phase 2.1: Cash Receipt Voucher PDF** ✅ COMPLETED (January 13, 2026)
4. **Implement Phase 2.2: Bank Statement from Journal Report** (HIGH PRIORITY - enables bank reconciliation)
5. **Implement Phase 1: Purchases & Payables System** (next after bank statement)
6. **Test with real supplier invoices**
7. **Continue through phases based on business priority**

**Estimated Complexity:**
- Phase 2.2 (Bank Statement): ~1-2 days (backend query, frontend table, PDF export)
- Phase 1 (Purchases): ~3-4 days (tables, backend, frontend forms)
- Phase 2 (Payments): ✅ COMPLETED
- Phase 3 (Stock journals): ~1-2 days (integrate with existing stock system)
- Phase 4 (Expenses): ~2-3 days (quick entry forms)

**Remaining development time: ~7-11 days for core system**

---

*Plan created: January 2026*
*Updated: January 13, 2026 - Migrated to semantic note codes (BS_CA_CASH, IS_REV_SALES) and integrated with BANK_CASH_SYSTEM_PLAN.md*
*Updated: January 13, 2026 - Phase 2 (Payment journals) completed and documented*
*Updated: January 14, 2026 - Added comprehensive Account Mappings Reference section*
*Updated: January 14, 2026 - Added CUST_DEP account and journal entries for overpaid payments*
*Updated: January 14, 2026 - Added Phase 2.2: Bank Statement from Journal Report (enables bank reconciliation)*
*Status: Phase 2.2 (Bank Statement) is next priority, then Phase 1 (Purchases)*

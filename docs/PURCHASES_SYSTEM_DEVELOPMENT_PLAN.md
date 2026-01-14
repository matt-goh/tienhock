# Purchases System Development Plan

## Overview

Modernize the supplier purchase invoice system to reduce manual data entry and simplify the double-entry accounting process.

**Current State:** Users manually create journal entries with separate debit/credit lines, typing supplier names each time.

**Target State:** Simplified purchase invoice form that auto-generates balanced journal entries.

---

## Context from Old System

### Screenshots Reference
- `SUPPLIER_LAHAD_DATU.jpg` - Tepung purchase from Lahad Datu Flour Mill
- `SUPPLIER_NITSEI_SAGO.jpg` - Sago purchase from Nitsei Sago Industries

### Old System Entry Pattern
```
Reference: 5050049176 (supplier invoice number)
Type: S (Supplier Invoice)
Date: 09/12/2025

Lines:
01> PU_MTEP    LAHAD DATU FLOUR MILL S/B(500 TEPUNG(500XRM65)    DR 32,500.00
02> CR_LD                                                         CR 32,500.00
03> PU_MTEP    PPI & LOYALTY(500BAGXRM14.20)                     DR 7,100.00
04> CR_LD                                                         CR 7,100.00

A/C Description: LAHAD DATU FLOUR MILL SDN BHD
Total: 39,600.00 (both sides)
```

### Pain Points Identified
1. **Per-supplier creditor codes** (CR_LD, CR_NS) - proliferates account codes
2. **Manual supplier name typing** - error-prone, time-consuming
3. **Redundant double-entry** - same amount entered twice (debit + credit)
4. **No supplier dropdown** - no centralized supplier master

---

## Modernization Design

### Key Simplifications

1. **Single Trade Payables Account**
   - Replace CR_LD, CR_NS, CR_xxx with one `TP` account
   - Track supplier detail in `purchase_invoices` subledger

2. **Supplier Dropdown Selection**
   - User selects supplier from searchable dropdown
   - Supplier name auto-populates in journal description

3. **Auto-Balanced Entry**
   - User enters purchase lines (debit side only)
   - System auto-generates credit to Trade Payables
   - Total always balanced

4. **Preserve Existing Purchase Codes**
   - Keep PU_MTEP, PU_BSAG, etc. for expense categorization
   - These are the debit accounts

---

## Database Schema

### New Tables

```sql
-- Supplier Master
CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(100),
  address TEXT,
  payment_terms INTEGER DEFAULT 30, -- Days
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX idx_suppliers_name ON suppliers(name);
CREATE INDEX idx_suppliers_code ON suppliers(code);

-- Purchase Invoice Header
CREATE TABLE purchase_invoices (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'unpaid', -- unpaid, partial, paid
  amount_paid DECIMAL(15,2) DEFAULT 0,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES staffs(id),
  UNIQUE(supplier_id, invoice_number) -- Same supplier can't have duplicate invoice numbers
);

CREATE INDEX idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX idx_purchase_invoices_date ON purchase_invoices(invoice_date);
CREATE INDEX idx_purchase_invoices_status ON purchase_invoices(payment_status);

-- Purchase Invoice Lines
CREATE TABLE purchase_invoice_lines (
  id SERIAL PRIMARY KEY,
  purchase_invoice_id INTEGER REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  account_code VARCHAR(20) REFERENCES account_codes(code) NOT NULL,
  description TEXT,
  amount DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_purchase_invoice_lines_invoice ON purchase_invoice_lines(purchase_invoice_id);
```

### New Journal Entry Type

```sql
INSERT INTO journal_entry_types (code, name, description, is_active)
VALUES ('PUR', 'Purchase Invoice', 'Auto-generated from supplier purchase invoices', true)
ON CONFLICT (code) DO NOTHING;
```

### Trade Payables Account

```sql
-- Ensure Trade Payables account exists
INSERT INTO account_codes (code, description, ledger_type, is_active)
VALUES ('TP', 'Trade Payables', 'GL', true)
ON CONFLICT (code) DO NOTHING;
```

---

## Supplier Seed Data

Initial supplier list to seed (79 suppliers):

```sql
INSERT INTO suppliers (code, name, is_active) VALUES
('AGRICORE', 'AGRICORE CS SDN BHD', true),
('ALLWIN', 'ALLWIN STATIONERY', true),
('BORNEO_FLEX', 'BORNEO FLEXIBLE PACKAGING SDN BHD', true),
('BUKIT_RAYA', 'BUKIT RAYA SDN BHD', true),
('BESTWISE', 'BESTWISE SDN BHD', true),
('BORNEO_REGAL', 'BORNEO REGAL SDN BHD', true),
('BIGWHEEL', 'BIGWHEEL MARKETING SDN BHD', true),
('CHEMECH', 'CHEMECH VENTURES', true),
('CLS_GEM', 'CLS GEMILANG ENTERPRISE', true),
('CHOO_BEE', 'CHOO BEE HARDWARE (SABAH) S/B', true),
('CESB', 'C.E.S.B', true),
('COMCOBEST', 'COMCOBEST SDN BHD', true),
('DERNYPACK', 'DERNYPACK PLASTIC (M) SDN BHD', true),
('DE_HOME', 'DE HOME LEGEND SDN BHD', true),
('DINXINGS', 'DINXINGS (M) SDN BHD', true),
('DELIG', 'DELIG SDN BHD', true),
('LEBERI', 'LEBERI @ FRANCIS B MARIAN', true),
('GEN_PLASTIC', 'GENERAL PLASTIC TRADING CO', true),
('GREEN_TARGET', 'GREEN TARGET WASTE TREATMENT IND S/B', true),
('EXPOGAYA', 'EXPOGAYA SDN BHD', true),
('HONCO', 'HONCO NARKETING', true),
('HARRISONS', 'HARRISONS SABAH SDN BHD', true),
('HARBOUR_LINK', 'HARBOUR-LINK LINES SDN BHD', true),
('EVERGREEN', 'EVERGREEN MARINE CORP (N) S/B', true),
('JELLY_POLLY', 'JELLY-POLLY FOOD INDUSTRIES', true),
('INBASJAYA', 'INBASJAYA SDN BHD', true),
('IBS_PLASTIC', 'IBS PLACTIC TRD SDN BHD', true),
('INDAHMANIS', 'INDAHMANIS LABEL STICKER & PACKAGING S', true),
('JB_FLOUR', 'JOHOR BAHRU FLOUR MILL S/B', true),
('JOO_LOONG', 'JOO LOONG TRADING CO', true),
('JONG_NA', 'JONG NA CHEMICAL SDN BHD', true),
('KILANG_BERAS', 'KILANG BERAS RAKYAT SEKINCHAN S/B', true),
('KOTABOX', 'KOTABOX PACKAGING SDN BHD', true),
('KB_RICE', 'KB RICE', true),
('KONG_LONG', 'KONG LONG HUAT CHEMICALS SDN BHD', true),
('KK_MACHINERY', 'K.K.MACHINERY SDN BHD', true),
('KK_RICE', 'KK RICE VERNICELLI SDN BHD', true),
('KOWAS', 'KOWAS TRANPSORT SDN BHD', true),
('LEESING', 'LEESING LOGISTICS (EM) S/B', true),
('LAHAD_DATU', 'LAHAD DATU FLOUR MILL SDN BHD', true),
('LEONG_YUN', 'LEONG YUN FAH SDN BHD', true),
('MULTI_BEST', 'MULTI-BEST TRADING SDN BHD', true),
('MIBA', 'MIBA LOGISTICS & FORWARDING SDN BHD', true),
('MARITIME', 'MARITIME & INDUSTRIAL ENGINEERS SDN BH', true),
('MOON_JADE', 'MOON JADE TRADING', true),
('MYCO2', 'MYCO2 (PG) SDN BHD', true),
('NITSEI_SAGO', 'NITSEI SAGO INDUSTRIES SDN BHD', true),
('UNIMECH', 'UNIMECH ENGINEERING (JB) S/B', true),
('PERCETAKAN', 'PERCETAKAN KOLOMBONG RIA SDN BHD', true),
('UNIMEKAR', 'UNIMEKAR CHEMICALS SDN BHD', true),
('PAC_SELATAN', 'PACIFIC SELATAN AGENCY SDN BHD', true),
('PHOUNG_HUAT', 'PHOUNG HUAT ENTERPRISE S/B', true),
('PAUMIN', 'PAUMIN HARDWARE SDN BHD', true),
('PUNCAK_NIAGA', 'PUNCAK NIAGA', true),
('RESOURCE', 'RESOURCE FOOD SUPPLIES (M) SDN BHD', true),
('REDOX', 'REDOX CHEMICALS SDN BHD', true),
('SWEE_HIN', 'SWEE HIN CHAN CO SDN BHD', true),
('CREDIT_SALES', 'CREDIT SALES', true),
('SHANDONG', 'SHANDONG HAOFUXING INTERNATIONAL TRD C', true),
('SA_GENERAL', 'SA GENERAL PLASTICS TRD SDN BHD', true),
('SAGO_LINK', 'SAGO-LINK SDN BHD', true),
('SHAH_JAYA', 'SYARIKAT SHAH JAYA', true),
('STELLAR', 'STELLAR PLASTIK SDN BHD', true),
('SERBA_WANGI', 'SERBA WANGI SDN BHD', true),
('TAN_KIEN', 'TAN KIEN CHONG (SABAH) SDN BHD', true),
('SHIN_YANG', 'SHIN YANG SHIPPING SDN BHD', true),
('SAN_SENG', 'SAN SENG LEE (KEDAH) SDN BHD', true),
('SUDI_LAJU', 'SUDI LAJU SDN BHD', true),
('SAZARICE', 'SAZARICE SDN BHD', true),
('SRI_NAJU', 'SRI NAJU JAYA TRADING', true),
('UNIANG', 'UNIANG PLASTIC INDUSTRIES (SABAH) SDN', true),
('UNIRAW', 'UNIRAW DAIRIES & FOOD S/B', true),
('WIN_HIN', 'WIN HIN MACHINERY (M) SDN BHD', true),
('QINGDAO_H', 'QINGDAO HONGFULEI TRADE CO,.LTD', true),
('Q_FLEX', 'Q-FLEX IND (M) SDN BHD', true),
('QINGDAO_S', 'QINGDAO SHENGDA COMMERCIAL & TRADE CO.', true),
('NCT', 'NCT FORWARDING & SHIPPING S/B', true),
('PAC_SELATAN2', 'PACIFIC SELATAN AGENCY S/B', true),
('NTT', 'NTT SHIPPING SDN BHD', true),
('YESOKEY', 'YESOKEY FOOD SDN BHD', true),
('TOMBER', 'TOMBER INDUSTRIAL SDN BHD', true)
ON CONFLICT (code) DO NOTHING;
```

---

## API Endpoints

### Suppliers API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/suppliers` | List all suppliers (with search, filter) |
| GET | `/api/suppliers/:id` | Get single supplier |
| POST | `/api/suppliers` | Create new supplier |
| PUT | `/api/suppliers/:id` | Update supplier |
| DELETE | `/api/suppliers/:id` | Soft delete (set is_active=false) |
| GET | `/api/suppliers/:id/balance` | Get outstanding balance |

### Purchase Invoices API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/purchases` | List invoices (with filters: supplier, date range, status) |
| GET | `/api/purchases/:id` | Get single invoice with lines |
| POST | `/api/purchases` | Create invoice + auto-generate journal |
| PUT | `/api/purchases/:id` | Update invoice (if not paid) |
| DELETE | `/api/purchases/:id` | Delete invoice + cancel journal |

---

## Frontend Pages

### 1. Suppliers List Page
**Route:** `/accounting/suppliers`

- Table with columns: Code, Name, Contact, Phone, Outstanding Balance, Status
- Search by name/code
- Filter by active/inactive
- "Add Supplier" button
- Click row → Edit supplier

### 2. Supplier Form Page
**Route:** `/accounting/suppliers/new` or `/accounting/suppliers/:id/edit`

- Form fields:
  - Code (required, unique)
  - Name (required)
  - Contact Person
  - Phone
  - Email
  - Address (textarea)
  - Payment Terms (days, default 30)
  - Active (toggle)

### 3. Purchase Invoices List Page
**Route:** `/accounting/purchases`

- Table with columns: Date, Invoice #, Supplier, Amount, Status, Journal Ref
- Filters: Date range, Supplier dropdown, Status (unpaid/partial/paid)
- "New Invoice" button
- Click row → View/Edit invoice

### 4. Purchase Invoice Form Page
**Route:** `/accounting/purchases/new` or `/accounting/purchases/:id/edit`

**Header Section:**
- Supplier (searchable dropdown, required)
- Invoice Number (text, required)
- Invoice Date (date picker, required)
- Notes (optional)

**Lines Section (spreadsheet-style):**
| # | Account Code | Description | Amount |
|---|--------------|-------------|--------|
| 1 | [Dropdown]   | [Text]      | [Number] |
| 2 | [Dropdown]   | [Text]      | [Number] |
| + Add Line |

**Footer:**
- Total Amount (auto-calculated)
- "Save" button (creates invoice + journal entry)

---

## Auto-Journal Generation Logic

When a purchase invoice is saved:

```javascript
// Generate journal entry
const journalEntry = {
  reference_no: `PUR-${invoice.invoice_number}`,
  entry_type: 'PUR',
  entry_date: invoice.invoice_date,
  description: supplier.name,
  lines: []
};

// Add debit lines (one per invoice line)
invoice.lines.forEach((line, index) => {
  journalEntry.lines.push({
    line_number: index + 1,
    account_code: line.account_code, // e.g., PU_MTEP
    debit_amount: line.amount,
    credit_amount: 0,
    particulars: line.description
  });
});

// Add single credit line to Trade Payables
journalEntry.lines.push({
  line_number: invoice.lines.length + 1,
  account_code: 'TP', // Trade Payables
  debit_amount: 0,
  credit_amount: invoice.total_amount,
  particulars: `Payable to ${supplier.name}`
});
```

---

## UI/UX Design Notes

### Purchase Invoice Form

1. **Supplier Selection**
   - Use searchable Listbox (like existing FormListbox)
   - Show supplier name and code
   - Type-ahead filtering

2. **Account Code Selection**
   - Filter to show only purchase-related accounts (PU_* codes)
   - Searchable dropdown

3. **Auto-Save Journal**
   - Journal entry created immediately on save
   - No separate "Post" step needed
   - Link displayed in invoice list

4. **Line Entry**
   - Similar to JournalEntryPage spreadsheet style
   - Tab between cells
   - Auto-add row when last row has data

---

## Files to Create

### Backend
- `src/routes/accounting/suppliers.js` - Supplier CRUD endpoints
- `src/routes/accounting/purchases.js` - Purchase invoice endpoints + journal generation

### Frontend
- `src/pages/Accounting/Suppliers/SuppliersPage.tsx` - Supplier list
- `src/pages/Accounting/Suppliers/SupplierFormPage.tsx` - Add/Edit form
- `src/pages/Accounting/Purchases/PurchaseInvoicesPage.tsx` - Invoice list
- `src/pages/Accounting/Purchases/PurchaseInvoiceFormPage.tsx` - Invoice entry form

### Types
- Add to `src/types/types.ts`:
  - `Supplier` interface
  - `PurchaseInvoice` interface
  - `PurchaseInvoiceLine` interface

### Migration
- `migrations/add_purchases_system.sql` - All schema + seed data

### Routes
- Update `src/routes/accounting/index.js` - Register new routes
- Update `TienHockSidebarData.tsx` - Add menu items

---

## Implementation Order

### Step 1: Database Migration
- Create tables (suppliers, purchase_invoices, purchase_invoice_lines)
- Add journal entry type 'PUR'
- Ensure 'TP' account exists
- Seed supplier data

### Step 2: Supplier CRUD
- Backend API endpoints
- Frontend list page
- Frontend form page
- Test CRUD operations

### Step 3: Purchase Invoice Entry
- Backend API endpoints
- Auto-journal generation logic
- Frontend list page
- Frontend form page

### Step 4: Integration & Testing
- Test full flow: Create supplier → Create invoice → Verify journal
- Test subledger reconciliation (sum of invoices = TP balance)
- Add to sidebar navigation

---

## Notes

### Stock Entry Workflow
The existing `MaterialStockEntryPage.tsx` handles closing stock quantities separately. This purchases system does NOT modify stock quantities - it only records the financial transaction (journal entry). Staff will continue to enter stock counts as they do today.

### Backward Compatibility
- Existing CR_* creditor codes can remain in the system (inactive)
- Historical journal entries with CR_LD, CR_NS are preserved
- New purchases use single TP account

### Future: Supplier Payments
After purchases are working, implement supplier payment recording:
- Link payment to invoice(s)
- Auto-journal: DR TP, CR Bank
- Track outstanding balances

---

*Plan created: January 14, 2026*
*Status: Ready for development*

# Accounting System Audit — Handover

This document hands an in-progress accounting-system audit conversation from Claude Code to Claude on claude.ai (Projects). The user is the owner/dev of the **Tien Hock ERP** — a multi-company ERP (Tien Hock / Green Target / Jelly Polly) that is gradually replacing a 20-year-old legacy accounting system.

---

## The task

Produce **two lists** of features missing from the new ERP's accounting module:

**Type 1 — Standard accounting capabilities any Malaysian ERP should have.** Split into two ranked sub-sections (user picked this option):
1. **Must-have for Malaysian audit / compliance** (what an external auditor, LHDN, or SSM would expect — e.g. Cash Flow Statement, Statement of Changes in Equity, SST-02 return, CP204 estimation, Fixed Asset Register with depreciation schedule)
2. **Must-have for daily operations** (what saves the most manual work — e.g. bank-statement-from-journal view, supplier payments, period close, account ledger drill-down)

For each item: **rank by importance**, and **note whether the new ERP already has it (✅ done / 🟡 partial / ❌ missing)**.

**Type 2 — Features identified in the legacy system but missing from the new ERP.** Ranked by user-pain priority. The user already started this thread on the Claude Code side and produced a revised list (see "Conclusions so far" below).

The user's #1 acknowledged gap (top of Type 2): the **bank-statement-from-journal report** (running ledger view of any bank/cash account, used to reconcile against the actual bank statement). Already partially specified in [docs/Account/ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md](docs/Account/ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md) Phase 2.2.

The user's #2 acknowledged gap: **journal generation for local general purchases** (the existing `LocalGeneralPurchaseFormPage` does not create journal entries — only material purchases do).

---

## Reading order for new Claude

Read these docs in order before doing anything:

1. [docs/Account/TRIAL_BALANCE_ANALYZED_BY_USER.md](docs/Account/TRIAL_BALANCE_ANALYZED_BY_USER.md) — the user's own walk-through of every legacy trial-balance code prefix. **Most important single doc** for understanding the legacy system.
2. [docs/Account/FINANCIAL_STATEMENTS_MAPPING.md](docs/Account/FINANCIAL_STATEMENTS_MAPPING.md) — how `account_codes.fs_note` maps codes to the 33 financial-statement notes. The legacy trial balance's "APPX" column is literally this `fs_note` number.
3. [docs/Account/ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md](docs/Account/ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md) — the active phased plan. Phase 2 (customer payment journals) is done; Phase 2.1 (cash-receipt voucher PDF) is done; Phase 2.2 (bank statement from journal) is next; Phase 1 (purchases & payables) is in progress.
4. [docs/Account/PAYMENT_JOURNAL_IMPLEMENTATION_SUMMARY.md](docs/Account/PAYMENT_JOURNAL_IMPLEMENTATION_SUMMARY.md) — what got built for customer payment journals.
5. [docs/Account/BANK_CASH_SYSTEM_PLAN.md](docs/Account/BANK_CASH_SYSTEM_PLAN.md) and [docs/Account/FRESH_ACCOUNTING_SYSTEM_PLAN.md](docs/Account/FRESH_ACCOUNTING_SYSTEM_PLAN.md) — older planning docs, useful for backstory.
6. [docs/Account/AccountCodeCalculations.md](docs/Account/AccountCodeCalculations.md) — how the existing JVDR/JVSL payroll journal vouchers calculate.
7. [CLAUDE.md](CLAUDE.md) — codebase rules + full DB schema. Project rules: surgical changes, ask before modifying things not requested, no speculative abstractions.

---

## Current implementation status (verified by code scan)

### Backend (`src/routes/accounting/`)

| File | Purpose | Auto-journals? |
|------|---------|----------------|
| [journal-entries.js](src/routes/accounting/journal-entries.js) | CRUD for journal entries + types | Manual posting only |
| [payment-journal.js](src/routes/accounting/payment-journal.js) | Customer payment receipts | Yes — `entry_type='REC'` |
| [purchase-invoices.js](src/routes/accounting/purchase-invoices.js) | Material purchase invoices | Yes — `entry_type='PUR'` |
| [suppliers.js](src/routes/accounting/suppliers.js) | Supplier master CRUD | No |
| [self-billed-invoices.js](src/routes/accounting/self-billed-invoices.js) | General Purchases (local + foreign e-invoice) | **No — gap** |
| [journal-vouchers.js](src/routes/accounting/journal-vouchers.js) | Payroll JVDR/JVSL auto-journal | Yes |
| [financial-reports.js](src/routes/accounting/financial-reports.js) | Trial Balance / P&L / BS / CoGM | Read-only |
| [account-codes.js](src/routes/accounting/account-codes.js) | Chart of accounts CRUD | No |
| [debtors.js](src/routes/accounting/debtors.js) | AR aging | Read-only |
| [ledger-types.js, materials.js](src/routes/accounting/) | Supporting CRUD | No |

[src/utils/payment-helpers.js](src/utils/payment-helpers.js) maps payment method → `CASH` / `BANK_PBB` / `BANK_ABB`.

### Frontend (`src/pages/Accounting/`)

**Present:**
- Journal Entries: list / create / edit / view ([JournalEntryListPage.tsx](src/pages/Accounting/JournalEntryListPage.tsx), [JournalEntryPage.tsx](src/pages/Accounting/JournalEntryPage.tsx), [JournalDetailsPage.tsx](src/pages/Accounting/JournalDetailsPage.tsx))
- Chart of Accounts ([AccountCodeListPage.tsx](src/pages/Accounting/AccountCodeListPage.tsx), [AccountCodeFormPage.tsx](src/pages/Accounting/AccountCodeFormPage.tsx))
- Voucher Generator (payroll JVDR/JVSL — [VoucherGeneratorPage.tsx](src/pages/Accounting/VoucherGeneratorPage.tsx))
- Location Account Mappings ([LocationAccountMappingsPage.tsx](src/pages/Accounting/LocationAccountMappingsPage.tsx))
- Reports: Trial Balance, Income Statement, Balance Sheet, CoGM ([src/pages/Accounting/Reports/](src/pages/Accounting/Reports/))
- Debtors aging ([DebtorsReportPage.tsx](src/pages/Accounting/DebtorsReportPage.tsx))
- Purchases: Suppliers ([SuppliersListPage.tsx](src/pages/Accounting/Purchases/SuppliersListPage.tsx) + form), Material Purchases (list + form), General Purchases ([GeneralPurchaseInvoiceListPage.tsx](src/pages/Accounting/Purchases/GeneralPurchaseInvoiceListPage.tsx), [LocalGeneralPurchaseFormPage.tsx](src/pages/Accounting/Purchases/LocalGeneralPurchaseFormPage.tsx), foreign form)
- Cash Receipt Voucher modal + PDF ([CashReceiptVoucherModal.tsx](src/components/Accounting/CashReceiptVoucherModal.tsx), [CashReceiptVoucherPDF.tsx](src/utils/accounting/CashReceiptVoucherPDF.tsx))

**Notable absences:**
- Bank Statement / Bank Reconciliation page
- Payment Voucher (PV) print (only Cash Receipt Voucher exists)
- Supplier payment entry (no "pay this supplier invoice" workflow)
- Supplier statement / supplier ledger drill-down
- Director's account ledger
- Account ledger drill-down (any account → all transactions, running balance)
- Fixed asset register / depreciation schedule
- Hire purchase amortization schedule
- Opening balance setup page
- Period close / month-end lock
- Tax computation (LHDN, CP204, CP500, SST-02)
- AP aging
- Cash flow statement
- Statement of changes in equity
- Schedule B (admin-expense breakdown for Income Statement audit)
- Prior-period comparison columns on reports

---

## Legacy system in one page (from the user's uploaded images)

The user dropped scans of the legacy chart of accounts, opening balance sheet, trial balance, CoGM, P&L and Balance Sheet. Key findings:

### Account code structure (legacy)

Every code is a **prefix-based mnemonic**. Examples from user-supplied images:

| Prefix | Meaning | FS Note |
|--------|---------|---------|
| `CR_*` | Trade creditor (one code per supplier — CR_LD, CR_NS, CR_LYF, CR_JM, ~80 suppliers) | 13 |
| `CL_TP` | Trade Payables (target consolidation for all `CR_*`) | 13 |
| `CL_NON` | Non-trade payables (CL_GT, CL_GF, CL_JP = inter-company; OC_* = other creditors) | 8 / 10 |
| `CL_GTH`, `CL_WSF` | Amount Due to Director (Goh Thai Ho, Wong Shuk Fun) | 9 |
| `CL_LOAN` → `CL_PB13`, `CL_PB16`, `CL_SCB` | Term loans | 11 |
| `CL_HPA` → `HPA_6893`, `HPA_PILL`, `HPA_SWJ988` etc. | Hire purchase principal | 16 |
| `CL_HPB` → `HPB_6893` etc. (mirrors HPA) | HP interest in suspense | 23 |
| `ACC` → `ACW_EPF`, `ACW_SC`, `ACW_SAL`, `ACW_PCB`, `ACW_SIP`, `AC_TAX`, `AC_SESB`, `AC_TM`, `AC_LEVY`, `AC_INS` | Accruals | 1 |
| `ACD_*` | Director-specific accruals | 1 |
| `NCA_*` → `NCA_FB`, `NCA_MV`, `NCA_PM`, `NCA_OE`, `NCA_FF`, `NCA_PL`, `NCA_RV`, `NCA_CW` | Property, Plant & Equipment | 4 |
| `AD_*` → `AD_FB`, `AD_MV`, `AD_PM`, `AD_OE`, `AD_FF`, `AD_PL`, `AD_RV` | Accumulated depreciation (contra-asset, mirrors NCA) | 4 |
| `CA_*` | Current asset subledger codes (TR=Trade Receivables, CFH=Cash debtors, WA=Workers Advance, prepayments, deposits, inter-co receivables, FD, etc.) | 6 / 8 / 19 / 22 |
| `OS_*` (one per product/material) | Opening Stock | 3-1 / 3-3 / 3-7 |
| `CS_*` (one per product/material) | Closing Stock | 14-1 / 14-2 / 14-3 |
| `PU_*` | Purchase of raw material/ingredient | 3-5 |
| `PU_CHEM`, `PU_MBCHEM` | Purchase of chemical (Maritime & Industrial Engineers) | 3-4 |
| `PM` / `PM_*` | Packing material purchases | 3-2 |
| `BFT_*` (KOW, LS) | Freight In on raw materials (Kowas Transport, Leasing Logistic) | 3-6 |
| `MB*` (MBADV, MBBC, MBC, MBDON, MBEW, MBOR, MBPS, MBRM…) | Admin expense by nature (~40 codes) | 5 |
| `MBS_O`, `MBS_M`, `MBE_*`, `MBSC_*`, `MBSIP_*`, `MBDR*` (and `MS_*`, `BS_*`) | Salaries / EPF / SOCSO / SIP per location | 5 / 5-1 |
| `BT*`, `OIL*`, `R*`, `SV*`, `TAX*`, `TY*`, `INS*`, `PT*` (each with per-vehicle suffix e.g. `BT6304`, `INS6323`) | Vehicle running expenses (battery, diesel, repair, service, road tax, tyre, insurance, patching) — all rolled up into `VRE` (Vehicle Running Expenses) in Schedule B | 5 |
| `CASH_SALES`, `CR_SALES`, `SLS*` | Revenue | 7 |
| `IN_OTH`, `IN_PSU`, `IN_AI`, `IN_PPE` | Other income / gain on disposal | 18-1 / 18-2 |
| `SC` | Share Capital | 21 |
| `RP`, `RP_MTH` | Retained Profit | 20 |
| `DEBTOR` | Total Trade Receivables (control account) | 22 |

### Legacy reports the user has uploaded

- **Trial Balance** (`TRIAL BALANCE FOR THE MONTH OF 12/2024`) — columns: ACC/CODE, PARTICULAR, **APPX** (= `fs_note`), DEBIT, CREDIT. Totals balance: 20,806,612.63 DR = 20,806,612.63 CR.
- **Cost of Goods Manufactured** — matches the new ERP's CoGM page structure exactly.
- **Detail Income Statement** — Revenue (7) → Cost of Sales (3-1 + CGM − 14-1) = Gross Profit → + Other Operating Income (18-1, 18-2) → − Admin Expenses (Note 5 + Note 15) → Profit from Ops → − Finance Costs (Note 23) → Profit Before Tax → − Tax (Note 3) = Profit for FY.
- **Balance Sheet** — Non-Current Asset (Note 4) + Current Assets (14-1, 14-2, 14-3, 22, 8, 17, 6, 19) − Current Liabilities (13, 1, 10, 9, 16, 11, 12) = Net Assets; Financed By: SC (21) + Retained Profit B/F (20) + Profit for FY.
- **Schedule A — CoGM (with prior-year comparison column)** — same as CoGM but two periods side-by-side.
- **Schedule B — Administrative Expenses (with prior-year comparison)** — itemized rollup of all `MB*` and vehicle codes into named line items: Advertisement, Auditors' Remuneration, Bank Charges, Cleaning, Depreciation, Directors' EPF/Salary/SOCSO, Donations, Electricity & Water, EPF, Entertainment, Hiring of Plant, Insurance, Inspection Fee, Legal & Professional, Levy, License, Medical, Newspaper, Office Refreshment, Penalty, Postage & Telephone, Printing & Stationery, PPE Written Off, Quit Rent, Repair & Maintenance, Secretarial, SOCSO, Staff Uniform, Subscription, Sundry, Staff Messing, Staff Training, Travelling, Transportation, Upkeep of Factory, Upkeep of Machinery, **Vehicle Running Expenses (VRE = Σ BT* + INS* + OIL* + R* + SV* + TAX* + TY* + PT*)**, Work Pass, Safety & Health.
- **Opening Balance as at 1 Sep 2012** — the migration-day setup sheet. Every account listed with DR or CR balance.
- **PBB Bank running ledger** (the image attached in the original session) — columns: DATE, JOURNAL, PARTICULARS, CHEQUE, DEBIT, CREDIT, BALANCE (DR/CR). Journal types seen: `RV###/MM` (cash sales receipt), `TRddmmYY` (cheque receipt from debtor), `PBE###/MM` (bulk supplier payment via single cheque), `JV##/MM/##` (manual journal e.g. bank charges), `MIB######`/`PBB######`/`PIB######` (cheque receipts named by drawer's bank), and AMOUNT DUE TO DIRECTOR entries.

### Key insights from the legacy reports

1. **The "APPX" column = `fs_note`** — the bridge between 2,754 leaf codes and ~25 statement lines is the same `fs_note` column the new ERP already has. New ERP doesn't need to rebuild this bridge.
2. **Schedule B is the missing audit-readiness piece.** New IncomeStatementPage shows Note 5 as one number; the legacy breaks it into ~40 line items by expense nature. Without Schedule B equivalent, the new system can't produce a P&L an auditor would accept.
3. **VRE rollup is non-trivial.** ~120 per-vehicle codes (`BT6304`, `INS6323`, `R6893`, etc.) collapse into one "Vehicle Running Expenses" number. The user has already simplified this in the new system (consolidated codes), but the historical rollup pattern is preserved in Schedule B.
4. **HPA/HPB are paired.** Every hire-purchase asset has a principal account (`HPA_*`, CL-side) and an interest-in-suspense account (`HPB_*`, also CL-side). Monthly entry: DR `HPA_*` + DR `HPI` (interest expense, Note 23) + CR Bank, and CR `HPB_*` (releases interest from suspense into expense). New ERP has neither.
5. **The PBB bank running ledger is just a specialised "Account Ledger".** Same view shape works for any account code — supplier (`CR_LD`), director (`CL_WSF`), prepayment (`CA_INS`), inter-company (`CL_GT`). Building one generic Account Ledger page solves many missing-report items at once.

---

## Decisions already made (do not re-litigate)

- **Keep the journal-entry system.** The user briefly considered abandoning it; we agreed to keep it as the engine and build cleaner transaction screens that auto-post (same pattern as JVDR/JVSL and now REC/PUR).
- **Type 1 list ranking**: split into two sub-sections — Malaysian audit/compliance, then daily operations. Each ranked internally.
- **Don't expand `account_codes` table.** The new ERP intentionally uses ~60 simplified codes vs the legacy's 2,754. Subledger detail lives in `purchase_invoices`, `invoices`, `payments`, etc.
- **Type 2 #1 priority = bank-statement-from-journal report** (the running ledger view). Already partially specified in [docs/Account/ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md](docs/Account/ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md) Phase 2.2.
- **Type 2 #2 priority = journal generation for local general purchases.** Currently [LocalGeneralPurchaseFormPage](src/pages/Accounting/Purchases/LocalGeneralPurchaseFormPage.tsx) creates `self_billed_invoices` rows but no journal entry. Material purchases do it ([purchase-invoices.js:69](src/routes/accounting/purchase-invoices.js) — `createPurchaseJournalEntry`); local general purchases need an equivalent.

---

## Conclusions so far — revised Type 2 list

This is what the Claude Code session produced last. New Claude can refine but shouldn't start from zero.

### Confirmed missing (definitely build)

1. **Account Ledger / GL drill-down (any account)** — the generic form of the PBB bank statement. Drill into `CR_LD` to see all supplier invoices + payments + running balance; into `CL_WSF` to see all director advances + repayments; into `CA_INS` to see all insurance prepayment movements. **One page solves multiple missing reports.**
2. **Schedule B — Administrative Expenses breakdown** — must back the Income Statement's Note 5. Maps `MB*`/`BT*`/`INS*`/`R*`/`SV*`/`TY*`/`TAX*`/`OIL*`/`PT*` codes into named expense categories. With prior-period comparison column.
3. **Schedule A — CoGM with prior-year comparison column** (existing CoGM page is single-period).
4. **Fixed Asset Register + monthly depreciation schedule** — backs Note 4 + Note 15. Per asset: acquisition date, cost, useful life, monthly depr, accum depr, NBV.
5. **Hire Purchase Schedule (per contract)** — backs Note 16 + Note 23. Per HPA/HPB pair: monthly principal + interest amortization.
6. **Opening Balance setup screen** — for migration cutover. Every account, DR or CR amount as at cutoff date.
7. **Balance Sheet & Income Statement with prior-year comparison columns** (existing reports are single-period).
8. **Bank Reconciliation worksheet** — takes the bank-statement-from-journal closing balance + outstanding cheques + deposits in transit → reconciles to actual bank statement. Phase 2.2 bank statement is the *input* to this.

### Likely missing — confirm from PDFs

9. **AP Aging Report** (supplier aging, mirror of existing Debtors aging).
10. **Cash Book** (might just be a special case of #1).
11. **Note-disclosure backing schedules** — Note 8 detail, Note 9 detail (per-director balance), Note 10 detail (OC_*), Note 13 detail (per-supplier balance), Note 16 detail (HP).

---

## Open questions for the user (need answers before finalising)

1. **`THJ_CK` 2,013.60 / `THJ_SM` 1,919.25** (in trial balance under Note 5-1) — are these Tien Hock paying salaries on behalf of Jelly Polly (inter-company recharge)? If yes, should sit under `CA_MBHJ` (receivable from Jelly Polly), not Note 5-1.
2. **`NT_7484` 70,201.00** (under Note 5) — handwriting links this to QR-281 (Quit Rent NT213077484). Confirm it's a quit-rent prepayment that's currently mis-classified under Note 5, should be Note 8.
3. **`CL_GT` 59,420.50 DR / `CL_GF` 25,696.82 DR** — debit balances parked on the liability side. These are actually *receivables from* Green Target / Green Family (inter-company). The legacy keeps them on the liability side anyway. New ERP — keep this convention or split into receivable/payable?
4. **`BTRA` Transportation 10,731.89** — is this delivery-out cost (admin expense Note 5), vs `BFT_KOW/BFT_LS` which is freight-in on raw materials (CoGM Note 3-6)?
5. Do legacy reports exist for: **supplier statement, director ledger, HP amortization schedule, fixed asset register, AP aging, bank reconciliation worksheet**? User said they'd send screenshots if available.

---

## Files the user is uploading to the Claude.ai project

(User confirms which ones they actually drop.)

- 4 legacy PDFs: `core_tienhock_acc_docs.pdf` (103-page trial balance), `Account-code-documents.pdf` (69-page chart of accounts), `Balance-sheet.pdf` (31 pages), `Balance-sheet-information.pdf` (18 pages)
- Image attachments already shown: PBB bank statement printout (page 9), legacy chart of accounts photos with handwritten annotations, legacy trial balance scans, legacy CoGM/P&L/Balance Sheet template scans
- Possibly: supplier statement, director ledger, HP schedule, fixed asset register, bank reconciliation worksheet (if user has them)

---

## What to deliver

A single markdown response with:

### Type 1 — Standard accounting capabilities for a Malaysian ERP

**Sub-section A: Must-have for Malaysian audit / compliance** (ranked)
- Each item: name, one-sentence definition in *this* business's terms (use their codes), status (✅/🟡/❌), what it would enable

**Sub-section B: Must-have for daily operations** (ranked)
- Same format

### Type 2 — Legacy-system features missing from new ERP

Use the "Conclusions so far" list above as starting point. Refine with what the PDFs show. Each item: legacy name → new-ERP-shape, status, what user pain it solves.

**Keep the response scannable.** Tables where possible. Markdown links to existing files using relative paths like `[file](src/path.tsx)`. No fluff.

Once the lists are tight, the user will decide which to build next. Do NOT start designing implementations — that's a separate plan-mode session.

---

*Handover written 2026-05-26 from a Claude Code session that exhausted its ability to OCR scanned PDFs. The web Claude has native PDF reading, so it can verify and extend everything in this doc by reading the 4 source PDFs directly.*

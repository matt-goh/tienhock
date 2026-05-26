# Tien Hock ERP — Accounting Module: What's Missing

Gap analysis requested in the handover. Two lists:

- **Type 1** — standard capabilities any Malaysian manufacturing Sdn Bhd's ERP should have.
- **Type 2** — capabilities the legacy system had that the new ERP doesn't.

Statuses verified against the repo (`src/routes/accounting/`, `src/pages/Accounting/`, the planning docs) and the handover's code scan, as of 26 May 2026. It opens with the chart-of-accounts question, because that decision shapes *how* a few items below get built — but, importantly, not *whether* they are needed.

**Legend:** ✅ built · 🟡 partly built · ❌ not built.

---

## What's already built *(the baseline)*

Verified by code scan and a query against the dev DB on 26 May 2026. Grouped by capability area so the picture lines up with the gap tables further down. Anything missing from this section is a gap covered below.

### Posting engine

| Capability | Status | Where |
|---|---|---|
| Journal entries CRUD — header + lines, balanced double-entry, posted entries immutable | ✅ | [journal-entries.js](src/routes/accounting/journal-entries.js), [JournalEntryPage](src/pages/Accounting/JournalEntryPage.tsx) |
| **Auto-posted entry types:** `REC` (customer receipts), `PUR` (material purchases), `JVDR` + `JVSL` (payroll director's & staff salary vouchers) | ✅ | [payment-journal.js](src/routes/accounting/payment-journal.js), [purchase-invoices.js](src/routes/accounting/purchase-invoices.js), [journal-vouchers.js](src/routes/accounting/journal-vouchers.js) |
| Manual general-journal entries (`J` type) for ad-hoc postings | ✅ | [JournalEntryPage](src/pages/Accounting/JournalEntryPage.tsx) |

### Customer / sales loop *(end-to-end)*

| Capability | Status | Where |
|---|---|---|
| Sales invoices + order lines + MyInvois submission + monthly consolidation | ✅ | `invoices`, `order_details` |
| Customer payments → auto-journal `REC` (DR Bank/Cash · CR Trade Receivables), routed by payment method to `CASH` / `BANK_PBB` / `BANK_ABB` | ✅ | [payment-journal.js](src/routes/accounting/payment-journal.js), [payment-helpers.js](src/utils/payment-helpers.js) |
| Cash Receipt Voucher modal + printable PDF | ✅ | [CashReceiptVoucherModal.tsx](src/components/Accounting/CashReceiptVoucherModal.tsx), [CashReceiptVoucherPDF.tsx](src/utils/accounting/CashReceiptVoucherPDF.tsx) |
| Debtors aging report + PDF | ✅ | [DebtorsReportPage](src/pages/Accounting/DebtorsReportPage.tsx), [DebtorsReportPDF.tsx](src/utils/accounting/DebtorsReportPDF.tsx) |
| Customer Statement of Account PDF | ✅ | [CustomerStatementPDF.tsx](src/utils/accounting/CustomerStatementPDF.tsx) |
| Credit / Debit / Refund Notes (Tien Hock + Jelly Polly) — atomic balance cascade, customer credit reversal, journal posting, MyInvois | ✅ | `adjustment_documents`, `jellypolly.adjustment_documents` |

### Purchases / payables *(half-loop)*

| Capability | Status | Where |
|---|---|---|
| Supplier master CRUD | ✅ | [SuppliersListPage](src/pages/Accounting/Purchases/SuppliersListPage.tsx), [SupplierFormPage](src/pages/Accounting/Purchases/SupplierFormPage.tsx) |
| Material purchase invoice → auto-journal `PUR` (DR purchase account by category · CR Trade Payables) | ✅ | [MaterialPurchaseFormPage](src/pages/Accounting/Purchases/MaterialPurchaseFormPage.tsx), [purchase-invoices.js](src/routes/accounting/purchase-invoices.js) |
| Material-category → GL-account mapping table (PUR / PM etc.) | ✅ | `material_purchase_account_mappings` |
| Foreign General Purchase form + manual self-billed e-Invoice submission to MyInvois (FX rate, supporting documents, foreign supplier profiles) | ✅ | [GeneralPurchaseInvoiceFormPage](src/pages/Accounting/Purchases/GeneralPurchaseInvoiceFormPage.tsx), [self-billed-invoices.js](src/routes/accounting/self-billed-invoices.js) |
| Local General Purchase form (utilities, stationery, services) | 🟡 | [LocalGeneralPurchaseFormPage](src/pages/Accounting/Purchases/LocalGeneralPurchaseFormPage.tsx) — writes the `self_billed_invoices` row but creates **no journal entry** *(= Type 1 / 1B-3, Type 2 / #2)* |
| Supplier payment entry / AP aging / supplier statement | ❌ | *(= 1B-4 / 1B-5 / 1B-6)* |

### Payroll → GL

| Capability | Status | Where |
|---|---|---|
| Voucher Generator: monthly payroll → `JVDR` (Director's Remuneration) + `JVSL` (Staff Salary) journals, posted to GL with per-location splits | ✅ | [VoucherGeneratorPage](src/pages/Accounting/VoucherGeneratorPage.tsx), [journal-vouchers.js](src/routes/accounting/journal-vouchers.js) |
| Location-account mappings — drives JVDR/JVSL account selection per location (01/02/04/06/07/08) | ✅ | [LocationAccountMappingsPage](src/pages/Accounting/LocationAccountMappingsPage.tsx) |

### Financial reports *(single-period)*

| Capability | Status | Where |
|---|---|---|
| Trial Balance + PDF (with `APPX` / `fs_note` column) | 🟡 | [TrialBalancePage](src/pages/Accounting/Reports/TrialBalancePage.tsx), [TrialBalancePDF.tsx](src/utils/accounting/TrialBalancePDF.tsx) |
| Income Statement + PDF | 🟡 | [IncomeStatementPage](src/pages/Accounting/Reports/IncomeStatementPage.tsx), [IncomeStatementPDF.tsx](src/utils/accounting/IncomeStatementPDF.tsx) |
| Balance Sheet + PDF | 🟡 | [BalanceSheetPage](src/pages/Accounting/Reports/BalanceSheetPage.tsx), [BalanceSheetPDF.tsx](src/utils/accounting/BalanceSheetPDF.tsx) |
| Cost of Goods Manufactured + PDF | 🟡 | [CogmPage](src/pages/Accounting/Reports/CogmPage.tsx), [CogmPDF.tsx](src/utils/accounting/CogmPDF.tsx) |
| Note 22 (Trade Receivables) + Note 7 (Revenue) calculated live from `invoices` — no `DEBTOR` / `SLS*` GL codes needed | ✅ | [financial-reports.js](src/routes/accounting/financial-reports.js) |

All four statements render a single period only — no prior-year comparative column *(= 1A-3, Type 2 / #7)*. Note 5 is shown as one rolled-up number — no Schedule B itemisation *(= 1A-5, Type 2 / #4)*.

### Master data

| Capability | Status | Notes |
|---|---|---|
| Chart of Accounts CRUD | ✅ | **2,749 codes currently loaded, all marked active** — the full legacy list has been imported but the lean-GL pruning (§0 below) hasn't started. The "~60 vs 1,202" framing in §0 should be read against this real count. |
| Financial-statement notes (33 notes) — the bridge between codes and statement lines, mapped via `account_codes.fs_note` (= legacy `APPX` column) | ✅ | `financial_statement_notes` |
| Ledger types, materials + variants, material-stock entries, general-stock subledger | ✅ | `ledger_types`, `materials`, `material_variants`, `material_stock_entries`, `general_stock_categories`, `general_stock_adjustments` |

---

## 0. The chart-of-accounts question (the decision underneath everything)

You're stuck choosing between "~60 simplified codes" and "keep the 1,202 legacy codes." Reframe it: **that is a false choice.**

The legacy list is not a chart of accounts. It is a chart of accounts (~60 real GL accounts — roughly one per line that appears on the Balance Sheet, P&L, or CoGM) **welded to a subledger** — one code per supplier (`CR_*`), per customer, per product (`OS_*`/`CS_*`), per vehicle (`BT*`/`INS*`/`R*`/…), per HP contract (`HPA_*`/`HPB_*`). The 20-year-old system did this because it had no relational database to hold detail — the codes *were* the detail.

The new ERP already holds that detail in proper tables: `suppliers`, `purchase_invoices`, `invoices`, `payments`, `self_billed_invoices`, and the materials/stock tables. So the per-entity codes are now **redundant** — the Lahad Datu Flour Mill balance lives both in `CR_LD` and in that supplier's `purchase_invoices` rows.

So the real model is:

> **Lean GL (≈60 codes, one per financial-statement line) + subledger tables carry the per-supplier / customer / product / vehicle detail.**

That is standard double-entry practice and what every modern Malaysian package (AutoCount, SQL Account, Xero) does. The "≈60" isn't an arbitrary simplification target — it's however many lines your audited financial statements actually have.

Three practical points:

1. **You don't delete the legacy codes.** Mark them inactive. They stay for the 12/2024 comparative and historical trial balance. New transactions post to the lean set.
2. **Per-vehicle cost tracking**, if you still want it, is a *tag / dimension* on the transaction (which lorry), not 120 GL accounts. Decide that separately — it doesn't touch the GL.
3. This decision changes the internal *shape* of exactly two items below — Schedule B becomes a trivial group-by, and the vehicle-expense rollup becomes a tag filter. It does **not** change whether anything below is needed. So it is not a reason to delay the rest.

**Recommendation: lean GL + subledgers.** But every list item below stands either way — so the lists are not blocked on this.

---

## Type 1 — Standard capabilities for a Malaysian manufacturing Sdn Bhd

Tien Hock is a Sdn Bhd: every year it must file audited financial statements with SSM and a tax return with LHDN. Type 1 is what the system needs so it can **produce the numbers an auditor signs and a tax agent files** — plus the daily screens that stop staff rebuilding it all in spreadsheets.

### 1A — Must-have for Malaysian audit / compliance *(ranked)*

| # | Capability | Status | Why it matters |
|---|-----------|--------|----------------|
| 1 | **Statement of Cash Flows** | ❌ | One of the four primary statements MPERS requires. A set of accounts is incomplete without it — an auditor cannot sign off. Must show the operating/investing/financing movement of `CASH` + `BANK_PBB`/`BANK_ABB`. |
| 2 | **Statement of Changes in Equity** | ❌ | The fourth primary statement. Reconciles `SC` (share capital) + `RP`/`RP_MTH` (retained profit): opening → profit for the year → closing. Currently nowhere in the ERP. |
| 3 | **Prior-year comparative columns** on BS / P&L / CoGM | 🟡 | MPERS requires every statement to show the prior period beside the current one. The Trial Balance, [Income Statement, Balance Sheet, CoGM](src/pages/Accounting/Reports/) pages all render a single period — so none of them is, strictly, a compliant financial statement yet. |
| 4 | **Fixed Asset Register + depreciation schedule** | ❌ | Backs the PP&E note. Per asset: acquisition date, cost, useful life, monthly depreciation, accumulated depreciation, NBV — the movement schedule auditors vouch `NCA_*` (cost) and `AD_*` (accumulated depreciation) against. Also the source of the depreciation line in the P&L. |
| 5 | **Schedule B — administrative expenses breakdown** | ❌ | The legacy detailed P&L itemises Note 5 into ~40 lines (Auditors' Remuneration, Bank Charges, Electricity & Water, Vehicle Running Expenses…). [IncomeStatementPage](src/pages/Accounting/Reports/) shows Note 5 as one number. Auditors expect the itemised P&L. With a lean GL this is a near-trivial group-by; with legacy codes it's a rollup of `MB*`/`BT*`/`INS*`/`R*`/… . |
| 6 | **Hire-purchase amortization schedule** | ❌ | Per HP contract — each `HPA_*` principal paired with its `HPB_*` interest-in-suspense — the monthly split of each instalment into principal vs interest. Backs the HP-payable and finance-cost notes; without it those figures can't be substantiated. |
| 7 | **Opening balance setup** | ❌ | A screen to enter every account's DR/CR balance as at the migration cut-off (the legacy system has exactly this — "Opening Balance as at 1 Sept 2012"). Without it the new system's first-period trial balance won't tie to the last audited accounts. |
| 8 | **Period close / month-end lock** | 🟡 | Posted journal entries are individually immutable, but there's no *period-level* lock — nothing stops a backdated entry landing in a month already reported or audited. Auditors expect closed periods frozen. |
| 9 | **Tax estimation & computation** (CP204 / CP204A, Form C tax computation) | ❌ | Every Sdn Bhd must file a CP204 estimate of tax payable plus an annual return. `CL_TAX` (provision) and `DF_TAX` (deferred tax) are currently manual journal entries with no supporting computation in the system. |
| 10 | **SST-02 return support** | ❌ | If Tien Hock is SST-registered as a manufacturer, it files a bi-monthly SST-02. Worth confirming registration status first — many food products are SST-exempt, so the taxable-output position may be small. (e-Invoice / MyInvois is already partly handled via the foreign self-billed flow.) |

### 1B — Must-have for daily operations *(ranked by manual work saved)*

| # | Capability | Status | Why it matters |
|---|-----------|--------|----------------|
| 1 | **Bank statement from journal** | ❌ | A running-ledger view of any bank/cash account (`BANK_PBB`, `BANK_ABB`, `CASH`; legacy `PBB_1`/`PBB_2`) — date, journal, particulars, cheque no., debit, credit, running balance. The most-used legacy report; today there is no way to see a bank account's running balance without doing it by hand. (Handover #1; [Phase 2.2](docs/ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md).) |
| 2 | **Account ledger / GL drill-down** | ❌ | The generic version of #1: pick any account, see every transaction and a running balance — a creditor, a director account (`CL_WSF`/`CL_GTH`), a prepayment (`CA_INS`), an inter-company balance. One screen that answers "where did this number come from" for the whole trial balance. |
| 3 | **Journal posting for General Purchases** | 🟡 | [`LocalGeneralPurchaseFormPage`](src/pages/Accounting/Purchases/LocalGeneralPurchaseFormPage.tsx) writes `self_billed_invoices` rows but creates **no journal entry** (verified in [`self-billed-invoices.js`](src/routes/accounting/self-billed-invoices.js)) — only *material* purchases auto-post. Every local general purchase (utilities, stationery, repairs, services) is currently invisible to the GL. (Handover #2.) |
| 4 | **Supplier payment entry** | ❌ | No "pay this supplier invoice" screen — supplier payments and their DR Payables / CR Bank journal are done by hand. Pairs with #3 to close the purchase-to-pay loop that customer payments already have. |
| 5 | **AP (supplier) aging report** | ❌ | A creditor-aging report — current / 1 / 2 / 3+ months — mirroring the [Debtors aging](src/pages/Accounting/DebtorsReportPage.tsx) the ERP already has. Needed to decide who to pay and when. |
| 6 | **Supplier statement / per-supplier ledger** | ❌ | A per-supplier running ledger (invoices + payments + balance) — the supplier-side mirror of the customer Statement of Account the legacy prints. Largely falls out of #2 once the account ledger can filter by the supplier subledger. |
| 7 | **Payment Voucher (PV) print** | ❌ | Only the Cash Receipt Voucher exists. A printable Payment Voucher is needed whenever the company pays a supplier or an expense — the legacy `PV###` / `PBE###` documents. |
| 8 | **Bank reconciliation worksheet** | ❌ | Takes the bank-statement-from-journal closing balance, adds back outstanding cheques and deposits in transit, and ties to the actual bank statement balance. Built directly on #1. |

---

## Type 2 — Legacy features missing from the new ERP *(ranked by user pain)*

| # | Legacy feature → new-ERP shape | Status | Pain it solves |
|---|-------------------------------|--------|----------------|
| 1 | PBB bank running ledger → **bank-statement-from-journal page** | ❌ | Can't reconcile the books to the actual bank statement; no view of a bank balance over time. *(= 1B-1)* |
| 2 | Every purchase posted to the books → **journal posting for General Purchases** | 🟡 | Local general purchases never reach the GL, so the trial balance understates expenses and payables. *(= 1B-3)* |
| 3 | Print-any-code ledger → **generic Account Ledger** | ❌ | No way to trace any account's transactions or running balance — neither you nor an auditor can drill from a trial-balance number to its movements. |
| 4 | Detailed P&L → **Schedule B** (admin expense breakdown) | ❌ | The P&L shows Note 5 as one lump; you can't see what the company actually spent money on. *(= 1A-5)* |
| 5 | `NCA_*`/`AD_*` asset listing → **Fixed Asset Register + depreciation** | ❌ | No asset listing, no depreciation schedule; the PP&E figure can't be substantiated or rolled forward. *(= 1A-4)* |
| 6 | `HPA_*`/`HPB_*` pairs → **HP amortization schedule** | ❌ | No per-contract principal/interest split; HP balances and finance cost are guesswork. *(= 1A-6)* |
| 7 | Two-period statements → **prior-year comparison columns** | 🟡 | Reports are single-period; can't see this year vs last, and the statements aren't comparative-compliant. *(= 1A-3)* |
| 8 | "Opening Balance as at…" sheet → **Opening Balance setup page** | ❌ | No clean way to load migration cut-over balances; first-period TB won't tie to audited prior accounts. *(= 1A-7)* |
| 9 | **Bank reconciliation worksheet** | ❌ | No structured reconciliation of book balance vs bank balance. *(= 1B-8)* |
| 10 | Creditor aging (legacy Trade Creditor List) → **AP aging** | ❌ | No supplier aging — payment planning is manual. *(= 1B-5)* |
| 11 | Per-supplier / per-director balances → **note-disclosure backing schedules** | ❌ | The notes that break down per-director (`CL_WSF`/`CL_GTH`) and per-supplier (`CR_*`) balances have no backing report. Mostly absorbed by #3 once the generic ledger exists. |
| 12 | `PV`/`PBE` payment vouchers → **Payment Voucher print** | ❌ | No printable payment document for supplier/expense payments. *(= 1B-7)* |

> Several Type 2 items are the same capability seen from the legacy side and the standards side — cross-referenced above. The genuinely distinct missing builds are: bank statement, account ledger, General Purchase journals, Schedule B, fixed asset register, HP schedule, comparatives, opening-balance setup, bank rec worksheet, AP aging, PV print.

---

## What the uploaded legacy files confirmed

On **Open Question 5** (do legacy reports exist for these?) — partly answered by the project files:

- **Legacy reports that *do* exist** — formats now in hand: bank-statement-from-journal (`bank_statement_from_journal.pdf`, `needtohaveprintout.jpg`), customer Statement of Account (`tienhock_debtors_statement.pdf`), Trade Debtor List / AR aging (`tienhock_debtors_general_statement.pdf`), salary-by-department report + JVDR/JVSL vouchers (`payroll_transfer…pdf`, `salary_report_comprehensive.pdf`), and **Schedule A + Schedule B** (`Balance_sheet.pdf`, pp. 3–4).
- **Not found among the uploads** — so the new build has no legacy template to copy: supplier statement, director ledger, HP amortization schedule, fixed asset register, bank reconciliation worksheet. If paper versions exist, screenshots would sharpen items 5, 6, 8, 9.

**Open Questions 1–4** (`THJ_CK`/`THJ_SM`, `NT_7484`, `CL_GT`/`CL_GF` debit balances, `BTRA`) remain open. They are trial-balance *classification* fixes, independent of these feature lists, and best resolved when the Schedule B / account-ledger work is specced.

---

*Next step is yours: pick which items to build. Implementation design is deliberately not in this document — that's a separate plan-mode session.*

# Tien Hock ERP — Accounting Module: What's Missing

Gap analysis requested in the handover, two lists:

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
| Voucher Generator: monthly payroll → `JVDR` (Director's Remuneration) + `JVSL` (Staff Salary) journals — **expense + accrual side only** (DR expense · CR `ACW_*`/`ACD_*` accruals; no bank leg) | ✅ | [VoucherGeneratorPage](src/pages/Accounting/VoucherGeneratorPage.tsx), [journal-vouchers.js](src/routes/accounting/journal-vouchers.js) |
| **Payroll Bank Payment (settlement):** salary/director/EPF/SOCSO/SIP/PCB/half-month → posted PBE journals (DR accrual · CR bank), amounts defaulted from payroll and editable | ✅ | [PayrollPaymentPage](src/pages/Accounting/PayrollPaymentPage.tsx), [payroll-payments.js](src/routes/accounting/payroll-payments.js) |
| Location-account mappings — drives JVDR/JVSL account selection per location (01/02/04/06/07/08) | ✅ | [LocationAccountMappingsPage](src/pages/Accounting/LocationAccountMappingsPage.tsx) |

### Financial reports *(single-period)*

| Capability | Status | Where |
|---|---|---|
| Trial Balance + PDF (with `APPX` / `fs_note` column) | 🟡 | [TrialBalancePage](src/pages/Accounting/Reports/TrialBalancePage.tsx), [TrialBalancePDF.tsx](src/utils/accounting/TrialBalancePDF.tsx) |
| Income Statement + PDF | 🟡 | [IncomeStatementPage](src/pages/Accounting/Reports/IncomeStatementPage.tsx), [IncomeStatementPDF.tsx](src/utils/accounting/IncomeStatementPDF.tsx) |
| Balance Sheet + PDF | 🟡 | [BalanceSheetPage](src/pages/Accounting/Reports/BalanceSheetPage.tsx), [BalanceSheetPDF.tsx](src/utils/accounting/BalanceSheetPDF.tsx) |
| Cost of Goods Manufactured + PDF | 🟡 | [CogmPage](src/pages/Accounting/Reports/CogmPage.tsx), [CogmPDF.tsx](src/utils/accounting/CogmPDF.tsx) |
| Note 22 (Trade Receivables) + Note 7 (Revenue) calculated live from `invoices` — no `DEBTOR` / `SLS*` GL codes needed | ✅ | [financial-reports.js](src/routes/accounting/financial-reports.js) |

All four statements render a single period only — no prior-year comparative column *(= 1A-3, Type 2 / #7)*. Note 5 is shown as one rolled-up number — no Schedule B itemisation *(= 1A-5, Type 2 / #4)*. They sum posted journals **YTD from Jan 1 with no brought-forward** and **do not read the opening-balance anchor**, so the Balance Sheet cannot balance for an established company until opening balances are loaded *and* wired into these engines *(= 1A-7; see [§ readiness assessment](#can-the-erp-generate-the-legacy-report-pack-yet-readiness-assessment-9-jun-2026))*.

### Master data

| Capability | Status | Notes |
|---|---|---|
| Chart of Accounts CRUD | ✅ | **2,749 codes currently loaded, all marked active** — the full legacy list has been imported but the lean-GL pruning (§0 below) hasn't started. The "~60 vs 1,202" framing in §0 should be read against this real count. |
| Financial-statement notes (33 notes) — the bridge between codes and statement lines, mapped via `account_codes.fs_note` (= legacy `APPX` column) | ✅ | `financial_statement_notes` |
| Ledger types, materials + variants, material-stock entries, general-stock subledger | ✅ | `ledger_types`, `materials`, `material_variants`, `material_stock_entries`, `general_stock_categories`, `general_stock_adjustments` |

---

## Active build: Bank statement from journal (item 1B-1)

> Started 8 Jun 2026 · report built 9 Jun 2026 · opening-balance mechanism + payroll bank-payment settlement built **and smoke-tested** 9 Jun 2026 · **tie-out proof in progress (May 2026)**. First concrete accounting build. End goal: the report's closing book balance ties to the real Public Bank statement for a chosen month. **Proof month switched Jan 2026 → May 2026** — the user provided both the legacy-generated book statement and the real Public Bank statement for May 2026 (acct 3170049926). They tie: legacy **book** opens 166,035.80 DR / closes **172,288.16 DR**; the real **bank** opens 166,035.85 / closes **172,288.21** — a standing 5-sen reconciling item. The full auto-tie-out matures with the **June 2026** payroll run (May payroll data is still being completed).

> **Session status (9 Jun 2026, end of session).** Both build pieces are live and proven on dev: ✅ opening-balance anchor (`BANK_PBB` = 166,035.80 @ 2026-05-01 is set in dev — opening card reads "Anchored as of 01/05/2026", discarding the 1.79M pre-May noise); ✅ Payroll Bank Payment screen **smoke-tested** — generated payments post and appear as credit lines in the Bank Statement. **Next step:** the operational May walk-down — post the salary/statutory payments (edited to the statement figures) and key the remaining outgoing lines as manual journals (mapping guide below) until the close approaches 172,288.16; then re-run the same flow on the **June** payroll for the first clean auto-tie-out. No code is required for the next step — it is data entry and verification.

### Decisions

- **Bank code:** the new report treats **`BANK_PBB`** as the live Public Bank account (it's where customer receipts already post). Legacy `PBB_1` is kept for historical/comparative data only.
- **Architecture — layered, not "legacy format vs fresh".** [`JournalEntryPage`](src/pages/Accounting/JournalEntryPage.tsx) is the universal foundation and escape hatch: it can already capture *every* line type on the statement, so it makes the transition possible today. Structured screens sit **on top** and *emit* journal entries (exactly like the existing `REC`/`PAY` auto-posting), and are built only for **high-volume** lines. Lead with structure, fall back to raw journals for the long tail. *Guardrail to add later:* mark subledger-owned accounts (`TR`, `BANK_PBB`, …) so manual journals can't double-post against them.
- **Transition — parallel run.** The co-worker keeps the legacy system as system-of-record while the ERP runs alongside. She re-keys **less** than in legacy, because daily operations (sales invoices, customer receipts) already feed most lines; she only manually journals the residual gap lines (below). Cut over once a few months tie out cleanly.
- **Order of work:** build the *measuring instrument* (bank-statement report + opening balance) **before** any structured screen — you can't prove a screen's journal is right until you can see the running balance tie out. Supplier-payment → journal is **already wired** (`supplier-payments.js:376` calls `createSupplierPaymentJournalEntry`); it's a future *activation* (depends on entering purchase invoices), not a build.

### What's built (9 Jun 2026) — report is DONE

The read-only bank-statement report is complete and verified against live data.

- **Backend:** [bank-statement.js](src/routes/accounting/bank-statement.js) — `GET /api/bank-statement/:accountCode/:year/:month`. Returns `opening_balance` (from the opening-balance anchor when one is set — see build piece 2 — otherwise the net of all posted lines *before* the month), `opening_source` (`anchored` + as-of-date/amount, or `derived`), `transactions` (each posted journal line for the account, with a running balance), `closing_balance`, `totals`. Filters `status='posted'`, half-open month range, TZ-safe date strings. Mounted in [index.js](src/routes/index.js) (`/api/bank-statement`).
- **Frontend:** [BankStatementPage.tsx](src/pages/Accounting/Reports/BankStatementPage.tsx) — **Accounting → Bank Statement** (`/accounting/reports/bank-statement`), registered in [TienHockNavData.tsx](src/pages/TienHockNavData.tsx). Account selector (BK-ledger accounts + `CASH`, default `BANK_PBB`), `MonthNavigator`, Date · Journal · Particulars · Cheque · Debit · Credit · running Balance (DR/CR), opening/closing summary cards.
- **PDF:** [BankStatementPDFMake.ts](src/utils/accounting/BankStatementPDFMake.ts) — **pdfMake** (user prefers it over `@react-pdf/renderer`), landscape, mirrors legacy layout.

### Key findings (verified against dev DB, May 2026)

1. **Receipts auto-post, outgoing lines don't.** May 2026 `BANK_PBB` holds **150 posted REC (debit) lines = RM 393,581.93** and **zero credit lines**. Every outgoing line (supplier/director/worker payments, transfers, bank charges, loans, salary/statutory remittances) still has to be created. The salary/statutory ones are now handled by the new settlement screen; the rest are manual journals (mapping guide below).
2. **The report's raw pre-May opening (1,792,205.45 DR) is noise** — the accumulated Jan–Apr auto-posted receipts with no offsetting outgoing. The opening-balance anchor (built this session) overrides it: `BANK_PBB` = **166,035.80 @ 2026-05-01**, discarding everything before.
3. **Payroll posts no bank leg.** The Voucher Generator's `JVDR`/`JVSL` record only DR expense / CR accrual (`ACW_*`/`ACD_*`); mid-month salary isn't journaled at all. The salary/director/statutory *payment* lines on the bank statement had no source — that gap is what the new **Payroll Bank Payment** screen fills (DR accrual / CR bank).
4. **Payroll figures ≠ bank amounts for the May statement.** The May statement's monthly-salary lump (102,113.00, tagged 04/2026) and statutory remittances (EPF 33,812; SOCSO 3,533.60; SIP 506.40; PCB 1,997.15, mostly tagged 04/2026) are the **April** payroll run, and April dev data is incomplete. Only the May **half-month 24,700.00** ties exactly. Take-home is `setelah_digenapkan − pinjam` (the payslip's `final_total`), and the *bank-transferred* portion further excludes cash-paid workers. So the settlement screen **defaults from payroll but keeps every amount editable** — exact auto-tie is expected from the **June** run forward.

### Reference dataset (provided 9 Jun 2026)

The user provided the **complete May 2026 Public Bank statement** and the **legacy-generated book statement** for the same account/month. Opening anchor and closing target are taken from them (166,035.80 → 172,288.16 book).

### Gap lines — particulars with no clean ERP source (for the co-worker's key-ins)

Direction: **IN** = money into bank (book debit) · **OUT** = money out (book credit).

**❌ No source at all — must be captured manually (journal entry now; maybe a screen later):**

- **A. Worker cash claims & drawings** *(monthly, recurring)* — `CLAIM BILLS/AL WORKERS`, `CLAIM BILLS/DRAWING WORKERS/SALARY WORKERS`, `CLAIM BILLS/BONUS/OT&AL WORKERS`, `CLAIM BILLS/DRAWING WORKERS` (OUT); `FROM DRAWING WORKERS` (IN, workers returning cash). *Q: how is each figure derived — tied to payroll, or a separate cash-claim sheet?*
- **B. Director account movements** — `AMOUNT DUE TO DIRECTOR -GTH / -GT` (OUT). *Q: which director; loan repayment vs reimbursement vs drawing; backing document?*
- **C. Inter-bank transfers** — `TRANSFER FUNDS PBB TH TO ABB TH` (OUT). *Q: frequency; is the ABB side recorded?*
- **D. Inter-company transfers** — `TRANSFER FUND RECEIVED FROM GT TO TH` (IN). *Q: what triggers it; logged on the Green Target side too?*
- **E. Loans / financing** *(monthly fixed)* — `LOAN PYMT 46TH INSTALLMENT (SD1016T)`, `TRANSFER FUND OF MBB LOAN #…` (OUT). *Q: how many active loans/HP contracts, monthly instalment of each, lender. (Future HP/loan schedule.)*

**🟡 Source/feature exists but isn't flowing — needs activation or a manual journal:**

- **F. Supplier / vendor payments** — `JOHOR BAHRU FLOUR MILL S/B`, `GREEN TARGET WASTE TREATMENT IND.S/B`, `MY CO2 (PG) S/B`, `POLIS DIRAJA MALAYSIA` (a fine, not a real supplier). Feature exists (auto-posts `PAY`), unused; needs the purchase invoice entered first. *Q: ~how many supplier payments a month; does she have the matching bill for each?*
- **G. Bank charges** — `BANK CHARGES MONTH OF DEC'2025`. Manual `J` journal (DR `BC`/`AE_BK`/`MBBC` / CR bank).
- **H. Corrections / contra** — `WRONGLY PYMT ISSUE JP DEBT TO TH DEBT`, `CONTRA PYMT OF WRONGLY PYMT RECEIVED`. Manual `J` journal.
- **I. Daily cash-sales banking** — `SALES {date}`. Underlying CASH receipts exist (posted to `CASH`), but the "deposit the day's cash into PBB" step isn't modeled. *Q (key): how is the `SALES {date}` amount and banking day decided — is it literally the day's cash collection physically deposited?*

**✅ Already flowing:** `INV/NO : {inv}/{customer}` — customer payments against credit invoices, auto-posted as `REC` (DR `BANK_PBB` / CR `TR`).

### Build pieces

1. ✅ **Bank-statement / account-ledger report** — done (see "What's built"). Doubles as the generic Account Ledger (1B-2 / Type-2 #3).
2. ✅ **Opening-balance mechanism** — built 9 Jun 2026. Table `account_opening_balances` (`sql/account_opening_balances.sql`), route [opening-balances.js](src/routes/accounting/opening-balances.js) (`GET/PUT/DELETE /api/opening-balances/:code`), anchor logic wired into [bank-statement.js](src/routes/accounting/bank-statement.js) (returns `opening_source`), and a "Set opening balance" modal ([OpeningBalanceModal.tsx](src/components/Accounting/OpeningBalanceModal.tsx)) on the Bank Statement page. Generalises to Opening Balance setup (gap 1A-7).
3. ✅ **Payroll Bank Payment (settlement) screen** — built **and smoke-tested** 9 Jun 2026. Route [payroll-payments.js](src/routes/accounting/payroll-payments.js) (`GET /preview/:y/:m`, `POST /generate`) + page [PayrollPaymentPage.tsx](src/pages/Accounting/PayrollPaymentPage.tsx) (Accounting → Payroll Bank Payment). Defaults net salary (take-home − pinjam), EPF/SOCSO/SIP/PCB and half-month from payroll, contra accruals from `location_account_mappings`; every amount editable; posts one PBE journal per row (DR accrual / CR bank). Smoke test confirmed the generated payments post and show as credit lines in the Bank Statement. Fills the salary/director/statutory gap lines. *Each row settles an accrual, so generate the month's `JVSL`/`JVDR` expense vouchers first or the `ACW_*`/`ACD_*` accrual goes negative (harmless for the bank tie-out, messy on the TB).*
4. 🟡 **May 2026 tie-out proof** — opening **anchored in dev** (166,035.80 @ 2026-05-01); settlement screen **smoke-tested**. Remaining: post the salary/statutory payments edited to the statement figures, then key the remaining outgoing lines as manual journals (mapping guide below) so the close walks toward 172,288.16. Real auto-tie-out matures with the June payroll run.
5. ⬜ **Structured screens** — later, by volume; next candidate is activating the purchases → payables → supplier-payment loop (already built end-to-end).

---

## Manual-entry mapping guide — remaining May outgoing lines

The settlement screen covers salary/director/statutory. The remaining outgoing lines on the May statement are still manual journals: `BANK_PBB` credit (money out) + the contra below as debit. Put the cheque no. in the line `reference` and the narrative in `particulars` so they render in the report's Cheque/Particulars columns. **Confirm the contra per category with the user before posting — don't guess.**

| Statement line(s) | Direction | Contra (debit) | Note |
|---|---|---|---|
| Suppliers — `NITSEI SAGO`, `JOHOR BAHRU FLOUR MILL`, `PUNCAK NIAGA`, `UNIANG`, `KK RICE`, `LAHAD DATU FLOUR MILL`, … | OUT | `CL_TP` / `TP` | Ideally via the purchase→payment loop once invoices are entered; manual journal until then. |
| `AMOUNT DUE TO DIRECTOR -WSF / -GTH` (director current account) | OUT | `CL_WSF` / `CL_GTH` / `CL_ATD` | Director drawings/reimbursements — **not** payroll. |
| Loans / HP — `AUTOMATED LOAN PYMT`, `AFFIN BANK …INSTALMENT`, `MAYBANK-LOAN`, `TOYOTA CAPITAL`, `MBB LOAN` | OUT | `CL_LOAN` / `CL_ABB` / `CL_SCB` / `CL_HP` | Per active loan/HP; future HP/loan schedule (1A-6). |
| `TRANSFER FUND FROM PBB TH TO ABB TH` | OUT | `BANK_ABB` | Inter-bank; the ABB side mirrors it. |
| Bank charges — `BANK CHARGES MONTH OF MAY 2026`, cheque process fees, `HANDLING CHRG` | OUT | `BC` / `MBBC` / `AE_BK` | |
| Utilities — `SABAH ELECTRICITY`, `JBT. AIR NEGERI SABAH`, `CTOS`, `PEMBANGUNAN SUMBER MANUSIA` (HRD levy) | OUT | relevant expense (confirm) | |
| Worker cash claims/drawings — `CLAIM BILLS…`, `DRAWING WORKER …` (OUT); `FROM DRAWING WORKERS` (IN) | OUT/IN | confirm contra | Tied to payroll or a separate cash-claim sheet — ask. |
| `LHDN-TAKSIRAN 2026/ANSURAN` (CP204 tax instalment) | OUT | `CL_TAX` | Income-tax instalment, not PCB. |

**✅ Already flowing / covered:** `INV/NO : {inv}/{customer}` receipts (auto `REC`); salary/director/EPF/SOCSO/SIP/PCB/half-month (new settlement screen).

## Handover — verify the May proof (do exactly this)

**Goal:** the Bank Statement report's `BANK_PBB` **May 2026** close ties to the legacy book close **172,288.16** (≈ bank 172,288.21; the 5 sen is a standing reconciling item).

1. **Opening balance:** already set in dev — `BANK_PBB` = **166,035.80 @ 2026-05-01** (the opening card reads 166,035.80 DR · "Anchored as of 01/05/2026", with the 150 May receipts below). On a fresh DB, re-run `sql/account_opening_balances.sql` then set the anchor via the Bank Statement page modal.
2. **Salary/statutory:** generate the month's `JVSL`/`JVDR` vouchers first (so the `ACW_*`/`ACD_*` accruals exist), then open **Accounting → Payroll Bank Payment** for the relevant payroll month, edit each amount to the statement figure (April-run figures for the lump/statutory, May for half-month), set the payment dates/cheque nos., Generate & Post.
3. **Remaining outgoing lines:** enter as manual journals per the mapping guide above (confirm contras with the user).
4. **Verify:** the report's May close should approach 172,288.16. Any residual is a missing line or a genuine reconciling item → future bank-rec worksheet (1B-8). Full auto-tie matures with the June run once May payroll data is complete.

**Don't:** post gap lines or opening balances without the user confirming figures and contra accounts. Don't drive the salary bank amounts blindly from payroll for the historical proof — April dev data is incomplete; edit to the statement.

---

## Can the ERP generate the legacy report pack yet? *(readiness assessment, 9 Jun 2026)*

The uploaded legacy files (`core_tienhock_acc_docs.pdf` 12/2024, `Balance_sheet.pdf` 2014) are **two different targets**, and the distance to each is very different:

- **Monthly management pack** (12/2024 set): Trial Balance → Balance Sheet → Detail Income Statement → COGM. *Management reporting.*
- **Annual audited set** (2014 draft): the same **plus** prior-year comparative columns, Schedule A (COGM detail), Schedule B (admin-expense itemisation), and the two primary statements not in the monthly pack — **Cash Flow** and **Statement of Changes in Equity** — with full notes. *Statutory / audit.*

**The report machinery already exists.** All four monthly engines + PDFs are built (🟡): [trial-balance / income-statement / balance-sheet / cogm](src/routes/accounting/financial-reports.js#L361). The distance is **not** "build report renderers." Every engine is a group-by over `journal_entry_lines WHERE status='posted'`, categorised by `fs_note` — so **a statement is exactly as complete and correct as the journals beneath it.** That is the whole game.

### Could pure manual journal entry produce them?

In principle **yes** — [JournalEntryPage](src/pages/Accounting/JournalEntryPage.tsx) is a universal escape hatch and every statement is just a roll-up of posted journals, so keying every transaction as a balanced entry *would* populate the pack. But four things stop "simply key it all manually" from being sufficient:

1. **Opening balances — the hard blocker.** The TB/BS engine sums journals **YTD from Jan 1 only, with no brought-forward** ([financial-reports.js:373-391](src/routes/accounting/financial-reports.js#L373)). For an established company that means retained profit, fixed assets, accumulated depreciation, loans and payables all start at **zero** unless posted. **And the opening-balance anchor built this session is read only by the Bank Statement report — the TB/BS/IS/COGM do not consume it yet.** So before *any* route (manual or structured) can make the Balance Sheet balance, every account's opening migration balance must be loaded **and the statement engines must read it** (sharpens 1A-7 — see below).
2. **Some figures are computed schedules, not natural "entries."** Depreciation (needs the fixed-asset register), HP interest/principal split (needs the amortization schedule), **closing-inventory valuation** (qty × cost across hundreds of items — feeds both COGM and the BS), and tax provision / deferred tax. Each *can* be computed in Excel and keyed as a journal — but that is exactly the fragile manual work the ERP exists to remove, and where the numbers drift.
3. **Granularity for Schedule B.** Note 5 renders as one lump today; the itemised admin-expense schedule needs the lean-GL group-by (§0) or enough coding granularity.
4. **Sustainability + compliance.** Manual-everything is fine as a *parallel-run proof* (the May tie-out is exactly that); as the standing process it defeats the ERP. The audited set additionally needs Cash Flow + Changes in Equity + comparatives (1A-1/2/3) — not journal-entry problems at all.

### Distance estimate

| Target | Distance |
|---|---|
| **Monthly pack that ties out** (TB/BS/IS/COGM, 12/2024-style) | **Close.** The bank tie-out is the first brick. Gating work: (a) load full opening balances **and wire the statements to read them**, (b) get the recurring non-auto journals flowing — depreciation, HP, closing-stock valuation, and the missing General Purchase → GL journal (1B-3). Then existing auto-posting + a disciplined parallel run produces it — roughly the next 2–4 focused builds. |
| **Audited statutory set** (2014-style) | **Further.** Add Cash Flow (1A-1), Changes in Equity (1A-2), comparatives (1A-3), Schedule B (1A-5), fixed-asset register (1A-4), HP schedule (1A-6) — each its own 1A item. |

**Verdict:** manually keying every journal *would* generate a correct-looking monthly TB→BS→IS→COGM — **but only after opening balances are loaded**, and you would still be hand-computing depreciation, HP interest, closing stock and tax outside the system. Pure-manual is a viable *transition tactic*, not a sustainable or audit-complete process. **The single most important next unlock is wiring opening-balance setup into the statements (1A-7) — nothing on the Balance Sheet balances without it.**

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
| 7 | **Opening balance setup** | 🟡 | Per-account anchor `account_opening_balances` + a "Set opening balance" modal now exist (built 9 Jun 2026, first used by the Bank Statement report). Still needed, and **the single most important next unlock**: (a) a full setup *screen* to load every account's DR/CR migration balance at once (the legacy "Opening Balance as at 1 Sept 2012"), **and (b) wire the anchor into the Trial Balance / Balance Sheet / Income Statement / COGM engines** — today they sum journals YTD from Jan 1 with **no brought-forward** ([financial-reports.js:373-391](src/routes/accounting/financial-reports.js#L373)) and ignore the anchor, so the Balance Sheet cannot balance for an established company until this is done. |
| 8 | **Period close / month-end lock** | 🟡 | Posted journal entries are individually immutable, but there's no *period-level* lock — nothing stops a backdated entry landing in a month already reported or audited. Auditors expect closed periods frozen. |
| 9 | **Tax estimation & computation** (CP204 / CP204A, Form C tax computation) | ❌ | Every Sdn Bhd must file a CP204 estimate of tax payable plus an annual return. `CL_TAX` (provision) and `DF_TAX` (deferred tax) are currently manual journal entries with no supporting computation in the system. |
| 10 | **SST-02 return support** | ❌ | If Tien Hock is SST-registered as a manufacturer, it files a bi-monthly SST-02. Worth confirming registration status first — many food products are SST-exempt, so the taxable-output position may be small. (e-Invoice / MyInvois is already partly handled via the foreign self-billed flow.) |

### 1B — Must-have for daily operations *(ranked by manual work saved)*

| # | Capability | Status | Why it matters |
|---|-----------|--------|----------------|
| 1 | **Bank statement from journal** | 🟡 *in progress* | A running-ledger view of any bank/cash account (`BANK_PBB`, `BANK_ABB`, `CASH`; legacy `PBB_1`/`PBB_2`) — date, journal, particulars, cheque no., debit, credit, running balance. The most-used legacy report; today there is no way to see a bank account's running balance without doing it by hand. (Handover #1; [Phase 2.2](docs/ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md).) **First accounting build now in progress — see [§ Active build](#active-build-bank-statement-from-journal-item-1b-1) below.** |
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
| 1 | PBB bank running ledger → **bank-statement-from-journal page** | 🟡 *in progress* | Can't reconcile the books to the actual bank statement; no view of a bank balance over time. *(= 1B-1; see [§ Active build](#active-build-bank-statement-from-journal-item-1b-1))* |
| 2 | Every purchase posted to the books → **journal posting for General Purchases** | 🟡 | Local general purchases never reach the GL, so the trial balance understates expenses and payables. *(= 1B-3)* |
| 3 | Print-any-code ledger → **generic Account Ledger** | ❌ | No way to trace any account's transactions or running balance — neither you nor an auditor can drill from a trial-balance number to its movements. |
| 4 | Detailed P&L → **Schedule B** (admin expense breakdown) | ❌ | The P&L shows Note 5 as one lump; you can't see what the company actually spent money on. *(= 1A-5)* |
| 5 | `NCA_*`/`AD_*` asset listing → **Fixed Asset Register + depreciation** | ❌ | No asset listing, no depreciation schedule; the PP&E figure can't be substantiated or rolled forward. *(= 1A-4)* |
| 6 | `HPA_*`/`HPB_*` pairs → **HP amortization schedule** | ❌ | No per-contract principal/interest split; HP balances and finance cost are guesswork. *(= 1A-6)* |
| 7 | Two-period statements → **prior-year comparison columns** | 🟡 | Reports are single-period; can't see this year vs last, and the statements aren't comparative-compliant. *(= 1A-3)* |
| 8 | "Opening Balance as at…" sheet → **Opening Balance setup page** | 🟡 | Per-account anchor + modal built (9 Jun 2026); a full multi-account migration setup screen is still pending. *(= 1A-7)* |
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

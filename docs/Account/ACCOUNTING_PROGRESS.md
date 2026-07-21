# Accounting System — Progress & Handoff

**Status date: 21 Jul 2026 — PARTIALLY SUPERSEDED 10–21 Jul 2026.** The Sales Invoice / Payment / Receipt / Bank-In / Debtor refactor (Phases 0–8) replaced the receipt and sales-journal model described below: receipts are now header+allocation `receipts`/`receipt_allocations` rows owning one journal each, cash bank-ins are structured `bank_ins` with a shared `RV###/MM` registry, CNs debit the original revenue ledger, all receivable lines post to per-customer DEBTOR child accounts, the Account Ledger supports arbitrary date ranges with legacy-visible Journal/Cheque columns and legacy print order, and the June 2026 five-ledger row-by-row reconciliation passed. **Read [INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md) FIRST for everything receipt/bank/debtor related.** Legacy-report Phases V2+V3 are now implemented and verified on development: the Trial Balance opening residue is zero, the May Balance Sheet balances at RM8,980,756.68 with monthly closing stock injected (net assets RM6,090,429.60 = scan RM6,097,691.11 less the named RM7,261.51 GP-202604-0001 drift), exact 1 January opening stock and keyed month-end closing stock feed the Income Statement/Current Year Profit/CoGM, and the Trade Debtor list/statement columns and aging match the legacy scans exactly. Closing stock is keyed monthly on the Material Stock page ("Closing Stock (Financial Statements)" card) and injected at report level only — never a GL posting. Production has not received V2/V3 and requires separate approval. The S/REC rows in §1 below and the §3 bank tie-out narrative describe the pre-refactor system.

Verified against the repo (`src/routes/accounting/`, `src/pages/Accounting/`) and the dev DB. This is the entry-point document for accounting work outside the receipt refactor; see [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md) for the full gap catalogue.

---

## 1. Architecture in one page

- **Engine:** double-entry `journal_entries` + `journal_entry_lines`. Entry lifecycle (since 6 Jul 2026): every entry is created as `posted` ("Active" in the UI — there is no draft/post step) and reports read `status='posted'` only. Manually keyed entries (J/C/B) stay editable while active; system-generated journals (REC/PUR/GP/PAY/CN/JVDR/JVSL and PRP-marked B) are locked — corrections are cancellations/regeneration from the source screen. Before 6 Jul the manual-entry API created invisible `draft` rows (and the voucher generator wrote `status='active'`), so manual entries never reached any report; legacy draft/active rows need a one-time flip to `posted` (done in dev 6 Jul; run the same fix in prod). [JournalEntryPage](../../src/pages/Accounting/JournalEntryPage.tsx) is the universal escape hatch — anything can be keyed manually.
- **Layered screens:** structured transaction screens sit on top of the engine and *emit* posted journals (REC, PUR, GP, PAY, JVDR/JVSL, PBE, CN…). Structure is built only for high-volume flows; the long tail stays manual journals.
- **Statement bridge:** `account_codes.fs_note` → `financial_statement_notes` (33 notes; = the legacy trial balance "APPX" column). Every report is a group-by of posted journal lines by `fs_note`. **A statement is exactly as correct as the journals beneath it.**
- **Subledger principle (decided, do not re-litigate):** lean GL + detail in relational tables (`invoices`, `purchase_invoices`, `self_billed_invoices`, `supplier_payments`, `payments`, materials/stock). No per-supplier/customer/vehicle GL codes for new transactions. Legacy's 2,749 imported codes stay for history (pruning to a lean set has not started).
- **Keep the journal-voucher system** (decided Jan 2026): journals are the engine; better screens feed it.

### Journal sources (what auto-posts, and from where)

| Type | What | Journal shape | Source code |
|---|---|---|---|
| `S` | Sales journal per invoice (auto) | DR `TR` / CR `CASH_SALES` (cash bill) or `CR_SALES` (credit invoice), amount = totalamountpayable; `reference_no` = invoice id; updated in place on line/paymenttype/date edits, cancelled with the invoice; consolidated + zero-amount invoices skipped. Powers the CASH SALES / CREDIT SALES account ledgers. | [sales-journal.js](../../src/routes/accounting/sales-journal.js), [invoices.js](../../src/routes/sales/invoices/invoices.js) |
| `REC` | Customer payment receipts | DR bank / CR `TR` (overpay → CR `CUST_DEP`); pending cheques defer journal until confirm; cancel = journal cancelled. **Cash-method** receipts debit `CH_REV1` (cash bill) / `CH_REV2` (payment of old credit bill) by invoice paymenttype instead of `CASH`; bank methods use `BANK_PBB`/`BANK_ABB` | [payment-journal.js](../../src/routes/accounting/payment-journal.js), [payments.js](../../src/routes/sales/invoices/payments.js), [payment-helpers.js](../../src/utils/payment-helpers.js) |
| `PUR` | Material purchase invoices | DR purchase account by material category (`material_purchase_account_mappings`) / CR `TP` | [purchase-invoices.js](../../src/routes/accounting/purchase-invoices.js) |
| `GP` | General Purchases (local + foreign self-billed) | DR invoice-level expense account (`self_billed_invoices.account_code`) / CR `TP` | [self-billed-invoices.js](../../src/routes/accounting/self-billed-invoices.js) (`createGPJournalEntry`) |
| `PAY` | Supplier payments (settle `purchase_invoices` *or* `self_billed_invoices`) | DR `TP` / CR bank; auto PV reference `PV-YYYYMM-XXXX`; cancellation reverses journal + invoice balance | [supplier-payments.js](../../src/routes/accounting/supplier-payments.js), [supplier-payment-journal.js](../../src/routes/accounting/supplier-payment-journal.js) |
| `JVDR` / `JVSL` | Monthly payroll expense + accrual vouchers (per location, via `location_account_mappings`) | DR salary/EPF/SOCSO/SIP expense by location / CR `ACW_*`/`ACD_*` accruals. **No bank leg.** | [journal-vouchers.js](../../src/routes/accounting/journal-vouchers.js), [VoucherGeneratorPage](../../src/pages/Accounting/VoucherGeneratorPage.tsx); calc details in [JOURNAL_VOUCHER_CALCULATIONS.md](JOURNAL_VOUCHER_CALCULATIONS.md) |
| `B` (ref `PBE###/MM`) | Payroll bank payment (settlement): net salary, EPF, SOCSO, SIP, PCB, half-month | DR accrual (`ACW_*`) / CR bank; amounts default from payroll, all editable; idempotency marker `PRP:<category>:<yyyy-mm>` in description | [payroll-payments.js](../../src/routes/accounting/payroll-payments.js), [PayrollPaymentPage](../../src/pages/Accounting/PayrollPaymentPage.tsx) |
| `CN`/adjustments | Credit/Debit/Refund Notes (TH + JP) | posted atomically with balance_due + credit_used cascade | `adjustment_documents` routes |
| `C` | Manual Cash Payment entries | manual lines; header `cheque_no` auto-sequences from PBB350779 via `GET /api/journal-entries/next-cheque-no` | [journal-entries.js](../../src/routes/accounting/journal-entries.js) |
| `J` | Manual general journal | anything | [JournalEntryPage](../../src/pages/Accounting/JournalEntryPage.tsx) |

### Reports

| Report | Status | Files |
|---|---|---|
| **Bank Statement** (running ledger per bank/cash account) | ✅ built, content-parity with legacy verified against May 2026 PDFs | [bank-statement.js](../../src/routes/accounting/bank-statement.js), [BankStatementPage](../../src/pages/Accounting/Reports/BankStatementPage.tsx), [AccountLedgerPDFMake.ts](../../src/utils/accounting/AccountLedgerPDFMake.ts) |
| **Account Ledger** (1B-2 — same running-ledger view for *any* account code: expenditure, supplier, director…) | ✅ built 6 Jul 2026; reuses the bank-statement API + shared ledger PDF, searchable account picker, deep-linkable `?account=CODE` | [AccountLedgerPage](../../src/pages/Accounting/Reports/AccountLedgerPage.tsx) |
| Opening-balance anchor (per account) | ✅ built — Account Ledger/Bank Statement plus Trial Balance and Balance Sheet use the latest applicable anchor; exact fiscal-year opening-stock anchors also feed IS/Current Year Profit/CoGM under the narrow V2 rules | `account_opening_balances`, [opening-balances.js](../../src/routes/accounting/opening-balances.js), [OpeningBalanceModal](../../src/components/Accounting/OpeningBalanceModal.tsx) |
| Trial Balance / Income Statement / Balance Sheet / CoGM (+ PDFs) | ✅ **V3 development boundary verified 21 Jul 2026** — 880/880 Jan–May TB rows exact, May BS balanced at RM8,980,756.68 with keyed closing stock (net assets RM6,090,429.60), opening + month-end closing inventory included, Note 22/7 journal-authoritative, BM/EN Guide updated. 36/40 statement lines exact vs the legacy scans; the only differences are the 4 named GP-202604-0001 drift lines. Still single-period and without prior-year comparatives | [financial-reports.js](../../src/routes/accounting/financial-reports.js), [Reports/](../../src/pages/Accounting/Reports/) |
| Debtors aging + PDF, Customer Statement PDF, Cash Receipt Voucher | ✅ | [DebtorsReportPage](../../src/pages/Accounting/DebtorsReportPage.tsx), [utils/accounting/](../../src/utils/accounting/) |

### Setup / master data

Chart of Accounts CRUD (2,749 active codes — legacy import, unpruned) · `financial_statement_notes` (33) · [LocationAccountMappingsPage](../../src/pages/Accounting/LocationAccountMappingsPage.tsx) (drives JVDR/JVSL + settlement accruals) · `material_purchase_account_mappings` · suppliers · materials/variants/stock buckets. Mapping rules & re-mapping SQL: [FINANCIAL_STATEMENTS_MAPPING.md](FINANCIAL_STATEMENTS_MAPPING.md).

---

## 2. Dev-DB reality check (refreshed 8 Jul 2026) — read before trusting older docs

This subsection is the historical 8 Jul snapshot and is superseded by the import/V2 records below. Considerable data entry had happened since the 2 Jul snapshot. Posted journals by type (8 Jul): **REC 2,759 · S 473 · B 61 · GP 23 · CN 21 · PUR 12 · J 8 · C 3 · JVSL 1 · JVDR 1**. The former statement that `account_opening_balances` was empty is no longer current: the Jan–May import and V2 development migration now own the guarded January and June anchor populations.

### 2b. fs_note wipe & re-map (8 Jul 2026)

The dev-DB refresh had also **wiped `account_codes.fs_note`** (2 of 2,750 codes tagged) — this is why the Income Statement / Balance Sheet / CoGM were showing zero amounts even though journals existed: every statement is a group-by of posted lines by `fs_note`. Re-applied 8 Jul via [`dev/migrations/fs_note_remap_2026-07.sql`](../../dev/migrations/fs_note_remap_2026-07.sql) (corrected rules — `MB*` → Note 5 not 5-1, `CASH_SALES` no longer clobbered, `CL_*` family, lean-GL codes `TP`/`PUR`/`OP`/`DEBTOR`; details in [FINANCIAL_STATEMENTS_MAPPING.md](FINANCIAL_STATEMENTS_MAPPING.md)). **This script must also be run in prod** whenever prod's fs_note is missing/stale. Two provisional calls to confirm with the user: `OP` (Overseas Purchases, GP journals) → Note 5, and `CH_REV1/2` → Note 6 (treated as cash-in-hand holding accounts).

## 3. Active goal — Bank Statement tie-out (item 1B-1)

**Target:** Bank Statement report for `BANK_PBB`, May 2026, walks 166,035.80 DR → **172,288.16 DR** (legacy book close; real bank closes 172,288.21 — a standing 5-sen reconciling item). Reference PDFs: `MAY2026_LEGACYGENERATED_BANKSTATEMENT.pdf` (source of truth for content/calculations) and `MAY2026_PCBBANKSTATEMENT.pdf` (real bank side).

The report itself already reproduces everything the legacy statement carries: Date · Journal ref · Particulars · Cheque · Debit (money in, book convention) · Credit (money out) · running Balance with DR/CR suffix · Balance B/F row · totals · account selector · month navigation · PDF export. **Visual copying of the legacy layout is explicitly NOT required — for this and every accounting report, only content, accounting meaning, calculations and reconciliation logic must be preserved.**

Remaining work, in order (steps 1–4 are data entry, not code):

1. Re-anchor `BANK_PBB` opening = 166,035.80 @ 2026-05-01 (modal on the Bank Statement page).
2. Generate May JVSL/JVDR vouchers first (so `ACW_*`/`ACD_*` accruals exist), then **Accounting → Payroll Bank Payment**, editing every amount to the *statement* figure (the May statement's monthly-salary lump 102,113.00 and EPF/SOCSO/SIP/PCB are the **April** payroll run; only half-month 24,700.00 is May) — do not trust April dev payroll data.
3. Key the remaining outgoing lines as manual journals per the **mapping guide table in ACCOUNTING_GAP_ANALYSIS.md** (suppliers→`CL_TP`/`TP`, directors→`CL_WSF`/`CL_GTH`, loans/HP, inter-bank→`BANK_ABB`, bank charges, utilities, worker claims/drawings, CP204). **Confirm each contra with the user before posting.**
4. Verify the close approaches 172,288.16; residual = missing line or genuine reconciling item.
5. First clean *auto*-tie-out is expected from the **June 2026** payroll run.

Small code enhancements worth doing alongside (not blockers):

- Cheque column fallback: bank statement reads `jel.reference` only; `C`-type entries store the cheque number on the header — use `COALESCE(jel.reference, je.cheque_no)` in [bank-statement.js](../../src/routes/accounting/bank-statement.js).
- Reconciliation helper on the page: input the actual bank closing balance, show the difference (planned in the original Phase 2.2 spec, never built; precursor to the bank-rec worksheet, gap 1B-8).

## 4. Next priorities after the tie-out

> **Update 21 Jul 2026:** the Jan–May legacy ledger import remains immutable and verified in production. The scan-verification V2+V3 packages are implemented and verified on development only: 63 CS anchors were converted to explicit zero fences, 62 evidenced OS anchors were added, 125 APPX mappings were corrected, the narrow fiscal-opening report engine balances the May books, monthly closing stock is keyed per month on the Material Stock page and injected at report level (May BS RM8,980,756.68, net assets RM6,090,429.60 = scan RM6,097,691.11 less the named RM7,261.51 GP drift), and the Trade Debtor list/statement columns and FIFO aging match the legacy scans 150/150. See [LEGACY_REPORT_VERIFICATION_PLAN.md](LEGACY_REPORT_VERIFICATION_PLAN.md) and [LEGACY_REPORT_RECONCILIATION.md](LEGACY_REPORT_RECONCILIATION.md). Production V2/V3 remains a separate approval.

Ranked; full rationale in [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md) (statuses refreshed 2 Jul 2026):

1. ~~**Monthly closing stock (V3 / remaining part of 1A-7)**~~ — ✅ **done 21 Jul 2026 on development**: exact-month values are keyed in `closing_stock_values` via the Material Stock page "Closing Stock (Financial Statements)" card and injected at report level into BS/IS/CoGM (never a GL posting); May 2026 verified 1:1 against the scans. The V2 exact-1-January rule was not generalised, and June checkpoints are not P&L opening stock.
2. ~~**Generic Account Ledger (1B-2)**~~ — ✅ **built 6 Jul 2026** ([AccountLedgerPage](../../src/pages/Accounting/Reports/AccountLedgerPage.tsx), Accounting → Reports → Account Ledger). One page answers "where did this TB number come from" and absorbs several missing legacy reports (director ledger, supplier ledger, cash book).
3. **Activate the purchase→payment loop** — features exist end-to-end (PUR/GP/PAY + PV references); needs invoices actually entered. Then AP aging (1B-5), supplier statement (1B-6), **Payment Voucher PDF print (1B-7 — still missing; only the Cash Receipt Voucher print exists)**.
4. **Recurring computed journals** — depreciation (needs fixed-asset register, 1A-4), HP interest/principal split (1A-6), tax provision. These are what still forces Excel. (Closing stock no longer needs a valuation journal — it is keyed monthly and injected at report level.)
5. **Statement compliance** — prior-year comparatives (1A-3), Schedule B admin-expense breakdown (1A-5), Cash Flow (1A-1), Changes in Equity (1A-2), period close/month-end lock (1A-8).
6. **Guardrail** — mark subledger-owned accounts (`TR`, `TP`, `BANK_*`) so manual journals can't double-post against them (decision noted in gap analysis, not built).

## 5. Known limitations & open questions

- TB/BS/IS/CoGM: 2026 opening stock and keyed monthly closing stock are included on development, but there are no comparatives, Note 5 remains one lump, and there is no general period-close workflow.
- No Payment Voucher print; no bank-rec worksheet; no fixed-asset register; no HP schedule; no Cash Flow / Changes in Equity.
- `fs_note` codes are **numeric** ('22', '7', …). The semantic-code migration (`BS_CA_TR` style) sketched in old plans was **never executed — treat it as abandoned** unless the user revives it.
- The chart of accounts is still the full 2,749-code legacy import, all active; lean-GL pruning not started (see gap analysis §0 — mark inactive, don't delete).
- Bank-statement gap-line questions for the user (gap analysis §Gap lines): how worker CLAIM BILLS / drawings figures are derived; which director + document backs `AMOUNT DUE TO DIRECTOR` lines; loan/HP contract inventory; how daily `SALES {date}` cash-banking amounts are decided.
- Legacy trial-balance classification questions — **settled by the Jan–May 2026 TB scans (21 Jul 2026)**: `BTRA` prints APPX 5 (administrative transportation), `NT_7484` prints APPX 5 with a zero balance (no Note 8 reclass), `CL_GT`/`CL_GF` debit balances print APPX 8 (legacy convention kept), `THJ_CK`/`THJ_SM` print APPX 5-1 (factory salaries, no inter-company recharge). Evidence: [LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md](LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md) addenda; regression-pinned by the legacy-report harness.

## 6. Documentation map

Cleanup executed 2 Jul 2026 removed the superseded planning docs; `docs/Account/` has since grown with the receipt refactor, the Jan–May import and the legacy-report parity project. The load-bearing docs:

| Doc | Role |
|---|---|
| **ACCOUNTING_PROGRESS.md** (this file) | Entry point / current-state handoff |
| [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md) | Master gap catalogue (Type 1 audit/ops, Type 2 legacy), bank-statement mapping guide, chart-of-accounts decision. Statuses refreshed 2 Jul 2026 (top banner); its 9-Jun session-state narrative is superseded by §2 above. |
| [FINANCIAL_STATEMENTS_MAPPING.md](FINANCIAL_STATEMENTS_MAPPING.md) | fs_note bridge reference: 33 notes, mapping rules, re-mapping SQL |
| [JOURNAL_VOUCHER_CALCULATIONS.md](JOURNAL_VOUCHER_CALCULATIONS.md) | JVDR/JVSL voucher calculation logic + historical balancing bug fixes (live code: journal-vouchers.js). *Renamed from AccountCodeCalculations.md.* |
| [LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md](LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md) | User's walk-through of every legacy TB code prefix — best single explanation of the legacy system. *Renamed from TRIAL_BALANCE_ANALYZED_BY_USER.md.* |
| [LEGACY_SYSTEM_REFERENCE.md](LEGACY_SYSTEM_REFERENCE.md) | Legacy-system reference: code-prefix table, legacy report inventory, key insights (HPA/HPB pairing, VRE rollup), open classification questions. *Renamed & trimmed from ACCOUNTING_AUDIT_HANDOVER.md.* |
| [INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md) | Receipt / bank-in / debtor refactor (Phases 0–8) — required reading for anything receipt/bank/debtor related |
| [LEGACY_JAN_MAY_IMPORT_PLAN.md](LEGACY_JAN_MAY_IMPORT_PLAN.md) | Jan–May 2026 ledger import plan & handover: hash-pinned IMP projection, anchors, production cutover; its 580-anchor figures are pre-V2 evidence |
| [LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md) | Import-era invoice reconciliation findings (source-record parity evidence/decisions) |
| [LEGACY_REPORT_VERIFICATION_PLAN.md](LEGACY_REPORT_VERIFICATION_PLAN.md) | Legacy report scans — verification & 1:1 parity plan (Phases V0–V4); documents the standing regression gate |
| [LEGACY_REPORT_RECONCILIATION.md](LEGACY_REPORT_RECONCILIATION.md) | Scan-vs-ERP reconciliation findings and the approved V2 correction package (125 anchors, 125 fs_note moves) |

Also in the folder: customer handovers (`CUSTOMER_CREDIT_APPLICATION_HANDOVER.md`, `CUSTOMER_DEBTOR_SUBLEDGER_JOURNALS_HANDOVER.md`, `KEEP_DEBTOR_SYNCED_WITH_CUSTOMERS.md`), `PAYMENT_SCENARIOS_REFERENCE.md`, and the two earlier `INVOICE-PAYMENT-ACCOUNT_IMPLEMENTATION_PLAN.md` drafts.

**Removed 2 Jul 2026** (implemented/superseded; load-bearing content absorbed into this file): `BANK_CASH_SYSTEM_PLAN.md`, `FRESH_ACCOUNTING_SYSTEM_PLAN.md`, `PAYMENT_JOURNAL_IMPLEMENTATION_SUMMARY.md`, `PURCHASES_SYSTEM_DEVELOPMENT_PLAN.md`, `ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md`. Two things worth remembering from them: the old Phase 2.2 bank-statement spec described the Debit/Credit columns **backwards** — the implementation (debit = money in, book convention) is correct; and the semantic fs_note code migration (`BS_CA_TR` style) they sketched was never executed (fs_note stays numeric). All are recoverable from git history if ever needed.

---

*Created 2 Jul 2026 from a full code + docs + dev-DB review. Update this file when journal sources, reports, or priorities change.*

# Accounting System — Progress & Handoff

**Status date: 2 Jul 2026.** Verified against the repo (`src/routes/accounting/`, `src/pages/Accounting/`) and the dev DB on this date. This is the single entry-point document for any agent continuing accounting work. Read this first, then [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md) for the full gap catalogue and the bank-statement manual-entry mapping guide.

---

## 1. Architecture in one page

- **Engine:** double-entry `journal_entries` + `journal_entry_lines`. Posted entries are immutable; corrections are cancellations/reversals. [JournalEntryPage](../../src/pages/Accounting/JournalEntryPage.tsx) is the universal escape hatch — anything can be keyed manually.
- **Layered screens:** structured transaction screens sit on top of the engine and *emit* posted journals (REC, PUR, GP, PAY, JVDR/JVSL, PBE, CN…). Structure is built only for high-volume flows; the long tail stays manual journals.
- **Statement bridge:** `account_codes.fs_note` → `financial_statement_notes` (33 notes; = the legacy trial balance "APPX" column). Every report is a group-by of posted journal lines by `fs_note`. **A statement is exactly as correct as the journals beneath it.**
- **Subledger principle (decided, do not re-litigate):** lean GL + detail in relational tables (`invoices`, `purchase_invoices`, `self_billed_invoices`, `supplier_payments`, `payments`, materials/stock). No per-supplier/customer/vehicle GL codes for new transactions. Legacy's 2,749 imported codes stay for history (pruning to a lean set has not started).
- **Keep the journal-voucher system** (decided Jan 2026): journals are the engine; better screens feed it.

### Journal sources (what auto-posts, and from where)

| Type | What | Journal shape | Source code |
|---|---|---|---|
| `REC` | Customer payment receipts | DR `CASH`/`BANK_PBB`/`BANK_ABB` / CR `TR` (overpay → CR `CUST_DEP`); pending cheques defer journal until confirm; cancel = journal cancelled | [payment-journal.js](../../src/routes/accounting/payment-journal.js), [payments.js](../../src/routes/sales/invoices/payments.js), [payment-helpers.js](../../src/utils/payment-helpers.js) |
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
| **Bank Statement** (running ledger per bank/cash account) | ✅ built, content-parity with legacy verified against May 2026 PDFs | [bank-statement.js](../../src/routes/accounting/bank-statement.js), [BankStatementPage](../../src/pages/Accounting/Reports/BankStatementPage.tsx), [BankStatementPDFMake.ts](../../src/utils/accounting/BankStatementPDFMake.ts) |
| Opening-balance anchor (per account) | ✅ built — **read only by the Bank Statement** | `account_opening_balances`, [opening-balances.js](../../src/routes/accounting/opening-balances.js), [OpeningBalanceModal](../../src/components/Accounting/OpeningBalanceModal.tsx) |
| Trial Balance / Income Statement / Balance Sheet / CoGM (+ PDFs) | 🟡 built, but single-period, **YTD from Jan 1 with no brought-forward — they do NOT read the opening anchor**; Note 22 & 7 computed live from `invoices` | [financial-reports.js](../../src/routes/accounting/financial-reports.js), [Reports/](../../src/pages/Accounting/Reports/) |
| Debtors aging + PDF, Customer Statement PDF, Cash Receipt Voucher | ✅ | [DebtorsReportPage](../../src/pages/Accounting/DebtorsReportPage.tsx), [utils/accounting/](../../src/utils/accounting/) |

### Setup / master data

Chart of Accounts CRUD (2,749 active codes — legacy import, unpruned) · `financial_statement_notes` (33) · [LocationAccountMappingsPage](../../src/pages/Accounting/LocationAccountMappingsPage.tsx) (drives JVDR/JVSL + settlement accruals) · `material_purchase_account_mappings` · suppliers · materials/variants/stock buckets. Mapping rules & re-mapping SQL: [FINANCIAL_STATEMENTS_MAPPING.md](FINANCIAL_STATEMENTS_MAPPING.md).

---

## 2. Dev-DB reality check (2 Jul 2026) — read before trusting older docs

The dev DB was evidently **refreshed after 9 Jun 2026**, so the state described at the end of [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md) no longer holds:

- Posted journals by type: **REC 2,619 · CN 20 · GP 5 — nothing else.** No JVDR/JVSL, no PBE settlement journals, no PUR, no PAY.
- `account_opening_balances` is **empty** — the `BANK_PBB` = 166,035.80 @ 2026-05-01 anchor must be re-set (Bank Statement page → "Set opening balance").
- `purchase_invoices`: 0 rows · `supplier_payments`: 0 rows (features built, unused).
- May 2026 `BANK_PBB`: 151 REC debit lines (RM 395,669.93), **zero credit/outgoing lines** — the May tie-out walk-down was never entered.

Implication: the **features** are all in place; the **May 2026 tie-out proof is pure data entry that still has to be (re)done.**

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

Ranked; full rationale in [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md) (statuses refreshed 2 Jul 2026):

1. **Opening balances into the statements (1A-7) — the single most important unlock.** (a) Multi-account opening-balance setup screen (migration "Opening Balance as at …" sheet); (b) wire `account_opening_balances` into the TB/BS/IS/CoGM engines, which today sum YTD from Jan 1 ([financial-reports.js:373-391](../../src/routes/accounting/financial-reports.js)). The Balance Sheet cannot balance for an established company until this is done.
2. **Generic Account Ledger (1B-2)** — parametrise the bank-statement view for *any* account code (supplier, director `CL_WSF`, prepayment, inter-company). One page answers "where did this TB number come from" and absorbs several missing legacy reports (director ledger, supplier ledger, cash book).
3. **Activate the purchase→payment loop** — features exist end-to-end (PUR/GP/PAY + PV references); needs invoices actually entered. Then AP aging (1B-5), supplier statement (1B-6), **Payment Voucher PDF print (1B-7 — still missing; only the Cash Receipt Voucher print exists)**.
4. **Recurring computed journals** — depreciation (needs fixed-asset register, 1A-4), HP interest/principal split (1A-6), closing-stock valuation journal, tax provision. These are what still forces Excel.
5. **Statement compliance** — prior-year comparatives (1A-3), Schedule B admin-expense breakdown (1A-5), Cash Flow (1A-1), Changes in Equity (1A-2), period close/month-end lock (1A-8).
6. **Guardrail** — mark subledger-owned accounts (`TR`, `TP`, `BANK_*`) so manual journals can't double-post against them (decision noted in gap analysis, not built).

## 5. Known limitations & open questions

- TB/BS/IS/CoGM: no brought-forward, no comparatives, Note 5 one lump, no period lock.
- No Payment Voucher print; no bank-rec worksheet; no fixed-asset register; no HP schedule; no Cash Flow / Changes in Equity.
- `fs_note` codes are **numeric** ('22', '7', …). The semantic-code migration (`BS_CA_TR` style) sketched in old plans was **never executed — treat it as abandoned** unless the user revives it.
- The chart of accounts is still the full 2,749-code legacy import, all active; lean-GL pruning not started (see gap analysis §0 — mark inactive, don't delete).
- Bank-statement gap-line questions for the user (gap analysis §Gap lines): how worker CLAIM BILLS / drawings figures are derived; which director + document backs `AMOUNT DUE TO DIRECTOR` lines; loan/HP contract inventory; how daily `SALES {date}` cash-banking amounts are decided.
- Legacy trial-balance classification questions still open: `THJ_CK`/`THJ_SM`, `NT_7484` (quit rent?), `CL_GT`/`CL_GF` debit balances on the liability side, `BTRA`.

## 6. Documentation map

Cleanup executed 2 Jul 2026 — `docs/Account/` now holds exactly these six files:

| Doc | Role |
|---|---|
| **ACCOUNTING_PROGRESS.md** (this file) | Entry point / current-state handoff |
| [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md) | Master gap catalogue (Type 1 audit/ops, Type 2 legacy), bank-statement mapping guide, chart-of-accounts decision. Statuses refreshed 2 Jul 2026 (top banner); its 9-Jun session-state narrative is superseded by §2 above. |
| [FINANCIAL_STATEMENTS_MAPPING.md](FINANCIAL_STATEMENTS_MAPPING.md) | fs_note bridge reference: 33 notes, mapping rules, re-mapping SQL |
| [JOURNAL_VOUCHER_CALCULATIONS.md](JOURNAL_VOUCHER_CALCULATIONS.md) | JVDR/JVSL voucher calculation logic + historical balancing bug fixes (live code: journal-vouchers.js). *Renamed from AccountCodeCalculations.md.* |
| [LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md](LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md) | User's walk-through of every legacy TB code prefix — best single explanation of the legacy system. *Renamed from TRIAL_BALANCE_ANALYZED_BY_USER.md.* |
| [LEGACY_SYSTEM_REFERENCE.md](LEGACY_SYSTEM_REFERENCE.md) | Legacy-system reference: code-prefix table, legacy report inventory, key insights (HPA/HPB pairing, VRE rollup), open classification questions. *Renamed & trimmed from ACCOUNTING_AUDIT_HANDOVER.md.* |

**Removed 2 Jul 2026** (implemented/superseded; load-bearing content absorbed into this file): `BANK_CASH_SYSTEM_PLAN.md`, `FRESH_ACCOUNTING_SYSTEM_PLAN.md`, `PAYMENT_JOURNAL_IMPLEMENTATION_SUMMARY.md`, `PURCHASES_SYSTEM_DEVELOPMENT_PLAN.md`, `ACCOUNTING_SYSTEM_IMPLEMENTATION_PLAN.md`. Two things worth remembering from them: the old Phase 2.2 bank-statement spec described the Debit/Credit columns **backwards** — the implementation (debit = money in, book convention) is correct; and the semantic fs_note code migration (`BS_CA_TR` style) they sketched was never executed (fs_note stays numeric). All are recoverable from git history if ever needed.

---

*Created 2 Jul 2026 from a full code + docs + dev-DB review. Update this file when journal sources, reports, or priorities change.*

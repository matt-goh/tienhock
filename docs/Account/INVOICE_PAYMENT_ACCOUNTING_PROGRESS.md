# Invoice / Payment / Receipt / Bank-In / Accounting Refactor — Progress & Handover

**Created: 10 Jul 2026 (Phase 0). Status: Phase 0 complete — no code changed yet.**
Companion to [INVOICE-PAYMENT-ACCOUNT_IMPLEMENTATION_PLAN.md](INVOICE-PAYMENT-ACCOUNT_IMPLEMENTATION_PLAN.md) (the authoritative brief) and the user's original draft `(UNREFINED)INVOICE-PAYMENT-ACCOUNT_IMPLEMENTATION_PLAN.md`. Update this file at the end of every phase; do not mark a phase complete merely because code was written.

---

## 1. Scope and hard boundaries

**Goal:** make CH_REV1, CH_REV2, CASH_SALES, CR_SALES, and BANK_PBB reconcile row-by-row (date, Journal ref, Cheque ref, particulars, DR/CR side, amount, running balance, within-day ordinal) with the legacy June 2026 ledger PDFs; model receipts as header+allocations; build a structured RV bank-in workflow with a shared `RV###/MM` sequence; complete CN/DN/RN local accounting; then (gated) debtor child postings, ledger ranges, and debtor statement fixes.

**Absolute no-eInvoice boundary.** Never modify: `src/utils/invoice/einvoice/**`, MyInvois clients/templates/handlers, `autoConsolidation.js`, `autoAdjustmentConsolidation.js`, `uuid`/`submission_uid`/`long_id`/`einvoice_status`/consolidation fields or their lifecycles, e-Invoice routes/UI, GT/JP e-Invoice code. Accounting corrections that need a different visible reference/date than the MyInvois document must store/derive a separate accounting-side field, never touch the e-Invoice state.

**Out of scope without separate permission:** GT/JP accounting behavior changes (JP shares tables — verify no breakage, do not redesign), payroll/production, supplier-side flows (PUR/GP/PAY), pruning the chart of accounts, financial statement engine rework beyond the connected checks in the plan.

Source priority when evidence conflicts: scanned legacy PDFs → user's business rules in the brief → dev DB → current code/docs → accounting standards.

---

## 2. OCR evidence (evidence gate PASSED) and uncertainties

All 6 PDFs / 28 pages OCR'd and transcribed to CSV fixtures under [fixtures/](fixtures/), with running balances arithmetic-verified at every page boundary and at month close:

| Fixture file | Ledger | Rows | Opening | Closing | Verified |
|---|---|---|---|---|---|
| `JUNE2026_CH_REV1.csv` | CH_REV1 | 284 | 35,644.35 DR | 34,190.55 DR | ✅ chain + close |
| `JUNE2026_CH_REV2.csv` | CH_REV2 | 21 | 1,060.05 DR | 117.55 DR | ✅ chain + close |
| `JUNE2026_CASH_SALES.csv` | CASH_SALES | 215 | 1,037,680.40 CR | 1,251,045.50 CR | ✅ chain + close |
| `JUNE2026_CR_SALES.csv` | CR_SALES | 185 | 2,296,968.93 CR | 2,809,873.38 CR | ✅ chain + close (179 invoice credits 513,062.80 + 5 THCN debits 158.35) |
| `JUNE2026_BANK_PBB.csv` | BANK_PBB | 279 | 172,288.16 DR | 212,738.37 DR | ✅ chain + close; 278 tx rows = 206 debits 685,388.69 / 72 credits 644,938.48 — both match the brief exactly |
| `JAN-JUN2026_C-CARE1.csv` | C-CARE(1) debtor | 31 | 7,635.00 DR (01/01) | 11,788.00 DR (24/06) | ✅ chain + close; 23/05 balance 8,748.00 = imported 1 June anchor |

CSV schema: `ledger,page,row,date,journal,particulars,cheque,debit,credit,balance,balance_side,day_ordinal,notes`. `day_ordinal` is the within-day print order — Phase 5 reconciliation and the persisted ledger display sequence must reproduce it.

### 2a. Evidence corrections to the brief (proven by OCR)

1. **RM34.00 / cash bill `015375` (29/06, VIVIANA).** The brief's OCR baseline table says CH_REV1 June debits 213,365.10 / credits 214,818.90. Balance-chain-verified OCR shows **213,331.10 / 214,784.90** — exactly 34.00 lower on both sides. `015375` appears in CASH_SALES (34.00 CR) but has **no CH_REV1 counterpart row and no BANK_PBB row anywhere**. The legacy closes (34,190.55 / 1,251,045.50) still match because the omission nets out of both CH_REV1 sides. The ERP has the invoice (paid, journal 2991). ⇒ This is a **legacy bookkeeping omission**: the new system posting 015375 correctly will make live CH_REV1 differ from the PDF by +34.00 DR in-month (and the 29/06 pool's unbanked remainder by +34.00) unless the user approves a documented arithmetic bridge (see Open Questions #1). Per the brief: report the bridge; do not delete ERP data to force parity.
2. **RV052/06 and RV074/06 are SPLIT per customer group on the bank side.** CH_REV2 shows one aggregated credit each (582.80; 1,082.40) but BANK_PBB prints two debit rows per RV (530.00 TEO + 52.80 ROSE; 870.00 KELUARGA + 212.40 PUBLIC), repeating the same RV journal ref. Inverse of `TF060626` (one aggregated 5,220.00 bank debit, itemized 1,080+4,140 in the debtor ledger). ⇒ The bank-in model's "multiple display groups under one RV, each group its own bank line, holding credit aggregated per contra" is confirmed required, and **journal display refs are not unique per row** in legacy.
3. **RV sequence extends past the cash ledgers: RV082/06 and RV083/06** exist in BANK_PBB only (CTOS refund 143.70; Puncak Niaga overpayment refund 5.40). Together with RV021/022/048 (`FROM DRAWING WORKERS`) and RV047 (May-dated sales pool), plan rule "shared RV sequence across all receipt kinds, gaps legitimate in any single ledger" is proven: all of RV001–RV083 are accounted for across the two cash ledgers + bank.
4. **`TF190626-2` does not exist in BANK_PBB** (suffix series jumps -1 → -3, while TF190626-3 matches the C-CARE(1) row). Legacy suffix allocation may skip; the ERP must tolerate imported gaps in the `-n` suffix family.
5. **`MBB932037-P` appears on two different bank rows** (TETAPJAYA(I) and TETAPJAYA(N)) — an explicit duplicate visible Journal ref on the same date. Confirms visible display reference cannot be a unique key.
6. **PV cheque numbers:** June PVs carry real cheque numbers `PB350778`–`PB350785` in the Cheque column (printed `PB`, not `PBB`). PV002/06's PB350779 = the ERP `journal_entries.cheque_no` seed **PBB350779**. The seed is one behind legacy (PV001/06 = PB350778) and prefix differs; harmless, but note the ERP C-type sequence must not collide with manual PV entry of historical cheque numbers.
7. **JV numbering:** `JV26/06/01`, `/02`, `/09` are the only bank-touching JVs; 03–08 live in other ledgers. PBE numbering is not date-ordered (PBE032/06 on 11/06 before PBE025–031/06 on 12/06). Cheque column for PBE rows holds a batch ref (`PBE26060`→`PBE26063`), not a cheque number.
8. **`TJ050626`** = Jelly Polly invoice `004697/JP` received into the TH bank — a cross-company receipt family (`TJ`) to keep displayable; treatment of its contra is an open question (#6).
9. **TS rows have no Cheque value** (TS080626, TS120626). Cheque column truncates long suffixed refs at 10 chars (`T050626-`). RV rows have blank Cheque. External-bank cheque rows print the bare cheque number in Cheque and `{BANKPREFIX}{chequeno}` as Journal (families seen: PIB, RHB, ALB, PBB, MBB, MIB).

### 2b. OCR uncertainties (all recorded in fixture `notes` columns)

- Hole-punched/smudged dates on ~12 rows — day inferred from sort order and balance chain (flagged `UNCERTAIN day only`).
- Customer `63952` printed "TW" vs "TM" across ledgers; `DEJAVA` vs `DEJAYA`; `SANAJA S/B` payee low print quality.
- One smudged balance digit (CH_REV1 row 185) and one smudged amount (PV008/06 11,764.40) resolved by arithmetic.
- CASH_SALES omits customer names on some rows that CH_REV1 prints; particulars normalization must not assume both ledgers print identical strings.
- C-CARE(1) report header prints a stale system date ("01 MAR 2010"); row dates are authoritative.

---

## 3. Dev DB snapshot (re-queried 10 Jul 2026; data entry is ongoing — always re-query)

- `account_opening_balances`: **153 anchors** at 2026-06-01, including BANK_PBB 172,288.16 · CH_REV1 35,644.35 · CH_REV2 1,060.05 · C-CARE(1) 8,748.00 — all four equal the legacy PDFs. (ACCOUNTING_PROGRESS.md §2's "anchors empty" is stale.) CASH_SALES / CR_SALES have **no anchors** — their 1 June openings (1,037,680.40 CR / 2,296,968.93 CR) must be proven from prior postings or imported before Phase 5 (plan §10).
- June posted lines (status='posted', entry_date in June):
  - `CASH_SALES`: 208 lines, CR 213,365.10 — **equals legacy exactly** (215 legacy rows incl. zero informational rows; zero-amount invoices post no journal).
  - `CR_SALES`: 179 lines, CR 513,062.80 — equals legacy invoice credits exactly; the 5 THCN debits (158.35) are **not in CR_SALES** (current CN journals debit `RETURN`, dated 26/06, refs JCN-202606-00xx) → Phase 4.
  - `CH_REV1`: 204 lines, DR 209,902.10 / CR 0.00 — vs legacy DR 213,331.10 / CR 214,784.90. No RV bank-ins exist (nothing ever credits CH_REV1) → Phase 3. DR gap ≈ 3,429.00 to investigate in the migration dry-run (candidates: receipts recorded with non-June entry dates, cancelled-but-posted journals, zero/missing journals).
  - `CH_REV2`: 56 lines, DR 178,230.20 / CR 0.00 — vs legacy DR 7,202.70 / CR 8,145.20. **Source confirmed:** all 56 lines are REC journals from payments keyed `payment_method='cash'` against INVOICE-type invoices. Legacy shows physical cash for old credit bills was only 7,202.70 in June — so the bulk of these 56 are direct bank transfers (T/TF/TR/TT families) **misclassified as "cash" at data entry**, then routed to CH_REV2 by `getDebitAccount`. The dry-run must match each against the legacy bank statement rows (reclassify → bank receipt) vs the 20 legacy CH_REV2 rows (true physical cash, `C{INVOICE_NO}` receipts). June posted-journal payment mix for reference: cash×CASH 204 = 209,902.10 · cash×INVOICE 56 = 178,230.20 · online×INVOICE 115 = 315,063.99 · cheque×INVOICE 23 = 115,186.40 · bank_transfer×INVOICE 2 = 376.40.
  - `BANK_PBB`: 211 lines, DR 430,626.79 / CR 619,901.48 — vs legacy 685,388.69 / 644,938.48. Missing all RV debits; credit side likely near-complete via B/PBE + PV/C + JV manual work.
- Invoice `015375`: exists, CASH, 2026-06-29, VIVIANA, 34.00, paid, `journal_entry_id` 2991 (posted S journal). Legacy-side omission per §2a-1.
- June `payments`: 366 active (357 with journal, **9 active without any journal**), 53 cancelled (all with journal links). Across all time: journals referenced by cancelled payments = 69 cancelled vs **247 still 'posted'** — cancelled sources retaining posted journals; migration must fix (plan §9 "a cancelled source cannot retain a posted source-owned journal").
- `payments.internal_reference`: 0 non-null — unused, free for the new model or removal.
- Posted journals by type (10 Jul): REC 2,821 · S 524 · B 61 · GP 23 · CN 21 · PUR 15 · J 8 · C 8 · JVDR 1. **REC dates span 2025-07-05 → 2026-08-07** — pre-cutover receipts exist AND at least one future-dated (typo) receipt; both must surface in the dry-run.
- CN linkage: legacy THCN/26/17–19 (10/06; 51.30/36.05/26.35 for invoices 63906–63908) = ERP JCN-202606-0017/18/19 dated **26/06**, and legacy THCN/26/20–21 (30/06; 23.10/21.55 for 64027/64028) = ERP TH-CN-26-2/TH-CN-26-1 (JCN-202607-0002/0001) dated **01/07** — reference format, accounting date, and debit account (RETURN vs CR_SALES) all differ from legacy; older CNs predate `display_id`. Phase 4 must add an accounting-visible reference/date without touching MyInvois state, and ask before re-dating historical rows.
- `jellypolly.payments` has **no `journal_entry_id` column** — JP receipts post no journals into the shared ledger, so there is no JP contamination of CH_REV1/CH_REV2/BANK_PBB. JP compatibility risk is limited to the shared `PaymentForm.tsx`/endpoint contract (Phase 2).

## 3b. Current code audit (read 10 Jul 2026)

- [payment-journal.js](../../src/routes/accounting/payment-journal.js): REC = 2-line DR `CH_REV1`/`CH_REV2` (cash, by invoice paymenttype) or bank / CR `TR`; ref `REC-YYYYMM-XXXX`; overpay variant credits `CUST_DEP`; cancel sets journal status. One journal per `payments` row; `jel.reference` stores the REC ref (not a cheque); descriptions not editable.
- [payments.js](../../src/routes/sales/invoices/payments.js): per-invoice POST; pending cheques defer journal until `/confirm` (which matches by `payment_reference` — the exact over-broad matching the plan flags); overpayment split into a second `payments` row; cancellation is per-row.
- [PaymentForm.tsx](../../src/components/Invoice/PaymentForm.tsx) line ~180: loops `api.post` once per selected invoice — no atomic grouped receipt; shared with JP via `apiEndpoint` prop (compat risk when endpoint contract changes).
- [sales-journal.js](../../src/routes/accounting/sales-journal.js): S journal DR TR / CR CASH_SALES|CR_SALES, `reference_no` = invoice id, updated in place, cancelled with invoice, zero-amount → journal cancelled/skipped (zero bills currently produce **no** informational ledger rows → plan requires source-owned zero lines).
- [bank-statement.js](../../src/routes/accounting/bank-statement.js): `BANK_LINKED_ACCOUNTS = { BANK_PBB: { keep: [CH_REV1, CH_REV2] } }` — the synthetic projection that fakes bank money-in from holding-account debits; used by BOTH the anchor-to-start movement and the month query, so cutover removal must touch every calculation path. Cheque column = `jel.reference` only (no `je.cheque_no` fallback).
- [adjustment-docs/accounting.js](../../src/routes/sales/adjustment-docs/accounting.js): CN = DR `RETURN`/CR TR (must become DR original revenue ledger); DN = DR TR/CR `SLS` (must become CR original revenue); RN paired = DR TR/CR bank, standalone = DR `CUST_DEP`/CR bank (already matches contract); refs `JCN/JDN/JRN-YYYYMM-XXXX` (visible accounting ref must become the document number, e.g. THCN/26/17 ↔ TH-CN-26-x).
- [opening-balances.js](../../src/routes/accounting/opening-balances.js) + `account_opening_balances`: anchor CRUD; read only by the bank-statement/account-ledger API.
- [debtorSync.js](../../src/routes/accounting/debtorSync.js): DEBTOR children 1:1 from customers (code = customer id, `-D` suffix on collision) — Phase 6 foundation, per [CUSTOMER_DEBTOR_SUBLEDGER_JOURNALS_HANDOVER.md](CUSTOMER_DEBTOR_SUBLEDGER_JOURNALS_HANDOVER.md).
- [journal-entries.js](../../src/routes/accounting/journal-entries.js): manual J/C/B entries; header `cheque_no` auto-sequence for C-type from PBB350779; system types locked from manual edit.

---

## 4. Frozen contracts (Phase 0 decisions)

### 4a. Accounting contract (end state; receivable side stays on TR until Phase 6)

| Event | Visible ref / date | Journal | Notes |
|---|---|---|---|
| Cash bill | invoice id / local invoice date | One invoice-owned journal. Pre-Phase-6: DR CH_REV1 / CR CASH_SALES. Phase 6 four-line: DR debtor-child, CR CASH_SALES, DR CH_REV1, CR debtor-child | No separate posting-owned receipt; no bank line until RV |
| Credit invoice | invoice id / local invoice date | DR debtor / CR CR_SALES | Permanent revenue row; payment never removes/redates it |
| Physical cash for old credit invoice | default `C{INVOICE_NO}` editable / receipt date | DR CH_REV2 / CR debtor | Sits in CH_REV2 until RV'd |
| Cash-sales pool bank-in | shared `RV###/MM` / bank-in date | DR bank / CR CH_REV1 | Partial amounts from a source-date pool; description carries source date |
| Old-credit cash bank-in | shared `RV###/MM` / bank-in date | DR bank / CR CH_REV2 | Select unbanked receipts; multi-customer groups; bank side may print one row per group (RV052/074 pattern) |
| Direct bank/online/cleared cheque | user-entered Journal ref (T/TF/TR/TT/TS/TJ/external-bank families) / actual receipt or clear date | DR bank (aggregated) / CR debtor itemized per allocation; excess CR CUST_DEP | Cheque field separate, repeatable. An allocation may target a debtor/GL account with a free-text invoice ref instead of a TH invoice FK (TJ/JP case, §8-4) |
| Pending cheque | user ref / — | no journal until cleared | no balance/credit_used effect |
| CN | visible CN doc number / accounting posting date | DR original revenue ledger (CR_SALES or CASH_SALES) + proven output-tax reversal / CR debtor | June THCNs debit CR_SALES |
| DN | visible DN number | DR debtor / CR original revenue (+ output tax) | |
| RN (paired) | visible RN number | DR debtor (or proven refund liability) / CR bank/cash | settlement only |
| RN (standalone overpay) | visible RN number | DR CUST_DEP / CR bank/cash | |
| Zero cash bill | invoice id | source-owned zero journal lines | informational rows in CH_REV1 (blank) and CASH_SALES (".00"); excluded from totals/balances |
| Manual PBE/PV/JV | user ref + real Cheque value | user-confirmed contra / bank | stay manual; never guess contra from OCR |

Sale/adjustment symmetric split (frozen): sale = CR revenue for `total_excluding_tax + rounding`, CR OUTPUT_TAX for `tax_amount` (June tax = 0; do not hardcode); CN = exact reversal; DN = exact inverse; RN never touches revenue/tax/rounding. If live nonzero data breaks the field identities → stop for a decision. No unproven rounding account. No double-posting RETURN + revenue; sales-return analytics move to metadata if needed. `customers.credit_used` = derived invariant of active open-item state, updated exactly once per lifecycle event.

### 4b. Reference contract

Three separate concepts, persisted separately:
1. **Internal source identity / idempotency key** — new receipt/bank-in tables' PKs + source-unique constraints; journals keep an internal `reference_no` uniqueness story compatible with migration (decide exact column strategy in Phase 1: explicit display-reference field on journal header/lines, since legacy display refs repeat — MBB932037-P, RV052/06).
2. **Visible Journal/Reference No.** — invoice id for S; `C{INVOICE_NO}` default for cash receipts; user-entered T-family/external refs for direct receipts (`TF040626-2`); `RV###/MM` for bank-ins; document number for CN/DN/RN.
3. **Cheque/transfer reference** — separate field, repeatable (`TF040626` across 8 rows), blank for RV, batch refs for PBE, real cheque numbers for PV/external banks; bank-statement report uses persisted line/header cheque with explicit fallback (`COALESCE(jel.cheque…, je.cheque_no)`), never substituting the Journal ref.

RV numbering: `RV{3-digit}/{MM}`; **one shared transactional registry** across CH_REV1 bank-ins, CH_REV2 bank-ins, and manual/miscellaneous RVs (drawing-worker repayments RV021/022/048, refunds RV082/083); duplicate scope = company + accounting year + month; prefilled, editable, race-safe (retry on unique conflict or advisory lock); gaps allowed; cancelled RVs stay reserved; `/MM` must match posting month except approved historical import.

### 4c. Description contract

Defaults (editable at the owning source; override persisted; resync never erases an override; customer **ID**, not name):
- `CASH BILL: {INVOICE_NO} - {CUSTOMER_ID}`
- `INV/NO: {INVOICE_NO} - {CUSTOMER_ID}`
- same-customer group: `INV/NO: {INV1}/{INV2}/... - {CUSTOMER_ID}`
- mixed-customer group: `INV/NO: {G1_INVOICES} - {CUST_1} & {G2_INVOICES} - {CUST_2}`
- cash-sales bank-in: `SALES CASH FROM {DD/MM/YYYY} BANK IN`
- CN/DN/RN: visible doc number + entered reason (e.g. the prompt-payment wording) — never infer percentages.

### 4d. Cancellation / lifecycle contract

- Receipt header cancellation cancels its one journal and reverses invoice balances + credit_used atomically; per-allocation correction cannot silently cancel unrelated allocations.
- A cash receipt already allocated to a posted RV cannot be cancelled until the RV is reversed; RV reversal returns amounts to the unbanked pool.
- Once a CH_REV1 source-date pool is partly banked, block (or transactionally reverse) cash-invoice cancellation/redating/reduction/conversion that would drop collected below banked.
- Pending cheque confirm targets the exact receipt header (not `payment_reference` matching); posts on clear date, preserves received date.
- Cancelled source ⇒ no posted source-owned journal (migration fixes the 247 existing violations).
- Payment-type conversion: preserve genuine receipts, distinguish automatic vs genuine explicitly (never by note text), full reconciliation or a clear block.

### 4e. Cutover policy (approved by user 10 Jul 2026)

**Cutover = 1 June 2026** (all four imported anchors are at this date). Policy chosen from plan §9: **retain a clearly isolated pre-cutover compatibility path** — `BANK_LINKED_ACCOUNTS` projection applies only to dates `< 2026-06-01`; on/after cutover every BANK_PBB calculation path (month query, anchor-to-start movement, derived-opening fallback, totals/counts, PDFs/exports, future range APIs) uses real BANK_PBB lines only. No date may ever produce both a synthetic projection row and a real bank line. Rationale: pre-June bank-ins lack row-level evidence to backfill honestly; the May 2026 tie-out proof stays intact. CH_REV1/CH_REV2 opening-pool composition: seed from PDF-proven components (e.g. CH_REV2 anchor = 1,060.00 invoices 34869/34891 TEO + 0.05 unanalysed residual; CH_REV1 pools for RV001–004/012–020/047 source dates), keep any unproven residue as explicitly unanalysed opening cash — never invent allocations to exhaust an anchor.

---

## 5. Phase checklist

| Phase | Content | Status |
|---|---|---|
| 0 | Evidence gate, DB re-query, code audit, frozen contracts, this doc | ✅ complete 10 Jul 2026 |
| 1 | Receipt header/allocation + bank-in source schema, reference/description/idempotency fields, dry-run + idempotent migrations, schema docs | ✅ complete 10 Jul 2026 (see §5a) |
| 2 | Invoice + receipt posting across all lifecycle paths; atomic grouped receipt API/UI; backfill stale REC journals | ✅ complete 10 Jul 2026 (see §5b) |
| 3 | RV bank-in UI/backend; real DR bank / CR holding journals; cutover isolation of BANK_LINKED_ACCOUNTS; manual cheque fallback | ✅ complete 10 Jul 2026 (see §5c) |
| 4 | CN/DN/RN accounts/references/dates/descriptions/reports; migrate existing CN journals; DN/RN tests | ⬜ |
| 5 | Full five-ledger row-by-row June reconciliation vs fixtures (gate for Phase 6) | ⬜ |
| 6 | Customer debtor child postings + historical rewrite (per debtor handover doc) | ⬜ |
| 7 | Account Ledger TimeNavigator ranges; debtor anchors → General Statement BAL B/F; Customer Statement corrections; C-CARE validation | ⬜ |
| 8 | CashReceiptVoucher print cleanup, connected reports, changelog (BM+EN), doc refresh, final bug-scan offer | ⬜ |

Per-phase "files changed" and "verification queries/results" sections get appended here as phases execute.

### 5a. Phase 1 — executed 10 Jul 2026

**Files:**
- `dev/migrations/2026-07-10_receipts_bankins_foundation.sql` — new tables `receipts`, `receipt_allocations`, `rv_registry`, `bank_ins`, `bank_in_groups`, `bank_in_allocations`; new columns `journal_entries.display_reference/posting_sequence/source_type/source_id`, `journal_entry_lines.cheque_reference/display_order`, `invoices.accounting_description`; journal source-link backfill; partial unique index = one posted journal per (source_type, source_id).
- `dev/migrations/2026-07-10_receipts_bankins_dryrun.sql` — read-only report of every §6 dry-run category (sections A–Q).
- `CLAUDE.md` + `AGENTS.md` — schema docs updated (78 → 84 tables).

**Execution order (dev applied; prod pending):** dry-run (before) → foundation → foundation again (idempotency) → dry-run (after).

**Verification results (dev DB, 10 Jul 2026):**
- Migration applied cleanly; backfill linked 525 invoice + 2,890 payment + 21 adjustment + 28 self-billed journals (`purchase_invoices`/`supplier_payments` empty → 0; B/C/J/JVDR/PUR journals correctly stay unlinked = manual).
- Rerun: all seven backfill UPDATEs = 0 rows; every CREATE skipped; COMMIT — **idempotent**.
- Balance-invariant snapshot (posted DR/CR per CH_REV1/CH_REV2/CASH_SALES/CR_SALES/BANK_PBB/TR) **byte-identical before/after** — no financial change.
- Duplicate-source guard found no duplicates; no journal is referenced by more than one payment (dry-run K = 0 rows).

**Dry-run findings (full output regenerable any time; data entry is ongoing so numbers move):**
- A: 4,959 active payments (2,574 with journals — the ~2,385 without are almost all pre-cutover 2025 rows, superseded by the 1 June anchors), 623 cancelled, 21 pending cheques (no journals ✓).
- B/N: the June cash×INVOICE population shrank from 56 rows / 178,230.20 (morning) to **13 rows / 10,082.70** — data entry actively reclassifying. **12 of the 13 match the legacy CH_REV2 June debits exactly (7,202.70, refs C63740/C015333…C015373)**; the sole anomaly is payment 5229: invoice `015361`/YESOKEY 2,880.00 on 13/06 — legacy books the credit sale in CR_SALES but shows **no settlement anywhere in June** (open question §8-9).
- C/C2: multi-invoice grouped receipts are pervasive year-round (e.g. cheque PBB676010 = 13 invoices / 79,952.50). `TF040626-2` = payments 5202+5203 (729.00+900.00 = 1,629.00 ✓ plan fixture 6); TF040626-4/-5 similarly split (1,472.60+256.50; 1,453.50+1,098.00) matching the bank fixture exactly.
- D: only 2 blank-reference non-cash payments (707.00).
- E: 0 overpaid rows — deliberate overpayment/DN/RN tests required later (plan Phase 4).
- F: cash payments on CASH invoices: 2,495 same-day (auto cash-bill candidates) vs 468 different-day / 580,700.70 (mostly keying-date noise; Phase 2 must re-date automatic collections to the invoice local date and flag genuine ones).
- H: 247 cancelled payments still holding POSTED journals = 886,011.20 (Jan–Jul 2026) — Phase 2 cancels these journals.
- I: 4 payment_reference values reused across dates — grouping keys on (reference, date, account), never reference alone.
- L: all 21 CNs debit `RETURN` and are dated 23/06 / 26/06 / 01/07. Numbering aligns 1:1 with legacy THCN/26/n. **THCN/26/1–16 belong to pre-June legacy dates** (their invoices are Jan–May), so Phase 4 re-dating moves them before the cutover where the CR_SALES anchor supersedes them; only 17–19 (10/06) and 20–21 (30/06) land in June = legacy's 158.35. Legacy dates for 1–16 must come from the user/legacy CN listing (§8-10).
- M: REC journals: 2,297 posted pre-cutover (4.0M; superseded by anchors), 509 posted in-window, 15 posted dated ≥ today (10/07–07/08; the >10/07 ones are keying typos, §8-7).
- O: no manual journals use an RV-pattern reference — the registry namespace is clean.
- P: June CH_REV1 pools by CASH-invoice local date: **04/06 = 17,747.60 exactly** (plan fixture 5: 13,280.00 banked 04/06 + 4,467.60 banked 10/06); 22 pool dates total, ready for Phase 3 pool availability.

### 5b. Phase 2 — executed 10 Jul 2026

**Code (files changed):**
- `src/routes/accounting/sales-journal.js` — REWRITTEN as the single invoice-owned accounting service: CASH bill journal = DR CH_REV1 / CR CASH_SALES (4-line TR form when genuine receipts exist; pending genuine cheque suppresses auto-collection); INVOICE = DR TR / CR CR_SALES; zero bills post informational 0.00 lines; honours `invoices.accounting_description`; sets display_reference/source links; maintains the non-posting auto-collection `payments` row (exactly one active row, invoice-local date); throws when recorded receipts would exceed a reduced CASH total.
- `src/routes/accounting/receipt-service.js` — NEW: `createReceipt` / `confirmReceipt` / `cancelReceipt`. Atomic header+allocations; cash → one DR CH_REV2 line per invoice with per-line `C{invoice}` display refs; bank → one aggregated debit + itemized CR TR; excess → CR CUST_DEP; account-type allocations (JP debtor) supported; pending cheques post nothing until confirm (posting on the clearance date, re-validated against current balances); cancellation reverses balances/credit_used, blocks on posted bank-ins and active adjustment docs.
- `src/routes/sales/receipts.js` + mount in `src/routes/index.js` — `/api/receipts` endpoints (POST, GET list/detail, confirm, cancel).
- `src/routes/sales/invoices/payments.js` — POST delegates to the receipt service (single-invoice receipt with auto excess split; response shape kept); confirm targets the exact receipt (receipt-backed) or wraps legacy pending cheque rows into one posted receipt; cancel guards: auto rows → manage via invoice; grouped receipts → explicit receipt cancel; single-allocation receipts cancel transparently.
- `src/routes/sales/invoices/invoices.js` — all lifecycle paths on the one service: create (non-cash sale-time settlement = genuine receipt, cheque stays pending/unpaid), batch create (auto collection now dated to the invoice LOCAL date, not submission time), order-details update (genuine receipts preserved; only legacy pendings cancelled), cancel (blocked while live receipts allocate the invoice), payment-type conversion (flag-based auto cleanup, pending-cheque guard, no direct journal writes), date change (genuine receipts KEEP their dates).
- `src/components/Invoice/PaymentForm.tsx` — TH submits ONE grouped receipt via `/api/receipts` (invoice allocations + excess); JP keeps its per-invoice endpoint unchanged (`jellypolly.payments` has no journal linkage — verified).

**Migrations (dev applied; prod pending, run in this order after the Phase 1 pair):**
1. `dev/migrations/2026-07-10_receipts_phase2_columns.sql` — `payments.is_auto_collection` (seeded 3,497 rows from the two historical note texts) + `payments.receipt_allocation_id` + `journal_entry_lines.display_reference`. Idempotent (rerun UPDATE 0).
2. `dev/migrations/2026-07-10_receipts_phase2_migration.sql` — June+ data rebuild: (A) cash-on-CASH payments → auto flag; (B) auto rows unlinked from journals + re-dated to invoice local date; (C) 161 receipts built from June+ genuine payments (151 posted RM522,995.29 + 10 pending cheques RM23,165.20), old REC journals cancelled, new-contract journals posted (`REC-M{id}` internal refs, visible Journal/Cheque split via T-family/external-bank heuristics), NO balance/credit re-mutation; (D) June+ invoice journals rebuilt to contract shapes incl. informational zero bills; (E) every posted journal of a cancelled payment cancelled (247+ cleared). Idempotent (rerun: all UPDATE 0, loops no-op).

**Verification (dev DB, June 2026 posted lines vs fixtures):**
| Ledger | ERP after Phase 2 | Legacy fixture | Δ explained |
|---|---|---|---|
| CH_REV1 DR | **213,365.10** | 213,331.10 | +34.00 = cash bill 015375 (legacy omission, approved §8-1) |
| CASH_SALES CR | **213,365.10** | 213,365.10 | exact (zero bills now included as 0.00 rows) |
| CH_REV2 DR | **7,202.70** | 7,202.70 | exact — all 12 legacy rows, C-refs matching |
| CR_SALES CR | **513,062.80** | 513,062.80 | exact (THCN debits move here in Phase 4) |
| BANK_PBB DR | 430,626.79 | 685,388.69 | RVs are Phase 3 (254,761.90 of bank-in debits pending) |
- Fixture spot checks: `TF040626-2` = one receipt, Journal TF040626-2 / Cheque TF040626 / 1,629.00 / 2 allocations ✓ (fixture 6); `C63740` = DR CH_REV2 1,590 / CR TR with line display ref C63740, particulars `INV/NO: 63740 - YEEBEE` ✓ (fixture 3).
- Invariants: 0 unbalanced posted journals (headers + lines), 0 pending receipts with journals, 0 cancelled payments retaining posted journals, source-uniqueness index holding.
- **015361 resolved (supersedes §8-9's premise):** payment 5229 was never a real receipt — it was a stray auto-collection row left by an old CASH→INVOICE conversion (note-text matching missed it). Invoice 015361 is Unpaid RM2,880 in BOTH systems; the stray row is cancelled. **If the RM2,880 cash was in fact received, key a real receipt for it** — otherwise nothing to do.

**Behaviour notes for the user:**
- A CASH bill "paid" by cheque at sale time now stays Unpaid until the cheque is confirmed cleared (correct contract; previously it showed paid immediately).
- Cancelling one payment of a multi-invoice receipt is blocked with a message naming the receipt; cancel the receipt to reverse all its invoices together.
- Editing an invoice's order details no longer cancels genuine receipts; it only adjusts the automatic collection.

### 5c. Phase 3 — executed 10 Jul 2026

**Code (files changed):**
- `src/routes/accounting/bank-in-service.js` — NEW: shared RV registry (`getNextRvNumber`/`reserveRvNumber`, race-safe via the unique constraints, month-scoped `RV###/MM`, cancelled numbers stay reserved); CH_REV1 pool availability (per-date for dates ≥ cutover from posted S-journal CH_REV1 debits; ONE aggregate anchor-seeded pool for pre-cutover dates); CH_REV2 unbanked-receipt availability; `createBankIn` (advisory locks per pool date + receipt row locks; over-banking blocked; one DR bank line PER group + ONE aggregated CR per holding account; editable per-group descriptions with contract default `SALES CASH FROM {date} BANK IN`); `cancelBankIn` (journal cancelled, registry stays reserved, amounts return to pools).
- `src/routes/accounting/bank-ins.js` + mount — `/api/bank-ins` (next-rv, pools, list/detail, POST, cancel). Journal `entry_type='RV'` (added to `journal_entry_types`), internal ref `BI-{registry_id}`, `display_reference` = RV number, source_type `bank_in`.
- `src/routes/accounting/bank-statement.js` — cutover isolation: `BANK_LINKED_ACCOUNTS` synthetic CH_REV* projection now applies ONLY to lines dated before `2026-06-01` in every path (anchor movement, derived opening, month rows/totals); Journal column resolves `COALESCE(jel.display_reference, je.display_reference, reference_no)`; Cheque column resolves `COALESCE(jel.cheque_reference, je.cheque_no)` (never the Journal ref); ordering honours `posting_sequence`/`display_order`.
- `src/pages/Accounting/BankInPage.tsx` + nav (Accounting → Generation → "Cash Bank-In (RV)") — pools table (collected/banked/remaining, partial amount input, pre-June opening row), CH_REV2 receipt selection with customer grouping (auto one group per customer, RV052/074 pattern), editable RV number + group descriptions at preview, post + cancel.

**Migration (dev applied; prod pending, after the Phase 1+2 files):** `dev/migrations/2026-07-10_bankins_phase3_import.sql` — 'RV' journal type; ONE `import_opening` CH_REV2 receipt (34869 530.00 + 34891 530.00 TEO; the 0.05 anchor residual stays unanalysed); RV001–RV081/06 imported as real bank_ins/groups/allocations/journals with exact legacy particulars (`SALES DD/MM/YYYY`; CH_REV2 RVs use the legacy INV/NO texts, split bank rows for RV052/RV074, aggregated holding credit); RV021/022/048/082/083 reserved as `import` (manual, no journal). Idempotent (rerun skips: "June 2026 RVs already imported").

**Verification (dev DB, June 2026, vs fixtures):**
| Check | Result |
|---|---|
| CH_REV1 credits | **214,784.90 — legacy exact** |
| CH_REV2 credits | **8,145.20 — legacy exact** |
| CH_REV1 closing | 34,224.55 = legacy 34,190.55 + 34.00 (015375 only) |
| CH_REV2 closing | **117.55 — legacy exact** |
| 04/06 pool (fixture 5) | collected 17,747.60, banked 17,747.60, remaining **0.00** |
| RV registry June | 83 numbers: 78 bank-ins + 5 manual reservations; gaps/sequence intact |
| BANK_PBB June DR | 653,556.89 vs legacy 685,388.69 — every missing/extra row NAMED (worklist below) |

**Phase 5 bank worklist (row-by-row diff of BANK_PBB June debits; arithmetic closes exactly: 653,556.89 + 141,846.40 − 110,014.60 = 685,388.69):**
1. Manual non-sales RVs for the USER to key (numbers reserved): RV021/06 3,054.90 + RV022/06 1,750.00 (FROM DRAWING WORKERS), RV048/06 1,500.00, RV082/06 143.70 (CTOS refund), RV083/06 5.40 (Puncak Niaga refund) — contra accounts to confirm.
2. TJ050626 594.10 (Jelly Polly invoice 004697/JP) — manual journal or account-type receipt against debtor `JP` (§8-4).
3. **Pre-cutover-received cheques cleared in June (~64.5k)**: TF030626 206.40; PIB439770 2,088.00; RHB022790 9,604.90; TF090626/-1/-2 + TR090626 + TT090626 block 8,091.00 (09/06); ALB001088 20,668.60; TT180626-1 1,325.00; MBB932037-J/-P 17,881.50; PBB152961 2,460.00; PIB437391 2,142.50 — their ERP payments are pre-June with old May-dated REC journals sitting behind the anchor; Phase 5 re-dates/rebuilds them as receipts posted on the legacy clear dates.
4. Date-shifted clears (ERP keyed received date, legacy posts clear date): PBB023159 13→15/06, MBB000750 20→22/06, ALB00106 (ref typo, legacy ALB000106) 23→24/06, MBB000757 (legacy MIB000757) 27→29/06 — re-date + ref fixes.
5. PBB678670 62,543.40: ERP one aggregated receipt vs legacy FOUR per-customer rows (PBB678670/-1/-2/-3) — re-split into per-customer-group receipts with suffixed display refs.
6. ERP-only June rows whose legacy clears fall in July (timing bridges or re-date to clear dates): CIMBI008054 11,920.60 (13/06), MBB932202/-I/-N 27,169.50 (30/06).
7. Credit side (619,901.48 vs 644,938.48): user still keying PBE/PV/JV manual outflows — outside this refactor's scope except the Cheque display contract.

---

## 6. Migration dry-run design (Phase 1 deliverable; read-only)

One reconciliation script (read-only SQL through the dev docker psql) reporting, per category: counts, amounts, proposed groupings, and every ambiguous row. Categories from plan §9 mapped to observed data:

1. Multi-row direct receipts sharing (reference, date, bank account) → proposed one header + N allocations (must find TF040626-2's two invoices; flag null-reference payments as ungroupable — never guess).
2. Automatic cash-bill payments (payment created same tx as CASH invoice) vs genuine later receipts → cash bills become invoice-owned journals; genuine receipts become receipt headers.
3. Active payments with no journal (9 in June) → backfill list.
4. Cancelled payments with posted journals (247 all-time) → journal cancellation list (user approved removing/rebuilding partially-correct REC journals; no invoice balance/credit_used re-mutation on relink).
5. Overpayment row pairs (regular + 'overpaid' rows) → one header, split credits.
6. Pending-cheque rows → no-journal invariant check.
7. Duplicate/reused `payment_reference` across dates → report; grouping keys on (ref, date, account), not ref alone.
8. CH_REV2 June inflation breakdown (178,230.20 vs legacy 7,202.70) by entry type/payment method/company → routing rules for rebuild (physical cash vs direct-bank), incl. whether JP receipts touch CH_REV*.
9. CN journals: RETURN→revenue-ledger rewrite list; accounting ref/date mapping (JCN-202606-0017 ↔ THCN/26/17 @ 10/06) — **ask before re-dating**.
10. REC journals outside June window (2025-07-05 → 2026-08-07): pre-cutover handling per §4e; future-dated rows listed for user correction.
11. Manual journals whose reference collides with the RV allocator's namespace.
12. Opening-pool composition for CH_REV1/CH_REV2 anchors (proven components vs unanalysed residue).
13. Idempotency proof: rerun produces zero new rows/changes.

---

## 7. Row-by-row reconciliation status (June 2026)

| Ledger | Fixture rows | ERP now (post-Phase 2) | Status |
|---|---|---|---|
| CASH_SALES | 214 tx (incl. 7 zero rows) | ✅ CR 213,365.10 exact; zero informational rows posted | row-by-row diff in Phase 5 |
| CR_SALES | 184 tx | ✅ credits 513,062.80 exact; THCN debits still in RETURN (wrong date/ref) | Phase 4 |
| CH_REV1 | 283 tx | ✅ debits 213,365.10 (= legacy + approved 34.00) AND credits 214,784.90 exact; closing 34,224.55 | Phase 5 row diff only |
| CH_REV2 | 20 tx | ✅ debits 7,202.70 AND credits 8,145.20 exact; **closing 117.55 = legacy exact** | Phase 5 row diff only |
| BANK_PBB | 278 tx | DR 653,556.89 vs 685,388.69 — all remaining rows named in §5c worklist; CR 619,901.48 vs 644,938.48 (user manual entries) | Phase 5 worklist |
| C-CARE(1) | 31 rows (Jan–Jun) | anchor ✅ 8,748.00; no child postings yet | Phase 6–7 |

---

## 8. Decisions and remaining open questions

**Decided 10 Jul 2026 (user):**

1. **015375 / RM34.00 — target is legacy parity.** Every row legacy has must match 1:1. Legacy itself is internally inconsistent by RM34 (CASH_SALES has 015375, CH_REV1 does not — double-entry cannot reproduce that), so 015375 posts normally and remains the **single named difference** in the CH_REV1 reconciliation output (ERP close 34,224.55 vs legacy 34,190.55, difference = the row legacy omitted). No fake counter-entry.
2. **Historical CN journals will be re-dated/re-referenced everywhere internally** to the legacy dates (JCN-202606-0017/18/19 → 10/06; TH-CN-26-1/2 → 30/06) with legacy-style visible refs (THCN/26/17…21) so CR_SALES matches the PDF row-for-row. Documents and all e-Invoice/MyInvois state untouched (Phase 4). Root cause: the CN form had no date picker when these were keyed. The form **now has** an editable document date (`selectedDocumentDate` → `createddate` → journal `entry_date`), so only the historical rows need the one-time internal re-date. (Related bug fixed 10 Jul 2026: the navbar Adjustment Docs quick-add popover linked to the form without the required `?type=` and bounced with "Missing required parameter: type"; the popover now offers New Credit/Debit/Refund Note entries in all three companies' nav data.)
3. **Cutover policy (§4e) approved**, including importing CASH_SALES / CR_SALES 1 June anchors (1,037,680.40 CR / 2,296,968.93 CR).
4. **TJ (Jelly Polly) receipts are INCLUDED** (user 10 Jul, superseding the earlier exclude-for-now). Evidence: legacy books JP as a trade debtor — active account code `JP` ("JELLY POLLY FOOD INDUSTRIES", ledger_type TD) — and the June row TJ050626 (594.10, `INV/NO : 004697/JP`) is an ordinary direct bank receipt credited to that debtor account. Contract: the structured receipt workflow must support a receipt group whose allocation targets a debtor/GL account with a free-text invoice reference (JP invoices live in `jellypolly.invoices`, so no TH `invoices` FK is possible and **no jellypolly-schema writes occur**). DR BANK_PBB / CR `JP`; journal ref TJ-family; exact UX defined in Phase 2.

**Still open:**

5. **Payment-method misclassification cleanup — nearly resolved by data entry:** as of the 10 Jul dry-run only 13 June cash×INVOICE payments remain, of which 12 = the legacy CH_REV2 population exactly (7,202.70). Regenerate worksheet N at Phase 2 execution time (data entry ongoing).
6. **Non-sales RVs** (drawing-worker repayments, vendor refunds): manual RV journal with user-confirmed contra is assumed; they reserve numbers in `rv_registry` (source_type manual_journal); confirm contras when they recur.
7. Future-dated posted REC journals (after 10 Jul, up to 2026-08-07; dry-run M) — data-entry typos for the user to fix by hand.
8. Per instructions, no build/typecheck/lint will be run unless requested.
9. ~~Invoice `015361`~~ **Decided (user 10 Jul):** genuine cash received in June, simply never recorded/banked by legacy within June ("there's many invoices like this"). Stays as-is: CH_REV2 carries it as unbanked cash (ERP June close = 117.55 + 2,880.00 = 2,997.55 vs legacy 117.55, a named difference), bankable via a later RV. General rule for reconciliation: ERP receipts that legacy hadn't recorded/banked by month-end are EXPECTED named differences, not errors.
10. ~~Legacy dates for THCN/26/1–16~~ **Decided (user 10 Jul):** re-date the 16 pre-June CN journals' accounting date to **2026-05-31** (explicitly approximate pre-cutover date). Any date before the 1 June anchor is superseded by it, so the exact legacy dates are unnecessary and the RM1,834.92 double-count against the imported CR_SALES anchor is eliminated. Documents and e-Invoice state untouched. Executed in the Phase 4 CN migration together with the RETURN→revenue-account fix.

---

## 9. Exact next action

**Start Phase 4 — CN/DN/RN accounting.** Order of work: (1) rewrite `src/routes/sales/adjustment-docs/accounting.js` to the frozen contract — CN: DR original revenue ledger (CR_SALES / CASH_SALES per the invoice's paymenttype) + proven output-tax reversal / CR TR; DN: DR TR / CR original revenue; RN unchanged (paired DR TR / standalone DR CUST_DEP); visible accounting reference = the document display number (THCN/26/n style via `formatAdjustmentDocId`), accounting date = the document date, descriptions from entered reason; source_type='adjustment' links; (2) Phase 4 migration: rewrite the 21 existing CN journals (RETURN→revenue account, JCN refs→THCN/26/n display refs, dates: 0017–0019→2026-06-10, TH-CN-26-1/2→2026-06-30, 0001–0016→**2026-05-31** per §8-10), idempotent + dry-run listing; (3) June CR_SALES verification: THCN debits 158.35 land 10/06+30/06, closing 2,809,873.38 CR against the imported anchor; (4) deliberate DN/RN test scenarios (none exist in dev); (5) verify `credit_used`/balance cascades unchanged; changelog + docs. Note: `jellypolly` shares the adjustment accounting module — confirm JP compatibility before editing.

---

## 10. Original-request traceability (plan §14 → phase mapping)

| Item | Phase | Evidence when done |
|---|---|---|
| OCR every scanned legacy PDF; stop if unreadable | 0 ✅ | §2 fixtures, balance chains verified |
| Use latest dev DB; re-query stale docs | 0 ✅ (re-query each phase) | §3 |
| Understand salesman/mobile ingestion; preserve `CASH \| INVOICE` | 0 ✅ audit / 2 | §3b; Phase 2 tests |
| Replace one-generic-cash-payment assumption | 1–2 | receipt header/allocation schema + API |
| Correct incomplete/misdirected `Receipt from Invoice` journals | 2 | backfill + dry-run reports |
| Structured workflow for manual `SALES {date}` RV bank-ins | 3 | RV UI + journals |
| Prefilled editable `RV###/MM` with duplicate protection | 3 | shared registry tests |
| Editable generated descriptions with persisted override | 1–3 | override columns + resync tests |
| Reconcile the five ledgers to June source documents | 5 | fixture-vs-live row diff |
| Preserve manual PBE/PV/JV and residual bank work | 3 | manual paths + cheque display |
| Correct direct `T*`/external receipt Journal & Cheque behavior | 2 | fixture 6 (TF040626-2/TF040626) |
| Cash-bill CH_REV1 debit + CASH_SALES credit | 2 | fixture 1 (015349) |
| Credit-invoice CR_SALES credit at issuance | 2 (already close) | fixture 8 (2004884) |
| Old-credit cash CH_REV2 debit + later RV credit/bank debit | 2–3 | fixtures 3–4 (C63740, RV023/06) |
| Cash-sales RV CH_REV1 credit/bank debit | 3 | fixtures 2, 5 (RV001/06; RV005–009+024–025) |
| Single/multiple invoice + customer group descriptions | 2–3 | RV052/074 + TF230626-1 (4 invoices) patterns |
| Complete CN/DN/RN local accounting; June CNs in CR_SALES | 4 | THCN 158.35 in CR_SALES |
| Keep/adapt `CashReceiptVoucherPDF.tsx` | 8 | grouped-receipt PDF |
| Remove `CashReceiptVoucherModal.tsx`; print Blob via shared fallback | 8 | no dead imports |
| Work in phases; maintain fresh progress doc | 0–8 | this file |
| No debtor work before refined system passes | 5 gate | Phase 5 sign-off recorded here |
| Post all customer receivable activity to real customer ledgers | 6 | debtor-child postings + rewrite |
| Account Ledger month/range/year/This year via `TimeNavigator` | 7 | range API + PDF |
| Debtor opening anchors → General Statement `BAL B/F($)` | 7 | June total 507,697.72 |
| Correct Customer Statement data | 7 | C-CARE bridge (8,748.00 → 11,788.00) |
| No e-Invoice/MyInvois modification | all | boundary in §1; per-phase confirmation |

If any later discovery changes a rule in the brief: record evidence, old rule, new rule, affected data, and user-visible impact here **before** implementing a materially different workflow.

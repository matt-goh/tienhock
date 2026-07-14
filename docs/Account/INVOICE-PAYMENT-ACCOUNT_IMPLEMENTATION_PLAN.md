# Tien Hock Sales Invoice, Receipt, Bank-In, and Accounting Refactor

## Implementation brief for the next model

Work in phases, keep a fresh progress/handover document current, and continue until each phase's stated acceptance criteria are met. Do not start coding until the evidence gate and current-system audit below are complete.

This is a correction and extension of an already partially implemented system. It is not a greenfield accounting build. Preserve working behavior that is still correct, migrate existing data safely, and replace the parts whose accounting meaning or ledger output is wrong.

---

## 1. Mandatory evidence gate — stop if this fails

The legacy PDFs are the source of truth for June 2026 ledger content, accounting direction, references, cheque values, descriptions, totals, and running balances. They are scanned images with no embedded text. You must render and OCR every page before coding:

- `INVOICE-PAYMENT-ACCOUNT_PDFs/CH_REV1_CASH_SALES_RECEIVED.pdf` — 7 pages
- `INVOICE-PAYMENT-ACCOUNT_PDFs/CH_REV2.pdf` — 1 page
- `INVOICE-PAYMENT-ACCOUNT_PDFs/CASH_SALES.pdf` — 6 pages
- `INVOICE-PAYMENT-ACCOUNT_PDFs/CR_SALES.pdf` — 5 pages
- `INVOICE-PAYMENT-ACCOUNT_PDFs/BANK_PBB_BANK_STATEMENT.pdf` — 8 pages
- `INVOICE-PAYMENT-ACCOUNT_PDFs/C-CARE(1)_LEDGER.pdf` — 1 page

If any file cannot be opened, rendered, or read well enough to distinguish the Date, Journal, Particulars, Cheque, Debit, Credit, and Balance columns, stop immediately and tell the user exactly which page is blocked. Do not infer an unreadable row from filenames, this document, or the database.

Record the OCR extraction and any uncertain characters in the new progress document. Do not trust the printed report-date header as the accounting period: `CASH_SALES`, `CR_SALES`, and `C-CARE(1)` carry a stale `01 MAR 2010` header even though their transaction rows are from 2026. Use the row dates and reconciled running balances.

You may query the dev database read-only whenever needed. It contains the latest imported production data, but re-query it before relying on the 10 July 2026 snapshot in this brief because data entry is ongoing. For database discovery, use the repository-approved Docker command from `AGENTS.md`.

### Source priority when evidence conflicts

1. The scanned legacy PDFs define the required June ledger behavior and presentation semantics.
2. The user's explicit business rules in this brief define the desired workflow and automation boundary.
3. The current dev database defines the source records that actually need migration or reconciliation.
4. Current code and older docs explain existing behavior but are not automatically correct.
5. Accounting standards guide scenarios not evidenced by the PDFs, especially DN/RN. Clearly label such decisions as standards-based inference.

Do not delete or rewrite legitimate ERP source transactions merely to force a total to match a legacy PDF. If the dev database contains transactions that were never entered in the legacy system, produce a reconciliation that separates:

- records present in both systems but posted incorrectly;
- records missing a required journal;
- stale journals whose source was cancelled;
- records present only in the ERP or only in the legacy ledger.

Ask before any destructive historical correction whose business meaning cannot be proven.

- user comfirmed: you may remove the existing REC type receipt journals that were created by the system, these are partially correct. You may remove/modify them, and backfill any data as needed.

---

## 2. Required outcome

Refine the Tien Hock sales-invoice/payment/accounting loop so that:

1. Salesman invoice ingestion remains compatible with the two valid **sale terms**, `CASH` and `INVOICE`.
2. Payment method and accounting scenario are modeled separately from the invoice sale term. Cash on hand, a direct bank receipt, a pending cheque, a cleared cheque, an online transfer, an overpayment, and a later bank-in are not additional invoice `paymenttype` values.
3. One real-world receipt can allocate atomically to one or many invoices. It must not be represented as unrelated API calls that can partly succeed.
4. Cash collected but not yet banked remains in `CH_REV1` or `CH_REV2` until an explicit bank-in voucher is posted.
5. `BANK_PBB` is built from real `BANK_PBB` journal lines. It must no longer synthetically inject `CH_REV1`/`CH_REV2` lines for the new cutover period.
6. The June 2026 content of `CH_REV1`, `CH_REV2`, `CASH_SALES`, `CR_SALES`, and `BANK_PBB` can be reconciled row by row to the legacy PDFs, including opening/closing balances, dates, visible references, cheque values, sides, amounts, and running balances.
7. Sales invoices, receipts, bank-ins, and adjustment documents create their required journals automatically from their source workflow. Staff should not have to re-key the same transaction in Journal Entry.
8. The user can edit every generated accounting description before posting and can later correct it through the owning source workflow without editing journal amounts or accounts directly.
9. PBE, PV, and JV residual bank-statement entries remain manually enterable by the user as explicitly requested. Do not invent contra accounts. Existing unrelated structured generators for payroll/supplier transactions must remain intact.
10. CN, DN, and RN accounting is complete and reflected in the appropriate ledgers and debtor balances.
11. Only after the five core ledgers pass reconciliation, customer debtor child postings, ledger ranges, opening-balance integration, and debtor statement fixes are implemented.
12. No e-Invoice/MyInvois behavior is changed.

The legacy layout does not need to be visually cloned unless already used by the report. Content, accounting meaning, calculation, row grouping, and reconciliation behavior are the acceptance target.

---

## 3. Scope and hard boundaries

### In scope

- Tien Hock sales invoice ingestion and local invoice accounting hooks.
- Tien Hock customer receipts, allocations, pending/cleared cheques, direct bank/online receipts, cash receipts, partial payments, overpayments, cancellations, and corrections.
- Explicit cash bank-in/RV workflow for `CH_REV1` and `CH_REV2`.
- The five core ledgers and their shared ledger/PDF infrastructure.
- Local CN/DN/RN accounting integration, balance cascade, cancellation, and accounting-only reference/description behavior.
- Customer debtor child journals and historical migration after the core-ledger gate.
- Account Ledger arbitrary ranges and the existing `TimeNavigator`.
- Debtor General Statement opening balances and Customer Statement correctness.
- Cash Receipt Voucher direct Blob printing and removal of its surrounding preview modal.
- Idempotent database migrations and reconciliation tools/queries required for this work.
- Connected financial-report calculations that would otherwise omit or double-count the new sales adjustments.

### Out of scope without separate permission

- Purchases, supplier accounting, payroll calculations, stock valuation, or unrelated journal generators except to preserve their existing behavior in shared reports.
- Green Target or Jelly Polly behavior. Shared components/routes must remain compatible; prefer Tien Hock-specific behavior when a shared change would alter another company.
- A visual redesign unrelated to the required workflows.
- Guessing non-sales contra accounts from a bank-statement description.
- Inventory/COGS reversal for returned goods unless an existing, provable cost basis and workflow already supports it. Record this as a connected limitation rather than inventing a valuation.

### Absolute no-eInvoice boundary

Do not edit or alter:

- `src/utils/invoice/einvoice/**`;
- MyInvois clients, authentication, templates, submission handlers, status handlers, QR/PDF logic, or consolidation jobs;
- `autoConsolidation.js` or `autoAdjustmentConsolidation.js`;
- UUID, submission UID, long ID, validation timestamp, `einvoice_status`, or consolidation fields/behavior;
- invoice or adjustment e-Invoice submission, status-check, cancellation, or consolidation routes/UI;
- Green Target/Jelly Polly e-Invoice code.

`src/routes/sales/invoices/invoices.js` and `src/routes/sales/adjustment-docs/index.js` contain both local accounting and e-Invoice behavior. You may change only the local accounting hooks and their local source fields. Preserve MyInvois imports, payloads, state transitions, responses, and routes byte-for-byte where possible. If an accounting requirement genuinely needs an e-Invoice contract change, stop and ask first.

Existing PDFs may continue importing company information from an e-Invoice-owned module; do not modify that module.

---

## 4. Current system facts to verify before changing anything

Read `docs/Account/ACCOUNTING_PROGRESS.md` first, but treat its database counts as stale. Also read `docs/Account/CUSTOMER_DEBTOR_SUBLEDGER_JOURNALS_HANDOVER.md`, the immediate callers of every edited module, and the connected files listed later in this brief.

### Current behavior

- `invoices.paymenttype` is constrained to `CASH | INVOICE`.
- `POST /api/invoices/submit-invoices` is the salesman/mobile ingestion path. `POST /api/invoices/submit` is another creation path. Both, plus edits, total resync, cancellation, customer/date/payment-type changes, and any backfill must use one accounting contract.
- `src/routes/accounting/sales-journal.js` currently posts nonzero invoices as:
  - DR `TR` / CR `CASH_SALES` for `CASH`;
  - DR `TR` / CR `CR_SALES` for `INVOICE`.
- A `CASH` invoice then creates a separate automatic payment/`REC` journal. Zero-value invoices are skipped even though the legacy ledgers print zero-value rows.
- `src/routes/accounting/payment-journal.js` currently chooses `CH_REV1`, `CH_REV2`, or a bank account, but uses generated `REC-YYYYMM-XXXX` references and one journal per `payments` row.
- `PaymentForm.tsx` loops over selected invoices and performs separate POST requests. A multi-invoice receipt can partly succeed and becomes multiple bank rows.
- `journal_entries.reference_no` is globally unique, while the legacy-visible Journal reference, internal audit identity, and Cheque/transfer reference are three different concepts.
- `bank-statement.js` currently injects `CH_REV1` and `CH_REV2` into `BANK_PBB` using `BANK_LINKED_ACCOUNTS`. This is a projection, not a true bank ledger, and must be replaced by real RV journals for the cutover period.
- Adjustment journals already exist; the gap is not their absence. They currently post CN as DR `RETURN` / CR `TR`, use technical `JCN-...` references, and therefore do not produce the required `CR_SALES` debit rows.
- Customer debtor child accounts already exist 1:1 with customers. They must be resolved through `debtorSync.js`; do not assume the account code always equals the customer ID because collision-safe `-D` suffixes exist.
- `TimeNavigator.tsx` already supports `month`, `range`, `year`, and the `This year` preset. Do not rebuild it. `AccountLedgerPage`, its backend, and `AccountLedgerPDFMake.ts` are what remain month-only.
- `pdfPrintFallback.ts` already exports `printPdfBlob`, and `CashReceiptVoucherPDF.tsx` already generates a Blob.

### Dev DB snapshot observed on 10 July 2026 — re-query it

- 1,569 customers and 1,569 customer debtor children; seven use collision-safe `-D` codes.
- 153 opening anchors:
  - 150 customer debtor anchors at `2026-06-01`, totaling RM507,697.72;
  - `BANK_PBB` RM172,288.16;
  - `CH_REV1` RM35,644.35;
  - `CH_REV2` RM1,060.05;
  - `C-CARE(1)` RM8,748.00 at `2026-06-01`.
- Current June posted lines include:
  - `CASH_SALES` credit RM213,365.10;
  - `CR_SALES` credit RM513,062.80;
  - `CH_REV1` debit RM209,902.10 and no credit;
  - `CH_REV2` debit RM178,230.20 and no credit;
  - actual `BANK_PBB` debit RM430,626.79 and credit RM619,901.48;
  - no `RV...` journal at all.
- From the June bank opening anchor, actual bank lines close at RM16,986.53 CR; the current linked-account workaround closes at RM371,145.77 DR. Neither matches the legacy close.
- Many `CH_REV2` posted journals are linked to cancelled payments. At least one stale automatic cash-bill receipt is routed from the invoice's later mutable payment type. Do not treat the current posted journal set as clean source data.
- Nine active June payment rows lack journals; the nonzero cases found were old `INVOICE -> CASH` conversions.
- `payments.internal_reference` was unused across all 5,603 Tien Hock payment rows.
- No current dev DN or RN rows exist, so those paths require deliberate scenario tests.
- The current General Statement June `BAL B/F` is RM208,651.57, while the 150 imported debtor anchors total RM507,697.72.

### Existing documentation conflicts to correct during the project

- `ACCOUNTING_PROGRESS.md` says opening anchors are empty; they are not.
- Its journal counts and parts of the debtor handover counts are stale.
- The old plan says adjustment journals are missing; they exist but post to the wrong legacy ledger/reference/description.
- The old plan suggests adding year/range support to `TimeNavigator`; that support already exists.
- A prior changelog entry says BANK_PBB intentionally includes CH_REV rows. The explicit-RV design reverses that visible behavior and requires a new changelog entry when shipped.

---

## 5. OCR-verified June baseline

Use this as a cross-check, not as a substitute for doing the OCR yourself.

| Ledger | Opening | June debits | June credits | Closing | Verified meaning |
|---|---:|---:|---:|---:|---|
| `CH_REV1` | RM35,644.35 DR | RM213,365.10 | RM214,818.90 | RM34,190.55 DR | Undeposited cash collected from cash bills |
| `CH_REV2` | RM1,060.05 DR | RM7,202.70 | RM8,145.20 | RM117.55 DR | Undeposited cash collected against earlier credit invoices |
| `CASH_SALES` | RM1,037,680.40 CR | RM0.00 | RM213,365.10 | RM1,251,045.50 CR | Cash-sale revenue |
| `CR_SALES` | RM2,296,968.93 CR | RM158.35 | RM513,062.80 | RM2,809,873.38 CR | Credit-sale revenue net of five June CN debits |
| `BANK_PBB` | RM172,288.16 DR | RM685,388.69 | RM644,938.48 | RM212,738.37 DR | Actual Public Bank book ledger |

Additional exact evidence:

- `BANK_PBB` has 206 debit rows and 72 credit rows in June, 278 transaction rows total, or 279 including `BALANCE C/FWD`.
- `CR_SALES` has 179 ordinary invoice-credit rows and five THCN debit rows.
- `C-CARE(1)` spans 1 January–24 June 2026: RM7,635.00 DR opening + RM60,965.50 debits − RM56,812.50 credits = RM11,788.00 DR closing.
- Its imported 1 June anchor is RM8,748.00; June invoices RM9,835.00 and June receipts RM6,795.00 bridge to the same RM11,788.00 closing before any other adjustment.

### Corrections and extensions proven by OCR

These refine the user's first description and must be implemented:

1. `CR_SALES` receives every `INVOICE`-type credit sale at issuance, whether it is still unpaid or is later paid. Payment never removes the original revenue row.
2. A single cash-sales source date can be deposited through several RVs, including on later posting dates. For source date 04/06/2026, RM17,747.60 was banked as RV005–RV009 on 04/06 (RM13,280.00) plus RV024–RV025 on 10/06 (RM4,467.60). Do not implement one-RV-per-day or a forced all-or-nothing daily sum.
3. RV numbering is shared across `CH_REV1`, `CH_REV2`, and other receipt paths. It is not a separate sequence per ledger. Gaps are legitimate because some RVs belong to other receipt types.
4. One RV can contain several invoices and several customers. Examples include `RV052/06` and `RV074/06`.
5. One voucher header may render as multiple same-reference ledger rows. Duplicate-check the header identity, not every rendered line.
6. `T*` references are direct bank receipts, but they are not the only rows that use the Cheque column. PBE, PV, and external-bank references such as ALB/MBB/MIB/PBB/PIB/RHB also use it. Cheque/transfer values may repeat and are not unique.
7. Bank can show one aggregated debit while a customer debtor ledger shows several invoice-allocation credits under the same receipt. `TF060626` is RM5,220 in bank and RM1,080 + RM4,140 in `C-CARE(1)`.
8. Identifiers are strings. Preserve leading zeros and prefixes such as `015349` and `F022277`.
9. Zero-value cash bills are printed in both `CH_REV1` and `CASH_SALES` and leave the running balance unchanged. Confirmed examples include `F022277`, `F022279`, `63979`, `35019`, `F022291`, and `F022292`.
10. The legacy five-sen `CH_REV2` residual is real accounting history. Do not force a holding account to zero merely because all new source receipts appear banked.

---

## 6. Domain model that the implementation must preserve

### Invoice sale term is not payment method

Keep the salesman/API contract `CASH | INVOICE`:

- `CASH` means a cash bill whose sale and immediate collection are recognized on the invoice date.
- `INVOICE` means a credit sale that creates a debtor balance. It can later be settled by physical cash, cheque, bank transfer, online transfer, or another supported receipt method.

Do not add `BANK_TRANSFER`, `CHEQUE`, `ONLINE`, `RV`, or similar values to `invoices.paymenttype`. Model those on a fresh, source-owned receipt transaction.

### Automatic CASH-bill ownership

A `CASH` bill and its immediate collection are owned by the invoice, not by an independently editable ordinary receipt header. Before Phase 6, its one invoice-owned journal may carry only the core pair DR `CH_REV1` / CR `CASH_SALES`. In the final debtor-child model, that same source-owned journal must contain four accounting lines under one visible invoice reference:

1. DR the resolved customer debtor child for the sale;
2. CR `CASH_SALES` for the sale (with any proven tax/rounding split);
3. DR `CH_REV1` for the immediate cash collection;
4. CR the same customer debtor child to settle it immediately.

Do not create a second posting-owned payment/receipt journal for this automatic collection. If a compatibility `payments` row or derived UI row is retained, it is non-posting and cannot independently cancel/edit the invoice journal. Invoice resync, cancellation, customer/date change, and sale-term conversion update the complete invoice-owned journal atomically. This choice preserves one globally owned invoice reference, the two legacy core ledgers, and the customer invoice/settlement rows without double-posting.

### A receipt requires a header and allocations

The current one-`payments`-row-per-invoice model is insufficient for legacy grouping. Introduce a real receipt header plus invoice allocations, or an equally explicit transactional structure that provides all of the following:

- one atomic receipt covering one or many invoices/customers;
- receipt date, method, destination/holding account, status, full visible Journal reference, separate Cheque/transfer reference, generated description, user override, audit fields, cancellation fields, and one source-owned journal link;
- itemized allocations retaining invoice ID, customer ID, amount, sequence, and source relationship;
- one bank/holding debit for the received total, with debtor credits itemized by invoice for the debtor ledger;
- customer-owned unapplied/overpayment allocation rows credited to `CUST_DEP` without creating a second bank debit; every excess amount must identify its customer and track remaining/applied/refunded balance, so a mixed-customer receipt can never create an ownerless deposit;
- pending cheque status with no posted journal, balance reduction, or credit-used reduction until confirmation;
- transactional validation and row locking so allocations cannot over-settle an invoice;
- safe cancellation/edit rules for a grouped receipt;
- idempotency based on source identity, not description text or generated reference alone.

Do not merely point several old payment rows at one journal: current cancellation operates per payment row and would cancel the whole grouped journal incorrectly. Migrate callers to the new ownership model or add an explicit compatibility layer.

### A cash bank-in requires a header and source allocations

Create an RV/bank-in source model that stores:

- bank-in/posting date;
- target bank account;
- one shared RV number;
- one or more display groups/lines;
- the holding account for each group (`CH_REV1` or `CH_REV2`);
- source cash-sales date buckets and/or source cash-receipt allocations;
- amount allocated from every source;
- default and overridden descriptions;
- journal link, status, audit fields, cancellation fields.

Persist a ledger display/posting sequence on the source-owned journal, plus an account-line display order where one journal has several rows in the same ledger. Allocate it deterministically for new transactions. Populate it from the OCR within-day ordinal for reconciled history; a migration must not rely on newly assigned journal IDs to reproduce intermediate running balances.

For `CH_REV1`, allow a partial amount from a source cash-sales date pool. Show collected, already banked, and remaining unbanked totals. Do not require staff to identify particular cash-bill notes when the legacy process deposits a partial amount from a daily pool.

For `CH_REV2`, retain the selected invoice cash receipts and customer groups. Prevent the same receipt amount from being banked twice. Support a residual/partial amount without losing cents.

The 1 June cutover anchors are scalar balances, but June RVs bank some cash collected before June (for example `RV001/06` names source date 14/05/2026). Seed a cutover opening-pool composition where the PDFs/source records prove the source date or receipt. Proven components must reconcile to the CH_REV1 RM35,644.35 and CH_REV2 RM1,060.05 anchors. CH_REV2 includes RM1,060.00 represented by invoices `34869`/`34891` plus a separate unexplained historical RM0.05 residual. Ignore movements before an anchor when building its selectable pool—the anchor supersedes them. Keep any unsupported residue as explicitly unanalysed opening cash, not a selectable invoice receipt; do not invent allocations merely to exhaust the anchor.

One RV may contain multiple display groups. It is valid for the bank ledger to have multiple debit lines with the same RV while the holding-account credit is aggregated by the appropriate contra account. The journal must still balance exactly.

### Separate three reference concepts

Persist and expose these separately:

1. internal source/journal identity and idempotency key;
2. legacy-visible **Journal/Reference No.**;
3. **Cheque/transfer reference** displayed in the Cheque column.

Do not rely on the current globally unique `journal_entries.reference_no` as all three. Choose and document a migration-compatible contract: for example, an explicit display-reference field plus source uniqueness, or a carefully revised uniqueness model. Requirements:

- RV visible format: `RV{three digits}/{two-digit month}`, e.g. `RV001/06`;
- the next RV is shared by all RV-producing workflows, not per ledger;
- prefill the next number, let the user edit it, validate it, and check duplicates transactionally;
- duplicate scope must be company + accounting year/month, because `RV001/06` must be usable again in a later year even though the year is not printed;
- sequence allocation must be race-safe; retry a unique conflict or use an appropriate lock;
- gaps are allowed;
- use one transactional RV namespace/registry shared by structured bank-ins and manual/imported RV journal headers; a constraint only on the new bank-in table is insufficient;
- reserve cancelled RV headers as well as active ones and do not reuse their number; child/display lines may repeat their parent RV freely;
- require the printed `/MM` to match the posting month except for an explicitly approved historical-import override;
- manual miscellaneous RVs must reserve through the same service/registry so they advance and block the shared sequence correctly;
- invoice and customer references remain strings;
- full external receipt reference such as `TF040626-2` is user-entered and visible in Journal;
- separate Cheque/transfer value such as `TF040626` is user-entered or safely prefilled, may repeat, and is visible in Cheque;
- `bank-statement.js` must use the persisted line/header cheque contract with a safe fallback, not blindly replace it with the journal reference.

### Editable descriptions are source-owned

Every auto-generated description must be editable at the owning invoice, receipt, bank-in, or adjustment workflow. Persist the override so resync/regeneration does not erase it. A source edit may update header description and relevant line particulars atomically; system-owned amounts/accounts remain locked.

At minimum, provide these normalized defaults:

- `CASH BILL: {INVOICE_NO} - {CUSTOMER_ID}`
- `INV/NO: {INVOICE_NO} - {CUSTOMER_ID}`
- same-customer group: `INV/NO: {INVOICE_1}/{INVOICE_2}/... - {CUSTOMER_ID}`
- mixed-customer group: `INV/NO: {GROUP_1_INVOICES} - {CUSTOMER_1} & {GROUP_2_INVOICES} - {CUSTOMER_2}`
- cash-sales bank-in: `SALES CASH FROM {DD/MM/YYYY SOURCE DATE} BANK IN`

Use customer ID, not the current full customer name, for these defaults. Preserve user-entered wording exactly after validation. For CN/DN/RN, use the visible document number and entered reason/details; do not infer a prompt-payment percentage unless it is explicitly represented in source data.

---

## 7. Final accounting contract

The table below describes the required end state. During the pre-debtor phases, the receivable side may temporarily remain on `TR`, but Phase 6 must move it to the resolved customer debtor child without changing the other ledger sides.

| Business event | Visible reference/date | Required journal | Required ledger behavior |
|---|---|---|---|
| Cash bill issued and collected | Invoice ID; local invoice date | One invoice-owned journal: DR customer debtor / CR `CASH_SALES`; DR `CH_REV1` / CR customer debtor (receivable clearing lines are added in Phase 6) | Same ref/date/amount appears as CH_REV1 debit and CASH_SALES credit; customer ends at zero after showing invoice and settlement. No bank movement yet. |
| Credit invoice issued | Invoice ID; local invoice date | DR customer debtor / CR `CR_SALES` | CR_SALES credit remains permanently as the sale record even after payment. |
| Physical cash received for an old credit invoice | Default `C{INVOICE_NO}`, editable; receipt date | DR `CH_REV2` / CR customer debtor | Cash stays in CH_REV2 until selected in an RV bank-in. |
| Cash-sales pool banked | Shared `RV###/MM`; bank-in date | DR target bank / CR `CH_REV1` | Description carries the source sales date. Partial/multiple RVs per source date are allowed. |
| Old-credit-invoice cash banked | Shared `RV###/MM`; bank-in date | DR target bank / CR `CH_REV2` | Select one/many unbanked cash receipts; same RV can contain multiple customers/groups. |
| Direct bank/online receipt or cleared cheque | User-entered external Journal ref; actual receipt/clear date | DR bank total / CR customer debtor by allocation; excess CR `CUST_DEP` | Bank normally shows one aggregated debit; debtor ledger itemizes invoice credits. |
| Pending cheque | User-entered ref; no posting yet | No journal until cleared | No balance, debtor, or credit-used change before confirmation. |
| Credit Note | Visible CN accounting reference; accounting posting date | DR original sale revenue (`CR_SALES` for credit invoice, `CASH_SALES` for cash bill) plus any output-tax reversal / CR customer debtor | Reduces revenue and amount owed; the June THCN rows must debit CR_SALES. |
| Debit Note | Visible DN accounting reference | DR customer debtor / CR original sale revenue plus any output tax | Adds a charge to the original sale. |
| Refund Note paired to a CN/customer credit | Visible RN accounting reference | DR customer debtor or proven refund liability / CR selected bank/cash | Settles the credit created by the CN; does not reduce revenue again. |
| Standalone refund of an overpayment | Visible RN accounting reference | DR `CUST_DEP` / CR selected bank/cash | Releases the unapplied customer deposit. |

### Cash bills and the later real debtor subledger

The core cash-bill ledger pair is DR `CH_REV1` / CR `CASH_SALES`. Phase 6 expands the invoice-owned journal to the four-line contract above so each customer ledger also shows the invoice and its immediate settlement without changing the net GL or creating a duplicate visible invoice reference. Prove all four views:

- CH_REV1 debit;
- CASH_SALES credit;
- customer invoice debit;
- customer immediate-payment credit.

### Adjustment-accounting basis

The June PDF proves CN debit placement only for credit sales. The remaining mapping is a standards-based decision:

- [IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/) treats qualifying consideration/credits to a customer as a reduction of transaction price and revenue.
- The [LHDN e-Invoice Guideline](https://www.hasil.gov.my/media/fzagbaj2/irbm-e-invoice-guideline.pdf) distinguishes a CN that reduces an earlier invoice without returning money, a DN that adds a charge, and an RN that confirms money returned.

These sources guide local accounting only; do not modify the e-Invoice system.

For June, tax amounts are zero. Do not hardcode that assumption for future data. Freeze one symmetric invoice/adjustment split in Phase 0:

- original sale: DR receivable/holding total; CR original sales revenue for `total_excluding_tax + rounding` and CR `OUTPUT_TAX` for `tax_amount`, unless a separate rounding account is already proven and approved;
- CN: exact reversal of the original net-sales, output-tax, and any proven rounding lines, with CR customer debtor for the total;
- DN: exact inverse/addition using the same accounts;
- RN: settlement only; never touches revenue, output tax, or rounding.

If live nonzero data does not satisfy those field identities or the tax/rounding mapping is ambiguous, stop for a decision rather than post an asymmetric adjustment. Do not change the June legacy revenue totals by introducing an unproven rounding account. Do not double-post both `RETURN` and the required original sales ledger. If analytical sales-return reporting is needed, preserve it through metadata/reporting rather than duplicating the GL amount.

Define `customers.credit_used` as an explicit derived invariant from active receivable/open-item state. Receipt, CN, DN, RN, cancellation, conversion, and migration paths must update or rebuild it consistently exactly once; do not preserve a lifecycle where a paired RN or cancellation leaves `credit_used` different from the customer debtor balance.

### Manual bank entries

PBE, PV, and JV entries that are not already emitted by an existing structured source remain manual user entries. All observed June examples are bank outflows (DR user-confirmed contra / CR `BANK_PBB`), but the manual editor must allow `BANK_PBB` on the accounting side supported by a legitimate future/source document. Preserve date, visible reference, cheque value, particulars, and balanced lines. Do not guess the contra account from OCR.

The current manual Journal Entry UI/API hides or rejects header `cheque_no` for most types. Refine `JournalEntryPage.tsx`, its list/detail/PDF callers, and `journal-entries.js` only as needed so manual PBE/PV/JV rows can persist and display their real Cheque value. Keep the ledger fallback contract explicit; do not substitute the Journal reference when a distinct cheque value exists.

Miscellaneous non-sales RV receipts such as worker repayments or vendor refunds must either use a clearly manual RV line with a user-confirmed contra or remain a documented manual journal. They still reserve numbers in the shared RV sequence.

---

## 8. Required workflow and lifecycle behavior

### Invoice ingestion and resync

- Preserve the salesman payload and the two sale terms.
- Use one accounting service/contract from single creation, batch/mobile creation, order-total resync, invoice edit, customer change, date change, payment-type conversion, and cancellation.
- Do not swallow an accounting failure while leaving an invoice marked paid with no required source/journal. Keep the local invoice/payment/journal state atomic or explicitly recoverable and visible.
- Use the invoice's local Asia/Kuala_Lumpur date for automatic cash-bill accounting. Batch ingestion must not use submission time as the sale/payment date.
- Never derive `yyyy-MM-dd` with `toISOString().split('T')[0]`.
- A genuine later receipt keeps its own receipt date when an invoice date changes. Only an automatic cash-bill collection may follow the invoice date.
- Customer changes must resync source-owned descriptions and, after Phase 6, debtor account lines safely.
- Zero-value invoices must create source-owned zero journal lines using the same account/reference/description contract. Include them as informational content rows, exclude them from monetary totals, and do not let them affect running balances or the nonzero journal-balance assertions.
- Consolidated wrappers and cancelled invoices must not double-post child sales.

### Receipt entry

- Replace the current frontend loop with one atomic backend request containing header plus allocations.
- Support cash, cheque, bank transfer, and online methods already present in the app.
- Store `received_date` separately from nullable `cleared_at`/accounting posting date. A pending cheque has no journal or balance effect; confirmation preserves when it was received and posts on the actual clearance date. The confirmation UI must show and submit that date; Payment Management defaults its local-date picker to today for convenience, and the user changes it to the actual bank-statement date when different. The backend must never silently substitute the received date or server date.
- Support one/many invoices, one/many customers where business data requires it, partial allocations, and one unapplied excess.
- Show invoice balance as of the receipt transaction, not only today's mutable balance.
- Validate totals in the transaction: received total = allocated total + unapplied excess.
- One overpayment produces one debit and split credits; do not create a second receipt/bank debit for the excess.
- A physical-cash receipt's unbanked amount is its entire debit to CH_REV2, including any customer-owned unapplied excess. RV availability must not strand the excess outside the cash bank-in workflow.
- Applying a `CUST_DEP` overpayment to a later invoice posts DR that customer's `CUST_DEP` balance / CR the same customer's debtor account. Applying an existing CN-created debtor credit to another open invoice of the same customer is an open-item allocation within the same debtor account and creates no second revenue journal. If no application UI is shipped in this project, keep these balances refundable only and state that limitation explicitly rather than silently consuming them.
- Pending cheque confirmation must identify the exact receipt header, not every payment anywhere that happens to share `payment_reference`.
- Jelly Polly keeps its separate per-invoice payment model and creates no shared-ledger receipt journal, but follows the same date contract: `payment_date` remains the received/history date, nullable `posting_date` is set to the actual clearance date on confirmation, and debtor statements use the posting date. Its shared payment UI must call `/jellypolly/api/payments`, never Tien Hock's `/api/payments`.
- Confirmation, cancellation, and correction must be idempotent and audit-safe.
- Prevent cancellation of a cash receipt already allocated to a posted bank-in until the dependent bank-in is cancelled/reversed first.
- Prevent invoice/payment-type edits that would orphan bank-in allocations. Either implement a fully reconciled conversion or block it with a clear explanation.
- Once a CH_REV1 source-date pool is partly banked, block or transactionally reverse any cash-invoice cancellation, redating, amount reduction, or `CASH -> INVOICE` conversion that would make collected cash lower than the amount already banked. Require dependent RV reversal first when the new pool total cannot cover its allocations.
- Preserve existing real receipts when converting payment type. Automatic and genuine receipts must be explicitly distinguishable; never infer their history solely from the invoice's current mutable payment type or note text.

### RV bank-in page/interface

Provide a structured Tien Hock interface that lets staff:

- choose posting/bank-in date and target bank, defaulting appropriately to `BANK_PBB`;
- receive a prefilled shared `RV###/MM` and edit it;
- see duplicate errors before/at commit without races;
- switch/filter between cash-sales pools (`CH_REV1`) and old-credit cash receipts (`CH_REV2`);
- for CH_REV1, see source date, collected, previously banked, and remaining amount, then enter/select a partial amount;
- for CH_REV2, select individual unbanked receipts/invoices and see customer groupings;
- create more than one display group under the same RV;
- edit each generated description;
- preview the balanced lines and post them atomically;
- cancel/reverse safely, returning source amounts to the unbanked pool;
- prevent over-allocation and double bank-in under concurrent use.

### Reference and cheque behavior

- `TF040626-2` is the Journal value; `TF040626` is the Cheque/transfer value.
- Do not restrict direct bank receipts to `TF`; observed `T`, `TF`, `TR`, `TT`, `TS`, and `TJ` families are valid, as are external-bank references.
- A Cheque value can repeat across several Journal rows.
- RV generally has a blank Cheque value.
- PBE/PV/external-bank rows may have Cheque values.

### Adjustment documents

- Keep the existing atomic document/balance/credit-used lifecycle, but correct the journal accounts, visible reference, accounting date, descriptions, reports, and cancellation behavior.
- Do not change the document's MyInvois ID/status to make the accounting ledger look right. Store/derive a separate accounting-visible reference or posting override if imported history needs it.
- Current invoice `63906` proves the need: the ERP journal is `JCN-202606-0017`, dated 26 June, DR `RETURN`; the legacy ledger row is `THCN/26/17`, dated 10 June, DR `CR_SALES`, RM51.30. Reconcile the source-date/reference difference explicitly and ask before rewriting historical source dates.
- A CN against an unpaid invoice reduces its debtor balance. A CN against a paid invoice creates a customer credit until refunded/applied.
- DN increases debtor/revenue once.
- RN settles cash/bank or customer-deposit liability and must not reverse revenue a second time.
- Migrate `adjustment_documents.linked_payment_id` behavior so a standalone RN resolves the new customer-owned unapplied receipt balance (with an auditable legacy-payment compatibility mapping where needed); it must not become an orphaned pointer to a superseded `payments` model.
- Include CN/DN/RN in debtor statements and connected revenue/receivable report calculations.

### Cash Receipt Voucher printing

- Keep and adapt `src/utils/accounting/CashReceiptVoucherPDF.tsx` for the new receipt/allocation model.
- Remove `src/components/Accounting/CashReceiptVoucherModal.tsx`.
- Replace its callers in at least `PaymentTable.tsx` and `JournalDetailsPage.tsx` with direct Blob generation and `printPdfBlob`/the hidden-iframe `printPdfFrameWithFallback` flow from `src/utils/pdfPrintFallback.ts`.
- The PDF must support a grouped receipt, multiple invoices/allocations, the actual accounting debit account, and the visible Journal/Cheque references. Do not label cash held in CH_REV1/2 as already deposited to a bank.

---

## 9. Migration, cutover, and integrity requirements

Use 1 June 2026 as the proposed accounting cutover because the imported bank, CH_REV1, CH_REV2, and debtor anchors are at that date. Verify and record this before committing the migration.

### Required migration properties

- Commit reproducible, dated schema/data migrations under the repository's existing `dev/migrations/` convention (use `sql/` only where an existing bootstrap file must also be kept in sync). Include a read-only dry-run/reconciliation companion and document execution order in the progress file; do not apply anything to production from this task.
- Idempotent: rerunning performs no duplicate postings or balance/credit-used changes.
- Source-linked: every system journal can be traced to one source transaction and vice versa.
- Dry-run first: report counts, amounts, proposed groups, unmapped/ambiguous rows, stale journals, and conflicts before update.
- Preserve cancelled history but ensure a cancelled source cannot retain a posted source-owned journal.
- Do not mutate invoice `balance_due` or customer `credit_used` a second time merely because a journal is being relinked or regrouped.
- Preserve leading-zero/string identifiers.
- Preserve legitimate manual journals and unrelated journal types.
- Use database constraints/transaction locks for allocation totals, source uniqueness, duplicate RV scope, and active journal ownership where practical.
- Update `AGENTS.md` and `CLAUDE.md` database schema descriptions whenever tables/columns/constraints change.

### Existing-data cases the dry-run must surface

- Multi-row direct receipts that share reference/date/account and should become one header, including `TF040626-2`.
- Null-reference payments that must not be guessed into a group.
- Active, pending, overpaid, and cancelled rows.
- Regular and excess rows currently representing one overpayment.
- Automatic cash-bill rows versus genuine later receipts.
- Active payments with no journal.
- Posted journals whose payment is cancelled.
- Duplicate or reused `payment_reference` values across dates.
- Current `S`, `REC`, and CN journal links.
- Historical CNs whose ERP creation date/reference does not match the legacy accounting row.
- Manual journals using a reference that a new RV allocator might otherwise choose.
- Pre-cutover cash/receipt components needed to explain the CH_REV1 and CH_REV2 opening anchors and June RV allocations, plus any unanalysed residual.

### Cutover compatibility

Removing `BANK_LINKED_ACCOUNTS` globally would change earlier reports that depended on the synthetic projection, including the previous May proof. Never include a synthetic projection and a real bank line for the same source/date.

Choose and document one safe policy before removal:

- backfill real pre-cutover bank-in journals from reliable evidence; or
- retain a clearly isolated compatibility path restricted to dates before 1 June 2026 while all dates on/after cutover use only actual bank lines.

If a requested range crosses the cutover, partition its calculation at that boundary without double-counting or require two clearly labelled reports until pre-cutover RVs are backfilled. From the 1 June bank anchor onward, opening movement, transaction rows, totals, counts, running balances, PDFs, exports, and arbitrary-range APIs use `BANK_PBB` lines only.

Removing linked-account behavior means removing it from every calculation, not merely hiding displayed rows: transaction queries, anchor-to-start movement, derived-opening fallback, totals, counts, PDF/export data, and range APIs must exclude `CH_REV1/2` on/after cutover.

---

## 10. Reporting requirements

### Five core ledgers

- Opening for any period is the latest anchor on/before period start plus posted movement in `[anchor_date, period_start)`; ignore all movement before that anchor. If no anchor exists, derive it from all earlier posted lines.
- Before claiming June parity, prove that prior postings derive the `CASH_SALES` RM1,037,680.40 CR and `CR_SALES` RM2,296,968.93 CR openings, or import documented 1 June anchors using the system's signed DR-positive convention.
- To reproduce the full January–June C-CARE PDF later, prove its RM7,635.00 opening at 1 January or add a sourced anchor; the existing 1 June RM8,748.00 anchor proves only the June bridge.
- Read posted lines for the actual selected account; no synthetic cross-account duplication after cutover.
- Sort by accounting date, persisted ledger display/posting sequence, then account-line display order/line number. Use source/journal identity only as a final deterministic tie-breaker; newly assigned IDs must not reorder backfilled legacy rows.
- Display visible Journal reference and separate Cheque reference correctly.
- Carry opening anchors and running DR/CR balance correctly.
- Do not drop zero informational sales rows required for content parity.
- A grouped receipt may aggregate in bank while remaining itemized in customer debtor.
- A shared RV may legitimately render multiple rows.

### Account Ledger ranges — only after core reconciliation

- Replace `MonthNavigator` in `AccountLedgerPage.tsx` with the existing `TimeNavigator` configured for month, arbitrary range, year, and `This year`.
- Add range-aware backend support with plain `yyyy-MM-dd` half-open boundaries and keep the existing month route backward-compatible if callers depend on it.
- Update `AccountLedgerPDFMake.ts` types, period labels, file names, opening calculation, and transaction query for arbitrary ranges.
- Preserve deep linking; include account and range in URL state where appropriate.
- Selecting a customer debtor child shows only that customer.
- Selecting `DEBTOR` or legacy `TR` provides an aggregate view of child receivable movement without listing every child as a separate Trial Balance row.

### Debtor General Statement and Customer Statement — after debtor posting

- `BAL B/F($)` for each customer is the opening at the selected period start using the same anchor rule as Account Ledger: latest anchor on/before start plus posted movement from anchor to start; if no anchor, derive prior posted movement.
- Compute all customer openings in bulk; do not create an N+1 query.
- June total `BAL B/F` must reconcile to the imported RM507,697.72 anchors.
- `C-CARE(1)` June must show RM8,748.00 B/F, RM9,835.00 current invoices, RM6,795.00 receipts, and RM11,788.00 closing before other adjustments.
- Customer Statement must include invoices, allocated receipts, CN, DN, RN, opening balance, running balance, and correct DR/CR direction.
- A historical statement/aging report must be calculated as of its selected end date. It must not change because a later-period receipt changed today's `invoice.balance_due`.
- A scalar customer opening anchor does not contain invoice-level aging composition. Do not fabricate age buckets from it. Prefer importing/proving the opening open items; if that evidence is unavailable, stop for an explicit policy decision (for example, show a separately identified unanalysed opening or place it in `3 months+` only with user approval).
- Exclude cancelled and consolidated wrapper effects correctly while including the active child/source transaction once.
- Pending cheques do not appear as posted credits.
- Partial payments, overpayments/credit balances, multiple allocations under one reference, and customer ID collisions must render correctly.
- Check `DebtorsReportPDF.tsx`, `CustomerStatementPDF.tsx`, `GeneralStatementPDF.tsx`, `CustomerTransactionsTab.tsx`, and `TransactionHistoryPDF.tsx` for connected display assumptions.

### Connected financial reports

`financial-reports.js` currently derives revenue/receivables partly from raw invoices and can omit CN/DN effects. After changing journals and debtor postings, verify Note 7/revenue, Note 22/trade receivables, Trial Balance grouping, and any report source guides. Do not leave a visible report silently disagreeing with the reconciled ledgers. Record any broader opening-balance limitation that remains.

---

## 11. Phased execution and success criteria

Create `docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md` before implementation. It must contain:

- scope and no-eInvoice boundary;
- OCR evidence and uncertainties;
- current DB snapshot and re-query date;
- accounting/reference/description decisions;
- cutover policy;
- phase checklist and status;
- migrations and dry-run results;
- files changed per phase;
- verification queries/results;
- row-by-row reconciliation status for all five ledgers;
- known limitations/open questions;
- exact next action for handover.

Update it at the end of every phase. Do not mark a phase complete merely because code was written.

### Phase 0 — evidence and frozen contract

- OCR all 28 pages.
- Read current docs, exports, immediate callers, routes, schema, constraints, and live data.
- Extract the June fixtures, references, cheque semantics, groupings, totals, and balances.
- Re-query current inconsistencies and produce the migration dry-run design.
- Freeze the receipt header/allocation, bank-in, reference, description, cancellation, and cutover contract in the progress doc.

Success: every required row family is classified; uncertainties and non-sales manual contras are explicit; no code has been changed yet.

### Phase 1 — source model and safe migrations

- Add the minimum receipt/allocation and bank-in source structure needed by the frozen contract.
- Add explicit display-reference, cheque-reference, description override, audit/status, source ownership, and idempotency behavior.
- Preserve/migrate existing payment endpoints only as needed for compatibility while callers move.
- Add dry-run and idempotent data migrations with constraints/indexes.
- Update schema docs immediately.

Success: schema/migration reruns safely; one source owns one active journal; grouped and bank-in allocations are representable without changing balances.

### Phase 2 — invoice and receipt posting

- Refine cash-bill and credit-invoice journals across every creation/edit/cancel path.
- Implement atomic grouped receipt API/service and Tien Hock UI.
- Implement physical cash, direct bank/online, pending/cleared cheque, partial, overpayment, cancellation, and correction flows.
- Fix date, customer, total-resync, and payment-type conversion lifecycle hazards.
- Backfill missing/stale source-owned receipt journals without double-changing invoice/customer balances.

Success: the non-debtor-account aspects of the `015349`, `C63740`, `TF040626-2`, pending cheque, overpayment, cancellation, and conversion scenarios below pass. Until Phase 6, their receivable side may remain on `TR`; final customer-child assertions are not a Phase 2 requirement.

### Phase 3 — RV cash bank-in and true bank ledger

- Build the structured RV interface and backend.
- Support partial CH_REV1 daily pools, CH_REV2 receipt selection, mixed groups, shared sequence, editable descriptions, and cancellation.
- Post real DR bank / CR holding-account journals.
- Apply the cutover policy, then remove the synthetic BANK projection for on/after cutover.
- Preserve manual PBE/PV/JV paths and correct Cheque fallback.

Success: cash does not reach bank before RV; RV allocations cannot be repeated; RV rows reconcile in both bank and holding ledgers.

### Phase 4 — CN/DN/RN accounting

- Correct accounts, visible accounting reference/date, descriptions, debtor balance, `credit_used`, cancellation, and connected reports.
- Migrate/reconcile existing CN journals separately from MyInvois document state.
- Add deliberate tests for DN/RN because dev has no examples.

Success: the June five THCN debits total RM158.35 in CR_SALES; DN/RN scenarios balance and do not duplicate revenue effects.

### Phase 5 — full five-ledger reconciliation

- Reconcile every June row, not only net totals.
- Compare date, Journal, Cheque, description, account, side, amount, order, opening, running balance, and close.
- Separate legitimate ERP-only/source-only differences rather than deleting them.
- Maintain a reconciliation fixture keyed by ledger/date/visible reference/side/amount plus a within-day ordinal. The exact OCR totals/counts apply to the matched legacy population. If approved ERP-only or legacy-only rows remain, produce an arithmetic bridge from the legacy close to the live close; do not simultaneously require the unfiltered live ledger to equal the legacy close.
- Correct source/journal migration defects until the classified shared dataset matches.

Success: the five-core-ledger aspects of the exact OCR totals and named fixtures pass for the matched population, and any live-ledger difference is a proven, user-approved arithmetic bridge. Final customer-debtor-child assertions in the fixtures remain gated to Phase 6.

Do not start the debtor phase before this gate passes.

### Phase 6 — customer debtor child postings

- Follow and update `CUSTOMER_DEBTOR_SUBLEDGER_JOURNALS_HANDOVER.md`.
- Resolve child codes through `debtorSync.js`, including `-D` collisions.
- Post/migrate sales, receipts, CN, DN, and paired RN receivable lines to real customer children.
- Include cancelled linked history consistently without making it active.
- Handle customer ID changes across journal lines and opening-balance FKs safely.
- Preserve aggregate `DEBTOR`/`TR` views and concise Trial Balance grouping.

Success: customer ledgers show real historical activity; no deterministically mappable customer line remains on the control account; aggregate reports remain balanced and concise.

### Phase 7 — ranges, openings, and debtor PDFs

- Adopt existing `TimeNavigator` in Account Ledger and add range-aware API/PDF support.
- Connect customer anchors to General Statement `BAL B/F($)`.
- Correct Customer Statement transactions, as-of balances, aging, cancellations, and adjustments.
- Validate the C-CARE full ledger and June bridge.

Success: range/month/year/This year work; June anchors total RM507,697.72; C-CARE closes RM11,788.00; historical reports do not change after later receipts.

### Phase 8 — printing cleanup, connected checks, and handoff

- Remove `CashReceiptVoucherModal.tsx` and its imports/callers.
- Direct-print the adapted receipt Blob through the shared fallback.
- Recheck connected reports and other-company compatibility.
- Prepend the required Bahasa Melayu and English user-facing changelog entries with the implementation date.
- Refresh `ACCOUNTING_PROGRESS.md`, the fresh progress doc, `AGENTS.md`, and `CLAUDE.md` as applicable.
- Summarize edge cases and ask the user whether they want the requested final bug/limitation scan across all modified files.

Success: no dead modal imports, no TypeScript errors introduced, documentation matches the shipped behavior, and the handoff is executable.

Do not run or ask to run `npm run build`, typecheck, or lint unless the user explicitly requests it. Use focused read-only SQL reconciliation and proportionate targeted verification instead; the user will run the broad checks manually.

---

## 12. Exact minimum acceptance scenarios

### Core ledger fixtures

1. **Cash bill `015349`**
   - Date 04/06/2026, customer `MILTI`, RM34.20.
   - Visible Journal `015349`.
   - `CH_REV1` debit RM34.20.
   - `CASH_SALES` credit RM34.20.
   - Default `CASH BILL: 015349 - MILTI`, editable.
   - No `BANK_PBB` line until an RV is posted.

2. **Cash-sales bank-in `RV001/06`**
   - Posting date 04/06/2026; source sales date 14/05/2026; RM200.00.
   - `BANK_PBB` debit and `CH_REV1` credit.
   - Same simple-line amount/reference/description on both sides.
   - Default `SALES CASH FROM 14/05/2026 BANK IN`, editable.

3. **Old credit-invoice cash receipt `C63740`**
   - Receipt date 05/06/2026, customer `YEEBEE`, RM1,590.00.
   - `CH_REV2` debit; customer debtor credit.
   - Default `INV/NO: 63740 - YEEBEE`, editable.
   - No bank debit before RV.

4. **CH_REV2 bank-in `RV023/06`**
   - Posting date 10/06/2026.
   - Invoices `34869` + `34891`, customer `TEO`, total RM1,060.00.
   - One bank-in source transaction; `BANK_PBB` debit and `CH_REV2` credit.
   - Both source receipts become fully banked and cannot be selected again.

5. **Partial cash-sales-date banking**
   - Source 04/06/2026 collected RM17,747.60.
   - RV005–RV009 allocate RM13,280.00 on 04/06.
   - RV024–RV025 allocate the remaining RM4,467.60 on 10/06.
   - No overbanking and remaining amount reaches exactly zero.

6. **Direct bank receipt `TF040626-2`**
   - Date 04/06/2026.
   - Allocations: invoice `63487` RM729 + `63662` RM900, customer `SHOP(2)`.
   - Visible Journal `TF040626-2`; Cheque `TF040626`.
   - One `BANK_PBB` debit RM1,629.00.
   - Two itemized debtor allocation credits or an equally itemized debtor-ledger result.
   - Atomic submit/cancel; no generated `REC...` displayed instead.

7. **Bank aggregate versus debtor allocation**
   - `TF060626` is one bank debit RM5,220.
   - `C-CARE(1)` shows credits RM1,080 for invoice `63745` and RM4,140 for `63803` under the same reference/cheque.

8. **Credit sale `2004884`**
   - Date 04/06/2026, customer `GUI`, RM8,076.00.
   - `CR_SALES` credit at issuance even though the invoice is later paid.
   - Later payment uses its real receipt date/reference and does not remove/redate revenue.

9. **Credit Note `THCN/26/17`**
   - Accounting date 10/06/2026, invoice `63906`, RM51.30.
   - `CR_SALES` debit; customer debtor credit.
   - Visible reference `THCN/26/17`.
   - Editable description matching the entered prompt-payment details, including the legacy example `BEING 3% PROMPT PAYMENT FOR INV.NO:63906 (RM1710 X 3%)` when those details are actually supplied.

10. **Zero cash bills**
    - Confirmed zero references appear in CH_REV1 and CASH_SALES as informational rows.
    - They do not affect journal totals or running balances.

### Lifecycle/integrity fixtures

- Pending cheque: no posted journal/balance/credit-used change until confirmation.
- One overpayment receipt: one debit total, debtor credit up to outstanding, `CUST_DEP` credit for excess.
- Grouped receipt cancellation: cancelling/correcting one allocation through the source workflow cannot silently cancel or corrupt unrelated allocations.
- Bank-in dependency: a banked cash receipt cannot be cancelled until its RV dependency is reversed.
- Invoice date change: genuine later receipts keep their dates.
- Payment-type conversion: no stale auto payment, missing journal, duplicate revenue, or orphaned RV allocation.
- Customer ID/code collision: customer `CASH` resolves to `CASH-D`, not the cash GL account.
- Local dates never shift one day.
- All posted journal headers and lines balance to the cent.
- Every active source-owned transaction has exactly one active journal; every cancelled source-owned transaction has none posted.
- Migrations rerun with zero new rows/amount changes.
- No e-Invoice field, route, payload, state, or UI behavior changes.

### Full PDF reconciliation fixtures

- CH_REV1 closes RM34,190.55 DR.
- CH_REV2 closes RM117.55 DR.
- CASH_SALES closes RM1,251,045.50 CR.
- CR_SALES closes RM2,809,873.38 CR after RM158.35 CN debits.
- BANK_PBB: RM172,288.16 opening + RM685,388.69 debits − RM644,938.48 credits = RM212,738.37 closing, with 278 June transaction rows.
- C-CARE full supplied period closes RM11,788.00 DR.

Do not hardcode these totals into application logic. They are reconciliation fixtures for the matched legacy June population. If the live ERP contains approved extra/missing source transactions, report its separate close and the exact arithmetic bridge instead of deleting data or falsely claiming the unfiltered live ledger has the legacy row count.

---

## 13. Connected files to inspect before editing

This is a starting map, not permission to change every file. Read exports, immediate callers, and shared-company usage first; touch only what the implementation requires.

### Backend

- `src/routes/sales/invoices/invoices.js`
- `src/routes/sales/invoices/payments.js`
- `src/routes/accounting/sales-journal.js`
- `src/routes/accounting/payment-journal.js`
- `src/routes/accounting/bank-statement.js`
- `src/routes/accounting/journal-entries.js`
- `src/routes/accounting/debtorSync.js`
- `src/routes/accounting/debtors.js`
- `src/routes/accounting/financial-reports.js`
- `src/routes/accounting/opening-balances.js`
- `src/routes/sales/adjustment-docs/accounting.js`
- accounting-only create/cancel portions of `src/routes/sales/adjustment-docs/index.js`
- `src/routes/catalogue/customers.js`
- `src/routes/index.js`

### Frontend, reports, PDFs, and types

- `src/components/Invoice/PaymentForm.tsx`
- `src/components/Invoice/PaymentTable.tsx`
- `src/components/Invoice/InvoiceSelectionTable.tsx`
- `src/pages/Payments/PaymentPage.tsx`
- `src/pages/Invoice/InvoiceFormPage.tsx`
- `src/pages/Invoice/InvoiceDetailsPage.tsx`
- `src/utils/invoice/InvoiceUtils.ts`
- `src/components/Invoice/LinkedPaymentsTooltip.tsx`
- Tien Hock adjustment form/list/details callers under `src/pages/AdjustmentDocs/`
- `src/pages/Accounting/Reports/AccountLedgerPage.tsx`
- `src/components/TimeNavigator.tsx`
- `src/utils/accounting/AccountLedgerPDFMake.ts`
- `src/pages/Accounting/DebtorsReportPage.tsx`
- `src/utils/accounting/DebtorsReportPDF.tsx`
- `src/utils/accounting/CustomerStatementPDF.tsx`
- `src/utils/accounting/GeneralStatementPDF.tsx`
- `src/utils/accounting/CashReceiptVoucherPDF.tsx`
- `src/components/Accounting/CashReceiptVoucherModal.tsx` — remove after callers move
- `src/pages/Accounting/JournalDetailsPage.tsx`
- `src/pages/Accounting/JournalEntryPage.tsx`
- `src/pages/Accounting/JournalEntryListPage.tsx`
- `src/utils/accounting/JournalVoucherPDFMake.ts`
- `src/components/Catalogue/CustomerTransactionsTab.tsx`
- `src/utils/catalogue/TransactionHistoryPDF.tsx`
- `src/components/Accounting/ReportSourceGuide.tsx`
- `src/pages/TienHockNavData.tsx`
- `src/types/types.ts`
- `src/components/ChangelogModal.tsx`

`PaymentForm.tsx` and `PaymentTable.tsx` are also used by Jelly Polly, and the adjustment router factory invokes shared TH/JP behavior. Before each shared-file change, map the TH and JP callers and prefer a Tien Hock-specific adapter/strategy. Recheck JP payment create/cancel/list/print and adjustment create/cancel behavior after that phase; do not wait until final cleanup to discover a shared-company regression.

---

## 14. Original-request traceability — nothing may be dropped

Use this checklist in the fresh progress document and mark each item with its implementation phase and verification evidence:

- [ ] OCR every scanned legacy PDF; stop if any cannot be read.
- [ ] Use the latest dev DB for context and re-query stale docs.
- [ ] Understand salesman/mobile invoice ingestion in `invoices.js` and preserve `CASH | INVOICE` compatibility.
- [ ] Replace the assumption that one generic cash payment covers every accounting scenario.
- [ ] Correct incomplete/misdirected `Receipt from Invoice` journals.
- [ ] Provide a structured workflow for previously manual `SALES {source date}` RV bank-ins.
- [ ] Use prefilled editable `RV###/MM` references with duplicate protection.
- [ ] Allow generated descriptions to be edited and persist the override.
- [ ] Reconcile CH_REV1, CH_REV2, CASH_SALES, CR_SALES, and BANK_PBB to June source documents.
- [ ] Preserve required manual PBE/PV/JV entry and other user-confirmed residual bank work.
- [ ] Correct direct `T*`/external bank receipt Journal and Cheque behavior.
- [ ] Implement cash-bill CH_REV1 debit and CASH_SALES credit.
- [ ] Implement credit-invoice CR_SALES credit at issuance.
- [ ] Implement old-credit cash receipt CH_REV2 debit and later RV credit/bank debit.
- [ ] Implement cash-sales RV CH_REV1 credit/bank debit.
- [ ] Handle single/multiple invoices and single/multiple customer group descriptions.
- [ ] Complete CN/DN/RN local accounting and place June CNs in CR_SALES.
- [ ] Keep/adapt `CashReceiptVoucherPDF.tsx`.
- [ ] Remove `CashReceiptVoucherModal.tsx` and print the Blob through the shared fallback.
- [ ] Work in phases and maintain a fresh progress/handover document.
- [ ] Do not start debtor work before the refined receipt/accounting system passes.
- [ ] Post all customer receivable activity to each customer's real ledger.
- [ ] Add Account Ledger month/range/year/This year using the existing `TimeNavigator`.
- [ ] Link debtor opening anchors to General Statement `BAL B/F($)`.
- [ ] Correct missing/incorrect Customer Statement data.
- [ ] Do not modify any e-Invoice/MyInvois code or behavior.

If a later discovery changes a rule in this brief, record the evidence, old rule, new rule, affected data, and user-visible impact in the progress document and tell the user before implementing a materially different workflow.

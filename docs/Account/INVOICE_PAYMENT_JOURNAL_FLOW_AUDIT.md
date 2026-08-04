# Invoice–Payment–Journal Flow Audit Handover (TH + GT)

Date: 2026-08-03
Scope: Tien Hock and Green Target accounting Invoice → Payment → Journal flow. Jelly Polly excluded (accounting outsourced).
Method: static code review of `src/routes/**` and `src/pages/**` (three parallel audit passes: TH invoice/payment, TH receipt/bank-in/journal, GT full flow). **Caveat:** the dev DB/Docker was down during the audit, so DB-constraint claims (e.g. a TH journal-line shape CHECK) and live data states are unverified; everything else is confirmed in code.

Status legend: **FIXED** (this pass, 2026-08-03) · **DEFERRED** (deliberately not done now) · **OPEN** (not yet scheduled)

---

## 1. Critical findings (ledger/money integrity)

| # | Finding | Citation | Status |
|---|---------|----------|--------|
| C1 | **GT operational accounting routes had no session auth.** `src/routes/index.js:221` only blankets TH `/api` with `authMiddleware`; GT invoices/payments/adjustment-docs (all journal-posting since G7/GT-P1) plus financial-reports, bank-statement and debtors were mounted unauthenticated. Any unauthenticated client could mutate the GT ledger and read GT financials. | `src/routes/index.js:292-393` | FIXED |
| C2 | **TH bank-in service has no accounting-period lock** — `createBankIn` / `createDrawingJournal` / `cancelBankIn` never call `assertTienHockAccountingDateUnlocked`, and the BankInPage date pickers allow any date incl. future. The one unguarded write into locked Jan–May history. | `src/routes/accounting/bank-in-service.js:192-199, 485-492, 566-570`; `src/pages/Accounting/BankInPage.tsx:497-508, 419-430` | **DEFERRED — user decision 2026-08-03: "not gonna happen at all".** Revisit if multi-user keying starts. |
| C3 | **TH payment-type conversion and line-item edit lacked cancelled-invoice and active-adjustment guards.** Both paths check only pending cheques; on a cancelled invoice they could flip `invoice_status` back to `paid` and re-post the S journal (pencils were visible on cancelled invoices). Editing an invoice with an active CN/DN restored the pre-CN balance while the CN journal stayed posted — every other mutation path blocks on active adjustments. | `src/routes/sales/invoices/invoices.js:4748-4948` (paymenttype), `:3589-3901` (order-details); `src/pages/Invoice/InvoiceDetailsPage.tsx:2111-2118, 2319-2329` | FIXED |
| C4 | **Receipt cancellation didn't protect a consumed overpayment excess.** `cancelReceipt`/`cancelReceiptGroup` never checked `applied_amount`/`refunded_amount` on the receipt's excess allocations. Sequence: overpayment → excess applied (DR CUST_DEP / CR debtor) → cancel original receipt → funding CR CUST_DEP cancelled while application stays posted → CUST_DEP negative, invoices paid with money that "never arrived". | `src/routes/accounting/receipt-service.js:1022-1113, 1234-1344` | FIXED |
| C5 | **TH invoice cancellation leaked consumed overpayment.** `DELETE /:id` cancelled overpayment application payments and their journals but never reversed the FIFO consumption in `overpayment_applications` / `receipt_allocations.applied_amount`; the customer's unapplied excess stayed permanently understated. The single-payment cancel endpoint already did this correctly (`payments.js:879-893`). | `src/routes/sales/invoices/invoices.js:3348-3371` | FIXED |
| C6 | **Source-owned TH journals could be cancelled directly from the Journal page.** The cancel route had no `source_type` check; cancelling a receipt REC left the receipt posted/invoice paid with the money gone from the ledger; cancelling a bank-in RV left pools consumed with no bank debit; cancelling an invoice S was silently re-posted by the next invoice edit. GT already blocked this. | `src/routes/accounting/journal-entries.js:1279-1338`; `src/pages/Accounting/JournalDetailsPage.tsx:415, 538-549` | FIXED |
| C7 | **The OTHER GT operational mounts are still unauthenticated — same vulnerability class as C1.** GT payroll, customers, rentals, einvoice (and any other `/greentarget/api/*` mount not named in C1) have no `authMiddleware`, so GT payroll/staff data, customer records and rental operations are readable/writable without a session. Left unfixed on 2026-08-03 only because it was outside the accounting audit scope — closing it is the same one-line-per-mount pattern used for C1 (`authMiddleware(pool)`, plus `checkRestoreState` on mutating mounts, mirroring the existing authed GT mounts in `src/routes/index.js`). Watch for: GT payroll routes share `public.staffs` data (a scoping decision), and any genuinely public endpoint must be exempted the way customer-signups was. **User asked on 2026-08-03 that this stay tracked.** | `src/routes/index.js` (all `/greentarget/api/*` mounts other than invoices/payments/adjustment-docs/financial-reports/bank-statement/debtors/journal-entries/account-codes/journal-vouchers/customer-signups) | OPEN |

## 2. Medium findings

| # | Finding | Citation | Status |
|---|---------|----------|--------|
| M1 | **Audit columns silently broken.** `authMiddleware` populates only `req.session`; `req.staffId`/`req.user` are never set, so `created_by`/`posted_by`/`cancelled_by` were NULL on every manual journal, receipt, bank-in and payment in both companies. Related: `auth.js:84` self-join typo (`ON s.staff_id = s.staff_id`) made session staff name/job come from an arbitrary staff row. | `src/middleware/auth.js:84, 116-128`; consumers `journal-entries.js:951, 1157, 1260, 1322, 1449`, `receipts.js:30`, `payments.js:419+`, `bank-ins.js:172+`, GT `payments.js:1035+` | FIXED |
| M2 | **Line-item edit drops invoice rounding.** Edit recomputes `newTotal = round(subtotal + tax)` and never touches `invoices.rounding`; a rounded invoice's totals stop adding up on screen and in the journal. | `src/routes/sales/invoices/invoices.js:3717-3721, 3808-3821`; create path `InvoiceFormPage.tsx:333-334` | OPEN |
| M3 | **Batch submission swallows journal failures.** In `POST /submit-invoices` a non-period-lock `syncSalesJournalEntry` failure is only `console.error`'d — the sale silently never reaches the GL. | `src/routes/sales/invoices/invoices.js:2779-2789` | OPEN |
| M4 | **Editing a system journal destroys receipt line metadata with no warning.** Journal PUT re-inserts lines without `display_reference`/`cheque_reference`/`display_order` and sets `manual_override`; receipt journals are create-once, so nothing rebuilds the lost legacy refs. | `src/routes/accounting/journal-entries.js:1161-1184` | PARTIAL — pre-save warning + confirmation added this pass; metadata preservation itself still OPEN |
| M5 | **CH_REV1 pool arithmetic ignores manual journals.** `getCashSalesPools` only counts `entry_type='S'` journals; a manual CH_REV1 correction isn't netted, so Bank-In can offer banking more than the account holds. | `src/routes/accounting/bank-in-service.js:90-99, 297-318` | OPEN |
| M6 | **Full payment allowed while an equivalent cheque is pending** on the inline InvoiceDetailsPage payment form; the later cheque confirmation then hard-fails, leaving a stuck pending cheque. | `src/pages/Invoice/InvoiceDetailsPage.tsx:2159-2313`; `receipt-service.js:182-189` | OPEN |
| M7 | **GT: sales journals adopted by reference keep `source_type NULL`**, bypassing GT's source-owned cancel guard; cancelling one strands the invoice (payments and edits then 409). | `src/routes/greentarget/accounting/sales-journal.js:438-445`; `posting-utils.js:215-231` | OPEN |
| M8 | **GT: journal PUT guards only the submitted date, not the stored one** (TH's fix guards both). | `src/routes/greentarget/accounting/journal-entries.js:721-724` | OPEN |

## 3. UI/UX improvements

| # | Item | Citation | Status |
|---|------|----------|--------|
| U1 | Confirmation dialog on payment-type conversion (comparably destructive to cancellation, which already has one) | `src/pages/Invoice/InvoiceDetailsPage.tsx:3375-3381` | FIXED |
| U2 | Held overpayment auto-applied in full by default → changed to opt-in | `src/components/Invoice/PaymentForm.tsx:502-512` | FIXED |
| U3 | Hide edit pencils (customer/salesman/datetime/payment-type/line-items) on cancelled invoices | `src/pages/Invoice/InvoiceDetailsPage.tsx:2046-2053, 2069-2076, 2093-2100, 2111-2118, 2319-2329` | FIXED |
| U4 | Warn when line-item edit cancels legacy pending payments (response carries `paymentInfo.pendingCancelled`, UI ignored it) | `src/pages/Invoice/InvoiceDetailsPage.tsx:1100-1162` | FIXED |
| U5 | Annotate/pre-disable Cancel & Edit on source-owned journals; pre-save detach confirmation on journal edit | `src/pages/Accounting/JournalDetailsPage.tsx`, `src/pages/Accounting/JournalEntryPage.tsx:1405` | FIXED |
| U6 | Cheque-clearance date pickers: min = `received_date`, default `max(today, received_date)` | `src/components/Invoice/ReceiptDetailsDialog.tsx`, `src/components/Invoice/PaymentTable.tsx` (+ the inline confirm dialogs in TH/JP `InvoiceDetailsPage.tsx`) | FIXED |
| U7 | GT invoice-created-but-payment-failed toast now directs user to re-record from invoice details | GT `InvoiceFormPage.tsx:1107-1110` | FIXED |
| U8 | Bank-In date pickers min-bound (ties to C2) | `src/pages/Accounting/BankInPage.tsx` | DEFERRED with C2 |
| U9 | "Pre-June opening cash" hint on BankInPage is displayed but unreachable — needs product decision (add opening-pool input vs remove hint) | `src/pages/Accounting/BankInPage.tsx:553-565` | OPEN |
| U10 | 409 period-lock/reference errors arrive as transient toasts; blocking server errors deserve persistent inline surfacing | e.g. `JournalEntryPage.tsx:1424-1430` | OPEN |

## 4. Trivial / low-impact (genuine but small; fix opportunistically)

- REC reference and GT adjustment doc-id generators race under concurrency (`FOR UPDATE SKIP LOCKED` reads a stale max) — one request dies on the unique constraint with a raw pg error instead of retrying. `src/routes/accounting/payment-journal.js:21-44`; `src/routes/greentarget/adjustment-docs.js:57-77`.
- Double-submitted **pending cheques** have no server-side dedupe (no journal → no unique-reference backstop); posted full-balance payments are protected, partials aren't. `src/routes/sales/receipts.js:28-126`.
- `PaymentTable.tsx:399, 439-440` uses `String(date).slice(0,10)` — rule-17 day-before pattern; currently harmless (uniform shift, grouping only). `toDayString` (line 64) already does it right.
- `cancelReceipt` status restore loses a prior `Overdue` (maps to `Unpaid`); the payments.js path preserves it (`payments.js:936-942`). `receipt-service.js:1303`.
- GT `adjustment-docs.js:843` uses `toISOString().slice(0,10)` (UTC date) for consolidated-wrapper `date_issued` — wrong day before 8am KL; no journal impact.
- GT debtor-registry effective-range checked against invoice date rather than posting date — latent trap, no current data instance. `greentarget/accounting/sales-journal.js:284-299`.
- GT invoice form still exposes a `tax_amount` input even though GT journals post gross — keyed tax silently becomes TGA revenue. GT `InvoiceFormPage.tsx:1709-1716`.
- Journal balance tolerance allows off-by-one-sen posted journals (`journal-entries.js:892, 1036, 1246`); GT has a line-shape CHECK, TH's unverified (dev DB down).
- Bank-In cancel dialog has no double-click guard (`BankInPage.tsx:336-354`).
- Legacy pending-cheque confirmation can hit the create-form's imported-match 409 with an inapplicable message (`payments.js:632-646` → `receipt-service.js:339-381`).
- `PUT /:id/datetime` has no cancelled-invoice check (`invoices.js:4951`) — sync short-circuits safely; only edits an audit record's date.
- GT: check-then-insert races surface raw pg errors (custom invoice number, journal duplicate reference); `invoice_number` varchar(20) and journal `reference_no` lack length validation.
- GT `nextGTPostingSequence` reads MAX+1 without a lock — concurrent posts can duplicate `posting_sequence` (print order only). `posting-utils.js:66-74`.
- GT `POST /debtor-subledger` not transactional with the triggering invoice save — an identity can survive a failed invoice POST (harmless orphan registry row).
- Deprecated `DELETE /api/payments/:id` rewrites `req.method`/`req.url` and re-enters the router (`payments.js:1000-1015`) — works, fragile.
- `resolveGTJournalSource`'s `"payment"` case is dead code post-GT-P1 (`greentarget/accounting/journal-entries.js:92-113`).

## 5. Doc notes

- The GT-P7 paragraph in AGENTS.md ("CD_SD fallback / debtor field not required") is superseded by the 2026-08-01 debtor-dimension design (registry identity per invoice, CD_SD non-selectable) — code is the newer design.
- Verified sound during the audit (no action): invoice row-locking + per-invoice over-settlement caps; atomic header+allocations+journal in one transaction; RV number reservation race handled by unique constraint; bank-in over-banking re-checked under advisory + row locks; cheque clearance date validation (≥ received, ≤ today, never defaulted); double-submit guards on payment/receipt/bank-in post buttons; GT pending-cheque visibility and receipt-join panel.

## 6. Fix log (2026-08-03)

Fixed this pass (per AGENTS.md rule 10, no build/typecheck run — user tests manually; all edits verified by `node --check` and re-reading):

- **C1 — `src/routes/index.js`:** `authMiddleware(pool)` + `checkRestoreState` on `/greentarget/api/invoices`, `/payments`, `/adjustment-docs`; auth-only on `/financial-reports`, `/bank-statement`, `/debtors` (mirrors the existing authed GT mounts). Public customer-signup submit and the API-key excel export verified unaffected. **Tracked as finding C7 (OPEN, user-flagged for follow-up):** the other GT operational mounts (payroll, customers, rentals, einvoice, etc.) remain unauthenticated — same one-line pattern applies, but GT payroll shares `public.staffs` data so it was left as a separate scoping decision.
- **C3 — `src/routes/sales/invoices/invoices.js`:** `PUT /:id/paymenttype` and `PUT /:id/order-details` now refuse cancelled invoices (400) and invoices with active non-wrapper adjustment documents (400, citing the doc refs), before any credit/journal mutation.
- **C5 — same file, `DELETE /:id`:** cancelled `overpayment` payments now reverse their `overpayment_applications` (decrement `receipt_allocations.applied_amount` via `GREATEST(0, ...)`, delete application rows) inside the cancel transaction. **Divergence to note:** the single-payment cancel endpoint (`payments.js:879-893`) decrements but does NOT delete the application rows — harmless today (as-of reads filter applications by active payments) but the two paths now differ; align later if desired.
- **C4 — `src/routes/accounting/receipt-service.js`:** `cancelReceipt` and `cancelReceiptGroup` block when any excess allocation of the receipt(s) has `applied_amount`/`refunded_amount` > 0 (plain 400 like the neighboring guards; set `error.status = 409` if 409 semantics are preferred — the routes honor it).
- **C6 — `src/routes/accounting/journal-entries.js`:** `POST /:id/cancel` refuses `source_type !== null` with a structured 409 pointing at the owning document (same shape as GT's guard). Restore endpoint unchanged; source cascades verified to cancel journals via their own service functions, not this handler.
- **M1 — `src/middleware/auth.js`:** self-join typo fixed (`st.id = s.staff_id`); middleware now sets `req.staffId` and `req.user = { id }` from `session.staff_id` (additive; both existing session shapes `req.session.staff.id` and `req.session.staff_id` untouched).
- **U1/U3/U4 — `src/pages/Invoice/InvoiceDetailsPage.tsx`:** all five edit pencils hidden when `isCancelled`; payment-type conversion now goes through a `ConfirmationDialog` stating the from→to consequences; `paymentInfo.paymentsAdjusted.pendingCancelled` surfaces as a toast after line-item edits.
- **U2 — `src/components/Invoice/PaymentForm.tsx`:** overpayment application seeds to 0/unticked (opt-in).
- **U5 — `src/pages/Accounting/JournalDetailsPage.tsx` + `JournalEntryPage.tsx`:** Cancel disabled (and Edit disabled for GT) on source-owned journals with explanatory tooltips; TH journal edit of a not-yet-detached system journal requires a "Save & Detach" confirmation warning about detachment and loss of per-line receipt/cheque references.
- **U6 — `src/components/Invoice/ReceiptDetailsDialog.tsx`, `src/components/Invoice/PaymentTable.tsx`:** clearance pickers min-bounded by received_date, defaulting to max(today, received_date) via `TimeNavigator.minDate` (rule-17 string compares). **Scope addition:** the same fix was applied to the inline confirm dialogs in `src/pages/Invoice/InvoiceDetailsPage.tsx` and `src/pages/JellyPolly/InvoiceDetailsPage.tsx` (same defect, same component).
- **U7 — `src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx`:** payment-failed toast now directs the user to record the payment later from the invoice details page.
- Changelog entries added (2 entries, 2026-08-03) and AGENTS.md updated (hardening bullet, receipt_allocations excess-cancel note, GT auth bullet, GT-P7 superseded marker).

Deferred by user decision: **C2/U8** (bank-in period lock + picker bounds — "not gonna happen at all"; revisit if multi-user keying starts). Everything else remains OPEN/DEFERRED as marked in sections 2–4.

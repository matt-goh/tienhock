# Handover: Link Green Target payments (receipt joining + rental/payment traceability)

Date: 2026-08-02

Status: **planning only — nothing in this document is implemented.** No code, schema, or migration
was written for it. Investigation of the current code is complete and is recorded in §2 with exact
file anchors, so implementation can start without re-deriving anything.

Scope: Green Target invoices, rentals, payments, and the durable `greentarget.receipts` header.

Related references:

- `GT_ACCOUNTING_HANDOVER.md` (GT-P1 receipt model, R6 account resolution, R8 posting lock);
- `GT_OPERATIONAL_BRIDGE.md`;
- `PAYMENT_SCENARIOS_REFERENCE.md` (Tien Hock analogues).

## 1. Objective

Three related asks, all approved for delivery together:

- **A — Join an existing receipt.** Recording a payment from the invoice form or the rental page
  currently *rejects* a Green Target Reference No. that already exists. It must instead be able to
  attach the new payment to that existing receipt as another allocation, so one RV can cover
  several invoices — the same thing the Payments page batch already does at creation time, but
  available after the fact and from the invoice/rental screens.
- **B — Clickable links.** Payment rows shown on the rental screens must link through to the
  invoice / receipt they belong to. Purely presentational; no accounting change.
- **C — Rental ↔ payment traceability.** A payment must be traceable back to the rental(s) it
  settles, and that link must be visible from both directions.

Pages named by the user: `src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx`,
`src/pages/GreenTarget/Rentals/RentalDetailsPage.tsx`,
`src/pages/GreenTarget/Rentals/RentalFormPage.tsx`.

## 2. Verified current state on 2 August 2026

Everything in this section was read from the working tree, not assumed.

### 2a. The receipt model already supports what A needs

`greentarget.receipts` is the durable header; `greentarget.payments.receipt_id` makes each payment
one *allocation* of that header. Per GT-P1 the header — not the payment — owns the journal.

`syncGTReceiptJournalEntry` in
[payment-journal.js:75](src/routes/greentarget/accounting/payment-journal.js#L75) is **already
idempotent and already rebuilds**: it re-reads every active allocation, builds one credit line per
allocation plus one aggregate `PBB_1` debit, and calls `replaceGTJournal`
([payment-journal.js:208](src/routes/greentarget/accounting/payment-journal.js#L208)) when the
receipt already has a journal. **No journal-service change is required for A.** Adding an
allocation and re-calling this function produces the correct consolidated `REC` journal.

Three guards inside it constrain the design:

- [payment-journal.js:80](src/routes/greentarget/accounting/payment-journal.js#L80) — a `pending`
  or `cancelled` receipt posts nothing.
- [payment-journal.js:137](src/routes/greentarget/accounting/payment-journal.js#L137) — a journal
  with `manual_override` returns early and is **never rebuilt**. Joining such a receipt would move
  money operationally while leaving the GL untouched. **Must be blocked** (§4, rule J5).
- [payment-journal.js:169](src/routes/greentarget/accounting/payment-journal.js#L169) — the sum of
  allocations must equal `receipts.total_amount` within half a cent, or it throws. So
  `total_amount` **must be updated before** the sync call, and the refreshed receipt row passed in.

### 2b. Both creation paths always insert a NEW receipt

- `POST /greentarget/api/payments` (single) —
  [payments.js:810](src/routes/greentarget/payments.js#L810). Inserts a fresh receipt at
  [payments.js:970](src/routes/greentarget/payments.js#L970).
- `POST /greentarget/api/payments/batch` —
  [payments.js:501](src/routes/greentarget/payments.js#L501). Inserts a fresh receipt at
  [payments.js:679](src/routes/greentarget/payments.js#L679).

Both reject a re-used reference outright:
[payments.js:873-885](src/routes/greentarget/payments.js#L873-L885) (single) and
[payments.js:543-555](src/routes/greentarget/payments.js#L543-L555) (batch). There is **no
endpoint that adds an allocation to an existing receipt.** That is the only genuinely new backend
capability in this project.

Both serialize on the advisory lock `PAYMENT_REFERENCE_LOCK_KEY`
([payments.js:36](src/routes/greentarget/payments.js#L36)) *before* taking invoice row locks. The
join path must keep that same lock order.

Shared validators that the join path must continue to call:

| Validator | Anchor | Purpose |
| --- | --- | --- |
| `assertPaymentMutationDateAllowed` | [payments.js:166](src/routes/greentarget/payments.js#L166) | R8 posting lock; pre-cutover dates only when every invoice is also pre-cutover |
| `assertPaymentNotBeforeInvoices` | [payments.js:184](src/routes/greentarget/payments.js#L184) | received date ≥ invoice date |
| `assertPostCutoverInvoicesHavePostedSalesJournals` | [payments.js:213](src/routes/greentarget/payments.js#L213) | July+ invoice must already have its posted `S` journal |

### 2c. The reference-availability endpoint is binary

`GET /check-internal-ref/:ref(*)` —
[payments.js:1091](src/routes/greentarget/payments.js#L1091) — returns
`{ available, exists, existing_id }` only. It does not say *what* the existing receipt is, so the
UI cannot currently offer to join it. `existing_id` is a **payment id** (`MIN(payment_id)` of the
receipt), not a receipt id — easy to misread; see [payments.js:1123](src/routes/greentarget/payments.js#L1123).

### 2d. Receipt read model

`GET /receipts/:receiptId/group` —
[payments.js:390](src/routes/greentarget/payments.js#L390) — returns header + journal +
allocations (payment/invoice/customer/amount/status). **It carries no rental information**, which
is the gap for C. Rendered by
`src/components/GreenTarget/GreenTargetReceiptDetailsDialog.tsx`, opened from
`src/pages/GreenTarget/Payments/GreenTargetPaymentPage.tsx`.

### 2e. Rental ↔ invoice ↔ payment linkage exists in the DB but is not surfaced

`greentarget.invoice_rentals` is the join table (`rentals.js` lines 107, 164, 714, 783).

- `GET /rentals/:rental_id/details` —
  [rentals.js:682](src/routes/greentarget/rentals.js#L682) — already returns each linked invoice
  with its payments ([rentals.js:728-735](src/routes/greentarget/rentals.js#L728-L735)). The
  selected columns **omit `receipt_id`**, so the UI cannot link to a receipt.
- `GET /rentals/:rental_id` returns `invoice_info` with a boolean
  `has_payments` ([rentals.js:781](src/routes/greentarget/rentals.js#L781)) — nothing more.

### 2f. Frontend state today

| Page | Payment capability | Gap |
| --- | --- | --- |
| `InvoiceFormPage.tsx` | "Record Payment" block, [lines 1702-1870](src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx#L1702-L1870); pre-flight duplicate check at [870-879](src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx#L870-L879); `createPayment` at [1029-1037](src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx#L1029-L1037) | Duplicate reference is a hard error; no join |
| `RentalDetailsPage.tsx` | "Record Payment" block inside the Create Invoice modal, [1199-1321](src/pages/GreenTarget/Rentals/RentalDetailsPage.tsx#L1199-L1321); `createPayment` at [450-460](src/pages/GreenTarget/Rentals/RentalDetailsPage.tsx#L450-L460); payments table at [784-830](src/pages/GreenTarget/Rentals/RentalDetailsPage.tsx#L784-L830) | No join; **no duplicate pre-check at all**, so it fails with a raw 409; payment rows are inert text |
| `RentalFormPage.tsx` | none — renders `AssociatedInvoiceDisplay` at [1503](src/pages/GreenTarget/Rentals/RentalFormPage.tsx#L1503) | Shows only "This invoice has payment records" ([AssociatedInvoiceDisplay.tsx:148-155](src/components/GreenTarget/AssociatedInvoiceDisplay.tsx#L148-L155)); no amounts, no links |

**No page in the app links to `/greentarget/payments` at all** (verified by grep). The Payments
page is a list with no per-payment route; the receipt dialog is opened by state, not by URL. This
is the single biggest decision blocking B — see §4 rule L1.

API client: `createPayment` [api.ts:307](src/routes/greentarget/api.ts#L307), `createPaymentBatch`
[314](src/routes/greentarget/api.ts#L314), `getReceiptGroup`
[272](src/routes/greentarget/api.ts#L272), `checkInternalPaymentRef`
[278](src/routes/greentarget/api.ts#L278).

## 3. Design summary

- **A** = one new lookup endpoint + a `receipt_id` join mode on `POST /payments` + a shared
  frontend panel used by the two record-payment blocks.
- **B** = a receipt-addressable route so payments have somewhere to link *to*, then links on the
  two rental screens.
- **C** = rental columns added to the receipt group read model, and payment detail added to
  `AssociatedInvoiceDisplay`.

A is the only workstream that touches the ledger. B and C are read/presentation only.

## 4. Rules and decisions

These are the non-obvious calls. Implementers should not quietly change them.

**Joining (A)**

- **J1 — the receipt owns date, method and cheque/transaction reference.** A receipt is one
  banking event. When joining, the new allocation *adopts* `received_date`, `payment_method` and
  `payment_reference` from the header; the client's values for those fields are ignored. The UI
  must therefore show them read-only and explain why, rather than pretending they are editable.
- **J2 — the joined allocation inherits the receipt's status.** `pending` receipt (unconfirmed
  cheque) → new allocation is `pending` and **must not** touch `invoices.balance_due`,
  `status`, or `customers.last_activity_date`. `posted` receipt → allocation is `active` and
  updates them exactly as the existing single path does
  ([payments.js:1021-1050](src/routes/greentarget/payments.js#L1021-L1050)).
- **J3 — `total_amount` is increased before the journal sync**, and the *refreshed* receipt row is
  passed to `syncGTReceiptJournalEntry`, or the §2a total-mismatch guard throws.
- **J4 — a cancelled receipt can never be joined.** Cancelled references stay reserved.
- **J5 — a receipt whose journal has `manual_override` can never be joined** (§2a). Report it as a
  distinct, explicit reason, not a generic failure.
- **J6 — one allocation per invoice per receipt.** Reject a join when the receipt already holds a
  non-cancelled allocation for that invoice. (The batch path enforces the same uniqueness in
  memory at [payments.js:142-148](src/routes/greentarget/payments.js#L142-L148).)
- **J7 — origin is not recomputed on join.** `origin` (`erp` / `legacy_operational`) is a property
  of the header's received date, which J1 keeps fixed. Since the date is inherited, the R8 lock and
  the pre-cutover non-posting rule stay self-consistent; still call
  `assertPaymentMutationDateAllowed` with the *receipt's* date and the joining invoice.
- **J8 — reference matching is case-insensitive and trimmed**, matching
  `UPPER(TRIM(display_reference))` used everywhere else.
- **J9 — joining is opt-in in the UI.** A reference that matches an existing receipt must never
  silently join. Show the matched receipt and require an explicit confirmation, because a typo that
  collides with a real RV would otherwise post money into the wrong banking event.

**Linking (B)**

- **L1 — decide the link target first.** There is no per-payment route today (§2f). Recommended:
  add a receipt-addressable route (e.g. `/greentarget/payments?receipt=:id`) that the Payments page
  reads on mount to open `GreenTargetReceiptDetailsDialog` automatically. This is the smallest
  change that gives every payment row a real destination, and it also gives A's "joined into
  receipt X" confirmation somewhere to point. The alternative — linking to the invoice details page
  — is cheaper but does not show the sibling allocations, which is the whole point of C.
- **L2 — cancelled payments still link.** They are part of the audit trail; keep the existing
  dimmed styling.

**Traceability (C)**

- **C1 — rentals are derived, never denormalised.** A payment's rentals are
  `payment → invoice → invoice_rentals → rentals`. Do not add a `rental_id` column to
  `greentarget.payments`; an invoice can cover several rentals and the link already exists.
- **C2 — no schema change is required for any of A, B or C.** If an implementer concludes
  otherwise, stop and re-read §2a/§2e before writing a migration.

## 5. Workstream A — join an existing receipt

### A1. `GET /greentarget/api/payments/receipts/by-reference/:ref(*)`

New read endpoint in `src/routes/greentarget/payments.js`. **Register it next to the existing
`/receipts/:receiptId/group` route and before every `/:payment_id` route**, per the comment at
[payments.js:387-389](src/routes/greentarget/payments.js#L387-L389).

Returns, for a case-insensitive trimmed match on `receipts.display_reference`:

```
{
  exists: boolean,
  receipt: null | {
    receipt_id, display_reference, received_date, posting_date,
    payment_method, payment_reference, status, origin, total_amount,
    allocation_count
  },
  joinable: boolean,
  block_reason: null | "cancelled" | "manual_override" | "invoice_already_allocated"
}
```

`joinable` resolves J4/J5 server-side so the UI never has to reimplement the rules. Accept an
optional `?invoice_id=` so J6 can also be answered up front and the UI can explain the block
before the user commits.

### A2. Join mode on `POST /greentarget/api/payments`

Accept an optional `receipt_id`. When absent, behaviour is **unchanged** — this must stay true, as
`InvoiceDetailsPage` and the payment batch flow depend on it.

When present, inside the existing transaction and *after* the advisory lock (§2b lock order):

1. `SELECT … FROM greentarget.receipts WHERE id = $1 FOR UPDATE`.
2. Apply J4, J5, J6. Reject with 409 and the specific message.
3. Ignore the client's date/method/`payment_reference`; adopt the header's (J1). Keep validating
   the client's `amount_paid` normally via `normalizePaymentAmount`.
4. Lock the invoice `FOR UPDATE OF i`, then run the three §2b validators using the **receipt's**
   received date.
5. Balance/status/pending checks exactly as the current path
   ([payments.js:910-961](src/routes/greentarget/payments.js#L910-L961)). Note the existing
   "invoice already has a pending payment" check at
   [payments.js:948](src/routes/greentarget/payments.js#L948) — joining a *pending* receipt with a
   second invoice is legitimate, so that check must be scoped to *other* receipts, not this one.
6. Insert the payment with `receipt_id` and the inherited status (J2).
7. Update invoice balance/status and `customers.last_activity_date` **only when active** (J2).
8. `UPDATE greentarget.receipts SET total_amount = total_amount + $amount, updated_at = …,
   updated_by = …` and re-read the row (J3).
9. `await syncGTReceiptJournalEntry(client, refreshedReceipt, req.staffId || null)`.
10. Return the refreshed payment plus the receipt summary so the UI can confirm *which* receipt was
    joined.

### A3. Frontend plumbing

- `src/types/greenTargetTypes.ts` — add the lookup response type; add optional `receipt_id` to
  `CreateGreenTargetPaymentInput`.
- `src/routes/greentarget/api.ts` — add `getReceiptByReference(ref, invoiceId?)`.
- New shared piece, `src/components/GreenTarget/GTReceiptJoinPanel.tsx`, exporting both a
  debounced lookup hook and the notice UI. **Two consumers justify sharing this; do not also try to
  unify the two surrounding payment forms** — their layouts differ (a 4-column form section vs a
  2-column modal) and merging them is out of scope.

The panel shows the matched receipt (reference, date, method, current total, allocation count),
the explicit join confirmation (J9), and — when `joinable` is false — the specific reason.

### A4. `InvoiceFormPage.tsx`

- Feed `paymentInternalReference` into the hook.
- When the user confirms a join: render date / method / cheque reference read-only from the
  receipt (J1), and pass `receipt_id` to `createPayment`.
- The pre-flight duplicate check at
  [870-879](src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx#L870-L879) and the `validateForm`
  reference rules at
  [850-861](src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx#L850-L861) must be skipped in join
  mode — otherwise the form blocks the very case it now supports. This is the single easiest thing
  to miss.
- The payment failure path here is deliberately non-fatal (the invoice is already created and the
  user is told "Invoice created, payment failed"). Keep that; a failed join must not lose the
  invoice.

### A5. `RentalDetailsPage.tsx`

Same wiring inside the Create Invoice modal. Note this page has **no** pre-flight reference check
today, so a duplicate currently surfaces as a raw 409 toast — adding the panel fixes that
incidentally. Reset the join state in `openInvoiceModal`
([RentalDetailsPage.tsx:291](src/pages/GreenTarget/Rentals/RentalDetailsPage.tsx#L291)) alongside
the other payment fields.

## 6. Workstream B — clickable links

1. Decide L1. If taking the recommended route: `GreenTargetPaymentPage` reads a `receipt` query
   param on mount and opens `GreenTargetReceiptDetailsDialog` for it.
2. `GET /rentals/:rental_id/details` — add `receipt_id` (and `posting_date`) to the payments
   `SELECT` at [rentals.js:728-735](src/routes/greentarget/rentals.js#L728-L735).
3. `RentalDetailsPage.tsx` — add `receipt_id` to the `RentalPayment` interface
   ([line 63](src/pages/GreenTarget/Rentals/RentalDetailsPage.tsx#L63)); make the reference cell in
   the payments table ([809-811](src/pages/GreenTarget/Rentals/RentalDetailsPage.tsx#L809-L811)) a
   link to the receipt. Keep the existing dimming for cancelled rows (L2).
4. `RentalFormPage.tsx` / `AssociatedInvoiceDisplay.tsx` — replace the bare "This invoice has
   payment records" line with the actual payments (date, method, reference, amount) each linking to
   its receipt. `AssociatedInvoiceDisplay` is used **only** by `RentalFormPage`
   (verify with grep before changing its props); extend it with an optional `payments` prop so the
   no-data rendering stays untouched.

## 7. Workstream C — rental ↔ payment traceability

1. `GET /receipts/:receiptId/group` — extend the allocation rows with the rentals each invoice
   covers, via `invoice_rentals` (C1). Aggregate per invoice, e.g.
   `rentals: [{ rental_id, tong_no, date_placed, location_site }]`. Prefer a `json_agg` subquery
   over widening the existing single statement, whose one-row-per-allocation shape the response
   mapper at [payments.js:452-462](src/routes/greentarget/payments.js#L452-L462) depends on.
2. `GreenTargetReceiptDetailsDialog.tsx` — render those rentals under each allocation, each linking
   to `/greentarget/rentals/:rental_id`.
3. Together with B3/B4 this closes the loop: rental → payment, and payment → rental.

## 8. Edge cases to test

Ledger-affecting (A):

1. Join a **posted** receipt → journal is *replaced*, gains one credit line, still balances; DR
   `PBB_1` equals the new total.
2. Join a **pending cheque** receipt → **no journal**, invoice balance unchanged; confirming the
   receipt later posts one journal covering *both* allocations and settles both invoices.
3. Join attempt on a **cancelled** receipt → 409, nothing written.
4. Join attempt on a receipt whose journal is **`manual_override`** → 409 with that specific
   reason (J5). This is the case that silently corrupts the GL if missed.
5. Join with an invoice **already allocated** in that receipt → 409 (J6).
6. Join a **pre-cutover** (`legacy_operational`) receipt with a **July** invoice → must be refused
   by `assertPaymentMutationDateAllowed`, because the inherited date is locked (J7).
7. Join with an amount **exceeding the invoice balance** → 409, receipt total unchanged.
8. Two concurrent joins of the same receipt → serialised by the advisory lock + `FOR UPDATE`;
   final `total_amount` equals the sum of both, journal has both credit lines.
9. **Regression:** a normal payment with a *new* reference from all three entry points
   (invoice form, rental modal, `InvoiceDetailsPage`) still creates its own receipt.
10. Cancel a joined receipt → both invoices' balances restored, one journal cancelled.

Presentation (B, C):

11. Rental with several invoices, one cancelled, each with payments → correct grouping, links, and
    dimming.
12. Rental whose invoice was paid by a **multi-invoice** receipt → the receipt dialog lists the
    other invoices *and* their rentals.
13. Rental with no invoice, and invoice with no payment → unchanged empty states.

## 9. Housekeeping when this ships

- **Changelog is required** (CLAUDE.md rule 16): joining receipts changes a workflow the user
  already knows, and payment links are a visible new affordance. Prepend one entry with `date`,
  `ms`, and `en` to `CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx`.
- **Schema docs: no change expected** (C2). If the design ends up altering a table after all,
  update the Database Schema section in **both** `CLAUDE.md` and `AGENTS.md` (rule 13).
- Add a GT-P-series entry to `GT_ACCOUNTING_HANDOVER.md` §10 recording the joining rules J1-J9, so
  the receipt model's invariants stay documented in one place.
- Dates: use `format(new Date(value), "yyyy-MM-dd")` from date-fns; never slice an ISO string
  (rule 17). `received_date` and `posting_date` arrive from `date` columns and are exactly the trap
  that rule describes.
- Any new checkbox uses `src/components/Checkbox.tsx` (rule 18). Note the two existing payment
  blocks use raw `IconSquare` / `IconSquareCheckFilled` buttons; leave those alone rather than
  refactoring adjacent code (rule 3).

## 10. Explicitly out of scope

- Any change to the Payments page **batch** creation flow — it already does multi-invoice receipts
  at creation time.
- Merging or splitting existing receipts, or moving an allocation between receipts.
- Unifying the two record-payment form layouts (§A3).
- Tien Hock receipts. TH has its own `receipts` / `receipt_allocations` model with different rules
  (`CH_REV1`/`CH_REV2`, excess allocations, overpayment application); none of this applies there.

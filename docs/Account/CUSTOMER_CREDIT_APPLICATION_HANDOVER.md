# Handover: Apply customer credit to sales invoices

Date: 2026-07-17

Status: planning only; do not treat this document as an implemented feature

Scope: Tien Hock customer credits, invoices, receipts, debtor statements, and payment history

Related references:

- `INVOICE-PAYMENT-ACCOUNT_IMPLEMENTATION_PLAN.md`;
- `INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md`;
- `PAYMENT_SCENARIOS_REFERENCE.md`;
- `CUSTOMER_DEBTOR_SUBLEDGER_JOURNALS_HANDOVER.md`.

## 1. Objective

Build a permanent, auditable workflow that lets an authorized user apply an existing customer
credit to one or more open invoices.

The workflow must support two accounting sources that look similar to a user but are materially
different in the ledger:

1. a legacy/opening credit already held as a credit balance in the customer's DEBTOR child; and
2. a modern receipt overpayment held in `CUST_DEP` as an `excess` receipt allocation.

The finished system must keep all of these views consistent:

- `invoices.balance_due` and `invoice_status`;
- `customers.credit_used`;
- the customer's DEBTOR child ledger;
- `CUST_DEP` when the credit came from an overpayment;
- payment/settlement history;
- Debtors, Customer Statement, General Statement, and aging.

This handover exists because the MYSHOP-SKT RM41.05 case proved that a correct debtor-ledger
balance can still leave an operational invoice showing as overdue when there is no explicit credit
application record.

## 2. Current state on 17 July 2026

### What is already implemented

- Receipts use `receipts` + `receipt_allocations` and post one source-owned journal.
- An `invoice` allocation settles an invoice and credits its customer DEBTOR child.
- An `excess` allocation records customer-owned unapplied money in `CUST_DEP`.
- `receipt_allocations` already contains `amount`, `applied_amount`, and `refunded_amount`, with
  remaining credit conceptually equal to `amount - applied_amount - refunded_amount`.
- Standalone Refund Notes can refund a receipt excess and increment `refunded_amount`.
- Customer and General Statements read posted DEBTOR-child journal lines using the opening-anchor
  rule, so historical statement balances do not change when a later receipt arrives.
- Statement aging now reconciles its total to the authoritative debtor-ledger closing balance.

### What is not implemented

- There is no normal UI or API for applying an existing credit to a later invoice.
- `receipt_allocations.applied_amount` is not advanced by a credit-application service.
- There is no durable application record connecting a particular credit source to a target invoice.
- The Debtors screen primarily relies on operational invoice balances, while statements rely on
  the debtor ledger. Those two views can diverge when an old credit has not been explicitly applied.
- There is no general cancellation/reversal workflow for a credit application.
- Ownership and availability of legacy/opening debtor credits are not represented as structured
  source records.

### MYSHOP-SKT compatibility correction

`dev/migrations/2026-07-17_myshop_skt_63864_opening_credit_contra.sql` is a guarded correction for
one proven case. It:

- preserves the real RM1,617.65 receipt `TF010726-3` and journal;
- records two non-posting `payments.payment_method = 'contra'` history rows;
- clears historical invoice `62297` and invoice `63864`;
- leaves the customer debtor ledger at RM0.00;
- prevents those contra rows from being cancelled like cash payments.

That migration is not the permanent workflow. `contra` is deliberately excluded from the normal
Payment Form and must not become a shortcut for manually changing invoice balances. When this
project ships, decide whether to migrate those two compatibility rows into the new application
model or retain them as read-only legacy projections linked to the new records. Never count both.

The correction has been applied to the development database. Production application must be
confirmed separately during deployment.

## 3. Accounting contracts

### 3.1 Legacy/opening credit already in the customer DEBTOR child

Example: MYSHOP-SKT's -RM41.05 brought-forward credit.

Applying this credit to an invoice is a subledger allocation only:

- reduce the target invoice's `balance_due`;
- update its status;
- reduce `customers.credit_used` by the applied amount;
- consume the structured opening-credit source;
- create an auditable application record;
- create **no journal**, because the credit is already included in the customer's DEBTOR balance.

Posting another credit to the DEBTOR child would double-count the credit.

### 3.2 Modern receipt overpayment held in `CUST_DEP`

Applying this credit moves an existing liability into settlement of a receivable:

- DR `CUST_DEP`;
- CR the target customer's DEBTOR child;
- reduce the target invoice's `balance_due`;
- update its status and `customers.credit_used`;
- increment the source excess allocation's applied amount;
- create an auditable application record linked to the posted journal.

No bank or cash account is touched because no new money is received.

### 3.3 Credit Note excess

Before implementation, audit the current CN behavior for a CN that exceeds the invoice's remaining
balance or is issued against a paid invoice. Choose and enforce one contract:

- either the excess remains as a credit in the customer's DEBTOR child; or
- it is reclassified to `CUST_DEP` as a customer deposit.

The selected contract determines whether a future application is non-posting (DEBTOR-held) or
posts DR `CUST_DEP` / CR customer DEBTOR. Do not infer the source account from UI wording.

### 3.4 Manual journals and unidentified negative balances

A negative customer ledger balance is not sufficient proof that the whole amount is safely
available for allocation. It may include a manual journal, cancelled source, import bridge, or data
error. The workflow must allocate only from a structured, customer-owned credit source. Legacy
credits require an evidence-backed migration or an authorized opening-credit creation process.

## 4. Recommended data model

Use explicit credit sources and explicit applications. Do not represent future applications as
ordinary cash/bank `payments` rows.

### 4.1 `customer_credits`

Recommended fields:

- `id`;
- `customer_id` FK to `customers`;
- `source_type`: `opening_balance`, `receipt_excess`, `credit_note_excess`, or an approved future
  type;
- type-specific nullable source FKs such as `receipt_allocation_id`, `adjustment_document_id`, and
  `account_opening_balance_id`, plus evidence/provenance for a legacy credit that is only part of a
  net opening anchor;
- `credit_date`;
- `accounting_location`: `debtor_child` or `cust_dep`;
- `original_amount`;
- `applied_amount`;
- `refunded_amount`;
- `status`: `active`, `exhausted`, or `cancelled`;
- `notes` and evidence/provenance fields where required;
- created/updated audit fields.

Required invariants:

- amounts are positive NUMERIC values rounded to two decimals;
- `applied_amount + refunded_amount <= original_amount`;
- exactly one source link/provenance contract per credit row;
- one active credit source per source record, enforced with unique indexes where an FK exists;
- source customer cannot change after any application/refund;
- `remaining_amount = original_amount - applied_amount - refunded_amount`;
- a cancelled source cannot have active applications.

`customer_credits` should become the single lifecycle owner of original/applied/refunded amounts.
For `receipt_excess`, link it 1:1 to `receipt_allocations`. The existing
`receipt_allocations.applied_amount` and `refunded_amount` fields may be mirrored transactionally
during a compatibility period, but they must not remain independent authorities. The Phase 0 plan
must decide whether to deprecate those counters after all readers are migrated or retain them as
explicitly denormalized values guarded by service updates and reconciliation constraints.

### 4.2 `customer_credit_applications`

Recommended fields:

- `id`;
- `customer_credit_id` FK;
- `invoice_id` FK;
- `application_date`;
- `amount`;
- `status`: `active` or `cancelled`;
- `journal_entry_id` nullable FK;
- reference/notes;
- created/cancelled audit fields and cancellation reason.

Required invariants:

- the credit and invoice belong to the same customer;
- amount is positive and cannot exceed both the source remaining amount and invoice balance;
- an application from `debtor_child` has no journal;
- an application from `cust_dep` has exactly one balanced posted journal;
- a cancellation reverses the same operational and accounting effects exactly once;
- an application date in a locked accounting period is rejected when a journal is required.

Use a uniqueness/idempotency key for client retries. A timed-out request must not apply the same
credit twice.

## 5. Service and locking design

Create one accounting service as the only mutation boundary for applications and cancellations.
Routes and UI must not update invoice balances directly.

Application transaction:

1. validate the local `yyyy-MM-dd` application date;
2. lock all selected credit rows in stable ID order;
3. lock all target invoices in stable invoice-ID order;
4. lock linked `receipt_allocations` when the source is a receipt excess;
5. verify customer ownership, source status, remaining credit, invoice status, and current balance;
6. reject over-application rather than silently cap it;
7. create the DR `CUST_DEP` / CR customer-DEBTOR journal only for `cust_dep` sources;
8. insert application rows;
9. increment source `applied_amount` and linked receipt-allocation `applied_amount`;
10. reduce invoice balances and derive Paid/Unpaid/Overdue status consistently;
11. update `customers.credit_used` by the actual invoice-balance reduction;
12. commit atomically.

Cancellation transaction performs the exact inverse and must fail if a later dependent refund,
reapplication, invoice cancellation, customer reassignment, or locked-period rule makes reversal
unsafe.

Concurrency acceptance is mandatory: two users applying the last RM100 credit at the same time
must result in one success and one clear conflict, never RM200 applied.

## 6. API contracts

Suggested endpoints:

- `GET /api/customer-credits?customer_id=...&as_of=yyyy-MM-dd`
  - returns each source, original/applied/refunded/remaining amounts, accounting location, and
    whether it is currently usable;
- `POST /api/customer-credit-applications`
  - accepts `customer_id`, `application_date`, an idempotency key, and allocations containing
    `customer_credit_id`, `invoice_id`, and `amount`;
- `GET /api/customer-credit-applications/:id`
  - returns source, target invoice, journal, audit, and cancellation state;
- `POST /api/customer-credit-applications/:id/cancel`
  - requires a reason and performs the guarded inverse.

If Payment Form must submit a new receipt and apply old credit in one user action, use a settlement
orchestration endpoint that calls both services inside one database transaction. Do not add the
credit amount to `receipts.total_amount`; a credit application is not new money received.

## 7. UI workflow

### Minimum workflow

Add an `Apply Customer Credit` action from Invoice Details and/or Payment Management:

- display the customer, target invoice balance, and total available credit;
- itemize credit sources with date, origin, original amount, remaining amount, and accounting
  meaning;
- let the user apply a partial amount;
- show the balance after application before confirmation;
- require an application date and optional reference/notes;
- display a strong confirmation that no bank payment is being recorded;
- show the resulting application in invoice settlement history with a distinct `Credit Applied`
  label, not Cash/Online/Bank Transfer.

### Payment Form integration

The current Payment Form should continue offering only real receipt methods. A future combined flow
may show two separate totals:

- customer credit applied; and
- new cash/bank/cheque amount received.

Their sum may settle the invoice, but only the second amount belongs to the receipt and bank/cash
journal.

### Pending cheque decision

Decide before coding whether credit applied alongside a pending cheque becomes effective
immediately or waits for cheque clearance. Recommended simplest rule: record the credit application
separately and immediately; the cheque remains pending and affects no invoice balance until its
actual clearance date. The UI must make the two states unmistakable.

## 8. Reporting behavior

- Invoice Details and payment history must list credit applications separately from money received.
- Debtors invoice balances must use the post-application `balance_due` and status.
- Customer totals and credit-used values must reconcile to the same operational balances.
- A `cust_dep` application appears in the customer statement through its posted DEBTOR credit line.
- A `debtor_child` opening-credit application creates no new statement line because the credit is
  already in B/F/ledger balance; its audit trail belongs in invoice settlement history.
- Aging must apply credit on its actual application date. Historical statements before that date
  must remain unchanged.
- Keep the current ledger-to-aging reconciliation as a safety bridge, but add an admin/dry-run report
  for any non-zero bridge. After structured credits are migrated, unexplained bridges should be
  treated as reconciliation work, not silently auto-applied to invoices.
- Debtors should expose unapplied customer credit clearly, even when the net customer balance is
  zero or negative. Do not hide a still-open invoice merely because an unapplied credit exists.

## 9. Legacy and existing-data migration

Do not bulk-convert every negative debtor balance into spendable credit.

Produce a read-only dry run first:

1. list every active `receipt_allocations.allocation_type = 'excess'` with original, applied,
   refunded, and remaining amounts;
2. list active standalone RNs linked to those excesses;
3. list negative debtor opening anchors and later customer-ledger credits;
4. compare each customer's ledger closing, open invoice total, and `credit_used`;
5. identify CNs that created customer-level excess;
6. separate proven credits from unexplained differences;
7. require explicit mapping/evidence for legacy opening credits.

Migration rules:

- seed modern receipt-excess sources 1:1 from existing allocations;
- preserve all existing receipt and journal IDs;
- seed legacy/opening sources only from approved evidence;
- do not auto-apply credits to invoices during source migration;
- migrate MYSHOP-SKT without duplicating its two compatibility contra rows;
- verify `credit_used` equals the intended operational invoice total after each approved correction;
- verify posted journals remain balanced and customer debtor/CUST_DEP totals do not change merely
  because source metadata was added;
- make migrations fail closed and rerunnable.

## 10. Phased implementation plan

### Phase 0: evidence and contract gate

- Audit current CN excess behavior and all uses of `receipt_allocations.applied_amount`.
- Produce the read-only credit-source/reconciliation report.
- Decide the open accounting questions in section 12.
- Record approved journal/reference contracts before schema work.

### Phase 1: data model and service

- Add credit-source and application tables, constraints, indexes, and audit fields.
- Implement source availability and the atomic application/cancellation service.
- Add journal creation for `cust_dep` sources only.
- Add focused service-level transaction scenarios.

### Phase 2: API and UI

- Add read/apply/detail/cancel endpoints.
- Add Invoice Details/Payment Management workflow.
- Keep `contra` unavailable in the normal receipt method selector.
- Add clear labels and cancellation guidance.

### Phase 3: reports and connected lifecycle guards

- Integrate applications into payment history, Debtors, statement aging, and PDFs where relevant.
- Block unsafe invoice customer changes, invoice cancellation, receipt cancellation, CN/RN
  cancellation, and application cancellation when dependencies exist.
- Verify payment-type conversion and consolidation do not orphan applications.

### Phase 4: migration and rollout

- Review the dry-run output with the accountant/user.
- Seed modern credit sources and individually approved legacy credits.
- Migrate or link the MYSHOP-SKT compatibility correction without double counting.
- Run pre/postflight reconciliation in development, then production.
- Update schema documentation, payment-scenario reference, accounting progress, and changelog.

## 11. Acceptance criteria

The feature is not complete until all of these pass:

1. A RM100 opening credit can partially or fully settle an invoice with no journal and no change to
   the customer's debtor-ledger total.
2. A RM100 `CUST_DEP` overpayment can settle an invoice with one balanced DR `CUST_DEP` / CR customer
   DEBTOR journal.
3. One credit can be applied across multiple invoices without exceeding its remaining amount.
4. Multiple credits can settle one invoice with deterministic ordering and audit rows.
5. Partial application leaves correct credit remaining and invoice outstanding.
6. Credit plus a new receipt can settle an invoice without including credit in receipt/bank totals.
7. Cancellation restores credit, invoice balance/status, `credit_used`, and journal state exactly.
8. Double submission and concurrent application cannot over-consume credit.
9. Cross-customer application is rejected.
10. Cancelled/locked/paid invoices and cancelled/exhausted credit sources are rejected correctly.
11. Statement history before the application date does not change.
12. Debtors, invoice details, customer statement, general statement, aging, Account Ledger, and
    Trial Balance reconcile after application.
13. Receipt excess `amount = applied + refunded + remaining` for every source.
14. Posted journals remain balanced and source-owned; no bank/cash line is created for credit use.
15. MYSHOP-SKT remains RM0.00 with one effective RM41.05 application, not two.

## 12. Decisions required before coding

1. Which roles may create and cancel credit applications?
2. Should users start from Invoice Details, Payment Management, Customer Details, or all three?
3. What visible reference/numbering should a `CUST_DEP` application journal use?
4. Should CN excess remain in the customer DEBTOR child or be reclassified to `CUST_DEP`?
5. Who approves creation of a structured legacy/opening credit source and what evidence is required?
6. May an application be backdated, and which posting-lock rules apply to non-posting opening
   credits?
7. Should credit application alongside a pending cheque be separate/immediate as recommended?
8. Should net customer credits appear on the main Debtors page even when there are no open invoices?
9. May the existing receipt-allocation applied/refunded counters be deprecated after migration, or
   must they remain as guarded compatibility mirrors?

Do not start schema or UI implementation until questions 3-6 are resolved because they determine
the accounting contract and migration behavior.

## 13. Likely files and connected systems

Expected areas to inspect before editing:

- `src/routes/accounting/receipt-service.js`;
- `src/routes/accounting/debtorSync.js`;
- `src/routes/accounting/debtors.js`;
- `src/routes/sales/invoices/payments.js`;
- `src/routes/sales/adjustment-docs/`;
- `src/components/Invoice/PaymentForm.tsx`;
- `src/components/Invoice/PaymentTable.tsx`;
- Tien Hock Invoice Details and Payment Management pages;
- customer/invoice/payment types in `src/types/types.ts`;
- Customer Statement, General Statement, Debtors, receipt-voucher, and payment-history PDFs;
- invoice customer-change, cancellation, consolidation, and adjustment cancellation guards;
- new guarded migrations under `dev/migrations/`;
- `AGENTS.md`, `CLAUDE.md`, `INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md`,
  `PAYMENT_SCENARIOS_REFERENCE.md`, and the user-facing changelog when the feature ships.

Initial scope should remain Tien Hock. Jelly Polly and Green Target have different payment and
journal models and must not inherit this workflow implicitly.

## 14. Handover starting point

The next implementer should begin with Phase 0, not UI coding:

1. read this document and the current invoice/receipt implementation;
2. query the development database for every credit source and current mismatch;
3. document the CN excess contract observed in code/data;
4. obtain the decisions in section 12;
5. present the dry-run and final schema/service plan before making database changes.

The success condition is not merely that an invoice displays RM0.00. Every credit must have a
proven source, owner, remaining balance, application trail, correct journal treatment, safe reversal,
and consistent reporting.

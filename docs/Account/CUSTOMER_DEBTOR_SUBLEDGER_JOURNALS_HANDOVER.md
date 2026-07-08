# Handover: Post receivable journals to customer DEBTOR child accounts

Date: 2026-07-09

## Context

`DEBTOR` child accounts are now maintained 1:1 from `customers`, so every customer can appear as a
Trade Debtor account in the Account Ledger picker.

The remaining accounting gap is that current sales/payment/adjustment journal entries still post
receivable movement to the single `TR` control account. Because Account Ledger reads real
`journal_entry_lines.account_code` values, customer debtor accounts appear in the picker but do not
show invoice, receipt, credit note, debit note, or paired refund note movement yet.

Users expect each customer Account Ledger to show their real receivable activity.

## Confirmed System Choices

- Use real subledger postings, not a virtual customer-ledger overlay.
- Keep aggregate views grouped so Trial Balance and Trade Debtors remain concise.
- Do this after the Customer Invoice -> Receipt Journals system has been refined.

## Current DB Facts

- Posted `TR` lines are deterministically mappable:
  - `S`: 480
  - `REC`: 2773
  - `CN`: 21
  - unmapped: 0
- Every mapped customer has a `DEBTOR` child account.
- `journal_entry_lines.account_code` has a foreign key to `account_codes.code` with no cascade, so
  customer ID changes must move references safely.

## Implementation Plan

### 1. Extend debtor helper

Add or extend helper behavior in `src/routes/accounting/debtorSync.js`:

- `getCustomerDebtorAccountCode(client, customerId)` returns and ensures the active child account
  for a customer.
- Customer ID changes must safely handle referenced debtor accounts:
  - create or rename the target debtor account;
  - move `journal_entry_lines.account_code` references;
  - move any `account_opening_balances.account_code` references;
  - then remove or deactivate the old debtor code.

This matters because `journal_entry_lines.account_code` does not cascade when `account_codes.code`
changes.

### 2. Update journal posting

Post receivable-side journal lines to the customer debtor child account:

- Sales: `DR customer debtor / CR CASH_SALES|CR_SALES`
- Receipt: `DR bank/cash / CR customer debtor`
- Credit Note: `DR RETURN / CR customer debtor`
- Debit Note: `DR customer debtor / CR SLS`
- Paired Refund Note: `DR customer debtor / CR bank`
- Standalone overpayment Refund Note stays `DR CUST_DEP / CR bank`

Payment journal creation should accept `customerid`. It should also fall back to resolving the
customer from `invoice_id` so a missed call site does not silently post back to `TR`.

### 3. Add historical migration

Add an idempotent migration to rewrite existing linked `TR` journal lines to the mapped customer
debtor code.

Rules:

- Rewrite sales journals through `invoices.journal_entry_id`.
- Rewrite receipt journals through `payments.journal_entry_id -> payments.invoice_id -> invoices`.
- Rewrite adjustment journals through `adjustment_documents.journal_entry_id`.
- Include cancelled linked journals for consistency.
- Leave `TR` active for manual or legacy use.

The migration must verify that every rewritten line has a mapped customer debtor account and should
surface any unmapped rows before changing data.

### 4. Preserve aggregate views

After real customer debtor postings exist:

- Account Ledger for a customer child account shows customer-only movement.
- Account Ledger for `DEBTOR` or legacy `TR` shows aggregate debtor movement.
- Trial Balance groups `TD` customer children into one Trade Debtors row instead of listing every
  customer separately.

Financial statements can continue rolling up through `fs_note = 22`.

## Verification

- New credit invoice posts the debtor-side line to the customer child account.
- Cash invoice sales and auto-receipt lines use the same customer debtor account.
- Manual payment uses the customer debtor account.
- Pending cheque confirmation uses the customer debtor account.
- Payment-type conversion uses the customer debtor account.
- Order-detail total resync uses the customer debtor account.
- Credit Note, Debit Note, and paired Refund Note use the customer debtor account.
- Standalone Refund Note for overpayment remains on `CUST_DEP`.
- Historical migration leaves no mappable posted `TR` customer lines behind.
- Customer Account Ledger shows historical invoices, payments, and adjustments.
- Trial Balance stays concise and balanced.

## Assumptions

- Existing invoice-based Debtors Report and customer statement remain unchanged.
- Changelog and accounting progress docs should be updated only when this implementation ships.
- This handover records the next accounting step; it does not supersede the current Customer
  Invoice -> Receipt Journals refinement.

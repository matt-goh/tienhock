# Correct a settled payment to a pending cheque

Implemented 2026-09-08. No migration or data repair is needed for deployment.

In Sales > Payments, open the payment reference/group details and choose **Correct to pending cheque**. Review all invoice amounts, the recorded payment date and journal date, choose the cheque date and enter a reason. A manually edited journal additionally requires an explicit acknowledgement. Save cancels the original receipt group and journals, restores invoice balances/customer credit, and creates pending cheque receipts with the same invoice allocations and bank. Confirm the replacement through the normal cheque-clearance workflow only once it actually clears.

The original records remain available. Cancellation reasons identify replacement receipt IDs; replacement payment notes identify original receipt and journal IDs and dates. Existing created/cancelled/updated actor and timestamp columns provide attribution. Group details now display payment notes.

## Scope and safeguards

- Only fully posted ERP online/bank-transfer groups paying active credit invoices. Amounts, invoice ownership and bank accounts cannot be edited in this workflow.
- No cash bills, opening imports, mixed-status groups, excess/account allocations, active adjustment documents or posted bank-in dependencies.
- The original receipt dates, actual journal dates and replacement date must pass the existing pre-June-2026 accounting lock. Cheque dates may be future dates; no clearance posting is created.
- The correction dialog explicitly enables TimeNavigator's `allowFuture` for the cheque date (the shared calendar defaults to disallowing future dates). Actual cheque clearance still cannot be confirmed with a future clearance date.
- Journal source ownership, totals and debit/credit amounts per bank/customer account must agree with the receipt. Date/text-only manual edits are permitted after acknowledgement. Changed accounting distributions are blocked.
- A snapshot of all receipt, allocation, journal, line, payment and invoice rows is checked again while locked in a SERIALIZABLE transaction. A concurrent change, stale preview or repeated submission fails without a second replacement. Serialization/deadlock failures require a fresh preview.
- A replacement cannot merge into an existing active cheque group with the same reference/date/bank.
- All originals are cancelled before replacements are created, within one transaction. Existing pending-cheque reservations prevent another payment from taking those amounts. Failure anywhere rolls back the entire operation.

## Read-only observation of the refreshed production copy

PBB363293 is payment 6642, receipt 422, allocation 658, invoice 2005171 (IQBAL), RM947. The payment/receipt date is 2026-09-07. Journal 13178 is manually overridden and dated 2026-10-07; its BANK_PBB debit and IQBAL credit are both RM947. Invoice balance and customer credit used are zero. No active adjustment was found. The supplied UI row shows 06/09/2026, so review the date discrepancy rather than using the screenshot as the stored accounting date. This feature returns date-only preview values and parses them as local dates.

No payment or journal has been changed as part of implementation. The user must decide the intended cheque date and perform the correction herself.

Implementation verification: the actual `previewReceiptCorrection` service was called against receipt 422 inside a READ ONLY transaction and returned the expected RM947 invoice allocation and manual-journal review flag. Backend JavaScript syntax checks and `npm run i18n:report` passed. The correction write path has not been executed against this copy.

Follow-up timezone fix: the first preview check forced Malaysia time and missed a false mismatch on the New York development server. `payments.payment_date` is a timestamp without time zone that `db-pool.js` re-tags as UTC, so formatting it locally returned September 6 while the receipt's date remained September 7. The correction now reads the payment's stored calendar date with `payment_date::date::text` and compares that known date-only string to the normalized receipt date. The read-only preview passes in America/New_York, Asia/Kuala_Lumpur and UTC. No shared date parser or payment records were changed.

## Manual verification after deployment

Use disposable records for mutation scenarios; do not change PBB363293 until its owner confirms the details.

1. Open PBB363293's correction preview without saving. Verify RM947, invoice 2005171, original 07/09/2026 payment date, 07/10/2026 journal date and manual-review acknowledgement.
2. On a disposable settled online receipt, correct to a future-dated cheque. Verify the original receipt/payments/journal are cancelled, original lines remain, and exactly one replacement per original receipt is pending with no posting date/journal.
3. Verify invoice balance and customer credit increase by the cancelled amount, and pending reservations prevent double payment. Check the payment list, invoice history, statement/ageing and bank/customer ledger; cancelled journals must no longer contribute.
4. For a group covering several invoices/customers, verify every allocation is preserved exactly, and one failed allocation leaves the whole original group unchanged.
5. Verify a missing reason, missing manual-review acknowledgement, changed journal account/amount, cash bill, adjustment, locked date, or colliding cheque group prevents saving.
6. Open two previews; change the source date/reference/amount or journal in another session. The old preview must fail. Submit the same successful request again and verify no duplicate cheque.
7. Confirm a disposable replacement using a valid actual clearance date. Verify settlement and the new receipt journal occur exactly once on that date; future clearance dates must remain rejected.
8. Review original cancellation reasons and replacement notes; check English, Malay and Simplified Chinese and narrow-screen dialog scrolling/date selection.

Build, type checks, lint and mutation tests are left to the user under AGENTS.md rule 10.

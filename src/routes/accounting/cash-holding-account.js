// src/routes/accounting/cash-holding-account.js
// Which holding account a physical-cash receipt debits.
//
//   CH_REV1  "CASH SALES RECEIVED"      — cash taken at the counter ON the
//            invoice's own sale day. Banked in with that day's cash-sales pool.
//   CH_REV2  "CASH RECEIVED/CR. SALES"  — cash collected LATER against an
//            invoice already on credit. Banked in per receipt.
//
// The distinction is the DATE, not the document type. Proven by the Jan-May
// legacy import: of 91 cash receipts against invoices, all 5 same-day ones are
// filed under CH_REV1 and all 86 later ones under CH_REV2, with no exceptions
// — and every one of the CH_REV1 five is against a credit INVOICE, not a cash
// bill. Revenue (CR_SALES vs CASH_SALES) is unaffected either way.
//
// Shared by receipt-service (posting) and imported-payment-reconciliation
// (duplicate-evidence lookup) so the two can never disagree about which
// account a given receipt belongs to.

import { invoiceLocalDateString } from "./sales-journal.js";

export const CASH_SALES_HOLDING_ACCOUNT = "CH_REV1";
export const CREDIT_SALES_HOLDING_ACCOUNT = "CH_REV2";

/**
 * Resolves the holding account for one cash receipt.
 *
 * The two accounts are banked in by different mechanisms (CH_REV1 by date
 * pool, CH_REV2 per receipt), so one receipt cannot sit in both: a mixed
 * same-day/later selection is refused rather than split. A cash receipt with
 * no invoice allocation (pure overpayment or a GL allocation) has no sale day
 * to compare against and stays CH_REV2.
 *
 * @param {object} client        pg client inside the caller's transaction
 * @param {Array}  allocations   receipt allocations ({type, invoice_id, ...})
 * @param {string} receivedDate  LOCAL yyyy-MM-dd the cash was received
 * @returns {Promise<string>} 'CH_REV1' | 'CH_REV2'
 */
export async function resolveCashHoldingAccount(client, allocations, receivedDate) {
  const invoiceIds = [
    ...new Set(
      (allocations || [])
        .filter((allocation) => allocation.type === "invoice")
        .map((allocation) => allocation.invoice_id)
    ),
  ].sort();
  if (invoiceIds.length === 0) return CREDIT_SALES_HOLDING_ACCOUNT;

  const result = await client.query(
    `SELECT id, createddate FROM invoices WHERE id = ANY($1::varchar[])`,
    [invoiceIds]
  );
  const saleDateById = {};
  for (const row of result.rows) {
    saleDateById[row.id] = invoiceLocalDateString(row.createddate);
  }

  const sameDay = [];
  const later = [];
  for (const id of invoiceIds) {
    const saleDate = saleDateById[id];
    if (!saleDate) continue; // a missing invoice is reported by lockInvoices
    (saleDate === receivedDate ? sameDay : later).push(id);
  }

  if (sameDay.length > 0 && later.length > 0) {
    throw new Error(
      `Cash collected on the sale day (${sameDay.join(", ")}) and cash collected later (${later.join(", ")}) are held in different accounts and are banked in differently. Record them as two separate payments.`
    );
  }
  return sameDay.length > 0
    ? CASH_SALES_HOLDING_ACCOUNT
    : CREDIT_SALES_HOLDING_ACCOUNT;
}

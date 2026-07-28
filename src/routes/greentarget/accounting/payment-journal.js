// src/routes/greentarget/accounting/payment-journal.js
//
// Green Target payment journal service (phase G7). An active GT payment owns
// one `REC` journal — the organic analogue of the legacy RV#/#/# family:
//   DR PBB_1  /  CR debtor child (credit customers) or CD_SD (counter sales)
// Legacy keyed EVERY receipt against PBB_1 (cash is treated as banked; GT's
// books have no cash-in-hand account and the June BS prints cash in hand
// .00), so all payment methods debit PBB_1.
//
// Two deliberate rules:
//   * Pending cheques post NOTHING until confirmed (TH's pending-cheque
//     semantics; the journal then dates to payment_date, the keyed RV date).
//   * A payment on a PRE-CUTOVER invoice (date_issued < 2026-07-01) posts
//     NOTHING: that invoice's sale and counter-cash collection already live
//     in the immutable Jan-Jun import, so an organic receipt would double the
//     money. The operational balance update still proceeds.
import {
  GREEN_TARGET_ACCOUNTING_OPEN_DATE,
  assertGreenTargetAccountingDateUnlocked,
  toLocalAccountingDateString,
} from "./posting-lock.js";
import { resolveGTReceivableAccount, fetchGTCustomerName } from "./sales-journal.js";
import {
  ensureGTAccountsExist,
  insertGTJournal,
  replaceGTJournal,
  cancelGTJournal,
} from "./posting-utils.js";

/** GT's one bank account with movement (legacy RV family: 472/472 debits). */
export const GT_BANK_ACCOUNT = "PBB_1";

/**
 * Create or re-sync the payment-owned REC journal. Returns null (posts
 * nothing) for pending cheques and for payments on pre-cutover invoices.
 *
 * @param {import("pg").PoolClient} client Inside the caller's transaction.
 * @param {object} payment The greentarget.payments row.
 * @param {object} invoice The owning greentarget.invoices row.
 * @param {string|null} [createdBy]
 * @returns {Promise<number|null>} The journal id, or null when nothing posts.
 */
export async function syncGTPaymentJournalEntry(
  client,
  payment,
  invoice,
  createdBy = null
) {
  if (payment.status === "pending" || payment.status === "cancelled") {
    return null;
  }

  const invoiceDate = toLocalAccountingDateString(invoice.date_issued);
  if (invoiceDate < GREEN_TARGET_ACCOUNTING_OPEN_DATE) {
    return null;
  }

  const entryDate = assertGreenTargetAccountingDateUnlocked(
    payment.payment_date,
    `Payment ${payment.internal_reference || payment.payment_id}`
  );

  let journalId = payment.journal_entry_id || null;
  if (!journalId) {
    const bySource = await client.query(
      `SELECT id FROM greentarget.journal_entries
        WHERE source_type = 'payment' AND source_id = $1 AND status = 'posted'`,
      [String(payment.payment_id)]
    );
    journalId = bySource.rows[0]?.id || null;
  }

  if (journalId) {
    const overrideCheck = await client.query(
      "SELECT manual_override FROM greentarget.journal_entries WHERE id = $1",
      [journalId]
    );
    if (overrideCheck.rows[0]?.manual_override) {
      return journalId;
    }
  }

  const receivableAccount = resolveGTReceivableAccount(invoice.customer_id);
  await ensureGTAccountsExist(client, [GT_BANK_ACCOUNT, receivableAccount]);

  const amount = Number(payment.amount_paid);
  const customerName = await fetchGTCustomerName(client, invoice.customer_id);
  const visibleReference =
    payment.internal_reference || payment.payment_reference || null;
  const description = `REF : ${
    visibleReference || payment.payment_id
  } , INV/NO : ${invoice.invoice_number} /${customerName}`;
  const lines = [
    {
      accountCode: GT_BANK_ACCOUNT,
      debit: amount,
      reference: visibleReference,
      particulars: description,
      chequeReference: payment.payment_reference || null,
    },
    {
      accountCode: receivableAccount,
      credit: amount,
      reference: visibleReference,
      particulars: description,
    },
  ];

  if (!journalId) {
    journalId = await insertGTJournal(client, {
      referenceNo: `REC-${payment.payment_id}`,
      entryType: "REC",
      entryDate,
      description,
      displayReference: visibleReference,
      sourceType: "payment",
      sourceId: String(payment.payment_id),
      createdBy,
      lines,
    });
  } else {
    await replaceGTJournal(client, journalId, {
      entryDate,
      description,
      displayReference: visibleReference,
      lines,
    });
  }

  await client.query(
    "UPDATE greentarget.payments SET journal_entry_id = $1, bank_account = $2 WHERE payment_id = $3",
    [journalId, GT_BANK_ACCOUNT, payment.payment_id]
  );
  return journalId;
}

/**
 * Keep the journal's visible reference in step when a payment's reference
 * fields are edited (amounts and dates are not editable on GT payments).
 *
 * @param {import("pg").PoolClient} client
 * @param {object} payment The updated greentarget.payments row.
 */
export async function updateGTPaymentJournalReference(client, payment) {
  if (!payment.journal_entry_id) {
    return;
  }
  const visibleReference =
    payment.internal_reference || payment.payment_reference || null;
  await client.query(
    `UPDATE greentarget.journal_entries
        SET display_reference = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'posted' AND manual_override = false`,
    [payment.journal_entry_id, visibleReference]
  );
  await client.query(
    `UPDATE greentarget.journal_entry_lines
        SET cheque_reference = $2
      WHERE journal_entry_id = $1 AND debit_amount > 0`,
    [payment.journal_entry_id, payment.payment_reference || null]
  );
}

/**
 * Cancel the payment-owned REC journal (payment cancellation path).
 *
 * @param {import("pg").PoolClient} client
 * @param {number} journalEntryId
 * @returns {Promise<boolean>}
 */
export async function cancelGTPaymentJournalEntry(client, journalEntryId) {
  return cancelGTJournal(client, journalEntryId, {
    entryTypes: ["REC"],
    operation: "Payment journal cancellation",
  });
}

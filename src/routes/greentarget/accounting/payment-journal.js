// src/routes/greentarget/accounting/payment-journal.js
//
// Green Target receipt journal service (phase G7, reshaped by GT-P1). A posted
// `greentarget.receipts` header owns exactly one consolidated `REC` journal —
// the organic analogue of the legacy RV#/#/# family:
//   one aggregate DR PBB_1  /  one CR per invoice allocation's debtor child
// Legacy keyed EVERY receipt against PBB_1 (cash is treated as banked; GT's
// books have no cash-in-hand account and the June BS prints cash in hand
// .00), so all payment methods debit PBB_1. The journal belongs to the
// RECEIPT, never to an individual payment allocation.
//
// Two deliberate rules:
//   * Pending cheques post NOTHING until confirmed; the journal then uses the
//     receipt's posting_date (the actual bank-clearance date).
//   * A payment RECEIVED before the cutover posts NOTHING when its invoice is
//     also pre-cutover: the locked historical ledger remains authoritative and
//     the operational balance update must not duplicate it. A receipt dated on
//     or after the cutover posts normally even when it settles an older bill.
import {
  GREEN_TARGET_ACCOUNTING_OPEN_DATE,
  assertGreenTargetAccountingDateUnlocked,
  toLocalAccountingDateString,
} from "./posting-lock.js";
import { resolveGTReceivableAccount } from "./sales-journal.js";
import {
  ensureGTAccountsExist,
  insertGTJournal,
  replaceGTJournal,
  cancelGTJournal,
} from "./posting-utils.js";

/** GT's one bank account with movement (legacy RV family: 472/472 debits). */
export const GT_BANK_ACCOUNT = "PBB_1";

/**
 * Load the allocations that form one durable GT receipt header.
 *
 * @param {import("pg").PoolClient} client
 * @param {number} receiptId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchGTReceiptAllocations(client, receiptId) {
  const result = await client.query(
    `SELECT p.*, i.invoice_number, i.date_issued, i.customer_id,
            i.debtor_account_code, c.name AS customer_name
       FROM greentarget.payments p
       JOIN greentarget.invoices i ON i.invoice_id = p.invoice_id
       JOIN greentarget.customers c ON c.customer_id = i.customer_id
      WHERE p.receipt_id = $1
        AND COALESCE(p.status, 'active') = 'active'
      ORDER BY p.payment_id
      FOR SHARE OF p, i, c`,
    [receiptId]
  );
  if (result.rows.length === 0) {
    throw Object.assign(
      new Error(`Green Target receipt ${receiptId} has no invoice allocations`),
      { statusCode: 409 }
    );
  }
  return result.rows;
}

/**
 * Post one consolidated REC journal for a GT receipt header. Legacy evidence
 * shows one debtor credit per allocation and exactly one aggregate PBB_1
 * debit, regardless of the received-payment method.
 *
 * @param {import("pg").PoolClient} client
 * @param {Record<string, unknown>} receipt
 * @param {string|null} [createdBy]
 * @returns {Promise<number|null>}
 */
export async function syncGTReceiptJournalEntry(
  client,
  receipt,
  createdBy = null
) {
  if (receipt.status === "pending" || receipt.status === "cancelled") {
    return null;
  }

  const postingDate = toLocalAccountingDateString(
    receipt.posting_date || receipt.received_date
  );
  if (
    receipt.origin === "legacy_operational" &&
    postingDate < GREEN_TARGET_ACCOUNTING_OPEN_DATE
  ) {
    return null;
  }
  const entryDate = assertGreenTargetAccountingDateUnlocked(
    postingDate,
    `Receipt ${receipt.display_reference || receipt.id}`
  );

  const allocations = await fetchGTReceiptAllocations(client, Number(receipt.id));
  let journalId = receipt.journal_entry_id
    ? Number(receipt.journal_entry_id)
    : null;
  if (!journalId) {
    const bySource = await client.query(
      `SELECT id
         FROM greentarget.journal_entries
        WHERE source_type = 'receipt'
          AND source_id = $1
          AND status = 'posted'`,
      [String(receipt.id)]
    );
    journalId = bySource.rows[0]?.id || null;
  }

  if (journalId) {
    const journalResult = await client.query(
      `SELECT id, status, entry_type, source_type, source_id, manual_override
         FROM greentarget.journal_entries
        WHERE id = $1
        FOR UPDATE`,
      [journalId]
    );
    const journal = journalResult.rows[0];
    if (
      !journal ||
      journal.status !== "posted" ||
      journal.entry_type !== "REC" ||
      journal.source_type !== "receipt" ||
      String(journal.source_id) !== String(receipt.id)
    ) {
      throw Object.assign(
        new Error(
          `Receipt ${receipt.display_reference || receipt.id} is linked to an invalid or cancelled journal`
        ),
        { statusCode: 409 }
      );
    }
    if (journal.manual_override) {
      return journalId;
    }
  }

  /** @type {Array<{accountCode: string, credit: number, reference: string, particulars: string}>} */
  const creditLines = [];
  let totalAmount = 0;
  for (const allocation of allocations) {
    const debtorAccount = await resolveGTReceivableAccount(client, allocation);
    const amount = Number(allocation.amount_paid);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(
        new Error(`Receipt allocation ${allocation.payment_id} has an invalid amount`),
        { statusCode: 409 }
      );
    }
    totalAmount += amount;
    const allocationReference = String(allocation.invoice_number);
    creditLines.push({
      accountCode: debtorAccount,
      credit: amount,
      reference: allocationReference,
      particulars: `REF : ${allocationReference} /${allocation.customer_name}`,
    });
  }
  totalAmount = Math.round(totalAmount * 100) / 100;
  if (Math.abs(totalAmount - Number(receipt.total_amount)) > 0.005) {
    throw Object.assign(
      new Error(
        `Receipt ${receipt.display_reference || receipt.id} total does not match its invoice allocations`
      ),
      { statusCode: 409 }
    );
  }

  await ensureGTAccountsExist(client, [
    GT_BANK_ACCOUNT,
    ...creditLines.map((line) => line.accountCode),
  ]);
  const visibleReference = String(receipt.display_reference || "").trim();
  const description = `PBB_1 RECEIPT ${visibleReference}`;
  const lines = [
    ...creditLines,
    {
      accountCode: GT_BANK_ACCOUNT,
      debit: totalAmount,
      reference: visibleReference,
      particulars: description,
      chequeReference: receipt.payment_reference || null,
    },
  ];

  if (!journalId) {
    journalId = await insertGTJournal(client, {
      referenceNo: `GTR-${receipt.id}`,
      entryType: "REC",
      entryDate,
      description,
      displayReference: visibleReference,
      sourceType: "receipt",
      sourceId: String(receipt.id),
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
    `UPDATE greentarget.receipts
        SET journal_entry_id = $1,
            bank_account = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $3`,
    [journalId, GT_BANK_ACCOUNT, receipt.id]
  );
  await client.query(
    `UPDATE greentarget.payments
        SET journal_entry_id = $1,
            bank_account = $2
      WHERE receipt_id = $3`,
    [journalId, GT_BANK_ACCOUNT, receipt.id]
  );
  return journalId;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {Record<string, unknown>} receipt
 * @returns {Promise<void>}
 */
export async function updateGTReceiptJournalReference(client, receipt) {
  if (!receipt.journal_entry_id || receipt.status !== "posted") {
    return;
  }
  await syncGTReceiptJournalEntry(client, receipt, null);
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number|null|undefined} journalEntryId
 * @param {number} receiptId
 * @returns {Promise<boolean>}
 */
export async function cancelGTReceiptJournalEntry(
  client,
  journalEntryId,
  receiptId
) {
  if (!journalEntryId) {
    return false;
  }

  const ownershipResult = await client.query(
    `SELECT entry_type, source_type, source_id
       FROM greentarget.journal_entries
      WHERE id = $1
      FOR UPDATE`,
    [Number(journalEntryId)]
  );
  if (ownershipResult.rows.length === 0) {
    return false;
  }
  const journal = ownershipResult.rows[0];
  if (
    journal.entry_type !== "REC" ||
    journal.source_type !== "receipt" ||
    String(journal.source_id) !== String(receiptId)
  ) {
    throw Object.assign(
      new Error(
        `Refusing to cancel receipt ${receiptId}: journal ${journalEntryId} belongs to another source`
      ),
      { statusCode: 409 }
    );
  }
  return cancelGTJournal(client, Number(journalEntryId), {
    entryTypes: ["REC"],
    operation: "Receipt journal cancellation",
  });
}

// REMOVED (GT-P1, 2026-07-30): the per-PAYMENT journal path
// `syncGTPaymentJournalEntry` / `updateGTPaymentJournalReference` /
// `cancelGTPaymentJournalEntry`, which posted one `REC-{payment_id}` journal
// per allocation. `greentarget.receipts` now owns the journal: one header
// posts exactly ONE consolidated `GTR-{receipt_id}` REC journal with one
// aggregate DR PBB_1 and one debtor credit per allocation, which is the shape
// the legacy RV#/#/# groups actually print. Keeping the old functions exported
// was a live double-post hazard — rewiring either path would have produced two
// journals for the same money. Their only remaining caller was the one-shot
// historical script `dev/import/greentarget-legacy/backfill-g7-organic.mjs`,
// which is now a superseded no-op that documents the same thing.

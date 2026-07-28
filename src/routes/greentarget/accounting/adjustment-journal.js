// src/routes/greentarget/accounting/adjustment-journal.js
//
// Green Target adjustment journal service (phase G7). The legacy GT system
// had NO credit/debit/refund note activity at all (G7 evidence: not one
// adjustment-shaped journal in the import), so these shapes are defined fresh
// as the exact inverse of the sales/receipt shapes:
//   credit_note:  DR revenue / CR receivable   (inverse of the S journal)
//   debit_note:   DR receivable / CR revenue   (the S journal again)
//   refund_note:  DR receivable / CR PBB_1     (inverse of the REC journal)
// receivable = the original invoice's receivable account (approved debtor
// child, else CD_SD). revenue = the revenue account the ORIGINAL INVOICE
// actually posted to — its organic S journal first, then its imported legacy
// journal (display_reference = invoice_number), else the sales resolution
// rule. GT posts gross with no tax line, mirroring sales (no OUTPUT_TAX
// split; TH's tax-aware shapes do not apply to a ledger that has never
// posted tax).
import { assertGreenTargetAccountingDateUnlocked } from "./posting-lock.js";
import {
  resolveGTReceivableAccount,
  resolveGTRevenueAccount,
} from "./sales-journal.js";
import { GT_BANK_ACCOUNT } from "./payment-journal.js";
import {
  ensureGTAccountsExist,
  insertGTJournal,
  cancelGTJournal,
} from "./posting-utils.js";

const ENTRY_TYPES = {
  credit_note: "CN",
  debit_note: "DN",
  refund_note: "RN",
};

/** GT-CN-26-1 -> GT/CN/26/1 (the user-facing document number). */
function formatDisplayReference(docId) {
  return String(docId).split("-").join("/");
}

/**
 * The revenue account the original invoice posted to: its organic S journal
 * first, then its imported legacy journal, else the rule-based resolution.
 *
 * @param {import("pg").PoolClient} client
 * @param {object} invoice The original greentarget.invoices row.
 * @returns {Promise<string>}
 */
async function resolveOriginalRevenueAccount(client, invoice) {
  const organic = await client.query(
    `SELECT l.account_code
       FROM greentarget.journal_entries j
       JOIN greentarget.journal_entry_lines l ON l.journal_entry_id = j.id
      WHERE j.source_type = 'invoice' AND j.source_id = $1
        AND j.status = 'posted' AND l.credit_amount > 0
      ORDER BY j.id DESC
      LIMIT 1`,
    [String(invoice.invoice_id)]
  );
  if (organic.rows.length > 0) {
    return organic.rows[0].account_code;
  }

  const imported = await client.query(
    `SELECT l.account_code
       FROM greentarget.journal_entries j
       JOIN greentarget.journal_entry_lines l ON l.journal_entry_id = j.id
      WHERE j.entry_type = 'IMP' AND j.status = 'posted'
        AND j.display_reference = $1 AND l.credit_amount > 0
      ORDER BY j.entry_date DESC
      LIMIT 1`,
    [invoice.invoice_number]
  );
  if (imported.rows.length > 0) {
    return imported.rows[0].account_code;
  }

  return resolveGTRevenueAccount(client, invoice);
}

/**
 * Post the adjustment-document-owned CN/DN/RN journal. Consolidated wrappers
 * post nothing (their children own the journals).
 *
 * @param {import("pg").PoolClient} client Inside the caller's transaction.
 * @param {object} doc The adjustment document (route-shaped doc object with
 *   id, type, original_invoice_id, date_issued, total_amount, customer_id).
 * @param {object} invoice The original greentarget.invoices row.
 * @param {string|null} [createdBy]
 * @returns {Promise<number|null>} The journal id, or null when nothing posts.
 */
export async function postGTAdjustmentJournalEntry(
  client,
  doc,
  invoice,
  createdBy = null
) {
  if (doc.is_consolidated) {
    return null;
  }
  const entryType = ENTRY_TYPES[doc.type];
  if (!entryType) {
    throw new Error(`Unknown Green Target adjustment type: ${doc.type}`);
  }

  const entryDate = assertGreenTargetAccountingDateUnlocked(
    doc.date_issued,
    `${doc.type.replace("_", " ")} ${doc.id}`
  );

  const receivableAccount = resolveGTReceivableAccount(
    doc.customer_id ?? invoice.customer_id
  );
  const totalAmount = Number(doc.total_amount);
  const displayReference = formatDisplayReference(doc.id);
  const description = `${displayReference} - INV/NO : ${invoice.invoice_number} /${
    doc.customer_name || "CUSTOMER"
  }`;

  let accounts;
  let lines;
  if (doc.type === "refund_note") {
    accounts = [receivableAccount, GT_BANK_ACCOUNT];
    lines = [
      {
        accountCode: receivableAccount,
        debit: totalAmount,
        reference: displayReference,
        particulars: description,
        chequeReference: doc.refund_reference || null,
      },
      {
        accountCode: GT_BANK_ACCOUNT,
        credit: totalAmount,
        reference: displayReference,
        particulars: description,
      },
    ];
  } else {
    const revenueAccount = await resolveOriginalRevenueAccount(client, invoice);
    accounts = [receivableAccount, revenueAccount];
    const revenueLine = {
      accountCode: revenueAccount,
      reference: displayReference,
      particulars: description,
    };
    const receivableLine = {
      accountCode: receivableAccount,
      reference: displayReference,
      particulars: description,
    };
    if (doc.type === "credit_note") {
      revenueLine.debit = totalAmount;
      receivableLine.credit = totalAmount;
    } else {
      receivableLine.debit = totalAmount;
      revenueLine.credit = totalAmount;
    }
    lines = [revenueLine, receivableLine];
  }

  await ensureGTAccountsExist(client, accounts);

  const journalId = await insertGTJournal(client, {
    referenceNo: doc.id,
    entryType,
    entryDate,
    description,
    displayReference,
    sourceType: "adjustment",
    sourceId: doc.id,
    createdBy,
    lines,
  });

  await client.query(
    "UPDATE greentarget.adjustment_documents SET journal_entry_id = $1 WHERE id = $2",
    [journalId, doc.id]
  );
  return journalId;
}

/**
 * Cancel the adjustment-document-owned journal (document cancellation path).
 *
 * @param {import("pg").PoolClient} client
 * @param {number} journalEntryId
 * @returns {Promise<boolean>}
 */
export async function cancelGTAdjustmentJournalEntry(client, journalEntryId) {
  return cancelGTJournal(client, journalEntryId, {
    entryTypes: ["CN", "DN", "RN"],
    operation: "Adjustment journal cancellation",
  });
}

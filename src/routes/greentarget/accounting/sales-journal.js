// src/routes/greentarget/accounting/sales-journal.js
//
// Green Target sales journal service (phase G7). Every organic GT invoice
// dated on/after 2026-07-01 owns exactly one `S` journal, synced from the
// invoice create/update/cancel lifecycle — the GT analogue of TH's
// syncSalesJournalEntry, cloned (never parameterized) per the isolation
// principle.
//
// Journal shape, taken from the imported legacy evidence:
//   credit sales (I#/#):    DR debtor child   / CR note-7 revenue
//   counter sales (#/#):    DR CD_SD          / CR TGA or TGB
// GT posts gross = revenue with NO tax line: the entire import contains zero
// tax postings and all 153 operational invoices carry tax_amount 0.
//
// Account resolution (handover R6 + the debtor-map):
//   receivable = the customer's APPROVED legacy debtor child from
//     debtor-map.json, else CD_SD (the legacy sundry-debtors account that
//     carried every counter sale). No account is ever created here.
//   revenue    = mapped debtor -> WS_OTH (statement sales), or WS_OTH4 for the
//     TH intercompany debtor; unmapped counter sale -> TGB when any linked
//     rental uses a B-prefixed tong (TONG B), else TGA. The B-prefix rule is
//     consistent with all 35 ERP-matched legacy counter sales (every one is
//     TGA with a plain-numbered tong); the TGB branch rests on the structural
//     B1-B17 vs plain-number tong split, documented in the G7 execution
//     record.
import {
  lookupApprovedDebtorMapping,
  GT_SUNDRY_DEBTOR_ACCOUNT,
} from "./debtor-map.js";
import {
  assertGreenTargetAccountingDateUnlocked,
  toLocalAccountingDateString,
} from "./posting-lock.js";
import {
  ensureGTAccountsExist,
  insertGTJournal,
  replaceGTJournal,
  cancelGTJournal,
} from "./posting-utils.js";

/**
 * @param {number|null|undefined} customerId
 * @returns {string} The receivable account for an invoice/payment journal.
 */
export function resolveGTReceivableAccount(customerId) {
  const mapping = lookupApprovedDebtorMapping(customerId);
  return mapping ? mapping.gt_account_code : GT_SUNDRY_DEBTOR_ACCOUNT;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} invoiceId
 * @returns {Promise<boolean>} True when any linked rental uses a B-tong.
 */
async function hasBTongRental(client, invoiceId) {
  const result = await client.query(
    `SELECT EXISTS(
       SELECT 1
         FROM greentarget.invoice_rentals ir
         JOIN greentarget.rentals r ON r.rental_id = ir.rental_id
        WHERE ir.invoice_id = $1
          AND r.tong_no ~ '^B'
     ) AS has_b_tong`,
    [invoiceId]
  );
  return result.rows[0].has_b_tong;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {{invoice_id: number, customer_id: number|null}} invoice
 * @returns {Promise<string>} The revenue account for the invoice journal.
 */
export async function resolveGTRevenueAccount(client, invoice) {
  const mapping = lookupApprovedDebtorMapping(invoice.customer_id);
  if (mapping) {
    return mapping.legacy_code === "TH" ? "WS_OTH4" : "WS_OTH";
  }
  return (await hasBTongRental(client, invoice.invoice_id)) ? "TGB" : "TGA";
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number|null} customerId
 * @returns {Promise<string>}
 */
export async function fetchGTCustomerName(client, customerId) {
  if (customerId === null || customerId === undefined) {
    return "UNKNOWN CUSTOMER";
  }
  const result = await client.query(
    "SELECT name FROM greentarget.customers WHERE customer_id = $1",
    [customerId]
  );
  return result.rows[0]?.name || `CUSTOMER #${customerId}`;
}

/**
 * Create or re-sync the invoice-owned S journal. Skips consolidated wrappers
 * (children keep their own journals) and journals detached by manual_override.
 * Cancels the journal when the invoice is cancelled.
 *
 * @param {import("pg").PoolClient} client Inside the caller's transaction.
 * @param {object} invoice The greentarget.invoices row (snake_case columns).
 * @param {string|null} [createdBy]
 * @returns {Promise<number|null>} The journal id, or null when nothing posts.
 */
export async function syncGTSalesJournalEntry(client, invoice, createdBy = null) {
  if (invoice.is_consolidated) {
    return null;
  }

  const entryDate = assertGreenTargetAccountingDateUnlocked(
    invoice.date_issued,
    `Invoice ${invoice.invoice_number}`
  );

  // Locate the existing journal: the back-link first, then the source
  // ownership index, then adoption by reference_no (TH precedent).
  let journalId = invoice.journal_entry_id || null;
  if (!journalId) {
    const bySource = await client.query(
      `SELECT id FROM greentarget.journal_entries
        WHERE source_type = 'invoice' AND source_id = $1 AND status = 'posted'`,
      [String(invoice.invoice_id)]
    );
    journalId = bySource.rows[0]?.id || null;
  }
  if (!journalId) {
    const byReference = await client.query(
      `SELECT id FROM greentarget.journal_entries
        WHERE reference_no = $1 AND entry_type = 'S' AND status = 'posted'`,
      [invoice.invoice_number]
    );
    journalId = byReference.rows[0]?.id || null;
  }

  if (journalId) {
    const overrideCheck = await client.query(
      "SELECT manual_override FROM greentarget.journal_entries WHERE id = $1",
      [journalId]
    );
    if (overrideCheck.rows[0]?.manual_override) {
      // Hand-edited and detached from the invoice: the sync backs off, but
      // cancellation below still cascades (TH rule).
      if (invoice.status !== "cancelled") {
        return journalId;
      }
    }
  }

  if (invoice.status === "cancelled") {
    if (journalId) {
      await cancelGTJournal(client, journalId, {
        entryTypes: ["S"],
        operation: `Invoice ${invoice.invoice_number} cancellation`,
      });
    }
    return null;
  }

  const receivableAccount = resolveGTReceivableAccount(invoice.customer_id);
  const revenueAccount = await resolveGTRevenueAccount(client, invoice);
  await ensureGTAccountsExist(client, [receivableAccount, revenueAccount]);

  const totalAmount = Number(invoice.total_amount);
  const customerName = await fetchGTCustomerName(client, invoice.customer_id);
  const description = `INV/NO : ${invoice.invoice_number} /${customerName}`;
  const lines = [
    {
      accountCode: receivableAccount,
      debit: totalAmount,
      reference: invoice.invoice_number,
      particulars: description,
    },
    {
      accountCode: revenueAccount,
      credit: totalAmount,
      reference: invoice.invoice_number,
      particulars: description,
    },
  ];

  if (!journalId) {
    journalId = await insertGTJournal(client, {
      referenceNo: invoice.invoice_number,
      entryType: "S",
      entryDate,
      description,
      displayReference: invoice.invoice_number,
      sourceType: "invoice",
      sourceId: String(invoice.invoice_id),
      createdBy,
      lines,
    });
  } else {
    await replaceGTJournal(client, journalId, {
      referenceNo: invoice.invoice_number,
      entryDate,
      description,
      displayReference: invoice.invoice_number,
      lines,
    });
  }

  await client.query(
    "UPDATE greentarget.invoices SET journal_entry_id = $1 WHERE invoice_id = $2",
    [journalId, invoice.invoice_id]
  );
  return journalId;
}

/**
 * Cancel the invoice-owned S journal (invoice deletion path).
 *
 * @param {import("pg").PoolClient} client
 * @param {number} journalEntryId
 * @returns {Promise<boolean>}
 */
export async function cancelGTSalesJournalEntry(client, journalEntryId) {
  return cancelGTJournal(client, journalEntryId, {
    entryTypes: ["S"],
    operation: "Invoice journal cancellation",
  });
}

// Re-export so route wiring can normalize dates without a second import.
export { toLocalAccountingDateString };

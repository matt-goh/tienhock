// src/routes/greentarget/accounting/sales-journal.js
//
// Green Target sales journal service (phase G7). Every organic GT invoice
// dated on/after 2026-07-01 owns exactly one `S` journal, synced from the
// invoice create/update/cancel lifecycle — the GT analogue of TH's
// syncSalesJournalEntry, cloned (never parameterized) per the isolation
// principle.
//
// Journal shape, taken from the imported legacy evidence:
//   DR the selected debtor child / CR the selected TGA, TGB or WS_OTH.
// GT posts gross = revenue with NO tax line: the entire import contains zero
// tax postings and all 153 operational invoices carry tax_amount 0.
//
// Account resolution follows the LEGACY split (restored GT-P7, 31 Jul 2026,
// after measuring the import): a customer with a named trade-debtor account
// posts to it, and a customer without one is a sundry/counter customer that
// posts straight to the CD_SD control - exactly as all 1,011 imported `#/#`
// counter invoices did. The invoice snapshots whichever account was used, and
// the customer holds the reusable default. Nothing is ever auto-created.
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
 * @type {ReadonlySet<string>}
 */
export const GT_INVOICE_REVENUE_ACCOUNTS = new Set([
  "TGA",
  "TGB",
  "WS_OTH",
]);

/**
 * @param {import("pg").PoolClient} client
 * @param {number} invoiceId
 * @returns {Promise<boolean>}
 */
async function hasLegacyBTongRental(client, invoiceId) {
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
 * Historical revenue fallback for invoices created before GT-P1 account
 * snapshots. Named legacy debtors use statement revenue; counter invoices use
 * the evidenced tong split.
 *
 * @param {import("pg").PoolClient} client
 * @param {{invoice_id?: number|null, customer_id?: number|null}} invoice
 * @returns {Promise<string>}
 */
export async function resolveGTLegacyRevenueAccount(client, invoice) {
  const legacyMapping = lookupApprovedDebtorMapping(invoice.customer_id);
  if (legacyMapping) {
    return legacyMapping.legacy_code === "TH" ? "WS_OTH4" : "WS_OTH";
  }
  return (await hasLegacyBTongRental(client, invoice.invoice_id))
    ? "TGB"
    : "TGA";
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string} accountCode
 * @param {boolean} [allowControlAccount]
 * @returns {Promise<string>}
 */
async function validateGTReceivableAccount(
  client,
  accountCode,
  allowControlAccount = false
) {
  const result = await client.query(
    `SELECT ac.code, ac.description, ac.ledger_type, ac.is_active,
            EXISTS (
              SELECT 1
                FROM greentarget.account_codes child
               WHERE child.parent_code = ac.code
                 AND child.is_active = true
            ) AS has_active_children
       FROM greentarget.account_codes ac
      WHERE ac.code = $1
      FOR SHARE`,
    [accountCode]
  );
  const account = result.rows[0];
  if (!account) {
    throw Object.assign(
      new Error(`Green Target debtor account ${accountCode} does not exist`),
      { statusCode: 400 }
    );
  }
  if (
    account.ledger_type !== "TD" ||
    account.is_active !== true ||
    (!allowControlAccount &&
      (account.has_active_children || account.code === "CD_SD"))
  ) {
    throw Object.assign(
      new Error(
        `Green Target debtor account ${accountCode} must be an active trade-debtor leaf account`
      ),
      { statusCode: 400 }
    );
  }
  return account.code;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {{invoice_id?: number|null, customer_id?: number|null, debtor_account_code?: string|null}} invoice
 * @returns {Promise<string>} The receivable account for an invoice/adjustment.
 */
export async function resolveGTReceivableAccount(client, invoice) {
  if (
    !Object.prototype.hasOwnProperty.call(invoice, "debtor_account_code")
  ) {
    const legacyMapping = lookupApprovedDebtorMapping(invoice.customer_id);
    return legacyMapping
      ? legacyMapping.gt_account_code
      : GT_SUNDRY_DEBTOR_ACCOUNT;
  }
  let accountCode = String(invoice.debtor_account_code || "").trim();
  if (!accountCode && invoice.customer_id !== null && invoice.customer_id !== undefined) {
    const mappingResult = await client.query(
      `SELECT debtor_account_code
         FROM greentarget.customers
        WHERE customer_id = $1
        FOR SHARE`,
      [invoice.customer_id]
    );
    accountCode = String(mappingResult.rows[0]?.debtor_account_code || "").trim();
  }
  // No named account = a SUNDRY / counter customer, which posts straight to
  // CD_SD. This is exactly what the legacy system did: all 1,011 imported
  // `#/#` counter invoices debit CD_SD and not one of the 746 CD_SD children
  // carries a single Jan-Jun journal line (those names lived in a separate
  // trade-debtors listing, outside the ledger). Only the ~11 named credit
  // customers of the `I#/#` family ever had their own account. Nothing is
  // auto-created and no name is ever auto-matched (handover R6).
  if (!accountCode) {
    accountCode = GT_SUNDRY_DEBTOR_ACCOUNT;
  }
  return validateGTReceivableAccount(
    client,
    accountCode,
    accountCode === GT_SUNDRY_DEBTOR_ACCOUNT
  );
}

/**
 * @param {import("pg").PoolClient} client
 * @param {{invoice_id?: number|null, customer_id?: number|null, revenue_account_code?: string|null}} invoice
 * @returns {Promise<string>} The snapshotted revenue account.
 */
export async function resolveGTRevenueAccount(client, invoice) {
  if (
    !Object.prototype.hasOwnProperty.call(invoice, "revenue_account_code")
  ) {
    return resolveGTLegacyRevenueAccount(client, invoice);
  }
  const accountCode = String(invoice.revenue_account_code || "").trim();
  if (!GT_INVOICE_REVENUE_ACCOUNTS.has(accountCode)) {
    throw Object.assign(
      new Error("Select TGA, TGB or WS_OTH for the Green Target invoice"),
      { statusCode: 400 }
    );
  }
  await ensureGTAccountsExist(client, [accountCode]);
  return accountCode;
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
      `SELECT status, manual_override
         FROM greentarget.journal_entries
        WHERE id = $1`,
      [journalId]
    );
    if (
      overrideCheck.rows[0]?.status === "cancelled" &&
      invoice.status !== "cancelled"
    ) {
      throw Object.assign(
        new Error(
          `Invoice ${invoice.invoice_number} is linked to a cancelled sales journal and must be resolved before the invoice can be re-synchronised`
        ),
        { statusCode: 409 }
      );
    }
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

  const receivableAccount = await resolveGTReceivableAccount(client, invoice);
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

// src/routes/greentarget/accounting/sales-journal.js
//
// Green Target sales journal service (phase G7). Every organic GT invoice
// dated on/after 2026-07-01 owns exactly one `S` journal, synced from the
// invoice create/update/cancel lifecycle — the GT analogue of TH's
// syncSalesJournalEntry, cloned (never parameterized) per the isolation
// principle.
//
// Journal shape, taken from the imported legacy evidence:
//   DR the actual GL receivable once / CR one or more ordered TGA, TGB or
//   WS_OTH allocations. CD/SD identities post to the CD_SD control and are
//   retained independently on the receivable line for the sub-schedule.
// GT posts gross = revenue with NO tax line: the entire import contains zero
// tax postings and all 153 operational invoices carry tax_amount 0.
//
// debtor_account_code is a logical identity. receivable_account_code is the
// immutable GL snapshot: a named debtor maps to itself, while a CD/SD identity
// maps to CD_SD. New invoices may never silently fall back to an unallocated
// CD_SD line.
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

/** @type {ReadonlySet<string>} */
const GT_STORED_REVENUE_ACCOUNTS = new Set([
  ...GT_INVOICE_REVENUE_ACCOUNTS,
  "WS_OTH4",
]);

/**
 * Normalize and balance ordered invoice revenue rows in integer cents.
 * Duplicate account codes are deliberate: fourteen imported invoices have
 * two separate credits to the same account.
 *
 * @param {unknown} rawSplits
 * @param {number|string} invoiceTotal
 * @param {{allowLegacyAccounts?: boolean}} [options]
 * @returns {Array<{line_number: number, account_code: string, amount: number}>}
 */
export function normalizeGTRevenueSplits(
  rawSplits,
  invoiceTotal,
  options = {}
) {
  if (!Array.isArray(rawSplits) || rawSplits.length === 0) {
    throw Object.assign(
      new Error("Add at least one Green Target revenue allocation"),
      { statusCode: 400 }
    );
  }

  const allowedAccounts = options.allowLegacyAccounts
    ? GT_STORED_REVENUE_ACCOUNTS
    : GT_INVOICE_REVENUE_ACCOUNTS;
  const normalized = rawSplits.map((rawSplit, index) => {
    const split =
      rawSplit && typeof rawSplit === "object" && !Array.isArray(rawSplit)
        ? rawSplit
        : {};
    const accountCode = String(split.account_code || "").trim();
    const numericAmount = Number(split.amount);
    const amountCents = Math.round(numericAmount * 100);
    if (!allowedAccounts.has(accountCode)) {
      throw Object.assign(
        new Error(
          `Revenue allocation ${index + 1} must use TGA, TGB or WS_OTH`
        ),
        { statusCode: 400 }
      );
    }
    if (!Number.isFinite(numericAmount) || amountCents <= 0) {
      throw Object.assign(
        new Error(`Revenue allocation ${index + 1} must be greater than zero`),
        { statusCode: 400 }
      );
    }
    if (Math.abs(numericAmount * 100 - amountCents) > 1e-7) {
      throw Object.assign(
        new Error(
          `Revenue allocation ${index + 1} must use no more than two decimal places`
        ),
        { statusCode: 400 }
      );
    }
    return {
      line_number: index + 1,
      account_code: accountCode,
      amount: amountCents / 100,
    };
  });

  const invoiceCents = Math.round(Number(invoiceTotal) * 100);
  const allocatedCents = normalized.reduce(
    (sum, split) => sum + Math.round(split.amount * 100),
    0
  );
  if (!Number.isFinite(Number(invoiceTotal)) || allocatedCents !== invoiceCents) {
    throw Object.assign(
      new Error(
        `Revenue allocations must equal the invoice total exactly (allocated ${(allocatedCents / 100).toFixed(
          2
        )}, invoice ${(invoiceCents / 100).toFixed(2)})`
      ),
      { statusCode: 400 }
    );
  }
  return normalized;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} invoiceId
 * @param {Array<{line_number: number, account_code: string, amount: number}>} splits
 * @returns {Promise<void>}
 */
export async function replaceGTInvoiceRevenueSplits(client, invoiceId, splits) {
  await client.query(
    "DELETE FROM greentarget.invoice_revenue_splits WHERE invoice_id = $1",
    [invoiceId]
  );
  for (const split of splits) {
    await client.query(
      `INSERT INTO greentarget.invoice_revenue_splits (
         invoice_id, line_number, account_code, amount
       ) VALUES ($1, $2, $3, $4)`,
      [
        invoiceId,
        split.line_number,
        split.account_code,
        split.amount.toFixed(2),
      ]
    );
  }
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} invoiceId
 * @returns {Promise<Array<{line_number: number, account_code: string, amount: number}>>}
 */
export async function fetchGTInvoiceRevenueSplits(client, invoiceId) {
  const result = await client.query(
    `SELECT line_number, account_code, amount
       FROM greentarget.invoice_revenue_splits
      WHERE invoice_id = $1
      ORDER BY line_number`,
    [invoiceId]
  );
  return result.rows.map((row) => ({
    line_number: Number(row.line_number),
    account_code: row.account_code,
    amount: Number(row.amount),
  }));
}

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
 * @param {{invoice_id?: number|null, customer_id?: number|null,
 *   debtor_account_code?: string|null, receivable_account_code?: string|null,
 *   date_issued?: string|Date|null, status?: string|null}} invoice
 * @returns {Promise<{debtorAccountCode: string, receivableAccountCode: string,
 *   debtorSubledgerCode: string}>}
 */
export async function resolveGTDebtorAssignment(client, invoice) {
  let debtorCode = String(invoice.debtor_account_code || "").trim();
  if (
    !debtorCode &&
    invoice.customer_id !== null &&
    invoice.customer_id !== undefined
  ) {
    const mappingResult = await client.query(
      `SELECT debtor_account_code
         FROM greentarget.customers
        WHERE customer_id = $1
        FOR SHARE`,
      [invoice.customer_id]
    );
    debtorCode = String(
      mappingResult.rows[0]?.debtor_account_code || ""
    ).trim();
  }
  if (!debtorCode) {
    throw Object.assign(
      new Error(
        "Select a named or CD/SD debtor identity for the Green Target invoice"
      ),
      { statusCode: 400 }
    );
  }

  const result = await client.query(
    `SELECT registry.code, registry.description,
            registry.control_account_code, registry.kind,
            registry.effective_from, registry.effective_to,
            registry.is_active, registry.is_selectable,
            account.is_active AS control_is_active
       FROM greentarget.debtor_subledger_registry registry
       JOIN greentarget.account_codes account
         ON account.code = registry.control_account_code
      WHERE registry.code = $1
      FOR SHARE OF registry, account`,
    [debtorCode]
  );
  const registry = result.rows[0];
  if (!registry) {
    throw Object.assign(
      new Error(`Green Target debtor identity ${debtorCode} does not exist`),
      { statusCode: 400 }
    );
  }
  const allowHistoricalControl =
    debtorCode === GT_SUNDRY_DEBTOR_ACCOUNT && invoice.status === "cancelled";
  if (
    registry.is_active !== true ||
    registry.control_is_active !== true ||
    (registry.is_selectable !== true && !allowHistoricalControl)
  ) {
    throw Object.assign(
      new Error(
        `Green Target debtor identity ${debtorCode} is not available for posting`
      ),
      { statusCode: 400 }
    );
  }

  const accountingDate = invoice.date_issued
    ? toLocalAccountingDateString(invoice.date_issued)
    : null;
  if (
    accountingDate &&
    (accountingDate < toLocalAccountingDateString(registry.effective_from) ||
      (registry.effective_to &&
        accountingDate >= toLocalAccountingDateString(registry.effective_to)))
  ) {
    throw Object.assign(
      new Error(
        `Green Target debtor identity ${debtorCode} is not effective on ${accountingDate}`
      ),
      { statusCode: 400 }
    );
  }

  const snapshottedReceivable = String(
    invoice.receivable_account_code || ""
  ).trim();
  if (
    snapshottedReceivable &&
    snapshottedReceivable !== registry.control_account_code
  ) {
    throw Object.assign(
      new Error(
        `Invoice debtor identity ${debtorCode} disagrees with its receivable snapshot ${snapshottedReceivable}`
      ),
      { statusCode: 409 }
    );
  }
  return {
    debtorAccountCode: registry.code,
    receivableAccountCode:
      snapshottedReceivable || registry.control_account_code,
    debtorSubledgerCode: registry.code,
  };
}

/**
 * @param {import("pg").PoolClient} client
 * @param {{invoice_id?: number|null, customer_id?: number|null, debtor_account_code?: string|null}} invoice
 * @returns {Promise<string>} The receivable account for an invoice/adjustment.
 */
export async function resolveGTReceivableAccount(client, invoice) {
  const assignment = await resolveGTDebtorAssignment(client, invoice);
  return assignment.receivableAccountCode;
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
 * Load the authoritative ordered revenue rows. The scalar is retained only as
 * a compatibility fallback for an invoice created before the split table was
 * introduced.
 *
 * @param {import("pg").PoolClient} client
 * @param {{invoice_id?: number|null, customer_id?: number|null,
 *   revenue_account_code?: string|null, total_amount: number|string}} invoice
 * @returns {Promise<Array<{line_number: number, account_code: string, amount: number}>>}
 */
export async function resolveGTInvoiceRevenueSplits(client, invoice) {
  if (invoice.invoice_id !== null && invoice.invoice_id !== undefined) {
    const storedSplits = await fetchGTInvoiceRevenueSplits(
      client,
      Number(invoice.invoice_id)
    );
    if (storedSplits.length > 0) {
      return normalizeGTRevenueSplits(storedSplits, invoice.total_amount, {
        allowLegacyAccounts: true,
      });
    }
  }
  const revenueAccount = await resolveGTRevenueAccount(client, invoice);
  return normalizeGTRevenueSplits(
    [
      {
        line_number: 1,
        account_code: revenueAccount,
        amount: Number(invoice.total_amount),
      },
    ],
    invoice.total_amount,
    { allowLegacyAccounts: revenueAccount === "WS_OTH4" }
  );
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

  const debtorAssignment = await resolveGTDebtorAssignment(client, invoice);
  const revenueSplits = await resolveGTInvoiceRevenueSplits(client, invoice);
  await ensureGTAccountsExist(client, [
    debtorAssignment.receivableAccountCode,
    ...revenueSplits.map((split) => split.account_code),
  ]);

  const totalAmount = Number(invoice.total_amount);
  const customerName = await fetchGTCustomerName(client, invoice.customer_id);
  const description = `INV/NO : ${invoice.invoice_number} /${customerName}`;
  const lines = [
    {
      accountCode: debtorAssignment.receivableAccountCode,
      debit: totalAmount,
      reference: invoice.invoice_number,
      particulars: description,
      debtorSubledgerCode: debtorAssignment.debtorSubledgerCode,
    },
    ...revenueSplits.map((split) => ({
      accountCode: split.account_code,
      credit: split.amount,
      reference: invoice.invoice_number,
      particulars: description,
    })),
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
    `UPDATE greentarget.invoices
        SET journal_entry_id = $1,
            receivable_account_code = $2
      WHERE invoice_id = $3`,
    [journalId, debtorAssignment.receivableAccountCode, invoice.invoice_id]
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

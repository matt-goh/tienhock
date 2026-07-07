// src/routes/accounting/sales-journal.js
// Helper module for auto-generating sales journal entries (entry_type 'S') from invoices.
//
// Journal shape (one per invoice):
//   DR Trade Receivables (TR)
//   CR CASH_SALES  (for CASH invoices / cash bills)
//   CR CR_SALES    (for INVOICE / credit invoices)
//
// reference_no is the invoice id itself (journal_entries.reference_no is UNIQUE and
// invoice ids are unique + never reused), so the Account Ledger's JOURNAL column shows
// the bill number, matching the legacy ledger printout. Because the reference must stay
// equal to the invoice id, edits UPDATE the existing journal in place (amounts, revenue
// account, entry_date, particulars) rather than cancel + repost.

/**
 * Convert a unix-ms timestamp (invoices.createddate) to a local yyyy-MM-dd date string.
 * Uses LOCAL getters (server runs Asia/Kuala_Lumpur) — never toISOString(), which would
 * shift the date back a day for early-morning timestamps (CLAUDE.md rule 17).
 */
function toLocalDateString(createddate) {
  const d = new Date(Number(createddate));
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid invoice createddate: ${createddate}`);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validate that all given account codes exist and are active.
 */
async function ensureAccountsExist(client, codes) {
  const result = await client.query(
    `SELECT code FROM account_codes WHERE code = ANY($1::varchar[]) AND is_active = true`,
    [codes]
  );
  const found = result.rows.map((r) => r.code);
  const missing = codes.filter((c) => !found.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `Required account codes not found or inactive: ${missing.join(", ")}`
    );
  }
}

/**
 * Resolve the customer display name (falls back to the customer id).
 */
async function resolveCustomerName(client, customerid) {
  if (!customerid) return "";
  const result = await client.query(
    `SELECT name FROM customers WHERE id = $1`,
    [customerid]
  );
  return result.rows[0]?.name || String(customerid);
}

/**
 * Creates, updates, or cancels the sales journal entry for an invoice so it always
 * mirrors the invoice's current state. Single entry point used by every invoice endpoint.
 *
 * @param {Object} client - PostgreSQL client (inside a transaction)
 * @param {Object} invoice - { id, paymenttype, totalamountpayable, createddate, customerid, is_consolidated }
 * @param {string|null} createdBy - user id
 * @returns {number|null} journal_entry_id (null when skipped)
 */
export async function syncSalesJournalEntry(client, invoice, createdBy = null) {
  // Consolidated wrapper invoices never post a sales journal (their child invoices did).
  if (invoice.is_consolidated) {
    return null;
  }

  const amount =
    Math.round(parseFloat(invoice.totalamountpayable || 0) * 100) / 100;

  const isCash = invoice.paymenttype === "CASH";
  const revenueAccount = isCash ? "CASH_SALES" : "CR_SALES";
  const debitAccount = "TR";

  // Find any existing journal for this invoice.
  const existingResult = await client.query(
    `SELECT journal_entry_id FROM invoices WHERE id = $1`,
    [invoice.id]
  );
  const existingJournalId = existingResult.rows[0]?.journal_entry_id || null;

  // Amount is zero → nothing to post. Cancel an existing journal if present.
  if (amount <= 0) {
    if (existingJournalId) {
      await client.query(
        `UPDATE journal_entries
            SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND entry_type = 'S'`,
        [existingJournalId]
      );
    }
    return existingJournalId;
  }

  await ensureAccountsExist(client, [debitAccount, revenueAccount]);

  const entryDate = toLocalDateString(invoice.createddate);
  const customerName = await resolveCustomerName(client, invoice.customerid);
  const particulars = isCash
    ? `CASH BILL ${invoice.id}${customerName ? ` ${customerName}` : ""}`
    : `CR SALES ${invoice.id}${customerName ? ` ${customerName}` : ""}`;

  if (existingJournalId) {
    // Update the existing journal in place (reference_no never changes).
    await client.query(
      `UPDATE journal_entries
          SET entry_date = $1, description = $2,
              total_debit = $3, total_credit = $3,
              status = 'posted', updated_at = NOW()
        WHERE id = $4`,
      [entryDate, particulars, amount, existingJournalId]
    );

    // Line 1: DR Trade Receivables
    await client.query(
      `UPDATE journal_entry_lines
          SET debit_amount = $1, credit_amount = 0, particulars = $2
        WHERE journal_entry_id = $3 AND line_number = 1`,
      [amount, particulars, existingJournalId]
    );

    // Line 2: CR revenue account (handles CASH_SALES <-> CR_SALES swap)
    await client.query(
      `UPDATE journal_entry_lines
          SET account_code = $1, debit_amount = 0, credit_amount = $2, particulars = $3
        WHERE journal_entry_id = $4 AND line_number = 2`,
      [revenueAccount, amount, particulars, existingJournalId]
    );

    return existingJournalId;
  }

  // No existing journal → create one.
  let journalEntryId;
  try {
    const entryResult = await client.query(
      `INSERT INTO journal_entries (
         reference_no, entry_type, entry_date, description,
         total_debit, total_credit, status, created_at, created_by
       )
       VALUES ($1, 'S', $2, $3, $4, $4, 'posted', NOW(), $5)
       RETURNING id`,
      [String(invoice.id), entryDate, particulars, amount, createdBy]
    );
    journalEntryId = entryResult.rows[0].id;
  } catch (error) {
    if (error.code === "23505") {
      throw new Error(
        `Cannot post sales journal: reference "${invoice.id}" is already used by another journal (likely a PUR entry). Rename that journal's reference first.`
      );
    }
    throw error;
  }

  await client.query(
    `INSERT INTO journal_entry_lines (
       journal_entry_id, line_number, account_code,
       debit_amount, credit_amount, reference, particulars, created_at
     )
     VALUES
       ($1, 1, $2, $3, 0, $4, $5, NOW()),
       ($1, 2, $6, 0, $3, $4, $5, NOW())`,
    [journalEntryId, debitAccount, amount, String(invoice.id), particulars, revenueAccount]
  );

  await client.query(
    `UPDATE invoices SET journal_entry_id = $1 WHERE id = $2`,
    [journalEntryId, invoice.id]
  );

  console.log(`✓ Sales journal ${invoice.id} synced (${revenueAccount}, ${amount})`);
  return journalEntryId;
}

/**
 * Cancels the sales journal entry (sets status='cancelled').
 * Used when an invoice is cancelled.
 *
 * @param {Object} client - PostgreSQL client
 * @param {number} journalEntryId - Journal entry ID to cancel
 * @returns {boolean} success
 */
export async function cancelSalesJournalEntry(client, journalEntryId) {
  if (!journalEntryId) {
    return false;
  }

  const result = await client.query(
    `UPDATE journal_entries
        SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND entry_type = 'S' AND status = 'posted'
      RETURNING id, reference_no`,
    [journalEntryId]
  );

  if (result.rows.length > 0) {
    console.log(`✓ Cancelled sales journal ${result.rows[0].reference_no}`);
    return true;
  }
  return false;
}

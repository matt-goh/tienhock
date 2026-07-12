// src/routes/accounting/sales-journal.js
// Invoice-owned accounting service (entry_type 'S'). One journal per invoice,
// synced from every lifecycle path (create, batch create, order-total resync,
// edit, date change, payment-type conversion, cancellation).
//
// Journal shape (frozen contract, docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §4a):
//   INVOICE (credit sale):        DR TR / CR CR_SALES  (permanent revenue row)
//   CASH bill, fully auto-collected:  DR CH_REV1 / CR CASH_SALES
//   CASH bill with genuine receipts (e.g. INVOICE->CASH conversion after real
//   payments): 4-line  DR TR total / CR CASH_SALES total / DR CH_REV1 auto /
//   CR TR auto — the genuine receipts' own CR TR lines close the remainder.
//   Zero-value invoice:           same shape with 0.00 lines (informational
//   ledger rows; no balance effect).
//
// The service also owns the automatic CASH-bill collection row in `payments`
// (is_auto_collection = true): exactly one active row for the auto-collected
// amount, dated to the invoice's LOCAL date, with NO journal of its own — the
// invoice journal carries the CH_REV1 collection. Genuine receipts are never
// touched here.
//
// reference_no = the invoice id (unique, never reused), so the ledger JOURNAL
// column shows the bill number. display_reference mirrors it; the description
// honours the persisted override `invoices.accounting_description`.
//
// Phase 6: the receivable side posts to the CUSTOMER's debtor child account
// (resolved/ensured via debtorSync; TR only as a warned fallback), so each
// customer's Account Ledger shows the invoice and its immediate settlement.

import { getCustomerDebtorAccountCode } from "./debtorSync.js";

/**
 * Convert a unix-ms timestamp (invoices.createddate) to a local yyyy-MM-dd date string.
 * Uses LOCAL getters (server runs Asia/Kuala_Lumpur) — never toISOString(), which would
 * shift the date back a day for early-morning timestamps (CLAUDE.md rule 17).
 */
export function invoiceLocalDateString(createddate) {
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

const round2 = (v) => Math.round(parseFloat(v || 0) * 100) / 100;

/**
 * Creates or updates the invoice-owned journal AND maintains the automatic
 * CASH-bill collection payment row. Call after the invoice row reflects the
 * new state (inside the caller's transaction). Fields passed on `invoice`
 * override the freshly loaded DB row (callers pass values they just changed).
 *
 * @param {Object} client - PostgreSQL client (inside a transaction)
 * @param {Object} invoice - at minimum { id }; any of paymenttype,
 *   totalamountpayable, createddate, customerid, is_consolidated,
 *   accounting_description override the DB row
 * @param {string|null} createdBy - user id
 * @returns {number|null} journal_entry_id (null when skipped)
 */
export async function syncSalesJournalEntry(client, invoice, createdBy = null) {
  const dbResult = await client.query(
    `SELECT id, paymenttype, totalamountpayable, createddate, customerid,
            is_consolidated, invoice_status, accounting_description, journal_entry_id
       FROM invoices WHERE id = $1`,
    [invoice.id]
  );
  if (dbResult.rows.length === 0) {
    throw new Error(`Invoice ${invoice.id} not found for journal sync`);
  }
  const inv = { ...dbResult.rows[0], ...invoice };

  // Consolidated wrapper invoices never post a sales journal (their child invoices did).
  if (inv.is_consolidated) {
    return null;
  }

  let journalEntryId = dbResult.rows[0].journal_entry_id || null;

  // Adopt a pre-column legacy journal that shares the invoice reference.
  if (!journalEntryId) {
    const legacy = await client.query(
      `SELECT id FROM journal_entries WHERE reference_no = $1 AND entry_type = 'S'`,
      [String(inv.id)]
    );
    if (legacy.rows.length > 0) {
      journalEntryId = legacy.rows[0].id;
    }
  }

  // A cancelled invoice keeps a cancelled journal; nothing to (re)post.
  if (inv.invoice_status === "cancelled") {
    if (journalEntryId) {
      await cancelSalesJournalEntry(client, journalEntryId);
    }
    await cancelAutoCollections(client, inv.id, "Invoice cancelled");
    return journalEntryId;
  }

  const amount = round2(inv.totalamountpayable);
  const isCash = inv.paymenttype === "CASH";
  const entryDate = invoiceLocalDateString(inv.createddate);
  const customerId = inv.customerid ? String(inv.customerid) : "";
  const description =
    inv.accounting_description ||
    (isCash
      ? `CASH BILL: ${inv.id}${customerId ? ` - ${customerId}` : ""}`
      : `INV/NO: ${inv.id}${customerId ? ` - ${customerId}` : ""}`);

  // Genuine receipts against this invoice (non-auto). Active ones credit TR
  // themselves, so a CASH bill only auto-collects the remainder. A PENDING
  // genuine receipt (uncleared cheque) means the collection is NOT cash —
  // suppress auto-collection entirely and leave the balance on TR until the
  // cheque clears.
  const genuineResult = await client.query(
    `SELECT
        COALESCE(SUM(amount_paid) FILTER (WHERE status IS NULL OR status = 'active'), 0) AS paid,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending
       FROM payments
      WHERE invoice_id = $1
        AND is_auto_collection = false
        AND (status IS NULL OR status IN ('active', 'pending'))`,
    [inv.id]
  );
  const genuinePaid = round2(genuineResult.rows[0].paid);
  const pendingCount = parseInt(genuineResult.rows[0].pending, 10) || 0;

  if (isCash && genuinePaid > amount + 0.005) {
    throw new Error(
      `Invoice ${inv.id}: recorded receipts (${genuinePaid.toFixed(2)}) exceed the new invoice total (${amount.toFixed(2)}). Cancel or adjust the receipts first.`
    );
  }

  const autoAmount =
    isCash && pendingCount === 0 ? round2(Math.max(0, amount - genuinePaid)) : 0;

  // Receivable side = the customer's own debtor child account (Phase 6).
  const debtor = await getCustomerDebtorAccountCode(client, inv.customerid);

  // ----- Build the line set -----
  // [account, debit, credit]
  // CASH bills post the full four-line contract: DR debtor for the sale,
  // CR CASH_SALES, then DR CH_REV1 / CR debtor for the automatic collection —
  // the customer ledger shows the invoice AND its immediate settlement while
  // CH_REV1/CASH_SALES keep exactly one row each. Zero bills stay as the
  // two informational 0.00 lines.
  let lines;
  if (!isCash) {
    lines = [
      [debtor, amount, 0],
      ["CR_SALES", 0, amount],
    ];
  } else if (amount > 0) {
    lines = [
      [debtor, amount, 0],
      ["CASH_SALES", 0, amount],
    ];
    if (autoAmount > 0) {
      lines.push(["CH_REV1", autoAmount, 0]);
      lines.push([debtor, 0, autoAmount]);
    }
  } else {
    lines = [
      ["CH_REV1", 0, 0],
      ["CASH_SALES", 0, 0],
    ];
  }

  await ensureAccountsExist(client, [...new Set(lines.map((l) => l[0]))]);

  const totalDebit = round2(lines.reduce((s, l) => s + l[1], 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l[2], 0));

  if (journalEntryId) {
    await client.query(
      `UPDATE journal_entries
          SET entry_date = $1, description = $2,
              total_debit = $3, total_credit = $4,
              display_reference = $5, source_type = 'invoice', source_id = $5,
              status = 'posted', updated_at = NOW()
        WHERE id = $6`,
      [entryDate, description, totalDebit, totalCredit, String(inv.id), journalEntryId]
    );
    // Rebuild lines (the line count varies between the 2- and 4-line shapes).
    await client.query(
      `DELETE FROM journal_entry_lines WHERE journal_entry_id = $1`,
      [journalEntryId]
    );
  } else {
    try {
      const entryResult = await client.query(
        `INSERT INTO journal_entries (
           reference_no, entry_type, entry_date, description,
           total_debit, total_credit, status, display_reference,
           source_type, source_id, created_at, created_by
         )
         VALUES ($1, 'S', $2, $3, $4, $5, 'posted', $1, 'invoice', $1, NOW(), $6)
         RETURNING id`,
        [String(inv.id), entryDate, description, totalDebit, totalCredit, createdBy]
      );
      journalEntryId = entryResult.rows[0].id;
    } catch (error) {
      if (error.code === "23505") {
        throw new Error(
          `Cannot post sales journal: reference "${inv.id}" is already used by another journal (likely a PUR entry). Rename that journal's reference first.`
        );
      }
      throw error;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const [account, debit, credit] = lines[i];
    await client.query(
      `INSERT INTO journal_entry_lines (
         journal_entry_id, line_number, account_code,
         debit_amount, credit_amount, reference, particulars, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [journalEntryId, i + 1, account, debit, credit, String(inv.id), description]
    );
  }

  await client.query(
    `UPDATE invoices SET journal_entry_id = $1 WHERE id = $2`,
    [journalEntryId, inv.id]
  );

  // ----- Maintain the automatic collection payment row (CASH bills only) -----
  await syncAutoCollectionRow(client, inv, autoAmount, entryDate);

  return journalEntryId;
}

/**
 * Ensures exactly one active auto-collection payments row of `autoAmount`
 * (dated to the invoice's local date) when required, none otherwise.
 * Auto rows are non-posting: journal_entry_id stays NULL — the invoice journal
 * carries the CH_REV1 collection. A legacy journal still attached to an auto
 * row is cancelled defensively (pre-migration data).
 */
async function syncAutoCollectionRow(client, inv, autoAmount, entryDate) {
  const existing = await client.query(
    `SELECT payment_id, amount_paid, payment_date, journal_entry_id
       FROM payments
      WHERE invoice_id = $1
        AND is_auto_collection = true
        AND (status IS NULL OR status = 'active')
      ORDER BY payment_id
      FOR UPDATE`,
    [inv.id]
  );
  const rows = existing.rows;

  const toLocalDate = (v) => {
    if (v instanceof Date) {
      return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    }
    return String(v).slice(0, 10);
  };

  const wantRow = autoAmount > 0;
  const matches =
    wantRow &&
    rows.length === 1 &&
    round2(rows[0].amount_paid) === autoAmount &&
    rows[0].journal_entry_id === null &&
    toLocalDate(rows[0].payment_date) === entryDate;

  if (matches) return;
  if (!wantRow && rows.length === 0) return;

  for (const row of rows) {
    await client.query(
      `UPDATE payments
          SET status = 'cancelled', cancellation_date = NOW(),
              cancellation_reason = 'Superseded automatic collection (invoice resync)'
        WHERE payment_id = $1`,
      [row.payment_id]
    );
    if (row.journal_entry_id) {
      await client.query(
        `UPDATE journal_entries SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND status = 'posted'`,
        [row.journal_entry_id]
      );
    }
  }

  if (wantRow) {
    await client.query(
      `INSERT INTO payments (
         invoice_id, payment_date, amount_paid, payment_method,
         payment_reference, bank_account, notes, status, is_auto_collection
       ) VALUES ($1, $2, $3, 'cash', NULL, 'CASH', 'Automatic payment for CASH invoice', 'active', true)`,
      [inv.id, entryDate, autoAmount]
    );
  }
}

/**
 * Cancels all active auto-collection rows for an invoice (used on cancellation).
 */
async function cancelAutoCollections(client, invoiceId, reason) {
  const rows = await client.query(
    `UPDATE payments
        SET status = 'cancelled', cancellation_date = NOW(), cancellation_reason = $2
      WHERE invoice_id = $1
        AND is_auto_collection = true
        AND (status IS NULL OR status = 'active')
      RETURNING journal_entry_id`,
    [invoiceId, reason]
  );
  for (const row of rows.rows) {
    if (row.journal_entry_id) {
      await client.query(
        `UPDATE journal_entries SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND status = 'posted'`,
        [row.journal_entry_id]
      );
    }
  }
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

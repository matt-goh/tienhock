import { createHash } from "node:crypto";
import { getReceiptGroup, cancelReceiptGroup, createReceipt } from "./receipt-service.js";
import { resolveDebtorChildCode } from "./debtorSync.js";
import { assertTienHockAccountingDateUnlocked, toLocalAccountingDateString } from "./posting-lock.js";

/**
 * @typedef {import('pg').PoolClient} Client
 * @typedef {{id: number, payment_method: string, debit_account: string, display_reference: string|null, cheque_reference: string|null, received_date: Date, posting_date: Date|null, status: string, origin: string, total_amount: string, journal_entry_id: number, description: string, description_overridden: boolean, notes: string|null}} Receipt
 * @typedef {{id: number, receipt_id: number, allocation_type: string, invoice_id: string, customer_id: string, amount: string, applied_amount: string, refunded_amount: string}} Allocation
 * @typedef {{id: number, source_type: string, source_id: string, status: string, entry_type: string, entry_date: Date, manual_override: boolean, total_debit: string, total_credit: string}} Journal
 * @typedef {{journal_entry_id: number, account_code: string, debit_amount: string, credit_amount: string}} JournalLine
 * @typedef {{id: string, paymenttype: string, customerid: string, invoice_status: string, balance_due: string, totalamountpayable: string}} Invoice
 * @typedef {{receipt_allocation_id: number, invoice_id: string, amount_paid: string, status: string, is_auto_collection: boolean, payment_method: string, payment_date: Date, recorded_payment_date: string, bank_account: string}} Payment
 * @typedef {{version: string, reference: string, payment_method: string, received_date: string, bank_account: string, total_amount: number, requires_journal_review: boolean, journals: Array<{id: number, entry_date: string, manual_override: boolean}>, allocations: Array<{invoice_id: string, customer_id: string, amount: string}>, receipts: Receipt[], allocation_rows: Allocation[]}} CorrectionPreview
 */

/** @param {string|number} value @returns {number} */
const cents = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new Error("Invalid payment amount. Ask the accountant to review this payment.");
  }
  return Math.round(amount * 100);
};

/**
 * Read-only preview; the mutation repeats it with locks in a SERIALIZABLE
 * transaction. Hash the actual rows (including journal lines) so a stale
 * preview cannot approve different accounting or different group membership.
 * @param {Client} client
 * @param {number} receiptId
 * @param {boolean} lock
 * @returns {Promise<CorrectionPreview>}
 */
export async function previewReceiptCorrection(client, receiptId, lock = false) {
  const group = await getReceiptGroup(client, receiptId);
  if (group.origin !== "erp" || group.status !== "posted" ||
      !["online", "bank_transfer"].includes(group.payment_method)) {
    throw new Error("Only a fully settled online or bank-transfer payment group can be corrected to a pending cheque here.");
  }
  if (!group.display_reference?.trim()) {
    throw new Error("Set a payment reference before correcting this payment.");
  }
  /** @type {number[]} */
  const ids = group.receipt_ids;
  const lockSql = lock ? " FOR UPDATE" : "";
  /** @type {{rows: Receipt[]}} */
  const receipts = await client.query(`SELECT * FROM receipts WHERE id = ANY($1::int[]) ORDER BY id${lockSql}`, [ids]);
  /** @type {{rows: Allocation[]}} */
  const allocations = await client.query(`SELECT * FROM receipt_allocations WHERE receipt_id = ANY($1::int[]) ORDER BY receipt_id, line_number${lockSql}`, [ids]);
  if (!allocations.rows.length || allocations.rows.some((row) => row.allocation_type !== "invoice" || cents(row.applied_amount) || cents(row.refunded_amount))) {
    throw new Error("This correction supports invoice payments only. Payments with excess money or account allocations need an accountant's review.");
  }
  /** @type {number[]} */
  const journalIds = receipts.rows.map((row) => row.journal_entry_id);
  /** @type {{rows: Journal[]}} */
  const journals = await client.query(`SELECT * FROM journal_entries WHERE id = ANY($1::int[]) ORDER BY id${lockSql}`, [journalIds]);
  /** @type {{rows: JournalLine[]}} */
  const lines = await client.query(`SELECT * FROM journal_entry_lines WHERE journal_entry_id = ANY($1::int[]) ORDER BY journal_entry_id, line_number, id${lockSql}`, [journalIds]);
  /** @type {{rows: Payment[]}} */
  const payments = await client.query(`SELECT *, payment_date::date::text AS recorded_payment_date FROM payments WHERE receipt_allocation_id = ANY($1::int[]) ORDER BY payment_id${lockSql}`, [allocations.rows.map((row) => row.id)]);
  /** @type {string[]} */
  const invoiceIds = [...new Set(allocations.rows.map((row) => row.invoice_id))].sort();
  /** @type {{rows: Invoice[]}} */
  const invoices = await client.query(`SELECT * FROM invoices WHERE id = ANY($1::varchar[]) ORDER BY id${lockSql}`, [invoiceIds]);
  /** @type {Map<string, string>} */
  const debtorCodes = new Map();
  for (const invoice of invoices.rows) {
    if (invoice.paymenttype !== "INVOICE" || invoice.invoice_status === "cancelled") {
      throw new Error(`Invoice ${invoice.id}: only active credit invoices can be changed to pending cheque payments.`);
    }
    const debtor = await resolveDebtorChildCode(client, invoice.customerid);
    if (!debtor) throw new Error(`Invoice ${invoice.id}: the customer account needs an accountant's review.`);
    debtorCodes.set(invoice.id, debtor);
    const restored = allocations.rows.filter((row) => row.invoice_id === invoice.id).reduce((sum, row) => sum + cents(row.amount), 0);
    if (cents(invoice.balance_due) + restored > cents(invoice.totalamountpayable)) {
      throw new Error(`Invoice ${invoice.id}: the payment and outstanding balance do not agree. Ask the accountant to review them.`);
    }
  }
  for (const allocation of allocations.rows) {
    const invoice = invoices.rows.find((row) => row.id === allocation.invoice_id);
    const projection = payments.rows.filter((row) => row.receipt_allocation_id === allocation.id);
    const receipt = receipts.rows.find((row) => row.id === allocation.receipt_id);
    if (!invoice || !receipt || allocation.customer_id !== invoice.customerid || cents(allocation.amount) <= 0 ||
        projection.length !== 1 || projection[0].status !== "active" || projection[0].is_auto_collection ||
        projection[0].invoice_id !== allocation.invoice_id || cents(projection[0].amount_paid) !== cents(allocation.amount) ||
        projection[0].payment_method !== receipt.payment_method || projection[0].bank_account !== receipt.debit_account ||
        // payment_date is timestamp WITHOUT time zone, but db-pool re-tags it
        // as UTC. Read its stored calendar date in SQL to avoid shifting it
        // backwards on servers west of UTC. The receipt is a PostgreSQL date.
        projection[0].recorded_payment_date !== toLocalAccountingDateString(receipt.received_date)) {
      throw new Error("The payment history and receipt do not agree. Ask the accountant to review them before correcting this payment.");
    }
  }
  for (const receipt of receipts.rows) {
    assertTienHockAccountingDateUnlocked(receipt.received_date, "Original payment");
    assertTienHockAccountingDateUnlocked(receipt.posting_date, "Original receipt posting");
    const journal = journals.rows.find((row) => row.id === receipt.journal_entry_id);
    const amount = cents(receipt.total_amount);
    const memberAllocations = allocations.rows.filter((row) => row.receipt_id === receipt.id);
    if (!["BANK_PBB", "BANK_ABB"].includes(receipt.debit_account) || !journal || journal.status !== "posted" ||
        journal.source_type !== "receipt" || String(journal.source_id) !== String(receipt.id) || journal.entry_type !== "REC" ||
        cents(journal.total_debit) !== amount || cents(journal.total_credit) !== amount ||
        memberAllocations.reduce((sum, row) => sum + cents(row.amount), 0) !== amount) {
      throw new Error("The receipt and its journal do not agree. Ask the accountant to review them before correcting this payment.");
    }
    assertTienHockAccountingDateUnlocked(journal.entry_date, `Journal ${journal.id}`);
    // Permit date/text-only manual edits, never a changed distribution of money.
    /** @type {Map<string, number>} */
    const expectedCredits = new Map();
    for (const allocation of memberAllocations) {
      const code = debtorCodes.get(allocation.invoice_id);
      if (!code) throw new Error("The invoice's customer account could not be verified.");
      expectedCredits.set(code, (expectedCredits.get(code) || 0) + cents(allocation.amount));
    }
    let bankDebit = 0;
    for (const line of lines.rows.filter((row) => row.journal_entry_id === journal.id)) {
      const debit = cents(line.debit_amount);
      const credit = cents(line.credit_amount);
      if (debit < 0 || credit < 0 || (debit > 0 && credit > 0)) throw new Error("Journal amounts need an accountant's review.");
      if (debit > 0) {
        if (line.account_code !== receipt.debit_account) throw new Error("The journal's bank account was changed. Ask the accountant to review it.");
        bankDebit += debit;
      }
      if (credit > 0) {
        if (!expectedCredits.has(line.account_code)) throw new Error("The journal's customer accounts were changed. Ask the accountant to review it.");
        expectedCredits.set(line.account_code, expectedCredits.get(line.account_code) - credit);
      }
    }
    if (bankDebit !== amount || [...expectedCredits.values()].some((value) => value !== 0)) {
      throw new Error("The journal's amounts were changed. Ask the accountant to review it.");
    }
  }
  const dependencies = await client.query(
    `SELECT 1 FROM adjustment_documents WHERE original_invoice_id = ANY($1::varchar[])
       AND status = 'active' AND COALESCE(is_consolidated, false) = false
     UNION ALL
     SELECT 1 FROM bank_in_allocations bia JOIN bank_in_groups big ON big.id = bia.group_id
       JOIN bank_ins bi ON bi.id = big.bank_in_id WHERE bia.receipt_id = ANY($2::int[]) AND bi.status = 'posted' LIMIT 1`,
    [invoiceIds, ids]
  );
  if (dependencies.rows.length) throw new Error("This payment has an active adjustment or bank-in. Reverse the linked document before correcting it.");
  const version = createHash("sha256").update(JSON.stringify([receipts.rows, allocations.rows, journals.rows, lines.rows, payments.rows, invoices.rows, [...debtorCodes]])).digest("hex");
  return {
    version,
    reference: group.display_reference,
    payment_method: group.payment_method,
    received_date: toLocalAccountingDateString(group.received_date),
    bank_account: group.debit_account,
    total_amount: group.total_amount,
    requires_journal_review: journals.rows.some((row) => row.manual_override),
    journals: journals.rows.map((row) => ({ id: row.id, entry_date: toLocalAccountingDateString(row.entry_date), manual_override: row.manual_override })),
    allocations: allocations.rows.map((row) => ({ invoice_id: row.invoice_id, customer_id: row.customer_id, amount: row.amount })),
    // Internal snapshots are not sent by the route.
    receipts: receipts.rows,
    allocation_rows: allocations.rows,
  };
}

/**
 * Caller owns the SERIALIZABLE transaction. No commit or retries here.
 * @param {Client} client
 * @param {number} receiptId
 * @param {{expected_version?: unknown, received_date?: unknown, reason?: unknown, reviewed_journals?: unknown}} payload
 * @param {string} userId
 * @returns {Promise<{receipt_ids: number[]}>}
 */
export async function correctReceiptToCheque(client, receiptId, payload, userId) {
  if (!userId) throw new Error("A signed-in staff session is required to correct payments.");
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!reason || reason.length > 1000) throw new Error("Enter a correction reason of no more than 1000 characters.");
  if (typeof payload.received_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.received_date)) throw new Error("Enter a valid cheque date.");
  const nextDate = toLocalAccountingDateString(payload.received_date);
  assertTienHockAccountingDateUnlocked(nextDate, "Corrected cheque date");
  const preview = await previewReceiptCorrection(client, receiptId, true);
  if (typeof payload.expected_version !== "string" || payload.expected_version !== preview.version) {
    throw Object.assign(new Error("This payment changed after you opened it. Close this dialog and review it again."), { status: 409 });
  }
  if (preview.requires_journal_review && payload.reviewed_journals !== true) {
    throw new Error("Review and acknowledge the manually edited journal before correcting this payment.");
  }
  // Do not silently merge this replacement into an unrelated visible group.
  const collision = await client.query(
    `SELECT id FROM receipts WHERE display_reference = $1 AND received_date = $2::date
       AND payment_method = 'cheque' AND debit_account = $3 AND origin = 'erp'
       AND status IN ('pending', 'posted') LIMIT 1`,
    [preview.reference, nextDate, preview.bank_account]
  );
  if (collision.rows.length) throw new Error("A cheque group already uses this reference, date and bank. Review that group before making this correction.");
  await cancelReceiptGroup(client, receiptId, `Corrected to pending cheque dated ${nextDate}. Reason: ${reason}`, userId);
  /** @type {number[]} */
  const replacementIds = [];
  for (const receipt of preview.receipts) {
    const sourceNote = `Correction of receipt #${receipt.id}, journal #${receipt.journal_entry_id}; ${receipt.payment_method} dated ${preview.received_date}; journal dated ${preview.journals.find((row) => row.id === receipt.journal_entry_id).entry_date}. Changed to pending cheque dated ${nextDate}. Reason: ${reason}`;
    const replacement = await createReceipt(client, {
      payment_method: "cheque",
      received_date: nextDate,
      bank_account: receipt.debit_account,
      display_reference: receipt.display_reference,
      cheque_reference: receipt.cheque_reference || receipt.display_reference,
      description: receipt.description_overridden ? receipt.description : undefined,
      notes: [receipt.notes, sourceNote].filter(Boolean).join("\n"),
      allocations: preview.allocation_rows.filter((row) => row.receipt_id === receipt.id).map((row) => ({ type: "invoice", invoice_id: row.invoice_id, amount: Number(row.amount) })),
    }, userId);
    replacementIds.push(replacement.receipt.id);
    const auditReason = `Corrected to pending cheque receipt #${replacement.receipt.id} dated ${nextDate}. Reason: ${reason}`;
    await client.query(`UPDATE receipts SET cancellation_reason = $2 WHERE id = $1`, [receipt.id, auditReason]);
    await client.query(`UPDATE payments SET cancellation_reason = $2 WHERE receipt_allocation_id IN (SELECT id FROM receipt_allocations WHERE receipt_id = $1) AND status = 'cancelled'`, [receipt.id, auditReason]);
  }
  return { receipt_ids: replacementIds };
}

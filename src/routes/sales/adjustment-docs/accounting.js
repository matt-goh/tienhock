// src/routes/sales/adjustment-docs/accounting.js
// Journal entry helpers for Adjustment Documents (Credit / Debit / Refund Notes).
//
// Accounting model (frozen contract, docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §4a):
//   Credit Note  (return / overcharge / prompt-payment discount)
//     Dr original sale revenue (CR_SALES for a credit invoice, CASH_SALES for
//     a cash bill) for total_excluding_tax + rounding
//     Dr OUTPUT_TAX for tax_amount (only when non-zero)
//     Cr Trade Receivables (TR) for the total
//   Debit Note   (additional charge)
//     exact inverse: Dr TR total / Cr original revenue + Cr OUTPUT_TAX
//   Refund Note (standalone, against an overpaid Payment)
//     Dr Customer Deposits (CUST_DEP) / Cr Bank/Cash — settlement only
//   Refund Note (paired with a Credit Note for a previously-paid invoice)
//     Dr Trade Receivables (TR) / Cr Bank/Cash — settlement only
//
// The symmetric field identity total_excluding_tax + rounding + tax_amount =
// totalamountpayable is asserted; an adjustment that breaks it is rejected
// rather than posted asymmetrically. RN never touches revenue or output tax.
//
// Visible accounting reference = the document number (e.g. TH/CN/26/1),
// stored in journal display_reference; reference_no keeps the internal
// JCN/JDN/JRN sequence. The accounting date is the document's own date.

import { determineBankAccount } from "../../../utils/payment-helpers.js";
import { formatAdjustmentDocDisplayId } from "../../../utils/adjustments/formatDocId.js";
import { getCustomerDebtorAccountCode } from "../../accounting/debtorSync.js";

const ENTRY_TYPE = {
  credit_note: "CN",
  debit_note: "DN",
  refund_note: "RN",
};

const REFERENCE_PREFIX = {
  credit_note: "JCN",
  debit_note: "JDN",
  refund_note: "JRN",
};

const TYPE_LABEL = {
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  refund_note: "Refund Note",
};

/**
 * Generates the next reference number for adjustment-doc journal entries.
 * Format: J{TYPE}-YYYYMM-XXXX  (e.g. JCN-202605-0001).
 */
export async function generateAdjustmentReference(client, type, postingDate) {
  const date = new Date(postingDate);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid posting date: ${postingDate}`);
  }

  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const prefix = REFERENCE_PREFIX[type];
  const entryType = ENTRY_TYPE[type];
  if (!prefix || !entryType) {
    throw new Error(`Unknown adjustment doc type: ${type}`);
  }
  const pattern = `${prefix}-${yearMonth}-%`;

  const result = await client.query(
    `SELECT reference_no
       FROM journal_entries
      WHERE reference_no LIKE $1 AND entry_type = $2
      ORDER BY reference_no DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [pattern, entryType]
  );

  let next = 1;
  if (result.rows.length > 0) {
    const m = result.rows[0].reference_no.match(
      new RegExp(`^${prefix}-\\d{6}-(\\d+)$`)
    );
    if (m) next = parseInt(m[1], 10) + 1;
  }

  return `${prefix}-${yearMonth}-${String(next).padStart(4, "0")}`;
}

async function ensureAccountsExist(client, codes) {
  const result = await client.query(
    `SELECT code FROM account_codes WHERE code = ANY($1::varchar[]) AND is_active = true`,
    [codes]
  );
  const found = result.rows.map((r) => r.code);
  const missing = codes.filter((c) => !found.includes(c));
  if (missing.length) {
    throw new Error(`Required account codes not found or inactive: ${missing.join(", ")}`);
  }
}

/**
 * Splits the document amounts per the symmetric sale/adjustment contract and
 * asserts the field identity. Throws instead of posting asymmetrically.
 */
function splitAmounts(doc) {
  const net = roundAmt(parseFloat(doc.total_excluding_tax || 0) + parseFloat(doc.rounding || 0));
  const tax = roundAmt(doc.tax_amount);
  const total = roundAmt(doc.totalamountpayable);
  if (Math.abs(net + tax - total) > 0.005) {
    throw new Error(
      `Adjustment ${doc.id}: net+rounding (${net.toFixed(2)}) + tax (${tax.toFixed(2)}) does not equal the total (${total.toFixed(2)}). Fix the document amounts before posting.`
    );
  }
  return { net, tax, total };
}

async function insertEntry(client, {
  reference_no,
  entry_type,
  entry_date,
  description,
  display_reference,
  source_type,
  source_id,
  lines, // [account, debit, credit, particulars]
  created_by,
}) {
  const totalDebit = roundAmt(lines.reduce((s, l) => s + l[1], 0));
  const totalCredit = roundAmt(lines.reduce((s, l) => s + l[2], 0));

  const headerResult = await client.query(
    `INSERT INTO journal_entries (
       reference_no, entry_type, entry_date, description,
       total_debit, total_credit, status, display_reference,
       source_type, source_id, created_at, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, 'posted', $7, $8, $9, NOW(), $10)
     RETURNING id`,
    [
      reference_no,
      entry_type,
      entry_date,
      description,
      totalDebit,
      totalCredit,
      display_reference,
      source_type,
      source_id,
      created_by || null,
    ]
  );
  const journalEntryId = headerResult.rows[0].id;

  for (let i = 0; i < lines.length; i++) {
    const [account, debit, credit, particulars] = lines[i];
    await client.query(
      `INSERT INTO journal_entry_lines (
         journal_entry_id, line_number, account_code,
         debit_amount, credit_amount, reference, particulars, display_order, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $2, NOW())`,
      [journalEntryId, i + 1, account, debit, credit, reference_no, particulars]
    );
  }

  return journalEntryId;
}

function docContext(doc, opts, type) {
  const displayRef = formatAdjustmentDocDisplayId(doc);
  const reason = (doc.reason || "").trim();
  const description = `${displayRef}: ${reason || TYPE_LABEL[type]} - INV/NO: ${doc.original_invoice_id}`;
  const revenueAccount = opts.paymenttype === "CASH" ? "CASH_SALES" : "CR_SALES";
  const sourceType = opts.sourceType || "adjustment";
  return { displayRef, description, revenueAccount, sourceType };
}

/**
 * Receivable-side account: the customer's debtor child for Tien Hock docs
 * (Phase 6); Jelly Polly documents keep the TR control account — JP invoices
 * live outside the TH sales-journal model, so a one-sided child posting would
 * misstate the customer ledger.
 */
async function receivableAccount(client, doc, sourceType) {
  if (sourceType === "jp_adjustment") return "TR";
  return getCustomerDebtorAccountCode(client, doc.customerid);
}

/**
 * Create journal entry for a Credit Note.
 * Dr original revenue (+ Dr OUTPUT_TAX) / Cr TR.
 * opts: { paymenttype: original invoice's CASH|INVOICE, sourceType }
 */
export async function createCreditNoteJournalEntry(client, doc, opts = {}) {
  const { net, tax, total } = splitAmounts(doc);
  const { description, revenueAccount, sourceType } = docContext(doc, opts, "credit_note");
  const debtor = await receivableAccount(client, doc, sourceType);

  const accounts = [revenueAccount, debtor];
  if (tax > 0) accounts.push("OUTPUT_TAX");
  await ensureAccountsExist(client, accounts);

  const postingDate = toIsoDate(doc.createddate);
  const reference_no = await generateAdjustmentReference(client, "credit_note", postingDate);

  const lines = [[revenueAccount, net, 0, description]];
  if (tax > 0) lines.push(["OUTPUT_TAX", tax, 0, description]);
  lines.push([debtor, 0, total, description]);

  return insertEntry(client, {
    reference_no,
    entry_type: ENTRY_TYPE.credit_note,
    entry_date: postingDate,
    description,
    display_reference: formatAdjustmentDocDisplayId(doc),
    source_type: sourceType,
    source_id: String(doc.id),
    lines,
    created_by: doc.created_by,
  });
}

/**
 * Create journal entry for a Debit Note.
 * Dr TR / Cr original revenue (+ Cr OUTPUT_TAX).
 */
export async function createDebitNoteJournalEntry(client, doc, opts = {}) {
  const { net, tax, total } = splitAmounts(doc);
  const { description, revenueAccount, sourceType } = docContext(doc, opts, "debit_note");
  const debtor = await receivableAccount(client, doc, sourceType);

  const accounts = [revenueAccount, debtor];
  if (tax > 0) accounts.push("OUTPUT_TAX");
  await ensureAccountsExist(client, accounts);

  const postingDate = toIsoDate(doc.createddate);
  const reference_no = await generateAdjustmentReference(client, "debit_note", postingDate);

  const lines = [[debtor, total, 0, description], [revenueAccount, 0, net, description]];
  if (tax > 0) lines.push(["OUTPUT_TAX", 0, tax, description]);

  return insertEntry(client, {
    reference_no,
    entry_type: ENTRY_TYPE.debit_note,
    entry_date: postingDate,
    description,
    display_reference: formatAdjustmentDocDisplayId(doc),
    source_type: sourceType,
    source_id: String(doc.id),
    lines,
    created_by: doc.created_by,
  });
}

/**
 * Create journal entry for a Refund Note — settlement only; never touches
 * revenue or output tax.
 * - Standalone (linked to an overpaid payment): Dr CUST_DEP / Cr Bank.
 * - Paired with a Credit Note (paid invoice scenario): Dr TR / Cr Bank.
 */
export async function createRefundNoteJournalEntry(client, doc, opts = {}) {
  const bankAccount = determineBankAccount(doc.refund_method, doc.bank_account);
  const { description, sourceType } = docContext(doc, opts, "refund_note");
  const debitAccount = doc.paired_with_id
    ? await receivableAccount(client, doc, sourceType)
    : "CUST_DEP";
  await ensureAccountsExist(client, [debitAccount, bankAccount]);

  const total = roundAmt(doc.totalamountpayable);
  const refundContext = doc.paired_with_id
    ? ` (paired with ${formatAdjustmentDocDisplayId({ id: doc.paired_with_id })})`
    : doc.linked_payment_id
    ? ` (refunds overpayment #${doc.linked_payment_id})`
    : "";

  const postingDate = toIsoDate(doc.createddate);
  const reference_no = await generateAdjustmentReference(client, "refund_note", postingDate);

  return insertEntry(client, {
    reference_no,
    entry_type: ENTRY_TYPE.refund_note,
    entry_date: postingDate,
    description: description + refundContext,
    display_reference: formatAdjustmentDocDisplayId(doc),
    source_type: sourceType,
    source_id: String(doc.id),
    lines: [
      [debitAccount, total, 0, description + refundContext],
      [bankAccount, 0, total, description + refundContext],
    ],
    created_by: doc.created_by,
  });
}

/**
 * Cancel a previously-posted adjustment-doc journal entry.
 */
export async function cancelAdjustmentJournalEntry(client, journalEntryId) {
  if (!journalEntryId) return false;
  const result = await client.query(
    `UPDATE journal_entries
        SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
        AND entry_type IN ('CN','DN','RN')
        AND status = 'posted'
      RETURNING id, reference_no`,
    [journalEntryId]
  );
  if (result.rows.length === 0) {
    return false;
  }
  return true;
}

// ----- helpers -----

function roundAmt(v) {
  return Math.round(parseFloat(v || 0) * 100) / 100;
}

/**
 * Converts a JS unix timestamp (ms, as stored in createddate) or any
 * Date-parseable value into a YYYY-MM-DD string used by journal_entries.entry_date.
 */
function toIsoDate(value) {
  const formatDateLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  if (value === null || value === undefined) {
    return formatDateLocal(new Date());
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return formatDateLocal(new Date(Number(value)));
  }
  if (typeof value === "number") {
    return formatDateLocal(new Date(value));
  }
  if (value instanceof Date) {
    return formatDateLocal(value);
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return formatDateLocal(new Date());
  }
  return formatDateLocal(parsed);
}

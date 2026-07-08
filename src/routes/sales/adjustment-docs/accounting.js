// src/routes/sales/adjustment-docs/accounting.js
// Journal entry helpers for Adjustment Documents (Credit / Debit / Refund Notes).
//
// Accounting model:
//   Credit Note  (sales return / overcharge correction)
//     Dr Sales Returns (RETURN)
//     Cr Trade Receivables (TR)
//
//   Debit Note   (additional charge, e.g. late fee)
//     Dr Trade Receivables (TR)
//     Cr Sales (SLS)
//
//   Refund Note (standalone, against an overpaid Payment)
//     Dr Customer Deposits (CUST_DEP)
//     Cr Bank / Cash (per refund_method + bank_account)
//
//   Refund Note (paired with a Credit Note for a previously-paid invoice)
//     Dr Trade Receivables (TR)   -- balances the CN's credit to TR
//     Cr Bank / Cash

import { determineBankAccount } from "../../../utils/payment-helpers.js";

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

async function insertEntry(client, {
  reference_no,
  entry_type,
  entry_date,
  description,
  amount,
  debit_account,
  credit_account,
  debit_particulars,
  credit_particulars,
  created_by,
}) {
  const headerResult = await client.query(
    `INSERT INTO journal_entries (
       reference_no, entry_type, entry_date, description,
       total_debit, total_credit, status,
       created_at, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, 'posted', NOW(), $7)
     RETURNING id`,
    [reference_no, entry_type, entry_date, description, amount, amount, created_by || null]
  );
  const journalEntryId = headerResult.rows[0].id;

  await client.query(
    `INSERT INTO journal_entry_lines (
       journal_entry_id, line_number, account_code,
       debit_amount, credit_amount, reference, particulars, created_at
     ) VALUES
       ($1, 1, $2, $3, 0, $4, $5, NOW()),
       ($1, 2, $6, 0, $3, $4, $7, NOW())`,
    [
      journalEntryId,
      debit_account,
      amount,
      reference_no,
      debit_particulars,
      credit_account,
      credit_particulars,
    ]
  );

  return journalEntryId;
}

/**
 * Create journal entry for a Credit Note.
 * Dr RETURN / Cr TR.
 */
export async function createCreditNoteJournalEntry(client, doc) {
  const debitAccount = "RETURN";
  const creditAccount = "TR";
  await ensureAccountsExist(client, [debitAccount, creditAccount]);

  const amount = roundAmt(doc.totalamountpayable);
  const postingDate = toIsoDate(doc.createddate);
  const reference_no = await generateAdjustmentReference(client, "credit_note", postingDate);

  return insertEntry(client, {
    reference_no,
    entry_type: ENTRY_TYPE.credit_note,
    entry_date: postingDate,
    description: `Credit Note ${doc.id} - Invoice #${doc.original_invoice_id}${
      doc.reason ? ` (${doc.reason.slice(0, 100)})` : ""
    }`,
    amount,
    debit_account: debitAccount,
    credit_account: creditAccount,
    debit_particulars: `Sales return - Invoice #${doc.original_invoice_id}`,
    credit_particulars: `A/R reduction via ${doc.id}`,
    created_by: doc.created_by,
  });
}

/**
 * Create journal entry for a Debit Note.
 * Dr TR / Cr SLS.
 */
export async function createDebitNoteJournalEntry(client, doc) {
  const debitAccount = "TR";
  const creditAccount = "SLS";
  await ensureAccountsExist(client, [debitAccount, creditAccount]);

  const amount = roundAmt(doc.totalamountpayable);
  const postingDate = toIsoDate(doc.createddate);
  const reference_no = await generateAdjustmentReference(client, "debit_note", postingDate);

  return insertEntry(client, {
    reference_no,
    entry_type: ENTRY_TYPE.debit_note,
    entry_date: postingDate,
    description: `Debit Note ${doc.id} - Invoice #${doc.original_invoice_id}${
      doc.reason ? ` (${doc.reason.slice(0, 100)})` : ""
    }`,
    amount,
    debit_account: debitAccount,
    credit_account: creditAccount,
    debit_particulars: `A/R increase via ${doc.id}`,
    credit_particulars: `Additional charge - Invoice #${doc.original_invoice_id}`,
    created_by: doc.created_by,
  });
}

/**
 * Create journal entry for a Refund Note.
 * - Standalone (linked to an overpaid payment): Dr CUST_DEP / Cr Bank.
 * - Paired with a Credit Note (paid invoice scenario): Dr TR / Cr Bank.
 */
export async function createRefundNoteJournalEntry(client, doc) {
  const bankAccount = determineBankAccount(doc.refund_method, doc.bank_account);
  const debitAccount = doc.paired_with_id ? "TR" : "CUST_DEP";
  const creditAccount = bankAccount;
  await ensureAccountsExist(client, [debitAccount, creditAccount]);

  const amount = roundAmt(doc.totalamountpayable);
  const postingDate = toIsoDate(doc.createddate);
  const reference_no = await generateAdjustmentReference(client, "refund_note", postingDate);

  const refundContext = doc.paired_with_id
    ? `paired with ${doc.paired_with_id}`
    : doc.linked_payment_id
    ? `for overpayment on Payment #${doc.linked_payment_id}`
    : "standalone refund";

  return insertEntry(client, {
    reference_no,
    entry_type: ENTRY_TYPE.refund_note,
    entry_date: postingDate,
    description: `Refund Note ${doc.id} - Invoice #${doc.original_invoice_id} (${refundContext})`,
    amount,
    debit_account: debitAccount,
    credit_account: creditAccount,
    debit_particulars: doc.paired_with_id
      ? `A/R clearance via refund ${doc.id}`
      : `Customer deposit released via ${doc.id}`,
    credit_particulars: `Refund paid to customer - Invoice #${doc.original_invoice_id}`,
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

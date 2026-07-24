// Controlled operational reconciliation for a customer payment that is
// already present in the immutable Jan-May legacy ledger import.
//
// This service NEVER creates or links a receipt/journal. It only creates a
// non-posting `contra` payment projection after an exact, unambiguous ledger
// match proves that the accounting entry already exists.

import {
  TIEN_HOCK_ACCOUNTING_OPEN_DATE,
  toLocalAccountingDateString,
} from "./posting-lock.js";
import { resolveDebtorChildCode } from "./debtorSync.js";

export const IMPORTED_PAYMENT_RECONCILIATION_MATCH_CODE =
  "IMPORTED_PAYMENT_RECONCILIATION_MATCH";
export const IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND_CODE =
  "IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND";
export const IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE =
  "IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE";

const MONEY_TOLERANCE = 0.005;
const APPROVED_IMPORT_SOURCE_HASHES = [
  "6230d4613768f3f1b51c6195852560446103e39b57b2deb8ac575d8c8ecaa918",
  "6ef5ee949cca9b7903cff5ede201bea5d6e6bc8d341c45e91ea060aeac905a81",
];

/**
 * @typedef {object} ImportedPaymentAllocation
 * @property {"invoice"} [type]
 * @property {string|number} invoice_id
 * @property {string|number} amount
 */

/**
 * @typedef {object} ImportedPaymentReconciliationPayload
 * @property {ImportedPaymentAllocation[]} allocations
 * @property {string} payment_reference
 * @property {string|number|Date} received_date
 * @property {"cash"|"cheque"|"bank_transfer"|"online"} payment_method
 * @property {string|null} [bank_account]
 * @property {string|null} [notes]
 * @property {number|string|null} [expected_journal_id]
 * @property {number|string|null} [expected_line_id]
 */

/**
 * @typedef {object} NormalizedReconciliationRequest
 * @property {string} invoiceId
 * @property {number} amount
 * @property {string} paymentReference
 * @property {string} enteredPaymentDate
 * @property {"cash"|"cheque"|"bank_transfer"|"online"} paymentMethod
 * @property {string} debitAccount
 * @property {string|null} notes
 * @property {number|null} expectedJournalId
 * @property {number|null} expectedLineId
 */

/**
 * @typedef {object} ImportedPaymentReconciliationPreview
 * @property {string} code
 * @property {string} invoice_id
 * @property {string} customer_id
 * @property {string} customer_name
 * @property {number} amount
 * @property {string} payment_reference
 * @property {string} invoice_date
 * @property {string} entered_payment_date
 * @property {string} ledger_payment_date
 * @property {boolean} payment_date_corrected
 * @property {string} debit_account
 * @property {number} evidence_journal_id
 * @property {number} evidence_line_id
 * @property {number} gl_balance
 * @property {number} operational_balance
 * @property {number} operational_balance_after
 * @property {string|null} [reconciliation_warning]
 * @property {boolean} no_new_journal
 */

/**
 * @param {string|number|null|undefined} value
 * @returns {number}
 */
function round2(value) {
  return Math.round(parseFloat(String(value || 0)) * 100) / 100;
}

/**
 * @param {string} message
 * @param {string} [code]
 * @param {number} [status]
 * @returns {never}
 */
function throwReconciliationError(
  message,
  code = IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
  status = 409
) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeLedgerText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * @param {string} particulars
 * @param {string} invoiceId
 * @param {string} customerId
 * @returns {boolean}
 */
function particularsReferenceInvoice(particulars, invoiceId, customerId) {
  return (
    normalizeLedgerText(particulars) ===
    `INVNO${normalizeLedgerText(invoiceId)}${normalizeLedgerText(customerId)}`
  );
}

/**
 * @param {number} journalId
 * @param {number} lineId
 * @returns {string}
 */
function evidenceIdentityMarker(journalId, lineId) {
  return `journal=${journalId} line=${lineId}`;
}

/**
 * @param {NormalizedReconciliationRequest} request
 * @param {ImportedPaymentReconciliationPreview} preview
 * @returns {string}
 */
function reconciliationStateMarker(request, preview) {
  return `[imported-payment-reconciliation ${evidenceIdentityMarker(
    preview.evidence_journal_id,
    preview.evidence_line_id
  )} entered=${preview.entered_payment_date} ledger=${
    preview.ledger_payment_date
  } method=${request.paymentMethod} debit=${request.debitAccount}]`;
}

/**
 * @param {string|null|undefined} notes
 * @returns {{journalId: number, lineId: number, enteredPaymentDate: string, ledgerPaymentDate: string, paymentMethod: string, debitAccount: string}|null}
 */
function parseReconciliationStateMarker(notes) {
  const match = /^\[imported-payment-reconciliation journal=(\d+) line=(\d+) entered=(\d{4}-\d{2}-\d{2}) ledger=(\d{4}-\d{2}-\d{2}) method=(cash|cheque|bank_transfer|online) debit=([A-Z0-9_-]+)\]/.exec(
    String(notes || "")
  );
  if (!match) return null;

  return {
    journalId: Number(match[1]),
    lineId: Number(match[2]),
    enteredPaymentDate: match[3],
    ledgerPaymentDate: match[4],
    paymentMethod: match[5],
    debitAccount: match[6],
  };
}

/**
 * @param {ImportedPaymentReconciliationPayload} payload
 * @returns {NormalizedReconciliationRequest}
 */
function normalizeRequest(payload) {
  if (!payload || !Array.isArray(payload.allocations)) {
    throwReconciliationError(
      "Historical ledger reconciliation requires one invoice allocation.",
      IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
      400
    );
  }
  if (payload.allocations.length !== 1) {
    throwReconciliationError(
      "Historical ledger reconciliation is limited to one invoice at a time. Record or review the invoices separately.",
      IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
      400
    );
  }

  const allocation = payload.allocations[0];
  if (!allocation || (allocation.type || "invoice") !== "invoice") {
    throwReconciliationError(
      "Only a direct invoice settlement can be matched to the imported ledger.",
      IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
      400
    );
  }

  const invoiceId = String(allocation.invoice_id || "").trim();
  const amount = round2(allocation.amount);
  if (!invoiceId || !(amount > 0)) {
    throwReconciliationError(
      "A valid invoice and positive settlement amount are required.",
      IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
      400
    );
  }

  const paymentReference = String(payload.payment_reference || "").trim();
  const enteredPaymentDate = toLocalAccountingDateString(payload.received_date);
  const paymentMethod = payload.payment_method;
  if (![
    "cash",
    "cheque",
    "bank_transfer",
    "online",
  ].includes(paymentMethod)) {
    throwReconciliationError(
      "Unsupported payment method for historical ledger reconciliation.",
      IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
      400
    );
  }

  let debitAccount = "CH_REV2";
  if (paymentMethod !== "cash") {
    debitAccount = String(payload.bank_account || "BANK_PBB").trim();
    if (!["BANK_PBB", "BANK_ABB"].includes(debitAccount)) {
      throwReconciliationError(
        "Select Public Bank or Alliance Bank to match the imported payment.",
        IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
        400
      );
    }
  }

  const parseExpectedId = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsedValue = Number(value);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
  };

  return {
    invoiceId,
    amount,
    paymentReference,
    enteredPaymentDate,
    paymentMethod,
    debitAccount,
    notes: payload.notes ? String(payload.notes).trim() || null : null,
    expectedJournalId: parseExpectedId(payload.expected_journal_id),
    expectedLineId: parseExpectedId(payload.expected_line_id),
  };
}

/**
 * @param {object} client
 * @param {string} debtorAccountCode
 * @param {string} customerId
 * @returns {Promise<{glBalance: number, operationalBalance: number}>}
 */
async function getCustomerReconciliationState(
  client,
  debtorAccountCode,
  customerId
) {
  const result = await client.query(
    `WITH latest_anchor AS (
       SELECT as_of_date, amount
         FROM account_opening_balances
        WHERE account_code = $1
          AND as_of_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur')::date
        ORDER BY as_of_date DESC
        LIMIT 1
     ), gl AS (
       SELECT COALESCE((SELECT amount FROM latest_anchor), 0) +
              COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS balance
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE jel.account_code = $1
          AND je.status = 'posted'
          AND je.entry_date >= COALESCE(
                (SELECT as_of_date FROM latest_anchor),
                DATE '-infinity'
              )
     ), operations AS (
       SELECT COALESCE(SUM(balance_due), 0) AS balance
         FROM invoices
        WHERE customerid = $2
          AND paymenttype = 'INVOICE'
          AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled'
     )
     SELECT (SELECT balance FROM gl) AS gl_balance,
            (SELECT balance FROM operations) AS operational_balance`,
    [debtorAccountCode, customerId]
  );

  return {
    glBalance: round2(result.rows[0]?.gl_balance),
    operationalBalance: round2(result.rows[0]?.operational_balance),
  };
}

/**
 * Validate an exact imported receipt and current GL/operations difference.
 * When `lockRows` is true, all mutable/evidence rows stay locked until the
 * caller commits or rolls back.
 *
 * @param {object} client
 * @param {ImportedPaymentReconciliationPayload} payload
 * @param {boolean} lockRows
 * @returns {Promise<{request: NormalizedReconciliationRequest, preview: ImportedPaymentReconciliationPreview, debtorAccountCode: string}>}
 */
async function validateImportedPayment(client, payload, lockRows) {
  const request = normalizeRequest(payload);
  const invoiceLockClause = lockRows ? "FOR UPDATE OF i, c" : "";
  const invoiceResult = await client.query(
    `SELECT i.id, i.customerid, i.paymenttype, i.totalamountpayable,
            i.balance_due, i.invoice_status, i.createddate,
            i.is_consolidated, i.journal_entry_id,
            c.name AS customer_name
       FROM invoices i
       JOIN customers c ON c.id = i.customerid
      WHERE i.id = $1
      ${invoiceLockClause}`,
    [request.invoiceId]
  );
  if (invoiceResult.rows.length === 0) {
    throwReconciliationError(
      `Invoice ${request.invoiceId} was not found.`,
      IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
      404
    );
  }

  const invoice = invoiceResult.rows[0];
  const invoiceStatus = String(invoice.invoice_status || "").toLowerCase();
  const invoiceBalance = round2(invoice.balance_due);
  const invoiceTotal = round2(invoice.totalamountpayable);
  const invoiceDate = toLocalAccountingDateString(invoice.createddate);
  if (invoiceDate >= TIEN_HOCK_ACCOUNTING_OPEN_DATE) {
    throwReconciliationError(
      `Invoice ${request.invoiceId} is outside the imported accounting period.`,
      IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND_CODE
    );
  }

  const debtorAccountCode = await resolveDebtorChildCode(
    client,
    String(invoice.customerid)
  );
  if (!debtorAccountCode) {
    throwReconciliationError(
      `No imported debtor account is available for invoice ${request.invoiceId}.`,
      IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND_CODE
    );
  }

  const debtorAccountLockClause = lockRows ? "FOR SHARE" : "";
  const debtorAccountResult = await client.query(
    `SELECT code, ledger_type, parent_code, is_active
       FROM account_codes
      WHERE code = $1
      ${debtorAccountLockClause}`,
    [debtorAccountCode]
  );
  if (debtorAccountResult.rows.length !== 1) {
    throwReconciliationError(
      `No imported debtor account is available for invoice ${request.invoiceId}.`,
      IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND_CODE
    );
  }
  const debtorAccount = debtorAccountResult.rows[0];

  const evidenceLockClause = lockRows ? "FOR UPDATE OF je, jel" : "";
  const evidenceResult = await client.query(
    `SELECT je.id AS journal_id,
            TO_CHAR(je.entry_date, 'YYYY-MM-DD') AS entry_date,
            je.reference_no, je.display_reference,
            je.total_debit, je.total_credit, je.source_id,
            jel.id AS line_id, jel.particulars,
            jel.debit_amount, jel.credit_amount,
            COALESCE(
              (SELECT SUM(bank_line.debit_amount - bank_line.credit_amount)
                 FROM journal_entry_lines bank_line
                WHERE bank_line.journal_entry_id = je.id
                  AND bank_line.account_code = $4),
              0
            ) AS debit_account_movement,
            (SELECT COUNT(*)
               FROM journal_entry_lines counted_line
              WHERE counted_line.journal_entry_id = je.id) AS total_line_count,
            (SELECT COUNT(*)
               FROM journal_entry_lines counted_line
              WHERE counted_line.journal_entry_id = je.id
                AND ABS(COALESCE(counted_line.debit_amount, 0)) +
                    ABS(COALESCE(counted_line.credit_amount, 0)) > ${MONEY_TOLERANCE})
              AS nonzero_line_count,
            (SELECT COUNT(*)
               FROM journal_entry_lines bank_line
              WHERE bank_line.journal_entry_id = je.id
                AND bank_line.account_code = $4
                AND ABS(COALESCE(bank_line.debit_amount, 0) - $2::numeric) <= ${MONEY_TOLERANCE}
                AND ABS(COALESCE(bank_line.credit_amount, 0)) <= ${MONEY_TOLERANCE})
              AS matching_bank_line_count,
            (SELECT ARRAY_AGG(COALESCE(source_line.particulars, '') ORDER BY source_line.line_number)
               FROM journal_entry_lines source_line
              WHERE source_line.journal_entry_id = je.id) AS journal_particulars,
            (SELECT COUNT(*)
               FROM import_legacy_rows staged
              WHERE staged.journal_group_key = je.source_id) AS staged_row_count,
            (SELECT COUNT(*)
               FROM import_legacy_rows staged
              WHERE staged.journal_group_key = je.source_id
                AND staged.record_kind = 'transaction'
                AND staged.provenance = 'source_csv'
                AND staged.repaired = false
                AND staged.source_sha256 = ANY($6::text[])
                AND staged.entry_date = je.entry_date
                AND UPPER(BTRIM(staged.journal_ref)) = UPPER($3)
                AND staged.account_code = $4
                AND staged.debit_cents = ROUND($2::numeric * 100)::bigint
                AND staged.credit_cents = 0) AS matching_staged_bank_count,
            (SELECT COUNT(*)
               FROM import_legacy_rows staged
              WHERE staged.journal_group_key = je.source_id
                AND staged.record_kind = 'transaction'
                AND staged.provenance = 'source_csv'
                AND staged.repaired = false
                AND staged.source_sha256 = ANY($6::text[])
                AND staged.entry_date = je.entry_date
                AND UPPER(BTRIM(staged.journal_ref)) = UPPER($3)
                AND staged.account_code = $1
                AND staged.debit_cents = 0
                AND staged.credit_cents = ROUND($2::numeric * 100)::bigint)
              AS matching_staged_debtor_count,
            (SELECT ARRAY_AGG(COALESCE(staged.particulars, '') ORDER BY staged.stage_sequence)
               FROM import_legacy_rows staged
              WHERE staged.journal_group_key = je.source_id) AS staged_particulars
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
       JOIN account_codes ac ON ac.code = jel.account_code
      WHERE je.status = 'posted'
        AND je.entry_type = 'IMP'
        AND je.legacy_entry_type = 'REC'
        AND je.source_type = 'legacy_import'
        AND je.source_id IS NOT NULL
        AND je.entry_date < $5::date
        AND jel.account_code = $1
        AND ABS(COALESCE(jel.debit_amount, 0)) <= ${MONEY_TOLERANCE}
        AND ABS(COALESCE(jel.credit_amount, 0) - $2::numeric) <= ${MONEY_TOLERANCE}
        AND ABS(COALESCE(je.total_debit, 0) - $2::numeric) <= ${MONEY_TOLERANCE}
        AND ABS(COALESCE(je.total_credit, 0) - $2::numeric) <= ${MONEY_TOLERANCE}
        AND ABS(COALESCE(
              (SELECT SUM(bank_line.debit_amount - bank_line.credit_amount)
                 FROM journal_entry_lines bank_line
                WHERE bank_line.journal_entry_id = je.id
                  AND bank_line.account_code = $4),
              0
            ) - $2::numeric) <= ${MONEY_TOLERANCE}
        AND UPPER(COALESCE(
              NULLIF(BTRIM(jel.display_reference), ''),
              NULLIF(BTRIM(je.display_reference), ''),
              BTRIM(je.reference_no)
            )) = UPPER($3)
      ORDER BY je.id, jel.id
      ${evidenceLockClause}`,
    [
      debtorAccountCode,
      request.amount,
      request.paymentReference,
      request.debitAccount,
      TIEN_HOCK_ACCOUNTING_OPEN_DATE,
      APPROVED_IMPORT_SOURCE_HASHES,
    ]
  );

  const evidenceRows = evidenceResult.rows.filter(
    (row) =>
      Number(row.total_line_count) === 2 &&
      Number(row.nonzero_line_count) === 2 &&
      Number(row.matching_bank_line_count) === 1 &&
      Number(row.staged_row_count) === 2 &&
      Number(row.matching_staged_bank_count) === 1 &&
      Number(row.matching_staged_debtor_count) === 1 &&
      particularsReferenceInvoice(
        row.particulars,
        request.invoiceId,
        invoice.customerid
      ) &&
      Array.isArray(row.journal_particulars) &&
      row.journal_particulars.length === 2 &&
      row.journal_particulars.every((particulars) =>
        particularsReferenceInvoice(
          particulars,
          request.invoiceId,
          invoice.customerid
        )
      ) &&
      Array.isArray(row.staged_particulars) &&
      row.staged_particulars.length === 2 &&
      row.staged_particulars.every((particulars) =>
        particularsReferenceInvoice(
          particulars,
          request.invoiceId,
          invoice.customerid
        )
      )
  );
  if (evidenceRows.length === 0) {
    // A non-exact row that still names this invoice is not permission to post
    // a fresh receipt. It is evidence of a partial/grouped/mismatched legacy
    // settlement and must stay review-only rather than being double-counted.
    const potentialEvidenceResult = await client.query(
      `SELECT je.id AS journal_id,
              TO_CHAR(je.entry_date, 'YYYY-MM-DD') AS entry_date,
              COALESCE(
                NULLIF(BTRIM(jel.display_reference), ''),
                NULLIF(BTRIM(je.display_reference), ''),
                BTRIM(je.reference_no)
              ) AS display_reference,
              jel.id AS line_id, jel.particulars,
              jel.credit_amount - jel.debit_amount AS receipt_amount
         FROM journal_entries je
         JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND je.entry_type = 'IMP'
          AND je.legacy_entry_type = 'REC'
          AND je.source_type = 'legacy_import'
          AND je.entry_date < $2::date
          AND jel.account_code = $1
          AND jel.credit_amount - jel.debit_amount > ${MONEY_TOLERANCE}
          AND EXISTS (
                SELECT 1
                  FROM import_legacy_rows staged
                 WHERE staged.journal_group_key = je.source_id
                   AND staged.record_kind = 'transaction'
                   AND staged.provenance = 'source_csv'
                   AND staged.repaired = false
                   AND staged.source_sha256 = ANY($3::text[])
                   AND staged.account_code = $1
                   AND staged.credit_cents > 0
              )
        ORDER BY je.entry_date, je.id, jel.id
        ${evidenceLockClause}`,
      [
        debtorAccountCode,
        TIEN_HOCK_ACCOUNTING_OPEN_DATE,
        APPROVED_IMPORT_SOURCE_HASHES,
      ]
    );
    const potentialEvidenceRows = potentialEvidenceResult.rows.filter((row) =>
      particularsReferenceInvoice(
        row.particulars,
        request.invoiceId,
        invoice.customerid
      )
    );
    if (potentialEvidenceRows.length > 0) {
      const representedPaymentResult = await client.query(
      `SELECT p.payment_id, p.invoice_id, p.amount_paid, p.payment_method,
              p.payment_reference, p.journal_entry_id,
              p.receipt_allocation_id, payment_journal.status AS journal_status,
              TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS payment_date,
              TO_CHAR(r.posting_date, 'YYYY-MM-DD') AS receipt_posting_date
         FROM payments p
         JOIN invoices represented_invoice ON represented_invoice.id = p.invoice_id
         LEFT JOIN journal_entries payment_journal ON payment_journal.id = p.journal_entry_id
         LEFT JOIN receipt_allocations ra ON ra.id = p.receipt_allocation_id
         LEFT JOIN receipts r ON r.id = ra.receipt_id
        WHERE represented_invoice.customerid = $1
          AND COALESCE(p.status, 'active') NOT IN ('cancelled', 'pending')
        ORDER BY p.payment_id`,
      [invoice.customerid]
    );
      const unmatchedRepresentations = representedPaymentResult.rows.map(
        (row) => ({
          invoiceId: String(row.invoice_id),
          amount: round2(row.amount_paid),
          paymentMethod: String(row.payment_method || ""),
          isOperationalProjection:
            row.receipt_allocation_id === null &&
            (row.journal_entry_id === null || row.journal_status === "cancelled"),
          isPureNonPosting:
            row.journal_entry_id === null && row.receipt_allocation_id === null,
          reference: String(row.payment_reference || "").trim().toUpperCase(),
          dates: new Set(
            [row.payment_date, row.receipt_posting_date]
              .filter(Boolean)
              .map(String)
          ),
          used: false,
        })
      );
      const unrepresentedEvidenceRows = potentialEvidenceRows.filter((row) => {
        const evidenceAmount = round2(row.receipt_amount);
        const evidenceDate = String(row.entry_date);
        const evidenceReference = String(row.display_reference || "")
          .trim()
          .toUpperCase();
        const matchingRepresentations = unmatchedRepresentations.filter(
          (candidate) =>
            !candidate.used &&
            Math.abs(candidate.amount - evidenceAmount) <= MONEY_TOLERANCE &&
            candidate.dates.has(evidenceDate) &&
            ((candidate.invoiceId === request.invoiceId &&
              candidate.isOperationalProjection) ||
              (candidate.paymentMethod === "contra" &&
                candidate.isPureNonPosting &&
                evidenceReference !== "" &&
                candidate.reference === evidenceReference))
        );
        if (matchingRepresentations.length !== 1) return true;
        matchingRepresentations[0].used = true;
        return false;
      });
      if (unrepresentedEvidenceRows.length > 0) {
        const references = [
          ...new Set(
            unrepresentedEvidenceRows.map((row) =>
              String(row.display_reference || row.journal_id)
            )
          ),
        ].join(", ");
        throwReconciliationError(
          `The imported ledger already contains receipt evidence for invoice ${request.invoiceId} (${references}), but its reference, amount, bank, or journal shape does not exactly match this entry. No new receipt was posted; ask the accountant to review the legacy settlement.`
        );
      }
    }
    throwReconciliationError(
      `No exact imported receipt matches invoice ${request.invoiceId}, reference ${request.paymentReference}, RM${request.amount.toFixed(
        2
      )}, and ${request.debitAccount}. The locked accounting period was not changed.`,
      IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND_CODE
    );
  }
  if (evidenceRows.length > 1) {
    throwReconciliationError(
      `More than one imported receipt matches invoice ${request.invoiceId} and reference ${request.paymentReference}. Ask the accountant to review the ambiguous ledger records; nothing was changed.`
    );
  }

  const evidence = evidenceRows[0];
  if (invoice.paymenttype !== "INVOICE" || invoiceStatus === "cancelled") {
    throwReconciliationError(
      `Invoice ${request.invoiceId} is not an open credit invoice and cannot use historical ledger reconciliation.`
    );
  }
  if (invoiceStatus === "paid" || !(invoiceBalance > 0)) {
    throwReconciliationError(
      `Invoice ${request.invoiceId} is already settled. Reload the payment list before trying again.`
    );
  }
  if (
    Math.abs(invoiceBalance - request.amount) > MONEY_TOLERANCE ||
    Math.abs(invoiceTotal - request.amount) > MONEY_TOLERANCE
  ) {
    throwReconciliationError(
      `Historical ledger reconciliation requires invoice ${request.invoiceId}'s full amount and current balance to both equal RM${request.amount.toFixed(
        2
      )}. Partial or previously adjusted invoices need accountant review.`
    );
  }
  if (Boolean(invoice.is_consolidated)) {
    throwReconciliationError(
      `Invoice ${request.invoiceId} belongs to a consolidated e-Invoice and cannot be reconciled automatically.`
    );
  }
  if (invoice.journal_entry_id !== null) {
    throwReconciliationError(
      `Invoice ${request.invoiceId} already owns an accounting journal and cannot be aligned automatically to a separate imported receipt.`
    );
  }
  if (
    debtorAccount.ledger_type !== "TD" ||
    debtorAccount.parent_code !== "DEBTOR" ||
    debtorAccount.is_active !== true
  ) {
    throwReconciliationError(
      `${invoice.customerid} is not an active Trade Debtor account, so invoice ${request.invoiceId} cannot be reconciled automatically.`
    );
  }
  if (invoiceDate > request.enteredPaymentDate) {
    throwReconciliationError(
      `The entered payment date ${request.enteredPaymentDate} is before invoice ${request.invoiceId}'s date ${invoiceDate}. Nothing was changed.`
    );
  }
  if (request.enteredPaymentDate > String(evidence.entry_date)) {
    throwReconciliationError(
      `Reference ${request.paymentReference} is already in the imported ledger on ${evidence.entry_date}, before the entered payment date ${request.enteredPaymentDate}. Use the original received date on or before ${evidence.entry_date}, then review the match again; no new receipt was posted.`
    );
  }

  const rowLockClause = lockRows ? "FOR UPDATE" : "";
  const paymentResult = await client.query(
    `SELECT payment_id, payment_method, payment_reference, status
       FROM payments
      WHERE invoice_id = $1
      ${rowLockClause}`,
    [request.invoiceId]
  );
  if (paymentResult.rows.length > 0) {
    throwReconciliationError(
      `Invoice ${request.invoiceId} already has payment history. Review it manually before reconciling the imported ledger.`
    );
  }

  const receiptLockClause = lockRows ? "FOR UPDATE OF ra, r" : "";
  const receiptResult = await client.query(
    `SELECT ra.id, r.id AS receipt_id, r.status
       FROM receipt_allocations ra
       JOIN receipts r ON r.id = ra.receipt_id
      WHERE ra.invoice_id = $1
      LIMIT 1
      ${receiptLockClause}`,
    [request.invoiceId]
  );
  if (receiptResult.rows.length > 0) {
    throwReconciliationError(
      `Invoice ${request.invoiceId} already has receipt history (#${receiptResult.rows[0].receipt_id}). Review it manually before reconciling the imported ledger.`
    );
  }

  const adjustmentResult = await client.query(
    `SELECT id, type
       FROM adjustment_documents
      WHERE original_invoice_id = $1
      LIMIT 1`,
    [request.invoiceId]
  );
  if (adjustmentResult.rows.length > 0) {
    throwReconciliationError(
      `Invoice ${request.invoiceId} has adjustment-document history (${adjustmentResult.rows[0].type} ${adjustmentResult.rows[0].id}). Review it manually before historical reconciliation.`
    );
  }

  if (
    request.expectedJournalId !== null &&
    request.expectedJournalId !== Number(evidence.journal_id)
  ) {
    throwReconciliationError(
      "The imported journal match changed after preview. Reload and review the payment again."
    );
  }
  if (
    request.expectedLineId !== null &&
    request.expectedLineId !== Number(evidence.line_id)
  ) {
    throwReconciliationError(
      "The imported ledger line match changed after preview. Reload and review the payment again."
    );
  }

  const reconciliationState = await getCustomerReconciliationState(
    client,
    debtorAccountCode,
    String(invoice.customerid)
  );
  const currentDifference = round2(
    reconciliationState.glBalance - reconciliationState.operationalBalance
  );
  if (Math.abs(currentDifference + request.amount) > MONEY_TOLERANCE) {
    throwReconciliationError(
      `The ${invoice.customerid} ledger and open-invoice difference is RM${Math.abs(
        currentDifference
      ).toFixed(2)}, not the exact RM${request.amount.toFixed(
        2
      )} needed to clear invoice ${request.invoiceId}. This may be a mixed accounting issue, so nothing was changed.`
    );
  }

  const preview = {
    code: IMPORTED_PAYMENT_RECONCILIATION_MATCH_CODE,
    invoice_id: String(invoice.id),
    customer_id: String(invoice.customerid),
    customer_name: String(invoice.customer_name || invoice.customerid),
    amount: request.amount,
    payment_reference: request.paymentReference,
    invoice_date: invoiceDate,
    entered_payment_date: request.enteredPaymentDate,
    ledger_payment_date: String(evidence.entry_date),
    payment_date_corrected:
      request.enteredPaymentDate !== String(evidence.entry_date),
    debit_account: request.debitAccount,
    evidence_journal_id: Number(evidence.journal_id),
    evidence_line_id: Number(evidence.line_id),
    gl_balance: reconciliationState.glBalance,
    operational_balance: reconciliationState.operationalBalance,
    operational_balance_after: round2(
      reconciliationState.operationalBalance - request.amount
    ),
    no_new_journal: true,
  };

  return { request, preview, debtorAccountCode };
}

/**
 * Read-only preview of an exact imported-ledger settlement.
 *
 * @param {object} client
 * @param {ImportedPaymentReconciliationPayload} payload
 * @returns {Promise<ImportedPaymentReconciliationPreview>}
 */
export async function previewImportedPaymentReconciliation(client, payload) {
  const validated = await validateImportedPayment(client, payload, false);
  return validated.preview;
}

/**
 * Block a different settlement workflow when imported receipt evidence is
 * still missing from operations. Exact matches are intentionally not
 * confirmable through this helper; the pending/overpayment action must first
 * be cancelled or reviewed in Payment Management.
 *
 * @param {object} client
 * @param {ImportedPaymentReconciliationPayload} payload
 * @param {string} operation
 * @returns {Promise<void>}
 */
export async function assertNoUnrepresentedImportedPaymentEvidence(
  client,
  payload,
  operation
) {
  try {
    const preview = await previewImportedPaymentReconciliation(client, payload);
    throwReconciliationError(
      `${operation} was not posted because invoice ${preview.invoice_id} is already settled by imported ledger payment ${preview.payment_reference} on ${preview.ledger_payment_date}. Review and confirm that existing payment from Payment Management instead.`
    );
  } catch (error) {
    if (error.code === IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND_CODE) return;
    throw error;
  }
}

/**
 * Account allocations do not identify an ERP invoice, so they cannot use the
 * confirmation workflow. They still must not recreate an exact debtor credit
 * already present in the approved legacy import.
 *
 * @param {object} client
 * @param {string} accountCode
 * @param {string|number} amount
 * @param {string|null|undefined} paymentReference
 * @returns {Promise<void>}
 */
export async function assertNoExactImportedAccountCredit(
  client,
  accountCode,
  amount,
  paymentReference
) {
  const normalizedAccountCode = String(accountCode || "").trim();
  const normalizedAmount = round2(amount);
  const normalizedReference = String(paymentReference || "").trim();
  if (!normalizedAccountCode || !(normalizedAmount > 0)) return;

  const result = await client.query(
    `SELECT je.id AS journal_id,
            COALESCE(
              NULLIF(BTRIM(jel.display_reference), ''),
              NULLIF(BTRIM(je.display_reference), ''),
              BTRIM(je.reference_no)
            ) AS display_reference
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
       JOIN account_codes ac ON ac.code = jel.account_code
      WHERE je.status = 'posted'
        AND je.entry_type = 'IMP'
        AND je.legacy_entry_type = 'REC'
        AND je.source_type = 'legacy_import'
        AND je.entry_date < $4::date
        AND jel.account_code = $1
        AND ac.ledger_type = 'TD'
        AND ac.parent_code = 'DEBTOR'
        AND ac.is_active = true
        AND ABS(COALESCE(jel.debit_amount, 0)) <= ${MONEY_TOLERANCE}
        AND ABS(COALESCE(jel.credit_amount, 0) - $2::numeric) <= ${MONEY_TOLERANCE}
        AND UPPER(COALESCE(
              NULLIF(BTRIM(jel.display_reference), ''),
              NULLIF(BTRIM(je.display_reference), ''),
              BTRIM(je.reference_no)
            )) = UPPER($3)
        AND EXISTS (
              SELECT 1
                FROM import_legacy_rows staged
               WHERE staged.journal_group_key = je.source_id
                 AND staged.record_kind = 'transaction'
                 AND staged.provenance = 'source_csv'
                 AND staged.repaired = false
                 AND staged.source_sha256 = ANY($5::text[])
                 AND staged.account_code = $1
                 AND staged.debit_cents = 0
                 AND staged.credit_cents = ROUND($2::numeric * 100)::bigint
                 AND UPPER(BTRIM(staged.journal_ref)) = UPPER($3)
            )
      ORDER BY je.id, jel.id
      LIMIT 2`,
    [
      normalizedAccountCode,
      normalizedAmount,
      normalizedReference,
      TIEN_HOCK_ACCOUNTING_OPEN_DATE,
      APPROVED_IMPORT_SOURCE_HASHES,
    ]
  );
  if (result.rows.length > 0) {
    const evidence = result.rows[0];
    throwReconciliationError(
      `Account payment ${normalizedReference || "(no reference)"} for RM${normalizedAmount.toFixed(
        2
      )} is already present in imported journal ${evidence.journal_id}. No duplicate account receipt was posted.`
    );
  }
}

/**
 * Pure excess receipts have no invoice/debtor credit to identify. Protect
 * their bank or cash-holding side from an exact replay of an approved import.
 *
 * @param {object} client
 * @param {string} debitAccount
 * @param {string|number} amount
 * @param {string|null|undefined} paymentReference
 * @returns {Promise<void>}
 */
export async function assertNoExactImportedDebitMovement(
  client,
  debitAccount,
  amount,
  paymentReference
) {
  const normalizedDebitAccount = String(debitAccount || "").trim();
  const normalizedAmount = round2(amount);
  const normalizedReference = String(paymentReference || "").trim();
  if (!normalizedDebitAccount || !(normalizedAmount > 0)) return;

  const result = await client.query(
    `SELECT je.id AS journal_id
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      WHERE je.status = 'posted'
        AND je.entry_type = 'IMP'
        AND je.legacy_entry_type = 'REC'
        AND je.source_type = 'legacy_import'
        AND je.entry_date < $4::date
        AND jel.account_code = $1
        AND ABS(COALESCE(jel.debit_amount, 0) - $2::numeric) <= ${MONEY_TOLERANCE}
        AND ABS(COALESCE(jel.credit_amount, 0)) <= ${MONEY_TOLERANCE}
        AND UPPER(COALESCE(
              NULLIF(BTRIM(jel.display_reference), ''),
              NULLIF(BTRIM(je.display_reference), ''),
              BTRIM(je.reference_no)
            )) = UPPER($3)
        AND EXISTS (
              SELECT 1
                FROM import_legacy_rows staged
               WHERE staged.journal_group_key = je.source_id
                 AND staged.record_kind = 'transaction'
                 AND staged.provenance = 'source_csv'
                 AND staged.repaired = false
                 AND staged.source_sha256 = ANY($5::text[])
                 AND staged.account_code = $1
                 AND staged.debit_cents = ROUND($2::numeric * 100)::bigint
                 AND staged.credit_cents = 0
                 AND UPPER(BTRIM(staged.journal_ref)) = UPPER($3)
            )
      ORDER BY je.id, jel.id
      LIMIT 2`,
    [
      normalizedDebitAccount,
      normalizedAmount,
      normalizedReference,
      TIEN_HOCK_ACCOUNTING_OPEN_DATE,
      APPROVED_IMPORT_SOURCE_HASHES,
    ]
  );
  if (result.rows.length > 0) {
    throwReconciliationError(
      `Payment ${normalizedReference || "(no reference)"} for RM${normalizedAmount.toFixed(
        2
      )} is already present on ${normalizedDebitAccount} in imported journal ${result.rows[0].journal_id}. No duplicate customer-deposit receipt was posted.`
    );
  }
}

/**
 * Atomically align one operational invoice to its exact imported receipt.
 * No receipt or journal is created, changed, linked, or cancelled.
 *
 * @param {object} client
 * @param {ImportedPaymentReconciliationPayload} payload
 * @param {string|number|null} userId
 * @returns {Promise<{preview: ImportedPaymentReconciliationPreview, payment: object, credit_used: number, already_reconciled: boolean}>}
 */
export async function reconcileImportedPayment(client, payload, userId) {
  const normalizedRequest = normalizeRequest(payload);
  if (
    normalizedRequest.expectedJournalId === null ||
    normalizedRequest.expectedLineId === null
  ) {
    throwReconciliationError(
      "Preview this imported payment match before confirming it.",
      IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
      400
    );
  }

  // Lock the invoice before looking for an already-created projection. This
  // makes confirmation idempotent even when two requests arrive together or
  // the first response is lost after commit.
  const idempotencyInvoiceResult = await client.query(
    `SELECT i.id, i.customerid, i.createddate, i.balance_due,
            i.invoice_status, c.name AS customer_name, c.credit_used
       FROM invoices i
       JOIN customers c ON c.id = i.customerid
      WHERE i.id = $1
      FOR UPDATE OF i, c`,
    [normalizedRequest.invoiceId]
  );
  if (idempotencyInvoiceResult.rows.length === 0) {
    throwReconciliationError(
      `Invoice ${normalizedRequest.invoiceId} was not found.`,
      IMPORTED_PAYMENT_RECONCILIATION_UNAVAILABLE_CODE,
      404
    );
  }

  const idempotencyInvoice = idempotencyInvoiceResult.rows[0];
  const idempotencyDebtorAccountCode = await resolveDebtorChildCode(
    client,
    String(idempotencyInvoice.customerid)
  );
  if (!idempotencyDebtorAccountCode) {
    throwReconciliationError(
      `No Trade Debtor account is available for invoice ${normalizedRequest.invoiceId}. Nothing was changed.`
    );
  }
  const evidenceMarker = evidenceIdentityMarker(
    normalizedRequest.expectedJournalId,
    normalizedRequest.expectedLineId
  );
  const existingPaymentResult = await client.query(
    `SELECT p.*, TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS ledger_payment_date
       FROM payments p
      WHERE p.invoice_id = $1
        AND p.payment_method = 'contra'
        AND COALESCE(p.status, 'active') = 'active'
        AND UPPER(BTRIM(COALESCE(p.payment_reference, ''))) = UPPER($2)
        AND ABS(p.amount_paid - $3::numeric) <= ${MONEY_TOLERANCE}
        AND p.journal_entry_id IS NULL
        AND p.receipt_allocation_id IS NULL
        AND POSITION($4 IN COALESCE(p.notes, '')) > 0
      FOR UPDATE`,
    [
      normalizedRequest.invoiceId,
      normalizedRequest.paymentReference,
      normalizedRequest.amount,
      evidenceMarker,
    ]
  );
  if (existingPaymentResult.rows.length > 1) {
    throwReconciliationError(
      `Invoice ${normalizedRequest.invoiceId} has duplicate imported-ledger reconciliation records. Nothing else was changed.`
    );
  }
  if (existingPaymentResult.rows.length === 1) {
    if (
      round2(idempotencyInvoice.balance_due) !== 0 ||
      String(idempotencyInvoice.invoice_status || "").toLowerCase() !== "paid"
    ) {
      throwReconciliationError(
        `Invoice ${normalizedRequest.invoiceId}'s existing imported-ledger settlement no longer agrees with its balance. Nothing was changed.`
      );
    }
    const existingPayment = existingPaymentResult.rows[0];
    const storedReconciliation = parseReconciliationStateMarker(
      existingPayment.notes
    );
    if (
      !storedReconciliation ||
      storedReconciliation.journalId !== normalizedRequest.expectedJournalId ||
      storedReconciliation.lineId !== normalizedRequest.expectedLineId
    ) {
      throwReconciliationError(
        `Invoice ${normalizedRequest.invoiceId}'s imported-ledger audit marker is missing or inconsistent. Nothing was changed.`
      );
    }
    if (
      storedReconciliation.enteredPaymentDate !==
        normalizedRequest.enteredPaymentDate ||
      storedReconciliation.paymentMethod !== normalizedRequest.paymentMethod ||
      storedReconciliation.debitAccount !== normalizedRequest.debitAccount
    ) {
      throwReconciliationError(
        "This retry does not match the originally confirmed payment date, method, or bank. Reload the invoice payment history; nothing was changed."
      );
    }
    const existingLedgerDate = String(existingPayment.ledger_payment_date);
    if (storedReconciliation.ledgerPaymentDate !== existingLedgerDate) {
      throwReconciliationError(
        `Invoice ${normalizedRequest.invoiceId}'s stored imported-ledger date is inconsistent. Nothing was changed.`
      );
    }

    const existingState = await getCustomerReconciliationState(
      client,
      idempotencyDebtorAccountCode,
      String(idempotencyInvoice.customerid)
    );
    const existingDifference = round2(
      existingState.glBalance - existingState.operationalBalance
    );
    return {
      preview: {
        code: IMPORTED_PAYMENT_RECONCILIATION_MATCH_CODE,
        invoice_id: String(idempotencyInvoice.id),
        customer_id: String(idempotencyInvoice.customerid),
        customer_name: String(
          idempotencyInvoice.customer_name || idempotencyInvoice.customerid
        ),
        amount: round2(existingPayment.amount_paid),
        payment_reference: String(existingPayment.payment_reference || ""),
        invoice_date: toLocalAccountingDateString(
          idempotencyInvoice.createddate
        ),
        entered_payment_date: storedReconciliation.enteredPaymentDate,
        ledger_payment_date: storedReconciliation.ledgerPaymentDate,
        payment_date_corrected:
          storedReconciliation.enteredPaymentDate !==
          storedReconciliation.ledgerPaymentDate,
        debit_account: storedReconciliation.debitAccount,
        evidence_journal_id: storedReconciliation.journalId,
        evidence_line_id: storedReconciliation.lineId,
        gl_balance: existingState.glBalance,
        operational_balance: existingState.operationalBalance,
        operational_balance_after: existingState.operationalBalance,
        reconciliation_warning:
          Math.abs(existingDifference) > MONEY_TOLERANCE
            ? `The invoice settlement is already recorded, but the customer's current ledger difference is RM${existingDifference.toFixed(
                2
              )}. Review that separate later difference.`
            : null,
        no_new_journal: true,
      },
      payment: {
        ...existingPayment,
        amount_paid: round2(existingPayment.amount_paid),
      },
      credit_used: round2(idempotencyInvoice.credit_used),
      already_reconciled: true,
    };
  }

  const { request, preview, debtorAccountCode } = await validateImportedPayment(
    client,
    payload,
    true
  );
  const stateMarker = reconciliationStateMarker(request, preview);
  const provenanceNote = `${stateMarker} Cheque/payment entered ${preview.entered_payment_date}; matched imported ledger/clearance ${preview.ledger_payment_date}, reference ${preview.payment_reference} (journal ${preview.evidence_journal_id}, line ${preview.evidence_line_id}); no new journal posted${
    userId ? `; confirmed by user ${userId}` : ""
  }.`;
  const paymentNotes = request.notes
    ? `${provenanceNote}\n${request.notes}`
    : provenanceNote;

  const paymentResult = await client.query(
    `INSERT INTO payments (
       invoice_id, payment_date, amount_paid, payment_method,
       payment_reference, internal_reference, bank_account,
       journal_entry_id, receipt_allocation_id, notes,
       status, is_auto_collection, created_at
     ) VALUES ($1, $2, $3, 'contra', $4, NULL, NULL, NULL, NULL, $5,
               'active', false, NOW())
     RETURNING *`,
    [
      preview.invoice_id,
      preview.ledger_payment_date,
      preview.amount,
      preview.payment_reference,
      paymentNotes,
    ]
  );

  await client.query(
    `UPDATE invoices
        SET balance_due = 0, invoice_status = 'paid'
      WHERE id = $1`,
    [preview.invoice_id]
  );

  const customerResult = await client.query(
    `UPDATE customers c
        SET credit_used = GREATEST(0, COALESCE((
          SELECT SUM(i.balance_due)
            FROM invoices i
           WHERE i.customerid = c.id
             AND i.paymenttype = 'INVOICE'
             AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
        ), 0))
      WHERE c.id = $1
      RETURNING credit_used`,
    [preview.customer_id]
  );

  const finalState = await getCustomerReconciliationState(
    client,
    debtorAccountCode,
    preview.customer_id
  );
  if (
    Math.abs(finalState.glBalance - finalState.operationalBalance) >
    MONEY_TOLERANCE
  ) {
    throwReconciliationError(
      `Invoice ${preview.invoice_id} did not reconcile to the customer ledger after the update. Nothing was saved.`
    );
  }

  return {
    preview: {
      ...preview,
      operational_balance_after: finalState.operationalBalance,
    },
    payment: {
      ...paymentResult.rows[0],
      amount_paid: round2(paymentResult.rows[0].amount_paid),
    },
    credit_used: round2(customerResult.rows[0]?.credit_used),
    already_reconciled: false,
  };
}

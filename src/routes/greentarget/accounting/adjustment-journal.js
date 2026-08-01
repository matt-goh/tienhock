// src/routes/greentarget/accounting/adjustment-journal.js
//
// Green Target adjustment journal service (phase G7). The legacy GT system
// had NO credit/debit/refund note activity at all (G7 evidence: not one
// adjustment-shaped journal in the import), so these shapes are defined fresh
// as the exact inverse of the sales/receipt shapes:
//   credit_note:  DR revenue / CR receivable   (inverse of the S journal)
//   debit_note:   DR receivable / CR revenue   (the S journal again)
//   refund_note:  DR receivable / CR PBB_1     (inverse of the REC journal)
// receivable = the original invoice's snapshotted debtor child. revenue = the
// revenue account the ORIGINAL INVOICE
// actually posted to — its organic S journal first, then its imported legacy
// journal (display_reference = invoice_number), else the sales resolution
// rule. GT posts gross with no tax line, mirroring sales (no OUTPUT_TAX
// split; TH's tax-aware shapes do not apply to a ledger that has never
// posted tax).
import { assertGreenTargetAccountingDateUnlocked } from "./posting-lock.js";
import {
  resolveGTDebtorAssignment,
  fetchGTInvoiceRevenueSplits,
  normalizeGTRevenueSplits,
  resolveGTLegacyRevenueAccount,
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
 * @param {{invoice_id: number, invoice_number: string, customer_id?: number|null, revenue_account_code?: string|null}} invoice The original greentarget.invoices row.
 * @returns {Promise<Array<{line_number: number, account_code: string, amount: number}>>}
 */
async function resolveOriginalRevenueSplits(client, invoice) {
  const stored = await fetchGTInvoiceRevenueSplits(client, invoice.invoice_id);
  if (stored.length > 0) {
    return stored;
  }
  const organic = await client.query(
    `SELECT l.account_code, l.credit_amount AS amount,
            ROW_NUMBER() OVER (
              ORDER BY COALESCE(l.display_order, l.line_number), l.line_number, l.id
            )::integer AS line_number
       FROM greentarget.journal_entries j
       JOIN greentarget.journal_entry_lines l ON l.journal_entry_id = j.id
      WHERE j.source_type = 'invoice' AND j.source_id = $1
        AND j.status = 'posted' AND l.credit_amount > 0
        AND l.account_code IN ('TGA', 'TGB', 'WS_OTH', 'WS_OTH4')
      ORDER BY line_number`,
    [String(invoice.invoice_id)]
  );
  if (organic.rows.length > 0) {
    return organic.rows.map((row) => ({
      line_number: Number(row.line_number),
      account_code: row.account_code,
      amount: Number(row.amount),
    }));
  }

  const imported = await client.query(
    `SELECT l.account_code, l.credit_amount AS amount,
            ROW_NUMBER() OVER (
              ORDER BY COALESCE(l.display_order, l.line_number), l.line_number, l.id
            )::integer AS line_number
       FROM greentarget.journal_entries j
       JOIN greentarget.journal_entry_lines l ON l.journal_entry_id = j.id
      WHERE j.entry_type = 'IMP' AND j.status = 'posted'
        AND j.display_reference = $1 AND l.credit_amount > 0
        AND l.account_code IN ('TGA', 'TGB', 'WS_OTH', 'WS_OTH4')
      ORDER BY line_number`,
    [invoice.invoice_number]
  );
  if (imported.rows.length > 0) {
    return imported.rows.map((row) => ({
      line_number: Number(row.line_number),
      account_code: row.account_code,
      amount: Number(row.amount),
    }));
  }

  let accountCode;
  if (String(invoice.revenue_account_code || "").trim()) {
    accountCode = await resolveGTRevenueAccount(client, invoice);
  } else {
    accountCode = await resolveGTLegacyRevenueAccount(client, invoice);
  }
  return [
    {
      line_number: 1,
      account_code: accountCode,
      amount: Number(invoice.total_amount),
    },
  ];
}

/**
 * @param {import("pg").PoolClient} client
 * @param {object} doc
 * @param {object} invoice
 * @returns {Promise<Array<{line_number: number, account_code: string, amount: number}>>}
 */
async function resolveAdjustmentRevenueSplits(client, doc, invoice) {
  const original = await resolveOriginalRevenueSplits(client, invoice);
  const originalAccounts = new Set(
    original.map((split) => split.account_code)
  );
  const stored = await client.query(
    `SELECT line_number, account_code, amount
       FROM greentarget.adjustment_revenue_splits
      WHERE adjustment_doc_id = $1
      ORDER BY line_number`,
    [doc.id]
  );
  if (stored.rows.length > 0) {
    const normalizedStored = normalizeGTRevenueSplits(stored.rows, doc.total_amount, {
      allowLegacyAccounts: true,
    });
    const invalidAccount = normalizedStored.find(
      (split) => !originalAccounts.has(split.account_code)
    );
    if (invalidAccount) {
      throw Object.assign(
        new Error(
          `Adjustment revenue account ${invalidAccount.account_code} was not used by invoice ${invoice.invoice_number}`
        ),
        { statusCode: 400 }
      );
    }
    return normalizedStored;
  }

  /**
   * @param {Array<{line_number: number, account_code: string, amount: number}>} splits
   * @returns {Promise<Array<{line_number: number, account_code: string, amount: number}>>}
   */
  const persist = async (splits) => {
    for (const split of splits) {
      await client.query(
        `INSERT INTO greentarget.adjustment_revenue_splits (
           adjustment_doc_id, line_number, account_code, amount
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (adjustment_doc_id, line_number) DO NOTHING`,
        [
          doc.id,
          split.line_number,
          split.account_code,
          split.amount.toFixed(2),
        ]
      );
    }
    return splits;
  };

  const isFullValue =
    Math.round(Number(doc.total_amount) * 100) ===
    Math.round(Number(invoice.total_amount) * 100);
  if (isFullValue) {
    return persist(
      normalizeGTRevenueSplits(original, doc.total_amount, {
        allowLegacyAccounts: true,
      })
    );
  }
  if (originalAccounts.size === 1) {
    return persist(
      normalizeGTRevenueSplits(
        [
          {
            line_number: 1,
            account_code: original[0].account_code,
            amount: Number(doc.total_amount),
          },
        ],
        doc.total_amount,
        { allowLegacyAccounts: true }
      )
    );
  }
  throw Object.assign(
    new Error(
      "Allocate this partial adjustment across the original invoice revenue accounts"
    ),
    { statusCode: 400 }
  );
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

  const debtorAssignment = await resolveGTDebtorAssignment(client, {
    invoice_id: invoice.invoice_id,
    customer_id: doc.customer_id ?? invoice.customer_id,
    debtor_account_code: invoice.debtor_account_code,
    receivable_account_code: invoice.receivable_account_code,
    date_issued: invoice.date_issued,
  });
  const totalAmount = Number(doc.total_amount);
  const displayReference = formatDisplayReference(doc.id);
  const description = `${displayReference} - INV/NO : ${invoice.invoice_number} /${
    doc.customer_name || "CUSTOMER"
  }`;

  let accounts;
  let lines;
  if (doc.type === "refund_note") {
    accounts = [debtorAssignment.receivableAccountCode, GT_BANK_ACCOUNT];
    lines = [
      {
        accountCode: debtorAssignment.receivableAccountCode,
        debit: totalAmount,
        reference: displayReference,
        particulars: description,
        chequeReference: doc.refund_reference || null,
        debtorSubledgerCode: debtorAssignment.debtorSubledgerCode,
      },
      {
        accountCode: GT_BANK_ACCOUNT,
        credit: totalAmount,
        reference: displayReference,
        particulars: description,
      },
    ];
  } else {
    const revenueSplits = await resolveAdjustmentRevenueSplits(
      client,
      doc,
      invoice
    );
    accounts = [
      debtorAssignment.receivableAccountCode,
      ...revenueSplits.map((split) => split.account_code),
    ];
    const revenueLines = revenueSplits.map((split) => ({
      accountCode: split.account_code,
      reference: displayReference,
      particulars: description,
      ...(doc.type === "credit_note"
        ? { debit: split.amount }
        : { credit: split.amount }),
    }));
    const receivableLine = {
      accountCode: debtorAssignment.receivableAccountCode,
      reference: displayReference,
      particulars: description,
      debtorSubledgerCode: debtorAssignment.debtorSubledgerCode,
    };
    if (doc.type === "credit_note") {
      receivableLine.credit = totalAmount;
      lines = [...revenueLines, receivableLine];
    } else {
      receivableLine.debit = totalAmount;
      lines = [receivableLine, ...revenueLines];
    }
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

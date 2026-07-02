// src/routes/sales/adjustment-docs/index.js
// CRUD + cancellation for Tien Hock Adjustment Documents
// (Credit / Debit / Refund Notes). Phase 1.
import { Router } from "express";
import {
  createCreditNoteJournalEntry,
  createDebitNoteJournalEntry,
  createRefundNoteJournalEntry,
  cancelAdjustmentJournalEntry,
} from "./accounting.js";
import { determineBankAccount } from "../../../utils/payment-helpers.js";
import {
  buildAdjustmentDocId,
  formatAdjustmentDocId,
} from "../../../utils/adjustments/formatDocId.js";
import EInvoiceApiClientFactory from "../../../utils/invoice/einvoice/EInvoiceApiClientFactory.js";
import EInvoiceSubmissionHandler from "../../../utils/invoice/einvoice/EInvoiceSubmissionHandler.js";
import { EInvoiceAdjustmentNoteTemplate } from "../../../utils/invoice/einvoice/EInvoiceAdjustmentNoteTemplate.js";
import { EInvoiceConsolidatedAdjustmentTemplate } from "../../../utils/invoice/einvoice/EInvoiceConsolidatedAdjustmentTemplate.js";
import {
  TIENHOCK_INFO,
} from "../../../utils/invoice/einvoice/companyInfo.js";

const VALID_TYPES = ["credit_note", "debit_note", "refund_note"];
const MONEY_TOLERANCE = 0.005;
const TYPE_PREFIX = {
  credit_note: "CN",
  debit_note: "DN",
  refund_note: "RN",
};

// Default table names — overridable via the `options.tables` arg of the
// factory so other companies (Jelly Polly) can reuse this whole module
// against their schema-prefixed tables (`jellypolly.*`).
const DEFAULT_TABLES = {
  docs: "adjustment_documents",
  lines: "adjustment_document_lines",
  invoices: "invoices",
  payments: "payments",
};

// ============================================================================
//                                 FACTORY
// ============================================================================
export default function (pool, myInvoisConfig, options = {}) {
  const T = { ...DEFAULT_TABLES, ...(options.tables || {}) };
  const SUPPLIER = options.supplierInfo || TIENHOCK_INFO;
  const COMPANY_PREFIX = options.companyPrefix || "TH";

  const router = Router();
  const apiClient = myInvoisConfig
    ? EInvoiceApiClientFactory.getInstance(myInvoisConfig)
    : null;
  const submissionHandler = apiClient
    ? new EInvoiceSubmissionHandler(apiClient)
    : null;

// ---------- ID generation ----------
// New scheme: {COMPANY}-{TYPE}-{YY}-{N} e.g. "TH-CN-26-1" (stored URL-safe;
// rendered as "TH/CN/26/1"). Running number is unpadded, so the max must be
// resolved numerically rather than by lexical id sort.
async function generateNextDocId(client, type, year) {
  const prefix = `${COMPANY_PREFIX}-${TYPE_PREFIX[type]}`;
  const yy = String(year).slice(-2);
  const pattern = `${prefix}-${yy}-%`;
  const result = await client.query(
    `SELECT COALESCE(display_id, id) AS display_id
       FROM ${T.docs}
      WHERE COALESCE(display_id, id) LIKE $1
        AND status = 'active'
      ORDER BY split_part(COALESCE(display_id, id), '-', 4)::int DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [pattern]
  );
  let next = 1;
  if (result.rows.length > 0) {
    const m = result.rows[0].display_id.match(
      new RegExp(`^${prefix}-${yy}-(\\d+)$`)
    );
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${yy}-${next}`;
}

function normalizeDisplayIdForType(displayId, type, year) {
  if (!displayId) return null;
  const normalized = String(displayId).trim().replace(/\//g, "-").toUpperCase();
  const typePrefix = TYPE_PREFIX[type];
  const yy = String(year).slice(-2);
  const match = new RegExp(
    `^${COMPANY_PREFIX}-${typePrefix}-${yy}-(\\d+)$`
  ).exec(normalized);
  if (!match) {
    throw new Error(
      `Document No. must stay in the ${formatAdjustmentDocId(
        `${COMPANY_PREFIX}-${typePrefix}-${yy}-1`
      )} format. Only the last number can be changed.`
    );
  }
  const runningNumber = Number.parseInt(match[1], 10);
  if (!Number.isInteger(runningNumber) || runningNumber <= 0) {
    throw new Error("Document No. running number must be greater than 0");
  }
  return buildAdjustmentDocId(COMPANY_PREFIX, typePrefix, yy, runningNumber);
}

async function findActiveDisplayIdConflict(client, displayId, lockRows = false) {
  const result = await client.query(
    `SELECT id, COALESCE(display_id, id) AS display_id
       FROM ${T.docs}
      WHERE COALESCE(display_id, id) = $1
        AND status = 'active'
      LIMIT 1
      ${lockRows ? "FOR UPDATE" : ""}`,
    [displayId]
  );
  return result.rows[0] || null;
}

async function assertDisplayIdAvailable(client, displayId) {
  const conflict = await findActiveDisplayIdConflict(client, displayId, true);
  if (conflict) {
    throw new Error(
      `Document No. ${formatAdjustmentDocId(
        displayId
      )} is already used by active document ${formatAdjustmentDocId(
        conflict.display_id
      )}. Cancel it before reusing this number.`
    );
  }
}

async function resolveInternalDocId(client, displayId) {
  const exactResult = await client.query(
    `SELECT 1 FROM ${T.docs} WHERE id = $1 LIMIT 1`,
    [displayId]
  );
  if (exactResult.rows.length === 0) return displayId;

  for (let i = 0; i < 20; i++) {
    const suffix = i === 0 ? Date.now() : `${Date.now()}-${i + 1}`;
    const candidate = `${displayId}-R${suffix}`;
    const candidateResult = await client.query(
      `SELECT 1 FROM ${T.docs} WHERE id = $1 LIMIT 1`,
      [candidate]
    );
    if (candidateResult.rows.length === 0) return candidate;
  }
  throw new Error("Could not allocate a unique internal adjustment document ID");
}

async function allocateDocIdentifiers(client, type, year, requestedDisplayId) {
  const displayId =
    requestedDisplayId || (await generateNextDocId(client, type, year));
  await assertDisplayIdAvailable(client, displayId);
  return {
    id: await resolveInternalDocId(client, displayId),
    display_id: displayId,
  };
}

// ---------- consolidation lookup ----------
async function findConsolidatedParentId(client, originalInvoiceId) {
  const result = await client.query(
    `SELECT id FROM ${T.invoices}
      WHERE is_consolidated = true
        AND invoice_status != 'cancelled'
        AND (einvoice_status IS NULL OR einvoice_status != 'cancelled')
        AND consolidated_invoices IS NOT NULL
        AND consolidated_invoices::jsonb ? CAST($1 AS TEXT)
      ORDER BY CAST(createddate AS bigint) DESC NULLS LAST
      LIMIT 1`,
    [originalInvoiceId]
  );
  return result.rows[0]?.id || null;
}

// ---------- credit_used update ----------
async function updateCustomerCredit(client, customerId, amount) {
  const result = await client.query(
    `UPDATE customers
        SET credit_used = GREATEST(0, COALESCE(credit_used, 0) + $1)
      WHERE id = $2
      RETURNING credit_used, credit_limit`,
    [amount, customerId]
  );
  if (result.rows.length === 0) {
    console.warn(`Customer ${customerId} not found when updating credit`);
  }
  return result.rows[0] || null;
}

// ---------- invoice mutation helpers ----------
function deriveInvoiceStatus(newBalance, totalPayable, previousStatus) {
  if (newBalance <= 0) {
    return previousStatus === "cancelled" ? "cancelled" : "paid";
  }
  if (previousStatus === "Overdue") return "Overdue";
  if (previousStatus === "paid") return "Unpaid";
  return previousStatus || "Unpaid";
}

async function applyBalanceDelta(client, invoiceId, delta) {
  // delta is added to balance_due. CN passes a positive delta to subtract via -=,
  // we instead just pass the signed delta directly.
  const result = await client.query(
    `SELECT id, customerid, paymenttype, balance_due, totalamountpayable, invoice_status
       FROM ${T.invoices} WHERE id = $1 FOR UPDATE`,
    [invoiceId]
  );
  if (result.rows.length === 0) throw new Error(`Invoice ${invoiceId} not found`);
  const inv = result.rows[0];

  const currentBalance = parseFloat(inv.balance_due || 0);
  const newBalance = parseFloat((currentBalance + delta).toFixed(2));
  const totalPayable = parseFloat(inv.totalamountpayable || 0);
  const newStatus = deriveInvoiceStatus(newBalance, totalPayable, inv.invoice_status);

  await client.query(
    `UPDATE ${T.invoices} SET balance_due = $1, invoice_status = $2 WHERE id = $3`,
    [newBalance, newStatus, invoiceId]
  );

  return inv;
}

async function hasReceivedPaymentForInvoice(client, invoice) {
  if (invoice.paymenttype === "CASH") return true;

  const result = await client.query(
    `SELECT 1 FROM ${T.payments}
      WHERE invoice_id = $1
        AND status IN ('active', 'overpaid')
      LIMIT 1`,
    [invoice.id]
  );
  return result.rows.length > 0;
}

async function getActiveDebitNoteTotalForInvoice(client, invoiceId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(totalamountpayable), 0) AS total
       FROM ${T.docs}
      WHERE original_invoice_id = $1
        AND type = 'debit_note'
        AND status = 'active'
        AND COALESCE(is_consolidated, false) = false`,
    [invoiceId]
  );
  return parseFloat(parseFloat(result.rows[0]?.total || 0).toFixed(2));
}

async function validateAdjustmentAmountForCreate(client, type, amount, invoice, pairedRefund) {
  if (type !== "credit_note") return;

  const originalInvoiceTotal = parseFloat(
    parseFloat(invoice.totalamountpayable || 0).toFixed(2)
  );
  const debitNoteTotal = await getActiveDebitNoteTotalForInvoice(
    client,
    invoice.id
  );
  const adjustedInvoiceTotal = parseFloat(
    (originalInvoiceTotal + debitNoteTotal).toFixed(2)
  );
  const currentBalance = parseFloat(parseFloat(invoice.balance_due || 0).toFixed(2));
  const hasReceivedPayment = await hasReceivedPaymentForInvoice(client, invoice);

  if (amount > adjustedInvoiceTotal + MONEY_TOLERANCE) {
    throw new Error(
      `Credit Note amount RM ${amount.toFixed(2)} cannot exceed adjusted invoice total RM ${adjustedInvoiceTotal.toFixed(2)}.`
    );
  }

  if (!hasReceivedPayment && amount > currentBalance + MONEY_TOLERANCE) {
    throw new Error(
      `Credit Note amount RM ${amount.toFixed(2)} cannot exceed unpaid balance RM ${currentBalance.toFixed(2)} when the invoice has no received payment.`
    );
  }

  if (pairedRefund) {
    if (!hasReceivedPayment) {
      throw new Error(
        "Cannot create paired Refund Note: invoice has no active, overpaid, or cash payment. Issue the Credit Note alone if it only reduces the outstanding balance."
      );
    }

    const refundAmount = parseFloat(pairedRefund.totalamountpayable || amount);
    if (!isFinite(refundAmount) || refundAmount <= 0) {
      throw new Error("Paired refund amount must be positive");
    }
    // Cap paired refund at the actually-received amount (adjusted total
    // minus current balance). This prevents refunding more cash than the
    // customer ever paid us, even if Check 1 above ever changes.
    const maxRefundAmount = Math.max(
      0,
      Math.min(
        amount - Math.max(currentBalance, 0),
        adjustedInvoiceTotal - Math.max(currentBalance, 0)
      )
    );
    if (maxRefundAmount <= MONEY_TOLERANCE) {
      throw new Error(
        `Cannot create paired Refund Note because Credit Note amount RM ${amount.toFixed(2)} does not exceed outstanding balance RM ${currentBalance.toFixed(2)}. Issue the Credit Note alone to reduce the balance.`
      );
    }
    if (refundAmount > maxRefundAmount + MONEY_TOLERANCE) {
      throw new Error(
        `Paired Refund Note amount RM ${refundAmount.toFixed(2)} cannot exceed refundable excess RM ${maxRefundAmount.toFixed(2)}.`
      );
    }
  }
}

// ---------- core create helpers ----------
function validateLineItems(items, type) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Adjustment document must contain at least one line item");
  }
  items.forEach((item, idx) => {
    if (item.issubtotal) return;
    if (!item.code && !item.description) {
      throw new Error(`Line ${idx + 1}: code or description required`);
    }
    const qty = Number(item.quantity);
    const price = Number(item.price);
    if (!isFinite(qty) || !isFinite(price)) {
      throw new Error(`Line ${idx + 1}: quantity/price must be numeric`);
    }
    // Reject nonsensical sign combinations. LESS keeps the same convention as
    // invoices (price stored negative). OTH/REFUND treat price as the line
    // total directly; quantity is informational and may be 0.
    const isFreeformAmount =
      item.code === "OTH" || item.code === "LESS" || item.code === "REFUND";
    if (!isFreeformAmount && qty <= 0) {
      throw new Error(`Line ${idx + 1}: quantity must be greater than 0`);
    }
    if (item.code !== "LESS" && price < 0) {
      throw new Error(`Line ${idx + 1}: price cannot be negative`);
    }
  });
  if (type === "credit_note" || type === "refund_note") {
    // amounts come in as positive on the wire; we store positive and the
    // accounting side knows it represents a reduction. Nothing extra to do.
  }
}

async function insertDoc(client, doc) {
  await client.query(
    `INSERT INTO ${T.docs} (
       id, display_id, type, original_invoice_id, customerid, salespersonid,
       createddate, reason, paired_with_id, linked_payment_id,
       references_consolidated_id,
       total_excluding_tax, tax_amount, rounding, totalamountpayable,
       refund_method, refund_reference, bank_account,
       status, journal_entry_id, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'active',$19,$20
     )`,
    [
      doc.id,
      doc.display_id || doc.id,
      doc.type,
      doc.original_invoice_id,
      doc.customerid,
      doc.salespersonid || null,
      doc.createddate,
      doc.reason || null,
      doc.paired_with_id || null,
      doc.linked_payment_id || null,
      doc.references_consolidated_id || null,
      doc.total_excluding_tax,
      doc.tax_amount,
      doc.rounding,
      doc.totalamountpayable,
      doc.refund_method || null,
      doc.refund_reference || null,
      doc.bank_account || null,
      doc.journal_entry_id || null,
      doc.created_by || null,
    ]
  );

  if (Array.isArray(doc.lines) && doc.lines.length > 0) {
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      await client.query(
        `INSERT INTO ${T.lines} (
           adjustment_doc_id, line_number, code, description, quantity,
           price, tax, total, issubtotal
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          doc.id,
          i + 1,
          line.code || null,
          line.description || null,
          line.quantity ?? null,
          line.price ?? null,
          line.tax ?? 0,
          line.total ?? 0,
          line.issubtotal ?? false,
        ]
      );
    }
  }
}

async function applyAccountingForCreate(client, doc, invoice) {
  // Compute signed balance/credit deltas + post journal entry.
  const totalAmt = parseFloat(doc.totalamountpayable);
  const isInvoiceCreditType = invoice.paymenttype === "INVOICE";

  let journalEntryId = null;

  switch (doc.type) {
    case "credit_note": {
      await applyBalanceDelta(client, doc.original_invoice_id, -totalAmt);
      if (isInvoiceCreditType) {
        await updateCustomerCredit(client, doc.customerid, -totalAmt);
      }
      journalEntryId = await createCreditNoteJournalEntry(client, doc);
      break;
    }
    case "debit_note": {
      await applyBalanceDelta(client, doc.original_invoice_id, totalAmt);
      if (isInvoiceCreditType) {
        await updateCustomerCredit(client, doc.customerid, totalAmt);
      }
      journalEntryId = await createDebitNoteJournalEntry(client, doc);
      break;
    }
    case "refund_note": {
      // Standalone RN refunds an overpayment held outside balance_due.
      // Paired RN clears the temporary credit balance created by its CN.
      if (doc.paired_with_id) {
        await applyBalanceDelta(client, doc.original_invoice_id, totalAmt);
      }
      journalEntryId = await createRefundNoteJournalEntry(client, doc);
      break;
    }
  }

  return journalEntryId;
}

async function fetchDocWithRelations(client, id) {
  const docResult = await client.query(
    `SELECT * FROM ${T.docs} WHERE id = $1`,
    [id]
  );
  if (docResult.rows.length === 0) return null;
  const doc = docResult.rows[0];

  const linesResult = await client.query(
    `SELECT id, line_number, code, description, quantity, price, tax, total, issubtotal
       FROM ${T.lines}
      WHERE adjustment_doc_id = $1
      ORDER BY line_number ASC`,
    [id]
  );
  doc.lines = linesResult.rows;

  // Surface linked payment status so the UI can warn when the overpaid
  // Payment a standalone RN references has since been cancelled.
  if (doc.linked_payment_id) {
    const payResult = await client.query(
      `SELECT payment_id, status, amount_paid, cancellation_date, cancellation_reason
         FROM ${T.payments}
        WHERE payment_id = $1`,
      [doc.linked_payment_id]
    );
    doc.linked_payment = payResult.rows[0] || null;
  }

  return doc;
}

async function fetchActiveAdjustmentOfTypeForInvoice(client, invoiceId, type) {
  const result = await client.query(
    `SELECT id, type
       FROM ${T.docs}
      WHERE original_invoice_id = $1
        AND type = $2
        AND status = 'active'
        AND COALESCE(is_consolidated, false) = false
      ORDER BY created_at DESC
      LIMIT 1`,
    [invoiceId, type]
  );
  return result.rows[0] || null;
}

// ---------- Resolve the referenced UUID for e-invoicing ----------
// For docs against individually-e-invoiced invoices, returns the original
// invoice's id+uuid. For docs against consolidated originals, returns the
// consolidated parent's id+uuid via the snapshot taken at creation time
// (`references_consolidated_id`) — falling back to a live JSONB lookup if
// the snapshot is missing.
async function resolveReferencedDocument(client, doc) {
  // 1. Original invoice has its own valid UUID
  const origResult = await client.query(
    `SELECT id, uuid, einvoice_status FROM ${T.invoices} WHERE id = $1`,
    [doc.original_invoice_id]
  );
  if (origResult.rows.length > 0) {
    const orig = origResult.rows[0];
    if (orig.uuid && orig.einvoice_status === "valid") {
      return { id: orig.id, uuid: orig.uuid };
    }
  }

  // 2. Try references_consolidated_id snapshot. If the snapshot points to a
  //    cancelled / invalid parent, fall through to the live lookup so we don't
  //    submit against a dead UUID.
  let parentId = doc.references_consolidated_id;
  let snapshotStale = false;
  if (parentId) {
    const snapshotCheck = await client.query(
      `SELECT id, uuid, einvoice_status, invoice_status
         FROM ${T.invoices} WHERE id = $1`,
      [parentId]
    );
    const snap = snapshotCheck.rows[0];
    if (
      !snap ||
      snap.invoice_status === "cancelled" ||
      snap.einvoice_status !== "valid" ||
      !snap.uuid
    ) {
      snapshotStale = true;
      parentId = null;
    }
  }

  // 3. Fallback: live lookup for an active consolidated invoice that contains
  //    the original invoice id
  if (!parentId) {
    const liveResult = await client.query(
      `SELECT id FROM ${T.invoices}
        WHERE is_consolidated = true
          AND invoice_status != 'cancelled'
          AND (einvoice_status IS NULL OR einvoice_status != 'cancelled')
          AND consolidated_invoices IS NOT NULL
          AND consolidated_invoices::jsonb ? CAST($1 AS TEXT)
        ORDER BY CAST(createddate AS bigint) DESC NULLS LAST
        LIMIT 1`,
      [doc.original_invoice_id]
    );
    parentId = liveResult.rows[0]?.id || null;
  }

  if (!parentId) return null;

  const parentResult = await client.query(
    `SELECT id, uuid, einvoice_status FROM ${T.invoices} WHERE id = $1`,
    [parentId]
  );
  if (parentResult.rows.length === 0) return null;
  const parent = parentResult.rows[0];
  if (!parent.uuid || parent.einvoice_status !== "valid") return null;

  // Persist a refreshed snapshot when the original snapshot was missing or
  // stale, so subsequent operations and reports see the live parent id.
  if (
    (!doc.references_consolidated_id || snapshotStale) &&
    parent.id !== doc.references_consolidated_id
  ) {
    try {
      await client.query(
        `UPDATE ${T.docs} SET references_consolidated_id = $1 WHERE id = $2`,
        [parent.id, doc.id]
      );
      doc.references_consolidated_id = parent.id;
    } catch (e) {
      // Non-fatal — submission can still proceed without snapshot update.
      console.warn(`Failed to refresh references_consolidated_id for ${doc.id}: ${e.message}`);
    }
  }

  return { id: parent.id, uuid: parent.uuid };
}

// ============================================================================
//                                 ROUTES
// ============================================================================

  // --- GET /api/adjustment-docs/next-number/:type ---
  router.get("/next-number/:type", async (req, res) => {
    const { type } = req.params;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid type" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const year = new Date().getFullYear();
      const nextId = await generateNextDocId(client, type, year);
      await client.query("COMMIT");
      res.json({ next_id: nextId });
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(500).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- GET /api/adjustment-docs/id-availability?type=&display_id= ---
  router.get("/id-availability", async (req, res) => {
    const { type, display_id } = req.query;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid type" });
    }
    const client = await pool.connect();
    try {
      const year = new Date().getFullYear();
      const normalizedDisplayId = normalizeDisplayIdForType(
        display_id,
        type,
        year
      );
      if (!normalizedDisplayId) {
        return res.status(400).json({ message: "display_id is required" });
      }
      const conflict = await findActiveDisplayIdConflict(
        client,
        normalizedDisplayId
      );
      res.json({
        available: !conflict,
        display_id: normalizedDisplayId,
        conflict,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- GET /api/adjustment-docs ---
  router.get("/", async (req, res) => {
    const {
      type,
      original_invoice_id,
      customerid,
      status,
      einvoice_status,
      startDate,
      endDate,
      search,
      include_cancelled = "true",
    } = req.query;

    try {
      const params = [];
      let sql = `
        SELECT a.*, i.customerid AS inv_customerid,
               i.einvoice_status AS original_invoice_einvoice_status,
               c.name AS customer_name,
               p.id AS paired_doc_id, COALESCE(p.display_id, p.id) AS paired_display_id,
               p.type AS paired_type, p.status AS paired_status,
               p.einvoice_status AS paired_einvoice_status
          FROM ${T.docs} a
          JOIN ${T.invoices} i ON a.original_invoice_id = i.id
     LEFT JOIN customers c ON a.customerid = c.id
     LEFT JOIN ${T.docs} p ON a.paired_with_id = p.id
         WHERE 1=1
      `;
      let p = 1;
      if (type) {
        params.push(type);
        sql += ` AND a.type = $${p++}`;
      }
      if (original_invoice_id) {
        params.push(original_invoice_id);
        sql += ` AND a.original_invoice_id = $${p++}`;
      }
      if (customerid) {
        params.push(customerid);
        sql += ` AND a.customerid = $${p++}`;
      }
      if (status) {
        params.push(status);
        sql += ` AND a.status = $${p++}`;
      } else if (include_cancelled !== "true") {
        sql += ` AND a.status = 'active'`;
      }
      if (einvoice_status) {
        if (einvoice_status === "null") {
          sql += ` AND a.einvoice_status IS NULL`;
        } else {
          params.push(einvoice_status);
          sql += ` AND a.einvoice_status = $${p++}`;
        }
      }
      if (startDate) {
        params.push(String(startDate));
        sql += ` AND CAST(a.createddate AS bigint) >= $${p++}::bigint`;
      }
      if (endDate) {
        params.push(String(endDate));
        sql += ` AND CAST(a.createddate AS bigint) < $${p++}::bigint`;
      }
      if (search) {
        params.push(`%${search}%`);
        const sp = `$${p++}`;
        // Ids are stored URL-safe with dashes ("TH-CN-26-1") but shown with
        // slashes ("TH/CN/26/1"); normalise slashes so searching the displayed
        // form still matches the stored id.
        params.push(`%${search.replace(/\//g, "-")}%`);
        const spId = `$${p++}`;
        sql += ` AND (COALESCE(a.display_id, a.id) ILIKE ${spId} OR a.id ILIKE ${spId} OR a.original_invoice_id ILIKE ${sp} OR c.name ILIKE ${sp})`;
      }
      sql += ` ORDER BY a.created_at DESC`;

      const result = await pool.query(sql, params);
      res.json(
        result.rows.map((r) => ({
          ...r,
          total_excluding_tax: parseFloat(r.total_excluding_tax || 0),
          tax_amount: parseFloat(r.tax_amount || 0),
          rounding: parseFloat(r.rounding || 0),
          totalamountpayable: parseFloat(r.totalamountpayable || 0),
        }))
      );
    } catch (error) {
      console.error("Error fetching adjustment documents:", error);
      res
        .status(500)
        .json({ message: "Error fetching adjustment documents", error: error.message });
    }
  });

  // --- GET /api/adjustment-docs/:id ---
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const doc = await fetchDocWithRelations(client, id);
      if (!doc) {
        return res.status(404).json({ message: "Adjustment document not found" });
      }
      res.json({
        ...doc,
        total_excluding_tax: parseFloat(doc.total_excluding_tax || 0),
        tax_amount: parseFloat(doc.tax_amount || 0),
        rounding: parseFloat(doc.rounding || 0),
        totalamountpayable: parseFloat(doc.totalamountpayable || 0),
      });
    } catch (error) {
      console.error(`Error fetching adjustment doc ${id}:`, error);
      res.status(500).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- POST /api/adjustment-docs ---
  // Atomic create. Optionally creates a paired Refund Note in the same
  // transaction when the body includes paired_refund.
  router.post("/", async (req, res) => {
    const body = req.body || {};
    const {
      type,
      display_id,
      original_invoice_id,
      reason,
      createddate, // optional override; defaults to now
      lines,
      total_excluding_tax,
      tax_amount,
      rounding,
      totalamountpayable,
      // Refund-specific
      refund_method,
      refund_reference,
      bank_account,
      linked_payment_id,
      paired_credit_note_id,
      // Pairing — present when CN form opts to also issue a Refund Note.
      paired_refund,
      // Auditing
      created_by,
    } = body;

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid adjustment document type" });
    }
    if (!original_invoice_id) {
      return res.status(400).json({ message: "original_invoice_id is required" });
    }

    try {
      validateLineItems(lines, type);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const amt = parseFloat(totalamountpayable);
    if (!isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "totalamountpayable must be a positive number" });
    }

    if (type === "refund_note") {
      if (!refund_method) {
        return res.status(400).json({ message: "Refund Note requires refund_method" });
      }
      if (refund_method !== "cash" && !bank_account) {
        return res.status(400).json({ message: "Refund Note requires bank_account for non-cash methods" });
      }
    }

    if (paired_refund && type !== "credit_note") {
      return res.status(400).json({ message: "paired_refund is only valid when type=credit_note" });
    }
    if (paired_credit_note_id && type !== "refund_note") {
      return res.status(400).json({ message: "paired_credit_note_id is only valid when type=refund_note" });
    }
    if (paired_credit_note_id && linked_payment_id) {
      return res.status(400).json({ message: "Refund Note cannot be both paired to a Credit Note and linked to an overpaid payment" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock the invoice row for the whole transaction.
      const invQuery = await client.query(
        `SELECT id, customerid, salespersonid, paymenttype, balance_due,
                totalamountpayable, invoice_status
           FROM ${T.invoices} WHERE id = $1 FOR UPDATE`,
        [original_invoice_id]
      );
      if (invQuery.rows.length === 0) {
        throw new Error(`Invoice ${original_invoice_id} not found`);
      }
      const invoice = invQuery.rows[0];

      if (invoice.invoice_status === "cancelled") {
        throw new Error(`Invoice ${original_invoice_id} is cancelled; cannot adjust`);
      }

      await validateAdjustmentAmountForCreate(
        client,
        type,
        amt,
        invoice,
        paired_refund
      );

      // Defensive backend guard: paired Refund Note requires the invoice to
      // be cash-paid or have at least one active/overpaid payment. Refusing this at the
      // route level catches stale / malicious payloads that bypass the UI
      // gating in the form.
      if (paired_refund && invoice.paymenttype !== "CASH") {
        const payCheck = await client.query(
          `SELECT 1 FROM ${T.payments}
            WHERE invoice_id = $1
              AND status IN ('active', 'overpaid')
            LIMIT 1`,
          [original_invoice_id]
        );
        if (payCheck.rows.length === 0) {
          throw new Error(
            "Cannot create paired Refund Note: invoice has no active or overpaid payment. Issue the Credit Note alone — it will reduce the customer's outstanding balance."
          );
        }
      }

      const existingAdjustment =
        type === "credit_note" || type === "debit_note"
          ? await fetchActiveAdjustmentOfTypeForInvoice(
              client,
              original_invoice_id,
              type
            )
          : null;
      let replacementCreditNote = null;
      if (paired_credit_note_id) {
        const creditNoteResult = await client.query(
          `SELECT * FROM ${T.docs}
            WHERE id = $1
              AND type = 'credit_note'
              AND original_invoice_id = $2
              AND status = 'active'
            FOR UPDATE`,
          [paired_credit_note_id, original_invoice_id]
        );
        if (creditNoteResult.rows.length === 0) {
          throw new Error(
            `Active Credit Note ${paired_credit_note_id} not found for invoice ${original_invoice_id}.`
          );
        }
        replacementCreditNote = creditNoteResult.rows[0];

        const activePairedRnResult = await client.query(
          `SELECT id FROM ${T.docs}
            WHERE type = 'refund_note'
              AND paired_with_id = $1
              AND status = 'active'
            LIMIT 1`,
          [paired_credit_note_id]
        );
        if (activePairedRnResult.rows.length > 0) {
          throw new Error(
            `Credit Note ${paired_credit_note_id} already has active Refund Note ${activePairedRnResult.rows[0].id}.`
          );
        }

        if (amt > parseFloat(replacementCreditNote.totalamountpayable || 0)) {
          throw new Error(
            `Refund amount exceeds Credit Note amount (RM ${replacementCreditNote.totalamountpayable}).`
          );
        }

        const hasReceivedPayment = await hasReceivedPaymentForInvoice(
          client,
          invoice
        );
        if (!hasReceivedPayment) {
          throw new Error(
            "Cannot create paired Refund Note: invoice has no active, overpaid, or cash payment. Issue the Credit Note alone if it only reduces the outstanding balance."
          );
        }
        const balanceBeforeCreditNote =
          parseFloat(invoice.balance_due || 0) +
          parseFloat(replacementCreditNote.totalamountpayable || 0);
        const maxRefundAmount = Math.min(
          parseFloat(replacementCreditNote.totalamountpayable || 0),
          Math.max(
            0,
            parseFloat(replacementCreditNote.totalamountpayable || 0) -
              Math.max(balanceBeforeCreditNote, 0)
          )
        );
        if (maxRefundAmount <= MONEY_TOLERANCE) {
          throw new Error(
            `Cannot create paired Refund Note because Credit Note ${formatAdjustmentDocId(
              replacementCreditNote.display_id || replacementCreditNote.id
            )} did not create a refundable excess. Issue the Credit Note alone to reduce the balance.`
          );
        }
        if (amt > maxRefundAmount + MONEY_TOLERANCE) {
          throw new Error(
            `Refund amount RM ${amt.toFixed(2)} cannot exceed refundable excess RM ${maxRefundAmount.toFixed(2)} from Credit Note ${formatAdjustmentDocId(
              replacementCreditNote.display_id || replacementCreditNote.id
            )}.`
          );
        }
      }

      if (
        existingAdjustment &&
        (!replacementCreditNote || existingAdjustment.id !== replacementCreditNote.id)
      ) {
        throw new Error(
          `Invoice ${original_invoice_id} already has active ${type.replace("_", " ")} ${existingAdjustment.id}. Cancel it before creating another ${type.replace("_", " ")}.`
        );
      }

      // For standalone refund: validate linked payment exists and is overpaid.
      if (type === "refund_note" && linked_payment_id) {
        const payQuery = await client.query(
          `SELECT payment_id, amount_paid, status FROM ${T.payments}
            WHERE payment_id = $1 AND invoice_id = $2 FOR UPDATE`,
          [linked_payment_id, original_invoice_id]
        );
        if (payQuery.rows.length === 0) {
          throw new Error(`Linked payment ${linked_payment_id} not found for this invoice`);
        }
        const pay = payQuery.rows[0];
        if (pay.status !== "overpaid") {
          throw new Error(`Linked payment is not in 'overpaid' status (current: ${pay.status})`);
        }
        // Cumulative cap: total of all active RNs against this payment plus the
        // new amount must not exceed the overpaid amount. Allows multiple partial
        // refunds against the same overpayment while preventing over-refund.
        const priorRefunds = await client.query(
          `SELECT COALESCE(SUM(totalamountpayable), 0) AS used
             FROM ${T.docs}
            WHERE linked_payment_id = $1
              AND status = 'active'
              AND type = 'refund_note'`,
          [linked_payment_id]
        );
        const alreadyRefunded = parseFloat(priorRefunds.rows[0]?.used || 0);
        const available = parseFloat(pay.amount_paid) - alreadyRefunded;
        if (amt > available + 0.005) {
          throw new Error(
            `Refund amount RM ${amt.toFixed(2)} exceeds remaining overpaid amount RM ${available.toFixed(2)} (RM ${alreadyRefunded.toFixed(2)} already refunded of RM ${parseFloat(pay.amount_paid).toFixed(2)})`
          );
        }
      }

      const referencesConsolidatedId = await findConsolidatedParentId(
        client,
        original_invoice_id
      );

      const year = new Date().getFullYear();
      const requestedDisplayId = normalizeDisplayIdForType(
        display_id,
        type,
        year
      );
      const docIds = await allocateDocIdentifiers(
        client,
        type,
        year,
        requestedDisplayId
      );
      const docId = docIds.id;
      const docCreatedDate = createddate || Date.now().toString();

      const doc = {
        id: docId,
        display_id: docIds.display_id,
        type,
        original_invoice_id,
        customerid: invoice.customerid,
        salespersonid: invoice.salespersonid,
        createddate: docCreatedDate,
        reason: reason || null,
        paired_with_id: replacementCreditNote?.id || null,
        linked_payment_id: linked_payment_id || null,
        references_consolidated_id: referencesConsolidatedId,
        total_excluding_tax: parseFloat(total_excluding_tax || 0),
        tax_amount: parseFloat(tax_amount || 0),
        rounding: parseFloat(rounding || 0),
        totalamountpayable: amt,
        refund_method: refund_method || null,
        refund_reference: refund_reference || null,
        bank_account: bank_account
          ? bank_account
          : type === "refund_note"
          ? determineBankAccount(refund_method, null)
          : null,
        lines,
        created_by: created_by || req.user?.id || null,
      };

      // 1. Apply accounting first so we have journal_entry_id ready.
      doc.journal_entry_id = await applyAccountingForCreate(client, doc, invoice);

      // 2. Insert the main doc.
      await insertDoc(client, doc);

      if (replacementCreditNote) {
        await client.query(
          `UPDATE ${T.docs} SET paired_with_id = $1 WHERE id = $2`,
          [docId, replacementCreditNote.id]
        );
      }

      // 3. Paired refund note (only when type=credit_note and toggle ON).
      let pairedDoc = null;
      if (paired_refund && type === "credit_note") {
        const rnAmount = parseFloat(paired_refund.totalamountpayable || amt);
        const rnRefundMethod = paired_refund.refund_method || "cash";
        const rnBankAccount = paired_refund.bank_account || determineBankAccount(rnRefundMethod, null);
        if (!isFinite(rnAmount) || rnAmount <= 0) {
          throw new Error("Paired refund amount must be positive");
        }
        if (rnRefundMethod !== "cash" && !paired_refund.bank_account) {
          throw new Error("Paired refund requires bank_account for non-cash methods");
        }

        const rnIds = await allocateDocIdentifiers(
          client,
          "refund_note",
          year,
          null
        );
        const rnId = rnIds.id;
        const rnDoc = {
          id: rnId,
          display_id: rnIds.display_id,
          type: "refund_note",
          original_invoice_id,
          customerid: invoice.customerid,
          salespersonid: invoice.salespersonid,
          createddate: docCreatedDate,
          reason: paired_refund.reason || reason || null,
          paired_with_id: docId,
          linked_payment_id: null,
          references_consolidated_id: referencesConsolidatedId,
          total_excluding_tax: parseFloat(paired_refund.total_excluding_tax || total_excluding_tax || 0),
          tax_amount: parseFloat(paired_refund.tax_amount || tax_amount || 0),
          rounding: parseFloat(paired_refund.rounding || 0),
          totalamountpayable: rnAmount,
          refund_method: rnRefundMethod,
          refund_reference: paired_refund.refund_reference || null,
          bank_account: rnBankAccount,
          lines: paired_refund.lines || lines,
          created_by: doc.created_by,
        };
        rnDoc.journal_entry_id = await applyAccountingForCreate(client, rnDoc, invoice);
        await insertDoc(client, rnDoc);

        // Back-link the CN to the RN.
        await client.query(
          `UPDATE ${T.docs} SET paired_with_id = $1 WHERE id = $2`,
          [rnId, docId]
        );

        pairedDoc = rnDoc;
      }

      await client.query("COMMIT");

      // Fetch final state for response.
      const fresh = await fetchDocWithRelations(client, docId);
      res.status(201).json({
        message: pairedDoc
          ? `Credit Note ${formatAdjustmentDocId(
              doc.display_id
            )} and paired Refund Note ${formatAdjustmentDocId(
              pairedDoc.display_id
            )} created`
          : `${TYPE_PREFIX[type]} ${formatAdjustmentDocId(doc.display_id)} created`,
        document: {
          ...fresh,
          total_excluding_tax: parseFloat(fresh.total_excluding_tax || 0),
          tax_amount: parseFloat(fresh.tax_amount || 0),
          rounding: parseFloat(fresh.rounding || 0),
          totalamountpayable: parseFloat(fresh.totalamountpayable || 0),
        },
        paired: pairedDoc
          ? {
              id: pairedDoc.id,
              type: pairedDoc.type,
              totalamountpayable: pairedDoc.totalamountpayable,
            }
          : null,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating adjustment document:", error);
      const message =
        error.code === "23505" &&
        String(error.constraint || "").includes("active_display_id")
          ? "Document No. is already used by an active adjustment document"
          : error.message || "Error creating adjustment document";
      res
        .status(400)
        .json({ message });
    } finally {
      client.release();
    }
  });

  // --- POST /api/adjustment-docs/:id/cancel ---
  router.post("/:id/cancel", async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const docResult = await client.query(
        `SELECT * FROM ${T.docs} WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (docResult.rows.length === 0) throw new Error("Document not found");
      const doc = docResult.rows[0];

      if (doc.status === "cancelled") {
        throw new Error(
          `Document ${formatAdjustmentDocId(
            doc.display_id || doc.id
          )} is already cancelled`
        );
      }

      // Block CN cancel if a paired active RN exists.
      if (doc.type === "credit_note" && doc.paired_with_id) {
        const pairedResult = await client.query(
          `SELECT id, status FROM ${T.docs} WHERE id = $1`,
          [doc.paired_with_id]
        );
        if (
          pairedResult.rows.length > 0 &&
          pairedResult.rows[0].status === "active"
        ) {
          throw new Error(
            `Paired Refund Note ${doc.paired_with_id} must be cancelled before cancelling this Credit Note`
          );
        }
      }

      // If e-invoice was submitted (valid/pending), MyInvois state cancellation
      // is the caller's responsibility — separate /cancel-einvoice path will
      // exist in Phase 4. We block here to avoid silent divergence.
      if (
        doc.einvoice_status === "valid" ||
        doc.einvoice_status === "pending"
      ) {
        throw new Error(
          `Document ${formatAdjustmentDocId(
            doc.display_id || doc.id
          )} has an active e-invoice (${doc.einvoice_status}). Cancel the e-invoice first.`
        );
      }

      // --- Wrapper (consolidated) row cancellation ---
      // Wrappers do NOT own balance/credit/journal impact — that lives on the
      // child docs, which posted their own accounting at creation time.
      // Cancelling the wrapper only unwinds its MyInvois identity and frees
      // the children to be re-consolidated.
      if (doc.is_consolidated) {
        const childIds = Array.isArray(doc.consolidated_adjustments)
          ? doc.consolidated_adjustments
          : doc.consolidated_adjustments
          ? JSON.parse(doc.consolidated_adjustments)
          : [];
        if (childIds.length > 0) {
          await client.query(
            `UPDATE ${T.docs}
                SET uuid = NULL,
                    submission_uid = NULL,
                    long_id = NULL,
                    datetime_validated = NULL,
                    einvoice_status = NULL
              WHERE id = ANY($1::text[])`,
            [childIds]
          );
        }

        await client.query(
          `UPDATE ${T.docs}
              SET status = 'cancelled',
                  cancellation_reason = $1,
                  cancellation_date = NOW()
            WHERE id = $2`,
          [reason || null, id]
        );

        await client.query("COMMIT");

        const freshWrapper = await fetchDocWithRelations(client, id);
        return res.json({
          message: `Consolidated wrapper ${id} cancelled. ${childIds.length} child document(s) freed for re-consolidation.`,
          document: freshWrapper,
        });
      }

      // --- Child / standalone doc cancellation ---
      // Lock the invoice for accounting reversal.
      const invResult = await client.query(
        `SELECT id, customerid, paymenttype, balance_due, totalamountpayable, invoice_status
           FROM ${T.invoices} WHERE id = $1 FOR UPDATE`,
        [doc.original_invoice_id]
      );
      if (invResult.rows.length === 0) throw new Error("Original invoice not found");
      const invoice = invResult.rows[0];
      const totalAmt = parseFloat(doc.totalamountpayable);
      const isInvoiceCreditType = invoice.paymenttype === "INVOICE";

      switch (doc.type) {
        case "credit_note": {
          // Reverse: balance back up, credit_used back up.
          await applyBalanceDelta(client, doc.original_invoice_id, totalAmt);
          if (isInvoiceCreditType) {
            await updateCustomerCredit(client, doc.customerid, totalAmt);
          }
          break;
        }
        case "debit_note": {
          await applyBalanceDelta(client, doc.original_invoice_id, -totalAmt);
          if (isInvoiceCreditType) {
            await updateCustomerCredit(client, doc.customerid, -totalAmt);
          }
          break;
        }
        case "refund_note": {
          // Standalone RN did not touch balance_due on create. Paired RN did,
          // so cancellation must restore the temporary CN credit balance.
          if (doc.paired_with_id) {
            await applyBalanceDelta(client, doc.original_invoice_id, -totalAmt);
          }
          break;
        }
      }

      if (doc.journal_entry_id) {
        await cancelAdjustmentJournalEntry(client, doc.journal_entry_id);
      }

      await client.query(
        `UPDATE ${T.docs}
            SET status = 'cancelled',
                cancellation_reason = $1,
                cancellation_date = NOW()
          WHERE id = $2`,
        [reason || null, id]
      );

      await client.query("COMMIT");

      const fresh = await fetchDocWithRelations(client, id);
      res.json({
        message: `Document ${formatAdjustmentDocId(
          doc.display_id || doc.id
        )} cancelled. Accounting reversed.`,
        document: fresh,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Error cancelling adjustment doc ${id}:`, error);
      res.status(400).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- POST /api/adjustment-docs/:id/submit-einvoice ---
  // Submit one adjustment document to MyInvois.
  router.post("/:id/submit-einvoice", async (req, res) => {
    if (!submissionHandler) {
      return res
        .status(500)
        .json({ message: "MyInvois API client is not configured" });
    }
    const { id } = req.params;
    const client = await pool.connect();
    let txActive = false;
    try {
      // Wrap the whole submit flow in a transaction with FOR UPDATE so two
      // concurrent submit clicks on the same doc serialise and the second
      // sees the first's UPDATE before deciding whether to submit.
      await client.query("BEGIN");
      txActive = true;

      const docResult = await client.query(
        `SELECT * FROM ${T.docs} WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (docResult.rows.length === 0) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(404).json({ message: "Document not found" });
      }
      const doc = docResult.rows[0];
      const docDisplayId = formatAdjustmentDocId(doc.display_id || doc.id);
      if (doc.status !== "active") {
        await client.query("ROLLBACK");
        txActive = false;
        return res
          .status(400)
          .json({ message: `Cannot submit cancelled document ${docDisplayId}` });
      }
      if (doc.einvoice_status === "valid" || doc.einvoice_status === "pending") {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message: `Document ${docDisplayId} already has e-invoice status '${doc.einvoice_status}'. Cancel or update status first.`,
        });
      }

      const linesResult = await client.query(
        `SELECT line_number, code, description, quantity, price, tax, total, issubtotal
           FROM ${T.lines}
          WHERE adjustment_doc_id = $1
          ORDER BY line_number ASC`,
        [id]
      );
      doc.lines = linesResult.rows;

      const custResult = await client.query(
        `SELECT id, name, tin_number, id_type, id_number, phone_number,
                address, state, city, email
           FROM customers WHERE id = $1`,
        [doc.customerid]
      );
      if (custResult.rows.length === 0) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message: `Customer ${doc.customerid} not found in cache. Cannot build e-invoice.`,
        });
      }
      const customer = custResult.rows[0];
      if (!customer.tin_number || !customer.id_number) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message:
            "Customer must have both TIN and ID number to submit individual e-invoice.",
        });
      }

      const referenced = await resolveReferencedDocument(client, doc);
      if (!referenced) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message:
            "Original invoice has no valid e-invoice UUID yet. Submit the original (or wait for consolidation) before submitting the adjustment.",
        });
      }

      // Build XML
      let xml;
      try {
        xml = await EInvoiceAdjustmentNoteTemplate(doc, customer, referenced, SUPPLIER);
      } catch (templateError) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message: templateError?.message || "Failed to generate XML",
          code: templateError?.code || "TEMPLATE_ERROR",
        });
      }

      const submissionResult = await submissionHandler.submitAndPollDocuments(xml);
      if (!submissionResult.success) {
        // Persist failure as 'invalid' so user can clear-and-retry
        await client.query(
          `UPDATE ${T.docs}
              SET einvoice_status = 'invalid',
                  submission_uid = $1
            WHERE id = $2`,
          [submissionResult.submissionUid || null, id]
        );
        await client.query("COMMIT");
        txActive = false;
        return res.status(400).json({
          message: submissionResult.message || "MyInvois submission failed",
          submissionResult,
        });
      }

      let uuid = null;
      let longId = null;
      let dateTimeValidated = null;
      let status = "pending";
      if (
        submissionResult.acceptedDocuments &&
        submissionResult.acceptedDocuments.length > 0
      ) {
        const accepted = submissionResult.acceptedDocuments[0];
        uuid = accepted.uuid || null;
        longId = accepted.longId || null;
        dateTimeValidated = accepted.dateTimeValidated || null;
        status = longId ? "valid" : "pending";
      }

      await client.query(
        `UPDATE ${T.docs}
            SET uuid = $1,
                submission_uid = $2,
                long_id = $3,
                datetime_validated = $4,
                einvoice_status = $5
          WHERE id = $6`,
        [
          uuid,
          submissionResult.submissionUid || null,
          longId,
          dateTimeValidated ? new Date(dateTimeValidated) : null,
          status,
          id,
        ]
      );

      await client.query("COMMIT");
      txActive = false;

      res.json({
        success: true,
        message: `Submitted ${docDisplayId} to MyInvois (status: ${status})`,
        status,
        uuid,
        longId,
        submissionResult,
      });
    } catch (error) {
      if (txActive) {
        try { await client.query("ROLLBACK"); } catch (_) {}
      }
      console.error(`Error submitting adjustment doc ${id}:`, error);
      res.status(500).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- POST /api/adjustment-docs/:id/update-status ---
  // Poll MyInvois for a doc currently in 'pending' state.
  router.post("/:id/update-status", async (req, res) => {
    if (!apiClient) {
      return res
        .status(500)
        .json({ message: "MyInvois API client is not configured" });
    }
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const docResult = await client.query(
        `SELECT id, uuid, einvoice_status, long_id, datetime_validated
           FROM ${T.docs} WHERE id = $1`,
        [id]
      );
      if (docResult.rows.length === 0) {
        return res.status(404).json({ message: "Document not found" });
      }
      const doc = docResult.rows[0];
      if (!doc.uuid) {
        return res
          .status(400)
          .json({ message: "No MyInvois UUID — nothing to check." });
      }
      if (doc.einvoice_status === "valid") {
        return res.json({
          success: true,
          message: "Already valid",
          status: doc.einvoice_status,
          longId: doc.long_id,
          dateTimeValidated: doc.datetime_validated,
        });
      }

      const remote = await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/documents/${doc.uuid}/details`
      );

      let newStatus = doc.einvoice_status || "pending";
      let newLongId = doc.long_id;
      let newDateTimeValidated = doc.datetime_validated;
      const remoteStatus = remote.status?.toLowerCase();

      if (remote.longId) {
        newStatus = "valid";
        newLongId = remote.longId;
        newDateTimeValidated = remote.dateTimeValidation
          ? new Date(remote.dateTimeValidation).toISOString()
          : newDateTimeValidated;
      } else if (remoteStatus === "invalid" || remoteStatus === "rejected") {
        newStatus = "invalid";
        newLongId = null;
        newDateTimeValidated = null;
      } else if (remoteStatus === "cancelled") {
        newStatus = "cancelled";
      }

      if (newStatus !== doc.einvoice_status) {
        await client.query(
          `UPDATE ${T.docs}
              SET einvoice_status = $1,
                  long_id = $2,
                  datetime_validated = $3
            WHERE id = $4`,
          [
            newStatus,
            newLongId,
            newDateTimeValidated ? new Date(newDateTimeValidated) : null,
            id,
          ]
        );
      }

      res.json({
        success: true,
        status: newStatus,
        longId: newLongId,
        dateTimeValidated: newDateTimeValidated,
        updated: newStatus !== doc.einvoice_status,
      });
    } catch (error) {
      console.error(`Error updating status for ${id}:`, error);
      res
        .status(500)
        .json({ message: error?.response?.data?.message || error.message });
    } finally {
      client.release();
    }
  });

  // --- POST /api/adjustment-docs/:id/cancel-einvoice ---
  // Cancel at MyInvois (PUT /documents/state/:uuid/state). Does NOT cancel
  // the local doc itself — caller should follow up with /cancel if intended.
  router.post("/:id/cancel-einvoice", async (req, res) => {
    if (!apiClient) {
      return res
        .status(500)
        .json({ message: "MyInvois API client is not configured" });
    }
    const { id } = req.params;
    const reason = req.body?.reason || "Cancelled via system";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const docResult = await client.query(
        `SELECT * FROM ${T.docs} WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (docResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Document not found" });
      }
      const doc = docResult.rows[0];
      const docDisplayId = formatAdjustmentDocId(doc.display_id || doc.id);
      const current = doc.einvoice_status?.toLowerCase();
      if (current !== "valid" && current !== "invalid") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Cannot cancel e-invoice for ${docDisplayId} with status: ${doc.einvoice_status}. Only 'valid' or 'invalid' can be cancelled.`,
        });
      }
      if (!doc.uuid) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "No MyInvois UUID — cannot cancel at MyInvois.",
        });
      }

      try {
        await apiClient.makeApiCall(
          "PUT",
          `/api/v1.0/documents/state/${doc.uuid}/state`,
          { status: "cancelled", reason }
        );
      } catch (apiError) {
        console.warn(
          `MyInvois cancel returned error for ${id}:`,
          apiError.response?.data || apiError.message
        );
        // Proceed with local cleanup — Malaysia API has known quirks where it
        // returns errors despite successful state change.
      }

      await client.query(
        `UPDATE ${T.docs}
            SET einvoice_status = 'cancelled'
          WHERE id = $1`,
        [id]
      );

      // If this is a consolidated wrapper, the children currently share its
      // UUID/long_id/etc. — propagate the cancelled e-invoice state so the UI
      // and reports don't show them as 'valid' against a dead MyInvois doc.
      let childCascade = 0;
      if (doc.is_consolidated) {
        const childIds = Array.isArray(doc.consolidated_adjustments)
          ? doc.consolidated_adjustments
          : doc.consolidated_adjustments
          ? JSON.parse(doc.consolidated_adjustments)
          : [];
        if (childIds.length > 0) {
          const result = await client.query(
            `UPDATE ${T.docs}
                SET einvoice_status = 'cancelled'
              WHERE id = ANY($1::text[])
                AND uuid = $2`,
            [childIds, doc.uuid]
          );
          childCascade = result.rowCount || 0;
        }
      }

      await client.query("COMMIT");
      res.json({
        success: true,
        message: doc.is_consolidated
          ? `E-invoice cancelled at MyInvois for consolidated wrapper ${docDisplayId}. ${childCascade} child document(s) marked cancelled. Local accounting impact on children remains until you cancel the wrapper.`
          : `E-invoice cancelled at MyInvois for ${docDisplayId}. Local accounting impact remains until you cancel the document.`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Error cancelling e-invoice for ${id}:`, error);
      res.status(500).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- GET /api/adjustment-docs/eligible-for-consolidation ---
  // Returns active adjustment docs in the target month whose original invoice
  // has a parent consolidated invoice with a valid UUID, and which haven't
  // been e-invoiced yet (or were rejected).
  router.get("/eligible-for-consolidation", async (req, res) => {
    const { type, month, year } = req.query;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid or missing type" });
    }
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (isNaN(m) || isNaN(y)) {
      return res.status(400).json({ message: "Invalid month/year" });
    }

    try {
      const startDate = new Date(`${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00+08:00`);
      const endYear = m === 11 ? y + 1 : y;
      const endMonth = m === 11 ? 0 : m + 1;
      const endDate = new Date(`${endYear}-${String(endMonth + 1).padStart(2, "0")}-01T00:00:00+08:00`);

      const result = await pool.query(
        `SELECT a.*, i.invoice_status AS orig_invoice_status,
                con.id AS parent_id, con.uuid AS parent_uuid,
                con.einvoice_status AS parent_einvoice_status
           FROM ${T.docs} a
           JOIN ${T.invoices} i ON a.original_invoice_id = i.id
      LEFT JOIN ${T.invoices} con
                  ON con.is_consolidated = true
                 AND con.invoice_status != 'cancelled'
                 AND con.einvoice_status = 'valid'
                 AND con.consolidated_invoices IS NOT NULL
                 AND con.consolidated_invoices::jsonb ? CAST(a.original_invoice_id AS TEXT)
          WHERE a.type = $1
            AND a.status = 'active'
            AND a.is_consolidated = false
            AND (a.einvoice_status IS NULL OR a.einvoice_status = 'invalid')
            AND CAST(a.createddate AS bigint) >= $2::bigint
            AND CAST(a.createddate AS bigint) < $3::bigint
            AND con.id IS NOT NULL
          ORDER BY a.created_at ASC`,
        [type, startDate.getTime().toString(), endDate.getTime().toString()]
      );
      res.json({
        success: true,
        data: result.rows.map((r) => ({
          ...r,
          total_excluding_tax: parseFloat(r.total_excluding_tax || 0),
          tax_amount: parseFloat(r.tax_amount || 0),
          rounding: parseFloat(r.rounding || 0),
          totalamountpayable: parseFloat(r.totalamountpayable || 0),
        })),
      });
    } catch (error) {
      console.error("Error fetching eligible adjustment docs:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // --- POST /api/adjustment-docs/submit-consolidated ---
  // Body: { type, adjustmentDocIds: [...] }. All docs must share the same type
  // and the same parent consolidated invoice.
  router.post("/submit-consolidated", async (req, res) => {
    if (!submissionHandler) {
      return res
        .status(500)
        .json({ message: "MyInvois API client is not configured" });
    }
    const { type, adjustmentDocIds } = req.body || {};
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid type" });
    }
    if (!Array.isArray(adjustmentDocIds) || adjustmentDocIds.length === 0) {
      return res.status(400).json({ message: "adjustmentDocIds required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const docsResult = await client.query(
        `SELECT * FROM ${T.docs}
          WHERE id = ANY($1::text[])
            AND type = $2
            AND status = 'active'
          FOR UPDATE`,
        [adjustmentDocIds, type]
      );
      if (docsResult.rows.length !== adjustmentDocIds.length) {
        throw new Error(
          "Some adjustment documents were not found, not active, or have a different type"
        );
      }
      const docs = docsResult.rows;

      if (docs.some((d) => d.is_consolidated)) {
        throw new Error(
          "One of the selected documents is itself a consolidated wrapper"
        );
      }
      if (docs.some((d) => d.einvoice_status === "valid" || d.einvoice_status === "pending")) {
        throw new Error("Some docs already have an active e-invoice submission");
      }

      // All must share the same parent
      const parentIds = new Set(
        docs.map((d) => d.references_consolidated_id).filter(Boolean)
      );
      if (parentIds.size === 0) {
        // Try live lookup for each doc; require all to resolve to the same parent
        for (const d of docs) {
          const ref = await resolveReferencedDocument(client, d);
          if (!ref) throw new Error(`No parent consolidated invoice found for ${d.id}`);
          d.references_consolidated_id = ref.id;
          parentIds.add(ref.id);
        }
      }
      if (parentIds.size !== 1) {
        throw new Error(
          "All adjustment documents must reference the same parent consolidated invoice"
        );
      }
      const parentId = [...parentIds][0];

      const parentResult = await client.query(
        `SELECT id, uuid, einvoice_status, invoice_status FROM ${T.invoices}
          WHERE id = $1 FOR UPDATE`,
        [parentId]
      );
      if (
        parentResult.rows.length === 0 ||
        !parentResult.rows[0].uuid ||
        parentResult.rows[0].einvoice_status !== "valid" ||
        parentResult.rows[0].invoice_status === "cancelled"
      ) {
        throw new Error("Parent consolidated invoice has no valid UUID");
      }
      const parent = parentResult.rows[0];

      // Generate consolidated id: CON-{CN|DN|RN}-{YYYYMM}-{seq}
      const now = new Date();
      const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const prefix = `CON-${TYPE_PREFIX[type]}-${yyyymm}`;
      const seqResult = await client.query(
        `SELECT id FROM ${T.docs}
          WHERE id LIKE $1 AND is_consolidated = true
          ORDER BY id DESC LIMIT 1`,
        [`${prefix}-%`]
      );
      let nextSeq = 1;
      if (seqResult.rows.length > 0) {
        const m = seqResult.rows[0].id.match(new RegExp(`^${prefix}-(\\d+)$`));
        if (m) nextSeq = parseInt(m[1], 10) + 1;
      }
      const consolidatedId = `${prefix}-${nextSeq}`;

      const xml = await EInvoiceConsolidatedAdjustmentTemplate({
        consolidatedId,
        type,
        childDocs: docs,
        parent: { id: parent.id, uuid: parent.uuid },
        supplierInfo: SUPPLIER,
      });

      // Final re-check immediately before the MyInvois network round-trip:
      // the parent could have been cancelled between the earlier fetch and
      // here (it's a different row, not held by our FOR UPDATE on docs).
      const parentRecheck = await client.query(
        `SELECT einvoice_status, invoice_status FROM ${T.invoices} WHERE id = $1`,
        [parent.id]
      );
      const pr = parentRecheck.rows[0];
      if (
        !pr ||
        pr.einvoice_status !== "valid" ||
        pr.invoice_status === "cancelled"
      ) {
        throw new Error(
          "Parent consolidated invoice was cancelled or invalidated mid-flow; aborting submission."
        );
      }

      const submissionResult = await submissionHandler.submitAndPollDocuments(xml);
      if (!submissionResult.success) {
        throw new Error(
          submissionResult.message || "MyInvois consolidated submission failed"
        );
      }

      let uuid = null;
      let longId = null;
      let dateTimeValidated = null;
      let status = "pending";
      if (
        submissionResult.acceptedDocuments &&
        submissionResult.acceptedDocuments.length > 0
      ) {
        const accepted = submissionResult.acceptedDocuments[0];
        uuid = accepted.uuid || null;
        longId = accepted.longId || null;
        dateTimeValidated = accepted.dateTimeValidated || null;
        status = longId ? "valid" : "pending";
      }

      // Calculate totals for the wrapper row
      const totals = docs.reduce(
        (acc, d) => ({
          subtotal: acc.subtotal + Number(d.total_excluding_tax || 0),
          tax: acc.tax + Number(d.tax_amount || 0),
          rounding: acc.rounding + Number(d.rounding || 0),
          total: acc.total + Number(d.totalamountpayable || 0),
        }),
        { subtotal: 0, tax: 0, rounding: 0, total: 0 }
      );

      // Insert wrapper row
      await client.query(
        `INSERT INTO ${T.docs} (
           id, type, original_invoice_id, customerid, salespersonid,
           createddate, reason,
           total_excluding_tax, tax_amount, rounding, totalamountpayable,
           uuid, submission_uid, long_id, datetime_validated, einvoice_status,
           is_consolidated, consolidated_adjustments,
           references_consolidated_id, status, created_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18,'active',$19
         )`,
        [
          consolidatedId,
          type,
          parent.id, // pointer to the parent consolidated invoice
          "Consolidated customers",
          "SYSTEM",
          Date.now().toString(),
          `Consolidated ${docs.length} ${TYPE_PREFIX[type]}(s) for ${parent.id}`,
          totals.subtotal,
          totals.tax,
          totals.rounding,
          totals.total,
          uuid,
          submissionResult.submissionUid || null,
          longId,
          dateTimeValidated ? new Date(dateTimeValidated) : null,
          status,
          JSON.stringify(docs.map((d) => d.id)),
          parent.id,
          req.user?.id || null,
        ]
      );

      // Mark children as consolidated — they share the wrapper's e-invoice fields
      await client.query(
        `UPDATE ${T.docs}
            SET uuid = $1,
                submission_uid = $2,
                long_id = $3,
                datetime_validated = $4,
                einvoice_status = $5
          WHERE id = ANY($6::text[])`,
        [
          uuid,
          submissionResult.submissionUid || null,
          longId,
          dateTimeValidated ? new Date(dateTimeValidated) : null,
          status,
          adjustmentDocIds,
        ]
      );

      await client.query("COMMIT");
      res.json({
        success: true,
        message: `Consolidated submission ${consolidatedId} created (status: ${status})`,
        consolidated_id: consolidatedId,
        status,
        uuid,
        longId,
        childCount: docs.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error in consolidated adjustment submission:", error);
      res.status(400).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- GET /api/adjustment-docs/consolidated-history ---
  router.get("/consolidated-history", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    try {
      let sql = `
        SELECT * FROM ${T.docs}
         WHERE is_consolidated = true
      `;
      const params = [];
      if (!isNaN(year)) {
        const start = new Date(`${year}-01-01T00:00:00+08:00`).getTime();
        const end = new Date(`${year + 1}-01-01T00:00:00+08:00`).getTime();
        params.push(start.toString(), end.toString());
        sql += ` AND CAST(createddate AS bigint) >= $1::bigint AND CAST(createddate AS bigint) < $2::bigint`;
      }
      sql += ` ORDER BY created_at DESC`;
      const result = await pool.query(sql, params);
      res.json(
        result.rows.map((r) => ({
          ...r,
          total_excluding_tax: parseFloat(r.total_excluding_tax || 0),
          tax_amount: parseFloat(r.tax_amount || 0),
          rounding: parseFloat(r.rounding || 0),
          totalamountpayable: parseFloat(r.totalamountpayable || 0),
        }))
      );
    } catch (error) {
      console.error("Error fetching consolidated history:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // --- POST /api/adjustment-docs/:id/clear-einvoice-status ---
  // Used after a failed submission to allow re-submission. Does NOT touch
  // MyInvois — only clears local einvoice_status when it's null/invalid.
  router.post("/:id/clear-einvoice-status", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        `UPDATE ${T.docs}
            SET einvoice_status = NULL,
                uuid = NULL,
                submission_uid = NULL,
                long_id = NULL,
                datetime_validated = NULL
          WHERE id = $1
            AND (einvoice_status IS NULL OR einvoice_status = 'invalid')
          RETURNING id, einvoice_status`,
        [id]
      );
      if (result.rows.length === 0) {
        return res
          .status(400)
          .json({ message: "Document not in a clearable e-invoice state" });
      }
      res.json({ message: "E-invoice status cleared", document: result.rows[0] });
    } catch (error) {
      console.error("Error clearing einvoice status:", error);
      res.status(500).json({ message: error.message });
    }
  });

  return router;
}

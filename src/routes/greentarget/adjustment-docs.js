// src/routes/greenTarget/adjustment-docs.js
// Green Target Adjustment Documents (Credit / Debit / Refund Notes).
// Phase 7 — forked from the Tien Hock / Jelly Polly factory because GT's
// schema diverges meaningfully:
//   - integer invoice_id PK + string invoice_number (vs TH single-string id)
//   - date_issued (date) vs createddate (unix ms text)
//   - column names: amount_before_tax / tax_amount / total_amount
//   - no salesperson, no `journal_entries`, no customers.credit_used
//   - no 'overpaid' payment status — paired RN only (standalone RN out of scope)
// Mirrors TH endpoint shape (next-number, list, get, create, cancel,
// submit-einvoice, update-status, cancel-einvoice, clear-einvoice-status,
// eligible-for-consolidation, submit-consolidated, consolidated-history).
import { Router } from "express";
import { determineBankAccount } from "../../utils/payment-helpers.js";
import { formatAdjustmentDocId } from "../../utils/adjustments/formatDocId.js";
import GTEInvoiceApiClientFactory from "../../utils/greenTarget/einvoice/GTEInvoiceApiClientFactory.js";
import GTEInvoiceSubmissionHandler from "../../utils/greenTarget/einvoice/GTEInvoiceSubmissionHandler.js";
import { GTEInvoiceAdjustmentNoteTemplate } from "../../utils/greenTarget/einvoice/GTEInvoiceAdjustmentNoteTemplate.js";
import { GTEInvoiceConsolidatedAdjustmentTemplate } from "../../utils/greenTarget/einvoice/GTEInvoiceConsolidatedAdjustmentTemplate.js";
import { GREENTARGET_INFO } from "../../utils/invoice/einvoice/companyInfo.js";

const VALID_TYPES = ["credit_note", "debit_note", "refund_note"];
const MONEY_TOLERANCE = 0.005;
const TYPE_PREFIX = {
  credit_note: "GT-CN",
  debit_note: "GT-DN",
  refund_note: "GT-RN",
};

export default function (pool, myInvoisGTConfig) {
  const router = Router();
  const apiClient = myInvoisGTConfig
    ? GTEInvoiceApiClientFactory.getInstance(myInvoisGTConfig)
    : null;
  const submissionHandler = apiClient
    ? new GTEInvoiceSubmissionHandler(apiClient)
    : null;

  // ============================================================================
  //                                 HELPERS
  // ============================================================================

  // New scheme: GT-{TYPE}-{YY}-{N} e.g. "GT-CN-26-1" (stored URL-safe; rendered
  // as "GT/CN/26/1"). Running number is unpadded, so resolve the max
  // numerically rather than by lexical id sort.
  async function generateNextDocId(client, type, year) {
    const prefix = TYPE_PREFIX[type];
    const yy = String(year).slice(-2);
    const pattern = `${prefix}-${yy}-%`;
    const result = await client.query(
      `SELECT id FROM greentarget.adjustment_documents
        WHERE id LIKE $1
        ORDER BY split_part(id, '-', 4)::int DESC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [pattern]
    );
    let next = 1;
    if (result.rows.length > 0) {
      const m = result.rows[0].id.match(
        new RegExp(`^${prefix}-${yy}-(\\d+)$`)
      );
      if (m) next = parseInt(m[1], 10) + 1;
    }
    return `${prefix}-${yy}-${next}`;
  }

  // Returns { id: integer, invoice_number: string } of the parent consolidated
  // invoice that contains `originalInvoiceNumber` in its consolidated_invoices
  // JSONB map. Null when not found / not eligible.
  async function findConsolidatedParent(client, originalInvoiceNumber) {
    const result = await client.query(
      `SELECT invoice_id, invoice_number FROM greentarget.invoices
        WHERE is_consolidated = TRUE
          AND status != 'cancelled'
          AND (einvoice_status IS NULL OR einvoice_status != 'cancelled')
          AND consolidated_invoices IS NOT NULL
          AND consolidated_invoices::jsonb ? CAST($1 AS TEXT)
        ORDER BY date_issued DESC NULLS LAST
        LIMIT 1`,
      [originalInvoiceNumber]
    );
    if (result.rows.length === 0) return null;
    return {
      invoice_id: result.rows[0].invoice_id,
      invoice_number: result.rows[0].invoice_number,
    };
  }

  // Re-derive invoice status from new balance. Preserves cancelled,
  // re-flags as 'paid' when balance hits 0, otherwise reverts to 'active'.
  // (GT's overdue derivation lives outside this module — we don't promote
  // active→overdue here.)
  function deriveInvoiceStatus(newBalance, previousStatus) {
    if (previousStatus === "cancelled") return "cancelled";
    if (newBalance <= MONEY_TOLERANCE) return "paid";
    if (previousStatus === "overdue") return "overdue";
    return "active";
  }

  async function applyBalanceDelta(client, invoiceId, delta) {
    const result = await client.query(
      `SELECT invoice_id, balance_due, status
         FROM greentarget.invoices WHERE invoice_id = $1 FOR UPDATE`,
      [invoiceId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    const inv = result.rows[0];
    const currentBalance = parseFloat(inv.balance_due || 0);
    const newBalance = parseFloat((currentBalance + delta).toFixed(2));
    const newStatus = deriveInvoiceStatus(newBalance, inv.status);

    await client.query(
      `UPDATE greentarget.invoices
          SET balance_due = $1, status = $2
        WHERE invoice_id = $3`,
      [newBalance, newStatus, invoiceId]
    );

    return inv;
  }

  // GT considers a payment "received" when it has any non-cancelled payment.
  async function hasReceivedPaymentForInvoice(client, invoiceId) {
    const result = await client.query(
      `SELECT 1 FROM greentarget.payments
        WHERE invoice_id = $1
          AND (status IS NULL OR status = 'active')
        LIMIT 1`,
      [invoiceId]
    );
    return result.rows.length > 0;
  }

  async function getActiveDebitNoteTotalForInvoice(client, invoiceId) {
    const result = await client.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
         FROM greentarget.adjustment_documents
        WHERE original_invoice_id = $1
          AND type = 'debit_note'
          AND status = 'active'
          AND COALESCE(is_consolidated, false) = false`,
      [invoiceId]
    );
    return parseFloat(parseFloat(result.rows[0]?.total || 0).toFixed(2));
  }

  async function validateAdjustmentAmountForCreate(
    client,
    type,
    amount,
    invoice,
    pairedRefund
  ) {
    if (type !== "credit_note") return;

    const originalInvoiceTotal = parseFloat(
      parseFloat(invoice.total_amount || 0).toFixed(2)
    );
    const debitNoteTotal = await getActiveDebitNoteTotalForInvoice(
      client,
      invoice.invoice_id
    );
    const adjustedInvoiceTotal = parseFloat(
      (originalInvoiceTotal + debitNoteTotal).toFixed(2)
    );
    const currentBalance = parseFloat(
      parseFloat(invoice.balance_due || 0).toFixed(2)
    );
    const hasReceivedPayment = await hasReceivedPaymentForInvoice(
      client,
      invoice.invoice_id
    );

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
          "Cannot create paired Refund Note: invoice has no active payment. Issue the Credit Note alone."
        );
      }
      const refundAmount = parseFloat(pairedRefund.total_amount || amount);
      if (!isFinite(refundAmount) || refundAmount <= 0) {
        throw new Error("Paired refund amount must be positive");
      }
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

  function validateLineItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Adjustment document must contain at least one line item");
    }
    items.forEach((item, idx) => {
      if (item.issubtotal) return;
      if (!item.description) {
        throw new Error(`Line ${idx + 1}: description required`);
      }
      const qty = Number(item.quantity);
      const price = Number(item.price);
      if (!isFinite(qty) || !isFinite(price)) {
        throw new Error(`Line ${idx + 1}: quantity/price must be numeric`);
      }
      if (qty <= 0) {
        throw new Error(`Line ${idx + 1}: quantity must be greater than 0`);
      }
      if (price < 0) {
        throw new Error(`Line ${idx + 1}: price cannot be negative`);
      }
    });
  }

  async function insertDoc(client, doc) {
    await client.query(
      `INSERT INTO greentarget.adjustment_documents (
         id, type, original_invoice_id, original_invoice_number,
         customer_id, customer_name, date_issued, reason,
         paired_with_id, references_consolidated_id,
         amount_before_tax, tax_amount, total_amount,
         refund_method, refund_reference, bank_account,
         status, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',$17
       )`,
      [
        doc.id,
        doc.type,
        doc.original_invoice_id,
        doc.original_invoice_number,
        doc.customer_id || null,
        doc.customer_name || null,
        doc.date_issued,
        doc.reason || null,
        doc.paired_with_id || null,
        doc.references_consolidated_id || null,
        doc.amount_before_tax,
        doc.tax_amount,
        doc.total_amount,
        doc.refund_method || null,
        doc.refund_reference || null,
        doc.bank_account || null,
        doc.created_by || null,
      ]
    );

    if (Array.isArray(doc.lines) && doc.lines.length > 0) {
      for (let i = 0; i < doc.lines.length; i++) {
        const line = doc.lines[i];
        await client.query(
          `INSERT INTO greentarget.adjustment_document_lines (
             adjustment_doc_id, line_number, description, quantity,
             price, tax, total, issubtotal
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            doc.id,
            i + 1,
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

  // Compute signed balance delta. CN reduces, DN increases. Paired RN restores
  // the temp balance created by its CN. (GT has no journal entries to post and
  // no customers.credit_used to maintain.)
  async function applyAccountingForCreate(client, doc) {
    const totalAmt = parseFloat(doc.total_amount);
    switch (doc.type) {
      case "credit_note":
        await applyBalanceDelta(client, doc.original_invoice_id, -totalAmt);
        break;
      case "debit_note":
        await applyBalanceDelta(client, doc.original_invoice_id, totalAmt);
        break;
      case "refund_note":
        if (doc.paired_with_id) {
          await applyBalanceDelta(client, doc.original_invoice_id, totalAmt);
        }
        break;
    }
  }

  async function fetchDocWithRelations(client, id) {
    const docResult = await client.query(
      `SELECT * FROM greentarget.adjustment_documents WHERE id = $1`,
      [id]
    );
    if (docResult.rows.length === 0) return null;
    const doc = docResult.rows[0];

    const linesResult = await client.query(
      `SELECT id, line_number, description, quantity, price, tax, total, issubtotal
         FROM greentarget.adjustment_document_lines
        WHERE adjustment_doc_id = $1
        ORDER BY line_number ASC`,
      [id]
    );
    doc.lines = linesResult.rows;
    return doc;
  }

  async function fetchActiveAdjustmentOfTypeForInvoice(client, invoiceId, type) {
    const result = await client.query(
      `SELECT id, type
         FROM greentarget.adjustment_documents
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

  // Resolve the referenced UUID for e-invoicing. For docs against
  // individually-e-invoiced invoices, returns the original invoice's
  // invoice_number + uuid. For consolidated originals, returns the parent
  // consolidated invoice's invoice_number + uuid via the snapshot
  // (`references_consolidated_id`), falling back to a live JSONB lookup.
  async function resolveReferencedDocument(client, doc) {
    const origResult = await client.query(
      `SELECT invoice_id, invoice_number, uuid, einvoice_status
         FROM greentarget.invoices WHERE invoice_id = $1`,
      [doc.original_invoice_id]
    );
    if (origResult.rows.length > 0) {
      const orig = origResult.rows[0];
      if (orig.uuid && orig.einvoice_status === "valid") {
        return { id: orig.invoice_number, uuid: orig.uuid };
      }
    }

    let parentId = doc.references_consolidated_id;
    let snapshotStale = false;
    if (parentId) {
      const snapshotCheck = await client.query(
        `SELECT invoice_id, invoice_number, uuid, einvoice_status, status
           FROM greentarget.invoices WHERE invoice_id = $1`,
        [parentId]
      );
      const snap = snapshotCheck.rows[0];
      if (
        !snap ||
        snap.status === "cancelled" ||
        snap.einvoice_status !== "valid" ||
        !snap.uuid
      ) {
        snapshotStale = true;
        parentId = null;
      }
    }

    if (!parentId) {
      const liveResult = await client.query(
        `SELECT invoice_id FROM greentarget.invoices
          WHERE is_consolidated = TRUE
            AND status != 'cancelled'
            AND (einvoice_status IS NULL OR einvoice_status != 'cancelled')
            AND consolidated_invoices IS NOT NULL
            AND consolidated_invoices::jsonb ? CAST($1 AS TEXT)
          ORDER BY date_issued DESC NULLS LAST
          LIMIT 1`,
        [doc.original_invoice_number]
      );
      parentId = liveResult.rows[0]?.invoice_id || null;
    }

    if (!parentId) return null;

    const parentResult = await client.query(
      `SELECT invoice_id, invoice_number, uuid, einvoice_status
         FROM greentarget.invoices WHERE invoice_id = $1`,
      [parentId]
    );
    if (parentResult.rows.length === 0) return null;
    const parent = parentResult.rows[0];
    if (!parent.uuid || parent.einvoice_status !== "valid") return null;

    if (
      (!doc.references_consolidated_id || snapshotStale) &&
      parent.invoice_id !== doc.references_consolidated_id
    ) {
      try {
        await client.query(
          `UPDATE greentarget.adjustment_documents
              SET references_consolidated_id = $1 WHERE id = $2`,
          [parent.invoice_id, doc.id]
        );
        doc.references_consolidated_id = parent.invoice_id;
      } catch (e) {
        console.warn(
          `Failed to refresh references_consolidated_id for ${doc.id}: ${e.message}`
        );
      }
    }

    return { id: parent.invoice_number, uuid: parent.uuid };
  }

  // ============================================================================
  //                                 ROUTES
  // ============================================================================

  // --- GET /next-number/:type ---
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

  // --- GET / (list with filters) ---
  router.get("/", async (req, res) => {
    const {
      type,
      original_invoice_id,
      original_invoice_number,
      customer_id,
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
        SELECT a.*, i.einvoice_status AS original_invoice_einvoice_status,
               c.name AS joined_customer_name,
               p.id AS paired_doc_id, p.type AS paired_type, p.status AS paired_status,
               p.einvoice_status AS paired_einvoice_status
          FROM greentarget.adjustment_documents a
     LEFT JOIN greentarget.invoices i ON a.original_invoice_id = i.invoice_id
     LEFT JOIN greentarget.customers c ON a.customer_id = c.customer_id
     LEFT JOIN greentarget.adjustment_documents p ON a.paired_with_id = p.id
         WHERE 1=1
      `;
      let p = 1;
      if (type) {
        params.push(type);
        sql += ` AND a.type = $${p++}`;
      }
      if (original_invoice_id) {
        params.push(parseInt(original_invoice_id, 10));
        sql += ` AND a.original_invoice_id = $${p++}`;
      }
      if (original_invoice_number) {
        params.push(original_invoice_number);
        sql += ` AND a.original_invoice_number = $${p++}`;
      }
      if (customer_id) {
        params.push(parseInt(customer_id, 10));
        sql += ` AND a.customer_id = $${p++}`;
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
        params.push(startDate);
        sql += ` AND a.date_issued >= $${p++}::date`;
      }
      if (endDate) {
        params.push(endDate);
        sql += ` AND a.date_issued <= $${p++}::date`;
      }
      if (search) {
        params.push(`%${search}%`);
        const sp = `$${p++}`;
        // Ids are stored URL-safe with dashes ("GT-CN-26-1") but shown with
        // slashes ("GT/CN/26/1"); normalise slashes so searching the displayed
        // form still matches the stored id.
        params.push(`%${search.replace(/\//g, "-")}%`);
        const spId = `$${p++}`;
        sql += ` AND (a.id ILIKE ${spId} OR a.original_invoice_number ILIKE ${sp} OR COALESCE(a.customer_name, c.name) ILIKE ${sp})`;
      }
      sql += ` ORDER BY a.created_at DESC`;

      const result = await pool.query(sql, params);
      res.json(
        result.rows.map((r) => ({
          ...r,
          amount_before_tax: parseFloat(r.amount_before_tax || 0),
          tax_amount: parseFloat(r.tax_amount || 0),
          total_amount: parseFloat(r.total_amount || 0),
        }))
      );
    } catch (error) {
      console.error("Error fetching GT adjustment documents:", error);
      res
        .status(500)
        .json({ message: "Error fetching adjustment documents", error: error.message });
    }
  });

  // --- GET /eligible-for-consolidation ---
  // (defined before /:id so the path doesn't get captured)
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
      // date_issued is a DATE; use ISO bounds for the target month.
      const startDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const endYear = m === 11 ? y + 1 : y;
      const endMonth = m === 11 ? 0 : m + 1;
      const endDate = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01`;

      const result = await pool.query(
        `SELECT a.*, i.status AS orig_invoice_status,
                con.invoice_id AS parent_id,
                con.invoice_number AS parent_invoice_number,
                con.uuid AS parent_uuid,
                con.einvoice_status AS parent_einvoice_status
           FROM greentarget.adjustment_documents a
           JOIN greentarget.invoices i ON a.original_invoice_id = i.invoice_id
      LEFT JOIN greentarget.invoices con
                  ON con.is_consolidated = TRUE
                 AND con.status != 'cancelled'
                 AND con.einvoice_status = 'valid'
                 AND con.consolidated_invoices IS NOT NULL
                 AND con.consolidated_invoices::jsonb ? CAST(a.original_invoice_number AS TEXT)
          WHERE a.type = $1
            AND a.status = 'active'
            AND a.is_consolidated = FALSE
            AND (a.einvoice_status IS NULL OR a.einvoice_status = 'invalid')
            AND a.date_issued >= $2::date
            AND a.date_issued < $3::date
            AND con.invoice_id IS NOT NULL
          ORDER BY a.created_at ASC`,
        [type, startDate, endDate]
      );
      res.json({
        success: true,
        data: result.rows.map((r) => ({
          ...r,
          amount_before_tax: parseFloat(r.amount_before_tax || 0),
          tax_amount: parseFloat(r.tax_amount || 0),
          total_amount: parseFloat(r.total_amount || 0),
        })),
      });
    } catch (error) {
      console.error("Error fetching GT eligible adjustment docs:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // --- GET /consolidated-history ---
  router.get("/consolidated-history", async (req, res) => {
    const year = parseInt(req.query.year, 10);
    try {
      let sql = `
        SELECT * FROM greentarget.adjustment_documents
         WHERE is_consolidated = TRUE
      `;
      const params = [];
      if (!isNaN(year)) {
        params.push(`${year}-01-01`, `${year + 1}-01-01`);
        sql += ` AND date_issued >= $1::date AND date_issued < $2::date`;
      }
      sql += ` ORDER BY created_at DESC`;
      const result = await pool.query(sql, params);
      res.json(
        result.rows.map((r) => ({
          ...r,
          amount_before_tax: parseFloat(r.amount_before_tax || 0),
          tax_amount: parseFloat(r.tax_amount || 0),
          total_amount: parseFloat(r.total_amount || 0),
        }))
      );
    } catch (error) {
      console.error("Error fetching GT consolidated history:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // --- POST /submit-consolidated ---
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
        `SELECT * FROM greentarget.adjustment_documents
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
      if (
        docs.some(
          (d) => d.einvoice_status === "valid" || d.einvoice_status === "pending"
        )
      ) {
        throw new Error("Some docs already have an active e-invoice submission");
      }

      // All must share the same parent.
      const parentIds = new Set(
        docs.map((d) => d.references_consolidated_id).filter(Boolean)
      );
      if (parentIds.size === 0) {
        for (const d of docs) {
          const ref = await resolveReferencedDocument(client, d);
          if (!ref) throw new Error(`No parent consolidated invoice found for ${d.id}`);
          // resolveReferencedDocument returns {id (invoice_number), uuid} and
          // also persists references_consolidated_id (invoice_id) — re-read it
          const refreshed = await client.query(
            `SELECT references_consolidated_id FROM greentarget.adjustment_documents WHERE id = $1`,
            [d.id]
          );
          d.references_consolidated_id = refreshed.rows[0]?.references_consolidated_id;
          if (d.references_consolidated_id) parentIds.add(d.references_consolidated_id);
        }
      }
      if (parentIds.size !== 1) {
        throw new Error(
          "All adjustment documents must reference the same parent consolidated invoice"
        );
      }
      const parentInvoiceId = [...parentIds][0];

      const parentResult = await client.query(
        `SELECT invoice_id, invoice_number, uuid, einvoice_status, status
           FROM greentarget.invoices WHERE invoice_id = $1 FOR UPDATE`,
        [parentInvoiceId]
      );
      if (
        parentResult.rows.length === 0 ||
        !parentResult.rows[0].uuid ||
        parentResult.rows[0].einvoice_status !== "valid" ||
        parentResult.rows[0].status === "cancelled"
      ) {
        throw new Error("Parent consolidated invoice has no valid UUID");
      }
      const parent = parentResult.rows[0];

      // Generate consolidated id: CON-GT-{CN|DN|RN}-{YYYYMM}-{seq}
      const now = new Date();
      const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const typeShortPrefix = TYPE_PREFIX[type].replace("GT-", "");
      const prefix = `CON-GT-${typeShortPrefix}-${yyyymm}`;
      const seqResult = await client.query(
        `SELECT id FROM greentarget.adjustment_documents
          WHERE id LIKE $1 AND is_consolidated = TRUE
          ORDER BY id DESC LIMIT 1`,
        [`${prefix}-%`]
      );
      let nextSeq = 1;
      if (seqResult.rows.length > 0) {
        const m = seqResult.rows[0].id.match(new RegExp(`^${prefix}-(\\d+)$`));
        if (m) nextSeq = parseInt(m[1], 10) + 1;
      }
      const consolidatedId = `${prefix}-${nextSeq}`;

      // Load lines for each child for the template.
      for (const d of docs) {
        const linesResult = await client.query(
          `SELECT line_number, description, quantity, price, tax, total, issubtotal
             FROM greentarget.adjustment_document_lines
            WHERE adjustment_doc_id = $1
            ORDER BY line_number ASC`,
          [d.id]
        );
        d.lines = linesResult.rows;
      }

      const xml = await GTEInvoiceConsolidatedAdjustmentTemplate({
        consolidatedId,
        type,
        childDocs: docs,
        parent: { id: parent.invoice_number, uuid: parent.uuid },
        supplierInfo: GREENTARGET_INFO,
      });

      // Re-check parent immediately before MyInvois call.
      const parentRecheck = await client.query(
        `SELECT einvoice_status, status FROM greentarget.invoices WHERE invoice_id = $1`,
        [parent.invoice_id]
      );
      const pr = parentRecheck.rows[0];
      if (!pr || pr.einvoice_status !== "valid" || pr.status === "cancelled") {
        throw new Error(
          "Parent consolidated invoice was cancelled or invalidated mid-flow; aborting submission."
        );
      }

      const submissionResult = await submissionHandler.submitAndPollDocument(xml);
      if (!submissionResult.success) {
        throw new Error(
          submissionResult.message || "MyInvois consolidated submission failed"
        );
      }

      const docObj = submissionResult.document || {};
      const uuid = docObj.uuid || null;
      const longId = docObj.longId || null;
      const dateTimeValidated = docObj.dateTimeValidated || null;
      const status = longId ? "valid" : "pending";

      const totals = docs.reduce(
        (acc, d) => ({
          subtotal: acc.subtotal + Number(d.amount_before_tax || 0),
          tax: acc.tax + Number(d.tax_amount || 0),
          total: acc.total + Number(d.total_amount || 0),
        }),
        { subtotal: 0, tax: 0, total: 0 }
      );

      const todayIso = new Date().toISOString().slice(0, 10);

      await client.query(
        `INSERT INTO greentarget.adjustment_documents (
           id, type, original_invoice_id, original_invoice_number,
           customer_id, customer_name, date_issued, reason,
           amount_before_tax, tax_amount, total_amount,
           uuid, submission_uid, long_id, datetime_validated, einvoice_status,
           is_consolidated, consolidated_adjustments,
           references_consolidated_id, status, created_by
         ) VALUES (
           $1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,$16,$17,'active',$18
         )`,
        [
          consolidatedId,
          type,
          parent.invoice_id,
          parent.invoice_number,
          "Consolidated customers",
          todayIso,
          `Consolidated ${docs.length} ${TYPE_PREFIX[type]}(s) for ${parent.invoice_number}`,
          totals.subtotal,
          totals.tax,
          totals.total,
          uuid,
          submissionResult.submissionUid || null,
          longId,
          dateTimeValidated ? new Date(dateTimeValidated) : null,
          status,
          JSON.stringify(docs.map((d) => d.id)),
          parent.invoice_id,
          req.user?.id || null,
        ]
      );

      await client.query(
        `UPDATE greentarget.adjustment_documents
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
      console.error("Error in GT consolidated adjustment submission:", error);
      res.status(400).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- GET /:id ---
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
        amount_before_tax: parseFloat(doc.amount_before_tax || 0),
        tax_amount: parseFloat(doc.tax_amount || 0),
        total_amount: parseFloat(doc.total_amount || 0),
      });
    } catch (error) {
      console.error(`Error fetching GT adjustment doc ${id}:`, error);
      res.status(500).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- POST / (atomic create) ---
  router.post("/", async (req, res) => {
    const body = req.body || {};
    const {
      type,
      original_invoice_id,
      reason,
      date_issued,
      lines,
      amount_before_tax,
      tax_amount,
      total_amount,
      refund_method,
      refund_reference,
      bank_account,
      paired_credit_note_id,
      paired_refund,
      created_by,
    } = body;

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid adjustment document type" });
    }
    if (!original_invoice_id) {
      return res.status(400).json({ message: "original_invoice_id is required" });
    }

    try {
      validateLineItems(lines);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const amt = parseFloat(total_amount);
    if (!isFinite(amt) || amt <= 0) {
      return res
        .status(400)
        .json({ message: "total_amount must be a positive number" });
    }

    if (type === "refund_note") {
      if (!refund_method) {
        return res.status(400).json({ message: "Refund Note requires refund_method" });
      }
      if (refund_method !== "cash" && !bank_account) {
        return res
          .status(400)
          .json({ message: "Refund Note requires bank_account for non-cash methods" });
      }
      if (!paired_credit_note_id) {
        return res.status(400).json({
          message:
            "Refund Note must be paired with a Credit Note (standalone Refund Notes are not supported for Green Target).",
        });
      }
    }

    if (paired_refund && type !== "credit_note") {
      return res
        .status(400)
        .json({ message: "paired_refund is only valid when type=credit_note" });
    }
    if (paired_credit_note_id && type !== "refund_note") {
      return res
        .status(400)
        .json({ message: "paired_credit_note_id is only valid when type=refund_note" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const invQuery = await client.query(
        `SELECT invoice_id, invoice_number, customer_id, balance_due, total_amount, status
           FROM greentarget.invoices WHERE invoice_id = $1 FOR UPDATE`,
        [original_invoice_id]
      );
      if (invQuery.rows.length === 0) {
        throw new Error(`Invoice ${original_invoice_id} not found`);
      }
      const invoice = invQuery.rows[0];

      if (invoice.status === "cancelled") {
        throw new Error(`Invoice ${invoice.invoice_number} is cancelled; cannot adjust`);
      }

      // Resolve a snapshot customer_name for reporting (invoice may have a
      // nullable customer_id).
      let customerName = null;
      if (invoice.customer_id) {
        const custQ = await client.query(
          `SELECT name FROM greentarget.customers WHERE customer_id = $1`,
          [invoice.customer_id]
        );
        customerName = custQ.rows[0]?.name || null;
      }

      await validateAdjustmentAmountForCreate(
        client,
        type,
        amt,
        invoice,
        paired_refund
      );

      if (paired_refund) {
        const payCheck = await client.query(
          `SELECT 1 FROM greentarget.payments
            WHERE invoice_id = $1
              AND (status IS NULL OR status = 'active')
            LIMIT 1`,
          [invoice.invoice_id]
        );
        if (payCheck.rows.length === 0) {
          throw new Error(
            "Cannot create paired Refund Note: invoice has no active payment. Issue the Credit Note alone."
          );
        }
      }

      const existingAdjustment =
        type === "credit_note" || type === "debit_note"
          ? await fetchActiveAdjustmentOfTypeForInvoice(
              client,
              invoice.invoice_id,
              type
            )
          : null;

      let replacementCreditNote = null;
      if (paired_credit_note_id) {
        const creditNoteResult = await client.query(
          `SELECT * FROM greentarget.adjustment_documents
            WHERE id = $1
              AND type = 'credit_note'
              AND original_invoice_id = $2
              AND status = 'active'
            FOR UPDATE`,
          [paired_credit_note_id, invoice.invoice_id]
        );
        if (creditNoteResult.rows.length === 0) {
          throw new Error(
            `Active Credit Note ${paired_credit_note_id} not found for invoice ${invoice.invoice_number}.`
          );
        }
        replacementCreditNote = creditNoteResult.rows[0];

        const activePairedRnResult = await client.query(
          `SELECT id FROM greentarget.adjustment_documents
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

        if (amt > parseFloat(replacementCreditNote.total_amount || 0)) {
          throw new Error(
            `Refund amount exceeds Credit Note amount (RM ${replacementCreditNote.total_amount}).`
          );
        }

        const hasReceivedPayment = await hasReceivedPaymentForInvoice(
          client,
          invoice.invoice_id
        );
        if (!hasReceivedPayment) {
          throw new Error(
            "Cannot create paired Refund Note: invoice has no active payment."
          );
        }
        const balanceBeforeCreditNote =
          parseFloat(invoice.balance_due || 0) +
          parseFloat(replacementCreditNote.total_amount || 0);
        const maxRefundAmount = Math.min(
          parseFloat(replacementCreditNote.total_amount || 0),
          Math.max(
            0,
            parseFloat(replacementCreditNote.total_amount || 0) -
              Math.max(balanceBeforeCreditNote, 0)
          )
        );
        if (maxRefundAmount <= MONEY_TOLERANCE) {
          throw new Error(
            `Cannot create paired Refund Note because Credit Note ${replacementCreditNote.id} did not create a refundable excess. Issue the Credit Note alone to reduce the balance.`
          );
        }
        if (amt > maxRefundAmount + MONEY_TOLERANCE) {
          throw new Error(
            `Refund amount RM ${amt.toFixed(2)} cannot exceed refundable excess RM ${maxRefundAmount.toFixed(2)} from Credit Note ${replacementCreditNote.id}.`
          );
        }
      }

      if (
        existingAdjustment &&
        (!replacementCreditNote || existingAdjustment.id !== replacementCreditNote.id)
      ) {
        throw new Error(
          `Invoice ${invoice.invoice_number} already has active ${type.replace("_", " ")} ${existingAdjustment.id}. Cancel it before creating another ${type.replace("_", " ")}.`
        );
      }

      const parentInfo = await findConsolidatedParent(
        client,
        invoice.invoice_number
      );
      const referencesConsolidatedId = parentInfo?.invoice_id || null;

      const year = new Date().getFullYear();
      const docId = await generateNextDocId(client, type, year);
      const docDate =
        date_issued || new Date().toISOString().slice(0, 10);

      const doc = {
        id: docId,
        type,
        original_invoice_id: invoice.invoice_id,
        original_invoice_number: invoice.invoice_number,
        customer_id: invoice.customer_id,
        customer_name: customerName,
        date_issued: docDate,
        reason: reason || null,
        paired_with_id: replacementCreditNote?.id || null,
        references_consolidated_id: referencesConsolidatedId,
        amount_before_tax: parseFloat(amount_before_tax || 0),
        tax_amount: parseFloat(tax_amount || 0),
        total_amount: amt,
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

      await applyAccountingForCreate(client, doc);
      await insertDoc(client, doc);

      if (replacementCreditNote) {
        await client.query(
          `UPDATE greentarget.adjustment_documents
              SET paired_with_id = $1 WHERE id = $2`,
          [docId, replacementCreditNote.id]
        );
      }

      // Paired refund note (only when type=credit_note and toggle ON).
      let pairedDoc = null;
      if (paired_refund && type === "credit_note") {
        const rnAmount = parseFloat(paired_refund.total_amount || amt);
        const rnRefundMethod = paired_refund.refund_method || "cash";
        const rnBankAccount =
          paired_refund.bank_account ||
          determineBankAccount(rnRefundMethod, null);
        if (!isFinite(rnAmount) || rnAmount <= 0) {
          throw new Error("Paired refund amount must be positive");
        }
        if (rnRefundMethod !== "cash" && !paired_refund.bank_account) {
          throw new Error(
            "Paired refund requires bank_account for non-cash methods"
          );
        }

        const rnId = await generateNextDocId(client, "refund_note", year);
        const rnDoc = {
          id: rnId,
          type: "refund_note",
          original_invoice_id: invoice.invoice_id,
          original_invoice_number: invoice.invoice_number,
          customer_id: invoice.customer_id,
          customer_name: customerName,
          date_issued: docDate,
          reason: paired_refund.reason || reason || null,
          paired_with_id: docId,
          references_consolidated_id: referencesConsolidatedId,
          amount_before_tax: parseFloat(
            paired_refund.amount_before_tax || amount_before_tax || 0
          ),
          tax_amount: parseFloat(paired_refund.tax_amount || tax_amount || 0),
          total_amount: rnAmount,
          refund_method: rnRefundMethod,
          refund_reference: paired_refund.refund_reference || null,
          bank_account: rnBankAccount,
          lines: paired_refund.lines || lines,
          created_by: doc.created_by,
        };
        await applyAccountingForCreate(client, rnDoc);
        await insertDoc(client, rnDoc);

        await client.query(
          `UPDATE greentarget.adjustment_documents
              SET paired_with_id = $1 WHERE id = $2`,
          [rnId, docId]
        );

        pairedDoc = rnDoc;
      }

      await client.query("COMMIT");

      const fresh = await fetchDocWithRelations(client, docId);
      res.status(201).json({
        message: pairedDoc
          ? `Credit Note ${formatAdjustmentDocId(
              docId
            )} and paired Refund Note ${formatAdjustmentDocId(
              pairedDoc.id
            )} created`
          : `${TYPE_PREFIX[type]} ${formatAdjustmentDocId(docId)} created`,
        document: {
          ...fresh,
          amount_before_tax: parseFloat(fresh.amount_before_tax || 0),
          tax_amount: parseFloat(fresh.tax_amount || 0),
          total_amount: parseFloat(fresh.total_amount || 0),
        },
        paired: pairedDoc
          ? {
              id: pairedDoc.id,
              type: pairedDoc.type,
              total_amount: pairedDoc.total_amount,
            }
          : null,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating GT adjustment document:", error);
      res
        .status(400)
        .json({ message: error.message || "Error creating adjustment document" });
    } finally {
      client.release();
    }
  });

  // --- POST /:id/cancel ---
  router.post("/:id/cancel", async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const docResult = await client.query(
        `SELECT * FROM greentarget.adjustment_documents WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (docResult.rows.length === 0) throw new Error("Document not found");
      const doc = docResult.rows[0];

      if (doc.status === "cancelled") {
        throw new Error(`Document ${id} is already cancelled`);
      }

      // Block CN cancel if a paired active RN exists.
      if (doc.type === "credit_note" && doc.paired_with_id) {
        const pairedResult = await client.query(
          `SELECT id, status FROM greentarget.adjustment_documents WHERE id = $1`,
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

      if (
        doc.einvoice_status === "valid" ||
        doc.einvoice_status === "pending"
      ) {
        throw new Error(
          `Document ${id} has an active e-invoice (${doc.einvoice_status}). Cancel the e-invoice first.`
        );
      }

      // Wrapper cancellation — frees children for re-consolidation; doesn't
      // touch balance (children own that).
      if (doc.is_consolidated) {
        const childIds = Array.isArray(doc.consolidated_adjustments)
          ? doc.consolidated_adjustments
          : doc.consolidated_adjustments
          ? JSON.parse(doc.consolidated_adjustments)
          : [];
        if (childIds.length > 0) {
          await client.query(
            `UPDATE greentarget.adjustment_documents
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
          `UPDATE greentarget.adjustment_documents
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

      // Child / standalone cancellation — reverse balance impact.
      const totalAmt = parseFloat(doc.total_amount);
      switch (doc.type) {
        case "credit_note":
          await applyBalanceDelta(client, doc.original_invoice_id, totalAmt);
          break;
        case "debit_note":
          await applyBalanceDelta(client, doc.original_invoice_id, -totalAmt);
          break;
        case "refund_note":
          if (doc.paired_with_id) {
            await applyBalanceDelta(client, doc.original_invoice_id, -totalAmt);
          }
          break;
      }

      await client.query(
        `UPDATE greentarget.adjustment_documents
            SET status = 'cancelled',
                cancellation_reason = $1,
                cancellation_date = NOW()
          WHERE id = $2`,
        [reason || null, id]
      );

      await client.query("COMMIT");

      const fresh = await fetchDocWithRelations(client, id);
      res.json({
        message: `Document ${id} cancelled. Balance reversed.`,
        document: fresh,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Error cancelling GT adjustment doc ${id}:`, error);
      res.status(400).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- POST /:id/submit-einvoice ---
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
      await client.query("BEGIN");
      txActive = true;

      const docResult = await client.query(
        `SELECT * FROM greentarget.adjustment_documents WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (docResult.rows.length === 0) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(404).json({ message: "Document not found" });
      }
      const doc = docResult.rows[0];
      if (doc.status !== "active") {
        await client.query("ROLLBACK");
        txActive = false;
        return res
          .status(400)
          .json({ message: "Cannot submit a cancelled document" });
      }
      if (
        doc.einvoice_status === "valid" ||
        doc.einvoice_status === "pending"
      ) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message: `Document already has e-invoice status '${doc.einvoice_status}'. Cancel or update status first.`,
        });
      }

      const linesResult = await client.query(
        `SELECT line_number, description, quantity, price, tax, total, issubtotal
           FROM greentarget.adjustment_document_lines
          WHERE adjustment_doc_id = $1
          ORDER BY line_number ASC`,
        [id]
      );
      doc.lines = linesResult.rows;

      if (!doc.customer_id) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message:
            "Adjustment document has no customer linked; cannot build e-invoice.",
        });
      }
      const custResult = await client.query(
        `SELECT customer_id, name, tin_number, id_type, id_number,
                phone_number, email, state,
                (
                  SELECT l.address
                    FROM greentarget.invoice_rentals ir
                    JOIN greentarget.rentals r ON ir.rental_id = r.rental_id
                    JOIN greentarget.locations l ON r.location_id = l.location_id
                   WHERE ir.invoice_id = $2
                     AND l.address IS NOT NULL
                     AND BTRIM(l.address) <> ''
                   ORDER BY r.rental_id
                   LIMIT 1
                ) AS location_address,
                (
                  SELECT COALESCE(json_agg(site_row.site ORDER BY site_row.first_rental_id), '[]'::json)
                    FROM (
                      SELECT BTRIM(l.site) AS site, MIN(r.rental_id) AS first_rental_id
                        FROM greentarget.invoice_rentals ir
                        JOIN greentarget.rentals r ON ir.rental_id = r.rental_id
                        JOIN greentarget.locations l ON r.location_id = l.location_id
                       WHERE ir.invoice_id = $2
                         AND NULLIF(BTRIM(l.site), '') IS NOT NULL
                       GROUP BY BTRIM(l.site)
                    ) AS site_row
                ) AS location_sites
           FROM greentarget.customers WHERE customer_id = $1`,
        [doc.customer_id, doc.original_invoice_id]
      );
      if (custResult.rows.length === 0) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message: `Customer ${doc.customer_id} not found. Cannot build e-invoice.`,
        });
      }
      const customer = {
        ...custResult.rows[0],
        address: custResult.rows[0].location_address || "Tong Location",
        sites: custResult.rows[0].location_sites || [],
      };
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

      let xml;
      try {
        xml = await GTEInvoiceAdjustmentNoteTemplate(
          doc,
          customer,
          referenced,
          GREENTARGET_INFO
        );
      } catch (templateError) {
        await client.query("ROLLBACK");
        txActive = false;
        return res.status(400).json({
          message: templateError?.message || "Failed to generate XML",
          code: templateError?.code || "TEMPLATE_ERROR",
        });
      }

      const submissionResult = await submissionHandler.submitAndPollDocument(xml);
      if (!submissionResult.success) {
        await client.query(
          `UPDATE greentarget.adjustment_documents
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

      const docObj = submissionResult.document || {};
      const uuid = docObj.uuid || null;
      const longId = docObj.longId || null;
      const dateTimeValidated = docObj.dateTimeValidated || null;
      const status = longId ? "valid" : "pending";

      await client.query(
        `UPDATE greentarget.adjustment_documents
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
        message: `Submitted ${id} to MyInvois (status: ${status})`,
        status,
        uuid,
        longId,
        submissionResult,
      });
    } catch (error) {
      if (txActive) {
        try { await client.query("ROLLBACK"); } catch (_) {}
      }
      console.error(`Error submitting GT adjustment doc ${id}:`, error);
      res.status(500).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- POST /:id/update-status ---
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
           FROM greentarget.adjustment_documents WHERE id = $1`,
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
          `UPDATE greentarget.adjustment_documents
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
      console.error(`Error updating status for GT ${id}:`, error);
      res
        .status(500)
        .json({ message: error?.response?.data?.message || error.message });
    } finally {
      client.release();
    }
  });

  // --- POST /:id/cancel-einvoice ---
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
        `SELECT * FROM greentarget.adjustment_documents WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (docResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Document not found" });
      }
      const doc = docResult.rows[0];
      const current = doc.einvoice_status?.toLowerCase();
      if (current !== "valid" && current !== "invalid") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Cannot cancel e-invoice with status: ${doc.einvoice_status}. Only 'valid' or 'invalid' can be cancelled.`,
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
          `MyInvois cancel returned error for GT ${id}:`,
          apiError.response?.data || apiError.message
        );
      }

      await client.query(
        `UPDATE greentarget.adjustment_documents
            SET einvoice_status = 'cancelled'
          WHERE id = $1`,
        [id]
      );

      let childCascade = 0;
      if (doc.is_consolidated) {
        const childIds = Array.isArray(doc.consolidated_adjustments)
          ? doc.consolidated_adjustments
          : doc.consolidated_adjustments
          ? JSON.parse(doc.consolidated_adjustments)
          : [];
        if (childIds.length > 0) {
          const result = await client.query(
            `UPDATE greentarget.adjustment_documents
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
          ? `E-invoice cancelled at MyInvois for consolidated wrapper ${id}. ${childCascade} child document(s) marked cancelled. Local balance impact on children remains until you cancel the wrapper.`
          : `E-invoice cancelled at MyInvois for ${id}. Local balance impact remains until you cancel the document.`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Error cancelling e-invoice for GT ${id}:`, error);
      res.status(500).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  // --- POST /:id/clear-einvoice-status ---
  router.post("/:id/clear-einvoice-status", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        `UPDATE greentarget.adjustment_documents
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
      console.error("Error clearing GT einvoice status:", error);
      res.status(500).json({ message: error.message });
    }
  });

  return router;
}

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

const VALID_TYPES = ["credit_note", "debit_note", "refund_note"];
const TYPE_PREFIX = {
  credit_note: "CN",
  debit_note: "DN",
  refund_note: "RN",
};

// ---------- ID generation ----------
async function generateNextDocId(client, type, year) {
  const prefix = TYPE_PREFIX[type];
  const pattern = `${prefix}-${year}-%`;
  const result = await client.query(
    `SELECT id FROM adjustment_documents
      WHERE id LIKE $1
      ORDER BY id DESC LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [pattern]
  );
  let next = 1;
  if (result.rows.length > 0) {
    const m = result.rows[0].id.match(new RegExp(`^${prefix}-${year}-(\\d+)$`));
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
}

// ---------- consolidation lookup ----------
async function findConsolidatedParentId(client, originalInvoiceId) {
  const result = await client.query(
    `SELECT id FROM invoices
      WHERE is_consolidated = true
        AND invoice_status != 'cancelled'
        AND (einvoice_status IS NULL OR einvoice_status != 'cancelled')
        AND consolidated_invoices IS NOT NULL
        AND consolidated_invoices::jsonb ? CAST($1 AS TEXT)
      ORDER BY created_at DESC NULLS LAST
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
       FROM invoices WHERE id = $1 FOR UPDATE`,
    [invoiceId]
  );
  if (result.rows.length === 0) throw new Error(`Invoice ${invoiceId} not found`);
  const inv = result.rows[0];

  const currentBalance = parseFloat(inv.balance_due || 0);
  const newBalance = parseFloat((currentBalance + delta).toFixed(2));
  const totalPayable = parseFloat(inv.totalamountpayable || 0);
  const newStatus = deriveInvoiceStatus(newBalance, totalPayable, inv.invoice_status);

  await client.query(
    `UPDATE invoices SET balance_due = $1, invoice_status = $2 WHERE id = $3`,
    [newBalance, newStatus, invoiceId]
  );

  return inv;
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
  });
  if (type === "credit_note" || type === "refund_note") {
    // amounts come in as positive on the wire; we store positive and the
    // accounting side knows it represents a reduction. Nothing extra to do.
  }
}

async function insertDoc(client, doc) {
  await client.query(
    `INSERT INTO adjustment_documents (
       id, type, original_invoice_id, customerid, salespersonid,
       createddate, reason, paired_with_id, linked_payment_id,
       references_consolidated_id,
       total_excluding_tax, tax_amount, rounding, totalamountpayable,
       refund_method, refund_reference, bank_account,
       status, journal_entry_id, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'active',$18,$19
     )`,
    [
      doc.id,
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
        `INSERT INTO adjustment_document_lines (
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
      // Refund Note does not touch invoice balance_due — the cash being
      // refunded was either an overpayment (sitting in CUST_DEP, not in
      // balance_due) or already credited via the paired Credit Note.
      journalEntryId = await createRefundNoteJournalEntry(client, doc);
      break;
    }
  }

  return journalEntryId;
}

async function fetchDocWithRelations(client, id) {
  const docResult = await client.query(
    `SELECT * FROM adjustment_documents WHERE id = $1`,
    [id]
  );
  if (docResult.rows.length === 0) return null;
  const doc = docResult.rows[0];

  const linesResult = await client.query(
    `SELECT id, line_number, code, description, quantity, price, tax, total, issubtotal
       FROM adjustment_document_lines
      WHERE adjustment_doc_id = $1
      ORDER BY line_number ASC`,
    [id]
  );
  doc.lines = linesResult.rows;

  return doc;
}

// ============================================================================
//                                 ROUTES
// ============================================================================
export default function (pool) {
  const router = Router();

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
        SELECT a.*, i.customerid AS inv_customerid, c.name AS customer_name,
               p.id AS paired_doc_id, p.type AS paired_type, p.status AS paired_status,
               p.einvoice_status AS paired_einvoice_status
          FROM adjustment_documents a
          JOIN invoices i ON a.original_invoice_id = i.id
     LEFT JOIN customers c ON a.customerid = c.id
     LEFT JOIN adjustment_documents p ON a.paired_with_id = p.id
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
        sql += ` AND (a.id ILIKE ${sp} OR a.original_invoice_id ILIKE ${sp} OR c.name ILIKE ${sp})`;
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock the invoice row for the whole transaction.
      const invQuery = await client.query(
        `SELECT id, customerid, salespersonid, paymenttype, balance_due,
                totalamountpayable, invoice_status
           FROM invoices WHERE id = $1 FOR UPDATE`,
        [original_invoice_id]
      );
      if (invQuery.rows.length === 0) {
        throw new Error(`Invoice ${original_invoice_id} not found`);
      }
      const invoice = invQuery.rows[0];

      if (invoice.invoice_status === "cancelled") {
        throw new Error(`Invoice ${original_invoice_id} is cancelled; cannot adjust`);
      }

      // For standalone refund: validate linked payment exists and is overpaid.
      if (type === "refund_note" && linked_payment_id) {
        const payQuery = await client.query(
          `SELECT payment_id, amount_paid, status FROM payments
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
        if (amt > parseFloat(pay.amount_paid)) {
          throw new Error(
            `Refund amount exceeds available overpaid amount (RM ${pay.amount_paid})`
          );
        }
      }

      const referencesConsolidatedId = await findConsolidatedParentId(
        client,
        original_invoice_id
      );

      const year = new Date().getFullYear();
      const docId = await generateNextDocId(client, type, year);
      const docCreatedDate = createddate || Date.now().toString();

      const doc = {
        id: docId,
        type,
        original_invoice_id,
        customerid: invoice.customerid,
        salespersonid: invoice.salespersonid,
        createddate: docCreatedDate,
        reason: reason || null,
        paired_with_id: null,
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

        const rnId = await generateNextDocId(client, "refund_note", year);
        const rnDoc = {
          id: rnId,
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
          `UPDATE adjustment_documents SET paired_with_id = $1 WHERE id = $2`,
          [rnId, docId]
        );

        pairedDoc = rnDoc;
      }

      await client.query("COMMIT");

      // Fetch final state for response.
      const fresh = await fetchDocWithRelations(client, docId);
      res.status(201).json({
        message: pairedDoc
          ? `Credit Note ${docId} and paired Refund Note ${pairedDoc.id} created`
          : `${TYPE_PREFIX[type]} ${docId} created`,
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
      res
        .status(400)
        .json({ message: error.message || "Error creating adjustment document" });
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
        `SELECT * FROM adjustment_documents WHERE id = $1 FOR UPDATE`,
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
          `SELECT id, status FROM adjustment_documents WHERE id = $1`,
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
          `Document ${id} has an active e-invoice (${doc.einvoice_status}). Cancel the e-invoice first.`
        );
      }

      // Lock the invoice for accounting reversal.
      const invResult = await client.query(
        `SELECT id, customerid, paymenttype, balance_due, totalamountpayable, invoice_status
           FROM invoices WHERE id = $1 FOR UPDATE`,
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
          // RN didn't touch balance_due on create. Nothing to reverse on the
          // invoice. The journal cancellation below handles the cash entry.
          break;
        }
      }

      if (doc.journal_entry_id) {
        await cancelAdjustmentJournalEntry(client, doc.journal_entry_id);
      }

      await client.query(
        `UPDATE adjustment_documents
            SET status = 'cancelled',
                cancellation_reason = $1,
                cancellation_date = NOW()
          WHERE id = $2`,
        [reason || null, id]
      );

      await client.query("COMMIT");

      const fresh = await fetchDocWithRelations(client, id);
      res.json({
        message: `Document ${id} cancelled. Accounting reversed.`,
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

  // --- POST /api/adjustment-docs/:id/clear-einvoice-status ---
  // Used after a failed submission to allow re-submission. Does NOT touch
  // MyInvois — only clears local einvoice_status when it's null/invalid.
  router.post("/:id/clear-einvoice-status", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        `UPDATE adjustment_documents
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

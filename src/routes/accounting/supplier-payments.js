// src/routes/accounting/supplier-payments.js
import { Router } from "express";
import {
  createSupplierPaymentJournalEntry,
  cancelSupplierPaymentJournalEntry,
  generatePVReference,
} from "./supplier-payment-journal.js";

const VALID_SOURCES = new Set(["purchase_invoices", "self_billed_invoices"]);
const VALID_METHODS = new Set(["cash", "cheque", "bank_transfer", "online"]);
const VALID_BANK_ACCOUNTS = new Set(["CASH", "BANK_PBB", "BANK_ABB"]);

function normalizeText(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseAmount(value) {
  const parsed =
    typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

async function lockInvoice(client, source, invoiceId) {
  if (source === "purchase_invoices") {
    const result = await client.query(
      `SELECT pi.id, pi.invoice_number AS doc_no, pi.total_amount AS total,
              pi.amount_paid, pi.payment_status,
              s.name AS supplier_name
         FROM purchase_invoices pi
         LEFT JOIN suppliers s ON s.id = pi.supplier_id
         WHERE pi.id = $1
         FOR UPDATE OF pi`,
      [invoiceId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      doc_no: row.doc_no,
      total: Number(row.total || 0),
      amount_paid: Number(row.amount_paid || 0),
      payment_status: row.payment_status || "unpaid",
      supplier_name: row.supplier_name || "Supplier",
      invoice_status: "active",
    };
  }

  if (source === "self_billed_invoices") {
    const result = await client.query(
      `SELECT sbi.id, sbi.self_billed_no AS doc_no,
              sbi.payable_amount_myr AS total,
              sbi.amount_paid, sbi.payment_status,
              sbi.invoice_status, sbi.local_supplier_name,
              fs.supplier_name AS foreign_supplier_name
         FROM self_billed_invoices sbi
         LEFT JOIN self_billed_foreign_suppliers fs
           ON fs.id = sbi.foreign_supplier_id
         WHERE sbi.id = $1
         FOR UPDATE OF sbi`,
      [invoiceId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      doc_no: row.doc_no,
      total: Number(row.total || 0),
      amount_paid: Number(row.amount_paid || 0),
      payment_status: row.payment_status || "unpaid",
      supplier_name:
        row.foreign_supplier_name || row.local_supplier_name || "Supplier",
      invoice_status: row.invoice_status || "active",
    };
  }

  return null;
}

function computeNextStatus(totalPaid, total) {
  const tolerance = 0.005;
  if (totalPaid <= tolerance) return "unpaid";
  if (totalPaid + tolerance >= total) return "paid";
  return "partial";
}

async function updateInvoicePayment(client, source, invoiceId, deltaAmount) {
  // Apply delta (positive on payment create, negative on cancel)
  const updateAmountQuery =
    source === "purchase_invoices"
      ? `UPDATE purchase_invoices
           SET amount_paid = GREATEST(0, COALESCE(amount_paid, 0) + $1),
               updated_at = NOW()
         WHERE id = $2
         RETURNING amount_paid, total_amount AS total`
      : `UPDATE self_billed_invoices
           SET amount_paid = GREATEST(0, COALESCE(amount_paid, 0) + $1),
               updated_at = NOW()
         WHERE id = $2
         RETURNING amount_paid, payable_amount_myr AS total`;

  const amountResult = await client.query(updateAmountQuery, [
    deltaAmount,
    invoiceId,
  ]);
  if (amountResult.rows.length === 0) {
    throw new Error("Invoice not found while updating amount_paid");
  }
  const { amount_paid: newPaid, total } = amountResult.rows[0];
  const nextStatus = computeNextStatus(Number(newPaid), Number(total));

  const updateStatusQuery =
    source === "purchase_invoices"
      ? `UPDATE purchase_invoices
           SET payment_status = $1, updated_at = NOW()
         WHERE id = $2`
      : `UPDATE self_billed_invoices
           SET payment_status = $1, updated_at = NOW()
         WHERE id = $2`;

  await client.query(updateStatusQuery, [nextStatus, invoiceId]);
  return { newPaid: Number(newPaid), nextStatus };
}

export default function (pool) {
  const router = Router();

  // GET /api/supplier-payments?invoice_source=&invoice_id=&supplier_id=&start_date=&end_date=&include_cancelled=
  router.get("/", async (req, res) => {
    const {
      invoice_source,
      invoice_id,
      start_date,
      end_date,
      include_cancelled,
      limit = 200,
      offset = 0,
    } = req.query;

    try {
      const params = [];
      let where = "WHERE 1=1";

      if (invoice_source && VALID_SOURCES.has(invoice_source)) {
        params.push(invoice_source);
        where += ` AND sp.invoice_source = $${params.length}`;
      }
      if (invoice_id) {
        params.push(Number.parseInt(invoice_id, 10));
        where += ` AND sp.invoice_id = $${params.length}`;
      }
      if (start_date) {
        params.push(start_date);
        where += ` AND sp.payment_date >= $${params.length}`;
      }
      if (end_date) {
        params.push(end_date);
        where += ` AND sp.payment_date <= $${params.length}`;
      }
      if (include_cancelled !== "true") {
        where += ` AND sp.status <> 'cancelled'`;
      }

      params.push(Number.parseInt(limit, 10) || 200);
      const limitClause = `LIMIT $${params.length}`;
      params.push(Number.parseInt(offset, 10) || 0);
      const offsetClause = `OFFSET $${params.length}`;

      const query = `
        SELECT sp.*, je.reference_no AS journal_reference_no,
               COALESCE(pi.invoice_number, sbi.self_billed_no) AS invoice_doc_no,
               COALESCE(s.name, sbi_supplier.supplier_name, sbi.local_supplier_name) AS supplier_name
          FROM supplier_payments sp
          LEFT JOIN journal_entries je ON je.id = sp.journal_entry_id
          LEFT JOIN purchase_invoices pi
                 ON sp.invoice_source = 'purchase_invoices' AND pi.id = sp.invoice_id
          LEFT JOIN suppliers s ON s.id = pi.supplier_id
          LEFT JOIN self_billed_invoices sbi
                 ON sp.invoice_source = 'self_billed_invoices' AND sbi.id = sp.invoice_id
          LEFT JOIN self_billed_foreign_suppliers sbi_supplier
                 ON sbi_supplier.id = sbi.foreign_supplier_id
          ${where}
          ORDER BY sp.payment_date DESC, sp.payment_id DESC
          ${limitClause}
          ${offsetClause}
      `;

      const result = await pool.query(query, params);
      res.json(
        result.rows.map((row) => ({
          ...row,
          amount_paid: Number(row.amount_paid || 0),
        }))
      );
    } catch (error) {
      console.error("Error fetching supplier payments:", error);
      res.status(500).json({
        message: "Error fetching supplier payments",
        error: error.message,
      });
    }
  });

  // GET /api/supplier-payments/by-invoice?invoice_source=&invoice_id=
  router.get("/by-invoice", async (req, res) => {
    const { invoice_source, invoice_id, include_cancelled } = req.query;

    if (!invoice_source || !VALID_SOURCES.has(invoice_source) || !invoice_id) {
      return res.status(400).json({
        message: "invoice_source and invoice_id are required",
      });
    }

    try {
      const params = [invoice_source, Number.parseInt(invoice_id, 10)];
      let where = "WHERE sp.invoice_source = $1 AND sp.invoice_id = $2";
      if (include_cancelled !== "true") {
        where += " AND sp.status <> 'cancelled'";
      }

      const query = `
        SELECT sp.*, je.reference_no AS journal_reference_no
          FROM supplier_payments sp
          LEFT JOIN journal_entries je ON je.id = sp.journal_entry_id
          ${where}
          ORDER BY sp.payment_date DESC, sp.payment_id DESC
      `;
      const result = await pool.query(query, params);
      res.json(
        result.rows.map((row) => ({
          ...row,
          amount_paid: Number(row.amount_paid || 0),
        }))
      );
    } catch (error) {
      console.error("Error fetching supplier payments by invoice:", error);
      res.status(500).json({
        message: "Error fetching supplier payments",
        error: error.message,
      });
    }
  });

  // GET /api/supplier-payments/:id
  router.get("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT sp.*, je.reference_no AS journal_reference_no,
                COALESCE(pi.invoice_number, sbi.self_billed_no) AS invoice_doc_no,
                COALESCE(s.name, sbi_supplier.supplier_name, sbi.local_supplier_name) AS supplier_name
           FROM supplier_payments sp
           LEFT JOIN journal_entries je ON je.id = sp.journal_entry_id
           LEFT JOIN purchase_invoices pi
                  ON sp.invoice_source = 'purchase_invoices' AND pi.id = sp.invoice_id
           LEFT JOIN suppliers s ON s.id = pi.supplier_id
           LEFT JOIN self_billed_invoices sbi
                  ON sp.invoice_source = 'self_billed_invoices' AND sbi.id = sp.invoice_id
           LEFT JOIN self_billed_foreign_suppliers sbi_supplier
                  ON sbi_supplier.id = sbi.foreign_supplier_id
           WHERE sp.payment_id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Supplier payment not found" });
      }
      res.json({
        ...result.rows[0],
        amount_paid: Number(result.rows[0].amount_paid || 0),
      });
    } catch (error) {
      console.error("Error fetching supplier payment:", error);
      res.status(500).json({
        message: "Error fetching supplier payment",
        error: error.message,
      });
    }
  });

  // POST /api/supplier-payments
  router.post("/", async (req, res) => {
    const body = req.body || {};
    const invoice_source = normalizeText(body.invoice_source);
    const invoice_id = Number.parseInt(body.invoice_id, 10);
    const payment_date = normalizeText(body.payment_date);
    const amount_paid = parseAmount(body.amount_paid);
    const payment_method = normalizeText(body.payment_method);
    const bank_account = normalizeText(body.bank_account);
    const payment_reference = normalizeText(body.payment_reference);
    let internal_reference = normalizeText(body.internal_reference);
    const notes = normalizeText(body.notes);

    if (!invoice_source || !VALID_SOURCES.has(invoice_source)) {
      return res.status(400).json({ message: "Invalid invoice_source" });
    }
    if (!Number.isInteger(invoice_id) || invoice_id <= 0) {
      return res.status(400).json({ message: "invoice_id is required" });
    }
    if (!payment_date) {
      return res.status(400).json({ message: "payment_date is required" });
    }
    if (!(amount_paid > 0)) {
      return res
        .status(400)
        .json({ message: "amount_paid must be greater than zero" });
    }
    if (!payment_method || !VALID_METHODS.has(payment_method)) {
      return res.status(400).json({ message: "Invalid payment_method" });
    }
    if (payment_method !== "cash") {
      if (!bank_account || !VALID_BANK_ACCOUNTS.has(bank_account)) {
        return res.status(400).json({
          message: "bank_account is required for non-cash payments",
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const invoice = await lockInvoice(client, invoice_source, invoice_id);
      if (!invoice) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Source invoice not found" });
      }
      if (invoice.invoice_status === "cancelled") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "Cannot pay a cancelled invoice" });
      }
      if (invoice.payment_status === "paid") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "Invoice is already fully paid" });
      }

      const balance =
        Math.round((invoice.total - invoice.amount_paid) * 100) / 100;
      if (amount_paid - balance > 0.005) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Amount exceeds outstanding balance (${balance.toFixed(2)})`,
        });
      }

      if (!internal_reference) {
        internal_reference = await generatePVReference(client, payment_date);
      }

      const insertResult = await client.query(
        `INSERT INTO supplier_payments (
           invoice_source, invoice_id, payment_date, amount_paid,
           payment_method, bank_account, payment_reference, internal_reference,
           notes, status, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
         RETURNING payment_id`,
        [
          invoice_source,
          invoice_id,
          payment_date,
          amount_paid,
          payment_method,
          payment_method === "cash" ? "CASH" : bank_account,
          payment_reference,
          internal_reference,
          notes,
          req.staffId || null,
        ]
      );
      const paymentId = insertResult.rows[0].payment_id;

      const { journalEntryId, referenceNo } =
        await createSupplierPaymentJournalEntry(
          client,
          {
            payment_id: paymentId,
            invoice_id,
            payment_date,
            amount_paid,
            payment_method,
            bank_account:
              payment_method === "cash" ? "CASH" : bank_account,
            payment_reference,
            created_by: req.staffId || null,
          },
          invoice.supplier_name,
          invoice.doc_no
        );

      await client.query(
        `UPDATE supplier_payments SET journal_entry_id = $1 WHERE payment_id = $2`,
        [journalEntryId, paymentId]
      );

      const { newPaid, nextStatus } = await updateInvoicePayment(
        client,
        invoice_source,
        invoice_id,
        amount_paid
      );

      await client.query("COMMIT");
      res.status(201).json({
        message: "Supplier payment recorded",
        payment: {
          payment_id: paymentId,
          invoice_source,
          invoice_id,
          internal_reference,
          journal_reference_no: referenceNo,
          journal_entry_id: journalEntryId,
          amount_paid,
          invoice_amount_paid: newPaid,
          invoice_payment_status: nextStatus,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error recording supplier payment:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error recording supplier payment",
      });
    } finally {
      client.release();
    }
  });

  // PUT /api/supplier-payments/:id/cancel
  router.put("/:id/cancel", async (req, res) => {
    const reason = normalizeText(req.body?.cancellation_reason);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `SELECT * FROM supplier_payments WHERE payment_id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Supplier payment not found" });
      }
      const existing = existingResult.rows[0];
      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "Payment is already cancelled" });
      }

      await cancelSupplierPaymentJournalEntry(client, existing.journal_entry_id);

      await client.query(
        `UPDATE supplier_payments
           SET status = 'cancelled',
               cancellation_date = NOW(),
               cancellation_reason = $1
         WHERE payment_id = $2`,
        [reason, req.params.id]
      );

      // Lock invoice and reverse amount_paid
      const invoice = await lockInvoice(
        client,
        existing.invoice_source,
        existing.invoice_id
      );
      if (invoice) {
        await updateInvoicePayment(
          client,
          existing.invoice_source,
          existing.invoice_id,
          -Number(existing.amount_paid)
        );
      }

      await client.query("COMMIT");
      res.json({ message: "Supplier payment cancelled" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling supplier payment:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error cancelling supplier payment",
      });
    } finally {
      client.release();
    }
  });

  return router;
}

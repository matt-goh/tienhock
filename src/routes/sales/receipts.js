// src/routes/sales/receipts.js
// Atomic grouped-receipt endpoints (Tien Hock). One request = one receipt
// header + allocations = one journal. See receipt-service.js for the
// accounting contract.
import { Router } from "express";
import {
  createReceipt,
  confirmReceipt,
  confirmReceiptGroup,
  cancelReceipt,
  cancelReceiptGroup,
  getReceiptGroup,
  updateReceiptReference,
} from "../accounting/receipt-service.js";
import { applyOverpayment } from "../accounting/overpayment-apply.js";

export default function (pool) {
  const router = Router();

  // --- POST /api/receipts — create one atomic receipt ---
  // Accepts an optional flat `overpayment_allocations` array
  // ([{ invoice_id, amount }]) alongside the money `allocations`: each
  // customer's held overpayment (CUST_DEP excess) is applied to their
  // invoices FIRST (its own payments rows + REC journals), then the money
  // receipt covers the remainder — all in ONE transaction. When only
  // overpayment_allocations are sent, no receipt is created at all.
  router.post("/", async (req, res) => {
    const { overpayment_allocations, ...receiptPayload } = req.body;
    const userId = req.user?.id || null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Apply held overpayment per customer (grouped server-side).
      const overpaymentApplied = [];
      if (
        Array.isArray(overpayment_allocations) &&
        overpayment_allocations.length > 0
      ) {
        const applyInvoiceIds = [
          ...new Set(overpayment_allocations.map((a) => String(a.invoice_id))),
        ];
        const customerResult = await client.query(
          `SELECT id, customerid FROM invoices WHERE id = ANY($1::varchar[])`,
          [applyInvoiceIds]
        );
        const customerByInvoice = {};
        for (const row of customerResult.rows) {
          customerByInvoice[row.id] = row.customerid;
        }
        const groupsByCustomer = new Map();
        for (const a of overpayment_allocations) {
          const customerId = customerByInvoice[String(a.invoice_id)];
          if (!customerId) {
            throw Object.assign(
              new Error(`Invoice ${a.invoice_id} not found`),
              { status: 404 }
            );
          }
          if (!groupsByCustomer.has(customerId)) {
            groupsByCustomer.set(customerId, []);
          }
          groupsByCustomer.get(customerId).push(a);
        }
        for (const allocs of groupsByCustomer.values()) {
          overpaymentApplied.push(
            await applyOverpayment(
              client,
              {
                allocations: allocs,
                payment_date: receiptPayload.received_date,
                notes: receiptPayload.notes,
              },
              userId
            )
          );
        }
      }

      // 2. Money receipt for the remainder (skipped for a pure apply).
      let receiptResult = null;
      if (
        Array.isArray(receiptPayload.allocations) &&
        receiptPayload.allocations.length > 0
      ) {
        receiptResult = await createReceipt(client, receiptPayload, userId);
      }

      if (!receiptResult && overpaymentApplied.length === 0) {
        throw Object.assign(
          new Error("At least one allocation is required"),
          { status: 400 }
        );
      }

      await client.query("COMMIT");

      const totalApplied = overpaymentApplied.reduce(
        (sum, group) => sum + group.total_applied,
        0
      );
      res.status(201).json({
        message: receiptResult
          ? receiptResult.receipt.status === "pending"
            ? "Cheque receipt recorded (pending clearance)"
            : "Receipt recorded"
          : "Overpayment applied successfully",
        ...(receiptResult || { receipt: null, allocations: [], payments: [] }),
        overpayment_applied: overpaymentApplied,
        total_overpayment_applied: Math.round(totalApplied * 100) / 100,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating receipt:", error);
      res.status(error.status || 400).json({
        code: error.code,
        message: error.message || "Error creating receipt",
        requires_confirmation: error.requires_confirmation || undefined,
        candidate: error.candidate || undefined,
      });
    } finally {
      client.release();
    }
  });

  // --- GET /api/receipts — list (filters: startDate, endDate, status, search) ---
  router.get("/", async (req, res) => {
    const { startDate, endDate, status, search, limit = "100" } = req.query;
    try {
      const params = [];
      let where = "WHERE 1=1";
      if (startDate) {
        params.push(startDate);
        where += ` AND r.received_date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        where += ` AND r.received_date <= $${params.length}`;
      }
      if (status) {
        params.push(status);
        where += ` AND r.status = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        where += ` AND (r.display_reference ILIKE $${params.length} OR r.description ILIKE $${params.length})`;
      }
      params.push(Math.min(parseInt(limit, 10) || 100, 500));
      const result = await pool.query(
        `SELECT r.*, je.reference_no AS journal_reference_no,
                (SELECT json_agg(json_build_object(
                    'id', ra.id, 'line_number', ra.line_number,
                    'allocation_type', ra.allocation_type, 'invoice_id', ra.invoice_id,
                    'customer_id', ra.customer_id, 'target_account', ra.target_account,
                    'external_reference', ra.external_reference, 'amount', ra.amount
                  ) ORDER BY ra.line_number)
                   FROM receipt_allocations ra WHERE ra.receipt_id = r.id) AS allocations
           FROM receipts r
           LEFT JOIN journal_entries je ON je.id = r.journal_entry_id
          ${where}
          ORDER BY r.received_date DESC, r.id DESC
          LIMIT $${params.length}`,
        params
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error listing receipts:", error);
      res.status(500).json({ message: "Error listing receipts", error: error.message });
    }
  });

  // --- GET /api/receipts/:id/group ---
  router.get("/:id/group", async (req, res) => {
    const receiptId = parseInt(req.params.id, 10);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      return res.status(400).json({ message: "Invalid payment group" });
    }

    try {
      const result = await getReceiptGroup(pool, receiptId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching payment group:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error fetching payment group",
      });
    }
  });

  // --- GET /api/receipts/:id ---
  router.get("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, je.reference_no AS journal_reference_no
           FROM receipts r
           LEFT JOIN journal_entries je ON je.id = r.journal_entry_id
          WHERE r.id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Receipt not found" });
      }
      const allocations = await pool.query(
        `SELECT * FROM receipt_allocations WHERE receipt_id = $1 ORDER BY line_number`,
        [req.params.id]
      );
      res.json({ ...result.rows[0], allocations: allocations.rows });
    } catch (error) {
      console.error("Error fetching receipt:", error);
      res.status(500).json({ message: "Error fetching receipt", error: error.message });
    }
  });

  // --- PATCH /api/receipts/:id/reference ---
  router.patch("/:id/reference", async (req, res) => {
    const receiptId = parseInt(req.params.id, 10);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      return res.status(400).json({ message: "Invalid payment group" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await updateReceiptReference(
        client,
        receiptId,
        req.body?.expected_reference,
        req.body?.reference,
        req.user?.id || null
      );
      await client.query("COMMIT");
      res.json({ message: "Payment group reference updated", ...result });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating receipt reference:", error);
      res.status(error.status || 400).json({
        code: error.code,
        message: error.message || "Error updating receipt reference",
      });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/receipts/:id/group/confirm ---
  router.put("/:id/group/confirm", async (req, res) => {
    const receiptId = parseInt(req.params.id, 10);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      return res.status(400).json({ message: "Invalid payment group" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await confirmReceiptGroup(
        client,
        receiptId,
        {
          posting_date: req.body?.posting_date,
          cheque_reference: req.body?.cheque_reference,
        },
        req.user?.id || null
      );
      await client.query("COMMIT");
      res.json({ message: "Payment group confirmed and posted", ...result });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error confirming payment group:", error);
      res.status(error.status || 400).json({
        code: error.code,
        message: error.message || "Error confirming payment group",
      });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/receipts/:id/confirm - pending cheque cleared ---
  router.put("/:id/confirm", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await confirmReceipt(
        client,
        parseInt(req.params.id, 10),
        { posting_date: req.body?.posting_date, cheque_reference: req.body?.cheque_reference },
        req.user?.id || null
      );
      await client.query("COMMIT");
      res.json({ message: "Receipt confirmed and posted", ...result });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error confirming receipt:", error);
      res.status(error.status || 400).json({
        code: error.code,
        message: error.message || "Error confirming receipt",
      });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/receipts/:id/group/cancel ---
  router.put("/:id/group/cancel", async (req, res) => {
    const receiptId = parseInt(req.params.id, 10);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      return res.status(400).json({ message: "Invalid payment group" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await cancelReceiptGroup(
        client,
        receiptId,
        req.body?.reason || null,
        req.user?.id || null
      );
      await client.query("COMMIT");
      res.json({ message: "Payment group cancelled", ...result });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling payment group:", error);
      res.status(error.status || 400).json({
        code: error.code,
        message: error.message || "Error cancelling payment group",
      });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/receipts/:id/cancel ---
  router.put("/:id/cancel", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await cancelReceipt(
        client,
        parseInt(req.params.id, 10),
        req.body?.reason || null,
        req.user?.id || null
      );
      await client.query("COMMIT");
      res.json({ message: "Receipt cancelled", ...result });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling receipt:", error);
      res.status(error.status || 400).json({
        code: error.code,
        message: error.message || "Error cancelling receipt",
      });
    } finally {
      client.release();
    }
  });

  return router;
}

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

export default function (pool) {
  const router = Router();

  // --- POST /api/receipts — create one atomic receipt ---
  router.post("/", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await createReceipt(client, req.body, req.user?.id || null);
      await client.query("COMMIT");
      res.status(201).json({
        message:
          result.receipt.status === "pending"
            ? "Cheque receipt recorded (pending clearance)"
            : "Receipt recorded",
        ...result,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating receipt:", error);
      res.status(400).json({ message: error.message || "Error creating receipt" });
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
      res.status(400).json({ message: error.message || "Error confirming receipt" });
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
      res.status(400).json({ message: error.message || "Error cancelling receipt" });
    } finally {
      client.release();
    }
  });

  return router;
}

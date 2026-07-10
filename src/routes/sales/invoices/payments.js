// src/routes/sales/invoices/payments.js
import { Router } from "express";
import { cancelPaymentJournalEntry } from "../../accounting/payment-journal.js";
import {
  createReceipt,
  confirmReceipt,
  cancelReceipt,
  toLocalDateString,
} from "../../accounting/receipt-service.js";

// Helper function (can be moved to a shared util if used elsewhere)
const updateCustomerCredit = async (client, customerId, amount) => {
  try {
    const updateQuery = `
      UPDATE customers
      SET credit_used = GREATEST(0, COALESCE(credit_used, 0) + $1)
      WHERE id = $2
      RETURNING credit_used, credit_limit
    `;
    const result = await client.query(updateQuery, [amount, customerId]);
    if (result.rows.length === 0) {
      console.warn(`Customer ${customerId} not found when updating credit`);
      return null;
    }
    return result.rows[0];
  } catch (error) {
    console.error(`Error updating credit for customer ${customerId}:`, error);
    throw error; // Re-throw to be caught by transaction handler
  }
};

const fetchActiveAdjustmentForInvoice = async (client, invoiceId) => {
  const result = await client.query(
    `SELECT id, type
       FROM adjustment_documents
      WHERE original_invoice_id = $1
        AND status = 'active'
        AND COALESCE(is_consolidated, false) = false
      ORDER BY created_at DESC
      LIMIT 1`,
    [invoiceId]
  );
  return result.rows[0] || null;
};

export default function (pool) {
  const router = Router();

  // --- GET /api/payments (Get Payments) ---
  router.get("/", async (req, res) => {
    const { invoice_id, include_cancelled } = req.query; // Add new parameter

    try {
      let query = `
        SELECT
          p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
          p.payment_method, p.payment_reference, p.internal_reference,
          p.bank_account, p.journal_entry_id,
          p.notes, p.created_at, p.status, p.cancellation_date,
          je.reference_no as journal_reference_no
        FROM payments p
        LEFT JOIN journal_entries je ON p.journal_entry_id = je.id
        WHERE 1=1
      `;
      const queryParams = [];
      let paramCounter = 1;

      if (invoice_id) {
        queryParams.push(invoice_id);
        query += ` AND p.invoice_id = $${paramCounter++}`;
      }

      // Only include active payments by default
      if (include_cancelled !== "true") {
        query += ` AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending' OR p.status = 'overpaid')`;
      }

      query += " ORDER BY p.payment_date DESC, p.created_at DESC";

      const result = await pool.query(query, queryParams);

      // Parse amount_paid to number before sending
      const payments = result.rows.map((p) => ({
        ...p,
        amount_paid: parseFloat(p.amount_paid || 0),
      }));

      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res
        .status(500)
        .json({ message: "Error fetching payments", error: error.message });
    }
  });

  // --- GET /api/payments/all (Get All Payments with filters) ---
  router.get("/all", async (req, res) => {
    const {
      startDate,
      endDate,
      paymentMethod,
      status,
      search,
      include_cancelled = "true",
    } = req.query;

    try {
      let query = `
      SELECT
        p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
        p.payment_method, p.payment_reference, p.internal_reference,
        p.bank_account, p.journal_entry_id,
        p.notes, p.created_at, p.status, p.cancellation_date,
        i.customerid, i.salespersonid, c.name as customer_name,
        je.reference_no as journal_reference_no
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN customers c ON i.customerid = c.id
      LEFT JOIN journal_entries je ON p.journal_entry_id = je.id
      WHERE 1=1
    `;

      const queryParams = [];
      let paramCounter = 1;

      // Date filter
      if (startDate && endDate) {
        queryParams.push(
          new Date(parseInt(startDate)),
          new Date(parseInt(endDate))
        );
        query += ` AND p.payment_date BETWEEN $${paramCounter++} AND $${paramCounter++}`;
      }

      // Payment method filter
      if (paymentMethod) {
        queryParams.push(paymentMethod);
        query += ` AND p.payment_method = $${paramCounter++}`;
      }

      // Status filter
      if (status) {
        if (status === "active") {
          query += ` AND (p.status = 'active' OR p.status = 'pending' OR p.status = 'overpaid')`;
        } else {
          queryParams.push(status);
          query += ` AND p.status = $${paramCounter++}`;
        }
      } else if (include_cancelled !== "true") {
        query += ` AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending' OR p.status = 'overpaid')`;
      }

      // Search filter
      if (search) {
        queryParams.push(`%${search}%`);
        const searchParam = `$${paramCounter++}`;
        query += ` AND (
        p.invoice_id ILIKE ${searchParam} OR
        p.payment_reference ILIKE ${searchParam} OR
        CAST(p.amount_paid AS TEXT) ILIKE ${searchParam} OR
        c.name ILIKE ${searchParam}
      )`;
      }

      query += " ORDER BY p.payment_date DESC, p.created_at DESC";

      const result = await pool.query(query, queryParams);

      // Parse amount_paid to number before sending
      const payments = result.rows.map((p) => ({
        ...p,
        amount_paid: parseFloat(p.amount_paid || 0),
      }));

      res.json(payments);
    } catch (error) {
      console.error("Error fetching all payments:", error);
      res
        .status(500)
        .json({ message: "Error fetching payments", error: error.message });
    }
  });

  // --- GET /api/payments/by-reference/:reference (Get payments by reference) ---
  router.get("/by-reference/:reference", async (req, res) => {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ message: "Payment reference is required" });
    }

    try {
      const query = `
        SELECT
          p.payment_id,
          p.invoice_id,
          p.amount_paid,
          c.name as customer_name
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN customers c ON i.customerid = c.id
        WHERE p.payment_reference = $1
          AND (p.status IS NULL OR p.status != 'cancelled')
        ORDER BY i.createddate DESC
      `;
      const result = await pool.query(query, [reference]);

      const payments = result.rows.map((p) => ({
        ...p,
        amount_paid: parseFloat(p.amount_paid || 0),
      }));

      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments by reference:", error);
      res.status(500).json({
        message: "Error fetching payments by reference",
        error: error.message,
      });
    }
  });

  // --- POST /api/payments (Create Payment) ---
  router.post("/", async (req, res) => {
    const {
      invoice_id,
      payment_date,
      amount_paid,
      payment_method,
      payment_reference,
      bank_account,
      notes,
    } = req.body;

    // Basic validation
    if (!invoice_id || !payment_date || !amount_paid || !payment_method) {
      return res.status(400).json({
        message:
          "Missing required fields: invoice_id, payment_date, amount_paid, payment_method",
      });
    }
    if (isNaN(parseFloat(amount_paid)) || parseFloat(amount_paid) <= 0) {
      return res.status(400).json({
        message: "Invalid payment amount. Must be a positive number.",
      });
    }

    // Check for duplicate payment reference for the same invoice
    if (payment_reference && payment_reference.trim()) {
      const duplicateCheck = await pool.query(
        `SELECT payment_id FROM payments 
         WHERE invoice_id = $1 AND payment_reference = $2 
         AND (status IS NULL OR status != 'cancelled')`,
        [invoice_id, payment_reference.trim()]
      );
      
      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          message: `Payment reference "${payment_reference}" already exists for this invoice. Please use a unique reference.`,
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Invoice details & Lock the row
      const invoiceQuery = `
      SELECT id, customerid, paymenttype, totalamountpayable, balance_due, invoice_status
      FROM invoices
      WHERE id = $1 FOR UPDATE
    `;
      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice ${invoice_id} not found.`);
      }
      const invoice = invoiceResult.rows[0];
      const currentBalance = parseFloat(invoice.balance_due || 0);
      const paymentAmount = parseFloat(amount_paid);

      // 2. Check invoice status
      if (invoice.invoice_status === "cancelled") {
        throw new Error(
          `Invoice ${invoice_id} is cancelled and cannot receive payments.`
        );
      }

      // 3. Split into an invoice allocation (up to balance due) plus a
      // customer-owned excess allocation for any overpayment.
      const isOverpayment = paymentAmount > currentBalance;
      const regularAmount = isOverpayment ? currentBalance : paymentAmount;
      const overpaidAmount = isOverpayment
        ? parseFloat((paymentAmount - currentBalance).toFixed(2))
        : 0;

      const allocations = [];
      if (regularAmount > 0) {
        allocations.push({
          type: "invoice",
          invoice_id,
          amount: regularAmount,
        });
      }
      if (overpaidAmount > 0) {
        allocations.push({
          type: "excess",
          customer_id: invoice.customerid,
          amount: overpaidAmount,
        });
      }

      // 4. One atomic receipt owns the journal, balances, and compat payment
      // rows (cheques stay pending with no posting until confirmed).
      const result = await createReceipt(
        client,
        {
          payment_method,
          bank_account,
          display_reference: (payment_reference || "").trim() || null,
          received_date: payment_date,
          notes: notes || null,
          allocations,
        },
        req.user?.id || null
      );

      await client.query("COMMIT");

      const formattedPayments = result.payments.map((payment) => ({
        ...payment,
        amount_paid: parseFloat(payment.amount_paid || 0),
      }));

      res.status(201).json({
        message: isOverpayment
          ? "Payment created successfully. Overpaid amount recorded separately."
          : "Payment created successfully",
        payments: formattedPayments,
        receipt_id: result.receipt.id,
        isOverpayment,
        regularAmount: regularAmount,
        overpaidAmount: overpaidAmount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating payment:", error);
      res
        .status(500)
        .json({ message: "Error creating payment", error: error.message });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/payments/:payment_id/confirm - Mark pending payment as paid ---
  router.put("/:payment_id/confirm", async (req, res) => {
    const { payment_id } = req.params;
    const { bank_account } = req.body; // Accept bank_account from request body
    const paymentIdNum = parseInt(payment_id);

    if (isNaN(paymentIdNum)) {
      return res.status(400).json({ message: "Invalid payment ID." });
    }

    // Validate bank_account if provided
    if (bank_account && !['CASH', 'BANK_PBB', 'BANK_ABB'].includes(bank_account)) {
      return res.status(400).json({ message: "Invalid bank account. Must be one of: CASH, BANK_PBB, BANK_ABB" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Load the payment and its owning receipt (if any)
      const rowResult = await client.query(
        `SELECT p.*, ra.receipt_id
           FROM payments p
           LEFT JOIN receipt_allocations ra ON ra.id = p.receipt_allocation_id
          WHERE p.payment_id = $1`,
        [paymentIdNum]
      );
      if (rowResult.rows.length === 0) {
        throw new Error(`Payment ${paymentIdNum} not found.`);
      }
      const row = rowResult.rows[0];
      if (row.status !== "pending") {
        if (row.status === "active" || row.status === "overpaid") {
          throw new Error(`Payment ${paymentIdNum} has already been confirmed.`);
        }
        throw new Error(`Payment ${paymentIdNum} is ${row.status}, not pending.`);
      }

      let confirmedReceiptId;

      if (row.receipt_id) {
        // 2a. Receipt-backed pending cheque: confirm the exact receipt (all of
        // its allocations clear together — never matched by reference text).
        const confirmResult = await confirmReceipt(
          client,
          row.receipt_id,
          {
            posting_date: req.body?.posting_date || undefined,
            cheque_reference: req.body?.cheque_reference || undefined,
          },
          req.user?.id || null
        );
        confirmedReceiptId = confirmResult.receipt.id;
      } else {
        // 2b. Legacy pending cheque row(s): wrap them into one posted receipt
        // (grouped by the shared reference like the old batch confirm), then
        // supersede the legacy rows. The receipt validates against CURRENT
        // balances and posts the journal on the clearance date.
        let legacyRows;
        if (row.payment_reference) {
          const batch = await client.query(
            `SELECT p.*, i.customerid, i.invoice_status
               FROM payments p JOIN invoices i ON i.id = p.invoice_id
              WHERE p.payment_reference = $1 AND p.status = 'pending'
                AND p.receipt_allocation_id IS NULL
              ORDER BY p.payment_id
              FOR UPDATE OF p`,
            [row.payment_reference]
          );
          legacyRows = batch.rows;
        } else {
          const single = await client.query(
            `SELECT p.*, i.customerid, i.invoice_status
               FROM payments p JOIN invoices i ON i.id = p.invoice_id
              WHERE p.payment_id = $1
              FOR UPDATE OF p`,
            [paymentIdNum]
          );
          legacyRows = single.rows;
        }
        const usable = legacyRows.filter((r) => r.invoice_status !== "cancelled");
        if (usable.length === 0) {
          throw new Error("No confirmable pending payments found (invoice cancelled?).");
        }

        const allocations = usable.map((r) => {
          const isOverpaid = r.notes && r.notes.includes("Overpaid amount");
          return isOverpaid
            ? { type: "excess", customer_id: r.customerid, amount: parseFloat(r.amount_paid) }
            : { type: "invoice", invoice_id: r.invoice_id, amount: parseFloat(r.amount_paid) };
        });

        const result = await createReceipt(
          client,
          {
            payment_method: "cheque",
            post_immediately: true,
            bank_account: bank_account || "BANK_PBB",
            display_reference: row.payment_reference || null,
            cheque_reference: req.body?.cheque_reference || null,
            received_date: toLocalDateString(usable[0].payment_date),
            posting_date: req.body?.posting_date || toLocalDateString(new Date()),
            notes: usable[0].notes || null,
            allocations,
          },
          req.user?.id || null
        );
        confirmedReceiptId = result.receipt.id;

        await client.query(
          `UPDATE payments
              SET status = 'cancelled', cancellation_date = NOW(),
                  cancellation_reason = $2
            WHERE payment_id = ANY($1::int[])`,
          [usable.map((r) => r.payment_id), `Superseded by receipt #${confirmedReceiptId} on confirmation`]
        );
      }

      // 3. Return the confirmed compat rows of the receipt
      const confirmedRows = await client.query(
        `SELECT p.* FROM payments p
           JOIN receipt_allocations ra ON ra.id = p.receipt_allocation_id
          WHERE ra.receipt_id = $1
          ORDER BY p.payment_id`,
        [confirmedReceiptId]
      );

      await client.query("COMMIT");

      const confirmedPayments = confirmedRows.rows.map((p) => ({
        ...p,
        amount_paid: parseFloat(p.amount_paid || 0),
      }));
      const overpaidCount = confirmedPayments.filter((p) => p.status === "overpaid").length;

      res.json({
        message:
          confirmedPayments.length > 1
            ? `${confirmedPayments.length} payments confirmed successfully.`
            : "Payment confirmed successfully.",
        payments: confirmedPayments,
        receipt_id: confirmedReceiptId,
        hasOverpaidPayments: overpaidCount > 0,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error confirming payment(s):", error);
      res
        .status(500)
        .json({ message: "Error confirming payment(s)", error: error.message });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/payments/:payment_id/cancel (Cancel Payment) ---
  router.put("/:payment_id/cancel", async (req, res) => {
    const { payment_id } = req.params;
    const { reason } = req.body; // Optional cancellation reason
    const paymentIdNum = parseInt(payment_id);

    if (isNaN(paymentIdNum)) {
      return res.status(400).json({ message: "Invalid payment ID." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Payment details & Lock Invoice Row
      const paymentQuery = `
        SELECT p.*, i.customerid, i.paymenttype, i.invoice_status
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE p.payment_id = $1 
          AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending' OR p.status = 'overpaid')
        FOR UPDATE OF i -- Lock the associated invoice row
      `;
      const paymentResult = await client.query(paymentQuery, [paymentIdNum]);

      if (paymentResult.rows.length === 0) {
        throw new Error(
          `Payment ${paymentIdNum} not found or already cancelled.`
        );
      }
      const payment = paymentResult.rows[0];
      const {
        invoice_id,
        amount_paid,
        customerid,
        paymenttype,
        invoice_status,
      } = payment;
      const paidAmount = parseFloat(amount_paid || 0);

      // Optional: Prevent canceling payment if invoice is cancelled?
      if (invoice_status === "cancelled") {
        throw new Error(
          `Cannot cancel payment for a cancelled invoice (${invoice_id}).`
        );
      }

      // Automatic CASH-bill collection rows are owned by the invoice — they
      // are adjusted/cancelled only through invoice edits and conversions.
      if (payment.is_auto_collection) {
        throw new Error(
          `Payment ${paymentIdNum} is the automatic collection of CASH invoice ${invoice_id}. Edit or convert the invoice instead.`
        );
      }

      const existingAdjustment = await fetchActiveAdjustmentForInvoice(
        client,
        invoice_id
      );
      if (existingAdjustment) {
        throw new Error(
          `Cannot cancel payment for invoice ${invoice_id} because active adjustment document ${existingAdjustment.id} exists. Cancel the adjustment document first.`
        );
      }

      // Receipt-backed rows are cancelled through the receipt so the shared
      // journal and every sibling allocation stay consistent. A single-
      // allocation receipt cancels transparently right here; a grouped one
      // must be cancelled explicitly (never silently affect other invoices).
      if (payment.receipt_allocation_id) {
        const allocInfo = await client.query(
          `SELECT ra.receipt_id,
                  (SELECT COUNT(*) FROM receipt_allocations x WHERE x.receipt_id = ra.receipt_id) AS alloc_count
             FROM receipt_allocations ra WHERE ra.id = $1`,
          [payment.receipt_allocation_id]
        );
        if (allocInfo.rows.length > 0) {
          const { receipt_id: receiptId, alloc_count } = allocInfo.rows[0];
          if (parseInt(alloc_count, 10) > 1) {
            throw new Error(
              `Payment ${paymentIdNum} belongs to grouped receipt #${receiptId} covering ${alloc_count} allocations. Cancel receipt #${receiptId} instead so all its invoices are reversed together.`
            );
          }
          await cancelReceipt(client, receiptId, reason || null, req.user?.id || null);
          const refreshed = await client.query(
            `SELECT * FROM payments WHERE payment_id = $1`,
            [paymentIdNum]
          );
          await client.query("COMMIT");
          return res.json({
            message: "Payment cancelled successfully",
            payment: {
              ...refreshed.rows[0],
              amount_paid: parseFloat(refreshed.rows[0].amount_paid || 0),
            },
            receipt_id: receiptId,
          });
        }
      }

      // 2. Update payment status to cancelled
      const updateQuery = `
        UPDATE payments
        SET status = 'cancelled',
            cancellation_date = NOW(),
            cancellation_reason = $1
        WHERE payment_id = $2
        RETURNING *
      `;
      const updateResult = await client.query(updateQuery, [
        reason || null,
        paymentIdNum,
      ]);
      const cancelledPayment = updateResult.rows[0];

      // 2a. Cancel the associated journal entry if it exists
      if (cancelledPayment.journal_entry_id) {
        await cancelPaymentJournalEntry(client, cancelledPayment.journal_entry_id);
      }

      // 3. Update Invoice balance and status (only for active payments)
      // Pending payments never affected the balance, so don't adjust it when cancelling
      if (payment.status === "active" || payment.status === null) {
        // Get current balance *after* locking
        const currentInvoiceState = await client.query(
          "SELECT balance_due, invoice_status, totalamountpayable FROM invoices WHERE id = $1",
          [invoice_id]
        );
        const currentBalance = parseFloat(
          currentInvoiceState.rows[0].balance_due || 0
        );
        const currentStatus = currentInvoiceState.rows[0].invoice_status;
        const totalPayable = parseFloat(
          currentInvoiceState.rows[0].totalamountpayable || 0
        );

        // Cap the restored balance at what is genuinely unpaid (invoice total
        // minus the remaining active payments), so a stray active payment can
        // never inflate the balance past the invoice total. Safe because
        // cancellation is blocked when active adjustment documents exist.
        const otherActiveResult = await client.query(
          `SELECT COALESCE(SUM(amount_paid), 0) AS active_paid
           FROM payments
           WHERE invoice_id = $1 AND payment_id != $2
             AND (status IS NULL OR status = 'active')`,
          [invoice_id, paymentIdNum]
        );
        const otherActivePaid = parseFloat(
          otherActiveResult.rows[0].active_paid || 0
        );
        const maxBalance = Math.max(0, totalPayable - otherActivePaid);

        const newBalance = Math.min(currentBalance + paidAmount, maxBalance);
        // Round to 2 decimal places
        const finalNewBalance = parseFloat(newBalance.toFixed(2));

        // Determine the new status
        let newStatus;
        if (finalNewBalance <= 0) {
          newStatus = "paid"; // Fully paid
        } else {
          // If invoice was overdue before, keep it overdue
          if (currentStatus === "Overdue") {
            newStatus = "Overdue";
          } else {
            // Otherwise use normal unpaid status
            newStatus = "Unpaid";
          }
        }

        const updateInvoiceQuery = `
          UPDATE invoices SET balance_due = $1, invoice_status = $2
          WHERE id = $3
        `;
        await client.query(updateInvoiceQuery, [
          finalNewBalance,
          newStatus,
          invoice_id,
        ]);

        // 4. Update Customer Credit if it was an INVOICE payment (only for active payments)
        if (paymenttype === "INVOICE") {
          // Add back the actual balance increase (matches the cap above)
          const balanceRestored = parseFloat(
            (finalNewBalance - currentBalance).toFixed(2)
          );
          if (balanceRestored > 0) {
            await updateCustomerCredit(client, customerid, balanceRestored);
          }
        }
      } else {
        // For pending payments, no balance or credit adjustments needed
        console.log(
          `Cancelled pending payment ${paymentIdNum} - no balance/credit adjustments made`
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "Payment cancelled successfully",
        // Parse amount back to float
        payment: {
          ...cancelledPayment,
          amount_paid: parseFloat(cancelledPayment.amount_paid || 0),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling payment:", error);
      res
        .status(500)
        .json({ message: "Error cancelling payment", error: error.message });
    } finally {
      client.release();
    }
  });

  // Keep the DELETE endpoint for backward compatibility but mark as deprecated
  router.delete("/:payment_id", async (req, res) => {
    const { payment_id } = req.params;

    // Forward the request to the new cancel endpoint
    req.method = "PUT";
    req.url = `/${payment_id}/cancel`;

    // Add deprecation warning header
    res.setHeader(
      "X-Deprecated-API",
      "Use PUT /api/payments/:payment_id/cancel instead"
    );

    // Pass to the cancel endpoint handler
    router.handle(req, res);
  });

  return router;
}

// src/routes/sales/invoices/payments.js
import { Router } from "express";

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
          p.notes, p.created_at, p.status, p.cancellation_date
        FROM payments p
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
        query += ` AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending')`;
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
        p.notes, p.created_at, p.status, p.cancellation_date,
        i.customerid, i.salespersonid, c.name as customer_name
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN customers c ON i.customerid = c.id
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
          query += ` AND (p.status = 'active' OR p.status = 'pending')`;
        } else {
          queryParams.push(status);
          query += ` AND p.status = $${paramCounter++}`;
        }
      } else if (include_cancelled !== "true") {
        query += ` AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending')`;
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
      invoice_id, // Required: ID of the invoice being paid
      payment_date, // Required: Date of payment
      amount_paid, // Required: Amount being paid
      payment_method, // Required: 'cash', 'cheque', 'bank_transfer', 'online'
      payment_reference, // Optional: Cheque no, transaction ID, etc.
      notes, // Optional: Any notes about the payment
      // internal_reference is NOT expected from frontend for standard payments
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

      // 2. Check invoice status and payment amount
      if (invoice.invoice_status === "cancelled") {
        throw new Error(
          `Invoice ${invoice_id} is cancelled and cannot receive payments.`
        );
      }
      if (parseFloat(amount_paid) > currentBalance) {
        throw new Error(
          `Payment amount (${parseFloat(amount_paid).toFixed(
            2
          )}) exceeds balance due (${currentBalance.toFixed(2)}).`
        );
      }

      // 3. Insert the payment record
      // (Removed internal_reference generation logic - assume not needed or handled elsewhere)
      const insertPaymentQuery = `
        INSERT INTO payments (
          invoice_id, payment_date, amount_paid, payment_method,
          payment_reference, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      // Determine initial status based on payment method
      const initialStatus = payment_method === "cheque" ? "pending" : "active";

      const paymentValues = [
        invoice_id,
        payment_date,
        parseFloat(amount_paid),
        payment_method,
        payment_reference || null, // Use null if empty/undefined
        notes || null,
        initialStatus, // Set initial status based on payment method
      ];
      const paymentResult = await client.query(
        insertPaymentQuery,
        paymentValues
      );
      const createdPayment = paymentResult.rows[0];

      // Only update invoice balance and customer credit if payment is active (not pending)
      if (initialStatus === "active") {
        // 4. Update Invoice balance and status
        const newBalance = Math.max(
          0,
          currentBalance - parseFloat(amount_paid)
        );
        const finalNewBalance = parseFloat(newBalance.toFixed(2));

        let newStatus;
        if (finalNewBalance <= 0) {
          newStatus = "paid";
        } else {
          if (invoice.invoice_status === "overdue") {
            newStatus = "overdue";
          } else {
            newStatus = "Unpaid";
          }
        }

        const updateInvoiceQuery = `
        UPDATE invoices
        SET balance_due = $1, invoice_status = $2
        WHERE id = $3
      `;
        await client.query(updateInvoiceQuery, [
          finalNewBalance,
          newStatus,
          invoice_id,
        ]);

        // 5. Update Customer Credit if it was an INVOICE payment
        if (invoice.paymenttype === "INVOICE") {
          await updateCustomerCredit(
            client,
            invoice.customerid,
            -parseFloat(amount_paid)
          );
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Payment created successfully",
        // Parse amount back to float for consistency in response
        payment: {
          ...createdPayment,
          amount_paid: parseFloat(createdPayment.amount_paid || 0),
        },
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
    const paymentIdNum = parseInt(payment_id);

    if (isNaN(paymentIdNum)) {
      return res.status(400).json({ message: "Invalid payment ID." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get the initial payment to find its reference
      const initialPaymentQuery = `SELECT payment_reference FROM payments WHERE payment_id = $1 AND status = 'pending'`;
      const initialPaymentResult = await client.query(initialPaymentQuery, [
        paymentIdNum,
      ]);

      if (initialPaymentResult.rows.length === 0) {
        // Check if it was already confirmed to provide a better message
        const alreadyConfirmedCheck = await client.query(
          "SELECT payment_reference FROM payments WHERE payment_id = $1 AND status = 'active'",
          [paymentIdNum]
        );
        if (alreadyConfirmedCheck.rows.length > 0) {
          throw new Error(
            `Payment ${paymentIdNum} has already been confirmed.`
          );
        }
        throw new Error(
          `Payment ${paymentIdNum} not found or not in pending status.`
        );
      }
      const { payment_reference } = initialPaymentResult.rows[0];

      let paymentsToConfirm = [];

      // 2. Find all payments to confirm (single or batch)
      if (payment_reference) {
        // Batch confirmation
        const batchPaymentQuery = `
        SELECT p.*, i.customerid, i.paymenttype, i.invoice_status, i.balance_due
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE p.payment_reference = $1 AND p.status = 'pending'
        FOR UPDATE OF i, p -- Lock both associated invoice and payment rows
      `;
        const batchResult = await client.query(batchPaymentQuery, [
          payment_reference,
        ]);
        paymentsToConfirm = batchResult.rows;
      } else {
        // Single confirmation
        const singlePaymentQuery = `
        SELECT p.*, i.customerid, i.paymenttype, i.invoice_status, i.balance_due
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE p.payment_id = $1 AND p.status = 'pending'
        FOR UPDATE OF i, p
      `;
        const singleResult = await client.query(singlePaymentQuery, [
          paymentIdNum,
        ]);
        paymentsToConfirm = singleResult.rows;
      }

      if (paymentsToConfirm.length === 0) {
        throw new Error(`No pending payments found to confirm.`);
      }

      const confirmedPayments = [];

      // 3. Process each payment
      for (const payment of paymentsToConfirm) {
        const {
          invoice_id,
          amount_paid,
          customerid,
          paymenttype,
          invoice_status,
        } = payment;
        const paidAmount = parseFloat(amount_paid || 0);

        if (invoice_status === "cancelled") {
          console.warn(
            `Skipping confirmation for payment ${payment.payment_id} as its invoice ${invoice_id} is cancelled.`
          );
          continue;
        }

        // 4. Update payment status to active
        const updatePaymentQuery = `
        UPDATE payments
        SET status = 'active'
        WHERE payment_id = $1
        RETURNING *
      `;
        const updateResult = await client.query(updatePaymentQuery, [
          payment.payment_id,
        ]);
        const confirmedPaymentData = updateResult.rows[0];

        // 5. Update Invoice balance and status
        const currentBalance = parseFloat(payment.balance_due || 0);
        const newBalance = Math.max(0, currentBalance - paidAmount);
        const finalNewBalance = parseFloat(newBalance.toFixed(2));

        let newStatus;
        if (finalNewBalance <= 0) {
          newStatus = "paid";
        } else {
          newStatus = invoice_status === "overdue" ? "overdue" : "Unpaid";
        }

        const updateInvoiceQuery = `
        UPDATE invoices
        SET balance_due = $1, invoice_status = $2
        WHERE id = $3
      `;
        await client.query(updateInvoiceQuery, [
          finalNewBalance,
          newStatus,
          invoice_id,
        ]);

        // 6. Update Customer Credit if it was an INVOICE payment
        if (paymenttype === "INVOICE") {
          await updateCustomerCredit(
            client,
            customerid,
            -paidAmount // Reduce credit used
          );
        }

        confirmedPayments.push({
          ...confirmedPaymentData,
          amount_paid: parseFloat(confirmedPaymentData.amount_paid || 0),
        });
      }

      await client.query("COMMIT");

      const message =
        confirmedPayments.length > 1
          ? `${confirmedPayments.length} payments confirmed successfully.`
          : "Payment confirmed successfully.";

      res.json({
        message,
        payments: confirmedPayments, // Return an array of payments
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
          AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending')
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

      // 3. Update Invoice balance and status (only for active payments)
      // Pending payments never affected the balance, so don't adjust it when cancelling
      if (payment.status === "active" || payment.status === null) {
        // Get current balance *after* locking
        const currentInvoiceState = await client.query(
          "SELECT balance_due, invoice_status FROM invoices WHERE id = $1",
          [invoice_id]
        );
        const currentBalance = parseFloat(
          currentInvoiceState.rows[0].balance_due || 0
        );
        const currentStatus = currentInvoiceState.rows[0].invoice_status;

        const newBalance = currentBalance + paidAmount;
        // Round to 2 decimal places
        const finalNewBalance = parseFloat(newBalance.toFixed(2));

        // Determine the new status
        let newStatus;
        if (finalNewBalance <= 0) {
          newStatus = "paid"; // Fully paid
        } else {
          // If invoice was overdue before, keep it overdue
          if (currentStatus === "overdue") {
            newStatus = "overdue";
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
          await updateCustomerCredit(client, customerid, paidAmount); // Add back the amount to credit used
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

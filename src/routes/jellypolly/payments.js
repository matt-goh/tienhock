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
  // Added filtering by invoice_id
  router.get("/", async (req, res) => {
    const { invoice_id, include_cancelled } = req.query; // Add new parameter

    try {
      let query = `
        SELECT
          p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
          p.payment_method, p.payment_reference, p.internal_reference,
          p.notes, p.created_at, p.status, p.cancellation_date
        FROM jellypolly.payments p
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
        query += ` AND (p.status IS NULL OR p.status = 'active')`;
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
        FROM jellypolly.invoices
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
        INSERT INTO jellypolly.payments (
          invoice_id, payment_date, amount_paid, payment_method,
          payment_reference, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const paymentValues = [
        invoice_id,
        payment_date,
        parseFloat(amount_paid),
        payment_method,
        payment_reference || null, // Use null if empty/undefined
        notes || null,
      ];
      const paymentResult = await client.query(
        insertPaymentQuery,
        paymentValues
      );
      const createdPayment = paymentResult.rows[0];

      // 4. Update Invoice balance and status
      const newBalance = Math.max(0, currentBalance - parseFloat(amount_paid));
      // Round to 2 decimal places to avoid floating point issues
      const finalNewBalance = parseFloat(newBalance.toFixed(2));

      // Get current invoice status to maintain overdue status for partial payments
      let newStatus;
      if (finalNewBalance <= 0) {
        newStatus = "paid"; // Always paid if balance is 0
      } else {
        // If still has balance, maintain "overdue" status if it was already overdue
        if (invoice.invoice_status === "overdue") {
          newStatus = "overdue"; // Maintain overdue status for partial payments
        } else {
          newStatus = "Unpaid"; // Otherwise use normal unpaid status
        }
      }

      const updateInvoiceQuery = `
        UPDATE jellypolly.invoices
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
          -parseFloat(amount_paid) // Reduce credit used
        );
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
        FROM jellypolly.payments p
        JOIN jellypolly.invoices i ON p.invoice_id = i.id
        WHERE p.payment_id = $1 
          AND (p.status IS NULL OR p.status = 'active')
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
        UPDATE jellypolly.payments 
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

      // 3. Update Invoice balance and status
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
        UPDATE jellypolly.invoices SET balance_due = $1, invoice_status = $2
        WHERE id = $3
      `;
      await client.query(updateInvoiceQuery, [
        finalNewBalance,
        newStatus,
        invoice_id,
      ]);

      // 4. Update Customer Credit if it was an INVOICE payment
      if (paymenttype === "INVOICE") {
        await updateCustomerCredit(client, customerid, paidAmount); // Add back the amount to credit used
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

  return router;
}

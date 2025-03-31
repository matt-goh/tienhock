// src/routes/sales/invoices/payments.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all payments (with optional invoice_id filter)
  router.get("/", async (req, res) => {
    const { invoice_id } = req.query;

    try {
      let query = `
        SELECT p.*, 
               i.id as invoice_number,
               c.name as customer_name
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN customers c ON i.customerid = c.id
      `;

      const queryParams = [];

      if (invoice_id) {
        query += " WHERE p.invoice_id = $1";
        queryParams.push(invoice_id);
      }

      query += " ORDER BY p.payment_date DESC";

      const result = await pool.query(query, queryParams);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({
        message: "Error fetching payments",
        error: error.message,
      });
    }
  });

  // Create a new payment
  router.post("/", async (req, res) => {
    const {
      invoice_id,
      payment_date,
      amount_paid,
      payment_method,
      payment_reference,
      internal_reference,
      notes,
    } = req.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if required fields are provided
      if (!invoice_id || !payment_date || !amount_paid || !payment_method) {
        throw new Error(
          "Missing required fields: invoice_id, payment_date, amount_paid, payment_method"
        );
      }

      // Get invoice details
      const invoiceQuery = `
        SELECT i.*, c.id as customer_id
        FROM invoices i
        LEFT JOIN customers c ON i.customerid = c.id
        WHERE i.id = $1
      `;

      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoice_id} not found`);
      }

      const invoice = invoiceResult.rows[0];

      // Create the payment
      const paymentQuery = `
        INSERT INTO payments (
          invoice_id,
          payment_date,
          amount_paid,
          payment_method,
          payment_reference,
          internal_reference,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const paymentResult = await client.query(paymentQuery, [
        invoice_id,
        payment_date,
        amount_paid,
        payment_method,
        payment_reference || null,
        internal_reference || null,
        notes || null,
      ]);

      // Update invoice balance_due and status
      const newBalance = Math.max(
        0,
        parseFloat(invoice.balance_due) - parseFloat(amount_paid)
      );

      // If balance is 0, set status to "paid"
      const newStatus = newBalance === 0 ? "paid" : "Unpaid";

      await client.query(
        `UPDATE invoices SET balance_due = $1, invoice_status = $2 WHERE id = $3`,
        [newBalance, newStatus, invoice_id]
      );

      // Update customer credit_used if this is an INVOICE payment
      if (invoice.paymenttype === "INVOICE" && invoice.customerid) {
        // Reduce the customer's credit_used by the payment amount
        await client.query(
          `UPDATE customers 
           SET credit_used = GREATEST(0, COALESCE(credit_used, 0) - $1)
           WHERE id = $2`,
          [amount_paid, invoice.customerid]
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Payment created successfully",
        payment: paymentResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating payment:", error);
      res.status(500).json({
        message: "Error creating payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Delete a payment
  router.delete("/:payment_id", async (req, res) => {
    const { payment_id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get payment details before deleting (to update invoice balance)
      const paymentQuery = "SELECT * FROM payments WHERE payment_id = $1";
      const paymentResult = await client.query(paymentQuery, [payment_id]);

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ message: "Payment not found" });
      }

      const payment = paymentResult.rows[0];
      const { invoice_id, amount_paid } = payment;

      // Get the current invoice balance and customer info
      const invoiceQuery = `
        SELECT i.*, c.id as customer_id
        FROM invoices i
        LEFT JOIN customers c ON i.customerid = c.id
        WHERE i.id = $1
      `;
      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoice_id} not found`);
      }

      const invoice = invoiceResult.rows[0];

      // Calculate the new balance (add the deleted payment amount back to the balance)
      const currentBalance = parseFloat(invoice.balance_due);
      const newBalance = currentBalance + parseFloat(amount_paid);
      const status = newBalance <= 0 ? "paid" : "Unpaid";

      // Update the invoice balance
      await client.query(
        "UPDATE invoices SET balance_due = $1, invoice_status = $2 WHERE id = $3",
        [newBalance, status, invoice_id]
      );

      // Update customer credit_used if this was an INVOICE payment
      if (invoice.paymenttype === "INVOICE" && invoice.customerid) {
        // Increase the customer's credit_used by the payment amount
        await client.query(
          `UPDATE customers 
           SET credit_used = COALESCE(credit_used, 0) + $1
           WHERE id = $2`,
          [amount_paid, invoice.customerid]
        );
      }

      // Delete the payment
      const deleteQuery =
        "DELETE FROM payments WHERE payment_id = $1 RETURNING *";
      const deleteResult = await client.query(deleteQuery, [payment_id]);

      await client.query("COMMIT");

      res.json({
        message: "Payment deleted successfully",
        payment: deleteResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting payment:", error);
      res.status(500).json({
        message: "Error deleting payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}

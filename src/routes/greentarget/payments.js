// src/routes/greentarget/payments.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all payments (with optional invoice_id filter)
  router.get("/", async (req, res) => {
    const { invoice_id } = req.query;

    try {
      let query = `
        SELECT p.*, 
               i.invoice_number,
               c.name as customer_name
        FROM greentarget.payments p
        JOIN greentarget.invoices i ON p.invoice_id = i.invoice_id
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
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
      console.error("Error fetching Green Target payments:", error);
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
        SELECT i.*, c.customer_id
        FROM greentarget.invoices i
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
        WHERE i.invoice_id = $1
      `;

      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoice_id} not found`);
      }

      const invoice = invoiceResult.rows[0];

      // Create the payment
      const paymentQuery = `
        INSERT INTO greentarget.payments (
          invoice_id,
          payment_date,
          amount_paid,
          payment_method,
          payment_reference,
          internal_reference
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const paymentResult = await client.query(paymentQuery, [
        invoice_id,
        payment_date,
        amount_paid,
        payment_method,
        payment_reference || null,
        internal_reference || null,
      ]);

      // Update invoice balance_due
      const newBalanceDue = Math.max(
        0,
        parseFloat(invoice.balance_due) - parseFloat(amount_paid)
      );

      await client.query(
        `UPDATE greentarget.invoices SET balance_due = $1 WHERE invoice_id = $2`,
        [newBalanceDue, invoice_id]
      );

      // Update customer last_activity_date
      await client.query(
        `UPDATE greentarget.customers SET last_activity_date = CURRENT_DATE WHERE customer_id = $1`,
        [invoice.customer_id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        message: "Payment created successfully",
        payment: paymentResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating Green Target payment:", error);
      res.status(500).json({
        message: "Error creating payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Get debtors report
  router.get("/debtors", async (req, res) => {
    try {
      const query = `
        SELECT 
          c.customer_id,
          c.name,
          c.phone_number,
          SUM(i.total_amount) as total_invoiced,
          SUM(COALESCE(p.amount_paid, 0)) as total_paid,
          SUM(i.total_amount) - SUM(COALESCE(p.amount_paid, 0)) as balance
        FROM greentarget.customers c
        JOIN greentarget.invoices i ON c.customer_id = i.customer_id
        LEFT JOIN (
          SELECT invoice_id, SUM(amount_paid) as amount_paid
          FROM greentarget.payments
          GROUP BY invoice_id
        ) p ON i.invoice_id = p.invoice_id
        GROUP BY c.customer_id, c.name, c.phone_number
        HAVING SUM(i.total_amount) > SUM(COALESCE(p.amount_paid, 0))
        ORDER BY balance DESC
      `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching debtors report:", error);
      res.status(500).json({
        message: "Error fetching debtors report",
        error: error.message,
      });
    }
  });

  // Delete a payment
  router.delete("/:payment_id", async (req, res) => {
    const { payment_id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get payment details before deleting (to update invoice balance)
      const paymentQuery =
        "SELECT * FROM greentarget.payments WHERE payment_id = $1";
      const paymentResult = await client.query(paymentQuery, [payment_id]);

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ message: "Payment not found" });
      }

      const payment = paymentResult.rows[0];
      const { invoice_id, amount_paid } = payment;

      // Get the current invoice balance
      const invoiceQuery =
        "SELECT balance_due FROM greentarget.invoices WHERE invoice_id = $1";
      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoice_id} not found`);
      }

      // Calculate the new balance (add the deleted payment amount back to the balance)
      const currentBalance = parseFloat(invoiceResult.rows[0].balance_due);
      const newBalance = currentBalance + parseFloat(amount_paid);

      // Update the invoice balance
      await client.query(
        "UPDATE greentarget.invoices SET balance_due = $1 WHERE invoice_id = $2",
        [newBalance, invoice_id]
      );

      // Delete the payment
      const deleteQuery =
        "DELETE FROM greentarget.payments WHERE payment_id = $1 RETURNING *";
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

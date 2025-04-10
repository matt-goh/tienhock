// src/routes/greentarget/payments.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all payments (with optional invoice_id filter)
  router.get("/", async (req, res) => {
    const { invoice_id, include_cancelled } = req.query; // Add include_cancelled parameter

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
      let paramCounter = 1;

      if (invoice_id) {
        query += " WHERE p.invoice_id = $1";
        queryParams.push(invoice_id);
        paramCounter++;
      } else {
        query += " WHERE 1=1";
      }

      // Only include active payments by default
      if (include_cancelled !== "true") {
        query += ` AND (p.status IS NULL OR p.status = 'active')`;
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
      const currentStatus = invoice.status;

      if (newBalanceDue === 0) {
        // If fully paid, always set to paid
        await client.query(
          `UPDATE greentarget.invoices SET balance_due = $1, status = 'paid' WHERE invoice_id = $2`,
          [newBalanceDue, invoice_id]
        );
      } else {
        // If partially paid, maintain overdue status if already overdue
        const newStatus = currentStatus === "overdue" ? "overdue" : "active";

        await client.query(
          `UPDATE greentarget.invoices SET balance_due = $1, status = $2 WHERE invoice_id = $3`,
          [newBalanceDue, newStatus, invoice_id]
        );
      }

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
          /* Collect unique phone numbers as an array */
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(ph.phone_number, '')), NULL) as phone_numbers,
          
          -- Get pre-aggregated invoice and payment data from subquery
          invoice_data.total_invoiced,
          invoice_data.total_paid,
          invoice_data.balance,
          
          -- Add new field to check for overdue invoices (as a subquery)
          (SELECT EXISTS(
            SELECT 1 FROM greentarget.invoices oi 
            WHERE oi.customer_id = c.customer_id 
            AND oi.status = 'overdue'
            AND oi.status != 'cancelled'
          )) as has_overdue
          
        FROM greentarget.customers c
        -- Collect phone numbers from both customer and locations (existing logic)
        LEFT JOIN LATERAL (
          SELECT c.phone_number
          UNION
          SELECT l.phone_number
          FROM greentarget.rentals r
          JOIN greentarget.locations l ON r.location_id = l.location_id
          WHERE r.customer_id = c.customer_id
        ) ph ON true
        
        -- Use a subquery to pre-aggregate invoice and payment data per customer
        LEFT JOIN (
          SELECT 
            i.customer_id,
            SUM(CASE WHEN i.status != 'cancelled' THEN i.total_amount ELSE 0 END) as total_invoiced,
            SUM(
              COALESCE(
                (SELECT SUM(amount_paid) 
                FROM greentarget.payments p 
                WHERE p.invoice_id = i.invoice_id 
                AND (p.status IS NULL OR p.status = 'active')
                ), 0
              )
            ) as total_paid,
            SUM(CASE WHEN i.status != 'cancelled' THEN i.total_amount ELSE 0 END) - 
            SUM(
              COALESCE(
                (SELECT SUM(amount_paid) 
                FROM greentarget.payments p 
                WHERE p.invoice_id = i.invoice_id 
                AND (p.status IS NULL OR p.status = 'active')
                ), 0
              )
            ) as balance
          FROM greentarget.invoices i
          GROUP BY i.customer_id
        ) invoice_data ON c.customer_id = invoice_data.customer_id

        -- Group by customer for phone number aggregation
        GROUP BY c.customer_id, c.name, invoice_data.total_invoiced, invoice_data.total_paid, invoice_data.balance

        -- Filter Groups: Only include customers who have a positive outstanding balance
        HAVING invoice_data.balance > 0.001 -- Use a small threshold for floating point comparison

        -- Order by the calculated balance
        ORDER BY invoice_data.balance DESC;
      `;

      const result = await pool.query(query);
      // Ensure numeric types are returned correctly
      const debtors = result.rows.map((debtor) => ({
        ...debtor,
        phone_numbers: debtor.phone_numbers || [], // Ensure phone_numbers is always an array
        total_invoiced: parseFloat(debtor.total_invoiced || 0),
        total_paid: parseFloat(debtor.total_paid || 0),
        balance: parseFloat(debtor.balance || 0),
        has_overdue: !!debtor.has_overdue,
      }));
      res.json(debtors);
    } catch (error) {
      console.error("Error fetching debtors report:", error);
      res.status(500).json({
        message: "Error fetching debtors report",
        error: error.message,
      });
    }
  });

  router.put("/:payment_id/cancel", async (req, res) => {
    const { payment_id } = req.params;
    const { reason } = req.body; // Optional cancellation reason
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get payment details before cancelling
      const paymentQuery = `
        SELECT p.*, i.customer_id, i.balance_due 
        FROM greentarget.payments p 
        JOIN greentarget.invoices i ON p.invoice_id = i.invoice_id
        WHERE p.payment_id = $1 AND (p.status IS NULL OR p.status = 'active')
        FOR UPDATE OF i
      `;
      const paymentResult = await client.query(paymentQuery, [payment_id]);

      if (paymentResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Payment not found or already cancelled" });
      }

      const payment = paymentResult.rows[0];
      const { invoice_id, amount_paid } = payment;

      // Set payment status to cancelled
      const updatePaymentQuery = `
        UPDATE greentarget.payments 
        SET status = 'cancelled', 
            cancellation_date = CURRENT_TIMESTAMP,
            cancellation_reason = $1
        WHERE payment_id = $2
        RETURNING *
      `;
      const updateResult = await client.query(updatePaymentQuery, [
        reason || null,
        payment_id,
      ]);

      // Get the current invoice balance
      const invoiceQuery =
        "SELECT balance_due FROM greentarget.invoices WHERE invoice_id = $1";
      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoice_id} not found`);
      }

      // Get both the balance and status
      const currentBalance = parseFloat(invoiceResult.rows[0].balance_due);
      const currentStatus = invoiceResult.rows[0].status;
      const newBalance = currentBalance + parseFloat(amount_paid);

      // Determine the new status based on balance and current status
      let newStatus;
      if (newBalance === 0) {
        newStatus = "paid";
      } else {
        // Maintain overdue status if already overdue
        newStatus = currentStatus === "overdue" ? "overdue" : "active";
      }

      // Update both balance and status
      await client.query(
        "UPDATE greentarget.invoices SET balance_due = $1, status = $2 WHERE invoice_id = $3",
        [newBalance, newStatus, invoice_id]
      );

      await client.query("COMMIT");

      res.json({
        message: "Payment cancelled successfully",
        payment: updateResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling payment:", error);
      res.status(500).json({
        message: "Error cancelling payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Replace Delete with redirect to Cancel for backward compatibility
  router.delete("/:payment_id", async (req, res) => {
    const { payment_id } = req.params;

    // Forward to the cancel endpoint
    req.method = "PUT";
    req.url = `/${payment_id}/cancel`;

    // Add deprecation warning header
    res.setHeader(
      "X-Deprecated-API",
      "Use PUT /greentarget/api/payments/:payment_id/cancel instead"
    );

    // Pass the request to the cancel handler
    router.handle(req, res);
  });

  return router;
}

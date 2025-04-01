// src/routes/greentarget/invoices.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all invoices (with optional filters)
  router.get("/", async (req, res) => {
    const { customer_id, rental_id, start_date, end_date } = req.query;

    try {
      let query = `
      SELECT i.*, 
             c.name as customer_name,
             c.phone_number as customer_phone_number,
             c.tin_number,
             c.id_number,
             l.address as location_address,
             l.phone_number as location_phone_number,
             r.driver, 
             COALESCE(SUM(CASE WHEN p.status IS NULL OR p.status = 'active' THEN p.amount_paid ELSE 0 END), 0) as amount_paid
      FROM greentarget.invoices i
      JOIN greentarget.customers c ON i.customer_id = c.customer_id
      LEFT JOIN greentarget.rentals r ON i.rental_id = r.rental_id
      LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
      LEFT JOIN greentarget.payments p ON i.invoice_id = p.invoice_id
      WHERE 1=1
    `;

      const queryParams = [];
      let paramCounter = 1;

      if (customer_id) {
        query += ` AND i.customer_id = $${paramCounter}`;
        queryParams.push(customer_id);
        paramCounter++;
      }

      if (rental_id) {
        query += ` AND i.rental_id = $${paramCounter}`;
        queryParams.push(rental_id);
        paramCounter++;
      }

      if (start_date) {
        query += ` AND i.date_issued >= $${paramCounter}`;
        queryParams.push(start_date);
        paramCounter++;
      }

      if (end_date) {
        query += ` AND i.date_issued <= $${paramCounter}`;
        queryParams.push(end_date);
        paramCounter++;
      }

      query += ` GROUP BY i.invoice_id, c.name, r.driver, c.phone_number, c.tin_number, c.id_number, l.address, l.phone_number`;

      query += " ORDER BY i.date_issued DESC";

      const result = await pool.query(query, queryParams);

      // Calculate current balance for each invoice
      const invoicesWithBalance = result.rows.map((invoice) => ({
        ...invoice,
        current_balance:
          parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid),
      }));

      res.json(invoicesWithBalance);
    } catch (error) {
      console.error("Error fetching Green Target invoices:", error);
      res.status(500).json({
        message: "Error fetching invoices",
        error: error.message,
      });
    }
  });

  // Generate a unique invoice number
  async function generateInvoiceNumber(client, type) {
    const year = new Date().getFullYear();
    const sequenceName =
      type === "regular"
        ? "greentarget.regular_invoice_seq"
        : "greentarget.statement_invoice_seq";

    const result = await client.query(
      `SELECT nextval('${sequenceName}') as next_val`
    );
    const nextVal = result.rows[0].next_val;

    if (type === "regular") {
      return `${year}/${String(nextVal).padStart(5, "0")}`;
    } else {
      return `I${year}/${String(nextVal).padStart(4, "0")}`;
    }
  }

  // Get invoice by ID
  router.get("/:invoice_id", async (req, res) => {
    const { invoice_id } = req.params;

    try {
      // Get invoice details with customer, rental, and payment info
      // Filtering out cancelled payments from the amount_paid calculation
      const query = `
      SELECT i.*,
             c.name as customer_name,
             c.phone_number as customer_phone_number,
             c.tin_number,
             c.id_number,
             r.rental_id,
             r.tong_no,
             r.date_placed,
             r.date_picked,
             r.driver,
             l.address as location_address,
             l.phone_number as location_phone_number,
             COALESCE(SUM(CASE WHEN p.status IS NULL OR p.status = 'active' THEN p.amount_paid ELSE 0 END), 0) as amount_paid
      FROM greentarget.invoices i
      JOIN greentarget.customers c ON i.customer_id = c.customer_id
      LEFT JOIN greentarget.rentals r ON i.rental_id = r.rental_id
      LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
      LEFT JOIN greentarget.payments p ON i.invoice_id = p.invoice_id
      WHERE i.invoice_id = $1
      GROUP BY i.invoice_id, c.name, c.phone_number, c.tin_number, c.id_number, 
               r.rental_id, r.tong_no, r.date_placed, r.date_picked, r.driver,
               l.address, l.phone_number
    `;

      const result = await pool.query(query, [invoice_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get payments for this invoice (include status information)
      const paymentsQuery = `
      SELECT *
      FROM greentarget.payments
      WHERE invoice_id = $1
      ORDER BY payment_date DESC, payment_id DESC
    `;

      const paymentsResult = await pool.query(paymentsQuery, [invoice_id]);

      // Calculate current balance as total_amount minus active payments
      const invoice = result.rows[0];
      invoice.current_balance =
        parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid);

      res.json({
        invoice: invoice,
        payments: paymentsResult.rows,
      });
    } catch (error) {
      console.error("Error fetching Green Target invoice:", error);
      res.status(500).json({
        message: "Error fetching invoice",
        error: error.message,
      });
    }
  });

  // Create a new invoice
  router.post("/", async (req, res) => {
    const {
      type,
      customer_id,
      rental_id,
      amount_before_tax,
      tax_amount,
      date_issued,
      statement_period_start,
      statement_period_end,
    } = req.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if required fields are provided
      if (!type || !customer_id || !amount_before_tax || !date_issued) {
        throw new Error("Missing required fields");
      }

      // Additional validations based on invoice type
      if (type === "regular" && !rental_id) {
        throw new Error("Rental ID is required for regular invoices");
      }

      if (
        type === "statement" &&
        (!statement_period_start || !statement_period_end)
      ) {
        throw new Error(
          "Statement period start and end dates are required for statement invoices"
        );
      }

      // Generate invoice number
      const invoice_number = await generateInvoiceNumber(client, type);

      // Calculate total amount
      const total_amount =
        parseFloat(amount_before_tax) + parseFloat(tax_amount);

      // Create the invoice
      const invoiceQuery = `
        INSERT INTO greentarget.invoices (
          invoice_number,
          type,
          customer_id,
          rental_id,
          amount_before_tax,
          tax_amount,
          total_amount,
          date_issued,
          balance_due,
          statement_period_start,
          statement_period_end
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const invoiceResult = await client.query(invoiceQuery, [
        invoice_number,
        type,
        customer_id,
        type === "regular" ? rental_id : null,
        amount_before_tax,
        tax_amount,
        total_amount,
        date_issued,
        total_amount, // Initially balance_due equals total_amount
        type === "statement" ? statement_period_start : null,
        type === "statement" ? statement_period_end : null,
      ]);

      // Update customer last_activity_date
      await client.query(
        `UPDATE greentarget.customers SET last_activity_date = CURRENT_DATE WHERE customer_id = $1`,
        [customer_id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        message: "Invoice created successfully",
        invoice: invoiceResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating Green Target invoice:", error);
      res.status(500).json({
        message: "Error creating invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Cancel an invoice
  router.put("/:invoice_id/cancel", async (req, res) => {
    const { invoice_id } = req.params;
    const { reason } = req.body; // Optional cancellation reason
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // First check if there are any payments for this invoice
      const paymentsCheck = await client.query(
        "SELECT COUNT(*) FROM greentarget.payments WHERE invoice_id = $1 AND (status IS NULL OR status = 'active')",
        [invoice_id]
      );

      if (parseInt(paymentsCheck.rows[0].count) > 0) {
        throw new Error(
          "Cannot cancel invoice: it has associated payments. Cancel the payments first."
        );
      }

      // Get invoice details before cancellation
      const invoiceQuery =
        "SELECT * FROM greentarget.invoices WHERE invoice_id = $1";
      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Check if already cancelled
      if (invoiceResult.rows[0].status === "cancelled") {
        return res
          .status(400)
          .json({ message: "Invoice is already cancelled" });
      }

      // Update the invoice status to cancelled
      const updateQuery = `
        UPDATE greentarget.invoices 
        SET status = 'cancelled', 
            cancellation_date = CURRENT_TIMESTAMP,
            cancellation_reason = $1
        WHERE invoice_id = $2
        RETURNING *
      `;
      const updateResult = await client.query(updateQuery, [
        reason || null,
        invoice_id,
      ]);

      await client.query("COMMIT");

      res.json({
        message: "Invoice cancelled successfully",
        invoice: updateResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling Green Target invoice:", error);
      res.status(500).json({
        message: error.message || "Error cancelling invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Replace the DELETE endpoint with a redirect to the cancel endpoint
  router.delete("/:invoice_id", async (req, res) => {
    const { invoice_id } = req.params;

    // Forward to the cancel endpoint
    req.method = "PUT";
    req.url = `/${invoice_id}/cancel`;

    // Add deprecation warning header
    res.setHeader(
      "X-Deprecated-API",
      "Use PUT /greentarget/api/invoices/:invoice_id/cancel instead"
    );

    // Pass the request to the cancel handler
    router.handle(req, res);
  });

  return router;
}

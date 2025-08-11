// src/routes/greentarget/invoices.js
import { Router } from "express";
import GTEInvoiceApiClientFactory from "../../utils/greenTarget/einvoice/GTEInvoiceApiClientFactory.js";

export default function (pool, defaultConfig) {
  const router = Router();

  const apiClient = GTEInvoiceApiClientFactory.getInstance(defaultConfig);

  // Generate a unique invoice number
  async function generateInvoiceNumber(client, type) {
    const year = new Date().getFullYear();
    const sequenceName = "greentarget.regular_invoice_seq";

    try {
      const result = await client.query(
        `SELECT nextval('${sequenceName}') as next_val`
      );
      const nextVal = result.rows[0].next_val;

      if (type === "regular") {
        return `${year}/${String(nextVal).padStart(5, "0")}`;
      } else {
        return `I${year}/${String(nextVal).padStart(4, "0")}`;
      }
    } catch (seqError) {
      console.error(
        `Error getting next value for sequence ${sequenceName}:`,
        seqError
      );
      throw new Error("Failed to generate invoice number."); // Throw a more specific error
    }
  }

  // Get all invoices (with optional filters - ADDED status filter)
  router.get("/", async (req, res) => {
    // Added 'status' to destructuring
    const {
      customer_id,
      start_date,
      end_date,
      status,
      consolidated_only,
      exclude_consolidated,
    } = req.query;

    try {
      let query = `
        SELECT i.*,
              c.name as customer_name,
              c.phone_number as customer_phone_number,
              c.tin_number,
              c.id_number,
              c.id_type,
              c.additional_info,
              l.address as location_address,
              l.phone_number as location_phone_number,
              r.driver,
              r.tong_no,
              -- Calculate paid amount correctly using non-cancelled payments
              COALESCE(SUM(CASE WHEN p.status IS NULL OR p.status = 'active' THEN p.amount_paid ELSE 0 END) FILTER (WHERE p.payment_id IS NOT NULL), 0) as amount_paid,
              -- Add subquery to check if invoice is part of a consolidated invoice
              (
                SELECT jsonb_build_object(
                  'id', con.invoice_id,
                  'invoice_number', con.invoice_number,
                  'uuid', con.uuid,
                  'long_id', con.long_id,
                  'einvoice_status', con.einvoice_status
                )
                FROM greentarget.invoices con
                WHERE con.is_consolidated = true
                  AND con.status != 'cancelled'
                  AND con.consolidated_invoices ? i.invoice_number
                LIMIT 1
              ) as consolidated_part_of
        FROM greentarget.invoices i
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
        LEFT JOIN greentarget.rentals r ON i.rental_id = r.rental_id
        LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
        -- LEFT JOIN ensures invoices without payments are included
        LEFT JOIN greentarget.payments p ON i.invoice_id = p.invoice_id
        WHERE (i.is_consolidated IS NOT TRUE OR i.is_consolidated IS NULL)
        AND i.type != 'consolidated'
      `;

      const queryParams = [];
      let paramCounter = 1;

      if (customer_id) {
        query += ` AND i.customer_id = $${paramCounter}`;
        queryParams.push(customer_id);
        paramCounter++;
      }

      if (start_date) {
        // Ensure date format compatibility or cast if needed
        query += ` AND i.date_issued >= $${paramCounter}`;
        queryParams.push(start_date);
        paramCounter++;
      }

      if (end_date) {
        // Ensure date format compatibility or cast if needed
        query += ` AND i.date_issued <= $${paramCounter}`;
        queryParams.push(end_date);
        paramCounter++;
      }

      if (consolidated_only === "true") {
        // Check if this invoice is referenced in any consolidated invoice
        query += ` AND EXISTS (
          SELECT 1 FROM greentarget.invoices con 
          WHERE con.is_consolidated = true
          AND con.status != 'cancelled'
          AND con.consolidated_invoices ? i.invoice_number
        )`;
      }

      if (exclude_consolidated === "true") {
        // Check that this invoice is NOT referenced in any consolidated invoice
        query += ` AND NOT EXISTS (
          SELECT 1 FROM greentarget.invoices con 
          WHERE con.is_consolidated = true
          AND con.status != 'cancelled'
          AND con.consolidated_invoices ? i.invoice_number
        )`;
      }

      // *** Status Filter (Handles comma-separated list) ***
      if (status) {
        const statuses = status
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s); // Remove empty strings
        if (statuses.length > 0) {
          query += ` AND i.status = ANY($${paramCounter}::varchar[])`;
          queryParams.push(statuses);
          paramCounter++;
        }
      }
      // *** END Added Status Filter ***

      // Group by all non-aggregated columns from invoices, customers, rentals, locations
      query += `
        GROUP BY i.invoice_id, c.customer_id, l.location_id, r.rental_id
      `;

      // Add ordering - consider making this dynamic based on query params
      query += " ORDER BY i.date_issued DESC, i.invoice_id DESC";

      const result = await pool.query(query, queryParams);

      // Calculate current balance for each invoice AFTER fetching
      const invoicesWithBalance = result.rows.map((invoice) => {
        const totalAmount = parseFloat(invoice.total_amount || 0);
        const amountPaid = parseFloat(invoice.amount_paid || 0); // Use the calculated amount_paid
        const balance = totalAmount - amountPaid;

        // Ensure balance_due in the returned object is consistent
        // If the DB 'balance_due' isn't updated by payments, calculate it here.
        // If it *is* updated by payments/cancellations, prefer the DB value unless status is cancelled.
        let finalBalanceDue = invoice.status === "cancelled" ? 0 : balance;
        // Clamp balance to zero if slightly negative due to float issues
        finalBalanceDue = Math.max(0, parseFloat(finalBalanceDue.toFixed(2)));

        return {
          ...invoice,
          amount_paid: parseFloat(amountPaid.toFixed(2)), // Ensure correct format
          current_balance: finalBalanceDue, // Use the calculated and clamped balance
          balance_due: finalBalanceDue, // Keep balance_due consistent
          consolidated_part_of: invoice.consolidated_part_of,
        };
      });

      res.json(invoicesWithBalance);
    } catch (error) {
      console.error("Error fetching Green Target invoices:", error);
      res.status(500).json({
        message: "Error fetching invoices",
        error: error.message, // Send specific error in dev, generic in prod
      });
    }
  });

  // GET /greentarget/api/invoices/batch - Get Multiple Invoices By IDs
  router.get("/batch", async (req, res) => {
    const { ids } = req.query;

    if (!ids) {
      return res
        .status(400)
        .json({ message: "Missing required ids parameter" });
    }

    try {
      // Split comma-separated string into array
      const invoiceIds = ids.split(",").map((id) => parseInt(id, 10));

      // Filter out any NaN values
      const validIds = invoiceIds.filter((id) => !isNaN(id));

      // Limit batch size for performance
      if (validIds.length > 100) {
        return res.status(400).json({
          message: "Too many invoices requested. Maximum batch size is 100.",
        });
      }

      if (validIds.length === 0) {
        return res
          .status(400)
          .json({ message: "No valid invoice IDs provided" });
      }

      // Generate a query to fetch multiple invoices at once
      const placeholders = validIds.map((_, i) => `$${i + 1}`).join(",");

      const invoiceQuery = `
      SELECT i.*,
            c.name as customer_name,
            c.phone_number as customer_phone_number,
            c.tin_number,
            c.id_number,
            c.id_type,
            r.rental_id,
            r.tong_no,
            r.date_placed,
            r.date_picked,
            r.driver,
            l.address as location_address,
            l.phone_number as location_phone_number,
            -- Calculate paid amount correctly using non-cancelled payments
            COALESCE(SUM(CASE WHEN p.status IS NULL OR p.status = 'active' THEN p.amount_paid ELSE 0 END) FILTER (WHERE p.payment_id IS NOT NULL), 0) as amount_paid,
            -- Add subquery for consolidated part info
            (
              SELECT jsonb_build_object(
                'id', con.invoice_id,
                'invoice_number', con.invoice_number,
                'uuid', con.uuid,
                'long_id', con.long_id,
                'einvoice_status', con.einvoice_status
              )
              FROM greentarget.invoices con
              WHERE con.is_consolidated = true
                AND con.status != 'cancelled'
                AND con.consolidated_invoices ? i.invoice_number
              LIMIT 1
            ) as consolidated_part_of
      FROM greentarget.invoices i
      JOIN greentarget.customers c ON i.customer_id = c.customer_id
      LEFT JOIN greentarget.rentals r ON i.rental_id = r.rental_id
      LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
      LEFT JOIN greentarget.payments p ON i.invoice_id = p.invoice_id
      WHERE i.invoice_id IN (${placeholders})
      GROUP BY i.invoice_id, c.customer_id, r.rental_id, l.location_id
    `;

      const result = await pool.query(invoiceQuery, validIds);

      // Calculate current balance for each invoice
      const invoicesWithBalance = result.rows.map((invoice) => {
        const totalAmount = parseFloat(invoice.total_amount || 0);
        const amountPaid = parseFloat(invoice.amount_paid || 0);
        const balance = totalAmount - amountPaid;

        // Ensure balance_due is consistent
        let finalBalanceDue = invoice.status === "cancelled" ? 0 : balance;
        // Clamp balance to zero if slightly negative due to float issues
        finalBalanceDue = Math.max(0, parseFloat(finalBalanceDue.toFixed(2)));

        return {
          ...invoice,
          amount_paid: parseFloat(amountPaid.toFixed(2)),
          current_balance: finalBalanceDue,
          balance_due: finalBalanceDue,
          consolidated_part_of: invoice.consolidated_part_of,
        };
      });

      res.json(invoicesWithBalance);
    } catch (error) {
      console.error("Error fetching batch invoices:", error);
      res.status(500).json({
        message: "Error fetching invoices",
        error: error.message,
      });
    }
  });

  // Get invoice by ID
  router.get("/:invoice_id", async (req, res) => {
    const { invoice_id } = req.params;
    const numericInvoiceId = parseInt(invoice_id, 10);

    if (isNaN(numericInvoiceId)) {
      return res.status(400).json({ message: "Invalid invoice ID format" });
    }

    try {
      // Get invoice details with customer, rental, and payment info
      // Calculate amount_paid correctly, excluding cancelled payments
      const invoiceQuery = `
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
              -- Calculate paid amount correctly using non-cancelled payments
              COALESCE(SUM(CASE WHEN p.status IS NULL OR p.status = 'active' THEN p.amount_paid ELSE 0 END) FILTER (WHERE p.payment_id IS NOT NULL), 0) as amount_paid,
              -- Add subquery for consolidated part info
              (
                SELECT jsonb_build_object(
                  'id', con.invoice_id,
                  'invoice_number', con.invoice_number,
                  'uuid', con.uuid,
                  'long_id', con.long_id,
                  'einvoice_status', con.einvoice_status
                )
                FROM greentarget.invoices con
                WHERE con.is_consolidated = true
                  AND con.status != 'cancelled'
                  AND con.consolidated_invoices ? i.invoice_number
                LIMIT 1
              ) as consolidated_part_of
        FROM greentarget.invoices i
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
        LEFT JOIN greentarget.rentals r ON i.rental_id = r.rental_id
        LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
        LEFT JOIN greentarget.payments p ON i.invoice_id = p.invoice_id
        WHERE i.invoice_id = $1
        GROUP BY i.invoice_id, c.customer_id, l.location_id, r.rental_id
      `;

      const invoiceResult = await pool.query(invoiceQuery, [numericInvoiceId]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get payments for this invoice (include status information)
      const paymentsQuery = `
        SELECT *
        FROM greentarget.payments
        WHERE invoice_id = $1
        ORDER BY payment_date DESC, payment_id DESC
      `;

      const paymentsResult = await pool.query(paymentsQuery, [
        numericInvoiceId,
      ]);

      // Calculate current balance based on total_amount and calculated amount_paid
      const invoice = invoiceResult.rows[0];
      const totalAmount = parseFloat(invoice.total_amount || 0);
      const amountPaid = parseFloat(invoice.amount_paid || 0); // Use calculated amount_paid
      let currentBalance = totalAmount - amountPaid;
      currentBalance = Math.max(0, parseFloat(currentBalance.toFixed(2))); // Clamp >= 0

      // Set balance_due consistently
      invoice.current_balance = currentBalance;
      invoice.balance_due = invoice.status === "cancelled" ? 0 : currentBalance;
      invoice.amount_paid = parseFloat(amountPaid.toFixed(2)); // Ensure format
      invoice.consolidated_part_of = invoice.consolidated_part_of;

      res.json({
        invoice: invoice,
        payments: paymentsResult.rows,
      });
    } catch (error) {
      console.error(
        `Error fetching Green Target invoice ${invoice_id}:`,
        error
      );
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
      tax_amount = 0, // Default tax to 0 if not provided
      date_issued,
      invoice_number, // Optional custom invoice number
    } = req.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // --- Input Validation ---
      if (!type || !customer_id || !amount_before_tax || !date_issued) {
        throw new Error(
          "Missing required fields: type, customer_id, amount_before_tax, date_issued."
        );
      }
      if (!["regular"].includes(type)) {
        throw new Error("Invalid invoice type specified.");
      }
      if (type === "regular" && !rental_id) {
        throw new Error("Rental ID is required for regular invoices.");
      }
      const numAmountBeforeTax = parseFloat(amount_before_tax);
      const numTaxAmount = parseFloat(tax_amount);
      if (isNaN(numAmountBeforeTax) || numAmountBeforeTax < 0) {
        throw new Error("Invalid amount_before_tax provided.");
      }
      if (isNaN(numTaxAmount) || numTaxAmount < 0) {
        throw new Error("Invalid tax_amount provided.");
      }

      // --- Logic ---
      let finalInvoiceNumber;
      
      if (invoice_number && invoice_number.trim()) {
        // Custom invoice number provided - check for duplicates
        const trimmedNumber = invoice_number.trim();
        const duplicateCheck = await client.query(
          "SELECT invoice_id FROM greentarget.invoices WHERE invoice_number = $1",
          [trimmedNumber]
        );

        if (duplicateCheck.rows.length > 0) {
          throw new Error(`Invoice number '${trimmedNumber}' already exists`);
        }

        finalInvoiceNumber = trimmedNumber;
      } else {
        // Generate automatic invoice number
        finalInvoiceNumber = await generateInvoiceNumber(client, type);
      }
      
      const total_amount = numAmountBeforeTax + numTaxAmount;

      const invoiceQuery = `
        INSERT INTO greentarget.invoices (
          invoice_number, type, customer_id, rental_id,
          amount_before_tax, tax_amount, total_amount, date_issued,
          balance_due
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;

      const invoiceResult = await client.query(invoiceQuery, [
        finalInvoiceNumber,
        type,
        customer_id,
        type === "regular" ? rental_id : null,
        numAmountBeforeTax.toFixed(2),
        numTaxAmount.toFixed(2),
        total_amount.toFixed(2),
        date_issued,
        total_amount.toFixed(2), // Initial balance_due
      ]);

      // Update customer last_activity_date
      await client.query(
        `UPDATE greentarget.customers SET last_activity_date = CURRENT_DATE WHERE customer_id = $1`,
        [customer_id]
      );

      await client.query("COMMIT");

      // Recalculate balance for the response object, just in case
      const createdInvoice = invoiceResult.rows[0];
      createdInvoice.current_balance = parseFloat(createdInvoice.total_amount); // Or use balance_due
      createdInvoice.balance_due = parseFloat(createdInvoice.balance_due);
      createdInvoice.amount_paid = 0; // No payments yet

      res.status(201).json({
        message: "Invoice created successfully",
        invoice: createdInvoice,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating Green Target invoice:", error);
      // Send specific error messages back if validation failed
      res
        .status(
          error.message.includes("Missing required") ||
            error.message.includes("Invalid")
            ? 400
            : 500
        )
        .json({
          message: "Error creating invoice",
          error: error.message,
        });
    } finally {
      client.release();
    }
  });

  // Check if invoice number is available
  router.get("/check-number/:invoice_number(*)", async (req, res) => {
    const invoice_number = decodeURIComponent(req.params.invoice_number);
    const { exclude_id } = req.query; // Optional: exclude a specific invoice ID when editing

    try {
      let query = "SELECT invoice_id FROM greentarget.invoices WHERE invoice_number = $1";
      let params = [invoice_number];

      if (exclude_id) {
        query += " AND invoice_id != $2";
        params.push(parseInt(exclude_id, 10));
      }

      const result = await pool.query(query, params);
      
      res.json({
        available: result.rows.length === 0,
        exists: result.rows.length > 0,
        existing_id: result.rows.length > 0 ? result.rows[0].invoice_id : null
      });
    } catch (error) {
      console.error("Error checking invoice number:", error);
      res.status(500).json({
        message: "Error checking invoice number",
        error: error.message,
      });
    }
  });

  // Update an invoice
  router.put("/:invoice_id", async (req, res) => {
    const { invoice_id } = req.params;
    const {
      invoice_number,
      type,
      customer_id,
      rental_id,
      amount_before_tax,
      tax_amount = 0,
      date_issued,
    } = req.body;

    const numericInvoiceId = parseInt(invoice_id, 10);
    const client = await pool.connect();

    if (isNaN(numericInvoiceId)) {
      return res.status(400).json({ message: "Invalid invoice ID format" });
    }

    try {
      await client.query("BEGIN");

      // Check if invoice exists
      const invoiceCheck = await client.query(
        "SELECT * FROM greentarget.invoices WHERE invoice_id = $1",
        [numericInvoiceId]
      );

      if (invoiceCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Input validation
      if (!type || !customer_id || !amount_before_tax || !date_issued) {
        throw new Error(
          "Missing required fields: type, customer_id, amount_before_tax, date_issued."
        );
      }

      if (!["regular"].includes(type)) {
        throw new Error("Invalid invoice type specified.");
      }

      if (type === "regular" && !rental_id) {
        throw new Error("Rental ID is required for regular invoices.");
      }

      const numAmountBeforeTax = parseFloat(amount_before_tax);
      const numTaxAmount = parseFloat(tax_amount);

      if (isNaN(numAmountBeforeTax) || numAmountBeforeTax < 0) {
        throw new Error("Invalid amount_before_tax provided.");
      }

      if (isNaN(numTaxAmount) || numTaxAmount < 0) {
        throw new Error("Invalid tax_amount provided.");
      }

      // If invoice_number is provided, check for duplicates
      let finalInvoiceNumber = invoiceCheck.rows[0].invoice_number; // Keep existing if not provided
      
      if (invoice_number && invoice_number.trim()) {
        const trimmedNumber = invoice_number.trim();
        
        // Check for duplicate invoice numbers (excluding current invoice)
        const duplicateCheck = await client.query(
          "SELECT invoice_id FROM greentarget.invoices WHERE invoice_number = $1 AND invoice_id != $2",
          [trimmedNumber, numericInvoiceId]
        );

        if (duplicateCheck.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Invoice number '${trimmedNumber}' already exists`,
            duplicate_id: duplicateCheck.rows[0].invoice_id
          });
        }

        finalInvoiceNumber = trimmedNumber;
      }

      const total_amount = numAmountBeforeTax + numTaxAmount;

      // Update the invoice
      const updateQuery = `
        UPDATE greentarget.invoices 
        SET invoice_number = $1,
            type = $2,
            customer_id = $3,
            rental_id = $4,
            amount_before_tax = $5,
            tax_amount = $6,
            total_amount = $7,
            date_issued = $8,
            balance_due = $7 - COALESCE(
              (SELECT SUM(amount_paid) 
               FROM greentarget.payments 
               WHERE invoice_id = $9 AND (status IS NULL OR status = 'active')
              ), 0
            )
        WHERE invoice_id = $9
        RETURNING *;
      `;

      const updateResult = await client.query(updateQuery, [
        finalInvoiceNumber,
        type,
        customer_id,
        type === "regular" ? rental_id : null,
        numAmountBeforeTax.toFixed(2),
        numTaxAmount.toFixed(2),
        total_amount.toFixed(2),
        date_issued,
        numericInvoiceId,
      ]);

      // Update customer last_activity_date
      await client.query(
        `UPDATE greentarget.customers SET last_activity_date = CURRENT_DATE WHERE customer_id = $1`,
        [customer_id]
      );

      await client.query("COMMIT");

      res.json({
        message: "Invoice updated successfully",
        invoice: updateResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Error updating Green Target invoice ${invoice_id}:`, error);
      res.status(error.message.includes("Missing required") ||
        error.message.includes("Invalid") ||
        error.message.includes("already exists") ? 400 : 500).json({
        message: error.message || "Error updating invoice",
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
    const numericInvoiceId = parseInt(invoice_id, 10);
    const client = await pool.connect();

    if (isNaN(numericInvoiceId)) {
      return res.status(400).json({ message: "Invalid invoice ID format" });
    }

    try {
      await client.query("BEGIN");

      // Check if invoice exists and get current status
      const invoiceCheck = await client.query(
        "SELECT status, total_amount, uuid, einvoice_status FROM greentarget.invoices WHERE invoice_id = $1 FOR UPDATE", // Lock the row
        [numericInvoiceId]
      );

      if (invoiceCheck.rows.length === 0) {
        await client.query("ROLLBACK"); // Release lock
        return res.status(404).json({ message: "Invoice not found" });
      }
      const invoice = invoiceCheck.rows[0];
      const currentStatus = invoice.status;
      const totalAmount = parseFloat(invoice.total_amount);

      if (currentStatus === "cancelled") {
        await client.query("ROLLBACK"); // Release lock
        return res
          .status(400)
          .json({ message: "Invoice is already cancelled" });
      }

      // Check if there are any *active* payments for this invoice
      const paymentsCheck = await client.query(
        "SELECT COUNT(*) FROM greentarget.payments WHERE invoice_id = $1 AND (status IS NULL OR status = 'active')",
        [numericInvoiceId]
      );

      if (parseInt(paymentsCheck.rows[0].count) > 0) {
        await client.query("ROLLBACK"); // Release lock
        throw new Error(
          "Cannot cancel invoice: it has active payments. Cancel the payments first."
        );
      }

      // NEW CODE: Handle e-Invoice cancellation
      let einvoiceCancelledApi = false;
      let apiResponseMessage = null;

      if (invoice.uuid && invoice.einvoice_status !== "cancelled") {
        try {
          // Call MyInvois API to cancel e-invoice
          await apiClient.makeApiCall(
            "PUT",
            `/api/v1.0/documents/state/${invoice.uuid}/state`,
            { status: "cancelled", reason: reason || "Invoice cancelled" }
          );

          einvoiceCancelledApi = true;
          apiResponseMessage = `Successfully cancelled e-invoice ${invoice.uuid} via API.`;
        } catch (cancelError) {
          console.error(
            `Error cancelling e-invoice ${invoice.uuid} via API:`,
            cancelError
          );
          // Log error but continue with local cancellation
          if (cancelError.status === 400) {
            console.warn(
              `E-invoice ${invoice.uuid} might already be cancelled or in a non-cancellable state.`
            );
            einvoiceCancelledApi = true; // Assume cancelled if API fails in a way suggesting it's already done
          }
          apiResponseMessage = `Failed to cancel e-invoice via API: ${cancelError.message}`;
        }
      }

      // Determine new e-Invoice status based on API result
      const newEInvoiceStatus = einvoiceCancelledApi
        ? "cancelled"
        : invoice.einvoice_status;

      // Update the invoice status to cancelled, set balance to 0
      const updateQuery = `
        UPDATE greentarget.invoices
        SET status = 'cancelled',
            balance_due = 0, -- Set balance to 0 upon cancellation
            cancellation_date = CURRENT_TIMESTAMP,
            cancellation_reason = $1,
            einvoice_status = $2 -- Update e-invoice status
        WHERE invoice_id = $3
        RETURNING *;
      `;
      const updateResult = await client.query(updateQuery, [
        reason || null,
        newEInvoiceStatus,
        numericInvoiceId,
      ]);

      await client.query("COMMIT");

      // Prepare response object
      const cancelledInvoice = updateResult.rows[0];
      cancelledInvoice.current_balance = 0; // Reflect cancellation in current_balance too
      cancelledInvoice.balance_due = 0;
      cancelledInvoice.amount_paid = totalAmount; // Consider amount_paid conceptually covered

      res.json({
        message: "Invoice cancelled successfully",
        invoice: cancelledInvoice,
        einvoice_cancelled: einvoiceCancelledApi,
        einvoice_message: apiResponseMessage,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        `Error cancelling Green Target invoice ${invoice_id}:`,
        error
      );
      res.status(error.message.includes("active payments") ? 400 : 500).json({
        // Use 400 for payment error
        message: error.message || "Error cancelling invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Delete a cancelled invoice
  router.delete("/:invoice_id", async (req, res) => {
    const { invoice_id } = req.params;
    const numericInvoiceId = parseInt(invoice_id, 10);
    const client = await pool.connect();

    if (isNaN(numericInvoiceId)) {
      return res.status(400).json({ message: "Invalid invoice ID format" });
    }

    try {
      await client.query("BEGIN");

      // Check if invoice exists and is cancelled
      const invoiceCheck = await client.query(
        "SELECT status, total_amount FROM greentarget.invoices WHERE invoice_id = $1 FOR UPDATE",
        [numericInvoiceId]
      );

      if (invoiceCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Invoice not found" });
      }

      const invoice = invoiceCheck.rows[0];
      
      if (invoice.status !== "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({ 
          message: "Only cancelled invoices can be deleted" 
        });
      }

      // Check if there are any payments for this invoice
      const paymentsCheck = await client.query(
        "SELECT COUNT(*) FROM greentarget.payments WHERE invoice_id = $1",
        [numericInvoiceId]
      );

      if (parseInt(paymentsCheck.rows[0].count) > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete invoice: it has associated payments. Delete the payments first."
        });
      }

      // Delete the invoice
      await client.query(
        "DELETE FROM greentarget.invoices WHERE invoice_id = $1",
        [numericInvoiceId]
      );

      await client.query("COMMIT");

      res.json({
        message: "Invoice deleted successfully"
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Error deleting Green Target invoice ${invoice_id}:`, error);
      res.status(500).json({
        message: "Error deleting invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}

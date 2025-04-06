// src/routes/greentarget/einvoice.js
import { Router } from "express";
import { submitInvoiceToMyInvois } from "../../utils/greenTarget/einvoice/GTServerSubmissionUtil.js";

export default function (pool, defaultConfig) {
  const router = Router();

  // Submit e-Invoice for a specific invoice
  router.post("/submit/:invoiceId", async (req, res) => {
    const { invoiceId } = req.params;
    const { clientConfig } = req.body;

    // Use provided config or fall back to default config
    const config = clientConfig || defaultConfig;

    try {
      // 1. Get invoice details
      const invoiceQuery = `
        SELECT i.*, 
               c.name as customer_name,
               c.phone_number as customer_phone_number,
               c.tin_number,
               c.id_type,
               c.id_number,
               c.email,
               c.state
        FROM greentarget.invoices i
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
        WHERE i.invoice_id = $1
      `;
      const invoiceResult = await pool.query(invoiceQuery, [invoiceId]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }

      const invoice = invoiceResult.rows[0];

      // 2. Check if invoice already has an e-Invoice (now directly in the invoices table)
      const existingCheckQuery = `
        SELECT * FROM greentarget.invoices WHERE invoice_id = $1
        AND einvoice_status IS NOT NULL
      `;
      const existingCheckResult = await pool.query(existingCheckQuery, [
        invoiceId,
      ]);

      if (
        existingCheckResult.rows.length > 0 &&
        existingCheckResult.rows[0].einvoice_status
      ) {
        return res.status(400).json({
          success: false,
          message: "This invoice already has an e-Invoice submission",
          einvoice: existingCheckResult.rows[0],
        });
      }

      // 3. Extract customer data
      const customerData = {
        name: invoice.customer_name,
        phone_number: invoice.customer_phone_number,
        tin_number: invoice.tin_number,
        id_type: invoice.id_type,
        id_number: invoice.id_number,
        email: invoice.email,
        state: invoice.state,
      };

      // 4. Submit to MyInvois
      const submissionResult = await submitInvoiceToMyInvois(
        config,
        invoice,
        customerData
      );

      // 5. If successful, save directly to invoices table (updating, not inserting)
      if (submissionResult.success) {
        const documentDetails = submissionResult.document;
        try {
          const updateQuery = `
            UPDATE greentarget.invoices
            SET einvoice_status = $1,
                uuid = $2,
                submission_uid = $3,
                long_id = $4,
                datetime_validated = $5
            WHERE invoice_id = $6
            RETURNING *
          `;

          const status = documentDetails.longId ? "valid" : "pending";

          const updatedInvoice = await pool.query(updateQuery, [
            status,
            documentDetails.uuid,
            submissionResult.submissionUid,
            documentDetails.longId || null,
            documentDetails.dateTimeValidated || null,
            invoice.invoice_id,
          ]);

          // Return success with e-Invoice details
          return res.status(201).json({
            success: true,
            message: "e-Invoice submitted successfully",
            einvoice: updatedInvoice.rows[0],
          });
        } catch (dbError) {
          console.error("Error updating invoice with e-Invoice data:", dbError);
          // Still return success since the submission worked, but with a warning
          return res.status(200).json({
            success: true,
            message: "e-Invoice submitted but failed to update record",
            warning:
              "The e-Invoice was submitted successfully but there was an error updating the database",
            submissionDetails: submissionResult,
          });
        }
      } else {
        // Return error details from submission
        return res.status(400).json({
          success: false,
          message: submissionResult.message || "Failed to submit e-Invoice",
          error: submissionResult.error,
        });
      }
    } catch (error) {
      console.error("Error in e-Invoice submission:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred during e-Invoice submission",
        error: error.message,
      });
    }
  });

  // Check e-Invoice status by UUID
  router.get("/status/:uuid", async (req, res) => {
    const { uuid } = req.params;

    try {
      const query = `SELECT * FROM greentarget.invoices WHERE uuid = $1`;
      const result = await pool.query(query, [uuid]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "e-Invoice record not found",
        });
      }

      return res.json({
        success: true,
        einvoice: result.rows[0],
      });
    } catch (error) {
      console.error("Error checking e-Invoice status:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking e-Invoice status",
        error: error.message,
      });
    }
  });

  // Check if an invoice has an e-Invoice
  router.get("/check/:invoiceId", async (req, res) => {
    const { invoiceId } = req.params;

    try {
      const query = `SELECT * FROM greentarget.invoices 
                     WHERE invoice_id = $1 
                     AND einvoice_status IS NOT NULL`;
      const result = await pool.query(query, [invoiceId]);

      return res.json({
        success: true,
        hasEInvoice: result.rows.length > 0,
        einvoice: result.rows.length > 0 ? result.rows[0] : null,
      });
    } catch (error) {
      console.error("Error checking if invoice has e-Invoice:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking if invoice has e-Invoice",
        error: error.message,
      });
    }
  });

  router.get("/eligible-for-consolidation", async (req, res) => {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required",
        });
      }

      const startYear = parseInt(year);
      const startMonth = parseInt(month); // 0-11 (Jan-Dec)
      const endYear = startMonth === 11 ? startYear + 1 : startYear;
      const endMonth = startMonth === 11 ? 0 : startMonth + 1;

      // Create dates in MYT (UTC+8)
      const startDate = new Date(
        `${startYear}-${String(startMonth + 1).padStart(
          2,
          "0"
        )}-01T00:00:00+08:00`
      );
      const endDate = new Date(
        `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01T00:00:00+08:00`
      );

      const startTimestamp = startDate.getTime().toString();
      const endTimestamp = endDate.getTime().toString();

      // Query updated to use einvoice_status in greentarget.invoices directly
      const query = `
        SELECT 
          i.invoice_id, i.invoice_number, i.type, i.customer_id, 
          i.amount_before_tax, i.tax_amount, i.total_amount, i.date_issued,
          i.balance_due, i.status, i.einvoice_status
        FROM greentarget.invoices i
        WHERE i.date_issued >= $1 AND i.date_issued < $2
        AND (i.einvoice_status IS NULL OR i.einvoice_status = 'invalid')
        AND (i.status != 'cancelled')
        AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM greentarget.invoices consolidated 
          WHERE consolidated.is_consolidated = true
          AND consolidated.consolidated_invoices IS NOT NULL
          AND consolidated.consolidated_invoices::jsonb ? CAST(i.invoice_id AS TEXT)
          AND consolidated.status != 'cancelled' 
          AND consolidated.einvoice_status != 'cancelled'
        )
        ORDER BY i.date_issued ASC
      `;

      const result = await pool.query(query, [startTimestamp, endTimestamp]);

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch invoices",
        error: error.message,
      });
    }
  });

  return router;
}

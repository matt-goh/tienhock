// src/routes/greentarget/einvoice.js
import { Router } from "express";
import { submitInvoiceToMyInvois } from "../../utils/greenTarget/einvoice/GTServerSubmissionUtil.js";
import { insertEInvoiceRecord } from "../../utils/greenTarget/einvoice/GTDbUtil.js";

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

      // 2. Check if invoice already has an e-Invoice
      const existingCheckQuery = `
        SELECT * FROM greentarget.einvoices WHERE invoice_id = $1
      `;
      const existingCheckResult = await pool.query(existingCheckQuery, [
        invoiceId,
      ]);

      if (existingCheckResult.rows.length > 0) {
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

      // 5. If successful, save to database
      if (submissionResult.success) {
        const documentDetails = submissionResult.document;
        try {
          const savedRecord = await insertEInvoiceRecord(
            pool,
            {
              uuid: documentDetails.uuid,
              submissionUid: submissionResult.submissionUid,
              longId: documentDetails.longId || null,
              status: documentDetails.status || "Submitted",
              dateTimeValidated: documentDetails.dateTimeValidated,
            },
            invoice
          );

          // Return success with e-Invoice details
          return res.status(201).json({
            success: true,
            message: "e-Invoice submitted successfully",
            einvoice: savedRecord,
          });
        } catch (dbError) {
          console.error("Error saving e-Invoice record:", dbError);
          // Still return success since the submission worked, but with a warning
          return res.status(200).json({
            success: true,
            message: "e-Invoice submitted but failed to save record",
            warning:
              "The e-Invoice was submitted successfully but there was an error saving the record to the database",
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
      const query = `SELECT * FROM greentarget.einvoices WHERE uuid = $1`;
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
      const query = `SELECT * FROM greentarget.einvoices WHERE invoice_id = $1`;
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

  return router;
}

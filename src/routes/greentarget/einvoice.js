// src/routes/greentarget/einvoice.js
import { Router } from "express";
import { submitInvoiceToMyInvois } from "../../utils/greenTarget/einvoice/GTServerSubmissionUtil.js";
import GTEInvoiceApiClientFactory from "../../utils/greenTarget/einvoice/GTEInvoiceApiClientFactory.js";

export default function (pool, defaultConfig) {
  const router = Router();

  const apiClient = GTEInvoiceApiClientFactory.getInstance(defaultConfig);

  // Submit e-Invoice for a specific invoice
  router.post("/submit/:invoiceId", async (req, res) => {
    const { invoiceId } = req.params;

    // Always use the defaultConfig which is passed when initializing the router
    const config = defaultConfig;

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
              c.state,
              r.rental_id,
              l.address as location_address
        FROM greentarget.invoices i
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
        LEFT JOIN greentarget.rentals r ON i.rental_id = r.rental_id
        LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
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
        address: invoice.location_address || "Tong Location",
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

  // Check/update e-invoice status
  router.put("/:invoice_id/check-einvoice-status", async (req, res) => {
    const { invoice_id } = req.params;
    const numericInvoiceId = parseInt(invoice_id, 10);
    const client = await pool.connect();

    if (isNaN(numericInvoiceId)) {
      return res.status(400).json({ message: "Invalid invoice ID format" });
    }

    try {
      await client.query("BEGIN");

      // Check if invoice exists and has a UUID
      const invoiceQuery = `
      SELECT uuid, einvoice_status, submission_uid
      FROM greentarget.invoices 
      WHERE invoice_id = $1
      FOR UPDATE
    `;

      const invoiceResult = await client.query(invoiceQuery, [
        numericInvoiceId,
      ]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Invoice not found" });
      }

      const invoice = invoiceResult.rows[0];

      // We can only check status if we have a UUID
      if (!invoice.uuid) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "This invoice has no e-Invoice UUID to check",
        });
      }

      // If already valid, no need to check
      if (invoice.einvoice_status === "valid") {
        await client.query("ROLLBACK");
        return res.json({
          success: true,
          message: "Invoice already has a valid e-Invoice status",
          status: invoice.einvoice_status,
          updated: false,
        });
      }

      // Call MyInvois API to check document status
      console.log(
        `Checking MyInvois status for document UUID: ${invoice.uuid}`
      );
      const documentDetails = await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/documents/${invoice.uuid}/details`
      );

      // Determine new status based on response
      let newStatus = invoice.einvoice_status; // Default to keep current
      let newLongId = null;
      let newDateTimeValidated = null;
      let updated = false;

      if (documentDetails.longId) {
        newStatus = "valid";
        newLongId = documentDetails.longId;
        newDateTimeValidated =
          documentDetails.dateTimeValidated ||
          (documentDetails.dateTimeValidation
            ? new Date(documentDetails.dateTimeValidation).toISOString()
            : null);
        updated = true;
      } else if (
        documentDetails.status === "Invalid" ||
        documentDetails.status === "Rejected"
      ) {
        newStatus = "invalid";
        updated = true;
      }

      // Update database if status changed
      if (updated) {
        const updateQuery = `
        UPDATE greentarget.invoices
        SET einvoice_status = $1,
            long_id = $2,
            datetime_validated = $3
        WHERE invoice_id = $4
      `;

        await client.query(updateQuery, [
          newStatus,
          newLongId,
          newDateTimeValidated,
          numericInvoiceId,
        ]);
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        message: updated
          ? `Status updated to ${newStatus}`
          : `Status remains ${newStatus}`,
        status: newStatus,
        longId: newLongId,
        dateTimeValidated: newDateTimeValidated,
        updated: updated,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        `Error checking e-invoice status for invoice ${invoice_id}:`,
        error
      );
      res.status(500).json({
        success: false,
        message: "Error checking e-invoice status",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Sync cancellation status with MyInvois
  router.put("/:invoice_id/sync-cancellation", async (req, res) => {
    const { invoice_id } = req.params;
    const numericInvoiceId = parseInt(invoice_id, 10);
    const client = await pool.connect();

    if (isNaN(numericInvoiceId)) {
      return res.status(400).json({ message: "Invalid invoice ID format" });
    }

    try {
      await client.query("BEGIN");

      // Check if invoice exists and has a UUID
      const invoiceQuery = `
      SELECT uuid, einvoice_status, status, invoice_number
      FROM greentarget.invoices 
      WHERE invoice_id = $1
      FOR UPDATE
    `;

      const invoiceResult = await client.query(invoiceQuery, [
        numericInvoiceId,
      ]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Invoice not found" });
      }

      const invoice = invoiceResult.rows[0];

      // Need a UUID to check status in MyInvois
      if (!invoice.uuid) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "This invoice has no e-Invoice UUID to check",
        });
      }

      // If invoice is not cancelled in local system, we shouldn't proceed
      if (invoice.status !== "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message:
            "Invoice must be cancelled locally before syncing cancellation",
        });
      }

      // Call MyInvois API to check document status
      console.log(
        `Checking MyInvois status for document UUID: ${invoice.uuid}`
      );
      const documentDetails = await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/documents/${invoice.uuid}/details`
      );

      console.log("Document status from MyInvois:", documentDetails.status);

      let syncResult = {
        success: true,
        message: "",
        actionTaken: "none",
        statusBefore: invoice.einvoice_status,
        statusAfter: invoice.einvoice_status,
      };

      // If already cancelled in MyInvois, just update our database
      if (documentDetails.status === "Cancelled") {
        // Update einvoice_status to cancelled
        const updateQuery = `
        UPDATE greentarget.invoices
        SET einvoice_status = 'cancelled'
        WHERE invoice_id = $1
      `;
        await client.query(updateQuery, [numericInvoiceId]);

        syncResult.message =
          "e-Invoice is already cancelled in MyInvois. Local status updated.";
        syncResult.actionTaken = "status_updated";
        syncResult.statusAfter = "cancelled";
      }
      // If still valid in MyInvois, try to cancel it
      else if (documentDetails.status === "Valid") {
        try {
          // Call MyInvois API to cancel e-invoice
          await apiClient.makeApiCall(
            "PUT",
            `/api/v1.0/documents/state/${invoice.uuid}/state`,
            { status: "cancelled", reason: "Invoice cancelled in system" }
          );

          // Update einvoice_status to cancelled
          const updateQuery = `
          UPDATE greentarget.invoices
          SET einvoice_status = 'cancelled'
          WHERE invoice_id = $1
        `;
          await client.query(updateQuery, [numericInvoiceId]);

          syncResult.message =
            "Successfully cancelled e-Invoice in MyInvois and updated local status.";
          syncResult.actionTaken = "cancelled_in_myinvois";
          syncResult.statusAfter = "cancelled";
        } catch (cancelError) {
          // This means we couldn't cancel in MyInvois
          await client.query("ROLLBACK");
          return res.status(500).json({
            success: false,
            message: `Failed to cancel e-Invoice in MyInvois: ${cancelError.message}`,
            error: cancelError,
          });
        }
      }
      // Other status (pending, invalid, etc.)
      else {
        // For other statuses, we still update to cancelled
        const updateQuery = `
        UPDATE greentarget.invoices
        SET einvoice_status = 'cancelled'
        WHERE invoice_id = $1
      `;
        await client.query(updateQuery, [numericInvoiceId]);

        syncResult.message = `e-Invoice has status "${documentDetails.status}" in MyInvois. Local status updated to cancelled.`;
        syncResult.actionTaken = "status_updated";
        syncResult.statusAfter = "cancelled";
      }

      await client.query("COMMIT");

      return res.json({
        success: true,
        ...syncResult,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        `Error syncing cancellation status for invoice ${invoice_id}:`,
        error
      );
      res.status(500).json({
        success: false,
        message: "Error syncing cancellation status",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Get invoices eligible for consolidation
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

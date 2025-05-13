// src/routes/greentarget/einvoice.js
import { Router } from "express";
import { createHash } from "crypto";
import { submitInvoiceToMyInvois } from "../../utils/greenTarget/einvoice/GTServerSubmissionUtil.js";
import GTEInvoiceApiClientFactory from "../../utils/greenTarget/einvoice/GTEInvoiceApiClientFactory.js";
import { GTEInvoiceConsolidatedTemplate } from "../../utils/greenTarget/einvoice/GTEInvoiceConsolidatedTemplate.js";
import GTEInvoiceSubmissionHandler from "../../utils/greenTarget/einvoice/GTEInvoiceSubmissionHandler.js";

export default function (pool, defaultConfig) {
  const router = Router();

  const apiClient = GTEInvoiceApiClientFactory.getInstance(defaultConfig);
  const submissionHandler = new GTEInvoiceSubmissionHandler(apiClient);

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
      const documentDetails = await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/documents/${invoice.uuid}/details`
      );

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

  // Get eligible invoices for consolidation
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

      // Create date range for the month
      const startDate = new Date(startYear, startMonth, 1);
      const endDate = new Date(endYear, endMonth, 1);

      // Format dates for Postgres
      const formattedStartDate = startDate.toISOString().split("T")[0];
      const formattedEndDate = endDate.toISOString().split("T")[0];

      const query = `
      SELECT 
        i.invoice_id, i.invoice_number, i.type, i.customer_id, 
        i.amount_before_tax, i.tax_amount, i.total_amount, i.date_issued,
        i.status, i.einvoice_status
      FROM greentarget.invoices i
      WHERE i.date_issued >= $1 AND i.date_issued < $2
      AND (i.einvoice_status IS NULL OR i.einvoice_status = 'invalid')
      AND (i.status != 'cancelled')
      AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM greentarget.invoices consolidated 
        WHERE consolidated.is_consolidated = true
        AND consolidated.consolidated_invoices IS NOT NULL
        AND (
          consolidated.consolidated_invoices ? i.invoice_number
          OR consolidated.consolidated_invoices::jsonb ? CAST(i.invoice_id AS TEXT)
        )
        AND (
          consolidated.status != 'cancelled'
          AND consolidated.einvoice_status != 'cancelled'
          AND (consolidated.einvoice_status = 'pending' OR consolidated.einvoice_status = 'valid')
        )
      )
      ORDER BY i.date_issued ASC
        `;

      const result = await pool.query(query, [
        formattedStartDate,
        formattedEndDate,
      ]);

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Error fetching eligible invoices:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch eligible invoices",
        error: error.message,
      });
    }
  });

  // Get consolidation history
  router.get("/consolidated-history", async (req, res) => {
    try {
      const { year } = req.query;

      if (!year) {
        return res.status(400).json({
          success: false,
          message: "Year is required",
        });
      }

      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year) + 1, 0, 1);

      // Format dates for Postgres
      const formattedStartDate = startDate.toISOString().split("T")[0];
      const formattedEndDate = endDate.toISOString().split("T")[0];

      const query = `
      SELECT 
        i.invoice_id, i.invoice_number, i.uuid, i.long_id, i.submission_uid,
        i.datetime_validated, i.einvoice_status, i.amount_before_tax, 
        i.tax_amount, i.total_amount, i.date_issued, i.consolidated_invoices
      FROM greentarget.invoices i
      WHERE i.is_consolidated = true
      AND i.date_issued >= $1 AND i.date_issued < $2
      ORDER BY i.date_issued DESC
    `;

      const result = await pool.query(query, [
        formattedStartDate,
        formattedEndDate,
      ]);

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Error fetching consolidation history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch consolidation history",
        error: error.message,
      });
    }
  });

  // Submit consolidated invoice
  router.post("/submit-consolidated", async (req, res) => {
    const { invoices, month, year } = req.body;
    const client = await pool.connect();

    try {
      if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No invoices selected for consolidation",
        });
      }

      await client.query("BEGIN");

      // 1. Get details of selected invoices
      const invoiceQuery = `
        SELECT i.*, 
               c.name as customer_name,
               c.phone_number as customer_phone_number,
               c.tin_number,
               c.id_type,
               c.id_number
        FROM greentarget.invoices i
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
        WHERE i.invoice_id = ANY($1)
      `;

      const invoiceResult = await client.query(invoiceQuery, [invoices]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "No valid invoices found",
        });
      }

      // 2. Calculate total amounts
      const selectedInvoices = invoiceResult.rows;
      const totalExcludingTax = selectedInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.amount_before_tax),
        0
      );
      const taxAmount = selectedInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.tax_amount),
        0
      );
      const totalAmount = selectedInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.total_amount),
        0
      );

      // 3. Generate a unique invoice number for the consolidated invoice
      const datePrefix = `${year}${String(parseInt(month) + 1).padStart(
        2,
        "0"
      )}`;
      const consolidatedSequenceQuery = `
        SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^CON-\\d{6}-(\\d+)$', '\\1'), '')), '0')::int + 1 as next_seq
        FROM greentarget.invoices
        WHERE invoice_number LIKE 'CON-${datePrefix}-%'
      `;

      const sequenceResult = await client.query(consolidatedSequenceQuery);
      const sequence = sequenceResult.rows[0].next_seq;
      const consolidatedInvoiceNumber = `CON-${datePrefix}-${sequence}`;

      // 4. Create the consolidated invoice record
      const createConsolidatedQuery = `
        INSERT INTO greentarget.invoices (
          invoice_number, type, customer_id,
          amount_before_tax, tax_amount, total_amount, date_issued,
          balance_due, status, is_consolidated, consolidated_invoices
        )
        VALUES (
          $1, 'consolidated', $2,
          $3, $4, $5, CURRENT_DATE,
          $6, 'active', true, $7
        )
        RETURNING *
      `;

      const consolidatedInvoiceNumbers = selectedInvoices.map(
        (inv) => inv.invoice_number
      );

      const createResult = await client.query(createConsolidatedQuery, [
        consolidatedInvoiceNumber,
        null,
        totalExcludingTax.toFixed(2),
        taxAmount.toFixed(2),
        totalAmount.toFixed(2),
        totalAmount.toFixed(2), // Initial balance due equals total
        JSON.stringify(consolidatedInvoiceNumbers),
      ]);

      const consolidatedInvoice = createResult.rows[0];

      // 5. Generate XML using the Green Target Consolidated Template
      const consolidatedXml = await GTEInvoiceConsolidatedTemplate(
        selectedInvoices,
        month,
        year
      );

      // 6. Submit to MyInvois API
      const requestBody = {
        documents: [
          {
            format: "XML",
            document: Buffer.from(consolidatedXml, "utf8").toString("base64"),
            documentHash: createHash("sha256")
              .update(consolidatedXml, "utf8")
              .digest("hex"),
            codeNumber: consolidatedInvoiceNumber,
          },
        ],
      };

      // Submit to MyInvois API
      const submissionResponse = await apiClient.makeApiCall(
        "POST",
        "/api/v1.0/documentsubmissions",
        requestBody
      );

      // 7. Process and update the response in our database
      // 7. Process and update the response in our database
      if (submissionResponse.acceptedDocuments?.length > 0) {
        // Poll for final status
        const finalStatus = await submissionHandler.pollSubmissionStatus(
          submissionResponse.submissionUid
        );
        const consolidatedData = finalStatus.documentSummary[0];

        // Update the consolidated invoice with e-invoice data
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

        const status = consolidatedData.longId ? "valid" : "pending";

        await client.query(updateQuery, [
          status,
          consolidatedData.uuid,
          submissionResponse.submissionUid,
          consolidatedData.longId || null,
          consolidatedData.dateTimeValidated || null,
          consolidatedInvoice.invoice_id,
        ]);

        await client.query("COMMIT");

        // Format for SubmissionResultsModal compatibility
        const formattedResponse = {
          success: true,
          message:
            status === "pending"
              ? "Consolidated invoice submitted, but is still pending validation"
              : "Consolidated invoice submitted successfully",
          acceptedDocuments: [
            {
              internalId: consolidatedInvoiceNumber,
              uuid: consolidatedData.uuid,
              longId: consolidatedData.longId || null,
              status: consolidatedData.status || "Submitted",
              dateTimeReceived:
                finalStatus.dateTimeReceived || new Date().toISOString(),
              dateTimeValidated: consolidatedData.dateTimeValidated || null,
              submissionUid: submissionResponse.submissionUid,
            },
          ],
          rejectedDocuments: submissionResponse.rejectedDocuments || [],
          overallStatus: status === "pending" ? "Pending" : "Valid",
          submissionUid: submissionResponse.submissionUid,
          documentCount: 1,
        };

        return res.status(201).json(formattedResponse);
      } else if (submissionResponse.rejectedDocuments?.length > 0) {
        // Handle rejected documents
        console.error(
          "Consolidated invoice submission was rejected:",
          submissionResponse.rejectedDocuments
        );
      }

      await client.query("COMMIT");

      // Format response for front-end
      const formattedResponse = {
        success: true,
        message: "Consolidated invoice submitted successfully",
        acceptedDocuments: submissionResponse.acceptedDocuments || [],
        rejectedDocuments: submissionResponse.rejectedDocuments || [],
        overallStatus: submissionResponse.overallStatus || "Pending",
        submissionUid: submissionResponse.submissionUid,
        documentCount: 1,
        consolidatedInvoice: consolidatedInvoice,
      };

      return res.status(201).json(formattedResponse);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating consolidated invoice:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create consolidated invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Get auto-consolidation settings
  router.get("/settings/auto-consolidation", async (req, res) => {
    try {
      const query =
        "SELECT * FROM consolidation_settings WHERE company_id = 'greentarget'";
      const result = await pool.query(query);

      if (result.rows.length === 0) {
        await pool.query(
          "INSERT INTO consolidation_settings (company_id, auto_consolidation_enabled) VALUES ('greentarget', FALSE) RETURNING *"
        );
        return res.json({ enabled: false });
      }

      return res.json({
        enabled: result.rows[0].auto_consolidation_enabled,
      });
    } catch (error) {
      console.error("Error fetching auto-consolidation settings:", error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch settings" });
    }
  });

  // Toggle enabled/disabled:
  router.post("/settings/auto-consolidation", async (req, res) => {
    const { enabled } = req.body;
    const sessionId = req.headers["x-session-id"];

    try {
      const sessionQuery =
        "SELECT staff_id FROM active_sessions WHERE session_id = $1";
      const sessionResult = await pool.query(sessionQuery, [sessionId]);
      const staffId = sessionResult.rows[0]?.staff_id || "system";

      const query = `
        UPDATE consolidation_settings 
        SET 
          auto_consolidation_enabled = $1,
          last_updated = CURRENT_TIMESTAMP,
          updated_by = $2
        WHERE company_id = 'greentarget'
        RETURNING *
      `;

      const result = await pool.query(query, [enabled, staffId]);

      return res.json({
        success: true,
        message: "Settings updated successfully",
        settings: {
          enabled: result.rows[0].auto_consolidation_enabled,
        },
      });
    } catch (error) {
      console.error("Error updating auto-consolidation settings:", error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to update settings" });
    }
  });

  // Get auto-consolidation status
  router.get("/auto-consolidation/status", async (req, res) => {
    const { year, month } = req.query;

    if (!year || month === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "Year and month are required" });
    }

    try {
      const query = `
      SELECT * FROM consolidation_tracking 
      WHERE company_id = 'greentarget' AND year = $1 AND month = $2
    `;

      const result = await pool.query(query, [year, month]);

      if (result.rows.length === 0) {
        return res.json({
          exists: false,
          status: null,
        });
      }

      return res.json({
        exists: true,
        status: result.rows[0].status,
        attempt_count: result.rows[0].attempt_count,
        last_attempt: result.rows[0].last_attempt,
        next_attempt: result.rows[0].next_attempt,
        consolidated_invoice_id: result.rows[0].consolidated_invoice_id,
        error: result.rows[0].error,
      });
    } catch (error) {
      console.error("Error fetching auto-consolidation status:", error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch status" });
    }
  });

  // Update status of consolidated invoice
  router.post("/consolidated/:invoice_id/update-status", async (req, res) => {
    const { invoice_id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists and has a UUID
      const invoiceQuery = `
      SELECT uuid, einvoice_status, submission_uid
      FROM greentarget.invoices 
      WHERE invoice_id = $1 AND is_consolidated = true
      FOR UPDATE
    `;

      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ message: "Consolidated invoice not found" });
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

      // Call MyInvois API to check document status
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
        newDateTimeValidated = documentDetails.dateTimeValidated || null;
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
          invoice_id,
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
        updated,
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

  // Cancel consolidated invoice
  router.post("/consolidated/:invoice_id/cancel", async (req, res) => {
    const { invoice_id } = req.params;
    const { reason } = req.body;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists and has a UUID
      const invoiceQuery = `
      SELECT uuid, einvoice_status, invoice_number
      FROM greentarget.invoices 
      WHERE invoice_id = $1 AND is_consolidated = true
      FOR UPDATE
    `;

      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Consolidated invoice not found",
        });
      }

      const invoice = invoiceResult.rows[0];

      // We can only cancel if there's a UUID and status is not already cancelled
      if (!invoice.uuid) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "This invoice has no e-Invoice UUID to cancel",
        });
      }

      if (invoice.einvoice_status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "This invoice is already cancelled",
        });
      }

      // Try to cancel in MyInvois if it's valid
      if (
        invoice.einvoice_status === "valid" ||
        invoice.einvoice_status === "pending"
      ) {
        try {
          await apiClient.makeApiCall(
            "PUT",
            `/api/v1.0/documents/state/${invoice.uuid}/state`,
            {
              status: "cancelled",
              reason: reason || "Cancelled by administrator",
            }
          );
        } catch (cancelError) {
          console.warn(
            `Warning: Could not cancel e-invoice in MyInvois: ${cancelError.message}`
          );
          // Continue processing - we'll mark as cancelled locally anyway
        }
      }

      // Update the invoice as cancelled
      const updateQuery = `
      UPDATE greentarget.invoices
      SET einvoice_status = 'cancelled',
          status = 'cancelled',
          cancellation_date = CURRENT_TIMESTAMP,
          cancellation_reason = $1
      WHERE invoice_id = $2
      RETURNING *
    `;

      const updateResult = await client.query(updateQuery, [
        reason || "Cancelled by administrator",
        invoice_id,
      ]);

      await client.query("COMMIT");

      res.json({
        success: true,
        message: `Successfully cancelled consolidated invoice ${invoice.invoice_number}`,
        invoice: updateResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        `Error cancelling consolidated invoice ${invoice_id}:`,
        error
      );
      res.status(500).json({
        success: false,
        message: "Error cancelling consolidated invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}

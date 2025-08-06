// src/routes/jellypolly/sales/invoices/e-invoice.js
import { JPEInvoiceTemplate } from "../../utils/JellyPolly/einvoice/JPEInvoiceTemplate.js";
import { Router } from "express";
import { createHash } from "crypto";
import JPEInvoiceSubmissionHandler from "../../utils/JellyPolly/einvoice/JPEInvoiceSubmissionHandler.js";
import JPEInvoiceApiClientFactory from "../../utils/JellyPolly/einvoice/JPEInvoiceApiClientFactory.js";
import { JPEInvoiceConsolidatedTemplate } from "../../utils/JellyPolly/einvoice/JPEInvoiceConsolidatedTemplate.js";

// Function to fetch customer data
async function fetchCustomerData(pool, customerId) {
  try {
    const query = `
      SELECT 
        city,
        state,
        address,
        name,
        tin_number,
        id_number,
        id_type,
        phone_number,
        email
      FROM customers 
      WHERE id = $1
    `;
    const result = await pool.query(query, [customerId]);

    if (result.rows.length === 0) {
      throw new Error(`Customer with ID ${customerId} not found`);
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error fetching customer data:", error);
    throw error;
  }
}

// Helper function to fetch invoice from database
const getInvoices = async (pool, invoiceId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceQuery = `
        SELECT 
          i.id, 
          i.salespersonid,
          i.customerid,
          i.createddate,
          i.paymenttype,
          i.total_excluding_tax,
          i.rounding,
          i.totalamountpayable
        FROM 
          jellypolly.invoices i
        WHERE 
          i.id = $1
      `;

    const invoiceResult = await client.query(invoiceQuery, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    const orderDetailsQuery = `
        SELECT 
          od.id,
          od.code,
          od.price,
          od.quantity,
          od.freeproduct,
          od.returnproduct,
          od.description,
          od.tax,
          od.total,
          od.issubtotal
        FROM 
          jellypolly.order_details od
        WHERE 
          od.invoiceid = $1
        ORDER BY 
          od.id
      `;

    const orderDetailsResult = await client.query(orderDetailsQuery, [
      invoiceId,
    ]);

    await client.query("COMMIT");

    return {
      ...invoiceResult.rows[0],
      date: new Date(Number(invoiceResult.rows[0].createddate)),
      time: new Date(Number(invoiceResult.rows[0].createddate))
        .toTimeString()
        .substring(0, 5),
      type: invoiceResult.rows[0].paymenttype,
      orderDetails: orderDetailsResult.rows.map((detail) => ({
        ...detail,
        price: Number(detail.price),
        total: detail.total,
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export default function (pool, config) {
  const router = Router();
  const apiClient = JPEInvoiceApiClientFactory.getInstance(config);
  const submissionHandler = new JPEInvoiceSubmissionHandler(apiClient);

  // Login/token endpoint
  router.post("/login", async (req, res) => {
    try {
      const tokenResponse = await apiClient.refreshToken();

      if (tokenResponse && tokenResponse.access_token) {
        res.json({
          success: true,
          message: "Successfully connected to MyInvois API",
          apiEndpoint: `${config.MYINVOIS_API_BASE_URL}/connect/token`,
          tokenInfo: {
            accessToken: tokenResponse.access_token,
            expiresIn: tokenResponse.expires_in,
            tokenType: tokenResponse.token_type,
          },
        });
      } else {
        throw new Error("Invalid token response from MyInvois API");
      }
    } catch (error) {
      console.error("Error connecting to MyInvois API:", error);
      res.status(500).json({
        success: false,
        message: "Failed to connect to MyInvois API",
        apiEndpoint: `${config.MYINVOIS_API_BASE_URL}/connect/token`,
        error: error.message,
        details: error.response ? error.response.data : null,
      });
    }
  });

  // POST /api/einvoice/submit - Submit Invoice to MyInvois (Updated with pending check)
  router.post("/submit", async (req, res) => {
    try {
      const { invoiceIds } = req.body;

      if (!invoiceIds?.length) {
        return res.status(400).json({
          success: false,
          message: "No invoice IDs provided for submission",
        });
      }

      // STEP 1: Check for invoices that already have a long_id (already processed successfully)
      const validatedQuery = `
      SELECT id, uuid, long_id, einvoice_status 
      FROM jellypolly.invoices
      WHERE id = ANY($1) AND long_id IS NOT NULL AND long_id != ''
      `;
      const validatedResult = await pool.query(validatedQuery, [invoiceIds]);
      const alreadyValidatedInvoices = validatedResult.rows;

      // STEP 2: Identify and process any pending invoices next
      const pendingQuery = `
      SELECT id, uuid, submission_uid 
      FROM jellypolly.invoices 
      WHERE id = ANY($1) AND einvoice_status = 'pending' AND uuid IS NOT NULL
      AND (long_id IS NULL OR long_id = '')
      `;
      const pendingResult = await pool.query(pendingQuery, [invoiceIds]);
      const pendingInvoices = pendingResult.rows;

      // Track results of status updates for pending invoices
      const statusUpdateResults = {
        updated: [],
        failed: [],
      };

      // Process each pending invoice to check current status
      for (const invoice of pendingInvoices) {
        try {
          // Call MyInvois API to check current status
          const documentDetails = await apiClient.makeApiCall(
            "GET",
            `/api/v1.0/documents/${invoice.uuid}/details`
          );

          // Determine new status based on response
          let newStatus = "pending"; // Default to keep current status

          if (documentDetails.longId) {
            newStatus = "valid";
          } else if (
            documentDetails.status === "Invalid" ||
            documentDetails.status === "Rejected"
          ) {
            newStatus = "invalid";
          }

          // Update in database if status changed
          if (
            newStatus !== "pending" ||
            (newStatus === "valid" && documentDetails.longId)
          ) {
            await pool.query(
              `UPDATE jellypolly.invoices SET 
              einvoice_status = $1, 
              long_id = $2, 
              datetime_validated = $3 
            WHERE id = $4`,
              [
                newStatus,
                documentDetails.longId || null,
                documentDetails.dateTimeValidated || null,
                invoice.id,
              ]
            );
          }

          statusUpdateResults.updated.push({
            id: invoice.id,
            status: newStatus,
            longId: documentDetails.longId || null,
            uuid: invoice.uuid,
          });
        } catch (error) {
          console.error(
            `Error checking status for pending invoice ${invoice.id}:`,
            error
          );
          statusUpdateResults.failed.push({
            id: invoice.id,
            error: error.message,
          });
        }
      }

      // STEP 3: Filter out already processed pending and validated invoices
      const processedIds = [
        ...alreadyValidatedInvoices.map((inv) => inv.id),
        ...statusUpdateResults.updated.map((upd) => upd.id),
      ];

      const invoiceIdsToProcess = invoiceIds.filter(
        (id) => !processedIds.includes(id)
      );

      // If all invoices were already processed, return early with results
      if (invoiceIdsToProcess.length === 0) {
        // Standard format
        return res.status(200).json({
          success: true,
          message: "All invoices were already processed or have been updated",
          pendingUpdated: statusUpdateResults.updated,
          pendingFailed: statusUpdateResults.failed,
          overallStatus: "Success",
        });
      }

      // STEP 4: Process new/invalid invoices (original flow)
      const transformedInvoices = [];
      const validationErrors = [];

      // Check for duplicates first
      for (const invoiceId of invoiceIdsToProcess) {
        try {
          // If not a duplicate, process the invoice
          const invoiceData = await getInvoices(pool, invoiceId);
          if (!invoiceData) {
            throw new Error(`Invoice with ID ${invoiceId} not found`);
          }

          const customerData = await fetchCustomerData(
            pool,
            invoiceData.customerid
          );

          const transformedInvoice = await JPEInvoiceTemplate(
            invoiceData,
            customerData
          );
          transformedInvoices.push(transformedInvoice);
        } catch (error) {
          // Handle validation errors
          const errorDetails = error.details || [];
          const errorType = error.message ? error.message.toLowerCase() : "";

          // Determine error code based on error message
          let errorCode = "CF001";
          if (errorType.includes("tin") || errorType.includes("id number")) {
            errorCode = "MISSING_TIN";
          } else if (errorType.includes("duplicate")) {
            errorCode = "DUPLICATE_INVOICE";
          }

          validationErrors.push({
            internalId: error.id || invoiceId,
            error: {
              code: error.code || errorCode,
              message: error.message || "Validation Error",
              target: error.id || invoiceId,
              details:
                errorDetails.length > 0
                  ? errorDetails
                  : [
                      {
                        code: errorCode,
                        message: error.message,
                        target: "document",
                        propertyPath: error.propertyPath,
                      },
                    ],
            },
          });
        }
      }

      // If there are any validation errors, but we still have valid invoices, continue processing
      if (validationErrors.length > 0 && transformedInvoices.length === 0) {
        return res.status(422).json({
          success: false,
          message: "Validation failed for submitted documents",
          shouldStopAtValidation: true,
          rejectedDocuments: validationErrors,
          pendingUpdated: statusUpdateResults.updated,
          overallStatus: "Invalid",
        });
      }

      // Handle no valid invoices
      if (transformedInvoices.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid invoices to process",
          shouldStopAtValidation: true,
          rejectedDocuments: validationErrors,
          pendingUpdated: statusUpdateResults.updated,
          overallStatus: "Invalid",
        });
      }

      // Submit valid invoices
      const submissionResult = await submissionHandler.submitAndPollDocuments(
        transformedInvoices
      );

      // Add validation errors to the result if there are any
      if (validationErrors.length > 0) {
        submissionResult.rejectedDocuments = [
          ...(submissionResult.rejectedDocuments || []),
          ...validationErrors,
        ];
        submissionResult.overallStatus = "Partial";
      }

      // STEP 5: Update invoices table directly based on submission results
      if (
        submissionResult.success &&
        submissionResult.acceptedDocuments?.length > 0
      ) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Update each accepted document in the invoices table
          for (const doc of submissionResult.acceptedDocuments) {
            const status = doc.longId ? "valid" : "pending";
            try {
              await client.query(
                `UPDATE jellypolly.invoices SET 
                uuid = $1,
                submission_uid = $2,
                long_id = $3, 
                datetime_validated = $4,
                einvoice_status = $5
              WHERE id = $6`,
                [
                  doc.uuid,
                  doc.submissionUid,
                  doc.longId || null,
                  doc.dateTimeValidated || null,
                  status,
                  doc.internalId,
                ]
              );
            } catch (error) {
              console.error(
                `Failed to update invoice ${doc.internalId}:`,
                error
              );
            }
          }

          // Update each rejected document to mark as 'invalid'
          if (submissionResult.rejectedDocuments?.length > 0) {
            for (const doc of submissionResult.rejectedDocuments) {
              const invoiceId = doc.internalId || doc.invoiceCodeNumber;
              if (!invoiceId) continue;

              try {
                await client.query(
                  `UPDATE jellypolly.invoices SET einvoice_status = 'invalid' WHERE id = $1`,
                  [invoiceId]
                );
              } catch (error) {
                console.error(
                  `Failed to mark invoice ${invoiceId} as invalid:`,
                  error
                );
              }
            }
          }

          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          console.error("Error updating invoices with e-invoice data:", error);
        } finally {
          client.release();
        }
      }

      // Determine appropriate status code
      let statusCode = 201; // Default to Created for complete success

      if (submissionResult.overallStatus === "Partial") {
        statusCode = 202; // Accepted for partial success
      } else if (
        submissionResult.overallStatus === "Invalid" ||
        (submissionResult.rejectedDocuments?.length > 0 &&
          submissionResult.acceptedDocuments?.length === 0)
      ) {
        statusCode = 422; // Unprocessable Entity for validation failures
      }

      // Standard response format
      return res.status(statusCode).json({
        ...submissionResult,
        pendingUpdated: statusUpdateResults.updated,
        pendingFailed: statusUpdateResults.failed,
      });
    } catch (error) {
      console.error("Submission error:", error);

      // Check for specific error codes like 422 (duplicate payload)
      if (error.status === 422) {
        return res.status(422).json({
          success: false,
          message: "Duplicate submission detected",
          shouldStopAtValidation: true,
          rejectedDocuments: [
            {
              internalId: "Failed",
              error: {
                code: "DUPLICATE_PAYLOAD",
                message: "Duplicated Submission",
                details: [
                  {
                    message: error.response?.error || "Duplicate submission",
                  },
                ],
              },
            },
          ],
          overallStatus: "Invalid",
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || "Failed to process batch submission",
        shouldStopAtValidation: true,
        rejectedDocuments: [
          {
            internalId:
              error.id || (error.invoiceNo ? error.invoiceNo : "unknown"),
            error: {
              code: error.code || "Unknown",
              message: error.message || "Unknown error occurred",
              details: error.details || [],
            },
          },
        ],
        overallStatus: "Invalid",
      });
    }
  });

  // Update Status for a Cancelled Invoice (Sync with MyInvois) ---
  router.post("/cancelled/:id/sync", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      // Fetch the invoice record
      const invoiceQuery = `
      SELECT uuid, einvoice_status, invoice_status, long_id
      FROM jellypolly.invoices
      WHERE id = $1
    `;
      const invoiceResult = await client.query(invoiceQuery, [id]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found.",
        });
      }

      const invoice = invoiceResult.rows[0];

      // We can only check/update status if we have a UUID
      if (!invoice.uuid) {
        return res.status(400).json({
          success: false,
          message:
            "Invoice has no MyInvois UUID, cannot sync cancellation status.",
        });
      }

      // Ensure the invoice is actually cancelled locally
      if (invoice.invoice_status !== "cancelled") {
        return res.status(400).json({
          success: false,
          message:
            "Invoice must be cancelled locally before syncing cancellation status.",
        });
      }

      // Check if already marked as cancelled in our system
      if (invoice.einvoice_status === "cancelled") {
        return res.json({
          success: true,
          message: "Invoice e-invoice status is already marked as cancelled.",
          status: "cancelled",
          updated: false,
        });
      }

      // Call MyInvois API to check current status
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
        const updateQuery = `
        UPDATE jellypolly.invoices 
        SET einvoice_status = 'cancelled'
        WHERE id = $1
      `;
        await client.query(updateQuery, [id]);

        syncResult.message =
          "e-Invoice is already cancelled in MyInvois. Local status updated.";
        syncResult.actionTaken = "status_updated";
        syncResult.statusAfter = "cancelled";
      }
      // If still valid in MyInvois, try to cancel it
      else if (documentDetails.status === "Valid" || documentDetails.longId) {
        try {
          // Call MyInvois API to cancel e-invoice
          await apiClient.makeApiCall(
            "PUT",
            `/api/v1.0/documents/state/${invoice.uuid}/state`,
            { status: "cancelled", reason: "Invoice cancelled in system" }
          );

          // Update einvoice_status to cancelled
          const updateQuery = `
          UPDATE jellypolly.invoices
          SET einvoice_status = 'cancelled'
          WHERE id = $1
        `;
          await client.query(updateQuery, [id]);

          syncResult.message =
            "Successfully cancelled e-Invoice in MyInvois and updated local status.";
          syncResult.actionTaken = "cancelled_in_myinvois";
          syncResult.statusAfter = "cancelled";
        } catch (cancelError) {
          console.error(
            `Error cancelling e-invoice ${invoice.uuid} via API:`,
            cancelError
          );
          return res.status(500).json({
            success: false,
            message: `Failed to cancel e-Invoice in MyInvois: ${
              cancelError.message || "Unknown error"
            }`,
            error: cancelError,
          });
        }
      }
      // Other status (pending, invalid, etc.)
      else {
        // For other statuses, we still update to cancelled
        const updateQuery = `
        UPDATE jellypolly.invoices
        SET einvoice_status = 'cancelled'
        WHERE id = $1
      `;
        await client.query(updateQuery, [id]);

        syncResult.message = `e-Invoice has status "${documentDetails.status}" in MyInvois. Local status updated to cancelled.`;
        syncResult.actionTaken = "status_updated";
        syncResult.statusAfter = "cancelled";
      }

      return res.json({
        success: true,
        ...syncResult,
      });
    } catch (error) {
      console.error(
        `Error syncing cancellation status for invoice ${id}:`,
        error
      );
      return res.status(500).json({
        success: false,
        message: "Failed to sync cancellation status",
        error: error.message || "An unexpected error occurred",
      });
    } finally {
      client.release();
    }
  });

  // Get consolidated invoice history
  router.get("/consolidated-history", async (req, res) => {
    try {
      const { year } = req.query;
      let query = `
        SELECT 
          id, 
          uuid, 
          long_id, 
          submission_uid, 
          datetime_validated, 
          einvoice_status,
          total_excluding_tax,
          tax_amount,
          rounding,
          totalamountpayable,
          createddate AS created_at,
          consolidated_invoices
        FROM 
          jellypolly.invoices
        WHERE 
          is_consolidated = true
      `;

      // Add year filtering if provided
      const queryParams = [];
      if (year) {
        // Filter where createddate is within the specified year
        const startDate = new Date(parseInt(year), 0, 1).getTime(); // Jan 1st of year
        const endDate = new Date(parseInt(year) + 1, 0, 1).getTime(); // Jan 1st of next year

        query += ` AND CAST(createddate AS bigint) >= $1 AND CAST(createddate AS bigint) < $2`;
        queryParams.push(startDate.toString(), endDate.toString());
      }

      query += ` ORDER BY createddate DESC`;

      const result = await pool.query(query, queryParams);

      // Transform the results (keep the existing transformation logic)
      const transformedHistory = result.rows.map((row) => ({
        id: row.id,
        uuid: row.uuid,
        long_id: row.long_id,
        submission_uid: row.submission_uid,
        datetime_validated: row.datetime_validated,
        einvoice_status: row.einvoice_status,
        total_excluding_tax: parseFloat(row.total_excluding_tax || 0),
        tax_amount: parseFloat(row.tax_amount || 0),
        rounding: parseFloat(row.rounding || 0),
        totalamountpayable: parseFloat(row.totalamountpayable || 0),
        created_at: row.created_at,
        // Parse JSON array if stored as string
        consolidated_invoices:
          typeof row.consolidated_invoices === "string"
            ? JSON.parse(row.consolidated_invoices)
            : row.consolidated_invoices || [],
      }));

      res.json(transformedHistory);
    } catch (error) {
      console.error("Error fetching consolidated invoice history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch consolidated invoice history",
        error: error.message,
      });
    }
  });

  // Get all invoices eligible for consolidation
  router.get("/eligible-for-consolidation", async (req, res) => {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required",
        });
      }

      // This part remains unchanged
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

      // Updated query to use the new schema fields and exclude invoices that are already in consolidated invoices
      const query = `
        SELECT 
          i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype, 
          i.total_excluding_tax as amount, i.tax_amount, i.rounding, i.totalamountpayable,
          i.balance_due, i.invoice_status,
          COALESCE(
            json_agg(
              CASE WHEN od.id IS NOT NULL THEN 
                json_build_object(
                  'code', od.code,
                  'quantity', od.quantity,
                  'price', od.price,
                  'freeProduct', od.freeproduct,
                  'returnProduct', od.returnproduct,
                  'description', od.description,
                  'tax', od.tax,
                  'total', od.total,
                  'issubtotal', od.issubtotal
                )
              ELSE NULL END
              ORDER BY od.id
            ) FILTER (WHERE od.id IS NOT NULL),
            '[]'::json
          ) as products
        FROM jellypolly.invoices i
        LEFT JOIN jellypolly.order_details od ON i.id = od.invoiceid
        WHERE (CAST(i.createddate AS bigint) >= $1 AND CAST(i.createddate AS bigint) < $2)
        AND (i.einvoice_status IS NULL OR i.einvoice_status = 'invalid')
        AND (i.invoice_status != 'cancelled')
        AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM jellypolly.invoices consolidated 
          WHERE consolidated.is_consolidated = true
          AND consolidated.consolidated_invoices IS NOT NULL
          AND consolidated.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
          AND consolidated.invoice_status != 'cancelled' 
          AND consolidated.einvoice_status != 'cancelled'
        )
        GROUP BY i.id
        ORDER BY CAST(i.createddate AS bigint) ASC
        `;

      const result = await pool.query(query, [startTimestamp, endTimestamp]);

      // Transform results to ensure proper types for tax calculations
      const transformedResults = result.rows.map((row) => ({
        ...row,
        products: (row.products || []).map((product) => ({
          ...product,
          uid: crypto.randomUUID(),
          price: parseFloat(product.price) || 0,
          quantity: parseInt(product.quantity) || 0,
          freeProduct: parseInt(product.freeProduct) || 0,
          returnProduct: parseInt(product.returnProduct) || 0,
          tax: parseFloat(product.tax) || 0,
          total: parseFloat(product.total) || 0,
          issubtotal: Boolean(product.issubtotal),
        })),
        amount: parseFloat(row.amount) || 0,
        tax_amount: parseFloat(row.tax_amount) || 0,
        rounding: parseFloat(row.rounding) || 0,
        totalamountpayable: parseFloat(row.totalamountpayable) || 0,
        balance_due: parseFloat(row.balance_due) || 0,
      }));

      res.json({
        success: true,
        data: transformedResults,
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

  // Submit consolidated invoice
  router.post("/submit-consolidated", async (req, res) => {
    try {
      const { invoices: invoiceIds, month, year } = req.body;

      if (!invoiceIds?.length) {
        return res.status(400).json({
          success: false,
          message: "No invoice IDs provided for consolidation",
        });
      }

      if (month === undefined || year === undefined) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required",
        });
      }

      // Fetch all invoice data
      const invoiceData = [];
      let totalRounding = 0;
      let totalTaxAmount = 0;
      for (const invoiceId of invoiceIds) {
        try {
          const invoice = await getInvoices(pool, invoiceId);
          if (invoice) {
            invoiceData.push(invoice);
            totalRounding += Number(invoice.rounding || 0);
            totalTaxAmount += Number(invoice.tax_amount || 0);
          }
        } catch (error) {
          console.warn(`Failed to fetch invoice ${invoiceId}:`, error);
          // Continue with other invoices
        }
      }

      if (invoiceData.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid invoices found for consolidation",
        });
      }

      // Generate consolidated invoice XML
      const consolidatedXml = await JPEInvoiceConsolidatedTemplate(
        invoiceData,
        month,
        year
      );

      // Generate base consolidated ID
      const baseConsolidatedId = `CON-${year}${String(
        parseInt(month) + 1
      ).padStart(2, "0")}`;

      // Check for existing consolidated invoices with the same base ID pattern
      const existingIdsQuery = `
      SELECT id FROM jellypolly.invoices 
      WHERE id LIKE $1 
      ORDER BY id DESC
    `;
      const existingIdsResult = await pool.query(existingIdsQuery, [
        `${baseConsolidatedId}%`,
      ]);

      let consolidatedId;
      if (existingIdsResult.rows.length === 0) {
        // No existing IDs, use the base ID
        consolidatedId = baseConsolidatedId;
      } else {
        // Find the highest suffix number and increment
        let maxSuffix = 0;
        for (const row of existingIdsResult.rows) {
          const id = row.id;
          // Extract suffix number if present (e.g., "CON-202504-1" -> 1)
          const match = id.match(new RegExp(`^${baseConsolidatedId}-?(\\d+)$`));
          if (match && match[1]) {
            const suffix = parseInt(match[1]);
            if (suffix > maxSuffix) {
              maxSuffix = suffix;
            }
          }
        }
        // Increment the highest suffix or start with 1 if no suffixed versions exist
        consolidatedId = `${baseConsolidatedId}-${
          maxSuffix > 0 ? maxSuffix + 1 : 1
        }`;
      }

      const requestBody = {
        documents: [
          {
            format: "XML",
            document: Buffer.from(consolidatedXml, "utf8").toString("base64"),
            documentHash: createHash("sha256")
              .update(consolidatedXml, "utf8")
              .digest("hex"),
            codeNumber: consolidatedId,
          },
        ],
      };

      // Submit to MyInvois API
      const submissionResponse = await apiClient.makeApiCall(
        "POST",
        "/api/v1.0/documentsubmissions",
        requestBody
      );

      if (submissionResponse.acceptedDocuments?.length > 0) {
        // Poll for final status
        const finalStatus = await submissionHandler.pollSubmissionStatus(
          submissionResponse.submissionUid
        );
        const consolidatedData = finalStatus.documentSummary[0];

        if (
          finalStatus.overallStatus === "Invalid" ||
          consolidatedData.status === "Invalid"
        ) {
          return res.status(400).json({
            success: false,
            message: "Consolidated invoice submission was rejected",
            submissionUid: submissionResponse.submissionUid,
            consolidatedId,
            uuid: consolidatedData.uuid,
            status: consolidatedData.status,
            errors: [
              {
                code: "INVALID_SUBMISSION",
                message: "The submission was marked as invalid by MyInvois",
              },
            ],
          });
        }

        // Check if the submission is still pending
        const isPending =
          finalStatus.overallStatus === "InProgress" ||
          consolidatedData.status === "Submitted" ||
          !consolidatedData.longId;

        // Calculate totals from all invoices
        const totalExcludingTax = invoiceData.reduce(
          (sum, inv) => sum + parseFloat(inv.total_excluding_tax || 0),
          0
        );

        const totalPayable = invoiceData.reduce(
          (sum, inv) => sum + parseFloat(inv.totalamountpayable || 0),
          0
        );

        // Mark the original invoices as consolidated
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Insert consolidated record
          await client.query(
            `INSERT INTO jellypolly.invoices (
            id, uuid, submission_uid, long_id, datetime_validated,
            total_excluding_tax, tax_amount, rounding, totalamountpayable,
            invoice_status, einvoice_status, is_consolidated, consolidated_invoices,
            customerid, salespersonid, createddate, paymenttype, balance_due
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
              consolidatedId,
              consolidatedData.uuid,
              submissionResponse.submissionUid,
              consolidatedData.longId,
              consolidatedData.dateTimeValidated || new Date().toISOString(),
              totalExcludingTax,
              totalTaxAmount,
              totalRounding,
              totalPayable,
              "paid", // Consolidated invoices are typically marked as paid
              consolidatedData.longId ? "valid" : "pending",
              true,
              JSON.stringify(invoiceIds),
              "Consolidated customers", // Default consolidated customer ID
              "SYSTEM", // System-generated invoice
              new Date().getTime().toString(), // Current timestamp
              "INVOICE", // Consolidated invoices are always INVOICE type
              0, // No balance due for consolidated invoices
            ]
          );

          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          console.error("Failed to record consolidated invoice:", error);
          throw error; // Let the outer catch handle this
        } finally {
          client.release();
        }

        // Format for SubmissionResultsModal compatibility
        const formattedResponse = {
          success: true,
          message: isPending
            ? "Consolidated invoice submitted, but is still pending validation"
            : "Consolidated invoice submitted successfully",
          acceptedDocuments: [
            {
              internalId: consolidatedId,
              uuid: consolidatedData.uuid,
              longId: consolidatedData.longId || null,
              status: consolidatedData.status,
              dateTimeReceived: finalStatus.dateTimeReceived,
              dateTimeValidated: consolidatedData.dateTimeValidated,
            },
          ],
          rejectedDocuments: [],
          overallStatus: isPending ? "Pending" : "Valid",
          submissionUid: submissionResponse.submissionUid,
          documentCount: 1,
        };

        return res.json(formattedResponse);
      } else {
        return res.status(400).json({
          success: false,
          message: "Submission failed",
          rejectedDocuments: submissionResponse.rejectedDocuments,
          overallStatus: "Invalid",
        });
      }
    } catch (error) {
      console.error("Consolidated submission error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to process consolidated submission",
        overallStatus: "Error",
      });
    }
  });

  // Get auto-consolidation settings
  router.get("/settings/auto-consolidation", async (req, res) => {
    try {
      const query =
        "SELECT * FROM consolidation_settings WHERE company_id = 'jellypolly'";
      const result = await pool.query(query);

      if (result.rows.length === 0) {
        await pool.query(
          "INSERT INTO consolidation_settings (company_id, auto_consolidation_enabled) VALUES ('jellypolly', FALSE) RETURNING *"
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
        WHERE company_id = 'jellypolly'
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
      WHERE company_id = 'jellypolly' AND year = $1 AND month = $2
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

  //  Update Status for a Pending Consolidated Invoice ---
  router.post("/consolidated/:id/update-status", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect(); // Use client for potential update

    try {
      // Fetch the consolidated invoice record
      const invoiceQuery = `
        SELECT uuid, einvoice_status, long_id, datetime_validated
        FROM jellypolly.invoices
        WHERE id = $1 AND is_consolidated = true
      `;
      const invoiceResult = await client.query(invoiceQuery, [id]);

      if (invoiceResult.rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Consolidated invoice not found." });
      }

      const invoice = invoiceResult.rows[0];

      // We can only update status if we have a UUID
      if (!invoice.uuid) {
        return res.status(400).json({
          success: false,
          message: "Invoice has no MyInvois UUID, cannot check status.",
        });
      }

      // Don't need to re-check if already valid or invalid
      // Allow re-checking invalid? Maybe. Allow re-checking pending is the main goal.
      if (invoice.einvoice_status === "valid") {
        return res.json({
          success: true,
          message: "Invoice is already valid.",
          status: invoice.einvoice_status,
          longId: invoice.long_id,
          dateTimeValidated: invoice.datetime_validated,
          updated: false, // Indicate no change was made now
        });
      }

      const documentDetails = await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/documents/${invoice.uuid}/details`
      );

      // Determine new status based on response
      let newStatus = "pending"; // Default assumption
      let newLongId = invoice.long_id;
      let newDateTimeValidated = invoice.datetime_validated;
      let updated = false;

      // MyInvois uses title-case Status
      const remoteStatus = documentDetails.status?.toLowerCase();

      if (documentDetails.longId) {
        newStatus = "valid";
        newLongId = documentDetails.longId;
        // Use validation time from API if available, otherwise keep existing if any
        newDateTimeValidated = documentDetails.dateTimeValidation
          ? new Date(documentDetails.dateTimeValidation).toISOString()
          : newDateTimeValidated;
      } else if (remoteStatus === "invalid" || remoteStatus === "rejected") {
        newStatus = "invalid";
        // Clear longId and validation date if it becomes invalid
        newLongId = null;
        newDateTimeValidated = null;
      } else if (
        remoteStatus === "submitted" ||
        remoteStatus === "inprogress"
      ) {
        newStatus = "pending";
      }
      // else: Keep 'pending' if status is Submitted, InProgress, or unknown

      // Update database only if status, longId, or validation date changed
      if (
        newStatus !== invoice.einvoice_status ||
        newLongId !== invoice.long_id ||
        newDateTimeValidated !== invoice.datetime_validated
      ) {
        await client.query(
          `UPDATE jellypolly.invoices SET
                einvoice_status = $1,
                long_id = $2,
                datetime_validated = $3
              WHERE id = $4`,
          [newStatus, newLongId, newDateTimeValidated, id]
        );
        updated = true;
      }

      res.json({
        success: true,
        message: updated
          ? `Status updated to ${newStatus}.`
          : `Status remains ${newStatus}.`,
        status: newStatus,
        longId: newLongId,
        dateTimeValidated: newDateTimeValidated,
        updated: updated, // Send flag indicating if DB was updated
      });
    } catch (error) {
      console.error(
        `Error updating status for consolidated invoice ${id}:`,
        error.response?.data || error.message || error
      );
      res.status(500).json({
        success: false,
        message: "Failed to update consolidated invoice status.",
        error:
          error.response?.data?.error?.message ||
          error.message ||
          "An unexpected error occurred",
      });
    } finally {
      client.release();
    }
  });

  // Cancel a Valid or Invalid Consolidated Invoice ---
  router.post("/consolidated/:id/cancel", async (req, res) => {
    const { id } = req.params;
    const cancellationReason = req.body.reason || "Cancelled via system"; // Allow providing a reason
    const client = await pool.connect();

    try {
      await client.query("BEGIN"); // Start transaction

      // Fetch the consolidated invoice, ensuring it exists and is consolidated
      const invoiceQuery = `
        SELECT uuid, einvoice_status, consolidated_invoices
        FROM jellypolly.invoices
        WHERE id = $1 AND is_consolidated = true
        FOR UPDATE -- Lock the row
      `;
      const invoiceResult = await client.query(invoiceQuery, [id]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Consolidated invoice not found." });
      }

      const invoice = invoiceResult.rows[0];
      const originalInvoiceIds = invoice.consolidated_invoices; // JSON array string or native array
      const currentStatus = invoice.einvoice_status?.toLowerCase();

      // --- Gatekeeping: Only allow cancelling 'valid' or 'invalid' ---
      if (currentStatus !== "valid" && currentStatus !== "invalid") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `Cannot cancel invoice with status: ${invoice.einvoice_status}. Only 'valid' or 'invalid' invoices can be cancelled.`,
        });
      }

      // --- Step 1: Attempt to cancel with MyInvois API (if UUID exists) ---
      let apiCancellationSuccess = false;
      let apiResponseMessage =
        "MyInvois cancellation not attempted (no UUID or skipped).";

      if (invoice.uuid) {
        try {
          // Use the correct PUT endpoint for cancellation
          await apiClient.makeApiCall(
            "PUT",
            `/api/v1.0/documents/state/${invoice.uuid}/state`,
            { status: "cancelled", reason: cancellationReason } // Send payload
          );
          // Assuming success if no error is thrown. Check response if needed.
          apiCancellationSuccess = true;
          apiResponseMessage = `MyInvois document status set to cancelled.`;
        } catch (apiError) {
          // Log the error but continue with DB cleanup.
          console.warn(
            `Failed to cancel MyInvois document ${invoice.uuid} for invoice ${id}:`,
            apiError.response?.data || apiError.message
          );
          apiResponseMessage = `Failed to set MyInvois document status to cancelled: ${
            apiError.response?.data?.error?.message || apiError.message
          }. Proceeding with local cancellation.`;
          // Do not automatically set apiCancellationSuccess to false here,
          // as the API *might* have processed it despite an error response in some cases.
          // The primary goal is local cleanup.
        }
      } else {
        apiResponseMessage = "Skipped MyInvois cancellation (no UUID).";
      }
      // --- End API Cancellation ---

      // --- Step 2: Local Database Cleanup ---

      // 2a. Update the consolidated invoice status to cancelled
      const updateResult = await client.query(
        "UPDATE jellypolly.invoices SET invoice_status = 'cancelled', einvoice_status = 'cancelled' WHERE id = $1",
        [id]
      );
      if (updateResult.rowCount === 0) {
        // Should not happen due to FOR UPDATE lock, but safety check
        throw new Error(
          `Consolidated invoice ${id} vanished during transaction.`
        );
      }

      // 2b. Mark original invoices as no longer consolidated
      let parsedOriginalIds = [];
      if (typeof originalInvoiceIds === "string") {
        try {
          parsedOriginalIds = JSON.parse(originalInvoiceIds);
        } catch (parseError) {
          console.error(
            `Failed to parse consolidated_invoices JSON for ${id}:`,
            originalInvoiceIds
          );
          // Don't throw error here, just log it, maybe originals can still be found some other way if needed.
          // For now, proceed without updating originals if parse fails.
        }
      } else if (Array.isArray(originalInvoiceIds)) {
        parsedOriginalIds = originalInvoiceIds;
      }

      if (parsedOriginalIds.length > 0) {
        // Reset flags. Reset einvoice_status to null, allowing them to be picked up again.
        const updateOriginalsQuery = `
            UPDATE jellypolly.invoices
            SET is_consolidated = false,
                einvoice_status = null, -- Reset status to allow reprocessing/re-consolidation
                -- Clear other e-invoice related fields tied to the *consolidated* submission
                uuid = null,
                long_id = null,
                submission_uid = null,
                datetime_validated = null
            WHERE id = ANY($1::text[])
            -- Maybe add: AND is_consolidated = true (extra safety?)
          `;
        const updateResult = await client.query(updateOriginalsQuery, [
          parsedOriginalIds,
        ]);
      } else {
        console.warn(
          `Consolidated invoice ${id} had no original invoice IDs listed or failed to parse.`
        );
      }

      // --- End DB Cleanup ---

      await client.query("COMMIT"); // Commit transaction

      res.json({
        success: true,
        message: `Consolidated invoice ${id} cancelled successfully.`,
        apiCancellationAttempted: !!invoice.uuid, // True if we tried
        apiCancellationSuccess: apiCancellationSuccess, // True only if API call didn't throw error
      });
    } catch (error) {
      await client.query("ROLLBACK"); // Rollback on error
      console.error(`Error cancelling consolidated invoice ${id}:`, error);
      res.status(500).json({
        success: false,
        message: "Failed to cancel consolidated invoice.",
        error: error.message || "An unexpected error occurred",
      });
    } finally {
      client.release();
    }
  });

  // Get submission details by UUID
  router.get("/submission/:uuid", async (req, res) => {
    const { uuid } = req.params;
    
    try {
      // Call MyInvois API to get submission details
      const submissionDetails = await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/documents/${uuid}/details`
      );

      res.json({
        success: true,
        data: submissionDetails,
      });
    } catch (error) {
      console.error(`Error fetching submission details for UUID ${uuid}:`, error);
      
      if (error.status === 404) {
        return res.status(404).json({
          success: false,
          message: "Submission not found",
          error: "Document with the specified UUID was not found",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to fetch submission details",
        error: error.message,
      });
    }
  });

  // Clear e-invoice status for an invoice (reset to allow resubmission)
  router.post("/clear-status/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists
      const checkQuery = `
        SELECT id, einvoice_status, invoice_status
        FROM jellypolly.invoices 
        WHERE id = $1
      `;
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }

      const invoice = checkResult.rows[0];

      // Don't allow clearing if invoice is cancelled
      if (invoice.invoice_status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Cannot clear e-invoice status for cancelled invoices",
        });
      }

      // Clear all e-invoice related fields
      const clearQuery = `
        UPDATE jellypolly.invoices 
        SET 
          einvoice_status = NULL,
          uuid = NULL,
          submission_uid = NULL,
          long_id = NULL,
          datetime_validated = NULL
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await client.query(clearQuery, [id]);
      
      await client.query("COMMIT");

      res.json({
        success: true,
        message: "E-invoice status cleared successfully",
        invoice: {
          id: result.rows[0].id,
          einvoice_status: result.rows[0].einvoice_status,
          uuid: result.rows[0].uuid,
          submission_uid: result.rows[0].submission_uid,
          long_id: result.rows[0].long_id,
          datetime_validated: result.rows[0].datetime_validated,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Error clearing e-invoice status for invoice ${id}:`, error);
      res.status(500).json({
        success: false,
        message: "Failed to clear e-invoice status",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}

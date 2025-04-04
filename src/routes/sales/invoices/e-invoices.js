// src/routes/sales/invoices/e-invoice.js
import { EInvoiceTemplate } from "../../../utils/invoice/einvoice/EInvoiceTemplate.js";
import { Router } from "express";
import { createHash } from "crypto";
import EInvoiceSubmissionHandler from "../../../utils/invoice/einvoice/EInvoiceSubmissionHandler.js";
import EInvoiceApiClientFactory from "../../../utils/invoice/einvoice/EInvoiceApiClientFactory.js";
import { EInvoiceConsolidatedTemplate } from "../../../utils/invoice/einvoice/EInvoiceConsolidatedTemplate.js";

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
          invoices i
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
          order_details od
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
  const apiClient = EInvoiceApiClientFactory.getInstance(config);
  const submissionHandler = new EInvoiceSubmissionHandler(apiClient);

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
      const isMinimal = req.query.fields === "minimal";

      if (!invoiceIds?.length) {
        return res.status(400).json({
          success: false,
          message: "No invoice IDs provided for submission",
        });
      }

      // STEP 1: Check for invoices that already have a long_id (already processed successfully)
      const validatedQuery = `
      SELECT id, uuid, long_id, einvoice_status 
      FROM invoices 
      WHERE id = ANY($1) AND long_id IS NOT NULL AND long_id != ''
      `;
      const validatedResult = await pool.query(validatedQuery, [invoiceIds]);
      const alreadyValidatedInvoices = validatedResult.rows;

      // Track already processed invoices to skip
      const alreadyProcessed = alreadyValidatedInvoices.map((invoice) => ({
        id: invoice.id,
        uuid: invoice.uuid,
        longId: invoice.long_id,
        status: invoice.einvoice_status,
      }));

      // STEP 2: Identify and process any pending invoices next
      const pendingQuery = `
      SELECT id, uuid, submission_uid 
      FROM invoices 
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
              `UPDATE invoices SET 
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
        if (isMinimal) {
          // Construct minimal format response
          const minimalInvoices = [
            ...alreadyProcessed,
            ...statusUpdateResults.updated,
          ].map((invoice) => {
            let einvoiceStatus = 20; // Default: Not Processed

            if (invoice.status === "valid" || invoice.longId) {
              einvoiceStatus = 0; // Valid
            } else if (invoice.status === "pending") {
              einvoiceStatus = 10; // Pending
            }

            return {
              id: invoice.id,
              systemStatus: 0, // Success
              einvoiceStatus,
              uuid: invoice.uuid,
              longId: invoice.longId || undefined,
            };
          });

          // Add failed updates with error code 103
          statusUpdateResults.failed.forEach((failed) => {
            minimalInvoices.push({
              id: failed.id,
              systemStatus: 0, // DB success
              einvoiceStatus: 103, // Other error
              error: {
                code: "STATUS_CHECK_ERROR",
                message: failed.error || "Failed to check e-invoice status",
              },
            });
          });

          return res.status(200).json({
            message: "All invoices were already processed or have been updated",
            invoices: [...minimalInvoices],
            overallStatus: "Success",
          });
        } else {
          // Standard format
          return res.status(200).json({
            success: true,
            message: "All invoices were already processed or have been updated",
            pendingUpdated: statusUpdateResults.updated,
            pendingFailed: statusUpdateResults.failed,
            overallStatus: "Success",
          });
        }
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

          const transformedInvoice = await EInvoiceTemplate(
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
        if (isMinimal) {
          // Construct minimal response for validation errors
          const minimalResponse = validationErrors.map((err) => {
            // Determine error status code
            let einvoiceStatus = 100; // Default error
            const errorMessage = err.error.message.toLowerCase();
            const errorCode = err.error.code.toLowerCase();

            if (
              errorMessage.includes("tin") ||
              errorCode.includes("tin") ||
              errorMessage.includes("id number")
            ) {
              einvoiceStatus = 101; // Missing TIN/ID
            } else if (
              errorMessage.includes("duplicate") ||
              errorCode.includes("duplicate")
            ) {
              einvoiceStatus = 102; // Duplicate
            }

            return {
              id: err.internalId,
              systemStatus: 100, // Error
              einvoiceStatus,
              error: {
                code: err.error.code,
                message: err.error.message,
              },
            };
          });

          // Include any already processed and updated invoices
          const alreadyHandled = [
            ...alreadyProcessed,
            ...statusUpdateResults.updated,
          ].map((inv) => ({
            id: inv.id,
            systemStatus: 0,
            einvoiceStatus: inv.status === "valid" || inv.longId ? 0 : 10,
            uuid: inv.uuid,
            longId: inv.longId || undefined,
          }));

          return res.status(422).json({
            message: "Validation failed for submitted documents",
            ...alreadyHandled,
            ...minimalResponse,
            overallStatus: "Invalid",
          });
        } else {
          return res.status(422).json({
            success: false,
            message: "Validation failed for submitted documents",
            shouldStopAtValidation: true,
            rejectedDocuments: validationErrors,
            pendingUpdated: statusUpdateResults.updated,
            overallStatus: "Invalid",
          });
        }
      }

      // Handle no valid invoices
      if (transformedInvoices.length === 0) {
        if (isMinimal) {
          // Similar to above, but different status code
          const minimalResponse = validationErrors.map((err) => {
            let einvoiceStatus = 100;
            const errorMessage = err.error.message.toLowerCase();
            const errorCode = err.error.code.toLowerCase();

            if (
              errorMessage.includes("tin") ||
              errorCode.includes("tin") ||
              errorMessage.includes("id number")
            ) {
              einvoiceStatus = 101;
            } else if (
              errorMessage.includes("duplicate") ||
              errorCode.includes("duplicate")
            ) {
              einvoiceStatus = 102;
            }

            return {
              id: err.internalId,
              systemStatus: 100,
              einvoiceStatus,
              error: {
                code: err.error.code,
                message: err.error.message,
              },
            };
          });

          const alreadyHandled = [
            ...alreadyProcessed,
            ...statusUpdateResults.updated,
          ].map((inv) => ({
            id: inv.id,
            systemStatus: 0,
            einvoiceStatus: inv.status === "valid" || inv.longId ? 0 : 10,
            uuid: inv.uuid,
            longId: inv.longId || undefined,
          }));

          return res.status(400).json({
            message: "No valid invoices to process",
            ...alreadyHandled,
            ...minimalResponse,
            overallStatus: "Invalid",
          });
        } else {
          return res.status(400).json({
            success: false,
            message: "No valid invoices to process",
            shouldStopAtValidation: true,
            rejectedDocuments: validationErrors,
            pendingUpdated: statusUpdateResults.updated,
            overallStatus: "Invalid",
          });
        }
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
                `UPDATE invoices SET 
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
                  `UPDATE invoices SET einvoice_status = 'invalid' WHERE id = $1`,
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

      // Prepare response based on format requested
      if (isMinimal) {
        // Map submitted invoice results to minimal format
        const allInvoices = [
          ...invoiceIdsToProcess,
          ...alreadyValidatedInvoices.map((inv) => inv.id),
          ...statusUpdateResults.updated.map((upd) => upd.id),
        ];

        const minimalInvoices = allInvoices.map((id) => {
          // First check if it was an already validated invoice
          const alreadyValid = alreadyValidatedInvoices.find(
            (inv) => inv.id === id
          );
          if (alreadyValid) {
            return {
              id,
              systemStatus: 0, // Success
              einvoiceStatus: 0, // Valid
              uuid: alreadyValid.uuid,
              longId: alreadyValid.long_id,
            };
          }

          // Check if it was a pending invoice that got updated
          const updatedPending = statusUpdateResults.updated.find(
            (upd) => upd.id === id
          );
          if (updatedPending) {
            return {
              id,
              systemStatus: 0, // Success
              einvoiceStatus: updatedPending.status === "valid" ? 0 : 10,
              uuid: updatedPending.uuid,
              longId: updatedPending.longId,
            };
          }

          // Check if it was a failed pending check
          const failedPending = statusUpdateResults.failed.find(
            (fail) => fail.id === id
          );
          if (failedPending) {
            return {
              id,
              systemStatus: 0, // DB success
              einvoiceStatus: 103, // Other error
              error: {
                code: "STATUS_CHECK_ERROR",
                message: failedPending.error,
              },
            };
          }

          // Check if it was newly accepted
          const accepted = submissionResult.acceptedDocuments?.find(
            (doc) => doc.internalId === id
          );
          if (accepted) {
            return {
              id,
              systemStatus: 0, // Success
              einvoiceStatus: accepted.longId ? 0 : 10, // Valid or Pending
              uuid: accepted.uuid,
              longId: accepted.longId || undefined,
            };
          }

          // Check if it was rejected
          const rejected = submissionResult.rejectedDocuments?.find(
            (doc) => doc.internalId === id || doc.invoiceCodeNumber === id
          );
          if (rejected) {
            let einvoiceStatus = 100; // Default error
            const errorMessage = (rejected.error?.message || "").toLowerCase();
            const errorCode = (rejected.error?.code || "").toLowerCase();

            if (
              errorMessage.includes("tin") ||
              errorCode.includes("tin") ||
              errorMessage.includes("id number")
            ) {
              einvoiceStatus = 101; // Missing TIN
            } else if (
              errorMessage.includes("duplicate") ||
              errorCode.includes("duplicate")
            ) {
              einvoiceStatus = 102; // Duplicate
            }

            return {
              id,
              systemStatus: 0, // DB success
              einvoiceStatus,
              error: {
                code: rejected.error?.code || "EINVOICE_ERROR",
                message: rejected.error?.message || "E-invoice error",
              },
            };
          }

          // Default case - shouldn't happen but handle gracefully
          return {
            id,
            systemStatus: 100, // Error
            einvoiceStatus: 20, // Not processed
            error: {
              code: "UNKNOWN_ERROR",
              message: "Invoice processing status unknown",
            },
          };
        });

        return res.status(statusCode).json({
          message: submissionResult.message || "E-invoice processing completed",
          invoices: minimalInvoices,
          overallStatus: submissionResult.overallStatus,
        });
      } else {
        // Standard response format
        return res.status(statusCode).json({
          ...submissionResult,
          pendingUpdated: statusUpdateResults.updated,
          pendingFailed: statusUpdateResults.failed,
        });
      }
    } catch (error) {
      console.error("Submission error:", error);

      // Check for specific error codes like 422 (duplicate payload)
      if (error.status === 422) {
        if (req.query.fields === "minimal") {
          return res.status(422).json({
            message: "Duplicate submission detected",
            invoices: invoiceIds.map((id) => ({
              id,
              systemStatus: 100, // Error
              einvoiceStatus: 102, // Duplicate
              error: {
                code: "DUPLICATE_PAYLOAD",
                message: "Duplicated submission",
              },
            })),
            overallStatus: "Invalid",
          });
        } else {
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
      }

      // Original error handling
      if (req.query.fields === "minimal") {
        return res.status(500).json({
          message: error.message || "Failed to process batch submission",
          invoices: (req.body.invoiceIds || []).map((id) => ({
            id,
            systemStatus: 100, // Error
            einvoiceStatus: 103, // Other error
            error: {
              code: error.code || "SYSTEM_ERROR",
              message: error.message || "Unknown error occurred",
            },
          })),
          overallStatus: "Error",
        });
      } else {
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
    }
  });

  // Fetch submission details by UUID and update missing longId
  router.get("/submission/:uuid", async (req, res) => {
    const { uuid } = req.params;

    if (!uuid) {
      return res.status(400).json({
        success: false,
        message: "UUID is required",
      });
    }

    try {
      // Call the MyInvois API to get document details
      const documentDetails = await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/documents/${uuid}/details`
      );

      // Filter down to only the fields we need
      const filteredResponse = {
        uuid: documentDetails.uuid,
        longId: documentDetails.longId || "",
        dateTimeValidated: documentDetails.dateTimeValidated || null,
        status:
          documentDetails.status === "Submitted"
            ? "Valid"
            : documentDetails.status,
      };

      // Update our database if we have new information (particularly the longId)
      if (documentDetails.longId) {
        try {
          const dbResult = await pool.query(
            `UPDATE invoices 
           SET long_id = $1, datetime_validated = $2, einvoice_status = $3
           WHERE uuid = $4 AND (long_id IS NULL OR long_id = '')
           RETURNING *`,
            [
              documentDetails.longId,
              documentDetails.dateTimeValidated,
              "valid",
              uuid,
            ]
          );

          console.log(`Updated invoice record for UUID ${uuid}`);
        } catch (dbError) {
          console.error("Error updating invoice record:", dbError);
          // Continue with the response even if DB update fails
        }
      }

      return res.status(200).json({
        // OK for successful status check
        success: true,
        data: filteredResponse,
      });
    } catch (error) {
      console.error("Error fetching document details:", error);

      // Check for specific error responses from the MyInvois API
      if (error.status === 404) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
          error: "The requested document does not exist or is not accessible",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to fetch document details",
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

      const query = `
      SELECT 
        i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype, 
        i.total_excluding_tax as amount, i.rounding, i.totalamountpayable,
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
      FROM invoices i
      LEFT JOIN order_details od ON i.id = od.invoiceid
      WHERE (CAST(i.createddate AS bigint) >= $1 AND CAST(i.createddate AS bigint) < $2)
      AND (i.einvoice_status IS NULL OR i.einvoice_status = 'invalid')
      AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM invoices consolidated 
        WHERE consolidated.is_consolidated = true
        AND consolidated.consolidated_invoices IS NOT NULL
        AND consolidated.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
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
        rounding: parseFloat(row.rounding) || 0,
        totalamountpayable: parseFloat(row.totalamountpayable) || 0,
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
      for (const invoiceId of invoiceIds) {
        try {
          const invoice = await getInvoices(pool, invoiceId);
          if (invoice) {
            invoiceData.push(invoice);
            totalRounding += Number(invoice.rounding || 0);
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
      const consolidatedXml = await EInvoiceConsolidatedTemplate(
        invoiceData,
        month,
        year
      );

      // Create a consolidated invoice document for submission
      const consolidatedId = `CON-${year}${String(parseInt(month) + 1).padStart(
        2,
        "0"
      )}`;

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

        // Mark the original invoices as consolidated
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Insert consolidated record
          await client.query(
            `INSERT INTO invoices (
              id, uuid, submission_uid, long_id, datetime_validated,
              total_excluding_tax, tax_amount, rounding, totalamountpayable,
              invoice_status, einvoice_status, is_consolidated, consolidated_invoices,
              customerid, salespersonid, createddate, paymenttype
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
              consolidatedId,
              consolidatedData.uuid,
              submissionResponse.submissionUid,
              consolidatedData.longId,
              consolidatedData.dateTimeValidated || new Date().toISOString(),
              consolidatedData.totalExcludingTax || 0,
              consolidatedData.totalPayableAmount -
                consolidatedData.totalExcludingTax -
                totalRounding || 0,
              totalRounding,
              consolidatedData.totalPayableAmount || 0,
              "paid", // Consolidated invoices are typically marked as paid
              consolidatedData.longId ? "valid" : "pending",
              true,
              JSON.stringify(invoiceIds),
              "EI00000000010", // Default consolidated customer ID
              "SYSTEM", // System-generated invoice
              new Date().getTime().toString(), // Current timestamp
              "INVOICE", // Consolidated invoices are always INVOICE type
            ]
          );

          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          console.error("Failed to record consolidated invoice:", error);
        } finally {
          client.release();
        }

        // Return success with details, including pending status
        return res.json({
          success: true,
          message: isPending
            ? "Consolidated invoice submitted, but is still pending"
            : "Consolidated invoice submitted successfully",
          submissionUid: submissionResponse.submissionUid,
          consolidatedId,
          uuid: consolidatedData.uuid,
          longId: consolidatedData.longId || "",
          isPending,
          status: consolidatedData.status,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Submission failed",
          errors: submissionResponse.rejectedDocuments,
        });
      }
    } catch (error) {
      console.error("Consolidated submission error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to process consolidated submission",
      });
    }
  });

  return router;
}

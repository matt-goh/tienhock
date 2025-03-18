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

// Helper function to insert accepted documents
const insertAcceptedDocuments = async (
  pool,
  documents,
  originalInvoices = {}
) => {
  const query = `
    INSERT INTO einvoices (
      uuid, submission_uid, long_id, internal_id, type_name, 
      receiver_id, receiver_name, datetime_validated,
      total_payable_amount, total_excluding_tax, total_net_amount, total_rounding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const doc of documents) {
      // Convert internalId to string to ensure consistent key lookup
      const internalIdKey = String(doc.internalId);

      // Get rounding from original invoice - ensure it's a number
      const rounding = parseFloat(originalInvoices[internalIdKey] || 0);

      // Add a default datetime_validated if missing
      const datetime_validated =
        doc.dateTimeValidated || new Date().toISOString();

      await client.query(query, [
        doc.uuid,
        doc.submissionUid,
        doc.longId,
        doc.internalId,
        doc.typeName,
        doc.receiverId,
        doc.receiverName,
        datetime_validated,
        doc.totalPayableAmount,
        doc.totalExcludingTax,
        doc.totalNetAmount,
        rounding, // Explicitly converted rounding value
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

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
          i.amount,
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

  router.get("/eligible-for-submission", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      // Default to last 3 days if dates aren't provided
      if (!startDate || !endDate) {
        const endDateTime = new Date();
        endDateTime.setHours(23, 59, 59, 999);

        const startDateTime = new Date();
        startDateTime.setDate(startDateTime.getDate() - 2); // Last 3 days (including today)
        startDateTime.setHours(0, 0, 0, 0);

        endDate = endDateTime.getTime().toString();
        startDate = startDateTime.getTime().toString();
      }

      let query = `
        SELECT 
          i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype, 
          i.amount, i.rounding, i.totalamountpayable
        FROM invoices i
        LEFT JOIN einvoices e ON CAST(i.id AS TEXT) = e.internal_id
        WHERE 1=1
        AND e.internal_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM einvoices e2, jsonb_array_elements_text(e2.consolidated_invoices::jsonb) AS invoice_id
          WHERE e2.consolidated_invoices IS NOT NULL 
          AND invoice_id = i.id::text
        )
      `;

      const queryParams = [];
      let paramCounter = 1;

      if (startDate && endDate) {
        queryParams.push(startDate, endDate);
        query += ` AND CAST(i.createddate AS bigint) BETWEEN CAST($${paramCounter} AS bigint) AND CAST($${
          paramCounter + 1
        } AS bigint)`;
        paramCounter += 2;
      }

      query += ` ORDER BY i.createddate DESC`;

      const result = await pool.query(query, queryParams);

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

  // Submit invoice to MyInvois
  router.post("/submit", async (req, res) => {
    // Extract fields query parameter
    const fieldsParam = req.query.fields;
    const isMinimal = fieldsParam === "minimal";

    try {
      const { invoiceIds } = req.body;

      if (!invoiceIds?.length) {
        return res.status(400).json({
          success: false,
          message: "No invoice IDs provided for submission",
        });
      }

      const transformedInvoices = [];
      const validationErrors = [];
      const invoiceRoundings = {};

      // Check for duplicates first
      for (const invoiceId of invoiceIds) {
        try {
          // Make a direct query to check for duplicates
          const duplicateCheckResult = await pool.query(
            "SELECT COUNT(*) FROM einvoices WHERE internal_id = $1",
            [invoiceId]
          );
          const isDuplicate = parseInt(duplicateCheckResult.rows[0].count) > 0;

          if (isDuplicate) {
            validationErrors.push({
              internalId: invoiceId,
              error: {
                code: "DUPLICATE",
                message: `Invoice number ${invoiceId} already exists in the system`,
                target: invoiceId,
                details: [
                  {
                    code: "DUPLICATE_INVOICE",
                    message: "Duplicate invoice number found",
                    target: "document",
                  },
                ],
              },
            });
            continue; // Skip processing this invoice
          }

          // If not a duplicate, process the invoice
          const invoiceData = await getInvoices(pool, invoiceId);
          if (!invoiceData) {
            throw new Error(`Invoice with ID ${invoiceId} not found`);
          }

          // Store the rounding value for this invoice
          invoiceRoundings[invoiceId] = invoiceData.rounding || 0;

          const customerData = await fetchCustomerData(
            pool,
            invoiceData.customerid
          );

          if (!customerData.tin_number || !customerData.id_number) {
            validationErrors.push({
              internalId: invoiceId,
              error: {
                code: "MISSING_REQUIRED_ID",
                message: `Missing TIN Number or ID Number for customer ${
                  customerData.name || "unknown"
                }`,
                target: invoiceId,
                details: [
                  {
                    code: "MISSING_REQUIRED_ID",
                    message: `Customer ${
                      customerData.name || "unknown"
                    } must have both TIN Number and ID Number defined in the system.`,
                    target: "document",
                  },
                ],
              },
            });
            continue; // Skip processing this invoice
          }

          const transformedInvoice = await EInvoiceTemplate(
            invoiceData,
            customerData
          );
          transformedInvoices.push(transformedInvoice);
        } catch (error) {
          // Handle validation errors as before
          const errorDetails = error.details || [];
          validationErrors.push({
            internalId: error.id || invoiceId,
            error: {
              code: error.code || "2",
              message: "Validation Error",
              target: error.id || invoiceId,
              details:
                errorDetails.length > 0
                  ? errorDetails
                  : [
                      {
                        code: error.code || "CF001",
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
        return res.status(400).json({
          success: false,
          message: "Validation failed for submitted documents",
          shouldStopAtValidation: true,
          rejectedDocuments: validationErrors,
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

      // Add accepted documents to database
      if (
        submissionResult.success &&
        submissionResult.acceptedDocuments?.length > 0
      ) {
        await insertAcceptedDocuments(
          pool,
          submissionResult.acceptedDocuments,
          invoiceRoundings
        );
      }

      // If minimal response is requested, transform the result
      if (isMinimal) {
        const invoices = [];

        // Process accepted documents
        if (
          submissionResult.acceptedDocuments &&
          submissionResult.acceptedDocuments.length > 0
        ) {
          for (const doc of submissionResult.acceptedDocuments) {
            const invoiceData = {
              id: doc.internalId,
              uuid: doc.uuid,
              longId: doc.longId || "",
              dateTimeValidated: doc.dateTimeValidated || null,
            };

            // If longId is missing, mark status as Pending
            if (!doc.longId) {
              invoiceData.einvoiceStatus = 10; // Pending = 10 (success variant)
            } else {
              invoiceData.einvoiceStatus = 0; // Valid = 0 (complete success)
            }

            invoices.push(invoiceData);
          }
        }

        // Process rejected documents
        if (
          submissionResult.rejectedDocuments &&
          submissionResult.rejectedDocuments.length > 0
        ) {
          for (const doc of submissionResult.rejectedDocuments) {
            invoices.push({
              id: doc.internalId || doc.invoiceCodeNumber,
              einvoiceStatus: 100, // Invalid = 100 (error)
              error: {
                code: doc.error?.code || "ERROR",
                message: doc.error?.message || "Unknown error",
              },
            });
          }
        }

        return res.json({
          message: "Invoice processing completed",
          invoices: invoices,
          overallStatus: submissionResult.overallStatus || "Unknown",
        });
      }

      // Return full response
      return res.json(submissionResult);
    } catch (error) {
      console.error("Submission error:", error);
      // Check specifically for 422 error code (duplicate payload)
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
                    message: error.response.error,
                  },
                ],
              },
            },
          ],
          overallStatus: "Invalid",
        });
      }

      // Original error handling
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
            `UPDATE einvoices 
             SET long_id = $1, datetime_validated = $2
             WHERE uuid = $3 AND (long_id IS NULL OR long_id = '')
             RETURNING *`,
            [documentDetails.longId, documentDetails.dateTimeValidated, uuid]
          );

          console.log(
            `Updated einvoice record for UUID ${uuid}: ${dbResult.rowCount} rows affected`
          );
        } catch (dbError) {
          console.error("Error updating einvoice record:", dbError);
          // Continue with the response even if DB update fails
        }
      }

      return res.json({
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

  // Get all submitted e-invoices
  router.get("/list", async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 25;
      const offset = (page - 1) * limit;
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;

      let query = "SELECT * FROM einvoices WHERE 1=1";
      const params = [];

      if (startDate) {
        params.push(new Date(startDate));
        query += ` AND datetime_validated >= $${params.length}`;
      }

      if (endDate) {
        params.push(new Date(endDate));
        query += ` AND datetime_validated < $${params.length}`;
      }

      const countQuery = query.replace("SELECT *", "SELECT COUNT(*)");
      query += ` ORDER BY datetime_validated DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, params.slice(0, -2)),
        pool.query(query, params),
      ]);

      res.json({
        data: dataResult.rows,
        total: parseInt(countResult.rows[0].count),
      });
    } catch (error) {
      console.error("Failed to fetch e-invoices:", error);
      res.status(500).json({ error: "Failed to fetch e-invoices" });
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

      // REPLACE this query with the modified version:
      const query = `
        SELECT 
          i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype, 
          i.amount, i.rounding, i.totalamountpayable,
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
              ORDER BY od.id  -- Maintain order of products and subtotals
            ) FILTER (WHERE od.id IS NOT NULL),
            '[]'::json
          ) as products
        FROM invoices i
        LEFT JOIN order_details od ON i.id = od.invoiceid
        LEFT JOIN einvoices e ON CAST(i.id AS TEXT) = e.internal_id
        WHERE (CAST(i.createddate AS bigint) >= $1 AND CAST(i.createddate AS bigint) < $2)
        AND e.internal_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM einvoices e2, jsonb_array_elements_text(e2.consolidated_invoices::jsonb) AS invoice_id
          WHERE e2.consolidated_invoices IS NOT NULL 
          AND invoice_id = i.id::text
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

        // Mark the original invoices as consolidated
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Insert consolidated record
          await client.query(
            `INSERT INTO einvoices (
              uuid, submission_uid, long_id, internal_id, type_name, 
              receiver_id, receiver_name, datetime_validated,
              total_payable_amount, total_excluding_tax, total_net_amount,
              is_consolidated, consolidated_invoices, total_rounding
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              consolidatedData.uuid,
              submissionResponse.submissionUid,
              consolidatedData.longId,
              consolidatedId,
              consolidatedData.typeName || "Consolidated Invoice",
              "EI00000000010",
              "Consolidated Buyers",
              consolidatedData.dateTimeValidated || new Date().toISOString(),
              consolidatedData.totalPayableAmount,
              consolidatedData.totalExcludingTax,
              consolidatedData.totalNetAmount,
              true,
              JSON.stringify(invoiceIds),
              totalRounding,
            ]
          );

          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          console.error("Failed to record consolidated invoice:", error);
        } finally {
          client.release();
        }

        // Return success with details
        return res.json({
          success: true,
          message: "Consolidated invoice submitted successfully",
          submissionUid: submissionResponse.submissionUid,
          consolidatedId,
          uuid: consolidatedData.uuid,
          longId: consolidatedData.longId,
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

  // Delete e-invoice by UUID
  router.delete("/:uuid", async (req, res) => {
    const { uuid } = req.params;

    try {
      // Check if the e-invoice exists before attempting to delete
      const checkQuery = "SELECT uuid FROM einvoices WHERE uuid = $1";
      const checkResult = await pool.query(checkQuery, [uuid]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "E-invoice not found" });
      }

      // First, try to cancel the invoice in MyInvois
      try {
        await apiClient.makeApiCall(
          "PUT",
          `/api/v1.0/documents/state/${uuid}/state`,
          {
            status: "cancelled",
            reason: "Wrong submission",
          }
        );
      } catch (cancelError) {
        console.error("Error cancelling e-invoice in MyInvois:", cancelError);

        // Handle specific error cases from MyInvois API
        if (
          cancelError.status === 400 &&
          cancelError.response?.error?.code === "OperationPeriodOver"
        ) {
          return res.status(400).json({
            message: "The time limit for cancellation has expired",
          });
        }

        return res.status(500).json({
          message: "Failed to cancel e-invoice in MyInvois",
          error: cancelError.message,
        });
      }

      // If cancellation was successful, delete locally
      const deleteQuery = "DELETE FROM einvoices WHERE uuid = $1 RETURNING *";
      const result = await pool.query(deleteQuery, [uuid]);

      res.json({
        message: "E-invoice cancelled and deleted successfully",
        einvoice: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting e-invoice:", error);
      res.status(500).json({
        message: "Error deleting e-invoice",
        error: error.message,
      });
    }
  });

  return router;
}

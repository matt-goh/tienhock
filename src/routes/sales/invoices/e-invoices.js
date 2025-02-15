// src/routes/sales/invoices/e-invoice.js
import { transformInvoiceToMyInvoisFormat } from "../../../utils/invoice/einvoice/transformInvoiceData.js";
import { fetchInvoiceFromDb } from "./helpers.js";
import { Router } from "express";
import DocumentSubmissionHandler from "../../../utils/invoice/einvoice/documentSubmissionHandler.js";
import EInvoiceApiClient from "../../../utils/invoice/einvoice/EInvoiceApiClient.js";

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
async function insertAcceptedDocuments(pool, documents) {
  const query = `
    INSERT INTO einvoices (
      uuid, submission_uid, long_id, internal_id, type_name, 
      receiver_id, receiver_name, datetime_validated,
      total_payable_amount, total_excluding_tax, total_net_amount
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const doc of documents) {
      await client.query(query, [
        doc.uuid,
        doc.submissionUid,
        doc.longId,
        doc.internalId,
        doc.typeName,
        doc.receiverId,
        doc.receiverName,
        doc.dateTimeValidated,
        doc.totalPayableAmount,
        doc.totalExcludingTax,
        doc.totalNetAmount,
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default function (pool, config) {
  const router = Router();
  const apiClient = new EInvoiceApiClient(
    config.MYINVOIS_API_BASE_URL,
    config.MYINVOIS_CLIENT_ID,
    config.MYINVOIS_CLIENT_SECRET
  );
  const submissionHandler = new DocumentSubmissionHandler(apiClient);

  // Login/token endpoint
  router.post("/login", async (req, res) => {
    try {
      console.log(
        "Attempting to connect to:",
        `${config.MYINVOIS_API_BASE_URL}/connect/token`
      );
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

  // Submit invoice to MyInvois
  router.post("/submit", async (req, res) => {
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

      // Process invoices
      for (const invoiceId of invoiceIds) {
        try {
          const invoiceData = await fetchInvoiceFromDb(pool, invoiceId);
          if (!invoiceData) {
            throw new Error(`Invoice with ID ${invoiceId} not found`);
          }

          const customerData = await fetchCustomerData(
            pool,
            invoiceData.customer
          );
          const transformedInvoice = await transformInvoiceToMyInvoisFormat(
            invoiceData,
            customerData
          );
          transformedInvoices.push(transformedInvoice);
        } catch (error) {
          // Handle validation errors from transformInvoiceToMyInvoisFormat
          const errorDetails = error.details || [];
          validationErrors.push({
            invoiceCodeNumber: error.invoiceNo || invoiceId,
            error: {
              code: error.code || "2",
              message: "Validation Error",
              target: error.invoiceNo || invoiceId,
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

      // If there are any validation errors, return them
      if (validationErrors.length > 0) {
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

      // Add accepted documents to database
      if (
        submissionResult.success &&
        submissionResult.acceptedDocuments?.length > 0
      ) {
        await insertAcceptedDocuments(pool, submissionResult.acceptedDocuments);
      }

      return res.json(submissionResult);
    } catch (error) {
      console.error("Submission error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to process batch submission",
        shouldStopAtValidation: true,
        rejectedDocuments: [
          {
            invoiceCodeNumber: error.invoiceNo || "unknown",
            error: {
              code: error.code || "2",
              message: error.message || "Unknown error occurred",
              details: error.details || [],
            },
          },
        ],
        overallStatus: "Invalid",
      });
    }
  });

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

  return router;
}

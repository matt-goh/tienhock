// src/routes/sales/invoices/e-invoice.js
import { EInvoiceTemplate } from "../../../utils/invoice/einvoice/EInvoiceTemplate.js";
import { Router } from "express";
import EInvoiceSubmissionHandler from "../../../utils/invoice/einvoice/EInvoiceSubmissionHandler.js";
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
  const apiClient = new EInvoiceApiClient(
    config.MYINVOIS_API_BASE_URL,
    config.MYINVOIS_CLIENT_ID,
    config.MYINVOIS_CLIENT_SECRET
  );
  const submissionHandler = new EInvoiceSubmissionHandler(apiClient);

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
              invoiceCodeNumber: invoiceId,
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
          // Handle validation errors as before
          const errorDetails = error.details || [];
          validationErrors.push({
            invoiceCodeNumber: error.id || invoiceId,
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
            invoiceCodeNumber:
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

      // Delete the e-invoice
      const deleteQuery = "DELETE FROM einvoices WHERE uuid = $1 RETURNING *";
      const result = await pool.query(deleteQuery, [uuid]);

      res.json({
        message: "E-invoice deleted successfully",
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

// src/routes/sales/invoices/e-invoice.js
import { transformInvoiceToMyInvoisFormat } from "../../../pages/Invois/utils/transformInvoiceData.js";
import { fetchInvoiceFromDb } from "./helpers.js";
import { Router } from "express";
import DocumentSubmissionHandler from "../../../pages/Invois/utils/documentSubmissionHandler.js";
import EInvoiceApiClient from "../../../pages/Invois/utils/EInvoiceApiClient.js";

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
          validationErrors.push({
            invoiceCodeNumber: error.invoiceNo || invoiceId,
            status: "REJECTED",
            error: {
              code: error.code || "VALIDATION_ERROR",
              message: error.message || error.toString(),
            },
          });
        }
      }

      // Handle validation errors
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
          rejectedDocuments: [],
          overallStatus: "Invalid",
        });
      }

      // Submit valid invoices
      const submissionResult = await submissionHandler.submitAndPollDocuments(
        transformedInvoices
      );
      return res.json(submissionResult);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to process batch submission",
        shouldStopAtValidation: true,
        rejectedDocuments: [],
        overallStatus: "Invalid",
      });
    }
  });

  return router;
}

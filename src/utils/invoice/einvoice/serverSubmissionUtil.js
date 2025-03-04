// src/utils/invoice/einvoice/serverSubmissionUtil.js
import { ensureValidToken } from "./myInvoisAuthUtil.js";
import { EInvoiceTemplate } from "./EInvoiceTemplate.js";
import EInvoiceSubmissionHandler from "./EInvoiceSubmissionHandler.js";
import EInvoiceApiClient from "./EInvoiceApiClient.js";

/**
 * Submits invoices to MyInvois API
 * @param {Object} config - MyInvois configuration (API URL, client ID, client secret)
 * @param {Array} invoices - Array of invoice data to submit
 * @param {Function} getCustomerData - Function to fetch customer data for an invoice
 * @returns {Promise<Object>} - Submission results
 */
export async function submitInvoicesToMyInvois(
  config,
  invoices,
  getCustomerData
) {
  // Create API client
  const apiClient = new EInvoiceApiClient(
    config.MYINVOIS_API_BASE_URL,
    config.MYINVOIS_CLIENT_ID,
    config.MYINVOIS_CLIENT_SECRET
  );

  // Ensure we have a valid token
  await ensureValidToken(apiClient);

  // Create submission handler
  const submissionHandler = new EInvoiceSubmissionHandler(apiClient);

  // Transform invoices to XML format
  const transformedInvoices = [];
  const validationErrors = [];

  for (const invoice of invoices) {
    try {
      const customerData = await getCustomerData(invoice.customerid);
      if (!customerData) {
        throw {
          type: "validation",
          code: "CUSTOMER_NOT_FOUND",
          message: `Customer data not found for invoice ${invoice.id}`,
          invoiceNo: invoice.id,
        };
      }

      const transformedInvoice = await EInvoiceTemplate(invoice, customerData);
      transformedInvoices.push(transformedInvoice);
    } catch (error) {
      validationErrors.push({
        invoiceCodeNumber: error.invoiceNo || invoice.id,
        error: {
          code: error.code || "VALIDATION_ERROR",
          message: error.message || "Validation error",
          details: error.details || [],
        },
      });
    }
  }

  // If all invoices failed validation, return early
  if (transformedInvoices.length === 0 && validationErrors.length > 0) {
    return {
      success: false,
      message: "All invoices failed validation",
      rejectedDocuments: validationErrors,
      acceptedDocuments: [],
      overallStatus: "Invalid",
    };
  }

  // Submit valid invoices
  if (transformedInvoices.length > 0) {
    try {
      const result = await submissionHandler.submitAndPollDocuments(
        transformedInvoices
      );

      // Include validation errors with submission results
      if (validationErrors.length > 0) {
        result.rejectedDocuments = [
          ...result.rejectedDocuments,
          ...validationErrors,
        ];
        result.overallStatus = "Partial";
      }

      return result;
    } catch (error) {
      console.error("Error during MyInvois submission:", error);
      return {
        success: false,
        message: error.message || "Failed to submit to MyInvois API",
        rejectedDocuments: [
          ...validationErrors,
          ...invoices.map((invoice) => ({
            invoiceCodeNumber: invoice.id,
            error: {
              code: "SUBMISSION_ERROR",
              message: error.message || "Error during submission",
            },
          })),
        ],
        acceptedDocuments: [],
        overallStatus: "Invalid",
      };
    }
  }

  // Should never reach here if proper validation is in place
  return {
    success: false,
    message: "No invoices to submit",
    rejectedDocuments: validationErrors,
    acceptedDocuments: [],
    overallStatus: "Invalid",
  };
}

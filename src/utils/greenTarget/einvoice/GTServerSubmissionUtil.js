// src/utils/greenTarget/einvoice/GTServerSubmissionUtil.js
import { ensureValidToken } from "./GTMyInvoisAuthUtil.js";
import { GTEInvoiceTemplate } from "./GTEInvoiceTemplate.js";
import GTEInvoiceSubmissionHandler from "./GTEInvoiceSubmissionHandler.js";
import GTEInvoiceApiClientFactory from "./GTEInvoiceApiClientFactory.js";

/**
 * Submits a single invoice to MyInvois API
 * @param {Object} config - MyInvois configuration (API URL, client ID, client secret)
 * @param {Object} invoice - Invoice data to submit
 * @param {Object} customerData - Customer data for the invoice
 * @returns {Promise<Object>} - Submission result
 */
export async function submitInvoiceToMyInvois(config, invoice, customerData) {
  // Create API client
  const apiClient = GTEInvoiceApiClientFactory.getInstance(config);

  // Ensure we have a valid token
  await ensureValidToken(apiClient);

  // Create submission handler
  const submissionHandler = new GTEInvoiceSubmissionHandler(apiClient);

  try {
    // Validate required IDs for e-Invoice
    if (!customerData.tin_number || !customerData.id_number) {
      return {
        success: false,
        message: `Missing TIN Number or ID Number for customer ${
          customerData.name || "unknown"
        }`,
        error: {
          code: "MISSING_REQUIRED_ID",
          message: `Customer ${
            customerData.name || "unknown"
          } must have both TIN Number and ID Number defined in the system.`,
        },
      };
    }

    // Transform invoice to XML
    const transformedInvoice = await GTEInvoiceTemplate(invoice, customerData);

    // Submit the invoice
    const result = await submissionHandler.submitAndPollDocument(
      transformedInvoice
    );

    return result;
  } catch (error) {
    console.error("Error during Green Target MyInvois submission:", error);

    // Format the error response
    return {
      success: false,
      message: error.message || "Failed to submit to MyInvois API",
      error: {
        code: error.code || "SUBMISSION_ERROR",
        message: error.message || "Error during submission",
      },
    };
  }
}

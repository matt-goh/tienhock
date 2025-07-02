// src/utils/invoice/einvoice/serverSubmissionUtil.js
import { ensureValidToken } from "./myInvoisAuthUtil.js";
import { EInvoiceTemplate } from "./EInvoiceTemplate.js";
import EInvoiceSubmissionHandler from "./EInvoiceSubmissionHandler.js";
import EInvoiceApiClientFactory from "./EInvoiceApiClientFactory.js";

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
  const apiClient = EInvoiceApiClientFactory.getInstance(config);

  // Ensure we have a valid token
  await ensureValidToken(apiClient);

  // Create submission handler
  const submissionHandler = new EInvoiceSubmissionHandler(apiClient);

  // Process XML transformations in parallel (with concurrency limit)
  const BATCH_SIZE = 5; // Process 5 invoices at a time
  const transformedInvoices = [];
  const validationErrors = [];

  // Group invoices into batches
  const batches = [];
  for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
    batches.push(invoices.slice(i, i + BATCH_SIZE));
  }

  // Process each batch in parallel
  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (invoice) => {
        try {
          const customerData = await getCustomerData(invoice.customerid);
          if (!customerData) {
            return {
              error: {
                type: "validation",
                code: "CUSTOMER_NOT_FOUND",
                message: `Customer data not found for invoice ${invoice.id}`,
                invoiceNo: invoice.id,
              },
            };
          }

          if (!customerData.tin_number || !customerData.id_number) {
            return {
              error: {
                type: "validation",
                code: "MISSING_REQUIRED_ID",
                message: `Missing TIN Number or ID Number for customer ${
                  customerData.name || "unknown"
                }`,
                invoiceNo: invoice.id,
              },
            };
          }

          if (
            !customerData.phone_number ||
            customerData.phone_number.trim() === ""
          ) {
            return {
              error: {
                type: "validation",
                code: "MISSING_PHONE_NUMBER",
                message: `Missing phone number for customer ${
                  customerData.name || "unknown"
                }. Phone number is required for e-Invoice submission.`,
                invoiceNo: invoice.id,
              },
            };
          }

          const transformedInvoice = await EInvoiceTemplate(
            invoice,
            customerData
          );
          return { transformedInvoice };
        } catch (error) {
          return { error };
        }
      })
    );

    // Process batch results
    batchResults.forEach((result) => {
      if (result.transformedInvoice) {
        transformedInvoices.push(result.transformedInvoice);
      } else if (result.error) {
        validationErrors.push({
          internalId: result.error.invoiceNo || "unknown",
          error: {
            code: result.error.code || "VALIDATION_ERROR",
            message: result.error.message || "Validation error",
            details: result.error.details || [],
          },
        });
      }
    });
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
            internalId: invoice.id,
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

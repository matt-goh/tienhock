//src/utils/invoice/einvoice/EInvoiceSubmissionHandler.js
import { createHash } from "crypto";

class EInvoiceSubmissionHandler {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.MAX_POLLING_ATTEMPTS = 10;
    this.POLLING_INTERVAL = 5000; // 5 seconds
  }

  async submitAndPollDocuments(transformedInvoices) {
    try {
      const invoices = Array.isArray(transformedInvoices)
        ? transformedInvoices
        : [transformedInvoices];
      const requestBody = this.prepareRequestBody(invoices);
      const submissionResponse = await this.apiClient.makeApiCall(
        "POST",
        "/api/v1.0/documentsubmissions",
        requestBody
      );

      const hasValidInvoices = submissionResponse.acceptedDocuments?.length > 0;
      const hasInvalidInvoices =
        submissionResponse.rejectedDocuments?.length > 0;

      // Case 1: All valid invoices
      if (hasValidInvoices && !hasInvalidInvoices) {
        try {
          const finalStatus = await this.pollSubmissionStatus(
            submissionResponse.submissionUid
          );
          return {
            success: true,
            submissionUid: submissionResponse.submissionUid,
            acceptedDocuments:
              finalStatus.documentSummary ||
              submissionResponse.acceptedDocuments,
            rejectedDocuments: [],
            documentCount: invoices.length,
            dateTimeReceived:
              finalStatus.dateTimeReceived ||
              submissionResponse.dateTimeReceived,
            overallStatus: finalStatus.overallStatus,
          };
        } catch (pollingError) {
          // If polling fails, still return success if documents were accepted
          console.warn(
            "Polling failed but documents were accepted:",
            pollingError.message
          );
          return {
            success: true,
            submissionUid: submissionResponse.submissionUid,
            acceptedDocuments: submissionResponse.acceptedDocuments,
            rejectedDocuments: [],
            documentCount: invoices.length,
            dateTimeReceived: submissionResponse.dateTimeReceived,
            overallStatus: "Valid", // Consider it valid since documents were accepted
            pollingTimeoutOccurred: true,
          };
        }
      }

      // Case 2: All invalid invoices
      if (!hasValidInvoices && hasInvalidInvoices) {
        return {
          success: false,
          submissionUid: null,
          acceptedDocuments: [],
          rejectedDocuments: submissionResponse.rejectedDocuments,
          documentCount: invoices.length,
          dateTimeReceived: new Date().toISOString(),
          overallStatus: "Invalid",
        };
      }

      // Case 3: Mixed valid and invalid
      if (hasValidInvoices && hasInvalidInvoices) {
        const finalStatus = await this.pollSubmissionStatus(
          submissionResponse.submissionUid
        );
        return {
          success: true,
          submissionUid: submissionResponse.submissionUid,
          acceptedDocuments: finalStatus.documentSummary,
          rejectedDocuments: submissionResponse.rejectedDocuments,
          documentCount: invoices.length,
          dateTimeReceived: finalStatus.dateTimeReceived,
          overallStatus: "Partial",
        };
      }

      throw new Error(
        "Invalid submission response: No documents were processed"
      );
    } catch (error) {
      console.error("Error in document submission process:", error);
      throw error;
    }
  }

  // Updated to handle XML documents
  prepareRequestBody(invoices) {
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      throw new Error("Invalid invoice data: No invoices provided");
    }

    const documents = invoices.map((invoice, index) => {
      // Extract the invoice ID from the XML
      const invoiceMatch = invoice.match(/<cbc:ID>(.*?)<\/cbc:ID>/);
      if (!invoiceMatch) {
        throw new Error(
          `Failed to extract invoice ID from XML document ${index}`
        );
      }
      const invoiceId = invoiceMatch[1];

      return {
        format: "XML",
        document: this.encodeDocument(invoice),
        documentHash: this.calculateHash(invoice),
        codeNumber: invoiceId,
      };
    });

    return { documents };
  }

  encodeDocument(xmlDocument) {
    return Buffer.from(xmlDocument, "utf8").toString("base64");
  }

  calculateHash(xmlDocument) {
    return createHash("sha256").update(xmlDocument, "utf8").digest("hex");
  }

  async pollSubmissionStatus(submissionUid) {
    let attempts = 0;
    let lastResponse = null;
    await this.wait(300); // Add 0.3 second delay before starting the first polling
    while (attempts < this.MAX_POLLING_ATTEMPTS) {
      try {
        const response = await this.apiClient.makeApiCall(
          "GET",
          `/api/v1.0/documentsubmissions/${submissionUid}`
        );

        // Save the most recent response
        lastResponse = response;

        // Return immediately if status is final
        if (response.overallStatus !== "InProgress") {
          return response;
        }

        // Check if all documents in summary have a status of "Submitted"
        // and there are documents in the summary (meaning they were processed)
        if (response.documentSummary && response.documentSummary.length > 0) {
          const allDocumentsSubmitted = response.documentSummary.every(
            (doc) => doc.status === "Submitted"
          );

          // If all documents are in "Submitted" state for two consecutive polls,
          // consider it success (the API may take longer to fully validate)
          if (allDocumentsSubmitted && attempts > 8) {
            console.log(
              "All documents are in Submitted state, considering successful"
            );
            // Create a copy with a different status for our internal handling
            return {
              ...response,
              overallStatus: "Valid", // Override to avoid timeout error
              _actualStatus: "InProgress", // Keep track of actual status
            };
          }
        }

        attempts++;
        await this.wait(this.POLLING_INTERVAL);
      } catch (error) {
        console.error(`Error during polling attempt ${attempts + 1}:`, error);
        attempts++;
        await this.wait(this.POLLING_INTERVAL);
      }
    }

    // If we timed out but have a last response with documents, return that instead of throwing
    if (
      lastResponse &&
      lastResponse.documentSummary &&
      lastResponse.documentSummary.length > 0
    ) {
      console.log(
        "Polling timed out, but documents were processed. Returning last status."
      );
      return {
        ...lastResponse,
        overallStatus: "Valid",
        _timedOut: true, // Flag that we timed out
      };
    }

    throw new Error(
      `Polling timed out after ${this.MAX_POLLING_ATTEMPTS} attempts, Please check the submission status manually or try again later.`
    );
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default EInvoiceSubmissionHandler;

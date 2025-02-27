// EInvoiceSubmissionHandler.js
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
        const finalStatus = await this.pollSubmissionStatus(
          submissionResponse.submissionUid
        );
        return {
          success: true,
          submissionUid: submissionResponse.submissionUid,
          acceptedDocuments: finalStatus.documentSummary,
          rejectedDocuments: [],
          documentCount: invoices.length,
          dateTimeReceived: finalStatus.dateTimeReceived,
          overallStatus: finalStatus.overallStatus,
        };
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
    while (attempts < this.MAX_POLLING_ATTEMPTS) {
      try {
        const response = await this.apiClient.makeApiCall(
          "GET",
          `/api/v1.0/documentsubmissions/${submissionUid}`
        );

        // Return immediately if status is final
        if (response.overallStatus !== "InProgress") {
          return response;
        }

        attempts++;
        await this.wait(this.POLLING_INTERVAL);
      } catch (error) {
        console.error(`Error during polling attempt ${attempts + 1}:`, error);
        attempts++;
        await this.wait(this.POLLING_INTERVAL);
      }
    }
    throw new Error(
      `Polling timed out after ${this.MAX_POLLING_ATTEMPTS} attempts`
    );
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default EInvoiceSubmissionHandler;

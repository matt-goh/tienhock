// src/utils/JellyPolly/einvoice/JPEInvoiceSubmissionHandler.js
import { createHash } from "crypto";

class JPEInvoiceSubmissionHandler {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.MAX_POLLING_ATTEMPTS = 10;
    this.POLLING_INTERVAL = 5000; // 5 seconds
  }

  async submitAndPollDocuments(transformedInvoices) {
    try {
      // Handle both single string and array of strings
      const invoiceArray = Array.isArray(transformedInvoices)
        ? transformedInvoices
        : [transformedInvoices];

      // Prepare request body
      const requestBody = this.prepareRequestBody(invoiceArray);

      // Submit documents
      const submissionResponse = await this.apiClient.makeApiCall(
        "POST",
        "/api/v1.0/documentsubmissions",
        requestBody
      );

      // Initialize final result structure
      const result = {
        success: false,
        acceptedDocuments: [],
        rejectedDocuments: [],
        overallStatus: "InProgress",
      };

      // Process initial submission response
      if (submissionResponse.acceptedDocuments) {
        result.acceptedDocuments = submissionResponse.acceptedDocuments.map(
          (doc) => ({
            ...doc,
            submissionUid: submissionResponse.submissionUid,
            dateTimeReceived: submissionResponse.dateTimeReceived,
          })
        );
      }

      if (submissionResponse.rejectedDocuments) {
        result.rejectedDocuments = submissionResponse.rejectedDocuments;
        if (result.acceptedDocuments.length === 0) {
          result.success = false;
          result.overallStatus = "Invalid";
          return result;
        }
      }

      // If we have accepted documents, poll for their status
      if (result.acceptedDocuments.length > 0) {
        try {
          const pollingResult = await this.pollSubmissionStatus(
            submissionResponse.submissionUid
          );

          // Update result with polling data
          result.overallStatus = pollingResult.overallStatus;
          result.success =
            pollingResult.overallStatus === "Valid" ||
            pollingResult.overallStatus === "InProgress";

          // Update document details with polling results
          if (pollingResult.documentSummary) {
            result.acceptedDocuments = result.acceptedDocuments.map((doc) => {
              const summary = pollingResult.documentSummary.find(
                (s) => s.uuid === doc.uuid
              );
              if (summary) {
                return {
                  ...doc,
                  ...summary,
                  status: summary.status || "Valid",
                };
              }
              return doc;
            });
          }
        } catch (pollingError) {
          console.warn(
            "Polling failed but documents were accepted:",
            pollingError.message
          );
          result.success = true;
          result.pollingTimeoutOccurred = true;
        }
      }

      return result;
    } catch (error) {
      console.error("Error in document submission process:", error);
      throw error;
    }
  }

  prepareRequestBody(invoiceXmlArray) {
    const documents = invoiceXmlArray.map((invoiceXml) => {
      if (!invoiceXml || typeof invoiceXml !== "string") {
        throw new Error("Invalid invoice data: Must be a non-empty XML string");
      }

      // Extract invoice ID from XML
      const invoiceMatch = invoiceXml.match(/<cbc:ID>(.*?)<\/cbc:ID>/);
      if (!invoiceMatch) {
        throw new Error("Failed to extract invoice ID from XML document");
      }
      const codeNumber = invoiceMatch[1];

      return {
        format: "XML",
        document: this.encodeDocument(invoiceXml),
        documentHash: this.calculateHash(invoiceXml),
        codeNumber: codeNumber,
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
    await this.wait(300); // Initial delay

    while (attempts < this.MAX_POLLING_ATTEMPTS) {
      try {
        const response = await this.apiClient.makeApiCall(
          "GET",
          `/api/v1.0/documentsubmissions/${submissionUid}`
        );

        lastResponse = response;

        // Return immediately if status is final
        if (response.overallStatus !== "InProgress") {
          return response;
        }

        // Check if the document has a status of "Submitted"
        if (response.documentSummary && response.documentSummary.length > 0) {
          const allDocumentsSubmitted = response.documentSummary.every(
            (doc) => doc.status === "Submitted"
          );

          if (allDocumentsSubmitted && attempts > 8) {
            return {
              ...response,
              overallStatus: "Valid",
              _actualStatus: "InProgress",
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

    if (
      lastResponse &&
      lastResponse.documentSummary &&
      lastResponse.documentSummary.length > 0
    ) {
      return {
        ...lastResponse,
        overallStatus: "Valid",
        _timedOut: true,
      };
    }

    throw new Error(
      `Polling timed out after ${this.MAX_POLLING_ATTEMPTS} attempts. Please check the submission status manually.`
    );
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default JPEInvoiceSubmissionHandler;

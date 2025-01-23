// documentSubmissionHandler.js
import { createHash } from 'crypto';

class DocumentSubmissionHandler {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.MAX_POLLING_ATTEMPTS = 10;
    this.POLLING_INTERVAL = 5000; // 5 seconds
  }

  async submitAndPollDocuments(transformedInvoices) {
    try {
      const invoices = Array.isArray(transformedInvoices) ? transformedInvoices : [transformedInvoices];
      const requestBody = this.prepareRequestBody(invoices);
      const submissionResponse = await this.apiClient.makeApiCall(
        "POST",
        "/api/v1.0/documentsubmissions",
        requestBody
      );
  
      const hasValidInvoices = submissionResponse.acceptedDocuments?.length > 0;
      const hasInvalidInvoices = submissionResponse.rejectedDocuments?.length > 0;
  
      // Case 1: All valid invoices
      if (hasValidInvoices && !hasInvalidInvoices) {
        const finalStatus = await this.pollSubmissionStatus(submissionResponse.submissionUid);
        return {
          success: true,
          submissionUid: submissionResponse.submissionUid,
          acceptedDocuments: finalStatus.documentSummary,
          rejectedDocuments: [],
          documentCount: invoices.length,
          dateTimeReceived: finalStatus.dateTimeReceived,
          overallStatus: finalStatus.overallStatus
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
          overallStatus: "Invalid"
        };
      }
  
      // Case 3: Mixed valid and invalid
      if (hasValidInvoices && hasInvalidInvoices) {
        const finalStatus = await this.pollSubmissionStatus(submissionResponse.submissionUid);
        return {
          success: true,
          submissionUid: submissionResponse.submissionUid,
          acceptedDocuments: finalStatus.documentSummary,
          rejectedDocuments: submissionResponse.rejectedDocuments,
          documentCount: invoices.length,
          dateTimeReceived: finalStatus.dateTimeReceived,
          overallStatus: "Partial"
        };
      }
  
      throw new Error("Invalid submission response: No documents were processed");
    } catch (error) {
      console.error("Error in document submission process:", error);
      throw error;
    }
  }

  // Keep existing prepareRequestBody, encodeDocument, and calculateHash methods as they are
  prepareRequestBody(invoices) {
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      throw new Error('Invalid invoice data: No invoices provided');
    }

    const documents = invoices.map(invoice => {
      if (!invoice || !invoice.Invoice || !invoice.Invoice[0] || !invoice.Invoice[0].ID) {
        throw new Error('Invalid invoice data structure');
      }

      const jsonDocument = JSON.stringify(invoice);
      
      return {
        format: "JSON",
        document: this.encodeDocument(jsonDocument),
        documentHash: this.calculateHash(jsonDocument),
        codeNumber: invoice.Invoice[0].ID[0]._
      };
    });

    return { documents };
  }

  // Keep existing encoding method
  encodeDocument(jsonDocument) {
    return Buffer.from(jsonDocument, 'utf8').toString('base64');
  }

  // Keep existing hash calculation method
  calculateHash(jsonDocument) {
    return createHash('sha256').update(jsonDocument, 'utf8').digest('hex');
  }

  async pollSubmissionStatus(submissionUid) {
    let attempts = 0;
    while (attempts < this.MAX_POLLING_ATTEMPTS) {
      try {
        const response = await this.apiClient.makeApiCall(
          'GET', 
          `/api/v1.0/documentsubmissions/${submissionUid}`
        );

        // Return immediately if status is final
        if (response.overallStatus !== 'InProgress') {
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
    throw new Error(`Polling timed out after ${this.MAX_POLLING_ATTEMPTS} attempts`);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default DocumentSubmissionHandler;
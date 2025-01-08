// documentSubmissionHandler.js
import { createHash } from 'crypto';

class DocumentSubmissionHandler {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.MAX_POLLING_ATTEMPTS = 10;
    this.POLLING_INTERVAL = 5000; // 5 seconds
  }

  async submitAndPollDocument(transformedInvoice) {
    try {
      const requestBody = this.prepareRequestBody(transformedInvoice);

      const submissionResponse = await this.submitDocuments(requestBody);

      this.validateSubmissionResponse(submissionResponse);

      const submissionStatus = await this.pollSubmissionStatus(submissionResponse.submissionUid);
      return this.processSubmissionResult(submissionStatus);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  prepareRequestBody(invoice) {
    if (!invoice || !invoice.Invoice || !invoice.Invoice[0] || !invoice.Invoice[0].ID) {
      throw new Error('Invalid invoice data structure');
    }
    
    const jsonDocument = JSON.stringify(invoice);
    
    return {
      documents: [{
        format: "JSON",
        document: this.encodeDocument(jsonDocument),
        documentHash: this.calculateHash(jsonDocument),
        codeNumber: invoice.Invoice[0].ID[0]._
      }]
    };
  }

  encodeDocument(jsonDocument) {
    return Buffer.from(jsonDocument, 'utf8').toString('base64');
  }

  calculateHash(jsonDocument) {
    return createHash('sha256').update(jsonDocument, 'utf8').digest('hex');
  }

  async submitDocuments(requestBody) {
    const response = await this.apiClient.makeApiCall('POST', '/api/v1.0/documentsubmissions/', requestBody);
    return response;
  }

  validateSubmissionResponse(submissionResponse) {
    if (submissionResponse.rejectedDocuments && submissionResponse.rejectedDocuments.length > 0) {
      throw new Error(`Document rejected: ${JSON.stringify(submissionResponse.rejectedDocuments)}`);
    }
    if (!submissionResponse.submissionUid) {
      throw new Error('No submissionUid received from submitDocuments');
    }
  }

  async pollSubmissionStatus(submissionUid) {
    let attempts = 0;
    while (attempts < this.MAX_POLLING_ATTEMPTS) {
      try {
        const submission = await this.apiClient.makeApiCall('GET', `/api/v1.0/documentsubmissions/${submissionUid}`);

        if (submission.overallStatus !== 'InProgress') {
          return submission;
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

  processSubmissionResult(submissionStatus) {
    return submissionStatus.overallStatus === 'Valid'
      ? this.createSuccessResult(submissionStatus)
      : this.createFailureResult(submissionStatus);
  }

  createSuccessResult(submissionStatus) {
    return {
      success: true,
      message: 'Document submitted successfully',
      submissionUid: submissionStatus.submissionUid,
      acceptedDocuments: submissionStatus.acceptedDocuments
    };
  }

  createFailureResult(submissionStatus) {
    return {
      success: false,
      message: 'Document submission failed',
      submissionUid: submissionStatus.submissionUid,
      rejectedDocuments: submissionStatus.rejectedDocuments
    };
  }

  handleError(error) {
    console.error('Error in document submission process:', error);
    if (error.response) {
      console.error('Full API error response:', JSON.stringify(error.response.data, null, 2));
    }
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default DocumentSubmissionHandler;
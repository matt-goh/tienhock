import { generateDummyInvoice } from './generateDummyInvoice.js';
import { createHash } from 'crypto';

class DocumentSubmissionHandler {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async submitAndPollDocument() {
    try {
      // Step 1: Generate the document
      const invoice = generateDummyInvoice();

      const jsonDocument = JSON.stringify(invoice);

      // Step 4: Prepare the request body
      const requestBody = {
        documents: [{
          format: "JSON",
          document: Buffer.from(jsonDocument, 'utf8').toString('base64'),
          documentHash: createHash('sha256').update(jsonDocument, 'utf8').digest('hex'),
          codeNumber: invoice.Invoice[0].ID[0]._
        }]
      };

      console.log('Submission payload:', JSON.stringify(requestBody, null, 2));

      // Step 5: Submit documents
      const submissionResponse = await this.submitDocuments(requestBody);
      console.log('Submission response:', JSON.stringify(submissionResponse, null, 2));

      if (submissionResponse.rejectedDocuments && submissionResponse.rejectedDocuments.length > 0) {
        throw new Error(`Document rejected: ${JSON.stringify(submissionResponse.rejectedDocuments)}`);
      }

      if (!submissionResponse.submissionUid) {
        throw new Error('No submissionUid received from submitDocuments');
      }

      // Step 6: Poll for Submission Status
      const submissionStatus = await this.pollSubmissionStatus(submissionResponse.submissionUid);

      // Step 7: Process the result
      return this.processSubmissionResult(submissionStatus);
    } catch (error) {
      console.error('Error in document submission process:', error);
      if (error.response) {
        console.error('Full API error response:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  async submitDocuments(requestBody) {
    const response = await this.apiClient.makeApiCall('POST', '/api/v1.0/documentsubmissions/', requestBody);
    console.log('Submit documents response:', JSON.stringify(response, null, 2));
    return response;
  }

  async pollSubmissionStatus(submissionUid) {
    let inProgress = true;
    let attempts = 0;
    const maxAttempts = 10;
    const pollInterval = 5000; // 5 seconds

    while (inProgress && attempts < maxAttempts) {
      try {
        console.log(`Polling attempt ${attempts + 1} for submissionUid: ${submissionUid}`);
        const submission = await this.apiClient.makeApiCall('GET', `/api/v1.0/documentsubmissions/${submissionUid}`);
        console.log('Poll response:', JSON.stringify(submission, null, 2));

        if (submission.overallStatus !== 'InProgress') {
          inProgress = false;
          return submission;
        }

        attempts++;
        await this.wait(pollInterval);
      } catch (error) {
        console.error(`Error during polling attempt ${attempts + 1}:`, error);
        attempts++;
        await this.wait(pollInterval);
      }
    }

    throw new Error(`Polling timed out after ${maxAttempts} attempts`);
  }

  processSubmissionResult(submissionStatus) {
    console.log('Processing submission result:', JSON.stringify(submissionStatus, null, 2));
    if (submissionStatus.overallStatus === 'Valid') {
      return {
        success: true,
        message: 'Document submitted successfully',
        submissionUid: submissionStatus.submissionUid,
        acceptedDocuments: submissionStatus.acceptedDocuments
      };
    } else {
      return {
        success: false,
        message: 'Document submission failed',
        submissionUid: submissionStatus.submissionUid,
        rejectedDocuments: submissionStatus.rejectedDocuments
      };
    }
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default DocumentSubmissionHandler;
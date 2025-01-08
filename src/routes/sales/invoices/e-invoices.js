// src/routes/sales/invoices/e-invoice.js
import { transformInvoiceToMyInvoisFormat } from '../../../pages/Invois/utils/transformInvoiceData.js';
import { fetchInvoiceFromDb } from './helpers.js';
import { Router } from 'express';
import DocumentSubmissionHandler from '../../../pages/Invois/utils/documentSubmissionHandler.js';
import EInvoiceApiClient from '../../../pages/Invois/utils/EInvoiceApiClient.js';

export default function(pool, config) {
  const router = Router();
  const apiClient = new EInvoiceApiClient(
    config.MYINVOIS_API_BASE_URL,
    config.MYINVOIS_CLIENT_ID,
    config.MYINVOIS_CLIENT_SECRET
  );
  const submissionHandler = new DocumentSubmissionHandler(apiClient);

  // Login/token endpoint
  router.post('/login', async (req, res) => {
    try {
      console.log('Attempting to connect to:', `${config.MYINVOIS_API_BASE_URL}/connect/token`);
      const tokenResponse = await apiClient.refreshToken();
      
      if (tokenResponse && tokenResponse.access_token) {
        res.json({ 
          success: true, 
          message: 'Successfully connected to MyInvois API',
          apiEndpoint: `${config.MYINVOIS_API_BASE_URL}/connect/token`,
          tokenInfo: {
            accessToken: tokenResponse.access_token,
            expiresIn: tokenResponse.expires_in,
            tokenType: tokenResponse.token_type
          }
        });
      } else {
        throw new Error('Invalid token response from MyInvois API');
      }
    } catch (error) {
      console.error('Error connecting to MyInvois API:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to connect to MyInvois API', 
        apiEndpoint: `${config.MYINVOIS_API_BASE_URL}/connect/token`,
        error: error.message,
        details: error.response ? error.response.data : null
      });
    }
  });

  // Submit invoice to MyInvois
  router.post('/submit', async (req, res) => {
    try {
      console.log('Starting invoice submission process');
      const { invoiceId } = req.body;

      if (!invoiceId) {
        return res.status(400).json({
          success: false,
          message: 'No invoice ID provided for submission'
        });
      }

      try {
        // 1. Fetch invoice data from database
        const invoiceData = await fetchInvoiceFromDb(pool, invoiceId);
        console.log('Fetched invoice data:', JSON.stringify(invoiceData, null, 2));
        
        if (!invoiceData) {
          throw new Error(`Invoice with ID ${invoiceId} not found`);
        }
        
        // 2. Transform invoice data to MyInvois format
        const transformedInvoice = transformInvoiceToMyInvoisFormat(invoiceData);
        
        // 3. Submit transformed invoice
        const result = await submissionHandler.submitAndPollDocument(transformedInvoice);

        if (result.success) {
          console.log('Invoice submission successful:', JSON.stringify(result, null, 2));
          res.json({
            success: true,
            message: result.message,
            submissionUid: result.submissionUid,
            acceptedDocuments: result.acceptedDocuments
          });
        } else {
          console.error('Invoice submission failed:', JSON.stringify(result, null, 2));
          res.status(400).json({
            success: false,
            message: result.message,
            submissionUid: result.submissionUid,
            rejectedDocuments: result.rejectedDocuments
          });
        }
      } catch (error) {
        console.error('Error in invoice processing:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error submitting invoice:', error);
      let errorMessage = error.message;
      let errorDetails = null;

      if (error.response) {
        console.error('Error response:', JSON.stringify(error.response, null, 2));
        errorMessage = error.response.data?.error?.message || errorMessage;
        errorDetails = error.response.data?.error?.details || null;
      }

      // Check for specific errors and provide more user-friendly messages
      if (errorMessage.includes('Document hash is not valid')) {
        errorMessage = 'Document hash validation failed. Please ensure the document content is correct and try again.';
      } else if (errorMessage.includes('Hash verification failed')) {
        errorMessage = 'Internal hash verification failed. This may indicate an issue with the hash calculation process.';
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to submit invoice to MyInvois API', 
        error: errorMessage,
        details: errorDetails
      });
    }
  });

  return router;
}
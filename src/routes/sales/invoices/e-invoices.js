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
      console.log('Starting batch invoice submission process');
      const { invoiceIds } = req.body;

      if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No invoice IDs provided for submission'
        });
      }

      console.log(`Processing ${invoiceIds.length} invoices in batch`);

      const results = {
        success: true,
        message: '',
        submissionResults: [],
        failedInvoices: [],
        successCount: 0,
        failureCount: 0
      };

      try {
        // Process all invoices in the batch
        const transformedInvoices = [];
        const transformationErrors = [];

        // 1. Fetch and transform all invoices
        for (const invoiceId of invoiceIds) {
          try {
            // Fetch invoice data from database
            const invoiceData = await fetchInvoiceFromDb(pool, invoiceId);
            
            if (!invoiceData) {
              throw new Error(`Invoice with ID ${invoiceId} not found`);
            }
            
            // Transform invoice data to MyInvois format
            const transformedInvoice = transformInvoiceToMyInvoisFormat(invoiceData);
            transformedInvoices.push(transformedInvoice);
          } catch (error) {
            transformationErrors.push({
              invoiceId,
              error: error.message
            });
          }
        }

        // If no invoices were successfully transformed
        if (transformedInvoices.length === 0) {
          throw new Error('Failed to transform any invoices in the batch. Errors: ' + 
            JSON.stringify(transformationErrors));
        }

        // 2. Submit transformed invoices
        const submissionResult = await submissionHandler.submitAndPollDocuments(transformedInvoices);

        // 3. Process results
        if (submissionResult.success) {
          results.successCount = submissionResult.acceptedDocuments.length;
          results.message = `Successfully submitted ${results.successCount} invoice(s)`;
          results.submissionResults.push({
            submissionUid: submissionResult.submissionUid,
            acceptedDocuments: submissionResult.acceptedDocuments
          });
        }

        if (submissionResult.rejectedDocuments?.length > 0) {
          results.failureCount = submissionResult.rejectedDocuments.length;
          results.failedInvoices = submissionResult.rejectedDocuments;
        }

        // Add transformation errors to results
        if (transformationErrors.length > 0) {
          results.failureCount += transformationErrors.length;
          results.failedInvoices.push(...transformationErrors);
        }

        // Set overall success status
        results.success = results.successCount > 0;

        // If everything failed
        if (results.failureCount === invoiceIds.length) {
          throw new Error('All invoices failed processing');
        }

        // Send response
        if (results.success) {
          console.log('Batch submission completed:', JSON.stringify(results, null, 2));
          res.json(results);
        } else {
          console.error('Batch submission failed:', JSON.stringify(results, null, 2));
          res.status(400).json(results);
        }

      } catch (error) {
        console.error('Error in batch processing:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error submitting batch:', error);
      let errorMessage = error.message;
      let errorDetails = null;

      if (error.response) {
        console.error('Error response:', JSON.stringify(error.response, null, 2));
        errorMessage = error.response.data?.error?.message || errorMessage;
        errorDetails = error.response.data?.error?.details || null;
      }

      // Enhanced error messages for batch processing
      if (errorMessage.includes('Document hash is not valid')) {
        errorMessage = 'One or more documents failed hash validation. Please verify the document contents and try again.';
      } else if (errorMessage.includes('Hash verification failed')) {
        errorMessage = 'Internal hash verification failed. This may indicate an issue with the hash calculation process.';
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to process batch submission', 
        error: errorMessage,
        details: errorDetails
      });
    }
  });

  return router;
}
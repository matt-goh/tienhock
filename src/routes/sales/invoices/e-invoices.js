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
        success: false,
        message: '',
        submissionResults: [],
        failedInvoices: [],
        validationErrors: []
      };
  
      // Process all invoices in the batch
      const transformedInvoices = [];
      
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
          console.log('Caught transformation error:', error);
  
          // Handle validation errors
          if (error.validationErrors) {
            results.validationErrors.push({
              invoiceId,
              invoiceNo: error.invoiceNo,
              errors: Array.isArray(error.validationErrors) 
                ? error.validationErrors 
                : [error.validationErrors],
              type: 'validation'
            });
          } else {
            results.failedInvoices.push({
              invoiceId,
              invoiceNo: error.invoiceNo || invoiceId,
              errors: [error.message],
              type: 'transformation'
            });
          }
        }
      }
  
      // If no invoices were successfully transformed
      if (transformedInvoices.length === 0) {
        // Combine all errors for display
        const allErrors = [
          ...results.validationErrors,
          ...results.failedInvoices.map(error => ({
            invoiceNo: error.invoiceNo,
            errors: Array.isArray(error.errors) ? error.errors : [error.errors],
            type: 'validation'
          }))
        ];

        const errorResponse = {
          success: false,
          message: allErrors.length > 0
            ? `${allErrors.length} invoice(s) failed validation`
            : 'Failed to transform any invoices',
          validationErrors: allErrors,
          shouldStopAtValidation: true
        };

        console.log('Sending error response:', errorResponse);
        return res.status(400).json(errorResponse);
      }
  
      // Only proceed with submission if there are valid invoices
      const submissionResult = await submissionHandler.submitAndPollDocuments(transformedInvoices);
  
      if (submissionResult.success) {
        results.success = true;
        results.message = `Successfully submitted ${submissionResult.acceptedDocuments.length} invoice(s)`;
        results.submissionResults.push({
          submissionUid: submissionResult.submissionUid,
          acceptedDocuments: submissionResult.acceptedDocuments
        });
      }
  
      if (submissionResult.rejectedDocuments?.length > 0) {
        results.failedInvoices.push(...submissionResult.rejectedDocuments.map(doc => ({
          invoiceNo: doc.invoiceNo || doc.invoiceId,
          errors: Array.isArray(doc.errors) ? doc.errors : [doc.error || doc.errors || 'Unknown error'],
          type: 'submission'
        })));
      }
  
      // Return final response with properly formatted errors
      return res.json({
        ...results,
        validationErrors: [
          ...results.validationErrors,
          ...results.failedInvoices.map(error => ({
            invoiceNo: error.invoiceNo,
            errors: Array.isArray(error.errors) ? error.errors : [error.errors],
            type: 'validation'
          }))
        ]
      });
    
    } catch (error) {
      console.error('Error submitting batch:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to process batch submission',
        error: error.message,
        validationErrors: [],
        failedInvoices: [],
        shouldStopAtValidation: true
      });
    }
  });

  return router;
}
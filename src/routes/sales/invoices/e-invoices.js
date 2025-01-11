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
            // Directly pass through the validation errors without wrapping them
            results.validationErrors.push({
              invoiceId,
              invoiceNo: error.invoiceNo,
              errors: error.validationErrors,
              type: 'validation'
            });
          } else {
            results.failedInvoices.push({
              invoiceId,
              invoiceNo: error.invoiceNo || invoiceId,
              error: error.message,
              type: 'transformation'
            });
          }
        }
      }
  
      // If no invoices were successfully transformed
      if (transformedInvoices.length === 0) {
        // Keep the original validation messages intact
        const allErrors = [
          ...results.validationErrors,
          ...results.failedInvoices.map(error => ({
            invoiceNo: error.invoiceNo,
            errors: Array.isArray(error.errors) ? error.errors : [error.error || error.errors],
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
  
        return res.status(400).json(errorResponse);
      }
  
      // Rest of the code remains the same...
    } catch (error) {
      // Handle unexpected errors
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to process batch submission',
        error: error.message,
        validationErrors: error.validationErrors || [],
        failedInvoices: [],
        shouldStopAtValidation: true
      });
    }
  });

  return router;
}
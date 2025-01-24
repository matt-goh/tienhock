// src/routes/catalogue/customer-validation.js
import { Router } from "express";
import EInvoiceApiClient from "../../utils/invoice/einvoice/EInvoiceApiClient.js";

export default function (pool, config) {
  const router = Router();
  const apiClient = new EInvoiceApiClient(
    config.MYINVOIS_API_BASE_URL,
    config.MYINVOIS_CLIENT_ID,
    config.MYINVOIS_CLIENT_SECRET
  );

  router.get("/validate/:tin", async (req, res) => {
    const { tin } = req.params;
    const { idType, idValue } = req.query;

    if (!tin || !idType || !idValue) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
      });
    }

    try {
      await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/taxpayer/validate/${tin}?idType=${idType}&idValue=${idValue}`
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Validation error:", error);

      // Handle different error cases with appropriate messages
      const status = error.status || 500;
      let message;

      switch (status) {
        case 400:
          message = "The provided TIN number or ID format is invalid";
          break;
        case 404:
          message = "The provided TIN number and ID combination is not valid";
          break;
        default:
          message = "Failed to validate customer identity";
      }

      res.status(status).json({
        success: false,
        message,
        error: error.message,
        status, // Include status code in response
      });
    }
  });

  return router;
}

// src/routes/catalogue/customer-validation.js
import { Router } from "express";
import EInvoiceApiClientFactory from "../../utils/invoice/einvoice/EInvoiceApiClientFactory.js";

export default function (pool, config) {
  const router = Router();
  const apiClient = EInvoiceApiClientFactory.getInstance(config);

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

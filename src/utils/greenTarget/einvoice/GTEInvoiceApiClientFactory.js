// src/utils/greenTarget/einvoice/GTEInvoiceApiClientFactory.js
import GTEInvoiceApiClient from "./GTEInvoiceApiClient.js";

// Singleton instance
let instance = null;

/**
 * Factory that ensures only one instance of GTEInvoiceApiClient exists
 */
export default {
  /**
   * Get or create the singleton instance of GTEInvoiceApiClient
   * @param {Object} config - Configuration object containing API details
   * @returns {GTEInvoiceApiClient} The singleton API client instance
   */
  getInstance(config) {
    if (!instance) {
      // Create new instance if one doesn't exist
      instance = new GTEInvoiceApiClient(
        config.MYINVOIS_API_BASE_URL,
        config.MYINVOIS_GT_CLIENT_ID,
        config.MYINVOIS_GT_CLIENT_SECRET
      );
      console.log("Created new GTEInvoiceApiClient instance");
    }
    return instance;
  },

  /**
   * Clear the current instance (useful for testing or when config changes)
   */
  clearInstance() {
    if (instance) {
      // Clean up any resources
      instance.cleanup();
    }
    instance = null;
  },
};

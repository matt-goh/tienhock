// src/utils/invoice/einvoice/EInvoiceApiClientFactory.js
import EInvoiceApiClient from "./EInvoiceApiClient.js";

// Singleton instance
let instance = null;

/**
 * Factory that ensures only one instance of EInvoiceApiClient exists
 */
export default {
  /**
   * Get or create the singleton instance of EInvoiceApiClient
   * @param {Object} config - Configuration object containing API details
   * @returns {EInvoiceApiClient} The singleton API client instance
   */
  getInstance(config) {
    if (!instance) {
      // Create new instance if one doesn't exist
      instance = new EInvoiceApiClient(
        config.MYINVOIS_API_BASE_URL,
        config.MYINVOIS_CLIENT_ID,
        config.MYINVOIS_CLIENT_SECRET
      );
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

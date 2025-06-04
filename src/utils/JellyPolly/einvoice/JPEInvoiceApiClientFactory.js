// src/utils/JellyPolly/einvoice/JPEInvoiceApiClientFactory.js
import JPEInvoiceApiClient from "./JPEInvoiceApiClient.js";

// Singleton instance
let instance = null;

/**
 * Factory that ensures only one instance of JPEInvoiceApiClient exists
 */
export default {
  /**
   * Get or create the singleton instance of JPEInvoiceApiClient
   * @param {Object} config - Configuration object containing API details
   * @returns {JPEInvoiceApiClient} The singleton API client instance
   */
  getInstance(config) {
    if (!instance) {
      // Create new instance if one doesn't exist
      instance = new JPEInvoiceApiClient(
        config.MYINVOIS_API_BASE_URL,
        config.MYINVOIS_JP_CLIENT_ID,
        config.MYINVOIS_JP_CLIENT_SECRET
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

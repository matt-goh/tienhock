// src/utils/JellyPolly/einvoice/JPMyInvoisAuthUtil.js
import JPEInvoiceApiClientFactory from "./JPEInvoiceApiClientFactory.js";

// Simple in-memory token cache
let tokenCache = {
  accessToken: null,
  expiresAt: null,
  refreshThreshold: 5 * 60 * 1000, // 5 minutes before expiration
};

/**
 * Ensures a valid MyInvois API token is available for JellyPolly
 * @param {Object} apiClientOrConfig - Either the JPEInvoiceApiClient instance or configuration object
 * @returns {Promise<string>} - The valid access token
 */
export async function ensureValidToken(apiClientOrConfig) {
  // Accept either an apiClient instance or a config object
  const apiClient =
    typeof apiClientOrConfig.makeApiCall === "function"
      ? apiClientOrConfig
      : JPEInvoiceApiClientFactory.getInstance(apiClientOrConfig);

  const now = Date.now();

  // Check if token exists and is not near expiration
  if (
    tokenCache.accessToken &&
    tokenCache.expiresAt &&
    now < tokenCache.expiresAt - tokenCache.refreshThreshold
  ) {
    return tokenCache.accessToken;
  }

  // Token doesn't exist or is expired/expiring soon
  try {
    // Call the refreshToken method from the API client to get a new token
    const tokenResponse = await apiClient.refreshToken();

    // Update the cache
    tokenCache.accessToken = tokenResponse.access_token;
    tokenCache.expiresAt = now + tokenResponse.expires_in * 1000;

    return tokenCache.accessToken;
  } catch (error) {
    console.error("Failed to refresh JellyPolly MyInvois token:", error);
    throw new Error(
      "Failed to authenticate with MyInvois API: " + error.message
    );
  }
}

/**
 * Clears the token cache
 */
export function clearTokenCache() {
  tokenCache = {
    accessToken: null,
    expiresAt: null,
    refreshThreshold: 5 * 60 * 1000,
  };
}

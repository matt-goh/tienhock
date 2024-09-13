import { request } from 'https';
import { stringify } from 'querystring';

class EInvoiceApiClient {
  constructor(baseUrl, clientId, clientSecret) {
    this.baseUrl = baseUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiryTime = null;
    this.refreshThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.refreshTimeout = null;
  }

  async ensureValidToken() {
    const now = Date.now();
    if (!this.accessToken || !this.tokenExpiryTime || now >= this.tokenExpiryTime - this.refreshThreshold) {
      await this.refreshToken();
    }
  }

  refreshToken() {
    return new Promise((resolve, reject) => {
      const postData = stringify({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'InvoicingAPI'
      });

      const options = {
        hostname: new URL(this.baseUrl).hostname,
        port: 443,
        path: '/connect/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            this.accessToken = response.access_token;
            this.tokenExpiryTime = Date.now() + response.expires_in * 1000;
            
            // Schedule the next token refresh
            this.scheduleTokenRefresh(response.expires_in);
            
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse token response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Token request failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  scheduleTokenRefresh(expiresIn) {
    // Clear any existing refresh timeout
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    // Schedule a refresh for 5 minutes before the token expires
    const refreshTime = (expiresIn - 5 * 60) * 1000; // convert to milliseconds
    this.refreshTimeout = setTimeout(() => {
      this.refreshToken()
        .catch(error => console.error('Failed to refresh token:', error));
    }, refreshTime);
  }

  makeApiCall(method, endpoint, data = null) {
    return new Promise(async (resolve, reject) => {
      await this.ensureValidToken();

      const options = {
        hostname: new URL(this.baseUrl).hostname,
        port: 443,
        path: endpoint,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseData));
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`API request failed: ${error.message}`));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }
}

export default EInvoiceApiClient;

import { request } from 'https';
import { stringify } from 'querystring';

class EInvoiceApiClient {
  constructor(baseUrl, clientId, clientSecret) {
    this.baseUrl = baseUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiryTime = null;
    this.refreshThreshold = 5 * 60 * 1000;
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
            
            if (res.statusCode !== 200) {
              reject(new Error(`Token refresh failed: ${response.error || 'Unknown error'}`));
              return;
            }

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
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    const refreshTime = (expiresIn - 5 * 60) * 1000;
    this.refreshTimeout = setTimeout(() => {
      this.refreshToken()
        .catch(error => console.error('Failed to refresh token:', error));
    }, refreshTime);
  }

  async makeApiCall(method, endpoint, data = null) {
    try {
      await this.ensureValidToken();

      return new Promise((resolve, reject) => {
        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const options = {
          hostname: new URL(this.baseUrl).hostname,
          port: 443,
          path: normalizedEndpoint,
          method: method,
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        };

        const req = request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            console.log('API Response Status:', res.statusCode);
            console.log('API Response Body:', responseData);

            try {
              // Handle empty response
              if (!responseData.trim()) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                  resolve({});
                } else {
                  reject(new Error(`Empty response with status ${res.statusCode}`));
                }
                return;
              }

              const parsedData = JSON.parse(responseData);
              
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(parsedData);
              } else {
                const error = new Error(`API request failed with status ${res.statusCode}`);
                error.status = res.statusCode;
                error.response = parsedData;
                reject(error);
              }
            } catch (error) {
              reject(new Error(`Failed to parse API response: ${error.message}\nRaw response: ${responseData}`));
            }
          });
        });

        req.on('error', (error) => {
          console.error('Request error:', error);
          reject(new Error(`API request failed: ${error.message}`));
        });

        if (data) {
          const stringData = JSON.stringify(data);
          req.write(stringData);
        }

        req.end();
      });

    } catch (error) {
      console.error('Error in makeApiCall:', error);
      throw error;
    }
  }

  cleanup() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
  }
}

export default EInvoiceApiClient;
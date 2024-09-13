import React, { useEffect, useState } from 'react';

interface TokenInfo {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  apiEndpoint: string;
  tokenInfo?: TokenInfo;
  error?: string;
  details?: any;
}

const EInvoisPage: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [responseData, setResponseData] = useState<LoginResponse | null>(null);

  useEffect(() => {
    const connectToMyInvois = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/einvoice/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        const data: LoginResponse = await response.json();
        setResponseData(data);
        setIsLoggedIn(data.success);
      } catch (err) {
        setResponseData({
          success: false,
          message: 'An error occurred while connecting to MyInvois API.',
          apiEndpoint: 'Unknown',
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    };

    connectToMyInvois();
  }, []);

  if (!responseData) {
    return <div>Connecting to MyInvois API...</div>;
  }

  return (
    <div>
      <h1>MyInvois API Connection Status</h1>
      <p>Status: {responseData.success ? 'Connected' : 'Connection Failed'}</p>
      <p>Message: {responseData.message}</p>
      <p>API Endpoint: {responseData.apiEndpoint}</p>
      {responseData.success && responseData.tokenInfo && (
        <div>
          <h2>Token Information:</h2>
          <p>Access Token: {responseData.tokenInfo.accessToken.substring(0, 10)}...</p>
          <p>Expires In: {responseData.tokenInfo.expiresIn} seconds</p>
          <p>Token Type: {responseData.tokenInfo.tokenType}</p>
        </div>
      )}
      {!responseData.success && (
        <div>
          <h2>Error Details:</h2>
          <p>Error: {responseData.error}</p>
          <pre>{JSON.stringify(responseData.details, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default EInvoisPage;
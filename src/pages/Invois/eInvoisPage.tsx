// EInvoisPage.tsx

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../config";

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

interface SubmissionResponse {
  details(arg0: string, error: string | undefined, details: any): unknown;
  submissionUID?: string;
  acceptedDocuments?: Array<{
    uuid: string;
    invoiceCodeNumber: string;
  }>;
  success?: boolean;
  message?: string;
  error?: string;
}

const EInvoisPage: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [responseData, setResponseData] = useState<LoginResponse | null>(null);
  const [submissionResponse, setSubmissionResponse] =
    useState<SubmissionResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  useEffect(() => {
    const connectToMyInvois = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/einvoice/login`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        const data: LoginResponse = await response.json();
        setResponseData(data);
        setIsLoggedIn(data.success);
      } catch (err) {
        setResponseData({
          success: false,
          message: "An error occurred while connecting to MyInvois API.",
          apiEndpoint: "Unknown",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };

    connectToMyInvois();
  }, []);

  const handleSubmitInvoice = async () => {
    setIsSubmitting(true);
    setSubmissionError(null);
    setSubmissionResponse(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/einvoice/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const data: SubmissionResponse = await response.json();
      if (data.success) {
        setSubmissionResponse(data);
      } else {
        setSubmissionError(
          data.message || "Unknown error occurred during submission"
        );
        console.error("Submission error details:", data.error, data.details);
      }
    } catch (err) {
      setSubmissionError(
        err instanceof Error
          ? err.message
          : "Unknown error occurred during submission"
      );
      console.error("Submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!responseData) {
    return <div>Connecting to MyInvois API...</div>;
  }

  return (
    <div>
      <h1>MyInvois API Connection Status</h1>
      <p>Status: {responseData.success ? "Connected" : "Connection Failed"}</p>
      <p>Message: {responseData.message}</p>
      <p>API Endpoint: {responseData.apiEndpoint}</p>
      {responseData.success && responseData.tokenInfo && (
        <div>
          <h2>Token Information:</h2>
          <p>
            Access Token: {responseData.tokenInfo.accessToken.substring(0, 10)}
            ...
          </p>
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

      <button
        className="flex items-center mt-4 px-4 py-2 font-medium text-default-700 border rounded-full hover:bg-default-100 hover:text-default-800 active:text-default-900 active:bg-default-200 transition-colors duration-200"
        onClick={handleSubmitInvoice}
        disabled={!isLoggedIn || isSubmitting}
      >
        {isSubmitting ? "Submitting..." : "Submit Invoice"}
      </button>

      {submissionError && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <h3 className="font-bold">Submission Error:</h3>
          <p>{submissionError}</p>
        </div>
      )}

      {submissionResponse && (
        <div className="mt-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <h3 className="font-bold">Submission Response:</h3>
          {submissionResponse.submissionUID && (
            <p>Submission ID: {submissionResponse.submissionUID}</p>
          )}
          {submissionResponse.acceptedDocuments &&
            submissionResponse.acceptedDocuments.length > 0 && (
              <>
                <h4 className="font-semibold mt-2">Accepted Documents:</h4>
                <ul className="list-disc list-inside">
                  {submissionResponse.acceptedDocuments.map((doc, index) => (
                    <li key={index}>
                      UUID: {doc.uuid}, Invoice Code: {doc.invoiceCodeNumber}
                    </li>
                  ))}
                </ul>
              </>
            )}
          {(!submissionResponse.acceptedDocuments ||
            submissionResponse.acceptedDocuments.length === 0) && (
            <p>No documents were accepted in this submission.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default EInvoisPage;

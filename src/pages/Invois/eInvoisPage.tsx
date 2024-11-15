// EInvoisPage.tsx

import { useEffect, useState, useCallback } from "react";
import { API_BASE_URL } from "../../configs/config";
import Button from "../../components/Button";
import toast from "react-hot-toast";

// Types
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
  tokenCreationTime?: number;
  error?: string;
  details?: any;
}

interface SubmissionResponse {
  message: string;
  submissionUid: string;
  success: boolean;
}

// Reusable components
const StatusMessage: React.FC<{ success: boolean; message: string }> = ({
  success,
  message,
}) => (
  <p className={`mt-2 ${success ? "text-green-600" : "text-red-600"}`}>
    {message}
  </p>
);

const TokenInfoDisplay: React.FC<{ tokenInfo: TokenInfo }> = ({
  tokenInfo,
}) => (
  <div className="mt-4 p-4 bg-default-100 border border-default-400 rounded">
    <h2 className="font-bold text-default-800">Token Information:</h2>
    <p>Access Token: {tokenInfo.accessToken.substring(0, 10)}...</p>
    <p>Expires In: {tokenInfo.expiresIn} seconds</p>
    <p>Token Type: {tokenInfo.tokenType}</p>
  </div>
);

const ErrorDetails: React.FC<{ error?: string; details?: any }> = ({
  error,
  details,
}) => (
  <div className="mt-4 p-4 bg-red-100 border border-red-400 rounded">
    <h2 className="font-bold text-red-800">Error Details:</h2>
    <p>{error}</p>
    {details && (
      <pre className="mt-2 overflow-x-auto">
        {JSON.stringify(details, null, 2)}
      </pre>
    )}
  </div>
);

const SubmissionResult: React.FC<{ response: SubmissionResponse }> = ({
  response,
}) => (
  <div className="mt-4 p-4 bg-green-100 border border-green-400 rounded">
    <h3 className="font-bold text-green-800">Submission Details</h3>
    <p>Message: {response.message}</p>
    <p>Submission ID: {response.submissionUid}</p>
  </div>
);

const EInvoisPage: React.FC = () => {
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(
    null
  );
  const [submissionResponse, setSubmissionResponse] =
    useState<SubmissionResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const connectToMyInvois = useCallback(async () => {
    const storedLoginData = localStorage.getItem("myInvoisLoginData");
    if (storedLoginData) {
      const parsedData: LoginResponse = JSON.parse(storedLoginData);
      if (isTokenValid(parsedData)) {
        setLoginResponse(parsedData);
        return;
      }
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/einvoice/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data: LoginResponse = await response.json();
      if (data.success && data.tokenInfo) {
        const loginDataWithTime = {
          ...data,
          tokenCreationTime: Date.now(),
        };
        localStorage.setItem(
          "myInvoisLoginData",
          JSON.stringify(loginDataWithTime)
        );
        setLoginResponse(loginDataWithTime);
      } else {
        setLoginResponse(data);
      }
    } catch (err) {
      setLoginResponse({
        success: false,
        message: "An error occurred while connecting to MyInvois API.",
        apiEndpoint: "Unknown",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    connectToMyInvois();
  }, [connectToMyInvois]);

  useEffect(() => {
    const checkTokenValidity = () => {
      if (loginResponse && !isTokenValid(loginResponse)) {
        toast.error(
          "Your session has expired. Please refresh the page to log in again."
        );
        setLoginResponse(null);
        localStorage.removeItem("myInvoisLoginData");
      }
    };

    const intervalId = setInterval(checkTokenValidity, 60000); // Check every minute

    return () => clearInterval(intervalId);
  }, [loginResponse]);

  const isTokenValid = (loginData: LoginResponse): boolean => {
    if (!loginData.tokenInfo || !loginData.tokenCreationTime) return false;
    const expirationTime =
      loginData.tokenCreationTime + loginData.tokenInfo.expiresIn * 1000;
    return Date.now() < expirationTime;
  };

  const handleSubmitInvoice = async () => {
    if (
      !loginResponse ||
      !loginResponse.success ||
      !isTokenValid(loginResponse)
    ) {
      toast.error(
        "Your session has expired. Please refresh the page to log in again."
      );
      return;
    }

    setIsSubmitting(true);
    setSubmissionResponse(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/einvoice/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${loginResponse.tokenInfo?.accessToken}`,
        },
      });
      const data: SubmissionResponse = await response.json();
      if (data.success) {
        toast.success(data.message);
        setSubmissionResponse(data);
      } else {
        toast.error(data.message || "Submission failed. Please try again.");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unknown error occurred during submission";
      toast.error(errorMessage);
      console.error("Submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!loginResponse) {
    return (
      <div className="text-center mt-8">Connecting to MyInvois API...</div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">
        MyInvois API Connection Status
      </h1>
      <StatusMessage
        success={loginResponse.success}
        message={loginResponse.message}
      />
      <p className="mt-2">API Endpoint: {loginResponse.apiEndpoint}</p>

      {loginResponse.success && loginResponse.tokenInfo && (
        <TokenInfoDisplay tokenInfo={loginResponse.tokenInfo} />
      )}

      {!loginResponse.success && (
        <ErrorDetails
          error={loginResponse.error}
          details={loginResponse.details}
        />
      )}

      <Button
        variant="outline"
        onClick={handleSubmitInvoice}
        disabled={!loginResponse.success || isSubmitting}
        additionalClasses="mt-6"
      >
        {isSubmitting ? "Submitting..." : "Submit Invoice"}
      </Button>

      {submissionResponse && <SubmissionResult response={submissionResponse} />}
    </div>
  );
};

export default EInvoisPage;

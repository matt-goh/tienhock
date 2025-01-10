import { useEffect, useState, useCallback, useRef } from "react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import toast from "react-hot-toast";
import {
  IconFileInvoice,
  IconCalendar,
  IconPlug,
  IconX,
  IconAlertTriangle,
  IconInfoCircle,
} from "@tabler/icons-react";
import { InvoiceData } from "../../types/types";
import { api } from "../../routes/utils/api";

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

interface SubmissionInfo {
  startDate: Date;
  endDate: Date;
  selectedInvoices: InvoiceData[];
}

interface SubmissionResponse {
  message: string;
  submissionUid: string;
  success: boolean;
}

interface MyInvoisError {
  success?: boolean;
  message: string;
  error?: string;
  details?: any;
}

interface EInvoisMenuProps {
  selectedInvoices: InvoiceData[];
}

const ApiStatusDisplay: React.FC<{ loginResponse: LoginResponse }> = ({
  loginResponse,
}) => (
  <div
    className={`flex items-center gap-2 p-4 rounded-lg ${
      loginResponse.success
        ? "bg-green-50 border border-green-200"
        : "bg-red-50 border border-red-200"
    }`}
  >
    <IconPlug
      size={20}
      className={loginResponse.success ? "text-green-600" : "text-red-600"}
    />
    <div className="flex-1">
      <p
        className={`font-medium ${
          loginResponse.success ? "text-green-600" : "text-red-600"
        }`}
      >
        {loginResponse.message}
      </p>
      <p className="text-sm text-default-600">{loginResponse.apiEndpoint}</p>
      {loginResponse.error && (
        <p className="text-sm text-red-600 mt-1">{loginResponse.error}</p>
      )}
    </div>
  </div>
);

const ErrorDisplay: React.FC<{ error: any }> = ({ error }) => {
  // Parse the error message from the MyInvois API response
  try {
    // Handle both string error and error object
    let jsonStr = typeof error === "string" ? error : error.error;

    // Extract JSON string from "Document rejected: [...]"
    if (jsonStr.includes("Document rejected:")) {
      jsonStr = jsonStr.substring(
        jsonStr.indexOf("["),
        jsonStr.lastIndexOf("]") + 1
      );
    }

    const errorObj = JSON.parse(jsonStr);
    const mainError = errorObj[0].error;
    const validationDetail = mainError.details[0];

    return (
      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start gap-2">
          <IconAlertTriangle className="text-red-600 mt-1" size={20} />
          <div className="space-y-3 flex-1">
            <div>
              <h3 className="font-semibold text-red-700">Validation Error</h3>
              <p className="text-sm text-red-600 mt-1">
                {validationDetail.message}
              </p>
            </div>

            <div className="bg-white/50 p-3 rounded border border-red-100 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-red-500 font-medium">Error Code</p>
                  <p className="text-red-700">{validationDetail.code}</p>
                </div>
                <div>
                  <p className="text-red-500 font-medium">Invoice Number</p>
                  <p className="text-red-700">
                    #{errorObj[0].invoiceCodeNumber}
                  </p>
                </div>
              </div>

              {validationDetail.target && (
                <div className="text-xs">
                  <p className="text-red-500 font-medium">Target</p>
                  <p className="text-red-700">{validationDetail.target}</p>
                </div>
              )}

              {validationDetail.propertyPath && (
                <div className="text-xs">
                  <p className="text-red-500 font-medium">Property Path</p>
                  <p className="text-red-700 font-mono text-[10px]">
                    {validationDetail.propertyPath}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } catch (e) {
    // Fallback for unparseable errors
    const errorMessage =
      typeof error === "string"
        ? error
        : error.message || "An unknown error occurred";
    return (
      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start gap-2">
          <IconAlertTriangle className="text-red-600 mt-1" size={20} />
          <div>
            <h3 className="font-semibold text-red-700">Submission Failed</h3>
            <p className="text-sm text-red-600 mt-1">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }
};

const formatDate = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const SubmissionInfoDisplay: React.FC<{ info: SubmissionInfo }> = ({
  info,
}) => {
  // Calculate actual date range from selected invoices
  const getDateRange = () => {
    if (info.selectedInvoices.length === 0) {
      return { start: new Date(), end: new Date() };
    }

    const timestamps = info.selectedInvoices.map((invoice) => {
      // Handle DD/MM/YYYY format
      const [day, month, year] = invoice.date.split("/").map(Number);
      return new Date(year, month - 1, day).getTime();
    });

    return {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps)),
    };
  };

  const dateRange = getDateRange();

  return (
    <div className="mt-4 space-y-4">
      {/* Date Range Section */}
      <div className="p-4 bg-default-50 border border-default-200 rounded-lg">
        <div className="flex items-center gap-3">
          <IconCalendar size={20} className="text-default-500" />
          <div>
            <p className="text-sm font-medium text-default-800">
              {formatDate(dateRange.start)} - {formatDate(dateRange.end)}
            </p>
            <p className="text-xs text-default-500">Submission Date Range</p>
          </div>
        </div>
      </div>

      {/* Selected Invoices Section */}
      <div className="bg-default-50 border border-default-200 rounded-lg">
        <div className="p-4 border-b border-default-200">
          <h3 className="font-medium text-default-800">
            Selected Invoices ({info.selectedInvoices.length})
          </h3>
        </div>
        <div className="divide-y divide-default-200 max-h-60 overflow-y-auto">
          {info.selectedInvoices.map((invoice) => (
            <div key={invoice.id} className="p-4 bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-default-800">
                    #{invoice.invoiceno}
                  </p>
                  <p className="text-sm text-default-600 mt-1">
                    {invoice.customername || "N/A"}
                  </p>
                </div>
                <p className="text-sm text-default-500">{invoice.date}</p>
              </div>
              <div className="mt-1 flex gap-2 text-xs">
                <span className="text-default-500">
                  Order: {invoice.orderno}
                </span>
                <span className="text-default-500">
                  Type: {invoice.type === "I" ? "Invoice" : "Credit Note"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const EInvoisMenu: React.FC<EInvoisMenuProps> = ({ selectedInvoices }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(
    null
  );
  const [submissionError, setSubmissionError] = useState<
    MyInvoisError | string | null
  >(null);
  const [submissionResponse, setSubmissionResponse] =
    useState<SubmissionResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionPhase, setSubmissionPhase] = useState<
    | "INITIALIZATION"
    | "VALIDATION"
    | "SUBMISSION"
    | "CONFIRMATION"
    | "COOLDOWN"
    | null
  >(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (submissionResponse?.success) {
      timeoutId = setTimeout(() => {
        setSubmissionResponse(null);
      }, 5000); // 5 seconds timeout
    }

    // Cleanup function to clear timeout if component unmounts or submission response changes
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [submissionResponse]);

  const isTokenValid = useCallback((loginData: LoginResponse): boolean => {
    if (!loginData.tokenInfo || !loginData.tokenCreationTime) return false;
    const expirationTime =
      loginData.tokenCreationTime + loginData.tokenInfo.expiresIn * 1000;
    return Date.now() < expirationTime;
  }, []);

  const connectToMyInvois = useCallback(async () => {
    const storedLoginData = localStorage.getItem("myInvoisLoginData");
    if (storedLoginData) {
      const parsedData = JSON.parse(storedLoginData);
      if (isTokenValid(parsedData)) {
        setLoginResponse(parsedData);
        return;
      }
    }

    try {
      const data = await api.post("/api/einvoice/login");
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
  }, [isTokenValid]);

  useEffect(() => {
    if (isOpen) {
      connectToMyInvois();
    }
  }, [isOpen, connectToMyInvois]);

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
  }, [loginResponse, isTokenValid]);

  const handleSubmitInvoice = async () => {
    if (!loginResponse?.success || !isTokenValid(loginResponse)) {
      toast.error(
        "Your session has expired. Please refresh the page to log in again."
      );
      return;
    }

    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice to submit");
      return;
    }

    setIsSubmitting(true);
    setSubmissionResponse(null);
    setSubmissionError(null);

    try {
      const invoiceId = selectedInvoices[0].id;

      // Simulate phases for better UX
      setSubmissionPhase("INITIALIZATION");
      await new Promise((resolve) => setTimeout(resolve, 800));

      setSubmissionPhase("VALIDATION");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setSubmissionPhase("SUBMISSION");
      const data = await api.post("/api/einvoice/submit", { invoiceId });

      setSubmissionPhase("CONFIRMATION");
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (data.success) {
        setSubmissionPhase("COOLDOWN");
        await new Promise((resolve) => setTimeout(resolve, 500));
        toast.success(data.message);
        setSubmissionResponse(data);
      } else {
        // Pass the entire error response object
        setSubmissionError(data);
        toast.error("Invoice validation failed.");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unknown error occurred during submission";
      setSubmissionError({ message: errorMessage });
      toast.error("Submission failed.");
      console.error("Submission error:", err);
    } finally {
      setIsSubmitting(false);
      setSubmissionPhase(null);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        icon={IconFileInvoice}
        variant="outline"
      >
        e-Invois
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[450px] bg-white rounded-xl shadow-xl border border-default-200 z-10">
          {submissionPhase && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-xl">
              <div className="flex flex-col items-center space-y-4 p-6 rounded-lg text-center">
                <LoadingSpinner size="lg" hideText />
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-default-900">
                    {submissionPhase === "INITIALIZATION"
                      ? "Preparing Submission"
                      : submissionPhase === "VALIDATION"
                      ? "Validating Invoice Data"
                      : submissionPhase === "SUBMISSION"
                      ? "Submitting to MyInvois"
                      : submissionPhase === "CONFIRMATION"
                      ? "Confirming Submission"
                      : submissionPhase === "COOLDOWN"
                      ? "Finalizing Submission"
                      : "Processing Submission"}
                  </h3>
                  <p className="text-default-600">
                    {submissionPhase === "INITIALIZATION"
                      ? "Preparing invoice data for submission..."
                      : submissionPhase === "VALIDATION"
                      ? "Validating invoice format and contents..."
                      : submissionPhase === "SUBMISSION"
                      ? "Submitting invoice to MyInvois API..."
                      : submissionPhase === "CONFIRMATION"
                      ? "Verifying submission status..."
                      : submissionPhase === "COOLDOWN"
                      ? "Completing submission process..."
                      : "Please wait while your invoice is being processed"}
                  </p>
                  <p className="text-sm text-default-500">
                    Please do not close this window or refresh the page
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 border-b border-default-200">
            <h2 className="text-lg font-semibold text-default-900">
              Submit to MyInvois
            </h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-default-500 hover:text-default-700 transition-colors"
            >
              <IconX size={20} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {!loginResponse ? (
              <div className="py-8 text-center text-default-600">
                <div className="animate-spin w-6 h-6 border-2 border-default-600 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p>Connecting to MyInvois API...</p>
              </div>
            ) : (
              <>
                <ApiStatusDisplay loginResponse={loginResponse} />

                <SubmissionInfoDisplay
                  info={{
                    startDate: new Date(),
                    endDate: new Date(),
                    selectedInvoices,
                  }}
                />

                {submissionError && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-red-800 mb-2">
                      Submission Error Details:
                    </h3>
                    <ErrorDisplay error={submissionError} />
                  </div>
                )}

                {selectedInvoices.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <IconInfoCircle
                        size={20}
                        className="flex-shrink-0 mt-0.5 text-amber-500"
                      />
                      <div className="space-y-1">
                        <p className="font-medium text-amber-800">
                          Please select invoices to submit to MyInvois
                        </p>
                        <p className="text-sm text-amber-700">
                          It is recommended to submit via batches instead of
                          single document per submission.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={handleSubmitInvoice}
                    disabled={isSubmitting || !loginResponse.success}
                    className="w-full justify-center"
                    variant={loginResponse.success ? "default" : "outline"}
                  >
                    {isSubmitting
                      ? "Submitting..."
                      : "Submit Selected Invoices"}
                  </Button>
                )}

                {submissionResponse?.success && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="font-semibold text-green-700 mb-1">
                      Submission Successful
                    </h3>
                    <p className="text-sm text-green-600">
                      {submissionResponse.message}
                    </p>
                    <p className="text-xs text-green-500 mt-2">
                      Submission ID: {submissionResponse.submissionUid}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EInvoisMenu;

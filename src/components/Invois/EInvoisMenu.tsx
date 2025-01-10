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
  IconCheck,
} from "@tabler/icons-react";
import { InvoiceData, SubmissionResponse } from "../../types/types";
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

interface MyInvoisError {
  success?: boolean;
  message: string;
  error?: string;
  details?: any;
}

interface EInvoisMenuProps {
  selectedInvoices: InvoiceData[];
  onSubmissionComplete?: () => void;
  clearSelection?: (() => void) | null;
}

const formatDate = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const ApiStatusDisplay: React.FC<{ loginResponse: LoginResponse }> = ({
  loginResponse,
}) => (
  <div
    className={`flex items-center gap-2 p-4 rounded-lg ${
      loginResponse.success
        ? "bg-green-50 border border-green-300"
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

const SuccessDisplay: React.FC<{
  response: SubmissionResponse;
  onClose: () => void;
}> = ({ response, onClose }) => {
  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col max-h-[600px]">
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center gap-3 text-green-600">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <IconCheck size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-green-700">
              Submission Successful
            </h2>
            <p className="text-green-600">{response.message}</p>
          </div>
        </div>

        {response.submissionInfo && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-green-700">
                  Submission ID
                </p>
                <p
                  className="text-green-600 truncate"
                  title={response.submissionInfo.submissionUid}
                >
                  {response.submissionInfo.submissionUid}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700">Status</p>
                <p className="text-green-600">
                  {response.submissionInfo.overallStatus}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700">Documents</p>
                <p className="text-green-600">
                  {response.acceptedDocuments.length}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700">Received</p>
                <p className="text-green-600">
                  {formatDateTime(response.submissionInfo.dateTimeReceived)}
                </p>
              </div>
            </div>
          </div>
        )}

        {response.acceptedDocuments?.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium text-green-700">Accepted Documents</h3>
            <div className="space-y-2">
              {response.acceptedDocuments.map((doc) => (
                <div
                  key={doc.uuid}
                  className="bg-green-50 border border-green-300 p-3 rounded-lg"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-green-700">
                      #{doc.internalId}
                    </span>
                    <span className="text-green-600 text-sm">{doc.status}</span>
                  </div>
                  <div className="text-sm text-green-600 space-y-1">
                    <p className="font-mono">{doc.uuid}</p>
                    <p>{formatDateTime(doc.dateTimeValidated)}</p>
                    <p>Amount: RM {doc.totalPayableAmount.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-default-200">
        <Button
          onClick={onClose}
          className="w-full justify-center"
          variant="outline"
        >
          Done
        </Button>
      </div>
    </div>
  );
};

const ErrorDisplay: React.FC<{ error: any }> = ({ error }) => {
  const errorMessage =
    typeof error === "string"
      ? error
      : error.message || "An unknown error occurred";
  return (
    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-2">
        <IconAlertTriangle className="text-red-600 mt-1" size={20} />
        <div>
          <h3 className="font-semibold text-red-700">
            Submission Failed or Invalid.
          </h3>
          <p className="text-sm text-red-600 mt-1">{errorMessage}</p>
        </div>
      </div>
    </div>
  );
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
                  Type: {invoice.type === "I" ? "Invoice" : "Cash"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const EInvoisMenu: React.FC<EInvoisMenuProps> = ({
  selectedInvoices,
  onSubmissionComplete,
  clearSelection,
}) => {
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
      // Simulate phases for better UX
      setSubmissionPhase("INITIALIZATION");
      await new Promise((resolve) => setTimeout(resolve, 800));

      setSubmissionPhase("VALIDATION");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Process invoices in batches of 100
      const batchSize = 100;
      let successfulSubmissions = [];
      let failedSubmissions = [];

      // Split invoices into batches
      for (let i = 0; i < selectedInvoices.length; i += batchSize) {
        const batch = selectedInvoices.slice(i, i + batchSize);
        const batchIds = batch.map((invoice) => invoice.id);
        const currentBatch = Math.floor(i / batchSize) + 1;

        setSubmissionPhase("SUBMISSION");
        const batchMessage = `Submitting batch...`;
        toast.loading(batchMessage, { id: "submission-progress" });

        try {
          const response = await api.post("/api/einvoice/submit", {
            invoiceIds: batchIds,
            batchSize: batch.length,
          });

          if (response.success) {
            successfulSubmissions.push({
              ...response,
              batchNumber: currentBatch,
              invoices: batch,
            });
          } else {
            failedSubmissions.push({
              batch: currentBatch,
              error: response.error || response.message,
              details: response.details,
              invoices: batch,
            });
          }
        } catch (err) {
          failedSubmissions.push({
            batch: currentBatch,
            error: err instanceof Error ? err.message : "Unknown error",
            invoices: batch,
          });
        }

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      setSubmissionPhase("CONFIRMATION");
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Clear the progress toast
      toast.dismiss("submission-progress");

      if (successfulSubmissions.length > 0) {
        setSubmissionPhase("COOLDOWN");
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Get the latest successful submission
        const latestSubmission =
          successfulSubmissions[successfulSubmissions.length - 1];

        // Extract submission info from the response
        const submissionResult = latestSubmission.submissionResults[0];

        setSubmissionResponse({
          success: true,
          message: `Successfully submitted ${
            submissionResult.acceptedDocuments.length
          } invoice${
            submissionResult.acceptedDocuments.length !== 1 ? "s" : ""
          }`,
          submissionInfo: {
            submissionUid: submissionResult.submissionUid,
            documentCount: submissionResult.acceptedDocuments.length,
            dateTimeReceived:
              submissionResult.acceptedDocuments[0]?.dateTimeReceived ||
              new Date().toISOString(),
            overallStatus:
              submissionResult.acceptedDocuments[0]?.status || "Valid",
          },
          acceptedDocuments: submissionResult.acceptedDocuments,
          rejectedDocuments: [],
        });

        toast.success(
          `Successfully submitted ${
            submissionResult.acceptedDocuments.length
          } invoice${
            submissionResult.acceptedDocuments.length !== 1 ? "s" : ""
          }`
        );
      }

      if (failedSubmissions.length > 0) {
        const totalFailed = failedSubmissions.reduce(
          (acc, curr) => acc + curr.invoices.length,
          0
        );

        setSubmissionError({
          message: `Failed to submit ${totalFailed} invoice${
            totalFailed !== 1 ? "s" : ""
          }. Please contact admin if problem persists.`,
        });

        toast.error(
          `${totalFailed} submission${totalFailed !== 1 ? "s" : ""} failed.`
        );
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

  const handleClose = () => {
    setIsOpen(false);
    setSubmissionResponse(null);
    setSubmissionError(null);
    setSubmissionPhase(null);
    if (clearSelection) {
      clearSelection();
    }
    if (onSubmissionComplete) {
      onSubmissionComplete();
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
          {submissionResponse?.success ? (
            <SuccessDisplay
              response={submissionResponse}
              onClose={handleClose}
            />
          ) : (
            <>
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
                              1. Invoice date must be within 3 days before
                              today.
                            </p>
                            <p className="text-sm text-amber-700">
                              2. TIN number is recommended to be assigned to the involved customer in catalogue.
                            </p>
                            <p className="text-sm text-amber-700">
                              3. It is recommended to submit via batches instead
                              of single document per submission.
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
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EInvoisMenu;

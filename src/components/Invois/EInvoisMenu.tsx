import React, { useEffect, useState, useCallback } from "react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import toast from "react-hot-toast";
import {
  IconFileInvoice,
  IconInfoCircle,
  IconCheck,
} from "@tabler/icons-react";
import {
  InvoiceData,
  MyInvoisError,
  SubmissionResponse,
  LoginResponse,
  SubmissionInfo,
} from "../../types/types";
import { api } from "../../routes/utils/api";
import ErrorDisplay from "./ErrorDisplay";
import InvoisModalContainer from "./InvoisModalContainer";

// Local components
const SubmissionInfoDisplay: React.FC<{ info: SubmissionInfo }> = ({
  info,
}) => {
  // Calculate actual date range from selected invoices
  const getDateRange = () => {
    if (info.selectedInvoices.length === 0) {
      return { start: new Date(), end: new Date() };
    }

    const timestamps = info.selectedInvoices.map((invoice: any) => {
      const [day, month, year] = invoice.date.split("/").map(Number);
      return new Date(year, month - 1, day).getTime();
    });

    return {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps)),
    };
  };

  const dateRange = getDateRange();
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-4">
      {/* Selected Invoices Section */}
      <div className="bg-default-50 border border-default-200 rounded-lg">
        <div
          className={`${
            info.selectedInvoices.length > 0
              ? "border-b border-default-200"
              : ""
          } p-4`}
        >
          <h3 className="font-medium text-default-800">
            Selected Invoices ({info.selectedInvoices.length})
          </h3>
        </div>
        <div className="divide-y divide-default-200 max-h-60 overflow-y-auto">
          {info.selectedInvoices.map((invoice: any) => (
            <div key={invoice.id} className="p-4 bg-white rounded-lg">
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

interface EInvoisMenuProps {
  selectedInvoices: InvoiceData[];
  onSubmissionComplete?: () => void;
  clearSelection?: (() => void) | null;
}

const EInvoisMenu: React.FC<EInvoisMenuProps> = ({
  selectedInvoices,
  onSubmissionComplete,
  clearSelection,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showApiStatus, setShowApiStatus] = useState(true);
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

  // Token validation and login handling
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

  // Handle token expiration
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

    const intervalId = setInterval(checkTokenValidity, 60000);
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
      setSubmissionPhase("INITIALIZATION");
      await new Promise((resolve) => setTimeout(resolve, 800));

      setSubmissionPhase("VALIDATION");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        const response = await api.post("/api/einvoice/submit", {
          invoiceIds: selectedInvoices.map((invoice) => invoice.id),
          batchSize: selectedInvoices.length,
        });

        console.log("API Response:", response);

        if (!response.success && response.shouldStopAtValidation) {
          setSubmissionPhase(null);

          // Combine validation errors and failed invoices
          const validationErrors = response.validationErrors || [];

          if (validationErrors.length > 0) {
            const errorObj = {
              message: `${validationErrors.length} invoice(s) failed validation`,
              validationErrors: validationErrors.map((error: any) => ({
                invoiceNo: error.invoiceNo,
                errors: Array.isArray(error.errors)
                  ? error.errors
                  : [error.errors],
                type: "validation",
              })),
            };

            console.log("Setting validation error:", errorObj);
            setSubmissionError(errorObj);
            toast.error(errorObj.message);
          } else {
            setSubmissionError({
              message: response.message || "Validation failed",
              validationErrors: [],
            });
            toast.error(response.message || "Validation failed");
          }
          return;
        }

        // Handle successful submission
        if (response.success && response.submissionResults?.length > 0) {
          setSubmissionPhase("SUBMISSION");
          setSubmissionPhase("CONFIRMATION");
          await new Promise((resolve) => setTimeout(resolve, 500));
          setSubmissionPhase("COOLDOWN");
          await new Promise((resolve) => setTimeout(resolve, 500));

          const submissionResult = response.submissionResults[0];
          if (submissionResult.acceptedDocuments?.length > 0) {
            setSubmissionResponse({
              success: true,
              message: response.message,
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
            toast.success(response.message);
          }
        }
      } catch (error: any) {
        console.log("Caught API error:", error);

        // Check for validation errors in the error object
        if (error.validationErrors?.length > 0) {
          const errorObj = {
            message: `${error.validationErrors.length} invoice(s) failed validation`,
            validationErrors: error.validationErrors.map((ve: any) => ({
              invoiceNo: ve.invoiceNo,
              errors: Array.isArray(ve.errors)
                ? ve.errors
                : [ve.errors || error.message],
              type: "validation",
            })),
          };

          console.log("Setting error state from catch:", errorObj);
          setSubmissionError(errorObj);
          toast.error(errorObj.message);
        } else {
          setSubmissionError({
            message: error.message || "An error occurred during submission",
            validationErrors: [],
          });
          toast.error(error.message || "Submission failed");
        }
      }
    } finally {
      setIsSubmitting(false);
      if (!submissionResponse) {
        setSubmissionPhase(null);
      }
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
    <div className="relative inline-block text-left">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        icon={IconFileInvoice}
        variant="outline"
      >
        e-Invois
      </Button>

      <InvoisModalContainer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        loginResponse={loginResponse}
        showApiStatus={showApiStatus}
      >
        {submissionPhase ? (
          <div className="absolute inset-0 bg-white/95 rounded-b-xl z-10">
            <div className="h-full flex items-center justify-center">
              <div className="text-center px-4">
                <LoadingSpinner size="md" hideText />
                <div className="mt-3">
                  <h3 className="text-default-900 font-medium">
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
                  <p className="text-default-600 text-sm mt-1">
                    {submissionPhase === "INITIALIZATION"
                      ? "Preparing invoice data..."
                      : submissionPhase === "VALIDATION"
                      ? "Validating format and contents..."
                      : submissionPhase === "SUBMISSION"
                      ? "Submitting to MyInvois..."
                      : submissionPhase === "CONFIRMATION"
                      ? "Verifying status..."
                      : submissionPhase === "COOLDOWN"
                      ? "Completing submission..."
                      : "Please wait..."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <SubmissionInfoDisplay
              info={{
                startDate: new Date(),
                endDate: new Date(),
                selectedInvoices,
              }}
            />
            {submissionError && (
              <div className="mt-4 mb-4">
                <h3 className="text-sm font-medium text-red-800 mb-2">
                  Submission Error:
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
                      1. Invoice date must be in the past 3 days.
                    </p>
                    <p className="text-sm text-amber-700">
                      2. TIN number is recommended to be assigned to the
                      involved customer(s) in catalogue.
                    </p>
                    <p className="text-sm text-amber-700">
                      3. It is recommended to submit in batches of up to 100
                      documents instead of single document per submission.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <Button
                  onClick={handleSubmitInvoice}
                  disabled={isSubmitting || !loginResponse?.success}
                  className="w-full justify-center"
                  variant={loginResponse?.success ? "default" : "outline"}
                >
                  {isSubmitting ? "Submitting..." : "Submit Selected Invoices"}
                </Button>
              </div>
            )}
          </>
        )}
      </InvoisModalContainer>
    </div>
  );
};

export default EInvoisMenu;

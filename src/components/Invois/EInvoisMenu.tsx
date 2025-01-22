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
  SubmissionPhase,
} from "../../types/types";
import { api } from "../../routes/utils/api";
import ErrorDisplay from "./ErrorDisplay";
import InvoisModalContainer from "./InvoisModalContainer";
import ValidationStatus from "./ValidationStatus";

const PHASE_DELAYS = {
  INITIALIZATION: 300,
  VALIDATION: 500,
  SUBMISSION: 500,
  CONFIRMATION: 300,
  COOLDOWN: 200,
} as const;

// Local components
const SubmissionInfoDisplay: React.FC<{ info: SubmissionInfo }> = ({
  info,
}) => {
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
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(
    null
  );
  const [submissionError, setSubmissionError] = useState<
    MyInvoisError | string | null
  >(null);
  const [submissionResponse, setSubmissionResponse] =
    useState<SubmissionResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submissionPhase, setSubmissionPhase] =
    useState<SubmissionPhase | null>(null);

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
    // Check token validity
    if (!loginResponse?.success || !isTokenValid(loginResponse)) {
      toast.error(
        "Your session has expired. Please refresh the page to log in again."
      );
      return;
    }

    // Check if invoices are selected
    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice to submit");
      return;
    }

    try {
      // Reset states
      setIsSubmitting(true);
      setSubmissionResponse(null);
      setSubmissionError(null);

      // Initialization phase
      setSubmissionPhase("INITIALIZATION");
      await new Promise((resolve) =>
        setTimeout(resolve, PHASE_DELAYS.INITIALIZATION)
      );

      // Validation phase
      setSubmissionPhase("VALIDATION");
      await new Promise((resolve) =>
        setTimeout(resolve, PHASE_DELAYS.VALIDATION)
      );

      try {
        const response = await api.post("/api/einvoice/submit", {
          invoiceIds: selectedInvoices.map((invoice) => invoice.id),
          batchSize: selectedInvoices.length,
        });

        // Handle validation phase
        if (!response.success && response.shouldStopAtValidation) {
          setSubmissionPhase(null);

          // Get validation errors from either source
          const validationErrors = [
            ...(response.validationErrors || []),
            ...(response.failedInvoices || []).map((fail: any) => ({
              invoiceNo: fail.invoiceNo,
              errors: Array.isArray(fail.errors)
                ? fail.errors.map((err: any) => {
                    // Extract actual validation message if it's in the error string
                    if (typeof err === "string") {
                      if (err.includes("Invoice date must be within")) {
                        return err;
                      }
                      if (err.includes("Failed to transform invoice:")) {
                        const match = err.match(
                          /Invoice validation failed: (.+)/
                        );
                        return match ? match[1] : err;
                      }
                    }
                    return err;
                  })
                : [fail.errors],
              type: "validation",
            })),
          ];

          if (validationErrors.length > 0) {
            setSubmissionError({
              message: `${validationErrors.length} invoice(s) failed validation`,
              validationErrors: validationErrors,
            });
            toast.error(
              `${validationErrors.length} invoice(s) failed validation`
            );
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
          // Submission phase
          setSubmissionPhase("SUBMISSION");
          await new Promise((resolve) =>
            setTimeout(resolve, PHASE_DELAYS.SUBMISSION)
          );

          // Confirmation phase
          setSubmissionPhase("CONFIRMATION");
          await new Promise((resolve) =>
            setTimeout(resolve, PHASE_DELAYS.CONFIRMATION)
          );

          // Cooldown phase
          setSubmissionPhase("COOLDOWN");
          await new Promise((resolve) =>
            setTimeout(resolve, PHASE_DELAYS.COOLDOWN)
          );

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
        // Handle validation errors from error object
        if (error.validationErrors?.length > 0) {
          const errorObj = {
            message: `${error.validationErrors.length} invoice(s) failed validation`,
            validationErrors: error.validationErrors.map((ve: any) => ({
              invoiceNo: ve.invoiceNo,
              errors: Array.isArray(ve.errors)
                ? ve.errors.map((err: any) => {
                    if (typeof err === "string") {
                      if (err.includes("Invoice date must be within")) {
                        return err;
                      }
                      if (err.includes("Failed to transform invoice:")) {
                        const match = err.match(
                          /Invoice validation failed: (.+)/
                        );
                        return match ? match[1] : err;
                      }
                    }
                    return err;
                  })
                : [ve.errors || error.message],
              type: "validation",
            })),
          };

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
        submissionResponse={submissionResponse}
        handleClose={handleClose}
      >
        {submissionPhase ? (
          <ValidationStatus
            phase={
              submissionPhase === "COOLDOWN" ? "CONFIRMATION" : submissionPhase
            }
            totalInvoices={selectedInvoices.length}
          />
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
                <ErrorDisplay error={submissionError} />
              </div>
            )}
            {selectedInvoices.length === 0 ? (
              <div className="p-4 mt-3 bg-amber-50 border border-amber-200 rounded-lg">
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
                      2. TIN number must be assigned to the involved customer(s)
                      in catalogue.
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

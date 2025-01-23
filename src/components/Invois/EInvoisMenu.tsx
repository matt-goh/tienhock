// src/components/Invoice/EInvoisMenu.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import Button from "../Button";
import toast from "react-hot-toast";
import { IconFileInvoice, IconInfoCircle } from "@tabler/icons-react";
import {
  DocumentStatus,
  InvoiceData,
  LoginResponse,
  SubmissionState,
} from "../../types/types";
import { api } from "../../routes/utils/api";
import { SubmissionHandler } from "./SubmissionHandler";
import InvoisModalContainer from "./InvoisModalContainer";
import { SubmissionDisplay } from "./SubmissionDisplay";

// Extracted info component for better organization
const SelectedInvoicesInfo: React.FC<{ selectedInvoices: InvoiceData[] }> = ({
  selectedInvoices,
}) => (
  <div className="bg-default-50 border border-default-200 rounded-lg">
    <div
      className={`${
        selectedInvoices.length > 0 ? "border-b border-default-200" : ""
      } p-4`}
    >
      <h3 className="font-medium text-default-800">
        Selected Invoices ({selectedInvoices.length})
      </h3>
    </div>
    <div className="divide-y divide-default-200 max-h-60 overflow-y-auto">
      {selectedInvoices.map((invoice) => (
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
            <span className="text-default-500">Order: {invoice.orderno}</span>
            <span className="text-default-500">
              Type: {invoice.type === "I" ? "Invoice" : "Cash"}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Empty state info box
const InfoBox: React.FC = () => (
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
          2. TIN number must be assigned to the involved customer(s) in
          catalogue.
        </p>
        <p className="text-sm text-amber-700">
          3. It is recommended to submit in batches of up to 100 documents
          instead of single document per submission.
        </p>
      </div>
    </div>
  </div>
);

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
  const [submissionState, setSubmissionState] =
    useState<SubmissionState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Token validation
  const isTokenValid = useCallback((loginData: LoginResponse): boolean => {
    if (!loginData.tokenInfo || !loginData.tokenCreationTime) return false;
    return (
      Date.now() <
      loginData.tokenCreationTime + loginData.tokenInfo.expiresIn * 1000
    );
  }, []);

  // Handle login
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
        const loginDataWithTime = { ...data, tokenCreationTime: Date.now() };
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

  // Connect on open
  useEffect(() => {
    if (isOpen) connectToMyInvois();
  }, [isOpen, connectToMyInvois]);

  // Handle token expiration
  useEffect(() => {
    if (loginResponse && !isTokenValid(loginResponse)) {
      toast.error("Your session has expired. Please refresh the page.");
      setLoginResponse(null);
      localStorage.removeItem("myInvoisLoginData");
    }
  }, [loginResponse, isTokenValid]);

  const handleSubmitInvoice = async () => {
    if (!loginResponse?.success || !isTokenValid(loginResponse)) {
      toast.error("Your session has expired. Please refresh the page.");
      return;
    }

    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice to submit");
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmissionState(null);

      const response = await api.post("/api/einvoice/submit", {
        invoiceIds: selectedInvoices.map((invoice) => invoice.id),
      });

      const documents: Record<string, DocumentStatus> = {};

      // Handle successful submissions
      response.acceptedDocuments?.forEach((doc: any) => {
        documents[doc.internalId] = {
          invoiceNo: doc.internalId,
          currentStatus: "COMPLETED",
          summary: {
            status: doc.status,
            receiverName: doc.receiverName,
          },
        };
      });

      // Handle rejected documents
      response.rejectedDocuments?.forEach((doc: any) => {
        documents[doc.invoiceCodeNumber] = {
          invoiceNo: doc.invoiceCodeNumber,
          currentStatus: "REJECTED",
          errors: [
            {
              code: doc.error.code,
              message: doc.error.message,
            },
          ],
        };
      });

      setSubmissionState({
        phase: "COMPLETED",
        tracker: {
          submissionUid: response.submissionUid || "VALIDATION_FAILED",
          batchInfo: {
            size: selectedInvoices.length,
            submittedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
          statistics: {
            totalDocuments: selectedInvoices.length,
            processed:
              (response.acceptedDocuments?.length || 0) +
              (response.rejectedDocuments?.length || 0),
            accepted: response.acceptedDocuments?.length || 0,
            rejected: response.rejectedDocuments?.length || 0,
            processing: 0,
            completed: response.acceptedDocuments?.length || 0,
          },
          documents,
          processingUpdates: [],
          overallStatus: response.overallStatus || "Invalid",
        },
      });
    } catch (error: any) {
      console.error("Submission Error:", error);
      toast.error(`Submission failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSubmissionState(null);
    if (clearSelection) clearSelection();
    if (onSubmissionComplete) onSubmissionComplete();
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
        onSubmissionClose={handleClose}
      >
        {submissionState ? (
          <SubmissionDisplay state={submissionState} onClose={handleClose} />
        ) : (
          <>
            <SelectedInvoicesInfo selectedInvoices={selectedInvoices} />
            {selectedInvoices.length === 0 ? (
              <InfoBox />
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

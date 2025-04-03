// src/components/Invoice/EInvoiceMenu.tsx
import React, { useState, useEffect, useCallback } from "react";
import Button from "../Button";
import toast from "react-hot-toast";
import { IconFileInvoice, IconInfoCircle, IconSend } from "@tabler/icons-react";
import { ExtendedInvoiceData } from "../../types/types";
import { api } from "../../routes/utils/api";
import {
  formatDisplayDate,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";

interface EInvoiceMenuProps {
  selectedInvoices: ExtendedInvoiceData[];
  onSubmissionComplete?: () => void;
  clearSelection?: (() => void) | null;
}

const EInvoiceMenu: React.FC<EInvoiceMenuProps> = ({
  selectedInvoices,
  onSubmissionComplete,
  clearSelection,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format date for display
  const formatDateTime = (timestamp: string | number) => {
    const { date } = parseDatabaseTimestamp(timestamp);
    return formatDisplayDate(date);
  };

  // Check connection to MyInvois API when menu opens
  useEffect(() => {
    if (isOpen) {
      checkApiConnection();
    }
  }, [isOpen]);

  // Check MyInvois API connection
  const checkApiConnection = async () => {
    try {
      const response = await api.post("/api/einvoice/login");
      setIsConnected(response.success);
      if (!response.success) {
        toast.error("Could not connect to MyInvois API");
      }
    } catch (err) {
      console.error("Failed to check API connection:", err);
      setIsConnected(false);
    }
  };

  // Filter eligible invoices
  const eligibleInvoices = selectedInvoices.filter(
    (invoice) =>
      invoice.invoice_status !== "cancelled" &&
      invoice.paymenttype !== "CASH" &&
      (invoice.einvoice_status === null ||
        invoice.einvoice_status === "invalid")
  );

  // Handle submit
  const handleSubmitInvoices = async () => {
    if (eligibleInvoices.length === 0) {
      toast.error("No eligible invoices to submit");
      return;
    }

    if (!isConnected) {
      toast.error("Cannot submit without connection to MyInvois API");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(
      `Submitting ${eligibleInvoices.length} invoice(s)...`
    );

    try {
      const response = await api.post("/api/einvoice/submit-system", {
        invoiceIds: eligibleInvoices.map((inv) => inv.id),
      });

      // Process response
      if (response.success) {
        const acceptedCount = response.acceptedDocuments?.length || 0;
        const rejectedCount = response.rejectedDocuments?.length || 0;

        if (acceptedCount > 0 && rejectedCount === 0) {
          toast.success(`Successfully submitted ${acceptedCount} invoice(s)`, {
            id: toastId,
          });
        } else if (acceptedCount > 0 && rejectedCount > 0) {
          toast.success(
            `Partially successful: ${acceptedCount} accepted, ${rejectedCount} rejected`,
            { id: toastId }
          );
        } else if (rejectedCount > 0) {
          toast.error(`All ${rejectedCount} invoice(s) were rejected`, {
            id: toastId,
          });
        }

        // Show rejection reasons if any
        response.rejectedDocuments?.slice(0, 3).forEach((doc: any) => {
          if (doc.error?.message) {
            toast.error(`Invoice ${doc.internalId}: ${doc.error.message}`, {
              duration: 4000,
            });
          }
        });
      } else {
        toast.error(response.message || "Submission failed", { id: toastId });
      }

      // Close menu and run completion handler
      setIsOpen(false);
      if (clearSelection) clearSelection();
      if (onSubmissionComplete) onSubmissionComplete();
    } catch (error: any) {
      console.error("Error submitting e-invoices:", error);
      toast.error(`Submission failed: ${error.message || "Unknown error"}`, {
        id: toastId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        icon={IconFileInvoice}
        variant="outline"
      >
        e-Invoice
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-14 w-[450px] bg-white rounded-xl shadow-xl border border-default-200 z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-default-200">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-default-900">
                Submit to MyInvois
              </h2>
              <div
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium 
                ${
                  isConnected
                    ? "bg-green-50 text-green-600"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-default-500 hover:text-default-700 transition-colors"
            >
              <IconInfoCircle size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* Selected Invoices */}
            <div className="bg-default-50 border border-default-200 rounded-lg">
              <div
                className={`${
                  selectedInvoices.length > 0
                    ? "border-b border-default-200"
                    : ""
                } p-4`}
              >
                <h3 className="font-medium text-default-800">
                  Selected Invoices ({selectedInvoices.length})
                </h3>
                <p className="text-sm text-default-600 mt-1">
                  Eligible for e-Invoice:{" "}
                  <span className="font-semibold">
                    {eligibleInvoices.length}
                  </span>
                </p>
              </div>

              {selectedInvoices.length > 0 ? (
                <div className="divide-y divide-default-200 max-h-60 overflow-y-auto">
                  {selectedInvoices.map((invoice) => {
                    const isEligible = eligibleInvoices.includes(invoice);

                    return (
                      <div
                        key={invoice.id}
                        className={`p-4 ${
                          isEligible ? "bg-white" : "bg-default-50"
                        } rounded-lg`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p
                              className={`font-medium ${
                                isEligible
                                  ? "text-default-800"
                                  : "text-default-400"
                              }`}
                            >
                              #{invoice.id}
                              {!isEligible && (
                                <span className="ml-2 text-xs text-rose-500">
                                  {invoice.invoice_status === "cancelled"
                                    ? "Cancelled"
                                    : invoice.paymenttype === "CASH"
                                    ? "Cash invoice"
                                    : invoice.einvoice_status === "valid" ||
                                      invoice.einvoice_status === "pending"
                                    ? `Already ${invoice.einvoice_status}`
                                    : "Not eligible"}
                                </span>
                              )}
                            </p>
                            <p
                              className={`text-sm ${
                                isEligible
                                  ? "text-default-600"
                                  : "text-default-400"
                              } mt-1`}
                            >
                              {invoice.customerid || "N/A"}
                            </p>
                          </div>
                          <p
                            className={`text-sm ${
                              isEligible
                                ? "text-default-500"
                                : "text-default-400"
                            }`}
                          >
                            {formatDateTime(invoice.createddate)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-default-500">
                  No invoices selected
                </div>
              )}
            </div>

            {/* Info Box or Submit Button */}
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
                      Only invoice-type (not cash) and non-cancelled invoices
                      that haven't been submitted before are eligible for
                      e-invoicing.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <Button
                  onClick={handleSubmitInvoices}
                  disabled={
                    isSubmitting ||
                    !isConnected ||
                    eligibleInvoices.length === 0
                  }
                  className="w-full justify-center"
                  variant={
                    isConnected && eligibleInvoices.length > 0
                      ? "default"
                      : "outline"
                  }
                  icon={IconSend}
                >
                  {isSubmitting
                    ? "Submitting..."
                    : eligibleInvoices.length === 0
                    ? "No Eligible Invoices"
                    : `Submit ${eligibleInvoices.length} Invoice(s)`}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EInvoiceMenu;

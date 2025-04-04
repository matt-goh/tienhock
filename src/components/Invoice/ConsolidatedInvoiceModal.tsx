// src/components/Invoice/ConsolidatedInvoiceModal.tsx
import React, { useState, useEffect } from "react";
import { api } from "../../routes/utils/api";
import Button from "../Button";
import LoadingSpinner from "../LoadingSpinner";
import {
  IconCircleCheck,
  IconFileInvoice, // Keep this for empty state icon, or choose another
  IconFileSettings, // Added for header
  IconSend,
  IconSquare,
  IconSquareCheckFilled, // Added for filled checkbox
  IconAlertTriangle,
  IconRefresh,
  IconClockHour4,
  IconX,
} from "@tabler/icons-react";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";
import SubmissionResultsModal from "./SubmissionResultsModal";

// ... (Keep interfaces and props the same) ...
interface ConsolidatedInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  month: number; // 0-11 (Jan-Dec)
  year: number;
}

interface EligibleInvoice {
  id: string;
  customerid: string;
  amount: number;
  rounding: number;
  totalamountpayable: number;
  createddate: string;
  products: any[];
}

interface ConsolidationHistory {
  id: string; // Consolidated invoice ID (e.g., CON-202503)
  uuid: string;
  long_id: string | null;
  submission_uid: string;
  datetime_validated: string | null;
  einvoice_status: string;
  total_excluding_tax: number;
  tax_amount: number;
  rounding: number;
  totalamountpayable: number;
  created_at: string;
  consolidated_invoices: string[];
}

const ConsolidatedInvoiceModal: React.FC<ConsolidatedInvoiceModalProps> = ({
  isOpen,
  onClose,
  month,
  year,
}) => {
  // ... (Keep state hooks the same) ...
  const [eligibleInvoices, setEligibleInvoices] = useState<EligibleInvoice[]>(
    []
  );
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(
    new Set()
  );
  const [consolidationHistory, setConsolidationHistory] = useState<
    ConsolidationHistory[]
  >([]);
  const [isLoadingEligible, setIsLoadingEligible] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoConsolidationEnabled, setIsAutoConsolidationEnabled] =
    useState(false);
  const [activeTab, setActiveTab] = useState<"eligible" | "history">(
    "eligible"
  );

  // Submission results modal
  const [showSubmissionResults, setShowSubmissionResults] = useState(false);
  const [submissionResults, setSubmissionResults] = useState<any>(null);

  // ... (Keep date formatting, effects, and functions the same) ...
  // Date formatting for display
  const monthName = new Date(year, month).toLocaleString("default", {
    month: "long",
  });

  useEffect(() => {
    if (isOpen) {
      // Reset state when opening
      setActiveTab("eligible");
      setSelectedInvoices(new Set());
      setError(null);
      // Fetch data
      fetchEligibleInvoices();
      fetchConsolidationHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only trigger on open

  // Separate effect for month/year changes while open
  useEffect(() => {
    if (isOpen) {
      fetchEligibleInvoices();
      // Optionally refetch history if it depends on month/year,
      // otherwise remove fetchConsolidationHistory() from here if it's global history
      fetchConsolidationHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, isOpen]); // Trigger if month/year change *while* open

  const fetchEligibleInvoices = async () => {
    if (!isOpen) return;

    setIsLoadingEligible(true);
    setError(null);

    try {
      const response = await api.get(
        `/api/einvoice/eligible-for-consolidation?month=${month}&year=${year}`
      );
      if (response.success) {
        setEligibleInvoices(response.data || []);
        // Clear selection when eligible list refreshes
        setSelectedInvoices(new Set());
      } else {
        setError(response.message || "Failed to fetch eligible invoices");
        setEligibleInvoices([]);
      }
    } catch (error: any) {
      console.error("Error fetching eligible invoices:", error);
      setError(error.message || "Failed to fetch eligible invoices");
      setEligibleInvoices([]);
    } finally {
      setIsLoadingEligible(false);
    }
  };

  const fetchConsolidationHistory = async () => {
    if (!isOpen) return;
    setIsLoadingHistory(true);
    try {
      const response = await api.get("/api/einvoice/consolidated-history");
      // Assuming the API returns the data directly or within a 'data' property
      setConsolidationHistory(response?.data || response || []);
    } catch (error: any) {
      console.error("Error fetching consolidation history:", error);
      // Don't set the main error state for history failures
      setConsolidationHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSelectAllInvoices = () => {
    if (eligibleInvoices.length === 0 || isLoadingEligible) return;

    if (selectedInvoices.size === eligibleInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      const allIds = new Set(eligibleInvoices.map((invoice) => invoice.id));
      setSelectedInvoices(allIds);
    }
  };

  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoices((prevSelected) => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(invoiceId)) {
        newSelected.delete(invoiceId);
      } else {
        newSelected.add(invoiceId);
      }
      return newSelected;
    });
  };

  const handleSubmitConsolidated = async () => {
    if (selectedInvoices.size === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSubmissionResults(null);
    setShowSubmissionResults(true); // Show modal immediately with loading state

    try {
      const invoicesToSubmit = Array.from(selectedInvoices);

      const response = await api.post("/api/einvoice/submit-consolidated", {
        invoices: invoicesToSubmit,
        month,
        year,
      });

      setSubmissionResults(response); // Update modal content with results

      if (response.success && response.overallStatus !== "Error") {
        // Refresh data only on full or partial success reported by backend
        fetchEligibleInvoices(); // Refreshes eligible list and clears selection
        fetchConsolidationHistory(); // Update history tab
      } else if (!response.success) {
        // If the API call itself failed or reported success: false
        // Keep selection to allow retry if needed, maybe show specific error
        console.error("Submission reported failure:", response.message);
      }
      // Keep selection if backend reports partial success or validation errors,
      // allowing user to deselect problematic ones if needed (though backend currently handles this).
      // If full success, fetchEligibleInvoices clears selection implicitly.
    } catch (error: any) {
      console.error("Error submitting consolidated invoice:", error);
      // Format error for the submission modal
      setSubmissionResults({
        success: false,
        message: error.message || "Failed to submit consolidated invoice",
        rejectedDocuments: [
          {
            internalId: `CON-${year}${String(month + 1).padStart(2, "0")}`, // Use generated ID
            error: {
              code: "SUBMISSION_ERROR",
              message: error.message || "Error during submission",
            },
          },
        ],
        acceptedDocuments: [],
        overallStatus: "Error",
      });
    } finally {
      setIsSubmitting(false); // Ensure loading state stops
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const getTotalAmountSelected = (): number => {
    return eligibleInvoices
      .filter((invoice) => selectedInvoices.has(invoice.id))
      .reduce((sum, invoice) => sum + (invoice.totalamountpayable || 0), 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex justify-center items-center p-4 backdrop-blur-sm">
      {/* Modal Container */}
      <div className="bg-white w-full max-w-5xl rounded-xl shadow-xl flex flex-col max-h-[calc(100vh-40px)] animate-fade-in-scale overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-default-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-default-800 flex items-center">
            {/* Changed Icon */}
            <IconFileSettings size={22} className="mr-2.5 text-sky-600" />
            Consolidated e-Invoice Management
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-full text-default-500 hover:text-default-800 hover:bg-default-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-500 disabled:opacity-50"
            aria-label="Close modal"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 py-3 border-b border-default-200 flex-shrink-0">
          <div className="flex space-x-1 w-fit bg-default-100 rounded-lg p-1">
            <button
              className={`px-4 py-1.5 text-sm rounded-md transition-colors duration-150 ${
                activeTab === "eligible"
                  ? "bg-white shadow-sm text-sky-700 font-semibold"
                  : "text-default-600 hover:text-default-900 hover:bg-default-50"
              }`}
              onClick={() => setActiveTab("eligible")}
            >
              Eligible Invoices ({eligibleInvoices.length})
            </button>
            <button
              className={`px-4 py-1.5 text-sm rounded-md transition-colors duration-150 ${
                activeTab === "history"
                  ? "bg-white shadow-sm text-sky-700 font-semibold"
                  : "text-default-600 hover:text-default-900 hover:bg-default-50"
              }`}
              onClick={() => setActiveTab("history")}
            >
              Consolidation History ({consolidationHistory.length})
            </button>
          </div>
        </div>

        {/* Auto-consolidation toggle - Visually separated */}
        <div className="px-5 py-4 border-b border-default-200 flex justify-between items-center bg-default-50/60 flex-shrink-0">
          <div className="flex items-center">
            <div className="mr-3">
              <div className="text-sm font-medium text-default-800 flex items-center">
                Auto Consolidation
                <span className="ml-2 text-[11px] font-normal py-0.5 px-2 bg-default-200 text-default-600 rounded-full">
                  Coming Soon
                </span>
              </div>
              <p className="text-xs text-default-500 mt-0.5">
                Automatically consolidate eligible invoices monthly.
              </p>
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              role="switch"
              aria-checked={isAutoConsolidationEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-30 bg-gray-200`} // Always disabled style
              onClick={() =>
                setIsAutoConsolidationEnabled(!isAutoConsolidationEnabled)
              }
              disabled={true} // Disabled functionally
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1`} // Always off style
              />
            </button>
          </div>
        </div>

        {/* Main Content Area (Scrollable) */}
        <div className="flex-grow overflow-y-auto p-5 bg-gray-50/30">
          {activeTab === "eligible" ? (
            // Eligible invoices tab content
            <div className="space-y-4">
              {/* Tab Header Section */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <h3 className="text-base font-semibold text-default-800">
                  Eligible for {monthName} {year}
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    onClick={fetchEligibleInvoices}
                    variant="outline"
                    size="sm"
                    disabled={isLoadingEligible || isSubmitting}
                    className="flex items-center gap-1.5"
                    icon={IconRefresh}
                    aria-label="Refresh eligible invoices"
                  >
                    Refresh
                  </Button>

                  <Button
                    onClick={handleSubmitConsolidated}
                    variant="filled"
                    color="sky" // Keep sky color for primary action consistency
                    size="sm"
                    disabled={
                      selectedInvoices.size === 0 ||
                      isLoadingEligible ||
                      isSubmitting
                    }
                    className="flex items-center gap-1.5"
                    icon={!isSubmitting ? IconSend : undefined} // Hide icon when loading
                    aria-label="Submit selected invoices for consolidation"
                  >
                    {isSubmitting
                      ? "Submitting..."
                      : `Submit (${selectedInvoices.size})`}
                  </Button>
                </div>
              </div>

              {/* Loading State */}
              {isLoadingEligible && (
                <div className="flex justify-center items-center py-16 text-default-500">
                  <LoadingSpinner size="md" />
                  <span className="ml-2">Loading eligible invoices...</span>
                </div>
              )}

              {/* Error State */}
              {!isLoadingEligible && error && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700">
                  <div className="flex items-center">
                    <IconAlertTriangle
                      className="mr-2.5 flex-shrink-0"
                      size={20}
                    />
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!isLoadingEligible &&
                !error &&
                eligibleInvoices.length === 0 && (
                  <div className="bg-white rounded-lg border border-default-200 p-8 text-center mt-4">
                    <IconFileInvoice // Keep FileInvoice or choose another suitable icon for empty state
                      size={36}
                      className="text-default-300 mx-auto mb-3"
                    />
                    <p className="text-sm font-medium text-default-700 mb-1">
                      No Eligible Invoices Found
                    </p>
                    <p className="text-xs text-default-500">
                      There are no invoices for {monthName} {year} that meet the
                      criteria for consolidation (not cancelled, no valid
                      e-invoice, not already part of another consolidation).
                    </p>
                  </div>
                )}

              {/* Eligible Invoices Table */}
              {!isLoadingEligible && !error && eligibleInvoices.length > 0 && (
                <div className="border border-default-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  {/* Selection Summary Header */}
                  <div className="bg-default-50/70 p-3 border-b border-default-200 flex flex-wrap items-center gap-x-4 gap-y-2 group">
                    {" "}
                    {/* Added group for hover effect */}
                    <div
                      className="flex items-center cursor-pointer rounded hover:bg-default-100 p-1 -m-1" // Adjusted padding for hover area
                      onClick={handleSelectAllInvoices}
                      role="checkbox"
                      aria-checked={
                        selectedInvoices.size === eligibleInvoices.length &&
                        eligibleInvoices.length > 0
                      }
                      title={
                        selectedInvoices.size === eligibleInvoices.length
                          ? "Deselect All"
                          : "Select All"
                      }
                    >
                      {/* --- Select All Checkbox --- */}
                      {selectedInvoices.size === eligibleInvoices.length &&
                      eligibleInvoices.length > 0 ? (
                        <IconSquareCheckFilled
                          className="text-blue-600"
                          size={20}
                        />
                      ) : (
                        <IconSquare
                          className="text-default-400 group-hover:text-blue-500 transition-colors"
                          size={20}
                        />
                      )}
                      <span className="ml-2 text-sm font-medium text-default-700 hidden sm:inline">
                        {selectedInvoices.size === eligibleInvoices.length
                          ? "Deselect All"
                          : "Select All"}
                      </span>
                    </div>
                    <div className="flex-grow mb-0.5">
                      {selectedInvoices.size > 0 && (
                        <span className="text-sm text-blue-800 font-medium">
                          {" "}
                          {/* Changed color slightly to match blue checkboxes */}
                          {selectedInvoices.size} selected • Total:{" "}
                          <span className="font-semibold">
                            {formatCurrency(getTotalAmountSelected())}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Table Container */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-default-200">
                      <thead className="bg-default-50">
                        <tr>
                          <th className="w-12 px-4 py-2.5 text-center">
                            {" "}
                            {/* Checkbox column */}{" "}
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            Invoice #
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            Customer ID
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                            Amount (MYR)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-default-100">
                        {eligibleInvoices.map((invoice) => {
                          const { date } = parseDatabaseTimestamp(
                            invoice.createddate
                          );
                          const isSelected = selectedInvoices.has(invoice.id);

                          return (
                            <tr
                              key={invoice.id}
                              className={`transition-colors duration-150 cursor-pointer group ${
                                // Added group for hover
                                isSelected
                                  ? "bg-blue-50 hover:bg-blue-100/70" // Use blue selection color
                                  : "hover:bg-default-50"
                              }`}
                              onClick={() => handleSelectInvoice(invoice.id)}
                              aria-selected={isSelected}
                            >
                              {/* --- Table Row Checkbox --- */}
                              <td className="px-4 py-3">
                                {" "}
                                {/* Removed text-center, alignment handled by flex */}
                                <div className="flex items-center justify-center h-full">
                                  {" "}
                                  {/* Center the icon */}
                                  {isSelected ? (
                                    <IconSquareCheckFilled
                                      className="text-blue-600"
                                      size={18}
                                    />
                                  ) : (
                                    <IconSquare
                                      className="text-default-400 group-hover:text-blue-500 transition-colors" // group-hover effect
                                      size={18}
                                    />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900">
                                {invoice.id}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600">
                                {invoice.customerid}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600">
                                {date
                                  ? formatDisplayDate(date)
                                  : "Invalid Date"}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 text-right font-medium">
                                {formatCurrency(invoice.totalamountpayable)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // History tab content (unchanged, but benefits from icon imports if needed)
            <div className="space-y-4">
              {/* Tab Header Section */}
              <div className="flex justify-between items-center">
                <h3 className="text-base font-semibold text-default-800">
                  Consolidation History
                </h3>
                <Button
                  onClick={fetchConsolidationHistory}
                  variant="outline"
                  size="sm"
                  disabled={isLoadingHistory}
                  className="flex items-center gap-1.5"
                  icon={IconRefresh}
                  aria-label="Refresh consolidation history"
                >
                  Refresh
                </Button>
              </div>

              {/* Loading State */}
              {isLoadingHistory && (
                <div className="flex justify-center items-center py-16 text-default-500">
                  <LoadingSpinner size="md" />
                  <span className="ml-2">Loading history...</span>
                </div>
              )}

              {/* Empty State */}
              {!isLoadingHistory && consolidationHistory.length === 0 && (
                <div className="bg-white rounded-lg border border-default-200 p-8 text-center mt-4">
                  <IconFileInvoice
                    size={36}
                    className="text-default-300 mx-auto mb-3"
                  />
                  <p className="text-sm font-medium text-default-700 mb-1">
                    No Consolidation History Found
                  </p>
                  <p className="text-xs text-default-500">
                    There are no records of past consolidated e-invoice
                    submissions.
                  </p>
                </div>
              )}

              {/* History Table */}
              {!isLoadingHistory && consolidationHistory.length > 0 && (
                <div className="border border-default-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-default-200">
                      <thead className="bg-default-50">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            Consolidated ID
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            Date Created
                          </th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                            e-Invoice Status
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                            # Invoices
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                            Total Amount (MYR)
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            MyInvois UUID
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-default-100">
                        {consolidationHistory.map((item) => {
                          let statusColor = "bg-default-100 text-default-700";
                          let statusIcon = null;
                          let statusText = item.einvoice_status
                            ? item.einvoice_status.charAt(0).toUpperCase() +
                              item.einvoice_status.slice(1)
                            : "Unknown";

                          switch (item.einvoice_status?.toLowerCase()) {
                            case "valid":
                              statusColor = "bg-green-100 text-green-800";
                              statusIcon = (
                                <IconCircleCheck size={14} className="mr-1.5" />
                              );
                              statusText = "Valid";
                              break;
                            case "pending":
                            case "inprogress": // Handle variations if necessary
                              statusColor = "bg-amber-100 text-amber-800";
                              statusIcon = (
                                <IconClockHour4 size={14} className="mr-1.5" />
                              );
                              statusText = "Pending";
                              break;
                            case "invalid":
                            case "rejected": // Handle variations
                              statusColor = "bg-rose-100 text-rose-800";
                              statusIcon = (
                                <IconAlertTriangle
                                  size={14}
                                  className="mr-1.5"
                                />
                              );
                              statusText = "Invalid";
                              break;
                            default:
                              statusIcon = (
                                <IconAlertTriangle
                                  size={14}
                                  className="mr-1.5"
                                />
                              ); // Default icon for unknown
                          }

                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-default-50 transition-colors duration-150"
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900">
                                {item.id}
                                {item.long_id && (
                                  <span
                                    className="block text-xs text-default-400 truncate"
                                    title="MyInvois Long ID"
                                  >
                                    {item.long_id}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600">
                                {item.created_at
                                  ? formatDisplayDate(new Date(item.created_at))
                                  : "-"}
                                {item.datetime_validated && (
                                  <span
                                    className="block text-xs text-green-600"
                                    title="Validation Date/Time"
                                  >
                                    Validated:{" "}
                                    {formatDisplayDate(
                                      new Date(item.datetime_validated)
                                    )}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                <span
                                  className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}
                                >
                                  {statusIcon}
                                  {statusText}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600 text-right">
                                {item.consolidated_invoices?.length || 0}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 text-right font-medium">
                                {formatCurrency(item.totalamountpayable)}
                              </td>
                              <td
                                className="px-4 py-3 whitespace-nowrap text-sm text-default-500 font-mono"
                                title="MyInvois Document UUID"
                              >
                                {item.uuid || "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Submission Results Modal (Unchanged) */}
      <SubmissionResultsModal
        isOpen={showSubmissionResults}
        onClose={() => setShowSubmissionResults(false)}
        results={submissionResults}
        isLoading={isSubmitting}
      />
    </div>
  );
};

export default ConsolidatedInvoiceModal;

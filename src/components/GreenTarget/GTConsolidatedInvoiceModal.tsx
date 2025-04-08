// src/components/GreenTarget/GTConsolidatedInvoiceModal.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import Button from "../Button";
import LoadingSpinner from "../LoadingSpinner";
import toast from "react-hot-toast";
import ConfirmationDialog from "../ConfirmationDialog";

import {
  IconCircleCheck,
  IconFileInvoice,
  IconFileSettings,
  IconSend,
  IconSquare,
  IconSquareCheckFilled,
  IconAlertTriangle,
  IconRefresh,
  IconClockHour4,
  IconX,
  IconRotateClockwise,
  IconTrash,
  IconBan,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import SubmissionResultsModal from "../Invoice/SubmissionResultsModal";
import ConsolidationStatusPanel from "../Invoice/ConsolidationStatusPanel";
import ConsolidatedInfoTooltip from "../Invoice/ConsolidatedInfoTooltip";

interface GTConsolidatedInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  month: number; // 0-11 (Jan-Dec)
  year: number;
  onMonthYearChange?: (month: number, year: number) => void;
}

interface EligibleInvoice {
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  amount_before_tax: number;
  tax_amount: number;
  total_amount: number;
  date_issued: string;
}

interface ConsolidationHistory {
  invoice_id: number;
  invoice_number: string;
  uuid: string;
  long_id: string | null;
  submission_uid: string;
  datetime_validated: string | null;
  einvoice_status: string;
  amount_before_tax: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  consolidated_invoices: string[];
}

const GTConsolidatedInvoiceModal: React.FC<GTConsolidatedInvoiceModalProps> = ({
  isOpen,
  onClose,
  month,
  year,
  onMonthYearChange,
}) => {
  // State hooks
  const [eligibleInvoices, setEligibleInvoices] = useState<EligibleInvoice[]>(
    []
  );
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(
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
  const [showSubmissionResults, setShowSubmissionResults] = useState(false);
  const [submissionResults, setSubmissionResults] = useState<any>(null);
  const [processingHistoryId, setProcessingHistoryId] = useState<number | null>(
    null
  );
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<number>(month);
  const [selectedYear, setSelectedYear] = useState<number>(year);
  const [historyYear, setHistoryYear] = useState<number>(
    new Date().getFullYear()
  );
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);

  // Create an array of month options
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        name: new Date(0, i).toLocaleString("default", { month: "long" }),
      })),
    []
  );

  useEffect(() => {
    if (isOpen) {
      // Reset state when opening
      setActiveTab("eligible");
      setSelectedInvoices(new Set());
      setError(null);
      setProcessingHistoryId(null);
      setShowCancelConfirm(false);
      setCancelTargetId(null);
      setCancellationReason("");
      // Fetch data
      fetchEligibleInvoices();
      fetchConsolidationHistory();
      fetchAutoConsolidationSettings();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchEligibleInvoices();
      fetchConsolidationHistory();
    }
  }, [selectedMonth, year, historyYear, isOpen]);

  // Core functions
  const fetchEligibleInvoices = async () => {
    if (!isOpen) return;
    setIsLoadingEligible(true);
    setError(null);
    try {
      const monthToUse = selectedMonth !== undefined ? selectedMonth : month;
      const response = await api.get(
        `/greentarget/api/einvoice/eligible-for-consolidation?month=${monthToUse}&year=${year}`
      );
      if (response.success) {
        setEligibleInvoices(response.data || []);
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
      const response = await api.get(
        `/greentarget/api/einvoice/consolidated-history?year=${historyYear}`
      );
      setConsolidationHistory(response?.data || response || []);
    } catch (error: any) {
      console.error("Error fetching consolidation history:", error);
      setConsolidationHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  const fetchAutoConsolidationSettings = async () => {
    setIsLoadingSettings(true);
    try {
      const response = await api.get(
        "/greentarget/api/einvoice/settings/auto-consolidation"
      );
      setIsAutoConsolidationEnabled(response.enabled);
    } catch (error) {
      console.error("Error fetching auto-consolidation settings:", error);
      toast.error("Couldn't load auto-consolidation settings");
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const toggleAutoConsolidation = async () => {
    setIsLoadingSettings(true);
    try {
      const response = await api.post(
        "/greentarget/api/einvoice/settings/auto-consolidation",
        {
          enabled: !isAutoConsolidationEnabled,
        }
      );

      if (response.success) {
        setIsAutoConsolidationEnabled(response.settings.enabled);
        toast.success(
          `Auto-consolidation ${
            response.settings.enabled ? "enabled" : "disabled"
          }`
        );
      } else {
        throw new Error(response.message || "Update failed");
      }
    } catch (error) {
      console.error("Error toggling auto-consolidation:", error);
      toast.error("Couldn't update auto-consolidation settings");
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSelectAllInvoices = () => {
    if (eligibleInvoices.length === 0 || isLoadingEligible) return;
    if (selectedInvoices.size === eligibleInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      const allIds = new Set(
        eligibleInvoices.map((invoice) => invoice.invoice_id)
      );
      setSelectedInvoices(allIds);
    }
  };

  const handleSelectInvoice = (invoiceId: number) => {
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
    setShowSubmissionResults(true);
    try {
      const invoicesToSubmit = Array.from(selectedInvoices);
      const response = await api.post(
        "/greentarget/api/einvoice/submit-consolidated",
        {
          invoices: invoicesToSubmit,
          month,
          year,
        }
      );
      setSubmissionResults(response);
      if (response.success && response.overallStatus !== "Error") {
        fetchEligibleInvoices();
        fetchConsolidationHistory();
      } else if (!response.success) {
        console.error("Submission reported failure:", response.message);
      }
    } catch (error: any) {
      console.error("Error submitting consolidated invoice:", error);
      setSubmissionResults({
        success: false,
        message: error.message || "Failed to submit consolidated invoice",
        rejectedDocuments: [
          {
            internalId: `CON-${year}${String(month + 1).padStart(2, "0")}`,
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
      setIsSubmitting(false);
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
      .filter((invoice) => selectedInvoices.has(invoice.invoice_id))
      .reduce((sum, invoice) => {
        const amount = Number(invoice.total_amount) || 0;
        return sum + amount;
      }, 0);
  };

  // Handler to update status (only for pending)
  const handleUpdateConsolidatedStatus = async (id: number) => {
    setProcessingHistoryId(id);
    const toastId = toast.loading(`Checking status for ${id}...`);
    try {
      const response = await api.post(
        `/greentarget/api/einvoice/consolidated/${id}/update-status`
      );
      if (response.success) {
        toast.success(response.message || `Status check complete for ${id}.`, {
          id: toastId,
        });
        setConsolidationHistory((prev) =>
          prev.map((item) =>
            item.invoice_id === id
              ? {
                  ...item,
                  einvoice_status: response.status,
                  long_id: response.longId,
                  datetime_validated: response.dateTimeValidated,
                }
              : item
          )
        );
      } else {
        throw new Error(response.message || "Status check failed.");
      }
    } catch (error: any) {
      console.error(`Error updating status for ${id}:`, error);
      toast.error(`Failed to update status for ${id}: ${error.message}`, {
        id: toastId,
      });
    } finally {
      setProcessingHistoryId(null);
    }
  };

  const handleMonthChange = (newMonth: number) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Determine the appropriate year
    let targetYear = currentYear;

    // If selected month is later than current month, use previous year
    if (newMonth > currentMonth) {
      targetYear = currentYear - 1;
    }

    setSelectedMonth(newMonth);
    setSelectedYear(targetYear);

    // Update the parent component's state if needed or trigger a refetch
    if (typeof onMonthYearChange === "function") {
      onMonthYearChange(newMonth, targetYear);
    }
  };

  // Handler to initiate cancellation
  const handleCancelConsolidatedRequest = (id: number) => {
    setCancelTargetId(id);
    setCancellationReason(""); // Clear reason on opening dialog
    setShowCancelConfirm(true);
  };

  // Handler to confirm and execute cancellation
  const confirmCancelConsolidated = async () => {
    if (!cancelTargetId) return;

    setProcessingHistoryId(cancelTargetId);
    const currentId = cancelTargetId;
    const toastId = toast.loading(
      `Cancelling consolidated invoice ${currentId}...`
    );

    try {
      const response = await api.post(
        `/greentarget/api/einvoice/consolidated/${currentId}/cancel`,
        { reason: cancellationReason || "Cancelled via system" }
      );

      if (response.success) {
        toast.success(
          response.message || `Successfully cancelled ${currentId}.`,
          { id: toastId }
        );
        setConsolidationHistory((prev) =>
          prev.map((item) =>
            item.invoice_id === currentId
              ? { ...item, einvoice_status: "cancelled" }
              : item
          )
        );
        fetchEligibleInvoices();
        setShowCancelConfirm(false);
        setCancelTargetId(null);
      } else {
        throw new Error(response.message || "Cancellation failed.");
      }
    } catch (error: any) {
      console.error(`Error cancelling ${currentId}:`, error);
      toast.error(`Cancellation failed for ${currentId}: ${error.message}`, {
        id: toastId,
        duration: 6000,
      });
    } finally {
      setProcessingHistoryId(null);
    }
  };

  // Close handler for cancellation dialog
  const closeCancelDialog = () => {
    if (!processingHistoryId) {
      setShowCancelConfirm(false);
      setCancelTargetId(null);
      setCancellationReason("");
    }
  };

  if (!isOpen) return null;

  // Formats a date string for display (DD/MM/YYYY)
  const formatDisplayDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-GB");
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex justify-center items-center p-4 backdrop-blur-sm">
      {/* Modal Container */}
      <div className="bg-white w-full max-w-7xl rounded-xl shadow-xl flex flex-col max-h-[calc(100vh-40px)] animate-fade-in-scale">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-default-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-default-800 flex items-center">
            <IconFileSettings size={22} className="mr-2.5 text-sky-600" />
            Consolidated e-Invoice Management
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting || !!processingHistoryId}
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

        {/* Auto-consolidation toggle - simplified version */}
        <div className="px-5 py-4 border-b border-default-200 flex flex-col bg-default-50/60 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="mr-3">
                <div className="text-sm font-medium text-default-800">
                  Auto Consolidation (Monthly)
                </div>
                <p className="text-xs text-default-500 mt-0.5">
                  Automatically consolidate eligible invoices 1 day after
                  month-end, with retries for up to 7 days.
                </p>
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                role="switch"
                aria-checked={isAutoConsolidationEnabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${
                  isLoadingSettings ? "opacity-50 cursor-not-allowed" : ""
                } ${
                  isAutoConsolidationEnabled ? "bg-sky-600" : "bg-default-200"
                }`}
                onClick={toggleAutoConsolidation}
                disabled={isLoadingSettings}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isAutoConsolidationEnabled
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Status panel - only show if auto-consolidation is enabled */}
          {isAutoConsolidationEnabled && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-default-700 mb-2">
                Current Month Status
              </h4>
              <ConsolidationStatusPanel
                company="greentarget"
                year={selectedYear}
                month={selectedMonth}
              />
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-grow p-5 bg-gray-50/30 rounded-b-xl">
          {activeTab === "eligible" ? (
            // Eligible invoices tab content
            <div className="space-y-4">
              {/* Header and buttons */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-default-800 mr-2">
                    Eligible for
                  </h3>

                  {/* Month Selector */}
                  <Listbox
                    value={selectedMonth}
                    onChange={handleMonthChange}
                    disabled={
                      isLoadingEligible || isSubmitting || !!processingHistoryId
                    }
                  >
                    <div className="relative">
                      <ListboxButton className="rounded-lg border border-default-300 py-1 px-2 text-sm bg-white w-32 text-left flex items-center justify-between">
                        <span className="block truncate">
                          {monthOptions[selectedMonth].name}
                        </span>
                        <IconChevronDown
                          className="h-4 w-4 text-default-400"
                          aria-hidden="true"
                        />
                      </ListboxButton>
                      <Transition
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <ListboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          {monthOptions.map((month) => (
                            <ListboxOption
                              key={month.id}
                              value={month.id}
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-3 pr-9 ${
                                  active
                                    ? "bg-sky-100 text-sky-900"
                                    : "text-default-900"
                                }`
                              }
                            >
                              {({ selected, active }) => (
                                <>
                                  <span
                                    className={`block truncate ${
                                      selected ? "font-medium" : "font-normal"
                                    }`}
                                  >
                                    {month.name}
                                  </span>
                                  {selected ? (
                                    <span
                                      className={`absolute inset-y-0 right-0 flex items-center pr-3 ${
                                        active ? "text-sky-600" : "text-sky-600"
                                      }`}
                                    >
                                      <IconCheck
                                        className="h-5 w-5"
                                        aria-hidden="true"
                                      />
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </ListboxOption>
                          ))}
                        </ListboxOptions>
                      </Transition>
                    </div>
                  </Listbox>

                  <span className="text-base font-semibold text-default-800 mx-1">
                    {selectedYear}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    onClick={fetchEligibleInvoices}
                    variant="outline"
                    size="sm"
                    disabled={
                      isLoadingEligible || isSubmitting || !!processingHistoryId
                    }
                    className="flex items-center gap-1.5"
                    icon={IconRefresh}
                    aria-label="Refresh eligible invoices"
                  >
                    Refresh
                  </Button>
                  <Button
                    onClick={handleSubmitConsolidated}
                    variant="filled"
                    color="sky"
                    size="sm"
                    disabled={
                      selectedInvoices.size === 0 ||
                      isLoadingEligible ||
                      isSubmitting ||
                      !!processingHistoryId
                    }
                    className="flex items-center gap-1.5"
                    icon={!isSubmitting ? IconSend : undefined}
                    aria-label="Submit selected invoices for consolidation"
                  >
                    {isSubmitting
                      ? "Submitting..."
                      : `Submit (${selectedInvoices.size})`}
                  </Button>
                </div>
              </div>

              {/* Loading, Error, Empty states */}
              {isLoadingEligible && (
                <div className="flex justify-center items-center py-16 text-default-500">
                  <LoadingSpinner size="md" />
                </div>
              )}
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
              {!isLoadingEligible &&
                !error &&
                eligibleInvoices.length === 0 && (
                  <div className="bg-white rounded-lg border border-default-200 p-8 text-center mt-4">
                    <IconFileInvoice
                      size={36}
                      className="text-default-300 mx-auto mb-3"
                    />
                    <p className="text-sm font-medium text-default-700 mb-1">
                      No Eligible Invoices Found
                    </p>
                    <p className="text-xs text-default-500">
                      All invoices for this period have already been processed
                      or included in consolidated invoices.
                    </p>
                  </div>
                )}

              {/* Eligible Invoices Table */}
              {!isLoadingEligible && !error && eligibleInvoices.length > 0 && (
                <div className="border border-default-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  {/* Selection Summary Header */}
                  <div className="bg-default-50/70 p-3 border-b border-default-200 flex flex-wrap items-center gap-x-4 gap-y-2 group">
                    <div
                      className="flex items-center cursor-pointer rounded hover:bg-default-100 p-1 -m-1"
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
                          {selectedInvoices.size} selected • Total:{" "}
                          <span className="font-semibold">
                            {formatCurrency(getTotalAmountSelected())}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Table Container */}
                  <div className="max-h-[400px] overflow-auto">
                    <table className="min-w-full divide-y divide-default-200">
                      <thead className="bg-default-50 sticky top-0 z-10">
                        <tr>
                          <th className="w-12 px-4 py-2.5 text-center"></th>
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
                          const isSelected = selectedInvoices.has(
                            invoice.invoice_id
                          );
                          return (
                            <tr
                              key={invoice.invoice_id}
                              className={`transition-colors duration-150 cursor-pointer group ${
                                isSelected
                                  ? "bg-blue-50 hover:bg-blue-100/70"
                                  : "hover:bg-default-50"
                              }`}
                              onClick={() =>
                                handleSelectInvoice(invoice.invoice_id)
                              }
                              aria-selected={isSelected}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center h-full">
                                  {isSelected ? (
                                    <IconSquareCheckFilled
                                      className="text-blue-600"
                                      size={18}
                                    />
                                  ) : (
                                    <IconSquare
                                      className="text-default-400 group-hover:text-blue-500 transition-colors"
                                      size={18}
                                    />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900">
                                {invoice.invoice_number}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600">
                                {invoice.customer_id}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600">
                                {formatDisplayDate(invoice.date_issued)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 text-right font-medium">
                                {formatCurrency(invoice.total_amount)}
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
            // History tab content
            <div className="space-y-4">
              {/* Tab Header Section */}
              <div className="flex justify-between items-center">
                <h3 className="text-base font-semibold text-default-800">
                  Consolidation History
                </h3>
                <div className="flex items-center gap-2">
                  {/* Year Selector - Using Listbox */}
                  <Listbox
                    value={historyYear}
                    onChange={setHistoryYear}
                    disabled={isLoadingHistory || !!processingHistoryId}
                  >
                    <div className="relative">
                      <ListboxButton className="rounded-lg border border-default-300 py-1 px-2 text-sm bg-white w-28 text-left flex items-center justify-between">
                        <span className="block truncate">{historyYear}</span>
                        <IconChevronDown
                          className="h-4 w-4 text-default-400"
                          aria-hidden="true"
                        />
                      </ListboxButton>
                      <Transition
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <ListboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          {Array.from({ length: 10 }, (_, i) => {
                            const year = new Date().getFullYear() - i;
                            return (
                              <ListboxOption
                                key={i}
                                value={year}
                                className={({ active }) =>
                                  `relative cursor-default select-none py-2 pl-3 pr-9 ${
                                    active
                                      ? "bg-sky-100 text-sky-900"
                                      : "text-default-900"
                                  }`
                                }
                              >
                                {({ selected, active }) => (
                                  <>
                                    <span
                                      className={`block truncate ${
                                        selected ? "font-medium" : "font-normal"
                                      }`}
                                    >
                                      {year}
                                    </span>
                                    {selected ? (
                                      <span
                                        className={`absolute inset-y-0 right-0 flex items-center pr-3 ${
                                          active
                                            ? "text-sky-600"
                                            : "text-sky-600"
                                        }`}
                                      >
                                        <IconCheck
                                          className="h-5 w-5"
                                          aria-hidden="true"
                                        />
                                      </span>
                                    ) : null}
                                  </>
                                )}
                              </ListboxOption>
                            );
                          })}
                        </ListboxOptions>
                      </Transition>
                    </div>
                  </Listbox>
                  <Button
                    onClick={fetchConsolidationHistory}
                    variant="outline"
                    size="sm"
                    disabled={isLoadingHistory || !!processingHistoryId}
                    className="flex items-center gap-1.5"
                    icon={
                      !isLoadingHistory || processingHistoryId
                        ? IconRefresh
                        : undefined
                    }
                    aria-label="Refresh consolidation history"
                  >
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Loading State */}
              {isLoadingHistory && !processingHistoryId && (
                <div className="flex justify-center items-center py-16 text-default-500">
                  <LoadingSpinner size="md" />
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
              {consolidationHistory.length > 0 && (
                <div className="border border-default-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <div className="max-h-[400px] overflow-auto">
                    <table className="min-w-full divide-y divide-default-200">
                      <thead className="bg-default-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            Consolidated ID
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            Date Created
                          </th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                            Invoices
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                            Total Amount
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                            UUID
                          </th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-default-100">
                        {consolidationHistory.map((item) => {
                          const currentStatus =
                            item.einvoice_status?.toLowerCase();
                          const isProcessing =
                            processingHistoryId === item.invoice_id;

                          // Status Badge Logic
                          let statusColor = "bg-gray-100 text-gray-800"; // Default/Unknown
                          let statusIcon = (
                            <IconAlertTriangle size={14} className="mr-1.5" />
                          );
                          let statusText = "Unknown";
                          if (currentStatus) {
                            statusText =
                              item.einvoice_status.charAt(0).toUpperCase() +
                              item.einvoice_status.slice(1);
                          }

                          switch (currentStatus) {
                            case "valid":
                              statusColor = "bg-green-100 text-green-800";
                              statusIcon = (
                                <IconCircleCheck size={14} className="mr-1.5" />
                              );
                              statusText = "Valid";
                              break;
                            case "pending":
                            case "inprogress":
                              statusColor = "bg-amber-100 text-amber-800";
                              statusIcon = (
                                <IconClockHour4 size={14} className="mr-1.5" />
                              );
                              statusText = "Pending";
                              break;
                            case "invalid":
                            case "rejected":
                              statusColor = "bg-rose-100 text-rose-800";
                              statusIcon = (
                                <IconAlertTriangle
                                  size={14}
                                  className="mr-1.5"
                                />
                              );
                              statusText = "Invalid";
                              break;
                            case "cancelled":
                              statusColor = "bg-gray-200 text-gray-600";
                              statusIcon = (
                                <IconBan size={14} className="mr-1.5" />
                              );
                              statusText = "Cancelled";
                              break;
                            // Default case handled above
                          }

                          return (
                            <tr
                              key={item.invoice_id}
                              className={`transition-colors duration-150 ${
                                isProcessing
                                  ? "opacity-60 bg-gray-50"
                                  : "hover:bg-default-50"
                              }`}
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900">
                                <div className="flex items-center">
                                  <span>{item.invoice_number}</span>
                                  {item.consolidated_invoices &&
                                    item.consolidated_invoices.length > 0 && (
                                      <ConsolidatedInfoTooltip
                                        invoices={item.consolidated_invoices}
                                        className="ml-1.5"
                                        disableNavigation={true}
                                      />
                                    )}
                                </div>
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
                                {item.datetime_validated && (
                                  <span
                                    className="block text-xs text-green-600"
                                    title="Validation Date/Time"
                                  >
                                    Validated:{" "}
                                    {formatDisplayDate(item.datetime_validated)}
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
                                {formatCurrency(item.total_amount)}
                              </td>
                              <td
                                className="px-4 py-3 whitespace-nowrap text-sm text-default-500 font-mono max-w-[150px] truncate"
                                title={item.uuid || "MyInvois Document UUID"}
                              >
                                {item.uuid || "-"}
                              </td>

                              {/* Actions Cell */}
                              <td className="px-4 py-2.5 whitespace-nowrap text-center">
                                {isProcessing ? (
                                  <LoadingSpinner size="sm" />
                                ) : currentStatus === "pending" ? (
                                  // Only show Update for Pending
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleUpdateConsolidatedStatus(
                                        item.invoice_id
                                      )
                                    }
                                    disabled={
                                      !!processingHistoryId || isSubmitting
                                    }
                                    icon={IconRotateClockwise}
                                    aria-label={`Update status for ${item.invoice_id}`}
                                    title="Check Status"
                                  >
                                    Update
                                  </Button>
                                ) : currentStatus === "valid" ||
                                  currentStatus === "invalid" ? (
                                  // Show cancel button for Valid or Invalid
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    color="rose"
                                    onClick={() =>
                                      handleCancelConsolidatedRequest(
                                        item.invoice_id
                                      )
                                    }
                                    disabled={
                                      !!processingHistoryId || isSubmitting
                                    }
                                    icon={IconTrash}
                                    aria-label={`Cancel consolidated invoice ${item.invoice_id}`}
                                    title="Cancel"
                                  >
                                    Cancel
                                  </Button>
                                ) : (
                                  // Show placeholder for other statuses
                                  <span className="text-default-400 text-xs">
                                    —
                                  </span>
                                )}
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

      {/* Confirmation Dialog with Reason Input */}
      <ConfirmationDialog
        isOpen={showCancelConfirm}
        onClose={closeCancelDialog}
        onConfirm={confirmCancelConsolidated}
        title={`Cancel Consolidated Invoice?`}
        confirmButtonText="Confirm Cancellation"
        variant="danger"
        message={`Are you sure you want to cancel this consolidated invoice?`}
      />

      {/* Submission Results Modal */}
      <SubmissionResultsModal
        isOpen={showSubmissionResults}
        onClose={() => setShowSubmissionResults(false)}
        results={submissionResults}
        isLoading={isSubmitting}
      />
    </div>
  );
};

export default GTConsolidatedInvoiceModal;

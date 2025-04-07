// src/pages/GreenTarget/Invoices/InvoiceListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DateRangePicker from "../../../components/DateRangePicker";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconFileInvoice,
  IconPrinter,
  IconCash,
  IconChevronDown,
  IconCheck,
  IconTruck,
  IconPhone,
  IconMapPin,
  IconClock,
  IconAlertTriangle,
  IconCancel,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import { greenTargetApi } from "../../../routes/greentarget/api";
import { EInvoiceSubmissionResult, InvoiceGT } from "../../../types/types";
import SubmissionResultsModal from "../../../components/Invoice/SubmissionResultsModal";

interface InvoiceCardProps {
  invoice: InvoiceGT;
  onCancelClick: (invoice: InvoiceGT) => void;
  onSubmitEInvoiceClick: (invoice: InvoiceGT) => void;
  onCheckEInvoiceStatus: (invoice: InvoiceGT) => void;
}

const STORAGE_KEY = "greentarget_invoice_filters";

const InvoiceCard = ({
  invoice,
  onCancelClick,
  onSubmitEInvoiceClick,
  onCheckEInvoiceStatus,
}: InvoiceCardProps) => {
  const navigate = useNavigate();
  const [isCardHovered, setIsCardHovered] = useState(false);

  const handleClick = () => {
    navigate(`/greentarget/invoices/${invoice.invoice_id}`);
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCancelClick(invoice);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const isInvoiceDateEligibleForEinvoice = (
    dateIssuedString: string | undefined | null
  ): boolean => {
    if (!dateIssuedString) return false;

    try {
      // Parse the ISO date string to a Date object
      const dateIssued = new Date(dateIssuedString);
      if (isNaN(dateIssued.getTime())) return false; // Invalid date

      const now = new Date();
      const threeDaysInMillis = 3 * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(now.getTime() - threeDaysInMillis);

      return dateIssued >= cutoffDate;
    } catch {
      return false;
    }
  };

  const isPaid = invoice.current_balance <= 0;
  const isCancelled = invoice.status === "cancelled";

  return (
    <div
      className={`relative border text-left rounded-lg overflow-hidden transition-all duration-200 cursor-pointer ${
        isCardHovered ? "shadow-md" : "shadow-sm"
      } ${
        isCancelled
          ? "border-default-400"
          : isPaid
          ? "border-green-400"
          : invoice.status === "overdue"
          ? "border-red-400"
          : "border-amber-400"
      }`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Status banner */}
      <div
        className={`w-full py-1.5 px-4 text-sm font-medium text-white ${
          isCancelled
            ? "bg-default-500"
            : isPaid
            ? "bg-green-500"
            : invoice.status === "overdue"
            ? "bg-red-500"
            : "bg-amber-500"
        }`}
      >
        <div className="flex justify-between items-center">
          <span>{invoice.invoice_number}</span>
          <span className="text-xs py-0.5 px-2 bg-white/20 rounded-full">
            {isCancelled
              ? "Cancelled"
              : isPaid
              ? "Paid"
              : invoice.status === "overdue"
              ? "Overdue"
              : "Unpaid"}
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Customer section */}
        <div className="mb-3 border-b pb-3">
          <div className="flex justify-between items-start">
            <div className="max-w-[65%]">
              <h3
                className="font-semibold text-default-900 truncate cursor-pointer hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/greentarget/customers/${invoice.customer_id}`);
                }}
                title={invoice.customer_name}
              >
                {invoice.customer_name}
              </h3>
              {(invoice.customer_phone_number ||
                invoice.location_phone_number) && (
                <p
                  className="text-sm text-default-600 mt-[3px] truncate"
                  title={
                    invoice.customer_phone_number !==
                      invoice.location_phone_number &&
                    invoice.customer_phone_number &&
                    invoice.location_phone_number
                      ? `${invoice.customer_phone_number}, ${invoice.location_phone_number}`
                      : invoice.customer_phone_number ??
                        invoice.location_phone_number ??
                        undefined
                  }
                >
                  <IconPhone
                    size={14}
                    className="inline mr-1 mt-0.5 align-top flex-shrink-0"
                  />
                  {invoice.customer_phone_number !==
                    invoice.location_phone_number &&
                  invoice.customer_phone_number &&
                  invoice.location_phone_number
                    ? `${invoice.customer_phone_number}, ${invoice.location_phone_number}`
                    : invoice.customer_phone_number ||
                      invoice.location_phone_number}
                </p>
              )}
            </div>
            <div>
              {/* Add rental ID and driver info in the right side */}
              {invoice.rental_id && (
                <div className="text-right truncate">
                  <h3
                    className="font-medium text-default-700 cursor-pointer hover:underline truncate"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/greentarget/rentals/${invoice.rental_id}`);
                    }}
                    title="View Rental"
                  >
                    Rental #{invoice.rental_id}
                  </h3>
                </div>
              )}
              {/* e-Invoice Status Badge (if applicable) */}
              {invoice.einvoice_status && (
                <div className="truncate overflow-auto">
                  {invoice.einvoice_status === "valid" ? (
                    <span className="inline-flex items-center text-xs font-medium text-green-700">
                      <IconCheck size={14} className="mr-1" />
                      e-Invoice Valid
                    </span>
                  ) : invoice.einvoice_status === "pending" ? (
                    <span className="inline-flex items-center text-xs font-medium text-sky-700">
                      <IconClock size={14} className="mr-1" />
                      e-Invoice Pending
                    </span>
                  ) : invoice.einvoice_status === "invalid" ? (
                    <span className="inline-flex items-center text-xs font-medium text-rose-700">
                      <IconAlertTriangle size={14} className="mr-1" />
                      e-Invoice Invalid
                    </span>
                  ) : invoice.einvoice_status === "cancelled" ? (
                    <span className="inline-flex items-center text-xs font-medium text-default-700">
                      <IconCancel size={14} className="mr-1" />
                      e-Invoice Cancelled
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          {invoice.location_address && (
            <p
              className="text-sm text-default-600 mt-0.5 truncate"
              title={invoice.location_address}
            >
              <IconMapPin
                size={14}
                className="inline mr-1 mt-0.5 align-top flex-shrink-0"
              />
              {invoice.location_address}
            </p>
          )}
          {invoice.driver && (
            <p
              className="text-sm text-default-600 mt-0.5 truncate"
              title={invoice.driver}
            >
              <IconTruck
                size={14}
                className="inline mr-1 mt-[3px] align-top flex-shrink-0"
              />
              {invoice.driver}, {invoice.tong_no}
            </p>
          )}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Date Issued</p>
            <p className="font-medium">{formatDate(invoice.date_issued)}</p>
          </div>
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Total</p>
            <p className="font-medium">
              {formatCurrency(invoice.total_amount)}
            </p>
          </div>
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Paid</p>
            <p className="font-medium text-green-600">
              {formatCurrency(invoice.amount_paid)}
            </p>
          </div>
          <div
            className={`p-2 border rounded-md ${
              isPaid
                ? "bg-green-50 border-green-100"
                : invoice.status === "overdue"
                ? "bg-red-50 border-red-100"
                : "bg-amber-50 border-amber-100"
            }`}
          >
            <p className="text-xs text-default-500 mb-1">Balance</p>
            <p
              className={`font-medium ${
                isPaid
                  ? "text-green-700"
                  : invoice.status === "overdue"
                  ? "text-red-700"
                  : "text-amber-700"
              }`}
            >
              {formatCurrency(invoice.current_balance)}
            </p>
          </div>
        </div>

        {/* Action buttons - semi-visible always, fully visible on hover */}
        <div
          className={`flex justify-end space-x-2 mt-2 transition-opacity duration-200 ${
            isCardHovered ? "opacity-100" : "opacity-70"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/greentarget/invoices/${invoice.invoice_id}`);
            }}
            className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full transition-colors"
            title="Print Invoice"
          >
            <IconPrinter size={18} stroke={1.5} />
          </button>

          {/* Only show e-Invoice button if: 
    1. Customer has tin_number and id_number 
    2. Invoice is not already submitted as e-Invoice or submitted but invalid
    3. Invoice date is within the last 3 days */}
          {invoice.tin_number &&
            invoice.id_number &&
            invoice.status !== "cancelled" &&
            (!invoice.einvoice_status ||
              invoice.einvoice_status === "invalid" ||
              invoice.einvoice_status !== "cancelled") &&
            invoice.einvoice_status !== "valid" &&
            isInvoiceDateEligibleForEinvoice(invoice.date_issued) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSubmitEInvoiceClick(invoice);
                }}
                className="p-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-full transition-colors"
                title="Submit as e-Invoice"
              >
                <IconFileInvoice size={18} stroke={1.5} />
              </button>
            )}

          {/* Show pending badge with option to check status */}
          {invoice.einvoice_status === "pending" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCheckEInvoiceStatus(invoice);
              }}
              className="p-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-full transition-colors"
              title="Check e-Invoice Status"
            >
              <IconClock size={18} stroke={1.5} />
            </button>
          )}

          {!isPaid && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Navigate to invoice details with state to show payment form
                navigate(`/greentarget/invoices/${invoice.invoice_id}`, {
                  state: { showPaymentForm: true },
                });
              }}
              className={`p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors ${
                invoice.status === "cancelled"
                  ? "cursor-not-allowed opacity-50"
                  : ""
              }`}
              title="Record Payment"
              disabled={invoice.status === "cancelled"}
            >
              <IconCash size={18} stroke={1.5} />
            </button>
          )}

          {/* Only show cancel button if the invoice is not already cancelled */}
          {!isCancelled && (
            <button
              onClick={handleCancelClick}
              className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-full transition-colors"
              title="Cancel Invoice"
            >
              <IconCancel size={18} stroke={1.5} />
            </button>
          )}

          {/* Show cancelled indicator if already cancelled */}
          {isCancelled && (
            <div
              className="p-1.5 bg-default-100 text-default-500 rounded-full cursor-not-allowed"
              title="Invoice is cancelled"
            >
              <IconCancel size={18} stroke={1.5} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const InvoiceListPage: React.FC = () => {
  // Function to get initial dates from localStorage
  const getInitialDates = () => {
    const savedFilters = localStorage.getItem(STORAGE_KEY);
    if (savedFilters) {
      const { start, end } = JSON.parse(savedFilters);
      return {
        start: start
          ? new Date(start)
          : new Date(new Date().setMonth(new Date().getMonth() - 1)),
        end: end ? new Date(end) : new Date(),
      };
    }
    return {
      start: new Date(new Date().setMonth(new Date().getMonth() - 1)),
      end: new Date(),
    };
  }; // Month options setup
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Month options
  const monthOptions = [
    { id: 0, name: "January" },
    { id: 1, name: "February" },
    { id: 2, name: "March" },
    { id: 3, name: "April" },
    { id: 4, name: "May" },
    { id: 5, name: "June" },
    { id: 6, name: "July" },
    { id: 7, name: "August" },
    { id: 8, name: "September" },
    { id: 9, name: "October" },
    { id: 10, name: "November" },
    { id: 11, name: "December" },
  ];

  const [selectedMonth, setSelectedMonth] = useState(
    monthOptions[currentMonth]
  );
  const [dateRange, setDateRange] = useState(getInitialDates());
  const [invoices, setInvoices] = useState<InvoiceGT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<InvoiceGT | null>(
    null
  );
  const [showSubmissionResultsModal, setShowSubmissionResultsModal] =
    useState(false);
  const [submissionResults, setSubmissionResults] =
    useState<EInvoiceSubmissionResult | null>(null);
  const [isProcessingEInvoice, setIsProcessingEInvoice] = useState(false);
  const navigate = useNavigate();
  const [showEInvoiceConfirmDialog, setShowEInvoiceConfirmDialog] =
    useState(false);
  const [invoiceToSubmitAsEInvoice, setInvoiceToSubmitAsEInvoice] =
    useState<InvoiceGT | null>(null);

  const ITEMS_PER_PAGE = 12;

  // Effect to fetch invoices when filters change
  useEffect(() => {
    fetchInvoices();
  }, [dateRange]);

  // Function to save dates to localStorage
  const saveDatesToStorage = (startDate: Date, endDate: Date) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      })
    );
  };

  // Helper function to format a Date object into 'YYYY-MM-DD' string in local time
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    // getMonth() is 0-indexed, add 1
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    // getDate() returns the day of the month
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Handle month selection
  const handleMonthChange = (month: { id: number; name: string }) => {
    setSelectedMonth(month);

    // Get the current year
    const year = currentYear;

    // If the selected month is after the current month, it must be from last year
    const selectedYear = month.id > currentMonth ? year - 1 : year;

    // Create start date (1st of the selected month)
    const startDate = new Date(selectedYear, month.id, 1);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (last day of the selected month)
    const endDate = new Date(selectedYear, month.id + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    // Save to storage and update state
    saveDatesToStorage(startDate, endDate);

    // Update state and then fetch
    setDateRange({
      start: startDate,
      end: endDate,
    });

    // Reset to first page when date changes
    setCurrentPage(1);
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      let queryParams = "";

      if (dateRange.start || dateRange.end) {
        const params = new URLSearchParams();

        if (dateRange.start) {
          params.append(
            "start_date",
            formatDateForAPI(dateRange.start) // Use local date formatting
          );
        }

        if (dateRange.end) {
          params.append(
            "end_date",
            formatDateForAPI(dateRange.end) // Use local date formatting
          );
        }

        queryParams = `?${params.toString()}`;
      }

      const data = await api.get(`/greentarget/api/invoices${queryParams}`);
      setInvoices(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch invoices. Please try again later.");
      console.error("Error fetching invoices:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelClick = (invoice: InvoiceGT) => {
    setInvoiceToCancel(invoice);
    setIsCancelDialogOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (invoiceToCancel) {
      try {
        // Use the new cancelInvoice method instead of CancelInvoice
        const response = await greenTargetApi.cancelInvoice(
          invoiceToCancel.invoice_id
        );

        // Check if the response contains an error message
        if (
          response.error ||
          (response.message && response.message.includes("Cannot cancel"))
        ) {
          // Show error toast with the server's message
          toast.error(
            response.message || "Cannot cancel invoice: unknown error occurred"
          );
        } else {
          // Only show success and update state if there's no error
          toast.success("Invoice cancelled successfully");

          // Update the invoice status in the list
          setInvoices(
            invoices.map((i) =>
              i.invoice_id === invoiceToCancel.invoice_id
                ? { ...i, status: "cancelled", einvoice_status: "cancelled" }
                : i
            )
          );
        }
      } catch (error: any) {
        // This will catch network errors or other exceptions
        if (error.message && error.message.includes("associated payments")) {
          toast.error(
            "Cannot cancel invoice: it has associated payments. Cancel the payments first."
          );
        } else {
          toast.error("Failed to cancel invoice");
          console.error("Error cancelling invoice:", error);
        }
      } finally {
        setIsCancelDialogOpen(false);
        setInvoiceToCancel(null);
      }
    }
  };

  const handleSubmitEInvoice = async (invoice: InvoiceGT) => {
    // Instead of immediate processing, set state for confirmation
    setInvoiceToSubmitAsEInvoice(invoice);
    setShowEInvoiceConfirmDialog(true);
  };

  // Add a new function to handle the confirmed submission
  const handleConfirmEInvoiceSubmission = async () => {
    if (!invoiceToSubmitAsEInvoice) return;

    // Close dialog immediately before any async operations
    setShowEInvoiceConfirmDialog(false);

    // Small timeout to ensure dialog is closed before showing next UI
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      setIsProcessingEInvoice(true);
      setSubmissionResults(null);
      setShowSubmissionResultsModal(true);

      const toastId = toast.loading("Submitting e-Invoice...");

      // Call the actual e-Invoice submission API
      const response = await greenTargetApi.submitEInvoice(
        invoiceToSubmitAsEInvoice.invoice_id
      );

      // Dismiss the loading toast
      toast.dismiss(toastId);

      // Transform the Green Target response to match the expected format
      const transformedResponse = {
        success: response.success,
        message: response.message || "e-Invoice submitted successfully",
        overallStatus:
          response.einvoice?.einvoice_status === "valid"
            ? "Valid"
            : response.einvoice?.einvoice_status === "pending"
            ? "Pending"
            : "Unknown",
        acceptedDocuments: response.einvoice
          ? [
              {
                internalId: response.einvoice.invoice_number,
                uuid: response.einvoice.uuid,
                longId: response.einvoice.long_id,
                status:
                  response.einvoice.einvoice_status === "valid"
                    ? "ACCEPTED"
                    : "Submitted",
                dateTimeValidated: response.einvoice.datetime_validated,
              },
            ]
          : [],
        rejectedDocuments:
          !response.success && response.error
            ? [
                {
                  internalId: invoiceToSubmitAsEInvoice.invoice_id.toString(),
                  error: {
                    code: "ERROR",
                    message: response.error.message || "Unknown error",
                    details: response.error.details,
                  },
                },
              ]
            : [],
      };

      // Store the transformed response for the modal
      setSubmissionResults(transformedResponse);

      // Still refresh invoices list if successful
      if (response.success) {
        fetchInvoices();
      }
    } catch (error) {
      console.error("Error submitting e-Invoice:", error);
      toast.error("Failed to submit e-Invoice");

      // Create a formatted error response for the modal
      setSubmissionResults({
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
        overallStatus: "Error",
        rejectedDocuments: [
          {
            internalId: invoiceToSubmitAsEInvoice.invoice_id.toString(),
            error: {
              code: "SYSTEM_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown error occurred",
            },
          },
        ],
      });
    } finally {
      setIsProcessingEInvoice(false);
      setShowEInvoiceConfirmDialog(false);
      setInvoiceToSubmitAsEInvoice(null);
    }
  };

  const handleCheckEInvoiceStatus = async (invoice: InvoiceGT) => {
    try {
      setIsProcessingEInvoice(true);
      const toastId = toast.loading("Checking e-Invoice status...");

      // Call the API to check e-invoice status
      const response = await greenTargetApi.checkEInvoiceStatus(
        invoice.invoice_id
      );

      toast.dismiss(toastId);

      // Format the response for the SubmissionResultsModal
      const formattedResponse = {
        success: response.success,
        message: response.message || `e-Invoice status: ${response.status}`,
        overallStatus:
          response.status === "valid"
            ? "Valid"
            : response.status === "pending"
            ? "Pending"
            : "Invalid",
        acceptedDocuments:
          response.status === "valid"
            ? [
                {
                  internalId: invoice.invoice_id.toString(),
                  uuid: invoice.uuid,
                  longId: response.longId,
                  status: "Valid",
                  dateTimeValidated: response.dateTimeValidated,
                },
              ]
            : [],
        pendingUpdated:
          response.status === "pending"
            ? [
                {
                  id: invoice.invoice_id.toString(),
                  status: "pending",
                  updated: response.updated,
                },
              ]
            : [],
        rejectedDocuments:
          response.status === "invalid"
            ? [
                {
                  internalId: invoice.invoice_id.toString(),
                  error: {
                    code: "INVALID_EINVOICE",
                    message: "e-Invoice is invalid",
                  },
                },
              ]
            : [],
      };

      setSubmissionResults(formattedResponse);
      setShowSubmissionResultsModal(true);

      // Refresh invoices list if status changed
      if (response.updated) {
        fetchInvoices();
      }
    } catch (error) {
      console.error("Error checking e-Invoice status:", error);
      toast.error("Failed to check e-Invoice status");

      // Create error response for modal
      setSubmissionResults({
        success: false,
        message: "Failed to check e-Invoice status",
        overallStatus: "Error",
        rejectedDocuments: [
          {
            internalId: invoice.invoice_id.toString(),
            error: {
              code: "STATUS_CHECK_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown error occurred",
            },
          },
        ],
      });
      setShowSubmissionResultsModal(true);
    } finally {
      setIsProcessingEInvoice(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      // Filter by search term (invoice number or customer name)
      return (
        invoice.invoice_number
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [invoices, searchTerm]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);

  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInvoices.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredInvoices, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const renderPaginationButtons = () => {
    const buttons = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
              i === currentPage
                ? "border border-default-200 font-semibold"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }
    } else {
      // First page button
      buttons.push(
        <button
          key={1}
          onClick={() => handlePageChange(1)}
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
            1 === currentPage
              ? "border border-default-200 font-semibold"
              : "font-medium"
          }`}
        >
          1
        </button>
      );

      // Ellipsis if needed
      if (currentPage > 3) {
        buttons.push(
          <div key="ellipsis1" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
              i === currentPage
                ? "border border-default-200 font-semibold"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }

      // Ellipsis if needed
      if (currentPage < totalPages - 2) {
        buttons.push(
          <div key="ellipsis2" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Last page button
      buttons.push(
        <button
          key={totalPages}
          onClick={() => handlePageChange(totalPages)}
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
            totalPages === currentPage
              ? "border border-default-200 font-semibold"
              : "font-medium"
          }`}
        >
          {totalPages}
        </button>
      );
    }

    return buttons;
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="relative w-full mx-20">
      <div className="flex flex-col space-y-4 mb-6">
        {/* Header and controls row */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center justify-between">
            <h1
              className="text-2xl text-default-700 font-bold truncate max-w-xs"
              title={`Invoices (${filteredInvoices.length})`}
            >
              Invoices ({filteredInvoices.length})
            </h1>

            {/* Create Invoice Button - Visible on mobile */}
            <div className="lg:hidden flex-shrink-0">
              <Button
                onClick={() => navigate("/greentarget/invoices/new")}
                icon={IconPlus}
                variant="outline"
              >
                Create Invoice
              </Button>
            </div>
          </div>

          {/* Filters and Create Button Row - responsive */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap lg:flex-nowrap">
            {/* DateRangePicker */}
            <div className="w-full sm:w-auto flex-grow lg:flex-grow-0">
              <DateRangePicker
                dateRange={dateRange}
                onDateChange={(newDateRange) => {
                  saveDatesToStorage(newDateRange.start, newDateRange.end);
                  setDateRange(newDateRange);
                  setCurrentPage(1);
                }}
                className="w-full"
              />
            </div>

            {/* Month selection */}
            <div className="w-full sm:w-48">
              <Listbox value={selectedMonth} onChange={handleMonthChange}>
                <div className="relative">
                  <ListboxButton className="w-full rounded-full border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
                    <span className="block truncate pl-2">
                      {selectedMonth.name}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <IconChevronDown
                        className="h-5 w-5 text-default-400"
                        aria-hidden="true"
                      />
                    </span>
                  </ListboxButton>
                  <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                    {monthOptions.map((month) => (
                      <ListboxOption
                        key={month.id}
                        className={({ active }) =>
                          `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                            active
                              ? "bg-default-100 text-default-900"
                              : "text-default-900"
                          }`
                        }
                        value={month}
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              {month.name}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>

            {/* Search box */}
            <div className="w-full sm:w-auto flex-grow relative">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
                size={22}
              />
              <input
                type="text"
                placeholder="Search"
                className="w-full pl-11 py-2 border focus:border-default-500 rounded-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Create Invoice Button - Hidden on mobile, visible on larger screens */}
            <div className="hidden lg:block flex-shrink-0">
              <Button
                onClick={() => navigate("/greentarget/invoices/new")}
                icon={IconPlus}
                variant="outline"
              >
                Create Invoice
              </Button>
            </div>
          </div>
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-50 rounded-xl border border-dashed border-default-200">
          <IconFileInvoice
            size={64}
            className="text-default-300 mb-5"
            stroke={1.2}
          />
          <h3 className="text-xl font-semibold text-default-700 mb-2">
            No invoices found
          </h3>
          <p className="text-default-500 text-center max-w-md mb-6">
            {searchTerm
              ? "Your search didn't match any invoices. Try adjusting your search terms or filters."
              : "You haven't created any invoices yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedInvoices.map((invoice) => (
            <InvoiceCard
              key={invoice.invoice_id}
              invoice={invoice}
              onCancelClick={handleCancelClick}
              onSubmitEInvoiceClick={handleSubmitEInvoice}
              onCheckEInvoiceStatus={handleCheckEInvoiceStatus}
            />
          ))}
        </div>
      )}

      {filteredInvoices.length > 0 && (
        <div className="mt-6 flex justify-between items-center text-default-700">
          <button
            className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 active:bg-default-200"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <IconChevronLeft className="w-5 h-5 mr-2" /> Previous
          </button>
          <div className="flex space-x-2">{renderPaginationButtons()}</div>
          <button
            className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 active:bg-default-200"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <IconChevronRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}
      <SubmissionResultsModal
        isOpen={showSubmissionResultsModal}
        onClose={() => setShowSubmissionResultsModal(false)}
        results={
          submissionResults
            ? {
                ...submissionResults,
                message: submissionResults.message || "", // Ensure message is always a string
                overallStatus: submissionResults.overallStatus || "Unknown", // Ensure overallStatus is always a string
              }
            : null
        }
        isLoading={isProcessingEInvoice && !submissionResults}
      />
      <ConfirmationDialog
        isOpen={isCancelDialogOpen}
        onClose={() => setIsCancelDialogOpen(false)}
        onConfirm={handleConfirmCancel}
        title="Cancel Invoice"
        message={`Are you sure you want to cancel invoice ${invoiceToCancel?.invoice_number}? This action cannot be undone.`}
        confirmButtonText="Cancel Invoice"
        variant="danger"
      />
      {/* Confirmation dialog for e-Invoice submission */}
      <ConfirmationDialog
        isOpen={showEInvoiceConfirmDialog}
        onClose={() => setShowEInvoiceConfirmDialog(false)}
        onConfirm={handleConfirmEInvoiceSubmission}
        title="Submit e-Invoice"
        message={`Are you sure you want to submit Invoice ${invoiceToSubmitAsEInvoice?.invoice_number} as an e-Invoice to MyInvois?`}
        confirmButtonText="Submit"
        variant="default"
      />
    </div>
  );
};

export default InvoiceListPage;

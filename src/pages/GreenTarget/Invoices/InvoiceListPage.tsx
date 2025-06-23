// src/pages/GreenTarget/Invoices/InvoiceListPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DateRangePicker from "../../../components/DateRangePicker";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconFileInvoice,
  IconCash,
  IconChevronDown,
  IconCheck,
  IconTruck,
  IconPhone,
  IconMapPin,
  IconClock,
  IconAlertTriangle,
  IconCancel,
  IconRefresh,
  IconFiles,
  IconPrinter,
  IconFileDownload,
  IconSquare,
  IconSquareMinusFilled,
  IconSelectAll,
  IconSquareCheckFilled,
  IconFilter,
  IconX,
  IconCircleCheck,
  IconUser,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Dialog,
  TransitionChild,
  DialogTitle,
} from "@headlessui/react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import { greenTargetApi } from "../../../routes/greentarget/api";
import { EInvoiceSubmissionResult, InvoiceGT } from "../../../types/types";
import SubmissionResultsModal from "../../../components/Invoice/SubmissionResultsModal";
import GTConsolidatedInvoiceModal from "../../../components/GreenTarget/GTConsolidatedInvoiceModal";
import GTPrintPDFOverlay from "../../../utils/greenTarget/PDF/GTPrintPDFOverlay";
import GTInvoicePDF from "../../../utils/greenTarget/PDF/GTInvoicePDF"; // For PDF structure
import { generateGTPDFFilename } from "../../../utils/greenTarget/PDF/generateGTPDFFilename";
import { pdf, Document } from "@react-pdf/renderer";
import { generateQRDataUrl } from "../../../utils/invoice/einvoice/generateQRCode";
import { FormCombobox, SelectOption } from "../../../components/FormComponents";
import GTStatementModal from "../../../components/GreenTarget/GTStatementModal";

interface InvoiceCardProps {
  invoice: InvoiceGT;
  onCancelClick: (invoice: InvoiceGT) => void;
  onSubmitEInvoiceClick: (invoice: InvoiceGT) => void;
  onCheckEInvoiceStatus: (invoice: InvoiceGT) => void;
  onSyncCancellationStatus: (invoice: InvoiceGT) => void;
  onPrintClick: (invoice: InvoiceGT) => void;
  onDownloadClick: (invoice: InvoiceGT) => void;
  isSelected: boolean;
  onSelect: (invoiceId: string, isSelected: boolean) => void;
}

interface InvoiceFilters {
  customer_id: string | null;
  status: string[] | null;
  consolidation: "all" | "individual" | "consolidated"; // Whether it's part of consolidated invoice
}

const STORAGE_KEY = "greentarget_invoice_filters";

const InvoiceCard = ({
  invoice,
  onCancelClick,
  onSubmitEInvoiceClick,
  onCheckEInvoiceStatus,
  onSyncCancellationStatus,
  onPrintClick,
  onDownloadClick,
  isSelected,
  onSelect,
}: InvoiceCardProps) => {
  const navigate = useNavigate();
  const [isCardHovered, setIsCardHovered] = useState(false);

  const handleClick = () => {
    navigate(`/greentarget/invoices/${invoice.invoice_id}`);
  };

  const handleCardSelection = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(invoice.invoice_id.toString(), !isSelected);
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

  const getConsolidatedBadge = () => {
    if (!invoice.consolidated_part_of) return null;

    // Only show for valid consolidated invoices
    if (invoice.consolidated_part_of.einvoice_status !== "valid") return null;

    return (
      <a
        href={
          invoice.consolidated_part_of.long_id
            ? `https://myinvois.hasil.gov.my/${invoice.consolidated_part_of.uuid}/share/${invoice.consolidated_part_of.long_id}`
            : "#"
        }
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-xs font-medium text-indigo-700 hover:text-indigo-800 hover:underline"
        onClick={(e) => {
          if (!invoice.consolidated_part_of?.long_id) {
            e.preventDefault();
          }
          e.stopPropagation();
        }}
        title={`Part of consolidated invoice ${invoice.consolidated_part_of.invoice_number}`}
      >
        <IconFiles size={14} className="mr-1" />
        Consolidated
      </a>
    );
  };

  const isPaid = invoice.current_balance <= 0;
  const isCancelled = invoice.status === "cancelled";

  return (
    <div
      className={`relative border text-left rounded-lg overflow-hidden transition-all duration-200 cursor-pointer 
    ${
      isSelected
        ? "shadow-md ring-2 ring-sky-400 ring-offset-1" // Clear visual indication when selected
        : "shadow-sm hover:shadow-md"
    } 
    ${
      isCancelled
        ? "border-default-400"
        : isPaid
        ? "border-green-400"
        : invoice.status === "overdue"
        ? "border-red-400"
        : "border-amber-400"
    }`}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
      onClick={handleCardSelection}
    >
      {/* Status banner */}
      <div
        className={`w-full py-2 px-4 text-sm font-medium text-white ${
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
          <div
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(invoice.invoice_id.toString(), !isSelected);
            }}
            className="flex items-center justify-center gap-1.5"
          >
            <span className="text-xs py-0.5 px-2 bg-white/20 rounded-full">
              {isCancelled
                ? "Cancelled"
                : isPaid
                ? "Paid"
                : invoice.status === "overdue"
                ? "Overdue"
                : "Unpaid"}
            </span>
            {isSelected ? (
              <IconSquareCheckFilled
                className="text-sky-400 cursor-pointer w-5 h-5"
                size={22}
              />
            ) : (
              <IconSquare
                className="group-hover:text-sky-400 transition-colors cursor-pointer w-5 h-5"
                size={22}
              />
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3" onClick={handleClick}>
        {/* Customer section */}
        <div className="mb-3 border-b pb-3">
          <div className="flex justify-between items-start">
            <div className="max-w-[65%]">
              <h3
                className="w-fit font-semibold text-default-900 truncate cursor-pointer hover:underline"
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
                    <a
                      href={
                        invoice.long_id
                          ? `https://myinvois.hasil.gov.my/${invoice.uuid}/share/${invoice.long_id}`
                          : "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center text-xs font-medium text-green-700 ${
                        invoice.long_id
                          ? "hover:text-green-800 hover:underline"
                          : ""
                      }`}
                      onClick={(e) => {
                        if (!invoice.long_id) {
                          e.preventDefault();
                        }
                        e.stopPropagation();
                      }}
                    >
                      <IconCheck size={14} className="mr-1" />
                      e-Invoice Valid
                    </a>
                  ) : invoice.einvoice_status === "pending" ? (
                    <a
                      href={
                        invoice.long_id
                          ? `https://myinvois.hasil.gov.my/${invoice.uuid}/share/${invoice.long_id}`
                          : "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center text-xs font-medium text-sky-700 ${
                        invoice.long_id
                          ? "hover:text-sky-800 hover:underline"
                          : ""
                      }`}
                      onClick={(e) => {
                        if (!invoice.long_id) {
                          e.preventDefault();
                        }
                        e.stopPropagation();
                      }}
                    >
                      <IconClock size={14} className="mr-1" />
                      e-Invoice Pending
                    </a>
                  ) : invoice.einvoice_status === "invalid" ? (
                    <a
                      href={
                        invoice.long_id
                          ? `https://myinvois.hasil.gov.my/${invoice.uuid}/share/${invoice.long_id}`
                          : "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center text-xs font-medium text-rose-700 ${
                        invoice.long_id
                          ? "hover:text-rose-800 hover:underline"
                          : ""
                      }`}
                      onClick={(e) => {
                        if (!invoice.long_id) {
                          e.preventDefault();
                        }
                        e.stopPropagation();
                      }}
                    >
                      <IconAlertTriangle size={14} className="mr-1" />
                      e-Invoice Invalid
                    </a>
                  ) : invoice.einvoice_status === "cancelled" ? (
                    <a
                      href={
                        invoice.long_id
                          ? `https://myinvois.hasil.gov.my/${invoice.uuid}/share/${invoice.long_id}`
                          : "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center text-xs font-medium text-default-700 ${
                        invoice.long_id
                          ? "hover:text-default-800 hover:underline"
                          : ""
                      }`}
                      onClick={(e) => {
                        if (!invoice.long_id) {
                          e.preventDefault();
                        }
                        e.stopPropagation();
                      }}
                    >
                      <IconCancel size={14} className="mr-1" />
                      e-Invoice Cancelled
                    </a>
                  ) : null}
                </div>
              )}

              {/* Consolidated Badge */}
              {invoice.consolidated_part_of && (
                <div className="truncate overflow-auto">
                  {getConsolidatedBadge()}
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
          <div
            className={`p-2 border rounded-md ${
              isCancelled
                ? "bg-default-50 border-default-100"
                : isPaid
                ? "bg-green-50 border-green-100"
                : invoice.status === "overdue"
                ? "bg-red-50 border-red-100"
                : "bg-amber-50 border-amber-100"
            }`}
          >
            <p className="text-xs text-default-500 mb-1">Balance</p>
            <p
              className={`font-medium ${
                isCancelled
                  ? "text-default-700"
                  : isPaid
                  ? "text-green-700"
                  : invoice.status === "overdue"
                  ? "text-red-700"
                  : "text-amber-700"
              }`}
            >
              {invoice.status === "cancelled"
                ? "Cancelled"
                : invoice.current_balance === 0
                ? "Paid"
                : formatCurrency(invoice.current_balance)}
            </p>
          </div>
        </div>

        {/* Action buttons - semi-visible always, fully visible on hover */}
        <div
          className={`flex justify-end space-x-2 mt-2 transition-opacity duration-200 ${
            isCardHovered ? "opacity-100" : "opacity-70"
          }`}
        >
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

          {invoice.status === "cancelled" &&
            invoice.einvoice_status &&
            invoice.einvoice_status !== "cancelled" &&
            invoice.uuid && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSyncCancellationStatus(invoice);
                }}
                className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-full transition-colors"
                title="Sync e-Invoice Cancellation"
              >
                <IconRefresh size={18} stroke={1.5} />
              </button>
            )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrintClick(invoice);
            }}
            className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full transition-colors"
            title="Print Invoice"
          >
            <IconPrinter size={18} stroke={1.5} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownloadClick(invoice);
            }}
            className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full transition-colors"
            title="Download Invoice"
          >
            <IconFileDownload size={18} stroke={1.5} />
          </button>

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
  const ITEMS_PER_PAGE = 12;
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

  // Define default filter values as constants
  const DEFAULT_FILTERS: InvoiceFilters = {
    customer_id: null,
    status: ["active", "overdue", "paid", "cancelled"],
    consolidation: "all",
  };

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
  const [isConsolidateModalOpen, setIsConsolidateModalOpen] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(
    new Set()
  );
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const [invoicesForPDF, setInvoicesForPDF] = useState<InvoiceGT[]>([]); // Holds detailed invoices for PDF
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<InvoiceFilters>(() => {
    // Initialize filters potentially from URL params on first load
    const params = new URLSearchParams(window.location.search);
    const customerIdParam = params.get("customer_id");
    const statusParam = params.get("status");

    let initialFilters = { ...DEFAULT_FILTERS }; // Start with defaults
    if (customerIdParam) {
      initialFilters.customer_id = customerIdParam;
    }
    if (statusParam) {
      const statusValues = statusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (statusValues.length > 0) {
        initialFilters.status = statusValues;
      }
    }
    return initialFilters;
  });
  const [customerOptions, setCustomerOptions] = useState<SelectOption[]>([]);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const [customerQuery, setCustomerQuery] = useState("");
  const [isFilterButtonHovered, setIsFilterButtonHovered] = useState(false);
  const [hasViewedFilters, setHasViewedFilters] = useState(false);
  const [initialParamsApplied, setInitialParamsApplied] = useState(false);
  const [searchParams] = useSearchParams();
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);

  useEffect(() => {
    if (activeFilterCount > 0) {
      setHasViewedFilters(false);
    }
  }, [filters]); // This will reset hasViewedFilters whenever filters change

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

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // Add date filters
      if (dateRange.start) {
        params.append("start_date", formatDateForAPI(dateRange.start));
      }
      if (dateRange.end) {
        params.append("end_date", formatDateForAPI(dateRange.end));
      }

      // Add current filters from state
      if (filters.customer_id) {
        params.append("customer_id", filters.customer_id);
      }
      if (filters.status && filters.status.length > 0) {
        params.append("status", filters.status.join(","));
      }
      if (filters.consolidation === "consolidated") {
        params.append("consolidated_only", "true");
      } else if (filters.consolidation === "individual") {
        params.append("exclude_consolidated", "true");
      }

      const queryString = params.toString() ? `?${params.toString()}` : "";
      const data = await api.get(`/greentarget/api/invoices${queryString}`);
      setInvoices(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch invoices. Please try again later.");
      console.error("Error fetching invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [filters, dateRange]);

  const fetchCustomers = async () => {
    try {
      const customers = await greenTargetApi.getCustomers();
      const options = customers.map(
        (customer: { customer_id: any; name: any; phone_number: any }) => ({
          id: customer.customer_id.toString(),
          name: customer.name || `Customer ${customer.customer_id}`, // Fallback name
          phone_number: customer.phone_number,
        })
      );
      setCustomerOptions(options);

      // --- Set customerQuery AFTER options are loaded if customer_id is set ---
      const currentCustomerId = filters.customer_id;
      if (currentCustomerId) {
        const selectedCustomer = options.find(
          (c: { id: string }) => c.id === currentCustomerId
        );
        if (selectedCustomer) {
          setCustomerQuery(selectedCustomer.name);
        } else {
          setCustomerQuery(""); // Reset if customer not found in options (maybe invalid ID?)
        }
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  // Effect 1: Fetch customers ONCE on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Effect 2: Process initial URL parameters ONCE after mount
  useEffect(() => {
    const customerIdParam = searchParams.get("customer_id");
    const statusParam = searchParams.get("status");

    // Check if params exist and we haven't applied them yet
    if ((customerIdParam || statusParam) && !initialParamsApplied) {
      let newFilters = { ...filters }; // Use current filters (which were initialized from URL)
      let filtersChanged = false;

      // Re-apply or confirm filters from URL (handles potential direct navigation)
      if (customerIdParam && newFilters.customer_id !== customerIdParam) {
        newFilters.customer_id = customerIdParam;
        filtersChanged = true;
        // Update customerQuery if options are ready
        const customer = customerOptions.find(
          (c) => c.id.toString() === customerIdParam
        );
        if (customer) setCustomerQuery(customer.name);
        else setCustomerQuery("");
      }
      if (statusParam) {
        const statusValues = statusParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        // Simple comparison (might need deep comparison for arrays if complex)
        if (
          JSON.stringify(newFilters.status?.sort()) !==
          JSON.stringify(statusValues.sort())
        ) {
          newFilters.status = statusValues.length > 0 ? statusValues : null;
          filtersChanged = true;
        }
      }

      if (filtersChanged) {
        setFilters(newFilters);
      }

      // Mark initial params as processed so the main fetch effect can run
      setInitialParamsApplied(true);
    } else if (!initialParamsApplied) {
      // No specific params found in URL, or already processed, mark as ready
      setInitialParamsApplied(true);
    }
  }, [searchParams, initialParamsApplied, customerOptions, filters]); // Add dependencies

  // Effect 3: Fetch invoices when filters, dateRange change, OR after initial params are applied
  useEffect(() => {
    // Only run fetch if initial parameter processing is complete
    if (initialParamsApplied) {
      fetchInvoices();
      // Reset to page 1 when filters or date range change
      setCurrentPage(1);
    }
  }, [filters, dateRange, initialParamsApplied, fetchInvoices]); // Add fetchInvoices

  // Effect 4: Calculate active filter count (remains the same)
  useEffect(() => {
    let count = 0;
    if (filters.customer_id !== DEFAULT_FILTERS.customer_id) count++;
    if (filters.status) {
      const isDefaultStatus =
        DEFAULT_FILTERS.status !== null &&
        filters.status.length === DEFAULT_FILTERS.status.length &&
        filters.status.every((status) =>
          DEFAULT_FILTERS.status?.includes(status)
        ) &&
        DEFAULT_FILTERS.status.every((status) =>
          filters.status?.includes(status)
        );
      if (!isDefaultStatus) count++;
    } else if (DEFAULT_FILTERS.status !== null) {
      count++;
    }
    if (filters.consolidation !== DEFAULT_FILTERS.consolidation) count++;
    setActiveFilterCount(count);
  }, [filters]);

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
                ? { 
                    ...i, 
                    status: "cancelled", 
                    einvoice_status: i.einvoice_status ? "cancelled" : null 
                  }
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

      // Call the actual e-Invoice submission API
      const response = await greenTargetApi.submitEInvoice(
        invoiceToSubmitAsEInvoice.invoice_id
      );

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

  // ++ PDF Handlers ++
  const fetchFullInvoiceDetails = useCallback(
    async (ids: string[]): Promise<InvoiceGT[]> => {
      if (ids.length === 0) return [];
      const toastId = toast.loading(
        `Fetching details for ${ids.length} invoice(s)...`
      );

      try {
        // Convert string IDs to numbers
        const numericIds = ids
          .map((id) => Number(id))
          .filter((id) => !isNaN(id));

        if (numericIds.length === 0) {
          toast.error("No valid invoice IDs to fetch", { id: toastId });
          return [];
        }

        // Use batch API instead of individual requests
        const batchResults = await greenTargetApi.getBatchInvoices(numericIds);

        if (!Array.isArray(batchResults) || batchResults.length === 0) {
          toast.error("No invoice data returned", { id: toastId });
          return [];
        }

        // Check if any IDs failed to fetch
        const fetchedIds = new Set(
          batchResults.map((inv) => inv.invoice_id.toString())
        );
        const failedIds = ids.filter((id) => !fetchedIds.has(id));

        if (failedIds.length > 0) {
          console.error(`Failed to fetch invoices: ${failedIds.join(", ")}`);
          toast.error(
            `Could not fetch details for ${failedIds.length} invoice(s).`,
            { id: toastId }
          );
        } else {
          toast.dismiss(toastId);
        }

        return batchResults;
      } catch (error) {
        toast.error("Failed to fetch invoice details.", { id: toastId });
        console.error("Error fetching batch invoice details:", error);
        return [];
      }
    },
    []
  );

  const handleBulkDownloadPDF = async () => {
    const idsToFetch = Array.from(selectedInvoiceIds);
    if (idsToFetch.length === 0) {
      toast.error("No invoices selected.");
      return;
    }

    const detailedInvoices = await fetchFullInvoiceDetails(idsToFetch);

    if (detailedInvoices.length === 0) {
      // Error toast was shown in fetch function
      return;
    }

    // Now generate and download directly
    const toastId = toast.loading(
      `Generating PDF for ${detailedInvoices.length} invoice(s)...`
    );
    try {
      // Generate QR codes for each valid invoice
      const invoicesWithQR = await Promise.all(
        detailedInvoices.map(async (invoice) => {
          let qrCodeData = null;
          if (
            invoice.uuid &&
            invoice.long_id &&
            invoice.einvoice_status === "valid"
          ) {
            try {
              qrCodeData = await generateQRDataUrl(
                invoice.uuid,
                invoice.long_id
              );
            } catch (error) {
              console.error(
                `Error generating QR code for invoice ${invoice.invoice_number}:`,
                error
              );
            }
          }
          return { ...invoice, qrCodeData };
        })
      );

      // Create PDF pages with QR codes
      const pdfPages = invoicesWithQR.map((invoice) => (
        <GTInvoicePDF
          key={invoice.invoice_id}
          invoice={invoice}
          qrCodeData={invoice.qrCodeData}
        />
      ));

      const pdfComponent = (
        <Document
          title={generateGTPDFFilename(detailedInvoices).replace(".pdf", "")}
        >
          {pdfPages}
        </Document>
      );

      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);

      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = generateGTPDFFilename(detailedInvoices);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
        toast.success("PDF downloaded successfully", { id: toastId });
        setInvoicesForPDF([]); // Clear temp data
        // Optionally clear selection:
        // setSelectedInvoiceIds(new Set());
      }, 100);
    } catch (error) {
      console.error("Error generating PDF for download:", error);
      toast.error(
        `Failed to generate PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: toastId }
      );
      setInvoicesForPDF([]); // Clear temp data
    }
  };

  const handleBulkPrintPDF = async () => {
    const idsToFetch = Array.from(selectedInvoiceIds);
    if (idsToFetch.length === 0) {
      toast.error("No invoices selected.");
      return;
    }
    const detailedInvoices = await fetchFullInvoiceDetails(idsToFetch);

    if (detailedInvoices.length > 0) {
      setInvoicesForPDF(detailedInvoices);
      setShowPrintOverlay(true); // Trigger rendering the print overlay
      // onComplete in the overlay will reset isGeneratingPDF and clear invoicesForPDF
    }
  };

  const handlePrintInvoice = async (invoice: InvoiceGT) => {
    setInvoicesForPDF([invoice]);
    setShowPrintOverlay(true);
  };

  const handleDownloadInvoice = async (invoice: InvoiceGT) => {
    const toastId = toast.loading("Generating PDF...");

    try {
      // Generate QR code if needed
      let qrCodeData = null;
      if (
        invoice.uuid &&
        invoice.long_id &&
        invoice.einvoice_status === "valid"
      ) {
        try {
          qrCodeData = await generateQRDataUrl(invoice.uuid, invoice.long_id);
        } catch (error) {
          console.error("Error generating QR code:", error);
        }
      }

      // Create PDF document
      const pdfComponent = (
        <Document title={invoice.invoice_number}>
          <GTInvoicePDF invoice={invoice} qrCodeData={qrCodeData} />
        </Document>
      );

      // Generate PDF blob
      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Create and trigger download link
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `GT_Invoice_${invoice.invoice_number.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup
      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
        toast.success("PDF downloaded successfully", { id: toastId });
      }, 100);
    } catch (error) {
      console.error("Error generating PDF for download:", error);
      toast.error(
        `Failed to generate PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: toastId }
      );
    }
  };

  const isAllSelectedOnPage = useMemo(() => {
    if (!Array.isArray(invoices) || invoices.length === 0) return false;
    return invoices.every((inv) =>
      selectedInvoiceIds.has(inv.invoice_id.toString())
    );
  }, [invoices, selectedInvoiceIds]);

  const handleSelectAllOnPage = () => {
    if (isAllSelectedOnPage) {
      // Deselect all
      setSelectedInvoiceIds(new Set());
    } else {
      // Select all
      const newSelected = new Set(selectedInvoiceIds);
      invoices.forEach((invoice) => {
        newSelected.add(invoice.invoice_id.toString());
      });
      setSelectedInvoiceIds(newSelected);
    }
  };

  const handleSelectInvoice = (invoiceId: string, isSelected: boolean) => {
    setSelectedInvoiceIds((prev) => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(invoiceId);
      } else {
        newSet.delete(invoiceId);
      }
      return newSet;
    });
  };

  const handleSyncCancellationStatus = async (invoice: InvoiceGT) => {
    try {
      const toastId = toast.loading("Syncing cancellation status...");

      // Call API to sync cancellation status
      const response = await greenTargetApi.syncEInvoiceCancellation(
        invoice.invoice_id
      );

      toast.dismiss(toastId);

      // Show success message
      if (response.success) {
        toast.success(response.message);

        // Refresh invoices list
        fetchInvoices();
      } else {
        toast.error(response.message || "Failed to sync cancellation status");
      }
    } catch (error) {
      console.error("Error syncing cancellation status:", error);
      toast.error("Failed to sync cancellation status");
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const searchTermLower = searchTerm.toLowerCase();

      return (
        // Search invoice number
        invoice.invoice_number.toLowerCase().includes(searchTermLower) ||
        // Search customer name
        invoice.customer_name.toLowerCase().includes(searchTermLower) ||
        // Search driver name
        invoice.driver?.toLowerCase().includes(searchTermLower) ||
        false ||
        // Search phone numbers
        invoice.customer_phone_number
          ?.toLowerCase()
          .includes(searchTermLower) ||
        false ||
        invoice.location_phone_number
          ?.toLowerCase()
          .includes(searchTermLower) ||
        false ||
        // Search location address
        invoice.location_address?.toLowerCase().includes(searchTermLower) ||
        false ||
        // Search rental ID
        invoice.rental_id?.toString().includes(searchTermLower) ||
        false ||
        // Search dumpster ID
        invoice.tong_no?.toLowerCase().includes(searchTermLower) ||
        false
      );
    });
  }, [invoices, searchTerm]);

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setCustomerQuery("");
  };

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
    <div className="relative w-full mx-auto max-w-[95rem] px-4 sm:px-6 lg:px-8 -mt-4">
      {/* Revised Header Layout - 2 rows total on desktop */}
      <div className="space-y-4">
        {/* Row 1: Header with title, filters, search and action buttons */}
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          {/* Title */}
          <h1 className="text-2xl text-default-700 font-bold whitespace-nowrap">
            Invoices ({filteredInvoices.length})
          </h1>

          {/* Filters and Actions */}
          <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            {/* DateRangePicker */}
            <div className="w-full sm:w-auto">
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
            <div className="w-full sm:w-40">
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
                  <ListboxOptions className="absolute z-30 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
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

            {/* Filters button */}
            <div className="relative">
              <Button
                onClick={() => setShowFilters(true)}
                icon={IconFilter}
                variant="outline"
                className="relative w-full"
                onMouseEnter={() => {
                  setIsFilterButtonHovered(true);
                  setHasViewedFilters(true);
                }}
                onMouseLeave={() => setIsFilterButtonHovered(false)}
              >
                Filters
                {activeFilterCount > 0 && !hasViewedFilters && (
                  <span className="absolute -top-1 -right-1 bg-sky-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              {/* Filters info dropdown panel - Improved */}
              {isFilterButtonHovered && (
                <div className="absolute z-30 mt-2 w-72 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-sky-100 py-3 px-4 text-sm animate-fadeIn transition-all duration-200 transform origin-top">
                  <h3 className="font-semibold text-default-800 mb-2 border-b pb-1.5 border-default-100">
                    {activeFilterCount > 0 ? "Applied Filters" : "Filters"}
                  </h3>
                  {activeFilterCount === 0 ? (
                    <div className="text-default-500 py-2 px-1">
                      No filters applied.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {filters.customer_id && (
                        <li className="text-default-700 flex items-center p-1 hover:bg-sky-50 rounded-md transition-colors">
                          <div className="bg-sky-100 p-1 rounded-md mr-2">
                            <IconUser size={14} className="text-sky-600" />
                          </div>
                          <div>
                            <span className="text-default-500 text-xs">
                              Customer
                            </span>
                            <div className="font-medium truncate">
                              {customerOptions.find(
                                (c) => c.id === filters.customer_id
                              )?.name || "Unknown"}
                            </div>
                          </div>
                        </li>
                      )}
                      {filters.status && filters.status.length > 0 && (
                        <li className="text-default-700 flex items-center p-1 hover:bg-sky-50 rounded-md transition-colors">
                          <div className="bg-sky-100 p-1 rounded-md mr-2">
                            <IconCircleCheck
                              size={14}
                              className="text-sky-600"
                            />
                          </div>
                          <div>
                            <span className="text-default-500 text-xs">
                              Status
                            </span>
                            <div className="font-medium">
                              {filters.status
                                .map(
                                  (status) =>
                                    status.charAt(0).toUpperCase() +
                                    status.slice(1)
                                )
                                .join(", ")}
                            </div>
                          </div>
                        </li>
                      )}
                      {filters.consolidation !== "all" && (
                        <li className="text-default-700 flex items-center p-1 hover:bg-sky-50 rounded-md transition-colors">
                          <div className="bg-sky-100 p-1 rounded-md mr-2">
                            <IconFiles size={14} className="text-sky-600" />
                          </div>
                          <div>
                            <span className="text-default-500 text-xs">
                              Consolidation
                            </span>
                            <div className="font-medium">
                              {filters.consolidation === "consolidated"
                                ? "Consolidated"
                                : "Individual"}
                            </div>
                          </div>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Search input */}
            <div className="w-full sm:w-64 relative">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Search"
                className="w-full pl-10 py-2 border focus:border-default-500 rounded-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Row 2: Selection bar */}
        <div
          className={`p-3 ${
            selectedInvoiceIds.size > 0
              ? "bg-sky-50/95 border border-sky-200"
              : "bg-white/95 border border-default-200"
          } rounded-lg flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap sticky top-2 z-20 shadow backdrop-blur-sm`}
          onClick={handleSelectAllOnPage}
          title={
            isAllSelectedOnPage ? "Deselect All on Page" : "Select All on Page"
          }
        >
          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
            {/* Selection checkbox - always visible */}
            <button className="p-1 rounded-full transition-colors duration-200 hover:bg-default-100 active:bg-default-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-500">
              {isAllSelectedOnPage ? (
                <IconSquareMinusFilled className="text-sky-600" size={20} />
              ) : (
                <IconSelectAll className="text-default-400" size={20} />
              )}
            </button>

            {/* Selection Count and Total */}
            <div className="flex-grow">
              {selectedInvoiceIds.size > 0 ? (
                <span className="font-medium text-sky-800 text-sm flex items-center flex-wrap gap-x-2">
                  <span>{selectedInvoiceIds.size} selected</span>
                  <span className="hidden sm:inline mx-1 border-r border-sky-300 h-4"></span>
                  <span className="whitespace-nowrap">
                    Total:{" "}
                    {new Intl.NumberFormat("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    }).format(
                      invoices
                        .filter((inv) =>
                          selectedInvoiceIds.has(String(inv.invoice_id))
                        )
                        .reduce(
                          (sum, inv) => sum + (Number(inv.total_amount) || 0),
                          0
                        )
                    )}
                  </span>
                </span>
              ) : (
                <span
                  className="text-default-500 text-sm cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAllOnPage();
                  }}
                >
                  Select invoices to perform actions
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div
            className="flex gap-2 flex-wrap w-full sm:w-auto sm:ml-auto"
            onClick={(e) => e.stopPropagation()} // Prevent row selection click
          >
            {/* PDF Buttons (Show only when items are selected) */}
            {selectedInvoiceIds.size > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkPrintPDF} // Use the new handler
                  icon={IconPrinter}
                  disabled={loading}
                  aria-label="Print Selected Invoices"
                  title="Print PDF"
                >
                  Print
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkDownloadPDF}
                  icon={IconFileDownload}
                  disabled={loading}
                  aria-label="Download Selected Invoices"
                  title="Download PDF"
                >
                  Download
                </Button>
              </>
            )}
            <Button
              onClick={() => setIsConsolidateModalOpen(true)}
              icon={IconFiles}
              variant="outline"
              size="sm"
              title="Consolidate menu"
            >
              Consolidate
            </Button>
            <Button
              onClick={() => setIsStatementModalOpen(true)}
              icon={IconFileInvoice}
              variant="outline"
              size="sm"
              title="Generate Statement"
            >
              Statement
            </Button>
            <Button
              onClick={() => fetchInvoices()}
              icon={IconRefresh}
              variant="outline"
              title="Refresh invoice data"
              aria-label="Refresh invoices"
              size="sm"
            >
              Refresh
            </Button>
            <Button
              onClick={() => navigate("/greentarget/invoices/new")}
              icon={IconPlus}
              variant="outline"
              size="sm"
              title="Create new invoice"
            >
              Create
            </Button>
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
                onSyncCancellationStatus={handleSyncCancellationStatus}
                onPrintClick={handlePrintInvoice}
                onDownloadClick={handleDownloadInvoice}
                isSelected={selectedInvoiceIds.has(
                  invoice.invoice_id.toString()
                )}
                onSelect={handleSelectInvoice}
              />
            ))}
          </div>
        )}
      </div>

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

      <Dialog
        as="div"
        className="fixed inset-0 overflow-y-auto z-50"
        open={showFilters}
        onClose={() => setShowFilters(false)}
      >
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm"
          aria-hidden="true"
        />
        <div className="flex items-center justify-center min-h-screen relative">
          <TransitionChild
            as="div"
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="relative bg-white rounded-lg max-w-2xl w-full mx-4 p-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <DialogTitle as="h3" className="text-lg font-medium">
                  Filter Invoices
                </DialogTitle>
                <button
                  onClick={() => setShowFilters(false)}
                  className="p-2 rounded-full hover:bg-default-100"
                >
                  <IconX size={18} />
                </button>
              </div>
              <div className="space-y-4">
                {/* Customer Filter */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Customer
                  </label>
                  <FormCombobox
                    name="customer_filter"
                    label=""
                    value={filters.customer_id || ""}
                    onChange={(value) => {
                      const newCustomerId = Array.isArray(value)
                        ? value[0] || null
                        : value || null;
                      setFilters((prev) => ({
                        ...prev,
                        customer_id: newCustomerId,
                      }));
                      // Update customerQuery based on selection
                      const selectedOption = customerOptions.find(
                        (opt) => opt.id === newCustomerId
                      );
                      setCustomerQuery(
                        selectedOption ? selectedOption.name : ""
                      );
                    }}
                    options={customerOptions}
                    query={customerQuery}
                    setQuery={setCustomerQuery}
                    mode="single"
                    placeholder="Select a customer..."
                  />
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Status
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {["active", "paid", "overdue", "cancelled"].map(
                      (status) => (
                        <label
                          key={status}
                          className="inline-flex items-center group cursor-pointer py-1"
                        >
                          <div className="relative flex items-center">
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={
                                filters.status?.includes(status) || false
                              }
                              onChange={(e) => {
                                setFilters((prev) => ({
                                  ...prev,
                                  status: e.target.checked
                                    ? [...(prev.status || []), status]
                                    : (prev.status || []).filter(
                                        (s) => s !== status
                                      ),
                                }));
                              }}
                            />
                            {filters.status?.includes(status) ? (
                              <IconSquareCheckFilled
                                className="text-sky-500"
                                size={20}
                              />
                            ) : (
                              <IconSquare
                                className="text-default-400 group-hover:text-sky-400 transition-colors"
                                size={20}
                              />
                            )}
                          </div>
                          <span className="ml-2 capitalize">{status}</span>
                        </label>
                      )
                    )}
                  </div>
                </div>

                {/* Consolidation Filter */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Consolidation Status
                  </label>
                  <div className="flex flex-col space-y-3 md:flex-row md:space-y-0 md:space-x-6">
                    <label className="inline-flex items-center cursor-pointer">
                      <div className="relative flex items-center">
                        <input
                          type="radio"
                          name="consolidation"
                          className="sr-only"
                          checked={filters.consolidation === "all"}
                          onChange={() =>
                            setFilters((prev) => ({
                              ...prev,
                              consolidation: "all",
                            }))
                          }
                        />
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center mr-2.5 ${
                            filters.consolidation === "all"
                              ? "border-sky-500 bg-white"
                              : "border-default-300 bg-white"
                          }`}
                        >
                          {filters.consolidation === "all" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
                          )}
                        </div>
                      </div>
                      <span className="text-default-700">All</span>
                    </label>
                    <label className="inline-flex items-center cursor-pointer">
                      <div className="relative flex items-center">
                        <input
                          type="radio"
                          name="consolidation"
                          className="sr-only"
                          checked={filters.consolidation === "individual"}
                          onChange={() =>
                            setFilters((prev) => ({
                              ...prev,
                              consolidation: "individual",
                            }))
                          }
                        />
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center mr-2.5 ${
                            filters.consolidation === "individual"
                              ? "border-sky-500 bg-white"
                              : "border-default-300 bg-white"
                          }`}
                        >
                          {filters.consolidation === "individual" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
                          )}
                        </div>
                      </div>
                      <span className="text-default-700">Individual</span>
                    </label>
                    <label className="inline-flex items-center cursor-pointer">
                      <div className="relative flex items-center">
                        <input
                          type="radio"
                          name="consolidation"
                          className="sr-only"
                          checked={filters.consolidation === "consolidated"}
                          onChange={() =>
                            setFilters((prev) => ({
                              ...prev,
                              consolidation: "consolidated",
                            }))
                          }
                        />
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center mr-2.5 ${
                            filters.consolidation === "consolidated"
                              ? "border-sky-500 bg-white"
                              : "border-default-300 bg-white"
                          }`}
                        >
                          {filters.consolidation === "consolidated" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
                          )}
                        </div>
                      </div>
                      <span className="text-default-700">Consolidated</span>
                    </label>
                  </div>
                </div>

                <div className="mt-8 pt-2 flex justify-center">
                  <Button
                    onClick={clearFilters}
                    variant="outline"
                    className="w-40"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          </TransitionChild>
        </div>
      </Dialog>
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
      {/* Statement modal */}
      <GTStatementModal
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
        month={selectedMonth.id}
        year={currentYear}
      />
      <GTConsolidatedInvoiceModal
        isOpen={isConsolidateModalOpen}
        onClose={() => setIsConsolidateModalOpen(false)}
        month={selectedMonth.id}
        year={currentYear}
      />
      {/* ++ PDF Handlers (Rendered conditionally) ++ */}
      {showPrintOverlay && invoicesForPDF.length > 0 && (
        <GTPrintPDFOverlay
          invoices={invoicesForPDF}
          onComplete={() => {
            setShowPrintOverlay(false);
            setInvoicesForPDF([]); // Clear the detailed data
          }}
        />
      )}
    </div>
  );
};

export default InvoiceListPage;

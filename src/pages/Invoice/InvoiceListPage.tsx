// src/pages/Invoice/InvoiceListPage.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ExtendedInvoiceData, InvoiceFilters } from "../../types/types";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import DateRangePicker from "../../components/DateRangePicker";
import InvoiceFilterMenu from "../../components/Invoice/InvoiceFilterMenu";
import InvoiceGrid from "../../components/Invoice/InvoiceGrid";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import SubmissionResultsModal from "../../components/Invoice/SubmissionResultsModal";
import PDFDownloadHandler from "../../utils/invoice/PDF/PDFDownloadHandler";
import PrintPDFOverlay from "../../utils/invoice/PDF/PrintPDFOverlay";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  IconPlus,
  IconRefresh,
  IconSearch,
  IconChevronDown,
  IconCheck,
  IconSquareMinusFilled,
  IconSend,
  IconFileDownload,
  IconPrinter,
  IconBan,
  IconSelectAll,
  IconFiles,
  IconCash,
  IconCircleCheck,
  IconFileInvoice,
  IconUser,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { useCustomerNames } from "../../hooks/useCustomerNames";
// Import the specific utilities needed
import {
  getInvoices,
  cancelInvoice,
  syncCancellationStatus,
  getInvoicesByIds,
} from "../../utils/invoice/InvoiceUtils";
import Pagination from "../../components/Invoice/Pagination";
import ConsolidatedInvoiceModal from "../../components/Invoice/ConsolidatedInvoiceModal";
import EInvoicePDFHandler from "../../utils/invoice/einvoice/EInvoicePDFHandler";

// --- Constants ---
const STORAGE_KEY = "invoiceListFilters_v2"; // Use a unique key
const ITEMS_PER_PAGE = 50; // Number of items per page

interface MonthOption {
  id: number;
  name: string;
}

// --- Helper Functions ---
const getInitialDates = (): { start: Date; end: Date } => {
  const savedFilters = localStorage.getItem(STORAGE_KEY);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (savedFilters) {
    try {
      // Only parse dates, ignore other filters from old storage format if needed
      const { start, end } = JSON.parse(savedFilters);
      const parsedStart = start ? new Date(start) : thirtyDaysAgo;
      const parsedEnd = end ? new Date(end) : today;
      // Basic validation
      if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime())) {
        return { start: parsedStart, end: parsedEnd };
      }
    } catch {
      /* Ignore parsing error, use defaults */
    }
  }
  return { start: thirtyDaysAgo, end: today };
};

const saveDatesToStorage = (startDate: Date | null, endDate: Date | null) => {
  if (!startDate || !endDate) return; // Don't save null dates
  try {
    // Save only dates, other filters are managed by state now
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      })
    );
  } catch (e) {
    console.error("Failed to save date filters to local storage", e);
  }
};

const isInvoiceDateEligibleForEinvoice = (
  createdDateString: string | undefined | null
): boolean => {
  if (!createdDateString) return false;
  const now = Date.now();
  const threeDaysInMillis = 3 * 24 * 60 * 60 * 1000;
  const cutoffTimestamp = now - threeDaysInMillis;
  const invoiceTimestamp = parseInt(createdDateString, 10);
  return !isNaN(invoiceTimestamp) && invoiceTimestamp >= cutoffTimestamp;
};

// --- Component ---
const InvoiceListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- State ---
  const [invoices, setInvoices] = useState<ExtendedInvoiceData[]>([]); // Data for the CURRENT page
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(
    new Set()
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0); // TOTAL items matching filters (from backend)
  const [totalPages, setTotalPages] = useState(1); // TOTAL pages (from backend)
  const [searchTerm, setSearchTerm] = useState("");
  const [isFetchTriggered, setIsFetchTriggered] = useState(true); // Trigger fetch on load/change
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showEInvoiceConfirm, setShowEInvoiceConfirm] = useState(false);
  const [showSubmissionResults, setShowSubmissionResults] = useState(false);
  const [submissionResults, setSubmissionResults] = useState(null);
  const [isSubmittingInvoices, setIsSubmittingInvoices] = useState(false);
  const [showConsolidatedModal, setShowConsolidatedModal] = useState(false);
  const [showEInvoiceDownloader, setShowEInvoiceDownloader] = useState(false);
  const [eInvoicesToDownload, setEInvoicesToDownload] = useState<
    ExtendedInvoiceData[]
  >([]);
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [selectedInvoicesForPDF, setSelectedInvoicesForPDF] = useState<
    ExtendedInvoiceData[]
  >([]);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const [isFilterButtonHovered, setIsFilterButtonHovered] = useState(false);
  const [hasViewedFilters, setHasViewedFilters] = useState(false);
  const [isAllSelectFetching, setIsAllSelectFetching] = useState(false);
  const cachedSelectAllIdsRef = useRef<{
    ids: string[];
    hash: string;
    total: number;
  }>({
    ids: [],
    hash: "",
    total: 0,
  });
  const [selectedInvoicesTotal, setSelectedInvoicesTotal] = useState<number>(0);

  // Filters State - Initialized with dates from storage, others default
  const initialFilters = useMemo(
    (): InvoiceFilters => ({
      dateRange: getInitialDates(),
      salespersonId: null,
      paymentType: null,
      invoiceStatus: ["paid", "Unpaid", "overdue"], // Default excludes 'cancelled'
      eInvoiceStatus: [],
      consolidation: "all",
    }),
    []
  );
  const [filters, setFilters] = useState<InvoiceFilters>(initialFilters);

  const DEFAULT_FILTERS: InvoiceFilters = {
    dateRange: getInitialDates(), // This will be overridden in actual usage
    salespersonId: null,
    paymentType: null,
    invoiceStatus: ["paid", "Unpaid", "overdue"], // Default invoice status
    eInvoiceStatus: [], // Default e-invoice status
    consolidation: "all",
  };

  // Helper function to generate a hash of current filters
  const getFiltersHash = useCallback(() => {
    return JSON.stringify({
      dateRange: {
        start: filters.dateRange.start?.getTime(),
        end: filters.dateRange.end?.getTime(),
      },
      salespersonId: filters.salespersonId?.join(","),
      paymentType: filters.paymentType,
      invoiceStatus: filters.invoiceStatus?.join(","),
      eInvoiceStatus: filters.eInvoiceStatus?.join(","),
      consolidation: filters.consolidation,
      searchTerm,
    });
  }, [filters, searchTerm]);

  // Month Selector State
  const currentMonthIndex = useMemo(() => new Date().getMonth(), []);
  const monthOptions: MonthOption[] = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        name: new Date(0, i).toLocaleString("en", { month: "long" }),
      })),
    []
  );
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[currentMonthIndex]
  );

  // Data Hooks
  const { salesmen } = useSalesmanCache();
  const customerIds = useMemo(
    () => invoices.map((inv) => inv.customerid),
    [invoices]
  );
  // Fetch customer names based on IDs present in the currently loaded invoices
  const { customerNames } = useCustomerNames(customerIds);

  // Ref for external clearing (optional)
  const clearSelectionRef = useRef<(() => void) | null>(null);

  // --- Derived State ---
  // Selection state based on currently displayed invoices on the page
  // Selection state based on currently displayed invoices and total selections
  const selectionState = useMemo(() => {
    // Ensure invoices is an array before proceeding
    if (!Array.isArray(invoices) || invoices.length === 0) {
      return {
        isAllSelectedOnPage: false,
        isIndeterminate: false,
        selectedOnPageCount: 0,
        totalSelectableOnPage: 0,
        hasSelectionsOnOtherPages: false,
      };
    }

    const currentPageIds = new Set(invoices.map((inv) => inv.id));
    const selectedOnPage = Array.from(selectedInvoiceIds).filter((id) =>
      currentPageIds.has(id)
    );

    const selectedOnPageCount = selectedOnPage.length;
    const totalSelectableOnPage = invoices.length;

    // Check if we have selections on other pages
    const totalSelectedCount = selectedInvoiceIds.size;
    const hasSelectionsOnOtherPages = totalSelectedCount > selectedOnPageCount;

    return {
      isAllSelectedOnPage:
        selectedOnPageCount === totalSelectableOnPage &&
        totalSelectableOnPage > 0,
      isIndeterminate:
        selectedOnPageCount > 0 && selectedOnPageCount < totalSelectableOnPage,
      selectedOnPageCount,
      totalSelectableOnPage,
      hasSelectionsOnOtherPages,
    };
  }, [selectedInvoiceIds, invoices]);

  const hasValidEInvoices = useCallback(() => {
    return invoices.some(
      (inv) => selectedInvoiceIds.has(inv.id) && inv.einvoice_status === "valid"
    );
  }, [invoices, selectedInvoiceIds]);

  // --- Callbacks ---

  // Fetch Invoices using the utility (No changes needed here)
  const fetchInvoices = useCallback(
    async (
      pageToFetch: number,
      currentFilters: InvoiceFilters,
      currentSearchTerm: string
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        // Call the API utility with the provided filters, page, limit, and search term
        const response = await getInvoices(
          currentFilters, // Pass the filters directly
          pageToFetch,
          ITEMS_PER_PAGE,
          currentSearchTerm // Pass the search term
        );
        setInvoices(response.data);
        setTotalItems(response.pagination.total); // FIXED - access the nested property
        setTotalPages(response.pagination.totalPages); // FIXED - access the nested property
        setCurrentPage(pageToFetch); // Ensure page state matches fetched page
        // Optional: Clear selection when data reloads
        // setSelectedInvoiceIds(new Set());
      } catch (err: any) {
        setError(err.message || "Failed to fetch invoices.");
        setInvoices([]); // Clear data on error
        setTotalItems(0);
        setTotalPages(1);
      } finally {
        setIsLoading(false);
        setIsFetchTriggered(false); // Reset trigger
      }
    },
    [] // No dependencies needed as parameters are passed in
  );

  // Effect to trigger fetch when needed (page change or manual trigger)
  useEffect(() => {
    // Only fetch if triggered, prevents fetching on initial mount if not desired
    if (isFetchTriggered) {
      // Pass the current state values to the fetch function
      fetchInvoices(currentPage, filters, searchTerm);
    }
    // Disable eslint warning because fetchInvoices is stable due to useCallback([])
    // and we explicitly pass the dependencies (filters, searchTerm) when calling it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetchTriggered, currentPage]); // Only re-run when page changes or triggered manually

  useEffect(() => {
    if (showEInvoiceDownloader && eInvoicesToDownload.length > 0) {
      // The component is now in the DOM, but we need to programmatically click its button
      // Find the button and click it
      const downloadButton = document.querySelector(
        '[data-einvoice-download="true"]'
      );
      if (downloadButton && downloadButton instanceof HTMLButtonElement) {
        downloadButton.click();
      }
      // Reset the state after a delay
      setTimeout(() => {
        setShowEInvoiceDownloader(false);
        setEInvoicesToDownload([]);
      }, 500);
    }
  }, [showEInvoiceDownloader, eInvoicesToDownload]);

  // Effect to calculate active filter count comparing against defaults
  useEffect(() => {
    let count = 0;

    // Check if salesperson filter is active
    if (filters.salespersonId && filters.salespersonId.length > 0) {
      count++;
    }

    // Check if payment type filter is active
    if (filters.paymentType !== DEFAULT_FILTERS.paymentType) {
      count++;
    }

    // Check if invoice status filter is different from default
    if (filters.invoiceStatus) {
      // Need to compare arrays contents, not references
      const isDefaultStatus =
        DEFAULT_FILTERS.invoiceStatus.length === filters.invoiceStatus.length &&
        filters.invoiceStatus.every((status) =>
          DEFAULT_FILTERS.invoiceStatus.includes(status)
        ) &&
        DEFAULT_FILTERS.invoiceStatus.every((status) =>
          filters.invoiceStatus.includes(status)
        );

      if (!isDefaultStatus) {
        count++;
      }
    }

    // Check if e-invoice status filter is active
    if (filters.eInvoiceStatus && filters.eInvoiceStatus.length > 0) {
      count++;
    }

    // Check if consolidation filter is active
    if (filters.consolidation !== DEFAULT_FILTERS.consolidation) {
      count++;
    }

    setActiveFilterCount(count);
  }, [filters]);

  // Add this effect to reset hasViewedFilters
  useEffect(() => {
    if (activeFilterCount > 0) {
      setHasViewedFilters(false);
    }
  }, [filters]); // Reset when filters change

  // Effect to invalidate the cache when filters change
  useEffect(() => {
    // Invalidate the cache when filters or search term changes
    cachedSelectAllIdsRef.current = { ids: [], hash: "", total: 0 };
  }, [filters, searchTerm]);

  // Filter Change Handler - Receives the COMPLETE, new filter state to apply
  const handleApplyFilters = useCallback(
    (newAppliedFilters: InvoiceFilters) => {
      // Check if there are any existing selections first
      if (selectedInvoiceIds.size > 0) {
        if (
          window.confirm(
            "Your current selections will be lost when changing filters. Continue?"
          )
        ) {
          setSelectedInvoiceIds(new Set()); // Only clear if user confirms
        } else {
          return; // Don't apply filters if user cancels
        }
      }

      // 1. Update the main filters state
      setFilters(newAppliedFilters);

      // 2. Save date range to storage
      saveDatesToStorage(
        newAppliedFilters.dateRange.start,
        newAppliedFilters.dateRange.end
      );

      // 3. Trigger Fetch: Reset to page 1 and set trigger
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
      setIsFetchTriggered(true);
    },
    [currentPage, selectedInvoiceIds]
  );

  // --- Specific Filter Handlers (Date, Month, Remove Tag) ---
  // These handlers construct the *full* new filter state and call handleApplyFilters

  // Date Range Change Handler (Applies Immediately)
  const handleDateChange = useCallback(
    (range: { start: Date | null; end: Date | null }) => {
      // Construct the new *full* filter state
      const updatedFilters: InvoiceFilters = {
        ...filters, // Keep existing filters
        dateRange: {
          // Update only the date range
          start: range.start || filters.dateRange.start, // Use existing if null
          end: range.end || filters.dateRange.end,
        },
      };
      // Apply the combined filter state
      handleApplyFilters(updatedFilters);
    },
    [filters, handleApplyFilters]
  ); // Depends on current filters and the apply function

  // Month Change Handler (Applies Immediately)
  const handleMonthChange = useCallback(
    (month: MonthOption) => {
      setSelectedMonth(month); // Update local state for the dropdown display

      // --- Determine the target year ---
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthIndex = now.getMonth(); // 0-11

      // If selected month is *after* the current month, use the previous year.
      // Otherwise, use the current year.
      const targetYear =
        month.id > currentMonthIndex ? currentYear - 1 : currentYear;

      // Calculate start and end dates using the targetYear
      const startDate = new Date(targetYear, month.id, 1); // Day 1 of selected month in targetYear
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(targetYear, month.id + 1, 0); // Day 0 of *next* month = last day of selected month
      endDate.setHours(23, 59, 59, 999);

      // Construct the new *full* filter state
      const updatedFilters: InvoiceFilters = {
        ...filters, // Keep existing filters
        dateRange: { start: startDate, end: endDate }, // Update date range
      };
      // Apply the combined filter state
      handleApplyFilters(updatedFilters);
    },
    [filters, handleApplyFilters] // Depends on current filters and the apply function
  );

  // Search Handlers - Update state locally, trigger fetch on blur/enter
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const lastSearchTermRef = useRef(searchTerm);

  const handleSearchBlur = () => {
    // Only trigger search if the search term has actually changed
    if (searchTerm.trim() !== lastSearchTermRef.current.trim()) {
      lastSearchTermRef.current = searchTerm.trim(); // Update ref with trimmed value

      // Trigger Fetch: Reset to page 1 and set trigger
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
      setIsFetchTriggered(true); // Trigger fetch
      setSelectedInvoiceIds(new Set()); // Clear selection on new search
    }
  };

  // Handle Enter key press in search input
  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      // Prevent form submission if it's inside one
      event.preventDefault();
      // Trigger the same logic as blur
      handleSearchBlur();
      // Optionally blur the input
      event.currentTarget.blur();
    }
  };

  // Select/Deselect a single invoice
  const handleSelectInvoice = useCallback(
    (invoiceId: string) => {
      setSelectedInvoiceIds((prev) => {
        const newSet = new Set(prev);
        const invoice = invoices.find((inv) => inv.id === invoiceId);

        if (newSet.has(invoiceId)) {
          // Deselect: remove from set and subtract amount
          newSet.delete(invoiceId);
          if (invoice) {
            setSelectedInvoicesTotal((current) =>
              Math.max(0, current - (invoice.totalamountpayable || 0))
            );
          }
        } else {
          // Select: add to set and add amount
          newSet.add(invoiceId);
          if (invoice) {
            setSelectedInvoicesTotal(
              (current) => current + (invoice.totalamountpayable || 0)
            );
          }
        }
        return newSet;
      });
    },
    [invoices]
  );

  // Toggle between no selection and all invoices selected across all pages
  const handleToggleSelectAll = useCallback(
    async (e: { stopPropagation: () => void }) => {
      e?.stopPropagation(); // Prevent event bubbling

      // If we already have selections, clear them and reset total
      if (selectedInvoiceIds.size > 0) {
        setSelectedInvoiceIds(new Set());
        setSelectedInvoicesTotal(0);
        return;
      }

      // Check if we have cached results with matching filters
      const currentFiltersHash = getFiltersHash();
      if (
        cachedSelectAllIdsRef.current.hash === currentFiltersHash &&
        cachedSelectAllIdsRef.current.ids.length > 0
      ) {
        // Use cached IDs and total
        setSelectedInvoiceIds(new Set(cachedSelectAllIdsRef.current.ids));
        setSelectedInvoicesTotal(cachedSelectAllIdsRef.current.total || 0);
        return;
      }

      // Prevent duplicate API calls
      if (isAllSelectFetching) return;

      setIsAllSelectFetching(true);
      // Otherwise, fetch all IDs matching current filters
      try {
        // Build query parameters matching current filters
        const params = new URLSearchParams();

        // Add date range
        if (filters.dateRange.start) {
          params.append(
            "startDate",
            filters.dateRange.start.getTime().toString()
          );
        }
        if (filters.dateRange.end) {
          params.append("endDate", filters.dateRange.end.getTime().toString());
        }

        // Add salesperson filter
        if (filters.salespersonId && filters.salespersonId.length > 0) {
          params.append("salesman", filters.salespersonId.join(","));
        }

        // Add payment type filter
        if (filters.paymentType) {
          params.append("paymentType", filters.paymentType);
        }

        // Add invoice status filter
        if (filters.invoiceStatus && filters.invoiceStatus.length > 0) {
          params.append("invoiceStatus", filters.invoiceStatus.join(","));
        }

        // Add e-invoice status filter
        if (filters.eInvoiceStatus && filters.eInvoiceStatus.length > 0) {
          params.append("eInvoiceStatus", filters.eInvoiceStatus.join(","));
        }

        // Handle consolidation filter
        if (filters.consolidation === "consolidated") {
          params.append("consolidated_only", "true");
        } else if (filters.consolidation === "individual") {
          params.append("exclude_consolidated", "true");
        }

        // Add search term
        if (searchTerm) {
          params.append("search", searchTerm);
        }

        // Make the API call with all parameters
        const queryString = params.toString() ? `?${params.toString()}` : "";
        const response = await api.get(
          `/api/invoices/selection/ids${queryString}`
        );

        if (response && response.ids && Array.isArray(response.ids)) {
          // Cache the results with total
          cachedSelectAllIdsRef.current = {
            ids: response.ids,
            hash: currentFiltersHash,
            total: response.total || 0,
          };

          setSelectedInvoiceIds(new Set(response.ids));
          setSelectedInvoicesTotal(response.total || 0);
        } else if (Array.isArray(response) && response.length === 0) {
          toast.error("No invoices match your current filters");
        } else {
          toast.error("Failed to select all invoices");
        }
      } catch (error) {
        console.error("Error fetching all invoice IDs:", error);
        toast.error(
          `Failed to select all invoices: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        setIsAllSelectFetching(false);
      }
    },
    [
      filters,
      searchTerm,
      selectedInvoiceIds.size,
      getFiltersHash,
      isAllSelectFetching,
    ]
  );

  // Function to clear selection (can be called externally via ref)
  const clearCurrentSelection = useCallback(() => {
    setSelectedInvoiceIds(new Set());
  }, []);
  useEffect(() => {
    clearSelectionRef.current = clearCurrentSelection;
  }, [clearCurrentSelection]);

  // Navigation
  const handleCreateNewInvoice = () => navigate("/sales/invoice/new");
  const handleViewDetails = (invoiceId: string) =>
    navigate(`/sales/invoice/${invoiceId}`, {
      state: { previousPath: location.pathname + location.search },
    });

  // --- Bulk Actions ---
  const handleRefresh = () => {
    if (!isLoading) {
      setIsFetchTriggered(true); // Trigger a refetch with current settings
    }
  };

  // Initiate Bulk Cancel
  const handleBulkCancel = () => {
    if (selectedInvoiceIds.size === 0) return;
    // Filter selected invoices that are actually cancellable (not already cancelled)
    const cancellableInvoices = invoices.filter(
      (inv) =>
        selectedInvoiceIds.has(inv.id) && inv.invoice_status !== "cancelled"
    );
    if (cancellableInvoices.length === 0) {
      toast.error("No selected invoices are eligible for cancellation.");
      return;
    }
    setShowCancelConfirm(true);
  };

  // Confirm Bulk Cancel Action
  const confirmBulkCancel = async () => {
    setShowCancelConfirm(false);
    // Re-filter right before cancelling
    const idsToCancel = Array.from(selectedInvoiceIds).filter((id) => {
      // Find invoice in current page data if available
      const invoice = invoices.find((inv) => inv.id === id);
      // Only include if not already cancelled
      return !invoice || invoice.invoice_status !== "cancelled";
    });

    if (idsToCancel.length === 0) return;

    const toastId = toast.loading(
      `Cancelling ${idsToCancel.length} invoice(s)...`
    );
    let successCount = 0;
    let failCount = 0;

    // Process in batches of 10 to avoid too many concurrent requests
    const BATCH_SIZE = 10;

    for (let i = 0; i < idsToCancel.length; i += BATCH_SIZE) {
      const batchIds = idsToCancel.slice(i, i + BATCH_SIZE);
      toast.loading(`Cancelling invoices (${i}/${idsToCancel.length})...`, {
        id: toastId,
      });

      const batchResults = await Promise.allSettled(
        batchIds.map((id) => cancelInvoice(id))
      );

      batchResults.forEach((result, index) => {
        const invoiceId = batchIds[index];
        if (result.status === "fulfilled") {
          successCount++;
          // Update local state for the cancelled invoice if it's on current page
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === invoiceId
                ? { ...inv, ...result.value } // Merge update from cancelInvoice response
                : inv
            )
          );
        } else {
          failCount++;
          console.error(
            `Failed to cancel invoice ${invoiceId}:`,
            result.reason
          );
        }
      });
    }

    setSelectedInvoiceIds(new Set()); // Clear selection after attempting

    if (failCount > 0) {
      toast.error(
        `${failCount} cancellation(s) failed. ${successCount} succeeded. Check console for details.`,
        { id: toastId, duration: 5000 }
      );
    } else {
      toast.success(`${successCount} invoice(s) cancelled successfully.`, {
        id: toastId,
      });
    }

    // Refresh to make sure we have the latest data
    setIsFetchTriggered(true);
  };

  const hasCancelledUnsynced = useCallback(() => {
    return invoices.some(
      (inv) =>
        selectedInvoiceIds.has(inv.id) &&
        inv.invoice_status === "cancelled" &&
        inv.uuid &&
        inv.einvoice_status !== "cancelled"
    );
  }, [invoices, selectedInvoiceIds]);

  // Add this handler for batch syncing
  const handleBatchSyncCancellation = async () => {
    if (selectedInvoiceIds.size === 0) return;

    // Filter for eligible invoices based on current data
    const eligibleInvoices = invoices.filter(
      (inv) =>
        selectedInvoiceIds.has(inv.id) &&
        inv.invoice_status === "cancelled" &&
        inv.uuid &&
        inv.einvoice_status !== "cancelled"
    );

    if (eligibleInvoices.length === 0) {
      toast.error("No selected invoices are eligible for cancellation sync.");
      return;
    }

    const toastId = toast.loading(
      `Syncing cancellation status for ${eligibleInvoices.length} invoice(s)...`
    );
    let successCount = 0;
    let failCount = 0;

    const results = await Promise.allSettled(
      eligibleInvoices.map((inv) => syncCancellationStatus(inv.id))
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        successCount++;
      } else {
        failCount++;
      }
    });

    // Clear selection after attempting
    setSelectedInvoiceIds(new Set());

    if (failCount > 0) {
      toast.error(
        `${failCount} sync operation(s) failed. ${successCount} succeeded.`,
        { id: toastId, duration: 5000 }
      );
    } else {
      toast.success(`${successCount} invoice(s) synced successfully.`, {
        id: toastId,
      });
    }

    // Refresh the list to show updated statuses
    setIsFetchTriggered(true);
  };

  // Initiate Bulk E-Invoice Submission
  const handleBulkSubmitEInvoice = () => {
    if (selectedInvoiceIds.size === 0) return;

    // Filter for eligible invoices based on current data
    const eligibleInvoices = invoices.filter(
      (inv) =>
        selectedInvoiceIds.has(inv.id) &&
        inv.invoice_status !== "cancelled" && // Cannot submit cancelled
        (inv.einvoice_status === null ||
          inv.einvoice_status === "invalid" ||
          inv.einvoice_status === "pending") && // Not already valid/cancelled
        // Validate customer has necessary identification
        inv.customerTin &&
        inv.customerIdNumber && // Ensure both TIN and ID number are present
        isInvoiceDateEligibleForEinvoice(inv.createddate)
    );

    if (eligibleInvoices.length === 0) {
      toast.error(
        "No selected invoices are eligible for e-invoice submission (Must be within last 3 days, Unpaid/Paid/Overdue, Customer must have TIN/ID, and not already Valid/Cancelled).",
        { duration: 8000 }
      );
      return;
    }
    if (eligibleInvoices.length < selectedInvoiceIds.size) {
      const ineligibleCount = selectedInvoiceIds.size - eligibleInvoices.length;
      toast.error(
        `${ineligibleCount} selected invoice(s) are ineligible (check date, status, customer info). Proceeding with ${eligibleInvoices.length} eligible invoice(s).`,
        { duration: 6000 }
      );
    }

    setShowEInvoiceConfirm(true);
  };

  // Confirm Bulk E-Invoice Action
  const confirmBulkSubmitEInvoice = async () => {
    setShowEInvoiceConfirm(false);
    // Filter again *right before* sending, using the same eligibility criteria
    const idsToSubmit = invoices
      .filter(
        (inv) =>
          selectedInvoiceIds.has(inv.id) &&
          inv.invoice_status !== "cancelled" &&
          (inv.einvoice_status === null || inv.einvoice_status === "invalid") &&
          inv.customerTin &&
          inv.customerIdNumber && // Ensure both TIN and ID number are present
          isInvoiceDateEligibleForEinvoice(inv.createddate)
      )
      .map((inv) => inv.id);

    if (idsToSubmit.length === 0) {
      toast.error("No eligible invoices found to submit.");
      return;
    }

    // Show the submission results modal with loading state
    setSubmissionResults(null);
    setIsSubmittingInvoices(true);
    setShowSubmissionResults(true);

    try {
      // Call backend endpoint responsible for submitting
      const response = await api.post("/api/einvoice/submit", {
        invoiceIds: idsToSubmit,
      });

      // Save the full response for the modal to display
      setSubmissionResults(response);

      // Still show quick toast notification
      if (response.success) {
        const acceptedCount = response.acceptedDocuments?.length || 0;
        const rejectedCount = response.rejectedDocuments?.length || 0;

        if (acceptedCount > 0 && rejectedCount === 0) {
          toast.success(`Successfully submitted ${acceptedCount} invoice(s)`);
        } else if (acceptedCount > 0 && rejectedCount > 0) {
          toast.success(
            `Partial success: ${acceptedCount} accepted, ${rejectedCount} rejected`
          );
        } else {
          toast.error(`All ${rejectedCount} invoice(s) were rejected`);
        }
      } else {
        toast.error(response.message || "E-invoice submission failed");
      }

      setSelectedInvoiceIds(new Set()); // Clear selection
      setIsFetchTriggered(true); // Refresh list data to show updated statuses
    } catch (error: any) {
      console.error("Error calling bulk e-invoice submission endpoint:", error);
      toast.error(
        `Submission request failed: ${
          error.response?.data?.message ||
          error.message ||
          "Network or server error"
        }`
      );
      setShowSubmissionResults(false); // Hide modal on network error
    } finally {
      setIsSubmittingInvoices(false);
    }
  };

  const handleDownloadValidEInvoices = () => {
    // Get only the invoices with valid e-invoice status
    const validEInvoices = invoices.filter(
      (inv) => selectedInvoiceIds.has(inv.id) && inv.einvoice_status === "valid"
    );

    if (validEInvoices.length === 0) {
      toast.error("No valid e-invoices found in selection");
      return;
    }

    // Pass the filtered invoices directly to the downloader
    setEInvoicesToDownload(validEInvoices);
    setShowEInvoiceDownloader(true);
  };

  // Bulk Download PDF Handler
  const handleBulkDownload = async () => {
    if (selectedInvoiceIds.size === 0) {
      toast.error("No invoices selected for download");
      return;
    }

    const toastId = toast.loading(
      `Preparing ${selectedInvoiceIds.size} invoice PDFs...`
    );

    try {
      // Get ALL selected invoice IDs from the Set
      const selectedIds = Array.from(selectedInvoiceIds);

      // Process in chunks of 50 to avoid overwhelming the server
      const BATCH_SIZE = 50;
      let completeInvoices:
        | any[]
        | ((prevState: ExtendedInvoiceData[]) => ExtendedInvoiceData[]) = [];

      for (let i = 0; i < selectedIds.length; i += BATCH_SIZE) {
        const batchIds = selectedIds.slice(i, i + BATCH_SIZE);
        toast.loading(`Loading invoices (${i}/${selectedIds.length})...`, {
          id: toastId,
        });

        const batchInvoices = await getInvoicesByIds(batchIds);
        completeInvoices = completeInvoices.concat(batchInvoices);
      }

      if (completeInvoices.length === 0) {
        throw new Error("Could not fetch required invoice details");
      }

      if (completeInvoices.length < selectedIds.length) {
        toast.loading(
          `Generating PDFs for ${completeInvoices.length}/${selectedIds.length} invoices...`,
          { id: toastId }
        );
      }

      setSelectedInvoicesForPDF(completeInvoices);
      setIsGeneratingPDF(true);

      // This will create PDFDownloadHandler but we need to programmatically click its button
      // Give it time to render
      setTimeout(() => {
        const downloadButton = document.querySelector(
          '[data-pdf-download="true"]'
        );
        if (downloadButton && downloadButton instanceof HTMLButtonElement) {
          downloadButton.click();
          toast.success("Generating PDF download...", { id: toastId });
        } else {
          throw new Error("Download button not found");
        }
      }, 100);
    } catch (error) {
      console.error("Error preparing PDF download:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to prepare PDF",
        { id: toastId }
      );
      setIsGeneratingPDF(false);
      setSelectedInvoicesForPDF([]);
    }
  };

  // Bulk Print PDF Handler
  const handleBulkPrint = async () => {
    if (selectedInvoiceIds.size === 0) {
      toast.error("No invoices selected for printing");
      return;
    }

    const toastId = toast.loading(
      `Preparing ${selectedInvoiceIds.size} invoices for printing...`
    );

    try {
      // Get ALL selected invoice IDs from the Set
      const selectedIds = Array.from(selectedInvoiceIds);

      // Process in chunks of 50 to avoid overwhelming the server
      const BATCH_SIZE = 50;
      let completeInvoices:
        | any[]
        | ((prevState: ExtendedInvoiceData[]) => ExtendedInvoiceData[]) = [];

      for (let i = 0; i < selectedIds.length; i += BATCH_SIZE) {
        const batchIds = selectedIds.slice(i, i + BATCH_SIZE);
        toast.loading(`Loading invoices (${i}/${selectedIds.length})...`, {
          id: toastId,
        });

        const batchInvoices = await getInvoicesByIds(batchIds);
        completeInvoices = completeInvoices.concat(batchInvoices);
      }

      if (completeInvoices.length === 0) {
        throw new Error("Could not fetch required invoice details");
      }

      if (completeInvoices.length < selectedIds.length) {
        toast.error(
          `Only ${completeInvoices.length} out of ${selectedIds.length} invoices could be loaded`,
          { id: toastId, duration: 4000 }
        );
      } else {
        toast.success("Opening print dialog...", { id: toastId });
      }

      setSelectedInvoicesForPDF(completeInvoices);
      setShowPrintOverlay(true);
    } catch (error) {
      console.error("Error preparing for print:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to prepare print view",
        { id: toastId }
      );
    }
  };

  // --- Render ---
  return (
    <div className="flex flex-col w-full h-full px-4 md:px-12">
      <div className="space-y-4">
        {/* --- Combined Header and Filters --- */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 flex-shrink-0">
          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-semibold text-default-900 md:mr-4">
            Invoices {totalItems > 0 && !isLoading && `(${totalItems})`}
          </h1>

          {/* Filters container */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap md:flex-1 md:justify-end">
            {/* Date Range Picker */}
            <div className="w-full sm:w-auto">
              <DateRangePicker
                dateRange={{
                  start: filters.dateRange.start || new Date(),
                  end: filters.dateRange.end || new Date(),
                }}
                onDateChange={handleDateChange}
              />
            </div>

            {/* Month Selector */}
            <div className="w-full sm:w-40">
              <Listbox value={selectedMonth} onChange={handleMonthChange}>
                <div className="relative">
                  <ListboxButton className="w-full h-[42px] rounded-full border border-default-300 bg-white py-[9px] pl-3 pr-10 text-left focus:outline-none focus:border-default-500 text-sm">
                    <span className="block truncate pl-1">
                      {selectedMonth.name}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <IconChevronDown
                        className="h-5 w-5 text-default-400"
                        aria-hidden="true"
                      />
                    </span>
                  </ListboxButton>
                  <Transition
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ListboxOptions className="absolute z-50 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg text-sm">
                      {monthOptions.map((month) => (
                        <ListboxOption
                          key={month.id}
                          value={month}
                          className={({ active }) =>
                            `relative cursor-pointer select-none py-2 pl-4 pr-4 rounded-md ${
                              active
                                ? "bg-default-100 text-default-900"
                                : "text-gray-900"
                            }`
                          }
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
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                  <IconCheck
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                    stroke={2.5}
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </Transition>
                </div>
              </Listbox>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:flex-1 md:max-w-md">
              <IconSearch
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-default-400 pointer-events-none"
                size={18}
              />
              <input
                type="text"
                placeholder="Search"
                className="w-full h-[42px] pl-11 pr-4 bg-white border border-default-300 rounded-full focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                value={searchTerm}
                onChange={handleSearchChange}
                onBlur={handleSearchBlur}
                onKeyDown={handleSearchKeyDown}
              />
            </div>

            {/* Filter Menu Button */}
            <div className="relative">
              <InvoiceFilterMenu
                currentFilters={filters}
                onFilterChange={handleApplyFilters}
                salesmanOptions={salesmen.map((s) => ({
                  id: s.id,
                  name: s.name || s.id,
                }))}
                onMouseEnter={() => {
                  setIsFilterButtonHovered(true);
                  setHasViewedFilters(true);
                }}
                onMouseLeave={() => setIsFilterButtonHovered(false)}
                activeFilterCount={activeFilterCount}
                hasViewedFilters={hasViewedFilters}
              />

              {/* Filters info dropdown panel */}
              {isFilterButtonHovered && (
                <div className="absolute z-10 mt-2 right-0 w-72 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-sky-100 py-3 px-4 text-sm animate-fadeIn transition-all duration-200 transform origin-top-right">
                  <h3 className="font-semibold text-default-800 mb-2 border-b pb-1.5 border-default-100">
                    {activeFilterCount > 0 ? "Applied Filters" : "Filters"}
                  </h3>
                  {activeFilterCount === 0 ? (
                    <div className="text-default-500 py-2 px-1">
                      No filters applied.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {filters.salespersonId &&
                        filters.salespersonId.length > 0 && (
                          <li className="text-default-700 flex items-center p-1 hover:bg-sky-50 rounded-md transition-colors">
                            <div className="bg-sky-100 p-1 rounded-md mr-2 flex-shrink-0">
                              <IconUser size={14} className="text-sky-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-default-500 text-xs">
                                Salesman
                              </span>
                              <div className="font-medium break-words">
                                {filters.salespersonId.join(", ")}
                              </div>
                            </div>
                          </li>
                        )}

                      {filters.paymentType && (
                        <li className="text-default-700 flex items-center p-1 hover:bg-sky-50 rounded-md transition-colors">
                          <div className="bg-sky-100 p-1 rounded-md mr-2">
                            <IconCash size={14} className="text-sky-600" />
                          </div>
                          <div>
                            <span className="text-default-500 text-xs">
                              Payment Type
                            </span>
                            <div className="font-medium">
                              {filters.paymentType}
                            </div>
                          </div>
                        </li>
                      )}

                      {filters.invoiceStatus &&
                        filters.invoiceStatus.length > 0 &&
                        !(
                          filters.invoiceStatus.length === 3 &&
                          filters.invoiceStatus.includes("paid") &&
                          filters.invoiceStatus.includes("Unpaid") &&
                          filters.invoiceStatus.includes("overdue")
                        ) && (
                          <li className="text-default-700 flex items-center p-1 hover:bg-sky-50 rounded-md transition-colors">
                            <div className="bg-sky-100 p-1 rounded-md mr-2">
                              <IconCircleCheck
                                size={14}
                                className="text-sky-600"
                              />
                            </div>
                            <div>
                              <span className="text-default-500 text-xs">
                                Invoice Status
                              </span>
                              <div className="font-medium">
                                {filters.invoiceStatus
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

                      {filters.eInvoiceStatus &&
                        filters.eInvoiceStatus.length > 0 && (
                          <li className="text-default-700 flex items-center p-1 hover:bg-sky-50 rounded-md transition-colors">
                            <div className="bg-sky-100 p-1 rounded-md mr-2">
                              <IconFileInvoice
                                size={14}
                                className="text-sky-600"
                              />
                            </div>
                            <div>
                              <span className="text-default-500 text-xs">
                                E-Invoice Status
                              </span>
                              <div className="font-medium">
                                {filters.eInvoiceStatus
                                  .map((status) =>
                                    status === "null"
                                      ? "Not Submitted"
                                      : status.charAt(0).toUpperCase() +
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
          </div>
        </div>
        {/* --- Batch Action Bar --- */}
        <div
          className={`p-3 ${
            selectedInvoiceIds.size > 0
              ? "bg-sky-50 border border-sky-200"
              : "bg-white border border-dashed border-default-200"
          } rounded-lg flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap sticky top-0 z-0 shadow-sm`}
          onClick={handleToggleSelectAll}
          title={
            selectionState.isAllSelectedOnPage
              ? "Deselect All on Page"
              : "Select All on Page"
          }
        >
          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
            {/* Selection checkbox - now toggles all selection across pages */}
            <div className="relative">
              <button
                className="p-1 rounded-full transition-colors duration-200 hover:bg-default-100 active:bg-default-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-500"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSelectAll(e);
                }}
                title={
                  selectedInvoiceIds.size > 0
                    ? "Clear selection"
                    : "Select all invoices across all pages"
                }
              >
                {selectedInvoiceIds.size > 0 ? (
                  <IconSquareMinusFilled className="text-sky-600" size={20} />
                ) : (
                  <IconSelectAll className="text-default-400" size={20} />
                )}
              </button>
            </div>

            {/* Selection Count and Total */}
            <div className="flex-grow">
              {/* Selection info text */}
              {selectedInvoiceIds.size > 0 ? (
                <span className="font-medium text-sky-800 text-sm flex items-center flex-wrap gap-x-2">
                  <span>{selectedInvoiceIds.size} selected</span>
                  <span className="hidden sm:inline mx-1 border-r border-sky-300 h-4"></span>
                  <span className="whitespace-nowrap">
                    {/* Use the total state instead of calculating from visible invoices */}
                    Total:{" "}
                    {new Intl.NumberFormat("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    }).format(selectedInvoicesTotal)}
                  </span>
                </span>
              ) : (
                <span
                  className="text-default-500 text-sm cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleSelectAll(e);
                  }}
                >
                  Select invoices to perform actions
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons (Show only when items are selected) */}
          <div
            className="flex gap-2 flex-wrap w-full sm:w-auto sm:ml-auto"
            onClick={(e) => e.stopPropagation()} // Prevent row selection click
          >
            {selectedInvoiceIds.size > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  color="rose"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBulkCancel();
                  }}
                  icon={IconBan}
                  disabled={isLoading}
                  aria-label="Cancel Selected Invoices"
                  title="Cancel"
                >
                  Cancel
                </Button>
                {hasCancelledUnsynced() && (
                  <Button
                    size="sm"
                    variant="outline"
                    color="rose"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBatchSyncCancellation();
                    }}
                    icon={IconRefresh}
                    disabled={isLoading}
                    aria-label="Sync Cancellation Status"
                    title="Sync Cancellation Status"
                  >
                    Sync Cancellation
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  color="amber"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBulkSubmitEInvoice();
                  }}
                  icon={IconSend}
                  disabled={isLoading}
                  aria-label="Submit Selected for E-Invoice"
                  title="Submit e-Invoice"
                >
                  Submit e-Invoice
                </Button>
                {hasValidEInvoices() && (
                  <Button
                    size="sm"
                    variant="outline"
                    color="sky"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadValidEInvoices();
                    }}
                    icon={IconFileDownload}
                    disabled={isLoading}
                    aria-label="e-Invoice"
                    title="Download e-Invoice"
                  >
                    Download e-Invoice
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBulkDownload();
                  }}
                  icon={IconFileDownload}
                  disabled={isLoading}
                  aria-label="Download Selected Invoices"
                  title="Download PDF"
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBulkPrint();
                  }}
                  icon={IconPrinter}
                  disabled={isLoading}
                  aria-label="Print Selected Invoices"
                  title="Print PDF"
                >
                  Print
                </Button>
              </>
            )}

            <Button
              onClick={() => setShowConsolidatedModal(true)}
              icon={IconFiles}
              variant="outline"
              color="amber"
              disabled={isLoading}
              size="sm"
            >
              Consolidated
            </Button>
            <Button
              onClick={handleRefresh}
              icon={IconRefresh}
              variant="outline"
              disabled={isLoading}
              size="sm"
            >
              Refresh
            </Button>
            <Button
              onClick={handleCreateNewInvoice}
              icon={IconPlus}
              variant="filled"
              color="sky"
              size="sm"
            >
              Create New
            </Button>
          </div>
        </div>
        {/* --- Invoice Grid Area --- */}
        <div className="flex-1 min-h-[400px] relative">
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex justify-center items-center z-20 rounded-lg">
              <LoadingSpinner />
            </div>
          )}
          {/* Error Message */}
          {error && !isLoading && (
            <div className="p-4 text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-200">
              Error fetching invoices: {error}
            </div>
          )}
          {/* No Results Message */}
          {!isLoading && !error && invoices.length === 0 && (
            <div className="p-6 text-center text-default-500 bg-default-50 rounded-lg border border-dashed border-default-200">
              No invoices found matching your criteria.
            </div>
          )}
          {/* Invoice Grid */}
          {!isLoading && !error && invoices.length > 0 && (
            <InvoiceGrid
              // Pass only the invoices data, filtering happens during fetch
              invoices={invoices}
              selectedInvoiceIds={selectedInvoiceIds}
              onSelectInvoice={handleSelectInvoice}
              onViewDetails={handleViewDetails}
              isLoading={false} // Grid itself isn't loading, page is
              error={null}
              customerNames={customerNames} // Pass customer names for display
            />
          )}
        </div>
        {/* --- Pagination --- */}
        <div className="flex-shrink-0 mt-auto pb-4">
          {/* Stick to bottom */}
          {!isLoading && totalItems > 0 && totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(page) => {
                if (page !== currentPage) {
                  // Set page and trigger fetch via useEffect
                  setCurrentPage(page);
                  setIsFetchTriggered(true);
                  // Scroll to top might be good here
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              itemsCount={invoices.length} // Items on current page
              totalItems={totalItems} // Total matching items
              pageSize={ITEMS_PER_PAGE}
            />
          )}
        </div>
      </div>
      {/* Consolidated Invoice Modal */}
      <ConsolidatedInvoiceModal
        isOpen={showConsolidatedModal}
        onClose={() => setShowConsolidatedModal(false)}
        month={selectedMonth.id}
        year={new Date().getFullYear()}
      />
      {/* --- Submission Results Modal --- */}
      <SubmissionResultsModal
        isOpen={showSubmissionResults}
        onClose={() => setShowSubmissionResults(false)}
        results={submissionResults}
        isLoading={isSubmittingInvoices}
      />
      {/* --- Confirmation Dialogs --- */}
      <ConfirmationDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={confirmBulkCancel}
        title={`Cancel Selected Invoice(s)`}
        message={`Are you sure you want to cancel the selected eligible invoice(s)? This action is and may attempt to cancel submitted e-invoices.`}
        confirmButtonText="Confirm Cancellation"
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showEInvoiceConfirm}
        onClose={() => setShowEInvoiceConfirm(false)}
        onConfirm={confirmBulkSubmitEInvoice}
        title={`Submit Selected Invoices for e-Invoicing`}
        message={`You are about to submit ${
          invoices.filter(
            // Recalculate count here for the message
            (inv) =>
              selectedInvoiceIds.has(inv.id) &&
              inv.invoice_status !== "cancelled" &&
              (inv.einvoice_status === null ||
                inv.einvoice_status === "invalid" ||
                inv.einvoice_status === "pending") &&
              inv.customerTin &&
              inv.customerIdNumber &&
              isInvoiceDateEligibleForEinvoice(inv.createddate)
          ).length
        } eligible invoice(s) to MyInvois e-invoicing system. Continue?`}
        confirmButtonText="Submit e-Invoices"
        variant="default"
      />
      {/* E-Invoice PDF Downloader (invisible, triggered by state) */}
      {showEInvoiceDownloader && eInvoicesToDownload.length > 0 && (
        <div style={{ display: "none" }}>
          <EInvoicePDFHandler
            invoices={eInvoicesToDownload} // Changed from einvoices to invoices
            disabled={false}
          />
        </div>
      )}
      {/* PDF Download Handler - Hidden but functional */}
      {isGeneratingPDF && selectedInvoicesForPDF.length > 0 && (
        <div style={{ display: "none" }}>
          <PDFDownloadHandler
            invoices={selectedInvoicesForPDF}
            disabled={false}
            customerNames={customerNames}
            onComplete={() => {
              setIsGeneratingPDF(false);
              setSelectedInvoicesForPDF([]);
            }}
          />
        </div>
      )}

      {/* Print Overlay */}
      {showPrintOverlay && selectedInvoicesForPDF.length > 0 && (
        <PrintPDFOverlay
          invoices={selectedInvoicesForPDF}
          customerNames={customerNames}
          onComplete={() => {
            setShowPrintOverlay(false);
            setSelectedInvoicesForPDF([]);
          }}
        />
      )}
    </div>
  );
};

export default InvoiceListPage;

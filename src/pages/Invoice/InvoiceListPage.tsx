// src/pages/Invoice/InvoiceListPage.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ExtendedInvoiceData,
  InvoiceFilters,
  ProductItem,
} from "../../types/types";
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
import InvoiceSoloPDFHandler from "../../utils/invoice/PDF/InvoiceSoloPDFHandler";
import InvoiceSoloPrintOverlay from "../../utils/invoice/PDF/InvoiceSoloPrintOverlay";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  IconPlus,
  IconRefresh,
  IconSearch,
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
  IconFileExport,
} from "@tabler/icons-react";
import { useCustomerNames } from "../../utils/catalogue/useCustomerNames";
// Import the specific utilities needed
import {
  getInvoices,
  cancelInvoice,
  syncCancellationStatus,
  getInvoicesByIds,
} from "../../utils/invoice/InvoiceUtils";
import Pagination from "../../components/Invoice/Pagination";
import ConsolidatedInvoiceModal from "../../components/Invoice/ConsolidatedInvoiceModal";
import InvoiceDailyPrintMenu from "../../components/Invoice/InvoiceDailyPrintMenu";
import StyledListbox from "../../components/StyledListbox";
import DateNavigator from "../../components/DateNavigator";
import MonthNavigator from "../../components/MonthNavigator";

// --- Constants ---
const STORAGE_KEY = "invoiceListFilters_v2"; // Use a unique key
const SESSION_STORAGE_KEY = "invoiceListState"; // For complete state persistence
const ITEMS_PER_PAGE = 50; // Number of items per page


declare global {
  interface Window {
    showSaveFilePicker: (
      options?: SaveFilePickerOptions
    ) => Promise<FileSystemFileHandle>;
  }

  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: {
      description?: string;
      accept?: Record<string, string[]>;
    }[];
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: any): Promise<void>;
    close(): Promise<void>;
  }
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

/**
 * Formats an array of invoice data into a string that matches the legacy
 * SLS_*.txt file format for export.
 * @param invoices - An array of ExtendedInvoiceData objects.
 * @returns A string with each invoice formatted as a line, separated by newlines.
 */
const formatInvoicesForExport = (invoices: ExtendedInvoiceData[]): string => {
  const lines = invoices.map((invoice) => {
    // 1. Format date (dd/MM/yyyy)
    const dateObj = new Date(Number(invoice.createddate));
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    // 2. Format time (hh:mm am/pm)
    const formattedTime = dateObj
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .toUpperCase();

    // 3. Format total amount (with comma separator, e.g., 1,234.56)
    const totalAmountString = (invoice.totalamountpayable || 0).toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      }
    );

    // 4. Map payment type to character
    const typeChar = invoice.paymenttype === "CASH" ? "C" : "I";

    // 5. Format order details string
    const orderDetailsString = (invoice.products || [])
      .filter((p) => !p.issubtotal && !p.istotal) // Ensure only product rows are included
      .map((p: ProductItem) => {
        const code = p.code || "";
        const qty = p.quantity || 0;
        // Price and total are multiplied by 100 and stored as integers
        const price = Math.round((p.price || 0) * 100);
        const total = Math.round(parseFloat(p.total) * 100);
        const foc = p.freeProduct || 0;
        const returned = p.returnProduct || 0;
        return `${code}&&${qty}&&${price}&&${total}&&${foc}&&${returned}`;
      })
      .join("&E&");

    // 6. Assemble the amount fields (7 fields total, as per legacy format)
    const amountFields = [
      totalAmountString,
      "0.00",
      totalAmountString,
      "0.00",
      totalAmountString,
      "0.00",
      totalAmountString,
    ].join("|");

    // 7. Use customer ID for the customer field
    const customerField = invoice.customerid;

    // 8. Assemble the final line string for the invoice, ending with "&E&"
    return (
      [
        invoice.id,
        invoice.id, // orderno is same as invoiceno
        formattedDate,
        typeChar,
        customerField,
        invoice.salespersonid,
        amountFields,
        formattedTime,
        orderDetailsString,
      ].join("|") + "&E&"
    );
  });

  // Join all invoice lines with a newline and add a trailing newline for compatibility.
  return lines.join("\r\n") + (lines.length > 0 ? "\r\n" : "");
};

// --- Session State Management ---
const saveStateToSession = (state: {
  page: number;
  filters: InvoiceFilters;
  searchTerm: string;
}) => {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state to session storage", e);
  }
};

const getStateFromSession = (): {
  page: number;
  filters: InvoiceFilters;
  searchTerm: string;
} | null => {
  try {
    const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Convert date strings back to Date objects
      if (parsed.filters?.dateRange) {
        if (parsed.filters.dateRange.start) {
          parsed.filters.dateRange.start = new Date(
            parsed.filters.dateRange.start
          );
        }
        if (parsed.filters.dateRange.end) {
          parsed.filters.dateRange.end = new Date(parsed.filters.dateRange.end);
        }
      }
      return parsed;
    }
  } catch (e) {
    console.error("Failed to restore state from session storage", e);
  }
  return null;
};

const clearSessionState = () => {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
};

// --- Component ---
const InvoiceListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- State ---
  const [invoices, setInvoices] = useState<ExtendedInvoiceData[]>([]); // Data for the CURRENT page
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false); // New state for export
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(
    new Set()
  );
  const savedSessionState = getStateFromSession();
  const [currentPage, setCurrentPage] = useState(savedSessionState?.page || 1);
  const [totalItems, setTotalItems] = useState(0); // TOTAL items matching filters (from backend)
  const [totalPages, setTotalPages] = useState(1); // TOTAL pages (from backend)
  const [searchTerm, setSearchTerm] = useState(
    savedSessionState?.searchTerm || ""
  );
  const [isFetchTriggered, setIsFetchTriggered] = useState(true); // Trigger fetch on load/change
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showEInvoiceConfirm, setShowEInvoiceConfirm] = useState(false);
  const [showSubmissionResults, setShowSubmissionResults] = useState(false);
  const [submissionResults, setSubmissionResults] = useState(null);
  const [isSubmittingInvoices, setIsSubmittingInvoices] = useState(false);
  const [showConsolidatedModal, setShowConsolidatedModal] = useState(false);
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const [showSoloPrintOverlay, setShowSoloPrintOverlay] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingSoloPDF, setIsGeneratingSoloPDF] = useState(false);
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
  const [searchParams] = useSearchParams();
  const [initialParamsApplied, setInitialParamsApplied] = useState(false);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState<string | number>(
    ""
  );

  // Filters State - Initialized with dates from storage, others default
  const initialFilters = useMemo((): InvoiceFilters => {
    if (savedSessionState?.filters) {
      return savedSessionState.filters;
    }
    return {
      dateRange: getInitialDates(),
      salespersonId: null,
      customerId: null,
      paymentType: null,
      invoiceStatus: ["paid", "Unpaid", "Overdue", "cancelled"],
      eInvoiceStatus: [],
      consolidation: "all",
    };
  }, [savedSessionState]);
  const [filters, setFilters] = useState<InvoiceFilters>(initialFilters);

  const DEFAULT_FILTERS: InvoiceFilters = {
    dateRange: getInitialDates(), // This will be overridden in actual usage
    salespersonId: null,
    customerId: null,
    paymentType: null,
    invoiceStatus: ["paid", "Unpaid", "Overdue", "cancelled"], // Default invoice status
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
      customerId: filters.customerId,
      paymentType: filters.paymentType,
      invoiceStatus: filters.invoiceStatus?.join(","),
      eInvoiceStatus: filters.eInvoiceStatus?.join(","),
      consolidation: filters.consolidation,
      searchTerm,
    });
  }, [filters, searchTerm]);

  // Month Selector State - used for MonthNavigator
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  // Data Hooks
  const { salesmen } = useSalesmanCache();
  const customerIds = useMemo(
    () => invoices.map((inv) => inv.customerid),
    [invoices]
  );
  // Fetch customer names based on IDs present in the currently loaded invoices
  const { customerNames } = useCustomerNames(customerIds);

  // Salesman options for single selection dropdown
  const salesmanOptions = useMemo(() => {
    const options = [{ id: "", name: "All Salesmen" }];
    return options.concat(
      salesmen.map((s) => ({
        id: s.id,
        name: s.name || s.id,
      }))
    );
  }, [salesmen]);

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

  // Fetch Invoices on initial load or when filters change
  useEffect(() => {
    // Only fetch if triggered, prevents fetching on initial mount if not desired
    if (initialParamsApplied && isFetchTriggered) {
      // Pass the current state values to the fetch function
      fetchInvoices(currentPage, filters, searchTerm);
    }
    // Disable eslint warning because fetchInvoices is stable due to useCallback([])
    // and we explicitly pass the dependencies (filters, searchTerm) when calling it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetchTriggered, currentPage, initialParamsApplied]); // Only re-run when page changes or triggered manually

  // Effect to save state to session storage whenever it changes
  useEffect(() => {
    if (initialParamsApplied) {
      saveStateToSession({
        page: currentPage,
        filters,
        searchTerm,
      });
    }
  }, [currentPage, filters, searchTerm, initialParamsApplied]);

  // Clear session state when navigating away from the app entirely
  useEffect(() => {
    const handleBeforeUnload = () => {
      clearSessionState();
    };

    // Listen for route changes
    if (location.pathname.includes("/sales/invoice")) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Clear session state when component unmounts and not navigating to another invoice page
      const currentPath = window.location.pathname;
      if (!currentPath.includes("/sales/invoice")) {
        clearSessionState();
      }
    };
  }, [location, navigate]);

  // Effect: Process customerId URL parameter ONCE after mount
  useEffect(() => {
    const customerIdParam = searchParams.get("customerId");

    // Check if customerId param exists and we haven't applied it yet
    if (customerIdParam && !initialParamsApplied) {
      // Set the customer filter
      setFilters((prev) => ({
        ...prev,
        customerId: customerIdParam,
      }));

      // Clear date range when viewing specific customer (as requested)
      setFilters((prev) => ({
        ...prev,
        dateRange: {
          start: null,
          end: null,
        },
      }));

      // Mark initial params as processed
      setInitialParamsApplied(true);
    } else if (!customerIdParam && !initialParamsApplied) {
      // No customerId param found, mark as ready
      setInitialParamsApplied(true);
    }
  }, [searchParams, initialParamsApplied]);


  // Effect to calculate active filter count comparing against defaults
  useEffect(() => {
    let count = 0;

    // Check if salesperson filter is active
    if (filters.salespersonId && filters.salespersonId.length > 0) {
      count++;
    }

    // Check if customer filter is active
    if (filters.customerId) {
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
  }, [filters, activeFilterCount]); // Reset when filters change

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

  // Date Navigator change handler
  const handleDateNavigatorChange = useCallback(
    (newDate: Date) => {
      const startOfDay = new Date(newDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(newDate);
      endOfDay.setHours(23, 59, 59, 999);

      const updatedFilters: InvoiceFilters = {
        ...filters,
        dateRange: {
          start: startOfDay,
          end: endOfDay,
        },
      };
      handleApplyFilters(updatedFilters);
    },
    [filters, handleApplyFilters]
  );

  // Month Change Handler (Applies Immediately)
  const handleMonthChange = useCallback(
    (newDate: Date) => {
      setSelectedMonth(newDate); // Update local state for the navigator display

      // Calculate start and end dates for the selected month
      const startDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
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

  // Single Salesman Selection Handler
  const handleSalesmanChange = useCallback(
    (salesmanId: string | number) => {
      setSelectedSalesmanId(salesmanId);

      // Update filters to sync with the single selection
      const updatedFilters: InvoiceFilters = {
        ...filters,
        salespersonId: salesmanId === "" ? null : [salesmanId as string],
      };
      handleApplyFilters(updatedFilters);
    },
    [filters, handleApplyFilters]
  );

  // Effect to sync selectedSalesmanId with filters when filters change externally
  useEffect(() => {
    const currentSalespersonIds = filters.salespersonId;
    if (!currentSalespersonIds || currentSalespersonIds.length === 0) {
      setSelectedSalesmanId("");
    } else if (currentSalespersonIds.length === 1) {
      setSelectedSalesmanId(currentSalespersonIds[0]);
    } else {
      // Multiple salesmen selected - show empty for single dropdown
      setSelectedSalesmanId("");
    }
  }, [filters.salespersonId]);

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

  const handleClearSearch = () => {
    setSearchTerm("");
    // Update the ref to trigger search on next blur
    lastSearchTermRef.current = "";
    // Trigger search immediately if there was a search term
    if (searchTerm.trim()) {
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
      setIsFetchTriggered(true);
      setSelectedInvoiceIds(new Set());
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
      state: {
        previousPath: location.pathname + location.search,
        fromList: true,
      },
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
        inv.customerPhone && // Ensure phone number is present
        // Check if invoice date is within the last 3 days
        isInvoiceDateEligibleForEinvoice(inv.createddate)
    );

    if (eligibleInvoices.length === 0) {
      toast.error(
        "No selected invoices are eligible for e-invoice submission (Must be within last 3 days, Unpaid/Paid/Overdue, Customer must have TIN/ID and phone number, and not already Valid/Cancelled).",
        { duration: 12000 }
      );
      return;
    }
    if (eligibleInvoices.length < selectedInvoiceIds.size) {
      const ineligibleCount = selectedInvoiceIds.size - eligibleInvoices.length;
      toast.error(
        `${ineligibleCount} selected invoice(s) are ineligible (check date, status, customer info). Proceeding with ${eligibleInvoices.length} eligible invoice(s).`,
        { duration: 8000 }
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


  // Bulk Export Handler
  const handleBulkExport = async () => {
    if (selectedInvoiceIds.size === 0) {
      toast.error("No invoices selected for export");
      return;
    }

    // Check for File System Access API support
    if (!("showSaveFilePicker" in window)) {
      toast.error(
        "Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge."
      );
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(
      `Preparing ${selectedInvoiceIds.size} invoices for export...`
    );

    try {
      const selectedIds = Array.from(selectedInvoiceIds);

      // Fetch full data for all selected invoices
      const BATCH_SIZE = 50;
      let completeInvoices: ExtendedInvoiceData[] = [];
      for (let i = 0; i < selectedIds.length; i += BATCH_SIZE) {
        const batchIds = selectedIds.slice(i, i + BATCH_SIZE);
        toast.loading(`Loading invoice data (${i}/${selectedIds.length})...`, {
          id: toastId,
        });
        const batchInvoices = await getInvoicesByIds(batchIds);
        completeInvoices = completeInvoices.concat(batchInvoices);
      }

      if (completeInvoices.length === 0) {
        throw new Error("Could not fetch required invoice details for export.");
      }

      toast.loading(
        `Generating export data for ${completeInvoices.length} invoices...`,
        {
          id: toastId,
        }
      );

      // Format data into the required text format
      const fileContent = formatInvoicesForExport(completeInvoices);

      // Use File System Access API to save the file with fixed filename
      const suggestedName = `SLS1.txt`;
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "Sales Text File",
            accept: { "text/plain": [".txt"] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(fileContent);
      await writable.close();

      toast.success(
        `Successfully exported ${completeInvoices.length} invoices to ${handle.name}`,
        { id: toastId }
      );
    } catch (error) {
      // Don't show toast for user cancellation of the save dialog
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.dismiss(toastId);
        return;
      }
      console.error("Error during bulk export:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to export invoices.",
        { id: toastId }
      );
    } finally {
      setIsExporting(false);
    }
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
      let completeInvoices: ExtendedInvoiceData[] = [];

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
      
      // Use solo PDF handler for single invoice, regular handler for multiple
      if (completeInvoices.length === 1) {
        setIsGeneratingSoloPDF(true);
      } else {
        setIsGeneratingPDF(true);
      }

      // This will create the appropriate PDFDownloadHandler but we need to programmatically click its button
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
      setIsGeneratingSoloPDF(false);
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
      let completeInvoices: ExtendedInvoiceData[] = [];

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
      
      // Use solo print overlay for single invoice, regular overlay for multiple
      if (completeInvoices.length === 1) {
        setShowSoloPrintOverlay(true);
      } else {
        setShowPrintOverlay(true);
      }
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
    <div className="space-y-3">
      <div className="space-y-3">
        {/* --- Combined Header and Filters --- */}
        <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-3 flex-shrink-0">
          {/* Left: Count + Title + Date Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
              {totalItems > 0 && !isLoading ? `${totalItems} ` : ""}Invoices
            </h1>
            <span className="hidden sm:inline text-default-300 dark:text-gray-600">|</span>
            <DateRangePicker
              dateRange={{
                start: filters.dateRange.start || new Date(),
                end: filters.dateRange.end || new Date(),
              }}
              onDateChange={handleDateChange}
            />
            <span className="hidden sm:inline text-default-300 dark:text-gray-600">|</span>
            <div className="flex items-center gap-1">
              <DateNavigator
                selectedDate={filters.dateRange.start || new Date()}
                onChange={handleDateNavigatorChange}
                showGoToTodayButton={false}
              />
              <MonthNavigator
                selectedMonth={selectedMonth}
                onChange={handleMonthChange}
                showGoToCurrentButton={false}
                dateRange={{
                  start: filters.dateRange.start || new Date(),
                  end: filters.dateRange.end || new Date(),
                }}
              />
            </div>
          </div>

          {/* Right: Search and Filters */}
          <div className="flex flex-wrap items-center gap-2 h-10">
            {/* Search Input */}
            <div
              className="relative w-full sm:w-48 h-10"
              title="Search invoices by ID, Customer, Salesman, Products, Status, Payment Type, or Amount"
            >
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400 dark:text-gray-500 pointer-events-none"
                size={16}
              />
              <input
                type="text"
                placeholder="Search"
                className="w-full h-10 pl-9 pr-8 bg-white dark:bg-gray-900/50 border border-default-300 dark:border-gray-600 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-sm text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-500"
                value={searchTerm}
                onChange={handleSearchChange}
                onBlur={handleSearchBlur}
                onKeyDown={handleSearchKeyDown}
              />
              {searchTerm && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
                  onClick={handleClearSearch}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Salesman Filter */}
            <div className="w-full sm:w-36 h-10">
              <StyledListbox
                value={selectedSalesmanId}
                onChange={handleSalesmanChange}
                options={salesmanOptions}
                placeholder="All Salesmen"
                rounded="lg"
                className="h-10"
              />
            </div>

            {/* Filter Menu Button */}
            <div className="relative w-full sm:w-auto sm:flex-shrink-0 h-10">
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
                  <div className="absolute z-30 mt-2 right-0 w-72 bg-white dark:bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-lg border border-sky-100 dark:border-sky-800 py-3 px-4 text-sm animate-fadeIn transition-all duration-200 transform origin-top-right">
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-2 border-b pb-1.5 border-default-100 dark:border-gray-700">
                      {activeFilterCount > 0 ? "Applied Filters" : "Filters"}
                    </h3>
                    {activeFilterCount === 0 ? (
                      <div className="text-default-500 dark:text-gray-400 py-2 px-1">
                        No filters applied.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {filters.salespersonId &&
                          filters.salespersonId.length > 0 && (
                            <li className="text-default-700 dark:text-gray-200 flex items-center p-1 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-md transition-colors">
                              <div className="bg-sky-100 dark:bg-sky-900/50 p-1 rounded-md mr-2 flex-shrink-0">
                                <IconUser size={14} className="text-sky-600 dark:text-sky-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-default-500 dark:text-gray-400 text-xs">
                                  Salesman
                                </span>
                                <div className="font-medium break-words">
                                  {filters.salespersonId.join(", ")}
                                </div>
                              </div>
                            </li>
                          )}

                        {filters.customerId && (
                          <li className="text-default-700 dark:text-gray-200 flex items-center p-1 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-md transition-colors">
                            <div className="bg-sky-100 dark:bg-sky-900/50 p-1 rounded-md mr-2 flex-shrink-0">
                              <IconUser size={14} className="text-sky-600 dark:text-sky-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-default-500 dark:text-gray-400 text-xs">
                                Customer
                              </span>
                              <div className="font-medium break-words">
                                {customerNames[filters.customerId] ||
                                  filters.customerId}
                              </div>
                            </div>
                          </li>
                        )}

                        {filters.paymentType && (
                          <li className="text-default-700 dark:text-gray-200 flex items-center p-1 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-md transition-colors">
                            <div className="bg-sky-100 dark:bg-sky-900/50 p-1 rounded-md mr-2">
                              <IconCash size={14} className="text-sky-600 dark:text-sky-400" />
                            </div>
                            <div>
                              <span className="text-default-500 dark:text-gray-400 text-xs">
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
                            filters.invoiceStatus.length === 4 &&
                            filters.invoiceStatus.includes("paid") &&
                            filters.invoiceStatus.includes("Unpaid") &&
                            filters.invoiceStatus.includes("Overdue") &&
                            filters.invoiceStatus.includes("cancelled")
                          ) && (
                            <li className="text-default-700 dark:text-gray-200 flex items-center p-1 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-md transition-colors">
                              <div className="bg-sky-100 dark:bg-sky-900/50 p-1 rounded-md mr-2">
                                <IconCircleCheck
                                  size={14}
                                  className="text-sky-600 dark:text-sky-400"
                                />
                              </div>
                              <div>
                                <span className="text-default-500 dark:text-gray-400 text-xs">
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
                            <li className="text-default-700 dark:text-gray-200 flex items-center p-1 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-md transition-colors">
                              <div className="bg-sky-100 dark:bg-sky-900/50 p-1 rounded-md mr-2">
                                <IconFileInvoice
                                  size={14}
                                  className="text-sky-600 dark:text-sky-400"
                                />
                              </div>
                              <div>
                                <span className="text-default-500 dark:text-gray-400 text-xs">
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
                          <li className="text-default-700 dark:text-gray-200 flex items-center p-1 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-md transition-colors">
                            <div className="bg-sky-100 dark:bg-sky-900/50 p-1 rounded-md mr-2">
                              <IconFiles size={14} className="text-sky-600 dark:text-sky-400" />
                            </div>
                            <div>
                              <span className="text-default-500 dark:text-gray-400 text-xs">
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
              ? "bg-sky-50/95 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700"
              : "bg-white/95 dark:bg-gray-800/95 border border-default-200 dark:border-gray-700"
          } rounded-lg flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap sticky top-2 z-20 shadow backdrop-blur-sm`}
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
                className="p-1 rounded-full transition-colors duration-200 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-500"
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
                  <IconSquareMinusFilled className="text-sky-600 dark:text-sky-400" size={20} />
                ) : (
                  <IconSelectAll className="text-default-400" size={20} />
                )}
              </button>
            </div>

            {/* Selection Count and Total */}
            <div className="flex-grow pb-0.5">
              {/* Selection info text */}
              {selectedInvoiceIds.size > 0 ? (
                <span className="font-medium text-sky-800 dark:text-sky-300 text-sm flex items-center flex-wrap gap-x-2">
                  <span>{selectedInvoiceIds.size} selected</span>
                  <span className="hidden sm:inline mx-1 border-r border-sky-300 dark:border-sky-600 h-4"></span>
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
                  className="text-default-500 dark:text-gray-400 text-sm cursor-pointer"
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
                  disabled={isLoading || isExporting}
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
                    disabled={isLoading || isExporting}
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
                  disabled={isLoading || isExporting}
                  aria-label="Submit Selected for E-Invoice"
                  title="Submit e-Invoice"
                >
                  Submit e-Invoice
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBulkExport();
                  }}
                  icon={IconFileExport}
                  disabled={isLoading || isExporting}
                  aria-label="Export Selected Invoices"
                  title="Export"
                >
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBulkDownload();
                  }}
                  icon={IconFileDownload}
                  disabled={isLoading || isExporting}
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
                  disabled={isLoading || isExporting}
                  aria-label="Print Selected Invoices"
                  title="Print PDF"
                >
                  Print
                </Button>
              </>
            )}

            <InvoiceDailyPrintMenu filters={filters} size="sm" />
            <Button
              onClick={() => setShowConsolidatedModal(true)}
              icon={IconFiles}
              variant="outline"
              color="amber"
              disabled={isLoading || isExporting}
              size="sm"
              title="Consolidated Invoice"
              aria-label="Consolidated Invoice"
            >
              Consolidated
            </Button>
            <Button
              onClick={handleRefresh}
              icon={IconRefresh}
              variant="outline"
              disabled={isLoading || isExporting}
              size="sm"
              title="Refresh Invoices"
              aria-label="Refresh Invoices"
            >
              Refresh
            </Button>
            <Button
              onClick={handleCreateNewInvoice}
              icon={IconPlus}
              variant="filled"
              color="sky"
              size="sm"
              title="Create New Invoice"
              aria-label="Create New Invoice"
            >
              Create New
            </Button>
          </div>
        </div>
        {/* --- Invoice Grid Area --- */}
        <div className="flex-1 min-h-[400px] relative">
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm flex justify-center items-center z-20 rounded-lg">
              <LoadingSpinner />
            </div>
          )}
          {/* Error Message */}
          {error && !isLoading && (
            <div className="p-4 text-center text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 rounded-lg border border-rose-200 dark:border-rose-800">
              Error fetching invoices: {error}
            </div>
          )}
          {/* No Results Message */}
          {!isLoading && !error && invoices.length === 0 && (
            <div className="p-6 text-center text-default-500 dark:text-gray-400 bg-default-50 dark:bg-gray-900/50 rounded-lg border border-dashed border-default-200 dark:border-gray-700">
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
        <div className="flex-shrink-0 mt-auto">
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
        month={selectedMonth.getMonth()}
        year={selectedMonth.getFullYear()}
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

      {/* Solo PDF Download Handler - Hidden but functional */}
      {isGeneratingSoloPDF && selectedInvoicesForPDF.length > 0 && (
        <div style={{ display: "none" }}>
          <InvoiceSoloPDFHandler
            invoices={selectedInvoicesForPDF}
            disabled={false}
            customerNames={customerNames}
            onComplete={() => {
              setIsGeneratingSoloPDF(false);
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

      {/* Solo Print Overlay */}
      {showSoloPrintOverlay && selectedInvoicesForPDF.length > 0 && (
        <InvoiceSoloPrintOverlay
          invoices={selectedInvoicesForPDF}
          customerNames={customerNames}
          onComplete={() => {
            setShowSoloPrintOverlay(false);
            setSelectedInvoicesForPDF([]);
          }}
        />
      )}
    </div>
  );
};

export default InvoiceListPage;

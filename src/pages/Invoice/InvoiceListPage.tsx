// src/pages/Invoice/InvoiceListPage.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ExtendedInvoiceData,
  InvoiceFilters,
  InvoiceStatus,
  EInvoiceStatus,
} from "../../types/types"; // Adjust path
import Button from "../../components/Button"; // Adjust path
import LoadingSpinner from "../../components/LoadingSpinner"; // Adjust path
import DateRangePicker from "../../components/DateRangePicker"; // Adjust path
import InvoiceFilterMenu from "../../components/Invoice/InvoiceFilterMenu"; // Adjust path
// import FilterSummary from "../../components/Invoice/FilterSummary"; // Keep if using
import InvoiceGrid from "../../components/Invoice/InvoiceGrid"; // Adjust path
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache"; // Adjust path
import ConfirmationDialog from "../../components/ConfirmationDialog"; // Adjust path
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api"; // Adjust path

import {
  IconPlus,
  IconRefresh,
  IconSearch,
  IconChevronDown,
  IconCheck,
  IconSquare,
  IconSquareMinusFilled,
  IconSend,
  IconFileDownload,
  IconPrinter,
  IconBan,
  IconSelectAll,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { useCustomerNames } from "../../hooks/useCustomerNames"; // Adjust path
import PaginationControls from "../../components/Invoice/PaginationControls"; // Adjust path
// Import the specific utilities needed
import { getInvoices, cancelInvoice } from "../../utils/invoice/InvoiceUtils"; // Adjust path

// --- Constants ---
const STORAGE_KEY = "invoiceListFilters_v2"; // Use a unique key
const ITEMS_PER_PAGE = 15; // Number of items per page

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
      const { start, end } = JSON.parse(savedFilters);
      return {
        start: start ? new Date(start) : thirtyDaysAgo,
        end: end ? new Date(end) : today,
      };
    } catch {
      /* Ignore parsing error, use defaults */
    }
  }
  return { start: thirtyDaysAgo, end: today };
};

const saveDatesToStorage = (startDate: Date, endDate: Date) => {
  try {
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

  // Filters State
  const initialFilters = useMemo(
    () => ({
      dateRange: getInitialDates(),
      salespersonId: null,
      applySalespersonFilter: false, // Default to false unless you want it always on
      customerId: null,
      applyCustomerFilter: false,
      paymentType: null,
      applyPaymentTypeFilter: false,
      invoiceStatus: [], // Empty array for multi-select
      applyInvoiceStatusFilter: false,
      eInvoiceStatus: [], // Empty array for multi-select
      applyEInvoiceStatusFilter: false,
    }),
    []
  ); // Calculate initial filters once
  const [filters, setFilters] = useState<InvoiceFilters>(initialFilters);

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
  const { salesmen, isLoading: salesmenLoading } = useSalesmanCache();
  const customerIds = useMemo(
    () => invoices.map((inv) => inv.customerid),
    [invoices]
  );
  const { customerNames /*, isLoading: namesLoading */ } =
    useCustomerNames(customerIds);

  // Ref for external clearing (optional)
  const clearSelectionRef = useRef<(() => void) | null>(null);

  // --- Derived State ---
  // Selection state based on currently displayed invoices on the page
  const selectionState = useMemo(() => {
    if (invoices.length === 0)
      return { isAllSelectedOnPage: false, isIndeterminate: false };
    const currentPageIds = new Set(invoices.map((inv) => inv.id));
    const selectedOnPageCount = Array.from(selectedInvoiceIds).filter((id) =>
      currentPageIds.has(id)
    ).length;
    const totalSelectableOnPage = invoices.length;

    return {
      isAllSelectedOnPage: selectedOnPageCount === totalSelectableOnPage,
      isIndeterminate:
        selectedOnPageCount > 0 && selectedOnPageCount < totalSelectableOnPage,
    };
  }, [selectedInvoiceIds, invoices]);

  // --- Callbacks ---

  // Fetch Invoices using the utility
  const fetchInvoices = useCallback(
    async (pageToFetch: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getInvoices(
          filters,
          pageToFetch,
          ITEMS_PER_PAGE,
          searchTerm
        );
        setInvoices(response.data);
        setTotalItems(response.total);
        setTotalPages(response.totalPages);
        setCurrentPage(pageToFetch); // Ensure page state matches fetched page
        // Clear selection when data reloads? Optional.
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
    [filters, searchTerm]
  ); // Dependencies

  // Effect to trigger fetch when needed
  useEffect(() => {
    if (isFetchTriggered) {
      fetchInvoices(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetchTriggered, currentPage]); // fetchInvoices is stable due to useCallback

  // Filter Change Handler
  const handleFilterChange = useCallback(
    (newFilters: Partial<InvoiceFilters>) => {
      setFilters((prev) => {
        const updated = { ...prev, ...newFilters };
        // Special handling for date range saving
        if (
          newFilters.dateRange &&
          newFilters.dateRange.start &&
          newFilters.dateRange.end
        ) {
          saveDatesToStorage(
            newFilters.dateRange.start,
            newFilters.dateRange.end
          );
          updated.dateRange = newFilters.dateRange; // Ensure it's updated
        }
        return updated;
      });
      if (currentPage !== 1) setCurrentPage(1); // Reset to page 1
      else setIsFetchTriggered(true); // If already on page 1, trigger directly
      // Clear selection on filter change
      setSelectedInvoiceIds(new Set());
    },
    [currentPage]
  ); // Dependency on currentPage to decide reset vs trigger

  // Month Change Handler
  const handleMonthChange = useCallback(
    (month: MonthOption) => {
      setSelectedMonth(month);
      const year = new Date().getFullYear(); // Use current year, or add year selector
      // Calculate start/end dates for the selected month
      const startDate = new Date(year, month.id, 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(year, month.id + 1, 0); // Day 0 of next month = last day of current
      endDate.setHours(23, 59, 59, 999);

      handleFilterChange({ dateRange: { start: startDate, end: endDate } });
    },
    [handleFilterChange]
  );

  // Search Handler (triggers fetch immediately)
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    if (currentPage !== 1) setCurrentPage(1);
    else setIsFetchTriggered(true);
    setSelectedInvoiceIds(new Set()); // Clear selection on search
  };

  // Select/Deselect a single invoice
  const handleSelectInvoice = useCallback((invoiceId: string) => {
    setSelectedInvoiceIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(invoiceId)) newSet.delete(invoiceId);
      else newSet.add(invoiceId);
      return newSet;
    });
  }, []);

  // Select/Deselect all invoices visible on the current page
  const handleSelectAllOnPage = useCallback(() => {
    const currentPageIds = invoices.map((inv) => inv.id);
    setSelectedInvoiceIds((prev) => {
      const newSet = new Set(prev);
      // Check if ALL on the current page are already selected within the main set
      const allCurrentlySelected =
        currentPageIds.length > 0 &&
        currentPageIds.every((id) => newSet.has(id));

      if (allCurrentlySelected) {
        // Deselect all on current page
        currentPageIds.forEach((id) => newSet.delete(id));
      } else {
        // Select all on current page
        currentPageIds.forEach((id) => newSet.add(id));
      }
      return newSet;
    });
  }, [invoices]); // Depends on the invoices currently displayed

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
      // Prevent multiple triggers
      setIsFetchTriggered(true);
    }
  };

  // Initiate Bulk Cancel
  const handleBulkCancel = () => {
    if (selectedInvoiceIds.size === 0) return;
    // Optional: Filter out already cancelled ones?
    const cancellableCount = invoices.filter(
      (inv) =>
        selectedInvoiceIds.has(inv.id) && inv.invoice_status !== "cancelled"
    ).length;
    if (cancellableCount === 0) {
      toast.error("No selected invoices are eligible for cancellation.");
      return;
    }
    setShowCancelConfirm(true);
  };

  // Confirm Bulk Cancel Action
  const confirmBulkCancel = async () => {
    setShowCancelConfirm(false);
    const idsToCancel = invoices
      .filter(
        (inv) =>
          selectedInvoiceIds.has(inv.id) && inv.invoice_status !== "cancelled"
      )
      .map((inv) => inv.id);

    if (idsToCancel.length === 0) return;

    const toastId = toast.loading(
      `Cancelling ${idsToCancel.length} invoice(s)...`
    );
    let successCount = 0;
    let failCount = 0;

    const results = await Promise.allSettled(
      idsToCancel.map((id) => cancelInvoice(id))
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successCount++;
        // Update local state for the cancelled invoice
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === idsToCancel[index] ? result.value : inv
          )
        );
      } else {
        failCount++;
        console.error(
          `Failed to cancel invoice ${idsToCancel[index]}:`,
          result.reason
        );
        // Error toast is handled in utility, maybe add specific ID here?
        // toast.error(`Failed cancellation for ${idsToCancel[index]}`);
      }
    });

    setSelectedInvoiceIds(new Set()); // Clear selection

    if (failCount > 0) {
      toast.error(
        `${failCount} invoice(s) failed to cancel. ${successCount} succeeded.`,
        { id: toastId, duration: 5000 }
      );
    } else {
      toast.success(`${successCount} invoice(s) cancelled.`, { id: toastId });
    }
    // No full refresh needed as local state is updated.
  };

  // Initiate Bulk E-Invoice Submission
  const handleBulkSubmitEInvoice = () => {
    if (selectedInvoiceIds.size === 0) return;

    const eligibleInvoices = invoices.filter(
      (inv) =>
        selectedInvoiceIds.has(inv.id) &&
        inv.invoice_status === "active" && // Must be active
        !inv.uuid && // Not previously submitted
        inv.paymenttype !== "CASH" // Cannot submit CASH invoices (assumption)
      // Add customer TIN/ID check if possible? Requires customer data here.
    );

    if (eligibleInvoices.length === 0) {
      toast.error(
        "No selected invoices are eligible for e-invoice submission (must be Active, non-Cash, not already submitted).",
        { duration: 5000 }
      );
      return;
    }
    if (eligibleInvoices.length < selectedInvoiceIds.size) {
      toast.error(
        `Only ${eligibleInvoices.length} of the selected invoices are eligible for submission. Proceeding with eligible ones.`,
        { duration: 5000 }
      );
      // Optionally update selection visually, though the confirm function filters again
      // setSelectedInvoiceIds(new Set(eligibleInvoices.map(inv => inv.id)));
    }

    setShowEInvoiceConfirm(true);
  };

  // Confirm Bulk E-Invoice Action
  const confirmBulkSubmitEInvoice = async () => {
    setShowEInvoiceConfirm(false);
    // Filter again *right before* sending
    const idsToSubmit = invoices
      .filter(
        (inv) =>
          selectedInvoiceIds.has(inv.id) &&
          inv.invoice_status === "active" &&
          !inv.uuid &&
          inv.paymenttype !== "CASH"
      )
      .map((inv) => inv.id);

    if (idsToSubmit.length === 0) {
      toast.error("No eligible invoices to submit.");
      return;
    }

    const toastId = toast.loading(
      `Submitting ${idsToSubmit.length} invoice(s) for e-invoicing...`
    );

    try {
      // Call backend endpoint that handles fetching data & submitting to MyInvois
      const response = await api.post("/api/einvoice/submit-system", {
        invoiceIds: idsToSubmit,
      });

      // --- Process Backend Response ---
      const message = response.message || "E-invoice submission processed.";
      const overallStatus = response.overallStatus || "Unknown";

      // Assuming response structure from previous examples (minimal or full)
      const acceptedCount =
        response.invoices?.filter(
          (inv: any) => inv.einvoiceStatus === 0 || inv.einvoiceStatus === 10
        ).length ??
        response.acceptedDocuments?.length ??
        0;
      const rejectedCount =
        response.invoices?.filter((inv: any) => inv.einvoiceStatus === 100)
          .length ??
        response.rejectedDocuments?.length ??
        0;
      const systemErrorCount =
        response.invoices?.filter((inv: any) => inv.einvoiceStatus === 110)
          .length ?? 0; // Example code

      if (
        overallStatus === "Invalid" ||
        overallStatus === "EInvoiceInvalid" ||
        overallStatus === "Rejected"
      ) {
        toast.error(`${message} Rejections: ${rejectedCount}.`, {
          id: toastId,
          duration: 6000,
        });
        // Log detailed errors if available
        if (response.rejectedDocuments || response.invoices) {
          console.error(
            "E-invoice Rejections:",
            response.rejectedDocuments ||
              response.invoices?.filter((inv: any) => inv.error)
          );
          (
            response.rejectedDocuments ||
            response.invoices?.filter((inv: any) => inv.error)
          ).forEach((rej: any) => {
            const invId = rej.internalId || rej.id || "N/A";
            const errMsg = rej.error?.message || "Rejected/Error";
            toast.error(`Inv ${invId}: ${errMsg}`, { duration: 4000 });
          });
        }
      } else if (
        overallStatus === "Partial" ||
        overallStatus === "EInvoiceSystemError" ||
        systemErrorCount > 0
      ) {
        toast.error(
          `${message} Accepted: ${acceptedCount}, Rejected/Errors: ${
            rejectedCount + systemErrorCount
          }.`,
          { id: toastId, duration: 6000 }
        );
        // Log/toast detailed errors
        if (response.rejectedDocuments || response.invoices) {
          console.error(
            "E-invoice Rejections/Errors:",
            response.rejectedDocuments ||
              response.invoices?.filter((inv: any) => inv.error)
          );
          (
            response.rejectedDocuments ||
            response.invoices?.filter((inv: any) => inv.error)
          ).forEach((rej: any) => {
            const invId = rej.internalId || rej.id || "N/A";
            const errMsg = rej.error?.message || "Rejected/Error";
            toast.error(`Inv ${invId}: ${errMsg}`, { duration: 4000 });
          });
        }
      } else {
        // Success or Valid
        toast.success(`${message} Processed: ${acceptedCount}.`, {
          id: toastId,
        });
      }

      setSelectedInvoiceIds(new Set()); // Clear selection
      setIsFetchTriggered(true); // Refresh list data
    } catch (error: any) {
      console.error("Error calling bulk e-invoice submission endpoint:", error);
      toast.error(
        `Submission failed: ${
          error.response?.data?.message || error.message || "Unknown error"
        }`,
        { id: toastId }
      );
    }
  };

  // Other placeholder actions
  const handleBulkDownload = () =>
    toast.error("Bulk Download PDF (Not Implemented)");
  const handleBulkPrint = () => toast.error("Bulk Print PDF (Not Implemented)");

  // --- Render ---
  return (
    <div className="flex flex-col p-4 md:p-6 space-y-4">
      {/* --- Header --- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <h1 className="text-2xl md:text-3xl font-semibold text-default-900">
          Invoices {totalItems > 0 && !isLoading && `(${totalItems})`}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleRefresh}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            onClick={handleCreateNewInvoice}
            icon={IconPlus}
            variant="filled"
            color="sky"
          >
            Create New
          </Button>
        </div>
      </div>

      {/* --- Filters --- */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center flex-wrap">
        <div className="flex-grow lg:flex-grow-0">
          <DateRangePicker
            dateRange={{
              start: filters.dateRange.start || new Date(),
              end: filters.dateRange.end || new Date(),
            }}
            onDateChange={(range) => handleFilterChange({ dateRange: range })}
          />
        </div>
        {/* Month Selector */}
        <div className="w-full sm:w-40">
          <Listbox value={selectedMonth} onChange={handleMonthChange}>
            <div className="relative">
              <ListboxButton className="w-full h-full rounded-full border border-default-300 bg-white py-[9px] pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
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
                    value={month}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-4 pr-4 ${
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
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
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
        {/* Search */}
        <div className="flex-grow relative">
          <IconSearch
            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-default-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Search Invoice # or Customer..."
            className="w-full pl-11 pr-4 py-2 bg-white border border-default-300 rounded-full focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-sm"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        <div className="flex-shrink-0">
          <InvoiceFilterMenu
            currentFilters={filters}
            onFilterChange={handleFilterChange}
            salesmanOptions={salesmen.map((s) => s.name || s.id)}
            customerOptions={[]} // Populate if filter menu needs customers
            today={new Date()} // Current date
            tomorrow={new Date(new Date().setDate(new Date().getDate() + 1))} // Tomorrow's date
          />
        </div>
      </div>
      {/* <FilterSummary filters={filters} /> */}

      {/* --- Batch Action Bar --- */}
      {selectedInvoiceIds.size > 0 && (
        <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 flex items-center gap-x-4 gap-y-2 flex-wrap sticky top-0 z-0 shadow-sm">
          {" "}
          {/* Sticky bar */}
          <button
            onClick={handleSelectAllOnPage}
            className="p-1 mr-1 rounded-full transition-colors duration-200 hover:bg-default-100 active:bg-default-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-500"
            title={
              selectionState.isAllSelectedOnPage
                ? "Deselect All on Page"
                : "Select All on Page"
            }
          >
            {selectionState.isAllSelectedOnPage ? (
              <IconSquareMinusFilled className="text-sky-600" size={20} />
            ) : selectionState.isIndeterminate ? (
              <IconSelectAll className="text-sky-600" size={20} />
            ) : (
              <IconSquare className="text-default-400" size={20} />
            )}
          </button>
          <span className="font-medium text-sky-800 text-sm">
            {selectedInvoiceIds.size} selected
          </span>
          <div className="flex gap-2 flex-wrap ml-auto">
            {" "}
            {/* Push actions to right */}
            <Button
              size="sm"
              variant="outline"
              color="rose"
              onClick={handleBulkCancel}
              icon={IconBan}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="amber"
              onClick={handleBulkSubmitEInvoice}
              icon={IconSend}
              disabled={isLoading}
            >
              Submit e-Invoice
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDownload}
              icon={IconFileDownload}
              disabled={isLoading}
            >
              Download
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkPrint}
              icon={IconPrinter}
              disabled={isLoading}
            >
              Print
            </Button>
          </div>
        </div>
      )}

      {/* --- Invoice Grid --- */}
      <div className="flex-1 min-h-[400px] relative">
        {" "}
        {/* Relative for potential overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 flex justify-center items-center z-20">
            {" "}
            {/* Loading overlay */}
            <LoadingSpinner />
          </div>
        )}
        {error && !isLoading && (
          <div className="p-4 text-center text-rose-600 bg-rose-50 rounded-lg">
            Error: {error}
          </div>
        )}
        {!isLoading && !error && (
          <InvoiceGrid
            invoices={invoices}
            selectedInvoiceIds={selectedInvoiceIds}
            onSelectInvoice={handleSelectInvoice}
            onViewDetails={handleViewDetails}
            isLoading={false}
            error={null}
            customerNames={customerNames} // Pass names down
          />
        )}
      </div>

      {/* --- Pagination --- */}
      {!isLoading && totalItems > 0 && totalPages > 1 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page) => {
            if (page !== currentPage) {
              // Only trigger if page actually changes
              setCurrentPage(page);
              setIsFetchTriggered(true);
            }
          }}
          itemsCount={invoices.length}
          totalItems={totalItems}
          pageSize={ITEMS_PER_PAGE}
        />
      )}

      {/* --- Confirmation Dialogs --- */}
      <ConfirmationDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={confirmBulkCancel}
        title={`Cancel ${selectedInvoiceIds.size} Invoice(s)`}
        message={`Cancel the ${selectedInvoiceIds.size} selected eligible invoice(s)? This may also attempt to cancel submitted e-invoices.`}
        confirmButtonText="Confirm Cancellation"
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showEInvoiceConfirm}
        onClose={() => setShowEInvoiceConfirm(false)}
        onConfirm={confirmBulkSubmitEInvoice}
        title={`Submit E-Invoice(s)`}
        message={`Proceed to submit ${selectedInvoiceIds.size} eligible invoice(s) for e-invoicing?`}
        confirmButtonText="Submit Now"
      />
    </div>
  );
};

export default InvoiceListPage;

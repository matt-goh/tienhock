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
} from "../../types/types"; // Use updated types
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import DateRangePicker from "../../components/DateRangePicker"; // Import
import InvoiceFilterMenu from "../../components/Invoice/InvoiceFilterMenu"; // Import (needs updates later)
import FilterSummary from "../../components/Invoice/FilterSummary"; // Import (needs updates later)
import InvoiceGrid from "../../components/Invoice/InvoiceGrid"; // Import
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache"; // For filter options
import ConfirmationDialog from "../../components/ConfirmationDialog"; // For bulk actions
import toast from "react-hot-toast";

import {
  IconPlus,
  IconRefresh,
  IconSearch,
  IconChevronDown,
  IconCheck,
  IconSquare,
  IconSquareCheckFilled,
  IconSquareMinusFilled, // Import selection icons
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { useCustomerNames } from "../../hooks/useCustomerNames";
import PaginationControls from "../../components/Invoice/PaginationControls";

// --- Constants ---
const STORAGE_KEY = "invoisDateFilters";
const ITEMS_PER_PAGE = 10; // Target items per page

interface MonthOption {
  id: number;
  name: string;
}

// --- Helper Functions ---
const getInitialDates = () => {
  const savedFilters = localStorage.getItem(STORAGE_KEY);
  if (savedFilters) {
    const { start, end } = JSON.parse(savedFilters);
    return {
      start: start
        ? new Date(start)
        : new Date(new Date().setDate(new Date().getDate() - 30)), // Default to last 30 days
      end: end ? new Date(end) : new Date(),
    };
  }
  return {
    start: new Date(new Date().setDate(new Date().getDate() - 30)),
    end: new Date(),
  };
};

const saveDatesToStorage = (startDate: Date | null, endDate: Date | null) => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
    })
  );
};

const InvoiceListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- State ---
  const [allInvoices, setAllInvoices] = useState<ExtendedInvoiceData[]>([]); // Holds all data for current filters/date range
  const [paginatedInvoices, setPaginatedInvoices] = useState<
    ExtendedInvoiceData[]
  >([]); // Data for the current page
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(
    new Set()
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0); // Total items matching filters
  const [searchTerm, setSearchTerm] = useState("");
  const [isFetchTriggered, setIsFetchTriggered] = useState(true); // Trigger initial fetch

  // Filters State
  const [filters, setFilters] = useState<InvoiceFilters>({
    dateRange: getInitialDates(),
    salespersonId: null,
    applySalespersonFilter: true,
    customerId: null,
    applyCustomerFilter: true,
    paymentType: null,
    applyPaymentTypeFilter: true,
    // --- Add New Filters ---
    invoiceStatus: [], // Array for multi-select
    applyInvoiceStatusFilter: false, // Default to not applying
    eInvoiceStatus: [], // Array for multi-select
    applyEInvoiceStatusFilter: false, // Default to not applying
  });

  // Month Selector State
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const monthOptions: MonthOption[] = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    name: new Date(0, i).toLocaleString("en", { month: "long" }),
  }));
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[currentMonth]
  );

  // Data Hooks
  const { salesmen, isLoading: salesmenLoading } = useSalesmanCache(); // For filter options
  const customerIds = allInvoices.map((inv) => inv.customerid);
  const { customerNames, isLoading: namesLoading } =
    useCustomerNames(customerIds); // Use custom hook

  const clearSelectionRef = useRef<(() => void) | null>(null); // Ref for clearing selection

  // --- Derived State ---
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const selectionState = useMemo(() => {
    const totalSelectable = allInvoices.length; // Select based on all filtered invoices
    const selectedCount = selectedInvoiceIds.size;
    return {
      isAllSelected: totalSelectable > 0 && selectedCount === totalSelectable,
      isIndeterminate: selectedCount > 0 && selectedCount < totalSelectable,
    };
  }, [selectedInvoiceIds, allInvoices]);

  // --- Callbacks ---

  // Fetching Data
  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      // Date Range
      if (filters.dateRange.start)
        params.append(
          "startDate",
          filters.dateRange.start.getTime().toString()
        );
      if (filters.dateRange.end)
        params.append("endDate", filters.dateRange.end.getTime().toString());
      // Existing Filters
      if (filters.applySalespersonFilter && filters.salespersonId?.length)
        params.append("salesman", filters.salespersonId.join(","));
      if (filters.applyCustomerFilter && filters.customerId?.length)
        params.append("customer", filters.customerId.join(","));
      if (filters.applyPaymentTypeFilter && filters.paymentType)
        params.append("paymentType", filters.paymentType); // Ensure backend expects 'Cash'/'Invoice'
      // New Filters
      if (filters.applyInvoiceStatusFilter && filters.invoiceStatus?.length)
        params.append("invoiceStatus", filters.invoiceStatus.join(","));
      if (filters.applyEInvoiceStatusFilter && filters.eInvoiceStatus?.length)
        params.append("eInvoiceStatus", filters.eInvoiceStatus.join(","));
      // Search Term (Backend needs to support this)
      if (searchTerm) params.append("search", searchTerm);
      // Pagination (if backend supports it)
      // params.append('page', currentPage.toString());
      // params.append('limit', ITEMS_PER_PAGE.toString());

      console.log("Fetching with params:", params.toString()); // Debugging

      // Replace with actual API call
      // const response = await api.get(`/api/invoices/v2?${params.toString()}`);
      // MOCK API CALL
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate delay
      let mockData = [...MOCK_INVOICES] // Use mock data from previous step
        .filter((inv) => {
          const invDate = new Date(parseInt(inv.createddate));
          const startOk =
            !filters.dateRange.start || invDate >= filters.dateRange.start;
          const endOk =
            !filters.dateRange.end || invDate <= filters.dateRange.end;
          // Add filter logic here based on state...
          return startOk && endOk;
        })
        .filter((inv) => {
          // Client-side search for now
          if (!searchTerm) return true;
          const term = searchTerm.toLowerCase();
          const customerName = customerNames[inv.customerid] || inv.customerid;
          return (
            inv.id.toLowerCase().includes(term) ||
            customerName.toLowerCase().includes(term)
          );
        });

      setAllInvoices(mockData);
      setTotalItems(mockData.length); // Set total count based on filtered mock data
    } catch (err: any) {
      console.error("Error fetching invoices:", err);
      setError(err.message || "Failed to fetch invoices. Please try again.");
      setAllInvoices([]);
      setTotalItems(0);
    } finally {
      setIsLoading(false);
      setIsFetchTriggered(false); // Mark fetch as done
    }
  }, [filters, currentPage, searchTerm, customerNames]); // Include dependencies

  // Trigger fetch when filters, page, or trigger state change
  useEffect(() => {
    if (isFetchTriggered) {
      fetchInvoices();
    }
  }, [fetchInvoices, isFetchTriggered]);

  // Apply pagination locally after fetching all filtered data
  useEffect(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    setPaginatedInvoices(allInvoices.slice(startIndex, endIndex));
  }, [allInvoices, currentPage]);

  // Filter Change Handler
  const handleFilterChange = useCallback(
    (newFilters: Partial<InvoiceFilters>) => {
      const updatedFilters = { ...filters, ...newFilters };
      // Special handling for date range
      if (newFilters.dateRange) {
        saveDatesToStorage(
          newFilters.dateRange.start,
          newFilters.dateRange.end
        );
        updatedFilters.dateRange = newFilters.dateRange;
      }
      setFilters(updatedFilters);
      setCurrentPage(1); // Reset page when filters change
      setSelectedInvoiceIds(new Set()); // Clear selection
      setIsFetchTriggered(true); // Trigger fetch
    },
    [filters]
  );

  // Month Change Handler
  const handleMonthChange = useCallback(
    (month: MonthOption) => {
      setSelectedMonth(month);
      const year = month.id > currentMonth ? currentYear - 1 : currentYear;
      const startDate = new Date(year, month.id, 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(year, month.id + 1, 0);
      endDate.setHours(23, 59, 59, 999);

      handleFilterChange({ dateRange: { start: startDate, end: endDate } });
    },
    [currentMonth, currentYear, handleFilterChange]
  );

  // Search Handler
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1); // Reset page on search
    // Fetch will be triggered by useEffect watching searchTerm if backend search is used
    // For client-side search, pagination effect will update the view
  };

  // Selection Handlers
  const handleSelectInvoice = useCallback((invoiceId: string) => {
    setSelectedInvoiceIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(invoiceId)) {
        newSet.delete(invoiceId);
      } else {
        newSet.add(invoiceId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectionState.isAllSelected || selectionState.isIndeterminate) {
      setSelectedInvoiceIds(new Set()); // Clear selection
    } else {
      setSelectedInvoiceIds(new Set(allInvoices.map((inv) => inv.id))); // Select all filtered
    }
  }, [selectionState, allInvoices]);

  // Clear selection function exposed via ref
  const clearCurrentSelection = useCallback(() => {
    setSelectedInvoiceIds(new Set());
  }, []);

  useEffect(() => {
    if (clearSelectionRef) {
      clearSelectionRef.current = clearCurrentSelection;
    }
  }, [clearCurrentSelection]);

  // Navigation
  const handleCreateNewInvoice = () => navigate("/sales/invoice/new");
  const handleViewDetails = (invoiceId: string) =>
    navigate(`/sales/invoice/${invoiceId}`, {
      state: { previousPath: location.pathname },
    });

  // Actions (Placeholders for now)
  const handleRefresh = () => setIsFetchTriggered(true);
  const handleBulkCancel = () => toast("Bulk Cancel (Not Implemented)");
  const handleBulkSubmitEInvoice = () =>
    toast("Bulk Submit e-Invoice (Not Implemented)");
  const handleBulkDownload = () => toast("Bulk Download PDF (Not Implemented)");
  const handleBulkPrint = () => toast("Bulk Print PDF (Not Implemented)");

  return (
    <div className="flex flex-col p-6 space-y-4">
      {/* --- Header --- */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-semibold text-default-900">
          Invoices {totalItems > 0 && `(${totalItems})`}
        </h1>
        <div className="flex items-center gap-3">
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
            variant="outline"
          >
            Create
          </Button>
        </div>
      </div>

      {/* --- Filters --- */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        {/* Date Range */}
        <div className="flex-grow sm:flex-grow-0">
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
                    value={month} /* ... options styling */
                  >
                    {({ selected } /* ... option content */) => (
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
            className="w-full pl-11 pr-4 py-2 bg-white border border-default-300 rounded-full focus:border-default-500"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        {/* Filter Menu */}
        <div className="flex-shrink-0">
          {/* TODO: Update InvoiceFilterMenu props and logic */}
          <InvoiceFilterMenu
            currentFilters={filters}
            onFilterChange={handleFilterChange}
            salesmanOptions={salesmen.map((s) => s.id)} // Pass only IDs
            customerOptions={[]} // Pass empty or fetched customer IDs if needed
            today={currentDate}
            tomorrow={new Date(currentDate.setDate(currentDate.getDate() + 1))}
          />
        </div>
      </div>
      {/* TODO: FilterSummary component - needs update */}
      {/* <FilterSummary filters={filters} /> */}

      {/* --- Batch Action Bar --- */}
      {selectedInvoiceIds.size > 0 && (
        <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSelectAll}
            className={`p-1 mr-2 rounded-full transition-opacity duration-200 hover:bg-default-100 active:bg-default-200`}
          >
            {selectionState.isAllSelected ? (
              <IconSquareCheckFilled className="text-blue-600" size={20} />
            ) : selectionState.isIndeterminate ? (
              <IconSquareMinusFilled className="text-blue-600" size={20} />
            ) : (
              <IconSquare className="text-default-400" size={20} />
            )}
          </button>
          <span className="font-medium text-sky-800">
            {selectedInvoiceIds.size} selected
          </span>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              color="rose"
              onClick={handleBulkCancel}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="amber"
              onClick={handleBulkSubmitEInvoice}
            >
              Submit e-Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkDownload}>
              Download
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkPrint}>
              Print
            </Button>
          </div>
        </div>
      )}

      {/* --- Invoice Grid --- */}
      <div className="flex-1 min-h-[400px]">
        {" "}
        {/* Added min-height */}
        {isLoading && !isFetchTriggered ? ( // Show spinner only during initial load or refresh
          <div className="flex justify-center items-center h-full">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="p-4 text-center text-rose-600 bg-rose-50 rounded-lg">
            Error loading invoices: {error}
          </div>
        ) : (
          <InvoiceGrid
            invoices={paginatedInvoices} // Pass paginated data
            selectedInvoiceIds={selectedInvoiceIds}
            onSelectInvoice={handleSelectInvoice}
            onViewDetails={handleViewDetails}
            isLoading={isLoading && isFetchTriggered} // Show loading within grid only if actively fetching
            error={null} // Error handled above grid
          />
        )}
      </div>

      {/* --- Pagination --- */}
      {!isLoading && totalPages > 1 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page) => setCurrentPage(page)}
          itemsCount={paginatedInvoices.length} // Items on current page
          totalItems={totalItems} // Total items matching filter
          pageSize={ITEMS_PER_PAGE}
        />
      )}

      {/* --- Confirmation Dialogs --- */}
      {/* TODO: Add ConfirmationDialog instances for bulk actions */}
    </div>
  );
};

// Example Mock Data (keep for testing)
const MOCK_INVOICES: ExtendedInvoiceData[] = Array.from(
  { length: 25 },
  (_, i) => ({
    id: `${1001 + i}`,
    salespersonid: `S0${(i % 3) + 1}`,
    customerid: `CUST00${(i % 5) + 1}`,
    customerName: `Customer ${String.fromCharCode(65 + (i % 5))}`,
    createddate: new Date(2023, 10, 15 - i, 10, 30).getTime().toString(),
    paymenttype: i % 4 === 0 ? "CASH" : "INVOICE",
    total_excluding_tax: 150.0 + i * 10,
    tax_amount: i % 4 !== 0 ? 15.0 + i : 0.0,
    rounding: i % 2 === 0 ? 0.05 : -0.03,
    totalamountpayable:
      150.0 +
      i * 10 +
      (i % 4 !== 0 ? 15.0 + i : 0.0) +
      (i % 2 === 0 ? 0.05 : -0.03),
    uuid: i % 3 === 0 ? `uuid-${123 + i}` : null,
    submission_uid: i % 3 === 0 ? `sub-abc${i}` : null,
    long_id: i % 3 === 0 && i % 2 === 0 ? `long-${123 + i}` : null,
    datetime_validated:
      i % 3 === 0 && i % 2 === 0
        ? new Date(2023, 10, 16 - i).toISOString()
        : null,
    is_consolidated: false,
    consolidated_invoices: null,
    invoice_status: i % 5 === 0 ? "paid" : i % 6 === 0 ? "cancelled" : "active",
    einvoice_status:
      i % 3 === 0
        ? i % 2 === 0
          ? "valid"
          : i % 5 === 0
          ? "cancelled"
          : "pending"
        : null,
    products: [],
  })
);

export default InvoiceListPage;

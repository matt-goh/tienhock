import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ColumnConfig,
  ExtendedInvoiceData,
  InvoiceData,
  InvoiceFilters,
} from "../../types/types";
import { deleteInvoice, getInvoices } from "../../utils/invoice/InvoisUtils";
import {
  IconEye,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconRefresh,
} from "@tabler/icons-react";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import InvoiceFilterMenu from "../../components/Invois/InvoiceFilterMenu";
import FilterSummary from "../../components/Invois/FilterSummary";
import TableEditing from "../../components/Table/TableEditing";
import Button from "../../components/Button";
import toast from "react-hot-toast";
import PrintPDFOverlay from "../../utils/invoice/PDF/PrintPDFOverlay";
import PDFDownloadHandler from "../../utils/invoice/PDF/PDFDownloadHandler";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";
import { api } from "../../routes/utils/api";

const STORAGE_KEY = "invoisDateFilters";

const InvoicePage: React.FC = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Function to get initial dates from localStorage
  const getInitialDates = () => {
    const savedFilters = localStorage.getItem(STORAGE_KEY);
    if (savedFilters) {
      const { start, end } = JSON.parse(savedFilters);
      return {
        start: start ? new Date(start) : today,
        end: end ? new Date(end) : tomorrow,
      };
    }
    return {
      start: today,
      end: tomorrow,
    };
  };

  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<
    ExtendedInvoiceData[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<InvoiceData[]>([]);
  const [filters, setFilters] = useState<InvoiceFilters>({
    dateRange: getInitialDates(),
    salespersonId: null,
    applySalespersonFilter: true,
    customerId: null,
    applyCustomerFilter: true,
    paymentType: null,
    applyPaymentTypeFilter: true,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isDateRangeFocused, setIsDateRangeFocused] = useState(false);
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {}
  );
  const clearSelectionRef = useRef<(() => void) | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleInvoicesUpdated = () => {
      setInvoices([...invoices]); // This will trigger a re-render
    };

    window.addEventListener("invoicesUpdated", handleInvoicesUpdated);

    return () => {
      window.removeEventListener("invoicesUpdated", handleInvoicesUpdated);
    };
  }, [invoices]);

  useEffect(() => {
    const loadInvoices = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Pass the filters directly - the date conversion happens inside getInvoices
        const fetchedInvoices = await getInvoices(filters);
        setInvoices(fetchedInvoices);
        setFilteredInvoices(fetchedInvoices);
      } catch (error) {
        console.error("Error loading invoices:", error);
        setError(
          error instanceof Error ? error.message : "An unknown error occurred"
        );
        toast.error(
          `Failed to load invoices: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadInvoices();
  }, []);

  useEffect(() => {
    const fetchCustomerNames = async () => {
      const uniqueCustomerIds = Array.from(
        new Set(invoices.map((invoice) => invoice.customerid))
      );

      const missingCustomerIds = uniqueCustomerIds.filter(
        (id) => !(id in customerNames)
      );

      if (missingCustomerIds.length === 0) return;

      try {
        // First check local cache
        const CACHE_KEY = "customers_cache";
        const cachedData = localStorage.getItem(CACHE_KEY);
        let customersFromCache: Record<string, string> = {};
        let idsToFetch: string[] = [...missingCustomerIds];

        if (cachedData) {
          const { data } = JSON.parse(cachedData);

          if (Array.isArray(data)) {
            // Create map from cached data
            customersFromCache = data.reduce((map, customer) => {
              if (missingCustomerIds.includes(customer.id)) {
                map[customer.id] = customer.name;
                // Remove from idsToFetch since we got it from cache
                idsToFetch = idsToFetch.filter((id) => id !== customer.id);
              }
              return map;
            }, {} as Record<string, string>);
          }
        }

        // If we still have IDs to fetch, make API call
        let customersFromApi: Record<string, string> = {};
        if (idsToFetch.length > 0) {
          customersFromApi = await api.post("/api/customers/names", {
            customerIds: idsToFetch,
          });
        }

        // Combine results from cache and API
        setCustomerNames((prev) => ({
          ...prev,
          ...customersFromCache,
          ...customersFromApi,
        }));
      } catch (error) {
        console.error("Error fetching customer names:", error);
        const fallbackNames = missingCustomerIds.reduce<Record<string, string>>(
          (map, id) => {
            map[id] = id;
            return map;
          },
          {}
        );
        setCustomerNames((prev) => ({
          ...prev,
          ...fallbackNames,
        }));
      }
    };

    fetchCustomerNames();
  }, [invoices]);

  const handleSelectionChange = useCallback(
    (count: number, allSelected: boolean, selectedRows: InvoiceData[]) => {
      setSelectedCount(count);
      setIsAllSelected(allSelected);
      setSelectedInvoices(selectedRows);
    },
    []
  );

  const handleBulkDelete = async () => {
    setShowDeleteConfirmation(false);

    try {
      const deletePromises = selectedInvoices.map((invoice) =>
        deleteInvoice(invoice.id)
      );
      await Promise.all(deletePromises);

      // Reset filters to initial state
      setFilters({
        dateRange: getInitialDates(),
        salespersonId: null,
        applySalespersonFilter: true,
        customerId: null,
        applyCustomerFilter: true,
        paymentType: null,
        applyPaymentTypeFilter: true,
      });

      setSearchTerm("");

      // Load fresh data
      const fetchedInvoices = await getInvoices({
        dateRange: getInitialDates(),
        salespersonId: null,
        applySalespersonFilter: true,
        customerId: null,
        applyCustomerFilter: true,
        paymentType: null,
        applyPaymentTypeFilter: true,
      });
      setInvoices(fetchedInvoices);

      toast.success("Selected invoices deleted successfully");
    } catch (error) {
      console.error("Error deleting invoices:", error);
      toast.error("Failed to delete invoices. Please try again.");
    }
  };

  // In InvoicePage.tsx
  const applyFilters = useCallback(() => {
    let filtered = [...invoices];

    // Search filter
    if (searchTerm) {
      const lowercasedSearch = searchTerm.toLowerCase();
      filtered = filtered.filter((invoice) =>
        Object.values(invoice).some((value) =>
          String(value).toLowerCase().includes(lowercasedSearch)
        )
      );
    }

    // Salesperson filter
    if (
      filters.applySalespersonFilter &&
      filters.salespersonId &&
      filters.salespersonId.length > 0
    ) {
      const salesmanSet = new Set(filters.salespersonId);
      filtered = filtered.filter((invoice) =>
        salesmanSet.has(invoice.salespersonid)
      );
    }

    // Customer filter
    if (
      filters.applyCustomerFilter &&
      filters.customerId &&
      filters.customerId.length > 0
    ) {
      const customerSet = new Set(filters.customerId);
      filtered = filtered.filter((invoice) =>
        customerSet.has(invoice.customerid)
      );
    }

    // Payment type filter
    if (filters.applyPaymentTypeFilter && filters.paymentType) {
      filtered = filtered.filter((invoice) => {
        const invoiceType = invoice.paymenttype === "CASH" ? "Cash" : "Invoice";
        return invoiceType === filters.paymentType;
      });
    }

    // Date filter
    if (filters.dateRange.start || filters.dateRange.end) {
      filtered = filtered.filter((invoice) => {
        let timestamp: number;
        if (typeof invoice.createddate === "string") {
          timestamp = parseInt(invoice.createddate);
        } else {
          timestamp = invoice.createddate;
        }

        const invoiceDate = new Date(timestamp);
        invoiceDate.setHours(0, 0, 0, 0);

        if (filters.dateRange.start) {
          const startDate = new Date(filters.dateRange.start);
          startDate.setHours(0, 0, 0, 0);
          if (invoiceDate < startDate) return false;
        }

        if (filters.dateRange.end) {
          const endDate = new Date(filters.dateRange.end);
          endDate.setHours(23, 59, 59, 999);
          if (invoiceDate > endDate) return false;
        }

        return true;
      });
    }

    // Map filtered invoices with customer names
    const filteredWithNames = filtered.map((invoice) => ({
      ...invoice,
      customerName: customerNames[invoice.customerid] || invoice.customerid,
    }));

    setFilteredInvoices(filteredWithNames);
  }, [invoices, filters, searchTerm, customerNames]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Function to save dates to localStorage
  const saveDatesToStorage = (startDate: Date | null, endDate: Date | null) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        start: startDate?.toISOString(),
        end: endDate?.toISOString(),
      })
    );
  };

  const handleFilterChange = (newFilters: InvoiceFilters) => {
    // Save dates to localStorage
    saveDatesToStorage(
      newFilters.dateRange?.start ?? null,
      newFilters.dateRange?.end ?? null
    );

    // Only reload data if date range changes
    if (
      newFilters.dateRange?.start?.getTime() !==
        filters.dateRange?.start?.getTime() ||
      newFilters.dateRange?.end?.getTime() !== filters.dateRange?.end?.getTime()
    ) {
      const loadInvoices = async () => {
        try {
          const fetchedInvoices = await getInvoices(newFilters);
          setInvoices(fetchedInvoices);
        } catch (error) {
          console.error("Error loading invoices:", error);
          toast.error("Failed to load invoices");
        }
      };
      loadInvoices();
    }

    setFilters(newFilters);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleCreateNewInvoice = () => {
    navigate("/sales/invoice/details", {
      state: {
        isNewInvoice: true,
        previousPath: location.pathname,
      },
    });
  };

  const handleInvoiceClick = (invoiceData: InvoiceData) => {
    navigate(`/sales/invoice/details`, {
      state: {
        invoiceData,
        isNewInvoice: false,
        previousPath: location.pathname,
      },
    });
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Pass the current filters to get the latest data
      const fetchedInvoices = await getInvoices(filters);
      setInvoices(fetchedInvoices);
      setFilteredInvoices(fetchedInvoices);
      toast.success("Invoices refreshed successfully");
    } catch (error) {
      console.error("Error refreshing invoices:", error);
      setError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      toast.error(
        `Failed to refresh invoices: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePDFClick = () => {
    // Determine which invoices to use for the PDF
    const invoicesToUse =
      selectedCount > 0 ? selectedInvoices : filteredInvoices;

    // Store the data in sessionStorage before opening the window
    sessionStorage.setItem("PDF_DATA", JSON.stringify(invoicesToUse));

    // Open the window and remove the data after it's opened
    const pdfWindow = window.open("/pdf-viewer", "_blank");
    if (pdfWindow) {
      // Clean up the storage after a delay to ensure the new window has time to read it
      setTimeout(() => {
        sessionStorage.removeItem("PDF_DATA");
      }, 1000);
    }
  };

  const handlePrintPDF = () => {
    setShowPrintOverlay(true);
  };

  const invoiceColumns: ColumnConfig[] = [
    {
      id: "id",
      header: "Invoice",
      type: "readonly",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: InvoiceData } }) => (
        <button
          onClick={() => handleInvoiceClick(info.row.original)}
          className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer group-hover:font-semibold"
        >
          {info.row.original.paymenttype === "CASH" ? "C" : "I"}
          {info.getValue()}
        </button>
      ),
    },
    {
      id: "createddate",
      header: "Date",
      type: "readonly",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: InvoiceData } }) => {
        const timestamp = info.getValue();
        const { date } = parseDatabaseTimestamp(timestamp);
        return (
          <button
            onClick={() => handleInvoiceClick(info.row.original)}
            className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer group-hover:font-semibold"
          >
            {formatDisplayDate(date)}
          </button>
        );
      },
    },
    {
      id: "salespersonid",
      header: "Salesman",
      type: "readonly",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: InvoiceData } }) => (
        <button
          onClick={() => handleInvoiceClick(info.row.original)}
          className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer group-hover:font-semibold"
        >
          {info.getValue()}
        </button>
      ),
    },
    {
      id: "customerid",
      header: "Customer",
      type: "readonly",
      width: 500,
      cell: (info: {
        getValue: () => any;
        row: { original: ExtendedInvoiceData };
      }) => (
        <button
          onClick={() => handleInvoiceClick(info.row.original)}
          className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer group-hover:font-semibold"
        >
          {info.row.original.customerName || info.getValue()}
        </button>
      ),
    },
    {
      id: "totalamountpayable",
      header: "Amount",
      type: "amount",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: InvoiceData } }) => (
        <button
          onClick={() => handleInvoiceClick(info.row.original)}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent cursor-pointer group-hover:font-semibold"
        >
          {Number(info.getValue() || 0).toFixed(2)}
        </button>
      ),
    },
  ];

  const salesmanOptions = useMemo(() => {
    return Array.from(
      new Set(invoices.map((invoice) => invoice.salespersonid))
    );
  }, [invoices]);

  const customerOptions = useMemo(() => {
    return Array.from(new Set(invoices.map((invoice) => invoice.customerid)));
  }, [invoices]);

  const formatDateForInput = (date: Date | null): string => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getDateRangeInfo = (start: Date, end: Date) => {
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    const rangeDuration = end.getTime() - start.getTime();
    return {
      isWithinMonth: rangeDuration <= oneMonthMs,
      isValidDirection: rangeDuration > 0,
      rangeDuration,
    };
  };

  const adjustDateRange = (
    newDate: Date,
    type: "start" | "end",
    currentRange: { start: Date | null; end: Date | null }
  ): { start: Date; end: Date } => {
    const oneMonthMs = 32 * 24 * 60 * 60 * 1000;

    if (!currentRange.start || !currentRange.end) {
      // If we don't have both dates, set the other date one month apart
      if (type === "start") {
        return {
          start: newDate,
          end: new Date(newDate.getTime() + oneMonthMs),
        };
      } else {
        return {
          start: new Date(newDate.getTime() - oneMonthMs),
          end: newDate,
        };
      }
    }

    // Check if the new range would exceed one month
    const rangeInfo = getDateRangeInfo(
      type === "start" ? newDate : currentRange.start,
      type === "end" ? newDate : currentRange.end
    );

    if (!rangeInfo.isValidDirection) {
      // If dates are in wrong order, adjust the other date to maintain order
      return type === "start"
        ? {
            start: newDate,
            end: new Date(newDate.getTime() + 24 * 60 * 60 * 1000),
          } // one day later
        : {
            start: new Date(newDate.getTime() - 24 * 60 * 60 * 1000),
            end: newDate,
          }; // one day earlier
    }

    if (!rangeInfo.isWithinMonth) {
      // If range exceeds one month, adjust the other date to maintain one month maximum
      return type === "start"
        ? { start: newDate, end: new Date(newDate.getTime() + oneMonthMs) }
        : { start: new Date(newDate.getTime() - oneMonthMs), end: newDate };
    }

    // If range is valid (within a month), return new date with existing other date
    return {
      start: type === "start" ? newDate : currentRange.start,
      end: type === "end" ? newDate : currentRange.end,
    };
  };

  const handleDateChange = (type: "start" | "end", value: string) => {
    if (!value) {
      const newDateRange = {
        ...filters.dateRange,
        [type]: null,
      };
      handleFilterChange({
        ...filters,
        dateRange: newDateRange,
      });
      return;
    }

    const [year, month, day] = value.split("-").map(Number);
    const newDate = new Date(year, month - 1, day);

    // Set time based on start or end
    if (type === "end") {
      newDate.setHours(23, 59, 59, 999); // End of the day
    } else {
      newDate.setHours(0, 0, 0, 0); // Start of the day
    }

    // Get adjusted date range
    const adjustedRange = adjustDateRange(newDate, type, filters.dateRange);

    handleFilterChange({
      ...filters,
      dateRange: adjustedRange,
    });
  };

  if (isLoading) {
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
    <div className="flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white px-6 pt-4">
        <div className="flex flex-col space-y-4">
          {/* Title and Actions Row */}
          <div className={`flex items-center justify-between pl-[45px]`}>
            <h1 className="text-3xl font-semibold text-default-900">
              Invoice {selectedCount > 0 && `(${selectedCount})`}
            </h1>
            <div className="flex items-center gap-3">
              {selectedCount > 0 && (
                <button
                  onClick={() => setShowDeleteConfirmation(true)}
                  className="inline-flex items-center px-4 py-2 text-rose-500 font-medium border-2 border-rose-400 hover:border-rose-500 active:border-rose-600 bg-white hover:bg-rose-500 active:bg-rose-600 hover:text-white active:text-rose-100 rounded-full transition-colors duration-200"
                >
                  Delete
                </button>
              )}
              <Button
                onClick={handlePDFClick}
                icon={IconEye}
                iconSize={16}
                iconStroke={2}
                variant="outline"
                disabled={selectedCount === 0}
              >
                View
              </Button>

              <PDFDownloadHandler
                invoices={
                  selectedCount > 0 ? selectedInvoices : filteredInvoices
                }
                disabled={selectedCount === 0}
              />

              <Button
                onClick={handlePrintPDF}
                icon={IconPrinter}
                iconSize={16}
                iconStroke={2}
                variant="outline"
                disabled={selectedCount === 0}
              >
                Print
              </Button>
              <Button
                onClick={handleRefresh}
                icon={IconRefresh}
                iconSize={16}
                iconStroke={2}
                variant="outline"
              >
                Refresh
              </Button>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleCreateNewInvoice}
                  icon={IconPlus}
                  iconSize={16}
                  iconStroke={2}
                  variant="outline"
                >
                  Create
                </Button>
              </div>
            </div>
          </div>

          {/* Filters Row */}
          <div className={`space-y-4 pl-[45px]`}>
            <div className="flex gap-4">
              {/* Date Range */}
              <div className="flex-1">
                <div
                  className={`flex items-center bg-white border ${
                    isDateRangeFocused
                      ? "border-default-500"
                      : "border-default-300"
                  } rounded-full px-4`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="date"
                      value={formatDateForInput(
                        filters.dateRange?.start ?? null
                      )}
                      onChange={(e) =>
                        handleDateChange("start", e.target.value)
                      }
                      onFocus={() => setIsDateRangeFocused(true)}
                      onBlur={() => setIsDateRangeFocused(false)}
                      className="flex-1 px-2 py-2 rounded-full bg-transparent outline-none"
                    />
                    <span className="text-default-400">to</span>
                    <input
                      type="date"
                      value={formatDateForInput(filters.dateRange?.end ?? null)}
                      onChange={(e) => handleDateChange("end", e.target.value)}
                      onFocus={() => setIsDateRangeFocused(true)}
                      onBlur={() => setIsDateRangeFocused(false)}
                      className="flex-1 px-2 py-2 rounded-full bg-transparent outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              <div className="w-[350px]">
                <div className="relative">
                  <IconSearch
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 text-default-400"
                    size={20}
                  />
                  <input
                    type="text"
                    placeholder="Search invoices..."
                    className="w-full pl-11 pr-4 py-2 bg-white border border-default-300 rounded-full focus:border-default-500"
                    value={searchTerm}
                    onChange={handleSearchChange}
                  />
                </div>
              </div>

              {/* Filter Menu */}
              <div className="flex justify-end">
                <InvoiceFilterMenu
                  onFilterChange={handleFilterChange}
                  currentFilters={filters}
                  salesmanOptions={salesmanOptions}
                  customerOptions={customerOptions}
                  today={today}
                  tomorrow={tomorrow}
                />
              </div>
            </div>

            {/* Filter Summary */}
            <FilterSummary filters={filters} />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-6 pt-1 pb-4">
        {/* Table Section */}
        <div className="bg-white overflow-hidden">
          {filteredInvoices.length > 0 ? (
            <TableEditing<InvoiceData>
              initialData={filteredInvoices}
              columns={invoiceColumns}
              onChange={setInvoices}
              onSelectionChange={handleSelectionChange}
              onClearSelection={(fn) => {
                clearSelectionRef.current = fn;
              }}
              tableKey="invois"
            />
          ) : (
            <div className="py-16">
              <p className="text-center text-default-500">No invoices found.</p>
            </div>
          )}
        </div>

        <ConfirmationDialog
          isOpen={showDeleteConfirmation}
          onClose={() => setShowDeleteConfirmation(false)}
          onConfirm={handleBulkDelete}
          title="Delete Confirmation"
          message={
            isAllSelected
              ? "Are you sure you want to delete all invoices? This action cannot be undone."
              : `Are you sure you want to delete ${selectedCount} selected invoice${
                  selectedCount === 1 ? "" : "s"
                }? This action cannot be undone.`
          }
          confirmButtonText="Delete"
        />
      </div>
      {showPrintOverlay && (
        <PrintPDFOverlay
          invoices={selectedCount > 0 ? selectedInvoices : filteredInvoices}
          onComplete={() => setShowPrintOverlay(false)}
        />
      )}
    </div>
  );
};

export default InvoicePage;

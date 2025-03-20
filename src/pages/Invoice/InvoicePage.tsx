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
import { deleteInvoice, getInvoices } from "../../utils/invoice/InvoiceUtils";
import {
  IconEye,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconRefresh,
} from "@tabler/icons-react";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import InvoiceFilterMenu from "../../components/Invoice/InvoiceFilterMenu";
import FilterSummary from "../../components/Invoice/FilterSummary";
import TableEditing from "../../components/Table/TableEditing";
import Button from "../../components/Button";
import toast from "react-hot-toast";
import PrintPDFOverlay from "../../utils/invoice/PDF/PrintPDFOverlay";
import PDFDownloadHandler from "../../utils/invoice/PDF/PDFDownloadHandler";
import LoadingSpinner from "../../components/LoadingSpinner";
import DateRangePicker from "../../components/DateRangePicker";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";
import { api } from "../../routes/utils/api";
import { useCompany } from "../../contexts/CompanyContext";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";

const STORAGE_KEY = "invoisDateFilters";

// Define month options type and array
interface MonthOption {
  id: number;
  name: string;
}

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

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Month options
  const monthOptions: MonthOption[] = [
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
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {}
  );
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[currentMonth]
  );
  const clearSelectionRef = useRef<(() => void) | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { getRoutePath, activeCompany } = useCompany();

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

  const handleMonthChange = (month: MonthOption) => {
    setSelectedMonth(month);

    // If selected month is ahead of current month, use previous year
    const year = month.id > currentMonth ? currentYear - 1 : currentYear;

    // Create start date (1st of the selected month)
    const startDate = new Date(year, month.id, 1);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (last day of the selected month)
    const endDate = new Date(year, month.id + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    // Update filters with the new date range
    handleFilterChange({
      ...filters,
      dateRange: {
        start: startDate,
        end: endDate,
      },
    });
  };

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
    // Build path with company prefix if needed
    const basePath = "/sales/invoice/details";
    const path = activeCompany.routePrefix
      ? `/${activeCompany.routePrefix}${basePath}`
      : basePath;

    navigate(path, {
      state: {
        isNewInvoice: true,
        previousPath: location.pathname,
      },
    });
  };
  
  const handleInvoiceClick = (invoiceData: InvoiceData) => {
    // Build path with company prefix if needed
    const basePath = "/sales/invoice/details";
    const path = activeCompany.routePrefix
      ? `/${activeCompany.routePrefix}${basePath}`
      : basePath;

    navigate(path, {
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
      width: 450,
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
      <div className="sticky top-0 z-20 bg-white px-6">
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
                customerNames={customerNames}
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
                <DateRangePicker
                  dateRange={{
                    start: filters.dateRange.start || today,
                    end: filters.dateRange.end || tomorrow,
                  }}
                  onDateChange={(newDateRange) =>
                    handleFilterChange({
                      ...filters,
                      dateRange: newDateRange,
                    })
                  }
                />
              </div>

              {/* Month Selection */}
              <div className="w-40">
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
              tableKey="invoice"
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

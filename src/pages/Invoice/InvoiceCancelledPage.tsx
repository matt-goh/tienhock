// src/pages/Invoice/InvoiceCancelledPage.tsx - revised version
import React, { useState, useEffect, useCallback } from "react";
import { ExtendedInvoiceData } from "../../types/types";
import { api } from "../../routes/utils/api";
import {
  IconSearch,
  IconRefresh,
  IconClock,
  IconCalendar,
  IconEye,
  IconReceiptOff,
  IconBuildingStore,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import toast from "react-hot-toast";
import LoadingSpinner from "../../components/LoadingSpinner";
import DateRangePicker from "../../components/DateRangePicker";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import CancelledInvoiceModal from "../../components/Invoice/CancelledInvoiceModal";

interface MonthOption {
  id: number;
  name: string;
}

const STORAGE_KEY = "cancelledInvoiceDateFilters";

const InvoiceCancelledPage: React.FC = () => {
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

  const [cancelledInvoices, setCancelledInvoices] = useState<
    ExtendedInvoiceData[]
  >([]);
  const [filteredInvoices, setFilteredInvoices] = useState<
    ExtendedInvoiceData[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {}
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState(getInitialDates());
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[currentMonth]
  );
  const [selectedInvoice, setSelectedInvoice] =
    useState<ExtendedInvoiceData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const fetchCancelledInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const startTimestamp = dateRange.start.getTime();
      const endTimestamp = dateRange.end.getTime();

      const response = await api.get(
        `/api/invoices/cancelled?startDate=${startTimestamp}&endDate=${endTimestamp}`
      );

      if (response && Array.isArray(response)) {
        setCancelledInvoices(response);
        setFilteredInvoices(response);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error: any) {
      console.error("Error fetching cancelled invoices:", error);
      setError(error.message || "Failed to load cancelled invoices");
      toast.error("Failed to load cancelled invoices");
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchCancelledInvoices();
  }, [fetchCancelledInvoices]);

  useEffect(() => {
    const fetchCustomerNames = async () => {
      const uniqueCustomerIds = Array.from(
        new Set(cancelledInvoices.map((invoice) => invoice.customerid))
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
  }, [cancelledInvoices, customerNames]);

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

    // Update date range
    saveDatesToStorage(startDate, endDate);
    setDateRange({
      start: startDate,
      end: endDate,
    });
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleRefresh = async () => {
    await fetchCancelledInvoices();
    toast.success("Cancelled invoices refreshed");
  };

  // Apply filters
  useEffect(() => {
    let filtered = [...cancelledInvoices];

    // Search filter
    if (searchTerm) {
      const lowercasedSearch = searchTerm.toLowerCase();
      filtered = filtered.filter((invoice) => {
        // Check in invoice fields
        const invoiceMatch = Object.values(invoice).some(
          (value) =>
            typeof value === "string" &&
            value.toLowerCase().includes(lowercasedSearch)
        );

        // Check in customer name
        const customerName = customerNames[invoice.customerid] || "";
        const customerMatch = customerName
          .toLowerCase()
          .includes(lowercasedSearch);

        return invoiceMatch || customerMatch;
      });
    }

    setFilteredInvoices(filtered);
  }, [cancelledInvoices, searchTerm, customerNames]);

  const handleInvoiceClick = (invoice: ExtendedInvoiceData) => {
    setSelectedInvoice(invoice);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedInvoice(null);
  };

  if (isLoading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white px-6">
        <div className="flex flex-col space-y-4">
          {/* Title and Actions Row */}
          <div className={`flex items-center justify-between`}>
            <div className="flex items-center">
              <IconReceiptOff size={28} className="mr-3 mt-1" />
              <h1 className="text-3xl font-semibold text-default-900">
                Cancelled Invoices
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleRefresh}
                icon={IconRefresh}
                iconSize={16}
                iconStroke={2}
                variant="outline"
              >
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters Row */}
          <div className={`space-y-4`}>
            <div className="flex gap-4">
              {/* Date Range */}
              <div className="flex-1">
                <DateRangePicker
                  dateRange={{
                    start: dateRange.start || today,
                    end: dateRange.end || tomorrow,
                  }}
                  onDateChange={(newDateRange) => {
                    saveDatesToStorage(newDateRange.start, newDateRange.end);
                    setDateRange(newDateRange);
                  }}
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
                    placeholder="Search cancelled invoices..."
                    className="w-full pl-11 pr-4 py-2 bg-white border border-default-300 rounded-full focus:border-default-500"
                    value={searchTerm}
                    onChange={handleSearchChange}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-6 pt-6 pb-8">
        {error && (
          <div className="bg-rose-50 text-rose-600 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Card Grid Display */}
        {filteredInvoices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInvoices.map((invoice) => {
              const createdDate = parseDatabaseTimestamp(
                invoice.createddate
              ).date;
              const cancelledDate = invoice.cancellation_date
                ? new Date(invoice.cancellation_date)
                : null;
              const customerName =
                customerNames[invoice.customerid] || invoice.customerid;

              return (
                <div
                  key={invoice.invoice_id}
                  className="bg-white border border-default-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden cursor-pointer"
                  onClick={() => handleInvoiceClick(invoice)}
                >
                  <div className="p-4 border-b border-default-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-lg font-semibold text-default-900">
                          {invoice.paymenttype === "CASH" ? "C" : "I"}
                          {invoice.invoice_id}
                        </div>
                        <div className="text-sm text-default-600 mt-1 flex items-center">
                          <IconBuildingStore
                            size={16}
                            className="mr-1 flex-shrink-0"
                          />
                          {customerName}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-default-500">Created</div>
                        <div className="text-sm font-medium flex items-center mt-1">
                          <IconCalendar
                            size={15}
                            className="mr-1 text-default-400"
                          />
                          {formatDisplayDate(createdDate)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-default-500">
                          Cancelled
                        </div>
                        <div className="text-sm font-medium text-rose-600 flex items-center mt-1">
                          <IconClock size={15} className="mr-1" />
                          {cancelledDate
                            ? formatDisplayDate(cancelledDate)
                            : "-"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <div className="text-default-600 text-sm">
                        {invoice.salespersonid}
                      </div>
                      <div className="text-lg font-semibold text-default-900">
                        RM {Number(invoice.totalamountpayable || 0).toFixed(2)}
                      </div>
                    </div>

                    <button className="w-full mt-4 py-2 flex items-center justify-center text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors duration-150 text-sm font-medium">
                      <IconEye size={16} className="mr-1.5" />
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center justify-center bg-white rounded-lg border border-default-200">
            <IconClock size={48} className="text-default-300 mb-4" />
            <p className="text-center text-default-600 font-medium">
              No cancelled invoices found
            </p>
            <p className="text-center text-default-400 text-sm mt-1 max-w-md">
              Cancelled invoices will appear here after they have been
              cancelled. Try adjusting your filters or date range.
            </p>
          </div>
        )}
      </div>

      {/* Invoice Details Modal */}
      <CancelledInvoiceModal
        invoice={selectedInvoice}
        onClose={closeModal}
        customerName={
          selectedInvoice ? customerNames[selectedInvoice.customerid] : ""
        }
        isOpen={isModalOpen}
      />
    </div>
  );
};

export default InvoiceCancelledPage;

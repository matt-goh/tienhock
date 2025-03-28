import React, { useState, useEffect, useRef, useCallback } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import Button from "../../components/Button";
import {
  IconRefresh,
  IconSearch,
  IconRotateClockwise,
  IconChevronDown,
  IconCheck,
  IconAlertTriangle,
  IconCircleCheck,
  IconBan,
} from "@tabler/icons-react";
import PaginationControls from "../../components/Invoice/Paginationcontrols";
import EInvoicePDFHandler from "../../utils/invoice/einvoice/EInvoicePDFHandler";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import ConsolidatedInfoTooltip from "../../components/Invoice/ConsolidatedInfoTooltip";
import DateRangePicker from "../../components/DateRangePicker";
import { LoginResponse } from "../../types/types";
import toast from "react-hot-toast";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

const STORAGE_KEY = "einvoisDateFilters";

// Define column configuration as a single source of truth
const COLUMN_CONFIG = [
  { name: "Invoice No", width: "w-[10%]" },
  { name: "Type", width: "w-[8%]" },
  { name: "Customer", width: "w-[18%]" },
  { name: "Date", width: "w-[15%]" },
  { name: "Amount", width: "w-[7%]" },
  { name: "Filler", width: "w-[2%]" },
  { name: "Submission ID", width: "w-[20%]" },
  { name: "Actions", width: "w-[20%]" },
];

interface EInvoice {
  uuid: string;
  submission_uid: string;
  long_id: string;
  internal_id: string;
  type_name: string;
  receiver_id: string;
  receiver_name: string;
  datetime_validated: string;
  total_payable_amount: number;
  total_excluding_tax: number;
  total_net_amount: number;
  isConsolidated: boolean;
  consolidated_invoices: number[] | string[];
  status?: string;
  cancellation_date?: string;
}

interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalPages: number;
}

interface MonthOption {
  id: number;
  name: string;
}

const EInvoiceHistoryPage: React.FC = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
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

  // Function to get initial dates from localStorage
  const getInitialDates = () => {
    const savedFilters = localStorage.getItem(STORAGE_KEY);
    if (savedFilters) {
      const { start, end } = JSON.parse(savedFilters);
      return {
        start: start
          ? new Date(start)
          : new Date(today.setMonth(today.getMonth() - 1)),
        end: end ? new Date(end) : tomorrow,
      };
    }
    return {
      start: new Date(today.setMonth(today.getMonth() - 1)),
      end: tomorrow,
    };
  };

  const [einvoices, setEInvoices] = useState<EInvoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<EInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    pageSize: 25,
    totalPages: 1,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState(getInitialDates());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [einvoiceToDelete, setEinvoiceToDelete] = useState<EInvoice | null>(
    null
  );
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(
    null
  );
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[currentMonth]
  );

  // Apply search filter locally
  const applySearchFilter = (data: EInvoice[], term: string) => {
    if (!term) return data;
    const searchLower = term.toLowerCase();
    return data.filter(
      (invoice) =>
        invoice.internal_id.toLowerCase().includes(searchLower) ||
        invoice.receiver_name.toLowerCase().includes(searchLower) ||
        invoice.submission_uid.toLowerCase().includes(searchLower) ||
        invoice.type_name.toLowerCase().includes(searchLower) ||
        (invoice.datetime_validated &&
          formatDate(invoice.datetime_validated)
            .toLowerCase()
            .includes(searchLower)) ||
        (invoice.cancellation_date &&
          formatDate(invoice.cancellation_date)
            .toLowerCase()
            .includes(searchLower)) ||
        invoice.total_payable_amount.toString().includes(searchLower)
    );
  };

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

  // Create a ref to store the fetch function
  const fetchDataRef = useRef<(() => Promise<any>) | null>(null);

  // Single effect for data fetching that handles both date range and pagination
  useEffect(() => {
    // Define the fetch function
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const queryParams = new URLSearchParams({
          page: pagination.currentPage.toString(),
          limit: pagination.pageSize.toString(),
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
        });
        const response = await api.get(
          `/api/einvoice/list?${queryParams.toString()}`
        );
        setEInvoices(response.data);
        setFilteredInvoices(applySearchFilter(response.data, searchTerm));
        setPagination((prev) => ({
          ...prev,
          totalPages: Math.ceil(response.total / prev.pageSize),
        }));

        return response; // Return the response for external use
      } catch (error: any) {
        console.error("Error fetching e-invoices:", error);
        setError("Failed to fetch e-invoices. Please try refreshing.");
      } finally {
        setLoading(false);
      }
    };

    // Store the fetch function in ref for external use
    fetchDataRef.current = fetchData;

    // Execute initial fetch
    fetchData();
  }, [dateRange.start, dateRange.end, pagination.currentPage, searchTerm]);

  // Create a handler for the refresh button
  const handleRefresh = async () => {
    if (fetchDataRef.current) {
      try {
        await fetchDataRef.current();
      } catch (error) {
        console.error("Error during refresh:", error);
      }
    }
  };

  // Client-side search effect - only needed if search changes but date/page don't
  useEffect(() => {
    if (!loading) {
      // Only apply client-side filtering if not fetching
      setFilteredInvoices(applySearchFilter(einvoices, searchTerm));
    }
  }, [searchTerm, einvoices, loading]);

  // Scrollbar detection effect - UI only
  useEffect(() => {
    const checkForScrollbar = () => {
      if (tableBodyRef.current) {
        const hasVerticalScrollbar =
          tableBodyRef.current.scrollHeight > tableBodyRef.current.clientHeight;
        setHasScrollbar(hasVerticalScrollbar);
      }
    };
    checkForScrollbar();
    const resizeObserver = new ResizeObserver(checkForScrollbar);
    if (tableBodyRef.current) {
      resizeObserver.observe(tableBodyRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [filteredInvoices]);

  // Function to display the appropriate date with formatting
  const displayProcessDate = (einvoice: EInvoice) => {
    const dateToShow =
      einvoice.status === "Cancelled"
        ? einvoice.cancellation_date
        : einvoice.datetime_validated;

    if (!dateToShow) return "N/A";

    const date = new Date(dateToShow);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12

    const dateString = `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;

    // Add visual indicator for cancelled dates
    if (einvoice.status === "Cancelled") {
      return (
        <span className="text-rose-600 flex items-center">
          <IconBan size={14} className="mr-1" stroke={1.5} />
          {dateString}
        </span>
      );
    }

    return dateString;
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

    // Save to storage and update state
    saveDatesToStorage(startDate, endDate);
    setDateRange({
      start: startDate,
      end: endDate,
    });
    // Reset to first page when date changes
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12

    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString("en-MY", {
      style: "currency",
      currency: "MYR",
    });
  };

  // Token validation function
  const isTokenValid = useCallback((loginData: LoginResponse): boolean => {
    if (!loginData.tokenInfo || !loginData.tokenCreationTime) return false;
    return (
      Date.now() <
      loginData.tokenCreationTime + loginData.tokenInfo.expiresIn * 1000
    );
  }, []);

  // Authentication function
  const connectToMyInvois = useCallback(async (): Promise<boolean> => {
    const storedLoginData = localStorage.getItem("myInvoisLoginData");
    if (storedLoginData) {
      const parsedData = JSON.parse(storedLoginData);
      if (isTokenValid(parsedData)) {
        setLoginResponse(parsedData);
        return true;
      }
    }

    try {
      const data = await api.post("/api/einvoice/login");
      if (data.success && data.tokenInfo) {
        const loginDataWithTime = { ...data, tokenCreationTime: Date.now() };
        localStorage.setItem(
          "myInvoisLoginData",
          JSON.stringify(loginDataWithTime)
        );
        setLoginResponse(loginDataWithTime);
        return true;
      } else {
        setLoginResponse(data);
        return false;
      }
    } catch (err) {
      setLoginResponse({
        success: false,
        message: "An error occurred while connecting to MyInvois API.",
        apiEndpoint: "Unknown",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    }
  }, [isTokenValid]);

  // Function to render status badge
  const renderStatusBadge = (einvoice: EInvoice) => {
    if (einvoice.status === "Cancelled") {
      return (
        <span className="ml-2 px-2 py-0.5 bg-rose-100 text-rose-800 text-xs rounded-full flex items-center gap-1">
          <IconBan size={12} />
          Cancelled
        </span>
      );
    } else if (einvoice.status === "Invalid") {
      return (
        <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full flex items-center gap-1">
          <IconAlertTriangle size={12} />
          Invalid
        </span>
      );
    } else if (!einvoice.long_id) {
      return (
        <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full flex items-center gap-1">
          Pending
        </span>
      );
    } else if (einvoice.status === "Valid" || einvoice.long_id) {
      return (
        <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full flex items-center gap-1">
          <IconCircleCheck size={12} />
          Valid
        </span>
      );
    }
    return null;
  };

  const checkEInvoiceStatus = async (uuid: string) => {
    try {
      const loadingToastId = toast.loading("Checking e-invoice status...");
      const response = await api.get(`/api/einvoice/submission/${uuid}`);
      toast.dismiss(loadingToastId);

      if (response.success && response.data.longId) {
        toast.success("E-invoice status updated successfully");
        // Refresh the data to show updated longId
        if (fetchDataRef.current) await fetchDataRef.current();
        return true;
      } else {
        toast.error("E-invoice is still pending in MyInvois system");
        return false;
      }
    } catch (error: any) {
      console.error("Error checking e-invoice status:", error);
      toast.error(error.message || "Failed to check e-invoice status");
      return false;
    }
  };

  const handleCancel = async () => {
    if (!einvoiceToDelete) return;
    try {
      // First authenticate with MyInvois if needed
      let isAuthenticated = false;
      if (loginResponse && isTokenValid(loginResponse)) {
        isAuthenticated = true;
      } else {
        // Try to connect
        const toastId = toast.loading("Connecting to MyInvois...");
        isAuthenticated = await connectToMyInvois();
        toast.dismiss(toastId);

        if (!isAuthenticated) {
          toast.error("Failed to connect to MyInvois API");
          return;
        }
      }

      // Now proceed with cancellation
      const cancelToastId = toast.loading("Cancelling e-invoice...");
      await api.delete(`/api/einvoice/${einvoiceToDelete.uuid}`);
      toast.dismiss(cancelToastId);

      setEinvoiceToDelete(null);
      setShowDeleteDialog(false);
      if (fetchDataRef.current) await fetchDataRef.current();
      toast.success("E-invoice cancelled successfully");
    } catch (error: any) {
      console.error("Error cancelling e-invoice:", error);

      // Handle specific error responses
      if (
        error?.response?.data?.message ===
        "The time limit for cancellation has expired"
      ) {
        toast.error(
          "Cannot cancel: The time limit for cancellation has expired"
        );
      } else if (
        error?.response?.data?.message === "This e-invoice is already cancelled"
      ) {
        toast.error("This e-invoice is already cancelled");
      } else {
        toast.error(error.message || "Failed to cancel e-invoice");
      }
    }
  };

  return (
    <div className="flex flex-col mt-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-semibold text-default-900">
          e-Invoices History
        </h1>
      </div>

      <div className="flex justify-between mb-4">
        <div className="flex gap-4">
          <div className="flex items-center gap-3 flex-1">
            <DateRangePicker
              dateRange={dateRange}
              onDateChange={(newDateRange) => {
                // Save to storage
                saveDatesToStorage(newDateRange.start, newDateRange.end);
                setDateRange(newDateRange);
                // Reset to first page when date changes
                setPagination((prev) => ({ ...prev, currentPage: 1 }));
              }}
              startInputWidth="w-44"
              endInputWidth="w-44"
            />
          </div>
          <div className="w-40">
            <Listbox value={selectedMonth} onChange={handleMonthChange}>
              <div className="relative">
                <ListboxButton className="w-full rounded-full border border-default-300 bg-white py-[9px] pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
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
        </div>
        <div className="flex gap-4">
          <div className="w-[320px]">
            <div className="relative">
              <IconSearch
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-default-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Search e-invoices..."
                className="w-full pl-11 pr-4 py-2 bg-white border border-default-300 rounded-full focus:border-default-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={loading}
            variant="outline"
            icon={IconRefresh}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-50 text-rose-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="border rounded-lg overflow-visible">
        <div className="relative">
          <div
            className={`bg-default-100 border-b ${
              hasScrollbar ? "pr-[17px]" : ""
            }`}
          >
            <table className="w-full table-fixed">
              <colgroup>
                {COLUMN_CONFIG.map((col, index) => (
                  <col key={index} className={col.width} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {COLUMN_CONFIG.map((col, index) => (
                    <th
                      key={index}
                      className={`px-4 py-3 text-left font-medium text-default-700 ${
                        col.name === "Amount" ? "text-right" : ""
                      } truncate`}
                    >
                      {col.name !== "Filler" ? col.name : ""}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>

          <div
            ref={tableBodyRef}
            className="max-h-[calc(100vh-300px)] overflow-y-auto"
          >
            <table className="w-full table-fixed">
              <colgroup>
                {COLUMN_CONFIG.map((col, index) => (
                  <col key={index} className={col.width} />
                ))}
              </colgroup>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td
                      colSpan={COLUMN_CONFIG.length}
                      className="px-4 py-8 text-center"
                    >
                      <LoadingSpinner />
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMN_CONFIG.length}
                      className="px-4 py-3 text-center text-default-500"
                    >
                      No e-invoices found
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((einvoice) => (
                    <tr key={einvoice.uuid} className="border-b last:border-0">
                      <td className="px-4 py-3 text-default-700">
                        <div className="flex items-center">
                          <span>{einvoice.internal_id}</span>
                          {Array.isArray(einvoice.consolidated_invoices) &&
                            einvoice.consolidated_invoices.length > 0 && (
                              <ConsolidatedInfoTooltip
                                invoices={einvoice.consolidated_invoices}
                              />
                            )}
                          {renderStatusBadge(einvoice)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-default-700">
                        {einvoice.type_name}
                      </td>
                      <td className="px-4 py-3 text-default-700 truncate">
                        {einvoice.receiver_name}
                      </td>
                      <td className="px-4 py-3 text-default-700 truncate relative group">
                        <div className="flex items-center">
                          {displayProcessDate(einvoice)}
                          <div
                            className="absolute z-10 invisible bg-default-800 text-white text-xs rounded p-2 mt-1 
                    bottom-full left-1/2 transform -translate-x-1/2 group-hover:visible w-48 
                    after:content-[''] after:absolute after:top-full after:left-1/2 
                    after:-translate-x-1/2 after:border-8 after:border-t-default-800 
                    after:border-x-transparent after:border-b-transparent"
                          >
                            {einvoice.status === "Cancelled"
                              ? "Date when the e-invoice was cancelled"
                              : "Date when the e-invoice was validated"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-default-700 text-right">
                        {formatAmount(einvoice.total_payable_amount)}
                      </td>
                      <td className="px-4 py-3 text-default-700"></td>
                      <td className="px-4 py-3 text-default-700 truncate">
                        {einvoice.submission_uid}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {einvoice.long_id &&
                          einvoice.status !== "Cancelled" ? (
                            <EInvoicePDFHandler
                              einvoice={einvoice}
                              disabled={false}
                            />
                          ) : !einvoice.long_id &&
                            einvoice.status !== "Cancelled" ? (
                            <Button
                              onClick={() => checkEInvoiceStatus(einvoice.uuid)}
                              variant="outline"
                              color="sky"
                              size="sm"
                              icon={IconRotateClockwise}
                            >
                              Check Status
                            </Button>
                          ) : null}
                          {einvoice.status !== "Cancelled" && (
                            <Button
                              onClick={() => {
                                setEinvoiceToDelete(einvoice);
                                setShowDeleteDialog(true);
                              }}
                              variant="outline"
                              color="rose"
                              size="sm"
                              icon={IconBan}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <PaginationControls
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          itemsCount={filteredInvoices.length}
          onPageChange={(page) =>
            setPagination((prev) => ({ ...prev, currentPage: page }))
          }
        />
      </div>
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleCancel}
        title="Cancel E-Invoice"
        message={
          einvoiceToDelete
            ? `Are you sure you want to cancel e-invoice ${einvoiceToDelete.internal_id}? This action cannot be undone and will mark the invoice as cancelled in the MyInvois system.`
            : "Are you sure you want to cancel this e-invoice?"
        }
        confirmButtonText="Cancel E-Invoice"
        variant="danger"
      />
    </div>
  );
};

export default EInvoiceHistoryPage;

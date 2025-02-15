import React, { useState, useEffect, useRef } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import Button from "../../components/Button";
import { IconRefresh, IconSearch } from "@tabler/icons-react";
import PaginationControls from "../../components/Invois/Paginationcontrols";
import EInvoicePDFHandler from "../../utils/invoice/einvoice/EInvoicePDFHandler";

const STORAGE_KEY = "einvoisDateFilters";

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
}

interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalPages: number;
}

const EInvoisPage: React.FC = () => {
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
  const [isDateRangeFocused, setIsDateRangeFocused] = useState(false);

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

  // Get date range info for validation
  const getDateRangeInfo = (start: Date, end: Date) => {
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    const rangeDuration = end.getTime() - start.getTime();
    return {
      isWithinMonth: rangeDuration <= oneMonthMs,
      isValidDirection: rangeDuration > 0,
      rangeDuration,
    };
  };

  // Adjust date range to maintain constraints
  const adjustDateRange = (
    newDate: Date,
    type: "start" | "end",
    currentRange: { start: Date; end: Date }
  ): { start: Date; end: Date } => {
    const oneMonthMs = 31 * 24 * 60 * 60 * 1000;

    // Check if the new range would exceed one month
    const rangeInfo = getDateRangeInfo(
      type === "start" ? newDate : currentRange.start,
      type === "end" ? newDate : currentRange.end
    );

    if (!rangeInfo.isValidDirection) {
      // If dates are in wrong order, adjust the other date
      return type === "start"
        ? {
            start: newDate,
            end: new Date(newDate.getTime() + 24 * 60 * 60 * 1000),
          }
        : {
            start: new Date(newDate.getTime() - 24 * 60 * 60 * 1000),
            end: newDate,
          };
    }

    if (!rangeInfo.isWithinMonth) {
      // If range exceeds one month, adjust the other date
      return type === "start"
        ? { start: newDate, end: new Date(newDate.getTime() + oneMonthMs) }
        : { start: new Date(newDate.getTime() - oneMonthMs), end: newDate };
    }

    // If range is valid, return new date with existing other date
    return {
      start: type === "start" ? newDate : currentRange.start,
      end: type === "end" ? newDate : currentRange.end,
    };
  };

  const handleDateChange = (type: "start" | "end", value: string) => {
    // If value is empty or invalid, keep the current date
    if (!value) {
      return;
    }

    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
      return;
    }
    const newDate = new Date(year, month - 1, day);

    if (isNaN(newDate.getTime())) {
      return;
    }
    // Get adjusted date range
    const adjustedRange = adjustDateRange(newDate, type, dateRange);

    // Save to storage and update state
    saveDatesToStorage(adjustedRange.start, adjustedRange.end);
    setDateRange(adjustedRange);
    // Reset to first page when date changes
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  };

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  return (
    <div className="flex flex-col px-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-semibold text-default-900">
          e-Invoices History
        </h1>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <div
            className={`flex items-center w-fit bg-white border ${
              isDateRangeFocused ? "border-default-500" : "border-default-300"
            } rounded-full px-4`}
          >
            <div className="flex items-center gap-3 flex-1">
              <input
                type="date"
                value={formatDateForInput(dateRange.start)}
                onChange={(e) => handleDateChange("start", e.target.value)}
                onFocus={() => setIsDateRangeFocused(true)}
                onBlur={() => setIsDateRangeFocused(false)}
                className="w-44 px-2 py-2 rounded-full bg-transparent outline-none"
              />
              <span className="text-default-400">to</span>
              <input
                type="date"
                value={formatDateForInput(dateRange.end)}
                onChange={(e) => handleDateChange("end", e.target.value)}
                onFocus={() => setIsDateRangeFocused(true)}
                onBlur={() => setIsDateRangeFocused(false)}
                className="w-44 px-2 py-2 rounded-full bg-transparent outline-none"
              />
            </div>
          </div>
        </div>
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

      {error && (
        <div className="mb-4 p-4 bg-rose-50 text-rose-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="relative">
          <div
            className={`bg-default-100 border-b ${
              hasScrollbar ? "pr-[17px]" : ""
            }`}
          >
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[10%]" />
                {/* Invoice No */}
                <col className="w-[10%]" />
                {/* Type */}
                <col className="w-[20%]" />
                {/* Customer */}
                <col className="w-[17%]" />
                {/* Validated At */}
                <col className="w-[9%]" />
                {/* Amount */}
                <col className="w-[22%]" />
                {/* Submission ID */}
                <col className="w-[12%]" />
                {/* Actions */}
              </colgroup>
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-default-700 truncate">
                    Invoice No
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Validated At
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-default-700">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Submission ID
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Actions
                  </th>
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
                <col className="w-[10%]" />
                {/* Invoice No */}
                <col className="w-[10%]" />
                {/* Type */}
                <col className="w-[20%]" />
                {/* Customer */}
                <col className="w-[17%]" />
                {/* Validated At */}
                <col className="w-[9%]" />
                {/* Amount */}
                <col className="w-[22%]" />
                {/* Submission ID */}
                <col className="w-[12%]" />
                {/* Actions */}
              </colgroup>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center">
                      <LoadingSpinner />
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-3 text-center text-default-500"
                    >
                      No e-invoices found
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((einvoice) => (
                    <tr key={einvoice.uuid} className="border-b last:border-0">
                      <td className="px-4 py-3 text-default-700">
                        {einvoice.internal_id}
                      </td>
                      <td className="px-4 py-3 text-default-700">
                        {einvoice.type_name}
                      </td>
                      <td className="px-4 py-3 text-default-700 truncate">
                        {einvoice.receiver_name}
                      </td>
                      <td className="px-4 py-3 text-default-700 truncate">
                        {formatDate(einvoice.datetime_validated)}
                      </td>
                      <td className="px-4 py-3 text-default-700 text-right">
                        {formatAmount(einvoice.total_payable_amount)}
                      </td>
                      <td className="px-4 py-3 text-default-700 truncate">
                        {einvoice.submission_uid}
                      </td>
                      <td className="px-4 py-3">
                        <EInvoicePDFHandler
                          einvoice={einvoice}
                          disabled={false}
                        />
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
    </div>
  );
};

export default EInvoisPage;

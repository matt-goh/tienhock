import React, { useState, useEffect, useRef } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import Button from "../../components/Button";
import { IconRefresh, IconSearch } from "@tabler/icons-react";

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
  const [einvoices, setEInvoices] = useState<EInvoice[]>([]);
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
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 1)),
    end: new Date(new Date().setDate(new Date().getDate() + 1)),
  });
  const [isDateRangeFocused, setIsDateRangeFocused] = useState(false);

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

    return () => {
      resizeObserver.disconnect();
    };
  }, [einvoices]);

  // Update fetchEInvoices to use 300 records
  const fetchEInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/api/einvoice/list", {
        params: {
          page: pagination.currentPage,
          limit: pagination.pageSize,
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
        },
      });
      setEInvoices(response.data);
      setPagination((prev) => ({
        ...prev,
        totalPages: Math.ceil(response.total / prev.pageSize),
      }));
    } catch (error: any) {
      setError("Failed to fetch e-invoices. Please try refreshing.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEInvoices();
  }, [searchTerm, dateRange, pagination.currentPage]);

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString("en-MY", {
      style: "currency",
      currency: "MYR",
    });
  };

  const PaginationControls = () => {
    const pages = Array.from(
      { length: pagination.totalPages },
      (_, i) => i + 1
    );
    const showPages = pagination.totalPages <= 7;

    const getVisiblePages = () => {
      if (showPages) return pages;

      const current = pagination.currentPage;
      if (current <= 4)
        return [...pages.slice(0, 5), "...", pagination.totalPages];
      if (current >= pagination.totalPages - 3)
        return [1, "...", ...pages.slice(-5)];
      return [
        1,
        "...",
        current - 1,
        current,
        current + 1,
        "...",
        pagination.totalPages,
      ];
    };

    return (
      <div className="flex items-center justify-between border-t border-default-200 bg-white px-4 py-3">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.currentPage === 1}
            onClick={() =>
              setPagination((prev) => ({
                ...prev,
                currentPage: prev.currentPage - 1,
              }))
            }
          >
            Previous
          </Button>

          {getVisiblePages().map((page, idx) =>
            page === "..." ? (
              <span key={`ellipsis-${idx}`} className="px-2">
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() =>
                  setPagination((prev) => ({
                    ...prev,
                    currentPage: page as number,
                  }))
                }
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  page === pagination.currentPage
                    ? "bg-default-100 text-default-700"
                    : "text-default-600 hover:bg-default-50"
                }`}
              >
                {page}
              </button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={pagination.currentPage === pagination.totalPages}
            onClick={() =>
              setPagination((prev) => ({
                ...prev,
                currentPage: prev.currentPage + 1,
              }))
            }
          >
            Next
          </Button>
        </div>
        <div className="text-sm text-default-600">
          Showing page {pagination.currentPage} of {pagination.totalPages}
        </div>
      </div>
    );
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
                onChange={(e) =>
                  setDateRange((prev) => ({
                    ...prev,
                    start: new Date(e.target.value),
                  }))
                }
                onFocus={() => setIsDateRangeFocused(true)}
                onBlur={() => setIsDateRangeFocused(false)}
                className="w-44 px-2 py-2 rounded-full bg-transparent outline-none"
              />
              <span className="text-default-400">to</span>
              <input
                type="date"
                value={formatDateForInput(dateRange.end)}
                onChange={(e) =>
                  setDateRange((prev) => ({
                    ...prev,
                    end: new Date(e.target.value),
                  }))
                }
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
          onClick={fetchEInvoices}
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
                <col className="w-[10%]" /> {/* Invoice No */}
                <col className="w-[10%]" /> {/* Type */}
                <col className="w-[20%]" /> {/* Customer */}
                <col className="w-[17%]" /> {/* Validated At */}
                <col className="w-[9%]" /> {/* Amount */}
                <col className="w-[22%]" /> {/* Submission ID */}
                <col className="w-[12%]" /> {/* Actions */}
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
                <col className="w-[10%]" />
                <col className="w-[20%]" />
                <col className="w-[17%]" />
                <col className="w-[9%]" />
                <col className="w-[22%]" />
                <col className="w-[12%]" />
              </colgroup>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center">
                      <LoadingSpinner />
                    </td>
                  </tr>
                ) : einvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-3 text-center text-default-500"
                    >
                      No e-invoices found
                    </td>
                  </tr>
                ) : (
                  einvoices.map((einvoice) => (
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
                        <Button
                          onClick={() => {}}
                          disabled={false}
                          variant="outline"
                          size="sm"
                        >
                          Download
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <PaginationControls />
      </div>
    </div>
  );
};

export default EInvoisPage;

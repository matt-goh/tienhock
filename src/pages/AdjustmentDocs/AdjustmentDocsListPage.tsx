// src/pages/AdjustmentDocs/AdjustmentDocsListPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconFileText,
  IconPlus,
  IconSearch,
  IconRefresh,
  IconFileMinus,
  IconFilePlus,
  IconRotate2,
  IconLayoutGrid,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import DateRangePicker from "../../components/DateRangePicker";
import MonthNavigator from "../../components/MonthNavigator";
import StyledListbox from "../../components/StyledListbox";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import {
  AdjustmentDocument,
  AdjustmentDocType,
} from "../../types/types";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "../../components/AdjustmentDocs/AdjustmentDocBadge";
import { parseDatabaseTimestamp, formatDisplayDate } from "../../utils/invoice/dateUtils";

interface FilterState {
  type: AdjustmentDocType | "all";
  dateRange: { start: Date | null; end: Date | null };
  einvoiceStatus: string | null;
  status: string | null;
  searchTerm: string;
}

const TYPE_TABS: Array<{ id: FilterState["type"]; label: string; icon: any }> = [
  { id: "all", label: "All", icon: IconLayoutGrid },
  { id: "debit_note", label: "Debit Notes", icon: IconFilePlus },
  { id: "credit_note", label: "Credit Notes", icon: IconFileMinus },
  { id: "refund_note", label: "Refund Notes", icon: IconRotate2 },
];

const AdjustmentDocsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<AdjustmentDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [filters, setFilters] = useState<FilterState>(() => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    );
    end.setHours(23, 59, 59, 999);
    return {
      type: "all",
      dateRange: { start, end },
      einvoiceStatus: null,
      status: "active",
      searchTerm: "",
    };
  });

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.type !== "all") params.append("type", filters.type);
      if (filters.dateRange.start) {
        params.append("startDate", filters.dateRange.start.getTime().toString());
      }
      if (filters.dateRange.end) {
        const end = new Date(filters.dateRange.end);
        end.setHours(23, 59, 59, 999);
        params.append("endDate", end.getTime().toString());
      }
      if (filters.einvoiceStatus) {
        params.append("einvoice_status", filters.einvoiceStatus);
      }
      if (filters.status) params.append("status", filters.status);
      if (filters.searchTerm) params.append("search", filters.searchTerm);
      params.append("include_cancelled", "true");

      const response = await api.get(`/api/adjustment-docs?${params.toString()}`);
      setDocs(Array.isArray(response) ? response : []);
    } catch (error: any) {
      console.error("Error fetching adjustment documents:", error);
      toast.error("Failed to fetch adjustment documents");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleDateChange = useCallback(
    (newDateRange: { start: Date; end: Date }) => {
      setFilters((prev) => ({ ...prev, dateRange: newDateRange }));
    },
    []
  );

  const handleMonthChange = useCallback((newDate: Date) => {
    setSelectedMonth(newDate);
    const startDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);
    setFilters((prev) => ({
      ...prev,
      dateRange: { start: startDate, end: endDate },
    }));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: docs.length };
    docs.forEach((d) => {
      c[d.type] = (c[d.type] || 0) + 1;
    });
    return c;
  }, [docs]);

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <IconFileText size={28} className="text-gray-700 dark:text-gray-200" />
          Adjustment Documents
        </h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate("/sales/adjustment-docs/new?type=debit")}
            icon={IconFilePlus}
            variant="outline"
            size="md"
          >
            New Debit Note
          </Button>
          <Button
            onClick={() => navigate("/sales/adjustment-docs/new?type=credit")}
            icon={IconFileMinus}
            variant="outline"
            size="md"
          >
            New Credit Note
          </Button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 w-fit bg-default-100 dark:bg-gray-900/50 rounded-lg p-1">
        {TYPE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = filters.type === tab.id;
          const count = counts[tab.id] || 0;
          return (
            <button
              key={tab.id}
              onClick={() => setFilters((prev) => ({ ...prev, type: tab.id }))}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors duration-150 flex items-center gap-1.5 ${
                active
                  ? "bg-white dark:bg-gray-700 shadow-sm text-sky-700 dark:text-sky-400 font-semibold"
                  : "text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-200"
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    active
                      ? "bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300"
                      : "bg-default-200 dark:bg-gray-700 text-default-700 dark:text-gray-300"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
                size={18}
              />
              <input
                type="text"
                placeholder="Search by ID, invoice, or customer"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent h-[40px]"
                value={filters.searchTerm}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))
                }
              />
            </div>

            <DateRangePicker
              dateRange={{
                start: filters.dateRange.start || new Date(),
                end: filters.dateRange.end || new Date(),
              }}
              onDateChange={handleDateChange}
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

            <div className="w-40">
              <StyledListbox
                value={filters.einvoiceStatus || ""}
                onChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    einvoiceStatus: value === "" ? null : String(value),
                  }))
                }
                options={[
                  { id: "", name: "All e-Status" },
                  { id: "null", name: "Not Submitted" },
                  { id: "pending", name: "Pending" },
                  { id: "valid", name: "Valid" },
                  { id: "invalid", name: "Invalid" },
                  { id: "cancelled", name: "Cancelled" },
                ]}
                placeholder="All e-Status"
                rounded="lg"
              />
            </div>

            <div className="w-32">
              <StyledListbox
                value={filters.status || ""}
                onChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: value === "" ? null : String(value),
                  }))
                }
                options={[
                  { id: "", name: "All" },
                  { id: "active", name: "Active" },
                  { id: "cancelled", name: "Cancelled" },
                ]}
                placeholder="All"
                rounded="lg"
              />
            </div>

            <Button
              onClick={fetchDocs}
              icon={IconRefresh}
              variant="outline"
              size="md"
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-12 text-center">
          <IconFileText
            size={40}
            className="text-default-300 dark:text-gray-600 mx-auto mb-3"
          />
          <p className="text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
            No adjustment documents found
          </p>
          <p className="text-xs text-default-500 dark:text-gray-400">
            Try changing your filters, or create one from an invoice's details
            page.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Document ID
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Original Invoice
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
                {docs.map((doc) => {
                  const { date } = parseDatabaseTimestamp(doc.createddate);
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-default-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150"
                      onClick={() =>
                        navigate(`/sales/adjustment-docs/${doc.id}`)
                      }
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                        {doc.id}
                        {doc.paired_doc_id && (
                          <span
                            className="block text-xs text-default-500 dark:text-gray-400"
                            title={`Paired with ${doc.paired_doc_id}`}
                          >
                            ↔ {doc.paired_doc_id}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <AdjustmentDocTypeBadge type={doc.type} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 dark:text-gray-200">
                        {doc.original_invoice_id}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 dark:text-gray-200">
                        {doc.customer_name || doc.customerid}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-default-700 dark:text-gray-200">
                        {formatCurrency(doc.totalamountpayable)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <AdjustmentDocStatusBadge
                          status={doc.status}
                          einvoiceStatus={doc.einvoice_status}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                        {date ? formatDisplayDate(date) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdjustmentDocsListPage;

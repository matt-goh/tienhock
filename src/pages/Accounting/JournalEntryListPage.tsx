// src/pages/Accounting/JournalEntryListPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { JournalEntry } from "../../types/types";
import { useJournalEntryTypesCache } from "../../utils/accounting/useAccountingCache";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import TimeNavigator from "../../components/TimeNavigator";
import {
  IconPlus,
  IconSearch,
  IconPencil,
  IconTrash,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";

interface JournalEntryListItem extends JournalEntry {
  entry_type_name?: string;
}

const LEGACY_STORAGE_KEY = "journalEntryListDateRange";
const FILTERS_STORAGE_KEY = "journalEntryListFilters";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Cancelled" },
];

interface CachedListFilters {
  search: string;
  dateRange: { start: Date; end: Date };
  types: string[];
  statuses: string[];
}

// Load cached filters (search, date range, and type/status pill selections) from localStorage
const loadCachedFilters = (): CachedListFilters => {
  const fallback: CachedListFilters = {
    search: "",
    dateRange: { start: new Date(), end: new Date() },
    types: [],
    statuses: [],
  };
  try {
    const cached = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        search: typeof parsed.search === "string" ? parsed.search : "",
        dateRange: {
          start: new Date(parsed.start),
          end: new Date(parsed.end),
        },
        types: Array.isArray(parsed.types)
          ? parsed.types.filter((t: unknown) => typeof t === "string")
          : [],
        statuses: Array.isArray(parsed.statuses)
          ? parsed.statuses.filter((s: unknown) => typeof s === "string")
          : [],
      };
    }
    // Migrate from the old date-range-only cache
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      return {
        ...fallback,
        dateRange: {
          start: new Date(parsed.start),
          end: new Date(parsed.end),
        },
      };
    }
  } catch (e) {
    console.error("Error loading cached filters:", e);
  }
  return fallback;
};

// Helper to parse URL params and return initial state
const getInitialStateFromParams = (params: URLSearchParams): {
  search: string;
  types: string[];
  statuses: string[];
  dateRange: { start: Date; end: Date };
} => {
  const urlSearch = params.get("search");
  const urlType = params.get("type");
  const urlYear = params.get("year");
  const urlMonth = params.get("month");
  const urlDate = params.get("date");

  // If we have year/month params, use them for date range
  if (urlYear && urlMonth) {
    const year = parseInt(urlYear);
    const month = parseInt(urlMonth) - 1; // JS months are 0-indexed
    const startDate = new Date(year, month, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(year, month + 1, 0);
    endDate.setHours(23, 59, 59, 999);
    return {
      search: urlSearch || "",
      types: urlType ? [urlType] : [],
      statuses: [],
      dateRange: { start: startDate, end: endDate },
    };
  }

  // If we have a specific date param
  if (urlDate) {
    const date = new Date(urlDate);
    date.setHours(0, 0, 0, 0);
    const endOfDay = new Date(urlDate);
    endOfDay.setHours(23, 59, 59, 999);
    return {
      search: urlSearch || "",
      types: urlType ? [urlType] : [],
      statuses: [],
      dateRange: { start: date, end: endOfDay },
    };
  }

  // Fall back to cached filters
  const cached = loadCachedFilters();
  return {
    search: urlSearch || cached.search,
    types: urlType ? [urlType] : cached.types,
    statuses: cached.statuses,
    dateRange: cached.dateRange,
  };
};

const JournalEntryListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Cached entry types
  const { entryTypes } = useJournalEntryTypesCache();

  // Data state
  const [entries, setEntries] = useState<JournalEntryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Filters - load search, date range, and pill selections from cache initially
  const [searchTerm, setSearchTerm] = useState<string>(
    () => loadCachedFilters().search
  );
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    () => loadCachedFilters().types
  );
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    () => loadCachedFilters().statuses
  );
  const [dateRange, setDateRange] = useState(() => loadCachedFilters().dateRange);

  // Apply URL params on mount
  useEffect(() => {
    if (!initialized) {
      const initialState = getInitialStateFromParams(searchParams);
      setSearchTerm(initialState.search);
      setSelectedTypes(initialState.types);
      setSelectedStatuses(initialState.statuses);
      setDateRange(initialState.dateRange);
      setInitialized(true);
    }
  }, [searchParams, initialized]);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [entryToDelete, setEntryToDelete] =
    useState<JournalEntryListItem | null>(null);
  const [showDeleteErrorDialog, setShowDeleteErrorDialog] = useState(false);
  const [deleteErrorData, setDeleteErrorData] = useState<{
    message: string;
    detail?: string;
    payment_id?: number;
    invoice_id?: string;
    suggestion?: string;
  } | null>(null);

  // Helper function to format a Date object into 'YYYY-MM-DD' string in local time
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Unified Time Navigator change handler. Handles day, month, and custom-range
  // selections from the single TimeNavigator control.
  const handleTimeNavigatorChange = (range: { start: Date; end: Date }) => {
    setDateRange({ start: range.start, end: range.end });
    setPage(1);
  };

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", limit.toString());
      params.append("offset", ((page - 1) * limit).toString());

      if (searchTerm) params.append("search", searchTerm);
      if (selectedTypes.length > 0)
        params.append("entry_type", selectedTypes.join(","));
      if (selectedStatuses.length > 0) {
        // The UI's "Active" means "not cancelled"; the DB stores posted plus
        // legacy draft/active rows from before entries were posted on creation
        const dbStatuses = selectedStatuses.flatMap((s) =>
          s === "active" ? ["posted", "draft", "active"] : [s]
        );
        params.append("status", dbStatuses.join(","));
      }
      if (dateRange.start)
        params.append("start_date", formatDateForAPI(dateRange.start));
      if (dateRange.end)
        params.append("end_date", formatDateForAPI(dateRange.end));

      const response = await api.get(
        `/api/journal-entries?${params.toString()}`
      );
      const data = response as {
        entries: JournalEntryListItem[];
        total: number;
      };

      setEntries(data.entries);
      setTotal(data.total);
    } catch (error) {
      console.error("Error fetching entries:", error);
      toast.error("Failed to load journal entries");
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchTerm, selectedTypes, selectedStatuses, dateRange]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedTypes, selectedStatuses, dateRange]);

  // Cache search, date range, and pill selections to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          search: searchTerm,
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
          types: selectedTypes,
          statuses: selectedStatuses,
        })
      );
    } catch (e) {
      console.error("Error caching filters:", e);
    }
  }, [searchTerm, dateRange, selectedTypes, selectedStatuses]);

  // Handlers
  const handleCreateNew = () => {
    navigate("/accounting/journal-entries/new");
  };

  const handleView = (entry: JournalEntryListItem) => {
    navigate(`/accounting/journal-entries/${entry.id}`);
  };

  const handleEdit = (entry: JournalEntryListItem) => {
    navigate(`/accounting/journal-entries/${entry.id}/edit`);
  };

  const handleDeleteClick = (
    entry: JournalEntryListItem,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setEntryToDelete(entry);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!entryToDelete) return;

    try {
      await api.delete(`/api/journal-entries/${entryToDelete.id}`);
      toast.success("Journal entry deleted successfully");
      setShowDeleteDialog(false);
      setEntryToDelete(null);
      fetchEntries();
    } catch (error: unknown) {
      console.error("Error deleting entry:", error);

      // Close the delete confirmation dialog first
      setShowDeleteDialog(false);

      // Handle enhanced error response from backend
      const errorData = (error as any)?.data;

      if (errorData) {
        // Store error data and show error dialog
        setDeleteErrorData({
          message: errorData.message || "Failed to delete journal entry",
          detail: errorData.detail,
          payment_id: errorData.payment_id,
          invoice_id: errorData.invoice_id,
          suggestion: errorData.suggestion,
        });
        setShowDeleteErrorDialog(true);
      } else {
        // Fallback to simple toast error
        const errorMessage =
          error instanceof Error ? error.message : "Failed to delete entry";
        toast.error(errorMessage);
      }
    }
  };

  // Handle navigation to invoice from error dialog
  const handleGoToInvoice = () => {
    if (deleteErrorData?.invoice_id) {
      setShowDeleteErrorDialog(false);
      navigate(`/sales/invoice/${deleteErrorData.invoice_id}`);
    }
  };

  const toggleType = (code: string) => {
    setSelectedTypes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleStatus = (value: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const hasActiveFilters =
    searchTerm !== "" || selectedTypes.length > 0 || selectedStatuses.length > 0;

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedTypes([]);
    setSelectedStatuses([]);
  };

  // Format date for display
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Format amount
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Status badge
  const getStatusBadge = (status: string) => {
    const isCancelled = status === "cancelled";
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          isCancelled
            ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
            : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
        }`}
      >
        {isCancelled ? "Cancelled" : "Active"}
      </span>
    );
  };

  // Pagination
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Header - row 1: title, search, date controls; row 2: filter pills. Search drops to its own row on mobile */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {/* Title */}
        <div className="order-1 flex items-center gap-2 flex-shrink-0">
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Journal Entries
          </h1>
          <span className="text-default-400 dark:text-gray-500">|</span>
          <span className="text-sm text-default-600 dark:text-gray-300 whitespace-nowrap">
            Showing{" "}
            <span className="font-medium text-default-900 dark:text-gray-100">
              {entries.length}
            </span>{" "}
            of{" "}
            <span className="font-medium text-default-900 dark:text-gray-100">
              {total}
            </span>
          </span>
        </div>

        {/* Search - first row left of the date controls; own row on mobile */}
        <div className="relative order-3 w-full md:order-2 md:w-64 md:ml-auto">
          <IconSearch
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400"
            stroke={1.5}
          />
          <input
            type="text"
            placeholder="Search reference or description..."
            className="w-full h-[40px] rounded-lg border border-default-300 dark:border-gray-600 pl-9 pr-8 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-900/50 text-default-800 dark:text-gray-100"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-default-400 hover:text-default-600 dark:hover:text-gray-300"
              title="Clear search"
            >
              <IconX size={16} />
            </button>
          )}
        </div>

        {/* Filters - own row below the title/date controls; all pills flow in one wrapping line */}
        <div className="order-4 w-full flex flex-wrap items-center gap-1.5 min-w-0">
          {/* Type pills - toggle each journal type on/off (none selected = show all) */}
          {entryTypes.map((type) => {
            const active = selectedTypes.includes(type.code);
            return (
              <button
                key={type.code}
                type="button"
                onClick={() => toggleType(type.code)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors select-none whitespace-nowrap ${
                  active
                    ? "border-sky-500 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                    : "border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
                }`}
              >
                <span className="font-semibold">{type.code}</span>
                <span
                  className={
                    active
                      ? "text-sky-600/80 dark:text-sky-300/80"
                      : "text-default-500 dark:text-gray-400"
                  }
                >
                  {type.name}
                </span>
              </button>
            );
          })}

          {/* Divider */}
          <span className="h-5 w-px bg-default-300 dark:bg-gray-600 mx-1" />

          {/* Status pills */}
          {STATUS_OPTIONS.map((status) => {
            const active = selectedStatuses.includes(status.value);
            const activeClass =
              status.value === "cancelled"
                ? "border-rose-500 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
                : "border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
            return (
              <button
                key={status.value}
                type="button"
                onClick={() => toggleStatus(status.value)}
                aria-pressed={active}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors select-none ${
                  active
                    ? activeClass
                    : "border-default-300 dark:border-gray-600 text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
                }`}
              >
                {status.label}
              </button>
            );
          })}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-default-600 dark:text-gray-300 hover:text-default-900 dark:hover:text-gray-100"
              title="Clear filters"
            >
              <IconRefresh size={16} />
              Clear
            </button>
          )}
        </div>

        {/* Date Controls and Actions */}
        <div className="order-2 ml-auto md:order-3 md:ml-0 flex items-center gap-3 flex-shrink-0">
          <TimeNavigator
            range={dateRange}
            onChange={handleTimeNavigatorChange}
          />

          <Button
            onClick={handleCreateNew}
            color="sky"
            variant="filled"
            icon={IconPlus}
            iconPosition="left"
            size="md"
          >
            New
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center my-20">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-100 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Reference
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Debit
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Credit
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-28">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => handleView(entry)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-sky-700 dark:text-sky-400">
                      {entry.reference_no}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-0.5 rounded bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200 text-xs font-medium">
                        {entry.entry_type}
                      </span>
                      {entry.entry_type_name && (
                        <span className="ml-1 text-default-500 dark:text-gray-400 text-xs">
                          {entry.entry_type_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-600 dark:text-gray-300">
                      {formatDate(entry.entry_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-600 dark:text-gray-300 max-w-xs truncate">
                      {entry.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-default-700 dark:text-gray-200">
                      {formatAmount(entry.total_debit)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-default-700 dark:text-gray-200">
                      {formatAmount(entry.total_credit)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(entry.status)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(entry);
                          }}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                          title="Edit"
                        >
                          <IconPencil size={18} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(entry, e)}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                          title="Delete"
                        >
                          <IconTrash size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                  >
                    No journal entries found.{" "}
                    {hasActiveFilters && (
                      <span>Try adjusting your filters or </span>
                    )}
                    <button
                      onClick={handleCreateNew}
                      className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 font-medium"
                    >
                      create a new entry
                    </button>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-default-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-default-300 dark:border-gray-700 rounded-lg hover:bg-default-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-10 h-10 text-sm font-medium rounded-lg ${
                    page === pageNum
                      ? "bg-sky-600 text-white"
                      : "text-default-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-default-300 dark:border-gray-700 hover:bg-default-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm font-medium text-default-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-default-300 dark:border-gray-700 rounded-lg hover:bg-default-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Delete Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Journal Entry"
        message={`Are you sure you want to delete entry "${entryToDelete?.reference_no}"? This action cannot be undone.`}
        variant="danger"
      />

      {/* Delete Error Dialog */}
      {deleteErrorData && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
            showDeleteErrorDialog ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDeleteErrorDialog(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 border border-red-200 dark:border-red-800">
            {/* Header */}
            <div className="px-6 py-4 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">
                {deleteErrorData.message}
              </h3>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-3">
              {deleteErrorData.detail && (
                <p className="text-sm text-default-700 dark:text-gray-300">
                  {deleteErrorData.detail}
                </p>
              )}

              {deleteErrorData.suggestion && (
                <p className="text-sm text-default-600 dark:text-gray-400 italic">
                  {deleteErrorData.suggestion}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/30 flex justify-end gap-3">
              {deleteErrorData.invoice_id && (
                <Button
                  onClick={handleGoToInvoice}
                  color="sky"
                  variant="filled"
                  size="md"
                >
                  Go to Invoice #{deleteErrorData.invoice_id}
                </Button>
              )}
              <Button
                onClick={() => {
                  setShowDeleteErrorDialog(false);
                  setDeleteErrorData(null);
                }}
                color="default"
                variant="outline"
                size="md"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JournalEntryListPage;

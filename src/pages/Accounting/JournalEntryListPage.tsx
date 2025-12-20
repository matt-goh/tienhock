// src/pages/Accounting/JournalEntryListPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { JournalEntry, JournalEntryTypeInfo } from "../../types/types";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  IconPlus,
  IconSearch,
  IconPencil,
  IconTrash,
  IconEye,
  IconCheck,
  IconFilter,
  IconRefresh,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { IconChevronDown } from "@tabler/icons-react";

interface JournalEntryListItem extends JournalEntry {
  entry_type_name?: string;
}

const JournalEntryListPage: React.FC = () => {
  const navigate = useNavigate();

  // Data state
  const [entries, setEntries] = useState<JournalEntryListItem[]>([]);
  const [entryTypes, setEntryTypes] = useState<JournalEntryTypeInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [dateRange, setDateRange] = useState({
    start: "",
    end: "",
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<JournalEntryListItem | null>(null);

  // Fetch entry types
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const response = await api.get("/api/journal-entries/types");
        setEntryTypes(response as JournalEntryTypeInfo[]);
      } catch (error) {
        console.error("Error fetching entry types:", error);
      }
    };
    fetchTypes();
  }, []);

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", limit.toString());
      params.append("offset", ((page - 1) * limit).toString());

      if (searchTerm) params.append("search", searchTerm);
      if (selectedType !== "All") params.append("entry_type", selectedType);
      if (selectedStatus !== "All") params.append("status", selectedStatus.toLowerCase());
      if (dateRange.start) params.append("start_date", dateRange.start);
      if (dateRange.end) params.append("end_date", dateRange.end);

      const response = await api.get(`/api/journal-entries?${params.toString()}`);
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
  }, [page, limit, searchTerm, selectedType, selectedStatus, dateRange]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedType, selectedStatus, dateRange]);

  // Handlers
  const handleCreateNew = () => {
    navigate("/accounting/journal-entries/new");
  };

  const handleView = (entry: JournalEntryListItem) => {
    navigate(`/accounting/journal-entries/${entry.id}`);
  };

  const handleEdit = (entry: JournalEntryListItem) => {
    if (entry.status !== "draft") {
      toast.error("Only draft entries can be edited");
      return;
    }
    navigate(`/accounting/journal-entries/${entry.id}`);
  };

  const handleDeleteClick = (entry: JournalEntryListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.status !== "draft") {
      toast.error("Only draft entries can be deleted");
      return;
    }
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
      const errorMessage = error instanceof Error ? error.message : "Failed to delete entry";
      toast.error(errorMessage);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedType("All");
    setSelectedStatus("All");
    setDateRange({ start: "", end: "" });
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
    const styles = {
      draft: "bg-yellow-100 text-yellow-800",
      posted: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          styles[status as keyof typeof styles] || "bg-default-100 text-default-800"
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // Pagination
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="relative w-full py-4 px-4 md:mx-6">
      {/* Header */}
      <div className="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold text-default-800">Journal Entries</h1>
          <p className="text-sm text-default-500 mt-1">
            Manage accounting journal entries
          </p>
        </div>
        <Button
          onClick={handleCreateNew}
          color="sky"
          variant="filled"
          icon={IconPlus}
          iconPosition="left"
          size="md"
        >
          New Entry
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 p-4 bg-white rounded-lg border border-default-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <IconSearch
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search reference or description..."
              className="w-full rounded-lg border border-default-300 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-default-600">Type:</span>
            <Listbox value={selectedType} onChange={setSelectedType}>
              <div className="relative w-32">
                <ListboxButton className="relative w-full cursor-pointer rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500">
                  <span className="block truncate">{selectedType}</span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <IconChevronDown size={16} className="text-gray-400" />
                  </span>
                </ListboxButton>
                <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <ListboxOption
                    value="All"
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                          All
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                            <IconCheck size={16} />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                  {entryTypes.map((type) => (
                    <ListboxOption
                      key={type.code}
                      value={type.code}
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                          active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                        }`
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                            {type.code} - {type.name}
                          </span>
                          {selected && (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                              <IconCheck size={16} />
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

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-default-600">Status:</span>
            <Listbox value={selectedStatus} onChange={setSelectedStatus}>
              <div className="relative w-32">
                <ListboxButton className="relative w-full cursor-pointer rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500">
                  <span className="block truncate">{selectedStatus}</span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <IconChevronDown size={16} className="text-gray-400" />
                  </span>
                </ListboxButton>
                <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  {["All", "Draft", "Posted", "Cancelled"].map((status) => (
                    <ListboxOption
                      key={status}
                      value={status}
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                          active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                        }`
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                            {status}
                          </span>
                          {selected && (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                              <IconCheck size={16} />
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

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-default-600">Date:</span>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              className="rounded-lg border border-default-300 py-1.5 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <span className="text-default-400">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              className="rounded-lg border border-default-300 py-1.5 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Clear Filters */}
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-sm text-default-600 hover:text-default-900"
            title="Clear filters"
          >
            <IconRefresh size={16} />
            Clear
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 flex items-center justify-between text-sm text-default-600">
        <span>
          Showing{" "}
          <span className="font-medium text-default-900">
            {entries.length}
          </span>{" "}
          of <span className="font-medium text-default-900">{total}</span> entries
        </span>
        {totalPages > 1 && (
          <span>
            Page {page} of {totalPages}
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center my-20">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-default-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-default-200">
            <thead className="bg-default-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Reference
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                  Debit
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                  Credit
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 w-28">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 bg-white">
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-default-50 cursor-pointer"
                    onClick={() => handleView(entry)}
                  >
                    <td className="px-4 py-3 text-sm font-mono font-medium text-sky-700">
                      {entry.reference_no}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-0.5 rounded bg-default-100 text-default-700 text-xs font-medium">
                        {entry.entry_type}
                      </span>
                      {entry.entry_type_name && (
                        <span className="ml-1 text-default-500 text-xs">
                          {entry.entry_type_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-600">
                      {formatDate(entry.entry_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-600 max-w-xs truncate">
                      {entry.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-default-700">
                      {formatAmount(entry.total_debit)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-default-700">
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
                            handleView(entry);
                          }}
                          className="text-default-600 hover:text-sky-600"
                          title="View"
                        >
                          <IconEye size={18} />
                        </button>
                        {entry.status === "draft" && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(entry);
                              }}
                              className="text-sky-600 hover:text-sky-800"
                              title="Edit"
                            >
                              <IconPencil size={18} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteClick(entry, e)}
                              className="text-rose-600 hover:text-rose-800"
                              title="Delete"
                            >
                              <IconTrash size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-sm text-default-500"
                  >
                    No journal entries found.{" "}
                    {(searchTerm || selectedType !== "All" || selectedStatus !== "All") && (
                      <span>Try adjusting your filters or </span>
                    )}
                    <button
                      onClick={handleCreateNew}
                      className="text-sky-600 hover:text-sky-800 font-medium"
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
            className="px-4 py-2 text-sm font-medium text-default-700 bg-white border border-default-300 rounded-lg hover:bg-default-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      : "text-default-700 bg-white border border-default-300 hover:bg-default-50"
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
            className="px-4 py-2 text-sm font-medium text-default-700 bg-white border border-default-300 rounded-lg hover:bg-default-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  );
};

export default JournalEntryListPage;

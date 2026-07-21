// src/pages/Payroll/AddOn/OthersKerjaLuarOtPage.tsx
import React, { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { format } from "date-fns";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconClockHour4,
  IconRefresh,
  IconLink,
  IconSearch,
  IconChevronDown,
  IconChevronRight,
  IconX,
  IconCheck,
  IconChevronsDown,
  IconChevronsUp,
} from "@tabler/icons-react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Transition,
} from "@headlessui/react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import TimeNavigator from "../../../components/TimeNavigator";
import AddOthersModal from "../../../components/Payroll/AddOthersModal";
import EditOthersModal from "../../../components/Payroll/EditOthersModal";
import { api } from "../../../routes/utils/api";
import { OthersRecord } from "../../../types/types";
import toast from "react-hot-toast";

const DISPLAY_LABEL = "Others (Kerja Luar OT)";

interface EmployeeGroup {
  employeeId: string;
  employeeName: string;
  recordCount: number;
  totalAmount: number;
  rows: OthersRecord[];
}

const OthersKerjaLuarOtPage: React.FC = () => {
  const getInitialYear = (): number => {
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get("year");
    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (!isNaN(year) && year >= 2000 && year <= 2100) return year;
    }
    return new Date().getFullYear();
  };

  const getInitialMonth = (): number => {
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get("month");
    if (monthParam) {
      const month = parseInt(monthParam, 10);
      if (!isNaN(month) && month >= 1 && month <= 12) return month;
    }
    return new Date().getMonth() + 1;
  };

  const getInitialSearch = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  };

  const [records, setRecords] = useState<OthersRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<OthersRecord | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [currentYear, setCurrentYear] = useState(getInitialYear);
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);

  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>("");
  const [filterPayCode, setFilterPayCode] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>(getInitialSearch);
  const [employeeQuery, setEmployeeQuery] = useState<string>("");
  const [payCodeQuery, setPayCodeQuery] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Group expansion
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(
    new Set(),
  );

  // Month range for the TimeNavigator (the page always targets one month).
  const monthRange = useMemo(
    () => ({
      start: new Date(currentYear, currentMonth - 1, 1),
      end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999),
    }),
    [currentYear, currentMonth],
  );

  const handleTimeNavigatorChange = (range: { start: Date; end: Date }) => {
    setCurrentYear(range.start.getFullYear());
    setCurrentMonth(range.start.getMonth() + 1);
  };

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("year", currentYear.toString());
    params.set("month", currentMonth.toString());
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [currentYear, currentMonth]);

  useEffect(() => {
    fetchRecords();
  }, [currentYear, currentMonth]);

  const fetchRecords = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const url = `/api/others-records?year=${currentYear}&month=${currentMonth}`;
      const response = await api.get(url);
      setRecords(response || []);
    } catch (error) {
      console.error("Error fetching others records:", error);
      toast.error(`Failed to load ${DISPLAY_LABEL}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (record: OthersRecord): void => {
    setEditingRecord(record);
    setShowEditModal(true);
  };

  const handleDelete = async (): Promise<void> => {
    if (!deletingId) return;
    try {
      await api.delete(`/api/others-records/${deletingId}`);
      toast.success(`${DISPLAY_LABEL} record deleted successfully`);
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchRecords();
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error(`Failed to delete ${DISPLAY_LABEL}`);
    }
  };

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);

  const linkedGroupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) {
      if (r.link_id) counts[r.link_id] = (counts[r.link_id] || 0) + 1;
    }
    return counts;
  }, [records]);

  // Distinct employees and pay codes from the loaded month for the filter dropdowns.
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, r.employee_name || r.employee_id);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const payCodeOptions = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of records) {
      const pcId = r.pay_code_id || "";
      if (!pcId) continue;
      if (!map.has(pcId)) {
        map.set(pcId, r.pay_code_description || null);
      }
    }
    return Array.from(map.entries())
      .map(([id, desc]) => ({ id, description: desc }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [records]);

  const filteredEmployeeOptions = useMemo(() => {
    if (!employeeQuery) return employeeOptions;
    const q = employeeQuery.toLowerCase();
    return employeeOptions.filter(
      (e) =>
        e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
    );
  }, [employeeOptions, employeeQuery]);

  const filteredPayCodeOptions = useMemo(() => {
    if (!payCodeQuery) return payCodeOptions;
    const q = payCodeQuery.toLowerCase();
    return payCodeOptions.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q),
    );
  }, [payCodeOptions, payCodeQuery]);

  // Apply filters. The search box is universal — it matches against employee
  // name/ID, pay code id/description, date (both ISO and "dd MMM yyyy"
  // formatted), description text, and amount (raw and formatted currency).
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (filterEmployee && r.employee_id !== filterEmployee) return false;
      if (filterPayCode && (r.pay_code_id || "") !== filterPayCode) return false;
      if (q) {
        const dateFormatted = (() => {
          try {
            return format(new Date(r.record_date), "dd MMM yyyy");
          } catch {
            return "";
          }
        })();
        const dateIso = r.record_date
          ? format(new Date(r.record_date), "yyyy-MM-dd")
          : "";
        const amount = Number(r.amount) || 0;
        const haystack = [
          r.employee_name || "",
          r.employee_id || "",
          r.pay_code_id || "",
          r.pay_code_description || "",
          r.description || "",
          dateFormatted,
          dateIso,
          amount.toString(),
          amount.toFixed(2),
          formatCurrency(amount),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [records, filterEmployee, filterPayCode, searchQuery]);

  // Group filtered records by employee.
  const grouped: EmployeeGroup[] = useMemo(() => {
    const byEmployee = new Map<string, EmployeeGroup>();
    for (const r of filteredRecords) {
      const existing = byEmployee.get(r.employee_id);
      if (existing) {
        existing.rows.push(r);
        existing.recordCount += 1;
        existing.totalAmount += Number(r.amount) || 0;
      } else {
        byEmployee.set(r.employee_id, {
          employeeId: r.employee_id,
          employeeName: r.employee_name || r.employee_id,
          recordCount: 1,
          totalAmount: Number(r.amount) || 0,
          rows: [r],
        });
      }
    }
    const list = Array.from(byEmployee.values());
    list.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    for (const g of list) {
      g.rows.sort((a, b) => {
        const da = new Date(a.record_date).getTime();
        const db = new Date(b.record_date).getTime();
        if (da !== db) return da - db;
        return a.id - b.id;
      });
    }
    return list;
  }, [filteredRecords]);

  const filteredTotalAmount = useMemo(
    () => filteredRecords.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [filteredRecords],
  );

  // Default to all groups expanded whenever new records are loaded (initial fetch,
  // month change, refresh, post-save). User can still collapse individual groups;
  // those manual collapses persist only until the next records refresh.
  useEffect(() => {
    const allIds = new Set<string>();
    for (const r of records) allIds.add(r.employee_id);
    setExpandedEmployees(allIds);
  }, [records]);

  const toggleEmployee = (employeeId: string): void => {
    setExpandedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const expandAll = (): void => {
    setExpandedEmployees(new Set(grouped.map((g) => g.employeeId)));
  };
  const collapseAll = (): void => setExpandedEmployees(new Set());

  const hasActiveFilter =
    filterEmployee !== "" ||
    filterPayCode !== "" ||
    searchQuery.trim() !== "";

  const clearFilters = (): void => {
    setFilterEmployee("");
    setFilterPayCode("");
    setSearchQuery("");
    setEmployeeQuery("");
    setPayCodeQuery("");
  };

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;

      const tagName = target.tagName.toLowerCase();
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      );
    };

    const handleSearchTypingShortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        !searchInputRef.current ||
        showAddModal ||
        showEditModal ||
        showDeleteDialog ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current.focus();
      setSearchQuery((prev: string) => `${prev}${event.key}`);
    };

    document.addEventListener("keydown", handleSearchTypingShortcut);
    return () => {
      document.removeEventListener("keydown", handleSearchTypingShortcut);
    };
  }, [showAddModal, showEditModal, showDeleteDialog]);

  const deletingRecord = useMemo(
    () => records.find((r) => r.id === deletingId) || null,
    [records, deletingId],
  );
  const deletingLinkedCount = deletingRecord?.link_id
    ? linkedGroupCounts[deletingRecord.link_id] || 1
    : 1;
  const deletingLinkedDates = useMemo(() => {
    if (!deletingRecord?.link_id) return [];
    return records
      .filter((r) => r.link_id === deletingRecord.link_id)
      .map((r) => format(new Date(r.record_date), "d MMM"))
      .sort();
  }, [records, deletingRecord]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          {DISPLAY_LABEL}
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchRecords}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            icon={IconPlus}
            color="sky"
            variant="filled"
          >
            Add {DISPLAY_LABEL}
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4 transition-shadow duration-200 hover:shadow-md dark:hover:shadow-black/20 space-y-3">
        {/* Row 1: Month/Year navigators + summary */}
        <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
          <div className="flex gap-4 items-end">
            <TimeNavigator
              range={monthRange}
              onChange={handleTimeNavigatorChange}
              modes={["month"]}
              presets={false}
            />
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-3 md:w-auto">
            <div className="relative w-full sm:w-80">
              <IconSearch
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, pay code, date, amount, description..."
                className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 py-1.5 pl-8 pr-8 text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:bg-default-100 dark:text-gray-500 dark:hover:bg-gray-700"
                  title="Clear search"
                >
                  <IconX size={13} />
                </button>
              )}
            </div>
            <div className="hidden h-6 w-px bg-default-300 dark:bg-gray-600 sm:block" />
            <div className="text-right text-sm text-default-600 dark:text-gray-300">
              <div>
              <span className="font-medium text-default-800 dark:text-gray-100">
                {filteredRecords.length}
              </span>
              {filteredRecords.length !== records.length && (
                <span> of {records.length}</span>
              )}{" "}
              records ·{" "}
              <span className="font-medium text-default-800 dark:text-gray-100">
                {formatCurrency(filteredTotalAmount)}
              </span>
            </div>
          </div>
          </div>
        </div>

        {/* Row 2: Compact filters + expand/collapse */}
        <div className="flex flex-wrap gap-2 items-center pt-3 border-t border-default-200 dark:border-gray-700">
          {/* Employee filter */}
          <div className="w-56">
            <Combobox
              value={filterEmployee}
              onChange={(v: string | null) => setFilterEmployee(v || "")}
            >
              <div className="relative">
                <ComboboxInput
                  className="w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 pl-3 pr-9 text-left text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  displayValue={(empId: string) => {
                    if (!empId) return "";
                    const sel = employeeOptions.find((e) => e.id === empId);
                    return sel ? `${sel.name} (${sel.id})` : empId;
                  }}
                  onChange={(e) => setEmployeeQuery(e.target.value)}
                  placeholder="All employees"
                />
                <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <IconChevronDown
                    size={16}
                    className="text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                  />
                </ComboboxButton>
              </div>
              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
                afterLeave={() => setEmployeeQuery("")}
              >
                <ComboboxOptions
                  anchor={{ to: "bottom start", gap: 4 }}
                  className="z-50 max-h-60 w-[280px] overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 dark:ring-gray-700 focus:outline-none"
                >
                  <ComboboxOption
                    value=""
                    className={({ active }) =>
                      `relative cursor-default select-none py-2 pl-10 pr-4 ${
                        active
                          ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200"
                          : "text-gray-900 dark:text-gray-100"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={selected ? "font-medium" : "font-normal"}>
                          All employees
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-300">
                            <IconCheck size={18} />
                          </span>
                        )}
                      </>
                    )}
                  </ComboboxOption>
                  {filteredEmployeeOptions.length === 0 ? (
                    <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                      No employees in this month.
                    </div>
                  ) : (
                    filteredEmployeeOptions.map((e) => (
                      <ComboboxOption
                        key={e.id}
                        value={e.id}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-10 pr-4 ${
                            active
                              ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200"
                              : "text-gray-900 dark:text-gray-100"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? "font-medium" : "font-normal"}`}>
                              {e.name} ({e.id})
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-300">
                                <IconCheck size={18} />
                              </span>
                            )}
                          </>
                        )}
                      </ComboboxOption>
                    ))
                  )}
                </ComboboxOptions>
              </Transition>
            </Combobox>
          </div>

          {/* Pay code filter */}
          <div className="w-56">
            <Combobox
              value={filterPayCode}
              onChange={(v: string | null) => setFilterPayCode(v || "")}
            >
              <div className="relative">
                <ComboboxInput
                  className="w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 pl-3 pr-9 text-left text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  displayValue={(code: string) => {
                    if (!code) return "";
                    const sel = payCodeOptions.find((p) => p.id === code);
                    return sel
                      ? sel.description
                        ? `${sel.id} — ${sel.description}`
                        : sel.id
                      : code;
                  }}
                  onChange={(e) => setPayCodeQuery(e.target.value)}
                  placeholder="All pay codes"
                />
                <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <IconChevronDown
                    size={16}
                    className="text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                  />
                </ComboboxButton>
              </div>
              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
                afterLeave={() => setPayCodeQuery("")}
              >
                <ComboboxOptions
                  anchor={{ to: "bottom start", gap: 4 }}
                  className="z-50 max-h-60 w-[320px] overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 dark:ring-gray-700 focus:outline-none"
                >
                  <ComboboxOption
                    value=""
                    className={({ active }) =>
                      `relative cursor-default select-none py-2 pl-10 pr-4 ${
                        active
                          ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200"
                          : "text-gray-900 dark:text-gray-100"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={selected ? "font-medium" : "font-normal"}>
                          All pay codes
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-300">
                            <IconCheck size={18} />
                          </span>
                        )}
                      </>
                    )}
                  </ComboboxOption>
                  {filteredPayCodeOptions.length === 0 ? (
                    <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                      No pay codes in this month.
                    </div>
                  ) : (
                    filteredPayCodeOptions.map((p) => (
                      <ComboboxOption
                        key={p.id}
                        value={p.id}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-10 pr-4 ${
                            active
                              ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200"
                              : "text-gray-900 dark:text-gray-100"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? "font-medium" : "font-normal"}`}>
                              {p.id}
                              {p.description ? ` — ${p.description}` : ""}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-300">
                                <IconCheck size={18} />
                              </span>
                            )}
                          </>
                        )}
                      </ComboboxOption>
                    ))
                  )}
                </ComboboxOptions>
              </Transition>
            </Combobox>
          </div>

          {/* Clear all filters */}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-default-700 dark:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700"
              title="Clear all filters"
            >
              <IconX size={14} />
              Clear
            </button>
          )}

          {/* Spacer + expand/collapse buttons */}
          {grouped.length > 0 && (
            <div className="ml-auto flex items-center gap-1 text-sm">
              <button
                type="button"
                onClick={expandAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-default-600 hover:bg-default-100 dark:text-gray-300 dark:hover:bg-gray-700"
                title="Expand all groups"
              >
                <IconChevronsDown size={16} />
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-default-600 hover:bg-default-100 dark:text-gray-300 dark:hover:bg-gray-700"
                title="Collapse all groups"
              >
                <IconChevronsUp size={16} />
                Collapse all
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm transition-shadow duration-200 hover:shadow-md dark:hover:shadow-black/20 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconClockHour4 className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">
              No {DISPLAY_LABEL} records found
            </p>
            <p>Click &quot;Add {DISPLAY_LABEL}&quot; to create records</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconSearch className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">
              No records match the current filters
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 inline-flex items-center gap-1 rounded-md bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-600 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50"
            >
              <IconX size={14} />
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Employee / Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Pay Code
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800">
                {grouped.map((group) => {
                  const isExpanded = expandedEmployees.has(group.employeeId);
                  return (
                    <Fragment key={group.employeeId}>
                      <tr
                        className="bg-default-50/70 dark:bg-gray-900/40 cursor-pointer hover:bg-default-100 dark:hover:bg-gray-700/50 transition-colors duration-150"
                        onClick={() => toggleEmployee(group.employeeId)}
                      >
                        <td className="px-4 py-2 align-middle">
                          {isExpanded ? (
                            <IconChevronDown
                              size={16}
                              className="text-default-500 dark:text-gray-400"
                            />
                          ) : (
                            <IconChevronRight
                              size={16}
                              className="text-default-500 dark:text-gray-400"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                          {group.employeeName}{" "}
                          <span className="text-default-500 dark:text-gray-400 font-normal">
                            ({group.employeeId})
                          </span>
                        </td>
                        <td
                          className="px-4 py-2 text-xs text-default-500 dark:text-gray-400"
                          colSpan={2}
                        >
                          {group.recordCount} record
                          {group.recordCount === 1 ? "" : "s"}
                        </td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-semibold text-default-900 dark:text-gray-100">
                          {formatCurrency(group.totalAmount)}
                        </td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2"></td>
                      </tr>
                      {isExpanded &&
                        group.rows.map((record) => (
                          <tr
                            key={record.id}
                            className="group transition-colors duration-150 hover:bg-sky-50/60 dark:hover:bg-sky-900/20 border-t border-default-100 dark:border-gray-700/70"
                          >
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 dark:text-gray-300 pl-8">
                              <div className="flex items-center gap-2">
                                <span>
                                  {format(
                                    new Date(record.record_date),
                                    "dd MMM yyyy",
                                  )}
                                </span>
                                {record.link_id && (
                                  <span
                                    className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                                    title={`Linked across ${
                                      linkedGroupCounts[record.link_id] || 1
                                    } dates — edits and deletes apply to the whole group`}
                                  >
                                    <IconLink size={11} />
                                    {linkedGroupCounts[record.link_id] || 1}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                              {record.pay_code_id || "-"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-default-700 dark:text-gray-300">
                              {Number(record.rate).toFixed(2)}{" "}
                              <span className="text-xs text-default-400 dark:text-gray-500">
                                /{record.rate_unit}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-default-700 dark:text-gray-300">
                              {Number(record.quantity)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                              {formatCurrency(Number(record.amount))}
                            </td>
                            <td className="px-4 py-3 text-sm text-default-900 dark:text-gray-100">
                              {record.description}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end space-x-3">
                                <button
                                  onClick={() => handleEdit(record)}
                                  className="p-1.5 rounded-full text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors duration-150"
                                  title="Edit"
                                >
                                  <IconEdit size={18} />
                                </button>
                                <button
                                  onClick={() => {
                                    setDeletingId(record.id);
                                    setShowDeleteDialog(true);
                                  }}
                                  className="p-1.5 rounded-full text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors duration-150"
                                  title="Delete"
                                >
                                  <IconTrash size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddOthersModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchRecords}
          currentYear={currentYear}
          currentMonth={currentMonth}
          displayLabel={DISPLAY_LABEL}
        />
      )}

      <EditOthersModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingRecord(null);
        }}
        onSuccess={fetchRecords}
        record={editingRecord}
        displayLabel={DISPLAY_LABEL}
      />

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDelete}
        title={
          deletingLinkedCount > 1
            ? `Delete ${deletingLinkedCount} linked ${DISPLAY_LABEL} records`
            : `Delete ${DISPLAY_LABEL}`
        }
        message={
          deletingLinkedCount > 1
            ? `This record is linked across ${deletingLinkedCount} dates (${deletingLinkedDates.join(
                ", ",
              )}). Deleting will remove all ${deletingLinkedCount} linked records. This action cannot be undone.`
            : `Are you sure you want to delete this ${DISPLAY_LABEL} record? This action cannot be undone.`
        }
        confirmButtonText={
          deletingLinkedCount > 1 ? `Delete all ${deletingLinkedCount}` : "Delete"
        }
        variant="danger"
      />
    </div>
  );
};

export default OthersKerjaLuarOtPage;

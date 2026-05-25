import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconDeviceFloppy,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import DateNavigator from "../../../components/DateNavigator";
import { FormListbox } from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";

type PackingJobType = "MEE_PACKING" | "BH_PACKING";
type LeaveType = "cuti_umum" | "cuti_sakit" | "cuti_tahunan" | "cuti_rawatan";

interface PackingCutiEntryPageProps {
  jobType: PackingJobType;
}

interface PackingWorker {
  id: string;
  name: string;
  job: string[];
}

interface PackingCutiRecord {
  id: number;
  employee_id: string;
  leave_type: LeaveType;
  amount_paid: number;
}

interface LeaveBalanceResponse {
  balance: {
    cuti_tahunan_total: number;
    cuti_sakit_total: number;
    cuti_umum_total: number;
    cuti_rawatan_total: number;
  };
  taken: Partial<Record<LeaveType, number>>;
}

interface LeaveBalance {
  cuti_tahunan_total: number;
  cuti_sakit_total: number;
  cuti_umum_total: number;
  cuti_rawatan_total: number;
  cuti_tahunan_taken: number;
  cuti_sakit_taken: number;
  cuti_umum_taken: number;
  cuti_rawatan_taken: number;
}

interface RowState {
  selected: boolean;
  leaveType: LeaveType;
  amountPaid: string;
}

const LEAVE_OPTIONS: Array<{ id: LeaveType; name: string }> = [
  { id: "cuti_sakit", name: "Cuti Sakit" },
  { id: "cuti_tahunan", name: "Cuti Tahunan" },
  { id: "cuti_umum", name: "Cuti Umum" },
  { id: "cuti_rawatan", name: "Cuti Rawatan" },
];

const DEFAULT_LEAVE_TYPE: LeaveType = "cuti_sakit";
const DEFAULT_AMOUNT_PAID: string = "50";
const DEFAULT_ROW_STATE: RowState = {
  selected: false,
  leaveType: DEFAULT_LEAVE_TYPE,
  amountPaid: DEFAULT_AMOUNT_PAID,
};

const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isValidDateString = (dateStr: string | null): dateStr is string => {
  return Boolean(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr));
};

const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const getLeaveTypeTotal = (
  balance: LeaveBalance,
  leaveType: LeaveType,
): number => {
  switch (leaveType) {
    case "cuti_tahunan":
      return balance.cuti_tahunan_total;
    case "cuti_sakit":
      return balance.cuti_sakit_total;
    case "cuti_umum":
      return balance.cuti_umum_total;
    case "cuti_rawatan":
      return balance.cuti_rawatan_total;
    default:
      return 0;
  }
};

const getLeaveTypeTaken = (
  balance: LeaveBalance,
  leaveType: LeaveType,
): number => {
  switch (leaveType) {
    case "cuti_tahunan":
      return balance.cuti_tahunan_taken;
    case "cuti_sakit":
      return balance.cuti_sakit_taken;
    case "cuti_umum":
      return balance.cuti_umum_taken;
    case "cuti_rawatan":
      return balance.cuti_rawatan_taken;
    default:
      return 0;
  }
};

const isInteractiveClickTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button,input,textarea,select,a,[role='button'],[role='listbox'],[role='option']",
    ),
  );
};

const PackingCutiEntryPage: React.FC<PackingCutiEntryPageProps> = ({
  jobType,
}) => {
  const [searchParams] = useSearchParams();
  const queryDateParam: string | null = searchParams.get("date");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return isValidDateString(queryDateParam)
      ? queryDateParam
      : formatDateLocal(new Date());
  });
  const [workers, setWorkers] = useState<PackingWorker[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [originalRowState, setOriginalRowState] = useState<
    Record<string, RowState>
  >({});
  const [leaveBalances, setLeaveBalances] = useState<
    Record<string, LeaveBalance>
  >({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [bulkLeaveType, setBulkLeaveType] =
    useState<LeaveType>(DEFAULT_LEAVE_TYPE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const pageTitle =
    jobType === "MEE_PACKING" ? "MEE Packing Cuti" : "Bihun Packing Cuti";
  const pageSubtitle =
    jobType === "MEE_PACKING" ? "Packing Mee" : "Packing Bihun";

  useEffect(() => {
    if (isValidDateString(queryDateParam)) {
      setSelectedDate(queryDateParam);
    }
  }, [queryDateParam]);

  const fetchData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        job_type: jobType,
        date: selectedDate,
      });
      const response = await api.get(
        `/api/leave-management/packing-cuti?${query.toString()}`,
      );
      const fetchedWorkers = response.workers as PackingWorker[];
      const fetchedEntries = response.entries as PackingCutiRecord[];
      const entriesByEmployee = new Map<string, PackingCutiRecord>(
        fetchedEntries.map((entry) => [entry.employee_id, entry]),
      );

      const nextRowState = fetchedWorkers.reduce<Record<string, RowState>>(
        (acc, worker) => {
          const existingEntry = entriesByEmployee.get(worker.id);
          acc[worker.id] = {
            selected: Boolean(existingEntry),
            leaveType: existingEntry?.leave_type || DEFAULT_LEAVE_TYPE,
            amountPaid: existingEntry
              ? String(Number(existingEntry.amount_paid))
              : DEFAULT_AMOUNT_PAID,
          };
          return acc;
        },
        {},
      );

      setWorkers(fetchedWorkers);
      setRowState(nextRowState);
      setOriginalRowState(nextRowState);

      if (fetchedWorkers.length > 0) {
        const year = parseLocalDate(selectedDate).getFullYear();
        const employeeIds = fetchedWorkers.map((worker) => worker.id).join(",");
        const balanceResponse = await api.get(
          `/api/leave-management/balances/batch?employeeIds=${employeeIds}&year=${year}`,
        );
        const normalizedBalances = Object.entries(
          balanceResponse as Record<string, LeaveBalanceResponse>,
        ).reduce<Record<string, LeaveBalance>>((acc, [employeeId, value]) => {
          acc[employeeId] = {
            cuti_tahunan_total: Number(value.balance.cuti_tahunan_total || 0),
            cuti_sakit_total: Number(value.balance.cuti_sakit_total || 0),
            cuti_umum_total: Number(value.balance.cuti_umum_total || 0),
            cuti_rawatan_total: Number(value.balance.cuti_rawatan_total || 0),
            cuti_tahunan_taken: Number(value.taken.cuti_tahunan || 0),
            cuti_sakit_taken: Number(value.taken.cuti_sakit || 0),
            cuti_umum_taken: Number(value.taken.cuti_umum || 0),
            cuti_rawatan_taken: Number(value.taken.cuti_rawatan || 0),
          };
          return acc;
        }, {});
        setLeaveBalances(normalizedBalances);
      } else {
        setLeaveBalances({});
      }
    } catch (error) {
      console.error("Error loading packing cuti entries:", error);
      toast.error("Failed to load packing cuti entries");
    } finally {
      setIsLoading(false);
    }
  }, [jobType, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredWorkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return workers;
    return workers.filter(
      (worker) =>
        worker.name.toLowerCase().includes(query) ||
        worker.id.toLowerCase().includes(query),
    );
  }, [searchQuery, workers]);

  const selectedRows = useMemo(
    () => workers.filter((worker) => rowState[worker.id]?.selected),
    [rowState, workers],
  );

  const selectedTotal = useMemo(
    () =>
      selectedRows.reduce((sum, worker) => {
        const amount = Number(rowState[worker.id]?.amountPaid || 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [rowState, selectedRows],
  );

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(rowState) !== JSON.stringify(originalRowState),
    [originalRowState, rowState],
  );

  const allFilteredSelected =
    filteredWorkers.length > 0 &&
    filteredWorkers.every((worker) => rowState[worker.id]?.selected);

  const handleDateChange = (date: Date): void => {
    setSelectedDate(formatDateLocal(date));
  };

  const updateRow = (employeeId: string, next: Partial<RowState>): void => {
    setRowState((prev) => ({
      ...prev,
      [employeeId]: {
        ...DEFAULT_ROW_STATE,
        ...prev[employeeId],
        ...next,
      },
    }));
  };

  const handleToggleWorker = (employeeId: string, selected: boolean): void => {
    updateRow(employeeId, { selected });
  };

  const handleRowClick = (
    employeeId: string,
    isSelected: boolean,
    event: React.MouseEvent<HTMLTableRowElement>,
  ): void => {
    if (isSaving || isInteractiveClickTarget(event.target)) return;
    handleToggleWorker(employeeId, !isSelected);
  };

  const handleLeaveTypeChange = (
    employeeId: string,
    leaveType: LeaveType,
  ): void => {
    updateRow(employeeId, { leaveType, selected: true });
  };

  const handleAmountChange = (
    employeeId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    updateRow(employeeId, {
      amountPaid: event.target.value,
      selected: true,
    });
  };

  const handleToggleFiltered = (): void => {
    const nextSelected = !allFilteredSelected;
    setRowState((prev) => {
      const next = { ...prev };
      filteredWorkers.forEach((worker) => {
        next[worker.id] = {
          selected: nextSelected,
          leaveType: prev[worker.id]?.leaveType || DEFAULT_LEAVE_TYPE,
          amountPaid: prev[worker.id]?.amountPaid || DEFAULT_AMOUNT_PAID,
        };
      });
      return next;
    });
  };

  const handleApplyBulkLeaveType = (): void => {
    setRowState((prev) => {
      const next = { ...prev };
      selectedRows.forEach((worker) => {
        next[worker.id] = {
          selected: true,
          leaveType: bulkLeaveType,
          amountPaid: prev[worker.id]?.amountPaid || DEFAULT_AMOUNT_PAID,
        };
      });
      return next;
    });
  };

  const handleReset = (): void => {
    setRowState(originalRowState);
  };

  const handleSave = async (): Promise<void> => {
    const payloadEntries = selectedRows.map((worker) => {
      const state = rowState[worker.id];
      const amountPaid = Number(state.amountPaid || 0);
      return {
        employee_id: worker.id,
        leave_type: state.leaveType,
        amount_paid: Number.isFinite(amountPaid)
          ? Math.round(amountPaid * 100) / 100
          : NaN,
      };
    });

    const invalidEntry = payloadEntries.find(
      (entry) => !Number.isFinite(entry.amount_paid) || entry.amount_paid < 0,
    );
    if (invalidEntry) {
      toast.error(`Invalid amount for ${invalidEntry.employee_id}`);
      return;
    }

    setIsSaving(true);
    try {
      await api.post("/api/leave-management/packing-cuti/batch", {
        job_type: jobType,
        date: selectedDate,
        entries: payloadEntries,
      });
      toast.success("Packing cuti saved");
      await fetchData();
    } catch (error) {
      console.error("Error saving packing cuti:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const renderBalance = (employeeId: string, leaveType: LeaveType): string => {
    const balance = leaveBalances[employeeId];
    if (!balance) return "-";
    const total = getLeaveTypeTotal(balance, leaveType);
    const taken = getLeaveTypeTaken(balance, leaveType);
    const remaining = Math.max(0, total - taken);
    return `${remaining}/${total}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            {pageTitle}
          </h1>
          <p className="mt-1 text-sm text-default-600 dark:text-gray-300">
            {pageSubtitle}
          </p>
        </div>
        <div className="w-full md:w-80">
          <DateNavigator
            selectedDate={parseLocalDate(selectedDate)}
            onChange={handleDateChange}
            allowFutureDates
          />
        </div>
      </div>

      <div className="rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 border-b border-default-200 p-4 dark:border-gray-700 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <IconSearch
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400"
              />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search workers"
                className="h-10 w-full rounded-lg border border-default-300 bg-white pl-10 pr-9 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-default-400 hover:bg-default-100 dark:hover:bg-gray-600"
                >
                  <IconX size={16} />
                </button>
              )}
            </div>

            <FormListbox
              name="bulk-leave-type"
              value={bulkLeaveType}
              onChange={(value: string) => setBulkLeaveType(value as LeaveType)}
              options={LEAVE_OPTIONS}
              disabled={isSaving}
              className="w-full sm:w-48"
            />

            <Button
              size="sm"
              variant="outline"
              onClick={handleApplyBulkLeaveType}
              disabled={selectedRows.length === 0 || isSaving}
            >
              Apply
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-default-600 dark:text-gray-300">
              <span className="font-medium text-default-900 dark:text-gray-100">
                {selectedRows.length}
              </span>{" "}
              selected /{" "}
              <span className="font-medium text-default-900 dark:text-gray-100">
                {formatCurrency(selectedTotal)}
              </span>
            </div>
            <Button
              icon={IconRefresh}
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={!hasUnsavedChanges || isSaving}
            >
              Reset
            </Button>
            <Button
              icon={IconDeviceFloppy}
              size="sm"
              color="sky"
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-50 dark:bg-gray-900/50">
              <tr>
                <th className="w-14 px-4 py-3 text-left align-middle">
                  <Checkbox
                    checked={allFilteredSelected}
                    onChange={() => handleToggleFiltered()}
                    disabled={filteredWorkers.length === 0 || isSaving}
                    ariaLabel="Select filtered workers"
                    className="translate-y-0.5"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                  Worker
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                  Leave Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                  Balance
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                  >
                    No workers found
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((worker) => {
                  const state = rowState[worker.id] || {
                    selected: false,
                    leaveType: DEFAULT_LEAVE_TYPE,
                    amountPaid: DEFAULT_AMOUNT_PAID,
                  };

                  return (
                    <tr
                      key={worker.id}
                      onClick={(event) =>
                        handleRowClick(worker.id, state.selected, event)
                      }
                      className={
                        state.selected
                          ? "cursor-pointer bg-amber-50/60 dark:bg-amber-900/20"
                          : "cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/40"
                      }
                    >
                      <td
                        className="px-4 py-2 align-middle"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={state.selected}
                          onChange={(checked) =>
                            handleToggleWorker(worker.id, checked)
                          }
                          disabled={isSaving}
                          checkedColor="text-amber-600 dark:text-amber-400"
                          ariaLabel={`Select ${worker.name}`}
                          className="translate-y-0.5"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-default-900 dark:text-gray-100">
                          {worker.name}
                        </div>
                        <div className="text-xs text-default-500 dark:text-gray-400">
                          {worker.id}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <FormListbox
                          name={`leave-type-${worker.id}`}
                          value={state.leaveType}
                          onChange={(value: string) =>
                            handleLeaveTypeChange(worker.id, value as LeaveType)
                          }
                          options={LEAVE_OPTIONS}
                          disabled={isSaving}
                          className="w-44"
                        />
                      </td>
                      <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
                        {renderBalance(worker.id, state.leaveType)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={state.amountPaid}
                          onChange={(event) =>
                            handleAmountChange(worker.id, event)
                          }
                          onFocus={(event) => event.target.select()}
                          disabled={isSaving}
                          placeholder="0.00"
                          className="h-9 w-28 rounded-lg border border-default-300 bg-white px-3 text-right text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-default-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:disabled:bg-gray-700/60"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PackingCutiEntryPage;

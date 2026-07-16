// src/pages/JellyPolly/Payroll/JPLeaveSection.tsx
// "Leave & Absence Recording" section for JP daily card-style payroll entry
// pages. Records go into jellypolly.leave_records (the JP-owned ledger) for the
// day the page is showing; the JP payroll processor pays amount_paid into gross
// and excludes that day's work items, so nothing else needs wiring.
//
// Cuti Umum is only offered on a public holiday, matching the other JP entry
// pages.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  IconCalendar,
  IconCalendarEvent,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import { FormListbox } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";

// Parse a yyyy-MM-dd string into a local-timezone Date (never via toISOString).
const parseYmd = (value: string): Date => new Date(`${value}T00:00:00`);

export type JPLeaveType =
  | "cuti_tahunan"
  | "cuti_sakit"
  | "cuti_umum"
  | "cuti_rawatan";

const JP_LEAVE_TYPES: { value: JPLeaveType; label: string }[] = [
  { value: "cuti_tahunan", label: "Cuti Tahunan" },
  { value: "cuti_sakit", label: "Cuti Sakit" },
  { value: "cuti_umum", label: "Cuti Umum" },
  { value: "cuti_rawatan", label: "Cuti Rawatan" },
];

export const getJPLeaveTypeLabel = (type: string): string =>
  JP_LEAVE_TYPES.find((leaveType) => leaveType.value === type)?.label || type;

interface JPLeaveBalance {
  cuti_tahunan_total: number;
  cuti_sakit_total: number;
  cuti_umum_total: number;
  cuti_rawatan_total: number;
  cuti_tahunan_taken: number;
  cuti_sakit_taken: number;
  cuti_umum_taken: number;
  cuti_rawatan_taken: number;
}

interface JPLeaveEntry {
  id?: number; // present for saved records
  employeeId: string;
  employeeName: string;
  leaveDate: string; // yyyy-MM-dd
  leaveType: JPLeaveType;
  amountPaid: number;
}

interface ApiLeaveRecord {
  id: number;
  employee_id: string;
  employee_name?: string | null;
  leave_date: string;
  leave_type: JPLeaveType;
  amount_paid: number | string | null;
}

interface JPLeaveSectionProps {
  employees: { id: string; name: string }[];
  year: number;
  /** Locks new leave to this date (yyyy-MM-dd) — the day the page is showing */
  fixedDate: string;
  /** Day type of `fixedDate`; Cuti Umum is only selectable on "Umum" */
  dayType: "Biasa" | "Ahad" | "Umum";
  /** GET url returning the section's saved leave records */
  loadEndpoint: string;
  /** POST url for the section's Save button */
  saveEndpoint: string;
  disabled?: boolean;
  /** Called after a successful save */
  onSaved?: () => void;
}

const getRemaining = (
  balance: JPLeaveBalance | undefined,
  type: JPLeaveType
): { remaining: number; taken: number; total: number } => {
  if (!balance) return { remaining: 0, taken: 0, total: 0 };
  let total: number = 0;
  let taken: number = 0;
  switch (type) {
    case "cuti_tahunan":
      total = balance.cuti_tahunan_total;
      taken = balance.cuti_tahunan_taken;
      break;
    case "cuti_sakit":
      total = balance.cuti_sakit_total;
      taken = balance.cuti_sakit_taken;
      break;
    case "cuti_umum":
      total = balance.cuti_umum_total;
      taken = balance.cuti_umum_taken;
      break;
    case "cuti_rawatan":
      total = balance.cuti_rawatan_total;
      taken = balance.cuti_rawatan_taken;
      break;
  }
  return { remaining: total - taken, taken, total };
};

const JPLeaveSection: React.FC<JPLeaveSectionProps> = ({
  employees,
  year,
  fixedDate,
  dayType,
  loadEndpoint,
  saveEndpoint,
  disabled = false,
  onSaved,
}) => {
  const [existingLeave, setExistingLeave] = useState<JPLeaveEntry[]>([]);
  const [newLeave, setNewLeave] = useState<JPLeaveEntry[]>([]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [updatedAmounts, setUpdatedAmounts] = useState<Record<number, number>>(
    {}
  );
  const [balances, setBalances] = useState<Record<string, JPLeaveBalance>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const [formLeaveType, setFormLeaveType] = useState<JPLeaveType>("cuti_sakit");
  const [formAmount, setFormAmount] = useState<string>("");

  const employeeIdsKey: string = employees
    .map((employee) => employee.id)
    .join(",");

  // Cuti Umum only exists on a public holiday (matches the other JP entry pages)
  const leaveTypeOptions = useMemo<{ value: JPLeaveType; label: string }[]>(
    () =>
      JP_LEAVE_TYPES.filter(
        (leaveType) => leaveType.value !== "cuti_umum" || dayType === "Umum"
      ),
    [dayType]
  );

  const loadLeave = useCallback(async (): Promise<void> => {
    try {
      const rows: ApiLeaveRecord[] = await api.get(loadEndpoint);
      setExistingLeave(
        (rows || []).map(
          (row: ApiLeaveRecord): JPLeaveEntry => ({
            id: row.id,
            employeeId: row.employee_id,
            employeeName: row.employee_name || "",
            leaveDate: format(new Date(row.leave_date), "yyyy-MM-dd"),
            leaveType: row.leave_type,
            amountPaid: Number(row.amount_paid) || 0,
          })
        )
      );
      setNewLeave([]);
      setDeletedIds([]);
      setUpdatedAmounts({});
    } catch (error: unknown) {
      console.error("Error loading JP leave records:", error);
      toast.error("Failed to load leave records");
    }
  }, [loadEndpoint]);

  const loadBalances = useCallback(async (): Promise<void> => {
    if (employeeIdsKey.length === 0) return;
    try {
      const response: Record<string, { balance?: any; taken?: any }> =
        await api.get(
          `/jellypolly/api/leave-management/balances/batch?employeeIds=${employeeIdsKey}&year=${year}`
        );
      const next: Record<string, JPLeaveBalance> = {};
      Object.entries(response || {}).forEach(([employeeId, data]) => {
        const balance = data.balance || {};
        const taken = data.taken || {};
        next[employeeId] = {
          cuti_tahunan_total: balance.cuti_tahunan_total || 0,
          cuti_sakit_total: balance.cuti_sakit_total || 0,
          cuti_umum_total: balance.cuti_umum_total || 0,
          cuti_rawatan_total: balance.cuti_rawatan_total ?? 60,
          cuti_tahunan_taken: taken.cuti_tahunan || 0,
          cuti_sakit_taken: taken.cuti_sakit || 0,
          cuti_umum_taken: taken.cuti_umum || 0,
          cuti_rawatan_taken: taken.cuti_rawatan || 0,
        };
      });
      setBalances(next);
    } catch (error: unknown) {
      console.error("Error fetching JP leave balances:", error);
      toast.error("Failed to fetch leave balances");
    }
  }, [employeeIdsKey, year]);

  useEffect(() => {
    loadLeave();
  }, [loadLeave]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // Employees who already have a leave entry on this date (saved or pending)
  const employeesWithLeave = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    [...existingLeave, ...newLeave].forEach((entry: JPLeaveEntry) => {
      map[entry.employeeId] = true;
    });
    return map;
  }, [existingLeave, newLeave]);

  // Remaining balance for a type, accounting for pending (unsaved) entries.
  const effectiveRemaining = useCallback(
    (employeeId: string, type: JPLeaveType): number => {
      const { remaining } = getRemaining(balances[employeeId], type);
      const pending: number = newLeave.filter(
        (entry: JPLeaveEntry) =>
          entry.employeeId === employeeId && entry.leaveType === type
      ).length;
      return remaining - pending;
    },
    [balances, newLeave]
  );

  const hasPendingChanges: boolean =
    newLeave.length > 0 ||
    deletedIds.length > 0 ||
    Object.keys(updatedAmounts).length > 0;

  const openModal = (): void => {
    setFormLeaveType(dayType === "Umum" ? "cuti_umum" : "cuti_sakit");
    setFormAmount("");
    setSelections({});
    setShowModal(true);
  };

  const toggleSelection = (employeeId: string): void => {
    if (employeesWithLeave[employeeId]) return;
    if (effectiveRemaining(employeeId, formLeaveType) <= 0) return;
    setSelections((prev: Record<string, boolean>) => ({
      ...prev,
      [employeeId]: !prev[employeeId],
    }));
  };

  const blockedEmployees = useMemo<{ id: string; name: string }[]>(
    () =>
      employees.filter(
        (employee) =>
          !employeesWithLeave[employee.id] &&
          effectiveRemaining(employee.id, formLeaveType) <= 0
      ),
    [employees, employeesWithLeave, effectiveRemaining, formLeaveType]
  );

  const handleAddLeave = (): void => {
    const targetIds: string[] = Object.entries(selections)
      .filter(([employeeId, selected]) => selected && !employeesWithLeave[employeeId])
      .map(([employeeId]) => employeeId);

    if (targetIds.length === 0) {
      toast.error("Please select at least one employee");
      return;
    }

    const insufficient: string[] = targetIds.filter(
      (employeeId: string) => effectiveRemaining(employeeId, formLeaveType) <= 0
    );
    if (insufficient.length > 0) {
      const names: string = insufficient
        .map(
          (employeeId: string) =>
            employees.find((employee) => employee.id === employeeId)?.name ||
            employeeId
        )
        .join(", ");
      toast.error(
        `${names} have insufficient ${getJPLeaveTypeLabel(
          formLeaveType
        )} balance`
      );
      return;
    }

    const trimmed: string = formAmount.trim();
    const parsed: number = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Please enter a valid non-negative leave amount");
      return;
    }
    const amountPaid: number = Math.round(parsed * 100) / 100;

    const additions: JPLeaveEntry[] = targetIds.map(
      (employeeId: string): JPLeaveEntry => ({
        employeeId,
        employeeName:
          employees.find((employee) => employee.id === employeeId)?.name || "",
        leaveDate: fixedDate,
        leaveType: formLeaveType,
        amountPaid,
      })
    );
    setNewLeave((prev: JPLeaveEntry[]) => [...prev, ...additions]);
    toast.success(
      additions.length === 1
        ? "Leave entry added"
        : `Added leave for ${additions.length} employees`
    );
    setShowModal(false);
  };

  const removeNew = (index: number): void =>
    setNewLeave((prev: JPLeaveEntry[]) =>
      prev.filter((_, currentIndex: number) => currentIndex !== index)
    );

  const removeExisting = (id: number): void => {
    setDeletedIds((prev: number[]) => [...prev, id]);
    setExistingLeave((prev: JPLeaveEntry[]) =>
      prev.filter((entry: JPLeaveEntry) => entry.id !== id)
    );
    setUpdatedAmounts((prev: Record<number, number>) => {
      const next: Record<number, number> = { ...prev };
      delete next[id];
      return next;
    });
  };

  const changeNewAmount = (index: number, value: string): void => {
    const parsed: number = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setNewLeave((prev: JPLeaveEntry[]) =>
      prev.map((entry: JPLeaveEntry, currentIndex: number) =>
        currentIndex === index
          ? { ...entry, amountPaid: Math.round(parsed * 100) / 100 }
          : entry
      )
    );
  };

  const changeExistingAmount = (id: number, value: string): void => {
    const parsed: number = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const rounded: number = Math.round(parsed * 100) / 100;
    setExistingLeave((prev: JPLeaveEntry[]) =>
      prev.map((entry: JPLeaveEntry) =>
        entry.id === id ? { ...entry, amountPaid: rounded } : entry
      )
    );
    setUpdatedAmounts((prev: Record<number, number>) => ({
      ...prev,
      [id]: rounded,
    }));
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await api.post(saveEndpoint, {
        date: fixedDate,
        leaveEntries: newLeave.map((entry: JPLeaveEntry) => ({
          employeeId: entry.employeeId,
          leaveType: entry.leaveType,
          amount_paid: entry.amountPaid,
        })),
        updatedLeaveEntries: Object.entries(updatedAmounts).map(
          ([id, amountPaid]: [string, number]) => ({
            id: Number(id),
            amount_paid: amountPaid,
          })
        ),
        deletedLeaveIds: deletedIds,
      });
      toast.success("Leave saved successfully");
      await loadLeave();
      await loadBalances();
      onSaved?.();
    } catch (error: unknown) {
      console.error("Error saving JP leave:", error);
      const message: string =
        error instanceof Error ? error.message : "Failed to save leave";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const rowCount: number = existingLeave.length + newLeave.length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-default-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <IconCalendarEvent
            size={18}
            className="text-default-500 dark:text-gray-400"
          />
          <h3 className="text-sm font-semibold text-default-800 dark:text-gray-100">
            Leave &amp; Absence Recording
          </h3>
          <span className="text-xs text-default-400 dark:text-gray-500">
            ({rowCount})
          </span>
          {hasPendingChanges && (
            <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openModal}
            disabled={disabled || employees.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-default-300 dark:border-gray-600 px-3 py-1 text-xs font-medium text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <IconPlus size={14} /> Add Leave
          </button>
          <Button
            color="sky"
            size="sm"
            onClick={handleSave}
            disabled={disabled || isSaving}
          >
            {isSaving ? "Saving..." : "Save Leave"}
          </Button>
        </div>
      </div>

      {rowCount === 0 ? (
        <div className="p-6 text-center text-sm text-default-400 dark:text-gray-500">
          No leave recorded.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                  Employee
                </th>
                <th className="px-4 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                  Date
                </th>
                <th className="px-4 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                  Type
                </th>
                <th className="px-4 py-1.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                  Amount (RM)
                </th>
                <th className="px-4 py-1.5 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 dark:divide-gray-700">
              {existingLeave.map((leave: JPLeaveEntry) => (
                <tr key={`existing-${leave.id}`}>
                  <td className="px-4 py-2 text-sm text-default-800 dark:text-gray-100">
                    <span className="font-medium">{leave.employeeName}</span>
                    <span className="ml-1 text-xs text-default-400 dark:text-gray-500">
                      {leave.employeeId}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
                    {leave.leaveDate}
                  </td>
                  <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
                    {getJPLeaveTypeLabel(leave.leaveType)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      value={leave.amountPaid}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        changeExistingAmount(leave.id!, event.target.value)
                      }
                      disabled={disabled}
                      className="w-24 pl-2 py-1 text-right text-sm border rounded bg-white dark:bg-gray-800 dark:text-gray-100 border-default-300 dark:border-gray-600 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeExisting(leave.id!)}
                      disabled={disabled}
                      className="text-rose-500 hover:text-rose-700 disabled:opacity-40"
                      title="Remove leave"
                    >
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {newLeave.map((leave: JPLeaveEntry, index: number) => (
                <tr key={`new-${index}`} className="bg-sky-50/60 dark:bg-sky-900/10">
                  <td className="px-4 py-2 text-sm text-default-800 dark:text-gray-100">
                    <span className="font-medium">{leave.employeeName}</span>
                    <span className="ml-1 text-xs text-default-400 dark:text-gray-500">
                      {leave.employeeId}
                    </span>
                    <span className="ml-2 rounded-full bg-sky-100 dark:bg-sky-900/40 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                      New
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
                    {leave.leaveDate}
                  </td>
                  <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
                    {getJPLeaveTypeLabel(leave.leaveType)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      value={leave.amountPaid}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        changeNewAmount(index, event.target.value)
                      }
                      disabled={disabled}
                      className="w-24 pl-2 py-1 text-right text-sm border rounded bg-white dark:bg-gray-800 dark:text-gray-100 border-default-300 dark:border-gray-600 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeNew(index)}
                      disabled={disabled}
                      className="text-rose-500 hover:text-rose-700 disabled:opacity-40"
                      title="Remove leave"
                    >
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl">
            <div className="px-5 py-3 border-b border-default-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-default-800 dark:text-gray-100">
                Add Leave
              </h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-3 gap-3 items-start">
                <div>
                  <label className="block text-xs font-medium text-default-500 dark:text-gray-400 mb-1">
                    Date
                  </label>
                  <div
                    className="flex h-[38px] items-center gap-2 rounded-lg border border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900/50 px-2.5 text-sm text-default-900 dark:text-gray-100"
                    title="Leave is recorded for the day you are viewing"
                  >
                    <IconCalendar
                      size={16}
                      className="flex-shrink-0 text-default-400 dark:text-gray-500"
                    />
                    <span className="whitespace-nowrap">
                      {format(parseYmd(fixedDate), "d MMM yyyy")}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-default-500 dark:text-gray-400 mb-1">
                    Type
                  </label>
                  <FormListbox
                    name="leaveType"
                    value={formLeaveType}
                    onChange={(value) => {
                      setFormLeaveType(value as JPLeaveType);
                      setSelections({});
                    }}
                    options={leaveTypeOptions.map((leaveType) => ({
                      id: leaveType.value,
                      name: leaveType.label,
                    }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-default-500 dark:text-gray-400 mb-1">
                    Amount (RM)
                  </label>
                  <input
                    type="number"
                    value={formAmount}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setFormAmount(event.target.value)
                    }
                    placeholder="0.00"
                    className="w-full h-[38px] px-2.5 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-default-300 dark:border-gray-600 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-default-400 dark:text-gray-500">
                Leave is recorded for the day currently selected on the page.
                Change the date using the day navigator above the staff cards.
              </p>

              {blockedEmployees.length > 0 && (
                <p className="text-xs text-rose-500">
                  Cannot select:{" "}
                  {blockedEmployees.map((employee) => employee.name).join(", ")}{" "}
                  have insufficient {getJPLeaveTypeLabel(formLeaveType)} balance.
                </p>
              )}

              <div className="max-h-64 overflow-y-auto rounded border border-default-200 dark:border-gray-700 divide-y divide-default-100 dark:divide-gray-700">
                {employees.map((employee) => {
                  const hasLeave: boolean = !!employeesWithLeave[employee.id];
                  const { remaining, taken, total } = getRemaining(
                    balances[employee.id],
                    formLeaveType
                  );
                  const blocked: boolean =
                    hasLeave ||
                    effectiveRemaining(employee.id, formLeaveType) <= 0;
                  return (
                    <div
                      key={employee.id}
                      className={`flex items-center justify-between px-3 py-2 ${
                        blocked ? "opacity-50" : "cursor-pointer"
                      }`}
                      onClick={() => !blocked && toggleSelection(employee.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={!!selections[employee.id]}
                          onChange={() => toggleSelection(employee.id)}
                          size={18}
                          checkedColor="text-sky-600"
                          disabled={blocked}
                          buttonClassName="p-0.5 rounded"
                        />
                        <span className="text-sm text-default-800 dark:text-gray-100">
                          {employee.name}
                        </span>
                      </div>
                      <span className="text-xs text-default-400 dark:text-gray-500">
                        {hasLeave
                          ? "Already on leave this date"
                          : `${remaining} left (${taken}/${total})`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-default-200 dark:border-gray-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button color="sky" size="sm" onClick={handleAddLeave}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JPLeaveSection;

// src/pages/GreenTarget/Payroll/GTLeaveSection.tsx
// Reusable "Leave & Absence Recording" section for Green Target payroll entry
// pages. Mirrors the TH/JP leave flow (balance validation via the GT
// leave-management route; add/list/delete leave for the section's staff).
//
// Two modes:
//  - "monthly": office monthly log. The parent folds the leave payload into its
//    monthly-work-logs save via the imperative ref (getLeavePayload / reload).
//  - "daily":   driver daily lori habuk. The section owns its own Save button and
//    posts to `saveEndpoint`; the date is locked to `fixedDate`.
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  IconPlus,
  IconTrash,
  IconCalendarEvent,
  IconCalendar,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import TimeNavigator, { TimeRange } from "../../../components/TimeNavigator";
import { FormListbox } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";

// Parse a yyyy-MM-dd string into a local-timezone Date (never via toISOString).
const parseYmd = (s: string): Date => new Date(`${s}T00:00:00`);

export type GTLeaveType =
  | "cuti_tahunan"
  | "cuti_sakit"
  | "cuti_umum"
  | "cuti_rawatan";

export const GT_LEAVE_TYPES: { value: GTLeaveType; label: string }[] = [
  { value: "cuti_tahunan", label: "Cuti Tahunan" },
  { value: "cuti_sakit", label: "Cuti Sakit" },
  { value: "cuti_umum", label: "Cuti Umum" },
  { value: "cuti_rawatan", label: "Cuti Rawatan" },
];

export const getGTLeaveTypeLabel = (type: string): string =>
  GT_LEAVE_TYPES.find((t) => t.value === type)?.label || type;

interface GTLeaveBalance {
  cuti_tahunan_total: number;
  cuti_sakit_total: number;
  cuti_umum_total: number;
  cuti_rawatan_total: number;
  cuti_tahunan_taken: number;
  cuti_sakit_taken: number;
  cuti_umum_taken: number;
  cuti_rawatan_taken: number;
}

export interface GTLeaveEntry {
  id?: number; // present for saved records
  employeeId: string;
  employeeName: string;
  leaveDate: string; // yyyy-MM-dd
  leaveType: GTLeaveType;
  amountPaid: number;
  isNew?: boolean;
}

export interface GTLeavePayload {
  leaveEntries: {
    employeeId: string;
    leaveDate: string;
    leaveType: GTLeaveType;
    amount_paid: number;
    isNew: true;
  }[];
  updatedLeaveEntries: { id: number; amount_paid: number }[];
  deletedLeaveIds: number[];
}

export interface GTLeaveSectionHandle {
  getLeavePayload: () => GTLeavePayload;
  hasPendingChanges: () => boolean;
  reload: () => void;
}

interface GTLeaveSectionProps {
  employees: { id: string; name: string }[];
  year: number;
  month: number;
  mode: "monthly" | "daily";
  /** GET url returning the section's saved leave records */
  loadEndpoint: string;
  /** daily mode: POST url for the section's own Save button */
  saveEndpoint?: string;
  /** daily mode: locks new leave to this date (yyyy-MM-dd) */
  fixedDate?: string;
  disabled?: boolean;
  /** daily mode: called after a successful self-save */
  onSaved?: () => void;
}

const DEFAULT_LEAVE_AMOUNT = 0;

const getRemaining = (
  balance: GTLeaveBalance | undefined,
  type: GTLeaveType
): { remaining: number; taken: number; total: number } => {
  if (!balance) return { remaining: 0, taken: 0, total: 0 };
  let total = 0;
  let taken = 0;
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

const GTLeaveSection = forwardRef<GTLeaveSectionHandle, GTLeaveSectionProps>(
  (
    {
      employees,
      year,
      month,
      mode,
      loadEndpoint,
      saveEndpoint,
      fixedDate,
      disabled = false,
      onSaved,
    },
    ref
  ) => {
    const [existingLeave, setExistingLeave] = useState<GTLeaveEntry[]>([]);
    const [newLeave, setNewLeave] = useState<GTLeaveEntry[]>([]);
    const [deletedIds, setDeletedIds] = useState<number[]>([]);
    const [updatedAmounts, setUpdatedAmounts] = useState<Record<number, number>>(
      {}
    );
    const [balances, setBalances] = useState<Record<string, GTLeaveBalance>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Add Leave modal state
    const [showModal, setShowModal] = useState(false);
    const [selections, setSelections] = useState<Record<string, boolean>>({});
    const defaultDate = useMemo(() => {
      if (mode === "daily" && fixedDate) return fixedDate;
      const today = new Date();
      if (today.getFullYear() === year && today.getMonth() + 1 === month) {
        return format(today, "yyyy-MM-dd");
      }
      return format(new Date(year, month - 1, 1), "yyyy-MM-dd");
    }, [mode, fixedDate, year, month]);
    const [formLeaveDate, setFormLeaveDate] = useState(defaultDate);
    const [formLeaveType, setFormLeaveType] = useState<GTLeaveType>("cuti_sakit");
    const [formAmount, setFormAmount] = useState("");

    const employeeIdsKey = employees.map((e) => e.id).join(",");

    const loadLeave = useCallback(async () => {
      try {
        const rows: any[] = await api.get(loadEndpoint);
        setExistingLeave(
          (rows || []).map((r) => ({
            id: r.id,
            employeeId: r.employee_id,
            employeeName: r.employee_name || "",
            leaveDate: format(new Date(r.leave_date), "yyyy-MM-dd"),
            leaveType: r.leave_type,
            amountPaid: Number(r.amount_paid) || 0,
          }))
        );
        setNewLeave([]);
        setDeletedIds([]);
        setUpdatedAmounts({});
      } catch (error) {
        console.error("Error loading GT leave records:", error);
      }
    }, [loadEndpoint]);

    const loadBalances = useCallback(async () => {
      if (employees.length === 0) return;
      try {
        const response: Record<string, any> = await api.get(
          `/greentarget/api/leave-management/balances/batch?employeeIds=${employees
            .map((e) => e.id)
            .join(",")}&year=${year}`
        );
        const next: Record<string, GTLeaveBalance> = {};
        Object.entries(response || {}).forEach(([id, data]: [string, any]) => {
          const b = data.balance || {};
          const taken = data.taken || {};
          next[id] = {
            cuti_tahunan_total: b.cuti_tahunan_total || 0,
            cuti_sakit_total: b.cuti_sakit_total || 0,
            cuti_umum_total: b.cuti_umum_total || 0,
            cuti_rawatan_total: b.cuti_rawatan_total ?? 60,
            cuti_tahunan_taken: taken.cuti_tahunan || 0,
            cuti_sakit_taken: taken.cuti_sakit || 0,
            cuti_umum_taken: taken.cuti_umum || 0,
            cuti_rawatan_taken: taken.cuti_rawatan || 0,
          };
        });
        setBalances(next);
      } catch (error) {
        console.error("Error fetching GT leave balances:", error);
        toast.error("Failed to fetch leave balances");
      }
    }, [employeeIdsKey, year]);

    useEffect(() => {
      loadLeave();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadEndpoint]);

    useEffect(() => {
      loadBalances();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeIdsKey, year]);

    // Employees who already have a leave entry on the chosen date (existing+new)
    const employeesWithLeaveOnDate = useMemo(() => {
      const map: Record<string, boolean> = {};
      [...existingLeave, ...newLeave].forEach((entry) => {
        if (entry.leaveDate === formLeaveDate) map[entry.employeeId] = true;
      });
      return map;
    }, [existingLeave, newLeave, formLeaveDate]);

    // Effective remaining balance for a type, accounting for pending new entries.
    const effectiveRemaining = useCallback(
      (employeeId: string, type: GTLeaveType): number => {
        const { remaining } = getRemaining(balances[employeeId], type);
        const pending = newLeave.filter(
          (l) => l.employeeId === employeeId && l.leaveType === type
        ).length;
        return remaining - pending;
      },
      [balances, newLeave]
    );

    const buildPayload = useCallback(
      (): GTLeavePayload => ({
        leaveEntries: newLeave.map((l) => ({
          employeeId: l.employeeId,
          leaveDate: l.leaveDate,
          leaveType: l.leaveType,
          amount_paid: l.amountPaid,
          isNew: true as const,
        })),
        updatedLeaveEntries: Object.entries(updatedAmounts).map(
          ([id, amount_paid]) => ({ id: Number(id), amount_paid })
        ),
        deletedLeaveIds: deletedIds,
      }),
      [newLeave, updatedAmounts, deletedIds]
    );

    useImperativeHandle(ref, () => ({
      getLeavePayload: buildPayload,
      hasPendingChanges: () =>
        newLeave.length > 0 ||
        deletedIds.length > 0 ||
        Object.keys(updatedAmounts).length > 0,
      reload: () => {
        loadLeave();
        loadBalances();
      },
    }));

    const openModal = () => {
      setFormLeaveDate(defaultDate);
      setFormLeaveType("cuti_sakit");
      setFormAmount("");
      setSelections({});
      setShowModal(true);
    };

    // TimeNavigator emits a range; take its start day. In monthly mode, reject
    // dates outside the selected month (the log is month-scoped).
    const handleLeaveDateChange = (nextRange: TimeRange) => {
      const ymd = format(nextRange.start, "yyyy-MM-dd");
      if (mode === "monthly") {
        const lo = format(new Date(year, month - 1, 1), "yyyy-MM-dd");
        const hi = format(new Date(year, month, 0), "yyyy-MM-dd");
        if (ymd < lo || ymd > hi) {
          toast.error("Leave date must be within the selected month");
          return;
        }
      }
      setFormLeaveDate(ymd);
    };

    const toggleSelection = (employeeId: string) => {
      if (employeesWithLeaveOnDate[employeeId]) return;
      if (effectiveRemaining(employeeId, formLeaveType) <= 0) return;
      setSelections((prev) => ({ ...prev, [employeeId]: !prev[employeeId] }));
    };

    // Employees blocked for the current type (exhausted balance), for messaging
    const blockedEmployees = useMemo(
      () =>
        employees.filter(
          (e) =>
            !employeesWithLeaveOnDate[e.id] &&
            effectiveRemaining(e.id, formLeaveType) <= 0
        ),
      [employees, employeesWithLeaveOnDate, effectiveRemaining, formLeaveType]
    );

    const handleAddLeave = () => {
      if (!formLeaveDate) {
        toast.error("Please select a date");
        return;
      }
      const targetIds = Object.entries(selections)
        .filter(([id, sel]) => sel && !employeesWithLeaveOnDate[id])
        .map(([id]) => id);

      if (targetIds.length === 0) {
        toast.error("Please select at least one employee");
        return;
      }

      // Balance guard
      const insufficient = targetIds.filter(
        (id) => effectiveRemaining(id, formLeaveType) <= 0
      );
      if (insufficient.length > 0) {
        const names = insufficient
          .map((id) => employees.find((e) => e.id === id)?.name || id)
          .join(", ");
        toast.error(
          `${names} have insufficient ${getGTLeaveTypeLabel(
            formLeaveType
          )} balance`
        );
        return;
      }

      const trimmed = formAmount.trim();
      const parsed = trimmed === "" ? DEFAULT_LEAVE_AMOUNT : Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Please enter a valid non-negative leave amount");
        return;
      }
      const amountPaid = Math.round(parsed * 100) / 100;

      const additions: GTLeaveEntry[] = targetIds.map((id) => ({
        employeeId: id,
        employeeName: employees.find((e) => e.id === id)?.name || "",
        leaveDate: formLeaveDate,
        leaveType: formLeaveType,
        amountPaid,
        isNew: true,
      }));
      setNewLeave((prev) => [...prev, ...additions]);
      toast.success(
        additions.length === 1
          ? "Leave entry added"
          : `Added leave for ${additions.length} employees`
      );
      setShowModal(false);
    };

    const removeNew = (index: number) =>
      setNewLeave((prev) => prev.filter((_, i) => i !== index));

    const removeExisting = (id: number) => {
      setDeletedIds((prev) => [...prev, id]);
      setExistingLeave((prev) => prev.filter((l) => l.id !== id));
      setUpdatedAmounts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    const changeNewAmount = (index: number, value: string) => {
      const parsed = value.trim() === "" ? 0 : Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      setNewLeave((prev) =>
        prev.map((l, i) =>
          i === index ? { ...l, amountPaid: Math.round(parsed * 100) / 100 } : l
        )
      );
    };

    const changeExistingAmount = (id: number, value: string) => {
      const parsed = value.trim() === "" ? 0 : Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      const rounded = Math.round(parsed * 100) / 100;
      setExistingLeave((prev) =>
        prev.map((l) => (l.id === id ? { ...l, amountPaid: rounded } : l))
      );
      setUpdatedAmounts((prev) => ({ ...prev, [id]: rounded }));
    };

    // daily mode: self-save
    const handleSelfSave = async () => {
      if (!saveEndpoint) return;
      setIsSaving(true);
      try {
        await api.post(saveEndpoint, {
          date: fixedDate,
          ...buildPayload(),
        });
        toast.success("Leave saved successfully");
        await loadLeave();
        await loadBalances();
        onSaved?.();
      } catch (error: any) {
        console.error("Error saving GT driver leave:", error);
        toast.error(error?.response?.data?.message || "Failed to save leave");
      } finally {
        setIsSaving(false);
      }
    };

    const rows = [...existingLeave, ...newLeave];

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
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
              ({rows.length})
            </span>
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
            {mode === "daily" && (
              <Button
                color="sky"
                size="sm"
                onClick={handleSelfSave}
                disabled={disabled || isSaving}
              >
                {isSaving ? "Saving..." : "Save Leave"}
              </Button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
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
                {existingLeave.map((leave) => (
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
                      {getGTLeaveTypeLabel(leave.leaveType)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        value={leave.amountPaid}
                        onChange={(e) =>
                          changeExistingAmount(leave.id!, e.target.value)
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
                {newLeave.map((leave, index) => (
                  <tr
                    key={`new-${index}`}
                    className="bg-sky-50/60 dark:bg-sky-900/10"
                  >
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
                      {getGTLeaveTypeLabel(leave.leaveType)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        value={leave.amountPaid}
                        onChange={(e) => changeNewAmount(index, e.target.value)}
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

        {/* Add Leave Modal */}
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
                    {mode === "daily" ? (
                      <div
                        className="flex h-[38px] items-center gap-2 rounded-lg border border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900/50 px-2.5 text-sm text-default-900 dark:text-gray-100"
                        title="Leave is recorded for the day you are viewing"
                      >
                        <IconCalendar
                          size={16}
                          className="flex-shrink-0 text-default-400 dark:text-gray-500"
                        />
                        <span className="whitespace-nowrap">
                          {format(parseYmd(formLeaveDate), "d MMM yyyy")}
                        </span>
                      </div>
                    ) : (
                      <TimeNavigator
                        range={{
                          start: parseYmd(formLeaveDate),
                          end: parseYmd(formLeaveDate),
                        }}
                        onChange={handleLeaveDateChange}
                        modes={["day"]}
                        presets={false}
                        allowFuture
                        showArrows={false}
                        size="md"
                        minDate={new Date(year, month - 1, 1)}
                        className="w-full"
                        triggerClassName="w-full justify-between"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-default-500 dark:text-gray-400 mb-1">
                      Type
                    </label>
                    <FormListbox
                      name="leaveType"
                      value={formLeaveType}
                      onChange={(v) => {
                        setFormLeaveType(v as GTLeaveType);
                        setSelections({});
                      }}
                      options={GT_LEAVE_TYPES.map((t) => ({
                        id: t.value,
                        name: t.label,
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
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-[38px] px-2.5 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-default-300 dark:border-gray-600 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                {mode === "daily" && (
                  <p className="-mt-2 text-xs text-default-400 dark:text-gray-500">
                    Leave is recorded for the day currently selected on the page.
                    Change the date using the day navigator above the driver
                    cards.
                  </p>
                )}

                {blockedEmployees.length > 0 && (
                  <p className="text-xs text-rose-500">
                    Cannot select:{" "}
                    {blockedEmployees.map((e) => e.name).join(", ")} have
                    insufficient {getGTLeaveTypeLabel(formLeaveType)} balance.
                  </p>
                )}

                <div className="max-h-64 overflow-y-auto rounded border border-default-200 dark:border-gray-700 divide-y divide-default-100 dark:divide-gray-700">
                  {employees.map((emp) => {
                    const hasLeave = employeesWithLeaveOnDate[emp.id];
                    const { remaining, taken, total } = getRemaining(
                      balances[emp.id],
                      formLeaveType
                    );
                    const blocked =
                      hasLeave ||
                      effectiveRemaining(emp.id, formLeaveType) <= 0;
                    return (
                      <div
                        key={emp.id}
                        className={`flex items-center justify-between px-3 py-2 ${
                          blocked ? "opacity-50" : "cursor-pointer"
                        }`}
                        onClick={() => !blocked && toggleSelection(emp.id)}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!!selections[emp.id]}
                            onChange={() => toggleSelection(emp.id)}
                            size={18}
                            checkedColor="text-sky-600"
                            disabled={blocked}
                            buttonClassName="p-0.5 rounded"
                          />
                          <span className="text-sm text-default-800 dark:text-gray-100">
                            {emp.name}
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
  }
);

GTLeaveSection.displayName = "GTLeaveSection";

export default GTLeaveSection;

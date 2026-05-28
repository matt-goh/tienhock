// src/components/Payroll/AddOthersModal.tsx
import React, { useState, useMemo, Fragment, useEffect } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import {
  IconDeviceFloppy,
  IconPlus,
  IconX,
  IconChevronDown,
  IconCheck,
  IconUsersPlus,
  IconLink,
} from "@tabler/icons-react";
import { format } from "date-fns";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import Button from "../Button";
import { FormInput } from "../FormComponents";
import { PayrollCalculationService } from "../../utils/payroll/payrollCalculationService";
import { PayCode, RateUnit } from "../../types/types";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { useAuth } from "../../contexts/AuthContext";
import MonthDayMultiPicker from "./MonthDayMultiPicker";
import Checkbox from "../Checkbox";

interface OthersEntry {
  id: number;
  employeeId: string | null;
  payCodeId: string;
  description: string;
  rate: string;
  rateUnit: RateUnit | "";
  quantity: string;
  dates: string[];
}

interface AddOthersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentYear: number;
  currentMonth: number;
  displayLabel: string;
}

const PAY_CODE_PAGE_SIZE = 50;

const computeAmount = (
  rate: string,
  quantity: string,
  rateUnit: RateUnit | ""
): number => {
  const r = parseFloat(rate || "0");
  const q = parseFloat(quantity || "0");
  if (!isFinite(r) || !isFinite(q) || !rateUnit) return 0;
  try {
    return PayrollCalculationService.calculateAmount(r, q, rateUnit as RateUnit);
  } catch {
    return 0;
  }
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const defaultDateForMonth = (year: number, month: number): string => {
  const today = new Date();
  const sameMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  if (sameMonth) return format(today, "yyyy-MM-dd");
  return `${year}-${month.toString().padStart(2, "0")}-15`;
};

const AddOthersModal: React.FC<AddOthersModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentYear,
  currentMonth,
  displayLabel,
}) => {
  const { staffs } = useStaffsCache();
  const { payCodes } = useJobPayCodeMappings();
  const { user } = useAuth();

  const [entries, setEntries] = useState<OthersEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [staffQueries, setStaffQueries] = useState<Record<number, string>>({});
  const [payCodeQueries, setPayCodeQueries] = useState<Record<number, string>>(
    {}
  );
  const [loadedPayCodeCounts, setLoadedPayCodeCounts] = useState<
    Record<number, number>
  >({});
  const [bulkStaffQuery, setBulkStaffQuery] = useState("");
  const [bulkStaffSelected, setBulkStaffSelected] = useState<string[]>([]);

  const availablePayCodes = useMemo(() => {
    return payCodes
      .filter(
        (pc) =>
          pc.is_active &&
          (pc.pay_type === "Base" ||
            pc.pay_type === "Tambahan" ||
            pc.pay_type === "Overtime")
      )
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [payCodes]);

  const allStaffOptions = useMemo(
    () =>
      staffs.map((staff) => ({
        id: staff.id,
        name: `${staff.name} (${staff.id})`,
      })),
    [staffs]
  );

  useEffect(() => {
    if (!isOpen) return;
    const defaultDate = defaultDateForMonth(currentYear, currentMonth);
    const initialEntryId: number = Date.now();
    setEntries([
      {
        id: initialEntryId,
        employeeId: null,
        payCodeId: "",
        description: "",
        rate: "0",
        rateUnit: "",
        quantity: "1",
        dates: [defaultDate],
      },
    ]);
    setStaffQueries({});
    setPayCodeQueries({});
    setLoadedPayCodeCounts({ [initialEntryId]: PAY_CODE_PAGE_SIZE });
    setBulkStaffQuery("");
    setBulkStaffSelected([]);
  }, [isOpen, currentYear, currentMonth]);

  const handleEntryChange = <K extends keyof OthersEntry>(
    index: number,
    field: K,
    value: OthersEntry[K]
  ): void => {
    setEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  };

  const handlePayCodeChange = (index: number, payCodeId: string): void => {
    const pc = availablePayCodes.find((p) => p.id === payCodeId);
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              payCodeId,
              rate: pc ? String(pc.rate_biasa ?? 0) : "0",
              rateUnit: (pc?.rate_unit as RateUnit) || "",
              description: pc?.description || entry.description,
            }
          : entry
      )
    );
  };

  const handlePayCodeQueryChange = (entryId: number, value: string): void => {
    setPayCodeQueries((prev) => ({ ...prev, [entryId]: value }));
    setLoadedPayCodeCounts((prev) => ({
      ...prev,
      [entryId]: PAY_CODE_PAGE_SIZE,
    }));
  };

  const handleLoadMorePayCodes = (
    entryId: number,
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    setLoadedPayCodeCounts((prev) => ({
      ...prev,
      [entryId]: (prev[entryId] ?? PAY_CODE_PAGE_SIZE) + PAY_CODE_PAGE_SIZE,
    }));
  };

  const addEntryRow = (): void => {
    const newEntryId: number = Date.now() + Math.floor(Math.random() * 1000);
    setEntries((prev) => [
      ...prev,
      {
        id: newEntryId,
        employeeId: null,
        payCodeId: "",
        description: "",
        rate: "0",
        rateUnit: "",
        quantity: "1",
        dates: [defaultDateForMonth(currentYear, currentMonth)],
      },
    ]);
    setLoadedPayCodeCounts((prev) => ({
      ...prev,
      [newEntryId]: PAY_CODE_PAGE_SIZE,
    }));
  };

  const removeEntryRow = (id: number): void => {
    if (entries.length <= 1) return;
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setStaffQueries((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPayCodeQueries((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLoadedPayCodeCounts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toggleBulkStaff = (staffId: string): void => {
    setBulkStaffSelected((prev) =>
      prev.includes(staffId)
        ? prev.filter((s) => s !== staffId)
        : [...prev, staffId]
    );
  };

  const handleApplyBulkStaff = (rowIndex: number, close: () => void): void => {
    if (bulkStaffSelected.length === 0) {
      close();
      return;
    }
    const source = entries[rowIndex];
    const cloned: OthersEntry[] = bulkStaffSelected.map((empId, i) => ({
      id: Date.now() + i + Math.floor(Math.random() * 1000),
      employeeId: empId,
      payCodeId: source.payCodeId,
      description: source.description,
      rate: source.rate,
      rateUnit: source.rateUnit,
      quantity: source.quantity,
      dates: [...source.dates],
    }));
    setEntries((prev) => {
      const next = [...prev];
      const firstClone = cloned[0];
      if (!source.employeeId) {
        next[rowIndex] = firstClone;
        next.splice(rowIndex + 1, 0, ...cloned.slice(1));
      } else {
        next.splice(rowIndex + 1, 0, ...cloned);
      }
      return next;
    });
    setLoadedPayCodeCounts((prev) => {
      const updated = { ...prev };
      for (const c of cloned) updated[c.id] = PAY_CODE_PAGE_SIZE;
      return updated;
    });
    setBulkStaffSelected([]);
    setBulkStaffQuery("");
    close();
  };

  const filteredBulkStaffOptions = useMemo(() => {
    if (bulkStaffQuery === "") return allStaffOptions;
    return allStaffOptions.filter((s) =>
      s.name.toLowerCase().includes(bulkStaffQuery.toLowerCase())
    );
  }, [allStaffOptions, bulkStaffQuery]);

  const handleSave = async (): Promise<void> => {
    const valid = entries.filter((e) => {
      const rate = parseFloat(e.rate);
      const qty = parseFloat(e.quantity);
      return (
        e.employeeId &&
        e.payCodeId &&
        e.rateUnit &&
        e.description.trim() &&
        isFinite(rate) &&
        rate > 0 &&
        isFinite(qty) &&
        qty > 0 &&
        e.dates.length > 0
      );
    });

    if (valid.length === 0) {
      toast.error(
        `Please add at least one valid entry with staff, pay code, dates, rate, quantity, and description.`
      );
      return;
    }

    setIsSaving(true);
    let totalInserted = 0;
    try {
      for (const e of valid) {
        const amount = computeAmount(e.rate, e.quantity, e.rateUnit);
        const payload: Record<string, unknown> = {
          employee_id: e.employeeId,
          pay_code_id: e.payCodeId,
          description: e.description.trim(),
          rate: parseFloat(e.rate),
          rate_unit: e.rateUnit,
          quantity: parseFloat(e.quantity),
          amount,
          created_by: user?.id,
        };
        if (e.dates.length === 1) {
          payload.record_date = e.dates[0];
        } else {
          payload.record_dates = [...e.dates].sort();
        }
        await api.post("/api/others-records", payload);
        totalInserted += e.dates.length;
      }
      toast.success(
        `${totalInserted} ${displayLabel} record(s) saved successfully!`
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Failed to save Others records:", error);
      toast.error(
        error.response?.data?.message ||
          `Failed to save one or more ${displayLabel} records.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = (): void => {
    if (!isSaving) onClose();
  };

  const monthLabel = format(
    new Date(currentYear, currentMonth - 1, 1),
    "MMMM yyyy"
  );

  const totalRecordsToCreate = entries.reduce(
    (sum, e) => sum + e.dates.length,
    0,
  );
  const totalAmountAcrossAll = entries.reduce(
    (sum, e) => sum + computeAmount(e.rate, e.quantity, e.rateUnit) * e.dates.length,
    0,
  );

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 py-6 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="my-auto w-full max-w-3xl transform rounded-2xl border border-default-200 bg-white text-left align-middle shadow-xl ring-1 ring-black/5 transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40 dark:ring-white/10 flex flex-col max-h-[calc(100vh-3rem)]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-default-200 bg-default-50 dark:border-gray-700 dark:bg-gray-900/60 rounded-t-2xl">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800 dark:text-default-100"
                  >
                    Record Staff {displayLabel}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                    Adding to <span className="font-medium">{monthLabel}</span>. Pick one or more dates per entry — entries with 2+ dates are saved as a linked record that stays in sync.
                  </p>
                </div>

                {/* Body (scrollable) */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <div className="space-y-4">
                    {entries.map((entry, index) => {
                      const amount = computeAmount(
                        entry.rate,
                        entry.quantity,
                        entry.rateUnit,
                      );
                      const stepVal =
                        entry.rateUnit === "Hour" || entry.rateUnit === "Bill"
                          ? "0.5"
                          : "1";
                      const pcQuery = payCodeQueries[entry.id] || "";
                      const filteredPayCodes: PayCode[] =
                        pcQuery === ""
                          ? availablePayCodes
                          : availablePayCodes.filter((pc) =>
                              `${pc.id.toLowerCase()} ${pc.description.toLowerCase()}`.includes(
                                pcQuery.toLowerCase(),
                              ),
                            );
                      const loadedPayCodeCount: number =
                        loadedPayCodeCounts[entry.id] ?? PAY_CODE_PAGE_SIZE;
                      const visiblePayCodes: PayCode[] = filteredPayCodes.slice(
                        0,
                        loadedPayCodeCount,
                      );
                      const remainingPayCodeCount: number = Math.max(
                        filteredPayCodes.length - visiblePayCodes.length,
                        0,
                      );
                      const isLinked = entry.dates.length >= 2;
                      const totalForEntry = amount * entry.dates.length;
                      const sQuery = staffQueries[entry.id] || "";
                      const filteredStaff =
                        sQuery === ""
                          ? allStaffOptions
                          : allStaffOptions.filter((s) =>
                              s.name.toLowerCase().includes(sQuery.toLowerCase()),
                            );

                      return (
                        <div
                          key={entry.id}
                          className={`relative rounded-xl border ${
                            isLinked
                              ? "border-sky-300 dark:border-sky-700/70 bg-sky-50/30 dark:bg-sky-900/10"
                              : "border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                          } p-4 transition-colors`}
                        >
                          {/* Card header */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                              Entry {index + 1}
                              {isLinked && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                  <IconLink size={11} />
                                  Linked across {entry.dates.length} dates
                                </span>
                              )}
                            </div>
                            {entries.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeEntryRow(entry.id)}
                                disabled={isSaving}
                                className="p-1.5 rounded-full text-default-400 hover:bg-rose-100 hover:text-rose-600 dark:text-gray-500 dark:hover:bg-rose-900/40 dark:hover:text-rose-300 transition-colors"
                                title="Remove entry"
                              >
                                <IconX size={16} />
                              </button>
                            )}
                          </div>

                          {/* Row 1: Staff + Pay code */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="block text-xs font-medium text-default-600 dark:text-gray-300 mb-1">
                                Staff
                              </label>
                              <Combobox
                                value={entry.employeeId || ""}
                                onChange={(value: string | null) =>
                                  handleEntryChange(
                                    index,
                                    "employeeId",
                                    value || null,
                                  )
                                }
                                disabled={isSaving}
                              >
                                <div className="relative">
                                  <ComboboxInput
                                    className="w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500"
                                    displayValue={(empId: string) => {
                                      const sel = allStaffOptions.find(
                                        (s) => s.id === empId,
                                      );
                                      return sel ? sel.name : "";
                                    }}
                                    onChange={(event) =>
                                      setStaffQueries((prev) => ({
                                        ...prev,
                                        [entry.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="Select staff..."
                                  />
                                  <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                                    <IconChevronDown
                                      size={18}
                                      className="text-gray-400 dark:text-gray-500"
                                      aria-hidden="true"
                                    />
                                  </ComboboxButton>
                                  <Transition
                                    as={Fragment}
                                    leave="transition ease-in duration-100"
                                    leaveFrom="opacity-100"
                                    leaveTo="opacity-0"
                                    afterLeave={() =>
                                      setStaffQueries((prev) => ({
                                        ...prev,
                                        [entry.id]: "",
                                      }))
                                    }
                                  >
                                    <ComboboxOptions
                                      anchor={{ to: "bottom start", gap: 4 }}
                                      className="z-50 max-h-60 w-[var(--input-width)] overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 dark:ring-gray-700 focus:outline-none"
                                    >
                                      {filteredStaff.length === 0 ? (
                                        <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                                          No staff found.
                                        </div>
                                      ) : (
                                        filteredStaff.slice(0, 50).map((s) => (
                                          <ComboboxOption
                                            key={s.id}
                                            value={s.id}
                                            className={({ active }) =>
                                              `relative cursor-default select-none py-2 pl-9 pr-3 ${
                                                active
                                                  ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200"
                                                  : "text-gray-900 dark:text-gray-100"
                                              }`
                                            }
                                          >
                                            {({ selected }) => (
                                              <>
                                                <span
                                                  className={`block truncate ${
                                                    selected
                                                      ? "font-medium"
                                                      : "font-normal"
                                                  }`}
                                                >
                                                  {s.name}
                                                </span>
                                                {selected && (
                                                  <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-sky-600 dark:text-sky-300">
                                                    <IconCheck size={16} />
                                                  </span>
                                                )}
                                              </>
                                            )}
                                          </ComboboxOption>
                                        ))
                                      )}
                                    </ComboboxOptions>
                                  </Transition>
                                </div>
                              </Combobox>
                              <Popover className="relative mt-1">
                                {({ close }) => (
                                  <>
                                    <PopoverButton
                                      disabled={isSaving}
                                      className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200 disabled:opacity-50"
                                      onClick={() => {
                                        setBulkStaffSelected([]);
                                        setBulkStaffQuery("");
                                      }}
                                    >
                                      <IconUsersPlus size={14} />
                                      Add multiple staff
                                    </PopoverButton>
                                    <Transition
                                      as={Fragment}
                                      enter="transition ease-out duration-150"
                                      enterFrom="opacity-0 translate-y-1"
                                      enterTo="opacity-100 translate-y-0"
                                      leave="transition ease-in duration-100"
                                      leaveFrom="opacity-100 translate-y-0"
                                      leaveTo="opacity-0 translate-y-1"
                                    >
                                      <PopoverPanel
                                        anchor={{ to: "bottom start", gap: 4 }}
                                        className="z-50 w-80 rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg ring-1 ring-black/5 dark:ring-gray-700"
                                      >
                                        <div className="mb-2 text-xs font-medium text-default-700 dark:text-gray-200">
                                          Pick staff — each will get this entry's paycode, dates, rate, qty and description copied. You can tweak per row after.
                                        </div>
                                        <input
                                          type="text"
                                          value={bulkStaffQuery}
                                          onChange={(e) =>
                                            setBulkStaffQuery(e.target.value)
                                          }
                                          placeholder="Search staff..."
                                          className="w-full rounded-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 px-2 text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                        />
                                        <div className="mt-2 max-h-60 overflow-auto space-y-0.5">
                                          {filteredBulkStaffOptions.length === 0 ? (
                                            <div className="py-2 px-1 text-sm text-default-500 dark:text-gray-400">
                                              No staff found.
                                            </div>
                                          ) : (
                                            filteredBulkStaffOptions.map((s) => (
                                              <div
                                                key={s.id}
                                                className="rounded-md hover:bg-default-100 dark:hover:bg-gray-700"
                                              >
                                                <Checkbox
                                                  checked={bulkStaffSelected.includes(
                                                    s.id,
                                                  )}
                                                  onChange={() =>
                                                    toggleBulkStaff(s.id)
                                                  }
                                                  size={18}
                                                  checkedColor="text-sky-600 dark:text-sky-400"
                                                  label={
                                                    <span
                                                      className="block max-w-[230px] truncate text-sm text-default-900 dark:text-gray-100"
                                                      title={s.name}
                                                    >
                                                      {s.name}
                                                    </span>
                                                  }
                                                  labelPosition="right"
                                                  className="w-full py-1.5 px-2"
                                                  buttonClassName="rounded-sm"
                                                />
                                              </div>
                                            ))
                                          )}
                                        </div>
                                        <div className="mt-3 flex items-center justify-between border-t border-default-200 dark:border-gray-700 pt-2 text-xs">
                                          <span className="text-default-500 dark:text-gray-400">
                                            {bulkStaffSelected.length} selected
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setBulkStaffSelected([]);
                                                setBulkStaffQuery("");
                                                close();
                                              }}
                                              className="rounded-md px-3 py-1 text-default-600 hover:bg-default-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              type="button"
                                              disabled={
                                                bulkStaffSelected.length === 0
                                              }
                                              onClick={() =>
                                                handleApplyBulkStaff(index, close)
                                              }
                                              className="rounded-md bg-sky-500 px-3 py-1 font-medium text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-sky-600 dark:hover:bg-sky-500"
                                            >
                                              Add {bulkStaffSelected.length || ""} row
                                              {bulkStaffSelected.length === 1 ? "" : "s"}
                                            </button>
                                          </div>
                                        </div>
                                      </PopoverPanel>
                                    </Transition>
                                  </>
                                )}
                              </Popover>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-default-600 dark:text-gray-300 mb-1">
                                Pay code
                              </label>
                              <Combobox
                                value={entry.payCodeId}
                                onChange={(value: string | null) =>
                                  handlePayCodeChange(index, value || "")
                                }
                                disabled={isSaving}
                              >
                                <div className="relative">
                                  <ComboboxInput
                                    className="w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500"
                                    displayValue={(code: string) => {
                                      const sel = availablePayCodes.find(
                                        (pc) => pc.id === code,
                                      );
                                      return sel
                                        ? `${sel.id} - ${sel.description}`
                                        : "";
                                    }}
                                    onChange={(event) =>
                                      handlePayCodeQueryChange(
                                        entry.id,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Search pay code..."
                                  />
                                  <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                                    <IconChevronDown
                                      size={18}
                                      className="text-gray-400 dark:text-gray-500"
                                      aria-hidden="true"
                                    />
                                  </ComboboxButton>
                                  <Transition
                                    as={Fragment}
                                    leave="transition ease-in duration-100"
                                    leaveFrom="opacity-100"
                                    leaveTo="opacity-0"
                                    afterLeave={() => {
                                      setPayCodeQueries((prev) => ({
                                        ...prev,
                                        [entry.id]: "",
                                      }));
                                      setLoadedPayCodeCounts((prev) => ({
                                        ...prev,
                                        [entry.id]: PAY_CODE_PAGE_SIZE,
                                      }));
                                    }}
                                  >
                                    <ComboboxOptions
                                      anchor={{ to: "bottom start", gap: 4 }}
                                      className="z-50 max-h-72 w-[var(--input-width)] overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 dark:ring-gray-700 focus:outline-none"
                                    >
                                      {filteredPayCodes.length === 0 ? (
                                        <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                                          No pay codes found.
                                        </div>
                                      ) : (
                                        <>
                                          {visiblePayCodes.map((pc) => (
                                            <ComboboxOption
                                              key={pc.id}
                                              value={pc.id}
                                              className={({ active }) =>
                                                `relative cursor-default select-none py-2 pl-9 pr-3 ${
                                                  active
                                                    ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200"
                                                    : "text-gray-900 dark:text-gray-100"
                                                }`
                                              }
                                            >
                                              {({ selected }) => (
                                                <>
                                                  <span
                                                    className={`block truncate ${
                                                      selected
                                                        ? "font-medium"
                                                        : "font-normal"
                                                    }`}
                                                  >
                                                    <span className="text-xs text-default-500 dark:text-gray-400 mr-1">
                                                      [{pc.pay_type}]
                                                    </span>
                                                    {pc.id} - {pc.description}
                                                  </span>
                                                  {selected && (
                                                    <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-sky-600 dark:text-sky-300">
                                                      <IconCheck size={16} />
                                                    </span>
                                                  )}
                                                </>
                                              )}
                                            </ComboboxOption>
                                          ))}
                                          {remainingPayCodeCount > 0 && (
                                            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                                              <button
                                                type="button"
                                                onClick={(event) =>
                                                  handleLoadMorePayCodes(
                                                    entry.id,
                                                    event,
                                                  )
                                                }
                                                className="w-full rounded-md bg-sky-50 px-4 py-1.5 text-sm font-medium text-sky-600 hover:bg-sky-100 disabled:opacity-50 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50"
                                                disabled={isSaving}
                                              >
                                                <span className="inline-flex items-center justify-center">
                                                  <IconChevronDown
                                                    size={14}
                                                    className="mr-1.5"
                                                  />
                                                  Load more ({remainingPayCodeCount} remaining)
                                                </span>
                                              </button>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </ComboboxOptions>
                                  </Transition>
                                </div>
                              </Combobox>
                              {entry.rateUnit && (
                                <div className="mt-1 text-xs text-default-500 dark:text-gray-400">
                                  Unit: {entry.rateUnit}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Date(s) */}
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-default-600 dark:text-gray-300 mb-1">
                              Date(s)
                            </label>
                            <MonthDayMultiPicker
                              year={currentYear}
                              month={currentMonth}
                              selectedDates={entry.dates}
                              onChange={(dates) =>
                                handleEntryChange(index, "dates", dates)
                              }
                              disabled={isSaving}
                            />
                          </div>

                          {/* Row 3: Rate / Qty / Amount */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                            <FormInput
                              name={`rate-${entry.id}`}
                              label="Rate (RM)"
                              type="number"
                              value={entry.rate}
                              onChange={(e) =>
                                handleEntryChange(index, "rate", e.target.value)
                              }
                              placeholder="0.00"
                              step="0.01"
                              min={0}
                            />
                            <FormInput
                              name={`quantity-${entry.id}`}
                              label={`Quantity${entry.rateUnit ? ` (${entry.rateUnit})` : ""}`}
                              type="number"
                              value={entry.quantity}
                              onChange={(e) =>
                                handleEntryChange(index, "quantity", e.target.value)
                              }
                              placeholder="1"
                              step={stepVal}
                              min={0}
                            />
                            <div className="space-y-2">
                              <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
                                {isLinked ? "Per-day amount" : "Amount"}
                              </label>
                              <div className="block w-full px-3 py-2 border border-default-200 dark:border-gray-700 rounded-lg shadow-sm bg-default-50 dark:bg-gray-900/40 text-sm font-medium text-default-800 dark:text-gray-100">
                                {formatCurrency(amount)}
                              </div>
                              {isLinked && (
                                <div className="text-xs text-default-500 dark:text-gray-400 text-right -mt-1">
                                  × {entry.dates.length} ={" "}
                                  <span className="font-medium text-default-700 dark:text-gray-200">
                                    {formatCurrency(totalForEntry)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row 4: Description */}
                          <FormInput
                            name={`description-${entry.id}`}
                            label="Description"
                            type="text"
                            value={entry.description}
                            onChange={(e) =>
                              handleEntryChange(
                                index,
                                "description",
                                e.target.value,
                              )
                            }
                            placeholder="Description"
                          />
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={addEntryRow}
                      disabled={isSaving}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-default-300 dark:border-gray-600 px-4 py-3 text-sm font-medium text-default-600 hover:border-sky-400 hover:bg-sky-50/40 hover:text-sky-700 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <IconPlus size={16} />
                      Add another entry
                    </button>
                  </div>
                </div>

                {/* Footer (sticky) */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800 rounded-b-2xl">
                  <div className="text-sm text-default-600 dark:text-gray-300">
                    <span className="font-medium">
                      {totalRecordsToCreate} record
                      {totalRecordsToCreate === 1 ? "" : "s"}
                    </span>{" "}
                    · Total{" "}
                    <span className="font-medium text-default-800 dark:text-gray-100">
                      {formatCurrency(totalAmountAcrossAll)}
                    </span>
                  </div>
                  <div className="flex space-x-3">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      color="sky"
                      onClick={handleSave}
                      disabled={isSaving}
                      icon={IconDeviceFloppy}
                    >
                      {isSaving ? "Saving..." : `Save ${displayLabel}`}
                    </Button>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AddOthersModal;

// src/components/Payroll/AddOthersModal.tsx
import React, { useState, useMemo, Fragment, useEffect } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconDeviceFloppy,
  IconPlus,
  IconX,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import Button from "../Button";
import { FormInput } from "../FormComponents";
import { PayrollCalculationService } from "../../utils/payroll/payrollCalculationService";
import { RateUnit } from "../../types/types";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { useAuth } from "../../contexts/AuthContext";

interface OthersEntry {
  id: number; // local row key
  employeeId: string | null;
  payCodeId: string;
  description: string;
  rate: string;
  rateUnit: RateUnit | "";
  quantity: string;
}

interface AddOthersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentYear: number;
  currentMonth: number;
  displayLabel: string;
}

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

  const [recordDate, setRecordDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [entries, setEntries] = useState<OthersEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [staffQueries, setStaffQueries] = useState<Record<number, string>>({});
  const [payCodeQueries, setPayCodeQueries] = useState<Record<number, string>>(
    {}
  );

  // Pay codes available: Base + Tambahan + Overtime, active only
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

  // Default date to middle of selected month when modal opens, but keep today if it's in that month
  useEffect(() => {
    if (!isOpen) return;
    const today = new Date();
    const sameMonth =
      today.getFullYear() === currentYear &&
      today.getMonth() + 1 === currentMonth;
    const defaultDate = sameMonth
      ? today.toISOString().split("T")[0]
      : `${currentYear}-${currentMonth.toString().padStart(2, "0")}-15`;
    setRecordDate(defaultDate);
    setEntries([
      {
        id: Date.now(),
        employeeId: null,
        payCodeId: "",
        description: "",
        rate: "0",
        rateUnit: "",
        quantity: "1",
      },
    ]);
    setStaffQueries({});
    setPayCodeQueries({});
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

  const addEntryRow = (): void => {
    setEntries([
      ...entries,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        employeeId: null,
        payCodeId: "",
        description: "",
        rate: "0",
        rateUnit: "",
        quantity: "1",
      },
    ]);
  };

  const removeEntryRow = (id: number): void => {
    if (entries.length <= 1) return;
    setEntries(entries.filter((entry) => entry.id !== id));
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
  };

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
        qty > 0
      );
    });

    if (valid.length === 0) {
      toast.error(
        `Please add at least one valid entry with staff, pay code, rate, quantity, and description.`
      );
      return;
    }

    setIsSaving(true);
    const promises = valid.map((e) => {
      const amount = computeAmount(e.rate, e.quantity, e.rateUnit);
      return api.post("/api/others-records", {
        employee_id: e.employeeId,
        record_date: recordDate,
        pay_code_id: e.payCodeId,
        description: e.description.trim(),
        rate: parseFloat(e.rate),
        rate_unit: e.rateUnit,
        quantity: parseFloat(e.quantity),
        amount,
        created_by: user?.id,
      });
    });

    try {
      await Promise.all(promises);
      toast.success(`${valid.length} ${displayLabel} record(s) saved successfully!`);
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
              <DialogPanel className="my-auto w-full max-w-6xl transform rounded-2xl border border-default-200 bg-white p-0 text-left align-middle shadow-xl ring-1 ring-black/5 transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40 dark:ring-white/10">
                <div className="px-6 py-4 border-b border-default-200 bg-default-50 dark:border-gray-700 dark:bg-gray-900/60">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800 dark:text-default-100"
                  >
                    Record Staff {displayLabel}
                  </DialogTitle>
                </div>

                <div className="px-6 py-4 text-default-800 dark:text-gray-100">
                  <div className="max-w-xs mb-4">
                    <FormInput
                      name="recordDate"
                      label={`${displayLabel} Date`}
                      type="date"
                      value={recordDate}
                      onChange={(e) => setRecordDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className="py-2 text-left font-medium text-default-600 dark:text-default-400 min-w-[220px]">
                            Staff
                          </th>
                          <th className="py-2 px-3 text-left font-medium text-default-600 dark:text-default-400 min-w-[260px]">
                            Pay Code
                          </th>
                          <th className="py-2 px-3 text-left font-medium text-default-600 dark:text-default-400 w-28">
                            Rate
                          </th>
                          <th className="py-2 px-3 text-left font-medium text-default-600 dark:text-default-400 w-28">
                            Qty
                          </th>
                          <th className="py-2 px-3 text-right font-medium text-default-600 dark:text-default-400 w-32">
                            Amount
                          </th>
                          <th className="py-2 px-3 text-left font-medium text-default-600 dark:text-default-400 min-w-[200px]">
                            Description
                          </th>
                          <th className="py-2 text-left font-medium text-default-600 dark:text-default-400 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-default-100 dark:divide-gray-700/70">
                        {entries.map((entry, index) => {
                          const amount = computeAmount(
                            entry.rate,
                            entry.quantity,
                            entry.rateUnit
                          );
                          const stepVal =
                            entry.rateUnit === "Hour" || entry.rateUnit === "Bill"
                              ? "0.5"
                              : "1";
                          const pcQuery = payCodeQueries[entry.id] || "";
                          const filteredPayCodes =
                            pcQuery === ""
                              ? availablePayCodes
                              : availablePayCodes.filter((pc) =>
                                  `${pc.id.toLowerCase()} ${pc.description.toLowerCase()}`.includes(
                                    pcQuery.toLowerCase()
                                  )
                                );
                          return (
                            <tr
                              key={entry.id}
                              className="group transition-colors duration-150 hover:bg-sky-50/60 dark:hover:bg-sky-900/20"
                            >
                              <td className="py-2 align-top">
                                <Combobox
                                  value={entry.employeeId || ""}
                                  onChange={(value: string | null) =>
                                    handleEntryChange(
                                      index,
                                      "employeeId",
                                      value || null
                                    )
                                  }
                                  disabled={isSaving}
                                >
                                  <div className="relative">
                                    <ComboboxInput
                                      className="w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 sm:text-sm"
                                      displayValue={(empId: string) => {
                                        const selected = allStaffOptions.find(
                                          (s) => s.id === empId
                                        );
                                        return selected ? selected.name : "";
                                      }}
                                      onChange={(event) =>
                                        setStaffQueries((prev) => ({
                                          ...prev,
                                          [entry.id]: event.target.value,
                                        }))
                                      }
                                      placeholder="Select Staff..."
                                    />
                                    <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                                      <IconChevronDown
                                        size={20}
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
                                    afterLeave={() =>
                                      setStaffQueries((prev) => ({
                                        ...prev,
                                        [entry.id]: "",
                                      }))
                                    }
                                  >
                                    <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-[260px] overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-gray-700 focus:outline-none sm:text-sm">
                                      {(() => {
                                        const sQuery =
                                          staffQueries[entry.id] || "";
                                        const filteredStaff =
                                          sQuery === ""
                                            ? allStaffOptions
                                            : allStaffOptions.filter((s) =>
                                                s.name
                                                  .toLowerCase()
                                                  .includes(
                                                    sQuery.toLowerCase()
                                                  )
                                              );
                                        if (filteredStaff.length === 0) {
                                          return (
                                            <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                                              No staff found.
                                            </div>
                                          );
                                        }
                                        return filteredStaff
                                          .slice(0, 50)
                                          .map((s) => (
                                            <ComboboxOption
                                              key={s.id}
                                              value={s.id}
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
                                                  <span
                                                    className={`block truncate ${
                                                      selected
                                                        ? "font-medium"
                                                        : "font-normal"
                                                    }`}
                                                  >
                                                    {s.name}
                                                  </span>
                                                  {selected ? (
                                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-300">
                                                      <IconCheck
                                                        size={20}
                                                        aria-hidden="true"
                                                      />
                                                    </span>
                                                  ) : null}
                                                </>
                                              )}
                                            </ComboboxOption>
                                          ));
                                      })()}
                                    </ComboboxOptions>
                                  </Transition>
                                </Combobox>
                              </td>
                              <td className="py-2 px-3 align-top">
                                <Combobox
                                  value={entry.payCodeId}
                                  onChange={(value: string | null) =>
                                    handlePayCodeChange(index, value || "")
                                  }
                                  disabled={isSaving}
                                >
                                  <div className="relative">
                                    <ComboboxInput
                                      className="w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 sm:text-sm"
                                      displayValue={(code: string) => {
                                        const selected =
                                          availablePayCodes.find(
                                            (pc) => pc.id === code
                                          );
                                        return selected
                                          ? `${selected.id} - ${selected.description}`
                                          : "";
                                      }}
                                      onChange={(event) =>
                                        setPayCodeQueries((prev) => ({
                                          ...prev,
                                          [entry.id]: event.target.value,
                                        }))
                                      }
                                      placeholder="Search pay code..."
                                    />
                                    <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                                      <IconChevronDown
                                        size={20}
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
                                    afterLeave={() =>
                                      setPayCodeQueries((prev) => ({
                                        ...prev,
                                        [entry.id]: "",
                                      }))
                                    }
                                  >
                                    <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-[300px] overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-gray-700 focus:outline-none sm:text-sm">
                                      {filteredPayCodes.length === 0 ? (
                                        <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                                          No pay codes found.
                                        </div>
                                      ) : (
                                        filteredPayCodes.slice(0, 50).map((pc) => (
                                          <ComboboxOption
                                            key={pc.id}
                                            value={pc.id}
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
                                                {selected ? (
                                                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-300">
                                                    <IconCheck
                                                      size={20}
                                                      aria-hidden="true"
                                                    />
                                                  </span>
                                                ) : null}
                                              </>
                                            )}
                                          </ComboboxOption>
                                        ))
                                      )}
                                    </ComboboxOptions>
                                  </Transition>
                                </Combobox>
                                {entry.rateUnit && (
                                  <div className="mt-1 text-xs text-default-500 dark:text-gray-400">
                                    Unit: {entry.rateUnit}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 align-top">
                                <FormInput
                                  name={`rate-${index}`}
                                  label=""
                                  type="number"
                                  value={entry.rate}
                                  onChange={(e) =>
                                    handleEntryChange(
                                      index,
                                      "rate",
                                      e.target.value
                                    )
                                  }
                                  placeholder="0.00"
                                  step="0.01"
                                  min={0}
                                />
                              </td>
                              <td className="py-2 px-3 align-top">
                                <FormInput
                                  name={`quantity-${index}`}
                                  label=""
                                  type="number"
                                  value={entry.quantity}
                                  onChange={(e) =>
                                    handleEntryChange(
                                      index,
                                      "quantity",
                                      e.target.value
                                    )
                                  }
                                  placeholder="1"
                                  step={stepVal}
                                  min={0}
                                />
                              </td>
                              <td className="py-2 px-3 align-top text-right text-sm font-medium text-default-800 dark:text-gray-100">
                                {formatCurrency(amount)}
                              </td>
                              <td className="py-2 px-3 align-top">
                                <FormInput
                                  name={`description-${index}`}
                                  label=""
                                  type="text"
                                  value={entry.description}
                                  onChange={(e) =>
                                    handleEntryChange(
                                      index,
                                      "description",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Description"
                                />
                              </td>
                              <td className="py-2 align-top">
                                {entries.length > 1 && (
                                  <button
                                    onClick={() => removeEntryRow(entry.id)}
                                    className="p-2 rounded-full text-default-400 opacity-0 transition-all duration-150 hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-rose-900/40 dark:hover:text-rose-300"
                                    title="Remove row"
                                  >
                                    <IconX size={18} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between items-center mt-6 border-t border-default-200 bg-white pt-6 dark:border-gray-700 dark:bg-gray-800">
                    <Button
                      variant="outline"
                      onClick={addEntryRow}
                      icon={IconPlus}
                    >
                      Add Row
                    </Button>
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

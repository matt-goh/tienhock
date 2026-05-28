// src/components/Payroll/EditOthersModal.tsx
import React, { useState, useEffect, useMemo, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import {
  IconDeviceFloppy,
  IconChevronDown,
  IconCheck,
  IconLink,
} from "@tabler/icons-react";
import { format } from "date-fns";
import Button from "../Button";
import { FormInput } from "../FormComponents";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { PayrollCalculationService } from "../../utils/payroll/payrollCalculationService";
import { OthersRecord, PayCode, RateUnit } from "../../types/types";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import MonthDayMultiPicker from "./MonthDayMultiPicker";

interface EditOthersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  record: OthersRecord | null;
  displayLabel: string;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const PAY_CODE_PAGE_SIZE = 50;

const toLocalYmd = (value: string): string => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return format(new Date(value), "yyyy-MM-dd");
};

const EditOthersModal: React.FC<EditOthersModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  record,
  displayLabel,
}) => {
  const { payCodes } = useJobPayCodeMappings();

  const [recordDate, setRecordDate] = useState("");
  const [linkedDates, setLinkedDates] = useState<string[]>([]);
  const [linkedYear, setLinkedYear] = useState<number>(new Date().getFullYear());
  const [linkedMonth, setLinkedMonth] = useState<number>(
    new Date().getMonth() + 1,
  );
  const [payCodeId, setPayCodeId] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("0");
  const [rateUnit, setRateUnit] = useState<RateUnit | "">("");
  const [quantity, setQuantity] = useState("1");
  const [pcQuery, setPcQuery] = useState("");
  const [loadedPayCodeCount, setLoadedPayCodeCount] =
    useState<number>(PAY_CODE_PAGE_SIZE);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSiblings, setIsLoadingSiblings] = useState(false);

  const isLinked = Boolean(record?.link_id);

  const availablePayCodes = useMemo((): PayCode[] => {
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

  const filteredPayCodes = useMemo((): PayCode[] => {
    if (pcQuery === "") return availablePayCodes;
    return availablePayCodes.filter((pc) =>
      `${pc.id.toLowerCase()} ${pc.description.toLowerCase()}`.includes(
        pcQuery.toLowerCase()
      )
    );
  }, [availablePayCodes, pcQuery]);

  const visiblePayCodes = useMemo((): PayCode[] => {
    return filteredPayCodes.slice(0, loadedPayCodeCount);
  }, [filteredPayCodes, loadedPayCodeCount]);

  const remainingPayCodeCount = useMemo((): number => {
    return Math.max(filteredPayCodes.length - visiblePayCodes.length, 0);
  }, [filteredPayCodes.length, visiblePayCodes.length]);

  useEffect(() => {
    if (!isOpen || !record) return;
    const dateStr = record.record_date
      ? toLocalYmd(record.record_date)
      : format(new Date(), "yyyy-MM-dd");
    setRecordDate(dateStr);
    setPayCodeId(record.pay_code_id || "");
    setDescription(record.description || "");
    setRate(String(record.rate ?? 0));
    setRateUnit((record.rate_unit as RateUnit) || "");
    setQuantity(String(record.quantity ?? 1));
    setPcQuery("");
    setLoadedPayCodeCount(PAY_CODE_PAGE_SIZE);

    if (record.link_id) {
      const [y, m] = dateStr.split("-").map((s) => parseInt(s, 10));
      setLinkedYear(y);
      setLinkedMonth(m);
      setLinkedDates([dateStr]);
      setIsLoadingSiblings(true);
      api
        .get(`/api/others-records?link_id=${record.link_id}`)
        .then((rows: OthersRecord[]) => {
          const dates = rows
            .map((r) => toLocalYmd(r.record_date))
            .filter((d) => Boolean(d))
            .sort();
          if (dates.length > 0) {
            setLinkedDates(dates);
            const [yy, mm] = dates[0].split("-").map((s) => parseInt(s, 10));
            setLinkedYear(yy);
            setLinkedMonth(mm);
          }
        })
        .catch((err) => {
          console.error("Failed to load linked siblings:", err);
          toast.error("Failed to load linked dates for this entry.");
        })
        .finally(() => setIsLoadingSiblings(false));
    } else {
      setLinkedDates([]);
    }
  }, [isOpen, record]);

  const handlePayCodeChange = (newId: string): void => {
    setPayCodeId(newId);
    const pc = availablePayCodes.find((p) => p.id === newId);
    if (pc) {
      setRateUnit(pc.rate_unit as RateUnit);
    }
  };

  const handlePayCodeQueryChange = (value: string): void => {
    setPcQuery(value);
    setLoadedPayCodeCount(PAY_CODE_PAGE_SIZE);
  };

  const handleLoadMorePayCodes = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    setLoadedPayCodeCount((prev) => prev + PAY_CODE_PAGE_SIZE);
  };

  const calculatedAmount = useMemo(() => {
    const r = parseFloat(rate || "0");
    const q = parseFloat(quantity || "0");
    if (!isFinite(r) || !isFinite(q) || !rateUnit) return 0;
    try {
      return PayrollCalculationService.calculateAmount(r, q, rateUnit as RateUnit);
    } catch {
      return 0;
    }
  }, [rate, quantity, rateUnit]);

  const handleSave = async (): Promise<void> => {
    if (!record) return;
    if (!payCodeId || !rateUnit || !description.trim()) {
      toast.error("Pay code, description, and rate unit are required.");
      return;
    }
    const r = parseFloat(rate);
    const q = parseFloat(quantity);
    if (!isFinite(r) || r <= 0 || !isFinite(q) || q <= 0) {
      toast.error("Rate and quantity must be positive numbers.");
      return;
    }
    if (isLinked && linkedDates.length === 0) {
      toast.error("Linked entry must keep at least one date.");
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        pay_code_id: payCodeId,
        description: description.trim(),
        rate: r,
        rate_unit: rateUnit,
        quantity: q,
        amount: calculatedAmount,
      };
      if (isLinked) {
        payload.record_dates = [...linkedDates].sort();
      } else {
        payload.record_date = recordDate;
      }
      await api.put(`/api/others-records/${record.id}`, payload);
      toast.success(
        isLinked
          ? `Linked ${displayLabel} entry updated (${linkedDates.length} date${
              linkedDates.length === 1 ? "" : "s"
            }).`
          : `${displayLabel} record updated.`
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Failed to update Others record:", error);
      toast.error(
        error.response?.data?.message || `Failed to update ${displayLabel} record.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!record) return null;

  const stepVal = rateUnit === "Hour" || rateUnit === "Bill" ? "0.5" : "1";

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => !isSaving && onClose()}
      >
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
              <DialogPanel className="my-auto w-full max-w-2xl transform rounded-2xl border border-default-200 bg-white text-left align-middle shadow-xl ring-1 ring-black/5 transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40 dark:ring-white/10 flex flex-col max-h-[calc(100vh-3rem)]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-default-200 bg-default-50 dark:border-gray-700 dark:bg-gray-900/60 rounded-t-2xl">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800 dark:text-default-100"
                  >
                    Edit {displayLabel}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                    <span className="font-medium text-default-700 dark:text-gray-200">
                      {record.employee_name}
                    </span>{" "}
                    ({record.employee_id})
                  </p>
                </div>

                {/* Body (scrollable) */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {/* Linked banner */}
                  {isLinked && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-800/60 dark:bg-sky-900/30 dark:text-sky-100">
                      <div className="flex items-center gap-1.5 font-medium">
                        <IconLink size={16} />
                        Linked entry
                        {isLoadingSiblings && (
                          <span className="text-xs text-sky-700 dark:text-sky-300 font-normal">
                            (loading dates…)
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-sky-800/90 dark:text-sky-200/90">
                        Pay code, rate, quantity, and description below apply to
                        every linked date. Check or uncheck days in the date
                        picker to add or remove them from this group.
                      </p>
                    </div>
                  )}

                  {/* Date(s) + Pay code */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-default-600 dark:text-gray-300 mb-1">
                        {isLinked
                          ? `Linked dates (${linkedDates.length} selected)`
                          : "Date"}
                      </label>
                      {isLinked ? (
                        <MonthDayMultiPicker
                          year={linkedYear}
                          month={linkedMonth}
                          selectedDates={linkedDates}
                          onChange={setLinkedDates}
                          disabled={isSaving || isLoadingSiblings}
                        />
                      ) : (
                        <input
                          name="recordDate"
                          type="date"
                          value={recordDate}
                          onChange={(e) => setRecordDate(e.target.value)}
                          required
                          className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 px-3 text-sm text-default-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-default-600 dark:text-gray-300 mb-1">
                        Pay code
                      </label>
                      <Combobox
                        value={payCodeId}
                        onChange={(v: string | null) =>
                          handlePayCodeChange(v || "")
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
                              handlePayCodeQueryChange(event.target.value)
                            }
                            placeholder="Search pay code..."
                          />
                          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                            <IconChevronDown
                              size={18}
                              className="text-gray-400 dark:text-gray-500"
                            />
                          </ComboboxButton>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                            afterLeave={() => {
                              setPcQuery("");
                              setLoadedPayCodeCount(PAY_CODE_PAGE_SIZE);
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
                                        onClick={handleLoadMorePayCodes}
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
                      {rateUnit && (
                        <div className="mt-1 text-xs text-default-500 dark:text-gray-400">
                          Unit: {rateUnit}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rate / Qty / Per-day amount */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormInput
                      name="rate"
                      label="Rate (RM)"
                      type="number"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      step="0.01"
                      min={0}
                      required
                    />
                    <FormInput
                      name="quantity"
                      label={`Quantity${rateUnit ? ` (${rateUnit})` : ""}`}
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      step={stepVal}
                      min={0}
                      required
                    />
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
                        {isLinked ? "Per-day amount" : "Amount"}
                      </label>
                      <div className="block w-full px-3 py-2 border border-default-200 dark:border-gray-700 rounded-lg shadow-sm bg-default-50 dark:bg-gray-900/40 text-sm font-medium text-default-800 dark:text-gray-100">
                        {formatCurrency(calculatedAmount)}
                      </div>
                      {isLinked && linkedDates.length > 0 && (
                        <div className="text-xs text-default-500 dark:text-gray-400 text-right -mt-1">
                          × {linkedDates.length} ={" "}
                          <span className="font-medium text-default-700 dark:text-gray-200">
                            {formatCurrency(calculatedAmount * linkedDates.length)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <FormInput
                    name="description"
                    label="Description"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>

                {/* Footer (sticky) */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800 rounded-b-2xl">
                  <div className="text-sm text-default-600 dark:text-gray-300">
                    {isLinked ? (
                      <>
                        <span className="font-medium">
                          {linkedDates.length} date
                          {linkedDates.length === 1 ? "" : "s"}
                        </span>{" "}
                        · Total{" "}
                        <span className="font-medium text-default-800 dark:text-gray-100">
                          {formatCurrency(calculatedAmount * linkedDates.length)}
                        </span>
                      </>
                    ) : (
                      <>
                        Total{" "}
                        <span className="font-medium text-default-800 dark:text-gray-100">
                          {formatCurrency(calculatedAmount)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      color="sky"
                      variant="filled"
                      onClick={handleSave}
                      disabled={isSaving}
                      icon={IconDeviceFloppy}
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
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

export default EditOthersModal;

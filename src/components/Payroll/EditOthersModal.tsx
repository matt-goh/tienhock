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
} from "@tabler/icons-react";
import Button from "../Button";
import { FormInput } from "../FormComponents";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { PayrollCalculationService } from "../../utils/payroll/payrollCalculationService";
import { OthersRecord, PayCode, RateUnit } from "../../types/types";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

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

const EditOthersModal: React.FC<EditOthersModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  record,
  displayLabel,
}) => {
  const { payCodes } = useJobPayCodeMappings();

  const [recordDate, setRecordDate] = useState("");
  const [payCodeId, setPayCodeId] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("0");
  const [rateUnit, setRateUnit] = useState<RateUnit | "">("");
  const [quantity, setQuantity] = useState("1");
  const [pcQuery, setPcQuery] = useState("");
  const [loadedPayCodeCount, setLoadedPayCodeCount] =
    useState<number>(PAY_CODE_PAGE_SIZE);
  const [isSaving, setIsSaving] = useState(false);

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
    if (isOpen && record) {
      const dateStr = record.record_date
        ? new Date(record.record_date).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      setRecordDate(dateStr);
      setPayCodeId(record.pay_code_id || "");
      setDescription(record.description || "");
      setRate(String(record.rate ?? 0));
      setRateUnit((record.rate_unit as RateUnit) || "");
      setQuantity(String(record.quantity ?? 1));
      setPcQuery("");
      setLoadedPayCodeCount(PAY_CODE_PAGE_SIZE);
    }
  }, [isOpen, record]);

  const handlePayCodeChange = (newId: string): void => {
    setPayCodeId(newId);
    const pc = availablePayCodes.find((p) => p.id === newId);
    if (pc) {
      setRateUnit(pc.rate_unit as RateUnit);
      // Don't overwrite rate/description if user already edited them; only update unit
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
    setIsSaving(true);
    try {
      await api.put(`/api/others-records/${record.id}`, {
        record_date: recordDate,
        pay_code_id: payCodeId,
        description: description.trim(),
        rate: r,
        rate_unit: rateUnit,
        quantity: q,
        amount: calculatedAmount,
      });
      toast.success(`${displayLabel} record updated.`);
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
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md transform overflow-visible rounded-2xl bg-white dark:bg-gray-800 border border-transparent dark:border-gray-700 p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  Edit {displayLabel}
                </DialogTitle>

                <div className="mt-4 space-y-4">
                  <div className="text-sm text-default-600 dark:text-gray-400">
                    Employee:{" "}
                    <span className="font-medium text-default-800 dark:text-gray-100">
                      {record.employee_name} ({record.employee_id})
                    </span>
                  </div>

                  <FormInput
                    name="recordDate"
                    label="Date"
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    required
                  />

                  <div>
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                      Pay Code
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
                          className="w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 sm:text-sm"
                          displayValue={(code: string) => {
                            const selected = availablePayCodes.find(
                              (pc) => pc.id === code
                            );
                            return selected
                              ? `${selected.id} - ${selected.description}`
                              : "";
                          }}
                          onChange={(event) =>
                            handlePayCodeQueryChange(event.target.value)
                          }
                          placeholder="Search pay code..."
                        />
                        <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                          <IconChevronDown
                            size={20}
                            className="text-gray-400 dark:text-gray-500"
                          />
                        </ComboboxButton>
                      </div>
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
                        <ComboboxOptions className="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-gray-700 focus:outline-none sm:text-sm">
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
                                          <IconCheck size={20} />
                                        </span>
                                      ) : null}
                                    </>
                                  )}
                                </ComboboxOption>
                              ))}
                              {remainingPayCodeCount > 0 && (
                                <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                                  <button
                                    type="button"
                                    onClick={handleLoadMorePayCodes}
                                    className="w-full rounded-md bg-sky-50 px-4 py-1.5 text-sm font-medium text-sky-600 transition-colors duration-200 hover:bg-sky-100 disabled:opacity-50 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50"
                                    disabled={isSaving}
                                  >
                                    <span className="inline-flex items-center justify-center">
                                      <IconChevronDown
                                        size={16}
                                        className="mr-1.5"
                                      />
                                      Load More Paycodes (
                                      {remainingPayCodeCount} remaining)
                                    </span>
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </ComboboxOptions>
                      </Transition>
                    </Combobox>
                    {rateUnit && (
                      <div className="mt-1 text-xs text-default-500 dark:text-gray-400">
                        Unit: {rateUnit}
                      </div>
                    )}
                  </div>

                  <FormInput
                    name="description"
                    label="Description"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />

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
                    step={rateUnit === "Hour" || rateUnit === "Bill" ? "0.5" : "1"}
                    min={0}
                    required
                  />

                  <div className="bg-default-50 dark:bg-gray-900/50 border border-default-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-default-700 dark:text-gray-200">
                        Calculated Amount:
                      </span>
                      <span className="text-lg font-semibold text-default-800 dark:text-gray-100">
                        {formatCurrency(calculatedAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
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
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default EditOthersModal;

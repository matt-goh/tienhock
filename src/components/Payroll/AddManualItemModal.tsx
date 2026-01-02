// src/components/Payroll/AddManualItemModal.tsx - Updated version with pagination and combobox

import React, { useState, useEffect, Fragment, useMemo } from "react";
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
} from "@headlessui/react";
import Button from "../Button";
import { FormInput } from "../FormComponents";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { addManualPayrollItem } from "../../utils/payroll/payrollUtils";
import { PayrollCalculationService } from "../../utils/payroll/payrollCalculationService";
import { RateUnit } from "../../types/types";
import toast from "react-hot-toast";
import {
  IconInfoCircle,
  IconCurrencyDollar,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";

interface AddManualItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeePayrollId: number;
  onItemAdded: () => void;
  employeeJobType?: string; // Optional job type for filtering pay codes
}

interface PayCodeOption {
  id: string;
  name: string;
  rate_unit: RateUnit;
  rate_biasa: number;
  description: string;
  pay_type?: string;
}

const AddManualItemModal: React.FC<AddManualItemModalProps> = ({
  isOpen,
  onClose,
  employeePayrollId,
  onItemAdded,
  employeeJobType,
}) => {
  const {
    payCodes,
    detailedMappings,
    loading: loadingPayCodes,
  } = useJobPayCodeMappings();

  const [selectedPayCode, setSelectedPayCode] = useState<string>("");
  const [customDescription, setCustomDescription] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [rate, setRate] = useState<string>("0");
  const [calculatedAmount, setCalculatedAmount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(""); // New state for search query
  const [loadedItemCount, setLoadedItemCount] = useState(20); // For pagination

  // Get all available pay codes that can be used for manual addition
  const availablePayCodes: PayCodeOption[] = useMemo(() => {
    const tambahan = payCodes
      .filter((code) => code.pay_type === "Tambahan" && code.is_active)
      .map((code) => ({
        id: code.id,
        name: code.description,
        rate_unit: code.rate_unit,
        rate_biasa: code.rate_biasa,
        description: code.description,
      }));

    // If we have a specific job type, check for job-specific pay codes
    if (employeeJobType && detailedMappings[employeeJobType]) {
      return tambahan.map((code) => {
        // Check if there's a job-specific rate override
        const jobSpecific = detailedMappings[employeeJobType].find(
          (jpc) => jpc.pay_code_id === code.id
        );

        if (jobSpecific && jobSpecific.override_rate_biasa !== null) {
          return {
            ...code,
            rate_biasa: jobSpecific.override_rate_biasa,
            // Indicate this is job-specific in the name
            name: `${code.name} (Job: ${employeeJobType})`,
          };
        }

        return code;
      });
    }

    return tambahan;
  }, [payCodes, detailedMappings, employeeJobType]);

  // Filter pay codes based on search query and limit by loadedItemCount
  const filteredPayCodes = useMemo(() => {
    const filtered =
      query === ""
        ? availablePayCodes
        : availablePayCodes.filter((code) =>
            `${code.id.toLowerCase()} ${code.description.toLowerCase()}`.includes(
              query.toLowerCase()
            )
          );

    // Only return the first loadedItemCount items
    return filtered.slice(0, loadedItemCount);
  }, [availablePayCodes, query, loadedItemCount]);

  // Check if there are more items to load
  const hasMoreItems = useMemo(() => {
    const totalFiltered =
      query === ""
        ? availablePayCodes.length
        : availablePayCodes.filter((code) =>
            `${code.id.toLowerCase()} ${code.description.toLowerCase()}`.includes(
              query.toLowerCase()
            )
          ).length;

    return totalFiltered > loadedItemCount;
  }, [availablePayCodes, query, loadedItemCount]);

  // Handle load more button click
  const handleLoadMore = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoadedItemCount((prev) => prev + 20);
  };

  // Reset loadedItemCount when query changes
  useEffect(() => {
    setLoadedItemCount(20);
  }, [query]);

  // Sort pay codes alphabetically
  const sortedPayCodes = useMemo(() => {
    return [...filteredPayCodes].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredPayCodes]);

  // Get selected pay code details
  const selectedPayCodeDetails = availablePayCodes.find(
    (code) => code.id === selectedPayCode
  );

  // Reset form when modal is opened
  useEffect(() => {
    if (isOpen) {
      setSelectedPayCode("");
      setCustomDescription("");
      setQuantity("1");
      setRate("0");
      setCalculatedAmount(0);
      setError(null);
      setQuery(""); // Reset search query
    }
  }, [isOpen]);

  // Update rate when pay code is selected
  useEffect(() => {
    if (selectedPayCodeDetails) {
      setRate(selectedPayCodeDetails.rate_biasa.toString());
      setCustomDescription(selectedPayCodeDetails.description);
    } else {
      setRate("0");
      setCustomDescription("");
    }
  }, [selectedPayCodeDetails]);

  // Calculate amount when rate or quantity changes
  useEffect(() => {
    if (selectedPayCodeDetails) {
      try {
        const calculatedAmount = PayrollCalculationService.calculateAmount(
          parseFloat(rate || "0"),
          parseFloat(quantity || "0"),
          selectedPayCodeDetails.rate_unit
        );
        setCalculatedAmount(calculatedAmount);
        setError(null);
      } catch (err) {
        setError("Invalid calculation. Please check your values.");
      }
    }
  }, [rate, quantity, selectedPayCodeDetails]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPayCodeDetails) {
      setError("Please select a pay code");
      return;
    }

    if (!customDescription.trim()) {
      setError("Description is required");
      return;
    }

    if (parseFloat(quantity) <= 0 || isNaN(parseFloat(quantity)) || !isFinite(parseFloat(quantity))) {
      setError("Quantity must be a valid number greater than 0");
      return;
    }

    if (parseFloat(rate) <= 0 || isNaN(parseFloat(rate)) || !isFinite(parseFloat(rate))) {
      setError("Rate must be a valid number greater than 0");
      return;
    }

    // Validate calculated amount
    const calculatedAmount = parseFloat(rate) * parseFloat(quantity);
    if (isNaN(calculatedAmount) || !isFinite(calculatedAmount)) {
      setError("Calculated amount is invalid. Please check your inputs.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await addManualPayrollItem(employeePayrollId, {
        pay_code_id: selectedPayCode,
        description: customDescription.trim(),
        pay_type: selectedPayCodeDetails.pay_type || "Tambahan",
        rate: parseFloat(rate),
        rate_unit: selectedPayCodeDetails.rate_unit,
        quantity: parseFloat(quantity),
      });

      toast.success("Manual item added successfully");
      onItemAdded();
      onClose();
    } catch (error) {
      console.error("Error adding manual item:", error);
      setError("Failed to add manual item. Please try again.");
      toast.error("Failed to add manual item");
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  Add Manual Payroll Item
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3 mb-4">
                    <div className="flex gap-2">
                      <div className="flex-shrink-0">
                        <IconInfoCircle className="h-5 w-5 text-sky-500 dark:text-sky-400" />
                      </div>
                      <div className="text-sm text-sky-700 dark:text-sky-300">
                        <p>
                          Add a manual "Tambahan" item to this employee's
                          payroll. This is for additional pay not captured
                          through regular work logs.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Pay Code Selection - Now using Combobox instead of FormListbox */}
                  <div>
                    <label className="block text-sm font-medium text-default-700 mb-1">
                      Pay Code
                    </label>
                    <div className="relative">
                      <Combobox
                        value={selectedPayCode}
                        onChange={(value: string | null) =>
                          setSelectedPayCode(value || "")
                        }
                        disabled={isSaving}
                      >
                        <div className="relative">
                          <ComboboxInput
                            className="w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            displayValue={(code: string) => {
                              const selected = availablePayCodes.find(
                                (pc) => pc.id === code
                              );
                              return selected
                                ? `${selected.id} - ${selected.description}`
                                : "";
                            }}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search pay code..."
                          />
                          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                            <IconChevronDown
                              size={20}
                              className="text-gray-400"
                              aria-hidden="true"
                            />
                          </ComboboxButton>
                        </div>
                        <Transition
                          as={Fragment}
                          leave="transition ease-in duration-100"
                          leaveFrom="opacity-100"
                          leaveTo="opacity-0"
                          afterLeave={() => setQuery("")}
                        >
                          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                            {sortedPayCodes.length === 0 ? (
                              <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                                Nothing found.
                              </div>
                            ) : (
                              sortedPayCodes.map((code) => (
                                <ComboboxOption
                                  key={code.id}
                                  value={code.id}
                                  className={({ active }) =>
                                    `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                      active
                                        ? "bg-sky-100 text-sky-900"
                                        : "text-gray-900"
                                    }`
                                  }
                                >
                                  {({ selected, active }) => (
                                    <>
                                      <span
                                        className={`block truncate ${
                                          selected
                                            ? "font-medium"
                                            : "font-normal"
                                        }`}
                                      >
                                        {code.id} - {code.description}
                                      </span>
                                      {selected ? (
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
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
                            {/* Load More Button */}
                            {hasMoreItems && (
                              <div className="border-t border-gray-200 p-2">
                                <button
                                  type="button"
                                  onClick={handleLoadMore}
                                  className="w-full text-center py-1.5 px-4 text-sm font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors duration-200 disabled:opacity-50 flex items-center justify-center"
                                  disabled={isSaving}
                                >
                                  <IconChevronDown
                                    size={16}
                                    className="mr-1.5"
                                  />
                                  <span>
                                    Load More Pay Codes (
                                    {availablePayCodes.length - loadedItemCount}{" "}
                                    remaining)
                                  </span>
                                </button>
                              </div>
                            )}
                          </ComboboxOptions>
                        </Transition>
                      </Combobox>
                    </div>
                  </div>

                  {/* Custom Description */}
                  <FormInput
                    name="description"
                    label="Description"
                    type="text"
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    required
                    placeholder="Enter description"
                  />

                  {selectedPayCodeDetails && (
                    <div className="mt-2 bg-default-50 border border-default-200 rounded-lg p-3">
                      <div className="text-sm text-default-700">
                        <p className="font-medium">Pay Code Details:</p>
                        <p className="mt-1">
                          <span className="text-default-500">Rate Unit:</span>{" "}
                          {selectedPayCodeDetails.rate_unit}
                        </p>
                        <p>
                          <span className="text-default-500">
                            Default Rate:
                          </span>{" "}
                          {formatCurrency(selectedPayCodeDetails.rate_biasa)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Rate */}
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

                  {/* Quantity */}
                  <FormInput
                    name="quantity"
                    label={`Quantity ${
                      selectedPayCodeDetails
                        ? `(${selectedPayCodeDetails.rate_unit})`
                        : ""
                    }`}
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    step={
                      selectedPayCodeDetails?.rate_unit === "Hour" ? "0.5" : "1"
                    }
                    min={0}
                    required
                  />

                  {/* Calculated Amount */}
                  <div className="bg-default-50 border border-default-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-default-700">
                        Calculated Amount:
                      </span>
                      <span className="text-lg font-semibold text-default-800 flex items-center">
                        <IconCurrencyDollar
                          className="text-emerald-500 mr-1"
                          size={20}
                        />
                        {formatCurrency(calculatedAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-default-500 mt-1">
                      Formula: Rate × Quantity = Amount
                    </p>
                  </div>

                  {error && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-600">
                      {error}
                    </div>
                  )}

                  <div className="mt-8 flex justify-end space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={
                        isSaving ||
                        !selectedPayCode ||
                        !customDescription.trim() ||
                        parseFloat(quantity) <= 0 ||
                        parseFloat(rate) <= 0
                      }
                    >
                      {isSaving ? "Adding..." : "Add Item"}
                    </Button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AddManualItemModal;

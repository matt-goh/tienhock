// src/components/Payroll/AddManualItemModal.tsx (Enhanced)
import React, { useState, useEffect, Fragment, useMemo } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { FormInput, FormListbox } from "../FormComponents";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { addManualPayrollItem } from "../../utils/payroll/payrollUtils";
import { PayrollCalculationService } from "../../utils/payroll/payrollCalculationService";
import { RateUnit } from "../../types/types";
import toast from "react-hot-toast";
import { IconInfoCircle, IconCurrencyDollar } from "@tabler/icons-react";

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

  // Sort pay codes alphabetically
  const sortedPayCodes = useMemo(() => {
    return [...availablePayCodes].sort((a, b) => a.name.localeCompare(b.name));
  }, [availablePayCodes]);

  // Get selected pay code details
  const selectedPayCodeDetails = sortedPayCodes.find(
    (code: { id: string }) => code.id === selectedPayCode
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

    if (parseFloat(quantity) <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }

    if (parseFloat(rate) <= 0) {
      setError("Rate must be greater than 0");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await addManualPayrollItem(employeePayrollId, {
        pay_code_id: selectedPayCode,
        description: customDescription.trim(),
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
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Add Manual Payroll Item
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 mb-4">
                    <div className="flex gap-2">
                      <div className="flex-shrink-0">
                        <IconInfoCircle className="h-5 w-5 text-sky-500" />
                      </div>
                      <div className="text-sm text-sky-700">
                        <p>
                          Add a manual "Tambahan" item to this employee's
                          payroll. This is for additional pay not captured
                          through regular work logs.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Pay Code Selection */}
                  <FormListbox
                    name="payCode"
                    label="Pay Code"
                    value={selectedPayCode}
                    onChange={(value) => setSelectedPayCode(value)}
                    options={sortedPayCodes}
                    required
                    placeholder="Select a pay code"
                  />

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

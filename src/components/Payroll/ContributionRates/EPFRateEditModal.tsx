// src/components/Payroll/ContributionRates/EPFRateEditModal.tsx
import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../../Button";
import { FormInput } from "../../FormComponents";
import { EPFRate } from "../../../types/types";
import { api } from "../../../routes/utils/api";
import { refreshContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import toast from "react-hot-toast";

interface EPFRateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  rate: EPFRate | null;
}

const EPFRateEditModal: React.FC<EPFRateEditModalProps> = ({
  isOpen,
  onClose,
  rate,
}) => {
  const [formData, setFormData] = useState({
    employee_rate_percentage: "",
    employer_rate_percentage: "",
    employer_fixed_amount: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rate) {
      const isForeign = rate.employee_type.startsWith("foreign_");
      setFormData({
        employee_rate_percentage: rate.employee_rate_percentage.toString(),
        employer_rate_percentage:
          rate.employer_rate_percentage?.toString() || (isForeign ? "2" : ""),
        employer_fixed_amount: isForeign ? "" : (rate.employer_fixed_amount?.toString() || ""),
      });
    }
  }, [rate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rate) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Foreign workers should always have employer_fixed_amount as null
      const isForeign = rate.employee_type.startsWith("foreign_");

      const payload = {
        employee_type: rate.employee_type,
        wage_threshold: rate.wage_threshold,
        employee_rate_percentage: parseFloat(formData.employee_rate_percentage),
        employer_rate_percentage: formData.employer_rate_percentage
          ? parseFloat(formData.employer_rate_percentage)
          : null,
        employer_fixed_amount: isForeign
          ? null
          : (formData.employer_fixed_amount ? parseFloat(formData.employer_fixed_amount) : null),
      };

      await api.put(`/api/contribution-rates/epf/${rate.id}`, payload);

      // Refresh cache
      await refreshContributionRatesCache();

      toast.success("EPF rate updated successfully");
      onClose();
    } catch (error) {
      console.error("Error updating EPF rate:", error);
      setError("Failed to update EPF rate. Please try again.");
      toast.error("Failed to update EPF rate");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getEmployeeTypeLabel = (type: string) => {
    switch (type) {
      case "local_under_60":
        return "Local Employees (Under 60)";
      case "local_over_60":
        return "Local Employees (60 and Above)";
      case "foreign_under_60":
        return "Foreign Workers (Under 60)";
      case "foreign_over_60":
        return "Foreign Workers (60 and Above)";
      default:
        return type;
    }
  };

  const isForeignOver60 = rate?.employee_type === "foreign_over_60";

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
                  Edit EPF Rate
                </DialogTitle>

                {rate && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">
                      {getEmployeeTypeLabel(rate.employee_type)}
                      {rate.wage_threshold && (
                        <span className="block">
                          Wage threshold: ≤ RM{" "}
                          {Number(rate.wage_threshold).toFixed(2)}
                        </span>
                      )}
                    </p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <FormInput
                    name="employee_rate_percentage"
                    label="Employee Rate (%)"
                    type="number"
                    value={formData.employee_rate_percentage}
                    onChange={(e) =>
                      handleChange("employee_rate_percentage", e.target.value)
                    }
                    step="0.1"
                    min={0}
                    max={100}
                    required
                  />

                  {!isForeignOver60 && (
                    <FormInput
                      name="employer_rate_percentage"
                      label="Employer Rate (%)"
                      type="number"
                      value={formData.employer_rate_percentage}
                      onChange={(e) =>
                        handleChange("employer_rate_percentage", e.target.value)
                      }
                      step="0.1"
                      min={0}
                      max={100}
                    />
                  )}

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
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Updating..." : "Update Rate"}
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

export default EPFRateEditModal;

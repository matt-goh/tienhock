// src/components/Payroll/ContributionRates/SOCSORateEditModal.tsx
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
import { SOCSORRate } from "../../../types/types";
import { api } from "../../../routes/utils/api";
import { refreshContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import toast from "react-hot-toast";

interface SOCSORateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  rate: SOCSORRate | null;
}

const SOCSORateEditModal: React.FC<SOCSORateEditModalProps> = ({
  isOpen,
  onClose,
  rate,
}) => {
  const [formData, setFormData] = useState({
    wage_from: "",
    wage_to: "",
    employee_rate: "",
    employer_rate: "",
    employer_rate_over_60: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rate) {
      setFormData({
        wage_from: rate.wage_from.toString(),
        wage_to: rate.wage_to >= 999999 ? "999999" : rate.wage_to.toString(),
        employee_rate: rate.employee_rate.toString(),
        employer_rate: rate.employer_rate.toString(),
        employer_rate_over_60: rate.employer_rate_over_60.toString(),
      });
    }
  }, [rate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rate) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        wage_from: parseFloat(formData.wage_from),
        wage_to: parseFloat(formData.wage_to),
        employee_rate: parseFloat(formData.employee_rate),
        employer_rate: parseFloat(formData.employer_rate),
        employer_rate_over_60: parseFloat(formData.employer_rate_over_60),
      };

      await api.put(`/api/contribution-rates/socso/${rate.id}`, payload);

      // Refresh cache
      await refreshContributionRatesCache();

      toast.success("SOCSO rate updated successfully");
      onClose();
    } catch (error) {
      console.error("Error updating SOCSO rate:", error);
      setError("Failed to update SOCSO rate. Please try again.");
      toast.error("Failed to update SOCSO rate");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
                  Edit SOCSO Rate
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput
                      name="wage_from"
                      label="Wage From (RM)"
                      type="number"
                      value={formData.wage_from}
                      onChange={(e) =>
                        handleChange("wage_from", e.target.value)
                      }
                      step="1"
                      min={0}
                      required
                    />

                    <FormInput
                      name="wage_to"
                      label="Wage To (RM)"
                      type="number"
                      value={formData.wage_to}
                      onChange={(e) => handleChange("wage_to", e.target.value)}
                      step="1"
                      min={0}
                      required
                    />
                  </div>

                  <FormInput
                    name="employee_rate"
                    label="Employee Rate (RM)"
                    type="number"
                    value={formData.employee_rate}
                    onChange={(e) =>
                      handleChange("employee_rate", e.target.value)
                    }
                    step="0.01"
                    min={0}
                    required
                  />

                  <FormInput
                    name="employer_rate"
                    label="Employer Rate (RM)"
                    type="number"
                    value={formData.employer_rate}
                    onChange={(e) =>
                      handleChange("employer_rate", e.target.value)
                    }
                    step="0.01"
                    min={0}
                    required
                  />

                  <FormInput
                    name="employer_rate_over_60"
                    label="Employer Rate for 60+ (RM)"
                    type="number"
                    value={formData.employer_rate_over_60}
                    onChange={(e) =>
                      handleChange("employer_rate_over_60", e.target.value)
                    }
                    step="0.01"
                    min={0}
                    required
                  />

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

export default SOCSORateEditModal;

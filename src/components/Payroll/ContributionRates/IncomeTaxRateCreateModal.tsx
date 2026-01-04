// src/components/Payroll/ContributionRates/IncomeTaxRateCreateModal.tsx
import React, { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { refreshContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import Button from "../../Button";

interface IncomeTaxRateCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const IncomeTaxRateCreateModal: React.FC<IncomeTaxRateCreateModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [formData, setFormData] = useState({
    wage_from: "",
    wage_to: "",
    base_rate: "",
    unemployed_spouse_k0: "",
    unemployed_spouse_k1: "",
    unemployed_spouse_k2: "",
    unemployed_spouse_k3: "",
    unemployed_spouse_k4: "",
    unemployed_spouse_k5: "",
    unemployed_spouse_k6: "",
    unemployed_spouse_k7: "",
    unemployed_spouse_k8: "",
    unemployed_spouse_k9: "",
    unemployed_spouse_k10: "",
    employed_spouse_k0: "",
    employed_spouse_k1: "",
    employed_spouse_k2: "",
    employed_spouse_k3: "",
    employed_spouse_k4: "",
    employed_spouse_k5: "",
    employed_spouse_k6: "",
    employed_spouse_k7: "",
    employed_spouse_k8: "",
    employed_spouse_k9: "",
    employed_spouse_k10: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Convert all string values to numbers
      const payload = Object.entries(formData).reduce((acc, [key, value]) => {
        acc[key] = parseFloat(value) || 0;
        return acc;
      }, {} as any);

      await api.post("/api/contribution-rates/income-tax", payload);
      toast.success("Income tax rate created successfully");
      await refreshContributionRatesCache();
      onClose();
    } catch (error) {
      console.error("Error creating income tax rate:", error);
      toast.error("Failed to create income tax rate");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold dark:text-gray-100">Create Income Tax Rate</h2>
          <button
            onClick={onClose}
            className="text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <IconX size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Wage Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
                Wage From
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.wage_from}
                onChange={(e) => handleChange("wage_from", e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
                Wage To
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.wage_to}
                onChange={(e) => handleChange("wage_to", e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                required
              />
            </div>
          </div>

          {/* Base Rate */}
          <div>
            <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
              Base Rate (Single/Married without children)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.base_rate}
              onChange={(e) => handleChange("base_rate", e.target.value)}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>

          {/* Unemployed Spouse Rates */}
          <div>
            <h3 className="text-lg font-medium mb-3 dark:text-gray-100">
              Spouse Unemployed Rates
            </h3>
            <div className="grid grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <div key={`unemployed-${num}`}>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
                    K{num === 0 ? "" : num}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      formData[
                        `unemployed_spouse_k${num}` as keyof typeof formData
                      ]
                    }
                    onChange={(e) =>
                      handleChange(`unemployed_spouse_k${num}`, e.target.value)
                    }
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Employed Spouse Rates */}
          <div>
            <h3 className="text-lg font-medium mb-3 dark:text-gray-100">Spouse Employed Rates</h3>
            <div className="grid grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <div key={`employed-${num}`}>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
                    K{num === 0 ? "" : num}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      formData[
                        `employed_spouse_k${num}` as keyof typeof formData
                      ]
                    }
                    onChange={(e) =>
                      handleChange(`employed_spouse_k${num}`, e.target.value)
                    }
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
            <Button
              type="button"
              onClick={onClose}
              variant="default"
              color="default"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="filled"
              color="sky"
            >
              {isSubmitting ? "Creating..." : "Create Rate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncomeTaxRateCreateModal;

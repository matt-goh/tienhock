// src/components/Payroll/ContributionRates/IncomeTaxRateEditModal.tsx
import React, { useState, useEffect } from "react";
import { IconX } from "@tabler/icons-react";
import { IncomeTaxRate } from "../../../types/types";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { refreshContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import Button from "../../Button";

interface IncomeTaxRateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  rate: IncomeTaxRate | null;
}

const IncomeTaxRateEditModal: React.FC<IncomeTaxRateEditModalProps> = ({
  isOpen,
  onClose,
  rate,
}) => {
  const [formData, setFormData] = useState<Partial<IncomeTaxRate>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (rate) {
      setFormData(rate);
    }
  }, [rate]);

  if (!isOpen || !rate) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await api.put(`/api/contribution-rates/income-tax/${rate.id}`, formData);
      toast.success("Income tax rate updated successfully");
      await refreshContributionRatesCache();
      onClose();
    } catch (error) {
      console.error("Error updating income tax rate:", error);
      toast.error("Failed to update income tax rate");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: parseFloat(value) || 0,
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Edit Income Tax Rate</h2>
          <button
            onClick={onClose}
            className="text-default-400 hover:text-default-600"
          >
            <IconX size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Wage Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-default-700 mb-1">
                Wage From
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.wage_from || ""}
                onChange={(e) => handleChange("wage_from", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-default-700 mb-1">
                Wage To
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.wage_to || ""}
                onChange={(e) => handleChange("wage_to", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                required
              />
            </div>
          </div>

          {/* Base Rate */}
          <div>
            <label className="block text-sm font-medium text-default-700 mb-1">
              Base Rate (Single/Married without children)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.base_rate || ""}
              onChange={(e) => handleChange("base_rate", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              required
            />
          </div>

          {/* Unemployed Spouse Rates */}
          <div>
            <h3 className="text-lg font-medium mb-3">
              Spouse Unemployed Rates
            </h3>
            <div className="grid grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <div key={`unemployed-${num}`}>
                  <label className="block text-sm font-medium text-default-700 mb-1">
                    K{num === 0 ? "" : num}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      (formData[
                        `unemployed_spouse_k${num}` as keyof IncomeTaxRate
                      ] as number) || ""
                    }
                    onChange={(e) =>
                      handleChange(`unemployed_spouse_k${num}`, e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Employed Spouse Rates */}
          <div>
            <h3 className="text-lg font-medium mb-3">Spouse Employed Rates</h3>
            <div className="grid grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <div key={`employed-${num}`}>
                  <label className="block text-sm font-medium text-default-700 mb-1">
                    K{num === 0 ? "" : num}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      (formData[
                        `employed_spouse_k${num}` as keyof IncomeTaxRate
                      ] as number) || ""
                    }
                    onChange={(e) =>
                      handleChange(`employed_spouse_k${num}`, e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
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
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncomeTaxRateEditModal;

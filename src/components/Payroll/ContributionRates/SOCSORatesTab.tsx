// src/components/Payroll/ContributionRates/SOCSORatesTab.tsx
import React, { useState } from "react";
import { IconEdit } from "@tabler/icons-react";
import { useContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import { SOCSORRate } from "../../../types/types";
import LoadingSpinner from "../../LoadingSpinner";
import SOCSORateEditModal from "./SOCSORateEditModal";

const SOCSORatesTab: React.FC = () => {
  const { socsoRates, isLoading, error } = useContributionRatesCache();
  const [editingRate, setEditingRate] = useState<SOCSORRate | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleEditRate = (rate: SOCSORRate) => {
    setEditingRate(rate);
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setEditingRate(null);
  };

  const formatCurrency = (amount: number) => {
    return `RM ${Number(amount).toFixed(2)}`;
  };

  const formatWageRange = (from: number, to: number) => {
    if (to >= 999999) {
      return `${formatCurrency(from)} and above`;
    }
    return `${formatCurrency(from)} - ${formatCurrency(to)}`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-rose-600">
        Error loading SOCSO rates: {error.message}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-default-200">
            <thead className="bg-default-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                  Wage Range
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                  Employee Rate
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                  Employer Rate
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                  Employer Rate (≥ 60)
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-default-200">
              {socsoRates.map((rate) => (
                <tr key={rate.id} className="hover:bg-default-50">
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-default-900">
                    {formatWageRange(rate.wage_from, rate.wage_to)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-default-900">
                    {formatCurrency(rate.employee_rate)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-default-900">
                    {formatCurrency(rate.employer_rate)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-default-900">
                    {formatCurrency(rate.employer_rate_over_60)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => handleEditRate(rate)}
                      className="text-sky-600 hover:text-sky-800 p-1 rounded hover:bg-sky-50"
                      title="Edit Rate"
                    >
                      <IconEdit size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      <SOCSORateEditModal
        isOpen={showEditModal}
        onClose={handleCloseModal}
        rate={editingRate}
      />
    </div>
  );
};

export default SOCSORatesTab;

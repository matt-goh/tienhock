// src/components/Payroll/ContributionRates/EPFRatesTab.tsx
import React, { useState } from "react";
import { IconEdit } from "@tabler/icons-react";
import { useContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import { EPFRate } from "../../../types/types";
import LoadingSpinner from "../../LoadingSpinner";
import EPFRateEditModal from "./EPFRateEditModal";

const EPFRatesTab: React.FC = () => {
  const { epfRates, isLoading, error } = useContributionRatesCache();
  const [editingRate, setEditingRate] = useState<EPFRate | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleEditRate = (rate: EPFRate) => {
    setEditingRate(rate);
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setEditingRate(null);
  };

  // Group rates by employee type for better display
  const groupedRates = epfRates.reduce((acc, rate) => {
    if (!acc[rate.employee_type]) {
      acc[rate.employee_type] = [];
    }
    acc[rate.employee_type].push(rate);
    return acc;
  }, {} as Record<string, EPFRate[]>);

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

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "N/A";
    return `RM ${Number(amount).toFixed(2)}`;
  };

  const formatPercentage = (percentage: number | null) => {
    if (percentage === null) return "N/A";
    return `${percentage}%`;
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
      <div className="text-center py-8 text-rose-600 dark:text-rose-400">
        Error loading EPF rates: {error.message}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="space-y-6">
        {Object.entries(groupedRates)
          .reverse()
          .map(([type, rates]) => (
            <div key={type} className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-default-50 dark:bg-gray-900/50 px-4 py-3 border-b dark:border-gray-700">
                <h3 className="font-medium text-default-800 dark:text-gray-100">
                  {getEmployeeTypeLabel(type)}
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                  <thead className="bg-default-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                        Wage Threshold
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                        Employee Rate
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                        Employer Rate
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                        Employer Fixed
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                    {rates.map((rate) => (
                      <tr key={rate.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                          {rate.wage_threshold ? (
                            `≤ ${formatCurrency(rate.wage_threshold)}`
                          ) : (
                            <span className="text-default-500 dark:text-gray-400">
                              No threshold
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                          {formatPercentage(rate.employee_rate_percentage)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                          {formatPercentage(rate.employer_rate_percentage)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                          {formatCurrency(rate.employer_fixed_amount)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleEditRate(rate)}
                            className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 p-1 rounded hover:bg-sky-50 dark:hover:bg-sky-900/50"
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
          ))}
      </div>

      {/* Edit Modal */}
      <EPFRateEditModal
        isOpen={showEditModal}
        onClose={handleCloseModal}
        rate={editingRate}
      />
    </div>
  );
};

export default EPFRatesTab;

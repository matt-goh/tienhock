// src/components/Payroll/ContributionRates/SOCSORatesTab.tsx
import React, { useState } from "react";
import { IconEdit } from "@tabler/icons-react";
import { useContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import { SOCSORRate } from "../../../types/types";
import LoadingSpinner from "../../LoadingSpinner";
import SOCSORateEditModal from "./SOCSORateEditModal";

const SOCSO_SKBBK_EFFECTIVE_LABEL: string = "Applies from June 2026 payroll";

const SOCSORatesTab: React.FC = () => {
  const { socsoRates, isLoading, error } = useContributionRatesCache();
  const [editingRate, setEditingRate] = useState<SOCSORRate | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleEditRate = (rate: SOCSORRate): void => {
    setEditingRate(rate);
    setShowEditModal(true);
  };

  const handleCloseModal = (): void => {
    setShowEditModal(false);
    setEditingRate(null);
  };

  const formatCurrency = (amount: number): string => {
    return `RM ${Number(amount).toFixed(2)}`;
  };

  const formatWageRange = (from: number, to: number): string => {
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
      <div className="text-center py-8 text-rose-600 dark:text-rose-400">
        Error loading SOCSO rates: {error.message}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-3 text-sm text-default-600 dark:text-gray-300">
        SKBBK: {SOCSO_SKBBK_EFFECTIVE_LABEL}
      </div>
      <div className="border border-default-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-50 dark:bg-gray-900 sticky top-0 z-10">
              <tr>
                <th
                  rowSpan={2}
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider align-middle border-r border-default-200 dark:border-gray-700"
                >
                  Wage Range
                </th>
                <th
                  colSpan={4}
                  className="px-4 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider border-r border-default-200 dark:border-gray-700"
                >
                  Under 60 (Jenis Pertama)
                </th>
                <th
                  colSpan={3}
                  className="px-4 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider border-r border-default-200 dark:border-gray-700"
                >
                  60 and Above (Jenis Kedua)
                </th>
                <th
                  rowSpan={2}
                  className="px-4 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider align-middle"
                >
                  Actions
                </th>
              </tr>
              <tr>
                <th className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                  Employer
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                  Keilatan
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                  SKBBK
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-sky-700 dark:text-sky-300 uppercase tracking-wider border-r border-default-200 dark:border-gray-700">
                  Employee Total
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                  Employer
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                  SKBBK
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-sky-700 dark:text-sky-300 uppercase tracking-wider border-r border-default-200 dark:border-gray-700">
                  Employee Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
              {socsoRates.map((rate) => {
                const keilatan = Number(rate.employee_rate);
                const skbbk = Number(rate.employee_rate_skbbk);
                const employeeTotalUnder60 = keilatan + skbbk;
                const employeeTotalOver60 = skbbk;
                return (
                  <tr key={rate.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-900 dark:text-gray-100 border-r border-default-200 dark:border-gray-700">
                      {formatWageRange(rate.wage_from, rate.wage_to)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                      {formatCurrency(rate.employer_rate)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                      {formatCurrency(keilatan)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                      {formatCurrency(skbbk)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center text-sm font-medium text-sky-700 dark:text-sky-300 border-r border-default-200 dark:border-gray-700">
                      {formatCurrency(employeeTotalUnder60)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                      {formatCurrency(rate.employer_rate_over_60)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                      {formatCurrency(skbbk)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center text-sm font-medium text-sky-700 dark:text-sky-300 border-r border-default-200 dark:border-gray-700">
                      {formatCurrency(employeeTotalOver60)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleEditRate(rate)}
                        className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 p-1 rounded hover:bg-sky-50 dark:hover:bg-sky-900/50"
                        title="Edit Rate"
                      >
                        <IconEdit size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

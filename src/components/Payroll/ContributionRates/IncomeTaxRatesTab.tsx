// src/components/Payroll/ContributionRates/IncomeTaxRatesTab.tsx
import React, { useState } from "react";
import { IconEdit, IconTrash, IconPlus } from "@tabler/icons-react";
import { useContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import { IncomeTaxRate } from "../../../types/types";
import LoadingSpinner from "../../LoadingSpinner";
import IncomeTaxRateEditModal from "./IncomeTaxRateEditModal";
import IncomeTaxRateCreateModal from "./IncomeTaxRateCreateModal";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import Button from "../../Button";

const IncomeTaxRatesTab: React.FC = () => {
  const { incomeTaxRates, isLoading, error, refreshRates } =
    useContributionRatesCache();
  const [editingRate, setEditingRate] = useState<IncomeTaxRate | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleEditRate = (rate: IncomeTaxRate) => {
    setEditingRate(rate);
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setShowCreateModal(false);
    setEditingRate(null);
  };

  const handleDeleteRate = async (id: number) => {
    if (
      !window.confirm("Are you sure you want to delete this income tax rate?")
    ) {
      return;
    }

    try {
      await api.delete(`/api/contribution-rates/income-tax/${id}`);
      toast.success("Income tax rate deleted successfully");
      refreshRates();
    } catch (error) {
      console.error("Error deleting income tax rate:", error);
      toast.error("Failed to delete income tax rate");
    }
  };

  const formatCurrency = (amount: number) => {
    return `RM ${Number(amount).toFixed(2)}`;
  };

  const formatWageRange = (from: number, to: number) => {
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
        Error loading Income Tax rates: {error.message}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-default-800 dark:text-gray-100">
          Income Tax Rates
        </h3>
        <Button
          onClick={() => setShowCreateModal(true)}
          icon={IconPlus}
          variant="filled"
          color="sky"
          size="md"
          iconSize={20}
        >
          Add New Rate
        </Button>
      </div>

      <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                  Wage Range
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                  Base Rate
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
              {incomeTaxRates.map((rate) => (
                <React.Fragment key={rate.id}>
                  {/* Main row */}
                  <tr className="hover:bg-default-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100 font-medium">
                      {formatWageRange(rate.wage_from, rate.wage_to)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-default-900 dark:text-gray-100">
                      {formatCurrency(rate.base_rate)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditRate(rate)}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 p-1 rounded hover:bg-sky-50 dark:hover:bg-sky-900/50"
                          title="Edit Rate"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteRate(rate.id)}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/50"
                          title="Delete Rate"
                        >
                          <IconTrash size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Spouse rates row */}
                  <tr className="bg-default-25 dark:bg-gray-900/30">
                    <td colSpan={3} className="px-4 py-3">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Unemployed Spouse */}
                        <div className="border border-default-200 dark:border-gray-700 rounded-lg pt-2 pb-4 bg-white dark:bg-gray-800">
                          <h4 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-3 text-center border-b border-default-200 dark:border-gray-700 pb-2">
                            Spouse Unemployed
                          </h4>
                          <div className="grid grid-cols-6 gap-2 text-xs">
                            {[
                              { label: "K", value: rate.unemployed_spouse_k0 },
                              { label: "K1", value: rate.unemployed_spouse_k1 },
                              { label: "K2", value: rate.unemployed_spouse_k2 },
                              { label: "K3", value: rate.unemployed_spouse_k3 },
                              { label: "K4", value: rate.unemployed_spouse_k4 },
                              { label: "K5", value: rate.unemployed_spouse_k5 },
                              { label: "K6", value: rate.unemployed_spouse_k6 },
                              { label: "K7", value: rate.unemployed_spouse_k7 },
                              { label: "K8", value: rate.unemployed_spouse_k8 },
                              { label: "K9", value: rate.unemployed_spouse_k9 },
                              {
                                label: "K10",
                                value: rate.unemployed_spouse_k10,
                              },
                            ].map((item, index) => (
                              <div key={index} className="text-center">
                                <div className="font-medium text-default-600 dark:text-gray-300">
                                  {item.label}
                                </div>
                                <div className="text-default-900 dark:text-gray-100">
                                  {Number(item.value ?? 0).toFixed(2)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Employed Spouse */}
                        <div className="border border-default-200 dark:border-gray-700 rounded-lg pt-2 pb-4 bg-white dark:bg-gray-800">
                          <h4 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-3 text-center border-b border-default-200 dark:border-gray-700 pb-2">
                            Spouse Employed
                          </h4>
                          <div className="grid grid-cols-6 gap-2 text-xs">
                            {[
                              { label: "K", value: rate.employed_spouse_k0 },
                              { label: "K1", value: rate.employed_spouse_k1 },
                              { label: "K2", value: rate.employed_spouse_k2 },
                              { label: "K3", value: rate.employed_spouse_k3 },
                              { label: "K4", value: rate.employed_spouse_k4 },
                              { label: "K5", value: rate.employed_spouse_k5 },
                              { label: "K6", value: rate.employed_spouse_k6 },
                              { label: "K7", value: rate.employed_spouse_k7 },
                              { label: "K8", value: rate.employed_spouse_k8 },
                              { label: "K9", value: rate.employed_spouse_k9 },
                              { label: "K10", value: rate.employed_spouse_k10 },
                            ].map((item, index) => (
                              <div key={index} className="text-center">
                                <div className="font-medium text-default-600 dark:text-gray-300">
                                  {item.label}
                                </div>
                                <div className="text-default-900 dark:text-gray-100">
                                  {Number(item.value ?? 0).toFixed(2)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      <IncomeTaxRateEditModal
        isOpen={showEditModal}
        onClose={handleCloseModal}
        rate={editingRate}
      />

      {/* Create Modal */}
      <IncomeTaxRateCreateModal
        isOpen={showCreateModal}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default IncomeTaxRatesTab;

// src/pages/Payroll/IncentivesPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCash,
  IconRefresh,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import YearNavigator from "../../../components/YearNavigator";
import MonthNavigator from "../../../components/MonthNavigator";
import AddIncentiveModal from "../../../components/Payroll/AddIncentiveModal";
import EditIncentiveModal from "../../../components/Payroll/EditIncentiveModal";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";

interface Incentive {
  id: number;
  employee_id: string;
  employee_name: string;
  commission_date: string;
  amount: number;
  description: string;
  created_by: string;
  created_at: string;
}

const IncentivesPage: React.FC = () => {
  // State
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addModalType, setAddModalType] = useState<
    "Commission" | "Bonus" | null
  >(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingIncentive, setEditingIncentive] = useState<Incentive | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Filters
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Create Date object for MonthNavigator
  const selectedMonth = useMemo(
    () => new Date(currentYear, currentMonth - 1, 1),
    [currentYear, currentMonth]
  );

  // Load incentives on mount and filter changes
  useEffect(() => {
    fetchIncentives();
  }, [currentYear, currentMonth]);

  const fetchIncentives = async () => {
    setIsLoading(true);
    try {
      const startDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-01`;
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const endDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`;
      const url = `/api/incentives?start_date=${encodeURIComponent(
        startDate
      )}&end_date=${encodeURIComponent(endDate)}`;
      const response = await api.get(url);
      setIncentives(response || []);
    } catch (error) {
      console.error("Error fetching incentives:", error);
      toast.error("Failed to load incentives");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (incentive: Incentive) => {
    setEditingIncentive(incentive);
    setShowEditModal(true);
  };

  const handleDeleteIncentive = async () => {
    if (!deletingId) return;
    try {
      await api.delete(`/api/incentives/${deletingId}`);
      toast.success("Incentive record deleted successfully");
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchIncentives();
    } catch (error) {
      console.error("Error deleting incentive:", error);
      toast.error("Failed to delete incentive");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const totalAmount = incentives.reduce(
    (sum, incentive) => sum + (Number(incentive.amount) || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          Incentives (Commission & Bonus)
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchIncentives}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            onClick={() => setAddModalType("Commission")}
            icon={IconPlus}
            color="sky"
            variant="filled"
          >
            Add Commission
          </Button>
          <Button
            onClick={() => setAddModalType("Bonus")}
            icon={IconPlus}
            color="teal"
            variant="filled"
          >
            Add Bonus
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
          <div className="flex gap-4 items-end">
            <YearNavigator
              selectedYear={currentYear}
              onChange={setCurrentYear}
              showGoToCurrentButton={false}
            />
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={(date) => {
                setCurrentYear(date.getFullYear());
                setCurrentMonth(date.getMonth() + 1);
              }}
              showGoToCurrentButton={false}
            />
          </div>
          <div className="text-sm text-default-600 dark:text-gray-300">
            <div className="font-medium">
              Total: {incentives.length} records
            </div>
            <div className="font-medium">
              Amount: {formatCurrency(totalAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* Incentives Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-default-800 dark:text-gray-100">
            {getMonthName(currentMonth)} {currentYear}
          </h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : incentives.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">No incentives found</p>
            <p>Click "Add Commission" or "Add Bonus" to create records</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Employee ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                {incentives.map((incentive) => (
                  <tr key={incentive.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {incentive.employee_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {incentive.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(incentive.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {incentive.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(
                        new Date(incentive.commission_date),
                        "dd MMM yyyy"
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(new Date(incentive.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(incentive)}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(incentive.id);
                            setShowDeleteDialog(true);
                          }}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                          title="Delete"
                        >
                          <IconTrash size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {addModalType && (
        <AddIncentiveModal
          isOpen={addModalType !== null}
          onClose={() => setAddModalType(null)}
          onSuccess={fetchIncentives}
          currentYear={currentYear}
          currentMonth={currentMonth}
          incentiveType={addModalType}
        />
      )}

      <EditIncentiveModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingIncentive(null);
        }}
        onSuccess={fetchIncentives}
        incentive={editingIncentive}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDeleteIncentive}
        title="Delete Incentive"
        message="Are you sure you want to delete this incentive record? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default IncentivesPage;

// src/pages/Payroll/MidMonthPayrollPage.tsx
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
import {
  getMidMonthPayrolls,
  deleteMidMonthPayroll,
  getMonthName,
  MidMonthPayroll,
} from "../../../utils/payroll/midMonthPayrollUtils";
import YearNavigator from "../../../components/YearNavigator";
import MonthNavigator from "../../../components/MonthNavigator";
import AddMidMonthPayrollModal from "../../../components/Payroll/AddMidMonthPayrollModal";
import EditMidMonthPayrollModal from "../../../components/Payroll/EditMidMonthPayrollModal";
import toast from "react-hot-toast";

const MidMonthPayrollPage: React.FC = () => {
  // Get initial values from URL params or defaults
  const getInitialYear = (): number => {
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get("year");
    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (!isNaN(year) && year >= 2000 && year <= 2100) {
        return year;
      }
    }
    return new Date().getFullYear();
  };

  const getInitialMonth = (): number => {
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get("month");
    if (monthParam) {
      const month = parseInt(monthParam, 10);
      if (!isNaN(month) && month >= 1 && month <= 12) {
        return month;
      }
    }
    return new Date().getMonth() + 1;
  };

  // State
  const [payrolls, setPayrolls] = useState<MidMonthPayroll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<MidMonthPayroll | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Filters - initialize from URL params
  const [currentYear, setCurrentYear] = useState(getInitialYear);
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);

  // Create Date object for MonthNavigator
  const selectedMonth = useMemo(
    () => new Date(currentYear, currentMonth - 1, 1),
    [currentYear, currentMonth]
  );

  // Update URL when year/month changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("year", currentYear.toString());
    params.set("month", currentMonth.toString());
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [currentYear, currentMonth]);

  // Load payrolls on mount and filter changes
  useEffect(() => {
    fetchPayrolls();
  }, [currentYear, currentMonth]);

  const fetchPayrolls = async () => {
    setIsLoading(true);
    try {
      const response = await getMidMonthPayrolls({
        year: currentYear,
        month: currentMonth,
        limit: 100,
      });
      setPayrolls(response.payrolls);
    } catch (error) {
      console.error("Error fetching payrolls:", error);
      toast.error("Failed to load mid-month payrolls");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (payroll: MidMonthPayroll) => {
    setEditingPayroll(payroll);
    setShowEditModal(true);
  };

  const handleDeletePayroll = async () => {
    if (!deletingId) return;

    try {
      await deleteMidMonthPayroll(deletingId);
      toast.success("Payroll deleted successfully");
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchPayrolls();
    } catch (error) {
      console.error("Error deleting payroll:", error);
      toast.error("Failed to delete payroll");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Calculate total amount
  const totalAmount = payrolls.reduce(
    (sum, payroll) => sum + (Number(payroll.amount) || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          Mid-month Payrolls
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchPayrolls}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            icon={IconPlus}
            color="sky"
            variant="filled"
          >
            Add Payroll
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
              Total: {payrolls.length} employees
            </div>
            <div className="font-medium">
              Amount: {formatCurrency(totalAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* Payrolls Table */}
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
        ) : payrolls.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">No payrolls found</p>
            <p>Click "Add Payroll" to create mid-month payrolls</p>
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
                    Payment Method
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
                {payrolls.map((payroll) => (
                  <tr key={payroll.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {payroll.employee_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {payroll.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(payroll.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {payroll.payment_method}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(new Date(payroll.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(payroll)}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(payroll.id);
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
      <AddMidMonthPayrollModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchPayrolls}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />

      <EditMidMonthPayrollModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingPayroll(null);
        }}
        onSuccess={fetchPayrolls}
        payroll={editingPayroll}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDeletePayroll}
        title="Delete Mid-month Payroll"
        message="Are you sure you want to delete this mid-month payroll? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default MidMonthPayrollPage;

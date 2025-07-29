// src/pages/Payroll/CommissionPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCash,
  IconRefresh,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { FormListbox } from "../../components/FormComponents";
import { getMonthName } from "../../utils/payroll/payrollUtils";
import AddCommissionModal from "../../components/Payroll/AddCommissionModal";
import EditCommissionModal from "../../components/Payroll/EditCommissionModal";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";

interface Commission {
  id: number;
  employee_id: string;
  employee_name: string;
  commission_date: string;
  amount: number;
  description: string;
  created_by: string;
  created_at: string;
}

const CommissionPage: React.FC = () => {
  // State
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCommission, setEditingCommission] = useState<Commission | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Filters
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Generate year and month options
  const yearOptions = useMemo(() => {
    const years = [];
    for (let year = currentYear - 2; year <= currentYear + 1; year++) {
      years.push({ id: year, name: year.toString() });
    }
    return years;
  }, [currentYear]);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: getMonthName(i + 1),
      })),
    []
  );

  // Load commissions on mount and filter changes
  useEffect(() => {
    fetchCommissions();
  }, [currentYear, currentMonth]);

  const fetchCommissions = async () => {
    setIsLoading(true);
    try {
      const startDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-01`;
      
      // Get the last day of the current month
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const endDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`;

      console.log("Fetching commissions with dates:", { startDate, endDate });

      // Build URL with query parameters
      const url = `/api/commissions?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
      
      const response = await api.get(url);
      
      console.log("Commission API response:", response);
      setCommissions(response || []);
    } catch (error) {
      console.error("Error fetching commissions:", error);
      toast.error("Failed to load commissions");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (commission: Commission) => {
    setEditingCommission(commission);
    setShowEditModal(true);
  };

  const handleDeleteCommission = async () => {
    if (!deletingId) return;

    try {
      await api.delete(`/api/commissions/${deletingId}`);
      toast.success("Commission deleted successfully");
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchCommissions();
    } catch (error) {
      console.error("Error deleting commission:", error);
      toast.error("Failed to delete commission");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Calculate total amount
  const totalAmount = commissions.reduce(
    (sum, commission) => sum + commission.amount,
    0
  );

  return (
    <div className="relative w-full space-y-4 mx-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Commission Records
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchCommissions}
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
            Add Commission
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormListbox
            name="year"
            label="Year"
            value={currentYear.toString()}
            onChange={(value) => setCurrentYear(Number(value))}
            options={yearOptions}
          />
          <FormListbox
            name="month"
            label="Month"
            value={currentMonth.toString()}
            onChange={(value) => setCurrentMonth(Number(value))}
            options={monthOptions}
          />
          <div className="flex items-end">
            <div className="text-sm text-default-600">
              <div className="font-medium">
                Total: {commissions.length} records
              </div>
              <div className="font-medium">
                Amount: {formatCurrency(totalAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commissions Table */}
      <div className="bg-white rounded-lg border border-default-200 shadow-sm">
        <div className="px-6 py-4 border-b border-default-200">
          <h2 className="text-lg font-medium text-default-800">
            {getMonthName(currentMonth)} {currentYear}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : commissions.length === 0 ? (
          <div className="text-center py-12 text-default-500">
            <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">No commissions found</p>
            <p>Click "Add Commission" to create commission records</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Employee ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-default-200">
                {commissions.map((commission) => (
                  <tr key={commission.id} className="hover:bg-default-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                      {commission.employee_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900">
                      {commission.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-900">
                      {formatCurrency(commission.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                      {commission.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500">
                      {format(
                        new Date(commission.commission_date),
                        "dd MMM yyyy"
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500">
                      {format(new Date(commission.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(commission)}
                          className="text-sky-600 hover:text-sky-800"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(commission.id);
                            setShowDeleteDialog(true);
                          }}
                          className="text-rose-600 hover:text-rose-800"
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
      <AddCommissionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchCommissions}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />

      <EditCommissionModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCommission(null);
        }}
        onSuccess={fetchCommissions}
        commission={editingCommission}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDeleteCommission}
        title="Delete Commission"
        message="Are you sure you want to delete this commission record? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default CommissionPage;

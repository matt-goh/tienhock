// src/pages/Payroll/AddOn/OthersListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconClockHour4,
  IconRefresh,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import YearNavigator from "../../../components/YearNavigator";
import MonthNavigator from "../../../components/MonthNavigator";
import AddOthersModal from "../../../components/Payroll/AddOthersModal";
import EditOthersModal from "../../../components/Payroll/EditOthersModal";
import { api } from "../../../routes/utils/api";
import { OthersRecord } from "../../../types/types";
import toast from "react-hot-toast";

const DISPLAY_LABEL = "Others (Kerja Luar OT)";

const OthersListPage: React.FC = () => {
  const getInitialYear = (): number => {
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get("year");
    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (!isNaN(year) && year >= 2000 && year <= 2100) return year;
    }
    return new Date().getFullYear();
  };

  const getInitialMonth = (): number => {
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get("month");
    if (monthParam) {
      const month = parseInt(monthParam, 10);
      if (!isNaN(month) && month >= 1 && month <= 12) return month;
    }
    return new Date().getMonth() + 1;
  };

  const [records, setRecords] = useState<OthersRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<OthersRecord | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [currentYear, setCurrentYear] = useState(getInitialYear);
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);

  const selectedMonth = useMemo(
    () => new Date(currentYear, currentMonth - 1, 1),
    [currentYear, currentMonth],
  );

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("year", currentYear.toString());
    params.set("month", currentMonth.toString());
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [currentYear, currentMonth]);

  useEffect(() => {
    fetchRecords();
  }, [currentYear, currentMonth]);

  const fetchRecords = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const url = `/api/others-records?year=${currentYear}&month=${currentMonth}`;
      const response = await api.get(url);
      setRecords(response || []);
    } catch (error) {
      console.error("Error fetching others records:", error);
      toast.error(`Failed to load ${DISPLAY_LABEL}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (record: OthersRecord): void => {
    setEditingRecord(record);
    setShowEditModal(true);
  };

  const handleDelete = async (): Promise<void> => {
    if (!deletingId) return;
    try {
      await api.delete(`/api/others-records/${deletingId}`);
      toast.success(`${DISPLAY_LABEL} record deleted successfully`);
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchRecords();
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error(`Failed to delete ${DISPLAY_LABEL}`);
    }
  };

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);

  const totalAmount = records.reduce(
    (sum, r) => sum + (Number(r.amount) || 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          {DISPLAY_LABEL}
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchRecords}
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
            Add {DISPLAY_LABEL}
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4 transition-shadow duration-200 hover:shadow-md dark:hover:shadow-black/20">
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
            <div className="font-medium">Total: {records.length} records</div>
            <div className="font-medium">
              Amount: {formatCurrency(totalAmount)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm transition-shadow duration-200 hover:shadow-md dark:hover:shadow-black/20">
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg">
          <h2 className="text-lg font-medium text-default-800 dark:text-gray-100">
            {getMonthName(currentMonth)} {currentYear}
          </h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconClockHour4 className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">
              No {DISPLAY_LABEL} records found
            </p>
            <p>Click &quot;Add {DISPLAY_LABEL}&quot; to create records</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Employee ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Pay Code
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="group transition-colors duration-150 hover:bg-sky-50/60 dark:hover:bg-sky-900/20"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {record.employee_id}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {record.employee_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(new Date(record.record_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {record.pay_code_id || "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-default-700 dark:text-gray-300">
                      {Number(record.rate).toFixed(2)}{" "}
                      <span className="text-xs text-default-400 dark:text-gray-500">
                        /{record.rate_unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-default-700 dark:text-gray-300">
                      {Number(record.quantity)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(Number(record.amount))}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-900 dark:text-gray-100">
                      {record.description}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(record)}
                          className="p-1.5 rounded-full text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors duration-150"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(record.id);
                            setShowDeleteDialog(true);
                          }}
                          className="p-1.5 rounded-full text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors duration-150"
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

      {showAddModal && (
        <AddOthersModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchRecords}
          currentYear={currentYear}
          currentMonth={currentMonth}
          displayLabel={DISPLAY_LABEL}
        />
      )}

      <EditOthersModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingRecord(null);
        }}
        onSuccess={fetchRecords}
        record={editingRecord}
        displayLabel={DISPLAY_LABEL}
      />

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDelete}
        title={`Delete ${DISPLAY_LABEL}`}
        message={`Are you sure you want to delete this ${DISPLAY_LABEL} record? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default OthersListPage;

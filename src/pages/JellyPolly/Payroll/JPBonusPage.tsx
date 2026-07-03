// src/pages/JellyPolly/Payroll/JPBonusPage.tsx
// Jelly Polly Bonus entry page. Same flow as the Tien Hock Bonus page but
// scoped to JP payroll employees and jellypolly.commission_records
// (is_advance = false = pure earning; raises gross + net).
import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconGift,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import TimeNavigator from "../../../components/TimeNavigator";
import AddIncentiveModal from "../../../components/Payroll/AddIncentiveModal";
import EditIncentiveModal from "../../../components/Payroll/EditIncentiveModal";
import { useJPPayrollEmployees } from "../../../utils/JellyPolly/useJPPayrollEmployees";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";

const API_BASE = "/jellypolly/api/incentives";

interface Bonus {
  id: number;
  employee_id: string;
  employee_name: string;
  commission_date: string;
  amount: number;
  description: string;
  created_by: string;
  created_at: string;
  is_advance: boolean;
}

const JPBonusPage: React.FC = () => {
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

  const getInitialSearch = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  };

  const { employees: gtEmployees } = useJPPayrollEmployees();
  const allowedEmployeeIds = useMemo(
    () => gtEmployees.map((e) => e.employee_id),
    [gtEmployees]
  );

  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>(getInitialSearch);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBonus, setEditingBonus] = useState<Bonus | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [currentYear, setCurrentYear] = useState(getInitialYear);
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);

  const monthRange = useMemo(
    () => ({
      start: new Date(currentYear, currentMonth - 1, 1),
      end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999),
    }),
    [currentYear, currentMonth]
  );

  const handleTimeNavigatorChange = (range: { start: Date; end: Date }) => {
    setCurrentYear(range.start.getFullYear());
    setCurrentMonth(range.start.getMonth() + 1);
  };

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("year", currentYear.toString());
    params.set("month", currentMonth.toString());
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [currentYear, currentMonth]);

  useEffect(() => {
    fetchBonuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

  const fetchBonuses = async () => {
    setIsLoading(true);
    try {
      const startDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-01`;
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const endDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`;
      const url = `${API_BASE}?is_advance=false&start_date=${encodeURIComponent(
        startDate
      )}&end_date=${encodeURIComponent(endDate)}`;
      const response = await api.get(url);
      setBonuses(response || []);
    } catch (error) {
      console.error("Error fetching bonuses:", error);
      toast.error("Failed to load bonuses");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (bonus: Bonus) => {
    setEditingBonus(bonus);
    setShowEditModal(true);
  };

  const handleDeleteBonus = async () => {
    if (!deletingId) return;
    try {
      await api.delete(`${API_BASE}/${deletingId}`);
      toast.success("Bonus record deleted successfully");
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchBonuses();
    } catch (error) {
      console.error("Error deleting bonus:", error);
      toast.error("Failed to delete bonus");
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);

  const filteredBonuses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return bonuses;
    return bonuses.filter((bonus) => {
      const amount = Number(bonus.amount) || 0;
      const dateFormatted = (() => {
        try {
          return format(new Date(bonus.commission_date), "dd MMM yyyy");
        } catch {
          return "";
        }
      })();
      const dateIso =
        typeof bonus.commission_date === "string"
          ? bonus.commission_date.slice(0, 10)
          : "";
      const haystack = [
        bonus.employee_id || "",
        bonus.employee_name || "",
        bonus.description || "",
        dateFormatted,
        dateIso,
        amount.toString(),
        amount.toFixed(2),
        formatCurrency(amount),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [bonuses, searchQuery]);

  const totalAmount = filteredBonuses.reduce(
    (sum, bonus) => sum + (Number(bonus.amount) || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          Bonus Records
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchBonuses}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
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
            <TimeNavigator
              range={monthRange}
              onChange={handleTimeNavigatorChange}
              modes={["month"]}
              presets={false}
            />
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-3 md:w-auto">
            <div className="relative w-full sm:w-72">
              <IconSearch
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, amount, description..."
                className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 py-1.5 pl-8 pr-8 text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:bg-default-100 dark:text-gray-500 dark:hover:bg-gray-700"
                  title="Clear search"
                >
                  <IconX size={13} />
                </button>
              )}
            </div>
            <div className="hidden h-6 w-px bg-default-300 dark:bg-gray-600 sm:block" />
            <div className="text-right text-sm text-default-600 dark:text-gray-300">
              <div className="font-medium">
                Total: {filteredBonuses.length} records
              </div>
              <div className="font-medium">
                Amount: {formatCurrency(totalAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bonuses Table */}
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
        ) : filteredBonuses.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconGift className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">
              {searchQuery.trim() ? "No matching bonuses" : "No bonuses found"}
            </p>
            <p>
              {searchQuery.trim()
                ? "Try a different search term"
                : 'Click "Add Bonus" to create records'}
            </p>
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                {filteredBonuses.map((bonus) => (
                  <tr
                    key={bonus.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {bonus.employee_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {bonus.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(bonus.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {bonus.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(new Date(bonus.commission_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(bonus)}
                          className="text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(bonus.id);
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
      {showAddModal && (
        <AddIncentiveModal
          company="jellypolly"
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchBonuses}
          currentYear={currentYear}
          currentMonth={currentMonth}
          incentiveType="Bonus"
          apiBasePath={API_BASE}
          forceIsAdvance={false}
          allowedEmployeeIds={allowedEmployeeIds}
        />
      )}

      <EditIncentiveModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingBonus(null);
        }}
        onSuccess={fetchBonuses}
        incentive={editingBonus}
        displayLabel="Bonus"
        apiBasePath={API_BASE}
        forceIsAdvance={false}
      />

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDeleteBonus}
        title="Delete Bonus"
        message="Are you sure you want to delete this bonus record? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default JPBonusPage;

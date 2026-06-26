// src/pages/Payroll/AddOn/OthersAdvancePage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCash,
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
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";

const DISPLAY_LABEL = "Others (Advance)";

interface Commission {
  id: number;
  employee_id: string;
  employee_name: string;
  commission_date: string;
  amount: number;
  description: string;
  created_by: string;
  created_at: string;
  location_code: string;
  location_name: string | null;
}

const OthersAdvancePage: React.FC = () => {
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

  const getInitialSearch = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  };

  // State
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>(getInitialSearch);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCommission, setEditingCommission] = useState<Commission | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Filters - initialize from URL params
  const [currentYear, setCurrentYear] = useState(getInitialYear);
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);

  // Month range for the TimeNavigator (the page always targets one month).
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

  // Update URL when year/month changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("year", currentYear.toString());
    params.set("month", currentMonth.toString());
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [currentYear, currentMonth]);

  // Load commissions on mount and filter changes
  useEffect(() => {
    fetchCommissions();
  }, [currentYear, currentMonth]);

  const fetchCommissions = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const startDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-01`;
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const endDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`;
      const url = `/api/incentives?type=commission&start_date=${encodeURIComponent(
        startDate
      )}&end_date=${encodeURIComponent(endDate)}`;
      const response = await api.get(url);
      setCommissions(response || []);
    } catch (error) {
      console.error("Error fetching commissions:", error);
      toast.error(`Failed to load ${DISPLAY_LABEL}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (commission: Commission): void => {
    setEditingCommission(commission);
    setShowEditModal(true);
  };

  const handleDeleteCommission = async (): Promise<void> => {
    if (!deletingId) return;
    try {
      await api.delete(`/api/incentives/${deletingId}`);
      toast.success(`${DISPLAY_LABEL} record deleted successfully`);
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchCommissions();
    } catch (error) {
      console.error("Error deleting commission:", error);
      toast.error(`Failed to delete ${DISPLAY_LABEL}`);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Universal search across the displayed columns (employee, location, amount,
  // description, date).
  const filteredCommissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return commissions;
    return commissions.filter((commission) => {
      const amount = Number(commission.amount) || 0;
      const dateFormatted = (() => {
        try {
          return format(new Date(commission.commission_date), "dd MMM yyyy");
        } catch {
          return "";
        }
      })();
      const dateIso =
        typeof commission.commission_date === "string"
          ? commission.commission_date.slice(0, 10)
          : "";
      const haystack = [
        commission.employee_id || "",
        commission.employee_name || "",
        commission.location_code || "",
        commission.location_name || "",
        commission.description || "",
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
  }, [commissions, searchQuery]);

  const totalAmount = filteredCommissions.reduce(
    (sum, commission) => sum + (Number(commission.amount) || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          {DISPLAY_LABEL}
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
            Add {DISPLAY_LABEL}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4 transition-shadow duration-200 hover:shadow-md dark:hover:shadow-black/20">
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
                placeholder="Search name, location, amount, description..."
                className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 pl-8 pr-8 text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                Total: {filteredCommissions.length} records
              </div>
              <div className="font-medium">
                Amount: {formatCurrency(totalAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Others (Advance) Table */}
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
        ) : filteredCommissions.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">
              {searchQuery.trim()
                ? `No matching ${DISPLAY_LABEL} records`
                : `No ${DISPLAY_LABEL} records found`}
            </p>
            <p>
              {searchQuery.trim()
                ? "Try a different search term"
                : `Click "Add ${DISPLAY_LABEL}" to create records`}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Location
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
                {filteredCommissions.map((commission) => (
                  <tr
                    key={commission.id}
                    className="group transition-colors duration-150 hover:bg-sky-50/60 dark:hover:bg-sky-900/20"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {commission.employee_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {commission.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 transition-colors duration-150 group-hover:bg-sky-200 dark:group-hover:bg-sky-900/50">
                        {commission.location_code} - {commission.location_name || "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(commission.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {commission.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(
                        new Date(commission.commission_date),
                        "dd MMM yyyy"
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(commission)}
                          className="p-1.5 rounded-full text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors duration-150"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(commission.id);
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

      {/* Modals */}
      {showAddModal && (
        <AddIncentiveModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchCommissions}
          currentYear={currentYear}
          currentMonth={currentMonth}
          incentiveType="Commission"
          displayLabel={DISPLAY_LABEL}
          displayLabelPlural={DISPLAY_LABEL}
        />
      )}

      <EditIncentiveModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCommission(null);
        }}
        onSuccess={fetchCommissions}
        incentive={editingCommission}
        displayLabel={DISPLAY_LABEL}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDeleteCommission}
        title={`Delete ${DISPLAY_LABEL}`}
        message={`Are you sure you want to delete this ${DISPLAY_LABEL} record? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default OthersAdvancePage;

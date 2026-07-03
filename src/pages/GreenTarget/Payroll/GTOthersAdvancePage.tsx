// src/pages/GreenTarget/Payroll/GTOthersAdvancePage.tsx
// Green Target Others (Advance) entry page. Same flow as the Tien Hock
// Others (Advance) page but scoped to GT payroll employees and
// greentarget.commission_records (is_advance = true = raises gross, then
// deducted as an advance; net effect ~0). GT has no locations.
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
import { useGTPayrollEmployees } from "../../../utils/greenTarget/useGTPayrollEmployees";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";

const DISPLAY_LABEL = "Others (Advance)";
const API_BASE = "/greentarget/api/incentives";

interface Advance {
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

const GTOthersAdvancePage: React.FC = () => {
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

  const { employees: gtEmployees } = useGTPayrollEmployees();
  const allowedEmployeeIds = useMemo(
    () => gtEmployees.map((e) => e.employee_id),
    [gtEmployees]
  );

  const [advances, setAdvances] = useState<Advance[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>(getInitialSearch);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState<Advance | null>(null);
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
    fetchAdvances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

  const fetchAdvances = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const startDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-01`;
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const endDate = `${currentYear}-${currentMonth
        .toString()
        .padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`;
      const url = `${API_BASE}?is_advance=true&start_date=${encodeURIComponent(
        startDate
      )}&end_date=${encodeURIComponent(endDate)}`;
      const response = await api.get(url);
      setAdvances(response || []);
    } catch (error) {
      console.error("Error fetching advances:", error);
      toast.error(`Failed to load ${DISPLAY_LABEL}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (advance: Advance): void => {
    setEditingAdvance(advance);
    setShowEditModal(true);
  };

  const handleDelete = async (): Promise<void> => {
    if (!deletingId) return;
    try {
      await api.delete(`${API_BASE}/${deletingId}`);
      toast.success(`${DISPLAY_LABEL} record deleted successfully`);
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchAdvances();
    } catch (error) {
      console.error("Error deleting advance:", error);
      toast.error(`Failed to delete ${DISPLAY_LABEL}`);
    }
  };

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);

  const filteredAdvances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return advances;
    return advances.filter((advance) => {
      const amount = Number(advance.amount) || 0;
      const dateFormatted = (() => {
        try {
          return format(new Date(advance.commission_date), "dd MMM yyyy");
        } catch {
          return "";
        }
      })();
      const dateIso =
        typeof advance.commission_date === "string"
          ? advance.commission_date.slice(0, 10)
          : "";
      const haystack = [
        advance.employee_id || "",
        advance.employee_name || "",
        advance.description || "",
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
  }, [advances, searchQuery]);

  const totalAmount = filteredAdvances.reduce(
    (sum, advance) => sum + (Number(advance.amount) || 0),
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
            onClick={fetchAdvances}
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
                Total: {filteredAdvances.length} records
              </div>
              <div className="font-medium">
                Amount: {formatCurrency(totalAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
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
        ) : filteredAdvances.length === 0 ? (
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
                {filteredAdvances.map((advance) => (
                  <tr
                    key={advance.id}
                    className="group transition-colors duration-150 hover:bg-sky-50/60 dark:hover:bg-sky-900/20"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {advance.employee_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {advance.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(advance.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {advance.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(new Date(advance.commission_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(advance)}
                          className="p-1.5 rounded-full text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors duration-150"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(advance.id);
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
          onSuccess={fetchAdvances}
          currentYear={currentYear}
          currentMonth={currentMonth}
          incentiveType="Bonus"
          displayLabel={DISPLAY_LABEL}
          displayLabelPlural={DISPLAY_LABEL}
          apiBasePath={API_BASE}
          forceIsAdvance={true}
          allowedEmployeeIds={allowedEmployeeIds}
        />
      )}

      <EditIncentiveModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingAdvance(null);
        }}
        onSuccess={fetchAdvances}
        incentive={editingAdvance}
        displayLabel={DISPLAY_LABEL}
        apiBasePath={API_BASE}
        forceIsAdvance={true}
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

export default GTOthersAdvancePage;

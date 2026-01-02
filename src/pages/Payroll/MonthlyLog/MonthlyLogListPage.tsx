// src/pages/Payroll/MonthlyLogListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconCalendarEvent,
  IconClipboardList,
  IconLock,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import StyledListbox from "../../../components/StyledListbox";
import { getJobConfig } from "../../../configs/payrollJobConfigs";
import MonthNavigator from "../../../components/MonthNavigator";
import YearNavigator from "../../../components/YearNavigator";

interface MonthlyLogListPageProps {
  jobType: string;
}

interface MonthlyWorkLog {
  id: number;
  log_month: number;
  log_year: number;
  section: string;
  status: string;
  total_workers: number;
  total_hours: number;
  total_overtime_hours: number;
  created_at: string;
  updated_at: string;
}

const MonthlyLogListPage: React.FC<MonthlyLogListPageProps> = ({ jobType }) => {
  const [workLogs, setWorkLogs] = useState<MonthlyWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const jobConfig = getJobConfig(jobType);
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-12

  const [filters, setFilters] = useState({
    year: currentYear,
    month: null as number | null,
    status: null as string | null,
  });

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [logToDelete, setLogToDelete] = useState<MonthlyWorkLog | null>(null);

  // Computed date for MonthNavigator (use current month if filter.month is null)
  const selectedMonthDate = useMemo(() => {
    const month = filters.month ?? currentMonth;
    return new Date(filters.year, month - 1, 1);
  }, [filters.month, filters.year, currentMonth]);

  // Handler for MonthNavigator
  const handleMonthNavigatorChange = (date: Date) => {
    setFilters({
      ...filters,
      month: date.getMonth() + 1,
      year: date.getFullYear(),
    });
  };

  // Handler for YearNavigator
  const handleYearNavigatorChange = (year: number) => {
    setFilters({
      ...filters,
      year: year,
    });
  };

  // Toggle all months filter
  const handleToggleAllMonths = () => {
    setFilters({
      ...filters,
      month: filters.month === null ? currentMonth : null,
    });
  };

  const statusOptions = [
    { id: "all", name: "All Status" },
    { id: "Submitted", name: "Submitted" },
    { id: "Processed", name: "Processed" },
  ];

  const fetchWorkLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();

      if (filters.year) {
        params.append("year", filters.year.toString());
      }

      if (filters.month && filters.month !== null) {
        params.append("month", filters.month.toString());
      }

      // Add section filter based on job configuration
      if (jobConfig?.section && jobConfig.section.length > 0) {
        params.append("section", jobConfig.section[0]);
      }

      if (filters.status && filters.status !== "all") {
        params.append("status", filters.status);
      }

      // Remove pagination - fetch all records
      params.append("limit", "1000");

      const response = await api.get(
        `/api/monthly-work-logs?${params.toString()}`
      );

      setWorkLogs(response.logs);
    } catch (error) {
      console.error("Error fetching monthly work logs:", error);
      toast.error("Failed to fetch monthly work logs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkLogs();
  }, [filters, jobConfig]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalRecords = workLogs.length;
    const totalHours = workLogs.reduce((sum, log) => sum + log.total_hours, 0);
    const totalOvertimeHours = workLogs.reduce(
      (sum, log) => sum + log.total_overtime_hours,
      0
    );
    const totalWorkers = workLogs.reduce(
      (sum, log) => sum + log.total_workers,
      0
    );
    return { totalRecords, totalHours, totalOvertimeHours, totalWorkers };
  }, [workLogs]);

  const handleAddEntry = () => {
    navigate(
      `/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly-entry`
    );
  };

  const handleViewLog = (log: MonthlyWorkLog) => {
    navigate(
      `/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${log.id}`
    );
  };

  const handleEditLog = (log: MonthlyWorkLog) => {
    navigate(
      `/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${log.id}/edit`
    );
  };

  const handleDeleteLog = async () => {
    if (!logToDelete) return;

    try {
      await api.delete(`/api/monthly-work-logs/${logToDelete.id}`);
      toast.success("Monthly work log deleted successfully");
      fetchWorkLogs();
    } catch (error: any) {
      console.error("Error deleting monthly work log:", error);
      toast.error(
        error?.response?.data?.message || "Failed to delete monthly work log"
      );
    } finally {
      setShowDeleteDialog(false);
      setLogToDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "Processed") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
          <IconLock size={12} className="mr-1" />
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-100 text-sky-700">
        {status}
      </span>
    );
  };

  const getMonthName = (month: number) => {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return monthNames[month - 1];
  };

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 px-4 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: Title + Stats */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
              {jobConfig?.name} Monthly Records
            </h1>
            {!isLoading && workLogs.length > 0 && (
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
                <span className="text-default-300 hidden sm:inline">|</span>
                <div className="flex items-center gap-1.5">
                  <IconCalendarEvent size={16} className="text-sky-600 dark:text-sky-400" />
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    {summaryStats.totalRecords}
                  </span>
                  <span className="text-default-400">records</span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Filters + Button */}
          <div className="flex flex-wrap items-center gap-3">
            <YearNavigator
              selectedYear={filters.year}
              onChange={handleYearNavigatorChange}
              showGoToCurrentButton={false}
            />
            <div className="flex items-center gap-2">
              <div
                className={
                  filters.month === null ? "opacity-50 pointer-events-none" : ""
                }
              >
                <MonthNavigator
                  selectedMonth={selectedMonthDate}
                  onChange={handleMonthNavigatorChange}
                  formatDisplay={(date) =>
                    date.toLocaleDateString("en-MY", { month: "long" })
                  }
                  showGoToCurrentButton={false}
                />
              </div>
              <button
                onClick={handleToggleAllMonths}
                className={`px-3 h-[40px] text-xs font-medium rounded-lg border transition-colors ${
                  filters.month === null
                    ? "bg-sky-100 text-sky-700 border-sky-300"
                    : "bg-white text-default-600 border-default-300 hover:bg-default-50"
                }`}
              >
                All
              </button>
            </div>
            <div className="w-32">
              <StyledListbox
                value={filters.status || "all"}
                onChange={(value) =>
                  setFilters({ ...filters, status: value.toString() })
                }
                options={statusOptions}
                rounded="lg"
              />
            </div>
            <Button onClick={handleAddEntry} icon={IconPlus} color="sky">
              New Entry
            </Button>
          </div>
        </div>
      </div>

      {/* Table with Sticky Header */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : workLogs.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            <table className="min-w-full table-fixed">
              <thead className="bg-default-100 dark:bg-gray-800 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-40">
                    Month
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-24">
                    Year
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-28">
                    Workers
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-32">
                    Regular Hrs
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-32">
                    OT Hours
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-28">
                    Status
                  </th>
                  <th className="w-24 px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 bg-white dark:bg-gray-800">
                {workLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    onClick={() => handleViewLog(log)}
                  >
                    <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200 font-medium">
                      {getMonthName(log.log_month)}
                    </td>
                    <td className="px-4 py-2 text-sm text-center text-default-700 dark:text-gray-200">
                      {log.log_year}
                    </td>
                    <td className="px-4 py-2 text-sm text-center text-default-700 dark:text-gray-200">
                      {log.total_workers}
                    </td>
                    <td className="px-4 py-2 text-sm text-center text-default-700 dark:text-gray-200">
                      {log.total_hours.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-sm text-center text-default-700 dark:text-gray-200">
                      {log.total_overtime_hours.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="px-4 py-2 text-center text-sm">
                      <div
                        className="flex items-center justify-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {log.status !== "Processed" && (
                          <>
                            <button
                              onClick={() => handleEditLog(log)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition-colors"
                              title="Edit"
                            >
                              <IconPencil size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setLogToDelete(log);
                                setShowDeleteDialog(true);
                              }}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors"
                              title="Delete"
                            >
                              <IconTrash size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 rounded-full bg-default-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <IconClipboardList size={32} className="text-default-400" />
            </div>
            <p className="text-default-600 dark:text-gray-300 font-medium mb-1">
              No records found
            </p>
            <p className="text-default-400 text-sm text-center max-w-md">
              No {jobConfig?.name.toLowerCase()} monthly records found for the
              selected period. Click "New Entry" to add a monthly work log.
            </p>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setLogToDelete(null);
        }}
        onConfirm={handleDeleteLog}
        title="Delete Monthly Work Log"
        message={`Are you sure you want to delete this monthly work log? This action cannot be undone.`}
        variant="danger"
      />
    </div>
  );
};

export default MonthlyLogListPage;

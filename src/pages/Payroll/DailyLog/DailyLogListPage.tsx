// src/pages/Payroll/ProductionListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconCalendarEvent,
  IconClock,
  IconUsers,
  IconClipboardList,
  IconLock,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import DateRangePicker from "../../../components/DateRangePicker";
import MonthNavigator from "../../../components/MonthNavigator";
import StyledListbox from "../../../components/StyledListbox";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getJobConfig } from "../../../configs/payrollJobConfigs";

interface DailyLogListPageProps {
  jobType: string;
}

interface WorkLogFilters {
  dateRange: {
    start: Date;
    end: Date;
  };
  shift: string | null;
  status: string | null;
}

interface WorkLog {
  id: number;
  log_date: string;
  shift: number;
  section: string;
  day_type: "Biasa" | "Ahad" | "Umum";
  status: string;
  total_workers: number;
  total_hours: number;
  created_at: string;
  updated_at: string;
}

const DailyLogListPage: React.FC<DailyLogListPageProps> = ({ jobType }) => {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const jobConfig = getJobConfig(jobType);

  // Cache key for storing date range in localStorage
  const dateRangeCacheKey = `dailyLogListPage_dateRange_${jobType}`;

  // Initialize filters with cached date range if available
  const [filters, setFilters] = useState<WorkLogFilters>(() => {
    const cached = localStorage.getItem(dateRangeCacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          dateRange: {
            start: new Date(parsed.start),
            end: new Date(parsed.end),
          },
          shift: null,
          status: null,
        };
      } catch {
        // Fall back to default if parsing fails
      }
    }
    return {
      dateRange: {
        start: new Date(new Date().setDate(new Date().getDate() - 7)),
        end: new Date(),
      },
      shift: null,
      status: null,
    };
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [logToDelete, setLogToDelete] = useState<WorkLog | null>(null);

  // Use Date object for month navigation - initialize based on cached date range
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const cached = localStorage.getItem(dateRangeCacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const startDate = new Date(parsed.start);
        return new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      } catch {
        // Fall back to default
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Cache date range whenever it changes
  useEffect(() => {
    localStorage.setItem(
      dateRangeCacheKey,
      JSON.stringify({
        start: filters.dateRange.start.toISOString(),
        end: filters.dateRange.end.toISOString(),
      })
    );
  }, [filters.dateRange, dateRangeCacheKey]);

  const shiftOptions = [
    { id: "all", name: "All Shifts" },
    ...(jobConfig?.defaultShifts?.map((shift) => ({
      id: shift.toString(),
      name: shift === 1 ? "Day Shift" : "Night Shift",
    })) || []),
  ];

  const statusOptions = [
    { id: "all", name: "All Status" },
    { id: "Submitted", name: "Submitted" },
    { id: "Processed", name: "Processed" },
  ];

  const fetchWorkLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("startDate", format(filters.dateRange.start, "yyyy-MM-dd"));
      params.append("endDate", format(filters.dateRange.end, "yyyy-MM-dd"));

      // Add section filter based on job configuration
      if (jobConfig?.section && jobConfig.section.length > 0) {
        params.append("section", jobConfig.section[0]); // Use the first section
      }

      if (filters.shift && filters.shift !== "all") {
        params.append("shift", filters.shift);
      }

      if (filters.status && filters.status !== "all") {
        params.append("status", filters.status);
      }

      // Remove pagination - fetch all records
      params.append("limit", "1000");

      const response = await api.get(
        `/api/daily-work-logs?${params.toString()}`
      );

      setWorkLogs(response.logs);
    } catch (error) {
      console.error("Error fetching work logs:", error);
      toast.error("Failed to fetch work logs");
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
    const totalWorkers = workLogs.reduce(
      (sum, log) => sum + log.total_workers,
      0
    );
    return { totalRecords, totalHours, totalWorkers };
  }, [workLogs]);

  // Handle month change from MonthNavigator
  const handleMonthChange = (newDate: Date) => {
    setSelectedMonth(newDate);

    // Create start date (1st of the selected month)
    const startDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (last day of the selected month)
    const endDate = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    // Update date range
    setFilters({ ...filters, dateRange: { start: startDate, end: endDate } });
  };

  const handleAddEntry = () => {
    navigate(`/payroll/${jobType.toLowerCase()}-entry`);
  };

  const handleViewLog = (log: WorkLog) => {
    navigate(`/payroll/${jobType.toLowerCase()}-production/${log.id}`);
  };

  const handleEditLog = (log: WorkLog) => {
    navigate(`/payroll/${jobType.toLowerCase()}-production/${log.id}/edit`);
  };

  const handleDeleteLog = async () => {
    if (!logToDelete) return;

    try {
      await api.delete(`/api/daily-work-logs/${logToDelete.id}`);
      toast.success("Work log deleted successfully");
      fetchWorkLogs();
    } catch (error: any) {
      console.error("Error deleting work log:", error);
      toast.error(
        error?.response?.data?.message || "Failed to delete work log"
      );
    } finally {
      setShowDeleteDialog(false);
      setLogToDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "Processed") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
          <IconLock size={12} className="mr-1" />
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
        {status}
      </span>
    );
  };

  const getDayTypeColor = (dayType: string, logDate?: string) => {
    if (dayType === "Umum") return "text-red-600 dark:text-red-400";
    if (dayType === "Ahad") return "text-amber-600 dark:text-amber-400";
    // Check if it's Saturday (and not a holiday)
    if (logDate && dayType === "Biasa") {
      const date = new Date(logDate);
      if (date.getDay() === 6) return "text-sky-600 dark:text-sky-400";
    }
    return "text-default-700 dark:text-gray-200";
  };

  const getDisplayDayType = (dayType: string, logDate?: string): string => {
    if (dayType === "Biasa" && logDate) {
      const date = new Date(logDate);
      if (date.getDay() === 6) return "Sabtu";
    }
    return dayType;
  };

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 px-4 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: Title + Stats */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
              {jobConfig?.name} Records
            </h1>
            {!isLoading && workLogs.length > 0 && (
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
                <span className="text-default-300 hidden sm:inline">|</span>
                <div className="flex items-center gap-1.5">
                  <IconCalendarEvent size={16} className="text-sky-600 dark:text-sky-400" />
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    {summaryStats.totalRecords}
                  </span>
                  <span className="text-default-400 dark:text-gray-400">records</span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Filters + Button */}
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker
              dateRange={filters.dateRange}
              onDateChange={(newRange) =>
                setFilters({ ...filters, dateRange: newRange })
              }
            />
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
              dateRange={filters.dateRange}
            />
            <div className="w-32">
              <StyledListbox
                value={filters.shift || "all"}
                onChange={(value) =>
                  setFilters({ ...filters, shift: value.toString() })
                }
                options={shiftOptions}
                rounded="lg"
              />
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
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-32">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-24">
                    Shift
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-24">
                    Day Type
                  </th>
                  {/* Dynamic context columns */}
                  {jobConfig?.contextFields
                    .filter((field) => field.displayInSummary)
                    .map((field) => (
                      <th
                        key={field.id}
                        className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-28"
                      >
                        {field.label}
                      </th>
                    ))}
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-28">
                    Workers
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-24">
                    Hours
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-28">
                    Status
                  </th>
                  <th className="w-24 px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {workLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    onClick={() => handleViewLog(log)}
                  >
                    <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
                      {format(new Date(log.log_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
                      {log.shift === 1 ? "Day" : "Night"}
                    </td>
                    <td
                      className={`px-4 py-2 text-sm text-center font-medium ${getDayTypeColor(
                        log.day_type,
                        log.log_date
                      )}`}
                    >
                      {getDisplayDayType(log.day_type, log.log_date)}
                    </td>
                    {/* Dynamic context values */}
                    {jobConfig?.contextFields
                      .filter((field) => field.displayInSummary)
                      .map((field) => (
                        <td
                          key={field.id}
                          className="px-4 py-2 text-sm text-center text-default-700 dark:text-gray-200"
                        >
                          {(log as any).context_data?.[field.id] ?? "-"}
                        </td>
                      ))}
                    <td className="px-4 py-2 text-sm text-center text-default-700 dark:text-gray-200">
                      {log.total_workers}
                    </td>
                    <td className="px-4 py-2 text-sm text-center text-default-700 dark:text-gray-200">
                      {log.total_hours.toFixed(1)}
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
              No {jobConfig?.name.toLowerCase()} records found for the selected
              date range. Click "New Entry" to add a work log.
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
        title="Delete Work Log"
        message={`Are you sure you want to delete this work log? This action cannot be undone.`}
        variant="danger"
      />
    </div>
  );
};

export default DailyLogListPage;

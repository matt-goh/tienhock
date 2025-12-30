// src/pages/Payroll/ProductionListPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { IconPlus, IconPencil, IconTrash, IconEye } from "@tabler/icons-react";
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
  const [workLogs, setWorkLogs] = useState<any[]>([]);
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
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

      params.append("page", currentPage.toString());
      params.append("limit", "20");

      const response = await api.get(
        `/api/daily-work-logs?${params.toString()}`
      );

      setWorkLogs(response.logs);
      setTotalLogs(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error("Error fetching work logs:", error);
      toast.error("Failed to fetch work logs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkLogs();
  }, [filters, currentPage, jobConfig]);

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

  const handleViewLog = (log: any) => {
    navigate(`/payroll/${jobType.toLowerCase()}-production/${log.id}`);
  };

  const handleEditLog = (log: any) => {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Submitted":
        return "bg-sky-100 text-sky-700";
      case "Processed":
        return "bg-emerald-100 text-emerald-700";
      default:
        return "bg-default-100 text-default-700";
    }
  };

  const getDayTypeColor = (dayType: string, logDate?: string) => {
    if (dayType === "Umum") return "text-red-600";
    if (dayType === "Ahad") return "text-amber-600";
    // Check if it's Saturday (and not a holiday)
    if (logDate && dayType === "Biasa") {
      const date = new Date(logDate);
      if (date.getDay() === 6) return "text-sky-600";
    }
    return "text-default-700";
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
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          {jobConfig?.name} Records
        </h1>
        <div className="mt-4 md:mt-0">
          <Button onClick={handleAddEntry} icon={IconPlus} color="sky">
            New {jobConfig?.name} Entry
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-default-200">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Date Range Picker */}
          <DateRangePicker
            dateRange={filters.dateRange}
            onDateChange={(newRange) =>
              setFilters({ ...filters, dateRange: newRange })
            }
          />
          {/* Month Navigator */}
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            showGoToCurrentButton={false}
            dateRange={filters.dateRange}
          />
          {/* Shift Listbox */}
          <div className="w-40">
            <StyledListbox
              value={filters.shift || "all"}
              onChange={(value) =>
                setFilters({ ...filters, shift: value.toString() })
              }
              options={shiftOptions}
              rounded="lg"
            />
          </div>
          {/* Status Listbox */}
          <div className="w-40">
            <StyledListbox
              value={filters.status || "all"}
              onChange={(value) =>
                setFilters({ ...filters, status: value.toString() })
              }
              options={statusOptions}
              rounded="lg"
            />
          </div>
        </div>
      </div>

      {/* Table with context-specific columns */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : workLogs.length > 0 ? (
        <div className="bg-white rounded-lg border border-default-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                    Shift
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Day Type
                  </th>
                  {/* Dynamic context columns */}
                  {jobConfig?.contextFields
                    .filter((field) => field.displayInSummary)
                    .map((field) => (
                      <th
                        key={field.id}
                        className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600"
                      >
                        {field.label}
                      </th>
                    ))}
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Total Workers
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Total Hours
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Status
                  </th>
                  <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200 bg-white">
                {workLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-default-50 cursor-pointer"
                    onClick={() => handleViewLog(log)}
                  >
                    <td className="px-4 py-3 text-sm text-default-700">
                      {format(new Date(log.log_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-700">
                      {log.shift === 1 ? "Day" : "Night"}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm text-center font-medium ${getDayTypeColor(
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
                          className="px-4 py-3 text-sm text-center text-default-700"
                        >
                          {log.context_data?.[field.id] ?? "-"}
                        </td>
                      ))}
                    <td className="px-4 py-3 text-sm text-center text-default-700">
                      {log.total_workers}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-default-700">
                      {log.total_hours.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          log.status
                        )}`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          className="text-sky-600 hover:text-sky-800"
                          title="View"
                          onClick={() => {}}
                        >
                          <IconEye size={18} />
                        </button>
                        {log.status !== "Processed" && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditLog(log);
                              }}
                              className="text-emerald-600 hover:text-emerald-800"
                              title="Edit"
                            >
                              <IconPencil size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLogToDelete(log);
                                setShowDeleteDialog(true);
                              }}
                              className="text-rose-600 hover:text-rose-800"
                              title="Delete"
                            >
                              <IconTrash size={18} />
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 flex items-center justify-between border-t border-default-200">
              <div className="text-sm text-default-500">
                Showing {workLogs.length} of {totalLogs} records
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-default-200 shadow-sm">
          <div className="p-6 text-center text-default-500">
            <p>No production records found.</p>
            <p className="mt-2">
              Click the "New {jobConfig?.name} Entry" button to record work
              hours.
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

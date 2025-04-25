// src/pages/Payroll/MeeProductionListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { IconPlus, IconPencil, IconTrash, IconEye } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import DateRangePicker from "../../components/DateRangePicker";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { format } from "date-fns";
import StyledListbox from "../../components/StyledListbox";

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

const MeeProductionListPage: React.FC = () => {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<WorkLogFilters>({
    dateRange: {
      start: new Date(new Date().setDate(new Date().getDate() - 7)),
      end: new Date(),
    },
    shift: null,
    status: null,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [logToDelete, setLogToDelete] = useState<WorkLog | null>(null);
  const monthOptions = useMemo(() => {
    return [
      { id: 0, name: "January" },
      { id: 1, name: "February" },
      { id: 2, name: "March" },
      { id: 3, name: "April" },
      { id: 4, name: "May" },
      { id: 5, name: "June" },
      { id: 6, name: "July" },
      { id: 7, name: "August" },
      { id: 8, name: "September" },
      { id: 9, name: "October" },
      { id: 10, name: "November" },
      { id: 11, name: "December" },
    ];
  }, []);
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const [selectedMonth, setSelectedMonth] = useState<{
    id: number;
    name: string;
  }>(() => {
    return monthOptions[currentMonth];
  });

  const navigate = useNavigate();

  const shiftOptions = [
    { id: "all", name: "All Shifts" },
    { id: "1", name: "Day Shift" },
    { id: "2", name: "Night Shift" },
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
  }, [filters, currentPage]);

  const handleMonthChange = (monthId: string | number) => {
    const month = monthOptions.find((m) => m.id === Number(monthId));
    if (!month) return;

    setSelectedMonth(month);

    // Create start date (1st of the selected month)
    const startDate = new Date(currentDate.getFullYear(), month.id, 1);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (last day of the selected month)
    const endDate = new Date(currentDate.getFullYear(), month.id + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    // Update date range
    setFilters({ ...filters, dateRange: { start: startDate, end: endDate } });
  };

  const handleAddEntry = () => {
    navigate("/payroll/mee-machine-entry");
  };

  const handleViewLog = (log: WorkLog) => {
    navigate(`/payroll/mee-production/${log.id}`);
  };

  const handleEditLog = (log: WorkLog) => {
    navigate(`/payroll/mee-production/${log.id}/edit`);
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

  const getDayTypeColor = (dayType: string) => {
    switch (dayType) {
      case "Biasa":
        return "text-default-700";
      case "Ahad":
        return "text-amber-600";
      case "Umum":
        return "text-red-600";
      default:
        return "text-default-700";
    }
  };

  return (
    <div className="relative w-full space-y-4 mx-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Mee Production Records
        </h1>
        <div className="mt-4 md:mt-0">
          <Button
            onClick={handleAddEntry}
            icon={IconPlus}
            color="sky"
            variant="filled"
          >
            New Machine Entry
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
          {/* Month Listbox */}
          <div className="w-40">
            <StyledListbox
              value={selectedMonth.id}
              onChange={handleMonthChange}
              options={monthOptions}
            />
          </div>
          {/* Shift Listbox */}
          <div className="w-40">
            <StyledListbox
              value={filters.shift || "all"}
              onChange={(value) =>
                setFilters({ ...filters, shift: value.toString() })
              }
              options={shiftOptions}
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
            />
          </div>
        </div>
      </div>

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
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                    Section
                  </th>
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
                  <tr key={log.id} className="hover:bg-default-50">
                    <td className="px-4 py-3 text-sm text-default-700">
                      {format(new Date(log.log_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-700">
                      {log.shift === 1 ? "Day" : "Night"}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm text-center font-medium ${getDayTypeColor(
                        log.day_type
                      )}`}
                    >
                      {log.day_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-700">
                      {log.section}
                    </td>
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
                          onClick={() => handleViewLog(log)}
                          className="text-sky-600 hover:text-sky-800"
                          title="View"
                        >
                          <IconEye size={18} />
                        </button>
                        {log.status !== "Processed" && (
                          <>
                            <button
                              onClick={() => handleEditLog(log)}
                              className="text-emerald-600 hover:text-emerald-800"
                              title="Edit"
                            >
                              <IconPencil size={18} />
                            </button>
                            <button
                              onClick={() => {
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
              Click the "New Machine Entry" button to record work hours.
            </p>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
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

export default MeeProductionListPage;

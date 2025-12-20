// src/pages/Payroll/MonthlyLogListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { IconPlus, IconPencil, IconTrash, IconEye } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import StyledListbox from "../../components/StyledListbox";
import { getJobConfig } from "../../configs/payrollJobConfigs";

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

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [logToDelete, setLogToDelete] = useState<MonthlyWorkLog | null>(null);

  const monthOptions = useMemo(() => {
    return [
      { id: "all", name: "All Months" },
      { id: 1, name: "January" },
      { id: 2, name: "February" },
      { id: 3, name: "March" },
      { id: 4, name: "April" },
      { id: 5, name: "May" },
      { id: 6, name: "June" },
      { id: 7, name: "July" },
      { id: 8, name: "August" },
      { id: 9, name: "September" },
      { id: 10, name: "October" },
      { id: 11, name: "November" },
      { id: 12, name: "December" },
    ];
  }, []);

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push({ id: y, name: y.toString() });
    }
    return years;
  }, [currentYear]);

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

      params.append("page", currentPage.toString());
      params.append("limit", "20");

      const response = await api.get(
        `/api/monthly-work-logs?${params.toString()}`
      );

      setWorkLogs(response.logs);
      setTotalLogs(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error("Error fetching monthly work logs:", error);
      toast.error("Failed to fetch monthly work logs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkLogs();
  }, [filters, currentPage, jobConfig]);

  const handleAddEntry = () => {
    navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly-entry`);
  };

  const handleViewLog = (log: MonthlyWorkLog) => {
    navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${log.id}`);
  };

  const handleEditLog = (log: MonthlyWorkLog) => {
    navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${log.id}/edit`);
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

  const getMonthName = (month: number) => {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return monthNames[month - 1];
  };

  return (
    <div className="relative w-full space-y-4 mb-4 mx-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          {jobConfig?.name} Monthly Records
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
          {/* Year Listbox */}
          <div className="w-32">
            <StyledListbox
              value={filters.year}
              onChange={(value) =>
                setFilters({ ...filters, year: Number(value) })
              }
              options={yearOptions}
            />
          </div>
          {/* Month Listbox */}
          <div className="w-40">
            <StyledListbox
              value={filters.month || "all"}
              onChange={(value) =>
                setFilters({
                  ...filters,
                  month: value === "all" ? null : Number(value),
                })
              }
              options={monthOptions}
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

      {/* Table */}
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
                    Month
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Year
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Total Workers
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Regular Hours
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Overtime Hours
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
                    <td className="px-4 py-3 text-sm text-default-700 font-medium">
                      {getMonthName(log.log_month)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-default-700">
                      {log.log_year}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-default-700">
                      {log.total_workers}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-default-700">
                      {log.total_hours.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-default-700">
                      {log.total_overtime_hours.toFixed(1)}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewLog(log);
                          }}
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
            <p>No monthly records found.</p>
            <p className="mt-2">
              Click the "New {jobConfig?.name} Entry" button to record monthly
              work hours.
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

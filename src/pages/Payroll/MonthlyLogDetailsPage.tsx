// src/pages/Payroll/MonthlyLogDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IconPencil, IconTrash, IconCalendar } from "@tabler/icons-react";
import Button from "../../components/Button";
import BackButton from "../../components/BackButton";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getJobConfig } from "../../configs/payrollJobConfigs";
import { Link } from "react-router-dom";

interface MonthlyLogDetailsPageProps {
  jobType: string;
}

interface MonthlyWorkLog {
  id: number;
  log_month: number;
  log_year: number;
  section: string;
  status: string;
  context_data: Record<string, any>;
  created_at: string;
  updated_at: string;
  employeeEntries: EmployeeEntry[];
  leaveRecords: LeaveRecord[];
}

interface EmployeeEntry {
  id: number;
  employee_id: string;
  employee_name: string;
  job_id: string;
  job_name: string;
  total_hours: number;
  overtime_hours: number;
  activities: Activity[];
}

interface Activity {
  id: number;
  pay_code_id: string;
  description: string;
  hours_applied: number | null;
  rate_used: number;
  calculated_amount: number;
  pay_type: string;
  rate_unit: string;
  units_produced?: number | null;
  source?: string;
}

interface LeaveRecord {
  id: number;
  employee_id: string;
  employee_name: string;
  leave_date: string;
  leave_type: string;
  amount_paid: number;
}

const MonthlyLogDetailsPage: React.FC<MonthlyLogDetailsPageProps> = ({
  jobType,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobConfig = getJobConfig(jobType);

  const [workLog, setWorkLog] = useState<MonthlyWorkLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchWorkLog = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        const response = await api.get(`/api/monthly-work-logs/${id}`);
        setWorkLog(response);
      } catch (error) {
        console.error("Error fetching monthly work log:", error);
        toast.error("Failed to load monthly work log");
        navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkLog();
  }, [id, jobType, navigate]);

  const handleEdit = () => {
    navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${id}/edit`);
  };

  const handleDelete = async () => {
    if (!id) return;

    try {
      await api.delete(`/api/monthly-work-logs/${id}`);
      toast.success("Monthly work log deleted successfully");
      navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly`);
    } catch (error: any) {
      console.error("Error deleting monthly work log:", error);
      toast.error(
        error?.response?.data?.message || "Failed to delete monthly work log"
      );
    } finally {
      setShowDeleteDialog(false);
    }
  };

  const getMonthName = (month: number) => {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return monthNames[month - 1];
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

  const getLeaveTypeLabel = (type: string) => {
    switch (type) {
      case "cuti_sakit":
        return "Sick Leave";
      case "cuti_tahunan":
        return "Annual Leave";
      case "cuti_umum":
        return "Public Holiday";
      default:
        return type;
    }
  };

  const getLeaveTypeColor = (type: string) => {
    switch (type) {
      case "cuti_sakit":
        return "bg-amber-100 text-amber-700";
      case "cuti_tahunan":
        return "bg-sky-100 text-sky-700";
      case "cuti_umum":
        return "bg-red-100 text-red-700";
      default:
        return "bg-default-100 text-default-700";
    }
  };

  const toggleExpansion = (entryId: string) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [entryId]: !prev[entryId],
    }));
  };

  // Separate context-linked activities from regular activities
  const separateActivities = (activities: Activity[]) => {
    const contextLinked: Activity[] = [];
    const regular: Activity[] = [];

    activities.forEach((activity) => {
      const isContextLinked = jobConfig?.contextFields.some(
        (field) => field.linkedPayCode === activity.pay_code_id
      );

      if (isContextLinked) {
        contextLinked.push(activity);
      } else {
        regular.push(activity);
      }
    });

    return { contextLinked, regular };
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!workLog) {
    return (
      <div className="flex justify-center items-center h-96">
        <p className="text-default-500">Work log not found</p>
      </div>
    );
  }

  const totalRegularHours = workLog.employeeEntries.reduce(
    (sum, entry) => sum + entry.total_hours,
    0
  );
  const totalOvertimeHours = workLog.employeeEntries.reduce(
    (sum, entry) => sum + entry.overtime_hours,
    0
  );

  return (
    <div className="relative w-full space-y-6 mb-4 mx-4 md:mx-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <BackButton onClick={() => navigate(-1)} />
          <div>
            <h1 className="text-xl font-semibold text-default-800">
              {jobConfig?.name} - {getMonthName(workLog.log_month)} {workLog.log_year}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                  workLog.status
                )}`}
              >
                {workLog.status}
              </span>
            </div>
          </div>
        </div>

        {workLog.status !== "Processed" && (
          <div className="flex gap-2">
            <Button onClick={handleEdit} icon={IconPencil} color="sky">
              Edit
            </Button>
            <Button
              onClick={() => setShowDeleteDialog(true)}
              icon={IconTrash}
              variant="outline"
              color="rose"
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-default-200">
          <p className="text-xs text-default-500 uppercase">Total Employees</p>
          <p className="text-2xl font-semibold text-default-800">
            {workLog.employeeEntries.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-default-200">
          <p className="text-xs text-default-500 uppercase">Regular Hours</p>
          <p className="text-2xl font-semibold text-default-800">
            {totalRegularHours.toFixed(1)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-default-200">
          <p className="text-xs text-default-500 uppercase">Overtime Hours</p>
          <p className="text-2xl font-semibold text-default-800">
            {totalOvertimeHours.toFixed(1)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-default-200">
          <p className="text-xs text-default-500 uppercase">Leave Days</p>
          <p className="text-2xl font-semibold text-default-800">
            {workLog.leaveRecords.length}
          </p>
        </div>
      </div>

      {/* Employee Entries Table */}
      <div className="bg-white rounded-lg border border-default-200">
        <div className="p-4 border-b border-default-200">
          <h2 className="text-sm font-medium text-default-700">
            Employee Work Hours
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-default-200">
            <thead className="bg-default-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                  Employee
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase">
                  Hours
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                  Activities
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-default-500 uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200">
              {workLog.employeeEntries.map((entry) => {
                const employeeTotal = entry.activities.reduce(
                  (sum, activity) => sum + activity.calculated_amount,
                  0
                );

                const { contextLinked, regular } = separateActivities(entry.activities);

                // Calculate total activities count
                const totalActivities = contextLinked.length + regular.length;
                // Determine if we need to show the expand/collapse button
                const needsExpansion = totalActivities > 6;
                // Check if this entry is expanded
                const isExpanded = expandedEntries[String(entry.id)] || false;

                // Prepare activities to display based on expansion state
                const displayContextLinked = isExpanded
                  ? contextLinked
                  : needsExpansion && contextLinked.length > 0
                  ? contextLinked.slice(0, Math.min(contextLinked.length, 6))
                  : contextLinked;

                const displayRegular = isExpanded
                  ? regular
                  : needsExpansion && displayContextLinked.length < 6
                  ? regular.slice(0, Math.min(regular.length, 6 - displayContextLinked.length))
                  : needsExpansion
                  ? []
                  : regular;

                return (
                  <tr key={entry.id} className="bg-white hover:bg-default-50 align-top">
                    <td className="px-4 py-3">
                      <Link
                        to={`/catalogue/staff/${entry.employee_id}`}
                        className="text-sky-600 hover:text-sky-800 font-medium"
                      >
                        {entry.employee_name}
                      </Link>
                      <p className="text-sm text-default-500">
                        {entry.employee_id} • {entry.job_name}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-sm">
                        <p className="font-medium text-default-800">
                          {entry.total_hours.toFixed(1)}
                        </p>
                        {entry.overtime_hours > 0 && (
                          <p className="text-default-500 text-xs">
                            +{entry.overtime_hours.toFixed(1)} OT
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {/* Context-linked activities */}
                        {displayContextLinked.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-sky-600 mb-1">
                              Production Activities
                            </p>
                            <div className="space-y-1">
                              {displayContextLinked.map((activity) => (
                                <div
                                  key={activity.id}
                                  className="flex justify-between text-sm"
                                >
                                  <div>
                                    <span className="font-medium">
                                      {activity.description}
                                    </span>
                                    <span className="text-default-500 ml-2">
                                      ({activity.pay_type})
                                    </span>
                                    <span className="text-default-500 ml-2">
                                      •{" "}
                                      {activity.rate_unit === "Percent"
                                        ? `${activity.rate_used}%`
                                        : `RM${activity.rate_used}`}
                                    </span>
                                    {activity.hours_applied !== null && (
                                      <span className="text-default-500 ml-2">
                                        • {activity.hours_applied} hrs
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-medium ml-4">
                                    RM{activity.calculated_amount.toFixed(2)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Regular activities */}
                        {displayRegular.length > 0 && (
                          <div>
                            {displayContextLinked.length > 0 && (
                              <p className="text-xs font-medium text-default-600 mb-1 mt-2">
                                Standard Activities
                              </p>
                            )}
                            <div className="space-y-1">
                              {displayRegular.map((activity) => (
                                <div
                                  key={activity.id}
                                  className="flex justify-between text-sm"
                                >
                                  <div>
                                    <span className="font-medium">
                                      {activity.description}
                                    </span>
                                    <span className="text-default-500 ml-2">
                                      ({activity.pay_type})
                                    </span>
                                    {activity.source === "employee" && (
                                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-sky-100 text-sky-700">
                                        Staff
                                      </span>
                                    )}
                                    {activity.source === "job" && (
                                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                        Job
                                      </span>
                                    )}
                                    <span className="text-default-500 ml-2">
                                      •{" "}
                                      {activity.rate_unit === "Percent"
                                        ? `${activity.rate_used}%`
                                        : `RM${activity.rate_used}`}
                                    </span>
                                    {activity.hours_applied !== null && (
                                      <span className="text-default-500 ml-2">
                                        • {activity.hours_applied} hrs
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-medium ml-4">
                                    RM{activity.calculated_amount.toFixed(2)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Show more/less button when needed */}
                        {needsExpansion && (
                          <button
                            onClick={() => toggleExpansion(String(entry.id))}
                            className="text-sm font-medium text-sky-600 hover:text-sky-800 flex items-center"
                          >
                            {isExpanded
                              ? "Show Less"
                              : `Show ${
                                  totalActivities -
                                  (displayContextLinked.length + displayRegular.length)
                                } More...`}
                          </button>
                        )}

                        {entry.activities.length === 0 && (
                          <span className="text-sm text-default-400">No activities</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      RM{employeeTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-default-50">
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right font-medium text-default-800"
                >
                  Total
                </td>
                <td className="px-4 py-3 text-right font-bold text-default-900">
                  RM
                  {workLog.employeeEntries
                    .reduce(
                      (sum, entry) =>
                        sum +
                        entry.activities.reduce(
                          (actSum, act) => actSum + act.calculated_amount,
                          0
                        ),
                      0
                    )
                    .toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {workLog.employeeEntries.length === 0 && (
          <div className="p-8 text-center text-default-500">
            No employee entries found.
          </div>
        )}
      </div>

      {/* Leave Records Table */}
      <div className="bg-white rounded-lg border border-default-200">
        <div className="p-4 border-b border-default-200">
          <h2 className="text-sm font-medium text-default-700">
            Leave Records
          </h2>
        </div>

        {workLog.leaveRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200">
                {workLog.leaveRecords.map((record) => (
                  <tr key={record.id} className="bg-white hover:bg-default-50">
                    <td className="px-4 py-3 text-sm text-default-700">
                      <span className="font-medium">{record.employee_name}</span>
                      <span className="text-default-400 ml-2">
                        ({record.employee_id})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-default-700">
                      {format(new Date(record.leave_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getLeaveTypeColor(
                          record.leave_type
                        )}`}
                      >
                        {getLeaveTypeLabel(record.leave_type)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-default-500">
            <IconCalendar size={32} className="mx-auto mb-2 text-default-300" />
            <p>No leave records for this month.</p>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="bg-white p-4 rounded-lg border border-default-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-default-500">Created:</span>
            <span className="ml-2 text-default-700">
              {format(new Date(workLog.created_at), "dd MMM yyyy hh:mm a")}
            </span>
          </div>
          <div>
            <span className="text-default-500">Last Updated:</span>
            <span className="ml-2 text-default-700">
              {format(new Date(workLog.updated_at), "dd MMM yyyy hh:mm a")}
            </span>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Monthly Work Log"
        message="Are you sure you want to delete this monthly work log? This action cannot be undone."
        variant="danger"
      />
    </div>
  );
};

export default MonthlyLogDetailsPage;

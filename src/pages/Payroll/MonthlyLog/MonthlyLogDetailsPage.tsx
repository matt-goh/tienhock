// src/pages/Payroll/MonthlyLogDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  IconPencil,
  IconTrash,
  IconUsers,
  IconClock,
  IconClockPlay,
  IconBeach,
  IconLock,
  IconCalendarEvent,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getJobConfig } from "../../../configs/payrollJobConfigs";

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
  const [expandedEntries, setExpandedEntries] = useState<
    Record<string, boolean>
  >({});

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
        navigate(
          `/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly`
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkLog();
  }, [id, jobType, navigate]);

  const handleBack = () => {
    navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly`);
  };

  const handleEdit = () => {
    navigate(
      `/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${id}/edit`
    );
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
        return "bg-green-100 text-green-700";
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
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
  const totalAmount = workLog.employeeEntries.reduce(
    (sum, entry) =>
      sum +
      entry.activities.reduce(
        (actSum, act) => actSum + act.calculated_amount,
        0
      ),
    0
  );

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="bg-white rounded-lg border border-default-200 px-4 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: Back + Title + Stats */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <BackButton onClick={handleBack} />
              <div className="h-6 w-px bg-default-300"></div>
              <div>
                <h1 className="text-xl font-semibold text-default-800">
                  {jobConfig?.name} - {getMonthName(workLog.log_month)}{" "}
                  {workLog.log_year}
                </h1>
                <p className="text-sm text-default-500">
                  Section: {workLog.section}
                </p>
              </div>
            </div>

            {/* Inline Stats */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm sm:ml-3">
              <span className="text-default-300 hidden sm:inline">|</span>
              <div className="flex items-center gap-1.5">
                <IconUsers size={16} className="text-sky-600" />
                <span className="font-medium text-default-700">
                  {workLog.employeeEntries.length}
                </span>
                <span className="text-default-400">employees</span>
              </div>
              <span className="text-default-300">•</span>
              <div className="flex items-center gap-1.5">
                <IconClock size={16} className="text-emerald-600" />
                <span className="font-medium text-default-700">
                  {totalRegularHours.toFixed(1)}
                </span>
                <span className="text-default-400">hrs</span>
              </div>
              <span className="text-default-300">•</span>
              <div className="flex items-center gap-1.5">
                <IconClockPlay size={16} className="text-amber-600" />
                <span className="font-medium text-default-700">
                  {totalOvertimeHours.toFixed(1)}
                </span>
                <span className="text-default-400">OT hrs</span>
              </div>
              <span className="text-default-300">•</span>
              <div className="flex items-center gap-1.5">
                <IconBeach size={16} className="text-rose-500" />
                <span className="font-medium text-default-700">
                  {workLog.leaveRecords.length}
                </span>
                <span className="text-default-400">leave days</span>
              </div>
              <span className="text-default-300">•</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  workLog.status === "Processed"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-sky-100 text-sky-700"
                }`}
              >
                {workLog.status === "Processed" && (
                  <IconLock size={12} className="mr-1" />
                )}
                {workLog.status}
              </span>
            </div>
          </div>

          {/* Right: Action Buttons */}
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
      </div>

      {/* Employee Work Hours */}
      <div className="bg-white rounded-lg border border-default-200 overflow-hidden">
        {/* Section Header - Sky */}
        <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-sky-800 flex items-center gap-2">
              <IconUsers size={16} className="text-sky-600" />
              Employee Work Hours
            </h3>
            <div className="flex items-center gap-3 text-xs text-sky-700">
              <span className="font-medium">
                {workLog.employeeEntries.length} employees
              </span>
              <span className="text-sky-300">•</span>
              <span className="font-medium">
                {totalRegularHours.toFixed(1)} reg hrs
              </span>
              <span className="text-sky-300">•</span>
              <span className="font-medium">
                {totalOvertimeHours.toFixed(1)} OT hrs
              </span>
            </div>
          </div>
        </div>

        {workLog.employeeEntries.length > 0 ? (
          <div className="max-h-full overflow-y-auto">
            <table className="min-w-full">
              <thead className="bg-default-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-600 uppercase">
                    Employee
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-default-600 uppercase w-24">
                    Hours
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-600 uppercase">
                    Activities
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-default-600 uppercase w-28">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100">
                {workLog.employeeEntries.map((entry) => {
                  const employeeTotal = entry.activities.reduce(
                    (sum, activity) => sum + activity.calculated_amount,
                    0
                  );

                  const { contextLinked, regular } = separateActivities(
                    entry.activities
                  );

                  const totalActivities = contextLinked.length + regular.length;
                  const needsExpansion = totalActivities > 6;
                  const isExpanded =
                    expandedEntries[String(entry.id)] || false;

                  const displayContextLinked = isExpanded
                    ? contextLinked
                    : needsExpansion && contextLinked.length > 0
                    ? contextLinked.slice(
                        0,
                        Math.min(contextLinked.length, 6)
                      )
                    : contextLinked;

                  const displayRegular = isExpanded
                    ? regular
                    : needsExpansion && displayContextLinked.length < 6
                    ? regular.slice(
                        0,
                        Math.min(regular.length, 6 - displayContextLinked.length)
                      )
                    : needsExpansion
                    ? []
                    : regular;

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-default-50 transition-colors align-top"
                    >
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

                          {needsExpansion && (
                            <button
                              onClick={() => toggleExpansion(String(entry.id))}
                              className="text-sm font-medium text-sky-600 hover:text-sky-800 flex items-center"
                            >
                              {isExpanded
                                ? "Show Less"
                                : `Show ${
                                    totalActivities -
                                    (displayContextLinked.length +
                                      displayRegular.length)
                                  } More...`}
                            </button>
                          )}

                          {entry.activities.length === 0 && (
                            <span className="text-sm text-default-400">
                              No activities
                            </span>
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
              <tfoot className="bg-sky-50 border-t-2 border-sky-200">
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-3 text-right font-semibold text-sky-800"
                  >
                    Total Employee Pay
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-sky-900">
                    {formatCurrency(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-default-500">
            No employee entries found.
          </div>
        )}
      </div>

      {/* Leave Records */}
      <div className="bg-white rounded-lg border border-default-200 overflow-hidden">
        {/* Section Header - Rose */}
        <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-rose-800 flex items-center gap-2">
              <IconBeach size={16} className="text-rose-600" />
              Leave Records
            </h3>
            <span className="text-xs font-medium text-rose-700">
              {workLog.leaveRecords.length} leave days
            </span>
          </div>
        </div>

        {workLog.leaveRecords.length > 0 ? (
          <table className="min-w-full">
            <thead className="bg-default-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-default-600 uppercase">
                  Employee
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-default-600 uppercase w-32">
                  Date
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-default-600 uppercase w-32">
                  Type
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-100">
              {workLog.leaveRecords.map((record) => (
                <tr
                  key={record.id}
                  className="hover:bg-default-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/catalogue/staff/${record.employee_id}`}
                      className="text-sky-600 hover:text-sky-800 font-medium"
                    >
                      {record.employee_name}
                    </Link>
                    <p className="text-sm text-default-500">
                      {record.employee_id}
                    </p>
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
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-12 h-12 rounded-full bg-default-100 flex items-center justify-center mb-3">
              <IconCalendarEvent size={24} className="text-default-400" />
            </div>
            <p className="text-default-500 text-sm">
              No leave records for this month
            </p>
          </div>
        )}
      </div>

      {/* Metadata - Smaller, less prominent */}
      <div className="text-xs text-default-400 flex items-center justify-end gap-3">
        <span>
          Created: {format(new Date(workLog.created_at), "dd MMM yyyy hh:mm a")}
        </span>
        <span>•</span>
        <span>
          Updated: {format(new Date(workLog.updated_at), "dd MMM yyyy hh:mm a")}
        </span>
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

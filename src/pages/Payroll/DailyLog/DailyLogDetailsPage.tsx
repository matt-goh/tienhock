// src/pages/Payroll/DailyLogDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  IconPencil,
  IconUsers,
  IconClock,
  IconLock,
  IconSun,
  IconMoon,
  IconCalendarEvent,
  IconBeach,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import BackButton from "../../../components/BackButton";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getJobConfig } from "../../../configs/payrollJobConfigs";

interface DailyLogDetailsPageProps {
  jobType: string;
}

interface EmployeeEntry {
  id: number;
  work_log_id: number;
  employee_id: string;
  total_hours: number;
  job_id: string;
  following_salesman_id?: string | null;
  muat_mee_bags?: number;
  muat_bihun_bags?: number;
  location_type?: string;
  employee_name: string;
  job_name: string;
  following_salesman_name?: string | null;
  activities: any[];
}

interface LeaveRecord {
  id: number;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  days_taken: number;
  amount_paid: number;
  status: string;
  notes?: string;
}

interface DailyWorkLog {
  id: number;
  log_date: string;
  shift: number;
  day_type: string;
  section: string;
  status: string;
  context_data: any;
  employeeEntries: EmployeeEntry[];
  leaveRecords?: LeaveRecord[];
}

const DailyLogDetailsPage: React.FC<DailyLogDetailsPageProps> = ({
  jobType,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workLog, setWorkLog] = useState<DailyWorkLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const jobConfig = getJobConfig(jobType);
  const [expandedEntries, setExpandedEntries] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    fetchWorkLogDetails();
  }, [id]);

  const fetchWorkLogDetails = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await api.get(`/api/daily-work-logs/${id}`);
      setWorkLog(response);
    } catch (error) {
      console.error("Error fetching work log details:", error);
      toast.error("Failed to fetch work log details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/payroll/${jobType.toLowerCase()}-production`);
  };

  const handleEdit = () => {
    navigate(`/payroll/${jobType.toLowerCase()}-production/${id}/edit`);
  };

  const getDayTypeColor = (dayType: string, logDate?: string) => {
    if (dayType === "Umum") return "text-red-600 dark:text-red-400";
    if (dayType === "Ahad") return "text-amber-600 dark:text-amber-400";
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

  const toggleExpansion = (entryId: string) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [entryId]: !prev[entryId],
    }));
  };

  const separateActivities = (activities: any[]) => {
    const contextLinked: any[] = [];
    const regular: any[] = [];

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
      <div className="text-center py-12">
        <p className="text-default-500 dark:text-gray-400">Work log not found</p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back to List
        </Button>
      </div>
    );
  }

  const totalEmployees = workLog.employeeEntries.length;
  const totalHours = workLog.employeeEntries.reduce(
    (sum: number, entry: EmployeeEntry) => sum + entry.total_hours,
    0
  );
  const totalAmount = workLog.employeeEntries.reduce(
    (sum: number, entry: EmployeeEntry) =>
      sum +
      entry.activities.reduce(
        (actSum: number, activity: any) => actSum + activity.calculated_amount,
        0
      ),
    0
  );
  const totalLeaveAmount =
    workLog.leaveRecords?.reduce(
      (sum, record) => sum + record.amount_paid,
      0
    ) || 0;

  // Helper to get context field display value
  const getContextFieldValue = (fieldId: string) => {
    if (!workLog?.context_data) return null;
    const value = workLog.context_data[fieldId];
    if (value === undefined) return null;

    const field = jobConfig?.contextFields.find((f) => f.id === fieldId);
    if (!field) return String(value);

    if (field.type === "select") {
      return field.options?.find((opt) => opt.id === value)?.label || value;
    }
    return String(value);
  };

  // Check if there's context data to display
  const hasContextData =
    workLog?.context_data && Object.keys(workLog.context_data).length > 0;

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Back + Title + Stats */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2">
            <BackButton onClick={handleBack} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <div>
              <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
                {jobConfig?.name} Details
              </h1>
              <p className="text-sm text-default-500 dark:text-gray-400">
                {format(new Date(workLog.log_date), "EEEE, dd MMM yyyy")}
              </p>
            </div>

            {/* Separator */}
            <div className="h-10 w-px bg-default-200 dark:bg-gray-700 hidden sm:block"></div>

            {/* Inline Stats */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5">
                <IconCalendarEvent size={16} className="text-sky-600 dark:text-sky-400" />
                <span
                  className={`font-medium ${getDayTypeColor(workLog.day_type, workLog.log_date)}`}
                >
                  {getDisplayDayType(workLog.day_type, workLog.log_date)}
                  {getDisplayDayType(workLog.day_type, workLog.log_date) !==
                    "Sabtu" && " Rate"}
                </span>
              </div>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <div className="flex items-center gap-1.5">
                {workLog.shift === 1 ? (
                  <IconSun size={16} className="text-amber-500 dark:text-amber-400" />
                ) : (
                  <IconMoon size={16} className="text-indigo-500 dark:text-indigo-400" />
                )}
                <span className="font-medium text-default-700 dark:text-gray-200">
                  {workLog.shift === 1 ? "Day" : "Night"}
                </span>
              </div>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  workLog.status === "Processed"
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    : "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                }`}
              >
                {workLog.status === "Processed" && (
                  <IconLock size={12} className="mr-1" />
                )}
                {workLog.status}
              </span>

              {/* Production Details / Context Data - Inline */}
              {hasContextData && (
                <>
                  <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
                  {jobConfig?.contextFields.map((field, index) => {
                    const value = getContextFieldValue(field.id);
                    if (value === null) return null;

                    return (
                      <React.Fragment key={field.id}>
                        {index > 0 &&
                          getContextFieldValue(
                            jobConfig.contextFields[index - 1]?.id
                          ) !== null && (
                            <span className="text-default-300 dark:text-gray-600">•</span>
                          )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-default-500 dark:text-gray-400">{field.label}:</span>
                          <span className="font-medium text-default-700 dark:text-gray-200">
                            {value}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Right: Edit Button */}
          {workLog.status !== "Processed" && (
            <Button
              onClick={handleEdit}
              icon={IconPencil}
              variant="filled"
              color="sky"
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Employee Details */}
      {workLog.employeeEntries && workLog.employeeEntries.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden">
          {/* Section Header - Sky */}
          <div className="px-4 py-2.5 bg-sky-50 dark:bg-sky-900/20 border-b border-sky-100 dark:border-sky-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-2">
                <IconUsers size={16} className="text-sky-600 dark:text-sky-400" />
                Employee Details
              </h3>
              <div className="flex items-center gap-3 text-xs text-sky-700 dark:text-sky-400">
                <span className="font-medium">{totalEmployees} employees</span>
                {jobType !== "SALESMAN" && (
                  <>
                    <span className="text-sky-300 dark:text-sky-600">•</span>
                    <span className="font-medium">
                      {totalHours.toFixed(1)} hours
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="max-h-[calc(100vh-230px)] overflow-y-auto">
            <table className="min-w-full">
              <thead className="bg-default-50 dark:bg-gray-900/50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                    Employee
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-24">
                    {jobType === "SALESMAN" ? "Location" : "Hours"}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                    Activities
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-28">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                {workLog.employeeEntries
                  .sort((a: EmployeeEntry, b: EmployeeEntry) => {
                    const jobCompare = (a.job_name || "").localeCompare(
                      b.job_name || ""
                    );
                    if (jobCompare !== 0) return jobCompare;
                    return (a.employee_name || "").localeCompare(
                      b.employee_name || ""
                    );
                  })
                  .map((entry: EmployeeEntry) => {
                    const employeeTotal = entry.activities.reduce(
                      (sum: number, activity: any) =>
                        sum + activity.calculated_amount,
                      0
                    );

                    const { contextLinked, regular } = separateActivities(
                      entry.activities
                    );

                    const totalActivities = contextLinked.length + regular.length;
                    const needsExpansion = totalActivities > 10;
                    const isExpanded =
                      expandedEntries[String(entry.id)] || false;

                    const displayContextLinked = isExpanded
                      ? contextLinked
                      : needsExpansion && contextLinked.length > 0
                      ? contextLinked.slice(
                          0,
                          Math.min(contextLinked.length, 10)
                        )
                      : contextLinked;

                    const displayRegular = isExpanded
                      ? regular
                      : needsExpansion && displayContextLinked.length < 10
                      ? regular.slice(
                          0,
                          Math.min(
                            regular.length,
                            10 - displayContextLinked.length
                          )
                        )
                      : needsExpansion
                      ? []
                      : regular;

                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-default-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/catalogue/staff/${entry.employee_id}`}
                            className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 font-medium"
                          >
                            {entry.employee_name}
                          </Link>
                          <p className="text-sm text-default-500 dark:text-gray-400">
                            {entry.employee_id} • {entry.job_name}
                          </p>
                          {entry.job_id === "SALESMAN_IKUT" && (
                            <div className="text-xs text-default-500 dark:text-gray-400 mt-1.5 space-y-1 pl-1 border-l-2 border-default-200 dark:border-gray-700">
                              <p>
                                <span className="text-default-400 dark:text-gray-500">
                                  Following:
                                </span>{" "}
                                <span className="font-medium text-default-600 dark:text-gray-300">
                                  {entry.following_salesman_name || "N/A"}
                                </span>
                              </p>
                              <p>
                                <span className="text-default-400 dark:text-gray-500">
                                  Mee Bags:
                                </span>{" "}
                                <span className="font-medium text-default-600 dark:text-gray-300">
                                  {entry.muat_mee_bags || 0}
                                </span>
                              </p>
                              <p>
                                <span className="text-default-400 dark:text-gray-500">
                                  Bihun Bags:
                                </span>{" "}
                                <span className="font-medium text-default-600 dark:text-gray-300">
                                  {entry.muat_bihun_bags || 0}
                                </span>
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-default-700 dark:text-gray-200">
                          {jobType === "SALESMAN"
                            ? entry.location_type || "Local"
                            : entry.total_hours.toFixed(1)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {displayContextLinked.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-sky-600 dark:text-sky-400 mb-1">
                                  Production Activities
                                </p>
                                <div className="space-y-1">
                                  {displayContextLinked.map((activity: any) => (
                                    <div
                                      key={activity.id}
                                      className="flex justify-between text-sm"
                                    >
                                      <div className="text-default-700 dark:text-gray-200">
                                        <span className="font-medium">
                                          {activity.description}
                                        </span>
                                        <span className="text-default-500 dark:text-gray-400 ml-2">
                                          ({activity.pay_type})
                                        </span>
                                        <span className="text-default-500 dark:text-gray-400 ml-2">
                                          •{" "}
                                          {activity.rate_unit === "Percent"
                                            ? `${activity.rate_used}%`
                                            : `RM${activity.rate_used}`}
                                        </span>
                                        {activity.units_produced !== null &&
                                          activity.rate_unit !== "Day" &&
                                          activity.rate_unit !== "Fixed" && (
                                            <span className="text-default-500 dark:text-gray-400 ml-2">
                                              • {activity.units_produced}{" "}
                                              {activity.rate_unit === "Percent"
                                                ? "Units"
                                                : activity.rate_unit}
                                            </span>
                                          )}
                                      </div>
                                      <div className="font-medium text-default-700 dark:text-gray-200">
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
                                  <p className="text-xs font-medium text-default-600 dark:text-gray-300 mb-1">
                                    Standard Activities
                                  </p>
                                )}
                                <div className="space-y-1">
                                  {displayRegular.map((activity: any) => (
                                    <div
                                      key={activity.id}
                                      className="flex justify-between text-sm"
                                    >
                                      <div className="text-default-700 dark:text-gray-200">
                                        <span className="font-medium">
                                          {activity.description}
                                        </span>
                                        <span className="text-default-500 dark:text-gray-400 ml-2">
                                          ({activity.pay_type})
                                        </span>
                                        {activity.source === "employee" && (
                                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                                            Staff
                                          </span>
                                        )}
                                        {activity.source === "job" && (
                                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                            Job
                                          </span>
                                        )}
                                        <span className="text-default-500 dark:text-gray-400 ml-2">
                                          •{" "}
                                          {activity.rate_unit === "Percent"
                                            ? `${activity.rate_used}%`
                                            : `RM${activity.rate_used}`}
                                        </span>
                                        {activity.units_produced !== null &&
                                          activity.rate_unit !== "Hour" &&
                                          activity.rate_unit !== "Bill" && (
                                            <span className="text-default-500 dark:text-gray-400 ml-2">
                                              • {activity.units_produced}{" "}
                                              {activity.rate_unit === "Percent"
                                                ? "Units"
                                                : activity.rate_unit}
                                            </span>
                                          )}
                                      </div>
                                      <div className="font-medium text-default-700 dark:text-gray-200">
                                        RM{activity.calculated_amount.toFixed(2)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {needsExpansion && (
                              <button
                                onClick={() =>
                                  toggleExpansion(String(entry.id))
                                }
                                className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 flex items-center"
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
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-default-700 dark:text-gray-200">
                          RM{employeeTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot className="bg-sky-50 dark:bg-sky-900/20 border-t-2 border-sky-200 dark:border-sky-800">
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-3 text-right font-semibold text-sky-800 dark:text-sky-300"
                  >
                    Total Employee Pay
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-sky-900 dark:text-sky-200">
                    {formatCurrency(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Leave Records Section */}
      {workLog.leaveRecords && workLog.leaveRecords.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden">
          {/* Section Header - Rose */}
          <div className="px-4 py-2.5 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-100 dark:border-rose-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <IconBeach size={16} className="text-rose-600 dark:text-rose-400" />
                Leave Records
              </h3>
              <span className="text-xs font-medium text-rose-700 dark:text-rose-400">
                {workLog.leaveRecords.length} employee(s) on leave
              </span>
            </div>
          </div>

          <table className="min-w-full">
            <thead className="bg-default-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                  Employee
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-32">
                  Leave Type
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-20">
                  Days
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-28">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-100 dark:divide-gray-700">
              {workLog.leaveRecords.map((record) => {
                const getLeaveTypeDisplay = (leaveType: string) => {
                  switch (leaveType) {
                    case "cuti_umum":
                      return "Cuti Umum";
                    case "cuti_sakit":
                      return "Cuti Sakit";
                    case "cuti_tahunan":
                      return "Cuti Tahunan";
                    default:
                      return leaveType;
                  }
                };

                const getLeaveTypeColor = (leaveType: string) => {
                  switch (leaveType) {
                    case "cuti_umum":
                      return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
                    case "cuti_sakit":
                      return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
                    case "cuti_tahunan":
                      return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
                    default:
                      return "bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200";
                  }
                };

                return (
                  <tr
                    key={record.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/catalogue/staff/${record.employee_id}`}
                        className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 font-medium"
                      >
                        {record.employee_name}
                      </Link>
                      <p className="text-sm text-default-500 dark:text-gray-400">
                        {record.employee_id}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getLeaveTypeColor(
                          record.leave_type
                        )}`}
                      >
                        {getLeaveTypeDisplay(record.leave_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-default-700 dark:text-gray-200">
                      {Math.round(record.days_taken)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-default-700 dark:text-gray-200">
                      {formatCurrency(record.amount_paid)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-rose-50 dark:bg-rose-900/20 border-t-2 border-rose-200 dark:border-rose-800">
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right font-semibold text-rose-800 dark:text-rose-300"
                >
                  Total Leave Pay
                </td>
                <td className="px-4 py-3 text-right font-bold text-rose-900 dark:text-rose-200">
                  {formatCurrency(totalLeaveAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default DailyLogDetailsPage;

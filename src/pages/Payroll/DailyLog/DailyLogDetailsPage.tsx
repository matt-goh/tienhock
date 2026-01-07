// src/pages/Payroll/DailyLogDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  IconPencil,
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

// Pay codes that are doubled when is_doubled is true for SALESMAN_IKUT
const DOUBLED_PAY_CODES = [
  "4-COMM_MUAT_MEE",
  "5-COMM_MUAT_BH",
  "BILL",
  "ELAUN_MT",
  "ELAUN_MO",
  "IKUT",
];

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
  is_doubled?: boolean;
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
        <p className="text-default-500 dark:text-gray-400">
          Work log not found
        </p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back to List
        </Button>
      </div>
    );
  }

  const totalEmployees = workLog.employeeEntries.length;
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
                <IconCalendarEvent
                  size={16}
                  className="text-sky-600 dark:text-sky-400"
                />
                <span
                  className={`font-medium ${getDayTypeColor(
                    workLog.day_type,
                    workLog.log_date
                  )}`}
                >
                  {getDisplayDayType(workLog.day_type, workLog.log_date)}
                  {getDisplayDayType(workLog.day_type, workLog.log_date) !==
                    "Sabtu" && " Rate"}
                </span>
              </div>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <div className="flex items-center gap-1.5">
                {workLog.shift === 1 ? (
                  <IconSun
                    size={16}
                    className="text-amber-500 dark:text-amber-400"
                  />
                ) : (
                  <IconMoon
                    size={16}
                    className="text-indigo-500 dark:text-indigo-400"
                  />
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
                            <span className="text-default-300 dark:text-gray-600">
                              •
                            </span>
                          )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-default-500 dark:text-gray-400">
                            {field.label}:
                          </span>
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
        <div className="space-y-3">
          {/* Employee Cards */}
          <div className="grid gap-3 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
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

                const allActivities = [...contextLinked, ...regular];
                const totalActivitiesCount = allActivities.length;
                const needsExpansion = totalActivitiesCount > 6;
                const isExpanded =
                  expandedEntries[String(entry.id)] || false;

                const displayActivities = isExpanded
                  ? allActivities
                  : allActivities.slice(0, 6);

                return (
                  <div
                    key={entry.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden hover:border-sky-300 dark:hover:border-sky-600 transition-colors"
                  >
                    {/* Card Header */}
                    <div className="px-4 py-3 bg-sky-50/50 dark:bg-sky-900/10 border-b border-default-100 dark:border-gray-700">
                      <div className="flex items-start justify-between">
                        <div>
                          <Link
                            to={`/catalogue/staff/${entry.employee_id}`}
                            className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 font-semibold text-base"
                          >
                            {entry.employee_name}
                          </Link>
                          <p className="text-sm text-default-500 dark:text-gray-400">
                            {entry.employee_id} • {entry.job_name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {jobType !== "SALESMAN" && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-default-100 dark:bg-gray-700 text-xs font-medium text-default-600 dark:text-gray-300">
                              <IconClock size={12} />
                              {entry.total_hours.toFixed(1)}h
                            </span>
                          )}
                          {jobType === "SALESMAN" && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-default-100 dark:bg-gray-700 text-xs font-medium text-default-600 dark:text-gray-300">
                              {entry.location_type || "Local"}
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-sky-100 dark:bg-sky-900/30 text-xs font-semibold text-sky-700 dark:text-sky-300">
                            {formatCurrency(employeeTotal)}
                          </span>
                        </div>
                      </div>

                      {/* SALESMAN_IKUT Metadata */}
                      {entry.job_id === "SALESMAN_IKUT" && (
                        <div className="mt-2 pt-2 border-t border-default-200 dark:border-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="text-default-500 dark:text-gray-400">
                            Following:{" "}
                            <span className="font-medium text-default-700 dark:text-gray-200">
                              {entry.following_salesman_name || "N/A"}
                            </span>
                          </span>
                          <span className="text-default-500 dark:text-gray-400">
                            Mee Bags:{" "}
                            <span className="font-medium text-default-700 dark:text-gray-200">
                              {entry.muat_mee_bags || 0}
                            </span>
                          </span>
                          <span className="text-default-500 dark:text-gray-400">
                            Bihun Bags:{" "}
                            <span className="font-medium text-default-700 dark:text-gray-200">
                              {entry.muat_bihun_bags || 0}
                            </span>
                          </span>
                          {entry.is_doubled && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold">
                              x2
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Activities Mini-Table */}
                    <div className="px-4 py-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-default-500 dark:text-gray-400 uppercase tracking-wider">
                            <th className="text-left py-1.5 font-medium">
                              Activity
                            </th>
                            <th className="text-right py-1.5 font-medium w-20">
                              Rate
                            </th>
                            <th className="text-right py-1.5 font-medium w-24">
                              Qty
                            </th>
                            <th className="text-right py-1.5 font-medium w-24">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default-50 dark:divide-gray-700/50">
                          {displayActivities.map((activity: any) => {
                            const isContextLinkedActivity = contextLinked.some(
                              (a) => a.id === activity.id
                            );
                            return (
                              <tr
                                key={activity.id}
                                className="hover:bg-default-50/50 dark:hover:bg-gray-700/30"
                              >
                                <td className="py-1.5 pr-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-medium text-default-700 dark:text-gray-200">
                                      {activity.description}
                                    </span>
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-default-100 dark:bg-gray-700 text-default-500 dark:text-gray-400">
                                      {activity.pay_type}
                                    </span>
                                    {activity.source === "employee" && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                                        Staff
                                      </span>
                                    )}
                                    {activity.source === "job" && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                        Job
                                      </span>
                                    )}
                                    {isContextLinkedActivity && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                                        Prod
                                      </span>
                                    )}
                                    {entry.is_doubled &&
                                      DOUBLED_PAY_CODES.includes(
                                        activity.pay_code_id
                                      ) && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-semibold">
                                          x2
                                        </span>
                                      )}
                                  </div>
                                </td>
                                <td className="py-1.5 text-right text-default-600 dark:text-gray-300">
                                  {activity.rate_unit === "Percent"
                                    ? `${activity.rate_used}%`
                                    : activity.rate_unit === "Fixed"
                                    ? "-"
                                    : `RM${activity.rate_used}`}
                                </td>
                                <td className="py-1.5 text-right text-default-600 dark:text-gray-300">
                                  {activity.rate_unit === "Fixed"
                                    ? "Fixed"
                                    : activity.rate_unit === "Day" &&
                                      activity.units_produced !== null &&
                                      activity.units_produced > 0
                                    ? `${activity.units_produced} Day`
                                    : activity.rate_unit === "Hour" &&
                                      activity.hours_applied !== null &&
                                      activity.hours_applied > 0
                                    ? `${activity.hours_applied} Hour`
                                    : activity.units_produced !== null &&
                                      activity.rate_unit !== "Bill"
                                    ? `${activity.units_produced} ${
                                        activity.rate_unit === "Percent"
                                          ? ""
                                          : activity.rate_unit
                                      }`
                                    : "-"}
                                </td>
                                <td className="py-1.5 text-right font-medium text-default-700 dark:text-gray-200">
                                  RM{activity.calculated_amount.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Show More Button */}
                      {needsExpansion && (
                        <button
                          onClick={() => toggleExpansion(String(entry.id))}
                          className="mt-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                        >
                          {isExpanded
                            ? "Show Less"
                            : `Show ${
                                totalActivitiesCount - 6
                              } more activities...`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Grand Total Footer */}
          <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800 px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-sky-800 dark:text-sky-300">
              Total Employee Pay
            </span>
            <div className="flex items-center gap-2 font-bold text-sky-900 dark:text-sky-200">
              <span>{totalEmployees} employees</span>
              <span className="text-sky-400 dark:text-sky-600">•</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
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
                <IconBeach
                  size={16}
                  className="text-rose-600 dark:text-rose-400"
                />
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

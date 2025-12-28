// src/pages/Payroll/DailyLogDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  IconPencil,
  IconCalendar,
  IconClock,
  IconInfoCircle,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import BackButton from "../../components/BackButton";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getJobConfig } from "../../configs/payrollJobConfigs";

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
  activities: any[]; // Kept as any to avoid deep typing complex structure for now
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

  const toggleExpansion = (entryId: string) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [entryId]: !prev[entryId],
    }));
  };

  // Separate context-linked activities from regular activities
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
        <p className="text-default-500">Work log not found</p>
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

  return (
    <div className="relative w-full mx-4 md:mx-6">
      <BackButton onClick={handleBack} />

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-semibold text-default-800">
              {jobConfig?.name} Details
            </h1>
            <p className="text-sm text-default-500 mt-1">
              {format(new Date(workLog.log_date), "EEEE, dd MMM yyyy")}
            </p>
            <div className="mt-1">
              <span className="text-sm text-default-500">Section: </span>
              <span className="text-sm font-medium text-default-700">
                {workLog.section}
              </span>
            </div>
          </div>
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

        {/* Overview Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
                <IconCalendar className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="text-sm text-default-500">Date & Type</p>
                <p
                  className={`font-medium ${getDayTypeColor(workLog.day_type, workLog.log_date)}`}
                >
                  {getDisplayDayType(workLog.day_type, workLog.log_date)}
                  {getDisplayDayType(workLog.day_type, workLog.log_date) !== "Sabtu" && " Rate"}
                </p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <IconClock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-default-500">Shift</p>
                <p className="font-medium text-default-800">
                  {workLog.shift === 1 ? "Day Shift" : "Night Shift"}
                </p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <IconInfoCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-default-500">Status</p>
                <p className="font-medium text-default-800">{workLog.status}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Production Details / Context Data */}
        {workLog.context_data &&
          Object.keys(workLog.context_data).length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-default-800 mb-4">
                Production Details
              </h2>
              <div className="border rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {jobConfig?.contextFields.map((field) => {
                    const value = workLog.context_data[field.id];
                    if (value === undefined) return null;

                    return (
                      <div key={field.id}>
                        <p className="text-sm text-default-500">
                          {field.label}
                        </p>
                        <p className="font-medium text-default-800">
                          {field.type === "select"
                            ? field.options?.find((opt) => opt.id === value)
                                ?.label || value
                            : String(value)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        {/* Employee Details - Only show if there are employee entries */}
        {workLog.employeeEntries && workLog.employeeEntries.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-default-800">
                Employee Details
              </h2>
              <div className="text-sm text-default-500">
                {totalEmployees} employees
                {jobType !== "SALESMAN"
                  ? ` • ${totalHours.toFixed(1)} total hours`
                  : ""}
              </div>
            </div>

            <div className="overflow-x-auto border border-default-200 rounded-lg">
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Employee
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                      {jobType === "SALESMAN" ? "Location" : "Hours"}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Activities
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-200">
                  {workLog.employeeEntries
                    .sort((a: EmployeeEntry, b: EmployeeEntry) => {
                      // Sort by job name first, then by employee name
                      const jobCompare = (a.job_name || "").localeCompare(
                        b.job_name || ""
                      );
                      if (jobCompare !== 0) return jobCompare;
                      return (a.employee_name || "").localeCompare(
                        b.employee_name || ""
                      );
                    })
                    .map((entry: EmployeeEntry) => {
                      // ... rest of the existing mapping code remains the same
                      const employeeTotal = entry.activities.reduce(
                        (sum: number, activity: any) =>
                          sum + activity.calculated_amount,
                        0
                      );

                      const { contextLinked, regular } = separateActivities(
                        entry.activities
                      );

                      // Calculate total activities count
                      const totalActivities =
                        contextLinked.length + regular.length;
                      // Determine if we need to show the expand/collapse button
                      const needsExpansion = totalActivities > 10;
                      // Check if this entry is expanded
                      const isExpanded =
                        expandedEntries[String(entry.id)] || false;

                      // Prepare activities to display based on expansion state
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
                        <tr key={entry.id}>
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
                            {entry.job_id === "SALESMAN_IKUT" && (
                              <div className="text-xs text-default-500 mt-1.5 space-y-1 pl-1 border-l-2 border-default-200">
                                <p>
                                  <span className="text-default-400">
                                    Following:
                                  </span>{" "}
                                  <span className="font-medium text-default-600">
                                    {entry.following_salesman_name || "N/A"}
                                  </span>
                                </p>
                                <p>
                                  <span className="text-default-400">
                                    Mee Bags:
                                  </span>{" "}
                                  <span className="font-medium text-default-600">
                                    {entry.muat_mee_bags || 0}
                                  </span>
                                </p>
                                <p>
                                  <span className="text-default-400">
                                    Bihun Bags:
                                  </span>{" "}
                                  <span className="font-medium text-default-600">
                                    {entry.muat_bihun_bags || 0}
                                  </span>
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {jobType === "SALESMAN"
                              ? entry.location_type || "Local"
                              : entry.total_hours.toFixed(1)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {/* Context-linked activities */}
                              {displayContextLinked.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-sky-600 mb-1">
                                    Production Activities
                                  </p>
                                  <div className="space-y-2">
                                    {displayContextLinked.map(
                                      (activity: any) => (
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
                                            {/* Display rate used for all activity types */}
                                            <span className="text-default-500 ml-2">
                                              •{" "}
                                              {activity.rate_unit === "Percent"
                                                ? `${activity.rate_used}%`
                                                : `RM${activity.rate_used}`}
                                            </span>
                                            {/* Show units produced for non-Hour units or when explicitly available */}
                                            {activity.units_produced !== null &&
                                              activity.rate_unit !== "Day" &&
                                              activity.rate_unit !==
                                                "Fixed" && (
                                                <span className="text-default-500 ml-2">
                                                  • {activity.units_produced}{" "}
                                                  {activity.rate_unit ===
                                                  "Percent"
                                                    ? "Units"
                                                    : activity.rate_unit}
                                                </span>
                                              )}
                                          </div>
                                          <div className="font-medium">
                                            RM
                                            {activity.calculated_amount.toFixed(
                                              2
                                            )}
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Regular activities */}
                              {displayRegular.length > 0 && (
                                <div>
                                  {displayContextLinked.length > 0 && (
                                    <p className="text-xs font-medium text-default-600 mb-1">
                                      Standard Activities
                                    </p>
                                  )}
                                  <div className="space-y-1">
                                    {displayRegular.map((activity: any) => (
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
                                          {/* Display rate used for all activity types */}
                                          <span className="text-default-500 ml-2">
                                            •{" "}
                                            {activity.rate_unit === "Percent"
                                              ? `${activity.rate_used}%`
                                              : `RM${activity.rate_used}`}
                                          </span>
                                          {/* Show units produced for non-Hour units or when explicitly available */}
                                          {activity.units_produced !== null &&
                                            activity.rate_unit !== "Hour" && (
                                              <span className="text-default-500 ml-2">
                                                • {activity.units_produced}{" "}
                                                {activity.rate_unit ===
                                                "Percent"
                                                  ? "Units"
                                                  : activity.rate_unit}
                                              </span>
                                            )}
                                        </div>
                                        <div className="font-medium">
                                          RM
                                          {activity.calculated_amount.toFixed(
                                            2
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Show more/less button when needed */}
                              {needsExpansion && (
                                <button
                                  onClick={() =>
                                    toggleExpansion(String(entry.id))
                                  }
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
                      RM{totalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Leave Records Section */}
        {workLog.leaveRecords && workLog.leaveRecords.length > 0 && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-default-800">
                Leave Records
              </h2>
              <div className="text-sm text-default-500">
                {workLog.leaveRecords.length} employee(s) on leave
              </div>
            </div>

            <div className="overflow-x-auto border border-default-200 rounded-lg">
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Employee
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                      Leave Type
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                      Days
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                      Amount Paid
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-200">
                  {workLog.leaveRecords.map((record) => {
                    const formatCurrency = (amount: number) => {
                      return new Intl.NumberFormat("en-MY", {
                        style: "currency",
                        currency: "MYR",
                      }).format(amount);
                    };

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
                          return "bg-red-100 text-red-700";
                        case "cuti_sakit":
                          return "bg-amber-100 text-amber-700";
                        case "cuti_tahunan":
                          return "bg-green-100 text-green-700";
                        default:
                          return "bg-default-100 text-default-700";
                      }
                    };

                    return (
                      <tr key={record.id} className="hover:bg-default-50">
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
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLeaveTypeColor(
                              record.leave_type
                            )}`}
                          >
                            {getLeaveTypeDisplay(record.leave_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-medium text-default-900">
                            {Math.round(record.days_taken)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-medium text-default-900">
                            {formatCurrency(record.amount_paid)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-default-50 border-t-2 border-default-200">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-right text-sm font-medium text-default-600"
                    >
                      Total Leave Pay
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-default-900">
                      {new Intl.NumberFormat("en-MY", {
                        style: "currency",
                        currency: "MYR",
                      }).format(
                        workLog.leaveRecords.reduce(
                          (sum, record) => sum + record.amount_paid,
                          0
                        )
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyLogDetailsPage;

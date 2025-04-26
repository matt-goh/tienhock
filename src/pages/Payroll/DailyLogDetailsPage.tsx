// src/pages/Payroll/ProductionDetailsPage.tsx
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

const DailyLogDetailsPage: React.FC<DailyLogDetailsPageProps> = ({
  jobType,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workLog, setWorkLog] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const jobConfig = getJobConfig(jobType);

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
    (sum: number, entry: any) => sum + entry.total_hours,
    0
  );
  const totalAmount = workLog.employeeEntries.reduce(
    (sum: number, entry: any) =>
      sum +
      entry.activities.reduce(
        (actSum: number, activity: any) => actSum + activity.calculated_amount,
        0
      ),
    0
  );

  return (
    <div className="relative w-full mx-4 md:mx-6 -mt-8">
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
                  className={`font-medium ${getDayTypeColor(workLog.day_type)}`}
                >
                  {workLog.day_type} Rate
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

        {/* Employee Details */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-default-800">
              Employee Details
            </h2>
            <div className="text-sm text-default-500">
              {totalEmployees} employees • {totalHours.toFixed(1)} total hours
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
                    Hours
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
                {workLog.employeeEntries.map((entry: any) => {
                  const employeeTotal = entry.activities.reduce(
                    (sum: number, activity: any) =>
                      sum + activity.calculated_amount,
                    0
                  );

                  const { contextLinked, regular } = separateActivities(
                    entry.activities
                  );

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
                      </td>
                      <td className="px-4 py-3 text-center">
                        {entry.total_hours.toFixed(1)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-4">
                          {/* Context-linked activities */}
                          {contextLinked.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-sky-600 mb-1">
                                Production Activities
                              </p>
                              <div className="space-y-1">
                                {contextLinked.map((activity: any) => (
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
                                      {activity.units_produced && (
                                        <span className="text-default-500 ml-2">
                                          • {activity.units_produced}{" "}
                                          {activity.rate_unit}
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-medium">
                                      RM{activity.calculated_amount.toFixed(2)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Regular activities */}
                          {regular.length > 0 && (
                            <div>
                              {contextLinked.length > 0 && (
                                <p className="text-xs font-medium text-default-600 mb-1">
                                  Standard Activities
                                </p>
                              )}
                              <div className="space-y-1">
                                {regular.map((activity: any) => (
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
                                      {activity.units_produced && (
                                        <span className="text-default-500 ml-2">
                                          • {activity.units_produced}{" "}
                                          {activity.rate_unit}
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-medium">
                                      RM{activity.calculated_amount.toFixed(2)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
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
      </div>
    </div>
  );
};

export default DailyLogDetailsPage;

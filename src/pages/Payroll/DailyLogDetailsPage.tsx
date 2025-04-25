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

interface WorkLogDetails {
  id: number;
  log_date: string;
  shift: number;
  section: string;
  day_type: "Biasa" | "Ahad" | "Umum";
  status: "Submitted" | "Processed";
  context_data: any;
  employeeEntries: EmployeeEntry[];
}

interface EmployeeEntry {
  id: number;
  employee_id: string;
  employee_name: string;
  job_id: string;
  job_name: string;
  total_hours: number;
  activities: Activity[];
}

interface Activity {
  id: number;
  pay_code_id: string;
  description: string;
  pay_type: string;
  rate_unit: string;
  hours_applied: number | null;
  units_produced: number | null;
  rate_used: number;
  calculated_amount: number;
}

const DailyLogDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workLog, setWorkLog] = useState<WorkLogDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    navigate("/payroll/mee-production");
  };

  const handleEdit = () => {
    navigate(`/payroll/mee-production/${id}/edit`);
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
    (sum, entry) => sum + entry.total_hours,
    0
  );
  const totalAmount = workLog.employeeEntries.reduce(
    (sum, entry) =>
      sum +
      entry.activities.reduce(
        (actSum, activity) => actSum + activity.calculated_amount,
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
              Work Log Details
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
          <div className="bg-default-50 rounded-lg p-4">
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

          <div className="bg-default-50 rounded-lg p-4">
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

          <div className="bg-default-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <IconInfoCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-default-500">Status</p>
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
        </div>

        {/* Context Data */}
        {workLog.context_data &&
          Object.keys(workLog.context_data).length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-default-800 mb-4">
                Production Details
              </h2>
              <div className="bg-default-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(workLog.context_data).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-sm text-default-500 capitalize">
                        {key.replace(/_/g, " ")}
                      </p>
                      <p className="font-medium text-default-800">
                        {String(value)}
                      </p>
                    </div>
                  ))}
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
                {workLog.employeeEntries.map((entry) => {
                  const employeeTotal = entry.activities.reduce(
                    (sum, activity) => sum + activity.calculated_amount,
                    0
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
                        <div className="space-y-2">
                          {entry.activities.map((activity) => (
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

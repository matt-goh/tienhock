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
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                  Job
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase">
                  Regular Hours
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase">
                  Overtime Hours
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase">
                  Total Hours
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200">
              {workLog.employeeEntries.map((entry) => (
                <tr key={entry.id} className="bg-white hover:bg-default-50">
                  <td className="px-4 py-3 text-sm text-default-700">
                    <Link
                      to={`/catalogue/staff/${entry.employee_id}`}
                      className="hover:underline hover:text-sky-600"
                    >
                      {entry.employee_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-default-900">
                    {entry.employee_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-default-600">
                    {entry.job_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-default-700">
                    {entry.total_hours.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-default-700">
                    {entry.overtime_hours.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-sm text-center font-medium text-default-800">
                    {(entry.total_hours + entry.overtime_hours).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
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
              {format(new Date(workLog.created_at), "dd MMM yyyy HH:mm")}
            </span>
          </div>
          <div>
            <span className="text-default-500">Last Updated:</span>
            <span className="ml-2 text-default-700">
              {format(new Date(workLog.updated_at), "dd MMM yyyy HH:mm")}
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

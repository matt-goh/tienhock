// src/pages/GreenTarget/Payroll/GTPayrollPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  IconCash,
  IconUsers,
  IconLock,
  IconRefresh,
  IconPlus,
  IconUser,
  IconTruck,
  IconChevronDown,
  IconChevronUp,
  IconSettings,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import MonthNavigator from "../../../components/MonthNavigator";
import PayrollEmployeeManagementModal from "../../../components/GreenTarget/PayrollEmployeeManagementModal";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import { formatDistanceToNow } from "date-fns";

interface GTMonthlyPayroll {
  id: number;
  year: number;
  month: number;
  status: "Processing" | "Finalized";
  created_at: string;
  updated_at: string;
  employeePayrolls: GTEmployeePayroll[];
}

interface GTEmployeePayroll {
  id: number;
  monthly_payroll_id: number;
  employee_id: string;
  job_type: string;
  section: string;
  gross_pay: string;
  net_pay: string;
  employee_name: string;
}

interface GTPayrollEmployee {
  employee_id: string;
  job_type: "OFFICE" | "DRIVER";
  employee_name?: string;
}

const getMonthName = (month: number): string => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return months[month - 1] || "";
};

const GTPayrollPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { allStaffs } = useStaffsCache();

  // Initialize with URL params or current month
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (yearParam && monthParam) {
      const year = parseInt(yearParam);
      const month = parseInt(monthParam);
      if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        return new Date(year, month - 1);
      }
    }
    return new Date();
  });

  const [payroll, setPayroll] = useState<GTMonthlyPayroll | null>(null);
  const [gtEmployees, setGtEmployees] = useState<GTPayrollEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    OFFICE: true,
    DRIVER: true,
  });

  const handleMonthChange = useCallback((newMonth: Date) => {
    setSelectedMonth(newMonth);
    const year = newMonth.getFullYear();
    const month = newMonth.getMonth() + 1;
    setSearchParams({ year: year.toString(), month: month.toString() });
  }, [setSearchParams]);

  // Fetch payroll when month changes
  useEffect(() => {
    fetchPayrollData();
  }, [selectedMonth]);

  const fetchPayrollData = async () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    setIsLoading(true);
    try {
      // Fetch payroll and GT employees in parallel
      const [payrollResponse, employeesResponse] = await Promise.all([
        api.get(`/greentarget/api/monthly-payrolls?year=${year}&month=${month}&include_employee_payrolls=true`),
        api.get("/greentarget/api/payroll-employees"),
      ]);

      setGtEmployees(employeesResponse);

      if (payrollResponse.length > 0) {
        // Get the full payroll details
        const fullPayroll = await api.get(`/greentarget/api/monthly-payrolls/${payrollResponse[0].id}`);
        setPayroll(fullPayroll);
      } else {
        setPayroll(null);
      }
    } catch (error) {
      console.error("Error fetching GT payroll:", error);
      toast.error("Failed to load payroll data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePayroll = async () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    setIsCreating(true);
    try {
      await api.post("/greentarget/api/monthly-payrolls", { year, month });
      toast.success(`Created payroll for ${getMonthName(month)} ${year}`);
      await fetchPayrollData();
    } catch (error: unknown) {
      console.error("Error creating payroll:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create payroll";
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleProcessPayroll = async () => {
    if (!payroll) return;

    // Build selected employees list from GT employees
    const selected_employees = gtEmployees.map((emp) => ({
      employeeId: emp.employee_id,
      jobType: emp.job_type,
    }));

    if (selected_employees.length === 0) {
      toast.error("No employees in GT payroll. Add employees first.");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await api.post(`/greentarget/api/monthly-payrolls/${payroll.id}/process-all`, {
        selected_employees,
      });

      if (result.success) {
        toast.success(`Processed ${result.processed_count} employee(s)`);
        if (result.errors?.length > 0) {
          toast.error(`${result.errors.length} error(s) occurred during processing`);
        }
        await fetchPayrollData();
      } else {
        toast.error(result.message || "Processing failed");
      }
    } catch (error) {
      console.error("Error processing payroll:", error);
      toast.error("Failed to process payroll");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalizePayroll = async () => {
    if (!payroll) return;

    setIsUpdatingStatus(true);
    try {
      await api.put(`/greentarget/api/monthly-payrolls/${payroll.id}/status`, {
        status: "Finalized",
      });
      toast.success("Payroll finalized");
      await fetchPayrollData();
    } catch (error) {
      console.error("Error finalizing payroll:", error);
      toast.error("Failed to finalize payroll");
    } finally {
      setIsUpdatingStatus(false);
      setShowFinalizeDialog(false);
    }
  };

  const handleUnlockPayroll = async () => {
    if (!payroll) return;

    setIsUpdatingStatus(true);
    try {
      await api.put(`/greentarget/api/monthly-payrolls/${payroll.id}/status`, {
        status: "Processing",
      });
      toast.success("Payroll unlocked for editing");
      await fetchPayrollData();
    } catch (error) {
      console.error("Error unlocking payroll:", error);
      toast.error("Failed to unlock payroll");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Group employee payrolls by job type
  const officePayrolls = payroll?.employeePayrolls?.filter((ep) => ep.job_type === "OFFICE") || [];
  const driverPayrolls = payroll?.employeePayrolls?.filter((ep) => ep.job_type === "DRIVER") || [];

  // Calculate totals
  const totalGross = payroll?.employeePayrolls?.reduce(
    (sum, ep) => sum + parseFloat(ep.gross_pay || "0"), 0
  ) || 0;
  const totalNet = payroll?.employeePayrolls?.reduce(
    (sum, ep) => sum + parseFloat(ep.net_pay || "0"), 0
  ) || 0;

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="px-6 pb-6 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-default-800 dark:text-gray-100">
            GT Payroll
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400">
            Green Target Monthly Payroll
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => setShowManageModal(true)}
          icon={IconSettings}
          iconSize={18}
        >
          Manage Employees
        </Button>
      </div>

      {/* Month Navigator */}
      <MonthNavigator
        selectedMonth={selectedMonth}
        onChange={handleMonthChange}
      />

      {/* No Payroll State */}
      {!payroll && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <IconCash size={48} className="mx-auto text-default-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-default-800 dark:text-gray-200 mb-2">
            No Payroll for {getMonthName(month)} {year}
          </h3>
          <p className="text-default-500 dark:text-gray-400 mb-4">
            Create a payroll to start processing employee salaries.
          </p>
          <Button
            color="emerald"
            variant="filled"
            onClick={handleCreatePayroll}
            disabled={isCreating || gtEmployees.length === 0}
            icon={isCreating ? undefined : IconPlus}
            iconSize={18}
          >
            {isCreating ? "Creating..." : "Create Payroll"}
          </Button>
          {gtEmployees.length === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
              Add employees to GT payroll first using "Manage Employees"
            </p>
          )}
        </div>
      )}

      {/* Payroll Exists */}
      {payroll && (
        <>
          {/* Status Bar */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    payroll.status === "Finalized"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}
                >
                  {payroll.status}
                </span>
                <span className="text-sm text-default-500 dark:text-gray-400">
                  Updated {formatDistanceToNow(new Date(payroll.updated_at), { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {payroll.status === "Processing" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleProcessPayroll}
                      disabled={isProcessing}
                      icon={isProcessing ? undefined : IconRefresh}
                      iconSize={18}
                    >
                      {isProcessing ? "Processing..." : "Process All"}
                    </Button>
                    <Button
                      color="emerald"
                      variant="filled"
                      onClick={() => setShowFinalizeDialog(true)}
                      disabled={!payroll.employeePayrolls?.length}
                      icon={IconLock}
                      iconSize={18}
                    >
                      Finalize
                    </Button>
                  </>
                )}
                {payroll.status === "Finalized" && (
                  <Button
                    variant="outline"
                    onClick={handleUnlockPayroll}
                    disabled={isUpdatingStatus}
                    icon={IconLock}
                    iconSize={18}
                  >
                    {isUpdatingStatus ? "Unlocking..." : "Unlock"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                  <IconUsers size={20} className="text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="text-sm text-default-500 dark:text-gray-400">Employees</p>
                  <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                    {payroll.employeePayrolls?.length || 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <IconCash size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-default-500 dark:text-gray-400">Total Gross</p>
                  <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                    RM {totalGross.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <IconCash size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-default-500 dark:text-gray-400">Total Net</p>
                  <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                    RM {totalNet.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Sections */}
          <div className="space-y-3">
            {/* OFFICE Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <button
                onClick={() => toggleSection("OFFICE")}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-default-50 dark:hover:bg-gray-700 rounded-t-lg"
              >
                <div className="flex items-center gap-3">
                  <IconUser size={20} className="text-sky-500" />
                  <span className="font-medium text-default-800 dark:text-gray-200">
                    OFFICE ({officePayrolls.length})
                  </span>
                </div>
                {expandedSections.OFFICE ? (
                  <IconChevronUp size={20} className="text-default-400" />
                ) : (
                  <IconChevronDown size={20} className="text-default-400" />
                )}
              </button>
              {expandedSections.OFFICE && (
                <div className="px-4 pb-4">
                  {officePayrolls.length === 0 ? (
                    <p className="text-sm text-default-400 dark:text-gray-500 py-4 text-center">
                      No OFFICE employees processed yet
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-default-200 dark:border-gray-700">
                          <th className="text-left py-2 text-default-600 dark:text-gray-400 font-medium">Employee</th>
                          <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">Gross Pay</th>
                          <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {officePayrolls.map((ep) => (
                          <tr
                            key={ep.id}
                            className="border-b border-default-100 dark:border-gray-700/50 cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/50"
                            onClick={() => navigate(`/greentarget/payroll/details/${ep.id}`)}
                          >
                            <td className="py-2 text-default-800 dark:text-gray-200">{ep.employee_name}</td>
                            <td className="py-2 text-right text-default-800 dark:text-gray-200">
                              RM {parseFloat(ep.gross_pay).toFixed(2)}
                            </td>
                            <td className="py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                              RM {parseFloat(ep.net_pay).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* DRIVER Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <button
                onClick={() => toggleSection("DRIVER")}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-default-50 dark:hover:bg-gray-700 rounded-t-lg"
              >
                <div className="flex items-center gap-3">
                  <IconTruck size={20} className="text-amber-500" />
                  <span className="font-medium text-default-800 dark:text-gray-200">
                    DRIVER ({driverPayrolls.length})
                  </span>
                </div>
                {expandedSections.DRIVER ? (
                  <IconChevronUp size={20} className="text-default-400" />
                ) : (
                  <IconChevronDown size={20} className="text-default-400" />
                )}
              </button>
              {expandedSections.DRIVER && (
                <div className="px-4 pb-4">
                  {driverPayrolls.length === 0 ? (
                    <p className="text-sm text-default-400 dark:text-gray-500 py-4 text-center">
                      No DRIVER employees processed yet
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-default-200 dark:border-gray-700">
                          <th className="text-left py-2 text-default-600 dark:text-gray-400 font-medium">Employee</th>
                          <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">Gross Pay</th>
                          <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {driverPayrolls.map((ep) => (
                          <tr
                            key={ep.id}
                            className="border-b border-default-100 dark:border-gray-700/50 cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/50"
                            onClick={() => navigate(`/greentarget/payroll/details/${ep.id}`)}
                          >
                            <td className="py-2 text-default-800 dark:text-gray-200">{ep.employee_name}</td>
                            <td className="py-2 text-right text-default-800 dark:text-gray-200">
                              RM {parseFloat(ep.gross_pay).toFixed(2)}
                            </td>
                            <td className="py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                              RM {parseFloat(ep.net_pay).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Manage Employees Modal */}
      <PayrollEmployeeManagementModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        availableEmployees={allStaffs}
        onUpdate={fetchPayrollData}
      />

      {/* Finalize Dialog */}
      <ConfirmationDialog
        isOpen={showFinalizeDialog}
        onClose={() => setShowFinalizeDialog(false)}
        onConfirm={handleFinalizePayroll}
        title="Finalize Payroll"
        message={`Are you sure you want to finalize the payroll for ${getMonthName(month)} ${year}? This will lock the payroll from further edits.`}
        confirmButtonText="Finalize"
        variant="success"
      />
    </div>
  );
};

export default GTPayrollPage;

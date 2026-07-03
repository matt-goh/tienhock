// src/pages/JellyPolly/Payroll/JPPayrollPage.tsx
// Jelly Polly monthly payrolls list. Mirrors the GT payroll page but sections
// are generated from the JP job types and employee management lives on the
// Staff Assignment page. Processing rebuilds every assigned JP employee via
// the per-employee processor (JP data is small).
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  IconCash,
  IconUsers,
  IconRefresh,
  IconPlus,
  IconChevronDown,
  IconChevronUp,
  IconSettings,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MonthNavigator from "../../../components/MonthNavigator";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import {
  PrintBatchPayslipsButton,
  DownloadBatchPayslipsButton,
} from "../../../utils/payroll/PayslipButtons";
import { buildJPPayslipPayroll } from "../../../utils/JellyPolly/buildJPPayslipPayroll";
import { useJPPayrollEmployees } from "../../../utils/JellyPolly/useJPPayrollEmployees";
import { JP_JOB_TYPES } from "../../../configs/jpPayrollJobConfigs";
import { getMonthName } from "../../../utils/payroll/payrollUtils";

interface JPMonthlyPayroll {
  id: number;
  year: number;
  month: number;
  created_at: string;
  updated_at: string;
  employeePayrolls: JPEmployeePayroll[];
}

interface JPEmployeePayroll {
  id: number;
  monthly_payroll_id: number;
  employee_id: string;
  job_type: string;
  section: string;
  gross_pay: number;
  net_pay: number;
  employee_name: string;
  digenapkan?: number;
  setelah_digenapkan?: number | null;
  employee_job_mapping?: string[] | null;
  items?: any[];
  deductions?: any[];
}

const jobTypeLabel = (jobType: string): string =>
  JP_JOB_TYPES.find((j) => j.id === jobType)?.label || jobType;

const JPPayrollPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { employees: jpEmployees } = useJPPayrollEmployees();

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

  const [payroll, setPayroll] = useState<JPMonthlyPayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});

  const handleMonthChange = useCallback(
    (newMonth: Date) => {
      setSelectedMonth(newMonth);
      const year = newMonth.getFullYear();
      const month = newMonth.getMonth() + 1;
      setSearchParams({ year: year.toString(), month: month.toString() });
    },
    [setSearchParams]
  );

  useEffect(() => {
    fetchPayrollData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const fetchPayrollData = async () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    setIsLoading(true);
    try {
      const payrollResponse = await api.get(
        `/jellypolly/api/monthly-payrolls?year=${year}&month=${month}`
      );

      if (payrollResponse.length > 0) {
        const fullPayroll = await api.get(
          `/jellypolly/api/monthly-payrolls/${payrollResponse[0].id}`
        );
        setPayroll(fullPayroll);
      } else {
        setPayroll(null);
      }
    } catch (error) {
      console.error("Error fetching JP payroll:", error);
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
      await api.post("/jellypolly/api/monthly-payrolls", { year, month });
      toast.success(`Created payroll for ${getMonthName(month)} ${year}`);
      await fetchPayrollData();
    } catch (error: unknown) {
      console.error("Error creating payroll:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create payroll";
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleProcessPayroll = async () => {
    if (!payroll) return;

    if (jpEmployees.length === 0) {
      toast.error("No employees assigned to JP payroll. Assign staff first.");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await api.post(
        `/jellypolly/api/monthly-payrolls/${payroll.id}/process-all`,
        {}
      );

      if (result.success) {
        toast.success(`Processed ${result.processed_count} employee(s)`);
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

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: prev[section] === false ? true : false,
    }));
  };

  const isSectionExpanded = (section: string): boolean =>
    expandedSections[section] !== false;

  // Group employee payrolls by job type, ordered by the JP job type list
  const payrollsByJobType: Record<string, JPEmployeePayroll[]> = {};
  for (const ep of payroll?.employeePayrolls || []) {
    const key = ep.job_type || "OTHER";
    if (!payrollsByJobType[key]) payrollsByJobType[key] = [];
    payrollsByJobType[key].push(ep);
  }
  const orderedJobTypes = [
    ...JP_JOB_TYPES.map((j) => j.id).filter((id) => payrollsByJobType[id]),
    ...Object.keys(payrollsByJobType).filter(
      (id) => !JP_JOB_TYPES.some((j) => j.id === id)
    ),
  ];

  // Build payslip-ready payrolls for batch print/download (advances/bonus/OT
  // moved into commission/others so the shared TH generator renders them).
  const batchPayrolls = (payroll?.employeePayrolls || []).map(
    (ep) =>
      buildJPPayslipPayroll({
        ...ep,
        gross_pay: Number(ep.gross_pay),
        net_pay: Number(ep.net_pay),
        year: payroll?.year,
        month: payroll?.month,
      }).pdfPayroll
  );

  const totalGross =
    payroll?.employeePayrolls?.reduce(
      (sum, ep) => sum + (Number(ep.gross_pay) || 0),
      0
    ) || 0;
  const totalNet =
    payroll?.employeePayrolls?.reduce(
      (sum, ep) => sum + (Number(ep.net_pay) || 0),
      0
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
    <div className="space-y-3">
      {/* Compact Header Row */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            showGoToCurrentButton={false}
            size="sm"
          />
          {payroll && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5">
                <IconUsers size={16} className="text-sky-600 dark:text-sky-400" />
                <span className="font-medium text-default-700 dark:text-gray-200">
                  {payroll.employeePayrolls?.length || 0}
                </span>
                <span className="text-default-400 dark:text-gray-400">
                  employees
                </span>
              </div>
              <span className="text-default-300 dark:text-gray-600">|</span>
              <div className="flex items-center gap-1.5">
                <IconCash
                  size={16}
                  className="text-emerald-600 dark:text-emerald-400"
                />
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  RM {totalGross.toFixed(2)}
                </span>
              </div>
              <span className="text-default-300 dark:text-gray-600">|</span>
              <button
                onClick={handleProcessPayroll}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 text-default-400 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors disabled:opacity-50"
                title="Process payroll"
              >
                <IconRefresh
                  size={14}
                  className={isProcessing ? "animate-spin" : ""}
                />
                <span>{isProcessing ? "Processing..." : "Process"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right side: Action Buttons */}
        <div className="flex items-center gap-2">
          {batchPayrolls.length > 0 && (
            <>
              <PrintBatchPayslipsButton
                company="jellypolly"
                payrolls={batchPayrolls}
                companyName="JELLY POLLY"
                size="sm"
                variant="outline"
                color="sky"
              />
              <DownloadBatchPayslipsButton
                company="jellypolly"
                payrolls={batchPayrolls}
                companyName="JELLY POLLY"
                size="sm"
                variant="outline"
                color="sky"
              />
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/jellypolly/payroll/staff-assignment")}
            icon={IconSettings}
            iconSize={16}
          >
            Staff Assignment
          </Button>
        </div>
      </div>

      {/* No Payroll State */}
      {!payroll && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <IconCash
            size={48}
            className="mx-auto text-default-300 dark:text-gray-600 mb-4"
          />
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
            disabled={isCreating || jpEmployees.length === 0}
            icon={isCreating ? undefined : IconPlus}
            iconSize={18}
          >
            {isCreating ? "Creating..." : "Create Payroll"}
          </Button>
          {jpEmployees.length === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
              Assign staff to JP payroll first on the Staff Assignment page
            </p>
          )}
        </div>
      )}

      {/* Payroll Exists */}
      {payroll && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                  <IconUsers
                    size={20}
                    className="text-sky-600 dark:text-sky-400"
                  />
                </div>
                <div>
                  <p className="text-sm text-default-500 dark:text-gray-400">
                    Employees
                  </p>
                  <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                    {payroll.employeePayrolls?.length || 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <IconCash
                    size={20}
                    className="text-emerald-600 dark:text-emerald-400"
                  />
                </div>
                <div>
                  <p className="text-sm text-default-500 dark:text-gray-400">
                    Total Gross
                  </p>
                  <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                    RM {totalGross.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <IconCash
                    size={20}
                    className="text-amber-600 dark:text-amber-400"
                  />
                </div>
                <div>
                  <p className="text-sm text-default-500 dark:text-gray-400">
                    Total Net
                  </p>
                  <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                    RM {totalNet.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Sections (one per JP job type with processed payrolls) */}
          <div className="space-y-3">
            {orderedJobTypes.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                <p className="text-default-500 dark:text-gray-400">
                  No employees processed yet. Enter work logs or click Process.
                </p>
              </div>
            )}
            {orderedJobTypes.map((jobType) => {
              const rows = payrollsByJobType[jobType] || [];
              return (
                <div
                  key={jobType}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow"
                >
                  <button
                    onClick={() => toggleSection(jobType)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-default-50 dark:hover:bg-gray-700 rounded-t-lg"
                  >
                    <div className="flex items-center gap-3">
                      <IconUsers size={20} className="text-sky-500" />
                      <span className="font-medium text-default-800 dark:text-gray-200">
                        {jobTypeLabel(jobType)} ({rows.length})
                      </span>
                    </div>
                    {isSectionExpanded(jobType) ? (
                      <IconChevronUp size={20} className="text-default-400" />
                    ) : (
                      <IconChevronDown size={20} className="text-default-400" />
                    )}
                  </button>
                  {isSectionExpanded(jobType) && (
                    <div className="px-4 pb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-default-200 dark:border-gray-700">
                            <th className="text-left py-2 text-default-600 dark:text-gray-400 font-medium">
                              Employee
                            </th>
                            <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">
                              Gross Pay
                            </th>
                            <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">
                              Net Pay
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((ep) => (
                            <tr
                              key={ep.id}
                              className="border-b border-default-100 dark:border-gray-700/50 cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/50"
                              onClick={() =>
                                navigate(`/jellypolly/payroll/details/${ep.id}`)
                              }
                            >
                              <td className="py-2 text-default-800 dark:text-gray-200">
                                {ep.employee_name}
                              </td>
                              <td className="py-2 text-right text-default-800 dark:text-gray-200">
                                RM {Number(ep.gross_pay).toFixed(2)}
                              </td>
                              <td className="py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                RM {Number(ep.net_pay).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default JPPayrollPage;

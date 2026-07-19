// src/pages/JellyPolly/Payroll/JPPayrollPage.tsx
// Jelly Polly monthly payrolls list. Mirrors the TH payroll page styling while
// keeping JP's simpler process-all workflow.
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  IconCash,
  IconUsers,
  IconRefresh,
  IconPlus,
  IconChevronDown,
  IconChevronUp,
  IconClock,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MonthNavigator from "../../../components/MonthNavigator";
import PayrollSectionPrintMenu from "../../../components/Payroll/PayrollSectionPrintMenu";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { DownloadBatchPayslipsButton } from "../../../utils/payroll/PayslipButtons";
import {
  buildJPPayslipPayroll,
  type JPPayslipDeduction,
  type JPPayslipItem,
} from "../../../utils/JellyPolly/buildJPPayslipPayroll";
import { useJPStaffsCache } from "../../../utils/JellyPolly/useJPStaffsCache";
import {
  JP_JOB_TYPES,
  JP_ALL_JOB_IDS,
  staffHoldsJPJob,
} from "../../../configs/jpPayrollJobConfigs";
import {
  getMonthName,
  type PayrollProcessingError,
} from "../../../utils/payroll/payrollUtils";
import PayrollProcessingErrorsDialog from "../../../components/Payroll/PayrollProcessingErrorsDialog";

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
  employee_job_mapping?: Record<string, string> | string[] | null;
  job_sections?: Record<string, string>;
  mid_month_payrolls_by_employee?: Record<string, number>;
  items?: JPPayslipItem[];
  deductions?: JPPayslipDeduction[];
}

const jobTypeLabel = (jobType: string): string =>
  JP_JOB_TYPES.find((job) => job.id === jobType)?.label || jobType;

const parsePayrollAmount = (
  value: number | string | null | undefined
): number => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const formatAmount = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const JPPayrollPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { staffs } = useJPStaffsCache();

  const assignedStaffCount = staffs.filter((staff) =>
    staffHoldsJPJob(staff.job, JP_ALL_JOB_IDS)
  ).length;

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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  // Employees skipped by processing (e.g. July 2026+ OT-formula blocks)
  const [processingErrors, setProcessingErrors] = useState<
    PayrollProcessingError[]
  >([]);
  const [showProcessingErrorsDialog, setShowProcessingErrorsDialog] =
    useState<boolean>(false);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});

  const handleMonthChange = useCallback(
    (newMonth: Date): void => {
      setSelectedMonth(newMonth);
      const year = newMonth.getFullYear();
      const month = newMonth.getMonth() + 1;
      setSearchParams({ year: year.toString(), month: month.toString() });
    },
    [setSearchParams]
  );

  const fetchPayrollData = useCallback(async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    setIsLoading(true);
    try {
      const payrollResponse: JPMonthlyPayroll[] = await api.get(
        `/jellypolly/api/monthly-payrolls?year=${year}&month=${month}`
      );

      if (payrollResponse.length > 0) {
        const fullPayroll: JPMonthlyPayroll = await api.get(
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
  }, [selectedMonth]);

  useEffect(() => {
    void fetchPayrollData();
  }, [fetchPayrollData]);

  const handleCreatePayroll = async (): Promise<void> => {
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

  const handleProcessPayroll = async (): Promise<void> => {
    if (!payroll) return;

    if (assignedStaffCount === 0) {
      toast.error(
        "No staff hold a JP payroll job. Assign jobs on the Job page first."
      );
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
        if ((result.errors?.length || 0) > 0) {
          // Show the skipped employees with reasons and quick fix links
          // (July 2026+ OT-formula blocks).
          setProcessingErrors(result.errors || []);
          setShowProcessingErrorsDialog(true);
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

  const toggleSection = (section: string): void => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: prev[section] === false,
    }));
  };

  const isSectionExpanded = (section: string): boolean =>
    expandedSections[section] !== false;

  const payrollsByJobType: Record<string, JPEmployeePayroll[]> = {};
  for (const employeePayroll of payroll?.employeePayrolls || []) {
    const key = employeePayroll.job_type || "OTHER";
    if (!payrollsByJobType[key]) payrollsByJobType[key] = [];
    payrollsByJobType[key].push(employeePayroll);
  }

  const orderedJobTypes: string[] = [
    ...JP_JOB_TYPES.map((job) => job.id).filter((id) => payrollsByJobType[id]),
    ...Object.keys(payrollsByJobType).filter(
      (id) => !JP_JOB_TYPES.some((job) => job.id === id)
    ),
  ];

  const batchPayrolls = (payroll?.employeePayrolls || []).map(
    (employeePayroll) =>
      buildJPPayslipPayroll({
        ...employeePayroll,
        gross_pay: parsePayrollAmount(employeePayroll.gross_pay),
        net_pay: parsePayrollAmount(employeePayroll.net_pay),
        year: payroll?.year,
        month: payroll?.month,
      }).pdfPayroll
  );

  const totalGross =
    payroll?.employeePayrolls?.reduce(
      (sum, employeePayroll) =>
        sum + parsePayrollAmount(employeePayroll.gross_pay),
      0
    ) || 0;
  const totalNet =
    payroll?.employeePayrolls?.reduce(
      (sum, employeePayroll) =>
        sum + parsePayrollAmount(employeePayroll.net_pay),
      0
    ) || 0;
  const totalRounded =
    payroll?.employeePayrolls?.reduce(
      (sum, employeePayroll) =>
        sum +
        parsePayrollAmount(
          employeePayroll.setelah_digenapkan ?? employeePayroll.net_pay
        ),
      0
    ) || 0;

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isProcessing && (
        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg p-4">
          <div className="flex items-center">
            <IconClock
              className="text-sky-500 dark:text-sky-400 mr-3"
              size={24}
            />
            <div className="flex-1">
              <h3 className="font-medium text-sky-800 dark:text-sky-200">
                Processing Payroll
              </h3>
              <p className="text-sm text-sky-600 dark:text-sky-400">
                Rebuilding Jelly Polly payroll for the selected month...
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2 mb-3">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
              size="sm"
              pickerPlacement="bottom-left-button"
            />
            {payroll && (
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
                <div className="flex items-center gap-1.5">
                  <IconUsers
                    size={16}
                    className="text-sky-600 dark:text-sky-400"
                  />
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    {payroll.employeePayrolls?.length || 0}
                  </span>
                </div>
                <span className="text-default-300 dark:text-gray-600">|</span>
                <div className="flex items-center gap-1.5">
                  <IconCash
                    size={16}
                    className="text-emerald-600 dark:text-emerald-400"
                  />
                  <span
                    className="font-semibold text-emerald-700 dark:text-emerald-300"
                    title={`Jumlah Digenapkan: ${formatCurrency(
                      totalRounded
                    )}. Net Pay: ${formatCurrency(totalNet)}.`}
                  >
                    {formatAmount(totalRounded)}
                  </span>
                </div>
                <span className="text-default-300 dark:text-gray-600">|</span>
                <button
                  onClick={handleProcessPayroll}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 text-default-400 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors disabled:opacity-50"
                  title="Re-process Jelly Polly payroll"
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

          <div className="flex items-center gap-2">
            {batchPayrolls.length > 0 && (
              <>
                <PayrollSectionPrintMenu
                  company="jellypolly"
                  payrolls={batchPayrolls}
                  companyName="JELLY POLLY"
                  size="sm"
                  buttonLabel="Payslips"
                />
                <DownloadBatchPayslipsButton
                  company="jellypolly"
                  payrolls={batchPayrolls}
                  companyName="JELLY POLLY"
                  size="sm"
                  variant="outline"
                  color="sky"
                  buttonText={`${batchPayrolls.length} PDFs`}
                />
              </>
            )}
          </div>
        </div>

        {!payroll && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden">
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/30 dark:to-sky-800/30 flex items-center justify-center mb-6 shadow-sm">
                <IconCash
                  size={36}
                  className="text-sky-400 dark:text-sky-300"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="text-lg font-semibold text-default-700 dark:text-gray-200 mb-2">
                No Payroll Yet
              </h3>
              <p className="text-default-400 dark:text-gray-400 text-center max-w-sm mb-6">
                There is no Jelly Polly payroll record for{" "}
                <span className="font-medium text-default-600 dark:text-gray-300">
                  {getMonthName(month)} {year}
                </span>
                . Create one to start processing employee payments.
              </p>
              <Button
                color="sky"
                onClick={handleCreatePayroll}
                disabled={isCreating || assignedStaffCount === 0}
                icon={isCreating ? undefined : IconPlus}
                iconSize={18}
                size="md"
              >
                {isCreating ? "Creating..." : "Create Payroll"}
              </Button>
              {assignedStaffCount === 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
                  Assign JP jobs to staff first (Catalogue - Job or the staff form)
                </p>
              )}
            </div>
          </div>
        )}

        {payroll && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="p-4 flex items-center gap-3">
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
              <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="p-4 flex items-center gap-3">
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
                      {formatCurrency(totalGross)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="border border-sky-200 dark:border-sky-800/50 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="p-4 flex items-center gap-3">
                  <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                    <IconCash
                      size={20}
                      className="text-sky-600 dark:text-sky-400"
                    />
                  </div>
                  <div>
                    <p className="text-sm text-default-500 dark:text-gray-400">
                      Jumlah Digenapkan
                    </p>
                    <p className="text-xl font-semibold text-sky-700 dark:text-sky-300">
                      {formatCurrency(totalRounded)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {orderedJobTypes.length === 0 ? (
              <div className="text-center py-8 border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                <p className="text-default-500 dark:text-gray-400">
                  No employee payrolls found.
                </p>
                <Button
                  onClick={handleProcessPayroll}
                  color="sky"
                  variant="outline"
                  className="mt-4"
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Process Payroll"}
                </Button>
              </div>
            ) : (
              <div className="border border-default-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
                <table className="min-w-full table-fixed">
                  <thead className="bg-default-100 dark:bg-gray-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                        Name
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-28">
                        ID
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-32">
                        Section
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-32">
                        Gross
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-32">
                        Net
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800">
                    {orderedJobTypes.map((jobType) => {
                      const rows = payrollsByJobType[jobType] || [];
                      const groupGross = rows.reduce(
                        (sum, employeePayroll) =>
                          sum + parsePayrollAmount(employeePayroll.gross_pay),
                        0
                      );
                      const groupNet = rows.reduce(
                        (sum, employeePayroll) =>
                          sum +
                          parsePayrollAmount(
                            employeePayroll.setelah_digenapkan ??
                              employeePayroll.net_pay
                          ),
                        0
                      );
                      const isExpanded = isSectionExpanded(jobType);

                      return (
                        <React.Fragment key={jobType}>
                          <tr
                            className={`group cursor-pointer transition-colors border-t border-default-200 dark:border-gray-700 ${
                              isExpanded
                                ? "bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50"
                                : "bg-default-50 dark:bg-gray-800/50 hover:bg-default-100 dark:hover:bg-gray-700"
                            }`}
                            onClick={() => toggleSection(jobType)}
                          >
                            <td colSpan={3} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-1 h-5 rounded-full bg-sky-500" />
                                <IconUsers
                                  size={16}
                                  className="text-sky-600 dark:text-sky-400"
                                />
                                <span className="font-semibold text-default-800 dark:text-gray-100">
                                  {jobTypeLabel(jobType)}
                                </span>
                                <span className="text-sm text-default-500 dark:text-gray-400">
                                  ({rows.length}{" "}
                                  {rows.length === 1 ? "employee" : "employees"})
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium text-default-700 dark:text-gray-200">
                              {formatCurrency(groupGross)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex items-center gap-2">
                                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(groupNet)}
                                </span>
                                {isExpanded ? (
                                  <IconChevronUp
                                    size={14}
                                    className="text-sky-600 dark:text-sky-300"
                                  />
                                ) : (
                                  <IconChevronDown
                                    size={14}
                                    className="text-default-500 dark:text-gray-400"
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded &&
                            rows.map((employeePayroll) => (
                              <tr
                                key={employeePayroll.id}
                                className="group cursor-pointer border-b border-default-100 dark:border-gray-700 transition-colors hover:bg-default-50 dark:hover:bg-gray-700"
                                onClick={() =>
                                  navigate(
                                    `/jellypolly/payroll/details/${employeePayroll.id}`
                                  )
                                }
                              >
                                <td className="px-3 py-2">
                                  <div
                                    className="truncate font-medium text-default-700 dark:text-gray-200"
                                    title={employeePayroll.employee_name || "Unknown"}
                                  >
                                    {employeePayroll.employee_name || "Unknown"}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-default-500 dark:text-gray-400 text-sm">
                                  {employeePayroll.employee_id}
                                </td>
                                <td className="px-3 py-2 text-default-600 dark:text-gray-300 text-sm">
                                  {employeePayroll.section || jobTypeLabel(jobType)}
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-default-700 dark:text-gray-200">
                                  {formatCurrency(
                                    parsePayrollAmount(employeePayroll.gross_pay)
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(
                                    parsePayrollAmount(
                                      employeePayroll.setelah_digenapkan ??
                                        employeePayroll.net_pay
                                    )
                                  )}
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skipped employees (July 2026+ OT-formula blocks etc.) */}
      <PayrollProcessingErrorsDialog
        isOpen={showProcessingErrorsDialog}
        onClose={() => setShowProcessingErrorsDialog(false)}
        errors={processingErrors}
        staffFormBasePath="/jellypolly/catalogue/staff"
      />
    </div>
  );
};

export default JPPayrollPage;

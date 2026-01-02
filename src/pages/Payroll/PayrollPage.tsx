// src/pages/Payroll/PayrollPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconChevronsDown,
  IconChevronsUp,
  IconBriefcase,
  IconCash,
  IconUsers,
  IconLock,
  IconClockPlay,
  IconRefresh,
  IconPlus,
  IconClock,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  getMonthlyPayrollByYearMonth,
  getMonthName,
  updateMonthlyPayrollStatus,
  createMonthlyPayroll,
  getEligibleEmployees,
} from "../../utils/payroll/payrollUtils";
import { formatDistanceToNow } from "date-fns";
import { api } from "../../routes/utils/api";
import MissingIncomeTaxRatesDialog, {
  MissingIncomeTaxEmployee,
} from "../../components/Payroll/MissingIncomeTaxRatesDialog";
import toast from "react-hot-toast";
import FinalizePayrollDialog from "../../components/Payroll/FinalizePayrollDialog";
import { EmployeePayroll, MonthlyPayroll } from "../../types/types";
import { PrintBatchPayslipsButton } from "../../utils/payroll/PayslipButtons";
import {
  getBatchMidMonthPayrolls,
  MidMonthPayroll,
} from "../../utils/payroll/midMonthPayrollUtils";
import { createMidMonthPayrollsMap } from "../../utils/payroll/PayslipManager";
import MonthNavigator from "../../components/MonthNavigator";
import PayrollUnifiedTable from "../../components/Payroll/PayrollUnifiedTable";

const PayrollPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize with URL params or current month
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (yearParam && monthParam) {
      const year = parseInt(yearParam);
      const month = parseInt(monthParam);

      // Validate the params
      if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        return new Date(year, month - 1); // month is 0-indexed in Date
      }
    }

    return new Date();
  });
  const [payroll, setPayroll] = useState<MonthlyPayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<"Processing" | "Finalized">(
    "Finalized"
  );
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedEmployeePayrolls, setSelectedEmployeePayrolls] = useState<
    Record<string, boolean>
  >({});
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [midMonthPayrollsMap, setMidMonthPayrollsMap] = useState<
    Record<string, MidMonthPayroll | null>
  >({});
  const [isFetchingMidMonth, setIsFetchingMidMonth] = useState(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{
    current: number;
    total: number;
    stage: string;
  }>({ current: 0, total: 0, stage: "" });
  const [showMissingTaxDialog, setShowMissingTaxDialog] = useState(false);
  const [missingIncomeTaxEmployees, setMissingIncomeTaxEmployees] = useState<
    MissingIncomeTaxEmployee[]
  >([]);

  // Handler to update selected month and URL params
  const handleMonthChange = useCallback((newMonth: Date) => {
    setSelectedMonth(newMonth);

    const year = newMonth.getFullYear();
    const month = newMonth.getMonth() + 1; // Convert to 1-indexed

    setSearchParams({ year: year.toString(), month: month.toString() });
  }, [setSearchParams]);

  // Set initial URL params if not present
  useEffect(() => {
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (!yearParam || !monthParam) {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth() + 1;
      setSearchParams({ year: year.toString(), month: month.toString() }, { replace: true });
    }
  }, []); // Run only on mount

  // Sync URL params to state (handles browser back/forward)
  useEffect(() => {
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (yearParam && monthParam) {
      const year = parseInt(yearParam);
      const month = parseInt(monthParam);

      if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        const urlDate = new Date(year, month - 1);
        const currentDate = selectedMonth;

        // Only update if different
        if (urlDate.getFullYear() !== currentDate.getFullYear() ||
            urlDate.getMonth() !== currentDate.getMonth()) {
          setSelectedMonth(urlDate);
        }
      }
    }
  }, [searchParams]);

  // Fetch payroll when selected month changes
  useEffect(() => {
    fetchPayrollDetails();
  }, [selectedMonth]);

  const fetchPayrollDetails = async () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1; // JavaScript months are 0-indexed

    setIsLoading(true);
    try {
      const response = await getMonthlyPayrollByYearMonth(year, month);
      setPayroll(response);

      // Initialize expandedJobs with all job types expanded
      if (response?.employeePayrolls) {
        const jobTypes = new Set(
          response.employeePayrolls.map(
            (ep: { job_type: string }) => ep.job_type
          )
        );
        const initialExpanded: Record<string, boolean> = {};
        jobTypes.forEach((jobType) => {
          // Create the group key that will be used in groupEmployeesByJobType
          const groupKey = (jobType as string).includes(", ")
            ? `Grouped: ${jobType}`
            : (jobType as string);

          // Expand all sections by default
          initialExpanded[groupKey] = true;
        });
        setExpandedJobs(initialExpanded);
      }
    } catch (error) {
      console.error("Error fetching payroll details:", error);
      toast.error("Failed to load payroll details");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMidMonthPayrollsForSelected = async () => {
    const selectedPayrolls = getSelectedPayrolls();
    if (!payroll || selectedPayrolls.length === 0) return null;

    setIsFetchingMidMonth(true);
    try {
      const employeeIds = selectedPayrolls.map((emp) => emp.employee_id);
      const midMonthPayrolls = await getBatchMidMonthPayrolls(
        employeeIds,
        payroll.year,
        payroll.month
      );

      const payrollsMap = createMidMonthPayrollsMap(
        midMonthPayrolls,
        employeeIds
      );
      setMidMonthPayrollsMap(payrollsMap);
      return payrollsMap;
    } catch (error) {
      console.error("Error fetching mid-month payrolls:", error);
      return null;
    } finally {
      setIsFetchingMidMonth(false);
    }
  };

  const getFilteredEmployees = useCallback(
    (jobType: string, employees: EmployeePayroll[]) => {
      if (!searchTerm) return employees;

      return employees.filter((emp) => {
        return (
          emp.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    },
    [searchTerm]
  );

  const handleToggleJobExpansion = (jobType: string) => {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobType]: !prev[jobType],
    }));
  };

  const groupEmployeesByJobType = (employeePayrolls: EmployeePayroll[]) => {
    const grouped: Record<string, EmployeePayroll[]> = {};

    employeePayrolls.forEach((employeePayroll) => {
      const { job_type } = employeePayroll;

      // For grouped employees (job_type contains comma), create a special group key
      const groupKey = job_type.includes(", ")
        ? `Grouped: ${job_type}`
        : job_type;

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(employeePayroll);
    });

    return grouped;
  };

  // Handle creating a new payroll for the selected month
  const handleCreatePayroll = async () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    setIsCreating(true);
    try {
      await createMonthlyPayroll(year, month);
      toast.success("Payroll created successfully");
      // Fetch the newly created payroll
      await fetchPayrollDetails();
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 409) {
        toast.error("A payroll already exists for this month");
        // Refetch to get the existing payroll
        await fetchPayrollDetails();
      } else {
        toast.error("Failed to create payroll");
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Get selected payrolls as array
  const getSelectedPayrolls = useCallback(() => {
    if (!payroll?.employeePayrolls) return [];

    // Filter out any potentially invalid payrolls
    return payroll.employeePayrolls
      .filter((emp) => selectedEmployeePayrolls[`${emp.id}`])
      .map((emp) => ({
        ...emp,
        items: emp.items || [], // Ensure items is always at least an empty array
      }));
  }, [payroll?.employeePayrolls, selectedEmployeePayrolls]);

  // Calculate selected count
  const selectedCount = useMemo(
    () => Object.values(selectedEmployeePayrolls).filter(Boolean).length,
    [selectedEmployeePayrolls]
  );

  useEffect(() => {
    // Only fetch if we have selections and we're not already fetching
    const selectedPayrolls = getSelectedPayrolls();
    if (selectedPayrolls.length > 0 && !isFetchingMidMonth) {
      fetchMidMonthPayrollsForSelected();
    }
  }, [selectedCount]);

  // Handle employee selection
  const handleSelectEmployee = (
    employeeId: number,
    isSelected: boolean,
    event: React.MouseEvent<Element, MouseEvent>
  ) => {
    event.stopPropagation();
    setSelectedEmployeePayrolls((prev) => ({
      ...prev,
      [`${employeeId}`]: isSelected,
    }));
  };

  // Handle select all employees
  const handleSelectAll = useCallback(() => {
    if (!payroll?.employeePayrolls) return;

    // If all are selected, deselect all. Otherwise, select all.
    const allSelected = payroll.employeePayrolls.every(
      (emp) => selectedEmployeePayrolls[`${emp.id}`]
    );

    const newSelectedEmployees: Record<string, boolean> = {};

    if (allSelected) {
      // Deselect all
      payroll.employeePayrolls.forEach((emp) => {
        newSelectedEmployees[`${emp.id}`] = false;
      });
    } else {
      // Select all
      payroll.employeePayrolls.forEach((emp) => {
        newSelectedEmployees[`${emp.id}`] = true;
      });
    }

    setSelectedEmployeePayrolls(newSelectedEmployees);
  }, [payroll?.employeePayrolls, selectedEmployeePayrolls]);

  useEffect(() => {
    if (!payroll?.employeePayrolls) {
      setIsAllSelected(false);
      return;
    }

    const allSelected = payroll.employeePayrolls.every(
      (emp) => selectedEmployeePayrolls[`${emp.id}`]
    );

    setIsAllSelected(allSelected);
  }, [payroll?.employeePayrolls, selectedEmployeePayrolls]);

  // Handle job group selection (select all in group)
  const handleSelectJobGroup = (jobType: string, isSelected: boolean) => {
    const newSelectedEmployees = { ...selectedEmployeePayrolls };

    const employees = groupedEmployees[jobType] || [];
    const filteredEmployees = getFilteredEmployees(jobType, employees);

    filteredEmployees.forEach((emp) => {
      newSelectedEmployees[`${emp.id}`] = isSelected;
    });

    setSelectedEmployeePayrolls(newSelectedEmployees);
  };

  // Reset selections when filters change
  useEffect(() => {
    setSelectedEmployeePayrolls({});
  }, [searchTerm]);

  const handleToggleAllJobs = (expanded: boolean) => {
    if (!payroll?.employeePayrolls) return;

    const jobTypes = new Set(payroll.employeePayrolls.map((ep) => ep.job_type));
    const newExpanded: Record<string, boolean> = {};
    jobTypes.forEach((jobType) => {
      // Create the group key that matches what's used in groupEmployeesByJobType
      const groupKey = jobType.includes(", ") ? `Grouped: ${jobType}` : jobType;

      newExpanded[groupKey] = expanded;
    });
    setExpandedJobs(newExpanded);
  };

  const handleStatusChange = async () => {
    if (!payroll?.id) return;

    setIsUpdatingStatus(true);
    try {
      await updateMonthlyPayrollStatus(payroll.id, newStatus);
      toast.success(`Payroll status updated to ${newStatus}`);
      setIsStatusDialogOpen(false);
      await fetchPayrollDetails();
    } catch (error) {
      console.error("Error updating payroll status:", error);
      toast.error("Failed to update payroll status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const calculateTotals = (employeePayrolls: EmployeePayroll[]) => {
    return employeePayrolls.reduce(
      (acc, curr) => {
        return {
          grossPay: acc.grossPay + parseFloat(curr.gross_pay.toString()),
          netPay: acc.netPay + parseFloat(curr.net_pay.toString()),
        };
      },
      { grossPay: 0, netPay: 0 }
    );
  };

  const handleViewEmployeePayroll = (employeePayrollId: number | undefined) => {
    navigate(`/payroll/employee-payroll/${employeePayrollId}`);
  };

  // Handle processing all eligible employees
  const handleProcessAll = async () => {
    if (!payroll?.id || isProcessing) return;

    setIsProcessing(true);
    setProcessingProgress({
      current: 10,
      total: 100,
      stage: "Fetching eligible employees...",
    });

    try {
      // 1. Get eligible employees
      const eligibleData = await getEligibleEmployees(payroll.id);

      // 2. Build selected_employees array (all employees)
      const selectedCombinations: Array<{
        employeeId: string;
        jobType: string;
      }> = [];
      Object.entries(eligibleData.jobEmployeeMap).forEach(
        ([jobId, employeeIds]) => {
          (employeeIds as string[]).forEach((empId) => {
            selectedCombinations.push({ employeeId: empId, jobType: jobId });
          });
        }
      );

      if (selectedCombinations.length === 0) {
        toast.error("No eligible employees found for processing");
        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0, stage: "" });
        return;
      }

      setProcessingProgress({
        current: 30,
        total: 100,
        stage: `Processing ${selectedCombinations.length} employee-job combinations...`,
      });

      // 3. Call process-all API
      const response = await api.post(
        `/api/monthly-payrolls/${payroll.id}/process-all`,
        { selected_employees: selectedCombinations }
      );

      setProcessingProgress({
        current: 90,
        total: 100,
        stage: "Finalizing...",
      });

      // 4. Handle missing income tax rates
      if (response.missing_income_tax_employees?.length > 0) {
        setMissingIncomeTaxEmployees(response.missing_income_tax_employees);
        setShowMissingTaxDialog(true);
      }

      // 5. Show result
      if (response.errors?.length > 0) {
        toast.error(`Processed with ${response.errors.length} errors`);
      } else {
        toast.success(
          `Successfully processed ${response.processed_count} employees`
        );
      }

      // 6. Refresh data for complete update
      await fetchPayrollDetails();

      // 7. Update the payroll's updated_at AFTER fetch to ensure it's not overwritten
      // The response.updated_at is the server timestamp at processing completion
      if (response.updated_at) {
        setPayroll((prev) =>
          prev ? { ...prev, updated_at: response.updated_at } : prev
        );
      }
    } catch (error) {
      console.error("Error processing payroll:", error);
      toast.error("Failed to process payroll");
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0, stage: "" });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Processing":
        return "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300";
      case "Finalized":
        return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
      default:
        return "bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200";
    }
  };

  // Check if all employees in a job group are selected
  const isJobGroupSelected = useCallback(
    (jobType: string) => {
      if (!payroll) return false;

      const grouped = groupEmployeesByJobType(payroll.employeePayrolls || []);
      const employees = grouped[jobType] || [];
      const filteredEmployees = getFilteredEmployees(jobType, employees);

      if (filteredEmployees.length === 0) return false;

      return filteredEmployees.every(
        (emp) => selectedEmployeePayrolls[`${emp.id}`]
      );
    },
    [payroll, getFilteredEmployees, selectedEmployeePayrolls]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!payroll) {
    const displayYear = selectedMonth.getFullYear();
    const displayMonth = selectedMonth.getMonth() + 1;
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden">
          {/* Header with Month Navigator */}
          <div className="px-6 py-4 border-b border-default-100 dark:border-gray-700 bg-default-50 dark:bg-gray-900/50">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
            />
          </div>

          {/* Empty State Content */}
          <div className="flex flex-col items-center justify-center py-16 px-6">
            {/* Icon Container */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/30 dark:to-sky-800/30 flex items-center justify-center mb-6 shadow-sm">
              <IconCash size={36} className="text-sky-400 dark:text-sky-300" strokeWidth={1.5} />
            </div>

            {/* Text Content */}
            <h3 className="text-lg font-semibold text-default-700 dark:text-gray-200 mb-2">
              No Payroll Yet
            </h3>
            <p className="text-default-400 dark:text-gray-400 text-center max-w-sm mb-6">
              There's no payroll record for{" "}
              <span className="font-medium text-default-600 dark:text-gray-300">
                {getMonthName(displayMonth)} {displayYear}
              </span>
              . Create one to start processing employee payments.
            </p>

            {/* Create Button */}
            <Button
              onClick={handleCreatePayroll}
              icon={IconPlus}
              color="sky"
              disabled={isCreating}
              size="md"
            >
              {isCreating ? "Creating..." : "Create Payroll"}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  const groupedEmployees = groupEmployeesByJobType(
    payroll.employeePayrolls || []
  );
  const totals = calculateTotals(payroll.employeePayrolls || []);

  // Check if all jobs are expanded
  const areAllJobsExpanded =
    Object.keys(groupedEmployees).length > 0 &&
    Object.keys(groupedEmployees).every((jobType) => expandedJobs[jobType]);

  return (
    <div className="space-y-3">
      {/* Processing Progress Display */}
      {isProcessing && (
        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg p-4">
          <div className="flex items-center mb-3">
            <IconClock className="text-sky-500 dark:text-sky-400 mr-3" size={24} />
            <div className="flex-1">
              <h3 className="font-medium text-sky-800 dark:text-sky-200">Processing Payroll</h3>
              <p className="text-sm text-sky-600 dark:text-sky-400">
                {processingProgress.stage ||
                  "Please wait while employee payrolls are being calculated..."}
              </p>
            </div>
          </div>
          {processingProgress.total > 0 && (
            <div className="w-full bg-sky-200 dark:bg-sky-900 rounded-full h-2">
              <div
                className="bg-sky-500 dark:bg-sky-400 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${processingProgress.current}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Enhanced Employee Payrolls Section */}
      <div>
        {/* Header Row */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2 mb-3">
          {/* Left side: Month Navigator + Stats (stats wrap under on md and below) */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
              size="sm"
            />
            {/* Compact Stats */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5">
                <IconUsers size={16} className="text-sky-600 dark:text-sky-400" />
                <span className="font-medium text-default-700 dark:text-gray-200">
                  {payroll.employeePayrolls.length}
                </span>
                <span className="text-default-400 dark:text-gray-400">employees</span>
              </div>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <div className="flex items-center gap-1.5">
                <IconBriefcase size={16} className="text-amber-600 dark:text-amber-400" />
                <span className="font-medium text-default-700 dark:text-gray-200">
                  {Object.keys(groupedEmployees).length}
                </span>
                <span className="text-default-400 dark:text-gray-400">kerja</span>
              </div>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <div className="flex items-center gap-1.5">
                <IconCash size={16} className="text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(totals.grossPay)}
                </span>
                <span className="text-default-400 dark:text-gray-400">total</span>
              </div>
              <span className="text-default-300 dark:text-gray-600">|</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                  payroll.status
                )}`}
              >
                {payroll.status === "Processing" ? (
                  <IconClockPlay size={12} className="mr-1" />
                ) : (
                  <IconLock size={12} className="mr-1" />
                )}
                {payroll.status}
              </span>
              {payroll.status === "Processing" && (
                <>
                  <span className="text-default-300 dark:text-gray-600">•</span>
                  <button
                    onClick={handleProcessAll}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 text-default-400 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors disabled:opacity-50"
                    title="Re-process payroll"
                  >
                    <IconRefresh
                      size={14}
                      className={isProcessing ? "animate-spin" : ""}
                    />
                    <span>
                      {payroll.employeePayrolls.length > 0 && payroll.updated_at
                        ? formatDistanceToNow(new Date(payroll.updated_at), {
                            addSuffix: true,
                          })
                        : "Process"}
                    </span>
                  </button>
                  <span className="text-default-300 dark:text-gray-600">•</span>
                  <button
                    onClick={() => setShowFinalizeDialog(true)}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 text-default-400 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-50"
                    title="Finalize payroll"
                  >
                    <IconLock size={14} />
                    <span>Finalize</span>
                  </button>
                </>
              )}
              {payroll.status === "Finalized" && (
                <>
                  <span className="text-default-300 dark:text-gray-600">•</span>
                  <span className="text-default-500 dark:text-gray-400">
                    Finalized{" "}
                    {payroll.updated_at
                      ? formatDistanceToNow(new Date(payroll.updated_at), {
                          addSuffix: true,
                        })
                      : ""}
                  </span>
                  <span className="text-default-300 dark:text-gray-600">•</span>
                  <button
                    onClick={() => {
                      setNewStatus("Processing");
                      setIsStatusDialogOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-default-400 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                    title="Revert to Processing"
                  >
                    <IconRefresh size={14} />
                    <span>Revert</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right side: Action Buttons */}
          <div className="flex space-x-2">
            {selectedCount > 0 && !isAllSelected && (
              <PrintBatchPayslipsButton
                payrolls={getSelectedPayrolls()}
                size="sm"
                variant="outline"
                color="sky"
                buttonText={
                  isFetchingMidMonth
                    ? "Loading mid-month data..."
                    : `Print ${selectedCount} Payslips`
                }
                disabled={isFetchingMidMonth || selectedCount === 0}
                midMonthPayrollsMap={midMonthPayrollsMap}
              />
            )}
            <PrintBatchPayslipsButton
              payrolls={payroll.employeePayrolls || []}
              size="sm"
              variant={isAllSelected ? "filled" : "outline"}
              color="sky"
              buttonText={
                isFetchingMidMonth ? "Loading mid-month data..." : "Print All"
              }
              disabled={isFetchingMidMonth}
              midMonthPayrollsMap={midMonthPayrollsMap}
            />
            <div className="relative">
              <input
                type="text"
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 w-[154px] placeholder-gray-400 dark:placeholder-gray-500"
              />
              {searchTerm && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300 transition-colors"
                  onClick={() => setSearchTerm("")}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={areAllJobsExpanded ? IconChevronsUp : IconChevronsDown}
              onClick={() => handleToggleAllJobs(!areAllJobsExpanded)}
            ></Button>
          </div>
        </div>

        {Object.keys(groupedEmployees).length === 0 ? (
          <div className="text-center py-8 border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <p className="text-default-500 dark:text-gray-400">No employee payrolls found.</p>
            {payroll.status === "Processing" && (
              <Button
                onClick={handleProcessAll}
                color="sky"
                variant="outline"
                className="mt-4"
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Process Payroll"}
              </Button>
            )}
          </div>
        ) : (
          <PayrollUnifiedTable
            jobGroups={Object.entries(groupedEmployees)
              .sort(([, employeesA], [, employeesB]) => {
                // Sort by total net pay (highest to lowest)
                const netPayA = employeesA.reduce(
                  (sum, emp) => sum + parseFloat(emp.net_pay.toString()),
                  0
                );
                const netPayB = employeesB.reduce(
                  (sum, emp) => sum + parseFloat(emp.net_pay.toString()),
                  0
                );
                return netPayB - netPayA;
              })
              .map(([jobType, employees]) => ({
                jobType,
                employees: getFilteredEmployees(jobType, employees),
              }))
              .filter((group) => group.employees.length > 0)}
            expandedJobs={expandedJobs}
            onToggleExpand={handleToggleJobExpansion}
            isJobGroupSelected={isJobGroupSelected}
            onSelectGroup={handleSelectJobGroup}
            selectedEmployeePayrolls={selectedEmployeePayrolls}
            onSelectEmployee={handleSelectEmployee}
            onViewDetails={handleViewEmployeePayroll}
            payrollStatus={payroll.status}
            midMonthPayrollsMap={midMonthPayrollsMap}
            formatCurrency={formatCurrency}
          />
        )}
      </div>
      {/* Status Change Dialog */}
      <ConfirmationDialog
        isOpen={isStatusDialogOpen}
        onClose={() => setIsStatusDialogOpen(false)}
        onConfirm={handleStatusChange}
        title={`${
          payroll.status === "Finalized" ? "Revert" : "Update"
        } Payroll Status`}
        message={
          payroll.status === "Finalized"
            ? "Are you sure you want to revert this payroll back to Processing? This will allow making changes to the payroll."
            : `Are you sure you want to change the status from ${payroll.status} to ${newStatus}?`
        }
        confirmButtonText={isUpdatingStatus ? "Processing..." : "Confirm"}
        variant={payroll.status === "Finalized" ? "danger" : "default"}
      />
      {/* Finalize Payroll Dialog */}
      <FinalizePayrollDialog
        isOpen={showFinalizeDialog}
        onClose={() => setShowFinalizeDialog(false)}
        onConfirm={async () => {
          if (!payroll?.id) return;
          try {
            await updateMonthlyPayrollStatus(payroll.id, "Finalized");
            setShowFinalizeDialog(false);
            toast.success("Payroll has been finalized successfully");
            await fetchPayrollDetails();
          } catch (error) {
            console.error("Error finalizing payroll:", error);
            toast.error("Failed to finalize payroll");
          }
        }}
        payrollMonth={getMonthName(payroll.month)}
        payrollYear={payroll.year}
        employeeCount={payroll.employeePayrolls.length}
        totalGrossPay={totals.grossPay}
      />
      {/* Missing Income Tax Rates Dialog */}
      <MissingIncomeTaxRatesDialog
        isOpen={showMissingTaxDialog}
        onClose={() => setShowMissingTaxDialog(false)}
        employees={missingIncomeTaxEmployees}
      />
    </div>
  );
};

export default PayrollPage;

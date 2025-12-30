// src/pages/Payroll/PayrollPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  IconChevronDown,
  IconChevronUp,
  IconChevronsDown,
  IconChevronsUp,
  IconBriefcase,
  IconCash,
  IconUsers,
  IconLock,
  IconClockPlay,
  IconRefresh,
  IconSelectAll,
  IconPlus,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  getMonthlyPayrollByYearMonth,
  getMonthName,
  updateMonthlyPayrollStatus,
  createMonthlyPayroll,
} from "../../utils/payroll/payrollUtils";
import { format } from "date-fns";
import toast from "react-hot-toast";
import FinalizePayrollDialog from "../../components/Payroll/FinalizePayrollDialog";
import { EmployeePayroll, MonthlyPayroll } from "../../types/types";
import Checkbox from "../../components/Checkbox";
import {
  DownloadBatchPayslipsButton,
  PrintBatchPayslipsButton,
} from "../../utils/payroll/PayslipButtons";
import {
  getBatchMidMonthPayrolls,
  MidMonthPayroll,
} from "../../utils/payroll/midMonthPayrollUtils";
import { createMidMonthPayrollsMap } from "../../utils/payroll/PayslipManager";
import MonthNavigator from "../../components/MonthNavigator";
import EmployeePayrollCard from "../../components/Payroll/EmployeePayrollCard";

const PayrollPage: React.FC = () => {
  const navigate = useNavigate();

  // Initialize with current month
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());
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
            : jobType as string;
          
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

      // Create a map of employee IDs to mid-month payrolls
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
      const response = await createMonthlyPayroll(year, month);
      toast.success("Payroll created successfully");
      // Fetch the newly created payroll
      await fetchPayrollDetails();
      // Navigate to processing page
      if (response?.payroll?.id) {
        navigate(`/payroll/monthly-payrolls/${response.payroll.id}/process`);
      }
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
      const groupKey = jobType.includes(", ") 
        ? `Grouped: ${jobType}`
        : jobType;
      
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

  const handleProcessPayroll = () => {
    if (!payroll?.id) return;
    navigate(`/payroll/monthly-payrolls/${payroll.id}/process`);
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
        return "bg-sky-100 text-sky-700";
      case "Finalized":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-default-100 text-default-700";
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
        <div className="bg-white rounded-lg border border-default-200 p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
            <div className="flex items-center gap-3">
              <MonthNavigator
                selectedMonth={selectedMonth}
                onChange={setSelectedMonth}
                showGoToCurrentButton={false}
              />
            </div>
          </div>
          <div className="text-center py-4">
            <p className="text-default-500 mb-4">
              No payroll found for {getMonthName(displayMonth)} {displayYear}
            </p>
            <Button
              onClick={handleCreatePayroll}
              icon={IconPlus}
              color="sky"
              disabled={isCreating}
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
  const areAllJobsExpanded = Object.keys(groupedEmployees).length > 0 &&
    Object.keys(groupedEmployees).every((jobType) => expandedJobs[jobType]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div className="flex items-center gap-3">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={setSelectedMonth}
              showGoToCurrentButton={false}
            />
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
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
            <p className="text-sm text-default-500">
              Created on {format(new Date(payroll.created_at), "dd MMM yyyy")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
            {payroll.status === "Processing" ? (
              <>
                <Button
                  onClick={() =>
                    navigate(`/payroll/monthly-payrolls/${payroll.id}/process`)
                  }
                  variant="outline"
                  color="sky"
                  icon={IconClockPlay}
                >
                  Process
                </Button>
                <Button
                  onClick={() => setShowFinalizeDialog(true)}
                  variant="filled"
                  color="amber"
                  icon={IconLock}
                >
                  Finalize Payroll
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => {
                    setNewStatus("Processing");
                    setIsStatusDialogOpen(true);
                  }}
                  variant="outline"
                  color="amber"
                  icon={IconRefresh}
                >
                  Revert to Processing
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Enhanced Employee Payrolls Section */}
        <div className="mt-2">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
            {/* Title + Inline Stats */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              {/* Compact Stats */}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <IconUsers size={16} className="text-sky-600" />
                  <span className="font-medium text-default-700">
                    {payroll.employeePayrolls.length}
                  </span>
                  <span className="text-default-400">employees</span>
                </div>
                <span className="text-default-300">•</span>
                <div className="flex items-center gap-1.5">
                  <IconBriefcase size={16} className="text-amber-600" />
                  <span className="font-medium text-default-700">
                    {Object.keys(groupedEmployees).length}
                  </span>
                  <span className="text-default-400">kerja</span>
                </div>
                <span className="text-default-300">•</span>
                <div className="flex items-center gap-1.5">
                  <IconCash size={16} className="text-emerald-600" />
                  <span className="font-semibold text-emerald-700">
                    {formatCurrency(totals.grossPay)}
                  </span>
                  <span className="text-default-400">total</span>
                </div>
              </div>
            </div>
            <div className="flex space-x-2 mt-2 md:mt-0">
              {/* Batch action buttons - show only when employees are selected */}
              {selectedCount > 0 && (
                <>
                  <DownloadBatchPayslipsButton
                    payrolls={getSelectedPayrolls()}
                    size="sm"
                    variant="outline"
                    color="sky"
                    buttonText={
                      isFetchingMidMonth
                        ? "Loading mid-month data..."
                        : `Download ${selectedCount} PDFs`
                    }
                    disabled={isFetchingMidMonth || selectedCount === 0}
                    midMonthPayrollsMap={midMonthPayrollsMap}
                  />
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
                </>
              )}

              <Button
                size="sm"
                variant="outline"
                color="sky"
                icon={IconSelectAll}
                onClick={handleSelectAll}
              >
                {isAllSelected ? "Deselect All" : "Select All"}
              </Button>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-1 border border-default-300 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 min-w-[200px]"
                />
                {searchTerm && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 hover:text-default-700"
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
              >
                {areAllJobsExpanded ? "Collapse All" : "Expand All"}
              </Button>
            </div>
          </div>

          {Object.keys(groupedEmployees).length === 0 ? (
            <div className="text-center py-8 border rounded-lg">
              <p className="text-default-500">No employee payrolls found.</p>
              {payroll.status === "Processing" && (
                <Button
                  onClick={handleProcessPayroll}
                  color="sky"
                  variant="outline"
                  className="mt-4"
                >
                  Process Payroll
                </Button>
              )}
            </div>
          ) : (
            Object.entries(groupedEmployees)
              .map(([jobType, employees]) => {
                // Filter employees by search term
                const filteredEmployees = getFilteredEmployees(
                  jobType,
                  employees
                );

                // Skip rendering this job group if no employees match the search
                if (filteredEmployees.length === 0) return null;

                const groupGrossPay = filteredEmployees.reduce(
                  (sum, emp) => sum + parseFloat(emp.gross_pay.toString()),
                  0
                );
                const groupNetPay = filteredEmployees.reduce(
                  (sum, emp) => sum + parseFloat(emp.net_pay.toString()),
                  0
                );
                const isGrouped = jobType.startsWith("Grouped: ");
                const displayJobType = isGrouped
                  ? jobType.replace("Grouped: ", "")
                  : jobType;

                return (
                  <div
                    key={jobType}
                    className={clsx(
                      "mb-2 rounded-lg overflow-hidden border transition-shadow duration-200",
                      expandedJobs[jobType]
                        ? "shadow-md border-default-200"
                        : "shadow-sm border-default-200 hover:shadow"
                    )}
                  >
                    {/* Accordion Header */}
                    <div
                      className={clsx(
                        "flex items-center cursor-pointer transition-colors duration-150",
                        expandedJobs[jobType]
                          ? "bg-gradient-to-r from-sky-50 to-white"
                          : "bg-white hover:bg-default-50"
                      )}
                      onClick={() => handleToggleJobExpansion(jobType)}
                    >
                      {/* Left accent bar */}
                      <div
                        className={clsx(
                          "w-1 self-stretch flex-shrink-0",
                          isGrouped ? "bg-emerald-500" : "bg-sky-500"
                        )}
                      />

                      <div className="flex-1 flex items-center justify-between px-4 py-3">
                        {/* Left side: Checkbox + Job info */}
                        <div className="flex items-center flex-1 min-w-0">
                          {/* Group Checkbox */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mr-3 flex-shrink-0"
                          >
                            <Checkbox
                              checked={isJobGroupSelected(jobType)}
                              onChange={() =>
                                handleSelectJobGroup(
                                  jobType,
                                  !isJobGroupSelected(jobType)
                                )
                              }
                              size={20}
                              aria-label={`Select all ${displayJobType} employees`}
                            />
                          </div>

                          {/* Job Type Icon & Name */}
                          <div className="flex items-center min-w-0">
                            <IconBriefcase
                              size={20}
                              className={clsx(
                                "mr-2 flex-shrink-0",
                                isGrouped ? "text-emerald-600" : "text-sky-600"
                              )}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-default-800 truncate">
                                  {displayJobType}
                                </h3>
                                {isGrouped && (
                                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">
                                    Combined
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-default-500 mt-0.5">
                                {filteredEmployees.length}{" "}
                                {filteredEmployees.length === 1
                                  ? "employee"
                                  : "employees"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Right side: Totals + Chevron */}
                        <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                          {/* Pay Totals */}
                          <div className="hidden sm:flex items-center gap-4 text-right">
                            <div>
                              <p className="text-xs text-default-400">Gross</p>
                              <p className="text-sm font-semibold text-default-700">
                                {formatCurrency(groupGrossPay)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-default-400">Net</p>
                              <p className="text-sm font-semibold text-emerald-600">
                                {formatCurrency(groupNetPay)}
                              </p>
                            </div>
                          </div>

                          {/* Chevron */}
                          <div
                            className={clsx(
                              "p-1.5 rounded-full transition-colors",
                              expandedJobs[jobType]
                                ? "bg-sky-100 text-sky-600"
                                : "bg-default-100 text-default-500"
                            )}
                          >
                            {expandedJobs[jobType] ? (
                              <IconChevronUp size={18} />
                            ) : (
                              <IconChevronDown size={18} />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Accordion Content - Card Grid */}
                    {expandedJobs[jobType] && (
                      <div className="border-t border-default-100 p-4 bg-default-50/50">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {filteredEmployees.map((employeePayroll) => (
                            <EmployeePayrollCard
                              key={employeePayroll.id}
                              employeePayroll={employeePayroll}
                              isSelected={
                                !!selectedEmployeePayrolls[
                                  `${employeePayroll.id}`
                                ]
                              }
                              onSelect={handleSelectEmployee}
                              onViewDetails={handleViewEmployeePayroll}
                              payrollStatus={payroll.status}
                              midMonthPayroll={
                                midMonthPayrollsMap[employeePayroll.employee_id]
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
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
    </div>
  );
};

export default PayrollPage;

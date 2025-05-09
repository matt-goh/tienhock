// src/pages/Payroll/MonthlyPayrollDetailsPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  IconChevronDown,
  IconChevronUp,
  IconChevronsDown,
  IconChevronsUp,
  IconEye,
  IconBriefcase,
  IconCash,
  IconCircleCheck,
  IconUsers,
  IconLock,
  IconClockPlay,
  IconRefresh,
  IconSearch,
  IconX,
  IconFilter,
  IconPrinter,
  IconSelectAll,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import BackButton from "../../components/BackButton";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  getMonthlyPayrollDetails,
  getMonthName,
  updateMonthlyPayrollStatus,
} from "../../utils/payroll/payrollUtils";
import { format } from "date-fns";
import toast from "react-hot-toast";
import FinalizePayrollDialog from "../../components/Payroll/FinalizePayrollDialog";
import { EmployeePayroll, MonthlyPayroll } from "../../types/types";
import { FormListbox } from "../../components/FormComponents";
import { BatchPaySlipPDFButton } from "../../utils/payroll/PDFDownloadButton";
import ReactDOM from "react-dom";
import BatchPrintPaySlipOverlay from "../../utils/payroll/BatchPrintPaySlipOverlay";
import Checkbox from "../../components/Checkbox";

const MonthlyPayrollDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<MonthlyPayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<"Processing" | "Finalized">(
    "Finalized"
  );
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filteredJobType, setFilteredJobType] = useState<string>("all");
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);
  const [selectedEmployeePayrolls, setSelectedEmployeePayrolls] = useState<
    Record<string, boolean>
  >({});
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [showPrintBatchOverlay, setShowPrintBatchOverlay] = useState(false);

  useEffect(() => {
    fetchPayrollDetails();
  }, [id]);

  const fetchPayrollDetails = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await getMonthlyPayrollDetails(Number(id));
      setPayroll(response);

      // Initialize expandedJobs with all job types expanded
      if (response.employeePayrolls) {
        const jobTypes = new Set(
          response.employeePayrolls.map(
            (ep: { job_type: string }) => ep.job_type
          )
        );
        const initialExpanded: Record<string, boolean> = {};
        jobTypes.forEach((jobType) => {
          initialExpanded[jobType as string] = true;
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

  const getFilteredEmployees = useCallback(
    (jobType: string, employees: EmployeePayroll[]) => {
      if (!searchTerm && filteredJobType === "all") return employees;

      return employees.filter((emp) => {
        const matchesSearch =
          !searchTerm ||
          emp.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesJobFilter =
          filteredJobType === "all" || emp.job_type === filteredJobType;

        return matchesSearch && matchesJobFilter;
      });
    },
    [searchTerm, filteredJobType]
  );

  // Get all unique job types for the filter dropdown
  const jobTypes = useMemo(() => {
    if (!payroll?.employeePayrolls) return [];
    const types = Array.from(
      new Set(payroll.employeePayrolls.map((emp) => emp.job_type))
    );
    return ["all", ...types];
  }, [payroll?.employeePayrolls]);

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
      if (!grouped[job_type]) {
        grouped[job_type] = [];
      }
      grouped[job_type].push(employeePayroll);
    });

    return grouped;
  };

  const handleBack = () => {
    navigate("/payroll/monthly-payrolls/list");
  };

  // Get selected payrolls as array
  const getSelectedPayrolls = useCallback(() => {
    if (!payroll?.employeePayrolls) return [];
    return payroll.employeePayrolls.filter(
      (emp) => selectedEmployeePayrolls[`${emp.id}`]
    );
  }, [payroll?.employeePayrolls, selectedEmployeePayrolls]);

  // Calculate selected count
  const selectedCount = useMemo(
    () => Object.values(selectedEmployeePayrolls).filter(Boolean).length,
    [selectedEmployeePayrolls]
  );

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

  // Handle batch print
  const handleBatchPrint = () => {
    const selectedPayrolls = getSelectedPayrolls();
    if (selectedPayrolls.length === 0) {
      toast.error("No payrolls selected for printing");
      return;
    }

    setShowPrintBatchOverlay(true);
  };

  // Reset selections when filters change
  useEffect(() => {
    setSelectedEmployeePayrolls({});
  }, [searchTerm, filteredJobType]);

  const handleToggleAllJobs = (expanded: boolean) => {
    if (!payroll?.employeePayrolls) return;

    const jobTypes = new Set(payroll.employeePayrolls.map((ep) => ep.job_type));
    const newExpanded: Record<string, boolean> = {};
    jobTypes.forEach((jobType) => {
      newExpanded[jobType] = expanded;
    });
    setExpandedJobs(newExpanded);
  };

  const handleStatusChange = async () => {
    if (!id || !payroll) return;

    setIsUpdatingStatus(true);
    try {
      await updateMonthlyPayrollStatus(Number(id), newStatus);
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
    navigate(`/payroll/monthly-payrolls/${id}/process`);
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
    return (
      <div className="text-center py-12">
        <p className="text-default-500">Payroll not found</p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back to List
        </Button>
      </div>
    );
  }
  const groupedEmployees = groupEmployeesByJobType(
    payroll.employeePayrolls || []
  );
  const totals = calculateTotals(payroll.employeePayrolls || []);

  return (
    <div className="relative w-full mx-4 md:mx-6 -mt-6">
      <BackButton onClick={handleBack} />

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <div className="flex items-center mb-1">
              <h1 className="text-xl font-semibold text-default-800 mr-2">
                Monthly Payroll: {getMonthName(payroll.month)} {payroll.year}
              </h1>
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
            </div>
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

        {/* Payroll Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-default-200 p-4 shadow-sm hover:shadow transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-default-500">Total Employees</p>
                <p className="text-xl font-semibold text-default-800 mt-1">
                  {payroll.employeePayrolls.length}
                </p>
              </div>
              <div className="bg-sky-100 p-2.5 rounded-full">
                <IconUsers className="h-6 w-6 text-sky-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-default-200 p-4 shadow-sm hover:shadow transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-default-500">Gross Pay</p>
                <p className="text-xl font-semibold text-default-800 mt-1">
                  {formatCurrency(totals.grossPay)}
                </p>
              </div>
              <div className="bg-emerald-100 p-2.5 rounded-full">
                <IconCash className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-default-200 p-4 shadow-sm hover:shadow transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-default-500">Job Types</p>
                <p className="text-xl font-semibold text-default-800 mt-1">
                  {Object.keys(groupedEmployees).length}
                </p>
              </div>
              <div className="bg-amber-100 p-2.5 rounded-full">
                <IconBriefcase className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-default-200 p-4 shadow-sm hover:shadow transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-default-500">Status</p>
                <p className="text-xl font-semibold text-default-800 mt-1 flex items-center">
                  <span>{payroll.status}</span>
                  {payroll.status === "Finalized" && (
                    <IconLock size={16} className="ml-1.5 text-amber-600" />
                  )}
                </p>
              </div>
              <div
                className={clsx(
                  "p-2.5 rounded-full",
                  payroll.status === "Processing"
                    ? "bg-sky-100"
                    : payroll.status === "Finalized"
                    ? "bg-emerald-100"
                    : "bg-amber-100"
                )}
              >
                <IconCircleCheck
                  className={clsx(
                    "h-6 w-6",
                    payroll.status === "Processing"
                      ? "text-sky-600"
                      : payroll.status === "Finalized"
                      ? "text-emerald-600"
                      : "text-amber-600"
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Employee Payrolls Section */}
        <div className="mt-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
            <h2 className="text-lg font-semibold text-default-800">
              Employee Payrolls
            </h2>
            <div className="flex space-x-2 mt-2 md:mt-0">
              {/* Batch action buttons - show only when employees are selected */}
              {selectedCount > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    color="sky"
                    icon={IconPrinter}
                    onClick={handleBatchPrint}
                    title={"Print Payslips"}
                  >
                    Print {selectedCount} Payslips
                  </Button>
                  <BatchPaySlipPDFButton
                    payrolls={getSelectedPayrolls()}
                    size="sm"
                    icon={true}
                    variant="outline"
                    color="sky"
                    buttonText={`Download ${selectedCount} PDFs`}
                    title={"Download Payslips"}
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
              <Button
                size="sm"
                variant="outline"
                icon={IconFilter}
                onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              >
                {isFilterExpanded ? "Hide Filters" : "Show Filters"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={IconChevronsDown}
                onClick={() => handleToggleAllJobs(true)}
              >
                Expand All
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={IconChevronsUp}
                onClick={() => handleToggleAllJobs(false)}
              >
                Collapse All
              </Button>
            </div>
          </div>

          {/* New Search & Filter Bar */}
          {isFilterExpanded && (
            <div className="bg-default-50 border border-default-200 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Search Input */}
                <div>
                  <label
                    htmlFor="search-employees"
                    className="block text-sm font-medium text-default-700 mb-1"
                  >
                    Search Employees
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <IconSearch size={18} className="text-default-400" />
                    </div>
                    <input
                      id="search-employees"
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      placeholder="Search by name or ID..."
                    />
                  </div>
                </div>

                {/* Job Type Filter - Replace with FormListbox */}
                <div>
                  <FormListbox
                    name="jobTypeFilter"
                    label="Filter by Job Type"
                    value={filteredJobType}
                    onChange={(value) => setFilteredJobType(value)}
                    options={jobTypes.map((type) => ({
                      id: type,
                      name: type === "all" ? "All Job Types" : type,
                    }))}
                  />
                </div>
              </div>

              {/* Show active filters & counts */}
              <div className="flex items-center mt-3 text-sm">
                <span className="text-default-600">
                  Showing{" "}
                  {
                    Object.values(groupedEmployees)
                      .flat()
                      .filter(
                        (emp) =>
                          getFilteredEmployees(emp.job_type, [emp]).length > 0
                      ).length
                  }{" "}
                  of {payroll.employeePayrolls.length} employees
                </span>
                {(searchTerm || filteredJobType !== "all") && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setFilteredJobType("all");
                    }}
                    className="ml-2 text-sky-600 hover:text-sky-800 flex items-center"
                  >
                    <IconX size={14} className="mr-1" />
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          )}

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
              // Only show job types that match the filter
              .filter(
                ([jobType, _]) =>
                  filteredJobType === "all" || jobType === filteredJobType
              )
              .map(([jobType, employees]) => {
                // Filter employees by search term
                const filteredEmployees = getFilteredEmployees(
                  jobType,
                  employees
                );

                // Skip rendering this job group if no employees match the search
                if (filteredEmployees.length === 0) return null;

                return (
                  <div key={jobType} className="mb-4">
                    <div
                      className={`flex justify-between items-center p-4 bg-default-50 border border-default-200 cursor-pointer hover:bg-default-100 transition-colors duration-150 ${
                        expandedJobs[jobType] ? "rounded-t-lg" : "rounded-lg"
                      }`}
                      onClick={() => handleToggleJobExpansion(jobType)}
                    >
                      <div className="flex items-center">
                        {expandedJobs[jobType] ? (
                          <IconChevronUp
                            size={20}
                            className="text-default-500 mr-2"
                          />
                        ) : (
                          <IconChevronDown
                            size={20}
                            className="text-default-500 mr-2"
                          />
                        )}
                        <h3 className="font-medium">{jobType}</h3>
                        <span className="ml-2 text-sm text-default-500">
                          ({filteredEmployees.length}{" "}
                          {filteredEmployees.length === 1
                            ? "employee"
                            : "employees"}
                          )
                        </span>
                      </div>
                      <div className="text-sm text-default-600">
                        Total:{" "}
                        {formatCurrency(
                          filteredEmployees.reduce(
                            (sum, emp) =>
                              sum + parseFloat(emp.gross_pay.toString()),
                            0
                          )
                        )}
                      </div>
                    </div>

                    {expandedJobs[jobType] && (
                      <div className="border-l border-r border-b border-default-200 rounded-b-lg overflow-hidden shadow-sm">
                        <table className="min-w-full divide-y divide-default-200">
                          <thead className="bg-default-50">
                            <tr>
                              <th
                                scope="col"
                                className="px-3 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectJobGroup(
                                    jobType,
                                    !isJobGroupSelected(jobType)
                                  );
                                }}
                                style={{ cursor: "pointer" }}
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
                                  className="mx-auto"
                                  aria-label={`Select all ${jobType} employees`}
                                />
                              </th>
                              <th
                                scope="col"
                                className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                              >
                                Employee
                              </th>
                              <th
                                scope="col"
                                className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                              >
                                Section
                              </th>
                              <th
                                scope="col"
                                className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                              >
                                Gross Pay
                              </th>
                              <th
                                scope="col"
                                className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                              >
                                Net Pay
                              </th>
                              <th
                                scope="col"
                                className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                              >
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-default-200">
                            {filteredEmployees.map((employeePayroll) => (
                              <tr
                                key={employeePayroll.id}
                                className="hover:bg-default-50 transition-colors duration-150 cursor-pointer"
                                onClick={() =>
                                  handleViewEmployeePayroll(employeePayroll.id)
                                }
                              >
                                <td
                                  className="pl-4 py-4 whitespace-nowrap align-middle"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectEmployee(
                                      employeePayroll.id as number,
                                      !selectedEmployeePayrolls[
                                        `${employeePayroll.id}`
                                      ],
                                      e
                                    );
                                  }}
                                  style={{ cursor: "pointer" }}
                                >
                                  <Checkbox
                                    checked={
                                      !!selectedEmployeePayrolls[
                                        `${employeePayroll.id}`
                                      ]
                                    }
                                    onChange={(checked) =>
                                      handleSelectEmployee(
                                        employeePayroll.id as number,
                                        checked,
                                        new MouseEvent(
                                          "click"
                                        ) as unknown as React.MouseEvent<
                                          Element,
                                          MouseEvent
                                        >
                                      )
                                    }
                                    size={20}
                                    aria-label={`Select ${
                                      employeePayroll.employee_name ||
                                      "employee"
                                    }`}
                                  />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-default-900">
                                    {employeePayroll.employee_name || "Unknown"}
                                  </div>
                                  <div className="text-xs text-default-500">
                                    {employeePayroll.employee_id}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-default-600">
                                    {employeePayroll.section}
                                  </div>
                                  {payroll.status === "Finalized" && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 mt-1">
                                      <IconLock size={12} className="mr-1" />
                                      Finalized
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <div className="text-sm font-medium text-default-900">
                                    {formatCurrency(
                                      parseFloat(
                                        employeePayroll.gross_pay.toString()
                                      )
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <div className="text-sm font-medium text-default-900">
                                    {formatCurrency(
                                      parseFloat(
                                        employeePayroll.net_pay.toString()
                                      )
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <div className="flex justify-end space-x-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewEmployeePayroll(
                                          employeePayroll.id
                                        );
                                      }}
                                      className="text-sky-600 hover:text-sky-800 p-1 rounded hover:bg-sky-50"
                                      title="View Details"
                                    >
                                      <IconEye size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
      {/* Batch Print Overlay */}
      {showPrintBatchOverlay && (
        <BatchPrintPaySlipOverlay
          payrolls={getSelectedPayrolls()}
          onComplete={() => {
            setShowPrintBatchOverlay(false);
          }}
        />
      )}
      {/* Finalize Payroll Dialog */}
      <FinalizePayrollDialog
        isOpen={showFinalizeDialog}
        onClose={() => setShowFinalizeDialog(false)}
        onConfirm={async () => {
          try {
            await updateMonthlyPayrollStatus(Number(id), "Finalized");
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

export default MonthlyPayrollDetailsPage;

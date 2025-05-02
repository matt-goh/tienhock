// src/pages/Payroll/MonthlyPayrollDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  IconChevronsDown,
  IconChevronsUp,
  IconEye,
  IconBriefcase,
  IconCash,
  IconCircleCheck,
  IconUsers,
  IconLock,
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
import BatchPrintModal from "../../components/Payroll/BatchPrintModal";
import { EmployeePayroll, MonthlyPayroll } from "../../types/types";

const MonthlyPayrollDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<MonthlyPayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<
    "Processing" | "Completed" | "Finalized"
  >("Completed");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showBatchPrintModal, setShowBatchPrintModal] = useState(false);

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

  const handleToggleJobExpansion = (jobType: string) => {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobType]: !prev[jobType],
    }));
  };

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

  const handleBack = () => {
    navigate("/payroll/monthly-payrolls/list");
  };

  const handleViewEmployeePayroll = (employeePayrollId: number| undefined) => {
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
      case "Completed":
        return "bg-emerald-100 text-emerald-700";
      case "Finalized":
        return "bg-amber-100 text-amber-700";
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
                {payroll.status}
              </span>
            </div>
            <p className="text-sm text-default-500">
              Created on {format(new Date(payroll.created_at), "dd MMM yyyy")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
            {payroll.status === "Completed" ? (
              <Button
                onClick={() => setShowFinalizeDialog(true)}
                variant="filled"
                color="amber"
              >
                Finalize Payroll
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setNewStatus(
                    payroll.status === "Processing" ? "Completed" : "Processing"
                  );
                  setIsStatusDialogOpen(true);
                }}
                variant="outline"
              >
                Change Status
              </Button>
            )}
          </div>
        </div>

        {/* Payroll Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-default-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-default-500">Total Employees</p>
                <p className="text-xl font-semibold text-default-800">
                  {payroll.employeePayrolls.length}
                </p>
              </div>
              <div className="bg-sky-100 p-2 rounded-full">
                <IconUsers className="h-6 w-6 text-sky-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-default-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-default-500">Gross Pay</p>
                <p className="text-xl font-semibold text-default-800">
                  {formatCurrency(totals.grossPay)}
                </p>
              </div>
              <div className="bg-emerald-100 p-2 rounded-full">
                <IconCash className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-default-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-default-500">Job Types</p>
                <p className="text-xl font-semibold text-default-800">
                  {Object.keys(groupedEmployees).length}
                </p>
              </div>
              <div className="bg-amber-100 p-2 rounded-full">
                <IconBriefcase className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-default-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-default-500">Status</p>
                <p className="text-xl font-semibold text-default-800">
                  {payroll.status}
                </p>
              </div>
              <div
                className={clsx(
                  "p-2 rounded-full",
                  payroll.status === "Processing"
                    ? "bg-sky-100"
                    : payroll.status === "Completed"
                    ? "bg-emerald-100"
                    : "bg-amber-100"
                )}
              >
                <IconCircleCheck
                  className={clsx(
                    "h-6 w-6",
                    payroll.status === "Processing"
                      ? "text-sky-600"
                      : payroll.status === "Completed"
                      ? "text-emerald-600"
                      : "text-amber-600"
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Employee Payrolls Section */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-default-800">
              Employee Payrolls
            </h2>
            <div className="flex space-x-2">
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
            Object.entries(groupedEmployees).map(([jobType, employees]) => (
              <div key={jobType} className="mb-6">
                <div
                  className="flex justify-between items-center p-4 bg-default-50 border border-default-200 rounded-lg cursor-pointer"
                  onClick={() => handleToggleJobExpansion(jobType)}
                >
                  <div className="flex items-center">
                    {expandedJobs[jobType] ? (
                      <IconChevronsUp
                        size={20}
                        className="text-default-500 mr-2"
                      />
                    ) : (
                      <IconChevronsDown
                        size={20}
                        className="text-default-500 mr-2"
                      />
                    )}
                    <h3 className="font-medium">{jobType}</h3>
                    <span className="ml-2 text-sm text-default-500">
                      ({employees.length} employees)
                    </span>
                  </div>
                  <div className="text-sm text-default-600">
                    Total:{" "}
                    {formatCurrency(
                      employees.reduce(
                        (sum, emp) =>
                          sum + parseFloat(emp.gross_pay.toString()),
                        0
                      )
                    )}
                  </div>
                </div>

                {expandedJobs[jobType] && (
                  <div className="border-l border-r border-b border-default-200 rounded-b-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-default-200">
                      <thead className="bg-default-50">
                        <tr>
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
                        {employees.map((employeePayroll) => (
                          <tr
                            key={employeePayroll.id}
                            className="hover:bg-default-50"
                          >
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
                                  parseFloat(employeePayroll.net_pay.toString())
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="flex justify-end space-x-2">
                                <button
                                  onClick={() =>
                                    handleViewEmployeePayroll(
                                      employeePayroll.id
                                    )
                                  }
                                  className="text-sky-600 hover:text-sky-800"
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
            ))
          )}
        </div>
      </div>
      {/* Batch Print Modal */}
      <BatchPrintModal
        isOpen={showBatchPrintModal}
        onClose={() => setShowBatchPrintModal(false)}
        payrolls={payroll.employeePayrolls.map((ep) => ({
          ...ep,
          year: payroll.year,
          month: payroll.month,
          items: [],
        }))}
        payrollMonth={getMonthName(payroll.month)}
        payrollYear={payroll.year}
      />
      {/* Status Change Dialog */}
      <ConfirmationDialog
        isOpen={isStatusDialogOpen}
        onClose={() => setIsStatusDialogOpen(false)}
        onConfirm={handleStatusChange}
        title={`${
          payroll.status === "Completed" ? "Finalize" : "Update"
        } Payroll Status`}
        message={
          payroll.status === "Completed"
            ? "Are you sure you want to finalize this payroll? This action cannot be undone and will lock all employee payrolls."
            : `Are you sure you want to change the status from ${payroll.status} to ${newStatus}?`
        }
        confirmButtonText={isUpdatingStatus ? "Processing..." : "Confirm"}
        variant={payroll.status === "Completed" ? "danger" : "default"}
      />
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

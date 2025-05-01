// src/pages/Payroll/PayrollProcessingPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  IconArrowLeft,
  IconClock,
  IconUsers,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import BackButton from "../../components/BackButton";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  getMonthlyPayrollDetails,
  processMonthlyPayroll,
  calculateEmployeePayroll,
  saveEmployeePayroll,
} from "../../utils/payroll/payrollUtils";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  PayrollCalculationService,
  WorkLog,
  EmployeePayroll,
} from "../../utils/payroll/payrollCalculationService";
import toast from "react-hot-toast";

interface MonthlyPayroll {
  id: number;
  year: number;
  month: number;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  employeePayrolls?: any[];
}

interface EmployeeWithJobs {
  id: string;
  name: string;
  job: string[];
  section?: string;
}

const PayrollProcessingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<MonthlyPayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<
    Record<string, boolean>
  >({});
  const [processedPayrolls, setProcessedPayrolls] = useState<EmployeePayroll[]>(
    []
  );
  const [processingStatus, setProcessingStatus] = useState<
    Record<string, "pending" | "processing" | "success" | "error">
  >({});

  const { staffs } = useStaffsCache();

  // Group staff by job types for efficient processing
  const staffsByJob = useMemo(() => {
    const grouped: Record<string, EmployeeWithJobs[]> = {};

    staffs.forEach((staff) => {
      if (staff.job && Array.isArray(staff.job)) {
        staff.job.forEach((jobType) => {
          if (!grouped[jobType]) {
            grouped[jobType] = [];
          }
          grouped[jobType].push({
            id: staff.id,
            name: staff.name,
            job: staff.job,
            section:
              Array.isArray(staff.location) && staff.location.length > 0
                ? staff.location[0]
                : undefined,
          });
        });
      }
    });

    return grouped;
  }, [staffs]);

  useEffect(() => {
    fetchPayrollDetails();
  }, [id]);

  const fetchPayrollDetails = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await getMonthlyPayrollDetails(Number(id));
      setPayroll(response);

      if (response.employeePayrolls && response.employeePayrolls.length > 0) {
        // Pre-select employees who already have payrolls
        const preSelected: Record<string, boolean> = {};
        response.employeePayrolls.forEach((ep: any) => {
          preSelected[`${ep.employee_id}-${ep.job_type}`] = true;
        });
        setSelectedEmployees(preSelected);
      } else {
        // Default to selecting all employees
        const allSelected: Record<string, boolean> = {};
        Object.entries(staffsByJob).forEach(([jobType, employees]) => {
          employees.forEach((emp) => {
            allSelected[`${emp.id}-${jobType}`] = true;
          });
        });
        setSelectedEmployees(allSelected);
      }
    } catch (error) {
      console.error("Error fetching payroll details:", error);
      toast.error("Failed to load payroll details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessPayroll = async () => {
    if (!id || !payroll) return;

    setIsProcessing(true);
    try {
      // Fetch work logs for this month/year
      const processResponse = await processMonthlyPayroll(Number(id));
      setWorkLogs(processResponse.work_logs);

      if (processResponse.work_logs.length === 0) {
        toast.error("No work logs found for this month");
        setIsProcessing(false);
        return;
      }

      // Start processing for selected employees
      await processSelectedEmployees(processResponse.work_logs);

      toast.success("Payroll processing completed");
    } catch (error) {
      console.error("Error processing payroll:", error);
      toast.error("Failed to process payroll");
    } finally {
      setIsProcessing(false);
    }
  };

  const processSelectedEmployees = async (logs: WorkLog[]) => {
    if (!payroll) return;

    const selected = Object.entries(selectedEmployees)
      .filter(([_, selected]) => selected)
      .map(([key]) => {
        const [employeeId, jobType] = key.split("-");
        return { employeeId, jobType };
      });

    // Set initial processing status
    const initialStatus: Record<
      string,
      "pending" | "processing" | "success" | "error"
    > = {};
    selected.forEach(({ employeeId, jobType }) => {
      initialStatus[`${employeeId}-${jobType}`] = "pending";
    });
    setProcessingStatus(initialStatus);

    const processingResults: EmployeePayroll[] = [];

    // Process in batches to avoid locking the UI
    const batchSize = 5;
    for (let i = 0; i < selected.length; i += batchSize) {
      const batch = selected.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async ({ employeeId, jobType }) => {
          const key = `${employeeId}-${jobType}`;
          try {
            setProcessingStatus((prev) => ({ ...prev, [key]: "processing" }));

            // Find section for this employee/job
            let section = "Unknown";
            const employee = staffsByJob[jobType]?.find(
              (e) => e.id === employeeId
            );
            if (employee && employee.section) {
              section = employee.section;
            }

            // Calculate employee payroll
            const employeePayroll =
              PayrollCalculationService.processEmployeePayroll(
                logs,
                employeeId,
                jobType,
                section,
                payroll.month,
                payroll.year
              );

            // Save to the server
            await saveEmployeePayroll(payroll.id, employeePayroll);

            processingResults.push(employeePayroll);
            setProcessingStatus((prev) => ({ ...prev, [key]: "success" }));
          } catch (error) {
            console.error(`Error processing employee ${employeeId}:`, error);
            setProcessingStatus((prev) => ({ ...prev, [key]: "error" }));
          }
        })
      );

      // Small delay to allow UI updates
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    setProcessedPayrolls(processingResults);

    // Refresh payroll details to show new data
    await fetchPayrollDetails();
  };

  const toggleEmployeeSelection = (employeeId: string, jobType: string) => {
    const key = `${employeeId}-${jobType}`;
    setSelectedEmployees((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAll = (jobType: string, selected: boolean) => {
    setSelectedEmployees((prev) => {
      const newSelection = { ...prev };

      // Find all employees with this job type
      staffsByJob[jobType]?.forEach((employee) => {
        const key = `${employee.id}-${jobType}`;
        newSelection[key] = selected;
      });

      return newSelection;
    });
  };

  const getProcessingStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-default-400";
      case "processing":
        return "text-sky-500 animate-pulse";
      case "success":
        return "text-emerald-500";
      case "error":
        return "text-rose-500";
      default:
        return "text-default-400";
    }
  };

  const handleBack = () => {
    navigate("/payroll/monthly-payrolls");
  };

  const handleViewDetails = () => {
    navigate(`/payroll/monthly-payrolls/${id}`);
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

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1, 1).toLocaleString("default", {
      month: "long",
    });
  };

  return (
    <div className="relative w-full mx-4 md:mx-6 -mt-6">
      <BackButton onClick={handleBack} />

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-semibold text-default-800">
              Process Payroll: {getMonthName(payroll.month)} {payroll.year}
            </h1>
            <p className="text-sm text-default-500 mt-1">
              Select employees to include in this payroll
            </p>
          </div>
          <div className="flex space-x-3">
            <Button
              onClick={handleViewDetails}
              variant="outline"
              disabled={isProcessing}
            >
              View Summary
            </Button>
            <Button
              onClick={handleProcessPayroll}
              icon={IconClock}
              color="sky"
              variant="filled"
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Process Payroll"}
            </Button>
          </div>
        </div>

        {isProcessing ? (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <IconClock className="text-sky-500 mr-3" size={24} />
              <div>
                <h3 className="font-medium text-sky-800">Processing Payroll</h3>
                <p className="text-sm text-sky-600">
                  Please wait while employee payrolls are being calculated...
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {Object.keys(staffsByJob).length === 0 ? (
          <div className="text-center py-8 text-default-500">
            No job types or employees found. Please set up employee job
            assignments first.
          </div>
        ) : (
          <div>
            {Object.entries(staffsByJob).map(([jobType, employees]) => (
              <div key={jobType} className="mb-8">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-medium text-default-700">
                    {jobType}
                  </h2>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSelectAll(jobType, true)}
                      disabled={isProcessing}
                    >
                      Select All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSelectAll(jobType, false)}
                      disabled={isProcessing}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>

                <div className="border border-default-200 rounded-lg overflow-hidden">
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
                          ID
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Section
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Include
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {employees.map((employee) => {
                        const key = `${employee.id}-${jobType}`;
                        const isSelected = selectedEmployees[key] || false;
                        const processing = processingStatus[key] || "pending";

                        return (
                          <tr key={key} className="hover:bg-default-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-default-900">
                                {employee.name}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-default-500">
                                {employee.id}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-default-500">
                                {employee.section || "Unknown"}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  toggleEmployeeSelection(employee.id, jobType)
                                }
                                disabled={isProcessing}
                                className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500 cursor-pointer disabled:opacity-50"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {isProcessing ? (
                                <div
                                  className={`text-sm ${getProcessingStatusColor(
                                    processing
                                  )}`}
                                >
                                  {processing === "pending" && "Pending"}
                                  {processing === "processing" &&
                                    "Processing..."}
                                  {processing === "success" && "Success"}
                                  {processing === "error" && "Error"}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {processedPayrolls.length > 0 && !isProcessing && (
          <div className="mt-8 border-t border-default-200 pt-4">
            <h2 className="text-lg font-medium text-default-700 mb-3">
              Processing Summary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-default-50 rounded-lg p-4">
                <div className="flex items-center">
                  <IconUsers className="text-default-600 mr-3" size={24} />
                  <div>
                    <div className="text-sm text-default-500">
                      Employees Processed
                    </div>
                    <div className="text-xl font-semibold text-default-800">
                      {processedPayrolls.length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-default-50 rounded-lg p-4">
                <div className="flex items-center">
                  <IconCheck className="text-emerald-600 mr-3" size={24} />
                  <div>
                    <div className="text-sm text-default-500">Successful</div>
                    <div className="text-xl font-semibold text-emerald-600">
                      {
                        Object.values(processingStatus).filter(
                          (s) => s === "success"
                        ).length
                      }
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-default-50 rounded-lg p-4">
                <div className="flex items-center">
                  <IconAlertTriangle className="text-rose-600 mr-3" size={24} />
                  <div>
                    <div className="text-sm text-default-500">Errors</div>
                    <div className="text-xl font-semibold text-rose-600">
                      {
                        Object.values(processingStatus).filter(
                          (s) => s === "error"
                        ).length
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-6">
              <Button onClick={handleViewDetails} color="sky" variant="filled">
                View Payroll Details
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayrollProcessingPage;

// src/pages/Payroll/PayrollProcessingPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
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
  saveEmployeePayroll,
  getEligibleEmployees,
  getMonthName,
} from "../../utils/payroll/payrollUtils";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  PayrollCalculationService,
  WorkLog,
} from "../../utils/payroll/payrollCalculationService";
import toast from "react-hot-toast";
import EmployeeSelectionTooltip from "../../components/Payroll/EmployeeSelectionTooltip";
import { Link } from "react-router-dom";
import { EmployeePayroll } from "../../types/types";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";

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

interface EligibleEmployeesResponse {
  month: number;
  year: number;
  eligibleJobs: string[];
  jobEmployeeMap: Record<string, string[]>;
}

const PayrollProcessingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<MonthlyPayroll | null>(null);
  const [eligibleData, setEligibleData] =
    useState<EligibleEmployeesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [processedPayrolls, setProcessedPayrolls] = useState<EmployeePayroll[]>(
    []
  );
  const [processingStatus, setProcessingStatus] = useState<
    Record<string, "pending" | "processing" | "success" | "error">
  >({});

  const { jobs, loading: loadingJobs } = useJobsCache();
  const { staffs, loading: loadingStaffs } = useStaffsCache();

  useEffect(() => {
    Promise.all([fetchPayrollDetails(), fetchEligibleEmployees()])
      .then(() => {
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [id]);

  const fetchPayrollDetails = async () => {
    if (!id) return;

    try {
      const response = await getMonthlyPayrollDetails(Number(id));
      setPayroll(response);
    } catch (error) {
      console.error("Error fetching payroll details:", error);
      toast.error("Failed to load payroll details");
    }
  };

  const fetchEligibleEmployees = async () => {
    if (!id) return;

    try {
      const response = await getEligibleEmployees(Number(id));
      setEligibleData(response);

      // Initialize employee selection state with all selected
      const initialSelection: Record<string, Record<string, boolean>> = {};

      Object.entries(response.jobEmployeeMap).forEach(
        ([jobId, employeeIds]) => {
          initialSelection[jobId] = {};
          (employeeIds as string[]).forEach((empId) => {
            initialSelection[jobId][empId] = true; // All selected by default
          });
        }
      );

      setSelectedEmployees(initialSelection);
    } catch (error) {
      console.error("Error fetching eligible employees:", error);
      toast.error("Failed to load eligible employees");
    }
  };

  // Get filtered employees for a specific job
  const getEmployeesForJob = useCallback(
    (jobId: string) => {
      if (!eligibleData || !eligibleData.jobEmployeeMap[jobId]) {
        return [];
      }

      const eligibleEmployeeIds = eligibleData.jobEmployeeMap[jobId];
      return staffs
        .filter((staff) => eligibleEmployeeIds.includes(staff.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [eligibleData, staffs]
  );

  // Get job name by ID
  const getJobName = useCallback(
    (jobId: string) => {
      // Try to find a staff with this job to get the job name
      const staffWithJob = staffs.find(
        (staff) => Array.isArray(staff.job) && staff.job.includes(jobId)
      );

      if (staffWithJob) {
        // Find which job in the array matches
        const jobIndex = staffWithJob.job.indexOf(jobId);
        if (jobIndex >= 0 && Array.isArray(staffWithJob.jobType)) {
          return staffWithJob.jobType[jobIndex] || jobId;
        }
      }

      return jobId; // Fallback to ID if name not found
    },
    [staffs]
  );

  const handleProcessPayroll = async () => {
    if (!id || !payroll) return;

    setIsProcessing(true);
    try {
      // Fetch work logs for this month/year
      const processResponse = await processMonthlyPayroll(Number(id));

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
    if (!payroll || !eligibleData) return;

    // Gather all selected employee-job combinations
    const selectedCombinations: Array<{ employeeId: string; jobType: string }> =
      [];

    Object.entries(selectedEmployees).forEach(([jobId, employees]) => {
      Object.entries(employees).forEach(([empId, isSelected]) => {
        if (isSelected) {
          selectedCombinations.push({
            employeeId: empId,
            jobType: jobId,
          });
        }
      });
    });

    // Set initial processing status
    const initialStatus: Record<
      string,
      "pending" | "processing" | "success" | "error"
    > = {};

    selectedCombinations.forEach(({ employeeId, jobType }) => {
      initialStatus[`${employeeId}-${jobType}`] = "pending";
    });

    setProcessingStatus(initialStatus);

    const processingResults: EmployeePayroll[] = [];

    // Process in batches to avoid locking the UI
    const batchSize = 5;
    for (let i = 0; i < selectedCombinations.length; i += batchSize) {
      const batch = selectedCombinations.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async ({ employeeId, jobType }) => {
          const key = `${employeeId}-${jobType}`;
          try {
            setProcessingStatus((prev) => ({ ...prev, [key]: "processing" }));

            // Get section from job data
            const job = jobs.find((j) => j.id === jobType);
            const section = job?.section?.[0] || "Unknown";

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

  const handleEmployeeSelection = (
    jobId: string,
    employeeId: string,
    selected: boolean
  ) => {
    setSelectedEmployees((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        [employeeId]: selected,
      },
    }));
  };

  const handleSelectAllForJob = (jobId: string, selected: boolean) => {
    const employees = getEmployeesForJob(jobId);
    const newSelections: Record<string, boolean> = {};

    employees.forEach((emp) => {
      newSelections[emp.id] = selected;
    });

    setSelectedEmployees((prev) => ({
      ...prev,
      [jobId]: newSelections,
    }));
  };

  const handleBack = () => {
    navigate("/payroll/monthly-payrolls");
  };

  const handleViewDetails = () => {
    navigate(`/payroll/monthly-payrolls/${id}`);
  };

  if (isLoading || loadingStaffs || loadingJobs) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!payroll || !eligibleData) {
    return (
      <div className="text-center py-12">
        <p className="text-default-500">Payroll not found</p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back to List
        </Button>
      </div>
    );
  }

  // Calculate total employees eligible for processing
  const totalEligibleEmployees = Object.values(
    eligibleData.jobEmployeeMap
  ).reduce((sum, employees) => sum + employees.length, 0);

  // Calculate total selected employees
  const totalSelectedEmployees = Object.entries(selectedEmployees).reduce(
    (sum, [jobId, employees]) => {
      return sum + Object.values(employees).filter(Boolean).length;
    },
    0
  );

  return (
    <div className="relative w-full mx-4 md:mx-6 -mt-6">
      <BackButton onClick={handleBack} />

      <div className="bg-white rounded-lg border border-default-200 shadow-sm space-y-4 p-6">
        <div className="flex justify-between items-start">
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
              disabled={isProcessing || totalSelectedEmployees === 0}
            >
              {isProcessing ? "Processing..." : "Process Payroll"}
            </Button>
          </div>
        </div>

        {isProcessing ? (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
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

        {processedPayrolls.length > 0 && !isProcessing && (
          <div className="mb-8 border-b border-default-200 pb-4">
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

            <div className="flex justify-center mt-4">
              <Button onClick={handleViewDetails} color="sky" variant="filled">
                View Payroll Details
              </Button>
            </div>
          </div>
        )}

        {/* Job Types Section */}
        <div>
          {eligibleData.eligibleJobs.length === 0 ? (
            <div className="text-center py-8 text-default-500 border rounded-lg bg-default-50">
              <IconAlertTriangle className="mx-auto h-10 w-10 text-default-400 mb-2" />
              <p className="font-medium">No eligible jobs found</p>
              <p className="text-sm mt-1">
                There may be no work logs for this month.
              </p>
            </div>
          ) : (
            <div className="border border-default-200 rounded-lg overflow-hidden shadow-sm">
              <table className="min-w-full divide-y divide-default-200">
                <thead>
                  <tr className="bg-default-50">
                    <th className="px-6 py-3.5 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                      Job Type
                    </th>
                    <th className="px-6 py-3.5 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-default-200">
                  {eligibleData.eligibleJobs.map((jobId) => {
                    const employees = getEmployeesForJob(jobId);
                    const selectedCount = employees.filter(
                      (emp) => selectedEmployees[jobId]?.[emp.id]
                    ).length;

                    return (
                      <tr
                        key={jobId}
                        className="hover:bg-default-50 transition-colors duration-150"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div>
                              <div className="text-sm font-medium text-default-900">
                                <Link
                                  to={`/catalogue/job?id=${jobId}`}
                                  className="hover:text-sky-600 hover:underline"
                                >
                                  {getJobName(jobId)}
                                </Link>
                              </div>
                              <div className="text-xs text-default-500">
                                {jobId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 mt-0.5 whitespace-nowrap flex justify-end items-center">
                          <EmployeeSelectionTooltip
                            jobName={getJobName(jobId)}
                            employees={employees}
                            selectedEmployees={selectedEmployees[jobId] || {}}
                            onEmployeeSelectionChange={(employeeId, selected) =>
                              handleEmployeeSelection(
                                jobId,
                                employeeId,
                                selected
                              )
                            }
                            onSelectAll={(selected) =>
                              handleSelectAllForJob(jobId, selected)
                            }
                            disabled={isProcessing}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayrollProcessingPage;

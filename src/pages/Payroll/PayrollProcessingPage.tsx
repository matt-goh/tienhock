// src/pages/Payroll/PayrollProcessingPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  getEligibleEmployees,
  getMonthName,
} from "../../utils/payroll/payrollUtils";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import toast from "react-hot-toast";
import EmployeeSelectionTooltip from "../../components/Payroll/EmployeeSelectionTooltip";
import { Link } from "react-router-dom";
import { MonthlyPayroll } from "../../types/types";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { api } from "../../routes/utils/api";
import MissingIncomeTaxRatesDialog, {
  MissingIncomeTaxEmployee,
} from "../../components/Payroll/MissingIncomeTaxRatesDialog";

interface EligibleEmployeesResponse {
  month: number;
  year: number;
  eligibleJobs: string[];
  jobEmployeeMap: Record<string, string[]>;
}

interface ProcessingResult {
  success: boolean;
  processed_count: number;
  missing_income_tax_employees: MissingIncomeTaxEmployee[];
  errors: Array<{ employeeId: string; error: string }>;
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
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<{
    successful: number;
    errors: number;
  }>({ successful: 0, errors: 0 });
  const [processingProgress, setProcessingProgress] = useState<{
    current: number;
    total: number;
    stage: string;
  }>({ current: 0, total: 0, stage: "" });
  const [lastProcessingTime, setLastProcessingTime] = useState<number>(0);
  const [missingIncomeTaxEmployees, setMissingIncomeTaxEmployees] = useState<
    MissingIncomeTaxEmployee[]
  >([]);
  const [showMissingTaxDialog, setShowMissingTaxDialog] = useState(false);

  const { loading: loadingJobs } = useJobsCache();
  const { staffs, loading: loadingStaffs } = useStaffsCache();

  // Memoized lookup maps for performance
  const staffsMap = useMemo(() => {
    const map = new Map();
    staffs.forEach((staff) => map.set(staff.id, staff));
    return map;
  }, [staffs]);

  const jobNameMap = useMemo(() => {
    const map = new Map();
    staffs.forEach((staff) => {
      if (Array.isArray(staff.job) && Array.isArray(staff.jobType)) {
        const jobTypeArray = staff.jobType;
        staff.job.forEach((jobId, index) => {
          if (!map.has(jobId) && jobTypeArray[index]) {
            map.set(jobId, jobTypeArray[index]);
          }
        });
      }
    });
    return map;
  }, [staffs]);

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

  // Memoized employees by job map for performance
  const employeesByJobMap = useMemo(() => {
    const map = new Map();
    if (!eligibleData) return map;

    Object.entries(eligibleData.jobEmployeeMap).forEach(
      ([jobId, employeeIds]) => {
        const employees = (employeeIds as string[])
          .map((id) => staffsMap.get(id))
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name));
        map.set(jobId, employees);
      }
    );
    return map;
  }, [eligibleData, staffsMap]);

  // Get filtered employees for a specific job
  const getEmployeesForJob = useCallback(
    (jobId: string) => {
      return employeesByJobMap.get(jobId) || [];
    },
    [employeesByJobMap]
  );

  // Get job name by ID
  const getJobName = useCallback(
    (jobId: string) => {
      return jobNameMap.get(jobId) || jobId;
    },
    [jobNameMap]
  );

  const handleProcessPayroll = async () => {
    if (!id || !payroll) return;

    // Debounce processing requests (prevent multiple clicks)
    const now = Date.now();
    const DEBOUNCE_TIME = 2000; // 2 seconds
    if (now - lastProcessingTime < DEBOUNCE_TIME) {
      toast.error("Please wait before processing again");
      return;
    }

    // Prevent processing if already in progress
    if (isProcessing) {
      toast.error("Processing is already in progress");
      return;
    }

    // Early validation before processing
    if (totalSelectedEmployees === 0) {
      toast.error("Please select at least one employee to process");
      return;
    }

    if (loadingStaffs || loadingJobs) {
      toast.error("Still loading employee data. Please wait.");
      return;
    }

    setLastProcessingTime(now);
    setIsProcessing(true);
    setProcessingProgress({
      current: 0,
      total: 100,
      stage: "Preparing payroll processing...",
    });

    try {
      // Gather all selected employee-job combinations
      const selectedCombinations: Array<{ employeeId: string; jobType: string }> = [];

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

      setProcessingProgress({
        current: 20,
        total: 100,
        stage: `Processing ${selectedCombinations.length} employee-job combinations...`,
      });

      // Call the unified backend endpoint
      const response: ProcessingResult = await api.post(
        `/api/monthly-payrolls/${id}/process-all`,
        { selected_employees: selectedCombinations }
      );

      setProcessingProgress({
        current: 90,
        total: 100,
        stage: "Finalizing...",
      });

      // Update state with results
      setProcessedCount(response.processed_count);
      setProcessingStatus({
        successful: response.processed_count - response.errors.length,
        errors: response.errors.length,
      });

      // Handle missing income tax rates
      if (response.missing_income_tax_employees && response.missing_income_tax_employees.length > 0) {
        setMissingIncomeTaxEmployees(response.missing_income_tax_employees);
        setShowMissingTaxDialog(true);
      }

      setProcessingProgress({
        current: 100,
        total: 100,
        stage: "Processing completed!",
      });

      // Show summary toast
      if (response.errors.length > 0) {
        toast.error(
          `Processing completed with ${response.errors.length} errors out of ${response.processed_count} employees`
        );
      } else {
        toast.success(`Successfully processed ${response.processed_count} employees`);
      }

      // Refresh payroll details to show new data
      await fetchPayrollDetails();

    } catch (error) {
      console.error("Error processing payroll:", error);
      toast.error("Failed to process payroll");
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0, stage: "" });
    }
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

    employees.forEach((emp: { id: string | number }) => {
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
    navigate("/payroll/monthly-payrolls");
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

  // Calculate total selected employees
  const totalSelectedEmployees = Object.entries(selectedEmployees).reduce(
    (sum, [, employees]) => {
      return sum + Object.values(employees).filter(Boolean).length;
    },
    0
  );

  return (
    <div className="relative w-full mx-4 md:mx-6">
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
            <div className="flex items-center mb-3">
              <IconClock className="text-sky-500 mr-3" size={24} />
              <div className="flex-1">
                <h3 className="font-medium text-sky-800">Processing Payroll</h3>
                <p className="text-sm text-sky-600">
                  {processingProgress.stage ||
                    "Please wait while employee payrolls are being calculated..."}
                </p>
              </div>
            </div>
            {processingProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-sky-600">
                  <span>Progress</span>
                  <span>{processingProgress.current}%</span>
                </div>
                <div className="w-full bg-sky-200 rounded-full h-2">
                  <div
                    className="bg-sky-500 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${processingProgress.current}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {processedCount > 0 && !isProcessing && (
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
                      {processedCount}
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
                      {processingStatus.successful}
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
                      {processingStatus.errors}
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

      {/* Missing Income Tax Rates Dialog */}
      <MissingIncomeTaxRatesDialog
        isOpen={showMissingTaxDialog}
        onClose={() => setShowMissingTaxDialog(false)}
        employees={missingIncomeTaxEmployees}
      />
    </div>
  );
};

export default PayrollProcessingPage;

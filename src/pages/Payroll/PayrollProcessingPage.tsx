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
  processMonthlyPayroll,
  saveEmployeePayrollsBatch,
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
import { EmployeePayroll, MonthlyPayroll } from "../../types/types";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useContributionRatesCache } from "../../utils/payroll/useContributionRatesCache";
import { api } from "../../routes/utils/api";
import MissingIncomeTaxRatesDialog, {
  MissingIncomeTaxEmployee,
} from "../../components/Payroll/MissingIncomeTaxRatesDialog";
import { findIncomeTaxRate } from "../../utils/payroll/contributionCalculations";

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

  const { jobs, loading: loadingJobs } = useJobsCache();
  const { staffs, loading: loadingStaffs } = useStaffsCache();
  const { epfRates, socsoRates, sipRates, incomeTaxRates } =
    useContributionRatesCache();

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
        const jobTypeArray = staff.jobType; // Ensures TS knows it's an array
        staff.job.forEach((jobId, index) => {
          if (!map.has(jobId) && jobTypeArray[index]) {
            map.set(jobId, jobTypeArray[index]);
          }
        });
      }
    });
    return map;
  }, [staffs]);

  // Memoized jobs map for O(1) lookups during processing
  const jobsMap = useMemo(() => {
    const map = new Map();
    jobs.forEach((job) => map.set(job.id, job));
    return map;
  }, [jobs]);

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
      return jobNameMap.get(jobId) || jobId; // Fallback to ID if name not found
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

    if (!epfRates.length || !socsoRates.length || !incomeTaxRates.length) {
      toast.error("Contribution rates not loaded. Please refresh the page.");
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
      stage: "Validating data and fetching work logs...",
    });

    try {
      // Fetch work logs for this month/year
      const processResponse = await processMonthlyPayroll(Number(id));

      // Combine daily and monthly work logs
      const allWorkLogs = [
        ...(processResponse.daily_work_logs || []),
        ...(processResponse.monthly_work_logs || []),
      ];

      if (allWorkLogs.length === 0) {
        toast.error("No work logs found for this month");
        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0, stage: "" });
        return;
      }

      setProcessingProgress({
        current: 20,
        total: 100,
        stage: "Processing employee payrolls...",
      });

      // Start processing for selected employees
      await processSelectedEmployees(allWorkLogs);

      toast.success("Payroll processing completed");
    } catch (error) {
      console.error("Error processing payroll:", error);
      toast.error("Failed to process payroll");
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0, stage: "" });
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

    // Group employees by name to combine payrolls for same-named employees
    const employeesByName = new Map<
      string,
      Array<{ employeeId: string; jobType: string }>
    >();

    selectedCombinations.forEach(({ employeeId, jobType }) => {
      const employee = staffsMap.get(employeeId);
      if (employee) {
        const employeeName = employee.name;
        if (!employeesByName.has(employeeName)) {
          employeesByName.set(employeeName, []);
        }
        employeesByName.get(employeeName)!.push({ employeeId, jobType });
      }
    });

    // Set initial processing status (batched update)
    const initialStatus: Record<
      string,
      "pending" | "processing" | "success" | "error"
    > = {};

    selectedCombinations.forEach(({ employeeId, jobType }) => {
      initialStatus[`${employeeId}-${jobType}`] = "processing";
    });

    setProcessingStatus(initialStatus);

    // Threshold for income tax (RM 3000)
    const INCOME_TAX_THRESHOLD = 3000;
    const employeesMissingTaxRates: MissingIncomeTaxEmployee[] = [];

    try {
      // Calculate payrolls for all grouped employees
      const employeePayrolls: EmployeePayroll[] = [];
      const calculationErrors: Record<string, "error"> = {};

      setProcessingProgress({
        current: 30,
        total: 100,
        stage: `Calculating payrolls for ${employeesByName.size} grouped employees (${selectedCombinations.length} total jobs)...`,
      });

      // Process each group of employees with the same name
      employeesByName.forEach((employeeJobCombos, employeeName) => {
        try {
          // Use the first employee's data as the primary record
          const primaryEmployee = employeeJobCombos[0];
          const primaryEmployeeData = staffsMap.get(primaryEmployee.employeeId);

          if (!primaryEmployeeData) {
            console.error(
              `Primary employee data not found for ${primaryEmployee.employeeId}`
            );
            return;
          }

          // Combine all work logs from all employee IDs with the same name
          const allPayrollItemArrays: any[][] = [];
          let combinedSection = "";

          employeeJobCombos.forEach(({ employeeId, jobType }) => {
            // Get section from job data (O(1) lookup instead of O(n) find)
            const job = jobsMap.get(jobType);
            const section = job?.section?.[0] || "Unknown";
            if (!combinedSection) combinedSection = section;

            // Calculate individual employee payroll for this job
            const individualPayroll =
              PayrollCalculationService.processEmployeePayroll(
                logs,
                employeeId,
                jobType,
                section,
                payroll.month,
                payroll.year
              );

            // Add this job's payroll items to the array for merging
            allPayrollItemArrays.push(individualPayroll.items);
          });

          // Merge all payroll items, combining duplicates
          const combinedPayrollItems =
            PayrollCalculationService.mergePayrollItems(allPayrollItemArrays);

          // Now calculate combined payroll with deductions using the primary employee's data
          // but with the combined gross pay from all jobs
          const combinedGrossPay = combinedPayrollItems.reduce(
            (sum, item) => sum + item.amount,
            0
          );

          // Check if employee is subject to income tax but missing rate
          if (combinedGrossPay > INCOME_TAX_THRESHOLD) {
            const incomeTaxRate = findIncomeTaxRate(incomeTaxRates, combinedGrossPay);
            if (!incomeTaxRate) {
              // Employee is subject to income tax but no rate recorded
              employeesMissingTaxRates.push({
                employeeId: primaryEmployee.employeeId,
                employeeName: employeeName,
                grossPay: Number(combinedGrossPay.toFixed(2)),
              });
            }
          }

          // Calculate deductions for the combined gross pay
          const deductions = PayrollCalculationService.calculateContributions(
            combinedPayrollItems,
            primaryEmployee.employeeId,
            staffs,
            epfRates,
            socsoRates,
            sipRates,
            incomeTaxRates
          );

          // Calculate total employee deductions
          const totalEmployeeDeductions = deductions.reduce(
            (sum, deduction) => sum + deduction.employee_amount,
            0
          );

          // Create the grouped payroll record
          const groupedPayroll: EmployeePayroll & { 
            deductions: any[];
            grouped_employee_ids?: string[];
          } = {
            employee_id: primaryEmployee.employeeId, // Use primary employee ID
            employee_name: employeeName, // Use the grouped name
            job_type: employeeJobCombos
              .map((combo) => combo.jobType)
              .join(", "), // Show all job types
            section: combinedSection,
            gross_pay: Number(combinedGrossPay.toFixed(2)),
            net_pay: Number(
              (combinedGrossPay - totalEmployeeDeductions).toFixed(2)
            ),
            items: combinedPayrollItems,
            deductions,
            // Store all employee IDs in this group for commission retrieval
            grouped_employee_ids: employeeJobCombos.map(combo => combo.employeeId),
          };

          employeePayrolls.push(groupedPayroll);
        } catch (error) {
          console.error(
            `Error calculating grouped payroll for ${employeeName}:`,
            error
          );
          // Mark all jobs for this employee group as error
          employeeJobCombos.forEach(({ employeeId, jobType }) => {
            const key = `${employeeId}-${jobType}`;
            calculationErrors[key] = "error";
          });
        }
      });

      // Batch update calculation errors
      if (Object.keys(calculationErrors).length > 0) {
        setProcessingStatus((prev) => ({ ...prev, ...calculationErrors }));
      }

      // First, clear any existing payroll records for this monthly payroll to avoid duplicates
      setProcessingProgress({
        current: 60,
        total: 100,
        stage: "Clearing existing payroll records...",
      });

      try {
        await api.delete(`/api/employee-payrolls/monthly/${payroll.id}`);
      } catch (error) {
        console.warn("Could not clear existing payroll records (might be first time processing):", error);
        // Continue processing even if clear fails - might be first time processing
      }

      // Process payrolls in chunks to avoid large database operations
      const CHUNK_SIZE = 50; // Process 50 employees at a time
      const chunks = [];
      for (let i = 0; i < employeePayrolls.length; i += CHUNK_SIZE) {
        chunks.push(employeePayrolls.slice(i, i + CHUNK_SIZE));
      }

      let allResults: any[] = [];
      let allErrors: any[] = [];
      let processedCount = 0;

      // Process each chunk
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const baseProgress = 70 + (chunkIndex / chunks.length) * 25; // 70% to 95%

        // Show progress at start of chunk
        setProcessingProgress({
          current: Math.round(baseProgress),
          total: 100,
          stage: `Saving batch ${chunkIndex + 1}/${chunks.length} (${
            processedCount + chunk.length
          }/${employeePayrolls.length} employees)...`,
        });

        try {
          // Show mid-chunk progress during database operation
          const midProgress = baseProgress + (25 / chunks.length) * 0.5;
          setProcessingProgress({
            current: Math.round(midProgress),
            total: 100,
            stage: `Processing batch ${chunkIndex + 1}/${
              chunks.length
            } - saving to database...`,
          });

          const chunkResponse = await saveEmployeePayrollsBatch(
            payroll.id,
            chunk
          );

          // Show completion progress for this chunk
          const completeProgress = 70 + ((chunkIndex + 1) / chunks.length) * 25;
          setProcessingProgress({
            current: Math.round(completeProgress),
            total: 100,
            stage: `Batch ${chunkIndex + 1}/${chunks.length} completed - ${
              processedCount + chunk.length
            }/${employeePayrolls.length} employees processed`,
          });

          // Collect results from this chunk
          if (chunkResponse.results) {
            allResults.push(...chunkResponse.results);
          }
          if (chunkResponse.errors) {
            allErrors.push(...chunkResponse.errors);
          }

          processedCount += chunk.length;

          // Small delay to prevent overwhelming the database
          if (chunkIndex < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`Error processing chunk ${chunkIndex + 1}:`, error);
          // Mark all employees in this chunk as errors
          chunk.forEach((payroll) => {
            allErrors.push({
              employee_id: payroll.employee_id,
              job_type: payroll.job_type,
              error: (error as Error).message || "Failed to save",
            });
          });
        }
      }

      // Combine all chunk responses into a single response format
      const batchResponse = {
        results: allResults,
        errors: allErrors,
        summary: {
          total: employeePayrolls.length,
          successful: allResults.length,
          errors: allErrors.length,
        },
      };

      // Update processing status based on batch response (batched update)
      const statusUpdates: Record<string, "success" | "error"> = {};

      if (batchResponse.results) {
        batchResponse.results.forEach((result: any) => {
          const key = `${result.employee_id}-${result.job_type}`;
          statusUpdates[key] = "success";
        });
      }

      if (batchResponse.errors) {
        batchResponse.errors.forEach((error: any) => {
          const key = `${error.employee_id}-${error.job_type}`;
          statusUpdates[key] = "error";
        });
      }

      // Single batched status update
      if (Object.keys(statusUpdates).length > 0) {
        setProcessingStatus((prev) => ({ ...prev, ...statusUpdates }));
      }

      setProcessedPayrolls(employeePayrolls);

      setProcessingProgress({
        current: 100,
        total: 100,
        stage: "Processing completed!",
      });

      // Show batch processing summary
      const {
        successful = 0,
        errors: errorCount = 0,
        total = 0,
      } = batchResponse.summary || {};
      if (errorCount > 0) {
        toast.error(
          `Processing completed with ${errorCount} errors out of ${total} employees`
        );
      } else {
        toast.success(`Successfully processed ${successful} employees`);
      }

      // Show dialog if there are employees missing income tax rates
      if (employeesMissingTaxRates.length > 0) {
        setMissingIncomeTaxEmployees(employeesMissingTaxRates);
        setShowMissingTaxDialog(true);
      }
    } catch (error) {
      console.error("Error in batch processing:", error);
      // Mark all as error if batch processing fails (batched update)
      const errorUpdates: Record<string, "error"> = {};
      selectedCombinations.forEach(({ employeeId, jobType }) => {
        const key = `${employeeId}-${jobType}`;
        errorUpdates[key] = "error";
      });
      setProcessingStatus((prev) => ({ ...prev, ...errorUpdates }));
      toast.error("Failed to process employee payrolls");
    }

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

  // Calculate total selected employees
  const totalSelectedEmployees = Object.entries(selectedEmployees).reduce(
    (sum, [jobId, employees]) => {
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
                      (emp: { id: string | number }) =>
                        selectedEmployees[jobId]?.[emp.id]
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

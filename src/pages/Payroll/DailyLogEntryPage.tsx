// src/pages/Payroll/DailyLogEntryPage.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import { format } from "date-fns";
import LoadingSpinner from "../../components/LoadingSpinner";
import Checkbox from "../../components/Checkbox";
import ManageActivitiesModal from "../../components/Payroll/ManageActivitiesModal";
import ActivitiesTooltip from "../../components/Payroll/ActivitiesTooltip";
import toast from "react-hot-toast";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { api } from "../../routes/utils/api";
import { useHolidayCache } from "../../utils/payroll/useHolidayCache";
import {
  getJobConfig,
  getContextLinkedPayCodes,
  getJobIds,
} from "../../configs/payrollJobConfigs";
import DynamicContextForm from "../../components/Payroll/DynamicContextForm";
import {
  calculateActivityAmount,
  calculateActivitiesAmounts,
} from "../../utils/payroll/calculateActivityAmount";

interface EmployeeWithHours extends Employee {
  rowKey?: string; // Unique key for each row
  jobName?: string; // Job name for display purposes
  jobType?: string; // Specific job type for this row
  hours?: number;
  selected?: boolean;
  selectedJobs?: string[]; // Track which jobs are selected for this employee
  jobHours?: { [jobType: string]: number }; // Track hours for each job type
}

interface DailyLogFormData {
  logDate: string;
  shift: string;
  contextData: {
    totalBags?: number;
    [key: string]: any;
  };
  dayType: "Biasa" | "Ahad" | "Umum";
  employees: EmployeeWithHours[];
}

interface DailyLogEntryPageProps {
  mode?: "create" | "edit";
  existingWorkLog?: any;
  onCancel?: () => void;
  jobType?: string;
}

const DailyLogEntryPage: React.FC<DailyLogEntryPageProps> = ({
  mode = "create",
  existingWorkLog,
  onCancel,
  jobType = "MEE",
}) => {
  const navigate = useNavigate();
  const { jobs: allJobs, loading: loadingJobs } = useJobsCache();
  const { staffs: allStaffs, loading: loadingStaffs } = useStaffsCache();
  const [employeeSelectionState, setEmployeeSelectionState] = useState<{
    selectedJobs: Record<string, string[]>; // employeeId -> list of selected jobIds
    jobHours: Record<string, Record<string, number>>; // employeeId -> jobId -> hours
  }>({
    selectedJobs: {},
    jobHours: {},
  });
  const [showActivitiesModal, setShowActivitiesModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeWithHours | null>(null);
  const [employeeActivities, setEmployeeActivities] = useState<
    Record<string, any[]>
  >({});

  const { isHoliday, getHolidayDescription, holidays } = useHolidayCache();

  const JOB_IDS = getJobIds(jobType);

  // Get job configuration
  const jobConfig = getJobConfig(jobType);
  const contextLinkedPayCodes = jobConfig
    ? getContextLinkedPayCodes(jobConfig)
    : {};

  // Helper function to determine day type based on date
  const determineDayType = (date: Date): "Biasa" | "Ahad" | "Umum" => {
    // Check if it's a holiday first
    if (isHoliday(date)) return "Umum";

    // Then check if it's Sunday
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return "Ahad";

    return "Biasa";
  };

  // Initialize form data with dynamic context fields
  const [formData, setFormData] = useState<DailyLogFormData>(() => {
    if (mode === "edit" && existingWorkLog) {
      return {
        logDate: existingWorkLog.log_date.split("T")[0],
        shift: existingWorkLog.shift.toString(),
        contextData: existingWorkLog.context_data || {},
        dayType: existingWorkLog.day_type,
        employees: [],
      };
    }

    // Initialize with default values from config
    const defaultContextData: Record<string, any> = {};
    jobConfig?.contextFields.forEach((field) => {
      defaultContextData[field.id] = field.defaultValue;
    });

    return {
      logDate: format(new Date(), "yyyy-MM-dd"),
      shift: "1",
      contextData: defaultContextData,
      dayType: determineDayType(new Date()),
      employees: [],
    };
  });
  const {
    employeeMappings,
    detailedMappings: jobPayCodeDetails,
    loading: loadingPayCodeMappings,
  } = useJobPayCodeMappings();
  const [isSaving, setIsSaving] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  // Update activities when context values change for linked pay codes
  useEffect(() => {
    if (!jobConfig) return;

    // For each context field that has a linked pay code
    jobConfig.contextFields.forEach((field) => {
      if (field.linkedPayCode) {
        const contextValue = formData.contextData[field.id];

        // Update all employee activities for this pay code
        setEmployeeActivities((prev) => {
          const updatedActivities = { ...prev };

          Object.keys(updatedActivities).forEach((rowKey) => {
            // First update the units for context-linked activities
            const updatedRowActivities = updatedActivities[rowKey].map(
              (activity) => {
                if (activity.payCodeId === field.linkedPayCode) {
                  // Auto-update units for context-linked pay codes
                  return {
                    ...activity,
                    unitsProduced: contextValue || 0,
                    isContextLinked: true,
                  };
                }
                return activity;
              }
            );

            // Get the employee's hours for this row
            const [employeeId, jobType] = rowKey.split("-");
            const hours =
              employeeSelectionState.jobHours[employeeId]?.[jobType] || 0;

            // Then recalculate all activities using our centralized function
            updatedActivities[rowKey] = calculateActivitiesAmounts(
              updatedRowActivities,
              hours,
              formData.contextData
            );
          });

          return updatedActivities;
        });
      }
    });
  }, [formData.contextData, jobConfig, employeeSelectionState.jobHours]);

  // Update the jobs filter based on dynamic configuration
  const jobs = useMemo(() => {
    return allJobs
      .filter((job) => JOB_IDS.includes(job.id))
      .map((job) => ({
        id: job.id,
        name: job.name,
        section: job.section,
      }));
  }, [allJobs, JOB_IDS]);

  // Update available employees based on dynamic job types
  const availableEmployees = useMemo(() => {
    return allStaffs
      .filter((staff) => {
        if (!staff.job || !Array.isArray(staff.job)) return false;
        return staff.job.some((jobId: string) => JOB_IDS.includes(jobId));
      })
      .map((staff) => ({
        ...staff,
        hours: jobConfig?.defaultHours || 7,
      }));
  }, [allStaffs, JOB_IDS, jobConfig]);

  const expandedEmployees = useMemo(() => {
    const expanded: Array<
      EmployeeWithHours & { jobType: string; jobName: string }
    > = [];

    availableEmployees.forEach((employee) => {
      // Filter to only include job types from the current job configuration
      const configJobs = (employee.job || []).filter((jobId: string) =>
        JOB_IDS.includes(jobId)
      );

      // Create a row for each job type this employee has
      configJobs.forEach((jobId: any) => {
        const jobName = jobs.find((j) => j.id === jobId)?.name || jobId;

        expanded.push({
          ...employee,
          jobType: jobId,
          jobName,
          rowKey: `${employee.id}-${jobId}`,
        });
      });
    });

    // Sort by employee name first, then job name
    return expanded.sort((a, b) => {
      const jobCompare = (a.jobName || "").localeCompare(b.jobName || "");
      if (jobCompare !== 0) return jobCompare;
      return a.name.localeCompare(b.name);
    });
  }, [availableEmployees, jobs, JOB_IDS]);

  // Update day type when date changes
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    const newDayType = determineDayType(newDate);

    setFormData({
      ...formData,
      logDate: e.target.value,
      dayType: newDayType,
    });
  };

  useEffect(() => {
    if (formData.logDate) {
      const currentDate = new Date(formData.logDate);
      const newDayType = determineDayType(currentDate);

      if (newDayType !== formData.dayType) {
        setFormData((prev) => ({
          ...prev,
          dayType: newDayType,
        }));
      }

      // Validate required context fields
      if (jobConfig) {
        const requiredContextFields = jobConfig.contextFields.filter(
          (field) => field.required
        );
        for (const field of requiredContextFields) {
          const value = formData.contextData[field.id];
          if (value === undefined || value === null || value === "") {
            toast.error(`${field.label} is required`);
            return;
          }
        }
      }
    }
  }, [holidays, formData.logDate]);

  // Handle hours blur event
  const handleHoursBlur = (rowKey: string | undefined) => {
    if (!rowKey) return;

    // Recalculate activities when hours change
    fetchAndApplyActivities();
  };

  // Handle context data changes
  const handleContextChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      contextData: {
        ...prev.contextData,
        [fieldId]: value,
      },
    }));
  };

  const handleBack = () => {
    navigate(`/payroll/${jobType.toLowerCase()}-production`);
  };

  // Toggle employee selection by employee+job combination
  const handleEmployeeSelection = (rowKey: string | undefined) => {
    if (!rowKey) return;

    const [employeeId, jobType] = rowKey.split("-");

    setEmployeeSelectionState((prev) => {
      const currentSelectedJobs = prev.selectedJobs[employeeId] || [];
      const isSelected = currentSelectedJobs.includes(jobType);

      return {
        ...prev,
        selectedJobs: {
          ...prev.selectedJobs,
          [employeeId]: isSelected
            ? currentSelectedJobs.filter((j) => j !== jobType)
            : [...currentSelectedJobs, jobType],
        },
      };
    });
  };

  // Update employee hours by employee+job combination
  const handleEmployeeHoursChange = (
    rowKey: string | undefined,
    hours: string
  ) => {
    if (!rowKey) return;

    const [employeeId, jobType] = rowKey.split("-");
    const hoursNum = hours === "" ? 0 : parseFloat(hours);

    setEmployeeSelectionState((prev) => {
      return {
        ...prev,
        jobHours: {
          ...prev.jobHours,
          [employeeId]: {
            ...(prev.jobHours[employeeId] || {}),
            [jobType]: hoursNum,
          },
        },
      };
    });
  };

  const handleManageActivities = (employee: EmployeeWithHours) => {
    setSelectedEmployee(employee);
    setShowActivitiesModal(true);
  };

  const handleSaveForm = async () => {
    // Validate form
    if (!formData.logDate) {
      toast.error("Please select a date");
      return;
    }

    // Get all selected employees with their hours
    const selectedEmployeeData = Object.entries(
      employeeSelectionState.selectedJobs
    ).flatMap(([employeeId, jobTypes]) => {
      return jobTypes.map((jobType) => {
        const hours =
          employeeSelectionState.jobHours[employeeId]?.[jobType] || 0;
        const rowKey = `${employeeId}-${jobType}`;
        const activities = employeeActivities[rowKey] || [];

        return {
          employeeId,
          jobType,
          hours,
          activities,
        };
      });
    });

    if (selectedEmployeeData.length === 0) {
      toast.error("No employees selected");
      return;
    }

    const section = jobConfig?.section?.[0];

    // Build the payload
    const payload = {
      logDate: formData.logDate,
      shift: formData.shift,
      dayType: formData.dayType,
      section: section,
      contextData: formData.contextData,
      status: "Submitted",
      employeeEntries: selectedEmployeeData,
    };

    setIsSaving(true);

    try {
      if (mode === "edit" && existingWorkLog) {
        await api.put(`/api/daily-work-logs/${existingWorkLog.id}`, payload);
        toast.success("Work log updated successfully");
      } else {
        await api.post("/api/daily-work-logs", payload);
        toast.success("Work log submitted successfully");
      }
      navigate(`/payroll/${jobType.toLowerCase()}-production`);
    } catch (error: any) {
      console.error("Error saving work log:", error);
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save work log"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const initializeDefaultSelections = useCallback(() => {
    if (!loadingStaffs && !loadingJobs && expandedEmployees.length > 0) {
      // Create a new selection state that selects all employees
      const newSelectedJobs: Record<string, string[]> = {};
      const newJobHours: Record<string, Record<string, number>> = {};

      expandedEmployees.forEach((employee) => {
        const employeeId = employee.id;
        const jobType = employee.jobType;

        // Initialize the arrays if they don't exist yet
        if (!newSelectedJobs[employeeId]) {
          newSelectedJobs[employeeId] = [];
        }
        if (!newJobHours[employeeId]) {
          newJobHours[employeeId] = {};
        }

        // Add this job to the employee's selected jobs
        newSelectedJobs[employeeId].push(jobType);

        // Set default hours (7 hours) for this job
        newJobHours[employeeId][jobType] = 7;
      });

      // Update the state with all employees selected
      setEmployeeSelectionState({
        selectedJobs: newSelectedJobs,
        jobHours: newJobHours,
      });
    }
  }, [expandedEmployees, loadingStaffs, loadingJobs]);

  // Handle select all/deselect all employees
  const handleSelectAll = () => {
    setEmployeeSelectionState((prev) => {
      if (selectAll) {
        // Deselect all - clear only the selections, not the hours
        return {
          selectedJobs: {}, // Clear selections
          jobHours: { ...prev.jobHours }, // Preserve hours
        };
      } else {
        // Select all employees with default hours
        const newSelectedJobs: Record<string, string[]> = {};
        const newJobHours: Record<string, Record<string, number>> = {
          ...prev.jobHours,
        };

        expandedEmployees.forEach((employee) => {
          const employeeId = employee.id;
          const jobType = employee.jobType;

          if (!newSelectedJobs[employeeId]) {
            newSelectedJobs[employeeId] = [];
          }
          if (!newJobHours[employeeId]) {
            newJobHours[employeeId] = {};
          }

          newSelectedJobs[employeeId].push(jobType);

          // Only set hours if they're not already set
          if (!newJobHours[employeeId][jobType]) {
            newJobHours[employeeId][jobType] = 7; // Default hours
          }
        });

        return {
          selectedJobs: newSelectedJobs,
          jobHours: newJobHours,
        };
      }
    });

    setSelectAll(!selectAll);
  };

  // Update select all state based on individual selections
  useEffect(() => {
    const totalRows = expandedEmployees.length;
    const selectedRows = Object.entries(
      employeeSelectionState.selectedJobs
    ).flatMap(([_, jobTypes]) => jobTypes).length;

    setSelectAll(totalRows > 0 && totalRows === selectedRows);
  }, [employeeSelectionState.selectedJobs, expandedEmployees]);

  // Use a one-time initialization effect
  const initializedRef = useRef(false);
  useEffect(() => {
    if (
      !initializedRef.current &&
      !loadingStaffs &&
      !loadingJobs &&
      expandedEmployees.length > 0 &&
      mode === "create"
    ) {
      initializedRef.current = true;
      initializeDefaultSelections();
    }
  }, [
    expandedEmployees,
    loadingStaffs,
    loadingJobs,
    initializeDefaultSelections,
    mode,
  ]);

  useEffect(() => {
    if (
      mode === "edit" &&
      existingWorkLog &&
      !loadingStaffs &&
      !loadingJobs &&
      !loadingPayCodeMappings
    ) {
      // Restore selection state for employees
      const newSelectedJobs: Record<string, string[]> = {};
      const newJobHours: Record<string, Record<string, number>> = {};
      const newEmployeeActivities: Record<string, any[]> = {};

      existingWorkLog.employeeEntries.forEach((entry: any) => {
        const employeeId = entry.employee_id;
        const jobId = entry.job_id;

        if (!newSelectedJobs[employeeId]) {
          newSelectedJobs[employeeId] = [];
        }
        newSelectedJobs[employeeId].push(jobId);

        if (!newJobHours[employeeId]) {
          newJobHours[employeeId] = {};
        }
        newJobHours[employeeId][jobId] = parseFloat(entry.total_hours);

        const rowKey = `${employeeId}-${jobId}`;

        // Get all possible pay codes for this job
        const jobPayCodes = jobPayCodeDetails[jobId] || [];

        // Create a map of existing activities for quick lookup
        const existingActivityMap = new Map<string, any>();
        entry.activities.forEach((activity: any) => {
          existingActivityMap.set(activity.pay_code_id, activity);
        });

        // Map all pay codes, marking the ones that were selected
        newEmployeeActivities[rowKey] = jobPayCodes.map((payCode) => {
          const existingActivity = existingActivityMap.get(payCode.id);

          if (existingActivity) {
            // This was a selected activity
            return {
              payCodeId: existingActivity.pay_code_id,
              description: existingActivity.description || payCode.description,
              payType: existingActivity.pay_type || payCode.pay_type,
              rateUnit: existingActivity.rate_unit || payCode.rate_unit,
              rate: existingActivity.rate_used || payCode.rate_biasa,
              isSelected: true,
              calculatedAmount: existingActivity.calculated_amount,
              unitsProduced: existingActivity.units_produced,
            };
          } else {
            // This was not selected
            return {
              payCodeId: payCode.id,
              description: payCode.description,
              payType: payCode.pay_type,
              rateUnit: payCode.rate_unit,
              rate: payCode.rate_biasa,
              isSelected: false,
              calculatedAmount: 0,
              unitsProduced: payCode.requires_units_input ? 0 : null,
            };
          }
        });
      });

      setEmployeeSelectionState({
        selectedJobs: newSelectedJobs,
        jobHours: newJobHours,
      });
      setEmployeeActivities(newEmployeeActivities);
    }
  }, [
    mode,
    existingWorkLog,
    availableEmployees,
    loadingStaffs,
    loadingJobs,
    loadingPayCodeMappings,
    jobPayCodeDetails,
  ]);

  // Separate effect for fetching activities after selection changes
  useEffect(() => {
    if (
      Object.keys(employeeSelectionState.selectedJobs).length > 0 &&
      !loadingPayCodeMappings &&
      mode !== "edit" // Don't run this in edit mode if activities are already loaded
    ) {
      fetchAndApplyActivities();
    }
  }, [
    employeeSelectionState.selectedJobs,
    employeeSelectionState.jobHours,
    formData.dayType,
    loadingPayCodeMappings,
    mode,
  ]);

  const fetchAndApplyActivities = () => {
    // Skip if we're in edit mode and have already loaded activities
    if (mode === "edit" && Object.keys(employeeActivities).length > 0) {
      return;
    }

    // Get all unique job types from selected employees
    const jobTypes = Array.from(
      new Set(
        Object.entries(employeeSelectionState.selectedJobs).flatMap(
          ([_, jobTypes]) => jobTypes
        )
      )
    );

    if (jobTypes.length === 0) return;

    // Apply activities for each employee/job combination using cached data
    const newEmployeeActivities: Record<string, any[]> = {};

    Object.entries(employeeSelectionState.selectedJobs).forEach(
      ([employeeId, jobTypes]) => {
        jobTypes.forEach((jobType) => {
          const rowKey = `${employeeId}-${jobType}`;
          const hours =
            employeeSelectionState.jobHours[employeeId]?.[jobType] || 0;

          // Get job pay codes from cache
          const jobPayCodes = jobPayCodeDetails[jobType] || [];

          // Get employee-specific pay codes from cache
          const employeePayCodes = employeeMappings[employeeId] || [];

          // Create a map of job pay codes by ID for easy lookup
          const jobPayCodeMap = new Map(jobPayCodes.map((pc) => [pc.id, pc]));

          // Merge pay codes, prioritizing employee-specific ones
          const allPayCodes = new Map();

          // First add job pay codes
          jobPayCodes.forEach((pc) => {
            allPayCodes.set(pc.id, { ...pc, source: "job" });
          });

          // Then add/override with employee-specific pay codes
          employeePayCodes.forEach((pc) => {
            allPayCodes.set(pc.id, { ...pc, source: "employee" });
          });

          // Convert map back to array
          const mergedPayCodes = Array.from(allPayCodes.values());

          // Check if we already have activities for this employee/job
          const existingActivities = employeeActivities[rowKey] || [];

          // Filter pay codes based on hours
          const filteredPayCodes =
            hours > 8
              ? mergedPayCodes // If overtime, include all pay codes
              : mergedPayCodes.filter(
                  (pc) => pc.pay_type === "Base" || pc.pay_type === "Tambahan"
                ); // Otherwise, only Base and Tambahan

          const activities = filteredPayCodes.map((payCode) => {
            // Check if this activity already exists
            const existingActivity = existingActivities.find(
              (a) => a.payCodeId === payCode.id
            );

            // Determine rate based on day type
            let rate = 0;
            if (formData.dayType === "Ahad") {
              rate =
                payCode.override_rate_ahad !== null
                  ? payCode.override_rate_ahad
                  : payCode.rate_ahad;
            } else if (formData.dayType === "Umum") {
              rate =
                payCode.override_rate_umum !== null
                  ? payCode.override_rate_umum
                  : payCode.rate_umum;
            } else {
              rate =
                payCode.override_rate_biasa !== null
                  ? payCode.override_rate_biasa
                  : payCode.rate_biasa;
            }

            // Check if this pay code is linked to a context field
            const contextField = contextLinkedPayCodes[payCode.id];
            const isContextLinked = !!contextField;

            // For overtime pay codes, determine if they should be auto-selected
            const isOvertimeCode = payCode.pay_type === "Overtime";
            const shouldAutoSelect = isOvertimeCode && hours > 8;

            // For context-linked pay codes or Bag rate units, don't auto-select
            let isSelected = existingActivity
              ? existingActivity.isSelected
              : isContextLinked ||
                payCode.rate_unit === "Bag" ||
                payCode.rate_unit === "Trip" ||
                payCode.rate_unit === "Day" ||
                payCode.pay_type === "Tambahan"
              ? false // Don't auto-select context-linked pay codes or Bag rate units
              : shouldAutoSelect || payCode.is_default_setting;

            // For context-linked pay codes, use context value as units
            const unitsProduced = isContextLinked
              ? formData.contextData[contextField.id] || 0
              : existingActivity
              ? existingActivity.unitsProduced
              : payCode.requires_units_input
              ? 0
              : null;

            // After creating the activity object, calculate the amount using the shared function
            return {
              payCodeId: payCode.id,
              description: payCode.description,
              payType: payCode.pay_type,
              rateUnit: payCode.rate_unit,
              rate: rate,
              isDefault: payCode.is_default_setting,
              isSelected: isSelected,
              unitsProduced: unitsProduced,
              isContextLinked: isContextLinked, // Flag for special handling
              source: payCode.source, // Track source (job or employee)
              calculatedAmount: calculateActivityAmount(
                {
                  isSelected,
                  payType: payCode.pay_type,
                  rateUnit: payCode.rate_unit,
                  rate,
                  unitsProduced,
                },
                hours,
                formData.contextData
              ),
            };
          });

          // Then apply auto-deselection logic to all activities
          const processedActivities = calculateActivitiesAmounts(
            activities,
            hours,
            formData.contextData
          );
          newEmployeeActivities[rowKey] = processedActivities;
        });
      }
    );

    setEmployeeActivities(newEmployeeActivities);
  };

  // Update handleActivitiesUpdated to store all activities, not just selected:
  const handleActivitiesUpdated = (activities: any[]) => {
    if (!selectedEmployee?.rowKey) return;

    const rowKey = selectedEmployee.rowKey;

    // Store all activities (both selected and unselected)
    setEmployeeActivities((prev) => ({
      ...prev,
      [rowKey]: activities,
    }));

    toast.success(`Activities updated for ${selectedEmployee.name}`);
  };

  return (
    <div className="relative w-full mx-4 md:mx-6 -mt-8">
      <BackButton onClick={handleBack} />

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-default-800 mb-4">
          {mode === "edit"
            ? `Edit ${jobConfig?.name} Entry`
            : `New ${jobConfig?.name} Entry`}
        </h1>

        {/* Header Section */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Date & Day Type */}
          <div>
            <FormInput
              name="logDate"
              label="Date"
              type="date"
              value={formData.logDate}
              onChange={handleDateChange}
              required
            />
            <div className="mt-2">
              <span className="text-sm font-medium text-default-700">
                Day Type:{" "}
              </span>
              <span
                className={`text-sm font-semibold ml-1 ${
                  formData.dayType === "Biasa"
                    ? "text-default-700"
                    : formData.dayType === "Ahad"
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {formData.dayType}
                {formData.dayType === "Umum" &&
                  getHolidayDescription(new Date(formData.logDate)) && (
                    <span className="ml-1 font-normal">
                      ({getHolidayDescription(new Date(formData.logDate))})
                    </span>
                  )}
              </span>
            </div>
          </div>

          {/* Shift */}
          <FormListbox
            name="shift"
            label="Shift"
            value={formData.shift}
            onChange={(value) => setFormData({ ...formData, shift: value })}
            options={[
              { id: "1", name: "Day Shift" },
              { id: "2", name: "Night Shift" },
            ]}
            required
          />

          {/* Show Context Form here only if 3 or fewer fields */}
          {jobConfig?.contextFields && jobConfig.contextFields.length <= 3 && (
            <div>
              <DynamicContextForm
                contextFields={jobConfig?.contextFields || []}
                contextData={formData.contextData}
                onChange={handleContextChange}
                disabled={isSaving}
              />
            </div>
          )}
        </div>

        {/* Show Context Form below if more than 3 fields */}
        {jobConfig?.contextFields && jobConfig.contextFields.length > 3 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-default-700 mb-3">
              Production Details
            </h3>
            <DynamicContextForm
              contextFields={jobConfig?.contextFields || []}
              contextData={formData.contextData}
              onChange={handleContextChange}
              disabled={isSaving}
            />
          </div>
        )}

        {/* Employees Section */}
        <div className="border-t border-default-200 pt-4 mt-4">
          <h2 className="text-lg font-semibold text-default-700 mb-3">
            Employees & Work Hours
          </h2>

          <div className="mb-4 flex justify-between items-center">
            <p className="text-sm text-default-500">
              Select employees and assign hours worked for this job.
            </p>
          </div>

          {loadingJobs || loadingStaffs ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : expandedEmployees.length === 0 ? (
            <div className="text-center py-8 text-default-500">
              No employees found with Mee Production job types
            </div>
          ) : (
            <div className="overflow-x-auto mt-4">
              <div className="relative border border-default-200 rounded-lg overflow-hidden">
                <div className="max-h-[1200px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-100 sticky top-0 z-10">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          <Checkbox
                            checked={selectAll}
                            onChange={handleSelectAll}
                            size={20}
                            checkedColor="text-sky-600"
                            ariaLabel="Select all employees"
                            buttonClassName="p-1 rounded-lg"
                          />
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
                          Name
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Job Type
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Hours
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
                      {expandedEmployees.map((row) => {
                        // Determine selection and hours from the central state
                        const isSelected =
                          employeeSelectionState.selectedJobs[row.id]?.includes(
                            row.jobType
                          ) || false;
                        const hours =
                          employeeSelectionState.jobHours[row.id]?.[
                            row.jobType
                          ] ??
                          jobConfig?.defaultHours ??
                          7; // Use config default hours

                        return (
                          <tr key={row.rowKey}>
                            <td className="px-6 py-4 whitespace-nowrap align-middle">
                              <Checkbox
                                checked={isSelected}
                                onChange={() =>
                                  handleEmployeeSelection(row.rowKey)
                                }
                                size={20}
                                checkedColor="text-sky-600"
                                ariaLabel={`Select employee ${row.name} for job ${row.jobName}`}
                                buttonClassName="p-1 rounded-lg"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-700">
                              <Link
                                to={`/catalogue/staff/${row.id}`}
                                className="hover:underline hover:text-sky-600"
                              >
                                {row.id}
                              </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                              {row.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                              <Link
                                to={`/catalogue/job?id=${row.jobType}`}
                                className="hover:underline hover:text-sky-600"
                              >
                                {row.jobName}
                              </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end space-x-2">
                                {hours > 8 &&
                                  isSelected &&
                                  jobConfig?.requiresOvertimeCalc && (
                                    <span className="text-xs text-amber-600 font-medium">
                                      OT
                                    </span>
                                  )}
                                <input
                                  id={`employee-hours-${row.rowKey}`}
                                  name={`employee-hours-${row.rowKey}`}
                                  type="number"
                                  value={isSelected ? hours.toString() : ""}
                                  onChange={(e) =>
                                    handleEmployeeHoursChange(
                                      row.rowKey,
                                      e.target.value
                                    )
                                  }
                                  onBlur={() => handleHoursBlur(row.rowKey)}
                                  className={`max-w-[80px] py-1 text-sm text-right border rounded-md disabled:bg-default-100 disabled:text-default-400 disabled:cursor-not-allowed ${
                                    hours > 8 && jobConfig?.requiresOvertimeCalc
                                      ? "border-amber-400 bg-amber-50"
                                      : "border-default-300"
                                  }`}
                                  step="0.5"
                                  min="0"
                                  max="24"
                                  disabled={!isSelected}
                                  placeholder={isSelected ? "0" : "-"}
                                />
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <ActivitiesTooltip
                                activities={(
                                  employeeActivities[row.rowKey || ""] || []
                                ).filter((activity) => activity.isSelected)}
                                employeeName={row.name}
                                className={
                                  !isSelected
                                    ? "disabled:text-default-300 disabled:cursor-not-allowed"
                                    : ""
                                }
                                disabled={!isSelected}
                                onClick={() => handleManageActivities(row)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="border-t border-default-200 pt-4 mt-4 flex justify-end space-x-3">
          <Button
            variant="outline"
            onClick={mode === "edit" && onCancel ? onCancel : handleBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            color="sky"
            variant="boldOutline"
            onClick={() => handleSaveForm()}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : mode === "edit" ? "Update" : "Save"}
          </Button>
        </div>
      </div>
      {/* Manage Activities Modal */}
      <ManageActivitiesModal
        isOpen={showActivitiesModal}
        onClose={() => setShowActivitiesModal(false)}
        employee={selectedEmployee}
        jobType={selectedEmployee?.jobType || ""}
        jobName={selectedEmployee?.jobName || ""}
        employeeHours={
          employeeSelectionState.jobHours[selectedEmployee?.id || ""]?.[
            selectedEmployee?.jobType || ""
          ] || 0
        }
        dayType={formData.dayType}
        onActivitiesUpdated={handleActivitiesUpdated}
        existingActivities={employeeActivities[selectedEmployee?.rowKey || ""]}
        contextLinkedPayCodes={contextLinkedPayCodes} // Pass context info
        contextData={formData.contextData} // Pass current context values
      />
    </div>
  );
};

export default DailyLogEntryPage;

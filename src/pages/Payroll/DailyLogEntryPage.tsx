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

// MEE-specific job IDs that we want to filter for
const MEE_JOB_IDS = ["MEE_FOREMAN", "MEE_TEPUNG", "MEE_ROLL", "MEE_SANGKUT"];

// Helper function to determine day type based on date
const determineDayType = (date: Date): "Biasa" | "Ahad" | "Umum" => {
  // For now, just check if it's Sunday (0)
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return "Ahad";

  // Will implement holiday check later
  return "Biasa";
};

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
  foremanId: string;
  contextData: {
    totalBags?: number;
    [key: string]: any;
  };
  dayType: "Biasa" | "Ahad" | "Umum";
  employees: EmployeeWithHours[];
}

const DailyLogEntryPage: React.FC = () => {
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
  const [formData, setFormData] = useState<DailyLogFormData>({
    logDate: format(new Date(), "yyyy-MM-dd"),
    shift: "day",
    foremanId: "",
    contextData: {
      totalBags: 50, // Set default value for totalBags
    },
    dayType: determineDayType(new Date()),
    employees: [],
  });
  const {
    detailedMappings: jobPayCodeDetails,
    loading: loadingPayCodeMappings,
  } = useJobPayCodeMappings();
  const [isSaving, setIsSaving] = useState(false);

  // Use useMemo to filter only MEE jobs
  const jobs = useMemo(() => {
    return allJobs
      .filter((job) => MEE_JOB_IDS.includes(job.id))
      .map((job) => ({
        id: job.id,
        name: job.name,
      }));
  }, [allJobs]);

  const availableEmployees = useMemo(() => {
    return allStaffs
      .filter((staff) => {
        if (!staff.job || !Array.isArray(staff.job)) return false;
        return staff.job.some((jobId: string) => MEE_JOB_IDS.includes(jobId));
      })
      .map((staff) => ({
        ...staff,
        hours: 7,
      }));
  }, [allStaffs]);

  const expandedEmployees = useMemo(() => {
    // Create a new array with an entry for each employee-job combination
    const expanded: Array<
      EmployeeWithHours & { jobType: string; jobName: string }
    > = [];

    availableEmployees.forEach((employee) => {
      // Filter to only include MEE job types
      const meeJobs = (employee.job || []).filter((jobId: string) =>
        MEE_JOB_IDS.includes(jobId)
      );

      // Create a row for each job type this employee has
      meeJobs.forEach((jobId: any) => {
        const jobName = jobs.find((j) => j.id === jobId)?.name || jobId;

        expanded.push({
          ...employee,
          jobType: jobId,
          jobName,
          // Use a compound key for each row
          rowKey: `${employee.id}-${jobId}`,
        });
      });
    });

    // Sort by employee name first, then job name
    return expanded.sort((a, b) => {
      // First by employee name
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;

      // Then by job name
      return (a.jobName || "").localeCompare(b.jobName || "");
    });
  }, [availableEmployees, jobs]);

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

  // Handle hours blur event
  const handleHoursBlur = (rowKey: string | undefined) => {
    if (!rowKey) return;

    // Recalculate activities when hours change
    fetchAndApplyActivities();
  };

  // Handle context data changes
  const handleContextDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      contextData: {
        ...formData.contextData,
        [name]: value === "" ? "" : Number(value), // Convert to number if not empty
      },
    });
  };

  const handleBack = () => {
    navigate("/payroll/mee-production");
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

    // Build the payload
    const payload = {
      logDate: formData.logDate,
      shift: formData.shift,
      dayType: formData.dayType,
      jobId: "MEE", // For now just hardcode to MEE section
      foremanId: formData.foremanId || null,
      contextData: formData.contextData,
      status: "Submitted",
      employeeEntries: selectedEmployeeData,
    };

    setIsSaving(true);

    try {
      await api.post("/api/daily-work-logs", payload);
      toast.success("Work log submitted successfully");
      navigate("/payroll/mee-production");
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

  // Use a one-time initialization effect
  const initializedRef = useRef(false);
  useEffect(() => {
    if (
      !initializedRef.current &&
      !loadingStaffs &&
      !loadingJobs &&
      expandedEmployees.length > 0
    ) {
      initializedRef.current = true;
      initializeDefaultSelections();
    }
  }, [
    expandedEmployees,
    loadingStaffs,
    loadingJobs,
    initializeDefaultSelections,
  ]);

  // Separate effect for fetching activities after selection changes
  useEffect(() => {
    if (
      Object.keys(employeeSelectionState.selectedJobs).length > 0 &&
      !loadingPayCodeMappings
    ) {
      fetchAndApplyActivities();
    }
  }, [
    employeeSelectionState.selectedJobs,
    employeeSelectionState.jobHours,
    formData.dayType,
    loadingPayCodeMappings,
  ]);

  // Update the fetchAndApplyActivities function to properly handle existing state:
  const fetchAndApplyActivities = () => {
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

          // Get pay codes from cache
          const jobPayCodes = jobPayCodeDetails[jobType] || [];

          // Check if we already have activities for this employee/job
          const existingActivities = employeeActivities[rowKey] || [];

          // Filter pay codes based on hours
          const filteredPayCodes =
            hours > 8
              ? jobPayCodes // If overtime, include all pay codes
              : jobPayCodes.filter(
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

            // For overtime pay codes, determine if they should be auto-selected
            const isOvertimeCode = payCode.pay_type === "Overtime";
            const shouldAutoSelect = isOvertimeCode && hours > 8;

            // Use existing state if available, otherwise use defaults
            const isSelected = existingActivity
              ? existingActivity.isSelected
              : shouldAutoSelect || payCode.is_default_setting;

            const unitsProduced = existingActivity
              ? existingActivity.unitsProduced
              : payCode.requires_units_input
              ? 0
              : undefined;

            // Calculate amount
            let calculatedAmount = 0;
            if (isSelected) {
              switch (payCode.rate_unit) {
                case "Hour":
                  // For overtime pay codes, only apply to hours beyond 8
                  if (isOvertimeCode) {
                    const overtimeHours = Math.max(0, hours - 8);
                    calculatedAmount = rate * overtimeHours;
                  } else {
                    calculatedAmount = rate * hours;
                  }
                  break;
                case "Day":
                  calculatedAmount = rate;
                  break;
                case "Bag":
                case "Fixed":
                  calculatedAmount = rate * (unitsProduced || 0);
                  break;
                default:
                  calculatedAmount = 0;
              }
            }

            return {
              payCodeId: payCode.id,
              description: payCode.description,
              payType: payCode.pay_type,
              rateUnit: payCode.rate_unit,
              rate: rate,
              isDefault: payCode.is_default_setting,
              isSelected: isSelected,
              unitsProduced: unitsProduced,
              calculatedAmount: Number(calculatedAmount.toFixed(2)),
            };
          });

          newEmployeeActivities[rowKey] = activities;
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
    <div className="relative w-full mx-4 md:mx-6">
      <BackButton onClick={handleBack} />

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-default-800 mb-4">
          New Mee Production Entry
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
              </span>
            </div>
          </div>

          {/* Shift - Only Day and Night for Mee Production */}
          <FormListbox
            name="shift"
            label="Shift"
            value={formData.shift}
            onChange={(value) => setFormData({ ...formData, shift: value })}
            options={[
              { id: "day", name: "Day Shift" },
              { id: "night", name: "Night Shift" },
            ]}
            required
          />

          {/* Context Data - Example for Mee Production */}
          <FormInput
            name="totalBags"
            label="Jumlah Tepung (Bags)"
            type="number"
            value={formData.contextData.totalBags?.toString() || ""}
            onChange={handleContextDataChange}
          />
        </div>

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
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-100">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                    >
                      Select
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
                      employeeSelectionState.jobHours[row.id]?.[row.jobType] ??
                      7; // Default to 7 if no hours recorded yet

                    return (
                      <tr key={row.rowKey}>
                        <td className="px-6 py-4 whitespace-nowrap align-middle">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleEmployeeSelection(row.rowKey)}
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
                            {hours > 8 && isSelected && (
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
                                hours > 8
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
          )}
        </div>

        {/* Action Buttons */}
        <div className="border-t border-default-200 pt-4 mt-4 flex justify-end space-x-3">
          <Button variant="outline" onClick={handleBack} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            color="sky"
            variant="boldOutline"
            onClick={() => handleSaveForm()}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
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
      />
    </div>
  );
};

export default DailyLogEntryPage;

// src/pages/Payroll/DailyLogEntryPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import { format } from "date-fns";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useJobsCache } from "../../hooks/useJobsCache";
import { useStaffsCache } from "../../hooks/useStaffsCache";
import Checkbox from "../../components/Checkbox";
import ManageActivitiesModal from "../../components/Payroll/ManageActivitiesModal";
import toast from "react-hot-toast";

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
        return staff.job.some((jobId) => MEE_JOB_IDS.includes(jobId));
      })
      .map((staff) => ({
        ...staff,
        hours: 7,
      }));
  }, [allStaffs]);

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

  const handleActivitiesUpdated = (activities: any[]) => {
    if (!selectedEmployee?.rowKey) return;

    const rowKey = selectedEmployee.rowKey; // Capture the non-null value

    // Store activities for this employee/job combination
    setEmployeeActivities((prev) => ({
      ...prev,
      [rowKey]: activities,
    }));

    // Show a success toast
    toast.success(`Activities updated for ${selectedEmployee.name}`);
  };

  const handleSaveForm = async (asDraft = true) => {
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
      status: asDraft ? "Draft" : "Submitted",
      employeeEntries: selectedEmployeeData,
    };

    console.log("Form data to save:", payload);
    toast.success(asDraft ? "Saved as draft" : "Submitted successfully");

    // In a real implementation, you would send this to the backend:
    /*
    try {
      const response = await api.post('/api/daily-work-logs', payload);
      toast.success(asDraft ? 'Saved as draft' : 'Submitted successfully');
      navigate('/payroll/mee-production');
    } catch (error) {
      console.error('Error saving work log:', error);
      toast.error('Failed to save work log');
    }
    */
  };

  const expandedEmployees = useMemo(() => {
    // Create a new array with an entry for each employee-job combination
    const expanded: Array<
      EmployeeWithHours & { jobType: string; jobName: string }
    > = [];

    availableEmployees.forEach((employee) => {
      // Filter to only include MEE job types
      const meeJobs = (employee.job || []).filter((jobId) =>
        MEE_JOB_IDS.includes(jobId)
      );

      // Create a row for each job type this employee has
      meeJobs.forEach((jobId) => {
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

  useEffect(() => {
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
                          {row.jobName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <input
                            id={`employee-hours-${row.rowKey}`} // Use unique ID
                            name={`employee-hours-${row.rowKey}`} // Use unique name
                            type="number"
                            value={isSelected ? hours.toString() : ""}
                            onChange={(e) =>
                              handleEmployeeHoursChange(
                                row.rowKey,
                                e.target.value
                              )
                            }
                            className="max-w-[80px] py-1 text-sm text-right border border-default-300 rounded-md disabled:bg-default-100 disabled:text-default-400 disabled:cursor-not-allowed"
                            step="0.5"
                            min="0"
                            max="24"
                            disabled={!isSelected}
                            placeholder={isSelected ? "0" : "-"} // Placeholder indicates disabled state
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            className="text-sky-600 hover:text-sky-900 disabled:text-default-300 disabled:cursor-not-allowed"
                            disabled={!isSelected}
                            onClick={() => handleManageActivities(row)}
                          >
                            Manage Activities
                          </button>
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
          <Button variant="outline" onClick={handleBack}>
            Cancel
          </Button>
          <Button
            color="sky"
            variant="filled"
            onClick={() => handleSaveForm(true)}
          >
            Save as Draft
          </Button>
          <Button
            color="sky"
            variant="boldOutline"
            onClick={() => handleSaveForm(false)}
          >
            Submit
          </Button>
        </div>
      </div>
      {/* Manage Activities Modal */}
      <ManageActivitiesModal
        isOpen={showActivitiesModal}
        onClose={() => setShowActivitiesModal(false)}
        employee={selectedEmployee}
        jobId={selectedEmployee?.jobType || ""}
        jobName={selectedEmployee?.jobName || ""}
        employeeHours={
          employeeSelectionState.jobHours[selectedEmployee?.id || ""]?.[
            selectedEmployee?.jobType || ""
          ] || 0
        }
        dayType={formData.dayType}
        onActivitiesUpdated={handleActivitiesUpdated}
      />
    </div>
  );
};

export default DailyLogEntryPage;

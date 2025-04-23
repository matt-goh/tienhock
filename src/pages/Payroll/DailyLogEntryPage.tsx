// src/pages/Payroll/DailyLogEntryPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { Job, Employee } from "../../types/types";
import { api } from "../../routes/utils/api";
import BackButton from "../../components/BackButton";
import { format } from "date-fns";
import LoadingSpinner from "../../components/LoadingSpinner";
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

interface JobOption {
  id: string;
  name: string;
}

interface EmployeeWithHours extends Employee {
  rowKey?: string; // Unique key for each row
  jobName?: string; // Optional job name for display purposes
  hours?: number;
  selected?: boolean;
}

interface DailyLogFormData {
  logDate: string;
  shift: string;
  jobId: string;
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
  const [loading, setLoading] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [availableEmployees, setAvailableEmployees] = useState<
    EmployeeWithHours[]
  >([]);
  const [selectedEmployees, setSelectedEmployees] = useState<
    EmployeeWithHours[]
  >([]);

  const [formData, setFormData] = useState<DailyLogFormData>({
    logDate: format(new Date(), "yyyy-MM-dd"),
    shift: "day",
    jobId: "",
    foremanId: "",
    contextData: {},
    dayType: determineDayType(new Date()),
    employees: [],
  });

  // Fetch jobs on component mount
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true);
        const response = await api.get("/api/jobs");
        // Filter only MEE jobs
        const filteredJobs = response
          .filter((job: Job) => MEE_JOB_IDS.includes(job.id))
          .map((job: Job) => ({
            id: job.id,
            name: job.name,
          }));

        setJobs(filteredJobs);

        // If we have any jobs, set the first one as default
        if (filteredJobs.length > 0) {
          setFormData((prev) => ({
            ...prev,
            jobId: filteredJobs[0].id,
          }));
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  // Fetch staff/employees
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoadingEmployees(true);
        const response = await api.get("/api/staffs");

        // Filter employees by job to only include those working in MEE jobs
        const filteredEmployees = response
          .filter((staff: any) => {
            if (!staff.job || !Array.isArray(staff.job)) return false;
            return staff.job.some((jobId: string) =>
              MEE_JOB_IDS.includes(jobId)
            );
          })
          .map((staff: any) => ({
            id: staff.id,
            name: staff.name,
            job: staff.job,
            hours: 0,
            selected: false,
          }));

        setAvailableEmployees(filteredEmployees);
      } catch (error) {
        console.error("Error fetching employees:", error);
      } finally {
        setLoadingEmployees(false);
      }
    };

    fetchEmployees();
  }, []);

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

  // Handle input changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
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

  // Handle job selection
  const handleJobChange = (jobId: string) => {
    setFormData({
      ...formData,
      jobId,
    });
  };

  const handleBack = () => {
    navigate("/payroll/mee-production");
  };

  // Toggle employee selection
  const handleEmployeeSelection = (employeeId: string) => {
    setAvailableEmployees((prev) =>
      prev.map((emp) =>
        emp.id === employeeId ? { ...emp, selected: !emp.selected } : emp
      )
    );
  };

  // Update employee hours
  const handleEmployeeHoursChange = (employeeId: string, hours: string) => {
    const hoursNum = hours === "" ? 0 : parseFloat(hours);

    setAvailableEmployees((prev) =>
      prev.map((emp) =>
        emp.id === employeeId ? { ...emp, hours: hoursNum } : emp
      )
    );
  };

  // Replace the sortedEmployees useMemo with expandedEmployees that creates multiple rows
  const expandedEmployees = useMemo(() => {
    // First filter to only include employees with at least one MEE job
    const filteredEmployees = availableEmployees.filter(
      (emp) => emp.job && emp.job.some((jobId) => MEE_JOB_IDS.includes(jobId))
    );

    // Then create a new array with an entry for each employee-job combination
    const expanded: Array<EmployeeWithHours & { jobType: string }> = [];

    filteredEmployees.forEach((employee) => {
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

    // Sort by job name first, then employee name
    return expanded.sort((a, b) => {
      // First by selected job
      if (formData.jobId) {
        const aHasSelected = a.jobType === formData.jobId;
        const bHasSelected = b.jobType === formData.jobId;
        if (aHasSelected !== bHasSelected) {
          return aHasSelected ? -1 : 1;
        }
      }

      // Then by job name
      const jobCompare = (a.jobName || "").localeCompare(b.jobName || "");
      if (jobCompare !== 0) return jobCompare;

      // Then by employee name
      return a.name.localeCompare(b.name);
    });
  }, [availableEmployees, jobs, formData.jobId]);

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

          {/* Job Selection - Only MEE jobs */}
          <FormListbox
            name="jobId"
            label="Mee Job Type"
            value={formData.jobId}
            onChange={handleJobChange}
            options={jobs}
            required
            placeholder={loading ? "Loading jobs..." : "Select a job"}
          />

          {/* Context Data - Example for Mee Production */}
          <FormInput
            name="totalBags"
            label="Total Bags Produced"
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

          {loadingEmployees ? (
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
                      className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
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
                  {expandedEmployees.map((employee) => (
                    <tr
                      key={employee.rowKey}
                      className={
                        formData.jobId === employee.jobType ? "bg-sky-50" : ""
                      }
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={
                            employee.selected &&
                            formData.jobId === employee.jobType
                          }
                          onChange={() => {
                            // Only allow selection if the job type matches the selected job
                            if (formData.jobId === employee.jobType) {
                              handleEmployeeSelection(employee.id);
                            } else {
                              // Optionally show a message that they need to select matching job type first
                              toast(
                                `Please select job type "${employee.jobName}" first to assign this employee`
                              );
                            }
                          }}
                          disabled={formData.jobId !== employee.jobType}
                          className="h-4 w-4 text-sky-600 focus:ring-sky-500 border-default-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-700">
                        {employee.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                        {employee.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                        {employee.jobName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          value={
                            employee.selected &&
                            formData.jobId === employee.jobType
                              ? employee.hours || ""
                              : ""
                          }
                          onChange={(e) =>
                            handleEmployeeHoursChange(
                              employee.id,
                              e.target.value
                            )
                          }
                          className="max-w-[80px] px-2 py-1 text-sm border border-default-300 rounded-md"
                          step="0.5"
                          min="0"
                          disabled={
                            !employee.selected ||
                            formData.jobId !== employee.jobType
                          }
                          placeholder="0"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          className="text-sky-600 hover:text-sky-900 disabled:text-default-300"
                          disabled={
                            !employee.selected ||
                            formData.jobId !== employee.jobType
                          }
                          onClick={() => {}}
                        >
                          Manage Activities
                        </button>
                      </td>
                    </tr>
                  ))}
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
          <Button color="sky" variant="filled" onClick={() => {}}>
            Save as Draft
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DailyLogEntryPage;

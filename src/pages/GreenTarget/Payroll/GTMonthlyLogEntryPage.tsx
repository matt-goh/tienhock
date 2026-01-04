// src/pages/GreenTarget/Payroll/GTMonthlyLogEntryPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MonthNavigator from "../../../components/MonthNavigator";
import toast from "react-hot-toast";
import { api } from "../../../routes/utils/api";
import { useJobPayCodeMappings } from "../../../utils/catalogue/useJobPayCodeMappings";
import { IconCheck, IconX, IconClock } from "@tabler/icons-react";

interface GTPayrollEmployee {
  id: number;
  employee_id: string;
  job_type: "OFFICE" | "DRIVER";
  employee_name: string;
}

interface EmployeeEntry {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  overtimeHours: number;
  selected: boolean;
  activities: ActivityItem[];
}

interface ActivityItem {
  payCodeId: string;
  description: string;
  payType: string;
  rateUnit: string;
  rate: number;
  hoursApplied: number;
  calculatedAmount: number;
  isSelected: boolean;
}

interface ExistingWorkLog {
  id: number;
  log_month: number;
  log_year: number;
  section: string;
  status: string;
  employeeEntries?: {
    id: number;
    employee_id: string;
    employee_name: string;
    total_hours: number;
    overtime_hours: number;
    activities: {
      pay_code_id: string;
      description: string;
      pay_type: string;
      rate_unit: string;
      rate_used: number;
      hours_applied: number;
      calculated_amount: number;
    }[];
  }[];
}

const GTMonthlyLogEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { detailedMappings: jobPayCodeDetails, loading: loadingPayCodes } =
    useJobPayCodeMappings();

  // Form state
  const currentDate = new Date();
  const [formData, setFormData] = useState({
    logMonth: parseInt(searchParams.get("month") || "") || currentDate.getMonth() + 1,
    logYear: parseInt(searchParams.get("year") || "") || currentDate.getFullYear(),
  });

  const [gtEmployees, setGtEmployees] = useState<GTPayrollEmployee[]>([]);
  const [employeeEntries, setEmployeeEntries] = useState<Record<string, EmployeeEntry>>({});
  const [existingWorkLog, setExistingWorkLog] = useState<ExistingWorkLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const DEFAULT_HOURS = 176; // 22 days × 8 hours
  const DEFAULT_OVERTIME = 0;

  // Computed date for MonthNavigator
  const selectedMonthDate = useMemo(() => {
    return new Date(formData.logYear, formData.logMonth - 1, 1);
  }, [formData.logMonth, formData.logYear]);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, [formData.logMonth, formData.logYear]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch GT OFFICE employees
      const employeesResponse = await api.get("/greentarget/api/payroll-employees");
      const officeEmployees = employeesResponse.filter(
        (e: GTPayrollEmployee) => e.job_type === "OFFICE"
      );
      setGtEmployees(officeEmployees);

      // Check for existing work log
      const workLogsResponse = await api.get(
        `/greentarget/api/monthly-work-logs?month=${formData.logMonth}&year=${formData.logYear}&section=OFFICE`
      );

      if (workLogsResponse.logs?.length > 0) {
        // Load existing work log
        const workLogId = workLogsResponse.logs[0].id;
        const fullWorkLog = await api.get(`/greentarget/api/monthly-work-logs/${workLogId}`);
        setExistingWorkLog(fullWorkLog);
        initializeFromExistingLog(fullWorkLog, officeEmployees);
      } else {
        setExistingWorkLog(null);
        initializeNewEntries(officeEmployees);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const initializeFromExistingLog = (
    workLog: ExistingWorkLog,
    employees: GTPayrollEmployee[]
  ) => {
    const entries: Record<string, EmployeeEntry> = {};

    // First, add all employees with their existing data
    employees.forEach((emp) => {
      const existingEntry = workLog.employeeEntries?.find(
        (e) => e.employee_id === emp.employee_id
      );

      if (existingEntry) {
        entries[emp.employee_id] = {
          employeeId: emp.employee_id,
          employeeName: emp.employee_name,
          totalHours: existingEntry.total_hours,
          overtimeHours: existingEntry.overtime_hours || 0,
          selected: true,
          activities: existingEntry.activities?.map((a) => ({
            payCodeId: a.pay_code_id,
            description: a.description,
            payType: a.pay_type,
            rateUnit: a.rate_unit,
            rate: a.rate_used,
            hoursApplied: a.hours_applied,
            calculatedAmount: a.calculated_amount,
            isSelected: true,
          })) || [],
        };
      } else {
        // Employee not in existing log, initialize with defaults
        entries[emp.employee_id] = createDefaultEntry(emp);
      }
    });

    setEmployeeEntries(entries);
  };

  const initializeNewEntries = (employees: GTPayrollEmployee[]) => {
    const entries: Record<string, EmployeeEntry> = {};

    employees.forEach((emp) => {
      entries[emp.employee_id] = createDefaultEntry(emp);
    });

    setEmployeeEntries(entries);
  };

  const createDefaultEntry = (emp: GTPayrollEmployee): EmployeeEntry => {
    // Get OFFICE pay codes
    const officePayCodes = jobPayCodeDetails["OFFICE"] || [];

    // Create default activities from OFFICE pay codes
    const activities: ActivityItem[] = officePayCodes.map((pc) => {
      const rate = parseFloat(String(pc.override_rate_biasa || pc.rate_biasa || "0"));
      const calculatedAmount = pc.rate_unit === "Hour"
        ? rate * DEFAULT_HOURS
        : pc.rate_unit === "Fixed"
        ? rate
        : 0;

      return {
        payCodeId: pc.pay_code_id,
        description: pc.description,
        payType: pc.pay_type,
        rateUnit: pc.rate_unit,
        rate,
        hoursApplied: pc.rate_unit === "Hour" ? DEFAULT_HOURS : 0,
        calculatedAmount,
        isSelected: pc.pay_type === "Base",
      };
    });

    return {
      employeeId: emp.employee_id,
      employeeName: emp.employee_name,
      totalHours: DEFAULT_HOURS,
      overtimeHours: DEFAULT_OVERTIME,
      selected: true,
      activities,
    };
  };

  const handleMonthChange = (newMonth: Date) => {
    setFormData({
      logMonth: newMonth.getMonth() + 1,
      logYear: newMonth.getFullYear(),
    });
  };

  const handleHoursChange = (employeeId: string, field: "totalHours" | "overtimeHours", value: number) => {
    setEmployeeEntries((prev) => {
      const entry = prev[employeeId];
      if (!entry) return prev;

      // Update activities calculations based on new hours
      const updatedActivities = entry.activities.map((activity) => {
        if (activity.rateUnit === "Hour") {
          const hours = field === "totalHours" ? value : entry.totalHours;
          return {
            ...activity,
            hoursApplied: hours,
            calculatedAmount: activity.rate * hours,
          };
        }
        return activity;
      });

      return {
        ...prev,
        [employeeId]: {
          ...entry,
          [field]: value,
          activities: updatedActivities,
        },
      };
    });
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    setEmployeeEntries((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        selected: !prev[employeeId].selected,
      },
    }));
  };

  const handleSave = async () => {
    // Filter selected employees
    const selectedEntries = Object.values(employeeEntries).filter((e) => e.selected);

    if (selectedEntries.length === 0) {
      toast.error("Select at least one employee");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        logMonth: formData.logMonth,
        logYear: formData.logYear,
        section: "OFFICE",
        status: "Submitted",
        contextData: {},
        employeeEntries: selectedEntries.map((entry) => ({
          employeeId: entry.employeeId,
          jobType: "OFFICE",
          totalHours: entry.totalHours,
          overtimeHours: entry.overtimeHours,
          activities: entry.activities
            .filter((a) => a.isSelected)
            .map((a) => ({
              payCodeId: a.payCodeId,
              rate: a.rate,
              hoursApplied: a.hoursApplied,
              calculatedAmount: a.calculatedAmount,
              isSelected: true,
              isManuallyAdded: false,
            })),
        })),
      };

      if (existingWorkLog) {
        await api.put(`/greentarget/api/monthly-work-logs/${existingWorkLog.id}`, payload);
        toast.success("Work log updated successfully");
      } else {
        await api.post("/greentarget/api/monthly-work-logs", payload);
        toast.success("Work log created successfully");
      }

      navigate("/greentarget/payroll");
    } catch (error) {
      console.error("Error saving work log:", error);
      toast.error("Failed to save work log");
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    const selectedEntries = Object.values(employeeEntries).filter((e) => e.selected);
    const totalHours = selectedEntries.reduce((sum, e) => sum + e.totalHours, 0);
    const totalOvertime = selectedEntries.reduce((sum, e) => sum + e.overtimeHours, 0);
    const totalAmount = selectedEntries.reduce((sum, e) => {
      const entryTotal = e.activities
        .filter((a) => a.isSelected)
        .reduce((s, a) => s + a.calculatedAmount, 0);
      return sum + entryTotal;
    }, 0);

    return { totalHours, totalOvertime, totalAmount, count: selectedEntries.length };
  }, [employeeEntries]);

  if (isLoading || loadingPayCodes) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton onClick={() => navigate("/greentarget/payroll")} />
        <div>
          <h1 className="text-2xl font-semibold text-default-800 dark:text-gray-100">
            OFFICE Work Log
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400">
            {existingWorkLog ? "Edit" : "Create"} monthly work hours for OFFICE employees
          </p>
        </div>
      </div>

      {/* Month Navigator */}
      <MonthNavigator
        selectedMonth={selectedMonthDate}
        onChange={handleMonthChange}
      />

      {/* Status Badge */}
      {existingWorkLog && (
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              existingWorkLog.status === "Submitted"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            {existingWorkLog.status}
          </span>
        </div>
      )}

      {/* No Employees State */}
      {gtEmployees.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <IconClock size={48} className="mx-auto text-default-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-default-800 dark:text-gray-200 mb-2">
            No OFFICE Employees
          </h3>
          <p className="text-default-500 dark:text-gray-400 mb-4">
            Add OFFICE employees to GT Payroll first.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate("/greentarget/payroll")}
          >
            Go to Payroll
          </Button>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-sm text-default-500 dark:text-gray-400">Selected</p>
                <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                  {totals.count} / {gtEmployees.length}
                </p>
              </div>
              <div>
                <p className="text-sm text-default-500 dark:text-gray-400">Total Hours</p>
                <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                  {totals.totalHours}
                </p>
              </div>
              <div>
                <p className="text-sm text-default-500 dark:text-gray-400">Overtime Hours</p>
                <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                  {totals.totalOvertime}
                </p>
              </div>
              <div>
                <p className="text-sm text-default-500 dark:text-gray-400">Est. Amount</p>
                <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                  RM {totals.totalAmount.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Employee Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-default-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-default-600 dark:text-gray-300 font-medium w-12">
                    <input
                      type="checkbox"
                      checked={Object.values(employeeEntries).every((e) => e.selected)}
                      onChange={() => {
                        const allSelected = Object.values(employeeEntries).every((e) => e.selected);
                        setEmployeeEntries((prev) => {
                          const updated = { ...prev };
                          Object.keys(updated).forEach((id) => {
                            updated[id] = { ...updated[id], selected: !allSelected };
                          });
                          return updated;
                        });
                      }}
                      className="rounded border-default-300 dark:border-gray-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-default-600 dark:text-gray-300 font-medium">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-center text-default-600 dark:text-gray-300 font-medium w-32">
                    Regular Hours
                  </th>
                  <th className="px-4 py-3 text-center text-default-600 dark:text-gray-300 font-medium w-32">
                    Overtime Hours
                  </th>
                  <th className="px-4 py-3 text-right text-default-600 dark:text-gray-300 font-medium w-32">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.values(employeeEntries).map((entry) => {
                  const entryTotal = entry.activities
                    .filter((a) => a.isSelected)
                    .reduce((s, a) => s + a.calculatedAmount, 0);

                  return (
                    <tr
                      key={entry.employeeId}
                      className={`border-b border-default-100 dark:border-gray-700 ${
                        !entry.selected ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={entry.selected}
                          onChange={() => toggleEmployeeSelection(entry.employeeId)}
                          className="rounded border-default-300 dark:border-gray-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-default-800 dark:text-gray-200">
                          {entry.employeeName}
                        </span>
                        <span className="text-xs text-default-400 dark:text-gray-500 ml-2">
                          {entry.employeeId}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          value={entry.totalHours}
                          onChange={(e) =>
                            handleHoursChange(
                              entry.employeeId,
                              "totalHours",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          disabled={!entry.selected}
                          className="w-20 px-2 py-1 text-center border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200 rounded disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          value={entry.overtimeHours}
                          onChange={(e) =>
                            handleHoursChange(
                              entry.employeeId,
                              "overtimeHours",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          disabled={!entry.selected}
                          className="w-20 px-2 py-1 text-center border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200 rounded disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        RM {entryTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate("/greentarget/payroll")}>
              Cancel
            </Button>
            <Button
              color="emerald"
              variant="filled"
              onClick={handleSave}
              disabled={isSaving || totals.count === 0}
            >
              {isSaving ? (
                <>
                  <LoadingSpinner size="sm" hideText />
                  <span className="ml-2">Saving...</span>
                </>
              ) : existingWorkLog ? (
                "Update Work Log"
              ) : (
                "Save Work Log"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default GTMonthlyLogEntryPage;

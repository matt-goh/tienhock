// src/pages/GreenTarget/Payroll/GTMonthlyLogEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MonthNavigator from "../../../components/MonthNavigator";
import Checkbox from "../../../components/Checkbox";
import toast from "react-hot-toast";
import { api } from "../../../routes/utils/api";
import { Employee } from "../../../types/types";
import { useJobPayCodeMappings } from "../../../utils/catalogue/useJobPayCodeMappings";
import { useJobsCache } from "../../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import ManageActivitiesModal, {
  ActivityItem,
} from "../../../components/Payroll/ManageActivitiesModal";
import { calculateActivityAmount } from "../../../utils/payroll/calculateActivityAmount";
import { IconClock, IconRefresh, IconListCheck } from "@tabler/icons-react";
import GTLeaveSection, {
  GTLeaveSectionHandle,
} from "./GTLeaveSection";

const GT_OFFICE_JOB = "OFFICE";

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
  // Worked days this month (July 2026+ OT formula divisor for actual-days
  // staff logged only in monthly hours). null = not entered.
  workedDays: number | null;
  selected: boolean;
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
    worked_days?: number | string | null;
    activities: {
      pay_code_id: string;
      description: string;
      pay_type: string;
      rate_unit: string;
      rate_used: number;
      hours_applied: number | null;
      units_produced?: number | null;
      calculated_amount: number;
    }[];
  }[];
}

const DEFAULT_HOURS = 176; // 22 days × 8 hours (informational; office base pay is usually Fixed)
const DEFAULT_OVERTIME = 0;

// Identity used to match generated activities against saved/edited ones.
const getActivityIdentity = (a: {
  payCodeId: string;
  description: string;
  payType: string;
  rateUnit: string;
  rate: number;
  hoursApplied?: number;
}): string =>
  [a.payCodeId, a.description, a.payType, a.rateUnit, a.rate, a.hoursApplied ?? ""].join(
    "|"
  );

const GTMonthlyLogEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    detailedMappings: jobPayCodeDetails,
    employeeMappings,
    loading: loadingPayCodes,
    refreshData: refreshPayCodeMappings,
  } = useJobPayCodeMappings();
  const { refreshJobs } = useJobsCache();
  const { refreshStaffs } = useStaffsCache();

  const currentDate = new Date();
  const [formData, setFormData] = useState({
    logMonth: parseInt(searchParams.get("month") || "") || currentDate.getMonth() + 1,
    logYear: parseInt(searchParams.get("year") || "") || currentDate.getFullYear(),
  });

  const [gtEmployees, setGtEmployees] = useState<GTPayrollEmployee[]>([]);
  const [employeeEntries, setEmployeeEntries] = useState<Record<string, EmployeeEntry>>(
    {}
  );
  const [employeeActivities, setEmployeeActivities] = useState<
    Record<string, ActivityItem[]>
  >({});
  const [existingWorkLog, setExistingWorkLog] = useState<ExistingWorkLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);

  // Activities modal
  const [showActivitiesModal, setShowActivitiesModal] = useState(false);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);

  // Leave section
  const leaveSectionRef = useRef<GTLeaveSectionHandle>(null);
  const leaveEmployees = useMemo(
    () =>
      gtEmployees.map((e) => ({ id: e.employee_id, name: e.employee_name })),
    [gtEmployees]
  );

  const selectedMonthDate = useMemo(
    () => new Date(formData.logYear, formData.logMonth - 1, 1),
    [formData.logMonth, formData.logYear]
  );

  // Build the default activity list for an employee, merging OFFICE job pay
  // codes with the employee's own pay codes (employee overrides win — this is
  // where the office monthly salary, e.g. BULAN_BM, lives). Optionally restores
  // selection/units from previously saved activities.
  const buildActivitiesForEmployee = useCallback(
    (
      entry: EmployeeEntry,
      existing?: ActivityItem[]
    ): ActivityItem[] => {
      const jobCodes = jobPayCodeDetails[GT_OFFICE_JOB] || [];
      const empCodes = employeeMappings[entry.employeeId] || [];

      const merged = new Map<string, any>();
      jobCodes.forEach((pc: any) => merged.set(pc.pay_code_id, { ...pc, source: "job" }));
      empCodes.forEach((pc: any) =>
        merged.set(pc.pay_code_id, { ...pc, source: "employee" })
      );

      const hasOvertime = (entry.overtimeHours || 0) > 0;

      return Array.from(merged.values()).map((pc: any) => {
        const rate = Number(pc.override_rate_biasa ?? pc.rate_biasa ?? 0);
        const isOvertime = pc.pay_type === "Overtime";
        const isHour = pc.rate_unit === "Hour";

        const hoursApplied = isHour
          ? isOvertime
            ? entry.overtimeHours || 0
            : entry.totalHours || 0
          : undefined;

        // Quantity-based units (Trip/Day/Bag/Ctn) start unselected & at 0; Fixed
        // uses the rate directly (no units) unless the user enters an amount.
        const requiresUnits = !!pc.requires_units_input;
        const unitsProduced =
          requiresUnits && pc.rate_unit !== "Fixed" ? 0 : undefined;

        let isSelected: boolean;
        if (isOvertime) {
          isSelected = hasOvertime && !!pc.is_default_setting;
        } else {
          isSelected = !!pc.is_default_setting;
        }
        if (
          pc.rate_unit === "Bag" ||
          pc.rate_unit === "Ctn" ||
          pc.rate_unit === "Trip" ||
          pc.rate_unit === "Day"
        ) {
          isSelected = false;
        }

        const base: ActivityItem = {
          payCodeId: pc.pay_code_id,
          description: pc.description,
          payType: pc.pay_type,
          rateUnit: pc.rate_unit,
          rate,
          isDefault: !!pc.is_default_setting,
          isSelected,
          unitsProduced,
          hoursApplied,
          source: pc.source,
          calculatedAmount: 0,
        };

        // Restore prior selection/units from saved/edited activities.
        const prior = existing?.find(
          (e) => getActivityIdentity(e) === getActivityIdentity(base)
        );
        if (prior) {
          base.isSelected = prior.isSelected;
          base.unitsProduced = prior.unitsProduced ?? base.unitsProduced;
        }

        base.calculatedAmount = calculateActivityAmount(
          base,
          base.hoursApplied ?? entry.totalHours,
          {}
        );
        return base;
      });
    },
    [jobPayCodeDetails, employeeMappings]
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const employeesResponse = await api.get("/greentarget/api/payroll-employees");
      const officeEmployees = (employeesResponse || []).filter(
        (e: GTPayrollEmployee) => e.job_type === "OFFICE"
      );
      setGtEmployees(officeEmployees);

      const workLogsResponse = await api.get(
        `/greentarget/api/monthly-work-logs?month=${formData.logMonth}&year=${formData.logYear}&section=OFFICE`
      );

      let fullWorkLog: ExistingWorkLog | null = null;
      if (workLogsResponse.logs?.length > 0) {
        fullWorkLog = await api.get(
          `/greentarget/api/monthly-work-logs/${workLogsResponse.logs[0].id}`
        );
      }
      setExistingWorkLog(fullWorkLog);

      const entries: Record<string, EmployeeEntry> = {};
      const activities: Record<string, ActivityItem[]> = {};

      officeEmployees.forEach((emp: GTPayrollEmployee) => {
        const saved = fullWorkLog?.employeeEntries?.find(
          (e) => e.employee_id === emp.employee_id
        );
        const entry: EmployeeEntry = {
          employeeId: emp.employee_id,
          employeeName: emp.employee_name,
          totalHours: saved ? Number(saved.total_hours) : DEFAULT_HOURS,
          overtimeHours: saved ? Number(saved.overtime_hours) || 0 : DEFAULT_OVERTIME,
          workedDays:
            saved && saved.worked_days != null
              ? Number(saved.worked_days)
              : null,
          selected: true,
        };
        entries[emp.employee_id] = entry;

        const savedActivities: ActivityItem[] | undefined = saved?.activities?.map(
          (a) => ({
            payCodeId: a.pay_code_id,
            description: a.description,
            payType: a.pay_type,
            rateUnit: a.rate_unit,
            rate: Number(a.rate_used),
            isDefault: false,
            isSelected: true,
            unitsProduced:
              a.units_produced != null ? Number(a.units_produced) : undefined,
            hoursApplied: a.hours_applied != null ? Number(a.hours_applied) : undefined,
            calculatedAmount: Number(a.calculated_amount),
          })
        );

        activities[emp.employee_id] = buildActivitiesForEmployee(entry, savedActivities);
      });

      setEmployeeEntries(entries);
      setEmployeeActivities(activities);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [formData.logMonth, formData.logYear, buildActivitiesForEmployee]);

  useEffect(() => {
    if (!loadingPayCodes) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.logMonth, formData.logYear, loadingPayCodes]);

  const handleMonthChange = (newMonth: Date) => {
    setFormData({
      logMonth: newMonth.getMonth() + 1,
      logYear: newMonth.getFullYear(),
    });
  };

  // Recompute Hour-based activity amounts when hours change (keeps selections/units).
  const handleHoursChange = (
    employeeId: string,
    field: "totalHours" | "overtimeHours",
    value: number
  ) => {
    setEmployeeEntries((prev) => {
      const entry = prev[employeeId];
      if (!entry) return prev;
      const next = { ...entry, [field]: value };

      setEmployeeActivities((prevActs) => {
        const acts = prevActs[employeeId];
        if (!acts) return prevActs;
        const updated = acts.map((a) => {
          if (a.rateUnit !== "Hour") return a;
          const hoursApplied =
            a.payType === "Overtime" ? next.overtimeHours || 0 : next.totalHours || 0;
          const recalced = { ...a, hoursApplied };
          recalced.calculatedAmount = calculateActivityAmount(
            recalced,
            hoursApplied,
            {}
          );
          return recalced;
        });
        return { ...prevActs, [employeeId]: updated };
      });

      return { ...prev, [employeeId]: next };
    });
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    setEmployeeEntries((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], selected: !prev[employeeId].selected },
    }));
  };

  const handleSelectAll = () => {
    const allSelected = Object.values(employeeEntries).every((e) => e.selected);
    setEmployeeEntries((prev) => {
      const updated: Record<string, EmployeeEntry> = {};
      Object.keys(prev).forEach((id) => {
        updated[id] = { ...prev[id], selected: !allSelected };
      });
      return updated;
    });
  };

  const handleRefreshCache = async () => {
    setIsRefreshingCache(true);
    try {
      await Promise.all([refreshJobs(), refreshStaffs(), refreshPayCodeMappings()]);
      toast.success("Data refreshed");
    } catch (err) {
      toast.error("Failed to refresh data");
    } finally {
      setIsRefreshingCache(false);
    }
  };

  const openActivitiesModal = (employeeId: string) => {
    setActiveEmployeeId(employeeId);
    setShowActivitiesModal(true);
  };

  const handleActivitiesUpdated = (activities: ActivityItem[]) => {
    if (!activeEmployeeId) return;
    const entry = employeeEntries[activeEmployeeId];
    const recalculated = activities.map((a) => ({
      ...a,
      calculatedAmount: calculateActivityAmount(
        a,
        a.hoursApplied ?? entry?.totalHours ?? 0,
        {}
      ),
    }));
    setEmployeeActivities((prev) => ({ ...prev, [activeEmployeeId]: recalculated }));
  };

  const handleSave = async () => {
    const selectedEntries = Object.values(employeeEntries).filter((e) => e.selected);
    if (selectedEntries.length === 0) {
      toast.error("Select at least one employee");
      return;
    }

    setIsSaving(true);
    try {
      const leavePayload = leaveSectionRef.current?.getLeavePayload() || {
        leaveEntries: [],
        updatedLeaveEntries: [],
        deletedLeaveIds: [],
      };
      const payload = {
        logMonth: formData.logMonth,
        logYear: formData.logYear,
        section: "OFFICE",
        status: "Submitted",
        contextData: {},
        employeeEntries: selectedEntries.map((entry) => ({
          employeeId: entry.employeeId,
          jobType: GT_OFFICE_JOB,
          totalHours: entry.totalHours,
          overtimeHours: entry.overtimeHours,
          workedDays: entry.workedDays || null,
          activities: (employeeActivities[entry.employeeId] || [])
            .filter((a) => a.isSelected)
            .map((a) => ({
              payCodeId: a.payCodeId,
              rate: a.rate,
              hoursApplied: a.hoursApplied ?? null,
              unitsProduced: a.unitsProduced ?? null,
              calculatedAmount: a.calculatedAmount,
              isSelected: true,
              isManuallyAdded: false,
            })),
        })),
        leaveEntries: leavePayload.leaveEntries,
        updatedLeaveEntries: leavePayload.updatedLeaveEntries,
        deletedLeaveIds: leavePayload.deletedLeaveIds,
      };

      if (existingWorkLog) {
        await api.put(
          `/greentarget/api/monthly-work-logs/${existingWorkLog.id}`,
          payload
        );
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

  const getEntryTotal = (employeeId: string): number =>
    (employeeActivities[employeeId] || [])
      .filter((a) => a.isSelected)
      .reduce((s, a) => s + a.calculatedAmount, 0);

  const totals = useMemo(() => {
    const selectedEntries = Object.values(employeeEntries).filter((e) => e.selected);
    const totalHours = selectedEntries.reduce((s, e) => s + e.totalHours, 0);
    const totalOvertime = selectedEntries.reduce((s, e) => s + e.overtimeHours, 0);
    const totalAmount = selectedEntries.reduce(
      (s, e) => s + getEntryTotal(e.employeeId),
      0
    );
    return { totalHours, totalOvertime, totalAmount, count: selectedEntries.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeEntries, employeeActivities]);

  const allSelected =
    Object.values(employeeEntries).length > 0 &&
    Object.values(employeeEntries).every((e) => e.selected);

  const activeEntry = activeEmployeeId ? employeeEntries[activeEmployeeId] : null;

  const renderHourInput = (
    entry: EmployeeEntry,
    field: "totalHours" | "overtimeHours",
    ariaLabel: string
  ) => (
    <input
      type="number"
      value={entry.selected ? entry[field] || 0 : ""}
      onChange={(e) =>
        handleHoursChange(entry.employeeId, field, parseFloat(e.target.value) || 0)
      }
      onClick={(e) => e.stopPropagation()}
      disabled={!entry.selected || isSaving}
      title={ariaLabel}
      aria-label={ariaLabel}
      className="w-full min-w-[4.25rem] pl-3 py-1 text-center text-sm border rounded focus:ring-1 disabled:bg-default-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-800 dark:text-gray-100 disabled:text-default-400 dark:disabled:text-gray-500 border-default-300 dark:border-gray-600 focus:ring-sky-500 focus:border-sky-500"
      min="0"
      step="0.5"
    />
  );

  const renderHourGroup = (entry: EmployeeEntry) => (
    <div className="min-w-[9.5rem] rounded-md border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <div className="mb-0.5 text-center text-[10px] uppercase text-default-400 dark:text-gray-500">
            Hrs
          </div>
          {renderHourInput(entry, "totalHours", "Biasa hours")}
        </div>
        <div>
          <div className="mb-0.5 text-center text-[10px] uppercase text-default-400 dark:text-gray-500">
            OT
          </div>
          {renderHourInput(entry, "overtimeHours", "Overtime hours")}
        </div>
      </div>
    </div>
  );

  // Worked Days (July 2026+ OT formula divisor for actual-days staff).
  // Empty = not entered; payroll blocks an actual-days employee with OT if no
  // worked-day count can be derived.
  const handleWorkedDaysChange = (employeeId: string, value: string) => {
    const numValue = value === "" ? null : parseFloat(value);
    setEmployeeEntries((prev) => {
      const entry = prev[employeeId];
      if (!entry) return prev;
      return {
        ...prev,
        [employeeId]: {
          ...entry,
          workedDays:
            numValue == null || Number.isNaN(numValue) ? null : numValue,
        },
      };
    });
  };

  const renderWorkedDaysInput = (entry: EmployeeEntry) => (
    <input
      type="number"
      value={entry.selected && entry.workedDays != null ? entry.workedDays : ""}
      onChange={(e) => handleWorkedDaysChange(entry.employeeId, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      disabled={!entry.selected || isSaving}
      title="Actual worked days this month (July 2026+ OT rate divisor for actual-days staff)"
      aria-label={`Worked days for ${entry.employeeName}`}
      placeholder="-"
      className="w-20 pl-3 py-1 text-center text-sm border rounded focus:ring-1 disabled:bg-default-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-800 dark:text-gray-100 disabled:text-default-400 dark:disabled:text-gray-500 border-default-300 dark:border-gray-600 focus:ring-sky-500 focus:border-sky-500"
      min="0"
      max="31"
      step="0.5"
    />
  );

  if (isLoading || loadingPayCodes) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Month Selection */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 p-4 rounded-lg border border-default-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <BackButton onClick={() => navigate("/greentarget/payroll")} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {existingWorkLog ? "Edit" : "New"} Office Monthly Entry
            </h1>
            <div className="w-px h-6 bg-default-300 dark:bg-gray-600" />
            <MonthNavigator
              selectedMonth={selectedMonthDate}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
            />
            {existingWorkLog && (
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  existingWorkLog.status === "Submitted"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}
              >
                {existingWorkLog.status}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefreshCache}
              disabled={isRefreshingCache}
              className="px-3 py-1.5 flex items-center gap-1.5 rounded-full border border-default-300 dark:border-gray-600 hover:bg-default-100 dark:hover:bg-gray-700 text-default-600 dark:text-gray-300 text-sm font-medium transition-colors disabled:opacity-50"
              title="Refresh staff, jobs, and pay codes"
            >
              <IconRefresh size={16} className={isRefreshingCache ? "animate-spin" : ""} />
              Refresh
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/greentarget/payroll")}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              color="sky"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || totals.count === 0}
            >
              {isSaving ? "Saving..." : existingWorkLog ? "Update" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {/* No Employees State */}
      {gtEmployees.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-8 text-center">
          <IconClock size={48} className="mx-auto text-default-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-default-800 dark:text-gray-200 mb-2">
            No Office Employees
          </h3>
          <p className="text-default-500 dark:text-gray-400 mb-4">
            Add OFFICE employees to GT Payroll first.
          </p>
          <Button variant="outline" onClick={() => navigate("/greentarget/payroll")}>
            Go to Payroll
          </Button>
        </div>
      ) : (
        <>
          {/* Employee Selection Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-1 text-left w-12 whitespace-nowrap">
                      <Checkbox
                        checked={allSelected}
                        onChange={handleSelectAll}
                        size={20}
                        checkedColor="text-sky-600"
                        disabled={isSaving}
                        buttonClassName="p-1 rounded-lg"
                      />
                    </th>
                    <th className="px-6 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap">
                      ID
                    </th>
                    <th className="px-6 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap">
                      Name
                    </th>
                    <th className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap w-44">
                      Biasa
                    </th>
                    <th
                      className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap w-24"
                      title="Actual worked days this month. Used from July 2026 to derive the OT rate for staff paid by actual worked days; leave empty for monthly-salary (÷26) staff."
                    >
                      Worked Days
                    </th>
                    <th className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap">
                      Activities
                    </th>
                    <th className="px-6 py-1 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                  {Object.values(employeeEntries).map((entry) => {
                    const acts = employeeActivities[entry.employeeId] || [];
                    const selectedCount = acts.filter((a) => a.isSelected).length;
                    const entryTotal = getEntryTotal(entry.employeeId);

                    return (
                      <tr
                        key={entry.employeeId}
                        className={`${
                          entry.selected
                            ? "bg-sky-50 dark:bg-sky-900/20"
                            : "bg-white dark:bg-gray-800"
                        } hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer`}
                        onClick={() => toggleEmployeeSelection(entry.employeeId)}
                      >
                        <td
                          className="px-6 py-2 whitespace-nowrap cursor-pointer"
                          onClickCapture={(e) => {
                            e.stopPropagation();
                            if (!isSaving) toggleEmployeeSelection(entry.employeeId);
                          }}
                        >
                          <Checkbox
                            checked={entry.selected}
                            onChange={() => {}}
                            size={20}
                            checkedColor="text-sky-600"
                            disabled={isSaving}
                            buttonClassName="p-1 rounded-lg"
                          />
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm font-medium text-default-700 dark:text-gray-200">
                          {entry.employeeId}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                          <span className="font-medium">{entry.employeeName}</span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {renderHourGroup(entry)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-center">
                          {renderWorkedDaysInput(entry)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (entry.selected) openActivitiesModal(entry.employeeId);
                            }}
                            disabled={!entry.selected || isSaving}
                            className="inline-flex items-center gap-1.5 rounded-full border border-default-300 dark:border-gray-600 px-3 py-1 text-xs font-medium text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Manage pay code activities"
                          >
                            <IconListCheck size={14} />
                            {selectedCount} selected
                          </button>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          RM {entryTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {Object.values(employeeEntries).length === 0 && (
              <div className="p-8 text-center text-default-500 dark:text-gray-400">
                No employees found.
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4">
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

          {/* Leave & Absence Recording (saved with the monthly log) */}
          <GTLeaveSection
            ref={leaveSectionRef}
            employees={leaveEmployees}
            year={formData.logYear}
            month={formData.logMonth}
            mode="monthly"
            loadEndpoint={`/greentarget/api/monthly-work-logs/leave/${formData.logYear}/${formData.logMonth}?section=OFFICE`}
            disabled={isSaving}
          />
        </>
      )}

      {/* Activities Modal */}
      {activeEntry && (
        <ManageActivitiesModal
          isOpen={showActivitiesModal}
          onClose={() => setShowActivitiesModal(false)}
          employee={{ id: activeEntry.employeeId, name: activeEntry.employeeName } as Employee}
          jobType={GT_OFFICE_JOB}
          jobName="Office"
          employeeHours={activeEntry.totalHours}
          dayType="Biasa"
          existingActivities={employeeActivities[activeEntry.employeeId] || []}
          onActivitiesUpdated={handleActivitiesUpdated}
        />
      )}
    </div>
  );
};

export default GTMonthlyLogEntryPage;

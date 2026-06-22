// src/pages/Payroll/MonthlyLogEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../../components/Button";
import { Employee } from "../../../types/types";
import BackButton from "../../../components/BackButton";
import { format } from "date-fns";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Checkbox from "../../../components/Checkbox";
import toast from "react-hot-toast";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../../utils/catalogue/useJobsCache";
import { useJobPayCodeMappings } from "../../../utils/catalogue/useJobPayCodeMappings";
import { useEffectiveRates } from "../../../utils/payroll/useEffectiveRates";
import { api } from "../../../routes/utils/api";
import { useHolidayCache } from "../../../utils/payroll/useHolidayCache";
import {
  getJobConfig,
  getJobIds,
  getContextLinkedPayCodes,
} from "../../../configs/payrollJobConfigs";
import StyledListbox from "../../../components/StyledListbox";
import MonthNavigator from "../../../components/MonthNavigator";
import YearNavigator from "../../../components/YearNavigator";
import { Link } from "react-router-dom";
import ManageActivitiesModal, {
  ActivityItem,
} from "../../../components/Payroll/ManageActivitiesModal";
import ActivitiesTooltip from "../../../components/Payroll/ActivitiesTooltip";
import { calculateActivityAmount } from "../../../utils/payroll/calculateActivityAmount";
import {
  getGroupedStaffIdsByEmployeeId,
  groupStaffsByName,
} from "../../../utils/payroll/groupStaffsByName";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconPlus,
  IconTrash,
  IconCalendar,
  IconAlertCircle,
  IconRefresh,
  IconSearch,
  IconUsers,
  IconCheck,
} from "@tabler/icons-react";

interface MonthlyLogEntryPageProps {
  mode?: "create" | "edit";
  existingWorkLog?: any;
  onCancel?: () => void;
  jobType?: string;
}

interface EmployeeEntry {
  employeeId: string;
  employeeName: string;
  jobType: string;
  jobName: string;
  totalHours: number;
  overtimeHours: number;
  ahadHours: number;
  ahadOvertimeHours: number;
  umumHours: number;
  umumOvertimeHours: number;
  selected: boolean;
}

type EmployeeHourField =
  | "totalHours"
  | "overtimeHours"
  | "ahadHours"
  | "ahadOvertimeHours"
  | "umumHours"
  | "umumOvertimeHours";

type LeaveType = "cuti_sakit" | "cuti_tahunan" | "cuti_umum" | "cuti_rawatan";
const DEFAULT_LEAVE_AMOUNT: number = 65;
const DEFAULT_LEAVE_AMOUNT_INPUT: string = String(DEFAULT_LEAVE_AMOUNT);

const getActivityIdentity = (
  activity: Pick<
    ActivityItem,
    | "payCodeId"
    | "description"
    | "payType"
    | "rateUnit"
    | "rate"
    | "hoursApplied"
  >,
): string =>
  [
    activity.payCodeId,
    activity.description,
    activity.payType,
    activity.rateUnit,
    activity.rate,
    activity.hoursApplied ?? "",
  ].join("|");

const getEmployeeHourValues = (
  employee: EmployeeEntry,
  includeDayTypeHours: boolean,
): number[] => [
  employee.totalHours || 0,
  employee.overtimeHours || 0,
  ...(includeDayTypeHours
    ? [
        employee.ahadHours || 0,
        employee.ahadOvertimeHours || 0,
        employee.umumHours || 0,
        employee.umumOvertimeHours || 0,
      ]
    : []),
];

const hasSelectedActivityAmount = (activities: ActivityItem[]): boolean =>
  activities.some(
    (activity: ActivityItem) =>
      activity.isSelected && Number(activity.calculatedAmount || 0) > 0,
  );

interface LeaveEntry {
  id?: number;
  employeeId: string;
  employeeName: string;
  leaveDate: string;
  leaveType: LeaveType;
  amountPaid: number;
  isNew: boolean; // true = to be created, false = existing from DB
}

const MonthlyLogEntryPage: React.FC<MonthlyLogEntryPageProps> = ({
  mode = "create",
  existingWorkLog,
  onCancel,
  jobType = "MAINTENANCE",
}) => {
  const navigate = useNavigate();
  const {
    staffs: allStaffs,
    loading: loadingStaffs,
    refreshStaffs,
  } = useStaffsCache();
  const { jobs: allJobs, refreshJobs } = useJobsCache();
  const { isHoliday, getHolidayDescription } = useHolidayCache();
  const {
    detailedMappings: jobPayCodeDetails,
    employeeMappings,
    loading: loadingPayCodeMappings,
    refreshData: refreshPayCodeMappings,
  } = useJobPayCodeMappings();
  // Month-effective rate overlay (keeps the previewed rate in step with the
  // payslip when a scheduled rate change applies to the log's month).
  const { resolveEffectiveRates, getEffectiveRate } = useEffectiveRates();
  const jobConfig = getJobConfig(jobType);
  const JOB_IDS = getJobIds(jobType);
  const contextLinkedPayCodes = jobConfig
    ? getContextLinkedPayCodes(jobConfig)
    : {};
  const supportsDayTypeHours = jobType !== "OFFICE";
  const jobNameById = useMemo<Record<string, string>>(() => {
    return allJobs.reduce((acc: Record<string, string>, job) => {
      acc[job.id] = job.name;
      return acc;
    }, {});
  }, [allJobs]);

  const getJobDisplayName = useCallback(
    (jobId?: string, fallbackName?: string): string => {
      if (!jobId) return fallbackName || "";
      return jobNameById[jobId] || fallbackName || jobId;
    },
    [jobNameById],
  );

  // Form state
  const currentDate = new Date();
  const [formData, setFormData] = useState({
    logMonth:
      mode === "edit" && existingWorkLog
        ? existingWorkLog.log_month
        : currentDate.getMonth() + 1,
    logYear:
      mode === "edit" && existingWorkLog
        ? existingWorkLog.log_year
        : currentDate.getFullYear(),
  });

  // Employee state
  const [employeeEntries, setEmployeeEntries] = useState<
    Record<string, EmployeeEntry>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);

  // Staff on the Green Target payroll (OFFICE and DRIVER) are paid through
  // the GT system, so they are excluded from Tien Hock monthly entries.
  const [gtPayrollEmployeeIds, setGtPayrollEmployeeIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const fetchGtPayrollEmployees = async () => {
      try {
        const gtEmployees = await api.get("/greentarget/api/payroll-employees");
        setGtPayrollEmployeeIds(
          new Set(
            (gtEmployees || []).map(
              (emp: { employee_id: string }) => emp.employee_id,
            ),
          ),
        );
      } catch (error) {
        // Non-fatal: without the GT list, simply no one is excluded.
        console.error("Error fetching GT payroll employees:", error);
      }
    };
    fetchGtPayrollEmployees();
  }, []);

  // Activities state
  const [showActivitiesModal, setShowActivitiesModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeEntry | null>(null);
  const [employeeActivities, setEmployeeActivities] = useState<
    Record<string, ActivityItem[]>
  >({});

  // Leave state
  const [existingLeaveRecords, setExistingLeaveRecords] = useState<
    LeaveEntry[]
  >([]);
  const [newLeaveEntries, setNewLeaveEntries] = useState<LeaveEntry[]>([]);
  const [deletedLeaveIds, setDeletedLeaveIds] = useState<number[]>([]);
  const [showAddLeaveModal, setShowAddLeaveModal] = useState(false);
  const [leaveFormData, setLeaveFormData] = useState({
    leaveDate: format(new Date(), "yyyy-MM-dd"),
    leaveType: "cuti_sakit" as LeaveType,
    amountPaid: DEFAULT_LEAVE_AMOUNT_INPUT,
  });
  // Multi-employee selection state for the Add Leave modal
  const [leaveEmployeeSelections, setLeaveEmployeeSelections] = useState<
    Record<string, boolean>
  >({});
  const [leaveEmployeeSearch, setLeaveEmployeeSearch] = useState("");

  // Ref to track which employee IDs were originally saved in the work log
  // Used to determine whether to use CREATE mode or EDIT mode activity selection logic
  const savedEmployeeIdsRef = React.useRef<Set<string>>(new Set());
  // Ref to store the original saved activities from the work log
  // This preserves the original state even if the employee is deselected and re-selected
  const savedEmployeeActivitiesRef = React.useRef<
    Record<string, ActivityItem[]>
  >({});

  // Month/Year options (kept for leave records display)
  const monthOptions = useMemo(
    () => [
      { id: 1, name: "January" },
      { id: 2, name: "February" },
      { id: 3, name: "March" },
      { id: 4, name: "April" },
      { id: 5, name: "May" },
      { id: 6, name: "June" },
      { id: 7, name: "July" },
      { id: 8, name: "August" },
      { id: 9, name: "September" },
      { id: 10, name: "October" },
      { id: 11, name: "November" },
      { id: 12, name: "December" },
    ],
    [],
  );

  // Computed date for MonthNavigator
  const selectedMonthDate = useMemo(() => {
    return new Date(formData.logYear, formData.logMonth - 1, 1);
  }, [formData.logMonth, formData.logYear]);

  // Handler for MonthNavigator
  const handleMonthNavigatorChange = (date: Date) => {
    setFormData({
      ...formData,
      logMonth: date.getMonth() + 1,
      logYear: date.getFullYear(),
    });
  };

  // Handler for YearNavigator
  const handleYearNavigatorChange = (year: number) => {
    setFormData({
      ...formData,
      logYear: year,
    });
  };

  // Filter employees by job type, excluding staff on the GT payroll
  const eligibleEmployees = useMemo(() => {
    if (!allStaffs || loadingStaffs) return [];
    return allStaffs.filter((staff: Employee) => {
      if (gtPayrollEmployeeIds.has(staff.id)) return false;
      const employeeJobs = staff.job || [];
      return employeeJobs.some((job: string) => JOB_IDS.includes(job));
    });
  }, [allStaffs, loadingStaffs, JOB_IDS, gtPayrollEmployeeIds]);

  // Leave is aggregated per name on the backend, so the Add Leave modal
  // picker collapses multi-ID employees to a single row (senior ID kept).
  const leaveEligibleEmployees = useMemo(
    () => groupStaffsByName(eligibleEmployees),
    [eligibleEmployees],
  );
  const groupedStaffIdsByEmployeeId = useMemo(
    () => getGroupedStaffIdsByEmployeeId(allStaffs || []),
    [allStaffs],
  );

  // Initialize employee entries
  useEffect(() => {
    if (loadingStaffs || eligibleEmployees.length === 0) return;

    // Initialize with all eligible employees
    const entries: Record<string, EmployeeEntry> = {};

    // Create a map of saved entries for quick lookup (edit mode)
    const savedEntriesMap = new Map<string, any>();
    if (mode === "edit" && existingWorkLog?.employeeEntries) {
      // Clear and populate the saved employee IDs ref
      savedEmployeeIdsRef.current = new Set();
      existingWorkLog.employeeEntries.forEach((entry: any) => {
        savedEntriesMap.set(entry.employee_id, entry);
        savedEmployeeIdsRef.current.add(entry.employee_id);
      });
    }

    eligibleEmployees.forEach((emp: Employee) => {
      const empJobs = emp.job || [];
      const matchingJob = empJobs.find((job: string) => JOB_IDS.includes(job));
      const savedEntry = savedEntriesMap.get(emp.id);

      if (savedEntry) {
        // Restore from saved data (edit mode)
        entries[emp.id] = {
          employeeId: savedEntry.employee_id,
          employeeName: savedEntry.employee_name,
          jobType: savedEntry.job_id,
          jobName: getJobDisplayName(savedEntry.job_id, savedEntry.job_name),
          totalHours: savedEntry.total_hours,
          overtimeHours: savedEntry.overtime_hours || 0,
          ahadHours: savedEntry.ahad_hours || 0,
          ahadOvertimeHours: savedEntry.ahad_overtime_hours || 0,
          umumHours: savedEntry.umum_hours || 0,
          umumOvertimeHours: savedEntry.umum_overtime_hours || 0,
          selected: true,
        };
      } else {
        // Not in saved data - use default values
        // In create mode: selected by default
        // In edit mode: deselected by default (wasn't in original work log)
        entries[emp.id] = {
          employeeId: emp.id,
          employeeName: emp.name,
          jobType: matchingJob || JOB_IDS[0],
          jobName: getJobDisplayName(matchingJob || JOB_IDS[0]),
          totalHours: jobConfig?.defaultHours || 176,
          overtimeHours: 0,
          ahadHours: 0,
          ahadOvertimeHours: 0,
          umumHours: 0,
          umumOvertimeHours: 0,
          selected: mode === "create",
        };
      }
    });

    setEmployeeEntries(entries);
  }, [
    eligibleEmployees,
    loadingStaffs,
    mode,
    existingWorkLog,
    JOB_IDS,
    jobConfig,
    getJobDisplayName,
  ]);

  // Overlay the month-effective rate onto a pay code's override fields so the
  // existing override_rate_* ?? rate_* computations use it. No-op when no
  // schedule applies to the tuple/month.
  const applyEffectiveRate = useCallback(
    (payCode: any, employeeId: string, jobTypeId: string) => {
      const eff = getEffectiveRate(employeeId, jobTypeId, payCode?.id);
      if (!eff) return payCode;
      return {
        ...payCode,
        override_rate_biasa: eff.rate_biasa,
        override_rate_ahad: eff.rate_ahad,
        override_rate_umum: eff.rate_umum,
      };
    },
    [getEffectiveRate],
  );

  // Resolve month-effective rates for the selected employees/jobs whenever the
  // log month or entries change, so generated activities preview the rate in
  // force for that month (matching payroll processing).
  useEffect(() => {
    if (loadingPayCodeMappings || !formData.logYear || !formData.logMonth) return;
    const seen = new Set<string>();
    const tuples: { employee_id: string; job_id: string; pay_code_id: string }[] =
      [];
    Object.values(employeeEntries).forEach((entry: any) => {
      const empId = entry.employeeId;
      const jt = entry.jobType;
      if (!empId || !jt) return;
      const codes = [
        ...(jobPayCodeDetails[jt] || []),
        ...(employeeMappings[empId] || []),
      ];
      codes.forEach((pc: any) => {
        const k = `${empId}|${jt}|${pc.id}`;
        if (!seen.has(k)) {
          seen.add(k);
          tuples.push({ employee_id: empId, job_id: jt, pay_code_id: pc.id });
        }
      });
    });
    resolveEffectiveRates(formData.logYear, formData.logMonth, tuples);
  }, [
    employeeEntries,
    formData.logYear,
    formData.logMonth,
    jobPayCodeDetails,
    employeeMappings,
    loadingPayCodeMappings,
    resolveEffectiveRates,
  ]);

  // Fetch and apply activities for selected employees
  const fetchAndApplyActivities = useCallback(
    (currentActivities: Record<string, ActivityItem[]>) => {
      if (loadingPayCodeMappings) return;

      const selectedEntries = Object.values(employeeEntries).filter(
        (e) => e.selected,
      );
      if (selectedEntries.length === 0) return;

      const newEmployeeActivities: Record<string, ActivityItem[]> = {};

      selectedEntries.forEach((entry) => {
        const {
          employeeId,
          jobType: entryJobType,
          totalHours,
          overtimeHours,
          ahadHours,
          ahadOvertimeHours,
          umumHours,
          umumOvertimeHours,
        } = entry;

        // Get job pay codes from cache
        const jobPayCodes = jobPayCodeDetails[entryJobType] || [];

        // Get employee-specific pay codes from cache
        const empPayCodes = employeeMappings[employeeId] || [];

        // Merge pay codes, prioritizing employee-specific ones
        const allPayCodes = new Map();

        // First add job pay codes
        jobPayCodes.forEach((pc: any) => {
          allPayCodes.set(pc.id, { ...pc, source: "job" });
        });

        // Then add/override with employee-specific pay codes
        empPayCodes.forEach((pc: any) => {
          allPayCodes.set(pc.id, { ...pc, source: "employee" });
        });

        // Convert map back to array (with month-effective rate overlay)
        const mergedPayCodes = Array.from(allPayCodes.values()).map((pc) =>
          applyEffectiveRate(pc, employeeId, entryJobType),
        );

        // Check if this employee was originally saved in the work log
        const wasOriginallySaved = savedEmployeeIdsRef.current.has(employeeId);

        // Get existing activities for this employee if in edit mode
        // For originally saved employees, use the preserved ref to handle deselect/re-select cycles
        const currentActivitiesForEmployee =
          currentActivities[employeeId] || [];
        const savedActivitiesForEmployee =
          savedEmployeeActivitiesRef.current[employeeId] || [];
        const existingActivitiesForEmployee = wasOriginallySaved
          ? [
              ...currentActivitiesForEmployee,
              ...savedActivitiesForEmployee.filter(
                (savedActivity) =>
                  !currentActivitiesForEmployee.some(
                    (currentActivity) =>
                      getActivityIdentity(currentActivity) ===
                      getActivityIdentity(savedActivity),
                  ),
              ),
            ]
          : currentActivitiesForEmployee;

        const ahadHrs = supportsDayTypeHours ? ahadHours || 0 : 0;
        const ahadOtHrs = supportsDayTypeHours ? ahadOvertimeHours || 0 : 0;
        const umumHrs = supportsDayTypeHours ? umumHours || 0 : 0;
        const umumOtHrs = supportsDayTypeHours ? umumOvertimeHours || 0 : 0;
        const biasaHrs = totalHours || 0;
        const biasaOtHrs = overtimeHours || 0;

        const hasOvertimeHours =
          biasaOtHrs > 0 || ahadOtHrs > 0 || umumOtHrs > 0;
        const filteredPayCodes = hasOvertimeHours
          ? mergedPayCodes
          : mergedPayCodes.filter((pc: any) => pc.pay_type !== "Overtime");

        // Helper to determine default selection state for a pay code
        const computeDefaultSelection = (
          payCode: any,
          isContextLinked: boolean,
        ): boolean => {
          let isSelected: boolean;
          if (payCode.pay_type === "Tambahan") {
            isSelected = false;
          } else if (payCode.pay_type === "Overtime") {
            isSelected = hasOvertimeHours && payCode.is_default_setting;
          } else if (payCode.pay_type === "Base") {
            isSelected = payCode.is_default_setting;
          } else {
            isSelected = payCode.is_default_setting;
          }
          if (
            isContextLinked ||
            payCode.rate_unit === "Bag" ||
            payCode.rate_unit === "Trip" ||
            payCode.rate_unit === "Day"
          ) {
            isSelected = false;
          }
          return isSelected;
        };

        // Build a single activity entry, applying selection rules and existing-state lookup
        const buildActivity = (
          payCode: any,
          rate: number,
          hoursToApply: number,
          descriptionSuffix: string,
          isContextLinked: boolean,
        ): ActivityItem => {
          const description = `${payCode.description}${descriptionSuffix}`;
          const activityIdentity = getActivityIdentity({
            payCodeId: payCode.id,
            description,
            payType: payCode.pay_type,
            rateUnit: payCode.rate_unit,
            rate,
            hoursApplied: hoursToApply,
          });

          // Match exact variants so Biasa/Ahad/Umum and OT variants stay independent.
          const existingActivity =
            mode === "edit"
              ? existingActivitiesForEmployee.find(
                  (ea) => getActivityIdentity(ea) === activityIdentity,
                )
              : null;

          let isSelected: boolean;
          if (mode === "edit" && wasOriginallySaved) {
            if (existingActivity) {
              isSelected = existingActivity.isSelected;
            } else {
              isSelected = computeDefaultSelection(payCode, isContextLinked);
            }
          } else {
            isSelected = computeDefaultSelection(payCode, isContextLinked);
          }

          const unitsProduced = existingActivity
            ? existingActivity.unitsProduced
            : payCode.requires_units_input
              ? 0
              : undefined;

          return {
            payCodeId: payCode.id,
            description,
            payType: payCode.pay_type,
            rateUnit: payCode.rate_unit,
            rate,
            isDefault: payCode.is_default_setting,
            isSelected,
            unitsProduced,
            hoursApplied: hoursToApply,
            isContextLinked,
            source: payCode.source,
            calculatedAmount: calculateActivityAmount(
              {
                isSelected,
                payType: payCode.pay_type,
                rateUnit: payCode.rate_unit,
                rate,
                unitsProduced,
                hoursApplied: hoursToApply,
              },
              hoursToApply,
              {},
            ),
          };
        };

        const getBiasaRate = (payCode: any): number =>
          payCode.override_rate_biasa ?? payCode.rate_biasa;

        const getAhadRate = (payCode: any, biasaRate: number): number =>
          payCode.override_rate_ahad ?? payCode.rate_ahad ?? biasaRate;

        const getUmumRate = (payCode: any, biasaRate: number): number =>
          payCode.override_rate_umum ?? payCode.rate_umum ?? biasaRate;

        // Convert to activity format - Hour pay codes split into Biasa/Ahad/Umum variants
        const activities: ActivityItem[] = filteredPayCodes.flatMap(
          (payCode: any) => {
            const isContextLinked = !!contextLinkedPayCodes[payCode.id];

            // Split Base+Hour pay codes into Biasa/Ahad/Umum variants with day-type-specific rates
            if (payCode.pay_type === "Base" && payCode.rate_unit === "Hour") {
              const biasaRate = getBiasaRate(payCode);
              const ahadRate = getAhadRate(payCode, biasaRate);
              const umumRate = getUmumRate(payCode, biasaRate);

              const variants: ActivityItem[] = [];
              if (biasaHrs > 0) {
                variants.push(
                  buildActivity(
                    payCode,
                    biasaRate,
                    biasaHrs,
                    "",
                    isContextLinked,
                  ),
                );
              }
              if (ahadHrs > 0) {
                variants.push(
                  buildActivity(
                    payCode,
                    ahadRate,
                    ahadHrs,
                    " (Ahad)",
                    isContextLinked,
                  ),
                );
              }
              if (umumHrs > 0) {
                variants.push(
                  buildActivity(
                    payCode,
                    umumRate,
                    umumHrs,
                    " (Umum)",
                    isContextLinked,
                  ),
                );
              }
              return variants;
            }

            // Split Overtime+Hour pay codes too, because jobs such as OFFICE can
            // configure distinct OT rates for Biasa, Ahad, and Umum.
            if (
              payCode.pay_type === "Overtime" &&
              payCode.rate_unit === "Hour"
            ) {
              const biasaRate = getBiasaRate(payCode);
              const ahadRate = getAhadRate(payCode, biasaRate);
              const umumRate = getUmumRate(payCode, biasaRate);

              const variants: ActivityItem[] = [];
              if (biasaOtHrs > 0) {
                variants.push(
                  buildActivity(
                    payCode,
                    biasaRate,
                    biasaOtHrs,
                    "",
                    isContextLinked,
                  ),
                );
              }
              if (ahadOtHrs > 0) {
                variants.push(
                  buildActivity(
                    payCode,
                    ahadRate,
                    ahadOtHrs,
                    " (Ahad)",
                    isContextLinked,
                  ),
                );
              }
              if (umumOtHrs > 0) {
                variants.push(
                  buildActivity(
                    payCode,
                    umumRate,
                    umumOtHrs,
                    " (Umum)",
                    isContextLinked,
                  ),
                );
              }
              return variants;
            }

            // All other pay codes (Tambahan, non-Hour Base/Overtime) - single activity at Biasa rate
            const rate = getBiasaRate(payCode);
            const hoursToApply =
              payCode.pay_type === "Overtime" ? biasaOtHrs : totalHours;
            return [
              buildActivity(payCode, rate, hoursToApply, "", isContextLinked),
            ];
          },
        );

        // Apply calculation logic to all activities with proper hours for each activity type
        const processedActivities = activities.map((activity) => ({
          ...activity,
          calculatedAmount: calculateActivityAmount(
            activity,
            activity.hoursApplied || totalHours,
            {},
          ),
        }));
        newEmployeeActivities[employeeId] = processedActivities;
      });

      setEmployeeActivities(newEmployeeActivities);
    },
    [
      employeeEntries,
      loadingPayCodeMappings,
      jobPayCodeDetails,
      employeeMappings,
      contextLinkedPayCodes,
      mode,
      supportsDayTypeHours,
      applyEffectiveRate,
    ],
  );

  // Effect to fetch activities when employee selection changes
  useEffect(() => {
    if (!loadingPayCodeMappings && Object.keys(employeeEntries).length > 0) {
      fetchAndApplyActivities(employeeActivities);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    employeeEntries,
    loadingPayCodeMappings,
    jobPayCodeDetails,
    employeeMappings,
    mode,
    applyEffectiveRate,
  ]);

  // Restore activities from existing work log in edit mode
  useEffect(() => {
    if (mode === "edit" && existingWorkLog?.employeeEntries) {
      const restoredActivities: Record<string, ActivityItem[]> = {};
      // Clear the saved activities ref for this work log
      savedEmployeeActivitiesRef.current = {};

      existingWorkLog.employeeEntries.forEach((entry: any) => {
        if (entry.activities && entry.activities.length > 0) {
          const activities = entry.activities.map((activity: any) => ({
            payCodeId: activity.pay_code_id,
            description: activity.description,
            payType: activity.pay_type,
            rateUnit: activity.rate_unit,
            rate: parseFloat(activity.rate_used),
            unitsProduced: activity.units_produced
              ? parseFloat(activity.units_produced)
              : undefined,
            hoursApplied: activity.hours_applied
              ? parseFloat(activity.hours_applied)
              : undefined,
            calculatedAmount: parseFloat(activity.calculated_amount),
            isSelected: true,
            isDefault: false,
          }));
          restoredActivities[entry.employee_id] = activities;
          // Also store in ref to preserve original state for deselect/re-select cycles
          savedEmployeeActivitiesRef.current[entry.employee_id] = activities;
        }
      });

      if (Object.keys(restoredActivities).length > 0) {
        setEmployeeActivities(restoredActivities);
      }
    }
  }, [mode, existingWorkLog]);

  // Fetch existing leave records for the selected month
  useEffect(() => {
    const fetchLeaveRecords = async () => {
      if (!formData.logMonth || !formData.logYear) return;

      try {
        const section = jobConfig?.section?.[0] || "";
        const response = await api.get(
          `/api/monthly-work-logs/leave/${formData.logYear}/${formData.logMonth}?section=${section}`,
        );

        const leaveRecords = response.map((record: any) => ({
          id: record.id,
          employeeId: record.employee_id,
          employeeName: record.employee_name,
          leaveDate: format(new Date(record.leave_date), "yyyy-MM-dd"),
          leaveType: record.leave_type,
          amountPaid: Number(record.amount_paid || 0),
          isNew: false,
        }));
        setExistingLeaveRecords(leaveRecords);
      } catch (error) {
        console.error("Error fetching leave records:", error);
      }
    };

    fetchLeaveRecords();
  }, [formData.logMonth, formData.logYear, jobConfig]);

  // Handlers
  const handleEmployeeSelect = (employeeId: string) => {
    setEmployeeEntries((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        selected: !prev[employeeId].selected,
      },
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

  const handleHoursChange = (
    employeeId: string,
    field: EmployeeHourField,
    value: string,
  ) => {
    const numValue = parseFloat(value) || 0;
    setEmployeeEntries((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: numValue,
      },
    }));
  };

  // Employees that already have a leave entry on the selected date (existing or new),
  // keyed by employee_id -> leave type label. Used to disable them in the picker.
  // Multi-ID employees: the flag is propagated across all sibling IDs so the
  // senior shown in the deduped picker disables when ANY sibling has leave that day.
  const employeesWithLeaveOnSelectedDate = useMemo(() => {
    const nameToIds = new Map<string, string[]>();
    const idToName = new Map<string, string>();
    for (const s of allStaffs || []) {
      idToName.set(s.id, s.name);
      const list = nameToIds.get(s.name);
      if (list) list.push(s.id);
      else nameToIds.set(s.name, [s.id]);
    }

    const map: Record<string, string> = {};
    [...existingLeaveRecords, ...newLeaveEntries].forEach((entry) => {
      if (entry.leaveDate !== leaveFormData.leaveDate) return;
      const name = idToName.get(entry.employeeId);
      const siblings = (name && nameToIds.get(name)) || [entry.employeeId];
      siblings.forEach((sib) => {
        map[sib] = entry.leaveType;
      });
    });
    return map;
  }, [allStaffs, existingLeaveRecords, newLeaveEntries, leaveFormData.leaveDate]);

  // Open Add Leave modal and pre-select currently-selected employees on the table.
  // The picker is deduped to senior IDs, so map each selected work-row's ID to
  // the senior sibling sharing the same name before pre-checking.
  const openAddLeaveModal = () => {
    const nameToSenior = new Map<string, string>();
    for (const emp of leaveEligibleEmployees) nameToSenior.set(emp.name, emp.id);
    const idToName = new Map<string, string>();
    for (const emp of allStaffs || []) idToName.set(emp.id, emp.name);

    const initialSelections: Record<string, boolean> = {};
    Object.values(employeeEntries).forEach((entry) => {
      if (!entry.selected) return;
      const name = idToName.get(entry.employeeId);
      const seniorId = (name && nameToSenior.get(name)) || entry.employeeId;
      initialSelections[seniorId] = true;
    });
    setLeaveEmployeeSelections(initialSelections);
    setLeaveEmployeeSearch("");
    setShowAddLeaveModal(true);
  };

  const closeAddLeaveModal = () => {
    setShowAddLeaveModal(false);
    setLeaveEmployeeSelections({});
    setLeaveEmployeeSearch("");
    setLeaveFormData({
      leaveDate: format(new Date(), "yyyy-MM-dd"),
      leaveType: "cuti_sakit",
      amountPaid: DEFAULT_LEAVE_AMOUNT_INPUT,
    });
  };

  const handleLeaveEmployeeToggle = (employeeId: string) => {
    if (employeesWithLeaveOnSelectedDate[employeeId]) return;
    setLeaveEmployeeSelections((prev) => ({
      ...prev,
      [employeeId]: !prev[employeeId],
    }));
  };

  const handleAddLeave = () => {
    if (!leaveFormData.leaveDate) {
      toast.error("Please select a date");
      return;
    }

    // Collect selected employee IDs, excluding those that already have leave on this date
    const targetEmployeeIds = Object.entries(leaveEmployeeSelections)
      .filter(
        ([id, selected]) => selected && !employeesWithLeaveOnSelectedDate[id],
      )
      .map(([id]) => id);

    if (targetEmployeeIds.length === 0) {
      toast.error("Please select at least one employee");
      return;
    }

    const leaveType = leaveFormData.leaveType;
    const leaveDate = leaveFormData.leaveDate;
    const trimmedAmount: string = leaveFormData.amountPaid.trim();
    const parsedAmount: number =
      trimmedAmount === "" ? DEFAULT_LEAVE_AMOUNT : Number(trimmedAmount);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Please enter a valid non-negative leave amount.");
      return;
    }

    const amountPaid: number = Math.round(parsedAmount * 100) / 100;

    const additions: LeaveEntry[] = targetEmployeeIds.map((employeeId) => {
      const employee = eligibleEmployees.find(
        (e: Employee) => e.id === employeeId,
      );
      return {
        employeeId,
        employeeName: employee?.name || "",
        leaveDate,
        leaveType,
        amountPaid,
        isNew: true,
      };
    });

    setNewLeaveEntries((prev) => [...prev, ...additions]);
    toast.success(
      additions.length === 1
        ? "Leave entry added"
        : `Added leave for ${additions.length} employees`,
    );
    closeAddLeaveModal();
  };

  // Auto-switch type to public holiday when the chosen date is a holiday
  const handleLeaveDateChange = (newDate: string) => {
    const isPublicHoliday = newDate && isHoliday(new Date(newDate));
    setLeaveFormData((prev) => ({
      ...prev,
      leaveDate: newDate,
      leaveType: isPublicHoliday ? "cuti_umum" : prev.leaveType,
    }));
  };

  // Selectable count = number of toggled employees that don't already have leave that day
  const leaveSelectedCount = useMemo(
    () =>
      Object.entries(leaveEmployeeSelections).filter(
        ([id, selected]) => selected && !employeesWithLeaveOnSelectedDate[id],
      ).length,
    [leaveEmployeeSelections, employeesWithLeaveOnSelectedDate],
  );

  const handleRemoveNewLeave = (index: number) => {
    setNewLeaveEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNewLeaveAmountChange = (index: number, value: string): void => {
    const trimmedAmount: string = value.trim();
    const parsedAmount: number = trimmedAmount === "" ? 0 : Number(value);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return;

    setNewLeaveEntries((prev) =>
      prev.map((leave, i) =>
        i === index
          ? { ...leave, amountPaid: Math.round(parsedAmount * 100) / 100 }
          : leave,
      ),
    );
  };

  const handleExistingLeaveAmountChange = (
    leaveId: number,
    value: string,
  ): void => {
    const trimmedAmount: string = value.trim();
    const parsedAmount: number = trimmedAmount === "" ? 0 : Number(value);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return;

    setExistingLeaveRecords((prev) =>
      prev.map((leave) =>
        leave.id === leaveId
          ? { ...leave, amountPaid: Math.round(parsedAmount * 100) / 100 }
          : leave,
      ),
    );
  };

  const handleRemoveExistingLeave = (leaveId: number) => {
    // Add to deleted list
    setDeletedLeaveIds((prev) => [...prev, leaveId]);
    // Remove from existing records display
    setExistingLeaveRecords((prev) =>
      prev.filter((leave) => leave.id !== leaveId),
    );
  };

  // Activities handlers
  const handleManageActivities = (entry: EmployeeEntry) => {
    setSelectedEmployee(entry);
    setShowActivitiesModal(true);
  };

  const handleActivitiesUpdated = (activities: ActivityItem[]) => {
    if (!selectedEmployee) return;

    // Recalculate amounts with proper hours for each activity type
    const recalculatedActivities = activities.map((activity) => ({
      ...activity,
      calculatedAmount: calculateActivityAmount(
        activity,
        activity.hoursApplied || selectedEmployee.totalHours,
        {},
      ),
    }));

    setEmployeeActivities((prev) => ({
      ...prev,
      [selectedEmployee.employeeId]: recalculatedActivities,
    }));
  };

  const handleSave = async () => {
    const selectedEmployees = Object.values(employeeEntries).filter(
      (e) => e.selected,
    );

    if (selectedEmployees.length === 0) {
      toast.error("Please select at least one employee");
      return;
    }

    // Validate hours
    for (const emp of selectedEmployees) {
      const regularHours = emp.totalHours || 0;
      const overtimeHours = emp.overtimeHours || 0;
      const ahadHours = supportsDayTypeHours ? emp.ahadHours || 0 : 0;
      const ahadOvertimeHours = supportsDayTypeHours
        ? emp.ahadOvertimeHours || 0
        : 0;
      const umumHours = supportsDayTypeHours ? emp.umumHours || 0 : 0;
      const umumOvertimeHours = supportsDayTypeHours
        ? emp.umumOvertimeHours || 0
        : 0;
      const hourValues: number[] = [
        regularHours,
        overtimeHours,
        ahadHours,
        ahadOvertimeHours,
        umumHours,
        umumOvertimeHours,
      ];
      const hasActivityAmount: boolean = hasSelectedActivityAmount(
        employeeActivities[emp.employeeId] || [],
      );

      if (hourValues.some((hours) => hours < 0)) {
        toast.error(`Hours cannot be negative for ${emp.employeeName}`);
        return;
      }

      if (
        hourValues.reduce((sum, hours) => sum + hours, 0) <= 0 &&
        !hasActivityAmount
      ) {
        toast.error(
          `Please enter valid hours or a paid activity for ${emp.employeeName}`,
        );
        return;
      }
    }

    setIsSaving(true);

    try {
      const payload = {
        logMonth: formData.logMonth,
        logYear: formData.logYear,
        section: jobConfig?.section?.[0] || "",
        contextData: {},
        status: "Submitted",
        employeeEntries: selectedEmployees.map((emp) => ({
          employeeId: emp.employeeId,
          jobType: emp.jobType,
          totalHours: emp.totalHours,
          overtimeHours: emp.overtimeHours,
          ahadHours: supportsDayTypeHours ? emp.ahadHours || 0 : 0,
          ahadOvertimeHours: supportsDayTypeHours
            ? emp.ahadOvertimeHours || 0
            : 0,
          umumHours: supportsDayTypeHours ? emp.umumHours || 0 : 0,
          umumOvertimeHours: supportsDayTypeHours
            ? emp.umumOvertimeHours || 0
            : 0,
          activities: (employeeActivities[emp.employeeId] || []).filter(
            (a) => a.isSelected,
          ),
        })),
        leaveEntries: newLeaveEntries.map((leave) => ({
          employeeId: leave.employeeId,
          leaveDate: leave.leaveDate,
          leaveType: leave.leaveType,
          isNew: true,
          amount_paid: leave.amountPaid,
        })),
        updatedLeaveEntries: existingLeaveRecords
          .filter((leave) => leave.id !== undefined)
          .map((leave) => ({
            id: leave.id,
            amount_paid: leave.amountPaid,
          })),
        deletedLeaveIds: deletedLeaveIds,
      };

      if (mode === "edit" && existingWorkLog) {
        await api.put(`/api/monthly-work-logs/${existingWorkLog.id}`, payload);
        toast.success("Monthly work log updated successfully");
      } else {
        await api.post("/api/monthly-work-logs", payload);
        toast.success("Monthly work log created successfully");
      }

      navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly`);
    } catch (error: any) {
      console.error("Error saving monthly work log:", error);
      console.error("Error details:", error?.data);
      // Handle specific error messages from API
      const errorMessage =
        error?.data?.message ||
        error?.message ||
        "Failed to save monthly work log";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly`);
    }
  };

  const handleRefreshCache = async () => {
    setIsRefreshingCache(true);
    try {
      await Promise.all([
        refreshJobs(),
        refreshStaffs(),
        refreshPayCodeMappings(),
      ]);
      toast.success("Data refreshed");
    } catch (err) {
      toast.error("Failed to refresh data");
    } finally {
      setIsRefreshingCache(false);
    }
  };

  // Get days in selected month for date picker constraint
  const getDaysInMonth = () => {
    return new Date(formData.logYear, formData.logMonth, 0).getDate();
  };

  const getMinDate = () => {
    return `${formData.logYear}-${String(formData.logMonth).padStart(2, "0")}-01`;
  };

  const getMaxDate = () => {
    return `${formData.logYear}-${String(formData.logMonth).padStart(2, "0")}-${String(getDaysInMonth()).padStart(2, "0")}`;
  };

  const getLeaveTypeLabel = (type: string) => {
    switch (type) {
      case "cuti_sakit":
        return "Sick Leave";
      case "cuti_tahunan":
        return "Annual Leave";
      case "cuti_umum":
        return "Public Holiday";
      case "cuti_rawatan":
        return "Hospital Leave";
      default:
        return type;
    }
  };

  const getLeaveTypeColor = (type: string) => {
    switch (type) {
      case "cuti_sakit":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
      case "cuti_tahunan":
        return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300";
      case "cuti_umum":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "cuti_rawatan":
        return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
      default:
        return "bg-default-100 text-default-700 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const formatLeaveAmount = (amount: number): string => {
    return (Math.round(amount * 100) / 100).toFixed(2);
  };

  const handleLeaveAmountBlur = (): void => {
    const trimmedAmount: string = leaveFormData.amountPaid.trim();
    if (trimmedAmount === "") {
      setLeaveFormData((prev) => ({
        ...prev,
        amountPaid: DEFAULT_LEAVE_AMOUNT_INPUT,
      }));
      return;
    }

    const parsedAmount: number = Number(trimmedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return;

    setLeaveFormData((prev) => ({
      ...prev,
      amountPaid: formatLeaveAmount(parsedAmount),
    }));
  };

  const allSelected =
    Object.values(employeeEntries).length > 0 &&
    Object.values(employeeEntries).every((e) => e.selected);

  // Block save when any selected employee has negative hours
  const hasHoursValidationError = Object.values(employeeEntries).some(
    (e) =>
      e.selected &&
      getEmployeeHourValues(e, supportsDayTypeHours).some(
        (hours: number) => hours < 0,
      ),
  );

  const renderHourInput = (
    entry: EmployeeEntry,
    field: EmployeeHourField,
    ariaLabel: string,
  ) => {
    const value = entry[field] || 0;
    const hasInvalidHours = entry.selected && value < 0;

    return (
      <input
        type="number"
        value={entry.selected ? value : ""}
        onChange={(e) =>
          handleHoursChange(entry.employeeId, field, e.target.value)
        }
        onClick={(e) => e.stopPropagation()}
        disabled={!entry.selected || isSaving}
        title={hasInvalidHours ? "Hours cannot be negative" : ariaLabel}
        aria-label={ariaLabel}
        className={`w-full min-w-[4.25rem] pl-3 py-1 text-center text-sm border rounded focus:ring-1 disabled:bg-default-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-800 dark:text-gray-100 disabled:text-default-400 dark:disabled:text-gray-500 ${
          hasInvalidHours
            ? "border-rose-500 focus:ring-rose-500 focus:border-rose-500 text-rose-700 dark:text-rose-400"
            : "border-default-300 dark:border-gray-600 focus:ring-sky-500 focus:border-sky-500"
        }`}
        min="0"
        step="0.5"
      />
    );
  };

  const renderHourGroup = (
    entry: EmployeeEntry,
    hoursField: EmployeeHourField,
    overtimeField: EmployeeHourField,
    label: string,
  ) => (
    <div className="min-w-[9.5rem] rounded-md border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
      <div className="mb-1 text-center text-[11px] font-semibold uppercase text-default-500 dark:text-gray-400">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <div className="mb-0.5 text-center text-[10px] uppercase text-default-400 dark:text-gray-500">
            Hrs
          </div>
          {renderHourInput(entry, hoursField, `${label} hours`)}
        </div>
        <div>
          <div className="mb-0.5 text-center text-[10px] uppercase text-default-400 dark:text-gray-500">
            OT
          </div>
          {renderHourInput(entry, overtimeField, `${label} overtime hours`)}
        </div>
      </div>
    </div>
  );

  const allLeaveRecords = [...existingLeaveRecords, ...newLeaveEntries];

  if (loadingStaffs) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Month/Year Selection */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-default-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleCancel} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {mode === "edit" ? "Edit" : "New"} {jobConfig?.name} Monthly Entry
            </h1>
            <div className="w-px h-6 bg-default-300 dark:bg-gray-600" />
            {mode === "edit" ? (
              <div className="px-4 py-2 bg-default-100 dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg text-sm font-medium text-default-700 dark:text-gray-200">
                {monthOptions.find((m) => m.id === formData.logMonth)?.name}{" "}
                {formData.logYear}
              </div>
            ) : (
              <div className="flex gap-4 items-center">
                <MonthNavigator
                  selectedMonth={selectedMonthDate}
                  onChange={handleMonthNavigatorChange}
                  formatDisplay={(date) =>
                    date.toLocaleDateString("en-MY", { month: "long" })
                  }
                  showGoToCurrentButton={false}
                />
                <YearNavigator
                  selectedYear={formData.logYear}
                  onChange={handleYearNavigatorChange}
                  showGoToCurrentButton={false}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefreshCache}
              disabled={isRefreshingCache}
              className="px-3 py-1.5 flex items-center gap-1.5 rounded-full border border-default-300 dark:border-gray-600 hover:bg-default-100 dark:hover:bg-gray-700 text-default-600 dark:text-gray-300 text-sm font-medium transition-colors disabled:opacity-50"
              title="Refresh staff, jobs, and pay codes"
            >
              <IconRefresh
                size={16}
                className={isRefreshingCache ? "animate-spin" : ""}
              />
              Refresh
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              color="sky"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || hasHoursValidationError}
              title={
                hasHoursValidationError
                  ? "Some employees have negative hours"
                  : ""
              }
            >
              {isSaving ? "Saving..." : mode === "edit" ? "Update" : "Save"}
            </Button>
          </div>
        </div>
      </div>

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
                <th className="px-6 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap">
                  Job
                </th>
                <th className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap w-44">
                  Biasa
                </th>
                {supportsDayTypeHours && (
                  <>
                    <th className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap w-44">
                      Ahad
                    </th>
                    <th className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap w-44">
                      Umum
                    </th>
                  </>
                )}
                <th className="px-6 py-1 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase whitespace-nowrap">
                  Activities
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 dark:divide-gray-700">
              {Object.values(employeeEntries).map((entry, index) => (
                <tr
                  key={entry.employeeId}
                  className={`${
                    entry.selected
                      ? "bg-sky-50 dark:bg-sky-900/20"
                      : "bg-white dark:bg-gray-800"
                  } hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer`}
                  onClick={() => handleEmployeeSelect(entry.employeeId)}
                >
                  <td
                    className="px-6 py-2 whitespace-nowrap cursor-pointer"
                    onClickCapture={(e) => {
                      e.stopPropagation();
                      if (!isSaving) {
                        handleEmployeeSelect(entry.employeeId);
                      }
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
                    <Link
                      to={`/catalogue/staff/${entry.employeeId}`}
                      className="hover:underline hover:text-sky-600 dark:text-sky-400"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.employeeId}
                    </Link>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                    <span className="font-medium">{entry.employeeName}</span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-default-600 dark:text-gray-300">
                    <Link
                      to={`/catalogue/job?id=${entry.jobType}`}
                      className="hover:underline hover:text-sky-600 dark:text-sky-400"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.jobName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {renderHourGroup(
                      entry,
                      "totalHours",
                      "overtimeHours",
                      "Biasa",
                    )}
                  </td>
                  {supportsDayTypeHours && (
                    <>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {renderHourGroup(
                          entry,
                          "ahadHours",
                          "ahadOvertimeHours",
                          "Ahad",
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {renderHourGroup(
                          entry,
                          "umumHours",
                          "umumOvertimeHours",
                          "Umum",
                        )}
                      </td>
                    </>
                  )}
                  <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                    <ActivitiesTooltip
                      activities={(
                        employeeActivities[entry.employeeId] || []
                      ).filter((activity) => activity.isSelected)}
                      employeeName={entry.employeeName}
                      className={
                        !entry.selected
                          ? "disabled:text-default-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed"
                          : ""
                      }
                      disabled={!entry.selected}
                      onClick={() => handleManageActivities(entry)}
                      showBelow={index < 5}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Object.values(employeeEntries).length === 0 && (
          <div className="p-8 text-center text-default-500 dark:text-gray-400">
            No employees found for this job type.
          </div>
        )}
      </div>

      {/* Leave Records Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
        <div className="p-4 border-b border-default-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-medium text-default-700 dark:text-gray-200">
              Leave Records for{" "}
              {monthOptions.find((m) => m.id === formData.logMonth)?.name}{" "}
              {formData.logYear}
            </h2>
            <p className="text-xs text-default-500 dark:text-gray-400 mt-1">
              View existing leave and add new leave entries for this month
            </p>
          </div>
          <Button
            onClick={openAddLeaveModal}
            icon={IconPlus}
            color="sky"
            size="sm"
            disabled={isSaving}
          >
            Add Leave
          </Button>
        </div>

        {allLeaveRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Employee
                  </th>
                  <th className="px-4 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-1 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Amount
                  </th>
                  <th className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                {allLeaveRecords.map((leave, index) => {
                  const newLeaveIndex: number = newLeaveEntries.indexOf(
                    leave,
                  );
                  const canEditAmount: boolean =
                    (leave.isNew && newLeaveIndex >= 0) ||
                    (!leave.isNew && leave.id !== undefined);

                  return (
                    <tr
                      key={`${leave.employeeId}-${leave.leaveDate}-${index}`}
                      className="bg-white dark:bg-gray-800 hover:bg-default-50 dark:hover:bg-gray-700"
                    >
                      <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
                        <span className="font-medium">
                          {leave.employeeName}
                        </span>
                        <span className="text-default-400 dark:text-gray-500 ml-2">
                          ({leave.employeeId})
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
                        {format(new Date(leave.leaveDate), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getLeaveTypeColor(
                            leave.leaveType,
                          )}`}
                        >
                          {getLeaveTypeLabel(leave.leaveType)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-default-700 dark:text-gray-200">
                        {canEditAmount ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={leave.amountPaid}
                            onChange={(e) =>
                              leave.isNew
                                ? handleNewLeaveAmountChange(
                                    newLeaveIndex,
                                    e.target.value,
                                  )
                                : handleExistingLeaveAmountChange(
                                    leave.id!,
                                    e.target.value,
                                  )
                            }
                            disabled={isSaving}
                            className="w-24 rounded-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-right text-sm text-default-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-default-100 dark:disabled:bg-gray-700 disabled:text-default-400 dark:disabled:text-gray-500"
                          />
                        ) : (
                          <>RM {formatLeaveAmount(leave.amountPaid)}</>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {leave.isNew ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                            New
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300">
                            Existing
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => {
                            if (leave.isNew) {
                              handleRemoveNewLeave(newLeaveIndex);
                            } else if (leave.id) {
                              handleRemoveExistingLeave(leave.id);
                            }
                          }}
                          className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300"
                          title="Remove"
                          disabled={isSaving}
                        >
                          <IconTrash size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-default-500 dark:text-gray-400">
            <IconCalendar
              size={32}
              className="mx-auto mb-2 text-default-300 dark:text-gray-600"
            />
            <p>No leave records for this month.</p>
            <p className="text-xs mt-1">
              Click "Add Leave" to record leave entries.
            </p>
          </div>
        )}
      </div>

      {/* Add Leave Modal (multi-employee) */}
      <Transition appear show={showAddLeaveModal} as={React.Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-50 overflow-y-auto"
          onClose={closeAddLeaveModal}
        >
          <div className="min-h-screen px-4 text-center">
            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black opacity-30 z-40" />
            </TransitionChild>

            <span
              className="inline-block h-screen align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>

            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className="relative z-50 inline-block w-full max-w-2xl p-6 my-8 overflow-visible text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-900 dark:text-gray-100 flex items-center gap-2"
                >
                  <IconUsers
                    size={20}
                    className="text-sky-600 dark:text-sky-400"
                  />
                  Add Leave
                </DialogTitle>
                <p className="text-xs text-default-500 dark:text-gray-400 mt-1">
                  Pick a date and leave type, then select one or more employees.
                </p>

                {/* Date + Type + Amount row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                      Date
                    </label>
                    <div className="relative h-10">
                      <IconCalendar
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 pointer-events-none"
                      />
                      <input
                        type="date"
                        value={leaveFormData.leaveDate}
                        min={getMinDate()}
                        max={getMaxDate()}
                        onChange={(e) => handleLeaveDateChange(e.target.value)}
                        className="w-full h-full pl-10 pr-3 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-transparent text-default-900 dark:text-gray-100 text-left focus:outline-none focus:border-default-500 dark:focus:border-gray-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                      Leave Type
                    </label>
                    <StyledListbox
                      value={leaveFormData.leaveType}
                      onChange={(value) =>
                        setLeaveFormData({
                          ...leaveFormData,
                          leaveType: value as LeaveType,
                        })
                      }
                      options={[
                        { id: "cuti_sakit", name: "Sick Leave" },
                        { id: "cuti_tahunan", name: "Annual Leave" },
                        { id: "cuti_umum", name: "Public Holiday" },
                        { id: "cuti_rawatan", name: "Hospital Leave" },
                      ]}
                      rounded="lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                      Amount
                    </label>
                    <div className="relative h-10">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-default-400 dark:text-gray-400 pointer-events-none">
                        RM
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={leaveFormData.amountPaid}
                        onChange={(e) =>
                          setLeaveFormData({
                            ...leaveFormData,
                            amountPaid: e.target.value,
                          })
                        }
                        onBlur={handleLeaveAmountBlur}
                        className="w-full h-full pl-10 pr-3 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-transparent text-default-900 dark:text-gray-100 text-right focus:outline-none focus:border-default-500 dark:focus:border-gray-500"
                      />
                    </div>
                  </div>
                </div>

                {leaveFormData.leaveDate &&
                  isHoliday(new Date(leaveFormData.leaveDate)) && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-sky-600 dark:text-sky-400">
                      <IconAlertCircle size={14} />
                      <span>
                        Public holiday:{" "}
                        {getHolidayDescription(
                          new Date(leaveFormData.leaveDate),
                        )}
                      </span>
                    </div>
                  )}

                {/* Employee picker */}
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-default-700 dark:text-gray-200">
                      Employees
                      <span className="ml-2 text-xs font-normal text-default-500 dark:text-gray-400">
                        {leaveSelectedCount} selected
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        // Toggle select-all among currently-visible+selectable employees
                        const visibleSelectable = leaveEligibleEmployees.filter(
                          (emp: Employee) => {
                            if (employeesWithLeaveOnSelectedDate[emp.id])
                              return false;
                            if (!leaveEmployeeSearch.trim()) return true;
                            const q = leaveEmployeeSearch.trim().toLowerCase();
                            return (
                              emp.name.toLowerCase().includes(q) ||
                              emp.id.toLowerCase().includes(q)
                            );
                          },
                        );
                        const allOn =
                          visibleSelectable.length > 0 &&
                          visibleSelectable.every(
                            (emp: Employee) => leaveEmployeeSelections[emp.id],
                          );
                        const next = { ...leaveEmployeeSelections };
                        visibleSelectable.forEach((emp: Employee) => {
                          next[emp.id] = !allOn;
                        });
                        setLeaveEmployeeSelections(next);
                      }}
                      className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 font-medium"
                    >
                      {(() => {
                        const visibleSelectable = leaveEligibleEmployees.filter(
                          (emp: Employee) => {
                            if (employeesWithLeaveOnSelectedDate[emp.id])
                              return false;
                            if (!leaveEmployeeSearch.trim()) return true;
                            const q = leaveEmployeeSearch.trim().toLowerCase();
                            return (
                              emp.name.toLowerCase().includes(q) ||
                              emp.id.toLowerCase().includes(q)
                            );
                          },
                        );
                        const allOn =
                          visibleSelectable.length > 0 &&
                          visibleSelectable.every(
                            (emp: Employee) => leaveEmployeeSelections[emp.id],
                          );
                        return allOn ? "Deselect All" : "Select All";
                      })()}
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative mb-2">
                    <IconSearch
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
                    />
                    <input
                      type="text"
                      value={leaveEmployeeSearch}
                      onChange={(e) => setLeaveEmployeeSearch(e.target.value)}
                      placeholder="Search by name or ID..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-default-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  {/* Employee list */}
                  <div className="max-h-72 overflow-y-auto border border-default-200 dark:border-gray-700 rounded-lg divide-y divide-default-100 dark:divide-gray-700">
                    {(() => {
                      const q = leaveEmployeeSearch.trim().toLowerCase();
                      const filtered = leaveEligibleEmployees.filter(
                        (emp: Employee) => {
                          const groupedIds: string[] =
                            groupedStaffIdsByEmployeeId.get(emp.id) || [emp.id];
                          const groupedIdsText: string = groupedIds
                            .join(" ")
                            .toLowerCase();

                          return (
                            !q ||
                            emp.name.toLowerCase().includes(q) ||
                            groupedIdsText.includes(q)
                          );
                        },
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="p-6 text-center text-sm text-default-500 dark:text-gray-400">
                            No employees match your search.
                          </div>
                        );
                      }
                      return filtered.map((emp: Employee) => {
                        const existingType =
                          employeesWithLeaveOnSelectedDate[emp.id];
                        const isDisabled = !!existingType;
                        const isChecked =
                          !!leaveEmployeeSelections[emp.id] && !isDisabled;
                        const groupedIds: string[] =
                          groupedStaffIdsByEmployeeId.get(emp.id) || [emp.id];
                        const hasCollapsedIds: boolean = groupedIds.length > 1;
                        const groupedIdsText: string = groupedIds.join(", ");
                        return (
                          <div
                            key={emp.id}
                            className={`flex items-center px-3 py-2 ${
                              isDisabled
                                ? "bg-default-50 dark:bg-gray-900/40 cursor-not-allowed"
                                : isChecked
                                  ? "bg-sky-50 dark:bg-sky-900/30 cursor-pointer"
                                  : "hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer"
                            }`}
                            onClick={() => handleLeaveEmployeeToggle(emp.id)}
                          >
                            <Checkbox
                              checked={isChecked}
                              onChange={() => handleLeaveEmployeeToggle(emp.id)}
                              size={18}
                              checkedColor="text-sky-600"
                              disabled={isDisabled}
                            />
                            <div className="ml-3 flex-1 min-w-0 flex items-center justify-between gap-3">
                              <div className="text-sm min-w-0">
                                <span
                                  className={`font-medium ${isDisabled ? "text-default-400 dark:text-gray-500" : "text-default-700 dark:text-gray-200"}`}
                                >
                                  {emp.name}
                                </span>
                                <span
                                  className={`ml-2 ${isDisabled ? "text-default-300 dark:text-gray-600" : "text-default-400 dark:text-gray-500"}`}
                                >
                                  ({emp.id})
                                </span>
                                {hasCollapsedIds && (
                                  <div
                                    className={`text-xs mt-0.5 break-words ${isDisabled ? "text-default-300 dark:text-gray-600" : "text-sky-600 dark:text-sky-400"}`}
                                  >
                                    Collapsed IDs: {groupedIdsText}
                                  </div>
                                )}
                              </div>
                              {isDisabled && (
                                <span
                                  className={`inline-flex flex-shrink-0 items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getLeaveTypeColor(existingType)}`}
                                >
                                  <IconCheck size={12} />
                                  {getLeaveTypeLabel(existingType)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-2">
                  <button
                    type="button"
                    className="inline-flex justify-center px-4 py-2 text-sm font-medium text-default-700 dark:text-gray-200 bg-default-100 dark:bg-gray-800 border border-transparent rounded-full hover:bg-default-200 active:bg-default-300 focus:outline-none"
                    onClick={closeAddLeaveModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={leaveSelectedCount === 0}
                    className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-sky-500 border border-transparent rounded-full hover:bg-sky-600 active:bg-sky-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleAddLeave}
                  >
                    {leaveSelectedCount > 1
                      ? `Add Leave for ${leaveSelectedCount} Employees`
                      : "Add Leave"}
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>

      {/* Manage Activities Modal */}
      <ManageActivitiesModal
        isOpen={showActivitiesModal}
        onClose={() => setShowActivitiesModal(false)}
        employee={
          selectedEmployee
            ? ({
                id: selectedEmployee.employeeId,
                name: selectedEmployee.employeeName,
              } as Employee)
            : null
        }
        jobType={selectedEmployee?.jobType || ""}
        jobName={selectedEmployee?.jobName || ""}
        employeeHours={selectedEmployee?.totalHours || 0}
        dayType="Biasa"
        onActivitiesUpdated={handleActivitiesUpdated}
        existingActivities={
          selectedEmployee
            ? employeeActivities[selectedEmployee.employeeId] || []
            : []
        }
        contextLinkedPayCodes={contextLinkedPayCodes}
        contextData={{}}
      />
    </div>
  );
};

export default MonthlyLogEntryPage;

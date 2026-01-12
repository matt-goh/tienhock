// src/pages/Payroll/DailyLogEntryPage.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Fragment,
} from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../../components/Button";
import { FormListbox } from "../../../components/FormComponents";
import { Employee } from "../../../types/types";
import BackButton from "../../../components/BackButton";
import { format } from "date-fns";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Checkbox from "../../../components/Checkbox";
import ManageActivitiesModal from "../../../components/Payroll/ManageActivitiesModal";
import ActivitiesTooltip from "../../../components/Payroll/ActivitiesTooltip";
import toast from "react-hot-toast";
import { useJobsCache } from "../../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import { useJobPayCodeMappings } from "../../../utils/catalogue/useJobPayCodeMappings";
import { api } from "../../../routes/utils/api";
import { useHolidayCache } from "../../../utils/payroll/useHolidayCache";
import {
  getJobConfig,
  getContextLinkedPayCodes,
  getJobIds,
} from "../../../configs/payrollJobConfigs";
import DynamicContextForm from "../../../components/Payroll/DynamicContextForm";
import {
  calculateActivityAmount,
  calculateActivitiesAmounts,
} from "../../../utils/payroll/calculateActivityAmount";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { IconChevronDown, IconCheck, IconRefresh } from "@tabler/icons-react";
import { useUnsavedChanges } from "../../../hooks/useUnsavedChanges";
import SafeLink from "../../../components/SafeLink";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

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

type LeaveType = "cuti_umum" | "cuti_sakit" | "cuti_tahunan";

interface LeaveEntry {
  selected: boolean;
  leaveType: LeaveType;
}

interface ActivityItem {
  payCodeId: string;
  description: string;
  payType: string;
  rateUnit: string;
  rate: number;
  isDefault: boolean;
  isSelected: boolean;
  unitsProduced?: number;
  calculatedAmount: number;
  isContextLinked?: boolean;
  source?: "job" | "employee";
}

const DailyLogEntryPage: React.FC<DailyLogEntryPageProps> = ({
  mode = "create",
  existingWorkLog,
  onCancel,
  jobType = "MEE",
}) => {
  const navigate = useNavigate();
  const { jobs: allJobs, loading: loadingJobs, refreshJobs } = useJobsCache();
  const { staffs: allStaffs, loading: loadingStaffs, refreshStaffs } = useStaffsCache();
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);
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
  const [leaveEmployees, setLeaveEmployees] = useState<
    Record<string, LeaveEntry>
  >({});
  const [leaveEmployeeActivities, setLeaveEmployeeActivities] = useState<
    Record<string, ActivityItem[]>
  >({});
  const [showLeaveActivitiesModal, setShowLeaveActivitiesModal] =
    useState(false);
  const [selectedLeaveEmployee, setSelectedLeaveEmployee] =
    useState<EmployeeWithHours | null>(null);
  const [isInitializationComplete, setIsInitializationComplete] =
    useState(false);
  const [leaveSelectAll, setLeaveSelectAll] = useState(false);
  const [leaveBalances, setLeaveBalances] = useState<
    Record<
      string,
      {
        cuti_tahunan_total: number;
        cuti_sakit_total: number;
        cuti_umum_total: number;
        cuti_tahunan_taken: number;
        cuti_sakit_taken: number;
        cuti_umum_taken: number;
      }
    >
  >({});
  // State for BIHUN_SANGKUT tray counts (only used for BIHUN jobType)
  const [trayCounts, setTrayCounts] = useState<Record<string, number>>({});
  // State for Force OT hours (only used for BIHUN jobType)
  const [forceOTHours, setForceOTHours] = useState<Record<string, number>>({});
  // State for Sunday Cleaning Mode (only for BIHUN and BOILER on AHAD days)
  const [isCleaningMode, setIsCleaningMode] = useState(false);
  // State for HARI_AHAD_JAM paycode data (fetched when cleaning mode is enabled)
  const [cleaningPayCode, setCleaningPayCode] = useState<{
    id: string;
    description: string;
    pay_type: string;
    rate_unit: string;
    rate_biasa: number;
    rate_ahad: number;
    rate_umum: number;
  } | null>(null);

  const { isHoliday, getHolidayDescription, holidays } = useHolidayCache();
  const JOB_IDS = getJobIds(jobType);
  // Get job configuration
  const jobConfig = getJobConfig(jobType);
  const contextLinkedPayCodes = jobConfig
    ? getContextLinkedPayCodes(jobConfig)
    : {};

  // Constant for the BHANGKUT paycode ID (for BIHUN_SANGKUT tray linking)
  const BHANGKUT_PAYCODE = "BHANGKUT";

  // Check if current page is BIHUN production (for conditionally showing Tray column)
  const isBihunPage = jobType === "BIHUN";

  // Helper function to determine day type based on date
  const determineDayType = (date: Date): "Biasa" | "Ahad" | "Umum" => {
    // Check if it's a holiday first
    if (isHoliday(date)) return "Umum";

    // Then check if it's Sunday
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return "Ahad";

    return "Biasa";
  };

  // Helper function to get default hours based on day of week
  // Saturday (day 6) has 5-hour default, other days have 7-hour default
  const getDefaultHours = (logDate: string): number => {
    const date = new Date(logDate);
    const dayOfWeek = date.getDay();
    // Saturday = 6, use 5 hours; other days use 7 hours
    return dayOfWeek === 6 ? 5 : 7;
  };

  // Initialize form data with dynamic context fields
  const [formData, setFormData] = useState<DailyLogFormData>(() => {
    if (mode === "edit" && existingWorkLog) {
      // Parse the date properly to get the local date (not UTC date)
      // The log_date is stored as UTC, so we need to convert to local timezone
      const parsedDate = new Date(existingWorkLog.log_date);
      const localDateString = format(parsedDate, "yyyy-MM-dd");

      return {
        logDate: localDateString,
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

  // Show cleaning mode toggle only for BIHUN and BOILER on AHAD (Sunday) days
  const showCleaningModeToggle = useMemo(() => {
    return (jobType === "BIHUN" || jobType === "BOILER") && formData.dayType === "Ahad";
  }, [jobType, formData.dayType]);

  const {
    employeeMappings,
    detailedMappings: jobPayCodeDetails,
    loading: loadingPayCodeMappings,
    refreshData: refreshPayCodeMappings,
  } = useJobPayCodeMappings();
  const [isSaving, setIsSaving] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [initialState, setInitialState] = useState<{
    formData: DailyLogFormData;
    employeeSelectionState: any;
    employeeActivities: Record<string, any[]>;
    leaveEmployees: Record<string, LeaveEntry>;
    leaveEmployeeActivities: Record<string, ActivityItem[]>;
    leaveBalances: Record<string, any>;
    trayCounts: Record<string, number>;
    forceOTHours: Record<string, number>;
    isCleaningMode: boolean;
  } | null>(null);

  // Ref to track which work log's formData has been initialized
  const formDataInitializedForRef = useRef<number | null>(null);
  // Ref to track which employee row keys were originally saved in the work log
  // Used to determine whether to use CREATE mode or EDIT mode activity selection logic
  const savedEmployeeRowKeysRef = useRef<Set<string>>(new Set());
  // Ref to store the original saved activities from the work log
  // This preserves the original state even if the employee is deselected and re-selected
  const savedEmployeeActivitiesRef = useRef<Record<string, any[]>>({});

  // Sync formData when existingWorkLog changes (useState initializer only runs once)
  // This handles navigation between different edit pages
  useEffect(() => {
    if (mode === "edit" && existingWorkLog) {
      const currentWorkLogId = existingWorkLog.id;
      // Only update if this is a different work log than what we've initialized for
      if (formDataInitializedForRef.current !== currentWorkLogId) {
        formDataInitializedForRef.current = currentWorkLogId;
        // Parse the date properly to get the local date (not UTC date)
        const parsedDate = new Date(existingWorkLog.log_date);
        const localDateString = format(parsedDate, "yyyy-MM-dd");

        setFormData({
          logDate: localDateString,
          shift: existingWorkLog.shift.toString(),
          contextData: existingWorkLog.context_data || {},
          dayType: existingWorkLog.day_type,
          employees: [],
        });

        // Restore cleaning mode state from context_data (for BIHUN/BOILER on Sundays)
        if (existingWorkLog.context_data?.isCleaningMode) {
          setIsCleaningMode(true);
        } else {
          setIsCleaningMode(false);
        }
      }
    }
  }, [mode, existingWorkLog]);

  // Function to normalize objects for comparison (handles key ordering)
  const normalizeForComparison = useCallback((obj: any): string => {
    if (obj === null || obj === undefined) return String(obj);
    if (typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) {
      return JSON.stringify(obj.map(normalizeForComparison));
    }
    // Sort keys to ensure consistent ordering
    const sortedObj: any = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sortedObj[key] = obj[key];
      });
    return JSON.stringify(sortedObj);
  }, []);

  // Function to check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    // Don't show unsaved changes if initialization isn't complete yet
    if (!initialState || !isInitializationComplete) return false;

    // For create mode, also check if we have any meaningful data to compare
    if (mode === "create") {
      const hasAnySelections =
        Object.keys(employeeSelectionState.selectedJobs).length > 0 ||
        Object.keys(leaveEmployees).some((id) => leaveEmployees[id].selected);

      // If no selections made yet, don't show unsaved changes
      if (!hasAnySelections) return false;
    }

    // Compare normalized JSON strings for more reliable comparison
    // Note: trayCounts excluded - synced with activities anyway
    try {
      return (
        normalizeForComparison(formData) !==
          normalizeForComparison(initialState.formData) ||
        normalizeForComparison(employeeSelectionState) !==
          normalizeForComparison(initialState.employeeSelectionState) ||
        normalizeForComparison(employeeActivities) !==
          normalizeForComparison(initialState.employeeActivities) ||
        normalizeForComparison(leaveEmployees) !==
          normalizeForComparison(initialState.leaveEmployees) ||
        normalizeForComparison(leaveEmployeeActivities) !==
          normalizeForComparison(initialState.leaveEmployeeActivities) ||
        normalizeForComparison(leaveBalances) !==
          normalizeForComparison(initialState.leaveBalances) ||
        normalizeForComparison(forceOTHours) !==
          normalizeForComparison(initialState.forceOTHours) ||
        isCleaningMode !== initialState.isCleaningMode
      );
    } catch (error) {
      console.warn("Error comparing states, defaulting to no changes:", error);
      return false;
    }
  }, [
    formData,
    employeeSelectionState,
    employeeActivities,
    leaveEmployees,
    leaveEmployeeActivities,
    leaveBalances,
    forceOTHours,
    isCleaningMode,
    initialState,
    isInitializationComplete,
    mode,
    normalizeForComparison,
  ]);

  const {
    safeNavigate,
    showConfirmDialog,
    handleConfirmNavigation,
    handleCancelNavigation,
    confirmationMessage,
  } = useUnsavedChanges({
    hasUnsavedChanges,
    message:
      "You have unsaved changes. Are you sure you want to leave this page?",
  });

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
              formData.contextData,
              undefined,
              formData.logDate
            );
          });

          return updatedActivities;
        });
      }
    });
  }, [formData.contextData, jobConfig, employeeSelectionState.jobHours]);

  // Clear Cuti Umum selections when day type changes from holiday to non-holiday
  useEffect(() => {
    if (formData.dayType !== "Umum") {
      setLeaveEmployees((prev) => {
        const newLeaveEmployees = { ...prev };
        Object.keys(newLeaveEmployees).forEach((empId) => {
          if (newLeaveEmployees[empId].leaveType === "cuti_umum") {
            newLeaveEmployees[empId].leaveType = "cuti_sakit";
          }
        });
        return newLeaveEmployees;
      });
    }
  }, [formData.dayType]);

  // Reset cleaning mode when day type changes from Ahad to non-Ahad
  useEffect(() => {
    if (formData.dayType !== "Ahad" && isCleaningMode) {
      setIsCleaningMode(false);
    }
  }, [formData.dayType, isCleaningMode]);

  // Fetch HARI_AHAD_JAM paycode when cleaning mode is enabled
  useEffect(() => {
    if (isCleaningMode && !cleaningPayCode) {
      api.get("/api/pay-codes/HARI_AHAD_JAM")
        .then((res: any) => {
          setCleaningPayCode({
            id: res.id,
            description: res.description,
            pay_type: res.pay_type,
            rate_unit: res.rate_unit,
            rate_biasa: parseFloat(res.rate_biasa) || 0,
            rate_ahad: parseFloat(res.rate_ahad) || 0,
            rate_umum: parseFloat(res.rate_umum) || 0,
          });
        })
        .catch(() => {
          toast.error("HARI_AHAD_JAM paycode not found. Please create it first.");
          setIsCleaningMode(false);
        });
    }
  }, [isCleaningMode, cleaningPayCode]);

  // Update BHANGKUT activities when trayCounts changes (BIHUN jobType only)
  useEffect(() => {
    if (!isInitializationComplete || !isBihunPage) return;

    Object.entries(trayCounts).forEach(([rowKey, trayCount]) => {
      // Only process if activities exist for this row
      if (employeeActivities[rowKey] && employeeActivities[rowKey].length > 0) {
        setEmployeeActivities((prev) => {
          const activities = prev[rowKey] || [];
          let hasChanges = false;

          const updatedActivities = activities.map((activity) => {
            if (activity.payCodeId === BHANGKUT_PAYCODE) {
              const newAmount = trayCount * (activity.rate || 0);
              if (
                activity.unitsProduced !== trayCount ||
                activity.calculatedAmount !== newAmount ||
                activity.isSelected !== (trayCount > 0)
              ) {
                hasChanges = true;
                return {
                  ...activity,
                  unitsProduced: trayCount,
                  isSelected: trayCount > 0,
                  calculatedAmount: newAmount,
                };
              }
            }
            return activity;
          });

          if (hasChanges) {
            return { ...prev, [rowKey]: updatedActivities };
          }
          return prev;
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayCounts, isInitializationComplete, isBihunPage]);

  // Update OT activities when forceOTHours changes (BIHUN only)
  useEffect(() => {
    if (!isInitializationComplete || !isBihunPage) return;

    Object.entries(forceOTHours).forEach(([rowKey, forceOT]) => {
      if (employeeActivities[rowKey] && employeeActivities[rowKey].length > 0) {
        setEmployeeActivities((prev) => {
          const activities = prev[rowKey] || [];
          const [employeeId, jobType] = rowKey.split("-");
          const hours =
            employeeSelectionState.jobHours[employeeId]?.[jobType] || 0;
          const otThreshold = getDefaultHours(formData.logDate) === 5 ? 5 : 8;
          const naturalOT = Math.max(0, hours - otThreshold);
          const totalOT = naturalOT + forceOT;
          let hasChanges = false;

          const updatedActivities = activities.map((activity) => {
            if (activity.payType === "Overtime" && activity.rateUnit === "Hour") {
              const newAmount = totalOT * (activity.rate || 0);
              const newSelected = totalOT > 0;
              if (
                activity.calculatedAmount !== newAmount ||
                activity.isSelected !== newSelected
              ) {
                hasChanges = true;
                return {
                  ...activity,
                  calculatedAmount: newAmount,
                  isSelected: newSelected,
                };
              }
            }
            return activity;
          });

          if (hasChanges) {
            return { ...prev, [rowKey]: updatedActivities };
          }
          return prev;
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOTHours, isInitializationComplete, isBihunPage, employeeSelectionState.jobHours, formData.logDate]);

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
      const configJobs = (employee.job || []).filter((jobId: string) =>
        JOB_IDS.includes(jobId)
      );

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

    // Sort by job name first, then employee name
    return expanded.sort(
      (a: { jobName: any; name: string }, b: { jobName: any; name: any }) => {
        const jobCompare = (a.jobName || "").localeCompare(b.jobName || "");
        if (jobCompare !== 0) return jobCompare;
        return a.name.localeCompare(b.name);
      }
    );
  }, [availableEmployees, jobs, JOB_IDS]);

  const uniqueEmployees = useMemo(() => {
    const seen = new Set<string>();
    return expandedEmployees.filter((emp) => {
      const duplicate = seen.has(emp.id);
      seen.add(emp.id);
      return !duplicate;
    });
  }, [expandedEmployees]);

  // Helper function to get employees available for work (not on leave)
  const availableForWork = useMemo(() => {
    return expandedEmployees.filter((emp) => !leaveEmployees[emp.id]?.selected);
  }, [expandedEmployees, leaveEmployees]);

  // Helper function to get employees available for leave (not working)
  const availableForLeave = useMemo(() => {
    return uniqueEmployees.filter((emp) => {
      const selectedJobs = employeeSelectionState.selectedJobs[emp.id] || [];
      return selectedJobs.length === 0;
    });
  }, [uniqueEmployees, employeeSelectionState.selectedJobs]);

  // Update day type and hours when date changes
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    const newDayType = determineDayType(newDate);
    const newDefaultHours = getDefaultHours(e.target.value);
    const oldDefaultHours = getDefaultHours(formData.logDate);

    setFormData({
      ...formData,
      logDate: e.target.value,
      dayType: newDayType,
    });

    // Update hours for all selected employees if moving to/from Saturday
    if (newDefaultHours !== oldDefaultHours) {
      setEmployeeSelectionState((prev) => {
        const newJobHours = { ...prev.jobHours };

        // Update hours for each employee's jobs
        Object.keys(newJobHours).forEach((employeeId) => {
          Object.keys(newJobHours[employeeId]).forEach((jobType) => {
            // Only update if the hours match the old default (user hasn't manually changed it)
            if (newJobHours[employeeId][jobType] === oldDefaultHours) {
              newJobHours[employeeId][jobType] = newDefaultHours;
            }
          });
        });

        return {
          ...prev,
          jobHours: newJobHours,
        };
      });
    }
  };

  // Function to fetch leave balances for multiple employees in batch
  const fetchLeaveBalancesBatch = async (employeeIds: string[]) => {
    if (employeeIds.length === 0) return {};

    try {
      const currentYear = new Date(formData.logDate).getFullYear();
      const response = await api.get(
        `/api/leave-management/balances/batch?employeeIds=${employeeIds.join(
          ","
        )}&year=${currentYear}`
      );

      // Process the batch response and update state
      const newBalances: Record<string, any> = {};

      Object.entries(response).forEach(([employeeId, data]: [string, any]) => {
        const balance = data.balance;
        const taken = data.taken || {};

        newBalances[employeeId] = {
          cuti_tahunan_total: balance.cuti_tahunan_total || 0,
          cuti_sakit_total: balance.cuti_sakit_total || 0,
          cuti_umum_total: balance.cuti_umum_total || 0,
          cuti_tahunan_taken: taken.cuti_tahunan || 0,
          cuti_sakit_taken: taken.cuti_sakit || 0,
          cuti_umum_taken: taken.cuti_umum || 0,
        };
      });

      setLeaveBalances((prev) => ({
        ...prev,
        ...newBalances,
      }));

      return newBalances;
    } catch (error) {
      console.error("Error fetching batch leave balances:", error);
      toast.error("Failed to fetch leave balances");
      return {};
    }
  };

  // Function to fetch leave balance for a single employee (fallback)
  const fetchLeaveBalance = async (employeeId: string) => {
    const result = await fetchLeaveBalancesBatch([employeeId]);
    return result[employeeId]
      ? { balance: result[employeeId], taken: {} }
      : null;
  };

  // Function to check if leave is available for an employee
  const checkLeaveAvailability = (employeeId: string, leaveType: LeaveType) => {
    const balance = leaveBalances[employeeId];
    if (!balance)
      return {
        available: false,
        remaining: 0,
        message: "Leave balance not loaded",
      };

    let remaining = 0;
    let totalAllowed = 0;
    let taken = 0;

    switch (leaveType) {
      case "cuti_tahunan":
        totalAllowed = balance.cuti_tahunan_total;
        taken = balance.cuti_tahunan_taken;
        remaining = totalAllowed - taken;
        break;
      case "cuti_sakit":
        totalAllowed = balance.cuti_sakit_total;
        taken = balance.cuti_sakit_taken;
        remaining = totalAllowed - taken;
        break;
      case "cuti_umum":
        totalAllowed = balance.cuti_umum_total;
        taken = balance.cuti_umum_taken;
        remaining = totalAllowed - taken;
        break;
    }

    const available = remaining > 0;
    let message = "";

    if (!available) {
      const leaveTypeName =
        leaveType === "cuti_tahunan"
          ? "Annual Leave"
          : leaveType === "cuti_sakit"
          ? "Sick Leave"
          : "Public Holiday Leave";
      message = `${leaveTypeName} balance exhausted (${taken}/${totalAllowed} days used)`;
    }

    return { available, remaining, message, taken, totalAllowed };
  };

  // Add this useEffect to capture initial state - only once after initialization is complete
  const initialStateSetRef = useRef(false);
  // Use refs to access latest state values in timeout callback
  const latestStateRef = useRef({
    formData,
    employeeSelectionState,
    employeeActivities,
    leaveEmployees,
    leaveEmployeeActivities,
    leaveBalances,
    trayCounts,
    forceOTHours,
    isCleaningMode,
  });

  // Keep the ref updated with latest values
  useEffect(() => {
    latestStateRef.current = {
      formData,
      employeeSelectionState,
      employeeActivities,
      leaveEmployees,
      leaveEmployeeActivities,
      leaveBalances,
      trayCounts,
      forceOTHours,
      isCleaningMode,
    };
  }, [formData, employeeSelectionState, employeeActivities, leaveEmployees, leaveEmployeeActivities, leaveBalances, trayCounts, forceOTHours, isCleaningMode]);

  useEffect(() => {
    if (
      !initialStateSetRef.current &&
      isInitializationComplete &&
      !loadingStaffs &&
      !loadingJobs &&
      !loadingPayCodeMappings &&
      expandedEmployees.length > 0
    ) {
      // Use a longer delay to ensure all initialization state updates are complete
      const timeoutId = setTimeout(() => {
        initialStateSetRef.current = true;
        // Capture from ref to get the latest values
        const current = latestStateRef.current;
        setInitialState({
          formData: JSON.parse(JSON.stringify(current.formData)),
          employeeSelectionState: JSON.parse(
            JSON.stringify(current.employeeSelectionState)
          ),
          employeeActivities: JSON.parse(JSON.stringify(current.employeeActivities)),
          leaveEmployees: JSON.parse(JSON.stringify(current.leaveEmployees)),
          leaveEmployeeActivities: JSON.parse(
            JSON.stringify(current.leaveEmployeeActivities)
          ),
          leaveBalances: JSON.parse(JSON.stringify(current.leaveBalances)),
          trayCounts: JSON.parse(JSON.stringify(current.trayCounts)),
          forceOTHours: JSON.parse(JSON.stringify(current.forceOTHours)),
          isCleaningMode: current.isCleaningMode,
        });
      }, 10000); // 10 second delay to ensure all initialization effects complete

      return () => clearTimeout(timeoutId);
    }
  }, [
    loadingStaffs,
    loadingJobs,
    loadingPayCodeMappings,
    expandedEmployees.length,
    isInitializationComplete,
  ]);

  // Add this useEffect to track initialization completion
  useEffect(() => {
    const checkInitializationComplete = () => {
      // Don't mark as complete if still loading basic data
      if (loadingStaffs || loadingJobs || loadingPayCodeMappings) {
        return false;
      }

      // Don't mark as complete if employees haven't been expanded yet
      if (expandedEmployees.length === 0) {
        return false;
      }

      // For create mode, check if default selections have been applied
      if (mode === "create") {
        // Check if employee selection state has been initialized (has some selected jobs)
        const hasSelectedEmployees =
          Object.keys(employeeSelectionState.selectedJobs).length > 0;
        if (!hasSelectedEmployees) {
          return false;
        }

        // Check if activities have been fetched for selected employees
        const selectedRowKeys = Object.entries(
          employeeSelectionState.selectedJobs
        ).flatMap(([employeeId, jobTypes]) =>
          jobTypes.map((jobType) => `${employeeId}-${jobType}`)
        );

        const hasActivitiesForAllSelected = selectedRowKeys.every(
          (rowKey) =>
            employeeActivities[rowKey] && employeeActivities[rowKey].length > 0
        );

        if (selectedRowKeys.length > 0 && !hasActivitiesForAllSelected) {
          return false; // Still waiting for activities
        }
      }

      // For edit mode, check if existing data has been restored
      if (mode === "edit" && existingWorkLog) {
        const hasRestoredSelections =
          Object.keys(employeeSelectionState.selectedJobs).length > 0;
        if (!hasRestoredSelections) {
          return false;
        }
      }

      return true;
    };

    if (!isInitializationComplete && checkInitializationComplete()) {
      // Add a small delay to ensure all state updates have been processed
      const timeoutId = setTimeout(() => {
        setIsInitializationComplete(true);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [
    loadingStaffs,
    loadingJobs,
    loadingPayCodeMappings,
    expandedEmployees.length,
    employeeSelectionState.selectedJobs,
    employeeActivities,
    mode,
    existingWorkLog,
    jobConfig?.id,
    JOB_IDS,
    isInitializationComplete,
  ]);

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

  // Pre-load leave balances for all available employees using batch API
  useEffect(() => {
    const preloadLeaveBalances = async () => {
      if (!formData.logDate || uniqueEmployees.length === 0) return;

      // Get employees who don't have balance data loaded yet
      const employeesToLoad = uniqueEmployees
        .filter((emp) => !leaveBalances[emp.id])
        .map((emp) => emp.id);

      if (employeesToLoad.length === 0) return;

      // Load all balances in a single batch API call
      await fetchLeaveBalancesBatch(employeesToLoad);
    };

    // Only preload when we have employees and a date
    if (uniqueEmployees.length > 0 && formData.logDate) {
      preloadLeaveBalances();
    }
  }, [uniqueEmployees, formData.logDate, leaveBalances]);

  // Modify handleLeaveSelection
  const handleLeaveSelection = async (employeeId: string) => {
    const isCurrentlySelected = leaveEmployees[employeeId]?.selected;
    const newSelectedState = !isCurrentlySelected;

    // If selecting for leave, check balance availability
    if (newSelectedState) {
      // If balance is not loaded yet, load it now (fallback)
      if (!leaveBalances[employeeId]) {
        const balanceData = await fetchLeaveBalance(employeeId);
        if (!balanceData) {
          toast.error("Failed to load leave balance. Please try again.");
          return; // Don't proceed if balance fetch failed
        }
      }

      // Define all possible leave types based on day type
      const possibleLeaveTypes: LeaveType[] = [
        "cuti_sakit",
        "cuti_tahunan",
        ...(formData.dayType === "Umum" ? ["cuti_umum" as LeaveType] : []),
      ];

      // Check if any leave type is available
      const availableLeaveTypes = possibleLeaveTypes.filter((leaveType) => {
        const availability = checkLeaveAvailability(employeeId, leaveType);
        return availability.available;
      });

      if (availableLeaveTypes.length === 0) {
        toast.error(
          "No leave types available for this employee (all balances exhausted)"
        );
        return; // Don't allow selection if no leave types are available
      }

      // Determine the leave type that would be selected (prefer default if available, otherwise use first available)
      const defaultLeaveType =
        formData.dayType === "Umum" ? "cuti_umum" : "cuti_sakit";

      const selectedLeaveType = availableLeaveTypes.includes(defaultLeaveType)
        ? defaultLeaveType
        : availableLeaveTypes[0];

      const availability = checkLeaveAvailability(
        employeeId,
        selectedLeaveType
      );

      // Show available balance when selecting
      const leaveTypeName =
        selectedLeaveType === "cuti_tahunan"
          ? "Annual Leave"
          : selectedLeaveType === "cuti_sakit"
          ? "Sick Leave"
          : "Public Holiday Leave";

      toast.success(
        `${leaveTypeName} selected - ${availability.remaining} days remaining`
      );

      // If we're not using the default leave type, inform the user
      if (selectedLeaveType !== defaultLeaveType) {
        const defaultTypeName =
          defaultLeaveType === "cuti_umum"
            ? "Public Holiday Leave"
            : "Sick Leave";
        toast(
          `${defaultTypeName} is exhausted, using ${leaveTypeName} instead`
        );
      }
    }

    setLeaveEmployees((prev) => {
      // If just selected, fetch default activities for leave pay calculation
      if (newSelectedState && !leaveEmployeeActivities[employeeId]) {
        fetchAndApplyActivitiesForLeave(employeeId);
      }

      // If an employee is selected for leave, ensure they are deselected from the working list.
      if (newSelectedState) {
        setEmployeeSelectionState((prevSelection) => {
          const newSelectedJobs = { ...prevSelection.selectedJobs };
          if (newSelectedJobs[employeeId]) {
            delete newSelectedJobs[employeeId]; // Deselect from all jobs
          }
          return {
            ...prevSelection,
            selectedJobs: newSelectedJobs,
          };
        });
      }

      // Set the correct leave type based on availability or day type
      let leaveTypeToUse: LeaveType;

      if (newSelectedState) {
        // When selecting, use the calculated selectedLeaveType from above
        // We need to recalculate it here since it's in a different scope
        const possibleLeaveTypes: LeaveType[] = [
          "cuti_sakit",
          "cuti_tahunan",
          ...(formData.dayType === "Umum" ? ["cuti_umum" as LeaveType] : []),
        ];

        const availableLeaveTypes = possibleLeaveTypes.filter((leaveType) => {
          const availability = checkLeaveAvailability(employeeId, leaveType);
          return availability.available;
        });

        const defaultLeaveType =
          formData.dayType === "Umum" ? "cuti_umum" : "cuti_sakit";

        leaveTypeToUse = availableLeaveTypes.includes(defaultLeaveType)
          ? defaultLeaveType
          : availableLeaveTypes[0] || defaultLeaveType;
      } else {
        // When deselecting, keep existing or use default
        const defaultLeaveType =
          formData.dayType === "Umum" ? "cuti_umum" : "cuti_sakit";
        leaveTypeToUse = prev[employeeId]?.leaveType || defaultLeaveType;
      }

      return {
        ...prev,
        [employeeId]: {
          selected: newSelectedState,
          leaveType: leaveTypeToUse,
        },
      };
    });
  };

  // Add this function to open the leave activities modal
  const handleManageLeaveActivities = (employee: Employee) => {
    setSelectedLeaveEmployee(employee as EmployeeWithHours);
    setShowLeaveActivitiesModal(true);
  };

  // Add this function to handle updates from the leave activities modal
  const handleLeaveActivitiesUpdated = (activities: ActivityItem[]) => {
    if (!selectedLeaveEmployee) return;

    const employeeId = selectedLeaveEmployee.id;
    const hours = jobConfig?.defaultHours || 8; // Use standard hours for recalculation

    const recalculatedActivities = calculateActivitiesAmounts(
      activities,
      hours,
      {},
      undefined,
      formData.logDate
    );

    setLeaveEmployeeActivities((prev) => ({
      ...prev,
      [employeeId]: recalculatedActivities,
    }));
    toast.success(`Leave pay updated for ${selectedLeaveEmployee.name}`);
  };

  const handleLeaveTypeChange = async (
    employeeId: string,
    leaveType: LeaveType
  ) => {
    // Get balance data - either from state or fetch it
    let balanceData = leaveBalances[employeeId];

    if (!balanceData) {
      const fetchResult = await fetchLeaveBalancesBatch([employeeId]);
      balanceData = fetchResult[employeeId];
      if (!balanceData) {
        toast.error("Failed to load leave balance");
        return; // Don't proceed if balance fetch failed
      }
    }

    // Check availability using the balance data directly (not stale state)
    let remaining = 0;
    let totalAllowed = 0;
    let taken = 0;

    switch (leaveType) {
      case "cuti_tahunan":
        totalAllowed = balanceData.cuti_tahunan_total || 0;
        taken = balanceData.cuti_tahunan_taken || 0;
        remaining = totalAllowed - taken;
        break;
      case "cuti_sakit":
        totalAllowed = balanceData.cuti_sakit_total || 0;
        taken = balanceData.cuti_sakit_taken || 0;
        remaining = totalAllowed - taken;
        break;
      case "cuti_umum":
        totalAllowed = balanceData.cuti_umum_total || 0;
        taken = balanceData.cuti_umum_taken || 0;
        remaining = totalAllowed - taken;
        break;
    }

    const available = remaining > 0;

    if (!available) {
      const leaveTypeName =
        leaveType === "cuti_tahunan"
          ? "Annual Leave"
          : leaveType === "cuti_sakit"
          ? "Sick Leave"
          : "Public Holiday Leave";
      toast.error(`${leaveTypeName} balance exhausted (${taken}/${totalAllowed} days used)`);
      return; // Don't allow the change
    }

    setLeaveEmployees((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        leaveType,
      },
    }));

    // Show remaining balance for the new leave type
    toast.success(
      `Leave type changed - ${remaining} days remaining`
    );
  };

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
    safeNavigate(`/payroll/${jobType.toLowerCase()}-production`);
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

  // Toggle employee selection by employee+job combination
  const handleEmployeeSelection = (rowKey: string | undefined) => {
    if (!rowKey) return;

    const [employeeId, jobType] = rowKey.split("-");

    setEmployeeSelectionState((prev) => {
      const currentSelectedJobs = prev.selectedJobs[employeeId] || [];
      const wasSelected = currentSelectedJobs.includes(jobType);

      let updatedSelectedJobs = {
        ...prev.selectedJobs,
        [employeeId]: wasSelected
          ? currentSelectedJobs.filter((j) => j !== jobType)
          : [...currentSelectedJobs, jobType],
      };

      // Initialize hours when selecting (if not already set)
      let updatedJobHours = { ...prev.jobHours };
      if (!wasSelected) {
        // Selecting - ensure hours are initialized
        if (!updatedJobHours[employeeId]) {
          updatedJobHours[employeeId] = {};
        }
        if (!updatedJobHours[employeeId][jobType]) {
          updatedJobHours[employeeId][jobType] = getDefaultHours(formData.logDate);
        }

        // Initialize tray count for BIHUN_SANGKUT employees (BIHUN page only)
        if (isBihunPage && jobType === "BIHUN_SANGKUT") {
          setTrayCounts((prev) => ({
            ...prev,
            [rowKey]: prev[rowKey] ?? 3, // Default tray count is 3
          }));
        }
      }

      return {
        selectedJobs: updatedSelectedJobs,
        jobHours: updatedJobHours,
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

  // Handle tray count changes for BIHUN_SANGKUT employees (BIHUN only)
  const handleTrayCountChange = (rowKey: string, value: string) => {
    const numValue = value === "" ? 0 : parseInt(value) || 0;
    setTrayCounts((prev) => ({
      ...prev,
      [rowKey]: numValue,
    }));
  };

  // Handle Force OT hours changes (BIHUN only)
  const handleForceOTChange = (rowKey: string, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value) || 0;
    setForceOTHours((prev) => ({
      ...prev,
      [rowKey]: numValue,
    }));
  };

  const handleManageActivities = (employee: EmployeeWithHours) => {
    // Ensure rowKey is available
    if (!employee.rowKey) {
      console.error(
        "Cannot open activities modal - employee rowKey is missing"
      );
      return;
    }

    // First set selectedEmployee, then open the modal
    setSelectedEmployee(employee);
    setShowActivitiesModal(true);
  };

  const handleSaveForm = async () => {
    const leaveEntries = Object.entries(leaveEmployees)
      .filter(([_, leaveData]) => leaveData.selected)
      .map(([employeeId, leaveData]) => {
        const activities = leaveEmployeeActivities[employeeId] || [];
        const amount_paid = activities
          .filter((a) => a.isSelected)
          .reduce((sum, a) => sum + a.calculatedAmount, 0);

        return {
          employeeId: employeeId,
          leaveType: leaveData.leaveType,
          amount_paid: amount_paid,
          activities: activities.filter((a) => a.isSelected),
        };
      });

    // Filter out excluded employees directly when building selected employees list
    const allSelectedEmployees = Object.entries(
      employeeSelectionState.selectedJobs
    ).filter(([_, jobTypes]) => jobTypes.length > 0);

    if (allSelectedEmployees.length === 0 && leaveEntries.length === 0) {
      toast.error("Please select at least one employee for work or leave.");
      return;
    }

    // Validate that all selected employees have hours (or tray for BIHUN_SANGKUT)
    const invalidEmployees = allSelectedEmployees.filter(
      ([employeeId, jobTypes]) => {
        return jobTypes.some((jobType) => {
          const hours =
            employeeSelectionState.jobHours[employeeId]?.[jobType] || 0;

          // For BIHUN_SANGKUT employees, check tray count instead of hours
          if (isBihunPage && jobType === "BIHUN_SANGKUT") {
            const rowKey = `${employeeId}-${jobType}`;
            const trayCount = trayCounts[rowKey] || 0;
            return trayCount <= 0;
          }

          return hours <= 0;
        });
      }
    );

    if (invalidEmployees.length > 0) {
      toast.error("All selected employees must have hours or tray greater than 0");
      return;
    }

    // Build the employee data with all selected jobs
    const selectedEmployeeData = allSelectedEmployees
      .map(([employeeId, jobTypes]) => {
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
            forceOTHours: forceOTHours[rowKey] || 0,
          };
        });
      })
      .flat();

    if (selectedEmployeeData.length === 0 && leaveEntries.length === 0) {
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
      contextData: {
        ...formData.contextData,
        isCleaningMode: isCleaningMode, // Save cleaning mode state for BIHUN/BOILER on Sundays
      },
      status: "Submitted",
      employeeEntries: selectedEmployeeData,
      leaveEntries: leaveEntries,
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

      // Reset initial state to current state after successful save
      setInitialState({
        formData: JSON.parse(JSON.stringify(formData)),
        employeeSelectionState: JSON.parse(
          JSON.stringify(employeeSelectionState)
        ),
        employeeActivities: JSON.parse(JSON.stringify(employeeActivities)),
        leaveEmployees: JSON.parse(JSON.stringify(leaveEmployees)),
        leaveEmployeeActivities: JSON.parse(
          JSON.stringify(leaveEmployeeActivities)
        ),
        leaveBalances: JSON.parse(JSON.stringify(leaveBalances)),
        trayCounts: JSON.parse(JSON.stringify(trayCounts)),
        forceOTHours: JSON.parse(JSON.stringify(forceOTHours)),
        isCleaningMode: isCleaningMode,
      });
      // Navigate to details page after edit, list page after create
      if (mode === "edit" && existingWorkLog) {
        navigate(`/payroll/${jobType.toLowerCase()}-production/${existingWorkLog.id}`);
      } else {
        navigate(`/payroll/${jobType.toLowerCase()}-production`);
      }
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
      const newTrayCounts: Record<string, number> = {};

      expandedEmployees.forEach((employee: { id: any; jobType: any }) => {
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

        // Set default hours based on day of week (5 for Saturday, 7 for other days)
        newJobHours[employeeId][jobType] = getDefaultHours(formData.logDate);

        // Initialize tray count for BIHUN_SANGKUT employees (BIHUN page only)
        if (isBihunPage && jobType === "BIHUN_SANGKUT") {
          const rowKey = `${employeeId}-${jobType}`;
          newTrayCounts[rowKey] = 3; // Default tray count is 3
        }
      });

      // Update the state with all employees selected
      setEmployeeSelectionState({
        selectedJobs: newSelectedJobs,
        jobHours: newJobHours,
      });

      // Set tray counts if any BIHUN_SANGKUT employees were selected
      if (Object.keys(newTrayCounts).length > 0) {
        setTrayCounts((prev) => ({ ...prev, ...newTrayCounts }));
      }
    }
  }, [expandedEmployees, loadingStaffs, loadingJobs, formData.logDate, isBihunPage]);

  // Handle select all/deselect all employees
  const handleSelectAll = () => {
    // Check if all available employees are selected
    const allAvailableSelected = availableForWork.every((emp) =>
      employeeSelectionState.selectedJobs[emp.id]?.includes(emp.jobType)
    );

    if (!allAvailableSelected && isBihunPage) {
      // Initialize tray counts for BIHUN_SANGKUT employees being selected
      const newTrayCounts: Record<string, number> = {};
      availableForWork.forEach((emp) => {
        if (emp.jobType === "BIHUN_SANGKUT") {
          const rowKey = `${emp.id}-${emp.jobType}`;
          if (trayCounts[rowKey] === undefined) {
            newTrayCounts[rowKey] = 3; // Default tray count is 3
          }
        }
      });
      if (Object.keys(newTrayCounts).length > 0) {
        setTrayCounts((prev) => ({ ...prev, ...newTrayCounts }));
      }
    }

    setEmployeeSelectionState((prev) => {
      if (allAvailableSelected) {
        // Deselect all available employees
        const newSelectedJobs = { ...prev.selectedJobs };
        availableForWork.forEach((emp) => {
          if (newSelectedJobs[emp.id]) {
            newSelectedJobs[emp.id] = newSelectedJobs[emp.id].filter(
              (job) => job !== emp.jobType
            );
            if (newSelectedJobs[emp.id].length === 0) {
              delete newSelectedJobs[emp.id];
            }
          }
        });

        return {
          selectedJobs: newSelectedJobs,
          jobHours: prev.jobHours,
        };
      } else {
        // Select all available employees
        const newSelectedJobs = { ...prev.selectedJobs };
        const newJobHours = { ...prev.jobHours };

        availableForWork.forEach((emp) => {
          if (!newSelectedJobs[emp.id]) {
            newSelectedJobs[emp.id] = [];
          }
          if (!newJobHours[emp.id]) {
            newJobHours[emp.id] = {};
          }

          if (!newSelectedJobs[emp.id].includes(emp.jobType)) {
            newSelectedJobs[emp.id].push(emp.jobType);
          }

          if (!newJobHours[emp.id][emp.jobType]) {
            newJobHours[emp.id][emp.jobType] = getDefaultHours(formData.logDate);
          }
        });

        return {
          selectedJobs: newSelectedJobs,
          jobHours: newJobHours,
        };
      }
    });
  };

  // Add leave select all handler
  const handleLeaveSelectAll = async () => {
    const allLeaveSelected = availableForLeave.every(
      (emp) => leaveEmployees[emp.id]?.selected
    );

    if (allLeaveSelected) {
      // Deselect all from leave
      setLeaveEmployees((prev) => {
        const newLeaveEmployees = { ...prev };
        availableForLeave.forEach((emp) => {
          if (newLeaveEmployees[emp.id]) {
            newLeaveEmployees[emp.id].selected = false;
          }
        });
        return newLeaveEmployees;
      });
    } else {
      // Check leave balance for all employees before selecting
      const defaultLeaveType =
        formData.dayType === "Umum" ? "cuti_umum" : "cuti_sakit";
      const employeesWithInsufficientBalance: string[] = [];

      // First, fetch balances for employees who don't have them loaded using batch API
      const employeesToLoad = availableForLeave
        .filter((emp) => !leaveBalances[emp.id])
        .map((emp) => emp.id);

      if (employeesToLoad.length > 0) {
        await fetchLeaveBalancesBatch(employeesToLoad);
      }

      // Check availability for each employee
      for (const emp of availableForLeave) {
        const availability = checkLeaveAvailability(emp.id, defaultLeaveType);
        if (!availability.available) {
          employeesWithInsufficientBalance.push(emp.name);
        }
      }

      if (employeesWithInsufficientBalance.length > 0) {
        toast.error(
          `Cannot select all: ${employeesWithInsufficientBalance.join(
            ", "
          )} have insufficient ${defaultLeaveType.replace("_", " ")} balance`
        );
        return;
      }

      // Select all available for leave
      setLeaveEmployees((prev) => {
        const newLeaveEmployees = { ...prev };
        availableForLeave.forEach((emp) => {
          newLeaveEmployees[emp.id] = {
            selected: true,
            leaveType: prev[emp.id]?.leaveType || defaultLeaveType,
          };

          // Fetch activities if not already available
          if (!leaveEmployeeActivities[emp.id]) {
            fetchAndApplyActivitiesForLeave(emp.id);
          }
        });
        return newLeaveEmployees;
      });

      // Remove selected employees from work selection
      setEmployeeSelectionState((prev) => {
        const newSelectedJobs = { ...prev.selectedJobs };
        availableForLeave.forEach((emp) => {
          delete newSelectedJobs[emp.id];
        });
        return {
          ...prev,
          selectedJobs: newSelectedJobs,
        };
      });

      toast.success(`Selected all employees for leave`);
    }
  };

  // Update select all state based on individual selections and availability
  useEffect(() => {
    const availableEmployees = availableForWork;
    const totalAvailable = availableEmployees.length;
    const selectedAvailable = availableEmployees.filter((emp) =>
      employeeSelectionState.selectedJobs[emp.id]?.includes(emp.jobType)
    ).length;

    setSelectAll(totalAvailable > 0 && totalAvailable === selectedAvailable);

    // Update leave select all state
    const totalAvailableForLeave = availableForLeave.length;
    const selectedForLeave = availableForLeave.filter(
      (emp) => leaveEmployees[emp.id]?.selected
    ).length;

    setLeaveSelectAll(
      totalAvailableForLeave > 0 && totalAvailableForLeave === selectedForLeave
    );
  }, [
    employeeSelectionState.selectedJobs,
    availableForWork,
    jobConfig?.id,
    leaveEmployees,
    availableForLeave,
  ]);

  // Use a one-time initialization effect
  const initializedRef = useRef(false);
  // Track which work log ID has been restored (null means none restored yet)
  // This handles navigation between different edit pages
  const restoredWorkLogIdRef = useRef<number | null>(null);
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

  // Separate effect for fetching activities after selection changes
  useEffect(() => {
    // In edit mode, skip until edit restoration is complete for THIS specific work log
    // This prevents overwriting restored activities with auto-generated ones
    // Also handles navigation between different edit pages
    if (mode === "edit" && existingWorkLog) {
      const currentWorkLogId = existingWorkLog.id;
      if (restoredWorkLogIdRef.current !== currentWorkLogId) {
        return; // Restoration not yet complete for this work log
      }
    }

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
    formData.logDate,
    loadingPayCodeMappings,
    mode,
    existingWorkLog,
    isCleaningMode,
    cleaningPayCode,
    forceOTHours,
  ]);

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

          // Get job pay codes from cache
          const jobPayCodes = jobPayCodeDetails[jobType] || [];

          // Get employee-specific pay codes from cache
          const employeePayCodes = employeeMappings[employeeId] || [];

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
          let mergedPayCodes = Array.from(allPayCodes.values());

          // In cleaning mode (BIHUN/BOILER on Sunday), override with only HARI_AHAD_JAM paycode
          if (isCleaningMode && cleaningPayCode && (jobType.startsWith("BIHUN") || jobType.startsWith("BOILER"))) {
            mergedPayCodes = [{
              id: cleaningPayCode.id,
              description: cleaningPayCode.description,
              pay_type: cleaningPayCode.pay_type,
              rate_unit: cleaningPayCode.rate_unit,
              rate_biasa: cleaningPayCode.rate_biasa,
              rate_ahad: cleaningPayCode.rate_ahad,
              rate_umum: cleaningPayCode.rate_umum,
              is_default_setting: true,
              requires_units_input: false,
              source: "cleaning_mode",
            }];
          }

          // Check if this employee was originally saved in the work log
          const wasOriginallySaved = savedEmployeeRowKeysRef.current.has(rowKey);

          // Get existing activities for this employee/job if in edit mode
          // For originally saved employees, use the preserved ref to handle deselect/re-select cycles
          const existingActivitiesForRow = wasOriginallySaved
            ? savedEmployeeActivitiesRef.current[rowKey] || []
            : employeeActivities[rowKey] || [];

          // Use day-specific OT threshold (5 for Saturday, 8 for others)
          const otThreshold = getDefaultHours(formData.logDate) === 5 ? 5 : 8;
          const forceOT = forceOTHours[rowKey] || 0;
          // Include OT pay codes if hours exceed threshold OR if forceOT is set
          const filteredPayCodes =
            hours > otThreshold || forceOT > 0
              ? mergedPayCodes
              : mergedPayCodes.filter((pc) => pc.pay_type !== "Overtime");

          // Convert to activity format
          const activities = filteredPayCodes.map((payCode) => {
            const isContextLinked = contextLinkedPayCodes[payCode.id];

            // Find existing activity for this pay code if in edit mode
            const existingActivity =
              mode === "edit"
                ? existingActivitiesForRow.find(
                    (ea) => ea.payCodeId === payCode.id
                  )
                : null;

            // Determine rate based on day type
            let rate = payCode.rate_biasa;
            if (formData.dayType === "Ahad") {
              rate = payCode.override_rate_ahad || payCode.rate_ahad;
            } else if (formData.dayType === "Umum") {
              rate = payCode.override_rate_umum || payCode.rate_umum;
            } else {
              rate = payCode.override_rate_biasa || payCode.rate_biasa;
            }

            // Determine if selected based on specific rules
            let isSelected = false;

            // wasOriginallySaved is already defined above for existingActivitiesForRow lookup

            if (mode === "edit" && wasOriginallySaved) {
              // EDIT mode for originally saved employees:
              // Only select activities that were explicitly saved
              // If existingActivity exists, it was saved (and is selected)
              // If existingActivity doesn't exist, it was NOT saved (meaning it was deselected or new)
              if (existingActivity) {
                isSelected = existingActivity.isSelected;
              } else {
                // Activity was not saved - this means it was either:
                // 1. Manually deselected by the user, OR
                // 2. A new paycode that didn't exist when the entry was created
                // In either case, default to NOT selected to preserve user's intent
                isSelected = false;
              }
            } else {
              // CREATE mode OR employee wasn't in original work log:
              // Apply auto-selection rules for new entries
              if (payCode.pay_type === "Tambahan") {
                // NEVER auto-select Tambahan pay codes
                isSelected = false;
              } else if (payCode.pay_type === "Overtime") {
                // Auto-select OT codes if:
                // - hours exceed threshold AND is_default_setting, OR
                // - forceOT > 0 (forced OT regardless of hours)
                const hasNaturalOT = hours > otThreshold;
                const hasForcedOT = forceOT > 0;
                isSelected = (hasNaturalOT || hasForcedOT) && payCode.is_default_setting;
              } else if (payCode.pay_type === "Base") {
                // Base pay codes follow default settings
                isSelected = payCode.is_default_setting;
              } else {
                // Fallback to default setting
                isSelected = payCode.is_default_setting;
              }

              // Special rules for specific rate units
              if (
                isContextLinked ||
                payCode.rate_unit === "Bag" ||
                payCode.rate_unit === "Trip" ||
                payCode.rate_unit === "Day"
              ) {
                // Don't auto-select these types
                isSelected = false;
              }

              // Special handling for BHANGKUT on BIHUN page - auto-select if tray count > 0
              if (isBihunPage && payCode.id === BHANGKUT_PAYCODE) {
                const trayCount = trayCounts[rowKey] ?? 0;
                isSelected = trayCount > 0;
              }
            }

            // In cleaning mode, always select the HARI_AHAD_JAM paycode
            if (isCleaningMode && payCode.id === "HARI_AHAD_JAM") {
              isSelected = true;
            }

            // Determine units produced
            // For BHANGKUT paycode on BIHUN page, use trayCounts state
            const unitsProduced =
              isContextLinked && contextLinkedPayCodes[payCode.id]
                ? formData.contextData[contextLinkedPayCodes[payCode.id].id] ||
                  0
                : isBihunPage && payCode.id === BHANGKUT_PAYCODE
                ? trayCounts[rowKey] ?? 0
                : existingActivity
                ? existingActivity.unitsProduced
                : payCode.requires_units_input
                ? 0
                : null;

            return {
              payCodeId: payCode.id,
              description: payCode.description,
              payType: payCode.pay_type,
              rateUnit: payCode.rate_unit,
              rate: rate,
              isDefault: payCode.is_default_setting,
              isSelected: isSelected,
              unitsProduced: unitsProduced,
              isContextLinked: isContextLinked,
              source: payCode.source,
              calculatedAmount: calculateActivityAmount(
                {
                  isSelected,
                  payType: payCode.pay_type,
                  rateUnit: payCode.rate_unit,
                  rate,
                  unitsProduced,
                },
                hours,
                formData.contextData,
                undefined,
                formData.logDate,
                forceOT
              ),
            };
          });

          // Apply auto-deselection logic to all activities
          const processedActivities = calculateActivitiesAmounts(
            activities,
            hours,
            formData.contextData,
            undefined,
            formData.logDate,
            forceOT
          );
          newEmployeeActivities[rowKey] = processedActivities;
        });
      }
    );

    setEmployeeActivities(newEmployeeActivities);
  };

  // New function to fetch and apply activities for leave employees
  const fetchAndApplyActivitiesForLeave = useCallback(
    (employeeId: string) => {
      const employee = allStaffs.find((s) => s.id === employeeId);
      if (!employee) return;

      const employeeJobs = employee.job || [];
      const relevantJobTypes = employeeJobs.filter((jobId) =>
        JOB_IDS.includes(jobId)
      );
      if (relevantJobTypes.length === 0) return;

      const primaryJobType = relevantJobTypes[0];
      const jobPayCodes = jobPayCodeDetails[primaryJobType] || [];
      const employeePayCodes = employeeMappings[employeeId] || [];

      const allPayCodes = new Map();
      jobPayCodes.forEach((pc) =>
        allPayCodes.set(pc.id, { ...pc, source: "job" })
      );
      employeePayCodes.forEach((pc) =>
        allPayCodes.set(pc.id, { ...pc, source: "employee" })
      );

      const activities = Array.from(allPayCodes.values()).map((payCode) => {
        const rate = payCode.override_rate_biasa || payCode.rate_biasa;
        const isSelected =
          payCode.is_default_setting && payCode.pay_type === "Base";
        const hours = jobConfig?.defaultHours || 8; // Assume standard 8 hours for a day's leave pay

        return {
          payCodeId: payCode.id,
          description: payCode.description,
          payType: payCode.pay_type,
          rateUnit: payCode.rate_unit,
          rate,
          isDefault: payCode.is_default_setting,
          isSelected,
          unitsProduced: payCode.requires_units_input ? 0 : undefined,
          source: payCode.source,
          calculatedAmount: calculateActivityAmount(
            {
              isSelected,
              payType: payCode.pay_type,
              rateUnit: payCode.rate_unit,
              rate,
            },
            hours,
            {},
            undefined,
            formData.logDate
          ),
        };
      });

      setLeaveEmployeeActivities((prev) => ({
        ...prev,
        [employeeId]: activities,
      }));
    },
    [
      allStaffs,
      JOB_IDS,
      jobPayCodeDetails,
      employeeMappings,
      jobConfig?.defaultHours,
      formData.logDate,
    ]
  );

  // Generate full activities list for leave employees with saved selections
  const generateLeaveActivitiesWithSavedSelection = useCallback(
    (employeeId: string, savedActivitiesMap: Map<string, any>) => {
      const employee = allStaffs.find((s) => s.id === employeeId);
      if (!employee) return;

      const employeeJobs = employee.job || [];
      const relevantJobTypes = employeeJobs.filter((jobId) =>
        JOB_IDS.includes(jobId)
      );
      if (relevantJobTypes.length === 0) return;

      const primaryJobType = relevantJobTypes[0];
      const jobPayCodes = jobPayCodeDetails[primaryJobType] || [];
      const employeePayCodes = employeeMappings[employeeId] || [];

      // Combine job and employee-specific pay codes
      const allPayCodes = new Map();
      jobPayCodes.forEach((pc) =>
        allPayCodes.set(pc.id, { ...pc, source: "job" })
      );
      employeePayCodes.forEach((pc) =>
        allPayCodes.set(pc.id, { ...pc, source: "employee" })
      );

      // Create activities with proper selection state
      const activities = Array.from(allPayCodes.values()).map((payCode) => {
        const savedActivity = savedActivitiesMap.get(payCode.id);
        const rate = payCode.override_rate_biasa || payCode.rate_biasa;
        const hours = jobConfig?.defaultHours || 8;

        // If this activity was saved, use the saved data
        if (savedActivity) {
          return {
            ...savedActivity,
            isDefault: payCode.is_default_setting,
            source: payCode.source,
          };
        }

        // Otherwise, create a new unselected activity
        const isSelected =
          payCode.is_default_setting && payCode.pay_type === "Base";
        return {
          payCodeId: payCode.id,
          description: payCode.description,
          payType: payCode.pay_type,
          rateUnit: payCode.rate_unit,
          rate,
          isDefault: payCode.is_default_setting,
          isSelected: false, // Default to unselected for unsaved activities
          unitsProduced: payCode.requires_units_input ? 0 : undefined,
          hoursApplied: (payCode.rate_unit === "Hour" || payCode.rate_unit === "Bill") ? hours : null,
          calculatedAmount: calculateActivityAmount(
            {
              payCodeId: payCode.id,
              description: payCode.description,
              payType: payCode.pay_type,
              rateUnit: payCode.rate_unit,
              rate,
              isSelected: false,
              unitsProduced: payCode.requires_units_input ? 0 : undefined,
              hoursApplied: (payCode.rate_unit === "Hour" || payCode.rate_unit === "Bill") ? hours : null,
            },
            hours,
            formData.contextData,
            undefined,
            formData.logDate
          ),
          isContextLinked: false,
          source: payCode.source,
        };
      });

      setLeaveEmployeeActivities((prev) => ({
        ...prev,
        [employeeId]: activities,
      }));
    },
    [
      allStaffs,
      JOB_IDS,
      jobPayCodeDetails,
      employeeMappings,
      jobConfig?.defaultHours,
      formData.dayType,
      formData.logDate,
    ]
  );

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
      const newTrayCounts: Record<string, number> = {};
      const newForceOTHours: Record<string, number> = {};

      // Clear and populate the saved employee row keys ref
      // This tracks which employees were originally in the work log
      savedEmployeeRowKeysRef.current = new Set();
      // Clear and populate the saved employee activities ref
      // This preserves original activities even after deselect/re-select cycles
      savedEmployeeActivitiesRef.current = {};

      existingWorkLog.employeeEntries.forEach((entry: any) => {
        const rowKey = `${entry.employee_id}-${entry.job_id}`;

        // Track this row key as originally saved
        savedEmployeeRowKeysRef.current.add(rowKey);

        // Restore employee selection and hours
        if (!newSelectedJobs[entry.employee_id]) {
          newSelectedJobs[entry.employee_id] = [];
        }
        newSelectedJobs[entry.employee_id].push(entry.job_id);

        if (!newJobHours[entry.employee_id]) {
          newJobHours[entry.employee_id] = {};
        }
        newJobHours[entry.employee_id][entry.job_id] = parseFloat(
          entry.total_hours
        );

        // Restore activities
        if (entry.activities && entry.activities.length > 0) {
          const restoredActivities = entry.activities.map(
            (activity: any) => ({
              payCodeId: activity.pay_code_id,
              description: activity.description,
              payType: activity.pay_type,
              rateUnit: activity.rate_unit,
              rate: parseFloat(activity.rate_used),
              unitsProduced: activity.units_produced
                ? parseFloat(activity.units_produced)
                : 0,
              hoursApplied: activity.hours_applied
                ? parseFloat(activity.hours_applied)
                : null,
              calculatedAmount: parseFloat(activity.calculated_amount),
              isSelected: true,
              isContextLinked: false,
            })
          );
          newEmployeeActivities[rowKey] = restoredActivities;
          // Also store in ref to preserve original state for deselect/re-select cycles
          savedEmployeeActivitiesRef.current[rowKey] = restoredActivities;

          // Extract tray count from BHANGKUT activity for BIHUN_SANGKUT entries (BIHUN only)
          if (entry.job_id === "BIHUN_SANGKUT") {
            const bhangkutActivity = entry.activities.find(
              (a: any) => a.pay_code_id === "BHANGKUT"
            );
            if (bhangkutActivity && bhangkutActivity.units_produced > 0) {
              newTrayCounts[rowKey] = parseFloat(bhangkutActivity.units_produced);
            } else {
              // Default tray count is 3 if not saved
              newTrayCounts[rowKey] = 3;
            }
          }
        } else if (entry.job_id === "BIHUN_SANGKUT") {
          // No activities saved, default tray count is 3
          newTrayCounts[rowKey] = 3;
        }

        // Restore force OT hours if saved (BIHUN only)
        if (entry.force_ot_hours && parseFloat(entry.force_ot_hours) > 0) {
          newForceOTHours[rowKey] = parseFloat(entry.force_ot_hours);
        }
      });

      // Apply all the restored state
      setEmployeeSelectionState({
        selectedJobs: newSelectedJobs,
        jobHours: newJobHours,
      });
      setEmployeeActivities(newEmployeeActivities);

      // Apply tray counts if any were restored (BIHUN only)
      if (Object.keys(newTrayCounts).length > 0) {
        setTrayCounts(newTrayCounts);
      }

      // Apply force OT hours if any were restored (BIHUN only)
      if (Object.keys(newForceOTHours).length > 0) {
        setForceOTHours(newForceOTHours);
      }

      // Restore leave records if they exist
      if (
        existingWorkLog.leaveRecords &&
        existingWorkLog.leaveRecords.length > 0
      ) {
        const newLeaveEmployees: Record<string, LeaveEntry> = {};
        const newLeaveEmployeeActivities: Record<string, ActivityItem[]> = {};
        const newLeaveBalances: Record<string, any> = {};

        existingWorkLog.leaveRecords.forEach((leaveRecord: any) => {
          const employeeId = leaveRecord.employee_id;

          // Restore leave employee selection and type
          newLeaveEmployees[employeeId] = {
            selected: true,
            leaveType: leaveRecord.leave_type as LeaveType,
          };

          // Store saved activities for later processing
          if (leaveRecord.activities && leaveRecord.activities.length > 0) {
            // Create a map of saved activities by payCodeId for easy lookup
            const savedActivitiesMap = new Map();
            leaveRecord.activities.forEach((activity: any) => {
              savedActivitiesMap.set(activity.pay_code_id, {
                payCodeId: activity.pay_code_id,
                description: activity.description,
                payType: activity.pay_type,
                rateUnit: activity.rate_unit,
                rate: parseFloat(activity.rate_used),
                unitsProduced: activity.units_produced
                  ? parseFloat(activity.units_produced)
                  : 0,
                hoursApplied: activity.hours_applied
                  ? parseFloat(activity.hours_applied)
                  : null,
                calculatedAmount: parseFloat(activity.calculated_amount),
                isSelected: true,
                isContextLinked: false,
              });
            });

            // Generate full activities list and mark saved ones as selected
            setTimeout(() => {
              generateLeaveActivitiesWithSavedSelection(
                employeeId,
                savedActivitiesMap
              );
            }, 0);
          } else {
            // No saved activities, generate default activities
            setTimeout(() => {
              fetchAndApplyActivitiesForLeave(employeeId);
            }, 0);
          }
        });

        // Apply leave-related state
        setLeaveEmployees(newLeaveEmployees);
        setLeaveEmployeeActivities(newLeaveEmployeeActivities);
      }

      // Restore activity records if they exist
      if (
        existingWorkLog.activityRecords &&
        existingWorkLog.activityRecords.length > 0
      ) {
        const newSavedActivities: Record<string, ActivityItem[]> = {};

        existingWorkLog.activityRecords.forEach((activityRecord: any) => {
          const employeeId = activityRecord.employee_id;
          const jobId = activityRecord.job_id;
          const rowKey = jobId ? `${employeeId}-${jobId}` : employeeId;

          // Restore saved activities
          if (
            activityRecord.activities &&
            activityRecord.activities.length > 0
          ) {
            newSavedActivities[rowKey] = activityRecord.activities.map(
              (activity: any) => ({
                payCodeId: activity.pay_code_id,
                description: activity.description,
                payType: activity.pay_type,
                rateUnit: activity.rate_unit,
                rate: parseFloat(activity.rate_used),
                unitsProduced: activity.units_produced
                  ? parseFloat(activity.units_produced)
                  : 0,
                hoursApplied: activity.hours_applied
                  ? parseFloat(activity.hours_applied)
                  : null,
                calculatedAmount: parseFloat(activity.calculated_amount),
                isSelected: true,
                isContextLinked: false,
              })
            );
          }
        });

        // Apply saved activities to the appropriate state
        setEmployeeActivities((prev) => ({ ...prev, ...newSavedActivities }));
      }

      // Mark this specific work log as restored so fetchAndApplyActivities can run
      // This must be at the END after all state updates are queued
      restoredWorkLogIdRef.current = existingWorkLog.id;
    }
  }, [
    mode,
    existingWorkLog,
    loadingStaffs,
    loadingJobs,
    loadingPayCodeMappings,
    fetchAndApplyActivitiesForLeave,
    generateLeaveActivitiesWithSavedSelection,
  ]);

  // Update handleActivitiesUpdated to store all activities, not just selected:
  const handleActivitiesUpdated = (activities: any[]) => {
    if (!selectedEmployee?.rowKey) return;

    const rowKey = selectedEmployee.rowKey;

    setEmployeeActivities((prev) => ({
      ...prev,
      [rowKey]: activities,
    }));

    // Sync tray count if BHANGKUT activity was modified (BIHUN BIHUN_SANGKUT only)
    if (isBihunPage && selectedEmployee.jobType === "BIHUN_SANGKUT") {
      const bhangkutActivity = activities.find(
        (a) => a.payCodeId === BHANGKUT_PAYCODE && a.isSelected
      );
      const newTrayCount = bhangkutActivity?.unitsProduced || 0;
      setTrayCounts((prev) => ({
        ...prev,
        [rowKey]: newTrayCount,
      }));
    }

    toast.success(`Activities updated for ${selectedEmployee.name}`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm px-6 py-3">
        <div className="flex justify-between items-center pb-3 mb-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBack} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {mode === "edit"
                ? `Edit ${jobConfig?.name} Entry`
                : `${jobConfig?.name} Entry`}
            </h1>
          </div>
          <div className="flex space-x-2">
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
              onClick={mode === "edit" && onCancel ? onCancel : handleBack}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              color="sky"
              size="sm"
              onClick={() => handleSaveForm()}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : mode === "edit" ? "Update" : "Save"}
            </Button>
          </div>
        </div>

        {/* Form Fields */}
        <div className="mb-4 flex flex-wrap items-end gap-4">
          {/* Date */}
          <div>
            <label htmlFor="logDate" className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
              Date
            </label>
            <input
              id="logDate"
              name="logDate"
              type="date"
              value={formData.logDate}
              onChange={handleDateChange}
              required
              className="px-3 py-2 text-sm border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          {/* Day Type Badge */}
          <span
            className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium ${
              formData.dayType === "Umum"
                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                : formData.dayType === "Ahad"
                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                : new Date(formData.logDate).getDay() === 6
                ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                : "bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200 border border-default-200 dark:border-gray-600"
            }`}
          >
            {formData.dayType === "Biasa" && new Date(formData.logDate).getDay() === 6
              ? "Sabtu"
              : formData.dayType}
            {formData.dayType === "Umum" &&
              getHolidayDescription(new Date(formData.logDate)) && (
                <span className="ml-1 text-xs font-normal">
                  ({getHolidayDescription(new Date(formData.logDate))})
                </span>
              )}
          </span>

          {/* Shift Field */}
          <div className="w-32">
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
          </div>

          {/* Cleaning Mode Toggle - only for BIHUN/BOILER on Sunday (Ahad) */}
          {showCleaningModeToggle && (
            <div className="flex items-center gap-2 pb-2">
              <button
                type="button"
                onClick={() => setIsCleaningMode(!isCleaningMode)}
                disabled={isSaving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isCleaningMode
                    ? "bg-sky-600"
                    : "bg-gray-200 dark:bg-gray-700"
                } ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isCleaningMode ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className={`text-sm font-medium ${
                isCleaningMode
                  ? "text-sky-700 dark:text-sky-300"
                  : "text-default-600 dark:text-gray-400"
              }`}>
                {isCleaningMode ? "Cleaning" : "Regular"}
              </span>
            </div>
          )}

          {/* Show Context Form here only if 3 or fewer fields */}
          {jobConfig?.contextFields && jobConfig.contextFields.length <= 3 && (
            <DynamicContextForm
              contextFields={jobConfig?.contextFields || []}
              contextData={formData.contextData}
              onChange={handleContextChange}
              disabled={isSaving}
            />
          )}
        </div>

        {/* Show Context Form below if more than 3 fields */}
        {jobConfig?.contextFields && jobConfig.contextFields.length > 3 && (
          <div className="mb-4">
            <span className="text-sm font-medium text-default-700 dark:text-gray-200 mb-3">
              Production Details
            </span>
            <DynamicContextForm
              contextFields={jobConfig?.contextFields || []}
              contextData={formData.contextData}
              onChange={handleContextChange}
              disabled={isSaving}
            />
          </div>
        )}

        {/* Employees Section */}
        <div className="border-t border-default-200 dark:border-gray-700 pt-4">
          {/* Employee Selection Table */}
          {loadingStaffs || loadingJobs ? (
            <div className="flex justify-center items-center h-48">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {/* Main Employee Table */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
                <div>
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-900/50">
                      <tr>
                        <th scope="col" className="px-6 py-1 text-left">
                          <Checkbox
                            checked={selectAll}
                            onChange={handleSelectAll}
                            size={20}
                            checkedColor="text-sky-600"
                            ariaLabel="Select all employees"
                            buttonClassName="p-1 rounded-lg"
                            disabled={availableForWork.length === 0}
                          />
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          ID
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Name
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Job
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-1 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          {isBihunPage ? "Units" : "Hours"}
                        </th>
                        {isBihunPage && (
                          <th
                            scope="col"
                            className="px-4 py-1 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            Force OT
                          </th>
                        )}
                        <th
                          scope="col"
                          className="px-6 py-1 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {expandedEmployees.map((row, index) => {
                        const isSelected =
                          employeeSelectionState.selectedJobs[row.id]?.includes(
                            row.jobType
                          ) || false;
                        const hours =
                          employeeSelectionState.jobHours[row.id]?.[
                            row.jobType
                          ] ??
                          jobConfig?.defaultHours ??
                          7;

                        return (
                          <tr
                            key={row.rowKey}
                            onClick={() => {
                              if (isSaving || leaveEmployees[row.id]?.selected)
                                return;
                              handleEmployeeSelection(row.rowKey);
                            }}
                            className={`transition-colors duration-150 ${
                              isSaving || leaveEmployees[row.id]?.selected
                                ? "bg-default-50 dark:bg-gray-700/50 cursor-not-allowed"
                                : "cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700"
                            } ${
                              isSelected
                                ? "bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50"
                                : "bg-white dark:bg-gray-800"
                            }`}
                          >
                            <td
                              className="px-6 py-2 whitespace-nowrap align-middle cursor-pointer"
                              onClickCapture={(e) => {
                                e.stopPropagation();
                                if (
                                  !isSaving &&
                                  !leaveEmployees[row.id]?.selected
                                ) {
                                  handleEmployeeSelection(row.rowKey);
                                }
                              }}
                            >
                              <Checkbox
                                checked={isSelected}
                                onChange={() => {}}
                                size={20}
                                checkedColor="text-sky-600"
                                ariaLabel={`Select employee ${row.name} for job ${row.jobName}`}
                                buttonClassName="p-1 rounded-lg"
                                disabled={
                                  isSaving || leaveEmployees[row.id]?.selected
                                }
                              />
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap text-sm font-medium text-default-700 dark:text-gray-200">
                              <SafeLink
                                to={`/catalogue/staff/${row.id}`}
                                hasUnsavedChanges={hasUnsavedChanges}
                                onNavigateAttempt={safeNavigate}
                                className="hover:underline hover:text-sky-600 dark:text-sky-400"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.id}
                              </SafeLink>
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                              <span className="font-medium">{row.name}</span>
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap text-sm text-default-700 dark:text-gray-200">
                              <SafeLink
                                to={`/catalogue/job?id=${row.jobType}`}
                                hasUnsavedChanges={hasUnsavedChanges}
                                onNavigateAttempt={safeNavigate}
                                className="hover:underline hover:text-sky-600 dark:text-sky-400"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.jobName}
                              </SafeLink>
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap text-right">
                              <div className="flex justify-end">
                                {isBihunPage && row.jobType === "BIHUN_SANGKUT" ? (
                                  <input
                                    type="number"
                                    value={isSelected ? (trayCounts[row.rowKey || ""] || 0).toString() : ""}
                                    onChange={(e) => handleTrayCountChange(row.rowKey || "", e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-20 py-1 text-sm text-right border rounded-md bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 disabled:bg-default-100 dark:disabled:bg-gray-700 disabled:text-default-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed border-default-300 dark:border-gray-600"
                                    min="0"
                                    step="1"
                                    disabled={!isSelected || isSaving || leaveEmployees[row.id]?.selected}
                                    placeholder={isSelected ? "0" : "-"}
                                  />
                                ) : (
                                  <input
                                    type="number"
                                    value={isSelected ? hours.toString() : ""}
                                    onChange={(e) =>
                                      handleEmployeeHoursChange(
                                        row.rowKey,
                                        e.target.value
                                      )
                                    }
                                    onBlur={() => handleHoursBlur(row.rowKey)}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-20 py-1 text-sm text-right border rounded-md bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 disabled:bg-default-100 dark:disabled:bg-gray-700 disabled:text-default-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed ${
                                      hours > (getDefaultHours(formData.logDate) === 5 ? 5 : 8) &&
                                      jobConfig?.requiresOvertimeCalc
                                        ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20"
                                        : "border-default-300 dark:border-gray-600"
                                    }`}
                                    step="0.5"
                                    min="0"
                                    max="24"
                                    disabled={
                                      !isSelected ||
                                      isSaving ||
                                      leaveEmployees[row.id]?.selected
                                    }
                                    placeholder={isSelected ? "0" : "-"}
                                  />
                                )}
                              </div>
                            </td>
                            {isBihunPage && (
                              <td className="px-4 py-2 whitespace-nowrap text-right">
                                <input
                                  type="number"
                                  value={isSelected ? (forceOTHours[row.rowKey || ""] || 0).toString() : ""}
                                  onChange={(e) => handleForceOTChange(row.rowKey || "", e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-16 py-1 text-sm text-right border rounded-md bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 disabled:bg-default-100 dark:disabled:bg-gray-700 disabled:text-default-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed border-amber-400 dark:border-amber-600"
                                  min="0"
                                  step="0.5"
                                  max="8"
                                  disabled={!isSelected || isSaving || leaveEmployees[row.id]?.selected}
                                  placeholder="0"
                                />
                              </td>
                            )}
                            <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                              <ActivitiesTooltip
                                activities={(
                                  employeeActivities[row.rowKey || ""] || []
                                ).filter((activity) => activity.isSelected)}
                                employeeName={row.name}
                                hasUnsavedChanges={hasUnsavedChanges}
                                onNavigateAttempt={safeNavigate}
                                className={
                                  !isSelected
                                    ? "disabled:text-default-300 disabled:cursor-not-allowed"
                                    : ""
                                }
                                disabled={!isSelected}
                                onClick={() => handleManageActivities(row)}
                                logDate={formData.logDate}
                                showBelow={index < 5}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </>
          )}
        </div>

        <div className="border-t border-default-200 dark:border-gray-700 pt-2 mt-4">
          <h2 className="text-lg font-semibold text-default-700 dark:text-gray-200 mb-2">
            Leave & Absence Recording
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
            {availableForLeave.length === 0 ? (
              <div className="text-center py-10 px-6">
                <p className="text-sm text-default-500 dark:text-gray-400">
                  No employees available for leave.
                </p>
                <p className="text-xs text-default-400 mt-1">
                  Employees selected for work cannot be marked as on leave.
                </p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700 table-fixed">
                <thead className="bg-default-50 dark:bg-gray-900/50">
                  <tr>
                    <th scope="col" className="w-16 px-6 py-2 text-left">
                      <Checkbox
                        checked={leaveSelectAll}
                        onChange={handleLeaveSelectAll}
                        size={20}
                        checkedColor="text-amber-600"
                        ariaLabel="Select all employees for leave"
                        buttonClassName="p-1 rounded-lg"
                        disabled={availableForLeave.length === 0}
                      />
                    </th>
                    <th
                      scope="col"
                      className="w-1/3 px-6 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Employee
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Leave Type
                    </th>
                    <th
                      scope="col"
                      className="w-48 px-6 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {availableForLeave.map((employee) => {
                    const leaveOptions = [
                      { id: "cuti_sakit", name: "Cuti Sakit" },
                      { id: "cuti_tahunan", name: "Cuti Tahunan" },
                    ];
                    if (formData.dayType === "Umum") {
                      leaveOptions.unshift({
                        id: "cuti_umum",
                        name: "Cuti Umum",
                      });
                    }

                    const isSelected =
                      leaveEmployees[employee.id]?.selected || false;
                    const defaultLeaveType =
                      formData.dayType === "Umum" ? "cuti_umum" : "cuti_sakit";
                    const currentLeaveType =
                      leaveEmployees[employee.id]?.leaveType ||
                      defaultLeaveType;

                    return (
                      <tr
                        key={`leave-${employee.id}`}
                        className={`transition-colors duration-150 ${
                          isSaving
                            ? "bg-default-50 dark:bg-gray-700 cursor-not-allowed"
                            : "cursor-pointer"
                        } ${
                          isSelected
                            ? "bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100/75 dark:hover:bg-amber-900/50"
                            : "bg-white dark:bg-gray-800 hover:bg-default-100 dark:hover:bg-gray-700"
                        }`}
                        onClick={() => {
                          if (isSaving) return;
                          handleLeaveSelection(employee.id);
                        }}
                      >
                        <td
                          className="w-16 px-6 py-2 whitespace-nowrap align-middle cursor-pointer"
                          onClickCapture={(e) => {
                            e.stopPropagation();
                            if (!isSaving) {
                              handleLeaveSelection(employee.id);
                            }
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            onChange={() => {}}
                            size={20}
                            checkedColor="text-amber-600"
                            ariaLabel={`Select ${employee.name} for leave`}
                            buttonClassName="p-1 rounded-lg"
                            disabled={isSaving}
                          />
                        </td>
                        <td className="w-1/3 px-6 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="text-sm font-medium text-default-900 dark:text-gray-100 truncate">
                                {employee.name}
                              </div>
                              <div className="text-xs text-default-500 dark:text-gray-400">
                                {employee.id}
                              </div>
                            </div>
                            {/* Show leave balance if available */}
                            {leaveBalances[employee.id] && (
                              <div className="flex-shrink-0">
                                {(() => {
                                  const currentLeaveType =
                                    leaveEmployees[employee.id]?.leaveType ||
                                    (formData.dayType === "Umum"
                                      ? "cuti_umum"
                                      : "cuti_sakit");
                                  const availability = checkLeaveAvailability(
                                    employee.id,
                                    currentLeaveType
                                  );
                                  const leaveTypeName =
                                    currentLeaveType === "cuti_tahunan"
                                      ? "Annual"
                                      : currentLeaveType === "cuti_sakit"
                                      ? "Sick"
                                      : "Public Holiday";
                                  return (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        availability.remaining > 0
                                          ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                          : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                                      }`}
                                    >
                                      {leaveTypeName}: {availability.remaining}/
                                      {availability.totalAllowed}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap">
                          <div className="w-full max-w-[180px]">
                            <Listbox
                              value={currentLeaveType}
                              onChange={(value) =>
                                handleLeaveTypeChange(
                                  employee.id,
                                  value as LeaveType
                                )
                              }
                              disabled={!isSelected || isSaving}
                            >
                              <div className="relative">
                                <ListboxButton
                                  onClick={(e) => e.stopPropagation()}
                                  className={`relative w-full pl-3 pr-8 py-2 text-left rounded-md border ${
                                    !isSelected || isSaving
                                      ? "bg-default-100 dark:bg-gray-700 text-default-400 dark:text-gray-500 cursor-not-allowed border-default-200 dark:border-gray-600"
                                      : "bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 border-default-300 dark:border-gray-600 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  }`}
                                >
                                  <span className="block truncate text-sm">
                                    {leaveOptions.find(
                                      (option) => option.id === currentLeaveType
                                    )?.name ||
                                      (formData.dayType === "Umum"
                                        ? "Cuti Umum"
                                        : "Cuti Sakit")}
                                  </span>
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                    <IconChevronDown
                                      className="w-4 h-4 text-default-400 dark:text-gray-500"
                                      aria-hidden="true"
                                    />
                                  </span>
                                </ListboxButton>
                                <Transition
                                  as={Fragment}
                                  leave="transition ease-in duration-100"
                                  leaveFrom="opacity-100"
                                  leaveTo="opacity-0"
                                >
                                  <ListboxOptions
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="absolute z-50 w-full py-1 bottom-full mb-1 overflow-auto text-sm bg-white dark:bg-gray-800 rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none">
                                    {leaveOptions.map((option) => (
                                      <ListboxOption
                                        key={option.id}
                                        value={option.id}
                                        className={({ active }) =>
                                          `${
                                            active
                                              ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200"
                                              : "text-default-700 dark:text-gray-200"
                                          } cursor-pointer select-none relative py-2 pl-3 pr-8`
                                        }
                                      >
                                        {({ selected, active }) => (
                                          <>
                                            <span
                                              className={`${
                                                selected
                                                  ? "font-medium"
                                                  : "font-normal"
                                              } block truncate`}
                                            >
                                              {option.name}
                                            </span>
                                            {selected ? (
                                              <span
                                                className={`absolute inset-y-0 right-0 flex items-center pr-2 ${
                                                  active
                                                    ? "text-amber-600"
                                                    : "text-amber-500"
                                                }`}
                                              >
                                                <IconCheck
                                                  className="w-4 h-4"
                                                  aria-hidden="true"
                                                />
                                              </span>
                                            ) : null}
                                          </>
                                        )}
                                      </ListboxOption>
                                    ))}
                                  </ListboxOptions>
                                </Transition>
                              </div>
                            </Listbox>
                          </div>
                        </td>
                        <td className="w-48 px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                          <ActivitiesTooltip
                            activities={
                              isSelected && !isSaving
                                ? (
                                    leaveEmployeeActivities[employee.id] || []
                                  ).filter((a: ActivityItem) => a.isSelected)
                                : [] // Show no activities when disabled
                            }
                            employeeName={employee.name}
                            hasUnsavedChanges={hasUnsavedChanges}
                            onNavigateAttempt={safeNavigate}
                            className={
                              !isSelected || isSaving
                                ? "disabled:text-default-300 disabled:cursor-not-allowed"
                                : ""
                            }
                            disabled={!isSelected || isSaving}
                            onClick={() =>
                              handleManageLeaveActivities(employee)
                            }
                            logDate={formData.logDate}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
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
        contextLinkedPayCodes={contextLinkedPayCodes}
        contextData={formData.contextData}
        hasUnsavedChanges={hasUnsavedChanges}
        onNavigateAttempt={safeNavigate}
        logDate={formData.logDate}
      />
      <ManageActivitiesModal
        isOpen={showLeaveActivitiesModal}
        onClose={() => setShowLeaveActivitiesModal(false)}
        employee={selectedLeaveEmployee}
        jobType={selectedLeaveEmployee?.jobType || ""}
        jobName={selectedLeaveEmployee?.jobName || ""}
        employeeHours={jobConfig?.defaultHours || 8}
        dayType="Biasa" // Always use "Biasa" for leave pay calculation
        onActivitiesUpdated={handleLeaveActivitiesUpdated}
        existingActivities={
          leaveEmployeeActivities[selectedLeaveEmployee?.id || ""]
        }
        contextLinkedPayCodes={contextLinkedPayCodes}
        contextData={formData.contextData}
        hasUnsavedChanges={hasUnsavedChanges}
        onNavigateAttempt={safeNavigate}
        logDate={formData.logDate}
      />
      {/* Confirmation Dialog for Unsaved Changes */}
      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={handleCancelNavigation}
        onConfirm={handleConfirmNavigation}
        title="Unsaved Changes"
        message={confirmationMessage}
        confirmButtonText="Leave Page"
        variant="danger"
      />
    </div>
  );
};

export default DailyLogEntryPage;

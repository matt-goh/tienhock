// src/pages/Payroll/DailyLog/DailyLogSalesmanEntryPage.tsx
// Dedicated entry page for SALESMAN job type
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
import {
  IconChevronDown,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
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

interface DailyLogSalesmanEntryPageProps {
  mode?: "create" | "edit";
  existingWorkLog?: any;
  onCancel?: () => void;
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

const DailyLogSalesmanEntryPage: React.FC<DailyLogSalesmanEntryPageProps> = ({
  mode = "create",
  existingWorkLog,
  onCancel,
}) => {
  // Hardcode jobType for salesman page
  const jobType = "SALESMAN";
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
  const [locationTypes, setLocationTypes] = useState<
    Record<string, "Local" | "Outstation">
  >({});
  const [salesmanProducts, setSalesmanProducts] = useState<
    Record<string, any[]>
  >({});
  const [salesmanIkutRelations, setSalesmanIkutRelations] = useState<
    Record<string, string> // rowKey of SALESMAN_IKUT -> SALESMAN employee ID
  >({});
  const [ikutBagCounts, setIkutBagCounts] = useState<
    Record<string, { muatMee: number; muatBihun: number }> // rowKey -> bag counts
  >({});
  const [ikutDoubled, setIkutDoubled] = useState<Record<string, boolean>>({});
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
  const { isHoliday, getHolidayDescription, holidays } = useHolidayCache();
  const JOB_IDS = getJobIds(jobType);
  // Get job configuration
  const jobConfig = getJobConfig(jobType);
  const contextLinkedPayCodes = jobConfig
    ? getContextLinkedPayCodes(jobConfig)
    : {};

  // Hardcoded Muat paycodes for SALESMAN_IKUT
  const MUAT_MEE_PAYCODE = "4-COMM_MUAT_MEE";
  const MUAT_BIHUN_PAYCODE = "5-COMM_MUAT_BH";

  // Product ID to DME/DWE pay code mapping for SALESMAN_IKUT
  const PRODUCT_TO_SALESMAN_IKUT_PAYCODE: Record<string, string> = {
    // MEE products
    "1-2UDG": "DME-2UDG",
    "1-3UDG": "DME-3UDG",
    "1-350G": "DME-350G",
    "1-MNL": "DME-MNL",
    // BH products
    "2-APPLE": "DME-300G",
    "2-BH": "DME-300G",
    "2-BH2": "DME-2H",
    "2-BCM3": "DME-600G",
    "2-BNL": "DME-3.1KG",
    "2-BNL(5)": "DME-5KG",
    "2-MASAK": "DME-300G",
    "2-PADI": "DME-300G",
    // WE products
    "WE-2UDG": "DWE-2UDG",
    "WE-3UDG": "DWE-3UDG",
    "WE-300G": "DWE-300G",
    "WE-360": "DWE-350G",
    "WE-360(5PK)": "DWE-350G",
    "WE-420": "DWE-420G",
    "WE-600G": "DWE-600G",
    "WE-MNL": "DWE-MNL",
  };

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

    // SALESMAN has no context fields, use empty object
    return {
      logDate: format(new Date(), "yyyy-MM-dd"),
      shift: "1",
      contextData: {},
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
  const [initialState, setInitialState] = useState<{
    formData: DailyLogFormData;
    employeeSelectionState: any;
    employeeActivities: Record<string, any[]>;
    locationTypes: Record<string, "Local" | "Outstation">;
    salesmanIkutRelations: Record<string, string>;
    ikutBagCounts: Record<string, { muatMee: number; muatBihun: number }>;
    ikutDoubled: Record<string, boolean>;
    leaveEmployees: Record<string, LeaveEntry>;
    leaveEmployeeActivities: Record<string, ActivityItem[]>;
    leaveBalances: Record<string, any>;
  } | null>(null);

  // Ref to track which work log's formData has been initialized
  const formDataInitializedForRef = useRef<number | null>(null);
  // Ref to track which employee row keys were originally saved in the work log
  // Used to determine whether to use CREATE mode or EDIT mode activity selection logic
  const savedEmployeeRowKeysRef = useRef<Set<string>>(new Set());
  // Ref to store the original saved activities from the work log
  // This preserves the original state even if the employee is deselected and re-selected
  const savedEmployeeActivitiesRef = useRef<Record<string, any[]>>({});
  // Ref to track which rowKeys have had their products linked (to avoid infinite loops)
  const productsLinkedRef = useRef<Record<string, string>>({});
  // Ref to track which SALESMAN_IKUT rowKeys have had their products copied (to avoid infinite loops)
  const ikutProductsLinkedRef = useRef<Record<string, string>>({});

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
    try {
      return (
        normalizeForComparison(formData) !==
          normalizeForComparison(initialState.formData) ||
        normalizeForComparison(employeeSelectionState) !==
          normalizeForComparison(initialState.employeeSelectionState) ||
        normalizeForComparison(employeeActivities) !==
          normalizeForComparison(initialState.employeeActivities) ||
        normalizeForComparison(locationTypes) !==
          normalizeForComparison(initialState.locationTypes) ||
        normalizeForComparison(salesmanIkutRelations) !==
          normalizeForComparison(initialState.salesmanIkutRelations) ||
        normalizeForComparison(ikutBagCounts) !==
          normalizeForComparison(initialState.ikutBagCounts) ||
        normalizeForComparison(ikutDoubled) !==
          normalizeForComparison(initialState.ikutDoubled) ||
        normalizeForComparison(leaveEmployees) !==
          normalizeForComparison(initialState.leaveEmployees) ||
        normalizeForComparison(leaveEmployeeActivities) !==
          normalizeForComparison(initialState.leaveEmployeeActivities) ||
        normalizeForComparison(leaveBalances) !==
          normalizeForComparison(initialState.leaveBalances)
      );
    } catch (error) {
      console.warn("Error comparing states, defaulting to no changes:", error);
      return false;
    }
  }, [
    formData,
    employeeSelectionState,
    employeeActivities,
    locationTypes,
    salesmanIkutRelations,
    ikutBagCounts,
    ikutDoubled,
    leaveEmployees,
    leaveEmployeeActivities,
    leaveBalances,
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

  // Note: SALESMAN has no context fields, so no context-linked activity updates needed

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

  // Available employees (excluding KILANG and TIMOTHY.G for salesman)
  const availableEmployees = useMemo(() => {
    const excludedIds = ["KILANG", "TIMOTHY.G"];
    return allStaffs
      .filter((staff) => !excludedIds.includes(staff.id))
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

  // Salesman employees (job type SALESMAN only)
  const salesmanEmployees = useMemo(() => {
    return expandedEmployees.filter(
      (emp: { jobType: string; id: string }) => emp.jobType === "SALESMAN"
    );
  }, [expandedEmployees]);

  // Salesman Ikut employees (job type SALESMAN_IKUT only)
  const salesmanIkutEmployees = useMemo(() => {
    return expandedEmployees.filter(
      (emp: { jobType: string }) => emp.jobType === "SALESMAN_IKUT"
    );
  }, [expandedEmployees]);

  // Helper function to get employees available for leave (not working)
  const availableForLeave = useMemo(() => {
    return uniqueEmployees.filter((emp) => {
      const selectedJobs = employeeSelectionState.selectedJobs[emp.id] || [];
      return selectedJobs.length === 0;
    });
  }, [uniqueEmployees, employeeSelectionState.selectedJobs]);

  // SALESMAN_IKUT employees available for work (not on leave)
  const salesmanIkutAvailableForWork = useMemo(() => {
    return salesmanIkutEmployees.filter(
      (emp) => !leaveEmployees[emp.id]?.selected
    );
  }, [salesmanIkutEmployees, leaveEmployees]);

  // WE product type mapping (based on database product.type field)
  const WE_PRODUCT_TYPES: Record<string, "MEE" | "BH"> = {
    "WE-2UDG": "MEE",
    "WE-3UDG": "MEE",
    "WE-360": "MEE",
    "WE-360(5PK)": "MEE",
    "WE-420": "MEE",
    "WE-MNL": "MEE",
    "WE-300G": "BH",
    "WE-600G": "BH",
  };

  // Helper function to determine product category
  const getProductCategory = (productId: string): "MEE" | "BH" | null => {
    if (productId.startsWith("1-")) return "MEE";
    if (productId.startsWith("2-")) return "BH";
    if (productId.startsWith("WE-")) return WE_PRODUCT_TYPES[productId] || null;
    return null;
  };

  // Calculate aggregate stats from salesmanProducts for selected salesmen
  const salesmanProductStats = useMemo(() => {
    let totalMee = 0;
    let totalBihun = 0;
    const productTotals: Record<string, number> = {};
    const salesmanTotals: Record<string, { name: string; mee: number; bihun: number; total: number }> = {};

    // Get selected SALESMAN employees
    const selectedSalesmen = salesmanEmployees.filter((emp) =>
      employeeSelectionState.selectedJobs[emp.id]?.includes("SALESMAN")
    );

    selectedSalesmen.forEach((emp) => {
      const products = salesmanProducts[emp.rowKey || ""] || [];
      let salesmanMee = 0;
      let salesmanBihun = 0;

      products.forEach((product: { product_id: string; quantity: number }) => {
        const qty = product.quantity || 0;
        productTotals[product.product_id] = (productTotals[product.product_id] || 0) + qty;

        const category = getProductCategory(product.product_id);
        if (category === "MEE") {
          totalMee += qty;
          salesmanMee += qty;
        } else if (category === "BH") {
          totalBihun += qty;
          salesmanBihun += qty;
        }
      });

      if (salesmanMee + salesmanBihun > 0) {
        salesmanTotals[emp.id] = {
          name: emp.name,
          mee: salesmanMee,
          bihun: salesmanBihun,
          total: salesmanMee + salesmanBihun,
        };
      }
    });

    // Sort products by quantity descending
    const sortedProducts = Object.entries(productTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([id, qty]) => ({ id, qty }));

    return { totalMee, totalBihun, total: totalMee + totalBihun, productTotals: sortedProducts, salesmanTotals };
  }, [salesmanEmployees, employeeSelectionState.selectedJobs, salesmanProducts]);

  // Get employees followed by each salesman
  const followedBySalesman = useMemo(() => {
    const followedMap: Record<string, string[]> = {};

    Object.entries(salesmanIkutRelations).forEach(
      ([ikutRowKey, salesmanId]) => {
        const ikutEmployee = salesmanIkutEmployees.find(
          (emp) => emp.rowKey === ikutRowKey
        );
        if (ikutEmployee) {
          if (!followedMap[salesmanId]) {
            followedMap[salesmanId] = [];
          }
          followedMap[salesmanId].push(ikutEmployee.id);
        }
      }
    );

    return followedMap;
  }, [salesmanIkutRelations, salesmanIkutEmployees]);

  // Update day type and hours when date changes
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    const newDayType = determineDayType(newDate);
    const newDefaultHours = getDefaultHours(e.target.value);
    const oldDefaultHours = getDefaultHours(formData.logDate);

    // Clear products linked refs when date changes (products will be different)
    if (productsLinkedRef.current) {
      productsLinkedRef.current = {};
    }
    if (ikutProductsLinkedRef.current) {
      ikutProductsLinkedRef.current = {};
    }

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
  useEffect(() => {
    if (
      !initialStateSetRef.current &&
      isInitializationComplete &&
      !loadingStaffs &&
      !loadingJobs &&
      !loadingPayCodeMappings &&
      expandedEmployees.length > 0
    ) {
      // Use a longer delay to ensure all post-initialization effects have completed
      // (e.g., copying products to SALESMAN_IKUT activities, updating muat activities)
      const timeoutId = setTimeout(() => {
        initialStateSetRef.current = true;
        setInitialState({
          formData: JSON.parse(JSON.stringify(formData)),
          employeeSelectionState: JSON.parse(
            JSON.stringify(employeeSelectionState)
          ),
          employeeActivities: JSON.parse(JSON.stringify(employeeActivities)),
          locationTypes: JSON.parse(JSON.stringify(locationTypes)),
          salesmanIkutRelations: JSON.parse(
            JSON.stringify(salesmanIkutRelations)
          ),
          ikutBagCounts: JSON.parse(JSON.stringify(ikutBagCounts)),
          ikutDoubled: JSON.parse(JSON.stringify(ikutDoubled)),
          leaveEmployees: JSON.parse(JSON.stringify(leaveEmployees)),
          leaveEmployeeActivities: JSON.parse(
            JSON.stringify(leaveEmployeeActivities)
          ),
          leaveBalances: JSON.parse(JSON.stringify(leaveBalances)),
        });
      }, 800); // Longer delay to ensure all post-initialization effects complete

      return () => clearTimeout(timeoutId);
    }
  }, [
    // Only depend on initialization-related variables
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

        // Wait for products to be fetched if there are selected salesmen
        const hasSelectedSalesmen = Object.entries(
          employeeSelectionState.selectedJobs
        ).some(([_, jobTypes]) =>
          jobTypes.some((jt) => JOB_IDS.includes(jt))
        );
        if (
          hasSelectedSalesmen &&
          Object.keys(salesmanProducts).length === 0
        ) {
          return false; // Still waiting for products
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
    salesmanProducts,
    mode,
    existingWorkLog,
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

      // SALESMAN has no required context fields to validate
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

  const handleBack = () => {
    safeNavigate(`/payroll/${jobType.toLowerCase()}-production`);
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
      }

      // Handle SALESMAN selection/deselection cascading to SALESMAN_IKUT employees
      if (jobType === "SALESMAN") {
        const followedEmployees = followedBySalesman[employeeId] || [];

        followedEmployees.forEach((ikutEmployeeId) => {
          const ikutCurrentSelectedJobs =
            updatedSelectedJobs[ikutEmployeeId] || [];

          if (wasSelected) {
            // Deselecting SALESMAN - also deselect following SALESMAN_IKUT employees
            updatedSelectedJobs[ikutEmployeeId] =
              ikutCurrentSelectedJobs.filter((j) => j !== "SALESMAN_IKUT");
          } else {
            // Selecting SALESMAN - also select following SALESMAN_IKUT employees (if not already selected)
            if (!ikutCurrentSelectedJobs.includes("SALESMAN_IKUT")) {
              updatedSelectedJobs[ikutEmployeeId] = [
                ...ikutCurrentSelectedJobs,
                "SALESMAN_IKUT",
              ];
            }
            // Initialize hours for auto-selected SALESMAN_IKUT employees
            if (!updatedJobHours[ikutEmployeeId]) {
              updatedJobHours[ikutEmployeeId] = {};
            }
            if (!updatedJobHours[ikutEmployeeId]["SALESMAN_IKUT"]) {
              updatedJobHours[ikutEmployeeId]["SALESMAN_IKUT"] = getDefaultHours(formData.logDate);
            }
          }
        });

        // Apply location-based paycodes to auto-selected SALESMAN_IKUT employees
        if (!wasSelected && followedEmployees.length > 0) {
          setTimeout(() => {
            const salesmanRowKey = `${employeeId}-SALESMAN`;
            const salesmanLocationType =
              locationTypes[salesmanRowKey] || "Local";

            // Apply paycode to each auto-selected SALESMAN_IKUT employee - exact same pattern as handleLocationTypeChange
            followedEmployees.forEach((ikutEmployeeId) => {
              const ikutRowKey = `${ikutEmployeeId}-SALESMAN_IKUT`;

              // Check if this SALESMAN_IKUT employee is selected and has activities
              if (employeeActivities[ikutRowKey]) {
                const ikutActivities = employeeActivities[ikutRowKey] || [];

                // Update activities for the SALESMAN_IKUT employee
                const updatedIkutActivities = ikutActivities.map((activity) => {
                  // Apply location-based paycode logic
                  if (
                    salesmanLocationType === "Local" &&
                    activity.payCodeId === "ELAUN_MT"
                  ) {
                    return {
                      ...activity,
                      isSelected: true,
                    };
                  } else if (
                    salesmanLocationType === "Local" &&
                    activity.payCodeId === "ELAUN_MO"
                  ) {
                    return {
                      ...activity,
                      isSelected: false,
                    };
                  } else if (
                    salesmanLocationType === "Outstation" &&
                    activity.payCodeId === "ELAUN_MO"
                  ) {
                    return {
                      ...activity,
                      isSelected: true,
                    };
                  } else if (
                    salesmanLocationType === "Outstation" &&
                    activity.payCodeId === "ELAUN_MT"
                  ) {
                    return {
                      ...activity,
                      isSelected: false,
                    };
                  }

                  return activity;
                });

                // Recalculate amounts for the SALESMAN_IKUT employee
                const recalculatedIkutActivities = calculateActivitiesAmounts(
                  updatedIkutActivities,
                  0, // No hours needed for allowance paycodes
                  formData.contextData,
                  undefined,
                  formData.logDate
                );

                // Individual setEmployeeActivities call for each employee - same as handleLocationTypeChange
                setEmployeeActivities((prev) => ({
                  ...prev,
                  [ikutRowKey]: recalculatedIkutActivities,
                }));
              }
            });
          }, 200); // Single delay to ensure activities are loaded
        }
      }

      return {
        selectedJobs: updatedSelectedJobs,
        jobHours: updatedJobHours,
      };
    });
  };

  const handleLocationTypeChange = (
    rowKey: string | undefined,
    locationType: "Local" | "Outstation"
  ) => {
    if (!rowKey) return;

    const [employeeId, jobType] = rowKey.split("-");

    setLocationTypes((prev) => ({
      ...prev,
      [rowKey]: locationType,
    }));

    // Recalculate activities when location type changes
    const activities = employeeActivities[rowKey] || [];

    // Update activities based on location type for the salesman
    if (activities.length > 0) {
      const recalculatedActivities = calculateActivitiesAmounts(
        activities,
        0, // Hours don't matter for salesmen
        formData.contextData,
        locationType,
        formData.logDate
      );

      setEmployeeActivities((prev) => ({
        ...prev,
        [rowKey]: recalculatedActivities,
      }));
    }

    // Apply location-based paycodes to SALESMAN_IKUT employees following this salesman
    if (jobType === "SALESMAN") {
      const followedEmployees = followedBySalesman[employeeId] || [];

      followedEmployees.forEach((ikutEmployeeId) => {
        // Find the SALESMAN_IKUT row key for this employee
        const ikutRowKey = `${ikutEmployeeId}-SALESMAN_IKUT`;

        // Check if this SALESMAN_IKUT employee is selected and has activities
        if (employeeActivities[ikutRowKey]) {
          const ikutActivities = employeeActivities[ikutRowKey] || [];

          // Update activities for the SALESMAN_IKUT employee
          const updatedIkutActivities = ikutActivities.map((activity) => {
            // Apply location-based paycode logic
            if (locationType === "Local" && activity.payCodeId === "ELAUN_MT") {
              return {
                ...activity,
                isSelected: true,
              };
            } else if (
              locationType === "Local" &&
              activity.payCodeId === "ELAUN_MO"
            ) {
              return {
                ...activity,
                isSelected: false,
              };
            } else if (
              locationType === "Outstation" &&
              activity.payCodeId === "ELAUN_MO"
            ) {
              return {
                ...activity,
                isSelected: true,
              };
            } else if (
              locationType === "Outstation" &&
              activity.payCodeId === "ELAUN_MT"
            ) {
              return {
                ...activity,
                isSelected: false,
              };
            }

            return activity;
          });

          // Recalculate amounts for the SALESMAN_IKUT employee
          const recalculatedIkutActivities = calculateActivitiesAmounts(
            updatedIkutActivities,
            employeeSelectionState.jobHours[ikutEmployeeId]?.[
              "SALESMAN_IKUT"
            ] || getDefaultHours(formData.logDate),
            formData.contextData,
            undefined,
            formData.logDate
          );

          setEmployeeActivities((prev) => ({
            ...prev,
            [ikutRowKey]: recalculatedIkutActivities,
          }));
        }
      });
    }
  };

  const fetchSalesmanProducts = async () => {
    if (!formData.logDate) return;

    // Skip if we've already fetched for this date (optimization to reduce API calls)
    if (productsFetchedForDateRef.current === formData.logDate) return;

    try {
      // Get ALL salesman IDs (not just selected ones) - fetch once per date
      const salesmenIds = salesmanEmployees.map((emp) => emp.id);

      if (salesmenIds.length === 0) return;

      // Pass date as YYYY-MM-DD string to avoid timezone issues between client and server
      const dateString = formData.logDate;

      // Fetch products for ALL salesmen in one request
      const response = await api.get(
        `/api/invoices/salesman-products?salesmanIds=${salesmenIds.join(",")}&date=${dateString}`
      );

      // Mark as fetched for this date
      productsFetchedForDateRef.current = formData.logDate;

      // Response might be directly available or in a data property
      const responseData = response.data || response;

      // Create row keys for each salesman (always use SALESMAN job type)
      const rowKeyProducts: Record<string, any[]> = {};

      Object.entries(responseData).forEach(([salesmanId, products]) => {
        const rowKey = `${salesmanId}-SALESMAN`;

        // Ensure products is always an array and has required fields
        const productArray = Array.isArray(products) ? products : [];

        // Filter to only include products with valid data
        rowKeyProducts[rowKey] = productArray.filter(
          (p) =>
            p &&
            p.product_id &&
            typeof p.quantity === "number" &&
            p.quantity > 0
        );
      });

      // Also add empty arrays for salesmen with no products (for proper clearing)
      salesmenIds.forEach((salesmanId) => {
        const rowKey = `${salesmanId}-SALESMAN`;
        if (!rowKeyProducts[rowKey]) {
          rowKeyProducts[rowKey] = [];
        }
      });

      setSalesmanProducts(rowKeyProducts);
    } catch (error) {
      console.error("Error fetching salesman products:", error);
      toast.error("Failed to fetch salesman products");
    }
  };

  // Track previous date to detect date changes
  const previousDateRef = useRef<string | null>(null);
  // Track if products have been fetched for current date (to avoid re-fetching on selection changes)
  const productsFetchedForDateRef = useRef<string | null>(null);

  useEffect(() => {
    // Clear refs when date changes to force re-linking and re-fetching
    if (previousDateRef.current !== null && previousDateRef.current !== formData.logDate) {
      productsLinkedRef.current = {};
      ikutProductsLinkedRef.current = {};
      productsFetchedForDateRef.current = null; // Reset so we fetch for new date
    }
    previousDateRef.current = formData.logDate;

    // Fetch ALL salesman products once when date changes or employees load
    // No longer depends on selectedJobs - fetch everything upfront
    if (formData.logDate && salesmanEmployees.length > 0) {
      fetchSalesmanProducts();
    }
  }, [
    formData.logDate,
    salesmanEmployees.length, // Only re-fetch when date changes or employees load
  ]);

  useEffect(() => {
    // After salesmanProducts are updated, auto-link them to pay codes
    // Also clear products for salesmen who no longer have products on this date

    // Get all SALESMAN rowKeys that should have products checked
    const salesmanRowKeys = Object.entries(employeeSelectionState.selectedJobs)
      .flatMap(([employeeId, jobTypes]) =>
        jobTypes.filter((jt) => jt === "SALESMAN").map((jt) => `${employeeId}-${jt}`)
      );

    // For each SALESMAN, check if they have products or need clearing
    salesmanRowKeys.forEach((rowKey) => {
      const products = salesmanProducts[rowKey] || [];
      const currentActivities = employeeActivities[rowKey] || [];

      if (currentActivities.length === 0) return;

      // Create hash for current products (empty array = empty hash)
      const productsHash = JSON.stringify(
        products.map((p) => ({ id: p.product_id, qty: p.quantity }))
      );

      // Skip if we've already processed this exact state
      if (productsLinkedRef.current[rowKey] === productsHash) {
        return;
      }

      // Mark as processed
      productsLinkedRef.current[rowKey] = productsHash;

      setEmployeeActivities((prev) => {
        const prevActivities = prev[rowKey] || [];
        if (prevActivities.length === 0) return prev;

        const updatedActivities = [...prevActivities];

        if (products.length === 0) {
          // No products for this date - clear all product-based pay codes
          // Product pay codes are those matching product IDs (like "1-2UDG", "2-BH", etc.)
          updatedActivities.forEach((activity, index) => {
            // Check if this is a product-based paycode (starts with number or "WE-")
            const payCodeId = String(activity.payCodeId);
            const isProductPaycode = /^(\d|WE-)/.test(payCodeId);

            if (isProductPaycode && activity.unitsProduced > 0) {
              updatedActivities[index] = {
                ...activity,
                unitsProduced: 0,
                isSelected: false,
                calculatedAmount: 0,
              };
            }
          });
        } else {
          // Has products - update quantities
          // Update or clear each product-based activity
          updatedActivities.forEach((activity, index) => {
            const payCodeId = String(activity.payCodeId);
            const isProductPaycode = /^(\d|WE-)/.test(payCodeId);

            if (isProductPaycode) {
              const product = products.find((p) => String(p.product_id) === payCodeId);
              if (product) {
                const quantity = parseFloat(product.quantity) || 0;
                if (quantity > 0) {
                  const newAmount = quantity * (activity.rate || 0);
                  updatedActivities[index] = {
                    ...activity,
                    unitsProduced: quantity,
                    isSelected: true,
                    calculatedAmount: newAmount,
                  };
                }
              } else if (activity.unitsProduced > 0) {
                // This product no longer has data - clear it
                updatedActivities[index] = {
                  ...activity,
                  unitsProduced: 0,
                  isSelected: false,
                  calculatedAmount: 0,
                };
              }
            }
          });
        }

        // Auto-deselect Hour-based activities
        updatedActivities.forEach((activity, index) => {
          if (activity.rateUnit === "Hour" || activity.rateUnit === "Bill") {
            updatedActivities[index] = {
              ...activity,
              isSelected: false,
              calculatedAmount: 0,
            };
          }
        });

        // Recalculate amounts for all activities
        const recalculatedActivities = calculateActivitiesAmounts(
          updatedActivities,
          0,
          formData.contextData,
          locationTypes[rowKey] || "Local",
          formData.logDate
        );

        return {
          ...prev,
          [rowKey]: recalculatedActivities,
        };
      });
    });
  }, [salesmanProducts, employeeActivities, formData.contextData, formData.logDate, locationTypes, employeeSelectionState.selectedJobs]);

  const handleManageActivities = (employee: EmployeeWithHours) => {
    // Ensure rowKey is available
    if (!employee.rowKey) {
      console.error(
        "Cannot open activities modal - employee rowKey is missing"
      );
      return;
    }

    // Get the products for this specific employee and job
    const rowKey = employee.rowKey;
    const productsForEmployee = salesmanProducts[rowKey] || [];

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
    let allSelectedEmployees = Object.entries(
      employeeSelectionState.selectedJobs
    ).filter(([_, jobTypes]) => jobTypes.length > 0);

    // Remove excluded employees
    const excludedEmployees = ["KILANG", "TIMOTHY.G"];
    allSelectedEmployees = allSelectedEmployees.filter(
      ([employeeId, _]) => !excludedEmployees.includes(employeeId)
    );

    if (allSelectedEmployees.length === 0 && leaveEntries.length === 0) {
      toast.error("Please select at least one employee for work or leave.");
      return;
    }

    // Note: Salesmen don't require hours validation

    // Build the employee data with all selected jobs
    const selectedEmployeeData = allSelectedEmployees
      .map(([employeeId, jobTypes]) => {
        return jobTypes.map((jobType) => {
          const hours =
            employeeSelectionState.jobHours[employeeId]?.[jobType] || 0;
          const rowKey = `${employeeId}-${jobType}`;
          const activities = employeeActivities[rowKey] || [];
          const employeeObject = expandedEmployees.find(
            (e) => e.rowKey === rowKey
          );

          // Add salesman-specific additional data
          const additionalData: any = {
            locationType: employeeObject
              ? getEffectiveLocationType(employeeObject)
              : "Local",
          };
          if (jobType === "SALESMAN_IKUT") {
            additionalData.followingSalesmanId = salesmanIkutRelations[rowKey];
            additionalData.muatMeeBags = ikutBagCounts[rowKey]?.muatMee || 0;
            additionalData.muatBihunBags =
              ikutBagCounts[rowKey]?.muatBihun || 0;
            additionalData.isDoubled = ikutDoubled[rowKey] || false;
          }

          return {
            employeeId,
            jobType,
            hours,
            activities,
            ...additionalData,
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
      contextData: formData.contextData,
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
        locationTypes: JSON.parse(JSON.stringify(locationTypes)),
        salesmanIkutRelations: JSON.parse(
          JSON.stringify(salesmanIkutRelations)
        ),
        ikutBagCounts: JSON.parse(JSON.stringify(ikutBagCounts)),
        ikutDoubled: JSON.parse(JSON.stringify(ikutDoubled)),
        leaveEmployees: JSON.parse(JSON.stringify(leaveEmployees)),
        leaveEmployeeActivities: JSON.parse(
          JSON.stringify(leaveEmployeeActivities)
        ),
        leaveBalances: JSON.parse(JSON.stringify(leaveBalances)),
      });
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

      expandedEmployees.forEach((employee: { id: any; jobType: any }) => {
        const employeeId = employee.id;
        const jobType = employee.jobType;

        // Skip SALESMAN_IKUT employees from default selection
        if (jobType === "SALESMAN_IKUT") {
          return;
        }

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
      });

      // Update the state with all employees selected
      setEmployeeSelectionState({
        selectedJobs: newSelectedJobs,
        jobHours: newJobHours,
      });
    }
  }, [expandedEmployees, loadingStaffs, loadingJobs, formData.logDate]);

  // Handle select all/deselect all employees
  const handleSelectAll = () => {
    // Check if all salesman employees are selected
    const allAvailableSelected = salesmanEmployees.every((emp) =>
      employeeSelectionState.selectedJobs[emp.id]?.includes(emp.jobType)
    );

    setEmployeeSelectionState((prev) => {
      if (allAvailableSelected) {
        // Deselect all salesman employees
        const newSelectedJobs = { ...prev.selectedJobs };
        salesmanEmployees.forEach((emp) => {
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
        // Select all salesman employees
        const newSelectedJobs = { ...prev.selectedJobs };
        const newJobHours = { ...prev.jobHours };

        salesmanEmployees.forEach((emp) => {
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

  const handleIkutChange = (ikutRowKey: string, salesmanId: string) => {
    setSalesmanIkutRelations((prev) => ({
      ...prev,
      [ikutRowKey]: salesmanId,
    }));

    // Auto-select the SALESMAN_IKUT employee when a salesman is chosen
    if (salesmanId) {
      const ikutEmployee = salesmanIkutEmployees.find(
        (emp) => emp.rowKey === ikutRowKey
      );
      if (ikutEmployee) {
        setEmployeeSelectionState((prevState) => {
          const newSelectedJobs = { ...prevState.selectedJobs };
          const newJobHours = { ...prevState.jobHours };

          // Initialize if needed
          if (!newSelectedJobs[ikutEmployee.id]) {
            newSelectedJobs[ikutEmployee.id] = [];
          }
          if (!newJobHours[ikutEmployee.id]) {
            newJobHours[ikutEmployee.id] = {};
          }

          // Add SALESMAN_IKUT to selected jobs if not already selected
          if (!newSelectedJobs[ikutEmployee.id].includes("SALESMAN_IKUT")) {
            newSelectedJobs[ikutEmployee.id].push("SALESMAN_IKUT");
          }

          // Set default hours if not already set (5 for Saturday, 7 for other days)
          if (!newJobHours[ikutEmployee.id]["SALESMAN_IKUT"]) {
            newJobHours[ikutEmployee.id]["SALESMAN_IKUT"] = getDefaultHours(formData.logDate);
          }

          return {
            selectedJobs: newSelectedJobs,
            jobHours: newJobHours,
          };
        });

        // No need for setTimeout - paycode application now happens automatically in fetchAndApplyActivities
      }
    } else {
      // Auto-deselect the SALESMAN_IKUT employee when salesman selection is cleared
      const ikutEmployee = salesmanIkutEmployees.find(
        (emp) => emp.rowKey === ikutRowKey
      );
      if (ikutEmployee) {
        setEmployeeSelectionState((prevState) => {
          const newSelectedJobs = { ...prevState.selectedJobs };

          if (newSelectedJobs[ikutEmployee.id]) {
            newSelectedJobs[ikutEmployee.id] = newSelectedJobs[
              ikutEmployee.id
            ].filter((jobType) => jobType !== "SALESMAN_IKUT");
          }

          return {
            selectedJobs: newSelectedJobs,
            jobHours: prevState.jobHours, // Keep hours for potential re-selection
          };
        });
      }
    }
  };

  const handleBagCountChange = (
    rowKey: string,
    field: "muatMee" | "muatBihun",
    value: string,
    isDoubled: boolean = false
  ) => {
    // When x2 is active, user enters doubled value, we store base value (divide by 2)
    const displayValue = value === "" ? 0 : parseInt(value) || 0;
    // When doubled, round to nearest even number then divide by 2
    const baseValue = isDoubled ? Math.round(displayValue / 2) : displayValue;

    setIkutBagCounts((prev) => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        [field]: baseValue,
      },
    }));
  };

  const handleDoubleToggle = (rowKey: string) => {
    setIkutDoubled((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  };

  // Update Muat activities when ikutBagCounts or ikutDoubled changes
  useEffect(() => {
    if (!isInitializationComplete) return;

    Object.entries(ikutBagCounts).forEach(([rowKey, bagCounts]) => {
      const isDoubled = ikutDoubled[rowKey] || false;
      // Apply x2 multiplier if active
      const muatMeeQty = isDoubled
        ? (bagCounts.muatMee || 0) * 2
        : bagCounts.muatMee || 0;
      const muatBihunQty = isDoubled
        ? (bagCounts.muatBihun || 0) * 2
        : bagCounts.muatBihun || 0;

      // Only update if activities exist for this employee
      if (employeeActivities[rowKey] && employeeActivities[rowKey].length > 0) {
        setEmployeeActivities((prev) => {
          const activities = prev[rowKey] || [];
          let hasChanges = false;

          const updatedActivities = activities.map((activity) => {
            if (activity.payCodeId === MUAT_MEE_PAYCODE) {
              const newAmount = muatMeeQty * (activity.rate || 0);
              if (
                activity.unitsProduced !== muatMeeQty ||
                activity.calculatedAmount !== newAmount ||
                activity.isSelected !== (muatMeeQty > 0)
              ) {
                hasChanges = true;
                return {
                  ...activity,
                  unitsProduced: muatMeeQty,
                  isSelected: muatMeeQty > 0,
                  calculatedAmount: newAmount,
                };
              }
            }
            if (activity.payCodeId === MUAT_BIHUN_PAYCODE) {
              const newAmount = muatBihunQty * (activity.rate || 0);
              if (
                activity.unitsProduced !== muatBihunQty ||
                activity.calculatedAmount !== newAmount ||
                activity.isSelected !== (muatBihunQty > 0)
              ) {
                hasChanges = true;
                return {
                  ...activity,
                  unitsProduced: muatBihunQty,
                  isSelected: muatBihunQty > 0,
                  calculatedAmount: newAmount,
                };
              }
            }
            return activity;
          });

          // Only return new state if there were changes
          if (hasChanges) {
            return { ...prev, [rowKey]: updatedActivities };
          }
          return prev;
        });
      }
    });
  }, [ikutBagCounts, ikutDoubled, isInitializationComplete]);

  // Copy products from followed salesman to SALESMAN_IKUT activities
  // Note: We intentionally exclude employeeActivities from deps to avoid cascading updates.
  // The ref tracking ensures we process when salesman/products/doubled changes.
  useEffect(() => {
    if (!isInitializationComplete) return;

    // Get all DME/DWE paycodes for clearing
    const allDmePaycodes = Object.values(PRODUCT_TO_SALESMAN_IKUT_PAYCODE);

    Object.entries(salesmanIkutRelations).forEach(([ikutRowKey, salesmanId]) => {
      if (!salesmanId) {
        // Clear the linked ref and reset product quantities if no salesman is followed
        if (ikutProductsLinkedRef.current[ikutRowKey]) {
          delete ikutProductsLinkedRef.current[ikutRowKey];
          // Clear all DME/DWE paycode activities for this employee
          setEmployeeActivities((prev) => {
            const activities = prev[ikutRowKey] || [];
            if (activities.length === 0) return prev;

            let hasChanges = false;
            const updatedActivities = activities.map((activity) => {
              // Check if this paycode is one of the DME/DWE mapped ones
              const isDmePaycode = allDmePaycodes.includes(activity.payCodeId);
              if (isDmePaycode && (activity.unitsProduced > 0 || activity.isSelected)) {
                hasChanges = true;
                return {
                  ...activity,
                  unitsProduced: 0,
                  isSelected: false,
                  calculatedAmount: 0,
                };
              }
              return activity;
            });

            if (hasChanges) {
              return { ...prev, [ikutRowKey]: updatedActivities };
            }
            return prev;
          });
        }
        return;
      }

      // Find the followed salesman's rowKey (always SALESMAN job type)
      const salesmanRowKey = `${salesmanId}-SALESMAN`;
      const salesmanProductList = salesmanProducts[salesmanRowKey] || [];
      const isDoubled = ikutDoubled[ikutRowKey] || false;

      // Create a hash to track if products/doubled state changed
      const productsHash = JSON.stringify({
        products: salesmanProductList.map((p) => ({
          id: p.product_id,
          qty: p.quantity,
        })),
        isDoubled,
        salesmanId,
      });

      // Skip if we've already linked these exact products for this rowKey
      if (ikutProductsLinkedRef.current[ikutRowKey] === productsHash) {
        return;
      }

      // Build a map of DME/DWE paycode -> total quantity
      // Initialize all DME paycodes to 0 first (to clear old values when switching salesmen)
      const paycodeQuantities: Record<string, number> = {};
      allDmePaycodes.forEach((paycode) => {
        paycodeQuantities[paycode] = 0;
      });

      // Then apply the new salesman's products
      salesmanProductList.forEach((product) => {
        const productId = String(product.product_id);
        const dmePaycode = PRODUCT_TO_SALESMAN_IKUT_PAYCODE[productId];
        if (dmePaycode) {
          const qty = parseFloat(product.quantity) || 0;
          // Apply x2 multiplier if active
          const finalQty = isDoubled ? qty * 2 : qty;
          paycodeQuantities[dmePaycode] = (paycodeQuantities[dmePaycode] || 0) + finalQty;
        }
      });

      // Update SALESMAN_IKUT activities with the mapped quantities
      setEmployeeActivities((prev) => {
        const activities = prev[ikutRowKey] || [];
        // Skip if activities haven't been loaded yet - DON'T mark as linked
        if (activities.length === 0) return prev;

        let hasChanges = false;

        const updatedActivities = activities.map((activity) => {
          const mappedQty = paycodeQuantities[activity.payCodeId];
          if (mappedQty !== undefined) {
            const newAmount = mappedQty * (activity.rate || 0);
            if (
              activity.unitsProduced !== mappedQty ||
              activity.calculatedAmount !== newAmount ||
              activity.isSelected !== (mappedQty > 0)
            ) {
              hasChanges = true;
              return {
                ...activity,
                unitsProduced: mappedQty,
                isSelected: mappedQty > 0,
                calculatedAmount: newAmount,
              };
            }
          }
          return activity;
        });

        if (hasChanges) {
          // Only mark as linked when we actually process activities
          ikutProductsLinkedRef.current[ikutRowKey] = productsHash;
          return { ...prev, [ikutRowKey]: updatedActivities };
        }
        // If no changes were needed, still mark as linked to prevent re-processing
        ikutProductsLinkedRef.current[ikutRowKey] = productsHash;
        return prev;
      });
    });
  }, [salesmanIkutRelations, salesmanProducts, ikutDoubled, isInitializationComplete]);

  // Update select all state based on individual selections and availability
  useEffect(() => {
    const totalAvailable = salesmanEmployees.length;
    const selectedAvailable = salesmanEmployees.filter((emp) =>
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
    salesmanEmployees,
    leaveEmployees,
    availableForLeave,
  ]);

  // Auto-deselect excluded employees (KILANG, TIMOTHY.G)
  useEffect(() => {
    const excludedEmployees = ["KILANG", "TIMOTHY.G"];
    let needsUpdate = false;

    setEmployeeSelectionState((prev) => {
      const updatedSelectedJobs = { ...prev.selectedJobs };

      excludedEmployees.forEach((employeeId) => {
        if (updatedSelectedJobs[employeeId]?.includes("SALESMAN")) {
          updatedSelectedJobs[employeeId] = updatedSelectedJobs[
            employeeId
          ].filter((jobType) => jobType !== "SALESMAN");
          needsUpdate = true;
        }
      });

      return needsUpdate
        ? { ...prev, selectedJobs: updatedSelectedJobs }
        : prev;
    });
  }, []);

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

  useEffect(() => {
    // Update activities based on ikutBagCounts changes
    setEmployeeActivities((prev) => {
      const updatedActivities = { ...prev };

      Object.entries(ikutBagCounts).forEach(([rowKey, bagCounts]) => {
        const currentActivities = updatedActivities[rowKey] || [];

        const updatedRowActivities = currentActivities.map((activity) => {
          // Link Muat Mee paycode (you'll need to define the paycode ID)
          if (activity.payCodeId === "MUAT_MEE_PAYCODE_ID") {
            return {
              ...activity,
              unitsProduced: bagCounts.muatMee,
              isContextLinked: true,
            };
          }

          // Link Muat Bihun paycode (you'll need to define the paycode ID)
          if (activity.payCodeId === "MUAT_BIHUN_PAYCODE_ID") {
            return {
              ...activity,
              unitsProduced: bagCounts.muatBihun,
              isContextLinked: true,
            };
          }

          return activity;
        });

        updatedActivities[rowKey] = updatedRowActivities;
      });

      return updatedActivities;
    });
  }, [ikutBagCounts]);

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
            // Skip Hour-based and Bill-based pay codes for salesmen
            if (pc.rate_unit === "Hour" || pc.rate_unit === "Bill") {
              return;
            }
            allPayCodes.set(pc.id, { ...pc, source: "employee" });
          });

          // Convert map back to array
          const mergedPayCodes = Array.from(allPayCodes.values());

          // Check if this employee was originally saved in the work log
          const wasOriginallySaved = savedEmployeeRowKeysRef.current.has(rowKey);

          // Get existing activities for this employee/job if in edit mode
          // For originally saved employees, use the preserved ref to handle deselect/re-select cycles
          const existingActivitiesForRow = wasOriginallySaved
            ? savedEmployeeActivitiesRef.current[rowKey] || []
            : employeeActivities[rowKey] || [];

          // Salesmen don't filter by hours since hours aren't applicable
          const filteredPayCodes = mergedPayCodes;

          // Convert to activity format
          const activities = filteredPayCodes.map((payCode) => {
            const isContextLinked = contextLinkedPayCodes[payCode.id];

            // Find existing activity for this pay code to preserve user-entered data
            // In edit mode for originally saved employees, use savedActivitiesRef
            // Otherwise, use current employeeActivities to preserve entered unitsProduced
            const existingActivity = existingActivitiesForRow.find(
              (ea) => ea.payCodeId === payCode.id
            );

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
              // First check if this activity was already selected by user (e.g., product quantities linked)
              // Preserve existing selection for activities with entered data
              if (existingActivity && existingActivity.unitsProduced > 0) {
                // Preserve selection for activities that already have units entered
                isSelected = existingActivity.isSelected;
              } else if (existingActivity && existingActivity.isSelected &&
                         !["Hour", "Bill"].includes(payCode.rate_unit)) {
                // Preserve manual selection (but not for Hour/Bill which should never be selected)
                isSelected = existingActivity.isSelected;
              } else {
                // Apply auto-selection rules for new entries
                if (payCode.pay_type === "Tambahan") {
                  // NEVER auto-select Tambahan pay codes
                  isSelected = false;
                } else if (payCode.pay_type === "Overtime") {
                  // Salesmen don't have hour-based overtime, never auto-select
                  isSelected = false;
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

                // Always deselect Hour-based pay codes for salesmen
                if (payCode.rate_unit === "Hour" || payCode.rate_unit === "Bill") {
                  isSelected = false;
                }

                // Special logic for SALESMAN_IKUT employees - don't auto-select any allowance paycodes
                // Let the location-based logic in handleIkutChange handle the selection
                if (jobType === "SALESMAN_IKUT") {
                  if (payCode.id === "ELAUN_MT" || payCode.id === "ELAUN_MO") {
                    isSelected = false; // Don't auto-select, let location logic handle it
                  }
                }
              }
            }

            // Determine units produced
            const unitsProduced =
              isContextLinked && contextLinkedPayCodes[payCode.id]
                ? formData.contextData[contextLinkedPayCodes[payCode.id].id] ||
                  0
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
                0, // Salesmen don't track hours
                formData.contextData,
                undefined,
                formData.logDate
              ),
            };
          });

          // Apply auto-deselection logic to all activities
          const processedActivities = calculateActivitiesAmounts(
            activities,
            0, // Salesmen don't track hours
            formData.contextData,
            undefined,
            formData.logDate
          );
          newEmployeeActivities[rowKey] = processedActivities;
        });
      }
    );

    // Apply location-based paycodes to SALESMAN_IKUT employees after activities are loaded
    // This ensures paycodes are applied whenever activities are fetched/refreshed
    Object.entries(salesmanIkutRelations).forEach(
      ([ikutRowKey, salesmanId]) => {
        // Check if this SALESMAN_IKUT employee has activities loaded
        if (
          newEmployeeActivities[ikutRowKey] &&
          newEmployeeActivities[ikutRowKey].length > 0
        ) {
          const salesmanRowKey = `${salesmanId}-SALESMAN`;
          const salesmanLocationType = locationTypes[salesmanRowKey] || "Local";
          const ikutActivities = newEmployeeActivities[ikutRowKey];

          // Update activities for the SALESMAN_IKUT employee
          const updatedIkutActivities = ikutActivities.map((activity) => {
            // Apply location-based paycode logic
            if (
              salesmanLocationType === "Local" &&
              activity.payCodeId === "ELAUN_MT"
            ) {
              return {
                ...activity,
                isSelected: true,
              };
            } else if (
              salesmanLocationType === "Local" &&
              activity.payCodeId === "ELAUN_MO"
            ) {
              return {
                ...activity,
                isSelected: false,
              };
            } else if (
              salesmanLocationType === "Outstation" &&
              activity.payCodeId === "ELAUN_MO"
            ) {
              return {
                ...activity,
                isSelected: true,
              };
            } else if (
              salesmanLocationType === "Outstation" &&
              activity.payCodeId === "ELAUN_MT"
            ) {
              return {
                ...activity,
                isSelected: false,
              };
            }

            return activity;
          });

          // Recalculate amounts for the SALESMAN_IKUT employee
          const recalculatedIkutActivities = calculateActivitiesAmounts(
            updatedIkutActivities,
            0, // No hours needed for allowance paycodes
            formData.contextData,
            undefined,
            formData.logDate
          );

          // Update the activities immediately
          newEmployeeActivities[ikutRowKey] = recalculatedIkutActivities;
        }
      }
    );

    // Copy products from followed salesman to SALESMAN_IKUT activities
    // Get all DME/DWE paycodes
    const allDmePaycodes = Object.values(PRODUCT_TO_SALESMAN_IKUT_PAYCODE);

    Object.entries(salesmanIkutRelations).forEach(
      ([ikutRowKey, salesmanId]) => {
        if (!salesmanId) return;
        if (!newEmployeeActivities[ikutRowKey] || newEmployeeActivities[ikutRowKey].length === 0) return;

        const salesmanRowKey = `${salesmanId}-SALESMAN`;
        const salesmanProductList = salesmanProducts[salesmanRowKey] || [];
        const isDoubled = ikutDoubled[ikutRowKey] || false;

        // Build paycode quantities map (initialize all to 0 first)
        const paycodeQuantities: Record<string, number> = {};
        allDmePaycodes.forEach((paycode) => {
          paycodeQuantities[paycode] = 0;
        });

        // Apply products from followed salesman
        salesmanProductList.forEach((product) => {
          const productId = String(product.product_id);
          const dmePaycode = PRODUCT_TO_SALESMAN_IKUT_PAYCODE[productId];
          if (dmePaycode) {
            const qty = parseFloat(product.quantity) || 0;
            const finalQty = isDoubled ? qty * 2 : qty;
            paycodeQuantities[dmePaycode] = (paycodeQuantities[dmePaycode] || 0) + finalQty;
          }
        });

        // Update SALESMAN_IKUT activities
        const ikutActivities = newEmployeeActivities[ikutRowKey];
        const updatedActivities = ikutActivities.map((activity: any) => {
          const mappedQty = paycodeQuantities[activity.payCodeId];
          if (mappedQty !== undefined) {
            const newAmount = mappedQty * (activity.rate || 0);
            return {
              ...activity,
              unitsProduced: mappedQty,
              isSelected: mappedQty > 0,
              calculatedAmount: newAmount,
            };
          }
          return activity;
        });

        newEmployeeActivities[ikutRowKey] = updatedActivities;

        // Update the ref to mark as processed
        const productsHash = JSON.stringify({
          products: salesmanProductList.map((p: any) => ({
            id: p.product_id,
            qty: p.quantity,
          })),
          isDoubled,
          salesmanId,
        });
        ikutProductsLinkedRef.current[ikutRowKey] = productsHash;
      }
    );

    // Apply Muat bag counts for SALESMAN_IKUT employees
    // This ensures bag counts are reapplied when activities are regenerated (e.g., after re-selecting)
    Object.entries(ikutBagCounts).forEach(([rowKey, bagCounts]) => {
      if (!newEmployeeActivities[rowKey] || newEmployeeActivities[rowKey].length === 0) return;

      const isDoubled = ikutDoubled[rowKey] || false;
      const muatMeeQty = isDoubled ? (bagCounts.muatMee || 0) * 2 : bagCounts.muatMee || 0;
      const muatBihunQty = isDoubled ? (bagCounts.muatBihun || 0) * 2 : bagCounts.muatBihun || 0;

      newEmployeeActivities[rowKey] = newEmployeeActivities[rowKey].map((activity: any) => {
        if (activity.payCodeId === MUAT_MEE_PAYCODE) {
          const newAmount = muatMeeQty * (activity.rate || 0);
          return {
            ...activity,
            unitsProduced: muatMeeQty,
            isSelected: muatMeeQty > 0,
            calculatedAmount: newAmount,
          };
        }
        if (activity.payCodeId === MUAT_BIHUN_PAYCODE) {
          const newAmount = muatBihunQty * (activity.rate || 0);
          return {
            ...activity,
            unitsProduced: muatBihunQty,
            isSelected: muatBihunQty > 0,
            calculatedAmount: newAmount,
          };
        }
        return activity;
      });
    });

    // Update with paycode-applied activities (merge with existing to preserve deselected employees)
    setEmployeeActivities((prev) => ({
      ...prev,
      ...newEmployeeActivities,
    }));
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
      const newLocationTypes: Record<string, "Local" | "Outstation"> = {};

      // Restore SALESMAN_IKUT relations, bag counts, and doubled state
      const newSalesmanIkutRelations: Record<string, string> = {};
      const newIkutBagCounts: Record<
        string,
        { muatMee: number; muatBihun: number }
      > = {};
      const newIkutDoubled: Record<string, boolean> = {};

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
        }

        // Restore SALESMAN_IKUT specific data
        if (entry.job_id === "SALESMAN_IKUT") {
          if (entry.following_salesman_id) {
            newSalesmanIkutRelations[rowKey] = entry.following_salesman_id;
          }

          newIkutBagCounts[rowKey] = {
            muatMee: entry.muat_mee_bags || 0,
            muatBihun: entry.muat_bihun_bags || 0,
          };

          // Restore x2 doubled state
          newIkutDoubled[rowKey] = entry.is_doubled || false;
        }

        // Restore SALESMAN location types
        if (entry.job_id === "SALESMAN") {
          newLocationTypes[rowKey] = entry.location_type || "Local";
        }
      });

      // Apply all the restored state
      setEmployeeSelectionState({
        selectedJobs: newSelectedJobs,
        jobHours: newJobHours,
      });
      setEmployeeActivities(newEmployeeActivities);
      setLocationTypes(newLocationTypes);
      setSalesmanIkutRelations(newSalesmanIkutRelations);
      setIkutBagCounts(newIkutBagCounts);
      setIkutDoubled(newIkutDoubled);

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

  // Helper function to get the effective location type for any employee
  const getEffectiveLocationType = (
    employee: EmployeeWithHours
  ): "Local" | "Outstation" => {
    if (!employee.rowKey) return "Local";

    // For SALESMAN employees, use their direct location
    if (employee.jobType === "SALESMAN") {
      return locationTypes[employee.rowKey] || "Local";
    }

    // For SALESMAN_IKUT employees, use the location of the salesman they're following
    if (employee.jobType === "SALESMAN_IKUT") {
      const salesmanId = salesmanIkutRelations[employee.rowKey];
      if (salesmanId) {
        const salesmanRowKey = `${salesmanId}-SALESMAN`;
        return locationTypes[salesmanRowKey] || "Local";
      }
    }

    // For other employees, return Local as default
    return "Local";
  };

  // Update handleActivitiesUpdated to store all activities, not just selected:
  const handleActivitiesUpdated = (activities: any[]) => {
    if (!selectedEmployee?.rowKey) return;

    const rowKey = selectedEmployee.rowKey;
    const locationType = getEffectiveLocationType(selectedEmployee);

    // Recalculate activities with location type
    const recalculatedActivities = calculateActivitiesAmounts(
      activities,
      0, // Hours don't matter for salesmen
      formData.contextData,
      locationType,
      formData.logDate
    );

    setEmployeeActivities((prev) => ({
      ...prev,
      [rowKey]: recalculatedActivities,
    }));

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

          {/* Shift is always Day Shift for Salesman - no selector needed */}
        </div>

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
                <div className="px-4 py-2 border-b border-default-200 dark:border-gray-700 flex items-center justify-between">
                  <SafeLink
                    to="/catalogue/job?id=SALESMAN"
                    hasUnsavedChanges={hasUnsavedChanges}
                    onNavigateAttempt={safeNavigate}
                    className="text-sm font-medium text-default-700 dark:text-gray-300 hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
                  >
                    {jobs.find((j) => j.id === "SALESMAN")?.name || "Salesman"}
                  </SafeLink>
                  {salesmanProductStats.total > 0 && (
                    <div className="flex items-center gap-3 text-xs text-default-500 dark:text-gray-400 truncate min-w-0 flex-1 justify-end ml-4">
                      <span className="truncate">
                        {Object.entries(salesmanProductStats.salesmanTotals).map(([id, data], idx) => (
                          <span key={id}>
                            {idx > 0 && " · "}
                            <span className="font-medium">{id}</span>: {data.total}
                          </span>
                        ))}
                      </span>
                      <span className="text-default-300 dark:text-gray-600 flex-shrink-0">|</span>
                      <span className="truncate">
                        {salesmanProductStats.productTotals.slice(0, 8).map((p, idx) => (
                          <span key={p.id}>
                            {idx > 0 && " · "}
                            <span className="font-medium">{p.id}</span>: {p.qty}
                          </span>
                        ))}
                        {salesmanProductStats.productTotals.length > 8 && " ..."}
                      </span>
                      <span className="text-default-300 dark:text-gray-600 flex-shrink-0">|</span>
                      <span className="flex-shrink-0">Mee: {salesmanProductStats.totalMee} · BH: {salesmanProductStats.totalBihun}</span>
                      <span className="text-default-300 dark:text-gray-600 flex-shrink-0">|</span>
                      <span className="font-medium flex-shrink-0">Total: {salesmanProductStats.total}</span>
                    </div>
                  )}
                </div>
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
                            disabled={false}
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
                          className="px-6 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Location
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-1 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {salesmanEmployees.map((row, index) => {
                        const isSelected =
                          employeeSelectionState.selectedJobs[row.id]?.includes(
                            row.jobType
                          ) || false;

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
                              {(() => {
                                // Only show followed employees that are actually selected
                                const selectedFollowers = (
                                  followedBySalesman[row.id] || []
                                ).filter((ikutEmployeeId) =>
                                  employeeSelectionState.selectedJobs[
                                    ikutEmployeeId
                                  ]?.includes("SALESMAN_IKUT")
                                );

                                if (selectedFollowers.length > 0) {
                                  return (
                                    <span className="text-xs text-default-500 dark:text-gray-400 block mt-1">
                                      (Followed by{" "}
                                      {selectedFollowers
                                        .map((ikutEmployeeId) => {
                                          const ikutEmployee =
                                            availableEmployees.find(
                                              (emp) => emp.id === ikutEmployeeId
                                            );
                                          return ikutEmployee?.name;
                                        })
                                        .join(", ")}
                                      )
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isSelected && !isSaving) {
                                      handleLocationTypeChange(row.rowKey, "Local");
                                    }
                                  }}
                                  disabled={!isSelected || isSaving}
                                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                                    (locationTypes[row.rowKey || ""] || "Local") === "Local"
                                      ? "bg-sky-500 text-white"
                                      : !isSelected
                                      ? "bg-default-100 dark:bg-gray-700 text-default-400 dark:text-gray-500 cursor-not-allowed"
                                      : "bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300 hover:bg-default-200 dark:hover:bg-gray-600"
                                  }`}
                                >
                                  Local
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isSelected && !isSaving) {
                                      handleLocationTypeChange(row.rowKey, "Outstation");
                                    }
                                  }}
                                  disabled={!isSelected || isSaving}
                                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                                    locationTypes[row.rowKey || ""] === "Outstation"
                                      ? "bg-amber-500 text-white"
                                      : !isSelected
                                      ? "bg-default-100 dark:bg-gray-700 text-default-400 dark:text-gray-500 cursor-not-allowed"
                                      : "bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300 hover:bg-default-200 dark:hover:bg-gray-600"
                                  }`}
                                >
                                  Outstation
                                </button>
                              </div>
                            </td>
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

              {/* SALESMAN_IKUT Table */}
              {salesmanIkutEmployees.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm mt-4">
                  <div className="px-4 py-2 border-b border-default-200 dark:border-gray-700">
                    <SafeLink
                      to="/catalogue/job?id=SALESMAN_IKUT"
                      hasUnsavedChanges={hasUnsavedChanges}
                      onNavigateAttempt={safeNavigate}
                      className="text-sm font-medium text-default-700 dark:text-gray-300 hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
                    >
                      Salesman Ikut Lori
                    </SafeLink>
                  </div>
                  <div>
                    <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                      <thead className="bg-default-50 dark:bg-gray-900/50">
                        <tr>
                          <th
                            scope="col"
                            className="px-4 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            ID
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            Name
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-1 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            Ikut Salesman
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            <div className="flex flex-col items-center">
                              <span>Muat (Bags)</span>
                              <div className="flex gap-4 text-[10px] mt-0.5">
                                <span className="w-14 text-center">Mee</span>
                                <span className="w-14 text-center">Bihun</span>
                              </div>
                            </div>
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-1 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            x2
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-1 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                        {salesmanIkutEmployees.map((row, index) => {
                          const selectedSalesman =
                            salesmanIkutRelations[row.rowKey || ""] || "";
                          const isSelected = !!selectedSalesman;
                          const bagCounts = ikutBagCounts[row.rowKey || ""] || {
                            muatMee: 0,
                            muatBihun: 0,
                          };
                          const isDoubled = ikutDoubled[row.rowKey || ""] || false;
                          // Display doubled values when x2 is active
                          const displayMuatMee = isDoubled
                            ? (bagCounts.muatMee || 0) * 2
                            : bagCounts.muatMee || 0;
                          const displayMuatBihun = isDoubled
                            ? (bagCounts.muatBihun || 0) * 2
                            : bagCounts.muatBihun || 0;

                          // Get available salesmen (only those selected for work)
                          const availableSalesmen = salesmanEmployees.filter(
                            (s) =>
                              employeeSelectionState.selectedJobs[
                                s.id
                              ]?.includes(s.jobType)
                          );

                          return (
                            <tr
                              key={row.rowKey}
                              className={`transition-colors duration-150 ${
                                leaveEmployees[row.id]?.selected
                                  ? "bg-default-50 dark:bg-gray-700"
                                  : isSelected
                                  ? "bg-sky-50 dark:bg-sky-900/30"
                                  : "bg-white dark:bg-gray-800"
                              }`}
                            >
                              <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-default-700 dark:text-gray-200">
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
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-default-700 dark:text-gray-200">
                                {row.name}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {availableSalesmen.length > 0 ? (
                                    <>
                                      {availableSalesmen.map((salesman) => (
                                        <button
                                          key={salesman.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isSaving && !leaveEmployees[row.id]?.selected) {
                                              // Toggle: if already selected, deselect; otherwise select
                                              const newValue = selectedSalesman === salesman.id ? "" : salesman.id;
                                              handleIkutChange(row.rowKey || "", newValue);
                                            }
                                          }}
                                          disabled={isSaving || leaveEmployees[row.id]?.selected}
                                          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                                            selectedSalesman === salesman.id
                                              ? "bg-sky-500 text-white"
                                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                                          } ${
                                            isSaving || leaveEmployees[row.id]?.selected
                                              ? "opacity-50 cursor-not-allowed"
                                              : ""
                                          }`}
                                        >
                                          {salesman.name}
                                        </button>
                                      ))}
                                      {selectedSalesman && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isSaving && !leaveEmployees[row.id]?.selected) {
                                              handleIkutChange(row.rowKey || "", "");
                                            }
                                          }}
                                          disabled={isSaving || leaveEmployees[row.id]?.selected}
                                          className={`p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors ${
                                            isSaving || leaveEmployees[row.id]?.selected
                                              ? "opacity-50 cursor-not-allowed"
                                              : ""
                                          }`}
                                          title="Clear selection"
                                        >
                                          <IconX size={14} />
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs text-default-400 dark:text-gray-500 italic">
                                      No salesmen selected
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="flex gap-2 justify-center">
                                  <input
                                    type="number"
                                    value={isSelected ? displayMuatMee.toString() : ""}
                                    onChange={(e) =>
                                      handleBagCountChange(
                                        row.rowKey || "",
                                        "muatMee",
                                        e.target.value,
                                        isDoubled
                                      )
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-14 py-1 text-sm text-right border rounded-md text-default-900 dark:text-gray-100 disabled:bg-default-100 dark:disabled:bg-gray-700 disabled:text-default-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed ${
                                      isDoubled && isSelected
                                        ? "bg-amber-50 border-amber-400 dark:bg-amber-900/30 dark:border-amber-600"
                                        : "bg-white dark:bg-gray-700 border-default-300 dark:border-gray-600"
                                    }`}
                                    min="0"
                                    step={isDoubled ? 2 : 1}
                                    disabled={!isSelected}
                                    placeholder={isSelected ? "0" : "-"}
                                  />
                                  <input
                                    type="number"
                                    value={isSelected ? displayMuatBihun.toString() : ""}
                                    onChange={(e) =>
                                      handleBagCountChange(
                                        row.rowKey || "",
                                        "muatBihun",
                                        e.target.value,
                                        isDoubled
                                      )
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-14 py-1 text-sm text-right border rounded-md text-default-900 dark:text-gray-100 disabled:bg-default-100 dark:disabled:bg-gray-700 disabled:text-default-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed ${
                                      isDoubled && isSelected
                                        ? "bg-amber-50 border-amber-400 dark:bg-amber-900/30 dark:border-amber-600"
                                        : "bg-white dark:bg-gray-700 border-default-300 dark:border-gray-600"
                                    }`}
                                    min="0"
                                    step={isDoubled ? 2 : 1}
                                    disabled={!isSelected}
                                    placeholder={isSelected ? "0" : "-"}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-center">
                                <Checkbox
                                  checked={isDoubled}
                                  onChange={() => {
                                    if (!isSaving && !leaveEmployees[row.id]?.selected && isSelected) {
                                      handleDoubleToggle(row.rowKey || "");
                                    }
                                  }}
                                  size={18}
                                  checkedColor="text-amber-500"
                                  ariaLabel={`Double units for ${row.name}`}
                                  buttonClassName="p-1 rounded-lg"
                                  disabled={!isSelected || isSaving || leaveEmployees[row.id]?.selected}
                                />
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
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
                                  disabled={
                                    !isSelected ||
                                    leaveEmployees[row.id]?.selected
                                  }
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
              )}
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
        salesmanProducts={
          selectedEmployee && selectedEmployee.rowKey
            ? salesmanProducts[selectedEmployee.rowKey] || []
            : []
        }
        locationType={
          selectedEmployee && selectedEmployee.rowKey
            ? getEffectiveLocationType(selectedEmployee)
            : "Local"
        }
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

export default DailyLogSalesmanEntryPage;

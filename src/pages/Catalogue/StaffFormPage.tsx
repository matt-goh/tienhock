import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import Tab from "../../components/Tab";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  FormCombobox,
  FormInput,
  FormListbox,
} from "../../components/FormComponents";
import { useStaffFormOptions } from "../../hooks/useStaffFormOptions";
import SelectedTagsDisplay from "../../components/Catalogue/SelectedTagsDisplay";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  EmployeePayCodeDetails,
  useJobPayCodeMappings,
} from "../../utils/catalogue/useJobPayCodeMappings";
import BatchManageEmployeePayCodesModal from "../../components/Catalogue/BatchManageEmployeePayCodesModal";
import { IconLink, IconChevronDown, IconChevronRight, IconLayoutList, IconLayoutGrid, IconChevronsDown, IconChevronsUp, IconUsers, IconUserPlus, IconCrown, IconExternalLink, IconSettings2 } from "@tabler/icons-react";
import EditEmployeePayCodeRatesModal from "../../components/Catalogue/EditEmployeePayCodeRatesModal";
import EditPayCodeRatesModal from "../../components/Catalogue/EditPayCodeRatesModal";
import BatchManageJobPayCodesModal from "../../components/Catalogue/BatchManageJobPayCodesModal";
import RefreshPayCodeCacheButton from "../../components/Catalogue/RefreshPayCodeCacheButton";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { JobPayCodeDetails, PayType, Job } from "../../types/types";

type PayCodeViewMode = 'grouped' | 'flat';

interface SelectOption {
  id: string;
  name: string;
}

interface SameNameStaff {
  id: string;
  name: string;
  headStaffId: string | null;
  job: string[];
  isHead: boolean;
}

/**
 * This form handles a special case with select dropdowns:
 * - Database stores display names (e.g., "Buddhist", "Malaysian")
 * - Form works with IDs ("B", "MAL") for selection components
 *
 * We convert between these formats:
 * - When loading: Convert display names to IDs (for form selection)
 * - When saving: Convert IDs back to display names (for database storage)
 */
const StaffFormPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const maritalStatusOptions = [
    { id: "Single", name: "Single" },
    { id: "Married", name: "Married" },
  ];

  const spouseEmploymentOptions = [
    { id: "Employed", name: "Employed" },
    { id: "Unemployed", name: "Unemployed" },
  ];
  const [formData, setFormData] = useState<Employee>({
    id: "",
    name: "",
    telephoneNo: "",
    email: "",
    gender: "",
    nationality: "",
    birthdate: "",
    address: "",
    job: [],
    location: [],
    dateJoined: "",
    icNo: "",
    bankAccountNumber: "",
    epfNo: "",
    incomeTaxNo: "",
    socsoNo: "",
    document: "",
    paymentType: "",
    paymentPreference: "",
    race: "",
    agama: "",
    dateResigned: "",
    newId: "",
    maritalStatus: "Single",
    spouseEmploymentStatus: "",
    numberOfChildren: 0,
    department: "",
    kwspNumber: "",
  });
  const [initialFormData, setInitialFormData] = useState<Employee>({
    ...formData,
  });

  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const { options } = useStaffFormOptions();
  const { jobs } = useJobsCache();
  const { refreshStaffs, staffs, loading: loadingStaffs } = useStaffsCache();
  const {
    employeeMappings,
    payCodes: availablePayCodes,
    detailedMappings: jobPayCodeDetails,
    loading: loadingPayCodes,
    refreshData: refreshPayCodeMappings,
  } = useJobPayCodeMappings();
  const [showPayCodeModal, setShowPayCodeModal] = useState(false);
  const [selectedPayCodeForEdit, setSelectedPayCodeForEdit] =
    useState<EmployeePayCodeDetails | null>(null);
  const [showEditRateModal, setShowEditRateModal] = useState(false);
  const [selectedJobPayCodeForEdit, setSelectedJobPayCodeForEdit] =
    useState<JobPayCodeDetails | null>(null);
  const [showJobPayCodeEditModal, setShowJobPayCodeEditModal] = useState(false);
  const [payCodeSearchQuery, setPayCodeSearchQuery] = useState<string>("");
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());
  const [payCodeViewMode, setPayCodeViewMode] = useState<PayCodeViewMode>('grouped');
  // Initialize with all groups collapsed except employee-Base
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set([
    'employee-Tambahan',
    'employee-Overtime',
    'job-Base',
    'job-Tambahan',
    'job-Overtime',
    'shared-Base',
    'shared-Tambahan',
    'shared-Overtime',
  ]));
  const [batchDefaultLoading, setBatchDefaultLoading] = useState<string | null>(null);
  const [batchConfirmDialog, setBatchConfirmDialog] = useState<{
    isOpen: boolean;
    action: 'set' | 'clear';
    payType: string;
    sectionKey: string;
    payCodes: (EmployeePayCodeDetails | JobPayCodeDetails)[];
    onConfirm: () => void;
  } | null>(null);

  // Batch manage job pay codes state
  const [showBatchManageJobPayCodesModal, setShowBatchManageJobPayCodesModal] = useState(false);
  const [selectedJobForBatchManage, setSelectedJobForBatchManage] = useState<Job | null>(null);

  // Same-name staff state for Head management
  const [sameNameStaff, setSameNameStaff] = useState<SameNameStaff[]>([]);
  const [isUniqueName, setIsUniqueName] = useState(true);
  const [loadingSameNameStaff, setLoadingSameNameStaff] = useState(false);
  const [settingHeadStaff, setSettingHeadStaff] = useState(false);

  const genderOptions = [
    { id: "Male", name: "Male" },
    { id: "Female", name: "Female" },
  ];

  const documentOptions = [
    { id: "NI", name: "NI" },
    { id: "OI", name: "OI" },
    { id: "PP", name: "PP" },
    { id: "IM", name: "IM" },
  ];

  const paymentTypeOptions = [
    { id: "Delivery", name: "Delivery" },
    { id: "Money", name: "Money" },
    { id: "Commission", name: "Commission" },
  ];

  const paymentPreferenceOptions = [
    { id: "Bank", name: "Bank" },
    { id: "Cash", name: "Cash" },
    { id: "Cheque", name: "Cheque" },
  ];

  const departmentOptions = [
    { id: "GENERAL WORKER", name: "GENERAL WORKER" },
    { id: "MAINTENANCE", name: "MAINTENANCE" },
    { id: "MACHINE OPERATOR", name: "MACHINE OPERATOR" },
    { id: "SALESMAN", name: "SALESMAN" },
    { id: "MARKETING", name: "MARKETING" },
    { id: "DIRECTOR", name: "DIRECTOR" },
    { id: "LOGISTIC JUNIOR (STOCK)", name: "LOGISTIC JUNIOR (STOCK)" },
    { id: "STOCK & DATA ENTRY CLERK", name: "STOCK & DATA ENTRY CLERK" },
    { id: "BOILERMAN", name: "BOILERMAN" },
    { id: "OPERATION EXECUTIVE", name: "OPERATION EXECUTIVE" },
    { id: "GENERAL CLERK", name: "GENERAL CLERK" },
    { id: "ADMIN", name: "ADMIN" },
    { id: "EXECUTIVE DIRECTOR", name: "EXECUTIVE DIRECTOR" },
  ];

  const getAllPayCodesForEmployee = useCallback(() => {
    if (!id)
      return { employeePayCodes: [], jobPayCodes: [], duplicatePayCodes: [] };

    // Get employee-specific pay codes
    const employeePayCodes = employeeMappings[id] || [];

    // Get job-linked pay codes
    const employeeJobs = formData.job || [];

    // Track which pay codes appear in multiple jobs
    const payCodeJobMap = new Map<string, string[]>();

    // Instead of using uniqueJobPayCodes map, collect all job-paycode combinations
    const allJobPayCodes: EmployeePayCodeDetails[] = [];

    employeeJobs.forEach((jobId) => {
      const jobDetails = jobPayCodeDetails[jobId] || [];
      jobDetails.forEach((payCode) => {
        // Skip if this pay code already exists in employee-specific pay codes
        const isDuplicate = employeePayCodes.some(
          (epc) => epc.id === payCode.id
        );

        if (!isDuplicate) {
          // Track which jobs this pay code belongs to
          if (!payCodeJobMap.has(payCode.id)) {
            payCodeJobMap.set(payCode.id, []);
          }
          payCodeJobMap.get(payCode.id)!.push(jobId);

          // Add to allJobPayCodes with job_id property
          allJobPayCodes.push({
            ...payCode,
            job_id: jobId, // Ensure job_id is set correctly
            source: "job" as const,
          });
        }
      });
    });

    // Separate into unique and duplicate pay codes
    const jobPayCodes: EmployeePayCodeDetails[] = [];
    const duplicatePayCodes: EmployeePayCodeDetails[] = [];

    // Sort pay codes into duplicates and unique based on the payCodeJobMap
    allJobPayCodes.forEach((payCode) => {
      const jobIds = payCodeJobMap.get(payCode.id) || [];
      if (jobIds.length > 1) {
        duplicatePayCodes.push(payCode);
      } else {
        jobPayCodes.push(payCode);
      }
    });

    return {
      employeePayCodes,
      jobPayCodes,
      duplicatePayCodes,
    };
  }, [id, employeeMappings, jobPayCodeDetails, formData.job]);

  // Group pay codes by pay_type
  const groupPayCodesByType = useCallback(
    <T extends { pay_type: PayType }>(payCodes: T[]): Record<PayType, T[]> => {
      const grouped: Record<PayType, T[]> = {
        Base: [],
        Tambahan: [],
        Overtime: [],
      };
      payCodes.forEach((payCode) => {
        const type = payCode.pay_type || "Base";
        if (grouped[type]) {
          grouped[type].push(payCode);
        } else {
          grouped.Base.push(payCode);
        }
      });
      return grouped;
    },
    []
  );

  // Toggle collapse for a group
  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const updated = new Set(prev);
      if (updated.has(groupKey)) {
        updated.delete(groupKey);
      } else {
        updated.add(groupKey);
      }
      return updated;
    });
  }, []);

  // Expand all groups
  const expandAllGroups = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  // Collapse all groups
  const collapseAllGroups = useCallback(() => {
    const allGroupKeys = new Set<string>();
    ['employee', 'job', 'shared'].forEach((section) => {
      ['Base', 'Tambahan', 'Overtime'].forEach((payType) => {
        allGroupKeys.add(`${section}-${payType}`);
      });
    });
    setCollapsedGroups(allGroupKeys);
  }, []);

  // Execute batch default update for employee-specific pay codes
  const executeBatchEmployeeDefault = useCallback(
    async (payCodes: EmployeePayCodeDetails[], value: boolean) => {
      if (!id || payCodes.length === 0) return;

      const payType = payCodes[0]?.pay_type;
      const loadingKey = `employee-${payType}`;
      setBatchDefaultLoading(loadingKey);

      try {
        const payCodeIds = payCodes.map((pc) => pc.id);
        await api.put("/api/employee-pay-codes/batch-default", {
          employee_id: id,
          pay_code_ids: payCodeIds,
          is_default: value,
        });

        toast.success(
          `Successfully ${value ? "set" : "cleared"} default for ${payCodes.length} pay code(s)`
        );
        await refreshPayCodeMappings();
      } catch (error) {
        console.error("Error in batch default update:", error);
        toast.error("An error occurred while updating defaults");
      } finally {
        setBatchDefaultLoading(null);
      }
    },
    [id, refreshPayCodeMappings]
  );

  // Execute batch default update for job-linked pay codes
  const executeBatchJobDefault = useCallback(
    async (payCodes: (EmployeePayCodeDetails | JobPayCodeDetails)[], value: boolean) => {
      if (payCodes.length === 0) return;

      const payType = payCodes[0]?.pay_type;
      const loadingKey = `job-${payType}`;
      setBatchDefaultLoading(loadingKey);

      try {
        const items = payCodes
          .filter((pc): pc is JobPayCodeDetails => "job_id" in pc && !!pc.job_id)
          .map((pc) => ({
            job_id: pc.job_id,
            pay_code_id: pc.id,
          }));

        if (items.length === 0) {
          toast.error("No valid job pay codes to update");
          return;
        }

        await api.put("/api/job-pay-codes/batch-default", {
          items,
          is_default: value,
        });

        toast.success(
          `Successfully ${value ? "set" : "cleared"} default for ${items.length} pay code(s)`
        );
        await refreshPayCodeMappings();
      } catch (error) {
        console.error("Error in batch default update:", error);
        toast.error("An error occurred while updating defaults");
      } finally {
        setBatchDefaultLoading(null);
      }
    },
    [refreshPayCodeMappings]
  );

  // Show batch confirmation dialog
  const showBatchConfirmDialog = useCallback(
    (
      sectionKey: string,
      payType: string,
      payCodes: (EmployeePayCodeDetails | JobPayCodeDetails)[],
      value: boolean
    ) => {
      setBatchConfirmDialog({
        isOpen: true,
        action: value ? "set" : "clear",
        payType,
        sectionKey,
        payCodes,
        onConfirm: () => {
          if (sectionKey === "employee") {
            executeBatchEmployeeDefault(payCodes as EmployeePayCodeDetails[], value);
          } else {
            executeBatchJobDefault(payCodes, value);
          }
        },
      });
    },
    [executeBatchEmployeeDefault, executeBatchJobDefault]
  );

  // Check if all groups are collapsed
  const areAllGroupsCollapsed = collapsedGroups.size >= 9;

  // Color scheme for each pay type
  const payTypeColors: Record<PayType, { bg: string; border: string; headerBg: string; headerText: string }> = {
    Base: {
      bg: "bg-emerald-50 dark:bg-emerald-900/30",
      border: "border-emerald-200 dark:border-emerald-800",
      headerBg: "bg-emerald-100 dark:bg-emerald-900/40",
      headerText: "text-emerald-700 dark:text-emerald-300",
    },
    Tambahan: {
      bg: "bg-amber-50 dark:bg-amber-900/30",
      border: "border-amber-200 dark:border-amber-800",
      headerBg: "bg-amber-100 dark:bg-amber-900/40",
      headerText: "text-amber-700 dark:text-amber-300",
    },
    Overtime: {
      bg: "bg-purple-50 dark:bg-purple-900/30",
      border: "border-purple-200 dark:border-purple-800",
      headerBg: "bg-purple-100 dark:bg-purple-900/40",
      headerText: "text-purple-700 dark:text-purple-300",
    },
  };

  // Render a single pay code card
  const renderPayCodeCard = (
    payCode: EmployeePayCodeDetails | JobPayCodeDetails,
    colorScheme: { bg: string; border: string; headerBg: string; headerText: string },
    onClick: () => void,
    options?: {
      showJobName?: boolean;
      jobName?: string;
      showPayType?: boolean;
    }
  ) => {
    const overrideAccentColor = colorScheme.headerText;
    const { showJobName, jobName, showPayType } = options || {};

    return (
      <div
        key={`${payCode.id}-${payCode.job_id || 'employee'}`}
        className={`flex items-center justify-between px-3 py-2 ${colorScheme.bg} border ${colorScheme.border} rounded-md ${
          isEditMode ? "cursor-pointer hover:opacity-80" : ""
        }`}
        onClick={() => {
          if (isEditMode) {
            onClick();
          }
        }}
        title={`Edit rates for ${payCode.description}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 max-w-full">
              <Link
                to={`/catalogue/pay-codes?desc=${payCode.id}`}
                className="text-sm font-medium text-default-800 dark:text-gray-100 truncate hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
                title={`${payCode.description} (${payCode.id})`}
              >
                {payCode.description}
              </Link>
              <span className="text-xs text-default-500 dark:text-gray-400 rounded-full bg-default-100 dark:bg-gray-800 px-2 py-0.5 flex-shrink-0">
                {payCode.id}
              </span>
            </div>
          </div>

          {/* Job name badge (for shared paycodes) */}
          {showJobName && jobName && (
            <div className="mt-1.5">
              <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full font-medium">
                {jobName}
              </span>
            </div>
          )}

          {/* Rates display */}
          <div className="mt-1 text-xs text-default-600 dark:text-gray-300">
            <div className="flex gap-3 flex-wrap">
              <span>
                Biasa: RM
                {payCode.override_rate_biasa !== null
                  ? payCode.override_rate_biasa.toFixed(2)
                  : (payCode.rate_biasa ?? 0).toFixed(2)}
                {payCode.override_rate_biasa !== null && (
                  <span className={overrideAccentColor} title="Override rate"> *</span>
                )}
              </span>
              <span>
                Ahad: RM
                {payCode.override_rate_ahad !== null
                  ? payCode.override_rate_ahad.toFixed(2)
                  : (payCode.rate_ahad ?? 0).toFixed(2)}
                {payCode.override_rate_ahad !== null && (
                  <span className={overrideAccentColor} title="Override rate"> *</span>
                )}
              </span>
              <span>
                Umum: RM
                {payCode.override_rate_umum !== null
                  ? payCode.override_rate_umum.toFixed(2)
                  : (payCode.rate_umum ?? 0).toFixed(2)}
                {payCode.override_rate_umum !== null && (
                  <span className={overrideAccentColor} title="Override rate"> *</span>
                )}
              </span>
            </div>
            <div className="mt-2 flex gap-1 flex-wrap text-xs">
              {showPayType && (
                <span className={`px-2 py-0.5 ${colorScheme.headerBg} ${colorScheme.headerText} rounded-full font-medium`}>
                  {payCode.pay_type}
                </span>
              )}
              <span className="px-2 py-0.5 bg-default-200 dark:bg-gray-700 text-default-700 dark:text-gray-200 rounded-full">
                {payCode.rate_unit}
              </span>
              {payCode.override_rate_biasa !== null && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-full font-medium">
                  Customized rate
                </span>
              )}
              {payCode.is_default_setting && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full font-medium">
                  Default
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render a collapsible pay type group
  const renderPayTypeGroup = (
    sectionKey: string,
    payType: PayType,
    payCodes: (EmployeePayCodeDetails | JobPayCodeDetails)[],
    onCardClick: (payCode: EmployeePayCodeDetails | JobPayCodeDetails) => void,
    showJobName?: boolean,
    onBatchSetDefault?: (payCodes: (EmployeePayCodeDetails | JobPayCodeDetails)[], value: boolean) => void,
    isBatchLoading?: boolean
  ) => {
    if (payCodes.length === 0) return null;

    const groupKey = `${sectionKey}-${payType}`;
    const isCollapsed = collapsedGroups.has(groupKey);
    const colorScheme = payTypeColors[payType];

    // Filter by search query
    const filteredPayCodes = payCodes.filter(
      (payCode) =>
        !payCodeSearchQuery ||
        payCode.id.toLowerCase().includes(payCodeSearchQuery.toLowerCase()) ||
        payCode.description.toLowerCase().includes(payCodeSearchQuery.toLowerCase())
    );

    if (filteredPayCodes.length === 0) return null;

    return (
      <div key={groupKey} className="space-y-2">
        <div
          className={`flex items-center justify-between px-3 py-1.5 rounded-md border ${colorScheme.headerBg} ${colorScheme.border} ${colorScheme.headerText}`}
        >
          {/* Left: Collapse toggle */}
          <button
            type="button"
            onClick={() => toggleGroupCollapse(groupKey)}
            className="flex items-center gap-2 hover:opacity-90 transition-opacity text-left flex-1"
          >
            {isCollapsed ? (
              <IconChevronRight size={16} />
            ) : (
              <IconChevronDown size={16} />
            )}
            <span className="font-medium text-sm">{payType}</span>
            <span className="text-xs opacity-75">({filteredPayCodes.length})</span>
          </button>

          {/* Right: Batch buttons (only in edit mode) */}
          {isEditMode && onBatchSetDefault && (
            <div
              className="flex items-center gap-1.5 ml-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onBatchSetDefault(filteredPayCodes, true)}
                disabled={isBatchLoading}
                className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-300 dark:hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Set all as default"
              >
                {isBatchLoading ? "..." : "All Default"}
              </button>
              <button
                type="button"
                onClick={() => onBatchSetDefault(filteredPayCodes, false)}
                disabled={isBatchLoading}
                className="px-2 py-0.5 text-xs font-medium rounded bg-default-200 dark:bg-gray-700 text-default-700 dark:text-gray-200 hover:bg-default-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Clear all defaults"
              >
                {isBatchLoading ? "..." : "Clear All"}
              </button>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-2">
            {filteredPayCodes.map((payCode) => {
              const jobName = showJobName && 'job_id' in payCode
                ? jobs.find((j) => j.id === payCode.job_id)?.name || payCode.job_id
                : undefined;

              return renderPayCodeCard(
                payCode,
                colorScheme,
                () => onCardClick(payCode),
                { showJobName, jobName }
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Utility function: Convert display name to option ID
  const mapDisplayNameToId = (
    displayName: string | undefined,
    options: SelectOption[]
  ): string => {
    if (!displayName || displayName === "") return "";

    // First try exact name match (case insensitive)
    const exactNameMatch = options.find(
      (opt) => opt.name.toLowerCase() === displayName.toLowerCase()
    );
    if (exactNameMatch) return exactNameMatch.id;

    // Then try partial name match
    const partialMatch = options.find(
      (opt) =>
        opt.name.toLowerCase().includes(displayName.toLowerCase()) ||
        displayName.toLowerCase().includes(opt.name.toLowerCase())
    );
    if (partialMatch) return partialMatch.id;

    // If we can't find a match, consider it might already be an ID
    const exactIdMatch = options.find((opt) => opt.id === displayName);
    if (exactIdMatch) return displayName;

    // If all else fails, return empty string
    console.warn(`Could not map "${displayName}" to any option ID`);
    return "";
  };

  // Utility function: Convert option ID to display name
  const mapIdToDisplayName = (
    id: string | undefined,
    options: SelectOption[]
  ): string => {
    if (!id || id === "") return "";

    const option = options.find((opt) => opt.id === id);
    if (option) return option.name;

    // If we can't find the ID, it might already be a display name
    const nameMatch = options.find((opt) => opt.name === id);
    if (nameMatch) return id;

    console.warn(`Could not map ID "${id}" to any option name`);
    return "";
  };

  useEffect(() => {
    const hasModifications = modifiedFields.size > 0;

    // If there are tracked modifications, we need to consider the form changed
    if (hasModifications) {
      setIsFormChanged(true);
    } else {
      // Fall back to regular comparison if no tracked modifications
      const hasChanged =
        JSON.stringify(formData) !== JSON.stringify(initialFormData);
      setIsFormChanged(hasChanged);
    }
  }, [formData, initialFormData, modifiedFields]);

  const fetchStaffDetails = useCallback(() => {
    if (!id) return;

    // If staffs are still loading, don't proceed yet
    if (loadingStaffs) {
      return;
    }

    setLoading(true);
    // Find the staff in the cache
    const staffData = staffs.find((staff) => staff.id === id);

    // Helper function to normalize data (from cache or API)
    const normalizeData = (data: Employee): Employee => {
      // Create a base normalized data object
      const normalizedData = {
        ...data,
        nationality: mapDisplayNameToId(
          data.nationality,
          options.nationalities
        ),
        race: mapDisplayNameToId(data.race, options.races),
        agama: mapDisplayNameToId(data.agama, options.agama),
        // Ensure arrays for multi-selects
        job: Array.isArray(data.job) ? data.job : [],
        // Ensure date fields are strings or empty strings for input type="date"
        birthdate: data.birthdate || "",
        dateJoined: data.dateJoined || "",
        dateResigned: data.dateResigned || "",
        maritalStatus: data.maritalStatus || "Single",
        spouseEmploymentStatus: data.spouseEmploymentStatus || "",
        numberOfChildren: data.numberOfChildren || 0,
        department: data.department || "",
        kwspNumber: data.kwspNumber || "",
      };

      // Preserve modified fields from current formData
      if (formData) {
        // For each modified field, keep the user's changes
        Array.from(modifiedFields).forEach((field) => {
          // @ts-ignore - field is a valid key of formData
          normalizedData[field] = formData[field];
        });
      }

      return normalizedData;
    };

    if (staffData) {
      const normalizedData = normalizeData(staffData);
      setFormData(normalizedData);
      setInitialFormData(normalizedData);
      setError(null);
      setLoading(false); // Set loading false here for cache hit
    } else {
      // Fallback to API if not in cache
      api
        .get(`/api/staffs/${id}`)
        .then((data) => {
          // Convert display names to option IDs for form selection
          const normalizedData = normalizeData(data);
          setFormData(normalizedData);
          setInitialFormData(normalizedData);
          setError(null);
        })
        .catch((err) => {
          setError("Failed to fetch staff details. Please try again later.");
          console.error("Error fetching staff details:", err);
        })
        .finally(() => {
          setLoading(false); // Use finally to ensure setLoading(false) is called
        });
    }
  }, [
    id,
    staffs,
    loadingStaffs,
    options.nationalities,
    options.races,
    options.agama,
  ]);

  useEffect(() => {
    if (isEditMode) {
      fetchStaffDetails();
    } else {
      setInitialFormData({ ...formData });
    }
  }, [isEditMode, fetchStaffDetails, loadingStaffs]);

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (id) {
      try {
        await api.delete(`/api/staffs/${id}`);

        // Refresh the cache
        await refreshStaffs();

        setIsDeleteDialogOpen(false);
        toast.success("Staff member deleted successfully");
        navigate("/catalogue/staff");
      } catch (err) {
        console.error("Error deleting staff member:", err);
        toast.error("Failed to delete staff member. Please try again.");
      }
    }
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/catalogue/staff");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/catalogue/staff");
  };

  // Fetch same-name staff for Head management
  const fetchSameNameStaff = useCallback(async () => {
    if (!id) return;

    setLoadingSameNameStaff(true);
    try {
      const response = await api.get(`/api/staffs/same-name/${id}`);
      setSameNameStaff(response.sameNameStaff || []);
      setIsUniqueName(response.isUniqueName);
    } catch (error) {
      console.error("Error fetching same-name staff:", error);
      setSameNameStaff([]);
      setIsUniqueName(true);
    } finally {
      setLoadingSameNameStaff(false);
    }
  }, [id]);

  // Fetch same-name staff when in edit mode
  useEffect(() => {
    if (isEditMode && id) {
      fetchSameNameStaff();
    }
  }, [isEditMode, id, fetchSameNameStaff]);

  // Handle pre-fill data when creating new staff from "Add Same-Name Staff" button
  useEffect(() => {
    if (!isEditMode && location.state?.prefillData) {
      setFormData((prev) => ({
        ...prev,
        ...location.state.prefillData,
        id: "", // Ensure ID is empty
        job: [], // Ensure job is empty
      }));
      // Clear the state to prevent re-applying on subsequent renders
      window.history.replaceState({}, document.title);
    }
  }, [isEditMode, location.state]);

  // Handler for setting head staff
  const handleHeadStaffChange = async (newHeadStaffId: string) => {
    if (!formData.name || settingHeadStaff) return;

    // Don't do anything if clicking on the already-selected head
    const currentHead = sameNameStaff.find((s) => s.isHead);
    if (currentHead?.id === newHeadStaffId) return;

    setSettingHeadStaff(true);
    try {
      await api.put("/api/staffs/set-head", {
        headStaffId: newHeadStaffId,
        staffName: formData.name,
      });

      // Refresh same-name staff list (this updates the isHead flags)
      await fetchSameNameStaff();

      toast.success("Head staff updated successfully");
    } catch (error) {
      console.error("Error setting head staff:", error);
      toast.error("Failed to update head staff");
    } finally {
      setSettingHeadStaff(false);
    }
  };

  // Handler for adding a new staff with the same name
  const handleAddSameNameStaff = () => {
    // Create state object with current staff data, excluding ID and job
    const prefillData = {
      name: formData.name,
      telephoneNo: formData.telephoneNo,
      email: formData.email,
      gender: formData.gender,
      nationality: formData.nationality,
      birthdate: formData.birthdate,
      address: formData.address,
      icNo: formData.icNo,
      bankAccountNumber: formData.bankAccountNumber,
      epfNo: formData.epfNo,
      incomeTaxNo: formData.incomeTaxNo,
      socsoNo: formData.socsoNo,
      paymentType: formData.paymentType,
      paymentPreference: formData.paymentPreference,
      race: formData.race,
      agama: formData.agama,
      maritalStatus: formData.maritalStatus,
      spouseEmploymentStatus: formData.spouseEmploymentStatus,
      numberOfChildren: formData.numberOfChildren,
      kwspNumber: formData.kwspNumber,
      department: formData.department,
    };

    // Navigate to new staff page with state
    navigate("/catalogue/staff/new", { state: { prefillData } });
  };

  // Format IC Number with hyphens
  const formatICNumber = (value: string): string => {
    // Remove all non-digits
    const digitsOnly = value.replace(/\D/g, '');
    
    // Limit to 12 digits
    const limited = digitsOnly.slice(0, 12);
    
    // Apply formatting: XXXXXX-XX-XXXX
    if (limited.length <= 6) {
      return limited;
    } else if (limited.length <= 8) {
      return `${limited.slice(0, 6)}-${limited.slice(6)}`;
    } else {
      return `${limited.slice(0, 6)}-${limited.slice(6, 8)}-${limited.slice(8)}`;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Special handling for IC Number
    if (name === 'icNo') {
      const formattedValue = formatICNumber(value);
      setFormData((prevData) => ({
        ...prevData,
        [name]: formattedValue,
      }));
    } else {
      setFormData((prevData) => ({
        ...prevData,
        [name]: value,
      }));
    }
  };

  const handleListboxChange = (name: keyof Employee, value: string) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleComboboxChange = useCallback(
    (name: "job", value: string[] | null) => {
      if (value === null) return;

      setFormData((prevData) => ({
        ...prevData,
        [name]: value,
      }));

      // Track the modification in the state
      setModifiedFields((prev) => {
        const updated = new Set(prev);
        updated.add(name);
        return updated;
      });
    },
    []
  );

  const validateForm = (): boolean => {
    const requiredFields: (keyof Employee)[] = ["name"];

    for (const field of requiredFields) {
      if (!formData[field]) {
        toast.error(
          `${field.charAt(0).toUpperCase() + field.slice(1)} is required.`
        );
        return false;
      }
    }

    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        toast.error("Please enter a valid email address or leave it empty.");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    // Convert option IDs back to display names for storage
    const dataToSend = {
      ...formData,
      // Convert option IDs back to display names for database
      nationality: mapIdToDisplayName(
        formData.nationality,
        options.nationalities
      ),
      race: mapIdToDisplayName(formData.race, options.races),
      agama: mapIdToDisplayName(formData.agama, options.agama),
      // Handle date fields
      birthdate: formData.birthdate || null,
      dateJoined: formData.dateJoined || null,
      dateResigned: formData.dateResigned || null,
    };

    try {
      if (isEditMode) {
        if (id !== formData.id) {
          // ID has changed, use PUT method with the new ID
          dataToSend.newId = formData.id;
          await api.put(`/api/staffs/${id}`, dataToSend);
        } else {
          // ID hasn't changed, use regular PUT
          await api.put(`/api/staffs/${id}`, dataToSend);
        }
      } else {
        // Create new staff member
        await api.post("/api/staffs", dataToSend);
      }

      // Refresh the cache after successful save
      await refreshStaffs();

      // Reset modified fields after successful save
      setModifiedFields(new Set());

      toast.success(
        `Staff member ${isEditMode ? "updated" : "created"} successfully!`
      );
      navigate("/catalogue/staff");
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("An unexpected error occurred.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = (
    name: keyof Employee,
    label: string,
    type: string = "text"
  ) => (
    <FormInput
      name={name}
      label={label}
      value={(formData[name] as string) ?? ""}
      onChange={handleInputChange}
      type={type}
      disabled={isEditMode && name === "id"}
    />
  );

  const renderListbox = (
    name: keyof Employee,
    label: string,
    options: SelectOption[]
  ) => {
    const currentValue = formData[name];

    return (
      <FormListbox
        key={name}
        name={name}
        label={label}
        value={currentValue as string}
        onChange={(value) => handleListboxChange(name, value)}
        options={options}
        placeholder={`Select ${label}...`}
      />
    );
  };

  const renderCombobox = (
    name: "job",
    label: string,
    options: SelectOption[],
    query: string,
    setQuery: React.Dispatch<React.SetStateAction<string>>
  ) => (
    <div>
      <FormCombobox
        name={name}
        label={label}
        value={formData[name] as string[]}
        onChange={(value) => {
          if (typeof value === "string") {
            handleComboboxChange(name, [value]);
          } else {
            handleComboboxChange(name, value);
          }
        }}
        options={options}
        query={query}
        setQuery={setQuery}
      />
      <SelectedTagsDisplay
        selectedItems={formData[name] as string[]}
        label={label}
        navigable={true}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <div className="flex-1 min-w-0">
              {/* Staff Name & ID Row */}
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                  {formData.name || "New Staff"}
                </h1>
                {formData.id && (
                  <span className="px-2.5 py-0.5 text-sm font-mono font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-full">
                    {formData.id}
                  </span>
                )}
              </div>

              {/* Staff Details Row */}
              <div className="mt-1.5 flex items-center gap-4 flex-wrap text-sm text-default-600 dark:text-gray-400">
                {/* IC Number */}
                {formData.icNo && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-default-400 dark:text-gray-500">IC:</span>
                    <span className="font-medium text-default-700 dark:text-gray-300">{formData.icNo}</span>
                  </div>
                )}

                {/* Telephone */}
                {formData.telephoneNo && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-default-400 dark:text-gray-500">Tel:</span>
                    <span className="font-medium text-default-700 dark:text-gray-300">{formData.telephoneNo}</span>
                  </div>
                )}

                {/* Jobs */}
                {formData.job && formData.job.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-default-400 dark:text-gray-500">Jobs:</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {formData.job.slice(0, 3).map((jobId) => (
                        <span
                          key={jobId}
                          className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded"
                        >
                          {jobId}
                        </span>
                      ))}
                      {formData.job.length > 3 && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-default-200 dark:bg-gray-700 text-default-600 dark:text-gray-300 rounded">
                          +{formData.job.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {isEditMode && (
              <button
                type="button"
                className="px-5 py-2 text-base font-medium rounded-full border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:border-rose-400 dark:hover:border-rose-600 active:bg-rose-200 dark:active:bg-rose-900/60 transition-colors"
                onClick={handleDeleteClick}
              >
                Delete
              </button>
            )}
            <button
              type="submit"
              form="staff-form"
              disabled={isSaving || !isFormChanged}
              className={`px-5 py-2 text-base font-medium rounded-full transition-colors ${
                isSaving || !isFormChanged
                  ? "bg-default-100 dark:bg-gray-700 text-default-400 dark:text-gray-500 cursor-not-allowed border border-default-200 dark:border-gray-600"
                  : "bg-sky-500 dark:bg-sky-600 text-white hover:bg-sky-600 dark:hover:bg-sky-500 active:bg-sky-700 dark:active:bg-sky-700 border border-sky-500 dark:border-sky-600 hover:border-sky-600 dark:hover:border-sky-500"
              }`}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <form id="staff-form" onSubmit={handleSubmit}>
          <div className="px-6 py-3">
            <Tab
              labels={["Personal", "Work", "Documents", "Additional"]}
              tabWidth="w-[104px]"
              defaultActiveTab={1}
            >
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("id", "ID")}
                  {renderInput("name", "Name")}
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("telephoneNo", "Telephone Number")}
                  {renderInput("email", "Email", "email")}
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderListbox("gender", "Gender", genderOptions)}
                  {renderListbox(
                    "nationality",
                    "Nationality",
                    options.nationalities
                  )}
                  {renderInput("birthdate", "Birthdate", "date")}
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {renderInput("address", "Address")}
                </div>

                {/* Head Staff Management Section */}
                {isEditMode && (
                  <div className="mt-4 p-4 bg-default-50 dark:bg-gray-800/50 rounded-lg border border-default-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <IconUsers size={18} className="text-default-500" />
                        <h4 className="text-sm font-medium text-default-700 dark:text-gray-200">
                          Same Name Staff Records
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSameNameStaff}
                        disabled={settingHeadStaff}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors ${
                          settingHeadStaff ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        <IconUserPlus size={16} />
                        Add New
                      </button>
                    </div>

                    {loadingSameNameStaff ? (
                      <div className="flex items-center justify-center py-4">
                        <LoadingSpinner />
                      </div>
                    ) : isUniqueName ? (
                      <p className="text-sm text-default-400 dark:text-gray-500 italic">
                        This staff has a unique name - no other records found.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {sameNameStaff.map((staff) => (
                          <div
                            key={staff.id}
                            onClick={() => handleHeadStaffChange(staff.id)}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                              settingHeadStaff
                                ? "cursor-wait opacity-60"
                                : "cursor-pointer"
                            } ${
                              staff.isHead
                                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700"
                                : "bg-white dark:bg-gray-800 border-default-200 dark:border-gray-700 hover:border-sky-300 dark:hover:border-sky-600"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Radio-style indicator */}
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                  staff.isHead
                                    ? "border-amber-500 bg-amber-500"
                                    : "border-default-300 dark:border-gray-600"
                                }`}
                              >
                                {staff.isHead && (
                                  <IconCrown size={10} className="text-white" />
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-medium text-default-800 dark:text-gray-100">
                                    {staff.id}
                                  </span>
                                  {staff.isHead && (
                                    <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                                      HEAD
                                    </span>
                                  )}
                                  {staff.id === id && (
                                    <span className="px-1.5 py-0.5 text-xs bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">
                                      Current
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-default-500 dark:text-gray-400">
                                  {staff.job.length > 0
                                    ? staff.job.join(", ")
                                    : "No job assigned"}
                                </span>
                              </div>
                            </div>

                            {/* Navigate to this staff's page */}
                            {staff.id !== id && (
                              <button
                                type="button"
                                disabled={settingHeadStaff}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!settingHeadStaff) {
                                    navigate(`/catalogue/staff/${staff.id}`);
                                  }
                                }}
                                className={`p-1.5 text-default-400 hover:text-sky-500 dark:hover:text-sky-400 ${
                                  settingHeadStaff ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                                title="View this staff"
                              >
                                <IconExternalLink size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderCombobox("job", "Job", jobs, jobQuery, setJobQuery)}
                  {renderInput("dateJoined", "Date Joined", "date")}
                </div>
                <div className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-medium text-default-800 dark:text-gray-100">
                      Associated Pay Codes
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search pay codes..."
                          value={payCodeSearchQuery}
                          onChange={(e) =>
                            setPayCodeSearchQuery(e.target.value)
                          }
                          className="px-3 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 min-w-[200px]"
                        />
                        {payCodeSearchQuery && (
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
                            onClick={() => setPayCodeSearchQuery("")}
                            title="Clear search"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPayCodeViewMode(payCodeViewMode === 'grouped' ? 'flat' : 'grouped')}
                        className={`flex items-center gap-1.5 px-3 py-1 border rounded-full text-sm font-medium transition-colors ${
                          payCodeViewMode === 'grouped'
                            ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50'
                            : 'bg-default-50 dark:bg-gray-900/50 border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700'
                        }`}
                        title={payCodeViewMode === 'grouped' ? 'Switch to flat view' : 'Switch to grouped view'}
                      >
                        {payCodeViewMode === 'grouped' ? (
                          <>
                            <IconLayoutGrid size={16} />
                            Grouped
                          </>
                        ) : (
                          <>
                            <IconLayoutList size={16} />
                            Flat
                          </>
                        )}
                      </button>
                      {payCodeViewMode === 'grouped' && (
                        <button
                          type="button"
                          onClick={areAllGroupsCollapsed ? expandAllGroups : collapseAllGroups}
                          className="flex items-center gap-1.5 px-3 py-1 border border-default-300 dark:border-gray-600 rounded-full text-sm font-medium text-default-700 dark:text-gray-200 bg-default-50 dark:bg-gray-900/50 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors"
                          title={areAllGroupsCollapsed ? 'Expand all groups' : 'Collapse all groups'}
                        >
                          {areAllGroupsCollapsed ? (
                            <>
                              <IconChevronsDown size={16} />
                              Expand All
                            </>
                          ) : (
                            <>
                              <IconChevronsUp size={16} />
                              Collapse All
                            </>
                          )}
                        </button>
                      )}
                      <RefreshPayCodeCacheButton
                        onRefresh={refreshPayCodeMappings}
                        size="sm"
                      />
                      {isEditMode && (
                        <Button
                          type="button"
                          onClick={() => setShowPayCodeModal(true)}
                          variant="outline"
                          size="sm"
                          icon={IconLink}
                        >
                          Manage Employee Pay Codes
                        </Button>
                      )}
                    </div>
                  </div>

                  {loading || loadingPayCodes ? (
                    <div className="flex justify-center py-4">
                      <LoadingSpinner size="sm" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Employee-specific Pay Codes Section */}
                      <div>
                        <h4 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                          Employee-Specific Pay Codes
                        </h4>
                        {id && employeeMappings[id] && employeeMappings[id].length > 0 ? (
                          payCodeViewMode === 'grouped' ? (
                            <div className="space-y-2">
                              {(() => {
                                const grouped = groupPayCodesByType(employeeMappings[id]);
                                return (['Base', 'Tambahan', 'Overtime'] as PayType[]).map((payType) =>
                                  renderPayTypeGroup(
                                    'employee',
                                    payType,
                                    grouped[payType],
                                    (payCode) => {
                                      setSelectedPayCodeForEdit(payCode as EmployeePayCodeDetails);
                                      setShowEditRateModal(true);
                                    },
                                    undefined,
                                    (payCodes, value) => showBatchConfirmDialog('employee', payType, payCodes, value),
                                    batchDefaultLoading === `employee-${payType}`
                                  )
                                );
                              })()}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {employeeMappings[id]
                                .filter(
                                  (payCode) =>
                                    !payCodeSearchQuery ||
                                    payCode.id.toLowerCase().includes(payCodeSearchQuery.toLowerCase()) ||
                                    payCode.description.toLowerCase().includes(payCodeSearchQuery.toLowerCase())
                                )
                                .map((payCode) =>
                                  renderPayCodeCard(
                                    payCode,
                                    payTypeColors[payCode.pay_type || 'Base'],
                                    () => {
                                      setSelectedPayCodeForEdit(payCode);
                                      setShowEditRateModal(true);
                                    },
                                    { showPayType: true }
                                  )
                                )}
                            </div>
                          )
                        ) : (
                          <div className="text-sm text-default-500 dark:text-gray-400 py-4">
                            No employee-specific pay codes
                          </div>
                        )}
                      </div>

                      {/* Job-linked Pay Codes Section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-default-700 dark:text-gray-200">
                            Job-Linked Pay Codes
                          </h4>
                          {isEditMode && formData.job && formData.job.length === 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              icon={IconSettings2}
                              onClick={() => {
                                const job = jobs.find((j) => j.id === formData.job[0]);
                                if (job) {
                                  setSelectedJobForBatchManage(job);
                                  setShowBatchManageJobPayCodesModal(true);
                                }
                              }}
                            >
                              Batch Manage
                            </Button>
                          )}
                          {isEditMode && formData.job && formData.job.length > 1 && (
                            <Menu as="div" className="relative">
                              <MenuButton
                                as={Button}
                                type="button"
                                variant="outline"
                                size="sm"
                                icon={IconSettings2}
                              >
                                Batch Manage
                              </MenuButton>
                              <MenuItems className="absolute right-0 mt-1 w-56 origin-top-right rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none z-10">
                                <div className="p-1">
                                  <div className="px-3 py-1.5 text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                                    Select Job
                                  </div>
                                  {formData.job.map((jobId) => {
                                    const jobData = jobs.find((j) => j.id === jobId);
                                    return (
                                      <MenuItem key={jobId}>
                                        {({ focus }) => (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const job = jobs.find((j) => j.id === jobId);
                                              if (job) {
                                                setSelectedJobForBatchManage(job);
                                                setShowBatchManageJobPayCodesModal(true);
                                              }
                                            }}
                                            className={`${
                                              focus ? "bg-sky-50 dark:bg-sky-900/30" : ""
                                            } group flex w-full items-center rounded-md px-3 py-2 text-sm text-default-800 dark:text-gray-100`}
                                          >
                                            {jobData?.name || jobId}
                                          </button>
                                        )}
                                      </MenuItem>
                                    );
                                  })}
                                </div>
                              </MenuItems>
                            </Menu>
                          )}
                        </div>
                        {(() => {
                          const { jobPayCodes } = getAllPayCodesForEmployee();
                          return jobPayCodes.length > 0 ? (
                            payCodeViewMode === 'grouped' ? (
                              <div className="space-y-2">
                                {(() => {
                                  const grouped = groupPayCodesByType(jobPayCodes);
                                  return (['Base', 'Tambahan', 'Overtime'] as PayType[]).map((payType) =>
                                    renderPayTypeGroup(
                                      'job',
                                      payType,
                                      grouped[payType],
                                      (payCode) => {
                                        setSelectedJobPayCodeForEdit(payCode as JobPayCodeDetails);
                                        setShowJobPayCodeEditModal(true);
                                      },
                                      undefined,
                                      (payCodes, value) => showBatchConfirmDialog('job', payType, payCodes, value),
                                      batchDefaultLoading === `job-${payType}`
                                    )
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {jobPayCodes
                                  .filter(
                                    (payCode) =>
                                      !payCodeSearchQuery ||
                                      payCode.id.toLowerCase().includes(payCodeSearchQuery.toLowerCase()) ||
                                      payCode.description.toLowerCase().includes(payCodeSearchQuery.toLowerCase())
                                  )
                                  .map((payCode) =>
                                    renderPayCodeCard(
                                      payCode,
                                      payTypeColors[payCode.pay_type || 'Base'],
                                      () => {
                                        setSelectedJobPayCodeForEdit(payCode as JobPayCodeDetails);
                                        setShowJobPayCodeEditModal(true);
                                      },
                                      { showPayType: true }
                                    )
                                  )}
                              </div>
                            )
                          ) : (
                            <div className="text-sm text-default-500 dark:text-gray-400 py-4">
                              No job-linked pay codes
                            </div>
                          );
                        })()}
                      </div>

                      {/* Shared Pay Codes Section (duplicates) */}
                      <div>
                        <h4 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                          Shared Pay Codes (Across Multiple Jobs)
                        </h4>
                        {(() => {
                          const { duplicatePayCodes } = getAllPayCodesForEmployee();
                          return duplicatePayCodes.length > 0 ? (
                            payCodeViewMode === 'grouped' ? (
                              <div className="space-y-2">
                                {(() => {
                                  const grouped = groupPayCodesByType(duplicatePayCodes);
                                  return (['Base', 'Tambahan', 'Overtime'] as PayType[]).map((payType) =>
                                    renderPayTypeGroup(
                                      'shared',
                                      payType,
                                      grouped[payType],
                                      (payCode) => {
                                        setSelectedJobPayCodeForEdit(payCode as JobPayCodeDetails);
                                        setShowJobPayCodeEditModal(true);
                                      },
                                      true, // showJobName for shared paycodes
                                      (payCodes, value) => showBatchConfirmDialog('shared', payType, payCodes, value),
                                      batchDefaultLoading === `shared-${payType}`
                                    )
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {duplicatePayCodes
                                  .filter(
                                    (payCode) =>
                                      !payCodeSearchQuery ||
                                      payCode.id.toLowerCase().includes(payCodeSearchQuery.toLowerCase()) ||
                                      payCode.description.toLowerCase().includes(payCodeSearchQuery.toLowerCase())
                                  )
                                  .map((payCode) => {
                                    const jobName = jobs.find((j) => j.id === payCode.job_id)?.name || payCode.job_id;
                                    return renderPayCodeCard(
                                      payCode,
                                      payTypeColors[payCode.pay_type || 'Base'],
                                      () => {
                                        setSelectedJobPayCodeForEdit(payCode as JobPayCodeDetails);
                                        setShowJobPayCodeEditModal(true);
                                      },
                                      { showJobName: true, jobName, showPayType: true }
                                    );
                                  })}
                              </div>
                            )
                          ) : (
                            <div className="text-sm text-default-500 dark:text-gray-400 py-4">
                              No shared pay codes across multiple jobs
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("icNo", "IC Number")}
                  {renderInput("bankAccountNumber", "Bank Account Number")}
                  {renderInput("epfNo", "EPF Number")}
                  {renderInput("incomeTaxNo", "Income Tax Number")}
                  {renderInput("socsoNo", "SOCSO Number")}
                  {renderListbox("document", "Document", documentOptions)}
                  {renderListbox("department", "Department", departmentOptions)}
                  {renderInput("kwspNumber", "KWSP Number")}
                </div>
                <div className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6">
                  <h3 className="text-base font-medium text-default-800 dark:text-gray-100 mb-4">
                    Income Tax Information
                  </h3>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                    {renderListbox(
                      "maritalStatus",
                      "Marital Status",
                      maritalStatusOptions
                    )}
                    {formData.maritalStatus === "Married" &&
                      renderListbox(
                        "spouseEmploymentStatus",
                        "Spouse Employment Status",
                        spouseEmploymentOptions
                      )}
                    {renderInput(
                      "numberOfChildren",
                      "Number of Children",
                      "number"
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderListbox(
                    "paymentType",
                    "Payment Type",
                    paymentTypeOptions
                  )}
                  {renderListbox(
                    "paymentPreference",
                    "Payment Preference",
                    paymentPreferenceOptions
                  )}
                  {renderListbox("race", "Race", options.races)}
                  {renderListbox("agama", "Agama", options.agama)}
                  {renderInput("dateResigned", "Date Resigned", "date")}
                </div>
              </div>
            </Tab>
          </div>
        </form>
      </div>
      {isEditMode && formData.id && (
        <BatchManageEmployeePayCodesModal
          isOpen={showPayCodeModal}
          onClose={() => setShowPayCodeModal(false)}
          employee={formData}
          availablePayCodes={availablePayCodes}
          currentPayCodeDetails={employeeMappings[formData.id] || []}
          onAssociationComplete={async () => {
            await refreshPayCodeMappings();
            await refreshStaffs();
          }}
        />
      )}
      {/* Edit Employee Pay Code Rates Modal */}
      {isEditMode && formData.id && (
        <EditEmployeePayCodeRatesModal
          isOpen={showEditRateModal}
          onClose={() => setShowEditRateModal(false)}
          employeeId={formData.id}
          payCodeDetail={selectedPayCodeForEdit}
          onRatesSaved={async () => {
            await refreshPayCodeMappings();
            await refreshStaffs();
          }}
        />
      )}
      {/* Edit Job Pay Code Rates Modal */}
      {isEditMode && formData.id && selectedJobPayCodeForEdit && (
        <EditPayCodeRatesModal
          isOpen={showJobPayCodeEditModal}
          onClose={() => setShowJobPayCodeEditModal(false)}
          jobId={selectedJobPayCodeForEdit.job_id}
          jobName={
            jobs.find((j) => j.id === selectedJobPayCodeForEdit.job_id)?.name
          }
          payCodeDetail={selectedJobPayCodeForEdit}
          onRatesSaved={async () => {
            await refreshPayCodeMappings();
            await refreshStaffs();
          }}
        />
      )}
      {/* Batch Manage Job Pay Codes Modal */}
      {isEditMode && selectedJobForBatchManage && (
        <BatchManageJobPayCodesModal
          isOpen={showBatchManageJobPayCodesModal}
          onClose={() => {
            setShowBatchManageJobPayCodesModal(false);
            setSelectedJobForBatchManage(null);
          }}
          job={selectedJobForBatchManage}
          allPayCodes={availablePayCodes}
          currentPayCodeDetails={jobPayCodeDetails[selectedJobForBatchManage.id] || []}
          onComplete={async () => {
            await refreshPayCodeMappings();
            await refreshStaffs();
          }}
        />
      )}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Staff"
        message={`Are you sure you want to remove ${formData.name} from the staff list? This action cannot be undone.`}
        confirmButtonText="Delete"
      />
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to go back? All unsaved changes will be lost."
        confirmButtonText="Confirm"
      />
      {/* Batch Default Confirmation Dialog */}
      {batchConfirmDialog && (
        <ConfirmationDialog
          isOpen={batchConfirmDialog.isOpen}
          onClose={() => setBatchConfirmDialog(null)}
          onConfirm={() => {
            batchConfirmDialog.onConfirm();
            setBatchConfirmDialog(null);
          }}
          title={batchConfirmDialog.action === "set" ? "Set All as Default" : "Clear All Defaults"}
          message={`Are you sure you want to ${
            batchConfirmDialog.action === "set" ? "set" : "clear"
          } default for all ${batchConfirmDialog.payCodes.length} ${batchConfirmDialog.payType} pay codes?`}
          confirmButtonText={batchConfirmDialog.action === "set" ? "Set Default" : "Clear Default"}
          variant={batchConfirmDialog.action === "set" ? "success" : "default"}
        />
      )}
    </div>
  );
};

export default StaffFormPage;

// src/components/Catalogue/StaffPayCodesSection.tsx
// Editable "Associated Pay Codes" section for a single staff member. Extracted
// from StaffFormPage so it can be reused by both the editable form and the
// read-only StaffDetailsPage. All pay-code edits happen through the modals +
// refreshPayCodeMappings() (immediate API calls), independent of any host form.
import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../LoadingSpinner";
import Button from "../Button";
import ConfirmationDialog from "../ConfirmationDialog";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  EmployeePayCodeDetails,
  useJobPayCodeMappings,
} from "../../utils/catalogue/useJobPayCodeMappings";
import BatchManageEmployeePayCodesModal from "./BatchManageEmployeePayCodesModal";
import EditEmployeePayCodeRatesModal from "./EditEmployeePayCodeRatesModal";
import EditPayCodeRatesModal from "./EditPayCodeRatesModal";
import BatchManageJobPayCodesModal from "./BatchManageJobPayCodesModal";
import RefreshPayCodeCacheButton from "./RefreshPayCodeCacheButton";
import {
  IconLink,
  IconChevronDown,
  IconChevronRight,
  IconLayoutList,
  IconLayoutGrid,
  IconChevronsDown,
  IconChevronsUp,
  IconSettings2,
} from "@tabler/icons-react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  Employee,
  JobPayCodeDetails,
  PayType,
  Job,
} from "../../types/types";

type PayCodeViewMode = "grouped" | "flat";

interface StaffPayCodesSectionProps {
  employee: Employee;
}

const StaffPayCodesSection: React.FC<StaffPayCodesSectionProps> = ({
  employee,
}) => {
  const id = employee.id;
  const { jobs } = useJobsCache();
  const { refreshStaffs } = useStaffsCache();
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
  const [payCodeViewMode, setPayCodeViewMode] =
    useState<PayCodeViewMode>("grouped");
  // Initialize with all groups collapsed except employee-Base
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set([
      "employee-Tambahan",
      "employee-Overtime",
      "job-Base",
      "job-Tambahan",
      "job-Overtime",
      "shared-Base",
      "shared-Tambahan",
      "shared-Overtime",
    ])
  );
  const [batchDefaultLoading, setBatchDefaultLoading] = useState<string | null>(
    null
  );
  const [batchConfirmDialog, setBatchConfirmDialog] = useState<{
    isOpen: boolean;
    action: "set" | "clear";
    payType: string;
    sectionKey: string;
    payCodes: (EmployeePayCodeDetails | JobPayCodeDetails)[];
    onConfirm: () => void;
  } | null>(null);

  // Batch manage job pay codes state
  const [showBatchManageJobPayCodesModal, setShowBatchManageJobPayCodesModal] =
    useState(false);
  const [selectedJobForBatchManage, setSelectedJobForBatchManage] =
    useState<Job | null>(null);

  const getAllPayCodesForEmployee = useCallback(() => {
    if (!id)
      return { employeePayCodes: [], jobPayCodes: [], duplicatePayCodes: [] };

    // Get employee-specific pay codes
    const employeePayCodes = employeeMappings[id] || [];

    // Get job-linked pay codes
    const employeeJobs = employee.job || [];

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
  }, [id, employeeMappings, jobPayCodeDetails, employee.job]);

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
    ["employee", "job", "shared"].forEach((section) => {
      ["Base", "Tambahan", "Overtime"].forEach((payType) => {
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
          `Successfully ${value ? "set" : "cleared"} default for ${
            payCodes.length
          } pay code(s)`
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
    async (
      payCodes: (EmployeePayCodeDetails | JobPayCodeDetails)[],
      value: boolean
    ) => {
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
          `Successfully ${value ? "set" : "cleared"} default for ${
            items.length
          } pay code(s)`
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
            executeBatchEmployeeDefault(
              payCodes as EmployeePayCodeDetails[],
              value
            );
          } else {
            executeBatchJobDefault(payCodes, value);
          }
        },
      });
    },
    [executeBatchEmployeeDefault, executeBatchJobDefault]
  );

  // Show "Expand All" whenever any group is collapsed; only show "Collapse All" when everything is expanded
  const areAllGroupsCollapsed = collapsedGroups.size > 0;

  // Color scheme for each pay type
  const payTypeColors: Record<
    PayType,
    { bg: string; border: string; headerBg: string; headerText: string }
  > = {
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
    colorScheme: {
      bg: string;
      border: string;
      headerBg: string;
      headerText: string;
    },
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
        key={`${payCode.id}-${payCode.job_id || "employee"}`}
        className={`flex items-center justify-between px-3 py-2 ${colorScheme.bg} border ${colorScheme.border} rounded-md cursor-pointer hover:opacity-80`}
        onClick={() => {
          onClick();
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
                  <span className={overrideAccentColor} title="Override rate">
                    {" "}
                    *
                  </span>
                )}
              </span>
              <span>
                Ahad: RM
                {payCode.override_rate_ahad !== null
                  ? payCode.override_rate_ahad.toFixed(2)
                  : (payCode.rate_ahad ?? 0).toFixed(2)}
                {payCode.override_rate_ahad !== null && (
                  <span className={overrideAccentColor} title="Override rate">
                    {" "}
                    *
                  </span>
                )}
              </span>
              <span>
                Umum: RM
                {payCode.override_rate_umum !== null
                  ? payCode.override_rate_umum.toFixed(2)
                  : (payCode.rate_umum ?? 0).toFixed(2)}
                {payCode.override_rate_umum !== null && (
                  <span className={overrideAccentColor} title="Override rate">
                    {" "}
                    *
                  </span>
                )}
              </span>
            </div>
            <div className="mt-2 flex gap-1 flex-wrap text-xs">
              {showPayType && (
                <span
                  className={`px-2 py-0.5 ${colorScheme.headerBg} ${colorScheme.headerText} rounded-full font-medium`}
                >
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
    onBatchSetDefault?: (
      payCodes: (EmployeePayCodeDetails | JobPayCodeDetails)[],
      value: boolean
    ) => void,
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
        payCode.description
          .toLowerCase()
          .includes(payCodeSearchQuery.toLowerCase())
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
            <span className="text-xs opacity-75">
              ({filteredPayCodes.length})
            </span>
          </button>

          {/* Right: Batch buttons */}
          {onBatchSetDefault && (
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
              const jobName =
                showJobName && "job_id" in payCode
                  ? jobs.find((j) => j.id === payCode.job_id)?.name ||
                    payCode.job_id
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

  return (
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
              onChange={(e) => setPayCodeSearchQuery(e.target.value)}
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
            onClick={() =>
              setPayCodeViewMode(
                payCodeViewMode === "grouped" ? "flat" : "grouped"
              )
            }
            className={`flex items-center gap-1.5 px-3 py-1 border rounded-full text-sm font-medium transition-colors ${
              payCodeViewMode === "grouped"
                ? "bg-sky-50 dark:bg-sky-900/30 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50"
                : "bg-default-50 dark:bg-gray-900/50 border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
            }`}
            title={
              payCodeViewMode === "grouped"
                ? "Switch to flat view"
                : "Switch to grouped view"
            }
          >
            {payCodeViewMode === "grouped" ? (
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
          {payCodeViewMode === "grouped" && (
            <button
              type="button"
              onClick={areAllGroupsCollapsed ? expandAllGroups : collapseAllGroups}
              className="flex items-center gap-1.5 px-3 py-1 border border-default-300 dark:border-gray-600 rounded-full text-sm font-medium text-default-700 dark:text-gray-200 bg-default-50 dark:bg-gray-900/50 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors"
              title={
                areAllGroupsCollapsed ? "Expand all groups" : "Collapse all groups"
              }
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
          <Button
            type="button"
            onClick={() => setShowPayCodeModal(true)}
            variant="outline"
            size="sm"
            icon={IconLink}
          >
            Manage Employee Pay Codes
          </Button>
        </div>
      </div>

      {loadingPayCodes ? (
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
              payCodeViewMode === "grouped" ? (
                <div className="space-y-2">
                  {(() => {
                    const grouped = groupPayCodesByType(employeeMappings[id]);
                    return (["Base", "Tambahan", "Overtime"] as PayType[]).map(
                      (payType) =>
                        renderPayTypeGroup(
                          "employee",
                          payType,
                          grouped[payType],
                          (payCode) => {
                            setSelectedPayCodeForEdit(
                              payCode as EmployeePayCodeDetails
                            );
                            setShowEditRateModal(true);
                          },
                          undefined,
                          (payCodes, value) =>
                            showBatchConfirmDialog(
                              "employee",
                              payType,
                              payCodes,
                              value
                            ),
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
                        payCode.id
                          .toLowerCase()
                          .includes(payCodeSearchQuery.toLowerCase()) ||
                        payCode.description
                          .toLowerCase()
                          .includes(payCodeSearchQuery.toLowerCase())
                    )
                    .map((payCode) =>
                      renderPayCodeCard(
                        payCode,
                        payTypeColors[payCode.pay_type || "Base"],
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
              {employee.job && employee.job.length === 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={IconSettings2}
                  onClick={() => {
                    const job = jobs.find((j) => j.id === employee.job[0]);
                    if (job) {
                      setSelectedJobForBatchManage(job);
                      setShowBatchManageJobPayCodesModal(true);
                    }
                  }}
                >
                  Batch Manage
                </Button>
              )}
              {employee.job && employee.job.length > 1 && (
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
                      {employee.job.map((jobId) => {
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
                payCodeViewMode === "grouped" ? (
                  <div className="space-y-2">
                    {(() => {
                      const grouped = groupPayCodesByType(jobPayCodes);
                      return (["Base", "Tambahan", "Overtime"] as PayType[]).map(
                        (payType) =>
                          renderPayTypeGroup(
                            "job",
                            payType,
                            grouped[payType],
                            (payCode) => {
                              setSelectedJobPayCodeForEdit(
                                payCode as JobPayCodeDetails
                              );
                              setShowJobPayCodeEditModal(true);
                            },
                            undefined,
                            (payCodes, value) =>
                              showBatchConfirmDialog(
                                "job",
                                payType,
                                payCodes,
                                value
                              ),
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
                          payCode.id
                            .toLowerCase()
                            .includes(payCodeSearchQuery.toLowerCase()) ||
                          payCode.description
                            .toLowerCase()
                            .includes(payCodeSearchQuery.toLowerCase())
                      )
                      .map((payCode) =>
                        renderPayCodeCard(
                          payCode,
                          payTypeColors[payCode.pay_type || "Base"],
                          () => {
                            setSelectedJobPayCodeForEdit(
                              payCode as JobPayCodeDetails
                            );
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
                payCodeViewMode === "grouped" ? (
                  <div className="space-y-2">
                    {(() => {
                      const grouped = groupPayCodesByType(duplicatePayCodes);
                      return (["Base", "Tambahan", "Overtime"] as PayType[]).map(
                        (payType) =>
                          renderPayTypeGroup(
                            "shared",
                            payType,
                            grouped[payType],
                            (payCode) => {
                              setSelectedJobPayCodeForEdit(
                                payCode as JobPayCodeDetails
                              );
                              setShowJobPayCodeEditModal(true);
                            },
                            true, // showJobName for shared paycodes
                            (payCodes, value) =>
                              showBatchConfirmDialog(
                                "shared",
                                payType,
                                payCodes,
                                value
                              ),
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
                          payCode.id
                            .toLowerCase()
                            .includes(payCodeSearchQuery.toLowerCase()) ||
                          payCode.description
                            .toLowerCase()
                            .includes(payCodeSearchQuery.toLowerCase())
                      )
                      .map((payCode) => {
                        const jobName =
                          jobs.find((j) => j.id === payCode.job_id)?.name ||
                          payCode.job_id;
                        return renderPayCodeCard(
                          payCode,
                          payTypeColors[payCode.pay_type || "Base"],
                          () => {
                            setSelectedJobPayCodeForEdit(
                              payCode as JobPayCodeDetails
                            );
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

      {/* Manage Employee Pay Codes Modal */}
      {employee.id && (
        <BatchManageEmployeePayCodesModal
          isOpen={showPayCodeModal}
          onClose={() => setShowPayCodeModal(false)}
          employee={employee}
          availablePayCodes={availablePayCodes}
          currentPayCodeDetails={employeeMappings[employee.id] || []}
          onAssociationComplete={async () => {
            await refreshPayCodeMappings();
            await refreshStaffs();
          }}
        />
      )}
      {/* Edit Employee Pay Code Rates Modal */}
      {employee.id && (
        <EditEmployeePayCodeRatesModal
          isOpen={showEditRateModal}
          onClose={() => setShowEditRateModal(false)}
          employeeId={employee.id}
          payCodeDetail={selectedPayCodeForEdit}
          onRatesSaved={async () => {
            await refreshPayCodeMappings();
            await refreshStaffs();
          }}
        />
      )}
      {/* Edit Job Pay Code Rates Modal */}
      {employee.id && selectedJobPayCodeForEdit && (
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
      {selectedJobForBatchManage && (
        <BatchManageJobPayCodesModal
          isOpen={showBatchManageJobPayCodesModal}
          onClose={() => {
            setShowBatchManageJobPayCodesModal(false);
            setSelectedJobForBatchManage(null);
          }}
          job={selectedJobForBatchManage}
          allPayCodes={availablePayCodes}
          currentPayCodeDetails={
            jobPayCodeDetails[selectedJobForBatchManage.id] || []
          }
          onComplete={async () => {
            await refreshPayCodeMappings();
            await refreshStaffs();
          }}
        />
      )}
      {/* Batch Default Confirmation Dialog */}
      {batchConfirmDialog && (
        <ConfirmationDialog
          isOpen={batchConfirmDialog.isOpen}
          onClose={() => setBatchConfirmDialog(null)}
          onConfirm={() => {
            batchConfirmDialog.onConfirm();
            setBatchConfirmDialog(null);
          }}
          title={
            batchConfirmDialog.action === "set"
              ? "Set All as Default"
              : "Clear All Defaults"
          }
          message={`Are you sure you want to ${
            batchConfirmDialog.action === "set" ? "set" : "clear"
          } default for all ${batchConfirmDialog.payCodes.length} ${
            batchConfirmDialog.payType
          } pay codes?`}
          confirmButtonText={
            batchConfirmDialog.action === "set" ? "Set Default" : "Clear Default"
          }
          variant={batchConfirmDialog.action === "set" ? "success" : "default"}
        />
      )}
    </div>
  );
};

export default StaffPayCodesSection;

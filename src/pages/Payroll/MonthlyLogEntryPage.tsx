// src/pages/Payroll/MonthlyLogEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import { format } from "date-fns";
import LoadingSpinner from "../../components/LoadingSpinner";
import Checkbox from "../../components/Checkbox";
import toast from "react-hot-toast";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { api } from "../../routes/utils/api";
import { useHolidayCache } from "../../utils/payroll/useHolidayCache";
import { getJobConfig, getJobIds, getContextLinkedPayCodes } from "../../configs/payrollJobConfigs";
import StyledListbox from "../../components/StyledListbox";
import { Link } from "react-router-dom";
import ManageActivitiesModal, { ActivityItem } from "../../components/Payroll/ManageActivitiesModal";
import ActivitiesTooltip from "../../components/Payroll/ActivitiesTooltip";
import {
  calculateActivityAmount,
} from "../../utils/payroll/calculateActivityAmount";
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
  selected: boolean;
}

interface LeaveEntry {
  id?: number;
  employeeId: string;
  employeeName: string;
  leaveDate: string;
  leaveType: "cuti_sakit" | "cuti_tahunan" | "cuti_umum";
  isNew: boolean; // true = to be created, false = existing from DB
}

const MonthlyLogEntryPage: React.FC<MonthlyLogEntryPageProps> = ({
  mode = "create",
  existingWorkLog,
  onCancel,
  jobType = "MAINTENANCE",
}) => {
  const navigate = useNavigate();
  const { staffs: allStaffs, loading: loadingStaffs } = useStaffsCache();
  const { isHoliday, getHolidayDescription } = useHolidayCache();
  const {
    detailedMappings: jobPayCodeDetails,
    employeeMappings,
    loading: loadingPayCodeMappings,
  } = useJobPayCodeMappings();
  const jobConfig = getJobConfig(jobType);
  const JOB_IDS = getJobIds(jobType);
  const contextLinkedPayCodes = jobConfig
    ? getContextLinkedPayCodes(jobConfig)
    : {};

  // Form state
  const currentDate = new Date();
  const [formData, setFormData] = useState({
    logMonth: mode === "edit" && existingWorkLog ? existingWorkLog.log_month : currentDate.getMonth() + 1,
    logYear: mode === "edit" && existingWorkLog ? existingWorkLog.log_year : currentDate.getFullYear(),
  });

  // Employee state
  const [employeeEntries, setEmployeeEntries] = useState<Record<string, EmployeeEntry>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Activities state
  const [showActivitiesModal, setShowActivitiesModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeEntry | null>(null);
  const [employeeActivities, setEmployeeActivities] = useState<Record<string, ActivityItem[]>>({});

  // Leave state
  const [existingLeaveRecords, setExistingLeaveRecords] = useState<LeaveEntry[]>([]);
  const [newLeaveEntries, setNewLeaveEntries] = useState<LeaveEntry[]>([]);
  const [deletedLeaveIds, setDeletedLeaveIds] = useState<number[]>([]);
  const [showAddLeaveModal, setShowAddLeaveModal] = useState(false);
  const [leaveFormData, setLeaveFormData] = useState({
    employeeId: "",
    leaveDate: format(new Date(), "yyyy-MM-dd"),
    leaveType: "cuti_sakit" as "cuti_sakit" | "cuti_tahunan" | "cuti_umum",
  });

  // Public holiday bulk add state
  const [showBulkHolidayModal, setShowBulkHolidayModal] = useState(false);
  const [pendingHolidayLeave, setPendingHolidayLeave] = useState<{
    leaveDate: string;
    leaveType: "cuti_umum";
    firstEmployeeId: string;
    firstEmployeeName: string;
  } | null>(null);
  const [bulkHolidaySelections, setBulkHolidaySelections] = useState<Record<string, boolean>>({});

  // Month/Year options
  const monthOptions = useMemo(() => [
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
  ], []);

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentDate.getFullYear() + 1; y >= currentDate.getFullYear() - 5; y--) {
      years.push({ id: y, name: y.toString() });
    }
    return years;
  }, []);

  // Filter employees by job type
  const eligibleEmployees = useMemo(() => {
    if (!allStaffs || loadingStaffs) return [];
    return allStaffs.filter((staff: Employee) => {
      const employeeJobs = staff.job || [];
      return employeeJobs.some((job: string) => JOB_IDS.includes(job));
    });
  }, [allStaffs, loadingStaffs, JOB_IDS]);

  // Initialize employee entries
  useEffect(() => {
    if (loadingStaffs || eligibleEmployees.length === 0) return;

    if (mode === "edit" && existingWorkLog?.employeeEntries) {
      // Populate from existing data
      const entries: Record<string, EmployeeEntry> = {};
      existingWorkLog.employeeEntries.forEach((entry: any) => {
        entries[entry.employee_id] = {
          employeeId: entry.employee_id,
          employeeName: entry.employee_name,
          jobType: entry.job_id,
          jobName: entry.job_name,
          totalHours: entry.total_hours,
          overtimeHours: entry.overtime_hours || 0,
          selected: true,
        };
      });
      setEmployeeEntries(entries);
    } else {
      // Initialize with all eligible employees (selected by default)
      const entries: Record<string, EmployeeEntry> = {};
      eligibleEmployees.forEach((emp: Employee) => {
        const empJobs = emp.job || [];
        const matchingJob = empJobs.find((job: string) => JOB_IDS.includes(job));
        entries[emp.id] = {
          employeeId: emp.id,
          employeeName: emp.name,
          jobType: matchingJob || JOB_IDS[0],
          jobName: matchingJob || JOB_IDS[0],
          totalHours: jobConfig?.defaultHours || 176,
          overtimeHours: 0,
          selected: true,
        };
      });
      setEmployeeEntries(entries);
    }
  }, [eligibleEmployees, loadingStaffs, mode, existingWorkLog, JOB_IDS, jobConfig]);

  // Fetch and apply activities for selected employees
  const fetchAndApplyActivities = useCallback(
    (currentActivities: Record<string, ActivityItem[]>) => {
      if (loadingPayCodeMappings) return;

      const selectedEntries = Object.values(employeeEntries).filter((e) => e.selected);
      if (selectedEntries.length === 0) return;

      const newEmployeeActivities: Record<string, ActivityItem[]> = {};

      selectedEntries.forEach((entry) => {
        const { employeeId, jobType: entryJobType, totalHours, overtimeHours } = entry;

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

        // Convert map back to array
        const mergedPayCodes = Array.from(allPayCodes.values());

        // Get existing activities for this employee if in edit mode
        const existingActivitiesForEmployee = currentActivities[employeeId] || [];

        // Filter out overtime codes if no overtime hours entered
        const hasOvertimeHours = overtimeHours > 0;
        const filteredPayCodes = hasOvertimeHours
          ? mergedPayCodes
          : mergedPayCodes.filter((pc: any) => pc.pay_type !== "Overtime");

        // Convert to activity format
        const activities: ActivityItem[] = filteredPayCodes.map((payCode: any) => {
          const isContextLinked = !!contextLinkedPayCodes[payCode.id];

          // Find existing activity for this pay code if in edit mode
          const existingActivity =
            mode === "edit"
              ? existingActivitiesForEmployee.find((ea) => ea.payCodeId === payCode.id)
              : null;

          // Use Biasa rate for monthly (default rate)
          const rate = payCode.override_rate_biasa || payCode.rate_biasa;

          // Determine if selected based on specific rules
          let isSelected = false;

          if (mode === "edit" && existingActivity) {
            isSelected = existingActivity.isSelected;
          } else {
            // Apply selection rules for new activities
            if (payCode.pay_type === "Tambahan") {
              isSelected = false;
            } else if (payCode.pay_type === "Overtime") {
              isSelected = hasOvertimeHours;
            } else if (payCode.pay_type === "Base") {
              isSelected = payCode.is_default_setting;
            } else {
              isSelected = payCode.is_default_setting;
            }

            // Special rules for specific rate units
            if (
              isContextLinked ||
              payCode.rate_unit === "Bag" ||
              payCode.rate_unit === "Trip" ||
              payCode.rate_unit === "Day"
            ) {
              isSelected = false;
            }
          }

          // Determine units produced
          const unitsProduced = existingActivity
            ? existingActivity.unitsProduced
            : payCode.requires_units_input
            ? 0
            : undefined;

          // For overtime activities, use overtime hours; otherwise use total hours
          const hoursToApply = payCode.pay_type === "Overtime" ? overtimeHours : totalHours;

          return {
            payCodeId: payCode.id,
            description: payCode.description,
            payType: payCode.pay_type,
            rateUnit: payCode.rate_unit,
            rate: rate,
            isDefault: payCode.is_default_setting,
            isSelected: isSelected,
            unitsProduced: unitsProduced,
            hoursApplied: hoursToApply,
            isContextLinked: isContextLinked,
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
              {}
            ),
          };
        });

        // Apply calculation logic to all activities with proper hours for each activity type
        const processedActivities = activities.map(activity => ({
          ...activity,
          calculatedAmount: calculateActivityAmount(
            activity,
            activity.hoursApplied || totalHours,
            {}
          )
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
    ]
  );

  // Effect to fetch activities when employee selection changes
  useEffect(() => {
    if (!loadingPayCodeMappings && Object.keys(employeeEntries).length > 0) {
      fetchAndApplyActivities(employeeActivities);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeEntries, loadingPayCodeMappings, jobPayCodeDetails, employeeMappings, mode]);

  // Restore activities from existing work log in edit mode
  useEffect(() => {
    if (mode === "edit" && existingWorkLog?.employeeEntries) {
      const restoredActivities: Record<string, ActivityItem[]> = {};

      existingWorkLog.employeeEntries.forEach((entry: any) => {
        if (entry.activities && entry.activities.length > 0) {
          restoredActivities[entry.employee_id] = entry.activities.map(
            (activity: any) => ({
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
            })
          );
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
          `/api/monthly-work-logs/leave/${formData.logYear}/${formData.logMonth}?section=${section}`
        );

        const leaveRecords = response.map((record: any) => ({
          id: record.id,
          employeeId: record.employee_id,
          employeeName: record.employee_name,
          leaveDate: record.leave_date.split("T")[0],
          leaveType: record.leave_type,
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

  const handleHoursChange = (employeeId: string, field: "totalHours" | "overtimeHours", value: string) => {
    const numValue = parseFloat(value) || 0;
    setEmployeeEntries((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: numValue,
      },
    }));
  };

  const handleAddLeave = () => {
    if (!leaveFormData.employeeId || !leaveFormData.leaveDate) {
      toast.error("Please select an employee and date");
      return;
    }

    const leaveType = leaveFormData.leaveType;

    // Check for duplicate
    const isDuplicate = [...existingLeaveRecords, ...newLeaveEntries].some(
      (entry) =>
        entry.employeeId === leaveFormData.employeeId &&
        entry.leaveDate === leaveFormData.leaveDate
    );

    if (isDuplicate) {
      toast.error("Leave entry already exists for this employee on this date");
      return;
    }

    const employee = eligibleEmployees.find(
      (e: Employee) => e.id === leaveFormData.employeeId
    );

    // If public holiday, show bulk add dialog
    if (leaveType === "cuti_umum") {
      setPendingHolidayLeave({
        leaveDate: leaveFormData.leaveDate,
        leaveType: "cuti_umum",
        firstEmployeeId: leaveFormData.employeeId,
        firstEmployeeName: employee?.name || "",
      });

      // Initialize selections - all selected employees except the first one
      const initialSelections: Record<string, boolean> = {};
      Object.values(employeeEntries).forEach((entry) => {
        if (entry.selected && entry.employeeId !== leaveFormData.employeeId) {
          // Check if this employee already has leave on this date
          const hasExisting = [...existingLeaveRecords, ...newLeaveEntries].some(
            (leave) =>
              leave.employeeId === entry.employeeId &&
              leave.leaveDate === leaveFormData.leaveDate
          );
          if (!hasExisting) {
            initialSelections[entry.employeeId] = true;
          }
        }
      });
      setBulkHolidaySelections(initialSelections);

      setShowAddLeaveModal(false);
      setShowBulkHolidayModal(true);
      return;
    }

    // Regular leave - just add it
    setNewLeaveEntries((prev) => [
      ...prev,
      {
        employeeId: leaveFormData.employeeId,
        employeeName: employee?.name || "",
        leaveDate: leaveFormData.leaveDate,
        leaveType,
        isNew: true,
      },
    ]);

    setLeaveFormData({
      employeeId: "",
      leaveDate: format(new Date(), "yyyy-MM-dd"),
      leaveType: "cuti_sakit",
    });
    setShowAddLeaveModal(false);
  };

  const handleConfirmBulkHoliday = () => {
    if (!pendingHolidayLeave) return;

    const newEntries: LeaveEntry[] = [];

    // Add the first employee's leave
    newEntries.push({
      employeeId: pendingHolidayLeave.firstEmployeeId,
      employeeName: pendingHolidayLeave.firstEmployeeName,
      leaveDate: pendingHolidayLeave.leaveDate,
      leaveType: "cuti_umum",
      isNew: true,
    });

    // Add selected employees' leaves
    Object.entries(bulkHolidaySelections).forEach(([employeeId, isSelected]) => {
      if (isSelected) {
        const employee = eligibleEmployees.find((e: Employee) => e.id === employeeId);
        if (employee) {
          newEntries.push({
            employeeId,
            employeeName: employee.name,
            leaveDate: pendingHolidayLeave.leaveDate,
            leaveType: "cuti_umum",
            isNew: true,
          });
        }
      }
    });

    setNewLeaveEntries((prev) => [...prev, ...newEntries]);

    // Reset states
    setPendingHolidayLeave(null);
    setBulkHolidaySelections({});
    setShowBulkHolidayModal(false);
    setLeaveFormData({
      employeeId: "",
      leaveDate: format(new Date(), "yyyy-MM-dd"),
      leaveType: "cuti_sakit",
    });

    toast.success(`Added public holiday leave for ${newEntries.length} employee(s)`);
  };

  const handleSkipBulkHoliday = () => {
    if (!pendingHolidayLeave) return;

    // Just add the first employee's leave
    setNewLeaveEntries((prev) => [
      ...prev,
      {
        employeeId: pendingHolidayLeave.firstEmployeeId,
        employeeName: pendingHolidayLeave.firstEmployeeName,
        leaveDate: pendingHolidayLeave.leaveDate,
        leaveType: "cuti_umum",
        isNew: true,
      },
    ]);

    // Reset states
    setPendingHolidayLeave(null);
    setBulkHolidaySelections({});
    setShowBulkHolidayModal(false);
    setLeaveFormData({
      employeeId: "",
      leaveDate: format(new Date(), "yyyy-MM-dd"),
      leaveType: "cuti_sakit",
    });
  };

  const handleBulkSelectionToggle = (employeeId: string) => {
    setBulkHolidaySelections((prev) => ({
      ...prev,
      [employeeId]: !prev[employeeId],
    }));
  };

  const handleBulkSelectAll = () => {
    const allSelected = Object.values(bulkHolidaySelections).every((v) => v);
    const newSelections: Record<string, boolean> = {};
    Object.keys(bulkHolidaySelections).forEach((id) => {
      newSelections[id] = !allSelected;
    });
    setBulkHolidaySelections(newSelections);
  };

  const handleRemoveNewLeave = (index: number) => {
    setNewLeaveEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingLeave = (leaveId: number) => {
    // Add to deleted list
    setDeletedLeaveIds((prev) => [...prev, leaveId]);
    // Remove from existing records display
    setExistingLeaveRecords((prev) => prev.filter((leave) => leave.id !== leaveId));
  };

  // Activities handlers
  const handleManageActivities = (entry: EmployeeEntry) => {
    setSelectedEmployee(entry);
    setShowActivitiesModal(true);
  };

  const handleActivitiesUpdated = (activities: ActivityItem[]) => {
    if (!selectedEmployee) return;

    // Recalculate amounts with proper hours for each activity type
    const recalculatedActivities = activities.map(activity => ({
      ...activity,
      calculatedAmount: calculateActivityAmount(
        activity,
        activity.hoursApplied || selectedEmployee.totalHours,
        {}
      )
    }));

    setEmployeeActivities((prev) => ({
      ...prev,
      [selectedEmployee.employeeId]: recalculatedActivities,
    }));
  };

  const handleSave = async () => {
    const selectedEmployees = Object.values(employeeEntries).filter((e) => e.selected);

    if (selectedEmployees.length === 0) {
      toast.error("Please select at least one employee");
      return;
    }

    // Validate hours
    for (const emp of selectedEmployees) {
      if (emp.totalHours <= 0) {
        toast.error(`Please enter valid hours for ${emp.employeeName}`);
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
          activities: (employeeActivities[emp.employeeId] || []).filter(
            (a) => a.isSelected
          ),
        })),
        leaveEntries: newLeaveEntries.map((leave) => ({
          employeeId: leave.employeeId,
          leaveDate: leave.leaveDate,
          leaveType: leave.leaveType,
          isNew: true,
          amount_paid: 0,
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
      const errorMessage = error?.data?.message || error?.message || "Failed to save monthly work log";
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
      default:
        return type;
    }
  };

  const getLeaveTypeColor = (type: string) => {
    switch (type) {
      case "cuti_sakit":
        return "bg-amber-100 text-amber-700";
      case "cuti_tahunan":
        return "bg-sky-100 text-sky-700";
      case "cuti_umum":
        return "bg-red-100 text-red-700";
      default:
        return "bg-default-100 text-default-700";
    }
  };

  const allSelected = Object.values(employeeEntries).length > 0 &&
    Object.values(employeeEntries).every((e) => e.selected);

  const allLeaveRecords = [...existingLeaveRecords, ...newLeaveEntries];

  if (loadingStaffs) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="relative w-full space-y-4 mb-4 mx-4 md:mx-6">
      {/* Header */}
      <div>
        <BackButton onClick={handleCancel} />
        <h1 className="text-xl font-semibold text-default-800">
          {mode === "edit" ? "Edit" : "New"} {jobConfig?.name} Monthly Entry
        </h1>
      </div>

      {/* Month/Year Selection */}
      <div className="bg-white p-4 rounded-lg border border-default-200">
        <h2 className="text-sm font-medium text-default-700 mb-3">Select Period</h2>
        <div className="flex gap-4">
          <div className="w-48">
            {mode === "edit" ? (
              <div className="px-3 py-2 bg-default-100 border border-default-200 rounded-lg text-sm text-default-700">
                {monthOptions.find((m) => m.id === formData.logMonth)?.name}
              </div>
            ) : (
              <StyledListbox
                value={formData.logMonth}
                onChange={(value) => setFormData({ ...formData, logMonth: Number(value) })}
                options={monthOptions}
              />
            )}
          </div>
          <div className="w-32">
            {mode === "edit" ? (
              <div className="px-3 py-2 bg-default-100 border border-default-200 rounded-lg text-sm text-default-700">
                {formData.logYear}
              </div>
            ) : (
              <StyledListbox
                value={formData.logYear}
                onChange={(value) => setFormData({ ...formData, logYear: Number(value) })}
                options={yearOptions}
              />
            )}
          </div>
        </div>
      </div>

      {/* Employee Selection Table */}
      <div className="bg-white rounded-lg border border-default-200">
        <div className="p-4 border-b border-default-200">
          <h2 className="text-sm font-medium text-default-700">
            Employee Work Hours
          </h2>
          <p className="text-xs text-default-500 mt-1">
            Select employees and enter their monthly work hours
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-default-200">
            <thead className="bg-default-50">
              <tr>
                <th className="px-6 py-3 text-left w-12 whitespace-nowrap">
                  <Checkbox
                    checked={allSelected}
                    onChange={handleSelectAll}
                    size={20}
                    checkedColor="text-sky-600"
                    disabled={isSaving}
                    buttonClassName="p-1 rounded-lg"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase whitespace-nowrap">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase whitespace-nowrap">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase whitespace-nowrap">
                  Job
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase whitespace-nowrap w-32">
                  Regular Hours
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase whitespace-nowrap w-32">
                  Overtime
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase whitespace-nowrap">
                  Activities
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200">
              {Object.values(employeeEntries).map((entry) => (
                <tr
                  key={entry.employeeId}
                  className={`${
                    entry.selected ? "bg-sky-50" : "bg-white"
                  } hover:bg-default-50 cursor-pointer`}
                  onClick={() => handleEmployeeSelect(entry.employeeId)}
                >
                  <td
                    className="px-6 py-4 whitespace-nowrap cursor-pointer"
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-700">
                    <Link
                      to={`/catalogue/staff/${entry.employeeId}`}
                      className="hover:underline hover:text-sky-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.employeeId}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                    <span className="font-medium">{entry.employeeName}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-default-600">
                    <Link
                      to={`/catalogue/job?id=${entry.jobType}`}
                      className="hover:underline hover:text-sky-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.jobName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="number"
                      value={entry.selected ? entry.totalHours : ""}
                      onChange={(e) =>
                        handleHoursChange(entry.employeeId, "totalHours", e.target.value)
                      }
                      onClick={(e) => e.stopPropagation()}
                      disabled={!entry.selected || isSaving}
                      className="w-full pl-3 py-1 text-center text-sm border border-default-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-default-100 disabled:text-default-400"
                      min="0"
                      step="0.5"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="number"
                      value={entry.selected ? entry.overtimeHours : ""}
                      onChange={(e) =>
                        handleHoursChange(entry.employeeId, "overtimeHours", e.target.value)
                      }
                      onClick={(e) => e.stopPropagation()}
                      disabled={!entry.selected || isSaving}
                      className="w-full pl-3 py-1 text-center text-sm border border-default-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-default-100 disabled:text-default-400"
                      min="0"
                      step="0.5"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <ActivitiesTooltip
                      activities={(
                        employeeActivities[entry.employeeId] || []
                      ).filter((activity) => activity.isSelected)}
                      employeeName={entry.employeeName}
                      className={
                        !entry.selected
                          ? "disabled:text-default-300 disabled:cursor-not-allowed"
                          : ""
                      }
                      disabled={!entry.selected}
                      onClick={() => handleManageActivities(entry)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Object.values(employeeEntries).length === 0 && (
          <div className="p-8 text-center text-default-500">
            No employees found for this job type.
          </div>
        )}
      </div>

      {/* Leave Records Section */}
      <div className="bg-white rounded-lg border border-default-200">
        <div className="p-4 border-b border-default-200 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-medium text-default-700">
              Leave Records for {monthOptions.find((m) => m.id === formData.logMonth)?.name} {formData.logYear}
            </h2>
            <p className="text-xs text-default-500 mt-1">
              View existing leave and add new leave entries for this month
            </p>
          </div>
          <Button
            onClick={() => setShowAddLeaveModal(true)}
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
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200">
                {allLeaveRecords.map((leave, index) => (
                  <tr key={`${leave.employeeId}-${leave.leaveDate}-${index}`} className="bg-white">
                    <td className="px-4 py-3 text-sm text-default-700">
                      <span className="font-medium">{leave.employeeName}</span>
                      <span className="text-default-400 ml-2">({leave.employeeId})</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-default-700">
                      {format(new Date(leave.leaveDate), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getLeaveTypeColor(
                          leave.leaveType
                        )}`}
                      >
                        {getLeaveTypeLabel(leave.leaveType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {leave.isNew ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                          New
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-default-100 text-default-600">
                          Existing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          if (leave.isNew) {
                            handleRemoveNewLeave(newLeaveEntries.indexOf(leave as any));
                          } else if (leave.id) {
                            handleRemoveExistingLeave(leave.id);
                          }
                        }}
                        className="text-rose-600 hover:text-rose-800"
                        title="Remove"
                        disabled={isSaving}
                      >
                        <IconTrash size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-default-500">
            <IconCalendar size={32} className="mx-auto mb-2 text-default-300" />
            <p>No leave records for this month.</p>
            <p className="text-xs mt-1">Click "Add Leave" to record leave entries.</p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} color="sky" disabled={isSaving}>
          {isSaving ? "Saving..." : mode === "edit" ? "Update" : "Save"}
        </Button>
      </div>

      {/* Add Leave Modal */}
      <Transition appear show={showAddLeaveModal} as={React.Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-50 overflow-y-auto"
          onClose={() => setShowAddLeaveModal(false)}
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

            <span className="inline-block h-screen align-middle" aria-hidden="true">
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
                className="relative z-50 inline-block w-full max-w-md p-6 my-8 overflow-visible text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <DialogTitle as="h3" className="text-lg font-medium leading-6 text-default-900">
                  Add Leave Entry
                </DialogTitle>

                <div className="space-y-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-default-700 mb-1">
                      Employee
                    </label>
                    <StyledListbox
                      value={leaveFormData.employeeId}
                      onChange={(value) =>
                        setLeaveFormData({ ...leaveFormData, employeeId: String(value) })
                      }
                      options={[
                        { id: "", name: "Select Employee" },
                        ...eligibleEmployees.map((emp: Employee) => ({
                          id: emp.id,
                          name: `${emp.name} (${emp.id})`,
                        })),
                      ]}
                      placeholder="Select Employee"
                      rounded="lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-default-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={leaveFormData.leaveDate}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        const isPublicHoliday = newDate && isHoliday(new Date(newDate));
                        setLeaveFormData({
                          ...leaveFormData,
                          leaveDate: newDate,
                          // Auto-select public holiday if date is a holiday
                          leaveType: isPublicHoliday ? "cuti_umum" : leaveFormData.leaveType,
                        });
                      }}
                      className="w-full px-3 py-2 border border-default-300 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    />
                    {leaveFormData.leaveDate && isHoliday(new Date(leaveFormData.leaveDate)) && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-sky-600">
                        <IconAlertCircle size={14} />
                        <span>
                          This date is a public holiday: {getHolidayDescription(new Date(leaveFormData.leaveDate))}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-default-700 mb-1">
                      Leave Type
                    </label>
                    <StyledListbox
                      value={leaveFormData.leaveType}
                      onChange={(value) =>
                        setLeaveFormData({
                          ...leaveFormData,
                          leaveType: value as "cuti_sakit" | "cuti_tahunan" | "cuti_umum",
                        })
                      }
                      options={[
                        { id: "cuti_sakit", name: "Sick Leave" },
                        { id: "cuti_tahunan", name: "Annual Leave" },
                        { id: "cuti_umum", name: "Public Holiday" },
                      ]}
                      rounded="lg"
                    />
                    {leaveFormData.leaveType === "cuti_umum" && (
                      <p className="text-xs text-sky-600 mt-1">
                        You'll be prompted to add this leave for other employees too.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-2">
                  <button
                    type="button"
                    className="inline-flex justify-center px-4 py-2 text-sm font-medium text-default-700 bg-default-100 border border-transparent rounded-full hover:bg-default-200 active:bg-default-300 focus:outline-none"
                    onClick={() => setShowAddLeaveModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-sky-500 border border-transparent rounded-full hover:bg-sky-600 active:bg-sky-700 focus:outline-none"
                    onClick={handleAddLeave}
                  >
                    Add Leave
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>

      {/* Bulk Holiday Modal */}
      <Transition appear show={showBulkHolidayModal} as={React.Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-50 overflow-y-auto"
          onClose={() => {
            // Don't allow closing by clicking outside - must use buttons
          }}
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

            <span className="inline-block h-screen align-middle" aria-hidden="true">
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
                className="relative z-50 inline-block w-full max-w-lg p-6 my-8 overflow-visible text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <DialogTitle as="h3" className="text-lg font-medium leading-6 text-default-900">
                  Add Public Holiday for Other Employees?
                </DialogTitle>

                <div className="mt-3">
                  <p className="text-sm text-default-600">
                    You're adding a public holiday leave for{" "}
                    <span className="font-medium">{pendingHolidayLeave?.firstEmployeeName}</span> on{" "}
                    <span className="font-medium">
                      {pendingHolidayLeave?.leaveDate
                        ? format(new Date(pendingHolidayLeave.leaveDate), "dd MMM yyyy")
                        : ""}
                    </span>
                    .
                  </p>
                  <p className="text-sm text-default-600 mt-2">
                    Would you like to add this leave for other selected employees too?
                  </p>
                </div>

                {Object.keys(bulkHolidaySelections).length > 0 ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-default-700">
                        Select Employees ({Object.values(bulkHolidaySelections).filter(Boolean).length} selected)
                      </label>
                      <button
                        type="button"
                        onClick={handleBulkSelectAll}
                        className="text-xs text-sky-600 hover:text-sky-700"
                      >
                        {Object.values(bulkHolidaySelections).every((v) => v) ? "Deselect All" : "Select All"}
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-default-200 rounded-lg">
                      {Object.entries(bulkHolidaySelections).map(([employeeId, isSelected]) => {
                        const employee = eligibleEmployees.find((e: Employee) => e.id === employeeId);
                        return (
                          <div
                            key={employeeId}
                            className={`flex items-center px-3 py-2 cursor-pointer hover:bg-default-50 ${
                              isSelected ? "bg-sky-50" : ""
                            }`}
                            onClick={() => handleBulkSelectionToggle(employeeId)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onChange={() => {}}
                              size={18}
                              checkedColor="text-sky-600"
                            />
                            <span className="ml-3 text-sm text-default-700">
                              {employee?.name} ({employeeId})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 bg-default-50 rounded-lg text-center">
                    <p className="text-sm text-default-500">
                      No other employees available to add this leave.
                    </p>
                  </div>
                )}

                <div className="mt-6 flex justify-end space-x-2">
                  <button
                    type="button"
                    className="inline-flex justify-center px-4 py-2 text-sm font-medium text-default-700 bg-default-100 border border-transparent rounded-full hover:bg-default-200 active:bg-default-300 focus:outline-none"
                    onClick={handleSkipBulkHoliday}
                  >
                    {Object.keys(bulkHolidaySelections).length > 0 ? "Skip" : "OK"}
                  </button>
                  {Object.keys(bulkHolidaySelections).length > 0 && (
                    <button
                      type="button"
                      className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-sky-500 border border-transparent rounded-full hover:bg-sky-600 active:bg-sky-700 focus:outline-none"
                      onClick={handleConfirmBulkHoliday}
                    >
                      Add for Selected ({Object.values(bulkHolidaySelections).filter(Boolean).length + 1})
                    </button>
                  )}
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

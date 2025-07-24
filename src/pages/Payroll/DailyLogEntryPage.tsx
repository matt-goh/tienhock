// src/pages/Payroll/DailyLogEntryPage.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Fragment,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import { format } from "date-fns";
import LoadingSpinner from "../../components/LoadingSpinner";
import Checkbox from "../../components/Checkbox";
import ManageActivitiesModal from "../../components/Payroll/ManageActivitiesModal";
import ActivitiesTooltip from "../../components/Payroll/ActivitiesTooltip";
import toast from "react-hot-toast";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { api } from "../../routes/utils/api";
import { useHolidayCache } from "../../utils/payroll/useHolidayCache";
import {
  getJobConfig,
  getContextLinkedPayCodes,
  getJobIds,
} from "../../configs/payrollJobConfigs";
import DynamicContextForm from "../../components/Payroll/DynamicContextForm";
import {
  calculateActivityAmount,
  calculateActivitiesAmounts,
} from "../../utils/payroll/calculateActivityAmount";
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
  IconMapPin,
  IconMapPinOff,
} from "@tabler/icons-react";

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

type LeaveType = "cuti_umum" | "cuti_sakit";

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
  const [leaveSelectAll, setLeaveSelectAll] = useState(false);

  const { isHoliday, getHolidayDescription, holidays } = useHolidayCache();

  const JOB_IDS = getJobIds(jobType);

  // Get job configuration
  const jobConfig = getJobConfig(jobType);
  const contextLinkedPayCodes = jobConfig
    ? getContextLinkedPayCodes(jobConfig)
    : {};

  // Helper function to determine day type based on date
  const determineDayType = (date: Date): "Biasa" | "Ahad" | "Umum" => {
    // Check if it's a holiday first
    if (isHoliday(date)) return "Umum";

    // Then check if it's Sunday
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return "Ahad";

    return "Biasa";
  };

  // Initialize form data with dynamic context fields
  const [formData, setFormData] = useState<DailyLogFormData>(() => {
    if (mode === "edit" && existingWorkLog) {
      return {
        logDate: existingWorkLog.log_date.split("T")[0],
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
  const {
    employeeMappings,
    detailedMappings: jobPayCodeDetails,
    loading: loadingPayCodeMappings,
  } = useJobPayCodeMappings();
  const [isSaving, setIsSaving] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

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
              formData.contextData
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

  // Add new computed values for SALESMAN specific views
  const salesmanEmployees = useMemo(() => {
    if (jobConfig?.id !== "SALESMAN") return [];
    return expandedEmployees.filter(
      (emp: { jobType: string; id: string }) =>
        emp.jobType === "SALESMAN" && emp.id !== "KILANG"
    );
  }, [expandedEmployees, jobConfig?.id]);

  const salesmanIkutEmployees = useMemo(() => {
    if (jobConfig?.id !== "SALESMAN") return [];
    return expandedEmployees.filter(
      (emp: { jobType: string }) => emp.jobType === "SALESMAN_IKUT"
    );
  }, [expandedEmployees, jobConfig?.id]);

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

  // Helper for SALESMAN_IKUT employees available for work
  const salesmanIkutAvailableForWork = useMemo(() => {
    if (jobConfig?.id !== "SALESMAN") return [];
    return salesmanIkutEmployees.filter(
      (emp) => !leaveEmployees[emp.id]?.selected
    );
  }, [salesmanIkutEmployees, leaveEmployees, jobConfig?.id]);

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

  // Modify handleLeaveSelection
  const handleLeaveSelection = (employeeId: string) => {
    setLeaveEmployees((prev) => {
      const isCurrentlySelected = prev[employeeId]?.selected;
      const newSelectedState = !isCurrentlySelected;

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

      // Set the correct default leave type based on day type
      const defaultLeaveType =
        formData.dayType === "Umum" ? "cuti_umum" : "cuti_sakit";

      return {
        ...prev,
        [employeeId]: {
          selected: newSelectedState,
          leaveType: newSelectedState
            ? defaultLeaveType // Always use fresh default when selecting
            : prev[employeeId]?.leaveType || defaultLeaveType, // Keep existing when deselecting
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
      hours
    );

    setLeaveEmployeeActivities((prev) => ({
      ...prev,
      [employeeId]: recalculatedActivities,
    }));
    toast.success(`Leave pay updated for ${selectedLeaveEmployee.name}`);
  };

  const handleLeaveTypeChange = (employeeId: string, leaveType: LeaveType) => {
    setLeaveEmployees((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        leaveType,
      },
    }));
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
    navigate(`/payroll/${jobType.toLowerCase()}-production`);
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

    // Update activities based on location type
    // This will be completed in the next implementation phase
  };

  const fetchSalesmanProducts = async () => {
    if (jobConfig?.id !== "SALESMAN" || !formData.logDate) return;

    try {
      // Get all selected salesmen IDs
      const salesmenIds: string[] = [];

      Object.entries(employeeSelectionState.selectedJobs).forEach(
        ([employeeId, jobTypes]) => {
          if (jobTypes.some((jt) => JOB_IDS.includes(jt))) {
            salesmenIds.push(employeeId);
          }
        }
      );

      if (salesmenIds.length === 0) return;

      // Fetch products for all salesmen in one request
      const response = await api.get(
        `/api/invoices/salesman-products?salesmanIds=${salesmenIds.join(
          ","
        )}&date=${formData.logDate}`
      );

      // Response might be directly available or in a data property
      const responseData = response.data || response;

      // Create row keys for each salesman and job type combination
      const rowKeyProducts: Record<string, any[]> = {};

      Object.entries(responseData).forEach(([salesmanId, products]) => {
        // Find all selected jobs for this employee
        const selectedJobs =
          employeeSelectionState.selectedJobs[salesmanId] || [];

        // Create row key for each job and set products
        selectedJobs.forEach((jobType) => {
          const rowKey = `${salesmanId}-${jobType}`;

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
      });

      setSalesmanProducts(rowKeyProducts);
    } catch (error) {
      console.error("Error fetching salesman products:", error);
      toast.error("Failed to fetch salesman products");
    }
  };

  useEffect(() => {
    // Directly call the function when dependencies change
    if (
      jobConfig?.id === "SALESMAN" &&
      formData.logDate &&
      Object.keys(employeeSelectionState.selectedJobs).length > 0
    ) {
      fetchSalesmanProducts();
    }
  }, [
    jobConfig?.id,
    formData.logDate,
    employeeSelectionState.selectedJobs, // Reference the object directly
    JOB_IDS, // Include in dependencies since it's used inside fetchSalesmanProducts
  ]);

  useEffect(() => {
    // After salesmanProducts are updated, auto-link them to pay codes
    if (
      jobConfig?.id === "SALESMAN" &&
      Object.keys(salesmanProducts).length > 0
    ) {
      // For each row key and its products
      Object.entries(salesmanProducts).forEach(([rowKey, products]) => {
        // Skip if there are no products for this employee
        if (!products || products.length === 0) {
          return;
        }

        // For this employee+job combo, update their activities
        setEmployeeActivities((prev) => {
          const currentActivities = prev[rowKey] || [];
          if (currentActivities.length === 0) {
            return prev;
          }

          // Create a new array with updated activities
          const updatedActivities = [...currentActivities];

          // For each product, find and update the matching pay code
          products.forEach((product) => {
            const productId = String(product.product_id);
            const quantity = parseFloat(product.quantity) || 0;

            // Find the activity with matching pay code ID
            const activityIndex = updatedActivities.findIndex(
              (activity) => String(activity.payCodeId) === productId
            );

            if (activityIndex !== -1) {
              // Update the activity with the product quantity
              if (quantity > 0) {
                updatedActivities[activityIndex] = {
                  ...updatedActivities[activityIndex],
                  unitsProduced: quantity,
                  isSelected: true, // Auto-select products with non-zero quantity
                };
              }
            }
          });

          // Auto-deselect Hour-based activities
          updatedActivities.forEach((activity, index) => {
            if (activity.rateUnit === "Hour") {
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
            0, // For salesmen, hours aren't used
            formData.contextData,
            locationTypes[rowKey] || "Local"
          );

          return {
            ...prev,
            [rowKey]: recalculatedActivities,
          };
        });
      });
    }
  }, [salesmanProducts, jobConfig?.id]);

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
        };
      });

    const allSelectedEmployees = Object.entries(
      employeeSelectionState.selectedJobs
    ).filter(([_, jobTypes]) => jobTypes.length > 0);

    if (allSelectedEmployees.length === 0 && leaveEntries.length === 0) {
      toast.error("Please select at least one employee for work or leave.");
      return;
    }

    // Validate that all selected employees have hours
    const invalidEmployees = allSelectedEmployees.filter(
      ([employeeId, jobTypes]) => {
        return jobTypes.some((jobType) => {
          const hours =
            employeeSelectionState.jobHours[employeeId]?.[jobType] || 0;
          return hours <= 0;
        });
      }
    );

    if (invalidEmployees.length > 0) {
      toast.error("All selected employees must have hours greater than 0");
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

          // Add additional data for different job types
          const additionalData: any = {};
          if (jobType === "SALESMAN_IKUT") {
            additionalData.followingSalesmanId = salesmanIkutRelations[rowKey];
            additionalData.muatMeeBags = ikutBagCounts[rowKey]?.muatMee || 0;
            additionalData.muatBihunBags =
              ikutBagCounts[rowKey]?.muatBihun || 0;
          } else if (jobType === "SALESMAN") {
            additionalData.locationType = locationTypes[rowKey] || "Local";
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

  // Handle select all/deselect all employees
  const handleSelectAll = () => {
    const availableEmployees =
      jobConfig?.id === "SALESMAN" ? salesmanEmployees : availableForWork;

    // Check if all available employees are selected
    const allAvailableSelected = availableEmployees.every((emp) =>
      employeeSelectionState.selectedJobs[emp.id]?.includes(emp.jobType)
    );

    setEmployeeSelectionState((prev) => {
      if (allAvailableSelected) {
        // Deselect all available employees
        const newSelectedJobs = { ...prev.selectedJobs };
        availableEmployees.forEach((emp) => {
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

        availableEmployees.forEach((emp) => {
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
            newJobHours[emp.id][emp.jobType] = 7;
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
  const handleLeaveSelectAll = () => {
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
      // Select all available for leave
      setLeaveEmployees((prev) => {
        const newLeaveEmployees = { ...prev };
        availableForLeave.forEach((emp) => {
          const defaultLeaveType =
            formData.dayType === "Umum" ? "cuti_umum" : "cuti_sakit";
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

          // Set default hours if not already set
          if (!newJobHours[ikutEmployee.id]["SALESMAN_IKUT"]) {
            newJobHours[ikutEmployee.id]["SALESMAN_IKUT"] = 7;
          }

          return {
            selectedJobs: newSelectedJobs,
            jobHours: newJobHours,
          };
        });
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
    value: string
  ) => {
    const numValue = value === "" ? 0 : parseInt(value) || 0;

    setIkutBagCounts((prev) => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        [field]: numValue,
      },
    }));
  };

  // Update select all state based on individual selections and availability
  useEffect(() => {
    const availableEmployees =
      jobConfig?.id === "SALESMAN" ? salesmanEmployees : availableForWork;
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
    salesmanEmployees,
    jobConfig?.id,
    leaveEmployees,
    availableForLeave,
  ]);

  // Use a one-time initialization effect
  const initializedRef = useRef(false);
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

      // Restore SALESMAN_IKUT relations and bag counts
      const newSalesmanIkutRelations: Record<string, string> = {};
      const newIkutBagCounts: Record<
        string,
        { muatMee: number; muatBihun: number }
      > = {};

      existingWorkLog.employeeEntries.forEach((entry: any) => {
        const rowKey = `${entry.employee_id}-${entry.job_id}`;

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
          newEmployeeActivities[rowKey] = entry.activities.map(
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

        // Restore SALESMAN_IKUT specific data
        if (entry.job_id === "SALESMAN_IKUT") {
          if (entry.following_salesman_id) {
            newSalesmanIkutRelations[rowKey] = entry.following_salesman_id;
          }

          newIkutBagCounts[rowKey] = {
            muatMee: entry.muat_mee_bags || 0,
            muatBihun: entry.muat_bihun_bags || 0,
          };
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
    }
  }, [
    mode,
    existingWorkLog,
    loadingStaffs,
    loadingJobs,
    loadingPayCodeMappings,
  ]);

  useEffect(() => {
    if (jobConfig?.id !== "SALESMAN") return;

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
  }, [ikutBagCounts, jobConfig?.id]);

  // Separate effect for fetching activities after selection changes
  useEffect(() => {
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
    loadingPayCodeMappings,
    mode,
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
          const isSalesmanJob = jobConfig?.id === "SALESMAN";

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
            // For salesman, skip Hour-based pay codes
            if (isSalesmanJob && pc.rate_unit === "Hour") {
              return;
            }
            allPayCodes.set(pc.id, { ...pc, source: "employee" });
          });

          // Convert map back to array
          const mergedPayCodes = Array.from(allPayCodes.values());

          // Get existing activities for this employee/job if in edit mode
          const existingActivitiesForRow = employeeActivities[rowKey] || [];

          // For salesmen, we don't filter by hours since hours aren't applicable
          const filteredPayCodes = isSalesmanJob
            ? mergedPayCodes
            : hours > 8
            ? mergedPayCodes
            : mergedPayCodes.filter((pc) => pc.rate_unit !== "OT");

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

            if (mode === "edit" && existingActivity) {
              // In edit mode, only preserve selection if activity was actually saved
              isSelected = existingActivity.isSelected;
            } else {
              // Apply selection rules for new/unsaved activities
              if (payCode.pay_type === "Tambahan") {
                // NEVER auto-select Tambahan pay codes
                isSelected = false;
              } else if (payCode.pay_type === "Overtime") {
                // Only auto-select OT codes if hours > 8
                isSelected = !isSalesmanJob && hours > 8;
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
              if (isSalesmanJob && payCode.rate_unit === "Hour") {
                isSelected = false;
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
                hours,
                formData.contextData
              ),
            };
          });

          // Apply auto-deselection logic to all activities
          const processedActivities = calculateActivitiesAmounts(
            activities,
            hours,
            formData.contextData
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
            hours
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
    ]
  );

  // Update handleActivitiesUpdated to store all activities, not just selected:
  const handleActivitiesUpdated = (activities: any[]) => {
    if (!selectedEmployee?.rowKey) return;

    const rowKey = selectedEmployee.rowKey;

    // When recalculating activities for salesmen, consider the location type
    if (jobConfig?.id === "SALESMAN") {
      const locationType = locationTypes[rowKey] || "Local";

      // Recalculate with location type
      const recalculatedActivities = calculateActivitiesAmounts(
        activities,
        0, // Hours don't matter for salesmen
        formData.contextData,
        locationType
      );

      setEmployeeActivities((prev) => ({
        ...prev,
        [rowKey]: recalculatedActivities,
      }));
    } else {
      // Standard logic for non-salesmen
      setEmployeeActivities((prev) => ({
        ...prev,
        [rowKey]: activities,
      }));
    }

    toast.success(`Activities updated for ${selectedEmployee.name}`);
  };

  return (
    <div className="relative w-full mx-4 mb-4 md:mx-6 -mt-8">
      <BackButton onClick={handleBack} />
      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-default-800 mb-4">
          {mode === "edit"
            ? `Edit ${jobConfig?.name} Entry`
            : `New ${jobConfig?.name} Entry`}
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
                {formData.dayType === "Umum" &&
                  getHolidayDescription(new Date(formData.logDate)) && (
                    <span className="ml-1 font-normal">
                      ({getHolidayDescription(new Date(formData.logDate))})
                    </span>
                  )}
              </span>
            </div>
          </div>

          {/* Shift - Hidden for Salesman */}
          {jobConfig?.id !== "SALESMAN" && (
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
          )}

          {/* Show Context Form here only if 3 or fewer fields */}
          {jobConfig?.contextFields && jobConfig.contextFields.length <= 3 && (
            <div>
              <DynamicContextForm
                contextFields={jobConfig?.contextFields || []}
                contextData={formData.contextData}
                onChange={handleContextChange}
                disabled={isSaving}
              />
            </div>
          )}
        </div>

        {/* Show Context Form below if more than 3 fields */}
        {jobConfig?.contextFields && jobConfig.contextFields.length > 3 && (
          <div className="mb-6">
            <span className="text-sm font-medium text-default-700 mb-3">
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
        <div className="border-t border-default-200 pt-4 mt-4">
          <h2 className="text-lg font-semibold text-default-700 mb-3">
            Employees & Work Hours
          </h2>

          <div className="mb-4 flex justify-between items-center">
            <p className="text-sm text-default-500">
              Select employees and assign hours worked for this job.
            </p>
          </div>

          {/* Employee Selection Table */}
          {loadingStaffs || loadingJobs ? (
            <div className="flex justify-center items-center h-48">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {/* Main Employee Table */}
              <div className="bg-white rounded-lg border shadow-sm">
                <div>
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left">
                          <Checkbox
                            checked={selectAll}
                            onChange={handleSelectAll}
                            size={20}
                            checkedColor="text-sky-600"
                            ariaLabel="Select all employees"
                            buttonClassName="p-1 rounded-lg"
                            disabled={
                              availableForWork.length === 0 &&
                              jobConfig?.id !== "SALESMAN"
                            }
                          />
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
                          Job
                        </th>
                        {jobConfig?.id === "SALESMAN" ? (
                          <th
                            scope="col"
                            className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Location
                          </th>
                        ) : (
                          <th
                            scope="col"
                            className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Hours
                          </th>
                        )}
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {(jobConfig?.id === "SALESMAN"
                        ? salesmanEmployees
                        : expandedEmployees
                      ).map((row) => {
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
                                ? "bg-default-50 cursor-not-allowed"
                                : "cursor-pointer hover:bg-default-50"
                            } ${
                              isSelected
                                ? "bg-sky-50 hover:bg-sky-100"
                                : "bg-white"
                            }`}
                          >
                            <td className="px-6 py-4 whitespace-nowrap align-middle">
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onChange={() =>
                                    handleEmployeeSelection(row.rowKey)
                                  }
                                  size={20}
                                  checkedColor="text-sky-600"
                                  ariaLabel={`Select employee ${row.name} for job ${row.jobName}`}
                                  buttonClassName="p-1 rounded-lg"
                                  disabled={
                                    isSaving || leaveEmployees[row.id]?.selected
                                  }
                                />
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-700">
                              <Link
                                to={`/catalogue/staff/${row.id}`}
                                className="hover:underline hover:text-sky-600"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.id}
                              </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                              <span className="font-medium">{row.name}</span>
                              {followedBySalesman[row.id] &&
                                followedBySalesman[row.id].length > 0 && (
                                  <span className="text-xs text-default-500 block mt-1">
                                    (Followed by{" "}
                                    {followedBySalesman[row.id]
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
                                )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                              <Link
                                to={`/catalogue/job?id=${row.jobType}`}
                                className="hover:underline hover:text-sky-600"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.jobName}
                              </Link>
                            </td>
                            {jobConfig?.id === "SALESMAN" ? (
                              <td className="px-6 py-4 whitespace-nowrap text-left">
                                <div
                                  className="relative w-40 mx-auto"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Listbox
                                    value={
                                      locationTypes[row.rowKey || ""] || "Local"
                                    }
                                    onChange={(value) =>
                                      handleLocationTypeChange(
                                        row.rowKey,
                                        value as "Local" | "Outstation"
                                      )
                                    }
                                    disabled={!isSelected}
                                  >
                                    <div className="relative">
                                      <ListboxButton
                                        className={`relative w-full pl-3 py-1.5 text-left rounded-md border ${
                                          !isSelected
                                            ? "bg-default-100 text-default-400 cursor-not-allowed border-default-200"
                                            : "bg-white text-default-700 border-default-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500"
                                        }`}
                                      >
                                        <span className="flex items-center">
                                          {locationTypes[row.rowKey || ""] ===
                                          "Outstation" ? (
                                            <IconMapPinOff
                                              size={14}
                                              className="mr-2 text-amber-500"
                                            />
                                          ) : (
                                            <IconMapPin
                                              size={14}
                                              className="mr-2 text-sky-500"
                                            />
                                          )}
                                          <span className="block truncate text-sm">
                                            {locationTypes[row.rowKey || ""] ||
                                              "Local"}
                                          </span>
                                        </span>
                                        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                          <IconChevronDown
                                            className="w-4 h-4 text-default-400"
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
                                        <ListboxOptions className="absolute z-10 w-full py-1 mt-1 overflow-auto text-sm bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none">
                                          <ListboxOption
                                            value="Local"
                                            className={({ active }) =>
                                              `${
                                                active
                                                  ? "bg-sky-100 text-sky-900"
                                                  : "text-default-700"
                                              } cursor-pointer select-none relative py-1.5 pl-3 pr-8`
                                            }
                                          >
                                            {({ selected, active }) => (
                                              <>
                                                <div className="flex items-center">
                                                  <IconMapPin
                                                    size={14}
                                                    className={`mr-2 ${
                                                      active
                                                        ? "text-sky-600"
                                                        : "text-sky-500"
                                                    }`}
                                                  />
                                                  <span
                                                    className={`${
                                                      selected
                                                        ? "font-medium"
                                                        : "font-normal"
                                                    } block truncate`}
                                                  >
                                                    Local
                                                  </span>
                                                </div>
                                                {selected ? (
                                                  <span
                                                    className={`absolute inset-y-0 right-0 flex items-center pr-2 ${
                                                      active
                                                        ? "text-sky-600"
                                                        : "text-sky-500"
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
                                          <ListboxOption
                                            value="Outstation"
                                            className={({ active }) =>
                                              `${
                                                active
                                                  ? "bg-amber-100 text-amber-900"
                                                  : "text-default-700"
                                              } cursor-pointer select-none relative py-1.5 pl-3 pr-8`
                                            }
                                          >
                                            {({ selected, active }) => (
                                              <>
                                                <div className="flex items-center">
                                                  <IconMapPinOff
                                                    size={14}
                                                    className={`mr-2 ${
                                                      active
                                                        ? "text-amber-600"
                                                        : "text-amber-500"
                                                    }`}
                                                  />
                                                  <span
                                                    className={`${
                                                      selected
                                                        ? "font-medium"
                                                        : "font-normal"
                                                    } block truncate`}
                                                  >
                                                    Outstation
                                                  </span>
                                                </div>
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
                                        </ListboxOptions>
                                      </Transition>
                                    </div>
                                  </Listbox>
                                </div>
                              </td>
                            ) : (
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div
                                  className="flex justify-end"
                                  onClick={(e) => e.stopPropagation()}
                                >
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
                                    className={`max-w-[80px] py-1 text-sm text-right border rounded-md disabled:bg-default-100 disabled:text-default-400 disabled:cursor-not-allowed ${
                                      hours > 8 &&
                                      jobConfig?.requiresOvertimeCalc
                                        ? "border-amber-400 bg-amber-50"
                                        : "border-default-300"
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
                                </div>
                              </td>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div onClick={(e) => e.stopPropagation()}>
                                <ActivitiesTooltip
                                  activities={(
                                    employeeActivities[row.rowKey || ""] || []
                                  ).filter((activity) => activity.isSelected)}
                                  employeeName={row.name}
                                  className={
                                    !isSelected
                                      ? "disabled:text-default-300 disabled:cursor-not-allowed"
                                      : ""
                                  }
                                  disabled={!isSelected}
                                  onClick={() => handleManageActivities(row)}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SALESMAN_IKUT Table - Only show for SALESMAN job type */}
              {jobConfig?.id === "SALESMAN" &&
                salesmanIkutEmployees.length > 0 && (
                  <div className="bg-white rounded-lg border shadow-sm mt-6">
                    <div>
                      <table className="min-w-full divide-y divide-default-200">
                        <thead className="bg-default-50">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left">
                              <Checkbox
                                checked={salesmanIkutAvailableForWork.every(
                                  (emp) =>
                                    employeeSelectionState.selectedJobs[
                                      emp.id
                                    ]?.includes(emp.jobType)
                                )}
                                onChange={() => {
                                  const allSelected =
                                    salesmanIkutAvailableForWork.every((emp) =>
                                      employeeSelectionState.selectedJobs[
                                        emp.id
                                      ]?.includes(emp.jobType)
                                    );

                                  setEmployeeSelectionState((prev) => {
                                    const newState = { ...prev };
                                    salesmanIkutAvailableForWork.forEach(
                                      (emp) => {
                                        if (allSelected) {
                                          // Deselect all and clear salesman relations
                                          newState.selectedJobs[emp.id] = (
                                            newState.selectedJobs[emp.id] || []
                                          ).filter(
                                            (job) => job !== emp.jobType
                                          );

                                          // Clear salesman relation when deselecting
                                          setSalesmanIkutRelations(
                                            (prevRelations) => {
                                              const newRelations = {
                                                ...prevRelations,
                                              };
                                              delete newRelations[
                                                emp.rowKey || ""
                                              ];
                                              return newRelations;
                                            }
                                          );
                                        } else {
                                          // Don't auto-select - user must choose salesman first
                                        }
                                      }
                                    );
                                    return newState;
                                  });
                                }}
                                size={20}
                                checkedColor="text-sky-600"
                                ariaLabel="Select all ikut lori employees"
                                buttonClassName="p-1 rounded-lg"
                                disabled={
                                  salesmanIkutAvailableForWork.length === 0
                                }
                              />
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
                              Job
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                            >
                              Muat Mee (Bag)
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                            >
                              Muat Bihun (Bag)
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                            >
                              Ikut
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
                          {salesmanIkutEmployees.map((row, index) => {
                            const isSelected =
                              employeeSelectionState.selectedJobs[
                                row.id
                              ]?.includes(row.jobType);
                            const selectedSalesman =
                              salesmanIkutRelations[row.rowKey || ""] || "";
                            const bagCounts = ikutBagCounts[
                              row.rowKey || ""
                            ] || { muatMee: 0, muatBihun: 0 };
                            const isLastRow =
                              index === salesmanIkutEmployees.length - 1; // Add this line

                            return (
                              <tr
                                key={row.rowKey}
                                onClick={() => {
                                  if (
                                    isSaving ||
                                    leaveEmployees[row.id]?.selected
                                  )
                                    return;
                                  handleEmployeeSelection(row.rowKey);
                                }}
                                className={`transition-colors duration-150 ${
                                  isSaving || leaveEmployees[row.id]?.selected
                                    ? "bg-default-50 cursor-not-allowed"
                                    : "cursor-pointer hover:bg-default-50"
                                } ${
                                  isSelected
                                    ? "bg-sky-50 hover:bg-sky-100"
                                    : "bg-white"
                                }`}
                              >
                                <td className="px-6 py-4 whitespace-nowrap align-middle">
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={!!isSelected}
                                      onChange={() =>
                                        handleEmployeeSelection(row.rowKey)
                                      }
                                      size={20}
                                      checkedColor="text-sky-600"
                                      ariaLabel={`Select employee ${row.name}`}
                                      buttonClassName="p-1 rounded-lg"
                                      disabled={
                                        isSaving ||
                                        leaveEmployees[row.id]?.selected
                                      }
                                    />
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-700">
                                  <Link
                                    to={`/catalogue/staff/${row.id}`}
                                    className="hover:underline hover:text-sky-600"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {row.id}
                                  </Link>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                                  {row.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                                  <Link
                                    to={`/catalogue/job?id=${row.jobType}`}
                                    className="hover:underline hover:text-sky-600"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {row.jobName}
                                  </Link>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="number"
                                      value={
                                        isSelected
                                          ? (bagCounts.muatMee || 0).toString()
                                          : ""
                                      }
                                      onChange={(e) =>
                                        handleBagCountChange(
                                          row.rowKey || "",
                                          "muatMee",
                                          e.target.value
                                        )
                                      }
                                      className="w-20 mx-auto py-1 text-sm text-right border rounded-md disabled:bg-default-100 disabled:text-default-400 disabled:cursor-not-allowed border-default-300"
                                      min="0"
                                      disabled={!isSelected}
                                      placeholder={isSelected ? "0" : "-"}
                                    />
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="number"
                                      value={
                                        isSelected
                                          ? (
                                              bagCounts.muatBihun || 0
                                            ).toString()
                                          : ""
                                      }
                                      onChange={(e) =>
                                        handleBagCountChange(
                                          row.rowKey || "",
                                          "muatBihun",
                                          e.target.value
                                        )
                                      }
                                      className="w-20 mx-auto py-1 text-sm text-right border rounded-md disabled:bg-default-100 disabled:text-default-400 disabled:cursor-not-allowed border-default-300"
                                      min="0"
                                      disabled={!isSelected}
                                      placeholder={isSelected ? "0" : "-"}
                                    />
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <div
                                    className="relative w-48 mx-auto"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Listbox
                                      value={selectedSalesman}
                                      onChange={(value) =>
                                        handleIkutChange(
                                          row.rowKey || "",
                                          value
                                        )
                                      }
                                    >
                                      <div className="relative">
                                        <ListboxButton
                                          className={`relative w-full pl-3 pr-8 py-1.5 text-center rounded-md border bg-white text-default-700 border-default-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500`}
                                        >
                                          <span className="block truncate text-sm">
                                            {selectedSalesman
                                              ? salesmanEmployees.find(
                                                  (s) =>
                                                    s.id === selectedSalesman
                                                )?.name || "Select Salesman"
                                              : "Select Salesman"}
                                          </span>
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                            <IconChevronDown
                                              className="w-4 h-4 text-default-400"
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
                                            className={`absolute z-10 w-full py-1 overflow-auto text-left text-sm bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none ${
                                              isLastRow
                                                ? "bottom-full mb-1"
                                                : "mt-1"
                                            }`}
                                          >
                                            <ListboxOption
                                              value=""
                                              className={({ active }) =>
                                                `${
                                                  active
                                                    ? "bg-default-100 text-default-900"
                                                    : "text-default-700"
                                                } cursor-pointer select-none relative py-1.5 pl-3 pr-8`
                                              }
                                            >
                                              <span className="block truncate">
                                                None
                                              </span>
                                            </ListboxOption>
                                            {salesmanEmployees
                                              .filter((s) =>
                                                employeeSelectionState.selectedJobs[
                                                  s.id
                                                ]?.includes(s.jobType)
                                              )
                                              .map((salesman) => (
                                                <ListboxOption
                                                  key={salesman.id}
                                                  value={salesman.id}
                                                  className={({ active }) =>
                                                    `${
                                                      active
                                                        ? "bg-sky-100 text-sky-900"
                                                        : "text-default-700"
                                                    } cursor-pointer select-none relative py-1.5 pl-3 pr-8`
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
                                                        {salesman.name}
                                                      </span>
                                                      {selected ? (
                                                        <span
                                                          className={`absolute inset-y-0 right-0 flex items-center pr-2 ${
                                                            active
                                                              ? "text-sky-600"
                                                              : "text-sky-500"
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
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <ActivitiesTooltip
                                      activities={(
                                        employeeActivities[row.rowKey || ""] ||
                                        []
                                      ).filter(
                                        (activity) => activity.isSelected
                                      )}
                                      employeeName={row.name}
                                      className={
                                        !isSelected
                                          ? "disabled:text-default-300 disabled:cursor-not-allowed"
                                          : ""
                                      }
                                      disabled={
                                        !isSelected ||
                                        leaveEmployees[row.id]?.selected
                                      }
                                      onClick={() =>
                                        handleManageActivities(row)
                                      }
                                    />
                                  </div>
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

        <div className="border-t border-default-200 pt-6 mt-8">
          <h2 className="text-lg font-semibold text-default-700 mb-2">
            Leave & Absence Recording
          </h2>
          <p className="text-sm text-default-500 mb-4">
            Select employees on paid leave.{" "}
            {formData.dayType === "Umum"
              ? "Cuti Umum is available on public holidays, "
              : ""}
            Cuti Sakit is available any day. Pay is based on regular day rates.
          </p>

          <div className="bg-white rounded-lg border shadow-sm">
            {availableForLeave.length === 0 ? (
              <div className="text-center py-10 px-6">
                <p className="text-sm text-default-500">
                  No employees available for leave.
                </p>
                <p className="text-xs text-default-400 mt-1">
                  Employees selected for work cannot be marked as on leave.
                </p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-default-200 table-fixed">
                <thead className="bg-default-50">
                  <tr>
                    <th scope="col" className="w-16 px-6 py-3 text-left">
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
                      className="w-1/3 px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                    >
                      Employee
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                    >
                      Leave Type
                    </th>
                    <th
                      scope="col"
                      className="w-48 px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-default-200">
                  {availableForLeave.map((employee) => {
                    const leaveOptions = [
                      { id: "cuti_sakit", name: "Cuti Sakit" },
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
                            ? "bg-default-50 cursor-not-allowed"
                            : "cursor-pointer"
                        } ${
                          isSelected
                            ? "bg-amber-50 hover:bg-amber-100/75"
                            : "bg-white hover:bg-default-100"
                        }`}
                        onClick={() => {
                          if (isSaving) return;
                          handleLeaveSelection(employee.id);
                        }}
                      >
                        <td className="w-16 px-6 py-4 whitespace-nowrap align-middle">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onChange={() => handleLeaveSelection(employee.id)}
                              size={20}
                              checkedColor="text-amber-600"
                              ariaLabel={`Select ${employee.name} for leave`}
                              buttonClassName="p-1 rounded-lg"
                              disabled={isSaving}
                            />
                          </div>
                        </td>
                        <td className="w-1/3 px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-default-900 truncate">
                            {employee.name}
                          </div>
                          <div className="text-xs text-default-500">
                            {employee.id}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div
                            className="w-full max-w-[180px]"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                                  className={`relative w-full pl-3 pr-8 py-2 text-left rounded-md border ${
                                    !isSelected || isSaving
                                      ? "bg-default-100 text-default-400 cursor-not-allowed border-default-200"
                                      : "bg-white text-default-700 border-default-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                                      className="w-4 h-4 text-default-400"
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
                                  <ListboxOptions className="absolute z-50 w-full py-1 mt-1 overflow-auto text-sm bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none">
                                    {leaveOptions.map((option) => (
                                      <ListboxOption
                                        key={option.id}
                                        value={option.id}
                                        className={({ active }) =>
                                          `${
                                            active
                                              ? "bg-amber-100 text-amber-900"
                                              : "text-default-700"
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
                        <td className="w-48 px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div onClick={(e) => e.stopPropagation()}>
                            <ActivitiesTooltip
                              activities={
                                isSelected && !isSaving
                                  ? (
                                      leaveEmployeeActivities[employee.id] || []
                                    ).filter((a: ActivityItem) => a.isSelected)
                                  : [] // Show no activities when disabled
                              }
                              employeeName={employee.name}
                              className={
                                !isSelected || isSaving
                                  ? "disabled:text-default-300 disabled:cursor-not-allowed"
                                  : ""
                              }
                              disabled={!isSelected || isSaving}
                              onClick={() =>
                                handleManageLeaveActivities(employee)
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="border-t border-default-200 pt-4 mt-4 flex justify-end space-x-3">
          <Button
            variant="outline"
            onClick={mode === "edit" && onCancel ? onCancel : handleBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            color="sky"
            variant="boldOutline"
            onClick={() => handleSaveForm()}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : mode === "edit" ? "Update" : "Save"}
          </Button>
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
            ? locationTypes[selectedEmployee.rowKey] || "Local"
            : "Local"
        }
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
      />
    </div>
  );
};

export default DailyLogEntryPage;

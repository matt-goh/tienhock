// src/pages/Payroll/PayrollPage.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconChevronsDown,
  IconChevronsUp,
  IconCash,
  IconUsers,
  IconRefresh,
  IconPlus,
  IconClock,
  IconArrowsSort,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  getMonthlyPayrollByYearMonth,
  getMonthName,
  createMonthlyPayroll,
  getEligibleEmployees,
  processMonthlyPayrolls,
  type PayrollProcessEmployeeSelection,
} from "../../utils/payroll/payrollUtils";
import { formatDistanceToNow } from "date-fns";
import MissingIncomeTaxRatesDialog, {
  MissingIncomeTaxEmployee,
} from "../../components/Payroll/MissingIncomeTaxRatesDialog";
import toast from "react-hot-toast";
import { EmployeePayroll, MonthlyPayroll } from "../../types/types";
import { PrintBatchPayslipsButton } from "../../utils/payroll/PayslipButtons";
import {
  getBatchMidMonthPayrolls,
  MidMonthPayroll,
} from "../../utils/payroll/midMonthPayrollUtils";
import { createMidMonthPayrollsMap } from "../../utils/payroll/PayslipManager";
import MonthNavigator from "../../components/MonthNavigator";
import PayrollUnifiedTable from "../../components/Payroll/PayrollUnifiedTable";
import PayrollSectionPrintMenu from "../../components/Payroll/PayrollSectionPrintMenu";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import {
  readLastAccessedPayrollMonth,
  saveLastAccessedPayrollMonth,
} from "../../utils/payroll/payrollPageStorage";

const FIRST_WEEK_DAY_OF_MONTH: number = 7;
const EXPANDED_JOBS_STORAGE_PREFIX: string = "payroll-expanded-jobs:";
const SEARCH_TERM_STORAGE_KEY: string = "payroll-search-term";
const CLEAR_SEARCH_ON_RETURN_STORAGE_KEY: string =
  "payroll-clear-search-on-return";
const CLEAR_SEARCH_ON_RETURN_WINDOW_MS: number = 10000;
// Persisted choice of how the payroll list is displayed.
//  - "groups": employees grouped by job, groups ordered by recency
//  - "recent": flat list of all employees ordered by recency
const VIEW_MODE_STORAGE_KEY: string = "payroll-view-mode";
type PayrollViewMode = "groups" | "recent";
// Per-month map of employee_id -> last-opened timestamp (ms). Drives the
// "recently accessed" ordering; falls back to the processed/created time.
const OPEN_RECENCY_STORAGE_PREFIX: string = "payroll-open-recency:";

const readViewModeFromStorage = (): PayrollViewMode => {
  try {
    const stored: string | null = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === "recent" ? "recent" : "groups";
  } catch {
    return "groups";
  }
};

const saveViewModeToStorage = (mode: PayrollViewMode): void => {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures so the payroll page remains usable.
  }
};

const readOpenRecencyFromStorage = (
  storageKey: string
): Record<string, number> => {
  try {
    const stored: string | null = localStorage.getItem(storageKey);
    if (!stored) return {};

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, number>>(
      (valid, [employeeId, timestamp]) => {
        if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
          valid[employeeId] = timestamp;
        }
        return valid;
      },
      {}
    );
  } catch {
    return {};
  }
};

const saveOpenRecencyToStorage = (
  storageKey: string,
  recency: Record<string, number>
): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(recency));
  } catch {
    // Ignore storage failures so the payroll page remains usable.
  }
};

// Processed/created time (ms) used as the recency fallback for never-opened rows.
const getProcessedTime = (
  employeePayroll: Pick<EmployeePayroll, "updated_at" | "created_at">
): number => {
  const source: string | undefined =
    employeePayroll.updated_at ?? employeePayroll.created_at;
  if (!source) return 0;
  const parsed: number = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDefaultPayrollMonth = (today: Date = new Date()): Date => {
  const monthOffset: number =
    today.getDate() <= FIRST_WEEK_DAY_OF_MONTH ? -1 : 0;

  return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
};

const getPayrollJobGroupKey = (jobType: string): string => {
  return jobType.includes(", ") ? `Grouped: ${jobType}` : jobType;
};

const readExpandedJobsFromStorage = (
  storageKey: string
): Record<string, boolean> | null => {
  try {
    const storedExpandedJobs: string | null = sessionStorage.getItem(storageKey);
    if (!storedExpandedJobs) return null;

    const parsedExpandedJobs: unknown = JSON.parse(storedExpandedJobs);
    if (
      !parsedExpandedJobs ||
      typeof parsedExpandedJobs !== "object" ||
      Array.isArray(parsedExpandedJobs)
    ) {
      return null;
    }

    return Object.entries(parsedExpandedJobs).reduce<Record<string, boolean>>(
      (validExpandedJobs: Record<string, boolean>, [jobType, isExpanded]) => {
        if (typeof isExpanded === "boolean") {
          validExpandedJobs[jobType] = isExpanded;
        }

        return validExpandedJobs;
      },
      {}
    );
  } catch {
    return null;
  }
};

const saveExpandedJobsToStorage = (
  storageKey: string,
  expandedJobs: Record<string, boolean>
): void => {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(expandedJobs));
  } catch {
    // Ignore storage failures so the payroll page remains usable.
  }
};

const readSearchTermFromStorage = (): string => {
  try {
    const clearSearchMarkedAt: string | null = sessionStorage.getItem(
      CLEAR_SEARCH_ON_RETURN_STORAGE_KEY
    );
    sessionStorage.removeItem(CLEAR_SEARCH_ON_RETURN_STORAGE_KEY);

    if (clearSearchMarkedAt) {
      const markedAt: number = Number(clearSearchMarkedAt);
      const isRecentClearRequest: boolean =
        Number.isFinite(markedAt) &&
        Date.now() - markedAt <= CLEAR_SEARCH_ON_RETURN_WINDOW_MS;

      if (isRecentClearRequest) {
        sessionStorage.removeItem(SEARCH_TERM_STORAGE_KEY);
        return "";
      }
    }

    const storedSearchTerm: string | null =
      sessionStorage.getItem(SEARCH_TERM_STORAGE_KEY);

    return storedSearchTerm ?? "";
  } catch {
    return "";
  }
};

const saveSearchTermToStorage = (searchTerm: string): void => {
  try {
    if (searchTerm) {
      sessionStorage.setItem(SEARCH_TERM_STORAGE_KEY, searchTerm);
    } else {
      sessionStorage.removeItem(SEARCH_TERM_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures so the payroll page remains usable.
  }
};

const buildExpandedJobsState = (
  employeePayrolls: Array<Pick<EmployeePayroll, "job_type">>,
  savedExpandedJobs: Record<string, boolean> | null
): Record<string, boolean> => {
  const expandedJobs: Record<string, boolean> = {};

  employeePayrolls.forEach(
    (employeePayroll: Pick<EmployeePayroll, "job_type">) => {
      const groupKey: string = getPayrollJobGroupKey(employeePayroll.job_type);
      expandedJobs[groupKey] = savedExpandedJobs?.[groupKey] ?? true;
    }
  );

  return expandedJobs;
};

const PayrollPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize with URL params, then the last accessed payroll month, then the payroll working month.
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (yearParam && monthParam) {
      const year = parseInt(yearParam);
      const month = parseInt(monthParam);

      // Validate the params
      if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        return new Date(year, month - 1); // month is 0-indexed in Date
      }
    }

    return readLastAccessedPayrollMonth() ?? getDefaultPayrollMonth();
  });
  const [payroll, setPayroll] = useState<MonthlyPayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<PayrollViewMode>(
    readViewModeFromStorage
  );
  const [openRecency, setOpenRecency] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState<string>(
    readSearchTermFromStorage
  );
  const [selectedEmployeePayrolls, setSelectedEmployeePayrolls] = useState<
    Record<string, boolean>
  >({});
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [midMonthPayrollsMap, setMidMonthPayrollsMap] = useState<
    Record<string, MidMonthPayroll | null>
  >({});
  const [isFetchingMidMonth, setIsFetchingMidMonth] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hasFocusedSearchOnInitialReadyRef = useRef<boolean>(false);

  const handleClearSearchMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
  };

  const handleClearSearch = (): void => {
    setSearchTerm("");
    searchInputRef.current?.focus();
  };

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{
    current: number;
    total: number;
    stage: string;
  }>({ current: 0, total: 0, stage: "" });
  const [showMissingTaxDialog, setShowMissingTaxDialog] = useState(false);
  const [missingIncomeTaxEmployees, setMissingIncomeTaxEmployees] = useState<
    MissingIncomeTaxEmployee[]
  >([]);
  // The employee payroll row currently being processed via its per-row button
  // (drives the inline spinner on that row).
  const [processingEmployeePayrollId, setProcessingEmployeePayrollId] =
    useState<number | null>(null);

  // Preserve scroll position when returning to this page (e.g. from an
  // employee payroll details page). Keyed by year-month so switching months
  // doesn't restore a stale position from a different month.
  const scrollKey = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    return `payroll-page:${year}-${month}`;
  }, [selectedMonth]);
  const expandedJobsStorageKey = useMemo(() => {
    return `${EXPANDED_JOBS_STORAGE_PREFIX}${scrollKey}`;
  }, [scrollKey]);
  const openRecencyStorageKey = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    return `${OPEN_RECENCY_STORAGE_PREFIX}${year}-${month}`;
  }, [selectedMonth]);

  // Load the per-month "recently opened" map so both views can order by it.
  useEffect(() => {
    setOpenRecency(readOpenRecencyFromStorage(openRecencyStorageKey));
  }, [openRecencyStorageKey]);

  // Persist the selected view (Groups / Recent) across visits.
  useEffect(() => {
    saveViewModeToStorage(viewMode);
  }, [viewMode]);

  useScrollRestoration(
    scrollKey,
    !isLoading && !!payroll,
    '[data-scroll-container="payroll-list"]'
  );

  useEffect(() => {
    if (hasFocusedSearchOnInitialReadyRef.current || isLoading || !payroll) {
      return;
    }

    const searchInputElement: HTMLInputElement | null = searchInputRef.current;
    if (!searchInputElement) return;

    hasFocusedSearchOnInitialReadyRef.current = true;
    searchInputElement.focus();

    const searchValueLength: number = searchInputElement.value.length;
    searchInputElement.setSelectionRange(searchValueLength, searchValueLength);
  }, [isLoading, payroll]);

  // Handler to update selected month and URL params
  const handleMonthChange = useCallback((newMonth: Date): void => {
    setSelectedMonth(newMonth);

    const year = newMonth.getFullYear();
    const month = newMonth.getMonth() + 1; // Convert to 1-indexed

    setSearchParams({ year: year.toString(), month: month.toString() });
  }, [setSearchParams]);

  // Set initial URL params if not present
  useEffect(() => {
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (!yearParam || !monthParam) {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth() + 1;
      setSearchParams({ year: year.toString(), month: month.toString() }, { replace: true });
    }
  }, []); // Run only on mount

  // Sync URL params to state (handles browser back/forward)
  useEffect(() => {
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (yearParam && monthParam) {
      const year = parseInt(yearParam);
      const month = parseInt(monthParam);

      if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        const urlDate = new Date(year, month - 1);
        const currentDate = selectedMonth;

        // Only update if different
        if (urlDate.getFullYear() !== currentDate.getFullYear() ||
            urlDate.getMonth() !== currentDate.getMonth()) {
          setSelectedMonth(urlDate);
        }
      }
    }
  }, [searchParams]);

  // Remember the selected month for future visits without overriding shared URLs.
  useEffect(() => {
    saveLastAccessedPayrollMonth(selectedMonth);
  }, [selectedMonth]);

  // Fetch payroll when selected month changes
  useEffect(() => {
    fetchPayrollDetails();
  }, [selectedMonth]);

  const fetchPayrollDetails = async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1; // JavaScript months are 0-indexed

    setIsLoading(true);
    try {
      const response = await getMonthlyPayrollByYearMonth(year, month);
      setPayroll(response);

      if (response?.employeePayrolls) {
        const savedExpandedJobs: Record<string, boolean> | null =
          readExpandedJobsFromStorage(expandedJobsStorageKey);

        setExpandedJobs(
          buildExpandedJobsState(response.employeePayrolls, savedExpandedJobs)
        );
      } else {
        setExpandedJobs({});
      }
    } catch (error) {
      console.error("Error fetching payroll details:", error);
      toast.error("Failed to load payroll details");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMidMonthPayrollsForSelected = async () => {
    const selectedPayrolls = getSelectedPayrolls();
    if (!payroll || selectedPayrolls.length === 0) return null;

    setIsFetchingMidMonth(true);
    try {
      const employeeIds = selectedPayrolls.map((emp) => emp.employee_id);
      const midMonthPayrolls = await getBatchMidMonthPayrolls(
        employeeIds,
        payroll.year,
        payroll.month
      );

      const payrollsMap = createMidMonthPayrollsMap(
        midMonthPayrolls,
        employeeIds
      );
      setMidMonthPayrollsMap(payrollsMap);
      return payrollsMap;
    } catch (error) {
      console.error("Error fetching mid-month payrolls:", error);
      return null;
    } finally {
      setIsFetchingMidMonth(false);
    }
  };

  const getFilteredEmployees = useCallback(
    (jobType: string, employees: EmployeePayroll[]) => {
      if (!searchTerm) return employees;

      return employees.filter((emp) => {
        return (
          emp.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    },
    [searchTerm]
  );

  const handleToggleJobExpansion = (jobType: string): void => {
    const nextExpandedJobs: Record<string, boolean> = {
      ...expandedJobs,
      [jobType]: !expandedJobs[jobType],
    };

    saveExpandedJobsToStorage(expandedJobsStorageKey, nextExpandedJobs);
    setExpandedJobs(nextExpandedJobs);
  };

  const groupEmployeesByJobType = (
    employeePayrolls: EmployeePayroll[]
  ): Record<string, EmployeePayroll[]> => {
    const grouped: Record<string, EmployeePayroll[]> = {};

    employeePayrolls.forEach((employeePayroll) => {
      const { job_type } = employeePayroll;

      const groupKey: string = getPayrollJobGroupKey(job_type);

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(employeePayroll);
    });

    return grouped;
  };

  // Handle creating a new payroll for the selected month
  const handleCreatePayroll = async () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    setIsCreating(true);
    try {
      await createMonthlyPayroll(year, month);
      toast.success("Payroll created successfully");
      // Fetch the newly created payroll
      await fetchPayrollDetails();
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 409) {
        toast.error("A payroll already exists for this month");
        // Refetch to get the existing payroll
        await fetchPayrollDetails();
      } else {
        toast.error("Failed to create payroll");
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Get selected payrolls as array
  const getSelectedPayrolls = useCallback(() => {
    if (!payroll?.employeePayrolls) return [];

    // Filter out any potentially invalid payrolls
    return payroll.employeePayrolls
      .filter((emp) => selectedEmployeePayrolls[`${emp.id}`])
      .map((emp) => ({
        ...emp,
        items: emp.items || [], // Ensure items is always at least an empty array
      }));
  }, [payroll?.employeePayrolls, selectedEmployeePayrolls, searchTerm]);

  const getVisibleEmployeePayrolls = (): EmployeePayroll[] => {
    if (!payroll?.employeePayrolls) return [];

    const grouped: Record<string, EmployeePayroll[]> = groupEmployeesByJobType(
      payroll.employeePayrolls
    );

    return Object.entries(grouped).flatMap(([jobType, employees]) =>
      getFilteredEmployees(jobType, employees)
    );
  };

  // Calculate selected count
  const selectedCount = useMemo(
    () => Object.values(selectedEmployeePayrolls).filter(Boolean).length,
    [selectedEmployeePayrolls]
  );

  useEffect(() => {
    // Only fetch if we have selections and we're not already fetching
    const selectedPayrolls = getSelectedPayrolls();
    if (selectedPayrolls.length > 0 && !isFetchingMidMonth) {
      fetchMidMonthPayrollsForSelected();
    }
  }, [selectedCount]);

  // Handle employee selection
  const handleSelectEmployee = (
    employeeId: number,
    isSelected: boolean,
    event: React.MouseEvent<Element, MouseEvent>
  ) => {
    event.stopPropagation();
    setSelectedEmployeePayrolls((prev) => ({
      ...prev,
      [`${employeeId}`]: isSelected,
    }));
  };

  // Handle select all employees
  const handleSelectAll = useCallback(() => {
    if (!payroll?.employeePayrolls) return;

    const visibleEmployees: EmployeePayroll[] = getVisibleEmployeePayrolls();
    if (visibleEmployees.length === 0) return;

    // If all visible employees are selected, deselect visible employees.
    const allSelected = visibleEmployees.every(
      (emp) => selectedEmployeePayrolls[`${emp.id}`]
    );

    const newSelectedEmployees: Record<string, boolean> = {
      ...selectedEmployeePayrolls,
    };

    if (allSelected) {
      visibleEmployees.forEach((emp) => {
        newSelectedEmployees[`${emp.id}`] = false;
      });
    } else {
      visibleEmployees.forEach((emp) => {
        newSelectedEmployees[`${emp.id}`] = true;
      });
    }

    setSelectedEmployeePayrolls(newSelectedEmployees);
  }, [payroll?.employeePayrolls, selectedEmployeePayrolls]);

  useEffect(() => {
    if (!payroll?.employeePayrolls) {
      setIsAllSelected(false);
      return;
    }

    const visibleEmployees: EmployeePayroll[] = getVisibleEmployeePayrolls();
    if (visibleEmployees.length === 0) {
      setIsAllSelected(false);
      return;
    }

    const allSelected = visibleEmployees.every(
      (emp) => selectedEmployeePayrolls[`${emp.id}`]
    );

    setIsAllSelected(allSelected);
  }, [payroll?.employeePayrolls, selectedEmployeePayrolls, searchTerm]);

  // Handle job group selection (select all in group)
  const handleSelectJobGroup = (jobType: string, isSelected: boolean) => {
    const newSelectedEmployees = { ...selectedEmployeePayrolls };

    const employees = groupedEmployees[jobType] || [];
    const filteredEmployees = getFilteredEmployees(jobType, employees);

    filteredEmployees.forEach((emp) => {
      newSelectedEmployees[`${emp.id}`] = isSelected;
    });

    setSelectedEmployeePayrolls(newSelectedEmployees);
  };

  // Reset selections when filters change
  useEffect(() => {
    setSelectedEmployeePayrolls({});
  }, [searchTerm]);

  useEffect(() => {
    saveSearchTermToStorage(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;

      const tagName = target.tagName.toLowerCase();
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      );
    };

    const handleSearchTypingShortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        !searchInputRef.current ||
        showMissingTaxDialog ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
      setSearchTerm((prev) => `${prev}${event.key}`);
    };

    document.addEventListener("keydown", handleSearchTypingShortcut);
    return () => {
      document.removeEventListener("keydown", handleSearchTypingShortcut);
    };
  }, [showMissingTaxDialog]);

  const handleToggleAllJobs = (expanded: boolean): void => {
    if (!payroll?.employeePayrolls) return;

    const newExpanded: Record<string, boolean> = {};
    payroll.employeePayrolls.forEach((employeePayroll: EmployeePayroll) => {
      const groupKey: string = getPayrollJobGroupKey(employeePayroll.job_type);

      newExpanded[groupKey] = expanded;
    });

    saveExpandedJobsToStorage(expandedJobsStorageKey, newExpanded);
    setExpandedJobs(newExpanded);
  };

  const calculateTotals = (employeePayrolls: EmployeePayroll[]) => {
    return employeePayrolls.reduce(
      (acc, curr) => {
        const netPay = parseFloat(curr.net_pay.toString());
        // Stored "Setelah Digenapkan" = take-home, with commission/bonus advances
        // already deducted (same as the Net column below).
        const takeHome =
          curr.setelah_digenapkan != null
            ? parseFloat(curr.setelah_digenapkan.toString())
            : Math.ceil(netPay);
        const digenapkan =
          curr.digenapkan != null ? parseFloat(curr.digenapkan.toString()) : 0;
        const advance =
          curr.commission_advance != null
            ? parseFloat(curr.commission_advance.toString())
            : 0;
        // Salary Report "Setelah Digenapkan": add the advances back so the figure
        // reflects total earned salary. (takeHome - digenapkan) recovers the
        // pre-rounding jumlah (net - mid-month); re-round after adding advances.
        const setelahDigenapkan = Math.ceil(takeHome - digenapkan + advance);
        return {
          grossPay: acc.grossPay + parseFloat(curr.gross_pay.toString()),
          netPay: acc.netPay + netPay,
          takeHome: acc.takeHome + takeHome,
          advances: acc.advances + advance,
          setelahDigenapkan: acc.setelahDigenapkan + setelahDigenapkan,
        };
      },
      { grossPay: 0, netPay: 0, takeHome: 0, advances: 0, setelahDigenapkan: 0 }
    );
  };

  const handleViewEmployeePayroll = (employeePayrollId: number | undefined) => {
    // Record the open so this employee (and its group) floats to the top of the
    // recency-ordered views on return.
    if (employeePayrollId != null) {
      const updatedRecency: Record<string, number> = {
        ...openRecency,
        [`${employeePayrollId}`]: Date.now(),
      };
      setOpenRecency(updatedRecency);
      saveOpenRecencyToStorage(openRecencyStorageKey, updatedRecency);
    }
    navigate(`/payroll/employee-payroll/${employeePayrollId}`);
  };

  // Recency used to order both views: last-opened time if available, otherwise
  // the processed/created time. Newer (larger) sorts first.
  const getEmployeeRecency = useCallback(
    (employeePayroll: EmployeePayroll): number => {
      const opened: number | undefined =
        employeePayroll.id != null
          ? openRecency[`${employeePayroll.id}`]
          : undefined;
      return opened ?? getProcessedTime(employeePayroll);
    },
    [openRecency]
  );

  const splitPayrollJobTypes = (jobType: string): string[] => {
    return jobType
      .split(",")
      .map((value: string) => value.trim())
      .filter((value: string) => value.length > 0);
  };

  const buildProcessCombinationsFromPayrolls = (
    employeePayrolls: EmployeePayroll[]
  ): PayrollProcessEmployeeSelection[] => {
    const combinations: PayrollProcessEmployeeSelection[] = [];
    const seenCombinations: Set<string> = new Set();

    const addCombination = (employeeId: string, jobType: string): void => {
      if (!employeeId || !jobType) return;

      const key: string = `${employeeId}::${jobType}`;
      if (seenCombinations.has(key)) return;

      seenCombinations.add(key);
      combinations.push({ employeeId, jobType });
    };

    employeePayrolls.forEach((employeePayroll: EmployeePayroll) => {
      const employeeJobMapping: Record<string, string> | undefined =
        employeePayroll.employee_job_mapping;

      if (
        employeeJobMapping &&
        typeof employeeJobMapping === "object" &&
        Object.keys(employeeJobMapping).length > 0
      ) {
        Object.entries(employeeJobMapping).forEach(
          ([employeeId, mappedJobType]: [string, string]) => {
            splitPayrollJobTypes(mappedJobType).forEach((jobType: string) => {
              addCombination(employeeId, jobType);
            });
          }
        );
        return;
      }

      splitPayrollJobTypes(employeePayroll.job_type).forEach(
        (jobType: string) => {
          addCombination(employeePayroll.employee_id, jobType);
        }
      );
    });

    return combinations;
  };

  const buildProcessCombinationsFromEligibleData = (
    jobEmployeeMap: Record<string, string[]>
  ): PayrollProcessEmployeeSelection[] => {
    const combinations: PayrollProcessEmployeeSelection[] = [];

    Object.entries(jobEmployeeMap).forEach(([jobType, employeeIds]) => {
      employeeIds.forEach((employeeId: string) => {
        combinations.push({ employeeId, jobType });
      });
    });

    return combinations;
  };

  const processPayrollCombinations = async (
    selectedCombinations: PayrollProcessEmployeeSelection[],
    pruneUnselected: boolean,
    emptyMessage: string
  ): Promise<void> => {
    if (!payroll?.id) return;

    if (selectedCombinations.length === 0) {
      toast.error(emptyMessage);
      return;
    }

    setProcessingProgress({
      current: 30,
      total: 100,
      stage: `Processing ${selectedCombinations.length} employee-job combinations...`,
    });

    const response = await processMonthlyPayrolls(payroll.id, {
      selected_employees: selectedCombinations,
      prune_unselected: pruneUnselected,
    });

    setProcessingProgress({
      current: 90,
      total: 100,
      stage: "Finalizing...",
    });

    if (response.missing_income_tax_employees?.length > 0) {
      setMissingIncomeTaxEmployees(response.missing_income_tax_employees);
      setShowMissingTaxDialog(true);
    }

    if (response.errors?.length > 0) {
      toast.error(`Processed with ${response.errors.length} errors`);
    } else {
      toast.success(
        `Successfully processed ${response.processed_count} employees`
      );
    }

    await fetchPayrollDetails();

    if (response.updated_at) {
      setPayroll((prev) =>
        prev ? { ...prev, updated_at: response.updated_at } : prev
      );
    }
  };

  // Handle processing all eligible employees
  const handleProcessAll = async () => {
    if (!payroll?.id || isProcessing) return;

    setIsProcessing(true);
    setProcessingProgress({
      current: 10,
      total: 100,
      stage:
        searchTerm.trim().length > 0
          ? "Preparing shown employees..."
          : "Fetching eligible employees...",
    });

    try {
      if (searchTerm.trim().length > 0) {
        const selectedCombinations: PayrollProcessEmployeeSelection[] =
          buildProcessCombinationsFromPayrolls(getVisibleEmployeePayrolls());

        await processPayrollCombinations(
          selectedCombinations,
          false,
          "No visible employees found for processing"
        );
      } else {
        const eligibleData = await getEligibleEmployees(payroll.id);
        const selectedCombinations: PayrollProcessEmployeeSelection[] =
          buildProcessCombinationsFromEligibleData(eligibleData.jobEmployeeMap);

        await processPayrollCombinations(
          selectedCombinations,
          true,
          "No eligible employees found for processing"
        );
      }
    } catch (error) {
      console.error("Error processing payroll:", error);
      toast.error("Failed to process payroll");
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0, stage: "" });
    }
  };

  const handleProcessSelected = async () => {
    if (!payroll?.id || isProcessing) return;

    setIsProcessing(true);
    setProcessingProgress({
      current: 10,
      total: 100,
      stage: "Preparing selected employees...",
    });

    try {
      const selectedCombinations: PayrollProcessEmployeeSelection[] =
        buildProcessCombinationsFromPayrolls(getSelectedPayrolls());

      await processPayrollCombinations(
        selectedCombinations,
        false,
        "No selected employees found for processing"
      );
    } catch (error) {
      console.error("Error processing selected payrolls:", error);
      toast.error("Failed to process selected payrolls");
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0, stage: "" });
    }
  };

  // Re-process a single employee straight from its row.
  const handleProcessEmployee = async (
    employeePayroll: EmployeePayroll
  ): Promise<void> => {
    if (!payroll?.id || isProcessing) return;

    setProcessingEmployeePayrollId(employeePayroll.id ?? null);
    setIsProcessing(true);
    setProcessingProgress({
      current: 10,
      total: 100,
      stage: `Processing ${employeePayroll.employee_name ?? "employee"}...`,
    });

    try {
      const combinations: PayrollProcessEmployeeSelection[] =
        buildProcessCombinationsFromPayrolls([employeePayroll]);

      await processPayrollCombinations(
        combinations,
        false,
        "No employee found for processing"
      );
    } catch (error) {
      console.error("Error processing employee payroll:", error);
      toast.error("Failed to process employee");
    } finally {
      setIsProcessing(false);
      setProcessingEmployeePayrollId(null);
      setProcessingProgress({ current: 0, total: 0, stage: "" });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Currency without the "RM" prefix, for compact header stats.
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Check if all employees in a job group are selected
  const isJobGroupSelected = useCallback(
    (jobType: string) => {
      if (!payroll) return false;

      const grouped = groupEmployeesByJobType(payroll.employeePayrolls || []);
      const employees = grouped[jobType] || [];
      const filteredEmployees = getFilteredEmployees(jobType, employees);

      if (filteredEmployees.length === 0) return false;

      return filteredEmployees.every(
        (emp) => selectedEmployeePayrolls[`${emp.id}`]
      );
    },
    [payroll, getFilteredEmployees, selectedEmployeePayrolls]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!payroll) {
    const displayYear = selectedMonth.getFullYear();
    const displayMonth = selectedMonth.getMonth() + 1;
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden">
          {/* Header with Month Navigator */}
          <div className="px-6 py-4 border-b border-default-100 dark:border-gray-700 bg-default-50 dark:bg-gray-900/50">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
              pickerPlacement="bottom-left-button"
            />
          </div>

          {/* Empty State Content */}
          <div className="flex flex-col items-center justify-center py-16 px-6">
            {/* Icon Container */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/30 dark:to-sky-800/30 flex items-center justify-center mb-6 shadow-sm">
              <IconCash size={36} className="text-sky-400 dark:text-sky-300" strokeWidth={1.5} />
            </div>

            {/* Text Content */}
            <h3 className="text-lg font-semibold text-default-700 dark:text-gray-200 mb-2">
              No Payroll Yet
            </h3>
            <p className="text-default-400 dark:text-gray-400 text-center max-w-sm mb-6">
              There's no payroll record for{" "}
              <span className="font-medium text-default-600 dark:text-gray-300">
                {getMonthName(displayMonth)} {displayYear}
              </span>
              . Create one to start processing employee payments.
            </p>

            {/* Create Button */}
            <Button
              onClick={handleCreatePayroll}
              icon={IconPlus}
              color="sky"
              disabled={isCreating}
              size="md"
            >
              {isCreating ? "Creating..." : "Create Payroll"}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  const groupedEmployees = groupEmployeesByJobType(
    payroll.employeePayrolls || []
  );
  const visibleEmployeePayrolls: EmployeePayroll[] = getVisibleEmployeePayrolls();
  const hasActiveSearch: boolean = searchTerm.trim().length > 0;
  const totals = calculateTotals(payroll.employeePayrolls || []);
  const processButtonText: string =
    hasActiveSearch && visibleEmployeePayrolls.length > 0
      ? `Process ${visibleEmployeePayrolls.length} shown`
      : payroll.employeePayrolls.length > 0 && payroll.updated_at
        ? formatDistanceToNow(new Date(payroll.updated_at), {
            addSuffix: true,
          })
        : "Process";

  // Check if all jobs are expanded
  const areAllJobsExpanded =
    Object.keys(groupedEmployees).length > 0 &&
    Object.keys(groupedEmployees).every((jobType) => expandedJobs[jobType]);

  // Groups view: order groups by their most recently opened/processed member,
  // then by total net pay as a tiebreak.
  const sortedJobGroups = Object.entries(groupedEmployees)
    .map(([jobType, employees]) => ({
      jobType,
      employees: getFilteredEmployees(jobType, employees),
    }))
    .filter((group) => group.employees.length > 0)
    .sort((groupA, groupB) => {
      const recencyA = Math.max(0, ...groupA.employees.map(getEmployeeRecency));
      const recencyB = Math.max(0, ...groupB.employees.map(getEmployeeRecency));
      if (recencyB !== recencyA) return recencyB - recencyA;
      const netA = groupA.employees.reduce(
        (sum, emp) => sum + parseFloat(emp.net_pay.toString()),
        0
      );
      const netB = groupB.employees.reduce(
        (sum, emp) => sum + parseFloat(emp.net_pay.toString()),
        0
      );
      return netB - netA;
    });

  // Recent view: flat list ordered by recency, then net pay.
  const sortedFlatEmployees = [...visibleEmployeePayrolls].sort(
    (employeeA, employeeB) => {
      const recencyA = getEmployeeRecency(employeeA);
      const recencyB = getEmployeeRecency(employeeB);
      if (recencyB !== recencyA) return recencyB - recencyA;
      return (
        parseFloat(employeeB.net_pay.toString()) -
        parseFloat(employeeA.net_pay.toString())
      );
    }
  );

  return (
    <div className="space-y-3">
      {/* Processing Progress Display */}
      {isProcessing && (
        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg p-4">
          <div className="flex items-center mb-3">
            <IconClock className="text-sky-500 dark:text-sky-400 mr-3" size={24} />
            <div className="flex-1">
              <h3 className="font-medium text-sky-800 dark:text-sky-200">Processing Payroll</h3>
              <p className="text-sm text-sky-600 dark:text-sky-400">
                {processingProgress.stage ||
                  "Please wait while employee payrolls are being calculated..."}
              </p>
            </div>
          </div>
          {processingProgress.total > 0 && (
            <div className="w-full bg-sky-200 dark:bg-sky-900 rounded-full h-2">
              <div
                className="bg-sky-500 dark:bg-sky-400 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${processingProgress.current}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Enhanced Employee Payrolls Section */}
      <div>
        {/* Header Row */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2 mb-3">
          {/* Left side: Month Navigator + Stats (stats wrap under on md and below) */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
              size="sm"
              pickerPlacement="bottom-left-button"
            />
            {/* Compact Stats */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5">
                <IconUsers size={16} className="text-sky-600 dark:text-sky-400" />
                <span className="font-medium text-default-700 dark:text-gray-200">
                  {payroll.employeePayrolls.length}
                </span>
              </div>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <div className="flex items-center gap-1.5">
                <IconCash size={16} className="text-emerald-600 dark:text-emerald-400" />
                <span
                  className="font-semibold text-emerald-700 dark:text-emerald-300"
                  title={`Setelah Digenapkan (${formatCurrency(
                    totals.setelahDigenapkan
                  )}) = total earned salary. The Net column below shows take-home (${formatCurrency(
                    totals.takeHome
                  )}), which has ${formatCurrency(
                    totals.advances
                  )} of commission/bonus advances already paid out deducted.`}
                >
                  {formatAmount(totals.setelahDigenapkan)}
                </span>
                {totals.advances > 0 && (
                  <span className="text-xs text-default-400 dark:text-gray-500">
                    ({formatAmount(totals.takeHome)} +{" "}
                    {formatAmount(totals.advances)})
                  </span>
                )}
              </div>
              <span className="text-default-300 dark:text-gray-600">|</span>
              <button
                onClick={() =>
                  setViewMode((mode) =>
                    mode === "groups" ? "recent" : "groups"
                  )
                }
                className="inline-flex items-center gap-1.5 text-default-500 dark:text-gray-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                title={
                  viewMode === "groups"
                    ? "Showing Groups (employees grouped by job, most recently opened group first). Click to switch to Recent."
                    : "Showing Recent (flat list, most recently opened employee first). Click to switch to Groups."
                }
              >
                <IconArrowsSort size={14} />
                <span>{viewMode === "groups" ? "Groups" : "Recent"}</span>
              </button>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <button
                onClick={handleProcessAll}
                disabled={
                  isProcessing ||
                  (hasActiveSearch && visibleEmployeePayrolls.length === 0)
                }
                className="inline-flex items-center gap-1.5 text-default-400 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors disabled:opacity-50"
                title={
                  hasActiveSearch
                    ? "Process employees shown by the search"
                    : "Re-process payroll"
                }
              >
                <IconRefresh
                  size={14}
                  className={isProcessing ? "animate-spin" : ""}
                />
                <span>{processButtonText}</span>
              </button>
            </div>
          </div>

          {/* Right side: Action Buttons */}
          <div className="flex space-x-2">
            {selectedCount > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  color="sky"
                  icon={IconRefresh}
                  onClick={handleProcessSelected}
                  disabled={isProcessing || selectedCount === 0}
                >
                  Process {selectedCount}
                </Button>
                {!isAllSelected && (
                  <PrintBatchPayslipsButton
                    payrolls={getSelectedPayrolls()}
                    size="sm"
                    variant="outline"
                    color="sky"
                    buttonText={
                      isFetchingMidMonth
                        ? "Loading..."
                        : `${selectedCount} Payslips`
                    }
                    disabled={isFetchingMidMonth || selectedCount === 0}
                    midMonthPayrollsMap={midMonthPayrollsMap}
                  />
                )}
              </>
            )}
            <PayrollSectionPrintMenu
              payrolls={payroll.employeePayrolls || []}
              midMonthPayrollsMap={midMonthPayrollsMap}
              size="sm"
              disabled={isFetchingMidMonth}
              buttonLabel={
                isFetchingMidMonth
                  ? "Loading..."
                  : "Payslips"
              }
            />
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 w-[154px] placeholder-gray-400 dark:placeholder-gray-500"
              />
              {searchTerm && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300 transition-colors"
                  onMouseDown={handleClearSearchMouseDown}
                  onClick={handleClearSearch}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            {/* Expand/collapse all only makes sense in the grouped view */}
            {viewMode === "groups" && (
              <Button
                size="sm"
                variant="outline"
                icon={areAllJobsExpanded ? IconChevronsUp : IconChevronsDown}
                onClick={() => handleToggleAllJobs(!areAllJobsExpanded)}
              ></Button>
            )}
          </div>
        </div>

        {Object.keys(groupedEmployees).length === 0 ? (
          <div className="text-center py-8 border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <p className="text-default-500 dark:text-gray-400">No employee payrolls found.</p>
            <Button
              onClick={handleProcessAll}
              color="sky"
              variant="outline"
              className="mt-4"
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Process Payroll"}
            </Button>
          </div>
        ) : viewMode === "recent" ? (
          <PayrollUnifiedTable
            variant="flat"
            flatEmployees={sortedFlatEmployees}
            expandedJobs={expandedJobs}
            onToggleExpand={handleToggleJobExpansion}
            isJobGroupSelected={isJobGroupSelected}
            onSelectGroup={handleSelectJobGroup}
            selectedEmployeePayrolls={selectedEmployeePayrolls}
            onSelectEmployee={handleSelectEmployee}
            onViewDetails={handleViewEmployeePayroll}
            onProcessEmployee={handleProcessEmployee}
            isProcessing={isProcessing}
            processingEmployeePayrollId={processingEmployeePayrollId}
            midMonthPayrollsMap={midMonthPayrollsMap}
            formatCurrency={formatCurrency}
          />
        ) : (
          <PayrollUnifiedTable
            variant="groups"
            jobGroups={sortedJobGroups}
            expandedJobs={expandedJobs}
            onToggleExpand={handleToggleJobExpansion}
            isJobGroupSelected={isJobGroupSelected}
            onSelectGroup={handleSelectJobGroup}
            selectedEmployeePayrolls={selectedEmployeePayrolls}
            onSelectEmployee={handleSelectEmployee}
            onViewDetails={handleViewEmployeePayroll}
            onProcessEmployee={handleProcessEmployee}
            isProcessing={isProcessing}
            processingEmployeePayrollId={processingEmployeePayrollId}
            midMonthPayrollsMap={midMonthPayrollsMap}
            formatCurrency={formatCurrency}
          />
        )}
      </div>
      {/* Missing Income Tax Rates Dialog */}
      <MissingIncomeTaxRatesDialog
        isOpen={showMissingTaxDialog}
        onClose={() => setShowMissingTaxDialog(false)}
        employees={missingIncomeTaxEmployees}
      />
    </div>
  );
};

export default PayrollPage;

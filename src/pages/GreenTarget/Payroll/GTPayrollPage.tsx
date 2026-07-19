// src/pages/GreenTarget/Payroll/GTPayrollPage.tsx
// Green Target monthly payroll list. Uses the modern payroll presentation while
// preserving GT's simpler all-employees processing workflow.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconAdjustments,
  IconArrowsSort,
  IconCash,
  IconChevronDown,
  IconChevronUp,
  IconChevronsDown,
  IconChevronsUp,
  IconClock,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconTruck,
  IconUser,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MonthNavigator from "../../../components/MonthNavigator";
import PayrollEmployeeManagementModal from "../../../components/GreenTarget/PayrollEmployeeManagementModal";
import PayrollSectionPrintMenu from "../../../components/Payroll/PayrollSectionPrintMenu";
import { api } from "../../../routes/utils/api";
import type { EmployeePayroll } from "../../../types/types";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import {
  buildGTPayslipPayroll,
  type GTPayslipDeduction,
  type GTPayslipItem,
} from "../../../utils/greenTarget/buildGTPayslipPayroll";
import type { MidMonthPayroll } from "../../../utils/payroll/midMonthPayrollUtils";
import {
  getMonthName,
  type PayrollProcessingError,
} from "../../../utils/payroll/payrollUtils";
import PayrollProcessingErrorsDialog from "../../../components/Payroll/PayrollProcessingErrorsDialog";
import { PrintBatchPayslipsButton } from "../../../utils/payroll/PayslipButtons";

interface GTMonthlyPayroll {
  id: number;
  year: number;
  month: number;
  created_at: string;
  updated_at: string;
  employeePayrolls: GTEmployeePayroll[];
}

type GTMonthlyPayrollSummary = Omit<GTMonthlyPayroll, "employeePayrolls">;

interface GTEmployeePayroll {
  id: number;
  monthly_payroll_id: number;
  employee_id: string;
  job_type: string;
  section: string;
  gross_pay: number | string;
  net_pay: number | string;
  employee_name: string;
  created_at?: string;
  updated_at?: string;
  digenapkan?: number | string;
  setelah_digenapkan?: number | string | null;
  items?: GTPayslipItem[];
  deductions?: GTPayslipDeduction[];
}

interface GTPayrollEmployee {
  employee_id: string;
  job_type: "OFFICE" | "DRIVER";
  employee_name?: string;
}

interface GTProcessError {
  employeeId: string;
  error: string;
}

interface GTProcessResult {
  success: boolean;
  processed_count: number;
  errors?: GTProcessError[];
  message?: string;
  updated_at?: string;
}

interface GTMidMonthPayrollRecord {
  id: number;
  employee_id: string;
  employee_name?: string | null;
  year: number;
  month: number;
  amount: number | string;
  payment_method: "Cash" | "Bank" | "Cheque";
  status: "Pending" | "Paid" | "Cancelled";
  created_at?: string;
  updated_at?: string;
  paid_at?: string;
  notes?: string;
}

interface GTMidMonthPayrollResponse {
  payrolls?: GTMidMonthPayrollRecord[];
}

const GT_JOB_TYPES: readonly string[] = ["OFFICE", "DRIVER"];
const GT_PAYROLL_LIST_STATE_PREFIX: string = "gt-payroll-list-state:";
const GT_PAYROLL_RECENCY_PREFIX: string = "gt-payroll-open-recency:";

type GTPayrollViewMode = "groups" | "recent";

interface GTPayrollListState {
  searchTerm: string;
  viewMode: GTPayrollViewMode;
  expandedSections: Record<string, boolean>;
}

const readPayrollListState = (storageKey: string): GTPayrollListState => {
  const fallbackState: GTPayrollListState = {
    searchTerm: "",
    viewMode: "groups",
    expandedSections: {},
  };

  try {
    const storedState: string | null = sessionStorage.getItem(storageKey);
    if (!storedState) return fallbackState;

    const parsedState: unknown = JSON.parse(storedState);
    if (
      !parsedState ||
      typeof parsedState !== "object" ||
      Array.isArray(parsedState)
    ) {
      return fallbackState;
    }

    const candidateState: Partial<GTPayrollListState> =
      parsedState as Partial<GTPayrollListState>;
    const expandedSections: Record<string, boolean> = Object.entries(
      candidateState.expandedSections || {}
    ).reduce<Record<string, boolean>>(
      (
        validSections: Record<string, boolean>,
        [section, isExpanded]: [string, unknown]
      ): Record<string, boolean> => {
        if (typeof isExpanded === "boolean") {
          validSections[section] = isExpanded;
        }
        return validSections;
      },
      {}
    );

    return {
      searchTerm:
        typeof candidateState.searchTerm === "string"
          ? candidateState.searchTerm
          : "",
      viewMode:
        candidateState.viewMode === "recent" ? "recent" : "groups",
      expandedSections,
    };
  } catch {
    return fallbackState;
  }
};

const savePayrollListState = (
  storageKey: string,
  state: GTPayrollListState
): void => {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Keep the page usable when storage is unavailable.
  }
};

const readPayrollOpenRecency = (
  storageKey: string
): Record<string, number> => {
  try {
    const storedRecency: string | null = localStorage.getItem(storageKey);
    if (!storedRecency) return {};

    const parsedRecency: unknown = JSON.parse(storedRecency);
    if (
      !parsedRecency ||
      typeof parsedRecency !== "object" ||
      Array.isArray(parsedRecency)
    ) {
      return {};
    }

    return Object.entries(parsedRecency).reduce<Record<string, number>>(
      (
        validRecency: Record<string, number>,
        [employeeId, openedAt]: [string, unknown]
      ): Record<string, number> => {
        if (typeof openedAt === "number" && Number.isFinite(openedAt)) {
          validRecency[employeeId] = openedAt;
        }
        return validRecency;
      },
      {}
    );
  } catch {
    return {};
  }
};

const savePayrollOpenRecency = (
  storageKey: string,
  recency: Record<string, number>
): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(recency));
  } catch {
    // Keep the page usable when storage is unavailable.
  }
};

const getPayrollProcessedTime = (
  employeePayroll: GTEmployeePayroll
): number => {
  const timestampSource: string | undefined =
    employeePayroll.updated_at ?? employeePayroll.created_at;
  if (!timestampSource) return 0;

  const timestamp: number = Date.parse(timestampSource);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const parsePayrollAmount = (
  value: number | string | null | undefined
): number => {
  const amount: number = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const formatAmount = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const GTPayrollPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { allStaffs } = useStaffsCache();

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const yearParam: string | null = searchParams.get("year");
    const monthParam: string | null = searchParams.get("month");

    if (yearParam && monthParam) {
      const year: number = Number.parseInt(yearParam, 10);
      const month: number = Number.parseInt(monthParam, 10);
      if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        month >= 1 &&
        month <= 12
      ) {
        return new Date(year, month - 1, 1);
      }
    }

    return new Date();
  });

  const selectedYear: number = selectedMonth.getFullYear();
  const selectedMonthNumber: number = selectedMonth.getMonth() + 1;
  const listStateStorageKey: string = `${GT_PAYROLL_LIST_STATE_PREFIX}${selectedYear}-${selectedMonthNumber}`;
  const openRecencyStorageKey: string = `${GT_PAYROLL_RECENCY_PREFIX}${selectedYear}-${selectedMonthNumber}`;
  const scrollStorageKey: string = `gt-payroll-page:${selectedYear}-${selectedMonthNumber}`;

  const [payroll, setPayroll] = useState<GTMonthlyPayroll | null>(null);
  const [gtEmployees, setGtEmployees] = useState<GTPayrollEmployee[]>([]);
  const [midMonthPayrollsMap, setMidMonthPayrollsMap] = useState<
    Record<string, MidMonthPayroll | null>
  >({});
  const [midMonthLoadError, setMidMonthLoadError] =
    useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  // Employees skipped by processing (e.g. July 2026+ OT-formula blocks)
  const [processingErrors, setProcessingErrors] = useState<
    PayrollProcessingError[]
  >([]);
  const [showProcessingErrorsDialog, setShowProcessingErrorsDialog] =
    useState<boolean>(false);
  const [showManageModal, setShowManageModal] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>(
    (): string => readPayrollListState(listStateStorageKey).searchTerm
  );
  const [viewMode, setViewMode] = useState<GTPayrollViewMode>(
    (): GTPayrollViewMode =>
      readPayrollListState(listStateStorageKey).viewMode
  );
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(
    (): Record<string, boolean> =>
      readPayrollListState(listStateStorageKey).expandedSections
  );
  const [openRecency, setOpenRecency] = useState<Record<string, number>>(
    (): Record<string, number> =>
      readPayrollOpenRecency(openRecencyStorageKey)
  );
  const [selectedEmployeePayrolls, setSelectedEmployeePayrolls] = useState<
    Record<string, boolean>
  >({});
  const payrollRequestIdRef = useRef<number>(0);

  const isPayrollScrollReady: boolean =
    !isLoading &&
    !!payroll &&
    payroll.year === selectedYear &&
    payroll.month === selectedMonthNumber;

  useEffect(() => {
    if (!isPayrollScrollReady) return;

    const container: HTMLElement | null = document.querySelector("main");
    if (!container) return;

    const storageKey: string = `scroll:${scrollStorageKey}`;
    const savedPosition: string | null = sessionStorage.getItem(storageKey);
    const parsedScrollPosition: number = Number.parseInt(
      savedPosition || "",
      10
    );
    const scrollPosition: number = Number.isFinite(parsedScrollPosition)
      ? parsedScrollPosition
      : 0;
    const animationFrameId: number = requestAnimationFrame((): void => {
      container.scrollTop = scrollPosition;
    });

    const handleScroll = (): void => {
      sessionStorage.setItem(storageKey, String(container.scrollTop));
    };
    container.addEventListener("scroll", handleScroll, { passive: true });

    return (): void => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [isPayrollScrollReady, scrollStorageKey]);

  useEffect(() => {
    const savedListState: GTPayrollListState =
      readPayrollListState(listStateStorageKey);
    setSearchTerm(savedListState.searchTerm);
    setViewMode(savedListState.viewMode);
    setExpandedSections(savedListState.expandedSections);
    setOpenRecency(readPayrollOpenRecency(openRecencyStorageKey));
    setSelectedEmployeePayrolls({});
  }, [listStateStorageKey, openRecencyStorageKey]);

  const handleMonthChange = useCallback(
    (newMonth: Date): void => {
      setSelectedMonth(newMonth);
      const year: number = newMonth.getFullYear();
      const month: number = newMonth.getMonth() + 1;
      setSearchParams({ year: year.toString(), month: month.toString() });
    },
    [setSearchParams]
  );

  useEffect(() => {
    const yearParam: string | null = searchParams.get("year");
    const monthParam: string | null = searchParams.get("month");
    const year: number = Number.parseInt(yearParam || "", 10);
    const month: number = Number.parseInt(monthParam || "", 10);
    const hasValidMonth: boolean =
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      month >= 1 &&
      month <= 12;
    if (hasValidMonth) return;

    setSearchParams(
      {
        year: selectedMonth.getFullYear().toString(),
        month: (selectedMonth.getMonth() + 1).toString(),
      },
      { replace: true }
    );
  }, [searchParams, selectedMonth, setSearchParams]);

  useEffect(() => {
    const yearParam: string | null = searchParams.get("year");
    const monthParam: string | null = searchParams.get("month");
    if (!yearParam || !monthParam) return;

    const year: number = Number.parseInt(yearParam, 10);
    const month: number = Number.parseInt(monthParam, 10);
    if (!Number.isFinite(year) || month < 1 || month > 12) return;

    setSelectedMonth((currentMonth: Date): Date => {
      if (
        currentMonth.getFullYear() === year &&
        currentMonth.getMonth() === month - 1
      ) {
        return currentMonth;
      }
      return new Date(year, month - 1, 1);
    });
  }, [searchParams]);

  const fetchPayrollData = useCallback(async (): Promise<void> => {
    const year: number = selectedMonth.getFullYear();
    const month: number = selectedMonth.getMonth() + 1;
    const requestId: number = payrollRequestIdRef.current + 1;
    payrollRequestIdRef.current = requestId;
    let midMonthFetchFailed: boolean = false;

    setIsLoading(true);
    setLoadError(null);
    try {
      const [
        payrollResponse,
        employeesResponse,
        midMonthResponse,
      ]: [
        GTMonthlyPayrollSummary[],
        GTPayrollEmployee[],
        GTMidMonthPayrollResponse,
      ] =
        await Promise.all([
          api.get(
            `/greentarget/api/monthly-payrolls?year=${year}&month=${month}`
          ),
          api.get("/greentarget/api/payroll-employees"),
          api.get(
            `/greentarget/api/mid-month-payrolls?year=${year}&month=${month}&limit=1000`
          ).catch((error: unknown): GTMidMonthPayrollResponse => {
            console.error("Error fetching optional GT mid-month data:", error);
            midMonthFetchFailed = true;
            return { payrolls: [] };
          }),
        ]);

      if (requestId !== payrollRequestIdRef.current) return;

      const payrollEmployees: GTPayrollEmployee[] = Array.isArray(
        employeesResponse
      )
        ? employeesResponse
        : [];

      const midMonthMap: Record<string, MidMonthPayroll | null> = {};
      for (const record of midMonthResponse.payrolls || []) {
        if (record.status?.trim().toLowerCase() === "cancelled") {
          continue;
        }
        const employee: GTPayrollEmployee | undefined = payrollEmployees.find(
          (candidate: GTPayrollEmployee): boolean =>
            candidate.employee_id === record.employee_id
        );
        midMonthMap[record.employee_id] = {
          id: record.id,
          employee_id: record.employee_id,
          employee_name:
            record.employee_name || employee?.employee_name || record.employee_id,
          year: record.year,
          month: record.month,
          amount: parsePayrollAmount(record.amount),
          payment_method: record.payment_method,
          status: record.status,
          created_at: record.created_at || "",
          updated_at: record.updated_at || "",
          paid_at: record.paid_at,
          notes: record.notes,
        };
      }

      let nextPayroll: GTMonthlyPayroll | null = null;
      if (payrollResponse.length > 0) {
        nextPayroll = await api.get(
          `/greentarget/api/monthly-payrolls/${payrollResponse[0].id}`
        );
      }

      if (requestId !== payrollRequestIdRef.current) return;
      setGtEmployees(payrollEmployees);
      setMidMonthPayrollsMap(midMonthMap);
      setMidMonthLoadError(midMonthFetchFailed);
      setPayroll(nextPayroll);
    } catch (error: unknown) {
      if (requestId !== payrollRequestIdRef.current) return;
      console.error("Error fetching GT payroll:", error);
      setPayroll(null);
      setGtEmployees([]);
      setMidMonthPayrollsMap({});
      setMidMonthLoadError(true);
      setLoadError("Failed to load Green Target payroll data.");
      toast.error("Failed to load payroll data");
    } finally {
      if (requestId === payrollRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [selectedMonth]);

  useEffect(() => {
    void fetchPayrollData();
    return (): void => {
      payrollRequestIdRef.current += 1;
    };
  }, [fetchPayrollData]);

  const handleCreatePayroll = async (): Promise<void> => {
    const year: number = selectedMonth.getFullYear();
    const month: number = selectedMonth.getMonth() + 1;

    setIsCreating(true);
    try {
      await api.post("/greentarget/api/monthly-payrolls", { year, month });
      toast.success(`Created payroll for ${getMonthName(month)} ${year}`);
      await fetchPayrollData();
    } catch (error: unknown) {
      console.error("Error creating payroll:", error);
      const errorMessage: string =
        error instanceof Error ? error.message : "Failed to create payroll";
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleProcessPayroll = async (): Promise<void> => {
    if (!payroll) return;

    const selectedEmployees: Array<{
      employeeId: string;
      jobType: "OFFICE" | "DRIVER";
    }> = gtEmployees.map((employee: GTPayrollEmployee) => ({
      employeeId: employee.employee_id,
      jobType: employee.job_type,
    }));

    if (selectedEmployees.length === 0) {
      toast.error("No employees in GT payroll. Add employees first.");
      return;
    }

    setIsProcessing(true);
    try {
      const result: GTProcessResult = await api.post(
        `/greentarget/api/monthly-payrolls/${payroll.id}/process-all`,
        { selected_employees: selectedEmployees }
      );

      if (result.success) {
        toast.success(`Processed ${result.processed_count} employee(s)`);
        if ((result.errors?.length || 0) > 0) {
          // Show the skipped employees with reasons and quick fix links
          // (e.g. July 2026+ OT-formula blocks).
          setProcessingErrors(result.errors || []);
          setShowProcessingErrorsDialog(true);
        }
        await fetchPayrollData();
      } else {
        toast.error(result.message || "Processing failed");
      }
    } catch (error: unknown) {
      console.error("Error processing payroll:", error);
      toast.error("Failed to process payroll");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSearchChange = (value: string): void => {
    setSearchTerm(value);
    setSelectedEmployeePayrolls({});
    savePayrollListState(listStateStorageKey, {
      searchTerm: value,
      viewMode,
      expandedSections,
    });
  };

  const handleViewModeToggle = (): void => {
    const nextViewMode: GTPayrollViewMode =
      viewMode === "groups" ? "recent" : "groups";
    setViewMode(nextViewMode);
    savePayrollListState(listStateStorageKey, {
      searchTerm,
      viewMode: nextViewMode,
      expandedSections,
    });
  };

  const toggleSection = (section: string): void => {
    setExpandedSections((current: Record<string, boolean>) => {
      const nextExpandedSections: Record<string, boolean> = {
        ...current,
        [section]: current[section] === false,
      };
      savePayrollListState(listStateStorageKey, {
        searchTerm,
        viewMode,
        expandedSections: nextExpandedSections,
      });
      return nextExpandedSections;
    });
  };

  const isSectionExpanded = (section: string): boolean =>
    expandedSections[section] !== false;

  const normalizedSearchTerm: string = searchTerm.trim().toLowerCase();
  const visibleEmployeePayrolls: GTEmployeePayroll[] = (
    payroll?.employeePayrolls || []
  ).filter((employeePayroll: GTEmployeePayroll): boolean => {
    if (!normalizedSearchTerm) return true;

    const searchableText: string = [
      employeePayroll.employee_name,
      employeePayroll.employee_id,
      employeePayroll.job_type,
      employeePayroll.section,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchableText.includes(normalizedSearchTerm);
  });

  const payrollsByJobType: Record<string, GTEmployeePayroll[]> = {};
  for (const employeePayroll of visibleEmployeePayrolls) {
    const jobType: string = employeePayroll.job_type || "OTHER";
    if (!payrollsByJobType[jobType]) payrollsByJobType[jobType] = [];
    payrollsByJobType[jobType].push(employeePayroll);
  }

  const getEmployeeRecency = (
    employeePayroll: GTEmployeePayroll
  ): number =>
    openRecency[employeePayroll.employee_id] ??
    getPayrollProcessedTime(employeePayroll);

  const orderedJobTypes: string[] = [
    ...GT_JOB_TYPES.filter(
      (jobType: string): boolean => !!payrollsByJobType[jobType]?.length
    ),
    ...Object.keys(payrollsByJobType).filter(
      (jobType: string): boolean => !GT_JOB_TYPES.includes(jobType)
    ),
  ].sort((leftJobType: string, rightJobType: string): number => {
    const leftRecency: number = Math.max(
      0,
      ...(payrollsByJobType[leftJobType] || []).map(getEmployeeRecency)
    );
    const rightRecency: number = Math.max(
      0,
      ...(payrollsByJobType[rightJobType] || []).map(getEmployeeRecency)
    );
    if (rightRecency !== leftRecency) return rightRecency - leftRecency;

    const leftPriority: number = GT_JOB_TYPES.indexOf(leftJobType);
    const rightPriority: number = GT_JOB_TYPES.indexOf(rightJobType);
    return (
      (leftPriority === -1 ? GT_JOB_TYPES.length : leftPriority) -
      (rightPriority === -1 ? GT_JOB_TYPES.length : rightPriority)
    );
  });

  const recentEmployeePayrolls: GTEmployeePayroll[] = [
    ...visibleEmployeePayrolls,
  ].sort(
    (
      leftEmployee: GTEmployeePayroll,
      rightEmployee: GTEmployeePayroll
    ): number => {
      const recencyDifference: number =
        getEmployeeRecency(rightEmployee) -
        getEmployeeRecency(leftEmployee);
      if (recencyDifference !== 0) return recencyDifference;

      return (
        parsePayrollAmount(
          rightEmployee.setelah_digenapkan ?? rightEmployee.net_pay
        ) -
        parsePayrollAmount(
          leftEmployee.setelah_digenapkan ?? leftEmployee.net_pay
        )
      );
    }
  );

  const handleOpenEmployeePayroll = (
    employeePayroll: GTEmployeePayroll
  ): void => {
    const nextOpenRecency: Record<string, number> = {
      ...openRecency,
      [employeePayroll.employee_id]: Date.now(),
    };
    setOpenRecency(nextOpenRecency);
    savePayrollOpenRecency(openRecencyStorageKey, nextOpenRecency);
    navigate(`/greentarget/payroll/details/${employeePayroll.id}`);
  };

  const handleSelectEmployee = (
    employeePayrollId: number,
    isSelected: boolean
  ): void => {
    setSelectedEmployeePayrolls(
      (currentSelection: Record<string, boolean>): Record<string, boolean> => ({
        ...currentSelection,
        [`${employeePayrollId}`]: isSelected,
      })
    );
  };

  const allVisibleSelected: boolean =
    visibleEmployeePayrolls.length > 0 &&
    visibleEmployeePayrolls.every(
      (employeePayroll: GTEmployeePayroll): boolean =>
        !!selectedEmployeePayrolls[`${employeePayroll.id}`]
    );
  const someVisibleSelected: boolean = visibleEmployeePayrolls.some(
    (employeePayroll: GTEmployeePayroll): boolean =>
      !!selectedEmployeePayrolls[`${employeePayroll.id}`]
  );

  const handleSelectAllVisible = (isSelected: boolean): void => {
    setSelectedEmployeePayrolls(
      (currentSelection: Record<string, boolean>): Record<string, boolean> => {
        const nextSelection: Record<string, boolean> = {
          ...currentSelection,
        };
        for (const employeePayroll of visibleEmployeePayrolls) {
          nextSelection[`${employeePayroll.id}`] = isSelected;
        }
        return nextSelection;
      }
    );
  };

  const handleSelectJobType = (
    jobType: string,
    isSelected: boolean
  ): void => {
    const jobTypePayrolls: GTEmployeePayroll[] =
      payrollsByJobType[jobType] || [];
    setSelectedEmployeePayrolls(
      (currentSelection: Record<string, boolean>): Record<string, boolean> => {
        const nextSelection: Record<string, boolean> = {
          ...currentSelection,
        };
        for (const employeePayroll of jobTypePayrolls) {
          nextSelection[`${employeePayroll.id}`] = isSelected;
        }
        return nextSelection;
      }
    );
  };

  const areAllSectionsExpanded: boolean =
    orderedJobTypes.length > 0 &&
    orderedJobTypes.every(isSectionExpanded);

  const handleToggleAllSections = (expand: boolean): void => {
    const nextExpandedSections: Record<string, boolean> = {
      ...expandedSections,
    };
    for (const jobType of orderedJobTypes) {
      nextExpandedSections[jobType] = expand;
    }
    setExpandedSections(nextExpandedSections);
    savePayrollListState(listStateStorageKey, {
      searchTerm,
      viewMode,
      expandedSections: nextExpandedSections,
    });
  };

  // GT payroll IDs can overlap with Tien Hock IDs. The shared payslip manager
  // defaults to TH when it sees an ID, so omit the ID from print-only objects to
  // guarantee it uses the already-normalized GT data instead of refetching TH.
  const batchPayrolls: EmployeePayroll[] = (
    payroll?.employeePayrolls || []
  ).map((employeePayroll: GTEmployeePayroll): EmployeePayroll => {
    const normalizedPayroll: EmployeePayroll = buildGTPayslipPayroll({
      ...employeePayroll,
      gross_pay: parsePayrollAmount(employeePayroll.gross_pay),
      net_pay: parsePayrollAmount(employeePayroll.net_pay),
      digenapkan: parsePayrollAmount(employeePayroll.digenapkan),
      setelah_digenapkan:
        employeePayroll.setelah_digenapkan == null
          ? null
          : parsePayrollAmount(employeePayroll.setelah_digenapkan),
      year: payroll?.year,
      month: payroll?.month,
    }).pdfPayroll;

    return { ...normalizedPayroll, id: undefined };
  });

  const selectedBatchPayrolls: EmployeePayroll[] = batchPayrolls.filter(
    (_employeePayroll: EmployeePayroll, index: number): boolean => {
      const sourcePayroll: GTEmployeePayroll | undefined =
        payroll?.employeePayrolls[index];
      return !!(
        sourcePayroll &&
        selectedEmployeePayrolls[`${sourcePayroll.id}`]
      );
    }
  );
  const selectedCount: number = selectedBatchPayrolls.length;

  const totalNet: number = (payroll?.employeePayrolls || []).reduce(
    (sum: number, employeePayroll: GTEmployeePayroll): number =>
      sum + parsePayrollAmount(employeePayroll.net_pay),
    0
  );
  const totalRounded: number = (payroll?.employeePayrolls || []).reduce(
    (sum: number, employeePayroll: GTEmployeePayroll): number =>
      sum +
      parsePayrollAmount(
        employeePayroll.setelah_digenapkan ?? employeePayroll.net_pay
      ),
    0
  );

  const renderEmployeePayrollRow = (
    employeePayroll: GTEmployeePayroll
  ): React.ReactNode => (
    <tr
      key={employeePayroll.id}
      className="group cursor-pointer border-b border-default-100 transition-colors hover:bg-default-50 dark:border-gray-700 dark:hover:bg-gray-700"
      onClick={(): void => handleOpenEmployeePayroll(employeePayroll)}
    >
      <td
        className="w-10 px-3 py-2"
        onClick={(event: React.MouseEvent<HTMLTableCellElement>): void =>
          event.stopPropagation()
        }
      >
        <Checkbox
          checked={!!selectedEmployeePayrolls[`${employeePayroll.id}`]}
          onChange={(isSelected: boolean): void =>
            handleSelectEmployee(employeePayroll.id, isSelected)
          }
          size={18}
          checkedColor="text-sky-600 dark:text-sky-400"
          ariaLabel={`Select ${
            employeePayroll.employee_name || employeePayroll.employee_id
          } payslip`}
        />
      </td>
      <td className="px-3 py-2">
        <div
          className="truncate font-medium text-default-700 dark:text-gray-200"
          title={employeePayroll.employee_name || "Unknown"}
        >
          {employeePayroll.employee_name || "Unknown"}
        </div>
      </td>
      <td className="w-44 px-3 py-2 text-sm text-default-500 dark:text-gray-400">
        <div className="truncate" title={employeePayroll.employee_id}>
          {employeePayroll.employee_id}
        </div>
      </td>
      <td className="px-3 py-2 text-sm text-default-600 dark:text-gray-300">
        {employeePayroll.section || employeePayroll.job_type || "-"}
      </td>
      <td className="px-3 py-2 text-right font-medium text-default-700 dark:text-gray-200">
        {formatCurrency(parsePayrollAmount(employeePayroll.gross_pay))}
      </td>
      <td className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
        {formatCurrency(
          parsePayrollAmount(
            employeePayroll.setelah_digenapkan ?? employeePayroll.net_pay
          )
        )}
      </td>
    </tr>
  );

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <MonthNavigator
          selectedMonth={selectedMonth}
          onChange={handleMonthChange}
          showGoToCurrentButton={false}
          size="sm"
          pickerPlacement="bottom-left-button"
        />
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-900/20">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            {loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            color="rose"
            className="mt-4"
            onClick={(): void => {
              void fetchPayrollData();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isProcessing && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-900/30">
          <div className="flex items-center">
            <IconClock
              className="mr-3 text-sky-500 dark:text-sky-400"
              size={24}
            />
            <div className="flex-1">
              <h3 className="font-medium text-sky-800 dark:text-sky-200">
                Processing Payroll
              </h3>
              <p className="text-sm text-sky-600 dark:text-sky-400">
                Rebuilding Green Target payroll for the selected month...
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-col items-start justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
              size="sm"
              pickerPlacement="bottom-left-button"
            />
            {payroll && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <div className="flex items-center gap-1.5">
                  <IconUsers
                    size={16}
                    className="text-sky-600 dark:text-sky-400"
                  />
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    {payroll.employeePayrolls.length}
                  </span>
                </div>
                <span className="text-default-300 dark:text-gray-600">•</span>
                <div className="flex items-center gap-1.5">
                  <IconCash
                    size={16}
                    className="text-emerald-600 dark:text-emerald-400"
                  />
                  <span
                    className="font-semibold text-emerald-700 dark:text-emerald-300"
                    title={`Jumlah Digenapkan: ${formatCurrency(
                      totalRounded
                    )}. Net Pay before mid-month and rounding: ${formatCurrency(
                      totalNet
                    )}.`}
                  >
                    {formatAmount(totalRounded)}
                  </span>
                </div>
                <span className="text-default-300 dark:text-gray-600">•</span>
                <button
                  type="button"
                  onClick={handleViewModeToggle}
                  className="inline-flex items-center gap-1.5 text-default-500 transition-colors hover:text-sky-600 dark:text-gray-300 dark:hover:text-sky-400"
                  title={
                    viewMode === "groups"
                      ? "Showing employees in job groups. Click for the recently opened list."
                      : "Showing recently opened employees. Click for job groups."
                  }
                >
                  <IconArrowsSort size={14} />
                  <span>{viewMode === "groups" ? "Groups" : "Recent"}</span>
                </button>
                <span className="text-default-300 dark:text-gray-600">•</span>
                <button
                  type="button"
                  onClick={handleProcessPayroll}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 text-default-400 transition-colors hover:text-sky-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-sky-400"
                  title="Re-process the full Green Target payroll roster. Search and payslip selection do not change processing."
                >
                  <IconRefresh
                    size={14}
                    className={isProcessing ? "animate-spin" : ""}
                  />
                  <span>{isProcessing ? "Processing..." : "Process"}</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            {selectedCount > 0 && (
              <PrintBatchPayslipsButton
                payrolls={selectedBatchPayrolls}
                midMonthPayrollsMap={midMonthPayrollsMap}
                disabled={midMonthLoadError}
                companyName="GREEN TARGET SDN. BHD."
                size="sm"
                variant="outline"
                color="sky"
                buttonText={`${selectedCount} selected`}
              />
            )}
            {batchPayrolls.length > 0 && (
              <div className="hidden sm:block">
                <PayrollSectionPrintMenu
                  payrolls={batchPayrolls}
                  midMonthPayrollsMap={midMonthPayrollsMap}
                  disabled={midMonthLoadError}
                  companyName="GREEN TARGET SDN. BHD."
                  size="sm"
                  buttonLabel="Payslips"
                />
              </div>
            )}
            {payroll && payroll.employeePayrolls.length > 0 && (
              <div className="relative">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    handleSearchChange(event.target.value)
                  }
                  placeholder="Search employees..."
                  aria-label="Search payroll employees"
                  className="w-[170px] rounded-full border border-default-300 bg-white px-3 py-1 pr-8 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100 dark:focus:border-sky-400 dark:focus:ring-sky-400"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={(): void => handleSearchChange("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 transition-colors hover:text-default-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="Clear search"
                    aria-label="Clear employee search"
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>
            )}
            {payroll &&
              viewMode === "groups" &&
              orderedJobTypes.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={
                    areAllSectionsExpanded
                      ? IconChevronsUp
                      : IconChevronsDown
                  }
                  iconSize={16}
                  onClick={(): void =>
                    handleToggleAllSections(!areAllSectionsExpanded)
                  }
                  title={
                    areAllSectionsExpanded
                      ? "Collapse all job groups"
                      : "Expand all job groups"
                  }
                  aria-label={
                    areAllSectionsExpanded
                      ? "Collapse all job groups"
                      : "Expand all job groups"
                  }
                />
              )}
            <Button
              size="sm"
              variant="outline"
              icon={IconClock}
              iconSize={16}
              onClick={() =>
                navigate(
                  `/greentarget/payroll/office-log?year=${selectedYear}&month=${selectedMonthNumber}`
                )
              }
            >
              Office
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={IconTruck}
              iconSize={16}
              onClick={() =>
                navigate("/greentarget/payroll/daily-lori-habuk")
              }
            >
              Driver
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={IconAdjustments}
              iconSize={16}
              onClick={() => navigate("/greentarget/payroll/settings")}
            >
              Rules
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={IconSettings}
              iconSize={16}
              onClick={() => setShowManageModal(true)}
            >
              Employees
            </Button>
          </div>
        </div>

        {payroll && midMonthLoadError && (
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Mid-month payment data could not be loaded. Payslip printing is
              disabled so the printed totals cannot omit a deduction.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              color="amber"
              onClick={(): void => {
                void fetchPayrollData();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!payroll && (
          <div className="overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col items-center justify-center px-6 py-16">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-50 to-sky-100 shadow-sm dark:from-sky-900/30 dark:to-sky-800/30">
                <IconCash
                  size={36}
                  className="text-sky-400 dark:text-sky-300"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-default-700 dark:text-gray-200">
                No Payroll Yet
              </h3>
              <p className="mb-6 max-w-sm text-center text-default-400 dark:text-gray-400">
                There is no Green Target payroll record for{" "}
                <span className="font-medium text-default-600 dark:text-gray-300">
                  {getMonthName(selectedMonthNumber)} {selectedYear}
                </span>
                . Create one to start processing employee payments.
              </p>
              <Button
                color="sky"
                onClick={handleCreatePayroll}
                disabled={isCreating || gtEmployees.length === 0}
                icon={isCreating ? undefined : IconPlus}
                iconSize={18}
                size="md"
              >
                {isCreating ? "Creating..." : "Create Payroll"}
              </Button>
              {gtEmployees.length === 0 && (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                  Add employees to Green Target payroll first.
                </p>
              )}
            </div>
          </div>
        )}

        {payroll && (
          <div className="space-y-3">
            {payroll.employeePayrolls.length === 0 ? (
              <div className="rounded-lg border border-default-200 bg-white py-8 text-center dark:border-gray-700 dark:bg-gray-800">
                <p className="text-default-500 dark:text-gray-400">
                  No employee payrolls found.
                </p>
                <Button
                  onClick={handleProcessPayroll}
                  color="sky"
                  variant="outline"
                  className="mt-4"
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Process Payroll"}
                </Button>
              </div>
            ) : visibleEmployeePayrolls.length === 0 ? (
              <div className="rounded-lg border border-default-200 bg-white px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-800">
                <p className="font-medium text-default-600 dark:text-gray-300">
                  No employees match “{searchTerm}”.
                </p>
                <button
                  type="button"
                  onClick={(): void => handleSearchChange("")}
                  className="mt-2 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-default-200 shadow-sm dark:border-gray-700">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] table-fixed">
                    <thead className="sticky top-0 z-10 bg-default-100 dark:bg-gray-800">
                      <tr>
                        <th className="w-10 px-3 py-2.5 text-left">
                          <Checkbox
                            checked={allVisibleSelected}
                            onChange={handleSelectAllVisible}
                            size={18}
                            checkedColor="text-sky-600 dark:text-sky-400"
                            ariaLabel={
                              allVisibleSelected
                                ? "Deselect all shown payslips"
                                : "Select all shown payslips"
                            }
                            ariaChecked={
                              someVisibleSelected && !allVisibleSelected
                                ? "mixed"
                                : allVisibleSelected
                            }
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                          Name
                        </th>
                        <th className="w-44 px-3 py-2.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                          ID
                        </th>
                        <th className="w-28 px-3 py-2.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                          Section
                        </th>
                        <th className="w-32 px-3 py-2.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                          Gross
                        </th>
                        <th className="w-32 px-3 py-2.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800">
                      {viewMode === "recent"
                        ? recentEmployeePayrolls.map(renderEmployeePayrollRow)
                        : orderedJobTypes.map((jobType: string) => {
                            const rows: GTEmployeePayroll[] =
                              payrollsByJobType[jobType] || [];
                            const groupGross: number = rows.reduce(
                              (
                                sum: number,
                                employeePayroll: GTEmployeePayroll
                              ): number =>
                                sum +
                                parsePayrollAmount(employeePayroll.gross_pay),
                              0
                            );
                            const groupRounded: number = rows.reduce(
                              (
                                sum: number,
                                employeePayroll: GTEmployeePayroll
                              ): number =>
                                sum +
                                parsePayrollAmount(
                                  employeePayroll.setelah_digenapkan ??
                                    employeePayroll.net_pay
                                ),
                              0
                            );
                            const isExpanded: boolean =
                              isSectionExpanded(jobType);
                            const isGroupSelected: boolean = rows.every(
                              (employeePayroll: GTEmployeePayroll): boolean =>
                                !!selectedEmployeePayrolls[
                                  `${employeePayroll.id}`
                                ]
                            );
                            const isSomeGroupSelected: boolean = rows.some(
                              (employeePayroll: GTEmployeePayroll): boolean =>
                                !!selectedEmployeePayrolls[
                                  `${employeePayroll.id}`
                                ]
                            );

                            return (
                              <React.Fragment key={jobType}>
                                <tr
                                  className={`group cursor-pointer border-t border-default-200 transition-colors dark:border-gray-700 ${
                                    isExpanded
                                      ? "bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/30 dark:hover:bg-sky-900/50"
                                      : "bg-default-50 hover:bg-default-100 dark:bg-gray-800/50 dark:hover:bg-gray-700"
                                  }`}
                                  onClick={(): void => toggleSection(jobType)}
                                >
                                  <td
                                    className="w-10 px-3 py-2"
                                    onClick={(
                                      event: React.MouseEvent<HTMLTableCellElement>
                                    ): void => event.stopPropagation()}
                                  >
                                    <Checkbox
                                      checked={isGroupSelected}
                                      onChange={(isSelected: boolean): void =>
                                        handleSelectJobType(
                                          jobType,
                                          isSelected
                                        )
                                      }
                                      size={18}
                                      checkedColor="text-sky-600 dark:text-sky-400"
                                      ariaLabel={`Select ${jobType} payslips`}
                                      ariaChecked={
                                        isSomeGroupSelected &&
                                        !isGroupSelected
                                          ? "mixed"
                                          : isGroupSelected
                                      }
                                    />
                                  </td>
                                  <td colSpan={3} className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <div className="h-5 w-1 rounded-full bg-sky-500" />
                                      {jobType === "DRIVER" ? (
                                        <IconTruck
                                          size={16}
                                          className="text-amber-600 dark:text-amber-400"
                                        />
                                      ) : (
                                        <IconUser
                                          size={16}
                                          className="text-sky-600 dark:text-sky-400"
                                        />
                                      )}
                                      <span className="font-semibold text-default-800 dark:text-gray-100">
                                        {jobType}
                                      </span>
                                      <span className="text-sm text-default-500 dark:text-gray-400">
                                        ({rows.length}{" "}
                                        {rows.length === 1
                                          ? "employee"
                                          : "employees"}
                                        )
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right text-sm font-medium text-default-700 dark:text-gray-200">
                                    {formatCurrency(groupGross)}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="inline-flex items-center gap-2">
                                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(groupRounded)}
                                      </span>
                                      {isExpanded ? (
                                        <IconChevronUp
                                          size={14}
                                          className="text-sky-600 dark:text-sky-300"
                                        />
                                      ) : (
                                        <IconChevronDown
                                          size={14}
                                          className="text-default-500 dark:text-gray-400"
                                        />
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded && rows.map(renderEmployeePayrollRow)}
                              </React.Fragment>
                            );
                          })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <PayrollEmployeeManagementModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        availableEmployees={allStaffs}
        onUpdate={fetchPayrollData}
      />

      {/* Skipped employees (July 2026+ OT-formula blocks etc.). GT staff are
          managed in the shared Tien Hock catalogue. */}
      <PayrollProcessingErrorsDialog
        isOpen={showProcessingErrorsDialog}
        onClose={() => setShowProcessingErrorsDialog(false)}
        errors={processingErrors}
      />
    </div>
  );
};

export default GTPayrollPage;

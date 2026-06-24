// src/pages/Payroll/EmployeePayrollDetailsPage.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  IconPlus,
  IconTrash,
  IconInfoCircle,
  IconCash,
  IconReceipt,
  IconCoins,
  IconClock,
  IconBusinessplan,
  IconCalendarEvent,
  IconCirclePlus,
  IconList,
  IconListDetails,
  IconClockHour4,
  IconBuildingBank,
  IconWallet,
  IconChevronRight,
  IconRefresh,
} from "@tabler/icons-react";
import { format } from "date-fns";
import Button from "../../components/Button";
import BackButton from "../../components/BackButton";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  getEmployeePayrollComprehensive,
  deletePayrollItem,
  groupItemsByType,
  getMonthName,
  consolidatePayrollItems,
  filterOutLeaveDayItems,
  groupConsolidatedItemsByType,
  ConsolidatedPayrollItem,
  processMonthlyPayrolls,
  type PayrollProcessEmployeeSelection,
} from "../../utils/payroll/payrollUtils";
import toast from "react-hot-toast";
import AddManualItemModal from "../../components/Payroll/AddManualItemModal";
import {
  EmployeePayroll,
  CommissionRecord,
  MidMonthPayroll,
  OthersRecord,
  PinjamRecord,
} from "../../types/types";
import {
  DownloadPayslipButton,
  PrintPayslipButton,
} from "../../utils/payroll/PayslipButtons";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";

type PayrollDetailsViewMode = "consolidated" | "detailed";

const CLEAR_SEARCH_ON_RETURN_STORAGE_KEY: string =
  "payroll-clear-search-on-return";

const markSearchClearOnReturn = (): void => {
  try {
    sessionStorage.setItem(
      CLEAR_SEARCH_ON_RETURN_STORAGE_KEY,
      Date.now().toString()
    );
  } catch {
    // Ignore storage failures so back navigation still works.
  }
};

const clearSearchClearOnReturn = (): void => {
  try {
    sessionStorage.removeItem(CLEAR_SEARCH_ON_RETURN_STORAGE_KEY);
  } catch {
    // Ignore storage failures so back navigation still works.
  }
};

interface PayrollItem {
  id?: number;
  pay_code_id: string;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  foc_units?: number | null;
  amount: number;
  is_manual: boolean;
  pay_type: string;
  job_type?: string;
  source_employee_id?: string | null;
  source_date?: string | null;
  work_log_id?: number | null;
  // "daily" | "monthly" for work-log items; "production" | "production_bonus" |
  // "prod_bonus_rosak" for production-entry items; null for manual/other.
  work_log_type?: string | null;
}

interface FixedDirectAmountSummary {
  paidEntries: number;
  totalEntries: number;
}

type PayrollItemOthersPayType = "Tambahan" | "Overtime";

interface MonthlyLeaveRecord {
  id: number;
  employee_id: string;
  date: string;
  leave_type: string;
  days_taken: number;
  amount_paid: number;
  status: string;
  work_log_id?: number | null;
  work_log_type?: "daily" | "monthly" | "packing_cuti" | null;
  work_log_section?: string | null;
  notes?: string | null;
  holiday_description?: string | null;
  // True when this Cuti Tahunan row originated from a Commission page entry
  // (location 23) rather than a work log; used to deep-link to /payroll/commission.
  fromCommission?: boolean;
}

const EmployeePayrollDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const shouldClearSearchOnBackRef = useRef<boolean>(false);
  const hasConsumedPinjamScrollRef = useRef<boolean>(false);

  const [payroll, setPayroll] = useState<EmployeePayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PayrollItem | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReprocessingPayroll, setIsReprocessingPayroll] = useState(false);
  const [midMonthPayroll, setMidMonthPayroll] =
    useState<MidMonthPayroll | null>(null);
  const [monthlyLeaveRecords, setMonthlyLeaveRecords] = useState<
    MonthlyLeaveRecord[]
  >([]);
  const [commissionRecords, setCommissionRecords] = useState<
    CommissionRecord[]
  >([]);
  const [othersRecords, setOthersRecords] = useState<OthersRecord[]>([]);
  const [pinjamRecords, setPinjamRecords] = useState<PinjamRecord[]>([]);
  const [viewMode, setViewMode] = useState<PayrollDetailsViewMode>(() =>
    searchParams.get("view") === "consolidated" ? "consolidated" : "detailed",
  );

  const scrollRestorationKey: string = useMemo(() => {
    return `payroll-details:${id || "unknown"}:${viewMode}`;
  }, [id, viewMode]);

  useScrollRestoration(scrollRestorationKey, !isLoading && !!payroll);

  const handleViewModeChange = (nextViewMode: PayrollDetailsViewMode): void => {
    setViewMode(nextViewMode);
    const nextParams = new URLSearchParams(searchParams);
    if (nextViewMode === "detailed") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", "consolidated");
    }
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    const nextViewMode: PayrollDetailsViewMode =
      searchParams.get("view") === "consolidated" ? "consolidated" : "detailed";
    setViewMode((currentViewMode) =>
      currentViewMode === nextViewMode ? currentViewMode : nextViewMode,
    );
  }, [searchParams]);

  useEffect(() => {
    const handleCtrlKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Control" && !event.ctrlKey) return;

      shouldClearSearchOnBackRef.current = true;
      markSearchClearOnReturn();
    };

    const handleCtrlKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== "Control" && event.ctrlKey) return;

      shouldClearSearchOnBackRef.current = false;
      clearSearchClearOnReturn();
    };

    document.addEventListener("keydown", handleCtrlKeyDown);
    document.addEventListener("keyup", handleCtrlKeyUp);
    return () => {
      document.removeEventListener("keydown", handleCtrlKeyDown);
      document.removeEventListener("keyup", handleCtrlKeyUp);
    };
  }, []);

  useEffect(() => {
    fetchEmployeePayrollComprehensive();
  }, [id]);

  // When opened from the Pinjam page (?scrollTo=pinjam), jump to the Pinjam
  // summary at the bottom once the page has finished loading. Runs after the
  // scroll-restoration pass (double rAF) so it wins on a deliberate navigation.
  useEffect(() => {
    if (isLoading || !payroll) return;
    if (searchParams.get("scrollTo") !== "pinjam") return;
    if (hasConsumedPinjamScrollRef.current) return;

    hasConsumedPinjamScrollRef.current = true;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("scrollTo");
    setSearchParams(nextParams, { replace: true });

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById("pinjam-section");
        if (target) {
          target.scrollIntoView({ behavior: "auto", block: "end" });
        } else {
          const main = document.querySelector("main");
          if (main) main.scrollTop = main.scrollHeight;
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [isLoading, payroll, pinjamRecords, searchParams, setSearchParams]);

  const fetchEmployeePayrollComprehensive = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await getEmployeePayrollComprehensive(Number(id));

      // Set all data from the comprehensive response
      setPayroll(response);
      setMidMonthPayroll(response.mid_month_payroll);
      setMonthlyLeaveRecords(response.leave_records || []);
      setCommissionRecords(response.commission_records || []);
      setOthersRecords(response.others_records || []);
      setPinjamRecords(response.pinjam_records || []);
    } catch (error) {
      console.error("Error fetching comprehensive employee payroll:", error);
      toast.error("Failed to load employee payroll details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete || !itemToDelete.id) return;

    setIsDeleting(true);
    try {
      await deletePayrollItem(itemToDelete.id);
      toast.success("Item deleted successfully");
      await fetchEmployeePayrollComprehensive();
    } catch (error) {
      console.error("Error deleting payroll item:", error);
      toast.error("Failed to delete payroll item");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  const splitPayrollJobTypes = (jobType: string): string[] => {
    return jobType
      .split(",")
      .map((value: string) => value.trim())
      .filter((value: string) => value.length > 0);
  };

  const buildIndividualProcessCombinations =
    (): PayrollProcessEmployeeSelection[] => {
      if (!payroll) return [];

      const combinations: PayrollProcessEmployeeSelection[] = [];
      const seenCombinations: Set<string> = new Set();

      const addCombination = (employeeId: string, jobType: string): void => {
        if (!employeeId || !jobType) return;

        const key: string = `${employeeId}::${jobType}`;
        if (seenCombinations.has(key)) return;

        seenCombinations.add(key);
        combinations.push({ employeeId, jobType });
      };

      const employeeJobMapping: Record<string, string> | undefined =
        payroll.employee_job_mapping;

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
          },
        );
      }

      if (combinations.length === 0) {
        payroll.items
          .filter(
            (item: PayrollItem) => item.source_employee_id && item.job_type,
          )
          .forEach((item: PayrollItem) => {
            addCombination(item.source_employee_id || "", item.job_type || "");
          });
      }

      if (combinations.length === 0) {
        splitPayrollJobTypes(payroll.job_type).forEach((jobType: string) => {
          addCombination(payroll.employee_id, jobType);
        });
      }

      return combinations;
    };

  const handleReprocessPayroll = async (): Promise<void> => {
    if (!payroll?.monthly_payroll_id || isReprocessingPayroll) return;

    const selectedCombinations: PayrollProcessEmployeeSelection[] =
      buildIndividualProcessCombinations();
    if (selectedCombinations.length === 0) {
      toast.error("No employee jobs found for processing");
      return;
    }

    setIsReprocessingPayroll(true);
    try {
      const response = await processMonthlyPayrolls(
        payroll.monthly_payroll_id,
        {
          selected_employees: selectedCombinations,
          prune_unselected: false,
        },
      );

      if (response.errors?.length > 0) {
        toast.error(`Processed with ${response.errors.length} errors`);
      } else {
        toast.success("Payroll reprocessed successfully");
      }

      if (response.missing_income_tax_employees?.length > 0) {
        toast.error("Some employees are missing income tax rates");
      }

      await fetchEmployeePayrollComprehensive();
    } catch (error) {
      console.error("Error reprocessing employee payroll:", error);
      toast.error("Failed to reprocess payroll");
    } finally {
      setIsReprocessingPayroll(false);
    }
  };

  const handleBack = () => {
    if (shouldClearSearchOnBackRef.current) {
      markSearchClearOnReturn();
    } else {
      clearSearchClearOnReturn();
    }

    // Navigate back with year and month params to preserve the selected month
    if (payroll) {
      navigate(
        `/payroll/monthly-payrolls?year=${payroll.year}&month=${payroll.month}`,
      );
    } else {
      navigate("/payroll/monthly-payrolls");
    }
  };

  const handleBackMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    shouldClearSearchOnBackRef.current = event.ctrlKey;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Helper to format source date for display
  const formatSourceDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM");
    } catch {
      return dateStr;
    }
  };

  const getPayrollItemDateLabel = (item: PayrollItem): string => {
    if (item.source_date) return formatSourceDate(item.source_date);

    if (
      item.work_log_type === "monthly" &&
      item.work_log_id &&
      payroll?.year !== undefined &&
      payroll.month !== undefined
    ) {
      return format(
        new Date(payroll.year, payroll.month - 1, 1),
        "MMM yyyy",
      );
    }

    return "-";
  };

  const parseDisplayDate = (value: string | Date | null | undefined): Date | null => {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const trimmedValue: string = value.trim();
    const ymdMatch: RegExpMatchArray | null = trimmedValue.match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
    );
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsedDate = new Date(trimmedValue);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  };

  const formatDisplayDate = (
    value: string | Date | null | undefined,
    fallback: string = "-",
  ): string => {
    const parsedDate: Date | null = parseDisplayDate(value);
    return parsedDate ? format(parsedDate, "dd MMM yyyy") : fallback;
  };

  // Helper to generate work log URL for navigation
  const getWorkLogUrl = (item: PayrollItem): string | null => {
    // Production-derived items (base packing + threshold bonuses) aren't work
    // logs — they have no work_log_id — so link them back to the Production Entry
    // page for their date instead. Covers work_log_type "production",
    // "production_bonus" and "prod_bonus_rosak".
    if (item.work_log_type?.startsWith("prod") && item.source_date) {
      const sourceDate: string = format(
        new Date(item.source_date),
        "yyyy-MM-dd",
      );
      const productionParams: URLSearchParams = new URLSearchParams({
        date: sourceDate,
        search: payroll?.employee_name || "",
      });

      if (item.source_employee_id) {
        productionParams.set("workerId", item.source_employee_id);
      }

      return `/stock/production?${productionParams.toString()}`;
    }

    // Others (Kerja Luar) records surfaced as Tambahan/Overtime payroll items
    // link back to the Others page, with the employee name pre-filled.
    if (item.work_log_type === "others_record") {
      return incentiveEntryLink("/payroll/others");
    }

    if (!item.work_log_id || !item.work_log_type) return null;

    const jobType = item.job_type || "";

    // Map job_type to route path based on payrollJobConfigs
    // Handle both config keys (MEE, BIHUN) and specific job IDs (MEE_FOREMAN, BH_BERAS)
    const getRoutePath = (jt: string): string | null => {
      // Direct mapping for config keys
      const directMap: Record<string, string> = {
        MEE: "mee-production",
        BIHUN: "bihun-production",
        BOILER: "boiler-production",
        SALESMAN: "salesman-production",
        MAINTEN: "maintenance-monthly",
        OFFICE: "office-monthly",
        SAPU: "tukang-sapu-monthly",
      };

      if (directMap[jt]) return directMap[jt];

      // Match by prefix for specific job IDs (e.g., MEE_FOREMAN → mee-production)
      if (jt.startsWith("MEE")) return "mee-production";
      if (jt.startsWith("BH_") || jt.startsWith("BIHUN"))
        return "bihun-production";
      if (jt.startsWith("BOILER")) return "boiler-production";
      if (jt.startsWith("SALESMAN")) return "salesman-production";

      return null;
    };

    const routePath = getRoutePath(jobType);
    if (!routePath) return null;

    const workLogPath: string = `/payroll/${routePath}/${item.work_log_id}`;
    if (item.work_log_type === "daily") {
      const searchValue: string =
        payroll?.employee_name || item.source_employee_id || "";
      return searchValue
        ? `${workLogPath}?search=${encodeURIComponent(searchValue)}`
        : workLogPath;
    }

    if (item.work_log_type === "monthly" && payroll?.employee_name) {
      return `${workLogPath}?search=${encodeURIComponent(
        payroll.employee_name
      )}`;
    }

    return workLogPath;
  };

  const getDailyLeaveRoutePath = (
    section: string | null | undefined,
  ): string | null => {
    switch (section) {
      case "MEE":
        return "mee-production";
      case "BIHUN":
        return "bihun-production";
      case "BOILER":
        return "boiler-production";
      case "SALES":
      case "SALESMAN":
        return "salesman-production";
      default:
        return null;
    }
  };

  const getMonthlyLeaveRoutePath = (
    section: string | null | undefined,
  ): string | null => {
    switch (section) {
      case "MAINTENANCE":
      case "MAINTEN":
        return "maintenance-monthly";
      case "OFFICE":
        return "office-monthly";
      case "SAPU":
      case "TUKANG_SAPU":
        return "tukang-sapu-monthly";
      default:
        return null;
    }
  };

  const getPackingCutiRoutePath = (
    section: string | null | undefined,
  ): string | null => {
    switch (section) {
      case "MEE_PACKING":
        return "mee-packing-cuti";
      case "BH_PACKING":
        return "bihun-packing-cuti";
      default:
        return null;
    }
  };

  const getLeaveRecordUrl = (record: MonthlyLeaveRecord): string | null => {
    if (record.work_log_type === "daily" && record.work_log_id) {
      const routePath: string | null = getDailyLeaveRoutePath(
        record.work_log_section,
      );
      return routePath ? `/payroll/${routePath}/${record.work_log_id}` : null;
    }

    if (record.work_log_type === "monthly" && record.work_log_id) {
      const routePath: string | null = getMonthlyLeaveRoutePath(
        record.work_log_section,
      );
      if (!routePath) return null;

      const workLogPath: string = `/payroll/${routePath}/${record.work_log_id}`;
      return payroll?.employee_name
        ? `${workLogPath}?search=${encodeURIComponent(payroll.employee_name)}`
        : workLogPath;
    }

    if (record.work_log_type === "packing_cuti") {
      const routePath: string | null = getPackingCutiRoutePath(
        record.work_log_section,
      );
      return routePath ? `/payroll/${routePath}?date=${record.date}` : null;
    }

    return null;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="text-center py-12">
        <p className="text-default-500 dark:text-gray-400">
          Employee payroll not found
        </p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back
        </Button>
      </div>
    );
  }

  const isEditable = payroll.payroll_status !== "Finalized";

  // Merge duplicates within commission_records / others_records by description
  // so a description repeated across multiple rows collapses into one display line.
  type MergedAdvance<T> = T & {
    merged_amount: number;
    merged_count: number;
    merged_rows: T[];
  };
  const mergeByDescription = <
    T extends { description: string; amount: number },
  >(
    rows: T[],
  ): MergedAdvance<T>[] => {
    const map = new Map<string, MergedAdvance<T>>();
    rows.forEach((row) => {
      const key = (row.description || "").trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.merged_amount += Number(row.amount) || 0;
        existing.merged_count += 1;
        existing.merged_rows.push(row);
      } else {
        map.set(key, {
          ...row,
          merged_amount: Number(row.amount) || 0,
          merged_count: 1,
          merged_rows: [row],
        });
      }
    });
    return Array.from(map.values());
  };
  const getDescriptionKey = (description: string): string =>
    (description || "").trim().toLowerCase();
  const isCutiTahunanCommissionRecord = (
    record: CommissionRecord,
  ): boolean =>
    record.location_code === "23" ||
    getDescriptionKey(record.description) === "cuti tahunan";
  const cutiTahunanCommissionRecords: CommissionRecord[] =
    commissionRecords.filter(isCutiTahunanCommissionRecord);
  const nonCutiCommissionRecords: CommissionRecord[] = commissionRecords.filter(
    (record: CommissionRecord) => !isCutiTahunanCommissionRecord(record),
  );
  const commissionDescriptionKeys: Set<string> = new Set(
    nonCutiCommissionRecords.map((record: CommissionRecord) =>
      getDescriptionKey(record.description),
    ),
  );
  const isIncentiveOthersRecord = (record: OthersRecord): boolean =>
    record.pay_code_pay_type === "Tambahan" &&
    ((record.pay_code_id || "").toUpperCase() === "IXT" ||
      commissionDescriptionKeys.has(getDescriptionKey(record.description)));
  const isIncentivePayrollItem = (item: PayrollItem): boolean =>
    (item.pay_code_id || "").toUpperCase() === "IXT";
  const incentiveOthersRecords: OthersRecord[] = othersRecords.filter(
    isIncentiveOthersRecord,
  );
  const incentivePayrollItems: PayrollItem[] = payroll.items.filter(
    isIncentivePayrollItem,
  );
  const nonIncentivePayrollItems: PayrollItem[] = payroll.items.filter(
    (item: PayrollItem) => !isIncentivePayrollItem(item),
  );
  // Bonus paycode payroll items (Tambahan items with pay code BONUS). These are
  // folded into the same incentive stream below so a "Bonus" recorded as a
  // Tambahan paycode merges (by description) with a "Bonus" entered on the Bonus
  // page into a single line, instead of showing "Bonus + Bonus".
  const isBonusPayCode = (payCodeId?: string | null): boolean =>
    payCodeId === "BONUS";
  const bonusPayrollItems: PayrollItem[] = payroll.items.filter(
    (item: PayrollItem) => isBonusPayCode(item.pay_code_id),
  );
  const payrollMonthStartDate: string = `${payroll.year}-${String(
    payroll.month,
  ).padStart(2, "0")}-01`;
  const incentiveDisplayRecords: CommissionRecord[] = [
    ...nonCutiCommissionRecords,
    ...incentiveOthersRecords.map((record: OthersRecord) => ({
      id: -record.id,
      employee_id: record.employee_id,
      commission_date: record.record_date,
      amount: Number(record.amount) || 0,
      description: record.description,
      created_by: record.created_by || "",
      created_at: record.created_at || record.record_date,
      employee_name: record.employee_name,
      is_advance: false,
    })),
    ...incentivePayrollItems.map((item: PayrollItem) => ({
      id: item.id ? -item.id : 0,
      employee_id: item.source_employee_id || payroll.employee_id,
      commission_date: item.source_date || payrollMonthStartDate,
      amount: Number(item.amount) || 0,
      description: item.description,
      created_by: "",
      created_at: item.source_date || payrollMonthStartDate,
      employee_name: payroll.employee_name,
      is_advance: false,
    })),
    ...bonusPayrollItems.map((item: PayrollItem) => ({
      id: item.id ? -item.id : 0,
      employee_id: item.source_employee_id || payroll.employee_id,
      commission_date: item.source_date || payrollMonthStartDate,
      amount: Number(item.amount) || 0,
      description: item.description,
      created_by: "",
      created_at: item.source_date || payrollMonthStartDate,
      employee_name: payroll.employee_name,
      is_advance: false,
    })),
  ];
  const mergedCommissionRecords = mergeByDescription(incentiveDisplayRecords);
  const mergedCommissionTotal: number = mergedCommissionRecords.reduce(
    (sum, record) => sum + record.merged_amount,
    0,
  );
  // Per-record (un-merged) incentive rows for the detailed view. Each row keeps
  // its own date/amount and is tagged with the entry page it was created on so it
  // can deep-link back, prefilling that page's search box (where present) with
  // this payroll's employee name.
  type IncentiveDetailRow = {
    key: string;
    date: string;
    description: string;
    amount: number;
    link: string;
  };
  const incentiveEntryLink = (entryPath: string): string =>
    `${entryPath}?year=${payroll.year}&month=${payroll.month}&search=${encodeURIComponent(
      payroll.employee_name || "",
    )}`;
  // IXT/BONUS items can originate from a work log (daily/monthly) rather than the
  // Bonus page — in that case link to their work log, falling back to the Bonus
  // page for manually-added or page-entered incentives.
  const incentivePayrollItemLink = (item: PayrollItem): string =>
    getWorkLogUrl(item) ?? incentiveEntryLink("/payroll/bonus");
  const incentiveDetailRows: IncentiveDetailRow[] = [
    ...nonCutiCommissionRecords.map((record: CommissionRecord) => ({
      key: `commission-${record.id}`,
      date: record.commission_date,
      description: record.description,
      amount: Number(record.amount) || 0,
      // location_code present => Insentif/commission entry; null => Bonus entry.
      link: incentiveEntryLink(
        record.location_code ? "/payroll/commission" : "/payroll/bonus",
      ),
    })),
    ...incentiveOthersRecords.map((record: OthersRecord) => ({
      key: `others-${record.id}`,
      date: record.record_date,
      description: record.description,
      amount: Number(record.amount) || 0,
      link: incentiveEntryLink("/payroll/others"),
    })),
    ...incentivePayrollItems.map((item: PayrollItem, idx: number) => ({
      key: `ixt-${item.id ?? idx}`,
      date: item.source_date || payrollMonthStartDate,
      description: item.description,
      amount: Number(item.amount) || 0,
      link: incentivePayrollItemLink(item),
    })),
    ...bonusPayrollItems.map((item: PayrollItem, idx: number) => ({
      key: `bonus-${item.id ?? idx}`,
      date: item.source_date || payrollMonthStartDate,
      description: item.description,
      amount: Number(item.amount) || 0,
      link: incentivePayrollItemLink(item),
    })),
  ];
  const monthlyLeaveDisplayRecords: MonthlyLeaveRecord[] = [
    ...monthlyLeaveRecords,
    ...cutiTahunanCommissionRecords.map((record: CommissionRecord) => ({
      id: -record.id,
      employee_id: record.employee_id,
      date: record.commission_date,
      leave_type: "cuti_tahunan",
      days_taken: 1,
      amount_paid: Number(record.amount) || 0,
      status: "approved",
      work_log_id: null,
      work_log_type: null,
      notes: record.description,
      fromCommission: true,
    })),
  ];
  const isAdvanceCommissionRecord = (record: CommissionRecord): boolean =>
    record.is_advance !== false;
  const advanceCommissionRecords: CommissionRecord[] = commissionRecords.filter(
    isAdvanceCommissionRecord,
  );
  const mergedAdvanceCommissionRecords =
    mergeByDescription(advanceCommissionRecords);
  const getPayrollItemOthersPayType = (
    record: OthersRecord,
  ): PayrollItemOthersPayType | null => {
    if (
      record.pay_code_pay_type === "Tambahan" ||
      record.pay_code_pay_type === "Overtime"
    ) {
      return record.pay_code_pay_type;
    }
    return null;
  };
  const isPayrollItemOthersRecord = (record: OthersRecord): boolean =>
    getPayrollItemOthersPayType(record) !== null;
  const payrollItemOthersRecords: OthersRecord[] = othersRecords.filter(
    (record: OthersRecord) =>
      isPayrollItemOthersRecord(record) && !isIncentiveOthersRecord(record),
  );
  const regularOthersRecords: OthersRecord[] = othersRecords.filter(
    (record: OthersRecord) =>
      !isPayrollItemOthersRecord(record) && !isIncentiveOthersRecord(record),
  );
  const mergedOthersRecords = mergeByDescription(regularOthersRecords);
  // Wrap a single Others record in the merged shape so the detailed view can
  // reuse getMergedOthersPayCodeIds/getOthersRateQuantityDisplay while showing
  // one row per record.
  const toSingleMergedOthers = (
    record: OthersRecord,
  ): MergedAdvance<OthersRecord> => ({
    ...record,
    merged_amount: Number(record.amount) || 0,
    merged_count: 1,
    merged_rows: [record],
  });
  // Detailed view lists each record on its own row (linking back to /payroll/others);
  // consolidated view keeps the merged ×N rollup.
  const othersRowsToRender: MergedAdvance<OthersRecord>[] =
    viewMode === "detailed"
      ? mergedOthersRecords.flatMap((group) =>
          group.merged_rows.map(toSingleMergedOthers),
        )
      : mergedOthersRecords;

  // Commission advance + the rounded final pay ("Jumlah Digenapkan"). This is the
  // same expression rendered in the Deductions column below; computed once here so
  // the Pinjam table's monthly "before pinjam" base matches what's shown above.
  const commissionAdvanceTotal: number = advanceCommissionRecords.reduce(
    (sum, record) => sum + Number(record.amount),
    0,
  );
  const finalPaymentBeforeRounding: number =
    payroll.net_pay -
    (midMonthPayroll?.amount || 0) -
    commissionAdvanceTotal;
  const jumlahDigenapkan: number =
    payroll.setelah_digenapkan ?? Math.ceil(finalPaymentBeforeRounding);

  // Split pinjam records by type for the bottom-of-page Pinjam summary.
  const midMonthPinjamRecords: PinjamRecord[] = pinjamRecords.filter(
    (record: PinjamRecord) => record.pinjam_type === "mid_month",
  );
  const monthlyPinjamRecords: PinjamRecord[] = pinjamRecords.filter(
    (record: PinjamRecord) => record.pinjam_type === "monthly",
  );
  const midMonthPinjamTotal: number = midMonthPinjamRecords.reduce(
    (sum, record) => sum + Number(record.amount),
    0,
  );
  const monthlyPinjamTotal: number = monthlyPinjamRecords.reduce(
    (sum, record) => sum + Number(record.amount),
    0,
  );
  const hasMidMonthPinjam: boolean = midMonthPinjamRecords.length > 0;
  const hasMonthlyPinjam: boolean = monthlyPinjamRecords.length > 0;
  const hasBothPinjamPanels: boolean = hasMidMonthPinjam && hasMonthlyPinjam;
  const midMonthPayBeforePinjam: number = midMonthPayroll?.amount || 0;
  const midMonthFinalPay: number = midMonthPayBeforePinjam - midMonthPinjamTotal;
  const monthlyFinalPay: number = jumlahDigenapkan - monthlyPinjamTotal;

  // Pinjam amounts can go negative when advances/pinjam exceed earnings (the
  // worker owes money). Show the real value but render negatives in red so it
  // reads as owing rather than money received.
  const pinjamAmountColor = (value: number, positiveClass: string): string =>
    value < -0.005 ? "text-red-600 dark:text-red-400" : positiveClass;

  const getOthersRecordJobType = (record: OthersRecord): string | undefined => {
    const mappedJobType: string | undefined =
      payroll.employee_job_mapping?.[record.employee_id];
    if (mappedJobType) return mappedJobType;
    return payroll.job_type.includes(",") ? undefined : payroll.job_type;
  };

  const payrollItemOthersItems: PayrollItem[] =
    payrollItemOthersRecords.flatMap((record: OthersRecord) => {
      const payType: PayrollItemOthersPayType | null =
        getPayrollItemOthersPayType(record);
      if (!payType) return [];

      return [
        {
          id: -record.id,
          pay_code_id: record.pay_code_id || `OTHERS-${record.id}`,
          description: record.description,
          rate: Number(record.rate) || 0,
          rate_unit: record.rate_unit,
          quantity: Number(record.quantity) || 0,
          amount: Number(record.amount) || 0,
          is_manual: false,
          pay_type: payType,
          job_type: getOthersRecordJobType(record),
          source_employee_id: record.employee_id,
          source_date: record.record_date,
          work_log_id: null,
          // Sentinel so getWorkLogUrl links these back to the Others page.
          work_log_type: "others_record",
        },
      ];
    });
  const payrollItemsWithTypedOthers: PayrollItem[] = [
    ...nonIncentivePayrollItems,
    ...payrollItemOthersItems,
  ];

  // Hide leave-day activities from base pay — on a leave day the employee did not
  // actually work, so these rows pay nothing (quantity is 0) and the real leave
  // payment is shown separately in the Cuti section (from leave_records).
  const displayItems = filterOutLeaveDayItems(
    payrollItemsWithTypedOthers,
    payroll.leave_records,
  );

  const groupedItems = groupItemsByType(
    displayItems.map((item) => ({
      ...item,
      id: item.id || 0, // Ensure id is always a number
    })),
  );

  // Consolidated items for the consolidated view
  const consolidatedItems = consolidatePayrollItems(displayItems);
  const groupedConsolidatedItems =
    groupConsolidatedItemsByType(consolidatedItems);
  // Bonus paycode items are excluded from the Tambahan tables here; they are
  // shown together with Bonus-page records in the Bonus section instead.
  const consolidatedTambahanItems: ConsolidatedPayrollItem[] =
    groupedConsolidatedItems["Tambahan"].filter(
      (item: ConsolidatedPayrollItem) => !isBonusPayCode(item.pay_code_id),
    );
  const detailedTambahanItems: PayrollItem[] = groupedItems["Tambahan"].filter(
    (item: PayrollItem) => !isBonusPayCode(item.pay_code_id),
  );

  const getPayrollItemGroupKey = (
    payCodeId: string,
    rate: number,
    rateUnit: string,
  ): string => {
    return `${payCodeId}_${rate}_${rateUnit}`;
  };

  const getPayrollItemKey = (
    item: Pick<PayrollItem, "pay_code_id" | "rate" | "rate_unit">,
  ): string => {
    return getPayrollItemGroupKey(item.pay_code_id, item.rate, item.rate_unit);
  };

  const isMoneyEqual = (left: number, right: number): boolean => {
    return Math.abs(left - right) < 0.005;
  };

  const directAmountFixedKeys: Set<string> = new Set(
    payrollItemsWithTypedOthers
      .filter((item: PayrollItem) => {
        const amount: number = Number(item.amount) || 0;
        return (
          item.rate_unit === "Fixed" &&
          Number(item.rate) === 0 &&
          amount > 0
        );
      })
      .map((item: PayrollItem) => getPayrollItemKey(item)),
  );

  const isDirectAmountFixedItem = (
    item: Pick<PayrollItem, "pay_code_id" | "rate" | "rate_unit">,
  ): boolean => {
    return directAmountFixedKeys.has(getPayrollItemKey(item));
  };

  const getFixedDirectAmountSummary = (
    item: ConsolidatedPayrollItem,
  ): FixedDirectAmountSummary | null => {
    if (!isDirectAmountFixedItem(item)) return null;

    const matchingItems: PayrollItem[] = payrollItemsWithTypedOthers.filter(
      (payrollItem: PayrollItem) =>
        payrollItem.pay_code_id === item.pay_code_id &&
        payrollItem.rate === item.rate &&
        payrollItem.rate_unit === item.rate_unit,
    );

    return {
      paidEntries: matchingItems.filter(
        (payrollItem: PayrollItem) => Number(payrollItem.amount) > 0,
      ).length,
      totalEntries: matchingItems.length,
    };
  };

  // Detect if this is a combined job payroll (multiple job types)
  const uniqueJobTypes = [
    ...new Set(
      payrollItemsWithTypedOthers
        .map((item: PayrollItem) => item.job_type)
        .filter(Boolean),
    ),
  ];
  const isCombinedPayroll = uniqueJobTypes.length > 1;

  // Derive employee-to-job-types mapping from actual payroll items
  // This handles cases where one employee ID works on multiple job types
  const derivedEmployeeJobMapping = payrollItemsWithTypedOthers.reduce(
    (acc, item) => {
      const empId = item.source_employee_id || payroll.employee_id;
      if (empId && item.job_type) {
        if (!acc[empId]) {
          acc[empId] = new Set<string>();
        }
        acc[empId].add(item.job_type);
      }
      return acc;
    },
    {} as Record<string, Set<string>>,
  );

  // Group items by job type first, then by pay type for combined payrolls
  const itemsByJob = isCombinedPayroll
    ? uniqueJobTypes.reduce(
        (acc, jobType) => {
          const jobItems = displayItems.filter(
            (item) => item.job_type === jobType,
          );
          acc[jobType as string] = groupItemsByType(
            jobItems.map((item) => ({
              ...item,
              id: item.id || 0,
            })),
          );
          return acc;
        },
        {} as Record<string, ReturnType<typeof groupItemsByType>>,
      )
    : null;

  // Consolidated items by job type for combined payrolls
  const consolidatedItemsByJob = isCombinedPayroll
    ? uniqueJobTypes.reduce(
        (acc, jobType) => {
          const jobItems = displayItems.filter(
            (item) => item.job_type === jobType,
          );
          const consolidated = consolidatePayrollItems(jobItems);
          acc[jobType as string] = groupConsolidatedItemsByType(consolidated);
          return acc;
        },
        {} as Record<string, ReturnType<typeof groupConsolidatedItemsByType>>,
      )
    : null;

  // Calculate totals for each group - use consolidated items for consistency with recalculated amounts
  const baseTotal = groupedConsolidatedItems["Base"].reduce(
    (sum, item) => sum + item.total_amount,
    0,
  );
  const tambahanTotal = consolidatedTambahanItems.reduce(
    (sum, item) => sum + item.total_amount,
    0,
  );
  const overtimeTotal = groupedConsolidatedItems["Overtime"].reduce(
    (sum, item) => sum + item.total_amount,
    0,
  );

  type BaseRateSummaryUnit = "Bag" | "Ctn" | "Hour";

  type BaseRateSummary = {
    unit: BaseRateSummaryUnit;
    averageRate: number;
    totalUnits: number;
    totalAmount: number;
  };

  const BASE_RATE_SUMMARY_UNITS: BaseRateSummaryUnit[] = ["Bag", "Ctn", "Hour"];

  const isBaseRateSummaryUnit = (
    rateUnit: string,
  ): rateUnit is BaseRateSummaryUnit => {
    return rateUnit === "Bag" || rateUnit === "Ctn" || rateUnit === "Hour";
  };

  const formatUnitQuantity = (quantity: number): string => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: Number.isInteger(quantity) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(quantity);
  };

  // Rate / quantity split into separate display strings so the Others table can
  // use the same Rate and Total Qty columns as the Base/Tambahan/Overtime tables.
  const getOthersRateQuantityDisplay = (
    record: MergedAdvance<OthersRecord>,
  ): { rate: string; quantity: string } => {
    const rows: OthersRecord[] =
      record.merged_rows.length > 0 ? record.merged_rows : [record];
    const rate: number = Number(rows[0].rate) || 0;
    const rateUnit: string = rows[0].rate_unit;
    const hasConsistentRate: boolean = rows.every(
      (row: OthersRecord) =>
        row.rate_unit === rateUnit && isMoneyEqual(Number(row.rate) || 0, rate),
    );

    if (!hasConsistentRate) return { rate: "Mixed rates", quantity: "-" };

    if (rateUnit === "Fixed") {
      const allDirectAmountFixed: boolean = rows.every((row: OthersRecord) => {
        const quantity: number = Number(row.quantity) || 0;
        const amount: number = Number(row.amount) || 0;
        return amount > 0 && (rate === 0 || isMoneyEqual(quantity, amount));
      });

      if (allDirectAmountFixed) {
        return {
          rate: "Ikut amaun",
          quantity: rows.length === 1 ? "-" : `${rows.length} entries`,
        };
      }

      return {
        rate:
          rows.length > 1
            ? `Fixed (${formatCurrency(rate)})`
            : `${formatCurrency(rate)}/Fixed`,
        quantity: rows.length === 1 ? "-" : String(rows.length),
      };
    }

    const quantity: number = rows.reduce(
      (sum: number, row: OthersRecord) => sum + (Number(row.quantity) || 0),
      0,
    );

    return {
      rate: `${formatCurrency(rate)}/${rateUnit}`,
      quantity: formatUnitQuantity(quantity),
    };
  };

  const getMergedOthersPayCodeIds = (
    record: MergedAdvance<OthersRecord>,
  ): string[] => {
    const rows: OthersRecord[] =
      record.merged_rows.length > 0 ? record.merged_rows : [record];
    return Array.from(
      new Set(
        rows
          .map((row: OthersRecord) => row.pay_code_id)
          .filter((payCodeId): payCodeId is string => Boolean(payCodeId)),
      ),
    );
  };

  const getTotalUnitQuantity = (item: ConsolidatedPayrollItem): number => {
    const quantity: number = Number(item.total_quantity) || 0;
    const focUnits: number = Number(item.total_foc_units) || 0;
    return quantity + focUnits;
  };

  const getBaseRateSummaryUnits = (
    baseItems: ConsolidatedPayrollItem[],
  ): BaseRateSummaryUnit[] => {
    return BASE_RATE_SUMMARY_UNITS.filter((unit) =>
      baseItems.some((item) => item.rate_unit === unit),
    );
  };

  const shouldShowBaseRateSummary = (
    summaryItems: ConsolidatedPayrollItem[],
    unit: BaseRateSummaryUnit,
  ): boolean => {
    if (unit === "Ctn") return true;
    return unit !== "Bag" || summaryItems.length > 1;
  };

  const calculateBaseRateSummary = (
    baseItems: ConsolidatedPayrollItem[],
    unit: BaseRateSummaryUnit,
  ): BaseRateSummary => {
    const unitItems: ConsolidatedPayrollItem[] = baseItems.filter(
      (item) => item.rate_unit === unit,
    );
    const totalAmount: number = unitItems.reduce(
      (sum, item) => sum + (Number(item.total_amount) || 0),
      0,
    );

    if (unit === "Bag" || unit === "Ctn") {
      const totalUnits: number = unitItems.reduce(
        (sum, item) => sum + getTotalUnitQuantity(item),
        0,
      );

      return {
        unit,
        averageRate: totalUnits > 0 ? totalAmount / totalUnits : 0,
        totalUnits,
        totalAmount,
      };
    }

    // Hourly rows can repeat the same hours across multiple tasks, so use one
    // representative quantity instead of summing duplicated hours.
    const representativeHours: number =
      unitItems.length > 0 ? Number(unitItems[0].total_quantity) || 0 : 0;

    return {
      unit,
      averageRate:
        representativeHours > 0 ? totalAmount / representativeHours : 0,
      totalUnits: representativeHours,
      totalAmount,
    };
  };

  // Helper to format job type for display
  const formatJobType = (jobType: string): string => {
    const jobTypeMap: Record<string, string> = {
      MEE: "Mee",
      BIHUN: "Bihun",
      MAINTEN: "Maintenance",
    };
    return jobTypeMap[jobType] || jobType;
  };

  // Helper to get sorted items by date for detailed view with day separators
  const getSortedItemsWithSeparators = (items: PayrollItem[]) => {
    const sorted = [...items].sort((a, b) => {
      if (!a.source_date && !b.source_date) return 0;
      if (!a.source_date) return 1;
      if (!b.source_date) return -1;
      return a.source_date.localeCompare(b.source_date);
    });
    return sorted;
  };

  // Helper to render consolidated table row
  const renderConsolidatedRow = (
    item: ConsolidatedPayrollItem,
    index: number,
    options: { sectionTopBorder?: boolean } = {},
  ) => {
    const fixedDirectAmountSummary: FixedDirectAmountSummary | null =
      getFixedDirectAmountSummary(item);
    // Find the original item for deletion (only for single manual items)
    const canDelete = item.is_manual && item.item_count === 1 && isEditable;
    const originalItem = canDelete
      ? payroll.items.find(
          (i) =>
            i.pay_code_id === item.pay_code_id &&
            i.rate === item.rate &&
            i.rate_unit === item.rate_unit &&
            i.is_manual,
        )
      : null;

    return (
      <tr
        key={`${item.pay_code_id}-${item.rate}-${index}`}
        className={`hover:bg-default-50 dark:hover:bg-gray-700 ${
          options.sectionTopBorder
            ? "border-t border-default-300 dark:border-gray-600"
            : ""
        }`}
      >
        <td className="px-3 py-2">
          <span
            className="text-sm text-default-900 dark:text-gray-100"
            title={`${item.description} (${item.pay_code_id})`}
          >
            {item.description}{" "}
            <span className="text-default-500 dark:text-gray-400">
              ({item.pay_code_id})
            </span>
            {item.item_count > 1 && (
              <span className="ml-1.5 px-1 py-0.5 text-xs rounded bg-default-100 dark:bg-gray-700 text-default-500 dark:text-gray-400">
                {item.item_count} entries
              </span>
            )}
            {item.is_manual && (
              <span className="ml-1.5 px-1 py-0.5 text-xs rounded bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300">
                Manual
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
          {fixedDirectAmountSummary
            ? "Ikut amaun"
            : item.rate_unit === "Percent"
              ? `${item.rate}%`
              : item.rate_unit === "Fixed" && item.item_count > 1
                ? `Fixed (${formatCurrency(item.rate)})`
                : `${formatCurrency(item.rate)}/${item.rate_unit}`}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
          {fixedDirectAmountSummary ? (
            `${fixedDirectAmountSummary.paidEntries} paid / ${fixedDirectAmountSummary.totalEntries} entries`
          ) : item.rate_unit === "Fixed" && item.item_count > 1 ? (
            item.item_count
          ) : (
            <>
              {item.total_quantity}
              {item.total_foc_units > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 text-xs ml-1">
                  (+{Math.round(item.total_foc_units)})
                </span>
              )}
            </>
          )}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
          {formatCurrency(item.total_amount)}
        </td>
        {canDelete && originalItem && (
          <td className="px-3 py-2 whitespace-nowrap text-center">
            <button
              onClick={() => {
                setItemToDelete({ ...originalItem, id: originalItem.id || 0 });
                setShowDeleteDialog(true);
              }}
              className="text-rose-600 hover:text-rose-800"
            >
              <IconTrash size={16} />
            </button>
          </td>
        )}
      </tr>
    );
  };

  // Helper to render detailed table row with optional day separator
  const renderDetailedRow = (
    item: PayrollItem,
    index: number,
    items: PayrollItem[],
    showDeleteButton: boolean = false,
  ) => {
    const prevItem = index > 0 ? items[index - 1] : null;
    const isNewDay =
      prevItem && prevItem.source_date !== item.source_date && item.source_date;
    const colCount = showDeleteButton && isEditable ? 6 : 5;
    const focUnits: number = Number(item.foc_units) || 0;
    const workLogUrl: string | null = getWorkLogUrl(item);
    const dateLabel: string = getPayrollItemDateLabel(item);

    return (
      <React.Fragment key={item.id}>
        {isNewDay && (
          <tr className="bg-default-100 dark:bg-gray-700">
            <td
              colSpan={colCount}
              className="px-3 py-1.5 text-xs font-semibold text-default-600 dark:text-gray-300 border-t-2 border-default-300 dark:border-gray-600"
            >
              {formatSourceDate(item.source_date)}
            </td>
          </tr>
        )}
        <tr className="hover:bg-default-50 dark:hover:bg-gray-700">
          <td className="px-3 py-2 whitespace-nowrap text-left text-sm">
            {dateLabel !== "-" ? (
              workLogUrl ? (
                <Link
                  to={workLogUrl}
                  className="text-sky-600 dark:text-sky-400 hover:underline"
                >
                  {dateLabel}
                </Link>
              ) : (
                dateLabel
              )
            ) : (
              "-"
            )}
          </td>
          <td className="px-3 py-2">
            <span
              className="text-sm text-default-900 dark:text-gray-100"
              title={`${item.description} (${item.pay_code_id})`}
            >
              {item.description}{" "}
              <span className="text-default-500 dark:text-gray-400">
                ({item.pay_code_id})
              </span>
              {item.is_manual && (
                <span className="ml-1.5 px-1 py-0.5 text-xs rounded bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300">
                  Manual
                </span>
              )}
            </span>
          </td>
          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
            {isDirectAmountFixedItem(item)
              ? "Ikut amaun"
              : item.rate_unit === "Percent"
                ? `${item.rate}%`
                : item.rate_unit === "Fixed" && item.quantity > 1
                  ? "Fixed"
                  : `${formatCurrency(item.rate)}/${item.rate_unit}`}
          </td>
          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
            {item.rate_unit === "Fixed" ? (
              "-"
            ) : (
              <>
                {item.quantity}
                {focUnits > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 text-xs ml-1">
                    (+{Math.round(focUnits)})
                  </span>
                )}
              </>
            )}
          </td>
          <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
            {formatCurrency(item.amount)}
          </td>
          {showDeleteButton && isEditable && (item.id ?? 0) > 0 && (
            <td className="px-3 py-2 whitespace-nowrap text-center">
              <button
                onClick={() => {
                  setItemToDelete({ ...item, id: item.id || 0 });
                  setShowDeleteDialog(true);
                }}
                className="text-rose-600 hover:text-rose-800"
              >
                <IconTrash size={16} />
              </button>
            </td>
          )}
        </tr>
      </React.Fragment>
    );
  };

  const shouldShowBaseFinalTotal = (
    baseItems: ConsolidatedPayrollItem[],
  ): boolean => {
    const summaryUnits: BaseRateSummaryUnit[] =
      getBaseRateSummaryUnits(baseItems);
    const otherItems: ConsolidatedPayrollItem[] = baseItems.filter(
      (item) => !isBaseRateSummaryUnit(item.rate_unit),
    );

    return otherItems.length > 0 || summaryUnits.length !== 1;
  };

  const renderBaseSummaryRow = (
    baseItems: ConsolidatedPayrollItem[],
    unit: BaseRateSummaryUnit,
    totalLabel: string,
  ): React.ReactElement => {
    const summary: BaseRateSummary = calculateBaseRateSummary(baseItems, unit);
    const unitLabel: string = unit === "Hour" ? "Jam" : unit;
    const summaryLabel: string = shouldShowBaseFinalTotal(baseItems)
      ? `${unitLabel} Summary`
      : totalLabel;

    return (
      <tr
        key={`base-${unit}-summary`}
        className="bg-default-50 dark:bg-gray-800 border-y border-default-300 dark:border-gray-600"
      >
        {viewMode === "detailed" && <td className="px-3 py-2" />}
        <td className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300">
          {summaryLabel}
        </td>
        <td className="px-3 py-2 text-center text-sm font-semibold text-default-800 dark:text-gray-100">
          Rate/{unitLabel}: {formatCurrency(summary.averageRate)}
        </td>
        <td className="px-3 py-2 text-center text-sm font-medium text-default-600 dark:text-gray-300">
          Jumlah {unitLabel}: {formatUnitQuantity(summary.totalUnits)}
        </td>
        <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
          {formatCurrency(summary.totalAmount)}
        </td>
      </tr>
    );
  };

  const renderBaseTotalRow = (
    totalAmount: number,
    totalLabel: string,
  ): React.ReactElement => {
    return (
      <tr>
        <td
          colSpan={viewMode === "detailed" ? 4 : 3}
          className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
        >
          {totalLabel}
        </td>
        <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
          {formatCurrency(totalAmount)}
        </td>
      </tr>
    );
  };

  const renderBaseOtherSubtotalRow = (
    baseItems: ConsolidatedPayrollItem[],
  ): React.ReactElement => {
    const otherTotalAmount: number = baseItems
      .filter((item) => !isBaseRateSummaryUnit(item.rate_unit))
      .reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0);

    return (
      <tr
        key="base-other-subtotal"
        className="bg-default-50 dark:bg-gray-800 border-y border-default-300 dark:border-gray-600"
      >
        {viewMode === "detailed" && <td className="px-3 py-2" />}
        <td
          colSpan={3}
          className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
        >
          Jumlah lain-lain
        </td>
        <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
          {formatCurrency(otherTotalAmount)}
        </td>
      </tr>
    );
  };

  const renderBaseConsolidatedRows = (
    baseItems: ConsolidatedPayrollItem[],
    totalLabel: string,
  ): React.ReactElement[] => {
    const rows: React.ReactElement[] = [];
    const summaryUnits: BaseRateSummaryUnit[] =
      getBaseRateSummaryUnits(baseItems);
    let rowIndex = 0;
    let hasRenderedSection = false;

    summaryUnits.forEach((unit) => {
      const unitItems: ConsolidatedPayrollItem[] = baseItems.filter(
        (item) => item.rate_unit === unit,
      );

      unitItems.forEach((item, itemIndex) => {
        rows.push(
          renderConsolidatedRow(item, rowIndex, {
            sectionTopBorder: hasRenderedSection && itemIndex === 0,
          }),
        );
        rowIndex += 1;
      });

      if (shouldShowBaseRateSummary(unitItems, unit)) {
        rows.push(renderBaseSummaryRow(baseItems, unit, totalLabel));
      }
      hasRenderedSection = true;
    });

    const otherItems: ConsolidatedPayrollItem[] = baseItems.filter(
      (item) => !isBaseRateSummaryUnit(item.rate_unit),
    );

    otherItems.forEach((item, itemIndex) => {
      rows.push(
        renderConsolidatedRow(item, rowIndex, {
          sectionTopBorder: hasRenderedSection && itemIndex === 0,
        }),
      );
      rowIndex += 1;
    });

    if (otherItems.length > 0 && summaryUnits.length > 0) {
      rows.push(renderBaseOtherSubtotalRow(baseItems));
    }

    return rows;
  };

  const renderBaseDetailedRows = (
    detailedBaseItems: PayrollItem[],
    consolidatedBaseItems: ConsolidatedPayrollItem[],
    totalLabel: string,
  ): React.ReactElement[] => {
    const rows: React.ReactElement[] = [];
    const summaryUnits: BaseRateSummaryUnit[] = getBaseRateSummaryUnits(
      consolidatedBaseItems,
    );

    summaryUnits.forEach((unit) => {
      const unitItems: PayrollItem[] = getSortedItemsWithSeparators(
        detailedBaseItems.filter((item) => item.rate_unit === unit),
      );

      unitItems.forEach((item, index, items) => {
        rows.push(renderDetailedRow(item, index, items, false));
      });

      const consolidatedUnitItems: ConsolidatedPayrollItem[] =
        consolidatedBaseItems.filter((item) => item.rate_unit === unit);

      if (shouldShowBaseRateSummary(consolidatedUnitItems, unit)) {
        rows.push(renderBaseSummaryRow(consolidatedBaseItems, unit, totalLabel));
      }
    });

    const otherItems: PayrollItem[] = getSortedItemsWithSeparators(
      detailedBaseItems.filter(
        (item) => !isBaseRateSummaryUnit(item.rate_unit),
      ),
    );

    otherItems.forEach((item, index, items) => {
      rows.push(renderDetailedRow(item, index, items, false));
    });

    if (otherItems.length > 0 && summaryUnits.length > 0) {
      rows.push(renderBaseOtherSubtotalRow(consolidatedBaseItems));
    }

    return rows;
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-1 z-20 -mx-1 flex flex-col items-start justify-between gap-2 rounded-lg border border-default-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <BackButton onClick={handleBack} onMouseDown={handleBackMouseDown} />
          <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
          <div className="min-w-0">
            <h1
              className="max-w-48 truncate text-xl font-semibold text-default-800 dark:text-gray-100 sm:max-w-72"
              title={payroll.employee_name || "Unknown employee"}
            >
              {payroll.employee_name || "Unknown employee"}
            </h1>
            <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
              {getMonthName(payroll.month)} {payroll.year}
            </p>
          </div>
          <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border border-default-300 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => handleViewModeChange("consolidated")}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-sm ${
                viewMode === "consolidated"
                  ? "bg-sky-500 text-white"
                  : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
              }`}
              title="Summary View - Shows totals grouped by item"
            >
              <IconList size={16} />
              Summary
            </button>
            <button
              onClick={() => handleViewModeChange("detailed")}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-sm ${
                viewMode === "detailed"
                  ? "bg-sky-500 text-white"
                  : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
              }`}
              title="Detailed View - Shows per-day breakdown"
            >
              <IconListDetails size={16} />
              Detailed
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 md:mt-0 w-full md:w-auto">
          {isEditable && (
            <Button
              onClick={handleReprocessPayroll}
              icon={IconRefresh}
              variant="outline"
              color="sky"
              disabled={isReprocessingPayroll}
              className="flex-1 md:flex-none"
            >
              {isReprocessingPayroll ? "Processing..." : "Re-process"}
            </Button>
          )}
          <PrintPayslipButton
            payroll={payroll}
            midMonthPayroll={midMonthPayroll}
            buttonText={
              payroll.job_type?.includes(", ")
                ? "Per Job"
                : "Pay Slip"
            }
            variant="filled"
            color="sky"
            className="flex-1 md:flex-none shadow-sm"
          />
          {payroll.job_type?.includes(", ") && (
            <PrintPayslipButton
              payroll={payroll}
              midMonthPayroll={midMonthPayroll}
              mode="combined"
              buttonText="Combined"
              variant="outline"
              color="sky"
              className="flex-1 md:flex-none"
            />
          )}
          <DownloadPayslipButton
            payroll={payroll}
            midMonthPayroll={midMonthPayroll}
            buttonText={
              payroll.job_type?.includes(", ")
                ? "Full PDF"
                : "PDF"
            }
            variant="default"
            color="sky"
            className="flex-1 md:flex-none"
          />
          {isEditable && (
            <Button
              onClick={() => setShowAddItemModal(true)}
              icon={IconPlus}
              variant="default"
              color="default"
              className="flex-1 md:flex-none"
            >
              Manual Item
            </Button>
          )}
        </div>
      </div>

      {/* Payroll Summary Grid */}
      <div className="mb-2 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Employee Information Column */}
        <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-default-50 dark:bg-gray-900/50 border-b border-default-100 dark:border-gray-700">
            <h3 className="text-md font-semibold text-default-700 dark:text-gray-200">
              Employee Information
            </h3>
          </div>
          <div className="p-4 flex flex-col h-full">
            <div className="space-y-4 flex-grow">
              {/* Employee Name */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-400 mb-1">
                  Employee
                </p>
                {isCombinedPayroll &&
                Object.keys(derivedEmployeeJobMapping).length > 0 ? (
                  <>
                    <p className="font-semibold text-default-800 dark:text-gray-100">
                      {payroll.employee_name || "Unknown"}
                    </p>
                    <div className="mt-2 space-y-1">
                      {Object.entries(derivedEmployeeJobMapping).map(
                        ([empId, jobTypesSet]) => (
                          <div
                            key={empId}
                            className="flex items-center text-sm"
                          >
                            <Link
                              to={`/catalogue/staff/${empId}`}
                              className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
                            >
                              {empId}
                            </Link>
                            <span className="mx-2 text-default-300 dark:text-gray-600">
                              →
                            </span>
                            <span className="text-default-600 dark:text-gray-300">
                              {Array.from(jobTypesSet).join(", ")}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-default-800 dark:text-gray-100">
                      <Link
                        to={`/catalogue/staff/${payroll.employee_id}`}
                        className="text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        {payroll.employee_name || "Unknown"}
                      </Link>
                    </p>
                    <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
                      {payroll.employee_id}
                    </p>
                  </>
                )}
              </div>

              {/* Job Type */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-400 mb-1">
                  Job Type
                </p>
                <p className="font-semibold text-default-800 dark:text-gray-100">
                  {payroll.job_type}
                </p>
                <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
                  {payroll.section}
                </p>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-400 mb-1">
                  Status
                </p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                    payroll.payroll_status === "CONFIRMED"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      : payroll.payroll_status === "PENDING"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                        : "bg-default-100 text-default-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {payroll.payroll_status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Earnings Column */}
        <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 flex flex-col transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/50">
            <h3 className="text-md font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <IconCash
                size={18}
                className="text-emerald-600 dark:text-emerald-400"
              />
              Earnings
            </h3>
          </div>
          <div className="p-4 flex flex-col flex-grow">
            <div className="space-y-2 flex-grow">
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Base Pay
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(baseTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Tambahan
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(tambahanTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Overtime
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(overtimeTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Cuti Pay
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(
                    monthlyLeaveDisplayRecords.reduce(
                      (sum, record) => sum + Number(record.amount_paid),
                      0,
                    ),
                  )}
                </span>
              </div>
              {mergedCommissionRecords.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    {mergedCommissionRecords
                      .map((record) => record.description)
                      .join(" + ")}
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(mergedCommissionTotal)}
                  </span>
                </div>
              )}
              {mergedOthersRecords.length > 0 &&
                (() => {
                  const othersJoined = mergedOthersRecords
                    .map((record) => record.description)
                    .join(" + ");
                  return (
                    <div className="flex justify-between text-sm gap-2">
                      <span
                        className="text-default-600 dark:text-gray-300 truncate min-w-0"
                        title={othersJoined}
                      >
                        {othersJoined}
                      </span>
                      <span className="font-medium text-default-800 dark:text-gray-100 flex-shrink-0">
                        {formatCurrency(
                          mergedOthersRecords.reduce(
                            (sum, record) => sum + record.merged_amount,
                            0,
                          ),
                        )}
                      </span>
                    </div>
                  );
                })()}
            </div>
            <div className="border-t border-default-200 dark:border-gray-600 mt-auto pt-3">
              <div className="flex justify-between font-semibold">
                <span className="text-default-800 dark:text-gray-100">
                  Gross Pay
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 text-lg">
                  {formatCurrency(payroll.gross_pay)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Deductions & Final Payment Column */}
        <div className="border border-sky-200 dark:border-sky-800/50 rounded-lg bg-white dark:bg-gray-800 flex flex-col transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-sky-50 dark:bg-sky-900/20 border-b border-sky-100 dark:border-sky-800/50 rounded-t-lg">
            <h3 className="text-md font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-2">
              <IconReceipt
                size={18}
                className="text-sky-600 dark:text-sky-400"
              />
              Deductions & Final Pay
            </h3>
          </div>
          <div className="p-4 flex flex-col flex-grow">
            <div className="space-y-2 flex-grow">
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Gross Pay
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(payroll.gross_pay)}
                </span>
              </div>

              {/* Dotted divider */}
              <div className="border-t border-dashed border-default-300 dark:border-gray-600 my-2"></div>

              {/* Statutory Deductions with Tooltips */}
              {payroll.deductions
                ?.filter((d) => d.employee_amount > 0)
                .sort((a, b) => {
                  const order = ["EPF", "SIP", "SOCSO", "INCOME_TAX"];
                  const aIndex = order.indexOf(a.deduction_type.toUpperCase());
                  const bIndex = order.indexOf(b.deduction_type.toUpperCase());
                  return (
                    (aIndex === -1 ? 999 : aIndex) -
                    (bIndex === -1 ? 999 : bIndex)
                  );
                })
                .map((deduction) => {
                  const deductionType = deduction.deduction_type.toUpperCase();
                  const deductionName =
                    deductionType === "INCOME_TAX"
                      ? "Income Tax"
                      : deductionType;
                  const percentage =
                    payroll.gross_pay > 0
                      ? (
                          (deduction.employee_amount / payroll.gross_pay) *
                          100
                        ).toFixed(1)
                      : "0";
                  return (
                    <div
                      key={deduction.deduction_type}
                      className="group relative flex justify-between text-sm"
                    >
                      <span className="text-default-600 dark:text-gray-300 flex items-center gap-1 cursor-help">
                        {deductionName}
                        <IconInfoCircle
                          size={14}
                          className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                        />
                        <span className="text-xs text-default-400 dark:text-gray-400">
                          ({percentage}%)
                        </span>
                      </span>
                      <span className="font-medium text-rose-600 dark:text-rose-400">
                        - {formatCurrency(deduction.employee_amount)}
                      </span>
                      {/* Tooltip - appears below */}
                      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                        <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                          <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800"></div>
                          <div className="font-semibold mb-2 text-default-100">
                            {deductionName} Breakdown
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-default-300">
                                Employee:
                              </span>
                              <span>
                                {formatCurrency(deduction.employee_amount)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-default-300">
                                Employer:
                              </span>
                              <span>
                                {formatCurrency(deduction.employer_amount)}
                              </span>
                            </div>
                            <div className="border-t border-default-600 mt-2 pt-2">
                              <div className="flex justify-between text-default-400">
                                <span>Employee Rate:</span>
                                <span>{deduction.rate_info.employee_rate}</span>
                              </div>
                              <div className="flex justify-between text-default-400">
                                <span>Employer Rate:</span>
                                <span>{deduction.rate_info.employer_rate}</span>
                              </div>
                              {deduction.rate_info.age_group && (
                                <div className="flex justify-between text-default-400">
                                  <span>Age Group:</span>
                                  <span className="capitalize">
                                    {deduction.rate_info.age_group.replace(
                                      /_/g,
                                      " ",
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Commission Advance with Tooltip */}
              {mergedAdvanceCommissionRecords.length > 0 && (
                <div className="group relative flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300 flex items-center gap-1 cursor-help">
                    {mergedAdvanceCommissionRecords
                      .map((record) => record.description)
                      .join(" + ")}{" "}
                    Advance
                    <IconInfoCircle
                      size={14}
                      className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                    />
                  </span>
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    -{" "}
                    {formatCurrency(
                      mergedAdvanceCommissionRecords.reduce(
                        (sum, record) => sum + record.merged_amount,
                        0,
                      ),
                    )}
                  </span>
                  {/* Tooltip - appears below */}
                  <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                      <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800"></div>
                      <div className="font-semibold mb-2 text-default-100">
                        Commission Advance
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-default-300">
                            Total Amount:
                          </span>
                          <span>
                            {formatCurrency(
                              mergedAdvanceCommissionRecords.reduce(
                                (sum, record) => sum + record.merged_amount,
                                0,
                              ),
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-default-300">Records:</span>
                          <span>{advanceCommissionRecords.length}</span>
                        </div>
                      </div>
                      <div className="border-t border-default-600 mt-2 pt-2 text-default-400">
                        Payments made in advance, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Mid-month Advance with Tooltip */}
              {midMonthPayroll && (
                <div className="group relative flex justify-between text-sm">
                  <Link
                    to={`/payroll/mid-month-payrolls?year=${midMonthPayroll.year}&month=${midMonthPayroll.month}&search=${encodeURIComponent(
                      payroll.employee_name || ""
                    )}`}
                    className="flex flex-1 items-center justify-between rounded text-default-600 hover:text-sky-600 dark:text-gray-300 dark:hover:text-sky-400"
                  >
                    <span className="flex items-center gap-1 cursor-help">
                      Mid-month Advance
                      <IconInfoCircle
                        size={14}
                        className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                      />
                    </span>
                    <span className="font-medium text-rose-600 dark:text-rose-400">
                      - {formatCurrency(midMonthPayroll.amount)}
                    </span>
                  </Link>
                  {/* Tooltip - appears below */}
                  <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                      <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800"></div>
                      <div className="font-semibold mb-2 text-default-100">
                        Mid-month Advance
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-default-300">Amount:</span>
                          <span>{formatCurrency(midMonthPayroll.amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-default-300">Date:</span>
                          <span>
                            {format(
                              new Date(midMonthPayroll.created_at),
                              "dd MMM yyyy",
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="border-t border-default-600 mt-2 pt-2 text-default-400">
                        Advance payment made mid-month, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Total Deductions */}
              <div className="border-t border-default-200 dark:border-gray-600 mt-2 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300 font-medium">
                    Total Deductions
                  </span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    -{" "}
                    {formatCurrency(
                      (() => {
                        const statutoryDeductions =
                          payroll.deductions
                            ?.filter((d) => d.employee_amount > 0)
                            .reduce((sum, d) => sum + d.employee_amount, 0) ||
                          0;
                        const midMonthAdvance = midMonthPayroll?.amount || 0;
                        return (
                          statutoryDeductions +
                          commissionAdvanceTotal +
                          midMonthAdvance
                        );
                      })(),
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Digenapkan (Rounding) - Only show if there's an adjustment */}
            {(() => {
              // Use stored rounding values if available, otherwise calculate
              const digenapkan =
                payroll.digenapkan ??
                Math.ceil(finalPaymentBeforeRounding) -
                  finalPaymentBeforeRounding;

              return digenapkan > 0.001 ? (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-default-600 dark:text-gray-300">
                    Digenapkan
                  </span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    + {formatCurrency(digenapkan)}
                  </span>
                </div>
              ) : null;
            })()}

            {/* Jumlah Digenapkan - Highlighted */}
            <div className="bg-sky-100 dark:bg-sky-900/30 -mx-4 -mb-4 mt-4 px-4 py-4 border-t border-sky-200 dark:border-sky-800/50 rounded-b-lg">
              <div className="flex justify-between items-center">
                <span className="text-sky-800 dark:text-sky-300 font-bold text-base">
                  Jumlah Digenapkan
                </span>
                <span className="text-sky-900 dark:text-sky-200 text-2xl font-bold">
                  {formatCurrency(jumlahDigenapkan)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Payroll Items Tab - This will contain all the existing payroll items tables */}
      <div>
        {/* Payroll Items - Grouped by Job Type for Combined Payrolls */}
        {isCombinedPayroll && itemsByJob ? (
          // Combined Payroll: Group by Job Type first
          uniqueJobTypes.map((jobType) => {
            const jobGroupedItems = itemsByJob[jobType as string];
            const jobConsolidatedItems =
              consolidatedItemsByJob?.[jobType as string];
            // Use consolidated items for totals - consistent with recalculated amounts
            const jobBaseTotal = (jobConsolidatedItems?.["Base"] || []).reduce(
              (sum, item) => sum + item.total_amount,
              0,
            );
            const jobTambahanTotal = (
              jobConsolidatedItems?.["Tambahan"] || []
            ).reduce((sum, item) => sum + item.total_amount, 0);
            const jobOvertimeTotal = (
              jobConsolidatedItems?.["Overtime"] || []
            ).reduce((sum, item) => sum + item.total_amount, 0);
            const jobTotal = jobBaseTotal + jobTambahanTotal + jobOvertimeTotal;

            return (
              <div key={jobType} className="mb-3">
                <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-default-300 dark:border-gray-600">
                  <h3 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                    {formatJobType(jobType as string)} Section
                  </h3>
                  <span className="text-sm font-medium text-default-600 dark:text-gray-300">
                    Subtotal: {formatCurrency(jobTotal)}
                  </span>
                </div>

                {/* Base Pay for this job */}
                {((viewMode === "consolidated" &&
                  (jobConsolidatedItems?.["Base"]?.length ?? 0) > 0) ||
                  (viewMode === "detailed" &&
                    jobGroupedItems["Base"].length > 0)) && (
                  <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                    <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/50">
                      <h4 className="text-md font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <IconCoins
                          size={18}
                          className="text-amber-600 dark:text-amber-400"
                        />
                        Base Pay
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                        <thead className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            {viewMode === "detailed" && (
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                              >
                                Date
                              </th>
                            )}
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              {viewMode === "consolidated"
                                ? "Total Qty"
                                : "Qty"}
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                          {viewMode === "consolidated"
                            ? renderBaseConsolidatedRows(
                                jobConsolidatedItems?.["Base"] || [],
                                "Total Base",
                              )
                            : renderBaseDetailedRows(
                                jobGroupedItems["Base"],
                                jobConsolidatedItems?.["Base"] || [],
                                "Total Base",
                              )}
                        </tbody>
                        {shouldShowBaseFinalTotal(
                          jobConsolidatedItems?.["Base"] || [],
                        ) && (
                          <tfoot className="bg-default-50 dark:bg-gray-800">
                            {renderBaseTotalRow(jobBaseTotal, "Total Base")}
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

                {/* Tambahan Pay for this job */}
                {((viewMode === "consolidated" &&
                  (jobConsolidatedItems?.["Tambahan"]?.length ?? 0) > 0) ||
                  (viewMode === "detailed" &&
                    jobGroupedItems["Tambahan"].length > 0)) && (
                  <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                    <div className="px-4 py-1.5 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-800/50">
                      <h4 className="text-md font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-2">
                        <IconCirclePlus
                          size={18}
                          className="text-violet-600 dark:text-violet-400"
                        />
                        Tambahan Pay
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                        <thead className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            {viewMode === "detailed" && (
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                              >
                                Date
                              </th>
                            )}
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              {viewMode === "consolidated"
                                ? "Total Qty"
                                : "Qty"}
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Amount
                            </th>
                            {isEditable &&
                              (viewMode === "detailed" ||
                                (viewMode === "consolidated" &&
                                  jobConsolidatedItems?.["Tambahan"]?.some(
                                    (item) =>
                                      item.is_manual && item.item_count === 1,
                                  ))) && (
                                <th
                                  scope="col"
                                  className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-12"
                                ></th>
                              )}
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                          {viewMode === "consolidated"
                            ? jobConsolidatedItems?.["Tambahan"]?.map(
                                (item, index) =>
                                  renderConsolidatedRow(item, index),
                              )
                            : getSortedItemsWithSeparators(
                                jobGroupedItems["Tambahan"],
                              ).map((item, index, arr) =>
                                renderDetailedRow(item, index, arr, true),
                              )}
                        </tbody>
                        <tfoot className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            <td
                              colSpan={viewMode === "detailed" ? 4 : 3}
                              className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                            >
                              Total Tambahan
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                              {formatCurrency(jobTambahanTotal)}
                            </td>
                            {isEditable &&
                              (viewMode === "detailed" ||
                                (viewMode === "consolidated" &&
                                  jobConsolidatedItems?.["Tambahan"]?.some(
                                    (item) =>
                                      item.is_manual && item.item_count === 1,
                                  ))) && <td></td>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Overtime Pay for this job */}
                {((viewMode === "consolidated" &&
                  (jobConsolidatedItems?.["Overtime"]?.length ?? 0) > 0) ||
                  (viewMode === "detailed" &&
                    jobGroupedItems["Overtime"].length > 0)) && (
                  <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                    <div className="px-4 py-1.5 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-800/50">
                      <h4 className="text-md font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-2">
                        <IconClock
                          size={18}
                          className="text-orange-600 dark:text-orange-400"
                        />
                        Overtime Pay
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                        <thead className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            {viewMode === "detailed" && (
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                              >
                                Date
                              </th>
                            )}
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              {viewMode === "consolidated"
                                ? "Total Qty"
                                : "Qty"}
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                          {viewMode === "consolidated"
                            ? jobConsolidatedItems?.["Overtime"]?.map(
                                (item, index) =>
                                  renderConsolidatedRow(item, index),
                              )
                            : getSortedItemsWithSeparators(
                                jobGroupedItems["Overtime"],
                              ).map((item, index, arr) =>
                                renderDetailedRow(item, index, arr, false),
                              )}
                        </tbody>
                        <tfoot className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            <td
                              colSpan={viewMode === "detailed" ? 4 : 3}
                              className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                            >
                              Total Overtime
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                              {formatCurrency(jobOvertimeTotal)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          // Single Job Payroll: Original layout with compact tables
          <>
            {/* Base Pay Items */}
            {((viewMode === "consolidated" &&
              groupedConsolidatedItems["Base"].length > 0) ||
              (viewMode === "detailed" && groupedItems["Base"].length > 0)) && (
              <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/50">
                  <h3 className="text-md font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <IconCoins
                      size={18}
                      className="text-amber-600 dark:text-amber-400"
                    />
                    Base Pay
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        {viewMode === "detailed" && (
                          <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                          >
                            Date
                          </th>
                        )}
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {viewMode === "consolidated"
                        ? renderBaseConsolidatedRows(
                            groupedConsolidatedItems["Base"],
                            "Total Base Pay",
                          )
                        : renderBaseDetailedRows(
                            groupedItems["Base"],
                            groupedConsolidatedItems["Base"],
                            "Total Base Pay",
                          )}
                    </tbody>
                    {shouldShowBaseFinalTotal(
                      groupedConsolidatedItems["Base"],
                    ) && (
                      <tfoot className="bg-default-50 dark:bg-gray-800">
                        {renderBaseTotalRow(baseTotal, "Total Base Pay")}
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* Tambahan Pay Items */}
            {((viewMode === "consolidated" &&
              consolidatedTambahanItems.length > 0) ||
              (viewMode === "detailed" &&
                detailedTambahanItems.length > 0)) && (
              <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="px-4 py-2 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-800/50">
                  <h3 className="text-md font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-2">
                    <IconCirclePlus
                      size={18}
                      className="text-violet-600 dark:text-violet-400"
                    />
                    Tambahan Pay
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        {viewMode === "detailed" && (
                          <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                          >
                            Date
                          </th>
                        )}
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Amount
                        </th>
                        {isEditable &&
                          (viewMode === "detailed" ||
                            (viewMode === "consolidated" &&
                              consolidatedTambahanItems.some(
                                (item) =>
                                  item.is_manual && item.item_count === 1,
                              ))) && (
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-12"
                            ></th>
                          )}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {viewMode === "consolidated"
                        ? consolidatedTambahanItems.map(
                            (item, index) => renderConsolidatedRow(item, index),
                          )
                        : getSortedItemsWithSeparators(
                            detailedTambahanItems,
                          ).map((item, index, arr) =>
                            renderDetailedRow(item, index, arr, true),
                          )}
                    </tbody>
                    <tfoot className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        <td
                          colSpan={viewMode === "detailed" ? 4 : 3}
                          className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                        >
                          Total Tambahan Pay
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                          {formatCurrency(tambahanTotal)}
                        </td>
                        {isEditable &&
                          (viewMode === "detailed" ||
                            (viewMode === "consolidated" &&
                              consolidatedTambahanItems.some(
                                (item) =>
                                  item.is_manual && item.item_count === 1,
                              ))) && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Overtime Pay Items */}
            {((viewMode === "consolidated" &&
              groupedConsolidatedItems["Overtime"].length > 0) ||
              (viewMode === "detailed" &&
                groupedItems["Overtime"].length > 0)) && (
              <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-800/50">
                  <h3 className="text-md font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-2">
                    <IconClock
                      size={18}
                      className="text-orange-600 dark:text-orange-400"
                    />
                    Overtime Pay
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        {viewMode === "detailed" && (
                          <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                          >
                            Date
                          </th>
                        )}
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {viewMode === "consolidated"
                        ? groupedConsolidatedItems["Overtime"].map(
                            (item, index) => renderConsolidatedRow(item, index),
                          )
                        : getSortedItemsWithSeparators(
                            groupedItems["Overtime"],
                          ).map((item, index, arr) =>
                            renderDetailedRow(item, index, arr, false),
                          )}
                    </tbody>
                    <tfoot className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        <td
                          colSpan={viewMode === "detailed" ? 4 : 3}
                          className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                        >
                          Total Overtime Pay
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                          {formatCurrency(overtimeTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Bonus / incentive records */}
        {mergedCommissionRecords.length > 0 && (
          <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
            <div className="px-4 py-2 bg-teal-50 dark:bg-teal-900/20 border-b border-teal-100 dark:border-teal-800/50">
              <h3 className="text-md font-semibold text-teal-800 dark:text-teal-300 flex items-center gap-2">
                <IconBusinessplan
                  size={18}
                  className="text-teal-600 dark:text-teal-400"
                />
                <Link
                  to={`/payroll/bonus?year=${payroll.year}&month=${payroll.month}`}
                  className="hover:underline"
                  title="Open Bonus input page"
                >
                  Bonus / Insentif
                </Link>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Description
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {viewMode === "detailed"
                    ? incentiveDetailRows.map((row) => (
                        <tr
                          key={row.key}
                          className="hover:bg-default-50 dark:hover:bg-gray-700"
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-default-800 dark:text-gray-100">
                            <Link
                              to={row.link}
                              className="hover:underline text-teal-700 dark:text-teal-400"
                              title="Open entry page"
                            >
                              {format(new Date(row.date), "dd MMM yyyy")}
                            </Link>
                          </td>
                          <td
                            className="px-3 py-2 text-sm text-default-800 dark:text-gray-100"
                            title={row.description}
                          >
                            {row.description}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium text-default-800 dark:text-gray-100">
                            {formatCurrency(row.amount)}
                          </td>
                        </tr>
                      ))
                    : mergedCommissionRecords.map((record) => (
                        <tr
                          key={record.id}
                          className="hover:bg-default-50 dark:hover:bg-gray-700"
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-default-800 dark:text-gray-100">
                            {record.merged_count === 1
                              ? format(
                                  new Date(record.commission_date),
                                  "dd MMM yyyy",
                                )
                              : `${record.merged_count} entries`}
                          </td>
                          <td
                            className="px-3 py-2 text-sm text-default-800 dark:text-gray-100"
                            title={record.description}
                          >
                            {record.description}
                            {record.merged_count > 1 && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
                                ×{record.merged_count}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium text-default-800 dark:text-gray-100">
                            {formatCurrency(record.merged_amount)}
                          </td>
                        </tr>
                      ))}
                </tbody>
                <tfoot className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                    >
                      Total Bonus / Insentif
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                      {formatCurrency(mergedCommissionTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Others (Kerja Luar OT) Records */}
        {mergedOthersRecords.length > 0 && (
          <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
            <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/50">
              <h3 className="text-md font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                <IconClockHour4
                  size={18}
                  className="text-indigo-600 dark:text-indigo-400"
                />
                Others (Kerja Luar OT)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                      Description
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                      Rate
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                      Total Qty
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {othersRowsToRender.map((record) => {
                    const payCodeIds: string[] =
                      getMergedOthersPayCodeIds(record);
                    const payCodeLabel: string = payCodeIds.join(", ");
                    const descriptionTitle: string = payCodeLabel
                      ? `${record.description} (${payCodeLabel})`
                      : record.description;
                    const rateQuantityDisplay: {
                      rate: string;
                      quantity: string;
                    } = getOthersRateQuantityDisplay(record);

                    return (
                      <tr
                        key={record.id}
                        className="hover:bg-default-50 dark:hover:bg-gray-700"
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-default-800 dark:text-gray-100">
                          {viewMode === "detailed" ? (
                            <Link
                              to={incentiveEntryLink("/payroll/others")}
                              className="hover:underline text-indigo-700 dark:text-indigo-400"
                              title="Open entry page"
                            >
                              {format(new Date(record.record_date), "dd MMM yyyy")}
                            </Link>
                          ) : record.merged_count === 1 ? (
                            format(new Date(record.record_date), "dd MMM yyyy")
                          ) : (
                            `${record.merged_count} entries`
                          )}
                        </td>
                        <td
                          className="px-3 py-2 text-sm text-default-800 dark:text-gray-100 max-w-xs"
                          title={descriptionTitle}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate min-w-0">
                              {record.description}
                              {payCodeLabel && (
                                <span className="text-default-500 dark:text-gray-400">
                                  {" "}
                                  ({payCodeLabel})
                                </span>
                              )}
                            </span>
                            {record.merged_count > 1 && (
                              <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                                ×{record.merged_count}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-sm text-default-600 dark:text-gray-400">
                          {rateQuantityDisplay.rate}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-sm text-default-600 dark:text-gray-400">
                          {rateQuantityDisplay.quantity}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium text-default-800 dark:text-gray-100">
                          {formatCurrency(record.merged_amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                    >
                      Total Others (Kerja Luar OT)
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                      {formatCurrency(
                        mergedOthersRecords.reduce(
                          (sum, record) => sum + record.merged_amount,
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Monthly Leave Summary */}
        {monthlyLeaveDisplayRecords.length > 0 && (
          <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
            <div className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-100 dark:border-rose-800/50">
              <h3 className="text-md font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <IconCalendarEvent
                  size={18}
                  className="text-rose-600 dark:text-rose-400"
                />
                Cuti Records
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Leave Type
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Days
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {monthlyLeaveDisplayRecords.map((record, index) => {
                    const getLeaveTypeDisplay = (leaveType: string) => {
                      switch (leaveType) {
                        case "cuti_umum":
                          return "Cuti Umum";
                        case "cuti_sakit":
                          return "Cuti Sakit";
                        case "cuti_tahunan":
                          return "Cuti Tahunan";
                        case "cuti_rawatan":
                          return "Cuti Rawatan";
                        default:
                          return leaveType;
                      }
                    };
                    const getLeaveRecordDisplay = (
                      leaveRecord: MonthlyLeaveRecord,
                    ) => {
                      const baseLabel = getLeaveTypeDisplay(
                        leaveRecord.leave_type,
                      );

                      if (
                        leaveRecord.leave_type === "cuti_umum" &&
                        leaveRecord.holiday_description
                      ) {
                        return `${baseLabel} - ${leaveRecord.holiday_description}`;
                      }

                      return baseLabel;
                    };
                    const getLeaveTypeColor = (leaveType: string) => {
                      switch (leaveType) {
                        case "cuti_umum":
                          return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
                        case "cuti_sakit":
                          return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
                        case "cuti_tahunan":
                          return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
                        case "cuti_rawatan":
                          return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
                        default:
                          return "bg-default-100 text-default-700 dark:bg-gray-700 dark:text-gray-300";
                      }
                    };
                    const leaveRecordUrl: string | null =
                      getLeaveRecordUrl(record) ??
                      (record.fromCommission
                        ? incentiveEntryLink("/payroll/commission")
                        : null);
                    const leaveDateLabel: string = formatDisplayDate(
                      record.date,
                    );
                    return (
                      <tr
                        key={index}
                        className="hover:bg-default-50 dark:hover:bg-gray-700"
                      >
                        <td className="px-3 py-2 text-sm text-default-800 dark:text-gray-100">
                          {leaveRecordUrl ? (
                            <Link
                              to={leaveRecordUrl}
                              className="text-sky-600 dark:text-sky-400 hover:underline"
                            >
                              {leaveDateLabel}
                            </Link>
                          ) : (
                            leaveDateLabel
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getLeaveTypeColor(
                              record.leave_type,
                            )}`}
                          >
                            {getLeaveRecordDisplay(record)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-sm text-default-800 dark:text-gray-100">
                          {Math.round(record.days_taken)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium text-default-800 dark:text-gray-100">
                          {formatCurrency(record.amount_paid)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                    >
                      Jumlah cuti (
                      {monthlyLeaveDisplayRecords.reduce(
                        (sum, r) => sum + (Number(r.days_taken) || 0),
                        0,
                      )}{" "}
                      hari)
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                      {formatCurrency(
                        monthlyLeaveDisplayRecords.reduce(
                          (sum, r) => sum + (Number(r.amount_paid) || 0),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {payroll.items.length === 0 && (
          <div className="mb-4 text-center py-8 border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <p className="text-default-500 dark:text-gray-400">
              No payroll items found.
            </p>
            {isEditable && (
              <Button
                onClick={() => setShowAddItemModal(true)}
                color="sky"
                variant="outline"
                className="mt-4"
              >
                Manual Item
              </Button>
            )}
          </div>
        )}

        {/* Pinjam Summary - Final pay after pinjam deductions.
            Only shown when this employee has pinjam recorded this month.
            Intentionally page-only: it is not part of the payslip PDF. */}
        {pinjamRecords.length > 0 && (
          <div
            id="pinjam-section"
            className="mb-4 overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          >
            <Link
              to={`/payroll/pinjam?year=${payroll.year}&month=${payroll.month}&search=${encodeURIComponent(payroll.employee_name || payroll.employee_id)}`}
              className="group flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-2 transition-colors hover:bg-red-100/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-400 dark:border-red-800/50 dark:bg-red-900/20 dark:hover:bg-red-900/35"
              title={`Open Pinjam for ${payroll.employee_name || payroll.employee_id}`}
            >
              <h3 className="text-md font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
                <IconWallet
                  size={18}
                  className="text-red-600 dark:text-red-400"
                />
                <span>Pinjam</span>
              </h3>
              <span className="flex items-center gap-1 text-xs font-semibold text-red-700 group-hover:underline dark:text-red-300">
                Open Pinjam
                <IconChevronRight size={16} aria-hidden="true" />
              </span>
            </Link>
            <div className="p-4">
              <div
                className={`flex flex-col ${
                  hasBothPinjamPanels
                    ? "lg:flex-row lg:gap-6 lg:divide-x lg:divide-default-200 dark:lg:divide-gray-700"
                    : ""
                } gap-6`}
              >
                {/* Mid-Month panel */}
                {hasMidMonthPinjam && (
                  <div
                    className={`min-w-0 flex flex-col ${
                      hasBothPinjamPanels ? "flex-1 lg:pr-6" : "w-full"
                    }`}
                  >
                    <div className="mb-3">
                      <p className="text-sm text-default-500 dark:text-gray-400 mb-1">
                        Mid-Month Pay (Before Pinjam)
                      </p>
                      <p
                        className={`text-xl font-bold ${pinjamAmountColor(
                          midMonthPayBeforePinjam,
                          "text-default-800 dark:text-gray-100",
                        )}`}
                      >
                        {formatCurrency(midMonthPayBeforePinjam)}
                      </p>
                    </div>

                    <div className="mb-3">
                      <p className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                        Pinjam Items:
                      </p>
                      <div className="space-y-1 text-sm text-default-600 dark:text-gray-300">
                        {midMonthPinjamRecords.map((record) => (
                          <div key={record.id} className="flex items-start">
                            <span className="text-default-400 mr-2 mt-0.5">
                              •
                            </span>
                            <span className="flex-1 min-w-0">
                              {record.description}
                            </span>
                            <span className="ml-2 flex-shrink-0 font-medium text-default-700 dark:text-gray-200">
                              {formatCurrency(Number(record.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-auto text-sm">
                      <div className="flex justify-between mb-2">
                        <span className="text-default-600 dark:text-gray-300">
                          Jumlah Pinjam:
                        </span>
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          - {formatCurrency(midMonthPinjamTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center font-semibold border-t border-default-200 dark:border-gray-600 pt-2">
                        <span className="text-default-800 dark:text-gray-100">
                          Final Mid-Month Pay
                        </span>
                        <span
                          className={`text-lg font-bold ${pinjamAmountColor(
                            midMonthFinalPay,
                            "text-sky-600 dark:text-sky-400",
                          )}`}
                        >
                          {formatCurrency(midMonthFinalPay)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Monthly panel */}
                {hasMonthlyPinjam && (
                  <div
                    className={`min-w-0 flex flex-col ${
                      hasBothPinjamPanels ? "flex-1 lg:pl-6" : "w-full"
                    }`}
                  >
                    <div className="mb-3">
                      <p className="text-sm text-default-500 dark:text-gray-400 mb-1">
                        Gaji Genap (Before Pinjam)
                      </p>
                      <p
                        className={`text-xl font-bold ${pinjamAmountColor(
                          jumlahDigenapkan,
                          "text-default-800 dark:text-gray-100",
                        )}`}
                      >
                        {formatCurrency(jumlahDigenapkan)}
                      </p>
                    </div>

                    <div className="mb-3">
                      <p className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                        Pinjam Items:
                      </p>
                      <div className="space-y-1 text-sm text-default-600 dark:text-gray-300">
                        {monthlyPinjamRecords.map((record) => (
                          <div key={record.id} className="flex items-start">
                            <span className="text-default-400 mr-2 mt-0.5">
                              •
                            </span>
                            <span className="flex-1 min-w-0">
                              {record.description}
                            </span>
                            <span className="ml-2 flex-shrink-0 font-medium text-default-700 dark:text-gray-200">
                              {formatCurrency(Number(record.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-auto text-sm">
                      <div className="flex justify-between mb-2">
                        <span className="text-default-600 dark:text-gray-300">
                          Jumlah Pinjam:
                        </span>
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          - {formatCurrency(monthlyPinjamTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center font-semibold border-t border-default-200 dark:border-gray-600 pt-2">
                        <span className="text-default-800 dark:text-gray-100 flex items-center gap-1.5">
                          <IconBuildingBank className="w-4 h-4 flex-shrink-0" />
                          Jumlah Masuk Bank
                        </span>
                        <span
                          className={`text-lg font-bold ${pinjamAmountColor(
                            monthlyFinalPay,
                            "text-sky-600 dark:text-sky-400",
                          )}`}
                        >
                          {formatCurrency(monthlyFinalPay)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Manual Item Modal */}
      <AddManualItemModal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        employeePayrollId={Number(id)}
        onItemAdded={fetchEmployeePayrollComprehensive}
      />

      {/* Delete Item Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteItem}
        title="Delete Payroll Item"
        message={`Are you sure you want to delete this item: ${itemToDelete?.description}?`}
        confirmButtonText={isDeleting ? "Deleting..." : "Delete"}
        variant="danger"
      />
    </div>
  );
};

export default EmployeePayrollDetailsPage;

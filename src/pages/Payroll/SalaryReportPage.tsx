// src/pages/Payroll/SalaryReportPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  IconRefresh,
  IconFileText,
  IconPrinter,
  IconFileExport,
  IconLink,
  IconInfoCircle,
  IconChevronRight,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { FormListbox } from "../../components/FormComponents";
import TimeNavigator from "../../components/TimeNavigator";
import SalaryAmountTooltip from "../../components/Payroll/SalaryAmountTooltip";
import { api } from "../../routes/utils/api";
import { getMonthName } from "../../utils/payroll/midMonthPayrollUtils";
import {
  generatePinjamReportPDF,
  generatePinjamBreakdownPDF,
  PinjamReportPDFData,
  aggregatePinjamContributorsByType,
} from "../../utils/payroll/PinjamReportPDF";
import {
  generateBankReportPDF,
  BankReportPDFData,
} from "../../utils/payroll/BankReportPDF";
import { generateSalaryReportPDF } from "../../utils/payroll/SalaryReportPDF";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useLocationMappingsCache } from "../../utils/catalogue/useLocationMappingsCache";
import { groupStaffsByName } from "../../utils/payroll/groupStaffsByName";
import {
  readLastAccessedPayrollMonth,
  readLastAccessedSalaryReportTab,
  saveLastAccessedPayrollMonth,
  saveLastAccessedSalaryReportTab,
} from "../../utils/payroll/payrollPageStorage";
import toast from "react-hot-toast";

// Cuti (leave) summary types for the Cuti tab
type CutiLeaveType =
  | "cuti_sakit"
  | "cuti_tahunan"
  | "cuti_umum"
  | "cuti_rawatan";

interface CutiMonthValue {
  days: number;
  amount: number;
}

interface CutiBatchEmployee {
  employee: {
    id: string;
    name: string;
  };
  leaveBalance: {
    cuti_umum_total: number;
    cuti_tahunan_total: number;
    cuti_sakit_total: number;
    cuti_rawatan_total: number;
  };
  monthlySummary: Record<number, Record<CutiLeaveType, CutiMonthValue>>;
}

// Location order with headers
interface LocationOrderItem {
  type: "location" | "header";
  id?: string;
  text?: string;
}

type ColumnGuideLanguage = "bm" | "en";

interface SalaryReportData {
  no: number;
  staff_id: string;
  staff_name: string;
  payment_preference: string;
  gaji_genap: number;
  total_pinjam: number;
  pinjam_details?: { description: string; amount: number }[];
  final_total: number;
  net_pay: number;
  mid_month_amount: number;
}

// Individual employee salary data for Employee tab
interface EmployeeSalaryData {
  no: number;
  employee_payroll_id: number | null;
  staff_id: string;
  staff_name: string;
  gaji: number;
  ot: number;
  bonus: number;
  comm: number;
  cuti: number;
  gaji_kasar: number;
  epf_majikan: number;
  epf_pekerja: number;
  socso_majikan: number;
  socso_pekerja: number;
  sip_majikan: number;
  sip_pekerja: number;
  pcb: number;
  gaji_bersih: number;
  setengah_bulan: number;
  jumlah: number;
  digenapkan: number;
  setelah_digenapkan: number;
}

// Grand totals with rounding fields
interface GrandTotals {
  gaji: number;
  ot: number;
  bonus: number;
  comm: number;
  cuti: number;
  gaji_kasar: number;
  epf_majikan: number;
  epf_pekerja: number;
  socso_majikan: number;
  socso_pekerja: number;
  sip_majikan: number;
  sip_pekerja: number;
  pcb: number;
  gaji_bersih: number;
  setengah_bulan: number;
  jumlah: number;
  digenapkan: number;
  setelah_digenapkan: number;
}

interface SalaryReportResponse {
  year: number;
  month: number;
  data: SalaryReportData[];
  total_records: number;
  summary: {
    total_gaji_genap: number;
    total_pinjam: number;
    total_final: number;
  };
  comprehensive?: ComprehensiveSalaryData;
  employees?: EmployeeSalaryData[];
  employees_grand_totals?: GrandTotals;
  bank_data?: {
    no: number;
    staff_name: string;
    icNo: string;
    bankAccountNumber: string;
    total: number;
    payment_preference: string;
  }[];
}

// Comprehensive salary data for location-based reporting
interface LocationSalaryData {
  location: string;
  employees: {
    employee_payroll_id: number;
    staff_id: string;
    staff_name: string;
    gaji: number; // Base Pay + Tambahan
    ot: number; // Overtime total
    bonus: number; // Bonus amount
    comm: number; // Commission + Others/Kerja Luar OT (incl. IXT)
    cuti: number; // All leave pay + Cuti Tahunan recorded as commission
    gaji_kasar: number; // Gross pay
    epf_majikan: number;
    epf_pekerja: number;
    socso_majikan: number;
    socso_pekerja: number;
    sip_majikan: number;
    sip_pekerja: number;
    pcb: number; // Income tax
    gaji_bersih: number; // Net pay + commission
    setengah_bulan: number; // Mid month pay
    jumlah: number; // GAJI BERSIH - 1/2 BULAN (final amount)
    digenapkan: number; // Rounding adjustment
    setelah_digenapkan: number; // Final rounded amount
  }[];
  totals: {
    gaji: number;
    ot: number;
    bonus: number;
    comm: number;
    cuti: number;
    gaji_kasar: number;
    epf_majikan: number;
    epf_pekerja: number;
    socso_majikan: number;
    socso_pekerja: number;
    sip_majikan: number;
    sip_pekerja: number;
    pcb: number;
    gaji_bersih: number;
    setengah_bulan: number;
    jumlah: number;
    digenapkan: number;
    setelah_digenapkan: number;
  };
}

interface ComprehensiveSalaryData {
  year: number;
  month: number;
  locations: LocationSalaryData[];
  grand_totals: GrandTotals;
}

// Annual summary (Annual tab): yearly totals broken down by month and by location.
// Both tables share the same columns and reconcile to the same grand total.
interface AnnualMonthlyEntry {
  month: number;
  totals: GrandTotals;
}

interface AnnualLocationEntry {
  location: string;
  totals: GrandTotals;
}

interface AnnualSummaryResponse {
  year: number;
  monthly: AnnualMonthlyEntry[];
  locations: AnnualLocationEntry[];
  grand_totals: GrandTotals;
}

// Annual breakdown (Annual tab → Breakdown): per location, each employee expanded
// into one row per month, plus a per-employee total and a location grand total.
interface AnnualBreakdownMonth extends GrandTotals {
  month: number;
}

interface AnnualBreakdownEmployee {
  staff_id: string;
  staff_name: string;
  months: AnnualBreakdownMonth[];
  total: GrandTotals;
}

interface AnnualBreakdownLocation {
  location: string;
  employees: AnnualBreakdownEmployee[];
  totals: GrandTotals;
}

// Lightweight per-page index (one entry per page/batch) returned with every breakdown
// response so the client can render the pager + batch-print list without the full year.
interface AnnualBreakdownPageMeta {
  staff: number;
  locations: string[]; // location codes on this page
}

// Paginated breakdown response: only the requested page's heavy detail, plus the index.
interface AnnualBreakdownResponse {
  year: number;
  page: number; // 1-based
  total_pages: number;
  pages: AnnualBreakdownPageMeta[];
  locations: AnnualBreakdownLocation[]; // detail for the current page only
  grand_totals: GrandTotals;
}

const SalaryReportPage: React.FC = () => {
  // URL search params
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [reportData, setReportData] = useState<SalaryReportResponse | null>(
    null
  );
  const [comprehensiveSalaryData, setComprehensiveSalaryData] =
    useState<ComprehensiveSalaryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);
  const [isGeneratingExport, setIsGeneratingExport] = useState<boolean>(false);
  const [showExportDialog, setShowExportDialog] = useState<boolean>(false);
  const [showColumnGuide, setShowColumnGuide] = useState<boolean>(false);
  // Annual → Breakdown is paginated one location at a time to keep the UI light;
  // printing follows the current page (that one location).
  const [breakdownPage, setBreakdownPage] = useState<number>(0);
  // Expanded pinjam types (by uppercased description) in the Pinjam Breakdown card
  const [expandedPinjamTypes, setExpandedPinjamTypes] = useState<Set<string>>(
    new Set()
  );
  const [columnGuideLanguage, setColumnGuideLanguage] =
    useState<ColumnGuideLanguage>("bm");
  const [isPrintDropdownOpen, setIsPrintDropdownOpen] = useState<boolean>(false);
  const printDropdownTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [isBreakdownDropdownOpen, setIsBreakdownDropdownOpen] =
    useState<boolean>(false);
  const breakdownDropdownTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  // Annual Breakdown batch printing (auto-grouped by a staff-count cap).
  const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState<boolean>(false);
  const batchDropdownTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  // Which batch is currently being generated (e.g. "2-print"), to disable buttons.
  const [batchPrintingKey, setBatchPrintingKey] = useState<string | null>(null);
  const [exportYear, setExportYear] = useState<number>(
    new Date().getFullYear()
  );
  const [exportMonth, setExportMonth] = useState<number>(
    new Date().getMonth() + 1
  );

  // Sub-view mode for Employee tab
  const [employeeViewMode, setEmployeeViewMode] = useState<'individual' | 'location'>('individual');

  // Period type toggle (monthly/yearly) - initialize from URL params
  const [periodType, setPeriodType] = useState<'monthly' | 'yearly'>(() => {
    const periodParam = searchParams.get("period");
    return periodParam === 'yearly' ? 'yearly' : 'monthly';
  });

  // Yearly data states
  const [yearlyReportData, setYearlyReportData] = useState<SalaryReportResponse | null>(null);
  const [yearlyComprehensiveSalaryData, setYearlyComprehensiveSalaryData] = useState<ComprehensiveSalaryData | null>(null);
  const [isLoadingYearly, setIsLoadingYearly] = useState<boolean>(false);

  // Annual tab states (by-month + by-location yearly summary)
  const [annualData, setAnnualData] = useState<AnnualSummaryResponse | null>(null);
  const [isLoadingAnnual, setIsLoadingAnnual] = useState<boolean>(false);

  // Annual tab sub-view: 'summary' (totals) or 'breakdown' (per-employee monthly)
  const [annualViewMode, setAnnualViewMode] = useState<'summary' | 'breakdown'>('summary');
  const [annualBreakdownData, setAnnualBreakdownData] = useState<AnnualBreakdownResponse | null>(null);
  const [isLoadingAnnualBreakdown, setIsLoadingAnnualBreakdown] = useState<boolean>(false);

  // Cuti (leave) tab states - batch leave report is fetched per year
  const [cutiEmployees, setCutiEmployees] = useState<CutiBatchEmployee[]>([]);
  const [cutiLoading, setCutiLoading] = useState<boolean>(false);
  const [cutiError, setCutiError] = useState<string | null>(null);
  const [cutiFetchedYear, setCutiFetchedYear] = useState<number | null>(null);

  // Filters - use Date for month navigation, initialize from URL params
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (yearParam && monthParam) {
      const year = parseInt(yearParam, 10);
      const month = parseInt(monthParam, 10);
      // Validate year and month
      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
        return new Date(year, month - 1, 1);
      }
    }

    const now: Date = new Date();
    return (
      readLastAccessedPayrollMonth() ??
      new Date(now.getFullYear(), now.getMonth(), 1)
    );
  });

  // Derived values for API calls and display
  const currentYear = selectedMonth.getFullYear();
  const currentMonth = selectedMonth.getMonth() + 1;

  // Tab state - initialize from URL params, then the last opened tab.
  const [activeTab, setActiveTab] = useState<number>(() => {
    const tabParam = searchParams.get("tab");
    const tabIndex = tabParam ? parseInt(tabParam, 10) : 0;
    // Validate tab index (0-5 are valid)
    return tabParam && tabIndex >= 0 && tabIndex <= 5
      ? tabIndex
      : readLastAccessedSalaryReportTab() ?? 0;
  }); // 0 = Employee, 1 = Location, 2 = Bank, 3 = Pinjam, 4 = Cuti, 5 = Annual

  // Update URL params when tab, year, month, or period changes
  useEffect(() => {
    const params: Record<string, string> = {
      tab: activeTab.toString(),
      year: currentYear.toString(),
      period: periodType,
    };
    // Only include month in URL when in monthly mode
    if (periodType === 'monthly') {
      params.month = currentMonth.toString();
    }
    setSearchParams(params, { replace: true });
  }, [activeTab, currentYear, currentMonth, periodType, setSearchParams]);

  // Keep the Payroll and Salary Report month in sync for future visits.
  useEffect(() => {
    saveLastAccessedPayrollMonth(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    saveLastAccessedSalaryReportTab(activeTab);
  }, [activeTab]);

  // Cleanup dropdown timeouts on unmount
  useEffect(() => {
    return () => {
      if (printDropdownTimeoutRef.current) {
        clearTimeout(printDropdownTimeoutRef.current);
      }
      if (batchDropdownTimeoutRef.current) {
        clearTimeout(batchDropdownTimeoutRef.current);
      }
    };
  }, []);

  // Staff data
  const { staffs } = useStaffsCache();

  // Location data from cache - build LOCATION_MAP from DB data
  const { locations } = useLocationMappingsCache();
  const LOCATION_MAP = useMemo(() => {
    const map: { [key: string]: string } = {};
    locations.forEach((loc) => {
      map[loc.id] = loc.name;
    });
    return map;
  }, [locations]);

  // Build LOCATION_ORDER dynamically from database locations
  const LOCATION_ORDER: LocationOrderItem[] = useMemo(() => {
    if (locations.length === 0) return [];

    const orderStructure: LocationOrderItem[] = [];

    // Locations intentionally hidden from the location views/totals (unused/always empty).
    const removedLocations = new Set([
      "16",
      "17",
      "19",
      "20",
      "21",
      "22",
      "24",
      "05",
      "12",
      "15",
    ]);

    const addLocation = (id: string) => {
      if (removedLocations.has(id)) return;
      if (locations.find((loc) => loc.id === id)) {
        orderStructure.push({ type: "location", id });
      }
    };

    // Build order based on existing structure
    // Directors & Office
    addLocation("01");
    addLocation("02");
    addLocation("03");
    addLocation("04");
    addLocation("06");
    addLocation("07");
    addLocation("08");
    addLocation("09");
    addLocation("10");
    addLocation("11");
    addLocation("13");

    // Maintenance section
    if (locations.find((loc) => loc.id === "14")) {
      orderStructure.push({ type: "header", text: "KERJA LUAR MAINTENANCE" });
      addLocation("14");
    }

    // Commission section — keep the header row as a blank separator (text removed),
    // and only location 18 remains here (16/17/19/20/21 are hidden). 23 follows below.
    if (
      locations.find((loc) => loc.id === "18") ||
      locations.find((loc) => loc.id === "23")
    ) {
      orderStructure.push({ type: "header", text: "" });
      addLocation("18");
    }

    // Other locations
    addLocation("23");

    // Add any remaining (new) locations at the end, except the hidden ones.
    locations.forEach((loc) => {
      if (removedLocations.has(loc.id)) return;
      const alreadyAdded = orderStructure.some(
        (item) => item.type === "location" && item.id === loc.id
      );
      if (!alreadyAdded) {
        orderStructure.push({ type: "location", id: loc.id });
      }
    });

    return orderStructure;
  }, [locations]);

  // Bank table data - now comes directly from API
  const bankTableData = useMemo(() => {
    if (!reportData?.bank_data) return [];
    return reportData.bank_data;
  }, [reportData]);

  // Generate year and month options
  const yearOptions = useMemo(() => {
    const years = [];
    const startYear = new Date().getFullYear() - 5; // Go back 5 years
    const endYear = new Date().getFullYear(); // Current year
    for (let year = endYear; year >= startYear; year--) {
      years.push({ id: year, name: year.toString() });
    }
    return years;
  }, []);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: getMonthName(i + 1),
      })),
    []
  );

  // Handle year change (keeps the selected month, swaps the year)
  const handleYearChange = (newYear: number) => {
    setSelectedMonth(new Date(newYear, selectedMonth.getMonth(), 1));
    // The breakdown's pages differ per year — restart at the first page.
    setBreakdownPage(0);
  };

  // Period navigator: monthly sections step by month; yearly/annual step by year.
  const isMonthlyNav = periodType === "monthly" && activeTab !== 5;
  const periodNavRange = useMemo(() => {
    if (isMonthlyNav) {
      return {
        start: new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1),
        end: new Date(
          selectedMonth.getFullYear(),
          selectedMonth.getMonth() + 1,
          0,
          23,
          59,
          59,
          999
        ),
      };
    }
    return {
      start: new Date(currentYear, 0, 1),
      end: new Date(currentYear, 11, 31, 23, 59, 59, 999),
    };
  }, [isMonthlyNav, selectedMonth, currentYear]);

  const handlePeriodNavChange = (
    range: { start: Date; end: Date },
    meta: { mode: string }
  ) => {
    if (meta.mode === "year") {
      handleYearChange(range.start.getFullYear());
    } else {
      setSelectedMonth(range.start);
    }
  };

  // Load monthly salary report - always on mount and when month changes
  // Bank and Pinjam tabs always need monthly data
  useEffect(() => {
    fetchSalaryReport();
  }, [selectedMonth]);

  // Load yearly salary report when year or period changes
  useEffect(() => {
    if (periodType === 'yearly') {
      fetchYearlySalaryReport();
    }
  }, [currentYear, periodType]);

  // Load the active Annual sub-view when the tab/year/mode/page changes. The breakdown
  // is fetched one page at a time, so navigating pages refetches just that page.
  useEffect(() => {
    if (activeTab !== 5) return;
    if (annualViewMode === 'breakdown') {
      fetchAnnualBreakdown(breakdownPage);
    } else {
      fetchAnnualReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentYear, annualViewMode, breakdownPage]);

  // Load Cuti (leave) report when the Cuti tab is active and the year changes.
  // The batch report is yearly; the Monthly/Yearly toggle only changes how we
  // aggregate the data on the client, so we don't refetch on month/period change.
  useEffect(() => {
    if (activeTab === 4 && currentYear !== cutiFetchedYear) {
      fetchCutiReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentYear, staffs]);

  const fetchSalaryReport = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(
        `/api/salary-report?year=${currentYear}&month=${currentMonth}`
      );
      setReportData(response);
      setComprehensiveSalaryData(response.comprehensive);
    } catch (error) {
      console.error("Error fetching salary report:", error);
      setReportData(null);
      setComprehensiveSalaryData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchYearlySalaryReport = async (forceRefresh = false) => {
    setIsLoadingYearly(true);
    try {
      const response = await api.get(
        `/api/salary-report/yearly?year=${currentYear}${forceRefresh ? "&refresh=true" : ""}`
      );
      setYearlyReportData(response);
      setYearlyComprehensiveSalaryData(response.comprehensive);
    } catch (error) {
      console.error("Error fetching yearly salary report:", error);
      setYearlyReportData(null);
      setYearlyComprehensiveSalaryData(null);
    } finally {
      setIsLoadingYearly(false);
    }
  };

  const fetchAnnualReport = async (forceRefresh = false) => {
    setIsLoadingAnnual(true);
    try {
      const response = await api.get(
        `/api/salary-report/annual?year=${currentYear}${forceRefresh ? "&refresh=true" : ""}`
      );
      setAnnualData(response);
    } catch (error) {
      console.error("Error fetching annual salary report:", error);
      setAnnualData(null);
    } finally {
      setIsLoadingAnnual(false);
    }
  };

  // Fetch one page of the breakdown (1-based). The response also carries the page index
  // (pages metadata) so the pager/batch list can render without the full year.
  const fetchAnnualBreakdown = async (
    pageIndex: number,
    forceRefresh = false
  ) => {
    setIsLoadingAnnualBreakdown(true);
    try {
      const response = await api.get(
        `/api/salary-report/annual-breakdown?year=${currentYear}&page=${pageIndex + 1}${forceRefresh ? "&refresh=true" : ""}`
      );
      setAnnualBreakdownData(response);
    } catch (error) {
      console.error("Error fetching annual breakdown salary report:", error);
      setAnnualBreakdownData(null);
    } finally {
      setIsLoadingAnnualBreakdown(false);
    }
  };

  // Fetch a specific page's detail without touching the on-screen state (for batch print).
  const fetchAnnualBreakdownPage = async (
    pageNo: number
  ): Promise<AnnualBreakdownResponse | null> => {
    try {
      return await api.get(
        `/api/salary-report/annual-breakdown?year=${currentYear}&page=${pageNo}`
      );
    } catch (error) {
      console.error("Error fetching annual breakdown page:", error);
      return null;
    }
  };

  const fetchCutiReport = async () => {
    // Multi-ID employees share one leave bucket, so dedupe by name before the call.
    const employeeIds = groupStaffsByName(staffs).map((s) => s.id);
    if (employeeIds.length === 0) return;

    setCutiLoading(true);
    setCutiError(null);
    try {
      const response = await api.post("/api/leave-management/batch-reports", {
        employeeIds,
        year: currentYear,
      });
      setCutiEmployees(response.employees || []);
      setCutiFetchedYear(currentYear);
    } catch (error) {
      console.error("Error fetching cuti report:", error);
      setCutiEmployees([]);
      setCutiError("Failed to load leave report.");
    } finally {
      setCutiLoading(false);
    }
  };

  // Active data based on period type
  const activeReportData = periodType === 'yearly' ? yearlyReportData : reportData;
  const activeComprehensiveData = periodType === 'yearly' ? yearlyComprehensiveSalaryData : comprehensiveSalaryData;
  const activeLoading = periodType === 'yearly' ? isLoadingYearly : isLoading;
  const bankPinjamTabsUseMonthlyData: boolean = activeTab === 2 || activeTab === 3;
  const displayedReportData: SalaryReportResponse | null =
    bankPinjamTabsUseMonthlyData ? reportData : activeReportData;
  const displayedLoading: boolean =
    bankPinjamTabsUseMonthlyData ? isLoading : activeLoading;
  const displayedHeaderTotal: number = bankPinjamTabsUseMonthlyData
    ? displayedReportData?.summary.total_final ?? 0
    : displayedReportData?.employees_grand_totals?.setelah_digenapkan ?? 0;
  const displayedGajiGenapTotal: number = bankPinjamTabsUseMonthlyData
    ? displayedReportData?.summary.total_gaji_genap ?? 0
    : displayedReportData?.employees_grand_totals?.setelah_digenapkan ?? 0;
  const displayedFinalTotal: number = bankPinjamTabsUseMonthlyData
    ? displayedReportData?.summary.total_final ?? 0
    : displayedReportData?.employees_grand_totals?.setelah_digenapkan ?? 0;
  // Whether the Print/Download PDF buttons should be enabled. The Annual tab (5)
  // uses its own annualData; Cuti (4) has no PDF; the rest use displayedReportData.
  const pdfHasData: boolean =
    activeTab === 5
      ? annualViewMode === 'breakdown'
        ? !!annualBreakdownData && annualBreakdownData.locations.length > 0
        : !!annualData && annualData.monthly.length > 0
      : !!displayedReportData && displayedReportData.data.length > 0;
  const pdfDisabled: boolean = activeTab === 4 || !pdfHasData || isGeneratingPDF;
  // The yearly views (Annual, and the Yearly period on Employee/Location) are briefly
  // saved on the server to load faster, so they can be a couple of minutes behind.
  const dataMayBeCached: boolean =
    activeTab === 5 ||
    (periodType === 'yearly' && (activeTab === 0 || activeTab === 1));
  const refreshDisabled: boolean =
    activeTab === 4
      ? cutiLoading
      : activeTab === 5
      ? annualViewMode === 'breakdown'
        ? isLoadingAnnualBreakdown
        : isLoadingAnnual
      : displayedLoading;
  const refreshDisplayedReport = (): void => {
    if (activeTab === 5) {
      // Refresh forces a fresh server recompute (bypasses the cache).
      if (annualViewMode === 'breakdown') {
        void fetchAnnualBreakdown(breakdownPage, true);
      } else {
        void fetchAnnualReport(true);
      }
      return;
    }

    if (activeTab === 4) {
      // Force a refetch even when the year is unchanged.
      setCutiFetchedYear(null);
      void fetchCutiReport();
      return;
    }

    if (bankPinjamTabsUseMonthlyData || periodType === 'monthly') {
      void fetchSalaryReport();
      return;
    }

    void fetchYearlySalaryReport(true);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Print dropdown handlers
  const handlePrintDropdownMouseEnter = () => {
    // Clear any existing timeout
    if (printDropdownTimeoutRef.current) {
      clearTimeout(printDropdownTimeoutRef.current);
      printDropdownTimeoutRef.current = null;
    }
    setIsPrintDropdownOpen(true);
  };

  const handlePrintDropdownMouseLeave = () => {
    // Set timeout to close dropdown after 300ms
    printDropdownTimeoutRef.current = setTimeout(() => {
      setIsPrintDropdownOpen(false);
    }, 300);
  };

  // Breakdown (Pinjam by Type) dropdown handlers
  const handleBreakdownDropdownMouseEnter = () => {
    if (breakdownDropdownTimeoutRef.current) {
      clearTimeout(breakdownDropdownTimeoutRef.current);
      breakdownDropdownTimeoutRef.current = null;
    }
    setIsBreakdownDropdownOpen(true);
  };

  const handleBreakdownDropdownMouseLeave = () => {
    breakdownDropdownTimeoutRef.current = setTimeout(() => {
      setIsBreakdownDropdownOpen(false);
    }, 300);
  };

  // Annual Breakdown batch-print dropdown handlers
  const handleBatchDropdownMouseEnter = () => {
    if (batchDropdownTimeoutRef.current) {
      clearTimeout(batchDropdownTimeoutRef.current);
      batchDropdownTimeoutRef.current = null;
    }
    setIsBatchDropdownOpen(true);
  };

  const handleBatchDropdownMouseLeave = () => {
    batchDropdownTimeoutRef.current = setTimeout(() => {
      setIsBatchDropdownOpen(false);
    }, 300);
  };

  // Generate the separate Pinjam Breakdown PDF (Pinjam by Type + contributors)
  const generateBreakdownPDF = async (action: "download" | "print") => {
    if (!reportData || reportData.data.length === 0) {
      toast.error("No data available to generate PDF");
      return;
    }
    setIsGeneratingPDF(true);
    try {
      const pdfData: PinjamReportPDFData = {
        year: reportData.year,
        month: reportData.month,
        data: reportData.data,
        total_records: reportData.total_records,
        summary: reportData.summary,
      };
      await generatePinjamBreakdownPDF(pdfData, action);
      const actionText =
        action === "download" ? "downloaded" : "generated for printing";
      toast.success(`Pinjam breakdown ${actionText} successfully`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Renders the "Breakdown" print/download split button (Pinjam tab only).
  // Used in both the wide and narrow toolbars to avoid duplicating the markup.
  const renderBreakdownButton = () => {
    const disabled =
      !reportData || reportData.data.length === 0 || isGeneratingPDF;
    return (
      <div
        className="relative"
        onMouseEnter={handleBreakdownDropdownMouseEnter}
        onMouseLeave={handleBreakdownDropdownMouseLeave}
      >
        <Button
          onClick={() => generateBreakdownPDF("print")}
          icon={IconFileText}
          color="teal"
          variant="outline"
          disabled={disabled}
          size="sm"
        >
          Breakdown
        </Button>
        {isBreakdownDropdownOpen && (
          <div className="absolute right-0 top-full mt-1 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-default-200 dark:border-gray-700 py-1 min-w-[140px]">
              <button
                onClick={() => {
                  setIsBreakdownDropdownOpen(false);
                  generateBreakdownPDF("print");
                }}
                disabled={disabled}
                className="w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Print
              </button>
              <button
                onClick={() => {
                  setIsBreakdownDropdownOpen(false);
                  generateBreakdownPDF("download");
                }}
                disabled={disabled}
                className="w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download PDF
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // PDF Generation
  const generatePDF = async (action: "download" | "print") => {
    // Annual tab - summary (all totals) or breakdown (current page's location only)
    if (activeTab === 5) {
      if (annualViewMode === 'breakdown') {
        // Printing follows the page: only the current page's locations (already loaded).
        if (!annualBreakdownData || annualBreakdownData.locations.length === 0) {
          toast.error("No data available to generate PDF");
          return;
        }
        setIsGeneratingPDF(true);
        try {
          await generateSalaryReportPDF({
            reportType: 'annual-breakdown',
            periodType: 'yearly',
            year: currentYear,
            annualBreakdownData: {
              year: currentYear,
              locations: annualBreakdownData.locations,
              grand_totals: annualBreakdownData.grand_totals,
            },
            fileNameSuffix: `Batch_${annualBreakdownData.page}`,
            locationMap: LOCATION_MAP,
            locationOrder: LOCATION_ORDER,
          }, action);
          const actionText = action === "download" ? "downloaded" : "generated for printing";
          toast.success(`Batch ${annualBreakdownData.page} ${actionText} successfully`);
        } catch (error) {
          console.error("Error generating PDF:", error);
          toast.error("Failed to generate PDF");
        } finally {
          setIsGeneratingPDF(false);
        }
        return;
      }

      if (!annualData || annualData.monthly.length === 0) {
        toast.error("No data available to generate PDF");
        return;
      }
      setIsGeneratingPDF(true);
      try {
        await generateSalaryReportPDF({
          reportType: 'annual',
          periodType: 'yearly',
          year: currentYear,
          annualData,
          locationMap: LOCATION_MAP,
          locationOrder: LOCATION_ORDER,
        }, action);
        const actionText = action === "download" ? "downloaded" : "generated for printing";
        toast.success(`Annual salary report ${actionText} successfully`);
      } catch (error) {
        console.error("Error generating PDF:", error);
        toast.error("Failed to generate PDF");
      } finally {
        setIsGeneratingPDF(false);
      }
      return;
    }
    // For Employee (tab 0) and Salary (tab 1) tabs, use activeReportData which respects periodType
    // For Bank (tab 2) and Pinjam (tab 3) tabs, use monthly reportData
    const dataToCheck = (activeTab === 0 || activeTab === 1) ? activeReportData : reportData;
    if (!dataToCheck || dataToCheck.data.length === 0) {
      toast.error("No data available to generate PDF");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      if (activeTab === 0) {
        // Employee tab - individual or grouped by location report
        const reportTypeValue = employeeViewMode === 'individual'
          ? 'employee-individual' as const
          : 'employee-grouped' as const;

        await generateSalaryReportPDF({
          reportType: reportTypeValue,
          periodType,
          year: currentYear,
          month: periodType === 'monthly' ? currentMonth : undefined,
          employees: activeReportData?.employees,
          comprehensiveData: activeComprehensiveData,
          grandTotals: activeReportData?.employees_grand_totals,
          locationMap: LOCATION_MAP,
          locationOrder: LOCATION_ORDER,
        }, action);

        const viewName = employeeViewMode === 'individual' ? 'Employee' : 'Employee (By Location)';
        const actionText = action === "download" ? "downloaded" : "generated for printing";
        toast.success(`${viewName} salary report ${actionText} successfully`);
      } else if (activeTab === 1) {
        // Salary tab - location totals report
        await generateSalaryReportPDF({
          reportType: 'location',
          periodType,
          year: currentYear,
          month: periodType === 'monthly' ? currentMonth : undefined,
          comprehensiveData: activeComprehensiveData,
          grandTotals: activeComprehensiveData?.grand_totals,
          locationMap: LOCATION_MAP,
          locationOrder: LOCATION_ORDER,
        }, action);

        const actionText = action === "download" ? "downloaded" : "generated for printing";
        toast.success(`Location salary report ${actionText} successfully`);
      } else if (activeTab === 2) {
        // Generate Bank Report PDF
        if (!reportData) return; // Guard for TypeScript
        const bankPdfData: BankReportPDFData = {
          year: reportData.year,
          month: reportData.month,
          data: bankTableData,
          total_records: reportData.total_records,
          summary: {
            total_final: reportData.summary.total_final,
          },
        };

        await generateBankReportPDF(bankPdfData, action);
        const actionText =
          action === "download" ? "downloaded" : "generated for printing";
        toast.success(`Bank report ${actionText} successfully`);
      } else {
        // Generate Pinjam (Salary) Report PDF
        if (!reportData) return; // Guard for TypeScript
        const pdfData: PinjamReportPDFData = {
          year: reportData.year,
          month: reportData.month,
          data: reportData.data,
          total_records: reportData.total_records,
          summary: reportData.summary,
        };

        await generatePinjamReportPDF(pdfData, action);
        const actionText =
          action === "download" ? "downloaded" : "generated for printing";
        toast.success(`Pinjam report ${actionText} successfully`);
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Annual Breakdown is paginated server-side: each page (a batch capped at ~30 staff)
  // is fetched on demand. These derive the pager from the current page's response; the
  // on-screen page IS the print batch, so what you see is exactly what prints.
  const breakdownTotalPages = annualBreakdownData?.total_pages ?? 0;
  const breakdownPagesMeta = annualBreakdownData?.pages ?? [];
  const breakdownPageIndex = Math.min(
    breakdownPage,
    Math.max(0, breakdownTotalPages - 1)
  );

  // Print/download a specific page's batch: fetch its detail, then build the PDF.
  const generateBreakdownBatch = async (
    pageNo: number,
    action: "download" | "print"
  ) => {
    setBatchPrintingKey(`${pageNo}-${action}`);
    try {
      const detail = await fetchAnnualBreakdownPage(pageNo);
      if (!detail || detail.locations.length === 0) {
        toast.error("No data available to generate PDF");
        return;
      }
      await generateSalaryReportPDF({
        reportType: 'annual-breakdown',
        periodType: 'yearly',
        year: currentYear,
        annualBreakdownData: {
          year: currentYear,
          locations: detail.locations,
          grand_totals: detail.grand_totals,
        },
        fileNameSuffix: `Batch_${pageNo}`,
        locationMap: LOCATION_MAP,
        locationOrder: LOCATION_ORDER,
      }, action);
      const actionText = action === "download" ? "downloaded" : "generated for printing";
      toast.success(`Batch ${pageNo} ${actionText} successfully`);
    } catch (error) {
      console.error("Error generating batch PDF:", error);
      toast.error("Failed to generate batch PDF");
    } finally {
      setBatchPrintingKey(null);
    }
  };

  // "Batch Print" split button (Annual → Breakdown). The auto-computed batches are
  // listed on hover, each ready to print/download as its own (capped) PDF.
  const renderBatchPrintButton = () => {
    const busy = batchPrintingKey !== null;
    const disabled = breakdownPagesMeta.length === 0 || isGeneratingPDF;
    return (
      <div
        className="relative"
        onMouseEnter={handleBatchDropdownMouseEnter}
        onMouseLeave={handleBatchDropdownMouseLeave}
      >
        <Button
          onClick={() => setIsBatchDropdownOpen(true)}
          icon={IconPrinter}
          color="sky"
          variant="outline"
          disabled={disabled}
          size="sm"
        >
          Batch Print
        </Button>
        {isBatchDropdownOpen && breakdownPagesMeta.length > 0 && (
          <div className="absolute right-0 top-full mt-1 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-default-200 dark:border-gray-700 py-1 min-w-[300px] max-h-[60vh] overflow-auto">
              <div className="px-3 py-1.5 text-[11px] font-medium text-default-500 dark:text-gray-400 border-b border-default-200 dark:border-gray-700">
                {breakdownPagesMeta.length} batch
                {breakdownPagesMeta.length > 1 ? "es" : ""}
              </div>
              {breakdownPagesMeta.map((meta, idx) => {
                const n = idx + 1;
                const names = meta.locations
                  .map((code) => LOCATION_MAP[code] || code)
                  .join(", ");
                const printing = batchPrintingKey === `${n}-print`;
                const downloading = batchPrintingKey === `${n}-download`;
                return (
                  <div
                    key={n}
                    className="px-3 py-2 border-t border-default-100 dark:border-gray-700 first:border-t-0"
                  >
                    <div className="text-xs font-medium text-default-800 dark:text-gray-100">
                      Batch {n} · {meta.staff} staff · {meta.locations.length}{" "}
                      location{meta.locations.length > 1 ? "s" : ""}
                    </div>
                    <div className="text-[11px] text-default-500 dark:text-gray-400 whitespace-normal break-words">
                      {names}
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      <Button
                        onClick={() => generateBreakdownBatch(n, "print")}
                        icon={IconPrinter}
                        color="green"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                      >
                        {printing ? "…" : "Print"}
                      </Button>
                      <Button
                        onClick={() => generateBreakdownBatch(n, "download")}
                        icon={IconFileText}
                        color="sky"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                      >
                        {downloading ? "…" : "Download"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Text Export Generation
  const generateExportURL = () => {
    // Determine server URL based on environment
    const isProduction = window.location.hostname === "tienhock.com";
    const baseURL = isProduction
      ? "https://api.tienhock.com"
      : "http://localhost:5001";
    const url = `${baseURL}/api/excel/payment-export?year=${exportYear}&month=${exportMonth}&api_key=foodmaker`;

    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success("Export URL copied to clipboard!");
        setShowExportDialog(false);
      })
      .catch(() => {
        toast.error("Failed to copy URL to clipboard");
      });
  };

  const generateTextExport = async () => {
    if (!reportData || reportData.data.length === 0) {
      toast.error("No data available to export");
      return;
    }

    setIsGeneratingExport(true);
    try {
      // Generate payment date (last day of the month)
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
      const paymentDate = `${lastDayOfMonth
        .toString()
        .padStart(2, "0")}/${currentMonth
        .toString()
        .padStart(2, "0")}/${currentYear}`;

      // Define payment date row
      const paymentDateRow = [
        "PAYMENT DATE : (DD/MM/YYYY)",
        paymentDate,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ];

      // Define column headers with 2-row format
      const headerRow1 = [
        "Payment Type/ Mode : PBB/IBG/REN",
        "Bene Acct No.",
        "BIC",
        "Bene Full Name",
        "ID Type: For Intrabank & IBG NI, OI, BR, PL, ML, PP For Rentas NI, OI, BR, OT",
        "Bene Identification No / Passport",
        "Payment Amount (with 2 decimal points)",
        "Recipient Reference (shown in sender and bene statement)",
        "Other Payment Details (shown in sender and bene statement)",
        "Bene Email 1",
        "Bene Email 2",
        "Bene Mobile No. 1 (charge RM0.20 per number)",
        "Bene Mobile No. 2 (charge RM0.20 per number)",
        "Joint Bene Name",
        "Joint Bene Identification No.",
        "Joint ID Type: For Intrabank & IBG NI, OI, BR, PL, ML, PP For Rentas NI, OI, BR, OT",
        "E-mail Content Line 1 (will be shown in bene email)",
        "E-mail Content Line 2 (will be shown in bene email)",
        "E-mail Content Line 3 (will be shown in bene email)",
        "E-mail Content Line 4 (will be shown in bene email)",
        "E-mail Content Line 5 (will be shown in bene email)",
      ];

      const headerRow2 = [
        "(M) - Char: 3 - A",
        "(M) - Char: 20 - N",
        "(M) - Char: 11 - A",
        "(M) - Char: 120 - A",
        "(M) - Char: 2 - A",
        "(O) - Char: 29 - AN",
        "(M) - Char: 18 - N",
        "(M) - Char: 20 - AN",
        "(O) - Char: 20 - AN",
        "(O) - Char: 70 - AN",
        "(O) - Char: 70 - AN",
        "(O) - Char: 15 - N",
        "(O) - Char: 15 - N",
        "(O) - Char: 120 - A",
        "(O) - Char: 29 - AN",
        "(O) - Char: 2 - A",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
      ];

      // Generate data rows
      const dataRows = reportData.data
        .filter((row) => parseFloat(row.final_total.toString()) > 0)
        .map((row) => {
          const staff = staffs?.find((s) => s.id === row.staff_id);
          const paymentAmount = parseFloat(row.final_total.toString()).toFixed(
            2
          );

          const columns = [
            "PBB", // Column 1
            (staff?.bankAccountNumber || "").replace(/-/g, ""), // Column 2 - remove hyphens
            "PBBEMYKL", // Column 3
            (row.staff_name || "").replace(/,/g, " "), // Column 4 - remove commas
            staff?.document || "", // Column 5
            (staff?.icNo || "").replace(/-/g, ""), // Column 6 - remove hyphens
            paymentAmount, // Column 7 - plain number format
            "Salary", // Column 8
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "", // Columns 9-16
            "Content Line 1", // Column 17
            "Content Line 2", // Column 18
            "Content Line 3", // Column 19
            "Content Line 4", // Column 20
            "Content Line 5", // Column 21
          ];

          return columns;
        });

      // Calculate total payment amount
      const totalAmount = reportData.data
        .filter((row) => parseFloat(row.final_total.toString()) > 0)
        .reduce((sum, row) => sum + parseFloat(row.final_total.toString()), 0);

      // Create total row
      const totalRow = [
        "TOTAL:",
        "",
        "",
        "",
        "",
        "",
        totalAmount.toFixed(2),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ];

      // Combine all rows
      const allRows = [
        paymentDateRow,
        headerRow1,
        headerRow2,
        ...dataRows,
        totalRow,
      ];

      // Convert to text format (semicolon separated)
      const textContent = allRows.map((row) => row.join(";")).join("\r\n");

      // Create and download the file
      const blob = new Blob([textContent], {
        type: "text/plain;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payment-export-${currentMonth
        .toString()
        .padStart(2, "0")}-${currentYear}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Payment export file downloaded successfully");
    } catch (error) {
      console.error("Error generating text export:", error);
      toast.error("Failed to generate text export");
    } finally {
      setIsGeneratingExport(false);
    }
  };

  // Employee Salary Table Component (individual employees)
  const EmployeeSalaryTable = () => {
    const employees = activeReportData?.employees || [];
    const grandTotals = activeReportData?.employees_grand_totals;

    if (employees.length === 0) return null;

    return (
      <div className="overflow-auto mb-2 max-h-[75vh] border border-default-200 dark:border-gray-700 rounded-lg">
        <table className="w-full">
          <thead className="sticky top-0 z-20 bg-default-50 dark:bg-gray-900">
            <tr>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700" title="Bilangan">
                BIL
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[120px] truncate" title="Nama Pekerja">
                NAMA PEKERJA
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[80px] truncate" title="Gaji">
                GAJI
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[60px] truncate" title="Overtime">
                OT
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Bonus">
                BONUS
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Commission / Insentif / Others">
                C/I/O
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Cuti (semua jenis)">
                CUTI
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Gaji Kasar">
                GAJI KASAR
              </th>
              <th
                className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                colSpan={2}
                title="EPF"
              >
                EPF
              </th>
              <th
                className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                colSpan={2}
                title="SOCSO"
              >
                SOCSO
              </th>
              <th
                className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                colSpan={2}
                title="SIP"
              >
                SIP
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900 max-w-[60px] truncate" title="PCB">
                PCB
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Gaji Bersih">
                GAJI BERSIH
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[90px] truncate" title="Setengah Bulan">
                1/2 BULAN
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[80px] truncate" title="Jumlah">
                JUMLAH
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Digenapkan">
                DIGENAPKAN
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[150px] truncate" title="Setelah Digenapkan">
                SETELAH DIGENAPKAN
              </th>
            </tr>
            <tr>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                PKJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                PKJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                PKJ
              </th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
            {employees.map((emp, index) => (
              <tr
                key={emp.staff_id}
                className={`${index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-default-25 dark:bg-gray-750"} ${emp.employee_payroll_id ? "cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700" : ""}`}
                onClick={() => emp.employee_payroll_id && window.open(`/payroll/employee-payroll/${emp.employee_payroll_id}`, '_blank')}
              >
                <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                  {emp.no}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left max-w-[100px]">
                  <span className="block truncate" title={`${emp.staff_id.toUpperCase()} - ${emp.staff_name.toUpperCase()}`}>
                    {emp.staff_id.toUpperCase()} - {emp.staff_name.toUpperCase()}
                  </span>
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.gaji)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.ot)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.bonus)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.comm)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.cuti)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.gaji_kasar)}
                </td>
                <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                  {formatCurrency(emp.epf_majikan)}
                </td>
                <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.epf_pekerja)}
                </td>
                <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                  {formatCurrency(emp.socso_majikan)}
                </td>
                <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.socso_pekerja)}
                </td>
                <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                  {formatCurrency(emp.sip_majikan)}
                </td>
                <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.sip_pekerja)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                  {formatCurrency(emp.pcb)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.gaji_bersih)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.setengah_bulan)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.jumlah)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.digenapkan)}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                  {formatCurrency(emp.setelah_digenapkan)}
                </td>
              </tr>
            ))}
          </tbody>
          {grandTotals && (
            <tfoot className="sticky bottom-0 z-20">
              <tr>
                <td
                  colSpan={2}
                  className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
                >
                  GRAND TOTAL
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.gaji)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.ot)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.bonus)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.comm)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.cuti)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.gaji_kasar)}
                </td>
                <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                  {formatCurrency(grandTotals.epf_majikan)}
                </td>
                <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.epf_pekerja)}
                </td>
                <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                  {formatCurrency(grandTotals.socso_majikan)}
                </td>
                <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.socso_pekerja)}
                </td>
                <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                  {formatCurrency(grandTotals.sip_majikan)}
                </td>
                <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.sip_pekerja)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                  {formatCurrency(grandTotals.pcb)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.gaji_bersih)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.setengah_bulan)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.jumlah)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.digenapkan)}
                </td>
                <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals.setelah_digenapkan)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  // Location Grouped Table Component - shows employees grouped by location
  const LocationGroupedTable = () => {
    if (!activeComprehensiveData) return null;

    // Process locations: merge 16-24 into 14
    const processedLocations = useMemo(() => {
      const locationsCopy = JSON.parse(JSON.stringify(activeComprehensiveData.locations)) as LocationSalaryData[];

      // Find location 14 or create it
      let location14 = locationsCopy.find(loc => loc.location === '14');
      if (!location14) {
        location14 = {
          location: '14',
          employees: [],
          totals: {
            gaji: 0, ot: 0, bonus: 0, comm: 0, cuti: 0, gaji_kasar: 0,
            epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
            sip_majikan: 0, sip_pekerja: 0, pcb: 0, gaji_bersih: 0,
            setengah_bulan: 0, jumlah: 0, digenapkan: 0, setelah_digenapkan: 0
          }
        };
        locationsCopy.push(location14);
      }

      // Merge employees from locations 16-24 into location 14
      // Use a Map to deduplicate employees by staff_id (aggregate their values)
      const commissionLocations = ['16', '17', '18', '19', '20', '21', '22', '23', '24'];
      type LocationEmployee = LocationSalaryData['employees'][0];
      const mergedEmployeesMap = new Map<string, LocationEmployee>();

      // First, add existing location 14 employees to the map
      location14.employees.forEach(emp => {
        mergedEmployeesMap.set(emp.staff_id, { ...emp });
      });

      // Merge commission location employees
      commissionLocations.forEach(locId => {
        const commissionLoc = locationsCopy.find(loc => loc.location === locId);
        if (commissionLoc && commissionLoc.employees.length > 0) {
          commissionLoc.employees.forEach(emp => {
            const existing = mergedEmployeesMap.get(emp.staff_id);
            if (existing) {
              // Aggregate values for the same employee
              existing.gaji += emp.gaji;
              existing.ot += emp.ot;
              existing.bonus += emp.bonus;
              existing.comm += emp.comm;
              existing.cuti += emp.cuti;
              existing.gaji_kasar += emp.gaji_kasar;
              existing.epf_majikan += emp.epf_majikan;
              existing.epf_pekerja += emp.epf_pekerja;
              existing.socso_majikan += emp.socso_majikan;
              existing.socso_pekerja += emp.socso_pekerja;
              existing.sip_majikan += emp.sip_majikan;
              existing.sip_pekerja += emp.sip_pekerja;
              existing.pcb += emp.pcb;
              existing.gaji_bersih += emp.gaji_bersih;
              existing.setengah_bulan += emp.setengah_bulan;
              existing.jumlah += emp.jumlah;
              existing.digenapkan += emp.digenapkan;
              existing.setelah_digenapkan += emp.setelah_digenapkan;
            } else {
              mergedEmployeesMap.set(emp.staff_id, { ...emp });
            }
          });
          // Add totals to location 14
          Object.keys(location14!.totals).forEach(key => {
            const k = key as keyof typeof location14.totals;
            location14!.totals[k] += commissionLoc.totals[k];
          });
        }
      });

      // Replace location 14 employees with deduplicated merged employees
      location14.employees = Array.from(mergedEmployeesMap.values());

      // Filter out commission locations (16-24) and empty locations
      // Sort numerically by location code
      const filteredLocations = locationsCopy
        .filter(loc => !commissionLocations.includes(loc.location))
        .filter(loc => loc.employees.length > 0)
        .sort((a, b) => parseInt(a.location, 10) - parseInt(b.location, 10));

      return filteredLocations;
    }, [activeComprehensiveData]);

    // Use the same deduplicated employees_grand_totals from activeReportData as the Individual view
    // This ensures both views show identical grand totals
    const grandTotals = activeReportData?.employees_grand_totals;

    if (processedLocations.length === 0 || !grandTotals) return null;

    return (
      <div className="space-y-3">
        {processedLocations.map((locationData) => {
          const locationName = LOCATION_MAP[locationData.location] || `Location ${locationData.location}`;

          return (
            <div key={locationData.location} className="overflow-auto border border-default-200 dark:border-gray-700 rounded-lg">
              {/* Location Header */}
              <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-2 border-b border-default-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-sky-800 dark:text-sky-300">
                  {locationData.location} - {locationName.toUpperCase()}
                </h3>
              </div>

              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[40px]" />
                  <col className="w-[140px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[90px]" />
                  <col className="w-[70px]" />
                  <col className="w-[70px]" />
                  <col className="w-[70px]" />
                  <col className="w-[70px]" />
                  <col className="w-[70px]" />
                  <col className="w-[70px]" />
                  <col className="w-[70px]" />
                  <col className="w-[90px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[110px]" />
                </colgroup>
                <thead className="bg-default-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700" title="Bilangan">
                      BIL
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[120px] truncate" title="Nama Pekerja">
                      NAMA PEKERJA
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[80px] truncate" title="Gaji">
                      GAJI
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[60px] truncate" title="Overtime">
                      OT
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Bonus">
                      BONUS
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Commission / Insentif / Lain-lain">
                      COMM/INS/LAIN
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Cuti (semua jenis)">
                      CUTI
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Gaji Kasar">
                      GAJI KASAR
                    </th>
                    <th
                      className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                      colSpan={2}
                      title="EPF"
                    >
                      EPF
                    </th>
                    <th
                      className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                      colSpan={2}
                      title="SOCSO"
                    >
                      SOCSO
                    </th>
                    <th
                      className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                      colSpan={2}
                      title="SIP"
                    >
                      SIP
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900 max-w-[60px] truncate" title="PCB">
                      PCB
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Gaji Bersih">
                      GAJI BERSIH
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[90px] truncate" title="Setengah Bulan">
                      1/2 BULAN
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[80px] truncate" title="Jumlah">
                      JUMLAH
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Digenapkan">
                      DIGENAPKAN
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[150px] truncate" title="Setelah Digenapkan">
                      SETELAH DIGENAPKAN
                    </th>
                  </tr>
                  <tr>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="px-1 py-1 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                      MAJ
                    </th>
                    <th className="px-1 py-1 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                      PKJ
                    </th>
                    <th className="px-1 py-1 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                      MAJ
                    </th>
                    <th className="px-1 py-1 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                      PKJ
                    </th>
                    <th className="px-1 py-1 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                      MAJ
                    </th>
                    <th className="px-1 py-1 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                      PKJ
                    </th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                    <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {locationData.employees.map((emp, index) => (
                    <tr
                      key={`${emp.staff_id}-${index}`}
                      className={`${index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-default-25 dark:bg-gray-750"} ${emp.employee_payroll_id ? "cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700" : ""}`}
                      onClick={() => emp.employee_payroll_id && window.open(`/payroll/employee-payroll/${emp.employee_payroll_id}`, '_blank')}
                    >
                      <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                        {index + 1}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left max-w-[100px]">
                        <span className="block truncate" title={`${emp.staff_id.toUpperCase()} - ${emp.staff_name.toUpperCase()}`}>
                          {emp.staff_id.toUpperCase()} - {emp.staff_name.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.gaji)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.ot)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.bonus)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.comm)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.cuti)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.gaji_kasar)}
                      </td>
                      <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                        {formatCurrency(emp.epf_majikan)}
                      </td>
                      <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.epf_pekerja)}
                      </td>
                      <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                        {formatCurrency(emp.socso_majikan)}
                      </td>
                      <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.socso_pekerja)}
                      </td>
                      <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                        {formatCurrency(emp.sip_majikan)}
                      </td>
                      <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.sip_pekerja)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                        {formatCurrency(emp.pcb)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.gaji_bersih)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.setengah_bulan)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.jumlah)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.digenapkan)}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                        {formatCurrency(emp.setelah_digenapkan)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      colSpan={2}
                      className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600"
                    >
                      SUBTOTAL
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.gaji)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.ot)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.bonus)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.comm)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.cuti)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.gaji_kasar)}
                    </td>
                    <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                      {formatCurrency(locationData.totals.epf_majikan)}
                    </td>
                    <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.epf_pekerja)}
                    </td>
                    <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                      {formatCurrency(locationData.totals.socso_majikan)}
                    </td>
                    <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.socso_pekerja)}
                    </td>
                    <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                      {formatCurrency(locationData.totals.sip_majikan)}
                    </td>
                    <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.sip_pekerja)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                      {formatCurrency(locationData.totals.pcb)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.gaji_bersih)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.setengah_bulan)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.jumlah)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.digenapkan)}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600">
                      {formatCurrency(locationData.totals.setelah_digenapkan)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}

        {/* Grand Total Section */}
        <div className="overflow-auto border-2 border-sky-500 dark:border-sky-600 rounded-lg">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[40px]" />
              <col className="w-[140px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[90px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[90px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[110px]" />
            </colgroup>
            <tbody>
              <tr>
                <td
                  colSpan={2}
                  className="px-2 py-3 text-sm font-bold text-white text-center bg-sky-600 dark:bg-sky-700"
                >
                  GRAND TOTAL
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.gaji)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.ot)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.bonus)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.comm)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.cuti)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.gaji_kasar)}
                </td>
                <td className="px-1 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center border-l border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.epf_majikan)}
                </td>
                <td className="px-1 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.epf_pekerja)}
                </td>
                <td className="px-1 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center border-l border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.socso_majikan)}
                </td>
                <td className="px-1 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.socso_pekerja)}
                </td>
                <td className="px-1 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center border-l border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.sip_majikan)}
                </td>
                <td className="px-1 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.sip_pekerja)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center border-l border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.pcb)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.gaji_bersih)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.setengah_bulan)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.jumlah)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.digenapkan)}
                </td>
                <td className="px-2 py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40">
                  {formatCurrency(grandTotals.setelah_digenapkan)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Comprehensive Salary Table Component
  const ComprehensiveSalaryTable = () => {
    if (!activeComprehensiveData) return null;

    return (
      <div className="overflow-auto mb-2 max-h-[75vh] border border-default-200 dark:border-gray-700 rounded-lg">
        <table className="w-full">
          <thead className="sticky top-0 z-20 bg-default-50 dark:bg-gray-900">
            <tr>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700" title="Bilangan">
                BIL
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[130px] truncate" title="Bahagian Kerja">
                BAHAGIAN KERJA
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[80px] truncate" title="Gaji">
                GAJI
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[60px] truncate" title="Overtime">
                OT
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Bonus">
                BONUS
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Commission / Insentif / Lain-lain">
                COMM/INS/LAIN
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[70px] truncate" title="Cuti (semua jenis)">
                CUTI
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Gaji Kasar">
                GAJI KASAR
              </th>
              <th
                className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                colSpan={2}
                title="EPF"
              >
                EPF
              </th>
              <th
                className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                colSpan={2}
                title="SOCSO"
              >
                SOCSO
              </th>
              <th
                className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                colSpan={2}
                title="SIP"
              >
                SIP
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900 max-w-[60px] truncate" title="PCB">
                PCB
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Gaji Bersih">
                GAJI BERSIH
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[90px] truncate" title="Setengah Bulan">
                1/2 BULAN
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[80px] truncate" title="Jumlah">
                JUMLAH
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[100px] truncate" title="Digenapkan">
                DIGENAPKAN
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 max-w-[150px] truncate" title="Setelah Digenapkan">
                SETELAH DIGENAPKAN
              </th>
            </tr>
            <tr>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                PKJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                PKJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                PKJ
              </th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
              <th className="bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700"></th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
            {LOCATION_ORDER.map((item, index) => {
              if (item.type === "header") {
                return (
                  <tr key={`header-${index}`} className="bg-default-100 dark:bg-gray-800">
                    <td
                      colSpan={20}
                      className="px-2 py-2 text-center text-xs font-medium text-default-600 dark:text-gray-300 border-t border-default-300 dark:border-gray-600"
                    >
                      {item.text}
                    </td>
                  </tr>
                );
              }

              const locationData = activeComprehensiveData.locations.find(
                (loc) => loc.location === item.id
              );
              const locationNumber = item.id!;
              const locationName = LOCATION_MAP[item.id!];

              return (
                <tr key={item.id} className={index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-default-25 dark:bg-gray-750"}>
                  <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                    {locationNumber}
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left max-w-[100px]">
                    <span className="block truncate" title={locationName}>
                      {locationName}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.gaji || 0}
                      breakdown={locationData?.employees?.filter(e => e.gaji !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.gaji,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Gaji (Base + Tambahan)"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.ot || 0}
                      breakdown={locationData?.employees?.filter(e => e.ot !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.ot,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Overtime"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.bonus || 0}
                      breakdown={locationData?.employees?.filter(e => e.bonus !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.bonus,
                        link: `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Bonus"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.comm || 0}
                      breakdown={locationData?.employees?.filter(e => e.comm !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.comm,
                        link: `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Commission / Insentif / Lain-lain"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.cuti || 0}
                      breakdown={locationData?.employees?.filter(e => e.cuti !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.cuti,
                        link: `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Cuti"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.gaji_kasar || 0}
                      breakdown={locationData?.employees?.filter(e => e.gaji_kasar !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.gaji_kasar,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Gaji Kasar (Gross)"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.epf_majikan || 0}
                      breakdown={locationData?.employees?.filter(e => e.epf_majikan !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.epf_majikan,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="EPF Majikan"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.epf_pekerja || 0}
                      breakdown={locationData?.employees?.filter(e => e.epf_pekerja !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.epf_pekerja,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="EPF Pekerja"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.socso_majikan || 0}
                      breakdown={locationData?.employees?.filter(e => e.socso_majikan !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.socso_majikan,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="SOCSO Majikan"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.socso_pekerja || 0}
                      breakdown={locationData?.employees?.filter(e => e.socso_pekerja !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.socso_pekerja,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="SOCSO Pekerja"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.sip_majikan || 0}
                      breakdown={locationData?.employees?.filter(e => e.sip_majikan !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.sip_majikan,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="SIP Majikan"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.sip_pekerja || 0}
                      breakdown={locationData?.employees?.filter(e => e.sip_pekerja !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.sip_pekerja,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="SIP Pekerja"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.pcb || 0}
                      breakdown={locationData?.employees?.filter(e => e.pcb !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.pcb,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="PCB (Income Tax)"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.gaji_bersih || 0}
                      breakdown={locationData?.employees?.filter(e => e.gaji_bersih !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.gaji_bersih,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Gaji Bersih (Net)"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.setengah_bulan || 0}
                      breakdown={locationData?.employees?.filter(e => e.setengah_bulan !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.setengah_bulan,
                        link: `/payroll/mid-month-payrolls?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="1/2 Bulan (Mid-month)"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.jumlah || 0}
                      breakdown={locationData?.employees?.filter(e => e.jumlah !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.jumlah,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Jumlah"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.digenapkan || 0}
                      breakdown={locationData?.employees?.filter(e => e.digenapkan !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.digenapkan,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Digenapkan"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    <SalaryAmountTooltip
                      amount={locationData?.totals.setelah_digenapkan || 0}
                      breakdown={locationData?.employees?.filter(e => e.setelah_digenapkan !== 0).map(e => ({
                        description: e.staff_name,
                        amount: e.setelah_digenapkan,
                        link: e.employee_payroll_id
                          ? `/payroll/employee-payroll/${e.employee_payroll_id}`
                          : `/payroll/incentives?year=${currentYear}&month=${currentMonth}`
                      })) || []}
                      label="Setelah Digenapkan"
                      formatCurrency={(v) => formatCurrency(v)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr>
              <td
                colSpan={2}
                className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
              >
                GRAND TOTAL
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(activeComprehensiveData.grand_totals.gaji)}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(activeComprehensiveData.grand_totals.ot)}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(activeComprehensiveData.grand_totals.bonus)}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(activeComprehensiveData.grand_totals.comm)}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(activeComprehensiveData.grand_totals.cuti)}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.gaji_kasar
                )}
              </td>
              <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.epf_majikan
                )}
              </td>
              <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.epf_pekerja
                )}
              </td>
              <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.socso_majikan
                )}
              </td>
              <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.socso_pekerja
                )}
              </td>
              <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.sip_majikan
                )}
              </td>
              <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.sip_pekerja
                )}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800">
                {formatCurrency(activeComprehensiveData.grand_totals.pcb)}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.gaji_bersih
                )}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(
                  activeComprehensiveData.grand_totals.setengah_bulan
                )}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(activeComprehensiveData.grand_totals.jumlah)}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(activeComprehensiveData.grand_totals.digenapkan)}
              </td>
              <td className="px-2 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                {formatCurrency(activeComprehensiveData.grand_totals.setelah_digenapkan)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // Export Dialog Component
  const ExportDialog = () => (
    <Transition appear show={showExportDialog} as={React.Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50"
        onClose={() => setShowExportDialog(false)}
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
            <DialogPanel
              className="fixed inset-0 bg-black opacity-30"
              onClick={() => setShowExportDialog(false)}
            />
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
              className="inline-block w-full max-w-md p-6 my-8 text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <DialogTitle
                as="h3"
                className="text-lg font-medium leading-6 text-default-900 dark:text-gray-100"
              >
                Export Link Generator
              </DialogTitle>
              <div className="mt-4 space-y-4">
                <FormListbox
                  name="exportYear"
                  label="Year"
                  value={exportYear.toString()}
                  onChange={(value) => setExportYear(Number(value))}
                  options={yearOptions}
                />
                <FormListbox
                  name="exportMonth"
                  label="Month"
                  value={exportMonth.toString()}
                  onChange={(value) => setExportMonth(Number(value))}
                  options={monthOptions}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  onClick={() => setShowExportDialog(false)}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button onClick={generateExportURL} color="blue" size="sm">
                  Copy URL
                </Button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );

  const columnGuideText =
    columnGuideLanguage === "bm"
      ? {
          title: "Panduan lajur Laporan Gaji",
          subtitle:
            "Panduan ini menerangkan cara pendapatan ditetapkan pada lajur Laporan Gaji.",
          priorityTitle: "Keutamaan",
          priority:
            "Pilihan lajur pada entri Lain-lain/Kerja Luar didahulukan, diikuti tetapan Salary Report Column pada Kod Gaji. Jika kedua-duanya Automatic, peraturan di bawah digunakan.",
          gajiTitle: "GAJI",
          gajiBefore:
            "Bagi pekerja yang mempunyai item Base berkadar Hour atau Day, kerja biasa berkadar Hour, Day dan Fixed masuk ke Gaji. Bagi pekerja pembungkusan tulen tanpa Base Hour/Day, Gaji ialah Base pembungkusan serta bayaran F/HARIAN produksi ",
          gajiMid: ". Kod ",
          gajiAfter: " sentiasa dikira sebagai Gaji untuk semua pekerja.",
          otTitle: "OT",
          ot: "Semua item payroll dan Lain-lain/Kerja Luar yang Kod Gajinya bertipe Overtime.",
          bonusTitle: "BONUS",
          bonusBefore: "Item dengan Kod Gaji ",
          bonusAfter: " serta rekod komisen/bonus tanpa lokasi.",
          cioTitle: "C/I/O",
          cioBefore:
            "Komisen mengikut lokasi, kerja ikut unit bagi pekerja yang mempunyai Base Hour/Day, serta kod insentif/tugasan seperti ",
          cioAfter:
            ". Bagi pekerja pembungkusan tulen, tambahan bukan Base yang lain kekal di sini; bayaran F/HARIAN ",
          cioEnd: " mereka masuk ke Gaji.",
          cutiTitle: "CUTI",
          cuti:
            "Cuti yang diluluskan, rekod Cuti Tahunan, dan rekod komisen yang ditanda lokasi 23 atau Cuti Tahunan.",
          sharedTitle: "ID pekerja yang sama nama",
          shared:
            "Cuti, Lain-lain/Kerja Luar dan komisen yang direkod di bawah ID staf berlainan tetapi nama sama digabungkan ke dalam satu baris payroll pekerja.",
          close: "Tutup",
        }
      : {
          title: "Salary Report column guide",
          subtitle:
            "This guide explains how earnings are assigned to the Salary Report columns.",
          priorityTitle: "Priority",
          priority:
            "An individual Others/Kerja Luar column choice wins first, followed by the Pay Code's Salary Report Column setting. If both are Automatic, the rules below apply.",
          gajiTitle: "GAJI",
          gajiBefore:
            "For workers with a Base item using an Hour or Day rate, regular Hour, Day, and Fixed work goes to Gaji. For pure packing workers without an Hour/Day Base, Gaji is Base packing pay plus F/HARIAN ",
          gajiMid: ". The ",
          gajiAfter: " Pay Codes always count as Gaji for all workers.",
          otTitle: "OT",
          ot: "All payroll and Others/Kerja Luar entries whose Pay Code type is Overtime.",
          bonusTitle: "BONUS",
          bonusBefore: "Entries using the ",
          bonusAfter: " Pay Code, plus commission/bonus records without a location.",
          cioTitle: "C/I/O",
          cioBefore:
            "Location-based commission, piece-rate work for workers with an Hour/Day Base, and incentive/duty codes such as ",
          cioAfter:
            ". For pure packing workers, other non-Base extras remain here; their F/HARIAN ",
          cioEnd: " pay goes to Gaji.",
          cutiTitle: "CUTI",
          cuti:
            "Approved leave, Cuti Tahunan records, and commission records marked as location 23 or Cuti Tahunan.",
          sharedTitle: "Shared staff IDs",
          shared:
            "Leave, Others/Kerja Luar, and commission recorded under staff IDs with the same name are combined into the employee's payroll row.",
          close: "Close",
        };

  const PayCode = ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <code className="mx-0.5 inline-block rounded bg-default-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-default-800 dark:bg-gray-700 dark:text-gray-100">
      {children}
    </code>
  );

  const ColumnGuideDialog = () => (
    <Transition appear show={showColumnGuide} as={React.Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50"
        onClose={() => setShowColumnGuide(false)}
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
            <DialogPanel
              className="fixed inset-0 bg-black opacity-30"
              onClick={() => setShowColumnGuide(false)}
            />
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
              className="inline-block w-full max-w-2xl p-6 my-8 text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl"
              onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-900 dark:text-gray-100"
                  >
                    {columnGuideText.title}
                  </DialogTitle>
                  <p className="mt-2 text-sm text-default-600 dark:text-gray-300">
                    {columnGuideText.subtitle}
                  </p>
                </div>
                <div
                  className="flex shrink-0 items-center bg-default-100 dark:bg-gray-700 rounded-lg p-0.5 text-xs"
                  role="group"
                  aria-label="Column guide language"
                >
                  <button
                    type="button"
                    onClick={() => setColumnGuideLanguage("bm")}
                    className={`px-2 py-1 rounded-md transition-colors ${
                      columnGuideLanguage === "bm"
                        ? "bg-white dark:bg-gray-600 text-sky-600 dark:text-sky-400 font-medium shadow-sm"
                        : "text-default-500 dark:text-gray-400 hover:text-default-700"
                    }`}
                  >
                    BM
                  </button>
                  <button
                    type="button"
                    onClick={() => setColumnGuideLanguage("en")}
                    className={`px-2 py-1 rounded-md transition-colors ${
                      columnGuideLanguage === "en"
                        ? "bg-white dark:bg-gray-600 text-sky-600 dark:text-sky-400 font-medium shadow-sm"
                        : "text-default-500 dark:text-gray-400 hover:text-default-700"
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-4 text-sm text-default-700 dark:text-gray-200">
                <section>
                  <h4 className="font-semibold text-default-900 dark:text-gray-100">{columnGuideText.priorityTitle}</h4>
                  <p className="mt-1">{columnGuideText.priority}</p>
                </section>

                <section>
                  <h4 className="font-semibold text-default-900 dark:text-gray-100">{columnGuideText.gajiTitle}</h4>
                  <p className="mt-1">
                    {columnGuideText.gajiBefore}<PayCode>FULL_*</PayCode>{columnGuideText.gajiMid}
                    <PayCode>FULL</PayCode><PayCode>HADIR_MEETING</PayCode>{columnGuideText.gajiAfter}
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-default-900 dark:text-gray-100">{columnGuideText.otTitle}</h4>
                  <p className="mt-1">{columnGuideText.ot}</p>
                </section>

                <section>
                  <h4 className="font-semibold text-default-900 dark:text-gray-100">{columnGuideText.bonusTitle}</h4>
                  <p className="mt-1">
                    {columnGuideText.bonusBefore}<PayCode>BONUS</PayCode>{columnGuideText.bonusAfter}
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-default-900 dark:text-gray-100">{columnGuideText.cioTitle}</h4>
                  <p className="mt-1">
                    {columnGuideText.cioBefore}
                    <PayCode>IXT</PayCode><PayCode>ADD_COMM</PayCode><PayCode>T-SALESMAN</PayCode>
                    <PayCode>IKUT_BX</PayCode>
                    <PayCode>JAGA_GATE</PayCode><PayCode>BH_JG_FORKLIFT</PayCode><PayCode>BH_SUSUN</PayCode>
                    <PayCode>T_KERJA</PayCode>{columnGuideText.cioAfter}<PayCode>FULL_*</PayCode>
                    {columnGuideText.cioEnd}
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-default-900 dark:text-gray-100">{columnGuideText.cutiTitle}</h4>
                  <p className="mt-1">{columnGuideText.cuti}</p>
                </section>

                <section>
                  <h4 className="font-semibold text-default-900 dark:text-gray-100">{columnGuideText.sharedTitle}</h4>
                  <p className="mt-1">{columnGuideText.shared}</p>
                </section>
              </div>

              <div className="flex justify-end mt-6">
                <Button onClick={() => setShowColumnGuide(false)} variant="outline" size="sm">
                  {columnGuideText.close}
                </Button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );

  // Bank Table Component
  const BankTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <thead className="bg-default-50 dark:bg-gray-900/50 border-b border-default-200 dark:border-gray-700 sticky top-0 z-10">
          <tr>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[60px] truncate" title="Number">
              NO.
            </th>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[150px] truncate" title="Staff Name">
              STAFF NAME
            </th>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[120px] truncate" title="IC Number">
              IC NO.
            </th>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[200px] truncate" title="Bank Account Number">
              BANK ACCOUNT NUMBER
            </th>
            <th className="px-2 py-2 text-right text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[100px] truncate" title="Total">
              TOTAL
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
          {bankTableData.map((item, index) => (
            <tr key={item.no} className={index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-default-25 dark:bg-gray-750"}>
              <td className="px-2 py-2 text-sm text-default-900 dark:text-gray-100">
                {item.no}
              </td>
              <td className="px-2 py-2 text-sm text-default-900 dark:text-gray-100 font-medium">
                {item.staff_name}
              </td>
              <td className="px-2 py-2 text-sm text-default-600 dark:text-gray-300">
                {item.icNo}
              </td>
              <td className="px-2 py-2 text-sm text-default-600 dark:text-gray-300">
                {item.bankAccountNumber}
              </td>
              <td className="px-2 py-2 text-sm text-default-900 dark:text-gray-100 font-medium text-right">
                {formatCurrency(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Pinjam Table Component
  const PinjamTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <thead className="bg-default-50 dark:bg-gray-900/50 border-b border-default-200 dark:border-gray-700 sticky top-0 z-10">
          <tr>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[60px] truncate" title="Number">
              NO.
            </th>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[150px] truncate" title="Staff ID and Name">
              STAFF/ID
            </th>
            <th className="px-2 py-2 text-right text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[120px] truncate" title="Gaji Digenapkan">
              GAJI/GENAP
            </th>
            <th className="px-2 py-2 text-right text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[120px] truncate" title="Total Pinjam">
              TOTAL PINJAM
            </th>
            <th className="px-2 py-2 text-right text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[100px] truncate" title="Total">
              TOTAL
            </th>
            <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider max-w-[100px] truncate" title="Payment Method">
              PAYMENT
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
          {reportData?.data.map((item, index) => (
            <tr key={item.staff_id} className={index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-default-25 dark:bg-gray-750"}>
              <td className="px-2 py-1 text-sm text-default-900 dark:text-gray-100">
                {item.no}
              </td>
              <td className="px-2 py-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-sm text-default-900 dark:text-gray-100 font-medium">
                    {item.staff_id} - {item.staff_name}
                  </span>
                  {item.pinjam_details &&
                    item.pinjam_details.length > 0 &&
                    item.pinjam_details.map((detail, dIndex) => (
                      <span
                        key={dIndex}
                        className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs dark:border-teal-700/50 dark:bg-teal-900/30"
                      >
                        <span className="text-default-600 dark:text-gray-200">
                          {detail.description}
                        </span>
                        <span className="font-semibold tabular-nums text-teal-600 dark:text-teal-300">
                          {formatCurrency(detail.amount)}
                        </span>
                      </span>
                    ))}
                </div>
              </td>
              <td className="px-2 py-1 text-sm text-default-600 dark:text-gray-300 text-right">
                {formatCurrency(item.gaji_genap)}
              </td>
              <td className="px-2 py-1 text-sm text-default-600 dark:text-gray-300 text-right">
                {formatCurrency(item.total_pinjam)}
              </td>
              <td className="px-2 py-1 text-sm text-default-900 dark:text-gray-100 font-medium text-right">
                {formatCurrency(item.final_total)}
              </td>
              <td className="px-2 py-1 text-sm text-default-900 dark:text-gray-100 text-center">
                <span
                  className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${
                    item.payment_preference === "Bank"
                      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  }`}
                >
                  {item.payment_preference}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Pinjam Breakdown - grand total per pinjam type, each expandable to reveal
  // the staff who contributed to that type and their amounts.
  const PinjamBreakdown = () => {
    const byType = aggregatePinjamContributorsByType(reportData?.data ?? []);
    if (byType.length === 0) return null;

    const togglePinjamType = (key: string) => {
      setExpandedPinjamTypes((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    const allKeys = byType.map((type) => type.description.toUpperCase());
    const allExpanded = allKeys.every((key) => expandedPinjamTypes.has(key));

    return (
      <div className="mb-2 mt-1 rounded-lg border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-700/50 dark:bg-teal-900/20">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-default-700 dark:text-gray-100">
            Pinjam Breakdown
          </h3>
          <button
            type="button"
            onClick={() =>
              setExpandedPinjamTypes(allExpanded ? new Set() : new Set(allKeys))
            }
            className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-300 dark:hover:text-teal-200"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
        <div className="divide-y divide-teal-200/70 dark:divide-teal-700/30">
          {byType.map((type) => {
            const key = type.description.toUpperCase();
            const isExpanded = expandedPinjamTypes.has(key);
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => togglePinjamType(key)}
                  className="flex w-full items-center justify-between gap-2 py-1.5 text-left"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <IconChevronRight
                      size={15}
                      className={`shrink-0 text-teal-500 transition-transform dark:text-teal-300 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                    <span
                      className="truncate text-sm text-default-700 dark:text-gray-100"
                      title={type.description}
                    >
                      {type.description}
                    </span>
                    <span className="shrink-0 text-xs text-default-400 dark:text-gray-400">
                      ({type.contributors.length})
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-default-800 dark:text-gray-100">
                    {formatCurrency(type.total)}
                  </span>
                </button>
                {isExpanded && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-1 pb-2 pl-6 sm:grid-cols-3 lg:grid-cols-4">
                    {type.contributors.map((c) => (
                      <div
                        key={c.staff_id}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span
                          className="truncate text-xs text-default-500 dark:text-gray-300"
                          title={`${c.staff_id} - ${c.staff_name}`}
                        >
                          {c.staff_name}
                        </span>
                        <span className="whitespace-nowrap text-xs tabular-nums text-default-600 dark:text-gray-300">
                          {formatCurrency(c.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-teal-300 pt-2 dark:border-teal-700/50">
          <span className="text-sm font-semibold text-default-800 dark:text-gray-100">
            Total Pinjam
          </span>
          <span className="whitespace-nowrap text-base font-bold tabular-nums text-default-900 dark:text-gray-50">
            {formatCurrency(reportData?.summary.total_pinjam ?? 0)}
          </span>
        </div>
      </div>
    );
  };

  // Cuti (leave) Summary Table - one row per employee, four leave-type groups
  // each showing Days + Amount. Aggregation follows the Monthly/Yearly toggle.
  const CutiTable = () => {
    const cutiTypes: { key: CutiLeaveType; label: string }[] = [
      { key: "cuti_sakit", label: "Cuti Sakit" },
      { key: "cuti_tahunan", label: "Cuti Tahunan" },
      { key: "cuti_umum", label: "Cuti Umum" },
      { key: "cuti_rawatan", label: "Cuti Rawatan" },
    ];

    const emptyValue: CutiMonthValue = { days: 0, amount: 0 };

    // Compute per-employee per-type {days, amount} based on the active period.
    const rows = useMemo(() => {
      return cutiEmployees.map((emp) => {
        const totals: Record<CutiLeaveType, CutiMonthValue> = {
          cuti_sakit: { days: 0, amount: 0 },
          cuti_tahunan: { days: 0, amount: 0 },
          cuti_umum: { days: 0, amount: 0 },
          cuti_rawatan: { days: 0, amount: 0 },
        };

        const months =
          periodType === "yearly"
            ? Array.from({ length: 12 }, (_, i) => i + 1)
            : [currentMonth];

        months.forEach((m) => {
          const monthData = emp.monthlySummary?.[m];
          if (!monthData) return;
          cutiTypes.forEach(({ key }) => {
            const v = monthData[key] || emptyValue;
            totals[key].days += Number(v.days || 0);
            totals[key].amount += Number(v.amount || 0);
          });
        });

        const entitlement: Record<CutiLeaveType, number> = {
          cuti_sakit: Number(emp.leaveBalance?.cuti_sakit_total || 0),
          cuti_tahunan: Number(emp.leaveBalance?.cuti_tahunan_total || 0),
          cuti_umum: Number(emp.leaveBalance?.cuti_umum_total || 0),
          cuti_rawatan: Number(emp.leaveBalance?.cuti_rawatan_total || 0),
        };

        return { employee: emp.employee, totals, entitlement };
      });
    }, [cutiEmployees, periodType, currentMonth]);

    const grandTotals = useMemo(() => {
      const acc: Record<CutiLeaveType, { amount: number }> = {
        cuti_sakit: { amount: 0 },
        cuti_tahunan: { amount: 0 },
        cuti_umum: { amount: 0 },
        cuti_rawatan: { amount: 0 },
      };
      rows.forEach((row) => {
        cutiTypes.forEach(({ key }) => {
          acc[key].amount += row.totals[key].amount;
        });
      });
      return acc;
    }, [rows]);

    if (rows.length === 0) return null;

    return (
      <div className="overflow-auto mb-2 max-h-[75vh] border border-default-200 dark:border-gray-700 rounded-lg">
        <table className="w-full">
          <thead className="sticky top-0 z-20 bg-default-50 dark:bg-gray-900">
            <tr>
              <th
                rowSpan={2}
                className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 align-middle"
                title="Bilangan"
              >
                BIL
              </th>
              <th
                rowSpan={2}
                className="px-2 py-2 text-left text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 align-middle"
                title="Nama Pekerja"
              >
                NAMA PEKERJA
              </th>
              {cutiTypes.map(({ key, label }) => (
                <th
                  key={key}
                  colSpan={2}
                  className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                  title={label}
                >
                  {label}
                </th>
              ))}
            </tr>
            <tr>
              {cutiTypes.map(({ key }) => (
                <React.Fragment key={key}>
                  <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-l border-b border-default-300 dark:border-gray-600">
                    HARI
                  </th>
                  <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                    AMAUN
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
            {rows.map((row, index) => (
              <tr
                key={row.employee.id}
                className={index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-default-25 dark:bg-gray-750"}
              >
                <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                  {index + 1}
                </td>
                <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left max-w-[160px]">
                  <span
                    className="block truncate"
                    title={`${row.employee.id.toUpperCase()} - ${row.employee.name.toUpperCase()}`}
                  >
                    {row.employee.id.toUpperCase()} - {row.employee.name.toUpperCase()}
                  </span>
                </td>
                {cutiTypes.map(({ key }) => (
                  <React.Fragment key={key}>
                    <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                      {row.totals[key].days}/{row.entitlement[key]}
                    </td>
                    <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                      {formatCurrency(row.totals[key].amount)}
                    </td>
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr>
              <td
                colSpan={2}
                className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
              >
                GRAND TOTAL:{" "}
                {formatCurrency(
                  cutiTypes.reduce(
                    (sum, { key }) => sum + grandTotals[key].amount,
                    0
                  )
                )}
              </td>
              {cutiTypes.map(({ key }) => (
                <React.Fragment key={key}>
                  <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800"></td>
                  <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                    {formatCurrency(grandTotals[key].amount)}
                  </td>
                </React.Fragment>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // Annual tab: by-month table (rows = Jan..Dec) on top, by-location table below.
  // Both share the same 20 columns and reconcile to the same grand total.
  const AnnualSummaryView = () => {
    if (isLoadingAnnual) {
      return (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      );
    }

    if (!annualData || annualData.monthly.length === 0) {
      return (
        <div className="text-center py-12 text-default-500 dark:text-gray-400">
          <IconFileText className="mx-auto h-12 w-12 text-default-300 mb-4" />
          <p className="text-lg font-medium">No salary data found</p>
          <p>No salary data available for {currentYear}</p>
        </div>
      );
    }

    const EMPTY_TOTALS: GrandTotals = {
      gaji: 0, ot: 0, bonus: 0, comm: 0, cuti: 0, gaji_kasar: 0,
      epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
      sip_majikan: 0, sip_pekerja: 0, pcb: 0, gaji_bersih: 0,
      setengah_bulan: 0, jumlah: 0, digenapkan: 0, setelah_digenapkan: 0,
    };

    const cellBase =
      "px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center";
    const cellNarrow =
      "px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center";
    const borderL = " border-l border-default-300 dark:border-gray-600";

    const renderAmountCells = (t: GrandTotals, extra: string = "") => (
      <>
        <td className={cellBase + extra}>{formatCurrency(t.gaji)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.ot)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.bonus)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.comm)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.cuti)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.gaji_kasar)}</td>
        <td className={cellNarrow + borderL + extra}>{formatCurrency(t.epf_majikan)}</td>
        <td className={cellNarrow + extra}>{formatCurrency(t.epf_pekerja)}</td>
        <td className={cellNarrow + borderL + extra}>{formatCurrency(t.socso_majikan)}</td>
        <td className={cellNarrow + extra}>{formatCurrency(t.socso_pekerja)}</td>
        <td className={cellNarrow + borderL + extra}>{formatCurrency(t.sip_majikan)}</td>
        <td className={cellNarrow + extra}>{formatCurrency(t.sip_pekerja)}</td>
        <td className={cellBase + borderL + extra}>{formatCurrency(t.pcb)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.gaji_bersih)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.setengah_bulan)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.jumlah)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.digenapkan)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.setelah_digenapkan)}</td>
      </>
    );

    const headCell =
      "px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";
    const headGroup =
      "px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900";
    const headSub =
      "px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";
    const headBlank =
      "bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";

    const renderHead = (firstLabel: string) => (
      <thead className="sticky top-0 z-20 bg-default-50 dark:bg-gray-900">
        <tr>
          <th className={headCell}>BIL</th>
          <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
            {firstLabel}
          </th>
          <th className={headCell}>GAJI</th>
          <th className={headCell}>OT</th>
          <th className={headCell}>BONUS</th>
          <th className={headCell} title="Commission / Insentif / Lain-lain">
            C/I/O
          </th>
          <th className={headCell}>CUTI</th>
          <th className={headCell}>GAJI KASAR</th>
          <th className={headGroup} colSpan={2}>EPF</th>
          <th className={headGroup} colSpan={2}>SOCSO</th>
          <th className={headGroup} colSpan={2}>SIP</th>
          <th className={`${headCell} border-l border-default-300 dark:border-gray-600`}>
            PCB
          </th>
          <th className={headCell}>GAJI BERSIH</th>
          <th className={headCell}>1/2 BULAN</th>
          <th className={headCell}>JUMLAH</th>
          <th className={headCell}>DIGENAPKAN</th>
          <th className={headCell}>SETELAH DIGENAPKAN</th>
        </tr>
        <tr>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headSub}>MAJ</th>
          <th className={headSub}>PKJ</th>
          <th className={headSub}>MAJ</th>
          <th className={headSub}>PKJ</th>
          <th className={headSub}>MAJ</th>
          <th className={headSub}>PKJ</th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
        </tr>
      </thead>
    );

    const totalRow = (label: string) => (
      <tr className="font-semibold border-t-2 border-default-300 dark:border-gray-600">
        <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-900"></td>
        <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-left uppercase bg-default-100 dark:bg-gray-900">
          {label}
        </td>
        {renderAmountCells(annualData.grand_totals, " bg-default-100 dark:bg-gray-900")}
      </tr>
    );

    return (
      <div className="space-y-6">
        {/* By month */}
        <div>
          <div className="overflow-auto max-h-[75vh] border border-default-200 dark:border-gray-700 rounded-lg">
            <table className="w-full">
              {renderHead("MONTH")}
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                {annualData.monthly.map((m, idx) => (
                  <tr
                    key={m.month}
                    className={idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-default-25 dark:bg-gray-750"}
                  >
                    <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                      {m.month}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left">
                      {getMonthName(m.month)}
                    </td>
                    {renderAmountCells(m.totals)}
                  </tr>
                ))}
                {totalRow("Total")}
              </tbody>
            </table>
          </div>
        </div>

        {/* By location */}
        <div>
          <div className="overflow-auto max-h-[75vh] border border-default-200 dark:border-gray-700 rounded-lg">
            <table className="w-full">
              {renderHead("BAHAGIAN KERJA")}
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                {LOCATION_ORDER.map((item, index) => {
                  if (item.type === "header") {
                    return (
                      <tr key={`header-${index}`} className="bg-default-100 dark:bg-gray-800">
                        <td
                          colSpan={20}
                          className="px-2 py-2 text-center text-xs font-medium text-default-600 dark:text-gray-300 border-t border-default-300 dark:border-gray-600"
                        >
                          {item.text}
                        </td>
                      </tr>
                    );
                  }

                  const locTotals =
                    annualData.locations.find((l) => l.location === item.id)
                      ?.totals ?? EMPTY_TOTALS;

                  return (
                    <tr
                      key={item.id}
                      className={index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-default-25 dark:bg-gray-750"}
                    >
                      <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                        {item.id}
                      </td>
                      <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left max-w-[130px]">
                        <span className="block truncate" title={LOCATION_MAP[item.id!]}>
                          {LOCATION_MAP[item.id!]}
                        </span>
                      </td>
                      {renderAmountCells(locTotals)}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-20">
                {totalRow("Total")}
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Annual tab → Breakdown: per location, each employee expanded into one row per
  // month, with a per-employee TOTAL and a location GRAND TOTAL. Mirrors the legacy
  // "BY LOCATION" printouts. Shares the 18 amount columns with the other views, plus
  // a leading MONTH column.
  const AnnualBreakdownView = () => {
    // Spinner only on the initial load; during page navigation we keep the pager visible.
    if (isLoadingAnnualBreakdown && !annualBreakdownData) {
      return (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      );
    }

    if (!annualBreakdownData || annualBreakdownData.total_pages === 0) {
      return (
        <div className="text-center py-12 text-default-500 dark:text-gray-400">
          <IconFileText className="mx-auto h-12 w-12 text-default-300 mb-4" />
          <p className="text-lg font-medium">No salary data found</p>
          <p>No salary data available for {currentYear}</p>
        </div>
      );
    }

    const cellBase =
      "px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center";
    const cellNarrow =
      "px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center";
    const borderL = " border-l border-default-300 dark:border-gray-600";

    const renderAmountCells = (t: GrandTotals, extra: string = "") => (
      <>
        <td className={cellBase + extra}>{formatCurrency(t.gaji)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.ot)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.bonus)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.comm)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.cuti)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.gaji_kasar)}</td>
        <td className={cellNarrow + borderL + extra}>{formatCurrency(t.epf_majikan)}</td>
        <td className={cellNarrow + extra}>{formatCurrency(t.epf_pekerja)}</td>
        <td className={cellNarrow + borderL + extra}>{formatCurrency(t.socso_majikan)}</td>
        <td className={cellNarrow + extra}>{formatCurrency(t.socso_pekerja)}</td>
        <td className={cellNarrow + borderL + extra}>{formatCurrency(t.sip_majikan)}</td>
        <td className={cellNarrow + extra}>{formatCurrency(t.sip_pekerja)}</td>
        <td className={cellBase + borderL + extra}>{formatCurrency(t.pcb)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.gaji_bersih)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.setengah_bulan)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.jumlah)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.digenapkan)}</td>
        <td className={cellBase + extra}>{formatCurrency(t.setelah_digenapkan)}</td>
      </>
    );

    const headCell =
      "px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";
    const headGroup =
      "px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900";
    const headSub =
      "px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";
    const headBlank =
      "bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";

    const head = (
      <thead className="sticky top-0 z-20 bg-default-50 dark:bg-gray-900">
        <tr>
          <th className={headCell}>BIL</th>
          <th className={headCell}>MONTH</th>
          <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
            NAMA PEKERJA
          </th>
          <th className={headCell}>GAJI</th>
          <th className={headCell}>OT</th>
          <th className={headCell}>BONUS</th>
          <th className={headCell} title="Commission / Insentif / Lain-lain">C/I/O</th>
          <th className={headCell}>CUTI</th>
          <th className={headCell}>GAJI KASAR</th>
          <th className={headGroup} colSpan={2}>EPF</th>
          <th className={headGroup} colSpan={2}>SOCSO</th>
          <th className={headGroup} colSpan={2}>SIP</th>
          <th className={`${headCell} border-l border-default-300 dark:border-gray-600`}>PCB</th>
          <th className={headCell}>GAJI BERSIH</th>
          <th className={headCell}>1/2 BULAN</th>
          <th className={headCell}>JUMLAH</th>
          <th className={headCell}>DIGENAPKAN</th>
          <th className={headCell}>SETELAH DIGENAPKAN</th>
        </tr>
        <tr>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headSub}>MAJ</th>
          <th className={headSub}>PKJ</th>
          <th className={headSub}>MAJ</th>
          <th className={headSub}>PKJ</th>
          <th className={headSub}>MAJ</th>
          <th className={headSub}>PKJ</th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
          <th className={headBlank}></th>
        </tr>
      </thead>
    );

    // Each page (a batch of locations capped at ~30 staff) is fetched from the API on
    // demand; printing follows the page.
    const total = breakdownTotalPages;
    const pageStaff = breakdownPagesMeta[breakdownPageIndex]?.staff ?? 0;
    const locations = annualBreakdownData.locations;

    return (
      <div className="space-y-3">
        {/* Batch pager — elevated (z-40) so its dropdown sits above the sticky headers */}
        <div className="relative z-40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setBreakdownPage((p) => Math.max(0, p - 1))}
              icon={IconChevronRight}
              variant="outline"
              size="sm"
              disabled={breakdownPageIndex <= 0 || isLoadingAnnualBreakdown}
              className="[&>span>svg]:rotate-180"
            >
              Prev
            </Button>
            <Button
              onClick={() => setBreakdownPage((p) => Math.min(total - 1, p + 1))}
              variant="outline"
              size="sm"
              disabled={breakdownPageIndex >= total - 1 || isLoadingAnnualBreakdown}
            >
              Next
            </Button>
            <span className="text-sm text-default-600 dark:text-gray-300">
              Page {breakdownPageIndex + 1} of {total} · {pageStaff} staff
              {isLoadingAnnualBreakdown && (
                <span className="ml-2 text-default-400">Loading…</span>
              )}
            </span>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[320px]">
            <FormListbox
              name="breakdownPage"
              value={breakdownPageIndex}
              disabled={isLoadingAnnualBreakdown}
              onChange={(v) => setBreakdownPage(Number(v))}
              options={breakdownPagesMeta.map((meta, i) => ({
                id: i,
                name: `Page ${i + 1}: ${meta.locations
                  .map((code) => LOCATION_MAP[code] || code)
                  .join(", ")} (${meta.staff} staff)`,
              }))}
              renderOption={(option, selected) => (
                <span
                  className={`block whitespace-normal break-words ${
                    selected ? "font-medium" : "font-normal"
                  }`}
                >
                  {option.name}
                </span>
              )}
            />
          </div>
        </div>

        {/* Locations in the current page/batch */}
        {locations.map((loc) => {
          const locationName =
            LOCATION_MAP[loc.location] || `Location ${loc.location}`;
          return (
            <div
              key={loc.location}
              className="overflow-auto border border-default-200 dark:border-gray-700 rounded-lg"
            >
              <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-2 border-b border-default-200 dark:border-gray-700 sticky top-0 z-30">
                <h3 className="text-sm font-semibold text-sky-800 dark:text-sky-300">
                  {loc.location} - {locationName.toUpperCase()}
                </h3>
              </div>
              <table className="w-full">
                {head}
                <tbody className="bg-white dark:bg-gray-800">
                  {loc.employees.map((emp, eIdx) => (
                    <React.Fragment key={emp.staff_id}>
                      {emp.months.map((m, mIdx) => (
                        <tr
                          key={`${emp.staff_id}-${m.month}`}
                          className={`${mIdx === 0 ? "border-t border-default-200 dark:border-gray-700" : ""}`}
                        >
                          <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                            {mIdx === 0 ? eIdx + 1 : ""}
                          </td>
                          <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                            {m.month}
                          </td>
                          <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left max-w-[160px]">
                            {mIdx === 0 ? (
                              <span
                                className="block truncate"
                                title={`${emp.staff_id.toUpperCase()} - ${emp.staff_name.toUpperCase()}`}
                              >
                                {emp.staff_id.toUpperCase()} - {emp.staff_name.toUpperCase()}
                              </span>
                            ) : (
                              ""
                            )}
                          </td>
                          {renderAmountCells(m)}
                        </tr>
                      ))}
                      <tr className="font-semibold border-t border-default-300 dark:border-gray-600">
                        <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 bg-default-50 dark:bg-gray-700" colSpan={3}>
                          <span className="pl-2 uppercase">Total</span>
                        </td>
                        {renderAmountCells(emp.total, " bg-default-50 dark:bg-gray-700")}
                      </tr>
                    </React.Fragment>
                  ))}
                  <tr className="font-bold border-t-2 border-default-400 dark:border-gray-500">
                    <td
                      className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-left uppercase bg-default-100 dark:bg-gray-900"
                      colSpan={3}
                    >
                      Grand Total
                    </td>
                    {renderAmountCells(loc.totals, " bg-default-100 dark:bg-gray-900")}
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  };

  const tabLabels = ["Employee", "Location", "Bank", "Pinjam", "Cuti", "Annual"];

  // Tab label with abbreviations shown below 2xl (compact single-row range).
  const renderTabLabel = (label: string) => {
    if (label === "Employee") {
      return (
        <>
          <span className="hidden 2xl:inline">Employee</span>
          <span className="2xl:hidden">Emp</span>
        </>
      );
    }
    if (label === "Location") {
      return (
        <>
          <span className="hidden 2xl:inline">Location</span>
          <span className="2xl:hidden">Loc</span>
        </>
      );
    }
    return label;
  };

  return (
    <div className="space-y-3">
      {/* Salary Report Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700">
          {/* Large screens (xl/1280px+): Single row layout */}
          <div className="hidden xl:flex xl:justify-between xl:items-center gap-3">
            <div className="flex items-center gap-3">
              {/* Tab buttons */}
              <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                {tabLabels.map((label, index) => (
                  <button
                    key={label}
                    onClick={() => setActiveTab(index)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeTab === index
                        ? "bg-sky-500 text-white"
                        : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                    } ${index > 0 ? "border-l border-default-200 dark:border-gray-600" : ""}`}
                  >
                    {renderTabLabel(label)}
                  </button>
                ))}
              </div>
              {/* Sub-view toggle for Employee tab - right after tabs */}
              {activeTab === 0 && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                    <button
                      onClick={() => setEmployeeViewMode('individual')}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        employeeViewMode === 'individual'
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      onClick={() => setEmployeeViewMode('location')}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                        employeeViewMode === 'location'
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Location
                    </button>
                  </div>
                </>
              )}
              {/* Sub-view toggle for Annual tab */}
              {activeTab === 5 && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                    <button
                      onClick={() => setAnnualViewMode('summary')}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        annualViewMode === 'summary'
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Summary
                    </button>
                    <button
                      onClick={() => setAnnualViewMode('breakdown')}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                        annualViewMode === 'breakdown'
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Breakdown
                    </button>
                  </div>
                </>
              )}
              {/* Period Toggle - for tabs 0 (Employee), 1 (Location) and 4 (Cuti) */}
              {(activeTab === 0 || activeTab === 1 || activeTab === 4) && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                    <button
                      onClick={() => setPeriodType('monthly')}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        periodType === 'monthly'
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setPeriodType('yearly')}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                        periodType === 'yearly'
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Yearly
                    </button>
                  </div>
                </>
              )}
              <span className="text-default-300 dark:text-gray-600">|</span>
              <div className="flex items-center gap-2">
                <TimeNavigator
                  range={periodNavRange}
                  onChange={handlePeriodNavChange}
                  modes={isMonthlyNav ? ["month"] : ["year"]}
                  presets={false}
                />
              </div>
              {displayedReportData && activeTab !== 4 && activeTab !== 5 && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="text-sm text-default-600 dark:text-gray-300">
                    <span className="block font-medium">
                      {displayedReportData.total_records} employees
                    </span>
                    <span className="block font-medium">
                      {formatCurrency(displayedHeaderTotal)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dataMayBeCached && (
                <span
                  className="block max-w-[170px] text-right text-[11px] leading-tight text-default-400 dark:text-gray-500"
                  title="To load faster, this report is briefly saved on the server and can be a couple of minutes behind. Click Refresh to load the latest numbers."
                >
                  Figures may be a few minutes old. Refresh for the latest.
                </span>
              )}
              <Button
                onClick={refreshDisplayedReport}
                icon={IconRefresh}
                variant="outline"
                disabled={refreshDisabled}
                size="sm"
                aria-label={activeTab === 0 ? "Refresh" : undefined}
                className={
                  activeTab === 0
                    ? "xl:max-2xl:px-2 xl:max-2xl:[&>span>svg]:mr-0"
                    : ""
                }
              >
                <span
                  className={
                    activeTab === 0
                      ? "xl:max-2xl:hidden"
                      : ""
                  }
                >
                  Refresh
                </span>
              </Button>
              <div
                className="relative"
                onMouseEnter={handlePrintDropdownMouseEnter}
                onMouseLeave={handlePrintDropdownMouseLeave}
              >
                <Button
                  onClick={() => generatePDF("print")}
                  icon={IconPrinter}
                  color="green"
                  variant="outline"
                  disabled={pdfDisabled}
                  size="sm"
                  aria-label={activeTab === 0 ? "Print" : undefined}
                  className={
                    activeTab === 0
                      ? "xl:max-2xl:px-2 xl:max-2xl:[&>span>svg]:mr-0"
                      : ""
                  }
                >
                  <span
                    className={
                      activeTab === 0
                        ? "xl:max-2xl:hidden"
                        : ""
                    }
                  >
                    Print
                  </span>
                </Button>
                {isPrintDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-default-200 dark:border-gray-700 py-1 min-w-[140px]">
                      <button
                        onClick={() => {
                          setIsPrintDropdownOpen(false);
                          generatePDF("print");
                        }}
                        disabled={pdfDisabled}
                        className="w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Print
                      </button>
                      <button
                        onClick={() => {
                          setIsPrintDropdownOpen(false);
                          generatePDF("download");
                        }}
                        disabled={pdfDisabled}
                        className="w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Download PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {activeTab === 5 && annualViewMode === 'breakdown' && renderBatchPrintButton()}
              {activeTab === 3 && renderBreakdownButton()}
              {activeTab === 2 && (
                <>
                  <Button
                    onClick={generateTextExport}
                    icon={IconFileExport}
                    color="purple"
                    variant="outline"
                    disabled={
                      !displayedReportData ||
                      displayedReportData.data.length === 0 ||
                      isGeneratingExport
                    }
                    size="sm"
                  >
                    Export
                  </Button>
                  <Button
                    onClick={() => setShowExportDialog(true)}
                    icon={IconLink}
                    color="orange"
                    variant="outline"
                    size="sm"
                  >
                    Export Link
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Smaller screens (<xl/1280px): Multi-row layout */}
          <div className="xl:hidden space-y-3">
            {/* Row 1: Title + Tabs + Action buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-medium text-default-800 dark:text-gray-100">
                  Salary Report
                </h2>
                <span className="hidden sm:inline text-default-300 dark:text-gray-600">|</span>
                {/* Tab buttons */}
                <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                  {tabLabels.map((label, index) => (
                    <button
                      key={label}
                      onClick={() => setActiveTab(index)}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        activeTab === index
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      } ${index > 0 ? "border-l border-default-200 dark:border-gray-600" : ""}`}
                    >
                      {renderTabLabel(label)}
                    </button>
                  ))}
                </div>
                {/* Sub-view toggle for Employee tab - right after tabs */}
                {activeTab === 0 && (
                  <>
                    <span className="hidden sm:inline text-default-300 dark:text-gray-600">|</span>
                    <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                      <button
                        onClick={() => setEmployeeViewMode('individual')}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                          employeeViewMode === 'individual'
                            ? "bg-sky-500 text-white"
                            : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        Individual
                      </button>
                      <button
                        onClick={() => setEmployeeViewMode('location')}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                          employeeViewMode === 'location'
                            ? "bg-sky-500 text-white"
                            : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        Location
                      </button>
                    </div>
                  </>
                )}
                {/* Sub-view toggle for Annual tab */}
                {activeTab === 5 && (
                  <>
                    <span className="hidden sm:inline text-default-300 dark:text-gray-600">|</span>
                    <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                      <button
                        onClick={() => setAnnualViewMode('summary')}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                          annualViewMode === 'summary'
                            ? "bg-sky-500 text-white"
                            : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        Summary
                      </button>
                      <button
                        onClick={() => setAnnualViewMode('breakdown')}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                          annualViewMode === 'breakdown'
                            ? "bg-sky-500 text-white"
                            : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        Breakdown
                      </button>
                    </div>
                  </>
                )}
              </div>
              {/* Action buttons on the right */}
              <div className="flex items-center gap-2">
                {dataMayBeCached && (
                  <span
                    className="hidden sm:block max-w-[160px] text-right text-[11px] leading-tight text-default-400 dark:text-gray-500"
                    title="To load faster, this report is briefly saved on the server and can be a couple of minutes behind. Click Refresh to load the latest numbers."
                  >
                    Figures may be a few minutes old. Refresh for the latest.
                  </span>
                )}
                <Button
                  onClick={refreshDisplayedReport}
                  icon={IconRefresh}
                  variant="outline"
                  disabled={refreshDisabled}
                  size="sm"
                >
                  Refresh
                </Button>
                <div
                  className="relative"
                  onMouseEnter={handlePrintDropdownMouseEnter}
                  onMouseLeave={handlePrintDropdownMouseLeave}
                >
                  <Button
                    onClick={() => generatePDF("print")}
                    icon={IconPrinter}
                    color="green"
                    variant="outline"
                    disabled={pdfDisabled}
                    size="sm"
                  >
                    Print
                  </Button>
                  {isPrintDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50">
                      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-default-200 dark:border-gray-700 py-1 min-w-[140px]">
                        <button
                          onClick={() => {
                            setIsPrintDropdownOpen(false);
                            generatePDF("print");
                          }}
                          disabled={pdfDisabled}
                          className="w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Print
                        </button>
                        <button
                          onClick={() => {
                            setIsPrintDropdownOpen(false);
                            generatePDF("download");
                          }}
                          disabled={pdfDisabled}
                          className="w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Download PDF
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {activeTab === 5 && annualViewMode === 'breakdown' && renderBatchPrintButton()}
                {activeTab === 2 && (
                  <>
                    <Button
                      onClick={generateTextExport}
                      icon={IconFileExport}
                      color="purple"
                      variant="outline"
                      disabled={
                        !displayedReportData ||
                        displayedReportData.data.length === 0 ||
                        isGeneratingExport
                      }
                      size="sm"
                    >
                      Export
                    </Button>
                    <Button
                      onClick={() => setShowExportDialog(true)}
                      icon={IconLink}
                      color="orange"
                      variant="outline"
                      size="sm"
                    >
                      Export Link
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Row 2: Period toggle + Navigators + Stats + View toggle */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Period Toggle - for tabs 0 (Employee), 1 (Location) and 4 (Cuti) */}
              {(activeTab === 0 || activeTab === 1 || activeTab === 4) && (
                <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                  <button
                    onClick={() => setPeriodType('monthly')}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      periodType === 'monthly'
                        ? "bg-sky-500 text-white"
                        : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setPeriodType('yearly')}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                      periodType === 'yearly'
                        ? "bg-sky-500 text-white"
                        : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    Yearly
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <TimeNavigator
                  range={periodNavRange}
                  onChange={handlePeriodNavChange}
                  modes={isMonthlyNav ? ["month"] : ["year"]}
                  presets={false}
                />
              </div>
              {displayedReportData && activeTab !== 4 && activeTab !== 5 && (
                <>
                  <span className="hidden sm:inline text-default-300 dark:text-gray-600">|</span>
                  <div className="text-sm text-default-600 dark:text-gray-300">
                    <span className="block font-medium">
                      {displayedReportData.total_records} employees
                    </span>
                    <span className="block font-medium">
                      {formatCurrency(displayedHeaderTotal)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {activeTab === 5 ? (
          <div className="px-6 pt-2 pb-4">
            {annualViewMode === 'breakdown' ? (
              <AnnualBreakdownView />
            ) : (
              <AnnualSummaryView />
            )}
          </div>
        ) : activeTab === 4 ? (
          cutiLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : cutiError ? (
            <div className="text-center py-12 text-rose-500 dark:text-rose-400">
              <IconFileText className="mx-auto h-12 w-12 text-rose-300 mb-4" />
              <p className="text-lg font-medium">{cutiError}</p>
            </div>
          ) : cutiEmployees.length === 0 ? (
            <div className="text-center py-12 text-default-500 dark:text-gray-400">
              <IconFileText className="mx-auto h-12 w-12 text-default-300 mb-4" />
              <p className="text-lg font-medium">No leave data found</p>
              <p>
                No leave data available for {periodType === 'yearly' ? currentYear : `${getMonthName(currentMonth)} ${currentYear}`}
              </p>
            </div>
          ) : (
            <div className="px-6 pt-2 pb-2">
              <CutiTable />
            </div>
          )
        ) : displayedLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !displayedReportData || displayedReportData.data.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconFileText className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">No salary data found</p>
            <p>
              No salary data available for {periodType === 'yearly' ? currentYear : `${getMonthName(currentMonth)} ${currentYear}`}
            </p>
          </div>
        ) : (
          <>
            <div className="px-6 pt-2">
              {activeTab === 0 && (
                employeeViewMode === 'individual'
                  ? <EmployeeSalaryTable />
                  : <LocationGroupedTable />
              )}
              {activeTab === 1 && <ComprehensiveSalaryTable />}
              {activeTab === 2 && <BankTable />}
              {activeTab === 3 && (
                <>
                  <PinjamTable />
                  <PinjamBreakdown />
                </>
              )}
            </div>

            {/* Summary Footer */}
            <div className="bg-default-50 dark:bg-gray-900/50 px-6 py-2 border-t border-default-200 dark:border-gray-700">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                <div className="flex items-center gap-2 text-sm text-default-600 dark:text-gray-300">
                  <span>
                    <span className="font-medium">Total Records:</span>{" "}
                    {displayedReportData.total_records}
                  </span>
                  <span aria-hidden="true">|</span>
                  <button
                    type="button"
                    onClick={() => setShowColumnGuide(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <IconInfoCircle size={15} />
                    Column guide
                  </button>
                </div>
                <div className="flex flex-col md:flex-row space-y-1 md:space-y-0 md:space-x-6 text-sm">
                  <div className="text-default-700 dark:text-gray-200">
                    <span className="font-medium">Total Gaji/Genap:</span>{" "}
                    <span className="text-default-900 dark:text-gray-100">
                      {formatCurrency(displayedGajiGenapTotal)}
                    </span>
                  </div>
                  <div className="text-default-700 dark:text-gray-200">
                    <span className="font-medium">Total Pinjam:</span>{" "}
                    <span className="text-default-900 dark:text-gray-100">
                      {formatCurrency(displayedReportData.summary.total_pinjam)}
                    </span>
                  </div>
                  <div className="text-sky-700 dark:text-sky-400">
                    <span className="font-semibold">Grand Total:</span>{" "}
                    <span className="font-bold text-sky-800 dark:text-sky-300">
                      {formatCurrency(displayedFinalTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Export Dialog */}
      <ExportDialog />
      <ColumnGuideDialog />

      {/* Loading overlay while a PDF is being generated for print/download */}
      {(isGeneratingPDF || batchPrintingKey !== null || isGeneratingExport) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white dark:bg-gray-800 px-10 py-8 shadow-xl">
            <LoadingSpinner />
            <p className="text-sm font-medium text-default-800 dark:text-gray-100">
              {isGeneratingExport ? "Preparing export…" : "Preparing document…"}
            </p>
            <p className="text-xs text-default-500 dark:text-gray-400">
              This may take a moment for large reports.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalaryReportPage;

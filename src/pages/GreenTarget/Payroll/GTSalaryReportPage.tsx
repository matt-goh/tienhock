// src/pages/GreenTarget/Payroll/GTSalaryReportPage.tsx
// Green Target Salary Report (Phase 5). Monthly + annual views grouped by job
// (OFFICE / DRIVER) — GT has no locations. Reuses the shared TH PDF generator.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  IconRefresh,
  IconPrinter,
  IconDownload,
  IconFileExport,
  IconLink,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../../../components/Button";
import { FormListbox } from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import TimeNavigator, { TimeRange } from "../../../components/TimeNavigator";
import { api } from "../../../routes/utils/api";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import { generateSalaryReportPDF } from "../../../utils/payroll/SalaryReportPDF";
import {
  generatePinjamReportPDF,
  generatePinjamBreakdownPDF,
  PinjamReportData,
  PinjamDetail,
} from "../../../utils/payroll/PinjamReportPDF";
import {
  generateBankReportPDF,
  BankReportData,
} from "../../../utils/payroll/BankReportPDF";
import { generateBatchCutiReportPDF } from "../../../utils/payroll/CutiReportPDF";
import {
  BankReportTable,
  PinjamReportTable,
  PinjamBreakdownCard,
  PinjamBreakdownButton,
  CutiReportTable,
  CutiBatchEmployee,
} from "../../../components/Payroll/CompanySalaryReportTables";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import { groupStaffsByName } from "../../../utils/payroll/groupStaffsByName";
import GreenTargetLogo from "../../../utils/GreenTargetLogo.png";
import { usePersistedFilters } from "../../../hooks/usePersistedFilters";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import toast from "react-hot-toast";

const GT_COMPANY = "GREEN TARGET WASTE TREATMENT IND. SDN. BHD.";

// Tabs whose data all comes from the single monthly salary-report endpoint.
const MONTHLY_TABS = ["employee", "monthly", "bank", "pinjam"] as const;

// Tabs that honour the Monthly/Yearly period toggle. Bank and Pinjam are
// month-end payout views, so they always stay on the selected month.
const PERIOD_TABS = ["employee", "monthly"] as const;

// Build the PDF's locationOrder from a location_map (codes sorted ascending).
const buildLocationOrder = (map: Record<string, string>) =>
  Object.keys(map)
    .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
    .map((id) => ({ type: "location" as const, id }));

interface Totals {
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

interface EmpRow extends Totals {
  // Null on the yearly view, where one row spans several monthly payrolls.
  employee_payroll_id: number | null;
  staff_id: string;
  staff_name: string;
}
interface LocationData {
  location: string;
  employees: EmpRow[];
  totals: Totals;
}
interface Comprehensive {
  year: number;
  month: number | null;
  locations: LocationData[];
  grand_totals: Totals;
  location_map: Record<string, string>;
  // Employee / Bank / Pinjam tabs are served by the same monthly endpoint.
  employees: EmpRow[];
  employees_grand_totals: Totals;
  bank_data: BankReportData[];
  data: PinjamReportData[];
  total_records: number;
  summary: {
    total_gaji_genap: number;
    total_pinjam: number;
    total_final: number;
  };
}
type PinjamViewMode = "month_end" | "mid_month";
interface PinjamSummaryBucket {
  total_amount?: number | string;
  detail_rows?: PinjamDetail[];
}
interface PinjamSummaryEntry {
  employee_id?: string;
  employee_name?: string;
  mid_month?: PinjamSummaryBucket;
}
interface AnnualSummary {
  year: number;
  monthly: { month: number; totals: Totals }[];
  locations: { location: string; totals: Totals }[];
  grand_totals: Totals;
  location_map: Record<string, string>;
}
interface AnnualBreakdown {
  year: number;
  locations: {
    location: string;
    employees: {
      staff_id: string;
      staff_name: string;
      months: (Totals & { month: number })[];
      total: Totals;
    }[];
    totals: Totals;
  }[];
  grand_totals: Totals;
}

const COLUMNS: { key: keyof Totals; label: string }[] = [
  { key: "gaji", label: "GAJI" },
  { key: "ot", label: "OT" },
  { key: "bonus", label: "BONUS" },
  { key: "comm", label: "C/I/O" },
  { key: "cuti", label: "CUTI" },
  { key: "gaji_kasar", label: "Gross" },
  { key: "epf_majikan", label: "EPF(M)" },
  { key: "epf_pekerja", label: "EPF(P)" },
  { key: "socso_majikan", label: "SOCSO(M)" },
  { key: "socso_pekerja", label: "SOCSO(P)" },
  { key: "sip_majikan", label: "SIP(M)" },
  { key: "sip_pekerja", label: "SIP(P)" },
  { key: "pcb", label: "PCB" },
  { key: "gaji_bersih", label: "Net" },
  { key: "setengah_bulan", label: "½ Bln" },
  { key: "jumlah", label: "Jumlah" },
  { key: "digenapkan", label: "Genap" },
  { key: "setelah_digenapkan", label: "Setelah" },
];

const TABLE_COLUMN_COUNT = COLUMNS.length + 2;

const fmt = (n: number): string =>
  (Number(n) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type TabType =
  | "employee"
  | "monthly"
  | "bank"
  | "pinjam"
  | "cuti"
  | "annual";
type AnnualView = "summary" | "breakdown";
type EmployeeView = "individual" | "location";
type PeriodType = "monthly" | "yearly";

const TABS: TabType[] = [
  "employee",
  "monthly",
  "bank",
  "pinjam",
  "cuti",
  "annual",
];

// GT groups by the shared staff Location field, so its Location tab mirrors TH's.
const TAB_LABELS: Record<TabType, string> = {
  employee: "Employee",
  monthly: "Location",
  bank: "Bank",
  pinjam: "Pinjam",
  cuti: "Cuti",
  annual: "Annual",
};

const fmtCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(Number(amount) || 0);

const isMonthlyTab = (tab: TabType): boolean =>
  (MONTHLY_TABS as readonly string[]).includes(tab);

const isPeriodTab = (tab: TabType): boolean =>
  (PERIOD_TABS as readonly string[]).includes(tab);

const getPinjamStaffKey = (
  staffName: string | null | undefined,
  staffId: string | null | undefined
): string => (staffName || staffId || "").trim().toUpperCase();

const GTSalaryReportPage: React.FC = () => {
  const [activeTab, setActiveTab] = usePersistedFilters<TabType>(
    "gtSalaryReportTab",
    () => "monthly",
    (cached) => (TABS.includes(cached as TabType) ? (cached as TabType) : null)
  );
  const [annualView, setAnnualView] = usePersistedFilters<AnnualView>(
    "gtSalaryReportAnnualView",
    () => "summary",
    (cached) => (cached === "summary" || cached === "breakdown" ? cached : null)
  );
  // Sub-view mode for the Employee tab: one flat list, or grouped by location.
  const [employeeView, setEmployeeView] = usePersistedFilters<EmployeeView>(
    "gtSalaryReportEmployeeView",
    () => "individual",
    (cached) =>
      cached === "individual" || cached === "location" ? cached : null
  );
  const [pinjamViewMode, setPinjamViewMode] =
    usePersistedFilters<PinjamViewMode>(
      "gtSalaryReportPinjamView",
      () => "month_end",
      (cached) =>
        cached === "month_end" || cached === "mid_month" ? cached : null
    );
  // Monthly = the selected month; Yearly = every processed month of the year.
  const [periodType, setPeriodType] = usePersistedFilters<PeriodType>(
    "gtSalaryReportPeriod",
    () => "monthly",
    (cached) => (cached === "monthly" || cached === "yearly" ? cached : null)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingYearly, setIsLoadingYearly] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingExport, setIsGeneratingExport] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportYear, setExportYear] = useState<number>(
    new Date().getFullYear()
  );
  const [exportMonth, setExportMonth] = useState<number>(
    new Date().getMonth() + 1
  );

  const { staffs: allStaffs } = useStaffsCache();
  const [gtEmployeeIds, setGtEmployeeIds] = useState<Set<string>>(new Set());
  const [cutiEmployees, setCutiEmployees] = useState<CutiBatchEmployee[]>([]);
  const [cutiSummary, setCutiSummary] = useState<any>(null);

  const [currentYear, setCurrentYear] = usePersistedFilters<number>(
    "gtSalaryReportYear",
    () => new Date().getFullYear(),
    (cached) => (typeof cached === "number" ? cached : null)
  );
  const [currentMonth, setCurrentMonth] = usePersistedFilters<number>(
    "gtSalaryReportMonth",
    () => new Date().getMonth() + 1,
    (cached) =>
      typeof cached === "number" && cached >= 1 && cached <= 12 ? cached : null
  );

  const [monthly, setMonthly] = useState<Comprehensive | null>(null);
  const [yearly, setYearly] = useState<Comprehensive | null>(null);
  const [pinjamSummary, setPinjamSummary] = useState<PinjamSummaryEntry[]>([]);
  const [annual, setAnnual] = useState<AnnualSummary | null>(null);
  const [breakdown, setBreakdown] = useState<AnnualBreakdown | null>(null);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});

  // `isLoading` starts false, so the ready flag also waits for content —
  // otherwise the restore fires against an empty page and clamps to 0.
  useScrollRestoration(
    "gt-salary-report",
    !isLoading &&
      (monthly !== null ||
        annual !== null ||
        breakdown !== null ||
        cutiEmployees.length > 0)
  );

  const monthRange = useMemo<TimeRange>(
    () => ({
      start: new Date(currentYear, currentMonth - 1, 1),
      end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999),
    }),
    [currentYear, currentMonth]
  );

  const yearRange = useMemo<TimeRange>(
    () => ({
      start: new Date(currentYear, 0, 1),
      end: new Date(currentYear, 11, 31, 23, 59, 59, 999),
    }),
    [currentYear]
  );

  // The Cuti tab is scoped to GT payroll employees (a subset of public.staffs).
  useEffect(() => {
    const fetchGtEmployees = async () => {
      try {
        const rows: any[] = await api.get("/greentarget/api/payroll-employees");
        setGtEmployeeIds(new Set((rows || []).map((r) => r.employee_id)));
      } catch (error) {
        console.error("Failed to fetch GT payroll employees:", error);
      }
    };
    fetchGtEmployees();
  }, []);

  // Multi-ID employees share one leave bucket, so dedupe by name before the call.
  const cutiEmployeeIds = useMemo(
    () =>
      groupStaffsByName(allStaffs.filter((s) => gtEmployeeIds.has(s.id))).map(
        (s) => s.id
      ),
    [allStaffs, gtEmployeeIds]
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isMonthlyTab(activeTab)) {
        const [res, pinjamResponse] = await Promise.all([
          api.get(
            `/greentarget/api/salary-report?year=${currentYear}&month=${currentMonth}`
          ),
          api
            .get(
              `/greentarget/api/pinjam-records/summary?year=${currentYear}&month=${currentMonth}`
            )
            .catch((error: unknown): PinjamSummaryEntry[] => {
              console.error("Error fetching GT pinjam summary:", error);
              return [];
            }),
        ]);
        setMonthly(res);
        if (res?.location_map) setLocationMap(res.location_map);
        setPinjamSummary(
          Array.isArray(pinjamResponse)
            ? (pinjamResponse as PinjamSummaryEntry[])
            : []
        );
      } else if (activeTab === "cuti") {
        if (cutiEmployeeIds.length === 0) return;
        const res = await api.post(
          "/greentarget/api/leave-management/batch-reports",
          { employeeIds: cutiEmployeeIds, year: currentYear }
        );
        setCutiEmployees(res?.employees || []);
        setCutiSummary(res?.summary ?? null);
      } else if (annualView === "summary") {
        const res = await api.get(
          `/greentarget/api/salary-report/annual?year=${currentYear}`
        );
        setAnnual(res);
        if (res?.location_map) setLocationMap(res.location_map);
      } else {
        const res = await api.get(
          `/greentarget/api/salary-report/annual-breakdown?year=${currentYear}`
        );
        setBreakdown(res);
      }
    } catch (error) {
      console.error("Error loading GT salary report:", error);
      if (isMonthlyTab(activeTab)) setPinjamSummary([]);
      toast.error("Failed to load salary report");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, annualView, currentYear, currentMonth, cutiEmployeeIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The yearly aggregate is only needed by the tabs that honour the toggle.
  const fetchYearly = useCallback(async () => {
    setIsLoadingYearly(true);
    try {
      const res = await api.get(
        `/greentarget/api/salary-report/yearly?year=${currentYear}`
      );
      setYearly(res);
      if (res?.location_map) setLocationMap(res.location_map);
    } catch (error) {
      console.error("Error loading GT yearly salary report:", error);
      setYearly(null);
      toast.error("Failed to load yearly salary report");
    } finally {
      setIsLoadingYearly(false);
    }
  }, [currentYear]);

  useEffect(() => {
    if (periodType === "yearly" && isPeriodTab(activeTab)) fetchYearly();
  }, [periodType, activeTab, fetchYearly]);

  const handleTimeChange = (range: TimeRange): void => {
    setCurrentYear(range.start.getFullYear());
    setCurrentMonth(range.start.getMonth() + 1);
  };

  const handleYearChange = (range: TimeRange): void => {
    setCurrentYear(range.start.getFullYear());
  };

  const midMonthPinjamData = useMemo<PinjamReportData[]>(() => {
    if (!monthly) return [];

    const pinjamByStaff = new Map<
      string,
      { totalAmount: number; details: PinjamDetail[] }
    >();

    pinjamSummary.forEach((entry: PinjamSummaryEntry): void => {
      const key: string = getPinjamStaffKey(
        entry.employee_name,
        entry.employee_id
      );
      if (!key) return;

      const bucket: PinjamSummaryBucket | undefined = entry.mid_month;
      const details: PinjamDetail[] = Array.isArray(bucket?.detail_rows)
        ? bucket.detail_rows.map(
            (detail: PinjamDetail): PinjamDetail => ({
              description:
                String(detail.description || "Pinjam").trim() || "Pinjam",
              amount: Number(detail.amount) || 0,
            })
          )
        : [];
      const existing = pinjamByStaff.get(key) ?? {
        totalAmount: 0,
        details: [],
      };
      existing.totalAmount += Number(bucket?.total_amount ?? 0);
      existing.details.push(...details);
      pinjamByStaff.set(key, existing);
    });

    return monthly.data
      .map((row: PinjamReportData): PinjamReportData => {
        const key: string = getPinjamStaffKey(row.staff_name, row.staff_id);
        const pinjam = pinjamByStaff.get(key);
        const midMonthAmount: number = Number(row.mid_month_amount) || 0;
        const totalPinjam: number = pinjam?.totalAmount ?? 0;
        const details: PinjamDetail[] = [...(pinjam?.details ?? [])].sort(
          (a: PinjamDetail, b: PinjamDetail): number => b.amount - a.amount
        );

        return {
          ...row,
          gaji_genap: midMonthAmount,
          total_pinjam: totalPinjam,
          pinjam_details: details,
          final_total: midMonthAmount - totalPinjam,
          net_pay: midMonthAmount,
          mid_month_amount: midMonthAmount,
        };
      })
      .filter(
        (row: PinjamReportData): boolean =>
          row.gaji_genap !== 0 ||
          row.total_pinjam !== 0 ||
          (row.pinjam_details?.length ?? 0) > 0
      )
      .map(
        (row: PinjamReportData, index: number): PinjamReportData => ({
          ...row,
          no: index + 1,
        })
      );
  }, [monthly, pinjamSummary]);

  const activePinjamData: PinjamReportData[] =
    pinjamViewMode === "mid_month" ? midMonthPinjamData : monthly?.data ?? [];
  const activePinjamSummary: Comprehensive["summary"] = useMemo(
    () =>
      activePinjamData.reduce(
        (
          totals: Comprehensive["summary"],
          row: PinjamReportData
        ): Comprehensive["summary"] => ({
          total_gaji_genap: totals.total_gaji_genap + row.gaji_genap,
          total_pinjam: totals.total_pinjam + row.total_pinjam,
          total_final: totals.total_final + row.final_total,
        }),
        { total_gaji_genap: 0, total_pinjam: 0, total_final: 0 }
      ),
    [activePinjamData]
  );
  const activePinjamGajiLabel: string =
    pinjamViewMode === "mid_month" ? "1/2 Bulan" : "Gaji/Genap";
  const activePinjamReportLabel: string =
    pinjamViewMode === "mid_month" ? "Mid-Month Pinjam" : "Pinjam";

  // Employee and Location can show a whole year; every other tab is month-bound.
  const isYearlyView: boolean =
    periodType === "yearly" && isPeriodTab(activeTab);
  const activeData: Comprehensive | null = isYearlyView ? yearly : monthly;
  const isEmployeeLocationView: boolean =
    activeTab === "employee" && employeeView === "location";
  const activeLoading: boolean = isYearlyView ? isLoadingYearly : isLoading;
  const periodLabel: string = isYearlyView
    ? `${currentYear}`
    : `${getMonthName(currentMonth)} ${currentYear}`;

  // Bank/Pinjam show take-home after advances; the other monthly tabs show the
  // full earned salary, so the header total follows the active tab.
  const headerTotal: number =
    activeTab === "pinjam"
      ? activePinjamSummary.total_final
      : activeTab === "bank"
      ? monthly?.summary.total_final ?? 0
      : activeData?.employees_grand_totals?.setelah_digenapkan ?? 0;

  // Employee → Location view: the groups that actually hold people.
  // The endpoint already returns them in location order.
  const employeeLocations = useMemo<LocationData[]>(
    () =>
      (activeData?.locations ?? []).filter(
        (loc: LocationData): boolean => loc.employees.length > 0
      ),
    [activeData]
  );

  // Bank text export — bank-preference employees with money to pay out.
  const bankExportRows = useMemo<PinjamReportData[]>(() => {
    if (!monthly?.data) return [];
    return monthly.data.filter((row: PinjamReportData): boolean => {
      const finalTotal: number = parseFloat(row.final_total.toString());
      return (
        (row.payment_preference ?? "").trim().toLowerCase() === "bank" &&
        finalTotal > 0
      );
    });
  }, [monthly]);

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

  const generateExportURL = () => {
    // Determine server URL based on environment
    const isProduction = window.location.hostname === "tienhock.com";
    const baseURL = isProduction
      ? "https://api.tienhock.com"
      : "http://localhost:5001";
    const url = `${baseURL}/greentarget/api/excel/payment-export?year=${exportYear}&month=${exportMonth}&api_key=foodmaker`;

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
    if (bankExportRows.length === 0) {
      toast.error("No bank payment data available to export");
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
      const dataRows = bankExportRows.map((row: PinjamReportData) => {
        const staff = allStaffs?.find((s) => s.id === row.staff_id);
        const paymentAmount = parseFloat(row.final_total.toString()).toFixed(2);

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
      const totalAmount = bankExportRows.reduce(
        (sum: number, row: PinjamReportData): number =>
          sum + parseFloat(row.final_total.toString()),
        0
      );

      // Create total row
      const totalRow = [
        "TOTAL:",
        "",
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
      link.download = `gt-payment-export-${currentMonth
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

  const handleGenerateBreakdown = async (
    action: "download" | "print"
  ): Promise<void> => {
    if (!monthly || activePinjamData.length === 0) {
      toast.error("No data available to generate PDF");
      return;
    }
    setIsGenerating(true);
    try {
      await generatePinjamBreakdownPDF(
        {
          year: currentYear,
          month: currentMonth,
          data: activePinjamData,
          total_records: activePinjamData.length,
          summary: activePinjamSummary,
          companyName: GT_COMPANY,
          logoSrc: GreenTargetLogo,
          reportLabel: activePinjamReportLabel,
          gajiLabel: activePinjamGajiLabel,
        },
        action
      );
      toast.success(
        `Pinjam breakdown ${action === "download" ? "downloaded" : "generated for printing"}`
      );
    } catch (error) {
      console.error("Error generating pinjam breakdown PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async (
    action: "download" | "print"
  ): Promise<void> => {
    setIsGenerating(true);
    try {
      if (activeTab === "employee" && employeeView === "location") {
        if (!activeData || employeeLocations.length === 0) {
          toast.error(`No data to print for ${periodLabel}`);
          return;
        }
        await generateSalaryReportPDF(
          {
            reportType: "employee-grouped",
            periodType,
            year: currentYear,
            month: isYearlyView ? undefined : currentMonth,
            comprehensiveData: activeData as any,
            grandTotals: activeData.employees_grand_totals as any,
            locationMap: locationMap,
            locationOrder: buildLocationOrder(locationMap),
            companyName: GT_COMPANY,
            mergeCommissionLocations: false,
          },
          action
        );
      } else if (activeTab === "employee") {
        if (!activeData || activeData.employees.length === 0) {
          toast.error(`No data to print for ${periodLabel}`);
          return;
        }
        await generateSalaryReportPDF(
          {
            reportType: "employee-individual",
            periodType,
            year: currentYear,
            month: isYearlyView ? undefined : currentMonth,
            employees: activeData.employees as any,
            grandTotals: activeData.employees_grand_totals as any,
            locationMap: locationMap,
            locationOrder: buildLocationOrder(locationMap),
            companyName: GT_COMPANY,
          },
          action
        );
      } else if (activeTab === "bank") {
        if (!monthly || monthly.bank_data.length === 0) {
          toast.error("No data to print for this month");
          return;
        }
        await generateBankReportPDF(
          {
            year: currentYear,
            month: currentMonth,
            data: monthly.bank_data,
            total_records: monthly.bank_data.length,
            summary: { total_final: monthly.summary.total_final },
            companyName: GT_COMPANY,
            logoSrc: GreenTargetLogo,
          },
          action
        );
      } else if (activeTab === "pinjam") {
        if (!monthly || activePinjamData.length === 0) {
          toast.error("No data to print for this month");
          return;
        }
        await generatePinjamReportPDF(
          {
            year: currentYear,
            month: currentMonth,
            data: activePinjamData,
            total_records: activePinjamData.length,
            summary: activePinjamSummary,
            companyName: GT_COMPANY,
            logoSrc: GreenTargetLogo,
            reportLabel: activePinjamReportLabel,
            gajiLabel: activePinjamGajiLabel,
          },
          action
        );
      } else if (activeTab === "cuti") {
        if (cutiEmployees.length === 0 || !cutiSummary) {
          toast.error("No leave data to print for this year");
          return;
        }
        await generateBatchCutiReportPDF(
          {
            year: currentYear,
            employees: cutiEmployees as any,
            companyName: GT_COMPANY,
            logoSrc: GreenTargetLogo,
            summary: cutiSummary,
          },
          action
        );
      } else if (activeTab === "monthly") {
        if (!activeData || activeData.locations.length === 0) {
          toast.error(`No data to print for ${periodLabel}`);
          return;
        }
        await generateSalaryReportPDF(
          {
            reportType: "location",
            periodType,
            year: currentYear,
            month: isYearlyView ? undefined : currentMonth,
            comprehensiveData: activeData as any,
            grandTotals: activeData.grand_totals as any,
            locationMap: locationMap,
            locationOrder: buildLocationOrder(locationMap),
            companyName: GT_COMPANY,
          },
          action
        );
      } else if (annualView === "summary") {
        if (!annual || annual.monthly.length === 0) {
          toast.error("No data to print for this year");
          return;
        }
        await generateSalaryReportPDF(
          {
            reportType: "annual",
            periodType: "yearly",
            year: currentYear,
            annualData: annual as any,
            locationMap: locationMap,
            locationOrder: buildLocationOrder(locationMap),
            companyName: GT_COMPANY,
          },
          action
        );
      } else {
        if (!breakdown || breakdown.locations.length === 0) {
          toast.error("No data to print for this year");
          return;
        }
        await generateSalaryReportPDF(
          {
            reportType: "annual-breakdown",
            periodType: "yearly",
            year: currentYear,
            annualBreakdownData: breakdown as any,
            locationMap: locationMap,
            locationOrder: buildLocationOrder(locationMap),
            companyName: GT_COMPANY,
          },
          action
        );
      }
      toast.success(`Report ${action === "download" ? "downloaded" : "generated"}`);
    } catch (error) {
      console.error("Error generating salary report PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  const narrowAmountColumns: (keyof Totals)[] = [
    "epf_majikan",
    "epf_pekerja",
    "socso_majikan",
    "socso_pekerja",
    "sip_majikan",
    "sip_pekerja",
  ];
  const groupedStartColumns: (keyof Totals)[] = [
    "epf_majikan",
    "socso_majikan",
    "sip_majikan",
    "pcb",
  ];
  const headCellClass =
    "px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";
  const headGroupClass =
    "px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900";
  const headSubClass =
    "px-1 py-1 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";
  const headBlankClass =
    "bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700";
  const bodyNameCellClass =
    "px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left max-w-[140px]";

  const amountCellClass = (key: keyof Totals, bold: boolean = false): string => {
    const horizontalPadding: string = narrowAmountColumns.includes(key)
      ? "px-1"
      : "px-2";
    const groupBorder: string = groupedStartColumns.includes(key)
      ? " border-l border-default-300 dark:border-gray-600"
      : "";
    const emphasis: string = bold
      ? "font-bold text-default-900 dark:text-gray-100 bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600"
      : "text-default-600 dark:text-gray-300";

    return `${horizontalPadding} py-2 text-xs ${emphasis} text-center${groupBorder}`;
  };

  const renderTableColGroup = (): React.ReactElement => (
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
  );

  const renderAmountCells = (
    totals: Totals,
    bold: boolean = false
  ): React.ReactElement[] =>
    COLUMNS.map((column: { key: keyof Totals; label: string }) => (
      <td key={column.key} className={amountCellClass(column.key, bold)}>
        {fmt(totals[column.key])}
      </td>
    ));

  // Standalone grand-total card used by the Employee → Location view.
  const grandTotalCellClass = (key: keyof Totals): string => {
    const horizontalPadding: string = narrowAmountColumns.includes(key)
      ? "px-1"
      : "px-2";
    const groupBorder: string = groupedStartColumns.includes(key)
      ? " border-l border-sky-300 dark:border-sky-700"
      : "";

    return `${horizontalPadding} py-3 text-xs font-bold text-sky-900 dark:text-sky-100 text-center bg-sky-100 dark:bg-sky-900/40${groupBorder}`;
  };

  const renderGrandTotalCells = (totals: Totals): React.ReactElement[] =>
    COLUMNS.map((column: { key: keyof Totals; label: string }) => (
      <td key={column.key} className={grandTotalCellClass(column.key)}>
        {fmt(totals[column.key])}
      </td>
    ));

  // The location cards each own their scroll box, so their headers don't stick.
  const renderSalaryHeader = (
    firstLabel: string,
    sticky: boolean = true
  ): React.ReactElement => (
    <thead
      className={`${sticky ? "sticky top-0 z-20 " : ""}bg-default-50 dark:bg-gray-900`}
    >
      <tr>
        <th className={headCellClass} title="Bilangan">
          BIL
        </th>
        <th
          className={`${headCellClass} text-left max-w-[140px] truncate`}
          title={firstLabel}
        >
          {firstLabel}
        </th>
        <th className={headCellClass} title="Gaji">
          GAJI
        </th>
        <th className={headCellClass} title="Overtime">
          OT
        </th>
        <th className={headCellClass} title="Bonus">
          BONUS
        </th>
        <th className={headCellClass} title="Commission / Insentif / Lain-lain">
          C/I/O
        </th>
        <th className={headCellClass} title="Cuti">
          CUTI
        </th>
        <th className={headCellClass} title="Gaji Kasar">
          GAJI KASAR
        </th>
        <th className={headGroupClass} colSpan={2} title="EPF">
          EPF
        </th>
        <th className={headGroupClass} colSpan={2} title="SOCSO">
          SOCSO
        </th>
        <th className={headGroupClass} colSpan={2} title="SIP">
          SIP
        </th>
        <th
          className={`${headCellClass} border-l border-default-300 dark:border-gray-600`}
          title="PCB"
        >
          PCB
        </th>
        <th className={headCellClass} title="Gaji Bersih">
          GAJI BERSIH
        </th>
        <th className={headCellClass} title="Setengah Bulan">
          1/2 BULAN
        </th>
        <th className={headCellClass} title="Jumlah">
          JUMLAH
        </th>
        <th className={headCellClass} title="Digenapkan">
          DIGENAPKAN
        </th>
        <th className={headCellClass} title="Setelah Digenapkan">
          SETELAH DIGENAPKAN
        </th>
      </tr>
      <tr>
        {Array.from({ length: 8 }).map((_, index: number) => (
          <th key={`blank-leading-${index}`} className={headBlankClass} />
        ))}
        <th className={headSubClass}>MAJ</th>
        <th className={headSubClass}>PKJ</th>
        <th className={headSubClass}>MAJ</th>
        <th className={headSubClass}>PKJ</th>
        <th className={headSubClass}>MAJ</th>
        <th className={headSubClass}>PKJ</th>
        {Array.from({ length: 6 }).map((_, index: number) => (
          <th key={`blank-trailing-${index}`} className={headBlankClass} />
        ))}
      </tr>
    </thead>
  );

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

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Tab buttons */}
              <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                {TABS.map((tab, index: number) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "bg-sky-500 text-white"
                        : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                    } ${index > 0 ? "border-l border-default-200 dark:border-gray-600" : ""}`}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>
              {/* Sub-view toggle for the Employee tab - right after tabs */}
              {activeTab === "employee" && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setEmployeeView("individual")}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        employeeView === "individual"
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmployeeView("location")}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                        employeeView === "location"
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Location
                    </button>
                  </div>
                </>
              )}
              {activeTab === "pinjam" && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPinjamViewMode("month_end")}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        pinjamViewMode === "month_end"
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Month-End
                    </button>
                    <button
                      type="button"
                      onClick={() => setPinjamViewMode("mid_month")}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                        pinjamViewMode === "mid_month"
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Mid-Month
                    </button>
                  </div>
                </>
              )}
              {/* Sub-view toggle for the Annual tab - right after tabs */}
              {activeTab === "annual" && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                    {(["summary", "breakdown"] as AnnualView[]).map(
                      (v, index: number) => (
                        <button
                          key={v}
                          onClick={() => setAnnualView(v)}
                          className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                            annualView === v
                              ? "bg-sky-500 text-white"
                              : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                          } ${index > 0 ? "border-l border-default-200 dark:border-gray-600" : ""}`}
                        >
                          {v}
                        </button>
                      )
                    )}
                  </div>
                </>
              )}
              {/* Period toggle - for the Employee and Location tabs */}
              {isPeriodTab(activeTab) && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPeriodType("monthly")}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        periodType === "monthly"
                          ? "bg-sky-500 text-white"
                          : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodType("yearly")}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-default-200 dark:border-gray-600 ${
                        periodType === "yearly"
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
              <TimeNavigator
                range={
                  isMonthlyTab(activeTab) && !isYearlyView
                    ? monthRange
                    : yearRange
                }
                onChange={
                  isMonthlyTab(activeTab) && !isYearlyView
                    ? handleTimeChange
                    : handleYearChange
                }
                modes={
                  isMonthlyTab(activeTab) && !isYearlyView ? ["month"] : ["year"]
                }
                presets={false}
                allowFuture={!isMonthlyTab(activeTab) || isYearlyView}
              />
              {activeData && isMonthlyTab(activeTab) && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <div className="text-sm text-default-600 dark:text-gray-300">
                    <span className="block font-medium">
                      {activeTab === "pinjam"
                        ? activePinjamData.length
                        : activeData.total_records} employees
                    </span>
                    <span className="block font-medium">
                      {fmtCurrency(headerTotal)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeTab === "pinjam" && (
                <PinjamBreakdownButton
                  disabled={
                    !monthly || activePinjamData.length === 0 || isGenerating
                  }
                  onGenerate={handleGenerateBreakdown}
                />
              )}
              <Button
                onClick={() => {
                  fetchData();
                  if (isYearlyView) fetchYearly();
                }}
                icon={IconRefresh}
                variant="outline"
                disabled={activeLoading}
                size="sm"
              >
                Refresh
              </Button>
              <Button
                onClick={() => handleGenerate("print")}
                icon={IconPrinter}
                variant="outline"
                disabled={isGenerating || activeLoading}
                size="sm"
              >
                Print
              </Button>
              <Button
                onClick={() => handleGenerate("download")}
                icon={IconDownload}
                variant="outline"
                disabled={isGenerating || activeLoading}
                size="sm"
              >
                Download
              </Button>
              {activeTab === "bank" && (
                <>
                  <Button
                    onClick={generateTextExport}
                    icon={IconFileExport}
                    color="purple"
                    variant="outline"
                    disabled={
                      !monthly ||
                      bankExportRows.length === 0 ||
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
        </div>

        {/* Content */}
        {activeLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          // The Employee → Location cards stack down the page (each scrolls
          // sideways on its own), so that view opts out of the scroll box.
          <div
            className={
              isEmployeeLocationView ? undefined : "overflow-auto max-h-[75vh]"
            }
          >
          {/* EMPLOYEE — same columns as the grouped view, but one flat list. */}
          {activeTab === "employee" &&
            employeeView === "individual" &&
            (!activeData || activeData.employees.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No processed payroll for {periodLabel}.
              </div>
            ) : (
              <table className="w-full table-fixed">
                {renderTableColGroup()}
                {renderSalaryHeader("NAMA PEKERJA")}
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {activeData.employees.map((emp, index: number) => (
                    <tr
                      key={emp.staff_id}
                      className={
                        index % 2 === 0
                          ? "bg-white dark:bg-gray-800"
                          : "bg-default-25 dark:bg-gray-750"
                      }
                    >
                      <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                        {index + 1}
                      </td>
                      <td className={bodyNameCellClass}>
                        <span
                          className="block truncate"
                          title={`${emp.staff_id.toUpperCase()} - ${emp.staff_name.toUpperCase()}`}
                        >
                          {emp.staff_id.toUpperCase()} -{" "}
                          {emp.staff_name.toUpperCase()}
                        </span>
                      </td>
                      {renderAmountCells(emp)}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
                    >
                      GRAND TOTAL
                    </td>
                    {renderAmountCells(activeData.employees_grand_totals, true)}
                  </tr>
                </tfoot>
              </table>
            ))}

          {/* EMPLOYEE → LOCATION — the same people, grouped under their location. */}
          {activeTab === "employee" &&
            employeeView === "location" &&
            (!activeData || employeeLocations.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No processed payroll for {periodLabel}.
              </div>
            ) : (
              <div className="px-6 pt-2 pb-2 space-y-3">
                {employeeLocations.map((loc: LocationData) => (
                  <div
                    key={loc.location}
                    className="overflow-auto border border-default-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-2 border-b border-default-200 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-sky-800 dark:text-sky-300">
                        {loc.location} -{" "}
                        {(
                          locationMap[loc.location] || loc.location
                        ).toUpperCase()}
                      </h3>
                    </div>
                    <table className="w-full table-fixed">
                      {renderTableColGroup()}
                      {renderSalaryHeader("NAMA PEKERJA", false)}
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                        {loc.employees.map((emp: EmpRow, index: number) => (
                          <tr
                            key={emp.staff_id}
                            className={
                              index % 2 === 0
                                ? "bg-white dark:bg-gray-800"
                                : "bg-default-25 dark:bg-gray-750"
                            }
                          >
                            <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                              {index + 1}
                            </td>
                            <td className={bodyNameCellClass}>
                              <span
                                className="block truncate"
                                title={`${emp.staff_id.toUpperCase()} - ${emp.staff_name.toUpperCase()}`}
                              >
                                {emp.staff_id.toUpperCase()} -{" "}
                                {emp.staff_name.toUpperCase()}
                              </span>
                            </td>
                            {renderAmountCells(emp)}
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
                          {renderAmountCells(loc.totals, true)}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}

                {/* Grand Total Section */}
                <div className="overflow-auto border-2 border-sky-500 dark:border-sky-600 rounded-lg">
                  <table className="w-full table-fixed">
                    {renderTableColGroup()}
                    <tbody>
                      <tr>
                        <td
                          colSpan={2}
                          className="px-2 py-3 text-sm font-bold text-white text-center bg-sky-600 dark:bg-sky-700"
                        >
                          GRAND TOTAL
                        </td>
                        {renderGrandTotalCells(activeData.employees_grand_totals)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

          {/* BANK */}
          {activeTab === "bank" &&
            (!monthly || monthly.bank_data.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No payments for {getMonthName(currentMonth)} {currentYear}.
              </div>
            ) : (
              <div className="px-6 pt-2 pb-2">
                <BankReportTable data={monthly.bank_data} />
              </div>
            ))}

          {/* PINJAM */}
          {activeTab === "pinjam" &&
            (!monthly || activePinjamData.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                {pinjamViewMode === "mid_month"
                  ? `No mid-month data for ${getMonthName(currentMonth)} ${currentYear}.`
                  : `No processed payroll for ${getMonthName(currentMonth)} ${currentYear}.`}
              </div>
            ) : (
              <div className="px-6 pt-2 pb-2">
                <PinjamReportTable
                  data={activePinjamData}
                  gajiLabel={activePinjamGajiLabel}
                />
                <PinjamBreakdownCard data={activePinjamData} />
              </div>
            ))}

          {/* CUTI */}
          {activeTab === "cuti" &&
            (cutiEmployees.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No leave records in {currentYear}.
              </div>
            ) : (
              <div className="px-6 pt-2 pb-2">
                <CutiReportTable employees={cutiEmployees} month={null} />
              </div>
            ))}

          {/* MONTHLY */}
          {activeTab === "monthly" &&
            (!activeData || activeData.locations.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No processed payroll for {periodLabel}.
              </div>
            ) : (
              <table className="w-full table-fixed">
                {renderTableColGroup()}
                {renderSalaryHeader("BAHAGIAN KERJA")}
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {activeData.locations.map((loc, index: number) => (
                    <tr
                      key={loc.location}
                      className={
                        index % 2 === 0
                          ? "bg-white dark:bg-gray-800"
                          : "bg-default-25 dark:bg-gray-750"
                      }
                    >
                      <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                        {loc.location}
                      </td>
                      <td className={bodyNameCellClass}>
                        <span className="block truncate">
                          {(
                            locationMap[loc.location] || loc.location
                          ).toUpperCase()}
                        </span>
                      </td>
                      {renderAmountCells(loc.totals)}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
                    >
                      GRAND TOTAL
                    </td>
                    {renderAmountCells(activeData.grand_totals, true)}
                  </tr>
                </tfoot>
              </table>
            ))}

          {/* ANNUAL SUMMARY */}
          {activeTab === "annual" &&
            annualView === "summary" &&
            (!annual || annual.monthly.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No processed payroll in {currentYear}.
              </div>
            ) : (
              <table className="w-full table-fixed">
                {renderTableColGroup()}
                {renderSalaryHeader("MONTH / LOCATION")}
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {annual.monthly.map((m, index: number) => (
                    <tr
                      key={m.month}
                      className={
                        index % 2 === 0
                          ? "bg-white dark:bg-gray-800"
                          : "bg-default-25 dark:bg-gray-750"
                      }
                    >
                      <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                        {m.month}
                      </td>
                      <td className={bodyNameCellClass}>
                        {getMonthName(m.month)}
                      </td>
                      {renderAmountCells(m.totals)}
                    </tr>
                  ))}
                  {annual.locations.map((loc) => (
                    <tr
                      key={loc.location}
                      className="bg-sky-50 dark:bg-sky-900/20"
                    >
                      <td
                        colSpan={2}
                        className="px-3 py-2 text-xs font-semibold text-sky-800 dark:text-sky-300 text-left"
                      >
                        {locationMap[loc.location] || loc.location} (YEAR)
                      </td>
                      {renderAmountCells(loc.totals, true)}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
                    >
                      GRAND TOTAL
                    </td>
                    {renderAmountCells(annual.grand_totals, true)}
                  </tr>
                </tfoot>
              </table>
            ))}

          {/* ANNUAL BREAKDOWN */}
          {activeTab === "annual" &&
            annualView === "breakdown" &&
            (!breakdown || breakdown.locations.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No processed payroll in {currentYear}.
              </div>
            ) : (
              <table className="w-full table-fixed">
                {renderTableColGroup()}
                {renderSalaryHeader("NAMA PEKERJA / MONTH")}
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {breakdown.locations.map((loc) => (
                    <React.Fragment key={loc.location}>
                      <tr className="bg-sky-50 dark:bg-sky-900/20">
                        <td
                          colSpan={TABLE_COLUMN_COUNT}
                          className="px-4 py-2 text-sm font-semibold text-sky-800 dark:text-sky-300 border-y border-default-200 dark:border-gray-700"
                        >
                          {(locationMap[loc.location] || loc.location).toUpperCase()}
                        </td>
                      </tr>
                      {loc.employees.map((emp) => (
                        <React.Fragment key={emp.staff_id}>
                          <tr className="bg-default-50 dark:bg-gray-900/40">
                            <td
                              colSpan={TABLE_COLUMN_COUNT}
                              className="px-3 py-2 text-xs font-semibold text-default-700 dark:text-gray-200 uppercase tracking-wide"
                            >
                              {emp.staff_id.toUpperCase()} -{" "}
                              {emp.staff_name.toUpperCase()}
                            </td>
                          </tr>
                          {emp.months.map((m, index: number) => (
                            <tr
                              key={m.month}
                              className={
                                index % 2 === 0
                                  ? "bg-white dark:bg-gray-800"
                                  : "bg-default-25 dark:bg-gray-750"
                              }
                            >
                              <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                                {m.month}
                              </td>
                              <td className={bodyNameCellClass}>
                                {getMonthName(m.month)}
                              </td>
                              {renderAmountCells(m)}
                            </tr>
                          ))}
                          <tr>
                            <td
                              colSpan={2}
                              className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600"
                            >
                              {emp.staff_name} Total
                            </td>
                            {renderAmountCells(emp.total, true)}
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr>
                        <td
                          colSpan={2}
                          className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600"
                        >
                          {locationMap[loc.location] || loc.location} Total
                        </td>
                        {renderAmountCells(loc.totals, true)}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
                    >
                      GRAND TOTAL
                    </td>
                    {renderAmountCells(breakdown.grand_totals, true)}
                  </tr>
                </tfoot>
              </table>
            ))}
          </div>
        )}
      </div>

      {/* Export Dialog */}
      <ExportDialog />
    </div>
  );
};

export default GTSalaryReportPage;

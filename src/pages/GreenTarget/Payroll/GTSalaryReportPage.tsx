// src/pages/GreenTarget/Payroll/GTSalaryReportPage.tsx
// Green Target Salary Report (Phase 5). Monthly + annual views grouped by job
// (OFFICE / DRIVER) — GT has no locations. Reuses the shared TH PDF generator.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { IconRefresh, IconPrinter, IconDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import TimeNavigator, { TimeRange } from "../../../components/TimeNavigator";
import { api } from "../../../routes/utils/api";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import { generateSalaryReportPDF } from "../../../utils/payroll/SalaryReportPDF";
import toast from "react-hot-toast";

const GT_COMPANY = "GREEN TARGET SDN. BHD.";
const LOCATION_MAP: Record<string, string> = {
  OFFICE: "Office",
  DRIVER: "Driver Lori Habuk",
};
const LOCATION_ORDER = [
  { type: "location" as const, id: "OFFICE" },
  { type: "location" as const, id: "DRIVER" },
];

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
  employee_payroll_id: number;
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
  month: number;
  locations: LocationData[];
  grand_totals: Totals;
}
interface AnnualSummary {
  year: number;
  monthly: { month: number; totals: Totals }[];
  locations: { location: string; totals: Totals }[];
  grand_totals: Totals;
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

const fmt = (n: number): string =>
  (Number(n) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type TabType = "monthly" | "annual";
type AnnualView = "summary" | "breakdown";

const GTSalaryReportPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("monthly");
  const [annualView, setAnnualView] = useState<AnnualView>("summary");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  const [monthly, setMonthly] = useState<Comprehensive | null>(null);
  const [annual, setAnnual] = useState<AnnualSummary | null>(null);
  const [breakdown, setBreakdown] = useState<AnnualBreakdown | null>(null);

  const monthRange = useMemo<TimeRange>(
    () => ({
      start: new Date(currentYear, currentMonth - 1, 1),
      end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999),
    }),
    [currentYear, currentMonth]
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === "monthly") {
        const res = await api.get(
          `/greentarget/api/salary-report?year=${currentYear}&month=${currentMonth}`
        );
        setMonthly(res);
      } else if (annualView === "summary") {
        const res = await api.get(
          `/greentarget/api/salary-report/annual?year=${currentYear}`
        );
        setAnnual(res);
      } else {
        const res = await api.get(
          `/greentarget/api/salary-report/annual-breakdown?year=${currentYear}`
        );
        setBreakdown(res);
      }
    } catch (error) {
      console.error("Error loading GT salary report:", error);
      toast.error("Failed to load salary report");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, annualView, currentYear, currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTimeChange = (range: TimeRange) => {
    setCurrentYear(range.start.getFullYear());
    setCurrentMonth(range.start.getMonth() + 1);
  };

  const handleGenerate = async (action: "download" | "print") => {
    setIsGenerating(true);
    try {
      if (activeTab === "monthly") {
        if (!monthly || monthly.locations.length === 0) {
          toast.error("No data to print for this month");
          return;
        }
        await generateSalaryReportPDF(
          {
            reportType: "employee-grouped",
            periodType: "monthly",
            year: currentYear,
            month: currentMonth,
            comprehensiveData: monthly as any,
            grandTotals: monthly.grand_totals as any,
            locationMap: LOCATION_MAP,
            locationOrder: LOCATION_ORDER,
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
            locationMap: LOCATION_MAP,
            locationOrder: LOCATION_ORDER,
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
            locationMap: LOCATION_MAP,
            locationOrder: LOCATION_ORDER,
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

  const headCellCls =
    "px-2 py-1.5 text-right text-[10px] font-semibold text-default-600 dark:text-gray-300 whitespace-nowrap";
  const cellCls =
    "px-2 py-1 text-right text-xs text-default-800 dark:text-gray-200 whitespace-nowrap";

  const TotalsCells: React.FC<{ t: Totals; bold?: boolean }> = ({ t, bold }) => (
    <>
      {COLUMNS.map((c) => (
        <td key={c.key} className={`${cellCls} ${bold ? "font-semibold" : ""}`}>
          {fmt(t[c.key])}
        </td>
      ))}
    </>
  );

  const ColumnHeader = () => (
    <tr className="bg-default-100 dark:bg-gray-900/60">
      <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-default-600 dark:text-gray-300">
        Name
      </th>
      {COLUMNS.map((c) => (
        <th key={c.key} className={headCellCls}>
          {c.label}
        </th>
      ))}
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Salary Report (Green Target)
          </h1>
          <div className="flex items-center bg-default-100 dark:bg-gray-800 rounded-full p-0.5">
            {(["monthly", "annual"] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-default-600 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleGenerate("print")}
            icon={IconPrinter}
            variant="outline"
            disabled={isGenerating || isLoading}
          >
            Print
          </Button>
          <Button
            onClick={() => handleGenerate("download")}
            icon={IconDownload}
            variant="outline"
            disabled={isGenerating || isLoading}
          >
            Download
          </Button>
          <Button
            onClick={fetchData}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4 flex flex-wrap items-end gap-4">
        {activeTab === "monthly" ? (
          <TimeNavigator
            range={monthRange}
            onChange={handleTimeChange}
            modes={["month"]}
            presets={false}
          />
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentYear((y) => y - 1)}
                className="px-2 py-1 rounded border border-default-300 dark:border-gray-600 text-sm hover:bg-default-50 dark:hover:bg-gray-700"
              >
                ‹
              </button>
              <span className="px-3 text-lg font-semibold text-default-800 dark:text-gray-100">
                {currentYear}
              </span>
              <button
                onClick={() => setCurrentYear((y) => y + 1)}
                className="px-2 py-1 rounded border border-default-300 dark:border-gray-600 text-sm hover:bg-default-50 dark:hover:bg-gray-700"
              >
                ›
              </button>
            </div>
            <div className="flex items-center bg-default-100 dark:bg-gray-800 rounded-full p-0.5">
              {(["summary", "breakdown"] as AnnualView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setAnnualView(v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    annualView === v
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-default-600 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-x-auto">
          {/* MONTHLY */}
          {activeTab === "monthly" &&
            (!monthly || monthly.locations.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No processed payroll for {getMonthName(currentMonth)} {currentYear}.
              </div>
            ) : (
              <table className="min-w-full">
                <tbody>
                  {monthly.locations.map((loc) => (
                    <React.Fragment key={loc.location}>
                      <tr className="bg-sky-50 dark:bg-sky-900/20">
                        <td
                          colSpan={COLUMNS.length + 1}
                          className="px-3 py-1.5 text-sm font-semibold text-sky-800 dark:text-sky-300"
                        >
                          {LOCATION_MAP[loc.location] || loc.location}
                        </td>
                      </tr>
                      <ColumnHeader />
                      {loc.employees.map((emp) => (
                        <tr
                          key={emp.employee_payroll_id}
                          className="border-t border-default-100 dark:border-gray-700/70"
                        >
                          <td className="px-2 py-1 text-left text-xs text-default-800 dark:text-gray-200 whitespace-nowrap">
                            {emp.staff_name}
                          </td>
                          <TotalsCells t={emp} />
                        </tr>
                      ))}
                      <tr className="border-t border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/40">
                        <td className="px-2 py-1 text-left text-xs font-semibold text-default-700 dark:text-gray-200">
                          {LOCATION_MAP[loc.location] || loc.location} Total
                        </td>
                        <TotalsCells t={loc.totals} bold />
                      </tr>
                    </React.Fragment>
                  ))}
                  <tr className="border-t-2 border-default-300 dark:border-gray-600 bg-emerald-50 dark:bg-emerald-900/20">
                    <td className="px-2 py-1.5 text-left text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      GRAND TOTAL
                    </td>
                    <TotalsCells t={monthly.grand_totals} bold />
                  </tr>
                </tbody>
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
              <table className="min-w-full">
                <thead>
                  <tr className="bg-default-100 dark:bg-gray-900/60">
                    <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-default-600 dark:text-gray-300">
                      Month
                    </th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={headCellCls}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {annual.monthly.map((m) => (
                    <tr
                      key={m.month}
                      className="border-t border-default-100 dark:border-gray-700/70"
                    >
                      <td className="px-2 py-1 text-left text-xs text-default-800 dark:text-gray-200 whitespace-nowrap">
                        {getMonthName(m.month)}
                      </td>
                      <TotalsCells t={m.totals} />
                    </tr>
                  ))}
                  {annual.locations.map((loc) => (
                    <tr
                      key={loc.location}
                      className="border-t border-default-200 dark:border-gray-700 bg-sky-50 dark:bg-sky-900/20"
                    >
                      <td className="px-2 py-1 text-left text-xs font-semibold text-sky-800 dark:text-sky-300">
                        {LOCATION_MAP[loc.location] || loc.location} (year)
                      </td>
                      <TotalsCells t={loc.totals} bold />
                    </tr>
                  ))}
                  <tr className="border-t-2 border-default-300 dark:border-gray-600 bg-emerald-50 dark:bg-emerald-900/20">
                    <td className="px-2 py-1.5 text-left text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      GRAND TOTAL
                    </td>
                    <TotalsCells t={annual.grand_totals} bold />
                  </tr>
                </tbody>
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
              <table className="min-w-full">
                <tbody>
                  {breakdown.locations.map((loc) => (
                    <React.Fragment key={loc.location}>
                      <tr className="bg-sky-50 dark:bg-sky-900/20">
                        <td
                          colSpan={COLUMNS.length + 1}
                          className="px-3 py-1.5 text-sm font-semibold text-sky-800 dark:text-sky-300"
                        >
                          {LOCATION_MAP[loc.location] || loc.location}
                        </td>
                      </tr>
                      {loc.employees.map((emp) => (
                        <React.Fragment key={emp.staff_id}>
                          <tr className="bg-default-50 dark:bg-gray-900/40">
                            <td className="px-2 py-1 text-left text-xs font-semibold text-default-700 dark:text-gray-200">
                              {emp.staff_name}
                            </td>
                            {COLUMNS.map((c) => (
                              <th key={c.key} className={headCellCls}>
                                {c.label}
                              </th>
                            ))}
                          </tr>
                          {emp.months.map((m) => (
                            <tr
                              key={m.month}
                              className="border-t border-default-100 dark:border-gray-700/70"
                            >
                              <td className="px-2 py-1 text-left text-xs text-default-600 dark:text-gray-400 whitespace-nowrap pl-4">
                                {getMonthName(m.month)}
                              </td>
                              <TotalsCells t={m} />
                            </tr>
                          ))}
                          <tr className="border-t border-default-200 dark:border-gray-700">
                            <td className="px-2 py-1 text-left text-xs font-semibold text-default-700 dark:text-gray-200 pl-4">
                              {emp.staff_name} Total
                            </td>
                            <TotalsCells t={emp.total} bold />
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr className="border-t border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-900/60">
                        <td className="px-2 py-1 text-left text-xs font-bold text-default-800 dark:text-gray-100">
                          {LOCATION_MAP[loc.location] || loc.location} Total
                        </td>
                        <TotalsCells t={loc.totals} bold />
                      </tr>
                    </React.Fragment>
                  ))}
                  <tr className="border-t-2 border-default-300 dark:border-gray-600 bg-emerald-50 dark:bg-emerald-900/20">
                    <td className="px-2 py-1.5 text-left text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      GRAND TOTAL
                    </td>
                    <TotalsCells t={breakdown.grand_totals} bold />
                  </tr>
                </tbody>
              </table>
            ))}
        </div>
      )}
    </div>
  );
};

export default GTSalaryReportPage;

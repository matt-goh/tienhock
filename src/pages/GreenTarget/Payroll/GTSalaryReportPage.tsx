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

const TABLE_COLUMN_COUNT = COLUMNS.length + 2;

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

  const yearRange = useMemo<TimeRange>(
    () => ({
      start: new Date(currentYear, 0, 1),
      end: new Date(currentYear, 11, 31, 23, 59, 59, 999),
    }),
    [currentYear]
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

  const handleTimeChange = (range: TimeRange): void => {
    setCurrentYear(range.start.getFullYear());
    setCurrentMonth(range.start.getMonth() + 1);
  };

  const handleYearChange = (range: TimeRange): void => {
    setCurrentYear(range.start.getFullYear());
  };

  const handleGenerate = async (
    action: "download" | "print"
  ): Promise<void> => {
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
            showLocationCodes: false,
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
            showLocationCodes: false,
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

  const renderSalaryHeader = (firstLabel: string): React.ReactElement => (
    <thead className="sticky top-0 z-20 bg-default-50 dark:bg-gray-900">
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Salary Report (Green Target)
          </h1>
          <div className="flex items-center rounded-full border border-default-200 bg-default-100 p-0.5 dark:border-gray-700 dark:bg-gray-900">
            {(["monthly", "annual"] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-default-600 hover:bg-white hover:text-default-800 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
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
            <TimeNavigator
              range={yearRange}
              onChange={handleYearChange}
              modes={["year"]}
              presets={false}
              allowFuture
            />
            <div className="flex items-center rounded-full border border-default-200 bg-default-100 p-0.5 dark:border-gray-700 dark:bg-gray-900">
              {(["summary", "breakdown"] as AnnualView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setAnnualView(v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    annualView === v
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-default-600 hover:bg-white hover:text-default-800 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
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
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-auto max-h-[75vh]">
          {/* MONTHLY */}
          {activeTab === "monthly" &&
            (!monthly || monthly.locations.length === 0 ? (
              <div className="text-center py-12 text-default-500 dark:text-gray-400">
                No processed payroll for {getMonthName(currentMonth)} {currentYear}.
              </div>
            ) : (
              <table className="w-full table-fixed">
                {renderTableColGroup()}
                {renderSalaryHeader("NAMA PEKERJA")}
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {monthly.locations.map((loc) => (
                    <React.Fragment key={loc.location}>
                      <tr className="bg-sky-50 dark:bg-sky-900/20">
                        <td
                          colSpan={TABLE_COLUMN_COUNT}
                          className="px-4 py-2 text-sm font-semibold text-sky-800 dark:text-sky-300 border-y border-default-200 dark:border-gray-700"
                        >
                          {loc.location} -{" "}
                          {(LOCATION_MAP[loc.location] || loc.location).toUpperCase()}
                        </td>
                      </tr>
                      {loc.employees.map((emp, index: number) => (
                        <tr
                          key={emp.employee_payroll_id}
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
                      <tr>
                        <td
                          colSpan={2}
                          className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t border-default-300 dark:border-gray-600"
                        >
                          SUBTOTAL
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
                    {renderAmountCells(monthly.grand_totals, true)}
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
                        {LOCATION_MAP[loc.location] || loc.location} (YEAR)
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
                          {(LOCATION_MAP[loc.location] || loc.location).toUpperCase()}
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
                          {LOCATION_MAP[loc.location] || loc.location} Total
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
  );
};

export default GTSalaryReportPage;

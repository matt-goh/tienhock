// src/pages/Stock/Reports/EstimatedReportPage.tsx
// Monthly "Estimated P&L & Unit Cost" report (MEE & BIHUN), from 06/2026.
// Rendered in two dedicated views via the `view` prop: "pl" (Estimated P&L page)
// and "unitCost" (Estimated Unit Cost page). Every figure is rendered from
// GET /api/estimated-report as computed by the backend engine - nothing is
// hardcoded here. Doc: docs/Account/ESTIMATED_REPORT_HANDOVER.md
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconAdjustments,
  IconChevronDown,
  IconChevronRight,
  IconPrinter,
  IconRefresh,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import clsx from "clsx";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { FormInput } from "../../../components/FormComponents";
import EstimatedReportMappingModal, {
  MappingLine,
  MappingSourceRow,
} from "../../../components/Stock/EstimatedReportMappingModal";
import { generateEstimatedReportPDF } from "../../../utils/stock/EstimatedReportPDF";
import { api } from "../../../routes/utils/api";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import {
  usePersistedFilters,
  reviveDate,
} from "../../../hooks/usePersistedFilters";

type ProductLine = "mee" | "bihun";

/** One of the three print actions: a single product line, or both. */
type PrintTarget = ProductLine | "all";

export type EstimatedReportView = "pl" | "unitCost";

interface ReportPeriod {
  year: number;
  month: number;
  monthKey: string;
  label: string;
}

interface PLProductRow {
  lineKey: string;
  lineId: number;
  kind: "product" | "foc" | "group";
  code: string | null;
  description: string;
  bags: number | null;
  amount: number | null;
}

interface PLStockRow {
  lineKey: string;
  lineId: number;
  code: string | null;
  description: string;
  amount: number;
}

interface PLReturnsRow extends PLStockRow {
  bags: number;
}

interface PLReport {
  products: PLProductRow[];
  totals: { bags: number; amount: number };
  closingStock: PLStockRow[];
  closingStockTotal: number;
  closingStockPlusSales: number;
  openingStock: PLStockRow[];
  openingStockTotal: number;
  purchases: PLStockRow[];
  purchaseTotal: number;
  returns: PLReturnsRow[];
  returnsTotal: number;
  openingPlusPurchasesPlusReturns: number;
  usage: number;
  gross: number;
  expenses: number;
  expenseBreakdown: {
    salary: number;
    salesman: number;
    habuk: number;
    expenses: number;
    machineRepair: number;
  };
  profitLoss: number;
  addBack: number;
  finalProfitLoss: number;
  accumulative: number;
}

interface UnitCostRow {
  lineKey: string;
  lineId: number;
  code: string | null;
  description: string;
  amount: number;
  unit: number;
}

interface UnitCostGroup {
  key: string;
  rows: UnitCostRow[];
  subtotal: { amount: number; unit: number };
}

interface UnitCostReport {
  bagsSold: number;
  sales: { amount: number; unit: number };
  production: { bags: number; lineKey: string | null };
  groups: UnitCostGroup[];
  totalBeforeRepair: { amount: number; unit: number };
  machineRepair: { rows: UnitCostRow[]; amount: number; unit: number };
  total: { amount: number; unit: number };
  addBack: { amount: number; unit: number };
  finalUnitCost: number;
}

interface MonthlyTrailEntry {
  year: number;
  month: number;
  monthKey: string;
  profitLoss: number;
  accumulative: number;
}

interface ProductLineReport {
  productLine: ProductLine;
  period: ReportPeriod;
  pl: PLReport;
  unitCost: UnitCostReport;
  anchor: { asOfDate: string; accumulative: number } | null;
  monthlyTrail: MonthlyTrailEntry[];
  warnings: string[];
}

interface EstimatedReportResponse {
  period: ReportPeriod & { start: string; end: string };
  reports: Partial<Record<ProductLine, ProductLineReport>>;
}

// The report's first month (accumulative anchors start 2026-06-01).
const REPORT_MIN_MONTH = new Date(2026, 5, 1);

const UNIT_COST_GROUP_LABELS: Record<string, string> = {
  ingredient: "Ingredients",
  packing: "Packing",
  salary: "Salary",
  salesman: "Salesman",
  habuk: "Habuk",
  expenses: "Expenses",
};

const EXPENSE_BREAKDOWN_LABELS: {
  key: keyof PLReport["expenseBreakdown"];
  label: string;
}[] = [
  { key: "salary", label: "Salary" },
  { key: "salesman", label: "Salesman" },
  { key: "habuk", label: "Habuk" },
  { key: "expenses", label: "Expenses" },
  { key: "machineRepair", label: "Machine Repair" },
];

const formatCurrency = (amount: number): string => {
  const formatted = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
};

const formatBags = (bags: number): string =>
  new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(bags);

const formatUnit = (unit: number): string => unit.toFixed(6);

const signedAmountClass = (amount: number): string =>
  amount >= 0
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const thClass =
  "py-1.5 pr-2 text-left text-xs font-semibold uppercase tracking-wider text-default-500 dark:text-gray-400";
const thRightClass = clsx(thClass, "text-right");
const tdClass = "py-1.5 pr-2 text-sm text-default-700 dark:text-gray-300";
const tdRightClass = clsx(tdClass, "text-right");

/** Read-only label for one mapping source member. */
const describeSource = (source: MappingSourceRow): string => {
  switch (source.source_type) {
    case "material": {
      const variant = source.variant_name ? ` (${source.variant_name})` : "";
      const bucket = source.stock_bucket
        ? ` [${source.stock_bucket.toUpperCase()}]`
        : "";
      return `${source.material_code ?? source.material_id} - ${
        source.material_name ?? "Material"
      }${variant}${bucket}`;
    }
    case "kilang":
      return `Kilang stock [${(source.stock_bucket ?? "").toUpperCase()}]`;
    case "account":
      return `${source.account_code}${
        source.account_description ? ` - ${source.account_description}` : ""
      }`;
    case "product":
      return `${source.product_id}${
        source.product_description ? ` - ${source.product_description}` : ""
      }`;
    case "product_type":
      return `Product type: ${source.product_type}`;
    case "line":
      return `${source.ref_line_key ?? source.ref_line_id}${
        source.ref_line_description ? ` - ${source.ref_line_description}` : ""
      }`;
    default:
      return source.source_type;
  }
};

/** Read-only expanded panel listing a report line's mapping members. */
const SourceMembers: React.FC<{ line: MappingLine }> = ({ line }) => (
  <div className="my-1 rounded-md border border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/60 px-3 py-2">
    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
      Mapping sources · {line.line_key}
    </div>
    {line.sources.length === 0 ? (
      <div className="text-xs text-default-400 dark:text-gray-500">
        No source members.
      </div>
    ) : (
      <ul className="space-y-0.5">
        {line.sources.map((source) => (
          <li
            key={source.id}
            className="flex flex-wrap items-center gap-2 text-xs text-default-600 dark:text-gray-300"
          >
            <span className="inline-flex items-center rounded bg-default-100 dark:bg-gray-700 px-1.5 py-0.5 font-medium uppercase text-default-500 dark:text-gray-300">
              {source.source_type}
            </span>
            <span>{describeSource(source)}</span>
            {Number(source.sign) === -1 && (
              <span className="font-medium text-rose-600 dark:text-rose-400">
                excluded (-1)
              </span>
            )}
            {Number(source.percentage) !== 100 && (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {Number(source.percentage)}%
              </span>
            )}
          </li>
        ))}
      </ul>
    )}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-default-700 dark:text-gray-200">
    {children}
  </h3>
);

/** Bold section total row (border-t), e.g. "Total Sales". */
const TotalRow: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="mt-1.5 flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 text-sm font-bold">
    <span className="text-gray-900 dark:text-white">{label}</span>
    <span className="text-gray-900 dark:text-white">{value}</span>
  </div>
);

/** Quiet derived-figure row under a section, e.g. "Closing Stock + Sales". */
const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="mt-1 flex justify-between text-sm">
    <span className="text-default-500 dark:text-gray-400">{label}</span>
    <span className="font-medium text-default-700 dark:text-gray-200">
      {value}
    </span>
  </div>
);

/** Full-bleed highlighted band for headline figures (USAGE, P/L, totals). */
const BandRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  accent?: boolean;
}> = ({ label, value, accent = false }) => (
  <div
    className={clsx(
      "-mx-4 flex items-center justify-between border-y px-4 font-bold",
      accent
        ? "border-gray-300 dark:border-gray-600 bg-blue-50 dark:bg-blue-900/30 py-2.5 text-base"
        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 py-2 text-sm"
    )}
  >
    <span className="text-gray-900 dark:text-white">{label}</span>
    <span className="text-gray-900 dark:text-white">{value}</span>
  </div>
);

/** Separator dot for the compact summary strip. */
const StripDot: React.FC = () => (
  <span className="text-default-300 dark:text-gray-600">•</span>
);

interface DrilldownProps {
  mappings: Map<number, MappingLine>;
  expandedLineIds: Set<number>;
  onToggleLine: (lineId: number) => void;
}

interface PLTableRow {
  lineId?: number;
  code: string | null;
  description: string;
  bags?: number | null;
  amount: number | null;
}

/** P&L rows table (bags + amount) with optional mapping drilldowns. */
const PLRowTable: React.FC<
  DrilldownProps & {
    rows: PLTableRow[];
    showBags: boolean;
    enableDrilldown: boolean;
  }
> = ({
  rows,
  showBags,
  enableDrilldown,
  mappings,
  expandedLineIds,
  onToggleLine,
}) => {
  const columnCount = (enableDrilldown ? 1 : 0) + 2 + (showBags ? 1 : 0) + 1;
  return (
    <table className="min-w-full">
      <thead>
        <tr className="border-b border-gray-200 dark:border-gray-700">
          {enableDrilldown && <th className={clsx(thClass, "w-8")}></th>}
          <th className={thClass}>Code</th>
          <th className={thClass}>Description</th>
          {showBags && <th className={thRightClass}>Bags</th>}
          <th className={thRightClass}>Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
        {rows.map((row, index) => {
          const line =
            enableDrilldown && row.lineId !== undefined
              ? mappings.get(row.lineId)
              : undefined;
          const hasSources = (line?.sources.length ?? 0) > 0;
          const isExpanded =
            row.lineId !== undefined && expandedLineIds.has(row.lineId);
          return (
            <React.Fragment key={`${row.lineId ?? "row"}-${index}`}>
              <tr>
                {enableDrilldown && (
                  <td className="py-1.5 pr-1 align-top">
                    {hasSources && row.lineId !== undefined && (
                      <button
                        type="button"
                        onClick={() => onToggleLine(row.lineId as number)}
                        className="rounded p-0.5 text-default-400 hover:bg-default-100 hover:text-default-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        aria-label={
                          isExpanded ? "Hide mapping sources" : "Show mapping sources"
                        }
                      >
                        {isExpanded ? (
                          <IconChevronDown size={16} />
                        ) : (
                          <IconChevronRight size={16} />
                        )}
                      </button>
                    )}
                  </td>
                )}
                <td className={clsx(tdClass, "whitespace-nowrap")}>
                  {row.code ?? "-"}
                </td>
                <td className={tdClass}>{row.description}</td>
                {showBags && (
                  <td className={tdRightClass}>
                    {row.bags === null || row.bags === undefined
                      ? "-"
                      : formatBags(row.bags)}
                  </td>
                )}
                <td className={tdRightClass}>
                  {row.amount === null ? "-" : formatCurrency(row.amount)}
                </td>
              </tr>
              {isExpanded && line && (
                <tr>
                  <td colSpan={columnCount} className="pb-2">
                    <SourceMembers line={line} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};

/** Unit-cost rows table (amount + unit) with mapping drilldowns. */
const UnitCostRowTable: React.FC<DrilldownProps & { rows: UnitCostRow[] }> = ({
  rows,
  mappings,
  expandedLineIds,
  onToggleLine,
}) => (
  <table className="min-w-full">
    <thead>
      <tr className="border-b border-gray-200 dark:border-gray-700">
        <th className={clsx(thClass, "w-8")}></th>
        <th className={thClass}>Code</th>
        <th className={thClass}>Description</th>
        <th className={thRightClass}>Amount</th>
        <th className={thRightClass}>Unit</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
      {rows.map((row, index) => {
        const line = mappings.get(row.lineId);
        const hasSources = (line?.sources.length ?? 0) > 0;
        const isExpanded = expandedLineIds.has(row.lineId);
        return (
          <React.Fragment key={`${row.lineId}-${index}`}>
            <tr>
              <td className="py-1.5 pr-1 align-top">
                {hasSources && (
                  <button
                    type="button"
                    onClick={() => onToggleLine(row.lineId)}
                    className="rounded p-0.5 text-default-400 hover:bg-default-100 hover:text-default-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    aria-label={
                      isExpanded ? "Hide mapping sources" : "Show mapping sources"
                    }
                  >
                    {isExpanded ? (
                      <IconChevronDown size={16} />
                    ) : (
                      <IconChevronRight size={16} />
                    )}
                  </button>
                )}
              </td>
              <td className={clsx(tdClass, "whitespace-nowrap")}>
                {row.code ?? "-"}
              </td>
              <td className={tdClass}>{row.description}</td>
              <td className={tdRightClass}>{formatCurrency(row.amount)}</td>
              <td className={tdRightClass}>{formatUnit(row.unit)}</td>
            </tr>
            {isExpanded && line && (
              <tr>
                <td colSpan={5} className="pb-2">
                  <SourceMembers line={line} />
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </tbody>
  </table>
);

interface EstimatedReportPageProps {
  view: EstimatedReportView;
}

const EstimatedReportPage: React.FC<EstimatedReportPageProps> = ({ view }) => {
  const [report, setReport] = useState<EstimatedReportResponse | null>(null);
  const [mappings, setMappings] = useState<Map<number, MappingLine>>(
    new Map()
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // The MEE/BIHUN toggle persists per view so returning to the report keeps the
  // product line the user was reading.
  const [productLine, setProductLine] = usePersistedFilters<ProductLine>(
    `estimatedReportProductLine:${view}`,
    () => "mee",
    (cached) => (cached === "bihun" || cached === "mee" ? cached : null)
  );
  const [expandedLineIds, setExpandedLineIds] = useState<Set<number>>(
    new Set()
  );
  const [isMappingModalOpen, setIsMappingModalOpen] = useState<boolean>(false);
  const [addBackInput, setAddBackInput] = useState<string>("0");
  const [savingAddBack, setSavingAddBack] = useState<boolean>(false);
  // Which print action is running: a single product line, "all", or none.
  const [exporting, setExporting] = useState<PrintTarget | null>(null);

  // The selected month persists per view; the report has no data before
  // REPORT_MIN_MONTH, so both the default and a restored value are clamped.
  const [selectedMonth, setSelectedMonth] = usePersistedFilters<Date>(
    `estimatedReportMonth:${view}`,
    () => {
      const now = new Date();
      const current = new Date(now.getFullYear(), now.getMonth(), 1);
      return current < REPORT_MIN_MONTH ? new Date(REPORT_MIN_MONTH) : current;
    },
    (cached) => {
      const date = reviveDate(cached);
      if (!date) return null;
      const month = new Date(date.getFullYear(), date.getMonth(), 1);
      return month < REPORT_MIN_MONTH ? new Date(REPORT_MIN_MONTH) : month;
    }
  );

  const fetchReport = useCallback(async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    try {
      setLoading(true);
      setError(null);
      const response = await api.get<EstimatedReportResponse>(
        `/api/estimated-report?year=${year}&month=${month}`
      );
      setReport(response);
    } catch (err) {
      console.error("Error fetching estimated report:", err);
      setError(getErrorMessage(err, "Failed to fetch the estimated report."));
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  const fetchMappings = useCallback(async (): Promise<void> => {
    try {
      const lines = await api.get<MappingLine[]>(
        "/api/estimated-report/mappings"
      );
      setMappings(
        new Map((lines || []).map((line) => [Number(line.id), line]))
      );
    } catch (err) {
      // Non-fatal: the report still renders, rows just lose drilldowns.
      console.error("Error fetching estimated report mappings:", err);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  // The report is long; restore the reading position on return.
  useScrollRestoration(`estimated-report-${view}`, !loading && !!report);

  const lineReport = report?.reports?.[productLine] ?? null;

  // Prefill the Add Back input from the report for the selected line/month.
  useEffect(() => {
    setAddBackInput(lineReport ? String(lineReport.pl.addBack) : "0");
  }, [lineReport]);

  const handleMonthChange = (newMonth: Date): void => {
    setSelectedMonth(newMonth);
  };

  const handleToggleLine = (lineId: number): void => {
    setExpandedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  const handleSaveAddBack = async (): Promise<void> => {
    const parsed = Number(addBackInput);
    if (!Number.isFinite(parsed)) {
      toast.error("Add Back must be a number");
      return;
    }

    setSavingAddBack(true);
    try {
      await api.put("/api/estimated-report/add-back", {
        productLine,
        year: selectedMonth.getFullYear(),
        month: selectedMonth.getMonth() + 1,
        addBack: parsed,
      });
      toast.success("Add Back saved");
      await fetchReport();
    } catch (err) {
      console.error("Error saving add back:", err);
      toast.error(getErrorMessage(err, "Failed to save Add Back"));
    } finally {
      setSavingAddBack(false);
    }
  };

  const handleMappingComplete = (): void => {
    fetchReport();
    fetchMappings();
  };

  const handlePrintPDF = async (target: PrintTarget): Promise<void> => {
    if (!report) return;

    const lines: ProductLine[] =
      target === "all" ? ["mee", "bihun"] : [target];
    if (!lines.some((line) => report.reports[line])) {
      toast.error("No report data to print for this month.");
      return;
    }

    setExporting(target);
    try {
      await generateEstimatedReportPDF(report, view, lines);
    } catch (err) {
      console.error("Error printing PDF:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setExporting(null);
    }
  };

  if (loading && !report) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const drilldownProps: DrilldownProps = {
    mappings,
    expandedLineIds,
    onToggleLine: handleToggleLine,
  };

  return (
    <div className="w-full space-y-3">
      {/* Sticky band: the header controls and the summary strip stay visible
          while the (long) report body scrolls underneath. */}
      <div className="sticky top-0 z-30 -mx-4 -mt-3 space-y-2 border-b border-default-200 bg-white/95 px-4 pb-2 pt-3 backdrop-blur dark:border-gray-700 dark:bg-gray-950/95">
        {/* Header: product line + month on the left, actions on the right */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Product line switcher */}
            <div className="flex overflow-hidden rounded-md border border-default-300 dark:border-gray-600">
              {(["mee", "bihun"] as ProductLine[]).map((line) => (
                <button
                  key={line}
                  type="button"
                  onClick={() => setProductLine(line)}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-medium transition-colors",
                    productLine === line
                      ? "bg-sky-500 text-white"
                      : "bg-white text-default-600 hover:bg-default-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  )}
                >
                  {line.toUpperCase()}
                </button>
              ))}
            </div>

            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              minDate={REPORT_MIN_MONTH}
              size="sm"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={IconRefresh}
              iconSize={16}
              onClick={fetchReport}
              disabled={loading}
              title="Refresh"
              additionalClasses={loading ? "[&_svg]:animate-spin" : ""}
            />
            <Button
              size="sm"
              variant="outline"
              icon={IconAdjustments}
              iconSize={16}
              onClick={() => setIsMappingModalOpen(true)}
            >
              Mappings
            </Button>
            {/* Print the selected month: one product line, or both */}
            {(["mee", "bihun", "all"] as PrintTarget[]).map((target) => (
              <Button
                key={target}
                size="sm"
                variant={target === "all" ? "filled" : "outline"}
                color="sky"
                icon={IconPrinter}
                iconSize={16}
                onClick={() => handlePrintPDF(target)}
                disabled={
                  exporting !== null ||
                  !report ||
                  (target !== "all" && !report.reports[target])
                }
              >
                {exporting === target
                  ? "Preparing..."
                  : target === "all"
                  ? "Print All"
                  : `Print ${target.toUpperCase()}`}
              </Button>
            ))}
          </div>
        </div>

        {/* Compact summary strip */}
        {lineReport && (
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm px-0.5">
            <span className="font-medium text-default-700 dark:text-gray-200">
              {view === "pl" ? "Estimated P&L" : "Estimated Unit Cost"} —{" "}
              {productLine.toUpperCase()}
              <span className="ml-1.5 font-normal text-default-500 dark:text-gray-400">
                {lineReport.period.label}
              </span>
            </span>
            {view === "pl" ? (
              <>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  Sales{" "}
                  <span className="font-semibold text-default-700 dark:text-gray-200">
                    {formatCurrency(lineReport.pl.totals.amount)}
                  </span>
                </span>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  Usage{" "}
                  <span className="font-semibold text-default-700 dark:text-gray-200">
                    {formatCurrency(lineReport.pl.usage)}
                  </span>
                </span>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  P/L{" "}
                  <span
                    className={clsx(
                      "font-semibold",
                      signedAmountClass(lineReport.pl.profitLoss)
                    )}
                  >
                    {formatCurrency(lineReport.pl.profitLoss)}
                  </span>
                </span>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  Final P/L{" "}
                  <span
                    className={clsx(
                      "font-semibold",
                      signedAmountClass(lineReport.pl.finalProfitLoss)
                    )}
                  >
                    {formatCurrency(lineReport.pl.finalProfitLoss)}
                  </span>
                </span>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  Accumulative{" "}
                  <span
                    className={clsx(
                      "font-semibold",
                      signedAmountClass(lineReport.pl.accumulative)
                    )}
                  >
                    {formatCurrency(lineReport.pl.accumulative)}
                  </span>
                </span>
              </>
            ) : (
              <>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  Production{" "}
                  <span className="font-semibold text-default-700 dark:text-gray-200">
                    {formatBags(lineReport.unitCost.production.bags)} bags
                  </span>
                </span>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  Bags sold{" "}
                  <span className="font-semibold text-default-700 dark:text-gray-200">
                    {formatBags(lineReport.unitCost.bagsSold)}
                  </span>
                </span>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  Total{" "}
                  <span className="font-semibold text-default-700 dark:text-gray-200">
                    {formatCurrency(lineReport.unitCost.total.amount)}
                  </span>
                  <span className="ml-1 text-default-500 dark:text-gray-400">
                    ({formatUnit(lineReport.unitCost.total.unit)} / bag)
                  </span>
                </span>
                <StripDot />
                <span className="text-default-600 dark:text-gray-300">
                  Final unit cost{" "}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatUnit(lineReport.unitCost.finalUnitCost)} / bag
                  </span>
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Engine warnings */}
      {lineReport && lineReport.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <ul className="list-inside list-disc space-y-0.5 text-sm text-amber-800 dark:text-amber-300">
            {lineReport.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {!lineReport && !loading && !error && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-default-500 dark:text-gray-400">
          No report data for this month.
        </div>
      )}

      {/* ============================== Estimated P&L ============================== */}
      {lineReport && view === "pl" && (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <div className="space-y-5 p-4">
            {/* PRODUCT */}
            <div>
              <SectionTitle>Product</SectionTitle>
              <PLRowTable
                rows={lineReport.pl.products}
                showBags
                enableDrilldown={false}
                {...drilldownProps}
              />
              <TotalRow
                label={`Total Sales (${formatBags(lineReport.pl.totals.bags)} bags)`}
                value={formatCurrency(lineReport.pl.totals.amount)}
              />
            </div>

            {/* CLOSING STOCK */}
            <div>
              <SectionTitle>Closing Stock</SectionTitle>
              <PLRowTable
                rows={lineReport.pl.closingStock}
                showBags={false}
                enableDrilldown
                {...drilldownProps}
              />
              <TotalRow
                label="Total Closing Stock"
                value={formatCurrency(lineReport.pl.closingStockTotal)}
              />
              <InfoRow
                label="Closing Stock + Sales"
                value={formatCurrency(lineReport.pl.closingStockPlusSales)}
              />
            </div>

            {/* OPENING STOCK */}
            <div>
              <SectionTitle>Opening Stock</SectionTitle>
              <PLRowTable
                rows={lineReport.pl.openingStock}
                showBags={false}
                enableDrilldown
                {...drilldownProps}
              />
              <TotalRow
                label="Total Opening Stock"
                value={formatCurrency(lineReport.pl.openingStockTotal)}
              />
            </div>

            {/* PURCHASE + RETURNS */}
            <div>
              <SectionTitle>Purchase</SectionTitle>
              <PLRowTable
                rows={lineReport.pl.purchases}
                showBags={false}
                enableDrilldown
                {...drilldownProps}
              />
              <TotalRow
                label="Total Purchase"
                value={formatCurrency(lineReport.pl.purchaseTotal)}
              />

              {lineReport.pl.returns.length > 0 && (
                <div className="mt-3">
                  <SectionTitle>Returns</SectionTitle>
                  <PLRowTable
                    rows={lineReport.pl.returns}
                    showBags
                    enableDrilldown
                    {...drilldownProps}
                  />
                  <TotalRow
                    label="Total Returns"
                    value={formatCurrency(lineReport.pl.returnsTotal)}
                  />
                </div>
              )}

              <InfoRow
                label="Opening + Purchase + Returns"
                value={formatCurrency(
                  lineReport.pl.openingPlusPurchasesPlusReturns
                )}
              />
            </div>

            {/* USAGE */}
            <BandRow
              label="USAGE (Opening + Purchase + Returns - Closing)"
              value={formatCurrency(lineReport.pl.usage)}
            />

            {/* GROSS */}
            <div
              className={clsx(
                "flex items-center justify-between text-sm font-bold",
                signedAmountClass(lineReport.pl.gross)
              )}
            >
              <span>GROSS (Sales - Usage)</span>
              <span>{formatCurrency(lineReport.pl.gross)}</span>
            </div>

            {/* EXPENSES */}
            <div>
              <SectionTitle>Expenses</SectionTitle>
              <div className="space-y-0.5 pl-3">
                {EXPENSE_BREAKDOWN_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">
                      {label}
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency(lineReport.pl.expenseBreakdown[key])}
                    </span>
                  </div>
                ))}
              </div>
              <TotalRow
                label="Total Expenses"
                value={`(${formatCurrency(lineReport.pl.expenses)})`}
              />
              <p className="mt-1 text-xs text-default-400 dark:text-gray-500">
                Expense line detail is on the{" "}
                <Link
                  to="/stock/reports/estimated-unit-cost"
                  className="text-sky-600 dark:text-sky-400 hover:underline"
                >
                  Estimated Unit Cost
                </Link>{" "}
                page.
              </p>
            </div>

            {/* P/L */}
            <BandRow
              label="PROFIT / (LOSS)"
              value={
                <span className={signedAmountClass(lineReport.pl.profitLoss)}>
                  {formatCurrency(lineReport.pl.profitLoss)}
                </span>
              }
            />

            {/* ADD BACK */}
            <div className="rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <label
                    htmlFor="addBack"
                    className="text-sm font-bold text-gray-900 dark:text-white"
                  >
                    ADD BACK
                  </label>
                  <p className="mt-0.5 text-xs text-default-500 dark:text-gray-400">
                    Key the month's Add Back here — it raises Final P/L and
                    lowers the estimated unit cost.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32">
                    <FormInput
                      name="addBack"
                      label=""
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={addBackInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setAddBackInput(e.target.value)
                      }
                      disabled={savingAddBack}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    color="sky"
                    variant="filled"
                    onClick={handleSaveAddBack}
                    disabled={savingAddBack}
                  >
                    {savingAddBack ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>

            {/* FINAL P/L */}
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-gray-900 dark:text-white">
                FINAL PROFIT / (LOSS)
              </span>
              <span
                className={signedAmountClass(lineReport.pl.finalProfitLoss)}
              >
                {formatCurrency(lineReport.pl.finalProfitLoss)}
              </span>
            </div>

            {/* ACCUMULATIVE */}
            <BandRow
              accent
              label="ACCUMULATIVE P/L"
              value={
                <span className={signedAmountClass(lineReport.pl.accumulative)}>
                  RM {formatCurrency(lineReport.pl.accumulative)}
                </span>
              }
            />

            {lineReport.anchor && (
              <p className="text-xs text-default-400 dark:text-gray-500">
                Anchor {lineReport.anchor.asOfDate}: RM{" "}
                {formatCurrency(lineReport.anchor.accumulative)} ·{" "}
                {lineReport.monthlyTrail.length} month
                {lineReport.monthlyTrail.length === 1 ? "" : "s"} accumulated
                since.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ========================= Estimated Unit Cost ========================= */}
      {lineReport && view === "unitCost" && (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <div className="space-y-5 p-4">
            {/* Cost groups */}
            {lineReport.unitCost.groups.map((group) => (
              <div key={group.key}>
                <SectionTitle>
                  {UNIT_COST_GROUP_LABELS[group.key] ?? group.key}
                </SectionTitle>
                {group.rows.length === 0 ? (
                  <p className="text-sm text-default-400 dark:text-gray-500">
                    No mapped lines.
                  </p>
                ) : (
                  <UnitCostRowTable rows={group.rows} {...drilldownProps} />
                )}
                <TotalRow
                  label="Subtotal"
                  value={
                    <>
                      {formatCurrency(group.subtotal.amount)}
                      <span className="ml-3 font-normal text-default-500 dark:text-gray-400">
                        {formatUnit(group.subtotal.unit)}
                      </span>
                    </>
                  }
                />
              </div>
            ))}

            {/* TOTAL before repair */}
            <BandRow
              label="TOTAL"
              value={
                <>
                  {formatCurrency(lineReport.unitCost.totalBeforeRepair.amount)}
                  <span className="ml-3 text-sm font-normal text-default-500 dark:text-gray-400">
                    {formatUnit(lineReport.unitCost.totalBeforeRepair.unit)} /
                    bag
                  </span>
                </>
              }
            />

            {/* MACHINE REPAIR */}
            <div>
              <SectionTitle>Machine Repair</SectionTitle>
              {lineReport.unitCost.machineRepair.rows.length === 0 ? (
                <p className="text-sm text-default-400 dark:text-gray-500">
                  No mapped lines.
                </p>
              ) : (
                <UnitCostRowTable
                  rows={lineReport.unitCost.machineRepair.rows}
                  {...drilldownProps}
                />
              )}
              <TotalRow
                label="Total Machine Repair"
                value={
                  <>
                    {formatCurrency(lineReport.unitCost.machineRepair.amount)}
                    <span className="ml-3 font-normal text-default-500 dark:text-gray-400">
                      {formatUnit(lineReport.unitCost.machineRepair.unit)}
                    </span>
                  </>
                }
              />
            </div>

            {/* TOTAL incl. repair */}
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-gray-900 dark:text-white">
                TOTAL (incl. Machine Repair)
              </span>
              <span className="text-gray-900 dark:text-white">
                {formatCurrency(lineReport.unitCost.total.amount)}
                <span className="ml-3 text-sm font-normal text-default-500 dark:text-gray-400">
                  {formatUnit(lineReport.unitCost.total.unit)} / bag
                </span>
              </span>
            </div>

            {/* ADD BACK (read-only; keyed on the Estimated P&L page) */}
            <InfoRow
              label="ADD BACK (keyed on the Estimated P&L page)"
              value={
                <>
                  {formatCurrency(lineReport.unitCost.addBack.amount)}
                  <span className="ml-3 font-normal text-default-500 dark:text-gray-400">
                    {formatUnit(lineReport.unitCost.addBack.unit)} / bag
                  </span>
                </>
              }
            />

            {/* FINAL UNIT COST */}
            <BandRow
              accent
              label="FINAL ESTIMATED UNIT COST"
              value={`${formatUnit(lineReport.unitCost.finalUnitCost)} / bag`}
            />
          </div>
        </div>
      )}

      <EstimatedReportMappingModal
        isOpen={isMappingModalOpen}
        onClose={() => setIsMappingModalOpen(false)}
        onMappingComplete={handleMappingComplete}
      />
    </div>
  );
};

export default EstimatedReportPage;

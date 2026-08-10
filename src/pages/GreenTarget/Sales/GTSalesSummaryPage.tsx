import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { format, parse } from "date-fns";
import { useTranslation } from "react-i18next";
import LoadingSpinner from "../../../components/LoadingSpinner";
import TimeNavigator, {
  TimeRange,
} from "../../../components/TimeNavigator";
import {
  reviveDate,
  usePersistedFilters,
} from "../../../hooks/usePersistedFilters";
import { api } from "../../../routes/utils/api";
import {
  GreenTargetSalesReportLocation,
  GreenTargetSalesReportPayment,
  GreenTargetSalesReportResponse,
  GreenTargetSalesReportRow,
  GreenTargetSalesReportTotals,
} from "../../../types/greenTargetSalesReport";

type ReportTab = "debtor" | "details";
type CardTone = "sky" | "emerald" | "amber" | "slate";

interface SalesReportFilters {
  activeTab: ReportTab;
  dateRange: {
    start: Date;
    end: Date;
  };
}

interface SummaryCardProps {
  label: string;
  value: string;
  helper: string;
  tone: CardTone;
}

interface DebtorListingRow {
  key: string;
  invoice: GreenTargetSalesReportRow;
  runningBalance: number;
}

const FILTER_STORAGE_KEY = "gtSalesReport";

const EMPTY_TOTALS: GreenTargetSalesReportTotals = {
  total_sales: 0,
  total_paid: 0,
  total_outstanding: 0,
  invoice_count: 0,
  cancelled_count: 0,
};

const getDefaultFilters = (): SalesReportFilters => {
  const now: Date = new Date();
  const start: Date = new Date(now.getFullYear(), now.getMonth(), 1);
  const end: Date = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return {
    activeTab: "debtor",
    dateRange: { start, end },
  };
};

const reviveFilters = (cached: unknown): SalesReportFilters | null => {
  if (typeof cached !== "object" || cached === null) return null;
  const candidate: Partial<SalesReportFilters> = cached as Partial<SalesReportFilters>;
  const start: Date | null = reviveDate(candidate.dateRange?.start);
  const end: Date | null = reviveDate(candidate.dateRange?.end);
  if (!start || !end) return null;
  const activeTab: ReportTab =
    candidate.activeTab === "details" ? "details" : "debtor";
  return { activeTab, dateRange: { start, end } };
};

const isCancelledInvoice = (invoice: GreenTargetSalesReportRow): boolean =>
  invoice.status.trim().toLowerCase() === "cancelled";

const safeNumber = (value: number): number => {
  const parsed: number = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNumber(amount));

const formatAmount = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNumber(amount));

const formatDifference = (amount: number, emptyValue: string): string => {
  const normalized: number = safeNumber(amount);
  if (Math.abs(normalized) < 0.005) return emptyValue;
  return normalized < 0
    ? `(${formatAmount(Math.abs(normalized))})`
    : formatAmount(normalized);
};

const formatReportDate = (value: string, pattern: string): string => {
  const parsedDate: Date = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsedDate.getTime()) ? "" : format(parsedDate, pattern);
};

const getDateSortKey = (value: string): string => {
  const parsedDate: Date = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsedDate.getTime())
    ? ""
    : format(parsedDate, "yyyy-MM-dd");
};

const getLocale = (language: string): string => {
  if (language.toLowerCase().startsWith("ms")) return "ms-MY";
  if (language.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en-MY";
};

const isSameDay = (first: Date, second: Date): boolean =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

const isWholeMonth = (start: Date, end: Date): boolean =>
  start.getFullYear() === end.getFullYear() &&
  start.getMonth() === end.getMonth() &&
  start.getDate() === 1 &&
  end.getDate() ===
    new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();

const isWholeYear = (start: Date, end: Date): boolean =>
  start.getFullYear() === end.getFullYear() &&
  start.getMonth() === 0 &&
  start.getDate() === 1 &&
  end.getMonth() === 11 &&
  end.getDate() === 31;

const getPeriodLabel = (
  start: Date,
  end: Date,
  language: string
): string => {
  const locale: string = getLocale(language);
  if (isWholeYear(start, end)) {
    const monthFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(
      locale,
      { month: "short" }
    );
    return `${monthFormatter.format(start)} – ${monthFormatter.format(
      end
    )} ${start.getFullYear()}`;
  }
  if (isWholeMonth(start, end)) {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
    }).format(start);
  }
  if (isSameDay(start, end)) {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(start);
  }
  const dateFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
};

const getLocationLabel = (location: GreenTargetSalesReportLocation): string => {
  const site: string = location.site?.trim() || "";
  const address: string = location.address?.trim() || "";
  if (site && address && site !== address) return `${site} · ${address}`;
  return site || address;
};

const getPhoneNumbers = (invoice: GreenTargetSalesReportRow): string[] => {
  const numbers: string[] = [
    invoice.customer_phone_number || "",
    ...invoice.locations.map(
      (location: GreenTargetSalesReportLocation): string =>
        location.phone_number || ""
    ),
  ]
    .map((phoneNumber: string): string => phoneNumber.trim())
    .filter((phoneNumber: string): boolean => phoneNumber.length > 0);
  return Array.from(new Set<string>(numbers));
};

const getCustomerLabel = (invoice: GreenTargetSalesReportRow): string =>
  invoice.customer_name.trim() || invoice.legacy_particular?.trim() || "";

const usesLegacyParticular = (invoice: GreenTargetSalesReportRow): boolean =>
  invoice.customer_name.trim().length === 0 &&
  Boolean(invoice.legacy_particular?.trim());

const getPaymentMethodKey = (
  method: GreenTargetSalesReportPayment["payment_method"]
): string => {
  if (method === null) return "—";
  if (method === "bank_transfer") return "Bank transfer";
  if (method === "cash") return "Cash";
  if (method === "cheque") return "Cheque";
  return "Online";
};

const getInvoiceStatusKey = (invoice: GreenTargetSalesReportRow): string => {
  if (isCancelledInvoice(invoice)) return "Cancelled";
  if (safeNumber(invoice.balance_due) <= 0.005) return "Paid";
  if (safeNumber(invoice.amount_paid) > 0.005) {
    return "Partially paid";
  }
  return "Outstanding";
};

const getInvoiceMovement = (invoice: GreenTargetSalesReportRow): number => {
  if (isCancelledInvoice(invoice)) return 0;
  return safeNumber(invoice.balance_due);
};

const SummaryCard: React.FC<SummaryCardProps> = ({
  label,
  value,
  helper,
  tone,
}) => {
  const toneClasses: Record<CardTone, string> = {
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-300",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300",
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300",
  };

  return (
    <div className={`rounded-lg border p-3 ${toneClasses[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs opacity-75">{helper}</div>
    </div>
  );
};

const GTSalesSummaryPage: React.FC = () => {
  const { t, i18n } = useTranslation("sales");
  const [filters, setFilters] = usePersistedFilters<SalesReportFilters>(
    FILTER_STORAGE_KEY,
    getDefaultFilters,
    reviveFilters
  );
  const [report, setReport] = useState<GreenTargetSalesReportResponse | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const requestIdRef = useRef<number>(0);

  const startDate: string = format(filters.dateRange.start, "yyyy-MM-dd");
  const endDate: string = format(filters.dateRange.end, "yyyy-MM-dd");

  const fetchReport = useCallback(async (): Promise<void> => {
    const requestId: number = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(false);
    setReport(null);
    try {
      const response: GreenTargetSalesReportResponse =
        await api.get<GreenTargetSalesReportResponse>(
          `/greentarget/api/sales-report?start_date=${startDate}&end_date=${endDate}`
        );
      if (requestId === requestIdRef.current) setReport(response);
    } catch (fetchError: unknown) {
      console.error("Failed to load Green Target sales report:", fetchError);
      if (requestId === requestIdRef.current) {
        setReport(null);
        setError(true);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect((): void => {
    void fetchReport();
  }, [fetchReport]);

  const sortedInvoices = useMemo<GreenTargetSalesReportRow[]>(() => {
    const rows: GreenTargetSalesReportRow[] = report?.rows || [];
    return [...rows].sort(
      (
        firstInvoice: GreenTargetSalesReportRow,
        secondInvoice: GreenTargetSalesReportRow
      ): number => {
        const dateComparison: number = getDateSortKey(
          firstInvoice.date_issued
        ).localeCompare(getDateSortKey(secondInvoice.date_issued));
        if (dateComparison !== 0) return dateComparison;
        if (firstInvoice.invoice_id < 0 && secondInvoice.invoice_id < 0) {
          return (
            Math.abs(firstInvoice.invoice_id) -
            Math.abs(secondInvoice.invoice_id)
          );
        }
        if (firstInvoice.invoice_id < 0) return -1;
        if (secondInvoice.invoice_id < 0) return 1;
        return firstInvoice.invoice_id - secondInvoice.invoice_id;
      }
    );
  }, [report]);

  const listingRows = useMemo<DebtorListingRow[]>(() => {
    const rows: DebtorListingRow[] = [];
    let runningBalance: number = safeNumber(report?.opening_balance || 0);
    sortedInvoices.forEach((invoice: GreenTargetSalesReportRow): void => {
      runningBalance += getInvoiceMovement(invoice);
      rows.push({
        key: `invoice-${invoice.invoice_id}`,
        invoice,
        runningBalance,
      });
    });
    return rows;
  }, [report, sortedInvoices]);

  const totals: GreenTargetSalesReportTotals = report?.totals || EMPTY_TOTALS;
  const hasImportedRows: boolean = sortedInvoices.some(
    (invoice: GreenTargetSalesReportRow): boolean => invoice.invoice_id < 0
  );
  const periodLabel: string = getPeriodLabel(
    filters.dateRange.start,
    filters.dateRange.end,
    i18n.resolvedLanguage || i18n.language
  );
  const emptyValue: string = t("—");
  const activeAmountBeforeTax: number = sortedInvoices.reduce(
    (total: number, invoice: GreenTargetSalesReportRow): number =>
      isCancelledInvoice(invoice)
        ? total
        : total + safeNumber(invoice.amount_before_tax),
    0
  );
  const adjustmentTotal: number = sortedInvoices.reduce(
    (total: number, invoice: GreenTargetSalesReportRow): number =>
      isCancelledInvoice(invoice)
        ? total
        : total + safeNumber(invoice.adjustment_effect),
    0
  );
  const finalRunningBalance: number = listingRows.reduce(
    (latestBalance: number, row: DebtorListingRow): number => row.runningBalance,
    safeNumber(report?.opening_balance || 0)
  );

  const handleTimeChange = useCallback(
    (range: TimeRange): void => {
      setLoading(true);
      setError(false);
      setReport(null);
      setFilters((previous: SalesReportFilters): SalesReportFilters => ({
        ...previous,
        dateRange: { start: range.start, end: range.end },
      }));
    },
    [setFilters]
  );

  const handleTabChange = (activeTab: ReportTab): void => {
    setFilters((previous: SalesReportFilters): SalesReportFilters => ({
      ...previous,
      activeTab,
    }));
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 p-4 dark:border-gray-700 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-default-900 dark:text-gray-100 sm:text-2xl">
                GREEN TARGET WASTE TREATMENT IND. SDN BHD
              </h1>
              <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                {t("Listing debtor from {{period}}", { period: periodLabel })}
              </p>
            </div>
            <TimeNavigator
              range={filters.dateRange}
              onChange={handleTimeChange}
              modes={["day", "month", "range", "year"]}
              pickerPlacement="bottom-right"
              className="max-w-full"
            />
          </div>

          <div className="mt-4 flex rounded-lg bg-default-100 p-0.5 dark:bg-gray-700 sm:w-fit">
            <button
              type="button"
              onClick={(): void => handleTabChange("debtor")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
                filters.activeTab === "debtor"
                  ? "bg-white text-default-900 shadow-sm dark:bg-gray-600 dark:text-gray-100"
                  : "text-default-600 hover:text-default-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {t("Debtor Listing")}
            </button>
            <button
              type="button"
              onClick={(): void => handleTabChange("details")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
                filters.activeTab === "details"
                  ? "bg-white text-default-900 shadow-sm dark:bg-gray-600 dark:text-gray-100"
                  : "text-default-600 hover:text-default-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {t("Sales Details")}
            </button>
          </div>
        </div>

        {!loading && !error && report && (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          <SummaryCard
            label={t("Total Sales")}
            value={formatCurrency(totals.total_sales)}
            helper={t("{{count}} invoices in range", {
              count: totals.invoice_count,
            })}
            tone="sky"
          />
          <SummaryCard
            label={t("Paid")}
            value={formatCurrency(totals.total_paid)}
            helper={t("Received for selected sales")}
            tone="emerald"
          />
          <SummaryCard
            label={t("Outstanding")}
            value={formatCurrency(totals.total_outstanding)}
            helper={t("Remaining on selected sales")}
            tone="amber"
          />
          <SummaryCard
            label={t("Cancelled Invoices")}
            value={safeNumber(totals.cancelled_count).toLocaleString("en-MY")}
            helper={t("Shown but excluded from totals")}
            tone="slate"
          />
          </div>
        )}
      </section>

      {!loading && !error && report && !report.coverage.is_complete && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          {t(
            "Complete sales coverage starts from 1 January 2026. Earlier results only include records available in the ERP."
          )}
        </div>
      )}

      {!loading && !error && report && hasImportedRows && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-200">
          {t(
            "Some imported sales do not contain structured customer, location, phone or payment-method details. When no verified customer is available, the Customer column shows the legacy particular; other unavailable cells are shown as —."
          )}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-800/60 dark:bg-rose-950/30">
          <p className="font-medium text-rose-700 dark:text-rose-300">
            {t("Failed to load sales report. Please try again.")}
          </p>
          <button
            type="button"
            onClick={(): void => {
              void fetchReport();
            }}
            className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            {t("Retry")}
          </button>
        </div>
      ) : filters.activeTab === "debtor" ? (
        listingRows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center text-default-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {t("No sales were found for this period.")}
          </div>
        ) : (
          <section className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="max-h-[calc(100vh-12rem)] overflow-auto">
              <table className="min-w-[1540px] w-full border-separate border-spacing-0 text-xs text-default-800 dark:text-gray-200">
                <thead className="text-[11px] uppercase tracking-wide text-emerald-950 dark:text-emerald-100">
                  <tr>
                    {[
                      "Date",
                      "Customer",
                      "Location",
                      "Phone No.",
                      "Invoice No.",
                      "RM",
                      "Total",
                      "Payment / Cheque No.",
                      "Ref. No.",
                      "Date Paid",
                      "Paid (RM)",
                      "Balance (RM)",
                      "Diff.",
                    ].map((heading: string): React.ReactElement => (
                      <th
                        key={heading}
                        scope="col"
                        className="sticky top-0 z-10 border-b border-r border-gray-300 bg-emerald-50 px-2 py-2.5 text-left font-bold last:border-r-0 dark:border-gray-700 dark:bg-emerald-950"
                      >
                        {heading === "RM" ? heading : t(heading)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listingRows.map(
                    (listingRow: DebtorListingRow): React.ReactElement => {
                      const invoice: GreenTargetSalesReportRow =
                        listingRow.invoice;
                      const cancelled: boolean = isCancelledInvoice(invoice);
                      const customerLabel: string = getCustomerLabel(invoice);
                      const showingLegacyParticular: boolean =
                        usesLegacyParticular(invoice);
                      const paymentRows: GreenTargetSalesReportPayment[] =
                        invoice.payments || [];
                      const locations: GreenTargetSalesReportLocation[] =
                        invoice.locations || [];
                      const invoiceDifference: number = cancelled
                        ? 0
                        : -getInvoiceMovement(invoice);
                      return (
                        <tr
                          key={listingRow.key}
                          className={
                            cancelled
                              ? "bg-slate-100/80 text-default-500 dark:bg-gray-900/50 dark:text-gray-400"
                              : "hover:bg-emerald-50/40 dark:hover:bg-emerald-950/15"
                          }
                        >
                          <td className="whitespace-nowrap border-b border-r border-gray-200 px-2 py-2 align-top tabular-nums dark:border-gray-700">
                            {formatReportDate(invoice.date_issued, "dd.MM.yy") ||
                              emptyValue}
                          </td>
                          <td className="border-b border-r border-gray-200 px-2 py-2 align-top font-medium dark:border-gray-700">
                            {customerLabel || emptyValue}
                            {showingLegacyParticular && (
                              <div className="mt-0.5 text-[10px] font-normal uppercase tracking-wide text-default-500 dark:text-gray-400">
                                {t("Legacy particular")}
                              </div>
                            )}
                          </td>
                          <td className="border-b border-r border-gray-200 px-2 py-2 align-top dark:border-gray-700">
                            {locations.length > 0 ? (
                              <div className="space-y-1">
                                {locations.map(
                                  (
                                    location: GreenTargetSalesReportLocation,
                                    index: number
                                  ): React.ReactElement => (
                                    <div
                                      key={
                                        location.location_id ??
                                        `${listingRow.key}-location-${index}`
                                      }
                                      className="max-w-64"
                                    >
                                      {getLocationLabel(location) || emptyValue}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              emptyValue
                            )}
                          </td>
                          <td className="border-b border-r border-gray-200 px-2 py-2 align-top dark:border-gray-700">
                            {getPhoneNumbers(invoice).length > 0 ? (
                              <div className="space-y-1 whitespace-nowrap">
                                {getPhoneNumbers(invoice).map(
                                  (phoneNumber: string): React.ReactElement => (
                                    <div key={phoneNumber}>{phoneNumber}</div>
                                  )
                                )}
                              </div>
                            ) : (
                              emptyValue
                            )}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-gray-200 px-2 py-2 align-top font-semibold dark:border-gray-700">
                            <div className={cancelled ? "line-through" : ""}>
                              {invoice.invoice_number}
                            </div>
                            {cancelled && (
                              <span className="mt-1 inline-flex rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                {t("Cancelled")}
                              </span>
                            )}
                          </td>
                          <td className={`border-b border-r border-gray-200 px-2 py-2 text-right align-top tabular-nums dark:border-gray-700 ${cancelled ? "line-through" : ""}`}>
                            {formatAmount(invoice.amount_before_tax)}
                          </td>
                          <td className={`border-b border-r border-gray-200 px-2 py-2 text-right align-top font-semibold tabular-nums dark:border-gray-700 ${cancelled ? "line-through" : ""}`}>
                            <div>{formatAmount(invoice.total_amount)}</div>
                            {!cancelled &&
                              Math.abs(safeNumber(invoice.adjustment_effect)) >
                                0.005 && (
                                <div className="mt-0.5 whitespace-nowrap text-[10px] font-medium text-default-500 no-underline dark:text-gray-400">
                                  {t("Adjustments")}: {formatDifference(
                                    invoice.adjustment_effect,
                                    emptyValue
                                  )}
                                </div>
                              )}
                          </td>
                          <td className="border-b border-r border-gray-200 px-2 py-2 align-top dark:border-gray-700">
                            {paymentRows.length > 0 ? (
                              <div className="space-y-1.5">
                                {paymentRows.map(
                                  (payment: GreenTargetSalesReportPayment): React.ReactElement => (
                                    <div key={payment.payment_id}>
                                      <div className="font-semibold">
                                        {t(getPaymentMethodKey(payment.payment_method))}
                                      </div>
                                      {payment.payment_reference && (
                                        <div className="whitespace-nowrap text-[11px] text-default-500 dark:text-gray-400">
                                          {payment.payment_reference}
                                        </div>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              emptyValue
                            )}
                          </td>
                          <td className="border-b border-r border-gray-200 px-2 py-2 align-top dark:border-gray-700">
                            {paymentRows.length > 0 ? (
                              <div className="space-y-1.5 whitespace-nowrap">
                                {paymentRows.map(
                                  (payment: GreenTargetSalesReportPayment): React.ReactElement => (
                                    <div key={payment.payment_id}>
                                      {payment.internal_reference || emptyValue}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              emptyValue
                            )}
                          </td>
                          <td className="border-b border-r border-gray-200 px-2 py-2 align-top tabular-nums dark:border-gray-700">
                            {paymentRows.length > 0 ? (
                              <div className="space-y-1.5 whitespace-nowrap">
                                {paymentRows.map(
                                  (payment: GreenTargetSalesReportPayment): React.ReactElement => (
                                    <div key={payment.payment_id}>
                                      {payment.status === "pending"
                                        ? t("Pending")
                                        : formatReportDate(
                                            payment.posting_date ||
                                              payment.payment_date,
                                            "dd.MM.yy"
                                          ) || emptyValue}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              emptyValue
                            )}
                          </td>
                          <td className="border-b border-r border-gray-200 px-2 py-2 text-right align-top tabular-nums dark:border-gray-700">
                            {paymentRows.length > 0 ? (
                              <div className="space-y-1.5 whitespace-nowrap">
                                {paymentRows.map(
                                  (payment: GreenTargetSalesReportPayment): React.ReactElement => (
                                    <div key={payment.payment_id}>
                                      {payment.status === "pending"
                                        ? emptyValue
                                        : formatAmount(payment.amount_paid)}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : safeNumber(invoice.amount_paid) > 0 ? (
                              formatAmount(invoice.amount_paid)
                            ) : (
                              emptyValue
                            )}
                          </td>
                          <td className="border-b border-r border-gray-200 px-2 py-2 text-right align-top font-semibold tabular-nums dark:border-gray-700">
                            {formatAmount(listingRow.runningBalance)}
                          </td>
                          <td className="border-b border-gray-200 px-2 py-2 text-right align-top tabular-nums text-rose-600 dark:border-gray-700 dark:text-rose-300">
                            {formatDifference(invoiceDifference, emptyValue)}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
                <tfoot className="bg-emerald-50 font-bold text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
                  <tr>
                    <td
                      colSpan={5}
                      className="border-r border-t border-gray-300 px-2 py-2.5 uppercase tracking-wide dark:border-gray-700"
                    >
                      {t("Total sales for {{period}}", {
                        period: periodLabel,
                      })}
                    </td>
                    <td className="border-r border-t border-gray-300 px-2 py-2.5 text-right tabular-nums dark:border-gray-700">
                      {formatAmount(activeAmountBeforeTax)}
                    </td>
                    <td className="border-r border-t border-gray-300 px-2 py-2.5 text-right tabular-nums dark:border-gray-700">
                      {formatAmount(totals.total_sales)}
                    </td>
                    <td
                      colSpan={3}
                      className="border-r border-t border-gray-300 px-2 py-2.5 dark:border-gray-700"
                    />
                    <td className="border-r border-t border-gray-300 px-2 py-2.5 text-right tabular-nums dark:border-gray-700">
                      {formatAmount(totals.total_paid)}
                    </td>
                    <td className="border-r border-t border-gray-300 px-2 py-2.5 text-right tabular-nums dark:border-gray-700">
                      {formatAmount(finalRunningBalance)}
                    </td>
                    <td className="border-t border-gray-300 px-2 py-2.5 text-right tabular-nums text-rose-700 dark:border-gray-700 dark:text-rose-300">
                      {formatDifference(-safeNumber(totals.total_outstanding), emptyValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )
      ) : sortedInvoices.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center text-default-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          {t("No sales were found for this period.")}
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="max-h-[calc(100vh-12rem)] overflow-auto">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-default-600 dark:text-gray-300">
                <tr>
                  {[
                    "Date",
                    "Invoice",
                    "Customer",
                    "Location",
                    "Status",
                    "Sales",
                    "Adjustments",
                    "Paid",
                    "Outstanding",
                  ].map((heading: string): React.ReactElement => (
                    <th
                      key={heading}
                      scope="col"
                      className="sticky top-0 z-10 bg-default-100 px-4 py-3 text-left font-semibold dark:bg-gray-700"
                    >
                      {t(heading)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedInvoices.map(
                  (invoice: GreenTargetSalesReportRow): React.ReactElement => {
                    const cancelled: boolean = isCancelledInvoice(invoice);
                    const statusKey: string = getInvoiceStatusKey(invoice);
                    const customerLabel: string = getCustomerLabel(invoice);
                    const showingLegacyParticular: boolean =
                      usesLegacyParticular(invoice);
                    return (
                      <tr
                        key={invoice.invoice_id}
                        className={
                          cancelled
                            ? "bg-slate-50 text-default-500 dark:bg-gray-900/40 dark:text-gray-400"
                            : "text-default-800 hover:bg-default-50 dark:text-gray-200 dark:hover:bg-gray-700/40"
                        }
                      >
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {formatReportDate(invoice.date_issued, "dd.MM.yyyy") ||
                            emptyValue}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 font-semibold ${cancelled ? "line-through" : "text-sky-700 dark:text-sky-300"}`}>
                          {invoice.invoice_number}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {customerLabel || emptyValue}
                          {showingLegacyParticular && (
                            <div className="mt-0.5 text-[10px] font-normal uppercase tracking-wide text-default-500 dark:text-gray-400">
                              {t("Legacy particular")}
                            </div>
                          )}
                        </td>
                        <td className="max-w-80 px-4 py-3">
                          {invoice.locations.length > 0
                            ? invoice.locations
                                .map(
                                  (location: GreenTargetSalesReportLocation): string =>
                                    getLocationLabel(location)
                                )
                                .filter((label: string): boolean => label.length > 0)
                                .join(" · ") || emptyValue
                            : emptyValue}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                              statusKey === "Cancelled"
                                ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                : statusKey === "Paid"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : statusKey === "Partially paid"
                                ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            }`}
                          >
                            {t(statusKey)}
                          </span>
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${cancelled ? "line-through" : ""}`}>
                          {formatCurrency(invoice.total_amount)}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${cancelled ? "text-default-400 dark:text-gray-500" : safeNumber(invoice.adjustment_effect) < 0 ? "text-rose-600 dark:text-rose-300" : "text-default-600 dark:text-gray-300"}`}>
                          {formatCurrency(invoice.adjustment_effect)}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${cancelled ? "text-default-400 dark:text-gray-500" : "text-emerald-700 dark:text-emerald-300"}`}>
                          {formatCurrency(invoice.amount_paid)}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${cancelled ? "text-default-400 dark:text-gray-500" : "text-amber-700 dark:text-amber-300"}`}>
                          {formatCurrency(invoice.balance_due)}
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-default-50 font-bold text-default-900 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right">
                    {t("Total")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatCurrency(totals.total_sales)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatCurrency(adjustmentTotal)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(totals.total_paid)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-300">
                    {formatCurrency(totals.total_outstanding)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default GTSalesSummaryPage;

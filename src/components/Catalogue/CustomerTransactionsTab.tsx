// src/components/Catalogue/CustomerTransactionsTab.tsx
// Read-only unified transaction timeline for a single customer: merges invoices,
// payments, and adjustment documents (credit/debit/refund notes) into one
// chronological list, filterable by date. Fetching is lazy (only when this tab
// is opened) and the result is cached by the parent so toggling tabs within a
// page visit does not refetch.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  IconFileInvoice,
  IconCash,
  IconExternalLink,
  IconPrinter,
  IconDownload,
} from "@tabler/icons-react";
import { api } from "../../routes/utils/api";
import TimeNavigator, { TimeRange } from "../TimeNavigator";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "../AdjustmentDocs/AdjustmentDocBadge";
import { getAdjustmentDocsPaths } from "../AdjustmentDocs/useAdjustmentDocsPaths";
import { formatAdjustmentDocDisplayId } from "../../utils/adjustments/formatDocId";
import { parseDatabaseTimestamp, formatDisplayDate } from "../../utils/invoice/dateUtils";
import { generateTransactionHistoryPDF } from "../../utils/catalogue/TransactionHistoryPDF";
import LoadingSpinner from "../LoadingSpinner";
import { AdjustmentDocType, EInvoiceStatus } from "../../types/types";

// Human-readable labels for the PDF / exports.
const KIND_LABELS: Record<TxnKind, string> = {
  invoice: "Invoice",
  payment: "Payment",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  refund_note: "Refund Note",
};

// --- Public types (shared with the parent cache) ---
export type TxnKind = "invoice" | "payment" | AdjustmentDocType;
export type TxnPaymentType = "CASH" | "INVOICE";

export interface TxnRow {
  key: string;
  date: Date;
  kind: TxnKind;
  reference: string;
  navTo: string;
  relatedInvoice: string | null;
  amount: number;
  direction: "debit" | "credit";
  status: string | null;
  paymentType: TxnPaymentType | null;
  einvoiceStatus: EInvoiceStatus;
}

export interface TxnCache {
  fetchedKey: string;
  rows: TxnRow[];
}

interface CustomerTransactionsTabProps {
  customerId: string;
  customerName?: string;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  cache: TxnCache | null;
  onCacheChange: (cache: TxnCache) => void;
}

// Default range shown when the tab is first opened: the last 30 days.
export const getDefaultTransactionsRange = (): TimeRange => {
  const start = new Date();
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const rangeKey = (range: TimeRange): string =>
  `${range.start.getTime()}-${range.end.getTime()}`;

const fmtRM = (n: number): string =>
  (Number(n) || 0).toLocaleString("en-MY", {
    style: "currency",
    currency: "MYR",
  });

const ADJ_KINDS: TxnKind[] = ["credit_note", "debit_note", "refund_note"];
const isAdjustmentKind = (kind: TxnKind): kind is AdjustmentDocType =>
  ADJ_KINDS.includes(kind);

const PAYMENT_TYPE_OPTIONS: { value: TxnPaymentType; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "INVOICE", label: "Invoice" },
];

const STATUS_SORT_ORDER: string[] = [
  "paid",
  "active",
  "unpaid",
  "overdue",
  "overpaid",
  "pending",
  "cancelled",
];

const DEFAULT_SELECTED_STATUS_FILTERS: string[] = ["paid", "active"];

interface RawInvoiceTxn {
  id: string;
  createddate: string | number | null;
  totalamountpayable: number | string | null;
  invoice_status?: string | null;
  einvoice_status?: EInvoiceStatus;
  paymenttype?: string | null;
}

interface RawPaymentTxn {
  payment_id: number | string;
  invoice_id?: string | null;
  payment_date?: string | null;
  amount_paid: number | string | null;
  internal_reference?: string | null;
  payment_reference?: string | null;
  status?: string | null;
  paymenttype?: string | null;
}

interface RawAdjustmentTxn {
  id: string;
  display_id?: string | null;
  type: AdjustmentDocType;
  original_invoice_id?: string | null;
  createddate: string | number | null;
  totalamountpayable: number | string | null;
  status?: string | null;
  einvoice_status?: EInvoiceStatus;
  paymenttype?: string | null;
}

const toArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return (value as { data: T[] }).data;
  }
  return [];
};

const normalizePaymentType = (
  value: string | null | undefined
): TxnPaymentType | null => {
  const normalized = value?.toUpperCase();
  return normalized === "CASH" || normalized === "INVOICE"
    ? normalized
    : null;
};

const getStatusFilterValue = (status: string | null): string | null => {
  const trimmed = status?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

const formatStatusLabel = (status: string): string => {
  const knownLabels: Record<string, string> = {
    paid: "Paid",
    unpaid: "Unpaid",
    overdue: "Overdue",
    active: "Active",
    overpaid: "Overpaid",
    pending: "Pending",
    cancelled: "Cancelled",
  };
  const normalized = status.toLowerCase();
  return (
    knownLabels[normalized] ??
    status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char: string) => char.toUpperCase())
  );
};

const getStatusFilterActiveClass = (statusValue: string): string => {
  if (statusValue === "cancelled" || statusValue === "overdue") {
    return "border-rose-500 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300";
  }
  if (statusValue === "pending") {
    return "border-amber-500 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
  }
  if (
    statusValue === "paid" ||
    statusValue === "active" ||
    statusValue === "overpaid"
  ) {
    return "border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
  }
  return "border-sky-500 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300";
};

const paymentTypeLabel = (paymentType: TxnPaymentType | null): string =>
  paymentType === "CASH"
    ? "Cash"
    : paymentType === "INVOICE"
    ? "Invoice"
    : "-";

// Build the merged, date-sorted (newest first) row list from the three sources.
const buildRows = (
  invoicesRaw: unknown,
  adjustmentsRaw: unknown,
  paymentsRaw: unknown
): TxnRow[] => {
  const paths = getAdjustmentDocsPaths(); // Tien Hock by default
  const invoiceUiBase = paths.invoiceUiBase; // "/sales/invoice"

  const invoices = toArray<RawInvoiceTxn>(invoicesRaw);
  const adjustments = toArray<RawAdjustmentTxn>(adjustmentsRaw);
  const payments = toArray<RawPaymentTxn>(paymentsRaw);

  const rows: TxnRow[] = [];

  for (const inv of invoices) {
    const { date } = parseDatabaseTimestamp(inv.createddate);
    rows.push({
      key: `inv-${inv.id}`,
      date: date ?? new Date(0),
      kind: "invoice",
      reference: inv.id,
      navTo: `${invoiceUiBase}/${inv.id}`,
      relatedInvoice: null,
      amount: Number(inv.totalamountpayable) || 0,
      direction: "debit",
      status: inv.invoice_status ?? null,
      paymentType: normalizePaymentType(inv.paymenttype),
      einvoiceStatus: (inv.einvoice_status ?? null) as EInvoiceStatus,
    });
  }

  for (const pay of payments) {
    const d = pay.payment_date ? new Date(pay.payment_date) : new Date(0);
    rows.push({
      key: `pay-${pay.payment_id}`,
      date: isNaN(d.getTime()) ? new Date(0) : d,
      kind: "payment",
      reference:
        pay.internal_reference || pay.payment_reference || `Payment #${pay.payment_id}`,
      navTo: `${invoiceUiBase}/${pay.invoice_id}`,
      relatedInvoice: pay.invoice_id ?? null,
      amount: Number(pay.amount_paid) || 0,
      direction: "credit",
      status: pay.status ?? "active",
      paymentType: normalizePaymentType(pay.paymenttype),
      einvoiceStatus: null,
    });
  }

  for (const adj of adjustments) {
    const { date } = parseDatabaseTimestamp(adj.createddate);
    const type = adj.type as AdjustmentDocType;
    rows.push({
      key: `adj-${adj.id}`,
      date: date ?? new Date(0),
      kind: type,
      reference: formatAdjustmentDocDisplayId(adj),
      navTo: `${paths.uiBase}/${adj.id}`,
      relatedInvoice: adj.original_invoice_id ?? null,
      amount: Number(adj.totalamountpayable) || 0,
      // Debit notes increase what the customer owes; credit/refund notes reduce it.
      direction: type === "debit_note" ? "debit" : "credit",
      status: adj.status ?? "active",
      paymentType: normalizePaymentType(adj.paymenttype),
      einvoiceStatus: (adj.einvoice_status ?? null) as EInvoiceStatus,
    });
  }

  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  return rows;
};

// Small status pill for invoice/payment rows (adjustments use their own badge).
const StatusPill: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) {
    return <span className="text-default-400 dark:text-gray-500">-</span>;
  }
  const s = status.toLowerCase();
  const color =
    s === "paid" || s === "active" || s === "overpaid"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : s === "cancelled"
      ? "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
      : s === "overdue"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
      : s === "pending"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${color}`}
    >
      {status}
    </span>
  );
};

const TypeCell: React.FC<{ row: TxnRow }> = ({ row }) => {
  if (isAdjustmentKind(row.kind)) {
    return <AdjustmentDocTypeBadge type={row.kind} />;
  }
  if (row.kind === "invoice") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
        <IconFileInvoice size={12} />
        Invoice
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
      <IconCash size={12} />
      Payment
    </span>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: string;
  accent?: string;
}> = ({ label, value, accent }) => (
  <div className="flex-1 min-w-[150px] p-4 border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
    <p className="text-xs font-medium text-default-500 dark:text-gray-400 mb-1">
      {label}
    </p>
    <p className={`text-lg font-semibold ${accent ?? "text-default-900 dark:text-gray-100"}`}>
      {value}
    </p>
  </div>
);

const CustomerTransactionsTab: React.FC<CustomerTransactionsTabProps> = ({
  customerId,
  customerName,
  range,
  onRangeChange,
  cache,
  onCacheChange,
}) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    () => [...DEFAULT_SELECTED_STATUS_FILTERS]
  );
  const [selectedPaymentTypes, setSelectedPaymentTypes] = useState<
    TxnPaymentType[]
  >([]);

  const currentKey = rangeKey(range);
  const customerTransactionsPath = `/catalogue/customer/${customerId}?tab=transactions`;

  useEffect(() => {
    // Cache hit for the current range → no fetch (covers tab re-opens).
    if (cache && cache.fetchedKey === currentKey) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const startMs = range.start.getTime();
        const endMs = range.end.getTime();
        const cid = encodeURIComponent(customerId);
        const res = await api.get(
          `/api/customers/${cid}/transactions?startDate=${startMs}&endDate=${endMs}`
        );
        if (cancelled) return;
        const rows = buildRows(res?.invoices, res?.adjustments, res?.payments);
        onCacheChange({ fetchedKey: currentKey, rows });
      } catch (err: unknown) {
        if (!cancelled) {
          const apiError = err as {
            response?: { data?: { message?: string } };
            message?: string;
          };
          setError(
            apiError.response?.data?.message ||
              apiError.message ||
              "Failed to load transaction history."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, currentKey]);

  // Rows to display: the cached set for the current range (stale rows from a
  // previous range stay visible behind the loading overlay during a refetch).
  const rows = cache?.rows ?? [];
  const showingCurrent = cache?.fetchedKey === currentKey;

  const statusOptions = useMemo(() => {
    const labelsByValue = new Map<string, string>();
    for (const status of DEFAULT_SELECTED_STATUS_FILTERS) {
      labelsByValue.set(status, formatStatusLabel(status));
    }
    for (const row of rows) {
      const value = getStatusFilterValue(row.status);
      if (!value || labelsByValue.has(value)) continue;
      labelsByValue.set(value, formatStatusLabel(row.status ?? value));
    }

    return Array.from(labelsByValue.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => {
        const aIndex = STATUS_SORT_ORDER.indexOf(a.value);
        const bIndex = STATUS_SORT_ORDER.indexOf(b.value);
        if (aIndex !== -1 || bIndex !== -1) {
          return (
            (aIndex === -1 ? 999 : aIndex) -
            (bIndex === -1 ? 999 : bIndex)
          );
        }
        return a.label.localeCompare(b.label);
      });
  }, [rows]);

  useEffect(() => {
    const availableStatuses = new Set(
      statusOptions.map((option) => option.value)
    );
    setSelectedStatuses((previous) => {
      const next = previous.filter((value) => availableStatuses.has(value));
      return next.length === previous.length ? previous : next;
    });
  }, [statusOptions]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const rowStatus = getStatusFilterValue(row.status);
        const matchesStatus =
          selectedStatuses.length === 0 ||
          (rowStatus !== null && selectedStatuses.includes(rowStatus));
        const matchesPaymentType =
          selectedPaymentTypes.length === 0 ||
          (row.paymentType !== null &&
            selectedPaymentTypes.includes(row.paymentType));
        return matchesStatus && matchesPaymentType;
      }),
    [rows, selectedPaymentTypes, selectedStatuses]
  );

  const summary = useMemo(() => {
    let invoiced = 0;
    let paid = 0;
    let adjustments = 0;
    for (const r of filteredRows) {
      if (r.kind === "invoice") invoiced += r.amount;
      else if (r.kind === "payment") {
        if (r.status !== "cancelled") paid += r.amount;
      } else adjustments += 1;
    }
    return { invoiced, paid, adjustments };
  }, [filteredRows]);

  const toggleStatus = (value: string): void => {
    setSelectedStatuses((previous) =>
      previous.includes(value)
        ? previous.filter((status) => status !== value)
        : [...previous, value]
    );
  };

  const togglePaymentType = (value: TxnPaymentType): void => {
    setSelectedPaymentTypes((previous) =>
      previous.includes(value)
        ? previous.filter((paymentType) => paymentType !== value)
        : [...previous, value]
    );
  };

  const handleRowClick = (row: TxnRow): void => {
    if (row.kind === "invoice" || row.kind === "payment") {
      navigate(row.navTo, {
        state: {
          previousPath: customerTransactionsPath,
          fromCustomerTransactions: true,
        },
      });
      return;
    }
    navigate(row.navTo);
  };

  const handleExport = async (action: "print" | "download") => {
    if (filteredRows.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      await generateTransactionHistoryPDF(
        {
          customer: { id: customerId, name: customerName ?? "" },
          periodLabel: `${formatDisplayDate(range.start)} - ${formatDisplayDate(
            range.end
          )}`,
          rows: filteredRows.map((r) => ({
            date: formatDisplayDate(r.date),
            typeLabel: KIND_LABELS[r.kind],
            reference: r.reference,
            relatedInvoice: r.relatedInvoice,
            amount: r.amount,
            direction: r.direction,
            status: r.status,
          })),
          summary,
        },
        action
      );
    } catch (err) {
      console.error("Error generating transaction history PDF:", err);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const canExport = showingCurrent && filteredRows.length > 0;

  return (
    <div className="space-y-5 mt-5">
      {/* Header: filter + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-medium text-default-700 dark:text-gray-200">
          Transaction History
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {statusOptions.map((status) => {
            const active = selectedStatuses.includes(status.value);
            return (
              <button
                key={status.value}
                type="button"
                onClick={() => toggleStatus(status.value)}
                aria-pressed={active}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors select-none ${
                  active
                    ? getStatusFilterActiveClass(status.value)
                    : "border-default-300 dark:border-gray-600 text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
                }`}
              >
                {status.label}
              </button>
            );
          })}

          {statusOptions.length > 0 && (
            <span className="h-5 w-px bg-default-300 dark:bg-gray-600 mx-1" />
          )}

          {PAYMENT_TYPE_OPTIONS.map((option) => {
            const active = selectedPaymentTypes.includes(option.value);
            const activeClass =
              option.value === "CASH"
                ? "border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                : "border-sky-500 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300";
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => togglePaymentType(option.value)}
                aria-pressed={active}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors select-none ${
                  active
                    ? activeClass
                    : "border-default-300 dark:border-gray-600 text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
                }`}
              >
                {option.label}
              </button>
            );
          })}

          <span className="h-5 w-px bg-default-300 dark:bg-gray-600 mx-1" />

          <button
            type="button"
            onClick={() => handleExport("print")}
            disabled={!canExport || isExporting}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-default-300 dark:border-gray-600 text-sm font-medium text-default-700 dark:text-gray-200 bg-default-50 dark:bg-gray-900/50 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Print transaction history"
          >
            <IconPrinter size={16} />
            Print
          </button>
          <button
            type="button"
            onClick={() => handleExport("download")}
            disabled={!canExport || isExporting}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-default-300 dark:border-gray-600 text-sm font-medium text-default-700 dark:text-gray-200 bg-default-50 dark:bg-gray-900/50 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download transaction history as PDF"
          >
            <IconDownload size={16} />
            PDF
          </button>
          <TimeNavigator
            range={range}
            onChange={(r) => onRangeChange(r)}
            modes={["month", "range", "year"]}
            size="sm"
          />
        </div>
      </div>

      {/* Summary cards */}
      {showingCurrent && (
        <div className="flex flex-wrap gap-3">
          <SummaryCard label="Total Invoiced" value={fmtRM(summary.invoiced)} />
          <SummaryCard
            label="Total Paid"
            value={fmtRM(summary.paid)}
            accent="text-emerald-600 dark:text-emerald-400"
          />
          <SummaryCard
            label="Adjustments"
            value={String(summary.adjustments)}
          />
        </div>
      )}

      {/* Body */}
      <div className="relative border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm flex items-center justify-center z-10">
            <LoadingSpinner hideText />
          </div>
        )}

        {error ? (
          <div className="p-6 text-center text-rose-600 dark:text-rose-400">
            {error}
          </div>
        ) : !isLoading && showingCurrent && rows.length === 0 ? (
          <div className="p-10 text-center text-default-500 dark:text-gray-400">
            No transactions found for this period.
          </div>
        ) : !isLoading && showingCurrent && filteredRows.length === 0 ? (
          <div className="p-10 text-center text-default-500 dark:text-gray-400">
            No transactions match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  {[
                    "Date",
                    "Type",
                    "Reference",
                    "Related Invoice",
                    "Payment Type",
                    "Amount",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-semibold text-default-500 dark:text-gray-400 uppercase tracking-wider ${
                        h === "Amount" ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700/50">
                {filteredRows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => handleRowClick(row)}
                    className="group cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
                    title="View details"
                  >
                    <td className="px-4 py-3 text-sm text-default-700 dark:text-gray-300 whitespace-nowrap">
                      {formatDisplayDate(row.date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <TypeCell row={row} />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-default-900 dark:text-gray-100 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {row.reference}
                        <IconExternalLink
                          size={14}
                          className="text-default-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-default-500 dark:text-gray-400 whitespace-nowrap">
                      {row.relatedInvoice ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-600 dark:text-gray-300 whitespace-nowrap">
                      {paymentTypeLabel(row.paymentType)}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${
                        row.direction === "credit"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {row.direction === "credit" ? "-" : "+"}
                      {fmtRM(row.amount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isAdjustmentKind(row.kind) ? (
                        <AdjustmentDocStatusBadge
                          status={
                            row.status === "cancelled" ? "cancelled" : "active"
                          }
                          einvoiceStatus={row.einvoiceStatus ?? undefined}
                        />
                      ) : (
                        <StatusPill status={row.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerTransactionsTab;

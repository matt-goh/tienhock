// src/components/Catalogue/CustomerTransactionsTab.tsx
// Read-only unified transaction timeline for a single customer: merges invoices,
// payments, and adjustment documents (credit/debit/refund notes) into one
// chronological list, filterable by date. Fetching is lazy (only when this tab
// is opened) and the result is cached by the parent so toggling tabs within a
// page visit does not refetch.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconFileInvoice,
  IconCash,
  IconExternalLink,
} from "@tabler/icons-react";
import { api } from "../../routes/utils/api";
import TimeNavigator, { TimeRange } from "../TimeNavigator";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "../AdjustmentDocs/AdjustmentDocBadge";
import { getAdjustmentDocsPaths } from "../AdjustmentDocs/useAdjustmentDocsPaths";
import { formatAdjustmentDocId } from "../../utils/adjustments/formatDocId";
import { parseDatabaseTimestamp, formatDisplayDate } from "../../utils/invoice/dateUtils";
import LoadingSpinner from "../LoadingSpinner";
import { AdjustmentDocType, EInvoiceStatus } from "../../types/types";

// --- Public types (shared with the parent cache) ---
export type TxnKind = "invoice" | "payment" | AdjustmentDocType;

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
  einvoiceStatus: EInvoiceStatus;
}

export interface TxnCache {
  fetchedKey: string;
  rows: TxnRow[];
}

interface CustomerTransactionsTabProps {
  customerId: string;
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

// Build the merged, date-sorted (newest first) row list from the three sources.
const buildRows = (
  invoicesRaw: any,
  adjustmentsRaw: any,
  paymentsRaw: any
): TxnRow[] => {
  const paths = getAdjustmentDocsPaths(); // Tien Hock by default
  const invoiceUiBase = paths.invoiceUiBase; // "/sales/invoice"

  const invoices: any[] = Array.isArray(invoicesRaw)
    ? invoicesRaw
    : invoicesRaw?.data ?? [];
  const adjustments: any[] = Array.isArray(adjustmentsRaw) ? adjustmentsRaw : [];
  const payments: any[] = Array.isArray(paymentsRaw) ? paymentsRaw : [];

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
      reference: formatAdjustmentDocId(adj.id),
      navTo: `${paths.uiBase}/${adj.id}`,
      relatedInvoice: adj.original_invoice_id ?? null,
      amount: Number(adj.totalamountpayable) || 0,
      // Debit notes increase what the customer owes; credit/refund notes reduce it.
      direction: type === "debit_note" ? "debit" : "credit",
      status: adj.status ?? "active",
      einvoiceStatus: (adj.einvoice_status ?? null) as EInvoiceStatus,
    });
  }

  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  return rows;
};

// Small status pill for invoice/payment rows (adjustments use their own badge).
const StatusPill: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) return <span className="text-default-400 dark:text-gray-500">—</span>;
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
  range,
  onRangeChange,
  cache,
  onCacheChange,
}) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentKey = rangeKey(range);

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
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              err?.message ||
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

  const summary = useMemo(() => {
    let invoiced = 0;
    let paid = 0;
    let adjustments = 0;
    for (const r of rows) {
      if (r.kind === "invoice") invoiced += r.amount;
      else if (r.kind === "payment") {
        if (r.status !== "cancelled") paid += r.amount;
      } else adjustments += 1;
    }
    return { invoiced, paid, adjustments };
  }, [rows]);

  return (
    <div className="space-y-5 mt-5">
      {/* Header: filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-medium text-default-700 dark:text-gray-200">
          Transaction History
        </h3>
        <TimeNavigator
          range={range}
          onChange={(r) => onRangeChange(r)}
          modes={["month", "range", "year"]}
          size="sm"
        />
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
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  {["Date", "Type", "Reference", "Related Invoice", "Amount", "Status"].map(
                    (h) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-xs font-semibold text-default-500 dark:text-gray-400 uppercase tracking-wider ${
                          h === "Amount" ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700/50">
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => navigate(row.navTo)}
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
                      {row.relatedInvoice ?? "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${
                        row.direction === "credit"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {row.direction === "credit" ? "−" : "+"}
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

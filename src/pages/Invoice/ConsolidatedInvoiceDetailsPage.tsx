// src/pages/Invoice/ConsolidatedInvoiceDetailsPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  IconAlertTriangle,
  IconBan,
  IconChevronRight,
  IconCircleCheck,
  IconClockHour4,
  IconExternalLink,
  IconFileInvoice,
  IconLayoutList,
  IconPrinter,
  IconSearch,
  IconStack2,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import PrintPDFOverlay from "../../utils/invoice/PDF/PrintPDFOverlay";
import { api } from "../../routes/utils/api";
import { getInvoicesByIds } from "../../utils/invoice/InvoiceUtils";
import { ExtendedInvoiceData } from "../../types/types";
import {
  formatDisplayDate,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";
import { roundMoney, sumMoneyBy } from "../../utils/moneyUtils";
import { createConsolidatedReceiptGroups } from "../../utils/invoice/einvoice/consolidatedReceiptGrouping";
import { calculateSourceInvoiceAmounts } from "../../services/einvoice-pdf.service";

const INVOICE_FETCH_BATCH_SIZE: number = 50;

type ViewMode = "grouped" | "date";

interface ConsolidatedHeader {
  id: string;
  uuid: string | null;
  long_id: string | null;
  submission_uid: string | null;
  datetime_validated: string | null;
  einvoice_status: string;
  total_excluding_tax: number;
  tax_amount: number;
  rounding: number;
  totalamountpayable: number;
  created_at: string;
  consolidated_invoices: string[];
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

// Consolidated ids are CON-YYYYMM (optionally suffixed, e.g. CON-202606-AUTO).
const getYearFromConsolidatedId = (id: string): number | null => {
  const year = Number.parseInt(id.substring(4, 8), 10);
  return Number.isFinite(year) ? year : null;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status?.toLowerCase();
  let color = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  let icon = <IconAlertTriangle size={14} className="mr-1.5" />;
  let text = status
    ? status.charAt(0).toUpperCase() + status.slice(1)
    : "Unknown";

  switch (normalized) {
    case "valid":
      color =
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      icon = <IconCircleCheck size={14} className="mr-1.5" />;
      text = "Valid";
      break;
    case "pending":
    case "inprogress":
      color =
        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      icon = <IconClockHour4 size={14} className="mr-1.5" />;
      text = "Pending";
      break;
    case "invalid":
    case "rejected":
      color =
        "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
      icon = <IconAlertTriangle size={14} className="mr-1.5" />;
      text = "Invalid";
      break;
    case "cancelled":
      color = "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
      icon = <IconBan size={14} className="mr-1.5" />;
      text = "Cancelled";
      break;
    default:
      break;
  }

  return (
    <span
      className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium ${color}`}
    >
      {icon}
      {text}
    </span>
  );
};

const ConsolidatedInvoiceDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [header, setHeader] = useState<ConsolidatedHeader | null>(null);
  const [invoices, setInvoices] = useState<ExtendedInvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showPrintOverlay, setShowPrintOverlay] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>("date");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (): Promise<void> => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const year = getYearFromConsolidatedId(id);
      setLoadingStep("Loading consolidated e-Invoice...");
      const response = await api.get(
        `/api/einvoice/consolidated-history${year ? `?year=${year}` : ""}`
      );
      const history: ConsolidatedHeader[] = response?.data || response || [];
      const match = history.find((item) => item.id === id);

      if (!match) {
        setError(`Consolidated e-Invoice ${id} was not found.`);
        setHeader(null);
        setInvoices([]);
        return;
      }

      setHeader(match);

      const invoiceIds = match.consolidated_invoices || [];
      if (invoiceIds.length === 0) {
        setInvoices([]);
        return;
      }

      // The batch endpoint caps at 100 ids per request, so page through them.
      const loaded: ExtendedInvoiceData[] = [];
      for (
        let index = 0;
        index < invoiceIds.length;
        index += INVOICE_FETCH_BATCH_SIZE
      ) {
        const batchIds = invoiceIds.slice(
          index,
          index + INVOICE_FETCH_BATCH_SIZE
        );
        setLoadingStep(
          `Loading invoices (${index + batchIds.length}/${invoiceIds.length})...`
        );
        const batch = await getInvoicesByIds(batchIds);
        loaded.push(...batch);
      }

      // Keep the submitted order so the on-screen list matches the summary.
      const orderById = new Map(invoiceIds.map((invoiceId, i) => [invoiceId, i]));
      loaded.sort(
        (a, b) =>
          (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0)
      );
      setInvoices(loaded);
    } catch (err: any) {
      console.error("Error loading consolidated e-Invoice:", err);
      setError(err.message || "Failed to load consolidated e-Invoice");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const customerNames = useMemo<Record<string, string>>(
    () =>
      invoices.reduce((acc: Record<string, string>, invoice) => {
        if (invoice.customerid) {
          acc[invoice.customerid] = invoice.customerName || invoice.customerid;
        }
        return acc;
      }, {}),
    [invoices]
  );

  const matchesSearch = useCallback(
    (invoice: ExtendedInvoiceData, term: string): boolean =>
      invoice.id.toLowerCase().includes(term) ||
      (invoice.customerName || invoice.customerid || "")
        .toLowerCase()
        .includes(term),
    []
  );

  // "By Date" view: the flat chronological list.
  const dateSortedInvoices = useMemo<ExtendedInvoiceData[]>(
    () =>
      [...invoices].sort(
        (a, b) =>
          Number.parseInt(a.createddate, 10) -
          Number.parseInt(b.createddate, 10)
      ),
    [invoices]
  );

  const filteredInvoices = useMemo<ExtendedInvoiceData[]>(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return dateSortedInvoices;
    return dateSortedInvoices.filter((invoice) => matchesSearch(invoice, term));
  }, [dateSortedInvoices, searchTerm, matchesSearch]);

  // "By Receipt Range" view: the exact grouping submitted to LHDN, so each row
  // here is one printed line on the consolidated e-Invoice.
  const receiptGroups = useMemo(
    () =>
      createConsolidatedReceiptGroups<ExtendedInvoiceData>(
        invoices,
        calculateSourceInvoiceAmounts
      ),
    [invoices]
  );

  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return receiptGroups;
    return receiptGroups
      .map((group) => ({
        ...group,
        invoices: group.description.toLowerCase().includes(term)
          ? group.invoices
          : group.invoices.filter((invoice) => matchesSearch(invoice, term)),
      }))
      .filter((group) => group.invoices.length > 0);
  }, [receiptGroups, searchTerm, matchesSearch]);

  // While searching, surface the matches instead of making the user expand.
  const isSearching: boolean = searchTerm.trim().length > 0;

  const isGroupExpanded = (description: string): boolean =>
    isSearching || expandedGroups.has(description);

  const toggleGroup = (description: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(description)) {
        next.delete(description);
      } else {
        next.add(description);
      }
      return next;
    });
  };

  const allExpanded: boolean =
    filteredGroups.length > 0 &&
    filteredGroups.every((group) => expandedGroups.has(group.description));

  const toggleAllGroups = (): void => {
    setExpandedGroups(
      allExpanded
        ? new Set()
        : new Set(filteredGroups.map((group) => group.description))
    );
  };

  const invoicesTotal = useMemo<number>(
    () =>
      roundMoney(
        sumMoneyBy(invoices, (invoice) => invoice.totalamountpayable || 0)
      ),
    [invoices]
  );

  const missingCount: number =
    (header?.consolidated_invoices?.length || 0) - invoices.length;
  const difference: number = header
    ? roundMoney(invoicesTotal - header.totalamountpayable)
    : 0;
  const isReconciled: boolean = difference === 0 && missingCount === 0;

  // Only a validated document is shareable on the portal.
  const myInvoisUrl: string | null =
    header &&
    header.einvoice_status?.toLowerCase() === "valid" &&
    header.uuid &&
    header.long_id
      ? `https://myinvois.hasil.gov.my/${header.uuid}/share/${header.long_id}`
      : null;

  // This page is only reachable from the consolidation modal, so send the user
  // back to it rather than to a bare invoice list.
  const handleBackClick = (): void => {
    navigate("/sales/invoice", { state: { openConsolidatedModal: true } });
  };

  const handlePrintAll = (): void => {
    if (invoices.length === 0) {
      toast.error("No invoices available to print");
      return;
    }
    setShowPrintOverlay(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <LoadingSpinner />
        <p className="text-sm text-default-500 dark:text-gray-400">
          {loadingStep}
        </p>
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="w-full">
        <BackButton onClick={handleBackClick} />
        <div className="p-4 text-center text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 rounded-lg mt-4">
          {error || "Consolidated e-Invoice could not be loaded."}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BackButton onClick={handleBackClick} className="flex-shrink-0" />
          <div className="self-stretch w-px bg-default-200 dark:bg-gray-700" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100 flex items-center gap-2.5">
              <IconFileInvoice
                size={24}
                className="text-sky-600 dark:text-sky-400 flex-shrink-0"
              />
              <span className="truncate">{header.id}</span>
            </h1>
            <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
              Consolidated e-Invoice covering{" "}
              {header.consolidated_invoices?.length || 0} invoices
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={header.einvoice_status} />
          <Button
            onClick={handlePrintAll}
            variant="outline"
            size="sm"
            icon={IconPrinter}
            disabled={invoices.length === 0}
            title="Print a copy of every invoice in this consolidation"
          >
            Print All Invoices ({invoices.length})
          </Button>
        </div>
      </div>

      {/* Summary card */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
        <div>
          <div className="text-xs text-default-500 dark:text-gray-400 uppercase tracking-wider">
            Total Excluding Tax
          </div>
          <div className="text-sm font-medium text-default-900 dark:text-gray-100 mt-1">
            {formatCurrency(header.total_excluding_tax)}
          </div>
        </div>
        <div>
          <div className="text-xs text-default-500 dark:text-gray-400 uppercase tracking-wider">
            Tax
          </div>
          <div className="text-sm font-medium text-default-900 dark:text-gray-100 mt-1">
            {formatCurrency(header.tax_amount)}
          </div>
        </div>
        <div>
          <div className="text-xs text-default-500 dark:text-gray-400 uppercase tracking-wider">
            Total Payable
          </div>
          <div className="text-sm font-semibold text-default-900 dark:text-gray-100 mt-1">
            {formatCurrency(header.totalamountpayable)}
          </div>
        </div>
        <div>
          <div className="text-xs text-default-500 dark:text-gray-400 uppercase tracking-wider">
            Validated
          </div>
          <div className="text-sm font-medium text-default-900 dark:text-gray-100 mt-1">
            {header.datetime_validated
              ? formatDisplayDate(new Date(header.datetime_validated))
              : "—"}
          </div>
        </div>
        {header.uuid && (
          <div className="sm:col-span-2 lg:col-span-4 border-t border-default-100 dark:border-gray-700 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-default-500 dark:text-gray-400 uppercase tracking-wider">
                MyInvois UUID
              </div>
              {myInvoisUrl && (
                <a
                  href={myInvoisUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
                  title="Open this consolidated e-Invoice on the MyInvois portal"
                >
                  <IconExternalLink size={14} />
                  View on MyInvois portal
                </a>
              )}
            </div>
            <div className="text-xs font-mono text-default-700 dark:text-gray-300 mt-1 break-all">
              {header.uuid}
              {header.long_id && (
                <span className="block text-default-400 dark:text-gray-500 mt-0.5">
                  {header.long_id}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reconciliation */}
      <div
        className={`mt-4 rounded-lg border p-4 text-sm ${
          isReconciled
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          {isReconciled ? (
            <IconCircleCheck size={18} />
          ) : (
            <IconAlertTriangle size={18} />
          )}
          {isReconciled
            ? "Invoices reconcile with the consolidated total"
            : "Invoices do not reconcile with the consolidated total"}
        </div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div>
            Sum of listed invoices:{" "}
            <span className="font-semibold">
              {formatCurrency(invoicesTotal)}
            </span>
          </div>
          <div>
            Consolidated total:{" "}
            <span className="font-semibold">
              {formatCurrency(header.totalamountpayable)}
            </span>
          </div>
          <div>
            Difference:{" "}
            <span className="font-semibold">{formatCurrency(difference)}</span>
          </div>
        </div>
        {missingCount > 0 && (
          <div className="mt-2 text-xs">
            {missingCount} invoice{missingCount === 1 ? "" : "s"} listed in the
            consolidation could not be loaded (they may have been deleted).
          </div>
        )}
      </div>

      {/* Invoice list */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-default-800 dark:text-gray-100">
              Included Invoices
            </h2>
            {/* View switcher */}
            <div className="flex space-x-1 w-fit bg-default-100 dark:bg-gray-900/50 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setViewMode("date")}
                className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition-colors duration-150 ${
                  viewMode === "date"
                    ? "bg-white dark:bg-gray-700 shadow-sm text-sky-700 dark:text-sky-400 font-semibold"
                    : "text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-200"
                }`}
              >
                <IconLayoutList size={16} />
                By Date
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition-colors duration-150 ${
                  viewMode === "grouped"
                    ? "bg-white dark:bg-gray-700 shadow-sm text-sky-700 dark:text-sky-400 font-semibold"
                    : "text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-200"
                }`}
              >
                <IconStack2 size={16} />
                By Receipt Range
              </button>
            </div>
            {viewMode === "grouped" && filteredGroups.length > 0 && (
              <button
                type="button"
                onClick={toggleAllGroups}
                disabled={isSearching}
                className="text-sm text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                title={
                  isSearching
                    ? "Groups are expanded automatically while searching"
                    : undefined
                }
              >
                {allExpanded ? "Collapse all" : "Expand all"}
              </button>
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <IconSearch
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoice no. or customer"
              className="pl-9 pr-3 py-1.5 w-full text-sm rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>

        {viewMode === "grouped" && (
          <>
            <p className="text-xs text-default-500 dark:text-gray-400 mb-2">
              Each row below is one printed line on the submitted consolidated
              e-Invoice. Expand a row to see the invoices it covers.
            </p>
            <div className="border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                      Receipt Range
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                      Invoices
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                      Subtotal
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                      Tax
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                      Total (MYR)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                  {filteredGroups.map((group) => {
                    const expanded = isGroupExpanded(group.description);
                    return (
                      <React.Fragment key={group.description}>
                        <tr
                          onClick={() => toggleGroup(group.description)}
                          className="cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
                          aria-expanded={expanded}
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                            <div className="flex items-center gap-2">
                              <IconChevronRight
                                size={16}
                                className={`text-default-400 dark:text-gray-500 transition-transform duration-150 ${
                                  expanded ? "rotate-90" : ""
                                }`}
                              />
                              <span className="font-mono">
                                {group.description}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-default-600 dark:text-gray-400">
                            {group.invoices.length}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-default-600 dark:text-gray-400">
                            {formatCurrency(group.amounts.subtotal)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-default-600 dark:text-gray-400">
                            {formatCurrency(group.amounts.tax)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-default-800 dark:text-gray-200">
                            {formatCurrency(group.amounts.total)}
                          </td>
                        </tr>
                        {expanded &&
                          group.invoices.map((invoice) => {
                            const { date } = parseDatabaseTimestamp(
                              invoice.createddate
                            );
                            return (
                              <tr
                                key={`${group.description}-${invoice.id}`}
                                onClick={() =>
                                  navigate(`/sales/invoice/${invoice.id}`)
                                }
                                className="cursor-pointer bg-default-50/50 dark:bg-gray-900/30 hover:bg-default-100 dark:hover:bg-gray-700/50 transition-colors duration-150"
                                title={`Open invoice ${invoice.id}`}
                              >
                                <td className="pl-12 pr-4 py-2.5 whitespace-nowrap text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline">
                                  {invoice.id}
                                </td>
                                <td
                                  className="px-4 py-2.5 text-sm text-default-700 dark:text-gray-200"
                                  colSpan={2}
                                >
                                  {invoice.customerName || invoice.customerid}
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-default-500 dark:text-gray-400">
                                  {date ? formatDisplayDate(date) : "—"}
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-default-700 dark:text-gray-300">
                                  {formatCurrency(invoice.totalamountpayable)}
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
                  {filteredGroups.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                      >
                        No invoices match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {viewMode === "date" && (
        <div className="border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                  Amount (MYR)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-100 dark:divide-gray-700">
              {filteredInvoices.map((invoice) => {
                const { date } = parseDatabaseTimestamp(invoice.createddate);
                return (
                  <tr
                    key={invoice.id}
                    onClick={() => navigate(`/sales/invoice/${invoice.id}`)}
                    className="cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
                    title={`Open invoice ${invoice.id}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline">
                      {invoice.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                      {invoice.customerName || invoice.customerid}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600 dark:text-gray-400">
                      {date ? formatDisplayDate(date) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600 dark:text-gray-400">
                      {invoice.paymenttype === "CASH" ? "Cash" : "Invoice"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-default-800 dark:text-gray-200">
                      {formatCurrency(invoice.totalamountpayable)}
                    </td>
                  </tr>
                );
              })}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                  >
                    No invoices match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {showPrintOverlay && invoices.length > 0 && (
        <PrintPDFOverlay
          invoices={invoices}
          customerNames={customerNames}
          onComplete={() => setShowPrintOverlay(false)}
        />
      )}
    </div>
  );
};

export default ConsolidatedInvoiceDetailsPage;

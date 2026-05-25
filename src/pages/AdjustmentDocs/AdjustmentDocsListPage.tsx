// src/pages/AdjustmentDocs/AdjustmentDocsListPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconFileText,
  IconSearch,
  IconRefresh,
  IconFileMinus,
  IconFilePlus,
  IconRotate2,
  IconLayoutGrid,
  IconSend,
  IconSquareMinusFilled,
  IconSquare,
  IconSquareCheckFilled,
  IconPrinter,
  IconDownload,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import MonthNavigator from "../../components/MonthNavigator";
import StyledListbox from "../../components/StyledListbox";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import {
  AdjustmentDocument,
  AdjustmentDocType,
} from "../../types/types";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "../../components/AdjustmentDocs/AdjustmentDocBadge";
import {
  AdjustmentDocsCompany,
  getAdjustmentDocsPaths,
} from "../../components/AdjustmentDocs/useAdjustmentDocsPaths";
import { parseDatabaseTimestamp, formatDisplayDate } from "../../utils/invoice/dateUtils";
import AdjustmentDocPrintOverlay from "../../utils/adjustments/PDF/AdjustmentDocPrintOverlay";
import { generateAdjustmentDocPDFFilename } from "../../utils/adjustments/PDF/generateAdjustmentDocPDFFilename";
import { generateAdjustmentDocPDFBlob } from "../../utils/adjustments/PDF/AdjustmentDocPDFHandler";

interface FilterState {
  type: AdjustmentDocType | "all";
  dateRange: { start: Date | null; end: Date | null };
  einvoiceStatus: string | null;
  status: string | null;
  searchTerm: string;
}

const TYPE_TABS: Array<{ id: FilterState["type"]; label: string; icon: any }> = [
  { id: "all", label: "All", icon: IconLayoutGrid },
  { id: "debit_note", label: "DN", icon: IconFilePlus },
  { id: "credit_note", label: "CN", icon: IconFileMinus },
  { id: "refund_note", label: "RN", icon: IconRotate2 },
];

interface Props {
  company?: AdjustmentDocsCompany;
}

const AdjustmentDocsListPage: React.FC<Props> = ({ company = "tienhock" }) => {
  const navigate = useNavigate();
  const paths = getAdjustmentDocsPaths(company);
  const [docs, setDocs] = useState<AdjustmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchPrintDocs, setBatchPrintDocs] = useState<
    AdjustmentDocument[] | null
  >(null);

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [filters, setFilters] = useState<FilterState>(() => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    );
    end.setHours(23, 59, 59, 999);
    return {
      type: "all",
      dateRange: { start, end },
      einvoiceStatus: null,
      status: "active",
      searchTerm: "",
    };
  });

  const {
    dateRange: filterDateRange,
    einvoiceStatus: filterEinvoiceStatus,
    status: filterStatus,
    searchTerm: filterSearchTerm,
  } = filters;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDateRange.start) {
        params.append("startDate", filterDateRange.start.getTime().toString());
      }
      if (filterDateRange.end) {
        const end = new Date(filterDateRange.end);
        end.setHours(23, 59, 59, 999);
        params.append("endDate", end.getTime().toString());
      }
      if (filterEinvoiceStatus) {
        params.append("einvoice_status", filterEinvoiceStatus);
      }
      if (filterStatus) params.append("status", filterStatus);
      if (filterSearchTerm) params.append("search", filterSearchTerm);
      params.append("include_cancelled", "true");

      const response = await api.get(`${paths.apiBase}?${params.toString()}`);
      setDocs(Array.isArray(response) ? response : []);
    } catch (error: any) {
      console.error("Error fetching adjustment documents:", error);
      toast.error("Failed to fetch adjustment documents");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [
    filterDateRange,
    filterEinvoiceStatus,
    filterStatus,
    filterSearchTerm,
    paths.apiBase,
  ]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const displayedDocs = useMemo(() => {
    if (filters.type === "all") return docs;
    return docs.filter((d) => d.type === filters.type);
  }, [docs, filters.type]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    filterDateRange,
    filterEinvoiceStatus,
    filterStatus,
    filterSearchTerm,
    filters.type,
  ]);

  const isEligibleForSubmit = useCallback(
    (doc: AdjustmentDocument): boolean =>
      doc.status === "active" &&
      doc.einvoice_status !== "valid" &&
      doc.einvoice_status !== "pending" &&
      doc.einvoice_status !== "cancelled",
    []
  );

  const eligibleSelectedDocs = useMemo(
    () => docs.filter((d) => selectedIds.has(d.id) && isEligibleForSubmit(d)),
    [docs, selectedIds, isEligibleForSubmit]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size > 0) return new Set();
      return new Set(displayedDocs.map((d) => d.id));
    });
  }, [displayedDocs]);

  const selectAllState = useMemo(() => {
    if (displayedDocs.length === 0) return "none" as const;
    const selectedInView = displayedDocs.filter((d) =>
      selectedIds.has(d.id)
    ).length;
    if (selectedInView === 0) return "none" as const;
    if (selectedInView >= displayedDocs.length) return "all" as const;
    return "some" as const;
  }, [displayedDocs, selectedIds]);

  const handleBatchSubmit = useCallback(async () => {
    setShowSubmitDialog(false);
    const targets = eligibleSelectedDocs;
    if (targets.length === 0) return;
    setIsSubmitting(true);
    const toastId = toast.loading(
      `Submitting ${targets.length} document(s) to MyInvois...`
    );
    let success = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const d = targets[i];
      toast.loading(
        `Submitting ${i + 1}/${targets.length}: ${d.id}...`,
        { id: toastId }
      );
      try {
        await api.post(`${paths.apiBase}/${d.id}/submit-einvoice`);
        success++;
      } catch (err: any) {
        failed++;
        console.error(`Failed to submit ${d.id}:`, err);
      }
    }
    if (failed === 0) {
      toast.success(`Submitted ${success} document(s) successfully`, {
        id: toastId,
      });
    } else if (success === 0) {
      toast.error(`All ${failed} submission(s) failed`, {
        id: toastId,
        duration: 6000,
      });
    } else {
      toast.success(
        `${success} submitted, ${failed} failed — check each document for details`,
        { id: toastId, duration: 6000 }
      );
    }
    setIsSubmitting(false);
    setSelectedIds(new Set());
    fetchDocs();
  }, [eligibleSelectedDocs, paths.apiBase, fetchDocs]);

  const fetchSelectedDocsWithLines = useCallback(
    async (ids: string[]): Promise<AdjustmentDocument[]> => {
      return Promise.all(
        ids.map((id) =>
          api.get(`${paths.apiBase}/${id}`) as Promise<AdjustmentDocument>
        )
      );
    },
    [paths.apiBase]
  );

  const handleBatchDownload = useCallback(async () => {
    if (selectedIds.size === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    const ids = Array.from(selectedIds);
    const toastId = toast.loading(
      `Loading ${ids.length} document${ids.length === 1 ? "" : "s"}...`
    );
    try {
      const fullDocs = await fetchSelectedDocsWithLines(ids);
      toast.loading("Generating PDF...", { id: toastId });
      const isJellyPolly =
        typeof window !== "undefined" &&
        window.location.pathname.includes("/jellypolly");
      const companyContext = isJellyPolly ? "jellypolly" : "tienhock";
      const pdfBlob = await generateAdjustmentDocPDFBlob(
        fullDocs,
        companyContext
      );
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = generateAdjustmentDocPDFFilename(fullDocs, companyContext);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pdfUrl);
      toast.success("PDF downloaded successfully", { id: toastId });
    } catch (error) {
      toast.error(
        `Failed to generate PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: toastId }
      );
    } finally {
      setIsBatchProcessing(false);
    }
  }, [selectedIds, isBatchProcessing, fetchSelectedDocsWithLines]);

  const handleBatchPrint = useCallback(async () => {
    if (selectedIds.size === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    const ids = Array.from(selectedIds);
    const toastId = toast.loading(
      `Loading ${ids.length} document${ids.length === 1 ? "" : "s"}...`
    );
    try {
      const fullDocs = await fetchSelectedDocsWithLines(ids);
      toast.dismiss(toastId);
      setBatchPrintDocs(fullDocs);
    } catch (error) {
      toast.error(
        `Failed to load documents: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: toastId }
      );
    } finally {
      setIsBatchProcessing(false);
    }
  }, [selectedIds, isBatchProcessing, fetchSelectedDocsWithLines]);

  const handleMonthChange = useCallback((newDate: Date) => {
    setSelectedMonth(newDate);
    const startDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);
    setFilters((prev) => ({
      ...prev,
      dateRange: { start: startDate, end: endDate },
    }));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: docs.length };
    docs.forEach((d) => {
      c[d.type] = (c[d.type] || 0) + 1;
    });
    return c;
  }, [docs]);

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <IconFileText size={28} className="text-gray-700 dark:text-gray-200" />
            Adjustment Docs
          </h1>
          <span className="hidden sm:inline text-default-300 dark:text-gray-600 text-2xl font-light">
            |
          </span>
          <div className="flex gap-1 bg-default-100 dark:bg-gray-900/50 rounded-lg p-1">
            {TYPE_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = filters.type === tab.id;
              const count = counts[tab.id] || 0;
              return (
                <button
                  key={tab.id}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, type: tab.id }))
                  }
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors duration-150 flex items-center gap-1.5 ${
                    active
                      ? "bg-white dark:bg-gray-700 shadow-sm text-sky-700 dark:text-sky-400 font-semibold"
                      : "text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-200"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                        active
                          ? "bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300"
                          : "bg-default-200 dark:bg-gray-700 text-default-700 dark:text-gray-300"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate(`${paths.uiBase}/new?type=debit`)}
            icon={IconFilePlus}
            variant="outline"
            size="md"
          >
            New Debit Note
          </Button>
          <Button
            onClick={() => navigate(`${paths.uiBase}/new?type=credit`)}
            icon={IconFileMinus}
            variant="outline"
            size="md"
          >
            New Credit Note
          </Button>
          <Button
            onClick={() => navigate(`${paths.uiBase}/new?type=refund`)}
            icon={IconRotate2}
            variant="outline"
            size="md"
            title="Issue a standalone Refund Note (rare — normally use Credit Note with paired refund)"
          >
            New Refund Note
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 flex-shrink-0">
        {/* Left: Date controls */}
        <div className="flex flex-wrap items-center gap-3">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            showGoToCurrentButton={false}
            dateRange={{
              start: filters.dateRange.start || new Date(),
              end: filters.dateRange.end || new Date(),
            }}
          />
        </div>

        {/* Right: Search and filters */}
        <div className="flex flex-wrap items-center gap-2 h-10">
          <div className="relative w-full sm:w-48 h-10">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400 dark:text-gray-500 pointer-events-none"
              size={16}
            />
            <input
              type="text"
              placeholder="Search"
              className="w-full h-10 pl-9 pr-3 bg-white dark:bg-gray-900/50 border border-default-300 dark:border-gray-600 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-sm text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-500"
              value={filters.searchTerm}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))
              }
            />
          </div>

          <div className="w-full sm:w-40 h-10">
            <StyledListbox
              value={filters.einvoiceStatus || ""}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  einvoiceStatus: value === "" ? null : String(value),
                }))
              }
              options={[
                { id: "", name: "All e-Status" },
                { id: "null", name: "Not Submitted" },
                { id: "pending", name: "Pending" },
                { id: "valid", name: "Valid" },
                { id: "invalid", name: "Invalid" },
                { id: "cancelled", name: "Cancelled" },
              ]}
              placeholder="All e-Status"
              rounded="lg"
              className="h-10"
            />
          </div>

          <div className="w-full sm:w-32 h-10">
            <StyledListbox
              value={filters.status || ""}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  status: value === "" ? null : String(value),
                }))
              }
              options={[
                { id: "", name: "All" },
                { id: "active", name: "Active" },
                { id: "cancelled", name: "Cancelled" },
              ]}
              placeholder="All"
              rounded="lg"
              className="h-10"
            />
          </div>

          <Button
            onClick={fetchDocs}
            icon={IconRefresh}
            variant="outline"
            size="md"
            disabled={loading}
          >
            Refresh
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button
                onClick={handleBatchPrint}
                icon={IconPrinter}
                variant="outline"
                size="md"
                disabled={isBatchProcessing || loading}
                title="Print selected documents"
              >
                {isBatchProcessing ? "Loading..." : `Print (${selectedIds.size})`}
              </Button>
              <Button
                onClick={handleBatchDownload}
                icon={IconDownload}
                variant="outline"
                size="md"
                disabled={isBatchProcessing || loading}
                title="Download a single PDF with selected documents"
              >
                {isBatchProcessing
                  ? "Loading..."
                  : `Download (${selectedIds.size})`}
              </Button>
              <Button
                onClick={() => {
                  if (eligibleSelectedDocs.length === 0) {
                    toast.error(
                      "None of the selected documents are eligible for e-invoice submission (need active + not valid/pending/cancelled)."
                    );
                    return;
                  }
                  setShowSubmitDialog(true);
                }}
                icon={IconSend}
                variant="outline"
                color="sky"
                size="md"
                disabled={isSubmitting || loading || isBatchProcessing}
                title="Submit selected documents to MyInvois"
              >
                {isSubmitting
                  ? "Submitting..."
                  : `Submit e-Invoice (${eligibleSelectedDocs.length})`}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      ) : displayedDocs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-12 text-center">
          <IconFileText
            size={40}
            className="text-default-300 dark:text-gray-600 mx-auto mb-3"
          />
          <p className="text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
            No adjustment documents found
          </p>
          <p className="text-xs text-default-500 dark:text-gray-400">
            Try changing your filters, or create one from an invoice's details
            page.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-3 py-2.5 align-middle w-10">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="inline-flex items-center justify-center p-0.5 rounded hover:bg-default-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500 align-middle"
                      title={
                        selectAllState === "all"
                          ? "Deselect all"
                          : selectAllState === "some"
                          ? "Clear selection"
                          : "Select all"
                      }
                    >
                      {selectAllState === "all" ? (
                        <IconSquareCheckFilled
                          size={20}
                          className="text-sky-600 dark:text-sky-400"
                        />
                      ) : selectAllState === "some" ? (
                        <IconSquareMinusFilled
                          size={20}
                          className="text-sky-600 dark:text-sky-400"
                        />
                      ) : (
                        <IconSquare
                          size={20}
                          className="text-default-400 dark:text-gray-500"
                        />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Document ID
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Original Invoice
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
                {displayedDocs.map((doc) => {
                  const { date } = parseDatabaseTimestamp(doc.createddate);
                  const isSelected = selectedIds.has(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`hover:bg-default-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150 ${
                        isSelected ? "bg-sky-50/60 dark:bg-sky-900/20" : ""
                      }`}
                      onClick={() => navigate(`${paths.uiBase}/${doc.id}`)}
                    >
                      <td
                        className="px-3 py-3 align-middle w-10 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(doc.id);
                        }}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center justify-center p-0.5 rounded hover:bg-default-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500 align-middle"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(doc.id);
                          }}
                          aria-label={isSelected ? "Deselect" : "Select"}
                        >
                          {isSelected ? (
                            <IconSquareCheckFilled
                              size={20}
                              className="text-sky-600 dark:text-sky-400"
                            />
                          ) : (
                            <IconSquare
                              size={20}
                              className="text-default-400 dark:text-gray-500"
                            />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                        {doc.id}
                        {doc.paired_doc_id && (
                          <span
                            className="block text-xs text-default-500 dark:text-gray-400"
                            title={`Paired with ${doc.paired_doc_id}`}
                          >
                            ↔ {doc.paired_doc_id}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <AdjustmentDocTypeBadge type={doc.type} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 dark:text-gray-200">
                        {doc.original_invoice_id}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 dark:text-gray-200">
                        {doc.customer_name || doc.customerid}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-default-700 dark:text-gray-200">
                        {formatCurrency(doc.totalamountpayable)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <AdjustmentDocStatusBadge
                          status={doc.status}
                          einvoiceStatus={doc.einvoice_status}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                        {date ? formatDisplayDate(date) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showSubmitDialog}
        onClose={() => {
          if (!isSubmitting) setShowSubmitDialog(false);
        }}
        onConfirm={handleBatchSubmit}
        title={`Submit ${eligibleSelectedDocs.length} document(s) to MyInvois`}
        message={
          eligibleSelectedDocs.length === selectedIds.size
            ? `You are about to submit ${eligibleSelectedDocs.length} document(s) to MyInvois. Continue?`
            : `${eligibleSelectedDocs.length} of ${selectedIds.size} selected document(s) are eligible. The rest will be skipped. Continue?`
        }
        confirmButtonText={isSubmitting ? "Submitting..." : "Submit"}
        variant="default"
      />

      {batchPrintDocs && (
        <AdjustmentDocPrintOverlay
          docs={batchPrintDocs}
          onComplete={() => setBatchPrintDocs(null)}
        />
      )}
    </div>
  );
};

export default AdjustmentDocsListPage;

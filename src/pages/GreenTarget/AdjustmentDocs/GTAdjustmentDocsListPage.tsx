// src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsListPage.tsx
// Phase 7 — Green Target Adjustment Documents list. Forked from the TH
// AdjustmentDocsListPage because GT field names diverge (date_issued vs
// createddate, total_amount vs totalamountpayable, original_invoice_number vs
// original_invoice_id). Standalone Refund Notes are out of scope for GT —
// RN is only ever issued via the CN form's paired-refund toggle, so the
// "New Refund Note" action button is omitted.
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
  IconDownload,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import TimeNavigator from "../../../components/TimeNavigator";
import StyledListbox from "../../../components/StyledListbox";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import type {
  AdjustmentDocType,
  AdjustmentDocument,
  EInvoiceStatus,
} from "../../../types/types";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "../../../components/AdjustmentDocs/AdjustmentDocBadge";
import { generateGTAdjustmentDocPDFFilename } from "../../../utils/greenTarget/PDF/AdjustmentDocs/generateGTAdjustmentDocPDFFilename";
import { generateGTAdjustmentDocPDFBlob } from "../../../utils/greenTarget/PDF/AdjustmentDocs/GTAdjustmentDocPDFHandler";
import { GTAdjustmentDocFull } from "../../../services/gt-adjustment-doc-pdf.service";
import { formatAdjustmentDocId } from "../../../utils/adjustments/formatDocId";

const API_BASE = "/greentarget/api/adjustment-docs";
const UI_BASE = "/greentarget/adjustment-docs";

interface GTAdjDoc {
  id: string;
  type: AdjustmentDocType;
  original_invoice_id: number;
  original_invoice_number: string;
  original_invoice_einvoice_status: EInvoiceStatus;
  customer_id: number | null;
  customer_name: string | null;
  joined_customer_name?: string | null;
  date_issued: string;
  reason: string | null;
  paired_with_id: string | null;
  paired_doc_id?: string | null;
  paired_type?: AdjustmentDocType | null;
  paired_status?: AdjustmentDocument["status"] | null;
  amount_before_tax: number;
  tax_amount: number;
  total_amount: number;
  refund_method: string | null;
  uuid: string | null;
  einvoice_status: EInvoiceStatus;
  is_consolidated: boolean;
  status: AdjustmentDocument["status"];
  created_at: string;
}

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

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // `s` may be a bare yyyy-MM-dd or a full UTC ISO string from a `date` column;
  // let Date parse it and read it in local time (CLAUDE.md rule 17). Slicing the
  // first 10 chars off the ISO form would keep the UTC (previous) day.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDisplay(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB"); // DD/MM/YYYY
}

const GTAdjustmentDocsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<GTAdjDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadRow = useCallback(
    async (id: string) => {
      if (downloadingId) return;
      setDownloadingId(id);
      const toastId = toast.loading("Generating PDF...");
      try {
        const fullDoc = (await api.get(
          `${API_BASE}/${id}`
        )) as GTAdjustmentDocFull;
        const docs = [fullDoc];
        const pdfBlob = await generateGTAdjustmentDocPDFBlob(docs);
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.download = generateGTAdjustmentDocPDFFilename(docs);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pdfUrl);
        toast.success("PDF downloaded", { id: toastId });
      } catch (error) {
        toast.error(
          `Failed to generate PDF: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          { id: toastId }
        );
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadingId]
  );

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

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.type !== "all") params.append("type", filters.type);
      if (filters.dateRange.start) {
        params.append("startDate", toIsoDate(filters.dateRange.start));
      }
      if (filters.dateRange.end) {
        params.append("endDate", toIsoDate(filters.dateRange.end));
      }
      if (filters.einvoiceStatus) {
        params.append("einvoice_status", filters.einvoiceStatus);
      }
      if (filters.status) params.append("status", filters.status);
      if (filters.searchTerm) params.append("search", filters.searchTerm);
      params.append("include_cancelled", "true");

      const response = await api.get(`${API_BASE}?${params.toString()}`);
      setDocs(Array.isArray(response) ? response : []);
    } catch (error: any) {
      console.error("Error fetching GT adjustment documents:", error);
      toast.error("Failed to fetch adjustment documents");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Unified Time Navigator change handler. Handles day, month, and custom-range
  // selections from the single TimeNavigator control.
  const handleTimeNavigatorChange = useCallback(
    (range: { start: Date; end: Date }) => {
      setSelectedMonth(range.start);
      setFilters((prev) => ({
        ...prev,
        dateRange: { start: range.start, end: range.end },
      }));
    },
    []
  );

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
            onClick={() => navigate(`${UI_BASE}/new?type=debit`)}
            icon={IconFilePlus}
            variant="outline"
            size="md"
          >
            New Debit Note
          </Button>
          <Button
            onClick={() => navigate(`${UI_BASE}/new?type=credit`)}
            icon={IconFileMinus}
            variant="outline"
            size="md"
          >
            New Credit Note
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
                size={18}
              />
              <input
                type="text"
                placeholder="Search by ID, invoice number, or customer"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent h-[40px]"
                value={filters.searchTerm}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))
                }
              />
            </div>

            <TimeNavigator
              range={filters.dateRange}
              onChange={handleTimeNavigatorChange}
            />

            <div className="w-40">
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
              />
            </div>

            <div className="w-32">
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
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      ) : docs.length === 0 ? (
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
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Document ID
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Original Invoice
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Original e-Invoice
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Adj. e-Invoice
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider">
                    Date Issued
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-default-500 dark:text-gray-300 uppercase tracking-wider w-16">
                    PDF
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150"
                    onClick={() => navigate(`${UI_BASE}/${doc.id}`)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatAdjustmentDocId(doc.id)}
                      {doc.paired_doc_id && (
                        <span
                          className="block text-xs text-default-500 dark:text-gray-400"
                          title={`Paired with ${formatAdjustmentDocId(
                            doc.paired_doc_id
                          )}`}
                        >
                          ↔ {formatAdjustmentDocId(doc.paired_doc_id)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <AdjustmentDocTypeBadge type={doc.type} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 dark:text-gray-200">
                      {doc.original_invoice_number}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <AdjustmentDocStatusBadge
                        status="active"
                        einvoiceStatus={doc.original_invoice_einvoice_status}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-700 dark:text-gray-200">
                      {doc.customer_name ||
                        doc.joined_customer_name ||
                        (doc.customer_id ? `#${doc.customer_id}` : "—")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-default-700 dark:text-gray-200">
                      {formatCurrency(doc.total_amount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <AdjustmentDocStatusBadge
                        status={doc.status}
                        einvoiceStatus={doc.einvoice_status}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {formatDisplay(parseIsoDate(doc.date_issued))}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadRow(doc.id);
                        }}
                        disabled={downloadingId === doc.id}
                        className="inline-flex items-center justify-center p-1.5 rounded text-default-500 hover:text-sky-600 hover:bg-sky-50 dark:text-gray-400 dark:hover:text-sky-400 dark:hover:bg-sky-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download PDF"
                        aria-label={`Download PDF for ${doc.id}`}
                      >
                        <IconDownload size={16} stroke={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default GTAdjustmentDocsListPage;

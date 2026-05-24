// src/components/AdjustmentDocs/InvoiceAdjustmentDocsSection.tsx
// Section displayed on the InvoiceDetailsPage showing all adjustment
// documents linked to the current invoice.
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconFileText,
  IconExternalLink,
  IconPrinter,
  IconDownload,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import type { AdjustmentDocument } from "../../types/types";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "./AdjustmentDocBadge";
import LoadingSpinner from "../LoadingSpinner";
import { getAdjustmentDocsPaths } from "./useAdjustmentDocsPaths";
import type {
  AdjustmentDocsCompany,
  AdjustmentDocsPaths,
} from "./useAdjustmentDocsPaths";
import {
  generateAdjustmentDocPDFBlob,
} from "../../utils/adjustments/PDF/AdjustmentDocPDFHandler";
import { generateAdjustmentDocPDFFilename } from "../../utils/adjustments/PDF/generateAdjustmentDocPDFFilename";
import AdjustmentDocPrintOverlay from "../../utils/adjustments/PDF/AdjustmentDocPrintOverlay";

interface Props {
  invoiceId: string;
  /**
   * Company scope. Determines both the API endpoint to fetch from and the
   * UI prefix for click-through navigation. Defaults to Tien Hock.
   */
  company?: AdjustmentDocsCompany;
  /**
   * A counter that the parent can bump to force a refetch
   * (e.g. after creating/cancelling a doc elsewhere).
   */
  refreshKey?: number;
  onDocsLoaded?: (docs: AdjustmentDocument[]) => void;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const InvoiceAdjustmentDocsSection: React.FC<Props> = ({
  invoiceId,
  company = "tienhock",
  refreshKey,
  onDocsLoaded,
}) => {
  const navigate = useNavigate();
  const paths: AdjustmentDocsPaths = getAdjustmentDocsPaths(company);
  const [docs, setDocs] = useState<AdjustmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [printingDoc, setPrintingDoc] = useState<AdjustmentDocument | null>(
    null
  );

  // The /:id endpoint returns the doc with lines; the list endpoint we
  // already called omits them. Fetch full doc on demand for print/download.
  const fetchDocWithLines = useCallback(
    async (id: string): Promise<AdjustmentDocument> =>
      (await api.get(`${paths.apiBase}/${id}`)) as AdjustmentDocument,
    [paths.apiBase]
  );

  const handleDownload = useCallback(
    async (doc: AdjustmentDocument) => {
      if (downloadingId) return;
      setDownloadingId(doc.id);
      const toastId = toast.loading("Generating PDF...");
      try {
        const full = await fetchDocWithLines(doc.id);
        const pdfBlob = await generateAdjustmentDocPDFBlob([full], company);
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.download = generateAdjustmentDocPDFFilename([full], company);
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
    [downloadingId, fetchDocWithLines, company]
  );

  const handlePrint = useCallback(
    async (doc: AdjustmentDocument) => {
      if (printingDoc) return;
      const toastId = toast.loading("Loading document...");
      try {
        const full = await fetchDocWithLines(doc.id);
        toast.dismiss(toastId);
        setPrintingDoc(full);
      } catch (error) {
        toast.error(
          `Failed to load document: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          { id: toastId }
        );
      }
    },
    [printingDoc, fetchDocWithLines]
  );

  const fetchDocs = useCallback(async () => {
    if (!invoiceId) {
      setDocs([]);
      onDocsLoaded?.([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    onDocsLoaded?.([]);
    try {
      const result: unknown = await api.get(
        `${paths.apiBase}?original_invoice_id=${encodeURIComponent(
          invoiceId
        )}&include_cancelled=true`
      );
      const fetchedDocs: AdjustmentDocument[] = Array.isArray(result)
        ? result
        : [];
      setDocs(fetchedDocs);
      onDocsLoaded?.(fetchedDocs);
    } catch {
      setDocs([]);
      onDocsLoaded?.([]);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, onDocsLoaded, paths.apiBase]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs, refreshKey]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4 flex items-center justify-center">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (docs.length === 0) return null; // Hide entirely when empty to reduce noise

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-default-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-base font-semibold text-default-900 dark:text-gray-100 flex items-center gap-2">
          <IconFileText size={18} className="text-default-500 dark:text-gray-400" />
          Adjustment Documents
          <span className="text-sm font-normal text-default-500 dark:text-gray-400">
            ({docs.length})
          </span>
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
          <thead className="bg-default-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                ID
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                Type
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                Amount
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                Status
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                Paired
              </th>
              <th className="px-2 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-300 uppercase w-24">
                PDF
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
            {docs.map((d) => (
              <tr
                key={d.id}
                className="hover:bg-default-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150"
                onClick={() => navigate(`${paths.uiBase}/${d.id}`)}
              >
                <td className="px-4 py-2 text-sm font-medium text-default-900 dark:text-gray-100">
                  {d.id}
                </td>
                <td className="px-4 py-2">
                  <AdjustmentDocTypeBadge type={d.type} />
                </td>
                <td className="px-4 py-2 text-sm text-right font-medium text-default-900 dark:text-gray-100">
                  {formatCurrency(d.totalamountpayable)}
                </td>
                <td className="px-4 py-2 text-center">
                  <AdjustmentDocStatusBadge
                    status={d.status}
                    einvoiceStatus={d.einvoice_status}
                  />
                </td>
                <td className="px-4 py-2 text-sm text-default-500 dark:text-gray-400">
                  {d.paired_doc_id ? `↔ ${d.paired_doc_id}` : "—"}
                </td>
                <td
                  className="px-2 py-2 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrint(d);
                      }}
                      disabled={!!printingDoc || downloadingId === d.id}
                      className="inline-flex items-center justify-center p-1.5 rounded text-default-500 hover:text-sky-600 hover:bg-sky-50 dark:text-gray-400 dark:hover:text-sky-400 dark:hover:bg-sky-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Print PDF"
                      aria-label={`Print PDF for ${d.id}`}
                    >
                      <IconPrinter size={16} stroke={2} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(d);
                      }}
                      disabled={downloadingId === d.id || !!printingDoc}
                      className="inline-flex items-center justify-center p-1.5 rounded text-default-500 hover:text-sky-600 hover:bg-sky-50 dark:text-gray-400 dark:hover:text-sky-400 dark:hover:bg-sky-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Download PDF"
                      aria-label={`Download PDF for ${d.id}`}
                    >
                      <IconDownload size={16} stroke={2} />
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2 text-default-400 dark:text-gray-500">
                  <IconExternalLink size={14} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {printingDoc && (
        <AdjustmentDocPrintOverlay
          docs={[printingDoc]}
          onComplete={() => setPrintingDoc(null)}
        />
      )}
    </div>
  );
};

export default InvoiceAdjustmentDocsSection;

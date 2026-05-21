// src/components/AdjustmentDocs/GTInvoiceAdjustmentDocsSection.tsx
// Inline section displayed on the Green Target InvoiceDetailsPage showing all
// adjustment documents linked to the current invoice. Forked from the TH
// InvoiceAdjustmentDocsSection because GT field names diverge.
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { IconFileText, IconExternalLink } from "@tabler/icons-react";
import { api } from "../../routes/utils/api";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "./AdjustmentDocBadge";
import LoadingSpinner from "../LoadingSpinner";
import type {
  AdjustmentDocType,
  AdjustmentDocument,
  EInvoiceStatus,
} from "../../types/types";

const API_BASE = "/greentarget/api/adjustment-docs";
const UI_BASE = "/greentarget/adjustment-docs";

interface GTAdjDocRow {
  id: string;
  type: AdjustmentDocType;
  total_amount: number;
  status: AdjustmentDocument["status"];
  einvoice_status: EInvoiceStatus;
  paired_doc_id?: string | null;
}

interface Props {
  invoiceId: number | string;
  refreshKey?: number;
  onDocsLoaded?: (docs: GTAdjDocRow[]) => void;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const GTInvoiceAdjustmentDocsSection: React.FC<Props> = ({
  invoiceId,
  refreshKey,
  onDocsLoaded,
}) => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<GTAdjDocRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(async () => {
    if (!invoiceId && invoiceId !== 0) {
      setDocs([]);
      onDocsLoaded?.([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    onDocsLoaded?.([]);
    try {
      const result: unknown = await api.get(
        `${API_BASE}?original_invoice_id=${encodeURIComponent(
          String(invoiceId)
        )}&include_cancelled=true`
      );
      const fetched: GTAdjDocRow[] = Array.isArray(result) ? result : [];
      setDocs(fetched);
      onDocsLoaded?.(fetched);
    } catch {
      setDocs([]);
      onDocsLoaded?.([]);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, onDocsLoaded]);

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

  if (docs.length === 0) return null;

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
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
            {docs.map((d) => (
              <tr
                key={d.id}
                className="hover:bg-default-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150"
                onClick={() => navigate(`${UI_BASE}/${d.id}`)}
              >
                <td className="px-4 py-2 text-sm font-medium text-default-900 dark:text-gray-100">
                  {d.id}
                </td>
                <td className="px-4 py-2">
                  <AdjustmentDocTypeBadge type={d.type} />
                </td>
                <td className="px-4 py-2 text-sm text-right font-medium text-default-900 dark:text-gray-100">
                  {formatCurrency(Number(d.total_amount || 0))}
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
                <td className="px-2 py-2 text-default-400 dark:text-gray-500">
                  <IconExternalLink size={14} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GTInvoiceAdjustmentDocsSection;

// src/components/AdjustmentDocs/InvoiceAdjustmentDocsSection.tsx
// Section displayed on the InvoiceDetailsPage showing all adjustment
// documents linked to the current invoice.
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { IconFileText, IconExternalLink } from "@tabler/icons-react";
import { api } from "../../routes/utils/api";
import { AdjustmentDocument } from "../../types/types";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "./AdjustmentDocBadge";
import LoadingSpinner from "../LoadingSpinner";

interface Props {
  invoiceId: string;
  /**
   * Optional base path. Defaults to Tien Hock's `/sales/adjustment-docs`.
   * Jelly Polly / Green Target wrappers pass their own prefixed path.
   */
  basePath?: string;
  /**
   * A counter that the parent can bump to force a refetch
   * (e.g. after creating/cancelling a doc elsewhere).
   */
  refreshKey?: number;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const InvoiceAdjustmentDocsSection: React.FC<Props> = ({
  invoiceId,
  basePath = "/sales/adjustment-docs",
  refreshKey,
}) => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<AdjustmentDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const result = await api.get(
        `/api/adjustment-docs?original_invoice_id=${encodeURIComponent(
          invoiceId
        )}&include_cancelled=true`
      );
      setDocs(Array.isArray(result) ? result : []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

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
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
            {docs.map((d) => (
              <tr
                key={d.id}
                className="hover:bg-default-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150"
                onClick={() => navigate(`${basePath}/${d.id}`)}
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

export default InvoiceAdjustmentDocsSection;

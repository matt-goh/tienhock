// src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsDetailsPage.tsx
// Phase 7 — Green Target adjustment doc details. Forked from the TH details
// page because GT lacks code/rounding/linked_payment_id and uses different
// total column names (amount_before_tax / total_amount).
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  IconExternalLink,
  IconBan,
  IconReceipt,
  IconRotate2,
  IconSend,
  IconRotateClockwise,
  IconRefresh,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
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
  ADJUSTMENT_DOC_TYPE_META,
} from "../../../components/AdjustmentDocs/AdjustmentDocBadge";

const API_BASE = "/greentarget/api/adjustment-docs";
const UI_BASE = "/greentarget/adjustment-docs";
const INVOICE_UI_BASE = "/greentarget/invoice";

interface GTAdjDoc {
  id: string;
  type: AdjustmentDocType;
  original_invoice_id: number;
  original_invoice_number: string;
  customer_id: number | null;
  customer_name: string | null;
  date_issued: string;
  reason: string | null;
  paired_with_id: string | null;
  references_consolidated_id: number | null;
  amount_before_tax: number;
  tax_amount: number;
  total_amount: number;
  refund_method: string | null;
  refund_reference: string | null;
  bank_account: string | null;
  uuid: string | null;
  submission_uid: string | null;
  long_id: string | null;
  datetime_validated: string | null;
  einvoice_status: EInvoiceStatus;
  is_consolidated: boolean;
  status: AdjustmentDocument["status"];
  cancellation_date: string | null;
  cancellation_reason: string | null;
  lines?: Array<{
    id?: number;
    description: string | null;
    quantity: number | null;
    price: number | null;
    tax: number | null;
    total: number | null;
    issubtotal: boolean;
  }>;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const formatIsoDate = (s: string | null | undefined): string => {
  if (!s) return "—";
  const iso = s.slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("en-GB");
};

const GTAdjustmentDocsDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<GTAdjDoc | null>(null);
  const [pairedDoc, setPairedDoc] = useState<GTAdjDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSubmittingEinvoice, setIsSubmittingEinvoice] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCancellingEinvoice, setIsCancellingEinvoice] = useState(false);
  const [showCancelEinvoiceDialog, setShowCancelEinvoiceDialog] = useState(false);
  const [einvoiceCancelReason, setEinvoiceCancelReason] = useState("");

  const fetchDoc = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data: GTAdjDoc = await api.get(`${API_BASE}/${id}`);
      setDoc(data);
      if (data.paired_with_id) {
        try {
          const paired: GTAdjDoc = await api.get(
            `${API_BASE}/${data.paired_with_id}`
          );
          setPairedDoc(paired);
        } catch {
          setPairedDoc(null);
        }
      } else {
        setPairedDoc(null);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to load document");
      navigate(UI_BASE, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const handleCancel = async () => {
    if (!doc) return;
    setIsCancelling(true);
    const toastId = toast.loading(`Cancelling ${doc.id}...`);
    try {
      const response = await api.post(`${API_BASE}/${doc.id}/cancel`, {
        reason: cancelReason || null,
      });
      toast.success(response.message || "Cancelled", { id: toastId });
      setShowCancelDialog(false);
      setCancelReason("");
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || "Failed to cancel", { id: toastId });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitEinvoice = async () => {
    if (!doc) return;
    setIsSubmittingEinvoice(true);
    const toastId = toast.loading(`Submitting ${doc.id} to MyInvois...`);
    try {
      const response = await api.post(
        `${API_BASE}/${doc.id}/submit-einvoice`
      );
      toast.success(response.message || "Submitted", {
        id: toastId,
        duration: 5000,
      });
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || "Submission failed", {
        id: toastId,
        duration: 6000,
      });
      fetchDoc();
    } finally {
      setIsSubmittingEinvoice(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!doc) return;
    setIsUpdatingStatus(true);
    const toastId = toast.loading(`Checking MyInvois status for ${doc.id}...`);
    try {
      const response = await api.post(`${API_BASE}/${doc.id}/update-status`);
      toast.success(
        response.updated
          ? `Status updated to ${response.status}`
          : "No change since last check",
        { id: toastId }
      );
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || "Status check failed", { id: toastId });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelEinvoice = async () => {
    if (!doc) return;
    setIsCancellingEinvoice(true);
    const toastId = toast.loading(`Cancelling e-invoice for ${doc.id}...`);
    try {
      const response = await api.post(`${API_BASE}/${doc.id}/cancel-einvoice`, {
        reason: einvoiceCancelReason || null,
      });
      toast.success(response.message || "E-invoice cancelled", {
        id: toastId,
        duration: 6000,
      });
      setShowCancelEinvoiceDialog(false);
      setEinvoiceCancelReason("");
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || "Failed to cancel e-invoice", {
        id: toastId,
      });
    } finally {
      setIsCancellingEinvoice(false);
    }
  };

  const handleClearStatus = async () => {
    if (!doc) return;
    const toastId = toast.loading("Clearing e-invoice status...");
    try {
      await api.post(`${API_BASE}/${doc.id}/clear-einvoice-status`);
      toast.success("Cleared — you can retry submission", { id: toastId });
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || "Failed to clear status", { id: toastId });
    }
  };

  if (loading || !doc) {
    return (
      <div className="mt-40 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const meta = ADJUSTMENT_DOC_TYPE_META[doc.type];
  const canCancel =
    doc.status === "active" &&
    doc.einvoice_status !== "valid" &&
    doc.einvoice_status !== "pending";
  const cnBlockedByPaired =
    doc.type === "credit_note" && pairedDoc?.status === "active";
  const canIssuePairedRefund: boolean =
    doc.type === "credit_note" &&
    doc.status === "active" &&
    pairedDoc?.status !== "active";

  const originalInvoicePath = `${INVOICE_UI_BASE}/${doc.original_invoice_id}`;
  const handleOpenOriginalInvoice = () => navigate(originalInvoicePath);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div className="flex items-center gap-3">
            <BackButton onClick={() => navigate(UI_BASE)} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
            <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100 flex items-center gap-2">
              {meta.label} {doc.id}
              <AdjustmentDocTypeBadge type={doc.type} />
              <AdjustmentDocStatusBadge
                status={doc.status}
                einvoiceStatus={doc.einvoice_status}
              />
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {doc.status === "active" && !doc.einvoice_status && (
              <Button
                onClick={handleSubmitEinvoice}
                icon={IconSend}
                variant="outline"
                color="sky"
                size="md"
                disabled={isSubmittingEinvoice}
                title="Submit this document to MyInvois"
              >
                {isSubmittingEinvoice ? "Submitting..." : "Submit e-Invoice"}
              </Button>
            )}
            {doc.status === "active" && doc.einvoice_status === "invalid" && (
              <>
                <Button
                  onClick={handleClearStatus}
                  icon={IconRefresh}
                  variant="outline"
                  size="md"
                  title="Clear invalid status to retry"
                >
                  Clear & Retry
                </Button>
                <Button
                  onClick={handleSubmitEinvoice}
                  icon={IconSend}
                  variant="outline"
                  color="sky"
                  size="md"
                  disabled={isSubmittingEinvoice}
                >
                  {isSubmittingEinvoice ? "Submitting..." : "Re-submit"}
                </Button>
              </>
            )}
            {doc.status === "active" && doc.einvoice_status === "pending" && (
              <Button
                onClick={handleUpdateStatus}
                icon={IconRotateClockwise}
                variant="outline"
                size="md"
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? "Checking..." : "Update Status"}
              </Button>
            )}
            {doc.status === "active" &&
              (doc.einvoice_status === "valid" ||
                doc.einvoice_status === "invalid") && (
                <Button
                  onClick={() => setShowCancelEinvoiceDialog(true)}
                  icon={IconBan}
                  variant="outline"
                  color="rose"
                  size="md"
                  disabled={isCancellingEinvoice}
                  title="Cancel the e-invoice at MyInvois"
                >
                  Cancel e-Invoice
                </Button>
              )}

            {canCancel && (
              <Button
                onClick={() => setShowCancelDialog(true)}
                icon={IconBan}
                variant="outline"
                color="rose"
                size="md"
                disabled={cnBlockedByPaired}
                title={
                  cnBlockedByPaired
                    ? `Cancel paired Refund Note ${pairedDoc?.id} first`
                    : "Cancel this document"
                }
              >
                Cancel Document
              </Button>
            )}
            {canIssuePairedRefund && (
              <Button
                onClick={() =>
                  navigate(
                    `${UI_BASE}/new?type=refund&invoiceId=${doc.original_invoice_id}&creditNoteId=${doc.id}`
                  )
                }
                icon={IconRotate2}
                variant="outline"
                color="sky"
                size="md"
                title={`Create a new Refund Note for Credit Note ${doc.id}`}
              >
                {pairedDoc ? "Reissue Refund Note" : "Issue Refund Note"}
              </Button>
            )}
          </div>
        </div>

        {/* Summary grid */}
        <div
          role="link"
          tabIndex={0}
          onClick={handleOpenOriginalInvoice}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleOpenOriginalInvoice();
          }}
          className="p-4 border-b border-default-200 dark:border-gray-700 cursor-pointer transition hover:bg-default-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 dark:hover:bg-gray-700/50"
          title="Open invoice"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Original Invoice
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100 flex items-center gap-1">
                {doc.original_invoice_number}
                <IconExternalLink
                  size={14}
                  className="text-sky-600 dark:text-sky-400"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Customer
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {doc.customer_name ||
                  (doc.customer_id ? `#${doc.customer_id}` : "—")}
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Date Issued
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {formatIsoDate(doc.date_issued)}
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Total Amount
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {formatCurrency(doc.total_amount)}
              </div>
            </div>
            {doc.references_consolidated_id && (
              <div className="col-span-2 md:col-span-4">
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                  Referenced Consolidated Invoice
                </div>
                <div className="font-mono text-sm text-default-900 dark:text-gray-100">
                  #{doc.references_consolidated_id}
                </div>
              </div>
            )}
            {doc.reason && (
              <div className="col-span-2 md:col-span-4">
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                  Reason
                </div>
                <div className="text-default-900 dark:text-gray-100 whitespace-pre-wrap">
                  {doc.reason}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Paired doc */}
        {pairedDoc && (
          <div className="px-4 py-3 border-b border-default-200 dark:border-gray-700 bg-default-50/60 dark:bg-gray-900/30">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm">
                <IconReceipt size={18} className="text-default-500" />
                <span className="text-default-600 dark:text-gray-400">
                  Paired with
                </span>
                <AdjustmentDocTypeBadge type={pairedDoc.type} />
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {pairedDoc.id}
                </span>
                <AdjustmentDocStatusBadge
                  status={pairedDoc.status}
                  einvoiceStatus={pairedDoc.einvoice_status}
                />
                <span className="text-default-600 dark:text-gray-400">
                  · {formatCurrency(pairedDoc.total_amount)}
                </span>
              </div>
              <Button
                onClick={() => navigate(`${UI_BASE}/${pairedDoc.id}`)}
                icon={IconExternalLink}
                variant="outline"
                size="sm"
              >
                Open
              </Button>
            </div>
          </div>
        )}

        {/* Refund details */}
        {doc.type === "refund_note" && (
          <div className="p-4 border-b border-default-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-default-900 dark:text-gray-100 mb-2">
              Refund Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase">
                  Method
                </div>
                <div className="font-medium text-default-900 dark:text-gray-100 capitalize">
                  {doc.refund_method?.replace("_", " ") || "—"}
                </div>
              </div>
              <div>
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase">
                  Bank Account
                </div>
                <div className="font-medium text-default-900 dark:text-gray-100">
                  {doc.bank_account || "—"}
                </div>
              </div>
              <div>
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase">
                  Reference
                </div>
                <div className="font-medium text-default-900 dark:text-gray-100">
                  {doc.refund_reference || "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-default-900 dark:text-gray-100 mb-2">
            Line Items
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700 border border-default-200 dark:border-gray-700 rounded-lg">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    Description
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    Price
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    Tax
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
                {(doc.lines || []).map((line, idx) => (
                  <tr key={line.id ?? idx}>
                    <td className="px-3 py-2 text-sm text-default-700 dark:text-gray-200">
                      {line.description || "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-right text-default-700 dark:text-gray-200">
                      {line.quantity ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-right text-default-700 dark:text-gray-200">
                      {line.price !== null && line.price !== undefined
                        ? Number(line.price).toFixed(2)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-right text-default-700 dark:text-gray-200">
                      {line.tax !== null && line.tax !== undefined
                        ? Number(line.tax).toFixed(2)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-medium text-default-900 dark:text-gray-100">
                      {line.total !== null && line.total !== undefined
                        ? Number(line.total).toFixed(2)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals + e-invoice */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-default-50 dark:bg-gray-900/30 rounded-lg p-4 border border-default-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-default-900 dark:text-gray-100 mb-2">
              e-Invoice
            </h3>
            <dl className="text-sm space-y-1">
              <div className="flex justify-between">
                <dt className="text-default-500 dark:text-gray-400">Status</dt>
                <dd>
                  <AdjustmentDocStatusBadge
                    status={doc.status}
                    einvoiceStatus={doc.einvoice_status}
                  />
                </dd>
              </div>
              {doc.uuid && (
                <div className="flex justify-between gap-2">
                  <dt className="text-default-500 dark:text-gray-400">UUID</dt>
                  <dd className="font-mono text-xs truncate text-default-900 dark:text-gray-100 max-w-[260px]">
                    {doc.uuid}
                  </dd>
                </div>
              )}
              {doc.long_id && (
                <div className="flex justify-between gap-2">
                  <dt className="text-default-500 dark:text-gray-400">Long ID</dt>
                  <dd className="font-mono text-xs truncate text-default-900 dark:text-gray-100 max-w-[260px]">
                    {doc.long_id}
                  </dd>
                </div>
              )}
              {doc.datetime_validated && (
                <div className="flex justify-between">
                  <dt className="text-default-500 dark:text-gray-400">Validated</dt>
                  <dd className="text-default-900 dark:text-gray-100">
                    {new Date(doc.datetime_validated).toLocaleString()}
                  </dd>
                </div>
              )}
              {!doc.einvoice_status && (
                <div className="text-xs text-default-500 dark:text-gray-400 pt-2">
                  Not yet submitted to MyInvois. Use the action bar to submit.
                </div>
              )}
            </dl>
          </div>

          <div className="bg-default-50 dark:bg-gray-900/30 rounded-lg p-4 border border-default-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-default-900 dark:text-gray-100 mb-2">
              Totals
            </h3>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">
                  Amount Before Tax
                </span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {formatCurrency(doc.amount_before_tax)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">Tax</span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {formatCurrency(doc.tax_amount)}
                </span>
              </div>
              <div className="border-t border-default-200 dark:border-gray-700 pt-2 mt-2 flex justify-between">
                <span className="font-semibold text-default-900 dark:text-gray-100">
                  Total
                </span>
                <span className="font-bold text-lg text-default-900 dark:text-gray-100">
                  {formatCurrency(doc.total_amount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {doc.cancellation_date && (
          <div className="p-4 border-t border-default-200 dark:border-gray-700 bg-rose-50/50 dark:bg-rose-900/10">
            <div className="text-sm text-rose-800 dark:text-rose-300">
              <span className="font-medium">Cancelled</span>
              {" "}on {new Date(doc.cancellation_date).toLocaleString()}
              {doc.cancellation_reason && <span>: {doc.cancellation_reason}</span>}
            </div>
          </div>
        )}
      </div>

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={() => {
          if (!isCancelling) {
            setShowCancelDialog(false);
            setCancelReason("");
          }
        }}
        onConfirm={handleCancel}
        title={`Cancel ${doc.id}?`}
        message={`This will reverse the balance impact on the original invoice${
          doc.type === "credit_note"
            ? " (adds the credit back to the outstanding balance)"
            : doc.type === "debit_note"
            ? " (removes the debit from the outstanding balance)"
            : ""
        }. This action cannot be undone.`}
        confirmButtonText={isCancelling ? "Cancelling..." : "Confirm Cancellation"}
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={showCancelEinvoiceDialog}
        onClose={() => {
          if (!isCancellingEinvoice) {
            setShowCancelEinvoiceDialog(false);
            setEinvoiceCancelReason("");
          }
        }}
        onConfirm={handleCancelEinvoice}
        title={`Cancel e-invoice for ${doc.id}?`}
        message="This sets the MyInvois document state to cancelled. The local document balance impact stays intact — cancel the document separately if you want to reverse it."
        confirmButtonText={
          isCancellingEinvoice ? "Cancelling..." : "Cancel e-Invoice"
        }
        variant="danger"
      />
    </div>
  );
};

export default GTAdjustmentDocsDetailsPage;

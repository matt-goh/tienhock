// src/pages/AdjustmentDocs/AdjustmentDocsDetailsPage.tsx
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
  IconPrinter,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import BackButton from "../../components/BackButton";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AdjustmentDocument, EInvoiceStatus } from "../../types/types";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
  ADJUSTMENT_DOC_TYPE_META,
} from "../../components/AdjustmentDocs/AdjustmentDocBadge";
import {
  AdjustmentDocsCompany,
  getAdjustmentDocsPaths,
} from "../../components/AdjustmentDocs/useAdjustmentDocsPaths";
import { parseDatabaseTimestamp, formatDisplayDate } from "../../utils/invoice/dateUtils";
import {
  formatAdjustmentDocDisplayId,
} from "../../utils/adjustments/formatDocId";
import AdjustmentDocPDFHandler from "../../utils/adjustments/PDF/AdjustmentDocPDFHandler";
import AdjustmentDocPrintOverlay from "../../utils/adjustments/PDF/AdjustmentDocPrintOverlay";

interface Props {
  company?: AdjustmentDocsCompany;
}

interface DebitNoteCancellationBlockedData {
  active_credit_note_total: number;
  adjusted_invoice_total_after_cancellation: number;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const formatLocalDateTime = (value?: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const formatRefundMethodLabel = (method?: string | null): string =>
  method === "cash"
    ? "Cash"
    : method === "cheque"
      ? "Cheque"
      : method === "bank_transfer"
        ? "Bank Transfer"
        : method === "online"
          ? "Online"
          : "Refund";

const AdjustmentDocsDetailsPage: React.FC<Props> = ({
  company = "tienhock",
}) => {
  const { t } = useTranslation("adjustments");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const paths = getAdjustmentDocsPaths(company);
  const [doc, setDoc] = useState<AdjustmentDocument | null>(null);
  const [pairedDoc, setPairedDoc] = useState<AdjustmentDocument | null>(null);
  const [originalInvoice, setOriginalInvoice] = useState<{
    id: string;
    invoice_status: string;
    einvoice_status: EInvoiceStatus;
    uuid: string | null;
    long_id: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSubmittingEinvoice, setIsSubmittingEinvoice] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCancellingEinvoice, setIsCancellingEinvoice] = useState(false);
  const [showCancelEinvoiceDialog, setShowCancelEinvoiceDialog] = useState(false);
  const [einvoiceCancelReason, setEinvoiceCancelReason] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);

  const fetchDoc = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = (await api.get(
        `${paths.apiBase}/${id}`
      )) as AdjustmentDocument;
      setDoc(data);
      if (data.paired_with_id) {
        try {
          const paired = (await api.get(
            `${paths.apiBase}/${data.paired_with_id}`
          )) as AdjustmentDocument;
          setPairedDoc(paired);
        } catch {
          setPairedDoc(null);
        }
      } else {
        setPairedDoc(null);
      }
      if (data.original_invoice_id) {
        try {
          const inv = (await api.get(
            `${paths.invoiceApiBase}/${data.original_invoice_id}`
          )) as any;
          setOriginalInvoice({
            id: inv.id,
            invoice_status: inv.invoice_status,
            einvoice_status: inv.einvoice_status ?? null,
            uuid: inv.uuid ?? null,
            long_id: inv.long_id ?? null,
          });
        } catch {
          setOriginalInvoice(null);
        }
      } else {
        setOriginalInvoice(null);
      }
    } catch (error: any) {
      toast.error(error?.message || t("Failed to load document"));
      navigate(paths.uiBase, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate, t]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const handleCancel = async () => {
    if (!doc) return;
    setIsCancelling(true);
    const toastId = toast.loading(
      t("Cancelling {{id}}...", { id: formatAdjustmentDocDisplayId(doc) })
    );
    try {
      const response = await api.post(`${paths.apiBase}/${doc.id}/cancel`, {
        reason: cancelReason || null,
      });
      toast.success(response.message || t("Cancelled"), { id: toastId });
      setShowCancelDialog(false);
      setCancelReason("");
      fetchDoc();
    } catch (error: any) {
      if (
        error?.data?.code ===
        "ACTIVE_CREDIT_NOTES_EXCEED_INVOICE_AFTER_DEBIT_NOTE_CANCELLATION"
      ) {
        const details: DebitNoteCancellationBlockedData | undefined =
          error.data.details;
        toast.error(
          t(
            "Cannot cancel this Debit Note because active Credit Notes total RM {{creditAmount}} would exceed the adjusted invoice total RM {{invoiceAmount}}. Cancel enough Credit Notes first.",
            {
              creditAmount: Number(
                details?.active_credit_note_total || 0
              ).toFixed(2),
              invoiceAmount: Number(
                details?.adjusted_invoice_total_after_cancellation || 0
              ).toFixed(2),
            }
          ),
          { id: toastId }
        );
      } else {
        toast.error(error?.message || t("Failed to cancel"), { id: toastId });
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitEinvoice = async () => {
    if (!doc) return;
    setIsSubmittingEinvoice(true);
    const toastId = toast.loading(
      t("Submitting {{id}} to MyInvois...", {
        id: formatAdjustmentDocDisplayId(doc),
      })
    );
    try {
      const response = await api.post(
        `${paths.apiBase}/${doc.id}/submit-einvoice`
      );
      toast.success(response.message || t("Submitted"), {
        id: toastId,
        duration: 5000,
      });
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || t("Submission failed"), {
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
    const toastId = toast.loading(
      t("Checking MyInvois status for {{id}}...", {
        id: formatAdjustmentDocDisplayId(doc),
      })
    );
    try {
      const response = await api.post(
        `${paths.apiBase}/${doc.id}/update-status`
      );
      toast.success(
        response.updated
          ? t("Status updated to {{status}}", { status: response.status })
          : t("No change since last check"),
        { id: toastId }
      );
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || t("Status check failed"), {
        id: toastId,
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelEinvoice = async () => {
    if (!doc) return;
    setIsCancellingEinvoice(true);
    const toastId = toast.loading(
      t("Cancelling e-invoice for {{id}}...", {
        id: formatAdjustmentDocDisplayId(doc),
      })
    );
    try {
      const response = await api.post(
        `${paths.apiBase}/${doc.id}/cancel-einvoice`,
        { reason: einvoiceCancelReason || null }
      );
      toast.success(response.message || t("E-invoice cancelled"), {
        id: toastId,
        duration: 6000,
      });
      setShowCancelEinvoiceDialog(false);
      setEinvoiceCancelReason("");
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || t("Failed to cancel e-invoice"), {
        id: toastId,
      });
    } finally {
      setIsCancellingEinvoice(false);
    }
  };

  const handleClearStatus = async () => {
    if (!doc) return;
    const toastId = toast.loading(t("Clearing e-invoice status..."));
    try {
      await api.post(`${paths.apiBase}/${doc.id}/clear-einvoice-status`);
      toast.success(t("Cleared — you can retry submission"), {
        id: toastId,
      });
      fetchDoc();
    } catch (error: any) {
      toast.error(error?.message || t("Failed to clear status"), {
        id: toastId,
      });
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
  const { date } = parseDatabaseTimestamp(doc.createddate);
  const canCancel =
    doc.status === "active" &&
    doc.einvoice_status !== "valid" &&
    doc.einvoice_status !== "pending";

  // CN cancel is blocked while paired RN active
  const cnBlockedByPaired =
    doc.type === "credit_note" &&
    pairedDoc?.status === "active";
  const canIssuePairedRefund: boolean =
    doc.type === "credit_note" &&
    doc.status === "active" &&
    pairedDoc?.status !== "active";
  const originalInvoicePath: string = `${paths.invoiceUiBase}/${doc.original_invoice_id}`;
  const handleOpenOriginalInvoice = (): void => {
    navigate(originalInvoicePath);
  };
  const handleOriginalInvoiceKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>
  ): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenOriginalInvoice();
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div className="flex items-center gap-3">
            <BackButton fallbackPath={paths.uiBase} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
            <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100 flex items-center gap-2 flex-wrap">
              {t(meta.label)} {formatAdjustmentDocDisplayId(doc)}
              <AdjustmentDocTypeBadge type={doc.type} />
              <AdjustmentDocStatusBadge
                status={doc.status}
                einvoiceStatus={doc.einvoice_status}
              />
              {doc.journal_entry_id && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `${
                        company === "jellypolly"
                          ? "/jellypolly/accounting/journal-entries"
                          : "/accounting/journal-entries"
                      }/${doc.journal_entry_id}`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:underline"
                  title={t("View journal entry")}
                >
                  <IconReceipt size={14} />
                  {t("View Journal {{reference}}", {
                    reference:
                      doc.journal_reference || formatAdjustmentDocDisplayId(doc),
                  })}
                  {doc.journal_status && (
                    <span className="opacity-80">
                      {" "}
                      ({t(
                        doc.journal_status === "cancelled"
                          ? "Cancelled"
                          : "Posted"
                      )})
                    </span>
                  )}
                </button>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => setIsPrinting(true)}
              icon={IconPrinter}
              variant="outline"
              size="md"
              disabled={loading || isPrinting}
              title={t("Print this document")}
            >
              {isPrinting ? t("Printing...") : t("print", { ns: "common" })}
            </Button>
            <AdjustmentDocPDFHandler docs={[doc]} disabled={loading} />
            {/* Submit / Update / Cancel e-Invoice */}
            {doc.status === "active" && !doc.einvoice_status && (
              <Button
                onClick={handleSubmitEinvoice}
                icon={IconSend}
                variant="outline"
                color="sky"
                size="md"
                disabled={isSubmittingEinvoice}
                title={t("Submit this document to MyInvois")}
              >
                {isSubmittingEinvoice
                  ? t("Submitting...")
                  : t("Submit e-Invoice")}
              </Button>
            )}
            {doc.status === "active" && doc.einvoice_status === "invalid" && (
              <>
                <Button
                  onClick={handleClearStatus}
                  icon={IconRefresh}
                  variant="outline"
                  size="md"
                  title={t("Clear invalid status to retry")}
                >
                  {t("Clear & Retry")}
                </Button>
                <Button
                  onClick={handleSubmitEinvoice}
                  icon={IconSend}
                  variant="outline"
                  color="sky"
                  size="md"
                  disabled={isSubmittingEinvoice}
                >
                  {isSubmittingEinvoice
                    ? t("Submitting...")
                    : t("Re-submit")}
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
                {isUpdatingStatus ? t("Checking...") : t("Update Status")}
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
                  title={t("Cancel the e-invoice at MyInvois")}
                >
                  {t("Cancel e-Invoice")}
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
                    ? t("Cancel paired Refund Note {{id}} first", {
                        id: pairedDoc
                          ? formatAdjustmentDocDisplayId(pairedDoc)
                          : "",
                      })
                    : t("Cancel this document")
                }
              >
                {t("Cancel Document")}
              </Button>
            )}
            {canIssuePairedRefund && (
              <Button
                onClick={() =>
                  navigate(
                    `${paths.uiBase}/new?type=refund&invoiceId=${doc.original_invoice_id}&creditNoteId=${doc.id}`
                  )
                }
                icon={IconRotate2}
                variant="outline"
                color="sky"
                size="md"
                title={t("Create a new Refund Note for Credit Note {{id}}", {
                  id: formatAdjustmentDocDisplayId(doc),
                })}
              >
                {t(pairedDoc ? "Reissue Refund Note" : "Issue Refund Note")}
              </Button>
            )}
          </div>
        </div>

        {/* Summary grid */}
        <div
          role="link"
          tabIndex={0}
          onClick={handleOpenOriginalInvoice}
          onKeyDown={handleOriginalInvoiceKeyDown}
          className="p-4 sm:p-5 border-b border-default-200 dark:border-gray-700 cursor-pointer transition hover:bg-default-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 dark:hover:bg-gray-700/50"
          title={t("Open invoice")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 sm:gap-4 text-sm">
            <div className="min-w-0">
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                {t("Original Invoice")}
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100 flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 break-all">
                  {doc.original_invoice_id}
                </span>
                <IconExternalLink
                  size={14}
                  className="flex-shrink-0 text-sky-600 dark:text-sky-400"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                {t("customer", { ns: "common" })}
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100 break-words">
                {doc.customer_name || doc.customerid}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                {t("Document Date")}
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {date ? formatDisplayDate(date) : "—"}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                {t("Keyed In")}
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {formatLocalDateTime(doc.created_at)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                {t("Total Amount")}
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {formatCurrency(doc.totalamountpayable)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-0.5">
                {t("Invoice e-Status")}
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {originalInvoice ? (
                  <AdjustmentDocStatusBadge
                    status={
                      originalInvoice.invoice_status === "cancelled"
                        ? "cancelled"
                        : "active"
                    }
                    einvoiceStatus={originalInvoice.einvoice_status}
                  />
                ) : (
                  "—"
                )}
              </div>
            </div>
            {doc.references_consolidated_id && (
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                  {t("Referenced Consolidated Invoice")}
                </div>
                <div className="font-mono text-sm text-default-900 dark:text-gray-100 break-all">
                  {doc.references_consolidated_id}
                </div>
              </div>
            )}
            {doc.reason && (
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                  {t("Reason")}
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
                  {t("Paired with")}
                </span>
                <AdjustmentDocTypeBadge type={pairedDoc.type} />
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {formatAdjustmentDocDisplayId(pairedDoc)}
                </span>
                <AdjustmentDocStatusBadge
                  status={pairedDoc.status}
                  einvoiceStatus={pairedDoc.einvoice_status}
                />
                <span className="text-default-600 dark:text-gray-400">
                  · {formatCurrency(pairedDoc.totalamountpayable)}
                </span>
              </div>
              <Button
                onClick={() =>
                  navigate(`${paths.uiBase}/${pairedDoc.id}`)
                }
                icon={IconExternalLink}
                variant="outline"
                size="sm"
              >
                {t("Open")}
              </Button>
            </div>
          </div>
        )}

        {/* Refund details */}
        {doc.type === "refund_note" && (
          <div className="p-4 border-b border-default-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-default-900 dark:text-gray-100 mb-2">
              {t("Refund Details")}
            </h3>
            {doc.linked_payment_id &&
              doc.linked_payment &&
              doc.linked_payment.status === "cancelled" && (
                <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
                  {doc.linked_payment.cancellation_date
                    ? t(
                        "Linked payment #{{id}} has been cancelled on {{date}}. The link is stale — this refund's accounting impact still stands until you cancel the document.",
                        {
                          id: doc.linked_payment_id,
                          date: new Date(
                            doc.linked_payment.cancellation_date
                          ).toLocaleDateString(),
                        }
                      )
                    : t(
                        "Linked payment #{{id}} has been cancelled. The link is stale — this refund's accounting impact still stands until you cancel the document.",
                        { id: doc.linked_payment_id }
                      )}
                </div>
              )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase">
                  {t("Method")}
                </div>
                <div className="font-medium text-default-900 dark:text-gray-100 capitalize">
                  {t(formatRefundMethodLabel(doc.refund_method)) || "—"}
                </div>
              </div>
              <div>
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase">
                  {t("Bank Account")}
                </div>
                <div className="font-medium text-default-900 dark:text-gray-100">
                  {doc.bank_account || "—"}
                </div>
              </div>
              <div>
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase">
                  {t("Reference")}
                </div>
                <div className="font-medium text-default-900 dark:text-gray-100">
                  {doc.refund_reference || "—"}
                </div>
              </div>
              <div>
                <div className="text-default-500 dark:text-gray-400 text-xs uppercase">
                  {t("Linked Payment")}
                </div>
                <div className="font-medium text-default-900 dark:text-gray-100">
                  {doc.linked_payment_id ? `#${doc.linked_payment_id}` : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-default-900 dark:text-gray-100 mb-2">
            {t("Line Items")}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700 border border-default-200 dark:border-gray-700 rounded-lg">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    {t("Code")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    {t("description", { ns: "common" })}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    {t("Qty")}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    {t("Price")}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    {t("Tax")}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    {t("total", { ns: "common" })}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
                {(doc.lines || []).map((line, idx) => (
                  <tr key={line.id ?? idx}>
                    <td className="px-3 py-2 text-sm text-default-900 dark:text-gray-100">
                      {line.code || "—"}
                    </td>
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
          {(() => {
            const myInvoisUrl =
              doc.einvoice_status === "valid" && doc.uuid && doc.long_id
                ? `https://myinvois.hasil.gov.my/${doc.uuid}/share/${doc.long_id}`
                : null;
            const cardClass = `bg-default-50 dark:bg-gray-900/30 rounded-lg border border-default-200 dark:border-gray-700 block ${
              myInvoisUrl
                ? "px-4 pt-6 cursor-pointer transition hover:bg-default-100 hover:border-sky-300 dark:hover:bg-gray-800/60 dark:hover:border-sky-700"
                : "px-4 pt-10"
            }`;
            const cardContent = (
              <>
                <h3 className="text-sm font-semibold text-default-900 dark:text-gray-100 mb-2 flex items-center justify-between gap-2">
                  <span>{t("e-Invoice")}</span>
                  {myInvoisUrl && (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-sky-600 dark:text-sky-400">
                      <IconExternalLink size={12} />
                      {t("Open in MyInvois")}
                    </span>
                  )}
                </h3>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-default-500 dark:text-gray-400">
                      {t("status", { ns: "common" })}
                    </dt>
                    <dd>
                      <AdjustmentDocStatusBadge
                        status={doc.status}
                        einvoiceStatus={doc.einvoice_status}
                      />
                    </dd>
                  </div>
                  {doc.uuid && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-default-500 dark:text-gray-400">
                        {t("UUID")}
                      </dt>
                      <dd className="font-mono text-xs truncate text-default-900 dark:text-gray-100 max-w-[260px]">
                        {doc.uuid}
                      </dd>
                    </div>
                  )}
                  {doc.long_id && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-default-500 dark:text-gray-400">
                        {t("Long ID")}
                      </dt>
                      <dd className="font-mono text-xs truncate text-default-900 dark:text-gray-100 max-w-[260px]">
                        {doc.long_id}
                      </dd>
                    </div>
                  )}
                  {doc.datetime_validated && (
                    <div className="flex justify-between">
                      <dt className="text-default-500 dark:text-gray-400">
                        {t("Validated")}
                      </dt>
                      <dd className="text-default-900 dark:text-gray-100">
                        {new Date(doc.datetime_validated).toLocaleString()}
                      </dd>
                    </div>
                  )}
                  {!doc.einvoice_status && (
                    <div className="text-xs text-default-500 dark:text-gray-400 pt-2">
                      {t(
                        "Not yet submitted to MyInvois. Use the action bar to submit."
                      )}
                    </div>
                  )}
                </dl>
              </>
            );
            return myInvoisUrl ? (
              <a
                href={myInvoisUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cardClass}
                title={t("View this e-Invoice on MyInvois portal")}
              >
                {cardContent}
              </a>
            ) : (
              <div className={cardClass}>{cardContent}</div>
            );
          })()}

          <div className="bg-default-50 dark:bg-gray-900/30 rounded-lg p-4 border border-default-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-default-900 dark:text-gray-100 mb-2">
              {t("Totals")}
            </h3>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">
                  {t("Subtotal")}
                </span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {formatCurrency(doc.total_excluding_tax)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">
                  {t("Tax")}
                </span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {formatCurrency(doc.tax_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">
                  {t("Rounding")}
                </span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {formatCurrency(doc.rounding)}
                </span>
              </div>
              <div className="border-t border-default-200 dark:border-gray-700 pt-2 mt-2 flex justify-between">
                <span className="font-semibold text-default-900 dark:text-gray-100">
                  {t("total", { ns: "common" })}
                </span>
                <span className="font-bold text-lg text-default-900 dark:text-gray-100">
                  {formatCurrency(doc.totalamountpayable)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {doc.cancellation_date && (
          <div className="p-4 border-t border-default-200 dark:border-gray-700 bg-rose-50/50 dark:bg-rose-900/10">
            <div className="text-sm text-rose-800 dark:text-rose-300">
              <span className="font-medium">{t("Cancelled")}</span>{" "}
              {t("on {{date}}", {
                date: new Date(doc.cancellation_date).toLocaleString(),
              })}
              {doc.cancellation_reason && (
                <span>{t(": {{reason}}", { reason: doc.cancellation_reason })}</span>
              )}
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
        title={t("Cancel {{id}}?", { id: formatAdjustmentDocDisplayId(doc) })}
        message={t(
          doc.type === "credit_note" || doc.type === "debit_note"
            ? "This will reverse the accounting impact on the original invoice's balance and customer credit. This action cannot be undone."
            : "This will reverse the accounting impact. This action cannot be undone."
        )}
        confirmButtonText={
          isCancelling ? t("Cancelling...") : t("Confirm Cancellation")
        }
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
        title={t("Cancel e-invoice for {{id}}?", {
          id: formatAdjustmentDocDisplayId(doc),
        })}
        message={t(
          "This sets the MyInvois document state to cancelled. The local document accounting stays intact — cancel the document separately if you want to reverse it."
        )}
        confirmButtonText={
          isCancellingEinvoice ? t("Cancelling...") : t("Cancel e-Invoice")
        }
        variant="danger"
      />

      {isPrinting && doc && (
        <AdjustmentDocPrintOverlay
          docs={[doc]}
          onComplete={() => setIsPrinting(false)}
        />
      )}
    </div>
  );
};

export default AdjustmentDocsDetailsPage;

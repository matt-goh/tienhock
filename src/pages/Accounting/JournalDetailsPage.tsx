// src/pages/Accounting/JournalDetailsPage.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  JournalEntry,
  JournalEntryLine,
  JournalEntryTypeInfo,
  AccountCode,
  CashReceiptVoucherData,
} from "../../types/types";
import {
  useAccountCodesCache,
  useJournalEntryTypesCache,
} from "../../utils/accounting/useAccountingCache";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import ChequeReuseWarning from "../../components/Accounting/ChequeReuseWarning";
import { printCashReceiptVoucherPDF } from "../../utils/accounting/CashReceiptVoucherPDF";
import { generateJournalVoucherPDF } from "../../utils/accounting/JournalVoucherPDFMake";
import { GREENTARGET_INFO } from "../../utils/invoice/einvoice/companyInfo";
import GreenTargetLogo from "../../utils/GreenTargetLogo.png";
import {
  IconFileText,
  IconPencil,
  IconTrash,
  IconX,
  IconPrinter,
  IconExternalLink,
  IconArrowBackUp,
} from "@tabler/icons-react";

const LEGACY_IMPORT_ENTRY_TYPE: string = "IMP";

const isLegacyImportEntry = (entry: JournalEntry): boolean =>
  entry.is_legacy_import === true ||
  entry.entry_type === LEGACY_IMPORT_ENTRY_TYPE;

const getVisibleReference = (entry: JournalEntry): string =>
  // Every journal keeps a hidden unique reference_no (IMP-… / BI-… / REC-…)
  // for internal tracking; the visible Journal No. is display_reference when set.
  entry.display_reference?.trim() || entry.reference_no;

const getDisplayEntryType = (entry: JournalEntry): string =>
  isLegacyImportEntry(entry)
    ? entry.display_entry_type || entry.entry_type
    : entry.entry_type;

const getVisibleLineReference = (
  line: JournalEntryLine,
  entry: JournalEntry
): string | undefined => {
  // Per-line override (e.g. C{invoice} on grouped cash receipts) first,
  // otherwise the entry's visible Journal No.
  return line.display_reference?.trim() || getVisibleReference(entry);
};

interface JournalDetailsContentProps {
  // Cached Tien Hock reference data; Green Target has no types endpoint and its
  // account codes live in the GT schema, so it passes empty lists and skips
  // the TH fetches entirely (line-level account_description covers display).
  entryTypes: JournalEntryTypeInfo[];
  accountCodes: AccountCode[];
  isGreenTarget: boolean;
}

const JournalDetailsContent: React.FC<JournalDetailsContentProps> = ({
  entryTypes,
  accountCodes,
  isGreenTarget,
}) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const apiBase: string = isGreenTarget ? "/greentarget/api" : "/api";
  const journalEntriesPath: string = isGreenTarget
    ? "/greentarget/accounting/journal-entries"
    : "/accounting/journal-entries";

  // Data state
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sticky header: measure the card header so the table column header can
  // stack directly beneath it when scrolled.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(0);

  useLayoutEffect(() => {
    const measure = (): void => {
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [entry]);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showActionErrorDialog, setShowActionErrorDialog] = useState(false);
  const [actionErrorData, setActionErrorData] = useState<{
    message: string;
    detail?: string;
    payment_id?: number;
    invoice_id?: string;
    suggestion?: string;
  } | null>(null);

  // Receipt voucher print state
  const [isLoadingVoucher, setIsLoadingVoucher] = useState(false);

  // Journal voucher PDF print state
  const [isPrintingJournal, setIsPrintingJournal] = useState(false);

  // Fetch entry data
  const fetchEntry = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`${apiBase}/journal-entries/${id}`);
      setEntry(response as JournalEntry);
    } catch (err: unknown) {
      console.error("Error fetching journal entry:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load journal entry: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [id, apiBase]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  // Get entry type name
  const getEntryTypeName = (code: string): string => {
    const type = entryTypes.find((t) => t.code === code);
    return type ? `${code} - ${type.name}` : code;
  };

  // Get account description. The cached chart wins; otherwise fall back to the
  // per-line description the detail endpoint returns (Green Target's chart is
  // not cached here, so this is what labels GT lines).
  const getAccountDescription = (
    code: string,
    lineDescription?: string
  ): string => {
    const account = accountCodes.find((a) => a.code === code);
    if (account) return `${code} - ${account.description}`;
    return lineDescription ? `${code} - ${lineDescription}` : code;
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Format datetime
  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format amount
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Handlers
  const handleBack = () => {
    navigate(journalEntriesPath);
  };

  const handleEdit = () => {
    navigate(`${journalEntriesPath}/${id}/edit`);
  };

  const handleConfirmCancel = async () => {
    if (!id) return;

    setIsProcessing(true);
    try {
      await api.post(`${apiBase}/journal-entries/${id}/cancel`);
      toast.success("Journal entry cancelled successfully");
      setShowCancelDialog(false);
      fetchEntry();
    } catch (err: unknown) {
      console.error("Error cancelling entry:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel entry";
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // Undo a cancellation. The server refuses when the cancellation was the
  // source document's doing, and explains why in the shared error dialog.
  const handleConfirmRestore = async () => {
    if (!id) return;

    setIsProcessing(true);
    try {
      await api.post(`${apiBase}/journal-entries/${id}/restore`);
      toast.success("Journal entry restored successfully");
      setShowRestoreDialog(false);
      fetchEntry();
    } catch (err: unknown) {
      console.error("Error restoring entry:", err);
      setShowRestoreDialog(false);

      const errorData = (err as any)?.data;
      if (errorData?.message) {
        setActionErrorData({
          message: errorData.message,
          detail: errorData.detail,
          suggestion: errorData.suggestion,
        });
        setShowActionErrorDialog(true);
      } else {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to restore entry";
        toast.error(errorMessage);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!id) return;

    setIsProcessing(true);
    try {
      await api.delete(`/api/journal-entries/${id}`);
      toast.success("Journal entry deleted successfully");
      setShowDeleteDialog(false);
      navigate(journalEntriesPath);
    } catch (err: unknown) {
      console.error("Error deleting entry:", err);

      // Close the delete confirmation dialog first
      setShowDeleteDialog(false);

      // Handle enhanced error response from backend
      const errorData = (err as any)?.data;

      if (errorData) {
        // Store error data and show error dialog
        setActionErrorData({
          message: errorData.message || "Failed to delete journal entry",
          detail: errorData.detail,
          payment_id: errorData.payment_id,
          invoice_id: errorData.invoice_id,
          suggestion: errorData.suggestion,
        });
        setShowActionErrorDialog(true);
      } else {
        // Fallback to simple toast error
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        toast.error(errorMessage || "Failed to delete entry");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle navigation to invoice from error dialog
  const handleGoToInvoice = () => {
    if (actionErrorData?.invoice_id) {
      setShowActionErrorDialog(false);
      navigate(`/sales/invoice/${actionErrorData.invoice_id}`);
    }
  };

  // Handle print receipt voucher (direct Blob print via the shared fallback)
  const handlePrintVoucher = async () => {
    if (!id) return;

    setIsLoadingVoucher(true);
    try {
      const response = await api.get(`/api/journal-entries/${id}/receipt-voucher`);
      await printCashReceiptVoucherPDF(response as CashReceiptVoucherData);
    } catch (err: unknown) {
      console.error("Error printing voucher:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to print voucher";
      toast.error(errorMessage);
    } finally {
      setIsLoadingVoucher(false);
    }
  };

  // Handle print journal voucher PDF (legacy "JOURNAL VOUCHER" report)
  const handlePrintJournalVoucher = async () => {
    if (!entry) return;

    setIsPrintingJournal(true);
    try {
      const accountDescriptions: Record<string, string> = {};
      (entry.lines || []).forEach((line) => {
        const account = accountCodes.find((a) => a.code === line.account_code);
        const description = account?.description ?? line.account_description;
        if (description) accountDescriptions[line.account_code] = description;
      });
      const visibleReference: string = getVisibleReference(entry);
      const displayEntryType: string = getDisplayEntryType(entry);
      const visibleLines: JournalEntryLine[] = (entry.lines || []).map(
        (line: JournalEntryLine): JournalEntryLine => ({
          ...line,
          reference: getVisibleLineReference(line, entry),
        })
      );
      await generateJournalVoucherPDF({
        reference_no: visibleReference,
        entry_type: displayEntryType,
        entry_type_name: getEntryTypeName(displayEntryType),
        entry_date: entry.entry_date,
        status: entry.status,
        description: entry.description,
        cheque_no: entry.cheque_no,
        lines: visibleLines,
        total_debit: entry.total_debit,
        total_credit: entry.total_credit,
        accountDescriptions,
        // Green Target prints the same voucher on its own letterhead/logo
        ...(isGreenTarget
          ? { companyInfo: GREENTARGET_INFO, logoUrl: GreenTargetLogo }
          : {}),
      });
    } catch (err: unknown) {
      console.error("Error printing journal voucher:", err);
      toast.error("Failed to generate voucher PDF");
    } finally {
      setIsPrintingJournal(false);
    }
  };

  // Status badge
  const getStatusBadge = (status: string) => {
    const isCancelled = status === "cancelled";
    return (
      <span
        className={`px-3 py-1 rounded-full text-sm font-medium ${
          isCancelled
            ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
            : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
        }`}
      >
        {isCancelled ? "Cancelled" : "Active"}
      </span>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (error || !entry) {
    return (
      <div className="space-y-3">
        <BackButton onClick={handleBack} />
        <div className="p-4 border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
          {error || "Journal entry not found"}
        </div>
      </div>
    );
  }

  // Any active, non-migration journal is editable. Editing a system-owned journal
  // (sales/purchase/receipt/payment/adjustment/voucher) DETACHES it from its source
  // on the server — it then shows the "Manual" badge and is managed by hand.
  // Migration (IMP) journals stay immutable and cannot be edited or cancelled.
  const isLegacyImport: boolean = isLegacyImportEntry(entry);
  const visibleReference: string = getVisibleReference(entry);
  const displayEntryType: string = getDisplayEntryType(entry);
  const canEdit: boolean = entry.status !== "cancelled" && !isLegacyImport;
  const canCancel: boolean = entry.status !== "cancelled" && !isLegacyImport;
  // Offered on every cancelled entry; the server decides whether this
  // particular cancellation may be undone and explains any refusal.
  const canRestore: boolean = entry.status === "cancelled" && !isLegacyImport;
  // Green Target has no DELETE journal route — its journals are cancelled only.
  const canDelete: boolean = !isLegacyImport && !isGreenTarget;
  const canPrintVoucher: boolean =
    !isGreenTarget &&
    !isLegacyImport &&
    (entry.entry_type as string) === "REC" &&
    entry.status !== "cancelled";
  // Other Cash/Bank Payment entries already carrying this cheque number
  const chequeDuplicates = entry.cheque_duplicates ?? [];

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div
          ref={headerRef}
          className="sticky top-0 z-30 px-6 py-4 border-b border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton onClick={handleBack} />
              <div className="h-8 w-px bg-default-300 dark:bg-gray-600"></div>
              <div className="p-2 bg-sky-50 dark:bg-sky-900/30 rounded-lg">
                <IconFileText
                  size={24}
                  className="text-sky-600 dark:text-sky-400"
                />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                    {visibleReference}
                  </h1>
                  {getStatusBadge(entry.status)}
                  {isLegacyImport && (
                    <span className="inline-flex rounded bg-default-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-default-500 dark:text-gray-400">
                      Legacy
                    </span>
                  )}
                  {entry.manual_override && (
                    <span
                      className="inline-flex rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                      title="Edited by hand — the invoice no longer updates this journal automatically."
                    >
                      Manual
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-default-500 dark:text-gray-400">
                  {getEntryTypeName(displayEntryType)} |{" "}
                  {formatDate(entry.entry_date)} | {entry.description || "-"}
                  {entry.cheque_no && (
                    <>
                      {" | Cheque: "}
                      <span
                        className={
                          chequeDuplicates.length > 0
                            ? "font-semibold text-amber-700 dark:text-amber-400"
                            : ""
                        }
                      >
                        {entry.cheque_no}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {entry.source && (
                <Button
                  onClick={() => navigate(entry.source!.path)}
                  variant="outline"
                  color="sky"
                  icon={IconExternalLink}
                  iconPosition="left"
                  title="Open the document that created this journal"
                >
                  {entry.source.label}
                </Button>
              )}
              {canPrintVoucher && (
                <Button
                  onClick={handlePrintVoucher}
                  variant="filled"
                  color="sky"
                  icon={IconPrinter}
                  iconPosition="left"
                  disabled={isLoadingVoucher}
                >
                  {isLoadingVoucher ? "Loading..." : "Print Voucher"}
                </Button>
              )}
              {!canPrintVoucher && (
                <Button
                  onClick={handlePrintJournalVoucher}
                  variant="filled"
                  color="sky"
                  icon={IconPrinter}
                  iconPosition="left"
                  disabled={isPrintingJournal}
                >
                  {isPrintingJournal ? "Preparing..." : "Print Voucher"}
                </Button>
              )}
              {canEdit && (
                <Button
                  onClick={handleEdit}
                  variant="outline"
                  color="sky"
                  icon={IconPencil}
                  iconPosition="left"
                  disabled={isProcessing}
                >
                  Edit
                </Button>
              )}
              {canCancel && (
                <Button
                  onClick={() => setShowCancelDialog(true)}
                  variant="outline"
                  color="rose"
                  icon={IconX}
                  iconPosition="left"
                  disabled={isProcessing}
                >
                  Cancel Entry
                </Button>
              )}
              {canRestore && (
                <Button
                  onClick={() => setShowRestoreDialog(true)}
                  variant="outline"
                  color="sky"
                  icon={IconArrowBackUp}
                  iconPosition="left"
                  disabled={isProcessing}
                >
                  Restore Entry
                </Button>
              )}
              {canDelete && (
                <Button
                  onClick={() => setShowDeleteDialog(true)}
                  variant="outline"
                  color="rose"
                  icon={IconTrash}
                  iconPosition="left"
                  disabled={isProcessing}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="p-6">
          {entry.cheque_no && (
            <ChequeReuseWarning
              chequeNo={entry.cheque_no}
              duplicates={chequeDuplicates}
              className="mb-4"
            />
          )}
          <div className="rounded-lg border border-default-200 dark:border-gray-700">
            <table className="min-w-full">
              <thead>
                <tr className="bg-default-100 dark:bg-gray-900/50">
                  <th
                    style={{ top: headerHeight }}
                    className="sticky z-20 bg-default-100 dark:bg-gray-800 px-4 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-12 rounded-tl-lg"
                  >
                    #
                  </th>
                  <th
                    style={{ top: headerHeight }}
                    className="sticky z-20 bg-default-100 dark:bg-gray-800 px-4 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Account
                  </th>
                  <th
                    style={{ top: headerHeight }}
                    className="sticky z-20 bg-default-100 dark:bg-gray-800 px-4 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-48"
                  >
                    Reference
                  </th>
                  <th
                    style={{ top: headerHeight }}
                    className="sticky z-20 bg-default-100 dark:bg-gray-800 px-4 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Particulars
                  </th>
                  <th
                    style={{ top: headerHeight }}
                    className="sticky z-20 bg-default-100 dark:bg-gray-800 px-4 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32"
                  >
                    Debit ($)
                  </th>
                  <th
                    style={{ top: headerHeight }}
                    className="sticky z-20 bg-default-100 dark:bg-gray-800 px-4 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32 rounded-tr-lg"
                  >
                    Credit ($)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-800 bg-white dark:bg-gray-800">
                {entry.lines && entry.lines.length > 0 ? (
                  entry.lines.map((line, index) => (
                    <tr
                      key={line.id || index}
                      className="hover:bg-default-50/50 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-4 py-2.5 text-sm text-default-500 dark:text-gray-400">
                        {String(line.line_number).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium text-default-900 dark:text-gray-100">
                          {getAccountDescription(
                            line.account_code,
                            line.account_description
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-default-600 dark:text-gray-300">
                        {getVisibleLineReference(line, entry) || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-default-600 dark:text-gray-300">
                        {line.particulars || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-default-900 dark:text-gray-100">
                        {line.debit_amount > 0
                          ? formatAmount(line.debit_amount)
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-default-900 dark:text-gray-100">
                        {line.credit_amount > 0
                          ? formatAmount(line.credit_amount)
                          : "-"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-default-500 dark:text-gray-400"
                    >
                      No line items found
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-default-100 dark:bg-gray-900/50 font-semibold">
                  <td
                    colSpan={4}
                    className="px-4 py-2.5 text-sm text-right text-default-700 dark:text-gray-300 rounded-bl-lg"
                  >
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-default-900 dark:text-gray-100">
                    {formatAmount(entry.total_debit)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-default-900 dark:text-gray-100 rounded-br-lg">
                    {formatAmount(entry.total_credit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Balance Check */}
          {Math.abs(entry.total_debit - entry.total_credit) > 0.01 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
              <strong>Warning:</strong> This entry is out of balance. Debits (
              {formatAmount(entry.total_debit)}) do not equal Credits (
              {formatAmount(entry.total_credit)}).
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="px-6 py-4 border-t border-default-200 dark:border-gray-700 bg-default-50/50 dark:bg-gray-900/30">
          <div className="flex flex-wrap gap-6 text-xs text-default-500 dark:text-gray-400">
            {entry.created_at && (
              <div>
                <span className="font-medium">Created:</span>{" "}
                {formatDateTime(entry.created_at)}
                {entry.created_by && ` by ${entry.created_by}`}
              </div>
            )}
            {entry.updated_at && entry.updated_at !== entry.created_at && (
              <div>
                <span className="font-medium">Updated:</span>{" "}
                {formatDateTime(entry.updated_at)}
                {entry.updated_by && ` by ${entry.updated_by}`}
              </div>
            )}
            {entry.posted_at && (
              <div>
                <span className="font-medium">Posted:</span>{" "}
                {formatDateTime(entry.posted_at)}
                {entry.posted_by && ` by ${entry.posted_by}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Journal Entry"
        message={`Are you sure you want to delete entry "${visibleReference}"? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleConfirmCancel}
        title="Cancel Journal Entry"
        message={`Are you sure you want to cancel entry "${visibleReference}"? This will mark the entry as cancelled.`}
        confirmButtonText="Cancel Entry"
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={showRestoreDialog}
        onClose={() => setShowRestoreDialog(false)}
        onConfirm={handleConfirmRestore}
        title="Restore Journal Entry"
        message={`Restore entry "${visibleReference}"? It will go back onto the ledger exactly as it was before it was cancelled.`}
        confirmButtonText="Restore Entry"
        variant="default"
      />

      {/* Delete Error Dialog */}
      {actionErrorData && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
            showActionErrorDialog ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowActionErrorDialog(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 border border-red-200 dark:border-red-800">
            {/* Header */}
            <div className="px-6 py-4 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">
                {actionErrorData.message}
              </h3>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-3">
              {actionErrorData.detail && (
                <p className="text-sm text-default-700 dark:text-gray-300">
                  {actionErrorData.detail}
                </p>
              )}

              {actionErrorData.suggestion && (
                <p className="text-sm text-default-600 dark:text-gray-400 italic">
                  {actionErrorData.suggestion}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/30 flex justify-end gap-3">
              {actionErrorData.invoice_id && (
                <Button
                  onClick={handleGoToInvoice}
                  color="sky"
                  variant="filled"
                  size="md"
                >
                  Go to Invoice #{actionErrorData.invoice_id}
                </Button>
              )}
              <Button
                onClick={() => {
                  setShowActionErrorDialog(false);
                  setActionErrorData(null);
                }}
                color="default"
                variant="outline"
                size="md"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Tien Hock fetches its cached entry types and chart of accounts; Green Target
// fetches its own entry types (G7 added the endpoint) and skips the chart —
// the GT detail payload carries per-line account descriptions.
const TienHockJournalDetails: React.FC = () => {
  const { entryTypes } = useJournalEntryTypesCache();
  const { accountCodes } = useAccountCodesCache();
  return (
    <JournalDetailsContent
      entryTypes={entryTypes}
      accountCodes={accountCodes}
      isGreenTarget={false}
    />
  );
};

const GreenTargetJournalDetails: React.FC = () => {
  const [entryTypes, setEntryTypes] = useState<JournalEntryTypeInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadTypes = async () => {
      try {
        const response = await api.get("/greentarget/api/journal-entries/types");
        if (!cancelled) setEntryTypes(response as JournalEntryTypeInfo[]);
      } catch (err: unknown) {
        console.error("Error fetching Green Target journal entry types:", err);
      }
    };
    loadTypes();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <JournalDetailsContent
      entryTypes={entryTypes}
      accountCodes={[]}
      isGreenTarget
    />
  );
};

interface JournalDetailsPageProps {
  company?: "tienhock" | "greentarget";
}

const JournalDetailsPage: React.FC<JournalDetailsPageProps> = ({
  company = "tienhock",
}) => {
  if (company === "greentarget") {
    return <GreenTargetJournalDetails />;
  }
  return <TienHockJournalDetails />;
};

export default JournalDetailsPage;

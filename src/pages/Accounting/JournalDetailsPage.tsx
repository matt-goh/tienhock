// src/pages/Accounting/JournalDetailsPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { JournalEntry } from "../../types/types";
import {
  useAccountCodesCache,
  useJournalEntryTypesCache,
} from "../../utils/accounting/useAccountingCache";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  IconFileText,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

const JournalDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // Cached reference data
  const { entryTypes } = useJournalEntryTypesCache();
  const { accountCodes } = useAccountCodesCache();

  // Data state
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch entry data
  const fetchEntry = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/journal-entries/${id}`);
      setEntry(response as JournalEntry);
    } catch (err: unknown) {
      console.error("Error fetching journal entry:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load journal entry: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  // Get entry type name
  const getEntryTypeName = (code: string): string => {
    const type = entryTypes.find((t) => t.code === code);
    return type ? `${code} - ${type.name}` : code;
  };

  // Get account description
  const getAccountDescription = (code: string): string => {
    const account = accountCodes.find((a) => a.code === code);
    return account ? `${code} - ${account.description}` : code;
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
    navigate("/accounting/journal-entries");
  };

  const handleEdit = () => {
    navigate(`/accounting/journal-entries/${id}/edit`);
  };

  const handleConfirmCancel = async () => {
    if (!id) return;

    setIsProcessing(true);
    try {
      await api.post(`/api/journal-entries/${id}/cancel`);
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

  const handleConfirmDelete = async () => {
    if (!id) return;

    setIsProcessing(true);
    try {
      await api.delete(`/api/journal-entries/${id}`);
      toast.success("Journal entry deleted successfully");
      setShowDeleteDialog(false);
      navigate("/accounting/journal-entries");
    } catch (err: unknown) {
      console.error("Error deleting entry:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete entry";
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
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

  const canEdit = entry.status !== "cancelled";
  const canCancel = entry.status !== "cancelled";
  const canDelete = true;

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
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
                    {entry.reference_no}
                  </h1>
                  {getStatusBadge(entry.status)}
                </div>
                <p className="mt-0.5 text-sm text-default-500 dark:text-gray-400">
                  {getEntryTypeName(entry.entry_type)} |{" "}
                  {formatDate(entry.entry_date)} | {entry.description || "-"}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
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
          <div className="overflow-hidden rounded-lg border border-default-200 dark:border-gray-700">
            <table className="min-w-full">
              <thead>
                <tr className="bg-default-100 dark:bg-gray-900/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-12">
                    #
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-28">
                    Reference
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider">
                    Particulars
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
                    Debit ($)
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
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
                      <td className="px-4 py-2.5 text-sm text-default-500 dark:text-gray-400 font-mono">
                        {String(line.line_number).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium text-default-900 dark:text-gray-100">
                          {getAccountDescription(line.account_code)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-default-600 dark:text-gray-300">
                        {line.reference || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-default-600 dark:text-gray-300">
                        {line.particulars || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono text-default-900 dark:text-gray-100">
                        {line.debit_amount > 0
                          ? formatAmount(line.debit_amount)
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono text-default-900 dark:text-gray-100">
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
                    className="px-4 py-2.5 text-sm text-right text-default-700 dark:text-gray-300"
                  >
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right font-mono text-default-900 dark:text-gray-100">
                    {formatAmount(entry.total_debit)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right font-mono text-default-900 dark:text-gray-100">
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
        message={`Are you sure you want to delete entry "${entry.reference_no}"? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleConfirmCancel}
        title="Cancel Journal Entry"
        message={`Are you sure you want to cancel entry "${entry.reference_no}"? This will mark the entry as cancelled.`}
        confirmButtonText="Cancel Entry"
        variant="danger"
      />
    </div>
  );
};

export default JournalDetailsPage;

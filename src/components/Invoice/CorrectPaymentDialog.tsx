import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import ConfirmationDialog from "../ConfirmationDialog";
import Checkbox from "../Checkbox";
import TimeNavigator, { type TimeRange } from "../TimeNavigator";
import { api } from "../../routes/utils/api";

interface CorrectionPreview {
  version: string;
  reference: string;
  payment_method: string;
  received_date: string;
  bank_account: string;
  total_amount: number;
  requires_journal_review: boolean;
  journals: Array<{ id: number; entry_date: string; manual_override: boolean }>;
  allocations: Array<{ invoice_id: string; customer_id: string; amount: string }>;
}

interface CorrectPaymentDialogProps {
  receiptId: number;
  onClose: () => void;
  onCorrected: () => void | Promise<void>;
}

const CorrectPaymentDialog: React.FC<CorrectPaymentDialogProps> = ({ receiptId, onClose, onCorrected }) => {
  const { t } = useTranslation("invoice");
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [reviewed, setReviewed] = useState<boolean>(false);
  const [range, setRange] = useState<TimeRange>(() => {
    const today: Date = new Date();
    return { start: today, end: today };
  });

  useEffect((): (() => void) => {
    let current: boolean = true;
    const load = async (): Promise<void> => {
      try {
        const result: CorrectionPreview = await api.get<CorrectionPreview>(`/api/receipts/${receiptId}/correction-preview`);
        if (!current) return;
        setPreview(result);
        const date: Date = new Date(`${result.received_date}T00:00:00`);
        setRange({ start: date, end: date });
      } catch (failure: unknown) {
        if (current) setError(failure instanceof Error ? failure.message : t("Could not review this payment."));
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return (): void => { current = false; };
  }, [receiptId, t]);

  const save = async (): Promise<void> => {
    if (!preview || saving || loading) return;
    if (!reason.trim()) {
      setError(t("Enter a reason for this correction."));
      return;
    }
    if (preview.requires_journal_review && !reviewed) {
      setError(t("Review and acknowledge the manually edited journal first."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post<{ receipt_ids: number[] }>(`/api/receipts/${receiptId}/correct-to-cheque`, {
        expected_version: preview.version,
        received_date: format(range.start, "yyyy-MM-dd"),
        reason: reason.trim(),
        reviewed_journals: reviewed,
      });
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : t("Could not correct this payment."));
      setSaving(false);
      return;
    }
    // Close after a successful commit even if refreshing the list fails, so
    // the same preview can never invite a second correction.
    toast.success(t("Payment corrected. The cheque is now pending clearance."));
    try {
      await onCorrected();
    } catch (failure: unknown) {
      console.error("Refreshing corrected payment failed:", failure);
      toast.error(t("Payment saved. Refresh the payment list to see the changes."));
    } finally {
      onClose();
    }
  };

  return (
    <ConfirmationDialog
      isOpen
      onClose={(): void => { if (!saving) onClose(); }}
      onConfirm={(): void => {
        if (!preview && !loading) onClose();
        else void save();
      }}
      title={t("Correct to pending cheque")}
      confirmButtonText={!preview && !loading ? t("close", { ns: "common" }) : saving ? t("Saving...") : t("Correct to pending cheque")}
      isConfirming={saving || loading}
      variant="default"
      allowContentOverflow
      message={
        <div className="space-y-3">
          {loading && <p>{t("Loading payment group...")}</p>}
          {preview && (
            <>
              <p className="font-semibold">{preview.reference} · RM {Number(preview.total_amount).toFixed(2)}</p>
              <p>{t("Recorded payment: {{method}}, {{date}}. Bank: {{bank}}.", {
                method: t(preview.payment_method === "online" ? "Online" : "Bank Transfer"),
                date: format(new Date(`${preview.received_date}T00:00:00`), "dd/MM/yyyy"),
                bank: preview.bank_account,
              })}</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {preview.allocations.map((allocation: CorrectionPreview["allocations"][number], index: number): React.ReactNode => (
                  <li key={`${allocation.invoice_id}-${index}`}>
                    {t("Invoice {{id}}", { id: allocation.invoice_id })} · {allocation.customer_id} · RM {Number(allocation.amount).toFixed(2)}
                  </li>
                ))}
              </ul>
              <div className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                {t("The original payment and its journal will be cancelled. Every invoice amount above will become outstanding again and reserved by the pending cheque. Confirm it only after the cheque actually clears the bank.")}
              </div>
              <div>
                <p className="mb-1 font-medium">{t("Cheque date")}</p>
                <TimeNavigator range={range} onChange={(value: TimeRange): void => setRange(value)} modes={["day"]} allowFuture presets={false} showArrows={false} size="sm" disabled={saving} className="w-full" triggerClassName="w-full justify-between" />
              </div>
              <div className="space-y-1">
                {preview.journals.map((journal: CorrectionPreview["journals"][number]): React.ReactNode => (
                  <a key={journal.id} href={`/accounting/journal-entries/${journal.id}`} target="_blank" rel="noreferrer" className="block text-sky-600 underline dark:text-sky-400">
                    {t("Review journal #{{id}} dated {{date}}", { id: journal.id, date: format(new Date(`${journal.entry_date}T00:00:00`), "dd/MM/yyyy") })}
                  </a>
                ))}
                {preview.requires_journal_review && (
                  <>
                    <p>{t("A journal was manually edited. Its bank and customer amounts still match this payment. The original journal will remain available as a cancelled record.")}</p>
                    <Checkbox checked={reviewed} onChange={(value: boolean): void => setReviewed(value)} disabled={saving} label={t("I reviewed the edited journal and agree to cancel it.")} />
                  </>
                )}
              </div>
              <label className="block">
                <span className="mb-1 block font-medium">{t("Correction reason")}</span>
                <textarea value={reason} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => setReason(event.target.value)} maxLength={1000} rows={2} disabled={saving} className="w-full rounded-lg border border-default-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-900" />
              </label>
            </>
          )}
          {error && <p role="alert" className="text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      }
    />
  );
};

export default CorrectPaymentDialog;

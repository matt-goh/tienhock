import React from "react";
import { useTranslation } from "react-i18next";
import type { PaymentCancellationErrorData } from "../../types/types";
import Button from "../Button";
import ConfirmationDialog from "../ConfirmationDialog";

interface PaymentCancellationErrorDialogProps {
  error: PaymentCancellationErrorData | null;
  onClose: () => void;
  onViewPaymentGroup: (receiptId: number) => void;
  onViewJournal: (journalEntryId: number) => void;
}

const PaymentCancellationErrorDialog: React.FC<
  PaymentCancellationErrorDialogProps
> = ({ error, onClose, onViewPaymentGroup, onViewJournal }) => {
  const { t } = useTranslation("invoice");
  const receiptId: number | undefined = error?.receipt_id;
  const journalEntryId: number | null | undefined =
    error?.receipt_journal_id;

  return (
    <ConfirmationDialog
      isOpen={error !== null}
      onClose={onClose}
      onConfirm={onClose}
      title={error?.message || t("This payment could not be cancelled.")}
      message={
        <div className="space-y-4">
          <p>
            {error?.detail || t("Please review the payment and try again.")}
          </p>
          {(receiptId || journalEntryId) && (
            <div className="flex flex-wrap gap-2">
              {receiptId && (
                <Button
                  type="button"
                  size="sm"
                  color="sky"
                  onClick={() => onViewPaymentGroup(receiptId)}
                >
                  {error?.receipt_reference
                    ? t("View Payment Group {{reference}}", {
                        reference: error.receipt_reference,
                      })
                    : t("View Related Payments")}
                </Button>
              )}
              {journalEntryId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  color="default"
                  onClick={() => onViewJournal(journalEntryId)}
                >
                  {error?.receipt_journal_reference_no
                    ? t("View Journal {{reference}}", {
                        reference: error.receipt_journal_reference_no,
                      })
                    : t("View Journal")}
                </Button>
              )}
            </div>
          )}
        </div>
      }
      confirmButtonText={t("close", { ns: "common" })}
      variant="default"
      hideCancelButton
    />
  );
};

export default PaymentCancellationErrorDialog;

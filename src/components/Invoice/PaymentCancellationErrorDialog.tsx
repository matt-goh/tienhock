import React from "react";
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
  const receiptId: number | undefined = error?.receipt_id;
  const journalEntryId: number | null | undefined =
    error?.receipt_journal_id;

  return (
    <ConfirmationDialog
      isOpen={error !== null}
      onClose={onClose}
      onConfirm={onClose}
      title={error?.message || "This payment could not be cancelled."}
      message={
        <div className="space-y-4">
          <p>
            {error?.detail || "Please review the payment and try again."}
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
                    ? `View Payment Group ${error.receipt_reference}`
                    : "View Related Payments"}
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
                  View Journal
                  {error.receipt_journal_reference_no
                    ? ` ${error.receipt_journal_reference_no}`
                    : ""}
                </Button>
              )}
            </div>
          )}
        </div>
      }
      confirmButtonText="Close"
      variant="default"
      hideCancelButton
    />
  );
};

export default PaymentCancellationErrorDialog;

import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconAlertTriangle,
  IconBan,
  IconExternalLink,
  IconFileInvoice,
  IconReceipt,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import Button from "../Button";
import ConfirmationDialog from "../ConfirmationDialog";

type ReceiptStatus = "pending" | "posted" | "cancelled";
type ReceiptAllocationType = "invoice" | "excess" | "account";

interface ReceiptAllocation {
  id: number;
  line_number: number;
  allocation_type: ReceiptAllocationType;
  invoice_id: string | null;
  customer_id: string | null;
  target_account: string | null;
  external_reference: string | null;
  amount: number | string;
  applied_amount: number | string;
  refunded_amount: number | string;
}

interface ReceiptDetails {
  id: number;
  payment_method: string;
  debit_account: string;
  display_reference: string | null;
  cheque_reference: string | null;
  received_date: string;
  posting_date: string | null;
  status: ReceiptStatus;
  total_amount: number | string;
  description: string | null;
  journal_entry_id: number | null;
  journal_reference_no: string | null;
  cancellation_date: string | null;
  cancellation_reason: string | null;
  allocations: ReceiptAllocation[];
}

interface ReceiptCancelResponse {
  message: string;
}

interface ReceiptDetailsDialogProps {
  receiptId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onCancelled: () => void | Promise<void>;
}

const formatCurrency = (amount: number | string): string => {
  const parsedAmount: number = Number(amount);

  if (!Number.isFinite(parsedAmount)) {
    return "RM 0.00";
  }

  return parsedAmount.toLocaleString("en-MY", {
    style: "currency",
    currency: "MYR",
  });
};

const formatReceiptDate = (value: string | null): string => {
  if (!value) {
    return "Not yet";
  }

  const date: Date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : format(date, "dd/MM/yyyy");
};

const formatPaymentMethod = (value: string): string => {
  return value
    .split("_")
    .map((part: string): string =>
      part.length > 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part
    )
    .join(" ");
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error && error.message ? error.message : fallback;
};

const getAllocationTitle = (allocation: ReceiptAllocation): string => {
  if (allocation.allocation_type === "invoice") {
    return allocation.invoice_id
      ? `Invoice ${allocation.invoice_id}`
      : "Invoice payment";
  }

  if (allocation.allocation_type === "excess") {
    return allocation.customer_id
      ? `Extra payment kept for customer ${allocation.customer_id}`
      : "Extra customer payment";
  }

  return allocation.external_reference
    ? `Payment for ${allocation.external_reference}`
    : "Payment to account";
};

const getStatusStyles = (status: ReceiptStatus): string => {
  if (status === "cancelled") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  }

  if (status === "pending") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }

  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
};

const getStatusLabel = (status: ReceiptStatus): string => {
  if (status === "cancelled") {
    return "Cancelled";
  }

  if (status === "pending") {
    return "Pending";
  }

  return "Paid";
};

const ReceiptDetailsDialog: React.FC<ReceiptDetailsDialogProps> = ({
  receiptId,
  isOpen,
  onClose,
  onCancelled,
}) => {
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [isCancelConfirmationOpen, setIsCancelConfirmationOpen] =
    useState<boolean>(false);

  const invoiceAllocations: ReceiptAllocation[] = useMemo(
    (): ReceiptAllocation[] =>
      receipt?.allocations.filter(
        (allocation: ReceiptAllocation): boolean =>
          allocation.allocation_type === "invoice" && Boolean(allocation.invoice_id)
      ) ?? [],
    [receipt]
  );

  const nonInvoiceAllocationCount: number =
    (receipt?.allocations.length ?? 0) - invoiceAllocations.length;

  const loadReceipt = useCallback(async (): Promise<void> => {
    if (!isOpen || receiptId === null) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const response: ReceiptDetails = await api.get<ReceiptDetails>(
        `/api/receipts/${receiptId}`
      );
      setReceipt(response);
    } catch (error: unknown) {
      console.error("Error loading receipt:", error);
      setReceipt(null);
      setLoadError(
        getErrorMessage(error, "We could not load this receipt. Please try again.")
      );
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, receiptId]);

  useEffect((): (() => void) => {
    let isCurrentRequest: boolean = true;

    const fetchReceipt = async (): Promise<void> => {
      if (!isOpen || receiptId === null) {
        return;
      }

      setReceipt(null);
      setIsLoading(true);
      setLoadError(null);

      try {
        const response: ReceiptDetails = await api.get<ReceiptDetails>(
          `/api/receipts/${receiptId}`
        );
        if (isCurrentRequest) {
          setReceipt(response);
        }
      } catch (error: unknown) {
        if (isCurrentRequest) {
          console.error("Error loading receipt:", error);
          setLoadError(
            getErrorMessage(
              error,
              "We could not load this receipt. Please try again."
            )
          );
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoading(false);
        }
      }
    };

    void fetchReceipt();

    return (): void => {
      isCurrentRequest = false;
    };
  }, [isOpen, receiptId]);

  useEffect((): void => {
    if (!isOpen) {
      setIsCancelConfirmationOpen(false);
      setIsCancelling(false);
    }
  }, [isOpen]);

  const handleClose = (): void => {
    if (!isCancelling) {
      setIsCancelConfirmationOpen(false);
      onClose();
    }
  };

  const handleCancelReceipt = async (): Promise<void> => {
    if (!receipt || receipt.status === "cancelled" || isCancelling) {
      return;
    }

    setIsCancelConfirmationOpen(false);
    setIsCancelling(true);

    try {
      await api.put<ReceiptCancelResponse>(`/api/receipts/${receipt.id}/cancel`, {});
      setReceipt((currentReceipt: ReceiptDetails | null): ReceiptDetails | null =>
        currentReceipt
          ? { ...currentReceipt, status: "cancelled" }
          : currentReceipt
      );
      toast.success("The entire receipt and all its payments were cancelled.");
    } catch (error: unknown) {
      console.error("Error cancelling receipt:", error);
      toast.error(
        getErrorMessage(
          error,
          "We could not cancel this receipt. No payments were changed."
        )
      );
      setIsCancelling(false);
      return;
    }

    try {
      await onCancelled();
    } catch (error: unknown) {
      console.error("Error refreshing invoice after cancelling receipt:", error);
    } finally {
      setIsCancelling(false);
      onClose();
    }
  };

  const affectedInvoiceText: string =
    invoiceAllocations.length === 1
      ? `invoice ${invoiceAllocations[0].invoice_id}`
      : `${invoiceAllocations.length} invoices`;

  const cancellationScopeText: string =
    invoiceAllocations.length > 0
      ? `${affectedInvoiceText}${
          nonInvoiceAllocationCount > 0
            ? ` and ${nonInvoiceAllocationCount} other payment ${
                nonInvoiceAllocationCount === 1 ? "amount" : "amounts"
              }`
            : ""
        }`
      : `${receipt?.allocations.length ?? 0} payment ${
          receipt?.allocations.length === 1 ? "amount" : "amounts"
        }`;

  const confirmationMessage: React.ReactNode = (
    <div className="space-y-3">
      <p>
        This receipt was shared across {cancellationScopeText}. Cancelling it
        will reverse every payment below together; you cannot cancel only one
        of them.
      </p>
      {receipt && receipt.allocations.length > 0 && (
        <ul className="space-y-1.5 rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
          {receipt.allocations.map(
            (allocation: ReceiptAllocation): React.ReactNode => (
              <li
                key={allocation.id}
                className="flex items-center justify-between gap-3"
              >
                {allocation.allocation_type === "invoice" && allocation.invoice_id ? (
                  <Link
                    to={`/sales/invoice/${allocation.invoice_id}`}
                    onClick={handleClose}
                    className="font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    Invoice {allocation.invoice_id}
                  </Link>
                ) : (
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    {getAllocationTitle(allocation)}
                  </span>
                )}
                <span className="whitespace-nowrap font-medium text-default-700 dark:text-gray-200">
                  {formatCurrency(allocation.amount)}
                </span>
              </li>
            )
          )}
        </ul>
      )}
      <p className="font-medium text-rose-600 dark:text-rose-300">
        This cannot be undone.
      </p>
    </div>
  );

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={handleClose}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="my-auto flex max-h-[calc(100vh-3rem)] w-full max-w-2xl transform flex-col overflow-hidden rounded-2xl border border-default-200 bg-white text-left align-middle shadow-xl ring-1 ring-black/5 transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40 dark:ring-white/10">
                  <div className="flex items-start justify-between gap-3 border-b border-default-200 bg-default-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/60">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300">
                        <IconReceipt size={20} />
                      </span>
                      <div>
                        <DialogTitle
                          as="h3"
                          className="text-base font-semibold text-default-800 dark:text-gray-100"
                        >
                          {receiptId === null ? "Receipt details" : `Receipt #${receiptId}`}
                        </DialogTitle>
                        <p className="text-xs text-default-500 dark:text-gray-400">
                          See every invoice paid by this receipt.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isCancelling}
                      className="rounded-lg p-1 text-default-400 transition-colors hover:bg-default-100 hover:text-default-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      aria-label="Close receipt details"
                    >
                      <IconX size={18} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-5">
                    {isLoading ? (
                      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-default-500 dark:text-gray-400">
                        <span className="h-8 w-8 animate-spin rounded-full border-2 border-default-200 border-t-sky-500 dark:border-gray-600 dark:border-t-sky-400" />
                        <p className="text-sm">Loading receipt details...</p>
                      </div>
                    ) : loadError ? (
                      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
                        <IconAlertTriangle
                          size={32}
                          className="text-amber-500 dark:text-amber-400"
                        />
                        <div>
                          <p className="font-medium text-default-800 dark:text-gray-100">
                            Receipt details could not be loaded
                          </p>
                          <p className="mt-1 max-w-md text-sm text-default-500 dark:text-gray-400">
                            {loadError}
                          </p>
                        </div>
                        <Button
                          type="button"
                          color="sky"
                          size="sm"
                          icon={IconRefresh}
                          onClick={() => void loadReceipt()}
                        >
                          Try Again
                        </Button>
                      </div>
                    ) : receipt ? (
                      <div className="space-y-5">
                        {receipt.allocations.length > 1 && receipt.status !== "cancelled" && (
                          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800/70 dark:bg-amber-900/20 dark:text-amber-100">
                            <IconAlertTriangle
                              size={20}
                              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                            />
                            <div>
                              <p className="text-sm font-semibold">
                                This receipt contains more than one payment
                              </p>
                              <p className="mt-1 text-sm leading-5">
                                These payments were recorded together as one receipt.
                                To keep every invoice correct, an individual payment
                                cannot be cancelled by itself. The entire receipt must
                                be cancelled together.
                              </p>
                            </div>
                          </div>
                        )}

                        {receipt.status === "cancelled" && (
                          <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-800/70 dark:bg-rose-900/20 dark:text-rose-100">
                            <IconBan
                              size={20}
                              className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
                            />
                            <div>
                              <p className="text-sm font-semibold">
                                This receipt has already been cancelled
                              </p>
                              <p className="mt-1 text-sm leading-5">
                                All payments belonging to this receipt were reversed
                                together.
                              </p>
                              {receipt.cancellation_reason && (
                                <p className="mt-1 text-xs opacity-80">
                                  Reason: {receipt.cancellation_reason}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">Status</p>
                            <span
                              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusStyles(
                                receipt.status
                              )}`}
                            >
                              {getStatusLabel(receipt.status)}
                            </span>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">Total received</p>
                            <p className="mt-1 text-sm font-semibold text-default-800 dark:text-gray-100">
                              {formatCurrency(receipt.total_amount)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">Received date</p>
                            <p className="mt-1 text-sm font-medium text-default-800 dark:text-gray-100">
                              {formatReceiptDate(receipt.received_date)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">Method</p>
                            <p className="mt-1 text-sm font-medium text-default-800 dark:text-gray-100">
                              {formatPaymentMethod(receipt.payment_method)}
                            </p>
                          </div>
                        </div>

                        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs text-default-500 dark:text-gray-400">Payment reference</dt>
                            <dd className="mt-0.5 font-mono text-default-800 dark:text-gray-100">
                              {receipt.display_reference || receipt.cheque_reference || "-"}
                            </dd>
                          </div>
                          {receipt.cheque_reference &&
                            receipt.cheque_reference !== receipt.display_reference && (
                              <div>
                                <dt className="text-xs text-default-500 dark:text-gray-400">Cheque number</dt>
                                <dd className="mt-0.5 font-mono text-default-800 dark:text-gray-100">
                                  {receipt.cheque_reference}
                                </dd>
                              </div>
                            )}
                          <div>
                            <dt className="text-xs text-default-500 dark:text-gray-400">Description</dt>
                            <dd className="mt-0.5 text-default-800 dark:text-gray-100">
                              {receipt.description || "-"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-default-500 dark:text-gray-400">Journal entry</dt>
                            <dd className="mt-0.5">
                              {receipt.journal_entry_id ? (
                                <Link
                                  to={`/accounting/journal-entries/${receipt.journal_entry_id}`}
                                  onClick={handleClose}
                                  className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline dark:text-sky-400"
                                >
                                  <IconReceipt size={15} />
                                  <span className="font-mono">
                                    {receipt.journal_reference_no || `#${receipt.journal_entry_id}`}
                                  </span>
                                  <IconExternalLink size={13} />
                                </Link>
                              ) : receipt.status === "pending" ? (
                                <span className="text-default-500 dark:text-gray-400">
                                  Not created yet while this payment is pending
                                </span>
                              ) : (
                                <span className="text-default-500 dark:text-gray-400">None</span>
                              )}
                            </dd>
                          </div>
                        </dl>

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-default-800 dark:text-gray-100">
                              Payments covered by this receipt
                            </h4>
                            <span className="text-xs text-default-500 dark:text-gray-400">
                              {receipt.allocations.length} {receipt.allocations.length === 1 ? "payment" : "payments"}
                            </span>
                          </div>
                          <ul className="divide-y divide-default-200 overflow-hidden rounded-xl border border-default-200 dark:divide-gray-700 dark:border-gray-700">
                            {receipt.allocations.map(
                              (allocation: ReceiptAllocation): React.ReactNode => (
                                <li
                                  key={allocation.id}
                                  className="flex items-center justify-between gap-4 px-4 py-3"
                                >
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300">
                                      <IconFileInvoice size={17} />
                                    </span>
                                    <div className="min-w-0">
                                      {allocation.allocation_type === "invoice" && allocation.invoice_id ? (
                                        <Link
                                          to={`/sales/invoice/${allocation.invoice_id}`}
                                          onClick={handleClose}
                                          className="inline-flex items-center gap-1 truncate text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
                                        >
                                          Invoice {allocation.invoice_id}
                                          <IconExternalLink size={13} className="shrink-0" />
                                        </Link>
                                      ) : (
                                        <p className="truncate text-sm font-medium text-default-800 dark:text-gray-100">
                                          {getAllocationTitle(allocation)}
                                        </p>
                                      )}
                                      {allocation.customer_id && (
                                        <p className="truncate text-xs text-default-500 dark:text-gray-400">
                                          Customer {allocation.customer_id}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-sm font-semibold text-default-800 dark:text-gray-100">
                                    {formatCurrency(allocation.amount)}
                                  </span>
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-h-52 items-center justify-center text-sm text-default-500 dark:text-gray-400">
                        Select a receipt to view its details.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-default-200 px-5 py-3 dark:border-gray-700">
                    <p className="text-xs text-default-500 dark:text-gray-400">
                      {receipt?.status === "cancelled"
                        ? "This receipt can no longer be changed."
                        : receipt?.allocations.length && receipt.allocations.length > 1
                        ? "Cancelling reverses every payment shown above."
                        : "Cancelling reverses this receipt's payment."}
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleClose}
                        disabled={isCancelling}
                      >
                        Close
                      </Button>
                      <Button
                        type="button"
                        color="rose"
                        variant="filled"
                        size="sm"
                        icon={IconBan}
                        onClick={() => setIsCancelConfirmationOpen(true)}
                        disabled={
                          !receipt ||
                          receipt.status === "cancelled" ||
                          isLoading ||
                          isCancelling
                        }
                      >
                        {isCancelling ? "Cancelling..." : "Cancel Entire Receipt"}
                      </Button>
                    </div>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      <ConfirmationDialog
        isOpen={isCancelConfirmationOpen}
        onClose={() => setIsCancelConfirmationOpen(false)}
        onConfirm={() => void handleCancelReceipt()}
        title={`Cancel receipt #${receipt?.id ?? receiptId ?? ""}?`}
        message={confirmationMessage}
        confirmButtonText="Cancel Entire Receipt"
        variant="danger"
      />
    </>
  );
};

export default ReceiptDetailsDialog;

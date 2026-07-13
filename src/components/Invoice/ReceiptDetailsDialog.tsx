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
  IconCircleCheck,
  IconExternalLink,
  IconFileInvoice,
  IconReceipt,
  IconRefresh,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import Button from "../Button";
import ConfirmationDialog from "../ConfirmationDialog";

type PaymentGroupStatus = "pending" | "posted" | "mixed" | "cancelled";
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

interface PaymentGroupJournal {
  id: number;
  reference_no: string | null;
}

interface PaymentGroupDetails {
  payment_method: string;
  debit_account: string;
  display_reference: string | null;
  cheque_references: string[];
  received_date: string;
  status: PaymentGroupStatus;
  total_amount: number | string;
  journals: PaymentGroupJournal[];
  cancellation_reasons: string[];
  origin: "erp" | "import_opening";
  allocations: ReceiptAllocation[];
}

interface ReceiptCancelResponse {
  message: string;
}

interface ReceiptConfirmResponse {
  message: string;
  confirmed_receipt_count: number;
  confirmed_payment_count: number;
  payment_group: PaymentGroupDetails;
}

interface ReceiptReferenceUpdateResponse {
  message: string;
  receipt: {
    id: number;
    display_reference: string | null;
  };
  updated_receipt_count: number;
  updated_payment_count: number;
}

interface ReceiptDetailsDialogProps {
  receiptId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmed: () => void | Promise<void>;
  onCancelled: () => void | Promise<void>;
  onReferenceUpdated: () => void | Promise<void>;
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

const getStatusStyles = (status: PaymentGroupStatus): string => {
  if (status === "cancelled") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  }

  if (status === "pending") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }

  if (status === "mixed") {
    return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  }

  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
};

const getStatusLabel = (status: PaymentGroupStatus): string => {
  if (status === "cancelled") {
    return "Cancelled";
  }

  if (status === "pending") {
    return "Pending";
  }

  if (status === "mixed") {
    return "Partly confirmed";
  }

  return "Paid";
};

const ReceiptDetailsDialog: React.FC<ReceiptDetailsDialogProps> = ({
  receiptId,
  isOpen,
  onClose,
  onConfirmed,
  onCancelled,
  onReferenceUpdated,
}) => {
  const [paymentGroup, setPaymentGroup] =
    useState<PaymentGroupDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isCancelConfirmationOpen, setIsCancelConfirmationOpen] =
    useState<boolean>(false);
  const [isConfirmConfirmationOpen, setIsConfirmConfirmationOpen] =
    useState<boolean>(false);
  const [isEditingReference, setIsEditingReference] =
    useState<boolean>(false);
  const [referenceValue, setReferenceValue] = useState<string>("");
  const [isSavingReference, setIsSavingReference] =
    useState<boolean>(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const invoiceAllocations: ReceiptAllocation[] = useMemo(
    (): ReceiptAllocation[] =>
      paymentGroup?.allocations.filter(
        (allocation: ReceiptAllocation): boolean =>
          allocation.allocation_type === "invoice" && Boolean(allocation.invoice_id)
      ) ?? [],
    [paymentGroup]
  );

  const nonInvoiceAllocationCount: number =
    (paymentGroup?.allocations.length ?? 0) - invoiceAllocations.length;
  const canEditReference: boolean = Boolean(
    paymentGroup &&
      paymentGroup.status !== "cancelled" &&
      paymentGroup.origin === "erp" &&
      paymentGroup.payment_method !== "cash"
  );
  const canConfirmGroup: boolean = Boolean(
    paymentGroup &&
      paymentGroup.origin === "erp" &&
      (paymentGroup.status === "pending" || paymentGroup.status === "mixed")
  );

  const loadPaymentGroup = useCallback(async (): Promise<void> => {
    if (!isOpen || receiptId === null) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const response: PaymentGroupDetails = await api.get<PaymentGroupDetails>(
        `/api/receipts/${receiptId}/group`
      );
      setPaymentGroup(response);
    } catch (error: unknown) {
      console.error("Error loading payment group:", error);
      setPaymentGroup(null);
      setLoadError(
        getErrorMessage(error, "We could not load this payment group. Please try again.")
      );
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, receiptId]);

  useEffect((): (() => void) => {
    let isCurrentRequest: boolean = true;

    const fetchPaymentGroup = async (): Promise<void> => {
      if (!isOpen || receiptId === null) {
        return;
      }

      setPaymentGroup(null);
      setIsLoading(true);
      setLoadError(null);

      try {
        const response: PaymentGroupDetails = await api.get<PaymentGroupDetails>(
          `/api/receipts/${receiptId}/group`
        );
        if (isCurrentRequest) {
          setPaymentGroup(response);
        }
      } catch (error: unknown) {
        if (isCurrentRequest) {
          console.error("Error loading payment group:", error);
          setLoadError(
            getErrorMessage(
              error,
              "We could not load this payment group. Please try again."
            )
          );
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoading(false);
        }
      }
    };

    void fetchPaymentGroup();

    return (): void => {
      isCurrentRequest = false;
    };
  }, [isOpen, receiptId]);

  useEffect((): void => {
    if (!isOpen) {
      setIsCancelConfirmationOpen(false);
      setIsConfirmConfirmationOpen(false);
      setIsCancelling(false);
      setIsConfirming(false);
      setIsEditingReference(false);
      setReferenceValue("");
      setIsSavingReference(false);
      setReferenceError(null);
    }
  }, [isOpen]);

  useEffect((): void => {
    setIsEditingReference(false);
    setReferenceValue("");
    setReferenceError(null);
  }, [receiptId]);

  const handleClose = (): void => {
    if (!isCancelling && !isConfirming && !isSavingReference) {
      setIsCancelConfirmationOpen(false);
      setIsConfirmConfirmationOpen(false);
      onClose();
    }
  };

  const handleStartReferenceEdit = (): void => {
    if (!paymentGroup || isConfirming) return;
    setReferenceValue(paymentGroup.display_reference || "");
    setReferenceError(null);
    setIsEditingReference(true);
  };

  const handleCancelReferenceEdit = (): void => {
    if (isSavingReference || isConfirming) return;
    setIsEditingReference(false);
    setReferenceValue("");
    setReferenceError(null);
  };

  const handleSaveReference = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (
      !paymentGroup ||
      receiptId === null ||
      isSavingReference ||
      isConfirming
    ) {
      return;
    }

    const nextReference: string = referenceValue.trim();
    if (!nextReference) {
      setReferenceError("Enter a payment reference.");
      return;
    }
    if (nextReference === paymentGroup.display_reference) {
      handleCancelReferenceEdit();
      return;
    }

    setIsSavingReference(true);
    setReferenceError(null);
    try {
      const response: ReceiptReferenceUpdateResponse =
        await api.patch<ReceiptReferenceUpdateResponse>(
          `/api/receipts/${receiptId}/reference`,
          {
            expected_reference: paymentGroup.display_reference,
            reference: nextReference,
          }
        );
      setPaymentGroup(
        (currentGroup: PaymentGroupDetails | null): PaymentGroupDetails | null =>
          currentGroup
            ? {
                ...currentGroup,
                display_reference: response.receipt.display_reference,
              }
            : currentGroup
      );
      setIsEditingReference(false);
      setReferenceValue("");
      toast.success("Payment reference updated for all payments in this group.");
    } catch (error: unknown) {
      console.error("Error updating receipt reference:", error);
      setReferenceError(
        getErrorMessage(
          error,
          "We couldn't update this payment reference. No payment details were changed."
        )
      );
      setIsSavingReference(false);
      return;
    }

    try {
      await onReferenceUpdated();
    } catch (error: unknown) {
      console.error("Error refreshing payments after reference update:", error);
    } finally {
      setIsSavingReference(false);
    }
  };

  const handleConfirmPaymentGroup = async (): Promise<void> => {
    if (
      !paymentGroup ||
      receiptId === null ||
      !canConfirmGroup ||
      isConfirming
    ) {
      return;
    }

    setIsConfirmConfirmationOpen(false);
    setIsConfirming(true);

    try {
      const response: ReceiptConfirmResponse =
        await api.put<ReceiptConfirmResponse>(
          `/api/receipts/${receiptId}/group/confirm`,
          {}
        );
      setPaymentGroup(response.payment_group);
      toast.success(
        response.confirmed_payment_count === 1
          ? "The pending payment was confirmed."
          : `${response.confirmed_payment_count} pending payments were confirmed together.`
      );
    } catch (error: unknown) {
      console.error("Error confirming payment group:", error);
      toast.error(
        getErrorMessage(
          error,
          "We could not confirm this payment group. No payments were changed."
        )
      );
      setIsConfirming(false);
      return;
    }

    try {
      await onConfirmed();
    } catch (error: unknown) {
      console.error("Error refreshing payments after group confirmation:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelPaymentGroup = async (): Promise<void> => {
    if (
      !paymentGroup ||
      receiptId === null ||
      paymentGroup.status === "cancelled" ||
      isCancelling ||
      isConfirming
    ) {
      return;
    }

    setIsCancelConfirmationOpen(false);
    setIsCancelling(true);

    try {
      await api.put<ReceiptCancelResponse>(
        `/api/receipts/${receiptId}/group/cancel`,
        {}
      );
      setPaymentGroup(
        (currentGroup: PaymentGroupDetails | null): PaymentGroupDetails | null =>
          currentGroup ? { ...currentGroup, status: "cancelled" } : currentGroup
      );
      toast.success("The payment group and all its payments were cancelled.");
    } catch (error: unknown) {
      console.error("Error cancelling payment group:", error);
      toast.error(
        getErrorMessage(
          error,
          "We could not cancel this payment group. No payments were changed."
        )
      );
      setIsCancelling(false);
      return;
    }

    try {
      await onCancelled();
    } catch (error: unknown) {
      console.error("Error refreshing invoice after cancelling payment group:", error);
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
      : `${paymentGroup?.allocations.length ?? 0} payment ${
          paymentGroup?.allocations.length === 1 ? "amount" : "amounts"
        }`;

  const cancellationConfirmationMessage: React.ReactNode = (
    <div className="space-y-3">
      <p>
        Payment reference {paymentGroup?.display_reference || "this group"} covers{" "}
        {cancellationScopeText}. Cancelling this group will reverse every payment
        below together; you cannot cancel only one of them.
      </p>
      {paymentGroup && paymentGroup.allocations.length > 0 && (
        <ul className="space-y-1.5 rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
          {paymentGroup.allocations.map(
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

  const groupConfirmationMessage: React.ReactNode = (
    <div className="space-y-3">
      <p>
        Every payment still marked Pending under reference{" "}
        {paymentGroup?.display_reference || "this group"} will be confirmed
        together. Payments already confirmed will not be changed.
      </p>
      <p>
        The related invoice balances will be updated and their journal entries
        will be created using the payment details already recorded.
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
                <DialogPanel className="my-auto flex max-h-[calc(100vh-3rem)] w-full max-w-3xl transform flex-col overflow-hidden rounded-2xl border border-default-200 bg-white text-left align-middle shadow-xl ring-1 ring-black/5 transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40 dark:ring-white/10">
                  <div className="flex items-start justify-between gap-3 border-b border-default-200 bg-default-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/60">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300">
                        <IconReceipt size={20} />
                      </span>
                      <div className="min-w-0">
                        <DialogTitle
                          as="h3"
                          className="break-all text-base font-semibold text-default-800 dark:text-gray-100"
                        >
                          {paymentGroup?.display_reference
                            ? `Payment Group ${paymentGroup.display_reference}`
                            : "Payment Group Details"}
                        </DialogTitle>
                        <p className="text-xs text-default-500 dark:text-gray-400">
                          See every invoice paid under this reference.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isCancelling || isConfirming || isSavingReference}
                      className="rounded-lg p-1 text-default-400 transition-colors hover:bg-default-100 hover:text-default-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      aria-label="Close payment group details"
                    >
                      <IconX size={18} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-5">
                    {isLoading ? (
                      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-default-500 dark:text-gray-400">
                        <span className="h-8 w-8 animate-spin rounded-full border-2 border-default-200 border-t-sky-500 dark:border-gray-600 dark:border-t-sky-400" />
                        <p className="text-sm">Loading payment group...</p>
                      </div>
                    ) : loadError ? (
                      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
                        <IconAlertTriangle
                          size={32}
                          className="text-amber-500 dark:text-amber-400"
                        />
                        <div>
                          <p className="font-medium text-default-800 dark:text-gray-100">
                            Payment group could not be loaded
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
                          onClick={() => void loadPaymentGroup()}
                        >
                          Try Again
                        </Button>
                      </div>
                    ) : paymentGroup ? (
                      <div className="space-y-5">
                        {paymentGroup.allocations.length > 1 &&
                          paymentGroup.status !== "cancelled" && (
                          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800/70 dark:bg-amber-900/20 dark:text-amber-100">
                            <IconAlertTriangle
                              size={20}
                              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                            />
                            <div>
                              <p className="text-sm font-semibold">
                                This reference includes more than one payment
                              </p>
                              <p className="mt-1 text-sm leading-5">
                                To keep every invoice correct, pending payments are
                                confirmed together and payments must also be
                                cancelled as a group.
                              </p>
                            </div>
                          </div>
                        )}

                        {paymentGroup.status === "cancelled" && (
                          <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-800/70 dark:bg-rose-900/20 dark:text-rose-100">
                            <IconBan
                              size={20}
                              className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
                            />
                            <div>
                              <p className="text-sm font-semibold">
                                This payment group has already been cancelled
                              </p>
                              <p className="mt-1 text-sm leading-5">
                                All payments belonging to this group were reversed
                                together.
                              </p>
                              {paymentGroup.cancellation_reasons.length > 0 && (
                                <p className="mt-1 text-xs opacity-80">
                                  Reason: {paymentGroup.cancellation_reasons.join("; ")}
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
                                paymentGroup.status
                              )}`}
                            >
                              {getStatusLabel(paymentGroup.status)}
                            </span>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">Total received</p>
                            <p className="mt-1 text-sm font-semibold text-default-800 dark:text-gray-100">
                              {formatCurrency(paymentGroup.total_amount)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">Received date</p>
                            <p className="mt-1 text-sm font-medium text-default-800 dark:text-gray-100">
                              {formatReceiptDate(paymentGroup.received_date)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">Method</p>
                            <p className="mt-1 text-sm font-medium text-default-800 dark:text-gray-100">
                              {formatPaymentMethod(paymentGroup.payment_method)}
                            </p>
                          </div>
                        </div>

                        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-default-500 dark:text-gray-400">Payment reference</dt>
                            <dd className="mt-1 text-default-800 dark:text-gray-100">
                              {isEditingReference ? (
                                <form
                                  onSubmit={handleSaveReference}
                                  className="space-y-2"
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                      type="text"
                                      value={referenceValue}
                                      onChange={(
                                        event: React.ChangeEvent<HTMLInputElement>
                                      ): void => {
                                        setReferenceValue(event.target.value);
                                        setReferenceError(null);
                                      }}
                                      maxLength={100}
                                      autoFocus
                                      disabled={isSavingReference || isConfirming}
                                      className="h-9 min-w-0 flex-1 rounded-lg border border-default-300 bg-white px-3 font-mono text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                      aria-label="New payment reference"
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleCancelReferenceEdit}
                                        disabled={isSavingReference || isConfirming}
                                        className="flex-1 sm:flex-none"
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="submit"
                                        size="sm"
                                        color="sky"
                                        disabled={isSavingReference || isConfirming}
                                        className="flex-1 sm:flex-none"
                                      >
                                        {isSavingReference
                                          ? "Saving..."
                                          : "Save Reference"}
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-default-500 dark:text-gray-400">
                                    This updates every payment in the same
                                    reference group. Amounts and payment status
                                    will not change.
                                  </p>
                                  {referenceError && (
                                    <p className="text-xs text-rose-600 dark:text-rose-300">
                                      {referenceError}
                                    </p>
                                  )}
                                </form>
                              ) : (
                                <div className="inline-flex max-w-full items-center gap-2">
                                  <span className="min-w-0 break-all font-mono leading-7">
                                    {paymentGroup.display_reference ||
                                      paymentGroup.cheque_references[0] ||
                                      "-"}
                                  </span>
                                  {canEditReference && (
                                    <button
                                      type="button"
                                      onClick={handleStartReferenceEdit}
                                      disabled={isConfirming}
                                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-sky-600 hover:bg-sky-50 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-400 dark:hover:bg-sky-900/30 dark:hover:text-sky-300"
                                      title="Edit payment reference"
                                      aria-label="Edit payment reference"
                                    >
                                      <IconPencil size={14} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </dd>
                          </div>
                          {paymentGroup.cheque_references.length > 0 && (
                            <div>
                              <dt className="text-xs text-default-500 dark:text-gray-400">
                                {paymentGroup.cheque_references.length === 1
                                  ? "Cheque number"
                                  : "Cheque numbers"}
                              </dt>
                              <dd className="mt-0.5 font-mono text-default-800 dark:text-gray-100">
                                {paymentGroup.cheque_references.join(", ")}
                              </dd>
                            </div>
                          )}
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-default-500 dark:text-gray-400">
                              {paymentGroup.journals.length === 1
                                ? "Journal entry"
                                : "Journal entries"}
                            </dt>
                            <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                              {paymentGroup.journals.length > 0 ? (
                                paymentGroup.journals.map(
                                  (journal: PaymentGroupJournal): React.ReactNode => (
                                    <Link
                                      key={journal.id}
                                      to={`/accounting/journal-entries/${journal.id}`}
                                      onClick={handleClose}
                                      className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline dark:text-sky-400"
                                    >
                                      <IconReceipt size={15} />
                                      <span className="font-mono">
                                        {journal.reference_no || "View Journal"}
                                      </span>
                                      <IconExternalLink size={13} />
                                    </Link>
                                  )
                                )
                              ) : paymentGroup.status === "pending" ? (
                                <span className="text-default-500 dark:text-gray-400">
                                  Not created yet while these payments are pending
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
                              Payments in this group
                            </h4>
                            <span className="text-xs text-default-500 dark:text-gray-400">
                              {paymentGroup.allocations.length}{" "}
                              {paymentGroup.allocations.length === 1
                                ? "payment"
                                : "payments"}
                            </span>
                          </div>
                          <ul className="divide-y divide-default-200 overflow-hidden rounded-xl border border-default-200 dark:divide-gray-700 dark:border-gray-700">
                            {paymentGroup.allocations.map(
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
                        Select a payment group to view its details.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-default-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
                    <p className="text-xs text-default-500 dark:text-gray-400">
                      {paymentGroup?.status === "cancelled"
                        ? "This payment group can no longer be changed."
                        : canConfirmGroup
                        ? "Confirming applies every pending payment in this group together."
                        : paymentGroup?.allocations.length &&
                          paymentGroup.allocations.length > 1
                        ? "Cancelling reverses every payment shown above."
                        : "Cancelling reverses this payment."}
                    </p>
                    <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleClose}
                        disabled={isCancelling || isConfirming || isSavingReference}
                        className="flex-1 sm:flex-none"
                      >
                        Close
                      </Button>
                      {canConfirmGroup && (
                        <Button
                          type="button"
                          color="sky"
                          variant="filled"
                          size="sm"
                          icon={IconCircleCheck}
                          onClick={() => setIsConfirmConfirmationOpen(true)}
                          className="flex-1 sm:flex-none"
                          disabled={
                            isLoading ||
                            isCancelling ||
                            isConfirming ||
                            isSavingReference
                          }
                        >
                          {isConfirming
                            ? "Confirming..."
                            : "Confirm Payment Group"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        color="rose"
                        variant="filled"
                        size="sm"
                        icon={IconBan}
                        onClick={() => setIsCancelConfirmationOpen(true)}
                        className="flex-1 sm:flex-none"
                        disabled={
                          !paymentGroup ||
                          paymentGroup.status === "cancelled" ||
                          isLoading ||
                          isCancelling ||
                          isConfirming ||
                          isSavingReference
                        }
                      >
                        {isCancelling ? "Cancelling..." : "Cancel Payment Group"}
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
        isOpen={isConfirmConfirmationOpen}
        onClose={() => setIsConfirmConfirmationOpen(false)}
        onConfirm={() => void handleConfirmPaymentGroup()}
        title={`Confirm payment group ${
          paymentGroup?.display_reference || ""
        }?`}
        message={groupConfirmationMessage}
        confirmButtonText="Confirm All Pending Payments"
        variant="success"
      />

      <ConfirmationDialog
        isOpen={isCancelConfirmationOpen}
        onClose={() => setIsCancelConfirmationOpen(false)}
        onConfirm={() => void handleCancelPaymentGroup()}
        title={`Cancel payment group ${
          paymentGroup?.display_reference || ""
        }?`}
        message={cancellationConfirmationMessage}
        confirmButtonText="Cancel Payment Group"
        variant="danger"
      />
    </>
  );
};

export default ReceiptDetailsDialog;

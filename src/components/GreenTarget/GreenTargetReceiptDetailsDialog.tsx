import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconBan,
  IconCircleCheck,
  IconExternalLink,
  IconFileInvoice,
  IconPencil,
  IconReceipt,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { greenTargetApi } from "../../routes/greentarget/api";
import type {
  GreenTargetReceiptGroupAllocation,
  GreenTargetReceiptGroupDetails,
  GreenTargetReceiptStatus,
} from "../../types/greenTargetTypes";
import Button from "../Button";
import ConfirmationDialog from "../ConfirmationDialog";
import LoadingSpinner from "../LoadingSpinner";

type ReceiptMutation = "reference" | "confirm" | "cancel";

interface GreenTargetReceiptDetailsDialogProps {
  receiptId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

const formatCurrency = (amount: number): string => {
  const numericAmount: number = Number(amount);
  return (Number.isFinite(numericAmount) ? numericAmount : 0).toLocaleString(
    "en-MY",
    { style: "currency", currency: "MYR" }
  );
};

const formatReceiptDate = (value: string | null): string => {
  if (!value) return "Not yet";
  const date: Date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : format(date, "dd/MM/yyyy");
};

const formatDateInputValue = (value: string | null): string => {
  if (!value) return "";
  const date: Date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd");
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
  if (typeof error !== "object" || error === null) return fallback;
  const apiError: { message?: string; data?: { message?: string } } = error as {
    message?: string;
    data?: { message?: string };
  };
  return apiError.data?.message || apiError.message || fallback;
};

const getStatusLabel = (status: GreenTargetReceiptStatus): string => {
  if (status === "pending") return "Pending";
  if (status === "cancelled") return "Cancelled";
  return "Settled";
};

const getStatusClassName = (status: GreenTargetReceiptStatus): string => {
  if (status === "pending") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }
  if (status === "cancelled") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  }
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
};

const GreenTargetReceiptDetailsDialog: React.FC<
  GreenTargetReceiptDetailsDialogProps
> = ({ receiptId, isOpen, onClose, onChanged }) => {
  const [details, setDetails] =
    useState<GreenTargetReceiptGroupDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutation, setMutation] = useState<ReceiptMutation | null>(null);
  const [editingReference, setEditingReference] = useState<boolean>(false);
  const [referenceValue, setReferenceValue] = useState<string>("");
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [clearanceDate, setClearanceDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const detailsRequestIdRef = useRef<number>(0);

  useEffect((): (() => void) => {
    let isCurrentRequest: boolean = true;
    const requestId: number = detailsRequestIdRef.current + 1;
    detailsRequestIdRef.current = requestId;
    if (!isOpen || receiptId === null) {
      return (): void => {
        isCurrentRequest = false;
        detailsRequestIdRef.current += 1;
      };
    }

    setDetails(null);
    setLoadError(null);
    setLoading(true);

    const loadDetails = async (): Promise<void> => {
      try {
        const response: GreenTargetReceiptGroupDetails =
          await greenTargetApi.getReceiptGroup(receiptId);
        if (
          isCurrentRequest &&
          detailsRequestIdRef.current === requestId
        ) {
          setDetails(response);
        }
      } catch (error: unknown) {
        if (
          !isCurrentRequest ||
          detailsRequestIdRef.current !== requestId
        ) {
          return;
        }
        console.error("Error loading Green Target receipt group:", error);
        setLoadError(
          getErrorMessage(error, "Failed to load this Green Target receipt.")
        );
      } finally {
        if (
          isCurrentRequest &&
          detailsRequestIdRef.current === requestId
        ) {
          setLoading(false);
        }
      }
    };

    void loadDetails();
    return (): void => {
      isCurrentRequest = false;
      detailsRequestIdRef.current += 1;
    };
  }, [isOpen, receiptId]);

  useEffect((): void => {
    setEditingReference(false);
    setReferenceValue("");
    setReferenceError(null);
    setShowConfirmDialog(false);
    setShowCancelDialog(false);
    setCancelReason("");
    setMutation(null);
    setClearanceDate(format(new Date(), "yyyy-MM-dd"));
  }, [receiptId, isOpen]);

  useEffect((): void => {
    if (!details || details.receipt.status !== "pending") return;
    const today: string = format(new Date(), "yyyy-MM-dd");
    const receivedDate: string = formatDateInputValue(
      details.receipt.received_date
    );
    setClearanceDate(
      receivedDate !== "" && today < receivedDate ? receivedDate : today
    );
  }, [details]);

  const allocationTotal: number = useMemo(
    (): number =>
      details?.allocations.reduce(
        (
          total: number,
          allocation: GreenTargetReceiptGroupAllocation
        ): number => total + Number(allocation.amount_paid || 0),
        0
      ) ?? 0,
    [details]
  );

  const representativePaymentId: number | null =
    details?.representative_payment_id ?? null;
  const isBusy: boolean = mutation !== null;

  const reloadDetails = async (): Promise<void> => {
    if (receiptId === null) return;
    const requestId: number = detailsRequestIdRef.current + 1;
    detailsRequestIdRef.current = requestId;
    const response: GreenTargetReceiptGroupDetails =
      await greenTargetApi.getReceiptGroup(receiptId);
    if (detailsRequestIdRef.current === requestId) {
      setDetails(response);
    }
  };

  const refreshAfterMutation = async (): Promise<void> => {
    try {
      await onChanged();
    } catch (error: unknown) {
      console.error("Error refreshing Green Target payments:", error);
    }
    try {
      await reloadDetails();
    } catch (error: unknown) {
      console.error("Error reloading Green Target receipt details:", error);
      toast.error("The receipt changed, but its refreshed details could not be loaded.");
    }
  };

  const handleClose = (): void => {
    if (isBusy) return;
    setShowConfirmDialog(false);
    setShowCancelDialog(false);
    setCancelReason("");
    onClose();
  };

  const handleStartReferenceEdit = (): void => {
    if (!details || details.receipt.status === "cancelled" || isBusy) return;
    setReferenceValue(details.receipt.display_reference);
    setReferenceError(null);
    setEditingReference(true);
  };

  const handleSaveReference = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (!details || representativePaymentId === null || isBusy) return;

    const nextReference: string = referenceValue.trim();
    if (!nextReference) {
      setReferenceError("Green Target reference number is required.");
      return;
    }
    if (nextReference === details.receipt.display_reference) {
      setEditingReference(false);
      setReferenceError(null);
      return;
    }

    setMutation("reference");
    setReferenceError(null);
    try {
      await greenTargetApi.updatePayment(representativePaymentId, {
        internal_reference: nextReference,
        expected_internal_reference: details.receipt.display_reference,
      });
      setDetails(
        (
          current: GreenTargetReceiptGroupDetails | null
        ): GreenTargetReceiptGroupDetails | null =>
          current
            ? {
                ...current,
                receipt: {
                  ...current.receipt,
                  display_reference: nextReference,
                },
              }
            : current
      );
      setEditingReference(false);
      toast.success("Green Target reference updated for the whole receipt.");
      await refreshAfterMutation();
    } catch (error: unknown) {
      console.error("Error updating Green Target receipt reference:", error);
      setReferenceError(
        getErrorMessage(error, "Failed to update the Green Target reference.")
      );
    } finally {
      setMutation(null);
    }
  };

  const handleConfirmReceipt = async (): Promise<void> => {
    if (
      !details ||
      details.receipt.status !== "pending" ||
      representativePaymentId === null ||
      isBusy
    ) {
      return;
    }
    if (!clearanceDate) {
      toast.error("Actual bank clearance / posting date is required.");
      return;
    }

    setShowConfirmDialog(false);
    setMutation("confirm");
    try {
      await greenTargetApi.confirmPayment(
        representativePaymentId,
        clearanceDate
      );
      toast.success("Receipt confirmed with its bank clearance date.");
      await refreshAfterMutation();
    } catch (error: unknown) {
      console.error("Error confirming Green Target receipt:", error);
      toast.error(getErrorMessage(error, "Failed to confirm this receipt."));
    } finally {
      setMutation(null);
    }
  };

  const handleCancelReceipt = async (): Promise<void> => {
    if (
      !details ||
      details.receipt.status === "cancelled" ||
      representativePaymentId === null ||
      isBusy
    ) {
      return;
    }

    setShowCancelDialog(false);
    setMutation("cancel");
    const normalizedCancelReason: string = cancelReason.trim();
    try {
      await greenTargetApi.cancelPayment(
        representativePaymentId,
        normalizedCancelReason || undefined
      );
      setDetails(
        (
          current: GreenTargetReceiptGroupDetails | null
        ): GreenTargetReceiptGroupDetails | null =>
          current
            ? {
                ...current,
                receipt: {
                  ...current.receipt,
                  status: "cancelled",
                  cancellation_reason: normalizedCancelReason || null,
                },
              }
            : current
      );
      setCancelReason("");
      toast.success("Receipt and all of its allocations were cancelled.");
      await refreshAfterMutation();
    } catch (error: unknown) {
      console.error("Error cancelling Green Target receipt:", error);
      toast.error(getErrorMessage(error, "Failed to cancel this receipt."));
    } finally {
      setMutation(null);
    }
  };

  const receivedDateInput: string = formatDateInputValue(
    details?.receipt.received_date ?? null
  );

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={handleClose}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-4xl overflow-hidden rounded-2xl border border-default-200 bg-white text-left align-middle shadow-xl dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-start justify-between border-b border-default-200 px-5 py-4 dark:border-gray-700">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <IconReceipt size={22} />
                      </div>
                      <div>
                        <DialogTitle className="text-lg font-semibold text-default-900 dark:text-gray-100">
                          Green Target Receipt Details
                        </DialogTitle>
                        <p className="mt-0.5 text-xs text-default-500 dark:text-gray-400">
                          {details
                            ? `Receipt #${details.receipt.receipt_id} owns ${details.allocations.length} invoice allocation${
                                details.allocations.length === 1 ? "" : "s"
                              }.`
                            : "One receipt owns every allocation shown here."}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isBusy}
                      className="rounded-lg p-1.5 text-default-400 transition-colors hover:bg-default-100 hover:text-default-700 disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      aria-label="Close receipt details"
                    >
                      <IconX size={20} />
                    </button>
                  </div>

                  <div className="max-h-[75vh] overflow-y-auto p-5">
                    {loading ? (
                      <div className="flex h-64 items-center justify-center">
                        <LoadingSpinner />
                      </div>
                    ) : loadError ? (
                      <div className="py-12 text-center">
                        <p className="font-medium text-rose-600 dark:text-rose-400">
                          {loadError}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          icon={IconRefresh}
                          className="mt-4"
                          onClick={(): void => {
                            if (receiptId === null) return;
                            const requestId: number =
                              detailsRequestIdRef.current + 1;
                            detailsRequestIdRef.current = requestId;
                            setLoading(true);
                            setLoadError(null);
                            void greenTargetApi
                              .getReceiptGroup(receiptId)
                              .then(
                                (
                                  response: GreenTargetReceiptGroupDetails
                                ): void => {
                                  if (
                                    detailsRequestIdRef.current === requestId
                                  ) {
                                    setDetails(response);
                                  }
                                }
                              )
                              .catch((error: unknown): void => {
                                if (
                                  detailsRequestIdRef.current !== requestId
                                ) {
                                  return;
                                }
                                setLoadError(
                                  getErrorMessage(
                                    error,
                                    "Failed to load this Green Target receipt."
                                  )
                                );
                              })
                              .finally((): void => {
                                if (
                                  detailsRequestIdRef.current === requestId
                                ) {
                                  setLoading(false);
                                }
                              });
                          }}
                        >
                          Try Again
                        </Button>
                      </div>
                    ) : details ? (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                Green Target Reference No.
                              </p>
                              {editingReference ? (
                                <form
                                  className="mt-2 flex flex-wrap items-start gap-2"
                                  onSubmit={(
                                    event: React.FormEvent<HTMLFormElement>
                                  ): void => {
                                    void handleSaveReference(event);
                                  }}
                                >
                                  <div className="min-w-[240px] flex-1">
                                    <input
                                      type="text"
                                      value={referenceValue}
                                      maxLength={50}
                                      autoFocus
                                      onChange={(
                                        event: React.ChangeEvent<HTMLInputElement>
                                      ): void => {
                                        setReferenceValue(event.target.value);
                                        setReferenceError(null);
                                      }}
                                      disabled={isBusy}
                                      className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 font-mono text-sm text-default-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-700 dark:bg-gray-800 dark:text-gray-100"
                                    />
                                    {referenceError && (
                                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                                        {referenceError}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    type="submit"
                                    size="sm"
                                    color="teal"
                                    disabled={isBusy}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={(): void => {
                                      setEditingReference(false);
                                      setReferenceError(null);
                                    }}
                                    disabled={isBusy}
                                  >
                                    Cancel
                                  </Button>
                                </form>
                              ) : (
                                <div className="mt-1 flex items-center gap-2">
                                  <p className="truncate font-mono text-lg font-semibold text-emerald-900 dark:text-emerald-100">
                                    {details.receipt.display_reference}
                                  </p>
                                  {details.receipt.status !== "cancelled" && (
                                    <button
                                      type="button"
                                      onClick={handleStartReferenceEdit}
                                      disabled={isBusy}
                                      className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                      title="Edit the reference for this whole receipt"
                                      aria-label="Edit Green Target receipt reference"
                                    >
                                      <IconPencil size={16} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClassName(
                                  details.receipt.status
                                )}`}
                              >
                                {getStatusLabel(details.receipt.status)}
                              </span>
                              <p className="mt-2 text-xl font-semibold text-default-900 dark:text-gray-100">
                                {formatCurrency(details.receipt.total_amount)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-lg border border-default-200 p-3 dark:border-gray-700">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Date received
                            </p>
                            <p className="mt-1 font-medium text-default-900 dark:text-gray-100">
                              {formatReceiptDate(details.receipt.received_date)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-default-200 p-3 dark:border-gray-700">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Posting / clearance date
                            </p>
                            <p className="mt-1 font-medium text-default-900 dark:text-gray-100">
                              {formatReceiptDate(details.receipt.posting_date)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-default-200 p-3 dark:border-gray-700">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Payment method
                            </p>
                            <p className="mt-1 font-medium text-default-900 dark:text-gray-100">
                              {formatPaymentMethod(details.receipt.payment_method)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-default-200 p-3 dark:border-gray-700">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Bank account
                            </p>
                            <p className="mt-1 font-mono font-medium text-default-900 dark:text-gray-100">
                              {details.receipt.bank_account}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-default-200 p-3 dark:border-gray-700">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Cheque / transaction reference
                            </p>
                            <p className="mt-1 break-all font-mono font-medium text-default-900 dark:text-gray-100">
                              {details.receipt.payment_reference || "-"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-default-200 p-3 dark:border-gray-700">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Consolidated receipt journal
                            </p>
                            {details.journal ? (
                              <Link
                                to={`/greentarget/accounting/journal-entries/${details.journal.journal_entry_id}`}
                                onClick={handleClose}
                                className="mt-1 inline-flex items-center gap-1 font-mono font-medium text-sky-600 hover:underline dark:text-sky-400"
                              >
                                {details.journal.reference_no}
                                <IconExternalLink size={14} />
                              </Link>
                            ) : (
                              <p className="mt-1 font-medium text-default-500 dark:text-gray-400">
                                {details.receipt.status === "pending"
                                  ? "Created after cheque clearance"
                                  : "No journal"}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-default-200 dark:border-gray-700">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-default-200 bg-default-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
                            <div>
                              <h3 className="font-medium text-default-900 dark:text-gray-100">
                                Receipt allocations
                              </h3>
                              <p className="text-xs text-default-500 dark:text-gray-400">
                                Editing, confirming or cancelling applies to every
                                invoice below.
                              </p>
                            </div>
                            <p className="font-medium text-default-900 dark:text-gray-100">
                              {formatCurrency(allocationTotal)} allocated
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[650px] text-sm">
                              <thead className="bg-default-50 dark:bg-gray-900/30">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                                    Invoice
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                                    Customer
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                                    Status
                                  </th>
                                  <th className="px-4 py-2 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                                    Amount
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                                {details.allocations.map(
                                  (
                                    allocation: GreenTargetReceiptGroupAllocation
                                  ): React.ReactNode => (
                                    <tr key={allocation.payment_id}>
                                      <td className="px-4 py-2.5">
                                        <Link
                                          to={`/greentarget/invoices/${allocation.invoice_id}`}
                                          onClick={handleClose}
                                          className="inline-flex items-center gap-1 font-mono font-medium text-sky-600 hover:underline dark:text-sky-400"
                                        >
                                          <IconFileInvoice size={15} />
                                          {allocation.invoice_number ||
                                            allocation.invoice_id}
                                        </Link>
                                      </td>
                                      <td className="px-4 py-2.5 text-default-800 dark:text-gray-100">
                                        <p>{allocation.customer_name}</p>
                                        <p className="text-xs text-default-400 dark:text-gray-500">
                                          Customer #{allocation.customer_id}
                                        </p>
                                      </td>
                                      <td className="px-4 py-2.5 capitalize text-default-600 dark:text-gray-300">
                                        {allocation.status === "active"
                                          ? "Settled"
                                          : allocation.status || "Settled"}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-default-900 dark:text-gray-100">
                                        {formatCurrency(allocation.amount_paid)}
                                      </td>
                                    </tr>
                                  )
                                )}
                                {details.allocations.length === 0 && (
                                  <tr>
                                    <td
                                      colSpan={4}
                                      className="px-4 py-8 text-center text-default-500 dark:text-gray-400"
                                    >
                                      This receipt has no payment allocations.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {details.receipt.status === "cancelled" &&
                          details.receipt.cancellation_reason && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                              Cancellation reason: {details.receipt.cancellation_reason}
                            </div>
                          )}
                      </div>
                    ) : null}
                  </div>

                  {details && !loading && !loadError && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-default-200 bg-default-50 px-5 py-3 dark:border-gray-700 dark:bg-gray-900/50">
                      <p className="text-xs text-default-500 dark:text-gray-400">
                        {details.receipt.origin === "legacy_operational"
                          ? "Legacy operational receipt"
                          : "ERP receipt"}
                      </p>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleClose}
                          disabled={isBusy}
                        >
                          Close
                        </Button>
                        {details.receipt.status === "pending" && (
                          <Button
                            type="button"
                            size="sm"
                            color="teal"
                            icon={IconCircleCheck}
                            onClick={(): void => setShowConfirmDialog(true)}
                            disabled={isBusy || representativePaymentId === null}
                          >
                            Confirm Receipt
                          </Button>
                        )}
                        {details.receipt.status !== "cancelled" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            color="rose"
                            icon={IconBan}
                            onClick={(): void => setShowCancelDialog(true)}
                            disabled={isBusy || representativePaymentId === null}
                          >
                            Cancel Receipt
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={(): void => setShowConfirmDialog(false)}
        onConfirm={(): void => void handleConfirmReceipt()}
        title="Confirm pending receipt?"
        message={
          <div className="space-y-3">
            <p>
              Confirm all {details?.allocations.length ?? 0} allocations under
              reference {details?.receipt.display_reference || "this receipt"}.
              One consolidated PBB_1 journal will use the clearance date below.
            </p>
            <div>
              <label
                htmlFor="gt-receipt-clearance-date"
                className="mb-1 block text-xs font-medium text-default-700 dark:text-gray-300"
              >
                Actual bank clearance / posting date
              </label>
              <input
                id="gt-receipt-clearance-date"
                type="date"
                value={clearanceDate}
                min={receivedDateInput || undefined}
                onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                  setClearanceDate(event.target.value)
                }
                required
                className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>
        }
        confirmButtonText="Confirm Receipt"
        variant="success"
        isConfirming={mutation === "confirm"}
      />

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={(): void => {
          setShowCancelDialog(false);
          setCancelReason("");
        }}
        onConfirm={(): void => void handleCancelReceipt()}
        title="Cancel whole receipt?"
        message={
          <div className="space-y-3">
            <p>
              This will cancel reference {details?.receipt.display_reference || "-"}
              {" "}and all {details?.allocations.length ?? 0} invoice allocations
              together.
            </p>
            <p className="font-medium text-rose-600 dark:text-rose-300">
              You cannot cancel only one allocation from this receipt.
            </p>
            <div>
              <label
                htmlFor="gt-receipt-cancellation-reason"
                className="mb-1 block text-xs font-medium text-default-700 dark:text-gray-300"
              >
                Cancellation reason (optional)
              </label>
              <textarea
                id="gt-receipt-cancellation-reason"
                value={cancelReason}
                onChange={(
                  event: React.ChangeEvent<HTMLTextAreaElement>
                ): void => setCancelReason(event.target.value)}
                rows={3}
                disabled={isBusy}
                className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>
        }
        confirmButtonText="Cancel Receipt"
        variant="danger"
        isConfirming={mutation === "cancel"}
      />
    </>
  );
};

export default GreenTargetReceiptDetailsDialog;

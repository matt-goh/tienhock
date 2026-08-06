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
  IconAlertTriangle,
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
  GreenTargetImportedJournalRef,
  GreenTargetReceiptAllocationRental,
  GreenTargetReceiptGroupAllocation,
  GreenTargetReceiptGroupDetails,
  GreenTargetReceiptStatus,
} from "../../types/greenTargetTypes";
import Button from "../Button";
import ConfirmationDialog from "../ConfirmationDialog";

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

// An allocation carries its own status only while it disagrees with the header
// (a cancelled row kept for audit), so it is badged per row, not per receipt.
const getAllocationStatusLabel = (
  status: GreenTargetReceiptGroupAllocation["status"]
): string => {
  if (status === "pending") return "Pending";
  if (status === "cancelled") return "Cancelled";
  return "Settled";
};

const getAllocationStatusClassName = (
  status: GreenTargetReceiptGroupAllocation["status"]
): string => {
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

  // A pre-cutover receipt owns no journal — each allocation instead points at
  // the invoice's imported entry, where the counter-cash leg recorded the
  // collection. De-duplicated because one entry can cover several invoices.
  const importedJournals: GreenTargetImportedJournalRef[] = useMemo(
    (): GreenTargetImportedJournalRef[] => {
      if (!details || details.journal) return [];
      const seenJournalIds: Set<number> = new Set<number>();
      return details.allocations.reduce(
        (
          journals: GreenTargetImportedJournalRef[],
          allocation: GreenTargetReceiptGroupAllocation
        ): GreenTargetImportedJournalRef[] => {
          const importedJournal: GreenTargetImportedJournalRef | null =
            allocation.imported_journal ?? null;
          if (
            importedJournal &&
            !seenJournalIds.has(importedJournal.journal_entry_id)
          ) {
            seenJournalIds.add(importedJournal.journal_entry_id);
            journals.push(importedJournal);
          }
          return journals;
        },
        []
      );
    },
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
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <IconReceipt size={20} />
                      </span>
                      <div className="min-w-0">
                        <DialogTitle
                          as="h3"
                          className="break-all text-base font-semibold text-default-800 dark:text-gray-100"
                        >
                          {details?.receipt.display_reference
                            ? `Receipt ${details.receipt.display_reference}`
                            : "Receipt Details"}
                        </DialogTitle>
                        <p className="text-xs text-default-500 dark:text-gray-400">
                          See every invoice paid under this Green Target
                          reference.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isBusy}
                      className="rounded-lg p-1 text-default-400 transition-colors hover:bg-default-100 hover:text-default-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      aria-label="Close receipt details"
                    >
                      <IconX size={18} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-5">
                    {loading ? (
                      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-default-500 dark:text-gray-400">
                        <span className="h-8 w-8 animate-spin rounded-full border-2 border-default-200 border-t-sky-500 dark:border-gray-600 dark:border-t-sky-400" />
                        <p className="text-sm">Loading receipt...</p>
                      </div>
                    ) : loadError ? (
                      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
                        <IconAlertTriangle
                          size={32}
                          className="text-amber-500 dark:text-amber-400"
                        />
                        <div>
                          <p className="font-medium text-default-800 dark:text-gray-100">
                            Receipt could not be loaded
                          </p>
                          <p className="mt-1 max-w-md text-sm text-default-500 dark:text-gray-400">
                            {loadError}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          color="sky"
                          icon={IconRefresh}
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
                      <div className="space-y-5">
                        {details.allocations.length > 1 &&
                          details.receipt.status !== "cancelled" && (
                            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800/70 dark:bg-amber-900/20 dark:text-amber-100">
                              <IconAlertTriangle
                                size={20}
                                className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                              />
                              <div>
                                <p className="text-sm font-semibold">
                                  This receipt covers more than one invoice
                                </p>
                                <p className="mt-1 text-sm leading-5">
                                  To keep every invoice correct, the reference,
                                  confirmation and cancellation apply to all of
                                  the invoices below together.
                                </p>
                              </div>
                            </div>
                          )}

                        {details.receipt.status === "cancelled" && (
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
                                Every invoice allocation below was reversed
                                together.
                              </p>
                              {details.receipt.cancellation_reason && (
                                <p className="mt-1 text-xs opacity-80">
                                  Reason: {details.receipt.cancellation_reason}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Status
                            </p>
                            <span
                              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusClassName(
                                details.receipt.status
                              )}`}
                            >
                              {getStatusLabel(details.receipt.status)}
                            </span>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Total received
                            </p>
                            <p className="mt-1 text-sm font-semibold text-default-800 dark:text-gray-100">
                              {formatCurrency(details.receipt.total_amount)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Received date
                            </p>
                            <p className="mt-1 text-sm font-medium text-default-800 dark:text-gray-100">
                              {formatReceiptDate(details.receipt.received_date)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              Method
                            </p>
                            <p className="mt-1 text-sm font-medium text-default-800 dark:text-gray-100">
                              {formatPaymentMethod(
                                details.receipt.payment_method
                              )}
                            </p>
                          </div>
                        </div>

                        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-default-500 dark:text-gray-400">
                              Green Target reference no.
                            </dt>
                            <dd className="mt-1 text-default-800 dark:text-gray-100">
                              {editingReference ? (
                                <form
                                  className="space-y-2"
                                  onSubmit={(
                                    event: React.FormEvent<HTMLFormElement>
                                  ): void => {
                                    void handleSaveReference(event);
                                  }}
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                                      className="h-9 min-w-0 flex-1 rounded-lg border border-default-300 bg-white px-3 font-mono text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                      aria-label="New Green Target reference number"
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={(): void => {
                                          setEditingReference(false);
                                          setReferenceError(null);
                                        }}
                                        disabled={isBusy}
                                        className="flex-1 sm:flex-none"
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="submit"
                                        size="sm"
                                        color="sky"
                                        disabled={isBusy}
                                        className="flex-1 sm:flex-none"
                                      >
                                        {mutation === "reference"
                                          ? "Saving..."
                                          : "Save Reference"}
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-default-500 dark:text-gray-400">
                                    This updates every invoice under this
                                    receipt. Amounts and payment status will not
                                    change.
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
                                    {details.receipt.display_reference || "-"}
                                  </span>
                                  {details.receipt.status !== "cancelled" && (
                                    <button
                                      type="button"
                                      onClick={handleStartReferenceEdit}
                                      disabled={isBusy}
                                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-sky-600 hover:bg-sky-50 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-400 dark:hover:bg-sky-900/30 dark:hover:text-sky-300"
                                      title="Edit the reference for this whole receipt"
                                      aria-label="Edit Green Target receipt reference"
                                    >
                                      <IconPencil size={14} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-default-500 dark:text-gray-400">
                              Posting / clearance date
                            </dt>
                            <dd className="mt-0.5 text-default-800 dark:text-gray-100">
                              {formatReceiptDate(details.receipt.posting_date)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-default-500 dark:text-gray-400">
                              Bank account
                            </dt>
                            <dd className="mt-0.5 font-mono text-default-800 dark:text-gray-100">
                              {details.receipt.bank_account}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-default-500 dark:text-gray-400">
                              Cheque / transaction reference
                            </dt>
                            <dd className="mt-0.5 break-all font-mono text-default-800 dark:text-gray-100">
                              {details.receipt.payment_reference || "-"}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-default-500 dark:text-gray-400">
                              {details.journal || importedJournals.length === 0
                                ? "Consolidated receipt journal"
                                : "Imported ledger journal"}
                            </dt>
                            <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                              {details.journal ? (
                                <Link
                                  to={`/greentarget/accounting/journal-entries/${details.journal.journal_entry_id}`}
                                  onClick={handleClose}
                                  className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline dark:text-sky-400"
                                >
                                  <IconReceipt size={15} />
                                  <span>{details.journal.reference_no}</span>
                                  <IconExternalLink size={13} />
                                </Link>
                              ) : importedJournals.length > 0 ? (
                                // Pre-cutover receipt: no journal of its own, the
                                // collection sits in the invoice's imported entry.
                                importedJournals.map(
                                  (
                                    importedJournal: GreenTargetImportedJournalRef
                                  ): React.ReactNode => (
                                    <Link
                                      key={importedJournal.journal_entry_id}
                                      to={`/greentarget/accounting/journal-entries/${importedJournal.journal_entry_id}`}
                                      onClick={handleClose}
                                      className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline dark:text-sky-400"
                                      title="Collected inside the imported ledger, in this entry's counter-cash line"
                                    >
                                      <IconReceipt size={15} />
                                      <span>{importedJournal.reference_no}</span>
                                      <IconExternalLink size={13} />
                                    </Link>
                                  )
                                )
                              ) : (
                                <span className="text-default-500 dark:text-gray-400">
                                  {details.receipt.status === "pending"
                                    ? "Created after the cheque clears"
                                    : "None"}
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-default-800 dark:text-gray-100">
                              Invoices in this receipt
                            </h4>
                            <span className="text-xs text-default-500 dark:text-gray-400">
                              {details.allocations.length}{" "}
                              {details.allocations.length === 1
                                ? "invoice"
                                : "invoices"}
                              {" · "}
                              {formatCurrency(allocationTotal)}
                            </span>
                          </div>
                          <ul className="divide-y divide-default-200 overflow-hidden rounded-xl border border-default-200 dark:divide-gray-700 dark:border-gray-700">
                            {details.allocations.map(
                              (
                                allocation: GreenTargetReceiptGroupAllocation
                              ): React.ReactNode => (
                                <li
                                  key={allocation.payment_id}
                                  className="px-4 py-3"
                                >
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300">
                                        <IconFileInvoice size={17} />
                                      </span>
                                      <div className="min-w-0">
                                        <Link
                                          to={`/greentarget/invoices/${allocation.invoice_id}`}
                                          onClick={handleClose}
                                          className="inline-flex items-center gap-1 truncate text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
                                        >
                                          {allocation.invoice_number ||
                                            allocation.invoice_id}
                                          <IconExternalLink
                                            size={13}
                                            className="shrink-0"
                                          />
                                        </Link>
                                        <p className="truncate text-xs text-default-500 dark:text-gray-400">
                                          {allocation.customer_name} · Customer{" "}
                                          {allocation.customer_id}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2.5">
                                      {allocation.status &&
                                        allocation.status !== "active" && (
                                          <span
                                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getAllocationStatusClassName(
                                              allocation.status
                                            )}`}
                                          >
                                            {getAllocationStatusLabel(
                                              allocation.status
                                            )}
                                          </span>
                                        )}
                                      <span className="text-sm font-semibold text-default-800 dark:text-gray-100">
                                        {formatCurrency(allocation.amount_paid)}
                                      </span>
                                    </div>
                                  </div>
                                  {allocation.rentals.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                                      {allocation.rentals.map(
                                        (
                                          rental: GreenTargetReceiptAllocationRental
                                        ): React.ReactNode => (
                                          <Link
                                            key={rental.rental_id}
                                            to={`/greentarget/rentals/${rental.rental_id}`}
                                            onClick={handleClose}
                                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                            title={
                                              rental.location_site ||
                                              rental.location_address ||
                                              `Rental ${rental.rental_id}`
                                            }
                                          >
                                            {rental.tong_no
                                              ? `Tong ${rental.tong_no}`
                                              : `Rental #${rental.rental_id}`}
                                          </Link>
                                        )
                                      )}
                                    </div>
                                  )}
                                </li>
                              )
                            )}
                            {details.allocations.length === 0 && (
                              <li className="px-4 py-8 text-center text-sm text-default-500 dark:text-gray-400">
                                This receipt has no payment allocations.
                              </li>
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

                  <div className="flex flex-col gap-3 border-t border-default-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
                    <p className="text-xs text-default-500 dark:text-gray-400">
                      {details?.receipt.status === "cancelled"
                        ? "This receipt can no longer be changed."
                        : details?.receipt.status === "pending"
                        ? "Confirming applies every invoice in this receipt together."
                        : details && details.allocations.length > 1
                        ? "Cancelling reverses every invoice shown above."
                        : "Cancelling reverses this payment."}
                      {details && (
                        <span className="opacity-80">
                          {details.receipt.origin === "legacy_operational"
                            ? " Legacy operational receipt."
                            : " ERP receipt."}
                        </span>
                      )}
                    </p>
                    <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleClose}
                        disabled={isBusy}
                        className="flex-1 sm:flex-none"
                      >
                        Close
                      </Button>
                      {details?.receipt.status === "pending" && (
                        <Button
                          type="button"
                          size="sm"
                          color="sky"
                          variant="filled"
                          icon={IconCircleCheck}
                          onClick={(): void => setShowConfirmDialog(true)}
                          disabled={
                            loading ||
                            isBusy ||
                            representativePaymentId === null
                          }
                          className="flex-1 sm:flex-none"
                        >
                          {mutation === "confirm"
                            ? "Confirming..."
                            : "Confirm Receipt"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        color="rose"
                        variant="filled"
                        icon={IconBan}
                        onClick={(): void => setShowCancelDialog(true)}
                        disabled={
                          !details ||
                          details.receipt.status === "cancelled" ||
                          loading ||
                          isBusy ||
                          representativePaymentId === null
                        }
                        className="flex-1 sm:flex-none"
                      >
                        {mutation === "cancel"
                          ? "Cancelling..."
                          : "Cancel Receipt"}
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
        isOpen={showConfirmDialog}
        onClose={(): void => setShowConfirmDialog(false)}
        onConfirm={(): void => void handleConfirmReceipt()}
        title="Confirm pending receipt?"
        message={
          <div className="space-y-3">
            <p>
              Every invoice under reference{" "}
              {details?.receipt.display_reference || "this receipt"} will be
              confirmed together.
            </p>
            <p>
              The related invoice balances will be updated and one consolidated
              PBB_1 journal will be created using the clearance date below.
            </p>
            <div>
              <label
                htmlFor="gt-receipt-clearance-date"
                className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-300"
              >
                Cheque Clearance Date
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
                disabled={isBusy}
                className="h-9 w-full rounded-lg border border-default-300 bg-white px-3 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                Use the date the bank statement shows the cheque as cleared.
                This date controls the bank and account-ledger reports.
              </p>
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
              Reference {details?.receipt.display_reference || "this receipt"}{" "}
              covers{" "}
              {details?.allocations.length === 1
                ? "one invoice"
                : `${details?.allocations.length ?? 0} invoices`}
              . Cancelling reverses every one of them together; you cannot
              cancel only one.
            </p>
            {details && details.allocations.length > 0 && (
              <ul className="space-y-1.5 rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                {details.allocations.map(
                  (
                    allocation: GreenTargetReceiptGroupAllocation
                  ): React.ReactNode => (
                    <li
                      key={allocation.payment_id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0 truncate font-medium text-default-700 dark:text-gray-200">
                        {allocation.invoice_number || allocation.invoice_id}
                      </span>
                      <span className="whitespace-nowrap font-medium text-default-700 dark:text-gray-200">
                        {formatCurrency(allocation.amount_paid)}
                      </span>
                    </li>
                  )
                )}
              </ul>
            )}
            <div>
              <label
                htmlFor="gt-receipt-cancellation-reason"
                className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-300"
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
                className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
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

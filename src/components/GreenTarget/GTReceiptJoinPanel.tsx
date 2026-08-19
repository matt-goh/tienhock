// src/components/GreenTarget/GTReceiptJoinPanel.tsx
//
// Shared "this Green Target reference already exists" panel for the two
// record-payment blocks (the invoice form and the rental page's Create Invoice
// modal). A Green Target receipt is ONE banking event that may settle several
// invoices, so a re-used reference is not necessarily a mistake — it usually
// means the new payment belongs to a receipt that already exists.
//
// Joining is offered pre-ticked because a re-used reference almost always IS
// the same banking event, but the match is always shown in full: a typo that
// collides with a real RV would post money into the wrong receipt, so the user
// can see what they are joining and untick to keep the payment separate.
import React, { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { IconAlertTriangle, IconLink, IconLoader2 } from "@tabler/icons-react";
import clsx from "clsx";
import { greenTargetApi } from "../../routes/greentarget/api";
import type {
  GreenTargetReceiptByReferenceResponse,
  GreenTargetReceiptJoinBlockReason,
  GreenTargetReceiptJoinCandidate,
} from "../../types/greenTargetTypes";
import Checkbox from "../Checkbox";

const LOOKUP_DEBOUNCE_MS = 400;

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
  online: "Online",
};

export interface GTReceiptJoinLookupState {
  receipt: GreenTargetReceiptJoinCandidate | null;
  joinable: boolean;
  blockReason: GreenTargetReceiptJoinBlockReason | null;
  isLooking: boolean;
}

const EMPTY_LOOKUP: GTReceiptJoinLookupState = {
  receipt: null,
  joinable: false,
  blockReason: null,
  isLooking: false,
};

/**
 * Debounced lookup of the receipt a keyed Green Target reference belongs to.
 * `invoiceId` is optional because both callers create the invoice after the
 * reference is typed; when it is known the server also answers the
 * "already allocated" rule.
 */
export const useGTReceiptJoinLookup = (
  reference: string,
  enabled: boolean,
  invoiceId?: number
): GTReceiptJoinLookupState => {
  const [lookup, setLookup] = useState<GTReceiptJoinLookupState>(EMPTY_LOOKUP);
  const requestIdRef = useRef<number>(0);

  useEffect((): (() => void) => {
    const normalizedReference: string = reference.trim();
    const requestId: number = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!enabled || !normalizedReference) {
      setLookup(EMPTY_LOOKUP);
      return (): void => {
        requestIdRef.current += 1;
      };
    }

    // A confirmation belongs to one exact reference. Clear the old candidate
    // immediately so it cannot appear to carry over while a new lookup runs.
    setLookup({ ...EMPTY_LOOKUP, isLooking: true });

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout((): void => {
      void greenTargetApi
        .getReceiptByReference(normalizedReference, invoiceId)
        .then((response: GreenTargetReceiptByReferenceResponse): void => {
          if (requestIdRef.current !== requestId) return;
          setLookup({
            receipt: response.exists ? response.receipt : null,
            joinable: response.joinable,
            blockReason: response.block_reason,
            isLooking: false,
          });
        })
        .catch((error: unknown): void => {
          if (requestIdRef.current !== requestId) return;
          // A failed lookup must not block the form: the server still rejects a
          // genuinely duplicate reference on save.
          console.error("Error looking up the Green Target receipt:", error);
          setLookup(EMPTY_LOOKUP);
        });
    }, LOOKUP_DEBOUNCE_MS);

    return (): void => {
      clearTimeout(timeoutId);
      requestIdRef.current += 1;
    };
  }, [reference, enabled, invoiceId]);

  return lookup;
};

export interface GTReceiptJoinConfirmation {
  /** Whether the checkbox is ticked for the receipt currently on offer. */
  joinConfirmed: boolean;
  /** The receipt this payment will join, or null when it creates its own. */
  confirmedReceipt: GreenTargetReceiptJoinCandidate | null;
  setJoinConfirmed: (joinConfirmed: boolean) => void;
}

/**
 * Owns the join decision for one record-payment block. Re-using a reference is
 * nearly always deliberate -- the user is keying the second invoice of a
 * banking event that already exists -- so a joinable receipt is confirmed by
 * DEFAULT and the user unticks to force a separate receipt instead.
 *
 * The confirmation is stored as a receipt id, not a boolean, so it can never
 * carry over to a different receipt: type a new reference and the decision is
 * made afresh. Unticking sticks, because the auto-confirm fires once per
 * receipt on offer.
 */
export const useGTReceiptJoinConfirmation = (
  lookup: GTReceiptJoinLookupState
): GTReceiptJoinConfirmation => {
  const [confirmedReceiptId, setConfirmedReceiptId] = useState<number | null>(
    null
  );
  const offeredReceiptIdRef = useRef<number | null>(null);

  const joinableReceipt: GreenTargetReceiptJoinCandidate | null =
    !lookup.isLooking && lookup.joinable && lookup.receipt
      ? lookup.receipt
      : null;

  useEffect((): void => {
    const receiptId: number | null = joinableReceipt?.receipt_id ?? null;
    if (receiptId === null) {
      offeredReceiptIdRef.current = null;
      setConfirmedReceiptId(null);
      return;
    }
    if (offeredReceiptIdRef.current === receiptId) return;
    offeredReceiptIdRef.current = receiptId;
    setConfirmedReceiptId(receiptId);
  }, [joinableReceipt]);

  const confirmedReceipt: GreenTargetReceiptJoinCandidate | null =
    joinableReceipt && joinableReceipt.receipt_id === confirmedReceiptId
      ? joinableReceipt
      : null;

  return {
    joinConfirmed: confirmedReceipt !== null,
    confirmedReceipt,
    setJoinConfirmed: (joinConfirmed: boolean): void =>
      setConfirmedReceiptId(
        joinConfirmed ? joinableReceipt?.receipt_id ?? null : null
      ),
  };
};

const formatReceiptDate = (value: string | null): string => {
  if (!value) return "-";
  const date: Date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : format(date, "dd/MM/yyyy");
};

const formatCurrency = (amount: number): string =>
  `RM ${(Number.isFinite(Number(amount)) ? Number(amount) : 0).toFixed(2)}`;

const describeBlockReason = (
  blockReason: GreenTargetReceiptJoinBlockReason
): string => {
  if (blockReason === "cancelled") {
    return "That receipt is cancelled, so nothing more can be added to it. Use a different reference number.";
  }
  if (blockReason === "manual_override") {
    return "That receipt's journal was edited by hand, so it can no longer be rebuilt automatically. Use a different reference number.";
  }
  return "That receipt already has a payment for this invoice. Use a different reference number.";
};

interface GTReceiptJoinPanelProps {
  lookup: GTReceiptJoinLookupState;
  joinConfirmed: boolean;
  onJoinConfirmedChange: (joinConfirmed: boolean) => void;
  disabled?: boolean;
  className?: string;
}

const GTReceiptJoinPanel: React.FC<GTReceiptJoinPanelProps> = ({
  lookup,
  joinConfirmed,
  onJoinConfirmedChange,
  disabled = false,
  className,
}) => {
  const { t } = useTranslation("greentarget");
  if (lookup.isLooking && !lookup.receipt) {
    return (
      <div
        className={clsx(
          "flex items-center gap-2 text-xs text-default-500 dark:text-gray-400",
          className
        )}
      >
        <IconLoader2 size={14} className="animate-spin" />
        {t("Checking this reference number...")}
      </div>
    );
  }

  if (!lookup.receipt) return null;

  const receipt: GreenTargetReceiptJoinCandidate = lookup.receipt;

  if (!lookup.joinable) {
    return (
      <div
        className={clsx(
          "rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20",
          className
        )}
      >
        <div className="flex items-start gap-2">
          <IconAlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
          />
          <div className="text-sm text-rose-700 dark:text-rose-300">
            <p className="font-medium">
              {t("Reference {{reference}} is already in use.", {
                reference: receipt.display_reference,
              })}
            </p>
            <p className="mt-1 text-xs">
              {lookup.blockReason
                ? t(describeBlockReason(lookup.blockReason))
                : t("That reference cannot take another payment.")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <IconLink
          size={16}
          className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t("Receipt {{reference}} already exists.", {
              reference: receipt.display_reference,
            })}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-800 dark:text-amber-200 sm:grid-cols-4">
            <div>
              <dt className="text-amber-600 dark:text-amber-400">
                {t("Received")}
              </dt>
              <dd className="font-medium">
                {formatReceiptDate(receipt.received_date)}
              </dd>
            </div>
            <div>
              <dt className="text-amber-600 dark:text-amber-400">
                {t("Method")}
              </dt>
              <dd className="font-medium">
                {t(
                  paymentMethodLabels[receipt.payment_method] ||
                    receipt.payment_method
                )}
              </dd>
            </div>
            <div>
              <dt className="text-amber-600 dark:text-amber-400">
                {t("Current total")}
              </dt>
              <dd className="font-medium">
                {formatCurrency(receipt.total_amount)}
              </dd>
            </div>
            <div>
              <dt className="text-amber-600 dark:text-amber-400">
                {t("Invoices")}
              </dt>
              <dd className="font-medium">
                {receipt.status === "pending"
                  ? t("{{count}} (pending cheque)", {
                      count: receipt.allocation_count,
                    })
                  : receipt.allocation_count}
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <Checkbox
              checked={joinConfirmed}
              onChange={onJoinConfirmedChange}
              disabled={disabled}
              label={t("Add this payment to that receipt")}
              size={18}
            />
          </div>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {receipt.status === "pending"
              ? t(
                  "This receipt is an unconfirmed cheque, so the new payment stays pending and the invoice balance is untouched until the receipt is confirmed."
                )
              : t(
                  "The receipt's date, method and cheque / transaction reference apply to the whole receipt and are used as they are."
                )}
          </p>
          {!joinConfirmed && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">              {t(
                              "Leave this unticked only if it is a different payment that happens to share the reference — you will then need a reference number that is not already in use."
                            )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GTReceiptJoinPanel;

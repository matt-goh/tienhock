// src/utils/invoice/saleTenders.ts
// What was tendered when a bill is settled at the counter.
//
// A bill can be paid in more than one way at once — most often part cash and
// part online transfer on the same day. Each way is a "tender". One tender is
// the ordinary case and behaves exactly like a single payment method did.
//
// Shared by the Tien Hock and Jelly Polly invoice forms so the two cannot
// drift; the server-side counterpart is `src/routes/sales/invoices/saleTenders.js`.

import { Payment } from "../../types/types";
import type { TFunction } from "i18next";

export interface SaleTender {
  key: string;
  payment_method: Payment["payment_method"];
  /** Kept as typed text so the input can be cleared while editing. */
  amount: string;
  payment_reference: string;
  /**
   * True once the user types an amount. Until then a lone tender tracks the
   * bill total as line items change, so the ordinary "paid in full" case needs
   * no typing at all — but the box is always visible and editable, which is
   * what makes a single PART payment possible.
   */
  amountTouched: boolean;
}

let tenderKeySeed = 0;

export const createTender = (
  payment_method: Payment["payment_method"],
  amount = "",
  amountTouched = false
): SaleTender => ({
  key: `tender-${++tenderKeySeed}`,
  payment_method,
  amount,
  payment_reference: "",
  amountTouched,
});

export const roundTenderAmount = (value: number): number =>
  Math.round(value * 100) / 100;

export const tenderNeedsReference = (
  method: Payment["payment_method"]
): boolean =>
  method === "cheque" || method === "bank_transfer" || method === "online";

export const tenderReferenceLabel = (
  method: Payment["payment_method"]
): string =>
  method === "cheque"
    ? "Cheque Number"
    : method === "online"
    ? "Transaction ID"
    : "Transaction Ref";

/** Sum of the typed amounts. Only meaningful once the bill is split. */
export const sumTenders = (tenders: SaleTender[]): number =>
  roundTenderAmount(
    tenders.reduce(
      (sum: number, tender: SaleTender) => sum + Number(tender.amount || 0),
      0
    )
  );

/**
 * Keeps an untouched lone tender equal to the bill, so the amount box shows
 * the full total by default and only changes when the user types over it.
 * Returns the same array when nothing needs to change, so it is safe to call
 * from an effect.
 */
export const syncTenderAmounts = (
  tenders: SaleTender[],
  billTotal: number
): SaleTender[] => {
  if (tenders.length !== 1 || tenders[0].amountTouched) return tenders;
  const wanted = billTotal.toFixed(2);
  if (tenders[0].amount === wanted) return tenders;
  return [{ ...tenders[0], amount: wanted }];
};

/**
 * Adds a tender line, seeded with whatever the bill still has left and
 * defaulting to the method the bill does not already use.
 */
export const addTender = (
  tenders: SaleTender[],
  billTotal: number
): SaleTender[] => {
  const left = roundTenderAmount(billTotal - sumTenders(tenders));
  return [
    ...tenders,
    createTender(
      tenders.some((tender: SaleTender) => tender.payment_method === "cash")
        ? "online"
        : "cash",
      left > 0 ? left.toFixed(2) : "",
      true
    ),
  ];
};

/**
 * Validation messages for the tender lines, empty when they are usable.
 *
 * A single tender always covers the whole bill, so only a split is reconciled.
 * `allowPartial` is what separates the two bill types: a credit invoice may be
 * part-paid now and collected for the rest days later (the common case — the
 * balance simply stays outstanding), while a cash bill is cash-and-carry and
 * must be settled in full, because a settled cash bill carries no balance at
 * all. Paying MORE than the bill is always refused here; a genuine
 * overpayment is recorded through the Payments page, which owns the customer
 * credit it creates.
 */
export const validateTenders = (
  tenders: SaleTender[],
  billTotal: number,
  allowPartial: boolean,
  t?: TFunction
): string[] => {
  // A RM0.00 bill (all returns / free goods) has nothing to collect.
  if (billTotal <= 0.005) return [];

  const errors: string[] = [];
  tenders.forEach((tender: SaleTender, index: number) => {
    if (!tender.payment_method) {
      errors.push(
        t
          ? t("Payment #{{number}}: payment method is required.", {
              number: index + 1,
            })
          : `Payment #${index + 1}: payment method is required.`
      );
    }
    if (!(Number(tender.amount || 0) > 0)) {
      errors.push(
        tenders.length > 1
          ? t
            ? t("Payment #{{number}}: enter an amount above RM0.", {
                number: index + 1,
              })
            : `Payment #${index + 1}: enter an amount above RM0.`
          : t
            ? t("Enter a payment amount above RM0.")
            : "Enter a payment amount above RM0."
      );
    }
  });

  const remaining = roundTenderAmount(billTotal - sumTenders(tenders));
  if (remaining < -0.005) {
    errors.push(
      t
        ? t("Payments exceed the RM{{total}} bill by RM{{amount}}.", {
            total: billTotal.toFixed(2),
            amount: Math.abs(remaining).toFixed(2),
          })
        : `Payments exceed the RM${billTotal.toFixed(2)} bill by RM${Math.abs(remaining).toFixed(2)}.`
    );
  } else if (remaining > 0.005 && !allowPartial) {
    errors.push(
      t
        ? t(
            "A cash bill must be paid in full – RM{{amount}} of RM{{total}} is unaccounted for. Change the bill to Invoice to leave a balance outstanding.",
            {
              amount: remaining.toFixed(2),
              total: billTotal.toFixed(2),
            }
          )
        : `A cash bill must be paid in full 窶・RM${remaining.toFixed(2)} of RM${billTotal.toFixed(2)} is unaccounted for. Change the bill to Invoice to leave a balance outstanding.`
    );
  }
  return errors;
};

/** The payload shape both companies' invoice-create endpoints accept. */
export const toTenderPayload = (
  tenders: SaleTender[],
  billTotal: number
): {
  payment_method: Payment["payment_method"];
  amount: number;
  payment_reference?: string;
}[] => {
  if (billTotal <= 0.005) return [];
  return tenders
    .map((tender: SaleTender) => ({
      payment_method: tender.payment_method,
      amount: roundTenderAmount(Number(tender.amount || 0)),
      payment_reference: tenderNeedsReference(tender.payment_method)
        ? tender.payment_reference.trim() || undefined
        : undefined,
    }))
    .filter((tender) => tender.amount > 0);
};

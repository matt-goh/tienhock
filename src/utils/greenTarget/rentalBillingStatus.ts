// src/utils/greenTarget/rentalBillingStatus.ts

// Green Target rentals no longer track the physical tong movement (the dumpster
// and both dates are optional), so a rental's headline status reports where it
// stands in the invoice -> payment chain instead of whether a tong is out.

export type RentalBillingStatusKey =
  | "no_invoice"
  | "unpaid"
  | "partial"
  | "overdue"
  | "paid";

export interface RentalBillingInvoiceInfo {
  status?: string | null;
  amount?: number | string | null;
  balance_due?: number | string | null;
}

export interface RentalBillingStatus {
  key: RentalBillingStatusKey;
  label: string;
  // Tailwind classes for the badge, light and dark.
  badgeClassName: string;
}

const BADGE_CLASSES: Record<RentalBillingStatusKey, string> = {
  no_invoice:
    "bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-400",
  unpaid: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  partial: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400",
  overdue: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400",
  paid: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
};

const LABELS: Record<RentalBillingStatusKey, string> = {
  no_invoice: "No Invoice",
  unpaid: "Unpaid",
  partial: "Partly Paid",
  overdue: "Overdue",
  paid: "Paid",
};

const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const build = (key: RentalBillingStatusKey): RentalBillingStatus => ({
  key,
  label: LABELS[key],
  badgeClassName: BADGE_CLASSES[key],
});

// A cancelled invoice leaves the rental billable again, so it reads the same as
// having no invoice at all.
export const getRentalBillingStatus = (
  invoice: RentalBillingInvoiceInfo | null | undefined
): RentalBillingStatus => {
  if (!invoice || invoice.status === "cancelled") return build("no_invoice");

  const total: number | null = toNumber(invoice.amount);
  const balance: number | null = toNumber(invoice.balance_due);

  if (invoice.status === "paid") return build("paid");
  if (balance !== null && balance <= 0) return build("paid");

  // Overdue wins over "partly paid": the outstanding money is the point.
  if (invoice.status === "overdue") return build("overdue");

  if (balance !== null && total !== null && balance < total) {
    return build("partial");
  }

  return build("unpaid");
};

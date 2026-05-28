import React from "react";
import Checkbox from "../Checkbox";
import { FormInput, FormListbox } from "../FormComponents";

export type SupplierPaymentMethod =
  | "cash"
  | "cheque"
  | "bank_transfer"
  | "online";

export type SupplierBankAccount = "BANK_PBB" | "BANK_ABB";

export interface SupplierPaymentDraft {
  enabled: boolean;
  payment_date: string;
  amount_paid: string;
  payment_method: SupplierPaymentMethod;
  bank_account: SupplierBankAccount;
  payment_reference: string;
  internal_reference: string;
  notes: string;
}

export interface SupplierPaymentPayload {
  invoice_source: "purchase_invoices" | "self_billed_invoices";
  invoice_id: number;
  payment_date: string;
  amount_paid: number;
  payment_method: SupplierPaymentMethod;
  bank_account: SupplierBankAccount | null;
  payment_reference: string | null;
  internal_reference: string | null;
  notes: string | null;
}

interface SupplierPaymentInlineSectionProps {
  draft: SupplierPaymentDraft;
  outstandingAmount: number;
  onChange: (draft: SupplierPaymentDraft) => void;
  disabled?: boolean;
  title?: string;
  enableLabel?: string;
  footer?: React.ReactNode;
}

const paymentMethodOptions: { id: SupplierPaymentMethod; name: string }[] = [
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "cheque", name: "Cheque" },
  { id: "cash", name: "Cash" },
  { id: "online", name: "Online" },
];

const bankAccountOptions: { id: SupplierBankAccount; name: string }[] = [
  { id: "BANK_PBB", name: "Public Bank" },
  { id: "BANK_ABB", name: "Alliance Bank" },
];

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export const formatSupplierPaymentAmount = (value: number): string =>
  roundMoney(Math.max(0, value)).toFixed(2);

export const createDefaultSupplierPaymentDraft = (
  paymentDate: string,
  amount: number,
  enabled: boolean
): SupplierPaymentDraft => ({
  enabled,
  payment_date: paymentDate,
  amount_paid: formatSupplierPaymentAmount(amount),
  payment_method: "bank_transfer",
  bank_account: "BANK_PBB",
  payment_reference: "",
  internal_reference: "",
  notes: "",
});

export const syncSupplierPaymentDraftAmount = (
  draft: SupplierPaymentDraft,
  nextAmount: number,
  previousAmount: number
): SupplierPaymentDraft => {
  if (!draft.enabled) return draft;

  const previousText: string = formatSupplierPaymentAmount(previousAmount);
  if (draft.amount_paid.trim() && draft.amount_paid !== previousText) {
    return draft;
  }

  return {
    ...draft,
    amount_paid: formatSupplierPaymentAmount(nextAmount),
  };
};

export const parseSupplierPaymentAmount = (
  value: string,
  fallbackAmount: number
): number => {
  const trimmed: string = value.trim();
  if (!trimmed) return roundMoney(fallbackAmount);

  const parsed: number = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
};

export const validateSupplierPaymentDraft = (
  draft: SupplierPaymentDraft,
  outstandingAmount: number
): string | null => {
  if (!draft.enabled) return null;
  if (!draft.payment_date) return "Payment date is required";

  const amount: number = parseSupplierPaymentAmount(
    draft.amount_paid,
    outstandingAmount
  );
  if (!(amount > 0)) return "Payment amount must be greater than zero";
  if (amount - outstandingAmount > 0.005) {
    return `Payment amount exceeds outstanding balance (${formatSupplierPaymentAmount(
      outstandingAmount
    )})`;
  }
  if (draft.payment_method !== "cash" && !draft.bank_account) {
    return "Bank account is required for non-cash payments";
  }

  return null;
};

export const buildSupplierPaymentPayload = (
  draft: SupplierPaymentDraft,
  invoiceSource: SupplierPaymentPayload["invoice_source"],
  invoiceId: number,
  outstandingAmount: number,
  fallbackPaymentReference = ""
): SupplierPaymentPayload => ({
  invoice_source: invoiceSource,
  invoice_id: invoiceId,
  payment_date: draft.payment_date,
  amount_paid: parseSupplierPaymentAmount(draft.amount_paid, outstandingAmount),
  payment_method: draft.payment_method,
  bank_account: draft.payment_method === "cash" ? null : draft.bank_account,
  payment_reference:
    draft.payment_reference.trim() || fallbackPaymentReference.trim() || null,
  internal_reference: draft.internal_reference.trim() || null,
  notes: draft.notes.trim() || null,
});

const SupplierPaymentInlineSection: React.FC<SupplierPaymentInlineSectionProps> = ({
  draft,
  outstandingAmount,
  onChange,
  disabled = false,
  title = "Payment",
  enableLabel = "Record payment now",
  footer,
}) => {
  const updateDraft = <K extends keyof SupplierPaymentDraft>(
    field: K,
    value: SupplierPaymentDraft[K]
  ): void => {
    onChange({ ...draft, [field]: value });
  };

  const handleEnabledChange = (enabled: boolean): void => {
    onChange({
      ...draft,
      enabled,
      amount_paid:
        enabled &&
        (!draft.amount_paid.trim() ||
          Number.parseFloat(draft.amount_paid) === 0)
          ? formatSupplierPaymentAmount(outstandingAmount)
          : draft.amount_paid,
    });
  };

  return (
    <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
          {title}
        </h2>
        <span className="font-mono text-sm font-semibold text-default-900 dark:text-gray-100">
          MYR {formatSupplierPaymentAmount(outstandingAmount)}
        </span>
      </div>

      <Checkbox
        checked={draft.enabled}
        onChange={handleEnabledChange}
        disabled={disabled}
        label={enableLabel}
        checkedColor="text-sky-600 dark:text-sky-400"
        className="text-default-800 dark:text-gray-100"
        ariaLabel={enableLabel}
      />

      {draft.enabled && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <FormInput
              name="supplier_payment_date"
              label="Payment Date"
              value={draft.payment_date}
              type="date"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateDraft("payment_date", event.target.value)
              }
              disabled={disabled}
              required
            />
            <FormInput
              name="supplier_payment_amount"
              label="Amount (MYR)"
              value={draft.amount_paid}
              type="number"
              min={0}
              step="0.01"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateDraft("amount_paid", event.target.value)
              }
              disabled={disabled}
              required
            />
            <FormListbox
              name="supplier_payment_method"
              label="Payment Method"
              value={draft.payment_method}
              onChange={(value: string) =>
                updateDraft("payment_method", value as SupplierPaymentMethod)
              }
              options={paymentMethodOptions}
              disabled={disabled}
              required
            />
            {draft.payment_method !== "cash" && (
              <FormListbox
                name="supplier_payment_bank_account"
                label="Bank Account"
                value={draft.bank_account}
                onChange={(value: string) =>
                  updateDraft("bank_account", value as SupplierBankAccount)
                }
                options={bankAccountOptions}
                disabled={disabled}
                required
              />
            )}
            <FormInput
              name="supplier_payment_reference"
              label="Payment Reference"
              value={draft.payment_reference}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateDraft("payment_reference", event.target.value)
              }
              disabled={disabled}
              placeholder="Cheque no. / txn ref"
            />
            <FormInput
              name="supplier_payment_internal_reference"
              label="PV / Internal Reference"
              value={draft.internal_reference}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateDraft("internal_reference", event.target.value)
              }
              disabled={disabled}
              placeholder="Auto-generated if blank"
            />
          </div>
          <textarea
            value={draft.notes}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              updateDraft("notes", event.target.value)
            }
            disabled={disabled}
            rows={2}
            placeholder="Payment notes"
            className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700"
          />
          {footer}
        </div>
      )}
    </section>
  );
};

export default SupplierPaymentInlineSection;

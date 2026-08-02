// src/components/GreenTarget/AssociatedInvoiceDisplay.tsx
import React from "react";
import { format } from "date-fns";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconExternalLink,
  IconFileInvoice,
  IconX,
} from "@tabler/icons-react";
import clsx from "clsx";

interface InvoicePayment {
  payment_id: number;
  payment_date: string;
  amount_paid: number | string;
  payment_method: "cash" | "cheque" | "bank_transfer" | "online";
  internal_reference: string | null;
  status: "active" | "pending" | "cancelled" | null;
  receipt_id: number | null;
}

interface InvoiceInfo {
  invoice_id: number;
  invoice_number: string;
  status: string;
  amount?: number;
  has_payments?: boolean;
  payments?: InvoicePayment[];
}

interface AssociatedInvoiceDisplayProps {
  invoiceInfo: InvoiceInfo | null;
  onViewInvoice?: (invoiceId: number) => void;
  // Supplied by the owner so the receipt opens in a dialog on the current page
  // instead of navigating away from a form that may hold unsaved edits.
  onViewReceipt?: (receiptId: number) => void;
  className?: string;
}

const PAYMENT_METHOD_LABELS: Record<InvoicePayment["payment_method"], string> = {
  cash: "Cash",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
  online: "Online",
};

const formatPaymentDate = (value: string): string => {
  const paymentDate: Date = new Date(value);
  return Number.isNaN(paymentDate.getTime())
    ? "-"
    : format(paymentDate, "yyyy-MM-dd");
};

const AssociatedInvoiceDisplay: React.FC<AssociatedInvoiceDisplayProps> = ({
  invoiceInfo,
  onViewInvoice,
  onViewReceipt,
  className = "",
}) => {
  if (!invoiceInfo) {
    return (
      <div className={clsx("bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700", className)}>
        <div className="flex items-center text-gray-500 dark:text-gray-400">
          <IconFileInvoice size={20} className="mr-2" />
          <span className="text-sm font-medium">No Associated Invoice</span>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          This rental has not been invoiced yet.
        </p>
      </div>
    );
  }

  const getStatusConfig = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return {
          icon: <IconClock size={16} className="text-blue-500 dark:text-blue-400" />,
          text: "Active",
          bgColor: "bg-blue-50 dark:bg-blue-900/30",
          borderColor: "border-blue-200 dark:border-blue-800",
          textColor: "text-blue-700 dark:text-blue-300",
        };
      case "paid":
        return {
          icon: <IconCircleCheck size={16} className="text-green-500 dark:text-green-400" />,
          text: "Paid",
          bgColor: "bg-green-50 dark:bg-green-900/30",
          borderColor: "border-green-200 dark:border-green-800",
          textColor: "text-green-700 dark:text-green-300",
        };
      case "overdue":
        return {
          icon: <IconAlertTriangle size={16} className="text-red-500 dark:text-red-400" />,
          text: "Overdue",
          bgColor: "bg-red-50 dark:bg-red-900/30",
          borderColor: "border-red-200 dark:border-red-800",
          textColor: "text-red-700 dark:text-red-300",
        };
      case "cancelled":
        return {
          icon: <IconX size={16} className="text-gray-500 dark:text-gray-400" />,
          text: "Cancelled",
          bgColor: "bg-gray-50 dark:bg-gray-900/50",
          borderColor: "border-gray-200 dark:border-gray-700",
          textColor: "text-gray-600 dark:text-gray-400",
        };
      default:
        return {
          icon: <IconClock size={16} className="text-gray-500 dark:text-gray-400" />,
          text: status || "Unknown",
          bgColor: "bg-gray-50 dark:bg-gray-900/50",
          borderColor: "border-gray-200 dark:border-gray-700",
          textColor: "text-gray-700 dark:text-gray-300",
        };
    }
  };

  const statusConfig = getStatusConfig(invoiceInfo.status);

  const formatAmount = (amount: number | string | undefined): string => {
    if (amount === undefined || amount === null) return "N/A";
    const numericAmount: number = Number(amount);
    if (!Number.isFinite(numericAmount)) return "N/A";
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
    }).format(numericAmount);
  };

  return (
    <div
      className={clsx(
        "rounded-lg p-4 border",
        statusConfig.bgColor,
        statusConfig.borderColor,
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <IconFileInvoice size={20} className="mr-2 text-gray-600 dark:text-gray-400" />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Associated Invoice
            </span>
            <div className="flex items-center mt-1">
              {statusConfig.icon}
              <span className={clsx("text-xs font-medium ml-1", statusConfig.textColor)}>
                {statusConfig.text}
              </span>
            </div>
          </div>
        </div>
        {onViewInvoice && (
          <button
            type="button"
            onClick={() => onViewInvoice(invoiceInfo.invoice_id)}
            className="flex items-center text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 text-sm font-medium"
          >
            View
            <IconExternalLink size={16} className="ml-1" />
          </button>
        )}
      </div>
      
      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Invoice Number:</span>
          <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
            {invoiceInfo.invoice_number}
          </p>
        </div>
        {invoiceInfo.amount && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Amount:</span>
            <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
              {formatAmount(invoiceInfo.amount)}
            </p>
          </div>
        )}
      </div>

      {invoiceInfo.payments && invoiceInfo.payments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center">
            <IconCircleCheck size={12} className="mr-1 text-green-500" />
            Payment Records
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-1.5 pr-3 font-medium">Date</th>
                  <th className="pb-1.5 pr-3 font-medium">Method</th>
                  <th className="pb-1.5 pr-3 font-medium">Reference</th>
                  <th className="pb-1.5 pr-3 text-right font-medium">Amount</th>
                  <th className="pb-1.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {invoiceInfo.payments.map((payment: InvoicePayment) => {
                  const isCancelled: boolean = payment.status === "cancelled";
                  const reference: string =
                    payment.internal_reference?.trim() ||
                    (payment.receipt_id !== null
                      ? `Receipt #${payment.receipt_id}`
                      : "-");

                  return (
                    <tr
                      key={payment.payment_id}
                      className={clsx(isCancelled && "opacity-60")}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {formatPaymentDate(payment.payment_date)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-900 dark:text-gray-100">
                        {PAYMENT_METHOD_LABELS[payment.payment_method]}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">
                        {payment.receipt_id !== null && onViewReceipt ? (
                          <button
                            type="button"
                            onClick={(): void =>
                              onViewReceipt(payment.receipt_id as number)
                            }
                            className="inline-flex items-center font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
                            title="View this receipt and every invoice it settles"
                          >
                            {reference}
                            <IconExternalLink size={12} className="ml-1" />
                          </button>
                        ) : (
                          reference
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-right font-medium text-gray-900 dark:text-gray-100">
                        {formatAmount(payment.amount_paid)}
                      </td>
                      <td className="py-2 text-right">
                        {payment.status === "pending" && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                            Pending
                          </span>
                        )}
                        {isCancelled && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">
                            Cancelled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssociatedInvoiceDisplay;

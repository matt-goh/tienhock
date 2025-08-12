// src/components/GreenTarget/AssociatedInvoiceDisplay.tsx
import React from "react";
import { IconFileInvoice, IconExternalLink, IconCircleCheck, IconClock, IconAlertTriangle, IconX } from "@tabler/icons-react";
import clsx from "clsx";

interface InvoiceInfo {
  invoice_id: number;
  invoice_number: string;
  status: string;
  amount?: number;
  has_payments?: boolean;
}

interface AssociatedInvoiceDisplayProps {
  invoiceInfo: InvoiceInfo | null;
  onViewInvoice?: (invoiceId: number) => void;
  className?: string;
}

const AssociatedInvoiceDisplay: React.FC<AssociatedInvoiceDisplayProps> = ({
  invoiceInfo,
  onViewInvoice,
  className = "",
}) => {
  if (!invoiceInfo) {
    return (
      <div className={clsx("bg-gray-50 rounded-lg p-4 border border-gray-200", className)}>
        <div className="flex items-center text-gray-500">
          <IconFileInvoice size={20} className="mr-2" />
          <span className="text-sm font-medium">No Associated Invoice</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          This rental has not been invoiced yet.
        </p>
      </div>
    );
  }

  const getStatusConfig = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return {
          icon: <IconClock size={16} className="text-blue-500" />,
          text: "Active",
          bgColor: "bg-blue-50",
          borderColor: "border-blue-200",
          textColor: "text-blue-700",
        };
      case "paid":
        return {
          icon: <IconCircleCheck size={16} className="text-green-500" />,
          text: "Paid",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          textColor: "text-green-700",
        };
      case "overdue":
        return {
          icon: <IconAlertTriangle size={16} className="text-red-500" />,
          text: "Overdue",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          textColor: "text-red-700",
        };
      case "cancelled":
        return {
          icon: <IconX size={16} className="text-gray-500" />,
          text: "Cancelled",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          textColor: "text-gray-600",
        };
      default:
        return {
          icon: <IconClock size={16} className="text-gray-500" />,
          text: status || "Unknown",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          textColor: "text-gray-700",
        };
    }
  };

  const statusConfig = getStatusConfig(invoiceInfo.status);

  const formatAmount = (amount: number | undefined): string => {
    if (amount === undefined || amount === null) return "N/A";
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
    }).format(amount);
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
          <IconFileInvoice size={20} className="mr-2 text-gray-600" />
          <div>
            <span className="text-sm font-medium text-gray-900">
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
            className="flex items-center text-sky-600 hover:text-sky-800 text-sm font-medium"
          >
            View
            <IconExternalLink size={16} className="ml-1" />
          </button>
        )}
      </div>
      
      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Invoice Number:</span>
          <p className="font-medium text-gray-900 mt-0.5">
            {invoiceInfo.invoice_number}
          </p>
        </div>
        {invoiceInfo.amount && (
          <div>
            <span className="text-gray-500">Amount:</span>
            <p className="font-medium text-gray-900 mt-0.5">
              {formatAmount(invoiceInfo.amount)}
            </p>
          </div>
        )}
      </div>

      {invoiceInfo.has_payments && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600 flex items-center">
            <IconCircleCheck size={12} className="mr-1 text-green-500" />
            This invoice has payment records
          </p>
        </div>
      )}
    </div>
  );
};

export default AssociatedInvoiceDisplay;
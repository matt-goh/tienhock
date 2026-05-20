// src/components/AdjustmentDocs/AdjustmentDocBadge.tsx
import React from "react";
import {
  IconCircleCheck,
  IconClockHour4,
  IconAlertTriangle,
  IconBan,
  IconFileMinus,
  IconFilePlus,
  IconRotate2,
} from "@tabler/icons-react";
import {
  AdjustmentDocType,
  EInvoiceStatus,
} from "../../types/types";

interface TypeBadgeProps {
  type: AdjustmentDocType;
  className?: string;
}

const TYPE_META: Record<
  AdjustmentDocType,
  { label: string; short: string; color: string; icon: any }
> = {
  credit_note: {
    label: "Credit Note",
    short: "CN",
    color:
      "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    icon: IconFileMinus,
  },
  debit_note: {
    label: "Debit Note",
    short: "DN",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    icon: IconFilePlus,
  },
  refund_note: {
    label: "Refund Note",
    short: "RN",
    color:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    icon: IconRotate2,
  },
};

export const AdjustmentDocTypeBadge: React.FC<TypeBadgeProps> = ({
  type,
  className = "",
}) => {
  const meta = TYPE_META[type];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color} ${className}`}
      title={meta.label}
    >
      <Icon size={12} />
      {meta.short}
    </span>
  );
};

interface StatusBadgeProps {
  status: "active" | "cancelled";
  einvoiceStatus?: EInvoiceStatus;
  className?: string;
}

export const AdjustmentDocStatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  einvoiceStatus,
  className = "",
}) => {
  // Local doc status takes precedence — cancelled means the whole doc is dead.
  if (status === "cancelled") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 ${className}`}
      >
        <IconBan size={12} />
        Cancelled
      </span>
    );
  }

  // Active doc — show e-invoice status if set, otherwise just "Active".
  if (!einvoiceStatus) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-default-100 text-default-700 dark:bg-gray-700 dark:text-gray-200 ${className}`}
      >
        Not Submitted
      </span>
    );
  }

  switch (einvoiceStatus) {
    case "valid":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 ${className}`}
        >
          <IconCircleCheck size={12} />
          Valid
        </span>
      );
    case "pending":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ${className}`}
        >
          <IconClockHour4 size={12} />
          Pending
        </span>
      );
    case "invalid":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 ${className}`}
        >
          <IconAlertTriangle size={12} />
          Invalid
        </span>
      );
    case "cancelled":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 ${className}`}
        >
          <IconBan size={12} />
          e-Invoice Cancelled
        </span>
      );
    default:
      return null;
  }
};

export { TYPE_META as ADJUSTMENT_DOC_TYPE_META };

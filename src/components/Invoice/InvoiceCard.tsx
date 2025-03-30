// src/components/Invoice/InvoiceCard.tsx
import React from "react";
import {
  ExtendedInvoiceData,
  InvoiceStatus,
  EInvoiceStatus,
} from "../../types/types";
import {
  IconSquare,
  IconSquareCheckFilled,
  IconCash,
  IconFileInvoice,
  IconClockHour4,
  IconBan,
  IconAlertTriangle,
  IconCircleCheck,
  IconUser, // Import IconUser for salesman
} from "@tabler/icons-react";
import {
  formatDisplayDate,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";

interface InvoiceCardProps {
  invoice: ExtendedInvoiceData;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onViewDetails: (id: string) => void;
  salesmanName?: string | null; // <-- Add salesmanName prop
}

// Helper to get status styles (no changes)
const getInvoiceStatusStyles = (status: InvoiceStatus) => {
  switch (status) {
    case "paid":
      return {
        bg: "bg-green-100",
        text: "text-green-800",
        border: "border-green-200",
      };
    case "cancelled":
      return {
        bg: "bg-rose-100",
        text: "text-rose-800",
        border: "border-rose-200",
      };
    case "active":
    default:
      return {
        bg: "bg-amber-100",
        text: "text-amber-800",
        border: "border-amber-200",
      };
  }
};

// Helper to get e-invoice status styles and icon (no changes)
const getEInvoiceStatusInfo = (status: EInvoiceStatus) => {
  switch (status) {
    case "valid":
      return { text: "Valid", color: "text-green-600", icon: IconCircleCheck };
    case "pending":
      return {
        text: "Pending",
        color: "text-yellow-600",
        icon: IconClockHour4,
      };
    case "invalid":
      return {
        text: "Invalid",
        color: "text-red-600",
        icon: IconAlertTriangle,
      };
    case "cancelled":
      return { text: "Cancelled", color: "text-rose-600", icon: IconBan };
    default:
      return null; // No status or 'null'
  }
};

const InvoiceCard: React.FC<InvoiceCardProps> = ({
  invoice,
  isSelected,
  onSelect,
  onViewDetails,
}) => {
  const { date } = parseDatabaseTimestamp(invoice.createddate);
  const invoiceStatusStyle = getInvoiceStatusStyles(invoice.invoice_status);
  const eInvoiceStatusInfo = getEInvoiceStatusInfo(invoice.einvoice_status);
  const EInvoiceIcon = eInvoiceStatusInfo?.icon;

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent navigation if clicking specifically on the checkbox icon/wrapper
    // OR the header section itself (which now handles selection)
    if (
      (e.target as HTMLElement).closest(".invoice-card-select-action") ||
      (e.target as HTMLElement).closest(".invoice-card-header") // <-- Check if click is within header
    ) {
      return;
    }
    onViewDetails(invoice.id);
  };

  const handleHeaderClick = (e: React.MouseEvent) => {
    // If the click was directly on the checkbox icon area within the header,
    // let its specific handler manage it (avoids double toggling).
    if ((e.target as HTMLElement).closest(".invoice-card-select-action")) {
      return;
    }
    e.stopPropagation(); // Prevent card navigation click
    onSelect(invoice.id); // Trigger selection
  };

  const handleSelectIconClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click handler AND header click handler
    onSelect(invoice.id);
  };

  return (
    <div
      className={`relative border rounded-lg overflow-hidden transition-shadow duration-200 group
        ${
          isSelected
            ? "shadow-md ring-2 ring-blue-500 ring-offset-1"
            : "shadow-sm hover:shadow-md"
        }
        ${invoiceStatusStyle.border}
        p-4 space-y-3`}
      onClick={handleCardClick} // Overall card click for navigation
    >
      {/* Header - Now includes checkbox and is clickable for selection */}
      <div
        className={`invoice-card-header flex items-center gap-3 border-b ${invoiceStatusStyle.border} ${invoiceStatusStyle.bg} -mx-4 -mt-4 px-4 py-2 rounded-t-lg cursor-pointer`} // Negative margins, re-add padding, ADD cursor-pointer
        onClick={handleHeaderClick} // <-- Add header click handler
      >
        {/* Invoice ID - Takes available space */}
        <span
          className={`font-semibold ${invoiceStatusStyle.text} flex-grow truncate`}
          title={`${invoice.paymenttype === "CASH" ? "C" : "I"}${invoice.id}`}
        >
          {invoice.paymenttype === "CASH" ? "C" : "I"}
          {invoice.id}
        </span>

        {/* Date - Has natural space due to gap */}
        <span className={`text-sm ${invoiceStatusStyle.text} flex-shrink-0`}>
          {formatDisplayDate(date)}
        </span>

        {/* Selection Checkbox Area - Still clickable individually */}
        <div
          className="invoice-card-select-action flex-shrink-0 z-0" // Add z-index just in case, ensure it's above header click area conceptually
          onClick={handleSelectIconClick} // <-- Use specific handler for icon
        >
          {isSelected ? (
            <IconSquareCheckFilled
              className="text-blue-600 cursor-pointer"
              size={22}
            />
          ) : (
            <IconSquare
              className="text-default-400 group-hover:text-blue-500 transition-colors cursor-pointer" // Show selection intent color on hover
              size={22}
            />
          )}
        </div>
      </div>

      {/* Body - Uses parent's horizontal padding */}
      <div className="space-y-2">
        <p
          className="font-medium text-default-800 truncate"
          title={invoice.customerName || invoice.customerid}
        >
          {invoice.customerName || invoice.customerid}
          <p className="text-xs text-default-500 truncate">
            {invoice.salespersonid}
          </p>
        </p>
        <p className="text-lg font-semibold text-default-900">
          {`RM ${invoice.totalamountpayable.toFixed(2)}`}
        </p>
      </div>

      {/* Footer - Uses parent's horizontal padding */}
      <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
        {/* Invoice Status */}
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${invoiceStatusStyle.bg} ${invoiceStatusStyle.text}`}
        >
          {invoice.invoice_status.charAt(0).toUpperCase() +
            invoice.invoice_status.slice(1)}
        </span>
        {/* E-Invoice Status */}
        {eInvoiceStatusInfo && EInvoiceIcon && (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-opacity-10 ${eInvoiceStatusInfo.color}`}
            title={`e-Invoice: ${eInvoiceStatusInfo.text}`}
          >
            <EInvoiceIcon size={14} className="mr-1" />
            e-Invoice
          </span>
        )}
      </div>
    </div>
  );
};

export default InvoiceCard;

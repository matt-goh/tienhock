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
  IconCheck,
  IconX,
  IconClockHour4,
  IconBan,
  IconAlertTriangle,
  IconCircleCheck,
} from "@tabler/icons-react";
import {
  formatDisplayDate,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils"; // Assuming these utils exist

interface InvoiceCardProps {
  invoice: ExtendedInvoiceData;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onViewDetails: (id: string) => void;
}

// Helper to get status styles
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

// Helper to get e-invoice status styles and icon
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
    // Prevent navigation if clicking on the checkbox area
    if ((e.target as HTMLElement).closest(".invoice-card-select")) {
      return;
    }
    onViewDetails(invoice.id);
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click handler
    onSelect(invoice.id);
  };

  return (
    <div
      className={`relative border rounded-lg overflow-hidden transition-shadow duration-200 cursor-pointer ${
        isSelected
          ? "shadow-md ring-2 ring-blue-500 ring-offset-1"
          : "shadow-sm hover:shadow-md"
      } ${invoiceStatusStyle.border}`}
      onClick={handleCardClick}
    >
      {/* Selection Checkbox Area */}
      <div
        className="invoice-card-select absolute top-2 right-2 z-10 p-1"
        onClick={handleSelectClick}
      >
        {isSelected ? (
          <IconSquareCheckFilled className="text-blue-600" size={24} />
        ) : (
          <IconSquare
            className="text-default-400 hover:text-default-600 transition-colors"
            size={24}
          />
        )}
      </div>

      {/* Header */}
      <div
        className={`flex justify-between items-center p-3 ${invoiceStatusStyle.bg} border-b ${invoiceStatusStyle.border}`}
      >
        <span className={`font-semibold ${invoiceStatusStyle.text}`}>
          {invoice.paymenttype === "CASH" ? "C" : "I"}
          {invoice.id}
        </span>
        <span className={`text-sm ${invoiceStatusStyle.text}`}>
          {formatDisplayDate(date)}
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <p
          className="font-medium text-default-800 truncate"
          title={invoice.customerName || invoice.customerid}
        >
          {invoice.customerName || invoice.customerid}
        </p>
        <p className="text-lg font-semibold text-default-900">
          {`RM ${invoice.totalamountpayable.toFixed(2)}`}
        </p>
      </div>

      {/* Footer / Status Badges */}
      <div className="px-3 pb-3 flex flex-wrap gap-2 items-center">
        {/* Invoice Status */}
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${invoiceStatusStyle.bg} ${invoiceStatusStyle.text}`}
        >
          {invoice.invoice_status.charAt(0).toUpperCase() +
            invoice.invoice_status.slice(1)}
        </span>
        {/* Payment Type */}
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          {invoice.paymenttype === "CASH" ? (
            <IconCash size={14} className="mr-1" />
          ) : (
            <IconFileInvoice size={14} className="mr-1" />
          )}
          {invoice.paymenttype}
        </span>
        {/* E-Invoice Status */}
        {eInvoiceStatusInfo && EInvoiceIcon && (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${eInvoiceStatusInfo.color} bg-opacity-10`}
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

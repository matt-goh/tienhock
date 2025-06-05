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
  IconClockHour4,
  IconBan,
  IconAlertTriangle,
  IconCircleCheck,
  IconFiles,
} from "@tabler/icons-react";
import {
  formatDisplayDate,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";
import { useNavigate } from "react-router-dom";

interface InvoiceCardProps {
  invoice: ExtendedInvoiceData;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onViewDetails: (id: string) => void;
  salesmanName?: string | null;
}

// Helper to get status styles
const getInvoiceStatusStyles = (status: InvoiceStatus | undefined) => {
  // Added undefined check
  // Use toLowerCase() for case-insensitive matching
  switch (status?.toLowerCase()) {
    case "paid":
      return {
        bg: "bg-green-100",
        text: "text-green-800",
        border: "border-green-200",
        label: "Paid",
      };
    case "cancelled":
      return {
        bg: "bg-rose-100",
        text: "text-rose-800",
        border: "border-rose-200",
        label: "Cancelled",
      };
    case "overdue":
      return {
        bg: "bg-red-100",
        text: "text-red-800",
        border: "border-red-200",
        label: "Overdue",
      };
    default: // Default to Unpaid style
      return {
        bg: "bg-amber-100",
        text: "text-amber-800",
        border: "border-amber-200",
        label: "Unpaid", // Keep original label if needed
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

const getConsolidatedStatusInfo = (consolidatedInfo: any) => {
  if (!consolidatedInfo) return null;

  // Only show for valid consolidated invoices - adjust based on your requirements
  if (consolidatedInfo.einvoice_status !== "valid") return null;

  return {
    text: "Consolidated",
    color: "text-indigo-600",
    border: "border-indigo-200",
    icon: IconFiles,
    info: consolidatedInfo,
  };
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
  const consolidatedStatusInfo = getConsolidatedStatusInfo(
    invoice.consolidated_part_of
  );
  const ConsolidatedIcon = consolidatedStatusInfo?.icon;
  const navigate = useNavigate();

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
      className={`relative border rounded-lg overflow-hidden bg-white transition-shadow duration-200 group
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
        className={`invoice-card-header flex justify-between items-center gap-3 border-b ${invoiceStatusStyle.border} ${invoiceStatusStyle.bg} -mx-4 -mt-4 px-4 py-1.5 rounded-t-lg cursor-pointer`} // Negative margins, re-add padding, ADD cursor-pointer
        onClick={handleHeaderClick} // <-- Add header click handler
      >
        {/* Invoice ID - Takes available space */}
        <span
          className={`font-semibold ${invoiceStatusStyle.text} w-fit truncate hover:underline cursor-pointer`}
          title={`${invoice.paymenttype === "CASH" ? "C" : "I"}${invoice.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(invoice.id);
          }}
        >
          {invoice.paymenttype === "CASH" ? "C" : "I"}
          {invoice.id}
        </span>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Body - Uses parent's horizontal padding */}
      <div className="space-y-2">
        <p className="flex flex-col w-auto font-medium">
          <span
            className="w-auto truncate text-default-800 hover:underline cursor-pointer"
            title={invoice.customerName || invoice.customerid}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/catalogue/customer/${invoice.customerid}`);
            }}
          >
            {invoice.customerName || invoice.customerid}
          </span>
          <span
            className="w-fit text-xs text-default-500 truncate hover:underline cursor-pointer"
            title={invoice.salespersonid}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/catalogue/staff/${invoice.salespersonid}`);
            }}
          >
            {invoice.salespersonid}
          </span>
        </p>
        <p className="text-lg font-semibold text-default-900">
          {`RM ${invoice.totalamountpayable.toFixed(2)}`}
        </p>
      </div>

      {/* Footer - Uses parent's horizontal padding */}
      <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
        {/* Invoice Status - Make Unpaid and Overdue clickable */}
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            invoiceStatusStyle.bg
          } ${invoiceStatusStyle.text} ${
            invoiceStatusStyle.label === "Unpaid" ||
            invoiceStatusStyle.label === "Overdue"
              ? "cursor-pointer hover:brightness-95"
              : ""
          }`}
          onClick={(e) => {
            if (
              invoiceStatusStyle.label === "Unpaid" ||
              invoiceStatusStyle.label === "Overdue"
            ) {
              e.stopPropagation();
              // Navigate directly to details page with payment form open
              navigate(`/sales/invoice/${invoice.id}`, {
                state: { showPaymentForm: true },
              });
            }
          }}
        >
          {invoiceStatusStyle.label}
        </span>
        {/* E-Invoice Status */}
        {eInvoiceStatusInfo &&
          EInvoiceIcon &&
          (invoice.long_id ? (
            <a
              href={`https://myinvois.hasil.gov.my/${invoice.uuid}/share/${invoice.long_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-opacity-10 ${eInvoiceStatusInfo.color} hover:underline`}
              title={`e-Invoice: ${eInvoiceStatusInfo.text}`}
            >
              <EInvoiceIcon size={14} className="mr-1" />
              e-Invoice
            </a>
          ) : (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-opacity-10 ${eInvoiceStatusInfo.color}`}
              title={`e-Invoice: ${eInvoiceStatusInfo.text}`}
            >
              <EInvoiceIcon size={14} className="mr-1" />
              e-Invoice
            </span>
          ))}
        {/* Consolidated Status - add this */}
        {consolidatedStatusInfo && ConsolidatedIcon && (
          <a
            href={`https://myinvois.hasil.gov.my/${consolidatedStatusInfo.info.uuid}/share/${consolidatedStatusInfo.info.long_id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${consolidatedStatusInfo.color} hover:underline`}
            title={`Part of consolidated invoice ${consolidatedStatusInfo.info.id}`}
          >
            <ConsolidatedIcon size={14} className="mr-1" />
            Consolidated
          </a>
        )}
      </div>
    </div>
  );
};

export default InvoiceCard;

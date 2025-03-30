// src/components/Invoice/InvoiceGrid.tsx
import React from "react";
import { ExtendedInvoiceData } from "../../types/types";
import InvoiceCard from "./InvoiceCard";
import { IconFileInvoice } from "@tabler/icons-react"; // For empty state

interface InvoiceGridProps {
  invoices: ExtendedInvoiceData[];
  selectedInvoiceIds: Set<string>;
  onSelectInvoice: (invoiceId: string) => void;
  onViewDetails: (invoiceId: string) => void;
  isLoading: boolean;
  error: string | null;
  customerNames: Record<string, string>;
}

const InvoiceGrid: React.FC<InvoiceGridProps> = ({
  invoices,
  selectedInvoiceIds,
  onSelectInvoice,
  onViewDetails,
  isLoading,
  error,
}) => {
  if (isLoading) {
    // Already handled by parent, but can add a placeholder if needed
    return null;
  }

  if (error) {
    // Already handled by parent
    return null;
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-50 rounded-xl border border-dashed border-default-200 mt-4">
        <IconFileInvoice
          size={64}
          className="text-default-300 mb-5"
          stroke={1.2}
        />
        <h3 className="text-xl font-semibold text-default-700 mb-2">
          No Invoices Found
        </h3>
        <p className="text-default-500 text-center max-w-md">
          No invoices match the current filters or search term.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {invoices.map((invoice) => (
        <InvoiceCard
          key={invoice.id}
          invoice={invoice}
          isSelected={selectedInvoiceIds.has(invoice.id)}
          onSelect={onSelectInvoice}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  );
};

export default InvoiceGrid;

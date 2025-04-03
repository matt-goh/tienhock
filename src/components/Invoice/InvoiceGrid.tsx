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
      <div className="flex flex-col items-center justify-center p-10 bg-gradient-to-b from-slate-50 to-slate-100 rounded-xl border border-dashed border-slate-200 mt-6 shadow-sm transition-all">
        <div className="bg-slate-100 p-5 rounded-full transform transition-transform hover:scale-105">
          <IconFileInvoice size={64} stroke={1.5} />
        </div>
        <h3 className="text-2xl font-semibold text-slate-700 mb-3">
          No Invoices Found
        </h3>
        <p className="text-slate-500 text-center max-w-md leading-relaxed">
          No invoices match your current filters or search criteria. Try
          adjusting the filters to see more results.
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

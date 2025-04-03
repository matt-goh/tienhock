// src/components/Invoice/FilterSummary.tsx
import React from "react";
import { InvoiceFilters } from "../../types/types";
import { IconTags, IconX } from "@tabler/icons-react";

interface FilterSummaryProps {
  filters: InvoiceFilters;
  onRemoveFilter?: (filterKey: keyof InvoiceFilters, value?: string) => void;
}

const FilterSummary: React.FC<FilterSummaryProps> = ({
  filters,
  onRemoveFilter,
}) => {
  const summaries: Array<{
    label: string;
    value: string;
    key: keyof InvoiceFilters;
    specificValue?: string;
  }> = [];

  // Salesperson filter
  if (
    filters.applySalespersonFilter &&
    filters.salespersonId &&
    filters.salespersonId.length > 0
  ) {
    filters.salespersonId.forEach((salesperson) => {
      summaries.push({
        label: "Salesman",
        value: salesperson,
        key: "salespersonId",
        specificValue: salesperson,
      });
    });
  }

  // Payment type filter
  if (filters.applyPaymentTypeFilter && filters.paymentType) {
    summaries.push({
      label: "Type",
      value: filters.paymentType,
      key: "paymentType",
    });
  }

  // Invoice status filter
  if (
    filters.applyInvoiceStatusFilter &&
    filters.invoiceStatus &&
    filters.invoiceStatus.length > 0
  ) {
    filters.invoiceStatus.forEach((status) => {
      summaries.push({
        label: "Status",
        value: status,
        key: "invoiceStatus",
        specificValue: status,
      });
    });
  }

  // E-Invoice status filter
  if (
    filters.applyEInvoiceStatusFilter &&
    filters.eInvoiceStatus &&
    filters.eInvoiceStatus.length > 0
  ) {
    filters.eInvoiceStatus.forEach((status) => {
      summaries.push({
        label: "E-Invoice",
        value: status === "null" ? "Not Submitted" : (status || ""),
        key: "eInvoiceStatus",
        specificValue: status === null ? undefined : status,
      });
    });
  }

  // Only render if there are actual filters applied
  if (summaries.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center text-sm text-default-600">
      <div className="flex items-center gap-1.5 text-default-500 font-medium">
        <IconTags size={16} className="text-default-400" />
        <span>Filters:</span>
      </div>
      <div className="flex flex-wrap gap-2 ml-3">
        {summaries.map((summary, index) => (
          <span
            key={`${summary.key}-${summary.specificValue || index}`}
            className="inline-flex items-center px-3 py-1 bg-default-100/75 text-default-700 rounded-full"
          >
            <span className="mr-1 text-default-500">{summary.label}:</span>{" "}
            {summary.value}
            {onRemoveFilter && (
              <button
                onClick={() =>
                  onRemoveFilter(summary.key, summary.specificValue)
                }
                className="ml-1.5 p-0.5 text-default-400 hover:text-default-600 rounded-full hover:bg-default-200"
              >
                <IconX size={14} />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
};

export default FilterSummary;

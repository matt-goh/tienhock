import React from "react";
import { InvoiceFilters } from "../../types/types";
import { IconTags } from "@tabler/icons-react";

interface FilterSummaryProps {
  filters: InvoiceFilters;
}

const FilterSummary: React.FC<FilterSummaryProps> = ({ filters }) => {
  const summaries: string[] = [];

  if (filters.applyPaymentTypeFilter && filters.paymentType) {
    summaries.push(
      `Type: ${filters.paymentType === "Cash" ? "Cash" : "Invoice"}`
    );
  }

  if (
    filters.applySalespersonFilter &&
    filters.salespersonId &&
    filters.salespersonId.length > 0
  ) {
    summaries.push(`Salesman: ${filters.salespersonId.join(", ")}`);
  }

  if (
    filters.applyCustomerFilter &&
    filters.customerId &&
    filters.customerId.length > 0
  ) {
    summaries.push(`Customer: ${filters.customerId.join(", ")}`);
  }

  // Only render if there are actual filters applied
  if (summaries.length === 0) {
    return <div className="mb-2"></div>;
  }

  return (
    <div className={`pb-3.5 flex items-center text-sm text-default-600`}>
      <div className="flex items-center gap-1.5 text-default-500 font-medium">
        <IconTags size={16} className="text-default-400" />
        <span>Filters:</span>
      </div>
      <div className="flex flex-wrap gap-2 ml-3">
        {summaries.map((summary, index) => (
          <span
            key={index}
            className="inline-flex items-center px-3 py-1 bg-default-100/75 text-default-700 rounded-full"
          >
            {summary}
          </span>
        ))}
      </div>
    </div>
  );
};

export default FilterSummary;

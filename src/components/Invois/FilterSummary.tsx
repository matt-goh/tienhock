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

  if (filters.applySalespersonFilter && filters.salespersonId) {
    summaries.push(`Salesman: ${filters.salespersonId}`);
  }

  if (filters.applyCustomerFilter && filters.customerId) {
    summaries.push(`Customer: ${filters.customerId}`);
  }

  return summaries.length === 0 ? (
    <div className="mb-2"></div>
  ) : (
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
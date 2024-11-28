import React from "react";
import { InvoiceFilterOptions } from "../../types/types";
import { IconTags } from "@tabler/icons-react";

interface FilterSummaryProps {
  filters: InvoiceFilterOptions;
}

const FilterSummary: React.FC<FilterSummaryProps> = ({ filters }) => {
  const summaries: string[] = [];
  if (filters.applyProductFilter) {
    summaries.push("Sales by products");
  }

  if (filters.applyInvoiceTypeFilter && filters.invoiceTypeFilter) {
    summaries.push(
      `Type: ${filters.invoiceTypeFilter === "C" ? "Cash" : "Invoice"}`
    );
  }

  if (
    filters.applySalesmanFilter &&
    filters.salesmanFilter &&
    filters.salesmanFilter.length > 0
  ) {
    summaries.push(`Salesman: ${filters.salesmanFilter.join(", ")}`);
  }

  if (
    filters.applyCustomerFilter &&
    filters.customerFilter &&
    filters.customerFilter.length > 0
  ) {
    summaries.push(`Customer: ${filters.customerFilter.join(", ")}`);
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

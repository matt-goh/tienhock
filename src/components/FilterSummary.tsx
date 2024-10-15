import React from "react";
import { InvoiceFilterOptions } from "../types/types";

interface FilterSummaryProps {
  filters: InvoiceFilterOptions;
}

const FilterSummary: React.FC<FilterSummaryProps> = ({ filters }) => {
  const summaries: string[] = [];

  const formatDate = (date: Date | null | undefined): string => {
    if (!date) return "";
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (filters.applyDateRangeFilter && filters.dateRangeFilter) {
    const startDate = formatDate(filters.dateRangeFilter.start);
    const endDate = formatDate(filters.dateRangeFilter.end);
    summaries.push(`Date: ${startDate} to ${endDate}`);
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

  if (filters.applyInvoiceTypeFilter && filters.invoiceTypeFilter) {
    summaries.push(
      `Type: ${filters.invoiceTypeFilter === "C" ? "Cash" : "Invoice"}`
    );
  }

  if (filters.applyProductFilter) {
    summaries.push("Sales by products");
  }

  if (summaries.length === 0) {
    return null;
  }

  return (
    <div className="text-sm text-default-500 mt-2 mb-4">
      <strong>Applied Filters:</strong> {summaries.join(" | ")}
    </div>
  );
};

export default FilterSummary;

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

  const isNextDay = (start: Date, end: Date): boolean => {
    const oneDayInMs = 24 * 60 * 60 * 1000; // One day in milliseconds
    return end.getTime() - start.getTime() <= oneDayInMs;
  };

  if (filters.applyDateRangeFilter && filters.dateRangeFilter) {
    const { start, end } = filters.dateRangeFilter;
    if (start && end) {
      const startDate = formatDate(start);
      const endDate = formatDate(end);

      if (startDate === endDate || isNextDay(start, end)) {
        summaries.push(`Date: ${startDate}`);
      } else {
        summaries.push(`Date: ${startDate} to ${endDate}`);
      }
    } else if (start) {
      summaries.push(`Date: ${formatDate(start)}`);
    }
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
    <div
      className={`flex flex-wrap ${
        filters.applyProductFilter ? "w-[760px]" : "w-[960px] pl-[45px]"
      } max-w-full text-sm text-default-500 mt-2 mb-4`}
    >
      <strong className="mr-1">Applied Filters:</strong>
      {summaries.join(" | ")}
    </div>
  );
};

export default FilterSummary;

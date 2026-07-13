// src/components/Invoice/InvoiceSelectionTable.tsx
import React from "react";
import { InvoiceData } from "../../types/types";
import { IconSearch, IconTrash } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import TimeNavigator, {
  type TimeRange,
} from "../../components/TimeNavigator";

interface InvoiceSelectionTableProps {
  invoices: InvoiceData[];
  selectedInvoiceIds: string[];
  onInvoiceSelect: (invoice: InvoiceData) => void;
  onInvoiceRemove: (invoiceId: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  dateRange: {
    start: Date;
    end: Date;
  };
  onDateRangeChange: (range: TimeRange) => void;
  isLoading: boolean;
}

const InvoiceSelectionTable: React.FC<InvoiceSelectionTableProps> = ({
  invoices,
  selectedInvoiceIds,
  onInvoiceSelect,
  onInvoiceRemove,
  searchTerm,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  isLoading,
}) => {
  const tableHeaderClassName: string =
    "bg-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:bg-gray-950 dark:text-gray-300";

  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString("en-MY", {
      style: "currency",
      currency: "MYR",
    });
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="relative z-20 flex flex-shrink-0 flex-col gap-3 rounded-t-xl border-b border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-4 sm:py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Find unpaid invoices
              </h4>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Invoices with pending payments are not shown.
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {isLoading ? "Loading..." : `${invoices.length} found`}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
              size={18}
            />
            <input
              type="text"
              placeholder="Invoice or customer"
              aria-label="Search available invoices"
              className="h-[34px] w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-10 pr-3 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
              value={searchTerm}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onSearchChange(event.target.value)
              }
            />
          </div>
          <TimeNavigator
            range={dateRange}
            onChange={onDateRangeChange}
            modes={["day", "month", "range", "year"]}
            size="sm"
            disabled={isLoading}
            className="self-start sm:self-auto"
          />
        </div>
      </div>

      <div className="min-h-[22rem] flex-1 overflow-auto overscroll-contain rounded-b-xl [scrollbar-gutter:stable] lg:min-h-0">
        <table className="w-full min-w-[680px] border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${tableHeaderClassName} border-b border-gray-200 text-left dark:border-gray-700`}>
                Invoice
              </th>
              <th className={`${tableHeaderClassName} border-b border-gray-200 text-left dark:border-gray-700`}>
                Customer
              </th>
              <th className={`${tableHeaderClassName} border-b border-gray-200 text-left dark:border-gray-700`}>
                Date
              </th>
              <th className={`${tableHeaderClassName} hidden border-b border-gray-200 text-right dark:border-gray-700 2xl:table-cell`}>
                Total
              </th>
              <th className={`${tableHeaderClassName} border-b border-gray-200 text-right dark:border-gray-700`}>
                Balance Due
              </th>
              <th className={`${tableHeaderClassName} border-b border-gray-200 text-center dark:border-gray-700`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center">
                  <div className="flex justify-center">
                    <LoadingSpinner />
                  </div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Loading unpaid invoices...
                  </p>
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  {searchTerm.trim()
                    ? "No invoices match your search in this date range."
                    : "No unpaid invoices found in this date range."}
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => {
                const isSelected = selectedInvoiceIds.includes(invoice.id);
                return (
                  <tr
                    key={invoice.id}
                    className={`${
                      isSelected
                        ? "bg-sky-50 dark:bg-sky-950/50"
                        : "bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800"
                    }`}
                  >
                    <td className="whitespace-nowrap border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-900 dark:border-gray-800 dark:text-gray-100">
                      <span className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                        {invoice.paymenttype === "CASH" ? "C" : "I"}
                        {invoice.id}
                      </span>
                    </td>
                    <td className="max-w-[280px] border-b border-gray-200 px-4 py-3 text-sm text-gray-900 dark:border-gray-800 dark:text-gray-100">
                      <div
                        className="truncate"
                        title={`${invoice.customerName || invoice.customerid}${
                          invoice.customerName
                            ? ` (${invoice.customerid})`
                            : ""
                        }`}
                      >
                        {invoice.customerName || invoice.customerid}
                        {invoice.customerName
                          ? ` (${invoice.customerid})`
                          : ""}
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                      {formatDate(invoice.createddate)}
                    </td>
                    <td className="hidden whitespace-nowrap border-b border-gray-200 px-4 py-3 text-right text-sm text-gray-900 dark:border-gray-800 dark:text-gray-100 2xl:table-cell">
                      {formatCurrency(invoice.totalamountpayable)}
                    </td>
                    <td
                      className="whitespace-nowrap border-b border-gray-200 px-4 py-3 text-right text-sm font-semibold text-red-600 dark:border-gray-800 dark:text-red-400"
                      title={`Invoice total: ${formatCurrency(
                        invoice.totalamountpayable
                      )}`}
                    >
                      {formatCurrency(invoice.balance_due)}
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-200 px-4 py-3 text-center dark:border-gray-800">
                      {isSelected ? (
                        <button
                          type="button"
                          onClick={() => onInvoiceRemove(invoice.id)}
                          className="rounded-md p-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30"
                          aria-label={`Remove invoice ${invoice.id}`}
                        >
                          <IconTrash size={16} />
                        </button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          color="sky"
                          onClick={() => onInvoiceSelect(invoice)}
                        >
                          Add
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InvoiceSelectionTable;

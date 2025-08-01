import React from "react";
import { InvoiceData } from "../../types/types";
import { IconSearch, IconPlus, IconTrash } from "@tabler/icons-react";
import Button from "../../components/Button";

interface InvoiceSelectionTableProps {
  invoices: InvoiceData[];
  selectedInvoiceIds: string[];
  onInvoiceSelect: (invoice: InvoiceData) => void;
  onInvoiceRemove: (invoiceId: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

const InvoiceSelectionTable: React.FC<InvoiceSelectionTableProps> = ({
  invoices,
  selectedInvoiceIds,
  onInvoiceSelect,
  onInvoiceRemove,
  searchTerm,
  onSearchChange,
  dateRange,
}) => {
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
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <h4 className="text-md font-medium text-gray-900">
          Available Unpaid Invoices
        </h4>
        <div className="flex items-center gap-4">
          <div className="relative w-auto">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search"
              title="Search by invoice number or customer..."
              className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-full focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-600">
            {dateRange.start && dateRange.end
              ? `${dateRange.start.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })} - ${dateRange.end.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}`
              : "All dates"}
          </div>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Balance Due
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No unpaid invoices found
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => {
                const isSelected = selectedInvoiceIds.includes(invoice.id);
                return (
                  <tr
                    key={invoice.id}
                    className={`${
                      isSelected ? "bg-sky-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invoice.paymenttype === "CASH" ? "C" : "I"}
                      {invoice.id}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                      {invoice.customerName || invoice.customerid} (
                      {invoice.customerid})
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(invoice.createddate)}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(invoice.totalamountpayable)}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-medium text-red-600">
                      {formatCurrency(invoice.balance_due)}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-center">
                      {isSelected ? (
                        <button
                          type="button"
                          onClick={() => onInvoiceRemove(invoice.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <IconTrash size={16} />
                        </button>
                      ) : (
                        <Button
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

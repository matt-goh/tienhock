// src/components/Invoice/CancelledInvoiceModal.tsx
import React from "react";
import { ExtendedInvoiceData } from "../../types/types";
import {
  formatDisplayDate,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";
import { IconX } from "@tabler/icons-react";

interface CancelledInvoiceModalProps {
  invoice: ExtendedInvoiceData | null;
  onClose: () => void;
  customerName?: string;
  isOpen: boolean;
}

const CancelledInvoiceModal: React.FC<CancelledInvoiceModalProps> = ({
  invoice,
  onClose,
  customerName,
  isOpen,
}) => {
  if (!isOpen || !invoice) return null;

  const createdDate = parseDatabaseTimestamp(invoice.createddate).date;
  const cancelledDate = invoice.cancellation_date
    ? new Date(invoice.cancellation_date)
    : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-default-900">
            Cancelled Invoice Details
          </h2>
          <button
            onClick={onClose}
            className="text-default-500 hover:text-default-700"
          >
            <IconX size={24} />
          </button>
        </div>

        <div className="p-6">
          {/* Invoice header info */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <div>
                <div className="text-sm text-default-500">Invoice Number</div>
                <div className="text-lg font-medium">
                  {invoice.paymenttype === "CASH" ? "C" : "I"}
                  {invoice.invoice_id}
                </div>
              </div>
              <div>
                <div className="text-sm text-default-500">Customer</div>
                <div className="text-lg font-medium">
                  {customerName || invoice.customerid}
                </div>
              </div>
              <div>
                <div className="text-sm text-default-500">Salesperson</div>
                <div className="text-lg font-medium">
                  {invoice.salespersonid}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-default-500">Created Date</div>
                <div className="text-lg font-medium">
                  {formatDisplayDate(createdDate)}
                </div>
              </div>
              <div>
                <div className="text-sm text-default-500">Cancelled Date</div>
                <div className="text-lg font-medium text-rose-600">
                  {cancelledDate ? formatDisplayDate(cancelledDate) : "-"}
                </div>
              </div>
              <div>
                <div className="text-sm text-default-500">Payment Type</div>
                <div className="text-lg font-medium">
                  {invoice.paymenttype === "CASH" ? "Cash" : "Invoice"}
                </div>
              </div>
            </div>
          </div>

          {/* Products table */}
          <h3 className="text-lg font-medium mb-3">Order Details</h3>
          <div className="border rounded-lg overflow-hidden mb-6">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                    Tax
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-default-200">
                {Array.isArray(invoice.products) &&
                invoice.products.length > 0 ? (
                  invoice.products.map((product, index) => (
                    <tr
                      key={index}
                      className={
                        product.issubtotal ? "bg-default-50 font-medium" : ""
                      }
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                        {product.description || product.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 text-center">
                        {product.issubtotal ? "" : product.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 text-right">
                        {product.issubtotal
                          ? ""
                          : Number(product.price).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 text-right">
                        {product.issubtotal
                          ? ""
                          : Number(product.tax || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 text-right font-medium">
                        {Number(product.total || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-center text-default-500"
                    >
                      No product details available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end space-y-2">
            <div className="w-64 space-y-1">
              <div className="flex justify-between">
                <span className="text-default-600">Subtotal:</span>
                <span className="font-medium">
                  {Number(invoice.amount || 0).toFixed(2)}
                </span>
              </div>
              {Number(invoice.rounding || 0) !== 0 && (
                <div className="flex justify-between pb-1">
                  <span className="text-default-600">Rounding:</span>
                  <span className="font-medium">
                    {Number(invoice.rounding || 0).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-default-200 font-bold">
                <span>Total:</span>
                <span>
                  {Number(invoice.totalamountpayable || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CancelledInvoiceModal;

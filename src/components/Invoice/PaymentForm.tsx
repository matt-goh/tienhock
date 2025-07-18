import React, { useState, useEffect, useCallback } from "react";
import { IconX, IconTrash } from "@tabler/icons-react";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { Payment, InvoiceData } from "../../types/types";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../../components/LoadingSpinner";
import InvoiceSelectionTable from "./InvoiceSelectionTable";

interface PaymentFormProps {
  payment: Payment | null;
  onClose: () => void;
  onSuccess: () => void;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

interface InvoicePaymentAllocation {
  invoice: InvoiceData;
  amountToPay: number;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  payment,
  onClose,
  onSuccess,
  dateRange,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [availableInvoices, setAvailableInvoices] = useState<InvoiceData[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<
    InvoicePaymentAllocation[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "cheque" as Payment["payment_method"],
    payment_reference: "",
    notes: "",
  });

  const paymentMethodOptions = [
    { id: "cash", name: "Cash" },
    { id: "cheque", name: "Cheque" },
    { id: "bank_transfer", name: "Bank Transfer" },
    { id: "online", name: "Online" },
  ];

  // Fetch unpaid invoices
  useEffect(() => {
    fetchUnpaidInvoices();
  }, []);

  const fetchUnpaidInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const params = new URLSearchParams({
        invoiceStatus: "Unpaid,overdue",
      });

      // Add date range filter from props
      if (dateRange.start) {
        params.append("startDate", dateRange.start.getTime().toString());
      }
      if (dateRange.end) {
        params.append("endDate", dateRange.end.getTime().toString());
      }

      const response = await api.get(`/api/invoices?${params.toString()}`);
      // The API returns a paginated response, we need the `data` property.
      setAvailableInvoices(response.data || []);
    } catch (error) {
      console.error("Error fetching unpaid invoices:", error);
      toast.error("Failed to fetch unpaid invoices");
    } finally {
      setLoadingInvoices(false);
    }
  }, [dateRange]);

  const totalPaymentAmount = selectedInvoices.reduce(
    (sum, item) => sum + item.amountToPay,
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice to pay");
      return;
    }

    if (!formData.payment_reference && selectedInvoices.length > 1) {
      toast.error(
        "Payment reference is required for multiple invoice payments"
      );
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Processing payment...");

    try {
      // Create payment for each selected invoice
      const paymentPromises = selectedInvoices.map(({ invoice, amountToPay }) =>
        api.post("/api/payments", {
          invoice_id: invoice.id,
          payment_date: formData.payment_date,
          amount_paid: amountToPay,
          payment_method: formData.payment_method,
          payment_reference: formData.payment_reference || undefined,
          notes: formData.notes || undefined,
        })
      );

      await Promise.all(paymentPromises);

      toast.success(
        selectedInvoices.length === 1
          ? "Payment recorded successfully"
          : `Payment recorded for ${selectedInvoices.length} invoices`,
        { id: toastId }
      );

      onSuccess();
    } catch (error: any) {
      console.error("Error creating payment:", error);
      toast.error(error.response?.data?.message || "Failed to record payment", {
        id: toastId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceSelect = (invoice: InvoiceData) => {
    const existing = selectedInvoices.find(
      (item) => item.invoice.id === invoice.id
    );
    if (!existing) {
      setSelectedInvoices([
        ...selectedInvoices,
        { invoice, amountToPay: invoice.balance_due },
      ]);
    }
  };

  const handleInvoiceRemove = (invoiceId: string) => {
    setSelectedInvoices(
      selectedInvoices.filter((item) => item.invoice.id !== invoiceId)
    );
  };

  const handleAmountChange = (invoiceId: string, amount: number) => {
    setSelectedInvoices(
      selectedInvoices.map((item) =>
        item.invoice.id === invoiceId ? { ...item, amountToPay: amount } : item
      )
    );
  };

  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString("en-MY", {
      style: "currency",
      currency: "MYR",
    });
  };

  const filteredInvoices = availableInvoices.filter((invoice) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      invoice.id.toLowerCase().includes(search) ||
      invoice.customerName?.toLowerCase().includes(search) ||
      invoice.customerid.toLowerCase().includes(search)
    );
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {payment ? "Edit Payment" : "Record New Payment"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isSubmitting}
          >
            <IconX size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Payment Details */}
            <div className="mb-4">
              <h4 className="text-md font-medium text-gray-900 mb-4">
                Payment Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput
                  name="payment_date"
                  label="Payment Date"
                  type="date"
                  value={formData.payment_date}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_date: e.target.value })
                  }
                  disabled={isSubmitting}
                  required
                />
                <FormListbox
                  name="payment_method"
                  label="Payment Method"
                  value={formData.payment_method}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      payment_method: value as Payment["payment_method"],
                    })
                  }
                  options={paymentMethodOptions}
                  disabled={isSubmitting}
                />
                <FormInput
                  name="payment_reference"
                  label={`Payment Reference ${
                    selectedInvoices.length > 1 ? "(Required)" : "(Optional)"
                  }`}
                  placeholder={
                    formData.payment_method === "cheque"
                      ? "Cheque number"
                      : formData.payment_method === "bank_transfer"
                      ? "Transaction reference"
                      : formData.payment_method === "online"
                      ? "Transaction ID"
                      : "Reference number"
                  }
                  value={formData.payment_reference}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      payment_reference: e.target.value,
                    })
                  }
                  disabled={isSubmitting}
                  required={selectedInvoices.length > 1}
                />
                <FormInput
                  name="notes"
                  label="Notes (Optional)"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Selected Invoices */}
            {selectedInvoices.length > 0 && (
              <div className="mb-4">
                <h4 className="text-md font-medium text-gray-900 mb-2">
                  Selected Invoices ({selectedInvoices.length})
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="space-y-2">
                    {selectedInvoices.map(({ invoice, amountToPay }) => (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between bg-white p-2 rounded border"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 text-sm">
                            <span className="font-medium">{invoice.id}</span>
                            <span className="text-gray-600 truncate">
                              {invoice.customerName}
                            </span>
                            <span className="text-gray-500 text-xs">
                              Bal: {formatCurrency(invoice.balance_due)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={invoice.balance_due}
                            value={amountToPay}
                            onChange={(e) =>
                              handleAmountChange(
                                invoice.id,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => handleInvoiceRemove(invoice.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            disabled={isSubmitting}
                          >
                            <IconTrash size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-300">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">Total:</span>
                      <span className="text-lg font-bold text-green-600">
                        {formatCurrency(totalPaymentAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Available Invoices */}
            <div>
              {loadingInvoices ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : (
                <InvoiceSelectionTable
                  invoices={filteredInvoices}
                  selectedInvoiceIds={selectedInvoices.map(
                    (item) => item.invoice.id
                  )}
                  onInvoiceSelect={handleInvoiceSelect}
                  onInvoiceRemove={handleInvoiceRemove}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  dateRange={dateRange}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {selectedInvoices.length === 0 ? (
                  "Select invoices to pay"
                ) : (
                  <>
                    {selectedInvoices.length} invoice
                    {selectedInvoices.length !== 1 ? "s" : ""} selected
                    {formData.payment_method === "cheque" && (
                      <span className="ml-2 text-amber-600">
                        (Will be marked as pending until confirmed)
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  color="sky"
                  disabled={isSubmitting || selectedInvoices.length === 0}
                >
                  {isSubmitting ? "Processing..." : "Record Payment"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentForm;

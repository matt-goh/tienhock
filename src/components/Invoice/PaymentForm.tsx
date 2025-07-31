import React, { useState, useEffect, useCallback } from "react";
import { IconX, IconTrash } from "@tabler/icons-react";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { Payment, InvoiceData } from "../../types/types";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../../components/LoadingSpinner";
import InvoiceSelectionTable from "./InvoiceSelectionTable";
import ConfirmationDialog from "../../components/ConfirmationDialog";

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
  const [showOverpaymentConfirm, setShowOverpaymentConfirm] = useState(false);
  const [overpaymentDetails, setOverpaymentDetails] = useState<
    | {
        invoiceId: string;
        customerName: string;
        totalAmount: number;
        regularAmount: number;
        overpaidAmount: number;
      }[]
    | null
  >(null);

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
        all: "true", // Add this to get all invoices without pagination
      });

      // Add date range filter from props
      if (dateRange.start) {
        params.append("startDate", dateRange.start.getTime().toString());
      }
      if (dateRange.end) {
        params.append("endDate", dateRange.end.getTime().toString());
      }

      const response = await api.get(`/api/invoices?${params.toString()}`);
      // With all=true, the response is directly an array of invoices
      setAvailableInvoices(Array.isArray(response) ? response : []);
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

    // Check for ALL overpayments
    const overpaymentInvoices = selectedInvoices.filter(
      ({ invoice, amountToPay }) => amountToPay > invoice.balance_due
    );

    if (overpaymentInvoices.length > 0) {
      const overpaymentData = overpaymentInvoices.map(
        ({ invoice, amountToPay }) => ({
          invoiceId: invoice.id,
          customerName: invoice.customerName || invoice.customerid,
          totalAmount: amountToPay,
          regularAmount: invoice.balance_due,
          overpaidAmount: amountToPay - invoice.balance_due,
        })
      );

      setOverpaymentDetails(overpaymentData);
      setShowOverpaymentConfirm(true);
      return;
    }

    // Proceed with normal payment processing
    await processPayments();
  };

  const processPayments = async () => {
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

      const results = await Promise.all(paymentPromises);

      // Count overpayments
      const overpaymentCount = results.filter(
        (result) => result.isOverpayment
      ).length;

      let successMessage;
      if (overpaymentCount > 0) {
        if (selectedInvoices.length === 1) {
          successMessage =
            "Payment recorded successfully with overpaid amount tracked separately";
        } else {
          successMessage = `Payments recorded for ${selectedInvoices.length} invoices`;
          if (overpaymentCount === selectedInvoices.length) {
            successMessage += " - all with overpayments tracked separately";
          } else {
            successMessage += ` - ${overpaymentCount} with overpayments tracked separately`;
          }
        }
      } else {
        successMessage =
          selectedInvoices.length === 1
            ? "Payment recorded successfully"
            : `Payment recorded for ${selectedInvoices.length} invoices`;
      }

      toast.success(successMessage, { id: toastId, duration: 6000 });
      setShowOverpaymentConfirm(false);
      setOverpaymentDetails(null);
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

  const handleConfirmOverpayment = async () => {
    setShowOverpaymentConfirm(false);
    await processPayments();
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
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
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
                  {selectedInvoices.some(
                    ({ invoice, amountToPay }) =>
                      amountToPay > invoice.balance_due
                  ) && (
                    <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                      {
                        selectedInvoices.filter(
                          ({ invoice, amountToPay }) =>
                            amountToPay > invoice.balance_due
                        ).length
                      }{" "}
                      Overpayment(s)
                    </span>
                  )}
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="space-y-2">
                    {selectedInvoices.map(({ invoice, amountToPay }) => {
                      const isOverpayment = amountToPay > invoice.balance_due;
                      const overpaidAmount = isOverpayment
                        ? amountToPay - invoice.balance_due
                        : 0;

                      return (
                        <div
                          key={invoice.id}
                          className={`flex items-center justify-between p-2 rounded border transition-colors ${
                            isOverpayment
                              ? "bg-purple-50 border-purple-200"
                              : "bg-white border-gray-200"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 text-sm">
                              <span className="font-medium">{invoice.id}</span>
                              <span className="text-gray-600 truncate">
                                {invoice.customerName} ({invoice.customerid})
                              </span>
                              <span className="text-gray-500 text-xs">
                                Bal: {formatCurrency(invoice.balance_due)}
                              </span>
                              {isOverpayment && (
                                <span className="text-purple-600 text-xs font-medium">
                                  Overpaid: {formatCurrency(overpaidAmount)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <div className="relative">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={amountToPay}
                                onChange={(e) =>
                                  handleAmountChange(
                                    invoice.id,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className={`w-24 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                                  isOverpayment
                                    ? "border-purple-400 bg-purple-50"
                                    : "border-gray-300"
                                }`}
                                disabled={isSubmitting}
                              />
                            </div>
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
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-300">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">Total:</span>
                      <span className="text-lg font-bold text-green-600">
                        {formatCurrency(totalPaymentAmount)}
                      </span>
                    </div>
                    {selectedInvoices.some(
                      ({ invoice, amountToPay }) =>
                        amountToPay > invoice.balance_due
                    ) && (
                      <div className="mt-2 pt-2 border-t border-purple-200 bg-purple-50 -mx-3 -mb-3 px-3 pb-3 rounded-b-lg">
                        <div className="flex justify-between text-sm">
                          <span className="text-purple-700">
                            Regular Payments:
                          </span>
                          <span className="font-medium text-purple-700">
                            {formatCurrency(
                              selectedInvoices.reduce(
                                (sum, { invoice, amountToPay }) =>
                                  sum +
                                  Math.min(amountToPay, invoice.balance_due),
                                0
                              )
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-purple-700">
                            Overpaid Amounts:
                          </span>
                          <span className="font-medium text-purple-700">
                            {formatCurrency(
                              selectedInvoices.reduce(
                                (sum, { invoice, amountToPay }) =>
                                  sum +
                                  Math.max(
                                    0,
                                    amountToPay - invoice.balance_due
                                  ),
                                0
                              )
                            )}
                          </span>
                        </div>
                      </div>
                    )}
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
          <div className="px-6 py-4 border-t bg-gray-50 rounded-b-lg">
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
      {/* Overpayment Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showOverpaymentConfirm}
        onClose={() => {
          setShowOverpaymentConfirm(false);
          setOverpaymentDetails(null);
        }}
        onConfirm={handleConfirmOverpayment}
        title={`Overpayment${
          overpaymentDetails && overpaymentDetails.length > 1 ? "s" : ""
        } Detected`}
        message={
          overpaymentDetails ? (
            <div className="space-y-2">
              <p>
                {overpaymentDetails.length === 1
                  ? "The following payment exceeds the balance due:"
                  : `${overpaymentDetails.length} payments exceed their respective balance due:`}
              </p>

              <div className="space-y-2 max-h-[264px] overflow-y-auto">
                {overpaymentDetails.map((detail, index) => (
                  <div
                    key={detail.invoiceId}
                    className="bg-gray-50 p-3 border rounded-lg"
                  >
                    <div className="font-medium text-sm text-gray-800 mb-2">
                      Invoice {detail.invoiceId} - {detail.customerName}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Total Payment:</span>
                        <span className="font-medium">
                          {formatCurrency(detail.totalAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Applied to Balance:</span>
                        <span className="font-medium">
                          {formatCurrency(detail.regularAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span>Overpaid Amount:</span>
                        <span className="font-medium text-purple-600">
                          {formatCurrency(detail.overpaidAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-purple-50 p-3 border border-purple-200 rounded-lg">
                <div className="font-medium text-sm text-purple-800 mb-2">
                  Summary
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Total Regular Payments:</span>
                    <span className="font-medium">
                      {formatCurrency(
                        overpaymentDetails.reduce(
                          (sum, detail) => sum + detail.regularAmount,
                          0
                        )
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Overpaid Amount:</span>
                    <span className="font-medium text-purple-600">
                      {formatCurrency(
                        overpaymentDetails.reduce(
                          (sum, detail) => sum + detail.overpaidAmount,
                          0
                        )
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span>Grand Total:</span>
                    <span className="font-bold">
                      {formatCurrency(
                        overpaymentDetails.reduce(
                          (sum, detail) => sum + detail.totalAmount,
                          0
                        )
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                Each overpaid amount will be recorded as a separate "Overpaid"
                payment record for its respective invoice.
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmButtonText={`Confirm Split Payment${
          overpaymentDetails && overpaymentDetails.length > 1 ? "s" : ""
        }`}
        variant="default"
      />
    </div>
  );
};

export default PaymentForm;

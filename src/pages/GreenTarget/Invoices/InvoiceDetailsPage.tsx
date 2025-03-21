// src/pages/GreenTarget/Invoices/InvoiceDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  IconFileInvoice,
  IconCash,
  IconPrinter,
  IconEdit,
  IconChevronLeft,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import { api } from "../../../routes/utils/api";
import LoadingSpinner from "../../../components/LoadingSpinner";

interface Payment {
  payment_id: number;
  invoice_id: number;
  payment_date: string;
  amount_paid: number;
  payment_method: string;
  payment_reference?: string;
  internal_reference?: string;
}

interface Invoice {
  invoice_id: number;
  invoice_number: string;
  type: "regular" | "statement";
  customer_id: number;
  customer_name: string;
  rental_id?: number;
  tong_no?: string;
  date_placed?: string;
  date_picked?: string;
  driver?: string;
  amount_before_tax: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  current_balance: number;
  date_issued: string;
  balance_due: number;
  statement_period_start?: string;
  statement_period_end?: string;
}

interface PaymentFormData {
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  payment_reference: string;
  internal_reference: string;
}

const InvoiceDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState<PaymentFormData>({
    amount_paid: 0,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "cash",
    payment_reference: "",
    internal_reference: "",
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  useEffect(() => {
    if (id) {
      fetchInvoiceDetails(parseInt(id));
    }
  }, [id]);

  const fetchInvoiceDetails = async (invoiceId: number) => {
    try {
      setLoading(true);
      const data = await api.get(`/greentarget/api/invoices/${invoiceId}`);

      if (!data.invoice) {
        throw new Error("Invoice not found");
      }

      setInvoice(data.invoice);
      setPayments(data.payments || []);

      // Pre-fill amount in payment form
      setPaymentFormData((prev) => ({
        ...prev,
        amount_paid: data.invoice.current_balance,
      }));

      setError(null);
    } catch (err) {
      setError("Failed to fetch invoice details. Please try again.");
      console.error("Error fetching invoice details:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    // Handle numeric inputs
    if (type === "number") {
      setPaymentFormData((prev) => ({
        ...prev,
        [name]: parseFloat(value) || 0,
      }));
    } else {
      setPaymentFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const validatePaymentForm = (): boolean => {
    if (!paymentFormData.payment_date) {
      toast.error("Payment date is required");
      return false;
    }

    if (paymentFormData.amount_paid <= 0) {
      toast.error("Payment amount must be greater than zero");
      return false;
    }

    if (invoice && paymentFormData.amount_paid > invoice.current_balance) {
      toast.error("Payment amount cannot exceed the current balance");
      return false;
    }

    if (!paymentFormData.payment_method) {
      toast.error("Payment method is required");
      return false;
    }

    return true;
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePaymentForm() || !invoice) {
      return;
    }

    setIsProcessingPayment(true);

    try {
      const paymentData = {
        invoice_id: invoice.invoice_id,
        ...paymentFormData,
      };

      const response = await api.post("/greentarget/api/payments", paymentData);

      toast.success("Payment processed successfully");

      // Refresh the invoice details to get updated balance
      fetchInvoiceDetails(invoice.invoice_id);

      // Hide the payment form
      setShowPaymentForm(false);
    } catch (error) {
      console.error("Error processing payment:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("An error occurred while processing the payment");
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handlePrintInvoice = () => {
    // Placeholder for print functionality
    toast.success("Invoice printing functionality would go here");
    // In a real implementation, you'd either:
    // 1. Open a print-friendly view
    // 2. Generate a PDF and download it
    // 3. Send to a backend endpoint for printing
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-rose-50 text-rose-700 p-4 rounded-lg">
          <p>{error || "Invoice not found"}</p>
          <Button
            onClick={() => navigate("/greentarget/invoices")}
            icon={IconChevronLeft}
            className="mt-4"
          >
            Back to Invoices
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <button
            onClick={() => navigate("/greentarget/invoices")}
            className="mb-4 flex items-center text-default-600 hover:text-default-900"
          >
            <IconChevronLeft size={18} className="mr-1" />
            Back to Invoices
          </button>
          <h1 className="text-2xl font-bold text-default-900 flex items-center">
            <IconFileInvoice size={28} className="mr-2 text-default-600" />
            Invoice {invoice.invoice_number}
          </h1>
          <div className="text-default-500 text-sm mt-1">
            {invoice.type === "regular" ? "Regular Invoice" : "Statement"} •
            Issued on {formatDate(invoice.date_issued)}
          </div>
        </div>

        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={handlePrintInvoice}
            icon={IconPrinter}
            variant="outline"
          >
            Print
          </Button>

          {invoice.current_balance > 0 && (
            <Button
              onClick={() => setShowPaymentForm(!showPaymentForm)}
              icon={IconCash}
              variant={showPaymentForm ? "outline" : "filled"}
              color="sky"
            >
              {showPaymentForm ? "Cancel" : "Record Payment"}
            </Button>
          )}
        </div>
      </div>

      {/* Payment form */}
      {showPaymentForm && (
        <div className="bg-default-50 p-6 rounded-lg mb-6 border border-default-200">
          <h2 className="text-lg font-medium mb-4">Record Payment</h2>
          <form onSubmit={handleSubmitPayment}>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <label
                  htmlFor="payment_date"
                  className="block text-sm font-medium text-default-700"
                >
                  Payment Date
                </label>
                <input
                  type="date"
                  id="payment_date"
                  name="payment_date"
                  value={paymentFormData.payment_date}
                  onChange={handlePaymentFormChange}
                  className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="amount_paid"
                  className="block text-sm font-medium text-default-700"
                >
                  Amount Paid
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500">
                    RM
                  </span>
                  <input
                    type="number"
                    id="amount_paid"
                    name="amount_paid"
                    value={paymentFormData.amount_paid}
                    onChange={handlePaymentFormChange}
                    min="0.01"
                    max={invoice.current_balance}
                    step="0.01"
                    className="w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="payment_method"
                  className="block text-sm font-medium text-default-700"
                >
                  Payment Method
                </label>
                <select
                  id="payment_method"
                  name="payment_method"
                  value={paymentFormData.payment_method}
                  onChange={handlePaymentFormChange}
                  className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                >
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="online">Online Payment</option>
                </select>
              </div>

              {paymentFormData.payment_method === "cheque" && (
                <div className="space-y-2">
                  <label
                    htmlFor="payment_reference"
                    className="block text-sm font-medium text-default-700"
                  >
                    Cheque Number
                  </label>
                  <input
                    type="text"
                    id="payment_reference"
                    name="payment_reference"
                    value={paymentFormData.payment_reference}
                    onChange={handlePaymentFormChange}
                    className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                  />
                </div>
              )}

              {paymentFormData.payment_method === "bank_transfer" && (
                <div className="space-y-2">
                  <label
                    htmlFor="payment_reference"
                    className="block text-sm font-medium text-default-700"
                  >
                    Transaction Reference
                  </label>
                  <input
                    type="text"
                    id="payment_reference"
                    name="payment_reference"
                    value={paymentFormData.payment_reference}
                    onChange={handlePaymentFormChange}
                    className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <label
                htmlFor="internal_reference"
                className="block text-sm font-medium text-default-700"
              >
                Internal Reference (RV Number)
              </label>
              <input
                type="text"
                id="internal_reference"
                name="internal_reference"
                value={paymentFormData.internal_reference}
                onChange={handlePaymentFormChange}
                placeholder="e.g., RV25/01/73"
                className="w-full sm:w-1/2 px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
              />
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                type="submit"
                variant="filled"
                color="sky"
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? "Processing..." : "Process Payment"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Invoice details */}
      <div className="bg-white rounded-lg shadow border border-default-200 overflow-hidden">
        {/* Status banner */}
        <div
          className={`px-6 py-4 ${
            invoice.current_balance > 0
              ? "bg-amber-50 border-b border-amber-200"
              : "bg-green-50 border-b border-green-200"
          }`}
        >
          <div className="flex justify-between items-center">
            <div>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  invoice.current_balance > 0
                    ? "bg-amber-100 text-amber-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {invoice.current_balance > 0 ? "Outstanding" : "Paid"}
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-default-600">
                Balance Due:
              </p>
              <p
                className={`text-lg font-bold ${
                  invoice.current_balance > 0
                    ? "text-amber-600"
                    : "text-green-600"
                }`}
              >
                {formatCurrency(invoice.current_balance)}
              </p>
            </div>
          </div>
        </div>

        {/* Invoice info */}
        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-medium mb-3">Invoice Information</h2>
            <table className="min-w-full">
              <tbody>
                <tr>
                  <td className="py-2 pr-4 text-sm text-default-500 align-top">
                    Invoice Number:
                  </td>
                  <td className="py-2 text-sm font-medium text-default-900">
                    {invoice.invoice_number}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-sm text-default-500 align-top">
                    Type:
                  </td>
                  <td className="py-2 text-sm font-medium text-default-900">
                    {invoice.type === "regular"
                      ? "Regular Invoice"
                      : "Statement"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-sm text-default-500 align-top">
                    Date Issued:
                  </td>
                  <td className="py-2 text-sm font-medium text-default-900">
                    {formatDate(invoice.date_issued)}
                  </td>
                </tr>
                {invoice.type === "statement" && (
                  <tr>
                    <td className="py-2 pr-4 text-sm text-default-500 align-top">
                      Statement Period:
                    </td>
                    <td className="py-2 text-sm font-medium text-default-900">
                      {formatDate(invoice.statement_period_start || "")} to{" "}
                      {formatDate(invoice.statement_period_end || "")}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-2 pr-4 text-sm text-default-500 align-top">
                    Customer:
                  </td>
                  <td className="py-2 text-sm font-medium text-default-900">
                    {invoice.customer_name}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="text-lg font-medium mb-3">Amount Breakdown</h2>
            <table className="min-w-full">
              <tbody>
                <tr>
                  <td className="py-2 pr-4 text-sm text-default-500">
                    Subtotal:
                  </td>
                  <td className="py-2 text-sm font-medium text-right">
                    {formatCurrency(
                      parseFloat(invoice.amount_before_tax.toString())
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-sm text-default-500">
                    Tax (6% SST):
                  </td>
                  <td className="py-2 text-sm font-medium text-right">
                    {formatCurrency(parseFloat(invoice.tax_amount.toString()))}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-2 pr-4 text-base font-medium text-default-900">
                    Total:
                  </td>
                  <td className="py-2 text-base font-bold text-right">
                    {formatCurrency(
                      parseFloat(invoice.total_amount.toString())
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-sm text-default-500">
                    Amount Paid:
                  </td>
                  <td className="py-2 text-sm font-medium text-right text-green-600">
                    {formatCurrency(parseFloat(invoice.amount_paid.toString()))}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-2 pr-4 text-sm font-medium text-default-900">
                    Balance Due:
                  </td>
                  <td
                    className={`py-2 text-sm font-bold text-right ${
                      invoice.current_balance > 0
                        ? "text-amber-600"
                        : "text-green-600"
                    }`}
                  >
                    {formatCurrency(invoice.current_balance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Rental details for regular invoices */}
        {invoice.type === "regular" && invoice.rental_id && (
          <div className="px-6 py-4 border-t border-default-200">
            <h2 className="text-lg font-medium mb-3">Rental Details</h2>
            <div className="bg-default-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-default-500">Dumpster</p>
                  <p className="font-medium">{invoice.tong_no || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-default-500">Date Placed</p>
                  <p className="font-medium">
                    {formatDate(invoice.date_placed || "")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-default-500">Date Picked Up</p>
                  <p className="font-medium">
                    {formatDate(invoice.date_picked || "")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-default-500">Driver</p>
                  <p className="font-medium">{invoice.driver || "N/A"}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment history */}
      <div className="mt-8">
        <h2 className="text-xl font-medium mb-4">Payment History</h2>

        {payments.length === 0 ? (
          <div className="bg-white border border-default-200 rounded-lg p-6 text-center">
            <p className="text-default-500">No payments recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-default-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                      Method
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                      Internal Ref
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-default-200">
                  {payments.map((payment) => (
                    <tr key={payment.payment_id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        {formatCurrency(
                          parseFloat(payment.amount_paid.toString())
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                        {payment.payment_method === "cash" && "Cash"}
                        {payment.payment_method === "cheque" && "Cheque"}
                        {payment.payment_method === "bank_transfer" &&
                          "Bank Transfer"}
                        {payment.payment_method === "online" &&
                          "Online Payment"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                        {payment.payment_reference || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                        {payment.internal_reference || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceDetailsPage;

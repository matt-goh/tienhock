// src/pages/GreenTarget/Invoices/InvoiceDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  IconFileInvoice,
  IconCash,
  IconPrinter,
  IconChevronLeft,
  IconTrash,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

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
  tin_number?: string;
  id_number?: string;
  rental_id?: number;
  location_address?: string;
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
  einvoice_status?: "submitted" | "pending" | null;
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
  const location = useLocation();
  const state = (location.state as { showPaymentForm?: boolean }) || {};
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
  const [isDeletePaymentDialogOpen, setIsDeletePaymentDialogOpen] =
    useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [isDeleteInvoiceDialogOpen, setIsDeleteInvoiceDialogOpen] =
    useState(false);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
  const [isSubmittingEInvoice, setIsSubmittingEInvoice] = useState(false);
  const [showEInvoiceErrorDialog, setShowEInvoiceErrorDialog] = useState(false);
  const [eInvoiceErrorMessage, setEInvoiceErrorMessage] = useState("");

  useEffect(() => {
    if (id) {
      fetchInvoiceDetails(parseInt(id));
    }
  }, [id]);

  useEffect(() => {
    if (state?.showPaymentForm) {
      setShowPaymentForm(true);
    }
  }, [state]);

  const fetchInvoiceDetails = async (invoiceId: number) => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getInvoice(invoiceId);

      if (!data.invoice) {
        throw new Error("Invoice not found");
      }

      const invoice = data.invoice;

      // If this is a regular invoice with a rental_id, get the rental details to access location
      let locationAddress = null;
      if (invoice.type === "regular" && invoice.rental_id) {
        try {
          const rentalData = await greenTargetApi.getRental(invoice.rental_id);
          locationAddress = rentalData.location_address || null;
        } catch (error) {
          console.error("Error fetching rental location:", error);
        }
      }

      setInvoice({
        ...invoice,
        location_address: locationAddress,
      });

      setPayments(data.payments || []);

      // Pre-fill amount in payment form
      setPaymentFormData((prev) => ({
        ...prev,
        amount_paid: invoice.current_balance,
      }));

      setError(null);
    } catch (err) {
      setError("Failed to fetch invoice details. Please try again.");
      console.error("Error fetching invoice details:", err);
    } finally {
      setLoading(false);
    }
  };

  const isRentalActive = (datePickedStr: string | null | undefined) => {
    if (!datePickedStr) return true;

    // Convert dates to YYYY-MM-DD format for reliable comparison
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Get just the date part
    const pickupDateStr = datePickedStr.split("T")[0];

    // If pickup date is today or in the past, consider it completed
    return pickupDateStr > todayStr;
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
      // Fetch all payments to find unused reference numbers for the current month and year
      const allPayments = await greenTargetApi.getPayments();

      // Get current year (last 2 digits) and month (padded with zero)
      const currentYear = new Date().getFullYear().toString().slice(-2);
      const currentMonth = (new Date().getMonth() + 1)
        .toString()
        .padStart(2, "0");

      // Regular expression to match the format RV{year}/{month}/{number}
      const regex = new RegExp(`^RV${currentYear}/${currentMonth}/(\\d+)$`);

      // Extract all used numbers for the current month and year
      const usedNumbers = new Set();
      allPayments.forEach((payment: { internal_reference: string }) => {
        if (payment.internal_reference) {
          const match = payment.internal_reference.match(regex);
          if (match) {
            usedNumbers.add(parseInt(match[1]));
          }
        }
      });

      // Find the first unused number starting from 1
      let nextNumber = 1;
      while (usedNumbers.has(nextNumber)) {
        nextNumber++;
      }

      // Format the reference number
      const paddedNumber = nextNumber.toString().padStart(2, "0");
      const referenceNumber = `RV${currentYear}/${currentMonth}/${paddedNumber}`;

      const paymentData = {
        invoice_id: invoice.invoice_id,
        ...paymentFormData,
        internal_reference: referenceNumber,
      };

      const response = await greenTargetApi.createPayment(paymentData);

      toast.success("Payment processed successfully");
      fetchInvoiceDetails(invoice.invoice_id);
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

  const handleDeletePayment = async () => {
    if (!paymentToDelete || !invoice) return;

    setIsDeletingPayment(true);
    try {
      await greenTargetApi.deletePayment(paymentToDelete.payment_id);

      toast.success("Payment deleted successfully");

      // Refresh the invoice details to update balances
      fetchInvoiceDetails(invoice.invoice_id);
    } catch (error) {
      console.error("Error deleting payment:", error);
      toast.error("Failed to delete payment");
    } finally {
      setIsDeletingPayment(false);
      setIsDeletePaymentDialogOpen(false);
      setPaymentToDelete(null);
    }
  };

  const handleSubmitEInvoice = async () => {
    if (!invoice) return;

    try {
      setIsSubmittingEInvoice(true);
      const toastId = toast.loading("Submitting e-Invoice...");

      // Call the actual e-Invoice submission API
      const response = await greenTargetApi.submitEInvoice(invoice.invoice_id);

      if (response.success) {
        toast.success("e-Invoice submitted successfully", { id: toastId });

        // Refresh invoice details to show updated status
        fetchInvoiceDetails(invoice.invoice_id);
      } else {
        toast.error(response.message || "Failed to submit e-Invoice", {
          id: toastId,
        });
        setEInvoiceErrorMessage(
          response.message || "Failed to submit e-Invoice"
        );
        setShowEInvoiceErrorDialog(true);
      }
    } catch (error) {
      console.error("Error submitting e-Invoice:", error);
      toast.error("Failed to submit e-Invoice");
      setEInvoiceErrorMessage(
        error instanceof Error
          ? `Failed to submit e-Invoice: ${error.message}`
          : "Failed to submit e-Invoice due to an unknown error"
      );
      setShowEInvoiceErrorDialog(true);
    } finally {
      setIsSubmittingEInvoice(false);
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

  const handleDeleteInvoice = async () => {
    if (!invoice) return;

    // Check if invoice has payments
    if (payments.length > 0) {
      toast.error(
        "Cannot delete invoice: it has associated payments. Delete the payments first."
      );
      setIsDeleteInvoiceDialogOpen(false);
      return;
    }

    setIsDeletingInvoice(true);
    try {
      await greenTargetApi.deleteInvoice(invoice.invoice_id);
      toast.success("Invoice deleted successfully");
      navigate("/greentarget/invoices");
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      toast.error(error.message || "Failed to delete invoice");
    } finally {
      setIsDeletingInvoice(false);
      setIsDeleteInvoiceDialogOpen(false);
    }
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
      <div className="container mx-auto px-8 py-8">
        <div className="bg-rose-50 text-rose-700 p-4 rounded-lg">
          <p>{error || "Invoice not found"}</p>
          <Button
            onClick={() => navigate("/greentarget/invoices")}
            icon={IconChevronLeft}
            className="mt-4 font-medium"
          >
            Back to Invoices
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-8 pb-8 -mt-8">
      {/* Header with actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
        <div>
          <button
            onClick={() => navigate("/greentarget/invoices")}
            className="mb-4 flex items-center font-medium text-default-600 hover:text-default-900"
          >
            <IconChevronLeft size={18} className="mr-1" />
            Back to Invoices
          </button>
          <h1 className="text-2xl font-bold text-default-900 flex items-center">
            <IconFileInvoice size={28} className="mr-2 text-default-600" />
            Invoice{" "}
            <span
              className="truncate max-w-[150px] md:max-w-[300px] inline-block"
              title={invoice.invoice_number}
            >
              {invoice.invoice_number}
            </span>
            {invoice.einvoice_status === "submitted" && (
              <button
                className="ml-3 px-3 py-1.5 text-xs font-medium bg-green-100 border border-green-300 text-green-600 rounded-full cursor-default gap-1 flex items-center max-w-[180px]"
                title="e-Invoice Submitted"
              >
                <IconCheck size={18} stroke={1.5} />
                <span className="truncate">e-Invoice Submitted</span>
              </button>
            )}
          </h1>
        </div>

        <div className="flex space-x-3 mt-4 md:mt-0 md:self-end">
          {/* e-Invoice button - only show if customer has required fields */}
          {invoice.tin_number &&
            invoice.id_number &&
            !invoice.einvoice_status && (
              <Button
                onClick={handleSubmitEInvoice}
                icon={IconFileInvoice}
                variant="outline"
                color="amber"
                disabled={isSubmittingEInvoice}
              >
                {isSubmittingEInvoice ? "Submitting..." : "Submit e-Invoice"}
              </Button>
            )}
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
          <Button
            onClick={handlePrintInvoice}
            icon={IconPrinter}
            variant="outline"
            className="hidden md:block"
          >
            Print
          </Button>
          <Button
            onClick={() => setIsDeleteInvoiceDialogOpen(true)}
            icon={IconTrash}
            variant="outline"
            color="rose"
          >
            Delete
          </Button>
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
                <Listbox
                  value={paymentFormData.payment_method}
                  onChange={(value) => {
                    setPaymentFormData((prev) => ({
                      ...prev,
                      payment_method: value,
                    }));
                  }}
                >
                  <div className="relative">
                    <ListboxButton className="w-full px-3 py-2 border border-default-300 rounded-lg text-left focus:outline-none focus:border-default-500 focus:ring-0">
                      <span className="block truncate">
                        {paymentFormData.payment_method === "cash"
                          ? "Cash"
                          : paymentFormData.payment_method === "cheque"
                          ? "Cheque"
                          : paymentFormData.payment_method === "bank_transfer"
                          ? "Bank Transfer"
                          : paymentFormData.payment_method === "online"
                          ? "Online Payment"
                          : "Select Payment Method"}
                      </span>
                      <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                        <IconChevronDown
                          size={20}
                          className="text-default-500"
                        />
                      </span>
                    </ListboxButton>
                    <ListboxOptions className="absolute z-10 w-full mt-1 bg-white shadow-lg max-h-60 rounded-lg overflow-auto focus:outline-none border border-default-200">
                      <ListboxOption
                        value="cash"
                        className={({ active }) =>
                          `relative cursor-pointer select-none py-2 px-4 ${
                            active ? "bg-default-100" : ""
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              Cash
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck size={20} />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                      <ListboxOption
                        value="cheque"
                        className={({ active }) =>
                          `relative cursor-pointer select-none py-2 px-4 ${
                            active ? "bg-default-100" : ""
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              Cheque
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck size={20} />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                      <ListboxOption
                        value="bank_transfer"
                        className={({ active }) =>
                          `relative cursor-pointer select-none py-2 px-4 ${
                            active ? "bg-default-100" : ""
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              Bank Transfer
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck size={20} />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                      <ListboxOption
                        value="online"
                        className={({ active }) =>
                          `relative cursor-pointer select-none py-2 px-4 ${
                            active ? "bg-default-100" : ""
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              Online Payment
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck size={20} />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    </ListboxOptions>
                  </div>
                </Listbox>
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
                  <td className="py-2 pr-4 text-default-500 font-medium align-top">
                    Invoice Number:
                  </td>
                  <td className="py-2 font-medium text-default-900">
                    {invoice.invoice_number}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-default-500 font-medium align-top">
                    Type:
                  </td>
                  <td className="py-2 font-medium text-default-900">
                    {invoice.type === "regular"
                      ? "Regular Invoice"
                      : "Statement"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-default-500 font-medium align-top">
                    Date Issued:
                  </td>
                  <td className="py-2 font-medium text-default-900">
                    {formatDate(invoice.date_issued)}
                  </td>
                </tr>
                {invoice.type === "statement" && (
                  <tr>
                    <td className="py-2 pr-4 text-default-500 font-medium align-top">
                      Statement Period:
                    </td>
                    <td className="py-2 font-medium text-default-900 truncate max-w-[200px] md:max-w-none">
                      {formatDate(invoice.statement_period_start || "")} to{" "}
                      {formatDate(invoice.statement_period_end || "")}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-2 pr-4 text-default-500 font-medium align-top">
                    Customer:
                  </td>
                  <td className="py-2 font-medium text-default-900">
                    {invoice.customer_id ? (
                      <button
                        onClick={() =>
                          navigate(
                            `/greentarget/customers/${invoice.customer_id}`
                          )
                        }
                        className="text-default-900 hover:text-sky-600 font-medium hover:underline focus:outline-none truncate block max-w-[200px] md:max-w-none"
                        title={invoice.customer_name}
                      >
                        {invoice.customer_name}
                      </button>
                    ) : (
                      <span
                        className="truncate block max-w-[200px] md:max-w-none"
                        title={invoice.customer_name}
                      >
                        {invoice.customer_name}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="text-lg font-medium mb-3">Amount Breakdown</h2>
            <table className="min-w-full">
              <tbody>
                {/* Only show subtotal and tax if tax amount is non-zero */}
                {parseFloat(invoice.tax_amount.toString()) > 0 && (
                  <>
                    <tr>
                      <td className="py-2 pr-4 text-default-500">Subtotal:</td>
                      <td className="py-2 font-medium text-right">
                        {formatCurrency(
                          parseFloat(invoice.amount_before_tax.toString())
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 text-default-500">Tax:</td>
                      <td className="py-2 font-medium text-right">
                        {formatCurrency(
                          parseFloat(invoice.tax_amount.toString())
                        )}
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="py-2 pr-4 font-medium text-default-900">
                        Total:
                      </td>
                      <td className="py-2 font-bold text-right">
                        {formatCurrency(
                          parseFloat(invoice.total_amount.toString())
                        )}
                      </td>
                    </tr>
                  </>
                )}

                {/* If no tax, just show the total directly */}
                {parseFloat(invoice.tax_amount.toString()) === 0 && (
                  <tr>
                    <td className="py-2 pr-4 font-medium text-default-900">
                      Total:
                    </td>
                    <td className="py-2 font-bold text-right">
                      {formatCurrency(
                        parseFloat(invoice.total_amount.toString())
                      )}
                    </td>
                  </tr>
                )}

                <tr>
                  <td className="py-2 pr-4 text-default-500 font-medium">
                    Amount Paid:
                  </td>
                  <td className="py-2 font-medium text-right text-green-600">
                    {formatCurrency(parseFloat(invoice.amount_paid.toString()))}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-2 pr-4 font-medium text-default-900">
                    Balance Due:
                  </td>
                  <td
                    className={`py-2 font-bold text-right ${
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
            <div
              className="rounded-lg border border-default-200 overflow-hidden cursor-pointer"
              onClick={() =>
                navigate(`/greentarget/rentals/${invoice.rental_id}`)
              }
              title="View Rental"
            >
              {/* Status Banner */}
              <div
                className={`px-4 py-2 ${
                  isRentalActive(invoice.date_picked)
                    ? "bg-green-500 text-white"
                    : "bg-default-100 text-default-700"
                }`}
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Rental #{invoice.rental_id}</h3>
                  <span
                    className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                      isRentalActive(invoice.date_picked)
                        ? "bg-green-400/30 text-white"
                        : "bg-default-200 text-default-600"
                    }`}
                  >
                    {isRentalActive(invoice.date_picked)
                      ? "Ongoing"
                      : "Completed"}
                  </span>
                </div>
              </div>

              {/* Rental Information */}
              <div className="p-4">
                {/* Rental Dates */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-default-50 p-3 rounded-lg border border-default-100">
                    <div className="text-xs text-default-500 mb-1">
                      Placement Date
                    </div>
                    <div className="font-medium">
                      {formatDate(invoice.date_placed || "")}
                    </div>
                  </div>
                  <div
                    className={`p-3 rounded-lg ${
                      invoice.date_picked
                        ? "bg-default-50 border border-default-100"
                        : "bg-green-50 border border-green-100"
                    }`}
                  >
                    <div className="text-xs text-default-500 mb-1">
                      Pickup Date
                    </div>
                    <div
                      className={`font-medium ${
                        !invoice.date_picked ? "text-green-600" : ""
                      }`}
                    >
                      {invoice.date_picked
                        ? formatDate(invoice.date_picked)
                        : "Not picked up yet"}
                    </div>
                  </div>
                </div>
                {/* Dumpster, Driver & Location Info */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-default-50 p-3 rounded-lg border border-default-100">
                    <div className="text-xs text-default-500 mb-1">
                      Dumpster
                    </div>
                    <div className="font-medium">
                      {invoice.tong_no || "N/A"}
                    </div>
                  </div>
                  <div className="bg-default-50 p-3 rounded-lg border border-default-100">
                    <div className="text-xs text-default-500 mb-1">Driver</div>
                    <div className="font-medium">{invoice.driver || "N/A"}</div>
                  </div>
                </div>

                <div className="bg-default-50 p-3 rounded-lg border border-default-100">
                  <div className="text-xs text-default-500 mb-1">Location</div>
                  <div className="font-medium">
                    {invoice.location_address || "No specific location"}
                  </div>
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
          <div className="bg-white border border-dashed border-default-200 rounded-lg p-6 text-center">
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
                    {/* Add the new Actions column header */}
                    <th className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                      Actions
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
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Button
                          variant="outline"
                          color="rose"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPaymentToDelete(payment);
                            setIsDeletePaymentDialogOpen(true);
                          }}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <ConfirmationDialog
        isOpen={isDeletePaymentDialogOpen}
        onClose={() => setIsDeletePaymentDialogOpen(false)}
        onConfirm={handleDeletePayment}
        title="Delete Payment"
        message={`Are you sure you want to delete this payment of ${
          paymentToDelete
            ? formatCurrency(parseFloat(paymentToDelete.amount_paid.toString()))
            : ""
        }? This will affect the invoice balance.`}
        confirmButtonText={isDeletingPayment ? "Deleting..." : "Delete"}
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={isDeleteInvoiceDialogOpen}
        onClose={() => setIsDeleteInvoiceDialogOpen(false)}
        onConfirm={handleDeleteInvoice}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice ${
          invoice?.invoice_number
        }? This action cannot be undone.${
          payments.length > 0
            ? " Note: You must delete all payments first."
            : ""
        }`}
        confirmButtonText={isDeletingInvoice ? "Deleting..." : "Delete"}
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showEInvoiceErrorDialog}
        onClose={() => setShowEInvoiceErrorDialog(false)}
        onConfirm={() => setShowEInvoiceErrorDialog(false)}
        title="e-Invoice Submission Error"
        message={eInvoiceErrorMessage}
        confirmButtonText="Close"
        variant="danger"
        hideCancelButton={true}
      />
    </div>
  );
};

export default InvoiceDetailsPage;

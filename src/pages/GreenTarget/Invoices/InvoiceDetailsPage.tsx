// src/pages/GreenTarget/Invoices/InvoiceDetailsPage.tsx
import React, { useState, useEffect, Fragment } from "react"; // Added Fragment
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  IconFileInvoice,
  IconCash,
  IconPrinter,
  IconChevronLeft,
  IconTrash,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconAlertTriangle,
  IconCancel,
  IconRefresh,
  IconFileDownload,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import {
  Listbox,
  ListboxOption,
  ListboxOptions,
  Transition, // Added Transition
  ListboxButton as HeadlessListboxButton,
} from "@headlessui/react";
import clsx from "clsx"; // Added clsx
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import SubmissionResultsModal from "../../../components/Invoice/SubmissionResultsModal";
import { SelectOption } from "../../../components/FormComponents";
import { EInvoiceSubmissionResult, InvoiceGT } from "../../../types/types";
import GTPrintPDFOverlay from "../../../utils/greenTarget/PDF/GTPrintPDFOverlay";
import GTInvoicePDF from "../../../utils/greenTarget/PDF/GTInvoicePDF"; // For PDF structure
import { generateGTPDFFilename } from "../../../utils/greenTarget/PDF/generateGTPDFFilename";
import { pdf, Document } from "@react-pdf/renderer";
import { generateQRDataUrl } from "../../../utils/invoice/einvoice/generateQRCode";

interface Payment {
  payment_id: number;
  invoice_id: number;
  payment_date: string;
  amount_paid: number;
  payment_method: string;
  payment_reference?: string;
  internal_reference?: string;
  status?: "active" | "cancelled";
  cancellation_date?: string;
  cancellation_reason?: string;
}

interface PaymentFormData {
  amount_paid: number;
  payment_date: string;
  payment_method: string; // Keep as string ('cash', 'cheque', etc.)
  payment_reference: string;
  internal_reference: string;
}

// Define payment method options compatible with SelectOption
const paymentMethodOptions: SelectOption[] = [
  { id: "cash", name: "Cash" },
  { id: "cheque", name: "Cheque" },
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "online", name: "Online Payment" },
];

const InvoiceDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceGT | null>(null);
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
    payment_method: "cash", // Default value
    payment_reference: "",
    internal_reference: "",
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isCancelPaymentDialogOpen, setIsCancelPaymentDialogOpen] =
    useState(false);
  const [paymentToCancel, setPaymentToCancel] = useState<Payment | null>(null);
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [isCancelInvoiceDialogOpen, setIsCancelInvoiceDialogOpen] =
    useState(false);
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false);
  const [isSubmittingEInvoice, setIsSubmittingEInvoice] = useState(false);
  const [isCheckingEInvoice, setIsCheckingEInvoice] = useState(false);
  const [showSubmissionResultsModal, setShowSubmissionResultsModal] =
    useState(false);
  const [submissionResults, setSubmissionResults] =
    useState<EInvoiceSubmissionResult | null>(null);
  const [showEInvoiceConfirmDialog, setShowEInvoiceConfirmDialog] =
    useState(false);
  const [isSyncingCancellation, setIsSyncingCancellation] = useState(false);
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false); // To disable buttons
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

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

  useEffect(() => {
    // Generate QR code when invoice loads and has valid e-invoice data
    const generateQR = async () => {
      if (
        invoice?.uuid &&
        invoice?.long_id &&
        (invoice?.einvoice_status === "valid" ||
          invoice?.einvoice_status === "cancelled")
      ) {
        try {
          const qrData = await generateQRDataUrl(invoice.uuid, invoice.long_id);
          setQrCodeData(qrData);
        } catch (error) {
          console.error("Error generating QR code:", error);
        }
      }
    };

    generateQR();
  }, [invoice]);

  const fetchInvoiceDetails = async (invoiceId: number) => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getInvoice(invoiceId);

      if (!data.invoice) {
        throw new Error("Invoice not found");
      }

      const invoice = data.invoice;

      setInvoice(invoice);

      setPayments(data.payments || []);

      // Pre-fill amount in payment form
      setPaymentFormData((prev) => ({
        ...prev,
        amount_paid: invoice.current_balance,
        payment_method: prev.payment_method || "cash", // Ensure a default if needed
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

  // Specific handler for Listbox change
  const handlePaymentMethodChange = (value: string) => {
    setPaymentFormData((prev) => ({
      ...prev,
      payment_method: value,
    }));
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
      // Fetch all payments to find unused reference numbers (including cancelled ones)
      const allPayments = await greenTargetApi.getPayments(true);

      // Get year and month from the INVOICE'S issued date, not payment date
      const invoiceDate = new Date(invoice.date_issued);
      const invoiceYear = invoiceDate.getFullYear().toString().slice(-2);
      const invoiceMonth = (invoiceDate.getMonth() + 1)
        .toString()
        .padStart(2, "0");

      // Regular expression to match the format RV{year}/{month}/{number}
      const regex = new RegExp(`^RV${invoiceYear}/${invoiceMonth}/(\\d+)$`);

      // Find the highest used number for the invoice month and year
      // (including cancelled payments)
      let highestNumber = 0;
      allPayments.forEach(
        (payment: { internal_reference: string | null; status?: string }) => {
          // Handle potential null and consider ALL payments regardless of status
          if (payment.internal_reference) {
            const match = payment.internal_reference.match(regex);
            if (match) {
              const currentNumber = parseInt(match[1], 10);
              if (currentNumber > highestNumber) {
                highestNumber = currentNumber;
              }
            }
          }
        }
      );

      // Increment by 1 to get the next number
      const nextNumber = highestNumber + 1;

      // Format the reference number using invoice date's year/month
      const paddedNumber = nextNumber.toString().padStart(2, "0");
      const referenceNumber = `RV${invoiceYear}/${invoiceMonth}/${paddedNumber}`;

      const paymentData = {
        invoice_id: invoice.invoice_id,
        amount_paid: paymentFormData.amount_paid, // Use values from state
        payment_date: paymentFormData.payment_date,
        payment_method: paymentFormData.payment_method,
        payment_reference: paymentFormData.payment_reference || null, // Ensure null if empty
        internal_reference: referenceNumber,
      };

      await greenTargetApi.createPayment(paymentData);

      toast.success("Payment processed successfully");
      fetchInvoiceDetails(invoice.invoice_id); // Refresh details
      setShowPaymentForm(false); // Close form
      // Optionally reset form fields
      setPaymentFormData({
        amount_paid: 0,
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: "cash",
        payment_reference: "",
        internal_reference: "",
      });
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

  const handleCancelPayment = async () => {
    if (!paymentToCancel || !invoice) return;

    setIsCancellingPayment(true);
    try {
      // Call the new cancelPayment method
      await greenTargetApi.cancelPayment(paymentToCancel.payment_id);

      toast.success("Payment cancelled successfully");

      // Refresh the invoice details to update balances
      fetchInvoiceDetails(invoice.invoice_id);
    } catch (error) {
      console.error("Error cancelling payment:", error);
      toast.error("Failed to cancel payment");
    } finally {
      setIsCancellingPayment(false);
      setIsCancelPaymentDialogOpen(false);
      setPaymentToCancel(null);
    }
  };

  const handleCancelPaymentClick = (payment: Payment) => {
    // Don't allow cancelling already cancelled payments
    if (payment.status === "cancelled") {
      toast.error("This payment is already cancelled");
      return;
    }

    setPaymentToCancel(payment);
    setIsCancelPaymentDialogOpen(true);
  };

  const handleSubmitEInvoice = async () => {
    if (!invoice) return;
    setShowEInvoiceConfirmDialog(true);
  };

  // Add this new function for the confirmed submission
  const handleConfirmEInvoiceSubmission = async () => {
    if (!invoice) return;

    // Close dialog immediately before any async operations
    setShowEInvoiceConfirmDialog(false);

    // Small timeout to ensure dialog is closed before showing next UI
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      setIsSubmittingEInvoice(true);
      // Show the modal with loading state immediately
      setSubmissionResults(null);
      setShowSubmissionResultsModal(true);

      const toastId = toast.loading("Submitting e-Invoice...");

      // Call the actual e-Invoice submission API
      const response = await greenTargetApi.submitEInvoice(invoice.invoice_id);

      // Dismiss the loading toast
      toast.dismiss(toastId);

      // Transform the Green Target response to match the expected format
      const transformedResponse = {
        success: response.success,
        message: response.message || "e-Invoice submitted successfully",
        overallStatus:
          response.einvoice?.einvoice_status === "valid"
            ? "Valid"
            : response.einvoice?.einvoice_status === "pending"
            ? "Pending"
            : "Unknown",
        acceptedDocuments: response.einvoice
          ? [
              {
                internalId: response.einvoice.invoice_number,
                uuid: response.einvoice.uuid,
                longId: response.einvoice.long_id,
                status:
                  response.einvoice.einvoice_status === "valid"
                    ? "ACCEPTED"
                    : "Submitted",
                dateTimeValidated: response.einvoice.datetime_validated,
              },
            ]
          : [],
        rejectedDocuments:
          !response.success && response.error
            ? [
                {
                  internalId: invoice.invoice_id.toString(),
                  error: {
                    code: "ERROR",
                    message: response.error.message || "Unknown error",
                    details: response.error.details,
                  },
                },
              ]
            : [],
      };

      // Store the transformed response for the modal
      setSubmissionResults(transformedResponse);

      // Only show a toast for major failures that might prevent the modal from showing
      if (!response.success && !response.message && !response.error) {
        toast.error("Failed to submit e-Invoice due to an unexpected error");
      }

      // Still refresh the invoice data if successful
      if (response.success) {
        fetchInvoiceDetails(invoice.invoice_id);
      }
    } catch (error) {
      console.error("Error submitting e-Invoice:", error);
      toast.error("Failed to submit e-Invoice");

      // Create a formatted error response for the modal
      setSubmissionResults({
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
        overallStatus: "Error",
        rejectedDocuments: [
          {
            internalId: invoice.invoice_id.toString(),
            error: {
              code: "SYSTEM_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown error occurred",
            },
          },
        ],
      });
    } finally {
      setIsSubmittingEInvoice(false);
    }
  };

  const handleCheckEInvoiceStatus = async () => {
    if (!invoice?.invoice_id) return;

    try {
      setIsCheckingEInvoice(true);
      const toastId = toast.loading("Checking e-Invoice status...");

      // Call API to check status
      const response = await greenTargetApi.checkEInvoiceStatus(
        invoice.invoice_id
      );

      toast.dismiss(toastId);

      // Format the response for the SubmissionResultsModal
      const formattedResponse = {
        success: response.success,
        message: response.message || `e-Invoice status: ${response.status}`,
        overallStatus:
          response.status === "valid"
            ? "Valid"
            : response.status === "pending"
            ? "Pending"
            : "Invalid",
        // Format in a way the modal can understand
        acceptedDocuments:
          response.status === "valid"
            ? [
                {
                  internalId: invoice.invoice_id.toString(),
                  uuid: invoice.uuid,
                  longId: response.longId,
                  status: "Valid",
                  dateTimeValidated: response.dateTimeValidated,
                },
              ]
            : [],
        pendingUpdated:
          response.status === "pending"
            ? [
                {
                  id: invoice.invoice_id.toString(),
                  status: "pending",
                  updated: response.updated,
                },
              ]
            : [],
        rejectedDocuments:
          response.status === "invalid"
            ? [
                {
                  internalId: invoice.invoice_id.toString(),
                  error: {
                    code: "INVALID_EINVOICE",
                    message: "e-Invoice is invalid",
                  },
                },
              ]
            : [],
      };

      setSubmissionResults(formattedResponse);
      setShowSubmissionResultsModal(true);

      // Refresh invoice details if status changed
      if (response.updated) {
        fetchInvoiceDetails(invoice.invoice_id);
      }
    } catch (error) {
      console.error("Error checking e-Invoice status:", error);
      toast.error("Failed to check e-Invoice status");

      // Create error response for modal
      setSubmissionResults({
        success: false,
        message: "Failed to check e-Invoice status",
        overallStatus: "Error",
        rejectedDocuments: [
          {
            internalId: invoice.invoice_id.toString(),
            error: {
              code: "STATUS_CHECK_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            },
          },
        ],
      });
      setShowSubmissionResultsModal(true);
    } finally {
      setIsCheckingEInvoice(false);
    }
  };

  const handleSyncCancellationStatus = async () => {
    if (!invoice?.invoice_id) return;

    try {
      setIsSyncingCancellation(true);
      const toastId = toast.loading("Syncing cancellation status...");

      // Call API to sync cancellation status
      const response = await greenTargetApi.syncEInvoiceCancellation(
        invoice.invoice_id
      );

      toast.dismiss(toastId);

      // Show success message
      if (response.success) {
        toast.success(response.message);

        // Refresh invoice details
        fetchInvoiceDetails(invoice.invoice_id);
      } else {
        toast.error(response.message || "Failed to sync cancellation status");
      }
    } catch (error) {
      console.error("Error syncing cancellation status:", error);
      toast.error("Failed to sync cancellation status");
    } finally {
      setIsSyncingCancellation(false);
    }
  };

  const handleDownloadInvoice = async () => {
    // Made async
    if (!invoice || isGeneratingPDF) return;

    setIsGeneratingPDF(true); // Disable button
    const toastId = toast.loading("Generating PDF...");

    try {
      // Prepare the PDF document structure
      const pdfComponent = (
        <Document title={generateGTPDFFilename([invoice]).replace(".pdf", "")}>
          <GTInvoicePDF invoice={invoice} qrCodeData={qrCodeData} />
        </Document>
      );

      // Generate PDF blob
      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Create and trigger download link
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = generateGTPDFFilename([invoice]); // Generate filename
      document.body.appendChild(link);
      link.click(); // Trigger download
      document.body.removeChild(link); // Clean up link

      // Delay slightly before revoking URL to ensure download starts
      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
        toast.success("PDF downloaded successfully", { id: toastId });
        setIsGeneratingPDF(false); // Re-enable button
      }, 100);
    } catch (error) {
      console.error("Error generating PDF for download:", error);
      toast.error(
        `Failed to generate PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: toastId }
      );
      setIsGeneratingPDF(false); // Re-enable button on error
    }
  };

  const handlePrintInvoice = () => {
    if (!invoice || isGeneratingPDF) return;
    setShowPrintOverlay(true); // Render the print overlay component
    // GTPrintPDFOverlay handles the print process and calls onComplete
  };

  const handleCancelInvoice = async () => {
    if (!invoice) return;

    // Check if invoice has payments
    const activePayments = payments.filter((p) => p.status === "active");
    if (activePayments.length > 0) {
      toast.error(
        "Cannot cancel invoice: it has associated payments. Cancel the payments first."
      );
      setIsCancelInvoiceDialogOpen(false);
      return;
    }

    setIsCancellingInvoice(true);
    try {
      await greenTargetApi.cancelInvoice(invoice.invoice_id);
      toast.success("Invoice cancelled successfully");

      // Refresh invoice details to show updated status
      fetchInvoiceDetails(parseInt(id as string));
    } catch (error: any) {
      console.error("Error cancelling invoice:", error);
      toast.error(error.message || "Failed to cancel invoice");
    } finally {
      setIsCancellingInvoice(false);
      setIsCancelInvoiceDialogOpen(false);
    }
  };

  const getGTStatusBadgeStyle = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "paid": // Assuming you derive 'paid' from balance
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-default-200 text-default-800";
      case "overdue":
        return "bg-red-100 text-red-800"; // Example: Red style
      case "active":
      default: // Treat active/default as Unpaid visually if balance > 0
        return invoice && invoice.current_balance > 0
          ? "bg-amber-100 text-amber-800" // Unpaid style
          : "bg-gray-100 text-gray-800"; // Default/Unknown style
    }
  };

  const isInvoiceDateEligibleForEinvoice = (
    dateIssuedString: string | undefined | null
  ): boolean => {
    if (!dateIssuedString) return false;

    try {
      // Parse the ISO date string to a Date object
      const dateIssued = new Date(dateIssuedString);
      if (isNaN(dateIssued.getTime())) return false; // Invalid date

      const now = new Date();
      const threeDaysInMillis = 3 * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(now.getTime() - threeDaysInMillis);

      return dateIssued >= cutoffDate;
    } catch {
      return false;
    }
  };

  // Format currency
  const formatCurrency = (amount: number | string) => {
    // Allow string input
    const numericAmount =
      typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) {
      return "N/A"; // Or some other placeholder for invalid numbers
    }
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(numericAmount);
  };

  // Format date
  const formatDate = (dateString: string | null | undefined) => {
    // Allow null/undefined
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      // Check if date is valid after parsing
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      return date.toLocaleDateString("en-GB"); // Use 'en-GB' for DD/MM/YYYY or adjust as needed
    } catch (e) {
      console.error("Error formatting date:", dateString, e);
      return "Invalid Date";
    }
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

  // Find the selected payment method option for display
  const selectedPaymentMethod = paymentMethodOptions.find(
    (option) => option.id === paymentFormData.payment_method
  );
  const paymentMethodDisplayValue = selectedPaymentMethod
    ? selectedPaymentMethod.name
    : "Select Payment Method";

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
            Invoice
            <span
              className="pl-1.5 truncate max-w-[150px] md:max-w-[300px] inline-block"
              title={invoice.invoice_number}
            >
              {invoice.invoice_number}
            </span>
            {invoice.einvoice_status === "valid" && (
              <button
                className="ml-3 px-3 py-1.5 text-xs font-medium bg-green-100 border border-green-300 text-green-600 rounded-full cursor-default gap-1 flex items-center max-w-[180px]"
                title="e-Invoice Valid"
              >
                <IconCheck size={18} stroke={1.5} />
                <span className="truncate">e-Invoice Valid</span>
              </button>
            )}
            {invoice.einvoice_status === "pending" && (
              <button
                className="ml-3 px-3 py-1.5 text-xs font-medium bg-sky-100 border border-sky-300 text-sky-600 rounded-full cursor-default gap-1 flex items-center max-w-[180px]"
                title="e-Invoice Pending"
              >
                <IconClock size={18} stroke={1.5} />
                <span className="truncate">e-Invoice Pending</span>
              </button>
            )}
            {invoice.einvoice_status === "invalid" && (
              <button
                className="ml-3 px-3 py-1.5 text-xs font-medium bg-rose-100 border border-rose-300 text-rose-600 rounded-full cursor-default gap-1 flex items-center max-w-[180px]"
                title="e-Invoice Invalid"
              >
                <IconAlertTriangle size={18} stroke={1.5} />
                <span className="truncate">e-Invoice Invalid</span>
              </button>
            )}
          </h1>
        </div>

        <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-3 mt-4 md:mt-0 w-full md:w-auto md:self-end">
          {/* Group buttons by function using responsive flex containers */}
          <div className="flex flex-wrap gap-3 md:flex-nowrap">
            {/* e-Invoice buttons */}
            {invoice.tin_number &&
              invoice.id_number &&
              isInvoiceDateEligibleForEinvoice(invoice.date_issued) && (
                <>
                  {!invoice.einvoice_status ||
                  invoice.einvoice_status === "invalid" ? (
                    <Button
                      onClick={handleSubmitEInvoice}
                      icon={IconFileInvoice}
                      variant="outline"
                      color="amber"
                      disabled={
                        isSubmittingEInvoice || invoice.status === "cancelled"
                      }
                      className="w-full sm:w-auto"
                    >
                      {isSubmittingEInvoice
                        ? "Submitting..."
                        : "Submit e-Invoice"}
                    </Button>
                  ) : invoice.einvoice_status === "pending" ? (
                    <Button
                      onClick={handleCheckEInvoiceStatus}
                      icon={IconClock}
                      variant="outline"
                      color="sky"
                      disabled={isCheckingEInvoice}
                      className="w-full sm:w-auto"
                    >
                      {isCheckingEInvoice ? "Checking..." : "Check Status"}
                    </Button>
                  ) : null}
                </>
              )}
            {invoice.status === "cancelled" &&
              invoice.einvoice_status &&
              invoice.einvoice_status !== "cancelled" &&
              invoice.uuid && (
                <Button
                  onClick={handleSyncCancellationStatus}
                  icon={IconRefresh}
                  variant="outline"
                  color="rose"
                  disabled={isSyncingCancellation}
                  className="w-full sm:w-auto"
                >
                  {isSyncingCancellation ? "Syncing..." : "Sync Cancellation"}
                </Button>
              )}
          </div>

          {/* PDF action buttons */}
          <div className="flex flex-wrap gap-3 md:flex-nowrap">
            <Button
              onClick={handlePrintInvoice}
              icon={IconPrinter}
              variant="outline"
              disabled={loading}
              title="Print PDF"
              className="flex-1 sm:flex-none"
            >
              Print
            </Button>
            <Button
              onClick={handleDownloadInvoice}
              icon={IconFileDownload}
              variant="outline"
              disabled={isGeneratingPDF || loading}
              title="Download PDF"
              className="flex-1 sm:flex-none"
            >
              {isGeneratingPDF ? "Generating..." : "Download"}
            </Button>
          </div>

          {/* Invoice action buttons */}
          <div className="flex flex-wrap gap-3 md:flex-nowrap">
            {invoice.current_balance > 0 && (
              <Button
                onClick={() => setShowPaymentForm(!showPaymentForm)}
                icon={IconCash}
                variant="outline"
                color="sky"
                disabled={invoice.status === "cancelled"}
                className="flex-1 sm:flex-none"
              >
                {showPaymentForm ? "Cancel" : "Record Payment"}
              </Button>
            )}
            <Button
              onClick={() => setIsCancelInvoiceDialogOpen(true)}
              icon={IconTrash}
              variant="outline"
              color="rose"
              disabled={invoice.status === "cancelled"}
              className="flex-1 sm:flex-none"
            >
              {invoice.status === "cancelled" ? "Cancelled" : "Cancel Invoice"}
            </Button>
          </div>
        </div>
      </div>

      {/* Payment form */}
      {showPaymentForm && (
        <div className="bg-default-50 p-6 rounded-lg mb-6 border border-default-200">
          <h2 className="text-lg font-medium mb-4">Record Payment</h2>
          <form onSubmit={handleSubmitPayment}>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {/* Payment Date Input */}
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
                  required // Added required
                  className={clsx(
                    // Use clsx for consistency
                    "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                  )}
                />
              </div>

              {/* Amount Paid Input */}
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
                    required // Added required
                    className={clsx(
                      // Use clsx for consistency
                      "block w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                    )}
                  />
                </div>
              </div>

              {/* Payment Method Listbox (Styled like FormListbox) */}
              <div className="space-y-2">
                <label
                  htmlFor="payment_method-button" // Target the button ID
                  className="block text-sm font-medium text-default-700"
                >
                  Payment Method
                </label>
                <Listbox
                  value={paymentFormData.payment_method}
                  onChange={handlePaymentMethodChange} // Use dedicated handler
                  name="payment_method"
                >
                  <div className="relative">
                    <HeadlessListboxButton
                      id="payment_method-button"
                      className={clsx(
                        "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                      )}
                    >
                      <span className="block truncate">
                        {paymentMethodDisplayValue}
                      </span>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <IconChevronDown
                          size={20}
                          className="text-gray-400"
                          aria-hidden="true"
                        />
                      </span>
                    </HeadlessListboxButton>
                    <Transition
                      as={Fragment}
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100"
                      leaveTo="opacity-0"
                    >
                      <ListboxOptions
                        className={clsx(
                          "absolute z-10 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                          "mt-1" // Default position bottom
                        )}
                      >
                        {paymentMethodOptions.map((option) => (
                          <ListboxOption
                            key={option.id}
                            className={({ active }) =>
                              clsx(
                                "relative cursor-default select-none py-2 pl-3 pr-10",
                                active
                                  ? "bg-sky-100 text-sky-900"
                                  : "text-gray-900"
                              )
                            }
                            value={option.id.toString()} // Ensure value is string
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={clsx(
                                    "block truncate",
                                    selected ? "font-medium" : "font-normal"
                                  )}
                                >
                                  {option.name}
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                    <IconCheck size={20} aria-hidden="true" />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </ListboxOption>
                        ))}
                      </ListboxOptions>
                    </Transition>
                  </div>
                </Listbox>
              </div>

              {/* Conditional Reference Input */}
              {(paymentFormData.payment_method === "cheque" ||
                paymentFormData.payment_method === "bank_transfer") && (
                <div className="space-y-2">
                  <label
                    htmlFor="payment_reference"
                    className="block text-sm font-medium text-default-700"
                  >
                    {paymentFormData.payment_method === "cheque"
                      ? "Cheque Number"
                      : "Transaction Reference"}
                  </label>
                  <input
                    type="text"
                    id="payment_reference"
                    name="payment_reference"
                    value={paymentFormData.payment_reference}
                    onChange={handlePaymentFormChange}
                    className={clsx(
                      // Use clsx for consistency
                      "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                    )}
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
            invoice.status === "cancelled"
              ? "bg-default-50 border-b border-default-200"
              : invoice.status === "overdue"
              ? "bg-red-50 border-b border-red-200"
              : invoice.current_balance > 0
              ? "bg-amber-50 border-b border-amber-200"
              : "bg-green-50 border-b border-green-200"
          }`}
        >
          <div className="flex justify-between items-center">
            <div>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getGTStatusBadgeStyle(
                  invoice?.status
                )}`}
              >
                {invoice?.status === "cancelled"
                  ? "Cancelled"
                  : invoice?.status === "overdue"
                  ? "Overdue"
                  : invoice?.current_balance <= 0
                  ? "Paid"
                  : "Unpaid"}
              </span>
              {invoice.status === "cancelled" && invoice.cancellation_date && (
                <span className="ml-2 text-xs text-default-500">
                  Cancelled on {formatDate(invoice.cancellation_date)}
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-default-600">
                {invoice.status === "cancelled"
                  ? "Cancelled Amount:"
                  : "Balance Due:"}
              </p>
              <p
                className={`text-lg font-bold ${
                  invoice.status === "cancelled"
                    ? "text-default-600"
                    : invoice.status === "overdue"
                    ? "text-red-600"
                    : invoice.current_balance > 0
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
                      {formatDate(invoice.statement_period_start || "")} to
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
                      invoice.status === "overdue"
                        ? "text-red-600"
                        : invoice.current_balance > 0
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
              className="rounded-lg border border-default-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow" // Added hover effect
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
                    <tr
                      key={payment.payment_id}
                      className={`hover:bg-default-50 transition-colors ${
                        payment.status === "cancelled"
                          ? "bg-default-50 text-default-400"
                          : ""
                      }`}
                      title={
                        payment.status === "cancelled"
                          ? `Payment cancelled on ${
                              payment.cancellation_date
                                ? formatDate(payment.cancellation_date)
                                : "unknown date"
                            }`
                          : "Paid"
                      }
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                          payment.status === "cancelled"
                            ? "text-default-400 line-through"
                            : "text-green-600"
                        }`}
                      >
                        {formatCurrency(
                          parseFloat(payment.amount_paid.toString())
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-indigo-50 text-default-700 capitalize">
                          {payment.payment_method.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-600 font-mono">
                        {payment.payment_reference || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-600">
                        {payment.internal_reference || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Button
                          variant="outline"
                          color="rose"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelPaymentClick(payment);
                          }}
                          disabled={payment.status === "cancelled"}
                          title={
                            payment.status === "cancelled"
                              ? `Payment cancelled on ${
                                  payment.cancellation_date
                                    ? formatDate(payment.cancellation_date)
                                    : "unknown date"
                                }`
                              : "Cancel Payment"
                          }
                          className="px-2"
                        >
                          {payment.status === "cancelled" ? (
                            <span className="italic cursor-not-allowed">
                              Cancelled
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <IconTrash size={16} /> Cancel
                            </span>
                          )}
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

      {/* e-Invoice Details Section */}
      {invoice.einvoice_status && (
        <div className="mt-8">
          <div className="bg-white rounded-lg border border-default-200 overflow-hidden">
            <div
              className={`p-4 ${
                invoice.einvoice_status === "valid"
                  ? "bg-green-50 border-b border-green-200"
                  : invoice.einvoice_status === "pending"
                  ? "bg-sky-50 border-b border-sky-200"
                  : invoice.einvoice_status === "invalid"
                  ? "bg-rose-50 border-b border-rose-200"
                  : invoice.einvoice_status === "cancelled"
                  ? "bg-default-50 border-b border-default-200"
                  : "bg-default-50 border-b border-default-200"
              }`}
            >
              <div className="flex items-center">
                {invoice.einvoice_status === "valid" ? (
                  <IconCheck size={22} className="text-green-600 mr-3" />
                ) : invoice.einvoice_status === "pending" ? (
                  <IconClock size={22} className="text-sky-600 mr-3" />
                ) : invoice.einvoice_status === "invalid" ? (
                  <IconAlertTriangle size={22} className="text-rose-600 mr-3" />
                ) : invoice.einvoice_status === "cancelled" ? (
                  <IconCancel size={22} className="text-default-600 mr-3" />
                ) : null}
                <div>
                  <h3 className="text-lg font-medium">
                    {invoice.einvoice_status === "valid"
                      ? "Valid e-Invoice"
                      : invoice.einvoice_status === "pending"
                      ? "Pending Validation"
                      : invoice.einvoice_status === "invalid"
                      ? "Invalid e-Invoice"
                      : invoice.einvoice_status === "cancelled"
                      ? "Cancelled e-Invoice"
                      : "e-Invoice Status"}
                  </h3>
                  {invoice.einvoice_status === "pending" && (
                    <p className="text-sm text-sky-600 mt-1">
                      This e-invoice has been submitted but is still pending
                      validation.
                    </p>
                  )}
                  {invoice.einvoice_status === "invalid" && (
                    <p className="text-sm text-rose-600 mt-1">
                      This e-invoice has been rejected or marked as invalid.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {invoice.uuid && (
                  <div className="p-3 bg-default-50 rounded-lg border border-default-200">
                    <label className="block text-xs text-default-500 mb-1">
                      UUID
                    </label>
                    <div
                      className="font-mono text-sm truncate"
                      title={invoice.uuid}
                    >
                      {invoice.uuid}
                    </div>
                  </div>
                )}
                {invoice.submission_uid && (
                  <div className="p-3 bg-default-50 rounded-lg border border-default-200">
                    <label className="block text-xs text-default-500 mb-1">
                      Submission UID
                    </label>
                    <div
                      className="font-mono text-sm truncate"
                      title={invoice.submission_uid}
                    >
                      {invoice.submission_uid}
                    </div>
                  </div>
                )}
                {invoice.long_id && (
                  <div className="p-3 bg-default-50 rounded-lg border border-default-200">
                    <label className="block text-xs text-default-500 mb-1">
                      Long ID
                    </label>
                    <div
                      className="font-mono text-sm truncate"
                      title={invoice.long_id}
                    >
                      {invoice.long_id}
                    </div>
                  </div>
                )}
                {invoice.datetime_validated && (
                  <div className="p-3 bg-default-50 rounded-lg border border-default-200">
                    <label className="block text-xs text-default-500 mb-1">
                      Validation Date
                    </label>
                    <div className="text-sm">
                      {new Date(invoice.datetime_validated).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Add MyInvois portal link if valid */}
              {(invoice.einvoice_status === "valid" ||
                invoice.einvoice_status === "cancelled") &&
                invoice.long_id && (
                  <div className="mt-4 text-center">
                    <a
                      href={`https://myinvois.hasil.gov.my/${invoice.uuid}/share/${invoice.long_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-sky-600 hover:text-sky-800 hover:underline"
                    >
                      View in MyInvois Portal
                    </a>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
      <SubmissionResultsModal
        isOpen={showSubmissionResultsModal}
        onClose={() => setShowSubmissionResultsModal(false)}
        results={
          submissionResults
            ? {
                ...submissionResults,
                message: submissionResults.message || "", // Ensure message is always a string
                overallStatus: submissionResults.overallStatus || "Unknown", // Ensure overallStatus is always a string
              }
            : null
        }
        isLoading={isSubmittingEInvoice && !submissionResults}
      />
      <ConfirmationDialog
        isOpen={isCancelPaymentDialogOpen}
        onClose={() => setIsCancelPaymentDialogOpen(false)}
        onConfirm={handleCancelPayment}
        title="Cancel Payment"
        message={`Are you sure you want to cancel this payment of ${
          paymentToCancel
            ? formatCurrency(parseFloat(paymentToCancel.amount_paid.toString()))
            : ""
        }? This will increase the invoice balance.`}
        confirmButtonText={
          isCancellingPayment ? "Cancelling..." : "Cancel Payment"
        }
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={isCancelInvoiceDialogOpen}
        onClose={() => setIsCancelInvoiceDialogOpen(false)}
        onConfirm={handleCancelInvoice}
        title="Cancel Invoice"
        message={`Are you sure you want to cancel invoice ${
          invoice?.invoice_number
        }? This action cannot be undone.${
          payments.length > 0
            ? " Note: You must cancel all payments first."
            : ""
        }`}
        confirmButtonText={
          isCancellingInvoice ? "Cancelling..." : "Cancel Invoice"
        }
        variant="danger"
      />
      {/* e-Invoice Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showEInvoiceConfirmDialog}
        onClose={() => setShowEInvoiceConfirmDialog(false)}
        onConfirm={handleConfirmEInvoiceSubmission}
        title="Submit e-Invoice"
        message={`Are you sure you want to submit Invoice ${invoice?.invoice_number} as an e-Invoice to MyInvois?`}
        confirmButtonText="Submit"
        variant="default"
      />
      {/* PDF Handlers (Rendered conditionally) */}
      {showPrintOverlay && invoice && (
        <GTPrintPDFOverlay
          invoices={[invoice]} // Pass the single detailed invoice in an array
          onComplete={() => {
            setShowPrintOverlay(false);
          }}
        />
      )}
    </div>
  );
};

export default InvoiceDetailsPage;

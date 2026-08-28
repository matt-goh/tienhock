// src/pages/GreenTarget/Invoices/InvoiceDetailsPage.tsx
import React, { useState, useEffect, Fragment, useCallback, useRef } from "react"; // Added Fragment, useCallback
import { format } from "date-fns";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  IconFiles,
  IconCircleCheck,
  IconPencil,
  IconX,
  IconDeviceFloppy,
  IconSquare,
  IconSquareCheckFilled,
  IconFilePlus,
  IconFileMinus,
  IconExternalLink,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import { greenTargetApi } from "../../../routes/greentarget/api";
import { api } from "../../../routes/utils/api";
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
import TimeNavigator, {
  type TimeRange,
} from "../../../components/TimeNavigator";
import {
  EInvoiceSubmissionResult,
  InvoiceGT,
  GTAdjDocSummary,
} from "../../../types/types";
import GTPrintPDFOverlay from "../../../utils/greenTarget/PDF/GTPrintPDFOverlay";
import GTInvoicePDF from "../../../utils/greenTarget/PDF/GTInvoicePDF"; // For PDF structure
import { generateGTPDFFilename } from "../../../utils/greenTarget/PDF/generateGTPDFFilename";
import { pdf, Document } from "@react-pdf/renderer";
import { generateQRDataUrl } from "../../../utils/invoice/einvoice/generateQRCode";
import GTInvoiceAdjustmentDocsSection from "../../../components/AdjustmentDocs/GTInvoiceAdjustmentDocsSection";
import GTReceiptJoinPanel, {
  type GTReceiptJoinConfirmation,
  type GTReceiptJoinLookupState,
  useGTReceiptJoinConfirmation,
  useGTReceiptJoinLookup,
} from "../../../components/GreenTarget/GTReceiptJoinPanel";
import { formatLocationDisplay } from "../../../utils/greenTarget/formatLocationDisplay";
import GreenTargetReceiptDetailsDialog from "../../../components/GreenTarget/GreenTargetReceiptDetailsDialog";
import type {
  CreateGreenTargetPaymentInput,
  GreenTargetPayment,
} from "../../../types/greenTargetTypes";

interface Payment {
  payment_id: number;
  invoice_id: number;
  receipt_id?: number | null;
  payment_date: string;
  amount_paid: number;
  payment_method: string;
  payment_reference?: string;
  internal_reference?: string;
  status?: "active" | "cancelled" | "pending";
  cancellation_date?: string;
  cancellation_reason?: string;
}

interface PaymentFormData {
  amount_paid: number;
  payment_date: string;
  payment_method: GreenTargetPayment["payment_method"];
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

const MONEY_TOLERANCE: number = 0.005;

const toLocalDateString = (value: string): string => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
};

// A receipt's stored date is a timestamp, so it must go through date-fns
// rather than an ISO substring, which would land on the previous day in KL.
const toLocalDateInputValue = (value: string | null): string => {
  if (!value) return "";
  const parsed: Date = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd");
};

const getPaymentDateRange = (value: string): TimeRange => {
  const match: RegExpMatchArray | null = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );
  const start: Date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date();
  start.setHours(0, 0, 0, 0);

  const end: Date = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

type GTDisplayStatus =
  | "cancelled"
  | "paid"
  | "refunded"
  | "partially_refunded"
  | "credited"
  | "credit_balance"
  | "overdue"
  | "unpaid";

function getGTDisplayStatusLabel(status: GTDisplayStatus): string {
  if (status === "partially_refunded") return "Partially Refunded";
  if (status === "credit_balance") return "Credit Balance";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getActiveGTAdjustmentDocs(invoice: InvoiceGT): GTAdjDocSummary[] {
  return (invoice.adjustmentDocs || []).filter(
    (doc: GTAdjDocSummary) => doc.status === "active" && !doc.is_consolidated
  );
}

function getGTPairedRefundTotal(invoice: InvoiceGT): number {
  return getActiveGTAdjustmentDocs(invoice)
    .filter(
      (doc: GTAdjDocSummary) =>
        doc.type === "refund_note" &&
        !!doc.paired_with_id &&
        doc.paired_status === "active"
    )
    .reduce((sum: number, doc: GTAdjDocSummary) => sum + doc.total_amount, 0);
}

function getGTDisplayStatus(invoice: InvoiceGT): GTDisplayStatus {
  if (invoice.status === "cancelled") return "cancelled";

  const docs: GTAdjDocSummary[] = getActiveGTAdjustmentDocs(invoice);
  const pairedRefundTotal: number = getGTPairedRefundTotal(invoice);
  const invoiceTotal: number = Number(invoice.total_amount || 0);
  const balanceDue: number = Number(invoice.balance_due || 0);
  const hasActiveUnrefundedCN: boolean = docs.some(
    (doc: GTAdjDocSummary) =>
      doc.type === "credit_note" && doc.paired_status !== "active"
  );
  const hasActivePairedRN: boolean = pairedRefundTotal > MONEY_TOLERANCE;

  if (hasActivePairedRN && balanceDue <= MONEY_TOLERANCE) {
    return pairedRefundTotal >= invoiceTotal - MONEY_TOLERANCE
      ? "refunded"
      : "partially_refunded";
  }

  if (hasActiveUnrefundedCN) {
    return balanceDue < -MONEY_TOLERANCE ? "credit_balance" : "credited";
  }

  if (balanceDue <= MONEY_TOLERANCE) return "paid";
  if (invoice.status === "overdue") return "overdue";
  return "unpaid";
}

function getGTBalanceAdjustment(invoice: InvoiceGT): {
  originalBalanceDue: number;
  hasAdjustment: boolean;
} {
  const docs: GTAdjDocSummary[] = getActiveGTAdjustmentDocs(invoice);
  const debitTotal: number = docs
    .filter((doc: GTAdjDocSummary) => doc.type === "debit_note")
    .reduce((sum: number, doc: GTAdjDocSummary) => sum + doc.total_amount, 0);
  const creditTotal: number = docs
    .filter((doc: GTAdjDocSummary) => doc.type === "credit_note")
    .reduce((sum: number, doc: GTAdjDocSummary) => sum + doc.total_amount, 0);
  const pairedRefundTotal: number = getGTPairedRefundTotal(invoice);
  const adjustedBalanceDue: number = Number(invoice.balance_due || 0);

  return {
    originalBalanceDue: parseFloat(
      (
        adjustedBalanceDue -
        debitTotal +
        creditTotal -
        pairedRefundTotal
      ).toFixed(2)
    ),
    hasAdjustment:
      debitTotal > 0 ||
      creditTotal > 0 ||
      pairedRefundTotal > 0,
  };
}

function getGTTotalAdjustment(invoice: InvoiceGT): {
  adjustedTotal: number;
  hasAdjustment: boolean;
} {
  const docs: GTAdjDocSummary[] = getActiveGTAdjustmentDocs(invoice);
  const debitTotal: number = docs
    .filter((doc: GTAdjDocSummary) => doc.type === "debit_note")
    .reduce((sum: number, doc: GTAdjDocSummary) => sum + doc.total_amount, 0);
  const creditTotal: number = docs
    .filter((doc: GTAdjDocSummary) => doc.type === "credit_note")
    .reduce((sum: number, doc: GTAdjDocSummary) => sum + doc.total_amount, 0);
  const invoiceTotal: number = Number(invoice.total_amount || 0);
  const adjustedTotal: number = parseFloat(
    (invoiceTotal + debitTotal - creditTotal).toFixed(2)
  );

  return {
    adjustedTotal,
    hasAdjustment:
      (debitTotal > 0 || creditTotal > 0) &&
      Math.abs(adjustedTotal - invoiceTotal) > MONEY_TOLERANCE,
  };
}

const InvoiceDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation("greentarget");
  const [invoice, setInvoice] = useState<InvoiceGT | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const state = (location.state as { showPaymentForm?: boolean }) || {};
  // Payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState<PaymentFormData>({
    amount_paid: 0,
    payment_date: format(new Date(), "yyyy-MM-dd"),
    payment_method: "cash", // Default value
    payment_reference: "",
    internal_reference: "",
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  // Advance payment: received date earlier than the invoice date needs an
  // explicit confirmation; the ref carries the confirmation into the retry.
  const [advancePaymentPrompt, setAdvancePaymentPrompt] = useState<{
    paymentDate: string;
    invoiceDate: string;
  } | null>(null);
  const advancePaymentConfirmedRef = useRef(false);
  // Re-using a Green Target reference here means this invoice is being settled
  // by a receipt that already exists, so the same offer-to-join flow as the
  // invoice form applies. The invoice id also answers the "that receipt
  // already pays this invoice" rule.
  const paymentReceiptLookup: GTReceiptJoinLookupState = useGTReceiptJoinLookup(
    paymentFormData.internal_reference,
    showPaymentForm,
    invoice?.invoice_id
  );
  const paymentReceiptJoin: GTReceiptJoinConfirmation =
    useGTReceiptJoinConfirmation(paymentReceiptLookup);
  const joinedPaymentReceipt = paymentReceiptJoin.confirmedReceipt;
  const [isCancelPaymentDialogOpen, setIsCancelPaymentDialogOpen] =
    useState(false);
  const [paymentToCancel, setPaymentToCancel] = useState<Payment | null>(null);
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [showConfirmPaymentDialog, setShowConfirmPaymentDialog] =
    useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState<Payment | null>(
    null
  );
  const [paymentClearanceDate, setPaymentClearanceDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isCancelInvoiceDialogOpen, setIsCancelInvoiceDialogOpen] =
    useState(false);
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false);
  const [isDeleteInvoiceDialogOpen, setIsDeleteInvoiceDialogOpen] =
    useState(false);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
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
  const [consolidatedInfo, setConsolidatedInfo] = useState<any>(null);

  // Rental management state
  const [isEditingRentals, setIsEditingRentals] = useState(false);
  const [availableRentals, setAvailableRentals] = useState<any[]>([]);
  const [selectedRentals, setSelectedRentals] = useState<any[]>([]);
  const [isLoadingRentals, setIsLoadingRentals] = useState(false);
  const [isSavingRentals, setIsSavingRentals] = useState(false);

  // --- NEW State for inline editing ---
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editedRefValue, setEditedRefValue] = useState("");
  const [refValidation, setRefValidation] = useState({
    isValidating: false,
    isDuplicate: false,
    message: "",
  });
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  // Invoice details editing states
  const [isEditingInvoiceNumber, setIsEditingInvoiceNumber] = useState(false);
  const [editedInvoiceNumber, setEditedInvoiceNumber] = useState("");
  const [invoiceNumberValidation, setInvoiceNumberValidation] = useState({
    isValidating: false,
    isValid: true,
    isDuplicate: false,
    message: "",
  });
  const [isUpdatingInvoiceNumber, setIsUpdatingInvoiceNumber] = useState(false);

  const [isEditingDateIssued, setIsEditingDateIssued] = useState(false);
  const [editedDateIssued, setEditedDateIssued] = useState("");
  const [isUpdatingDateIssued, setIsUpdatingDateIssued] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);

  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [editedAmount, setEditedAmount] = useState("");
  const [isUpdatingAmount, setIsUpdatingAmount] = useState(false);

  // E-invoice cancellation confirmation states
  const [showEInvoiceCancelConfirm, setShowEInvoiceCancelConfirm] =
    useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    type: "invoice_number" | "date_issued" | "customer" | "amount";
    value: any;
    requiresEInvoiceCancel: boolean;
  } | null>(null);

  // Customer change warning states
  const [showCustomerChangeWarning, setShowCustomerChangeWarning] =
    useState(false);
  const [pendingCustomerChange, setPendingCustomerChange] = useState<{
    id: number;
    name: string;
  } | null>(null);

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

  // Debounced validation for internal reference
  const validateInternalRef = useCallback(
    async (ref: string, paymentId: number) => {
      const normalizedReference = ref.trim();
      if (!normalizedReference) {
        setRefValidation({
          isValidating: false,
          isDuplicate: true,
          message: t("Green Target reference number is required."),
        });
        return;
      }
      setRefValidation((prev) => ({ ...prev, isValidating: true }));
      try {
        const result = await greenTargetApi.checkInternalPaymentRef(
          normalizedReference,
          paymentId
        );
        setRefValidation({
          isValidating: false,
          isDuplicate: result.exists,
          message: result.exists
            ? t("This Green Target reference is already in use.")
            : "",
        });
      } catch (error) {
        setRefValidation({
          isValidating: false,
          isDuplicate: true, // Assume invalid on error
          message: t("Could not validate the Green Target reference."),
        });
      }
    },
    []
  );

  useEffect(() => {
    if (editingPaymentId !== null) {
      const handler = setTimeout(() => {
        const originalPayment = payments.find(
          (p) => p.payment_id === editingPaymentId
        );
        const normalizedReference = editedRefValue.trim();
        // Only validate if the value has changed
        if (
          originalPayment &&
          (originalPayment.internal_reference || "").trim() !==
            normalizedReference
        ) {
          validateInternalRef(normalizedReference, editingPaymentId);
        } else if (!normalizedReference) {
          setRefValidation({
            isValidating: false,
            isDuplicate: true,
            message: t("Green Target reference number is required."),
          });
        } else {
          // If value is same as original, it's not a duplicate of itself
          setRefValidation({
            isValidating: false,
            isDuplicate: false,
            message: "",
          });
        }
      }, 500);

      return () => {
        clearTimeout(handler);
      };
    }
  }, [editedRefValue, editingPaymentId, payments, validateInternalRef]);

  // Debounced invoice number validation
  const validateInvoiceNumber = useCallback(
    async (invoiceNumber: string) => {
      if (!invoiceNumber || !invoiceNumber.trim()) {
        setInvoiceNumberValidation({
          isValidating: false,
          isValid: true,
          isDuplicate: false,
          message: "",
        });
        return;
      }

      setInvoiceNumberValidation((prev) => ({
        ...prev,
        isValidating: true,
      }));

      try {
        const result = await greenTargetApi.checkInvoiceNumber(
          invoiceNumber,
          invoice?.invoice_id
        );

        setInvoiceNumberValidation({
          isValidating: false,
          isValid: !result.exists,
          isDuplicate: result.exists,
          message: result.exists
            ? t("This invoice number is already in use.")
            : "",
        });
      } catch (error) {
        console.error("Error validating invoice number:", error);
        setInvoiceNumberValidation({
          isValidating: false,
          isValid: false,
          isDuplicate: false,
          message: t("Error validating invoice number"),
        });
      }
    },
    [invoice?.invoice_id]
  );

  // Debounce invoice number validation
  useEffect(() => {
    if (isEditingInvoiceNumber && editedInvoiceNumber) {
      const timer = setTimeout(() => {
        if (editedInvoiceNumber !== invoice?.invoice_number) {
          validateInvoiceNumber(editedInvoiceNumber);
        } else {
          // If value is same as original, reset validation
          setInvoiceNumberValidation({
            isValidating: false,
            isValid: true,
            isDuplicate: false,
            message: "",
          });
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [
    editedInvoiceNumber,
    isEditingInvoiceNumber,
    invoice?.invoice_number,
    validateInvoiceNumber,
  ]);

  const handleEditInternalRef = (payment: Payment): void => {
    setEditingPaymentId(payment.payment_id);
    setEditedRefValue(payment.internal_reference || "");
    setRefValidation({ isValidating: false, isDuplicate: false, message: "" });
  };

  const handleCancelEdit = (): void => {
    setEditingPaymentId(null);
    setEditedRefValue("");
    setRefValidation({ isValidating: false, isDuplicate: false, message: "" });
  };

  const handleSaveInternalRef = async (paymentId: number): Promise<void> => {
    const normalizedReference = editedRefValue.trim();
    if (!normalizedReference) {
      toast.error(t("Green Target reference number is required."));
      return;
    }
    if (normalizedReference.length > 50) {
      toast.error(
        t("Green Target reference number cannot exceed 50 characters.")
      );
      return;
    }
    if (refValidation.isDuplicate) {
      toast.error(
        t("This Green Target reference number is already in use.")
      );
      return;
    }

    setIsUpdatingPayment(true);
    try {
      const originalPayment: Payment | undefined = payments.find(
        (payment: Payment): boolean => payment.payment_id === paymentId
      );
      const expectedReference: string = String(
        originalPayment?.internal_reference || ""
      ).trim();
      await greenTargetApi.updatePayment(paymentId, {
        internal_reference: normalizedReference,
        ...(expectedReference
          ? { expected_internal_reference: expectedReference }
          : {}),
      });
      toast.success(t("Green Target reference updated for the full receipt."));
      handleCancelEdit(); // Exit edit mode
      if (id) await fetchInvoiceDetails(parseInt(id)); // Refresh data
    } catch (error: any) {
      console.error("Failed to update payment:", error);
      const errorMessage =
        error?.data?.message ||
        error?.response?.data?.message ||
        error?.message ||
        t("Failed to update reference.");
      toast.error(errorMessage);
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  // Invoice details editing handlers
  const handleEditInvoiceNumber = () => {
    setIsEditingInvoiceNumber(true);
    setEditedInvoiceNumber(invoice?.invoice_number || "");
    setInvoiceNumberValidation({
      isValidating: false,
      isValid: true,
      isDuplicate: false,
      message: "",
    });
  };

  const handleCancelInvoiceNumberEdit = () => {
    setIsEditingInvoiceNumber(false);
    setEditedInvoiceNumber("");
    setInvoiceNumberValidation({
      isValidating: false,
      isValid: true,
      isDuplicate: false,
      message: "",
    });
  };

  const handleSaveInvoiceNumber = async () => {
    if (
      invoiceNumberValidation.isDuplicate ||
      !invoiceNumberValidation.isValid
    ) {
      toast.error(t("Please fix validation errors before saving."));
      return;
    }

    if (editedInvoiceNumber === invoice?.invoice_number) {
      handleCancelInvoiceNumberEdit();
      return;
    }

    // Check if e-invoice cancellation is required
    const requiresEInvoiceCancel = invoice?.einvoice_status === "valid";

    if (requiresEInvoiceCancel) {
      setPendingUpdate({
        type: "invoice_number",
        value: editedInvoiceNumber,
        requiresEInvoiceCancel: true,
      });
      setShowEInvoiceCancelConfirm(true);
      return;
    }

    // Proceed with update
    await updateInvoiceNumber(editedInvoiceNumber);
  };

  const updateInvoiceNumber = async (newInvoiceNumber: string) => {
    setIsUpdatingInvoiceNumber(true);
    try {
      const updateData: any = {
        invoice_number: newInvoiceNumber,
        type: invoice?.type,
        customer_id: invoice?.customer_id,
        amount_before_tax: invoice?.amount_before_tax || invoice?.total_amount,
        date_issued: invoice?.date_issued,
      };

      // Include rental_ids for regular invoices
      if (invoice?.type === "regular" && invoice?.rental_details) {
        updateData.rental_ids = invoice.rental_details.map(
          (rental: any) => rental.rental_id
        );
      }

      await greenTargetApi.updateInvoice(invoice?.invoice_id!, updateData);
      toast.success(t("Invoice number updated successfully."));
      handleCancelInvoiceNumberEdit();
      if (id) fetchInvoiceDetails(parseInt(id));
    } catch (error: any) {
      console.error("Failed to update invoice number:", error);
      const errorMessage =
        error?.response?.data?.message || t("Failed to update invoice number.");
      toast.error(errorMessage);
    } finally {
      setIsUpdatingInvoiceNumber(false);
    }
  };

  const handleEditDateIssued = () => {
    setIsEditingDateIssued(true);
    // Convert the date to YYYY-MM-DD format for input
    const dateOnly = invoice?.date_issued
      ? toLocalDateString(invoice.date_issued)
      : "";
    setEditedDateIssued(dateOnly);
  };

  const handleCancelDateIssuedEdit = () => {
    setIsEditingDateIssued(false);
    setEditedDateIssued("");
  };

  const handleSaveDateIssued = async () => {
    if (
      editedDateIssued ===
      (invoice?.date_issued ? toLocalDateString(invoice.date_issued) : "")
    ) {
      handleCancelDateIssuedEdit();
      return;
    }

    // Check if e-invoice cancellation is required
    const requiresEInvoiceCancel = invoice?.einvoice_status === "valid";

    if (requiresEInvoiceCancel) {
      setPendingUpdate({
        type: "date_issued",
        value: editedDateIssued,
        requiresEInvoiceCancel: true,
      });
      setShowEInvoiceCancelConfirm(true);
      return;
    }

    // Proceed with update
    await updateDateIssued(editedDateIssued);
  };

  const updateDateIssued = async (newDate: string) => {
    setIsUpdatingDateIssued(true);
    try {
      const updateData: any = {
        date_issued: newDate,
        type: invoice?.type,
        customer_id: invoice?.customer_id,
        amount_before_tax: invoice?.amount_before_tax || invoice?.total_amount,
        invoice_number: invoice?.invoice_number,
      };

      // Include rental_ids for regular invoices
      if (invoice?.type === "regular" && invoice?.rental_details) {
        updateData.rental_ids = invoice.rental_details.map(
          (rental: any) => rental.rental_id
        );
      }

      await greenTargetApi.updateInvoice(invoice?.invoice_id!, updateData);
      toast.success(t("Date issued updated successfully."));
      handleCancelDateIssuedEdit();
      if (id) fetchInvoiceDetails(parseInt(id));
    } catch (error: any) {
      console.error("Failed to update date issued:", error);
      const errorMessage =
        error?.response?.data?.message || t("Failed to update date issued.");
      toast.error(errorMessage);
    } finally {
      setIsUpdatingDateIssued(false);
    }
  };

  const handleEditAmount = () => {
    setIsEditingAmount(true);
    setEditedAmount(invoice?.total_amount?.toString() || "");
  };

  const handleCancelAmountEdit = () => {
    setIsEditingAmount(false);
    setEditedAmount("");
  };

  const handleSaveAmount = async () => {
    const newAmount = parseFloat(editedAmount);
    if (isNaN(newAmount) || newAmount < 0) {
      toast.error(t("Please enter a valid amount."));
      return;
    }

    if (newAmount === parseFloat(invoice?.total_amount?.toString() || "0")) {
      handleCancelAmountEdit();
      return;
    }

    // Check if e-invoice cancellation is required
    const requiresEInvoiceCancel = invoice?.einvoice_status === "valid";

    if (requiresEInvoiceCancel) {
      setPendingUpdate({
        type: "amount",
        value: newAmount,
        requiresEInvoiceCancel: true,
      });
      setShowEInvoiceCancelConfirm(true);
      return;
    }

    // Proceed with update
    await updateAmount(newAmount);
  };

  const updateAmount = async (newAmount: number) => {
    setIsUpdatingAmount(true);
    try {
      const updateData: any = {
        total_amount: newAmount,
        amount_before_tax: newAmount, // Assuming the amount is before tax
        type: invoice?.type,
        customer_id: invoice?.customer_id,
        date_issued: invoice?.date_issued,
        invoice_number: invoice?.invoice_number,
      };

      // Include rental_ids for regular invoices
      if (invoice?.type === "regular" && invoice?.rental_details) {
        updateData.rental_ids = invoice.rental_details.map(
          (rental: any) => rental.rental_id
        );
      }

      await greenTargetApi.updateInvoice(invoice?.invoice_id!, updateData);
      toast.success(t("Invoice amount updated successfully."));
      handleCancelAmountEdit();
      if (id) fetchInvoiceDetails(parseInt(id));
    } catch (error: any) {
      console.error("Failed to update invoice amount:", error);
      const errorMessage =
        error?.response?.data?.message || t("Failed to update invoice amount.");
      toast.error(errorMessage);
    } finally {
      setIsUpdatingAmount(false);
    }
  };

  // E-invoice cancellation and warning handlers
  const handleConfirmEInvoiceCancel = async () => {
    if (!pendingUpdate) return;

    try {
      setIsSyncingCancellation(true);

      // Proceed with the update with e-invoice cancellation confirmation
      switch (pendingUpdate.type) {
        case "invoice_number":
          await updateInvoiceNumberWithConfirmation(pendingUpdate.value);
          break;
        case "date_issued":
          await updateDateIssuedWithConfirmation(pendingUpdate.value);
          break;
        case "amount":
          await updateAmountWithConfirmation(pendingUpdate.value);
          break;
      }

      toast.success(
        t("E-invoice cancelled and invoice updated successfully.")
      );
    } catch (error: any) {
      console.error("Failed to cancel e-invoice or update invoice:", error);
      const errorMessage =
        error?.response?.data?.message ||
        t("Failed to cancel e-invoice or update invoice.");
      toast.error(errorMessage);
    } finally {
      setIsSyncingCancellation(false);
      setShowEInvoiceCancelConfirm(false);
      setPendingUpdate(null);
    }
  };

  const handleCancelEInvoiceCancel = () => {
    setShowEInvoiceCancelConfirm(false);
    setPendingUpdate(null);

    // Reset editing states based on pending update type
    if (pendingUpdate?.type === "invoice_number") {
      handleCancelInvoiceNumberEdit();
    } else if (pendingUpdate?.type === "date_issued") {
      handleCancelDateIssuedEdit();
    } else if (pendingUpdate?.type === "amount") {
      handleCancelAmountEdit();
    }
  };

  // Update methods with e-invoice cancellation confirmation
  const updateInvoiceNumberWithConfirmation = async (
    newInvoiceNumber: string
  ) => {
    setIsUpdatingInvoiceNumber(true);
    try {
      const updateData: any = {
        invoice_number: newInvoiceNumber,
        type: invoice?.type,
        customer_id: invoice?.customer_id,
        amount_before_tax: invoice?.amount_before_tax || invoice?.total_amount,
        date_issued: invoice?.date_issued,
        confirmEInvoiceCancellation: true,
      };

      // Include rental_ids for regular invoices
      if (invoice?.type === "regular" && invoice?.rental_details) {
        updateData.rental_ids = invoice.rental_details.map(
          (rental: any) => rental.rental_id
        );
      }

      await greenTargetApi.updateInvoice(invoice?.invoice_id!, updateData);
      handleCancelInvoiceNumberEdit();
      if (id) fetchInvoiceDetails(parseInt(id));
    } catch (error: any) {
      console.error("Failed to update invoice number:", error);
      const errorMessage =
        error?.response?.data?.message || t("Failed to update invoice number.");
      toast.error(errorMessage);
    } finally {
      setIsUpdatingInvoiceNumber(false);
    }
  };

  const updateDateIssuedWithConfirmation = async (newDate: string) => {
    setIsUpdatingDateIssued(true);
    try {
      const updateData: any = {
        date_issued: newDate,
        type: invoice?.type,
        customer_id: invoice?.customer_id,
        amount_before_tax: invoice?.amount_before_tax || invoice?.total_amount,
        invoice_number: invoice?.invoice_number,
        confirmEInvoiceCancellation: true,
      };

      // Include rental_ids for regular invoices
      if (invoice?.type === "regular" && invoice?.rental_details) {
        updateData.rental_ids = invoice.rental_details.map(
          (rental: any) => rental.rental_id
        );
      }

      await greenTargetApi.updateInvoice(invoice?.invoice_id!, updateData);
      handleCancelDateIssuedEdit();
      if (id) fetchInvoiceDetails(parseInt(id));
    } catch (error: any) {
      console.error("Failed to update date issued:", error);
      const errorMessage =
        error?.response?.data?.message || t("Failed to update date issued.");
      toast.error(errorMessage);
    } finally {
      setIsUpdatingDateIssued(false);
    }
  };

  const updateAmountWithConfirmation = async (newAmount: number) => {
    setIsUpdatingAmount(true);
    try {
      const updateData: any = {
        total_amount: newAmount,
        amount_before_tax: newAmount, // Assuming the amount is before tax
        type: invoice?.type,
        customer_id: invoice?.customer_id,
        date_issued: invoice?.date_issued,
        invoice_number: invoice?.invoice_number,
        confirmEInvoiceCancellation: true,
      };

      // Include rental_ids for regular invoices
      if (invoice?.type === "regular" && invoice?.rental_details) {
        updateData.rental_ids = invoice.rental_details.map(
          (rental: any) => rental.rental_id
        );
      }

      await greenTargetApi.updateInvoice(invoice?.invoice_id!, updateData);
      handleCancelAmountEdit();
      if (id) fetchInvoiceDetails(parseInt(id));
    } catch (error: any) {
      console.error("Failed to update invoice amount:", error);
      const errorMessage =
        error?.response?.data?.message || t("Failed to update invoice amount.");
      toast.error(errorMessage);
    } finally {
      setIsUpdatingAmount(false);
    }
  };

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
      setConsolidatedInfo(invoice.consolidated_part_of || null);

      // Initialize selected rentals from the invoice
      if (invoice.rental_details && Array.isArray(invoice.rental_details)) {
        setSelectedRentals(invoice.rental_details);
      }

      // Pre-fill amount in payment form
      setPaymentFormData((prev) => ({
        ...prev,
        amount_paid: invoice.current_balance,
        payment_method: prev.payment_method || "cash", // Ensure a default if needed
      }));

      setError(null);
    } catch (err) {
      setError(t("Failed to fetch invoice details. Please try again."));
      console.error("Error fetching invoice details:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableRentals = async (customerId: number) => {
    if (!customerId || customerId <= 0) {
      setAvailableRentals([]);
      return;
    }

    try {
      setIsLoadingRentals(true);
      const params = new URLSearchParams({
        customer_id: customerId.toString(),
      });
      const data: any[] = await api.get(
        `/greentarget/api/rentals?${params.toString()}`
      );

      // Filter rentals that are available (not in other invoices or in cancelled invoices)
      const available = data.filter(
        (r) =>
          // Include rentals with no invoice info
          !r.invoice_info ||
          // OR include rentals that are part of this invoice (for editing)
          (invoice && r.invoice_info?.invoice_id === invoice.invoice_id) ||
          // OR include rentals with cancelled invoices
          (r.invoice_info && r.invoice_info.status === "cancelled")
      );

      setAvailableRentals(available);
    } catch (err) {
      console.error("Error fetching available rentals:", err);
      toast.error(t("Failed to load available rentals."));
      setAvailableRentals([]);
    } finally {
      setIsLoadingRentals(false);
    }
  };

  const isRentalActive = (datePickedStr: string | null | undefined) => {
    if (!datePickedStr) return true;

    // Convert dates to YYYY-MM-DD format for reliable comparison
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");

    // Get just the date part
    const pickupDateStr = toLocalDateString(datePickedStr);

    // If pickup date is today or in the past, consider it completed
    return pickupDateStr > todayStr;
  };

  const handleEditRentals = () => {
    if (!invoice?.customer_id) {
      toast.error(t("Customer information missing"));
      return;
    }

    setIsEditingRentals(true);
    fetchAvailableRentals(invoice.customer_id);
  };

  const handleCancelEditRentals = () => {
    setIsEditingRentals(false);
    setAvailableRentals([]);
    // Reset selected rentals to original invoice rentals
    if (invoice?.rental_details && Array.isArray(invoice.rental_details)) {
      setSelectedRentals(invoice.rental_details);
    }
  };

  const handleRentalToggle = (rental: any) => {
    const isSelected = selectedRentals.some(
      (r) => r.rental_id === rental.rental_id
    );

    if (isSelected) {
      // Remove rental from selection
      const newSelectedRentals = selectedRentals.filter(
        (r) => r.rental_id !== rental.rental_id
      );
      setSelectedRentals(newSelectedRentals);
    } else {
      // Add rental to selection
      setSelectedRentals([...selectedRentals, rental]);
    }
  };

  const handleSaveRentals = async () => {
    if (!invoice) return;

    setIsSavingRentals(true);
    try {
      const rentalIds = selectedRentals.map((r) => r.rental_id);

      const updateData = {
        type: invoice.type,
        customer_id: invoice.customer_id,
        rental_ids: rentalIds,
        amount_before_tax: invoice.amount_before_tax,
        tax_amount: invoice.tax_amount,
        total_amount: invoice.total_amount,
        date_issued: invoice.date_issued,
        invoice_number: invoice.invoice_number,
      };

      await greenTargetApi.updateInvoice(invoice.invoice_id, updateData);

      toast.success(t("Rental selection updated successfully"));
      setIsEditingRentals(false);
      setAvailableRentals([]);

      // Refresh invoice details
      fetchInvoiceDetails(invoice.invoice_id);
    } catch (error: any) {
      console.error("Error updating rental selection:", error);
      const errorMessage = error?.response?.data?.message || error?.message;
      toast.error(errorMessage || t("Failed to update rental selection"));
    } finally {
      setIsSavingRentals(false);
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

  const handlePaymentDateChange = (range: TimeRange): void => {
    setPaymentFormData((prev: PaymentFormData): PaymentFormData => ({
      ...prev,
      payment_date: format(range.start, "yyyy-MM-dd"),
    }));
  };

  // Specific handler for Listbox change
  const handlePaymentMethodChange = (value: string): void => {
    setPaymentFormData((prev: PaymentFormData): PaymentFormData => ({
      ...prev,
      payment_method: value as GreenTargetPayment["payment_method"],
      // Only a cheque carries a reference now.
      payment_reference: value === "cheque" ? prev.payment_reference : "",
    }));
  };

  const validatePaymentForm = (): boolean => {
    if (paymentReceiptLookup.isLooking) {
      toast.error(t("Wait for the Green Target reference check to finish."));
      return false;
    }
    if (paymentReceiptLookup.receipt && !joinedPaymentReceipt) {
      toast.error(
        paymentReceiptLookup.joinable
          ? t("Confirm that this payment belongs to the existing receipt.")
          : t("This Green Target reference cannot accept another payment.")
      );
      return false;
    }
    if (!paymentFormData.payment_date && !joinedPaymentReceipt) {
      toast.error(t("Payment date is required"));
      return false;
    }

    if (
      paymentFormData.amount_paid < 0.01 ||
      Math.abs(
        paymentFormData.amount_paid * 100 -
          Math.round(paymentFormData.amount_paid * 100)
      ) > 0.0000001
    ) {
      toast.error(
        t(
          "Payment amount must be at least RM0.01 and use no more than two decimal places"
        )
      );
      return false;
    }

    if (invoice && paymentFormData.amount_paid > invoice.current_balance) {
      toast.error(t("Payment amount cannot exceed the current balance"));
      return false;
    }

    if (!paymentFormData.payment_method) {
      toast.error(t("Payment method is required"));
      return false;
    }

    if (!paymentFormData.internal_reference.trim()) {
      toast.error(t("Green Target reference number is required"));
      return false;
    }
    if (paymentFormData.internal_reference.trim().length > 50) {
      toast.error(
        t("Green Target reference number cannot exceed 50 characters")
      );
      return false;
    }
    if (paymentFormData.payment_reference.trim().length > 50) {
      toast.error(t("Cheque number cannot exceed 50 characters"));
      return false;
    }

    return true;
  };

  const processPayment = async (): Promise<void> => {
    if (!validatePaymentForm() || !invoice) {
      return;
    }

    // Advance payment: a received date earlier than the invoice date needs
    // an explicit confirmation before the server accepts it.
    const effectivePaymentDate: string = joinedPaymentReceipt
      ? toLocalDateInputValue(joinedPaymentReceipt.received_date)
      : paymentFormData.payment_date;
    const invoiceDate: string = toLocalDateInputValue(
      invoice.date_issued ? String(invoice.date_issued) : null
    );
    if (
      effectivePaymentDate &&
      invoiceDate &&
      effectivePaymentDate < invoiceDate &&
      !advancePaymentConfirmedRef.current
    ) {
      setAdvancePaymentPrompt({
        paymentDate: effectivePaymentDate,
        invoiceDate,
      });
      return;
    }

    setIsProcessingPayment(true);

    try {
      // A joined receipt owns the banking event: its date, method and cheque /
      // transaction reference are sent back as they are and the server ignores
      // them in favour of the header anyway.
      const paymentData: CreateGreenTargetPaymentInput = {
        invoice_id: invoice.invoice_id,
        amount_paid: paymentFormData.amount_paid,
        payment_date: joinedPaymentReceipt
          ? toLocalDateInputValue(joinedPaymentReceipt.received_date)
          : paymentFormData.payment_date,
        payment_method: joinedPaymentReceipt
          ? joinedPaymentReceipt.payment_method
          : paymentFormData.payment_method,
        payment_reference: joinedPaymentReceipt
          ? joinedPaymentReceipt.payment_reference || null
          : effectivePaymentMethod === "cheque"
          ? paymentFormData.payment_reference.trim() || null
          : null,
        internal_reference: paymentFormData.internal_reference.trim(),
        ...(joinedPaymentReceipt
          ? { receipt_id: joinedPaymentReceipt.receipt_id }
          : {}),
        ...(advancePaymentConfirmedRef.current
          ? { allow_advance_payment: true }
          : {}),
      };

      await greenTargetApi.createPayment(paymentData);

      toast.success(t("Payment processed successfully"));
      await fetchInvoiceDetails(invoice.invoice_id); // Refresh details
      setShowPaymentForm(false); // Close form
      // Optionally reset form fields
      setPaymentFormData({
        amount_paid: 0,
        payment_date: format(new Date(), "yyyy-MM-dd"),
        payment_method: "cash",
        payment_reference: "",
        internal_reference: "",
      });
    } catch (error) {
      console.error("Error processing payment:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error(t("An error occurred while processing the payment"));
      }
    } finally {
      setIsProcessingPayment(false);
      // One-shot: a fresh advance needs a fresh confirmation.
      advancePaymentConfirmedRef.current = false;
    }
  };

  const handleSubmitPayment = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    await processPayment();
  };

  const handleCancelPayment = async (): Promise<void> => {
    if (!paymentToCancel || !invoice) return;

    setIsCancellingPayment(true);
    try {
      // Call the new cancelPayment method
      await greenTargetApi.cancelPayment(paymentToCancel.payment_id);

      toast.success(t("Receipt cancelled successfully"));

      // Refresh the invoice details to update balances
      await fetchInvoiceDetails(invoice.invoice_id);
    } catch (error: any) {
      console.error("Error cancelling payment:", error);
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          t("Failed to cancel payment")
      );
    } finally {
      setIsCancellingPayment(false);
      setIsCancelPaymentDialogOpen(false);
      setPaymentToCancel(null);
    }
  };

  const handleConfirmPaymentClick = (payment: Payment): void => {
    if (payment.status !== "pending") {
      toast.error(t("Only pending payments can be confirmed"));
      return;
    }

    const today: string = format(new Date(), "yyyy-MM-dd");
    const receivedDate: string = format(
      new Date(payment.payment_date),
      "yyyy-MM-dd"
    );
    setPaymentToConfirm(payment);
    setPaymentClearanceDate(receivedDate > today ? receivedDate : today);
    setShowConfirmPaymentDialog(true);
  };

  const handleConfirmPayment = async (): Promise<void> => {
    if (!paymentToConfirm || !invoice) return;
    if (!paymentClearanceDate) {
      toast.error(t("Bank clearance / posting date is required"));
      return;
    }

    setIsConfirmingPayment(true);
    try {
      await greenTargetApi.confirmPayment(
        paymentToConfirm.payment_id,
        paymentClearanceDate
      );

      toast.success(t("Receipt confirmed successfully"));

      // Refresh the invoice details to update balances
      await fetchInvoiceDetails(invoice.invoice_id);
    } catch (error) {
      console.error("Error confirming payment:", error);
      toast.error(
        error instanceof Error ? error.message : t("Failed to confirm receipt")
      );
    } finally {
      setIsConfirmingPayment(false);
      setShowConfirmPaymentDialog(false);
      setPaymentToConfirm(null);
      setPaymentClearanceDate(format(new Date(), "yyyy-MM-dd"));
    }
  };

  const handleCancelPaymentClick = (payment: Payment) => {
    if (invoice?.status === "cancelled") {
      toast.error(t("Cannot cancel payment for a cancelled invoice."));
      return;
    }

    // Don't allow cancelling already cancelled payments
    if (payment.status === "cancelled") {
      toast.error(t("This payment is already cancelled"));
      return;
    }

    if (hasActiveAdjustmentDocs) {
      toast.error(
        t(
          "Cancel the active adjustment document before cancelling payments."
        )
      );
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

      const toastId = toast.loading(t("Submitting e-Invoice..."));

      // Call the actual e-Invoice submission API
      const response = await greenTargetApi.submitEInvoice(invoice.invoice_id);

      // Dismiss the loading toast
      toast.dismiss(toastId);

      // Transform the Green Target response to match the expected format
      const transformedResponse = {
        success: response.success,
        message: response.message || t("e-Invoice submitted successfully"),
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
                    message: response.error.message || t("Unknown error"),
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
        toast.error(
          t("Failed to submit e-Invoice due to an unexpected error")
        );
      }

      // Still refresh the invoice data if successful
      if (response.success) {
        fetchInvoiceDetails(invoice.invoice_id);
      }
    } catch (error) {
      console.error("Error submitting e-Invoice:", error);
      toast.error(t("Failed to submit e-Invoice"));

      // Create a formatted error response for the modal
      setSubmissionResults({
        success: false,
        message:
          error instanceof Error ? error.message : t("Unknown error occurred"),
        overallStatus: "Error",
        rejectedDocuments: [
          {
            internalId: invoice.invoice_id.toString(),
            error: {
              code: "SYSTEM_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : t("Unknown error occurred"),
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
      const toastId = toast.loading(t("Checking e-Invoice status..."));

      // Call API to check status
      const response = await greenTargetApi.checkEInvoiceStatus(
        invoice.invoice_id
      );

      toast.dismiss(toastId);

      // Format the response for the SubmissionResultsModal
      const formattedResponse = {
        success: response.success,
        message: response.message || t("e-Invoice status: {{status}}", {
          status: response.status,
        }),
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
                    message: t("e-Invoice is invalid"),
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
      toast.error(t("Failed to check e-Invoice status"));

      // Create error response for modal
      setSubmissionResults({
        success: false,
        message: t("Failed to check e-Invoice status"),
        overallStatus: "Error",
        rejectedDocuments: [
          {
            internalId: invoice.invoice_id.toString(),
            error: {
              code: "STATUS_CHECK_ERROR",
              message:
                error instanceof Error ? error.message : t("Unknown error"),
            },
          },
        ],
      });
      setShowSubmissionResultsModal(true);
    } finally {
      setIsCheckingEInvoice(false);
    }
  };

  const getConsolidatedInfo = (consolidatedInfo: any) => {
    if (!consolidatedInfo) return null;

    // Only show for valid consolidated invoices
    if (consolidatedInfo.einvoice_status !== "valid") return null;

    return {
      text: "Consolidated",
      color: "text-indigo-700 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-900/30",
      border: "border-indigo-200 dark:border-indigo-800",
      icon: IconFiles,
      info: consolidatedInfo,
    };
  };

  const handleSyncCancellationStatus = async () => {
    if (!invoice?.invoice_id) return;

    try {
      setIsSyncingCancellation(true);
      const toastId = toast.loading(t("Syncing cancellation status..."));

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
        toast.error(
          response.message || t("Failed to sync cancellation status")
        );
      }
    } catch (error) {
      console.error("Error syncing cancellation status:", error);
      toast.error(t("Failed to sync cancellation status"));
    } finally {
      setIsSyncingCancellation(false);
    }
  };

  const handleDownloadInvoice = async () => {
    // Made async
    if (!invoice || isGeneratingPDF) return;

    setIsGeneratingPDF(true); // Disable button
    const toastId = toast.loading(t("Generating PDF..."));

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
        toast.success(t("PDF downloaded successfully"), { id: toastId });
        setIsGeneratingPDF(false); // Re-enable button
      }, 100);
    } catch (error) {
      console.error("Error generating PDF for download:", error);
      toast.error(
        t("Failed to generate PDF: {{message}}", {
          message: error instanceof Error ? error.message : t("Unknown error"),
        }),
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

    setIsCancellingInvoice(true);
    try {
      await greenTargetApi.cancelInvoice(invoice.invoice_id);
      toast.success(t("Invoice cancelled successfully"));

      // Refresh invoice details to show updated status
      fetchInvoiceDetails(parseInt(id as string));
    } catch (error: any) {
      console.error("Error cancelling invoice:", error);
      const errorMessage = error?.response?.data?.message || error?.message;

      if (errorMessage && errorMessage.includes("active payments")) {
        toast.error(
          t(
            "Cannot cancel invoice: it has active payments. Cancel the payments first."
          )
        );
      } else {
        toast.error(errorMessage || t("Failed to cancel invoice"));
      }
    } finally {
      setIsCancellingInvoice(false);
      setIsCancelInvoiceDialogOpen(false);
    }
  };

  const handleDeleteInvoice = async (forceDelete = false) => {
    if (!invoice) return;

    setIsDeletingInvoice(true);
    try {
      const url = forceDelete
        ? `/greentarget/api/invoices/${invoice.invoice_id}?force=true`
        : `/greentarget/api/invoices/${invoice.invoice_id}`;

      await api.delete(url);
      toast.success(t("Invoice deleted successfully"));

      // Navigate back to invoice list
      navigate("/greentarget/invoices");
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      const errorData = error?.response?.data;

      if (errorData?.canForceDelete && errorData?.payments) {
        // Show detailed confirmation with payment information
        const paymentList = errorData.payments
          .map(
            (p: any) =>
              `- ${new Intl.NumberFormat("en-MY", {
                style: "currency",
                currency: "MYR",
              }).format(p.amount_paid)} (${p.payment_method}, ${new Date(
                p.payment_date
              ).toLocaleDateString()})`
          )
          .join("\n");

        const confirmed = window.confirm(
          t(
            "This invoice has the following payments:\n\n{{payments}}\n\nDeleting the invoice will also delete all associated payments. This action cannot be undone.\n\nDo you want to proceed?",
            { payments: paymentList }
          )
        );

        if (confirmed) {
          handleDeleteInvoice(true); // Retry with force delete
          return;
        }
      } else {
        const errorMessage =
          errorData?.message || error?.message || t("Failed to delete invoice");
        toast.error(errorMessage);
      }
    } finally {
      setIsDeletingInvoice(false);
      setIsDeleteInvoiceDialogOpen(false);
    }
  };

  const getGTStatusBadgeStyle = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "paid": // Assuming you derive 'paid' from balance
      case "refunded":
        return "border-green-200 bg-green-100 text-green-800 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-200";
      case "partially_refunded":
        return "border-teal-200 bg-teal-100 text-teal-800 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-200";
      case "credited":
      case "credit_balance":
        return "border-indigo-200 bg-indigo-100 text-indigo-800 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200";
      case "cancelled":
        return "border-default-300 bg-default-200 text-default-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200";
      case "overdue":
        return "border-red-200 bg-red-100 text-red-800 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-200"; // Example: Red style
      case "active":
      default: // Treat active/default as Unpaid visually if balance > 0
        return invoice && invoice.current_balance > 0
          ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200" // Unpaid style
          : "border-gray-200 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"; // Default/Unknown style
    }
  };

  const getGTBalanceTextStyle = (status: GTDisplayStatus): string => {
    switch (status) {
      case "paid":
      case "refunded":
        return "text-green-600 dark:text-green-400";
      case "partially_refunded":
        return "text-teal-600 dark:text-teal-400";
      case "credited":
      case "credit_balance":
        return "text-indigo-600 dark:text-indigo-400";
      case "cancelled":
        return "text-rose-600 dark:text-rose-400";
      case "overdue":
        return "text-red-600 dark:text-red-400";
      case "unpaid":
      default:
        return "text-amber-600 dark:text-amber-400";
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
        <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 p-4 rounded-lg">
          <p>{error || t("Invoice not found")}</p>
          <Button
            onClick={() => navigate("/greentarget/invoices")}
            icon={IconChevronLeft}
            className="mt-4 font-medium"
          >
            {t("Back to Invoices")}
          </Button>
        </div>
      </div>
    );
  }

  // Find the selected payment method option for display. A joined receipt owns
  // the method, so the form shows the receipt's rather than the keyed one.
  const effectivePaymentMethod: GreenTargetPayment["payment_method"] =
    joinedPaymentReceipt
      ? joinedPaymentReceipt.payment_method
      : paymentFormData.payment_method;
  const selectedPaymentMethod = paymentMethodOptions.find(
    (option) => option.id === effectivePaymentMethod
  );
  const paymentMethodDisplayValue = selectedPaymentMethod
    ? t(selectedPaymentMethod.name)
    : t("Select Payment Method");
  const invoiceDisplayStatus: GTDisplayStatus = getGTDisplayStatus(invoice);
  const invoiceDisplayStatusLabel: string =
    getGTDisplayStatusLabel(invoiceDisplayStatus);
  const activeAdjustmentDocs: GTAdjDocSummary[] =
    getActiveGTAdjustmentDocs(invoice);
  const activeInvoiceAdjustmentDocs: GTAdjDocSummary[] =
    activeAdjustmentDocs.filter(
      (doc: GTAdjDocSummary) =>
        doc.type === "credit_note" || doc.type === "debit_note"
    );
  const hasActiveAdjustmentDocs: boolean = activeAdjustmentDocs.length > 0;
  const hasActiveDebitNote: boolean = activeInvoiceAdjustmentDocs.some(
    (doc: GTAdjDocSummary) => doc.type === "debit_note"
  );
  const activeDebitNoteTotal: number = activeInvoiceAdjustmentDocs
    .filter((doc: GTAdjDocSummary): boolean => doc.type === "debit_note")
    .reduce(
      (sum: number, doc: GTAdjDocSummary): number =>
        sum + Number(doc.total_amount || 0),
      0
    );
  const activeCreditNoteTotal: number = activeInvoiceAdjustmentDocs
    .filter((doc: GTAdjDocSummary): boolean => doc.type === "credit_note")
    .reduce(
      (sum: number, doc: GTAdjDocSummary): number =>
        sum + Number(doc.total_amount || 0),
      0
    );
  const remainingCreditNoteAmount: number = Number(
    Math.max(
      0,
      Number(invoice.total_amount || 0) +
        activeDebitNoteTotal -
        activeCreditNoteTotal
    ).toFixed(2)
  );
  const canCreateCreditNote: boolean = remainingCreditNoteAmount > 0.005;
  const refundNotePaymentDocs: GTAdjDocSummary[] = (
    invoice.adjustmentDocs || []
  ).filter(
    (doc: GTAdjDocSummary) =>
      doc.type === "refund_note" && !doc.is_consolidated
  );
  const balanceAdjustment: ReturnType<typeof getGTBalanceAdjustment> =
    getGTBalanceAdjustment(invoice);
  const totalAdjustment: ReturnType<typeof getGTTotalAdjustment> =
    getGTTotalAdjustment(invoice);
  const hasAdjustedBalanceDisplay: boolean =
    balanceAdjustment.hasAdjustment &&
    invoiceDisplayStatus !== "cancelled" &&
    Math.abs(
      balanceAdjustment.originalBalanceDue - Number(invoice.current_balance || 0)
    ) > MONEY_TOLERANCE;
  const balanceTextStyle: string = getGTBalanceTextStyle(invoiceDisplayStatus);
  const balanceStatusLabel: string =
    invoiceDisplayStatus === "cancelled" ||
    Number(invoice.current_balance || 0) <= MONEY_TOLERANCE
      ? invoiceDisplayStatusLabel
      : "";
  const eInvoiceStatusDetails: {
    title: string;
    description: string;
    icon: React.ReactNode;
    panelClassName: string;
    iconClassName: string;
    badgeClassName: string;
  } =
    invoice.einvoice_status === "valid"
      ? {
          title: t("Valid e-Invoice"),
          description: t(
            "MyInvois has validated this invoice and the portal document is ready."
          ),
          icon: <IconCircleCheck size={20} stroke={2} />,
          panelClassName:
            "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/20 dark:bg-emerald-400/10",
          iconClassName:
            "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-300/20",
          badgeClassName:
            "border-emerald-200 bg-white/75 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-950/30 dark:text-emerald-200",
        }
      : invoice.einvoice_status === "pending"
      ? {
          title: t("Pending Validation"),
          description: t(
            "This e-invoice has been submitted and is waiting for MyInvois validation."
          ),
          icon: <IconClock size={20} stroke={2} />,
          panelClassName:
            "border-sky-200 bg-sky-50/80 dark:border-sky-400/20 dark:bg-sky-400/10",
          iconClassName:
            "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-400/15 dark:text-sky-200 dark:ring-sky-300/20",
          badgeClassName:
            "border-sky-200 bg-white/75 text-sky-700 dark:border-sky-300/20 dark:bg-sky-950/30 dark:text-sky-200",
        }
      : invoice.einvoice_status === "invalid"
      ? {
          title: t("Invalid e-Invoice"),
          description: t(
            "MyInvois rejected this invoice. Review the submission details before retrying."
          ),
          icon: <IconAlertTriangle size={20} stroke={2} />,
          panelClassName:
            "border-rose-200 bg-rose-50/80 dark:border-rose-400/20 dark:bg-rose-400/10",
          iconClassName:
            "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-400/15 dark:text-rose-200 dark:ring-rose-300/20",
          badgeClassName:
            "border-rose-200 bg-white/75 text-rose-700 dark:border-rose-300/20 dark:bg-rose-950/30 dark:text-rose-200",
        }
      : invoice.einvoice_status === "cancelled"
      ? {
          title: t("Cancelled e-Invoice"),
          description: t(
            "This e-invoice was cancelled in MyInvois, but its identifiers are kept for reference."
          ),
          icon: <IconCancel size={20} stroke={2} />,
          panelClassName:
            "border-default-200 bg-default-50/80 dark:border-gray-700 dark:bg-gray-800/80",
          iconClassName:
            "bg-default-100 text-default-700 ring-default-200 dark:bg-gray-700 dark:text-gray-200 dark:ring-white/10",
          badgeClassName:
            "border-default-200 bg-white/75 text-default-700 dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-200",
        }
      : {
          title: t("e-Invoice Status"),
          description: t(
            "The invoice has e-invoice submission information."
          ),
          icon: <IconFileInvoice size={20} stroke={2} />,
          panelClassName:
            "border-default-200 bg-default-50/80 dark:border-gray-700 dark:bg-gray-800/80",
          iconClassName:
            "bg-default-100 text-default-700 ring-default-200 dark:bg-gray-700 dark:text-gray-200 dark:ring-white/10",
          badgeClassName:
            "border-default-200 bg-white/75 text-default-700 dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-200",
        };
  const eInvoiceMetaItems: Array<{
    label: string;
    value: string | null | undefined;
    isMono?: boolean;
  }> = [
    { label: t("UUID"), value: invoice.uuid, isMono: true },
    { label: t("Submission UID"), value: invoice.submission_uid, isMono: true },
    { label: t("Long ID"), value: invoice.long_id, isMono: true },
    {
      label: t("Validation Date"),
      value: invoice.datetime_validated
        ? new Date(invoice.datetime_validated).toLocaleString()
        : null,
    },
  ].filter(
    (
      item: {
        label: string;
        value: string | null | undefined;
        isMono?: boolean;
      }
    ) => Boolean(item.value)
  );

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="flex items-center gap-4">
          <BackButton fallbackPath="/greentarget/invoices" />
          <div className="h-6 w-px bg-default-300 dark:bg-default-700"></div>
          <h1 className="text-2xl font-bold text-default-900 dark:text-gray-100 flex flex-wrap items-center gap-2 min-w-0">
            <IconFileInvoice
              size={28}
              className="text-default-600 dark:text-gray-300 flex-shrink-0"
            />
            <span>{t("Invoice")}</span>
            <span
              className="truncate max-w-[150px] md:max-w-[300px] inline-block"
              title={invoice.invoice_number}
            >
              {invoice.invoice_number}
            </span>
            {/* Status Badge */}
            <span
              className={`inline-flex h-7 items-center gap-1.5 px-2.5 rounded-md border border-current/15 text-xs font-semibold shadow-sm ${getGTStatusBadgeStyle(
                invoiceDisplayStatus
              )}`}
              title={
                invoice?.status === "cancelled" && invoice.cancellation_date
                  ? t("Cancelled on {{date}}", {
                      date: formatDate(invoice.cancellation_date),
                    })
                  : undefined
              }
            >
              {invoiceDisplayStatus === "cancelled"
                ? `${t(invoiceDisplayStatusLabel)}${
                    invoice.cancellation_date
                      ? ` (${formatDate(invoice.cancellation_date)})`
                      : ""
                  }`
                : t(invoiceDisplayStatusLabel)}
            </span>
            {/* e-Invoice status badges */}
            {invoice.einvoice_status === "valid" && (
              <span
                className="inline-flex h-7 max-w-[190px] items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-950/[0.02] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200 dark:shadow-none dark:ring-white/5"
                title={t("e-Invoice Valid")}
              >
                <IconCircleCheck size={14} stroke={2} className="flex-shrink-0" />
                <span className="truncate">{t("e-Invoice Valid")}</span>
              </span>
            )}
            {invoice.einvoice_status === "pending" && (
              <span
                className="inline-flex h-7 max-w-[190px] items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 shadow-sm ring-1 ring-amber-950/[0.02] dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200 dark:shadow-none dark:ring-white/5"
                title={t("e-Invoice Pending")}
              >
                <IconClock size={14} stroke={2} className="flex-shrink-0" />
                <span className="truncate">{t("e-Invoice Pending")}</span>
              </span>
            )}
            {invoice.einvoice_status === "invalid" && (
              <span
                className="inline-flex h-7 max-w-[190px] items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 shadow-sm ring-1 ring-rose-950/[0.02] dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200 dark:shadow-none dark:ring-white/5"
                title={t("e-Invoice Invalid")}
              >
                <IconAlertTriangle size={14} stroke={2} className="flex-shrink-0" />
                <span className="truncate">{t("e-Invoice Invalid")}</span>
              </span>
            )}
            {/* Consolidated badge */}
            {consolidatedInfo &&
              consolidatedInfo.einvoice_status === "valid" && (
                <a
                  href={`https://myinvois.hasil.gov.my/${consolidatedInfo.uuid}/share/${consolidatedInfo.long_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 max-w-[190px] items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-950/[0.02] transition-colors hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200 dark:shadow-none dark:ring-white/5 dark:hover:border-indigo-300/35 dark:hover:bg-indigo-400/15 dark:hover:text-indigo-100"
                  title={t("Part of consolidated invoice {{number}}", {
                    number: consolidatedInfo.invoice_number,
                  })}
                >
                  <IconFiles size={14} stroke={2} className="flex-shrink-0" />
                  <span className="truncate">{t("Consolidated")}</span>
                </a>
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
                        ? t("Submitting...")
                        : t("Submit e-Invoice")}
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
                      {isCheckingEInvoice
                        ? t("Checking...")
                        : t("Check Status")}
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
                  {isSyncingCancellation
                    ? t("Syncing...")
                    : t("Sync Cancellation")}
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
              title={t("Print PDF")}
              className="flex-1 sm:flex-none"
            >
              {t("Print")}
            </Button>
            <Button
              onClick={handleDownloadInvoice}
              icon={IconFileDownload}
              variant="outline"
              disabled={isGeneratingPDF || loading}
              title={t("Download PDF")}
              className="flex-1 sm:flex-none"
            >
              {isGeneratingPDF ? t("Generating...") : t("Download")}
            </Button>
          </div>

          {/* Invoice action buttons */}
          <div className="flex flex-wrap gap-3 md:flex-nowrap">
            {invoice.status !== "cancelled" && (
              <>
                <Button
                  onClick={(): void =>
                    navigate(`/greentarget/invoices/${invoice.invoice_id}/edit`)
                  }
                  icon={IconPencil}
                  variant="outline"
                  color="sky"
                  className="flex-1 sm:flex-none"
                  title={t("Edit Invoice")}
                >
                  {t("Edit")}
                </Button>
                <Button
                  onClick={() =>
                    navigate(
                      `/greentarget/adjustment-docs/new?type=debit&invoiceId=${invoice.invoice_id}`
                    )
                  }
                  icon={IconFilePlus}
                  variant="outline"
                  color="amber"
                  className="flex-1 sm:flex-none"
                  disabled={hasActiveDebitNote}
                  title={
                    hasActiveDebitNote
                      ? t("Cancel the active Debit Note before creating another")
                      : t("Issue a Debit Note against this invoice")
                  }
                >
                  DN
                </Button>
                <Button
                  onClick={() =>
                    navigate(
                      `/greentarget/adjustment-docs/new?type=credit&invoiceId=${invoice.invoice_id}`
                    )
                  }
                  icon={IconFileMinus}
                  variant="outline"
                  color="rose"
                  className="flex-1 sm:flex-none"
                  disabled={!canCreateCreditNote}
                  title={
                    canCreateCreditNote
                      ? t("Issue a Credit Note against this invoice")
                      : t(
                          "Credit Notes already cover the full adjusted invoice amount"
                        )
                  }
                >
                  CN
                </Button>
              </>
            )}
            {invoice.current_balance > 0 && (
              <Button
                onClick={() => setShowPaymentForm(!showPaymentForm)}
                icon={IconCash}
                variant="outline"
                color="sky"
                disabled={invoice.status === "cancelled"}
                className="flex-1 sm:flex-none"
              >
                {showPaymentForm ? t("Cancel") : t("Payment")}
              </Button>
            )}
            {invoice.status !== "cancelled" ? (
              <Button
                onClick={() => setIsCancelInvoiceDialogOpen(true)}
                icon={IconCancel}
                variant="outline"
                color="rose"
                className="flex-1 sm:flex-none"
              >
                {t("Cancel")}
              </Button>
            ) : (
              <Button
                onClick={() => setIsDeleteInvoiceDialogOpen(true)}
                icon={IconTrash}
                variant="outline"
                color="rose"
                className="flex-1 sm:flex-none"
              >
                {t("Delete")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Payment form */}
      {showPaymentForm && (
        <div className="bg-default-50 dark:bg-gray-900/50 p-6 rounded-lg mb-6 border border-default-200 dark:border-gray-700">
          <h2 className="text-lg font-medium mb-4">{t("Record Payment")}</h2>
          <form onSubmit={handleSubmitPayment}>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {/* Payment Date Input */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
                  {t("Date Received")}
                </label>
                <TimeNavigator
                  range={getPaymentDateRange(
                    joinedPaymentReceipt
                      ? toLocalDateInputValue(
                          joinedPaymentReceipt.received_date
                        )
                      : paymentFormData.payment_date
                  )}
                  onChange={handlePaymentDateChange}
                  modes={["day"]}
                  presets={false}
                  showArrows={false}
                  allowFuture
                  disabled={
                    isProcessingPayment || joinedPaymentReceipt !== null
                  }
                  className="flex w-full"
                  triggerClassName="min-w-0 flex-1 justify-between"
                />
                {joinedPaymentReceipt && (
                  <p className="text-xs text-default-500 dark:text-gray-400">
                    {t("Taken from receipt {{reference}}.", {
                      reference: joinedPaymentReceipt.display_reference,
                    })}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="internal_reference"
                  className="block text-sm font-medium text-default-700 dark:text-gray-200"
                >
                  {t("Green Target Reference No.")}
                </label>
                <input
                  type="text"
                  id="internal_reference"
                  name="internal_reference"
                  value={paymentFormData.internal_reference}
                  onChange={handlePaymentFormChange}
                  placeholder={t("e.g. RV26/06/62")}
                  maxLength={50}
                  required
                  className={clsx(
                    "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                  )}
                />
              </div>

              {/* Amount Paid Input */}
              <div className="space-y-2">
                <label
                  htmlFor="amount_paid"
                  className="block text-sm font-medium text-default-700 dark:text-gray-200"
                >
                  {t("Amount Paid")}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500 dark:text-gray-400">
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
                      "block w-full pl-10 pr-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                    )}
                  />
                </div>
              </div>

              {/* Payment Method Listbox (Styled like FormListbox) */}
              <div className="space-y-2">
                <label
                  htmlFor="payment_method-button" // Target the button ID
                  className="block text-sm font-medium text-default-700 dark:text-gray-200"
                >
                  {t("Payment Method")}
                </label>
                <Listbox
                  value={effectivePaymentMethod}
                  onChange={handlePaymentMethodChange} // Use dedicated handler
                  name="payment_method"
                  disabled={
                    isProcessingPayment || joinedPaymentReceipt !== null
                  }
                >
                  <div className="relative">
                    <HeadlessListboxButton
                      id="payment_method-button"
                      className={clsx(
                        "relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 py-2 pl-3 pr-10 text-left shadow-sm",
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
                          "absolute z-10 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
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
                                  ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                  : "text-gray-900 dark:text-gray-100"
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
                                  {t(option.name)}
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
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

              {/* Cheque only: the number is how a cheque is matched to the bank
                  statement when it clears. Online and bank transfers are
                  identified by their RV number — no incoming payment in the
                  Jan-Jun legacy ledger carries a transaction id. */}
              {effectivePaymentMethod === "cheque" && (
                <div className="space-y-2">
                  <label
                    htmlFor="payment_reference"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
                  >
                    {t("Cheque Number")}
                  </label>
                  <input
                    type="text"
                    id="payment_reference"
                    name="payment_reference"
                    value={
                      joinedPaymentReceipt
                        ? joinedPaymentReceipt.payment_reference || ""
                        : paymentFormData.payment_reference
                    }
                    onChange={handlePaymentFormChange}
                    readOnly={joinedPaymentReceipt !== null}
                    maxLength={50}
                    className={clsx(
                      // Use clsx for consistency
                      "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                      joinedPaymentReceipt
                        ? "bg-gray-100 dark:bg-gray-800 cursor-default"
                        : "",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                    )}
                  />
                </div>
              )}
            </div>

            <GTReceiptJoinPanel
              lookup={paymentReceiptLookup}
              joinConfirmed={paymentReceiptJoin.joinConfirmed}
              onJoinConfirmedChange={paymentReceiptJoin.setJoinConfirmed}
              disabled={isProcessingPayment}
              className="mt-4"
            />

            <div className="mt-6 flex justify-end">
              <Button
                type="submit"
                variant="filled"
                color="sky"
                disabled={
                  isProcessingPayment ||
                  paymentReceiptLookup.isLooking ||
                  (paymentReceiptLookup.receipt !== null &&
                    joinedPaymentReceipt === null)
                }
              >
                {isProcessingPayment
                  ? t("Processing...")
                  : t("Process Payment")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Invoice details */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-default-200 dark:border-gray-700 overflow-hidden mt-8">
        {/* Invoice info */}
        <section className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
          <h2 className="text-lg font-medium mb-4 border-b dark:border-gray-600 pb-2">
            {t("Invoice Details")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-y-5 gap-x-6 text-sm">
            <div className="flex flex-col group">
              <span className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide mb-1">
                {t("Invoice Number")}
              </span>
              {isEditingInvoiceNumber ? (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={editedInvoiceNumber}
                      onChange={(e) => setEditedInvoiceNumber(e.target.value)}
                      className={clsx(
                        "flex-1 px-2 py-1.5 border rounded-lg text-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500",
                        invoiceNumberValidation.isDuplicate
                          ? "border-red-300 bg-red-50"
                          : "border-default-300"
                      )}
                      placeholder={t("Enter invoice number")}
                      disabled={isUpdatingInvoiceNumber}
                    />
                    <button
                      onClick={handleSaveInvoiceNumber}
                      disabled={
                        isUpdatingInvoiceNumber ||
                        invoiceNumberValidation.isValidating ||
                        invoiceNumberValidation.isDuplicate ||
                        !editedInvoiceNumber.trim()
                      }
                      className="p-1.5 rounded-md text-green-600 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:text-default-400 dark:disabled:text-gray-600 disabled:bg-transparent dark:disabled:bg-transparent"
                      title={t("Save")}
                    >
                      <IconDeviceFloppy size={18} />
                    </button>
                    <button
                      onClick={handleCancelInvoiceNumberEdit}
                      disabled={isUpdatingInvoiceNumber}
                      className="p-1.5 rounded-md text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:text-default-400 dark:disabled:text-gray-600"
                      title={t("Cancel")}
                    >
                      <IconX size={18} />
                    </button>
                  </div>
                  {invoiceNumberValidation.isValidating && (
                    <p className="text-xs text-blue-600">{t("Validating...")}</p>
                  )}
                  {invoiceNumberValidation.message && (
                    <p className="text-xs text-red-600">
                      {invoiceNumberValidation.message}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center">
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {invoice.invoice_number}
                  </span>
                  {invoice.status !== "cancelled" && (
                    <button
                      onClick={handleEditInvoiceNumber}
                      className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
                      title={t("Edit Invoice Number")}
                    >
                      <IconPencil size={14} className="text-sky-600 dark:text-sky-400" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col group">
              <span className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide mb-1">
                {t("Date Issued")}
              </span>
              {isEditingDateIssued ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={editedDateIssued}
                    onChange={(e) => setEditedDateIssued(e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-default-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    disabled={isUpdatingDateIssued}
                  />
                  <button
                    onClick={handleSaveDateIssued}
                    disabled={isUpdatingDateIssued || !editedDateIssued}
                    className="p-1.5 rounded-md text-green-600 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:text-default-400 dark:disabled:text-gray-600 disabled:bg-transparent dark:disabled:bg-transparent"
                    title={t("Save")}
                  >
                    <IconDeviceFloppy size={18} />
                  </button>
                  <button
                    onClick={handleCancelDateIssuedEdit}
                    disabled={isUpdatingDateIssued}
                    className="p-1.5 rounded-md text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:text-default-400 dark:disabled:text-gray-600"
                    title={t("Cancel")}
                  >
                    <IconX size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {formatDate(invoice.date_issued)}
                  </span>
                  {invoice.status !== "cancelled" && (
                    <button
                      onClick={handleEditDateIssued}
                      className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
                      title={t("Edit Date Issued")}
                    >
                      <IconPencil size={14} className="text-sky-600 dark:text-sky-400" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col group">
              <span className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide mb-1">
                {t("Customer")}
              </span>
              <div className="flex items-center">
                {invoice.customer_id ? (
                  <button
                    onClick={() =>
                      navigate(`/greentarget/customers/${invoice.customer_id}`)
                    }
                    className="text-gray-900 dark:text-gray-100 font-medium hover:text-sky-900 hover:underline cursor-pointer"
                    title={t("{{name}} ({{id}})", {
                      name: invoice.customer_name,
                      id: invoice.customer_id,
                    })}
                  >
                    {invoice.customer_name || invoice.customer_id}
                  </button>
                ) : (
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {invoice.customer_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col group">
              <span className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide mb-1">
                {t("Total Amount")}
              </span>
              {isEditingAmount ? (
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-3 flex items-center text-default-500 dark:text-gray-400 text-sm">
                      RM
                    </span>
                    <input
                      type="number"
                      value={editedAmount}
                      onChange={(e) => setEditedAmount(e.target.value)}
                      className="w-full pl-10 pr-3 py-1.5 border border-default-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      placeholder={t("0.00")}
                      step="0.01"
                      min="0"
                      disabled={isUpdatingAmount}
                    />
                  </div>
                  <button
                    onClick={handleSaveAmount}
                    disabled={
                      isUpdatingAmount ||
                      !editedAmount ||
                      parseFloat(editedAmount) < 0
                    }
                    className="p-1.5 rounded-md text-green-600 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:text-default-400 dark:disabled:text-gray-600 disabled:bg-transparent dark:disabled:bg-transparent"
                    title={t("Save")}
                  >
                    <IconDeviceFloppy size={18} />
                  </button>
                  <button
                    onClick={handleCancelAmountEdit}
                    disabled={isUpdatingAmount}
                    className="p-1.5 rounded-md text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:text-default-400 dark:disabled:text-gray-600"
                    title={t("Cancel")}
                  >
                    <IconX size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  {totalAdjustment.hasAdjustment ? (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm text-default-400 dark:text-gray-500 line-through">
                        {formatCurrency(
                          parseFloat(invoice.total_amount.toString())
                        )}
                      </span>
                      <span className="text-gray-900 dark:text-gray-100 font-semibold">
                        {formatCurrency(totalAdjustment.adjustedTotal)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-900 dark:text-gray-100 font-semibold">
                      {formatCurrency(
                        parseFloat(invoice.total_amount.toString())
                      )}
                    </span>
                  )}
                  {invoice.status !== "cancelled" && (
                    <button
                      onClick={handleEditAmount}
                      className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
                      title={t("Edit Amount")}
                    >
                      <IconPencil size={14} className="text-sky-600 dark:text-sky-400" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide mb-1">
                {t("Balance Due")}
              </span>
              <div className="flex items-center">
                {hasAdjustedBalanceDisplay && (
                  <span className="mr-2 text-sm text-default-400 dark:text-gray-500 line-through">
                    {formatCurrency(balanceAdjustment.originalBalanceDue)}
                  </span>
                )}
                <span className={`font-semibold ${balanceTextStyle}`}>
                  {formatCurrency(invoice.current_balance)}
                </span>
                {balanceStatusLabel && (
                  <span
                    className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${getGTStatusBadgeStyle(
                      invoiceDisplayStatus
                    )}`}
                  >
                    {balanceStatusLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide mb-1">
                {t("Delivery Order")}
              </span>
              <div className="flex items-center">
                <span className="text-gray-900 dark:text-gray-100 font-medium">
                  {invoice.delivery_order || "—"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Rental details for regular invoices */}
        {invoice.type === "regular" && (
          <div className="px-6 py-4 border-t border-default-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-medium">
                {t(
                  (invoice.rental_details?.length || 0) > 1
                    ? "Rental Details ({{count}} rentals)"
                    : "Rental Details ({{count}} rental)",
                  { count: invoice.rental_details?.length || 0 }
                )}
              </h2>
              {invoice.status !== "cancelled" && !isEditingRentals && (
                <Button
                  onClick={handleEditRentals}
                  icon={IconPencil}
                  variant="outline"
                  color="sky"
                  size="sm"
                  className="ml-4"
                >
                  {t("Edit Rentals")}
                </Button>
              )}
              {isEditingRentals && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveRentals}
                    icon={IconDeviceFloppy}
                    variant="filled"
                    color="sky"
                    size="sm"
                    disabled={isSavingRentals}
                  >
                    {isSavingRentals ? t("Saving...") : t("Save Changes")}
                  </Button>
                  <Button
                    onClick={handleCancelEditRentals}
                    icon={IconX}
                    variant="outline"
                    color="default"
                    size="sm"
                  >
                    {t("Cancel")}
                  </Button>
                </div>
              )}
            </div>

            {isEditingRentals && (
              <div className="mb-6 p-4 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg">
                <h3 className="text-sm font-medium text-sky-800 dark:text-sky-300 mb-3">
                  {t("Select Rentals for Invoice")}
                </h3>
                {isLoadingRentals ? (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
                    <p className="mt-2 text-sm text-sky-600 dark:text-sky-400">
                      {t("Loading available rentals...")}
                    </p>
                  </div>
                ) : availableRentals.length === 0 ? (
                  <p className="text-sm text-default-500 dark:text-gray-400">
                    {t("No available rentals found for this customer.")}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {availableRentals.map((rental) => {
                      const isSelected = selectedRentals.some(
                        (r) => r.rental_id === rental.rental_id
                      );
                      const isActive = isRentalActive(rental.date_picked);

                      return (
                        <div
                          key={rental.rental_id}
                          onClick={() => handleRentalToggle(rental)}
                          className={clsx(
                            "p-3 border rounded-lg cursor-pointer transition-colors",
                            isSelected
                              ? "bg-sky-100 dark:bg-sky-900/50 border-sky-300 dark:border-sky-700"
                              : "bg-white dark:bg-gray-800 border-default-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="flex items-center">
                                {isSelected ? (
                                  <IconSquareCheckFilled
                                    className="text-sky-600 dark:text-sky-400"
                                    size={20}
                                  />
                                ) : (
                                  <IconSquare
                                    className="text-gray-400"
                                    size={20}
                                  />
                                )}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {t(
                                    rental.tong_no
                                      ? "Rental #{{id}} - Dumpster {{tong}}"
                                      : "Rental #{{id}}",
                                    {
                                      id: rental.rental_id,
                                      tong: rental.tong_no,
                                    }
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {t("Placed: {{date}}", {
                                    date: formatDate(rental.date_placed),
                                  })}
                                  {formatLocationDisplay(
                                    rental.location_site,
                                    rental.location_address
                                  ) &&
                                    ` • ${formatLocationDisplay(
                                      rental.location_site,
                                      rental.location_address
                                    )}`}
                                </div>
                              </div>
                            </div>
                            <span
                              className={clsx(
                                "text-xs font-medium px-2 py-1 rounded-full",
                                isActive
                                  ? "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300"
                                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                              )}
                            >
                              {isActive ? t("Ongoing") : t("Completed")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {selectedRentals.length > 0 && (
                  <div className="mt-4 p-3 bg-white dark:bg-gray-800 border border-sky-200 dark:border-sky-800 rounded-lg">
                    <p className="text-sm font-medium text-sky-800 dark:text-sky-300">
                      {t(
                        selectedRentals.length > 1
                          ? "Selected: {{count}} rentals"
                          : "Selected: {{count}} rental",
                        { count: selectedRentals.length }
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}

            {invoice.rental_details &&
            Array.isArray(invoice.rental_details) &&
            invoice.rental_details.length > 0 ? (
              <div className="space-y-4">
                {invoice.rental_details.map((rental: any, index: number) => (
                  <div
                    key={rental.rental_id || index}
                    className="rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() =>
                      rental.rental_id &&
                      navigate(`/greentarget/rentals/${rental.rental_id}`)
                    }
                    title={t("View Rental")}
                  >
                    {/* Status Banner */}
                    <div
                      className={`px-4 py-2 ${
                        isRentalActive(rental.date_picked)
                          ? "bg-green-500 text-white"
                          : "bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium">
                          {t("Rental #{{id}}", {
                            id: rental.rental_id || "N/A",
                          })}
                          {invoice.rental_details &&
                            invoice.rental_details.length > 1 && (
                              <span className="ml-2 text-sm opacity-75">
                                {t("({{index}} of {{count}})", {
                                  index: index + 1,
                                  count: invoice.rental_details.length,
                                })}
                              </span>
                            )}
                        </h3>
                        <span
                          className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                            isRentalActive(rental.date_picked)
                              ? "bg-green-400/30 text-white"
                              : "bg-default-200 dark:bg-gray-600 text-default-600 dark:text-gray-300"
                          }`}
                        >
                          {isRentalActive(rental.date_picked)
                            ? t("Ongoing")
                            : t("Completed")}
                        </span>
                      </div>
                    </div>

                    {/* Rental Information */}
                    <div className="p-4">
                      {/* Rental Dates */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-default-50 dark:bg-gray-900/50 p-3 rounded-lg border border-default-100 dark:border-gray-700">
                          <div className="text-xs text-default-500 dark:text-gray-400 mb-1">
                            {t("Placement Date")}
                          </div>
                          <div className="font-medium text-default-900 dark:text-gray-100">
                            {formatDate(rental.date_placed || "")}
                          </div>
                        </div>
                        <div
                          className={`p-3 rounded-lg ${
                            rental.date_picked
                              ? "bg-default-50 dark:bg-gray-900/50 border border-default-100 dark:border-gray-700"
                              : "bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-800"
                          }`}
                        >
                          <div className="text-xs text-default-500 dark:text-gray-400 mb-1">
                            {t("Pickup Date")}
                          </div>
                          <div
                            className={`font-medium ${
                              !rental.date_picked ? "text-green-600 dark:text-green-400" : "text-default-900 dark:text-gray-100"
                            }`}
                          >
                            {rental.date_picked
                              ? formatDate(rental.date_picked)
                              : t("Not picked up yet")}
                          </div>
                        </div>
                      </div>
                      {/* Dumpster, Driver & Location Info */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-default-50 dark:bg-gray-900/50 p-3 rounded-lg border border-default-100 dark:border-gray-700">
                          <div className="text-xs text-default-500 dark:text-gray-400 mb-1">
                            {t("Dumpster")}
                          </div>
                          <div className="font-medium text-default-900 dark:text-gray-100">
                            {rental.tong_no || "N/A"}
                          </div>
                        </div>
                        <div className="bg-default-50 dark:bg-gray-900/50 p-3 rounded-lg border border-default-100 dark:border-gray-700">
                          <div className="text-xs text-default-500 dark:text-gray-400 mb-1">
                            {t("Driver")}
                          </div>
                          <div className="font-medium text-default-900 dark:text-gray-100">
                            {rental.driver || "N/A"}
                          </div>
                        </div>
                      </div>

                      <div className="bg-default-50 dark:bg-gray-900/50 p-3 rounded-lg border border-default-100 dark:border-gray-700">
                        <div className="text-xs text-default-500 dark:text-gray-400 mb-1">
                          {t("Location")}
                        </div>
                        <div className="font-medium text-default-900 dark:text-gray-100">
                          {formatLocationDisplay(
                            rental.location_site,
                            rental.location_address
                          ) || t("No specific location")}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !isEditingRentals && (
                <div className="text-center py-8 text-default-500 dark:text-gray-400">
                  <p>{t("No rentals assigned to this invoice.")}</p>
                  <p className="text-sm mt-1">
                    {t('Click "Edit Rentals" to add rentals.')}
                  </p>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Payment history */}
      <div className="mt-8">
        <h2 className="text-xl font-medium mb-4">{t("Payment History")}</h2>

        {payments.length === 0 && refundNotePaymentDocs.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-dashed border-default-200 dark:border-gray-700 rounded-lg p-6 text-center">
            <p className="text-default-500 dark:text-gray-400">
              {t("No payments recorded yet.")}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("Date Received")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("Amount")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("Method")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("Cheque / Transaction Ref")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("GT Reference No.")}
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("Status")}
                    </th>
                    {/* Add the new Actions column header */}
                    <th className="px-6 py-3 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("Actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {payments.map((payment) => (
                    <tr
                      key={payment.payment_id}
                      className={`hover:bg-default-50 dark:hover:bg-gray-800 transition-colors ${
                        payment.status === "cancelled"
                          ? "bg-default-50 dark:bg-gray-800 text-default-400 dark:text-gray-500"
                          : payment.status === "pending"
                          ? "bg-amber-50 dark:bg-amber-900/30"
                          : ""
                      }`}
                      title={
                        payment.status === "cancelled"
                          ? t("Payment cancelled on {{date}}", {
                              date:
                              payment.cancellation_date
                                ? formatDate(payment.cancellation_date)
                                : t("unknown date"),
                            })
                          : payment.status === "pending"
                          ? t("Payment pending confirmation")
                          : t("Paid")
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
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-indigo-50 dark:bg-indigo-900/50 text-default-700 dark:text-gray-200 capitalize">
                          {t(payment.payment_method.replace("_", " "))}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-600 dark:text-gray-300 font-mono">
                        {payment.payment_reference || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-600 dark:text-gray-300">
                        {editingPaymentId === payment.payment_id ? (
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={editedRefValue}
                                maxLength={50}
                                onChange={(e) =>
                                  setEditedRefValue(e.target.value)
                                }
                                className={clsx(
                                  "block w-full px-2 py-1 border rounded-md shadow-sm sm:text-sm",
                                  refValidation.isDuplicate
                                    ? "border-red-500 bg-red-50"
                                    : "border-default-300",
                                  "focus:ring-sky-500 focus:border-sky-500"
                                )}
                                autoFocus
                              />
                              <button
                                onClick={() =>
                                  handleSaveInternalRef(payment.payment_id)
                                }
                                disabled={
                                  isUpdatingPayment ||
                                  refValidation.isValidating ||
                                  refValidation.isDuplicate
                                }
                                className="p-1 rounded-md text-green-600 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:text-default-400 dark:disabled:text-gray-600 disabled:bg-transparent dark:disabled:bg-transparent"
                                title={t("Save")}
                              >
                                <IconDeviceFloppy size={18} />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1 rounded-md text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                                title={t("Cancel")}
                              >
                                <IconX size={18} />
                              </button>
                            </div>
                            {refValidation.message && (
                              <p className="text-xs text-red-600 mt-1">
                                {refValidation.message}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            {payment.receipt_id ? (
                              <button
                                type="button"
                                onClick={(): void =>
                                  setSelectedReceiptId(
                                    payment.receipt_id ?? null
                                  )
                                }
                                className="text-sky-600 hover:underline dark:text-sky-400"
                                title={t(
                                  "View receipt {{reference}} and every invoice it settles",
                                  {
                                    reference:
                                      payment.internal_reference || "",
                                  }
                                )}
                              >
                                {payment.internal_reference ||
                                  t("View receipt")}
                              </button>
                            ) : (
                              <span>{payment.internal_reference || "-"}</span>
                            )}
                            {payment.status !== "cancelled" && (
                              <button
                                onClick={() => handleEditInternalRef(payment)}
                                className="p-1 rounded-md text-default-500 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700 dark:bg-gray-800 hover:text-sky-600 dark:hover:text-sky-400"
                                title={t(
                                  "Edit Green Target Reference No. for this receipt"
                                )}
                              >
                                <IconPencil size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {payment.status === "pending" && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            <IconClock size={14} className="mr-1" />
                            {t("Pending")}
                          </span>
                        )}
                        {payment.status === "active" && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            <IconCircleCheck size={14} className="mr-1" />
                            {t("Settled")}
                          </span>
                        )}
                        {payment.status === "cancelled" && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300">
                            <IconCancel size={14} className="mr-1" />
                            {t("Cancelled")}
                          </span>
                        )}
                        {!payment.status && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            <IconCircleCheck size={14} className="mr-1" />
                            {t("No Status")}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex gap-2 justify-center">
                          {payment.status === "pending" && (
                            <Button
                              variant="outline"
                              color="sky"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConfirmPaymentClick(payment);
                              }}
                              title={t("Confirm Payment")}
                              className="px-2"
                            >
                              <span className="flex items-center gap-1">
                                <IconCircleCheck size={16} /> {t("Confirm")}
                              </span>
                            </Button>
                          )}
                          {payment.status !== "cancelled" && (
                            <Button
                              variant="outline"
                              color="rose"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelPaymentClick(payment);
                              }}
                              disabled={
                                isCancellingPayment ||
                                invoice.status === "cancelled" ||
                                hasActiveAdjustmentDocs
                              }
                              title={
                                hasActiveAdjustmentDocs
                                  ? t(
                                      "Cancel the active adjustment document before cancelling payments"
                                    )
                                  : t("Cancel Payment")
                              }
                              className="px-2"
                            >
                              <span className="flex items-center gap-1">
                                <IconTrash size={16} /> {t("Cancel")}
                              </span>
                            </Button>
                          )}
                          {payment.status === "cancelled" && (
                            <span className="text-xs italic text-default-500 dark:text-gray-400">
                              {t("Cancelled")}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {refundNotePaymentDocs.map((doc: GTAdjDocSummary) => (
                    <tr
                      key={doc.id}
                      className={`hover:bg-default-50 dark:hover:bg-gray-800 transition-colors ${
                        doc.status === "cancelled"
                          ? "bg-default-50 dark:bg-gray-800 text-default-400 dark:text-gray-500"
                          : "bg-rose-50/40 dark:bg-rose-900/10"
                      }`}
                      title={
                        doc.status === "cancelled"
                          ? t("Refund Note cancelled")
                          : doc.paired_with_id
                          ? t("Refund Note paired with {{doc}}", {
                              doc: doc.paired_with_id,
                            })
                          : t("Refund Note")
                      }
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {formatDate(doc.created_at)}
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                          doc.status === "cancelled"
                            ? "text-default-400 line-through"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        -{formatCurrency(doc.total_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 capitalize">
                          {t((doc.refund_method || "refund").replace("_", " "))}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-600 dark:text-gray-300 font-mono">
                        {doc.refund_reference || doc.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-600 dark:text-gray-300">
                        {doc.paired_with_id
                          ? t("Paired with {{doc}}", {
                              doc: doc.paired_with_id,
                            })
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            doc.status === "cancelled"
                              ? "bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300"
                              : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          {doc.status === "cancelled"
                            ? t("Cancelled")
                            : t("Refunded")}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/greentarget/adjustment-docs/${doc.id}`);
                          }}
                          className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:underline"
                        >
                          {t("Open")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Adjustment Documents (CN / DN / RN) inline list */}
      <GTInvoiceAdjustmentDocsSection
        invoiceId={invoice.invoice_id}
        docs={invoice.adjustmentDocs || []}
      />

      {/* e-Invoice Details Section */}
      {invoice.einvoice_status && (
        <div className="mt-8">
          <div className="overflow-hidden rounded-lg border border-default-200 bg-white shadow-sm ring-1 ring-default-900/[0.02] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/5">
            <div
              className={`border-b p-5 ${eInvoiceStatusDetails.panelClassName}`}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md ring-1 ${eInvoiceStatusDetails.iconClassName}`}
                  >
                    {eInvoiceStatusDetails.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-default-900 dark:text-gray-100">
                        {eInvoiceStatusDetails.title}
                      </h3>
                      <span
                        className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide ${eInvoiceStatusDetails.badgeClassName}`}
                      >
                        {invoice.einvoice_status}
                      </span>
                    </div>
                    <p className="mt-1 max-w-2xl text-sm leading-5 text-default-600 dark:text-gray-300">
                      {eInvoiceStatusDetails.description}
                    </p>
                  </div>
                </div>
                {(invoice.einvoice_status === "valid" ||
                  invoice.einvoice_status === "cancelled") &&
                  invoice.long_id && (
                    <a
                      href={`https://myinvois.hasil.gov.my/${invoice.uuid}/share/${invoice.long_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-2 rounded-md border border-default-300 bg-white px-3 text-sm font-medium text-default-700 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-600 dark:bg-gray-900/80 dark:text-gray-200 dark:shadow-none dark:hover:border-sky-400/40 dark:hover:bg-sky-400/10 dark:hover:text-sky-100"
                    >
                      <IconExternalLink size={16} stroke={2} />
                      <span>MyInvois Portal</span>
                    </a>
                  )}
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {eInvoiceMetaItems.map(
                  (item: {
                    label: string;
                    value: string | null | undefined;
                    isMono?: boolean;
                  }) => (
                    <div
                      key={item.label}
                      className="min-w-0 rounded-md border border-default-200 bg-default-50/70 p-3 dark:border-gray-700 dark:bg-gray-950/40"
                    >
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                        {item.label}
                      </p>
                      <p
                        className={`truncate text-sm text-default-900 dark:text-gray-100 ${
                          item.isMono ? "font-mono" : "font-medium"
                        }`}
                        title={item.value || undefined}
                      >
                        {item.value}
                      </p>
                    </div>
                  )
                )}
                {eInvoiceMetaItems.length === 0 && (
                  <div className="rounded-md border border-dashed border-default-300 bg-default-50/70 p-4 text-sm text-default-500 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-400">
                    {t(
                      "No MyInvois identifiers have been stored for this invoice."
                    )}
                  </div>
                )}
              </div>
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
        title={t("Cancel Receipt")}
        message={t(
          "Are you sure you want to cancel receipt {{reference}}? All payment allocations under this Green Target reference will be cancelled. Settled balances will be restored; pending balances stay unchanged.",
          {
            reference:
              paymentToCancel?.internal_reference ||
              t("for this payment"),
          }
        )}
        confirmButtonText={
          isCancellingPayment ? t("Cancelling...") : t("Cancel Receipt")
        }
        variant="danger"
        isConfirming={isCancellingPayment}
      />
      <ConfirmationDialog
        isOpen={isCancelInvoiceDialogOpen}
        onClose={() => setIsCancelInvoiceDialogOpen(false)}
        onConfirm={handleCancelInvoice}
        title={t("Cancel Invoice")}
        message={
          payments.length > 0
            ? t(
                "Are you sure you want to cancel invoice {{number}}? This action cannot be undone. Note: You must cancel all payments first.",
                { number: invoice?.invoice_number }
              )
            : t(
                "Are you sure you want to cancel invoice {{number}}? This action cannot be undone.",
                { number: invoice?.invoice_number }
              )
        }
        confirmButtonText={
          isCancellingInvoice ? t("Cancelling...") : t("Cancel Invoice")
        }
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showConfirmPaymentDialog}
        onClose={() => {
          setShowConfirmPaymentDialog(false);
          setPaymentToConfirm(null);
          setPaymentClearanceDate(format(new Date(), "yyyy-MM-dd"));
        }}
        onConfirm={handleConfirmPayment}
        title={t("Confirm Receipt")}
        message={
          <div className="space-y-3">
            <p>
              {t(
                "Confirm receipt {{reference}}? All pending allocations under this Green Target reference will be confirmed together.",
                {
                  reference:
                    paymentToConfirm?.internal_reference ||
                    t("for this payment"),
                }
              )}
            </p>
            <div>
              <label
                htmlFor="gt-invoice-clearance-date"
                className="mb-1 block text-xs font-medium text-default-600 dark:text-gray-300"
              >
                {t("Bank clearance / posting date")}
              </label>
              <input
                id="gt-invoice-clearance-date"
                type="date"
                value={paymentClearanceDate}
                min={
                  paymentToConfirm?.payment_date
                    ? format(
                        new Date(paymentToConfirm.payment_date),
                        "yyyy-MM-dd"
                      )
                    : undefined
                }
                onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                  setPaymentClearanceDate(event.target.value)
                }
                required
                disabled={isConfirmingPayment}
                className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>
        }
        confirmButtonText={
          isConfirmingPayment ? t("Confirming...") : t("Confirm Receipt")
        }
        variant="default"
        isConfirming={isConfirmingPayment}
      />
      <ConfirmationDialog
        isOpen={isDeleteInvoiceDialogOpen}
        onClose={() => setIsDeleteInvoiceDialogOpen(false)}
        onConfirm={handleDeleteInvoice}
        title={t("Delete Invoice")}
        message={t(
          "Are you sure you want to permanently delete invoice {{number}}? This action cannot be undone and will remove all invoice data from the system.",
          { number: invoice?.invoice_number }
        )}
        confirmButtonText={
          isDeletingInvoice ? t("Deleting...") : t("Delete Invoice")
        }
        variant="danger"
      />
      {/* e-Invoice Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showEInvoiceConfirmDialog}
        onClose={() => setShowEInvoiceConfirmDialog(false)}
        onConfirm={handleConfirmEInvoiceSubmission}
        title={t("Submit e-Invoice")}
        message={t(
          "Are you sure you want to submit Invoice {{number}} as an e-Invoice to MyInvois?",
          { number: invoice?.invoice_number }
        )}
        confirmButtonText={t("Submit")}
        variant="default"
      />

      {/* Advance Payment Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={advancePaymentPrompt !== null}
        onClose={(): void => setAdvancePaymentPrompt(null)}
        onConfirm={(): void => {
          advancePaymentConfirmedRef.current = true;
          setAdvancePaymentPrompt(null);
          void processPayment();
        }}
        title={t("Record Advance Payment?")}
        message={t(
          "The payment received date ({{received}}) is before the invoice date ({{issued}}). Record this as an advance payment?",
          {
            received: advancePaymentPrompt?.paymentDate ?? "",
            issued: advancePaymentPrompt?.invoiceDate ?? "",
          }
        )}
        confirmButtonText={t("Record Payment")}
        variant="default"
      />

      {/* E-Invoice Cancellation Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showEInvoiceCancelConfirm}
        onClose={handleCancelEInvoiceCancel}
        onConfirm={handleConfirmEInvoiceCancel}
        title={t("Cancel e-Invoice")}
        message={t(
          "This change requires cancelling the e-Invoice first. Are you sure you want to proceed? This will cancel the e-Invoice in MyInvois and then update the {{field}}.",
          {
            field: pendingUpdate?.type?.replace("_", " "),
          }
        )}
        confirmButtonText={
          isSyncingCancellation
            ? t("Processing...")
            : t("Cancel e-Invoice & Update")
        }
        variant="danger"
      />

      {/* One receipt can settle several invoices, so the reference opens the
          whole receipt here rather than navigating away from this invoice. */}
      <GreenTargetReceiptDetailsDialog
        receiptId={selectedReceiptId}
        isOpen={selectedReceiptId !== null}
        onClose={(): void => setSelectedReceiptId(null)}
        onChanged={async (): Promise<void> => {
          if (id) await fetchInvoiceDetails(parseInt(id));
        }}
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

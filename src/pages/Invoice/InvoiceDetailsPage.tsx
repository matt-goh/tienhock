// src/pages/Invoice/InvoiceDetailsPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ExtendedInvoiceData,
  InvoiceData,
  Payment,
  ProductItem,
} from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import SubmissionResultsModal from "../../components/Invoice/SubmissionResultsModal";
import { FormInput, FormListbox } from "../../components/FormComponents";
import {
  getInvoiceById,
  getPaymentsForInvoice,
  cancelInvoice,
  createPayment,
  cancelPayment,
  syncCancellationStatus,
  confirmPayment,
} from "../../utils/invoice/InvoiceUtils";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";
import toast from "react-hot-toast";
import {
  IconFileInvoice,
  IconBan,
  IconCash,
  IconTrash,
  IconCircleCheck,
  IconClockHour4,
  IconAlertTriangle,
  IconSend,
  IconRefresh,
  IconFiles,
  IconPrinter,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import InvoiceTotals from "../../components/Invoice/InvoiceTotals";
import EInvoicePDFHandler from "../../utils/invoice/einvoice/EInvoicePDFHandler";
import { api } from "../../routes/utils/api";
import { useCustomersCache } from "../../utils/catalogue/useCustomerCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import { CustomerCombobox } from "../../components/Invoice/CustomerCombobox";
import PDFDownloadHandler from "../../utils/invoice/PDF/PDFDownloadHandler";
import PrintPDFOverlay from "../../utils/invoice/PDF/PrintPDFOverlay";
import LineItemsTable from "../../components/Invoice/LineItemsTable";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import LinkedPaymentsTooltip from "../../components/Invoice/LinkedPaymentsTooltip";

// --- Helper: Read-only Line Items Table ---
const LineItemsDisplayTable: React.FC<{ items: ProductItem[] }> = ({
  items,
}) => {
  const formatCurrency = (amount: number | string): string => {
    const num = Number(amount);
    return isNaN(num)
      ? "0.00"
      : num.toLocaleString("en-MY", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  };

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 uppercase tracking-wider w-[12%]">
              Code
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 uppercase tracking-wider w-[28%]">
              Description
            </th>
            <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 uppercase tracking-wider w-[8%]">
              FOC
            </th>
            <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 uppercase tracking-wider w-[8%]">
              RTN
            </th>
            <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 uppercase tracking-wider w-[8%]">
              Qty
            </th>
            <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 uppercase tracking-wider w-[12%]">
              Price
            </th>
            <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 uppercase tracking-wider w-[10%]">
              Tax
            </th>
            <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 uppercase tracking-wider w-[14%]">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {(items || []).map((item, index) => {
            const isSubtotal = item.issubtotal;
            return (
              <tr
                key={item.uid || item.id || index} // Use available unique key
                className={`${isSubtotal ? "bg-gray-100 font-semibold" : ""}`}
              >
                <td
                  className={`px-4 py-2 whitespace-nowrap text-sm ${
                    isSubtotal ? "text-gray-700" : "text-gray-900"
                  }`}
                >
                  {item.code}
                </td>
                <td
                  className={`px-4 py-2 text-sm ${
                    isSubtotal ? "text-gray-700" : "text-gray-900"
                  }`}
                >
                  {item.description}
                </td>
                <td
                  className={`px-4 py-2 text-right text-sm ${
                    isSubtotal ? "text-gray-700" : "text-gray-900"
                  }`}
                >
                  {isSubtotal ? "" : item.freeProduct || 0}
                </td>
                <td
                  className={`px-4 py-2 text-right text-sm ${
                    isSubtotal ? "text-gray-700" : "text-gray-900"
                  }`}
                >
                  {isSubtotal ? "" : item.returnProduct || 0}
                </td>
                <td
                  className={`px-4 py-2 text-right text-sm ${
                    isSubtotal ? "text-gray-700" : "text-gray-900"
                  }`}
                >
                  {isSubtotal ? "" : item.quantity}
                </td>
                <td
                  className={`px-4 py-2 text-right text-sm ${
                    isSubtotal ? "text-gray-700" : "text-gray-900"
                  }`}
                >
                  {isSubtotal ? "" : formatCurrency(item.price)}
                </td>
                <td
                  className={`px-4 py-2 text-right text-sm ${
                    isSubtotal ? "text-gray-700" : "text-gray-900"
                  }`}
                >
                  {isSubtotal ? "" : formatCurrency(item.tax)}
                </td>
                <td
                  className={`px-4 py-2 text-right text-sm ${
                    isSubtotal ? "text-gray-700 font-bold" : "text-gray-900"
                  }`}
                >
                  {formatCurrency(item.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// --- Main Component ---
const InvoiceDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const invoiceId = id || "";

  // --- State ---
  const [invoiceData, setInvoiceData] = useState<ExtendedInvoiceData | null>(
    null
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action States
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(
    location.state?.showPaymentForm || false
  );
  const [paymentFormData, setPaymentFormData] = useState<
    Omit<Payment, "payment_id" | "invoice_id" | "created_at">
  >({
    amount_paid: 0,
    payment_date: new Date().toISOString().split("T")[0], // Default to today
    payment_method: "cheque", // Default method
    payment_reference: undefined,
    notes: undefined,
    internal_reference: undefined, // Not managed by frontend
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showCancelPaymentConfirm, setShowCancelPaymentConfirm] =
    useState(false);
  const [paymentToCancel, setPaymentToCancel] = useState<Payment | null>(null);
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [isSubmittingEInvoice, setIsSubmittingEInvoice] = useState(false);
  const [showSubmissionResults, setShowSubmissionResults] = useState(false);
  const [submissionResults, setSubmissionResults] = useState(null);
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);
  const [showConfirmPaymentDialog, setShowConfirmPaymentDialog] =
    useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState<Payment | null>(
    null
  );
  const [isClearingEInvoice, setIsClearingEInvoice] = useState(false);
  const [showClearEInvoiceConfirm, setShowClearEInvoiceConfirm] =
    useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [customerQuery, setCustomerQuery] = useState<string>("");
  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState<boolean>(false);

  // Pagination state for customer loading
  const [displayedCustomers, setDisplayedCustomers] = useState<
    { id: string; name: string }[]
  >([]);
  const [customerPage, setCustomerPage] = useState<number>(1);
  const [isLoadingMoreCustomers, setIsLoadingMoreCustomers] =
    useState<boolean>(false);
  const [hasMoreCustomers, setHasMoreCustomers] = useState<boolean>(true);
  const { customers } = useCustomersCache();
  const CUSTOMERS_PER_PAGE = 50;
  // Salesman edit states
  const [isEditingSalesman, setIsEditingSalesman] = useState(false);
  const [selectedSalesman, setSelectedSalesman] = useState<string>("");
  const [isUpdatingSalesman, setIsUpdatingSalesman] = useState(false);
  const { salesmen, isLoading: isLoadingSalesmen } = useSalesmanCache();
  // Payment type edit states
  const [isEditingPaymentType, setIsEditingPaymentType] =
    useState<boolean>(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<
    "CASH" | "INVOICE"
  >("INVOICE");
  const [isUpdatingPaymentType, setIsUpdatingPaymentType] =
    useState<boolean>(false);

  // Date/time edit states
  const [isEditingDateTime, setIsEditingDateTime] = useState<boolean>(false);
  const [selectedDateTime, setSelectedDateTime] = useState<string>("");
  const [isUpdatingDateTime, setIsUpdatingDateTime] = useState<boolean>(false);
  // E-Invoice handler
  const [showSubmitEInvoiceConfirm, setShowSubmitEInvoiceConfirm] =
    useState(false);
  const [isSyncingCancellation, setIsSyncingCancellation] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showEInvoiceCancelConfirm, setShowEInvoiceCancelConfirm] =
    useState<boolean>(false);
  const [eInvoiceCancelAction, setEInvoiceCancelAction] = useState<{
    type: "customer" | "datetime";
    data: any;
  } | null>(null);
  // UUID edit states
  const [isEditingUUID, setIsEditingUUID] = useState<boolean>(false);
  const [selectedUUID, setSelectedUUID] = useState<string>("");
  const [isUpdatingUUID, setIsUpdatingUUID] = useState<boolean>(false);
  // Order details edit states
  const { products: productsCache, isLoading: productsLoading } =
    useProductsCache();
  const [isEditingOrderDetails, setIsEditingOrderDetails] =
    useState<boolean>(false);
  const [editedProducts, setEditedProducts] = useState<ProductItem[]>([]);
  const [isUpdatingOrderDetails, setIsUpdatingOrderDetails] =
    useState<boolean>(false);

  // --- Fetch Data ---
  const fetchDetails = useCallback(async () => {
    if (!invoiceId) {
      setError("No Invoice ID provided.");
      setIsLoading(false);
      return;
    }
    // Don't reset data here, allow spinner overlay
    setIsLoading(true);
    setError(null);
    try {
      // Fetch concurrently
      const [invoiceRes, paymentsRes] = await Promise.allSettled([
        getInvoiceById(invoiceId),
        getPaymentsForInvoice(invoiceId, true),
      ]);

      // Process Invoice Response
      if (invoiceRes.status === "fulfilled") {
        setInvoiceData(invoiceRes.value);
        // Pre-fill payment amount based on fetched balance
        setPaymentFormData((prev) => ({
          ...prev,
          amount_paid:
            invoiceRes.value.balance_due > 0 ? invoiceRes.value.balance_due : 0, // Ensure non-negative
        }));
      } else {
        console.error("Failed to fetch invoice:", invoiceRes.reason);
        throw new Error(
          invoiceRes.reason?.message || "Failed to load invoice details."
        );
      }

      // Process Payments Response
      if (paymentsRes.status === "fulfilled") {
        setPayments(paymentsRes.value);
      } else {
        // Don't fail the whole page if only payments fail, just log and show message maybe
        console.error("Failed to fetch payments:", paymentsRes.reason);
        toast.error("Could not load payment history.");
        setPayments([]); // Clear previous payments if fetch fails
      }
    } catch (err: any) {
      setError(err.message || "Failed to load invoice details.");
      setInvoiceData(null); // Clear data on critical error
      setPayments([]);
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]); // fetchDetails dependency is stable due to useCallback

  // Initialize displayed customers when customers cache loads
  useEffect(() => {
    if (customers.length > 0) {
      const initialCustomers = customers
        .slice(0, CUSTOMERS_PER_PAGE)
        .map((customer) => ({
          id: customer.id,
          name: customer.name,
        }));
      setDisplayedCustomers(initialCustomers);
      setHasMoreCustomers(customers.length > CUSTOMERS_PER_PAGE);
      setCustomerPage(1);
    }
  }, [customers]);

  // Filter customers based on query
  const filteredCustomers = useMemo(() => {
    if (!customerQuery.trim()) {
      return displayedCustomers;
    }

    // Filter from all customers (not just displayed ones) when searching
    const filtered = customers
      .filter(
        (customer) =>
          customer.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
          customer.id.toLowerCase().includes(customerQuery.toLowerCase())
      )
      .map((customer) => ({
        id: customer.id,
        name: customer.name,
      }));

    return filtered;
  }, [customers, displayedCustomers, customerQuery]);

  // Customer options for the combobox
  const customerOptions = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone_number: customer.phone_number,
  }));

  // --- Actions ---

  const handleCancelInvoiceClick = () => {
    if (!invoiceData || invoiceData.invoice_status === "cancelled") return;
    setShowCancelConfirm(true);
  };

  const handleConfirmCancelInvoice = async () => {
    if (!invoiceData || isCancelling) return;

    setIsCancelling(true);
    setShowCancelConfirm(false);
    const toastId = toast.loading("Cancelling invoice...");

    try {
      const cancelledInvoiceData = await cancelInvoice(invoiceData.id);

      // Preserve the products array when updating the state
      setInvoiceData((prevData) => {
        if (!prevData) return cancelledInvoiceData;

        return {
          ...cancelledInvoiceData,
          products: prevData.products, // Keep the existing products array
        };
      });

      toast.success("Invoice cancelled successfully.", { id: toastId });
      setShowPaymentForm(false); // Hide payment form
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel invoice", { id: toastId });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitEInvoiceClick = () => {
    if (!invoiceData) return;

    // Check for TIN and ID
    if (!invoiceData.customerTin || !invoiceData.customerIdNumber) {
      toast.error("Customer must have TIN Number and ID Number defined");
      return;
    }

    const isEligibleDate = isInvoiceDateEligibleForEinvoice(
      invoiceData.createddate
    );
    if (!isEligibleDate) {
      toast.error(
        "Cannot submit e-invoice: Invoice must be created within the last 3 days."
      );
      return;
    }

    // Show confirmation dialog
    setShowSubmitEInvoiceConfirm(true);
  };

  const handleConfirmSubmitEInvoice = async () => {
    if (!invoiceData || isSubmittingInvoice) return;

    // Close the confirmation dialog
    setShowSubmitEInvoiceConfirm(false);

    // Show the submission results modal with loading state
    setSubmissionResults(null);
    setIsSubmittingInvoice(true);
    setIsSubmittingEInvoice(true);
    setShowSubmissionResults(true);

    try {
      // Call the backend e-invoice submission endpoint with the current invoice ID
      const response = await api.post("/api/einvoice/submit", {
        invoiceIds: [invoiceData.id],
      });

      // Save the result for the modal
      setSubmissionResults(response);

      // Process response - still show toast for quick feedback
      if (response.success) {
        toast.success("e-Invoice submitted successfully");
        // Refresh invoice data to show updated status
        await fetchDetails();
      } else {
        const errorMessage = response.message || "Failed to submit e-invoice";
        toast.error(errorMessage);
      }
    } catch (error: any) {
      console.error("Error submitting e-invoice:", error);
      toast.error(
        `Failed to submit e-invoice: ${error.message || "Unknown error"}`
      );
      setShowSubmissionResults(false); // Hide modal on network error
    } finally {
      setIsSubmittingInvoice(false);
      setIsSubmittingEInvoice(false);
    }
  };

  const handlePrintInvoice = () => {
    if (invoiceData) {
      setIsPrinting(true);
    }
  };

  const handlePrintComplete = () => {
    setIsPrinting(false);
  };

  const handleSyncCancellationStatus = async () => {
    if (!invoiceData) return;

    setIsSyncingCancellation(true);
    const toastId = toast.loading("Syncing cancellation status...");

    try {
      const response = await syncCancellationStatus(invoiceData.id);

      if (response.success) {
        toast.success(
          response.message || "Cancellation status synced successfully",
          { id: toastId }
        );
        // Refresh invoice details
        fetchDetails();
      } else {
        toast.error(response.message || "Failed to sync cancellation status", {
          id: toastId,
        });
      }
    } catch (error) {
      console.error("Error syncing cancellation status:", error);
      toast.error("Failed to sync cancellation status", { id: toastId });
    } finally {
      setIsSyncingCancellation(false);
    }
  };

  // Load more customers function
  const handleLoadMoreCustomers = useCallback(() => {
    if (isLoadingMoreCustomers || !hasMoreCustomers) return;

    setIsLoadingMoreCustomers(true);

    // Simulate loading delay (remove in production if not needed)
    setTimeout(() => {
      const nextPage = customerPage + 1;
      const startIndex = (nextPage - 1) * CUSTOMERS_PER_PAGE;
      const endIndex = startIndex + CUSTOMERS_PER_PAGE;

      const moreCustomers = customers
        .slice(startIndex, endIndex)
        .map((customer) => ({
          id: customer.id,
          name: customer.name,
        }));

      setDisplayedCustomers((prev) => [...prev, ...moreCustomers]);
      setCustomerPage(nextPage);
      setHasMoreCustomers(endIndex < customers.length);
      setIsLoadingMoreCustomers(false);
    }, 300);
  }, [customers, customerPage, isLoadingMoreCustomers, hasMoreCustomers]);

  const handleCustomerUpdate = async (): Promise<void> => {
    if (!selectedCustomer || selectedCustomer.id === invoiceData?.customerid) {
      setIsEditingCustomer(false);
      return;
    }

    // Check if this requires e-invoice cancellation confirmation
    const requiresConfirmation =
      invoiceData?.einvoice_status !== null &&
      invoiceData?.einvoice_status !== "cancelled";

    if (requiresConfirmation) {
      // Show confirmation dialog first
      setEInvoiceCancelAction({
        type: "customer",
        data: { customerid: selectedCustomer.id },
      });
      setShowEInvoiceCancelConfirm(true);
      return;
    }

    // Proceed directly if no confirmation needed
    await performCustomerUpdate(false);
  };

  const performCustomerUpdate = async (
    confirmEInvoiceCancellation: boolean
  ): Promise<void> => {
    if (!selectedCustomer) return;

    setIsUpdatingCustomer(true);
    try {
      const response = await api.put(
        `/api/invoices/${invoiceData?.id}/customer`,
        {
          customerid: selectedCustomer.id,
          confirmEInvoiceCancellation,
        }
      );

      toast.success("Customer updated successfully");
      if (response.einvoiceCleared) {
        toast(
          "E-invoice has been cancelled at MyInvois. Please resubmit after all changes are complete."
        );
      }

      setIsEditingCustomer(false);
      setSelectedCustomer(null);
      setCustomerQuery("");

      // Refresh invoice data
      await fetchDetails();
    } catch (error) {
      console.error("Error updating customer:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update customer";
      toast.error(errorMessage);
    } finally {
      setIsUpdatingCustomer(false);
    }
  };

  const handleSalesmanUpdate = async (): Promise<void> => {
    if (!selectedSalesman || selectedSalesman === invoiceData?.salespersonid) {
      setIsEditingSalesman(false);
      return;
    }

    setIsUpdatingSalesman(true);
    try {
      await api.put(`/api/invoices/${invoiceData?.id}/salesman`, {
        salespersonid: selectedSalesman,
      });

      toast.success("Salesman updated successfully");
      setIsEditingSalesman(false);
      setSelectedSalesman("");

      // Refresh invoice data
      await fetchDetails();
    } catch (error) {
      console.error("Error updating salesman:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update salesman";
      toast.error(errorMessage);
    } finally {
      setIsUpdatingSalesman(false);
    }
  };

  const handleOpenSalesmanEdit = () => {
    setIsEditingSalesman(true);
    setSelectedSalesman(invoiceData?.salespersonid || "");
  };

  // Function to handle opening the edit modal
  const handleOpenCustomerEdit = () => {
    setIsEditingCustomer(true);
    // Set the current customer as selected
    const currentCustomer = customers.find(
      (c) => c.id === invoiceData?.customerid
    );
    if (currentCustomer) {
      setSelectedCustomer({
        id: currentCustomer.id,
        name: currentCustomer.name,
      });
    }
    setCustomerQuery("");
  };

  // Payment Type Update Handlers
  const handlePaymentTypeUpdate = async (): Promise<void> => {
    if (
      !selectedPaymentType ||
      selectedPaymentType === invoiceData?.paymenttype
    ) {
      setIsEditingPaymentType(false);
      return;
    }

    setIsUpdatingPaymentType(true);
    const toastId = toast.loading("Updating payment type...");

    try {
      const response = await api.put(
        `/api/invoices/${invoiceData?.id}/paymenttype`,
        {
          paymenttype: selectedPaymentType,
        }
      );

      if (selectedPaymentType === "CASH") {
        toast.success(
          `Payment type updated to CASH - automatic payment created`,
          { id: toastId }
        );
      } else {
        toast.success(
          `Payment type updated to INVOICE - automatic payment cancelled`,
          { id: toastId }
        );
      }

      setIsEditingPaymentType(false);
      setSelectedPaymentType("INVOICE");

      // Refresh invoice data to show updated payment records
      await fetchDetails();
    } catch (error) {
      console.error("Error updating payment type:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to update payment type";
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsUpdatingPaymentType(false);
    }
  };

  const handleOpenPaymentTypeEdit = (): void => {
    setIsEditingPaymentType(true);
    setSelectedPaymentType(invoiceData?.paymenttype || "INVOICE");
  };

  // Date/Time Update Handlers
  const handleDateTimeUpdate = async (): Promise<void> => {
    if (!selectedDateTime || !invoiceData) {
      setIsEditingDateTime(false);
      return;
    }

    // Convert datetime-local to epoch timestamp
    const newTimestamp = new Date(selectedDateTime).getTime();
    const currentTimestamp = parseInt(invoiceData.createddate);

    if (newTimestamp === currentTimestamp) {
      setIsEditingDateTime(false);
      return;
    }

    // Check if this requires e-invoice cancellation confirmation
    const requiresConfirmation =
      invoiceData?.einvoice_status !== null &&
      invoiceData?.einvoice_status !== "cancelled";

    if (requiresConfirmation) {
      // Show confirmation dialog first
      setEInvoiceCancelAction({
        type: "datetime",
        data: { createddate: newTimestamp.toString() },
      });
      setShowEInvoiceCancelConfirm(true);
      return;
    }

    // Proceed directly if no confirmation needed
    await performDateTimeUpdate(false);
  };

  const performDateTimeUpdate = async (
    confirmEInvoiceCancellation: boolean
  ): Promise<void> => {
    if (!selectedDateTime || !invoiceData) return;

    const newTimestamp = new Date(selectedDateTime).getTime();

    setIsUpdatingDateTime(true);
    try {
      const response = await api.put(
        `/api/invoices/${invoiceData.id}/datetime`,
        {
          createddate: newTimestamp.toString(),
          confirmEInvoiceCancellation,
        }
      );

      toast.success("Date/time updated successfully");
      if (response.einvoiceCleared) {
        toast(
          "E-invoice has been cancelled at MyInvois. Please resubmit after all changes are complete."
        );
      }

      setIsEditingDateTime(false);
      setSelectedDateTime("");

      // Refresh invoice data
      await fetchDetails();
    } catch (error) {
      console.error("Error updating date/time:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update date/time";
      toast.error(errorMessage);
    } finally {
      setIsUpdatingDateTime(false);
    }
  };

  const handleOpenDateTimeEdit = (): void => {
    setIsEditingDateTime(true);

    // Convert epoch timestamp to datetime-local format
    if (invoiceData?.createddate) {
      const date = new Date(parseInt(invoiceData.createddate));
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");

      setSelectedDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
  };

  const handleConfirmEInvoiceCancellation = async (): Promise<void> => {
    if (!eInvoiceCancelAction) return;

    setShowEInvoiceCancelConfirm(false);

    try {
      if (eInvoiceCancelAction.type === "customer") {
        await performCustomerUpdate(true);
      } else if (eInvoiceCancelAction.type === "datetime") {
        await performDateTimeUpdate(true);
      } else if (eInvoiceCancelAction.type === "orderdetails") {
        await performOrderDetailsUpdate(true);
      }
    } finally {
      setEInvoiceCancelAction(null);
    }
  };

  const handleCancelEInvoiceCancellation = (): void => {
    setShowEInvoiceCancelConfirm(false);
    setEInvoiceCancelAction(null);

    // Reset any editing states
    if (eInvoiceCancelAction?.type === "customer") {
      setIsEditingCustomer(false);
      setSelectedCustomer(null);
      setCustomerQuery("");
    } else if (eInvoiceCancelAction?.type === "datetime") {
      setIsEditingDateTime(false);
      setSelectedDateTime("");
    } else if (eInvoiceCancelAction?.type === "orderdetails") {
      setIsEditingOrderDetails(false);
      setEditedProducts([]);
    }
  };

  // Clear E-Invoice Status Handler
  const handleClearEInvoiceClick = () => {
    if (!invoiceData) return;

    // Check if there's e-invoice data to clear
    if (
      !invoiceData.uuid &&
      !invoiceData.submission_uid &&
      !invoiceData.einvoice_status
    ) {
      toast.error("No e-invoice data to clear");
      return;
    }

    setShowClearEInvoiceConfirm(true);
  };

  const handleConfirmClearEInvoice = async () => {
    if (!invoiceData || isClearingEInvoice) return;

    setIsClearingEInvoice(true);
    setShowClearEInvoiceConfirm(false);
    const toastId = toast.loading("Clearing e-invoice status...");

    try {
      const response = await api.post(
        `/api/einvoice/clear-status/${invoiceData.id}`
      );

      if (response.success) {
        toast.success("E-invoice status cleared successfully", { id: toastId });
        await fetchDetails(); // Refresh invoice data
      } else {
        toast.error(response.message || "Failed to clear e-invoice status", {
          id: toastId,
        });
      }
    } catch (error: any) {
      console.error("Error clearing e-invoice status:", error);
      toast.error(
        error.response?.data?.message ||
          error.message ||
          "Failed to clear e-invoice status",
        { id: toastId }
      );
    } finally {
      setIsClearingEInvoice(false);
    }
  };

  // Order Details Update Handlers
  const handleOrderDetailsUpdate = async (): Promise<void> => {
    if (!editedProducts || !invoiceData) {
      setIsEditingOrderDetails(false);
      return;
    }

    // Check if this requires e-invoice cancellation confirmation
    const requiresConfirmation =
      invoiceData?.einvoice_status !== null &&
      invoiceData?.einvoice_status !== "cancelled";

    if (requiresConfirmation) {
      // Show confirmation dialog first
      setEInvoiceCancelAction({
        type: "orderdetails" as any,
        data: { products: editedProducts },
      });
      setShowEInvoiceCancelConfirm(true);
      return;
    }

    // Proceed directly if no confirmation needed
    await performOrderDetailsUpdate(false);
  };

  const performOrderDetailsUpdate = async (
    confirmEInvoiceCancellation: boolean
  ): Promise<void> => {
    if (!editedProducts || !invoiceData) return;

    setIsUpdatingOrderDetails(true);
    try {
      const response = await api.put(
        `/api/invoices/${invoiceData.id}/order-details`,
        {
          products: editedProducts,
          confirmEInvoiceCancellation,
        }
      );

      toast.success("Order details updated successfully");
      if (response.einvoiceCleared) {
        toast(
          "E-invoice has been cancelled at MyInvois. Please resubmit after all changes are complete."
        );
      }

      setIsEditingOrderDetails(false);
      setEditedProducts([]);

      // Refresh invoice data
      await fetchDetails();
    } catch (error) {
      console.error("Error updating order details:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to update order details";
      toast.error(errorMessage);
    } finally {
      setIsUpdatingOrderDetails(false);
    }
  };

  const handleOpenOrderDetailsEdit = (): void => {
    setIsEditingOrderDetails(true);
    // Deep copy the products to avoid modifying the original
    setEditedProducts(
      invoiceData?.products.map((product) => ({
        ...product,
        uid: product.uid || crypto.randomUUID(),
      })) || []
    );
  };

  const handleLineItemsChange = useCallback((updatedItems: ProductItem[]) => {
    const itemsWithUid = updatedItems.map((item) => ({
      ...item,
      uid: item.uid || crypto.randomUUID(),
    }));

    let runningTotal = 0;
    const recalculatedItems = itemsWithUid.map((item) => {
      if (!item.issubtotal && !item.istotal) {
        const itemTotal = parseFloat(item.total || "0");
        runningTotal += itemTotal;
        return item;
      } else if (item.issubtotal) {
        return { ...item, total: runningTotal.toFixed(2) };
      }
      return item;
    });

    setEditedProducts(recalculatedItems);
  }, []);

  const handleAddOrderDetailRow = () => {
    if (!editedProducts) return;
    const newRow: ProductItem = {
      uid: crypto.randomUUID(),
      code: "",
      description: "",
      quantity: 1,
      price: 0,
      freeProduct: 0,
      returnProduct: 0,
      tax: 0,
      total: "0.00",
      issubtotal: false,
    };
    handleLineItemsChange([...editedProducts, newRow]);
  };

  const handleAddOrderDetailSubtotal = () => {
    if (!editedProducts) return;
    let runningTotal = 0;
    for (let i = editedProducts.length - 1; i >= 0; i--) {
      const item = editedProducts[i];
      if (item.issubtotal) break;
      if (!item.istotal) {
        runningTotal += parseFloat(item.total || "0");
      }
    }
    const subtotalRow: ProductItem = {
      uid: crypto.randomUUID(),
      code: "SUBTOTAL",
      description: "Subtotal",
      quantity: 0,
      price: 0,
      freeProduct: 0,
      returnProduct: 0,
      tax: 0,
      total: runningTotal.toFixed(2),
      issubtotal: true,
    };
    handleLineItemsChange([...editedProducts, subtotalRow]);
  };

  // --- Payment Form Handling ---
  const handlePaymentFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setPaymentFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? parseFloat(value) || 0 : value,
    }));
  };

  const handlePaymentMethodChange = (value: string) => {
    setPaymentFormData((prev) => ({
      ...prev,
      payment_method: value as Payment["payment_method"],
      payment_reference: value === "cash" ? undefined : prev.payment_reference, // Clear ref if not needed
    }));
  };

  // UUID Update Handlers
  const handleUUIDUpdate = async (): Promise<void> => {
    if (!selectedUUID.trim() || !invoiceData) {
      setIsEditingUUID(false);
      return;
    }

    setIsUpdatingUUID(true);
    try {
      await api.put(`/api/invoices/${invoiceData.id}/uuid`, {
        uuid: selectedUUID.trim(),
      });

      toast.success("UUID updated successfully");
      setIsEditingUUID(false);
      setSelectedUUID("");

      // Refresh invoice data
      await fetchDetails();
    } catch (error) {
      console.error("Error updating UUID:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update UUID";
      toast.error(errorMessage);
    } finally {
      setIsUpdatingUUID(false);
    }
  };

  const handleOpenUUIDEdit = (): void => {
    setIsEditingUUID(true);
    setSelectedUUID(invoiceData?.uuid || "");
  };

  const validatePaymentForm = (): boolean => {
    if (!paymentFormData.payment_date) {
      toast.error("Payment date is required");
      return false;
    }
    if (paymentFormData.amount_paid <= 0) {
      toast.error("Payment amount must be positive");
      return false;
    }
    // Use a small tolerance for floating point comparison
    const balanceTolerance = 0.001;
    if (
      invoiceData &&
      paymentFormData.amount_paid > invoiceData.balance_due + balanceTolerance
    ) {
      toast.error(
        `Payment amount cannot exceed balance due (${formatCurrency(
          invoiceData.balance_due
        )})`
      );
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
    if (!validatePaymentForm() || !invoiceData || isProcessingPayment) return;

    setIsProcessingPayment(true);
    const toastId = toast.loading("Recording payment...");

    // Ensure amount paid doesn't exceed balance due due to potential float issues
    const amountToPay = Math.min(
      paymentFormData.amount_paid,
      invoiceData.balance_due
    );

    const paymentPayload: Omit<Payment, "payment_id" | "created_at"> = {
      invoice_id: invoiceData.id,
      amount_paid: parseFloat(amountToPay.toFixed(2)), // Send rounded value
      payment_date: paymentFormData.payment_date,
      payment_method: paymentFormData.payment_method,
      payment_reference:
        paymentFormData.payment_method === "cash"
          ? undefined
          : paymentFormData.payment_reference?.trim() || undefined,
      notes: paymentFormData.notes?.trim() || undefined,
    };

    try {
      await createPayment(paymentPayload);
      toast.success("Payment recorded successfully.", { id: toastId });
      setShowPaymentForm(false);
      await fetchDetails(); // Refresh invoice and payment data
    } catch (error) {
      // Error toast handled by utility, update main toast
      toast.error("Failed to record payment.", { id: toastId });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleConfirmPaymentClick = (payment: Payment) => {
    if (invoiceData?.invoice_status === "cancelled") {
      toast.error("Cannot confirm payment for a cancelled invoice.");
      return;
    }

    if (payment.status !== "pending") {
      toast.error("Only pending payments can be confirmed.");
      return;
    }

    setPaymentToConfirm(payment);
    setShowConfirmPaymentDialog(true);
  };

  const handleConfirmPaymentConfirm = async () => {
    if (!paymentToConfirm || isConfirmingPayment) return;

    setIsConfirmingPayment(true);
    setShowConfirmPaymentDialog(false);
    const toastId = toast.loading("Confirming payment(s)...");

    try {
      const confirmedPayments = await confirmPayment(
        paymentToConfirm.payment_id
      );
      const successMessage =
        confirmedPayments.length > 1
          ? `${confirmedPayments.length} payments confirmed successfully.`
          : "Payment confirmed successfully.";
      toast.success(successMessage, { id: toastId });
      await fetchDetails(); // Refresh invoice and payment data
    } catch (error) {
      // The error toast is already handled by InvoiceUtils
      toast.dismiss(toastId); // Dismiss the loading toast
    } finally {
      setIsConfirmingPayment(false);
      setPaymentToConfirm(null);
    }
  };

  // --- Delete Payment Handling ---
  const handleCancelPaymentClick = (payment: Payment) => {
    // Rename from handleDeletePaymentClick
    // Prevent cancellation if invoice is cancelled
    if (invoiceData?.invoice_status === "cancelled") {
      toast.error("Cannot cancel payment for a cancelled invoice.");
      return;
    }

    // Also prevent cancellation if payment is already cancelled
    if (payment.status === "cancelled") {
      toast.error("This payment is already cancelled.");
      return;
    }

    setPaymentToCancel(payment);
    setShowCancelPaymentConfirm(true);
  };

  const handleConfirmCancelPayment = async () => {
    if (!paymentToCancel || isCancellingPayment) return;

    setIsCancellingPayment(true);
    setShowCancelPaymentConfirm(false);
    const toastId = toast.loading("Cancelling payment...");

    try {
      await cancelPayment(paymentToCancel.payment_id);
      toast.success("Payment cancelled successfully.", { id: toastId });
      await fetchDetails(); // Refresh invoice and payment data
    } catch (error) {
      toast.error("Failed to cancel payment.", { id: toastId });
    } finally {
      setIsCancellingPayment(false);
      setPaymentToCancel(null);
    }
  };

  // --- Helper function for date check ---
  const isInvoiceDateEligibleForEinvoice = (
    createdDateString: string | undefined | null
  ): boolean => {
    if (!createdDateString) return false;
    const now = Date.now();
    const threeDaysInMillis = 3 * 24 * 60 * 60 * 1000;
    const cutoffTimestamp = now - threeDaysInMillis;
    const invoiceTimestamp = parseInt(createdDateString, 10);
    return !isNaN(invoiceTimestamp) && invoiceTimestamp >= cutoffTimestamp;
  };

  // --- Render Helper ---
  const formatCurrency = (amount: number | string | undefined): string => {
    const num = Number(amount);
    return isNaN(num)
      ? "RM 0.00"
      : num.toLocaleString("en-MY", {
          style: "currency",
          currency: "MYR",
        });
  };

  const getStatusBadgeClass = (
    status: ExtendedInvoiceData["invoice_status"]
  ) => {
    switch (
      status?.toLowerCase() // Use toLowerCase for safety
    ) {
      case "paid":
        return "bg-green-100 text-green-700";
      case "cancelled":
        return "bg-rose-100 text-rose-700";
      case "overdue":
        return "bg-red-100 text-red-700";
      case "active":
      case "unpaid":
      default:
        return "bg-amber-100 text-amber-700";
    }
  };

  const getEInvoiceStatusInfo = (
    status: ExtendedInvoiceData["einvoice_status"]
  ) => {
    switch (status) {
      case "valid":
        return {
          text: "Valid",
          color: "text-green-600",
          icon: IconCircleCheck,
        };
      case "pending":
        return {
          text: "Pending",
          color: "text-yellow-600",
          icon: IconClockHour4,
        };
      case "invalid":
        return {
          text: "Invalid",
          color: "text-red-600",
          icon: IconAlertTriangle,
        };
      case "cancelled":
        return { text: "Cancelled", color: "text-rose-600", icon: IconBan };
      default:
        return null;
    }
  };

  const getConsolidatedStatusInfo = (consolidatedInfo: any) => {
    if (!consolidatedInfo) return null;

    // Only show for valid consolidated invoices - adjust based on your requirements
    if (consolidatedInfo.einvoice_status !== "valid") return null;

    return {
      text: "Consolidated",
      color: "text-indigo-600",
      border: "border-indigo-200",
      icon: IconFiles,
      info: consolidatedInfo,
    };
  };

  // --- Render Logic ---
  if (isLoading && !invoiceData) {
    // Show full page spinner only on initial load
    return (
      <div className="mt-40 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <BackButton onClick={() => navigate("/sales/invoice")} />
        <div className="p-4 text-center text-rose-600 bg-rose-50 rounded-lg mt-4">
          Error: {error}
        </div>
      </div>
    );
  }

  if (!invoiceData) {
    return (
      <div className="p-6">
        <BackButton onClick={() => navigate("/sales/invoice")} />
        <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg mt-4">
          Invoice data could not be loaded or invoice not found.
        </div>
      </div>
    );
  }

  // Derived states after data load
  const { date: createdDate } = parseDatabaseTimestamp(invoiceData.createddate);
  const invoiceStatusStyle = getStatusBadgeClass(invoiceData.invoice_status);
  const eInvoiceStatusInfo = getEInvoiceStatusInfo(invoiceData.einvoice_status);
  const EInvoiceIcon = eInvoiceStatusInfo?.icon;
  const consolidatedStatusInfo = getConsolidatedStatusInfo(
    invoiceData.consolidated_part_of
  );
  const ConsolidatedIcon = consolidatedStatusInfo?.icon;
  const isCancelled = invoiceData.invoice_status === "cancelled";
  const isPaid = !isCancelled && invoiceData.balance_due <= 0; // Check balance only if not cancelled
  const isEligibleForEinvoiceByDate = isInvoiceDateEligibleForEinvoice(
    invoiceData.createddate
  );
  const paymentMethodOptions = [
    { id: "cash", name: "Cash" },
    { id: "cheque", name: "Cheque" },
    { id: "bank_transfer", name: "Bank Transfer" },
    { id: "online", name: "Online" },
  ];

  const customerNamesForPDF: Record<string, string> =
    invoiceData.customerid && invoiceData.customerName
      ? { [invoiceData.customerid]: invoiceData.customerName }
      : {};

  return (
    <div className="px-4 md:px-12 pb-8 w-full relative">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/70 flex justify-center items-center z-30">
          <LoadingSpinner />
        </div>
      )}
      <BackButton
        onClick={() => {
          // Check if we came from the list page
          if (location.state?.fromList) {
            navigate(-1); // Use browser back to preserve state
          } else {
            navigate("/sales/invoice");
          }
        }}
        disabled={isLoading}
      />
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
        <h1 className="flex items-center space-x-2 text-2xl font-bold text-default-900 flex-shrink-0 pr-4 flex-wrap">
          <span className="flex items-center">
            <IconFileInvoice size={26} className="mr-2 text-gray-500" />
            Invoice #{invoiceData.paymenttype === "CASH" ? "C" : "I"}
            {invoiceData.id}
          </span>
          {/* Status Badges */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${invoiceStatusStyle}`}
          >
            {invoiceData.invoice_status.charAt(0).toUpperCase() +
              invoiceData.invoice_status.slice(1)}
          </span>
          {eInvoiceStatusInfo && EInvoiceIcon && (
            <a
              href={`https://myinvois.hasil.gov.my/${invoiceData.uuid}/share/${invoiceData.long_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-opacity-10 ${eInvoiceStatusInfo.color} hover:underline`}
              title={`e-Invoice: ${eInvoiceStatusInfo.text}`}
            >
              <EInvoiceIcon size={14} className="mr-1" />
              e-Invoice: {eInvoiceStatusInfo.text}
            </a>
          )}
          {/* Add Consolidated Status Badge */}
          {consolidatedStatusInfo && ConsolidatedIcon && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${consolidatedStatusInfo.color}`}
              title={`Part of consolidated invoice ${consolidatedStatusInfo.info.id}`}
            >
              <ConsolidatedIcon size={14} />
              Consolidated Invoice
            </span>
          )}
        </h1>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-center mt-2 md:mt-0">
          {invoiceData.invoice_status === "cancelled" &&
            invoiceData.uuid &&
            invoiceData.einvoice_status !== "cancelled" && (
              <Button
                onClick={handleSyncCancellationStatus}
                icon={IconRefresh}
                variant="outline"
                color="rose"
                disabled={isSyncingCancellation}
              >
                {isSyncingCancellation ? "Syncing..." : "Sync Cancellation"}
              </Button>
            )}
          {invoiceData.einvoice_status === "pending" ||
            (invoiceData.einvoice_status === "invalid" && (
              <Button
                variant="outline"
                color="orange"
                onClick={handleClearEInvoiceClick}
                disabled={isClearingEInvoice || isCancelled}
                title="Clear E-Invoice Pending Status"
              >
                <span className="flex items-center gap-1">
                  <IconRefresh size={16} />
                  {isClearingEInvoice ? "Clearing..." : "Clear Status"}
                </span>
              </Button>
            ))}
          {!isCancelled &&
            (invoiceData.einvoice_status === null ||
              invoiceData.einvoice_status === "invalid" ||
              invoiceData.einvoice_status === "pending") &&
            invoiceData.customerid &&
            invoiceData.customerTin && (
              <Button
                onClick={handleSubmitEInvoiceClick}
                icon={IconSend}
                variant="outline"
                color="amber"
                size="md"
                disabled={
                  isLoading ||
                  isSubmittingEInvoice ||
                  !isEligibleForEinvoiceByDate
                }
                title={
                  !isEligibleForEinvoiceByDate
                    ? "Invoice must be within the last 3 days to submit"
                    : "Submit for e-Invoicing"
                }
              >
                {isSubmittingEInvoice
                  ? "Submitting..."
                  : invoiceData.einvoice_status === "pending"
                  ? "Update e-Invoice"
                  : "Submit e-Invoice"}
              </Button>
            )}
          {invoiceData.einvoice_status === "valid" && (
            <div className="inline-block">
              <EInvoicePDFHandler
                invoices={invoiceData ? [invoiceData] : []}
                disabled={isLoading}
                size="md"
              />
            </div>
          )}
          {/* Print Button */}
          <Button
            onClick={handlePrintInvoice}
            icon={IconPrinter}
            variant="outline"
            color="default"
            size="md"
            disabled={isLoading || isPrinting || !invoiceData}
          >
            {isPrinting ? "Printing..." : "Print"}
          </Button>

          {/* Download PDF Button */}
          {invoiceData && (
            <PDFDownloadHandler
              invoices={[invoiceData as InvoiceData]}
              customerNames={customerNamesForPDF}
              disabled={isLoading}
            />
          )}
          {!isCancelled && !isPaid && (
            <Button
              onClick={() => setShowPaymentForm(!showPaymentForm)}
              icon={IconCash}
              variant="outline"
              color="sky"
              size="md"
              disabled={isLoading}
            >
              {showPaymentForm ? "Cancel Payment" : "Record Payment"}
            </Button>
          )}
          {!isCancelled && (
            <Button
              onClick={handleCancelInvoiceClick}
              variant="outline"
              color="rose"
              size="md"
              disabled={isCancelling || isLoading}
              icon={IconBan}
            >
              {isCancelling ? "Cancelling..." : "Cancel"}
            </Button>
          )}
        </div>
      </div>
      {/* Payment form */}
      {showPaymentForm && !isCancelled && !isPaid && (
        <div className="bg-sky-50 p-4 md:p-6 rounded-lg mb-6 border border-sky-200 shadow-sm transition-all duration-300 ease-out">
          <h2 className="text-lg font-semibold text-sky-800 mb-4">
            Record Payment
          </h2>
          <form onSubmit={handleSubmitPayment}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <FormInput
                name="payment_date"
                label="Payment Date"
                type="date"
                value={paymentFormData.payment_date}
                onChange={handlePaymentFormChange}
                disabled={isProcessingPayment}
              />
              <FormInput
                name="amount_paid"
                label="Amount Paid (RM)"
                type="number"
                value={paymentFormData.amount_paid}
                onChange={handlePaymentFormChange}
                step="0.01"
                min={0.01}
                max={invoiceData.balance_due}
                disabled={isProcessingPayment}
              />
              <FormListbox
                name="payment_method"
                label="Payment Method"
                value={paymentFormData.payment_method}
                onChange={handlePaymentMethodChange}
                options={paymentMethodOptions}
              />
              {(paymentFormData.payment_method === "cheque" ||
                paymentFormData.payment_method === "bank_transfer" ||
                paymentFormData.payment_method === "online") && (
                <FormInput
                  name="payment_reference"
                  label={
                    paymentFormData.payment_method === "cheque"
                      ? "Cheque Number"
                      : paymentFormData.payment_method === "online"
                      ? "Transaction ID"
                      : "Transaction Ref"
                  }
                  value={paymentFormData.payment_reference || ""}
                  onChange={handlePaymentFormChange}
                  disabled={isProcessingPayment}
                />
              )}
            </div>
            <div className="mt-4">
              <FormInput
                name="notes"
                label="Notes (Optional)"
                value={paymentFormData.notes || ""}
                onChange={handlePaymentFormChange}
                disabled={isProcessingPayment}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPaymentForm(false)}
                disabled={isProcessingPayment}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="filled"
                color="sky"
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? "Processing..." : "Confirm Payment"}
              </Button>
            </div>
          </form>
        </div>
      )}
      {/* Main Content Sections */}
      <div className="space-y-5">
        {/* Invoice Header Display */}
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">
            Invoice Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-y-5 gap-x-6 text-sm">
            <div className="flex flex-col group">
              <span className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-1">
                Customer
              </span>
              <div className="flex items-center">
                <span
                  className="text-gray-900 font-medium hover:text-sky-900 hover:underline cursor-pointer"
                  title={`${invoiceData.customerName} (${invoiceData.customerid})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/catalogue/customer/${invoiceData.customerid}`);
                  }}
                >
                  {invoiceData.customerName || invoiceData.customerid}
                </span>
                <button
                  className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenCustomerEdit();
                  }}
                  title="Edit customer"
                  disabled={isLoading}
                >
                  <IconPencil size={14} className="text-sky-600" />
                </button>
              </div>
            </div>
            <div className="flex flex-col group">
              <span className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-1">
                Salesman
              </span>
              <div className="flex items-center">
                <span
                  className="text-gray-900 font-medium hover:text-sky-900 hover:underline cursor-pointer"
                  title={invoiceData.salespersonid}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/catalogue/staff/${invoiceData.salespersonid}`);
                  }}
                >
                  {salesmen.find((s) => s.id === invoiceData.salespersonid)
                    ?.name || invoiceData.salespersonid}
                </span>
                <button
                  className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenSalesmanEdit();
                  }}
                  title="Edit salesman"
                  disabled={isLoading}
                >
                  <IconPencil size={14} className="text-sky-600" />
                </button>
              </div>
            </div>
            <div className="flex flex-col group">
              <span className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-1">
                Date / Time
              </span>
              <div className="flex items-center">
                <span className="flex text-gray-900 font-medium gap-2">
                  <span>{formatDisplayDate(createdDate)}</span>
                  <span className="text-gray-600">
                    {parseDatabaseTimestamp(
                      invoiceData.createddate
                    ).date?.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    }) || ""}
                  </span>
                </span>
                <button
                  className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenDateTimeEdit();
                  }}
                  title="Edit date/time"
                  disabled={isLoading}
                >
                  <IconPencil size={14} className="text-sky-600" />
                </button>
              </div>
            </div>

            {/* Payment Type with edit functionality */}
            <div className="flex flex-col group">
              <span className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-1">
                Payment Type
              </span>
              <div className="flex items-center">
                <span className="text-gray-900 font-medium capitalize">
                  {invoiceData.paymenttype.toLowerCase()}
                </span>
                <button
                  className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenPaymentTypeEdit();
                  }}
                  title="Edit payment type"
                  disabled={isLoading}
                >
                  <IconPencil size={14} className="text-sky-600" />
                </button>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-1">
                Balance Due
              </span>
              <div className="flex items-center">
                <span
                  className={`font-semibold text-base ${
                    isPaid || isCancelled
                      ? "text-green-600"
                      : invoiceData.invoice_status === "overdue"
                      ? "text-red-600"
                      : "text-amber-600"
                  }`}
                >
                  {formatCurrency(invoiceData.balance_due)}
                </span>
                {isPaid && !isCancelled && (
                  <span className="ml-2 text-green-600 text-sm font-medium px-2 py-0.5 bg-green-50 rounded-full">
                    Paid in Full
                  </span>
                )}
                {isCancelled && (
                  <span className="ml-2 text-rose-600 text-sm font-medium px-2 py-0.5 bg-rose-50 rounded-full">
                    Cancelled
                  </span>
                )}
              </div>
            </div>
            {/* Manual UUID Input - Only show for null einvoice_status and on hover */}
            {invoiceData.einvoice_status === null && (
              <div className="flex flex-col group opacity-0 hover:opacity-100 transition-opacity duration-300">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">
                  Manual UUID
                </span>
                <div className="flex items-center">
                  <span className="text-gray-600 font-mono text-sm break-all">
                    {invoiceData.uuid || "No UUID set"}
                  </span>
                  <button
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenUUIDEdit();
                    }}
                    title="Set UUID manually"
                    disabled={isLoading}
                  >
                    <IconPencil size={14} className="text-sky-600" />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Use this to manually set UUID if e-invoice submission didn't
                  record it properly
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Line Items Display */}
        <section className="p-4 group border rounded-lg bg-white shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-800  flex items-center">
              Line Items
            </h2>
            <button
              className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-sky-100 rounded"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenOrderDetailsEdit();
              }}
              title="Edit line items"
              disabled={isLoading}
            >
              <IconPencil size={16} className="text-sky-600" />
            </button>
          </div>
          <LineItemsDisplayTable items={invoiceData.products} />
        </section>

        {/* Totals Display */}
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <InvoiceTotals
            subtotal={invoiceData.total_excluding_tax}
            taxTotal={invoiceData.tax_amount}
            rounding={invoiceData.rounding}
            grandTotal={invoiceData.totalamountpayable}
            onRoundingChange={() => {}}
            readOnly={true}
          />
        </section>

        {/* E-Invoice Details */}
        {(invoiceData.uuid ||
          invoiceData.einvoice_status ||
          invoiceData.consolidated_part_of) && (
          <section className="p-4 border rounded-lg bg-white shadow-sm">
            <h2 className="text-lg font-semibold mb-3 text-gray-800">
              {(invoiceData.einvoice_status === "valid" ||
                invoiceData.einvoice_status === "cancelled") &&
              invoiceData.long_id ? (
                <a
                  href={`https://myinvois.hasil.gov.my/${invoiceData.uuid}/share/${invoiceData.long_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sky-600 hover:underline"
                  title="View in MyInvois Portal"
                >
                  E-Invoice Details
                </a>
              ) : consolidatedStatusInfo?.info?.long_id ? (
                <a
                  href={`https://myinvois.hasil.gov.my/${consolidatedStatusInfo.info.uuid}/share/${consolidatedStatusInfo.info.long_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sky-600 hover:underline"
                  title="View Consolidated Invoice in MyInvois Portal"
                >
                  E-Invoice Details
                </a>
              ) : (
                "E-Invoice Details"
              )}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {invoiceData.uuid && (
                <p>
                  <strong className="text-gray-500 font-medium w-24 inline-block">
                    UUID:
                  </strong>
                  <span className="font-mono text-sm break-all">
                    {invoiceData.uuid}
                  </span>
                </p>
              )}
              {invoiceData.long_id && (
                <p>
                  <strong className="text-gray-500 font-medium w-24 inline-block">
                    Long ID:
                  </strong>
                  <span className="font-mono text-sm break-all">
                    {invoiceData.long_id}
                  </span>
                </p>
              )}
              {invoiceData.submission_uid && (
                <p>
                  <strong className="text-gray-500 font-medium w-24 inline-block">
                    Submission:
                  </strong>
                  <span className="font-mono text-sm break-all">
                    {invoiceData.submission_uid}
                  </span>
                </p>
              )}
              {invoiceData.datetime_validated && (
                <p>
                  <strong className="text-gray-500 font-medium w-24 inline-block">
                    Validated:
                  </strong>
                  {formatDisplayDate(new Date(invoiceData.datetime_validated))}{" "}
                  {new Date(invoiceData.datetime_validated).toLocaleTimeString(
                    "en-US",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                    }
                  )}
                </p>
              )}
              {!consolidatedStatusInfo && (
                <p>
                  <strong className="text-gray-500 font-medium w-24 inline-block">
                    Status:
                  </strong>
                  {eInvoiceStatusInfo ? (
                    <span className={`font-medium ${eInvoiceStatusInfo.color}`}>
                      {eInvoiceStatusInfo.text}
                    </span>
                  ) : (
                    <span className="text-gray-500">Not Submitted</span>
                  )}
                </p>
              )}
              {consolidatedStatusInfo && (
                <>
                  <p>
                    <strong className="text-gray-500 font-medium w-24 inline-block">
                      Invoice ID:
                    </strong>
                    <span className="font-medium">
                      {consolidatedStatusInfo.info.id}
                    </span>
                  </p>
                  {consolidatedStatusInfo.info.uuid && (
                    <p>
                      <strong className="text-gray-500 font-medium w-24 inline-block">
                        UUID:
                      </strong>
                      <span className="font-mono text-sm break-all">
                        {consolidatedStatusInfo.info.uuid}
                      </span>
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* Payment History */}
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">
            Payment History
          </h2>
          {payments.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No payments recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-[12%]">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-[12%]">
                      Method
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-[15%]">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Notes
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase tracking-wider w-[12%]">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase tracking-wider w-[15%]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {payments.map((p) => (
                    <tr
                      key={p.payment_id}
                      className={`hover:bg-gray-50 transition-colors ${
                        p.status === "cancelled"
                          ? "bg-gray-50 text-gray-400 line-through"
                          : p.status === "pending"
                          ? "bg-yellow-50"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDisplayDate(new Date(p.payment_date))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 capitalize">
                          {p.payment_method.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-sm text-gray-600">
                        <div className="flex items-center">
                          <span>{p.payment_reference || "-"}</span>
                          {p.payment_reference && p.status != "cancelled" && (
                            <LinkedPaymentsTooltip
                              paymentReference={p.payment_reference}
                              currentInvoiceId={invoiceId}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            p.status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : p.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {p.status === "cancelled"
                            ? "Cancelled"
                            : p.status === "pending"
                            ? "Pending"
                            : "Paid"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 truncate max-w-xs">
                        {p.notes || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-green-600">
                        {formatCurrency(p.amount_paid)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-1">
                          {p.status === "cancelled" ? (
                            <span className="italic text-gray-500 text-sm">
                              Cancelled
                            </span>
                          ) : p.status === "pending" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                color="sky"
                                onClick={() => handleConfirmPaymentClick(p)}
                                disabled={isConfirmingPayment || isCancelled}
                                title="Confirm Payment"
                              >
                                <span className="flex items-center gap-1">
                                  <IconCircleCheck size={16} /> Paid
                                </span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                color="rose"
                                onClick={() => handleCancelPaymentClick(p)}
                                disabled={isCancellingPayment || isCancelled}
                                title="Cancel Payment"
                              >
                                <span className="flex items-center gap-1">
                                  <IconTrash size={16} />
                                </span>
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              color="rose"
                              onClick={() => handleCancelPaymentClick(p)}
                              disabled={isCancellingPayment || isCancelled}
                              title="Cancel Payment"
                            >
                              <span className="flex items-center gap-1">
                                <IconTrash size={16} /> Delete
                              </span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {/* --- Submission Results Modal --- */}
      <SubmissionResultsModal
        isOpen={showSubmissionResults}
        onClose={() => setShowSubmissionResults(false)}
        results={submissionResults}
        isLoading={isSubmittingInvoice}
      />
      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={showSubmitEInvoiceConfirm}
        onClose={() => setShowSubmitEInvoiceConfirm(false)}
        onConfirm={handleConfirmSubmitEInvoice}
        title="Submit Invoice for e-Invoicing"
        message={
          invoiceData.einvoice_status === "pending"
            ? "You are about to update this invoice in the MyInvois e-invoicing system. Continue?"
            : "You are about to submit this invoice to the MyInvois e-invoicing system. Continue?"
        }
        confirmButtonText={
          isSubmittingEInvoice
            ? "Submitting..."
            : invoiceData.einvoice_status === "pending"
            ? "Update e-Invoice"
            : "Submit e-Invoice"
        }
        variant="default"
      />
      <ConfirmationDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleConfirmCancelInvoice}
        title="Cancel Invoice"
        message={`Are you sure you want to cancel Invoice #${invoiceData.id}? This action cannot be undone and may attempt to cancel the e-invoice if submitted.`}
        confirmButtonText="Confirm Cancellation"
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showConfirmPaymentDialog}
        onClose={() => setShowConfirmPaymentDialog(false)}
        onConfirm={handleConfirmPaymentConfirm}
        title="Confirm Payment"
        message={`Are you sure you want to confirm this ${
          paymentToConfirm?.payment_method
        } payment of ${formatCurrency(
          paymentToConfirm?.amount_paid
        )}? This will mark the payment as paid and update the invoice balance.`}
        confirmButtonText={
          isConfirmingPayment ? "Confirming..." : "Confirm Payment"
        }
        variant="success"
      />
      <ConfirmationDialog
        isOpen={showCancelPaymentConfirm}
        onClose={() => setShowCancelPaymentConfirm(false)}
        onConfirm={handleConfirmCancelPayment}
        title="Cancel Payment"
        message={`Are you sure you want to cancel this payment of ${formatCurrency(
          paymentToCancel?.amount_paid
        )}? This will increase the invoice balance due.`}
        confirmButtonText={
          isCancellingPayment ? "Cancelling..." : "Cancel Payment"
        }
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showClearEInvoiceConfirm}
        onClose={() => setShowClearEInvoiceConfirm(false)}
        onConfirm={handleConfirmClearEInvoice}
        title="Clear E-Invoice Status"
        message={`Are you sure you want to clear the e-invoice pending status for Invoice #${invoiceData?.id}? This will remove the UUID, submission UID, validation date, and status, allowing the invoice to be resubmitted.`}
        confirmButtonText={isClearingEInvoice ? "Clearing..." : "Clear Status"}
        variant="danger"
      />
      {/* Print PDF Overlay */}
      {isPrinting && invoiceData && (
        <PrintPDFOverlay
          invoices={[invoiceData as InvoiceData]}
          customerNames={customerNamesForPDF}
          onComplete={handlePrintComplete}
        />
      )}
      {/* Order Details Edit Modal */}
      {isEditingOrderDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Line Items
              </h3>
              <button
                onClick={() => {
                  setIsEditingOrderDetails(false);
                  setEditedProducts([]);
                }}
                className="text-gray-400 hover:text-gray-600"
                disabled={isUpdatingOrderDetails}
              >
                <IconX size={20} />
              </button>
            </div>

            <div className="flex-1 px-6 py-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-600">
                  Modify the line items for this invoice
                </span>
                <div>
                  <Button
                    onClick={handleAddOrderDetailSubtotal}
                    variant="outline"
                    size="sm"
                    className="mr-2"
                    disabled={isUpdatingOrderDetails}
                  >
                    Add Subtotal
                  </Button>
                  <Button
                    onClick={handleAddOrderDetailRow}
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingOrderDetails}
                  >
                    Add Item
                  </Button>
                </div>
              </div>

              <LineItemsTable
                items={editedProducts}
                onItemsChange={handleLineItemsChange}
                customerProducts={[]} // You may want to fetch customer products if needed
                productsCache={productsCache.map((product) => ({
                  uid: crypto.randomUUID(),
                  id: product.id,
                  code: product.id,
                  description: product.description,
                  price: product.price_per_unit,
                  quantity: 1,
                  freeProduct: 0,
                  returnProduct: 0,
                  tax: 0,
                  total: "0.00",
                  issubtotal: false,
                }))}
                readOnly={isUpdatingOrderDetails}
              />
            </div>

            <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditingOrderDetails(false);
                  setEditedProducts([]);
                }}
                disabled={isUpdatingOrderDetails}
              >
                Cancel
              </Button>
              <Button
                color="amber"
                onClick={handleOrderDetailsUpdate}
                disabled={isUpdatingOrderDetails || editedProducts.length === 0}
              >
                {isUpdatingOrderDetails ? "Updating..." : "Update Line Items"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Customer Edit Modal */}
      {isEditingCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Change Customer
              </h3>
              <button
                onClick={() => {
                  setIsEditingCustomer(false);
                  setSelectedCustomer(null);
                  setCustomerQuery("");
                }}
                className="text-gray-400 hover:text-gray-600"
                disabled={isUpdatingCustomer}
              >
                <IconX size={20} />
              </button>
            </div>

            <div className="mb-4">
              <CustomerCombobox
                name="customer"
                label="Select New Customer"
                value={selectedCustomer}
                onChange={setSelectedCustomer}
                options={filteredCustomers}
                query={customerQuery}
                setQuery={setCustomerQuery}
                onLoadMore={handleLoadMoreCustomers}
                hasMore={hasMoreCustomers && !customerQuery.trim()} // Hide load more when searching
                isLoading={isLoadingMoreCustomers}
                placeholder="Search customers by name or ID..."
                disabled={isUpdatingCustomer}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditingCustomer(false);
                  setSelectedCustomer(null);
                  setCustomerQuery("");
                }}
                disabled={isUpdatingCustomer}
              >
                Cancel
              </Button>
              <Button
                color="amber"
                onClick={handleCustomerUpdate}
                disabled={isUpdatingCustomer || !selectedCustomer}
                icon={isUpdatingCustomer ? undefined : IconPencil}
              >
                {isUpdatingCustomer ? "Updating..." : "Update Customer"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Salesman Edit Modal */}
      {isEditingSalesman && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Change Salesman
              </h3>
              <button
                onClick={() => {
                  setIsEditingSalesman(false);
                  setSelectedSalesman("");
                }}
                className="text-gray-400 hover:text-gray-600"
                disabled={isUpdatingSalesman}
              >
                <IconX size={20} />
              </button>
            </div>

            <div className="mb-4">
              <FormListbox
                name="salesman"
                label="Select New Salesman"
                value={selectedSalesman}
                onChange={(value) => setSelectedSalesman(value as string)}
                options={salesmen.map((s) => ({
                  id: s.id,
                  name: s.name || s.id,
                }))}
                placeholder="Select a salesman..."
                disabled={isUpdatingSalesman || isLoadingSalesmen}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditingSalesman(false);
                  setSelectedSalesman("");
                }}
                disabled={isUpdatingSalesman}
              >
                Cancel
              </Button>
              <Button
                color="amber"
                onClick={handleSalesmanUpdate}
                disabled={isUpdatingSalesman || !selectedSalesman}
              >
                {isUpdatingSalesman ? "Updating..." : "Update Salesman"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Payment Type Edit Modal */}
      {isEditingPaymentType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Change Payment Type
              </h3>
              <button
                onClick={() => {
                  setIsEditingPaymentType(false);
                  setSelectedPaymentType("INVOICE");
                }}
                className="text-gray-400 hover:text-gray-600"
                disabled={isUpdatingPaymentType}
              >
                <IconX size={20} />
              </button>
            </div>

            <div className="mb-4">
              <FormListbox
                name="paymenttype"
                label="Select Payment Type"
                value={selectedPaymentType}
                onChange={(value) =>
                  setSelectedPaymentType(value as "CASH" | "INVOICE")
                }
                options={[
                  { id: "CASH", name: "Cash" },
                  { id: "INVOICE", name: "Invoice" },
                ]}
                placeholder="Select payment type..."
                disabled={isUpdatingPaymentType}
              />
            </div>

            {/* Warning message about automatic payment handling */}
            {selectedPaymentType !== invoiceData?.paymenttype && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start">
                  <IconAlertTriangle
                    size={16}
                    className="text-amber-600 mt-0.5 mr-2 flex-shrink-0"
                  />
                  <div className="text-sm text-amber-800">
                    {selectedPaymentType === "CASH" ? (
                      <span>
                        <strong>Note:</strong> Changing to CASH will
                        automatically create a payment record for the full
                        amount and mark the invoice as paid. You may cancel the
                        payment after this if needed.
                      </span>
                    ) : (
                      <span>
                        <strong>Note:</strong> Changing to INVOICE will cancel
                        any automatic CASH payment and restore the full balance
                        due.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditingPaymentType(false);
                  setSelectedPaymentType("INVOICE");
                }}
                disabled={isUpdatingPaymentType}
              >
                Cancel
              </Button>
              <Button
                color="amber"
                onClick={handlePaymentTypeUpdate}
                disabled={isUpdatingPaymentType || !selectedPaymentType}
              >
                {isUpdatingPaymentType ? "Updating..." : "Update Payment Type"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Date/Time Edit Modal */}
      {isEditingDateTime && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Change Date & Time
              </h3>
              <button
                onClick={() => {
                  setIsEditingDateTime(false);
                  setSelectedDateTime("");
                }}
                className="text-gray-400 hover:text-gray-600"
                disabled={isUpdatingDateTime}
              >
                <IconX size={20} />
              </button>
            </div>

            <div className="mb-4">
              <FormInput
                name="datetime"
                label="Date & Time"
                type="datetime-local"
                value={selectedDateTime}
                onChange={(e) => setSelectedDateTime(e.target.value)}
                disabled={isUpdatingDateTime}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditingDateTime(false);
                  setSelectedDateTime("");
                }}
                disabled={isUpdatingDateTime}
              >
                Cancel
              </Button>
              <Button
                color="amber"
                onClick={handleDateTimeUpdate}
                disabled={isUpdatingDateTime || !selectedDateTime}
              >
                {isUpdatingDateTime ? "Updating..." : "Update Date & Time"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* UUID Edit Modal */}
      {isEditingUUID && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Set Manual UUID
              </h3>
              <button
                onClick={() => {
                  setIsEditingUUID(false);
                  setSelectedUUID("");
                }}
                className="text-gray-400 hover:text-gray-600"
                disabled={isUpdatingUUID}
              >
                <IconX size={20} />
              </button>
            </div>

            <div className="mb-4">
              <FormInput
                name="uuid"
                label="UUID"
                type="text"
                value={selectedUUID}
                onChange={(e) => setSelectedUUID(e.target.value)}
                disabled={isUpdatingUUID}
                placeholder="Enter UUID (e.g., 4RKA7KDV6JM3HVTSQ9S60MZJ10)"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the UUID from MyInvois if the system failed to record it
                automatically
              </p>
            </div>

            {/* Warning message */}
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start">
                <IconAlertTriangle
                  size={16}
                  className="text-amber-600 mt-0.5 mr-2 flex-shrink-0"
                />
                <div className="text-sm text-amber-800">
                  <strong>Warning:</strong> Only use this if the e-invoice was
                  successfully submitted to MyInvois but the UUID wasn't
                  recorded. Setting an incorrect UUID may cause issues with
                  e-invoice operations.
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditingUUID(false);
                  setSelectedUUID("");
                }}
                disabled={isUpdatingUUID}
              >
                Cancel
              </Button>
              <Button
                color="amber"
                onClick={handleUUIDUpdate}
                disabled={isUpdatingUUID || !selectedUUID.trim()}
              >
                {isUpdatingUUID ? "Updating..." : "Set UUID"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* E-Invoice Cancellation Confirmation Dialog */}
      {/* E-Invoice Cancellation Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showEInvoiceCancelConfirm}
        onClose={handleCancelEInvoiceCancellation}
        onConfirm={handleConfirmEInvoiceCancellation}
        title="Cancel E-Invoice Required"
        message={`This invoice has been submitted to MyInvois (Status: ${
          invoiceData?.einvoice_status
        }). Changing ${
          eInvoiceCancelAction?.type === "customer"
            ? "customer information"
            : eInvoiceCancelAction?.type === "datetime"
            ? "date/time"
            : eInvoiceCancelAction?.type === "orderdetails"
            ? "line items"
            : "invoice data"
        } will cancel the e-invoice at MyInvois. You will need to resubmit the e-invoice after making all necessary changes. Do you want to continue?`}
        confirmButtonText="Cancel E-Invoice & Continue"
        variant="danger"
      />
    </div>
  );
};

export default InvoiceDetailsPage;

// src/pages/Invoice/InvoiceFormPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
// --- Other imports ---
import {
  ExtendedInvoiceData,
  ProductItem,
  Customer,
  CustomProduct,
  Payment,
} from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import InvoiceHeader from "../../components/Invoice/InvoiceHeader";
import LineItemsTable from "../../components/Invoice/LineItemsTable";
import InvoiceTotals from "../../components/Invoice/InvoiceTotals";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import { useCustomerData } from "../../hooks/useCustomerData";
import {
  checkDuplicateInvoiceNo,
  createInvoice,
  createPayment,
} from "../../utils/invoice/InvoiceUtils";
import toast from "react-hot-toast";
import { IconSquare, IconSquareCheckFilled } from "@tabler/icons-react";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
// --- MODAL IMPORT ---
import SubmissionResultsModal from "../../components/Invoice/SubmissionResultsModal"; // Adjust path if needed

const InvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();

  // --- State ---
  const [invoiceData, setInvoiceData] = useState<ExtendedInvoiceData | null>(
    null
  );
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSaving, setIsSaving] = useState(false); // Overall saving state
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [customerProducts, setCustomerProducts] = useState<CustomProduct[]>([]);
  const [submitAsEinvoice, setSubmitAsEinvoice] = useState(false);
  const [customerTinNumber, setCustomerTinNumber] = useState<string | null>(
    null
  );
  const [customerIdNumber, setCustomerIdNumber] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<Payment["payment_method"]>("cash");
  const [paymentReference, setPaymentReference] = useState("");

  // --- MODAL STATE ---
  const [isEinvoiceSubmitting, setIsEinvoiceSubmitting] = useState(false); // Specific loading state for e-invoice API call
  interface EinvoiceResult {
    success: boolean;
    message: string;
    rejectedDocuments: any[];
    acceptedDocuments: any[];
    overallStatus: string;
  }

  const [einvoiceResults, setEinvoiceResults] = useState<EinvoiceResult | null>(
    null
  );
  const [isEinvoiceModalOpen, setIsEinvoiceModalOpen] = useState(false);

  // --- Hooks (remain the same) ---
  const { products: productsCache, isLoading: productsLoading } =
    useProductsCache();
  const { salesmen: salesmenCache, isLoading: salesmenLoading } =
    useSalesmanCache();
  const {
    customers,
    selectedCustomer,
    setSelectedCustomer,
    customerQuery,
    setCustomerQuery,
    loadMoreCustomers,
    hasMoreCustomers,
    isFetchingCustomers,
  } = useCustomerData(invoiceData?.customerid);

  // --- Memoized Values (remain the same) ---
  const lineItems = useMemo(
    () => invoiceData?.products || [],
    [invoiceData?.products]
  );

  // --- Effects ---
  useEffect(() => {
    setIsLoadingPage(productsLoading || salesmenLoading);
  }, [productsLoading, salesmenLoading]);

  useEffect(() => {
    if (!isLoadingPage && !invoiceData) {
      // Initialize new invoice data (logic remains the same)
      const newInv: ExtendedInvoiceData = {
        id: "", // User must input
        salespersonid: salesmenCache.length > 0 ? salesmenCache[0].id : "", // Default salesman
        customerid: "",
        createddate: Date.now().toString(),
        paymenttype: "INVOICE", // Default type
        total_excluding_tax: 0,
        tax_amount: 0,
        rounding: 0,
        totalamountpayable: 0,
        balance_due: 0, // Will be calculated on save
        uuid: null,
        submission_uid: null,
        long_id: null,
        datetime_validated: null,
        is_consolidated: false,
        consolidated_invoices: null,
        invoice_status: "active", // Initial status before save/payment
        einvoice_status: null,
        products: [
          {
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
          },
        ],
        customerName: "",
        isEditing: true, // Always true for creation form
      };
      setInvoiceData(newInv);
    }
  }, [isLoadingPage, salesmenCache, invoiceData]);

  useEffect(() => {
    if (invoiceData?.paymenttype === "CASH" && !isPaid) {
      setIsPaid(true);
    }
  }, [invoiceData?.paymenttype, isPaid]);

  const fetchCustomerProducts = useCallback(async (customerId: string) => {
    if (!customerId) {
      setCustomerProducts([]);
      setCustomerTinNumber(null);
      setCustomerIdNumber(null);
      setSubmitAsEinvoice(false); // Reset e-invoice flag if customer cleared
      return [];
    }
    try {
      const response = await api.get(`/api/customer-products/${customerId}`);
      if (response.products) {
        setCustomerProducts(response.products);
        if (response.customer) {
          const hasTin = !!response.customer.tin_number;
          const hasId = !!response.customer.id_number;
          setCustomerTinNumber(hasTin ? response.customer.tin_number : null);
          setCustomerIdNumber(hasId ? response.customer.id_number : null);
          // Only keep e-invoice checked if both are present after fetch
          setSubmitAsEinvoice(hasTin && hasId);
        } else {
          setCustomerTinNumber(null);
          setCustomerIdNumber(null);
          setSubmitAsEinvoice(false); // Disable if customer data structure is wrong
        }
        return response.products;
      } else {
        setCustomerProducts(response);
        setCustomerTinNumber(null); // Legacy handling, assume no TIN/ID
        setCustomerIdNumber(null);
        setSubmitAsEinvoice(false);
        return response;
      }
    } catch (error) {
      console.error("Error fetching customer products:", error);
      toast.error("Could not load custom product prices.");
      setCustomerProducts([]);
      setCustomerTinNumber(null);
      setCustomerIdNumber(null);
      setSubmitAsEinvoice(false); // Disable on error
      return [];
    }
  }, []); // No dependencies needed if api is stable

  useEffect(() => {
    if (invoiceData?.customerid) {
      fetchCustomerProducts(invoiceData.customerid);
    } else {
      setCustomerProducts([]);
      setCustomerTinNumber(null);
      setCustomerIdNumber(null);
      setSubmitAsEinvoice(false); // Reset when no customer ID
    }
  }, [invoiceData?.customerid, fetchCustomerProducts]);

  // Recalculate totals effect (remains the same)
  useEffect(() => {
    if (!invoiceData) return;

    let subtotal = 0;
    let taxTotal = 0;
    invoiceData.products.forEach((item) => {
      if (!item.issubtotal && !item.istotal) {
        subtotal += (Number(item.quantity) || 0) * (Number(item.price) || 0);
        taxTotal += Number(item.tax) || 0;
      }
    });

    const rounding = Number(invoiceData.rounding) || 0;
    const totalPayable = subtotal + taxTotal + rounding;

    if (
      Math.abs(invoiceData.total_excluding_tax - subtotal) > 0.001 ||
      Math.abs(invoiceData.tax_amount - taxTotal) > 0.001 ||
      Math.abs(invoiceData.totalamountpayable - totalPayable) > 0.001
    ) {
      setInvoiceData((prev) =>
        prev
          ? {
              ...prev,
              total_excluding_tax: parseFloat(subtotal.toFixed(2)),
              tax_amount: parseFloat(taxTotal.toFixed(2)),
              totalamountpayable: parseFloat(totalPayable.toFixed(2)),
              balance_due: parseFloat(totalPayable.toFixed(2)), // Set balance initially
            }
          : null
      );
    }
  }, [invoiceData?.products, invoiceData?.rounding]);

  // --- Input & Action Handlers (mostly same) ---

  const handleBackClick = () => {
    // Logic remains the same
    const isFormDirty =
      !!invoiceData?.id ||
      !!invoiceData?.customerid ||
      invoiceData?.products.some(
        (p) => !!p.code || p.quantity !== 1 || p.price !== 0
      );

    if (isFormDirty && !isSaving) {
      setShowBackConfirmation(true);
    } else if (!isSaving) {
      navigate("/sales/invoice");
    }
  };
  const handleConfirmBack = () => {
    // Logic remains the same
    setShowBackConfirmation(false);
    navigate("/sales/invoice");
  };

  const handleHeaderInputChange = useCallback(
    // Logic remains the same
    (field: keyof ExtendedInvoiceData, value: any) => {
      setInvoiceData((prev) => {
        if (!prev) return null;
        if (field === "id" && typeof value === "string") {
          const numberPart =
            value.startsWith("I") || value.startsWith("C")
              ? value.slice(1)
              : value;
          const currentPrefix = prev.paymenttype === "CASH" ? "C" : "I";
          return { ...prev, id: numberPart };
        }
        if (field === "paymenttype") {
          if (value === "CASH") {
            setIsPaid(true);
          }
          // If switching away from CASH, allow unchecking paid status
          // (Optional: could automatically set isPaid to false here too)
          return { ...prev, paymenttype: value };
        }
        return { ...prev, [field]: value };
      });
    },
    [setIsPaid] // Include setIsPaid
  );

  const handleCustomerSelectionChange = useCallback(
    // Logic remains the same
    (customer: Customer | null) => {
      setSelectedCustomer(customer);
      setInvoiceData((prev) =>
        prev
          ? {
              ...prev,
              customerid: customer ? customer.id : "",
              customerName: customer ? customer.name : "",
            }
          : null
      );
      // fetchCustomerProducts is called by the useEffect watching customerid
    },
    [setSelectedCustomer]
  );

  const handleLineItemsChange = useCallback(
    // Logic remains the same
    (updatedItems: ProductItem[]) => {
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

      setInvoiceData((prev) =>
        prev ? { ...prev, products: recalculatedItems } : null
      );
    },
    []
  );

  const handleRoundingChange = useCallback(
    // Logic remains the same
    (newRounding: number) => {
      setInvoiceData((prev) =>
        prev ? { ...prev, rounding: parseFloat(newRounding.toFixed(2)) } : null
      );
    },
    []
  );

  const handleAddRow = () => {
    // Logic remains the same
    if (!invoiceData) return;
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
    handleLineItemsChange([...invoiceData.products, newRow]);
  };

  const handleAddSubtotal = () => {
    // Logic remains the same
    if (!invoiceData) return;
    let runningTotal = 0;
    for (let i = invoiceData.products.length - 1; i >= 0; i--) {
      const item = invoiceData.products[i];
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
    handleLineItemsChange([...invoiceData.products, subtotalRow]);
  };

  // --- MODAL CLOSE HANDLER ---
  const handleCloseEinvoiceModal = () => {
    setIsEinvoiceModalOpen(false);
    // Navigate *after* closing the modal
    if (invoiceData?.id) {
      // Only navigate if we have an ID (creation was successful)
      navigate(`/sales/invoice/${invoiceData.id}`, {
        replace: true,
        state: { previousPath: "/sales/invoice" },
      });
    }
    // Optionally clear results after closing
    // setEinvoiceResults(null);
  };

  // --- UPDATED CREATE INVOICE ---
  const handleCreateInvoice = async () => {
    if (!invoiceData || isSaving) return; // Use overall isSaving for initial block

    // --- Validation (remains the same) ---
    let errors: string[] = [];
    const numberPartId = invoiceData.id;
    if (!numberPartId) errors.push("Invoice Number is required.");
    if (!invoiceData.customerid) errors.push("Customer is required.");
    if (!invoiceData.salespersonid) errors.push("Salesman is required.");
    if (!invoiceData.createddate || isNaN(parseInt(invoiceData.createddate)))
      errors.push("Valid Date/Time is required.");
    const itemsToValidate = lineItems.filter(
      (li) => !li.issubtotal && !li.istotal
    );
    if (itemsToValidate.length === 0) {
      errors.push("Invoice must have at least one product item.");
    } else {
      itemsToValidate.forEach((item, index) => {
        if (!item.code || !item.description)
          errors.push(
            `Item #${index + 1}: Product code and description required.`
          );
        if (Number(item.quantity || 0) <= 0)
          errors.push(`Item #${index + 1}: Quantity must be positive.`);
        if (Number(item.price || 0) < 0)
          errors.push(`Item #${index + 1}: Price cannot be negative.`);
      });
    }
    if (isPaid) {
      if (!paymentMethod) errors.push("Payment Method is required.");
      if (
        (paymentMethod === "cheque" || paymentMethod === "bank_transfer") &&
        !paymentReference
      ) {
        errors.push("Payment Reference is required for Cheque/Bank Transfer.");
      }
    }
    if (errors.length > 0) {
      errors.forEach((err) => toast.error(err, { duration: 4000 }));
      return;
    }

    // --- Start Saving Process ---
    setIsSaving(true); // Set overall saving state
    let invoiceIdForNavigation: string | null = null; // To store the ID for potential navigation later
    const toastId = toast.loading("Checking invoice number...");

    try {
      // 1. Check for duplicates
      const isDuplicate = await checkDuplicateInvoiceNo(invoiceData.id);
      if (isDuplicate) {
        throw new Error(`Invoice ${invoiceData.id} already exists`);
      }

      // 2. Create Invoice
      toast.loading("Creating invoice...", { id: toastId });
      const savedInvoice = await createInvoice({ ...invoiceData });
      invoiceIdForNavigation = savedInvoice.id; // Store the successfully created ID
      toast.success(`Invoice ${invoiceIdForNavigation} created!`, {
        id: toastId,
      }); // Initial success toast

      // 3. Create Payment (if needed)
      if (isPaid) {
        toast.loading("Recording payment...", { id: toastId });

        // Don't attempt to create a payment for CASH invoices - they are automatically paid by the backend
        if (invoiceData.paymenttype !== "CASH") {
          const paymentData: Omit<Payment, "payment_id" | "created_at"> = {
            invoice_id: invoiceIdForNavigation, // Use the saved ID
            payment_date: new Date().toISOString(),
            amount_paid: savedInvoice.totalamountpayable,
            payment_method: paymentMethod,
            payment_reference:
              paymentMethod === "cash" || paymentMethod === "online"
                ? undefined
                : paymentReference || undefined,
          };
          try {
            await createPayment(paymentData);
            toast.success(
              `Invoice ${invoiceIdForNavigation} created and paid!`,
              {
                id: toastId,
              }
            ); // Update toast
          } catch (paymentError: any) {
            // Payment failed, but invoice created. Show error, but proceed maybe?
            toast.error(
              `Invoice ${invoiceIdForNavigation} created, but payment failed: ${paymentError.message}. E-invoice submission skipped.`,
              { id: toastId, duration: 6000 }
            );
            // Decide if you want to stop here or still attempt e-invoice if checked?
            // For safety, let's stop if payment fails when expected.
            setIsSaving(false); // Stop saving process
            return; // Exit the function
          }
        } else {
          // For CASH invoices, they are already paid by backend
          toast.success(`CASH Invoice ${invoiceIdForNavigation} created!`, {
            id: toastId,
          });
        }
      }

      // 4. Submit e-Invoice (if checked and eligible)
      const shouldSubmitEinvoice =
        submitAsEinvoice && customerTinNumber && customerIdNumber;

      if (shouldSubmitEinvoice) {
        // --- TRIGGER MODAL ---
        setIsEinvoiceSubmitting(true);
        setEinvoiceResults(null);
        setIsEinvoiceModalOpen(true);
        toast.dismiss(toastId); // Dismiss previous toasts, modal shows progress/result

        try {
          const einvoiceResponse = await api.post("/api/einvoice/submit", {
            invoiceIds: [invoiceIdForNavigation], // Use the saved ID
          });
          setEinvoiceResults(einvoiceResponse); // Set results for the modal
          // Modal will display success/failure based on einvoiceResponse.success
        } catch (einvoiceError: any) {
          console.error("E-invoice submission API error:", einvoiceError);
          // Create a synthetic error response for the modal
          setEinvoiceResults({
            success: false,
            message: `E-invoice submission failed: ${
              einvoiceError?.response?.data?.message ||
              einvoiceError.message ||
              "Network error"
            }`,
            rejectedDocuments: [], // Ensure arrays exist
            acceptedDocuments: [],
            overallStatus: "Error",
          });
        } finally {
          setIsEinvoiceSubmitting(false); // Signal modal to show results
          // DO NOT NAVIGATE YET - user closes modal first
        }
      } else {
        // If not submitting e-invoice, navigate immediately
        navigate(`/sales/invoice/${invoiceIdForNavigation}`, {
          replace: true,
          state: { previousPath: "/sales/invoice" },
        });
      }
    } catch (error: any) {
      // Handle errors from duplicate check or createInvoice
      toast.error(`${error.message || "Error creating invoice"}`, {
        id: toastId,
        duration: 5000,
      });
      setIsSaving(false); // Ensure saving stops on critical errors
      // Don't navigate
    } finally {
      // Only set isSaving false here if NOT submitting e-invoice
      // If submitting e-invoice, the modal flow handles the end state.
      if (!submitAsEinvoice || !customerTinNumber || !customerIdNumber) {
        setIsSaving(false);
      }
      // Note: If e-invoice submission was triggered, isSaving remains true
      // until the modal is closed and navigation happens, or if submission fails critically.
      // We might want finer control, but let's keep isSaving true while modal is potentially active.
      // Let's refine: Set isSaving false here UNLESS the modal is now open
      if (!isEinvoiceModalOpen) {
        setIsSaving(false);
      }
    }
  };

  // --- Render Logic ---

  if (isLoadingPage || !invoiceData) {
    // Loading spinner logic (remains the same)
    return (
      <div className="mt-40 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Options for dropdowns (remains the same)
  const salesmenOptions = salesmenCache.map((s) => ({
    id: s.id,
    name: s.name || s.id,
  }));
  const productsForTable = productsCache.map((product) => ({
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
  }));
  const paymentMethodOptions = [
    { id: "cash", name: "Cash" },
    { id: "cheque", name: "Cheque" },
    { id: "bank_transfer", name: "Bank Transfer" },
    { id: "online", name: "Online" },
  ];

  // Determine if e-invoice checkbox should be enabled
  const canSubmitEinvoice = !!customerTinNumber && !!customerIdNumber;

  // --- JSX Output ---
  return (
    <div className="px-4 md:px-6 pb-8 max-w-full">
      <BackButton onClick={handleBackClick} disabled={isSaving} />

      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
        <h1 className="flex space-x-2 text-2xl font-bold text-default-900 flex-shrink-0 pr-4">
          New Invoice
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleCreateInvoice}
            variant="filled"
            color="sky"
            size="md"
            disabled={isSaving} // Disable button during the entire save process
          >
            {isSaving // Show generic saving text
              ? "Saving..."
              : isPaid
              ? "Create & Mark Paid"
              : "Create Invoice"}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-5">
        {/* Invoice Header Fields */}
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <InvoiceHeader
            invoice={invoiceData}
            onInputChange={handleHeaderInputChange}
            isNewInvoice={true}
            customers={customers}
            salesmen={salesmenOptions}
            selectedCustomer={selectedCustomer}
            onCustomerChange={handleCustomerSelectionChange}
            customerQuery={customerQuery}
            setCustomerQuery={setCustomerQuery}
            onLoadMoreCustomers={loadMoreCustomers}
            hasMoreCustomers={hasMoreCustomers}
            isFetchingCustomers={isFetchingCustomers}
            readOnly={isSaving} // Make header read-only while saving
          />
        </section>

        {/* Line Items Section */}
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Line Items</h2>
            <div>
              <Button
                onClick={handleAddSubtotal}
                variant="outline"
                size="sm"
                className="mr-2"
                disabled={isSaving}
              >
                Add Subtotal
              </Button>
              <Button
                onClick={handleAddRow}
                variant="outline"
                size="sm"
                disabled={isSaving}
              >
                Add Item
              </Button>
            </div>
          </div>
          <LineItemsTable
            items={lineItems}
            onItemsChange={handleLineItemsChange}
            customerProducts={customerProducts}
            productsCache={productsForTable}
            readOnly={isSaving} // Make table read-only while saving
          />
        </section>

        {/* Totals & Payment Section */}
        <section className="p-4 border rounded-lg bg-white shadow-sm flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex w-full gap-4">
            {/* Invoice Number & Date Fields */}
            {/* Left Side: Paid Checkbox & Payment Details */}
            <div className="w-full md:w-2/5 space-y-4">
              <div className="flex items-center pt-1">
                {/* Paid Checkbox Logic */}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !isSaving &&
                      (invoiceData?.paymenttype !== "CASH" || !isPaid)
                    ) {
                      setIsPaid(!isPaid);
                    }
                  }}
                  className={`flex items-center ${
                    invoiceData?.paymenttype === "CASH"
                      ? "cursor-not-allowed opacity-70"
                      : ""
                  } ${isSaving ? "cursor-not-allowed opacity-50" : ""}`} // Disable interaction when saving
                  disabled={isSaving || invoiceData?.paymenttype === "CASH"}
                  title={
                    invoiceData?.paymenttype === "CASH"
                      ? "Cash invoices are always paid"
                      : ""
                  }
                >
                  {isPaid ? (
                    <IconSquareCheckFilled
                      className="text-blue-600"
                      size={20}
                    />
                  ) : (
                    <IconSquare className="text-default-400" size={20} />
                  )}
                  <span className="ml-2 font-medium text-sm">
                    {invoiceData?.paymenttype === "CASH"
                      ? "Cash Payment"
                      : "Mark as Paid"}
                  </span>
                </button>
              </div>
              {isPaid && (
                <div className="flex items-center gap-3 w-full">
                  {/* Payment Method & Reference */}
                  <FormListbox
                    name="paymentMethod"
                    label="Payment Method"
                    value={paymentMethod}
                    onChange={(value) =>
                      setPaymentMethod(value as Payment["payment_method"])
                    }
                    options={paymentMethodOptions}
                    disabled={isSaving}
                    placeholder="Select Method..."
                    optionsPosition="top"
                    className="w-2/3"
                  />
                  {(paymentMethod === "cheque" ||
                    paymentMethod === "bank_transfer") && (
                    <FormInput
                      name="paymentReference"
                      label={
                        paymentMethod === "cheque"
                          ? "Cheque Number"
                          : "Transaction Ref"
                      }
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Enter reference"
                      disabled={isSaving}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Middle: e-Invoice Checkbox */}
            <div className="flex items-start pt-1">
              <button
                type="button"
                onClick={() => setSubmitAsEinvoice(!submitAsEinvoice)}
                className={`flex items-center ${
                  !canSubmitEinvoice || isSaving
                    ? "cursor-not-allowed opacity-50"
                    : ""
                }`}
                disabled={!canSubmitEinvoice || isSaving}
                title={
                  !canSubmitEinvoice
                    ? "Customer must have TIN and ID number for e-invoicing"
                    : ""
                }
              >
                {submitAsEinvoice ? (
                  <IconSquareCheckFilled className="text-blue-600" size={20} />
                ) : (
                  <IconSquare className="text-default-400" size={20} />
                )}
                <span className="ml-2 font-medium text-sm truncate">
                  Submit e-Invoice upon saving
                </span>
              </button>
            </div>
          </div>

          {/* Right Side: Invoice Totals */}
          <div className="w-full md:w-80">
            <InvoiceTotals
              subtotal={invoiceData.total_excluding_tax}
              taxTotal={invoiceData.tax_amount}
              rounding={invoiceData.rounding}
              grandTotal={invoiceData.totalamountpayable}
              onRoundingChange={handleRoundingChange}
              readOnly={isSaving} // Make totals read-only while saving
            />
          </div>
        </section>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Invoice"
        message="Are you sure you want to leave? This new invoice will be discarded."
        confirmButtonText="Discard"
        variant="danger"
      />

      {/* --- RENDER THE MODAL --- */}
      <SubmissionResultsModal
        isOpen={isEinvoiceModalOpen}
        onClose={handleCloseEinvoiceModal}
        results={einvoiceResults}
        isLoading={isEinvoiceSubmitting} // Use the specific e-invoice loading state
      />
    </div>
  );
};

export default InvoiceFormPage;

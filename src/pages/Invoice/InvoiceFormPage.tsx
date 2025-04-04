// src/pages/Invoice/InvoiceFormPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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

const InvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();

  // --- State ---
  const [invoiceData, setInvoiceData] = useState<ExtendedInvoiceData | null>(
    null
  );
  const [isLoadingPage, setIsLoadingPage] = useState(true); // Loading supporting data
  const [isSaving, setIsSaving] = useState(false); // Saving state (Create)
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [customerProducts, setCustomerProducts] = useState<CustomProduct[]>([]);
  const [submitAsEinvoice, setSubmitAsEinvoice] = useState(false);
  const [customerTinNumber, setCustomerTinNumber] = useState<string | null>(
    null
  );
  const [customerIdNumber, setCustomerIdNumber] = useState<string | null>(null);

  // Payment State (only relevant if 'Paid' is checked)
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<Payment["payment_method"]>("cash");
  const [paymentReference, setPaymentReference] = useState("");

  // --- Hooks ---
  const { products: productsCache, isLoading: productsLoading } =
    useProductsCache();
  const { salesmen: salesmenCache, isLoading: salesmenLoading } =
    useSalesmanCache();
  // Customer hook needs careful handling as invoiceData.customerid won't exist initially
  const {
    customers,
    selectedCustomer,
    setSelectedCustomer,
    customerQuery,
    setCustomerQuery,
    loadMoreCustomers,
    hasMoreCustomers,
    isFetchingCustomers,
  } = useCustomerData(invoiceData?.customerid); // Pass null initially, updates when customer selected

  // --- Memoized Values ---
  const lineItems = useMemo(
    () => invoiceData?.products || [],
    [invoiceData?.products]
  );

  // --- Effects ---

  // Overall page loading state
  useEffect(() => {
    setIsLoadingPage(productsLoading || salesmenLoading);
  }, [productsLoading, salesmenLoading]);

  // Initialize new invoice data once supporting data is loaded
  useEffect(() => {
    if (!isLoadingPage && !invoiceData) {
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
  }, [isLoadingPage, salesmenCache, invoiceData]); // invoiceData added to prevent re-init

  useEffect(() => {
    // Auto-check "Mark as Paid" when CASH type is selected
    if (invoiceData?.paymenttype === "CASH" && !isPaid) {
      setIsPaid(true);
    }
  }, [invoiceData?.paymenttype, isPaid]);

  // Fetch custom product prices when customer changes
  const fetchCustomerProducts = useCallback(async (customerId: string) => {
    if (!customerId) {
      setCustomerProducts([]);
      setCustomerTinNumber(null);
      setCustomerIdNumber(null);
      return [];
    }
    try {
      const response = await api.get(`/api/customer-products/${customerId}`);

      // Handle the new response format
      if (response.products) {
        // New format with customer and products
        setCustomerProducts(response.products);

        // Store customer TIN and ID for e-invoice eligibility check
        if (response.customer) {
          setCustomerTinNumber(response.customer.tin_number);
          setCustomerIdNumber(response.customer.id_number);
        }

        return response.products;
      } else {
        // Handle legacy format (just in case)
        setCustomerProducts(response);
        return response;
      }
    } catch (error) {
      console.error("Error fetching customer products:", error);
      toast.error("Could not load custom product prices.");
      setCustomerProducts([]);
      setCustomerTinNumber(null);
      setCustomerIdNumber(null);
      return [];
    }
  }, []);
  useEffect(() => {
    if (invoiceData?.customerid) {
      fetchCustomerProducts(invoiceData.customerid);
    } else {
      setCustomerProducts([]);
    }
  }, [invoiceData?.customerid, fetchCustomerProducts]);

  // Effect to recalculate totals (No change needed)
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

  // --- Input & Action Handlers ---

  const handleBackClick = () => {
    // Check if any significant field has been touched (simple check for now)
    const isFormDirty =
      !!invoiceData?.id ||
      !!invoiceData?.customerid ||
      invoiceData?.products.some(
        (p) => !!p.code || p.quantity !== 1 || p.price !== 0
      );

    if (isFormDirty && !isSaving) {
      setShowBackConfirmation(true);
    } else if (!isSaving) {
      navigate("/sales/invoice"); // Go back to list
    }
  };
  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/sales/invoice"); // Go back to list
  };

  // Update header fields (No change needed, readOnly removed)
  const handleHeaderInputChange = useCallback(
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
          // If switching to CASH, ensure isPaid is true
          if (value === "CASH") {
            setIsPaid(true);
          }
          return { ...prev, paymenttype: value };
        }
        return { ...prev, [field]: value };
      });
    },
    [setIsPaid] // Add setIsPaid as a dependency
  );

  // Customer selection (No change needed, readOnly removed)
  const handleCustomerSelectionChange = useCallback(
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
      if (customer) {
        fetchCustomerProducts(customer.id);
      } else {
        setCustomerProducts([]);
      }
    },
    [setSelectedCustomer, fetchCustomerProducts]
  );

  // Line item changes (No change needed, readOnly removed)
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

    setInvoiceData((prev) =>
      prev ? { ...prev, products: recalculatedItems } : null
    );
  }, []);

  // Rounding change (No change needed, readOnly removed)
  const handleRoundingChange = useCallback((newRounding: number) => {
    setInvoiceData((prev) =>
      prev ? { ...prev, rounding: parseFloat(newRounding.toFixed(2)) } : null
    );
  }, []);

  // Add new row (No change needed, readOnly removed)
  const handleAddRow = () => {
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

  // Add subtotal row (No change needed, readOnly removed)
  const handleAddSubtotal = () => {
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

  // CREATE INVOICE
  const handleCreateInvoice = async () => {
    if (!invoiceData || isSaving) return;

    // --- Validation ---
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

    // Payment Validation (if paid)
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

    // Start saving process with duplicate check
    setIsSaving(true);
    const toastId = toast.loading("Checking invoice number...");

    try {
      // Check for duplicates
      const isDuplicate = await checkDuplicateInvoiceNo(invoiceData.id);
      if (isDuplicate) {
        toast.error(`Invoice ${invoiceData.id} already exists in the system`, {
          id: toastId,
        });
        setIsSaving(false);
        return;
      }

      // Update loading message for invoice creation
      toast.loading("Creating invoice...", { id: toastId });

      // Create the invoice
      const savedInvoice = await createInvoice({ ...invoiceData });
      const invoiceIdForPayment = savedInvoice.id;

      // Step 2: If 'Paid' is checked, create the payment
      if (isPaid) {
        toast.loading("Recording payment...", { id: toastId });
        const paymentData: Omit<Payment, "payment_id" | "created_at"> = {
          invoice_id: invoiceIdForPayment,
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
          toast.success(`Invoice ${invoiceIdForPayment} created and paid!`, {
            id: toastId,
          });
        } catch (paymentError: any) {
          toast.error(
            `Invoice ${invoiceIdForPayment} created, but payment failed: ${paymentError.message}`,
            { id: toastId, duration: 5000 }
          );
        }
      } else {
        toast.success(`Invoice ${invoiceIdForPayment} created!`, {
          id: toastId,
        });
      }

      // Step 3: If 'Submit e-Invoice' is checked, submit for e-invoicing
      if (submitAsEinvoice && customerTinNumber && customerIdNumber) {
        toast.loading("Submitting e-invoice...", { id: toastId });
        try {
          const einvoiceResponse = await api.post(
            "/api/einvoice/submit-system",
            {
              invoiceIds: [invoiceIdForPayment],
            }
          );

          if (einvoiceResponse.success) {
            toast.success(
              `Invoice ${invoiceIdForPayment} created and submitted for e-invoicing!`,
              {
                id: toastId,
              }
            );
          } else {
            toast.error(
              `Invoice created, but e-invoice submission failed: ${
                einvoiceResponse.message || "Unknown error"
              }`,
              { id: toastId, duration: 5000 }
            );
          }
        } catch (einvoiceError: any) {
          toast.error(
            `Invoice created, but e-invoice submission failed: ${
              einvoiceError.message || "Unknown error"
            }`,
            { id: toastId, duration: 5000 }
          );
        }
      } else {
        // Normal success message if not submitting e-invoice
        toast.success(`Invoice ${invoiceIdForPayment} created!`, {
          id: toastId,
        });
      }

      // Navigate to the details page
      navigate(`/sales/invoice/${invoiceIdForPayment}`, {
        replace: true,
        state: { previousPath: "/sales/invoice" },
      });
    } catch (error: any) {
      // Check if this is a duplicate error caught by the server
      if (error.message && error.message.includes("already exists")) {
        toast.error(`Invoice ${invoiceData.id} already exists`, {
          id: toastId,
        });
      } else {
        toast.error(
          `Error creating invoice: ${error.message || "Unknown error"}`,
          { id: toastId }
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render Logic ---

  if (isLoadingPage || !invoiceData) {
    // Show loading spinner until supporting data AND initial invoice structure are ready
    return (
      <div className="mt-40 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

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
            disabled={isSaving}
          >
            {isSaving
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
            isNewInvoice={true} // Always true
            customers={customers}
            salesmen={salesmenOptions}
            selectedCustomer={selectedCustomer}
            onCustomerChange={handleCustomerSelectionChange}
            customerQuery={customerQuery}
            setCustomerQuery={setCustomerQuery}
            onLoadMoreCustomers={loadMoreCustomers}
            hasMoreCustomers={hasMoreCustomers}
            isFetchingCustomers={isFetchingCustomers}
            readOnly={false} // Always editable
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
            readOnly={false} // Always editable
          />
        </section>

        {/* Totals & Payment Section */}
        <section className="p-4 border rounded-lg bg-white shadow-sm flex flex-col md:flex-row justify-between items-start gap-6">
          {/* Left Side: Paid Checkbox & Payment Details (if paid) */}
          <div className="w-full md:w-1/3 space-y-4">
            <div className="flex items-center pt-1">
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
                } disabled:opacity-50`}
                disabled={isSaving}
                title={
                  invoiceData?.paymenttype === "CASH"
                    ? "Cash invoices are always paid"
                    : ""
                }
              >
                {isPaid ? (
                  <IconSquareCheckFilled className="text-blue-600" size={20} />
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
                <FormListbox
                  name="paymentMethod"
                  label="Payment Method"
                  value={paymentMethod} // Pass the ID state ('cash')
                  onChange={(value) =>
                    setPaymentMethod(value as Payment["payment_method"])
                  } // Receives ID ('cash')
                  options={paymentMethodOptions} // Pass options with {id, name}
                  disabled={isSaving}
                  placeholder="Select Method..."
                  optionsPosition="top"
                  className="w-full"
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

          {/* e-Invoice Checkbox - only show if customer has TIN and ID */}
          {customerTinNumber && customerIdNumber && (
            <div className="flex items-center pt-1">
              <button
                type="button"
                onClick={() => setSubmitAsEinvoice(!submitAsEinvoice)}
                className={`flex items-center ${
                  isSaving ? "cursor-not-allowed opacity-70" : ""
                } disabled:opacity-50`}
                disabled={isSaving}
              >
                {submitAsEinvoice ? (
                  <IconSquareCheckFilled className="text-blue-600" size={20} />
                ) : (
                  <IconSquare className="text-default-400" size={20} />
                )}
                <span className="ml-2 font-medium text-sm">
                  Submit e-Invoice upon saving
                </span>
              </button>
            </div>
          )}

          {/* Right Side: Invoice Totals */}
          <div className="w-full md:w-auto">
            <InvoiceTotals
              subtotal={invoiceData.total_excluding_tax}
              taxTotal={invoiceData.tax_amount}
              rounding={invoiceData.rounding}
              grandTotal={invoiceData.totalamountpayable}
              onRoundingChange={handleRoundingChange}
              readOnly={false}
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
    </div>
  );
};

export default InvoiceFormPage;

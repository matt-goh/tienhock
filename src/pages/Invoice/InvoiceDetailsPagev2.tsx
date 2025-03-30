// src/pages/Invoice/InvoiceDetailsPagev2.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ExtendedInvoiceData,
  ProductItem,
  Customer,
  CustomProduct,
} from "../../types/types"; // Use updated types
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
  updateInvoice,
  deleteInvoice,
  // getInvoiceById
} from "../../utils/invoice/InvoiceUtils";
import toast from "react-hot-toast";
import { debounce } from "lodash";

const InvoiceDetailsPagev2: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  const isNewInvoice = !id || id.toLowerCase() === "new";
  const state = location.state as
    | { invoiceData?: ExtendedInvoiceData; previousPath?: string }
    | undefined;

  const [invoiceData, setInvoiceData] = useState<ExtendedInvoiceData | null>(
    null
  );
  const [initialInvoiceData, setInitialInvoiceData] =
    useState<ExtendedInvoiceData | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isLoadingInvoiceData, setIsLoadingInvoiceData] = useState(
    !isNewInvoice
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [previousPath, setPreviousPath] = useState("/sales/invoice");
  const [customerProducts, setCustomerProducts] = useState<CustomProduct[]>([]);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);

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

  const lineItems = useMemo(
    () => invoiceData?.products || [],
    [invoiceData?.products]
  );

  // --- Effects ---

  useEffect(() => {
    setIsLoadingPage(
      isLoadingInvoiceData || productsLoading || salesmenLoading
    );
  }, [isLoadingInvoiceData, productsLoading, salesmenLoading]);

  const fetchCustomerProducts = useCallback(async (customerId: string) => {
    if (!customerId) {
      setCustomerProducts([]);
      return;
    }
    try {
      console.log("Fetching custom products for:", customerId); // Mock
      setCustomerProducts([]);
    } catch (error) {
      console.error("Error fetching customer products:", error);
      toast.error("Could not load custom product prices.");
      setCustomerProducts([]);
    }
  }, []);

  useEffect(() => {
    if (invoiceData?.customerid) {
      fetchCustomerProducts(invoiceData.customerid);
    } else {
      setCustomerProducts([]);
    }
  }, [invoiceData?.customerid, fetchCustomerProducts]);

  useEffect(() => {
    if (state?.previousPath) {
      setPreviousPath(state.previousPath);
    }

    if (isNewInvoice) {
      setIsLoadingInvoiceData(false);
      const newInv: ExtendedInvoiceData = {
        id: "",
        salespersonid: "",
        customerid: "",
        createddate: Date.now().toString(),
        paymenttype: "INVOICE",
        total_excluding_tax: 0,
        tax_amount: 0,
        rounding: 0,
        totalamountpayable: 0,
        uuid: null,
        submission_uid: null,
        long_id: null,
        datetime_validated: null,
        is_consolidated: false,
        consolidated_invoices: null,
        invoice_status: "active",
        einvoice_status: null,
        products: [
          {
            // Add initial empty row with uid
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
        isEditing: true,
      };
      setInvoiceData(newInv);
      setInitialInvoiceData(structuredClone(newInv));
    } else if (id) {
      const fetchInvoiceDetails = async (invoiceId: string) => {
        setIsLoadingInvoiceData(true);
        setError(null);
        try {
          console.log(`Fetching invoice ${invoiceId} (mock)...`);
          await new Promise((res) => setTimeout(res, 300));
          const mockExisting: ExtendedInvoiceData | undefined =
            MOCK_INVOICES_DETAILS.find((inv) => inv.id === invoiceId);
          const fetchedInvoice = mockExisting;
          if (!fetchedInvoice) throw new Error("Invoice not found");
          // Ensure products have UIDs
          const productsWithUid = (fetchedInvoice.products || []).map((p) => ({
            ...p,
            uid: p.uid || crypto.randomUUID(),
          }));
          const loadedInvoice = {
            ...fetchedInvoice,
            products: productsWithUid,
          };
          setInvoiceData(loadedInvoice);
          setInitialInvoiceData(structuredClone(loadedInvoice));
        } catch (err: any) {
          setError(err.message || "Failed to load invoice details.");
          toast.error(err.message || "Failed to load invoice details.");
          setInvoiceData(null);
        } finally {
          setIsLoadingInvoiceData(false);
        }
      };
      fetchInvoiceDetails(id);
    }
  }, [id, isNewInvoice, state?.previousPath]); // Removed fetchInvoiceDetails from deps

  useEffect(() => {
    if (
      !isLoadingPage &&
      !isNewInvoice &&
      invoiceData?.customerid &&
      customers.length > 0 &&
      !selectedCustomer
    ) {
      const initialCust = customers.find(
        (c) => c.id === invoiceData.customerid
      );
      if (initialCust) {
        setSelectedCustomer(initialCust);
      }
    }
  }, [
    isLoadingPage,
    isNewInvoice,
    invoiceData?.customerid,
    customers,
    selectedCustomer,
    setSelectedCustomer,
  ]);

  useEffect(() => {
    if (initialInvoiceData && invoiceData) {
      const currentSnapshot = JSON.stringify(invoiceData);
      const initialSnapshot = JSON.stringify(initialInvoiceData);
      setIsFormChanged(currentSnapshot !== initialSnapshot);
    } else {
      setIsFormChanged(false);
    }
  }, [invoiceData, initialInvoiceData]);

  useEffect(() => {
    if (!invoiceData) return;
    let subtotal = 0;
    let taxTotal = 0;
    invoiceData.products.forEach((item) => {
      if (!item.issubtotal) {
        subtotal += (Number(item.quantity) || 0) * (Number(item.price) || 0);
        taxTotal += Number(item.tax) || 0;
      }
    });
    const rounding = Number(invoiceData.rounding) || 0;
    const totalPayable = subtotal + taxTotal + rounding;
    if (
      invoiceData.total_excluding_tax !== subtotal ||
      invoiceData.tax_amount !== taxTotal ||
      invoiceData.totalamountpayable !== totalPayable
    ) {
      setInvoiceData((prev) =>
        prev
          ? {
              ...prev,
              total_excluding_tax: parseFloat(subtotal.toFixed(2)),
              tax_amount: parseFloat(taxTotal.toFixed(2)),
              totalamountpayable: parseFloat(totalPayable.toFixed(2)),
            }
          : null
      );
    }
  }, [invoiceData?.products, invoiceData?.rounding]);

  const checkDuplicateDebounced = useCallback(
    debounce(async (invoiceIdToCheck: string) => {
      if (!invoiceIdToCheck) {
        setIsDuplicate(false);
        setIsCheckingDuplicate(false);
        return false;
      }
      setIsCheckingDuplicate(true);
      let isDup = false;
      try {
        console.log("Checking duplicate (mock):", invoiceIdToCheck);
        await new Promise((res) => setTimeout(res, 400));
        isDup = MOCK_INVOICES_DETAILS.some(
          (inv) =>
            inv.id === invoiceIdToCheck && inv.id !== initialInvoiceData?.id
        );
        setIsDuplicate(isDup);
        if (isDup) {
          toast.error(`Invoice number ${invoiceIdToCheck} already exists!`);
        }
      } catch (error) {
        toast.error("Failed to check for duplicate invoice number.");
        setIsDuplicate(false);
      } finally {
        setIsCheckingDuplicate(false);
      }
      return isDup;
    }, 500),
    [initialInvoiceData?.id]
  );

  // --- Handlers ---
  const handleBackClick = () => {
    if (isFormChanged && !isSaving) {
      setShowBackConfirmation(true);
    } else if (!isSaving) {
      navigate(previousPath);
    }
  };
  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate(previousPath);
  };
  const handleCancelInvoiceClick = () => {
    if (invoiceData?.invoice_status === "cancelled") {
      toast.error("This invoice is already cancelled.");
      return;
    }
    setShowCancelConfirmation(true);
  };
  const handleConfirmCancelInvoice = async () => {
    if (!invoiceData || isNewInvoice || isSaving) return;
    const toastId = toast.loading("Cancelling invoice...");
    setIsSaving(true);
    try {
      console.log(`Cancelling invoice ${invoiceData.id} (mock)...`);
      await new Promise((res) => setTimeout(res, 500));
      toast.success("Invoice cancelled successfully", { id: toastId });
      navigate(previousPath);
    } catch (error: any) {
      toast.error(`Failed to cancel invoice: ${error.message}`, {
        id: toastId,
      });
    } finally {
      setShowCancelConfirmation(false);
      setIsSaving(false);
    }
  };
  const handleHeaderInputChange = useCallback(
    (field: keyof ExtendedInvoiceData, value: any) => {
      setInvoiceData((prev) => (prev ? { ...prev, [field]: value } : null));
    },
    []
  );
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
  const handleLineItemsChange = useCallback((updatedItems: ProductItem[]) => {
    const itemsWithUid = updatedItems.map((item) => ({
      ...item,
      uid: item.uid || crypto.randomUUID(),
    }));
    setInvoiceData((prev) =>
      prev ? { ...prev, products: itemsWithUid } : null
    );
  }, []);
  const handleRoundingChange = useCallback((newRounding: number) => {
    setInvoiceData((prev) =>
      prev ? { ...prev, rounding: parseFloat(newRounding.toFixed(2)) } : null
    );
  }, []);
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
  const handleAddSubtotal = () => {
    if (!invoiceData) return;
    let runningTotal = 0;
    invoiceData.products.forEach((item) => {
      if (!item.issubtotal) {
        runningTotal += parseFloat(item.total || "0");
      } else {
        runningTotal = 0;
      }
    });
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
  const handleSaveClick = async () => {
    if (!invoiceData || isSaving) return;
    /* Validation */ let errors: string[] = [];
    if (!invoiceData.id && isNewInvoice)
      errors.push("Invoice Number is required.");
    if (isNewInvoice && invoiceData.id && isCheckingDuplicate) {
      toast.error("Please wait for duplicate check to complete.");
      return;
    }
    if (isDuplicate && isNewInvoice)
      errors.push("Invoice Number is already taken.");
    if (!invoiceData.customerid) errors.push("Customer is required.");
    if (!invoiceData.salespersonid) errors.push("Salesman is required.");
    if (!invoiceData.createddate) errors.push("Date/Time is required.");
    const itemsToValidate = lineItems.filter((li) => !li.issubtotal);
    if (itemsToValidate.length === 0) {
      errors.push("Invoice must have at least one item.");
    } else {
      itemsToValidate.forEach((item, index) => {
        if (!item.code || !item.description) {
          errors.push(`Item #${index + 1}: Product must be selected.`);
        }
      });
    }
    if (errors.length > 0) {
      errors.forEach((err) => toast.error(err, { duration: 4000 }));
      return;
    }
    /* End Validation */ setIsSaving(true);
    const toastId = toast.loading(
      isNewInvoice ? "Creating Invoice..." : "Updating Invoice..."
    );
    const dataToSave = {
      ...invoiceData,
      products: lineItems.map(
        ({ uid, istotal, rounding, amount, ...rest }) => rest
      ),
      originalId: invoiceData.originalId,
    };
    try {
      let savedInvoice: ExtendedInvoiceData;
      if (isNewInvoice) {
        console.log("Creating invoice (mock)...", dataToSave);
        savedInvoice = {
          ...dataToSave,
          id: dataToSave.id || `NEW${Date.now()}`,
        };
        await new Promise((res) => setTimeout(res, 600));
        toast.success(`Invoice ${savedInvoice.id} created!`, { id: toastId });
        navigate(`/sales/invoice/${savedInvoice.id}`);
      } else {
        console.log("Updating invoice (mock)...", dataToSave);
        savedInvoice = { ...dataToSave };
        await new Promise((res) => setTimeout(res, 600));
        toast.success(`Invoice ${savedInvoice.id} updated!`, { id: toastId });
        setInvoiceData(structuredClone(savedInvoice));
        setInitialInvoiceData(structuredClone(savedInvoice));
        setIsFormChanged(false);
      }
    } catch (error: any) {
      toast.error(`Failed to save invoice: ${error.message}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render ---
  if (isLoadingPage)
    return (
      <div className="mt-40 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  if (error)
    return (
      <div className="p-6 text-rose-600">
        Error: {error} <BackButton onClick={() => navigate(previousPath)} />
      </div>
    );
  if (!invoiceData)
    return (
      <div className="p-6 text-gray-500">
        Invoice data could not be loaded.{" "}
        <BackButton onClick={() => navigate(previousPath)} />
      </div>
    );

  const isReadOnly =
    isSaving ||
    invoiceData.invoice_status === "cancelled" ||
    invoiceData.invoice_status === "paid";
  const salesmenOptions = salesmenCache.map((s) => ({
    id: s.id,
    name: s.name || s.id,
  }));

  // Map productsCache for LineItemsTable Combobox - transform to ProductItem format
  const productsForTable = productsCache.map((product) => ({
    uid: crypto.randomUUID(), // Generate proper UUID instead of using product.id
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

  return (
    <div className="px-4 md:px-6 pb-8 max-w-full">
      <BackButton onClick={handleBackClick} />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
        <h1 className="text-2xl font-bold text-default-900 flex-shrink-0 pr-4">
          {isNewInvoice ? "New Invoice" : `Invoice #${invoiceData.id || "..."}`}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {!isNewInvoice && invoiceData.invoice_status !== "cancelled" && (
            <Button
              onClick={handleCancelInvoiceClick}
              variant="outline"
              color="rose"
              size="md"
              disabled={isSaving || isReadOnly}
            >
              {" "}
              Cancel Invoice{" "}
            </Button>
          )}
          <Button
            onClick={handleSaveClick}
            variant="filled"
            color="sky"
            size="md"
            disabled={
              isSaving || isReadOnly || (!isNewInvoice && !isFormChanged)
            }
          >
            {isSaving
              ? "Saving..."
              : isNewInvoice
              ? "Create Invoice"
              : "Save Changes"}
          </Button>
        </div>
      </div>
      <div className="space-y-5">
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <InvoiceHeader
            invoice={invoiceData}
            onInputChange={handleHeaderInputChange}
            isNewInvoice={isNewInvoice}
            customers={customers}
            salesmen={salesmenOptions}
            selectedCustomerName={
              selectedCustomer?.name || invoiceData.customerName || ""
            }
            onCustomerChange={handleCustomerSelectionChange}
            customerQuery={customerQuery}
            setCustomerQuery={setCustomerQuery}
            onLoadMoreCustomers={loadMoreCustomers}
            hasMoreCustomers={hasMoreCustomers}
            isFetchingCustomers={isFetchingCustomers}
            onInvoiceIdBlur={(id) =>
              checkDuplicateDebounced(id) || Promise.resolve(false)
            }
            isCheckingDuplicate={isCheckingDuplicate}
            isDuplicate={isDuplicate}
          />
        </section>
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Line Items</h2>
            {!isReadOnly && (
              <div>
                {" "}
                <Button
                  onClick={handleAddSubtotal}
                  variant="outline"
                  size="sm"
                  className="mr-2"
                >
                  Add Subtotal
                </Button>{" "}
                <Button onClick={handleAddRow} variant="outline" size="sm">
                  Add Item
                </Button>{" "}
              </div>
            )}
          </div>
          <LineItemsTable
            items={lineItems}
            onItemsChange={handleLineItemsChange}
            customerProducts={customerProducts}
            productsCache={productsForTable} // Pass the raw Product cache
            readOnly={isReadOnly}
          />
        </section>
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <InvoiceTotals
            subtotal={invoiceData.total_excluding_tax}
            taxTotal={invoiceData.tax_amount}
            rounding={invoiceData.rounding}
            grandTotal={invoiceData.totalamountpayable}
            onRoundingChange={handleRoundingChange}
            readOnly={isReadOnly}
          />
        </section>
        {!isNewInvoice && invoiceData.uuid && (
          <section className="p-4 border rounded-lg bg-white shadow-sm">
            {" "}
            <h2 className="text-lg font-semibold mb-3">
              E-Invoice Details
            </h2>{" "}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {" "}
              <p>
                <strong className="text-gray-600">UUID:</strong>{" "}
                <span className="font-mono text-xs">{invoiceData.uuid}</span>
              </p>{" "}
              <p>
                <strong className="text-gray-600">Long ID:</strong>{" "}
                <span className="font-mono text-xs">
                  {invoiceData.long_id || "N/A"}
                </span>
              </p>{" "}
              <p>
                <strong className="text-gray-600">Submission UID:</strong>{" "}
                <span className="font-mono text-xs">
                  {invoiceData.submission_uid || "N/A"}
                </span>
              </p>{" "}
              <p>
                <strong className="text-gray-600">Validated:</strong>{" "}
                {invoiceData.datetime_validated
                  ? new Date(invoiceData.datetime_validated).toLocaleString()
                  : "N/A"}
              </p>{" "}
            </div>{" "}
          </section>
        )}
      </div>
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure? Unsaved changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showCancelConfirmation}
        onClose={() => setShowCancelConfirmation(false)}
        onConfirm={handleConfirmCancelInvoice}
        title="Cancel Invoice"
        message={`Are you sure you want to cancel invoice ${invoiceData?.id}? This action cannot be undone.`}
        confirmButtonText="Confirm Cancellation"
        variant="danger"
      />
    </div>
  );
};

// Add MOCK_INVOICES_DETAILS here for testing
const MOCK_INVOICES_DETAILS: ExtendedInvoiceData[] = [
  {
    id: "1001",
    salespersonid: "S01",
    customerid: "CUST001",
    customerName: "ABC Trading",
    createddate: new Date(2023, 10, 15, 10, 30).getTime().toString(),
    paymenttype: "INVOICE",
    total_excluding_tax: 150.0,
    tax_amount: 15.0,
    rounding: 0.05,
    totalamountpayable: 165.05,
    uuid: "uuid-123",
    submission_uid: "sub-abc",
    long_id: "long-123",
    datetime_validated: "2023-11-15T11:00:00Z",
    is_consolidated: false,
    consolidated_invoices: null,
    invoice_status: "active",
    einvoice_status: "valid",
    products: [
      {
        id: 41,
        code: "P01",
        description: "Product A",
        quantity: 10,
        price: 10,
        freeProduct: 1,
        returnProduct: 0,
        tax: 10.0,
        total: "110.00",
      },
      {
        id: 42,
        code: "P02",
        description: "Product B",
        quantity: 5,
        price: 10,
        freeProduct: 0,
        returnProduct: 0,
        tax: 5.0,
        total: "55.00",
      },
    ],
  },
  {
    id: "1002",
    salespersonid: "S02",
    customerid: "CUST002",
    customerName: "XYZ Corp",
    createddate: new Date(2023, 10, 14, 14, 0).getTime().toString(),
    paymenttype: "CASH",
    total_excluding_tax: 200.0,
    tax_amount: 0.0,
    rounding: 0.0,
    totalamountpayable: 200.0,
    uuid: null,
    submission_uid: null,
    long_id: null,
    datetime_validated: null,
    is_consolidated: false,
    consolidated_invoices: null,
    invoice_status: "paid",
    einvoice_status: null,
    products: [
      {
        id: 1234,
        code: "P03",
        description: "Product C",
        quantity: 20,
        price: 10,
        freeProduct: 0,
        returnProduct: 0,
        tax: 0.0,
        total: "200.00",
      },
    ],
  },
  // Add more mock data as needed
];

export default InvoiceDetailsPagev2;

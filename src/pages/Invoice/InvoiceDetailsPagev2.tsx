// src/pages/Invoice/InvoiceDetailsPagev2.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ExtendedInvoiceData,
  ProductItem,
  Customer,
  CustomProduct,
  InvoiceStatus, // Import status types if needed for comparison
  EInvoiceStatus,
} from "../../types/types"; // Adjust path as needed
import BackButton from "../../components/BackButton"; // Adjust path
import Button from "../../components/Button"; // Adjust path
import LoadingSpinner from "../../components/LoadingSpinner"; // Adjust path
import ConfirmationDialog from "../../components/ConfirmationDialog"; // Adjust path
import InvoiceHeader from "../../components/Invoice/InvoiceHeader"; // Adjust path
import LineItemsTable from "../../components/Invoice/LineItemsTable"; // Adjust path
import InvoiceTotals from "../../components/Invoice/InvoiceTotals"; // Adjust path
import { useProductsCache } from "../../utils/invoice/useProductsCache"; // Adjust path
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache"; // Adjust path
import { useCustomerData } from "../../hooks/useCustomerData"; // Adjust path
import {
  createInvoice,
  updateInvoice,
  cancelInvoice,
  getInvoiceById,
  checkDuplicateInvoiceNo,
} from "../../utils/invoice/InvoiceUtils"; // Adjust path
import toast from "react-hot-toast";
import { debounce } from "lodash";
import { parseDatabaseTimestamp } from "../../utils/invoice/dateUtils"; // Assuming you have this

// Interface for customer products (if not already in types)
// interface CustomProduct { id: string; /* ... other fields */ }

const InvoiceDetailsPagev2: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>(); // id from URL (e.g., "1001", "new")

  const isNewInvoice = !id || id.toLowerCase() === "new";
  const state = location.state as { previousPath?: string } | undefined;

  // --- State ---
  const [invoiceData, setInvoiceData] = useState<ExtendedInvoiceData | null>(
    null
  );
  const [initialInvoiceData, setInitialInvoiceData] =
    useState<ExtendedInvoiceData | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true); // Loading page shell (hooks etc)
  const [isLoadingInvoiceData, setIsLoadingInvoiceData] = useState(
    !isNewInvoice
  ); // Loading specific invoice data
  const [isSaving, setIsSaving] = useState(false); // Saving state (Create/Update)
  const [error, setError] = useState<string | null>(null); // Data loading error
  const [isFormChanged, setIsFormChanged] = useState(false); // Track unsaved changes
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [previousPath, setPreviousPath] = useState("/sales/invoice"); // Default back path
  const [customerProducts, setCustomerProducts] = useState<CustomProduct[]>([]); // Custom pricing
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false); // Duplicate ID check state
  const [isDuplicate, setIsDuplicate] = useState(false); // Duplicate ID result

  // --- Hooks ---
  const { products: productsCache, isLoading: productsLoading } =
    useProductsCache();
  const { salesmen: salesmenCache, isLoading: salesmenLoading } =
    useSalesmanCache();
  // Pass customerid only after invoiceData is loaded
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

  // --- Memoized Values ---
  const lineItems = useMemo(
    () => invoiceData?.products || [],
    [invoiceData?.products]
  );

  const isReadOnly = useMemo(() => {
    if (!invoiceData) return true; // No data, treat as read-only
    return (
      isSaving ||
      invoiceData.invoice_status === "cancelled" ||
      invoiceData.invoice_status === "paid" ||
      // Optionally make stricter: disallow edits once e-invoice submitted/processed
      (!!invoiceData.uuid && invoiceData.einvoice_status !== "invalid")
    );
  }, [
    isSaving,
    invoiceData?.invoice_status,
    invoiceData?.uuid,
    invoiceData?.einvoice_status,
  ]);

  // --- Effects ---

  // Overall page loading state depends on data hooks finishing
  useEffect(() => {
    // Page is considered loaded when invoice data *specific* loading is done,
    // AND supporting data (products, salesmen) are done.
    setIsLoadingPage(
      isLoadingInvoiceData || productsLoading || salesmenLoading
    );
  }, [isLoadingInvoiceData, productsLoading, salesmenLoading]);

  // Fetch custom product prices when customer changes
  const fetchCustomerProducts = useCallback(async (customerId: string) => {
    if (!customerId) {
      setCustomerProducts([]);
      return;
    }
    try {
      // TODO: Implement actual API call to fetch custom products
      console.log("Fetching custom products for (mock):", customerId);
      // const prods = await api.get(`/api/customer-products/${customerId}`);
      // setCustomerProducts(prods);
      setCustomerProducts([]); // Mock: clear
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
      setCustomerProducts([]); // Clear if no customer selected
    }
  }, [invoiceData?.customerid, fetchCustomerProducts]);

  // Initial Load Effect: Fetch existing invoice or setup a new one
  useEffect(() => {
    if (state?.previousPath) {
      setPreviousPath(state.previousPath);
    }

    if (isNewInvoice) {
      setIsLoadingInvoiceData(false); // Not loading existing data
      const newInv: ExtendedInvoiceData = {
        id: "", // Empty ID, user/logic needs to set this
        salespersonid: salesmenCache.length > 0 ? salesmenCache[0].id : "", // Default to first salesman?
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
        isEditing: true, // New invoices are always in editing mode initially
      };
      setInvoiceData(newInv);
      setInitialInvoiceData(structuredClone(newInv));
      // setIsLoadingPage(false); // Handled by the general isLoadingPage effect
    } else if (id) {
      // Fetch existing invoice details using the utility function
      const fetchInvoiceDetails = async (invoiceId: string) => {
        setIsLoadingInvoiceData(true);
        setError(null);
        try {
          console.log(`Fetching invoice ${invoiceId}...`);
          const fetchedInvoice = await getInvoiceById(invoiceId);
          setInvoiceData(fetchedInvoice);
          setInitialInvoiceData(structuredClone(fetchedInvoice));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNewInvoice, state?.previousPath, salesmenCache]); // Added salesmenCache as potential dep for default

  // Effect to select initial customer after data loads
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
      // Consider fetching customer details specifically if not in initial list from hook
    }
  }, [
    isLoadingPage,
    isNewInvoice,
    invoiceData?.customerid,
    customers,
    selectedCustomer,
    setSelectedCustomer,
  ]);

  // Effect to detect form changes by comparing current vs initial state
  useEffect(() => {
    if (initialInvoiceData && invoiceData) {
      // Simple JSON comparison. For deep objects, consider a library like `fast-deep-equal`.
      const currentSnapshot = JSON.stringify(invoiceData);
      const initialSnapshot = JSON.stringify(initialInvoiceData);
      setIsFormChanged(currentSnapshot !== initialSnapshot);
    } else {
      setIsFormChanged(false);
    }
  }, [invoiceData, initialInvoiceData]);

  // Effect to recalculate totals whenever products or rounding change
  useEffect(() => {
    if (!invoiceData) return;

    let subtotal = 0;
    let taxTotal = 0;
    invoiceData.products.forEach((item) => {
      if (!item.issubtotal && !item.istotal) {
        // Exclude subtotal/total rows from calc
        subtotal += (Number(item.quantity) || 0) * (Number(item.price) || 0);
        taxTotal += Number(item.tax) || 0;
      }
    });

    const rounding = Number(invoiceData.rounding) || 0;
    // Ensure totals are calculated correctly (Subtotal + Tax + Rounding)
    const totalPayable = subtotal + taxTotal + rounding;

    // Update state only if calculated values differ from current state to prevent infinite loops
    if (
      Math.abs(invoiceData.total_excluding_tax - subtotal) > 0.001 || // Use tolerance for float comparison
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
            }
          : null
      );
    }
  }, [invoiceData?.products, invoiceData?.rounding]); // invoiceData needed in dep array for direct access

  // Debounced Duplicate Check Function
  const checkDuplicateDebounced = useCallback(
    debounce(async (invoiceIdToCheck: string) => {
      // Only perform check for NEW invoices when an ID is entered
      if (!isNewInvoice || !invoiceIdToCheck) {
        setIsDuplicate(false);
        setIsCheckingDuplicate(false);
        return;
      }

      setIsCheckingDuplicate(true);
      try {
        // Assuming checkDuplicateInvoiceNo expects just the number part
        const numberPart =
          invoiceIdToCheck.startsWith("I") || invoiceIdToCheck.startsWith("C")
            ? invoiceIdToCheck.slice(1)
            : invoiceIdToCheck;

        if (!numberPart) {
          // If only prefix was entered
          setIsDuplicate(false);
          setIsCheckingDuplicate(false);
          return;
        }

        const isDup = await checkDuplicateInvoiceNo(numberPart);
        setIsDuplicate(isDup);
        if (isDup) {
          toast.error(`Invoice number ${numberPart} already exists!`);
        } else {
          // Optionally show a success/available message if desired
          // toast.success(`Invoice number ${numberPart} is available.`);
        }
      } catch (error) {
        // Error is handled within checkDuplicateInvoiceNo, maybe log here too
        console.error("Duplicate check failed:", error);
        setIsDuplicate(false); // Assume not duplicate on error during check
      } finally {
        setIsCheckingDuplicate(false);
      }
    }, 500), // 500ms debounce delay
    [isNewInvoice] // Dependency: only relevant for new invoices
  );

  // --- Input & Action Handlers ---

  const handleBackClick = () => {
    if (isFormChanged && !isSaving && !isReadOnly) {
      // Check readOnly too
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
    if (
      isNewInvoice ||
      !invoiceData ||
      invoiceData.invoice_status === "cancelled"
    ) {
      toast.error(
        isNewInvoice
          ? "Cannot cancel a new invoice."
          : "This invoice is already cancelled."
      );
      return;
    }
    setShowCancelConfirmation(true);
  };

  const handleConfirmCancelInvoice = async () => {
    if (!invoiceData || !invoiceData.id || isNewInvoice || isSaving) return;

    const toastId = toast.loading("Cancelling invoice...");
    setIsSaving(true);
    setShowCancelConfirmation(false);

    try {
      const cancelledInvoiceData = await cancelInvoice(invoiceData.id);
      setInvoiceData(cancelledInvoiceData); // Update state with cancelled data
      setInitialInvoiceData(structuredClone(cancelledInvoiceData)); // Reset initial state
      setIsFormChanged(false); // Reset change flag
      toast.success("Invoice cancelled successfully.", { id: toastId });
      // Stay on page, it's now read-only
    } catch (error: any) {
      // Error toast handled by utility
      // toast.error(`Failed to cancel invoice: ${error.message}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  // Update header fields (Generic)
  const handleHeaderInputChange = useCallback(
    (field: keyof ExtendedInvoiceData, value: any) => {
      if (isReadOnly) return; // Prevent changes if read-only

      setInvoiceData((prev) => {
        if (!prev) return null;

        // Handle Invoice ID specifically for prefix logic
        if (field === "id" && typeof value === "string") {
          const numberPart =
            value.startsWith("I") || value.startsWith("C")
              ? value.slice(1)
              : value;
          const currentPrefix = prev.paymenttype === "CASH" ? "C" : "I";
          return { ...prev, id: numberPart }; // Store only number part
        }

        // Handle Payment Type change and update ID prefix display logic elsewhere (InvoiceHeader)
        if (field === "paymenttype") {
          // ID prefix logic is handled in InvoiceHeader displayValue
          return { ...prev, paymenttype: value };
        }

        // Default update for other fields
        return { ...prev, [field]: value };
      });
    },
    [isReadOnly] // Add isReadOnly dependency
  );

  // Customer selection from Combobox
  const handleCustomerSelectionChange = useCallback(
    (customer: Customer | null) => {
      if (isReadOnly) return;
      setSelectedCustomer(customer); // Update the selected customer object from the hook
      setInvoiceData((prev) =>
        prev
          ? {
              ...prev,
              customerid: customer ? customer.id : "",
              customerName: customer ? customer.name : "", // Store name for display fallback
            }
          : null
      );
      // Trigger fetch for custom products if needed
      if (customer) {
        fetchCustomerProducts(customer.id);
      } else {
        setCustomerProducts([]);
      }
    },
    [isReadOnly, setSelectedCustomer, fetchCustomerProducts]
  );

  // Line item changes from table
  const handleLineItemsChange = useCallback(
    (updatedItems: ProductItem[]) => {
      if (isReadOnly) return;
      // Ensure UIDs exist on all items
      const itemsWithUid = updatedItems.map((item) => ({
        ...item,
        uid: item.uid || crypto.randomUUID(),
      }));
      setInvoiceData((prev) =>
        prev ? { ...prev, products: itemsWithUid } : null
      );
    },
    [isReadOnly]
  );

  // Rounding change from totals component
  const handleRoundingChange = useCallback(
    (newRounding: number) => {
      if (isReadOnly) return;
      setInvoiceData((prev) =>
        prev ? { ...prev, rounding: parseFloat(newRounding.toFixed(2)) } : null
      );
    },
    [isReadOnly]
  );

  // Add new row to line items
  const handleAddRow = () => {
    if (isReadOnly || !invoiceData) return;
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
    handleLineItemsChange([...invoiceData.products, newRow]); // Use existing handler
  };

  // Add subtotal row
  const handleAddSubtotal = () => {
    if (isReadOnly || !invoiceData) return;
    let runningTotal = 0;
    // Calculate running total since last subtotal or beginning
    for (let i = invoiceData.products.length - 1; i >= 0; i--) {
      const item = invoiceData.products[i];
      if (item.issubtotal) break; // Stop at the previous subtotal
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
      total: runningTotal.toFixed(2), // Use calculated running total
      issubtotal: true,
    };
    handleLineItemsChange([...invoiceData.products, subtotalRow]);
  };

  // SAVE (Create or Update)
  const handleSaveClick = async () => {
    if (!invoiceData || isSaving || isReadOnly) return; // Prevent save if read-only

    // --- Validation ---
    let errors: string[] = [];
    const numberPartId = invoiceData.id; // Assumes ID in state is just the number part now

    if (!numberPartId) errors.push("Invoice Number is required.");
    if (isNewInvoice && numberPartId && isCheckingDuplicate) {
      toast.error("Please wait for duplicate check.");
      return;
    }
    if (isNewInvoice && numberPartId && isDuplicate)
      errors.push(`Invoice Number ${numberPartId} is already taken.`);
    if (!invoiceData.customerid) errors.push("Customer is required.");
    if (!invoiceData.salespersonid) errors.push("Salesman is required.");
    // Basic check for valid date string
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
        // Add quantity/price > 0 checks?
        if (Number(item.quantity || 0) <= 0)
          errors.push(`Item #${index + 1}: Quantity must be positive.`);
        if (Number(item.price || 0) < 0)
          errors.push(`Item #${index + 1}: Price cannot be negative.`);
      });
    }
    if (errors.length > 0) {
      errors.forEach((err) => toast.error(err, { duration: 4000 }));
      return;
    }
    // --- End Validation ---

    setIsSaving(true);
    const toastId = toast.loading(
      isNewInvoice ? "Creating Invoice..." : "Updating Invoice..."
    );

    const dataToSend = { ...invoiceData };

    try {
      let savedInvoice: ExtendedInvoiceData;
      if (isNewInvoice) {
        savedInvoice = await createInvoice(dataToSend); // Pass data with full ID
        toast.success(`Invoice ${savedInvoice.id} created!`, { id: toastId });
        navigate(`/sales/invoice/${savedInvoice.id}`, { replace: true }); // Navigate to new ID
      } else {
        savedInvoice = await updateInvoice(dataToSend); // Pass data with full ID
        toast.success(`Invoice ${savedInvoice.id} updated!`, { id: toastId });
        // Update state with response (which should have the correct ID and updated data)
        setInvoiceData(savedInvoice);
        setInitialInvoiceData(structuredClone(savedInvoice));
        setIsFormChanged(false);
      }
    } catch (error: any) {
      // Error handled in utils
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render Logic ---

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

  const salesmenOptions = salesmenCache.map((s) => ({
    id: s.id,
    name: s.name || s.id,
  }));
  // Map productsCache for LineItemsTable Combobox (ensure correct price field)
  const productsForTable = productsCache.map((product) => ({
    uid: crypto.randomUUID(), // Use UUID for temporary key
    id: product.id, // Keep original ID as string
    code: product.id, // Product Code/ID
    description: product.description,
    price: product.price_per_unit, // Make sure this matches cache structure
    // Default values for a new line item when selected
    quantity: 1,
    freeProduct: 0,
    returnProduct: 0,
    tax: 0,
    total: "0.00",
    issubtotal: false,
  }));

  // --- JSX Output ---
  return (
    <div className="px-4 md:px-6 pb-8 max-w-full">
      <BackButton onClick={handleBackClick} disabled={isSaving} />

      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
        <h1 className="text-2xl font-bold text-default-900 flex-shrink-0 pr-4">
          {/* Display full ID with prefix */}
          {isNewInvoice
            ? "New Invoice"
            : `Invoice #${invoiceData.paymenttype === "CASH" ? "C" : "I"}${
                invoiceData.id
              }`}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Cancel Button */}
          {!isNewInvoice && invoiceData.invoice_status !== "cancelled" && (
            <Button
              onClick={handleCancelInvoiceClick}
              variant="outline"
              color="rose"
              size="md"
              disabled={isReadOnly || isSaving} // Disable if read-only or saving
            >
              {" "}
              Cancel Invoice{" "}
            </Button>
          )}
          {/* Save/Create Button */}
          <Button
            onClick={handleSaveClick}
            variant="filled"
            color="sky"
            size="md"
            disabled={
              isReadOnly || isSaving || (!isNewInvoice && !isFormChanged)
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

      {/* Main Content Area */}
      <div className="space-y-5">
        {/* Invoice Header Fields */}
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
            // Pass the full potential ID from state for blur check
            onInvoiceIdBlur={async (invIdInput) => {
              await checkDuplicateDebounced(invIdInput);
              return isDuplicate; // Return current state after check
            }}
            isCheckingDuplicate={isCheckingDuplicate}
            isDuplicate={isDuplicate}
            readOnly={isReadOnly} // Pass readOnly state
          />
        </section>

        {/* Line Items Section */}
        <section className="p-4 border rounded-lg bg-white shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Line Items</h2>
            {!isReadOnly && (
              <div>
                <Button
                  onClick={handleAddSubtotal}
                  variant="outline"
                  size="sm"
                  className="mr-2"
                >
                  Add Subtotal
                </Button>
                <Button onClick={handleAddRow} variant="outline" size="sm">
                  Add Item
                </Button>
              </div>
            )}
          </div>
          <LineItemsTable
            items={lineItems}
            onItemsChange={handleLineItemsChange}
            customerProducts={customerProducts}
            productsCache={productsForTable} // Pass formatted product cache
            readOnly={isReadOnly}
          />
        </section>

        {/* Totals Section */}
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

        {/* E-Invoice Details Section (Conditional Display) */}
        {!isNewInvoice && invoiceData.uuid && (
          <section className="p-4 border rounded-lg bg-white shadow-sm">
            <h2 className="text-lg font-semibold mb-3">E-Invoice Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <p>
                <strong className="text-gray-600">UUID:</strong>{" "}
                <span className="font-mono text-xs break-all">
                  {invoiceData.uuid}
                </span>
              </p>
              <p>
                <strong className="text-gray-600">Long ID:</strong>{" "}
                <span className="font-mono text-xs break-all">
                  {invoiceData.long_id || "N/A"}
                </span>
              </p>
              <p>
                <strong className="text-gray-600">Submission UID:</strong>{" "}
                <span className="font-mono text-xs break-all">
                  {invoiceData.submission_uid || "N/A"}
                </span>
              </p>
              <p>
                <strong className="text-gray-600">Validated:</strong>{" "}
                {invoiceData.datetime_validated
                  ? parseDatabaseTimestamp(invoiceData.datetime_validated)
                      .formattedTime
                  : "N/A"}
              </p>
              <p>
                <strong className="text-gray-600">Status:</strong>{" "}
                <span
                  className={`font-medium ${
                    invoiceData.einvoice_status === "valid"
                      ? "text-green-700"
                      : invoiceData.einvoice_status === "invalid"
                      ? "text-red-700"
                      : invoiceData.einvoice_status === "pending"
                      ? "text-yellow-700"
                      : invoiceData.einvoice_status === "cancelled"
                      ? "text-rose-700"
                      : "text-gray-500"
                  }`}
                >
                  {invoiceData.einvoice_status
                    ? invoiceData.einvoice_status.charAt(0).toUpperCase() +
                      invoiceData.einvoice_status.slice(1)
                    : "N/A"}
                </span>
              </p>
            </div>
          </section>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to leave? Unsaved changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showCancelConfirmation}
        onClose={() => setShowCancelConfirmation(false)}
        onConfirm={handleConfirmCancelInvoice}
        title="Cancel Invoice"
        message={`Are you sure you want to cancel Invoice #${invoiceData?.id}? This action cannot be undone and may attempt to cancel the e-invoice if submitted.`}
        confirmButtonText="Confirm Cancellation"
        variant="danger"
      />
    </div>
  );
};

export default InvoiceDetailsPagev2;

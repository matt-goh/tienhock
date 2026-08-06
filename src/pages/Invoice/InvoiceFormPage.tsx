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
import {
  addMoney,
  multiplyMoney,
  sumMoney,
  roundMoney,
} from "../../utils/moneyUtils";
import BackButton from "../../components/BackButton";
import { useSmartBack } from "../../hooks/useSmartBack";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import InvoiceHeader from "../../components/Invoice/InvoiceHeader";
import LineItemsTable from "../../components/Invoice/LineItemsTable";
import InvoiceTotals from "../../components/Invoice/InvoiceTotals";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import { useCustomersCache } from "../../utils/catalogue/useCustomerCache";
import {
  checkDuplicateInvoiceNo,
  createInvoice,
  createPayment,
} from "../../utils/invoice/InvoiceUtils";
import { isZeroValueBill } from "../../utils/invoice/invoiceDisplayStatus";
import {
  SaleTender,
  addTender,
  createTender,
  roundTenderAmount,
  sumTenders,
  syncTenderAmounts,
  tenderNeedsReference,
  tenderReferenceLabel,
  toTenderPayload,
  validateTenders,
} from "../../utils/invoice/saleTenders";
import toast from "react-hot-toast";
import {
  IconPlus,
  IconSquare,
  IconSquareCheckFilled,
  IconTrash,
} from "@tabler/icons-react";
import { FormInput } from "../../components/FormComponents";
import PillSelect, { PillSelectOption } from "../../components/PillSelect";
import { api } from "../../routes/utils/api";
// --- MODAL IMPORT ---
import SubmissionResultsModal from "../../components/Invoice/SubmissionResultsModal"; // Adjust path if needed

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<PillSelectOption<string>> = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "online", label: "Online" },
];

const InvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sales/invoice");

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
  // What was actually tendered at the counter. One line is the ordinary case
  // and behaves exactly as a single payment method did; adding a line lets a
  // bill be settled partly in cash and partly by transfer/online/cheque, which
  // is what a same-day split payment really is.
  const [tenders, setTenders] = useState<SaleTender[]>(() => [
    createTender("cash"),
  ]);
  const isSplitTender: boolean = tenders.length > 1;

  const handleTenderChange = (
    key: string,
    patch: Partial<SaleTender>
  ): void =>
    setTenders((current: SaleTender[]) =>
      current.map((tender: SaleTender) =>
        tender.key === key
          ? {
              ...tender,
              ...patch,
              // Typing an amount stops it tracking the bill total.
              amountTouched:
                patch.amount !== undefined ? true : tender.amountTouched,
            }
          : tender
      )
    );

  const handleTenderRemove = (key: string): void =>
    setTenders((current: SaleTender[]) =>
      current.length <= 1
        ? current
        : current.filter((tender: SaleTender) => tender.key !== key)
    );

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
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const ITEMS_PER_PAGE = 30;
  const { customers: allCustomers, isLoading: isCustomersLoading } =
    useCustomersCache();
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [paginatedCustomers, setPaginatedCustomers] = useState<Customer[]>([]);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);

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
        salespersonid: salesmenCache.length > 0 ? "KILANG" : "", // Default salesman
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

  // Keep a lone untouched payment amount equal to the bill as line items change.
  useEffect(() => {
    const total = roundTenderAmount(
      Number(invoiceData?.totalamountpayable || 0)
    );
    setTenders((current: SaleTender[]) => syncTenderAmounts(current, total));
  }, [invoiceData?.totalamountpayable]);

  // Filter customers when search query changes
  useEffect(() => {
    const filtered = customerQuery
      ? allCustomers.filter(
          (customer) =>
            customer.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
            customer.id.toLowerCase().includes(customerQuery.toLowerCase()) ||
            (customer.phone_number &&
              customer.phone_number
                .toLowerCase()
                .includes(customerQuery.toLowerCase()))
        )
      : [...allCustomers];

    setFilteredCustomers(filtered);
    setCustomerPage(1); // Reset to first page on new search

    // Calculate initial page
    const firstPageItems = filtered.slice(0, ITEMS_PER_PAGE);
    setPaginatedCustomers(firstPageItems);
    setHasMoreCustomers(filtered.length > ITEMS_PER_PAGE);
  }, [customerQuery, allCustomers]);

  // Update pagination when page changes
  useEffect(() => {
    const items = filteredCustomers.slice(0, customerPage * ITEMS_PER_PAGE);
    setPaginatedCustomers(items);
    setHasMoreCustomers(
      filteredCustomers.length > customerPage * ITEMS_PER_PAGE
    );
  }, [filteredCustomers, customerPage]);

  // Initialize selected customer based on invoiceData.customerid
  useEffect(() => {
    if (
      allCustomers.length > 0 &&
      invoiceData?.customerid &&
      !selectedCustomer
    ) {
      const found = allCustomers.find((c) => c.id === invoiceData.customerid);
      if (found) {
        // Cast to Customer type as CustomerList lacks some properties
        setSelectedCustomer(found as unknown as Customer);
      }
    }
  }, [allCustomers, invoiceData?.customerid, selectedCustomer]);

  // Function to load more customers
  const loadMoreCustomers = useCallback(() => {
    if (hasMoreCustomers) {
      setCustomerPage((prev) => prev + 1);
    }
  }, [hasMoreCustomers]);

  const fetchCustomerProducts = useCallback(
    async (customerId: string) => {
      if (!customerId) {
        setCustomerProducts([]);
        setCustomerTinNumber(null);
        setCustomerIdNumber(null);
        setSubmitAsEinvoice(false); // Reset e-invoice flag if customer cleared
        return [];
      }

      // First, check if the customer is in the cache
      const cachedCustomer = allCustomers.find((c) => c.id === customerId);

      if (cachedCustomer) {
        // Handle custom products
        if (
          cachedCustomer.customProducts &&
          cachedCustomer.customProducts.length > 0
        ) {
          setCustomerProducts(cachedCustomer.customProducts);
        } else {
          setCustomerProducts([]);
        }

        // Handle TIN and ID numbers for e-invoice
        const hasTin = !!cachedCustomer.tin_number;
        const hasId = !!cachedCustomer.id_number;
        setCustomerTinNumber(hasTin ? cachedCustomer.tin_number || null : null);
        setCustomerIdNumber(hasId ? cachedCustomer.id_number || null : null);
        setSubmitAsEinvoice(hasTin && hasId);

        return cachedCustomer.customProducts || [];
      }

      // If not in cache, fallback to API call
      console.debug(
        `Customer ${customerId} not found in cache, fetching from API`
      );
      try {
        const response = await api.get(`/api/customer-products/${customerId}`);
        if (response.products) {
          setCustomerProducts(response.products);
          if (response.customer) {
            const hasTin = !!response.customer.tin_number;
            const hasId = !!response.customer.id_number;
            setCustomerTinNumber(
              hasTin ? response.customer.tin_number || null : null
            );
            setCustomerIdNumber(
              hasId ? response.customer.id_number || null : null
            );
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
    },
    [allCustomers]
  );

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

  // Recalculate totals effect using sen-based arithmetic
  useEffect(() => {
    if (!invoiceData) return;

    // Collect amounts for sen-safe summing
    const subtotalAmounts: number[] = [];
    const taxAmounts: number[] = [];

    invoiceData.products.forEach((item) => {
      if (!item.issubtotal && !item.istotal) {
        if (item.code === "OTH" || item.code === "LESS") {
          // For 'OTH' or 'LESS' products, use price directly as the line total, ignoring quantity.
          subtotalAmounts.push(Number(item.price) || 0);
        } else {
          // For all other products, calculate total as quantity * price.
          const quantity = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          subtotalAmounts.push(multiplyMoney(price, quantity));
        }
        taxAmounts.push(Number(item.tax) || 0);
      }
    });

    const subtotal = sumMoney(subtotalAmounts);
    const taxTotal = sumMoney(taxAmounts);
    const rounding = Number(invoiceData.rounding) || 0;
    const totalPayable = addMoney(addMoney(subtotal, taxTotal), rounding);

    if (
      Math.abs(invoiceData.total_excluding_tax - subtotal) > 0.001 ||
      Math.abs(invoiceData.tax_amount - taxTotal) > 0.001 ||
      Math.abs(invoiceData.totalamountpayable - totalPayable) > 0.001
    ) {
      setInvoiceData((prev) =>
        prev
          ? {
              ...prev,
              total_excluding_tax: roundMoney(subtotal),
              tax_amount: roundMoney(taxTotal),
              totalamountpayable: roundMoney(totalPayable),
              balance_due: roundMoney(totalPayable), // Set balance initially
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
      goBack();
    }
  };
  const handleConfirmBack = () => {
    // Logic remains the same
    setShowBackConfirmation(false);
    goBack();
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
    // Logic using sen-based arithmetic for subtotal calculations
    (updatedItems: ProductItem[]) => {
      const itemsWithUid = updatedItems.map((item) => ({
        ...item,
        uid: item.uid || crypto.randomUUID(),
      }));

      // Collect amounts for sen-safe subtotal calculation
      const runningTotalAmounts: number[] = [];
      const recalculatedItems = itemsWithUid.map((item) => {
        if (!item.issubtotal && !item.istotal) {
          const itemTotal = parseFloat(item.total || "0");
          runningTotalAmounts.push(itemTotal);
          return item;
        } else if (item.issubtotal) {
          const subtotal = sumMoney(runningTotalAmounts);
          return { ...item, total: subtotal.toFixed(2) };
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
    // Logic using sen-based arithmetic
    (newRounding: number) => {
      setInvoiceData((prev) =>
        prev ? { ...prev, rounding: roundMoney(newRounding) } : null
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
    // Logic using sen-based arithmetic
    if (!invoiceData) return;
    const totalsToSum: number[] = [];
    for (let i = invoiceData.products.length - 1; i >= 0; i--) {
      const item = invoiceData.products[i];
      if (item.issubtotal) break;
      if (!item.istotal) {
        totalsToSum.push(parseFloat(item.total || "0"));
      }
    }
    const runningTotal = sumMoney(totalsToSum);
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

  // Every tender line carries its own amount. A lone untouched line tracks the
  // bill total, so "paid in full" needs no typing — but the box is always
  // there, which is what lets one payment settle only part of the bill.
  const billTotal: number = roundTenderAmount(
    Number(invoiceData?.totalamountpayable || 0)
  );
  const tenderedTotal: number = sumTenders(tenders);
  const tenderRemaining: number = roundTenderAmount(billTotal - tenderedTotal);
  const tendersBalance: boolean = Math.abs(tenderRemaining) <= 0.005;
  // A credit invoice may be part-paid now and collected for the rest later —
  // the usual case, since the second payment often lands days afterwards. A
  // cash bill is cash-and-carry and carries no balance, so it must be settled
  // in full.
  const allowPartialTender: boolean = invoiceData?.paymenttype !== "CASH";

  const handleTenderAdd = (): void =>
    setTenders((current: SaleTender[]) => addTender(current, billTotal));

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
        if (item.code !== "LESS" && Number(item.price || 0) < 0)
          errors.push(`Item #${index + 1}: Price cannot be negative.`);
      });
    }
    if (isPaid) {
      errors.push(...validateTenders(tenders, billTotal, allowPartialTender));
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

      // Everything tendered at the counter, one entry per way the customer
      // paid. The server keeps the cash part as the automatic CH_REV1
      // collection and turns each other line into its own receipt.
      const tenderPayload = toTenderPayload(tenders, billTotal);

      let invoiceDataToSubmit = { ...invoiceData };
      if (invoiceData.paymenttype === "CASH" && isPaid) {
        invoiceDataToSubmit = {
          ...invoiceDataToSubmit,
          payments: tenderPayload,
          payment_notes: "Payment automatically recorded for CASH invoices",
        };
      }

      const savedInvoice = await createInvoice(invoiceDataToSubmit);
      invoiceIdForNavigation = savedInvoice.id; // Store the successfully created ID
      toast.success(`Invoice ${invoiceIdForNavigation} created!`, {
        id: toastId,
      }); // Initial success toast

      // 3. Create Payment (if needed)
      if (isPaid) {
        toast.loading("Recording payment...", { id: toastId });

        // Don't attempt to create a payment for CASH invoices - they are automatically paid by the backend
        if (invoiceData.paymenttype !== "CASH") {
          try {
            // One receipt per tender. Cash collected on the bill's own sale
            // day lands in CH_REV1; anything banked goes to its bank account.
            for (const tender of tenderPayload) {
              await createPayment({
                invoice_id: invoiceIdForNavigation,
                payment_date: new Date(
                  Number(invoiceData.createddate)
                ).toISOString(),
                amount_paid: tender.amount,
                payment_method: tender.payment_method,
                payment_reference: tender.payment_reference,
              } as Omit<Payment, "payment_id" | "created_at">);
            }
            toast.success(
              tenderRemaining > 0.005
                ? `Invoice ${invoiceIdForNavigation} created — RM${tenderRemaining.toFixed(2)} still outstanding.`
                : `Invoice ${invoiceIdForNavigation} created and paid!`,
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
          // For CASH invoices, they are already paid by backend with our specified payment method
          toast.success(`CASH Invoice ${invoiceIdForNavigation} created!`, {
            id: toastId,
          });
        }
      }

      // 4. Submit e-Invoice (if checked and eligible)
      const shouldSubmitEinvoice =
        submitAsEinvoice &&
        customerTinNumber &&
        customerIdNumber &&
        !isZeroValueBill(invoiceData) &&
        isInvoiceDateEligibleForEinvoice(invoiceData.createddate);

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

  // A bill totalling RM0.00 - returns being recorded, goods given away free, or
  // no quantities at all - has no sales value. MyInvois rejects every one, so
  // they are covered by the monthly consolidated e-Invoice instead.
  const isNoValueBill: boolean = isZeroValueBill(invoiceData);

  // Determine if e-invoice checkbox should be enabled
  const canSubmitEinvoice =
    !!customerTinNumber &&
    !!customerIdNumber &&
    !isNoValueBill &&
    isInvoiceDateEligibleForEinvoice(invoiceData.createddate);

  // --- JSX Output ---
  return (
    <div className="space-y-4">
      {/* Unified Card - All Sections Connected */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
            <div className="flex items-center gap-4">
              <BackButton onClick={handleBackClick} disabled={isSaving} />
              <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                New Invoice
              </h1>
            </div>
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
        </div>

        {/* Invoice Header Fields */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700">
          <InvoiceHeader
            invoice={invoiceData}
            onInputChange={handleHeaderInputChange}
            isNewInvoice={true}
            customers={paginatedCustomers as unknown as Customer[]}
            salesmen={salesmenOptions}
            selectedCustomer={selectedCustomer}
            onCustomerChange={handleCustomerSelectionChange}
            customerQuery={customerQuery}
            setCustomerQuery={setCustomerQuery}
            onLoadMoreCustomers={loadMoreCustomers}
            hasMoreCustomers={hasMoreCustomers}
            isFetchingCustomers={isCustomersLoading}
            readOnly={isSaving}
          />
        </div>

        {/* Line Items Section */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100">
              Line Items
            </h2>
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
            readOnly={isSaving}
          />
        </div>

        {/* Totals & Payment Section. Two tracks on large screens - payment
            options flex, totals keep a fixed 20rem column - and stack in that
            order on anything narrower. */}
        <div className="p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
          {/* Left Side: Paid / e-Invoice toggles & Payment Details */}
          <div className="space-y-4">
            {/* Both toggles share one wrapping row so they read as a pair.
                They used to be separate columns of a flex row that never
                stacked, which squeezed them together on narrow screens. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
                } ${isSaving ? "cursor-not-allowed opacity-50" : ""}`}
                disabled={isSaving || invoiceData?.paymenttype === "CASH"}
                title={
                  invoiceData?.paymenttype === "CASH"
                    ? "Cash invoices are always paid"
                    : ""
                }
              >
                {isPaid ? (
                  <IconSquareCheckFilled className="text-blue-600" size={20} />
                ) : (
                  <IconSquare
                    className="text-default-400 dark:text-gray-500"
                    size={20}
                  />
                )}
                <span className="ml-2 font-medium text-sm text-default-900 dark:text-gray-100">
                  {invoiceData?.paymenttype === "CASH"
                    ? "Cash Payment"
                    : "Record Payment"}
                </span>
              </button>

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
                  isNoValueBill
                    ? "This bill totals RM0.00 and has no sales value, so it does not need its own e-Invoice"
                    : !canSubmitEinvoice
                    ? "Customer must have TIN and ID number for e-invoicing"
                    : ""
                }
              >
                {submitAsEinvoice ? (
                  <IconSquareCheckFilled className="text-blue-600" size={20} />
                ) : (
                  <IconSquare
                    className="text-default-400 dark:text-gray-500"
                    size={20}
                  />
                )}
                <span className="ml-2 font-medium text-sm truncate text-default-900 dark:text-gray-100">
                  Submit e-Invoice upon saving
                </span>
              </button>
            </div>

            {isPaid && (
              <div className="space-y-3">
                {tenders.map((tender: SaleTender, index: number) => (
                  <div
                    key={tender.key}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
                        {isSplitTender
                          ? `Payment ${index + 1}`
                          : "Payment Method"}
                      </label>
                      <PillSelect<string>
                        value={tender.payment_method}
                        onChange={(value: string) =>
                          handleTenderChange(tender.key, {
                            payment_method: value as Payment["payment_method"],
                          })
                        }
                        options={PAYMENT_METHOD_OPTIONS}
                        disabled={isSaving}
                        ariaLabel={`Payment method ${index + 1}`}
                        size="md"
                      />
                    </div>
                    {/* The money/reference inputs carry their own width so a
                        tender row lines up with the next one instead of each
                        input sizing itself to its label. */}
                    <div className="w-full sm:w-40">
                      <FormInput
                        name={`tenderAmount-${tender.key}`}
                        label="Amount"
                        type="number"
                        step="0.01"
                        value={tender.amount}
                        onChange={(e) =>
                          handleTenderChange(tender.key, {
                            amount: e.target.value,
                          })
                        }
                        placeholder="0.00"
                        disabled={isSaving}
                      />
                    </div>
                    {tenderNeedsReference(tender.payment_method) && (
                      <div className="w-full sm:w-56">
                        <FormInput
                          name={`tenderReference-${tender.key}`}
                          label={tenderReferenceLabel(tender.payment_method)}
                          value={tender.payment_reference}
                          onChange={(e) =>
                            handleTenderChange(tender.key, {
                              payment_reference: e.target.value,
                            })
                          }
                          placeholder="Enter reference"
                          disabled={isSaving}
                        />
                      </div>
                    )}
                    {isSplitTender && (
                      <button
                        type="button"
                        onClick={() => handleTenderRemove(tender.key)}
                        disabled={isSaving}
                        className="mb-1.5 rounded-md p-1.5 text-default-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
                        title={`Remove payment ${index + 1}`}
                      >
                        <IconTrash size={18} />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTenderAdd}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 transition-colors hover:text-sky-700 disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300"
                  >
                    <IconPlus size={16} />
                    {isSplitTender ? "Add another payment" : "Split payment"}
                  </button>
                  {billTotal > 0.005 && !tendersBalance && (
                    <span
                      className={`text-sm font-medium ${
                        tenderRemaining > 0 && allowPartialTender
                          ? "text-sky-600 dark:text-sky-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {tenderRemaining < 0
                        ? `RM${Math.abs(tenderRemaining).toFixed(2)} over the RM${billTotal.toFixed(2)} bill`
                        : allowPartialTender
                        ? `RM${tenderRemaining.toFixed(2)} of RM${billTotal.toFixed(2)} stays outstanding — collect it later`
                        : `RM${tenderRemaining.toFixed(2)} left of RM${billTotal.toFixed(2)} — a cash bill must be paid in full`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Invoice Totals */}
          <div className="w-full">
            <InvoiceTotals
              subtotal={invoiceData.total_excluding_tax}
              taxTotal={invoiceData.tax_amount}
              rounding={invoiceData.rounding}
              grandTotal={invoiceData.totalamountpayable}
              onRoundingChange={handleRoundingChange}
              readOnly={isSaving}
            />
          </div>
        </div>
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

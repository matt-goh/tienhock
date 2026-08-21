// src/pages/JellyPolly/InvoiceFormPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
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
} from "../../utils/JellyPolly/InvoiceUtils";
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
import { useTranslation } from "react-i18next";
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
import TimeNavigator, {
  type TimeRange,
} from "../../components/TimeNavigator";

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<PillSelectOption<string>> = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "online", label: "Online" },
];

const InvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const goBack = useSmartBack("/jellypolly/sales/invoice");
  const { t } = useTranslation("jellypolly");

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
  // What was tendered for this bill. One line behaves exactly as a single
  // payment method did; adding a line lets a bill be part cash and part
  // transfer/online, and a credit invoice may be part-paid now with the
  // balance collected days later.
  const [tenders, setTenders] = useState<SaleTender[]>(() => [
    createTender("cash"),
  ]);
  const isSplitTender: boolean = tenders.length > 1;

  const handleTenderChange = (key: string, patch: Partial<SaleTender>): void =>
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
    useProductsCache("jp");
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
        toast.error(t("Could not load custom product prices."));
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

  // Recalculate totals effect (remains the same)
  useEffect(() => {
    if (!invoiceData) return;

    let subtotal = 0;
    let taxTotal = 0;
    invoiceData.products.forEach((item) => {
      if (!item.issubtotal && !item.istotal) {
        if (item.code === "OTH" || item.code === "LESS") {
          // For 'OTH' or 'LESS' products, use price directly as the line total, ignoring quantity.
          subtotal += Number(item.price) || 0;
        } else {
          // For all other products, calculate total as quantity * price.
          subtotal += (Number(item.quantity) || 0) * (Number(item.price) || 0);
        }
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
      navigate(`/jellypolly/sales/invoice/${invoiceData.id}`, {
        replace: true,
        state: { previousPath: "/jellypolly/sales/invoice" },
      });
    }
    // Optionally clear results after closing
    // setEinvoiceResults(null);
  };

  // --- UPDATED CREATE INVOICE ---
  // A single tender always covers the whole bill. Once split, each line
  // carries its own amount; a credit invoice may leave a balance outstanding
  // while a cash bill must be settled in full.
  const billTotal: number = roundTenderAmount(
    Number(invoiceData?.totalamountpayable || 0)
  );
  // Untouched split payments follow the invoice date (same-day default).
  const defaultPaymentDate: Date = useMemo(() => {
    const parsed = invoiceData?.createddate
      ? new Date(Number(invoiceData.createddate))
      : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  }, [invoiceData?.createddate]);
  const tenderedTotal: number = sumTenders(tenders);
  const tenderRemaining: number = roundTenderAmount(billTotal - tenderedTotal);
  const tendersBalance: boolean = Math.abs(tenderRemaining) <= 0.005;
  const allowPartialTender: boolean = invoiceData?.paymenttype !== "CASH";

  const handleTenderAdd = (): void =>
    setTenders((current: SaleTender[]) => addTender(current, billTotal));

  const handleCreateInvoice = async () => {
    if (!invoiceData || isSaving) return; // Use overall isSaving for initial block

    // --- Validation (remains the same) ---
    let errors: string[] = [];
    const numberPartId = invoiceData.id;
    if (!numberPartId) errors.push(t("Invoice Number is required."));
    if (!invoiceData.customerid) errors.push(t("Customer is required."));
    if (!invoiceData.salespersonid) errors.push(t("Salesman is required."));
    if (!invoiceData.createddate || isNaN(parseInt(invoiceData.createddate)))
      errors.push(t("Valid Date/Time is required."));
    const itemsToValidate = lineItems.filter(
      (li) => !li.issubtotal && !li.istotal
    );
    if (itemsToValidate.length === 0) {
      errors.push(t("Invoice must have at least one product item."));
    } else {
      itemsToValidate.forEach((item, index) => {
        if (!item.code || !item.description)
          errors.push(
            t("Item #{{number}}: Product code and description required.", {
              number: index + 1,
            })
          );
        if (item.code !== "LESS" && Number(item.price || 0) < 0)
          errors.push(
            t("Item #{{number}}: Price cannot be negative.", {
              number: index + 1,
            })
          );
      });
    }
    if (isPaid) {
      errors.push(
        ...validateTenders(tenders, billTotal, allowPartialTender, t)
      );
    }
    if (errors.length > 0) {
      errors.forEach((err) => toast.error(err, { duration: 4000 }));
      return;
    }

    // --- Start Saving Process ---
    setIsSaving(true); // Set overall saving state
    let invoiceIdForNavigation: string | null = null; // To store the ID for potential navigation later
    const toastId = toast.loading(t("Checking invoice number..."));

    try {
      // 1. Check for duplicates
      const isDuplicate = await checkDuplicateInvoiceNo(invoiceData.id);
      if (isDuplicate) {
        throw new Error(`Invoice ${invoiceData.id} already exists`);
      }

      // 2. Create Invoice
      toast.loading(t("Creating invoice..."), { id: toastId });

      // Everything tendered for this bill, one entry per way it was paid.
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
      toast.success(
        t("Invoice {{id}} created!", { id: invoiceIdForNavigation }),
        {
          id: toastId,
        }
      ); // Initial success toast

      // 3. Create Payment (if needed)
      if (isPaid) {
        toast.loading(t("Recording payment..."), { id: toastId });

        // Don't attempt to create a payment for CASH invoices - they are automatically paid by the backend
        if (invoiceData.paymenttype !== "CASH") {
          try {
            for (const tender of tenderPayload) {
              await createPayment({
                invoice_id: invoiceIdForNavigation,
                payment_date:
                  tender.payment_date ??
                  format(defaultPaymentDate, "yyyy-MM-dd"),
                amount_paid: tender.amount,
                payment_method: tender.payment_method,
                payment_reference: tender.payment_reference,
              } as Omit<Payment, "payment_id" | "created_at">);
            }
            toast.success(
              tenderRemaining > 0.005
                ? t("Invoice {{id}} created — RM{{remaining}} still outstanding.", {
                    id: invoiceIdForNavigation,
                    remaining: tenderRemaining.toFixed(2),
                  })
                : t("Invoice {{id}} created and paid!", {
                    id: invoiceIdForNavigation,
                  }),
              {
                id: toastId,
              }
            ); // Update toast
          } catch (paymentError: any) {
            // Payment failed, but invoice created. Show error, but proceed maybe?
            toast.error(
              t(
                "Invoice {{id}} created, but payment failed: {{message}}. E-invoice submission skipped.",
                {
                  id: invoiceIdForNavigation,
                  message: paymentError.message,
                }
              ),
              { id: toastId, duration: 6000 }
            );
            // Decide if you want to stop here or still attempt e-invoice if checked?
            // For safety, let's stop if payment fails when expected.
            setIsSaving(false); // Stop saving process
            return; // Exit the function
          }
        } else {
          // For CASH invoices, they are already paid by backend with our specified payment method
          toast.success(
            t("CASH Invoice {{id}} created!", {
              id: invoiceIdForNavigation,
            }),
            {
              id: toastId,
            }
          );
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
          const einvoiceResponse = await api.post(
            "/jellypolly/api/einvoice/submit",
            {
              invoiceIds: [invoiceIdForNavigation], // Use the saved ID
            }
          );
          setEinvoiceResults(einvoiceResponse); // Set results for the modal
          // Modal will display success/failure based on einvoiceResponse.success
        } catch (einvoiceError: any) {
          console.error("E-invoice submission API error:", einvoiceError);
          // Create a synthetic error response for the modal
          setEinvoiceResults({
            success: false,
            message: t("E-invoice submission failed: {{message}}", {
              message:
                einvoiceError?.response?.data?.message ||
                einvoiceError.message ||
                t("Network error"),
            }),
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
        navigate(`/jellypolly/sales/invoice/${invoiceIdForNavigation}`, {
          replace: true,
          state: { previousPath: "/jellypolly/sales/invoice" },
        });
      }
    } catch (error: any) {
      // Handle errors from duplicate check or createInvoice
      toast.error(error.message || t("Error creating invoice"), {
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
              <div className="h-6 w-px bg-default-300"></div>
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                {t("New Invoice")}
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
                  ? t("Saving...")
                  : isPaid
                  ? t("Create & Mark Paid")
                  : t("Create Invoice")}
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">{t("Line Items")}</h2>
            <div>
              <Button
                onClick={handleAddSubtotal}
                variant="outline"
                size="sm"
                className="mr-2"
                disabled={isSaving}
              >
                {t("Add Subtotal")}
              </Button>
              <Button
                onClick={handleAddRow}
                variant="outline"
                size="sm"
                disabled={isSaving}
              >
                {t("Add Item")}
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

        {/* Totals & Payment Section */}
        <div className="p-4 flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex w-full gap-4">
            {/* Left Side: Paid Checkbox & Payment Details */}
            <div className="w-full md:w-2/5 space-y-4">
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
                  } ${isSaving ? "cursor-not-allowed opacity-50" : ""}`}
                  disabled={isSaving || invoiceData?.paymenttype === "CASH"}
                  title={
                    invoiceData?.paymenttype === "CASH"
                      ? t("Cash invoices are always paid")
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
                      ? t("Cash Payment")
                      : t("Mark as Paid")}
                  </span>
                </button>
              </div>
              {isPaid && (
                <div className="w-full space-y-3">
                  {tenders.map((tender: SaleTender, index: number) => (
                    <div
                      key={tender.key}
                      className="flex flex-wrap items-end gap-3 w-full"
                    >
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
                          {isSplitTender
                            ? t("Payment {{number}}", {
                                number: index + 1,
                              })
                            : t("Payment Method")}
                        </label>
                        <PillSelect<string>
                          value={tender.payment_method}
                          onChange={(value: string) =>
                            handleTenderChange(tender.key, {
                              payment_method:
                                value as Payment["payment_method"],
                            })
                          }
                          options={PAYMENT_METHOD_OPTIONS.map((o) => ({
                            ...o,
                            label: t(o.label),
                          }))}
                          disabled={isSaving}
                          ariaLabel={t("Payment method {{number}}", {
                            number: index + 1,
                          })}
                          size="md"
                        />
                      </div>
                      {invoiceData.paymenttype !== "CASH" && (
                        <div className="w-full sm:w-44">
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
                              {t("Payment Date")}
                            </label>
                            <TimeNavigator
                              range={{
                                start: tender.payment_date
                                  ? new Date(
                                      `${tender.payment_date}T00:00:00`
                                    )
                                  : defaultPaymentDate,
                                end: tender.payment_date
                                  ? new Date(
                                      `${tender.payment_date}T00:00:00`
                                    )
                                  : defaultPaymentDate,
                              }}
                              onChange={(range: TimeRange) =>
                                handleTenderChange(tender.key, {
                                  payment_date: format(
                                    range.start,
                                    "yyyy-MM-dd"
                                  ),
                                })
                              }
                              modes={["day"]}
                              presets={false}
                              showArrows={false}
                              allowFuture
                              size="md"
                              disabled={isSaving}
                            />
                          </div>
                        </div>
                      )}
                      <div className="w-full sm:w-40">
                        <FormInput
                          name={`tenderAmount-${tender.key}`}
                          label={t("Amount")}
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
                        <FormInput
                          name={`tenderReference-${tender.key}`}
                          label={t(
                            tenderReferenceLabel(tender.payment_method)
                          )}
                          value={tender.payment_reference}
                          onChange={(e) =>
                            handleTenderChange(tender.key, {
                              payment_reference: e.target.value,
                            })
                          }
                          placeholder={t("Enter reference")}
                          disabled={isSaving}
                        />
                      )}
                      {isSplitTender && (
                        <button
                          type="button"
                          onClick={() => handleTenderRemove(tender.key)}
                          disabled={isSaving}
                          className="mb-1.5 rounded-md p-1.5 text-default-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
                          title={t("Remove payment {{number}}", {
                            number: index + 1,
                          })}
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
                      {t(
                        isSplitTender
                          ? "Add another payment"
                          : "Split payment"
                      )}
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
                          ? t("RM{{amount}} over the RM{{total}} bill", {
                              amount: Math.abs(tenderRemaining).toFixed(2),
                              total: billTotal.toFixed(2),
                            })
                          : allowPartialTender
                          ? t(
                              "RM{{amount}} of RM{{total}} stays outstanding — collect it later",
                              {
                                amount: tenderRemaining.toFixed(2),
                                total: billTotal.toFixed(2),
                              }
                            )
                          : t(
                              "RM{{amount}} left of RM{{total}} — a cash bill must be paid in full",
                              {
                                amount: tenderRemaining.toFixed(2),
                                total: billTotal.toFixed(2),
                              }
                            )}
                      </span>
                    )}
                  </div>
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
                  isNoValueBill
                    ? t(
                        "This bill totals RM0.00 and has no sales value, so it does not need its own e-Invoice"
                      )
                    : !canSubmitEinvoice
                    ? t("Customer must have TIN and ID number for e-invoicing")
                    : ""
                }
              >
                {submitAsEinvoice ? (
                  <IconSquareCheckFilled className="text-blue-600" size={20} />
                ) : (
                  <IconSquare className="text-default-400" size={20} />
                )}
                <span className="ml-2 font-medium text-sm truncate">
                  {t("Submit e-Invoice upon saving")}
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
        title={t("Discard Invoice")}
        message={t("Are you sure you want to leave? This new invoice will be discarded.")}
        confirmButtonText={t("Discard")}
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

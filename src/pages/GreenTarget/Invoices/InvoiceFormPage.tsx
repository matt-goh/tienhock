// src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx
import React, { useState, useEffect, Fragment } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import {
  Listbox,
  ListboxOption,
  ListboxOptions,
  Transition,
  ListboxButton as HeadlessListboxButton,
} from "@headlessui/react";
import {
  IconChevronDown,
  IconCheck,
  IconSquareCheckFilled,
  IconSquare,
} from "@tabler/icons-react";
import clsx from "clsx";
import { FormCombobox, SelectOption } from "../../../components/FormComponents";
import SubmissionResultsModal from "../../../components/Invoice/SubmissionResultsModal";
import { EInvoiceSubmissionResult } from "../../../types/types";

// Interfaces
interface Customer {
  customer_id: number;
  tin_number: string;
  id_number: string;
  name: string;
  phone_number?: string | null; // Added phone number for Combobox display
}

interface Rental {
  rental_id: number;
  customer_id: number;
  tong_no: string;
  date_placed: string;
  date_picked: string | null;
  location_address?: string;
  driver: string;
  customer_name?: string; // For display perhaps
  invoice_info?: {
    invoice_id: number;
    invoice_number: string;
    status: string;
  } | null;
}

interface Invoice {
  invoice_id?: number;
  invoice_number?: string;
  type: "regular";
  customer_id: number; // Store as number
  rental_id?: number | null; // Store as number or null
  amount_before_tax: number;
  tax_amount: number;
  total_amount?: number; // Calculated
  date_issued: string; // YYYY-MM-DD
}

// Payment method options
const paymentMethodOptions: SelectOption[] = [
  { id: "cash", name: "Cash" },
  { id: "cheque", name: "Cheque" },
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "online", name: "Online Payment" },
];

const InvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const location = useLocation();
  const rentalData = location.state; // Data passed from RentalListPage potentially

  // Form State
  const [formData, setFormData] = useState<Invoice>({
    type: "regular",
    customer_id: 0,
    amount_before_tax: 200, // Default value?
    tax_amount: 0,
    date_issued: new Date().toISOString().split("T")[0],
    rental_id: null,
  });
  const [initialFormData, setInitialFormData] = useState<Invoice | null>(null); // For change detection

  // Reference Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableRentals, setAvailableRentals] = useState<Rental[]>([]);
  const [selectedRental, setSelectedRental] = useState<Rental | null>(null);

  // UI State
  const [customerQuery, setCustomerQuery] = useState(""); // For customer combobox search
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(true); // Start loading
  const [error, setError] = useState<string | null>(null);

  // Payment/E-invoice State (only for create mode)
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [submitAsEinvoice, setSubmitAsEinvoice] = useState(false);
  const [showSubmissionResultsModal, setShowSubmissionResultsModal] =
    useState(false);
  const [submissionResults, setSubmissionResults] =
    useState<EInvoiceSubmissionResult | null>(null);
  const [isSubmittingEInvoice, setIsSubmittingEInvoice] = useState(false);

  // State to remember rental selection when switching types
  const [previousRental, setPreviousRental] = useState<{
    rental_id: number | null;
    rental: Rental | null;
  }>({ rental_id: null, rental: null });

  // --- EFFECTS ---

  // Set initial form data (only once after customers load or if editing)
  useEffect(() => {
    if (!isEditMode && customers.length > 0 && initialFormData === null) {
      const defaultInitialState: Invoice = {
        type: "regular",
        customer_id: 0,
        amount_before_tax: 200,
        tax_amount: 0,
        date_issued: new Date().toISOString().split("T")[0],
        rental_id: null,
      };
      setInitialFormData(defaultInitialState);
      // Apply rentalData if it exists
      if (rentalData?.customer_id) {
        setFormData((prev) => ({
          ...prev,
          ...defaultInitialState,
          customer_id: rentalData.customer_id,
          rental_id: rentalData.rental_id,
        }));
        setInitialFormData((prev) => ({
          ...(prev ?? defaultInitialState),
          customer_id: rentalData.customer_id,
          rental_id: rentalData.rental_id,
        }));
      } else {
        setFormData(defaultInitialState); // Set form state too
      }
      setLoading(false); // Finish loading for create mode
    } else if (isEditMode && initialFormData === null && id) {
      // If editing, initialFormData is set after fetchInvoiceDetails
      // setLoading(false) happens in fetchInvoiceDetails
    } else if (!isEditMode && customers.length === 0 && !loading) {
      // Handle case where customers couldn't load in create mode
      setError("Could not load customer data. Cannot create invoice.");
      setLoading(false);
    }
  }, [isEditMode, customers, initialFormData, rentalData, id, loading]);

  // Form change detection
  useEffect(() => {
    if (initialFormData) {
      setIsFormChanged(
        JSON.stringify(formData) !== JSON.stringify(initialFormData)
      );
    }
  }, [formData, initialFormData]);

  // Fetch customers on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Fetch invoice details if editing
  useEffect(() => {
    if (isEditMode && id) {
      fetchInvoiceDetails(parseInt(id));
    }
  }, [id, isEditMode]);

  // Update submitAsEinvoice when customer changes
  useEffect(() => {
    if (formData.customer_id > 0 && customers.length > 0) {
      const customer = customers.find(
        (c) => c.customer_id === formData.customer_id
      );
      if (customer) {
        setSubmitAsEinvoice(!!(customer.tin_number && customer.id_number));
      }
    }
  }, [formData.customer_id, customers]);

  // Fetch available rentals when customer or type changes
  useEffect(() => {
    if (formData.customer_id && formData.type === "regular") {
      fetchAvailableRentals(formData.customer_id);
    } else {
      setAvailableRentals([]);
      setSelectedRental(null);
    }
  }, [formData.customer_id, formData.type]);

  // Select rental when availableRentals or formData.rental_id changes
  useEffect(() => {
    if (
      formData.type === "regular" &&
      formData.rental_id &&
      availableRentals.length > 0
    ) {
      const currentSelectedRental = availableRentals.find(
        (r) => r.rental_id === formData.rental_id
      );
      setSelectedRental(currentSelectedRental || null);
    }
  }, [formData.rental_id, formData.type, availableRentals]);

  // --- DATA FETCHING ---

  const fetchCustomers = async () => {
    try {
      const data = await greenTargetApi.getCustomers();
      setCustomers(data || []);
    } catch (err) {
      console.error("Error fetching customers:", err);
      toast.error("Failed load customers.");
    }
  };

  const fetchAvailableRentals = async (customerId: number) => {
    if (!customerId || customerId <= 0) {
      setAvailableRentals([]);
      setSelectedRental(null);
      return;
    }
    try {
      const params = new URLSearchParams({
        customer_id: customerId.toString(),
      });
      const data: Rental[] = await api.get(
        `/greentarget/api/rentals?${params.toString()}`
      );
      const available = data.filter(
        (r) =>
          // Include rentals with no invoice info
          !r.invoice_info ||
          // OR include the rental being edited in edit mode
          (isEditMode && r.rental_id === initialFormData?.rental_id) ||
          // OR include rentals with cancelled invoices (not active)
          (r.invoice_info && r.invoice_info.status === "cancelled")
      );
      setAvailableRentals(available);
      // Reset selection if current is no longer valid
      if (
        selectedRental &&
        !available.some((r) => r.rental_id === selectedRental.rental_id)
      ) {
        if (
          !(
            isEditMode &&
            selectedRental.rental_id === initialFormData?.rental_id
          )
        ) {
          setSelectedRental(null);
          setFormData((prev) => ({ ...prev, rental_id: null }));
        }
      }
    } catch (err) {
      console.error("Error fetching rentals:", err);
      toast.error("Failed load rentals.");
      setAvailableRentals([]);
      setSelectedRental(null);
    }
  };

  const fetchInvoiceDetails = async (invoiceId: number) => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getInvoice(invoiceId);
      if (!data.invoice) throw new Error("Invoice not found");
      const inv = data.invoice;
      const parsed: Invoice = {
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        type: inv.type,
        customer_id: inv.customer_id,
        rental_id: inv.rental_id ?? null,
        amount_before_tax: parseFloat(inv.amount_before_tax.toString()),
        tax_amount: parseFloat(inv.tax_amount.toString()),
        date_issued: inv.date_issued
          ? new Date(inv.date_issued).toISOString().split("T")[0]
          : "",
      };
      setFormData(parsed);
      setInitialFormData(parsed);
      setError(null);
    } catch (err: any) {
      setError(`Fetch error: ${err.message || "Unknown"}`);
      console.error("Error fetch invoice:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- HELPERS ---

  const isRentalActive = (datePickedStr: string | null | undefined) => {
    /* ... same logic ... */ if (!datePickedStr) return true;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const pickup = new Date(datePickedStr);
      pickup.setHours(0, 0, 0, 0);
      return !isNaN(pickup.getTime()) && pickup >= today;
    } catch {
      return false;
    }
  };
  const getOptionName = (
    options: SelectOption[],
    value: string | number | undefined | null
  ): string => {
    if (value === undefined || value === null || value === "") return "";
    const selected = options.find(
      (opt) => opt.id.toString() === value.toString()
    );
    return selected ? selected.name : "";
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

  // --- EVENT HANDLERS ---

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    setFormData((p) => ({
      ...p,
      [name]:
        type === "number" ? (value === "" ? 0 : parseFloat(value) || 0) : value,
    }));
  };
  const handleCustomerChange = (selectedId: string | string[] | null) => {
    const newCustId =
      selectedId && typeof selectedId === "string" ? Number(selectedId) : 0;
    if (newCustId !== formData.customer_id) {
      setFormData((p) => ({ ...p, customer_id: newCustId, rental_id: null }));
      setSelectedRental(null);
      setPreviousRental({ rental_id: null, rental: null });
      setCustomerQuery("");
    }
  };
  const handleRentalChange = (rentalIdString: string) => {
    const rid = rentalIdString === "" ? null : Number(rentalIdString);
    const selR = availableRentals.find((r) => r.rental_id === rid) || null;
    setSelectedRental(selR);
    setFormData((p) => ({ ...p, rental_id: rid }));
  };
  const handlePaymentMethodChange = (methodIdString: string) => {
    setPaymentMethod(methodIdString);
  };
  const handleBackClick = () => {
    if (isFormChanged) setShowBackConfirmation(true);
    else
      navigate(
        isEditMode && id
          ? `/greentarget/invoices/${id}`
          : "/greentarget/invoices"
      );
  };
  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate(
      isEditMode && id ? `/greentarget/invoices/${id}` : "/greentarget/invoices"
    );
  };

  // --- FORM VALIDATION & SUBMIT ---

  const validateForm = (): boolean => {
    /* ... same validation logic ... */ if (
      !formData.customer_id ||
      formData.customer_id <= 0
    ) {
      toast.error("Select customer");
      return false;
    }
    const selCust = customers.find(
      (c) => c.customer_id === formData.customer_id
    );
    if (
      formData.type === "regular" &&
      (!formData.rental_id || formData.rental_id <= 0)
    ) {
      toast.error("Select rental");
      return false;
    }
    if (!formData.date_issued) {
      toast.error("Specify issue date");
      return false;
    }
    if (formData.amount_before_tax <= 0 && formData.tax_amount <= 0) {
      toast.error("Amount > 0");
      return false;
    }
    if (!isEditMode && submitAsEinvoice) {
      if (!selCust) {
        toast.error("eInvoice: Customer missing.");
        return false;
      }
    }
    if (isPaid && !paymentMethod) {
      toast.error("Select payment method.");
      return false;
    }
    if (
      isPaid &&
      (paymentMethod === "cheque" || paymentMethod === "bank_transfer") &&
      !paymentReference
    ) {
      toast.error(
        `Enter ${paymentMethod === "cheque" ? "Cheque No" : "Reference"}.`
      );
      return false;
    }
    return true;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSaving(true);
    const totalAmount = formData.amount_before_tax + formData.tax_amount;
    try {
      const invData: Omit<Invoice, "invoice_id" | "invoice_number"> & {
        total_amount: number;
        invoice_id?: number;
      } = {
        type: formData.type,
        customer_id: Number(formData.customer_id),
        rental_id: formData.rental_id ? Number(formData.rental_id) : null,
        amount_before_tax: Number(formData.amount_before_tax),
        tax_amount: Number(formData.tax_amount),
        total_amount: Number(totalAmount),
        date_issued: formData.date_issued,
      };
      if (isEditMode && formData.invoice_id)
        invData.invoice_id = formData.invoice_id;
      let response;
      let navId: number | null = null;
      if (isEditMode && invData.invoice_id) {
        response = await greenTargetApi.updateInvoice(
          invData.invoice_id,
          invData
        );
        toast.success("Invoice updated");
        navId = invData.invoice_id;
      } else {
        response = await greenTargetApi.createInvoice(invData);
        if (response.invoice?.invoice_id) {
          navId = response.invoice.invoice_id;
          toast.success("Invoice created");
          const selCust = customers.find(
            (c) => c.customer_id === formData.customer_id
          );

          if (
            submitAsEinvoice &&
            selCust?.tin_number &&
            selCust?.id_number &&
            navId
          ) {
            // Set state to show loading in modal immediately
            setIsSubmittingEInvoice(true);
            setSubmissionResults(null); // Clear previous results
            setShowSubmissionResultsModal(true); // Show modal immediately with loading state

            const eTid = toast.loading("Submitting e-Invoice...");
            try {
              const eRes = await greenTargetApi.submitEInvoice(navId);

              // Dismiss loading toast
              toast.dismiss(eTid);

              // Transform the response to match the expected format
              const transformedResponse = {
                success: eRes.success,
                message: eRes.message || "e-Invoice submitted successfully",
                overallStatus:
                  eRes.einvoice?.einvoice_status === "valid"
                    ? "Valid"
                    : eRes.einvoice?.einvoice_status === "pending"
                    ? "Pending"
                    : "Unknown",
                acceptedDocuments: eRes.einvoice
                  ? [
                      {
                        internalId: eRes.einvoice.invoice_number,
                        uuid: eRes.einvoice.uuid,
                        longId: eRes.einvoice.long_id,
                        status:
                          eRes.einvoice.einvoice_status === "valid"
                            ? "ACCEPTED"
                            : "Submitted",
                        dateTimeValidated: eRes.einvoice.datetime_validated,
                      },
                    ]
                  : [],
                rejectedDocuments:
                  !eRes.success && eRes.error
                    ? [
                        {
                          internalId: navId.toString(),
                          error: {
                            code: "ERROR",
                            message: eRes.error.message || "Unknown error",
                            details: eRes.error.details,
                          },
                        },
                      ]
                    : [],
              };

              // Store the transformed response for the modal
              setSubmissionResults(transformedResponse);

              // Only show minor toast if needed
              if (eRes.success && !showSubmissionResultsModal) {
                const status = eRes.einvoice?.einvoice_status || "pending";
                if (status === "valid") {
                  toast.success("e-Invoice submitted and validated");
                } else {
                  toast.success("e-Invoice submitted and pending validation");
                }
              }
            } catch (eErr) {
              console.error("e-Invoice submission error:", eErr);
              toast.error("e-Invoice submission failed", { id: eTid });

              // Format error for modal with the expected structure
              const errorMessage =
                eErr instanceof Error ? eErr.message : "Unknown error";
              setSubmissionResults({
                success: false,
                message: `e-Invoice submission failed: ${errorMessage}`,
                overallStatus: "Error",
                rejectedDocuments: [
                  {
                    internalId: navId.toString(),
                    error: {
                      code: "EINVOICE_ERROR",
                      message: errorMessage,
                    },
                  },
                ],
              });
            } finally {
              // Make sure to set the submitting state to false when done
              setIsSubmittingEInvoice(false);
            }
          }
          if (isPaid && navId) {
            const pTid = toast.loading("Recording payment...");
            try {
              const allP = await greenTargetApi.getPayments();
              const y = new Date().getFullYear().toString().slice(-2);
              const m = (new Date().getMonth() + 1).toString().padStart(2, "0");
              const re = new RegExp(`^RV${y}/${m}/(\\d+)$`);
              const nums = new Set<number>();
              allP.forEach((p: { internal_reference: string | null }) => {
                if (p.internal_reference) {
                  const ma = p.internal_reference.match(re);
                  if (ma) nums.add(parseInt(ma[1], 10));
                }
              });
              let n = 1;
              while (nums.has(n)) n++;
              const ref = `RV${y}/${m}/${n.toString().padStart(2, "0")}`;
              const pData = {
                invoice_id: navId,
                payment_date: new Date().toISOString().split("T")[0],
                amount_paid: totalAmount,
                payment_method: paymentMethod,
                payment_reference: paymentReference || null,
                internal_reference: ref,
              };
              await greenTargetApi.createPayment(pData);
              toast.success("Payment recorded", { id: pTid });
            } catch (pErr) {
              console.error("Payment err:", pErr);
              toast.error("Invoice created, payment failed.", { id: pTid });
            }
          }
          if (navId)
            navigate(`/greentarget/invoices/${navId}`, {
              replace: true,
              state: { previousPath: "/greentarget/invoices" },
            });
        } else {
          throw new Error(response.message || "Failed create invoice");
        }
      }
    } catch (error: any) {
      console.error("Save error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Error: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate total amount for display
  const totalAmount =
    (Number(formData.amount_before_tax) || 0) +
    (Number(formData.tax_amount) || 0);

  // --- RENDER ---

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="container mx-auto px-4">
        <BackButton onClick={handleBackClick} className="ml-5" />
        <div className="bg-white rounded-lg p-6 border border-rose-200 shadow-sm">
          <h2 className="text-xl font-semibold text-rose-700 mb-4">
            Error Loading Invoice
          </h2>
          <p className="text-default-600 mb-4">{error}</p>
          <Button onClick={handleBackClick} variant="outline" color="secondary">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Prepare options for Combobox/Listboxes
  const customerOptionsForCombobox: SelectOption[] = customers.map((c) => ({
    id: c.customer_id,
    name: c.name,
    phone_number: c.phone_number,
  }));
  const rentalOptions: SelectOption[] = availableRentals.map((r) => ({
    id: r.rental_id,
    name: `Rental #${r.rental_id} - ${r.tong_no} (${new Date(
      r.date_placed
    ).toLocaleDateString()})${
      r.location_address ? ` - ${r.location_address}` : ""
    }`,
  }));
  const selectedCustomerForEinvoice = customers.find(
    (c) => c.customer_id === formData.customer_id
  );
  const canSubmitEinvoice = !!(
    selectedCustomerForEinvoice?.tin_number &&
    selectedCustomerForEinvoice?.id_number
  );

  return (
    <div className="container mx-auto px-4 pb-10">
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg shadow border border-default-200">
        <div className="p-6 border-b border-default-200">
          {" "}
          {/* Header */}
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode
              ? `Edit Invoice ${
                  formData.invoice_number ? `(#${formData.invoice_number})` : ""
                }`
              : "Create New Invoice"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode ? "Update invoice info." : "Fill details."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Customer Combobox */}
            <div className="space-y-2">
              <FormCombobox
                name="customer_id"
                label="Customer"
                value={
                  formData.customer_id > 0
                    ? formData.customer_id.toString()
                    : undefined
                }
                onChange={handleCustomerChange}
                options={customerOptionsForCombobox}
                query={customerQuery}
                setQuery={setCustomerQuery}
                placeholder="Search or Select Customer..."
                disabled={isEditMode}
                required={true}
                mode="single"
              />
            </div>

            {/* Invoice Date */}
            <div className="space-y-2">
              <label
                htmlFor="date_issued"
                className="block text-sm font-medium text-default-700"
              >
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="date_issued"
                name="date_issued"
                value={formData.date_issued}
                onChange={handleInputChange}
                required
                className={clsx(
                  "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                  "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                )}
              />
            </div>
          </div>

          {/* Conditional Fields (Regular Invoice - Rental Selection) */}
          {formData.type ===
            "regular" /* ... Rental Listbox and Details ... */ && (
            <div className="mt-6">
              <div className="space-y-2">
                <label
                  htmlFor="rental_id-button"
                  className="block text-sm font-medium text-default-700"
                >
                  Select Rental <span className="text-red-500">*</span>
                </label>
                <Listbox
                  value={formData.rental_id?.toString() ?? ""}
                  onChange={handleRentalChange}
                  disabled={!formData.customer_id || isEditMode}
                  name="rental_id"
                >
                  <div className="relative">
                    <HeadlessListboxButton
                      id="rental_id-button"
                      className={clsx(
                        "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                        !formData.customer_id || isEditMode
                          ? "bg-gray-50 text-gray-500 cursor-not-allowed"
                          : ""
                      )}
                    >
                      <span className="block truncate">
                        {getOptionName(rentalOptions, formData.rental_id) ||
                          (!formData.customer_id
                            ? "Select customer first"
                            : "Select Rental")}
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
                          "mt-1"
                        )}
                      >
                        <ListboxOption
                          value=""
                          disabled
                          className="text-gray-400 italic py-2 pl-3 pr-10 select-none"
                        >
                          Select Rental
                        </ListboxOption>
                        {rentalOptions.length === 0 && formData.customer_id ? (
                          <div className="relative cursor-default select-none py-2 px-4 text-gray-500">
                            No available rentals found.
                          </div>
                        ) : (
                          rentalOptions.map((option) => (
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
                              value={option.id.toString()}
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
                          ))
                        )}
                      </ListboxOptions>
                    </Transition>
                  </div>
                </Listbox>
              </div>
              {selectedRental && (
                <div className="mt-3 rounded-lg border border-default-200 overflow-hidden">
                  <div
                    className={clsx(
                      "px-4 py-2",
                      isRentalActive(selectedRental.date_picked)
                        ? "bg-green-500 text-white"
                        : "bg-default-100 text-default-700"
                    )}
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Selected Rental Details</h3>
                      <span
                        className={clsx(
                          "text-sm font-medium px-2 py-0.5 rounded-full",
                          isRentalActive(selectedRental.date_picked)
                            ? "bg-green-400/30 text-white"
                            : "bg-default-200 text-default-600"
                        )}
                      >
                        {isRentalActive(selectedRental.date_picked)
                          ? "Ongoing"
                          : "Completed"}{" "}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <InfoItem
                        label="Placement Date"
                        value={new Date(
                          selectedRental.date_placed
                        ).toLocaleDateString()}
                      />
                      <InfoItem
                        label="Pickup Date"
                        value={
                          selectedRental.date_picked
                            ? new Date(
                                selectedRental.date_picked
                              ).toLocaleDateString()
                            : "Not picked up yet"
                        }
                        highlight={!selectedRental.date_picked}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <InfoItem label="Driver" value={selectedRental.driver} />
                      <InfoItem
                        label="Dumpster"
                        value={selectedRental.tong_no}
                      />
                      <InfoItem
                        label="Location"
                        value={selectedRental.location_address || "N/A"}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Amount and Tax Section */}
          <div className="mt-6 border-t pt-6">
            <h2 className="text-lg font-medium mb-4">Invoice Amount</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
              <div className="space-y-2">
                <label
                  htmlFor="amount_before_tax"
                  className="block text-sm font-medium text-default-700"
                >
                  Amount (Excl. Tax) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500 text-sm">
                    RM
                  </span>
                  <input
                    type="number"
                    id="amount_before_tax"
                    name="amount_before_tax"
                    value={formData.amount_before_tax}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    required
                    className={clsx(
                      "block w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="tax_amount"
                  className="block text-sm font-medium text-default-700"
                >
                  Tax Amount
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500 text-sm">
                    RM
                  </span>
                  <input
                    type="number"
                    id="tax_amount"
                    name="tax_amount"
                    value={formData.tax_amount}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className={clsx(
                      "block w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm bg-default-50"
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700">
                  Total Amount
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500 text-sm">
                    RM
                  </span>
                  <input
                    type="text"
                    value={totalAmount.toFixed(2)}
                    className="w-full pl-10 pr-3 py-1.5 border border-default-300 rounded-lg bg-gray-100 font-medium text-default-700 cursor-default"
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>
              {!isEditMode && (
                <div className="space-y-2 flex items-end pb-1">
                  <div className="flex items-center h-[42px]">
                    <button
                      type="button"
                      onClick={() => setIsPaid(!isPaid)}
                      className="flex items-center cursor-pointer group p-1"
                    >
                      {isPaid ? (
                        <IconSquareCheckFilled
                          className="text-sky-600 group-hover:text-sky-700"
                          size={20}
                        />
                      ) : (
                        <IconSquare
                          className="text-default-400 group-hover:text-default-500"
                          size={20}
                        />
                      )}
                      <span className="ml-2 text-sm font-medium text-default-700 group-hover:text-default-900">
                        Mark as Paid
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Method Section */}
          {!isEditMode && isPaid && (
            <div className="mt-6 border-t pt-6">
              <h2 className="text-lg font-medium mb-4">
                Payment Info (Optional)
              </h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div className="space-y-2">
                  <label
                    htmlFor="pm-paid"
                    className="block text-sm font-medium text-default-700"
                  >
                    Method <span className="text-red-500">*</span>
                  </label>
                  <Listbox
                    value={paymentMethod}
                    onChange={handlePaymentMethodChange}
                    name="payment_method_paid"
                  >
                    <div className="relative">
                      <HeadlessListboxButton
                        id="pm-paid"
                        className={clsx(
                          "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
                          "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        )}
                      >
                        <span className="block truncate">
                          {getOptionName(paymentMethodOptions, paymentMethod) ||
                            "Select"}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <IconChevronDown
                            size={20}
                            className="text-gray-400"
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
                            "absolute z-20 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                            "bottom-full mb-1"
                          )}
                        >
                          {paymentMethodOptions.map((o) => (
                            <ListboxOption
                              key={o.id}
                              className={({ active }) =>
                                clsx(
                                  "relative cursor-default select-none py-2 pl-3 pr-10",
                                  active
                                    ? "bg-sky-100 text-sky-900"
                                    : "text-gray-900"
                                )
                              }
                              value={o.id.toString()}
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={clsx(
                                      "block truncate",
                                      selected ? "font-medium" : "font-normal"
                                    )}
                                  >
                                    {o.name}
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                      <IconCheck size={20} />
                                    </span>
                                  )}
                                </>
                              )}
                            </ListboxOption>
                          ))}
                        </ListboxOptions>
                      </Transition>
                    </div>
                  </Listbox>
                </div>
                {(paymentMethod === "cheque" ||
                  paymentMethod === "bank_transfer") && (
                  <div className="space-y-2">
                    <label
                      htmlFor="payment_reference"
                      className="block text-sm font-medium text-default-700"
                    >
                      {paymentMethod === "cheque" ? "Cheque No" : "Reference"}{" "}
                    </label>
                    <input
                      type="text"
                      id="payment_reference"
                      name="payment_reference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className={clsx(
                        "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* e-Invoice Section */}
          {!isEditMode && formData.customer_id > 0 && (
            <div className="mt-6 border-t pt-6">
              <h2 className="text-lg font-medium mb-2">e-Invoice Option</h2>
              {canSubmitEinvoice ? (
                isInvoiceDateEligibleForEinvoice(formData.date_issued) ? (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSubmitAsEinvoice(!submitAsEinvoice)}
                      className="flex items-center cursor-pointer group p-1"
                    >
                      {submitAsEinvoice ? (
                        <IconSquareCheckFilled
                          className="text-sky-600 group-hover:text-sky-700"
                          size={20}
                        />
                      ) : (
                        <IconSquare
                          className="text-default-400 group-hover:text-default-500"
                          size={20}
                        />
                      )}
                      <span className="ml-2 text-sm font-medium text-default-700 group-hover:text-default-900">
                        Submit e-Invoice upon saving
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-amber-600">
                    Cannot submit e-Invoice for dates older than 3 days.
                  </div>
                )
              ) : (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/greentarget/customers/${formData.customer_id}`)
                    }
                    className="text-sm text-default-500 hover:text-sky-800 hover:underline focus:outline-none"
                    title="Add TIN & ID for customer"
                  >
                    Cannot submit e-Invoice. Customer missing TIN or ID.
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-8 pt-5 border-t border-default-200 flex justify-end">
            <Button
              type="button"
              variant="outline"
              color="secondary"
              onClick={handleBackClick}
              className="mr-3"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="filled"
              color="sky"
              disabled={isSaving || (!isFormChanged && isEditMode)}
            >
              {isSaving
                ? "Saving..."
                : isEditMode
                ? "Save Changes"
                : "Create Invoice"}
            </Button>
          </div>
        </form>
      </div>
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
        isLoading={isSubmittingEInvoice}
      />
      {/* Dialogs */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Leave without saving?"
        confirmButtonText="Discard"
        variant="danger"
      />
    </div>
  );
};

// Helper component (keep as is)
const InfoItem: React.FC<{
  label: string;
  value: string | number | null | undefined;
  highlight?: boolean;
}> = ({ label, value, highlight = false }) => (
  <div className="bg-default-50 p-3 rounded-lg border border-default-100">
    <div className="text-xs text-default-500 mb-1">{label}</div>
    <div
      className={clsx(
        "font-medium truncate",
        highlight ? "text-green-600" : "text-default-800"
      )}
    >
      {value ?? "N/A"}
    </div>
  </div>
);

export default InvoiceFormPage;

// src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx
import React, { useState, useEffect, useCallback, Fragment } from "react";
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
  rental_ids?: number[]; // Changed to array for multiple rentals
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
    rental_ids: [], // Changed to array
  });
  const [initialFormData, setInitialFormData] = useState<Invoice | null>(null); // For change detection

  // Reference Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableRentals, setAvailableRentals] = useState<Rental[]>([]);
  const [selectedRentals, setSelectedRentals] = useState<Rental[]>([]); // Changed to array

  // UI State
  const [customerQuery, setCustomerQuery] = useState(""); // For customer combobox search
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(true); // Start loading
  const [error, setError] = useState<string | null>(null);
  const [isAmountManuallyChanged, setIsAmountManuallyChanged] = useState(false);

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

  // Invoice number validation state
  const [invoiceNumberValidation, setInvoiceNumberValidation] = useState<{
    isValidating: boolean;
    isValid: boolean;
    isDuplicate: boolean;
    message: string;
  }>({
    isValidating: false,
    isValid: true,
    isDuplicate: false,
    message: "",
  });

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
        rental_ids: [], // Changed to array
      };
      setInitialFormData(defaultInitialState);
      // Apply rentalData if it exists
      if (rentalData?.customer_id) {
        const rentalIds = rentalData.rental_id ? [rentalData.rental_id] : [];
        setFormData((prev) => ({
          ...prev,
          ...defaultInitialState,
          customer_id: rentalData.customer_id,
          rental_ids: rentalIds,
        }));
        setInitialFormData((prev) => ({
          ...(prev ?? defaultInitialState),
          customer_id: rentalData.customer_id,
          rental_ids: rentalIds,
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
      setSelectedRentals([]);
    }
  }, [formData.customer_id, formData.type]);

  // Select rentals when availableRentals or formData.rental_ids changes
  useEffect(() => {
    if (
      formData.type === "regular" &&
      formData.rental_ids &&
      formData.rental_ids.length > 0 &&
      availableRentals.length > 0
    ) {
      const currentSelectedRentals = availableRentals.filter((r) =>
        formData.rental_ids!.includes(r.rental_id)
      );
      setSelectedRentals(currentSelectedRentals);
    } else {
      setSelectedRentals([]);
    }
  }, [formData.rental_ids, formData.type, availableRentals]);

  // Auto-calculate invoice amount based on selected rentals (RM 200 per rental)
  useEffect(() => {
    // Only auto-calculate if we're in create mode for regular invoices and amount hasn't been manually changed
    if (
      !isEditMode &&
      formData.type === "regular" &&
      selectedRentals.length > 0 &&
      !isAmountManuallyChanged
    ) {
      const calculatedAmount = selectedRentals.length * 200;

      // Only update if the amount is different to prevent infinite loops
      if (formData.amount_before_tax !== calculatedAmount) {
        setFormData((prev) => ({
          ...prev,
          amount_before_tax: calculatedAmount,
        }));
      }
    } else if (
      !isEditMode &&
      formData.type === "regular" &&
      selectedRentals.length === 0 &&
      !isAmountManuallyChanged
    ) {
      // Reset to default amount when no rentals selected
      if (formData.amount_before_tax !== 200) {
        setFormData((prev) => ({
          ...prev,
          amount_before_tax: 200,
        }));
      }
    }
  }, [
    selectedRentals.length,
    isEditMode,
    formData.type,
    formData.amount_before_tax,
    isAmountManuallyChanged,
  ]);

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
      setSelectedRentals([]);
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
          // OR include rentals being edited in edit mode
          (isEditMode && initialFormData?.rental_ids?.includes(r.rental_id)) ||
          // OR include rentals with cancelled invoices (not active)
          (r.invoice_info && r.invoice_info.status === "cancelled")
      );
      setAvailableRentals(available);
      // Reset selections if current ones are no longer valid
      const validSelectedRentals = selectedRentals.filter(
        (selectedRental) =>
          available.some((r) => r.rental_id === selectedRental.rental_id) ||
          (isEditMode &&
            initialFormData?.rental_ids?.includes(selectedRental.rental_id))
      );

      if (validSelectedRentals.length !== selectedRentals.length) {
        setSelectedRentals(validSelectedRentals);
        setFormData((prev) => ({
          ...prev,
          rental_ids: validSelectedRentals.map((r) => r.rental_id),
        }));
      }
    } catch (err) {
      console.error("Error fetching rentals:", err);
      toast.error("Failed load rentals.");
      setAvailableRentals([]);
      setSelectedRentals([]);
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
        rental_ids: inv.rental_details
          ? inv.rental_details.map((r: any) => r.rental_id)
          : [],
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
          invoiceNumber.trim(),
          isEditMode && formData.invoice_id ? formData.invoice_id : undefined
        );

        setInvoiceNumberValidation({
          isValidating: false,
          isValid: result.available,
          isDuplicate: result.exists,
          message: result.exists
            ? `Invoice number already exists${
                result.existing_id ? ` (ID: ${result.existing_id})` : ""
              }`
            : "",
        });
      } catch (error) {
        console.error("Error validating invoice number:", error);
        setInvoiceNumberValidation({
          isValidating: false,
          isValid: false,
          isDuplicate: false,
          message: "Error validating invoice number",
        });
      }
    },
    [isEditMode, formData.invoice_id]
  );

  // Debounce invoice number validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.invoice_number !== initialFormData?.invoice_number) {
        validateInvoiceNumber(formData.invoice_number || "");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    formData.invoice_number,
    initialFormData?.invoice_number,
    validateInvoiceNumber,
  ]);

  const isRentalActive = (datePickedStr: string | null | undefined) => {
    if (!datePickedStr) return true;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Extract just the date part to avoid timezone conversion issues
      const dateOnly = datePickedStr.split("T")[0]; // Get '2025-08-12' from '2025-08-12T00:00:00.000Z'
      const pickup = new Date(dateOnly + "T00:00:00"); // Parse as local date
      pickup.setHours(0, 0, 0, 0);

      // A rental is active if the pickup date is today or in the future
      // A rental is completed if the pickup date is in the past
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

    // If user is changing the amount_before_tax field, mark it as manually changed
    if (name === "amount_before_tax") {
      setIsAmountManuallyChanged(true);

      // Allow any numeric input without applying the less-than-200 logic during typing
      const numericValue =
        type === "number" ? (value === "" ? 0 : parseFloat(value) || 0) : 0;

      setFormData((p) => ({
        ...p,
        [name]: numericValue,
      }));
    } else {
      setFormData((p) => ({
        ...p,
        [name]:
          type === "number"
            ? value === ""
              ? 0
              : parseFloat(value) || 0
            : value,
      }));
    }
  };

  const handleCustomerChange = (selectedId: string | string[] | null) => {
    const newCustId =
      selectedId && typeof selectedId === "string" ? Number(selectedId) : 0;
    if (newCustId !== formData.customer_id) {
      setFormData((p) => ({ ...p, customer_id: newCustId, rental_ids: [] }));
      setSelectedRentals([]);
      setCustomerQuery("");
    }
  };
  // Handle multiple rental selection
  const handleRentalToggle = (rental: Rental) => {
    const isSelected = selectedRentals.some(
      (r) => r.rental_id === rental.rental_id
    );

    if (isSelected) {
      // Remove rental from selection
      const newSelectedRentals = selectedRentals.filter(
        (r) => r.rental_id !== rental.rental_id
      );
      setSelectedRentals(newSelectedRentals);
      setFormData((p) => ({
        ...p,
        rental_ids: newSelectedRentals.map((r) => r.rental_id),
      }));
    } else {
      // Add rental to selection
      const newSelectedRentals = [...selectedRentals, rental];
      setSelectedRentals(newSelectedRentals);
      setFormData((p) => ({
        ...p,
        rental_ids: newSelectedRentals.map((r) => r.rental_id),
      }));
    }
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
    // Check invoice number validation
    if (formData.invoice_number && invoiceNumberValidation.isDuplicate) {
      toast.error(
        "Invoice number already exists. Please choose a different number."
      );
      return false;
    }

    if (!formData.customer_id || formData.customer_id <= 0) {
      toast.error("Select customer");
      return false;
    }
    const selCust = customers.find(
      (c) => c.customer_id === formData.customer_id
    );
    if (
      formData.type === "regular" &&
      (!formData.rental_ids || formData.rental_ids.length === 0)
    ) {
      toast.error("Select at least one rental");
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
      const invData: Omit<Invoice, "invoice_id"> & {
        total_amount: number;
        invoice_id?: number;
      } = {
        type: formData.type,
        customer_id: Number(formData.customer_id),
        rental_ids: formData.rental_ids || [],
        amount_before_tax: Number(formData.amount_before_tax),
        tax_amount: Number(formData.tax_amount),
        total_amount: Number(totalAmount),
        date_issued: formData.date_issued,
        invoice_number: formData.invoice_number?.trim() || undefined,
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
  const selectedCustomerForEinvoice = customers.find(
    (c) => c.customer_id === formData.customer_id
  );
  const canSubmitEinvoice = !!(
    selectedCustomerForEinvoice?.tin_number &&
    selectedCustomerForEinvoice?.id_number &&
    selectedCustomerForEinvoice?.phone_number
  );

  return (
    <div className="space-y-4">
      <BackButton onClick={handleBackClick} />
      <div className="bg-white rounded-lg shadow border border-default-200">
        <div className="p-6 border-b border-default-200">
          {/* Header */}
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode
              ? `Edit Invoice ${
                  formData.invoice_number ? `(#${formData.invoice_number})` : ""
                }`
              : "Create New Invoice"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode ? "Update invoice info." : "Fill in the details."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          {/* First row with invoice number and customer */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Invoice Number */}
            <div className="space-y-2">
              <label
                htmlFor="invoice_number"
                className="block text-sm font-medium text-default-700"
              >
                Invoice Number
                {!isEditMode && (
                  <span className="text-sm font-normal text-default-500 ml-1">
                    (optional - auto-generated if empty)
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="invoice_number"
                  name="invoice_number"
                  value={formData.invoice_number || ""}
                  onChange={handleInputChange}
                  className={clsx(
                    "block w-full px-3 py-2 border rounded-lg shadow-sm",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                    invoiceNumberValidation.isDuplicate
                      ? "border-red-500 bg-red-50"
                      : invoiceNumberValidation.isValid
                      ? "border-default-300"
                      : "border-yellow-500 bg-yellow-50"
                  )}
                  placeholder="Enter custom invoice number or leave blank"
                />
                {invoiceNumberValidation.isValidating && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500"></div>
                  </div>
                )}
              </div>
              {invoiceNumberValidation.message && (
                <p
                  className={clsx(
                    "text-sm",
                    invoiceNumberValidation.isDuplicate
                      ? "text-red-600"
                      : "text-yellow-600"
                  )}
                >
                  {invoiceNumberValidation.message}
                </p>
              )}
              {formData.invoice_number &&
                invoiceNumberValidation.isValid &&
                !invoiceNumberValidation.isValidating && (
                  <p className="text-sm text-green-600">
                    Invoice number is available
                  </p>
                )}
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

          {/* Second row with customer */}
          <div className="mt-6">
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
          </div>

          {/* Conditional Fields (Regular Invoice - Multiple Rental Selection) */}
          {formData.type === "regular" && (
            <div className="mt-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700">
                  Select Rentals <span className="text-red-500">*</span>
                  <span className="text-sm font-normal text-default-500 ml-1">
                    (Click to select multiple rentals)
                  </span>
                </label>

                {!formData.customer_id ? (
                  <div className="p-4 border border-default-300 rounded-lg bg-gray-50 text-gray-500 text-center">
                    Select customer first
                  </div>
                ) : availableRentals.length === 0 ? (
                  <div className="p-4 border border-default-300 rounded-lg bg-gray-50 text-gray-500 text-center">
                    No available rentals found for this customer
                  </div>
                ) : (
                  <div className="border border-default-300 rounded-lg divide-y divide-default-200 max-h-80 overflow-y-auto">
                    {availableRentals.map((rental) => {
                      const isSelected = selectedRentals.some(
                        (r) => r.rental_id === rental.rental_id
                      );
                      const isActive = isRentalActive(rental.date_picked);

                      return (
                        <div
                          key={rental.rental_id}
                          onClick={() =>
                            !isEditMode && handleRentalToggle(rental)
                          }
                          className={clsx(
                            "p-4 cursor-pointer transition-colors relative",
                            isEditMode
                              ? "cursor-not-allowed"
                              : "hover:bg-gray-50"
                          )}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: "#f0f9ff",
                                  borderLeft: "4px solid #0ea5e9",
                                  borderRight: "none",
                                  borderTop: "none",
                                  borderBottom: "none",
                                }
                              : {}
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="flex items-center">
                                {isSelected ? (
                                  <IconSquareCheckFilled
                                    className="text-sky-600"
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
                                <div className="font-medium text-gray-900">
                                  Rental #{rental.rental_id} - Dumpster{" "}
                                  {rental.tong_no}
                                </div>
                                <div className="text-sm text-gray-500">
                                  Placed:{" "}
                                  {new Date(
                                    rental.date_placed
                                  ).toLocaleDateString()}
                                  {rental.location_address &&
                                    ` • ${rental.location_address}`}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span
                                className={clsx(
                                  "text-xs font-medium px-2 py-1 rounded-full",
                                  isActive
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-600"
                                )}
                              >
                                {isActive ? "Ongoing" : "Completed"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedRentals.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm font-medium text-default-700 mb-2">
                      Selected Rentals ({selectedRentals.length})
                    </div>
                    <div className="space-y-2">
                      {selectedRentals.map((rental) => (
                        <div
                          key={rental.rental_id}
                          className="bg-sky-50 border border-sky-200 rounded-lg p-3"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-gray-900">
                                Rental #{rental.rental_id} - Dumpster{" "}
                                {rental.tong_no}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                <span>Driver: {rental.driver}</span>
                                <span className="mx-2">•</span>
                                <span>
                                  Placed:{" "}
                                  {new Date(
                                    rental.date_placed
                                  ).toLocaleDateString()}
                                </span>
                                {rental.date_picked && (
                                  <>
                                    <span className="mx-2">•</span>
                                    <span>
                                      Picked:{" "}
                                      {new Date(
                                        rental.date_picked
                                      ).toLocaleDateString()}
                                    </span>
                                  </>
                                )}
                              </div>
                              {rental.location_address && (
                                <div className="text-sm text-gray-500 mt-1">
                                  Location: {rental.location_address}
                                </div>
                              )}
                            </div>
                            {!isEditMode && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRentalToggle(rental);
                                }}
                                className="text-red-600 hover:text-red-700 p-1"
                                title="Remove rental"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                    step="1"
                    required
                    className={clsx(
                      "block w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                      !isEditMode &&
                        formData.type === "regular" &&
                        selectedRentals.length > 0 &&
                        "bg-sky-50"
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
                    step="1"
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
                    title="Add TIN & ID or phone number for customer"
                  >
                    Cannot submit e-Invoice. Customer missing TIN & ID or phone
                    number.
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

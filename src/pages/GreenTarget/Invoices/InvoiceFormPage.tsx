// src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx
import React, { useState, useEffect, Fragment } from "react"; // Added Fragment
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
  // ListboxButton, // Use renamed alias
  ListboxOption,
  ListboxOptions,
  Transition, // Added Transition
  ListboxButton as HeadlessListboxButton, // Renamed import
} from "@headlessui/react";
import {
  IconChevronDown,
  IconCheck,
  IconSquareCheckFilled,
  IconSquare,
} from "@tabler/icons-react";
import clsx from "clsx"; // Added clsx
import { SelectOption } from "../../../components/FormComponents"; // Import SelectOption

interface Customer {
  customer_id: number;
  tin_number: string; // Keep for e-invoice check
  id_number: string; // Keep for e-invoice check
  name: string;
}

interface Rental {
  rental_id: number;
  customer_id: number;
  tong_no: string;
  date_placed: string;
  date_picked: string | null;
  location_address?: string;
  driver: string;
  customer_name?: string;
  invoice_info?: {
    invoice_id: number;
    invoice_number: string;
    has_payments: boolean;
  } | null;
}

interface Invoice {
  invoice_id?: number;
  invoice_number?: string;
  type: "regular" | "statement";
  customer_id: number; // Store as number
  rental_id?: number | null; // Store as number or null
  amount_before_tax: number;
  tax_amount: number;
  total_amount?: number;
  date_issued: string;
  statement_period_start?: string | null;
  statement_period_end?: string | null;
}

// Define payment method options compatible with SelectOption
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

  const [formData, setFormData] = useState<Invoice>({
    type: "regular",
    customer_id: 0, // Use 0 or null for "not selected"
    amount_before_tax: 200,
    tax_amount: 0,
    date_issued: new Date().toISOString().split("T")[0],
    rental_id: null, // Initialize rental_id
  });

  const [initialFormData, setInitialFormData] = useState<Invoice>({
    type: "regular",
    customer_id: 0,
    amount_before_tax: 200,
    tax_amount: 0,
    date_issued: new Date().toISOString().split("T")[0],
    rental_id: null, // Initialize rental_id
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableRentals, setAvailableRentals] = useState<Rental[]>([]);
  const [selectedRental, setSelectedRental] = useState<Rental | null>(null);

  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash"); // Keep as string ID
  const [paymentReference, setPaymentReference] = useState("");
  const [previousRental, setPreviousRental] = useState<{
    rental_id: number | null;
    rental: Rental | null;
  }>({
    rental_id: null,
    rental: null,
  });
  const [submitAsEinvoice, setSubmitAsEinvoice] = useState(true);
  const [showEinvoiceError, setShowEinvoiceError] = useState(false);
  const [einvoiceErrorMessage, setEinvoiceErrorMessage] = useState("");
  const location = useLocation();
  const rentalData = location.state;

  // Check if form data has changed from initial state
  useEffect(() => {
    // Deep comparison might be needed if nested objects change
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormData);
    setIsFormChanged(hasChanged);
  }, [formData, initialFormData]);

  // Fetch customers when component mounts
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Fetch invoice details if editing
  useEffect(() => {
    if (isEditMode && id) {
      fetchInvoiceDetails(parseInt(id));
    }
  }, [id, isEditMode]);

  // Fetch rentals when customer changes OR when formData.type is regular and customer_id is set
  // This ensures rentals are fetched when editing an existing regular invoice
  useEffect(() => {
    if (formData.customer_id && formData.type === "regular") {
      fetchAvailableRentals(formData.customer_id);
    } else {
      setAvailableRentals([]); // Clear rentals if not applicable
      setSelectedRental(null); // Clear selected rental too
    }
  }, [formData.customer_id, formData.type]); // Rerun when customer or type changes

  // Handle pre-population from rentalData (passed via navigation state)
  useEffect(() => {
    if (rentalData && !isEditMode && customers.length > 0) {
      // Ensure customers are loaded
      const customerExists = customers.some(
        (c) => c.customer_id === rentalData.customer_id
      );
      if (customerExists) {
        setFormData((prev) => ({
          ...prev,
          type: "regular", // Ensure type is regular
          customer_id: rentalData.customer_id,
          rental_id: rentalData.rental_id,
          // location_address: rentalData.location_address, // Don't store location in invoice form
          amount_before_tax: 200, // Default amount, adjust as needed
          tax_amount: 0, // Reset tax
          date_issued: new Date().toISOString().split("T")[0], // Reset date
        }));

        // Since fetchAvailableRentals runs on customer_id change,
        // we need to manually set the selected rental *after* rentals are fetched.
        // This might require another useEffect dependent on availableRentals.
      } else {
        toast.error("Selected customer from rental is not available.");
        navigate("/greentarget/invoices/new"); // Redirect or handle error
      }
    }
  }, [rentalData, isEditMode, customers, navigate]); // Add customers and navigate to dependencies

  // Effect to select the correct rental when editing or coming from rentalData
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
    // If coming from rentalData, select the rental once availableRentals is populated
    else if (
      rentalData &&
      !isEditMode &&
      rentalData.rental_id &&
      availableRentals.length > 0 &&
      !selectedRental
    ) {
      const targetRental = availableRentals.find(
        (r) => r.rental_id === rentalData.rental_id
      );
      if (targetRental) {
        setSelectedRental(targetRental);
        setFormData((prev) => ({ ...prev, rental_id: targetRental.rental_id })); // Ensure formData has rental_id
        // Set initialFormData here as well if needed for change detection
        setInitialFormData((prev) => ({
          ...prev,
          customer_id: targetRental.customer_id,
          rental_id: targetRental.rental_id,
        }));
      }
    }
  }, [
    formData.rental_id,
    formData.type,
    availableRentals,
    isEditMode,
    rentalData,
    selectedRental,
  ]);

  const fetchCustomers = async () => {
    try {
      const data = await greenTargetApi.getCustomers();
      setCustomers(data); // Assuming API returns Customer[]
    } catch (err) {
      console.error("Error fetching customers:", err);
      toast.error("Failed to load customers.");
    }
  };

  const fetchAvailableRentals = async (customerId: number) => {
    // Avoid fetching if customerId is 0 or invalid
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
        // Type the expected response
        `/greentarget/api/rentals?${params.toString()}`
      );

      // Filter out rentals that already have invoices, *unless* we are editing
      // and the rental belongs to the current invoice being edited.
      const availableRentalsData = data.filter(
        (rental: Rental) =>
          !rental.invoice_info ||
          (isEditMode && rental.rental_id === initialFormData.rental_id)
      );

      setAvailableRentals(availableRentalsData);

      // Reset selected rental if the current one is no longer in the available list
      // (unless it's the one associated with the invoice being edited)
      if (
        selectedRental &&
        !availableRentalsData.some(
          (r) => r.rental_id === selectedRental.rental_id
        )
      ) {
        if (
          !(
            isEditMode && selectedRental.rental_id === initialFormData.rental_id
          )
        ) {
          setSelectedRental(null);
          setFormData((prev) => ({ ...prev, rental_id: null }));
        }
      }

      // If editing and we have a rental_id, try find and set it (handled by separate useEffect now)
      // if (isEditMode && formData.rental_id) {
      //   const selected = availableRentalsData.find( // Search in filtered list
      //     (r: Rental) => r.rental_id === formData.rental_id
      //   );
      //   setSelectedRental(selected || null); // Set selected rental UI state
      // }
    } catch (err) {
      console.error("Error fetching rentals:", err);
      toast.error("Failed to load available rentals.");
      setAvailableRentals([]); // Clear on error
      setSelectedRental(null);
    }
  };

  const fetchInvoiceDetails = async (invoiceId: number) => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getInvoice(invoiceId);

      if (!data.invoice) {
        throw new Error("Invalid invoice data returned from API");
      }

      const invoice = data.invoice;

      const parsedFormData: Invoice = {
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        type: invoice.type,
        customer_id: invoice.customer_id,
        rental_id: invoice.rental_id ?? null, // Handle potential null/undefined
        amount_before_tax: parseFloat(invoice.amount_before_tax.toString()), // Ensure number
        tax_amount: parseFloat(invoice.tax_amount.toString()), // Ensure number
        date_issued: invoice.date_issued
          ? new Date(invoice.date_issued).toISOString().split("T")[0]
          : "", // Format date
        statement_period_start: invoice.statement_period_start
          ? new Date(invoice.statement_period_start).toISOString().split("T")[0]
          : null,
        statement_period_end: invoice.statement_period_end
          ? new Date(invoice.statement_period_end).toISOString().split("T")[0]
          : null,
      };

      setFormData(parsedFormData);
      setInitialFormData(parsedFormData); // Set initial state AFTER fetching

      setError(null);
    } catch (err) {
      setError("Failed to fetch invoice details. Please try again later.");
      console.error("Error fetching invoice details:", err);
    } finally {
      setLoading(false);
    }
  };

  const isRentalActive = (datePickedStr: string | null | undefined) => {
    // Allow undefined
    if (!datePickedStr) return true;

    try {
      // Convert dates to YYYY-MM-DD format for reliable comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize today's date

      const pickupDate = new Date(datePickedStr);
      pickupDate.setHours(0, 0, 0, 0); // Normalize pickup date

      // If pickup date is valid and in the future, it's active
      return !isNaN(pickupDate.getTime()) && pickupDate >= today;
    } catch (e) {
      console.error("Error comparing rental dates:", datePickedStr, e);
      return false; // Treat as inactive on error
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    > // Added TextArea
  ) => {
    const { name, value, type } = e.target;

    // Handle numeric inputs
    if (type === "number") {
      setFormData((prev) => ({
        ...prev,
        [name]: value === "" ? 0 : parseFloat(value) || 0, // Handle empty string case
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Specific handler for Invoice Type Radio buttons
  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === "type") {
      if (value === "regular") {
        setFormData((prev) => ({
          ...prev,
          type: "regular",
          statement_period_start: null,
          statement_period_end: null,
          // Restore the previously selected rental if available and customer matches
          rental_id:
            previousRental.rental?.customer_id === prev.customer_id
              ? previousRental.rental_id
              : null,
        }));
        // Also restore the selected rental UI state conditionally
        setSelectedRental(
          previousRental.rental?.customer_id === formData.customer_id
            ? previousRental.rental
            : null
        );
      } else if (value === "statement") {
        // Save the current rental before setting it to null
        setPreviousRental({
          rental_id: formData.rental_id ?? null,
          rental: selectedRental,
        });
        setFormData((prev) => ({
          ...prev,
          type: "statement",
          rental_id: null, // Clear rental ID for statement
          // Optionally clear statement dates if switching back and forth?
          // statement_period_start: null,
          // statement_period_end: null,
        }));
        // Clear the selected rental UI state for consistency
        setSelectedRental(null);
      }
    }
  };

  // Handler for Customer Listbox
  const handleCustomerChange = (customerIdString: string) => {
    const customerId = customerIdString === "" ? 0 : Number(customerIdString);
    setFormData((prev) => ({
      ...prev,
      customer_id: customerId,
      rental_id: null, // Reset rental when customer changes
    }));
    setSelectedRental(null); // Reset selected rental UI
    // previousRental state might also need reset depending on desired logic
    setPreviousRental({ rental_id: null, rental: null });
  };

  // Handler for Rental Listbox
  const handleRentalChange = (rentalIdString: string) => {
    const rentalId = rentalIdString === "" ? null : Number(rentalIdString);
    const newSelectedRental =
      availableRentals.find((r) => r.rental_id === rentalId) || null;
    setSelectedRental(newSelectedRental);
    setFormData((prev) => ({
      ...prev,
      rental_id: rentalId,
    }));
  };

  // Handler for Payment Method Listbox (when 'Paid' is checked)
  const handlePaymentMethodChange = (methodIdString: string) => {
    setPaymentMethod(methodIdString); // Update paymentMethod state (string)
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      // Navigate back intelligently (e.g., to list or details page)
      if (isEditMode && id) {
        navigate(`/greentarget/invoices/${id}`);
      } else {
        navigate("/greentarget/invoices");
      }
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    if (isEditMode && id) {
      navigate(`/greentarget/invoices/${id}`);
    } else {
      navigate("/greentarget/invoices");
    }
  };

  const validateForm = (): boolean => {
    if (!formData.customer_id || formData.customer_id <= 0) {
      toast.error("Please select a customer");
      return false;
    }

    const selectedCustomer = customers.find(
      (c) => c.customer_id === formData.customer_id
    );

    if (
      formData.type === "regular" &&
      (!formData.rental_id || formData.rental_id <= 0)
    ) {
      toast.error("Please select a rental for this invoice");
      return false;
    }

    // Check if the selected rental (if any) already has an invoice *not* being edited
    if (
      formData.type === "regular" &&
      selectedRental &&
      selectedRental.invoice_info &&
      selectedRental.invoice_info.invoice_id !== formData.invoice_id // Allow if it's the invoice being edited
    ) {
      toast.error(
        `Rental #${selectedRental.rental_id} already has Invoice #${selectedRental.invoice_info.invoice_number}.`
      );
      return false;
    }

    if (
      formData.type === "statement" &&
      (!formData.statement_period_start || !formData.statement_period_end)
    ) {
      toast.error("Please specify the statement period start and end dates");
      return false;
    }

    if (
      formData.type === "statement" &&
      formData.statement_period_start &&
      formData.statement_period_end &&
      new Date(formData.statement_period_start) >
        new Date(formData.statement_period_end)
    ) {
      toast.error("Statement start date cannot be after the end date");
      return false;
    }

    if (!formData.date_issued) {
      toast.error("Please specify the issue date");
      return false;
    }

    // Check amount only if it's not calculated automatically (if it is, validation might not be needed here)
    if (formData.amount_before_tax <= 0 && formData.tax_amount <= 0) {
      toast.error("Invoice total amount must be greater than zero");
      return false;
    }

    // e-Invoice specific validation (only if submitting)
    if (!isEditMode && submitAsEinvoice) {
      if (!selectedCustomer) {
        toast.error("Cannot submit e-Invoice: Customer data is missing.");
        return false;
      }
      if (!selectedCustomer.tin_number || !selectedCustomer.id_number) {
        toast.error(
          "Cannot submit e-Invoice: Customer TIN or ID number is missing."
        );
        // Optionally show the error dialog immediately or prevent submission
        setEinvoiceErrorMessage(
          "e-Invoice requires the customer to have both a TIN number and an ID number (MyKad/Passport/Army/Police) registered."
        );
        setShowEinvoiceError(true);
        return false;
      }
    }

    // Paid validation
    if (isPaid && !paymentMethod) {
      toast.error("Please select a payment method for the recorded payment.");
      return false;
    }
    if (
      isPaid &&
      (paymentMethod === "cheque" || paymentMethod === "bank_transfer") &&
      !paymentReference
    ) {
      toast.error(
        `Please enter the ${
          paymentMethod === "cheque" ? "Cheque Number" : "Transaction Reference"
        }.`
      );
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    // Calculate total
    const totalAmount = formData.amount_before_tax + formData.tax_amount;

    try {
      // Prepare the payload - ensure numbers are numbers, dates are strings, nulls are nulls
      const invoiceData: Omit<Invoice, "invoice_id" | "invoice_number"> & {
        total_amount: number;
        invoice_id?: number;
      } = {
        type: formData.type,
        customer_id: Number(formData.customer_id), // Ensure number
        rental_id: formData.rental_id ? Number(formData.rental_id) : null, // Ensure number or null
        amount_before_tax: Number(formData.amount_before_tax), // Ensure number
        tax_amount: Number(formData.tax_amount), // Ensure number
        total_amount: Number(totalAmount), // Ensure number
        date_issued: formData.date_issued, // Should be 'YYYY-MM-DD' string
        statement_period_start: formData.statement_period_start || null, // Ensure string or null
        statement_period_end: formData.statement_period_end || null, // Ensure string or null
      };

      if (isEditMode && formData.invoice_id) {
        invoiceData.invoice_id = formData.invoice_id; // Add ID for update
      }

      let response;
      let navigateToInvoiceId: number | null = null;

      if (isEditMode && invoiceData.invoice_id) {
        // Update existing invoice
        response = await greenTargetApi.updateInvoice(
          invoiceData.invoice_id,
          invoiceData // Send prepared data
        );
        toast.success("Invoice updated successfully");
        navigateToInvoiceId = invoiceData.invoice_id; // Use existing ID
      } else {
        // Create new invoice
        response = await greenTargetApi.createInvoice(invoiceData); // Send prepared data

        if (response.invoice && response.invoice.invoice_id) {
          navigateToInvoiceId = response.invoice.invoice_id; // Get new ID
          toast.success("Invoice created successfully"); // Initial success message

          // --- Submit e-Invoice if checked ---
          const selectedCustomer = customers.find(
            (c) => c.customer_id === formData.customer_id
          );
          if (
            submitAsEinvoice &&
            selectedCustomer?.tin_number &&
            selectedCustomer?.id_number &&
            navigateToInvoiceId !== null // Check requirements again just in case
          ) {
            const einvoiceToastId = toast.loading("Submitting e-Invoice...", {
              duration: 5000,
            }); // Give it time
            try {
              const einvoiceResponse = await greenTargetApi.submitEInvoice(
                navigateToInvoiceId
              );
              if (einvoiceResponse.success) {
                toast.success("e-Invoice submitted successfully", {
                  id: einvoiceToastId,
                });
              } else {
                // Update toast to error, show dialog
                toast.error(
                  einvoiceResponse.message || "Failed to submit e-Invoice",
                  { id: einvoiceToastId }
                );
                setEinvoiceErrorMessage(
                  einvoiceResponse.message || "Failed to submit e-Invoice"
                );
                setShowEinvoiceError(true); // Show error dialog, user stays on form page
                setIsSaving(false); // Allow user to correct or proceed without e-invoice next time
                return; // Stop further processing like payment recording or navigation
              }
            } catch (einvoiceError) {
              console.error("e-Invoice submission error:", einvoiceError);
              const errorMsg =
                einvoiceError instanceof Error
                  ? einvoiceError.message
                  : "Unknown error";
              toast.error(`Failed to submit e-Invoice: ${errorMsg}`, {
                id: einvoiceToastId,
              });
              setEinvoiceErrorMessage(
                `Failed to submit e-Invoice: ${errorMsg}`
              );
              setShowEinvoiceError(true);
              setIsSaving(false);
              return;
            }
          }

          // --- Record Payment if checked ---
          if (isPaid) {
            const paymentToastId = toast.loading("Recording payment...", {
              duration: 4000,
            });
            try {
              // Fetch all payments to find unused reference numbers for the current month and year
              const allPayments = await greenTargetApi.getPayments();
              const currentYear = new Date().getFullYear().toString().slice(-2);
              const currentMonth = (new Date().getMonth() + 1)
                .toString()
                .padStart(2, "0");
              const regex = new RegExp(
                `^RV${currentYear}/${currentMonth}/(\\d+)$`
              );
              const usedNumbers = new Set<number>();
              allPayments.forEach(
                (payment: { internal_reference: string | null }) => {
                  if (payment.internal_reference) {
                    const match = payment.internal_reference.match(regex);
                    if (match) usedNumbers.add(parseInt(match[1], 10));
                  }
                }
              );
              let nextNumber = 1;
              while (usedNumbers.has(nextNumber)) nextNumber++;
              const referenceNumber = `RV${currentYear}/${currentMonth}/${nextNumber
                .toString()
                .padStart(2, "0")}`;

              const paymentData = {
                invoice_id: navigateToInvoiceId,
                payment_date: new Date().toISOString().split("T")[0], // Use current date for immediate payment
                amount_paid: totalAmount, // Pay the full amount
                payment_method: paymentMethod, // From state
                payment_reference: paymentReference || null, // From state
                internal_reference: referenceNumber,
              };

              await greenTargetApi.createPayment(paymentData);
              toast.success("Payment recorded successfully", {
                id: paymentToastId,
              });
            } catch (paymentError) {
              console.error("Error recording payment:", paymentError);
              toast.error("Invoice created, but failed to record payment.", {
                id: paymentToastId,
              });
              // Decide if navigation should still happen
            }
          }

          // Navigate only if invoice creation was successful
          if (navigateToInvoiceId) {
            navigate(`/greentarget/invoices/${navigateToInvoiceId}`);
          }
        } else {
          // Handle case where invoice creation failed silently or returned unexpected structure
          throw new Error(
            response.message ||
              "Failed to create invoice - unexpected response from server."
          );
        }
      }
    } catch (error) {
      console.error("Error saving invoice:", error);
      const errorMsg =
        error instanceof Error ? error.message : "An unknown error occurred";
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate total amount for display
  const totalAmount =
    (Number(formData.amount_before_tax) || 0) +
    (Number(formData.tax_amount) || 0);

  // Helper to get display name for listboxes
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

  if (loading && isEditMode) {
    // Only show loading spinner when editing
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto -mt-12 px-4">
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

  // Prepare options for listboxes (ensure they are SelectOption[])
  const customerOptions: SelectOption[] = customers.map((c) => ({
    id: c.customer_id,
    name: c.name,
  }));
  const rentalOptions: SelectOption[] = availableRentals.map((r) => ({
    id: r.rental_id,
    name: `Rental #${r.rental_id} - ${r.tong_no} (${new Date(
      r.date_placed
    ).toLocaleDateString()})${
      r.location_address ? ` - ${r.location_address}` : ""
    }`,
  }));

  // Find selected customer for e-invoice check display
  const selectedCustomerForEinvoice = customers.find(
    (c) => c.customer_id === formData.customer_id
  );
  const canSubmitEinvoice = !!(
    selectedCustomerForEinvoice?.tin_number &&
    selectedCustomerForEinvoice?.id_number
  );

  return (
    <div className="container mx-auto -mt-12 px-4 pb-10">
      {" "}
      {/* Added pb-10 */}
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg shadow border border-default-200">
        <div className="p-6 border-b border-default-200">
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode
              ? `Edit Invoice ${
                  formData.invoice_number ? `(#${formData.invoice_number})` : ""
                }`
              : "Create New Invoice"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? "Update invoice information. Fields like type and customer may be locked."
              : "Fill in the details below to create a new invoice."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          {/* Invoice Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-default-700 mb-2">
              Invoice Type
            </label>
            <div className="flex space-x-4">
              <label className="inline-flex items-center cursor-pointer">
                <div className="relative flex items-center">
                  <input
                    type="radio"
                    name="type"
                    value="regular"
                    checked={formData.type === "regular"}
                    onChange={handleTypeChange} // Use dedicated handler
                    className="sr-only" // Hide the actual radio input
                    disabled={isEditMode} // Disable changing type when editing
                  />
                  {/* Custom radio button appearance */}
                  <div
                    className={clsx(
                      "w-4 h-4 rounded-full border flex items-center justify-center mr-2",
                      formData.type === "regular"
                        ? "border-sky-500 bg-white"
                        : "border-default-300 bg-white",
                      isEditMode ? "cursor-not-allowed opacity-50" : ""
                    )}
                  >
                    {formData.type === "regular" && (
                      <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                    )}
                  </div>
                  <span
                    className={clsx(
                      "text-sm",
                      isEditMode ? "text-default-500" : "text-default-700"
                    )}
                  >
                    Regular Invoice
                  </span>
                </div>
              </label>
              <label className="inline-flex items-center cursor-pointer">
                <div className="relative flex items-center">
                  <input
                    type="radio"
                    name="type"
                    value="statement"
                    checked={formData.type === "statement"}
                    onChange={handleTypeChange} // Use dedicated handler
                    className="sr-only"
                    disabled={isEditMode}
                  />
                  {/* Custom radio button appearance */}
                  <div
                    className={clsx(
                      "w-4 h-4 rounded-full border flex items-center justify-center mr-2",
                      formData.type === "statement"
                        ? "border-sky-500 bg-white"
                        : "border-default-300 bg-white",
                      isEditMode ? "cursor-not-allowed opacity-50" : ""
                    )}
                  >
                    {formData.type === "statement" && (
                      <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                    )}
                  </div>
                  <span
                    className={clsx(
                      "text-sm",
                      isEditMode ? "text-default-500" : "text-default-700"
                    )}
                  >
                    Statement
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Customer Selection Listbox (Styled like FormListbox) */}
            <div className="space-y-2">
              <label
                htmlFor="customer_id-button"
                className="block text-sm font-medium text-default-700"
              >
                Customer <span className="text-red-500">*</span>
              </label>
              <Listbox
                value={formData.customer_id?.toString() ?? ""} // Use string value
                onChange={handleCustomerChange} // Use dedicated handler
                disabled={isEditMode} // Lock customer when editing
                name="customer_id"
              >
                <div className="relative">
                  <HeadlessListboxButton
                    id="customer_id-button"
                    className={clsx(
                      "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                      isEditMode
                        ? "bg-gray-50 text-gray-500 cursor-not-allowed"
                        : ""
                    )}
                  >
                    <span className="block truncate">
                      {getOptionName(customerOptions, formData.customer_id) ||
                        "Select Customer"}
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
                        "mt-1" // Default position bottom
                      )}
                    >
                      {/* Placeholder option */}
                      <ListboxOption
                        value=""
                        disabled
                        className="text-gray-400 italic py-2 pl-3 pr-10 select-none"
                      >
                        Select Customer
                      </ListboxOption>
                      {customerOptions.map((option) => (
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
                      ))}
                    </ListboxOptions>
                  </Transition>
                </div>
              </Listbox>
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
                  // Use clsx for consistency
                  "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                  "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                )}
              />
            </div>
          </div>

          {/* Conditional Fields Based on Invoice Type */}
          {formData.type === "regular" ? (
            <div className="mt-6">
              <div className="space-y-2">
                <label
                  htmlFor="rental_id-button"
                  className="block text-sm font-medium text-default-700"
                >
                  Select Rental <span className="text-red-500">*</span>
                </label>
                <Listbox
                  value={formData.rental_id?.toString() ?? ""} // Use string value
                  onChange={handleRentalChange} // Use dedicated handler
                  disabled={!formData.customer_id || isEditMode} // Lock if no customer or editing
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
                          "mt-1" // Default position bottom
                        )}
                      >
                        {/* Placeholder option */}
                        <ListboxOption
                          value=""
                          disabled
                          className="text-gray-400 italic py-2 pl-3 pr-10 select-none"
                        >
                          Select Rental
                        </ListboxOption>
                        {rentalOptions.length === 0 && formData.customer_id ? (
                          <div className="relative cursor-default select-none py-2 px-4 text-gray-500">
                            No available rentals found for this customer.
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

              {/* Display Selected Rental Details */}
              {selectedRental && (
                <div className="mt-3 rounded-lg border border-default-200 overflow-hidden">
                  {/* Status Banner */}
                  <div
                    className={`px-4 py-2 ${
                      isRentalActive(selectedRental.date_picked)
                        ? "bg-green-500 text-white"
                        : "bg-default-100 text-default-700"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Selected Rental Details</h3>
                      <span
                        className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                          isRentalActive(selectedRental.date_picked)
                            ? "bg-green-400/30 text-white"
                            : "bg-default-200 text-default-600"
                        }`}
                      >
                        {isRentalActive(selectedRental.date_picked)
                          ? "Ongoing"
                          : "Completed"}
                        {selectedRental.invoice_info &&
                          selectedRental.invoice_info.invoice_id !==
                            formData.invoice_id && (
                            <span className="ml-2 text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                              (Has Invoice #
                              {selectedRental.invoice_info.invoice_number})
                            </span>
                          )}
                      </span>
                    </div>
                  </div>

                  {/* Rental Information */}
                  <div className="p-4 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {/* Dates */}
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
                      {/* Other details */}
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
          ) : (
            // Statement Type Fields
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="statement_period_start"
                  className="block text-sm font-medium text-default-700"
                >
                  Statement Period Start <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="statement_period_start"
                  name="statement_period_start"
                  value={formData.statement_period_start || ""}
                  onChange={handleInputChange}
                  required
                  className={clsx(
                    // Use clsx for consistency
                    "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                  )}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="statement_period_end"
                  className="block text-sm font-medium text-default-700"
                >
                  Statement Period End <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="statement_period_end"
                  name="statement_period_end"
                  value={formData.statement_period_end || ""}
                  onChange={handleInputChange}
                  required
                  className={clsx(
                    // Use clsx for consistency
                    "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                  )}
                />
              </div>
            </div>
          )}

          {/* Amount and Tax Section */}
          <div className="mt-6 border-t pt-6">
            <h2 className="text-lg font-medium mb-4">Invoice Amount</h2>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
              {/* Amount Before Tax */}
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

              {/* Tax Amount */}
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
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm bg-default-50" // Slightly different background?
                    )}
                  />
                </div>
              </div>

              {/* Total Amount (Read Only) */}
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
                    className="w-full pl-10 pr-3 py-1.5 border border-default-300 rounded-lg bg-gray-100 font-medium text-default-700 cursor-default" // Read-only style
                    readOnly
                    tabIndex={-1} // Prevent tabbing into read-only
                  />
                </div>
              </div>

              {/* Paid Checkbox - Only show when CREATING */}
              {!isEditMode && (
                <div className="space-y-2 flex items-end pb-1">
                  {" "}
                  {/* Align with bottom of inputs */}
                  <div className="flex items-center h-[42px]">
                    {" "}
                    {/* Match input height */}
                    <button
                      type="button"
                      onClick={() => setIsPaid(!isPaid)}
                      className="flex items-center cursor-pointer group p-1" // Added padding for easier click
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

          {/* Payment Method Section - Only shown when isPaid is true AND Creating */}
          {!isEditMode && isPaid && (
            <div className="mt-6 border-t pt-6">
              <h2 className="text-lg font-medium mb-4">
                Payment Information (Optional)
              </h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {/* Payment Method Listbox */}
                <div className="space-y-2">
                  <label
                    htmlFor="payment_method-button-paid"
                    className="block text-sm font-medium text-default-700"
                  >
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <Listbox
                    value={paymentMethod}
                    onChange={handlePaymentMethodChange}
                    name="payment_method_paid"
                  >
                    <div className="relative">
                      <HeadlessListboxButton
                        id="payment_method-button-paid"
                        className={clsx(
                          "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
                          "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        )}
                      >
                        <span className="block truncate">
                          {getOptionName(paymentMethodOptions, paymentMethod) ||
                            "Select Method"}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <IconChevronDown
                            size={20}
                            className="text-gray-400"
                            aria-hidden="true"
                          />
                        </span>
                      </HeadlessListboxButton>
                      {/* Position options upwards using optionsPosition="top" */}
                      <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <ListboxOptions
                          className={clsx(
                            "absolute z-20 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                            "bottom-full mb-1" // Position above
                          )}
                        >
                          {paymentMethodOptions.map((option) => (
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
                          ))}
                        </ListboxOptions>
                      </Transition>
                    </div>
                  </Listbox>
                </div>

                {/* Conditional Reference Input */}
                {(paymentMethod === "cheque" ||
                  paymentMethod === "bank_transfer") && (
                  <div className="space-y-2">
                    <label
                      htmlFor="payment_reference"
                      className="block text-sm font-medium text-default-700"
                    >
                      {paymentMethod === "cheque"
                        ? "Cheque Number"
                        : "Transaction Reference"}{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="payment_reference"
                      name="payment_reference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      required
                      className={clsx(
                        // Use clsx for consistency
                        "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* e-Invoice Section - Only show when CREATING and customer meets criteria */}
          {!isEditMode && formData.customer_id > 0 && (
            <div className="mt-6 border-t pt-6">
              <h2 className="text-lg font-medium mb-2">e-Invoice Option</h2>
              {canSubmitEinvoice ? (
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
                      Submit as e-Invoice upon saving
                    </span>
                  </button>
                  <span className="text-xs text-default-500">
                    (Requires Customer TIN & ID)
                  </span>
                </div>
              ) : (
                <p className="text-sm text-default-500">
                  Cannot submit as e-Invoice. The selected customer is missing a
                  required TIN number or ID number.
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-8 pt-5 border-t border-default-200 flex justify-end">
            <Button
              type="button" // Changed type to button
              variant="outline"
              color="secondary"
              onClick={handleBackClick}
              className="mr-3"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="filled" // Use filled for primary action
              color="sky"
              disabled={isSaving || (!isFormChanged && isEditMode)} // Disable if not changed in edit mode
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
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to leave? Unsaved changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
      {/* Dialog for e-invoice errors */}
      <ConfirmationDialog
        isOpen={showEinvoiceError}
        onClose={() => setShowEinvoiceError(false)}
        onConfirm={() => setShowEinvoiceError(false)} // Just close it
        title="e-Invoice Submission Issue"
        message={einvoiceErrorMessage || "An unexpected error occurred."}
        confirmButtonText="OK"
        variant="danger"
        hideCancelButton={true}
      />
    </div>
  );
};

// Helper component for Rental Details info items
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

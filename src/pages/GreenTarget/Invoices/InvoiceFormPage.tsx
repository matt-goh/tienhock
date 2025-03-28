// src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx
import React, { useState, useEffect } from "react";
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
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  IconChevronDown,
  IconCheck,
  IconSquareCheckFilled,
  IconSquare,
} from "@tabler/icons-react";

interface Customer {
  customer_id: number;
  tin_number: string;
  id_number: string;
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
  customer_id: number;
  rental_id?: number | null;
  amount_before_tax: number;
  tax_amount: number;
  total_amount?: number;
  date_issued: string;
  statement_period_start?: string | null;
  statement_period_end?: string | null;
}

const InvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<Invoice>({
    type: "regular",
    customer_id: 0,
    amount_before_tax: 200,
    tax_amount: 0,
    date_issued: new Date().toISOString().split("T")[0],
  });

  const [initialFormData, setInitialFormData] = useState<Invoice>({
    type: "regular",
    customer_id: 0,
    amount_before_tax: 200,
    tax_amount: 0,
    date_issued: new Date().toISOString().split("T")[0],
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
  const [paymentMethod, setPaymentMethod] = useState("cash");
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

  // Fetch rentals when customer changes
  useEffect(() => {
    if (formData.customer_id && formData.type === "regular") {
      fetchAvailableRentals(formData.customer_id);
    }
  }, [formData.customer_id, formData.type]);

  useEffect(() => {
    if (rentalData && !isEditMode) {
      // Pre-populate form with rental data
      setFormData((prev) => ({
        ...prev,
        customer_id: rentalData.customer_id,
        rental_id: rentalData.rental_id,
        location_address: rentalData.location_address,
        amount_before_tax: 200, // Default amount, adjust as needed
      }));

      // Set the selected rental
      if (rentalData.rental_id) {
        const rental = {
          rental_id: rentalData.rental_id,
          customer_id: rentalData.customer_id,
          tong_no: rentalData.tong_no,
          driver: rentalData.driver,
          date_placed: rentalData.date_placed,
          date_picked: rentalData.date_picked,
          location_address: rentalData.location_address,
        };
        setSelectedRental(rental);
      }
    }
  }, [rentalData, isEditMode]);

  const fetchCustomers = async () => {
    try {
      const data = await greenTargetApi.getCustomers();
      // Filter to only active customers
      setCustomers(data);
    } catch (err) {
      console.error("Error fetching customers:", err);
      toast.error("Failed to load customers.");
    }
  };

  const fetchAvailableRentals = async (customerId: number) => {
    try {
      const params = new URLSearchParams({
        customer_id: customerId.toString(),
      });

      const data = await api.get(
        `/greentarget/api/rentals?${params.toString()}`
      );

      // Filter out rentals that already have invoices
      const availableRentalsData = data.filter(
        (rental: Rental) => !rental.invoice_info
      );

      setAvailableRentals(availableRentalsData);

      // If editing and we have a rental_id, select that rental
      if (isEditMode && formData.rental_id) {
        const selected = data.find(
          (r: Rental) => r.rental_id === formData.rental_id
        );
        if (selected) {
          setSelectedRental(selected);
        }
      }
    } catch (err) {
      console.error("Error fetching rentals:", err);
      toast.error("Failed to load available rentals.");
    }
  };

  const fetchInvoiceDetails = async (invoiceId: number) => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getInvoice(invoiceId);

      if (!data.invoice) {
        throw new Error("Invalid invoice data returned from API");
      }

      // Format the data for our form
      const invoice = data.invoice;

      setFormData({
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        type: invoice.type,
        customer_id: invoice.customer_id,
        rental_id: invoice.rental_id,
        amount_before_tax: parseFloat(invoice.amount_before_tax),
        tax_amount: parseFloat(invoice.tax_amount),
        date_issued: new Date(invoice.date_issued).toISOString().split("T")[0],
        statement_period_start: invoice.statement_period_start
          ? new Date(invoice.statement_period_start).toISOString().split("T")[0]
          : null,
        statement_period_end: invoice.statement_period_end
          ? new Date(invoice.statement_period_end).toISOString().split("T")[0]
          : null,
      });

      setInitialFormData({
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        type: invoice.type,
        customer_id: invoice.customer_id,
        rental_id: invoice.rental_id,
        amount_before_tax: parseFloat(invoice.amount_before_tax),
        tax_amount: parseFloat(invoice.tax_amount),
        date_issued: new Date(invoice.date_issued).toISOString().split("T")[0],
        statement_period_start: invoice.statement_period_start
          ? new Date(invoice.statement_period_start).toISOString().split("T")[0]
          : null,
        statement_period_end: invoice.statement_period_end
          ? new Date(invoice.statement_period_end).toISOString().split("T")[0]
          : null,
      });

      setError(null);
    } catch (err) {
      setError("Failed to fetch invoice details. Please try again later.");
      console.error("Error fetching invoice details:", err);
    } finally {
      setLoading(false);
    }
  };

  const isRentalActive = (datePickedStr: string | null) => {
    if (!datePickedStr) return true;

    // Convert dates to YYYY-MM-DD format for reliable comparison
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Get just the date part
    const pickupDateStr = datePickedStr.split("T")[0];

    // If pickup date is today or in the past, consider it completed
    return pickupDateStr > todayStr;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    // Handle numeric inputs
    if (type === "number") {
      setFormData((prev) => ({
        ...prev,
        [name]: parseFloat(value) || 0,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    // Special handling for invoice type
    if (name === "type") {
      // Reset related fields when switching types
      if (value === "regular") {
        setFormData((prev) => ({
          ...prev,
          [name]: value,
          statement_period_start: null,
          statement_period_end: null,
          // Restore the previously selected rental if available
          rental_id: previousRental.rental_id,
        }));
        // Also restore the selected rental UI state
        setSelectedRental(previousRental.rental);
      } else if (value === "statement") {
        // Save the current rental before setting it to null
        setPreviousRental({
          rental_id: formData.rental_id ?? null,
          rental: selectedRental,
        });
        setFormData((prev) => ({
          ...prev,
          [name]: value,
          rental_id: null,
        }));
        // Clear the selected rental UI state for consistency
        setSelectedRental(null);
      }
    }

    // When customer changes, reset rental
    if (name === "customer_id") {
      setFormData((prev) => ({
        ...prev,
        [name]: parseInt(value),
        rental_id: null,
      }));
      setSelectedRental(null);
    }
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/greentarget/invoices");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/greentarget/invoices");
  };

  const validateForm = (): boolean => {
    if (!formData.customer_id) {
      toast.error("Please select a customer");
      return false;
    }

    if (formData.type === "regular" && !formData.rental_id) {
      toast.error("Please select a rental for this invoice");
      return false;
    }

    // Check if the selected rental already has an invoice
    if (
      formData.type === "regular" &&
      selectedRental &&
      selectedRental.invoice_info
    ) {
      toast.error(
        "This rental already has an invoice. Please select a different rental."
      );
      return false;
    }

    if (
      formData.type === "statement" &&
      (!formData.statement_period_start || !formData.statement_period_end)
    ) {
      toast.error("Please specify the statement period");
      return false;
    }

    if (!formData.date_issued) {
      toast.error("Please specify the issue date");
      return false;
    }

    if (formData.amount_before_tax <= 0) {
      toast.error("Amount must be greater than zero");
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

    // Calculate total for display
    const totalAmount = formData.amount_before_tax + formData.tax_amount;

    try {
      // Prepare the payload
      const invoiceData = {
        ...formData,
        // Make sure to include total_amount
        total_amount: totalAmount,
      };

      let response;

      if (isEditMode && formData.invoice_id) {
        // Update existing invoice
        response = await greenTargetApi.updateInvoice(
          formData.invoice_id,
          invoiceData
        );
        toast.success("Invoice updated successfully");
      } else {
        // Create new invoice
        response = await greenTargetApi.createInvoice(invoiceData);

        // If the invoice is created successfully and submitAsEinvoice is checked
        if (
          submitAsEinvoice &&
          response.invoice &&
          response.invoice.invoice_id
        ) {
          try {
            toast.loading("Submitting e-Invoice...", { id: "einvoice-toast" });

            // Submit e-Invoice
            const einvoiceResponse = await greenTargetApi.submitEInvoice(
              response.invoice.invoice_id
            );

            if (einvoiceResponse.success) {
              toast.success("e-Invoice submitted successfully", {
                id: "einvoice-toast",
              });
            } else {
              toast.error(
                einvoiceResponse.message || "Failed to submit e-Invoice",
                { id: "einvoice-toast" }
              );
              setEinvoiceErrorMessage(
                einvoiceResponse.message || "Failed to submit e-Invoice"
              );
              setShowEinvoiceError(true);
            }
          } catch (einvoiceError) {
            console.error("e-Invoice submission error:", einvoiceError);
            toast.error("Failed to submit e-Invoice", { id: "einvoice-toast" });
            setEinvoiceErrorMessage(
              einvoiceError instanceof Error
                ? `Failed to submit e-Invoice: ${einvoiceError.message}`
                : "Failed to submit e-Invoice due to an unknown error"
            );
            setShowEinvoiceError(true);
          }
        }

        // If paid is checked, also create a payment
        if (isPaid && response.invoice && response.invoice.invoice_id) {
          const invoiceId = response.invoice.invoice_id;

          // Fetch all payments to find unused reference numbers for the current month and year
          const allPayments = await greenTargetApi.getPayments();

          // Get current year (last 2 digits) and month (padded with zero)
          const currentYear = new Date().getFullYear().toString().slice(-2);
          const currentMonth = (new Date().getMonth() + 1)
            .toString()
            .padStart(2, "0");

          // Regular expression to match the format RV{year}/{month}/{number}
          const regex = new RegExp(`^RV${currentYear}/${currentMonth}/(\\d+)$`);

          // Extract all used numbers for the current month and year
          const usedNumbers = new Set();
          allPayments.forEach((payment: { internal_reference: string }) => {
            if (payment.internal_reference) {
              const match = payment.internal_reference.match(regex);
              if (match) {
                usedNumbers.add(parseInt(match[1]));
              }
            }
          });

          // Find the first unused number starting from 1
          let nextNumber = 1;
          while (usedNumbers.has(nextNumber)) {
            nextNumber++;
          }

          // Format the reference number
          const paddedNumber = nextNumber.toString().padStart(2, "0");
          const referenceNumber = `RV${currentYear}/${currentMonth}/${paddedNumber}`;

          // Create payment with reference number
          const paymentData = {
            invoice_id: invoiceId,
            payment_date: new Date().toISOString().split("T")[0],
            amount_paid: totalAmount,
            payment_method: paymentMethod,
            payment_reference: paymentReference || null,
            internal_reference: referenceNumber,
          };

          await greenTargetApi.createPayment(paymentData);
          toast.success("Invoice created and payment recorded successfully");
        } else {
          toast.success("Invoice created successfully");
        }
      }

      // Navigate to the invoice detail page
      const invoiceId = response.invoice.invoice_id;
      navigate(`/greentarget/invoices/${invoiceId}`);
    } catch (error) {
      console.error("Error saving invoice:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("An error occurred while saving the invoice");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate total amount for display
  const totalAmount = formData.amount_before_tax + formData.tax_amount;

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto -mt-12 px-4">
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode ? "Edit Invoice" : "Create New Invoice"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? "Update invoice information. Note that for accounting integrity, some fields may not be editable."
              : "Create a new invoice for a customer. Fill in all the required fields and click 'Save'."}
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
                    onChange={handleInputChange}
                    className="sr-only" // Hide the actual radio input
                    disabled={isEditMode}
                  />
                  <div
                    className={`w-4 h-4 rounded-full border ${
                      formData.type === "regular"
                        ? "border-sky-500 bg-white"
                        : "border-default-300 bg-white"
                    } flex items-center justify-center`}
                  >
                    {formData.type === "regular" && (
                      <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                    )}
                  </div>
                </div>
                <span className="ml-2">Regular Invoice</span>
              </label>
              <label className="inline-flex items-center cursor-pointer">
                <div className="relative flex items-center">
                  <input
                    type="radio"
                    name="type"
                    value="statement"
                    checked={formData.type === "statement"}
                    onChange={handleInputChange}
                    className="sr-only" // Hide the actual radio input
                    disabled={isEditMode}
                  />
                  <div
                    className={`w-4 h-4 rounded-full border ${
                      formData.type === "statement"
                        ? "border-sky-500 bg-white"
                        : "border-default-300 bg-white"
                    } flex items-center justify-center`}
                  >
                    {formData.type === "statement" && (
                      <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                    )}
                  </div>
                </div>
                <span className="ml-2">Statement</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Customer Selection */}
            <div className="space-y-2">
              <label
                htmlFor="customer_id"
                className="block text-sm font-medium text-default-700"
              >
                Customer
              </label>
              <Listbox
                value={formData.customer_id || ""}
                onChange={(value) => {
                  setFormData((prev) => ({
                    ...prev,
                    customer_id: value === "" ? 0 : Number(value),
                    rental_id: null,
                  }));
                  setSelectedRental(null);
                }}
                disabled={isEditMode}
              >
                <div className="relative">
                  <ListboxButton className="w-full px-3 py-2 border border-default-300 rounded-lg text-left focus:outline-none focus:border-default-500 disabled:bg-default-50 focus:ring-0">
                    <span className="block truncate">
                      {customers.find(
                        (customer) =>
                          customer.customer_id === formData.customer_id
                      )?.name || "Select Customer"}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <IconChevronDown size={20} className="text-default-500" />
                    </span>
                  </ListboxButton>
                  <ListboxOptions className="absolute z-10 w-full p-1 mt-1 bg-white shadow-lg max-h-60 rounded-lg overflow-auto focus:outline-none border border-default-200">
                    <ListboxOption
                      value=""
                      className={({ active }) =>
                        `relative cursor-pointer select-none rounded py-2 px-3 pr-9 ${
                          active ? "bg-default-100" : "text-default-900"
                        }`
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block truncate ${
                              selected ? "font-medium" : "font-normal"
                            }`}
                          >
                            Select Customer
                          </span>
                          {selected && (
                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                              <IconCheck size={20} />
                            </span>
                          )}
                        </>
                      )}
                    </ListboxOption>
                    {customers.map((customer) => (
                      <ListboxOption
                        key={customer.customer_id}
                        value={customer.customer_id}
                        className={({ active }) =>
                          `relative cursor-pointer select-none rounded py-2 px-3 pr-9 ${
                            active ? "bg-default-100" : "text-default-900"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              {customer.name}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck size={20} />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>

            {/* Invoice Date */}
            <div className="space-y-2">
              <label
                htmlFor="date_issued"
                className="block text-sm font-medium text-default-700"
              >
                Invoice Date
              </label>
              <input
                type="date"
                id="date_issued"
                name="date_issued"
                value={formData.date_issued}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
              />
            </div>
          </div>

          {/* Conditional Fields Based on Invoice Type */}
          {formData.type === "regular" ? (
            <div className="mt-6">
              <div className="space-y-2">
                <label
                  htmlFor="rental_id"
                  className="block text-sm font-medium text-default-700"
                >
                  Select Rental
                </label>
                <Listbox
                  value={formData.rental_id || ""}
                  onChange={(value) => {
                    const rentalId = value === "" ? null : Number(value);
                    const selectedRental = availableRentals.find(
                      (r) => r.rental_id === rentalId
                    );
                    setSelectedRental(selectedRental || null);
                    setFormData((prev) => ({
                      ...prev,
                      rental_id: rentalId,
                    }));
                  }}
                  disabled={isEditMode || !formData.customer_id}
                >
                  <div className="relative">
                    <ListboxButton className="w-full px-3 py-2 border border-default-300 rounded-lg text-left focus:outline-none focus:border-default-500 disabled:bg-default-50 focus:ring-0">
                      <span className="block truncate">
                        {selectedRental
                          ? `Rental #${selectedRental.rental_id} - Dumpster ${
                              selectedRental.tong_no
                            } - Driver: ${
                              selectedRental.driver
                            } - Placed: ${new Date(
                              selectedRental.date_placed
                            ).toLocaleDateString()}${
                              selectedRental.location_address
                                ? ` - ${selectedRental.location_address}`
                                : ""
                            }`
                          : "Select Rental"}
                      </span>
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                        <IconChevronDown
                          size={20}
                          className="text-default-500"
                        />
                      </span>
                    </ListboxButton>
                    <ListboxOptions className="absolute z-10 w-full p-1 mt-1 bg-white shadow-lg max-h-60 rounded-lg overflow-auto focus:outline-none border border-default-200">
                      <ListboxOption
                        value=""
                        className={({ active }) =>
                          `relative cursor-pointer select-none rounded py-2 px-3 pr-9 ${
                            active ? "bg-default-100" : "text-default-900"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              Select Rental
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck size={20} />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                      {availableRentals.map((rental) => (
                        <ListboxOption
                          key={rental.rental_id}
                          value={rental.rental_id}
                          className={({ active }) =>
                            `relative cursor-pointer select-none rounded py-2 px-3 pr-9 ${
                              active ? "bg-default-100" : "text-default-900"
                            }`
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span
                                className={`block truncate ${
                                  selected ? "font-medium" : "font-normal"
                                }`}
                              >
                                Rental #{rental.rental_id} - Dumpster{" "}
                                {rental.tong_no} - Driver: {rental.driver} -
                                Placed:{" "}
                                {new Date(
                                  rental.date_placed
                                ).toLocaleDateString()}
                                {rental.location_address &&
                                  ` - ${rental.location_address}`}
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                  <IconCheck size={20} />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </div>
                </Listbox>
              </div>

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
                      <h3 className="font-medium">Rental Details</h3>
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
                      </span>
                    </div>
                  </div>

                  {/* Rental Information */}
                  <div className="p-4">
                    {/* Rental Dates */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-default-50 p-3 rounded-lg border border-default-100">
                        <div className="text-xs text-default-500 mb-1">
                          Placement Date
                        </div>
                        <div className="font-medium">
                          {new Date(
                            selectedRental.date_placed
                          ).toLocaleDateString()}
                        </div>
                      </div>
                      <div
                        className={`p-3 rounded-lg ${
                          selectedRental.date_picked
                            ? "bg-default-50 border border-default-100"
                            : "bg-green-50 border border-green-100"
                        }`}
                      >
                        <div className="text-xs text-default-500 mb-1">
                          Pickup Date
                        </div>
                        <div
                          className={`font-medium ${
                            !selectedRental.date_picked ? "text-green-600" : ""
                          }`}
                        >
                          {selectedRental.date_picked
                            ? new Date(
                                selectedRental.date_picked
                              ).toLocaleDateString()
                            : "Not picked up yet"}
                        </div>
                      </div>
                    </div>

                    {/* Dumpster, Driver & Location Info */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-default-50 p-3 rounded-lg border border-default-100">
                        <div className="text-xs text-default-500 mb-1">
                          Driver
                        </div>
                        <div className="font-medium">
                          {selectedRental.driver}
                        </div>
                      </div>
                      <div className="bg-default-50 p-3 rounded-lg border border-default-100">
                        <div className="text-xs text-default-500 mb-1">
                          Dumpster
                        </div>
                        <div className="font-medium">
                          {selectedRental.tong_no}
                        </div>
                      </div>
                      <div className="bg-default-50 p-3 rounded-lg border border-default-100">
                        <div className="text-xs text-default-500 mb-1">
                          Location
                        </div>
                        <div className="font-medium flex items-start">
                          <span>
                            {selectedRental.location_address ||
                              "No specific location"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="statement_period_start"
                  className="block text-sm font-medium text-default-700"
                >
                  Statement Period Start
                </label>
                <input
                  type="date"
                  id="statement_period_start"
                  name="statement_period_start"
                  value={formData.statement_period_start || ""}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="statement_period_end"
                  className="block text-sm font-medium text-default-700"
                >
                  Statement Period End
                </label>
                <input
                  type="date"
                  id="statement_period_end"
                  name="statement_period_end"
                  value={formData.statement_period_end || ""}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                />
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
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500">
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
                    className="w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
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
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500">
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
                    className="w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500 bg-default-50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700">
                  Total Amount
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500">
                    RM
                  </span>
                  <input
                    type="text"
                    value={totalAmount.toFixed(2)}
                    className="w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg bg-default-50 font-medium"
                    readOnly
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700">
                  Payment Status
                </label>
                <div className="flex items-center h-[41px]">
                  <button
                    type="button"
                    onClick={() => setIsPaid(!isPaid)}
                    className="flex items-center"
                  >
                    {isPaid ? (
                      <IconSquareCheckFilled
                        className="text-blue-600"
                        width={20}
                        height={20}
                      />
                    ) : (
                      <IconSquare
                        className="text-default-400"
                        width={20}
                        height={20}
                      />
                    )}
                    <span className="ml-2 font-medium">Paid</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Method Section - Only shown when isPaid is true */}
          {isPaid && (
            <div className="mt-6 border-t pt-6">
              <h2 className="text-lg font-medium mb-4">Payment Information</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="payment_method"
                    className="block text-sm font-medium text-default-700"
                  >
                    Payment Method
                  </label>
                  <Listbox value={paymentMethod} onChange={setPaymentMethod}>
                    <div className="relative">
                      <ListboxButton className="w-full px-3 py-2 border border-default-300 rounded-lg text-left focus:outline-none focus:border-default-500 focus:ring-0">
                        <span className="block truncate">
                          {paymentMethod === "cash"
                            ? "Cash"
                            : paymentMethod === "cheque"
                            ? "Cheque"
                            : paymentMethod === "bank_transfer"
                            ? "Bank Transfer"
                            : paymentMethod === "online"
                            ? "Online Payment"
                            : "Select Payment Method"}
                        </span>
                        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                          <IconChevronDown
                            size={20}
                            className="text-default-500"
                          />
                        </span>
                      </ListboxButton>
                      <div className="absolute bottom-full mb-1 w-full">
                        <ListboxOptions className="w-full bg-white shadow-lg max-h-40 overflow-y-auto rounded-lg focus:outline-none border border-default-200">
                          <ListboxOption
                            value="cash"
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 ${
                                active ? "bg-default-100" : ""
                              }`
                            }
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  Cash
                                </span>
                                {selected && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck size={20} />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                          <ListboxOption
                            value="cheque"
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 ${
                                active ? "bg-default-100" : ""
                              }`
                            }
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  Cheque
                                </span>
                                {selected && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck size={20} />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                          <ListboxOption
                            value="bank_transfer"
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 ${
                                active ? "bg-default-100" : ""
                              }`
                            }
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  Bank Transfer
                                </span>
                                {selected && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck size={20} />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                          <ListboxOption
                            value="online"
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 ${
                                active ? "bg-default-100" : ""
                              }`
                            }
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  Online Payment
                                </span>
                                {selected && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck size={20} />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                        </ListboxOptions>
                      </div>
                    </div>
                  </Listbox>
                </div>

                {/* Show reference field based on payment method */}
                {(paymentMethod === "cheque" ||
                  paymentMethod === "bank_transfer") && (
                  <div className="space-y-2">
                    <label
                      htmlFor="payment_reference"
                      className="block text-sm font-medium text-default-700"
                    >
                      {paymentMethod === "cheque"
                        ? "Cheque Number"
                        : "Transaction Reference"}
                    </label>
                    <input
                      type="text"
                      id="payment_reference"
                      name="payment_reference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* e-Invoice Section - Only show if customer has required fields */}
          {formData.customer_id > 0 &&
            customers.find((c) => c.customer_id === formData.customer_id)
              ?.tin_number &&
            customers.find((c) => c.customer_id === formData.customer_id)
              ?.id_number && (
              <div className="mt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSubmitAsEinvoice(!submitAsEinvoice)}
                  className="flex items-center"
                >
                  {submitAsEinvoice ? (
                    <IconSquareCheckFilled
                      className="text-blue-600"
                      width={20}
                      height={20}
                    />
                  ) : (
                    <IconSquare
                      className="text-default-400"
                      width={20}
                      height={20}
                    />
                  )}
                  <span className="ml-2 font-medium">Submit e-Invoice</span>
                </button>
              </div>
            )}

          <div className="mt-8 flex justify-end">
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={isSaving || !isFormChanged}
            >
              {isSaving ? "Saving..." : "Save Invoice"}
            </Button>
          </div>
        </form>
      </div>

      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to go back? All unsaved changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showEinvoiceError}
        onClose={() => setShowEinvoiceError(false)}
        onConfirm={() => setShowEinvoiceError(false)}
        title="e-Invoice Submission Error"
        message={einvoiceErrorMessage}
        confirmButtonText="Close"
        variant="danger"
        hideCancelButton={true}
      />
    </div>
  );
};

export default InvoiceFormPage;

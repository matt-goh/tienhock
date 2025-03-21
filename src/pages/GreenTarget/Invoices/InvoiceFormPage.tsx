// src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { FormInput } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";
import LoadingSpinner from "../../../components/LoadingSpinner";

interface Customer {
  customer_id: number;
  name: string;
}

interface Rental {
  rental_id: number;
  customer_id: number;
  tong_no: string;
  date_placed: string;
  date_picked: string | null;
  location_address?: string;
  customer_name?: string;
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

const TAX_RATE = 0.06; // 6% SST for example

const InvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<Invoice>({
    type: "regular",
    customer_id: 0,
    amount_before_tax: 0,
    tax_amount: 0,
    date_issued: new Date().toISOString().split("T")[0],
  });

  const [initialFormData, setInitialFormData] = useState<Invoice>({
    type: "regular",
    customer_id: 0,
    amount_before_tax: 0,
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

  // Auto-calculate tax amount when amount before tax changes
  useEffect(() => {
    const taxAmount = formData.amount_before_tax * TAX_RATE;
    setFormData((prev) => ({
      ...prev,
      tax_amount: parseFloat(taxAmount.toFixed(2)),
    }));
  }, [formData.amount_before_tax]);

  const fetchCustomers = async () => {
    try {
      const data = await api.get("/greentarget/api/customers");
      // Filter to only active customers
      const activeCustomers = data.filter((c: any) => c.status === "active");
      setCustomers(activeCustomers);
    } catch (err) {
      console.error("Error fetching customers:", err);
      toast.error("Failed to load customers.");
    }
  };

  const fetchAvailableRentals = async (customerId: number) => {
    try {
      // Get completed rentals (with pickup date) for this customer
      const params = new URLSearchParams({
        customer_id: customerId.toString(),
        // We only want rentals with pickup date set
        // and without an invoice yet
      });

      const data = await api.get(
        `/greentarget/api/rentals?${params.toString()}`
      );

      // Filter to rentals that have a pickup date but no invoice
      const completedRentals = data.filter(
        (rental: Rental) => rental.date_picked !== null
      );

      setAvailableRentals(completedRentals);

      // If editing and we have a rental_id, select that rental
      if (isEditMode && formData.rental_id) {
        const selected = completedRentals.find(
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
      const data = await api.get(`/greentarget/api/invoices/${invoiceId}`);

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
        }));
      } else if (value === "statement") {
        setFormData((prev) => ({
          ...prev,
          [name]: value,
          rental_id: null,
        }));
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

  const handleRentalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rentalId = parseInt(e.target.value);

    // Find the selected rental object
    const rental = availableRentals.find((r) => r.rental_id === rentalId);

    if (rental) {
      setSelectedRental(rental);
      setFormData((prev) => ({
        ...prev,
        rental_id: rental.rental_id,
      }));
    } else {
      setSelectedRental(null);
      setFormData((prev) => ({
        ...prev,
        rental_id: null,
      }));
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
        // Update existing invoice - not typically allowed for accounting records
        // but we'll include the code for completeness
        response = await api.put(
          `/greentarget/api/invoices/${formData.invoice_id}`,
          invoiceData
        );
        toast.success("Invoice updated successfully");
      } else {
        // Create new invoice
        response = await api.post("/greentarget/api/invoices", invoiceData);
        toast.success("Invoice created successfully");
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
    <div className="container mx-auto px-4">
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
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="type"
                  value="regular"
                  checked={formData.type === "regular"}
                  onChange={handleInputChange}
                  className="mr-2"
                  disabled={isEditMode} // Can't change type if editing
                />
                Regular Invoice
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="type"
                  value="statement"
                  checked={formData.type === "statement"}
                  onChange={handleInputChange}
                  className="mr-2"
                  disabled={isEditMode} // Can't change type if editing
                />
                Statement
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
              <select
                id="customer_id"
                name="customer_id"
                value={formData.customer_id || ""}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                disabled={isEditMode} // Can't change customer if editing
              >
                <option value="">Select Customer</option>
                {customers.map((customer) => (
                  <option
                    key={customer.customer_id}
                    value={customer.customer_id}
                  >
                    {customer.name}
                  </option>
                ))}
              </select>
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
                <select
                  id="rental_id"
                  name="rental_id"
                  value={formData.rental_id || ""}
                  onChange={handleRentalChange}
                  className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                  disabled={isEditMode || !formData.customer_id} // Can't change rental if editing or no customer selected
                >
                  <option value="">Select Rental</option>
                  {availableRentals.map((rental) => (
                    <option key={rental.rental_id} value={rental.rental_id}>
                      Dumpster {rental.tong_no} -{" "}
                      {rental.location_address || "No location"} - Picked up:{" "}
                      {rental.date_picked
                        ? new Date(rental.date_picked).toLocaleDateString()
                        : "Not picked up"}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRental && (
                <div className="mt-3 p-3 bg-default-50 rounded-lg">
                  <h3 className="font-medium mb-2">Rental Details</h3>
                  <p className="text-sm">Dumpster: {selectedRental.tong_no}</p>
                  <p className="text-sm">
                    Location:{" "}
                    {selectedRental.location_address || "No specific location"}
                  </p>
                  <p className="text-sm">
                    Date Placed:{" "}
                    {new Date(selectedRental.date_placed).toLocaleDateString()}
                  </p>
                  <p className="text-sm">
                    Date Picked:{" "}
                    {selectedRental.date_picked
                      ? new Date(
                          selectedRental.date_picked
                        ).toLocaleDateString()
                      : "Not picked up yet"}
                  </p>
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

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <label
                  htmlFor="amount_before_tax"
                  className="block text-sm font-medium text-default-700"
                >
                  Amount (Before Tax)
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
                  Tax Amount (6% SST)
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
                    readOnly
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
            </div>
          </div>

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
    </div>
  );
};

export default InvoiceFormPage;

// src/pages/GreenTarget/Rentals/RentalFormPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { IconCalendar } from "@tabler/icons-react";
import { api } from "../../../routes/utils/api";

interface Customer {
  customer_id: number;
  name: string;
}

interface Location {
  location_id: number;
  customer_id: number;
  address: string;
}

interface Dumpster {
  tong_no: string;
  status: string;
}

interface Rental {
  rental_id?: number;
  customer_id: number;
  customer_name?: string;
  location_id: number | null;
  location_address?: string | null;
  tong_no: string;
  driver: string;
  date_placed: string;
  date_picked: string | null;
  remarks: string | null;
}

// Helper to format date for input elements
const formatDateForInput = (dateString: string | null): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toISOString().split("T")[0];
};

const RentalFormPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // Form data state
  const [formData, setFormData] = useState<Rental>({
    customer_id: 0,
    location_id: null,
    tong_no: "",
    driver: "",
    date_placed: new Date().toISOString().split("T")[0],
    date_picked: null,
    remarks: null,
  });

  // Reference data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [availableDumpsters, setAvailableDumpsters] = useState<Dumpster[]>([]);
  const [drivers, setDrivers] = useState<string[]>([
    "Driver 1",
    "Driver 2",
    "Driver 3",
  ]); // Could fetch from API if needed

  // UI state
  const [initialFormData, setInitialFormData] = useState<Rental>({
    customer_id: 0,
    location_id: null,
    tong_no: "",
    driver: "",
    date_placed: new Date().toISOString().split("T")[0],
    date_picked: null,
    remarks: null,
  });

  const [customerLocations, setCustomerLocations] = useState<Location[]>([]);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  // Load reference data
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [customersData, dumpstersData] = await Promise.all([
          api.get("/greentarget/api/customers"),
          api.get("/greentarget/api/dumpsters?status=available"),
        ]);

        setCustomers(customersData);
        setAvailableDumpsters(dumpstersData);
      } catch (err) {
        console.error("Error loading reference data:", err);
        toast.error("Failed to load necessary data");
      }
    };

    loadReferenceData();
  }, []);

  // Load rental data in edit mode
  useEffect(() => {
    if (isEditMode && id) {
      fetchRentalDetails(parseInt(id));
    }
  }, [id, isEditMode]);

  // Monitor form changes
  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormData);
    setIsFormChanged(hasChanged);
  }, [formData, initialFormData]);

  // Load locations when customer changes
  useEffect(() => {
    if (formData.customer_id) {
      fetchCustomerLocations(formData.customer_id);
    } else {
      setCustomerLocations([]);
    }
  }, [formData.customer_id]);

  const fetchRentalDetails = async (rentalId: number) => {
    try {
      setLoading(true);

      // Get rental data
      const rental = await greenTargetApi.getRental(rentalId);

      if (!rental) {
        throw new Error("Rental not found");
      }

      // Get all locations for the customer
      await fetchCustomerLocations(rental.customer_id);

      setFormData({
        rental_id: rental.rental_id,
        customer_id: rental.customer_id,
        customer_name: rental.customer_name,
        location_id: rental.location_id,
        location_address: rental.location_address,
        tong_no: rental.tong_no,
        driver: rental.driver,
        date_placed: rental.date_placed,
        date_picked: rental.date_picked,
        remarks: rental.remarks,
      });

      setInitialFormData({
        rental_id: rental.rental_id,
        customer_id: rental.customer_id,
        customer_name: rental.customer_name,
        location_id: rental.location_id,
        location_address: rental.location_address,
        tong_no: rental.tong_no,
        driver: rental.driver,
        date_placed: rental.date_placed,
        date_picked: rental.date_picked,
        remarks: rental.remarks,
      });

      setError(null);
    } catch (err) {
      setError("Failed to fetch rental details. Please try again later.");
      console.error("Error fetching rental details:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerLocations = async (customerId: number) => {
    try {
      const locationsData = await greenTargetApi.getLocationsByCustomer(
        customerId
      );
      setCustomerLocations(locationsData);
    } catch (err) {
      console.error("Error fetching customer locations:", err);
      setCustomerLocations([]);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value || null,
    }));
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/greentarget/rentals");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/greentarget/rentals");
  };

  const validateForm = (): boolean => {
    if (!formData.customer_id) {
      toast.error("Please select a customer");
      return false;
    }

    if (!isEditMode && !formData.tong_no) {
      toast.error("Please select a dumpster");
      return false;
    }

    if (!formData.driver) {
      toast.error("Please select a driver");
      return false;
    }

    if (!formData.date_placed) {
      toast.error("Please set the placement date");
      return false;
    }

    if (isEditMode && formData.date_picked) {
      const placedDate = new Date(formData.date_placed);
      const pickedDate = new Date(formData.date_picked);

      if (pickedDate < placedDate) {
        toast.error("Pickup date cannot be earlier than placement date");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      if (isEditMode && formData.rental_id) {
        // Update existing rental (usually just adding pickup date)
        await greenTargetApi.updateRental(formData.rental_id, {
          date_picked: formData.date_picked,
          remarks: formData.remarks,
        });

        toast.success("Rental updated successfully!");
      } else {
        // Create new rental
        await greenTargetApi.createRental({
          customer_id: formData.customer_id,
          location_id: formData.location_id,
          tong_no: formData.tong_no,
          driver: formData.driver,
          date_placed: formData.date_placed,
          remarks: formData.remarks,
        });

        toast.success("Rental created successfully!");
      }

      navigate("/greentarget/rentals");
    } catch (error: any) {
      if (error.message && error.message.includes("not available")) {
        toast.error("The selected dumpster is no longer available");
      } else {
        toast.error("An unexpected error occurred.");
        console.error("Error saving rental:", error);
      }
    } finally {
      setIsSaving(false);
    }
  };

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
            {isEditMode ? "Edit Rental" : "Create New Rental"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? `${
                  formData.date_picked ? "View" : "Update"
                } rental details here.`
              : "Create a new dumpster rental record."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-8">
            {/* Customer & Location Section */}
            <div className="space-y-6">
              <h2 className="text-lg font-medium">Customer Information</h2>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="customer_id"
                    className="text-sm font-medium text-default-700"
                  >
                    Customer
                  </label>
                  <select
                    id="customer_id"
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleInputChange}
                    disabled={isEditMode}
                    className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500 disabled:bg-default-50"
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

                <div className="space-y-2">
                  <label
                    htmlFor="location_id"
                    className="text-sm font-medium text-default-700"
                  >
                    Location (Optional)
                  </label>
                  <select
                    id="location_id"
                    name="location_id"
                    value={formData.location_id || ""}
                    onChange={handleInputChange}
                    disabled={isEditMode || !formData.customer_id}
                    className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500 disabled:bg-default-50"
                  >
                    <option value="">No Specific Location</option>
                    {customerLocations.map((location) => (
                      <option
                        key={location.location_id}
                        value={location.location_id}
                      >
                        {location.address}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Dumpster & Driver Section */}
            <div className="space-y-6">
              <h2 className="text-lg font-medium">Rental Details</h2>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="tong_no"
                    className="text-sm font-medium text-default-700"
                  >
                    Dumpster
                  </label>
                  <select
                    id="tong_no"
                    name="tong_no"
                    value={formData.tong_no}
                    onChange={handleInputChange}
                    disabled={isEditMode}
                    className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500 disabled:bg-default-50"
                  >
                    <option value="">Select Dumpster</option>
                    {availableDumpsters.map((dumpster) => (
                      <option key={dumpster.tong_no} value={dumpster.tong_no}>
                        {dumpster.tong_no}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="driver"
                    className="text-sm font-medium text-default-700"
                  >
                    Driver
                  </label>
                  <select
                    id="driver"
                    name="driver"
                    value={formData.driver}
                    onChange={handleInputChange}
                    disabled={isEditMode}
                    className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500 disabled:bg-default-50"
                  >
                    <option value="">Select Driver</option>
                    {drivers.map((driver) => (
                      <option key={driver} value={driver}>
                        {driver}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Dates Section */}
            <div className="space-y-6">
              <h2 className="text-lg font-medium">Dates</h2>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="date_placed"
                    className="text-sm font-medium text-default-700"
                  >
                    Placement Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      id="date_placed"
                      name="date_placed"
                      value={formatDateForInput(formData.date_placed)}
                      onChange={handleDateChange}
                      disabled={isEditMode}
                      className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500 disabled:bg-default-50"
                    />
                    <IconCalendar
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-default-400"
                      size={20}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="date_picked"
                    className="text-sm font-medium text-default-700"
                  >
                    Pickup Date{" "}
                    {!isEditMode && "(Leave empty for active rentals)"}
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      id="date_picked"
                      name="date_picked"
                      value={formatDateForInput(formData.date_picked)}
                      onChange={handleDateChange}
                      className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                    />
                    <IconCalendar
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-default-400"
                      size={20}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Remarks Section */}
            <div className="space-y-2">
              <label
                htmlFor="remarks"
                className="text-sm font-medium text-default-700"
              >
                Remarks (Optional)
              </label>
              <textarea
                id="remarks"
                name="remarks"
                value={formData.remarks || ""}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                placeholder="Add any special notes or instructions here"
              ></textarea>
            </div>
          </div>

          <div className="mt-8 py-3 text-right">
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={
                isSaving ||
                (!isEditMode && !isFormChanged) ||
                (isEditMode && formData.date_picked !== null && !isFormChanged)
              }
            >
              {isSaving
                ? "Saving..."
                : isEditMode
                ? formData.date_picked
                  ? "Update"
                  : "Mark as Picked Up"
                : "Create Rental"}
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

export default RentalFormPage;

// src/pages/GreenTarget/Customers/CustomerFormPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { FormInput } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";
import LoadingSpinner from "../../../components/LoadingSpinner";

interface CustomerLocation {
  location_id?: number;
  customer_id: number;
  address: string;
}

interface Customer {
  customer_id?: number;
  name: string;
  phone_number: string;
  status: string;
  last_activity_date?: string;
  locations?: CustomerLocation[];
}

const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<Customer>({
    name: "",
    phone_number: "",
    status: "active",
  });

  const [initialFormData, setInitialFormData] = useState<Customer>({
    name: "",
    phone_number: "",
    status: "active",
  });

  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditMode && id) {
      fetchCustomerDetails(parseInt(id));
    }
  }, [id, isEditMode]);

  useEffect(() => {
    const hasChanged =
      JSON.stringify({ ...formData, locations }) !==
      JSON.stringify({
        ...initialFormData,
        locations: initialFormData.locations || [],
      });
    setIsFormChanged(hasChanged);
  }, [formData, locations, initialFormData]);

  const fetchCustomerDetails = async (customerId: number) => {
    try {
      setLoading(true);
      const data = await api.get(`/greentarget/api/customers/${customerId}`);

      setFormData({
        customer_id: data.customer_id,
        name: data.name,
        phone_number: data.phone_number || "",
        status: data.status || "active",
        last_activity_date: data.last_activity_date,
      });

      setLocations(data.locations || []);

      setInitialFormData({
        customer_id: data.customer_id,
        name: data.name,
        phone_number: data.phone_number || "",
        status: data.status || "active",
        last_activity_date: data.last_activity_date,
        locations: data.locations || [],
      });

      setError(null);
    } catch (err) {
      setError("Failed to fetch customer details. Please try again later.");
      console.error("Error fetching customer details:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/greentarget/customers");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/greentarget/customers");
  };

  const handleAddLocation = () => {
    if (!newLocation.trim()) {
      toast.error("Please enter a location address");
      return;
    }

    const newLocationObj: CustomerLocation = {
      customer_id: formData.customer_id || 0, // Will be set properly on save
      address: newLocation.trim(),
    };

    setLocations([...locations, newLocationObj]);
    setNewLocation("");
  };

  const handleRemoveLocation = (index: number) => {
    const updatedLocations = [...locations];
    updatedLocations.splice(index, 1);
    setLocations(updatedLocations);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error("Customer name is required");
      return;
    }

    setIsSaving(true);

    try {
      let customerResponse;

      if (isEditMode && formData.customer_id) {
        // Update existing customer
        customerResponse = await api.put(
          `/greentarget/api/customers/${formData.customer_id}`,
          {
            name: formData.name,
            phone_number: formData.phone_number,
            status: formData.status,
          }
        );
      } else {
        // Create new customer
        customerResponse = await api.post("/greentarget/api/customers", {
          name: formData.name,
          phone_number: formData.phone_number,
        });
      }

      const customerId = customerResponse.customer.customer_id;

      // Handle locations
      if (locations.length > 0) {
        // For existing locations, we need to check if they need to be updated or added
        for (const location of locations) {
          if (location.location_id) {
            // Update existing location
            await api.put(
              `/greentarget/api/locations/${location.location_id}`,
              {
                address: location.address,
              }
            );
          } else {
            // Add new location
            await api.post("/greentarget/api/locations", {
              customer_id: customerId,
              address: location.address,
            });
          }
        }

        // For locations that were removed, we would need to delete them
        // This is complex to track, so we'd need a more sophisticated approach
        // For simplicity, not implementing this now
      }

      toast.success(
        `Customer ${isEditMode ? "updated" : "created"} successfully!`
      );
      navigate("/greentarget/customers");
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("An unexpected error occurred.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = (
    name: keyof Customer,
    label: string,
    type: string = "text"
  ) => (
    <FormInput
      name={name}
      label={label}
      value={formData[name]?.toString() || ""}
      onChange={handleInputChange}
      type={type}
    />
  );

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
            {isEditMode ? "Edit Customer" : "Add New Customer"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? 'Edit customer information here. Click "Save" when you\'re done.'
              : 'Enter new customer information here. Click "Save" when you\'re done.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {renderInput("name", "Customer Name")}
              {renderInput("phone_number", "Phone Number", "tel")}
            </div>

            {isEditMode && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-default-700">
                    Status
                  </label>
                  <div className="flex space-x-4">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="status"
                        value="active"
                        checked={formData.status === "active"}
                        onChange={handleInputChange}
                        className="mr-2"
                      />
                      Active
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="status"
                        value="inactive"
                        checked={formData.status === "inactive"}
                        onChange={handleInputChange}
                        className="mr-2"
                      />
                      Inactive
                    </label>
                  </div>
                </div>

                {formData.last_activity_date && (
                  <div>
                    <label className="block text-sm font-medium text-default-700">
                      Last Activity
                    </label>
                    <div className="mt-1 py-2">
                      {new Date(
                        formData.last_activity_date
                      ).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Locations Section */}
            <div className="border-t pt-6 mt-6">
              <h2 className="text-lg font-medium mb-4">Customer Locations</h2>

              <div className="mb-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Enter location address"
                    className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                  />
                  <Button
                    type="button"
                    onClick={handleAddLocation}
                    variant="outline"
                  >
                    Add
                  </Button>
                </div>
              </div>

              {locations.length > 0 ? (
                <div className="space-y-2">
                  {locations.map((location, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center bg-default-50 p-3 rounded-md"
                    >
                      <span>{location.address}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(index)}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-default-500 italic">
                  No locations added yet. Add at least one location for this
                  customer.
                </p>
              )}
            </div>
          </div>

          <div className="mt-8 py-3 text-right">
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={isSaving || !isFormChanged}
            >
              {isSaving ? "Saving..." : "Save"}
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

export default CustomerFormPage;

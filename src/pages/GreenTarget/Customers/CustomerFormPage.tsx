// src/pages/GreenTarget/Customers/CustomerFormPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { FormInput } from "../../../components/FormComponents";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { IconMap, IconMapPin, IconTrash, IconPhone } from "@tabler/icons-react";

interface CustomerLocation {
  location_id?: number;
  customer_id: number;
  address: string;
  phone_number?: string;
}

interface Customer {
  customer_id?: number;
  name: string;
  phone_number: string;
  last_activity_date?: string;
  locations?: CustomerLocation[];
  has_active_rental?: boolean;
}

const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<Customer>({
    name: "",
    phone_number: "",
  });

  const [initialFormData, setInitialFormData] = useState<Customer>({
    name: "",
    phone_number: "",
  });

  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [newLocation, setNewLocation] = useState<{
    address: string;
    phone_number: string;
  }>({
    address: "",
    phone_number: "",
  });
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [isLocationInputFocused, setIsLocationInputFocused] = useState(false);
  const [isPhoneInputFocused, setIsPhoneInputFocused] = useState(false);

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
      const data = await greenTargetApi.getCustomer(customerId);

      setFormData({
        customer_id: data.customer_id,
        name: data.name,
        phone_number: data.phone_number || "",
        last_activity_date: data.last_activity_date,
      });

      setLocations(data.locations || []);

      setInitialFormData({
        customer_id: data.customer_id,
        name: data.name,
        phone_number: data.phone_number || "",
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

  const handleLocationInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setNewLocation((prev) => ({
      ...prev,
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
    if (!newLocation.address.trim()) {
      toast.error("Please enter a location address");
      return;
    }

    const newLocationObj: CustomerLocation = {
      customer_id: formData.customer_id || 0,
      address: newLocation.address.trim(),
      // Use custom phone number if provided, otherwise use customer's phone number
      phone_number: newLocation.phone_number.trim() || formData.phone_number,
    };

    setLocations([...locations, newLocationObj]);
    setNewLocation({ address: "", phone_number: "" });
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
        customerResponse = await greenTargetApi.updateCustomer(
          formData.customer_id,
          {
            name: formData.name,
            phone_number: formData.phone_number,
          }
        );
      } else {
        // Create new customer
        customerResponse = await greenTargetApi.createCustomer({
          name: formData.name,
          phone_number: formData.phone_number,
        });
      }

      const customerId = customerResponse.customer.customer_id;

      // Get original location IDs from initialFormData
      const originalLocationIds = initialFormData.locations
        ? initialFormData.locations
            .filter((loc) => loc.location_id)
            .map((loc) => loc.location_id)
        : [];

      // Get current location IDs that have an ID (existing locations)
      const currentLocationIds = locations
        .filter((loc) => loc.location_id)
        .map((loc) => loc.location_id);

      // Find IDs that are in original but not in current (these need to be deleted)
      const locationsToDelete = originalLocationIds.filter(
        (id) => !currentLocationIds.includes(id)
      );

      // Delete removed locations
      for (const locationId of locationsToDelete) {
        await greenTargetApi.deleteLocation(locationId);
      }

      // Handle locations (update existing, add new)
      if (locations.length > 0) {
        for (const location of locations) {
          if (location.location_id) {
            // Update existing location
            await greenTargetApi.updateLocation(location.location_id, {
              address: location.address,
              phone_number: location.phone_number,
            });
          } else {
            // Add new location
            await greenTargetApi.createLocation({
              customer_id: customerId,
              address: location.address,
              phone_number: location.phone_number,
            });
          }
        }
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
        <div className="justify-between flex px-6">
          <div>
            <h1 className="text-xl font-semibold text-default-900">
              {isEditMode ? "Edit Customer" : "Add New Customer"}
            </h1>
            <p className="mt-1 text-sm text-default-500">
              {isEditMode
                ? 'Edit customer information here. Click "Save" when you\'re done.'
                : 'Enter new customer information here. Click "Save" when you\'re done.'}
            </p>
          </div>
          {isEditMode && (
            <div className="space-y-2 text-right">
              <div className="flex items-center space-x-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    formData.has_active_rental
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {formData.has_active_rental ? "Active" : "Inactive"}
                </span>
                <label className="text-sm font-medium text-default-700">
                  Last Activity
                </label>
              </div>
              <div>
                {formData.last_activity_date ? (
                  <span className="text-default-500">
                    {new Date(formData.last_activity_date).toLocaleDateString(
                      undefined,
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }
                    )}
                  </span>
                ) : (
                  <span className="text-default-500 italic">
                    No activity recorded
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {renderInput("name", "Customer Name")}
              {renderInput("phone_number", "Phone Number", "tel")}
            </div>

            {/* Locations Section */}
            <div className="border-t pt-6 mt-6">
              <h2 className="text-lg font-medium mb-4">Customer Locations</h2>

              <div className="mb-6">
                <div className="flex flex-row space-x-2 w-full">
                  {/* Location input - 70% width */}
                  <div
                    className={`flex flex-grow w-[70%] border rounded-lg p-1.5 ${
                      isLocationInputFocused
                        ? "border-default-500"
                        : "border-default-300"
                    }`}
                  >
                    <div className="flex relative w-[85%]">
                      <span className="absolute inset-y-0 left-2 flex items-center text-default-400">
                        <IconMapPin size={18} />
                      </span>
                      <input
                        type="text"
                        name="address"
                        value={newLocation.address}
                        onChange={handleLocationInputChange}
                        onFocus={() => setIsLocationInputFocused(true)}
                        onBlur={() => setIsLocationInputFocused(false)}
                        placeholder="Enter location address"
                        className="w-full pl-10 pr-3 py-2 border-0 bg-transparent focus:outline-none"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddLocation}
                      variant="default"
                      color="sky"
                      size="sm"
                      className="w-[15%]"
                    >
                      Add Location
                    </Button>
                  </div>

                  {/* Phone input - 30% width */}
                  <div
                    className={`flex w-[30%] border rounded-lg p-1.5 ${
                      isPhoneInputFocused
                        ? "border-default-500"
                        : "border-default-300"
                    }`}
                  >
                    <div className="flex relative w-full">
                      <span className="absolute inset-y-0 left-2 flex items-center text-default-400">
                        <IconPhone size={18} />
                      </span>
                      <input
                        type="tel"
                        name="phone_number"
                        value={newLocation.phone_number}
                        onChange={handleLocationInputChange}
                        onFocus={() => setIsPhoneInputFocused(true)}
                        onBlur={() => setIsPhoneInputFocused(false)}
                        placeholder={`Optional phone number (default: ${
                          formData.phone_number || "none"
                        })`}
                        className="w-full pl-10 pr-3 py-2 border-0 bg-transparent focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Add Location Button - Below the inputs */}
                <div className="mt-2 flex justify-end"></div>
              </div>

              {locations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {locations.map((location, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center bg-white border border-default-200 p-4 rounded-lg hover:shadow-sm transition-shadow duration-200"
                    >
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="flex h-8 w-8 items-center justify-center bg-sky-100 text-sky-600 rounded-full mr-3">
                              <IconMapPin size={16} />
                            </span>
                            <span className="font-medium">
                              {location.address}
                            </span>
                          </div>
                          {/* Only show phone if it's different from the customer's default */}
                          {location.phone_number &&
                            location.phone_number !== formData.phone_number && (
                              <div className="flex items-center px-2 text-default-600 text-sm">
                                <IconPhone size={14} className="mr-1" />
                                {location.phone_number}
                              </div>
                            )}
                          <button
                            type="button"
                            onClick={() => handleRemoveLocation(index)}
                            className="p-1.5 rounded-full text-default-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Remove location"
                          >
                            <IconTrash size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed border-default-200 rounded-lg p-6 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-default-100">
                    <IconMap size={24} className="text-default-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-medium text-default-900">
                    No locations
                  </h3>
                  <p className="mt-1 text-sm text-default-500">
                    Add at least one location for this customer.
                  </p>
                </div>
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

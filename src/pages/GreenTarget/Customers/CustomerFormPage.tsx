// src/pages/GreenTarget/Customers/CustomerFormPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import {
  FormInput,
  FormInputWithStatus,
  FormListbox,
} from "../../../components/FormComponents";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import {
  IconBuilding,
  IconFileInvoice,
  IconInfoCircle,
  IconMap,
  IconMapPin,
  IconPhone,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { validateCustomerIdentity } from "../../../utils/greenTarget/customerValidation";

interface CustomerLocation {
  location_id?: number;
  customer_id: number;
  site?: string;
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
  email?: string;
  tin_number?: string;
  id_type?: string;
  id_number?: string;
  state?: string;
  additional_info?: string;
}

interface SelectOption {
  id: string;
  name: string;
}

const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<Customer>({
    name: "",
    phone_number: "",
    tin_number: "",
    id_type: "Select",
    id_number: "",
    email: "",
    state: "12",
    additional_info: "",
  });

  const [initialFormData, setInitialFormData] = useState<Customer>({
    name: "",
    phone_number: "",
    tin_number: "",
    id_type: "Select",
    id_number: "",
    email: "",
    state: "12",
    additional_info: "",
  });

  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [newLocation, setNewLocation] = useState<{
    site: string;
    address: string;
    phone_number: string;
  }>({
    site: "",
    address: "",
    phone_number: "",
  });
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const idTypeOptions = [
    { id: "Select", name: "Select" },
    { id: "BRN", name: "BRN" },
    { id: "NRIC", name: "NRIC" },
    { id: "PASSPORT", name: "PASSPORT" },
    { id: "ARMY", name: "ARMY" },
  ];

  const stateOptions: SelectOption[] = [
    { id: "01", name: "JOHOR" },
    { id: "02", name: "KEDAH" },
    { id: "03", name: "KELANTAN" },
    { id: "04", name: "MELAKA" },
    { id: "05", name: "NEGERI SEMBILAN" },
    { id: "06", name: "PAHANG" },
    { id: "07", name: "PULAU PINANG" },
    { id: "08", name: "PERAK" },
    { id: "09", name: "PERLIS" },
    { id: "10", name: "SELANGOR" },
    { id: "11", name: "TERENGGANU" },
    { id: "12", name: "SABAH" },
    { id: "13", name: "SARAWAK" },
    { id: "14", name: "WILAYAH PERSEKUTUAN KUALA LUMPUR" },
    { id: "15", name: "WILAYAH PERSEKUTUAN LABUAN" },
    { id: "16", name: "WILAYAH PERSEKUTUAN PUTRAJAYA" },
    { id: "17", name: "NOT APPLICABLE" },
  ];

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

  const fetchCustomerDetails = async (customerId: number): Promise<void> => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getCustomer(customerId);

      const fetchedLocations: CustomerLocation[] = (data.locations || []).map(
        (location: CustomerLocation) => ({
          ...location,
          site: location.site || "",
          phone_number: location.phone_number || "",
        })
      );

      const formattedData: Customer = {
        customer_id: data.customer_id,
        name: data.name,
        phone_number: data.phone_number || "",
        last_activity_date: data.last_activity_date,
        has_active_rental: data.has_active_rental,
        email: data.email || "",
        tin_number: data.tin_number || "",
        id_type: data.id_type || "Select",
        id_number: data.id_number || "",
        state: data.state || "12",
        additional_info: data.additional_info || "",
        locations: fetchedLocations,
      };

      setFormData(formattedData);
      setInitialFormData(formattedData);

      setLocations(fetchedLocations);
      setError(null);
    } catch (err) {
      setError("Failed to fetch customer details. Please try again later.");
      console.error("Error fetching customer details:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleListboxChange = (name: keyof Customer, value: string): void => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleLocationInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    const { name, value } = e.target;
    setNewLocation((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleBackClick = (): void => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/greentarget/customers");
    }
  };

  const handleConfirmBack = (): void => {
    setShowBackConfirmation(false);
    navigate("/greentarget/customers");
  };

  const handleAddLocation = (): void => {
    if (!newLocation.site.trim()) {
      toast.error("Please enter a site name");
      return;
    }
    if (!newLocation.address.trim()) {
      toast.error("Please enter a location address");
      return;
    }

    const newLocationObj: CustomerLocation = {
      customer_id: formData.customer_id || 0,
      site: newLocation.site.trim(),
      address: newLocation.address.trim(),
      // Use custom phone number if provided, otherwise use customer's phone number
      phone_number: newLocation.phone_number.trim() || formData.phone_number,
    };

    setLocations([...locations, newLocationObj]);
    setNewLocation({ site: "", address: "", phone_number: "" });
  };

  const handleLocationChange = (
    index: number,
    field: "site" | "address" | "phone_number",
    value: string
  ): void => {
    setLocations((currentLocations: CustomerLocation[]) =>
      currentLocations.map((location: CustomerLocation, locationIndex: number) =>
        locationIndex === index ? { ...location, [field]: value } : location
      )
    );
  };

  const handleRemoveLocation = (index: number): void => {
    const updatedLocations = [...locations];
    updatedLocations.splice(index, 1);
    setLocations(updatedLocations);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!formData.name) {
      toast.error("Customer name is required");
      return;
    }
    if (locations.some((location: CustomerLocation) => !location.address.trim())) {
      toast.error("Every location must have an address");
      return;
    }
    if (
      locations.some(
        (location: CustomerLocation) =>
          !location.location_id && !location.site?.trim()
      )
    ) {
      toast.error("Every new location must have a site name");
      return;
    }

    setIsSaving(true);

    try {
      // ID number is a core customer field. Only ID Type or TIN opts the
      // customer into e-Invoice identity validation.
      const hasIdType = formData.id_type && formData.id_type !== "Select";
      const hasIdNumber = Boolean(formData.id_number);
      const hasTinNumber = Boolean(formData.tin_number);

      if (hasIdType || hasTinNumber) {
        if (!hasIdType) {
          toast.error(
            "ID Type is required when entering e-Invoice information"
          );
          setIsSaving(false);
          return;
        }
        if (!hasIdNumber) {
          toast.error(
            "ID Number is required when entering e-Invoice information"
          );
          setIsSaving(false);
          return;
        }
        if (!hasTinNumber) {
          toast.error(
            "TIN Number is required when entering e-Invoice information"
          );
          setIsSaving(false);
          return;
        }

        // Check if data is already verified (exists and unchanged)
        const isDataVerified =
          isEditMode && isValidationDataUnchanged(formData, initialFormData);

        // Only validate if data has changed or is new
        if (!isDataVerified) {
          const validationResult = await validateCustomerIdentity(formData);
          if (!validationResult.isValid) {
            setIsSaving(false);
            return;
          }
        }
      }

      let customerResponse;

      if (isEditMode && formData.customer_id) {
        // Update existing customer
        customerResponse = await greenTargetApi.updateCustomer(
          formData.customer_id,
          {
            name: formData.name,
            phone_number: formData.phone_number || null,
            tin_number: formData.tin_number,
            id_type:
              formData.id_type && formData.id_type !== "Select"
                ? formData.id_type
                : null,
            id_number: formData.id_number,
            email: formData.email,
            state: formData.state,
            additional_info: formData.additional_info,
          }
        );
      } else {
        // Create new customer
        customerResponse = await greenTargetApi.createCustomer({
          name: formData.name,
          phone_number: formData.phone_number || null,
          tin_number: formData.tin_number,
            id_type:
              formData.id_type && formData.id_type !== "Select"
                ? formData.id_type
                : null,
          id_number: formData.id_number,
            email: formData.email,
            state: formData.state,
            additional_info: formData.additional_info,
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
              site: location.site?.trim() || null,
              address: location.address.trim(),
              phone_number: location.phone_number?.trim() || null,
            });
          } else {
            // Add new location
            await greenTargetApi.createLocation({
              customer_id: customerId,
              site: location.site?.trim() || null,
              address: location.address.trim(),
              phone_number: location.phone_number?.trim() || null,
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

  const handleDeleteCustomer = async (): Promise<void> => {
    try {
      setIsSaving(true);

      if (!formData.customer_id) {
        toast.error("Cannot delete: customer ID is missing");
        return;
      }

      const response = await greenTargetApi.deleteCustomer(
        formData.customer_id
      );

      // Check if the response contains an error message
      if (
        response.error ||
        (response.message && response.message.includes("Cannot delete"))
      ) {
        // Show error toast with the server's message
        toast.error(
          response.message || "Cannot delete customer: unknown error occurred"
        );
      } else {
        // Show success message and navigate back to customer list
        toast.success("Customer deleted successfully");
        navigate("/greentarget/customers");
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to delete customer");
      }
    } finally {
      setIsDeleteDialogOpen(false);
      setIsSaving(false);
    }
  };

  const isValidationDataUnchanged = (
    currentData: Customer,
    initialData: Customer
  ): boolean => {
    return (
      currentData.id_type === initialData.id_type &&
      currentData.id_number === initialData.id_number &&
      currentData.tin_number === initialData.tin_number &&
      // Make sure all values exist
      Boolean(currentData.id_type) &&
      currentData.id_type !== "Select" &&
      Boolean(currentData.id_number) &&
      Boolean(currentData.tin_number)
    );
  };

  const renderInput = (
    name: keyof Customer,
    label: string,
    type: string = "text",
    placeholder: string = ""
  ): JSX.Element => {
    const value = formData[name]?.toString() || "";

    // Determine if this field should have verification capability
    const showStatus = name === "id_number" || name === "tin_number";
    const isVerified =
      isEditMode && isValidationDataUnchanged(formData, initialFormData);

    return showStatus ? (
      <FormInputWithStatus
        name={name}
        label={label}
        value={value}
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
        showStatus={true}
        isVerified={isVerified}
      />
    ) : (
      <FormInput
        name={name}
        label={label}
        value={value}
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
      />
    );
  };

  const renderListbox = (
    name: keyof Customer,
    label: string,
    options: SelectOption[]
  ): JSX.Element => {
    const value = formData[name]?.toString() || "";

    return (
      <FormListbox
        name={name}
        label={label}
        value={value}
        onChange={(value) => handleListboxChange(name, value)}
        options={options}
      />
    );
  };

  const renderTextArea = (
    name: keyof Customer,
    label: string,
    placeholder: string = ""
  ): JSX.Element => {
    const value = formData[name]?.toString() || "";

    return (
      <div className="space-y-2">
        <label
          htmlFor={name}
          className="block text-sm font-medium text-default-700 dark:text-gray-200"
        >
          {label}
        </label>
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          rows={3}
          className="block w-full px-3 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded-lg shadow-sm
                     focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 dark:focus:border-sky-500 sm:text-sm"
        />
      </div>
    );
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
    <div className="space-y-4 pb-6">
      <div className="rounded-xl border border-default-200 bg-white px-4 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="hidden h-8 w-px bg-default-200 dark:bg-gray-700 sm:block" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-default-900 dark:text-gray-100">
                {isEditMode ? formData.name || "Edit Customer" : "Add Customer"}
              </h1>
              <p className="mt-0.5 text-sm text-default-500 dark:text-gray-400">
                {isEditMode
                  ? `Customer #${formData.customer_id}`
                  : "Create a Green Target customer and their service locations."}
              </p>
            </div>
          </div>
          {isEditMode && (
            <div className="flex items-center gap-3 sm:justify-end">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  formData.has_active_rental
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {formData.has_active_rental ? "Active rental" : "No active rental"}
              </span>
              <div className="text-right text-xs text-default-500 dark:text-gray-400">
                <div className="font-medium text-default-700 dark:text-gray-200">
                  Last activity
                </div>
                {formData.last_activity_date
                  ? new Date(formData.last_activity_date).toLocaleDateString(
                      "en-GB",
                      { year: "numeric", month: "short", day: "numeric" }
                    )
                  : "Not recorded"}
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="rounded-xl border border-default-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              <IconBuilding size={21} />
            </span>
            <div>
              <h2 className="font-semibold text-default-900 dark:text-gray-100">
                Customer information
              </h2>
              <p className="text-sm text-default-500 dark:text-gray-400">
                Main contact details used across rentals, invoices and statements.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {renderInput("name", "Customer Name")}
            {renderInput("phone_number", "Phone Number", "tel")}
          </div>
          <div className="mt-5">
            {renderTextArea(
              "additional_info",
              "Additional Notes (optional)",
              "Notes shown in the customer statement header."
            )}
          </div>
        </section>

        <section className="rounded-xl border border-default-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <IconMapPin size={21} />
              </span>
              <div>
                <h2 className="font-semibold text-default-900 dark:text-gray-100">
                  Service locations
                </h2>
                <p className="text-sm text-default-500 dark:text-gray-400">
                  Site is appended after the address on individual e-Invoices.
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-default-100 px-2.5 py-1 text-xs font-semibold text-default-600 dark:bg-gray-700 dark:text-gray-300">
              {locations.length} {locations.length === 1 ? "location" : "locations"}
            </span>
          </div>

          <div className="rounded-xl border border-dashed border-default-300 bg-default-50 p-3 dark:border-gray-600 dark:bg-gray-900/30">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(260px,1fr)_240px_auto] lg:items-end">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                  Site
                </label>
                <input
                  type="text"
                  name="site"
                  value={newLocation.site}
                  onChange={handleLocationInputChange}
                  placeholder="e.g. Kolombong"
                  maxLength={100}
                  className="h-10 w-full rounded-lg border border-default-300 bg-white px-3 text-sm text-default-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={newLocation.address}
                  onChange={handleLocationInputChange}
                  placeholder="Full service address"
                  maxLength={255}
                  className="h-10 w-full rounded-lg border border-default-300 bg-white px-3 text-sm text-default-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                  Location phone (optional)
                </label>
                <input
                  type="tel"
                  name="phone_number"
                  value={newLocation.phone_number}
                  onChange={handleLocationInputChange}
                  placeholder={formData.phone_number || "Customer phone"}
                  maxLength={20}
                  className="h-10 w-full rounded-lg border border-default-300 bg-white px-3 text-sm text-default-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <Button
                type="button"
                onClick={handleAddLocation}
                variant="outline"
                color="sky"
                icon={IconPlus}
                className="h-10 justify-center"
              >
                Add
              </Button>
            </div>
          </div>

          {locations.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {locations.map((location: CustomerLocation, index: number) => (
                <div
                  key={location.location_id || `new-${index}`}
                  className="rounded-xl border border-default-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <IconMapPin size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-default-900 dark:text-gray-100">
                          {location.site || "Site not set"}
                        </p>
                        {location.location_id && (
                          <p className="text-xs text-default-400">
                            Location #{location.location_id}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(): void => handleRemoveLocation(index)}
                      className="rounded-lg p-2 text-default-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-300"
                      title="Remove location"
                      aria-label={`Remove location ${index + 1}`}
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-default-500 dark:text-gray-400">
                        Site
                      </label>
                      <input
                        type="text"
                        value={location.site || ""}
                        onChange={(event): void =>
                          handleLocationChange(index, "site", event.target.value)
                        }
                        maxLength={100}
                        placeholder="Site name"
                        className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 outline-none focus:border-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-default-500 dark:text-gray-400">
                        Address
                      </label>
                      <input
                        type="text"
                        value={location.address}
                        onChange={(event): void =>
                          handleLocationChange(index, "address", event.target.value)
                        }
                        maxLength={255}
                        className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 outline-none focus:border-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-default-500 dark:text-gray-400">
                      <IconPhone size={13} /> Location phone (optional)
                    </label>
                    <input
                      type="tel"
                      value={location.phone_number || ""}
                      onChange={(event): void =>
                        handleLocationChange(index, "phone_number", event.target.value)
                      }
                      maxLength={20}
                      placeholder={`Uses ${formData.phone_number || "customer phone"} when blank`}
                      className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 outline-none focus:border-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border-2 border-dashed border-default-200 p-8 text-center dark:border-gray-700">
              <IconMap size={28} className="mx-auto text-default-400" />
              <p className="mt-2 text-sm font-medium text-default-700 dark:text-gray-200">
                No service locations yet
              </p>
              <p className="text-xs text-default-500 dark:text-gray-400">
                Add a site and address above.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-default-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              <IconFileInvoice size={21} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-default-900 dark:text-gray-100">
                  e-Invoice information
                </h2>
                <span className="rounded-full bg-default-100 px-2 py-0.5 text-xs font-medium text-default-500 dark:bg-gray-700 dark:text-gray-300">
                  Optional
                </span>
              </div>
              <p className="text-sm text-default-500 dark:text-gray-400">
                If any identity field is entered, ID Type, ID Number and TIN are validated together.
              </p>
            </div>
          </div>
          <div className="mb-5 flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
            <IconInfoCircle size={18} className="mt-0.5 shrink-0" />
            Existing verified identity details are not revalidated unless they change.
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {renderListbox("id_type", "ID Type", idTypeOptions)}
            {renderInput("id_number", "ID Number", "text")}
            {renderInput("tin_number", "TIN Number", "text", "C21636482050")}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {renderInput("email", "Email", "email")}
            {renderListbox("state", "State", stateOptions)}
          </div>
        </section>

        <div className="sticky bottom-0 z-[5] flex flex-col-reverse gap-3 rounded-xl border border-default-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {isEditMode && (
              <Button
                type="button"
                color="rose"
                variant="outline"
                onClick={(): void => setIsDeleteDialogOpen(true)}
              >
                Delete Customer
              </Button>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleBackClick}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={isSaving || !isFormChanged}
            >
              {isSaving ? "Saving..." : "Save Customer"}
            </Button>
          </div>
        </div>
      </form>
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to go back? All unsaved changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteCustomer}
        title="Delete Customer"
        message={`Are you sure you want to delete ${formData.name}? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default CustomerFormPage;

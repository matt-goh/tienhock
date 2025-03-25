// src/pages/GreenTarget/Rentals/RentalFormPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import {
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconChevronDown,
  IconCheck,
  IconPlus,
  IconPhone,
  IconTrash,
} from "@tabler/icons-react";
import { api } from "../../../routes/utils/api";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import LocationFormModal from "../../../components/GreenTarget/LocationFormModal";

interface Customer {
  customer_id: number;
  name: string;
  phone_number?: string;
}

interface Location {
  location_id: number;
  customer_id: number;
  address: string;
  phone_number?: string;
}

interface Dumpster {
  tong_no: string;
  status: string;
  available_until?: string;
  available_after?: string;
  reason?: string;
  customer?: string;
  rental_id?: number;
  is_transition_day?: boolean;
  transition_from?: any;
  has_future_rental?: boolean;
  next_rental?: {
    date: string;
    customer: string;
    rental_id: number;
  };
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
  return date.toISOString().split("T")[0]; // Keep YYYY-MM-DD for input fields
};

const RentalFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // Form data state
  const [formData, setFormData] = useState<Rental>({
    customer_id: 0,
    location_id: 0,
    tong_no: "",
    driver: "",
    date_placed: new Date().toISOString().split("T")[0],
    date_picked: null,
    remarks: null,
  });

  // Reference data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isNewLocationModalOpen, setIsNewLocationModalOpen] = useState(false);
  const [isValidSelection, setIsValidSelection] = useState(false);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);

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
  const [isPlacementDateFocused, setIsPlacementDateFocused] = useState(false);
  const [isPickupDateFocused, setIsPickupDateFocused] = useState(false);
  const [dumpsterAvailability, setDumpsterAvailability] = useState<{
    date: string;
    available: Dumpster[];
    upcoming: Dumpster[];
    unavailable: Dumpster[];
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load reference data
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [customersData, driversData] = await Promise.all([
          api.get("/greentarget/api/customers"),
          api.get("/api/staffs/get-drivers"),
        ]);

        setCustomers(customersData);
        setDrivers(driversData);

        // Auto-select the first driver if available and we're not in edit mode
        if (!isEditMode && driversData && driversData.length > 0) {
          setFormData((prev) => ({
            ...prev,
            driver: driversData[0].name,
          }));
        }
      } catch (err) {
        console.error("Error loading reference data:", err);
        toast.error("Failed to load necessary data");
      }
    };

    loadReferenceData();
  }, [isEditMode]);

  useEffect(() => {
    const fetchDumpsterAvailability = async () => {
      if (!formData.date_placed) return;

      try {
        const data = await api.get(
          `/greentarget/api/dumpsters/availability?date=${formData.date_placed}`
        );
        setDumpsterAvailability(data);

        // If we're creating a new rental and there are available dumpsters,
        // auto-select the first available one
        if (!isEditMode && !formData.tong_no && data.available.length > 0) {
          setFormData((prev) => ({
            ...prev,
            tong_no: data.available[0].tong_no,
          }));
        }
      } catch (err) {
        console.error("Error fetching dumpster availability:", err);
        toast.error("Failed to load dumpster availability");
      }
    };

    fetchDumpsterAvailability();
  }, [formData.date_placed, isEditMode]);

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
    if (formData.customer_id && !isEditMode) {
      fetchCustomerLocations(formData.customer_id);
    } else {
      setCustomerLocations([]);
      // Reset location_id when customer changes
      setFormData((prev) => ({ ...prev, location_id: null }));
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

  // Calculate days between two dates (correctly)
  const calculateDaysBetween = (
    startDateStr: string,
    endDateStr: string
  ): number => {
    // Create date objects and ensure they're set to midnight (start of day)
    const startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(endDateStr);
    endDate.setHours(0, 0, 0, 0);

    // Calculate the difference in milliseconds and convert to days
    const differenceMs = endDate.getTime() - startDate.getTime();
    const days = Math.round(differenceMs / (1000 * 60 * 60 * 24));

    return days;
  };

  const handleDelete = async () => {
    if (!formData.rental_id) return;

    setIsDeleting(true);
    try {
      await greenTargetApi.deleteRental(formData.rental_id);
      toast.success("Rental deleted successfully");
      navigate("/greentarget/rentals");
    } catch (error: any) {
      if (error.message && error.message.includes("associated invoices")) {
        toast.error("Cannot delete rental: it has associated invoices");
      } else {
        toast.error("Failed to delete rental");
        console.error("Error deleting rental:", error);
      }
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const fetchCustomerLocations = async (customerId: number) => {
    try {
      // Using the correct API endpoint with query parameter
      const locationsData = await api.get(
        `/greentarget/api/locations?customer_id=${customerId}`
      );

      // Ensure we always have an array
      const locationsArray = Array.isArray(locationsData) ? locationsData : [];
      setCustomerLocations(locationsArray);

      // Auto-select the first location if available, otherwise set to null
      if (locationsArray.length > 0) {
        setFormData((prev) => ({
          ...prev,
          location_id: locationsArray[0].location_id,
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          location_id: null,
        }));
      }
    } catch (err) {
      console.error("Error fetching customer locations:", err);
      setCustomerLocations([]);
      // Set to null on error
      setFormData((prev) => ({
        ...prev,
        location_id: null,
      }));
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

    // For pickup date, validate it's not before placement date
    if (name === "date_picked" && value) {
      const placedDate = new Date(formData.date_placed);
      const pickedDate = new Date(value);

      if (pickedDate < placedDate) {
        toast.error("Pickup date cannot be earlier than placement date");
        return; // Don't update state with invalid date
      }
    }

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

  const formatDumpsterDate = (dateString: string | undefined): string => {
    if (!dateString) return "unknown";
    const date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, "0")}/${(
      date.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${date.getFullYear()}`;
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/greentarget/rentals");
  };

  const checkDumpsterAvailability = useCallback(() => {
    if (!formData.date_placed || !formData.tong_no || !dumpsterAvailability) {
      setIsValidSelection(false);
      return;
    }

    // If we're in edit mode with the original dumpster and dates, it's valid
    if (
      isEditMode &&
      formData.tong_no === initialFormData.tong_no &&
      formData.date_placed === initialFormData.date_placed &&
      formData.date_picked === initialFormData.date_picked
    ) {
      setIsValidSelection(true);
      return;
    }

    // Check if it's directly available
    const availableDumpster = dumpsterAvailability.available.find(
      (d) => d.tong_no === formData.tong_no
    );

    // Check if it's a transition day
    const isTransitionDay = dumpsterAvailability.available.some(
      (d) => d.tong_no === formData.tong_no && d.is_transition_day === true
    );

    // Check for future conflicts if this is an ongoing rental
    if (
      !formData.date_picked &&
      availableDumpster &&
      availableDumpster.next_rental
    ) {
      // There's a future booking, so we can't create an indefinite rental
      setIsValidSelection(false);
      return;
    }

    // If we have a pickup date, check if the full rental period is available
    if (formData.date_picked && availableDumpster) {
      // Check if there's any upcoming rental during our period
      const pickupDate = new Date(formData.date_picked);
      const hasConflict = dumpsterAvailability.upcoming.some(
        (available_after) => {
          if (!availableDumpster.next_rental) return false;

          const nextRentalDate = new Date(availableDumpster.next_rental.date);
          return nextRentalDate <= pickupDate;
        }
      );

      if (hasConflict) {
        setIsValidSelection(false);
        return;
      }
    }

    if (availableDumpster || isTransitionDay) {
      setIsValidSelection(true);
    } else {
      setIsValidSelection(false);
    }
  }, [
    formData.date_placed,
    formData.date_picked,
    formData.tong_no,
    dumpsterAvailability,
    isEditMode,
    initialFormData,
  ]);

  useEffect(() => {
    checkDumpsterAvailability();
  }, [
    formData.date_placed,
    formData.tong_no,
    dumpsterAvailability,
    checkDumpsterAvailability,
  ]);

  const validateForm = (): boolean => {
    if (!formData.date_placed) {
      toast.error("Please select a placement date");
      return false;
    }

    if (!formData.customer_id) {
      toast.error("Please select a customer");
      return false;
    }

    if (!formData.tong_no) {
      toast.error("Please select a dumpster");
      return false;
    }

    if (!formData.driver) {
      toast.error("Please select a driver");
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

    // Add a check for dumpster availability
    if (!isValidSelection && !isEditMode) {
      toast.error("The selected dumpster is not available for the chosen date");
      return false;
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
          location_id: formData.location_id,
          tong_no: formData.tong_no,
          driver: formData.driver,
          date_placed: formData.date_placed,
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
        toast.error(
          "The selected dumpster is not available for the chosen period"
        );
      } else if (error.message && error.message.includes("overlaps")) {
        toast.error("The rental period overlaps with an existing rental");
      } else if (error.message && error.message.includes("after pickup date")) {
        toast.error("Placement date cannot be after pickup date");
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
    <div className="container mx-auto px-4 -mt-6">
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode ? "Edit Rental" : "Create New Rental"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? `Update rental details here.`
              : "Create a new dumpster rental record."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 pb-0">
          <div className="space-y-6">
            {/* Customer & Location Section */}
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Customer Information</h2>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="customer_id"
                    className="text-sm font-medium text-default-700"
                  >
                    Customer
                  </label>
                  <Listbox
                    value={formData.customer_id}
                    onChange={(value) => {
                      setFormData((prev) => ({
                        ...prev,
                        customer_id: value,
                      }));
                    }}
                    disabled={isEditMode}
                  >
                    <div className="relative">
                      <ListboxButton className="w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500 disabled:bg-default-50">
                        {formData.customer_id ? (
                          // Selected customer with potential phone number
                          (() => {
                            const selectedCustomer = customers.find(
                              (c) => c.customer_id === formData.customer_id
                            );
                            return (
                              <div className="flex flex-col">
                                <span className="block truncate font-medium">
                                  {selectedCustomer?.name || "Select Customer"}
                                </span>
                              </div>
                            );
                          })()
                        ) : (
                          // No customer selected - no extra spacing
                          <span className="block truncate">
                            Select Customer
                          </span>
                        )}
                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                          <IconChevronDown
                            className="h-5 w-5 text-default-400"
                            aria-hidden="true"
                          />
                        </span>
                      </ListboxButton>
                      <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        {customers.map((customer) => (
                          <ListboxOption
                            key={customer.customer_id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                                active
                                  ? "bg-default-100 text-default-900"
                                  : "text-default-900"
                              }`
                            }
                            value={customer.customer_id}
                          >
                            {({ selected }) => (
                              <>
                                <div className="flex flex-col">
                                  <span
                                    className={`block truncate ${
                                      selected ? "font-medium" : "font-normal"
                                    }`}
                                  >
                                    {customer.name}
                                  </span>
                                  {customer.phone_number && (
                                    <span className="text-xs text-default-500 mt-0.5 flex items-center">
                                      <IconPhone size={12} className="mr-1" />
                                      {customer.phone_number}
                                    </span>
                                  )}
                                </div>
                                {selected && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck
                                      className="h-5 w-5"
                                      aria-hidden="true"
                                    />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                        ))}
                        {/* Add new customer option */}
                        <ListboxOption
                          className={({ active }) =>
                            `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 mt-1 pt-2 border-t ${
                              active
                                ? "bg-default-100 text-sky-600"
                                : "text-sky-600"
                            }`
                          }
                          value="add_new"
                          onClick={() => setIsNewCustomerModalOpen(true)}
                        >
                          {({ selected }) => (
                            <span className="flex items-center font-medium">
                              <IconPlus size={16} className="mr-1" />
                              Add new customer
                            </span>
                          )}
                        </ListboxOption>
                      </ListboxOptions>
                    </div>
                  </Listbox>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="location_id"
                    className="text-sm font-medium text-default-700"
                  >
                    Location (Optional)
                  </label>
                  <Listbox
                    value={formData.location_id || ""}
                    onChange={(value) => {
                      if (value === "add_new") {
                        // This will be functionless for now as requested
                        console.log("Add new location requested");
                        return;
                      }

                      setFormData((prev) => ({
                        ...prev,
                        location_id: value === "" ? null : Number(value),
                      }));
                    }}
                    disabled={!formData.customer_id}
                  >
                    <div className="relative">
                      <ListboxButton className="w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500 disabled:bg-default-50">
                        {formData.location_id ? (
                          // Selected location with potential phone number
                          (() => {
                            const selectedLocation = customerLocations.find(
                              (l) => l.location_id === formData.location_id
                            );
                            return (
                              <div className="flex flex-col">
                                <span className="block truncate font-medium">
                                  {selectedLocation?.address ||
                                    "No Specific Location"}
                                </span>
                                {selectedLocation?.phone_number && (
                                  <span className="text-xs text-default-500 flex items-center mt-0.5">
                                    <IconPhone size={12} className="mr-1" />
                                    {selectedLocation.phone_number}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          // No location selected
                          <span className="block truncate">
                            No Specific Location
                          </span>
                        )}
                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                          <IconChevronDown
                            className="h-5 w-5 text-default-400"
                            aria-hidden="true"
                          />
                        </span>
                      </ListboxButton>
                      <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        <ListboxOption
                          className={({ active }) =>
                            `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                              active
                                ? "bg-default-100 text-default-900"
                                : "text-default-900"
                            }`
                          }
                          value=""
                        >
                          {({ selected }) => (
                            <>
                              <span
                                className={`block truncate ${
                                  selected ? "font-medium" : "font-normal"
                                }`}
                              >
                                No Specific Location
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                  <IconCheck
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                        {customerLocations.map((location) => (
                          <ListboxOption
                            key={location.location_id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                                active
                                  ? "bg-default-100 text-default-900"
                                  : "text-default-900"
                              }`
                            }
                            value={location.location_id}
                          >
                            {({ selected }) => (
                              <>
                                <div className="flex flex-col">
                                  <span
                                    className={`block truncate ${
                                      selected ? "font-medium" : "font-normal"
                                    }`}
                                  >
                                    {location.address}
                                  </span>
                                  {location.phone_number && (
                                    <div className="flex text-xs text-default-500 mt-0.5">
                                      <IconPhone size={16} className="mr-1.5" />
                                      {location.phone_number}
                                    </div>
                                  )}
                                </div>
                                {selected && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck
                                      className="h-5 w-5"
                                      aria-hidden="true"
                                    />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                        ))}

                        {/* Add new location option */}
                        {formData.customer_id && (
                          <ListboxOption
                            className={({ active }) =>
                              `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 mt-1 pt-2 border-t ${
                                active
                                  ? "bg-default-100 text-sky-600"
                                  : "text-sky-600"
                              }`
                            }
                            value="add_new"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsNewLocationModalOpen(true);
                            }}
                          >
                            {({ selected }) => (
                              <span className="flex items-center font-medium">
                                <IconPlus size={16} className="mr-1" />
                                Add new location for selected customer
                              </span>
                            )}
                          </ListboxOption>
                        )}
                      </ListboxOptions>
                    </div>
                  </Listbox>
                </div>
              </div>
            </div>

            {/* Dates Section */}
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Rental Dates</h2>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="date_placed"
                    className="text-sm font-medium text-default-700"
                  >
                    Placement Date <span className="text-rose-500">*</span>
                  </label>
                  <div
                    className={`flex relative w-full border rounded-lg ${
                      isPlacementDateFocused
                        ? "border-default-500"
                        : "border-default-300"
                    }`}
                  >
                    <input
                      type="date"
                      id="date_placed"
                      name="date_placed"
                      value={formatDateForInput(formData.date_placed)}
                      onChange={handleDateChange}
                      onFocus={() => setIsPlacementDateFocused(true)}
                      onBlur={() => setIsPlacementDateFocused(false)}
                      className="w-full px-3 py-2 border-0 bg-transparent focus:outline-none disabled:bg-default-50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="date_picked"
                    className="text-sm font-medium text-default-700"
                  >
                    Pickup Date{" "}
                    {!isEditMode && "(Leave empty for ongoing rentals)"}
                  </label>
                  <div
                    className={`flex relative w-full border rounded-lg ${
                      isPickupDateFocused
                        ? "border-default-500"
                        : "border-default-300"
                    }`}
                  >
                    <input
                      type="date"
                      id="date_picked"
                      name="date_picked"
                      value={formatDateForInput(formData.date_picked)}
                      onChange={handleDateChange}
                      onFocus={() => setIsPickupDateFocused(true)}
                      onBlur={() => setIsPickupDateFocused(false)}
                      className="w-full px-3 py-2 border-0 bg-transparent focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Dumpster & Driver Section */}
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Rental Details</h2>

              {/* Availability summary */}
              {dumpsterAvailability && (
                <div className="text-sm mb-2">
                  <span className="font-medium">
                    {dumpsterAvailability.available.length} dumpsters available
                  </span>
                  {dumpsterAvailability.upcoming.length > 0 && (
                    <span className="ml-2 text-default-500">
                      • {dumpsterAvailability.upcoming.length} upcoming
                    </span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="tong_no"
                    className="text-sm font-medium text-default-700"
                  >
                    Dumpster <span className="text-rose-500">*</span>
                  </label>

                  <Listbox
                    value={formData.tong_no}
                    onChange={(value) => {
                      setFormData((prev) => ({
                        ...prev,
                        tong_no: value,
                      }));
                    }}
                    disabled={!formData.date_placed}
                  >
                    <div className="relative">
                      <ListboxButton className="w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500 disabled:bg-default-50">
                        <span className="block truncate">
                          {formData.tong_no
                            ? formData.tong_no
                            : "Select Dumpster"}
                        </span>
                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                          <IconChevronDown
                            className="h-5 w-5 text-default-400"
                            aria-hidden="true"
                          />
                        </span>
                      </ListboxButton>
                      <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        {!dumpsterAvailability ? (
                          <div className="px-3 py-2 text-default-500">
                            Please select a placement date first
                          </div>
                        ) : dumpsterAvailability.available.length === 0 &&
                          dumpsterAvailability.upcoming.length === 0 &&
                          dumpsterAvailability.unavailable.length === 0 ? (
                          <div className="px-3 py-2 text-default-500">
                            No dumpsters found
                          </div>
                        ) : (
                          <>
                            {/* Available dumpsters */}
                            {dumpsterAvailability.available.length > 0 && (
                              <>
                                <div className="px-3 py-1.5 text-xs font-semibold text-default-500 bg-default-50">
                                  Available Dumpsters
                                </div>
                                {dumpsterAvailability.available.map(
                                  (dumpster) => (
                                    <ListboxOption
                                      key={dumpster.tong_no}
                                      className={({ active }) =>
                                        `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                                          active
                                            ? "bg-default-100 text-default-900"
                                            : "text-default-900"
                                        }`
                                      }
                                      value={dumpster.tong_no}
                                    >
                                      {({ selected }) => (
                                        <>
                                          <div className="flex flex-col">
                                            <div className="flex items-center">
                                              <IconCircleCheck
                                                size={16}
                                                className="mr-2 text-green-500"
                                              />
                                              <span
                                                className={`block truncate ${
                                                  selected
                                                    ? "font-medium"
                                                    : "font-normal"
                                                }`}
                                              >
                                                {dumpster.tong_no}
                                                {dumpster.is_transition_day && (
                                                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                                    Transition Day
                                                  </span>
                                                )}
                                              </span>
                                            </div>

                                            {dumpster.is_transition_day && (
                                              <span className="text-xs text-blue-600 ml-6">
                                                Available today (pickup day from{" "}
                                                {
                                                  dumpster.transition_from
                                                    ?.customer_name
                                                }
                                                )
                                              </span>
                                            )}

                                            {dumpster.available_until && (
                                              <span className="text-xs text-amber-600 ml-6">
                                                {(() => {
                                                  const today =
                                                    formData.date_placed; // Use the selected date, not the actual today
                                                  const endDate =
                                                    dumpster.available_until;
                                                  const daysAvailable =
                                                    calculateDaysBetween(
                                                      today,
                                                      endDate
                                                    );

                                                  if (daysAvailable <= 0) {
                                                    return `Available until ${formatDumpsterDate(
                                                      dumpster.available_until
                                                    )}`;
                                                  }

                                                  return `Available for ${daysAvailable} day${
                                                    daysAvailable !== 1
                                                      ? "s"
                                                      : ""
                                                  } until ${formatDumpsterDate(
                                                    dumpster.available_until
                                                  )}`;
                                                })()}
                                                {dumpster.next_rental &&
                                                  ` (Next: ${dumpster.next_rental.customer})`}
                                              </span>
                                            )}
                                          </div>
                                          {selected && (
                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                              <IconCheck
                                                className="h-5 w-5"
                                                aria-hidden="true"
                                              />
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </ListboxOption>
                                  )
                                )}
                              </>
                            )}

                            {/* Upcoming dumpsters */}
                            {dumpsterAvailability.upcoming.length > 0 && (
                              <>
                                <div className="px-3 py-1.5 text-xs font-semibold text-default-500 bg-default-50 mt-1">
                                  Future Availability
                                </div>
                                {dumpsterAvailability.upcoming.map(
                                  (dumpster) => (
                                    <ListboxOption
                                      key={dumpster.tong_no}
                                      className={({ active }) =>
                                        `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                                          active
                                            ? "bg-default-100 text-default-900"
                                            : "text-default-900"
                                        }`
                                      }
                                      value={dumpster.tong_no}
                                    >
                                      {({ selected }) => (
                                        <>
                                          <div className="flex flex-col">
                                            <div className="flex items-center">
                                              <IconCircleDashed
                                                size={16}
                                                className="mr-2 text-amber-500"
                                              />
                                              <span
                                                className={`block truncate ${
                                                  selected
                                                    ? "font-medium"
                                                    : "font-normal"
                                                }`}
                                              >
                                                {dumpster.tong_no}
                                              </span>
                                            </div>
                                            {dumpster.available_after && (
                                              <span className="text-xs text-amber-600 ml-6">
                                                Available after{" "}
                                                {formatDumpsterDate(
                                                  dumpster.available_after
                                                )}
                                                {dumpster.customer &&
                                                  ` (Currently with ${dumpster.customer})`}
                                              </span>
                                            )}
                                            {dumpster.has_future_rental &&
                                              dumpster.next_rental && (
                                                <span className="text-xs text-rose-600 ml-6">
                                                  Then unavailable from{" "}
                                                  {formatDumpsterDate(
                                                    dumpster.next_rental.date
                                                  )}
                                                  {` (Reserved by ${dumpster.next_rental.customer})`}
                                                </span>
                                              )}
                                          </div>
                                          {selected && (
                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                              <IconCheck
                                                className="h-5 w-5"
                                                aria-hidden="true"
                                              />
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </ListboxOption>
                                  )
                                )}
                              </>
                            )}

                            {/* Unavailable dumpsters */}
                            {dumpsterAvailability.unavailable.length > 0 && (
                              <>
                                <div className="px-3 py-1.5 text-xs font-semibold text-default-500 bg-default-50 mt-1">
                                  Unavailable Dumpsters
                                </div>
                                {dumpsterAvailability.unavailable.map(
                                  (dumpster) => (
                                    <ListboxOption
                                      key={dumpster.tong_no}
                                      className={({ active }) =>
                                        `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                                          active
                                            ? "bg-default-100 text-default-900"
                                            : "text-default-900"
                                        }`
                                      }
                                      value={dumpster.tong_no}
                                    >
                                      {({ selected }) => (
                                        <>
                                          <div className="flex flex-col">
                                            <div className="flex items-center">
                                              <IconCircleX
                                                size={16}
                                                className="mr-2 text-rose-500"
                                              />
                                              <span
                                                className={`block truncate ${
                                                  selected
                                                    ? "font-medium"
                                                    : "font-normal"
                                                }`}
                                              >
                                                {dumpster.tong_no}
                                              </span>
                                            </div>
                                            <span className="text-xs text-rose-600 ml-6">
                                              {dumpster.reason ||
                                                "Currently unavailable"}
                                            </span>
                                          </div>
                                          {selected && (
                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                              <IconCheck
                                                className="h-5 w-5"
                                                aria-hidden="true"
                                              />
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </ListboxOption>
                                  )
                                )}
                              </>
                            )}
                          </>
                        )}
                      </ListboxOptions>
                    </div>
                  </Listbox>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="driver"
                    className="text-sm font-medium text-default-700"
                  >
                    Driver <span className="text-rose-500">*</span>
                  </label>
                  <Listbox
                    value={formData.driver}
                    onChange={(value) => {
                      setFormData((prev) => ({
                        ...prev,
                        driver: value,
                      }));
                    }}
                  >
                    <div className="relative">
                      <ListboxButton className="w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500 disabled:bg-default-50">
                        <span className="block truncate">
                          {formData.driver || "Select Driver"}
                        </span>
                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                          <IconChevronDown
                            className="h-5 w-5 text-default-400"
                            aria-hidden="true"
                          />
                        </span>
                      </ListboxButton>
                      <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        <ListboxOption
                          value=""
                          className={({ active }) =>
                            `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                              active
                                ? "bg-default-100 text-default-900"
                                : "text-default-900"
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
                                Select Driver
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                  <IconCheck
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                        {drivers.map((driver) => (
                          <ListboxOption
                            key={driver.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                                active
                                  ? "bg-default-100 text-default-900"
                                  : "text-default-900"
                              }`
                            }
                            value={driver.name}
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {driver.name}
                                </span>
                                {selected && (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck
                                      className="h-5 w-5"
                                      aria-hidden="true"
                                    />
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

          {!isValidSelection &&
            formData.tong_no &&
            formData.date_placed &&
            !isEditMode && (
              <div className="mt-2 text-sm text-rose-600 flex items-center">
                <IconCircleX size={16} className="mr-1.5 flex-shrink-0" />
                <span>
                  The selected dumpster is not available for the chosen date.
                  {(() => {
                    const upcomingDumpster =
                      dumpsterAvailability?.upcoming.find(
                        (d) => d.tong_no === formData.tong_no
                      );
                    const unavailableDumpster =
                      dumpsterAvailability?.unavailable.find(
                        (d) => d.tong_no === formData.tong_no
                      );

                    if (upcomingDumpster?.available_after) {
                      // Include information about future unavailability
                      const message = ` It will be available after ${formatDumpsterDate(
                        upcomingDumpster.available_after
                      )}${
                        upcomingDumpster.customer
                          ? ` (currently with ${upcomingDumpster.customer})`
                          : ""
                      }.`;

                      if (
                        upcomingDumpster.has_future_rental &&
                        upcomingDumpster.next_rental
                      ) {
                        return `${message} Note: It will be reserved again starting ${formatDumpsterDate(
                          upcomingDumpster.next_rental.date
                        )}.`;
                      }

                      return message;
                    } else if (unavailableDumpster?.reason) {
                      return ` ${unavailableDumpster.reason}${
                        unavailableDumpster.customer
                          ? ` (with ${unavailableDumpster.customer})`
                          : ""
                      }.`;
                    }
                    return "";
                  })()}
                </span>
              </div>
            )}

          <div className="mt-6 py-3 flex space-x-2 justify-end">
            {isEditMode && (
              <Button
                type="button"
                variant="outline"
                color="rose"
                size="lg"
                icon={IconTrash}
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Rental"}
              </Button>
            )}
            <div className={isEditMode ? "" : "ml-auto"}>
              <Button
                type="submit"
                variant="boldOutline"
                size="lg"
                disabled={
                  isSaving ||
                  (!isEditMode && !isFormChanged) ||
                  (isEditMode &&
                    formData.date_picked !== null &&
                    !isFormChanged) ||
                  (!isValidSelection && !isEditMode)
                }
              >
                {isSaving
                  ? "Saving..."
                  : isEditMode
                  ? "Update"
                  : "Create Rental"}
              </Button>
            </div>
          </div>
        </form>
      </div>
      {/* New Customer with Location Modal */}
      <LocationFormModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        isCreatingCustomer={true}
        onSubmit={async (data) => {
          try {
            // Create the new customer
            if (data.customer_name) {
              const customerResponse = await greenTargetApi.createCustomer({
                name: data.customer_name,
                phone_number: data.phone_number,
              });

              if (customerResponse && customerResponse.customer) {
                const newCustomerId = customerResponse.customer.customer_id;

                // Create the location for the new customer
                if (data.address) {
                  await greenTargetApi.createLocation({
                    customer_id: newCustomerId,
                    address: data.address,
                    phone_number: data.phone_number,
                  });
                }

                // Fetch updated customers list
                const customersData = await api.get(
                  "/greentarget/api/customers"
                );
                setCustomers(customersData);

                // Select the new customer
                setFormData((prev) => ({
                  ...prev,
                  customer_id: newCustomerId,
                }));

                toast.success("Customer and location created successfully");
              }
            }
          } catch (error) {
            console.error("Error creating customer and location:", error);
            toast.error("Failed to create customer and location");
          }

          setIsNewCustomerModalOpen(false);
        }}
      />
      {/* New Location for Existing Customer Modal */}
      <LocationFormModal
        isOpen={isNewLocationModalOpen}
        onClose={() => setIsNewLocationModalOpen(false)}
        customerId={formData.customer_id}
        customerPhoneNumber={
          customers.find((c) => c.customer_id === formData.customer_id)
            ?.phone_number || ""
        }
        onSubmit={async (data) => {
          try {
            // Create new location for selected customer
            if (data.address && formData.customer_id) {
              const locationResponse = await greenTargetApi.createLocation({
                customer_id: formData.customer_id,
                address: data.address,
                phone_number: data.phone_number,
              });

              // Refresh customer locations
              await fetchCustomerLocations(formData.customer_id);

              // Select the new location
              if (locationResponse && locationResponse.location) {
                setFormData((prev) => ({
                  ...prev,
                  location_id: locationResponse.location.location_id,
                }));
              }

              toast.success("Location added successfully");
            }
          } catch (error) {
            console.error("Error creating location:", error);
            toast.error("Failed to create location");
          }

          setIsNewLocationModalOpen(false);
        }}
      />
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Rental"
        message="Are you sure you want to delete this rental? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
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

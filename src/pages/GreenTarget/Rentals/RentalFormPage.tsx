// src/pages/GreenTarget/Rentals/RentalFormPage.tsx
import React, { useState, useEffect, useCallback, Fragment } from "react"; // Removed useRef, Added Fragment
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
import {
  Listbox,
  ListboxOption,
  ListboxOptions,
  Transition,
  ListboxButton as HeadlessListboxButton,
} from "@headlessui/react";
import LocationFormModal from "../../../components/GreenTarget/LocationFormModal";
import { api } from "../../../routes/utils/api";
import clsx from "clsx";
import { FormCombobox, SelectOption } from "../../../components/FormComponents"; // Use updated components

// Interfaces (Customer, Location, Dumpster, Rental - unchanged)
interface Customer {
  customer_id: number;
  name: string;
  phone_number?: string | null;
}

interface Location {
  location_id: number;
  customer_id: number;
  address: string;
  phone_number?: string | null;
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
  date_placed: string; // Keep as YYYY-MM-DD string
  date_picked: string | null; // Keep as YYYY-MM-DD string or null
  remarks: string | null;
}

// Helper to format date for input elements
const formatDateForInput = (dateString: string | null): string => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    // Ensure date uses local timezone interpretation before splitting
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.error("Error formatting date for input:", dateString, e);
    return "";
  }
};

const RentalFormPage: React.FC = () => {
  const navigate = useNavigate();
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
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isNewLocationModalOpen, setIsNewLocationModalOpen] = useState(false);
  const [isValidSelection, setIsValidSelection] = useState(false); // Dumpster validity
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);

  // UI state
  const [initialFormData, setInitialFormData] = useState<Rental | null>(null);
  const [customerLocations, setCustomerLocations] = useState<Location[]>([]);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dumpsterAvailability, setDumpsterAvailability] = useState<{
    date: string;
    available: Dumpster[];
    upcoming: Dumpster[];
    unavailable: Dumpster[];
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for Customer Combobox
  const [customerQuery, setCustomerQuery] = useState("");

  // Load reference data (customers, drivers)
  useEffect(() => {
    let isMounted = true;
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        const [customersData, driversData] = await Promise.all([
          greenTargetApi.getCustomers(),
          api.get("/api/staffs/get-drivers"),
        ]);

        if (isMounted) {
          setCustomers(customersData || []);
          const loadedDrivers = driversData || [];
          setDrivers(loadedDrivers);

          if (!isEditMode && loadedDrivers.length > 0) {
            setFormData((prev) => ({
              ...prev,
              driver: loadedDrivers[0].name,
            }));
            // Set initial driver in initialFormData too for change detection
            setInitialFormData((prev) => ({
              ...(prev ?? formData), // Use current formData as base if initial is null
              driver: loadedDrivers[0].name,
            }));
          }
        }
      } catch (err) {
        console.error("Error loading reference data:", err);
        if (isMounted) {
          toast.error("Failed to load necessary data");
          setError("Could not load customers or drivers.");
        }
      } finally {
        if (isMounted && !isEditMode) {
          setLoading(false); // Finish loading if creating
        }
      }
    };

    loadReferenceData();
    return () => {
      isMounted = false;
    };
  }, [isEditMode]); // Only depends on isEditMode

  // Fetch Dumpster Availability **RESTORED LOGIC**
  useEffect(() => {
    let isMounted = true;
    const fetchDumpsterAvailability = async () => {
      if (!formData.date_placed) return; // Need placement date

      // Don't necessarily show loading indicator just for this unless it's the initial load sequence
      try {
        const normalizedDate = formData.date_placed.split("T")[0];
        const data = await api.get(
          `/greentarget/api/dumpsters/availability?date=${normalizedDate}`
        );
        if (isMounted) {
          setDumpsterAvailability(data);
          // Check if current selection is still valid AFTER availability is fetched
          // This triggers the checkDumpsterAvailability effect
        }
      } catch (err) {
        console.error("Error fetching dumpster availability:", err);
        if (isMounted) {
          toast.error("Failed to load dumpster availability");
          setDumpsterAvailability(null);
        }
      }
    };

    fetchDumpsterAvailability();
    return () => {
      isMounted = false;
    };
  }, [formData.date_placed]); // Trigger ONLY when placement date changes

  // Fetch Rental Details in Edit Mode
  useEffect(() => {
    let isMounted = true;
    if (isEditMode && id) {
      setLoading(true);
      fetchRentalDetails(parseInt(id), isMounted);
    } else if (!isEditMode && customers.length > 0) {
      // Ensure customers are loaded for create mode initial state
      const initialDriver = drivers.length > 0 ? drivers[0].name : "";
      const defaultInitialState: Rental = {
        customer_id: 0,
        location_id: null,
        tong_no: "",
        driver: initialDriver,
        date_placed: new Date().toISOString().split("T")[0],
        date_picked: null,
        remarks: null,
      };
      setFormData(defaultInitialState); // Set initial form state
      setInitialFormData(defaultInitialState); // Set initial comparison state
      setLoading(false); // Finish loading for create mode
    }
    return () => {
      isMounted = false;
    };
  }, [id, isEditMode, customers, drivers]); // Add customers/drivers dependencies for create mode

  // Load locations when customer changes (excluding initial load in edit mode)
  useEffect(() => {
    let isMounted = true;
    // Only fetch if customer_id is valid and different from initial load (or initial load hasn't happened yet)
    if (
      formData.customer_id > 0 &&
      (!initialFormData || formData.customer_id !== initialFormData.customer_id)
    ) {
      fetchCustomerLocations(formData.customer_id, isMounted).then(() => {
        if (isMounted) {
          // Auto-select first location OR set to null if none exist for the new customer
          setFormData((prev) => ({
            ...prev,
            location_id:
              customerLocations.length > 0
                ? customerLocations[0].location_id
                : null,
          }));
        }
      });
    } else if (formData.customer_id === 0) {
      // If customer deselected
      setCustomerLocations([]);
      if (formData.location_id !== null) {
        setFormData((prev) => ({ ...prev, location_id: null }));
      }
    }
    return () => {
      isMounted = false;
    };
  }, [formData.customer_id, initialFormData]); // Rerun when customer changes

  // Monitor form changes against initial data
  useEffect(() => {
    if (initialFormData) {
      const hasChanged =
        JSON.stringify(formData) !== JSON.stringify(initialFormData);
      setIsFormChanged(hasChanged);
    }
  }, [formData, initialFormData]);

  const fetchRentalDetails = async (rentalId: number, isMounted: boolean) => {
    try {
      const rental = await greenTargetApi.getRental(rentalId);
      if (!isMounted) return; // Check mount status after async call
      if (!rental) throw new Error("Rental not found");

      // Fetch locations first
      await fetchCustomerLocations(rental.customer_id, isMounted);
      if (!isMounted) return;

      const fetchedFormData: Rental = {
        rental_id: rental.rental_id,
        customer_id: rental.customer_id,
        customer_name: rental.customer_name,
        location_id: rental.location_id ?? null,
        location_address: rental.location_address,
        tong_no: rental.tong_no,
        driver: rental.driver,
        date_placed: formatDateForInput(rental.date_placed),
        date_picked: formatDateForInput(rental.date_picked),
        remarks: rental.remarks ?? null,
      };
      setFormData(fetchedFormData);
      setInitialFormData(fetchedFormData);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching rental details:", err);
      if (isMounted) {
        setError(
          `Failed to fetch rental details: ${err.message || "Unknown error"}`
        );
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const fetchCustomerLocations = async (
    customerId: number,
    isMounted: boolean
  ) => {
    if (!customerId || customerId <= 0) {
      if (isMounted) setCustomerLocations([]);
      return;
    }
    try {
      const locationsData = await api.get(
        `/greentarget/api/locations?customer_id=${customerId}`
      );
      if (isMounted) {
        setCustomerLocations(Array.isArray(locationsData) ? locationsData : []);
      }
    } catch (err) {
      console.error("Error fetching customer locations:", err);
      if (isMounted) {
        setCustomerLocations([]);
        toast.error("Failed to load customer locations.");
      }
    }
  };

  // --- Input Handlers ---
  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newDateValue = value || null;

    if (name === "date_picked" && newDateValue && formData.date_placed) {
      if (new Date(newDateValue) < new Date(formData.date_placed)) {
        toast.error("Pickup date cannot be earlier than placement date.");
        return;
      }
    }
    if (name === "date_placed" && formData.date_picked) {
      if (new Date(formData.date_picked) < new Date(value)) {
        toast.error("Placement date cannot be later than pickup date.");
        return;
      }
    }
    setFormData((prevData) => ({ ...prevData, [name]: newDateValue }));
    // No need to manually trigger dumpster fetch here, useEffect handles it
  };

  // Handler for Customer Combobox (single selection mode)
  const handleCustomerComboboxChange = (
    selectedId: string | string[] | null
  ) => {
    // Expecting single string ID or null from single mode combobox
    const newCustomerId =
      selectedId && typeof selectedId === "string" ? Number(selectedId) : 0;

    if (newCustomerId !== formData.customer_id) {
      setFormData((prev) => ({
        ...prev,
        customer_id: newCustomerId,
        location_id: null, // Reset location
      }));
      setCustomerQuery(""); // Clear search
    }
  };

  const handleLocationChange = (locationIdString: string) => {
    const newLocationId =
      locationIdString === "" ? null : Number(locationIdString);
    setFormData((prev) => ({ ...prev, location_id: newLocationId }));
  };

  const handleDumpsterChange = (tongNo: string) => {
    setFormData((prev) => ({ ...prev, tong_no: tongNo }));
  };

  const handleDriverChange = (driverName: string) => {
    setFormData((prev) => ({ ...prev, driver: driverName }));
  };

  const handleBackClick = () => {
    if (isFormChanged) setShowBackConfirmation(true);
    else navigate("/greentarget/rentals");
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/greentarget/rentals");
  };

  // --- Dumpster Availability & Validation ---
  const formatDumpsterDate = (dateString: string | undefined): string => {
    if (!dateString) return "unknown date";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "invalid date";
      return date.toLocaleDateString("en-GB");
    } catch {
      return "invalid date";
    }
  };

  const calculateDaysBetween = (
    startDateStr: string | null,
    endDateStr: string | null
  ): number | null => {
    if (!startDateStr || !endDateStr) return null;
    try {
      const start = new Date(startDateStr);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDateStr);
      end.setHours(0, 0, 0, 0);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start)
        return null;
      const differenceMs = end.getTime() - start.getTime();
      return Math.round(differenceMs / (1000 * 60 * 60 * 24)) + 1;
    } catch {
      return null;
    }
  };

  // Memoized check (re-evaluates when dependencies change)
  const checkDumpsterAvailability = useCallback(() => {
    if (!formData.date_placed || !formData.tong_no || !dumpsterAvailability)
      return false;

    if (isEditMode && initialFormData) {
      if (
        formData.tong_no === initialFormData.tong_no &&
        formData.date_placed === initialFormData.date_placed
      ) {
        if (
          formData.date_picked === initialFormData.date_picked ||
          formData.date_picked === null
        )
          return true;
        // If only pickup date changed, assume valid for now (backend check needed for edge cases)
        return true;
      }
    }

    const targetDumpster =
      dumpsterAvailability.available.find(
        (d) => d.tong_no === formData.tong_no
      ) ||
      dumpsterAvailability.upcoming.find((d) => d.tong_no === formData.tong_no);

    if (!targetDumpster) {
      if (
        isEditMode &&
        initialFormData &&
        formData.tong_no === initialFormData.tong_no
      )
        return true; // Allow saving if it was the original dumpster
      return false;
    }

    const placementDate = new Date(formData.date_placed);
    placementDate.setHours(0, 0, 0, 0);

    if (targetDumpster.available_after) {
      const availableAfterDate = new Date(targetDumpster.available_after);
      availableAfterDate.setHours(0, 0, 0, 0);
      // If placing *on* the day it becomes available (due to transition), it's okay.
      // If placing *before* it's available, it's not okay.
      if (placementDate < availableAfterDate) return false;
    }

    if (targetDumpster.next_rental?.date) {
      const nextRentalStartDate = new Date(targetDumpster.next_rental.date);
      nextRentalStartDate.setHours(0, 0, 0, 0);
      if (!formData.date_picked) return false; // Ongoing conflicts with any future booking
      const pickupDate = new Date(formData.date_picked);
      pickupDate.setHours(0, 0, 0, 0);
      if (pickupDate >= nextRentalStartDate) return false; // Pickup must be before next rental starts
    }
    return true;
  }, [
    formData.date_placed,
    formData.date_picked,
    formData.tong_no,
    dumpsterAvailability,
    isEditMode,
    initialFormData,
  ]);

  useEffect(() => {
    setIsValidSelection(checkDumpsterAvailability());
  }, [checkDumpsterAvailability]);

  const validateForm = (): boolean => {
    if (!formData.customer_id || formData.customer_id <= 0) {
      toast.error("Please select a customer");
      return false;
    }
    if (!formData.date_placed) {
      toast.error("Please select a placement date");
      return false;
    }
    try {
      new Date(formData.date_placed);
    } catch {
      toast.error("Invalid placement date format");
      return false;
    }
    if (formData.date_picked) {
      try {
        new Date(formData.date_picked);
      } catch {
        toast.error("Invalid pickup date format");
        return false;
      }
      if (new Date(formData.date_picked) < new Date(formData.date_placed)) {
        toast.error("Pickup date cannot be earlier than placement date.");
        return false;
      }
    }
    if (!formData.tong_no) {
      toast.error("Please select a dumpster");
      return false;
    }
    if (!formData.driver) {
      toast.error("Please select a driver");
      return false;
    }
    if (!isValidSelection) {
      // Find dumpster info for better error message
      const dumpsterInfo =
        dumpsterAvailability?.available.find(
          (d) => d.tong_no === formData.tong_no
        ) ||
        dumpsterAvailability?.upcoming.find(
          (d) => d.tong_no === formData.tong_no
        ) ||
        dumpsterAvailability?.unavailable.find(
          (d) => d.tong_no === formData.tong_no
        );
      let reason = "selected dumpster is not available for the chosen dates.";
      if (dumpsterInfo?.next_rental?.date)
        reason = `it conflicts with a future booking starting ${formatDumpsterDate(
          dumpsterInfo.next_rental.date
        )}.`;
      else if (dumpsterInfo?.available_after)
        reason = `it is only available after ${formatDumpsterDate(
          dumpsterInfo.available_after
        )}.`;
      else if (dumpsterInfo?.reason)
        reason = `it is unavailable (${dumpsterInfo.reason}).`;
      toast.error(`Cannot save: ${reason}`);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSaving(true);
    const payload: Omit<Rental, "customer_name" | "location_address"> = {
      customer_id: Number(formData.customer_id),
      location_id: formData.location_id ? Number(formData.location_id) : null,
      tong_no: formData.tong_no,
      driver: formData.driver,
      date_placed: formData.date_placed,
      date_picked: formData.date_picked || null,
      remarks: formData.remarks || null,
    };

    try {
      let response;
      if (isEditMode && formData.rental_id) {
        response = await greenTargetApi.updateRental(
          formData.rental_id,
          payload
        );
      } else {
        response = await greenTargetApi.createRental(payload);
      }
      // Check for backend validation errors first
      if (
        response?.error ||
        (response?.message && response.message.toLowerCase().includes("error"))
      ) {
        throw new Error(
          response.message || response.error || "Backend validation failed."
        );
      }
      toast.success(
        `Rental ${isEditMode ? "updated" : "created"} successfully!`
      );
      navigate("/greentarget/rentals");
    } catch (error: any) {
      console.error("Error saving rental:", error);
      let errorMsg = "An unexpected error occurred. Please try again.";
      if (error?.message) {
        if (error.message.toLowerCase().includes("overlap"))
          errorMsg =
            "Error: This rental period overlaps with another booking for the selected dumpster.";
        else if (error.message.toLowerCase().includes("not available"))
          errorMsg =
            "Error: The selected dumpster is not available for the specified dates.";
        else errorMsg = `Error: ${error.message}`;
      }
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Delete Logic ---
  const handleDelete = async () => {
    if (!formData.rental_id) return;
    setIsDeleting(true);
    const toastId = toast.loading("Deleting rental...");
    try {
      const response = await greenTargetApi.deleteRental(formData.rental_id);
      if (
        response?.error ||
        (response?.message &&
          response.message.toLowerCase().includes("cannot delete"))
      ) {
        throw new Error(
          response.message || response.error || "Deletion failed."
        );
      }
      toast.success("Rental deleted successfully", { id: toastId });
      navigate("/greentarget/rentals");
    } catch (error: any) {
      console.error("Error deleting rental:", error);
      let errorMsg = "Failed to delete rental.";
      if (error?.message?.toLowerCase().includes("associated invoices")) {
        errorMsg = "Cannot delete rental: It has associated invoices.";
      } else if (error?.message) {
        errorMsg = `Error: ${error.message}`;
      }
      toast.error(errorMsg, { id: toastId });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // --- RENDER ---
  if (loading) return <LoadingSpinner />;

  // Define a type for dumpster options that extends SelectOption
  interface DumpsterOption extends SelectOption {
    status: string;
    info: Dumpster;
  }

  // Prepare options for components
  const customerOptions: SelectOption[] = customers.map((c) => ({
    id: c.customer_id,
    name: c.name,
    phone_number: c.phone_number,
  }));
  const locationOptions: SelectOption[] = customerLocations.map((l) => ({
    id: l.location_id,
    name: l.address,
    phone_number: l.phone_number,
  }));
  const driverOptions: SelectOption[] = drivers.map((d) => ({
    id: d.id,
    name: d.name,
  }));
  const dumpsterOptions: DumpsterOption[] = [
    ...(dumpsterAvailability?.available ?? []).map((d) => ({
      id: d.tong_no,
      name: d.tong_no,
      status: "available",
      info: d,
    })),
    ...(dumpsterAvailability?.upcoming ?? []).map((d) => ({
      id: d.tong_no,
      name: d.tong_no,
      status: "upcoming",
      info: d,
    })),
    ...(dumpsterAvailability?.unavailable ?? []).map((d) => ({
      id: d.tong_no,
      name: d.tong_no,
      status: "unavailable",
      info: d,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="container mx-auto px-4 -mt-8 pb-10">
      <BackButton onClick={handleBackClick} className="ml-5 mb-2" />
      <div className="bg-white rounded-lg shadow border border-default-200">
        <div className="p-6 border-b border-default-200">
          {/* Header */}
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode
              ? `Edit Rental #${formData.rental_id}`
              : "Create New Rental"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? `Update details for the rental placed on ${formatDateForInput(
                  initialFormData?.date_placed ?? null
                )}.`
              : "Fill in the details to create a new dumpster rental record."}
          </p>
        </div>

        {/* Form Start */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* --- Customer & Location Section --- */}
            <div className="border-b border-default-200 pb-6">
              <h2 className="text-base font-semibold leading-7 text-default-900 mb-4">
                Customer Information
              </h2>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                {/* Customer Combobox (Single Mode) */}
                <div className="sm:col-span-3">
                  <FormCombobox
                    name="customer_id"
                    label="Customer"
                    value={
                      formData.customer_id > 0
                        ? formData.customer_id.toString()
                        : undefined
                    } // Pass single ID string or undefined
                    onChange={handleCustomerComboboxChange}
                    options={customerOptions}
                    query={customerQuery}
                    setQuery={setCustomerQuery}
                    placeholder="Search or Select Customer..."
                    disabled={isEditMode}
                    required={true}
                    mode="single" // Explicitly set single mode
                  />
                  {!isEditMode && (
                    <button
                      type="button"
                      onClick={() => setIsNewCustomerModalOpen(true)}
                      className="mt-2 text-sm text-sky-600 hover:text-sky-800 flex items-center"
                    >
                      <IconPlus size={16} className="mr-1" /> Add New Customer
                    </button>
                  )}
                </div>

                {/* Location Listbox (Styled) */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="location_id-button"
                    className="block text-sm font-medium text-default-700"
                  >
                    Delivery Location
                  </label>
                  <div className="mt-2">
                    <Listbox
                      value={formData.location_id?.toString() ?? ""}
                      onChange={handleLocationChange}
                      disabled={!formData.customer_id}
                      name="location_id"
                    >
                      <div className="relative">
                        <HeadlessListboxButton
                          id="location_id-button"
                          className={clsx(
                            "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
                            "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                            !formData.customer_id
                              ? "bg-gray-50 text-gray-500 cursor-not-allowed"
                              : ""
                          )}
                        >
                          {/* Display Logic */}
                          {(() => {
                            /* ... same display logic as before ... */
                            const selectedLocation = customerLocations.find(
                              (l) => l.location_id === formData.location_id
                            );
                            const displayAddress =
                              selectedLocation?.address ||
                              "No Specific Location";
                            const displayPhone = selectedLocation?.phone_number;
                            const customerPhone = customers.find(
                              (c) => c.customer_id === formData.customer_id
                            )?.phone_number;
                            const showPhone =
                              displayPhone && displayPhone !== customerPhone;
                            return (
                              <div className="flex flex-col">
                                <span className="block truncate font-medium">
                                  {displayAddress}
                                </span>
                                {showPhone && (
                                  <span className="text-xs text-default-500 flex items-center mt-0.5">
                                    <IconPhone size={12} className="mr-1" />
                                    {displayPhone}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
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
                            {/* Options including "No Specific" and "Add New" */}
                            <ListboxOption
                              key="no-location"
                              className={({ active }) =>
                                clsx(
                                  "relative cursor-default select-none py-2 pl-3 pr-10",
                                  active
                                    ? "bg-sky-100 text-sky-900"
                                    : "text-gray-900"
                                )
                              }
                              value=""
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={clsx(
                                      "block truncate italic",
                                      selected ? "font-medium" : "font-normal",
                                      "text-gray-500"
                                    )}
                                  >
                                    No Specific Location
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                      <IconCheck size={20} aria-hidden="true" />
                                    </span>
                                  )}
                                </>
                              )}
                            </ListboxOption>
                            {customerLocations.map((location) => (
                              <ListboxOption
                                key={location.location_id}
                                className={({ active }) =>
                                  clsx(
                                    "relative cursor-default select-none py-2 pl-3 pr-10",
                                    active
                                      ? "bg-sky-100 text-sky-900"
                                      : "text-gray-900"
                                  )
                                }
                                value={location.location_id.toString()}
                              >
                                {({ selected }) => (
                                  <>
                                    {/* Display logic with phone */}
                                    <div className="flex flex-col">
                                      <span
                                        className={clsx(
                                          "block truncate",
                                          selected
                                            ? "font-medium"
                                            : "font-normal"
                                        )}
                                      >
                                        {location.address}
                                      </span>
                                      {location.phone_number &&
                                        location.phone_number !==
                                          customers.find(
                                            (c) =>
                                              c.customer_id ===
                                              formData.customer_id
                                          )?.phone_number && (
                                          <span className="text-xs text-default-500 flex items-center mt-0.5">
                                            <IconPhone
                                              size={12}
                                              className="mr-1"
                                            />
                                            {location.phone_number}
                                          </span>
                                        )}
                                    </div>
                                    {selected && (
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                        <IconCheck
                                          size={20}
                                          aria-hidden="true"
                                        />
                                      </span>
                                    )}
                                  </>
                                )}
                              </ListboxOption>
                            ))}
                            {formData.customer_id > 0 && (
                              <ListboxOption
                                key="add-location"
                                className={({ active }) =>
                                  clsx(
                                    "relative cursor-pointer select-none py-2 pl-3 pr-10 mt-1 pt-2 border-t",
                                    active
                                      ? "bg-sky-100 text-sky-600"
                                      : "text-sky-600"
                                  )
                                }
                                value="add-new"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setIsNewLocationModalOpen(true);
                                }}
                              >
                                <span className="flex items-center font-medium">
                                  <IconPlus size={16} className="mr-1" /> Add
                                  New Location
                                </span>
                              </ListboxOption>
                            )}
                          </ListboxOptions>
                        </Transition>
                      </div>
                    </Listbox>
                  </div>
                </div>
              </div>
            </div>

            {/* --- Rental Details Section --- */}
            <div className="border-b border-default-200 pb-6">
              <h2 className="text-base font-semibold leading-7 text-default-900 mb-4">
                Rental Details
              </h2>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                {/* Placement Date */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="date_placed"
                    className="block text-sm font-medium text-default-700"
                  >
                    Placement Date <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-2">
                    <input
                      type="date"
                      id="date_placed"
                      name="date_placed"
                      value={formData.date_placed}
                      onChange={handleDateChange}
                      required
                      className={clsx(
                        "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                      )}
                    />
                  </div>
                </div>
                {/* Pickup Date */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="date_picked"
                    className="block text-sm font-medium text-default-700"
                  >
                    Pickup Date{" "}
                    <span className="text-xs text-default-500">(Optional)</span>
                  </label>
                  <div className="mt-2">
                    <input
                      type="date"
                      id="date_picked"
                      name="date_picked"
                      value={formData.date_picked ?? ""}
                      onChange={handleDateChange}
                      min={formData.date_placed}
                      className={clsx(
                        "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                      )}
                    />
                  </div>
                </div>
                {/* Dumpster Listbox (Styled) */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="tong_no-button"
                    className="block text-sm font-medium text-default-700"
                  >
                    Dumpster <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-2">
                    <Listbox
                      value={formData.tong_no}
                      onChange={handleDumpsterChange}
                      disabled={!formData.date_placed}
                      name="tong_no"
                    >
                      <div className="relative">
                        <HeadlessListboxButton
                          id="tong_no-button"
                          className={clsx(
                            "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
                            "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                            !formData.date_placed
                              ? "bg-gray-50 text-gray-500 cursor-not-allowed"
                              : ""
                          )}
                        >
                          <span className="block truncate">
                            {formData.tong_no ||
                              (!formData.date_placed
                                ? "Select date first"
                                : "Select Dumpster")}
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
                              "absolute z-10 max-h-72 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                              "mt-1"
                            )}
                          >
                            {dumpsterOptions.length === 0 &&
                            formData.date_placed ? (
                              <div className="relative cursor-default select-none py-2 px-4 text-gray-500">
                                Loading or no dumpsters...
                              </div>
                            ) : (
                              dumpsterOptions.map((option) => {
                                const dumpster = option.info as Dumpster;
                                let icon = (
                                  <IconCircleCheck
                                    size={16}
                                    className="mr-2 text-green-500 flex-shrink-0"
                                  />
                                );
                                let availabilityText = "";
                                let textClass = "text-xs ml-6";
                                if (option.status === "upcoming") {
                                  icon = (
                                    <IconCircleDashed
                                      size={16}
                                      className="mr-2 text-amber-500 flex-shrink-0"
                                    />
                                  );
                                  textClass += " text-amber-600";
                                  availabilityText = `Available after ${formatDumpsterDate(
                                    dumpster.available_after
                                  )}`;
                                  if (dumpster.customer)
                                    availabilityText += ` (from ${dumpster.customer})`;
                                } else if (option.status === "unavailable") {
                                  icon = (
                                    <IconCircleX
                                      size={16}
                                      className="mr-2 text-rose-500 flex-shrink-0"
                                    />
                                  );
                                  textClass += " text-rose-600";
                                  availabilityText =
                                    dumpster.reason || "Currently unavailable";
                                  if (dumpster.customer)
                                    availabilityText += ` (with ${dumpster.customer})`;
                                } else if (dumpster.next_rental?.date) {
                                  textClass += " text-amber-600";
                                  availabilityText = `Available until ${formatDumpsterDate(
                                    dumpster.available_until
                                  )}`;
                                  if (dumpster.next_rental.customer)
                                    availabilityText += ` (next: ${
                                      dumpster.next_rental.customer
                                    } on ${formatDumpsterDate(
                                      dumpster.next_rental.date
                                    )})`;
                                } else if (dumpster.is_transition_day) {
                                  textClass += " text-blue-600";
                                  availabilityText = `Transition Day (Available - from ${
                                    dumpster.transition_from?.customer_name ??
                                    "previous rental"
                                  })`;
                                }
                                return (
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
                                    disabled={option.status === "unavailable"}
                                  >
                                    {({ selected }) => (
                                      <>
                                        <div className="flex flex-col">
                                          <div className="flex items-center">
                                            {icon}
                                            <span
                                              className={clsx(
                                                "block truncate",
                                                selected
                                                  ? "font-medium"
                                                  : "font-normal"
                                              )}
                                            >
                                              {option.name}
                                            </span>
                                          </div>
                                          {availabilityText && (
                                            <span className={textClass}>
                                              {availabilityText}
                                            </span>
                                          )}
                                        </div>
                                        {selected && (
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                            <IconCheck
                                              size={20}
                                              aria-hidden="true"
                                            />
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </ListboxOption>
                                );
                              })
                            )}
                          </ListboxOptions>
                        </Transition>
                      </div>
                    </Listbox>
                    {/* Validation Message */}
                    {!isValidSelection &&
                      formData.tong_no &&
                      formData.date_placed && (
                        <p className="mt-1 text-xs text-rose-600 flex items-start">
                          <IconCircleX
                            size={14}
                            className="mr-1 mt-[1px] flex-shrink-0"
                          />
                          <span>
                            Selected dumpster is unavailable for these dates.
                          </span>
                        </p>
                      )}
                  </div>
                </div>
                {/* Driver Listbox (Styled) */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="driver-button"
                    className="block text-sm font-medium text-default-700"
                  >
                    Driver <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-2">
                    <Listbox
                      value={formData.driver}
                      onChange={handleDriverChange}
                      name="driver"
                    >
                      <div className="relative">
                        <HeadlessListboxButton
                          id="driver-button"
                          className={clsx(
                            "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
                            "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                          )}
                        >
                          <span className="block truncate">
                            {formData.driver || "Select Driver"}
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
                              key="placeholder"
                              value=""
                              disabled
                              className="text-gray-400 italic py-2 pl-3 pr-10 select-none"
                            >
                              Select Driver
                            </ListboxOption>
                            {driverOptions.map((option) => (
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
                                value={option.name}
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
                                    {selected && (
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                        <IconCheck
                                          size={20}
                                          aria-hidden="true"
                                        />
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
                </div>
              </div>
            </div>

            {/* --- Remarks Section --- */}
            <div className="border-b border-default-200 pb-6">
              <label
                htmlFor="remarks"
                className="block text-sm font-medium leading-6 text-default-700"
              >
                Remarks{" "}
                <span className="text-xs text-default-500">(Optional)</span>
              </label>
              <div className="mt-2">
                <textarea
                  id="remarks"
                  name="remarks"
                  rows={3}
                  className={clsx(
                    "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                    "placeholder-default-400"
                  )}
                  placeholder="Add any special notes or instructions..."
                  value={formData.remarks ?? ""}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          {/* --- Action Buttons --- */}
          <div className="mt-6 flex items-center justify-end gap-x-4 pb-6">
            {isEditMode && (
              <Button
                type="button"
                variant="outline"
                color="rose"
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={isDeleting}
                icon={IconTrash}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              color="secondary"
              onClick={handleBackClick}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="filled"
              color="sky"
              disabled={isSaving || !isFormChanged || !isValidSelection}
            >
              {isSaving
                ? "Saving..."
                : isEditMode
                ? "Save Changes"
                : "Create Rental"}
            </Button>
          </div>
        </form>
      </div>

      {/* Modals & Dialogs */}
      <LocationFormModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        isCreatingCustomer={true}
        onSubmit={async (data) => {
          /* ... Submit logic ... */ setIsNewCustomerModalOpen(false);
          try {
            if (data.customer_name) {
              const customerResponse = await greenTargetApi.createCustomer({
                name: data.customer_name,
                phone_number: data.phone_number,
              });
              if (customerResponse?.customer) {
                const newCustomerId = customerResponse.customer.customer_id;
                toast.success("Customer created successfully.");
                const customersData = await greenTargetApi.getCustomers();
                setCustomers(customersData || []);
                setFormData((prev) => ({
                  ...prev,
                  customer_id: newCustomerId,
                  location_id: null,
                }));
                setCustomerQuery("");
                if (data.address) {
                  await greenTargetApi.createLocation({
                    customer_id: newCustomerId,
                    address: data.address,
                    phone_number: data.phone_number,
                  });
                  await fetchCustomerLocations(newCustomerId, true);
                }
              } else {
                throw new Error("Failed to create customer.");
              }
            }
          } catch (error) {
            console.error("Error creating customer:", error);
            toast.error("Failed to create customer.");
          }
        }}
      />
      <LocationFormModal
        isOpen={isNewLocationModalOpen}
        onClose={() => setIsNewLocationModalOpen(false)}
        customerId={formData.customer_id}
        customerPhoneNumber={
          customers.find((c) => c.customer_id === formData.customer_id)
            ?.phone_number ?? undefined
        }
        onSubmit={async (data) => {
          /* ... Submit logic ... */ setIsNewLocationModalOpen(false);
          try {
            if (data.address && formData.customer_id) {
              const locationResponse = await greenTargetApi.createLocation({
                customer_id: formData.customer_id,
                address: data.address,
                phone_number: data.phone_number,
              });
              if (locationResponse?.location) {
                toast.success("Location added successfully.");
                await fetchCustomerLocations(formData.customer_id, true);
                setFormData((prev) => ({
                  ...prev,
                  location_id: locationResponse.location.location_id,
                }));
              } else {
                throw new Error("Failed to add location.");
              }
            }
          } catch (error) {
            console.error("Error creating location:", error);
            toast.error("Failed to add location.");
          }
        }}
      />
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Rental"
        message={`Are you sure you want to delete Rental #${formData.rental_id}? This action cannot be undone.`}
        confirmButtonText={isDeleting ? "Deleting..." : "Delete"}
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to leave? Unsaved changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
    </div>
  );
};

export default RentalFormPage;

// src/pages/GreenTarget/Rentals/RentalFormPage.tsx
import React, { useState, useEffect, useCallback, Fragment } from "react";
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
import RentalAddonModal from "../../../components/GreenTarget/RentalAddonModal";
import { api } from "../../../routes/utils/api";
import clsx from "clsx";
import { FormCombobox, SelectOption } from "../../../components/FormComponents";
import AssociatedInvoiceDisplay from "../../../components/GreenTarget/AssociatedInvoiceDisplay";

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
  next_rental?: { date: string; customer: string; rental_id: number };
}
interface InvoiceInfo {
  invoice_id: number;
  invoice_number: string;
  status: string;
  amount?: number;
  has_payments?: boolean;
}

interface PickupDestination {
  id: number;
  code: string;
  name: string;
  is_default: boolean;
  sort_order: number;
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
  invoice_info?: InvoiceInfo | null;
  pickup_destination?: string | null;
  addon_count?: number;
}

// Helper to format date
const formatDateForInput = (dateString: string | null): string => {
  /* ... same as before ... */
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
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

  const [formData, setFormData] = useState<Rental>({
    customer_id: 0,
    location_id: null,
    tong_no: "",
    driver: "",
    date_placed: new Date().toISOString().split("T")[0],
    date_picked: null,
    remarks: null,
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isNewLocationModalOpen, setIsNewLocationModalOpen] = useState(false);
  const [isValidSelection, setIsValidSelection] = useState(false);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
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
  const [customerQuery, setCustomerQuery] = useState("");
  const [pickupDestinations, setPickupDestinations] = useState<PickupDestination[]>([]);
  const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
  const previousDateRef = React.useRef<string | null>(null); // Use useRef from React

  // Load reference data
  useEffect(() => {
    let isMounted = true;
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        const [customersData, driversData, pickupDestinationsData] = await Promise.all([
          greenTargetApi.getCustomers(),
          api.get("/api/staffs/get-drivers"),
          greenTargetApi.getPickupDestinations(),
        ]);
        if (isMounted) {
          setCustomers(customersData || []);
          const loadedDrivers = driversData || [];
          setDrivers(loadedDrivers);
          setPickupDestinations(pickupDestinationsData || []);

          // Get default pickup destination
          const defaultDest = pickupDestinationsData?.find((d: PickupDestination) => d.is_default);

          if (!isEditMode && loadedDrivers.length > 0) {
            const initialDriver = loadedDrivers[0].name;
            setFormData((prev) => ({
              ...prev,
              driver: initialDriver,
              pickup_destination: defaultDest?.code || null,
            }));
            // Set initial state for comparison later
            setInitialFormData((prev) => ({
              ...(prev ?? { ...formData, driver: initialDriver }),
              driver: initialDriver,
              pickup_destination: defaultDest?.code || null,
            }));
          } else if (!isEditMode) {
            // Set initial state even if no drivers loaded
            setFormData((prev) => ({
              ...prev,
              pickup_destination: defaultDest?.code || null,
            }));
            setInitialFormData((prev) => ({
              ...(prev ?? formData),
              pickup_destination: defaultDest?.code || null,
            }));
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error("Error loading ref data:", err);
          toast.error("Failed data load");
          setError("Data load error.");
        }
      } finally {
        if (isMounted && !isEditMode) setLoading(false);
      }
    };
    loadReferenceData();
    return () => {
      isMounted = false;
    };
  }, [isEditMode]); // Depend only on isEditMode

  // **RESTORED Dumpster Availability Fetch Logic**
  useEffect(() => {
    let isMounted = true;
    const fetchDumpsterAvailability = async () => {
      if (!formData.date_placed) return;

      // Normalize date format
      const normalizedDate = formData.date_placed.split("T")[0];

      // Skip if we've already fetched for this date
      if (previousDateRef.current === normalizedDate && dumpsterAvailability)
        return; // Only skip if data already exists for this date
      previousDateRef.current = normalizedDate;

      try {
        const data = await api.get(
          `/greentarget/api/dumpsters/availability?date=${normalizedDate}`
        );
        if (isMounted) {
          setDumpsterAvailability(data);
        }
      } catch (err) {
        console.error("Error fetching dumpster availability:", err);
        if (isMounted) {
          toast.error("Failed to load dumpster availability");
          setDumpsterAvailability(null); // Reset on error
        }
      }
    };

    fetchDumpsterAvailability();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.date_placed]); // Only re-run when date changes - previousDateRef handles deduplication

  // Fetch Rental Details in Edit Mode
  useEffect(() => {
    let isMounted = true;
    if (isEditMode && id) {
      setLoading(true);
      fetchRentalDetails(parseInt(id), isMounted);
    }
    // Initial state for create mode is handled after ref data loads
    return () => {
      isMounted = false;
    };
  }, [id, isEditMode]);

  // Load locations and **AUTO-SELECT FIRST LOCATION**
  useEffect(() => {
    let isMounted = true;
    if (
      formData.customer_id > 0 &&
      (!initialFormData || formData.customer_id !== initialFormData.customer_id)
    ) {
      fetchCustomerLocations(formData.customer_id, isMounted).then(
        (locations) => {
          if (isMounted && locations) {
            // Check if locations were fetched successfully
            // Auto-select first location if available
            setFormData((prev) => ({
              ...prev,
              location_id:
                locations.length > 0 ? locations[0].location_id : null,
            }));
          }
        }
      );
    } else if (formData.customer_id === 0) {
      setCustomerLocations([]);
      if (formData.location_id !== null) {
        setFormData((prev) => ({ ...prev, location_id: null }));
      }
    }
    return () => {
      isMounted = false;
    };
  }, [formData.customer_id, initialFormData]);

  // Monitor form changes
  useEffect(() => {
    if (initialFormData) {
      setIsFormChanged(
        JSON.stringify(formData) !== JSON.stringify(initialFormData)
      );
    }
  }, [formData, initialFormData]);

  // Fetch rental details function
  const fetchRentalDetails = async (rentalId: number, isMounted: boolean) => {
    try {
      const rental = await greenTargetApi.getRental(rentalId);
      if (!isMounted || !rental) {
        if (isMounted && !rental) throw new Error("Rental not found");
        return;
      }
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
        invoice_info: rental.invoice_info || null,
        pickup_destination: rental.pickup_destination || null,
        addon_count: parseInt(rental.addon_count) || 0,
      };
      setFormData(fetchedFormData);
      setInitialFormData(fetchedFormData);
      setError(null);
    } catch (err: any) {
      if (isMounted) setError(`Fetch error: ${err.message || "Unknown"}`);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  // Fetch customer locations function (return locations)
  const fetchCustomerLocations = async (
    customerId: number,
    isMounted: boolean
  ): Promise<Location[] | null> => {
    /* ... returns locations or null ... */
    if (!customerId || customerId <= 0) {
      if (isMounted) setCustomerLocations([]);
      return null;
    }
    try {
      const locationsData = await api.get(
        `/greentarget/api/locations?customer_id=${customerId}`
      );
      const locationsArray = Array.isArray(locationsData) ? locationsData : [];
      if (isMounted) setCustomerLocations(locationsArray);
      return locationsArray;
    } catch (err) {
      console.error("Error fetching locations:", err);
      if (isMounted) {
        setCustomerLocations([]);
        toast.error("Failed load locations.");
      }
      return null;
    }
  };

  // Input Handlers
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
    if (name === "date_placed") previousDateRef.current = null;
  }; // Reset ref on placement change
  const handleCustomerComboboxChange = (
    selectedId: string | string[] | null
  ) => {
    const newCustomerId =
      selectedId && typeof selectedId === "string" ? Number(selectedId) : 0;
    if (newCustomerId !== formData.customer_id) {
      setFormData((prev) => ({
        ...prev,
        customer_id: newCustomerId,
        location_id: null,
      }));
      setCustomerQuery("");
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
  const handlePickupDestinationChange = (destinationCode: string) => {
    setFormData((prev) => ({
      ...prev,
      pickup_destination: destinationCode || null,
    }));
  };

  // Navigation handlers
  const handleBackClick = () => {
    if (isFormChanged) setShowBackConfirmation(true);
    else navigate("/greentarget/rentals");
  };
  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/greentarget/rentals");
  };

  // Date/Dumpster helpers
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

  // **RESTORED Dumpster Availability Check Logic**
  const checkDumpsterAvailability = useCallback(() => {
    if (!formData.date_placed || !formData.tong_no || !dumpsterAvailability) {
      // Only return false if date and tong are selected but availability isn't loaded yet or failed
      if (formData.date_placed && formData.tong_no && !dumpsterAvailability)
        return false;
      // Otherwise, consider it valid until prerequisites are met
      return true;
    }

    // Edit mode with unchanged values is always valid
    if (
      isEditMode &&
      initialFormData &&
      formData.tong_no === initialFormData.tong_no &&
      formData.date_placed === initialFormData.date_placed &&
      formData.date_picked === initialFormData.date_picked
    ) {
      return true;
    }

    // If only changing pickup date in edit mode, allow it (backend handles deeper conflict)
    if (
      isEditMode &&
      initialFormData &&
      formData.tong_no === initialFormData.tong_no &&
      formData.date_placed === initialFormData.date_placed
    ) {
      return true;
    }

    // Find dumpster in available list first
    const availableDumpster = dumpsterAvailability.available.find(
      (d) => d.tong_no === formData.tong_no
    );

    if (availableDumpster) {
      // Check for conflict with next rental if pickup date is set
      if (formData.date_picked && availableDumpster.next_rental?.date) {
        const pickupDate = new Date(formData.date_picked);
        pickupDate.setHours(0, 0, 0, 0);
        const nextRentalStartDate = new Date(
          availableDumpster.next_rental.date
        );
        nextRentalStartDate.setHours(0, 0, 0, 0);
        // Allow pickup on the same day as next rental starts (transition day)
        if (pickupDate > nextRentalStartDate) {
          return false;
        } // Conflict only if pickup is after next rental starts
      }
      // Check for conflict if rental is ongoing (no pickup date)
      else if (!formData.date_picked && availableDumpster.next_rental?.date) {
        return false; // Ongoing conflicts with any future booking
      }
      return true; // Available and no conflict found
    }

    // If not in available, check upcoming (only valid if placement date is AFTER available_after)
    const upcomingDumpster = dumpsterAvailability.upcoming.find(
      (d) => d.tong_no === formData.tong_no
    );
    if (upcomingDumpster && upcomingDumpster.available_after) {
      const placementDate = new Date(formData.date_placed);
      placementDate.setHours(0, 0, 0, 0);
      const availableAfterDate = new Date(upcomingDumpster.available_after);
      availableAfterDate.setHours(0, 0, 0, 0);
      if (placementDate <= availableAfterDate) return false; // Cannot place on or before it's available

      // Also check next rental conflict for upcoming
      if (formData.date_picked && upcomingDumpster.next_rental?.date) {
        const pickupDate = new Date(formData.date_picked);
        pickupDate.setHours(0, 0, 0, 0);
        const nextRentalStartDate = new Date(upcomingDumpster.next_rental.date);
        nextRentalStartDate.setHours(0, 0, 0, 0);
        // Allow pickup on the same day as next rental starts (transition day)
        if (pickupDate > nextRentalStartDate) return false;
      } else if (!formData.date_picked && upcomingDumpster.next_rental?.date) {
        return false;
      }
      return true; // Upcoming and placement date is valid, no next conflict
    }

    // If not available or upcoming, check if it's the original dumpster in edit mode (allow modifications)
    if (
      isEditMode &&
      initialFormData &&
      formData.tong_no === initialFormData.tong_no
    ) {
      return true;
    }

    return false; // Not found or invalid state
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

  // Validation Function
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

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSaving(true);
    const payload: Omit<Rental, "customer_name" | "location_address" | "addon_count"> = {
      customer_id: Number(formData.customer_id),
      location_id: formData.location_id ? Number(formData.location_id) : null,
      tong_no: formData.tong_no,
      driver: formData.driver,
      date_placed: formData.date_placed,
      date_picked: formData.date_picked || null,
      remarks: formData.remarks || null,
      pickup_destination: formData.pickup_destination || null,
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
      let errorMsg = "An unexpected error occurred.";
      if (error?.message) {
        if (error.message.toLowerCase().includes("overlap"))
          errorMsg = "Error: Rental period overlaps with another booking.";
        else if (error.message.toLowerCase().includes("not available"))
          errorMsg = "Error: Dumpster not available for specified dates.";
        else errorMsg = `Error: ${error.message}`;
      }
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Handler
  const handleDelete = async () => {
    /* ... same as before ... */
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
  interface DumpsterOption extends SelectOption {
    status: string;
    info: Dumpster;
  } // Define type here
  const dumpsterOptions: DumpsterOption[] = [
    /* ... same as before ... */ ...(dumpsterAvailability?.available ?? []).map(
      (d) =>
        ({
          id: d.tong_no,
          name: d.tong_no,
          status: "available",
          info: d,
        } as DumpsterOption)
    ),
    ...(dumpsterAvailability?.upcoming ?? []).map(
      (d) =>
        ({
          id: d.tong_no,
          name: d.tong_no,
          status: "upcoming",
          info: d,
        } as DumpsterOption)
    ),
    ...(dumpsterAvailability?.unavailable ?? []).map(
      (d) =>
        ({
          id: d.tong_no,
          name: d.tong_no,
          status: "unavailable",
          info: d,
        } as DumpsterOption)
    ),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-default-200 dark:border-gray-700">
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <BackButton onClick={handleBackClick} />
              <div className="h-6 w-px bg-default-300 dark:bg-default-600"></div>
              <div>
                <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                  {isEditMode
                    ? `Edit Rental #${formData.rental_id}`
                    : "Create New Rental"}
                </h1>
                <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                  {isEditMode
                    ? `Update details for the rental placed on ${formatDateForInput(
                        initialFormData?.date_placed ?? null
                      )}.`
                    : "Fill in the details."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-x-3">
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
                form="rental-form"
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
          </div>
        </div>
        <form id="rental-form" onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* --- Customer & Location Section --- */}
            <div className="border-b border-default-200 dark:border-gray-700 pb-6">
              <h2 className="text-base font-semibold leading-7 text-default-900 dark:text-gray-100 mb-4">
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
                    }
                    onChange={handleCustomerComboboxChange}
                    options={customerOptions}
                    query={customerQuery}
                    setQuery={setCustomerQuery}
                    placeholder="Search or Select Customer..."
                    disabled={isEditMode}
                    required={true}
                    mode="single"
                  />
                  {!isEditMode && (
                    <button
                      type="button"
                      onClick={() => setIsNewCustomerModalOpen(true)}
                      className="mt-2 text-sm text-sky-600 dark:text-sky-400 hover:text-sky-800 flex items-center"
                    >
                      <IconPlus size={16} className="mr-1" /> Add New Customer
                    </button>
                  )}
                </div>
                {/* Location Listbox (Styled) */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="location_id-button"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
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
                            "relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm",
                            "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                            !formData.customer_id
                              ? "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                              : ""
                          )}
                        >
                          {/* Display Logic (condensed) */}{" "}
                          {(() => {
                            const l = customerLocations.find(
                              (loc) => loc.location_id === formData.location_id
                            );
                            const a = l?.address || "No Specific Location";
                            const p = l?.phone_number;
                            const cp = customers.find(
                              (c) => c.customer_id === formData.customer_id
                            )?.phone_number;
                            const s = p && p !== cp;
                            return (
                              <div className="flex flex-col">
                                <span className="block truncate font-medium">
                                  {a}
                                </span>
                                {s && (
                                  <span className="text-xs text-default-500 dark:text-gray-400 flex items-center mt-0.5">
                                    <IconPhone size={12} className="mr-1" />
                                    {p}
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
                              "absolute z-10 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                              "mt-1"
                            )}
                          >
                            {/* Options (condensed) */}
                            <ListboxOption
                              key="no"
                              value=""
                              className={({ active }) =>
                                clsx(
                                  "relative cursor-default select-none py-2 pl-3 pr-10",
                                  active
                                    ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                    : "text-gray-900 dark:text-gray-100"
                                )
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={clsx(
                                      "block truncate italic",
                                      selected ? "font-medium" : "font-normal",
                                      "text-gray-500 dark:text-gray-400"
                                    )}
                                  >
                                    No Specific Location
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                                      <IconCheck size={20} />
                                    </span>
                                  )}
                                </>
                              )}
                            </ListboxOption>
                            {customerLocations.map((l) => (
                              <ListboxOption
                                key={l.location_id}
                                value={l.location_id.toString()}
                                className={({ active }) =>
                                  clsx(
                                    "relative cursor-default select-none py-2 pl-3 pr-10",
                                    active
                                      ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                      : "text-gray-900 dark:text-gray-100"
                                  )
                                }
                              >
                                {({ selected }) => (
                                  <>
                                    {/* Display logic */}
                                    <div className="flex flex-col">
                                      <span
                                        className={clsx(
                                          "block truncate",
                                          selected
                                            ? "font-medium"
                                            : "font-normal"
                                        )}
                                      >
                                        {l.address}
                                      </span>
                                      {l.phone_number &&
                                        l.phone_number !==
                                          customers.find(
                                            (c) =>
                                              c.customer_id ===
                                              formData.customer_id
                                          )?.phone_number && (
                                          <span className="text-xs text-default-500 dark:text-gray-400 flex items-center mt-0.5">
                                            <IconPhone
                                              size={12}
                                              className="mr-1"
                                            />
                                            {l.phone_number}
                                          </span>
                                        )}
                                    </div>
                                    {selected && (
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                                        <IconCheck size={20} />
                                      </span>
                                    )}
                                  </>
                                )}
                              </ListboxOption>
                            ))}
                            {formData.customer_id > 0 && (
                              <ListboxOption
                                key="add"
                                value="add-new"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setIsNewLocationModalOpen(true);
                                }}
                                className={({ active }) =>
                                  clsx(
                                    "relative cursor-pointer select-none py-2 pl-3 pr-10 mt-1 pt-2 border-t border-default-200 dark:border-gray-600",
                                    active
                                      ? "bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400"
                                      : "text-sky-600 dark:text-sky-400"
                                  )
                                }
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
            <div className="border-b border-default-200 dark:border-gray-700 pb-6">
              <h2 className="text-base font-semibold leading-7 text-default-900 dark:text-gray-100 mb-4">
                Rental Details
              </h2>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                {/* Placement/Pickup Dates (condensed) */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="date_placed"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
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
                        "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                      )}
                    />
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label
                    htmlFor="date_picked"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
                  >
                    Pickup Date{" "}
                    <span className="text-xs text-default-500 dark:text-gray-400">(Optional)</span>
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
                        "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                      )}
                    />
                  </div>
                </div>
                {/* Dumpster Listbox (Styled - condensed) */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="tong_no-button"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
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
                            "relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm",
                            "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                            !formData.date_placed
                              ? "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
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
                              "absolute z-10 max-h-72 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                              "mt-1"
                            )}
                          >
                            {dumpsterOptions.length === 0 &&
                            formData.date_placed ? (
                              <div className="relative cursor-default select-none py-2 px-4 text-gray-500 dark:text-gray-400">
                                Loading...
                              </div>
                            ) : (
                              dumpsterOptions.map((option) => {
                                const d = option.info;
                                let i = (
                                  <IconCircleCheck
                                    size={16}
                                    className="mr-2 text-green-500 flex-shrink-0"
                                  />
                                );
                                let t = "";
                                let c = "text-xs ml-6";
                                if (option.status === "upcoming") {
                                  i = (
                                    <IconCircleDashed
                                      size={16}
                                      className="mr-2 text-amber-500 flex-shrink-0"
                                    />
                                  );
                                  c += " text-amber-600 dark:text-amber-400";
                                  t = `Available after ${formatDumpsterDate(
                                    d.available_after
                                  )}`;
                                  if (d.customer) t += ` (from ${d.customer})`;
                                } else if (option.status === "unavailable") {
                                  i = (
                                    <IconCircleX
                                      size={16}
                                      className="mr-2 text-rose-500 flex-shrink-0"
                                    />
                                  );
                                  c += " text-rose-600 dark:text-rose-400";
                                  t = d.reason || "Unavailable";
                                  if (d.customer) t += ` (with ${d.customer})`;
                                } else if (d.next_rental?.date) {
                                  c += " text-amber-600 dark:text-amber-400";
                                  t = `Available until ${formatDumpsterDate(
                                    d.available_until
                                  )}`;
                                  if (d.next_rental.customer)
                                    t += ` (next: ${
                                      d.next_rental.customer
                                    } on ${formatDumpsterDate(
                                      d.next_rental.date
                                    )})`;
                                } else if (d.is_transition_day) {
                                  c += " text-blue-600 dark:text-blue-400";
                                  t = `Transition Day (from ${
                                    d.transition_from?.customer_name ?? "prev"
                                  })`;
                                }
                                return (
                                  <ListboxOption
                                    key={option.id}
                                    className={({ active }) =>
                                      clsx(
                                        "relative cursor-default select-none py-2 pl-3 pr-10",
                                        active
                                          ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                          : "text-gray-900 dark:text-gray-100"
                                      )
                                    }
                                    value={option.id.toString()}
                                    disabled={option.status === "unavailable"}
                                  >
                                    {({ selected }) => (
                                      <>
                                        <div className="flex flex-col">
                                          <div className="flex items-center">
                                            {i}
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
                                          {t && <span className={c}>{t}</span>}
                                        </div>
                                        {selected && (
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                                            <IconCheck size={20} />
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
                    {!isValidSelection &&
                      formData.tong_no &&
                      formData.date_placed && (
                        <p className="mt-1 text-xs text-rose-600 flex items-start">
                          <IconCircleX
                            size={14}
                            className="mr-1 mt-[1px] flex-shrink-0"
                          />
                          <span>Unavailable for dates.</span>
                        </p>
                      )}
                  </div>
                </div>
                {/* Driver Listbox (Styled - condensed) */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="driver-button"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
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
                            "relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm",
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
                              "absolute z-10 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                              "mt-1"
                            )}
                          >
                            <ListboxOption
                              key="p"
                              value=""
                              disabled
                              className="text-gray-400 italic py-2 pl-3 pr-10 select-none"
                            >
                              Select Driver
                            </ListboxOption>
                            {driverOptions.map((o) => (
                              <ListboxOption
                                key={o.id}
                                className={({ active }) =>
                                  clsx(
                                    "relative cursor-default select-none py-2 pl-3 pr-10",
                                    active
                                      ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                      : "text-gray-900 dark:text-gray-100"
                                  )
                                }
                                value={o.name}
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
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
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
                </div>
                {/* Pickup Destination Listbox - shown when there's a pickup date */}
                {formData.date_picked && (
                  <div className="sm:col-span-3">
                    <label
                      htmlFor="pickup_destination-button"
                      className="block text-sm font-medium text-default-700 dark:text-gray-200"
                    >
                      Pickup Destination
                    </label>
                    <div className="mt-2">
                      <Listbox
                        value={formData.pickup_destination || ""}
                        onChange={handlePickupDestinationChange}
                        name="pickup_destination"
                      >
                        <div className="relative">
                          <HeadlessListboxButton
                            id="pickup_destination-button"
                            className={clsx(
                              "relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm",
                              "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            )}
                          >
                            <span className="block truncate">
                              {pickupDestinations.find(
                                (d) => d.code === formData.pickup_destination
                              )?.name || "Select destination..."}
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
                                "absolute z-10 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                                "mt-1"
                              )}
                            >
                              {pickupDestinations.map((dest) => (
                                <ListboxOption
                                  key={dest.id}
                                  className={({ active }) =>
                                    clsx(
                                      "relative cursor-default select-none py-2 pl-3 pr-10",
                                      active
                                        ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                        : "text-gray-900 dark:text-gray-100"
                                    )
                                  }
                                  value={dest.code}
                                >
                                  {({ selected }) => (
                                    <>
                                      <span
                                        className={clsx(
                                          "block truncate",
                                          selected ? "font-medium" : "font-normal"
                                        )}
                                      >
                                        {dest.name}
                                        {dest.is_default && (
                                          <span className="ml-2 text-xs text-default-400">
                                            (default)
                                          </span>
                                        )}
                                      </span>
                                      {selected && (
                                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
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
                  </div>
                )}
              </div>
            </div>
            {/* --- Add-ons Section --- */}
            {isEditMode && formData.rental_id && (
              <div className="border-b border-default-200 dark:border-gray-700 pb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold leading-7 text-default-900 dark:text-gray-100">
                    Add-ons
                  </h2>
                  <Button
                    type="button"
                    variant="outline"
                    color="sky"
                    onClick={() => setIsAddonModalOpen(true)}
                    icon={IconPlus}
                  >
                    Manage Add-ons
                    {(formData.addon_count ?? 0) > 0 && (
                      <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 rounded-full">
                        {formData.addon_count}
                      </span>
                    )}
                  </Button>
                </div>
                <p className="text-sm text-default-500 dark:text-gray-400">
                  {(formData.addon_count ?? 0) === 0
                    ? "No add-ons for this rental yet. Click 'Manage Add-ons' to add manual paycodes."
                    : `${formData.addon_count} add-on${
                        (formData.addon_count ?? 0) > 1 ? "s" : ""
                      } attached to this rental.`}
                </p>
              </div>
            )}
            {/* --- Remarks Section --- */}
            <div className="border-b border-default-200 dark:border-gray-700 pb-6">
              <label
                htmlFor="remarks"
                className="block text-sm font-medium leading-6 text-default-700 dark:text-gray-200"
              >
                Remarks{" "}
                <span className="text-xs text-default-500 dark:text-gray-400">(Optional)</span>
              </label>
              <div className="mt-2">
                <textarea
                  id="remarks"
                  name="remarks"
                  rows={3}
                  className={clsx(
                    "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                    "placeholder-default-400"
                  )}
                  placeholder="Add notes..."
                  value={formData.remarks ?? ""}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            {/* --- Associated Invoice Section --- */}
            {isEditMode && formData.invoice_info && (
              <div className="border-b border-default-200 dark:border-gray-700 pb-6">
                <h2 className="text-base font-semibold leading-7 text-default-900 dark:text-gray-100 mb-4">
                  Invoice Information
                </h2>
                <AssociatedInvoiceDisplay
                  invoiceInfo={formData.invoice_info}
                  onViewInvoice={(invoiceId) => {
                    window.open(`/greentarget/invoices/${invoiceId}`, "_blank");
                  }}
                />
              </div>
            )}
          </div>
        </form>
      </div>
      {/* Modals & Dialogs */}
      <LocationFormModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        isCreatingCustomer={true}
        onSubmit={async (data) => {
          setIsNewCustomerModalOpen(false);
          try {
            if (data.customer_name) {
              const r = await greenTargetApi.createCustomer({
                name: data.customer_name,
                phone_number: data.phone_number,
              });
              if (r?.customer) {
                const n = r.customer.customer_id;
                toast.success("Customer created.");
                const d = await greenTargetApi.getCustomers();
                setCustomers(d || []);
                setFormData((p) => ({
                  ...p,
                  customer_id: n,
                  location_id: null,
                }));
                setCustomerQuery("");
                if (data.address) {
                  await greenTargetApi.createLocation({
                    customer_id: n,
                    address: data.address,
                    phone_number: data.phone_number,
                  });
                  await fetchCustomerLocations(n, true);
                }
              } else {
                throw new Error("Failed create customer.");
              }
            }
          } catch (e) {
            console.error(e);
            toast.error("Failed create customer.");
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
          setIsNewLocationModalOpen(false);
          try {
            if (data.address && formData.customer_id) {
              const r = await greenTargetApi.createLocation({
                customer_id: formData.customer_id,
                address: data.address,
                phone_number: data.phone_number,
              });
              if (r?.location) {
                toast.success("Location added.");
                // Set the form to use the newly added location directly
                setFormData((p) => ({
                  ...p,
                  location_id: r.location.location_id,
                }));
                // Still fetch locations to update the dropdown list
                await fetchCustomerLocations(formData.customer_id, true);
              } else {
                throw new Error("Failed add location.");
              }
            }
          } catch (e) {
            console.error(e);
            toast.error("Failed add location.");
          }
        }}
      />
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Rental"
        message={`Delete Rental #${formData.rental_id}?`}
        confirmButtonText={isDeleting ? "Deleting..." : "Delete"}
        variant="danger"
      />
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Leave without saving?"
        confirmButtonText="Discard"
        variant="danger"
      />
      {formData.rental_id && (
        <RentalAddonModal
          isOpen={isAddonModalOpen}
          onClose={() => setIsAddonModalOpen(false)}
          rentalId={formData.rental_id}
          onAddonsChanged={() => {
            // Refresh the addon count
            greenTargetApi.getRental(formData.rental_id!)
              .then((rental) => {
                setFormData((prev) => ({
                  ...prev,
                  addon_count: parseInt(rental.addon_count) || 0,
                }));
              })
              .catch((error) => {
                console.error("Error refreshing addon count:", error);
              });
          }}
        />
      )}
    </div>
  );
};

export default RentalFormPage;

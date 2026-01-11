// src/pages/GreenTarget/Rentals/RentalListPage.tsx
import { useState, useEffect, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconFileInvoice,
  IconReceipt,
  IconSquareCheckFilled,
  IconSquare,
  IconTrash,
  IconMapPin,
  IconTruck,
  IconPhone,
  IconX,
  IconChevronDown,
} from "@tabler/icons-react";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import toast from "react-hot-toast";

interface PickupDestination {
  id: number;
  code: string;
  name: string;
  is_default: boolean;
}

// Define the Rental interface
interface Rental {
  rental_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone_number: string | null;
  location_id: number | null;
  location_address: string | null;
  location_phone_number: string | null;
  tong_no: string;
  dumpster_status: string;
  driver: string;
  date_placed: string;
  date_picked: string | null;
  remarks: string | null;
  invoice_info?: {
    invoice_id: number;
    invoice_number?: string;
    status: string;
    amount?: number;
  } | null;
  pickup_destination?: string | null;
  pickup_destination_name?: string | null;
  addon_count?: number;
}

const RentalCard = ({
  rental,
  onGenerateDeliveryOrder,
  onCreateInvoice,
  onDeleteRental,
  onPickupRental,
}: {
  rental: Rental;
  onGenerateDeliveryOrder: (rental: Rental) => void;
  onCreateInvoice: (rental: Rental) => void;
  onDeleteRental: (rental: Rental) => void;
  onPickupRental: (rental: Rental) => void;
}) => {
  const navigate = useNavigate();
  const [isCardHovered, setIsCardHovered] = useState(false);

  const handleClick = () => {
    navigate(`/greentarget/rentals/${rental.rental_id}`);
  };

  // Format date for display (short format)
  const formatDateShort = (dateString: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  // Calculate rental duration in days
  const calculateDuration = () => {
    if (!rental.date_placed) return 0;
    const startDate = new Date(rental.date_placed);
    const endDate = rental.date_picked ? new Date(rental.date_picked) : new Date();
    const differenceInTime = endDate.getTime() - startDate.getTime();
    return Math.max(1, Math.ceil(differenceInTime / (1000 * 3600 * 24)));
  };

  const isActive = () => {
    if (!rental.date_picked) return true;
    const todayStr = new Date().toISOString().split("T")[0];
    const pickupDateStr = rental.date_picked.split("T")[0];
    return pickupDateStr > todayStr;
  };

  const activeStatus = isActive();
  const duration = calculateDuration();
  const hasInvoice = rental?.invoice_info?.status === "active" ||
    rental?.invoice_info?.status === "overdue" ||
    rental?.invoice_info?.status === "paid";

  return (
    <div
      className={`relative text-left rounded-lg overflow-hidden transition-all duration-200 cursor-pointer bg-white dark:bg-gray-800 border ${
        isCardHovered ? "shadow-md" : "shadow-sm"
      } ${activeStatus ? "border-emerald-300 dark:border-emerald-600" : "border-default-200 dark:border-gray-700"}`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Compact Header */}
      <div className="px-4 py-2 border-b border-default-100 dark:border-gray-700 bg-default-50/50 dark:bg-gray-900/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-default-700 dark:text-gray-200">
              #{rental.rental_id}
            </span>
            <span className="text-default-300 dark:text-gray-600">•</span>
            <span className="font-medium text-default-800 dark:text-gray-100 text-base">
              Tong {rental.tong_no}
            </span>
          </div>
          <span
            className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${
              activeStatus
                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                : "bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-400"
            }`}
          >
            {activeStatus ? "Active" : "Completed"}
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Customer Info */}
        <div className="mb-3">
          <h3
            className="text-base font-semibold text-default-900 dark:text-gray-100 truncate cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            title={rental.customer_name}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/greentarget/customers/${rental.customer_id}`);
            }}
          >
            {rental.customer_name}
          </h3>
          {rental.location_address && (
            <p
              className="text-sm text-default-500 dark:text-gray-400 mt-1 truncate flex items-center gap-1.5"
              title={rental.location_address}
            >
              <IconMapPin size={14} className="flex-shrink-0" />
              {rental.location_address}
            </p>
          )}
          {(rental.customer_phone_number || rental.location_phone_number) && (
            <p className="text-sm text-default-500 dark:text-gray-400 mt-1 truncate flex items-center gap-1.5">
              <IconPhone size={14} className="flex-shrink-0" />
              {rental.customer_phone_number || rental.location_phone_number}
            </p>
          )}
        </div>

        {/* Info Row - Uniform boxes */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center p-2.5 bg-default-50 dark:bg-gray-900/50 rounded-md border border-default-200 dark:border-gray-700">
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">Driver</p>
            <p className="text-sm font-medium text-default-800 dark:text-gray-200 truncate" title={rental.driver}>
              {rental.driver.split(" ")[0]}
            </p>
          </div>
          <div className="text-center p-2.5 bg-default-50 dark:bg-gray-900/50 rounded-md border border-default-200 dark:border-gray-700">
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">Placed</p>
            <p className="text-sm font-medium text-default-800 dark:text-gray-200">
              {formatDateShort(rental.date_placed)}
            </p>
          </div>
          <div className="text-center p-2.5 bg-default-50 dark:bg-gray-900/50 rounded-md border border-default-200 dark:border-gray-700">
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">Pickup</p>
            <p className={`text-sm font-medium ${!rental.date_picked ? "text-amber-600 dark:text-amber-400" : "text-default-800 dark:text-gray-200"}`}>
              {formatDateShort(rental.date_picked)}
            </p>
          </div>
          <div className={`text-center p-2.5 rounded-md border ${activeStatus ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-default-50 dark:bg-gray-900/50 border-default-200 dark:border-gray-700"}`}>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">Days</p>
            <p className={`text-sm font-medium ${activeStatus ? "text-emerald-700 dark:text-emerald-400" : "text-default-800 dark:text-gray-200"}`}>
              {duration}
            </p>
          </div>
        </div>

        {/* Remarks - compact */}
        {rental.remarks && (
          <div className="mb-3 px-3 py-2 bg-default-50 dark:bg-gray-900/50 rounded-md">
            <p className="text-sm text-default-600 dark:text-gray-400 truncate" title={rental.remarks}>
              <span className="text-default-400 dark:text-gray-500">Note:</span> {rental.remarks}
            </p>
          </div>
        )}

        {/* Bottom Row: Destination, Invoice on left | Actions on right */}
        <div className={`flex items-center justify-between pt-2 border-t border-default-100 dark:border-gray-700 transition-opacity duration-200 ${isCardHovered ? "opacity-100" : "opacity-60"}`}>
          {/* Left: Destination & Invoice */}
          <div className="flex items-center gap-1.5">
            {rental.pickup_destination && (
              <div className="flex items-center gap-1 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded">
                <IconTruck size={14} className="text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  {rental.pickup_destination_name || rental.pickup_destination}
                </span>
              </div>
            )}
            {(rental.addon_count ?? 0) > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 dark:bg-amber-900/20 rounded">
                <IconPlus size={14} className="text-amber-500 dark:text-amber-400 flex-shrink-0" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {rental.addon_count}
                </span>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasInvoice && rental.invoice_info) {
                  navigate(`/greentarget/invoices/${rental.invoice_info.invoice_id}`);
                } else {
                  onCreateInvoice(rental);
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                hasInvoice
                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                  : "bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-400 hover:bg-default-200 dark:hover:bg-gray-600"
              }`}
            >
              <IconFileInvoice size={14} className="flex-shrink-0" />
              <span className="text-xs font-medium">
                {hasInvoice && rental.invoice_info ? (rental.invoice_info.invoice_number || `#${rental.invoice_info.invoice_id}`) : "No Invoice"}
              </span>
            </button>
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-1">
            {activeStatus && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPickupRental(rental);
                }}
                className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded transition-colors"
                title="Mark as Picked Up"
              >
                <IconTruck size={16} stroke={1.5} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGenerateDeliveryOrder(rental);
              }}
              className="p-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded transition-colors"
              title="Delivery Order"
            >
              <IconReceipt size={16} stroke={1.5} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRental(rental);
              }}
              className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-500 dark:text-rose-400 rounded transition-colors"
              title="Delete"
            >
              <IconTrash size={16} stroke={1.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RentalListPage = () => {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeOnly, setActiveOnly] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [rentalToDelete, setRentalToDelete] = useState<Rental | null>(null);
  const [isPickupDialogOpen, setIsPickupDialogOpen] = useState(false);
  const [rentalToPickup, setRentalToPickup] = useState<Rental | null>(null);
  const [pickupDestinations, setPickupDestinations] = useState<PickupDestination[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [isPickingUp, setIsPickingUp] = useState(false);
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchRentals();
    fetchPickupDestinations();
  }, []);

  const fetchPickupDestinations = async () => {
    try {
      const data = await greenTargetApi.getPickupDestinations();
      setPickupDestinations(data);
      // Set default destination
      const defaultDest = data.find((d: PickupDestination) => d.is_default);
      if (defaultDest) {
        setSelectedDestination(defaultDest.code);
      }
    } catch (error) {
      console.error("Error fetching pickup destinations:", error);
    }
  };

  const fetchRentals = async () => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getRentals();
      setRentals(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch rentals. Please try again later.");
      console.error("Error fetching rentals:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDeliveryOrder = (rental: Rental) => {
    navigate(`/greentarget/rentals/${rental.rental_id}/delivery-order`, {
      state: { rentalData: rental }, // Pass rental data to avoid extra API call
    });
  };

  const handleCreateInvoice = (rental: Rental) => {
    // Redirect to invoice creation page with rental ID
    navigate(`/greentarget/invoices/new`, {
      state: {
        rental_id: rental.rental_id,
        customer_id: rental.customer_id,
        customer_name: rental.customer_name,
        driver: rental.driver,
        location_address: rental.location_address,
        tong_no: rental.tong_no,
        date_placed: rental.date_placed,
        date_picked: rental.date_picked,
      },
    });
  };

  const handleDeleteRental = (rental: Rental) => {
    setRentalToDelete(rental);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteRental = async () => {
    if (!rentalToDelete) return;

    try {
      // Get the response from the API call
      const response = await greenTargetApi.deleteRental(
        rentalToDelete.rental_id
      );

      // Check if the response contains an error message
      if (
        response.error ||
        (response.message && response.message.includes("Cannot delete"))
      ) {
        // Show error toast with the server's message
        toast.error(
          response.message || "Cannot delete rental: unknown error occurred"
        );
      } else {
        // Only show success and update state if there's no error
        toast.success("Rental deleted successfully");

        // Remove deleted rental from state
        setRentals(
          rentals.filter((r) => r.rental_id !== rentalToDelete.rental_id)
        );
      }
    } catch (error: any) {
      // This will catch network errors or other exceptions
      if (error.message && error.message.includes("associated invoices")) {
        toast.error("Cannot delete rental: it has associated invoices");
      } else {
        toast.error("Failed to delete rental");
        console.error("Error deleting rental:", error);
      }
    } finally {
      setIsDeleteDialogOpen(false);
      setRentalToDelete(null);
    }
  };

  const handlePickupRental = (rental: Rental) => {
    setRentalToPickup(rental);
    // Reset to default destination when opening dialog
    const defaultDest = pickupDestinations.find((d) => d.is_default);
    setSelectedDestination(defaultDest?.code || pickupDestinations[0]?.code || "");
    setIsPickupDialogOpen(true);
  };

  const confirmPickupRental = async () => {
    if (!rentalToPickup) return;

    // Require destination selection
    if (!selectedDestination) {
      toast.error("Please select a pickup destination");
      return;
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Get placement date from the rental
    const placementDate = new Date(rentalToPickup.date_placed);
    const todayDate = new Date(today);

    // Validate: ensure today is not before the placement date
    if (todayDate < placementDate) {
      toast.error("Pickup date cannot be earlier than placement date");
      setIsPickupDialogOpen(false);
      setRentalToPickup(null);
      return;
    }

    setIsPickingUp(true);
    try {
      // Update the rental with today as pickup date and destination
      await greenTargetApi.updateRental(rentalToPickup.rental_id, {
        date_picked: today,
        pickup_destination: selectedDestination,
      });

      toast.success("Rental marked as picked up");

      // Update the rental in the local state to reflect changes
      setRentals(
        rentals.map((r) =>
          r.rental_id === rentalToPickup.rental_id
            ? { ...r, date_picked: today, pickup_destination: selectedDestination }
            : r
        )
      );
    } catch (error) {
      console.error("Error updating rental:", error);
      toast.error("Failed to mark rental as picked up");
    } finally {
      setIsPickingUp(false);
      setIsPickupDialogOpen(false);
      setRentalToPickup(null);
    }
  };

  const filteredRentals = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];

    return rentals.filter((rental) => {
      // Filter by search term (customer name, location, driver or dumpster number)
      const matchesSearch =
        rental.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rental.location_address &&
          rental.location_address
            .toLowerCase()
            .includes(searchTerm.toLowerCase())) ||
        rental.driver.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rental.tong_no.toLowerCase().includes(searchTerm.toLowerCase());

      // Filter by active status - consider rentals with future pickup dates as active
      const isRentalActive =
        !rental.date_picked || rental.date_picked.split("T")[0] > todayStr;

      const matchesStatus = activeOnly ? isRentalActive : true;

      return matchesSearch && matchesStatus;
    });
  }, [rentals, searchTerm, activeOnly]);

  const totalPages = Math.ceil(filteredRentals.length / ITEMS_PER_PAGE);

  const paginatedRentals = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRentals.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRentals, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeOnly]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const renderPaginationButtons = () => {
    const buttons = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
              i === currentPage
                ? "border border-default-200 dark:border-gray-600 font-semibold"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }
    } else {
      // Simplified pagination for brevity - same pattern as other pages
      // First page
      buttons.push(
        <button
          key={1}
          onClick={() => handlePageChange(1)}
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
            1 === currentPage
              ? "border border-default-200 dark:border-gray-600 font-semibold"
              : "font-medium"
          }`}
        >
          1
        </button>
      );

      // Show ellipsis if needed
      if (currentPage > 3) {
        buttons.push(
          <div key="ellipsis1" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
              i === currentPage
                ? "border border-default-200 dark:border-gray-600 font-semibold"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }

      // Second ellipsis if needed
      if (currentPage < totalPages - 2) {
        buttons.push(
          <div key="ellipsis2" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Last page
      if (totalPages > 1) {
        buttons.push(
          <button
            key={totalPages}
            onClick={() => handlePageChange(totalPages)}
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
              totalPages === currentPage
                ? "border border-default-200 dark:border-gray-600 font-semibold"
                : "font-medium"
            }`}
          >
            {totalPages}
          </button>
        );
      }
    }

    return buttons;
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-default-700 dark:text-gray-200 font-bold truncate overflow-hidden overflow-ellipsis max-w-[300px]">
          Rentals ({filteredRentals.length})
        </h1>
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-end ml-auto">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveOnly(!activeOnly)}
              className="p-2 rounded-full transition-opacity duration-200 hover:bg-default-100 dark:hover:bg-gray-700 dark:bg-gray-800 active:bg-default-200 flex items-center"
            >
              {activeOnly ? (
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
              <span className="ml-2 font-medium">Active Rentals Only</span>
            </button>
          </div>
          <div className="relative w-full sm:w-64">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
              size={22}
            />
            <input
              type="text"
              placeholder="Search"
              className="w-full pl-11 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:border-default-500 dark:focus:border-gray-500 rounded-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex">
            <Button
              onClick={() => navigate("/greentarget/rentals/new")}
              icon={IconPlus}
              variant="outline"
              className="w-full sm:w-auto"
            >
              New Rental
            </Button>
          </div>
        </div>
      </div>

      {filteredRentals.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-default-500 dark:text-gray-400">No rentals found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {paginatedRentals.map((rental) => (
            <RentalCard
              key={rental.rental_id}
              rental={rental}
              onGenerateDeliveryOrder={handleGenerateDeliveryOrder}
              onCreateInvoice={handleCreateInvoice}
              onDeleteRental={handleDeleteRental}
              onPickupRental={handlePickupRental}
            />
          ))}
        </div>
      )}

      {filteredRentals.length > 0 && (
        <div className="mt-6 flex justify-between items-center text-default-700 dark:text-gray-200">
          <button
            className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 dark:hover:bg-gray-700 dark:bg-gray-800 active:bg-default-200"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <IconChevronLeft className="w-5 h-5 mr-2" /> Previous
          </button>
          <div className="flex space-x-2">{renderPaginationButtons()}</div>
          <button
            className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 dark:hover:bg-gray-700 dark:bg-gray-800 active:bg-default-200"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <IconChevronRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={confirmDeleteRental}
        title="Delete Rental"
        message={`Are you sure you want to delete the rental for ${
          rentalToDelete?.customer_name || "this customer"
        }? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
      {/* Pickup Modal with Destination Selection */}
      <Transition appear show={isPickupDialogOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsPickupDialogOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title className="text-lg font-semibold text-default-900 dark:text-gray-100">
                      Mark Rental as Picked Up
                    </Dialog.Title>
                    <button
                      onClick={() => setIsPickupDialogOpen(false)}
                      className="text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                    >
                      <IconX size={20} />
                    </button>
                  </div>

                  <p className="text-sm text-default-600 dark:text-gray-400 mb-4">
                    Mark the rental for{" "}
                    <span className="font-medium text-default-800 dark:text-gray-200">
                      {rentalToPickup?.customer_name || "this customer"}
                    </span>{" "}
                    as picked up today.
                  </p>

                  {/* Destination Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                      Pickup Destination <span className="text-rose-500">*</span>
                    </label>
                    <Listbox value={selectedDestination} onChange={setSelectedDestination}>
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white dark:bg-gray-700 py-2.5 pl-3 pr-10 text-left border border-default-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400">
                          <span className="block truncate text-default-800 dark:text-gray-200">
                            {pickupDestinations.find((d) => d.code === selectedDestination)?.name ||
                              "Select destination..."}
                          </span>
                          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <IconChevronDown
                              size={18}
                              className="text-default-400 dark:text-gray-500"
                            />
                          </span>
                        </Listbox.Button>
                        <Transition
                          as={Fragment}
                          leave="transition ease-in duration-100"
                          leaveFrom="opacity-100"
                          leaveTo="opacity-0"
                        >
                          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-700 py-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none">
                            {pickupDestinations.map((dest) => (
                              <Listbox.Option
                                key={dest.id}
                                value={dest.code}
                                className={({ active }) =>
                                  `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                    active
                                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100"
                                      : "text-default-800 dark:text-gray-200"
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
                                      {dest.name}
                                      {dest.is_default && (
                                        <span className="ml-2 text-xs text-default-400 dark:text-gray-500">
                                          (Default)
                                        </span>
                                      )}
                                    </span>
                                    {selected && (
                                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-amber-600 dark:text-amber-400">
                                        <IconMapPin size={16} />
                                      </span>
                                    )}
                                  </>
                                )}
                              </Listbox.Option>
                            ))}
                          </Listbox.Options>
                        </Transition>
                      </div>
                    </Listbox>
                  </div>

                  <div className="flex justify-end gap-2 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setIsPickupDialogOpen(false)}
                      disabled={isPickingUp}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="filled"
                      color="amber"
                      onClick={confirmPickupRental}
                      disabled={isPickingUp || !selectedDestination}
                    >
                      {isPickingUp ? "Processing..." : "Confirm Pickup"}
                    </Button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default RentalListPage;

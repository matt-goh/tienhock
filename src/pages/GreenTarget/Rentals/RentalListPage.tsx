// src/pages/GreenTarget/Rentals/RentalListPage.tsx
import { useState, useEffect, useMemo } from "react";
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
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import toast from "react-hot-toast";

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
    status: string;
  } | null;
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

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Not set";
    const date = new Date(dateString);
    // Use DD/MM/YYYY format
    return `${date.getDate().toString().padStart(2, "0")}/${(
      date.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${date.getFullYear()}`;
  };

  // Calculate rental duration in days
  const calculateDuration = () => {
    if (!rental.date_placed) return "N/A";

    const startDate = new Date(rental.date_placed);
    const endDate = rental.date_picked
      ? new Date(rental.date_picked)
      : new Date();

    const differenceInTime = endDate.getTime() - startDate.getTime();
    const differenceInDays = Math.ceil(differenceInTime / (1000 * 3600 * 24));
    
    // Ensure minimum of 1 day (same day placement and pickup should count as 1 day)
    const displayDays = Math.max(1, differenceInDays);

    // Return different text for rentals with and without pickup dates
    if (!rental.date_picked) {
      return `${displayDays} day${
        displayDays !== 1 ? "s" : ""
      } (ongoing)`;
    } else {
      return `${displayDays} day${displayDays !== 1 ? "s" : ""}`;
    }
  };

  const isActive = () => {
    if (!rental.date_picked) return true;

    // Convert dates to YYYY-MM-DD format for reliable comparison
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const pickupDateStr = rental.date_picked.split("T")[0]; // Get just the date part

    // If pickup date is today or in the past, consider it completed
    return pickupDateStr > todayStr;
  };

  const activeStatus = isActive();

  return (
    <div
      className={`relative border text-left rounded-lg overflow-hidden transition-all duration-200 cursor-pointer ${
        isCardHovered ? "shadow-md" : "shadow-sm"
      } ${activeStatus ? "border-green-400" : "border-default-200"}`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Status banner */}
      <div
        className={`w-full py-1.5 px-4 text-sm font-medium text-white ${
          activeStatus ? "bg-green-500" : "bg-default-500"
        }`}
      >
        <div className="flex justify-between items-center">
          <span>Rental #{rental.rental_id}</span>
          <span className="text-xs py-0.5 px-2 bg-white/20 rounded-full">
            {activeStatus ? "Ongoing" : "Completed"}
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Customer section */}
        <div className="mb-3 border-b pb-3">
          <div className="flex justify-between items-start w-full">
            <div className="w-full">
              <div className="w-full">
                <h3
                  className="font-semibold text-default-900 truncate cursor-pointer hover:underline w-fit"
                  title={rental.customer_name}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/greentarget/customers/${rental.customer_id}`);
                  }}
                >
                  {rental.customer_name}
                </h3>
                {(rental.customer_phone_number ||
                  rental.location_phone_number) && (
                  <p
                    className="text-sm text-default-600 mt-[3px] truncate w-full"
                    title={
                      rental.customer_phone_number !==
                        rental.location_phone_number &&
                      rental.customer_phone_number &&
                      rental.location_phone_number
                        ? `${rental.customer_phone_number}, ${rental.location_phone_number}`
                        : rental.customer_phone_number ??
                          rental.location_phone_number ??
                          undefined
                    }
                  >
                    <IconPhone
                      size={14}
                      className="inline mr-1 mt-0.5 align-top flex-shrink-0"
                    />
                    {rental.customer_phone_number !==
                      rental.location_phone_number &&
                    rental.customer_phone_number &&
                    rental.location_phone_number
                      ? `${rental.customer_phone_number}, ${rental.location_phone_number}`
                      : rental.customer_phone_number ||
                        rental.location_phone_number}
                  </p>
                )}
              </div>
              {rental.location_address && (
                <p
                  className="text-sm text-default-600 mt-0.5 truncate"
                  title={rental.location_address}
                >
                  <IconMapPin
                    size={14}
                    className="inline mr-1 mt-0.5 align-top flex-shrink-0"
                  />
                  {rental.location_address}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Dumpster</p>
            <p className="font-medium">{rental.tong_no}</p>
          </div>
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Driver</p>
            <p className="font-medium truncate" title={rental.driver}>
              {rental.driver}
            </p>
          </div>
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Duration</p>
            <p className="font-medium">{calculateDuration()}</p>
          </div>
          <div
            className={`p-2 border border-default-100 rounded-md ${
              activeStatus ? "bg-green-50" : "bg-default-50"
            }`}
          >
            <p className="text-xs text-default-500 mb-1">Status</p>
            <p
              className={`font-medium ${
                activeStatus ? "text-green-700" : "text-default-700"
              }`}
            >
              {activeStatus ? "Active" : "Completed"}
            </p>
          </div>
        </div>

        {/* Remarks section - only show if there are remarks */}
        {rental.remarks && (
          <div className="mb-4 bg-default-50/50 border border-default-100 rounded-md p-2">
            <p className="text-xs text-default-500 mb-0.5">Remarks</p>
            <p
              className="text-xs text-default-700 truncate"
              title={rental.remarks}
            >
              {rental.remarks}
            </p>
          </div>
        )}

        {/* Dates section */}
        <div className="flex justify-end space-x-4 mb-4">
          <div>
            <p className="text-xs text-default-500">Placement Date</p>
            <p className="font-medium text-default-900">
              {formatDate(rental.date_placed)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-default-500">Pickup Date</p>
            <p
              className={`font-medium ${
                !rental.date_picked ? "text-amber-600" : "text-default-900"
              }`}
            >
              {formatDate(rental.date_picked)}
            </p>
          </div>
        </div>

        {/* Action buttons - semi-visible always, fully visible on hover */}
        <div
          className={`flex justify-end space-x-2 mt-2 transition-opacity duration-200 ${
            isCardHovered ? "opacity-100" : "opacity-70"
          }`}
        >
          {/* Add new Pickup button only for active rentals */}
          {isActive() && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPickupRental(rental);
              }}
              className="p-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-full transition-colors"
              title="Mark as Picked Up"
            >
              <IconTruck size={18} stroke={1.5} />
            </button>
          )}

          {/* Show "View Invoice" or "Create Invoice" based on invoice status */}
          {rental?.invoice_info?.status === "active" ||
          rental?.invoice_info?.status === "overdue" ||
          rental?.invoice_info?.status === "paid" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Navigate to the existing invoice
                if (rental.invoice_info) {
                  navigate(
                    `/greentarget/invoices/${rental.invoice_info.invoice_id}`
                  );
                }
              }}
              className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full transition-colors"
              title="View Invoice"
            >
              <IconFileInvoice size={18} stroke={1.5} />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateInvoice(rental);
              }}
              className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full transition-colors"
              title="Create Invoice"
            >
              <IconFileInvoice size={18} stroke={1.5} />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerateDeliveryOrder(rental);
            }}
            className="p-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-full transition-colors"
            title="Generate Delivery Order"
          >
            <IconReceipt size={18} stroke={1.5} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRental(rental);
            }}
            className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-full transition-colors"
            title="Delete Rental"
          >
            <IconTrash size={18} stroke={1.5} />
          </button>
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
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchRentals();
  }, []);

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
    setIsPickupDialogOpen(true);
  };

  const confirmPickupRental = async () => {
    if (!rentalToPickup) return;

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

    try {
      // Update the rental with today as pickup date
      await greenTargetApi.updateRental(rentalToPickup.rental_id, {
        date_picked: today,
      });

      toast.success("Rental marked as picked up");

      // Update the rental in the local state to reflect changes
      setRentals(
        rentals.map((r) =>
          r.rental_id === rentalToPickup.rental_id
            ? { ...r, date_picked: today }
            : r
        )
      );
    } catch (error) {
      console.error("Error updating rental:", error);
      toast.error("Failed to mark rental as picked up");
    } finally {
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
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
              i === currentPage
                ? "border border-default-200 font-semibold"
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
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
            1 === currentPage
              ? "border border-default-200 font-semibold"
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
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
              i === currentPage
                ? "border border-default-200 font-semibold"
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
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 active:bg-default-200 ${
              totalPages === currentPage
                ? "border border-default-200 font-semibold"
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-default-700 font-bold truncate overflow-hidden overflow-ellipsis max-w-[300px]">
          Rentals ({filteredRentals.length})
        </h1>
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-end ml-auto">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveOnly(!activeOnly)}
              className="p-2 rounded-full transition-opacity duration-200 hover:bg-default-100 active:bg-default-200 flex items-center"
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
              className="w-full pl-11 py-2 border focus:border-default-500 rounded-full"
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
          <p className="text-default-500">No rentals found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        <div className="mt-6 flex justify-between items-center text-default-700">
          <button
            className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 active:bg-default-200"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <IconChevronLeft className="w-5 h-5 mr-2" /> Previous
          </button>
          <div className="flex space-x-2">{renderPaginationButtons()}</div>
          <button
            className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 active:bg-default-200"
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
      <ConfirmationDialog
        isOpen={isPickupDialogOpen}
        onClose={() => setIsPickupDialogOpen(false)}
        onConfirm={confirmPickupRental}
        title="Mark Rental as Picked Up"
        message={`Are you sure you want to mark this rental for ${
          rentalToPickup?.customer_name || "this customer"
        } as picked up today? This will set today's date as the pickup date.`}
        confirmButtonText="Confirm Pickup"
        variant="default"
      />
    </div>
  );
};

export default RentalListPage;

// src/pages/GreenTarget/Rentals/RentalListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconFileInvoice,
  IconReceipt,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import Button from "../../../components/Button";
import { api } from "../../../routes/utils/api";
import LoadingSpinner from "../../../components/LoadingSpinner";

// Define the Rental interface
interface Rental {
  rental_id: number;
  customer_id: number;
  customer_name: string; // Joined from customers table
  location_id: number | null;
  location_address: string | null; // Joined from locations table
  tong_no: string;
  dumpster_status: string; // Joined from dumpsters table
  driver: string;
  date_placed: string;
  date_picked: string | null;
  remarks: string | null;
}

const RentalCard = ({
  rental,
  onGenerateDeliveryOrder,
  onCreateInvoice,
}: {
  rental: Rental;
  onGenerateDeliveryOrder: (rental: Rental) => void;
  onCreateInvoice: (rental: Rental) => void;
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
    return date.toLocaleDateString();
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

    return `${differenceInDays} day${differenceInDays !== 1 ? "s" : ""}`;
  };

  const isActive = !rental.date_picked;

  return (
    <div
      className={`relative border text-left rounded-lg p-4 transition-all duration-200 cursor-pointer ${
        isCardHovered ? "bg-default-100 active:bg-default-200" : ""
      } ${isActive ? "border-green-400" : ""}`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      <div className="mb-3 flex justify-between">
        <h3 className="font-semibold">Rental #{rental.rental_id}</h3>
        <span
          className={`text-xs rounded-full px-2 py-0.5 ${
            isActive
              ? "bg-green-100 text-green-800"
              : "bg-default-100 text-default-800"
          }`}
        >
          {isActive ? "Active" : "Completed"}
        </span>
      </div>

      <div className="space-y-1 text-sm mb-3">
        <p>
          <span className="font-medium">Customer:</span> {rental.customer_name}
        </p>
        <p>
          <span className="font-medium">Location:</span>{" "}
          {rental.location_address || "No specific location"}
        </p>
        <p>
          <span className="font-medium">Dumpster:</span> {rental.tong_no}
        </p>
        <p>
          <span className="font-medium">Driver:</span> {rental.driver}
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Placed:</span>{" "}
          {formatDate(rental.date_placed)}
        </p>
        <p>
          <span className="font-medium">Picked up:</span>{" "}
          {formatDate(rental.date_picked)}
        </p>
        <p>
          <span className="font-medium">Duration:</span> {calculateDuration()}
        </p>
      </div>

      {isCardHovered && (
        <div className="absolute bottom-3 right-3 flex space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerateDeliveryOrder(rental);
            }}
            className="p-1.5 bg-default-100 hover:bg-default-200 rounded-full"
            title="Generate Delivery Order"
          >
            <IconReceipt size={18} stroke={1.5} />
          </button>

          {!isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateInvoice(rental);
              }}
              className="p-1.5 bg-default-100 hover:bg-default-200 rounded-full"
              title="Create Invoice"
            >
              <IconFileInvoice size={18} stroke={1.5} />
            </button>
          )}
        </div>
      )}
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
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchRentals();
  }, []);

  const fetchRentals = async () => {
    try {
      setLoading(true);
      const data = await api.get("/greentarget/api/rentals");
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
    navigate(`/greentarget/rentals/${rental.rental_id}/delivery-order`);
  };

  const handleCreateInvoice = (rental: Rental) => {
    // Redirect to invoice creation page with rental ID
    navigate(`/greentarget/invoices/new?rental_id=${rental.rental_id}`);
  };

  const filteredRentals = useMemo(() => {
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

      // Filter by active status if needed
      const matchesStatus = activeOnly ? !rental.date_picked : true;

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
    <div className="relative w-full mx-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl text-default-700 font-bold">
          Rentals ({filteredRentals.length})
        </h1>
        <div className="flex space-x-3">
          <div className="relative">
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
          <div className="flex items-center">
            <input
              type="checkbox"
              id="activeOnly"
              checked={activeOnly}
              onChange={() => setActiveOnly(!activeOnly)}
              className="mr-2"
            />
            <label htmlFor="activeOnly">Active Rentals Only</label>
          </div>
          <Button
            onClick={() => navigate("/greentarget/rentals/new")}
            icon={IconPlus}
            variant="outline"
          >
            New Rental
          </Button>
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
    </div>
  );
};

export default RentalListPage;

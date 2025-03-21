// src/pages/GreenTarget/Customers/CustomerListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import { api } from "../../../routes/utils/api";
import LoadingSpinner from "../../../components/LoadingSpinner";

// Define the Customer interface based on your backend data structure
interface Customer {
  customer_id: number;
  name: string;
  phone_number: string;
  last_activity_date: string;
  status: string;
}

const CustomerCard = ({
  customer,
  onDeleteClick,
}: {
  customer: Customer;
  onDeleteClick: (customer: Customer) => void;
}) => {
  const navigate = useNavigate();
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isTrashHovered, setIsTrashHovered] = useState(false);

  const handleClick = () => {
    navigate(`/greentarget/customers/${customer.customer_id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(customer);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`relative border text-left rounded-lg p-4 transition-all duration-200 cursor-pointer ${
        isCardHovered && !isTrashHovered
          ? "bg-default-100 active:bg-default-200"
          : ""
      }`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      <div className="mb-2">
        <h3 className="font-semibold">{customer.name}</h3>
        <div className="text-sm text-default-500">
          ID: {customer.customer_id}
        </div>
      </div>
      <p className="text-sm">Phone: {customer.phone_number || "N/A"}</p>
      <p className="text-sm">
        Last Activity: {formatDate(customer.last_activity_date)}
      </p>
      <p className="text-sm">
        Status:{" "}
        <span
          className={
            customer.status === "active" ? "text-green-600" : "text-red-600"
          }
        >
          {customer.status}
        </span>
      </p>
      <div className="absolute inset-y-0 top-2 right-2">
        <div className="relative w-8 h-8">
          {isCardHovered && (
            <button
              onClick={handleDeleteClick}
              onMouseEnter={() => setIsTrashHovered(true)}
              onMouseLeave={() => setIsTrashHovered(false)}
              className="delete-button flex items-center justify-center absolute inset-0 rounded-lg transition-colors duration-200 bg-default-100 active:bg-default-200 focus:outline-none"
            >
              <IconTrash
                className="text-default-700 active:text-default-800"
                stroke={1.5}
                size={18}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const CustomerListPage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
    null
  );
  const [showInactive, setShowInactive] = useState(false);
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const data = await api.get("/greentarget/api/customers");
      setCustomers(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch customers. Please try again later.");
      console.error("Error fetching customers:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (customerToDelete) {
      try {
        await api.delete(
          `/greentarget/api/customers/${customerToDelete.customer_id}`
        );
        toast.success("Customer deactivated successfully");

        // Update the customer status locally instead of removing from the list
        setCustomers(
          customers.map((c) =>
            c.customer_id === customerToDelete.customer_id
              ? { ...c, status: "inactive" }
              : c
          )
        );

        setIsDeleteDialogOpen(false);
        setCustomerToDelete(null);
      } catch (err) {
        console.error("Error deactivating customer:", err);
        toast.error("Failed to deactivate customer. Please try again.");
      }
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const matchesSearch = customer.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesStatus = showInactive ? true : customer.status === "active";
      return matchesSearch && matchesStatus;
    });
  }, [customers, searchTerm, showInactive]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showInactive]);

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
      // Show first page
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

      // Show pages around current page
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

      // Show ellipsis if needed
      if (currentPage < totalPages - 2) {
        buttons.push(
          <div key="ellipsis2" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Show last page
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
          Customers ({filteredCustomers.length})
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
              id="showInactive"
              checked={showInactive}
              onChange={() => setShowInactive(!showInactive)}
              className="mr-2"
            />
            <label htmlFor="showInactive">Show Inactive</label>
          </div>
          <Button
            onClick={() => navigate("/greentarget/customers/new")}
            icon={IconPlus}
            variant="outline"
          >
            Add Customer
          </Button>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-default-500">No customers found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedCustomers.map((customer) => (
            <CustomerCard
              key={customer.customer_id}
              customer={customer}
              onDeleteClick={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {filteredCustomers.length > 0 && (
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
        onConfirm={handleConfirmDelete}
        title="Deactivate Customer"
        message={`Are you sure you want to deactivate ${customerToDelete?.name}? This will mark them as inactive but preserve their data.`}
        confirmButtonText="Deactivate"
      />
    </div>
  );
};

export default CustomerListPage;

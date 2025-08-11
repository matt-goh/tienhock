import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Customer } from "../../types/types";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconCheck,
  IconChevronDown,
  IconBuildingStore,
  IconRefresh,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import CustomerCard from "../../components/Catalogue/CustomerCard";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  EnhancedCustomerList,
  refreshCustomersCache,
  useCustomersCache,
} from "../../utils/catalogue/useCustomerCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import BranchLinkageModal from "../../components/Catalogue/BranchLinkageModal";

const ITEMS_PER_PAGE = 20;

const CustomerPage: React.FC = () => {
  const navigate = useNavigate();
  const { customers, isLoading, error } = useCustomersCache();
  const [searchTerm, setSearchTerm] = useState(() => {
    // Retrieve saved search term from sessionStorage
    return sessionStorage.getItem("customerSearchTerm") || "";
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [salesmen, setSalesmen] = useState<string[]>(["All Salesmen"]);
  const [selectedSalesman, setSelectedSalesman] =
    useState<string>("All Salesmen");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
    null
  );
  const { salesmen: salesmenData } = useSalesmanCache();
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);

  useEffect(() => {
    sessionStorage.setItem("customerSearchTerm", searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenIds = salesmenData.map((employee) => employee.id);
      setSalesmen(["All Salesmen", ...salesmenIds]);
    }
  }, [salesmenData]);

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (customerToDelete) {
      try {
        await api.delete(`/api/customers/${customerToDelete.id}`);

        // Refresh the cache after deletion
        await refreshCustomersCache();

        setIsDeleteDialogOpen(false);
        setCustomerToDelete(null);
        toast.success("Customer deleted successfully");
      } catch (err) {
        console.error("Error deleting customer:", err);
        toast.error("Failed to delete customer. Please try again.");
      }
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const searchFields = [
        customer.name,
        customer.id,
        customer.id_number,
        customer.phone_number,
      ].map((field) => field?.toLowerCase() || "");

      const matchesSearch = searchFields.some((field) =>
        field.includes(searchTerm.toLowerCase())
      );

      const matchesSalesman =
        selectedSalesman === "All Salesmen" ||
        customer.salesman === selectedSalesman;

      return matchesSearch && matchesSalesman;
    });
  }, [customers, searchTerm, selectedSalesman]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSalesman]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const renderSalesmanListbox = () => (
    <div className="flex items-center">
      <Listbox value={selectedSalesman} onChange={setSelectedSalesman}>
        <div className="relative">
          <ListboxButton className="w-48 rounded-full border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
            <span className="block truncate pl-2">{selectedSalesman}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <IconChevronDown
                className="h-5 w-5 text-default-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
            {salesmen.map((salesman) => (
              <ListboxOption
                key={salesman}
                className={({ active }) =>
                  `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                    active
                      ? "bg-default-100 text-default-900"
                      : "text-default-900"
                  }`
                }
                value={salesman}
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? "font-medium" : "font-normal"
                      }`}
                    >
                      {salesman}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                        <IconCheck className="h-5 w-5" aria-hidden="true" />
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
  );

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
      // Add first page
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

      // Add ellipsis if needed
      if (currentPage > 3) {
        buttons.push(
          <div key="ellipsis1" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Add pages around current page
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

      // Add ellipsis if needed
      if (currentPage < totalPages - 2) {
        buttons.push(
          <div key="ellipsis2" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Add last page
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

  if (isLoading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div className="relative w-full mx-20 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-6">
          <h1 className="flex items-center text-2xl text-default-700 font-bold gap-2.5">
            <IconBuildingStore
              size={28}
              stroke={2.5}
              className="text-default-700"
            />
            Customers ({filteredCustomers.length})
          </h1>
        </div>
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
            {searchTerm && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 hover:text-default-700"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {renderSalesmanListbox()}
          <Button
            onClick={async () => {
              try {
                await refreshCustomersCache();
                toast.success("Refreshed customer list");
              } catch (error) {
                toast.error("Failed to refresh customers");
              }
            }}
            variant="outline"
            title="Refresh Customers"
            icon={IconRefresh}
          >
            Refresh
          </Button>
          <Button onClick={() => setIsBranchModalOpen(true)} variant="outline">
            Branch
          </Button>
          <Button
            onClick={() => navigate("/catalogue/customer/new")}
            icon={IconPlus}
            color="sky"
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
          {paginatedCustomers.map((customer: EnhancedCustomerList) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              onDeleteClick={handleDeleteClick}
              branchInfo={customer.branchInfo}
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
        title="Delete Customer"
        message={`Are you sure you want to remove ${customerToDelete?.name} from the customer list? This action cannot be undone.`}
        confirmButtonText="Delete"
      />
      <BranchLinkageModal
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
      />
    </div>
  );
};

export default CustomerPage;

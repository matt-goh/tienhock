// src/pages/GreenTarget/Invoices/InvoiceListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconFileInvoice,
  IconFilter,
  IconSquareCheckFilled,
  IconSquare,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";

interface Invoice {
  invoice_id: number;
  invoice_number: string;
  type: "regular" | "statement";
  customer_id: number;
  customer_name: string;
  rental_id?: number;
  amount_before_tax: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  current_balance: number;
  date_issued: string;
  balance_due: number;
  statement_period_start?: string;
  statement_period_end?: string;
}

const InvoiceCard = ({
  invoice,
  onDeleteClick,
}: {
  invoice: Invoice;
  onDeleteClick: (invoice: Invoice) => void;
}) => {
  const navigate = useNavigate();
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isTrashHovered, setIsTrashHovered] = useState(false);

  const handleClick = () => {
    navigate(`/greentarget/invoices/${invoice.invoice_id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(invoice);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
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
      <div className="mb-2 flex justify-between items-start">
        <div>
          <h3 className="font-semibold">{invoice.invoice_number}</h3>
          <div className="text-sm text-default-500">
            {invoice.type === "regular" ? "Regular Invoice" : "Statement"}
          </div>
        </div>
        <div
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            invoice.current_balance > 0
              ? "bg-amber-100 text-amber-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {invoice.current_balance > 0 ? "Outstanding" : "Paid"}
        </div>
      </div>
      <p className="text-sm">Customer: {invoice.customer_name}</p>
      <p className="text-sm">Date: {formatDate(invoice.date_issued)}</p>
      <p className="text-sm">Amount: {formatCurrency(invoice.total_amount)}</p>
      <p className="text-sm">
        Balance:{" "}
        <span
          className={
            invoice.current_balance > 0 ? "text-amber-600 font-medium" : ""
          }
        >
          {formatCurrency(invoice.current_balance)}
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

const InvoiceListPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [filters, setFilters] = useState({
    outstandingOnly: false,
    type: "all", // all, regular, statement
    startDate: "",
    endDate: "",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      // Initialize with empty query params
      let queryParams = "";

      // Build query string if we have any active filters
      if (
        filters.outstandingOnly ||
        filters.type !== "all" ||
        filters.startDate ||
        filters.endDate
      ) {
        const params = new URLSearchParams();

        if (filters.outstandingOnly) {
          params.append("outstanding_only", "true");
        }

        if (filters.type !== "all") {
          params.append("type", filters.type);
        }

        if (filters.startDate) {
          params.append("start_date", filters.startDate);
        }

        if (filters.endDate) {
          params.append("end_date", filters.endDate);
        }

        queryParams = `?${params.toString()}`;
      }

      const data = await api.get(`/greentarget/api/invoices${queryParams}`);
      setInvoices(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch invoices. Please try again later.");
      console.error("Error fetching invoices:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (invoiceToDelete) {
      try {
        // We would typically delete the invoice here, but in this case
        // we might not want to implement actual deletion for invoices
        // as they should be preserved for accounting purposes
        // This is just a placeholder for the delete functionality
        toast.error("Invoice deletion is disabled for accounting integrity");
        setIsDeleteDialogOpen(false);
        setInvoiceToDelete(null);
      } catch (err) {
        console.error("Error deleting invoice:", err);
        toast.error("Failed to delete invoice. Please try again.");
      }
    }
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    fetchInvoices();
    setIsFilterOpen(false);
  };

  const handleResetFilters = () => {
    setFilters({
      outstandingOnly: false,
      type: "all",
      startDate: "",
      endDate: "",
    });
    // Don't fetch immediately, wait for the user to apply
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      // Filter by search term (invoice number or customer name)
      return (
        invoice.invoice_number
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [invoices, searchTerm]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);

  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInvoices.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredInvoices, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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
      // First page button
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

      // Ellipsis if needed
      if (currentPage > 3) {
        buttons.push(
          <div key="ellipsis1" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Pages around current page
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

      // Ellipsis if needed
      if (currentPage < totalPages - 2) {
        buttons.push(
          <div key="ellipsis2" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Last page button
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
          Invoices ({filteredInvoices.length})
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

          <Button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            icon={IconFilter}
            variant="outline"
          >
            Filters
          </Button>

          <Button
            onClick={() => navigate("/greentarget/invoices/new")}
            icon={IconPlus}
            variant="outline"
          >
            Create Invoice
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      {isFilterOpen && (
        <div className="bg-white border border-default-200 rounded-lg p-4 mb-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Filter Invoices</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Invoice Type
              </label>
              <select
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
                className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
              >
                <option value="all">All Types</option>
                <option value="regular">Regular Invoices</option>
                <option value="statement">Statements</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() =>
                  setFilters({
                    ...filters,
                    outstandingOnly: !filters.outstandingOnly,
                  })
                }
                className="p-2 rounded-full transition-opacity duration-200 hover:bg-default-100 active:bg-default-200 flex items-center"
              >
                {filters.outstandingOnly ? (
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
                <span className="ml-2 font-medium">Outstanding Only</span>
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-end space-x-3">
            <Button onClick={handleResetFilters} variant="outline">
              Reset
            </Button>
            <Button onClick={handleApplyFilters}>Apply Filters</Button>
          </div>
        </div>
      )}

      {filteredInvoices.length === 0 ? (
        <div className="text-center py-8">
          <IconFileInvoice
            size={48}
            className="mx-auto mb-4 text-default-300"
          />
          <p className="text-lg text-default-500">No invoices found.</p>
          <p className="text-default-400">
            {searchTerm ? "Try a different search term or " : ""}
            Create a new invoice to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedInvoices.map((invoice) => (
            <InvoiceCard
              key={invoice.invoice_id}
              invoice={invoice}
              onDeleteClick={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {filteredInvoices.length > 0 && (
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
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice ${invoiceToDelete?.invoice_number}? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default InvoiceListPage;

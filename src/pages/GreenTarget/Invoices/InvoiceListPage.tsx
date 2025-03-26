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
  IconPrinter,
  IconCash,
  IconFileDownload,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import { greenTargetApi } from "../../../routes/greentarget/api";

interface Invoice {
  invoice_id: number;
  invoice_number: string;
  type: "regular" | "statement";
  customer_id: number;
  customer_name: string;
  rental_id?: number;
  driver?: string;
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
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const isPaid = invoice.current_balance <= 0;

  return (
    <div
      className={`relative border text-left rounded-lg overflow-hidden transition-all duration-200 cursor-pointer ${
        isCardHovered ? "shadow-md" : "shadow-sm"
      } ${isPaid ? "border-green-400" : "border-amber-400"}`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Status banner */}
      <div
        className={`w-full py-1.5 px-4 text-sm font-medium text-white ${
          isPaid ? "bg-green-500" : "bg-amber-500"
        }`}
      >
        <div className="flex justify-between items-center">
          <span>{invoice.invoice_number}</span>
          <span className="text-xs py-0.5 px-2 bg-white/20 rounded-full">
            {isPaid ? "Paid" : "Outstanding"}
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Customer section */}
        <div className="mb-3 border-b pb-3">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-default-900">
                {invoice.customer_name}
              </h3>
              <p className="text-sm text-default-600 mt-0.5">
                {invoice.type === "regular" ? "Regular Invoice" : "Statement"}
              </p>
            </div>
            {/* Add rental ID and driver info in the right side */}
            {invoice.rental_id && (
              <div className="text-right">
                <h3 className="font-medium text-default-700">
                  Rental #{invoice.rental_id}
                </h3>
                {invoice.driver && (
                  <p className="text-sm text-default-600 mt-0.5 truncate">
                    Driver: {invoice.driver}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Date Issued</p>
            <p className="font-medium">{formatDate(invoice.date_issued)}</p>
          </div>
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Total</p>
            <p className="font-medium">
              {formatCurrency(invoice.total_amount)}
            </p>
          </div>
          <div className="bg-default-50 p-2 border border-default-100 rounded-md">
            <p className="text-xs text-default-500 mb-1">Paid</p>
            <p className="font-medium text-green-600">
              {formatCurrency(invoice.amount_paid)}
            </p>
          </div>
          <div
            className={`p-2 border rounded-md ${
              isPaid
                ? "bg-green-50 border-green-100"
                : "bg-amber-50 border-amber-100"
            }`}
          >
            <p className="text-xs text-default-500 mb-1">Balance</p>
            <p
              className={`font-medium ${
                isPaid ? "text-green-700" : "text-amber-700"
              }`}
            >
              {formatCurrency(invoice.current_balance)}
            </p>
          </div>
        </div>

        {/* Action buttons - semi-visible always, fully visible on hover */}
        <div
          className={`flex justify-end space-x-2 mt-2 transition-opacity duration-200 ${
            isCardHovered ? "opacity-100" : "opacity-70"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/greentarget/invoices/${invoice.invoice_id}`);
            }}
            className="p-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-full transition-colors"
            title="View Details"
          >
            <IconFileDownload size={18} stroke={1.5} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/greentarget/invoices/${invoice.invoice_id}`);
            }}
            className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full transition-colors"
            title="Print Invoice"
          >
            <IconPrinter size={18} stroke={1.5} />
          </button>

          {!isPaid && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Navigate to invoice details with state to show payment form
                navigate(`/greentarget/invoices/${invoice.invoice_id}`, {
                  state: { showPaymentForm: true },
                });
              }}
              className="p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-full transition-colors"
              title="Record Payment"
            >
              <IconCash size={18} stroke={1.5} />
            </button>
          )}

          <button
            onClick={handleDeleteClick}
            className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-full transition-colors"
            title="Delete Invoice"
          >
            <IconTrash size={18} stroke={1.5} />
          </button>
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
        // Get the response from the API call
        const response = await greenTargetApi.deleteInvoice(
          invoiceToDelete.invoice_id
        );

        // Check if the response contains an error message
        if (
          response.error ||
          (response.message && response.message.includes("Cannot delete"))
        ) {
          // Show error toast with the server's message
          toast.error(
            response.message || "Cannot delete invoice: unknown error occurred"
          );
        } else {
          // Only show success and update state if there's no error
          toast.success("Invoice deleted successfully");

          // Remove deleted invoice from state
          setInvoices(
            invoices.filter((i) => i.invoice_id !== invoiceToDelete.invoice_id)
          );
        }
      } catch (error: any) {
        // This will catch network errors or other exceptions
        if (error.message && error.message.includes("associated payments")) {
          toast.error(
            "Cannot delete invoice: it has associated payments. Delete the payments first."
          );
        } else {
          toast.error("Failed to delete invoice");
          console.error("Error deleting invoice:", error);
        }
      } finally {
        setIsDeleteDialogOpen(false);
        setInvoiceToDelete(null);
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

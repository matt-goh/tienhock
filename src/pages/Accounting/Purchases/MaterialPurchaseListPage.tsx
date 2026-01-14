// src/pages/Accounting/Purchases/MaterialPurchaseListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconRefresh,
  IconPackage,
  IconExternalLink,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { api } from "../../../routes/utils/api";
import { PurchaseInvoice, SupplierDropdown } from "../../../types/types";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { FormListbox } from "../../../components/FormComponents";

const MaterialPurchaseListPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDropdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] =
    useState<PurchaseInvoice | null>(null);

  // Fetch suppliers for dropdown
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const response = await api.get("/api/suppliers/dropdown");
        setSuppliers(response || []);
      } catch (error) {
        console.error("Error fetching suppliers:", error);
      }
    };
    fetchSuppliers();
  }, []);

  // Fetch invoices
  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", "100");
      if (selectedSupplier) params.append("supplier_id", selectedSupplier);
      if (selectedStatus) params.append("payment_status", selectedStatus);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (searchTerm) params.append("search", searchTerm);

      const response = await api.get(
        `/api/purchase-invoices?${params.toString()}`
      );
      setInvoices(response.invoices || []);
      setTotal(response.total || 0);
    } catch (error) {
      console.error("Error fetching material purchases:", error);
      toast.error("Failed to load material purchases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSupplier, selectedStatus, startDate, endDate]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInvoices();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Supplier options for dropdown
  const supplierOptions = useMemo(() => {
    return [
      { id: "", name: "All Suppliers" },
      ...suppliers.map((s) => ({
        id: String(s.id),
        name: `${s.code} - ${s.name}`,
      })),
    ];
  }, [suppliers]);

  // Status options
  const statusOptions = [
    { id: "", name: "All Status" },
    { id: "unpaid", name: "Unpaid" },
    { id: "partial", name: "Partial" },
    { id: "paid", name: "Paid" },
  ];

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Handlers
  const handleAddClick = () => {
    navigate("/stock/material-purchases/new");
  };

  const handleEditClick = (invoice: PurchaseInvoice) => {
    navigate(`/stock/material-purchases/${invoice.id}`);
  };

  const handleDeleteClick = (invoice: PurchaseInvoice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (invoice.payment_status !== "unpaid") {
      toast.error("Only unpaid purchases can be deleted");
      return;
    }
    setInvoiceToDelete(invoice);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!invoiceToDelete) return;

    try {
      await api.delete(`/api/purchase-invoices/${invoiceToDelete.id}`);
      toast.success(`Purchase '${invoiceToDelete.invoice_number}' deleted`);
      setShowDeleteDialog(false);
      setInvoiceToDelete(null);
      fetchInvoices();
    } catch (error: unknown) {
      console.error("Error deleting purchase:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete purchase";
      toast.error(errorMessage);
    }
  };

  const handleViewJournal = (
    journalEntryId: number | null,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (journalEntryId) {
      navigate(`/accounting/journal-entries/${journalEntryId}`);
    }
  };

  // Status badge color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "partial":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "unpaid":
      default:
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, inv) => ({
        total: acc.total + parseFloat(String(inv.total_amount)),
        paid: acc.paid + parseFloat(String(inv.amount_paid)),
        outstanding:
          acc.outstanding +
          (parseFloat(String(inv.total_amount)) -
            parseFloat(String(inv.amount_paid))),
      }),
      { total: 0, paid: 0, outstanding: 0 }
    );
  }, [invoices]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Material Purchases
          </h1>
          <span className="text-default-300 dark:text-gray-600">|</span>
          <span className="text-sm text-default-600 dark:text-gray-400">
            Total:{" "}
            <span className="font-medium text-default-900 dark:text-gray-100">
              {total}
            </span>{" "}
            purchases
          </span>
          <span className="text-default-300 dark:text-gray-600">|</span>
          <button
            onClick={fetchInvoices}
            className="p-1.5 text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-100 hover:bg-default-100 dark:hover:bg-gray-700 rounded"
            title="Refresh"
          >
            <IconRefresh size={18} />
          </button>
        </div>
        <Button
          onClick={handleAddClick}
          color="sky"
          variant="filled"
          icon={IconPlus}
          iconPosition="left"
          size="sm"
        >
          New Purchase
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* Supplier Filter */}
        <FormListbox
          name="supplier"
          label=""
          value={selectedSupplier}
          onChange={setSelectedSupplier}
          options={supplierOptions}
        />

        {/* Status Filter */}
        <FormListbox
          name="status"
          label=""
          value={selectedStatus}
          onChange={setSelectedStatus}
          options={statusOptions}
        />

        {/* Date Range */}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Start Date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="End Date"
        />

        {/* Search */}
        <div className="relative">
          <IconSearch
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400"
            stroke={1.5}
          />
          <input
            type="text"
            placeholder="Search..."
            className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4">
          <p className="text-sm text-default-500 dark:text-gray-400">Total</p>
          <p className="text-lg font-semibold text-default-900 dark:text-gray-100">
            {formatCurrency(totals.total)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4">
          <p className="text-sm text-default-500 dark:text-gray-400">Paid</p>
          <p className="text-lg font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(totals.paid)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4">
          <p className="text-sm text-default-500 dark:text-gray-400">
            Outstanding
          </p>
          <p className="text-lg font-semibold text-rose-600 dark:text-rose-400">
            {formatCurrency(totals.outstanding)}
          </p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center my-20">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-100 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-28">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-32">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Supplier
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-32">
                  Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-32">
                  Paid
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-24">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-24">
                  Journal
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {invoices.length > 0 ? (
                invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => handleEditClick(invoice)}
                  >
                    <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span className="font-mono text-sky-700 dark:text-sky-400 font-medium">
                        {invoice.invoice_number}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
                      <div>
                        <span className="font-mono text-xs text-default-500 dark:text-gray-400">
                          {invoice.supplier_code}
                        </span>
                        <span className="ml-2">{invoice.supplier_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-default-700 dark:text-gray-200 font-medium">
                      {formatCurrency(parseFloat(String(invoice.total_amount)))}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-green-600 dark:text-green-400">
                      {formatCurrency(parseFloat(String(invoice.amount_paid)))}
                    </td>
                    <td className="px-4 py-2 text-center text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          invoice.payment_status
                        )}`}
                      >
                        {invoice.payment_status.charAt(0).toUpperCase() +
                          invoice.payment_status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-sm">
                      {invoice.journal_entry_id ? (
                        <button
                          onClick={(e) =>
                            handleViewJournal(invoice.journal_entry_id, e)
                          }
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                          title={invoice.journal_reference || "View Journal"}
                        >
                          <IconExternalLink size={18} />
                        </button>
                      ) : (
                        <span className="text-default-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-sm">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(invoice);
                          }}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                          title="Edit"
                        >
                          <IconPencil size={18} />
                        </button>
                        {invoice.payment_status === "unpaid" && (
                          <button
                            onClick={(e) => handleDeleteClick(invoice, e)}
                            className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                            title="Delete"
                          >
                            <IconTrash size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                  >
                    <IconPackage
                      size={48}
                      className="mx-auto mb-4 text-default-300 dark:text-gray-600"
                    />
                    No material purchases found.{" "}
                    {searchTerm || selectedSupplier || selectedStatus
                      ? "Try adjusting your filters."
                      : "Create one to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Material Purchase"
        message={`Are you sure you want to delete purchase "${invoiceToDelete?.invoice_number}"? The associated journal entry will be cancelled.`}
        variant="danger"
      />
    </div>
  );
};

export default MaterialPurchaseListPage;

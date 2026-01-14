// src/pages/Accounting/Purchases/SuppliersListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconRefresh,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { api } from "../../../routes/utils/api";
import { Supplier } from "../../../types/types";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

const SuppliersListPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  // Fetch suppliers
  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const response = await api.get("/api/suppliers?limit=500");
      setSuppliers(response.suppliers || []);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Filter suppliers
  const filteredSuppliers = useMemo(() => {
    let filtered = suppliers;

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.code.toLowerCase().includes(term) ||
          s.name.toLowerCase().includes(term) ||
          s.contact_person?.toLowerCase().includes(term) ||
          s.phone?.toLowerCase().includes(term)
      );
    }

    // Filter by active status
    if (!showInactive) {
      filtered = filtered.filter((s) => s.is_active);
    }

    return filtered;
  }, [suppliers, searchTerm, showInactive]);

  // Handlers
  const handleAddClick = () => {
    navigate("/accounting/suppliers/new");
  };

  const handleEditClick = (supplier: Supplier) => {
    navigate(`/accounting/suppliers/${supplier.id}`);
  };

  const handleDeleteClick = (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setSupplierToDelete(supplier);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return;

    try {
      await api.delete(`/api/suppliers/${supplierToDelete.id}`);
      toast.success(`Supplier '${supplierToDelete.name}' deactivated`);
      setShowDeleteDialog(false);
      setSupplierToDelete(null);
      fetchSuppliers();
    } catch (error: unknown) {
      console.error("Error deactivating supplier:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to deactivate supplier";
      toast.error(errorMessage);
    }
  };

  const handleReactivate = async (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post(`/api/suppliers/${supplier.id}/reactivate`);
      toast.success(`Supplier '${supplier.name}' reactivated`);
      fetchSuppliers();
    } catch (error: unknown) {
      console.error("Error reactivating supplier:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to reactivate supplier";
      toast.error(errorMessage);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header - All in one row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left side: Title | Checkbox | Stats | Refresh */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Suppliers
          </h1>
          <span className="text-default-300 dark:text-gray-600">|</span>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-default-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-sm text-default-700 dark:text-gray-200">
              Show Inactive
            </span>
          </label>
          <span className="text-default-300 dark:text-gray-600">·</span>
          <span className="text-sm text-default-600 dark:text-gray-400">
            Total:{" "}
            <span className="font-medium text-default-900 dark:text-gray-100">
              {suppliers.filter((s) => s.is_active).length}
            </span>{" "}
            active suppliers
          </span>
          <span className="text-default-300 dark:text-gray-600">|</span>
          <button
            onClick={fetchSuppliers}
            className="p-1.5 text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-100 hover:bg-default-100 dark:hover:bg-gray-700 rounded"
            title="Refresh"
          >
            <IconRefresh size={18} />
          </button>
        </div>

        {/* Right side: Search | Add Button */}
        <div className="flex items-center gap-3">
          <div className="relative w-full lg:w-56">
            <IconSearch
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search code, name, phone..."
              className="w-full rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-1.5 pl-9 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <Button
            onClick={handleAddClick}
            color="sky"
            variant="filled"
            icon={IconPlus}
            iconPosition="left"
            size="sm"
          >
            Add Supplier
          </Button>
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
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-32">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-40">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-32">
                  Phone
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-24">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className={`hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer ${
                      !supplier.is_active ? "opacity-50" : ""
                    }`}
                    onClick={() => handleEditClick(supplier)}
                  >
                    <td className="px-4 py-2 text-sm">
                      <span className="font-mono text-sky-700 dark:text-sky-400 font-medium">
                        {supplier.code}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
                      {supplier.name}
                    </td>
                    <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
                      {supplier.contact_person || "-"}
                    </td>
                    <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
                      {supplier.phone || "-"}
                    </td>
                    <td className="px-4 py-2 text-center text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          supplier.is_active
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        }`}
                      >
                        {supplier.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-sm">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(supplier);
                          }}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                          title="Edit"
                        >
                          <IconPencil size={18} />
                        </button>
                        {supplier.is_active ? (
                          <button
                            onClick={(e) => handleDeleteClick(supplier, e)}
                            className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                            title="Deactivate"
                          >
                            <IconTrash size={18} />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleReactivate(supplier, e)}
                            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
                            title="Reactivate"
                          >
                            <IconRefresh size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                  >
                    No suppliers found.{" "}
                    {searchTerm
                      ? "Try adjusting your search."
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
        title="Deactivate Supplier"
        message={`Are you sure you want to deactivate supplier "${supplierToDelete?.name}"? The supplier can be reactivated later.`}
        variant="danger"
      />
    </div>
  );
};

export default SuppliersListPage;

// src/pages/Accounting/Purchases/SupplierFormPage.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../../routes/utils/api";
import { SupplierWithSummary, SupplierInput } from "../../../types/types";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { FormInput } from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Checkbox from "../../../components/Checkbox";

interface SupplierFormData {
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  is_active: boolean;
}

const SupplierFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id && id !== "new";

  // Form state
  const [formData, setFormData] = useState<SupplierFormData>({
    code: "",
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    is_active: true,
  });

  // Summary data for edit mode
  const [summary, setSummary] = useState<SupplierWithSummary["summary"] | null>(
    null
  );

  // Initial form data reference for change detection
  const initialFormDataRef = useRef<SupplierFormData | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch supplier data for editing
  const fetchSupplierData = useCallback(async () => {
    if (!id || id === "new") return;

    setLoading(true);
    setError(null);

    try {
      const response = (await api.get(
        `/api/suppliers/${id}`
      )) as SupplierWithSummary;

      const fetchedFormData: SupplierFormData = {
        code: response.code,
        name: response.name,
        contact_person: response.contact_person || "",
        phone: response.phone || "",
        email: response.email || "",
        is_active: response.is_active,
      };

      setFormData(fetchedFormData);
      initialFormDataRef.current = { ...fetchedFormData };
      setSummary(response.summary);
    } catch (err: unknown) {
      console.error("Error fetching supplier data:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load supplier: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      if (isEditMode) {
        await fetchSupplierData();
      } else {
        initialFormDataRef.current = { ...formData };
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, fetchSupplierData]);

  // Form change detection
  useEffect(() => {
    if (!initialFormDataRef.current) return;

    const hasChanges =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanges);
  }, [formData]);

  // Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "number" ? (value === "" ? 0 : parseInt(value, 10)) : value,
    }));
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/accounting/suppliers");
    }
  };

  const handleConfirmBack = () => {
    navigate("/accounting/suppliers");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.code.trim()) {
      toast.error("Supplier code is required");
      return;
    }
    if (!formData.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }

    setIsSaving(true);

    try {
      const payload: SupplierInput = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        contact_person: formData.contact_person.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        is_active: formData.is_active,
      };

      if (isEditMode) {
        await api.put(`/api/suppliers/${id}`, payload);
        toast.success("Supplier updated successfully");
      } else {
        await api.post("/api/suppliers", payload);
        toast.success("Supplier created successfully");
      }

      navigate("/accounting/suppliers");
    } catch (err: unknown) {
      console.error("Error saving supplier:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to save supplier";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/suppliers/${id}`);
      toast.success("Supplier deactivated successfully");
      navigate("/accounting/suppliers");
    } catch (err: unknown) {
      console.error("Error deactivating supplier:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to deactivate supplier";
      toast.error(errorMessage);
    }
    setShowDeleteDialog(false);
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex justify-center my-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <BackButton onClick={handleBackClick} />
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <BackButton onClick={handleBackClick} />
          <span className="text-default-300 dark:text-gray-600">|</span>
          <div>
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
              {isEditMode ? "Edit Supplier" : "New Supplier"}
            </h1>
            {isEditMode && (
              <p className="text-sm text-default-500 dark:text-gray-400">
                {formData.code} - {formData.name}
              </p>
            )}
          </div>
        </div>
        {isEditMode && formData.is_active && (
          <Button
            onClick={() => setShowDeleteDialog(true)}
            color="red"
            variant="outline"
            size="sm"
          >
            Deactivate
          </Button>
        )}
      </div>

      {/* Summary Cards (Edit Mode Only) */}
      {isEditMode && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4">
            <p className="text-sm text-default-500 dark:text-gray-400">
              Total Invoices
            </p>
            <p className="text-xl font-semibold text-default-900 dark:text-gray-100">
              {summary.total_invoices}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4">
            <p className="text-sm text-default-500 dark:text-gray-400">
              Total Purchased
            </p>
            <p className="text-xl font-semibold text-default-900 dark:text-gray-100">
              {formatCurrency(parseFloat(String(summary.total_purchased)))}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4">
            <p className="text-sm text-default-500 dark:text-gray-400">
              Total Paid
            </p>
            <p className="text-xl font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(parseFloat(String(summary.total_paid)))}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-4">
            <p className="text-sm text-default-500 dark:text-gray-400">
              Outstanding
            </p>
            <p className="text-xl font-semibold text-rose-600 dark:text-rose-400">
              {formatCurrency(parseFloat(String(summary.outstanding_balance)))}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Code */}
            <FormInput
              label="Supplier Code"
              name="code"
              value={formData.code}
              onChange={handleInputChange}
              placeholder="e.g., LAHAD_DATU"
              required
              disabled={isEditMode}
            />

            {/* Name */}
            <FormInput
              label="Supplier Name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., LAHAD DATU FLOUR MILL SDN BHD"
              required
            />

            {/* Contact Person */}
            <FormInput
              label="Contact Person"
              name="contact_person"
              value={formData.contact_person}
              onChange={handleInputChange}
              placeholder="Primary contact name"
            />

            {/* Phone */}
            <FormInput
              label="Phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="e.g., 088-123456"
            />

            {/* Email */}
            <FormInput
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="e.g., supplier@example.com"
            />

            {/* Is Active (Edit Mode) */}
            {isEditMode && (
              <div className="md:col-span-2">
                <Checkbox
                  checked={formData.is_active}
                  onChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_active: checked }))
                  }
                  label="Active"
                  checkedColor="text-sky-600 dark:text-sky-400"
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3">
          <Button
            type="button"
            onClick={handleBackClick}
            color="default"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            color="sky"
            variant="filled"
            disabled={!isFormChanged || isSaving}
          >
            {isSaving ? "Saving..." : isEditMode ? "Update Supplier" : "Create Supplier"}
          </Button>
        </div>
      </form>

      {/* Back Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave this page?"
        variant="danger"
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Deactivate Supplier"
        message={`Are you sure you want to deactivate supplier "${formData.name}"? The supplier can be reactivated later.`}
        variant="danger"
      />
    </div>
  );
};

export default SupplierFormPage;

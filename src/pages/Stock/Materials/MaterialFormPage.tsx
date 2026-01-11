// src/pages/Stock/Materials/MaterialFormPage.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../../routes/utils/api";
import { Material, MaterialCategory, MaterialAppliesTo } from "../../../types/types";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import {
  FormInput,
  FormListbox,
  SelectOption,
} from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

interface MaterialFormData {
  code: string;
  name: string;
  category: MaterialCategory;
  unit: string;
  unit_size: string;
  default_unit_cost: number;
  applies_to: MaterialAppliesTo;
  sort_order: number;
  is_active: boolean;
  notes: string;
}

const defaultFormData: MaterialFormData = {
  code: "",
  name: "",
  category: "ingredient",
  unit: "",
  unit_size: "",
  default_unit_cost: 0,
  applies_to: "both",
  sort_order: 0,
  is_active: true,
  notes: "",
};

// Category options
const categoryOptions: SelectOption[] = [
  { id: "ingredient", name: "Ingredient" },
  { id: "raw_material", name: "Raw Material" },
  { id: "packing_material", name: "Packing Material" },
];

// Applies to options
const appliesToOptions: SelectOption[] = [
  { id: "both", name: "Both (MEE & BIHUN)" },
  { id: "mee", name: "MEE Only" },
  { id: "bihun", name: "BIHUN Only" },
];

// Common unit options
const unitOptions: SelectOption[] = [
  { id: "kg", name: "kg (Kilogram)" },
  { id: "ctn", name: "ctn (Carton)" },
  { id: "bag", name: "bag" },
  { id: "roll", name: "roll" },
  { id: "pcs", name: "pcs (Pieces)" },
  { id: "box", name: "box" },
];

const MaterialFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id && id !== "new";

  // Form state
  const [formData, setFormData] = useState<MaterialFormData>(defaultFormData);
  const initialFormDataRef = useRef<MaterialFormData | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch material data for editing
  const fetchMaterialData = useCallback(async () => {
    if (!id || id === "new") return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/materials/${id}`);
      const materialData = response as Material;

      const fetchedFormData: MaterialFormData = {
        code: materialData.code,
        name: materialData.name,
        category: materialData.category,
        unit: materialData.unit,
        unit_size: materialData.unit_size || "",
        default_unit_cost: materialData.default_unit_cost,
        applies_to: materialData.applies_to,
        sort_order: materialData.sort_order,
        is_active: materialData.is_active,
        notes: materialData.notes || "",
      };

      setFormData(fetchedFormData);
      initialFormDataRef.current = { ...fetchedFormData };
    } catch (err: any) {
      console.error("Error fetching material data:", err);
      setError(`Failed to load material: ${err?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      if (isEditMode) {
        await fetchMaterialData();
      } else {
        initialFormDataRef.current = { ...defaultFormData };
        setLoading(false);
      }
    };

    loadData();
  }, [isEditMode, fetchMaterialData]);

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

    if (type === "number") {
      setFormData((prev) => ({
        ...prev,
        [name]: parseFloat(value) || 0,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSelectChange = (name: keyof MaterialFormData, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Back navigation
  const handleBack = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/materials");
    }
  };

  // Save
  const handleSave = async () => {
    // Validation
    if (!formData.code.trim()) {
      toast.error("Code is required");
      return;
    }
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!formData.unit.trim()) {
      toast.error("Unit is required");
      return;
    }

    setIsSaving(true);

    try {
      if (isEditMode) {
        await api.put(`/api/materials/${id}`, formData);
        toast.success("Material updated successfully");
      } else {
        await api.post("/api/materials", formData);
        toast.success("Material created successfully");
      }

      navigate("/materials");
    } catch (err: any) {
      console.error("Error saving material:", err);
      toast.error(err.message || "Failed to save material");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!id) return;

    try {
      await api.delete(`/api/materials/${id}`);
      toast.success("Material deactivated successfully");
      navigate("/materials");
    } catch (err: any) {
      console.error("Error deleting material:", err);
      toast.error(err.message || "Failed to delete material");
    } finally {
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm px-6 py-3">
          <div className="flex items-center gap-4">
            <BackButton onClick={() => navigate("/materials")} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              Material
            </h1>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-6 text-center text-red-600 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm px-6 py-3">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 mb-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBack} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {isEditMode ? "Edit Material" : "New Material"}
            </h1>
          </div>
          <div className="flex space-x-2">
            {isEditMode && formData.is_active && (
              <Button
                color="red"
                variant="filled"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                Deactivate
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              color="sky"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || (!isFormChanged && isEditMode)}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Code */}
          <FormInput
            label="Code"
            name="code"
            value={formData.code}
            onChange={handleInputChange}
            required
            disabled={isEditMode}
            placeholder="e.g., GARAM, TEPUNG"
          />

          {/* Name */}
          <FormInput
            label="Name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            placeholder="e.g., Garam (Salt)"
          />

          {/* Category */}
          <FormListbox
            name="category"
            label="Category"
            value={formData.category}
            options={categoryOptions}
            onChange={(value) => handleSelectChange("category", value)}
            required
          />

          {/* Applies To */}
          <FormListbox
            name="applies_to"
            label="Applies To"
            value={formData.applies_to}
            options={appliesToOptions}
            onChange={(value) => handleSelectChange("applies_to", value)}
            required
          />

          {/* Unit */}
          <FormListbox
            name="unit"
            label="Unit"
            value={formData.unit}
            options={unitOptions}
            onChange={(value) => handleSelectChange("unit", value)}
            required
          />

          {/* Unit Size */}
          <FormInput
            label="Unit Size"
            name="unit_size"
            value={formData.unit_size}
            onChange={handleInputChange}
            placeholder="e.g., 25KG, 50KG, 20KG/CTN"
          />

          {/* Default Unit Cost */}
          <FormInput
            label="Default Unit Cost (RM)"
            name="default_unit_cost"
            type="number"
            value={formData.default_unit_cost.toString()}
            onChange={handleInputChange}
            step="0.01"
          />

          {/* Sort Order */}
          <FormInput
            label="Sort Order"
            name="sort_order"
            type="number"
            value={formData.sort_order.toString()}
            onChange={handleInputChange}
          />

          {/* Active Status (only in edit mode) */}
          {isEditMode && (
            <FormListbox
              name="is_active"
              label="Status"
              value={formData.is_active ? "active" : "inactive"}
              options={[
                { id: "active", name: "Active" },
                { id: "inactive", name: "Inactive" },
              ]}
              onChange={(value) => handleSelectChange("is_active", value === "active")}
            />
          )}
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
            placeholder="Optional notes about this material..."
          />
        </div>
      </div>

      {/* Unsaved Changes Confirmation */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={() => navigate("/materials")}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave? Your changes will be lost."
        confirmButtonText="Leave"
        variant="danger"
      />

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Deactivate Material"
        message={`Are you sure you want to deactivate "${formData.name}"? This material will be hidden but not permanently deleted.`}
        confirmButtonText="Deactivate"
        variant="danger"
      />
    </div>
  );
};

export default MaterialFormPage;

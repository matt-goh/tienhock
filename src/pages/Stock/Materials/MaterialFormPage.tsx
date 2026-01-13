// src/pages/Stock/Materials/MaterialFormPage.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../../routes/utils/api";
import { Material, MaterialCategory, MaterialAppliesTo, MaterialVariant } from "../../../types/types";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import {
  FormInput,
  FormListbox,
  SelectOption,
} from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconCheck,
  IconX,
} from "@tabler/icons-react";

interface MaterialFormData {
  code: string;
  name: string;
  category: MaterialCategory;
  default_unit_cost: number;
  applies_to: MaterialAppliesTo;
  sort_order: number;
  is_active: boolean;
}

const defaultFormData: MaterialFormData = {
  code: "",
  name: "",
  category: "ingredient",
  default_unit_cost: 0,
  applies_to: "both",
  sort_order: 0,
  is_active: true,
};

// Variant editing state
interface VariantEditState {
  id: number | null; // null for new variant
  variant_name: string;
  default_unit_cost: number;
  sort_order: number;
  is_active: boolean;
}

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

  // Variants state
  const [variants, setVariants] = useState<MaterialVariant[]>([]);
  const [editingVariant, setEditingVariant] = useState<VariantEditState | null>(null);
  const [showDeleteVariantDialog, setShowDeleteVariantDialog] = useState(false);
  const [variantToDelete, setVariantToDelete] = useState<MaterialVariant | null>(null);
  const [isSavingVariant, setIsSavingVariant] = useState(false);

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
        default_unit_cost: materialData.default_unit_cost,
        applies_to: materialData.applies_to,
        sort_order: materialData.sort_order,
        is_active: materialData.is_active,
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

  // Fetch variants for the material
  const fetchVariants = useCallback(async () => {
    if (!id || id === "new") return;

    try {
      const response = await api.get(`/api/materials/${id}/variants`);
      setVariants(response || []);
    } catch (err: any) {
      console.error("Error fetching variants:", err);
    }
  }, [id]);

  // Variant CRUD handlers
  const handleAddVariant = () => {
    setEditingVariant({
      id: null,
      variant_name: "",
      default_unit_cost: formData.default_unit_cost,
      sort_order: variants.length,
      is_active: true,
    });
  };

  const handleEditVariant = (variant: MaterialVariant) => {
    setEditingVariant({
      id: variant.id,
      variant_name: variant.variant_name,
      default_unit_cost: parseFloat(String(variant.default_unit_cost)) || 0,
      sort_order: variant.sort_order,
      is_active: variant.is_active,
    });
  };

  const handleCancelEditVariant = () => {
    setEditingVariant(null);
  };

  const handleSaveVariant = async () => {
    if (!editingVariant || !id) return;

    if (!editingVariant.variant_name.trim()) {
      toast.error("Variant name is required");
      return;
    }

    setIsSavingVariant(true);

    try {
      if (editingVariant.id) {
        // Update existing variant
        await api.put(`/api/materials/variants/${editingVariant.id}`, {
          variant_name: editingVariant.variant_name,
          default_unit_cost: editingVariant.default_unit_cost,
          sort_order: editingVariant.sort_order,
          is_active: editingVariant.is_active,
        });
        toast.success("Variant updated");
      } else {
        // Create new variant
        await api.post(`/api/materials/${id}/variants`, {
          variant_name: editingVariant.variant_name,
          default_unit_cost: editingVariant.default_unit_cost,
          sort_order: editingVariant.sort_order,
          is_active: editingVariant.is_active,
        });
        toast.success("Variant created");
      }

      setEditingVariant(null);
      fetchVariants();
    } catch (err: any) {
      console.error("Error saving variant:", err);
      toast.error(err.message || "Failed to save variant");
    } finally {
      setIsSavingVariant(false);
    }
  };

  const handleDeleteVariantClick = (variant: MaterialVariant) => {
    setVariantToDelete(variant);
    setShowDeleteVariantDialog(true);
  };

  const handleConfirmDeleteVariant = async () => {
    if (!variantToDelete) return;

    try {
      await api.delete(`/api/materials/variants/${variantToDelete.id}`);
      toast.success("Variant deactivated");
      fetchVariants();
    } catch (err: any) {
      console.error("Error deleting variant:", err);
      toast.error(err.message || "Failed to delete variant");
    } finally {
      setShowDeleteVariantDialog(false);
      setVariantToDelete(null);
    }
  };

  const handleVariantInputChange = (field: keyof VariantEditState, value: string | number | boolean) => {
    if (!editingVariant) return;
    setEditingVariant(prev => prev ? { ...prev, [field]: value } : null);
  };

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      if (isEditMode) {
        await fetchMaterialData();
        await fetchVariants();
      } else {
        initialFormDataRef.current = { ...defaultFormData };
        setLoading(false);
      }
    };

    loadData();
  }, [isEditMode, fetchMaterialData, fetchVariants]);

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
      </div>

      {/* Variants Section - Only in Edit Mode */}
      {isEditMode && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm px-6 py-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base font-semibold text-default-800 dark:text-gray-100">
              Variants
            </h2>
            <Button
              size="sm"
              variant="outline"
              icon={IconPlus}
              onClick={handleAddVariant}
              disabled={editingVariant !== null}
            >
              Add Variant
            </Button>
          </div>

          <p className="text-xs text-default-500 dark:text-gray-400 mb-3">
            Define multiple variants (e.g., different suppliers, package sizes) for this material.
            Each variant can have its own default cost and will appear as separate rows in stock entry.
          </p>

          {variants.length === 0 && !editingVariant ? (
            <div className="text-center py-6 text-default-400 dark:text-gray-500 text-sm">
              No variants defined. This material will appear as a single row in stock entry.
            </div>
          ) : (
            <div className="overflow-hidden border border-default-200 dark:border-gray-700 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Variant Name
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">
                      Default Cost
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-20">
                      Order
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">
                      Status
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-20">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {/* Editing Row (for new or edit) */}
                  {editingVariant && (
                    <tr className="bg-sky-50 dark:bg-sky-900/20">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editingVariant.variant_name}
                          onChange={(e) => handleVariantInputChange("variant_name", e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          placeholder="e.g., Vietnam (Coklat)"
                          autoFocus
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={editingVariant.default_unit_cost}
                          onChange={(e) => handleVariantInputChange("default_unit_cost", parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 text-sm text-right border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          step="0.01"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={editingVariant.sort_order}
                          onChange={(e) => handleVariantInputChange("sort_order", parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-sm text-center border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editingVariant.is_active ? "active" : "inactive"}
                          onChange={(e) => handleVariantInputChange("is_active", e.target.value === "active")}
                          className="w-full px-2 py-1 text-xs border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={handleSaveVariant}
                            disabled={isSavingVariant}
                            className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                            title="Save"
                          >
                            <IconCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancelEditVariant}
                            className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="Cancel"
                          >
                            <IconX className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Existing Variants */}
                  {variants.map((variant) => (
                    <tr key={variant.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-3 py-2 text-sm text-default-900 dark:text-gray-100">
                        {variant.variant_name}
                      </td>
                      <td className="px-3 py-2 text-sm text-right font-mono text-default-900 dark:text-gray-100">
                        {parseFloat(String(variant.default_unit_cost)).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-default-600 dark:text-gray-400">
                        {variant.sort_order}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {variant.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900/30 dark:text-green-300">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-full dark:bg-gray-700 dark:text-gray-400">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditVariant(variant)}
                            disabled={editingVariant !== null}
                            className="p-1 text-gray-500 hover:text-sky-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                            title="Edit"
                          >
                            <IconPencil className="w-4 h-4" />
                          </button>
                          {variant.is_active && (
                            <button
                              onClick={() => handleDeleteVariantClick(variant)}
                              disabled={editingVariant !== null}
                              className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                              title="Deactivate"
                            >
                              <IconTrash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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

      {/* Delete Variant Confirmation */}
      <ConfirmationDialog
        isOpen={showDeleteVariantDialog}
        onClose={() => {
          setShowDeleteVariantDialog(false);
          setVariantToDelete(null);
        }}
        onConfirm={handleConfirmDeleteVariant}
        title="Deactivate Variant"
        message={`Are you sure you want to deactivate variant "${variantToDelete?.variant_name}"? This variant will be hidden but not permanently deleted.`}
        confirmButtonText="Deactivate"
        variant="danger"
      />
    </div>
  );
};

export default MaterialFormPage;

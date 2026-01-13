// src/pages/Stock/Materials/MaterialsListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconCheck,
  IconX,
  IconRefresh,
  IconPackage,
  IconEye,
  IconEyeOff,
  IconChevronRight,
  IconChevronDown,
  IconStack2,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { api } from "../../../routes/utils/api";
import { Material, MaterialCategory, MaterialVariant } from "../../../types/types";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import clsx from "clsx";

// Category labels for display
const categoryLabels: Record<MaterialCategory, string> = {
  ingredient: "Ingredient",
  raw_material: "Raw Material",
  packing_material: "Packing Material",
};

// Category pill options
const categoryPills = [
  { value: "all", label: "All" },
  { value: "ingredient", label: "Ingredients" },
  { value: "raw_material", label: "Raw Materials" },
  { value: "packing_material", label: "Packing" },
];

// Extended material with variants
interface MaterialWithVariants extends Material {
  variants?: MaterialVariant[];
  variantCount?: number;
}

const MaterialsListPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [materials, setMaterials] = useState<MaterialWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<number>>(new Set());

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<Material | null>(null);

  // Reactivate dialog
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [materialToReactivate, setMaterialToReactivate] = useState<Material | null>(null);

  // Fetch materials with variant counts
  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== "all") {
        params.append("category", selectedCategory);
      }
      if (!showInactive) {
        params.append("is_active", "true");
      }

      const response = await api.get(`/api/materials?${params.toString()}`);
      const materialsData = response || [];

      // Fetch variants for all materials in a single batch request
      const materialIds = materialsData.map((m: Material) => m.id);
      let variantsByMaterial: Record<number, MaterialVariant[]> = {};

      if (materialIds.length > 0) {
        variantsByMaterial = await api.post(`/api/materials/batch/variants`, {
          material_ids: materialIds,
          is_active: true,
        });
      }

      // Attach variant counts and variants to materials
      const materialsWithVariants = materialsData.map((m: Material) => ({
        ...m,
        variants: variantsByMaterial[m.id] || [],
        variantCount: (variantsByMaterial[m.id] || []).length,
      }));

      setMaterials(materialsWithVariants);
    } catch (error) {
      console.error("Error fetching materials:", error);
      toast.error("Failed to load materials");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, [selectedCategory, showInactive]);

  // Filter materials by search term
  const filteredMaterials = useMemo(() => {
    if (!searchTerm) return materials;

    const term = searchTerm.toLowerCase();
    return materials.filter(
      (m) =>
        m.code.toLowerCase().includes(term) ||
        m.name.toLowerCase().includes(term) ||
        m.variants?.some((v) => v.variant_name.toLowerCase().includes(term))
    );
  }, [materials, searchTerm]);

  // Group materials by category for display
  const groupedMaterials = useMemo(() => {
    const groups: Record<MaterialCategory, MaterialWithVariants[]> = {
      ingredient: [],
      raw_material: [],
      packing_material: [],
    };

    filteredMaterials.forEach((m) => {
      if (groups[m.category]) {
        groups[m.category].push(m);
      }
    });

    return groups;
  }, [filteredMaterials]);

  // Toggle material expansion
  const toggleMaterialExpansion = (materialId: number) => {
    setExpandedMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) {
        next.delete(materialId);
      } else {
        next.add(materialId);
      }
      return next;
    });
  };

  // Count materials with variants
  const materialsWithVariantsCount = useMemo(() => {
    return materials.filter((m) => (m.variantCount || 0) > 0).length;
  }, [materials]);

  // Handle delete
  const handleDeleteClick = (material: Material) => {
    setMaterialToDelete(material);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!materialToDelete) return;

    try {
      await api.delete(`/api/materials/${materialToDelete.id}`);
      toast.success(`Material "${materialToDelete.name}" deactivated`);
      fetchMaterials();
    } catch (error: any) {
      console.error("Error deleting material:", error);
      toast.error(error.message || "Failed to delete material");
    } finally {
      setShowDeleteDialog(false);
      setMaterialToDelete(null);
    }
  };

  // Handle reactivate
  const handleReactivateClick = (material: Material) => {
    setMaterialToReactivate(material);
    setShowReactivateDialog(true);
  };

  const handleConfirmReactivate = async () => {
    if (!materialToReactivate) return;

    try {
      await api.put(`/api/materials/${materialToReactivate.id}`, {
        ...materialToReactivate,
        is_active: true,
      });
      toast.success(`Material "${materialToReactivate.name}" reactivated`);
      fetchMaterials();
    } catch (error: any) {
      console.error("Error reactivating material:", error);
      toast.error(error.message || "Failed to reactivate material");
    } finally {
      setShowReactivateDialog(false);
      setMaterialToReactivate(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Header Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category Pills */}
        <div className="flex items-center gap-1">
          {categoryPills.map((pill) => (
            <button
              key={pill.value}
              onClick={() => setSelectedCategory(pill.value)}
              className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                selectedCategory === pill.value
                  ? "bg-default-600 text-white dark:bg-default-500"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <span className="text-default-300 dark:text-gray-600">|</span>

        {/* Stats */}
        <div className="flex items-center gap-2 text-sm">
          <IconPackage size={16} className="text-default-500 dark:text-gray-400" />
          <span className="font-medium text-default-700 dark:text-gray-200">
            {filteredMaterials.length}
          </span>
          <span className="text-default-400 dark:text-gray-400">materials</span>
          {materialsWithVariantsCount > 0 && (
            <>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <IconStack2 size={14} className="text-purple-500 dark:text-purple-400" />
              <span className="text-purple-600 dark:text-purple-400 font-medium">
                {materialsWithVariantsCount}
              </span>
              <span className="text-default-400 dark:text-gray-400">with variants</span>
            </>
          )}
        </div>

        <span className="text-default-300 dark:text-gray-600">•</span>

        {/* Show Inactive Toggle */}
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`inline-flex items-center gap-1.5 px-2 py-1 text-sm rounded-full transition-colors ${
            showInactive
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
          title={showInactive ? "Showing all (including inactive)" : "Showing active only"}
        >
          {showInactive ? (
            <IconEye size={14} />
          ) : (
            <IconEyeOff size={14} />
          )}
          <span>{showInactive ? "All" : "Active"}</span>
        </button>

        {/* Right side: Search + Add Button */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1 pr-7 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-default-500 dark:focus:ring-default-400 focus:border-default-500 dark:focus:border-default-400 w-[140px] placeholder-gray-400 dark:placeholder-gray-500"
            />
            {searchTerm && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300 transition-colors"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          {/* Add Button */}
          <Button
            onClick={() => navigate("/materials/new")}
            size="sm"
            icon={IconPlus}
          >
            New
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Material
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Default Cost
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Applies To
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {selectedCategory === "all" ? (
              // Grouped view when showing all categories
              Object.entries(groupedMaterials).map(([category, items]) => {
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={category}>
                    {/* Category Header */}
                    <tr className="bg-gray-100 dark:bg-gray-700/50">
                      <td colSpan={6} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {categoryLabels[category as MaterialCategory]} ({items.length})
                      </td>
                    </tr>
                    {/* Category Items */}
                    {items.map((material) => (
                      <MaterialRow
                        key={material.id}
                        material={material}
                        isExpanded={expandedMaterials.has(material.id)}
                        onToggleExpand={() => toggleMaterialExpansion(material.id)}
                        onEdit={() => navigate(`/materials/${material.id}`)}
                        onDelete={() => handleDeleteClick(material)}
                        onReactivate={() => handleReactivateClick(material)}
                      />
                    ))}
                  </React.Fragment>
                );
              })
            ) : (
              // Flat view when filtering by category
              filteredMaterials.map((material) => (
                <MaterialRow
                  key={material.id}
                  material={material}
                  isExpanded={expandedMaterials.has(material.id)}
                  onToggleExpand={() => toggleMaterialExpansion(material.id)}
                  onEdit={() => navigate(`/materials/${material.id}`)}
                  onDelete={() => handleDeleteClick(material)}
                  onReactivate={() => handleReactivateClick(material)}
                />
              ))
            )}

            {filteredMaterials.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No materials found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setMaterialToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Deactivate Material"
        message={`Are you sure you want to deactivate "${materialToDelete?.name}"? This material will be hidden but not permanently deleted.`}
        confirmButtonText="Deactivate"
        variant="danger"
      />

      {/* Reactivate Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showReactivateDialog}
        onClose={() => {
          setShowReactivateDialog(false);
          setMaterialToReactivate(null);
        }}
        onConfirm={handleConfirmReactivate}
        title="Reactivate Material"
        message={`Are you sure you want to reactivate "${materialToReactivate?.name}"? This material will be visible and available for use again.`}
        confirmButtonText="Reactivate"
        variant="success"
      />
    </div>
  );
};

// Material Row Component
interface MaterialRowProps {
  material: MaterialWithVariants;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReactivate: () => void;
}

const MaterialRow: React.FC<MaterialRowProps> = ({
  material,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onReactivate,
}) => {
  const formatCost = (cost: number | string) => Number(cost).toFixed(2);
  const hasVariants = (material.variantCount || 0) > 0;

  const appliesTo = material.applies_to === "both"
    ? "MEE & BIHUN"
    : material.applies_to.toUpperCase();

  return (
    <>
      {/* Main Material Row */}
      <tr
        className={clsx(
          "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors",
          hasVariants && "cursor-pointer",
          hasVariants && isExpanded && "bg-purple-50/50 dark:bg-purple-900/10"
        )}
        onClick={hasVariants ? onToggleExpand : undefined}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            {hasVariants && (
              <div className="p-0.5 rounded bg-purple-100 dark:bg-gray-700">
                {isExpanded ? (
                  <IconChevronDown size={14} className="text-purple-600 dark:text-gray-300" />
                ) : (
                  <IconChevronRight size={14} className="text-purple-500 dark:text-gray-400" />
                )}
              </div>
            )}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {material.code}
                </span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {material.name}
                </span>
                {hasVariants && (
                  <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full">
                    {material.variantCount} variant{material.variantCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {categoryLabels[material.category]}
          </span>
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap text-right">
          <span className="font-mono text-sm text-gray-900 dark:text-white">
            {formatCost(material.default_unit_cost)}
          </span>
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap text-center">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            material.applies_to === "both"
              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
              : material.applies_to === "mee"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
          }`}>
            {appliesTo}
          </span>
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap text-center">
          {material.is_active ? (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900/30 dark:text-green-300">
              <IconCheck className="w-3 h-3 mr-0.5" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-full dark:bg-gray-700 dark:text-gray-400">
              <IconX className="w-3 h-3 mr-0.5" />
              Inactive
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-500 hover:text-sky-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Edit"
            >
              <IconPencil className="w-4 h-4" />
            </button>
            {material.is_active ? (
              <button
                onClick={onDelete}
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Deactivate"
              >
                <IconTrash className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onReactivate}
                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Reactivate"
              >
                <IconRefresh className="w-4 h-4" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Variant Rows (when expanded) */}
      {hasVariants && isExpanded && material.variants?.map((variant, idx) => (
        <tr
          key={variant.id}
          className={clsx(
            "bg-purple-50/30 dark:bg-gray-800 border-l-2 border-purple-200 dark:border-purple-900/50",
            idx === material.variants!.length - 1 ? "" : "border-b border-dashed border-purple-100 dark:border-gray-700"
          )}
        >
          <td className="px-4 py-1.5 pl-14">
            <div className="flex items-center gap-2">
              <span className="text-purple-300 dark:text-gray-600">└</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {variant.variant_name}
              </span>
            </div>
          </td>
          <td className="px-4 py-1.5"></td>
          <td className="px-4 py-1.5 text-right">
            <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
              {formatCost(variant.default_unit_cost)}
            </span>
          </td>
          <td className="px-4 py-1.5"></td>
          <td className="px-4 py-1.5 text-center">
            {variant.is_active ? (
              <span className="text-xs text-green-600 dark:text-green-400">Active</span>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">Inactive</span>
            )}
          </td>
          <td className="px-4 py-1.5"></td>
        </tr>
      ))}
    </>
  );
};

export default MaterialsListPage;

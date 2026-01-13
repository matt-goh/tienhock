// src/pages/Stock/Materials/MaterialStockEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import {
  MaterialWithStock,
  MaterialCategory,
  ProductLine,
  MaterialStockEntryInput,
  StockEntryRow,
} from "../../../types/types";
import {
  IconDeviceFloppy,
  IconPackage,
  IconBox,
  IconAlertTriangle,
  IconBuildingFactory2,
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import clsx from "clsx";
import Button from "../../../components/Button";
import MonthNavigator from "../../../components/MonthNavigator";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useProductsCache } from "../../../utils/invoice/useProductsCache";

// Stock Kilang item from products/stock movements
interface StockKilangItem {
  product_id: string;
  name: string;
  price: number;
  closing_quantity: number;
  closing_value: number;
}

// Category labels (stock_kilang comes from products, not materials table)
const categoryLabels: Record<MaterialCategory, string> = {
  ingredient: "Ingredients",
  raw_material: "Raw Materials",
  packing_material: "Packing Materials",
};

// Category order (stock_kilang handled separately from products)
const categoryOrder: MaterialCategory[] = [
  "ingredient",
  "raw_material",
  "packing_material",
];

const MaterialStockEntryPage: React.FC = () => {
  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());

  // Tab state
  const [activeTab, setActiveTab] = useState<ProductLine>("mee");

  // Materials state
  const [materials, setMaterials] = useState<MaterialWithStock[]>([]);
  const [originalMaterials, setOriginalMaterials] = useState<MaterialWithStock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stock Kilang state (from products)
  const [stockKilang, setStockKilang] = useState<StockKilangItem[]>([]);
  const [isLoadingStockKilang, setIsLoadingStockKilang] = useState(false);

  // Variant expansion state (tracks which materials are expanded to show variants)
  const [expandedMaterials, setExpandedMaterials] = useState<Set<number>>(new Set());

  // New variant row state (tracks materials with a new ad-hoc variant being added)
  const [newVariantRows, setNewVariantRows] = useState<Map<number, StockEntryRow>>(new Map());

  // Collapse all toggle state
  const [allCollapsed, setAllCollapsed] = useState(false);

  // Get products for stock kilang (MEE or BH based on active tab)
  const productType = activeTab === "mee" ? "mee" : "bh";
  const { products, isLoading: isLoadingProducts } = useProductsCache(productType);

  // Get year and month from selected date
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1; // 1-12

  // Fetch materials with stock data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get(
        `/api/materials/stock/with-opening?year=${year}&month=${month}&product_line=${activeTab}`
      );

      const data = response.materials || [];
      setMaterials(data);
      setOriginalMaterials(JSON.parse(JSON.stringify(data))); // Deep copy

      // Auto-expand materials that have variants
      const materialsWithVariants = data
        .filter((m: MaterialWithStock) => m.has_variants && m.variants && m.variants.length > 0)
        .map((m: MaterialWithStock) => m.id);
      setExpandedMaterials(new Set(materialsWithVariants));

      // Clear new variant rows on data refresh
      setNewVariantRows(new Map());
    } catch (error) {
      console.error("Error fetching materials:", error);
      toast.error("Failed to load materials data");
      setMaterials([]);
      setOriginalMaterials([]);
    } finally {
      setIsLoading(false);
    }
  }, [year, month, activeTab]);

  // Fetch data when month or tab changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch Stock Kilang data from products using batch endpoint (more efficient)
  useEffect(() => {
    const fetchStockKilang = async () => {
      if (products.length === 0 || isLoadingProducts) return;

      setIsLoadingStockKilang(true);
      try {
        // Get product IDs as comma-separated string
        const productIds = products.map((p) => p.id).join(",");

        // Fetch closing balances in a single API call
        const response = await api.get(
          `/api/stock/closing-batch?product_ids=${productIds}&year=${year}&month=${month}`
        );

        const closingBalances = response.closing_balances || {};

        // Build stock data from products and closing balances
        const stockData: StockKilangItem[] = products.map((product) => {
          const closingQty = closingBalances[product.id] || 0;
          const price = parseFloat(String(product.price_per_unit)) || 0;

          return {
            product_id: product.id,
            name: product.description,
            price: price,
            closing_quantity: closingQty,
            closing_value: closingQty * price,
          };
        });

        // Filter out items with zero closing quantity
        setStockKilang(stockData.filter((item) => item.closing_quantity > 0));
      } catch (error) {
        console.error("Error fetching stock kilang:", error);
        setStockKilang([]);
      } finally {
        setIsLoadingStockKilang(false);
      }
    };

    fetchStockKilang();
  }, [products, isLoadingProducts, year, month]);

  // Group materials by category
  const groupedMaterials = useMemo(() => {
    const groups: Record<MaterialCategory, MaterialWithStock[]> = {
      ingredient: [],
      raw_material: [],
      packing_material: [],
    };

    materials.forEach((m) => {
      if (groups[m.category]) {
        groups[m.category].push(m);
      }
    });

    return groups;
  }, [materials]);

  // Calculate if there are unsaved changes (compare by material ID)
  const hasUnsavedChanges = useMemo(() => {
    // Check if there are new variant rows with data
    if (newVariantRows.size > 0) {
      for (const row of newVariantRows.values()) {
        if (row.variant_name?.trim() || row.purchases_quantity > 0 || row.consumption_quantity > 0 || row.unit_cost > 0) {
          return true;
        }
      }
    }

    if (materials.length !== originalMaterials.length) return true;

    // Create a map of original materials by ID for faster lookup
    const originalMap = new Map(
      originalMaterials.map((m) => [m.id, m])
    );

    for (const current of materials) {
      const original = originalMap.get(current.id);

      // If material doesn't exist in original, there's a change
      if (!original) return true;

      // Check non-variant material fields
      if (
        current.purchases_quantity !== original.purchases_quantity ||
        current.consumption_quantity !== original.consumption_quantity ||
        current.unit_cost !== original.unit_cost
      ) {
        return true;
      }

      // Check variant fields
      if (current.has_variants && current.variants && original.variants) {
        for (const cv of current.variants) {
          const ov = original.variants.find((v) => v.variant_id === cv.variant_id);
          if (!ov) return true;
          if (
            cv.purchases_quantity !== ov.purchases_quantity ||
            cv.consumption_quantity !== ov.consumption_quantity ||
            cv.unit_cost !== ov.unit_cost ||
            cv.variant_name !== ov.variant_name
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }, [materials, originalMaterials, newVariantRows]);

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

  // Toggle all materials expansion
  const toggleAllExpansion = () => {
    const materialsWithVariants = materials
      .filter((m) => m.has_variants && m.variants && m.variants.length > 0)
      .map((m) => m.id);

    if (allCollapsed) {
      // Expand all
      setExpandedMaterials(new Set(materialsWithVariants));
      setAllCollapsed(false);
    } else {
      // Collapse all
      setExpandedMaterials(new Set());
      setAllCollapsed(true);
    }
  };

  // Count materials with variants
  const variantMaterialCount = useMemo(() => {
    return materials.filter((m) => m.has_variants && m.variants && m.variants.length > 0).length;
  }, [materials]);

  // Add new variant row for a material
  const handleAddVariantRow = (materialId: number, defaultUnitCost: number) => {
    const newRow: StockEntryRow = {
      entry_id: null,
      variant_id: null,
      variant_name: "",
      is_new_variant: true,
      opening_quantity: 0,
      opening_value: 0,
      purchases_quantity: 0,
      purchases_value: 0,
      consumption_quantity: 0,
      closing_quantity: 0,
      closing_value: 0,
      unit_cost: defaultUnitCost,
      notes: null,
    };
    setNewVariantRows((prev) => new Map(prev).set(materialId, newRow));
    // Ensure material is expanded
    setExpandedMaterials((prev) => new Set(prev).add(materialId));
  };

  // Cancel adding new variant
  const handleCancelNewVariant = (materialId: number) => {
    setNewVariantRows((prev) => {
      const next = new Map(prev);
      next.delete(materialId);
      return next;
    });
  };

  // Update variant name (for existing variants)
  const handleVariantNameChange = (
    materialId: number,
    variantId: number | null,
    newName: string
  ) => {
    setMaterials((prev) =>
      prev.map((m) => {
        if (m.id === materialId && m.has_variants && m.variants) {
          const updatedVariants = m.variants.map((v) => {
            if (v.variant_id === variantId) {
              return { ...v, variant_name: newName };
            }
            return v;
          });
          return { ...m, variants: updatedVariants };
        }
        return m;
      })
    );
  };

  // Update new variant row
  const handleNewVariantChange = (
    materialId: number,
    field: keyof StockEntryRow,
    value: string | number
  ) => {
    setNewVariantRows((prev) => {
      const next = new Map(prev);
      const row = next.get(materialId);
      if (row) {
        const updated = { ...row };
        if (field === "variant_name") {
          updated.variant_name = String(value);
        } else if (field === "unit_cost" || field === "purchases_quantity" || field === "consumption_quantity") {
          const numValue = parseFloat(String(value)) || 0;
          (updated as any)[field] = numValue;
          // Recalculate
          updated.closing_quantity = updated.opening_quantity + updated.purchases_quantity - updated.consumption_quantity;
          updated.purchases_value = updated.purchases_quantity * updated.unit_cost;
          updated.closing_value = updated.closing_quantity * updated.unit_cost;
        }
        next.set(materialId, updated);
      }
      return next;
    });
  };

  // Handle input change for purchases, consumption, unit_cost, or custom_description
  // Now supports both material-level and variant-level changes
  const handleInputChange = (
    materialId: number,
    field: "purchases_quantity" | "consumption_quantity" | "unit_cost" | "custom_description",
    value: string,
    variantId?: number | null
  ) => {
    setMaterials((prev) =>
      prev.map((m) => {
        if (m.id === materialId) {
          // If this is a variant-level change
          if (variantId !== undefined && m.has_variants && m.variants) {
            const updatedVariants = m.variants.map((v) => {
              if (v.variant_id === variantId) {
                const updated = { ...v };
                if (field === "custom_description") {
                  // Variants use variant_name instead
                  return updated;
                } else {
                  const numValue = parseFloat(value) || 0;
                  (updated as any)[field] = numValue;
                }
                // Recalculate variant closing
                updated.closing_quantity = updated.opening_quantity + updated.purchases_quantity - updated.consumption_quantity;
                updated.purchases_value = updated.purchases_quantity * updated.unit_cost;
                updated.closing_value = updated.closing_quantity * updated.unit_cost;
                return updated;
              }
              return v;
            });

            // Recalculate material totals from variants
            const totalOpening = updatedVariants.reduce((sum, v) => sum + v.opening_quantity, 0);
            const totalOpeningValue = updatedVariants.reduce((sum, v) => sum + v.opening_value, 0);
            const totalPurchases = updatedVariants.reduce((sum, v) => sum + v.purchases_quantity, 0);
            const totalPurchasesValue = updatedVariants.reduce((sum, v) => sum + v.purchases_value, 0);
            const totalConsumption = updatedVariants.reduce((sum, v) => sum + v.consumption_quantity, 0);
            const totalClosing = updatedVariants.reduce((sum, v) => sum + v.closing_quantity, 0);
            const totalClosingValue = updatedVariants.reduce((sum, v) => sum + v.closing_value, 0);

            return {
              ...m,
              variants: updatedVariants,
              opening_quantity: totalOpening,
              opening_value: totalOpeningValue,
              purchases_quantity: totalPurchases,
              purchases_value: totalPurchasesValue,
              consumption_quantity: totalConsumption,
              closing_quantity: totalClosing,
              closing_value: totalClosingValue,
            };
          }

          // Material-level change (non-variant materials)
          const updated = { ...m };

          if (field === "custom_description") {
            updated.custom_description = value || null;
          } else {
            const numValue = parseFloat(value) || 0;
            updated[field] = numValue;
          }

          // Recalculate closing quantity and values
          updated.closing_quantity =
            updated.opening_quantity + updated.purchases_quantity - updated.consumption_quantity;
          updated.purchases_value = updated.purchases_quantity * updated.unit_cost;
          updated.closing_value = updated.closing_quantity * updated.unit_cost;

          return updated;
        }
        return m;
      })
    );
  };

  // Before month change - check for unsaved changes
  const handleBeforeMonthChange = useCallback(() => {
    if (hasUnsavedChanges) {
      return window.confirm(
        "You have unsaved changes. Do you want to discard them?"
      );
    }
    return true;
  }, [hasUnsavedChanges]);

  // Handle tab change
  const handleTabChange = (tab: ProductLine) => {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Do you want to discard them?")) {
        return;
      }
    }
    setActiveTab(tab);
  };

  // Save entries
  const handleSave = async () => {
    // Check for negative closing quantities (including variants)
    let negativeCount = 0;
    materials.forEach((m) => {
      if (m.has_variants && m.variants) {
        negativeCount += m.variants.filter((v) => v.closing_quantity < 0).length;
      } else if (m.closing_quantity < 0) {
        negativeCount++;
      }
    });

    if (negativeCount > 0) {
      const confirmed = window.confirm(
        `Warning: ${negativeCount} item(s) have negative closing stock. Do you want to save anyway?`
      );
      if (!confirmed) return;
    }

    // Check for new variants that need names
    const incompleteNewVariants: string[] = [];
    newVariantRows.forEach((row, materialId) => {
      if ((row.purchases_quantity > 0 || row.consumption_quantity > 0) && !row.variant_name?.trim()) {
        const material = materials.find((m) => m.id === materialId);
        incompleteNewVariants.push(material?.name || `Material ${materialId}`);
      }
    });

    if (incompleteNewVariants.length > 0) {
      toast.error(`Please enter a name for new variants in: ${incompleteNewVariants.join(", ")}`);
      return;
    }

    setIsSaving(true);
    try {
      // First, update any changed variant names
      const variantNameUpdates: Promise<void>[] = [];
      const originalMap = new Map(originalMaterials.map((m) => [m.id, m]));

      materials.forEach((m) => {
        if (m.has_variants && m.variants) {
          const original = originalMap.get(m.id);
          if (original?.variants) {
            m.variants.forEach((v) => {
              if (v.variant_id) {
                const ov = original.variants?.find((ov) => ov.variant_id === v.variant_id);
                if (ov && v.variant_name !== ov.variant_name && v.variant_name?.trim()) {
                  // Update variant name via API
                  variantNameUpdates.push(
                    api.put(`/api/materials/variants/${v.variant_id}`, {
                      variant_name: v.variant_name.trim(),
                      default_unit_cost: v.unit_cost,
                    }).catch((err) => {
                      console.error(`Failed to update variant ${v.variant_id}:`, err);
                    })
                  );
                }
              }
            });
          }
        }
      });

      // Wait for all variant name updates
      if (variantNameUpdates.length > 0) {
        await Promise.all(variantNameUpdates);
      }

      // Build stock entries
      const entries: MaterialStockEntryInput[] = [];

      materials.forEach((m) => {
        if (m.has_variants && m.variants && m.variants.length > 0) {
          // Add entries for each variant
          m.variants.forEach((v) => {
            entries.push({
              material_id: m.id,
              variant_id: v.variant_id,
              purchases_quantity: v.purchases_quantity,
              consumption_quantity: v.consumption_quantity,
              unit_cost: v.unit_cost,
              custom_name: null,
              custom_description: v.variant_id ? null : v.variant_name, // Ad-hoc variants use custom_description
              notes: v.notes || null,
            });
          });
        } else {
          // Non-variant material: single entry
          entries.push({
            material_id: m.id,
            variant_id: null,
            purchases_quantity: m.purchases_quantity,
            consumption_quantity: m.consumption_quantity,
            unit_cost: m.unit_cost,
            custom_name: m.custom_name || null,
            custom_description: null,
            notes: m.closing_notes || null,
          });
        }
      });

      // Add new variant rows (will be registered as permanent variants)
      newVariantRows.forEach((row, materialId) => {
        if (row.variant_name?.trim() && (row.purchases_quantity > 0 || row.consumption_quantity > 0 || row.unit_cost > 0)) {
          entries.push({
            material_id: materialId,
            variant_id: null,
            purchases_quantity: row.purchases_quantity,
            consumption_quantity: row.consumption_quantity,
            unit_cost: row.unit_cost,
            custom_name: null,
            custom_description: row.variant_name.trim(),
            notes: null,
            register_variant: true, // Signal to register as permanent variant
          });
        }
      });

      const response = await api.post("/api/materials/stock/batch", {
        year,
        month,
        product_line: activeTab,
        entries,
      });

      // Build success message
      const messages: string[] = [];
      if (variantNameUpdates.length > 0) {
        messages.push(`${variantNameUpdates.length} variant name(s) updated`);
      }
      if (response.registered_variants && response.registered_variants.length > 0) {
        messages.push(`${response.registered_variants.length} new variant(s) registered`);
      }

      if (messages.length > 0) {
        toast.success(`Saved! ${messages.join(", ")}.`, { duration: 4000 });
      } else {
        toast.success("Stock entries saved successfully");
      }

      // Refresh to get updated data
      await fetchData();
    } catch (error: any) {
      console.error("Error saving stock entries:", error);
      toast.error(error.message || "Failed to save stock entries");
    } finally {
      setIsSaving(false);
    }
  };

  // Format number with 2 decimal places
  const formatNumber = (value: number) => {
    return value.toLocaleString("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Format quantity (up to 4 decimal places, but trim trailing zeros)
  const formatQty = (value: number) => {
    return value.toLocaleString("en-MY", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  };

  // Calculate category totals
  const categoryTotals = useMemo(() => {
    const totals: Record<MaterialCategory, { opening: number; purchases: number; closing: number }> = {
      ingredient: { opening: 0, purchases: 0, closing: 0 },
      raw_material: { opening: 0, purchases: 0, closing: 0 },
      packing_material: { opening: 0, purchases: 0, closing: 0 },
    };

    materials.forEach((m) => {
      if (totals[m.category]) {
        totals[m.category].opening += m.opening_value;
        totals[m.category].purchases += m.purchases_value;
        totals[m.category].closing += m.closing_value;
      }
    });

    return totals;
  }, [materials]);

  // Grand total (materials only)
  const grandTotal = useMemo(() => {
    return {
      opening: materials.reduce((sum, m) => sum + m.opening_value, 0),
      purchases: materials.reduce((sum, m) => sum + m.purchases_value, 0),
      closing: materials.reduce((sum, m) => sum + m.closing_value, 0),
    };
  }, [materials]);

  // Stock Kilang total
  const stockKilangTotal = useMemo(() => {
    return stockKilang.reduce((sum, item) => sum + item.closing_value, 0);
  }, [stockKilang]);

  // Count negative items
  const negativeCount = useMemo(() => {
    return materials.filter((m) => m.closing_quantity < 0).length;
  }, [materials]);

  return (
    <div className="space-y-3">
      {/* Header Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm px-6 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Left: Title & Stats */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <IconBox size={22} className="text-default-500 dark:text-gray-400" />
              <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                Stock Entry
              </h1>
            </div>
            <span className="text-default-300 dark:text-gray-600">|</span>
            {/* Stats */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-default-500 dark:text-gray-400">
                {materials.length} materials
              </span>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <span className="text-default-500 dark:text-gray-400">
                Mat: <span className="font-medium text-green-600 dark:text-green-400">RM {formatNumber(grandTotal.closing)}</span>
              </span>
              {stockKilang.length > 0 && (
                <>
                  <span className="text-default-300 dark:text-gray-600">•</span>
                  <span className="text-default-500 dark:text-gray-400">
                    FG: <span className="font-medium text-emerald-600 dark:text-emerald-400">RM {formatNumber(stockKilangTotal)}</span>
                  </span>
                </>
              )}
              <span className="text-default-300 dark:text-gray-600">•</span>
              <span className="text-default-500 dark:text-gray-400">
                Total: <span className="font-medium text-sky-600 dark:text-sky-400">RM {formatNumber(grandTotal.closing + stockKilangTotal)}</span>
              </span>
              {negativeCount > 0 && (
                <>
                  <span className="text-default-300 dark:text-gray-600">•</span>
                  <span className="text-red-500 flex items-center gap-1">
                    <IconAlertTriangle size={14} />
                    {negativeCount} negative
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-3">
            {/* Tab Pills */}
            <div className="flex items-center bg-default-100 dark:bg-gray-700 rounded-full p-0.5">
              <button
                onClick={() => handleTabChange("mee")}
                className={clsx(
                  "px-4 py-1 rounded-full text-sm font-medium transition-colors",
                  activeTab === "mee"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-default-600 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
                )}
              >
                MEE
              </button>
              <button
                onClick={() => handleTabChange("bihun")}
                className={clsx(
                  "px-4 py-1 rounded-full text-sm font-medium transition-colors",
                  activeTab === "bihun"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-default-600 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
                )}
              >
                BIHUN
              </button>
            </div>

            <span className="text-default-300 dark:text-gray-600">|</span>

            {/* Month Navigator */}
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={setSelectedMonth}
              beforeChange={handleBeforeMonthChange}
            />

            <span className="text-default-300 dark:text-gray-600">|</span>

            {/* Save Button */}
            <Button
              color="sky"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              icon={IconDeviceFloppy}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>

            {/* Unsaved indicator */}
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                • Unsaved
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      ) : (
        /* Table */
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Material</span>
                    {variantMaterialCount > 0 && (
                      <button
                        onClick={toggleAllExpansion}
                        className="text-purple-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-gray-200 text-[10px] font-normal normal-case flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 dark:bg-gray-700 rounded"
                        title={allCollapsed ? "Expand all variants" : "Collapse all variants"}
                      >
                        {allCollapsed ? <IconChevronRight size={10} /> : <IconChevronDown size={10} />}
                        {allCollapsed ? "Expand" : "Collapse"}
                      </button>
                    )}
                  </div>
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-20">
                  Open
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider w-24 bg-blue-50 dark:bg-blue-900/20">
                  Purchase
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider w-24 bg-orange-50 dark:bg-orange-900/20">
                  Consume
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-20">
                  Close
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-24">
                  Unit Cost
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-28">
                  Close Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-100 dark:divide-gray-700">
              {categoryOrder.map((category) => {
                const items = groupedMaterials[category];
                if (items.length === 0) return null;

                return (
                  <React.Fragment key={category}>
                    {/* Category Header */}
                    <tr className="bg-default-100 dark:bg-gray-700/50">
                      <td colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-default-700 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <IconPackage size={14} className="text-default-500" />
                          {categoryLabels[category]}
                          <span className="text-default-400 font-normal">({items.length})</span>
                        </div>
                      </td>
                      <td colSpan={2} className="px-2 py-1.5 text-xs text-center text-default-500 dark:text-gray-400">
                        +{formatNumber(categoryTotals[category].purchases)}
                      </td>
                      <td colSpan={3} className="px-2 py-1.5 text-xs text-right">
                        <span className="text-default-500 dark:text-gray-400">
                          {formatNumber(categoryTotals[category].opening)} →{" "}
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            {formatNumber(categoryTotals[category].closing)}
                          </span>
                        </span>
                      </td>
                    </tr>
                    {/* Category Items */}
                    {items.map((material) => {
                      const isNegative = material.closing_quantity < 0;
                      const hasVariants = material.has_variants && material.variants && material.variants.length > 0;
                      const isExpanded = expandedMaterials.has(material.id);
                      const newVariant = newVariantRows.get(material.id);

                      // Material with variants - show header + sub-rows
                      if (hasVariants) {
                        return (
                          <React.Fragment key={material.id}>
                            {/* Material Header Row (expandable, shows totals) */}
                            <tr
                              className={clsx(
                                "bg-gradient-to-r from-purple-50 to-purple-50/30 dark:from-gray-800 dark:to-gray-800 cursor-pointer hover:from-purple-100 hover:to-purple-50 dark:hover:from-gray-750 dark:hover:to-gray-800 border-l-2 border-purple-400 dark:border-purple-700/60",
                                isNegative && "from-red-50 to-red-50/30 dark:from-red-900/10 dark:to-gray-800 border-red-400 dark:border-red-700/60"
                              )}
                              onClick={() => toggleMaterialExpansion(material.id)}
                            >
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-2">
                                  <div className={clsx(
                                    "p-0.5 rounded",
                                    isExpanded ? "bg-purple-200 dark:bg-gray-700" : "bg-purple-100 dark:bg-gray-700/70"
                                  )}>
                                    {isExpanded ? (
                                      <IconChevronDown size={14} className="text-purple-600 dark:text-gray-300" />
                                    ) : (
                                      <IconChevronRight size={14} className="text-purple-500 dark:text-gray-400" />
                                    )}
                                  </div>
                                  <Link
                                    to={`/materials/${material.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm font-semibold text-default-800 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 hover:underline"
                                  >
                                    {material.name}
                                  </Link>
                                  <span className="text-xs text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                                    {material.code}
                                  </span>
                                  {isNegative && (
                                    <IconAlertTriangle size={14} className="text-red-500" title="Negative stock" />
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm text-default-500 dark:text-gray-400">
                                {formatQty(material.opening_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10">
                                {formatQty(material.purchases_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm font-medium text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-900/10">
                                {formatQty(material.consumption_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold text-default-700 dark:text-gray-200">
                                {formatQty(material.closing_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-center text-xs text-default-400 dark:text-gray-500">—</td>
                              <td className="px-2 py-1.5 text-right">
                                <span className="font-mono text-sm font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded">
                                  {formatNumber(material.closing_value)}
                                </span>
                              </td>
                            </tr>

                            {/* Variant Sub-rows (when expanded) */}
                            {isExpanded && material.variants!.map((variant, idx) => {
                              const variantNegative = variant.closing_quantity < 0;
                              const isLastVariant = idx === material.variants!.length - 1;
                              return (
                                <tr
                                  key={`${material.id}-${variant.variant_id || variant.variant_name}`}
                                  className={clsx(
                                    "bg-white dark:bg-gray-800 hover:bg-purple-50/50 dark:hover:bg-gray-750 border-l-2 border-purple-200 dark:border-purple-900/60",
                                    variantNegative && "bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-900/60",
                                    !isLastVariant && "border-b border-dashed border-default-100 dark:border-gray-700"
                                  )}
                                >
                                  <td className="px-3 py-1.5 pl-12">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-purple-300 dark:text-gray-600">└</span>
                                      <input
                                        type="text"
                                        value={variant.variant_name || ""}
                                        onChange={(e) => handleVariantNameChange(material.id, variant.variant_id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-sm text-default-700 dark:text-gray-300 bg-transparent border-b border-transparent hover:border-dashed hover:border-purple-300 dark:hover:border-gray-500 focus:outline-none focus:border-solid focus:border-purple-500 dark:focus:border-gray-400 px-1 py-0.5 min-w-[120px]"
                                        placeholder="Variant name..."
                                      />
                                      {variantNegative && (
                                        <IconAlertTriangle size={12} className="text-red-500" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono text-xs text-default-400 dark:text-gray-500">
                                    {formatQty(variant.opening_quantity)}
                                  </td>
                                  <td className="px-1 py-1 bg-blue-50/20 dark:bg-blue-900/5">
                                    <input
                                      type="number"
                                      value={variant.purchases_quantity || ""}
                                      onChange={(e) => handleInputChange(material.id, "purchases_quantity", e.target.value, variant.variant_id)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-2 py-0.5 text-right font-mono text-sm border border-blue-200 dark:border-blue-700 rounded bg-blue-50/50 dark:bg-blue-900/20 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700"
                                      min="0"
                                      step="1"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="px-1 py-1 bg-orange-50/20 dark:bg-orange-900/5">
                                    <input
                                      type="number"
                                      value={variant.consumption_quantity || ""}
                                      onChange={(e) => handleInputChange(material.id, "consumption_quantity", e.target.value, variant.variant_id)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-2 py-0.5 text-right font-mono text-sm border border-orange-200 dark:border-orange-700 rounded bg-orange-50/50 dark:bg-orange-900/20 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:bg-white dark:focus:bg-gray-700"
                                      min="0"
                                      step="1"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <span className={clsx(
                                      "font-mono text-sm",
                                      variantNegative ? "text-red-600 dark:text-red-400 font-medium" : "text-default-600 dark:text-gray-400"
                                    )}>
                                      {formatQty(variant.closing_quantity)}
                                    </span>
                                  </td>
                                  <td className="px-1 py-1">
                                    <input
                                      type="number"
                                      value={variant.unit_cost || ""}
                                      onChange={(e) => handleInputChange(material.id, "unit_cost", e.target.value, variant.variant_id)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-2 py-0.5 text-right font-mono text-sm border border-default-200 dark:border-gray-600 rounded bg-default-50 dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white"
                                      step="0.01"
                                      min="0"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <span className={clsx(
                                      "font-mono text-sm",
                                      variantNegative ? "text-red-600 dark:text-red-400" : variant.closing_value > 0 ? "text-green-600 dark:text-green-400" : "text-default-400 dark:text-gray-500"
                                    )}>
                                      {formatNumber(variant.closing_value)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}

                            {/* New Variant Row (when adding) */}
                            {isExpanded && newVariant && (
                              <tr className="bg-gradient-to-r from-sky-50 to-sky-50/30 dark:from-gray-800 dark:to-gray-800 border-l-2 border-sky-400 dark:border-sky-700/60">
                                <td className="px-3 py-1.5 pl-12">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sky-400 dark:text-gray-500">+</span>
                                    <input
                                      type="text"
                                      value={newVariant.variant_name || ""}
                                      onChange={(e) => handleNewVariantChange(material.id, "variant_name", e.target.value)}
                                      className="flex-1 px-2 py-0.5 text-sm border border-sky-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-700"
                                      placeholder="Enter variant name..."
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleCancelNewVariant(material.id)}
                                      className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                      title="Cancel"
                                    >
                                      <IconX size={14} />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono text-xs text-default-400 dark:text-gray-500">0</td>
                                <td className="px-1 py-1 bg-blue-50/30 dark:bg-blue-900/5">
                                  <input
                                    type="number"
                                    value={newVariant.purchases_quantity || ""}
                                    onChange={(e) => handleNewVariantChange(material.id, "purchases_quantity", e.target.value)}
                                    className="w-full px-2 py-0.5 text-right font-mono text-sm border border-blue-200 dark:border-blue-700 rounded bg-blue-50/50 dark:bg-blue-900/20 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                  />
                                </td>
                                <td className="px-1 py-1 bg-orange-50/30 dark:bg-orange-900/5">
                                  <input
                                    type="number"
                                    value={newVariant.consumption_quantity || ""}
                                    onChange={(e) => handleNewVariantChange(material.id, "consumption_quantity", e.target.value)}
                                    className="w-full px-2 py-0.5 text-right font-mono text-sm border border-orange-200 dark:border-orange-700 rounded bg-orange-50/50 dark:bg-orange-900/20 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:bg-white dark:focus:bg-gray-700"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono text-sm text-default-500 dark:text-gray-400">
                                  {formatQty(newVariant.closing_quantity)}
                                </td>
                                <td className="px-1 py-1">
                                  <input
                                    type="number"
                                    value={newVariant.unit_cost || ""}
                                    onChange={(e) => handleNewVariantChange(material.id, "unit_cost", e.target.value)}
                                    className="w-full px-2 py-0.5 text-right font-mono text-sm border border-default-200 dark:border-gray-600 rounded bg-default-50 dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white"
                                    step="0.01"
                                    min="0"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">
                                  {formatNumber(newVariant.closing_value)}
                                </td>
                              </tr>
                            )}

                            {/* Add Variant Button (when expanded and not already adding) */}
                            {isExpanded && !newVariant && (
                              <tr className="bg-white dark:bg-gray-800 border-l-2 border-purple-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-gray-500 transition-colors">
                                <td colSpan={7} className="px-3 py-1.5 pl-12">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddVariantRow(material.id, material.default_unit_cost);
                                    }}
                                    className="text-xs text-purple-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-gray-200 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    <IconPlus size={12} />
                                    Add new variant
                                  </button>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      }

                      // Material without variants - single editable row
                      return (
                        <React.Fragment key={material.id}>
                          <tr
                            className={clsx(
                              "group hover:bg-default-50 dark:hover:bg-gray-700/30 transition-colors",
                              isNegative && "bg-red-50/50 dark:bg-red-900/10"
                            )}
                          >
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/materials/${material.id}`}
                                  className="text-sm font-medium text-default-800 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400 hover:underline"
                                >
                                  {material.custom_name || material.name}
                                </Link>
                                <span className="text-xs text-default-500 dark:text-gray-500 bg-default-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                                  {material.code}
                                </span>
                                {isNegative && (
                                  <IconAlertTriangle
                                    size={14}
                                    className="text-red-500"
                                    title="Negative stock"
                                  />
                                )}
                                {/* Add variant button for non-variant materials */}
                                {!newVariant && (
                                  <button
                                    onClick={() => handleAddVariantRow(material.id, material.default_unit_cost)}
                                    className="text-xs text-default-400 hover:text-purple-500 dark:text-gray-500 dark:hover:text-purple-400 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                                    title="Add variant"
                                  >
                                    <IconPlus size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <span className="font-mono text-sm text-default-600 dark:text-gray-400">
                                {formatQty(material.opening_quantity)}
                              </span>
                            </td>
                            {/* Purchases input */}
                            <td className="px-1 py-1 bg-blue-50/50 dark:bg-blue-900/10">
                              <input
                                type="number"
                                value={material.purchases_quantity || ""}
                                onChange={(e) =>
                                  handleInputChange(material.id, "purchases_quantity", e.target.value)
                                }
                                className="w-full px-2 py-1 text-right font-mono text-sm border border-blue-200 dark:border-blue-800 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                min="0"
                                step="1"
                                placeholder="0"
                              />
                            </td>
                            {/* Consumption input */}
                            <td className="px-1 py-1 bg-orange-50/50 dark:bg-orange-900/10">
                              <input
                                type="number"
                                value={material.consumption_quantity || ""}
                                onChange={(e) =>
                                  handleInputChange(material.id, "consumption_quantity", e.target.value)
                                }
                                className="w-full px-2 py-1 text-right font-mono text-sm border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                                min="0"
                                step="1"
                                placeholder="0"
                              />
                            </td>
                            {/* Closing qty (calculated, readonly) */}
                            <td className="px-2 py-1.5 text-right">
                              <span
                                className={clsx(
                                  "font-mono text-sm font-medium",
                                  isNegative
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-default-700 dark:text-gray-300"
                                )}
                              >
                                {formatQty(material.closing_quantity)}
                              </span>
                            </td>
                            {/* Unit cost input */}
                            <td className="px-1 py-1">
                              <input
                                type="number"
                                value={material.unit_cost || ""}
                                onChange={(e) =>
                                  handleInputChange(material.id, "unit_cost", e.target.value)
                                }
                                className="w-full px-2 py-1 text-right font-mono text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                                step="0.05"
                                min="0"
                              />
                            </td>
                            {/* Closing value (calculated) */}
                            <td className="px-2 py-1.5 text-right">
                              <span
                                className={clsx(
                                  "font-mono text-sm font-medium",
                                  isNegative
                                    ? "text-red-600 dark:text-red-400"
                                    : material.closing_value > 0
                                      ? "text-green-600 dark:text-green-400"
                                      : "text-default-400 dark:text-gray-500"
                                )}
                              >
                                {formatNumber(material.closing_value)}
                              </span>
                            </td>
                          </tr>

                          {/* New Variant Row for non-variant materials (when adding) */}
                          {newVariant && (
                            <tr className="bg-gradient-to-r from-sky-50 to-sky-50/30 dark:from-gray-800 dark:to-gray-800 border-l-2 border-sky-400 dark:border-sky-700/60">
                              <td className="px-3 py-1.5 pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-sky-400 dark:text-gray-500">+</span>
                                  <input
                                    type="text"
                                    value={newVariant.variant_name || ""}
                                    onChange={(e) => handleNewVariantChange(material.id, "variant_name", e.target.value)}
                                    className="flex-1 px-2 py-0.5 text-sm border border-sky-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-700"
                                    placeholder="Enter variant name..."
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleCancelNewVariant(material.id)}
                                    className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                    title="Cancel"
                                  >
                                    <IconX size={14} />
                                  </button>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs text-default-400 dark:text-gray-500">0</td>
                              <td className="px-1 py-1 bg-blue-50/30 dark:bg-blue-900/5">
                                <input
                                  type="number"
                                  value={newVariant.purchases_quantity || ""}
                                  onChange={(e) => handleNewVariantChange(material.id, "purchases_quantity", e.target.value)}
                                  className="w-full px-2 py-0.5 text-right font-mono text-sm border border-blue-200 dark:border-blue-700 rounded bg-blue-50/50 dark:bg-blue-900/20 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700"
                                  min="0"
                                  step="1"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-1 py-1 bg-orange-50/30 dark:bg-orange-900/5">
                                <input
                                  type="number"
                                  value={newVariant.consumption_quantity || ""}
                                  onChange={(e) => handleNewVariantChange(material.id, "consumption_quantity", e.target.value)}
                                  className="w-full px-2 py-0.5 text-right font-mono text-sm border border-orange-200 dark:border-orange-700 rounded bg-orange-50/50 dark:bg-orange-900/20 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:bg-white dark:focus:bg-gray-700"
                                  min="0"
                                  step="1"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm text-default-500 dark:text-gray-400">
                                {formatQty(newVariant.closing_quantity)}
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  value={newVariant.unit_cost || ""}
                                  onChange={(e) => handleNewVariantChange(material.id, "unit_cost", e.target.value)}
                                  className="w-full px-2 py-0.5 text-right font-mono text-sm border border-default-200 dark:border-gray-600 rounded bg-default-50 dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white"
                                  step="0.01"
                                  min="0"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">
                                {formatNumber(newVariant.closing_value)}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {/* Stock Kilang Section - READ ONLY from Products */}
              {stockKilang.length > 0 && (
                <React.Fragment>
                  {/* Stock Kilang Header */}
                  <tr className="bg-emerald-100 dark:bg-emerald-900/30">
                    <td colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <div className="flex items-center gap-2">
                        <IconBuildingFactory2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                        Stock Kilang (Finished Goods)
                        <span className="text-emerald-500 dark:text-emerald-400 font-normal">
                          ({stockKilang.length}) - Auto from Production
                        </span>
                      </div>
                    </td>
                    <td colSpan={2} className="px-2 py-1.5 text-xs text-center text-emerald-600 dark:text-emerald-400">
                      Read-only
                    </td>
                    <td colSpan={3} className="px-2 py-1.5 text-xs text-right">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatNumber(stockKilangTotal)}
                      </span>
                    </td>
                  </tr>
                  {/* Stock Kilang Items */}
                  {stockKilang.map((item) => (
                    <tr
                      key={item.product_id}
                      className="bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    >
                      <td className="px-3 py-1.5">
                        <span className="text-sm text-default-700 dark:text-gray-300">
                          {item.name}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">
                        -
                      </td>
                      <td className="px-2 py-1.5 text-center text-default-300 dark:text-gray-600 bg-blue-50/30 dark:bg-blue-900/5">
                        -
                      </td>
                      <td className="px-2 py-1.5 text-center text-default-300 dark:text-gray-600 bg-orange-50/30 dark:bg-orange-900/5">
                        -
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          {formatQty(item.closing_quantity)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-sm text-default-500 dark:text-gray-400">
                        {formatNumber(item.price)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          {formatNumber(item.closing_value)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )}

              {/* Loading Stock Kilang */}
              {isLoadingStockKilang && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-default-400 dark:text-gray-500 text-sm">
                    Loading finished goods stock...
                  </td>
                </tr>
              )}

              {materials.length === 0 && stockKilang.length === 0 && !isLoadingStockKilang && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-default-500 dark:text-gray-400">
                    <IconPackage size={32} className="mx-auto mb-2 text-default-300 dark:text-gray-600" />
                    <p>No materials found for {activeTab.toUpperCase()} production</p>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Footer with totals */}
            {(materials.length > 0 || stockKilang.length > 0) && (
              <tfoot className="bg-default-100 dark:bg-gray-900/50 border-t border-default-200 dark:border-gray-700">
                {/* Materials subtotal */}
                {materials.length > 0 && (
                  <tr>
                    <td className="px-3 py-1.5 text-right text-sm text-default-600 dark:text-gray-400">
                      Materials:
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-default-500 dark:text-gray-500">
                      {formatNumber(grandTotal.opening)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20">
                      +{formatNumber(grandTotal.purchases)}
                    </td>
                    <td className="px-2 py-1.5 bg-orange-50 dark:bg-orange-900/20"></td>
                    <td></td>
                    <td></td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-green-600 dark:text-green-400">
                      {formatNumber(grandTotal.closing)}
                    </td>
                  </tr>
                )}
                {/* Stock Kilang subtotal */}
                {stockKilang.length > 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-1.5 text-right text-sm text-default-600 dark:text-gray-400">
                      Stock Kilang:
                    </td>
                    <td></td>
                    <td></td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                      {formatNumber(stockKilangTotal)}
                    </td>
                  </tr>
                )}
                {/* Grand Total */}
                <tr className="font-semibold border-t border-default-200 dark:border-gray-600">
                  <td colSpan={4} className="px-3 py-2 text-right text-sm text-default-700 dark:text-gray-300">
                    Grand Total:
                  </td>
                  <td></td>
                  <td></td>
                  <td className="px-2 py-2 text-right font-mono text-sm text-sky-600 dark:text-sky-400">
                    RM {formatNumber(grandTotal.closing + stockKilangTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default MaterialStockEntryPage;

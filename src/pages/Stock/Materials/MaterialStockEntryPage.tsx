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

interface StockKilangItem {
  product_id: string;
  name: string;
  price: number;
  closing_quantity: number;
  closing_value: number;
}

interface StockResponse {
  year: number;
  month: number;
  product_line: ProductLine;
  materials: MaterialWithStock[];
}

type EditableStockField = "adjustment_quantity" | "unit_cost";
type NewVariantField = "variant_name" | EditableStockField;

const categoryLabels: Record<MaterialCategory, string> = {
  ingredient: "Ingredients",
  raw_material: "Raw Materials",
  packing_material: "Packing Materials",
};

const categoryOrder: MaterialCategory[] = [
  "ingredient",
  "raw_material",
  "packing_material",
];

const stockTabs: { id: ProductLine; label: string; activeClass: string }[] = [
  { id: "mee", label: "MEE", activeClass: "bg-sky-500 text-white shadow-sm" },
  { id: "bihun", label: "BIHUN", activeClass: "bg-amber-500 text-white shadow-sm" },
  { id: "shared", label: "SHARED", activeClass: "bg-teal-500 text-white shadow-sm" },
];

const makeNumber = (value: number | string | null | undefined): number => {
  return parseFloat(String(value ?? "")) || 0;
};

const recalculateStock = <T extends StockEntryRow | MaterialWithStock>(
  item: T,
  adjustmentQuantity: number,
  unitCost: number
): T => {
  const adjustmentValue = adjustmentQuantity * unitCost;
  const closingQuantity =
    item.opening_quantity + item.purchase_quantity + adjustmentQuantity;
  const closingValue = item.opening_value + item.purchase_value + adjustmentValue;

  return {
    ...item,
    adjustment_quantity: adjustmentQuantity,
    adjustment_value: adjustmentValue,
    closing_quantity: closingQuantity,
    closing_value: closingValue,
    quantity: adjustmentQuantity,
    value: closingValue,
    unit_cost: unitCost,
  } as T;
};

const makeNewVariantRow = (defaultUnitCost: number): StockEntryRow => ({
  entry_id: null,
  variant_id: null,
  variant_name: "",
  custom_description: null,
  is_new_variant: true,
  opening_quantity: 0,
  opening_value: 0,
  purchase_quantity: 0,
  purchase_value: 0,
  adjustment_quantity: 0,
  adjustment_value: 0,
  closing_quantity: 0,
  closing_value: 0,
  quantity: 0,
  value: 0,
  unit_cost: defaultUnitCost,
  notes: null,
});

const MaterialStockEntryPage: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());
  const [activeTab, setActiveTab] = useState<ProductLine>("mee");
  const [materials, setMaterials] = useState<MaterialWithStock[]>([]);
  const [originalMaterials, setOriginalMaterials] = useState<MaterialWithStock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stockKilang, setStockKilang] = useState<StockKilangItem[]>([]);
  const [isLoadingStockKilang, setIsLoadingStockKilang] = useState(false);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<number>>(new Set());
  const [newVariantRows, setNewVariantRows] = useState<Map<number, StockEntryRow>>(new Map());
  const [allCollapsed, setAllCollapsed] = useState(false);

  const productType = activeTab === "bihun" ? "bh" : "mee";
  const { products, isLoading: isLoadingProducts } = useProductsCache(productType);

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = (await api.get(
        `/api/materials/stock/with-opening?year=${year}&month=${month}&product_line=${activeTab}`
      )) as StockResponse;

      const data = response.materials || [];
      setMaterials(data);
      setOriginalMaterials(JSON.parse(JSON.stringify(data)));

      const materialsWithVariants = data
        .filter((material: MaterialWithStock) => material.has_variants && material.variants && material.variants.length > 0)
        .map((material: MaterialWithStock) => material.id);

      setExpandedMaterials(new Set(materialsWithVariants));
      setNewVariantRows(new Map());
    } catch (error: unknown) {
      console.error("Error fetching materials:", error);
      toast.error("Failed to load materials data");
      setMaterials([]);
      setOriginalMaterials([]);
    } finally {
      setIsLoading(false);
    }
  }, [year, month, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const fetchStockKilang = async (): Promise<void> => {
      if (activeTab === "shared" || products.length === 0 || isLoadingProducts) {
        setStockKilang([]);
        return;
      }

      setIsLoadingStockKilang(true);
      try {
        const productIds = products.map((product) => product.id).join(",");
        const response = await api.get(
          `/api/stock/closing-batch?product_ids=${productIds}&year=${year}&month=${month}`
        );
        const closingBalances: Record<string, number> = response.closing_balances || {};

        const stockData: StockKilangItem[] = products.map((product) => {
          const closingQty = closingBalances[product.id] || 0;
          const price = makeNumber(product.price_per_unit);

          return {
            product_id: product.id,
            name: product.description,
            price,
            closing_quantity: closingQty,
            closing_value: closingQty * price,
          };
        });

        setStockKilang(stockData.filter((item) => item.closing_quantity > 0));
      } catch (error: unknown) {
        console.error("Error fetching stock kilang:", error);
        setStockKilang([]);
      } finally {
        setIsLoadingStockKilang(false);
      }
    };

    fetchStockKilang();
  }, [activeTab, products, isLoadingProducts, year, month]);

  const groupedMaterials = useMemo(() => {
    const groups: Record<MaterialCategory, MaterialWithStock[]> = {
      ingredient: [],
      raw_material: [],
      packing_material: [],
    };

    materials.forEach((material) => {
      if (groups[material.category]) {
        groups[material.category].push(material);
      }
    });

    return groups;
  }, [materials]);

  const hasUnsavedChanges = useMemo(() => {
    for (const row of newVariantRows.values()) {
      if (row.variant_name?.trim() || row.adjustment_quantity !== 0 || row.unit_cost !== 0) {
        return true;
      }
    }

    if (materials.length !== originalMaterials.length) return true;

    const originalMap = new Map(originalMaterials.map((material) => [material.id, material]));

    for (const current of materials) {
      const original = originalMap.get(current.id);
      if (!original) return true;

      if (
        current.adjustment_quantity !== original.adjustment_quantity ||
        current.unit_cost !== original.unit_cost
      ) {
        return true;
      }

      if (current.has_variants && current.variants && original.variants) {
        for (const currentVariant of current.variants) {
          const originalVariant = original.variants.find(
            (variant) =>
              variant.variant_id === currentVariant.variant_id &&
              variant.variant_name === currentVariant.variant_name
          );

          if (!originalVariant) return true;

          if (
            currentVariant.adjustment_quantity !== originalVariant.adjustment_quantity ||
            currentVariant.unit_cost !== originalVariant.unit_cost
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }, [materials, originalMaterials, newVariantRows]);

  const toggleMaterialExpansion = (materialId: number): void => {
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

  const toggleAllExpansion = (): void => {
    const materialsWithVariants = materials
      .filter((material) => material.has_variants && material.variants && material.variants.length > 0)
      .map((material) => material.id);

    if (allCollapsed) {
      setExpandedMaterials(new Set(materialsWithVariants));
      setAllCollapsed(false);
    } else {
      setExpandedMaterials(new Set());
      setAllCollapsed(true);
    }
  };

  const variantMaterialCount = useMemo(() => {
    return materials.filter((material) => material.has_variants && material.variants && material.variants.length > 0).length;
  }, [materials]);

  const handleAddVariantRow = (materialId: number, defaultUnitCost: number): void => {
    setNewVariantRows((prev) => new Map(prev).set(materialId, makeNewVariantRow(defaultUnitCost)));
    setExpandedMaterials((prev) => new Set(prev).add(materialId));
  };

  const handleCancelNewVariant = (materialId: number): void => {
    setNewVariantRows((prev) => {
      const next = new Map(prev);
      next.delete(materialId);
      return next;
    });
  };

  const handleVariantNameChange = (
    materialId: number,
    variantId: number | null,
    oldName: string | null,
    newName: string
  ): void => {
    setMaterials((prev) =>
      prev.map((material) => {
        if (material.id !== materialId || !material.has_variants || !material.variants) {
          return material;
        }

        return {
          ...material,
          variants: material.variants.map((variant) => {
            const isMatchingVariant = variantId
              ? variant.variant_id === variantId
              : !variant.variant_id && variant.variant_name === oldName;

            return isMatchingVariant ? { ...variant, variant_name: newName } : variant;
          }),
        };
      })
    );
  };

  const handleNewVariantChange = (
    materialId: number,
    field: NewVariantField,
    value: string | number
  ): void => {
    setNewVariantRows((prev) => {
      const next = new Map(prev);
      const row = next.get(materialId);
      if (!row) return next;

      if (field === "variant_name") {
        next.set(materialId, { ...row, variant_name: String(value) });
        return next;
      }

      const numericValue = makeNumber(value);
      const adjustmentQuantity =
        field === "adjustment_quantity" ? numericValue : row.adjustment_quantity;
      const unitCost = field === "unit_cost" ? numericValue : row.unit_cost;

      next.set(materialId, recalculateStock(row, adjustmentQuantity, unitCost));
      return next;
    });
  };

  const handleInputChange = (
    materialId: number,
    field: EditableStockField,
    value: string,
    variantId?: number | null,
    variantName?: string | null
  ): void => {
    setMaterials((prev) =>
      prev.map((material) => {
        if (material.id !== materialId) return material;

        if (variantId !== undefined && material.has_variants && material.variants) {
          const updatedVariants = material.variants.map((variant) => {
            const isMatchingVariant = variantId
              ? variant.variant_id === variantId
              : !variant.variant_id && variant.variant_name === variantName;

            if (!isMatchingVariant) return variant;

            const numericValue = makeNumber(value);
            const adjustmentQuantity =
              field === "adjustment_quantity" ? numericValue : variant.adjustment_quantity;
            const unitCost = field === "unit_cost" ? numericValue : variant.unit_cost;

            return recalculateStock(variant, adjustmentQuantity, unitCost);
          });

          return {
            ...material,
            variants: updatedVariants,
            opening_quantity: updatedVariants.reduce((sum, variant) => sum + variant.opening_quantity, 0),
            opening_value: updatedVariants.reduce((sum, variant) => sum + variant.opening_value, 0),
            purchase_quantity: updatedVariants.reduce((sum, variant) => sum + variant.purchase_quantity, 0),
            purchase_value: updatedVariants.reduce((sum, variant) => sum + variant.purchase_value, 0),
            adjustment_quantity: updatedVariants.reduce((sum, variant) => sum + variant.adjustment_quantity, 0),
            adjustment_value: updatedVariants.reduce((sum, variant) => sum + variant.adjustment_value, 0),
            closing_quantity: updatedVariants.reduce((sum, variant) => sum + variant.closing_quantity, 0),
            closing_value: updatedVariants.reduce((sum, variant) => sum + variant.closing_value, 0),
            quantity: updatedVariants.reduce((sum, variant) => sum + variant.adjustment_quantity, 0),
            value: updatedVariants.reduce((sum, variant) => sum + variant.closing_value, 0),
          };
        }

        const numericValue = makeNumber(value);
        const adjustmentQuantity =
          field === "adjustment_quantity" ? numericValue : material.adjustment_quantity;
        const unitCost = field === "unit_cost" ? numericValue : material.unit_cost;

        return recalculateStock(material, adjustmentQuantity, unitCost);
      })
    );
  };

  const handleBeforeMonthChange = useCallback(() => {
    if (hasUnsavedChanges) {
      return window.confirm("You have unsaved changes. Do you want to discard them?");
    }
    return true;
  }, [hasUnsavedChanges]);

  const handleTabChange = (tab: ProductLine): void => {
    if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Do you want to discard them?")) {
      return;
    }
    setActiveTab(tab);
  };

  const handleSave = async (): Promise<void> => {
    let negativeCount = 0;
    materials.forEach((material) => {
      if (material.has_variants && material.variants) {
        negativeCount += material.variants.filter((variant) => variant.closing_quantity < 0).length;
      } else if (material.closing_quantity < 0) {
        negativeCount++;
      }
    });

    if (negativeCount > 0) {
      const confirmed = window.confirm(
        `Warning: ${negativeCount} item(s) have negative calculated closing stock. Do you want to save anyway?`
      );
      if (!confirmed) return;
    }

    const incompleteNewVariants: string[] = [];
    newVariantRows.forEach((row, materialId) => {
      if (row.adjustment_quantity !== 0 && !row.variant_name?.trim()) {
        const material = materials.find((item) => item.id === materialId);
        incompleteNewVariants.push(material?.name || `Material ${materialId}`);
      }
    });

    if (incompleteNewVariants.length > 0) {
      toast.error(`Please enter a name for new variants in: ${incompleteNewVariants.join(", ")}`);
      return;
    }

    setIsSaving(true);
    try {
      const variantNameUpdates: Promise<void>[] = [];
      const originalMap = new Map(originalMaterials.map((material) => [material.id, material]));

      materials.forEach((material) => {
        if (!material.has_variants || !material.variants) return;

        const original = originalMap.get(material.id);
        material.variants.forEach((variant) => {
          if (!variant.variant_id || !variant.variant_name?.trim()) return;

          const originalVariant = original?.variants?.find(
            (item) => item.variant_id === variant.variant_id
          );

          if (originalVariant && variant.variant_name !== originalVariant.variant_name) {
            variantNameUpdates.push(
              api.put(`/api/materials/variants/${variant.variant_id}`, {
                variant_name: variant.variant_name.trim(),
                default_unit_cost: variant.unit_cost,
              }).catch((error: unknown) => {
                console.error(`Failed to update variant ${variant.variant_id}:`, error);
              })
            );
          }
        });
      });

      if (variantNameUpdates.length > 0) {
        await Promise.all(variantNameUpdates);
      }

      const entries: MaterialStockEntryInput[] = [];

      materials.forEach((material) => {
        if (material.has_variants && material.variants && material.variants.length > 0) {
          material.variants.forEach((variant) => {
            entries.push({
              material_id: material.id,
              variant_id: variant.variant_id,
              adjustment_quantity: variant.adjustment_quantity,
              unit_cost: variant.unit_cost,
              custom_name: null,
              custom_description: variant.variant_id
                ? null
                : variant.custom_description || (variant.variant_name === "Default" ? null : variant.variant_name),
              notes: variant.notes || null,
            });
          });
        } else {
          entries.push({
            material_id: material.id,
            variant_id: null,
            adjustment_quantity: material.adjustment_quantity,
            unit_cost: material.unit_cost,
            custom_name: material.custom_name || null,
            custom_description: null,
            notes: material.notes || null,
          });
        }
      });

      newVariantRows.forEach((row, materialId) => {
        if (row.variant_name?.trim() && (row.adjustment_quantity !== 0 || row.unit_cost > 0)) {
          entries.push({
            material_id: materialId,
            variant_id: null,
            adjustment_quantity: row.adjustment_quantity,
            unit_cost: row.unit_cost,
            custom_name: null,
            custom_description: row.variant_name.trim(),
            notes: null,
            register_variant: true,
          });
        }
      });

      const response = await api.post("/api/materials/stock/batch", {
        year,
        month,
        product_line: activeTab,
        entries,
      });

      const messages: string[] = [];
      if (variantNameUpdates.length > 0) {
        messages.push(`${variantNameUpdates.length} variant name(s) updated`);
      }
      if (response.registered_variants && response.registered_variants.length > 0) {
        messages.push(`${response.registered_variants.length} new variant(s) registered`);
      }

      toast.success(messages.length > 0 ? `Saved. ${messages.join(", ")}.` : "Stock adjustments saved");
      await fetchData();
    } catch (error: unknown) {
      console.error("Error saving stock entries:", error);
      const message = error instanceof Error ? error.message : "Failed to save stock adjustments";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const formatNumber = (value: number): string => {
    return value.toLocaleString("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatQty = (value: number): string => {
    return value.toLocaleString("en-MY", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  };

  const categoryTotals = useMemo(() => {
    const totals: Record<MaterialCategory, { opening: number; purchases: number; adjustments: number; closing: number }> = {
      ingredient: { opening: 0, purchases: 0, adjustments: 0, closing: 0 },
      raw_material: { opening: 0, purchases: 0, adjustments: 0, closing: 0 },
      packing_material: { opening: 0, purchases: 0, adjustments: 0, closing: 0 },
    };

    materials.forEach((material) => {
      if (totals[material.category]) {
        totals[material.category].opening += material.opening_value;
        totals[material.category].purchases += material.purchase_value;
        totals[material.category].adjustments += material.adjustment_value;
        totals[material.category].closing += material.closing_value;
      }
    });

    return totals;
  }, [materials]);

  const grandTotal = useMemo(() => {
    return {
      opening: materials.reduce((sum, material) => sum + material.opening_value, 0),
      purchases: materials.reduce((sum, material) => sum + material.purchase_value, 0),
      adjustments: materials.reduce((sum, material) => sum + material.adjustment_value, 0),
      closing: materials.reduce((sum, material) => sum + material.closing_value, 0),
    };
  }, [materials]);

  const stockKilangTotal = useMemo(() => {
    return stockKilang.reduce((sum, item) => sum + item.closing_value, 0);
  }, [stockKilang]);

  const negativeCount = useMemo(() => {
    return materials.filter((material) => material.closing_quantity < 0).length;
  }, [materials]);

  const renderAdjustmentInput = (
    value: number,
    onChange: (value: string) => void,
    onClick?: (event: React.MouseEvent<HTMLInputElement>) => void
  ): React.ReactNode => (
    <input
      type="number"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      onClick={onClick}
      className="w-full px-2 py-1 text-right font-mono text-sm border border-sky-200 dark:border-sky-800 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
      step="1"
      placeholder="0"
    />
  );

  const renderUnitCostInput = (
    value: number,
    onChange: (value: string) => void,
    onClick?: (event: React.MouseEvent<HTMLInputElement>) => void
  ): React.ReactNode => (
    <input
      type="number"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      onClick={onClick}
      className="w-full px-2 py-1 text-right font-mono text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
      step="0.01"
      min="0"
      placeholder="0.00"
    />
  );

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm px-6 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <IconBox size={22} className="text-default-500 dark:text-gray-400" />
              <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                Stock Adjustments
              </h1>
            </div>
            <span className="text-default-300 dark:text-gray-600">|</span>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-default-500 dark:text-gray-400">
                {materials.length} materials
              </span>
              <span className="text-default-300 dark:text-gray-600">|</span>
              <span className="text-default-500 dark:text-gray-400">
                Purchases: <span className="font-medium text-blue-600 dark:text-blue-400">RM {formatNumber(grandTotal.purchases)}</span>
              </span>
              <span className="text-default-300 dark:text-gray-600">|</span>
              <span className="text-default-500 dark:text-gray-400">
                Closing: <span className="font-medium text-green-600 dark:text-green-400">RM {formatNumber(grandTotal.closing)}</span>
              </span>
              {stockKilang.length > 0 && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <span className="text-default-500 dark:text-gray-400">
                    FG: <span className="font-medium text-emerald-600 dark:text-emerald-400">RM {formatNumber(stockKilangTotal)}</span>
                  </span>
                </>
              )}
              {negativeCount > 0 && (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <span className="text-red-500 flex items-center gap-1">
                    <IconAlertTriangle size={14} />
                    {negativeCount} negative
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-default-100 dark:bg-gray-700 rounded-full p-0.5">
              {stockTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={clsx(
                    "px-4 py-1 rounded-full text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? tab.activeClass
                      : "text-default-600 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-default-300 dark:text-gray-600">|</span>

            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={setSelectedMonth}
              beforeChange={handleBeforeMonthChange}
            />

            <span className="text-default-300 dark:text-gray-600">|</span>

            <Button
              color="sky"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              icon={IconDeviceFloppy}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>

            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Unsaved
              </span>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      ) : (
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
                <th className="px-2 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-24">
                  Opening
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider w-24">
                  Purchases
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-sky-600 dark:text-sky-400 uppercase tracking-wider w-28 bg-sky-50 dark:bg-sky-900/20">
                  Adjustment
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-24">
                  Unit Cost
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-24">
                  Closing
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-28">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-100 dark:divide-gray-700">
              {categoryOrder.map((category) => {
                const items = groupedMaterials[category];
                if (items.length === 0) return null;

                return (
                  <React.Fragment key={category}>
                    <tr className="bg-default-100 dark:bg-gray-700/50">
                      <td className="px-3 py-1.5 text-xs font-semibold text-default-700 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <IconPackage size={14} className="text-default-500" />
                          {categoryLabels[category]}
                          <span className="text-default-400 font-normal">({items.length})</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-right text-default-500 dark:text-gray-400">
                        {formatNumber(categoryTotals[category].opening)}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-right text-blue-600 dark:text-blue-400">
                        {formatNumber(categoryTotals[category].purchases)}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-right text-sky-600 dark:text-sky-400">
                        {formatNumber(categoryTotals[category].adjustments)}
                      </td>
                      <td></td>
                      <td></td>
                      <td className="px-2 py-1.5 text-xs text-right">
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {formatNumber(categoryTotals[category].closing)}
                        </span>
                      </td>
                    </tr>

                    {items.map((material) => {
                      const isNegative = material.closing_quantity < 0;
                      const hasVariants = material.has_variants && material.variants && material.variants.length > 0;
                      const isExpanded = expandedMaterials.has(material.id);
                      const newVariant = newVariantRows.get(material.id);

                      if (hasVariants) {
                        return (
                          <React.Fragment key={material.id}>
                            <tr
                              className={clsx(
                                "bg-purple-50/70 dark:bg-gray-800 cursor-pointer hover:bg-purple-100/70 dark:hover:bg-gray-700/50 border-l-2 border-purple-400 dark:border-purple-700/60",
                                isNegative && "bg-red-50/50 dark:bg-red-900/10 border-red-400 dark:border-red-700/60"
                              )}
                              onClick={() => toggleMaterialExpansion(material.id)}
                            >
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="p-0.5 rounded bg-purple-100 dark:bg-gray-700">
                                    {isExpanded ? (
                                      <IconChevronDown size={14} className="text-purple-600 dark:text-gray-300" />
                                    ) : (
                                      <IconChevronRight size={14} className="text-purple-500 dark:text-gray-400" />
                                    )}
                                  </div>
                                  <Link
                                    to={`/materials/${material.id}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="text-sm font-semibold text-default-800 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 hover:underline"
                                  >
                                    {material.name}
                                  </Link>
                                  <span className="text-xs text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                                    {material.code}
                                  </span>
                                  {isNegative && (
                                    <IconAlertTriangle size={14} className="text-red-500" title="Negative closing stock" />
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm text-default-500 dark:text-gray-400">
                                {formatQty(material.opening_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm text-blue-600 dark:text-blue-400">
                                {formatQty(material.purchase_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm text-sky-600 dark:text-sky-400 bg-sky-50/50 dark:bg-sky-900/10">
                                {formatQty(material.adjustment_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-center text-xs text-default-400 dark:text-gray-500">-</td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold text-default-700 dark:text-gray-200">
                                {formatQty(material.closing_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <span className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                                  {formatNumber(material.closing_value)}
                                </span>
                              </td>
                            </tr>

                            {isExpanded && material.variants!.map((variant, index) => {
                              const variantNegative = variant.closing_quantity < 0;
                              const isLastVariant = index === material.variants!.length - 1;

                              return (
                                <tr
                                  key={`${material.id}-${variant.variant_id || variant.variant_name}`}
                                  className={clsx(
                                    "bg-white dark:bg-gray-800 hover:bg-purple-50/50 dark:hover:bg-gray-700/30 border-l-2 border-purple-200 dark:border-purple-900/60",
                                    variantNegative && "bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-900/60",
                                    !isLastVariant && "border-b border-dashed border-default-100 dark:border-gray-700"
                                  )}
                                >
                                  <td className="px-3 py-1.5 pl-12">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-purple-300 dark:text-gray-600">-</span>
                                      <input
                                        type="text"
                                        value={variant.variant_name || ""}
                                        onChange={(event) =>
                                          handleVariantNameChange(
                                            material.id,
                                            variant.variant_id,
                                            variant.variant_name,
                                            event.target.value
                                          )
                                        }
                                        onClick={(event) => event.stopPropagation()}
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
                                  <td className="px-2 py-1.5 text-right font-mono text-xs text-blue-600 dark:text-blue-400">
                                    {formatQty(variant.purchase_quantity)}
                                  </td>
                                  <td className="px-1 py-1 bg-sky-50/20 dark:bg-sky-900/5">
                                    {renderAdjustmentInput(
                                      variant.adjustment_quantity,
                                      (value) => handleInputChange(
                                        material.id,
                                        "adjustment_quantity",
                                        value,
                                        variant.variant_id,
                                        variant.variant_name
                                      ),
                                      (event) => event.stopPropagation()
                                    )}
                                  </td>
                                  <td className="px-1 py-1">
                                    {renderUnitCostInput(
                                      variant.unit_cost,
                                      (value) => handleInputChange(
                                        material.id,
                                        "unit_cost",
                                        value,
                                        variant.variant_id,
                                        variant.variant_name
                                      ),
                                      (event) => event.stopPropagation()
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono text-sm text-default-700 dark:text-gray-300">
                                    {formatQty(variant.closing_quantity)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <span className={clsx(
                                      "font-mono text-sm",
                                      variantNegative
                                        ? "text-red-600 dark:text-red-400"
                                        : variant.closing_value > 0
                                          ? "text-green-600 dark:text-green-400"
                                          : "text-default-400 dark:text-gray-500"
                                    )}>
                                      {formatNumber(variant.closing_value)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}

                            {isExpanded && newVariant && (
                              <tr className="bg-sky-50/60 dark:bg-gray-800 border-l-2 border-sky-400 dark:border-sky-700/60">
                                <td className="px-3 py-1.5 pl-12">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sky-400 dark:text-gray-500">+</span>
                                    <input
                                      type="text"
                                      value={newVariant.variant_name || ""}
                                      onChange={(event) => handleNewVariantChange(material.id, "variant_name", event.target.value)}
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
                                <td className="px-2 py-1.5 text-right font-mono text-xs text-blue-600 dark:text-blue-400">0</td>
                                <td className="px-1 py-1">
                                  {renderAdjustmentInput(
                                    newVariant.adjustment_quantity,
                                    (value) => handleNewVariantChange(material.id, "adjustment_quantity", value)
                                  )}
                                </td>
                                <td className="px-1 py-1">
                                  {renderUnitCostInput(
                                    newVariant.unit_cost,
                                    (value) => handleNewVariantChange(material.id, "unit_cost", value)
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono text-sm text-default-700 dark:text-gray-300">
                                  {formatQty(newVariant.closing_quantity)}
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">
                                  {formatNumber(newVariant.closing_value)}
                                </td>
                              </tr>
                            )}

                            {isExpanded && !newVariant && (
                              <tr className="bg-white dark:bg-gray-800 border-l-2 border-purple-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-gray-500 transition-colors">
                                <td colSpan={7} className="px-3 py-1.5 pl-12">
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
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
                                    title="Negative closing stock"
                                  />
                                )}
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
                            <td className="px-2 py-1.5 text-right">
                              <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
                                {formatQty(material.purchase_quantity)}
                              </span>
                            </td>
                            <td className="px-1 py-1 bg-sky-50/50 dark:bg-sky-900/10">
                              {renderAdjustmentInput(
                                material.adjustment_quantity,
                                (value) => handleInputChange(material.id, "adjustment_quantity", value)
                              )}
                            </td>
                            <td className="px-1 py-1">
                              {renderUnitCostInput(
                                material.unit_cost,
                                (value) => handleInputChange(material.id, "unit_cost", value)
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <span className="font-mono text-sm text-default-700 dark:text-gray-300">
                                {formatQty(material.closing_quantity)}
                              </span>
                            </td>
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

                          {newVariant && (
                            <tr className="bg-sky-50/60 dark:bg-gray-800 border-l-2 border-sky-400 dark:border-sky-700/60">
                              <td className="px-3 py-1.5 pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-sky-400 dark:text-gray-500">+</span>
                                  <input
                                    type="text"
                                    value={newVariant.variant_name || ""}
                                    onChange={(event) => handleNewVariantChange(material.id, "variant_name", event.target.value)}
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
                              <td className="px-2 py-1.5 text-right font-mono text-xs text-blue-600 dark:text-blue-400">0</td>
                              <td className="px-1 py-1">
                                {renderAdjustmentInput(
                                  newVariant.adjustment_quantity,
                                  (value) => handleNewVariantChange(material.id, "adjustment_quantity", value)
                                )}
                              </td>
                              <td className="px-1 py-1">
                                {renderUnitCostInput(
                                  newVariant.unit_cost,
                                  (value) => handleNewVariantChange(material.id, "unit_cost", value)
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm text-default-700 dark:text-gray-300">
                                {formatQty(newVariant.closing_quantity)}
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

              {stockKilang.length > 0 && (
                <React.Fragment>
                  <tr className="bg-emerald-100 dark:bg-emerald-900/30">
                    <td colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <div className="flex items-center gap-2">
                        <IconBuildingFactory2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                        Stock Kilang
                        <span className="text-emerald-500 dark:text-emerald-400 font-normal">
                          ({stockKilang.length})
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-center text-emerald-600 dark:text-emerald-400">
                      Read-only
                    </td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td className="px-2 py-1.5 text-xs text-right">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatNumber(stockKilangTotal)}
                      </span>
                    </td>
                  </tr>
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
                      <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">-</td>
                      <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">-</td>
                      <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">-</td>
                      <td className="px-2 py-1.5 text-right font-mono text-sm text-default-500 dark:text-gray-400">
                        {formatNumber(item.price)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          {formatQty(item.closing_quantity)}
                        </span>
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
                    <p>No materials found for {activeTab.toUpperCase()}</p>
                  </td>
                </tr>
              )}
            </tbody>

            {(materials.length > 0 || stockKilang.length > 0) && (
              <tfoot className="bg-default-100 dark:bg-gray-900/50 border-t border-default-200 dark:border-gray-700">
                {materials.length > 0 && (
                  <tr>
                    <td className="px-3 py-1.5 text-right text-sm text-default-600 dark:text-gray-400">
                      Materials:
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-default-600 dark:text-gray-400">
                      {formatNumber(grandTotal.opening)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-blue-600 dark:text-blue-400">
                      {formatNumber(grandTotal.purchases)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-sky-600 dark:text-sky-400">
                      {formatNumber(grandTotal.adjustments)}
                    </td>
                    <td></td>
                    <td></td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-green-600 dark:text-green-400">
                      {formatNumber(grandTotal.closing)}
                    </td>
                  </tr>
                )}
                {stockKilang.length > 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-1.5 text-right text-sm text-default-600 dark:text-gray-400">
                      Stock Kilang:
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                      {formatNumber(stockKilangTotal)}
                    </td>
                  </tr>
                )}
                <tr className="font-semibold border-t border-default-200 dark:border-gray-600">
                  <td colSpan={6} className="px-3 py-2 text-right text-sm text-default-700 dark:text-gray-300">
                    Grand Total:
                  </td>
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

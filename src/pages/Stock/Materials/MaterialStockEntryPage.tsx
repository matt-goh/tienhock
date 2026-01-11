// src/pages/Stock/Materials/MaterialStockEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import {
  MaterialWithStock,
  MaterialCategory,
  ProductLine,
  MaterialStockEntryInput,
} from "../../../types/types";
import {
  IconDeviceFloppy,
  IconPackage,
  IconBox,
} from "@tabler/icons-react";
import clsx from "clsx";
import Button from "../../../components/Button";
import MonthNavigator from "../../../components/MonthNavigator";
import LoadingSpinner from "../../../components/LoadingSpinner";

// Category labels
const categoryLabels: Record<MaterialCategory, string> = {
  ingredient: "Ingredients",
  raw_material: "Raw Materials",
  packing_material: "Packing Materials",
};

// Category order
const categoryOrder: MaterialCategory[] = ["ingredient", "raw_material", "packing_material"];

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

  // Group materials by category
  const groupedMaterials = useMemo(() => {
    const groups: Record<MaterialCategory, MaterialWithStock[]> = {
      ingredient: [],
      raw_material: [],
      packing_material: [],
    };

    materials.forEach((m) => {
      groups[m.category].push(m);
    });

    return groups;
  }, [materials]);

  // Calculate if there are unsaved changes (compare by material ID, not array index)
  const hasUnsavedChanges = useMemo(() => {
    if (materials.length !== originalMaterials.length) return true;

    // Create a map of original materials by ID for faster lookup
    const originalMap = new Map(
      originalMaterials.map((m) => [m.id, m])
    );

    for (const current of materials) {
      const original = originalMap.get(current.id);

      // If material doesn't exist in original, there's a change
      if (!original) return true;

      if (
        current.closing_quantity !== original.closing_quantity ||
        current.closing_unit_cost !== original.closing_unit_cost
      ) {
        return true;
      }
    }

    return false;
  }, [materials, originalMaterials]);

  // Handle input change
  const handleInputChange = (
    materialId: number,
    field: "closing_quantity" | "closing_unit_cost",
    value: string
  ) => {
    const numValue = parseFloat(value) || 0;

    setMaterials((prev) =>
      prev.map((m) => {
        if (m.id === materialId) {
          const updated = { ...m, [field]: numValue };
          // Recalculate closing value
          updated.closing_value = updated.closing_quantity * updated.closing_unit_cost;
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
    setIsSaving(true);
    try {
      const entries: MaterialStockEntryInput[] = materials.map((m) => ({
        material_id: m.id,
        quantity: m.closing_quantity,
        unit_cost: m.closing_unit_cost,
        notes: m.closing_notes || null,
      }));

      await api.post("/api/materials/stock/batch", {
        year,
        month,
        product_line: activeTab,
        entries,
      });

      toast.success("Stock entries saved successfully");
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

  // Calculate category totals
  const categoryTotals = useMemo(() => {
    const totals: Record<MaterialCategory, { opening: number; closing: number }> = {
      ingredient: { opening: 0, closing: 0 },
      raw_material: { opening: 0, closing: 0 },
      packing_material: { opening: 0, closing: 0 },
    };

    materials.forEach((m) => {
      totals[m.category].opening += m.opening_value;
      totals[m.category].closing += m.closing_value;
    });

    return totals;
  }, [materials]);

  // Grand total
  const grandTotal = useMemo(() => {
    return {
      opening: materials.reduce((sum, m) => sum + m.opening_value, 0),
      closing: materials.reduce((sum, m) => sum + m.closing_value, 0),
    };
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
                Material Stock Entry
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
                Opening: <span className="font-medium text-default-700 dark:text-gray-200">RM {formatNumber(grandTotal.opening)}</span>
              </span>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <span className="text-default-500 dark:text-gray-400">
                Closing: <span className="font-medium text-green-600 dark:text-green-400">RM {formatNumber(grandTotal.closing)}</span>
              </span>
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
                <th className="px-4 py-2 text-left text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider">
                  Material
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-20">
                  Unit
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-28">
                  Open Qty
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
                  Open Value
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-28">
                  Close Qty
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-28">
                  Unit Cost
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
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
                      <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold text-default-700 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <IconPackage size={14} className="text-default-500" />
                          {categoryLabels[category]}
                          <span className="text-default-400 font-normal">({items.length})</span>
                        </div>
                      </td>
                      <td colSpan={3} className="px-4 py-1.5 text-xs text-right">
                        <span className="text-default-500 dark:text-gray-400">
                          RM {formatNumber(categoryTotals[category].opening)}
                          <span className="mx-1">→</span>
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            RM {formatNumber(categoryTotals[category].closing)}
                          </span>
                        </span>
                      </td>
                    </tr>
                    {/* Category Items */}
                    {items.map((material) => (
                      <tr key={material.id} className="hover:bg-default-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-default-800 dark:text-gray-200">
                              {material.name}
                            </span>
                            <span className="text-xs text-default-400 dark:text-gray-500 font-mono">
                              {material.code}
                            </span>
                            {material.unit_size && (
                              <span className="text-xs text-default-400 dark:text-gray-500">
                                • {material.unit_size}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-1.5 text-center text-sm text-default-600 dark:text-gray-400">
                          {material.unit}
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <span className="font-mono text-sm text-default-600 dark:text-gray-400">
                            {formatNumber(material.opening_quantity)}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <span className="font-mono text-sm text-default-600 dark:text-gray-400">
                            {formatNumber(material.opening_value)}
                          </span>
                        </td>
                        <td className="px-4 py-1.5">
                          <input
                            type="number"
                            value={material.closing_quantity || ""}
                            onChange={(e) =>
                              handleInputChange(material.id, "closing_quantity", e.target.value)
                            }
                            className="w-full px-2 py-1 text-right font-mono text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                            min="0"
                          />
                        </td>
                        <td className="px-4 py-1.5">
                          <input
                            type="number"
                            value={material.closing_unit_cost || ""}
                            onChange={(e) =>
                              handleInputChange(material.id, "closing_unit_cost", e.target.value)
                            }
                            className="w-full px-2 py-1 text-right font-mono text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                            step="0.01"
                            min="0"
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <span className={clsx(
                            "font-mono text-sm font-medium",
                            material.closing_value > 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-default-400 dark:text-gray-500"
                          )}>
                            {formatNumber(material.closing_value)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}

              {materials.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-default-500 dark:text-gray-400">
                    <IconPackage size={32} className="mx-auto mb-2 text-default-300 dark:text-gray-600" />
                    <p>No materials found for {activeTab.toUpperCase()} production</p>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Footer with totals */}
            {materials.length > 0 && (
              <tfoot className="bg-default-100 dark:bg-gray-900/50 border-t border-default-200 dark:border-gray-700">
                <tr className="font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-right text-sm text-default-700 dark:text-gray-300">
                    Grand Total:
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm text-default-800 dark:text-gray-200">
                    RM {formatNumber(grandTotal.opening)}
                  </td>
                  <td colSpan={2}></td>
                  <td className="px-4 py-2 text-right font-mono text-sm text-green-600 dark:text-green-400">
                    RM {formatNumber(grandTotal.closing)}
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

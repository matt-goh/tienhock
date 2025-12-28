// src/pages/Stock/StockAdjustmentEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import {
  StockAdjustmentReference,
  StockAdjustmentEntry,
  StockProduct,
} from "../../types/types";
import {
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconRefresh,
  IconAdjustmentsHorizontal,
  IconPackage,
} from "@tabler/icons-react";
import clsx from "clsx";
import Button from "../../components/Button";
import MonthNavigator from "../../components/MonthNavigator";

type ProductTab = "BH" | "MEE";

const StockAdjustmentEntryPage: React.FC = () => {
  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());

  // References state
  const [references, setReferences] = useState<StockAdjustmentReference[]>([]);
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [selectedReference, setSelectedReference] = useState<string | null>(
    null
  );
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newReferenceInput, setNewReferenceInput] = useState("");

  // Entries state
  const [entries, setEntries] = useState<Record<string, StockAdjustmentEntry>>(
    {}
  );
  const [originalEntries, setOriginalEntries] = useState<
    Record<string, StockAdjustmentEntry>
  >({});
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<ProductTab>("BH");

  // Get products cache
  const { products, isLoading: isLoadingProducts } = useProductsCache("all");

  // Filter products by type
  const bhProducts = useMemo(() => {
    return products.filter((p) => p.type === "BH") as StockProduct[];
  }, [products]);

  const meeProducts = useMemo(() => {
    return products.filter((p) => p.type === "MEE") as StockProduct[];
  }, [products]);

  // Get current tab products
  const currentProducts = activeTab === "BH" ? bhProducts : meeProducts;

  // Format month for API calls (YYYY-MM)
  const monthString = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = String(selectedMonth.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, [selectedMonth]);

  // Calculate if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    const currentKeys = Object.keys(entries);
    const originalKeys = Object.keys(originalEntries);

    if (currentKeys.length !== originalKeys.length) return true;

    for (const key of currentKeys) {
      const current = entries[key];
      const original = originalEntries[key];
      if (!original) return true;
      if (
        current.adj_in !== original.adj_in ||
        current.adj_out !== original.adj_out
      ) {
        return true;
      }
    }

    return false;
  }, [entries, originalEntries]);

  // Fetch references for the selected month
  const fetchReferences = useCallback(async () => {
    setIsLoadingReferences(true);
    try {
      const response = await api.get(
        `/api/stock/adjustments/references?month=${monthString}`
      );
      setReferences(response || []);
    } catch (error) {
      console.error("Error fetching references:", error);
      setReferences([]);
    } finally {
      setIsLoadingReferences(false);
    }
  }, [monthString]);

  // Fetch entries for a specific reference
  const fetchEntriesByReference = useCallback(
    async (reference: string) => {
      setIsLoadingEntries(true);
      try {
        const response = await api.get(
          `/api/stock/adjustments/by-reference?month=${monthString}&reference=${encodeURIComponent(reference)}`
        );

        const entriesMap: Record<string, StockAdjustmentEntry> = {};
        (response.adjustments || []).forEach((adj: StockAdjustmentEntry) => {
          entriesMap[adj.product_id] = {
            product_id: adj.product_id,
            product_description: adj.product_description,
            product_type: adj.product_type,
            adj_in: adj.adj_in || 0,
            adj_out: adj.adj_out || 0,
          };
        });

        setEntries(entriesMap);
        setOriginalEntries(entriesMap);
      } catch (error) {
        console.error("Error fetching entries:", error);
        setEntries({});
        setOriginalEntries({});
      } finally {
        setIsLoadingEntries(false);
      }
    },
    [monthString]
  );

  // Fetch references when month changes
  useEffect(() => {
    fetchReferences();
    // Clear selection when month changes
    setSelectedReference(null);
    setIsCreatingNew(false);
    setEntries({});
    setOriginalEntries({});
  }, [fetchReferences]);

  // Fetch entries when reference is selected
  useEffect(() => {
    if (selectedReference && !isCreatingNew) {
      fetchEntriesByReference(selectedReference);
    }
  }, [selectedReference, isCreatingNew, fetchEntriesByReference]);

  // beforeChange callback for MonthNavigator - checks for unsaved changes
  const handleBeforeMonthChange = useCallback(() => {
    if (hasUnsavedChanges) {
      return window.confirm(
        "You have unsaved changes. Do you want to discard them?"
      );
    }
    return true;
  }, [hasUnsavedChanges]);

  // Handle reference selection
  const handleSelectReference = (reference: string) => {
    if (hasUnsavedChanges) {
      if (
        !window.confirm(
          "You have unsaved changes. Do you want to discard them?"
        )
      ) {
        return;
      }
    }
    setIsCreatingNew(false);
    setSelectedReference(reference);
  };

  // Handle create new reference
  const handleCreateNew = () => {
    if (hasUnsavedChanges) {
      if (
        !window.confirm(
          "You have unsaved changes. Do you want to discard them?"
        )
      ) {
        return;
      }
    }
    setSelectedReference(null);
    setIsCreatingNew(true);
    setNewReferenceInput("");
    setEntries({});
    setOriginalEntries({});
  };

  // Handle entry change
  const handleEntryChange = (
    productId: string,
    field: "adj_in" | "adj_out",
    value: number
  ) => {
    setEntries((prev) => {
      const existing = prev[productId] || {
        product_id: productId,
        adj_in: 0,
        adj_out: 0,
      };
      return {
        ...prev,
        [productId]: {
          ...existing,
          [field]: value,
        },
      };
    });
  };

  // Handle save
  const handleSave = async () => {
    const reference = isCreatingNew ? newReferenceInput : selectedReference;

    if (!reference || reference.trim() === "") {
      toast.error("Please enter a reference code");
      return;
    }

    // Check if there are any entries with values
    const entriesWithValues = Object.values(entries).filter(
      (e) => e.adj_in > 0 || e.adj_out > 0
    );

    if (entriesWithValues.length === 0) {
      toast.error("Please enter at least one adjustment");
      return;
    }

    setIsSaving(true);
    try {
      const adjustments = Object.values(entries)
        .filter((e) => e.adj_in > 0 || e.adj_out > 0)
        .map((e) => ({
          product_id: e.product_id,
          adj_in: e.adj_in,
          adj_out: e.adj_out,
        }));

      const response = await api.post("/api/stock/adjustments/batch", {
        month: monthString,
        reference: reference.trim(),
        adjustments,
      });

      toast.success(
        `Adjustments saved: ${response.total_adj_in} ADJ+, ${response.total_adj_out} ADJ-`
      );

      // Refresh references list
      await fetchReferences();

      // If creating new, switch to editing mode
      if (isCreatingNew) {
        setIsCreatingNew(false);
        setSelectedReference(reference.trim());
      }

      setOriginalEntries({ ...entries });
    } catch (error) {
      console.error("Error saving adjustments:", error);
      toast.error("Failed to save adjustments");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset
  const handleReset = () => {
    setEntries({ ...originalEntries });
    if (isCreatingNew) {
      setNewReferenceInput("");
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedReference) return;

    if (
      !window.confirm(
        `Are you sure you want to delete all adjustments for reference "${selectedReference}"?`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await api.delete(
        `/api/stock/adjustments/by-reference?month=${monthString}&reference=${encodeURIComponent(selectedReference)}`
      );

      toast.success("Adjustments deleted successfully");

      // Refresh references list
      await fetchReferences();

      // Clear selection
      setSelectedReference(null);
      setEntries({});
      setOriginalEntries({});
    } catch (error) {
      console.error("Error deleting adjustments:", error);
      toast.error("Failed to delete adjustments");
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculate totals for current entries
  const totals = useMemo(() => {
    let totalAdjIn = 0;
    let totalAdjOut = 0;
    let bhAdjIn = 0;
    let bhAdjOut = 0;
    let meeAdjIn = 0;
    let meeAdjOut = 0;

    Object.values(entries).forEach((entry) => {
      totalAdjIn += entry.adj_in || 0;
      totalAdjOut += entry.adj_out || 0;

      // Find product type
      const product = products.find((p) => p.id === entry.product_id);
      if (product?.type === "BH") {
        bhAdjIn += entry.adj_in || 0;
        bhAdjOut += entry.adj_out || 0;
      } else if (product?.type === "MEE") {
        meeAdjIn += entry.adj_in || 0;
        meeAdjOut += entry.adj_out || 0;
      }
    });

    return { totalAdjIn, totalAdjOut, bhAdjIn, bhAdjOut, meeAdjIn, meeAdjOut };
  }, [entries, products]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-default-900">
          Stock Adjustments
        </h1>
        <p className="mt-1 text-sm text-default-500">
          Record monthly ADJ+ (returned usable) and ADJ- (defective) adjustments
        </p>
      </div>

      {/* Month Navigation */}
      <div className="mb-4 rounded-lg border border-default-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-default-700">Month:</label>
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={setSelectedMonth}
            beforeChange={handleBeforeMonthChange}
            showGoToCurrentButton={false}
            className="w-56"
          />
          {hasUnsavedChanges && (
            <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      {/* Main Content - Master-Detail Layout */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left Panel - References List */}
        <div className="w-72 flex-shrink-0 rounded-lg border border-default-200 bg-white shadow-sm">
          <div className="border-b border-default-200 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-default-700">
                References
              </h2>
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-600"
              >
                <IconPlus size={14} />
                Add New
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-340px)] overflow-y-auto p-2">
            {isLoadingReferences ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
              </div>
            ) : references.length === 0 ? (
              <div className="py-8 text-center">
                <IconAdjustmentsHorizontal
                  className="mx-auto text-default-300"
                  size={32}
                />
                <p className="mt-2 text-sm text-default-500">
                  No adjustments for this month
                </p>
                <p className="mt-1 text-xs text-default-400">
                  Click "Add New" to create one
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {references.map((ref) => (
                  <button
                    key={ref.reference}
                    onClick={() => handleSelectReference(ref.reference)}
                    className={clsx(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      selectedReference === ref.reference && !isCreatingNew
                        ? "border-sky-500 bg-sky-50"
                        : "border-default-200 bg-white hover:bg-default-50"
                    )}
                  >
                    <div className="font-medium text-default-900">
                      {ref.reference}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-default-500">
                      <span>{ref.product_count} products</span>
                      <span className="text-teal-600">
                        +{ref.total_adj_in}
                      </span>
                      <span className="text-orange-600">
                        -{ref.total_adj_out}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-default-400">
                      {new Date(ref.created_at).toLocaleDateString("en-MY", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Entry Form */}
        <div className="flex flex-1 flex-col rounded-lg border border-default-200 bg-white shadow-sm">
          {!selectedReference && !isCreatingNew ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <IconPackage className="mx-auto text-default-300" size={48} />
                <p className="mt-4 text-default-500">
                  Select a reference to edit or create a new one
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Form Header */}
              <div className="border-b border-default-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-default-700">
                      Reference:
                    </label>
                    {isCreatingNew ? (
                      <input
                        type="text"
                        value={newReferenceInput}
                        onChange={(e) => setNewReferenceInput(e.target.value)}
                        placeholder="Enter reference code..."
                        className="w-48 rounded-lg border border-default-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        autoFocus
                      />
                    ) : (
                      <span className="rounded-lg bg-default-100 px-3 py-1.5 text-sm font-medium text-default-900">
                        {selectedReference}
                      </span>
                    )}
                  </div>

                  {/* Delete button for existing references */}
                  {!isCreatingNew && selectedReference && (
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50"
                    >
                      <IconTrash size={16} />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-default-200">
                <div className="flex">
                  {(["BH", "MEE"] as ProductTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={clsx(
                        "flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                        activeTab === tab
                          ? "border-sky-500 bg-sky-50 text-sky-700"
                          : "border-transparent text-default-600 hover:bg-default-50"
                      )}
                    >
                      {tab === "BH" ? "Bihun" : "Mee"} Products
                      <span className="ml-2 rounded-full bg-default-200 px-2 py-0.5 text-xs">
                        {tab === "BH" ? bhProducts.length : meeProducts.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Table */}
              <div className="flex-1 overflow-auto">
                {isLoadingEntries || isLoadingProducts ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-default-50">
                      <tr>
                        <th className="border-b border-default-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-default-600">
                          Product ID
                        </th>
                        <th className="border-b border-default-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-default-600">
                          Description
                        </th>
                        <th className="w-32 border-b border-default-200 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-teal-600">
                          ADJ+ (Return)
                        </th>
                        <th className="w-32 border-b border-default-200 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-orange-600">
                          ADJ- (Defect)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default-100">
                      {currentProducts.map((product) => {
                        const entry = entries[product.id];
                        const hasValue =
                          (entry?.adj_in || 0) > 0 || (entry?.adj_out || 0) > 0;

                        return (
                          <tr
                            key={product.id}
                            className={clsx(
                              "transition-colors hover:bg-default-50",
                              hasValue && "bg-sky-50/50"
                            )}
                          >
                            <td className="px-4 py-2 text-sm font-medium text-default-900">
                              {product.id}
                            </td>
                            <td className="px-4 py-2 text-sm text-default-600">
                              {product.description}
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                value={entry?.adj_in || ""}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  handleEntryChange(product.id, "adj_in", value);
                                }}
                                placeholder="0"
                                className="w-full rounded-lg border border-default-300 pl-6 px-3 py-1.5 text-center text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                value={entry?.adj_out || ""}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  handleEntryChange(
                                    product.id,
                                    "adj_out",
                                    value
                                  );
                                }}
                                placeholder="0"
                                className="w-full rounded-lg border border-default-300 pl-6 px-3 py-1.5 text-center text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer with Totals and Actions */}
              <div className="border-t border-default-200 bg-default-50 p-4">
                <div className="flex items-center justify-end">
                  {/* Actions */}
                  <div className="flex gap-3">
                    <Button
                      onClick={handleReset}
                      disabled={!hasUnsavedChanges || isSaving}
                      color="default"
                      icon={IconRefresh}
                    >
                      Reset
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={
                        !hasUnsavedChanges ||
                        isSaving ||
                        (isCreatingNew && !newReferenceInput.trim())
                      }
                      color="sky"
                      icon={IconDeviceFloppy}
                    >
                      {isSaving ? "Saving..." : "Save Adjustments"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockAdjustmentEntryPage;

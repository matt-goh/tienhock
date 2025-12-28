// src/pages/Stock/ProductionEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import ProductSelector from "../../components/Stock/ProductSelector";
import WorkerEntryGrid from "../../components/Stock/WorkerEntryGrid";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  ProductionEntry,
  ProductionWorker,
  StockProduct,
} from "../../types/types";
import { IconCalendar, IconStarFilled } from "@tabler/icons-react";

const FAVORITES_STORAGE_KEY = "stock-product-favorites";

const ProductionEntryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial values from URL params or defaults
  const getInitialDate = () => {
    const dateParam = searchParams.get("date");
    if (dateParam) {
      // Validate the date format
      const parsed = new Date(dateParam);
      if (!isNaN(parsed.getTime())) {
        return dateParam;
      }
    }
    return new Date().toISOString().split("T")[0];
  };

  const getInitialProduct = () => {
    return searchParams.get("product") || null;
  };

  // State
  const [selectedDate, setSelectedDate] = useState<string>(getInitialDate);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    getInitialProduct
  );
  const [entries, setEntries] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [originalEntries, setOriginalEntries] = useState<
    Record<string, number>
  >({});

  // Update URL params when date or product changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedDate) {
      params.set("date", selectedDate);
    }
    if (selectedProductId) {
      params.set("product", selectedProductId);
    }
    setSearchParams(params, { replace: true });
  }, [selectedDate, selectedProductId, setSearchParams]);

  // Compute hasUnsavedChanges by comparing entries with originalEntries
  const hasUnsavedChanges = useMemo(() => {
    const currentKeys = Object.keys(entries);
    const originalKeys = Object.keys(originalEntries);

    // Different number of keys means changes
    if (currentKeys.length !== originalKeys.length) return true;

    // Check if all values match
    for (const key of currentKeys) {
      if (entries[key] !== originalEntries[key]) return true;
    }

    return false;
  }, [entries, originalEntries]);

  // Get products cache
  const { products } = useProductsCache("all");

  // Get staffs cache for production workers
  const { staffs, loading: isLoadingWorkers } = useStaffsCache();

  // Get favorites from localStorage
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Listen for favorites changes (when favorites are updated in ProductSelector)
  useEffect(() => {
    const handleFavoritesChange = () => {
      try {
        const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
        setFavorites(stored ? new Set(JSON.parse(stored)) : new Set());
      } catch {
        // Ignore parse errors
      }
    };

    // Listen for custom event dispatched by ProductSelector
    window.addEventListener("favorites-changed", handleFavoritesChange);
    return () =>
      window.removeEventListener("favorites-changed", handleFavoritesChange);
  }, []);

  // Get favorite products (only BH and MEE types)
  const favoriteProducts = useMemo(() => {
    return products.filter(
      (product) =>
        favorites.has(product.id) &&
        (product.type === "BH" || product.type === "MEE")
    ) as StockProduct[];
  }, [products, favorites]);

  // Get selected product details
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return products.find((p) => p.id === selectedProductId) as
      | StockProduct
      | undefined;
  }, [selectedProductId, products]);

  // Determine product type for worker filtering
  const productType = useMemo(() => {
    if (!selectedProduct) return null;
    return selectedProduct.type === "MEE" ? "MEE" : "BH";
  }, [selectedProduct]);

  // Filter workers from cached staffs based on product type
  const workers: ProductionWorker[] = useMemo(() => {
    if (!productType) return [];

    const jobFilter = productType === "MEE" ? "MEE_PACKING" : "BH_PACKING";

    return staffs
      .filter((staff) => staff.job.includes(jobFilter))
      .map((staff) => ({
        id: staff.id,
        name: staff.name,
        job: staff.job,
      }));
  }, [staffs, productType]);

  // Fetch existing entries when date or product changes
  useEffect(() => {
    const fetchExistingEntries = async () => {
      if (!selectedDate || !selectedProductId) {
        setEntries({});
        setOriginalEntries({});
        return;
      }

      try {
        const response = await api.get(
          `/api/production-entries?date=${selectedDate}&product_id=${selectedProductId}`
        );

        const entriesMap: Record<string, number> = {};
        (response || []).forEach((entry: ProductionEntry) => {
          entriesMap[entry.worker_id] = entry.bags_packed;
        });

        setEntries(entriesMap);
        setOriginalEntries(entriesMap);
      } catch (error) {
        console.error("Error fetching existing entries:", error);
        // Don't show error toast here as it's common to have no entries
        setEntries({});
        setOriginalEntries({});
      }
    };

    fetchExistingEntries();
  }, [selectedDate, selectedProductId]);

  // Handle entry change
  const handleEntryChange = useCallback((workerId: string, value: number) => {
    setEntries((prev) => {
      const newEntries = { ...prev };
      if (value === 0) {
        delete newEntries[workerId];
      } else {
        newEntries[workerId] = value;
      }
      return newEntries;
    });
  }, []);

  // Handle save
  const handleSave = async () => {
    if (!selectedDate || !selectedProductId) {
      toast.error("Please select a date and product first");
      return;
    }

    setIsSaving(true);
    try {
      const entriesArray = Object.entries(entries).map(
        ([worker_id, bags_packed]) => ({
          worker_id,
          bags_packed,
        })
      );

      // Also include workers with 0 bags to clear their entries
      workers.forEach((worker) => {
        if (!entries[worker.id]) {
          entriesArray.push({
            worker_id: worker.id,
            bags_packed: 0,
          });
        }
      });

      const response = await api.post("/api/production-entries/batch", {
        date: selectedDate,
        product_id: selectedProductId,
        entries: entriesArray,
      });

      toast.success(
        `Production saved: ${response.total_bags} total bags from ${response.entry_count} workers`
      );
      setOriginalEntries({ ...entries });
    } catch (error) {
      console.error("Error saving production entries:", error);
      toast.error("Failed to save production entries");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset
  const handleReset = () => {
    setEntries({ ...originalEntries });
  };

  // Format date for display (English full date + Malay weekday only)
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    const english = date.toLocaleDateString("en-MY", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const malayWeekday = date.toLocaleDateString("ms-MY", {
      weekday: "long",
    });
    return { english, malay: malayWeekday };
  };

  return (
    <div className="w-full space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-default-900">
            Production Entry
          </h1>
          <p className="mt-1 text-sm text-default-500">
            Record daily production output per worker
          </p>
        </div>
        {hasUnsavedChanges && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
            Unsaved changes
          </span>
        )}
      </div>

      {/* Selection controls */}
      <div className="rounded-lg border border-default-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Date selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-default-700">
              <div className="flex items-center gap-2">
                <IconCalendar size={16} />
                Date
              </div>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-lg border border-default-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <p className="text-xs text-default-500">
              {formatDateDisplay(selectedDate).english} ({formatDateDisplay(selectedDate).malay})
            </p>
          </div>

          {/* Product selector */}
          <div>
            <ProductSelector
              label="Product"
              value={selectedProductId}
              onChange={(id) => {
                if (hasUnsavedChanges) {
                  if (
                    window.confirm(
                      "You have unsaved changes. Do you want to discard them?"
                    )
                  ) {
                    setSelectedProductId(id);
                  }
                } else {
                  setSelectedProductId(id);
                }
              }}
              productTypes={["BH", "MEE"]}
              showCategories={true}
              required
            />
            {selectedProduct && (
              <p className="mt-2 text-xs text-default-500">
                Type:{" "}
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    selectedProduct.type === "MEE"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {selectedProduct.type === "MEE" ? "Mee" : "Bihun"}
                </span>{" "}
                | Workers with{" "}
                {selectedProduct.type === "MEE" ? "MEE_PACKING" : "BH_PACKING"}{" "}
                job will be shown
              </p>
            )}
            {/* Quick access favorite pills */}
            {favoriteProducts.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <IconStarFilled size={12} className="text-amber-500" />
                {favoriteProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      if (hasUnsavedChanges) {
                        if (
                          window.confirm(
                            "You have unsaved changes. Do you want to discard them?"
                          )
                        ) {
                          setSelectedProductId(product.id);
                        }
                      } else {
                        setSelectedProductId(product.id);
                      }
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      selectedProductId === product.id
                        ? "bg-sky-500 text-white"
                        : "bg-default-100 text-default-600 hover:bg-default-200"
                    }`}
                  >
                    {product.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Workers entry grid */}
      {!selectedProductId ? (
        <div className="rounded-lg border border-dashed border-default-300 p-8 text-center">
          <p className="text-default-500">
            Please select a product to view workers
          </p>
        </div>
      ) : (
        <WorkerEntryGrid
          workers={workers}
          entries={entries}
          onEntryChange={handleEntryChange}
          isLoading={isLoadingWorkers}
          disabled={isSaving}
          onSave={handleSave}
          onReset={handleReset}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSaving}
        />
      )}
    </div>
  );
};

export default ProductionEntryPage;

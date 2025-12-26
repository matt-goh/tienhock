// src/pages/Stock/ProductionEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import ProductSelector from "../../components/Stock/ProductSelector";
import WorkerEntryGrid from "../../components/Stock/WorkerEntryGrid";
import Button from "../../components/Button";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import {
  ProductionEntry,
  ProductionWorker,
  StockProduct,
} from "../../types/types";
import { IconCalendar, IconDeviceFloppy, IconRefresh, IconStarFilled } from "@tabler/icons-react";

const FAVORITES_STORAGE_KEY = "stock-product-favorites";

const ProductionEntryPage: React.FC = () => {
  // State
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [entries, setEntries] = useState<Record<string, number>>({});
  const [isLoadingWorkers, setIsLoadingWorkers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalEntries, setOriginalEntries] = useState<Record<string, number>>(
    {}
  );

  // Get products cache
  const { products } = useProductsCache("all");

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
    return () => window.removeEventListener("favorites-changed", handleFavoritesChange);
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
    return products.find((p) => p.id === selectedProductId) as StockProduct | undefined;
  }, [selectedProductId, products]);

  // Determine product type for worker filtering
  const productType = useMemo(() => {
    if (!selectedProduct) return null;
    return selectedProduct.type === "MEE" ? "MEE" : "BH";
  }, [selectedProduct]);

  // Fetch workers when product type changes
  useEffect(() => {
    const fetchWorkers = async () => {
      if (!productType) {
        setWorkers([]);
        return;
      }

      setIsLoadingWorkers(true);
      try {
        const response = await api.get(
          `/api/production-entries/workers?product_type=${productType}`
        );
        setWorkers(response || []);
      } catch (error) {
        console.error("Error fetching workers:", error);
        toast.error("Failed to load workers");
        setWorkers([]);
      } finally {
        setIsLoadingWorkers(false);
      }
    };

    fetchWorkers();
  }, [productType]);

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
        setHasUnsavedChanges(false);
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
    setHasUnsavedChanges(true);
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
      setHasUnsavedChanges(false);
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
    setHasUnsavedChanges(false);
  };

  // Calculate total
  const totalBags = useMemo(() => {
    return Object.values(entries).reduce((sum, bags) => sum + (bags || 0), 0);
  }, [entries]);

  // Format date for display
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-MY", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="w-full space-y-6 p-4">
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
              {formatDateDisplay(selectedDate)}
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
                    setHasUnsavedChanges(false);
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
                          setHasUnsavedChanges(false);
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
      <div className="rounded-lg border border-default-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-default-900">
            Worker Production
          </h2>
          {selectedProductId && workers.length > 0 && (
            <span className="text-sm text-default-500">
              {workers.length} worker{workers.length !== 1 ? "s" : ""} available
            </span>
          )}
        </div>

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
          />
        )}
      </div>

      {/* Action buttons */}
      {selectedProductId && workers.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-default-200 bg-white p-4 shadow-sm">
          <div className="text-lg">
            <span className="text-default-500">Total Production:</span>{" "}
            <span className="font-bold text-default-900">
              {totalBags.toLocaleString()} bags
            </span>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleReset}
              disabled={!hasUnsavedChanges || isSaving}
              color="default"
            >
              <IconRefresh size={18} className="mr-2" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              color="sky"
            >
              <IconDeviceFloppy size={18} className="mr-2" />
              {isSaving ? "Saving..." : "Save Production"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionEntryPage;

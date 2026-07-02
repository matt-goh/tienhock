// src/pages/JellyPolly/Stock/JPProductionEntryPage.tsx
// Jelly Polly production entry. Clean JP-specific version of the TH
// ProductionEntryPage: JP products only (products.type='JP' from the shared
// catalogue), workers from the JP PRODUCTION assignments, shared
// production_entries / machine-status backend, and the shared WorkerEntryGrid
// (drag-and-drop worker ordering, scope JP_PRODUCTION).
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { IconLink, IconPackage } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import TimeNavigator from "../../../components/TimeNavigator";
import WorkerEntryGrid from "../../../components/Stock/WorkerEntryGrid";
import ProductPayCodeMappingModal from "../../../components/Stock/ProductPayCodeMappingModal";
import { api } from "../../../routes/utils/api";
import { useProductsCache } from "../../../utils/invoice/useProductsCache";
import { ProductionWorker } from "../../../types/types";

const JPProductionEntryPage: React.FC = () => {
  const { products } = useProductsCache("all");

  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [entries, setEntries] = useState<Record<string, number>>({});
  const [originalEntries, setOriginalEntries] = useState<
    Record<string, number>
  >({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isMachineBroken, setIsMachineBroken] = useState<boolean>(false);
  const [showMappingModal, setShowMappingModal] = useState<boolean>(false);

  const jpProducts = useMemo(
    () => products.filter((product) => product.type === "JP"),
    [products]
  );

  const selectedProduct = useMemo(
    () => jpProducts.find((product) => product.id === selectedProductId),
    [jpProducts, selectedProductId]
  );

  // Load JP production workers once
  useEffect(() => {
    const fetchWorkers = async (): Promise<void> => {
      try {
        const response: ProductionWorker[] = await api.get(
          "/api/production-entries/workers?product_type=JP"
        );
        setWorkers(response);
      } catch (error) {
        console.error("Error fetching JP production workers:", error);
        toast.error("Failed to load production workers");
      }
    };
    fetchWorkers();
  }, []);

  // Load existing entries + machine status when date/product changes
  useEffect(() => {
    if (!selectedProductId) return;
    let cancelled = false;

    const fetchEntries = async (): Promise<void> => {
      setIsLoading(true);
      try {
        const [entriesResponse, machineResponse] = await Promise.all([
          api.get(
            `/api/production-entries?date=${selectedDate}&product_id=${selectedProductId}`
          ),
          api.get(
            `/api/production-entries/machine-broken?date=${selectedDate}&product_id=${selectedProductId}`
          ),
        ]);
        if (cancelled) return;

        const entriesMap: Record<string, number> = {};
        (entriesResponse || []).forEach(
          (entry: { worker_id: string; bags_packed: number }) => {
            if (entry.worker_id) {
              entriesMap[entry.worker_id] = Number(entry.bags_packed) || 0;
            }
          }
        );
        setEntries(entriesMap);
        setOriginalEntries({ ...entriesMap });
        setIsMachineBroken(machineResponse.machine_broken || false);
      } catch (error) {
        console.error("Error fetching JP production entries:", error);
        toast.error("Failed to load production entries");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchEntries();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedProductId]);

  const hasUnsavedChanges = useMemo(() => {
    const keys = new Set([
      ...Object.keys(entries),
      ...Object.keys(originalEntries),
    ]);
    return [...keys].some(
      (key) => (entries[key] || 0) !== (originalEntries[key] || 0)
    );
  }, [entries, originalEntries]);

  const handleEntryChange = useCallback(
    (workerId: string, value: number): void => {
      setEntries((prev) => ({ ...prev, [workerId]: value }));
    },
    []
  );

  const handleMachineBrokenToggle = async (): Promise<void> => {
    if (!selectedProductId) return;
    const newValue = !isMachineBroken;
    try {
      await api.put("/api/production-entries/machine-broken", {
        date: selectedDate,
        product_id: selectedProductId,
        machine_broken: newValue,
      });
      setIsMachineBroken(newValue);
      toast.success(
        newValue ? "Machine marked as broken" : "Machine marked as working"
      );
    } catch (error) {
      console.error("Error updating machine status:", error);
      toast.error("Failed to update machine status");
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!selectedDate || !selectedProductId) {
      toast.error("Please select a date and product first");
      return;
    }

    setIsSaving(true);
    try {
      const entriesArray: { worker_id: string; bags_packed: number }[] =
        Object.entries(entries).map(([worker_id, bags_packed]) => ({
          worker_id,
          bags_packed,
        }));
      // Include workers with 0 bags to clear their entries
      workers.forEach((worker) => {
        if (!entries[worker.id]) {
          entriesArray.push({ worker_id: worker.id, bags_packed: 0 });
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
      console.error("Error saving JP production entries:", error);
      toast.error("Failed to save production entries");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = (): void => {
    setEntries({ ...originalEntries });
  };

  const selectedDateRange = useMemo(
    () => ({
      start: new Date(`${selectedDate}T00:00:00`),
      end: new Date(`${selectedDate}T23:59:59`),
    }),
    [selectedDate]
  );

  const handleProductSelect = (productId: string): void => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Discard them and switch product?"
      );
      if (!confirmed) return;
    }
    setSelectedProductId(productId);
  };

  return (
    <div className="space-y-4">
      {/* Header: title + date + machine toggle */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            JP Production Entry
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400">
            Daily bags packed per worker for Jelly Polly products
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-3">
          <TimeNavigator
            range={selectedDateRange}
            onChange={(range: { start: Date }) =>
              setSelectedDate(format(range.start, "yyyy-MM-dd"))
            }
            modes={["day"]}
            presets={false}
            size="sm"
          />
          <Button
            size="sm"
            variant="outline"
            icon={IconLink}
            iconSize={16}
            onClick={() => setShowMappingModal(true)}
          >
            Mappings
          </Button>
          {selectedProduct && (
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium ${
                  isMachineBroken
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-default-500 dark:text-gray-400"
                }`}
              >
                Machine Rosak
              </span>
              <button
                type="button"
                onClick={handleMachineBrokenToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isMachineBroken ? "bg-rose-600" : "bg-gray-200 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isMachineBroken ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* JP product selector */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-3">
          Jelly Polly Products
        </h2>
        {jpProducts.length === 0 ? (
          <p className="text-sm text-default-400 dark:text-gray-500">
            No JP products found in the product catalogue.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {jpProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleProductSelect(product.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-colors ${
                  selectedProductId === product.id
                    ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                    : "border-default-200 dark:border-gray-700 text-default-700 dark:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700"
                }`}
              >
                <IconPackage size={18} className="flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block font-medium truncate">
                    {product.id}
                  </span>
                  <span className="block text-xs text-default-400 dark:text-gray-500 truncate">
                    {product.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Worker entry grid (shared drag-and-drop ordering, JP scope) */}
      {selectedProduct &&
        (isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <WorkerEntryGrid
            workers={workers}
            entries={entries}
            onEntryChange={handleEntryChange}
            onSave={handleSave}
            onReset={handleReset}
            hasUnsavedChanges={hasUnsavedChanges}
            isSaving={isSaving}
            unitLabel="bags"
            workerOrderScope="JP_PRODUCTION"
          />
        ))}

      {/* Product -> pay code mapping (JP products, JP_PACKING job codes) */}
      <ProductPayCodeMappingModal
        isOpen={showMappingModal}
        onClose={() => setShowMappingModal(false)}
        productTypes={["JP"]}
      />
    </div>
  );
};

export default JPProductionEntryPage;

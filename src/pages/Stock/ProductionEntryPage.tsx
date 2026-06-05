// src/pages/Stock/ProductionEntryPage.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import ProductSelector from "../../components/Stock/ProductSelector";
import WorkerEntryGrid from "../../components/Stock/WorkerEntryGrid";
import HancurEntrySection, {
  HancurEntrySectionHandle,
} from "../../components/Stock/HancurEntrySection";
import BundleEntrySection, {
  BundleEntrySectionHandle,
} from "../../components/Stock/BundleEntrySection";
import ProductionHelpDialog from "../../components/Stock/ProductionHelpDialog";
import DateNavigator from "../../components/DateNavigator";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  ProductionEntry,
  ProductionWorker,
  ProductionWorkerOrderScope,
  StockProduct,
} from "../../types/types";
import {
  IconCalendar,
  IconStarFilled,
  IconSettings,
  IconHelpCircle,
  IconPackages,
  IconBox,
  IconSearch,
  IconX,
  IconAlertTriangle,
  IconRefresh,
  IconDeviceFloppy,
  IconPackage,
} from "@tabler/icons-react";
import { Switch } from "@headlessui/react";
import Button from "../../components/Button";
import ProductPayCodeMappingModal from "../../components/Stock/ProductPayCodeMappingModal";
import { isSpecialItem } from "../../config/specialItems";
import {
  OTH_PRODUCTION_IDS,
  isOthProductionProduct,
} from "../../config/othProductionProducts";

const FAVORITES_STORAGE_KEY = "stock-product-favorites";
const STOCK_ONLY_WORKER_ID = "__STOCK_ONLY__";

const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// Special selection types for Hancur and Bundle entries
type SpecialSelection =
  | "HANCUR_BH"
  | "BUNDLE_BP"
  | "BUNDLE_BH"
  | "BUNDLE_MEE"
  | null;

const ProductionEntryPage: React.FC = () => {
  // Get initial values from URL params or defaults
  const getInitialDate = (): string => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    if (dateParam) {
      const parsed = parseLocalDate(dateParam);
      if (!isNaN(parsed.getTime())) {
        return dateParam;
      }
    }
    return formatDateLocal(new Date());
  };

  const getInitialProduct = (): string | null => {
    const params = new URLSearchParams(window.location.search);
    const productParam = params.get("product");
    if (
      productParam === "HANCUR_BH" ||
      productParam === "KARUNG_HANCUR" ||
      productParam === "BUNDLE_BP" ||
      productParam === "BUNDLE_BH" ||
      productParam === "BUNDLE_MEE"
    ) {
      return null;
    }
    return productParam || null;
  };

  const getInitialSpecialSelection = (): SpecialSelection => {
    const params = new URLSearchParams(window.location.search);
    const productParam = params.get("product");
    if (productParam === "HANCUR_BH" || productParam === "KARUNG_HANCUR") {
      return "HANCUR_BH";
    }
    if (
      productParam === "BUNDLE_BP" ||
      productParam === "BUNDLE_BH" ||
      productParam === "BUNDLE_MEE"
    ) {
      return productParam;
    }
    return null;
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
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [specialSelection, setSpecialSelection] =
    useState<SpecialSelection>(getInitialSpecialSelection);
  const [workerSearchQuery, setWorkerSearchQuery] = useState("");
  const [hancurSearchQuery, setHancurSearchQuery] = useState("");
  const [bundleSearchQuery, setBundleSearchQuery] = useState("");
  const [workerOrderRefreshKey, setWorkerOrderRefreshKey] = useState(0);
  const [isMachineBroken, setIsMachineBroken] = useState(false);
  const [isLoadingMachineStatus, setIsLoadingMachineStatus] = useState(false);

  // Refs for checking unsaved changes in HANCUR and BUNDLE sections
  const hancurSectionRef = useRef<HancurEntrySectionHandle>(null);
  const bundleSectionRef = useRef<BundleEntrySectionHandle>(null);

  // Compute hasUnsavedChanges by comparing entries with originalEntries
  const hasUnsavedChanges = useMemo(() => {
    const currentKeys = Object.keys(entries);
    const originalKeys = Object.keys(originalEntries);

    if (currentKeys.length !== originalKeys.length) return true;

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

  // Listen for favorites changes
  useEffect(() => {
    const handleFavoritesChange = () => {
      try {
        const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
        setFavorites(stored ? new Set(JSON.parse(stored)) : new Set());
      } catch {
        // Ignore parse errors
      }
    };

    window.addEventListener("favorites-changed", handleFavoritesChange);
    return () =>
      window.removeEventListener("favorites-changed", handleFavoritesChange);
  }, []);

  // Filter out HANCUR special items from regular product lists
  // BUNDLE products are star-able even though they're special items
  // OTH products are only included if they're whitelisted for production entry
  const regularProducts = useMemo(() => {
    return products.filter(
      (product) =>
        !isSpecialItem(product.id) &&
        (product.type === "BH" ||
          product.type === "MEE" ||
          OTH_PRODUCTION_IDS.includes(product.id))
    ) as StockProduct[];
  }, [products]);

  // Get all star-able products (regular + bundle + HANCUR_BH)
  // Note: KARUNG_HANCUR is internal to HancurEntrySection, not shown separately
  const starableProducts = useMemo(() => {
    const bundleProducts = products.filter(
      (product) => product.type === "BUNDLE"
    ) as StockProduct[];
    const hancurBH = products.find((p) => p.id === "HANCUR_BH") as StockProduct | undefined;
    return [...regularProducts, ...bundleProducts, ...(hancurBH ? [hancurBH] : [])];
  }, [products, regularProducts]);

  // Get favorite products (regular BH/MEE + BUNDLE + HANCUR_BH)
  const favoriteProducts = useMemo(() => {
    return starableProducts.filter((product) => favorites.has(product.id));
  }, [starableProducts, favorites]);

  // Get non-favorite products grouped by type
  const nonFavoriteProducts = useMemo(() => {
    const filtered = regularProducts.filter(
      (product) => !favorites.has(product.id)
    );

    // Include HANCUR_BH in BH section if not favorited
    // Note: KARUNG_HANCUR is internal to HancurEntrySection, not shown separately
    const bhProducts = filtered.filter((p) => p.type === "BH");
    const hancurBH = products.find((p) => p.id === "HANCUR_BH") as StockProduct | undefined;
    if (hancurBH && !favorites.has("HANCUR_BH")) {
      bhProducts.push(hancurBH);
    }

    // Get non-favorited bundle products
    const bundleProducts = products.filter(
      (p) => p.type === "BUNDLE" && !favorites.has(p.id)
    ) as StockProduct[];

    return {
      MEE: filtered.filter((p) => p.type === "MEE"),
      BH: bhProducts,
      BUNDLE: bundleProducts,
      OTH: filtered.filter((p) => p.type === "OTH"),
    };
  }, [regularProducts, favorites, products]);

  // Get selected product details
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return products.find((p) => p.id === selectedProductId) as
      | StockProduct
      | undefined;
  }, [selectedProductId, products]);

  // Filter workers from cached staffs.
  // OTH production products are stock-only and use a single quantity input.
  const workers: ProductionWorker[] = useMemo(() => {
    if (!selectedProduct) return [];

    if (isOthProductionProduct(selectedProduct.id)) return [];

    const jobFilters: string[] = [
      selectedProduct.type === "MEE" ? "MEE_PACKING" : "BH_PACKING",
    ];

    return staffs
      .filter((staff) => jobFilters.some((j) => staff.job.includes(j)))
      .map((staff) => ({
        id: staff.id,
        name: staff.name,
        job: staff.job,
      }));
  }, [staffs, selectedProduct]);

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

        if (isOthProductionProduct(selectedProductId)) {
          const totalQuantity: number = (response || []).reduce(
            (sum: number, entry: ProductionEntry) =>
              sum + (Number(entry.bags_packed) || 0),
            0
          );

          if (totalQuantity > 0) {
            entriesMap[STOCK_ONLY_WORKER_ID] = totalQuantity;
          }
        } else {
          (response || []).forEach((entry: ProductionEntry) => {
            if (!entry.worker_id) return;
            entriesMap[entry.worker_id] = Number(entry.bags_packed) || 0;
          });
        }

        setEntries(entriesMap);
        setOriginalEntries(entriesMap);
      } catch (error) {
        console.error("Error fetching existing entries:", error);
        setEntries({});
        setOriginalEntries({});
      }
    };

    fetchExistingEntries();
  }, [selectedDate, selectedProductId]);

  // Fetch machine broken status when date or product changes
  useEffect(() => {
    const fetchMachineStatus = async () => {
      // Only fetch for regular BH/MEE products (not BUNDLE, HANCUR, etc.)
      if (!selectedDate || !selectedProductId || specialSelection !== null) {
        setIsMachineBroken(false);
        return;
      }

      // Only fetch for BH and MEE product types
      if (!selectedProduct || (selectedProduct.type !== "BH" && selectedProduct.type !== "MEE")) {
        setIsMachineBroken(false);
        return;
      }

      setIsLoadingMachineStatus(true);
      try {
        const response = await api.get(
          `/api/production-entries/machine-broken?date=${selectedDate}&product_id=${selectedProductId}`
        );
        setIsMachineBroken(response.machine_broken || false);
      } catch (error) {
        console.error("Error fetching machine status:", error);
        setIsMachineBroken(false);
      } finally {
        setIsLoadingMachineStatus(false);
      }
    };

    fetchMachineStatus();
  }, [selectedDate, selectedProductId, specialSelection, selectedProduct]);

  // Handle machine broken toggle
  const handleMachineBrokenToggle = async (
    newValue: boolean
  ): Promise<void> => {
    if (!selectedDate || !selectedProductId) return;

    try {
      await api.put("/api/production-entries/machine-broken", {
        date: selectedDate,
        product_id: selectedProductId,
        machine_broken: newValue,
      });
      setIsMachineBroken(newValue);
      toast.success(newValue ? "Mesin rosak ditanda" : "Mesin rosak dibuang");
    } catch (error) {
      console.error("Error updating machine status:", error);
      toast.error("Gagal kemaskini status mesin");
    }
  };

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

  const handleStockOnlyEntryChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const value: string = event.target.value;

    if (value === "") {
      handleEntryChange(STOCK_ONLY_WORKER_ID, 0);
      return;
    }

    const quantity: number = parseInt(value, 10);
    if (!isNaN(quantity) && quantity >= 0) {
      handleEntryChange(STOCK_ONLY_WORKER_ID, quantity);
    }
  };

  // Handle save
  const handleSave = async (): Promise<void> => {
    if (!selectedDate || !selectedProductId) {
      toast.error("Please select a date and product first");
      return;
    }

    setIsSaving(true);
    try {
      const isStockOnlyProduct: boolean =
        isOthProductionProduct(selectedProductId);
      const entriesArray: { worker_id: string; bags_packed: number }[] =
        isStockOnlyProduct
          ? [
              {
                worker_id: STOCK_ONLY_WORKER_ID,
                bags_packed: entries[STOCK_ONLY_WORKER_ID] || 0,
              },
            ]
          : Object.entries(entries).map(([worker_id, bags_packed]) => ({
              worker_id,
              bags_packed,
            }));

      if (!isStockOnlyProduct) {
        // Include workers with 0 bags to clear their entries
        workers.forEach((worker) => {
          if (!entries[worker.id]) {
            entriesArray.push({
              worker_id: worker.id,
              bags_packed: 0,
            });
          }
        });
      }

      const response = await api.post("/api/production-entries/batch", {
        date: selectedDate,
        product_id: selectedProductId,
        entries: entriesArray,
      });

      toast.success(
        isStockOnlyProduct
          ? `Stock record saved: ${response.total_bags} total`
          : `Production saved: ${response.total_bags} total bags from ${response.entry_count} workers`
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
  const handleReset = (): void => {
    setEntries({ ...originalEntries });
  };

  // Handle special selection change with unsaved changes warning
  const handleSpecialSelect = (selection: SpecialSelection): void => {
    // Check for unsaved changes based on current selection
    let hasCurrentUnsavedChanges = false;

    if (specialSelection === null && selectedProductId) {
      // Currently viewing a regular product
      hasCurrentUnsavedChanges = hasUnsavedChanges;
    } else if (specialSelection === "HANCUR_BH") {
      hasCurrentUnsavedChanges =
        hancurSectionRef.current?.hasUnsavedChanges() ?? false;
    } else if (specialSelection?.startsWith("BUNDLE_")) {
      hasCurrentUnsavedChanges =
        bundleSectionRef.current?.hasUnsavedChanges() ?? false;
    }

    if (hasCurrentUnsavedChanges) {
      if (
        !window.confirm(
          "You have unsaved changes. Do you want to discard them?"
        )
      ) {
        return;
      }
    }
    setSpecialSelection(selection);
    setSelectedProductId(null);
  };

  // Handle product selection with unsaved changes warning
  const handleProductSelect = (productId: string | null): void => {
    // Check for unsaved changes in current view
    let hasCurrentUnsavedChanges = false;
    if (specialSelection === null && selectedProductId) {
      hasCurrentUnsavedChanges = hasUnsavedChanges;
    } else if (specialSelection === "HANCUR_BH") {
      hasCurrentUnsavedChanges =
        hancurSectionRef.current?.hasUnsavedChanges() ?? false;
    } else if (specialSelection?.startsWith("BUNDLE_")) {
      hasCurrentUnsavedChanges =
        bundleSectionRef.current?.hasUnsavedChanges() ?? false;
    }

    if (hasCurrentUnsavedChanges) {
      if (
        !window.confirm(
          "You have unsaved changes. Do you want to discard them?"
        )
      ) {
        return;
      }
    }

    // Check if selecting Hancur - route to special selection
    if (productId === "HANCUR_BH") {
      setSpecialSelection("HANCUR_BH");
      setSelectedProductId(null);
      setWorkerSearchQuery("");
      return;
    }

    // Check if selecting a Bundle product - route to special selection instead
    if (productId && productId.startsWith("BUNDLE_")) {
      setSpecialSelection(productId as SpecialSelection);
      setSelectedProductId(null);
      setWorkerSearchQuery("");
      return;
    }

    setSelectedProductId(productId);
    setSpecialSelection(null);
    setWorkerSearchQuery(""); // Clear search when changing product
  };

  const handleDateNavigatorChange = (date: Date): void => {
    setSelectedDate(formatDateLocal(date));
  };

  const handleDateInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const nextDate: string = event.target.value;
    if (!nextDate) return;
    setSelectedDate(nextDate);
  };

  const formatNavigatorDisplay = (date: Date): string => {
    return date.toLocaleDateString("ms-MY", {
      weekday: "long",
    });
  };

  const productionProductFilter = useCallback(
    (product: StockProduct): boolean =>
      product.type !== "OTH" || OTH_PRODUCTION_IDS.includes(product.id),
    []
  );

  // Check if we're viewing a regular product (not special selection)
  const isViewingProduct =
    selectedProductId !== null && specialSelection === null;
  const isViewingStockOnlyProduct: boolean =
    selectedProductId !== null && isOthProductionProduct(selectedProductId);
  const stockOnlyQuantity: number = entries[STOCK_ONLY_WORKER_ID] || 0;
  const workerOrderScope: ProductionWorkerOrderScope | undefined =
    selectedProduct?.type === "MEE"
      ? "MEE_PACKING"
      : selectedProduct?.type === "BH"
      ? "BH_PACKING"
      : undefined;

  return (
    <div className="rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      {/* Header + Date Selector */}
      <div className="p-4 border-b border-default-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title | Date */}
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-default-900 dark:text-gray-100">
              Production Entry
            </h1>
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <IconCalendar
                size={16}
                className="text-default-500 dark:text-gray-400"
              />
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateInputChange}
                max={formatDateLocal(new Date())}
                className="rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <DateNavigator
                selectedDate={parseLocalDate(selectedDate)}
                onChange={handleDateNavigatorChange}
                showGoToTodayButton={false}
                formatDisplay={formatNavigatorDisplay}
                size="sm"
              />
            </div>
            {/* Machine Rosak Toggle - only show when viewing a regular BH/MEE product */}
            {isViewingProduct && (selectedProduct?.type === "BH" || selectedProduct?.type === "MEE") && (
              <>
                <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${
                      isMachineBroken
                        ? "text-red-600 dark:text-red-400"
                        : "text-default-500 dark:text-gray-400"
                    }`}
                  >
                    Mesin Rosak
                  </span>
                  <Switch
                    checked={isMachineBroken}
                    onChange={handleMachineBrokenToggle}
                    disabled={isLoadingMachineStatus}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                      isMachineBroken
                        ? "bg-red-500"
                        : "bg-default-200 dark:bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 ${
                        isMachineBroken ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </Switch>
                </div>
              </>
            )}
          </div>

          {/* Right: Buttons */}
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && isViewingProduct && (
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                Unsaved
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              icon={IconHelpCircle}
              onClick={() => setShowHelpDialog(true)}
            >
              Help
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={IconRefresh}
              onClick={() =>
                setWorkerOrderRefreshKey((previousKey) => previousKey + 1)
              }
            >
              Refresh Order
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={IconSettings}
              onClick={() => setShowMappingModal(true)}
            >
              Mappings
            </Button>
          </div>
        </div>
      </div>

      {/* Product Selection - Shows when no product or special section selected */}
      {!selectedProductId && specialSelection === null && (
        <div className="p-4">
          <div className="space-y-4">
            {/* Product Selector Dropdown (for search/starring) */}
            <div className="pb-4 border-b border-default-200 dark:border-gray-700">
              <ProductSelector
                label="Search for a product (click star to favorite)"
                value={selectedProductId}
                onChange={handleProductSelect}
                productTypes={["MEE", "BH", "BUNDLE", "OTH"]}
                productFilter={productionProductFilter}
              />
            </div>

            {/* Starred Products Section */}
            {favoriteProducts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <IconStarFilled size={14} className="text-amber-500" />
                  <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                    Starred Products
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {favoriteProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductSelect(product.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 text-sm transition-colors hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    >
                      <IconStarFilled
                        size={12}
                        className="text-amber-500 flex-shrink-0"
                      />
                      <span className="font-semibold text-default-900 dark:text-gray-100">
                        {product.id}
                      </span>
                      {product.description && (
                        <>
                          <span className="text-default-400 dark:text-gray-500">
                            ·
                          </span>
                          <span className="text-default-700 dark:text-gray-300">
                            {product.description}
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mee Products Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                  Mee Products
                </span>
              </div>
              {nonFavoriteProducts.MEE.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {nonFavoriteProducts.MEE.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductSelect(product.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-default-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 px-2.5 py-1.5 text-sm transition-colors hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
                    >
                      <span className="font-semibold text-default-900 dark:text-gray-100">
                        {product.id}
                      </span>
                      {product.description && (
                        <>
                          <span className="text-default-400 dark:text-gray-500">
                            ·
                          </span>
                          <span className="text-default-700 dark:text-gray-300">
                            {product.description}
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-default-500 dark:text-gray-400">
                  No Mee products available
                </p>
              )}
            </div>

            {/* Bihun Products Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                  Bihun Products
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {nonFavoriteProducts.BH.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductSelect(product.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-default-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 px-2.5 py-1.5 text-sm transition-colors hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    <span className="font-semibold text-default-900 dark:text-gray-100">
                      {product.id}
                    </span>
                    {product.description && (
                      <>
                        <span className="text-default-400 dark:text-gray-500">
                          ·
                        </span>
                        <span className="text-default-700 dark:text-gray-300">
                          {product.description}
                        </span>
                      </>
                    )}
                  </button>
                ))}
              </div>
              {nonFavoriteProducts.BH.length === 0 && (
                <p className="text-sm text-default-500 dark:text-gray-400">
                  No Bihun products available
                </p>
              )}
            </div>

            {/* Bundle Products Section */}
            {nonFavoriteProducts.BUNDLE.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <IconPackages size={14} className="text-amber-500" />
                  <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                    Bundle Products
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {nonFavoriteProducts.BUNDLE.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductSelect(product.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-default-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 px-2.5 py-1.5 text-sm transition-colors hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    >
                      <span className="font-semibold text-default-900 dark:text-gray-100">
                        {product.id}
                      </span>
                      {product.description && (
                        <>
                          <span className="text-default-400 dark:text-gray-500">·</span>
                          <span className="text-default-700 dark:text-gray-300">
                            {product.description}
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Other Products Section */}
            {nonFavoriteProducts.OTH.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <IconBox size={14} className="text-purple-500" />
                  <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                    Other Products
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {nonFavoriteProducts.OTH.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductSelect(product.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-default-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 px-2.5 py-1.5 text-sm transition-colors hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    >
                      <span className="font-semibold text-default-900 dark:text-gray-100">
                        {product.id}
                      </span>
                      {product.description && (
                        <>
                          <span className="text-default-400 dark:text-gray-500">·</span>
                          <span className="text-default-700 dark:text-gray-300">
                            {product.description}
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Worker Entry Grid when a regular product is selected */}
      {isViewingProduct && (
        <>
          {/* Selected Product Info */}
          <div className="px-4 py-3 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-800/50">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              {/* Left side: Product info + Starred pills */}
              <div className="flex flex-wrap items-center gap-2 lg:gap-3 min-w-0">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium flex-shrink-0 ${
                    selectedProduct?.type === "MEE"
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      : selectedProduct?.type === "OTH"
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                      : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                  }`}
                >
                  {selectedProduct?.type === "MEE"
                    ? "Mee"
                    : selectedProduct?.type === "OTH"
                    ? "Other"
                    : "Bihun"}
                </span>
                <div className="flex-shrink-0">
                  <span className="font-semibold text-default-900 dark:text-gray-100">
                    {selectedProduct?.id}
                  </span>
                  {selectedProduct?.description && (
                    <span className="ml-2 text-default-500 dark:text-gray-400 hidden sm:inline">
                      - {selectedProduct.description}
                    </span>
                  )}
                </div>

                {/* Machine Rosak Badge */}
                {isMachineBroken && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400 flex-shrink-0">
                    <IconAlertTriangle size={12} />
                    Mesin Rosak
                  </span>
                )}

                {/* Starred products mini pills for quick navigation */}
                {favoriteProducts.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-default-300 dark:bg-gray-600 hidden sm:block flex-shrink-0" />
                    <div className="flex flex-wrap items-center gap-1 min-w-0">
                      {favoriteProducts
                        .filter((p) => p.id !== selectedProductId)
                        .slice(0, 7)
                        .map((product) => (
                          <button
                            key={product.id}
                            onClick={() => handleProductSelect(product.id)}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                            title={product.description || product.id}
                          >
                            <IconStarFilled size={10} className="flex-shrink-0" />
                            <span className="truncate max-w-[60px] sm:max-w-[80px]">
                              {product.id}
                            </span>
                          </button>
                        ))}
                      {favoriteProducts.filter((p) => p.id !== selectedProductId)
                        .length > 7 && (
                        <span className="text-xs text-default-400 dark:text-gray-500">
                          +
                          {favoriteProducts.filter(
                            (p) => p.id !== selectedProductId
                          ).length - 7}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Right side: Search + Change product */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {!isViewingStockOnlyProduct && (
                  <>
                    <div className="relative">
                      <IconSearch
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
                      />
                      <input
                        type="text"
                        placeholder="Search worker..."
                        value={workerSearchQuery}
                        onChange={(e) => setWorkerSearchQuery(e.target.value)}
                        className="w-32 sm:w-40 rounded-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 py-1 pl-7 pr-7 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      {workerSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setWorkerSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-200"
                        >
                          <IconX size={12} />
                        </button>
                      )}
                    </div>
                    <div className="h-4 w-px bg-default-300 dark:bg-gray-600" />
                  </>
                )}
                <button
                  onClick={() => handleProductSelect(null)}
                  className="text-sm text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 whitespace-nowrap"
                >
                  Change product
                </button>
              </div>
            </div>
          </div>

          {isViewingStockOnlyProduct ? (
            <div className="overflow-hidden">
              <div className="p-4 bg-white dark:bg-gray-800">
                <div className="max-w-sm rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <label
                    htmlFor="stock-only-quantity"
                    className="block text-sm font-medium text-default-700 dark:text-gray-300"
                  >
                    Quantity
                  </label>
                  <input
                    id="stock-only-quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={stockOnlyQuantity > 0 ? stockOnlyQuantity : ""}
                    onChange={handleStockOnlyEntryChange}
                    onFocus={(e) => e.target.select()}
                    disabled={isSaving}
                    placeholder="0"
                    className="mt-2 w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-right text-lg font-semibold text-default-900 dark:text-gray-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <IconPackage
                      className="text-purple-600 dark:text-purple-400"
                      size={20}
                    />
                  </div>
                  <div>
                    <div className="font-semibold text-default-900 dark:text-gray-100">
                      Stock Total
                    </div>
                    <div className="text-xs text-default-500 dark:text-gray-400">
                      {parseLocalDate(selectedDate).toLocaleDateString("en-MY", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="ml-4 pl-6 border-l border-default-300 dark:border-gray-600">
                    <p className="text-2xl font-bold text-default-900 dark:text-gray-100">
                      {stockOnlyQuantity.toLocaleString()}{" "}
                      <span className="text-base font-normal text-default-500 dark:text-gray-400">
                        pcs
                      </span>
                    </p>
                  </div>
                </div>

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
                    disabled={!hasUnsavedChanges || isSaving}
                    color="sky"
                    icon={IconDeviceFloppy}
                  >
                    {isSaving ? "Saving..." : "Save Production"}
                  </Button>
                </div>
              </div>
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
              searchQuery={workerSearchQuery}
              onSearchChange={setWorkerSearchQuery}
              workerOrderScope={workerOrderScope}
              workerOrderRefreshKey={workerOrderRefreshKey}
            />
          )}
        </>
      )}

      {/* Hancur Section - Show when HANCUR_BH special selection */}
      {specialSelection === "HANCUR_BH" && (
        <>
          <div className="px-4 py-2 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-700/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <IconBox size={16} className="text-purple-500" />
                  <span className="font-medium text-sm text-default-900 dark:text-gray-100">
                    Bihun Hancur
                  </span>
                </div>

                {/* Starred products mini pills for quick navigation */}
                {favoriteProducts.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-default-300 dark:bg-gray-600 hidden sm:block flex-shrink-0" />
                    <div className="flex flex-wrap items-center gap-1 min-w-0">
                      {favoriteProducts
                        .filter((p) => p.id !== "HANCUR_BH")
                        .slice(0, 7)
                        .map((product) => (
                          <button
                            key={product.id}
                            onClick={() => handleProductSelect(product.id)}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                            title={product.description || product.id}
                          >
                            <IconStarFilled size={10} className="flex-shrink-0" />
                            <span className="truncate max-w-[60px] sm:max-w-[80px]">
                              {product.id}
                            </span>
                          </button>
                        ))}
                      {favoriteProducts.filter((p) => p.id !== "HANCUR_BH")
                        .length > 7 && (
                        <span className="text-xs text-default-400 dark:text-gray-500">
                          +
                          {favoriteProducts.filter(
                            (p) => p.id !== "HANCUR_BH"
                          ).length - 7}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              {/* Right side: Search + Change product */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Mini Worker Search Input */}
                <div className="relative">
                  <IconSearch
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
                  />
                  <input
                    type="text"
                    placeholder="Search worker..."
                    value={workerSearchQuery}
                    onChange={(e) => setWorkerSearchQuery(e.target.value)}
                    className="w-32 sm:w-40 rounded-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 py-1 pl-7 pr-7 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {workerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setWorkerSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-200"
                    >
                      <IconX size={12} />
                    </button>
                  )}
                </div>
                <div className="h-4 w-px bg-default-300 dark:bg-gray-600" />
                <button
                  onClick={() => handleSpecialSelect(null)}
                  className="text-sm text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 flex-shrink-0"
                >
                  Back to selection
                </button>
              </div>
            </div>
          </div>
          <HancurEntrySection
            ref={hancurSectionRef}
            selectedDate={selectedDate}
            searchQuery={workerSearchQuery}
            onSearchChange={setWorkerSearchQuery}
            workerOrderRefreshKey={workerOrderRefreshKey}
          />
        </>
      )}

      {/* Bundle Section - Show when any BUNDLE special selection */}
      {specialSelection?.startsWith("BUNDLE_") && (
        <>
          <div className="px-4 py-2 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-700/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <IconPackages size={14} className="text-amber-500" />
                  <button
                    onClick={() => setSpecialSelection("BUNDLE_BP")}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      specialSelection === "BUNDLE_BP"
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500"
                        : "text-default-500 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    Best Partner
                  </button>
                  <button
                    onClick={() => setSpecialSelection("BUNDLE_BH")}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      specialSelection === "BUNDLE_BH"
                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-500"
                        : "text-default-500 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    Bihun
                  </button>
                  <button
                    onClick={() => setSpecialSelection("BUNDLE_MEE")}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      specialSelection === "BUNDLE_MEE"
                        ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-500"
                        : "text-default-500 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    Mee
                  </button>
                </div>

                {/* Starred products mini pills for quick navigation */}
                {favoriteProducts.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-default-300 dark:bg-gray-600 hidden sm:block flex-shrink-0" />
                    <div className="flex flex-wrap items-center gap-1 min-w-0">
                      {favoriteProducts
                        .filter((p) => !p.id.startsWith("BUNDLE_"))
                        .slice(0, 7)
                        .map((product) => (
                          <button
                            key={product.id}
                            onClick={() => handleProductSelect(product.id)}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                            title={product.description || product.id}
                          >
                            <IconStarFilled size={10} className="flex-shrink-0" />
                            <span className="truncate max-w-[60px] sm:max-w-[80px]">
                              {product.id}
                            </span>
                          </button>
                        ))}
                      {favoriteProducts.filter((p) => !p.id.startsWith("BUNDLE_"))
                        .length > 7 && (
                        <span className="text-xs text-default-400 dark:text-gray-500">
                          +
                          {favoriteProducts.filter(
                            (p) => !p.id.startsWith("BUNDLE_")
                          ).length - 7}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              {/* Right side: Search + Change product */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Mini Worker Search Input */}
                <div className="relative">
                  <IconSearch
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
                  />
                  <input
                    type="text"
                    placeholder="Search worker..."
                    value={workerSearchQuery}
                    onChange={(e) => setWorkerSearchQuery(e.target.value)}
                    className="w-32 sm:w-40 rounded-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 py-1 pl-7 pr-7 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {workerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setWorkerSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-200"
                    >
                      <IconX size={12} />
                    </button>
                  )}
                </div>
                <div className="h-4 w-px bg-default-300 dark:bg-gray-600" />
                <button
                  onClick={() => handleSpecialSelect(null)}
                  className="text-sm text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 flex-shrink-0"
                >
                  Back to selection
                </button>
              </div>
            </div>
          </div>
          <BundleEntrySection
            ref={bundleSectionRef}
            selectedDate={selectedDate}
            initialTab={
              specialSelection as "BUNDLE_BP" | "BUNDLE_BH" | "BUNDLE_MEE"
            }
            workerOrderRefreshKey={workerOrderRefreshKey}
          />
        </>
      )}

      {/* Product Pay Code Mapping Modal */}
      <ProductPayCodeMappingModal
        isOpen={showMappingModal}
        onClose={() => setShowMappingModal(false)}
      />

      {/* Help Dialog */}
      <ProductionHelpDialog
        isOpen={showHelpDialog}
        onClose={() => setShowHelpDialog(false)}
      />
    </div>
  );
};

export default ProductionEntryPage;

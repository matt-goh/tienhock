import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconAlertTriangle,
  IconArrowsSort,
  IconChevronDown,
  IconChevronRight,
  IconChevronsDown,
  IconChevronsUp,
  IconEdit,
  IconPackage,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import clsx from "clsx";
import TimeNavigator from "../../components/TimeNavigator";
import ProductSelector from "../../components/Stock/ProductSelector";
import ProductOrderModal from "../../components/Catalogue/ProductOrderModal";
import { api } from "../../routes/utils/api";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import {
  ProductionEntry,
  ProductionWorkerOrderResponse,
  ProductionWorkerOrderScope,
  StockProduct,
} from "../../types/types";
import { getSpecialItemConfig } from "../../config/specialItems";
import { OTH_PRODUCTION_IDS } from "../../config/othProductionProducts";
import toast from "react-hot-toast";

type ViewMode = "day" | "month" | "year";
type CategoryKey = "MEE" | "BH" | "HANCUR" | "BUNDLE" | "JP" | "OTH";
type ProductSelectorProductType = Exclude<StockProduct["type"], "TAX">;

const PRODUCT_SELECTOR_TYPES = new Set<ProductSelectorProductType>([
  "BH",
  "MEE",
  "JP",
  "OTH",
  "BUNDLE",
]);
const DEFAULT_PRODUCTION_PRODUCT_TYPES: ProductSelectorProductType[] = [
  "MEE",
  "BH",
  "BUNDLE",
  "OTH",
];

const isProductSelectorProductType = (
  value: string | undefined
): value is ProductSelectorProductType =>
  value !== undefined &&
  PRODUCT_SELECTOR_TYPES.has(value as ProductSelectorProductType);

interface DateRange {
  start: Date;
  end: Date;
}

interface ProductGroup {
  key: string;
  date: string;
  productId: string;
  productDescription: string;
  category: CategoryKey;
  unitLabel: string;
  rows: ProductionEntry[];
  totalQuantity: number;
  workerCount: number;
  machineBroken: boolean;
}

interface UnitTotal {
  unitLabel: string;
  total: number;
}

interface DateGroup {
  date: string;
  categories: Record<CategoryKey, ProductGroup[]>;
  productCount: number;
  rowCount: number;
  totalsByUnit: UnitTotal[];
}

const CATEGORY_ORDER: CategoryKey[] = ["MEE", "BH", "HANCUR", "BUNDLE", "JP", "OTH"];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  MEE: "Mee",
  BH: "Bihun",
  HANCUR: "Hancur",
  BUNDLE: "Bundle",
  JP: "Jelly Polly",
  OTH: "Other Stock",
};

const CATEGORY_CLASSES: Record<CategoryKey, string> = {
  MEE: "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300",
  BH: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
  HANCUR: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300",
  BUNDLE: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  JP: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300",
  OTH: "border-slate-200 bg-slate-50 text-slate-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300",
};

const HANCUR_PRODUCT_IDS = new Set<string>(["HANCUR_BH", "KARUNG_HANCUR"]);

const formatDateLocal = (date: Date): string => {
  const year: number = date.getFullYear();
  const month: string = String(date.getMonth() + 1).padStart(2, "0");
  const day: string = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateString: string): Date => {
  const normalizedDate: string = dateString.slice(0, 10);
  const [year, month, day]: number[] = normalizedDate.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const startOfDay = (date: Date): Date => {
  const nextDate: Date = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

const endOfDay = (date: Date): Date => {
  const nextDate: Date = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
};

const getMonthRange = (date: Date): DateRange => {
  const start: Date = new Date(date.getFullYear(), date.getMonth(), 1);
  const end: Date = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: startOfDay(start), end: endOfDay(end) };
};

const getYearRange = (year: number): DateRange => {
  return {
    start: startOfDay(new Date(year, 0, 1)),
    end: endOfDay(new Date(year, 11, 31)),
  };
};

const normalizeEntryDate = (entry: ProductionEntry): string => {
  if (!entry.entry_date.includes("T")) return entry.entry_date.slice(0, 10);

  const parsedDate: Date = new Date(entry.entry_date);
  if (Number.isNaN(parsedDate.getTime())) return entry.entry_date.slice(0, 10);
  return formatDateLocal(parsedDate);
};

const getCategory = (entry: ProductionEntry): CategoryKey => {
  if (HANCUR_PRODUCT_IDS.has(entry.product_id)) return "HANCUR";
  if (entry.product_type === "BUNDLE" || entry.product_id.startsWith("BUNDLE_")) {
    return "BUNDLE";
  }
  if (entry.product_type === "JP") return "JP";
  if (entry.product_type === "MEE") return "MEE";
  if (entry.product_type === "BH") return "BH";
  return "OTH";
};

// Map a product group to the shared worker-order scope used by the Production
// Entry page so worker rows display in the same drag-and-drop order. OTH is
// stock-only (no workers), so it has no scope.
const getWorkerOrderScope = (
  group: ProductGroup
): ProductionWorkerOrderScope | null => {
  switch (group.category) {
    case "MEE":
      return "MEE_PACKING";
    case "BH":
    case "HANCUR":
      return "BH_PACKING";
    case "BUNDLE":
      return group.productId === "BUNDLE_MEE" ? "MEE_PACKING" : "BH_PACKING";
    case "JP":
      return "JP_PRODUCTION";
    default:
      return null;
  }
};

const getUnitLabel = (entry: ProductionEntry): string => {
  const specialConfig = getSpecialItemConfig(entry.product_id);
  if (specialConfig) return specialConfig.unit;
  if (entry.product_type === "OTH") return "pcs";
  return "bags";
};

const formatQuantity = (value: number): string =>
  Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

const formatDisplayDate = (dateString: string): string =>
  parseLocalDate(dateString).toLocaleDateString("en-MY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const getRangeLabel = (dateRange: DateRange): string => {
  const start: string = formatDateLocal(dateRange.start);
  const end: string = formatDateLocal(dateRange.end);
  if (start === end) return formatDisplayDate(start);
  return `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
};

interface ProductionListPageProps {
  // Restrict the page to specific product types (e.g. ["JP"] for the Jelly
  // Polly production records page). Default: TH behaviour (all types).
  productTypes?: ProductSelectorProductType[];
  // Further restrict the page to specific product ids (needed when several
  // record pages share one product type, e.g. OTH: SBH/SMEE vs EMPTY_BAG).
  productIds?: string[];
  // Page heading. Default: "Production Records".
  title?: string;
  // API base for entries/worker-order (JP passes /jellypolly/api/production-entries)
  apiBasePath?: string;
}

const ProductionListPage: React.FC<ProductionListPageProps> = ({
  productTypes,
  productIds,
  title = "Production Records",
  apiBasePath = "/api/production-entries",
}) => {
  const navigate = useNavigate();
  const today: Date = useMemo(() => new Date(), []);
  const { products: orderedProducts } = useProductsCache("all");

  // Shared product display order (products.sort_order via /api/products),
  // used to order each day's product groups within a category.
  const productOrderIndex = useMemo(() => {
    const index: Map<string, number> = new Map();
    orderedProducts.forEach((product, position: number) => {
      if (!index.has(product.id)) index.set(product.id, position);
    });
    return index;
  }, [orderedProducts]);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [showProductOrderModal, setShowProductOrderModal] = useState(false);
  const [workerOrderByScope, setWorkerOrderByScope] = useState<
    Record<ProductionWorkerOrderScope, string[]>
  >({ BH_PACKING: [], MEE_PACKING: [], JP_PRODUCTION: [] });

  const dateRange: DateRange = useMemo(() => {
    if (viewMode === "day") {
      return { start: startOfDay(selectedDate), end: endOfDay(selectedDate) };
    }
    if (viewMode === "year") return getYearRange(selectedYear);
    return getMonthRange(selectedMonth);
  }, [selectedDate, selectedMonth, selectedYear, viewMode]);

  const fetchEntries = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const params: URLSearchParams = new URLSearchParams({
        start_date: formatDateLocal(dateRange.start),
        end_date: formatDateLocal(dateRange.end),
        include_machine_status: "true",
      });

      const response: ProductionEntry[] = await api.get(
        `${apiBasePath}?${params.toString()}`
      );
      const allEntries: ProductionEntry[] = response || [];
      setEntries(
        allEntries.filter((entry: ProductionEntry): boolean => {
          if (productIds && !productIds.includes(entry.product_id)) {
            return false;
          }
          if (!productTypes) return true;
          const productType: string | undefined = entry.product_type;
          return (
            isProductSelectorProductType(productType) &&
            productTypes.includes(productType)
          );
        })
      );
    } catch (error) {
      console.error("Error fetching production records:", error);
      toast.error("Failed to load production records");
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange.end, dateRange.start, productTypes, productIds, apiBasePath]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Load the shared worker order for both packing scopes so worker rows can be
  // displayed in the same order as the Production Entry page.
  useEffect(() => {
    let isCurrent: boolean = true;
    const scopes: ProductionWorkerOrderScope[] = productTypes?.includes("JP")
      ? ["JP_PRODUCTION"]
      : ["BH_PACKING", "MEE_PACKING"];

    Promise.all(
      scopes.map((scope: ProductionWorkerOrderScope) =>
        api
          .get(
            `${apiBasePath}/worker-order?scope=${encodeURIComponent(
              scope
            )}`
          )
          .then((response: ProductionWorkerOrderResponse): string[] =>
            response.worker_ids || []
          )
          .catch((): string[] => [])
      )
    ).then((results: string[][]) => {
      if (!isCurrent) return;
      const nextWorkerOrderByScope: Record<
        ProductionWorkerOrderScope,
        string[]
      > = {
        BH_PACKING: [],
        MEE_PACKING: [],
        JP_PRODUCTION: [],
      };
      scopes.forEach((scope: ProductionWorkerOrderScope, index: number): void => {
        nextWorkerOrderByScope[scope] = results[index] || [];
      });
      setWorkerOrderByScope(nextWorkerOrderByScope);
    });

    return (): void => {
      isCurrent = false;
    };
  }, [apiBasePath, productTypes]);

  const productionProductFilter = useCallback(
    (product: StockProduct): boolean =>
      product.type !== "OTH" || OTH_PRODUCTION_IDS.includes(product.id),
    []
  );

  const productMatchesFilter = useCallback(
    (entry: ProductionEntry): boolean => {
      if (!selectedProductId) return true;
      if (selectedProductId === "HANCUR_BH") {
        return HANCUR_PRODUCT_IDS.has(entry.product_id);
      }
      return entry.product_id === selectedProductId;
    },
    [selectedProductId]
  );

  const searchMatchesEntry = useCallback(
    (entry: ProductionEntry): boolean => {
      const normalizedSearchTerm: string = searchTerm.trim().toLowerCase();
      if (!normalizedSearchTerm) return true;

      const searchableValues: string[] = [
        entry.product_id,
        entry.product_description || "",
        entry.worker_id || "",
        entry.worker_name || "",
      ];

      return searchableValues.some((value: string) =>
        value.toLowerCase().includes(normalizedSearchTerm)
      );
    },
    [searchTerm]
  );

  const dateGroups: DateGroup[] = useMemo(() => {
    const groupedByDate: Map<string, Map<string, ProductGroup>> = new Map();

    const orderIndexByScope: Record<
      ProductionWorkerOrderScope,
      Map<string, number>
    > = {
      BH_PACKING: new Map(
        workerOrderByScope.BH_PACKING.map(
          (workerId: string, index: number): [string, number] => [
            workerId,
            index,
          ]
        )
      ),
      MEE_PACKING: new Map(
        workerOrderByScope.MEE_PACKING.map(
          (workerId: string, index: number): [string, number] => [
            workerId,
            index,
          ]
        )
      ),
      JP_PRODUCTION: new Map(
        workerOrderByScope.JP_PRODUCTION.map(
          (workerId: string, index: number): [string, number] => [
            workerId,
            index,
          ]
        )
      ),
    };

    // Sort by the saved worker order; workers without a saved position (and
    // stock-only rows) fall back to alphabetical and land after ordered ones.
    const compareRows = (
      orderIndex: Map<string, number>,
      first: ProductionEntry,
      second: ProductionEntry
    ): number => {
      const firstOrder: number | undefined = first.worker_id
        ? orderIndex.get(first.worker_id)
        : undefined;
      const secondOrder: number | undefined = second.worker_id
        ? orderIndex.get(second.worker_id)
        : undefined;

      if (firstOrder !== undefined && secondOrder !== undefined) {
        return firstOrder - secondOrder;
      }
      if (firstOrder !== undefined) return -1;
      if (secondOrder !== undefined) return 1;

      return (first.worker_name || first.worker_id || "Stock Only").localeCompare(
        second.worker_name || second.worker_id || "Stock Only"
      );
    };

    entries
      .filter(productMatchesFilter)
      .filter(searchMatchesEntry)
      .forEach((entry: ProductionEntry) => {
        const date: string = normalizeEntryDate(entry);
        const productGroupKey: string = `${date}::${entry.product_id}`;
        const dateMap: Map<string, ProductGroup> =
          groupedByDate.get(date) || new Map<string, ProductGroup>();

        if (!dateMap.has(productGroupKey)) {
          dateMap.set(productGroupKey, {
            key: productGroupKey,
            date,
            productId: entry.product_id,
            productDescription: entry.product_description || entry.product_id,
            category: getCategory(entry),
            unitLabel: getUnitLabel(entry),
            rows: [],
            totalQuantity: 0,
            workerCount: 0,
            machineBroken: Boolean(entry.machine_broken),
          });
        }

        const group: ProductGroup | undefined = dateMap.get(productGroupKey);
        if (!group) return;

        group.rows.push(entry);
        group.totalQuantity += Number(entry.bags_packed) || 0;
        group.workerCount += entry.worker_id ? 1 : 0;
        group.machineBroken = group.machineBroken || Boolean(entry.machine_broken);

        groupedByDate.set(date, dateMap);
      });

    return Array.from(groupedByDate.entries())
      .sort(([firstDate], [secondDate]) => secondDate.localeCompare(firstDate))
      .map(([date, productMap]: [string, Map<string, ProductGroup>]) => {
        const categories: Record<CategoryKey, ProductGroup[]> = {
          MEE: [],
          BH: [],
          HANCUR: [],
          BUNDLE: [],
          JP: [],
          OTH: [],
        };

        const totalsByUnitMap: Map<string, number> = new Map();
        Array.from(productMap.values())
          .sort((first: ProductGroup, second: ProductGroup) => {
            const categoryDiff: number =
              CATEGORY_ORDER.indexOf(first.category) -
              CATEGORY_ORDER.indexOf(second.category);
            if (categoryDiff !== 0) return categoryDiff;
            const firstOrder: number | undefined = productOrderIndex.get(
              first.productId
            );
            const secondOrder: number | undefined = productOrderIndex.get(
              second.productId
            );
            if (firstOrder !== undefined && secondOrder !== undefined) {
              return firstOrder - secondOrder;
            }
            if (firstOrder !== undefined) return -1;
            if (secondOrder !== undefined) return 1;
            return first.productId.localeCompare(second.productId);
          })
          .forEach((group: ProductGroup) => {
            const scope: ProductionWorkerOrderScope | null =
              getWorkerOrderScope(group);
            const orderIndex: Map<string, number> = scope
              ? orderIndexByScope[scope]
              : new Map<string, number>();
            group.rows.sort((first: ProductionEntry, second: ProductionEntry) =>
              compareRows(orderIndex, first, second)
            );
            categories[group.category].push(group);
            totalsByUnitMap.set(
              group.unitLabel,
              (totalsByUnitMap.get(group.unitLabel) || 0) + group.totalQuantity
            );
          });

        return {
          date,
          categories,
          productCount: productMap.size,
          rowCount: Array.from(productMap.values()).reduce(
            (sum: number, group: ProductGroup) => sum + group.rows.length,
            0
          ),
          totalsByUnit: Array.from(totalsByUnitMap.entries()).map(
            ([unitLabel, total]: [string, number]): UnitTotal => ({
              unitLabel,
              total,
            })
          ),
        };
      });
  }, [entries, productMatchesFilter, searchMatchesEntry, workerOrderByScope, productOrderIndex]);

  const summaryStats = useMemo(() => {
    const productCount: number = dateGroups.reduce(
      (sum: number, group: DateGroup) => sum + group.productCount,
      0
    );
    const rowCount: number = dateGroups.reduce(
      (sum: number, group: DateGroup) => sum + group.rowCount,
      0
    );
    return {
      dayCount: dateGroups.length,
      productCount,
      rowCount,
    };
  }, [dateGroups]);

  const visibleProductKeys = useMemo(() => {
    const keys: string[] = [];
    dateGroups.forEach((dateGroup: DateGroup) => {
      CATEGORY_ORDER.forEach((category: CategoryKey) => {
        dateGroup.categories[category].forEach((group: ProductGroup) => {
          keys.push(group.key);
        });
      });
    });
    return keys;
  }, [dateGroups]);

  const areAllVisibleRowsExpanded = useMemo(() => {
    return (
      visibleProductKeys.length > 0 &&
      visibleProductKeys.every((key: string) => expandedKeys.has(key))
    );
  }, [expandedKeys, visibleProductKeys]);

  // Unified Time Navigator change handler. The chosen granularity (day/month/year)
  // drives both the view mode and the synced selected date/month/year values.
  const handleTimeNavigatorChange = (
    range: { start: Date; end: Date },
    meta: { mode: string }
  ): void => {
    const date = range.start;
    setSelectedDate(date);
    setSelectedMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedYear(date.getFullYear());
    setViewMode(meta.mode as ViewMode);
  };

  const toggleExpanded = (groupKey: string): void => {
    setExpandedKeys((currentKeys: Set<string>) => {
      const nextKeys: Set<string> = new Set(currentKeys);
      if (nextKeys.has(groupKey)) {
        nextKeys.delete(groupKey);
      } else {
        nextKeys.add(groupKey);
      }
      return nextKeys;
    });
  };

  const toggleAllExpanded = (): void => {
    if (areAllVisibleRowsExpanded) {
      setExpandedKeys(new Set());
      return;
    }
    setExpandedKeys(new Set(visibleProductKeys));
  };

  const getDateGroupKeys = (dateGroup: DateGroup): string[] => {
    const keys: string[] = [];
    CATEGORY_ORDER.forEach((category: CategoryKey) => {
      dateGroup.categories[category].forEach((group: ProductGroup) => {
        keys.push(group.key);
      });
    });
    return keys;
  };

  const areDateGroupRowsExpanded = (dateGroup: DateGroup): boolean => {
    const dateGroupKeys: string[] = getDateGroupKeys(dateGroup);
    return (
      dateGroupKeys.length > 0 &&
      dateGroupKeys.every((key: string) => expandedKeys.has(key))
    );
  };

  const toggleDateGroupExpanded = (dateGroup: DateGroup): void => {
    const dateGroupKeys: string[] = getDateGroupKeys(dateGroup);
    const isDateGroupExpanded: boolean = areDateGroupRowsExpanded(dateGroup);

    setExpandedKeys((currentKeys: Set<string>) => {
      const nextKeys: Set<string> = new Set(currentKeys);
      dateGroupKeys.forEach((key: string) => {
        if (isDateGroupExpanded) {
          nextKeys.delete(key);
        } else {
          nextKeys.add(key);
        }
      });
      return nextKeys;
    });
  };

  const openProductionEntry = (date: string, productId: string): void => {
    const targetProductId: string =
      productId === "KARUNG_HANCUR" ? "HANCUR_BH" : productId;
    navigate(
      `/stock/production?date=${encodeURIComponent(date)}&product=${encodeURIComponent(
        targetProductId
      )}`
    );
  };

  const clearSearch = (): void => {
    setSearchTerm("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-default-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                {title}
              </h1>
              <span className="hidden text-default-300 dark:text-gray-600 sm:inline">
                |
              </span>
              <span className="text-sm font-medium text-default-600 dark:text-gray-300">
                {getRangeLabel(dateRange)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-default-500 dark:text-gray-400">
              <span>{summaryStats.dayCount} days</span>
              <span>{summaryStats.productCount} product records</span>
              <span>{summaryStats.rowCount} entry rows</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TimeNavigator
              range={dateRange}
              onChange={handleTimeNavigatorChange}
              modes={["day", "month", "year"]}
              presets={false}
              size="sm"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,420px)_minmax(240px,360px)_auto]">
          <div>
            <ProductSelector
              value={selectedProductId}
              onChange={setSelectedProductId}
              productTypes={productTypes || DEFAULT_PRODUCTION_PRODUCT_TYPES}
              productFilter={
                productTypes
                  ? (product: StockProduct): boolean => {
                      if (productIds && !productIds.includes(product.id)) {
                        return false;
                      }
                      const productType: string | undefined = product.type;
                      return (
                        isProductSelectorProductType(productType) &&
                        productTypes.includes(productType)
                      );
                    }
                  : productIds
                  ? (product: StockProduct): boolean =>
                      productIds.includes(product.id)
                  : productionProductFilter
              }
              placeholder="All production products"
              showCategories
            />
            {/* Quick access to the shared product display order */}
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowProductOrderModal(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
              >
                <IconArrowsSort size={14} />
                Reorder products
              </button>
            </div>
          </div>
          <div className="relative">            <IconSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
              size={16}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Search product or worker"
              className="w-full rounded-lg border border-default-300 bg-white py-2 pl-9 pr-9 text-sm leading-5 text-default-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-default-400 hover:bg-default-100 hover:text-default-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                title="Clear search"
              >
                <IconX size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={toggleAllExpanded}
            disabled={visibleProductKeys.length === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-default-300 px-3 py-2 text-sm font-medium leading-5 text-default-700 transition-colors hover:bg-default-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {areAllVisibleRowsExpanded ? (
              <IconChevronsUp size={15} />
            ) : (
              <IconChevronsDown size={15} />
            )}
            {areAllVisibleRowsExpanded ? "Collapse All" : "Open All"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-default-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        ) : dateGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-default-100 dark:bg-gray-700">
              <IconPackage className="text-default-400 dark:text-gray-400" size={28} />
            </div>
            <p className="mt-4 font-medium text-default-700 dark:text-gray-200">
              No production records found
            </p>
            <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
              Try another date range, product, or search term.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-default-200 dark:divide-gray-700">
            {dateGroups.map((dateGroup: DateGroup) => (
              <section key={dateGroup.date}>
                <div className="flex flex-wrap items-center justify-between gap-3 bg-default-50 px-4 py-3 dark:bg-gray-900/40">
                  <div>
                    <h2 className="font-semibold text-default-900 dark:text-gray-100">
                      {formatDisplayDate(dateGroup.date)}
                    </h2>
                    <p className="text-xs text-default-500 dark:text-gray-400">
                      {dateGroup.productCount} products, {dateGroup.rowCount} rows
                      {dateGroup.totalsByUnit.length > 0 && (
                        <span className="ml-2 font-semibold text-default-700 dark:text-gray-200">
                          Total:{" "}
                          {dateGroup.totalsByUnit
                            .map(
                              (unitTotal: UnitTotal): string =>
                                `${formatQuantity(unitTotal.total)} ${unitTotal.unitLabel}`
                            )
                            .join(" · ")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleDateGroupExpanded(dateGroup)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-default-300 text-default-600 transition-colors hover:bg-white hover:text-default-900 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                      title={
                        areDateGroupRowsExpanded(dateGroup)
                          ? "Collapse this day"
                          : "Open this day"
                      }
                      aria-label={
                        areDateGroupRowsExpanded(dateGroup)
                          ? "Collapse this day"
                          : "Open this day"
                      }
                    >
                      {areDateGroupRowsExpanded(dateGroup) ? (
                        <IconChevronsUp size={16} />
                      ) : (
                        <IconChevronsDown size={16} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/stock/production?date=${dateGroup.date}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-default-300 px-3 py-1.5 text-sm font-medium text-default-700 transition-colors hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <IconEdit size={15} />
                      Open Day
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  {CATEGORY_ORDER.map((category: CategoryKey) => {
                    const productGroups: ProductGroup[] =
                      dateGroup.categories[category];
                    if (productGroups.length === 0) return null;

                    return (
                      <div key={`${dateGroup.date}-${category}`}>
                        <div
                          className={clsx(
                            "mb-2 inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                            CATEGORY_CLASSES[category]
                          )}
                        >
                          {CATEGORY_LABELS[category]} ({productGroups.length})
                        </div>

                        <div className="overflow-hidden rounded-lg border border-default-200 dark:border-gray-700">
                          <table className="min-w-full table-fixed">
                            <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                              {productGroups.map((group: ProductGroup) => {
                                const isExpanded: boolean = expandedKeys.has(group.key);
                                return (
                                  <React.Fragment key={group.key}>
                                    <tr
                                      onClick={() => toggleExpanded(group.key)}
                                      className="cursor-pointer bg-white transition-colors hover:bg-default-50 dark:bg-gray-800 dark:hover:bg-gray-700/70"
                                      title={isExpanded ? "Hide details" : "Show details"}
                                    >
                                      <td className="w-10 px-3 py-2">
                                        <div
                                          className="rounded p-1 text-default-500 dark:text-gray-400"
                                          aria-hidden="true"
                                        >
                                          {isExpanded ? (
                                            <IconChevronDown size={16} />
                                          ) : (
                                            <IconChevronRight size={16} />
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-semibold text-default-900 dark:text-gray-100">
                                            {group.productId}
                                          </span>
                                          {group.machineBroken && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                              <IconAlertTriangle size={12} />
                                              Mesin Rosak
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-0.5 truncate text-sm text-default-500 dark:text-gray-400">
                                          {group.productDescription}
                                        </p>
                                      </td>
                                      <td className="w-36 px-3 py-2 text-right">
                                        <div className="font-semibold tabular-nums text-default-900 dark:text-gray-100">
                                          {formatQuantity(group.totalQuantity)}
                                        </div>
                                        <div className="text-xs text-default-500 dark:text-gray-400">
                                          {group.unitLabel}
                                        </div>
                                      </td>
                                      <td className="w-32 px-3 py-2 text-center text-sm text-default-600 dark:text-gray-300">
                                        {group.workerCount > 0
                                          ? `${group.workerCount} workers`
                                          : "Stock-only"}
                                      </td>
                                      <td className="w-24 px-3 py-2 text-right">
                                        <button
                                          type="button"
                                          onClick={(
                                            event: React.MouseEvent<HTMLButtonElement>
                                          ) => {
                                            event.stopPropagation();
                                            openProductionEntry(group.date, group.productId);
                                          }}
                                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-sky-600 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-900/30 dark:hover:text-sky-300"
                                        >
                                          <IconEdit size={15} />
                                          Edit
                                        </button>
                                      </td>
                                    </tr>

                                    {isExpanded && (
                                      <tr className="bg-default-50/70 dark:bg-gray-900/30">
                                        <td colSpan={5} className="px-3 py-2">
                                          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                            {group.rows.map((entry: ProductionEntry) => (
                                              <div
                                                key={entry.id || `${entry.product_id}-${entry.worker_id || "stock"}`}
                                                className="flex items-center justify-between rounded border border-default-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                                              >
                                                <div className="min-w-0">
                                                  <div
                                                    className="truncate font-medium text-default-800 dark:text-gray-100"
                                                    title={
                                                      entry.worker_name ||
                                                      entry.worker_id ||
                                                      "Stock-only quantity"
                                                    }
                                                  >
                                                    {entry.worker_name ||
                                                      entry.worker_id ||
                                                      "Stock-only quantity"}
                                                  </div>
                                                  {entry.worker_id && (
                                                    <div className="text-xs text-default-400 dark:text-gray-500">
                                                      {entry.worker_id}
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="ml-3 text-right font-semibold tabular-nums text-default-900 dark:text-gray-100">
                                                  {formatQuantity(Number(entry.bags_packed) || 0)}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Shared product display order modal */}
      <ProductOrderModal
        isOpen={showProductOrderModal}
        onClose={() => setShowProductOrderModal(false)}
        products={orderedProducts}
      />
    </div>
  );
};

export default ProductionListPage;

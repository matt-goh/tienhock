// src/pages/Stock/Materials/StockAdjustmentEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import {
  MaterialWithStock,
  MaterialCategory,
  ProductLine,
  MaterialStockEntryInput,
  StockEntryRow,
  GeneralStockCategory,
  GeneralStockRow,
  GeneralStockAdjustment,
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
  IconSearch,
  IconCategory2,
  IconSettings,
  IconTrash,
  IconGripVertical,
} from "@tabler/icons-react";
import clsx from "clsx";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import MonthNavigator from "../../../components/MonthNavigator";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import GeneralStockCategoryModal from "../../../components/Stock/GeneralStockCategoryModal";
import MaterialAccountMappingModal from "../../../components/Stock/MaterialAccountMappingModal";
import { useProductsCache } from "../../../utils/invoice/useProductsCache";

interface StockKilangItem {
  product_id: string;
  name: string;
  unit_cost: number;
  quantity: number;
  value: number;
}

interface StockKilangEntryRow {
  product_id: string;
  quantity: number;
  unit_cost: number;
  stock_value: number;
}

interface StockKilangResponse {
  entries?: StockKilangEntryRow[];
}

interface StockKilangSaveEntry {
  product_id: string;
  quantity: number;
  unit_cost: number;
}

interface StockResponse {
  year: number;
  month: number;
  product_line: ProductLine;
  materials: MaterialWithStock[];
}

interface MaterialStockBatchResponse {
  registered_variants?: Array<{
    id: number;
    variant_name: string;
    sort_order?: number | null;
  }>;
}

type EditableStockField = "adjustment_quantity" | "unit_cost";
type NewVariantField = "variant_name" | EditableStockField;
type StockEntryTab = ProductLine | "general";
type StockEntryMode = "general" | "material";
type RowSaveKey = string;

type DragState =
  | {
      type: "material";
      materialId: number;
      category: MaterialCategory;
      pointerId: number;
      previousOrderIds: number[];
      currentOrderIds: number[];
      lastTargetId: number | null;
      offsetX: number;
      offsetY: number;
      initialLeft: number;
      initialTop: number;
    }
  | {
      type: "variant";
      materialId: number;
      variantId: number;
      pointerId: number;
      previousOrderIds: number[];
      currentOrderIds: number[];
      lastTargetId: number | null;
      offsetX: number;
      offsetY: number;
      initialLeft: number;
      initialTop: number;
    };

interface DragOverlayState {
  label: string;
  sublabel: string;
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface StockAdjustmentEntryPageProps {
  mode: StockEntryMode;
  generalHeaderActions?: React.ReactNode;
}

type DeleteTarget =
  | { type: "material"; material: MaterialWithStock }
  | { type: "variant"; material: MaterialWithStock; variant: StockEntryRow };

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

const stockTabs: { id: StockEntryTab; label: string; activeClass: string }[] = [
  { id: "general", label: "GENERAL", activeClass: "bg-indigo-500 text-white shadow-sm" },
  { id: "mee", label: "MEE", activeClass: "bg-sky-500 text-white shadow-sm" },
  { id: "bihun", label: "BIHUN", activeClass: "bg-amber-500 text-white shadow-sm" },
  { id: "shared", label: "SHARED", activeClass: "bg-teal-500 text-white shadow-sm" },
];

const MATERIAL_STOCK_TAB_STORAGE_KEY = "materialStock.activeTab";
const LEGACY_STOCK_TAB_STORAGE_KEY = "materialAndGeneralStock.activeTab";

const selectedMonthStorageKey = (mode: StockEntryMode): string =>
  mode === "general" ? "generalStock.selectedMonth" : "materialStock.selectedMonth";

const scrollPositionStorageKey = (mode: StockEntryMode): string =>
  mode === "general" ? "generalStock.scrollTop" : "materialStock.scrollTop";

const readStoredSelectedMonth = (mode: StockEntryMode): Date | null => {
  if (typeof window === "undefined") return null;

  try {
    const stored: string | null = window.localStorage.getItem(selectedMonthStorageKey(mode));
    const match: RegExpExecArray | null = stored ? /^(\d{4})-(\d{2})$/.exec(stored) : null;
    if (!match) return null;

    const yearValue: number = Number.parseInt(match[1], 10);
    const monthIndex: number = Number.parseInt(match[2], 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) return null;

    return new Date(yearValue, monthIndex, 1);
  } catch (_error: unknown) {
    return null;
  }
};

const storeSelectedMonth = (mode: StockEntryMode, date: Date): void => {
  if (typeof window === "undefined") return;

  try {
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    window.localStorage.setItem(selectedMonthStorageKey(mode), value);
  } catch (_error: unknown) {
    // Month preservation is best-effort when browser storage is unavailable.
  }
};

const getScrollContainer = (): HTMLElement | null => {
  if (typeof document === "undefined") return null;
  return document.querySelector("main");
};

const isStockEntryTab = (value: string | null): value is StockEntryTab => {
  return value === "general" || value === "mee" || value === "bihun" || value === "shared";
};

const getAvailableStockTabs = (mode: StockEntryMode): StockEntryTab[] => {
  if (mode === "general") return ["general"];
  return ["mee", "bihun", "shared"];
};

const getDefaultStockEntryTab = (mode: StockEntryMode): StockEntryTab => {
  return mode === "general" ? "general" : "bihun";
};

const isAllowedStockEntryTab = (
  value: string | null,
  availableTabs: StockEntryTab[]
): value is StockEntryTab => {
  return isStockEntryTab(value) && availableTabs.includes(value);
};

const readStoredStockEntryTab = (availableTabs: StockEntryTab[]): StockEntryTab | null => {
  if (typeof window === "undefined") return null;

  try {
    const storageKeys: string[] = [
      MATERIAL_STOCK_TAB_STORAGE_KEY,
      LEGACY_STOCK_TAB_STORAGE_KEY,
    ];

    for (const storageKey of storageKeys) {
      const storedTab: string | null = window.localStorage.getItem(storageKey);
      if (isAllowedStockEntryTab(storedTab, availableTabs)) return storedTab;
    }

    return null;
  } catch (_error: unknown) {
    return null;
  }
};

const storeStockEntryTab = (tab: StockEntryTab): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MATERIAL_STOCK_TAB_STORAGE_KEY, tab);
  } catch (_error: unknown) {
    // URL tab preservation still works when browser storage is unavailable.
  }
};

const getStockEntryTab = (
  searchParams: URLSearchParams,
  availableTabs: StockEntryTab[],
  defaultTab: StockEntryTab
): StockEntryTab => {
  const tabParam: string | null = searchParams.get("tab");
  if (isAllowedStockEntryTab(tabParam, availableTabs)) return tabParam;

  return readStoredStockEntryTab(availableTabs) || defaultTab;
};

const makeNumber = (value: number | string | null | undefined): number => {
  return parseFloat(String(value ?? "")) || 0;
};

const getMaterialDisplayName = (material: MaterialWithStock): string => {
  return material.custom_name || material.name;
};

const getVariantDisplayName = (variant: StockEntryRow): string => {
  return variant.variant_name || variant.custom_description || "Unnamed variant";
};

const generalStockRowMatchesSearch = (row: GeneralStockRow, query: string): boolean => {
  if (!query) return true;

  const haystack = [
    row.category_name,
    row.description,
    row.supplier_name,
    row.purchase_no,
    row.purchase_date,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
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

const materialRowSaveKey = (materialId: number): RowSaveKey => `material:${materialId}`;

const variantRowSaveKey = (
  materialId: number,
  variant: StockEntryRow
): RowSaveKey =>
  `variant:${materialId}:${
    variant.variant_id ?? variant.custom_description ?? variant.variant_name ?? "default"
  }`;

const newVariantRowSaveKey = (materialId: number): RowSaveKey =>
  `new-variant:${materialId}`;

const stockKilangRowSaveKey = (productId: string): RowSaveKey =>
  `stock-kilang:${productId}`;

const moveId = (ids: number[], activeId: number, targetId: number): number[] => {
  const fromIndex: number = ids.indexOf(activeId);
  const toIndex: number = ids.indexOf(targetId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return ids;
  }

  const nextIds: number[] = [...ids];
  const [movedId] = nextIds.splice(fromIndex, 1);
  nextIds.splice(toIndex, 0, movedId);
  return nextIds;
};

const areIdsEqual = (firstIds: number[], secondIds: number[]): boolean =>
  firstIds.length === secondIds.length &&
  firstIds.every((id: number, index: number): boolean => id === secondIds[index]);

const recalculateMaterialTotalsFromVariants = (
  material: MaterialWithStock,
  variants: StockEntryRow[]
): MaterialWithStock => ({
  ...material,
  has_variants: variants.length > 0,
  variants,
  opening_quantity: variants.reduce((sum, variant) => sum + variant.opening_quantity, 0),
  opening_value: variants.reduce((sum, variant) => sum + variant.opening_value, 0),
  purchase_quantity: variants.reduce((sum, variant) => sum + variant.purchase_quantity, 0),
  purchase_value: variants.reduce((sum, variant) => sum + variant.purchase_value, 0),
  adjustment_quantity: variants.reduce((sum, variant) => sum + variant.adjustment_quantity, 0),
  adjustment_value: variants.reduce((sum, variant) => sum + variant.adjustment_value, 0),
  closing_quantity: variants.reduce((sum, variant) => sum + variant.closing_quantity, 0),
  closing_value: variants.reduce((sum, variant) => sum + variant.closing_value, 0),
  quantity: variants.reduce((sum, variant) => sum + variant.adjustment_quantity, 0),
  value: variants.reduce((sum, variant) => sum + variant.closing_value, 0),
  unit_cost: variants.length > 0 ? 0 : material.unit_cost,
  entry_id: variants.length > 0 ? null : material.entry_id,
  notes: variants.length > 0 ? null : material.notes,
});

const makeDefaultVariantFromMaterial = (material: MaterialWithStock): StockEntryRow => ({
  entry_id: material.entry_id,
  variant_id: null,
  variant_name: "Default",
  custom_description: null,
  sort_order: null,
  is_new_variant: false,
  opening_quantity: material.opening_quantity,
  opening_value: material.opening_value,
  purchase_quantity: material.purchase_quantity,
  purchase_value: material.purchase_value,
  adjustment_quantity: material.adjustment_quantity,
  adjustment_value: material.adjustment_value,
  closing_quantity: material.closing_quantity,
  closing_value: material.closing_value,
  quantity: material.adjustment_quantity,
  value: material.closing_value,
  unit_cost: material.unit_cost,
  notes: material.notes || null,
});

const hasMaterialStockActivity = (material: MaterialWithStock): boolean =>
  material.opening_quantity !== 0 ||
  material.purchase_quantity !== 0 ||
  material.adjustment_quantity !== 0 ||
  material.closing_quantity !== 0;

const getVariantCustomDescription = (variant: StockEntryRow): string | null => {
  if (variant.variant_id) return null;
  const variantName: string = variant.variant_name?.trim() || "";
  if (!variantName || variantName === "Default") return null;
  return variantName;
};

const makeMaterialStockEntry = (
  material: MaterialWithStock
): MaterialStockEntryInput => ({
  material_id: material.id,
  variant_id: null,
  adjustment_quantity: material.adjustment_quantity,
  unit_cost: material.unit_cost,
  custom_name: material.custom_name || null,
  custom_description: null,
  notes: material.notes || null,
});

const makeVariantStockEntries = (
  materialId: number,
  variant: StockEntryRow,
  originalVariant?: StockEntryRow | null
): MaterialStockEntryInput[] => {
  const customDescription: string | null = getVariantCustomDescription(variant);
  const entries: MaterialStockEntryInput[] = [
    {
      material_id: materialId,
      variant_id: variant.variant_id,
      adjustment_quantity: variant.adjustment_quantity,
      unit_cost: variant.unit_cost,
      custom_name: null,
      custom_description: customDescription,
      notes: variant.notes || null,
    },
  ];

  if (
    !variant.variant_id &&
    originalVariant?.custom_description &&
    originalVariant.custom_description !== customDescription
  ) {
    entries.push({
      material_id: materialId,
      variant_id: null,
      adjustment_quantity: 0,
      unit_cost: 0,
      custom_name: null,
      custom_description: originalVariant.custom_description,
      notes: null,
    });
  }

  return entries;
};

const makeNewVariantStockEntry = (
  materialId: number,
  variant: StockEntryRow
): MaterialStockEntryInput => ({
  material_id: materialId,
  variant_id: null,
  adjustment_quantity: variant.adjustment_quantity,
  unit_cost: variant.unit_cost,
  custom_name: null,
  custom_description: variant.variant_name?.trim() || null,
  notes: null,
  register_variant: true,
});

const getVariantIdentity = (variant: StockEntryRow): string =>
  variant.variant_id
    ? `id:${variant.variant_id}`
    : `custom:${variant.custom_description ?? variant.variant_name ?? "default"}`;

const replaceVariantInMaterial = (
  material: MaterialWithStock,
  targetVariant: StockEntryRow,
  nextVariant: StockEntryRow
): MaterialWithStock => {
  const targetIdentity: string = getVariantIdentity(targetVariant);
  const variants: StockEntryRow[] = (material.variants || []).map(
    (variant: StockEntryRow): StockEntryRow =>
      getVariantIdentity(variant) === targetIdentity ? nextVariant : variant
  );

  return recalculateMaterialTotalsFromVariants(material, variants);
};

const addVariantToMaterial = (
  material: MaterialWithStock,
  savedVariant: StockEntryRow
): MaterialWithStock => {
  const variants: StockEntryRow[] = material.has_variants
    ? [...(material.variants || []), savedVariant]
    : [
        ...(hasMaterialStockActivity(material)
          ? [makeDefaultVariantFromMaterial(material)]
          : []),
        savedVariant,
      ];

  return recalculateMaterialTotalsFromVariants(material, variants);
};

const orderMaterialsWithinCategory = (
  materials: MaterialWithStock[],
  category: MaterialCategory,
  materialIds: number[]
): MaterialWithStock[] => {
  const orderedIdSet = new Set(materialIds);
  const materialsById = new Map<number, MaterialWithStock>(
    materials
      .filter((material: MaterialWithStock): boolean => material.category === category)
      .map(
        (material: MaterialWithStock): [number, MaterialWithStock] => [
          material.id,
          material,
        ]
      )
  );
  const orderedCategoryMaterials: MaterialWithStock[] = materialIds
    .map((materialId: number): MaterialWithStock | undefined =>
      materialsById.get(materialId)
    )
    .filter((material): material is MaterialWithStock => Boolean(material))
    .map((material: MaterialWithStock, index: number): MaterialWithStock => ({
      ...material,
      sort_order: index + 1,
    }));
  const unorderedCategoryMaterials: MaterialWithStock[] = materials
    .filter(
      (material: MaterialWithStock): boolean =>
        material.category === category && !orderedIdSet.has(material.id)
    )
    .map((material: MaterialWithStock, index: number): MaterialWithStock => ({
      ...material,
      sort_order: orderedCategoryMaterials.length + index + 1,
    }));

  return categoryOrder.flatMap((currentCategory: MaterialCategory) =>
    currentCategory === category
      ? [...orderedCategoryMaterials, ...unorderedCategoryMaterials]
      : materials.filter(
          (material: MaterialWithStock): boolean =>
            material.category === currentCategory
        )
  );
};

const orderVariantsWithinMaterial = (
  materials: MaterialWithStock[],
  materialId: number,
  variantIds: number[]
): MaterialWithStock[] => {
  const orderedIdSet = new Set(variantIds);

  return materials.map((material: MaterialWithStock): MaterialWithStock => {
    if (material.id !== materialId || !material.variants) return material;

    const variantsById = new Map<number, StockEntryRow>(
      material.variants
        .filter((variant: StockEntryRow): boolean => Boolean(variant.variant_id))
        .map(
          (variant: StockEntryRow): [number, StockEntryRow] => [
            variant.variant_id as number,
            variant,
          ]
        )
    );
    const orderedVariants: StockEntryRow[] = variantIds
      .map((variantId: number): StockEntryRow | undefined =>
        variantsById.get(variantId)
      )
      .filter((variant): variant is StockEntryRow => Boolean(variant))
      .map((variant: StockEntryRow, index: number): StockEntryRow => ({
        ...variant,
        sort_order: index + 1,
      }));
    const remainingRegisteredVariants: StockEntryRow[] = material.variants
      .filter(
        (variant: StockEntryRow): boolean =>
          Boolean(variant.variant_id) &&
          !orderedIdSet.has(variant.variant_id as number)
      )
      .map((variant: StockEntryRow, index: number): StockEntryRow => ({
        ...variant,
        sort_order: orderedVariants.length + index + 1,
      }));
    const nextRegisteredVariants: StockEntryRow[] = [
      ...orderedVariants,
      ...remainingRegisteredVariants,
    ];
    let registeredIndex = 0;
    const nextVariants: StockEntryRow[] = material.variants.map(
      (variant: StockEntryRow): StockEntryRow => {
        if (!variant.variant_id) return variant;
        const nextVariant: StockEntryRow | undefined =
          nextRegisteredVariants[registeredIndex];
        registeredIndex += 1;
        return nextVariant || variant;
      }
    );

    return recalculateMaterialTotalsFromVariants(material, nextVariants);
  });
};

const StockAdjustmentEntryPage: React.FC<StockAdjustmentEntryPageProps> = ({
  mode,
  generalHeaderActions,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    () => readStoredSelectedMonth(mode) || new Date()
  );
  const availableTabs = useMemo<StockEntryTab[]>(() => getAvailableStockTabs(mode), [mode]);
  const defaultTab = useMemo<StockEntryTab>(() => getDefaultStockEntryTab(mode), [mode]);
  const visibleStockTabs = useMemo(
    () => stockTabs.filter((tab) => availableTabs.includes(tab.id)),
    [availableTabs]
  );
  const activeTab = useMemo<StockEntryTab>(
    () => getStockEntryTab(searchParams, availableTabs, defaultTab),
    [availableTabs, defaultTab, searchParams]
  );
  const pageTitle = mode === "general" ? "General Stock" : "Material Stock";
  const [materials, setMaterials] = useState<MaterialWithStock[]>([]);
  const [originalMaterials, setOriginalMaterials] = useState<MaterialWithStock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [stockKilang, setStockKilang] = useState<StockKilangItem[]>([]);
  const [originalStockKilang, setOriginalStockKilang] = useState<StockKilangItem[]>([]);
  const [isLoadingStockKilang, setIsLoadingStockKilang] = useState(false);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<number>>(new Set());
  const [newVariantRows, setNewVariantRows] = useState<Map<number, StockEntryRow>>(new Map());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [generalStockRows, setGeneralStockRows] = useState<GeneralStockRow[]>([]);
  const [generalStockCategories, setGeneralStockCategories] = useState<GeneralStockCategory[]>([]);
  const [generalAdjustmentInputs, setGeneralAdjustmentInputs] = useState<Record<number, string>>({});
  const [generalSearchQuery, setGeneralSearchQuery] = useState<string>("");
  const [showZeroBalanceGeneralStock, setShowZeroBalanceGeneralStock] = useState<boolean>(false);
  const [newGeneralCategoryName, setNewGeneralCategoryName] = useState<string>("");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isAccountMappingModalOpen, setIsAccountMappingModalOpen] = useState<boolean>(false);
  const [revertingAdjustmentId, setRevertingAdjustmentId] = useState<number | null>(null);
  const [tooltipState, setTooltipState] = useState<{ lineId: number; x: number; y: number } | null>(null);
  const [savingRowKeys, setSavingRowKeys] = useState<Set<RowSaveKey>>(new Set());
  const [pageHeaderHeight, setPageHeaderHeight] = useState<number>(0);
  const [draggedRowKey, setDraggedRowKey] = useState<string | null>(null);
  const [dragOverlay, setDragOverlay] = useState<DragOverlayState | null>(null);
  const pageHeaderRef = useRef<HTMLDivElement | null>(null);
  const scrollRestoredRef = useRef<boolean>(false);
  const wasLoadingRef = useRef<boolean>(false);
  const tooltipTimeoutRef = useRef<number | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const productType = activeTab === "bihun" ? "bh" : "mee";
  const { products, isLoading: isLoadingProducts } = useProductsCache(productType);

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;
  useEffect(() => {
    const headerElement = pageHeaderRef.current;
    if (!headerElement) return;

    const updateHeaderHeight = (): void => {
      setPageHeaderHeight(headerElement.getBoundingClientRect().height);
    };

    updateHeaderHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeaderHeight);
      return (): void => window.removeEventListener("resize", updateHeaderHeight);
    }

    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(headerElement);

    return (): void => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    return (): void => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  // Persist the selected month so it is preserved when navigating away and back.
  useEffect(() => {
    storeSelectedMonth(mode, selectedMonth);
  }, [mode, selectedMonth]);

  // Track the main content scroll position so it can be restored on return.
  useEffect(() => {
    const scrollContainer: HTMLElement | null = getScrollContainer();
    if (!scrollContainer) return;

    const handleScroll = (): void => {
      try {
        window.sessionStorage.setItem(
          scrollPositionStorageKey(mode),
          String(scrollContainer.scrollTop)
        );
      } catch (_error: unknown) {
        // Scroll preservation is best-effort when browser storage is unavailable.
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return (): void => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [mode]);

  // Restore the saved scroll position once, after the first data load renders.
  useEffect(() => {
    if (isLoading) {
      wasLoadingRef.current = true;
      return;
    }
    // Only restore after a real load cycle finishes, so the content has height.
    if (!wasLoadingRef.current || scrollRestoredRef.current) return;

    const scrollContainer: HTMLElement | null = getScrollContainer();
    if (!scrollContainer) return;

    scrollRestoredRef.current = true;
    try {
      const stored: string | null = window.sessionStorage.getItem(
        scrollPositionStorageKey(mode)
      );
      const value: number = stored ? Number.parseInt(stored, 10) : 0;
      if (!Number.isNaN(value) && value > 0) {
        scrollContainer.scrollTop = value;
      }
    } catch (_error: unknown) {
      // Ignore restore failures when browser storage is unavailable.
    }
  }, [isLoading, mode]);

  useEffect(() => {
    const tabParam: string | null = searchParams.get("tab");

    if (mode === "general") {
      if (!tabParam) return;

      const nextSearchParams: URLSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete("tab");
      setSearchParams(nextSearchParams, { replace: true });
      return;
    }

    if (isAllowedStockEntryTab(tabParam, availableTabs)) {
      storeStockEntryTab(tabParam);
      return;
    }

    const nextSearchParams: URLSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("tab", activeTab);
    setSearchParams(nextSearchParams, { replace: true });
  }, [activeTab, availableTabs, mode, searchParams, setSearchParams]);

  const fetchData = useCallback(async () => {
    if (activeTab === "general") {
      setIsLoading(true);
      try {
        const stockResponse = await api.get<{ rows: GeneralStockRow[]; categories: GeneralStockCategory[] }>(
          `/api/general-purchases/general-stock?year=${year}&month=${month}`
        );

        setGeneralStockRows(stockResponse.rows || []);
        setGeneralStockCategories(stockResponse.categories || []);
        setGeneralAdjustmentInputs({});
        setMaterials([]);
        setOriginalMaterials([]);
      } catch (error: unknown) {
        console.error("Error fetching general stock:", error);
        toast.error("Failed to load general stock");
        setGeneralStockRows([]);
        setGeneralStockCategories([]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

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

  const fetchStockKilang = useCallback(async (): Promise<void> => {
    if (activeTab === "general" || activeTab === "shared" || products.length === 0 || isLoadingProducts) {
      setStockKilang([]);
      setOriginalStockKilang([]);
      return;
    }

    setIsLoadingStockKilang(true);
    try {
      const response = await api.get<StockKilangResponse>(
        `/api/materials/stock-kilang?year=${year}&month=${month}&product_line=${activeTab}`
      );
      const entryMap: Map<string, StockKilangEntryRow> = new Map(
        (response.entries || []).map(
          (entry: StockKilangEntryRow): [string, StockKilangEntryRow] => [
            entry.product_id,
            entry,
          ]
        )
      );

      const stockData: StockKilangItem[] = products.map((product) => {
        const entry: StockKilangEntryRow | undefined = entryMap.get(product.id);
        const quantity: number = makeNumber(entry?.quantity);
        const unitCost: number = entry
          ? makeNumber(entry.unit_cost)
          : makeNumber(product.price_per_unit);

        return {
          product_id: product.id,
          name: product.description,
          unit_cost: unitCost,
          quantity,
          value: entry ? makeNumber(entry.stock_value) : 0,
        };
      });

      setStockKilang(stockData);
      setOriginalStockKilang(stockData.map((item: StockKilangItem) => ({ ...item })));
    } catch (error: unknown) {
      console.error("Error fetching stock kilang:", error);
      setStockKilang([]);
      setOriginalStockKilang([]);
    } finally {
      setIsLoadingStockKilang(false);
    }
  }, [activeTab, products, isLoadingProducts, year, month]);

  useEffect(() => {
    fetchStockKilang();
  }, [fetchStockKilang]);

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

  const originalMaterialMap = useMemo<Map<number, MaterialWithStock>>(
    () =>
      new Map(
        originalMaterials.map(
          (material: MaterialWithStock): [number, MaterialWithStock] => [
            material.id,
            material,
          ]
        )
      ),
    [originalMaterials]
  );

  const originalStockKilangMap = useMemo<Map<string, StockKilangItem>>(
    () =>
      new Map(
        originalStockKilang.map(
          (item: StockKilangItem): [string, StockKilangItem] => [
            item.product_id,
            item,
          ]
        )
      ),
    [originalStockKilang]
  );

  const findOriginalVariant = useCallback(
    (
      materialId: number,
      variant: StockEntryRow
    ): StockEntryRow | null => {
      const originalMaterial: MaterialWithStock | undefined =
        originalMaterialMap.get(materialId);
      const originalVariants: StockEntryRow[] = originalMaterial?.variants || [];

      if (variant.variant_id) {
        return (
          originalVariants.find(
            (originalVariant: StockEntryRow): boolean =>
              originalVariant.variant_id === variant.variant_id
          ) || null
        );
      }

      if (variant.custom_description) {
        return (
          originalVariants.find(
            (originalVariant: StockEntryRow): boolean =>
              originalVariant.variant_id === null &&
              originalVariant.custom_description === variant.custom_description
          ) || null
        );
      }

      return (
        originalVariants.find(
          (originalVariant: StockEntryRow): boolean =>
            originalVariant.variant_id === null &&
            originalVariant.variant_name === variant.variant_name
        ) || null
      );
    },
    [originalMaterialMap]
  );

  const isMaterialRowDirty = useCallback(
    (material: MaterialWithStock): boolean => {
      if (material.has_variants) return false;
      const original: MaterialWithStock | undefined = originalMaterialMap.get(material.id);
      if (!original) return true;

      return (
        material.adjustment_quantity !== original.adjustment_quantity ||
        material.unit_cost !== original.unit_cost
      );
    },
    [originalMaterialMap]
  );

  const isVariantRowDirty = useCallback(
    (materialId: number, variant: StockEntryRow): boolean => {
      const originalVariant: StockEntryRow | null = findOriginalVariant(
        materialId,
        variant
      );
      if (!originalVariant) return true;

      return (
        variant.variant_name !== originalVariant.variant_name ||
        variant.adjustment_quantity !== originalVariant.adjustment_quantity ||
        variant.unit_cost !== originalVariant.unit_cost
      );
    },
    [findOriginalVariant]
  );

  const isNewVariantRowDirty = useCallback(
    (materialId: number): boolean => {
      const row: StockEntryRow | undefined = newVariantRows.get(materialId);
      if (!row) return false;

      return Boolean(
        row.variant_name?.trim() ||
          row.adjustment_quantity !== 0 ||
          row.unit_cost !== 0
      );
    },
    [newVariantRows]
  );

  const isStockKilangRowDirty = useCallback(
    (item: StockKilangItem): boolean => {
      const original: StockKilangItem | undefined = originalStockKilangMap.get(
        item.product_id
      );
      return (
        !original ||
        item.quantity !== original.quantity ||
        item.unit_cost !== original.unit_cost
      );
    },
    [originalStockKilangMap]
  );

  const setRowSaving = (rowKey: RowSaveKey, saving: boolean): void => {
    setSavingRowKeys((previous: Set<RowSaveKey>) => {
      const next = new Set(previous);
      if (saving) {
        next.add(rowKey);
      } else {
        next.delete(rowKey);
      }
      return next;
    });
  };

  const hasStockKilangUnsavedChanges = useMemo<boolean>(() => {
    if (activeTab === "general" || activeTab === "shared") return false;
    if (stockKilang.length !== originalStockKilang.length) return true;

    const originalMap: Map<string, StockKilangItem> = new Map(
      originalStockKilang.map((item: StockKilangItem) => [item.product_id, item])
    );

    return stockKilang.some((item: StockKilangItem) => {
      const original: StockKilangItem | undefined = originalMap.get(item.product_id);
      return (
        !original ||
        item.quantity !== original.quantity ||
        item.unit_cost !== original.unit_cost
      );
    });
  }, [activeTab, stockKilang, originalStockKilang]);

  const hasUnsavedChanges = useMemo<boolean>(() => {
    if (activeTab === "general") {
      return Object.values(generalAdjustmentInputs).some(
        (value) => makeNumber(value) !== 0
      );
    }

    if (hasStockKilangUnsavedChanges) return true;

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
  }, [
    activeTab,
    materials,
    originalMaterials,
    newVariantRows,
    generalAdjustmentInputs,
    hasStockKilangUnsavedChanges,
  ]);

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

  const handleDeleteMaterialClick = (
    material: MaterialWithStock,
    event?: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event?.stopPropagation();
    setDeleteTarget({ type: "material", material });
  };

  const handleDeleteVariantClick = (
    material: MaterialWithStock,
    variant: StockEntryRow,
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.stopPropagation();

    if (!variant.variant_id) {
      toast.error("Only registered variants can be deactivated from this page");
      return;
    }

    setDeleteTarget({ type: "variant", material, variant });
  };

  const handleCloseDeleteDialog = (): void => {
    if (isDeleting) return;
    setDeleteTarget(null);
  };

  const handleConfirmDeleteTarget = async (): Promise<void> => {
    if (!deleteTarget || isDeleting) return;

    setIsDeleting(true);
    try {
      if (deleteTarget.type === "variant") {
        await api.delete(`/api/materials/variants/${deleteTarget.variant.variant_id}`);
        toast.success(`Variant "${getVariantDisplayName(deleteTarget.variant)}" deactivated`);
      } else {
        await api.delete(`/api/materials/${deleteTarget.material.id}`);
        toast.success(`Material "${getMaterialDisplayName(deleteTarget.material)}" deactivated`);
      }

      setDeleteTarget(null);
      await fetchData();
    } catch (error: unknown) {
      console.error("Error deactivating material stock item:", error);
      toast.error(error instanceof Error ? error.message : "Failed to deactivate item");
    } finally {
      setIsDeleting(false);
    }
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

  const handleStockKilangQuantityChange = (productId: string, value: string): void => {
    const quantity: number = makeNumber(value);

    setStockKilang((prev: StockKilangItem[]) =>
      prev.map((item: StockKilangItem) => {
        if (item.product_id !== productId) return item;

        return {
          ...item,
          quantity,
          value: quantity * item.unit_cost,
        };
      })
    );
  };

  const handleStockKilangUnitCostChange = (productId: string, value: string): void => {
    const unitCost: number = makeNumber(value);

    setStockKilang((prev: StockKilangItem[]) =>
      prev.map((item: StockKilangItem) => {
        if (item.product_id !== productId) return item;

        return {
          ...item,
          unit_cost: unitCost,
          value: item.quantity * unitCost,
        };
      })
    );
  };

  const handleBeforeMonthChange = useCallback(() => {
    if (hasUnsavedChanges) {
      return window.confirm("You have unsaved changes. Do you want to discard them?");
    }
    return true;
  }, [hasUnsavedChanges]);

  const handleTabChange = (tab: StockEntryTab): void => {
    if (!availableTabs.includes(tab)) return;
    if (tab === activeTab) return;
    if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Do you want to discard them?")) {
      return;
    }

    const nextSearchParams: URLSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("tab", tab);
    storeStockEntryTab(tab);
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleAddGeneralCategory = async (): Promise<void> => {
    const name = newGeneralCategoryName.trim();
    if (!name) return;

    try {
      await api.post("/api/general-purchases/general-stock/categories", {
        name,
        sort_order: generalStockCategories.length + 1,
      });
      setNewGeneralCategoryName("");
      await fetchData();
      toast.success("General stock category added");
    } catch (error: unknown) {
      console.error("Error adding general stock category:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add category");
    }
  };

  const handleGeneralAdjustmentChange = (lineId: number, value: string): void => {
    setGeneralAdjustmentInputs((previous) => ({
      ...previous,
      [lineId]: value,
    }));
  };

  const getSelectedMonthStartDate = (): string => {
    return `${year}-${String(month).padStart(2, "0")}-01`;
  };

  const getGeneralPurchasePath = (row: GeneralStockRow): string => {
    return row.purchase_kind === "local"
      ? `/stock/general-purchases/local/${row.self_billed_invoice_id}`
      : `/stock/general-purchases/${row.self_billed_invoice_id}`;
  };

  const openGeneralPurchase = (row: GeneralStockRow): void => {
    navigate(getGeneralPurchasePath(row));
  };

  const handleUsedCellMouseEnter = (row: GeneralStockRow, event: React.MouseEvent<HTMLTableCellElement>): void => {
    if (!row.used_adjustments?.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (tooltipTimeoutRef.current !== null) clearTimeout(tooltipTimeoutRef.current);
    setTooltipState({ lineId: row.line_id, x: rect.left, y: rect.top });
  };

  const hideTooltip = (): void => {
    tooltipTimeoutRef.current = window.setTimeout(() => setTooltipState(null), 100);
  };

  const handleTooltipMouseEnter = (): void => {
    if (tooltipTimeoutRef.current !== null) clearTimeout(tooltipTimeoutRef.current);
  };

  const handleTooltipMouseLeave = (): void => {
    tooltipTimeoutRef.current = window.setTimeout(() => setTooltipState(null), 100);
  };

  const saveGeneralStockAdjustments = async (): Promise<void> => {
    const adjustments = Object.entries(generalAdjustmentInputs)
      .map(([lineId, value]) => {
        const row = generalStockRows.find((item) => item.line_id === Number.parseInt(lineId, 10));
        return {
          line_id: Number.parseInt(lineId, 10),
          self_billed_invoice_line_id: Number.parseInt(lineId, 10),
          general_stock_category_id: row?.general_stock_category_id || null,
          adjustment_date: getSelectedMonthStartDate(),
          adjustment_quantity: makeNumber(value),
        };
      })
      .filter((adjustment) => adjustment.adjustment_quantity !== 0);

    if (adjustments.length === 0) return;

    setIsSaving(true);
    try {
      await api.post("/api/general-purchases/general-stock/adjustments", {
        adjustments,
      });
      toast.success("General stock adjustments saved");
      await fetchData();
    } catch (error: unknown) {
      console.error("Error saving general stock adjustments:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save general stock adjustments");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevertGeneralUsedAdjustment = async (
    adjustment: GeneralStockAdjustment,
    event?: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event?.stopPropagation();
    if (!window.confirm(`Revert used quantity ${formatQty(Math.abs(makeNumber(adjustment.adjustment_quantity)))}?`)) {
      return;
    }

    setRevertingAdjustmentId(adjustment.id);
    try {
      await api.delete(`/api/general-purchases/general-stock/adjustments/${adjustment.id}`);
      toast.success("Used adjustment reverted");
      await fetchData();
    } catch (error: unknown) {
      console.error("Error reverting used adjustment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to revert used adjustment");
    } finally {
      setRevertingAdjustmentId(null);
    }
  };

  const saveMaterialStockEntries = async (
    entries: MaterialStockEntryInput[]
  ): Promise<MaterialStockBatchResponse> => {
    return api.post("/api/materials/stock/batch", {
      year,
      month,
      product_line: activeTab,
      entries,
    });
  };

  const updateOriginalMaterial = (material: MaterialWithStock): void => {
    setOriginalMaterials((previous: MaterialWithStock[]) =>
      previous.map((item: MaterialWithStock): MaterialWithStock =>
        item.id === material.id
          ? (JSON.parse(JSON.stringify(material)) as MaterialWithStock)
          : item
      )
    );
  };

  const updateVariantInMaterialStates = (
    materialId: number,
    targetVariant: StockEntryRow,
    nextVariant: StockEntryRow
  ): void => {
    setMaterials((previous: MaterialWithStock[]) =>
      previous.map((material: MaterialWithStock): MaterialWithStock =>
        material.id === materialId
          ? replaceVariantInMaterial(material, targetVariant, nextVariant)
          : material
      )
    );
    setOriginalMaterials((previous: MaterialWithStock[]) =>
      previous.map((material: MaterialWithStock): MaterialWithStock =>
        material.id === materialId
          ? replaceVariantInMaterial(material, targetVariant, nextVariant)
          : material
      )
    );
  };

  const addSavedVariantToMaterialStates = (
    materialId: number,
    savedVariant: StockEntryRow
  ): void => {
    setMaterials((previous: MaterialWithStock[]) =>
      previous.map((material: MaterialWithStock): MaterialWithStock =>
        material.id === materialId
          ? addVariantToMaterial(material, savedVariant)
          : material
      )
    );
    setOriginalMaterials((previous: MaterialWithStock[]) =>
      previous.map((material: MaterialWithStock): MaterialWithStock =>
        material.id === materialId
          ? addVariantToMaterial(material, savedVariant)
          : material
      )
    );
  };

  const confirmNegativeSave = (label: string, closingQuantity: number): boolean => {
    if (closingQuantity >= 0) return true;

    return window.confirm(
      `Warning: ${label} has negative calculated closing stock. Do you want to save anyway?`
    );
  };

  const handleSaveMaterialRow = async (
    material: MaterialWithStock,
    event?: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event?.stopPropagation();
    if (activeTab === "general" || !isMaterialRowDirty(material)) return;
    if (!confirmNegativeSave(material.name, material.closing_quantity)) return;

    const rowKey: RowSaveKey = materialRowSaveKey(material.id);
    setRowSaving(rowKey, true);
    try {
      await saveMaterialStockEntries([makeMaterialStockEntry(material)]);
      updateOriginalMaterial(material);
      toast.success(`${material.name} saved`);
    } catch (error: unknown) {
      console.error("Error saving material row:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save material");
    } finally {
      setRowSaving(rowKey, false);
    }
  };

  const handleSaveVariantRow = async (
    material: MaterialWithStock,
    variant: StockEntryRow,
    event?: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event?.stopPropagation();
    if (activeTab === "general" || !isVariantRowDirty(material.id, variant)) return;
    if (
      !confirmNegativeSave(
        `${material.name} ${getVariantDisplayName(variant)}`,
        variant.closing_quantity
      )
    ) {
      return;
    }

    const rowKey: RowSaveKey = variantRowSaveKey(material.id, variant);
    const originalVariant: StockEntryRow | null = findOriginalVariant(
      material.id,
      variant
    );
    const nextVariantName: string | null = variant.variant_name?.trim() || null;
    const nextVariant: StockEntryRow = {
      ...variant,
      variant_name: variant.variant_id
        ? nextVariantName
        : nextVariantName || variant.variant_name,
      custom_description: variant.variant_id
        ? null
        : getVariantCustomDescription({
            ...variant,
            variant_name: nextVariantName || variant.variant_name,
          }),
    };

    setRowSaving(rowKey, true);
    try {
      if (
        variant.variant_id &&
        nextVariantName &&
        originalVariant &&
        nextVariantName !== originalVariant.variant_name
      ) {
        await api.put(`/api/materials/variants/${variant.variant_id}`, {
          variant_name: nextVariantName,
          default_unit_cost: variant.unit_cost,
        });
      }

      await saveMaterialStockEntries(
        makeVariantStockEntries(material.id, nextVariant, originalVariant)
      );
      updateVariantInMaterialStates(material.id, variant, nextVariant);
      toast.success(`${getVariantDisplayName(nextVariant)} saved`);
    } catch (error: unknown) {
      console.error("Error saving variant row:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save variant");
    } finally {
      setRowSaving(rowKey, false);
    }
  };

  const handleSaveNewVariantRow = async (
    material: MaterialWithStock,
    event?: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event?.stopPropagation();
    const newVariant: StockEntryRow | undefined = newVariantRows.get(material.id);
    if (!newVariant || !isNewVariantRowDirty(material.id)) return;

    const variantName: string = newVariant.variant_name?.trim() || "";
    if (!variantName) {
      toast.error(`Please enter a name for the new variant in ${material.name}`);
      return;
    }

    if (
      material.variants?.some(
        (variant: StockEntryRow): boolean =>
          variant.variant_name?.trim().toLowerCase() === variantName.toLowerCase()
      )
    ) {
      toast.error(`Variant "${variantName}" already exists for ${material.name}`);
      return;
    }

    if (
      !confirmNegativeSave(
        `${material.name} ${variantName}`,
        newVariant.closing_quantity
      )
    ) {
      return;
    }

    const rowKey: RowSaveKey = newVariantRowSaveKey(material.id);
    setRowSaving(rowKey, true);
    try {
      const response: MaterialStockBatchResponse = await saveMaterialStockEntries([
        makeNewVariantStockEntry(material.id, {
          ...newVariant,
          variant_name: variantName,
        }),
      ]);
      const registeredVariant = response.registered_variants?.[0];

      if (!registeredVariant) {
        throw new Error("Variant was saved but the saved variant id was not returned");
      }

      const savedVariant: StockEntryRow = {
        ...newVariant,
        variant_id: registeredVariant.id,
        variant_name: registeredVariant.variant_name,
        custom_description: null,
        sort_order: registeredVariant.sort_order ?? null,
        is_new_variant: false,
      };

      addSavedVariantToMaterialStates(material.id, savedVariant);
      setNewVariantRows((previous: Map<number, StockEntryRow>) => {
        const next = new Map(previous);
        next.delete(material.id);
        return next;
      });
      setExpandedMaterials((previous: Set<number>) => new Set(previous).add(material.id));
      toast.success(`Variant "${registeredVariant.variant_name}" saved`);
    } catch (error: unknown) {
      console.error("Error saving new variant row:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save new variant");
    } finally {
      setRowSaving(rowKey, false);
    }
  };

  const handleSaveStockKilangRow = async (
    item: StockKilangItem,
    event?: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event?.stopPropagation();
    if (!isStockKilangRowDirty(item)) return;
    if (!confirmNegativeSave(item.name, item.quantity)) return;

    const rowKey: RowSaveKey = stockKilangRowSaveKey(item.product_id);
    setRowSaving(rowKey, true);
    try {
      await api.put("/api/materials/stock-kilang/product", {
        year,
        month,
        product_line: activeTab,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      });
      setOriginalStockKilang((previous: StockKilangItem[]) =>
        previous.some(
          (originalItem: StockKilangItem): boolean =>
            originalItem.product_id === item.product_id
        )
          ? previous.map((originalItem: StockKilangItem): StockKilangItem =>
              originalItem.product_id === item.product_id
                ? { ...item }
                : originalItem
            )
          : [...previous, { ...item }]
      );
      toast.success(`${item.name} saved`);
    } catch (error: unknown) {
      console.error("Error saving Stock Kilang row:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save Stock Kilang row"
      );
    } finally {
      setRowSaving(rowKey, false);
    }
  };

  const handleSave = async (): Promise<void> => {
    if (activeTab === "general") {
      await saveGeneralStockAdjustments();
      return;
    }

    let negativeCount = stockKilang.filter(
      (item: StockKilangItem) => item.quantity < 0
    ).length;
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
      if (
        (row.adjustment_quantity !== 0 || row.unit_cost !== 0) &&
        !row.variant_name?.trim()
      ) {
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
            const originalVariant: StockEntryRow | null = findOriginalVariant(
              material.id,
              variant
            );
            entries.push(
              ...makeVariantStockEntries(material.id, variant, originalVariant)
            );
          });
        } else {
          entries.push(makeMaterialStockEntry(material));
        }
      });

      newVariantRows.forEach((row, materialId) => {
        if (row.variant_name?.trim()) {
          entries.push(
            makeNewVariantStockEntry(materialId, {
              ...row,
              variant_name: row.variant_name.trim(),
            })
          );
        }
      });

      const response = await saveMaterialStockEntries(entries);
      let stockKilangSaved = false;

      if (hasStockKilangUnsavedChanges) {
        const stockKilangEntries: StockKilangSaveEntry[] = stockKilang
          .map((item: StockKilangItem) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
          }))
          .filter(
            (entry: StockKilangSaveEntry) => entry.quantity !== 0
          );

        await api.post("/api/materials/stock-kilang/batch", {
          year,
          month,
          product_line: activeTab,
          entries: stockKilangEntries,
        });
        stockKilangSaved = true;
      }

      const messages: string[] = [];
      if (variantNameUpdates.length > 0) {
        messages.push(`${variantNameUpdates.length} variant name(s) updated`);
      }
      if (response.registered_variants && response.registered_variants.length > 0) {
        messages.push(`${response.registered_variants.length} new variant(s) registered`);
      }
      if (stockKilangSaved) {
        messages.push("Stock Kilang updated");
      }

      toast.success(messages.length > 0 ? `Saved. ${messages.join(", ")}.` : "Stock adjustments saved");
      await fetchData();
      await fetchStockKilang();
    } catch (error: unknown) {
      console.error("Error saving stock entries:", error);
      const message = error instanceof Error ? error.message : "Failed to save stock adjustments";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const isAnyRowSaving: boolean = savingRowKeys.size > 0;
  const tableHeaderStyle: React.CSSProperties = {
    top: pageHeaderHeight + 8,
  };

  const applyMaterialOrder = (
    category: MaterialCategory,
    materialIds: number[]
  ): void => {
    setMaterials((previous: MaterialWithStock[]) =>
      orderMaterialsWithinCategory(previous, category, materialIds)
    );
    setOriginalMaterials((previous: MaterialWithStock[]) =>
      orderMaterialsWithinCategory(previous, category, materialIds)
    );
  };

  const applyVariantOrder = (materialId: number, variantIds: number[]): void => {
    setMaterials((previous: MaterialWithStock[]) =>
      orderVariantsWithinMaterial(previous, materialId, variantIds)
    );
    setOriginalMaterials((previous: MaterialWithStock[]) =>
      orderVariantsWithinMaterial(previous, materialId, variantIds)
    );
  };

  const clearDragOverlayFrame = (): void => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragPointRef.current = null;
  };

  const scheduleDragMove = (
    pointerId: number,
    clientX: number,
    clientY: number
  ): void => {
    pendingDragPointRef.current = { pointerId, clientX, clientY };

    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame((): void => {
      const dragPoint = pendingDragPointRef.current;
      const dragState: DragState | null = dragStateRef.current;
      dragFrameRef.current = null;

      if (!dragPoint || !dragState || dragPoint.pointerId !== dragState.pointerId) {
        return;
      }

      if (dragOverlayRef.current) {
        const nextX: number =
          dragPoint.clientX - dragState.offsetX - dragState.initialLeft;
        const nextY: number =
          dragPoint.clientY - dragState.offsetY - dragState.initialTop;
        dragOverlayRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      }

      const targetElement: Element | null = document.elementFromPoint(
        dragPoint.clientX,
        dragPoint.clientY
      );

      if (dragState.type === "material") {
        const targetRow = targetElement?.closest("[data-material-row-id]") as
          | HTMLElement
          | null;
        const targetMaterialId: number = Number(targetRow?.dataset.materialRowId);
        const targetCategory = targetRow?.dataset.materialCategory as
          | MaterialCategory
          | undefined;

        if (
          !targetMaterialId ||
          targetMaterialId === dragState.materialId ||
          targetCategory !== dragState.category
        ) {
          dragState.lastTargetId = null;
          return;
        }

        dragState.lastTargetId = targetMaterialId;
        return;
      }

      const targetRow = targetElement?.closest("[data-variant-row-id]") as
        | HTMLElement
        | null;
      const targetVariantId: number = Number(targetRow?.dataset.variantRowId);
      const targetMaterialId: number = Number(targetRow?.dataset.variantMaterialId);

      if (
        !targetVariantId ||
        targetVariantId === dragState.variantId ||
        targetMaterialId !== dragState.materialId
      ) {
        dragState.lastTargetId = null;
        return;
      }

      dragState.lastTargetId = targetVariantId;
    });
  };

  const handleMaterialDragPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    material: MaterialWithStock,
    category: MaterialCategory,
    index: number
  ): void => {
    if (isSaving || isAnyRowSaving || isDeleting || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const currentOrderIds: number[] = groupedMaterials[category].map(
      (item: MaterialWithStock): number => item.id
    );
    const rowElement = event.currentTarget.closest("[data-material-row-id]") as
      | HTMLElement
      | null;
    if (!rowElement) return;

    const rowRect: DOMRect = rowElement.getBoundingClientRect();
    dragStateRef.current = {
      type: "material",
      materialId: material.id,
      category,
      pointerId: event.pointerId,
      previousOrderIds: currentOrderIds,
      currentOrderIds,
      lastTargetId: null,
      offsetX: event.clientX - rowRect.left,
      offsetY: event.clientY - rowRect.top,
      initialLeft: rowRect.left,
      initialTop: rowRect.top,
    };
    setDraggedRowKey(`material:${material.id}`);
    setDragOverlay({
      label: material.name,
      sublabel: material.code,
      index,
      left: rowRect.left,
      top: rowRect.top,
      width: rowRect.width,
      height: rowRect.height,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleVariantDragPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    material: MaterialWithStock,
    variant: StockEntryRow,
    index: number
  ): void => {
    if (
      isSaving ||
      isAnyRowSaving ||
      isDeleting ||
      event.button !== 0 ||
      !variant.variant_id
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentOrderIds: number[] = (material.variants || [])
      .filter((item: StockEntryRow): boolean => Boolean(item.variant_id))
      .map((item: StockEntryRow): number => item.variant_id as number);
    const rowElement = event.currentTarget.closest("[data-variant-row-id]") as
      | HTMLElement
      | null;
    if (!rowElement) return;

    const rowRect: DOMRect = rowElement.getBoundingClientRect();
    dragStateRef.current = {
      type: "variant",
      materialId: material.id,
      variantId: variant.variant_id,
      pointerId: event.pointerId,
      previousOrderIds: currentOrderIds,
      currentOrderIds,
      lastTargetId: null,
      offsetX: event.clientX - rowRect.left,
      offsetY: event.clientY - rowRect.top,
      initialLeft: rowRect.left,
      initialTop: rowRect.top,
    };
    setDraggedRowKey(`variant:${material.id}:${variant.variant_id}`);
    setDragOverlay({
      label: getVariantDisplayName(variant),
      sublabel: material.name,
      index,
      left: rowRect.left,
      top: rowRect.top,
      width: rowRect.width,
      height: rowRect.height,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>
  ): void => {
    const dragState: DragState | null = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    scheduleDragMove(event.pointerId, event.clientX, event.clientY);
  };

  const handleDragPointerUp = async (
    event: React.PointerEvent<HTMLButtonElement>
  ): Promise<void> => {
    const dragState: DragState | null = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
    setDraggedRowKey(null);
    setDragOverlay(null);
    clearDragOverlayFrame();

    const nextOrderIds: number[] = dragState.lastTargetId
      ? moveId(
          dragState.currentOrderIds,
          dragState.type === "material"
            ? dragState.materialId
            : dragState.variantId,
          dragState.lastTargetId
        )
      : dragState.currentOrderIds;

    if (areIdsEqual(nextOrderIds, dragState.previousOrderIds)) return;

    if (dragState.type === "material") {
      applyMaterialOrder(dragState.category, nextOrderIds);
      try {
        await api.put("/api/materials/order", {
          category: dragState.category,
          material_ids: nextOrderIds,
        });
      } catch (error: unknown) {
        console.error("Error saving material order:", error);
        applyMaterialOrder(dragState.category, dragState.previousOrderIds);
        toast.error("Failed to save material order");
      }
      return;
    }

    applyVariantOrder(dragState.materialId, nextOrderIds);
    try {
      await api.put(`/api/materials/${dragState.materialId}/variants/order`, {
        variant_ids: nextOrderIds,
      });
    } catch (error: unknown) {
      console.error("Error saving variant order:", error);
      applyVariantOrder(dragState.materialId, dragState.previousOrderIds);
      toast.error("Failed to save variant order");
    }
  };

  const handleDragPointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>
  ): void => {
    const dragState: DragState | null = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
    setDraggedRowKey(null);
    setDragOverlay(null);
    clearDragOverlayFrame();
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

  const stockKilangTotal = useMemo<number>(() => {
    return stockKilang.reduce(
      (sum: number, item: StockKilangItem) => sum + item.value,
      0
    );
  }, [stockKilang]);

  const negativeCount = useMemo<number>(() => {
    const materialNegativeCount: number = materials.filter(
      (material: MaterialWithStock) => material.closing_quantity < 0
    ).length;
    const stockKilangNegativeCount: number = stockKilang.filter(
      (item: StockKilangItem) => item.quantity < 0
    ).length;

    return materialNegativeCount + stockKilangNegativeCount;
  }, [materials, stockKilang]);

  const filteredGeneralStockRows = useMemo(() => {
    const query = generalSearchQuery.trim().toLowerCase();

    return generalStockRows.filter((row) => {
      if (!generalStockRowMatchesSearch(row, query)) return false;

      if (!showZeroBalanceGeneralStock && makeNumber(row.current_stock) === 0) {
        return false;
      }

      return true;
    });
  }, [generalStockRows, generalSearchQuery, showZeroBalanceGeneralStock]);

  const hiddenZeroBalanceGeneralStockCount = useMemo(() => {
    if (showZeroBalanceGeneralStock) return 0;

    const query = generalSearchQuery.trim().toLowerCase();
    return generalStockRows.filter(
      (row) =>
        generalStockRowMatchesSearch(row, query) &&
        makeNumber(row.current_stock) === 0
    ).length;
  }, [generalStockRows, generalSearchQuery, showZeroBalanceGeneralStock]);

  const groupedGeneralStockRows = useMemo(() => {
    const groups = new Map<string, GeneralStockRow[]>();
    filteredGeneralStockRows.forEach((row) => {
      const key = row.category_name || "Uncategorised";
      const rows = groups.get(key) || [];
      rows.push(row);
      groups.set(key, rows);
    });
    return Array.from(groups.entries());
  }, [filteredGeneralStockRows]);

  const generalStockTotal = useMemo(() => {
    return filteredGeneralStockRows.reduce((sum, row) => sum + makeNumber(row.current_stock), 0);
  }, [filteredGeneralStockRows]);

  const tooltipRow = tooltipState
    ? generalStockRows.find((r) => r.line_id === tooltipState.lineId) ?? null
    : null;

  const renderRowSaveButton = (
    rowKey: RowSaveKey,
    isDirty: boolean,
    onSave: (event: React.MouseEvent<HTMLButtonElement>) => void,
    label: string
  ): React.ReactNode => {
    const isSavingRow: boolean = savingRowKeys.has(rowKey);
    const disabled: boolean =
      !isDirty || isSaving || isDeleting || (isAnyRowSaving && !isSavingRow);

    return (
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className={clsx(
          "inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-colors",
          isDirty
            ? "text-sky-600 hover:bg-sky-100 hover:text-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/40"
            : "text-default-300 dark:text-gray-600",
          disabled && "cursor-not-allowed opacity-50"
        )}
        title={isSavingRow ? "Saving..." : label}
        aria-label={label}
      >
        <IconDeviceFloppy size={14} />
      </button>
    );
  };

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

  const deleteTargetName: string =
    deleteTarget?.type === "variant"
      ? getVariantDisplayName(deleteTarget.variant)
      : deleteTarget
        ? getMaterialDisplayName(deleteTarget.material)
        : "";

  const deleteDialogTitle: string =
    deleteTarget?.type === "variant" ? "Deactivate Variant" : "Deactivate Material";

  const deleteDialogMessage: string = deleteTarget
    ? deleteTarget.type === "variant"
      ? `Deactivate variant "${deleteTargetName}" from ${deleteTarget.material.name}? It will be hidden from stock entry and purchases, but existing stock history stays unchanged.${hasUnsavedChanges ? " Unsaved edits on this page will be discarded when it reloads." : ""}`
      : `Deactivate material "${deleteTargetName}"? It will be hidden from stock entry and purchases, but existing stock history stays unchanged.${hasUnsavedChanges ? " Unsaved edits on this page will be discarded when it reloads." : ""}`
    : "";

  return (
    <div className="space-y-3">
      <div
        ref={pageHeaderRef}
        className="sticky top-0 z-40 isolate rounded-lg border border-default-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/20 sm:px-5 lg:px-6"
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex shrink-0 items-center gap-2">
              <IconBox size={22} className="text-default-500 dark:text-gray-400" />
              <h1 className="whitespace-nowrap text-lg font-semibold text-default-800 dark:text-gray-100">
                {pageTitle}
              </h1>
            </div>
            <span className="hidden text-default-300 dark:text-gray-600 md:inline">|</span>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                {activeTab === "general"
                  ? `${filteredGeneralStockRows.length} general items`
                  : `${materials.length} materials`}
              </span>
              {activeTab === "general" ? (
                <>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                    Stock: <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatQty(generalStockTotal)}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                    Purchases: <span className="font-medium text-blue-600 dark:text-blue-400">RM {formatNumber(grandTotal.purchases)}</span>
                  </span>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                    Closing: <span className="font-medium text-green-600 dark:text-green-400">RM {formatNumber(grandTotal.closing)}</span>
                  </span>
                </>
              )}
              {stockKilang.length > 0 && (
                <>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                    FG: <span className="font-medium text-emerald-600 dark:text-emerald-400">RM {formatNumber(stockKilangTotal)}</span>
                  </span>
                </>
              )}
              {negativeCount > 0 && (
                <>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="flex items-center gap-1 whitespace-nowrap text-red-500">
                    <IconAlertTriangle size={14} />
                    {negativeCount} negative
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 xl:justify-end">
            {visibleStockTabs.length > 1 && (
              <>
                <div className="flex shrink-0 items-center rounded-full bg-default-100 p-0.5 dark:bg-gray-700">
                  {visibleStockTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      className={clsx(
                        "rounded-full px-3 py-1 text-sm font-medium transition-colors sm:px-4",
                        activeTab === tab.id
                          ? tab.activeClass
                          : "text-default-600 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
              </>
            )}
            <div className="shrink-0">
              <MonthNavigator
                selectedMonth={selectedMonth}
                onChange={setSelectedMonth}
                beforeChange={handleBeforeMonthChange}
              />
            </div>
            <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>

            {mode === "material" && (
              <Button
                color="default"
                variant="outline"
                size="sm"
                onClick={() => setIsAccountMappingModalOpen(true)}
                icon={IconSettings}
              >
                Mappings
              </Button>
            )}

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
      ) : activeTab === "general" ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-default-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col lg:flex-row">
              <section className="min-w-0 flex-1 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
                      Categories
                    </h2>
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-default-100 px-1.5 text-xs font-medium text-default-500 dark:bg-gray-700 dark:text-gray-400">
                      {generalStockCategories.length}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={IconSettings}
                    className="h-8 rounded-lg !px-3"
                    onClick={() => setIsCategoryModalOpen(true)}
                  >
                    Manage
                  </Button>
                </div>
            {generalStockCategories.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="flex min-h-16 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-default-300 px-3 py-3 text-sm text-default-500 transition-colors hover:border-sky-400 hover:text-sky-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-sky-500 dark:hover:text-sky-300"
              >
                <IconPlus size={16} />
                No categories yet — add your first one
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {generalStockCategories.map((category: GeneralStockCategory) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setIsCategoryModalOpen(true)}
                    title="Manage categories"
                    className="group flex h-8 items-center gap-1.5 rounded-full border border-default-200 bg-default-50 pl-3 pr-2.5 text-sm text-default-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-300"
                  >
                    <IconCategory2
                      size={14}
                      className="text-default-400 transition-colors group-hover:text-sky-500 dark:text-gray-500"
                    />
                    <span className="truncate">{category.name}</span>
                  </button>
                ))}
              </div>
            )}
              </section>

              <aside className="border-t border-default-200 p-3 dark:border-gray-700 lg:w-[430px] lg:border-l lg:border-t-0">
                {generalHeaderActions && (
                  <div className="border-b border-default-200 pb-3 dark:border-gray-700">
                    <div className="flex flex-wrap items-center gap-2">
                      {generalHeaderActions}
                    </div>
                  </div>
                )}
                <div className={clsx("flex flex-col gap-2 sm:flex-row", generalHeaderActions && "pt-3")}>
                  <input
                    type="text"
                    value={newGeneralCategoryName}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setNewGeneralCategoryName(event.target.value)
                    }
                    onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddGeneralCategory();
                      }
                    }}
                    placeholder="New category"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-default-300 bg-white px-3 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <Button
                    type="button"
                    color="sky"
                    size="sm"
                    icon={IconPlus}
                    className="h-8 rounded-lg !px-3"
                    onClick={handleAddGeneralCategory}
                    disabled={!newGeneralCategoryName.trim()}
                  >
                    Add
                  </Button>
                </div>
              </aside>
            </div>
          </div>

          <div className="rounded-lg border border-default-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full max-w-sm">
              <IconSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
              />
              <input
                type="text"
                value={generalSearchQuery}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setGeneralSearchQuery(event.target.value)
                }
                placeholder="Search category, item, supplier..."
                className="h-9 w-full rounded-lg border border-default-300 bg-white pl-9 pr-9 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
              />
              {generalSearchQuery && (
                <button
                  type="button"
                  onClick={() => setGeneralSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-default-400 hover:bg-default-100 hover:text-default-700 dark:text-gray-500 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <IconX size={14} />
                </button>
              )}
              </div>

              <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-default-200 bg-white px-2.5 text-sm text-default-600 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {!showZeroBalanceGeneralStock && hiddenZeroBalanceGeneralStockCount > 0 && (
                <span className="border-r border-default-200 pr-2 text-xs text-default-400 dark:border-gray-700 dark:text-gray-500">
                  {hiddenZeroBalanceGeneralStockCount} hidden
                </span>
              )}
              <Checkbox
                checked={showZeroBalanceGeneralStock}
                onChange={setShowZeroBalanceGeneralStock}
                size={18}
                checkedColor="text-indigo-600 dark:text-indigo-400"
                uncheckedColor="text-default-400 dark:text-gray-500"
                label="Show zero balance"
                buttonClassName="rounded"
                ariaLabel="Show zero balance general stock items"
              />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-default-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead
                className="sticky z-30 bg-default-50 shadow-sm dark:bg-gray-900"
                style={tableHeaderStyle}
              >
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    Purchase
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    Supplier / Description
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    Source Qty
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    Added
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    Used
                  </th>
                  <th className="w-28 px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                    Adjustment
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    Current
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                {groupedGeneralStockRows.map(([categoryName, rows]: [string, GeneralStockRow[]]) => {
                  const categoryTotal = rows.reduce(
                    (sum: number, row: GeneralStockRow) => sum + makeNumber(row.current_stock),
                    0
                  );

                  return (
                    <React.Fragment key={categoryName}>
                      <tr className="bg-default-100 dark:bg-gray-700/50">
                        <td colSpan={6} className="px-3 py-1.5 text-xs font-semibold text-default-700 dark:text-gray-300">
                          <div className="flex items-center gap-2">
                            <IconPackage size={14} className="text-default-500" />
                            {categoryName}
                            <span className="text-default-400 font-normal">({rows.length})</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs font-medium text-indigo-600 dark:text-indigo-300">
                          {formatQty(categoryTotal)}
                        </td>
                      </tr>
                      {rows.map((row: GeneralStockRow) => {
                        const adjustmentInput = generalAdjustmentInputs[row.line_id] || "";
                        const previewCurrent = makeNumber(row.current_stock) + makeNumber(adjustmentInput);

                        return (
                          <tr
                            key={row.line_id}
                            onClick={() => openGeneralPurchase(row)}
                            className="cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/30"
                            title="Open source general purchase"
                          >
                            <td className="whitespace-nowrap px-3 py-2 text-sm">
                              <div className="font-mono font-medium text-sky-700 hover:underline dark:text-sky-300">
                                {row.purchase_no}
                              </div>
                              <div className="text-xs text-default-500 dark:text-gray-400">
                                {row.purchase_date}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-sm">
                              <div className="font-medium text-default-800 dark:text-gray-100">
                                {row.supplier_name || "-"}
                              </div>
                              <div className="max-w-xl whitespace-pre-wrap text-default-600 dark:text-gray-300">
                                {row.description}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-sm text-default-700 dark:text-gray-300">
                              {formatQty(makeNumber(row.balance_quantity))}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                              {formatQty(makeNumber(row.appended_quantity))}
                            </td>
                            <td
                              className="px-2 py-2 text-right font-mono text-sm text-red-600 dark:text-red-400"
                              onMouseEnter={(event: React.MouseEvent<HTMLTableCellElement>) => handleUsedCellMouseEnter(row, event)}
                              onMouseLeave={hideTooltip}
                            >
                              <span
                                className={
                                  row.used_adjustments && row.used_adjustments.length > 0
                                    ? "cursor-help underline decoration-dotted underline-offset-2"
                                    : ""
                                }
                              >
                                {formatQty(Math.abs(Math.min(makeNumber(row.adjustment_quantity), 0)))}
                              </span>
                            </td>
                            <td className="px-1 py-2">
                              <input
                                type="number"
                                value={adjustmentInput}
                                step="1"
                                onClick={(event: React.MouseEvent<HTMLInputElement>) =>
                                  event.stopPropagation()
                                }
                                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                  handleGeneralAdjustmentChange(row.line_id, event.target.value)
                                }
                                className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-right font-mono text-sm text-default-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-800 dark:bg-gray-700 dark:text-gray-100"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                              {formatQty(previewCurrent)}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {filteredGeneralStockRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-default-500 dark:text-gray-400">
                      <IconPackage size={32} className="mx-auto mb-2 text-default-300 dark:text-gray-600" />
                      <p>
                        {generalSearchQuery.trim()
                          ? hiddenZeroBalanceGeneralStockCount > 0
                            ? "Only zero-balance rows match your search."
                            : "No General stock rows match your search."
                          : showZeroBalanceGeneralStock
                            ? "No General stock rows found."
                            : "No General stock rows with balance found."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead
              className="sticky z-30 bg-default-50 shadow-sm dark:bg-gray-900"
              style={tableHeaderStyle}
            >
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

                    {items.map((material, materialIndex) => {
                      const isNegative = material.closing_quantity < 0;
                      const hasVariants = material.has_variants && material.variants && material.variants.length > 0;
                      const isExpanded = expandedMaterials.has(material.id);
                      const newVariant = newVariantRows.get(material.id);

                      if (hasVariants) {
                        return (
                          <React.Fragment key={material.id}>
                            <tr
                              data-material-row-id={material.id}
                              data-material-category={category}
                              className={clsx(
                                "group bg-purple-50/70 dark:bg-gray-800 cursor-pointer hover:bg-purple-100/70 dark:hover:bg-gray-700/50 border-l-2 border-purple-400 dark:border-purple-700/60",
                                isNegative && "bg-red-50/50 dark:bg-red-900/10 border-red-400 dark:border-red-700/60",
                                draggedRowKey === `material:${material.id}` &&
                                  "opacity-40 ring-1 ring-dashed ring-sky-300 dark:ring-sky-700"
                              )}
                              onClick={() => toggleMaterialExpansion(material.id)}
                            >
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    aria-label={`Move ${material.name}`}
                                    title="Drag to reorder material"
                                    disabled={isSaving || isAnyRowSaving || isDeleting}
                                    onPointerDown={(event) =>
                                      handleMaterialDragPointerDown(
                                        event,
                                        material,
                                        category,
                                        materialIndex
                                      )
                                    }
                                    onPointerMove={handleDragPointerMove}
                                    onPointerUp={handleDragPointerUp}
                                    onPointerCancel={handleDragPointerCancel}
                                    className={clsx(
                                      "flex h-7 w-4 flex-shrink-0 items-center justify-center rounded text-default-400 dark:text-gray-500",
                                      "focus:outline-none focus:ring-1 focus:ring-sky-500",
                                      isSaving || isAnyRowSaving || isDeleting
                                        ? "cursor-not-allowed opacity-40"
                                        : "cursor-grab touch-none hover:bg-purple-100 hover:text-purple-700 active:cursor-grabbing dark:hover:bg-gray-700 dark:hover:text-gray-300"
                                    )}
                                  >
                                    <IconGripVertical size={14} />
                                  </button>
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
                                  <button
                                    type="button"
                                    onClick={(event) => handleDeleteMaterialClick(material, event)}
                                    disabled={isDeleting}
                                    className="p-1 text-default-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                    title="Deactivate material"
                                    aria-label={`Deactivate material ${material.name}`}
                                  >
                                    <IconTrash size={14} />
                                  </button>
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
                                  data-variant-row-id={variant.variant_id || undefined}
                                  data-variant-material-id={
                                    variant.variant_id ? material.id : undefined
                                  }
                                  key={`${material.id}-${variant.variant_id || variant.variant_name}`}
                                  className={clsx(
                                    "group bg-white dark:bg-gray-800 hover:bg-purple-50/50 dark:hover:bg-gray-700/30 border-l-2 border-purple-200 dark:border-purple-900/60",
                                    variantNegative && "bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-900/60",
                                    !isLastVariant && "border-b border-dashed border-default-100 dark:border-gray-700",
                                    draggedRowKey === `variant:${material.id}:${variant.variant_id}` &&
                                      "opacity-40 ring-1 ring-dashed ring-sky-300 dark:ring-sky-700"
                                  )}
                                >
                                  <td className="px-3 py-1.5 pl-12">
                                    <div className="flex items-center gap-1.5">
                                      {variant.variant_id ? (
                                        <button
                                          type="button"
                                          aria-label={`Move ${getVariantDisplayName(variant)}`}
                                          title="Drag to reorder variant"
                                          disabled={isSaving || isAnyRowSaving || isDeleting}
                                          onPointerDown={(event) =>
                                            handleVariantDragPointerDown(
                                              event,
                                              material,
                                              variant,
                                              index
                                            )
                                          }
                                          onPointerMove={handleDragPointerMove}
                                          onPointerUp={handleDragPointerUp}
                                          onPointerCancel={handleDragPointerCancel}
                                          className={clsx(
                                            "flex h-7 w-4 flex-shrink-0 items-center justify-center rounded text-purple-300 dark:text-gray-500",
                                            "focus:outline-none focus:ring-1 focus:ring-sky-500",
                                            isSaving || isAnyRowSaving || isDeleting
                                              ? "cursor-not-allowed opacity-40"
                                              : "cursor-grab touch-none hover:bg-purple-100 hover:text-purple-700 active:cursor-grabbing dark:hover:bg-gray-700 dark:hover:text-gray-300"
                                          )}
                                        >
                                          <IconGripVertical size={14} />
                                        </button>
                                      ) : (
                                        <span className="flex h-7 w-4 items-center justify-center text-purple-300 dark:text-gray-600">
                                          -
                                        </span>
                                      )}
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
                                      {renderRowSaveButton(
                                        variantRowSaveKey(material.id, variant),
                                        isVariantRowDirty(material.id, variant),
                                        (event) => handleSaveVariantRow(material, variant, event),
                                        `Save ${getVariantDisplayName(variant)}`
                                      )}
                                      {variant.variant_id && (
                                        <button
                                          type="button"
                                          onClick={(event) => handleDeleteVariantClick(material, variant, event)}
                                          disabled={isDeleting}
                                          className="p-1 text-default-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                          title="Deactivate variant"
                                          aria-label={`Deactivate variant ${getVariantDisplayName(variant)}`}
                                        >
                                          <IconTrash size={13} />
                                        </button>
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
                                    {renderRowSaveButton(
                                      newVariantRowSaveKey(material.id),
                                      isNewVariantRowDirty(material.id),
                                      (event) => handleSaveNewVariantRow(material, event),
                                      `Save new variant for ${material.name}`
                                    )}
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
                            data-material-row-id={material.id}
                            data-material-category={category}
                            className={clsx(
                              "group hover:bg-default-50 dark:hover:bg-gray-700/30 transition-colors",
                              isNegative && "bg-red-50/50 dark:bg-red-900/10",
                              draggedRowKey === `material:${material.id}` &&
                                "opacity-40 ring-1 ring-dashed ring-sky-300 dark:ring-sky-700"
                            )}
                          >
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  aria-label={`Move ${getMaterialDisplayName(material)}`}
                                  title="Drag to reorder material"
                                  disabled={isSaving || isAnyRowSaving || isDeleting}
                                  onPointerDown={(event) =>
                                    handleMaterialDragPointerDown(
                                      event,
                                      material,
                                      category,
                                      materialIndex
                                    )
                                  }
                                  onPointerMove={handleDragPointerMove}
                                  onPointerUp={handleDragPointerUp}
                                  onPointerCancel={handleDragPointerCancel}
                                  className={clsx(
                                    "flex h-7 w-4 flex-shrink-0 items-center justify-center rounded text-default-400 dark:text-gray-500",
                                    "focus:outline-none focus:ring-1 focus:ring-sky-500",
                                    isSaving || isAnyRowSaving || isDeleting
                                      ? "cursor-not-allowed opacity-40"
                                      : "cursor-grab touch-none hover:bg-default-100 hover:text-default-600 active:cursor-grabbing dark:hover:bg-gray-700 dark:hover:text-gray-300"
                                  )}
                                >
                                  <IconGripVertical size={14} />
                                </button>
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
                                {renderRowSaveButton(
                                  materialRowSaveKey(material.id),
                                  isMaterialRowDirty(material),
                                  (event) => handleSaveMaterialRow(material, event),
                                  `Save ${getMaterialDisplayName(material)}`
                                )}
                                <button
                                  type="button"
                                  onClick={(event) => handleDeleteMaterialClick(material, event)}
                                  disabled={isDeleting}
                                  className="p-1 text-default-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Deactivate material"
                                  aria-label={`Deactivate material ${getMaterialDisplayName(material)}`}
                                >
                                  <IconTrash size={14} />
                                </button>
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
                                  {renderRowSaveButton(
                                    newVariantRowSaveKey(material.id),
                                    isNewVariantRowDirty(material.id),
                                    (event) => handleSaveNewVariantRow(material, event),
                                    `Save new variant for ${getMaterialDisplayName(material)}`
                                  )}
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
                    <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <div className="flex items-center gap-2">
                        <IconBuildingFactory2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                        Stock Kilang
                        <span className="text-emerald-500 dark:text-emerald-400 font-normal">
                          ({stockKilang.length})
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-center text-emerald-600 dark:text-emerald-400">
                      Manual only
                    </td>
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
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-default-700 dark:text-gray-300">
                            {item.name}
                          </span>
                          {renderRowSaveButton(
                            stockKilangRowSaveKey(item.product_id),
                            isStockKilangRowDirty(item),
                            (event) => handleSaveStockKilangRow(item, event),
                            `Save ${item.name}`
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">-</td>
                      <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">-</td>
                      <td className="px-1 py-1 bg-sky-50/20 dark:bg-sky-900/5">
                        {renderAdjustmentInput(
                          item.quantity,
                          (value) => handleStockKilangQuantityChange(item.product_id, value)
                        )}
                      </td>
                      <td className="px-1 py-1">
                        {renderUnitCostInput(
                          item.unit_cost,
                          (value) => handleStockKilangUnitCostChange(item.product_id, value)
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          {formatQty(item.quantity)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          {formatNumber(item.value)}
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

      {dragOverlay && (
        <div
          ref={dragOverlayRef}
          className="fixed z-[1000] flex items-center gap-2 rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm pointer-events-none shadow-2xl ring-2 ring-sky-200 will-change-transform dark:border-sky-700 dark:bg-gray-800 dark:ring-sky-800"
          style={{
            left: dragOverlay.left,
            top: dragOverlay.top,
            width: dragOverlay.width,
            minHeight: dragOverlay.height,
            transform: "translate3d(0, 0, 0)",
          }}
        >
          <div className="flex h-7 w-4 flex-shrink-0 items-center justify-center rounded bg-default-100 text-default-600 dark:bg-gray-700 dark:text-gray-300">
            <IconGripVertical size={14} />
          </div>
          <span className="w-6 flex-shrink-0 text-right text-xs tabular-nums text-default-400 dark:text-gray-500">
            {dragOverlay.index + 1}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-default-900 dark:text-gray-100">
              {dragOverlay.label}
            </div>
            <div className="truncate text-xs text-default-500 dark:text-gray-400">
              {dragOverlay.sublabel}
            </div>
          </div>
        </div>
      )}

      {tooltipState && tooltipRow?.used_adjustments && tooltipRow.used_adjustments.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: tooltipState.y,
            right: window.innerWidth - tooltipState.x,
            zIndex: 9999,
          }}
          className="min-w-44 rounded-lg border border-default-200 bg-white p-2 text-left shadow-lg dark:border-gray-700 dark:bg-gray-900"
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="mb-1 text-xs font-semibold text-default-600 dark:text-gray-300">Used adjustments</div>
          {tooltipRow.used_adjustments.map((adjustment: GeneralStockAdjustment) => (
            <button
              key={adjustment.id}
              type="button"
              disabled={revertingAdjustmentId === adjustment.id}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                setTooltipState(null);
                handleRevertGeneralUsedAdjustment(adjustment);
              }}
              className="mb-1 flex w-full items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40"
              title={`Revert used adjustment from ${adjustment.adjustment_date}`}
            >
              <span>{adjustment.adjustment_date}</span>
              <span>Revert {formatQty(Math.abs(makeNumber(adjustment.adjustment_quantity)))}</span>
            </button>
          ))}
        </div>
      )}

      <GeneralStockCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={generalStockCategories}
        onChanged={fetchData}
      />
      {mode === "material" && (
        <MaterialAccountMappingModal
          isOpen={isAccountMappingModalOpen}
          onClose={() => setIsAccountMappingModalOpen(false)}
          onMappingComplete={fetchData}
        />
      )}
      <ConfirmationDialog
        isOpen={deleteTarget !== null}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleConfirmDeleteTarget}
        title={deleteDialogTitle}
        message={deleteDialogMessage}
        confirmButtonText={isDeleting ? "Deactivating..." : "Deactivate"}
        variant="danger"
      />
    </div>
  );
};

export default StockAdjustmentEntryPage;

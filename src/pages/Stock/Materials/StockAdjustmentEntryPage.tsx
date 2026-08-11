// src/pages/Stock/Materials/StockAdjustmentEntryPage.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
  IconPrinter,
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
import { generateMaterialStockPDF } from "../../../utils/stock/MaterialStockPDFMake";

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

// Where the dragged row lands if it is dropped now. `edge` follows the drag
// direction because moveId() resolves the target index against the list BEFORE
// the dragged row is pulled out: dragging down lands the row AFTER the target,
// dragging up lands it BEFORE.
interface DropTargetState {
  rowKey: string;
  edge: "top" | "bottom";
}

const dropLineClass = (edge: "top" | "bottom"): string =>
  edge === "top"
    ? "!border-t-2 !border-t-sky-500 dark:!border-t-sky-400"
    : "!border-b-2 !border-b-sky-500 dark:!border-b-sky-400";

interface StockAdjustmentEntryPageProps {
  mode: StockEntryMode;
  generalHeaderActions?: React.ReactNode;
}

type DeleteTarget =
  | { type: "material"; material: MaterialWithStock }
  | { type: "variant"; material: MaterialWithStock; variant: StockEntryRow };

type ClosingStockNote = "14-1" | "14-2" | "14-3";

type ClosingStockReferenceKey = "finished_goods" | "raw_materials" | "packing_materials";

interface ClosingStockValuesResponse {
  year: number;
  month: number;
  values: Record<ClosingStockNote, number | null>;
}

interface ClosingStockReferenceResponse {
  year: number;
  month: number;
  finished_goods: number;
  raw_materials: number;
  packing_materials: number;
}

const closingStockFields: {
  note: ClosingStockNote;
  label: string;
  referenceKey: ClosingStockReferenceKey;
}[] = [
  { note: "14-1", label: "Finished Goods (14-1)", referenceKey: "finished_goods" },
  { note: "14-2", label: "Raw Materials (14-2)", referenceKey: "raw_materials" },
  { note: "14-3", label: "Packing Materials (14-3)", referenceKey: "packing_materials" },
];

const emptyClosingStockInputs = (): Record<ClosingStockNote, string> => ({
  "14-1": "",
  "14-2": "",
  "14-3": "",
});

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

// Collapsible sections on the material table: the three material categories
// plus the finished-goods block that follows them.
type StockSectionKey = MaterialCategory | "stock_kilang";

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

const getVariantDisplayName = (variant: StockEntryRow, t?: TFunction): string => {
  return (
    variant.variant_name ||
    variant.custom_description ||
    (t ? t("Unnamed variant") : "Unnamed variant")
  );
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

const materialMatchesSearch = (
  material: MaterialWithStock,
  query: string
): boolean => {
  if (!query) return true;

  const haystack = [
    material.code,
    material.name,
    material.custom_name,
    material.notes,
    ...(material.variants || []).map((variant: StockEntryRow) => variant.variant_name),
    ...(material.variants || []).map((variant: StockEntryRow) => variant.custom_description),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
};

// "Empty" means nothing was counted this month. Unit cost alone does not make a
// row interesting — every row carries a default cost.
const materialHasCount = (material: MaterialWithStock): boolean =>
  material.adjustment_quantity !== 0 ||
  (material.variants || []).some(
    (variant: StockEntryRow) => variant.adjustment_quantity !== 0
  );

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

interface NumericCellInputProps {
  value: number;
  onChange: (value: string) => void;
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void;
  className: string;
  placeholder: string;
  allowNegative: boolean;
}

// The stock rows hold numbers, so a plain controlled input wipes half-typed
// values: "0.005" round-trips through parseFloat as 0 on the first keystroke and
// re-renders as empty. Keep the raw text locally while the field is focused and
// mirror the row value again on blur.
const NumericCellInput: React.FC<NumericCellInputProps> = ({
  value,
  onChange,
  onClick,
  className,
  placeholder,
  allowNegative,
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const pattern: RegExp = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  const text: string = draft ?? (value ? String(value) : "");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const raw: string = event.target.value;
    if (raw !== "" && !pattern.test(raw)) return;

    setDraft(raw);
    onChange(raw);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      onBlur={() => setDraft(null)}
      onClick={onClick}
      className={className}
      placeholder={placeholder}
    />
  );
};

const StockAdjustmentEntryPage: React.FC<StockAdjustmentEntryPageProps> = ({
  mode,
  generalHeaderActions,
}) => {
  const { t } = useTranslation("stock");
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
  const pageTitle = mode === "general" ? t("General Stock") : t("Material Stock");
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
  const [collapsedSections, setCollapsedSections] = useState<Set<StockSectionKey>>(new Set());
  const [materialSearchQuery, setMaterialSearchQuery] = useState<string>("");
  const [showEmptyMaterialRows, setShowEmptyMaterialRows] = useState<boolean>(true);
  const [showRunningBalance, setShowRunningBalance] = useState<boolean>(false);
  const [isClosingStockOpen, setIsClosingStockOpen] = useState<boolean>(false);
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
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [closingStockInputs, setClosingStockInputs] = useState<Record<ClosingStockNote, string>>(
    emptyClosingStockInputs
  );
  const [closingStockReference, setClosingStockReference] =
    useState<ClosingStockReferenceResponse | null>(null);
  const [isSavingClosingStock, setIsSavingClosingStock] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
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
  const stockKilangProductType = activeTab === "bihun" ? "BH" : "MEE";
  const {
    products,
    isLoading: isLoadingProducts,
    refreshProducts,
  } = useProductsCache(productType);
  const stockKilangRequestRef = useRef<number>(0);
  // Unsaved Stock Kilang edits carried across a forced product-list refresh. The
  // key pins them to the tab and month they were keyed on.
  const pendingStockKilangRef = useRef<{
    key: string;
    items: Map<string, StockKilangItem>;
  } | null>(null);

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
        toast.error(t("Failed to load general stock"));
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
      toast.error(t("Failed to load materials data"));
      setMaterials([]);
      setOriginalMaterials([]);
    } finally {
      setIsLoading(false);
    }
  }, [year, month, activeTab, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchStockKilang = useCallback(async (): Promise<void> => {
    if (activeTab === "general" || activeTab === "shared" || products.length === 0 || isLoadingProducts) {
      setStockKilang([]);
      setOriginalStockKilang([]);
      return;
    }

    // The cached product list is filtered one render AFTER the tab changes, so
    // right after a switch it still holds the other product line. Keep only this
    // tab's products: a row of the wrong type would be rejected by the backend
    // when the page is saved.
    const lineProducts = products.filter(
      (product) => product.type === stockKilangProductType
    );
    if (lineProducts.length === 0) return;

    const requestId: number = ++stockKilangRequestRef.current;
    setIsLoadingStockKilang(true);
    try {
      const response = await api.get<StockKilangResponse>(
        `/api/materials/stock-kilang?year=${year}&month=${month}&product_line=${activeTab}`
      );
      if (requestId !== stockKilangRequestRef.current) return;
      const entryMap: Map<string, StockKilangEntryRow> = new Map(
        (response.entries || []).map(
          (entry: StockKilangEntryRow): [string, StockKilangEntryRow] => [
            entry.product_id,
            entry,
          ]
        )
      );

      const stockData: StockKilangItem[] = lineProducts.map((product) => {
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

      // The server rows are the saved truth; edits kept from a refreshed product
      // list are re-applied on top and stay marked unsaved.
      const carried = pendingStockKilangRef.current;
      pendingStockKilangRef.current = null;
      const pendingEdits: Map<string, StockKilangItem> | null =
        carried && carried.key === `${activeTab}-${year}-${month}` ? carried.items : null;

      setOriginalStockKilang(stockData.map((item: StockKilangItem) => ({ ...item })));
      setStockKilang(
        pendingEdits
          ? stockData.map((item: StockKilangItem): StockKilangItem => {
              const pending: StockKilangItem | undefined = pendingEdits.get(
                item.product_id
              );
              return pending
                ? {
                    ...item,
                    quantity: pending.quantity,
                    unit_cost: pending.unit_cost,
                    value: pending.quantity * pending.unit_cost,
                  }
                : item;
            })
          : stockData
      );
    } catch (error: unknown) {
      console.error("Error fetching stock kilang:", error);
      if (requestId !== stockKilangRequestRef.current) return;
      setStockKilang([]);
      setOriginalStockKilang([]);
    } finally {
      if (requestId === stockKilangRequestRef.current) {
        setIsLoadingStockKilang(false);
      }
    }
  }, [activeTab, stockKilangProductType, products, isLoadingProducts, year, month]);

  useEffect(() => {
    fetchStockKilang();
  }, [fetchStockKilang]);

  // Confirmed month-end closing-stock values for the financial statements are
  // company-wide, so they load once per month regardless of the active tab.
  useEffect(() => {
    if (mode !== "material") return;

    let cancelled = false;

    const fetchClosingStockValues = async (): Promise<void> => {
      try {
        const response = await api.get<ClosingStockValuesResponse>(
          `/api/financial-reports/closing-stock/${year}/${month}`
        );
        if (cancelled) return;

        const nextInputs: Record<ClosingStockNote, string> = emptyClosingStockInputs();
        closingStockFields.forEach((field) => {
          const value: number | null = response.values?.[field.note] ?? null;
          nextInputs[field.note] = value === null ? "" : String(value);
        });
        setClosingStockInputs(nextInputs);
      } catch (error: unknown) {
        if (cancelled) return;
        console.error("Error fetching closing stock values:", error);
        toast.error(t("Failed to load closing stock values"));
        setClosingStockInputs(emptyClosingStockInputs());
      }
    };

    const fetchClosingStockReference = async (): Promise<void> => {
      try {
        const response = await api.get<ClosingStockReferenceResponse>(
          `/api/materials/closing-stock-reference?year=${year}&month=${month}`
        );
        if (cancelled) return;
        setClosingStockReference(response);
      } catch (error: unknown) {
        if (cancelled) return;
        // The reference chips are informational only — hide them on failure.
        console.error("Error fetching closing stock reference:", error);
        setClosingStockReference(null);
      }
    };

    fetchClosingStockValues();
    fetchClosingStockReference();

    return (): void => {
      cancelled = true;
    };
  }, [mode, year, month, t]);

  const handleSaveClosingStock = async (): Promise<void> => {
    setIsSavingClosingStock(true);
    try {
      const values: Record<ClosingStockNote, number> = {
        "14-1": makeNumber(closingStockInputs["14-1"]),
        "14-2": makeNumber(closingStockInputs["14-2"]),
        "14-3": makeNumber(closingStockInputs["14-3"]),
      };

      await api.put(`/api/financial-reports/closing-stock/${year}/${month}`, { values });
      toast.success(t("Closing stock values saved"));
    } catch (error: unknown) {
      console.error("Error saving closing stock values:", error);
      toast.error(
        error instanceof Error ? error.message : t("Failed to save closing stock values")
      );
    } finally {
      setIsSavingClosingStock(false);
    }
  };

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
      toast.error(t("Only registered variants can be deactivated from this page"));
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
        toast.success(
          t('Variant "{{name}}" deactivated', {
            name: getVariantDisplayName(deleteTarget.variant, t),
          })
        );
      } else {
        await api.delete(`/api/materials/${deleteTarget.material.id}`);
        toast.success(
          t('Material "{{name}}" deactivated', {
            name: getMaterialDisplayName(deleteTarget.material),
          })
        );
      }

      setDeleteTarget(null);
      await fetchData();
    } catch (error: unknown) {
      console.error("Error deactivating material stock item:", error);
      toast.error(error instanceof Error ? error.message : t("Failed to deactivate item"));
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
      return window.confirm(t("You have unsaved changes. Do you want to discard them?"));
    }
    return true;
  }, [hasUnsavedChanges, t]);

  const handleTabChange = (tab: StockEntryTab): void => {
    if (!availableTabs.includes(tab)) return;
    if (tab === activeTab) return;
    if (hasUnsavedChanges && !window.confirm(t("You have unsaved changes. Do you want to discard them?"))) {
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
      toast.success(t("General stock category added"));
    } catch (error: unknown) {
      console.error("Error adding general stock category:", error);
      toast.error(error instanceof Error ? error.message : t("Failed to add category"));
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
      toast.success(t("General stock adjustments saved"));
      await fetchData();
    } catch (error: unknown) {
      console.error("Error saving general stock adjustments:", error);
      toast.error(error instanceof Error ? error.message : t("Failed to save general stock adjustments"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevertGeneralUsedAdjustment = async (
    adjustment: GeneralStockAdjustment,
    event?: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event?.stopPropagation();
    if (
      !window.confirm(
        t("Revert used quantity {{quantity}}?", {
          quantity: formatQty(Math.abs(makeNumber(adjustment.adjustment_quantity))),
        })
      )
    ) {
      return;
    }

    setRevertingAdjustmentId(adjustment.id);
    try {
      await api.delete(`/api/general-purchases/general-stock/adjustments/${adjustment.id}`);
      toast.success(t("Used adjustment reverted"));
      await fetchData();
    } catch (error: unknown) {
      console.error("Error reverting used adjustment:", error);
      toast.error(error instanceof Error ? error.message : t("Failed to revert used adjustment"));
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
      t("Warning: {{label}} has negative calculated closing stock. Do you want to save anyway?", {
        label,
      })
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
      toast.success(t("{{name}} saved", { name: material.name }));
    } catch (error: unknown) {
      console.error("Error saving material row:", error);
      toast.error(error instanceof Error ? error.message : t("Failed to save material"));
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
        `${material.name} ${getVariantDisplayName(variant, t)}`,
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
      toast.success(t("{{name}} saved", { name: getVariantDisplayName(nextVariant, t) }));
    } catch (error: unknown) {
      console.error("Error saving variant row:", error);
      toast.error(error instanceof Error ? error.message : t("Failed to save variant"));
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
      toast.error(t("Please enter a name for the new variant in {{name}}", { name: material.name }));
      return;
    }

    if (
      material.variants?.some(
        (variant: StockEntryRow): boolean =>
          variant.variant_name?.trim().toLowerCase() === variantName.toLowerCase()
      )
    ) {
      toast.error(
        t('Variant "{{variant}}" already exists for {{name}}', {
          variant: variantName,
          name: material.name,
        })
      );
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
      toast.success(t('Variant "{{name}}" saved', { name: registeredVariant.variant_name }));
    } catch (error: unknown) {
      console.error("Error saving new variant row:", error);
      toast.error(error instanceof Error ? error.message : t("Failed to save new variant"));
    } finally {
      setRowSaving(rowKey, false);
    }
  };

  // A rejected product id means this browser's cached product list is stale (the
  // product was changed or removed on another machine), so pull a fresh list -
  // fetchStockKilang then rebuilds the table without the offending row.
  const refreshProductsAfterMismatch = async (error: unknown): Promise<void> => {
    const code: string | undefined = (error as { data?: { code?: string } })?.data?.code;
    if (code !== "STOCK_KILANG_PRODUCT_MISMATCH") return;

    // Only the rejected row is dropped by the refresh; everything the user keyed
    // is carried over so a whole column does not have to be typed again.
    pendingStockKilangRef.current = {
      key: `${activeTab}-${year}-${month}`,
      items: new Map(
        stockKilang
          .filter((item: StockKilangItem) => isStockKilangRowDirty(item))
          .map((item: StockKilangItem): [string, StockKilangItem] => [
            item.product_id,
            { ...item },
          ])
      ),
    };

    try {
      await refreshProducts();
    } catch (refreshError: unknown) {
      console.error("Error refreshing products:", refreshError);
      pendingStockKilangRef.current = null;
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
      toast.success(t("{{name}} saved", { name: item.name }));
    } catch (error: unknown) {
      console.error("Error saving Stock Kilang row:", error);
      toast.error(
        error instanceof Error ? error.message : t("Failed to save Stock Kilang row")
      );
      await refreshProductsAfterMismatch(error);
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
        t(
          negativeCount === 1
            ? "Warning: {{count}} item has negative calculated closing stock. Do you want to save anyway?"
            : "Warning: {{count}} items have negative calculated closing stock. Do you want to save anyway?",
          { count: negativeCount }
        )
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
        incompleteNewVariants.push(
          material?.name || t("Material {{id}}", { id: materialId })
        );
      }
    });

    if (incompleteNewVariants.length > 0) {
      toast.error(
        t("Please enter a name for new variants in: {{names}}", {
          names: incompleteNewVariants.join(", "),
        })
      );
      return;
    }

    // Tracks whether the material half of the page has already been written, so a
    // later failure can say what did and did not save.
    let materialWritesDone = false;

    setIsSaving(true);
    try {
      // Send every row (including zero-quantity price overrides); the backend
      // keeps only rows with a quantity or a non-default unit cost.
      const stockKilangEntries: StockKilangSaveEntry[] = hasStockKilangUnsavedChanges
        ? stockKilang.map((item: StockKilangItem) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
          }))
        : [];

      // The two halves of this page are saved through separate endpoints, so the
      // Stock Kilang products are checked BEFORE anything is written - otherwise
      // a rejected table would leave the material rows above already saved.
      if (stockKilangEntries.length > 0) {
        await api.post("/api/materials/stock-kilang/batch", {
          year,
          month,
          product_line: activeTab,
          entries: stockKilangEntries,
          validate_only: true,
        });
      }

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
        materialWritesDone = true;
      }

      // Only modified rows are sent. /stock/batch upserts or deletes each entry by
      // its own conflict key and ignores rows that are absent, so untouched rows do
      // not need to travel (unlike the Stock Kilang batch below).
      const entries: MaterialStockEntryInput[] = [];

      materials.forEach((material) => {
        if (material.has_variants && material.variants && material.variants.length > 0) {
          material.variants.forEach((variant) => {
            if (!isVariantRowDirty(material.id, variant)) return;

            const originalVariant: StockEntryRow | null = findOriginalVariant(
              material.id,
              variant
            );
            entries.push(
              ...makeVariantStockEntries(material.id, variant, originalVariant)
            );
          });
        } else if (isMaterialRowDirty(material)) {
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

      const response: MaterialStockBatchResponse =
        entries.length > 0 ? await saveMaterialStockEntries(entries) : {};
      if (entries.length > 0) materialWritesDone = true;
      let stockKilangSaved = false;

      if (stockKilangEntries.length > 0) {
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
        messages.push(
          t(
            variantNameUpdates.length === 1
              ? "{{count}} variant name updated"
              : "{{count}} variant names updated",
            { count: variantNameUpdates.length }
          )
        );
      }
      if (response.registered_variants && response.registered_variants.length > 0) {
        messages.push(
          t(
            response.registered_variants.length === 1
              ? "{{count}} new variant registered"
              : "{{count}} new variants registered",
            { count: response.registered_variants.length }
          )
        );
      }
      if (stockKilangSaved) {
        messages.push(t("Stock Kilang updated"));
      }

      toast.success(
        messages.length > 0
          ? t("Saved. {{details}}.", { details: messages.join(", ") })
          : t("Stock adjustments saved")
      );
      await fetchData();
      await fetchStockKilang();
    } catch (error: unknown) {
      console.error("Error saving stock entries:", error);
      const message =
        error instanceof Error ? error.message : t("Failed to save stock adjustments");
      toast.error(
        materialWritesDone
          ? t("{{message}} The material rows above WERE saved.", { message })
          : t("{{message}} Nothing was saved.", { message })
      );
      await refreshProductsAfterMismatch(error);
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

  // Called from the drag rAF loop, so it must not re-render when the drop
  // position has not actually moved.
  const setDropTargetIfChanged = (next: DropTargetState | null): void => {
    setDropTarget((current: DropTargetState | null) => {
      if (current === null && next === null) return current;
      if (
        current &&
        next &&
        current.rowKey === next.rowKey &&
        current.edge === next.edge
      ) {
        return current;
      }
      return next;
    });
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
          setDropTargetIfChanged(null);
          return;
        }

        dragState.lastTargetId = targetMaterialId;
        setDropTargetIfChanged({
          rowKey: `material:${targetMaterialId}`,
          edge:
            dragState.currentOrderIds.indexOf(targetMaterialId) >
            dragState.currentOrderIds.indexOf(dragState.materialId)
              ? "bottom"
              : "top",
        });
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
        setDropTargetIfChanged(null);
        return;
      }

      dragState.lastTargetId = targetVariantId;
      setDropTargetIfChanged({
        rowKey: `variant:${dragState.materialId}:${targetVariantId}`,
        edge:
          dragState.currentOrderIds.indexOf(targetVariantId) >
          dragState.currentOrderIds.indexOf(dragState.variantId)
            ? "bottom"
            : "top",
      });
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
      label: getVariantDisplayName(variant, t),
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
    setDropTarget(null);
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
        toast.error(t("Failed to save material order"));
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
      toast.error(t("Failed to save variant order"));
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
    setDropTarget(null);
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

  const formatUnitCost = (value: number): string => {
    return value.toLocaleString("en-MY", {
      minimumFractionDigits: 2,
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

  const isMaterialFilterActive: boolean =
    materialSearchQuery.trim() !== "" || !showEmptyMaterialRows;

  // Filtering only affects which rows are DRAWN. Section headers and the footer
  // keep reporting the full month, so a filter can never change a total.
  const visibleMaterialsByCategory = useMemo<Record<MaterialCategory, MaterialWithStock[]>>(() => {
    const query: string = materialSearchQuery.trim().toLowerCase();
    const visible: Record<MaterialCategory, MaterialWithStock[]> = {
      ingredient: [],
      raw_material: [],
      packing_material: [],
    };

    categoryOrder.forEach((category: MaterialCategory) => {
      visible[category] = groupedMaterials[category].filter(
        (material: MaterialWithStock) => {
          if (!materialMatchesSearch(material, query)) return false;
          if (showEmptyMaterialRows || materialHasCount(material)) return true;

          // A row being edited must never disappear from under the cursor —
          // clearing a quantity back to 0 would otherwise hide it mid-keystroke.
          const hasVariants: boolean = Boolean(
            material.has_variants && material.variants && material.variants.length > 0
          );
          return hasVariants
            ? (material.variants || []).some((variant: StockEntryRow) =>
                isVariantRowDirty(material.id, variant)
              ) || isNewVariantRowDirty(material.id)
            : isMaterialRowDirty(material) || isNewVariantRowDirty(material.id);
        }
      );
    });

    return visible;
  }, [
    groupedMaterials,
    materialSearchQuery,
    showEmptyMaterialRows,
    isMaterialRowDirty,
    isVariantRowDirty,
    isNewVariantRowDirty,
  ]);

  const hiddenMaterialCount = useMemo<number>(
    () =>
      categoryOrder.reduce(
        (sum: number, category: MaterialCategory) =>
          sum +
          (groupedMaterials[category].length - visibleMaterialsByCategory[category].length),
        0
      ),
    [groupedMaterials, visibleMaterialsByCategory]
  );

  const materialColumnCount: number = showRunningBalance ? 7 : 4;

  // Reordering writes the order of the rows as drawn, so it cannot be trusted
  // while rows are filtered out of the list.
  const isMaterialDragDisabled: boolean =
    isSaving || isAnyRowSaving || isDeleting || isMaterialFilterActive;

  const toggleSection = (section: StockSectionKey): void => {
    setCollapsedSections((previous: Set<StockSectionKey>) => {
      const next = new Set(previous);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Rows with unsaved edits stay countable while their section is collapsed, so
  // hiding a section can never hide pending work.
  const unsavedCountBySection = useMemo<Record<StockSectionKey, number>>(() => {
    const counts: Record<StockSectionKey, number> = {
      ingredient: 0,
      raw_material: 0,
      packing_material: 0,
      stock_kilang: 0,
    };

    materials.forEach((material: MaterialWithStock) => {
      if (counts[material.category] === undefined) return;

      const hasVariants: boolean = Boolean(
        material.has_variants && material.variants && material.variants.length > 0
      );
      const isDirty: boolean = hasVariants
        ? (material.variants || []).some((variant: StockEntryRow) =>
            isVariantRowDirty(material.id, variant)
          ) || isNewVariantRowDirty(material.id)
        : isMaterialRowDirty(material) || isNewVariantRowDirty(material.id);

      if (isDirty) counts[material.category] += 1;
    });

    stockKilang.forEach((item: StockKilangItem) => {
      if (isStockKilangRowDirty(item)) counts.stock_kilang += 1;
    });

    return counts;
  }, [
    materials,
    stockKilang,
    isMaterialRowDirty,
    isVariantRowDirty,
    isNewVariantRowDirty,
    isStockKilangRowDirty,
  ]);

  const negativeCount = useMemo<number>(() => {
    const materialNegativeCount: number = materials.filter(
      (material: MaterialWithStock) => material.closing_quantity < 0
    ).length;
    const stockKilangNegativeCount: number = stockKilang.filter(
      (item: StockKilangItem) => item.quantity < 0
    ).length;

    return materialNegativeCount + stockKilangNegativeCount;
  }, [materials, stockKilang]);

  // Prints the active tab + month as currently displayed (including unsaved
  // edits); the Running Balance toggle picks the PDF layout and the
  // show/hide empty rows checkbox decides whether zero-count rows print.
  const handlePrint = async (): Promise<void> => {
    if (activeTab === "general") return;

    setIsPrinting(true);
    try {
      await generateMaterialStockPDF({
        productLine: activeTab,
        year,
        month,
        showRunningBalance,
        hideEmptyRows: !showEmptyMaterialRows,
        materials,
        stockKilang,
      });
    } catch (error: unknown) {
      console.error("Error generating material stock PDF:", error);
      toast.error(t("Failed to generate PDF"));
    } finally {
      setIsPrinting(false);
    }
  };

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
        title={isSavingRow ? t("Saving...") : label}
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
    <NumericCellInput
      value={value}
      onChange={onChange}
      onClick={onClick}
      className="w-full px-2 py-1 text-right font-mono text-sm border border-sky-200 dark:border-sky-800 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
      placeholder="0"
      allowNegative={true}
    />
  );

  const renderUnitCostInput = (
    value: number,
    onChange: (value: string) => void,
    onClick?: (event: React.MouseEvent<HTMLInputElement>) => void
  ): React.ReactNode => (
    <NumericCellInput
      value={value}
      onChange={onChange}
      onClick={onClick}
      className="w-full px-2 py-1 text-right font-mono text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
      placeholder="0.00"
      allowNegative={false}
    />
  );

  const renderAdjustmentValue = (
    value: number,
    title: string,
    emphasized: boolean = false
  ): React.ReactNode => (
    <span
      className={clsx(
        "font-mono text-sm",
        emphasized ? "font-bold" : "font-medium",
        value < 0
          ? "text-red-600 dark:text-red-400"
          : value > 0
            ? "text-sky-600 dark:text-sky-400"
            : "text-default-400 dark:text-gray-500"
      )}
      title={title}
    >
      {formatNumber(value)}
    </span>
  );

  const deleteTargetName: string =
    deleteTarget?.type === "variant"
      ? getVariantDisplayName(deleteTarget.variant, t)
      : deleteTarget
        ? getMaterialDisplayName(deleteTarget.material)
        : "";

  const deleteDialogTitle: string =
    deleteTarget?.type === "variant" ? t("Deactivate Variant") : t("Deactivate Material");

  const deleteDialogMessage: string = deleteTarget
    ? deleteTarget.type === "variant"
      ? t(
          'Deactivate variant "{{name}}" from {{material}}? It will be hidden from stock entry and purchases, but existing stock history stays unchanged.',
          { name: deleteTargetName, material: deleteTarget.material.name },
        ) +
        (hasUnsavedChanges
          ? " " + t("Unsaved edits on this page will be discarded when it reloads.")
          : "")
      : t(
          'Deactivate material "{{name}}"? It will be hidden from stock entry and purchases, but existing stock history stays unchanged.',
          { name: deleteTargetName },
        ) +
        (hasUnsavedChanges
          ? " " + t("Unsaved edits on this page will be discarded when it reloads.")
          : "")
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
                  ? t("{{count}} general items", { count: filteredGeneralStockRows.length })
                  : t("{{count}} materials", { count: materials.length })}
              </span>
              {activeTab === "general" ? (
                <>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                    {t("Stock:")} <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatQty(generalStockTotal)}</span>
                  </span>
                </>
              ) : (
                <>
                  {grandTotal.purchases !== 0 && (
                    <>
                      <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                      <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                        {t("Purchases:")} <span className="font-medium text-blue-600 dark:text-blue-400">RM {formatNumber(grandTotal.purchases)}</span>
                      </span>
                    </>
                  )}
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                    {t("Stock count:")} <span className="font-medium text-sky-600 dark:text-sky-400">RM {formatNumber(grandTotal.adjustments)}</span>
                  </span>
                  {showRunningBalance && (
                    <>
                      <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                      <span
                        className="whitespace-nowrap text-default-500 dark:text-gray-400"
                        title={t("Running balance — includes earlier months, not this month's count")}
                      >
                        {t("Closing:")} <span className="font-medium text-green-600 dark:text-green-400">RM {formatNumber(grandTotal.closing)}</span>
                      </span>
                    </>
                  )}
                </>
              )}
              {stockKilang.length > 0 && (
                <>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="whitespace-nowrap text-default-500 dark:text-gray-400">
                    {t("FG:")} <span className="font-medium text-emerald-600 dark:text-emerald-400">RM {formatNumber(stockKilangTotal)}</span>
                  </span>
                </>
              )}
              {activeTab !== "general" && (materials.length > 0 || stockKilang.length > 0) && (
                <>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span
                    className="whitespace-nowrap text-default-500 dark:text-gray-400"
                    title={t("Grand Total = this month's stock count value + Stock Kilang")}
                  >
                    {t("Total:")} <span className="font-semibold text-default-800 dark:text-gray-100">RM {formatNumber(grandTotal.adjustments + stockKilangTotal)}</span>
                  </span>
                </>
              )}
              {negativeCount > 0 && (
                <>
                  <span className="hidden text-default-300 dark:text-gray-600 sm:inline">|</span>
                  <span className="flex items-center gap-1 whitespace-nowrap text-red-500">
                    <IconAlertTriangle size={14} />
                    {t("{{count}} negative", { count: negativeCount })}
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

            {mode === "material" && activeTab !== "general" && (
              <Button
                color="default"
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={
                  isPrinting ||
                  isLoading ||
                  (activeTab !== "shared" && isLoadingStockKilang)
                }
                icon={IconPrinter}
                title={t("Print this tab's stock for the selected month as a PDF")}
              >
                {isPrinting ? t("Preparing...") : t("Print")}
              </Button>
            )}

            {mode === "material" && (
              <Button
                color="default"
                variant="outline"
                size="sm"
                onClick={() => setIsAccountMappingModalOpen(true)}
                icon={IconSettings}
              >
                {t("Mappings")}
              </Button>
            )}

            <Button
              color="sky"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              icon={IconDeviceFloppy}
            >
              {isSaving ? t("Saving...") : t("Save")}
            </Button>

            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {t("Unsaved")}
              </span>
            )}
          </div>
        </div>
      </div>

      {mode === "material" && (
        <div className="rounded-lg border border-default-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => setIsClosingStockOpen((open: boolean) => !open)}
            aria-expanded={isClosingStockOpen}
            className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded px-2 py-0.5 text-left transition-colors hover:bg-default-50 dark:hover:bg-gray-700/40"
          >
            {isClosingStockOpen ? (
              <IconChevronDown size={16} className="shrink-0 text-default-500" />
            ) : (
              <IconChevronRight size={16} className="shrink-0 text-default-500" />
            )}
            <h2 className="text-sm font-semibold text-default-700 dark:text-gray-200">
              {t("Closing Stock (Financial Statements)")}
            </h2>
            {!isClosingStockOpen && (
              <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-default-500 dark:text-gray-400">
                {closingStockFields.map((field) => {
                  const keyed: number = Number(closingStockInputs[field.note]);
                  const hasValue: boolean =
                    closingStockInputs[field.note]?.trim() !== "" && Number.isFinite(keyed);

                  return (
                    <span key={field.note} className="whitespace-nowrap">
                      {t(field.label)}:{" "}
                      <span className="font-mono tabular-nums text-default-700 dark:text-gray-200">
                        {hasValue ? `RM ${formatNumber(keyed)}` : t("not keyed")}
                      </span>
                    </span>
                  );
                })}
              </span>
            )}
          </button>

          {isClosingStockOpen && (
          <div className="mt-1.5 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 max-w-xl pl-6">
              <p className="text-xs text-default-500 dark:text-gray-400">
                {t(
                  "Confirmed month-end values injected into the Balance Sheet, Income Statement and CoGM for this month. Reference totals come from this page's stock data.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {closingStockFields.map((field) => (
                <div key={field.note} className="w-44">
                  <label className="mb-1 block text-xs font-medium text-default-600 dark:text-gray-300">
                    {t(field.label)}
                  </label>
                  <input
                    type="number"
                    value={closingStockInputs[field.note]}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setClosingStockInputs(
                        (prev: Record<ClosingStockNote, string>): Record<ClosingStockNote, string> => ({
                          ...prev,
                          [field.note]: event.target.value,
                        })
                      )
                    }
                    className="w-full px-2 py-1 text-right font-mono text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  />
                  {closingStockReference && (
                    <button
                      type="button"
                      onClick={() =>
                        setClosingStockInputs(
                          (prev: Record<ClosingStockNote, string>): Record<ClosingStockNote, string> => ({
                            ...prev,
                            [field.note]: closingStockReference[field.referenceKey].toFixed(2),
                          })
                        )
                      }
                      title={t("Click to use this value")}
                      className="mt-1 inline-flex items-center rounded-full bg-default-100 px-2 py-0.5 text-xs text-default-500 transition-colors hover:bg-sky-100 hover:text-sky-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-sky-900/40 dark:hover:text-sky-300"
                    >
                      {t("Page total: RM {{amount}}", {
                        amount: formatNumber(closingStockReference[field.referenceKey]),
                      })}
                    </button>
                  )}
                </div>
              ))}
              <Button
                color="sky"
                size="sm"
                onClick={handleSaveClosingStock}
                disabled={isSavingClosingStock}
                icon={IconDeviceFloppy}
              >
                {isSavingClosingStock ? t("Saving...") : t("Save")}
              </Button>
            </div>
          </div>
          )}
        </div>
      )}

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
                      {t("Categories")}
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
                    {t("Manage")}
                  </Button>
                </div>
            {generalStockCategories.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="flex min-h-16 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-default-300 px-3 py-3 text-sm text-default-500 transition-colors hover:border-sky-400 hover:text-sky-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-sky-500 dark:hover:text-sky-300"
              >
                <IconPlus size={16} />
                {t("No categories yet — add your first one")}
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {generalStockCategories.map((category: GeneralStockCategory) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setIsCategoryModalOpen(true)}
                    title={t("Manage categories")}
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
                    placeholder={t("New category")}
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
                    {t("Add")}
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
                placeholder={t("Search category, item, supplier...")}
                className="h-9 w-full rounded-lg border border-default-300 bg-white pl-9 pr-9 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
              />
              {generalSearchQuery && (
                <button
                  type="button"
                  onClick={() => setGeneralSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-default-400 hover:bg-default-100 hover:text-default-700 dark:text-gray-500 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                  title={t("Clear search")}
                  aria-label={t("Clear search")}
                >
                  <IconX size={14} />
                </button>
              )}
              </div>

              <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-default-200 bg-white px-2.5 text-sm text-default-600 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {!showZeroBalanceGeneralStock && hiddenZeroBalanceGeneralStockCount > 0 && (
                <span className="border-r border-default-200 pr-2 text-xs text-default-400 dark:border-gray-700 dark:text-gray-500">
                  {t("{{count}} hidden", { count: hiddenZeroBalanceGeneralStockCount })}
                </span>
              )}
              <Checkbox
                checked={showZeroBalanceGeneralStock}
                onChange={setShowZeroBalanceGeneralStock}
                size={18}
                checkedColor="text-indigo-600 dark:text-indigo-400"
                uncheckedColor="text-default-400 dark:text-gray-500"
                label={t("Show zero balance")}
                buttonClassName="rounded"
                ariaLabel={t("Show zero balance general stock items")}
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
                    {t("Purchase")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    {t("Supplier / Description")}
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    {t("Source Qty")}
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    {t("Added")}
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    {t("Used")}
                  </th>
                  <th className="w-28 px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                    {t("Adjustment")}
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    {t("Current")}
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
                            title={t("Open source general purchase")}
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
                            ? t("Only zero-balance rows match your search.")
                            : t("No General stock rows match your search.")
                          : showZeroBalanceGeneralStock
                            ? t("No General stock rows found.")
                            : t("No General stock rows with balance found.")}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
        <div className="rounded-lg border border-default-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full max-w-sm">
              <IconSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
              />
              <input
                type="text"
                value={materialSearchQuery}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setMaterialSearchQuery(event.target.value)
                }
                placeholder={t("Search material, code, variant...")}
                className="h-9 w-full rounded-lg border border-default-300 bg-white pl-9 pr-9 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
              />
              {materialSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMaterialSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-default-400 hover:bg-default-100 hover:text-default-700 dark:text-gray-500 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                  title={t("Clear search")}
                  aria-label={t("Clear search")}
                >
                  <IconX size={14} />
                </button>
              )}
            </div>

            <div className="inline-flex h-9 items-center gap-3 rounded-lg border border-default-200 bg-white px-2.5 text-sm text-default-600 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {hiddenMaterialCount > 0 && (
                <span className="border-r border-default-200 pr-3 text-xs text-default-400 dark:border-gray-700 dark:text-gray-500">
                  {t("{{count}} hidden", { count: hiddenMaterialCount })}
                </span>
              )}
              <Checkbox
                checked={showEmptyMaterialRows}
                onChange={setShowEmptyMaterialRows}
                size={18}
                checkedColor="text-sky-600 dark:text-sky-400"
                uncheckedColor="text-default-400 dark:text-gray-500"
                label={t("Show empty rows")}
                buttonClassName="rounded"
                ariaLabel={t("Show materials with no stock count this month")}
              />
              <Checkbox
                checked={showRunningBalance}
                onChange={setShowRunningBalance}
                size={18}
                checkedColor="text-sky-600 dark:text-sky-400"
                uncheckedColor="text-default-400 dark:text-gray-500"
                label={t("Show running balance")}
                buttonClassName="rounded"
                ariaLabel={t("Show the cumulative Opening and Closing columns")}
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead
              className="sticky z-30 bg-default-50 shadow-sm dark:bg-gray-900"
              style={tableHeaderStyle}
            >
              <tr>
                <th
                  rowSpan={2}
                  className="border-b border-default-200/70 px-3 py-2 text-left align-middle text-xs font-medium text-default-600 dark:border-gray-700 dark:text-gray-400 uppercase tracking-wider"
                >
                  <div className="flex items-center gap-2">
                    <span>{t("Material")}</span>
                    {variantMaterialCount > 0 && (
                      <button
                        onClick={toggleAllExpansion}
                        className="text-purple-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-gray-200 text-[10px] font-normal normal-case flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 dark:bg-gray-700 rounded"
                        title={allCollapsed ? t("Expand all variants") : t("Collapse all variants")}
                      >
                        {allCollapsed ? <IconChevronRight size={10} /> : <IconChevronDown size={10} />}
                        {allCollapsed ? t("Expand") : t("Collapse")}
                      </button>
                    )}
                  </div>
                </th>
                {showRunningBalance && (
                  <th
                    className="border-b border-l border-default-300 px-2 pb-1 pt-2 text-center text-xs font-semibold text-default-600 dark:border-gray-600 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {t("Opening")}
                  </th>
                )}
                <th
                  colSpan={3}
                  className="border-b border-l border-sky-200 bg-sky-50 px-2 pb-1 pt-2 text-center text-xs font-semibold text-sky-600 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-400 uppercase tracking-wider"
                >
                  {t("Stock Count")}
                </th>
                {showRunningBalance && (
                  <th
                    colSpan={2}
                    className="border-b border-l border-default-300 px-2 pb-1 pt-2 text-center text-xs font-semibold text-default-600 dark:border-gray-600 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {t("Closing")}
                  </th>
                )}
              </tr>
              <tr>
                {showRunningBalance && (
                  <th className="w-24 border-l border-default-300 px-2 pb-2 pt-1 text-right text-[11px] font-medium text-default-500 dark:border-gray-600 dark:text-gray-500 uppercase tracking-wider">
                    {t("Qty")}
                  </th>
                )}
                <th className="w-24 border-l border-sky-200 bg-sky-50 px-2 pb-2 pt-1 text-right text-[11px] font-medium text-sky-600 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-400 uppercase tracking-wider">
                  {t("Unit Cost")}
                </th>
                <th className="w-28 bg-sky-50 px-2 pb-2 pt-1 text-center text-[11px] font-medium text-sky-600 dark:bg-sky-900/20 dark:text-sky-400 uppercase tracking-wider">
                  {t("Qty")}
                </th>
                <th
                  className="w-28 bg-sky-50 px-2 pb-2 pt-1 text-right text-[11px] font-medium text-sky-600 dark:bg-sky-900/20 dark:text-sky-400 uppercase tracking-wider"
                  title={t("Stock Count Value = Qty × Unit Cost")}
                >
                  <span className="block">{t("Value")}</span>
                  <span className="block text-[10px] font-normal normal-case tracking-normal">
                    Qty × Unit Cost
                  </span>
                </th>
                {showRunningBalance && (
                  <th className="w-28 whitespace-nowrap border-l border-default-300 px-2 pb-2 pt-1 text-right text-[11px] font-medium text-default-500 dark:border-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    {t("Qty")}
                  </th>
                )}
                {showRunningBalance && (
                <th
                  className="w-32 px-2 pb-2 pt-1 text-right text-[11px] font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                  title={t("Closing Value = Opening Value + Purchases Value + Stock Count Value — a running balance that also contains earlier months")}
                >
                  <span className="block">{t("Value")}</span>
                  <span className="block text-[10px] font-normal normal-case tracking-normal">
                    {t("Opening + Movements")}
                  </span>
                </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-default-100 dark:divide-gray-700">
              {categoryOrder.map((category) => {
                const items = groupedMaterials[category];
                if (items.length === 0) return null;

                const isSectionCollapsed: boolean = collapsedSections.has(category);
                const unsavedInSection: number = unsavedCountBySection[category];
                const visibleItems = visibleMaterialsByCategory[category];

                return (
                  <React.Fragment key={category}>
                    <tr className="bg-default-100 dark:bg-gray-700/50">
                      <td colSpan={materialColumnCount} className="p-0">
                        <button
                          type="button"
                          onClick={() => toggleSection(category)}
                          aria-expanded={!isSectionCollapsed}
                          title={
                            isSectionCollapsed
                              ? t("Show {{category}}", { category: t(categoryLabels[category]) })
                              : t("Hide {{category}}", { category: t(categoryLabels[category]) })
                          }
                          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-left transition-colors hover:bg-default-200/70 dark:hover:bg-gray-700"
                        >
                          <div className="mr-auto flex items-center gap-2 text-xs font-semibold text-default-700 dark:text-gray-300">
                            {isSectionCollapsed ? (
                              <IconChevronRight size={14} className="text-default-500" />
                            ) : (
                              <IconChevronDown size={14} className="text-default-500" />
                            )}
                            <IconPackage size={14} className="text-default-500" />
                            {categoryLabels[category]}
                            <span className="font-normal text-default-400">({items.length})</span>
                            {visibleItems.length !== items.length && (
                              <span className="font-normal text-default-400 dark:text-gray-500">
                                {t("· {{count}} shown", { count: visibleItems.length })}
                              </span>
                            )}
                            {unsavedInSection > 0 && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            {t("{{count}} unsaved", { count: unsavedInSection })}
                              </span>
                            )}
                          </div>
                          <div
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                            title={t("Running balance (not this month's count) — Opening RM {{opening}} · Closing RM {{closing}}", {
                              opening: formatNumber(categoryTotals[category].opening),
                              closing: formatNumber(categoryTotals[category].closing),
                            })}
                          >
                            {categoryTotals[category].purchases !== 0 && (
                              <span className="whitespace-nowrap text-blue-600 dark:text-blue-400">
                                {t("Purchases RM {{amount}}", {
                                  amount: formatNumber(categoryTotals[category].purchases),
                                })}
                              </span>
                            )}
                            <span className="text-default-500 dark:text-gray-400">{t("Stock count")}</span>
                            <span className="whitespace-nowrap font-mono font-medium tabular-nums text-sky-600 dark:text-sky-400">
                              RM {formatNumber(categoryTotals[category].adjustments)}
                            </span>
                          </div>
                        </button>
                      </td>
                    </tr>

                    {!isSectionCollapsed && visibleItems.length === 0 && (
                      <tr>
                        <td
                          colSpan={materialColumnCount}
                          className="px-3 py-2 pl-10 text-xs text-default-400 dark:text-gray-500"
                        >
                          {t("All {{count}} rows hidden by the current filter", { count: items.length })}
                        </td>
                      </tr>
                    )}

                    {!isSectionCollapsed && visibleItems.map((material, materialIndex) => {
                      const isNegative = material.closing_quantity < 0;
                      const hasVariants = material.has_variants && material.variants && material.variants.length > 0;
                      const isExpanded = expandedMaterials.has(material.id);
                      const newVariant = newVariantRows.get(material.id);
                      // A material owns every row of its group, so the "drops
                      // below" line belongs on the group's LAST rendered row.
                      const materialDropEdge: "top" | "bottom" | null =
                        dropTarget?.rowKey === `material:${material.id}`
                          ? dropTarget.edge
                          : null;
                      const groupHasRowsBelow: boolean = Boolean(
                        (hasVariants && isExpanded) || (!hasVariants && newVariant)
                      );

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
                                  "opacity-40 ring-1 ring-dashed ring-sky-300 dark:ring-sky-700",
                                materialDropEdge === "top" && dropLineClass("top"),
                                materialDropEdge === "bottom" &&
                                  !groupHasRowsBelow &&
                                  dropLineClass("bottom")
                              )}
                              onClick={() => toggleMaterialExpansion(material.id)}
                            >
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    aria-label={t("Move {{name}}", { name: material.name })}
                                    title={
                                      isMaterialFilterActive
                                        ? t("Clear the search/filter to reorder materials")
                                        : t("Drag to reorder material")
                                    }
                                    disabled={isMaterialDragDisabled}
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
                                      isMaterialDragDisabled
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
                                    <IconAlertTriangle size={14} className="text-red-500" title={t("Negative closing stock")} />
                                  )}
                                  <button
                                    type="button"
                                    onClick={(event) => handleDeleteMaterialClick(material, event)}
                                    disabled={isDeleting}
                                    className="p-1 text-default-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                    title={t("Deactivate material")}
                                    aria-label={t("Deactivate material {{name}}", { name: material.name })}
                                  >
                                    <IconTrash size={14} />
                                  </button>
                                </div>
                              </td>
                              {showRunningBalance && (
                                <td className="px-2 py-1.5 text-right font-mono text-sm text-default-500 dark:text-gray-400">
                                  {formatQty(material.opening_quantity)}
                                </td>
                              )}
                              <td className="px-2 py-1.5 text-center text-xs text-default-400 dark:text-gray-500">-</td>
                              <td className="px-2 py-1.5 text-right font-mono text-sm text-sky-600 dark:text-sky-400 bg-sky-50/50 dark:bg-sky-900/10">
                                {formatQty(material.adjustment_quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {renderAdjustmentValue(
                                  material.adjustment_value,
                                  t("Total stock count value for all variants"),
                                  true
                                )}
                              </td>
                              {showRunningBalance && (
                                <>
                                  <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold text-default-700 dark:text-gray-200">
                                    {formatQty(material.closing_quantity)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <span className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                                      {formatNumber(material.closing_value)}
                                    </span>
                                  </td>
                                </>
                              )}
                            </tr>

                            {isExpanded && material.variants!.map((variant, index) => {
                              const variantNegative = variant.closing_quantity < 0;
                              const isLastVariant = index === material.variants!.length - 1;
                              const variantDropEdge: "top" | "bottom" | null =
                                dropTarget?.rowKey ===
                                `variant:${material.id}:${variant.variant_id}`
                                  ? dropTarget.edge
                                  : null;

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
                                      "opacity-40 ring-1 ring-dashed ring-sky-300 dark:ring-sky-700",
                                    variantDropEdge && dropLineClass(variantDropEdge)
                                  )}
                                >
                                  <td className="px-3 py-1.5 pl-12">
                                    <div className="flex items-center gap-1.5">
                                      {variant.variant_id ? (
                                        <button
                                          type="button"
                                          aria-label={t("Move {{name}}", {
                                            name: getVariantDisplayName(variant, t),
                                          })}
                                          title={t("Drag to reorder variant")}
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
                                        placeholder={t("Variant name...")}
                                      />
                                      {variantNegative && (
                                        <IconAlertTriangle size={12} className="text-red-500" />
                                      )}
                                      {renderRowSaveButton(
                                        variantRowSaveKey(material.id, variant),
                                        isVariantRowDirty(material.id, variant),
                                        (event) => handleSaveVariantRow(material, variant, event),
                                        t("Save {{name}}", {
                                          name: getVariantDisplayName(variant, t),
                                        })
                                      )}
                                      {variant.variant_id && (
                                        <button
                                          type="button"
                                          onClick={(event) => handleDeleteVariantClick(material, variant, event)}
                                          disabled={isDeleting}
                                          className="p-1 text-default-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                          title={t("Deactivate variant")}
                                          aria-label={t("Deactivate variant {{name}}", {
                                            name: getVariantDisplayName(variant, t),
                                          })}
                                        >
                                          <IconTrash size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  {showRunningBalance && (
                                    <td className="px-2 py-1.5 text-right font-mono text-xs text-default-400 dark:text-gray-500">
                                      {formatQty(variant.opening_quantity)}
                                    </td>
                                  )}
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
                                  <td className="px-2 py-1.5 text-right">
                                    {renderAdjustmentValue(
                                      variant.adjustment_value,
                                      t("{{qty}} × {{cost}} = {{value}}", { qty: formatQty(variant.adjustment_quantity), cost: formatUnitCost(variant.unit_cost), value: formatNumber(variant.adjustment_value) })
                                    )}
                                  </td>
                                  {showRunningBalance && (
                                    <>
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
                                    </>
                                  )}
                                </tr>
                              );
                            })}

                            {isExpanded && newVariant && (
                              <tr
                                className={clsx(
                                  "bg-sky-50/60 dark:bg-gray-800 border-l-2 border-sky-400 dark:border-sky-700/60",
                                  materialDropEdge === "bottom" && dropLineClass("bottom")
                                )}
                              >
                                <td className="px-3 py-1.5 pl-12">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sky-400 dark:text-gray-500">+</span>
                                    <input
                                      type="text"
                                      value={newVariant.variant_name || ""}
                                      onChange={(event) => handleNewVariantChange(material.id, "variant_name", event.target.value)}
                                      className="flex-1 px-2 py-0.5 text-sm border border-sky-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-700"
                                      placeholder={t("Enter variant name...")}
                                      autoFocus
                                    />
                                    {renderRowSaveButton(
                                      newVariantRowSaveKey(material.id),
                                      isNewVariantRowDirty(material.id),
                                      (event) => handleSaveNewVariantRow(material, event),
                                      t("Save new variant for {{name}}", { name: material.name })
                                    )}
                                    <button
                                      onClick={() => handleCancelNewVariant(material.id)}
                                      className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                      title={t("Cancel")}
                                    >
                                      <IconX size={14} />
                                    </button>
                                  </div>
                                </td>
                                {showRunningBalance && (
                                  <td className="px-2 py-1.5 text-right font-mono text-xs text-default-400 dark:text-gray-500">0</td>
                                )}
                                <td className="px-1 py-1">
                                  {renderUnitCostInput(
                                    newVariant.unit_cost,
                                    (value) => handleNewVariantChange(material.id, "unit_cost", value)
                                  )}
                                </td>
                                <td className="px-1 py-1 bg-sky-50/20 dark:bg-sky-900/5">
                                  {renderAdjustmentInput(
                                    newVariant.adjustment_quantity,
                                    (value) => handleNewVariantChange(material.id, "adjustment_quantity", value)
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  {renderAdjustmentValue(
                                    newVariant.adjustment_value,
                                    t("{{qty}} × {{cost}} = {{value}}", { qty: formatQty(newVariant.adjustment_quantity), cost: formatUnitCost(newVariant.unit_cost), value: formatNumber(newVariant.adjustment_value) })
                                  )}
                                </td>
                                {showRunningBalance && (
                                  <>
                                    <td className="px-2 py-1.5 text-right font-mono text-sm text-default-700 dark:text-gray-300">
                                      {formatQty(newVariant.closing_quantity)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">
                                      {formatNumber(newVariant.closing_value)}
                                    </td>
                                  </>
                                )}
                              </tr>
                            )}

                            {isExpanded && !newVariant && (
                              <tr
                                className={clsx(
                                  "bg-white dark:bg-gray-800 border-l-2 border-purple-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-gray-500 transition-colors",
                                  materialDropEdge === "bottom" && dropLineClass("bottom")
                                )}
                              >
                                <td colSpan={materialColumnCount} className="px-3 py-1.5 pl-12">
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleAddVariantRow(material.id, material.default_unit_cost);
                                    }}
                                    className="text-xs text-purple-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-gray-200 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    <IconPlus size={12} />
                                    {t("Add new variant")}
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
                                "opacity-40 ring-1 ring-dashed ring-sky-300 dark:ring-sky-700",
                              materialDropEdge === "top" && dropLineClass("top"),
                              materialDropEdge === "bottom" &&
                                !groupHasRowsBelow &&
                                dropLineClass("bottom")
                            )}
                          >
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  aria-label={t("Move {{name}}", {
                                    name: getMaterialDisplayName(material),
                                  })}
                                  title={
                                    isMaterialFilterActive
                                      ? t("Clear the search/filter to reorder materials")
                                      : t("Drag to reorder material")
                                  }
                                  disabled={isMaterialDragDisabled}
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
                                    isMaterialDragDisabled
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
                                    title={t("Negative closing stock")}
                                  />
                                )}
                                {!newVariant && (
                                  <button
                                    onClick={() => handleAddVariantRow(material.id, material.default_unit_cost)}
                                    className="text-xs text-default-400 hover:text-purple-500 dark:text-gray-500 dark:hover:text-purple-400 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                                    title={t("Add variant")}
                                  >
                                    <IconPlus size={14} />
                                  </button>
                                )}
                                {renderRowSaveButton(
                                  materialRowSaveKey(material.id),
                                  isMaterialRowDirty(material),
                                  (event) => handleSaveMaterialRow(material, event),
                                  t("Save {{name}}", { name: getMaterialDisplayName(material) })
                                )}
                                <button
                                  type="button"
                                  onClick={(event) => handleDeleteMaterialClick(material, event)}
                                  disabled={isDeleting}
                                  className="p-1 text-default-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                  title={t("Deactivate material")}
                                  aria-label={t("Deactivate material {{name}}", {
                                    name: getMaterialDisplayName(material),
                                  })}
                                >
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            </td>
                            {showRunningBalance && (
                              <td className="px-2 py-1.5 text-right">
                                <span className="font-mono text-sm text-default-600 dark:text-gray-400">
                                  {formatQty(material.opening_quantity)}
                                </span>
                              </td>
                            )}
                            <td className="px-1 py-1">
                              {renderUnitCostInput(
                                material.unit_cost,
                                (value) => handleInputChange(material.id, "unit_cost", value)
                              )}
                            </td>
                            <td className="px-1 py-1 bg-sky-50/50 dark:bg-sky-900/10">
                              {renderAdjustmentInput(
                                material.adjustment_quantity,
                                (value) => handleInputChange(material.id, "adjustment_quantity", value)
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {renderAdjustmentValue(
                                material.adjustment_value,
                                t("{{qty}} × {{cost}} = {{value}}", { qty: formatQty(material.adjustment_quantity), cost: formatUnitCost(material.unit_cost), value: formatNumber(material.adjustment_value) })
                              )}
                            </td>
                            {showRunningBalance && (
                              <>
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
                              </>
                            )}
                          </tr>

                          {newVariant && (
                            <tr
                              className={clsx(
                                "bg-sky-50/60 dark:bg-gray-800 border-l-2 border-sky-400 dark:border-sky-700/60",
                                materialDropEdge === "bottom" && dropLineClass("bottom")
                              )}
                            >
                              <td className="px-3 py-1.5 pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-sky-400 dark:text-gray-500">+</span>
                                  <input
                                    type="text"
                                    value={newVariant.variant_name || ""}
                                    onChange={(event) => handleNewVariantChange(material.id, "variant_name", event.target.value)}
                                    className="flex-1 px-2 py-0.5 text-sm border border-sky-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-700"
                                    placeholder={t("Enter variant name...")}
                                    autoFocus
                                  />
                                  {renderRowSaveButton(
                                    newVariantRowSaveKey(material.id),
                                    isNewVariantRowDirty(material.id),
                                    (event) => handleSaveNewVariantRow(material, event),
                                    t("Save new variant for {{name}}", {
                                      name: getMaterialDisplayName(material),
                                    })
                                  )}
                                  <button
                                    onClick={() => handleCancelNewVariant(material.id)}
                                    className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                    title={t("Cancel")}
                                  >
                                    <IconX size={14} />
                                  </button>
                                </div>
                              </td>
                              {showRunningBalance && (
                                <td className="px-2 py-1.5 text-right font-mono text-xs text-default-400 dark:text-gray-500">0</td>
                              )}
                              <td className="px-1 py-1">
                                {renderUnitCostInput(
                                  newVariant.unit_cost,
                                  (value) => handleNewVariantChange(material.id, "unit_cost", value)
                                )}
                              </td>
                              <td className="px-1 py-1 bg-sky-50/50 dark:bg-sky-900/10">
                                {renderAdjustmentInput(
                                  newVariant.adjustment_quantity,
                                  (value) => handleNewVariantChange(material.id, "adjustment_quantity", value)
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {renderAdjustmentValue(
                                  newVariant.adjustment_value,
                                  t("{{qty}} × {{cost}} = {{value}}", { qty: formatQty(newVariant.adjustment_quantity), cost: formatUnitCost(newVariant.unit_cost), value: formatNumber(newVariant.adjustment_value) })
                                )}
                              </td>
                              {showRunningBalance && (
                                <>
                                  <td className="px-2 py-1.5 text-right font-mono text-sm text-default-700 dark:text-gray-300">
                                    {formatQty(newVariant.closing_quantity)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">
                                    {formatNumber(newVariant.closing_value)}
                                  </td>
                                </>
                              )}
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
                    <td colSpan={materialColumnCount} className="p-0">
                      <button
                        type="button"
                        onClick={() => toggleSection("stock_kilang")}
                        aria-expanded={!collapsedSections.has("stock_kilang")}
                        title={
                          collapsedSections.has("stock_kilang")
                            ? t("Show Stock Kilang")
                            : t("Hide Stock Kilang")
                        }
                        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-left transition-colors hover:bg-emerald-200/60 dark:hover:bg-emerald-900/50"
                      >
                        <div className="mr-auto flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          {collapsedSections.has("stock_kilang") ? (
                            <IconChevronRight size={14} className="text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <IconChevronDown size={14} className="text-emerald-600 dark:text-emerald-400" />
                          )}
                          <IconBuildingFactory2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                          {t("Stock Kilang")}
                          <span className="text-emerald-500 dark:text-emerald-400 font-normal">
                            ({stockKilang.length})
                          </span>
                          {unsavedCountBySection.stock_kilang > 0 && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              {t("{{count}} unsaved", { count: unsavedCountBySection.stock_kilang })}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="text-emerald-600/80 dark:text-emerald-400/80">{t("Stock count")}</span>
                          <span className="whitespace-nowrap font-mono font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                            RM {formatNumber(stockKilangTotal)}
                          </span>
                        </div>
                      </button>
                    </td>
                  </tr>
                  {!collapsedSections.has("stock_kilang") && stockKilang.map((item) => (
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
                            t("Save {{name}}", { name: item.name })
                          )}
                        </div>
                      </td>
                      {showRunningBalance && (
                        <td className="px-2 py-1.5 text-right font-mono text-sm text-default-400 dark:text-gray-500">-</td>
                      )}
                      <td className="px-1 py-1">
                        {renderUnitCostInput(
                          item.unit_cost,
                          (value) => handleStockKilangUnitCostChange(item.product_id, value)
                        )}
                      </td>
                      <td className="px-1 py-1 bg-sky-50/20 dark:bg-sky-900/5">
                        {renderAdjustmentInput(
                          item.quantity,
                          (value) => handleStockKilangQuantityChange(item.product_id, value)
                        )}
                      </td>
                      <td
                        className="px-2 py-1.5 text-right"
                        title={t("{{qty}} × {{cost}} = {{value}}", { qty: formatQty(item.quantity), cost: formatUnitCost(item.unit_cost), value: formatNumber(item.value) })}
                      >
                        <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          {formatNumber(item.value)}
                        </span>
                      </td>
                      {showRunningBalance && (
                        <>
                          <td className="px-2 py-1.5 text-right">
                            <span className="font-mono text-sm text-default-400 dark:text-gray-500">-</span>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <span className="font-mono text-sm text-default-400 dark:text-gray-500">-</span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </React.Fragment>
              )}

              {isLoadingStockKilang && (
                <tr>
                  <td colSpan={materialColumnCount} className="px-4 py-4 text-center text-default-400 dark:text-gray-500 text-sm">
                    {t("Loading finished goods stock...")}
                  </td>
                </tr>
              )}

              {materials.length === 0 && stockKilang.length === 0 && !isLoadingStockKilang && (
                <tr>
                  <td colSpan={materialColumnCount} className="px-4 py-12 text-center text-default-500 dark:text-gray-400">
                    <IconPackage size={32} className="mx-auto mb-2 text-default-300 dark:text-gray-600" />
                    <p>{t("No materials found for {{tab}}", { tab: activeTab.toUpperCase() })}</p>
                  </td>
                </tr>
              )}
            </tbody>

            {(materials.length > 0 || stockKilang.length > 0) && (
              <tfoot className="bg-default-100 dark:bg-gray-900/50 border-t border-default-200 dark:border-gray-700">
                {materials.length > 0 && (
                  <tr>
                    <td colSpan={materialColumnCount} className="px-3 pb-1 pt-2">
                      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-default-400 dark:text-gray-500">
                        <span>{t("Reference only (running balance, not this month's count):")}</span>
                        <span className="whitespace-nowrap font-mono">
                          {t("Opening RM {{amount}}", { amount: formatNumber(grandTotal.opening) })}
                        </span>
                        {grandTotal.purchases !== 0 && (
                          <span className="whitespace-nowrap font-mono">
                            {t("Purchases RM {{amount}}", { amount: formatNumber(grandTotal.purchases) })}
                          </span>
                        )}
                        <span className="whitespace-nowrap font-mono">
                          {t("Closing RM {{amount}}", { amount: formatNumber(grandTotal.closing) })}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={materialColumnCount} className="px-3 pb-3 pt-1">
                    <div className="ml-auto w-full max-w-md text-sm">
                      {materials.length > 0 && (
                        <>
                          {categoryOrder.map((category) =>
                            groupedMaterials[category].length === 0 ? null : (
                              <div
                                key={category}
                                className="flex items-baseline justify-between gap-4 py-0.5 text-default-600 dark:text-gray-400"
                              >
                                <span>{t(categoryLabels[category])}</span>
                                <span className="whitespace-nowrap font-mono tabular-nums">
                                  {formatNumber(categoryTotals[category].adjustments)}
                                </span>
                              </div>
                            )
                          )}
                          <div
                            className="mt-1 flex items-baseline justify-between gap-4 border-t border-default-200 py-1 font-medium text-sky-600 dark:border-gray-600 dark:text-sky-400"
                            title={t("Total of the Adjustment (Qty × Unit Cost) column — this month's material stock count")}
                          >
                            <span>{t("Stock Count Total")}</span>
                            <span className="whitespace-nowrap font-mono tabular-nums">
                              {formatNumber(grandTotal.adjustments)}
                            </span>
                          </div>
                        </>
                      )}
                      {stockKilang.length > 0 && (
                        <div className="flex items-baseline justify-between gap-4 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                          <span>{t("Stock Kilang")}</span>
                          <span className="whitespace-nowrap font-mono tabular-nums">
                            {formatNumber(stockKilangTotal)}
                          </span>
                        </div>
                      )}
                      <div
                        className="mt-1 flex items-baseline justify-between gap-4 border-t-[3px] border-double border-default-400 pt-1.5 text-base font-semibold text-default-800 dark:border-gray-500 dark:text-gray-100"
                        title={t("Grand Total = this month's stock count value + Stock Kilang")}
                      >
                        <span className="uppercase tracking-wide">{t("Grand Total")}</span>
                        <span className="whitespace-nowrap font-mono tabular-nums">
                          RM {formatNumber(grandTotal.adjustments + stockKilangTotal)}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        </>
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
          <div className="mb-1 text-xs font-semibold text-default-600 dark:text-gray-300">{t("Used adjustments")}</div>
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
              title={t("Revert used adjustment from {{date}}", { date: adjustment.adjustment_date })}
            >
              <span>{adjustment.adjustment_date}</span>
              <span>
                {t("Revert {{quantity}}", {
                  quantity: formatQty(Math.abs(makeNumber(adjustment.adjustment_quantity))),
                })}
              </span>
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
        confirmButtonText={isDeleting ? t("Deactivating...") : t("Deactivate")}
        variant="danger"
      />
    </div>
  );
};

export default StockAdjustmentEntryPage;

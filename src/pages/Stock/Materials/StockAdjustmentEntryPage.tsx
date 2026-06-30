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
} from "@tabler/icons-react";
import clsx from "clsx";
import Button from "../../../components/Button";
import MonthNavigator from "../../../components/MonthNavigator";
import LoadingSpinner from "../../../components/LoadingSpinner";
import GeneralStockCategoryModal from "../../../components/Stock/GeneralStockCategoryModal";
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
type StockEntryTab = ProductLine | "general";
type StockEntryMode = "general" | "material";

interface StockAdjustmentEntryPageProps {
  mode: StockEntryMode;
  generalHeaderActions?: React.ReactNode;
}

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

const StockAdjustmentEntryPage: React.FC<StockAdjustmentEntryPageProps> = ({
  mode,
  generalHeaderActions,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());
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
  const [stockKilang, setStockKilang] = useState<StockKilangItem[]>([]);
  const [isLoadingStockKilang, setIsLoadingStockKilang] = useState(false);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<number>>(new Set());
  const [newVariantRows, setNewVariantRows] = useState<Map<number, StockEntryRow>>(new Map());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [generalStockRows, setGeneralStockRows] = useState<GeneralStockRow[]>([]);
  const [generalStockCategories, setGeneralStockCategories] = useState<GeneralStockCategory[]>([]);
  const [generalAdjustmentInputs, setGeneralAdjustmentInputs] = useState<Record<number, string>>({});
  const [generalSearchQuery, setGeneralSearchQuery] = useState<string>("");
  const [newGeneralCategoryName, setNewGeneralCategoryName] = useState<string>("");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [revertingAdjustmentId, setRevertingAdjustmentId] = useState<number | null>(null);
  const [tooltipState, setTooltipState] = useState<{ lineId: number; x: number; y: number } | null>(null);
  const tooltipTimeoutRef = useRef<number | null>(null);

  const productType = activeTab === "bihun" ? "bh" : "mee";
  const { products, isLoading: isLoadingProducts } = useProductsCache(productType);

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;

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

  useEffect(() => {
    const fetchStockKilang = async (): Promise<void> => {
      if (activeTab === "general" || activeTab === "shared" || products.length === 0 || isLoadingProducts) {
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
    if (activeTab === "general") {
      return Object.values(generalAdjustmentInputs).some(
        (value) => makeNumber(value) !== 0
      );
    }

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
  }, [activeTab, materials, originalMaterials, newVariantRows, generalAdjustmentInputs]);

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

  const handleSave = async (): Promise<void> => {
    if (activeTab === "general") {
      await saveGeneralStockAdjustments();
      return;
    }

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

  const filteredGeneralStockRows = useMemo(() => {
    const query = generalSearchQuery.trim().toLowerCase();
    if (!query) return generalStockRows;

    return generalStockRows.filter((row) => {
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
    });
  }, [generalStockRows, generalSearchQuery]);

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
                {pageTitle}
              </h1>
            </div>
            <span className="text-default-300 dark:text-gray-600">|</span>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-default-500 dark:text-gray-400">
                {activeTab === "general"
                  ? `${filteredGeneralStockRows.length} general items`
                  : `${materials.length} materials`}
              </span>
              {activeTab === "general" ? (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <span className="text-default-500 dark:text-gray-400">
                    Stock: <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatQty(generalStockTotal)}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <span className="text-default-500 dark:text-gray-400">
                    Purchases: <span className="font-medium text-blue-600 dark:text-blue-400">RM {formatNumber(grandTotal.purchases)}</span>
                  </span>
                  <span className="text-default-300 dark:text-gray-600">|</span>
                  <span className="text-default-500 dark:text-gray-400">
                    Closing: <span className="font-medium text-green-600 dark:text-green-400">RM {formatNumber(grandTotal.closing)}</span>
                  </span>
                </>
              )}
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
            {visibleStockTabs.length > 1 && (
              <>
                <div className="flex items-center bg-default-100 dark:bg-gray-700 rounded-full p-0.5">
                  {visibleStockTabs.map((tab) => (
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
              </>
            )}
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
      ) : activeTab === "general" ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-default-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
                  General Categories
                </h2>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-default-100 px-1.5 text-xs font-medium text-default-500 dark:bg-gray-700 dark:text-gray-400">
                  {generalStockCategories.length}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {generalHeaderActions && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {generalHeaderActions}
                    </div>
                    <span className="text-default-300 dark:text-gray-600">|</span>
                  </>
                )}
                <div className="flex gap-2">
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
                    className="h-8 rounded-lg border border-default-300 bg-white px-3 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <Button
                    type="button"
                    color="sky"
                    size="sm"
                    icon={IconPlus}
                    onClick={handleAddGeneralCategory}
                    disabled={!newGeneralCategoryName.trim()}
                  >
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={IconSettings}
                    onClick={() => setIsCategoryModalOpen(true)}
                  >
                    Manage
                  </Button>
                </div>
              </div>
            </div>
            {generalStockCategories.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-default-300 px-3 py-3 text-sm text-default-500 transition-colors hover:border-sky-400 hover:text-sky-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-sky-500 dark:hover:text-sky-300"
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
          </div>

          <div className="relative max-w-sm">
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
              className="h-9 w-full rounded-lg border border-default-300 bg-white pl-9 pr-9 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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

          <div className="overflow-hidden rounded-lg border border-default-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
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
                          ? "No General stock rows match your search."
                          : "No General stock rows found."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
    </div>
  );
};

export default StockAdjustmentEntryPage;

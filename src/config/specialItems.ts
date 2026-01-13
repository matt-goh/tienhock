import { SpecialItemConfig, SpecialItemCategory } from "../types/types";

/**
 * Special Items Configuration
 *
 * These are special production entry items that have unique handling:
 * - HANCUR: Bihun Hancur measured in kg (decimal)
 * - KARUNG_HANCUR: Sack counting for RAMBU
 * - BUNDLE: Various bundle packaging items
 */
export const SPECIAL_ITEMS: SpecialItemConfig[] = [
  {
    id: "HANCUR_BH",
    name: "Bihun Hancur",
    nameBM: "Bihun Hancur",
    description: "Crushed rice vermicelli by weight",
    descriptionBM: "Bihun hancur mengikut berat",
    category: "HANCUR",
    productType: "BH",
    workerJob: "BH_PACKING",
    payCodeId: "BH_HANCUR",
    unit: "kg",
    inputStep: 0.01,
  },
  {
    id: "KARUNG_HANCUR",
    name: "Karung Hancur",
    nameBM: "Karung Hancur - Timbang",
    description: "Weighing crushed rice vermicelli sacks",
    descriptionBM: "Timbang karung bihun hancur",
    category: "KARUNG_HANCUR",
    productType: "BH",
    workerJob: "BH_PACKING",
    payCodeId: "TIMBANG_HANCUR",
    unit: "sack",
    inputStep: 1,
    singleWorkerEntry: {
      defaultWorkerId: "RAMBU",
      allowChange: true,
    },
    hiddenFromUI: true, // Internal item - managed within HancurEntrySection
  },
  {
    id: "BUNDLE_BP",
    name: "Bundle for Best Partner",
    nameBM: "Bundle Plastik Besar (Best Partner)",
    description: "Large plastic bundle packaging for Best Partner",
    descriptionBM: "Bungkus plastik besar untuk Best Partner",
    category: "BUNDLE",
    productType: "BUNDLE",
    workerJob: "BH_PACKING",
    payCodeId: "PB_KG",
    unit: "pcs",
    inputStep: 1,
  },
  {
    id: "BUNDLE_BH",
    name: "Bihun Bundle",
    nameBM: "Bundle Bihun",
    description: "Bihun bundle packaging",
    descriptionBM: "Bungkus bundle bihun",
    category: "BUNDLE",
    productType: "BUNDLE",
    workerJob: "BH_PACKING",
    payCodeId: "BH_PB",
    unit: "bags",
    inputStep: 1,
  },
  {
    id: "BUNDLE_MEE",
    name: "Mee Bundle",
    nameBM: "Bundle Mee",
    description: "Mee bundle packaging",
    descriptionBM: "Bungkus bundle mee",
    category: "BUNDLE",
    productType: "BUNDLE",
    workerJob: "MEE_PACKING",
    payCodeId: "MEE_PB",
    unit: "bags",
    inputStep: 1,
  },
];

// List of special item IDs for quick lookup
export const SPECIAL_ITEM_IDS = SPECIAL_ITEMS.map((item) => item.id);

/**
 * Check if a product ID is a special item
 */
export const isSpecialItem = (productId: string): boolean =>
  SPECIAL_ITEM_IDS.includes(productId);

/**
 * Check if a product ID is hidden from UI (internal special item)
 */
export const isHiddenSpecialItem = (productId: string): boolean => {
  const config = SPECIAL_ITEMS.find((item) => item.id === productId);
  return config?.hiddenFromUI === true;
};

/**
 * Get special item config by ID
 */
export const getSpecialItemConfig = (
  productId: string
): SpecialItemConfig | undefined =>
  SPECIAL_ITEMS.find((item) => item.id === productId);

/**
 * Get special items by category
 */
export const getSpecialItemsByCategory = (
  category: SpecialItemCategory
): SpecialItemConfig[] =>
  SPECIAL_ITEMS.filter((item) => item.category === category);

/**
 * Get all bundle items
 */
export const getBundleItems = (): SpecialItemConfig[] =>
  SPECIAL_ITEMS.filter((item) => item.category === "BUNDLE");

/**
 * Get the Hancur item (Bihun Hancur)
 */
export const getHancurItem = (): SpecialItemConfig | undefined =>
  SPECIAL_ITEMS.find((item) => item.id === "HANCUR_BH");

/**
 * Get the Karung Hancur item
 */
export const getKarungHancurItem = (): SpecialItemConfig | undefined =>
  SPECIAL_ITEMS.find((item) => item.id === "KARUNG_HANCUR");

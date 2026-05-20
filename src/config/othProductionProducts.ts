export interface OthProductionConfig {
  id: string;
}

export const OTH_PRODUCTION_PRODUCTS: OthProductionConfig[] = [
  { id: "EMPTY_BAG" },
  { id: "EMPTY_BAG(S)" },
  { id: "SBH" },
  { id: "SMEE" },
];

export const OTH_PRODUCTION_IDS = OTH_PRODUCTION_PRODUCTS.map((p) => p.id);

export const isOthProductionProduct = (productId: string): boolean =>
  OTH_PRODUCTION_IDS.includes(productId);

export type PackingJob = "MEE_PACKING" | "BH_PACKING";

export interface OthProductionConfig {
  id: string;
  jobs: PackingJob[];
}

export const OTH_PRODUCTION_PRODUCTS: OthProductionConfig[] = [
  { id: "EMPTY_BAG", jobs: ["MEE_PACKING", "BH_PACKING"] },
  { id: "EMPTY_BAG(S)", jobs: ["MEE_PACKING", "BH_PACKING"] },
  { id: "SBH", jobs: ["BH_PACKING"] },
  { id: "SMEE", jobs: ["MEE_PACKING"] },
];

export const OTH_PRODUCTION_IDS = OTH_PRODUCTION_PRODUCTS.map((p) => p.id);

export const isOthProductionProduct = (productId: string): boolean =>
  OTH_PRODUCTION_IDS.includes(productId);

export const getOthProductionConfig = (
  productId: string
): OthProductionConfig | undefined =>
  OTH_PRODUCTION_PRODUCTS.find((p) => p.id === productId);

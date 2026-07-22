import { ProductionWorkerOrderScope } from "../types/types";

/**
 * Default worker display orders for the production entry grids, baked from
 * the dev DB `production_worker_orders` table on 2026-07-22 (the orders the
 * users had already adjusted and confirmed).
 *
 * Used as the fallback when a scope has no saved order in the DB (the GET
 * worker-order API returns an empty list) or the API call fails. Saved DB
 * orders always take precedence over these defaults.
 */
export const DEFAULT_WORKER_ORDERS: Record<
  ProductionWorkerOrderScope,
  string[]
> = {
  BH_PACKING: [
    "BUYUNG",
    "INTONGAH",
    "REMBIUN",
    "RUMPAD",
    "SALOMA",
    "ROSTINA",
    "JEFFRY",
    "JEFFERY",
    "LIZA.R",
    "HELLAN",
    "GUSTI_PM",
    "JAINJAM_PB",
    "JIRIM_PB",
    "RAMBU_PB",
    "ROSMINA_PB",
    "KILANG_PB",
  ],
  MEE_PACKING: [
    "KENNEDY",
    "RONAL",
    "RIMLI",
    "SHARRELL",
    "MAILIN",
    "EMBRAN",
    "ROSMINA",
    "JASSON_PM",
    "ROSLEY",
    "JIEM",
    "MARLINA",
    "IMPUN",
    "MASRUN_PM",
    "JIRIM_PM",
    "JAINOL_PM",
  ],
  JP_PRODUCTION: [],
};

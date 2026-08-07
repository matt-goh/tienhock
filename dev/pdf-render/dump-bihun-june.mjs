// Dump current June 2026 BIHUN unit-cost rows from the live engine vs boss-corrected targets.
import pg from "pg";
import { computeEstimatedReport } from "../../src/routes/stock/estimated-report-engine.js";

const pool = new pg.Pool({
  host: "localhost",
  port: 5434,
  user: "postgres",
  password: "REMOVED_SECRET",
  database: "tienhock",
});

// Boss's corrected (legacy) targets from CORRECTED_BIHUN_JUNE_ESTIMATED_UNIT_COST.pdf.
// Four rows were re-pinned on 7 Aug 2026 after the coworker amended the legacy program
// for two classifications the June print had keyed wrongly (see JUNE_RECLASS_DESIGN.md
// §e): KFC LINTAS 40.00 belongs in MBSM_K, not MBC, and the PAUMIN receipt splits
// MBRMF 565.00 / MBSAF 144.00, not 465.00 / 244.00. Half of each shift lands on BIHUN:
//   MBC 479.55 -> 459.55 (-20)   STAFF MESSING 2,669.10 -> 2,689.10 (+20)
//   MBSAF 714.78 -> 664.78 (-50) MBRMF 2,517.80 -> 2,567.80 (+50)
// The four deltas net to zero, so EXPENSES SUBTOTAL and FINAL are unchanged.
const targets = {
  MBC: 459.55,
  MBOR: 799.4,
  MBRMF: 2567.8,
  MBSAF: 664.78,
  "STAFF MESSING": 2689.1,
  "VRE-DIESEL": 1555.67,
  "VRE-REPAIR": 1753.5,
  "EXPENSES SUBTOTAL": 64238.82,
  "MACHINE REPAIR": 2319.22,
};

const data = await computeEstimatedReport(pool, {
  year: 2026,
  month: 6,
  productLines: ["bihun"],
});
const rep = data.reports.bihun;
const uc = rep.unitCost;

for (const group of uc.groups) {
  console.log(`\n[${group.key}]`);
  for (const row of group.rows) {
    const t =
      targets[row.code] ?? targets[row.description?.toUpperCase?.()] ?? null;
    const mark =
      t !== null
        ? Math.abs(row.amount - t) < 0.005
          ? "OK "
          : `DIFF legacy=${t} delta=${(row.amount - t).toFixed(2)}`
        : "";
    console.log(
      `  ${row.code ?? "-"} | ${row.description} | ${row.amount.toFixed(2)} ${mark}`
    );
  }
  if (group.key === "expenses") {
    const sub = group.subtotal.amount;
    const t = targets["EXPENSES SUBTOTAL"];
    console.log(
      `  SUBTOTAL ${sub.toFixed(2)} ${
        Math.abs(sub - t) < 0.005
          ? "OK"
          : `DIFF legacy=${t} delta=${(sub - t).toFixed(2)}`
      }`
    );
  }
}
console.log(`\nMACHINE REPAIR rows:`);
for (const row of uc.machineRepair.rows ?? []) {
  console.log(`  ${row.code ?? "-"} | ${row.description} | ${row.amount.toFixed(2)}`);
}
const mr = uc.machineRepair.amount;
const mrt = targets["MACHINE REPAIR"];
console.log(
  `  TOTAL ${mr.toFixed(2)} ${Math.abs(mr - mrt) < 0.005 ? "OK" : `DIFF legacy=${mrt} delta=${(mr - mrt).toFixed(2)}`}`
);
console.log(`\nTOTAL before repair: ${uc.totalBeforeRepair.amount.toFixed(2)}`);
console.log(`TOTAL incl repair: ${uc.total.amount.toFixed(2)}`);
console.log(`addBack: ${uc.addBack.amount.toFixed(2)}`);
console.log(`finalUnitCost: ${uc.finalUnitCost}`);
console.log(`productionBags: ${uc.production.bags}`);
await pool.end();

#!/usr/bin/env node
/**
 * Phase 3 parity verifier for the June 2026 Estimated P&L & Unit Cost report.
 *
 * Runs the shipped computation engine against the dev database, compares every
 * atomic value available in the legacy fixture, verifies the report arithmetic,
 * and permits only the explicitly documented source-data differences.
 *
 * The fixture's handwritten Add Back values are applied inside a transaction
 * that is always rolled back, so this script leaves the database unchanged.
 *
 * Exit 0: no unexpected parity drift (documented deltas may remain)
 * Exit 1: a comparison, coverage gate, or approved data fix failed
 * Exit 2: the fixture, database, or engine could not be evaluated
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { createDatabasePool } from "../../../src/routes/utils/db-pool.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const FIXTURE_FILE = path.join(HERE, "expected-june-2026.json");

dotenv.config({ path: path.join(REPO, ".env") });
process.env.TZ = "Asia/Kuala_Lumpur";

const YEAR = 2026;
const MONTH = 6;
const PRODUCT_LINES = ["mee", "bihun"];
const SCALE = { money: 100, quantity: 1000, unit: 1000000 };
const Q10_GAP_CENTS = { mee: 21661, bihun: 20721 };
/** @type {Readonly<Record<string, number>>} */
const HANDWRITTEN_ADD_BACK_UNITS = { mee: 0.466813, bihun: 0.221409 };

/** @typedef {"money" | "quantity" | "unit"} Measure */
/** @typedef {"PASS" | "EXPECTED" | "FAIL"} Status */
/**
 * @typedef {object} Comparison
 * @property {string} id
 * @property {string} label
 * @property {Measure | "structure"} measure
 * @property {Status} status
 * @property {number | null} actualScaled
 * @property {number | null} expectedScaled
 * @property {number} allowedDeltaScaled
 * @property {string} reason
 * @property {boolean} rootDelta
 * @property {string} detail
 */
/** @typedef {{ delta: number, reason: string }} ExpectedDelta */

/** @type {Comparison[]} */
const comparisons = [];
/** @type {string[]} */
const informationalNotes = [];
/** @type {Set<string>} */
const exercisedRootDeltas = new Set();

/**
 * Atomic, post-FIX-1/FIX-2 differences between live source data and the print.
 * Money values are integer sen and delta signs are always engine minus fixture.
 * Cascading totals are derived from these entries later in the verifier.
 *
 * @type {Map<string, ExpectedDelta>}
 */
const ROOT_MONEY_DELTAS = new Map([
  // Q14 RESOLVED 2026-07-29 in production (three June MEE label/sticker rows were
  // keyed at the stale material default rate instead of the June rate: M35 0.0800
  // -> 0.0750, M40 0.2300 -> 0.2250, M8/ME-Q 0.0400 -> 0.0350, together exactly
  // -RM883.60). CS_MPMS now lands exact and intentionally carries no expected delta.
  [
    "mee.pl.opening.OS_MPMS.amount",
    { delta: -8, reason: "documented May keying noise" },
  ],
  [
    "mee.pl.purchase.PU_MSD.amount",
    { delta: -54000, reason: "Q11: discontinued material; no purchase exists" },
  ],
  [
    "mee.pl.return.MRET.amount",
    { delta: -130, reason: "documented physical-return snapshot difference" },
  ],
  [
    "bihun.pl.return.BRET.amount",
    { delta: 320, reason: "documented physical-return snapshot difference" },
  ],
  [
    "mee.unit.ingredient.SODIUM TRIPOLYPHOSPHATE.amount",
    { delta: -54000, reason: "derived from the Q11 PU_MSD source difference" },
  ],
  [
    "mee.unit.packing.PLASTIC (SMALL).amount",
    { delta: -8, reason: "derived from the RM0.08 May opening keying noise" },
  ],
  // Q15 RESOLVED 2026-07-28 in production (Rosa re-pointed the parked RM40 from
  // CA_WA to OIL6389 on PCE003/06; +RM20.00 per product line after the 50% split).
  // Both VRE-DIESEL rows now land exact and intentionally carry no expected delta.
  [
    "mee.unit.expenses.subtotal.amount",
    { delta: 2094, reason: "documented JVSL snapshot and visible-row rounding residual" },
  ],
  [
    "bihun.unit.expenses.subtotal.amount",
    { delta: 2094, reason: "documented JVSL snapshot and visible-row rounding residual" },
  ],
  [
    "mee.unit.machineRepair.amount",
    { delta: 19129, reason: "Q13 formula confirmed; June source classification differs" },
  ],
  [
    "bihun.unit.machineRepair.amount",
    { delta: -27324, reason: "Q13 formula confirmed; June source classification differs" },
  ],
]);

/** Read and parse the canonical June fixture. */
function readFixture() {
  if (!fs.existsSync(FIXTURE_FILE)) {
    throw new Error(`Missing fixture: ${FIXTURE_FILE}`);
  }
  return JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8"));
}

/** @param {unknown} value @param {Measure} measure @returns {number | null} */
function scaled(value, measure) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Cannot compare non-numeric ${JSON.stringify(value)}`);
  }
  return Math.round(numeric * SCALE[measure]);
}

/** @param {number} value @returns {number} */
function roundUnit(value) {
  return Number(value.toFixed(6));
}

/** @param {number} amount @param {number} bags @returns {number} */
function unitOf(amount, bags) {
  return bags ? roundUnit(amount / bags) : 0;
}

/** @param {number[]} values @returns {number} */
function sumMoney(values) {
  return values.reduce((total, value) => total + Math.round(Number(value) * 100), 0) / 100;
}

/** @param {string} id @returns {ExpectedDelta | null} */
function rootDeltaFor(id) {
  return ROOT_MONEY_DELTAS.get(id) || null;
}

/**
 * Record one numeric/null comparison.
 *
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.label
 * @param {number | null | undefined} options.actual
 * @param {number | null | undefined} options.expected
 * @param {Measure} options.measure
 * @param {number} [options.allowedDeltaScaled]
 * @param {string} [options.reason]
 * @returns {Comparison}
 */
function compareNumber({
  id,
  label,
  actual,
  expected,
  measure,
  allowedDeltaScaled,
  reason,
}) {
  const rootDelta = rootDeltaFor(id);
  const allowed = allowedDeltaScaled ?? rootDelta?.delta ?? 0;
  const actualScaled = scaled(actual, measure);
  const expectedScaled = scaled(expected, measure);
  const root = rootDelta !== null;
  if (root) exercisedRootDeltas.add(id);

  let status = "FAIL";
  let detail = "";
  if (actualScaled === null || expectedScaled === null) {
    if (actualScaled === expectedScaled && allowed === 0) status = "PASS";
    else detail = `engine ${String(actual)} vs target ${String(expected)}`;
  } else {
    const delta = actualScaled - expectedScaled;
    if (delta === allowed) status = allowed === 0 ? "PASS" : "EXPECTED";
    else detail = `delta ${formatScaled(delta, measure)}; expected ${formatSignedScaled(allowed, measure)}`;
  }

  const comparison = {
    id,
    label,
    measure,
    status,
    actualScaled,
    expectedScaled,
    allowedDeltaScaled: allowed,
    reason: reason || rootDelta?.reason || "",
    rootDelta: root,
    detail,
  };
  comparisons.push(comparison);
  return comparison;
}

/** @param {string} id @param {string} label @param {boolean} condition @param {string} [detail] */
function checkStructure(id, label, condition, detail = "") {
  comparisons.push({
    id,
    label,
    measure: "structure",
    status: condition ? "PASS" : "FAIL",
    actualScaled: null,
    expectedScaled: null,
    allowedDeltaScaled: 0,
    reason: "",
    rootDelta: false,
    detail: condition ? "" : detail,
  });
}

/** @param {number} value @param {Measure} measure @returns {string} */
function formatScaled(value, measure) {
  const decimals = measure === "money" ? 2 : measure === "quantity" ? 3 : 6;
  return (value / SCALE[measure]).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** @param {number} value @param {Measure} measure @returns {string} */
function formatSignedScaled(value, measure) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatScaled(value, measure)}`;
}

/** @param {unknown} value @returns {string} */
function normalizeCode(value) {
  const code = String(value);
  if (code === "CS_MTHT1") return "CS_MTH11";
  if (code === "OS_MTHT1") return "OS_MTH11";
  return code;
}

/** @param {unknown} value @returns {string} */
function normalizeDescription(value) {
  return String(value)
    .replace("SODIUM METALBISULHITE", "SODIUM METALBISULPHITE")
    .trim();
}

/** @param {object[]} rows @param {(row: object) => string} keyOf @returns {Map<string, object>} */
function indexRows(rows, keyOf) {
  const indexed = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (indexed.has(key)) throw new Error(`Duplicate comparison key ${key}`);
    indexed.set(key, row);
  }
  return indexed;
}

/**
 * Index engine rows without turning an engine-shape drift into a fatal fixture error.
 * The first row remains available for dependent comparisons; duplicate coverage is
 * recorded as a normal failure so the verifier exits 1.
 *
 * @param {object[]} rows
 * @param {(row: object) => string} keyOf
 * @param {string} id
 * @param {string} label
 * @returns {Map<string, object>}
 */
function indexEngineRows(rows, keyOf, id, label) {
  const indexed = new Map();
  /** @type {string[]} */
  const duplicates = [];
  for (const row of rows) {
    const key = keyOf(row);
    if (indexed.has(key)) {
      duplicates.push(key);
      continue;
    }
    indexed.set(key, row);
  }
  checkStructure(
    id,
    label,
    duplicates.length === 0,
    duplicates.length ? `duplicate engine keys [${sortedKeys(duplicates)}]` : ""
  );
  return indexed;
}

/** @param {string[]} values @returns {string} */
function sortedKeys(values) {
  return [...values].sort().join(", ");
}

/**
 * Compare P&L rows matched by code, including exact row coverage.
 *
 * @param {object} options
 * @param {string} options.prefix
 * @param {string} options.label
 * @param {object[]} options.actualRows
 * @param {object[]} options.fixtureRows
 * @param {boolean} [options.compareBags]
 */
function compareCodeRows({ prefix, label, actualRows, fixtureRows, compareBags = false }) {
  const actualByCode = indexEngineRows(
    actualRows,
    (row) => normalizeCode(row.code),
    `${prefix}.unique`,
    `${label} engine row keys are unique`
  );
  const fixtureByCode = indexRows(fixtureRows, (row) => normalizeCode(row.code));
  const actualCodes = [...actualByCode.keys()];
  const fixtureCodes = [...fixtureByCode.keys()];
  checkStructure(
    `${prefix}.coverage`,
    `${label} row coverage`,
    sortedKeys(actualCodes) === sortedKeys(fixtureCodes),
    `engine [${sortedKeys(actualCodes)}] vs fixture [${sortedKeys(fixtureCodes)}]`
  );

  for (const [code, fixtureRow] of fixtureByCode) {
    const actualRow = actualByCode.get(code);
    if (!actualRow) continue;
    compareNumber({
      id: `${prefix}.${code}.amount`,
      label: `${label} ${code}`,
      actual: actualRow.amount,
      expected: fixtureRow.amount,
      measure: "money",
    });
    if (compareBags && Object.hasOwn(fixtureRow, "bags")) {
      compareNumber({
        id: `${prefix}.${code}.bags`,
        label: `${label} ${code} bags`,
        actual: actualRow.bags,
        expected: fixtureRow.bags,
        measure: "quantity",
      });
    }
  }
}

/** @param {string} id @returns {number} */
function allowedMoneyDelta(id) {
  return rootDeltaFor(id)?.delta || 0;
}

/** @param {string} prefix @param {object[]} fixtureRows @returns {number} */
function sumRowAllowedDeltas(prefix, fixtureRows) {
  return fixtureRows.reduce(
    (total, row) => total + allowedMoneyDelta(`${prefix}.${normalizeCode(row.code)}.amount`),
    0
  );
}

/** @param {object[]} rows @returns {number} */
function sumRowAmounts(rows) {
  return sumMoney(rows.map((row) => row.amount || 0));
}

/** @param {object} fixtureLine @returns {object} */
function addBackFixture(fixtureLine) {
  return fixtureLine.footer.add_back_handwritten !== undefined
    ? { amount: fixtureLine.footer.add_back_handwritten }
    : fixtureLine.add_back_handwritten;
}

/**
 * Preserve the internally coherent handwritten BIHUN scenario as evidence without
 * treating it as an engine target. These checks fail if its fixture relationships
 * drift, while the canonical engine comparisons continue to use printed atomic rows.
 *
 * @param {object} fixture
 */
function compareAlternateFixtureEvidence(fixture) {
  const pl = fixture.bihun;
  const unit = fixture.unit_cost.bihun;
  const closing = indexRows(pl.closing_stock, (row) => normalizeCode(row.code));
  const opening = indexRows(pl.opening_stock, (row) => normalizeCode(row.code));
  const purchases = indexRows(pl.purchases, (row) => normalizeCode(row.code));
  const ingredients = indexRows(unit.ingredients, (row) => normalizeDescription(row.name));
  const closingJagung = closing.get("CS_BJAG");
  const openingJagung = opening.get("OS_BJAG");
  const openingSodium = opening.get("OS_BSDM");
  const purchaseJagung = purchases.get("PU_BJAG");
  const returns = purchases.get("BRET");
  const unitJagung = ingredients.get("JAGUNG");

  const printedClosing = sumRowAmounts(pl.closing_stock);
  const handwrittenClosing = sumMoney([
    printedClosing,
    -Number(closingJagung.amount),
    Number(closingJagung.amount_handwritten),
  ]);
  compareNumber({
    id: "bihun.fixture.handwritten.closing",
    label: "BIHUN handwritten closing-stock scenario",
    actual: pl.closing_stock_subtotals.with_finished_handwritten,
    expected: handwrittenClosing,
    measure: "money",
  });
  compareNumber({
    id: "bihun.fixture.handwritten.closingPlusSales",
    label: "BIHUN handwritten closing stock plus sales",
    actual: pl.closing_stock_subtotals.grand_total_with_sales_handwritten,
    expected: sumMoney([pl.totals.amount, handwrittenClosing]),
    measure: "money",
  });

  const printedOpening = sumRowAmounts(pl.opening_stock);
  const handwrittenOpening = sumMoney([
    printedOpening,
    -Number(openingJagung.amount),
    Number(openingJagung.amount_handwritten),
  ]);
  compareNumber({
    id: "bihun.fixture.handwritten.openingJagungSodium",
    label: "BIHUN handwritten opening JAGUNG/SODIUM subtotal",
    actual: pl.opening_stock_subtotals.jagung_sodium_group_handwritten,
    expected: sumMoney([openingJagung.amount_handwritten, openingSodium.amount]),
    measure: "money",
  });
  compareNumber({
    id: "bihun.fixture.handwritten.opening",
    label: "BIHUN handwritten opening-stock scenario",
    actual: pl.opening_stock_subtotals.grand_total_handwritten,
    expected: handwrittenOpening,
    measure: "money",
  });

  const handwrittenUsageBase = sumMoney([
    handwrittenOpening,
    pl.purchase_total,
    returns.amount,
  ]);
  compareNumber({
    id: "bihun.fixture.handwritten.usageBase",
    label: "BIHUN handwritten opening plus purchases plus returns",
    actual: pl.footer.os_plus_purchases_plus_returns_handwritten,
    expected: handwrittenUsageBase,
    measure: "money",
  });
  const handwrittenUsage = sumMoney([handwrittenUsageBase, -handwrittenClosing]);
  const handwrittenGross = sumMoney([pl.totals.amount, -handwrittenUsage]);
  compareNumber({
    id: "bihun.fixture.handwritten.gross",
    label: "BIHUN handwritten gross-profit scenario",
    actual: pl.footer.gross_profit_handwritten,
    expected: handwrittenGross,
    measure: "money",
  });
  const handwrittenProfitLoss = sumMoney([handwrittenGross, -pl.footer.expenses]);
  compareNumber({
    id: "bihun.fixture.handwritten.profitLoss",
    label: "BIHUN handwritten P/L scenario",
    actual: pl.footer.pl_handwritten,
    expected: handwrittenProfitLoss,
    measure: "money",
  });
  compareNumber({
    id: "bihun.fixture.handwritten.finalProfitLoss",
    label: "BIHUN handwritten final P/L scenario",
    actual: pl.footer.final_pl_handwritten,
    expected: sumMoney([handwrittenProfitLoss, pl.footer.add_back_handwritten]),
    measure: "money",
  });

  const handwrittenJagung = sumMoney([
    openingJagung.amount_handwritten,
    purchaseJagung.amount,
    -Number(closingJagung.amount_handwritten),
  ]);
  compareNumber({
    id: "bihun.fixture.handwritten.unit.jagungAmount",
    label: "BIHUN handwritten unit-cost JAGUNG amount",
    actual: unitJagung.amount_handwritten,
    expected: handwrittenJagung,
    measure: "money",
  });
  compareNumber({
    id: "bihun.fixture.handwritten.unit.jagungUnit",
    label: "BIHUN handwritten unit-cost JAGUNG unit",
    actual: unitJagung.unit_handwritten,
    expected: unitOf(handwrittenJagung, unit.production_bags),
    measure: "unit",
  });

  const printedIngredientTotal = sumRowAmounts(unit.ingredients);
  checkStructure(
    "bihun.fixture.printed.ingredientSubtotalOcrGap",
    "BIHUN printed ingredient subtotal preserves the RM900 OCR discrepancy",
    scaled(printedIngredientTotal - Number(unit.ingredients_subtotal.amount_printed), "money") === 90000,
    `atomic ${printedIngredientTotal.toFixed(2)} vs stored ${Number(unit.ingredients_subtotal.amount_printed).toFixed(2)}`
  );
  const handwrittenIngredientTotal = sumMoney(
    unit.ingredients.map((row) => Number(row.amount_handwritten ?? row.amount))
  );
  compareNumber({
    id: "bihun.fixture.handwritten.unit.ingredientSubtotal",
    label: "BIHUN handwritten ingredient subtotal",
    actual: unit.ingredients_subtotal.amount_handwritten,
    expected: handwrittenIngredientTotal,
    measure: "money",
  });
  checkStructure(
    "bihun.fixture.handwritten.unit.ingredientSubtotalUnitOffset",
    "BIHUN handwritten ingredient unit preserves its 0.000001 scan/rounding offset",
    scaled(unit.ingredients_subtotal.unit_handwritten, "unit") -
      scaled(unitOf(handwrittenIngredientTotal, unit.production_bags), "unit") === -1
  );

  const handwrittenBeforeRepair = sumMoney([
    handwrittenIngredientTotal,
    unit.packing_subtotal.amount,
    unit.salary_subtotal.amount,
    unit.salesman_subtotal.amount,
    unit.habuk_subtotal.amount,
    unit.expenses_line.amount,
  ]);
  compareNumber({
    id: "bihun.fixture.handwritten.unit.totalBeforeRepair",
    label: "BIHUN handwritten total before repair",
    actual: unit.total_before_repair.amount,
    expected: handwrittenBeforeRepair,
    measure: "money",
  });
  checkStructure(
    "bihun.fixture.handwritten.unit.totalBeforeRepairUnitOffset",
    "BIHUN handwritten total-before-repair unit preserves its 0.000045 scan offset",
    scaled(unit.total_before_repair.unit, "unit") -
      scaled(unitOf(handwrittenBeforeRepair, unit.production_bags), "unit") === -45
  );
  const handwrittenTotal = sumMoney([handwrittenBeforeRepair, unit.machine_repair.amount]);
  compareNumber({
    id: "bihun.fixture.handwritten.unit.total",
    label: "BIHUN handwritten unit-cost total",
    actual: unit.total.amount,
    expected: handwrittenTotal,
    measure: "money",
  });
  checkStructure(
    "bihun.fixture.handwritten.unit.totalUnitOffset",
    "BIHUN handwritten total unit preserves its 0.000045 scan offset",
    scaled(unit.total.unit, "unit") -
      scaled(unitOf(handwrittenTotal, unit.production_bags), "unit") === -45
  );
  compareNumber({
    id: "bihun.fixture.handwritten.unit.finalDisplayedUnit",
    label: "BIHUN handwritten final displayed unit arithmetic",
    actual: unit.final_unit_cost_handwritten,
    expected: roundUnit(unit.total.unit - unit.add_back_handwritten.unit),
    measure: "unit",
  });
}

/**
 * Compare unit-cost rows and return the printed-source group references needed
 * by the P&L expense reconciliation.
 *
 * @param {string} productLine
 * @param {object} report
 * @param {object} fixtureLine
 * @param {object} unitFixture
 * @returns {Record<string, { fixtureAmount: number, allowedDelta: number }>}
 */
function compareUnitCost(productLine, report, fixtureLine, unitFixture) {
  const unitCost = report.unitCost;
  const productionBags = Number(unitCost.production.bags);
  const groupsByKey = indexEngineRows(
    unitCost.groups,
    (group) => group.key,
    `${productLine}.unit.groups.unique`,
    `${productLine.toUpperCase()} unit-cost group keys are unique`
  );
  checkStructure(
    `${productLine}.unit.groups.coverage`,
    `${productLine.toUpperCase()} unit-cost group coverage`,
    sortedKeys([...groupsByKey.keys()]) ===
      sortedKeys(["ingredient", "packing", "salary", "salesman", "habuk", "expenses"]),
    `found [${sortedKeys([...groupsByKey.keys()])}]`
  );

  compareNumber({
    id: `${productLine}.unit.bagsSold`,
    label: `${productLine.toUpperCase()} unit-cost bags sold`,
    actual: unitCost.bagsSold,
    expected: unitFixture.bags_sold,
    measure: "quantity",
  });
  compareNumber({
    id: `${productLine}.unit.sales.amount`,
    label: `${productLine.toUpperCase()} unit-cost sales`,
    actual: unitCost.sales.amount,
    expected: unitFixture.sales.amount,
    measure: "money",
  });
  compareNumber({
    id: `${productLine}.unit.sales.unit`,
    label: `${productLine.toUpperCase()} sales per bag`,
    actual: unitCost.sales.unit,
    expected: unitFixture.sales.unit,
    measure: "unit",
  });
  compareNumber({
    id: `${productLine}.unit.production`,
    label: `${productLine.toUpperCase()} production bags`,
    actual: productionBags,
    expected: unitFixture.production_bags,
    measure: "quantity",
  });

  const fixtureRowsByGroup = {
    ingredient: unitFixture.ingredients,
    packing: unitFixture.packing,
    salary: unitFixture.salary,
    salesman: unitFixture.salesman_group,
    habuk: unitFixture.habuk_group,
  };
  const fixtureSubtotalByGroup = {
    ingredient: unitFixture.ingredients_subtotal,
    packing: unitFixture.packing_subtotal,
    salary: unitFixture.salary_subtotal,
    salesman: unitFixture.salesman_subtotal,
    habuk: unitFixture.habuk_subtotal,
  };

  /** @type {Record<string, { fixtureAmount: number, allowedDelta: number }>} */
  const references = {};

  for (const groupKey of ["ingredient", "packing", "salary", "salesman", "habuk"]) {
    const group = groupsByKey.get(groupKey);
    const fixtureRows = fixtureRowsByGroup[groupKey];
    const fixtureAmount = sumRowAmounts(fixtureRows);
    const allowedDelta = fixtureRows.reduce(
      (total, row) =>
        total + allowedMoneyDelta(
          `${productLine}.unit.${groupKey}.${normalizeDescription(row.name)}.amount`
        ),
      0
    );
    references[groupKey] = { fixtureAmount, allowedDelta };
    checkStructure(
      `${productLine}.unit.${groupKey}.present`,
      `${productLine.toUpperCase()} ${groupKey} group exists`,
      Boolean(group),
      "group missing from engine output"
    );
    if (!group) continue;

    const actualByName = indexEngineRows(
      group.rows,
      (row) => normalizeDescription(row.description),
      `${productLine}.unit.${groupKey}.unique`,
      `${productLine.toUpperCase()} ${groupKey} engine row keys are unique`
    );
    const fixtureByName = indexRows(fixtureRows, (row) => normalizeDescription(row.name));
    checkStructure(
      `${productLine}.unit.${groupKey}.coverage`,
      `${productLine.toUpperCase()} ${groupKey} row coverage`,
      sortedKeys([...actualByName.keys()]) === sortedKeys([...fixtureByName.keys()]),
      `engine [${sortedKeys([...actualByName.keys()])}] vs fixture [${sortedKeys([...fixtureByName.keys()])}]`
    );

    for (const [name, fixtureRow] of fixtureByName) {
      const actualRow = actualByName.get(name);
      if (!actualRow) continue;
      const amountId = `${productLine}.unit.${groupKey}.${name}.amount`;
      const amountComparison = compareNumber({
        id: amountId,
        label: `${productLine.toUpperCase()} ${groupKey}: ${name}`,
        actual: actualRow.amount,
        expected: fixtureRow.amount,
        measure: "money",
      });
      const derivedUnit = unitOf(Number(actualRow.amount), productionBags);
      compareNumber({
        id: `${productLine}.unit.${groupKey}.${name}.derivedUnit`,
        label: `${productLine.toUpperCase()} ${groupKey}: ${name} unit formula`,
        actual: actualRow.unit,
        expected: derivedUnit,
        measure: "unit",
      });

      if (fixtureRow.unit !== undefined) {
        const expectedEngineAmount = Number(fixtureRow.amount) + amountComparison.allowedDeltaScaled / 100;
        const expectedEngineUnit = unitOf(expectedEngineAmount, productionBags);
        const allowedUnitDelta = scaled(expectedEngineUnit, "unit") - scaled(fixtureRow.unit, "unit");
        compareNumber({
          id: `${productLine}.unit.${groupKey}.${name}.unit`,
          label: `${productLine.toUpperCase()} ${groupKey}: ${name} printed unit`,
          actual: actualRow.unit,
          expected: fixtureRow.unit,
          measure: "unit",
          allowedDeltaScaled: allowedUnitDelta,
          reason: amountComparison.reason || "engine derives unit from the visible amount and production bags",
        });
      }
    }

    compareNumber({
      id: `${productLine}.unit.${groupKey}.subtotal.amount`,
      label: `${productLine.toUpperCase()} ${groupKey} subtotal`,
      actual: group.subtotal.amount,
      expected: fixtureAmount,
      measure: "money",
      allowedDeltaScaled: allowedDelta,
      reason: "derived from the atomic row deltas above",
    });
    compareNumber({
      id: `${productLine}.unit.${groupKey}.subtotal.derivedUnit`,
      label: `${productLine.toUpperCase()} ${groupKey} subtotal unit formula`,
      actual: group.subtotal.unit,
      expected: unitOf(group.subtotal.amount, productionBags),
      measure: "unit",
    });

    const fixtureSubtotal = fixtureSubtotalByGroup[groupKey];
    if (fixtureSubtotal?.amount !== undefined) {
      compareNumber({
        id: `${productLine}.fixture.${groupKey}.subtotal.amount`,
        label: `${productLine.toUpperCase()} fixture ${groupKey} subtotal consistency`,
        actual: fixtureSubtotal.amount,
        expected: fixtureAmount,
        measure: "money",
      });
    }
    if (fixtureSubtotal?.unit !== undefined) {
      const expectedEngineUnit = unitOf(fixtureAmount + allowedDelta / 100, productionBags);
      const allowedUnitDelta = scaled(expectedEngineUnit, "unit") - scaled(fixtureSubtotal.unit, "unit");
      compareNumber({
        id: `${productLine}.unit.${groupKey}.subtotal.unit`,
        label: `${productLine.toUpperCase()} ${groupKey} printed subtotal unit`,
        actual: group.subtotal.unit,
        expected: fixtureSubtotal.unit,
        measure: "unit",
        allowedDeltaScaled: allowedUnitDelta,
        reason: "engine derives the subtotal unit from canonical visible rows",
      });
    }
  }

  const expenseGroup = groupsByKey.get("expenses");
  const expenseAmountId = `${productLine}.unit.expenses.subtotal.amount`;
  references.expenses = {
    fixtureAmount: Number(unitFixture.expenses_line.amount),
    allowedDelta: allowedMoneyDelta(expenseAmountId),
  };
  checkStructure(
    `${productLine}.unit.expenses.present`,
    `${productLine.toUpperCase()} expenses group exists`,
    Boolean(expenseGroup),
    "group missing from engine output"
  );
  if (expenseGroup) {
    const amountComparison = compareNumber({
      id: expenseAmountId,
      label: `${productLine.toUpperCase()} shared expenses line`,
      actual: expenseGroup.subtotal.amount,
      expected: unitFixture.expenses_line.amount,
      measure: "money",
    });
    compareNumber({
      id: `${productLine}.unit.expenses.subtotal.derivedUnit`,
      label: `${productLine.toUpperCase()} expenses unit formula`,
      actual: expenseGroup.subtotal.unit,
      expected: unitOf(expenseGroup.subtotal.amount, productionBags),
      measure: "unit",
    });
    const expectedEngineUnit = unitOf(
      Number(unitFixture.expenses_line.amount) + amountComparison.allowedDeltaScaled / 100,
      productionBags
    );
    compareNumber({
      id: `${productLine}.unit.expenses.subtotal.unit`,
      label: `${productLine.toUpperCase()} expenses printed unit`,
      actual: expenseGroup.subtotal.unit,
      expected: unitFixture.expenses_line.unit,
      measure: "unit",
      allowedDeltaScaled:
        scaled(expectedEngineUnit, "unit") - scaled(unitFixture.expenses_line.unit, "unit"),
      reason: amountComparison.reason,
    });
  }

  const repairComparison = compareNumber({
    id: `${productLine}.unit.machineRepair.amount`,
    label: `${productLine.toUpperCase()} machine repair`,
    actual: unitCost.machineRepair.amount,
    expected: unitFixture.machine_repair.amount,
    measure: "money",
  });
  references.machineRepair = {
    fixtureAmount: Number(unitFixture.machine_repair.amount),
    allowedDelta: repairComparison.allowedDeltaScaled,
  };
  checkStructure(
    `${productLine}.unit.machineRepair.coverage`,
    `${productLine.toUpperCase()} machine-repair row coverage`,
    unitCost.machineRepair.rows.length === 1 &&
      normalizeDescription(unitCost.machineRepair.rows[0].description) ===
        `${productLine.toUpperCase()} MACHINE REPAIR`,
    `found [${unitCost.machineRepair.rows.map((row) => row.description).join(", ")}]`
  );
  compareNumber({
    id: `${productLine}.unit.machineRepair.derivedUnit`,
    label: `${productLine.toUpperCase()} machine repair unit formula`,
    actual: unitCost.machineRepair.unit,
    expected: unitOf(unitCost.machineRepair.amount, productionBags),
    measure: "unit",
  });
  const expectedRepairUnit = unitOf(
    Number(unitFixture.machine_repair.amount) + repairComparison.allowedDeltaScaled / 100,
    productionBags
  );
  compareNumber({
    id: `${productLine}.unit.machineRepair.unit`,
    label: `${productLine.toUpperCase()} machine repair printed unit`,
    actual: unitCost.machineRepair.unit,
    expected: unitFixture.machine_repair.unit,
    measure: "unit",
    allowedDeltaScaled:
      scaled(expectedRepairUnit, "unit") - scaled(unitFixture.machine_repair.unit, "unit"),
    reason: repairComparison.reason,
  });

  const groupKeys = ["ingredient", "packing", "salary", "salesman", "habuk", "expenses"];
  const beforeFixture = sumMoney(groupKeys.map((key) => references[key].fixtureAmount));
  const beforeAllowed = groupKeys.reduce((total, key) => total + references[key].allowedDelta, 0);
  compareNumber({
    id: `${productLine}.unit.totalBeforeRepair.amount`,
    label: `${productLine.toUpperCase()} total before repair`,
    actual: unitCost.totalBeforeRepair.amount,
    expected: beforeFixture,
    measure: "money",
    allowedDeltaScaled: beforeAllowed,
    reason: "derived from the atomic cost rows",
  });
  compareNumber({
    id: `${productLine}.unit.totalBeforeRepair.unit`,
    label: `${productLine.toUpperCase()} total-before-repair unit`,
    actual: unitCost.totalBeforeRepair.unit,
    expected: unitOf(beforeFixture, productionBags),
    measure: "unit",
    allowedDeltaScaled:
      scaled(unitOf(beforeFixture + beforeAllowed / 100, productionBags), "unit") -
      scaled(unitOf(beforeFixture, productionBags), "unit"),
    reason: "derived from the atomic cost rows",
  });

  const totalFixture = sumMoney([beforeFixture, references.machineRepair.fixtureAmount]);
  const totalAllowed = beforeAllowed + references.machineRepair.allowedDelta;
  compareNumber({
    id: `${productLine}.unit.total.amount`,
    label: `${productLine.toUpperCase()} unit-cost total`,
    actual: unitCost.total.amount,
    expected: totalFixture,
    measure: "money",
    allowedDeltaScaled: totalAllowed,
    reason: "derived from the atomic cost rows and machine repair",
  });

  if (productLine === "mee") {
    compareNumber({
      id: "mee.fixture.totalBeforeRepair.amount",
      label: "MEE fixture total-before-repair consistency",
      actual: unitFixture.total_before_repair.amount,
      expected: beforeFixture,
      measure: "money",
    });
    compareNumber({
      id: "mee.fixture.total.amount",
      label: "MEE fixture unit-cost total consistency",
      actual: unitFixture.total.amount,
      expected: totalFixture,
      measure: "money",
    });
    checkStructure(
      "mee.fixture.totalBeforeRepair.unitOcrOffset",
      "MEE stored total-before-repair unit preserves its 0.000047 OCR offset",
      scaled(unitFixture.total_before_repair.unit, "unit") -
        scaled(unitOf(beforeFixture, productionBags), "unit") === -47
    );
    checkStructure(
      "mee.fixture.total.unitOcrOffset",
      "MEE stored total unit preserves its 0.000047 OCR offset",
      scaled(unitFixture.total.unit, "unit") -
        scaled(unitOf(totalFixture, productionBags), "unit") === -47
    );
    informationalNotes.push(
      `MEE stored total units ${unitFixture.total_before_repair.unit.toFixed(6)} / ` +
        `${unitFixture.total.unit.toFixed(6)} differ from canonical amount/production units ` +
        `${unitOf(beforeFixture, productionBags).toFixed(6)} / ${unitOf(totalFixture, productionBags).toFixed(6)}.`
    );
  } else {
    informationalNotes.push(
      `BIHUN stored total-before-repair/total amounts ${unitFixture.total_before_repair.amount.toFixed(2)} / ` +
        `${unitFixture.total.amount.toFixed(2)} belong to the alternate handwritten JAGUNG scenario; ` +
        `printed atomic rows canonically total ${beforeFixture.toFixed(2)} / ${totalFixture.toFixed(2)}. ` +
        `Their displayed units also sit 0.000045 below their own amount/production math.`
    );
  }
  compareNumber({
    id: `${productLine}.unit.total.unit`,
    label: `${productLine.toUpperCase()} unit-cost total unit`,
    actual: unitCost.total.unit,
    expected: unitOf(totalFixture, productionBags),
    measure: "unit",
    allowedDeltaScaled:
      scaled(unitOf(totalFixture + totalAllowed / 100, productionBags), "unit") -
      scaled(unitOf(totalFixture, productionBags), "unit"),
    reason: "derived from the atomic cost rows and machine repair",
  });

  const addBack = addBackFixture(fixtureLine);
  compareNumber({
    id: `${productLine}.fixture.unit.addBackAmount`,
    label: `${productLine.toUpperCase()} unit-page Add Back amount matches P&L Add Back`,
    actual: unitFixture.add_back_handwritten.amount,
    expected: addBack.amount,
    measure: "money",
  });
  compareNumber({
    id: `${productLine}.fixture.unit.addBackHandwrittenUnit`,
    label: `${productLine.toUpperCase()} handwritten Add Back unit is preserved`,
    actual: unitFixture.add_back_handwritten.unit,
    expected: HANDWRITTEN_ADD_BACK_UNITS[productLine],
    measure: "unit",
  });
  compareNumber({
    id: `${productLine}.unit.addBack.amount`,
    label: `${productLine.toUpperCase()} Add Back`,
    actual: unitCost.addBack.amount,
    expected: addBack.amount,
    measure: "money",
  });
  compareNumber({
    id: `${productLine}.unit.addBack.unit`,
    label: `${productLine.toUpperCase()} Add Back per production bag`,
    actual: unitCost.addBack.unit,
    expected: unitOf(addBack.amount, productionBags),
    measure: "unit",
  });
  const canonicalAddBackUnit = unitOf(addBack.amount, productionBags);
  if (scaled(unitFixture.add_back_handwritten.unit, "unit") !== scaled(canonicalAddBackUnit, "unit")) {
    informationalNotes.push(
      `${productLine.toUpperCase()} handwritten Add Back unit ` +
        `${Number(unitFixture.add_back_handwritten.unit).toFixed(6)} differs from the live rounded ` +
        `amount/production value ${canonicalAddBackUnit.toFixed(6)}; the engine value is canonical.`
    );
  }

  const fixtureFinalUnit = unitOf(totalFixture - Number(addBack.amount), productionBags);
  const expectedEngineFinalUnit = unitOf(
    totalFixture + totalAllowed / 100 - Number(addBack.amount),
    productionBags
  );
  compareNumber({
    id: `${productLine}.unit.finalUnitCost`,
    label: `${productLine.toUpperCase()} final unit cost`,
    actual: unitCost.finalUnitCost,
    expected: fixtureFinalUnit,
    measure: "unit",
    allowedDeltaScaled:
      scaled(expectedEngineFinalUnit, "unit") - scaled(fixtureFinalUnit, "unit"),
    reason: "canonical printed-source components plus documented atomic deltas",
  });

  if (unitFixture.final_unit_cost_handwritten !== fixtureFinalUnit) {
    informationalNotes.push(
      `${productLine.toUpperCase()} handwritten final unit ${unitFixture.final_unit_cost_handwritten.toFixed(6)} ` +
        `uses legacy/OCR or handwritten component totals; canonical printed-source math is ${fixtureFinalUnit.toFixed(6)}.`
    );
  }
  if (productLine === "mee") {
    checkStructure(
      "mee.fixture.finalUnitCost.handwrittenOcrOffset",
      "MEE handwritten final unit preserves its 0.000047 OCR offset",
      scaled(unitFixture.final_unit_cost_handwritten, "unit") -
        scaled(fixtureFinalUnit, "unit") === -47
    );
  }
  if (productLine === "bihun") {
    informationalNotes.push(
      `BIHUN atomic printed ingredient rows sum to 276,904.54; the fixture's 276,004.54 printed subtotal ` +
        `is an OCR inconsistency and 270,744.54 is the separate handwritten JAGUNG scenario; its displayed ` +
        `unit is 0.000001 below normal six-decimal rounding.`
    );
  }

  return references;
}

/**
 * Compare the P&L page, its formulas, anchor, trail and Add Back result.
 *
 * @param {string} productLine
 * @param {object} report
 * @param {object} fixtureLine
 * @param {Record<string, { fixtureAmount: number, allowedDelta: number }>} unitReferences
 */
function compareProfitAndLoss(productLine, report, fixtureLine, unitReferences) {
  const prefix = `${productLine}.pl`;
  const productLabel = productLine.toUpperCase();
  const returnRows = fixtureLine.purchases.filter((row) => row.code.endsWith("RET"));
  const purchaseRows = fixtureLine.purchases.filter((row) => !row.code.endsWith("RET"));

  compareCodeRows({
    prefix: `${prefix}.product`,
    label: `${productLabel} product`,
    actualRows: report.pl.products,
    fixtureRows: fixtureLine.products,
    compareBags: true,
  });
  compareCodeRows({
    prefix: `${prefix}.closing`,
    label: `${productLabel} closing stock`,
    actualRows: report.pl.closingStock,
    fixtureRows: fixtureLine.closing_stock,
  });
  compareCodeRows({
    prefix: `${prefix}.opening`,
    label: `${productLabel} opening stock`,
    actualRows: report.pl.openingStock,
    fixtureRows: fixtureLine.opening_stock,
  });
  compareCodeRows({
    prefix: `${prefix}.purchase`,
    label: `${productLabel} purchase`,
    actualRows: report.pl.purchases,
    fixtureRows: purchaseRows,
  });
  compareCodeRows({
    prefix: `${prefix}.return`,
    label: `${productLabel} return`,
    actualRows: report.pl.returns,
    fixtureRows: returnRows,
  });

  const fixtureSales = Number(fixtureLine.totals.amount);
  const fixtureSalesBags = Number(fixtureLine.totals.bags);
  compareNumber({
    id: `${prefix}.totals.amount`,
    label: `${productLabel} sales total`,
    actual: report.pl.totals.amount,
    expected: fixtureSales,
    measure: "money",
  });
  compareNumber({
    id: `${prefix}.totals.bags`,
    label: `${productLabel} sales bags`,
    actual: report.pl.totals.bags,
    expected: fixtureSalesBags,
    measure: "quantity",
  });

  const fixtureClosing = sumRowAmounts(fixtureLine.closing_stock);
  const closingAllowed = sumRowAllowedDeltas(`${prefix}.closing`, fixtureLine.closing_stock);
  const fixtureOpening = sumRowAmounts(fixtureLine.opening_stock);
  const openingAllowed = sumRowAllowedDeltas(`${prefix}.opening`, fixtureLine.opening_stock);
  const fixturePurchases = sumRowAmounts(purchaseRows);
  const purchaseAllowed = sumRowAllowedDeltas(`${prefix}.purchase`, purchaseRows);
  const fixtureReturns = sumRowAmounts(returnRows);
  const returnsAllowed = sumRowAllowedDeltas(`${prefix}.return`, returnRows);
  const fixtureClosingTotalField = productLine === "mee"
    ? fixtureLine.closing_stock_subtotals.with_finished
    : fixtureLine.closing_stock_subtotals.with_finished_printed;
  const fixtureOpeningTotalField = productLine === "mee"
    ? fixtureLine.opening_stock_subtotals.grand_total
    : fixtureLine.opening_stock_subtotals.grand_total_printed;
  const fixtureUsageBaseField = productLine === "mee"
    ? fixtureLine.footer.os_plus_purchases_plus_returns
    : fixtureLine.footer.os_plus_purchases_plus_returns_printed;
  const closingPackingCodes = productLine === "mee"
    ? new Set(["CS_MPMS", "CS_MPMB", "CS_MTAP"])
    : new Set(["CS_BPMS", "CS_BPMB", "CS_BTAP"]);
  const openingPackingCodes = productLine === "mee"
    ? new Set(["OS_MPMS", "OS_MPMB", "OS_MTAP"])
    : new Set(["OS_BPMS", "OS_BPMB", "OS_BTAP"]);
  const fixtureClosingPacking = sumRowAmounts(
    fixtureLine.closing_stock.filter((row) => closingPackingCodes.has(normalizeCode(row.code)))
  );
  const fixtureOpeningPacking = sumRowAmounts(
    fixtureLine.opening_stock.filter((row) => openingPackingCodes.has(normalizeCode(row.code)))
  );

  compareNumber({
    id: `${prefix}.fixture.closingTotal`,
    label: `${productLabel} fixture closing total consistency`,
    actual: fixtureClosingTotalField,
    expected: fixtureClosing,
    measure: "money",
  });
  compareNumber({
    id: `${prefix}.fixture.closingPacking`,
    label: `${productLabel} fixture closing-packing subtotal consistency`,
    actual: fixtureLine.closing_stock_subtotals.packing,
    expected: fixtureClosingPacking,
    measure: "money",
  });
  compareNumber({
    id: `${prefix}.fixture.openingTotal`,
    label: `${productLabel} fixture opening total consistency`,
    actual: fixtureOpeningTotalField,
    expected: fixtureOpening,
    measure: "money",
  });
  compareNumber({
    id: `${prefix}.fixture.openingPacking`,
    label: `${productLabel} fixture opening-packing subtotal consistency`,
    actual: fixtureLine.opening_stock_subtotals.packing,
    expected: fixtureOpeningPacking,
    measure: "money",
  });
  compareNumber({
    id: `${prefix}.fixture.purchaseTotal`,
    label: `${productLabel} fixture purchase total consistency`,
    actual: fixtureLine.purchase_total,
    expected: fixturePurchases,
    measure: "money",
  });
  compareNumber({
    id: `${prefix}.fixture.usageBase`,
    label: `${productLabel} fixture opening + purchases + returns consistency`,
    actual: fixtureUsageBaseField,
    expected: sumMoney([fixtureOpening, fixturePurchases, fixtureReturns]),
    measure: "money",
  });
  if (productLine === "mee") {
    const fixtureOpeningIngredientGroup = sumRowAmounts(
      fixtureLine.opening_stock.filter((row) =>
        new Set(["OS_MGRM1", "OS_MTH11", "OS_MSOD1", "OS_MSOD2", "OS_MSD"]).has(
          normalizeCode(row.code)
        )
      )
    );
    compareNumber({
      id: "mee.pl.fixture.openingIngredientGroup",
      label: "MEE fixture opening GARAM/TH-1/SODA subtotal consistency",
      actual: fixtureLine.opening_stock_subtotals.ingredients_soda_group,
      expected: fixtureOpeningIngredientGroup,
      measure: "money",
    });
    compareNumber({
      id: "mee.pl.fixture.closingPlusSales",
      label: "MEE fixture closing stock plus sales consistency",
      actual: fixtureLine.closing_stock_subtotals.grand_total_with_sales,
      expected: sumMoney([fixtureClosing, fixtureSales]),
      measure: "money",
    });
  } else {
    informationalNotes.push(
      "BIHUN handwritten closing/opening/usage/gross/P&L composite fields are an alternate JAGUNG scenario; " +
        "the verifier gates their internal consistency separately and uses the printed atomic-source profile " +
        "for engine parity."
    );
  }

  compareNumber({
    id: `${prefix}.closingTotal`,
    label: `${productLabel} closing-stock total`,
    actual: report.pl.closingStockTotal,
    expected: fixtureClosing,
    measure: "money",
    allowedDeltaScaled: closingAllowed,
    reason: "sum of closing-stock row deltas",
  });
  compareNumber({
    id: `${prefix}.closingPlusSales`,
    label: `${productLabel} closing stock plus sales`,
    actual: report.pl.closingStockPlusSales,
    expected: sumMoney([fixtureClosing, fixtureSales]),
    measure: "money",
    allowedDeltaScaled: closingAllowed,
    reason: "sum of closing-stock row deltas",
  });
  compareNumber({
    id: `${prefix}.openingTotal`,
    label: `${productLabel} opening-stock total`,
    actual: report.pl.openingStockTotal,
    expected: fixtureOpening,
    measure: "money",
    allowedDeltaScaled: openingAllowed,
    reason: "sum of opening-stock row deltas",
  });
  compareNumber({
    id: `${prefix}.purchaseTotal`,
    label: `${productLabel} purchase total`,
    actual: report.pl.purchaseTotal,
    expected: fixturePurchases,
    measure: "money",
    allowedDeltaScaled: purchaseAllowed,
    reason: "sum of purchase row deltas",
  });
  compareNumber({
    id: `${prefix}.returnsTotal`,
    label: `${productLabel} returns total`,
    actual: report.pl.returnsTotal,
    expected: fixtureReturns,
    measure: "money",
    allowedDeltaScaled: returnsAllowed,
    reason: "sum of return row deltas",
  });

  const fixtureUsageBase = sumMoney([fixtureOpening, fixturePurchases, fixtureReturns]);
  const usageBaseAllowed = openingAllowed + purchaseAllowed + returnsAllowed;
  const fixtureUsage = sumMoney([fixtureUsageBase, -fixtureClosing]);
  const usageAllowed = usageBaseAllowed - closingAllowed;
  compareNumber({
    id: `${prefix}.usageBase`,
    label: `${productLabel} opening + purchases + returns`,
    actual: report.pl.openingPlusPurchasesPlusReturns,
    expected: fixtureUsageBase,
    measure: "money",
    allowedDeltaScaled: usageBaseAllowed,
    reason: "derived from source-row deltas",
  });
  compareNumber({
    id: `${prefix}.usage`,
    label: `${productLabel} usage`,
    actual: report.pl.usage,
    expected: fixtureUsage,
    measure: "money",
    allowedDeltaScaled: usageAllowed,
    reason: "opening + purchases + returns - closing stock",
  });

  const fixtureGross = productLine === "mee"
    ? Number(fixtureLine.footer.gross_profit)
    : Number(fixtureLine.footer.gross_profit_printed);
  const grossAllowed = -usageAllowed;
  compareNumber({
    id: `${prefix}.gross`,
    label: `${productLabel} gross profit`,
    actual: report.pl.gross,
    expected: fixtureGross,
    measure: "money",
    allowedDeltaScaled: grossAllowed,
    reason: "sales - usage",
  });

  const expenseKeys = ["salary", "salesman", "habuk", "expenses", "machineRepair"];
  const fixtureExpenseComposition = sumMoney(
    expenseKeys.map((key) => unitReferences[key].fixtureAmount)
  );
  const expenseCompositionAllowed = expenseKeys.reduce(
    (total, key) => total + unitReferences[key].allowedDelta,
    0
  );
  const fixturePlExpenses = Number(fixtureLine.footer.expenses);
  const q10Gap = Math.round((fixtureExpenseComposition - fixturePlExpenses) * 100);
  compareNumber({
    id: `${prefix}.fixture.q10Gap`,
    label: `${productLabel} legacy Q10 page-to-page gap`,
    actual: q10Gap / 100,
    expected: Q10_GAP_CENTS[productLine] / 100,
    measure: "money",
  });
  const plExpensesAllowed = expenseCompositionAllowed + Q10_GAP_CENTS[productLine];
  informationalNotes.push(
    `${productLabel} Q10: legacy unit-cost components exceed the P&L EXPENSES print by ` +
      `RM${(q10Gap / 100).toFixed(2)} before live-source deltas.`
  );
  compareNumber({
    id: `${prefix}.expenses`,
    label: `${productLabel} P&L expenses`,
    actual: report.pl.expenses,
    expected: fixturePlExpenses,
    measure: "money",
    allowedDeltaScaled: plExpensesAllowed,
    reason: "Q10 legacy page-to-page residue plus documented unit-cost source deltas",
  });

  for (const key of expenseKeys) {
    compareNumber({
      id: `${prefix}.expenseBreakdown.${key}`,
      label: `${productLabel} P&L expense breakdown ${key}`,
      actual: report.pl.expenseBreakdown[key],
      expected: unitReferences[key].fixtureAmount,
      measure: "money",
      allowedDeltaScaled: unitReferences[key].allowedDelta,
      reason: "same derived group as the unit-cost page",
    });
  }

  const fixtureProfitLoss = productLine === "mee"
    ? Number(fixtureLine.footer.pl)
    : Number(fixtureLine.footer.pl_printed);
  const profitLossAllowed = grossAllowed - plExpensesAllowed;
  compareNumber({
    id: `${prefix}.profitLoss`,
    label: `${productLabel} P/L`,
    actual: report.pl.profitLoss,
    expected: fixtureProfitLoss,
    measure: "money",
    allowedDeltaScaled: profitLossAllowed,
    reason: "gross profit - derived expenses",
  });

  const fixtureAccumulative = Number(fixtureLine.footer.accumulative);
  compareNumber({
    id: `${prefix}.accumulative`,
    label: `${productLabel} accumulative P/L`,
    actual: report.pl.accumulative,
    expected: fixtureAccumulative,
    measure: "money",
    allowedDeltaScaled: profitLossAllowed,
    reason: "confirmed anchor + current P/L",
  });
  compareNumber({
    id: `${prefix}.anchor`,
    label: `${productLabel} accumulative anchor`,
    actual: report.anchor?.accumulative,
    expected: sumMoney([fixtureAccumulative, -fixtureProfitLoss]),
    measure: "money",
  });
  checkStructure(
    `${prefix}.anchorDate`,
    `${productLabel} anchor date`,
    report.anchor?.asOfDate === "2026-06-01",
    `found ${String(report.anchor?.asOfDate)}`
  );
  checkStructure(
    `${prefix}.trail.coverage`,
    `${productLabel} June accumulation trail`,
    report.monthlyTrail.length === 1 && report.monthlyTrail[0].monthKey === "2026-06",
    `found ${JSON.stringify(report.monthlyTrail)}`
  );
  if (report.monthlyTrail.length === 1) {
    compareNumber({
      id: `${prefix}.trail.profitLoss`,
      label: `${productLabel} trail P/L`,
      actual: report.monthlyTrail[0].profitLoss,
      expected: fixtureProfitLoss,
      measure: "money",
      allowedDeltaScaled: profitLossAllowed,
      reason: "same current-month P/L",
    });
    compareNumber({
      id: `${prefix}.trail.accumulative`,
      label: `${productLabel} trail accumulative`,
      actual: report.monthlyTrail[0].accumulative,
      expected: fixtureAccumulative,
      measure: "money",
      allowedDeltaScaled: profitLossAllowed,
      reason: "same confirmed anchor walk",
    });
  }

  const addBack = Number(addBackFixture(fixtureLine).amount);
  compareNumber({
    id: `${prefix}.addBack`,
    label: `${productLabel} P&L Add Back`,
    actual: report.pl.addBack,
    expected: addBack,
    measure: "money",
  });
  const canonicalFinal = sumMoney([fixtureProfitLoss, addBack]);
  compareNumber({
    id: `${prefix}.finalProfitLoss`,
    label: `${productLabel} final P/L`,
    actual: report.pl.finalProfitLoss,
    expected: canonicalFinal,
    measure: "money",
    allowedDeltaScaled: profitLossAllowed,
    reason: "printed-source P/L + handwritten Add Back",
  });

  const storedFinal = Number(fixtureLine.footer.final_pl_handwritten);
  if (productLine === "mee") {
    compareNumber({
      id: "mee.fixture.finalProfitLoss.handwritten",
      label: "MEE handwritten final P/L consistency",
      actual: storedFinal,
      expected: canonicalFinal,
      measure: "money",
    });
  }
  if (storedFinal !== canonicalFinal) {
    informationalNotes.push(
      `${productLabel} handwritten final P/L ${storedFinal.toFixed(2)} uses the alternate handwritten ` +
        `stock/P&L scenario; canonical printed-source final is ${canonicalFinal.toFixed(2)}.`
    );
  }

  checkStructure(
    `${prefix}.warnings`,
    `${productLabel} report warnings`,
    report.warnings.length === 0,
    report.warnings.join("; ")
  );
}

/** @param {object} client @returns {Promise<object>} */
async function loadFixEvidence(client) {
  const journal = await client.query(
    `SELECT je.reference_no, je.entry_type,
            TO_CHAR(je.entry_date, 'YYYY-MM-DD') AS entry_date,
            je.description, je.display_reference, je.status,
            je.source_type, je.source_id, je.manual_override,
            je.total_debit, je.total_credit,
            purchase_line.account_code AS purchase_account,
            purchase_line.particulars AS purchase_particulars,
            purchase_line.debit_amount AS purchase_debit,
            purchase_line.credit_amount AS purchase_credit,
            control_line.account_code AS control_account,
            control_line.particulars AS control_particulars,
            control_line.debit_amount AS control_debit,
            control_line.credit_amount AS control_credit,
            (SELECT COUNT(*)::int FROM journal_entry_lines WHERE journal_entry_id = je.id) AS line_count,
            (SELECT COUNT(*) FROM adjustment_documents WHERE journal_entry_id = je.id)
              + (SELECT COUNT(*) FROM bank_ins WHERE journal_entry_id = je.id)
              + (SELECT COUNT(*) FROM invoices WHERE journal_entry_id = je.id)
              + (SELECT COUNT(*) FROM payments WHERE journal_entry_id = je.id)
              + (SELECT COUNT(*) FROM purchase_invoices WHERE journal_entry_id = je.id)
              + (SELECT COUNT(*) FROM receipts WHERE journal_entry_id = je.id)
              + (SELECT COUNT(*) FROM rv_registry WHERE journal_entry_id = je.id)
              + (SELECT COUNT(*) FROM self_billed_invoices WHERE journal_entry_id = je.id)
              + (SELECT COUNT(*) FROM supplier_payments WHERE journal_entry_id = je.id)
              AS owner_count
       FROM journal_entries je
       JOIN journal_entry_lines purchase_line
         ON purchase_line.id = 10535 AND purchase_line.journal_entry_id = je.id
       JOIN journal_entry_lines control_line
         ON control_line.id = 10536 AND control_line.journal_entry_id = je.id
      WHERE je.id = 3902`
  );
  const stock = await client.query(
    `SELECT e.year, e.month, e.product_line, e.material_id, e.variant_id,
            e.adjustment_quantity, e.quantity, e.unit_cost, e.adjustment_value,
            e.custom_name, e.custom_description, e.notes,
            m.code AS material_code, m.is_active AS material_is_active,
            v.variant_name, v.is_active AS variant_is_active, v.default_unit_cost,
            (SELECT COUNT(*)::int
               FROM material_stock_entries logical_row
              WHERE logical_row.year = e.year
                AND logical_row.month = e.month
                AND logical_row.product_line = e.product_line
                AND logical_row.material_id = e.material_id
                AND logical_row.variant_id = e.variant_id) AS logical_row_count
       FROM material_stock_entries e
       JOIN materials m ON m.id = e.material_id
       JOIN material_variants v ON v.id = e.variant_id AND v.material_id = e.material_id
      WHERE e.id = 171`
  );
  // Q14: the three June MEE label/sticker rows the co-worker re-rated in production
  // on 2026-07-29. Each had been keyed at the stale material default instead of the
  // June rate; together they were the whole +RM883.60 CS_MPMS overstatement.
  const q14 = await client.query(
    `SELECT m.code AS material_code, e.variant_id,
            e.adjustment_quantity, e.unit_cost, e.adjustment_value,
            m.default_unit_cost
       FROM material_stock_entries e
       JOIN materials m ON m.id = e.material_id
      WHERE e.year = 2026 AND e.month = 6 AND e.product_line = 'mee'
        AND (
          (m.code = 'M35' AND e.variant_id = 47)
          OR (m.code = 'M40' AND e.variant_id IS NULL)
          OR (m.code = 'M8' AND e.variant_id = 46)
        )
      ORDER BY m.code`
  );
  // Rows whose stored value disagrees with quantity x unit_cost. /stock/batch
  // recomputes the value from the rate on every save, so any such row silently
  // changes value the next time its month is re-saved through the Material Stock page.
  const inconsistent = await client.query(
    `SELECT e.year, e.month, e.product_line, m.code AS material_code, e.variant_id,
            e.unit_cost, e.adjustment_value,
            ROUND(e.adjustment_quantity * e.unit_cost, 2) AS quantity_times_cost
       FROM material_stock_entries e
       JOIN materials m ON m.id = e.material_id
      WHERE e.year = 2026 AND e.product_line IN ('mee', 'bihun')
        AND ABS(e.adjustment_value - ROUND(e.adjustment_quantity * e.unit_cost, 2)) > 0.01
      ORDER BY e.month, e.product_line, m.code`
  );
  return {
    journal: journal.rows[0] || null,
    stock: stock.rows[0] || null,
    q14: q14.rows,
    inconsistent: inconsistent.rows,
  };
}

/** @param {object} evidence */
function compareFixEvidence(evidence) {
  const journal = evidence.journal;
  checkStructure(
    "fix1.identity",
    "FIX-1 journal identity remains source-less posted PUR 000199",
    Boolean(journal) &&
      journal.reference_no === "000199" &&
      journal.entry_type === "PUR" &&
      journal.entry_date === "2026-06-22" &&
      journal.description === "BERAS(300BAG XRM135)" &&
      journal.display_reference === null &&
      journal.status === "posted" &&
      journal.source_type === null &&
      journal.source_id === null &&
      journal.manual_override === false &&
      Number(journal.line_count) === 2 &&
      Number(journal.owner_count) === 0 &&
      journal.purchase_account === "PU_BBER" &&
      journal.purchase_particulars === "PUNCAK NIAGA(300BAG XRM135)" &&
      journal.control_account === "CR_PN" &&
      journal.control_particulars === "BERAS(300BAG XRM135)",
    journal ? JSON.stringify(journal) : "journal 3902 missing"
  );
  if (journal) {
    for (const [key, value] of [
      ["totalDebit", journal.total_debit],
      ["totalCredit", journal.total_credit],
      ["purchaseDebit", journal.purchase_debit],
      ["controlCredit", journal.control_credit],
    ]) {
      compareNumber({
        id: `fix1.${key}`,
        label: `FIX-1 ${key}`,
        actual: value,
        expected: 40500,
        measure: "money",
      });
    }
    compareNumber({
      id: "fix1.purchaseCredit",
      label: "FIX-1 purchase-line credit",
      actual: journal.purchase_credit,
      expected: 0,
      measure: "money",
    });
    compareNumber({
      id: "fix1.controlDebit",
      label: "FIX-1 control-line debit",
      actual: journal.control_debit,
      expected: 0,
      measure: "money",
    });
  }

  const stock = evidence.stock;
  checkStructure(
    "fix2.identity",
    "FIX-2 stock identity remains June BIHUN B14 variant 118",
    Boolean(stock) &&
      Number(stock.year) === 2026 &&
      Number(stock.month) === 6 &&
      stock.product_line === "bihun" &&
      Number(stock.material_id) === 82 &&
      Number(stock.variant_id) === 118 &&
      Number(stock.adjustment_quantity) === 1 &&
      Number(stock.quantity) === 0 &&
      stock.custom_name === null &&
      stock.custom_description === null &&
      stock.notes === null &&
      stock.material_code === "B14" &&
      stock.material_is_active === true &&
      stock.variant_name === "8.50 x 33.2KG (SG)" &&
      stock.variant_is_active === true &&
      Number(stock.logical_row_count) === 1,
    stock ? JSON.stringify(stock) : "material_stock_entries row 171 missing"
  );
  if (stock) {
    compareNumber({
      id: "fix2.unitCost",
      label: "FIX-2 B14 unit cost",
      actual: stock.unit_cost,
      expected: 282.2,
      measure: "money",
    });
    compareNumber({
      id: "fix2.adjustmentValue",
      label: "FIX-2 B14 stock value",
      actual: stock.adjustment_value,
      expected: 282.2,
      measure: "money",
    });
    if (Number(stock.default_unit_cost) === 282.5) {
      informationalNotes.push(
        "Material variant 118 still defaults to RM282.50. The approved fix covers June row 171 only; " +
          "future fallback pricing needs separate user approval."
      );
    }
  }

  // Q14 — the June rate corrections applied in production on 2026-07-29.
  const Q14_ROWS = [
    { code: "M8", variantId: 46, quantity: 58000, unitCost: 0.035, value: 2030, staleDefault: 0.04 },
    { code: "M35", variantId: 47, quantity: 47879, unitCost: 0.075, value: 3590.92, staleDefault: 0.08 },
    { code: "M40", variantId: null, quantity: 70840, unitCost: 0.225, value: 15939, staleDefault: 0.23 },
  ];
  checkStructure(
    "q14.rowSet",
    "Q14 row set remains the three June MEE label/sticker rows",
    evidence.q14.length === Q14_ROWS.length &&
      Q14_ROWS.every((expected) =>
        evidence.q14.some(
          (row) =>
            row.material_code === expected.code &&
            (row.variant_id === null ? null : Number(row.variant_id)) === expected.variantId
        )
      ),
    JSON.stringify(evidence.q14)
  );
  for (const expected of Q14_ROWS) {
    const row = evidence.q14.find(
      (candidate) =>
        candidate.material_code === expected.code &&
        (candidate.variant_id === null ? null : Number(candidate.variant_id)) === expected.variantId
    );
    if (!row) continue;
    const label = `Q14 ${expected.code}${expected.variantId ? `/${expected.variantId}` : ""}`;
    compareNumber({
      id: `q14.${expected.code}.quantity`,
      label: `${label} quantity`,
      actual: row.adjustment_quantity,
      expected: expected.quantity,
      measure: "unit",
    });
    compareNumber({
      id: `q14.${expected.code}.unitCost`,
      label: `${label} June unit cost`,
      actual: row.unit_cost,
      expected: expected.unitCost,
      measure: "unit",
    });
    compareNumber({
      id: `q14.${expected.code}.value`,
      label: `${label} stock value`,
      actual: row.adjustment_value,
      expected: expected.value,
      measure: "money",
    });
    if (Number(row.default_unit_cost) === expected.staleDefault) {
      informationalNotes.push(
        `Material ${expected.code} still defaults to RM${expected.staleDefault.toFixed(4)} ` +
          `while its June rate is RM${expected.unitCost.toFixed(4)}. The Q14 fix covers June 2026 only; ` +
          `a later month keyed without an explicit rate would reintroduce the overstatement.`
      );
    }
  }

  if (evidence.inconsistent.length > 0) {
    informationalNotes.push(
      `${evidence.inconsistent.length} 2026 stock row(s) store a value that disagrees with ` +
        `quantity x unit_cost, so re-saving their month through the Material Stock page would ` +
        `change the value: ` +
        evidence.inconsistent
          .map(
            (row) =>
              `${row.year}-${String(row.month).padStart(2, "0")} ${row.product_line} ` +
              `${row.material_code}${row.variant_id ? `/${row.variant_id}` : ""} ` +
              `${Number(row.adjustment_value).toFixed(2)} -> ${Number(row.quantity_times_cost).toFixed(2)}`
          )
          .join("; ") +
        "."
    );
  }
}

/** @param {Comparison} comparison @returns {string} */
function comparisonLine(comparison) {
  if (comparison.measure === "structure") {
    return `${comparison.label}${comparison.detail ? ` — ${comparison.detail}` : ""}`;
  }
  const actual = comparison.actualScaled === null
    ? "null"
    : formatScaled(comparison.actualScaled, comparison.measure);
  const expected = comparison.expectedScaled === null
    ? "null"
    : formatScaled(comparison.expectedScaled, comparison.measure);
  const delta = comparison.actualScaled === null || comparison.expectedScaled === null
    ? "n/a"
    : formatSignedScaled(comparison.actualScaled - comparison.expectedScaled, comparison.measure);
  return `${comparison.label}: engine ${actual}, target ${expected}, delta ${delta}` +
    `${comparison.reason ? ` — ${comparison.reason}` : ""}` +
    `${comparison.detail ? ` — ${comparison.detail}` : ""}`;
}

/** @param {Comparison[]} rows */
function printResults(rows) {
  const expected = rows.filter((row) => row.status === "EXPECTED");
  const failed = rows.filter((row) => row.status === "FAIL");
  const passed = rows.filter((row) => row.status === "PASS");

  console.log("Estimated Report Phase 3 — June 2026 engine parity\n");
  console.log("Documented engine-minus-fixture deltas:");
  for (const row of expected) console.log(`EXPECTED  ${comparisonLine(row)}`);
  if (expected.length === 0) console.log("(none)");

  if (failed.length > 0) {
    console.log("\nUnexpected failures:");
    for (const row of failed) console.log(`FAIL      ${comparisonLine(row)}`);
  }

  if (informationalNotes.length > 0) {
    console.log("\nInformation:");
    for (const note of informationalNotes) console.log(`INFO      ${note}`);
  }

  console.log(
    `\nSummary: ${passed.length} exact checks, ${expected.length} documented deltas, ` +
      `${failed.length} failures, ${informationalNotes.length} notes.`
  );
}

let db = null;
let client = null;
let transactionOpen = false;
let fatalError = null;

try {
  const { computeEstimatedReport, monthEpochRange } = await import(
    "../../../src/routes/stock/estimated-report-engine.js"
  );
  const fixture = readFixture();
  compareAlternateFixtureEvidence(fixture);
  db = createDatabasePool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "tienhock",
    password: process.env.DB_PASSWORD || "foodmaker",
    port: Number(process.env.DB_PORT || 5434),
  });
  client = await db.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  transactionOpen = true;

  for (const productLine of PRODUCT_LINES) {
    const addBack = addBackFixture(fixture[productLine]);
    const temporaryInputId = productLine === "mee" ? -20260601 : -20260602;
    await client.query(
      `INSERT INTO estimated_report_inputs (id, product_line, year, month, add_back, notes)
       VALUES ($5, $1, $2, $3, $4, 'Temporary Phase 3 parity verification input')
       ON CONFLICT (product_line, year, month) DO UPDATE
         SET add_back = EXCLUDED.add_back,
             notes = EXCLUDED.notes,
             updated_at = NOW()`,
      [productLine, YEAR, MONTH, addBack.amount, temporaryInputId]
    );
  }

  const reportOutput = await computeEstimatedReport(client, {
    year: YEAR,
    month: MONTH,
    productLines: PRODUCT_LINES,
  });
  const fixEvidence = await loadFixEvidence(client);

  await client.query("ROLLBACK");
  transactionOpen = false;

  checkStructure(
    "period.monthKey",
    "report period is June 2026",
    reportOutput.period.monthKey === "2026-06" &&
      reportOutput.period.start === "2026-06-01" &&
      reportOutput.period.end === "2026-06-30",
    JSON.stringify(reportOutput.period)
  );
  const epochRange = monthEpochRange(YEAR, MONTH);
  checkStructure(
    "period.klEpoch",
    "invoice window is the Asia/Kuala_Lumpur June epoch",
    epochRange.startMs === 1780243200000 && epochRange.endMs === 1782835199999,
    JSON.stringify(epochRange)
  );

  for (const productLine of PRODUCT_LINES) {
    const report = reportOutput.reports[productLine];
    const fixtureLine = fixture[productLine];
    const unitFixture = fixture.unit_cost[productLine];
    checkStructure(
      `${productLine}.report.present`,
      `${productLine.toUpperCase()} report exists`,
      Boolean(report),
      "missing from engine output"
    );
    if (!report) continue;
    const unitReferences = compareUnitCost(productLine, report, fixtureLine, unitFixture);
    compareProfitAndLoss(productLine, report, fixtureLine, unitReferences);
  }

  compareFixEvidence(fixEvidence);
  const missingRootDeltas = [...ROOT_MONEY_DELTAS.keys()].filter(
    (id) => !exercisedRootDeltas.has(id)
  );
  checkStructure(
    "knownDeltas.coverage",
    "every documented atomic delta is exercised",
    missingRootDeltas.length === 0,
    missingRootDeltas.join(", ")
  );
} catch (error) {
  fatalError = error;
} finally {
  if (transactionOpen && client) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      if (!fatalError) fatalError = rollbackError;
    }
  }
  if (client) {
    try {
      client.release();
    } catch (releaseError) {
      if (!fatalError) fatalError = releaseError;
    }
  }
  if (db) {
    try {
      await db.end();
    } catch (endError) {
      if (!fatalError) fatalError = endError;
    }
  }
}

if (fatalError) {
  console.error("Estimated Report parity verifier could not run:", fatalError);
  process.exitCode = 2;
} else {
  printResults(comparisons);
  process.exitCode = comparisons.some((comparison) => comparison.status === "FAIL") ? 1 : 0;
}

// src/routes/stock/estimated-report-engine.js
//
// Computation engine for the boss-only "Estimated Cost & Unit Cost" report
// (legacy printouts: "MEE/BIHUN ESTIMATED" + "ESTIMATED/COST"), from 06/2026.
//
// Everything is DERIVED at report time from sales, material stock, kilang stock,
// posted journal lines and production entries through the mappings seeded in
// estimated_report_lines / estimated_report_line_sources. Nothing is hardcoded and
// no journal is ever posted by this report.
//
// Doc: docs/Account/ESTIMATED_REPORT_HANDOVER.md
//
// Deliberate behaviours worth knowing:
// - A mapped source with no data is a legitimate 0.00, never a warning. PU_MSD /
//   CS_MSD / OS_MSD are permanently zero by design (handover Q11) and must stay silent.
// - Journal/stock aggregation is summed in SQL (numeric) and rounded ONCE per line, so
//   50% shared-pool splits reproduce the legacy print to the cent.
// - Invoice months use an epoch-ms window built from local (Asia/Kuala_Lumpur) time.
//   Deriving the month from the UTC calendar date instead pulls in the first 8 hours
//   of the next month and inflates sales (see CLAUDE.md rule 17).

import { addMoney, roundMoney, sumMoney, sumMoneyBy } from "../utils/moneyUtils.js";

export const PRODUCT_LINES = ["mee", "bihun"];

// Print order of the unit-cost cost groups (machine repair is handled separately
// because the legacy page prints it after the first total).
export const UNIT_COST_GROUPS = [
  "ingredient",
  "packing",
  "salary",
  "salesman",
  "habuk",
  "expenses",
];

// Guard against an accidentally ancient anchor turning one request into hundreds
// of monthly computations.
const MAX_ACCUMULATION_MONTHS = 120;

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad2 = (value) => String(value).padStart(2, "0");

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatLocalDate = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** First/last calendar day of a month as YYYY-MM-DD (for `date` columns). */
export const monthDateRange = (year, month) => ({
  start: `${year}-${pad2(month)}-01`,
  // day 0 of the next month = last day of this month
  end: formatLocalDate(new Date(year, month, 0)),
});

/** Epoch-ms window matching how invoices.createddate is written (server local time). */
export const monthEpochRange = (year, month) => ({
  startMs: new Date(year, month - 1, 1, 0, 0, 0, 0).getTime(),
  endMs: new Date(year, month, 1, 0, 0, 0, 0).getTime() - 1,
});

const previousMonth = (year, month) =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

const monthKey = (year, month) => `${year}-${pad2(month)}`;

const monthIndex = (year, month) => year * 12 + (month - 1);

const unitOf = (amount, divisor) =>
  divisor ? Number((amount / divisor).toFixed(6)) : 0;

const toAmountMap = (rows) => {
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.line_id), num(row.amount));
  }
  return map;
};

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

/** Loads the active report lines and their source members once per request. */
export async function loadDefinitions(db) {
  const linesResult = await db.query(
    `SELECT id, line_key, product_line, page, section, code, description,
            opening_code, opening_description, sort_order, source_kind, notes
       FROM estimated_report_lines
      WHERE is_active = TRUE
      ORDER BY page, section, sort_order, id`
  );

  const sourcesResult = await db.query(
    `SELECT id, line_id, source_type, sign, percentage, material_id, variant_id,
            stock_bucket, account_code, product_id, product_type, ref_line_id
       FROM estimated_report_line_sources
      ORDER BY line_id, id`
  );

  const lines = linesResult.rows.map((row) => ({
    id: Number(row.id),
    lineKey: row.line_key,
    productLine: row.product_line,
    page: row.page,
    section: row.section,
    code: row.code,
    description: row.description,
    openingCode: row.opening_code,
    openingDescription: row.opening_description,
    sortOrder: Number(row.sort_order),
    sourceKind: row.source_kind,
    notes: row.notes,
  }));

  const linesById = new Map(lines.map((line) => [line.id, line]));

  const sourcesByLine = new Map();
  for (const row of sourcesResult.rows) {
    const lineId = Number(row.line_id);
    if (!linesById.has(lineId)) continue; // inactive line
    if (!sourcesByLine.has(lineId)) sourcesByLine.set(lineId, []);
    sourcesByLine.get(lineId).push({
      id: Number(row.id),
      sourceType: row.source_type,
      sign: Number(row.sign),
      percentage: num(row.percentage),
      materialId: row.material_id === null ? null : Number(row.material_id),
      variantId: row.variant_id === null ? null : Number(row.variant_id),
      stockBucket: row.stock_bucket,
      accountCode: row.account_code,
      productId: row.product_id,
      productType: row.product_type,
      refLineId: row.ref_line_id === null ? null : Number(row.ref_line_id),
    });
  }

  return { lines, linesById, sourcesByLine };
}

// ---------------------------------------------------------------------------
// Monthly source data
// ---------------------------------------------------------------------------

/** Posted journal movement per line: SUM(debit - credit) x sign x percentage. */
async function fetchJournalAmounts(db, year, month) {
  const { start, end } = monthDateRange(year, month);
  const { rows } = await db.query(
    `WITH account_movement AS (
       SELECT jel.account_code,
              SUM(jel.debit_amount - jel.credit_amount) AS net
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND je.entry_date >= $1::date
          AND je.entry_date <= $2::date
        GROUP BY jel.account_code
     )
     SELECT s.line_id,
            SUM(COALESCE(m.net, 0) * s.sign * s.percentage / 100.0) AS amount
       FROM estimated_report_line_sources s
       LEFT JOIN account_movement m ON m.account_code = s.account_code
      WHERE s.source_type = 'account'
      GROUP BY s.line_id`,
    [start, end]
  );
  return toAmountMap(rows);
}

/**
 * Counted closing stock per line for a month. A month's material_stock_entries
 * rows ARE the counted closing stock (quantity x unit cost = adjustment_value);
 * opening stock of month M is the closing stock of month M-1.
 */
async function fetchMaterialStockAmounts(db, year, month) {
  const { rows } = await db.query(
    `SELECT s.line_id,
            SUM(e.adjustment_value * s.sign * s.percentage / 100.0) AS amount
       FROM estimated_report_line_sources s
       JOIN material_stock_entries e
         ON e.material_id = s.material_id
        AND e.product_line = s.stock_bucket
        AND (s.variant_id IS NULL OR e.variant_id = s.variant_id)
      WHERE s.source_type = 'material'
        AND e.year = $1 AND e.month = $2
      GROUP BY s.line_id`,
    [year, month]
  );
  return toAmountMap(rows);
}

/** Finished-goods (kilang) stock per line for a month. */
async function fetchKilangStockAmounts(db, year, month) {
  const { rows } = await db.query(
    `SELECT s.line_id,
            SUM(k.stock_value * s.sign * s.percentage / 100.0) AS amount
       FROM estimated_report_line_sources s
       JOIN material_stock_kilang_entries k ON k.product_line = s.stock_bucket
      WHERE s.source_type = 'kilang'
        AND k.year = $1 AND k.month = $2
      GROUP BY s.line_id`,
    [year, month]
  );
  return toAmountMap(rows);
}

/** Per-product sales aggregates, same invoice filters as /api/invoices/sales/products. */
async function fetchSalesRows(db, year, month) {
  const { startMs, endMs } = monthEpochRange(year, month);
  const { rows } = await db.query(
    `SELECT od.code AS product_id,
            p.type AS product_type,
            p.description AS product_description,
            p.sort_order AS product_sort_order,
            MIN(od.description) AS line_description,
            SUM(od.quantity) AS bags,
            SUM(od.total) AS amount,
            SUM(od.freeproduct) AS foc_bags,
            SUM(od.returnproduct) AS return_bags,
            SUM(od.returnproduct * od.price) AS return_amount
       FROM invoices i
       JOIN order_details od ON od.invoiceid = i.id
       LEFT JOIN products p ON p.id = od.code
      WHERE CAST(i.createddate AS bigint) BETWEEN $1::bigint AND $2::bigint
        AND i.invoice_status <> 'cancelled'
        AND od.issubtotal IS NOT TRUE
        AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
        AND od.code IS NOT NULL
      GROUP BY od.code, p.type, p.description, p.sort_order`,
    [startMs, endMs]
  );

  return rows.map((row) => ({
    productId: row.product_id,
    productType: row.product_type,
    description:
      row.product_description || row.line_description || row.product_id,
    sortOrder:
      row.product_sort_order === null ? null : Number(row.product_sort_order),
    bags: num(row.bags),
    amount: num(row.amount),
    focBags: num(row.foc_bags),
    returnBags: num(row.return_bags),
    returnAmount: num(row.return_amount),
  }));
}

/** Packed bags per product for a month. */
async function fetchProductionRows(db, year, month) {
  const { start, end } = monthDateRange(year, month);
  const { rows } = await db.query(
    `SELECT pe.product_id, p.type AS product_type, SUM(pe.bags_packed) AS bags
       FROM production_entries pe
       JOIN products p ON p.id = pe.product_id
      WHERE pe.entry_date >= $1::date AND pe.entry_date <= $2::date
      GROUP BY pe.product_id, p.type`,
    [start, end]
  );
  return rows.map((row) => ({
    productId: row.product_id,
    productType: row.product_type,
    bags: num(row.bags),
  }));
}

/**
 * Per-request cache. Stock is fetched once per month and reused as both the
 * closing stock of that month and the opening stock of the next one.
 */
function createSourceCache(db) {
  const stock = new Map();
  const journal = new Map();
  const sales = new Map();
  const production = new Map();

  const cached = (store, year, month, loader) => {
    const key = monthKey(year, month);
    if (!store.has(key)) store.set(key, loader());
    return store.get(key);
  };

  return {
    stock: (year, month) =>
      cached(stock, year, month, async () => {
        const merged = await fetchMaterialStockAmounts(db, year, month);
        const kilang = await fetchKilangStockAmounts(db, year, month);
        for (const [lineId, amount] of kilang) merged.set(lineId, amount);
        return merged;
      }),
    journal: (year, month) =>
      cached(journal, year, month, () => fetchJournalAmounts(db, year, month)),
    sales: (year, month) =>
      cached(sales, year, month, () => fetchSalesRows(db, year, month)),
    production: (year, month) =>
      cached(production, year, month, () =>
        fetchProductionRows(db, year, month)
      ),
  };
}

// ---------------------------------------------------------------------------
// Line evaluation
// ---------------------------------------------------------------------------

const salesRowMatchesSource = (row, source) =>
  source.sourceType === "product"
    ? row.productId === source.productId
    : source.sourceType === "product_type" && row.productType === source.productType;

/**
 * Evaluates every line of one product line for one month.
 * Returns { values, expandedProducts } where `values` maps line id ->
 * { amount, openingAmount, bags } and `expandedProducts` maps a sales_products
 * line id -> the individual product rows it prints.
 */
function evaluateLines(defs, data, productLine) {
  const { lines, sourcesByLine } = defs;
  const relevant = lines.filter(
    (line) => line.productLine === productLine || line.productLine === "shared"
  );

  const values = new Map();
  const expandedProducts = new Map();
  const setValue = (line, value) => values.set(line.id, value);

  for (const line of relevant) {
    const sources = sourcesByLine.get(line.id) || [];

    switch (line.sourceKind) {
      case "material_stock":
      case "kilang_stock": {
        setValue(line, {
          amount: roundMoney(data.closingStock.get(line.id) || 0),
          openingAmount: roundMoney(data.openingStock.get(line.id) || 0),
          bags: null,
        });
        break;
      }

      case "journal_accounts": {
        setValue(line, {
          amount: roundMoney(data.journal.get(line.id) || 0),
          openingAmount: null,
          bags: null,
        });
        break;
      }

      case "sales_products": {
        const rows = data.sales
          .filter((row) =>
            sources.some((source) => salesRowMatchesSource(row, source))
          )
          .filter((row) => row.bags !== 0 || row.amount !== 0)
          .sort((a, b) => {
            const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.productId.localeCompare(b.productId);
          })
          .map((row) => ({
            productId: row.productId,
            code: row.productId,
            description: row.description,
            bags: row.bags,
            amount: roundMoney(row.amount),
          }));

        expandedProducts.set(line.id, rows);
        setValue(line, {
          amount: sumMoneyBy(rows, (row) => row.amount),
          openingAmount: null,
          bags: rows.reduce((sum, row) => sum + row.bags, 0),
        });
        break;
      }

      case "sales_foc": {
        const bags = data.sales
          .filter((row) =>
            sources.some((source) => salesRowMatchesSource(row, source))
          )
          .reduce((sum, row) => sum + row.focBags, 0);
        setValue(line, { amount: null, openingAmount: null, bags });
        break;
      }

      case "sales_group": {
        // Group rows print an amount only - their bags never enter the bag total.
        let amount = 0;
        for (const source of sources) {
          for (const row of data.sales) {
            if (!salesRowMatchesSource(row, source)) continue;
            amount += (row.amount * source.sign * source.percentage) / 100;
          }
        }
        setValue(line, {
          amount: roundMoney(amount),
          openingAmount: null,
          bags: null,
        });
        break;
      }

      case "sales_returns": {
        let amount = 0;
        let bags = 0;
        for (const source of sources) {
          for (const row of data.sales) {
            if (!salesRowMatchesSource(row, source)) continue;
            amount += (row.returnAmount * source.sign * source.percentage) / 100;
            bags += row.returnBags * source.sign;
          }
        }
        setValue(line, { amount: roundMoney(amount), openingAmount: null, bags });
        break;
      }

      case "production_bags": {
        let bags = 0;
        for (const source of sources) {
          for (const row of data.production) {
            if (source.sourceType === "product") {
              if (row.productId !== source.productId) continue;
            } else if (source.sourceType === "product_type") {
              if (row.productType !== source.productType) continue;
            } else {
              continue;
            }
            bags += (row.bags * source.sign * source.percentage) / 100;
          }
        }
        setValue(line, {
          amount: null,
          openingAmount: null,
          bags: Number(bags.toFixed(3)),
        });
        break;
      }

      case "stock_flow":
        // Resolved in a second pass - it references other lines' values.
        break;

      default:
        setValue(line, { amount: 0, openingAmount: null, bags: null });
    }
  }

  // Second pass: usage rows = (opening - closing) of referenced stock lines
  // plus the amount of referenced purchase lines.
  for (const line of relevant) {
    if (line.sourceKind !== "stock_flow") continue;
    const sources = sourcesByLine.get(line.id) || [];
    let amount = 0;
    for (const source of sources) {
      if (source.sourceType !== "line" || source.refLineId === null) continue;
      const referenced = defs.linesById.get(source.refLineId);
      const value = values.get(source.refLineId);
      if (!referenced || !value) continue;
      const contribution =
        referenced.section === "stock"
          ? (value.openingAmount || 0) - (value.amount || 0)
          : value.amount || 0;
      amount += (contribution * source.sign * source.percentage) / 100;
    }
    values.set(line.id, {
      amount: roundMoney(amount),
      openingAmount: null,
      bags: null,
    });
  }

  return { values, expandedProducts, relevant };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

const sortLines = (lines) =>
  [...lines].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id - b.id;
  });

// Rows are already rounded to the cent, so totals are summed in sen: a printed
// total always equals the sum of the rows printed above it.
const sumAmounts = (rows) => sumMoneyBy(rows, (row) => row.amount || 0);

function buildProductRows(sectionLines, values, expandedProducts) {
  const rows = [];
  for (const line of sectionLines) {
    const value = values.get(line.id);
    if (!value) continue;

    if (line.sourceKind === "sales_products") {
      for (const product of expandedProducts.get(line.id) || []) {
        rows.push({
          lineKey: line.lineKey,
          lineId: line.id,
          kind: "product",
          code: product.code,
          description: product.description,
          bags: product.bags,
          amount: product.amount,
        });
      }
      continue;
    }

    rows.push({
      lineKey: line.lineKey,
      lineId: line.id,
      kind: line.sourceKind === "sales_foc" ? "foc" : "group",
      code: line.code,
      description: line.description,
      bags: value.bags,
      amount: value.amount,
    });
  }
  return rows;
}

function buildUnitCostGroup(sectionLines, values, productionBags) {
  const rows = sectionLines.map((line) => {
    const value = values.get(line.id) || { amount: 0 };
    const amount = value.amount || 0;
    return {
      lineKey: line.lineKey,
      lineId: line.id,
      code: line.code,
      description: line.description,
      amount,
      unit: unitOf(amount, productionBags),
    };
  });
  const amount = sumAmounts(rows);
  return { rows, subtotal: { amount, unit: unitOf(amount, productionBags) } };
}

/** Computes one product line's full report for one month. */
function assembleReport({
  defs,
  productLine,
  year,
  month,
  evaluated,
  addBack,
}) {
  const { values, expandedProducts, relevant } = evaluated;

  const inSection = (page, section) =>
    sortLines(
      relevant.filter((line) => line.page === page && line.section === section)
    );

  // --- P&L page -----------------------------------------------------------
  const productLines = inSection("pl", "product");
  const products = buildProductRows(productLines, values, expandedProducts);
  const salesAmount = sumAmounts(products);
  const salesBags = products
    .filter((row) => row.kind === "product" || row.kind === "foc")
    .reduce((sum, row) => sum + (row.bags || 0), 0);

  const stockLines = inSection("pl", "stock");
  const closingStock = stockLines.map((line) => ({
    lineKey: line.lineKey,
    lineId: line.id,
    code: line.code,
    description: line.description,
    amount: values.get(line.id)?.amount || 0,
  }));
  const openingStock = stockLines.map((line) => ({
    lineKey: line.lineKey,
    lineId: line.id,
    code: line.openingCode,
    description: line.openingDescription,
    amount: values.get(line.id)?.openingAmount || 0,
  }));

  const purchaseLines = inSection("pl", "purchase");
  const purchases = purchaseLines
    .filter((line) => line.sourceKind !== "sales_returns")
    .map((line) => ({
      lineKey: line.lineKey,
      lineId: line.id,
      code: line.code,
      description: line.description,
      amount: values.get(line.id)?.amount || 0,
    }));
  const returns = purchaseLines
    .filter((line) => line.sourceKind === "sales_returns")
    .map((line) => ({
      lineKey: line.lineKey,
      lineId: line.id,
      code: line.code,
      description: line.description,
      bags: values.get(line.id)?.bags || 0,
      amount: values.get(line.id)?.amount || 0,
    }));

  const closingStockTotal = sumAmounts(closingStock);
  const openingStockTotal = sumAmounts(openingStock);
  const purchaseTotal = sumAmounts(purchases);
  const returnsTotal = sumAmounts(returns);

  // --- Unit-cost page -----------------------------------------------------
  const productionLine = inSection("unit_cost", "production")[0] || null;
  const productionBags = productionLine
    ? values.get(productionLine.id)?.bags || 0
    : 0;

  const groups = UNIT_COST_GROUPS.map((section) => ({
    key: section,
    ...buildUnitCostGroup(
      inSection("unit_cost", section),
      values,
      productionBags
    ),
  }));

  const machineRepair = buildUnitCostGroup(
    inSection("unit_cost", "machine_repair"),
    values,
    productionBags
  );

  const groupByKey = Object.fromEntries(
    groups.map((group) => [group.key, group.subtotal.amount])
  );

  const totalBeforeRepairAmount = sumMoneyBy(
    groups,
    (group) => group.subtotal.amount
  );
  const totalAmount = addMoney(
    totalBeforeRepairAmount,
    machineRepair.subtotal.amount
  );

  // P&L EXPENSES is the sum of the unit-cost cost groups other than the
  // ingredient/packing usage rows (which are already inside USAGE).
  const expenses = sumMoney([
    groupByKey.salary,
    groupByKey.salesman,
    groupByKey.habuk,
    groupByKey.expenses,
    machineRepair.subtotal.amount,
  ]);

  const usageBase = sumMoney([openingStockTotal, purchaseTotal, returnsTotal]);
  const usage = addMoney(usageBase, -closingStockTotal);
  const gross = addMoney(salesAmount, -usage);
  const profitLoss = addMoney(gross, -expenses);
  const finalProfitLoss = addMoney(profitLoss, addBack);

  return {
    productLine,
    period: {
      year,
      month,
      monthKey: monthKey(year, month),
      label: `${MONTH_LABELS[month - 1]} ${year}`,
    },
    pl: {
      products,
      totals: { bags: salesBags, amount: salesAmount },
      closingStock,
      closingStockTotal,
      closingStockPlusSales: addMoney(closingStockTotal, salesAmount),
      openingStock,
      openingStockTotal,
      purchases,
      purchaseTotal,
      returns,
      returnsTotal,
      openingPlusPurchasesPlusReturns: usageBase,
      usage,
      gross,
      expenses,
      expenseBreakdown: {
        salary: groupByKey.salary,
        salesman: groupByKey.salesman,
        habuk: groupByKey.habuk,
        expenses: groupByKey.expenses,
        machineRepair: machineRepair.subtotal.amount,
      },
      profitLoss,
      addBack,
      finalProfitLoss,
      // filled in by computeEstimatedReport once the accumulation is known
      accumulative: null,
    },
    unitCost: {
      bagsSold: salesBags,
      sales: { amount: salesAmount, unit: unitOf(salesAmount, salesBags) },
      production: {
        bags: productionBags,
        lineKey: productionLine ? productionLine.lineKey : null,
      },
      groups,
      totalBeforeRepair: {
        amount: totalBeforeRepairAmount,
        unit: unitOf(totalBeforeRepairAmount, productionBags),
      },
      machineRepair: {
        rows: machineRepair.rows,
        amount: machineRepair.subtotal.amount,
        unit: machineRepair.subtotal.unit,
      },
      total: { amount: totalAmount, unit: unitOf(totalAmount, productionBags) },
      addBack: { amount: addBack, unit: unitOf(addBack, productionBags) },
      finalUnitCost: unitOf(addMoney(totalAmount, -addBack), productionBags),
    },
  };
}

// ---------------------------------------------------------------------------
// Keyed inputs and anchors
// ---------------------------------------------------------------------------

async function fetchAddBacks(db, productLine, fromIndex, toIndex) {
  const { rows } = await db.query(
    `SELECT year, month, add_back
       FROM estimated_report_inputs
      WHERE product_line = $1
        AND (year * 12 + month - 1) BETWEEN $2 AND $3`,
    [productLine, fromIndex, toIndex]
  );
  const map = new Map();
  for (const row of rows) {
    map.set(monthKey(Number(row.year), Number(row.month)), num(row.add_back));
  }
  return map;
}

async function fetchAnchor(db, productLine, periodStart) {
  const { rows } = await db.query(
    `SELECT as_of_date, accumulative
       FROM estimated_report_anchors
      WHERE product_line = $1 AND as_of_date <= $2::date
      ORDER BY as_of_date DESC
      LIMIT 1`,
    [productLine, periodStart]
  );
  if (rows.length === 0) return null;
  const asOf = rows[0].as_of_date;
  // as_of_date is a `date` column - format it locally, never through UTC.
  const asOfDate = asOf instanceof Date ? formatLocalDate(asOf) : String(asOf);
  const [anchorYear, anchorMonth] = asOfDate.split("-").map(Number);
  return {
    asOfDate,
    accumulative: num(rows[0].accumulative),
    year: anchorYear,
    month: anchorMonth,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Computes the report for one month.
 *
 * @param {object} db pg pool or client
 * @param {object} options { year, month, productLines }
 * @returns {Promise<object>} { period, reports: { mee, bihun } }
 */
export async function computeEstimatedReport(db, { year, month, productLines }) {
  const targets = (productLines && productLines.length
    ? productLines
    : PRODUCT_LINES
  ).filter((line) => PRODUCT_LINES.includes(line));

  const defs = await loadDefinitions(db);
  const cache = createSourceCache(db);
  const { start, end } = monthDateRange(year, month);
  const targetIndex = monthIndex(year, month);

  const reports = {};

  for (const productLine of targets) {
    const warnings = [];
    const anchor = await fetchAnchor(db, productLine, start);

    let firstIndex = targetIndex;
    if (!anchor) {
      warnings.push(
        `No accumulative anchor on or before ${start} for ${productLine.toUpperCase()} - ACCUMULATIVE shows this month's Estimate Cost only.`
      );
    } else {
      firstIndex = monthIndex(anchor.year, anchor.month);
      if (firstIndex > targetIndex) firstIndex = targetIndex;
      if (targetIndex - firstIndex + 1 > MAX_ACCUMULATION_MONTHS) {
        throw new Error(
          `Accumulative period for ${productLine} exceeds ${MAX_ACCUMULATION_MONTHS} months - check estimated_report_anchors.`
        );
      }
    }

    const addBacks = await fetchAddBacks(
      db,
      productLine,
      firstIndex,
      targetIndex
    );

    let accumulative = anchor ? anchor.accumulative : 0;
    const trail = [];
    let report = null;

    for (let index = firstIndex; index <= targetIndex; index += 1) {
      const cursorYear = Math.floor(index / 12);
      const cursorMonth = (index % 12) + 1;
      const previous = previousMonth(cursorYear, cursorMonth);

      const evaluated = evaluateLines(
        defs,
        {
          closingStock: await cache.stock(cursorYear, cursorMonth),
          openingStock: await cache.stock(previous.year, previous.month),
          journal: await cache.journal(cursorYear, cursorMonth),
          sales: await cache.sales(cursorYear, cursorMonth),
          production: await cache.production(cursorYear, cursorMonth),
        },
        productLine
      );

      const monthReport = assembleReport({
        defs,
        productLine,
        year: cursorYear,
        month: cursorMonth,
        evaluated,
        addBack: addBacks.get(monthKey(cursorYear, cursorMonth)) || 0,
      });

      accumulative = addMoney(accumulative, monthReport.pl.profitLoss);
      trail.push({
        year: cursorYear,
        month: cursorMonth,
        monthKey: monthKey(cursorYear, cursorMonth),
        profitLoss: monthReport.pl.profitLoss,
        accumulative,
      });

      if (index === targetIndex) report = monthReport;
    }

    report.pl.accumulative = accumulative;
    report.anchor = anchor
      ? { asOfDate: anchor.asOfDate, accumulative: anchor.accumulative }
      : null;
    report.monthlyTrail = trail;

    if (report.unitCost.production.bags === 0) {
      warnings.push(
        `No production bags recorded for ${productLine.toUpperCase()} - unit costs cannot be derived.`
      );
    }
    if (report.unitCost.bagsSold === 0) {
      warnings.push(
        `No sales bags recorded for ${productLine.toUpperCase()} in this month.`
      );
    }
    report.warnings = warnings;

    reports[productLine] = report;
  }

  return {
    period: {
      year,
      month,
      monthKey: monthKey(year, month),
      label: `${MONTH_LABELS[month - 1]} ${year}`,
      start,
      end,
    },
    reports,
  };
}

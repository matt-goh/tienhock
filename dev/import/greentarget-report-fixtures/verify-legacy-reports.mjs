#!/usr/bin/env node
/**
 * Green Target Phase G5 — report-engine verifier.
 *
 * `verify-import.mjs` (G4) proved the imported LEDGER reproduces the six
 * printed Trial Balances. This proves something different and stronger: that
 * the shipped REPORT ENGINES reproduce them.
 *
 * It imports and RUNS `src/routes/greentarget/accounting/report-engine.js`
 * against the dev database — the same functions the Express routes serve — and
 * compares their output to the G1 fixtures transcribed from the scans. Tien
 * Hock's harness re-implements its engines' SQL query-for-query; this one does
 * not, so a divergence between the verified logic and the served logic is
 * impossible by construction.
 *
 *   node dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs [stage...]
 *
 * Stages (default: all, in order):
 *   tb           buildTrialBalance vs all six printed Trial Balances — every
 *                printed line, in printed order, plus the netted DEBTOR control
 *                and the grand totals.
 *   statements   buildIncomeStatement + buildBalanceSheet vs the printed June
 *                Income Statement and Balance Sheet, line by line, including
 *                the three APPX-vs-statement overrides and the note→account
 *                composition recorded in source-manifest.json.
 *   ledger       buildAccountLedger for every account: printed ROW ORDER
 *                against the hash-pinned staging sequence, month-end running
 *                balances against the scans, and the derived CD_SD flagging.
 *   bridge       the §3d operational bridge counts, so the numbers in
 *                docs/Account/GT_OPERATIONAL_BRIDGE.md cannot rot.
 *   regressions  the engines are schema-isolated (static scan), the GT
 *                population is unmoved, and Tien Hock is untouched.
 *
 * Exit 0 = ALL STAGES GREEN. Exit 1 = at least one gate failed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pkgPg from "pg";

import {
  APPX_STATEMENT_OVERRIDES,
  buildTrialBalance,
  buildIncomeStatement,
  buildBalanceSheet,
  buildAccountLedger,
  listLedgerAccounts,
} from "../../../src/routes/greentarget/accounting/report-engine.js";

const { Pool } = pkgPg;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const ENGINE_DIR = path.join(REPO, "src", "routes", "greentarget", "accounting");

dotenv.config({ path: path.join(REPO, ".env") });

const YEAR = 2026;
const PERIODS = ["01", "02", "03", "04", "05", "06"];
const MONTH_ENDS = {
  "01": "2026-01-31",
  "02": "2026-02-28",
  "03": "2026-03-31",
  "04": "2026-04-30",
  "05": "2026-05-31",
  "06": "2026-06-30",
};
const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-06-30";

/**
 * BTFS "BATTERY FORKLIFT (KB)" is the one account the scans print with DEBIT
 * and CREDIT genuinely BLANK rather than .00. It has no anchor and no journal
 * line, and the engines only surface accounts that have one or the other, so
 * its ABSENCE from the engine's output is what reproduces that printing.
 */
const BLANK_PRINTED = new Set(["BTFS"]);
const CONTROL_LINE = "DEBTOR";

// ---------------------------------------------------------------------------
let failures = 0;
let checks = 0;
const fail = (message) => {
  failures++;
  console.log(`FAIL  ${message}`);
};
const pass = (message) => {
  checks++;
  console.log(`ok    ${message}`);
};
const check = (condition, message, detail = "") =>
  condition ? pass(message) : fail(`${message}${detail ? ` — ${detail}` : ""}`);
const note = (message) => console.log(`note  ${message}`);

const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Engine amounts are already rounded to whole cents by the engine itself. */
const cents = (value) => Math.round(Number(value) * 100);

// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** Printed money -> cents. `null` means the printed cell was genuinely blank. */
function printedCents(value) {
  const text = String(value).trim();
  if (text === "") return null;
  const negative = /^\(.*\)$/.test(text);
  const digits = text.replace(/[(),]/g, "").trim();
  const parsed = Math.round(Number(digits) * 100);
  if (!Number.isFinite(parsed)) throw new Error(`Unparsable printed amount ${JSON.stringify(value)}`);
  return negative ? -parsed : parsed;
}

/** Printed code -> ledger code (source-manifest accountCodeNormalization). */
const normalizePrinted = (code) => code.replace(/ /g, "_");

// ---------------------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, "source-manifest.json"), "utf8"));

const readFixture = (name) => {
  const file = path.join(HERE, "data", name);
  if (!fs.existsSync(file)) {
    console.error(`Missing fixture ${file}. Run G1 first.`);
    process.exit(1);
  }
  return parseCsv(fs.readFileSync(file, "utf8"));
};

const tbByPeriod = Object.fromEntries(
  PERIODS.map((period) => [period, readFixture(`gt-tb-${YEAR}-${period}.csv`)])
);
const isFixture = readFixture(`gt-is-${YEAR}-06.csv`);
const bsFixture = readFixture(`gt-bs-${YEAR}-06.csv`);
const legacyValidation = JSON.parse(
  fs.readFileSync(
    path.join(REPO, "dev", "import", "greentarget-legacy", "generated", "validation-report.json"),
    "utf8"
  )
);
const LEGACY_CHART_CODES = new Set([
  ...tbByPeriod["06"]
    .filter((row) => row.record_type === "account")
    .map((row) => normalizePrinted(row.acc_code)),
  ...legacyValidation.perSectionChains
    .filter((section) => section.sourceKind === "GTDB")
    .map((section) => section.code),
]);
if (LEGACY_CHART_CODES.size !== 503) {
  throw new Error(`Expected 503 evidence-derived chart codes, found ${LEGACY_CHART_CODES.size}`);
}
const LEGACY_BANK_CODES = tbByPeriod["06"]
  .filter((row) => row.record_type === "account" && row.appx === "19")
  .map((row) => normalizePrinted(row.acc_code));
if (LEGACY_BANK_CODES.length !== 5) {
  throw new Error(`Expected 5 evidence-derived bank codes, found ${LEGACY_BANK_CODES.length}`);
}

/**
 * Immutable G3 field expectations, derived independently from the pinned
 * evidence. The live chart may intentionally diverge after a user edits a
 * seed, but the verifier still needs to know whether an exact historical
 * report comparison remains applicable.
 */
const LEGACY_CHART_EXPECTED = new Map();
tbByPeriod["06"]
  .filter((row) => row.record_type === "account")
  .forEach((row, index) => {
    const code = normalizePrinted(row.acc_code);
    LEGACY_CHART_EXPECTED.set(code, {
      description: row.particular,
      ledgerType: code === CONTROL_LINE ? "TD" : row.appx === "19" ? "BK" : row.appx === "13" ? "TC" : "GL",
      parentCode: null,
      sortOrder: index + 1,
      isActive: true,
      fsNote: row.appx,
    });
  });
legacyValidation.perSectionChains
  .filter((section) => section.sourceKind === "GTDB")
  .forEach((section, index) => {
    LEGACY_CHART_EXPECTED.set(section.code, {
      description: section.description,
      ledgerType: "TD",
      parentCode: CONTROL_LINE,
      sortOrder: 1000 + index + 1,
      isActive: true,
      fsNote: "22",
    });
  });
if (LEGACY_CHART_EXPECTED.size !== 503) {
  throw new Error(`Expected 503 evidence-derived chart expectations, found ${LEGACY_CHART_EXPECTED.size}`);
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  max: 4,
});

let legacyReportOverridesPromise;

/**
 * Return intentional G3 seed edits that can change an engine's historical
 * presentation or account selection. Notes-only edits and an edit that was
 * later restored byte-for-byte do not make the historical comparison stale.
 */
async function findLegacyReportOverrides() {
  if (!legacyReportOverridesPromise) {
    legacyReportOverridesPromise = pool
      .query(
        `SELECT code, description, ledger_type, parent_code, sort_order, is_active, fs_note
           FROM greentarget.account_codes
          WHERE code = ANY($1::varchar[])
            AND created_by = 'G3_CHART_LOAD'
            AND updated_by IS DISTINCT FROM 'G3_CHART_LOAD'`,
        [[...LEGACY_CHART_EXPECTED.keys()]]
      )
      .then((result) =>
        result.rows.filter((row) => {
          const expected = LEGACY_CHART_EXPECTED.get(row.code);
          return (
            expected !== undefined &&
            (row.description !== expected.description ||
              row.ledger_type !== expected.ledgerType ||
              (row.parent_code ?? null) !== expected.parentCode ||
              Number(row.sort_order) !== expected.sortOrder ||
              row.is_active !== expected.isActive ||
              row.fs_note !== expected.fsNote)
          );
        })
      );
  }
  return legacyReportOverridesPromise;
}

const describeLegacyReportOverrides = (rows) =>
  rows
    .slice(0, 8)
    .map((row) => row.code)
    .join(", ") + (rows.length > 8 ? ` (+${rows.length - 8} more)` : "");

// ===========================================================================
// STAGE: tb
// ===========================================================================
async function stageTb() {
  console.log("\n== stage tb — buildTrialBalance vs the six printed Trial Balances ==");

  const reportOverrides = await findLegacyReportOverrides();
  if (reportOverrides.length > 0) {
    pass(
      `exact historical Trial Balance comparison is not applicable after ${reportOverrides.length} intentional G3 seed override(s)`
    );
    note(`report-shaping override(s): ${describeLegacyReportOverrides(reportOverrides)}`);
    note("the immutable 503-code source payload and imported ledger remain covered by verify-chart.mjs and verify-import.mjs");
    return;
  }

  let comparisons = 0;

  for (let index = 0; index < PERIODS.length; index++) {
    const period = PERIODS[index];
    const month = index + 1;
    const expectation = manifest.printedTrialBalanceExpectations.periods[index];

    const report = await buildTrialBalance(pool, { year: YEAR, month });
    const printedRows = tbByPeriod[period].filter((row) => row.record_type === "account");

    // The engine must emit exactly the printed accounts, in printed order,
    // minus the ones the scan prints blank/blank (they have no balance at all).
    const expectedCodes = printedRows
      .map((row) => normalizePrinted(row.acc_code))
      .filter((code) => !BLANK_PRINTED.has(code));
    const actualCodes = report.accounts.map((account) => account.code);

    check(
      actualCodes.length === expectedCodes.length,
      `${YEAR}-${period}: the engine emits ${expectedCodes.length} rows`,
      `emitted ${actualCodes.length}`
    );

    // Positional comparison — this is simultaneously the coverage gate and the
    // PRINTED ORDER gate (the engine orders by account_codes.sort_order, which
    // G3 loaded as the printed Trial Balance line number).
    let firstOrderBreak = null;
    for (let i = 0; i < Math.min(actualCodes.length, expectedCodes.length); i++) {
      if (actualCodes[i] !== expectedCodes[i]) {
        firstOrderBreak = `position ${i + 1}: engine ${actualCodes[i]} vs printed ${expectedCodes[i]}`;
        break;
      }
    }
    check(
      firstOrderBreak === null,
      `${YEAR}-${period}: engine row order reproduces the printed page`,
      firstOrderBreak || ""
    );

    const byCode = new Map(report.accounts.map((account) => [account.code, account]));
    const mismatches = [];

    for (const row of printedRows) {
      const code = normalizePrinted(row.acc_code);
      const printedDebit = printedCents(row.debit);
      const printedCredit = printedCents(row.credit);
      const account = byCode.get(code);
      comparisons++;

      if (BLANK_PRINTED.has(code)) {
        if (printedDebit !== null || printedCredit !== null) {
          mismatches.push(`${code}: the fixture no longer prints blank/blank`);
        } else if (account) {
          mismatches.push(
            `${code}: printed blank but the engine surfaced a balance — it must have no anchor and no line`
          );
        }
        continue;
      }

      if (!account) {
        mismatches.push(`${code}: printed but the engine emitted no row`);
        continue;
      }

      const printedNet = (printedDebit ?? 0) - (printedCredit ?? 0);
      const engineNet = cents(account.debit) - cents(account.credit);
      if (engineNet !== printedNet) {
        mismatches.push(
          `${code}: printed ${money(printedNet)} vs engine ${money(engineNet)} (residual ${money(engineNet - printedNet)})`
        );
      }
      if (code === CONTROL_LINE && printedNet !== expectation.debtorControlCents) {
        mismatches.push(`${code}: fixture control ${money(printedNet)} disagrees with the manifest`);
      }
    }

    check(
      mismatches.length === 0,
      `${YEAR}-${period}: all ${printedRows.length} printed lines reproduce from the engine`,
      mismatches.slice(0, 6).join("; ")
    );

    // The netted DEBTOR control row carries the real account's own printed
    // identity, not a synthesised label.
    const control = byCode.get(CONTROL_LINE);
    check(
      control !== undefined &&
        control.description === "TRADE DEBTOR" &&
        control.fs_note === "22" &&
        cents(control.debit) - cents(control.credit) === expectation.debtorControlCents,
      `${YEAR}-${period}: DEBTOR control prints "TRADE DEBTOR" / APPX 22 at ${money(expectation.debtorControlCents)}`,
      control ? `${control.description} / ${control.fs_note} / ${money(cents(control.debit) - cents(control.credit))}` : "missing"
    );

    check(
      report.totals.is_balanced && cents(report.totals.difference) === 0,
      `${YEAR}-${period}: the engine's trial balance balances`,
      `DR ${report.totals.debit} vs CR ${report.totals.credit}`
    );

    // Because the 28 debtor children are NETTED into one control row, the two
    // debtor credit balances (KBOX -0.01, RUMAH MERAH -1.00) are absorbed into
    // it — so the grouped grand total equals the printed grand total EXACTLY.
    // A per-account trial balance is 1.01 higher; that is the documented
    // netting, asserted below, not a discrepancy.
    check(
      cents(report.totals.debit) === expectation.grandTotalCents,
      `${YEAR}-${period}: engine grand total equals the printed ${money(expectation.grandTotalCents)} exactly`,
      `engine ${money(cents(report.totals.debit))} (gap ${money(cents(report.totals.debit) - expectation.grandTotalCents)})`
    );

    const grandTotalRow = tbByPeriod[period].find((row) => row.record_type === "grand_total");
    check(
      grandTotalRow !== undefined &&
        printedCents(grandTotalRow.debit) === expectation.grandTotalCents &&
        printedCents(grandTotalRow.credit) === expectation.grandTotalCents,
      `${YEAR}-${period}: the fixture's own printed grand total agrees with the manifest`
    );

    // Itemising the subledger shows exactly where the 1.01 lives.
    const itemised = await buildTrialBalance(pool, { year: YEAR, month, ledgerType: "TD" });
    check(
      itemised.accounts.length === 28,
      `${YEAR}-${period}: ledger_type=TD itemises all 28 debtor children`,
      `found ${itemised.accounts.length}`
    );
    check(
      cents(itemised.totals.credit) === 101 &&
        cents(itemised.totals.debit) - 101 === expectation.debtorControlCents,
      `${YEAR}-${period}: the itemised debtors carry exactly 1.01 of credit balances (KBOX 0.01 + RUMAH MERAH 1.00)`,
      `credit ${money(cents(itemised.totals.credit))}`
    );
  }

  note(`${comparisons} exact per-account comparisons across the six Trial Balances`);
}

// ===========================================================================
// STAGE: statements
// ===========================================================================

/** Fixture subtotal `ref` -> engine `subtotals` key. */
const IS_SUBTOTAL_REFS = {
  direct_costs_total: "direct_costs_total",
  other_income_total: "other_income_total",
  after_other_income: "after_other_income",
  operating_profit: "operating_profit",
  finance_costs_total: "finance_costs_total",
};
/** The scan prints these subtotals with a label instead of a bare rule-line. */
const IS_SUBTOTAL_LABELS = {
  "GROSS (LOSS)/ PROFIT": "gross_profit",
  "PROFIT BEFORE TAXATION": "profit_before_taxation",
  "PROFIT FOR THE FINANCIAL YEAR": "profit_for_the_financial_year",
};

const BS_SUBTOTAL_REFS = {
  current_assets_total: "current_assets_total",
  current_liabilities_total: "current_liabilities_total",
  net_assets: "net_assets",
  shareholders_funds_total: "shareholders_funds_total",
  long_term_liabilities_total: "long_term_liabilities_total",
  financed_by: "financed_by",
};
/** A `line` row on the scan that is really a derived figure. */
const BS_DERIVED_LINES = { "NET CURRENT ASSETS/(LIABILITIES)": "net_current_assets" };

/**
 * Compare one statement's engine output against its fixture, row by row.
 * Lines are matched on the printed NOTE, never on the label: the note
 * catalogue stores Title Case names while the scan prints ALL CAPS and
 * sometimes different wording ("(SCHEDULE 5)" vs "Administrative Expenses").
 */
function compareStatement(label, fixture, report, subtotalRefs, subtotalLabels, derivedLines) {
  const items = [];
  const headings = new Set();
  for (const block of report.blocks) {
    for (const heading of block.headings) headings.add(heading);
    for (const item of block.items) items.push({ ...item, block: block.block });
  }

  const byNote = new Map(items.filter((item) => item.note).map((item) => [item.note, item]));
  const byName = new Map(items.map((item) => [item.name, item]));
  const consumed = new Set();
  const problems = [];
  let compared = 0;

  for (const row of fixture) {
    const printed = row.amount === "" ? null : printedCents(row.amount);

    if (row.record_type === "heading") {
      // Normalise only whitespace around the colon; the scan is inconsistent
      // ("LESS: DIRECT COSTS" vs "LESS:ADMINISTRATIVE EXPENSES").
      const wanted = row.particular.replace(/\s+/g, " ").trim();
      const found = [...headings].some((h) => h.replace(/\s+/g, " ").trim() === wanted);
      if (!found) problems.push(`heading "${row.particular}" is not rendered by any block`);
      continue;
    }

    if (row.record_type === "line") {
      let item = null;
      if (row.note && row.note !== "DN") {
        item = byNote.get(row.note) || null;
        if (!item) {
          problems.push(`note ${row.note} ("${row.particular}") has no engine line`);
          continue;
        }
      } else if (row.note === "DN") {
        item = items.find((candidate) => candidate.note_marker === "DN") || null;
        if (!item) {
          problems.push(`"${row.particular}" (printer marker DN) has no engine line`);
          continue;
        }
      } else if (derivedLines[row.particular]) {
        const key = derivedLines[row.particular];
        compared++;
        if (cents(report.subtotals[key]) !== printed) {
          problems.push(
            `${row.particular}: printed ${money(printed)} vs engine ${money(cents(report.subtotals[key]))}`
          );
        }
        continue;
      } else {
        item = byName.get(row.particular) || null;
        if (!item) {
          problems.push(`note-less line "${row.particular}" has no engine line`);
          continue;
        }
      }

      consumed.add(item);
      compared++;
      if (cents(item.amount) !== printed) {
        problems.push(
          `${row.particular} (note ${row.note || "—"}): printed ${money(printed)} vs engine ` +
            `${money(cents(item.amount))} (residual ${money(cents(item.amount) - printed)})`
        );
      }
      continue;
    }

    // subtotal / total
    const key = row.ref ? subtotalRefs[row.ref] : subtotalLabels[row.particular];
    if (!key) {
      problems.push(`subtotal ${row.ref || row.particular} is not produced by the engine`);
      continue;
    }
    compared++;
    if (cents(report.subtotals[key]) !== printed) {
      problems.push(
        `subtotal ${row.ref || row.particular}: printed ${money(printed)} vs engine ` +
          `${money(cents(report.subtotals[key]))} (residual ${money(cents(report.subtotals[key]) - printed)})`
      );
    }
  }

  const unconsumed = items.filter((item) => !consumed.has(item));
  if (unconsumed.length > 0) {
    problems.push(
      `the engine renders ${unconsumed.length} line(s) the scan does not print: ` +
        unconsumed.map((item) => `${item.note || item.name}`).join(", ")
    );
  }

  check(problems.length === 0, `${label}: all ${compared} printed figures reproduce from the engine`, problems.slice(0, 8).join("; "));
  return compared;
}

async function stageStatements() {
  console.log("\n== stage statements — buildIncomeStatement / buildBalanceSheet vs the scans ==");

  const reportOverrides = await findLegacyReportOverrides();
  if (reportOverrides.length > 0) {
    pass(
      `exact historical statement comparison is not applicable after ${reportOverrides.length} intentional G3 seed override(s)`
    );
    note(`report-shaping override(s): ${describeLegacyReportOverrides(reportOverrides)}`);
    note("the immutable statement fixtures remain independently pinned; current reports now follow the approved live chart metadata");
    return;
  }

  const income = await buildIncomeStatement(pool, { year: YEAR, month: 6 });
  const balance = await buildBalanceSheet(pool, { year: YEAR, month: 6 });

  compareStatement("Income Statement 06/2026 (YTD)", isFixture, income, IS_SUBTOTAL_REFS, IS_SUBTOTAL_LABELS, {});
  compareStatement("Balance Sheet 30/06/2026", bsFixture, balance, BS_SUBTOTAL_REFS, {}, BS_DERIVED_LINES);

  // --- The headline arithmetic
  const expectedNetAssets = manifest.printedBalanceSheetExpectations.netAssetsCents;
  check(
    cents(balance.subtotals.net_assets) === expectedNetAssets &&
      cents(balance.subtotals.financed_by) === expectedNetAssets,
    `Balance Sheet: net assets = financed by = ${money(expectedNetAssets)}`,
    `net ${money(cents(balance.subtotals.net_assets))} / financed ${money(cents(balance.subtotals.financed_by))}`
  );
  check(balance.is_balanced, "Balance Sheet reports itself balanced");

  check(
    cents(balance.profit_for_the_financial_year) ===
      cents(income.subtotals.profit_for_the_financial_year),
    "the Balance Sheet's profit line IS the Income Statement's profit (one engine call, no drift)"
  );

  // --- The current-liabilities "less" subtotal is the NEGATED sum of its lines
  const currentLiabilities = balance.blocks.find((block) => block.block === "current_liabilities");
  const lineSum = currentLiabilities.items.reduce((total, item) => total + cents(item.amount), 0);
  check(
    cents(currentLiabilities.total) === -lineSum,
    "current-liabilities subtotal reproduces the printer's 'less' bracket (negated sum of its lines)",
    `lines ${money(lineSum)} vs subtotal ${money(cents(currentLiabilities.total))}`
  );

  // --- Every line's ACCOUNT composition, where the manifest records it. This
  //     gates the note→account mapping, not merely the total.
  {
    const byNote = new Map();
    for (const block of income.blocks) for (const item of block.items) if (item.note) byNote.set(item.note, item);

    const problems = [];
    for (const line of manifest.printedIncomeStatementExpectations.lines) {
      if (!line.ledgerAccounts) continue;
      const item = byNote.get(line.note);
      if (!item) {
        problems.push(`note ${line.note} missing`);
        continue;
      }
      const expected = [...line.ledgerAccounts].sort().join(",");
      const actual = [...item.accounts].sort().join(",");
      if (expected !== actual) {
        problems.push(`note ${line.note} "${line.key}": accounts ${actual || "(none)"} vs expected ${expected}`);
      }
    }
    check(problems.length === 0, "every Income Statement line is composed of exactly the accounts the manifest records", problems.slice(0, 4).join("; "));
  }

  // --- Schedule 5 is referenced by the scan but not printed in the PDF; it is
  //     derived from the Trial Balance accounts carrying APPX 5.
  {
    const schedule5 = income.blocks
      .flatMap((block) => block.items)
      .find((item) => item.note === "5");
    const expected = manifest.printedIncomeStatementExpectations.lines.find((line) => line.key === "(SCHEDULE 5)");
    check(
      schedule5 !== undefined && cents(schedule5.amount) === expected.amountCents,
      `Schedule 5 (APPX 5, ${schedule5 ? schedule5.accounts.length : 0} accounts) = ${money(expected.amountCents)}`,
      schedule5 ? money(cents(schedule5.amount)) : "missing"
    );
  }

  // --- Nothing may leak out of the statements
  check(
    income.unmapped_accounts.length === 0 && balance.unmapped_accounts.length === 0,
    "no account with a balance falls outside both statements",
    [...income.unmapped_accounts, ...balance.unmapped_accounts]
      .map((account) => `${account.code} ${money(cents(account.amount))} (${account.reason})`)
      .join("; ")
  );

  // --- The three APPX-vs-statement divergences (G3). Arithmetically free today
  //     precisely because all three are dormant — so assert BOTH the placement
  //     and the dormancy, and the day one of them moves this says so.
  {
    const dbRows = await pool.query(
      `SELECT ac.code, ac.fs_note, COALESCE(ac.notes,'') AS notes,
              COALESCE(ac.updated_by,'') AS updated_by,
              COALESCE((SELECT ROUND(o.amount*100) FROM greentarget.account_opening_balances o
                         WHERE o.account_code = ac.code), 0)::bigint AS anchor_cents,
              (SELECT count(*) FROM greentarget.journal_entry_lines l
                WHERE l.account_code = ac.code)::int AS line_count
         FROM greentarget.account_codes ac
        WHERE ac.code = ANY($1::varchar[])`,
      [Object.keys(APPX_STATEMENT_OVERRIDES)]
    );
    const byCode = new Map(dbRows.rows.map((row) => [row.code, row]));

    const problems = [];
    for (const [code, override] of Object.entries(APPX_STATEMENT_OVERRIDES)) {
      const row = byCode.get(code);
      if (!row) {
        problems.push(`${code} is not in the chart`);
        continue;
      }
      const untouchedSeed = row.updated_by === "G3_CHART_LOAD";
      if (untouchedSeed && row.fs_note !== override.appx_note) {
        problems.push(`${code}: chart fs_note ${row.fs_note} but the engine's override says APPX ${override.appx_note}`);
      }
      if (untouchedSeed && !/statement/i.test(row.notes)) {
        problems.push(`${code}: account_codes.notes no longer records its statement placement`);
      }
      if (Number(row.anchor_cents) !== 0 || Number(row.line_count) !== 0) {
        problems.push(
          `${code} is NO LONGER DORMANT (anchor ${money(Number(row.anchor_cents))}, ${row.line_count} lines) — ` +
            `the override now moves real money and needs re-proving against a scan`
        );
      }
    }
    check(
      problems.length === 0,
      "the 3 untouched APPX-vs-statement seeds retain their evidence and all three accounts remain dormant",
      problems.join("; ")
    );
  }

  // --- ...and that they are actually APPLIED, which dormancy alone cannot show
  {
    const bsItem = (note) => balance.blocks.flatMap((block) => block.items).find((item) => item.note === note);
    const isItems = income.blocks.flatMap((block) => block.items);
    const problems = [];

    if (!(bsItem("17")?.accounts ?? []).includes("INPUT.TAX")) problems.push("INPUT.TAX does not reach BS note 17");
    if ((bsItem("10")?.accounts ?? []).includes("INPUT.TAX")) problems.push("INPUT.TAX still counts inside its APPX note 10");
    if ((bsItem("11")?.accounts ?? []).includes("FC_TL")) problems.push("FC_TL still counts inside its APPX note 11");
    if ((bsItem("16")?.accounts ?? []).includes("FC_HP")) problems.push("FC_HP still counts inside its APPX note 16");

    const hpLine = isItems.find((item) => item.name === "HIRE PURCHASE INTEREST");
    if (!hpLine) problems.push("the Income Statement has no HIRE PURCHASE INTEREST line");
    else if (hpLine.note !== null) problems.push(`HIRE PURCHASE INTEREST prints note ${hpLine.note}; the scan prints none`);

    const financeCosts = income.blocks.find((block) => block.block === "finance_costs");
    if (!financeCosts || financeCosts.items[0]?.name !== "HIRE PURCHASE INTEREST") {
      problems.push("HIRE PURCHASE INTEREST does not print first inside finance costs");
    }
    if (financeCosts && financeCosts.items[1]?.note !== "23") {
      problems.push("TERM LOAN (note 23) does not print second inside finance costs");
    }

    check(problems.length === 0, "trap 1: the overrides are applied — APPX is never assumed to equal the statement note", problems.join("; "));
  }

  // --- The invariant the Balance Sheet's arithmetic rests on
  {
    const leaks = await pool.query(
      `SELECT ac.code, ROUND(o.amount * 100)::bigint AS cents
         FROM greentarget.account_codes ac
         JOIN greentarget.account_opening_balances o ON o.account_code = ac.code
         JOIN greentarget.financial_statement_notes fsn ON fsn.code = ac.fs_note
        WHERE fsn.report_section = 'income_statement'
          AND ROUND(o.amount * 100) <> 0`
    );
    check(
      leaks.rowCount === 0,
      "every income-statement account still opens at 0.00 on 2026-01-01 (what makes the Balance Sheet balance)",
      leaks.rows.map((row) => `${row.code} ${money(Number(row.cents))}`).join(", ")
    );
  }

  // --- Jan–May: no printed statement exists to compare against (only one BS
  //     and one IS were ever produced), but the engines must still be coherent.
  for (let month = 1; month <= 5; month++) {
    const monthly = await buildBalanceSheet(pool, { year: YEAR, month });
    check(
      monthly.is_balanced && monthly.unmapped_accounts.length === 0,
      `${YEAR}-${PERIODS[month - 1]}: the Balance Sheet balances and leaks no account`,
      `net ${monthly.subtotals.net_assets} vs financed ${monthly.subtotals.financed_by}`
    );
  }
  note(
    "Jan–May statement parity is NOT independently evidenced — only one Balance Sheet (06/2026) and " +
      "one Income Statement exist. The six Trial Balances still prove every account movement and opening level."
  );
}

// ===========================================================================
// STAGE: ledger
// ===========================================================================
async function stageLedger() {
  console.log("\n== stage ledger — buildAccountLedger row order and running balances ==");

  // Printed row order, from the hash-pinned staging population. Within one
  // account, ascending stage_sequence IS the order the legacy report printed.
  // DERIVED rows are excluded from BOTH sides: they were never printed, so
  // they carry no printed-order evidence (they are all on CD_SD).
  const stagedRows = await pool.query(
    `SELECT account_code, journal_group_key, debit_cents, credit_cents
       FROM greentarget.import_legacy_rows
      WHERE record_kind = 'transaction'
        AND source_kind IN ('GTLD', 'GTDB')
      ORDER BY account_code, stage_sequence`
  );
  /** @type {Map<string, string[]>} */
  const stagedByAccount = new Map();
  for (const row of stagedRows.rows) {
    const key = `${row.journal_group_key}|${row.debit_cents}|${row.credit_cents}`;
    if (!stagedByAccount.has(row.account_code)) stagedByAccount.set(row.account_code, []);
    stagedByAccount.get(row.account_code).push(key);
  }

  const anchors = await pool.query(
    `SELECT account_code, ROUND(amount * 100)::bigint AS cents
       FROM greentarget.account_opening_balances ORDER BY account_code`
  );
  const anchorCents = new Map(anchors.rows.map((row) => [row.account_code, Number(row.cents)]));

  // The printed month-end balance of every account, straight from the scans.
  /** @type {Map<string, number[]>} */
  const printedPath = new Map();
  for (let index = 0; index < PERIODS.length; index++) {
    for (const row of tbByPeriod[PERIODS[index]]) {
      if (row.record_type !== "account") continue;
      const code = normalizePrinted(row.acc_code);
      if (code === CONTROL_LINE || BLANK_PRINTED.has(code)) continue;
      if (!printedPath.has(code)) printedPath.set(code, new Array(PERIODS.length).fill(null));
      printedPath.get(code)[index] = (printedCents(row.debit) ?? 0) - (printedCents(row.credit) ?? 0);
    }
  }

  const codes = [...new Set([...anchorCents.keys(), ...stagedByAccount.keys()])].sort();
  note(`running the ledger engine over all ${codes.length} accounts, ${PERIOD_START}..${PERIOD_END}`);

  const orderBreaks = [];
  const openingBreaks = [];
  const closingBreaks = [];
  const pathBreaks = [];
  let derivedFlagged = 0;
  let derivedOffCdSd = 0;
  let rowsOrdered = 0;

  for (const code of codes) {
    const ledger = await buildAccountLedger(pool, code, PERIOD_START, PERIOD_END);

    // 1. Opening equals the anchor exactly (every GT anchor is 2026-01-01).
    if (anchorCents.has(code)) {
      if (cents(ledger.opening_balance) !== anchorCents.get(code)) {
        openingBreaks.push(
          `${code}: opening ${money(cents(ledger.opening_balance))} vs anchor ${money(anchorCents.get(code))}`
        );
      }
      if (ledger.opening_source.type !== "anchored") {
        openingBreaks.push(`${code}: opening_source is "${ledger.opening_source.type}", not anchored`);
      }
    }

    // 2. Printed ROW ORDER — the gate that proves posting_sequence is used.
    const printedRows = ledger.transactions
      .filter((tx) => !tx.is_derived)
      .map((tx) => `${tx.source_id}|${cents(tx.debit)}|${cents(tx.credit)}`);
    const staged = stagedByAccount.get(code) ?? [];
    rowsOrdered += printedRows.length;
    if (printedRows.length !== staged.length) {
      orderBreaks.push(`${code}: engine has ${printedRows.length} printed rows, staging has ${staged.length}`);
    } else {
      for (let i = 0; i < staged.length; i++) {
        if (printedRows[i] !== staged[i]) {
          orderBreaks.push(`${code}: row ${i + 1} is ${printedRows[i]}, the scan printed ${staged[i]}`);
          break;
        }
      }
    }

    // 3. The running balance at every month end, against the scans. Rows are
    //    ordered by month, not date, so a month end is the sum over all rows
    //    dated in that month or earlier — never "the balance after row N".
    const path = printedPath.get(code);
    if (path) {
      for (let index = 0; index < PERIODS.length; index++) {
        const asOf = MONTH_ENDS[PERIODS[index]];
        const balance = ledger.transactions
          .filter((tx) => tx.entry_date <= asOf)
          .reduce((total, tx) => total + cents(tx.debit) - cents(tx.credit), cents(ledger.opening_balance));
        if (path[index] !== null && balance !== path[index]) {
          pathBreaks.push(
            `${code} at ${asOf}: ledger ${money(balance)} vs printed ${money(path[index])}`
          );
          break;
        }
      }
      const june = path[PERIODS.length - 1];
      if (june !== null && cents(ledger.closing_balance) !== june) {
        closingBreaks.push(`${code}: closing ${money(cents(ledger.closing_balance))} vs printed ${money(june)}`);
      }
    }

    // 4. The derived CD_SD legs
    const derived = ledger.transactions.filter((tx) => tx.is_derived).length;
    derivedFlagged += derived;
    if (derived > 0 && code !== "CD_SD") derivedOffCdSd += derived;
    if (code === "CD_SD") {
      check(
        derived === ledger.transactions.length && derived === 1433,
        `CD_SD: all 1,433 rows are flagged is_derived (they appear on no scan)`,
        `${derived} flagged of ${ledger.transactions.length}`
      );
      check(
        ledger.totals.derived_count === derived,
        "CD_SD: totals.derived_count agrees with the flagged rows"
      );
    }
  }

  check(orderBreaks.length === 0, `printed ROW ORDER reproduced for every account (${rowsOrdered} rows)`, orderBreaks.slice(0, 5).join("; "));
  check(openingBreaks.length === 0, "every ledger opens at its 2026-01-01 anchor", openingBreaks.slice(0, 5).join("; "));
  check(pathBreaks.length === 0, "every ledger's running balance matches the scans at all six month ends", pathBreaks.slice(0, 5).join("; "));
  check(closingBreaks.length === 0, "every ledger closes at its printed 30 June balance", closingBreaks.slice(0, 5).join("; "));
  check(derivedFlagged === 1433, "exactly 1,433 derived rows are flagged across the whole ledger", `found ${derivedFlagged}`);
  check(derivedOffCdSd === 0, "no account other than CD_SD carries a derived row", `found ${derivedOffCdSd}`);

  // --- Bank Statement: the same engine pointed at the five APPX-19 accounts
  const bankAccounts = await pool.query(
    `SELECT code, description FROM greentarget.account_codes
      WHERE code = ANY($1::text[]) ORDER BY sort_order`,
    [LEGACY_BANK_CODES]
  );
  check(bankAccounts.rowCount === 5, "GT has 5 bank (BK / APPX 19) accounts", `found ${bankAccounts.rowCount}`);

  const cashAtBank = manifest.printedBalanceSheetExpectations.lines.find((line) => line.key === "CASH AT BANK");
  let bankTotal = 0;
  for (const row of bankAccounts.rows) {
    const ledger = await buildAccountLedger(pool, row.code, PERIOD_START, PERIOD_END);
    bankTotal += cents(ledger.closing_balance);
  }
  check(
    bankTotal === cashAtBank.amountCents,
    `the five bank statements close at the printed CASH AT BANK ${money(cashAtBank.amountCents)}`,
    money(bankTotal)
  );

  // --- Month-mode and range-mode agree at a boundary, and BTFS/DEBTOR behave
  {
    const june = await buildAccountLedger(pool, "PBB_1", "2026-06-01", "2026-06-30");
    const may = await buildAccountLedger(pool, "PBB_1", PERIOD_START, "2026-05-31");
    check(
      cents(june.opening_balance) === cents(may.closing_balance),
      "PBB_1: June's opening balance equals May's closing balance",
      `${money(cents(june.opening_balance))} vs ${money(cents(may.closing_balance))}`
    );

    for (const code of ["BTFS", CONTROL_LINE]) {
      const ledger = await buildAccountLedger(pool, code, PERIOD_START, PERIOD_END);
      check(
        ledger.transactions.length === 0 && cents(ledger.opening_balance) === 0 &&
          ledger.opening_source.type === "derived",
        `${code}: no anchor, no line — the ledger is empty (this is why it prints blank, not .00)`,
        `${ledger.transactions.length} rows, opening ${ledger.opening_balance}`
      );
    }

    let notFound = false;
    try {
      await buildAccountLedger(pool, "NO_SUCH_ACCOUNT", PERIOD_START, PERIOD_END);
    } catch (error) {
      notFound = error.status === 404;
    }
    check(notFound, "an unknown account code raises 404 rather than an empty ledger");
  }

  // --- The picker
  const accounts = await listLedgerAccounts(pool);
  const listedCodes = new Set(accounts.map((account) => account.code));
  const activeLegacyRows = await pool.query(
    `SELECT code
       FROM greentarget.account_codes
      WHERE code = ANY($1::text[]) AND is_active = true`,
    [[...LEGACY_CHART_CODES]]
  );
  const missingLegacyCodes = activeLegacyRows.rows
    .map((row) => row.code)
    .filter((code) => !listedCodes.has(code));
  check(
    missingLegacyCodes.length === 0,
    `the ledger account list surfaces all ${activeLegacyRows.rowCount} active legacy accounts; inactive identities remain stored and post-cutover accounts may coexist`,
    missingLegacyCodes.slice(0, 10).join(", ")
  );
  check(
    accounts[0].sort_order <= accounts[accounts.length - 1].sort_order,
    "the account list is in printed Trial Balance order"
  );
  // G7: organic journals add posted lines on top of the pinned 4,401 legacy
  // ones, so the expected total is the import PLUS whatever organic posting
  // has accrued (measured independently of the picker).
  const organicLineCount = Number(
    (await pool.query(
      `SELECT COUNT(*)::text AS value
         FROM greentarget.journal_entry_lines jel
         JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND je.source_type IS DISTINCT FROM 'legacy_import'`
    )).rows[0].value
  );
  check(
    accounts.reduce((total, account) => total + account.transaction_count, 0) ===
      4401 + organicLineCount,
    `the account list's transaction counts sum to the 4,401 legacy lines plus the ${organicLineCount} organic ones`
  );
}

// ===========================================================================
// STAGE: bridge
// ===========================================================================
async function stageBridge() {
  console.log("\n== stage bridge — the §3d operational bridge counts ==");
  console.log("     (these gate docs/Account/GT_OPERATIONAL_BRIDGE.md)");

  const scalar = async (sql, params = []) => Number((await pool.query(sql, params)).rows[0].value);

  const erpInvoices = await scalar(
    `SELECT count(*)::int AS value FROM greentarget.invoices
      WHERE date_issued BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'`
  );
  const erpPayments = await scalar(
    `SELECT count(*)::int AS value FROM greentarget.payments
      WHERE payment_date BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'`
  );
  check(erpInvoices === 37, "37 ERP invoices dated Jan–Jun 2026", `found ${erpInvoices}`);
  check(erpPayments === 15, "15 ERP payments dated Jan–Jun 2026", `found ${erpPayments}`);

  const matched = await scalar(
    `SELECT count(*)::int AS value
       FROM greentarget.invoices i
       JOIN greentarget.journal_entries j ON j.display_reference = i.invoice_number
      WHERE i.date_issued BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'`
  );
  check(
    matched === 35,
    "35 of the 37 ERP invoices name a legacy journal EXACTLY (invoice_number IS the legacy reference)",
    `found ${matched}`
  );

  const counterSalesWithErp = await scalar(
    `SELECT count(*)::int AS value FROM greentarget.journal_entries j
      WHERE j.legacy_entry_type = '#/#'
        AND EXISTS (SELECT 1 FROM greentarget.invoices i WHERE i.invoice_number = j.display_reference)`
  );
  const counterSales = await scalar(
    `SELECT count(*)::int AS value FROM greentarget.journal_entries WHERE legacy_entry_type = '#/#'`
  );
  check(counterSales === 1011, "1,011 legacy counter-sale (#/#) documents", `found ${counterSales}`);
  check(
    counterSalesWithErp === 35,
    "35 of them have an ERP counterpart; the other 976 were never entered",
    `found ${counterSalesWithErp}`
  );

  const creditSales = await scalar(
    `SELECT count(*)::int AS value FROM greentarget.journal_entries WHERE legacy_entry_type = 'I#/#'`
  );
  const creditSalesWithErp = await scalar(
    `SELECT count(*)::int AS value FROM greentarget.journal_entries j
      WHERE j.legacy_entry_type = 'I#/#'
        AND EXISTS (SELECT 1 FROM greentarget.invoices i WHERE i.invoice_number = j.display_reference)`
  );
  check(creditSales === 89, "89 legacy credit-sale (I#/#) documents", `found ${creditSales}`);
  check(
    creditSalesWithErp === 0,
    "NONE of them has an ERP counterpart — the ERP has never recorded a credit sale",
    `found ${creditSalesWithErp}`
  );

  const receipts = await scalar(
    `SELECT count(*)::int AS value FROM greentarget.journal_entries WHERE legacy_entry_type = 'RV#/#/#'`
  );
  const debtorReceipts = await scalar(
    `SELECT count(DISTINCT journal_group_key)::int AS value FROM greentarget.import_legacy_rows
      WHERE record_kind = 'transaction' AND source_kind = 'GTDB' AND journal_ref ~ '^RV'`
  );
  check(receipts === 472, "472 legacy receipt vouchers (RV#/#/#)", `found ${receipts}`);
  check(debtorReceipts === 51, "51 of them settle a trade debtor; the other 421 bank counter cash", `found ${debtorReceipts}`);

  // The two ERP invoices with no legacy journal, and the one amount disagreement.
  const unmatched = await pool.query(
    `SELECT i.invoice_number FROM greentarget.invoices i
      LEFT JOIN greentarget.journal_entries j ON j.display_reference = i.invoice_number
      WHERE i.date_issued BETWEEN DATE '2026-01-01' AND DATE '2026-06-30' AND j.id IS NULL
      ORDER BY i.invoice_number`
  );
  check(
    unmatched.rows.map((row) => row.invoice_number).join(", ") === "2025/02258(a), 2026/00496(A)",
    "the 2 unmatched ERP invoices are exactly the named re-submission suffixes",
    unmatched.rows.map((row) => row.invoice_number).join(", ")
  );

  const disagreements = await pool.query(
    `SELECT i.invoice_number,
            ROUND(i.total_amount * 100)::bigint AS erp_cents,
            (SELECT SUM(ROUND(l.credit_amount * 100))::bigint
               FROM greentarget.journal_entry_lines l WHERE l.journal_entry_id = j.id) AS legacy_cents
       FROM greentarget.invoices i
       JOIN greentarget.journal_entries j ON j.display_reference = i.invoice_number
      WHERE i.date_issued BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'
        AND ROUND(i.total_amount * 100) <> (SELECT SUM(ROUND(l.credit_amount * 100))
                                              FROM greentarget.journal_entry_lines l
                                             WHERE l.journal_entry_id = j.id)
      ORDER BY i.invoice_number`
  );
  check(
    disagreements.rowCount === 1 && disagreements.rows[0].invoice_number === "2026/00099",
    "exactly one matched pair disagrees on amount — 2026/00099, named in the bridge, not reconciled",
    disagreements.rows
      .map((row) => `${row.invoice_number} ERP ${money(Number(row.erp_cents))} vs legacy ${money(Number(row.legacy_cents))}`)
      .join("; ")
  );
  for (const row of disagreements.rows) {
    note(
      `${row.invoice_number}: ERP ${money(Number(row.erp_cents))} vs legacy ${money(Number(row.legacy_cents))} ` +
        `(difference ${money(Number(row.legacy_cents) - Number(row.erp_cents))}) — the LEDGER is authoritative`
    );
  }
}

// ===========================================================================
// STAGE: regressions
// ===========================================================================

/**
 * Every table an engine touches must be `greentarget.`-qualified. This is the
 * one bug a schema clone is most likely to have, and it would be silent: an
 * unqualified `account_codes` reads Tien Hock's 2,825-row chart and the GT
 * report would still look plausible. Scans only SQL template literals.
 *
 * CTE names are collected across the WHOLE file, not per literal, because the
 * engine composes its queries by interpolating one SQL constant into another
 * (`account_balances` is defined in ANCHORED_ACCOUNT_BALANCES_CTES and used in
 * three other literals). The caller then proves no collected CTE name is also a
 * real table, so treating a bare name as a CTE can never excuse a real leak.
 */
function scanSqlReferences(source) {
  const literals = (source.match(/`[^`]*`/g) ?? []).filter((literal) => /\bSELECT\b/i.test(literal));
  const ctes = new Set();
  for (const literal of literals) {
    for (const match of literal.matchAll(/(\w+)\s+AS\s*\(/gi)) ctes.add(match[1].toLowerCase());
  }

  const problems = [];
  for (const literal of literals) {
    for (const match of literal.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)/gi)) {
      // EXTRACT(field FROM source) is not a table reference.
      const before = literal.slice(Math.max(0, match.index - 30), match.index);
      if (/EXTRACT\(\s*\w+\s*$/i.test(before)) continue;
      const reference = match[1];
      const lower = reference.toLowerCase();
      if (lower === "lateral") continue;
      if (reference.includes(".")) {
        if (!lower.startsWith("greentarget.")) problems.push(reference);
        continue;
      }
      if (!ctes.has(lower)) problems.push(reference);
    }
  }
  return { problems: [...new Set(problems)], ctes: [...ctes] };
}

async function stageRegressions() {
  console.log("\n== stage regressions — isolation, population, Tien Hock ==");

  const allCtes = new Set();
  for (const file of [
    "report-engine.js",
    "financial-reports.js",
    "account-ledger.js",
    // G6 read-only routers. debtors.js is written by a parallel workstream —
    // skip whatever has not landed yet instead of failing the stage.
    "journal-entries.js",
    "account-codes.js",
    "debtors.js",
    // G7 organic posting services + lock (same isolation rule).
    "posting-lock.js",
    "posting-utils.js",
    "sales-journal.js",
    "payment-journal.js",
    "adjustment-journal.js",
    "debtor-map.js",
  ]) {
    const filePath = path.join(ENGINE_DIR, file);
    if (!fs.existsSync(filePath)) {
      note(`${file}: not present yet, isolation scan skipped`);
      continue;
    }
    const source = fs.readFileSync(filePath, "utf8");
    const { problems, ctes } = scanSqlReferences(source);
    ctes.forEach((cte) => allCtes.add(cte));
    check(
      problems.length === 0,
      `${file}: every SQL table reference is greentarget.-qualified`,
      problems.join(", ")
    );
  }

  // A bare name is only excused as a CTE if no real table answers to it.
  const shadowed = await pool.query(
    `SELECT table_schema || '.' || table_name AS name
       FROM information_schema.tables
      WHERE table_schema IN ('public', 'greentarget')
        AND lower(table_name) = ANY($1::text[])`,
    [[...allCtes]]
  );
  check(
    shadowed.rowCount === 0,
    `none of the ${allCtes.size} CTE names shadows a real table (so the scan above cannot be fooled)`,
    shadowed.rows.map((row) => row.name).join(", ")
  );

  const scalar = async (sql) => (await pool.query(sql)).rows[0].value;
  // G7 pins the LEGACY population, not the whole table: organic posting
  // (invoices, payments, adjustments, manual journals) grows both journal
  // tables from 2026-07-01 onward, and that growth is the point of G7.
  const expectations = [
    ["greentarget.journal_entries WHERE source_type = 'legacy_import'", "1705"],
    [
      `greentarget.journal_entry_lines jel
        JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.source_type = 'legacy_import'`,
      "4401",
    ],
    ["greentarget.account_opening_balances", "501"],
    ["greentarget.import_legacy_rows", "4903"],
    ["greentarget.financial_statement_notes", "34"],
    ["public.account_codes", "2825"],
    ["public.journal_entries", "8188"],
    ["public.financial_statement_notes", "33"],
  ];
  for (const [table, expected] of expectations) {
    const actual = String(await scalar(`SELECT count(*)::text AS value FROM ${table}`));
    check(actual === expected, `${table} holds ${expected} rows`, `found ${actual}`);
  }

  const legacyAccountCount = String(
    (
      await pool.query(
        `SELECT count(*)::text AS value
           FROM greentarget.account_codes
          WHERE code = ANY($1::text[])`,
        [[...LEGACY_CHART_CODES]]
      )
    ).rows[0].value
  );
  check(
    legacyAccountCount === "503",
    "greentarget.account_codes retains all 503 evidence-derived identities; post-cutover accounts are allowed beside them",
    `found ${legacyAccountCount}`
  );

  // The import stays immutable: no legacy journal may be cancelled or lose
  // its provenance, however many organic journals arrive beside it.
  const mutated = await scalar(
    `SELECT count(*)::text AS value FROM greentarget.journal_entries
      WHERE source_type = 'legacy_import' AND status <> 'posted'`
  );
  check(mutated === "0", "every legacy import journal is still an untouched posted import", `found ${mutated}`);

  // G7's R8 posting lock: nothing organic may be dated before the open date.
  const preCutover = await scalar(
    `SELECT count(*)::text AS value FROM greentarget.journal_entries
      WHERE source_type IS DISTINCT FROM 'legacy_import'
        AND entry_date < DATE '2026-07-01'`
  );
  check(preCutover === "0", "no organic journal is dated before the 2026-07-01 open date", `found ${preCutover}`);
}

// ===========================================================================
const STAGES = { tb: stageTb, statements: stageStatements, ledger: stageLedger, bridge: stageBridge, regressions: stageRegressions };

const requested = process.argv.slice(2).filter((argument) => !argument.startsWith("-"));
const toRun = requested.length ? requested : Object.keys(STAGES);

console.log("Green Target G5 — report engines vs the printed legacy reports\n");

try {
  for (const stage of toRun) {
    if (!STAGES[stage]) throw new Error(`Unknown stage "${stage}" (have: ${Object.keys(STAGES).join(", ")})`);
    await STAGES[stage]();
  }
} finally {
  await pool.end();
}

console.log("");
if (failures === 0) {
  console.log(`ALL STAGES GREEN  (${checks} gates)`);
  process.exit(0);
}
console.log(`${failures} GATE(S) FAILED  (${checks} passed)`);
process.exit(1);

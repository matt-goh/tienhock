/**
 * Green Target legacy report fixtures — file-only validator (phase G1).
 *
 * Runs incrementally: a fixture that has not been transcribed yet reports
 * MISSING rather than failing, so it can be re-run after every page.
 *
 * The gates are deliberately layered so a misread digit cannot survive:
 *
 *   INTERNAL  the scan's own printed arithmetic must recompute (column totals,
 *             subtotals, net assets = financed by).
 *   EXTERNAL  every transcribed figure is compared against the G0 ledger, which
 *             was independently proven in `dev/import/greentarget-legacy/`.
 *             474 accounts x 6 months is ~2,800 exact comparisons, so a single
 *             wrong digit fails loudly and names the account.
 *
 * HOUSE RULE (inherited from Tien Hock): if a gate fails, treat the fixture as
 * right until the scan image itself proves otherwise. Never edit a fixture to
 * make a gate pass. Re-render the page and look:
 *
 *   node dev/import/legacy-report-fixtures/render-pdf.mjs \
 *     dev/import/greentarget-report-fixtures/data/GT_TRIAL_BALANCE_JAN26.pdf \
 *     dev/import/greentarget-report-fixtures/generated/pages/TB_JAN26 all 2
 *
 * Usage:
 *   node dev/import/greentarget-report-fixtures/validate-fixtures.mjs
 *   node dev/import/greentarget-report-fixtures/validate-fixtures.mjs --only 2026-03
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIRECTORY = path.join(SCRIPT_DIRECTORY, "data");
const GENERATED_DIRECTORY = path.join(SCRIPT_DIRECTORY, "generated");
const LEDGER_REPORT = path.join(SCRIPT_DIRECTORY, "..", "greentarget-legacy", "generated", "validation-report.json");
const MONTH_INDEX = { "2026-01": 0, "2026-02": 1, "2026-03": 2, "2026-04": 3, "2026-05": 4, "2026-06": 5 };

/** @type {Array<{level: "FAIL" | "WARN", where: string, message: string}>} */
const findings = [];
/** @type {Array<{name: string, status: string, detail: string}>} */
const results = [];

/**
 * @param {string} where
 * @param {string} message
 */
function fail(where, message) {
  findings.push({ level: "FAIL", where, message });
}

/**
 * @param {string} where
 * @param {string} message
 */
function warn(where, message) {
  findings.push({ level: "WARN", where, message });
}

/**
 * Parse a printed legacy amount: `1,234.56`, `.00`, `( 5,621.20)` for a credit
 * shown in brackets, or an empty cell.
 *
 * @param {string} text
 * @returns {number | null} cents, negative when bracketed; null when blank.
 */
function parseAmount(text) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return null;
  const bracketed = /^\((.*)\)$/.exec(trimmed);
  const body = (bracketed ? bracketed[1] : trimmed).trim();
  const match = /^-?[\d,]*\.\d{2}$/.exec(body);
  if (!match) return NaN;
  const magnitude = Math.round(Number(body.replace(/,/g, "")) * 100);
  if (!Number.isFinite(magnitude)) return NaN;
  const negative = bracketed !== null || body.startsWith("-");
  return negative ? -Math.abs(magnitude) : magnitude;
}

/**
 * @param {number} cents
 * @returns {string}
 */
function money(cents) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100).toLocaleString("en-US")}.${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * Minimal RFC4180 CSV reader — the fixtures are hand-written, so quoted fields
 * containing commas must work.
 *
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
}

/**
 * @param {string} filePath
 * @param {string[]} expectedHeader
 * @returns {Array<Record<string, string>> | null}
 */
function readFixture(filePath, expectedHeader) {
  if (!existsSync(filePath)) return null;
  const rows = parseCsv(readFileSync(filePath, "utf8"));
  const name = path.basename(filePath);
  if (!rows.length) {
    fail(name, "fixture is empty");
    return null;
  }
  const header = rows[0].map((h) => h.trim());
  if (header.join(",") !== expectedHeader.join(",")) {
    fail(name, `header is ${header.join(",")}, expected ${expectedHeader.join(",")}`);
    return null;
  }
  return rows.slice(1).map((cells) => {
    /** @type {Record<string, string>} */
    const record = {};
    header.forEach((key, index) => {
      record[key] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

// ---------------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(path.join(SCRIPT_DIRECTORY, "source-manifest.json"), "utf8"));
const only = (() => {
  const index = process.argv.indexOf("--only");
  return index === -1 ? null : process.argv[index + 1];
})();

if (!existsSync(LEDGER_REPORT)) {
  console.error("FAILED: the G0 ledger report is missing. Run this first:");
  console.error("  node dev/import/greentarget-legacy/prepare-staging.mjs");
  process.exit(1);
}
const ledger = JSON.parse(readFileSync(LEDGER_REPORT, "utf8"));

/** @type {Map<string, {description: string, monthEndCents: number[], excluded: boolean}>} */
const ledgerAccounts = new Map();
for (const chain of ledger.perSectionChains) {
  if (chain.sourceKind !== "GTLD") continue;
  ledgerAccounts.set(chain.code, {
    description: chain.description,
    monthEndCents: chain.monthEndCents,
    excluded: chain.excluded,
  });
}

// ---- scan hash pins -------------------------------------------------------
for (const [filename, entry] of Object.entries(manifest.scans)) {
  const scanPath = path.join(DATA_DIRECTORY, filename);
  if (!existsSync(scanPath)) {
    fail(filename, "scan PDF is missing from data/");
    continue;
  }
  const bytes = readFileSync(scanPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== entry.sha256) fail(filename, `sha256 is ${sha256}, manifest pins ${entry.sha256}`);
  if (bytes.length !== entry.byteLength) fail(filename, `is ${bytes.length} bytes, manifest pins ${entry.byteLength}`);
}
results.push({
  name: "scan hash pins",
  status: findings.some((f) => f.level === "FAIL") ? "FAIL" : "PASS",
  detail: `${Object.keys(manifest.scans).length} PDFs`,
});

// ---- trial balances -------------------------------------------------------
const TB_HEADER = ["page", "line_no", "record_type", "acc_code", "particular", "appx", "debit", "credit"];
/** @type {Map<string, Map<string, string>>} */
const appxByPeriod = new Map();

for (const expectation of manifest.printedTrialBalanceExpectations.periods) {
  const period = expectation.period;
  if (only && only !== period) continue;
  const fixturePath = path.join(DATA_DIRECTORY, `gt-tb-${period}.csv`);
  const rows = readFixture(fixturePath, TB_HEADER);
  const name = `gt-tb-${period}.csv`;
  if (rows === null) {
    if (!existsSync(fixturePath)) results.push({ name, status: "MISSING", detail: "not transcribed yet" });
    continue;
  }

  const monthIndex = MONTH_INDEX[period];
  let debitTotal = 0;
  let creditTotal = 0;
  let printedDebitTotal = null;
  let printedCreditTotal = null;
  let debtorControl = null;
  const seen = new Set();
  /** @type {Map<string, string>} */
  const appx = new Map();
  let compared = 0;
  let mismatched = 0;

  for (const row of rows) {
    const where = `${name} line ${row.line_no}`;
    if (row.record_type === "grand_total") {
      printedDebitTotal = parseAmount(row.debit);
      printedCreditTotal = parseAmount(row.credit);
      continue;
    }
    if (row.record_type !== "account") {
      fail(where, `unknown record_type ${JSON.stringify(row.record_type)}`);
      continue;
    }

    const debit = parseAmount(row.debit);
    const credit = parseAmount(row.credit);
    if (Number.isNaN(debit) || Number.isNaN(credit)) {
      fail(where, `unparsable amount debit=${JSON.stringify(row.debit)} credit=${JSON.stringify(row.credit)}`);
      continue;
    }
    if (debit !== null && credit !== null) {
      fail(where, `${row.acc_code} has BOTH a debit and a credit printed`);
      continue;
    }
    debitTotal += debit ?? 0;
    creditTotal += credit ?? 0;

    const printedCode = row.acc_code;
    if (seen.has(printedCode)) fail(where, `duplicate account code ${printedCode}`);
    seen.add(printedCode);
    appx.set(printedCode, row.appx);

    if (printedCode === "DEBTOR") {
      debtorControl = debit;
      continue;
    }

    // Printed space -> ledger underscore (manifest.accountCodeNormalization).
    const ledgerCode = printedCode.replace(/ /g, "_");
    const account = ledgerAccounts.get(ledgerCode);
    if (!account) {
      fail(where, `printed code ${printedCode} normalises to ${ledgerCode}, which is not a GTLD ledger account`);
      continue;
    }
    if (account.excluded) {
      fail(where, `printed code ${printedCode} maps to the excluded ${ledgerCode} control section`);
      continue;
    }
    // EXTERNAL GATE: the printed balance must equal the G0 ledger balance.
    const expected = account.monthEndCents[monthIndex];
    const printed = (debit ?? 0) - (credit ?? 0);
    compared += 1;
    if (printed !== expected) {
      mismatched += 1;
      fail(
        where,
        `${printedCode} (${ledgerCode}) printed ${money(printed)} but the G0 ledger closes ${period} at ` +
          `${money(expected)} (delta ${money(printed - expected)})`,
      );
    }
  }
  appxByPeriod.set(period, appx);

  // INTERNAL GATE: the scan's own column totals.
  if (printedDebitTotal === null || printedCreditTotal === null) {
    fail(name, "no grand_total row — transcribe the totals line from the last page");
  } else {
    if (printedDebitTotal !== printedCreditTotal) {
      fail(name, `printed DR ${money(printedDebitTotal)} != printed CR ${money(printedCreditTotal)}`);
    }
    if (debitTotal !== printedDebitTotal) {
      fail(name, `debit column sums to ${money(debitTotal)} but the scan prints ${money(printedDebitTotal)}`);
    }
    if (creditTotal !== printedCreditTotal) {
      fail(name, `credit column sums to ${money(creditTotal)} but the scan prints ${money(printedCreditTotal)}`);
    }
    if (printedDebitTotal !== expectation.grandTotalCents) {
      fail(
        name,
        `grand total ${money(printedDebitTotal)} != the G0-derived expectation ${money(expectation.grandTotalCents)}` +
          (expectation.scanConfirmed ? " (this month was scan-confirmed during G1 scaffolding)" : ""),
      );
    }
  }

  // EXTERNAL GATE: the netted debtor control line.
  if (debtorControl === null) {
    fail(name, "no DEBTOR control line found");
  } else if (debtorControl !== expectation.debtorControlCents) {
    fail(
      name,
      `DEBTOR control printed ${money(debtorControl)} but G0 derives ${money(expectation.debtorControlCents)} ` +
        "(GTDB detail + unbanked counter cash)",
    );
  }

  // Coverage: the TB should list the whole GTLD chart.
  const expectedAccounts = [...ledgerAccounts.values()].filter((a) => !a.excluded).length;
  if (seen.size - 1 !== expectedAccounts) {
    warn(name, `lists ${seen.size - 1} accounts + DEBTOR; the ledger has ${expectedAccounts} GTLD accounts`);
  }

  const failedHere = findings.filter((f) => f.level === "FAIL" && f.where.startsWith(name)).length;
  results.push({
    name,
    status: failedHere ? "FAIL" : "PASS",
    detail: `${seen.size} rows, ${compared} balances compared to the ledger, ${mismatched} mismatched`,
  });
}

// APPX must be stable across months for the same account.
if (appxByPeriod.size > 1) {
  /** @type {Map<string, Map<string, string[]>>} */
  const byCode = new Map();
  for (const [period, appx] of appxByPeriod) {
    for (const [code, value] of appx) {
      if (!byCode.has(code)) byCode.set(code, new Map());
      const values = byCode.get(code);
      if (!values.has(value)) values.set(value, []);
      values.get(value).push(period);
    }
  }
  let unstable = 0;
  for (const [code, values] of byCode) {
    if (values.size > 1) {
      unstable += 1;
      fail(
        "APPX consistency",
        `${code} carries different APPX notes across months: ` +
          [...values.entries()].map(([v, ps]) => `${v} in ${ps.join("/")}`).join(", "),
      );
    }
  }
  results.push({
    name: "APPX note consistency",
    status: unstable ? "FAIL" : "PASS",
    detail: `${byCode.size} codes across ${appxByPeriod.size} months`,
  });
}

// ---- statements (income statement + balance sheet) ------------------------
const STATEMENT_HEADER = ["page", "line_no", "record_type", "ref", "particular", "note", "amount"];

/**
 * Both statements share a shape: labelled lines plus unlabelled rule-lines that
 * carry a machine `ref`. Expectations are keyed on `ref` when present, else on
 * the verbatim printed `particular`.
 *
 * @param {string} fixtureName
 * @param {{lines: Array<{key: string, note?: string, amountCents: number}>}} expectations
 * @returns {Map<string, number> | null}
 */
function validateStatement(fixtureName, expectations) {
  const fixturePath = path.join(DATA_DIRECTORY, fixtureName);
  const rows = readFixture(fixturePath, STATEMENT_HEADER);
  if (rows === null) {
    if (!existsSync(fixturePath)) results.push({ name: fixtureName, status: "MISSING", detail: "not transcribed yet" });
    return null;
  }

  /** @type {Map<string, number>} */
  const byKey = new Map();
  /** @type {Map<string, string>} */
  const noteByKey = new Map();
  for (const row of rows) {
    const amount = parseAmount(row.amount);
    if (Number.isNaN(amount)) {
      fail(`${fixtureName} line ${row.line_no}`, `unparsable amount ${JSON.stringify(row.amount)}`);
      continue;
    }
    if (amount === null) continue;
    const key = row.ref ? row.ref : row.particular.toUpperCase();
    if (byKey.has(key)) fail(`${fixtureName} line ${row.line_no}`, `duplicate key ${JSON.stringify(key)}`);
    byKey.set(key, amount);
    noteByKey.set(key, row.note);
  }

  let checked = 0;
  let bad = 0;
  for (const line of expectations.lines) {
    const key = line.key.startsWith(line.key.toUpperCase()) && /[A-Z]/.test(line.key) ? line.key.toUpperCase() : line.key;
    if (!byKey.has(key)) {
      warn(fixtureName, `expected ${JSON.stringify(line.key)} not found — check the verbatim printed wording, or its ref`);
      continue;
    }
    checked += 1;
    if (byKey.get(key) !== line.amountCents) {
      bad += 1;
      fail(`${fixtureName} ${line.key}`, `transcribed ${money(byKey.get(key))}, expectation is ${money(line.amountCents)}`);
    }
    if (line.note !== undefined && noteByKey.get(key) !== line.note) {
      fail(`${fixtureName} ${line.key}`, `note is ${JSON.stringify(noteByKey.get(key))}, expected ${JSON.stringify(line.note)}`);
    }
  }
  const failedHere = findings.filter((f) => f.level === "FAIL" && f.where.startsWith(fixtureName)).length;
  results.push({
    name: fixtureName,
    status: failedHere ? "FAIL" : "PASS",
    detail: `${checked} expected lines checked, ${bad} mismatched`,
  });
  return byKey;
}

/**
 * @param {string} fixtureName
 * @param {Map<string, number> | null} byKey
 * @param {Array<[string, number, string]>} checks label, expected, expression
 */
function recompute(fixtureName, byKey, checks) {
  if (!byKey) return;
  for (const [label, computed, expectedKey] of checks) {
    if (computed === null) continue;
    const expected = byKey.get(expectedKey);
    if (expected === undefined) continue;
    if (computed !== expected) {
      fail(`${fixtureName} arithmetic`, `${label} computes ${money(computed)} but the scan prints ${money(expected)}`);
    }
  }
}

/**
 * @param {Map<string, number> | null} byKey
 * @param {string[]} keys
 * @returns {number | null}
 */
function sumKeys(byKey, keys) {
  if (!byKey) return null;
  let total = 0;
  for (const key of keys) {
    if (!byKey.has(key)) return null;
    total += byKey.get(key);
  }
  return total;
}

if (!only || only === "2026-06") {
  const is = validateStatement("gt-is-2026-06.csv", manifest.printedIncomeStatementExpectations);
  if (is) {
    const g = (k) => (is.has(k) ? is.get(k) : null);
    const minus = (a, b) => (a === null || b === null ? null : a - b);
    const plus = (a, b) => (a === null || b === null ? null : a + b);
    recompute("gt-is-2026-06.csv", is, [
      ["revenue - direct costs", minus(g("REVENUE"), g("direct_costs_total")), "GROSS (LOSS)/ PROFIT"],
      ["gross profit + other income", plus(g("GROSS (LOSS)/ PROFIT"), g("other_income_total")), "after_other_income"],
      ["after other income - admin expenses", minus(g("after_other_income"), g("(SCHEDULE 5)")), "operating_profit"],
      ["operating profit - finance costs", minus(g("operating_profit"), g("finance_costs_total")), "PROFIT BEFORE TAXATION"],
      ["profit before tax - tax", minus(g("PROFIT BEFORE TAXATION"), g("LESS : TAX EXPENSES")), "PROFIT FOR THE FINANCIAL YEAR"],
      [
        "sum of direct-cost lines",
        sumKeys(is, [
          "BURNING MATERIAL",
          "DEPRECIATION OF PLANT AND EQUIPMENT",
          "EMPLOYEE'S PROVIDENT FUND CONTRIBUTION",
          "FREIGHT CHARGES",
          "HIRING OF PLANTS",
          "INSPECTION FEE",
          "PURCHASE OF CHEMICAL",
          "REPAIR AND MAINTENANCE",
          "REPAIR AND PARTS",
          "SALARIES AND WAGES",
          "SOCSO CONTRIBUTION",
          "VEHICLE RUNNING EXPENSES",
        ]),
        "direct_costs_total",
      ],
    ]);
  }

  const bs = validateStatement("gt-bs-2026-06.csv", manifest.printedBalanceSheetExpectations);
  if (bs) {
    const g = (k) => (bs.has(k) ? bs.get(k) : null);
    const plus = (a, b) => (a === null || b === null ? null : a + b);
    recompute("gt-bs-2026-06.csv", bs, [
      [
        "sum of current assets",
        sumKeys(bs, [
          "TRADE RECEIVABLE",
          "NON-TRADE RECEIVABLES,DEPOSIT & PREPAYMENTS",
          "AMOUNT DUE TO DIRECTORS",
          "TAX RECOVERABLE",
          "INPUT TAX",
          "CASH IN HAND",
          "CASH AT BANK",
        ]),
        "current_assets_total",
      ],
      // The current-liabilities subtotal is printed bracketed as a "less"
      // marker, while a bracket on its LINE items is an ordinary sign. So the
      // subtotal is the NEGATED sum of the lines. See the manifest's
      // bracketConvention note - G5's Balance Sheet engine must reproduce this.
      [
        "negated sum of current liabilities",
        (() => {
          const sum = sumKeys(bs, ["TRADE PAYABLE", "ACCRUALS", "OTHER CREDITORS", "HIRE PURCHASE PAYABLE", "TERM LOANS"]);
          return sum === null ? null : -sum;
        })(),
        "current_liabilities_total",
      ],
      ["current assets - current liabilities", plus(g("current_assets_total"), g("current_liabilities_total")), "NET CURRENT ASSETS/(LIABILITIES)"],
      ["PPE + net current assets", plus(g("PROPERTY,PLANT AND EQUIPMENT"), g("NET CURRENT ASSETS/(LIABILITIES)")), "net_assets"],
      [
        "share capital + retained profit + profit",
        sumKeys(bs, ["SHARE CAPITAL", "RETAINED PROFIT - B/F", "PROFIT FOR THE FINANCIAL YEAR"]),
        "shareholders_funds_total",
      ],
      ["shareholders funds + long-term liabilities", plus(g("shareholders_funds_total"), g("long_term_liabilities_total")), "financed_by"],
      ["net assets", g("net_assets"), "financed_by"],
    ]);
    // Cross-statement and cross-ledger ties.
    if (bs.get("PROFIT FOR THE FINANCIAL YEAR") !== undefined && is && is.get("PROFIT FOR THE FINANCIAL YEAR") !== undefined) {
      if (bs.get("PROFIT FOR THE FINANCIAL YEAR") !== is.get("PROFIT FOR THE FINANCIAL YEAR")) {
        fail("cross-statement", "Balance Sheet and Income Statement disagree on profit for the financial year");
      }
    }
    const bankAccount = ledgerAccounts.get("PBB_1");
    if (bankAccount && bs.get("CASH AT BANK") !== undefined && bs.get("CASH AT BANK") !== bankAccount.monthEndCents[5]) {
      fail("cross-ledger", `Balance Sheet cash at bank != the G0 ledger PBB_1 close ${money(bankAccount.monthEndCents[5])}`);
    }
    const junePeriod = manifest.printedTrialBalanceExpectations.periods[5];
    if (bs.get("TRADE RECEIVABLE") !== undefined && bs.get("TRADE RECEIVABLE") !== junePeriod.debtorControlCents) {
      fail("cross-ledger", `Balance Sheet trade receivable != the June DEBTOR control ${money(junePeriod.debtorControlCents)}`);
    }
  }
}

// ---- report ---------------------------------------------------------------
console.log("Green Target legacy report fixtures (G1)\n");
for (const result of results) {
  console.log(`  ${result.status.padEnd(8)} ${result.name.padEnd(24)} ${result.detail}`);
}

const failures = findings.filter((f) => f.level === "FAIL");
const warnings = findings.filter((f) => f.level === "WARN");
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 40)) console.log(`  WARN  ${w.where}: ${w.message}`);
  if (warnings.length > 40) console.log(`  ... and ${warnings.length - 40} more`);
}
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures.slice(0, 60)) console.log(`  FAIL  ${f.where}: ${f.message}`);
  if (failures.length > 60) console.log(`  ... and ${failures.length - 60} more`);
}

mkdirSync(GENERATED_DIRECTORY, { recursive: true });
writeFileSync(
  path.join(GENERATED_DIRECTORY, "fixture-validation.json"),
  `${JSON.stringify({ results, findings }, null, 2)}\n`,
  "utf8",
);

const missing = results.filter((r) => r.status === "MISSING").length;
if (failures.length) {
  console.log("\nCHECKS FAILED — do NOT edit a fixture to make this pass. Re-render the page and read it.");
  process.exitCode = 1;
} else if (missing) {
  console.log(`\n${missing} fixture(s) still to transcribe. Everything present passes.`);
} else {
  console.log("\nALL CHECKS PASSED");
}

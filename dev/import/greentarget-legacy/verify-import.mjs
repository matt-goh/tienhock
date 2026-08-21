#!/usr/bin/env node
/**
 * Green Target Phase G4 - external import verifier.
 *
 * verify-import.sql proves the database is a faithful projection of the
 * hash-pinned staging population. This script proves something stronger and
 * completely independent: that the imported ledger reproduces the SIX PRINTED
 * TRIAL BALANCE SCANS, account by account, month by month.
 *
 * It never looks at staging. Legacy balances come out of the database as the
 * 2026-01-01 anchor plus the posted `legacy_import` lines up to each month end
 * and are compared against the G1 fixtures transcribed from the scans. Approved
 * later corrections (currently JV2606-01) are verified separately rather than
 * being mistaken for part of the immutable source import. Exactly 2,844
 * per-account comparisons.
 *
 *   source  dev/import/greentarget-report-fixtures/data/gt-tb-2026-{01..06}.csv
 *   source  dev/import/greentarget-report-fixtures/source-manifest.json
 *
 * Usage:  node dev/import/greentarget-legacy/verify-import.mjs
 * Exit 0 = ALL CHECKS PASSED. Exit 1 = at least one gate failed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const FIXTURES = path.join(REPO, "dev", "import", "greentarget-report-fixtures");
const LEGACY = path.join(REPO, "dev", "import", "greentarget-legacy");

const PERIODS = ["01", "02", "03", "04", "05", "06"];
const MONTH_ENDS = {
  "01": "2026-01-31",
  "02": "2026-02-28",
  "03": "2026-03-31",
  "04": "2026-04-30",
  "05": "2026-05-31",
  "06": "2026-06-30",
};

/**
 * BTFS "BATTERY FORKLIFT (KB)" is the one account the scans print with DEBIT
 * and CREDIT genuinely BLANK rather than .00 - it has no ledger section in
 * either workbook. G3 carries it in the chart; G4 deliberately gives it no
 * anchor and no journal line, because the report engines only surface accounts
 * that have one or the other. Its ABSENCE from the balance set is what
 * reproduces the blank printing (G3 decision 4).
 */
const BLANK_PRINTED = new Set(["BTFS"]);

/** DEBTOR is a printed control line, not a postable account. */
const CONTROL_LINE = "DEBTOR";

/** The one approved manual correction inside the otherwise locked import. */
const APPROVED_LOCKED_PERIOD_JV_REFERENCE = "JV2606-01";

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
  condition ? pass(message) : fail(`${message}${detail ? ` - ${detail}` : ""}`);

const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** Printed money -> cents. "" means the cell was genuinely blank. */
function printedCents(value) {
  const text = value.trim();
  if (text === "") return null;
  const negative = /^\(.*\)$/.test(text);
  const digits = text.replace(/[(),]/g, "");
  const cents = Math.round(Number(digits) * 100);
  if (!Number.isFinite(cents)) throw new Error(`Unparsable printed amount ${JSON.stringify(value)}`);
  return negative ? -cents : cents;
}

/** Printed code -> ledger code (source-manifest accountCodeNormalization). */
const normalizePrinted = (code) => code.replace(/ /g, "_");

// ---------------------------------------------------------------------------
const SEP = "";
// GT_IMPORT_DB_MODE=direct runs psql against a real server (production
// verification, same convention as load-staging.mjs); default = dev docker.
const DB_MODE = process.env.GT_IMPORT_DB_MODE || "docker";

function psql(sql) {
  if (DB_MODE === "direct") {
    const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`Direct PostgreSQL mode requires explicit ${missing.join(", ")}`);
    }
    const env = { ...process.env };
    if (process.env.DB_PASSWORD) env.PGPASSWORD = process.env.DB_PASSWORD;
    return execFileSync(
      process.env.PSQL_BIN || "psql",
      ["--no-psqlrc", "-h", process.env.DB_HOST, "-p", process.env.DB_PORT, "-U", process.env.DB_USER, "-d", process.env.DB_NAME, "-At", "-F", SEP, "-c", sql],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env }
    );
  }
  return execFileSync(
    "docker",
    ["exec", "-i", "tienhock_dev_db", "psql", "-U", "postgres", "-d", "tienhock", "-At", "-F", SEP, "-c", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
}
function query(sql, columns) {
  return psql(sql)
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(SEP);
      return Object.fromEntries(columns.map((c, i) => [c, parts[i] ?? ""]));
    });
}
const scalar = (sql) => psql(sql).trim();

// ---------------------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, "source-manifest.json"), "utf8"));
const legacyValidation = JSON.parse(
  fs.readFileSync(path.join(LEGACY, "generated", "validation-report.json"), "utf8")
);

/** Accounts deliberately removed from the live chart after the G4 load,
 *  together with their zero opening fences. The fixtures still print them
 *  (0.00 in every month), so the per-period reconciliation skips them; no
 *  printed total is affected. */
const REMOVED_ZERO_FENCES = new Set([
  "PBB1", // removed 2026-07-30 - dev/migrations/2026-07-30_greentarget_remove_pbb1.sql
]);

const tbByPeriod = {};
for (const period of PERIODS) {
  const file = path.join(FIXTURES, "data", `gt-tb-2026-${period}.csv`);
  if (!fs.existsSync(file)) {
    console.error(`Missing fixture ${file}. Run G1 first.`);
    process.exit(1);
  }
  tbByPeriod[period] = parseCsv(fs.readFileSync(file, "utf8"));
}

console.log("Green Target G4 - imported ledger vs the six printed Trial Balances\n");

// ---------------------------------------------------------------------------
// 0. The import is present and shaped as G4 committed it
// ---------------------------------------------------------------------------
console.log("-- 0. import population --------------------------------------------");
{
  // G7 scopes every population gate to the legacy import: organic journals
  // (invoices, payments, adjustments, manual) grow both tables from
  // 2026-07-01 onward by design, so only the import subset stays pinned.
  const journals = scalar(
    "SELECT count(*) FROM greentarget.journal_entries WHERE source_type = 'legacy_import'"
  );
  const lines = scalar(
    `SELECT count(*) FROM greentarget.journal_entry_lines jel
       JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.source_type = 'legacy_import'`
  );
  const anchors = scalar(
    "SELECT count(*) FROM greentarget.account_opening_balances WHERE as_of_date = DATE '2026-01-01'"
  );
  const staging = scalar("SELECT count(*) FROM greentarget.import_legacy_rows");
  check(journals === "1705", "1,705 imported journals", `found ${journals}`);
  check(lines === "4401", "4,401 imported journal lines", `found ${lines}`);
  check(
    anchors === String(501 - REMOVED_ZERO_FENCES.size),
    `${501 - REMOVED_ZERO_FENCES.size} G4 opening anchors at 2026-01-01 (${REMOVED_ZERO_FENCES.size} approved zero-fence removal(s))`,
    `found ${anchors}`
  );
  check(staging === "4903", "4,903 staging rows", `found ${staging}`);

  const anchorSum = scalar(
    "SELECT COALESCE(SUM(ROUND(amount*100)),0)::bigint FROM greentarget.account_opening_balances WHERE as_of_date = DATE '2026-01-01'"
  );
  check(
    anchorSum === "0",
    "the G4 2026-01-01 anchor set balances to EXACTLY 0.00 (no named residue, unlike Tien Hock's RM1,456,480.37)",
    `found ${money(Number(anchorSum))}`
  );

  const badDate = scalar(
    "SELECT count(*) FROM greentarget.account_opening_balances WHERE created_by = 'legacy-import' AND as_of_date <> DATE '2026-01-01'"
  );
  check(
    badDate === "0",
    "every legacy-import/G4 anchor is dated 2026-01-01 (R4)",
    `found ${badDate}`
  );

  const unbalanced = scalar(`
    SELECT count(*) FROM (
      SELECT h.id FROM greentarget.journal_entries h
        JOIN greentarget.journal_entry_lines l ON l.journal_entry_id = h.id
       GROUP BY h.id HAVING SUM(l.debit_amount) <> SUM(l.credit_amount)
    ) x`);
  check(unbalanced === "0", "every imported journal balances individually", `found ${unbalanced}`);

  const globalDiff = scalar(
    "SELECT (SUM(ROUND(debit_amount*100)) - SUM(ROUND(credit_amount*100)))::bigint FROM greentarget.journal_entry_lines"
  );
  check(globalDiff === "0", "global posted DR = CR", `difference ${globalDiff} cents`);
}

// ---------------------------------------------------------------------------
// 1. Read the balances the way a report engine will: anchor + posted lines
// ---------------------------------------------------------------------------
const balances = {};
for (const period of PERIODS) {
  const asOf = MONTH_ENDS[period];
  const rows = query(
    `SELECT anchors.account_code,
            (ROUND(anchors.amount * 100)
             + COALESCE((
                 SELECT SUM(ROUND(lines.debit_amount * 100)
                            - ROUND(lines.credit_amount * 100))
                   FROM greentarget.journal_entries headers
                   JOIN greentarget.journal_entry_lines lines
                     ON lines.journal_entry_id = headers.id
                  WHERE headers.status = 'posted'
                    AND headers.source_type = 'legacy_import'
                    AND lines.account_code = anchors.account_code
                    AND headers.entry_date >= anchors.as_of_date
                    AND headers.entry_date <= DATE '${asOf}'
               ), 0))::bigint
       FROM greentarget.account_opening_balances anchors
      WHERE anchors.as_of_date = DATE '2026-01-01'
      ORDER BY anchors.account_code`,
    ["code", "cents"]
  );
  balances[period] = new Map(rows.map((r) => [r.code, Number(r.cents)]));
}

// Parent/category fields are live chart metadata and may be intentionally
// edited after cutover. The immutable historical reconciliation uses the 28
// GTDB identities from the hash-validated legacy evidence instead.
const debtorChildren = new Set(
  legacyValidation.perSectionChains
    .filter((section) => section.sourceKind === "GTDB")
    .map((section) => section.code)
);
check(debtorChildren.size === 28, "legacy evidence identifies all 28 GTDB debtor accounts", `found ${debtorChildren.size}`);

// ---------------------------------------------------------------------------
// 2. THE HEADLINE GATE - per-account, per-month, against the printed scans
// ---------------------------------------------------------------------------
console.log("\n-- 1. per-account month-end closes vs the printed Trial Balances ----");
let comparisons = 0;
for (const period of PERIODS) {
  const asOf = MONTH_ENDS[period];
  const printedAccounts = tbByPeriod[period].filter((r) => r.record_type === "account");
  const mismatches = [];
  const seen = new Set();

  for (const row of printedAccounts) {
    const code = normalizePrinted(row.acc_code);
    // Approved removal: the fixture still prints it (0.00 every month) but
    // its live account and zero fence are deliberately gone.
    if (REMOVED_ZERO_FENCES.has(code)) continue;
    const debit = printedCents(row.debit);
    const credit = printedCents(row.credit);

    if (code === CONTROL_LINE) {
      // The printed control nets the 28 debtor children.
      const derived = [...debtorChildren].reduce((sum, child) => sum + (balances[period].get(child) ?? 0), 0);
      const printed = (debit ?? 0) - (credit ?? 0);
      comparisons++;
      if (derived !== printed) {
        mismatches.push(`${CONTROL_LINE}: printed ${money(printed)} vs ledger ${money(derived)}`);
      }
      continue;
    }

    seen.add(code);

    if (BLANK_PRINTED.has(code)) {
      // Printed blank/blank: the ledger must have NO balance at all for it.
      comparisons++;
      if (debit !== null || credit !== null) {
        mismatches.push(`${code}: fixture no longer prints blank/blank`);
      } else if (balances[period].has(code)) {
        mismatches.push(`${code}: printed blank but the ledger surfaces a balance (it must have no anchor and no line)`);
      }
      continue;
    }

    const printed = (debit ?? 0) - (credit ?? 0);
    const actual = balances[period].get(code);
    comparisons++;
    if (actual === undefined) {
      mismatches.push(`${code}: printed ${money(printed)} but the ledger has no anchor`);
    } else if (actual !== printed) {
      mismatches.push(`${code}: printed ${money(printed)} vs ledger ${money(actual)} (residual ${money(actual - printed)})`);
    }
  }

  // Nothing in the ledger may be missing from the printed page either.
  const extra = [...balances[period].keys()].filter((code) => !seen.has(code) && !debtorChildren.has(code));

  check(
    mismatches.length === 0,
    `2026-${period}: all ${printedAccounts.length} printed lines reproduce from the imported ledger at ${asOf}`,
    mismatches.slice(0, 6).join("; ")
  );
  check(
    extra.length === 0,
    `2026-${period}: the ledger surfaces no account the scan does not print`,
    extra.slice(0, 10).join(", ")
  );
}
console.log(`      (${comparisons} exact per-account comparisons)`);

// ---------------------------------------------------------------------------
// 3. Printed control totals
// ---------------------------------------------------------------------------
console.log("\n-- 2. printed control totals ---------------------------------------");
for (let index = 0; index < PERIODS.length; index++) {
  const period = PERIODS[index];
  const expectation = manifest.printedTrialBalanceExpectations.periods[index];

  let debit = 0;
  let credit = 0;
  for (const value of balances[period].values()) {
    if (value > 0) debit += value;
    else credit += -value;
  }

  check(debit === credit, `2026-${period}: the ledger's trial balance balances`, `DR ${money(debit)} vs CR ${money(credit)}`);

  // The printed grand total nets the KBOX (-0.01) and RUMAH MERAH (-1.00)
  // credit balances inside the single DEBTOR control line, so a per-account
  // trial balance is exactly 1.01 higher. Documented, NOT a discrepancy.
  const netting = debit - expectation.grandTotalCents;
  check(
    netting === 101,
    `2026-${period}: ledger total is 1.01 above the printed grand total ${money(expectation.grandTotalCents)} (the documented debtor netting)`,
    `gap ${money(netting)}`
  );

  const control = [...debtorChildren].reduce((sum, child) => sum + (balances[period].get(child) ?? 0), 0);
  check(
    control === expectation.debtorControlCents,
    `2026-${period}: the 28 debtor children sum to the printed DEBTOR control ${money(expectation.debtorControlCents)}`,
    `found ${money(control)}`
  );
}

// ---------------------------------------------------------------------------
// 4. The derived CD_SD cash leg - the phase's single largest judgement call
// ---------------------------------------------------------------------------
console.log("\n-- 3. the derived CD_SD cash path ----------------------------------");
{
  const expectedPath = [8591540, 7289540, 6937740, 7195540, 6644540, 6570540];
  const actualPath = PERIODS.map((period) => balances[period].get("CD_SD"));
  check(
    JSON.stringify(actualPath) === JSON.stringify(expectedPath),
    "CD_SD reproduces G1's predicted month-end path 85,915.40 / 72,895.40 / 69,377.40 / 71,955.40 / 66,445.40 / 65,705.40",
    actualPath.map(money).join(" / ")
  );

  const anchor = scalar(
    "SELECT ROUND(amount*100)::bigint FROM greentarget.account_opening_balances WHERE account_code='CD_SD' AND as_of_date = DATE '2026-01-01'"
  );
  check(anchor === "7641540", "CD_SD anchors at the evidenced 76,415.40, not the 65,705.40 its section prints", `found ${money(Number(anchor))}`);

  const legs = query(
    `SELECT count(*), SUM(ROUND(debit_amount*100))::bigint, SUM(ROUND(credit_amount*100))::bigint
       FROM greentarget.journal_entry_lines jel
       JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
      WHERE jel.account_code='CD_SD' AND je.source_type = 'legacy_import'`,
    ["count", "debit", "credit"]
  )[0];
  check(legs.count === "1433", "exactly 1,433 derived CD_SD lines, one per unbalanced source group", `found ${legs.count}`);
  check(
    legs.debit === "21836000" && legs.credit === "22907000",
    "the derived legs total DR 218,360.00 / CR 229,070.00 - the counter cash received and banked",
    `DR ${money(Number(legs.debit))} / CR ${money(Number(legs.credit))}`
  );

  // Every derived line is traceable to a marked staging row (organic G7 CD_SD
  // lines are operational postings, not derived legs, and are excluded).
  const untraceable = scalar(`
    SELECT count(*) FROM greentarget.journal_entry_lines l
     WHERE l.account_code = 'CD_SD'
       AND (SELECT h.source_type FROM greentarget.journal_entries h WHERE h.id = l.journal_entry_id) = 'legacy_import'
       AND NOT EXISTS (
         SELECT 1 FROM greentarget.import_legacy_rows s
          WHERE s.source_kind = 'DERIVED'
            AND s.record_kind = 'transaction'
            AND s.journal_group_key = (
              SELECT h.source_id FROM greentarget.journal_entries h WHERE h.id = l.journal_entry_id
            ))`);
  check(untraceable === "0", "every posted legacy CD_SD line traces to a DERIVED staging row", `found ${untraceable}`);

  // ...and no derived row hid inside another account.
  const strayDerived = scalar(
    "SELECT count(*) FROM greentarget.import_legacy_rows WHERE source_kind='DERIVED' AND account_code <> 'CD_SD'"
  );
  check(strayDerived === "0", "no derived staging row touches any account other than CD_SD", `found ${strayDerived}`);
}

// ---------------------------------------------------------------------------
// 5. Named June figures from the Balance Sheet
// ---------------------------------------------------------------------------
console.log("\n-- 4. June 2026 Balance Sheet tie-outs -----------------------------");
{
  const bs = manifest.printedBalanceSheetExpectations.lines;
  const byKey = (key) => bs.find((line) => line.key === key);
  const june = balances["06"];

  const receivable = [...debtorChildren].reduce((sum, child) => sum + (june.get(child) ?? 0), 0);
  check(
    receivable === byKey("TRADE RECEIVABLE").amountCents,
    `June trade receivable = ${money(byKey("TRADE RECEIVABLE").amountCents)}`,
    money(receivable)
  );

  const namedAccounts = [
    ["PBB_1", "CASH AT BANK"],
    ["CA_TAX", "TAX RECOVERABLE"],
    ["SC", "SHARE CAPITAL"],
    ["RP", "RETAINED PROFIT - B/F"],
  ];
  for (const [code, key] of namedAccounts) {
    const line = byKey(key);
    if (!line) {
      fail(`Balance Sheet expectation "${key}" is missing from the manifest`);
      continue;
    }
    const actual = june.get(code);
    const expected = Math.abs(line.amountCents);
    check(
      actual !== undefined && Math.abs(actual) === expected,
      `June ${key} (${code}) = ${money(expected)}`,
      actual === undefined ? "no ledger balance" : money(actual)
    );
  }

  // Cash in hand (printed APPX 6) closes at .00 in June. Resolve its immutable
  // legacy membership from the scan rather than mutable live fs_note fields.
  const cashInHandCodes = tbByPeriod["06"]
    .filter((row) => row.record_type === "account" && row.appx === "6")
    .map((row) => normalizePrinted(row.acc_code));
  const cashInHandCents = cashInHandCodes.reduce((sum, code) => sum + (june.get(code) ?? 0), 0);
  check(
    cashInHandCents === 0,
    "June cash in hand (legacy APPX 6) opens and closes at .00",
    `found ${money(cashInHandCents)}`
  );
}

// ---------------------------------------------------------------------------
// 6. Provenance, print order, and phase boundaries
// ---------------------------------------------------------------------------
console.log("\n-- 5. provenance and print order -----------------------------------");
{
  const noSource = scalar(
    "SELECT count(*) FROM greentarget.journal_entries WHERE source_type = 'legacy_import' AND source_id IS NULL"
  );
  check(noSource === "0", "every imported journal carries its staging group key", `found ${noSource}`);

  const noFamily = scalar("SELECT count(*) FROM greentarget.journal_entries WHERE source_type = 'legacy_import' AND legacy_entry_type IS NULL");
  check(noFamily === "0", "every imported journal carries its decoded legacy family", `found ${noFamily}`);

  const families = query(
    "SELECT legacy_entry_type, count(*) FROM greentarget.journal_entries WHERE source_type = 'legacy_import' GROUP BY 1 ORDER BY 1",
    ["family", "count"]
  );
  check(families.length === 9, "all nine G0-decoded families are represented", `found ${families.length}`);

  // Within the IMPORTED months posting_sequence must be a dense 1..N: that
  // density is the measured evidence of the legacy print order (G4), so a gap
  // means a row was lost. Scope it to the import, not to every month.
  const badSequence = scalar(`
    SELECT count(*) FROM (
      SELECT DATE_TRUNC('month', entry_date) AS m,
             count(*) AS n, min(posting_sequence) AS lo, max(posting_sequence) AS hi,
             count(DISTINCT posting_sequence) AS distinct_n
        FROM greentarget.journal_entries
       WHERE source_type = 'legacy_import'
       GROUP BY 1
    ) x WHERE lo <> 1 OR hi <> n OR distinct_n <> n`);
  check(badSequence === "0", "posting_sequence is a dense 1..N within every imported month", `${badSequence} month(s) broken`);

  // Organic months cannot be dense: deleting an invoice takes its journal with
  // it (10h) and cancelled journals keep their sequence, both leaving legitimate
  // gaps. What a ledger actually needs is an unambiguous order, so assert that
  // every sequence is present, positive and unique within its month.
  const badOrganicSequence = scalar(`
    SELECT count(*) FROM (
      SELECT DATE_TRUNC('month', entry_date) AS m,
             count(*) AS n, min(posting_sequence) AS lo,
             count(DISTINCT posting_sequence) AS distinct_n
        FROM greentarget.journal_entries
       WHERE source_type IS DISTINCT FROM 'legacy_import'
       GROUP BY 1
    ) x WHERE lo < 1 OR lo IS NULL OR distinct_n <> n`);
  check(
    badOrganicSequence === "0",
    "posting_sequence is present, positive and unique within every organic month",
    `${badOrganicSequence} month(s) broken`
  );

  const cheques = scalar("SELECT count(*) FROM greentarget.journal_entry_lines WHERE cheque_reference IS NOT NULL");
  check(cheques === "1014", "all 1,014 per-line cheque / bank transaction references survived (named trap 5)", `found ${cheques}`);

  const noAnchorAccounts = scalar(
    "SELECT count(*) FROM greentarget.account_opening_balances WHERE account_code IN ('DEBTOR','BTFS')"
  );
  check(noAnchorAccounts === "0", "DEBTOR and BTFS have no opening anchor", `found ${noAnchorAccounts}`);
  const noLineAccounts = scalar(
    "SELECT count(*) FROM greentarget.journal_entry_lines WHERE account_code IN ('DEBTOR','BTFS')"
  );
  check(noLineAccounts === "0", "DEBTOR and BTFS have no posted journal line", `found ${noLineAccounts}`);

  const outside = scalar(
    "SELECT count(*) FROM greentarget.journal_entries WHERE source_type = 'legacy_import' AND (entry_date < DATE '2026-01-01' OR entry_date >= DATE '2026-07-01')"
  );
  check(outside === "0", "no imported journal posts outside 2026-01-01..2026-06-30 (R2 cutover)", `found ${outside}`);

  // G7's mirror rule remains intact for ordinary screens. The one approved
  // June correction is source-less because it is genuinely a manual JV, but
  // it entered through the documented guarded-migration bypass. Validate its
  // full fingerprint before excluding that exact reference from the gate.
  const approvedCorrectionReferences = scalar(`
    SELECT count(*)
      FROM greentarget.journal_entries
     WHERE UPPER(BTRIM(reference_no)) = '${APPROVED_LOCKED_PERIOD_JV_REFERENCE}'`);
  const exactApprovedCorrections = scalar(`
    SELECT count(*)
      FROM greentarget.journal_entries header
     WHERE header.reference_no = '${APPROVED_LOCKED_PERIOD_JV_REFERENCE}'
       AND header.entry_type = 'JV'
       AND header.entry_date = DATE '2026-06-30'
       AND header.description = 'BANK CHARGES MONTH OF JUNE 2026'
       AND header.total_debit = 2.70
       AND header.total_credit = 2.70
       AND header.status = 'posted'
       AND header.display_reference IS NULL
       AND header.posting_sequence = 279
       AND header.source_type IS NULL
       AND header.source_id IS NULL
       AND header.legacy_entry_type IS NULL
       AND header.manual_override IS false
       AND header.cheque_no IS NULL
       AND header.created_by = 'GT_JUNE_BANK_CHARGE_20260821'
       AND header.updated_by = 'GT_JUNE_BANK_CHARGE_20260821'
       AND header.posted_by = 'GT_JUNE_BANK_CHARGE_20260821'
       AND header.posted_at IS NOT NULL
       AND (SELECT count(*) FROM greentarget.journal_entry_lines line
             WHERE line.journal_entry_id = header.id) = 2
       AND EXISTS (
         SELECT 1 FROM greentarget.journal_entry_lines line
          WHERE line.journal_entry_id = header.id
            AND line.line_number = 1
            AND line.account_code = 'BWBC'
            AND line.debit_amount = 2.70
            AND line.credit_amount = 0
            AND line.reference IS NULL
            AND line.particulars = 'BANK CHARGES MONTH OF JUNE 2026'
            AND line.cheque_reference IS NULL
            AND line.display_order = 1
            AND line.display_reference IS NULL
            AND line.debtor_subledger_code IS NULL
       )
       AND EXISTS (
         SELECT 1 FROM greentarget.journal_entry_lines line
          WHERE line.journal_entry_id = header.id
            AND line.line_number = 2
            AND line.account_code = 'PBB_1'
            AND line.debit_amount = 0
            AND line.credit_amount = 2.70
            AND line.reference IS NULL
            AND line.particulars = 'BANK CHARGES MONTH OF JUNE 2026'
            AND line.cheque_reference IS NULL
            AND line.display_order = 2
            AND line.display_reference IS NULL
            AND line.debtor_subledger_code IS NULL
       )`);
  check(
    (approvedCorrectionReferences === "0" && exactApprovedCorrections === "0") ||
      (approvedCorrectionReferences === "1" && exactApprovedCorrections === "1"),
    "JV2606-01 is absent or exactly matches the approved 30-Jun bank-charge correction",
    `references ${approvedCorrectionReferences}, exact ${exactApprovedCorrections}`
  );

  const organicEarly = scalar(
    `SELECT count(*) FROM greentarget.journal_entries
      WHERE source_type IS DISTINCT FROM 'legacy_import'
        AND entry_date < DATE '2026-07-01'
        AND UPPER(BTRIM(reference_no)) IS DISTINCT FROM '${APPROVED_LOCKED_PERIOD_JV_REFERENCE}'`
  );
  check(
    organicEarly === "0",
    "no unexplained organic journal posts before the 2026-07-01 open date (R8)",
    `found ${organicEarly}`
  );

  if (exactApprovedCorrections === "1") {
    const correctedBalances = query(
      `SELECT anchors.account_code,
              (ROUND(anchors.amount * 100) + COALESCE((
                SELECT SUM(ROUND(lines.debit_amount * 100)
                           - ROUND(lines.credit_amount * 100))
                  FROM greentarget.journal_entries headers
                  JOIN greentarget.journal_entry_lines lines
                    ON lines.journal_entry_id = headers.id
                 WHERE headers.status = 'posted'
                   AND headers.entry_date BETWEEN anchors.as_of_date AND DATE '2026-06-30'
                   AND lines.account_code = anchors.account_code
              ), 0))::bigint AS cents
         FROM greentarget.account_opening_balances anchors
        WHERE anchors.as_of_date = DATE '2026-01-01'
          AND anchors.account_code IN ('BWBC', 'PBB_1')
        ORDER BY anchors.account_code`,
      ["code", "cents"]
    );
    const correctedByCode = new Map(
      correctedBalances.map((row) => [row.code, Number(row.cents)])
    );
    check(
      correctedByCode.get("BWBC") === 12010 &&
        correctedByCode.get("PBB_1") === 2846567,
      "the approved JV leaves June BWBC at 120.10 and PBB_1 at 28,465.67",
      `BWBC ${money(correctedByCode.get("BWBC"))}, PBB_1 ${money(
        correctedByCode.get("PBB_1")
      )}`
    );
  }
}

console.log("\n-- 6. Tien Hock isolation ------------------------------------------");
{
  // TH's note catalogue is genuinely structural, so it is still asserted
  // exactly: it is what a mis-scoped GT clone would actually corrupt.
  // public.account_codes is NOT structural - debtorSync creates one DEBTOR
  // child per new Tien Hock customer, so an equality baseline here only
  // measures how long ago it was written. The isolation invariant is that GT
  // work never REMOVES a TH account.
  const thAccounts = Number(scalar("SELECT count(*) FROM public.account_codes"));
  const thNotes = scalar("SELECT count(*) FROM public.financial_statement_notes");
  check(
    thAccounts >= 2827,
    "public.account_codes never shrinks below the 2,827 G8 floor",
    `found ${thAccounts}`
  );
  check(thNotes === "33", "public.financial_statement_notes unmoved at 33", `found ${thNotes}`);

  // TH's ledger is LIVE: ordinary Tien Hock keying grows it every day, so an
  // equality baseline here only measures how long ago it was written. The
  // isolation invariant is that GT work never REMOVES a TH journal.
  const thJournals = Number(scalar("SELECT count(*) FROM public.journal_entries"));
  const thLines = scalar("SELECT count(*) FROM public.journal_entry_lines");
  check(
    thJournals >= 8238,
    "public.journal_entries never shrinks below the 8,238 G8 floor",
    `found ${thJournals}`
  );
  check(Number(thLines) > 0, "public.journal_entry_lines still populated", `found ${thLines}`);

  // The sharp isolation test: 69 GT codes collide with TH codes by name, but a
  // code that exists ONLY in GT can never legitimately appear in a TH line.
  const gtOnlyInTh = scalar(`
    SELECT count(*) FROM public.journal_entry_lines l
     WHERE l.account_code IN (
       SELECT g.code FROM greentarget.account_codes g
        LEFT JOIN public.account_codes t ON t.code = g.code
        WHERE t.code IS NULL)`);
  check(gtOnlyInTh === "0", "no Tien Hock journal line references a GT-only account code", `found ${gtOnlyInTh}`);
}

console.log("");
if (failures === 0) {
  console.log(`ALL CHECKS PASSED  (${checks} gates, ${comparisons} per-account comparisons)`);
  process.exit(0);
}
console.log(`${failures} CHECK(S) FAILED  (${checks} passed)`);
process.exit(1);

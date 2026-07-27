#!/usr/bin/env node
/**
 * Green Target Phase G4 - import staging builder.
 *
 * Takes the hash-pinned G0 staging CSV (which stages the two workbooks
 * VERBATIM and invents nothing) and produces the population G4 actually
 * imports:
 *
 *   3,469 transcribed source rows, byte-for-byte unchanged, keeping their
 *         original stage_sequence 1..3469 so any row is still traceable to an
 *         exact cell in a hash-pinned workbook
 * +     1 DERIVED opening row  - the +10,710.00 DR correction to CD_SD
 * + 1,433 DERIVED transaction rows - the CD_SD cash leg the legacy export
 *         never printed, one per unbalanced journal group
 * = 4,903 rows
 *
 * WHY THE DERIVED ROWS EXIST (user-approved 26 Jul 2026; G0 explicitly refused
 * to synthesise them without that approval):
 *
 *   The legacy export prints no cash-in-hand activity. Counter sales credit
 *   revenue with no debit (`#/#`, 1,011 groups, 218,360.00 CR); bankings debit
 *   the bank with no credit (`RV#/#/#` 421 groups + `JV26/06/77`, 229,070.00
 *   DR). G1 proved from all six Trial Balance scans that the cash sits in
 *   CD_SD "CASH DEBTORS (SUNDRY DEBTORS)", whose GTDB section prints only a
 *   static 2026-06-30 snapshot of 65,705.40 with zero transaction detail.
 *
 *   The derivation is FORCED, not chosen: no RV group is mixed (every one is
 *   either fully balanced against a debtor or has no debtor leg at all), so
 *   there is no allocation judgement anywhere. Each unbalanced group gets
 *   exactly one CD_SD line for its own imbalance, which is why every imported
 *   journal balances individually.
 *
 *   It is falsifiable and this script tests it: the six CD_SD month-ends must
 *   reproduce 85,915.40 / 72,895.40 / 69,377.40 / 71,955.40 / 66,445.40 /
 *   65,705.40, the opening anchor set must sum to EXACTLY zero, and all six
 *   month-end trial balances must balance. A single mis-allocated line breaks
 *   at least one of them.
 *
 * Outputs
 *   generated/greentarget_import_staging.csv        the 4,903-row load file
 *   generated/import-derivation-report.json         the full audit record
 *   ../../migrations/2026-07-27_greentarget_opening_anchors.sql   501 anchors
 *
 * Usage
 *   node dev/import/greentarget-legacy/build-import-staging.mjs
 *   node dev/import/greentarget-legacy/build-import-staging.mjs --check-only
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const GENERATED = path.join(HERE, "generated");
const SOURCE_CSV = path.join(GENERATED, "greentarget_jan_jun_staging.csv");
const OUT_CSV = path.join(GENERATED, "greentarget_import_staging.csv");
const OUT_REPORT = path.join(GENERATED, "import-derivation-report.json");
const OUT_ANCHORS = path.join(
  REPO,
  "dev",
  "migrations",
  "2026-07-27_greentarget_opening_anchors.sql"
);

const CHECK_ONLY = process.argv.includes("--check-only");

// ---------------------------------------------------------------------------
// Approved constants. Every one is evidenced in a tracked artifact.
// ---------------------------------------------------------------------------

/** The GTDB account that carries the unbanked counter cash (G1). */
const CASH_ACCOUNT = "CD_SD";
const CASH_ACCOUNT_DESCRIPTION = "CASH DEBTORS (SUNDRY DEBTORS)";

/** G0 measured the opening set short by exactly this much on the debit side. */
const CASH_OPENING_CORRECTION_CENTS = 1071000;

/** CD_SD's true 2026-01-01 opening = printed 65,705.40 + 10,710.00 (G1). */
const CASH_OPENING_CENTS = 6570540 + CASH_OPENING_CORRECTION_CENTS;

/** G1's falsifiable prediction, read off the six Trial Balance scans. */
const CASH_MONTH_END_CENTS = [8591540, 7289540, 6937740, 7195540, 6644540, 6570540];

/** The printed DEBTOR / TRADE DEBTOR / APPX 22 control, all six months (G1). */
const PRINTED_DEBTOR_CONTROL_CENTS = [
  18116672, 16199537, 15905157, 16281137, 15618077, 15678222,
];

/** The printed Trial Balance grand totals (report-fixtures/source-manifest). */
const PRINTED_GRAND_TOTAL_CENTS = [
  268118633, 272028458, 276568673, 280912998, 285232138, 289680853,
];

/**
 * The printed grand total nets the KBOX (-0.01) and RUMAH MERAH (-1.00) credit
 * balances inside its single DEBTOR control line, so a per-account trial
 * balance is exactly 1.01 higher. Documented in source-manifest.json; NOT a
 * discrepancy to fix.
 */
const DEBTOR_NETTING_CENTS = 101;

const MONTH_ENDS = [
  "2026-01-31",
  "2026-02-28",
  "2026-03-31",
  "2026-04-30",
  "2026-05-31",
  "2026-06-30",
];

/** Accounts that must never receive an opening anchor (G3 decision 4). */
const NO_ANCHOR = new Set(["DEBTOR", "BTFS"]);

/** Marks on every synthesised row so it can never pass as transcribed source. */
const DERIVED_PROVENANCE = "derived_cash_debtors_leg";
const DERIVED_SPECIAL_CASE = "cd_sd_unbanked_counter_cash";
const DERIVED_REPAIR_REASON =
  "User-approved 26 Jul 2026. The legacy export prints no cash-in-hand leg: " +
  "counter sales credit revenue with no debit and bankings debit the bank " +
  "with no credit. G1 proved from all six Trial Balance scans that the cash " +
  "sits in CD_SD, whose GTDB section prints only a static 2026-06-30 snapshot " +
  "with zero transaction detail. One derived line per unbalanced journal " +
  "group, for that group's own imbalance.";

/** stage_sequence base for derived rows - above the 3,469 source rows so line
 *  ordering by stage_sequence always puts the derived leg last in its journal. */
const DERIVED_OPENING_SEQUENCE = 10000;
const DERIVED_TRANSACTION_SEQUENCE_BASE = 10000;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
/**
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
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
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
  return rows;
}

/**
 * @param {string} value
 * @returns {string}
 */
function csvField(value) {
  if (value === "") return "";
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * @param {string[]} header
 * @param {Record<string, string>[]} rows
 * @returns {string}
 */
function writeCsv(header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((column) => csvField(row[column] ?? "")).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

const sha256 = (/** @type {string|Buffer} */ data) =>
  crypto.createHash("sha256").update(data).digest("hex");

// ---------------------------------------------------------------------------
// Load and verify the G0 staging CSV
// ---------------------------------------------------------------------------
const manifest = JSON.parse(
  fs.readFileSync(path.join(HERE, "source-manifest.json"), "utf8")
);

if (!fs.existsSync(SOURCE_CSV)) {
  console.error(
    `Missing ${SOURCE_CSV}.\nRun: node dev/import/greentarget-legacy/prepare-staging.mjs`
  );
  process.exit(1);
}

const sourceBuffer = fs.readFileSync(SOURCE_CSV);
const sourceHash = sha256(sourceBuffer);
if (sourceHash !== manifest.expectedStagingSha256) {
  console.error(
    `G0 staging SHA-256 mismatch.\n  expected ${manifest.expectedStagingSha256}\n  actual   ${sourceHash}\n` +
      `Regenerate with prepare-staging.mjs; never hand-edit the staging CSV.`
  );
  process.exit(1);
}

const parsed = parseCsv(sourceBuffer.toString("utf8"));
const SOURCE_HEADER = parsed[0];
/** @type {Record<string,string>[]} */
const sourceRows = parsed
  .slice(1)
  .map((cells) => Object.fromEntries(SOURCE_HEADER.map((h, i) => [h, cells[i] ?? ""])));

/** @type {string[]} */
const OUT_HEADER = [
  "stage_sequence",
  "record_kind",
  "source_file",
  "source_kind",
  "source_sha256",
  "source_physical_line",
  "source_row_index",
  "injected_after_physical_line",
  "legacy_account_code",
  "account_code",
  "account_description",
  "entry_date",
  "date_encoding",
  "journal_ref",
  "journal_group_key",
  "line_display_reference",
  "particulars",
  "cheque_reference",
  "debit_cents",
  "credit_cents",
  "running_balance_cents",
  "provenance",
  "repaired",
  "repair_reason",
  "special_case",
];

// ---------------------------------------------------------------------------
// Gates on the source population itself
// ---------------------------------------------------------------------------
/** @type {string[]} */
const failures = [];
/** @param {boolean} condition @param {string} message */
const require_ = (condition, message) => {
  if (!condition) failures.push(message);
};

const openingRows = sourceRows.filter((r) => r.record_kind === "opening");
const transactionRows = sourceRows.filter((r) => r.record_kind === "transaction");

require_(sourceRows.length === 3469, `G0 staging is ${sourceRows.length} rows, expected 3,469`);
require_(openingRows.length === 501, `G0 staging has ${openingRows.length} opening rows, expected 501`);
require_(
  transactionRows.length === 2968,
  `G0 staging has ${transactionRows.length} transaction rows, expected 2,968`
);
require_(
  sourceRows.every((r) => r.provenance === "source"),
  "a G0 staging row is not marked provenance=source"
);
require_(
  !openingRows.some((r) => NO_ANCHOR.has(r.account_code)),
  "DEBTOR or BTFS unexpectedly has a staged opening row"
);

// ---------------------------------------------------------------------------
// Group and derive
// ---------------------------------------------------------------------------
/** @type {Map<string, Record<string,string>[]>} */
const groups = new Map();
for (const row of transactionRows) {
  const key = row.journal_group_key;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
for (const rows of groups.values()) {
  rows.sort((a, b) => Number(a.stage_sequence) - Number(b.stage_sequence));
}

require_(groups.size === 1705, `${groups.size} journal groups, expected 1,705`);

/** G0's decoded families. Order matters: PBEB before PBE before PB. */
function familyOf(/** @type {string} */ reference) {
  if (/^RV\d/.test(reference)) return "RV#/#/#";
  if (/^PBEB/.test(reference)) return "PBEB#/#";
  if (/^PBE\d/.test(reference)) return "PBE#/#";
  if (/^PB\d/.test(reference)) return "PB#/#";
  if (/^JBSL/.test(reference)) return "JBSL/#/#";
  if (/^JWDR/.test(reference)) return "JWDR/#/#";
  if (/^JV/.test(reference)) return "JV#/#/#";
  if (/^I\d/.test(reference)) return "I#/#";
  if (/^\d+\/\d+$/.test(reference)) return "#/#";
  return null;
}

/** Only these three families may be unbalanced (G0, account-aliases.json). */
const CASH_GAP_FAMILIES = new Set(["#/#", "RV#/#/#", "JV#/#/#"]);

/** @type {{key:string, date:string, ref:string, family:string, debit:number, credit:number, sourceFile:string, sourceSha:string, afterLine:number, particulars:string, displayReference:string}[]} */
const derivedLegs = [];

for (const [key, rows] of groups) {
  const debit = rows.reduce((sum, r) => sum + Number(r.debit_cents), 0);
  const credit = rows.reduce((sum, r) => sum + Number(r.credit_cents), 0);
  if (debit === credit) continue;

  const reference = rows[0].journal_ref;
  const family = familyOf(reference);
  if (!CASH_GAP_FAMILIES.has(family)) {
    failures.push(`Unbalanced group ${key} belongs to family ${family}, which G0 proved self-balancing`);
    continue;
  }
  const sourceKinds = new Set(rows.map((r) => r.source_kind));
  if (sourceKinds.size !== 1) {
    failures.push(`Unbalanced group ${key} spans both workbooks; the derived leg's source file is ambiguous`);
    continue;
  }
  if (rows.some((r) => r.account_code === CASH_ACCOUNT)) {
    failures.push(`Unbalanced group ${key} already touches ${CASH_ACCOUNT}`);
    continue;
  }

  const difference = credit - debit; // > 0 => the group needs a DEBIT to CD_SD
  derivedLegs.push({
    key,
    date: rows[0].entry_date,
    ref: reference,
    family,
    debit: difference > 0 ? difference : 0,
    credit: difference < 0 ? -difference : 0,
    sourceFile: rows[0].source_file,
    sourceSha: rows[0].source_sha256,
    afterLine: Math.max(...rows.map((r) => Number(r.source_physical_line))),
    // Echo the printed particular so CD_SD's ledger reads as the document it
    // is, with the derived nature spelled out rather than hidden.
    particulars:
      rows[0].particulars +
      (difference > 0
        ? " (DERIVED - COUNTER CASH RECEIVED)"
        : " (DERIVED - COUNTER CASH BANKED)"),
    displayReference: rows[0].line_display_reference,
  });
}

derivedLegs.sort(
  (a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref) || a.key.localeCompare(b.key)
);

require_(derivedLegs.length === 1433, `${derivedLegs.length} derived legs, expected 1,433`);

const derivedDebit = derivedLegs.reduce((s, d) => s + d.debit, 0);
const derivedCredit = derivedLegs.reduce((s, d) => s + d.credit, 0);
require_(derivedDebit === 21836000, `derived debits ${derivedDebit} cents, expected 21,836,000`);
require_(derivedCredit === 22907000, `derived credits ${derivedCredit} cents, expected 22,907,000`);
require_(
  derivedCredit - derivedDebit === CASH_OPENING_CORRECTION_CENTS,
  `derived net movement does not equal the ${CASH_OPENING_CORRECTION_CENTS}-cent opening shortfall`
);

const familyBreakdown = {};
for (const leg of derivedLegs) {
  const bucket = (familyBreakdown[leg.family] ??= { legs: 0, debitCents: 0, creditCents: 0 });
  bucket.legs++;
  bucket.debitCents += leg.debit;
  bucket.creditCents += leg.credit;
}

// ---------------------------------------------------------------------------
// Build the output rows
// ---------------------------------------------------------------------------
const cashSection = openingRows.find((r) => r.account_code === CASH_ACCOUNT);
require_(!!cashSection, `${CASH_ACCOUNT} has no staged opening row`);
require_(
  cashSection && Number(cashSection.running_balance_cents) === 6570540,
  `${CASH_ACCOUNT} staged opening is not the printed 65,705.40`
);

if (failures.length > 0) {
  console.error("Source gates failed:\n  " + failures.join("\n  "));
  process.exit(1);
}

/** @type {Record<string,string>[]} */
const outputRows = [];

for (const row of sourceRows) {
  outputRows.push({
    ...row,
    injected_after_physical_line: "",
    repaired: "false",
    repair_reason: "",
    special_case: "",
  });
}

outputRows.push({
  stage_sequence: String(DERIVED_OPENING_SEQUENCE),
  record_kind: "opening",
  source_file: cashSection.source_file,
  source_kind: "DERIVED",
  source_sha256: cashSection.source_sha256,
  source_physical_line: "",
  source_row_index: "",
  injected_after_physical_line: cashSection.source_physical_line,
  legacy_account_code: CASH_ACCOUNT,
  account_code: CASH_ACCOUNT,
  account_description: CASH_ACCOUNT_DESCRIPTION,
  entry_date: "2026-01-01",
  date_encoding: "derived",
  journal_ref: "",
  journal_group_key: "",
  line_display_reference: "",
  particulars: "BALANCE C/FWD (DERIVED - UNBANKED COUNTER CASH AT 2026-01-01)",
  cheque_reference: "",
  debit_cents: String(CASH_OPENING_CORRECTION_CENTS),
  credit_cents: "0",
  running_balance_cents: String(CASH_OPENING_CORRECTION_CENTS),
  provenance: DERIVED_PROVENANCE,
  repaired: "true",
  repair_reason:
    DERIVED_REPAIR_REASON +
    " This opening row carries the 10,710.00 DR by which the staged 1 January " +
    "set is short, so CD_SD anchors at its evidenced 76,415.40 rather than the " +
    "65,705.40 its section prints (that figure is its 2026-06-30 close).",
  special_case: DERIVED_SPECIAL_CASE,
});

derivedLegs.forEach((leg, index) => {
  outputRows.push({
    stage_sequence: String(DERIVED_TRANSACTION_SEQUENCE_BASE + index + 1),
    record_kind: "transaction",
    source_file: leg.sourceFile,
    source_kind: "DERIVED",
    source_sha256: leg.sourceSha,
    source_physical_line: "",
    source_row_index: "",
    injected_after_physical_line: String(leg.afterLine),
    legacy_account_code: CASH_ACCOUNT,
    account_code: CASH_ACCOUNT,
    account_description: CASH_ACCOUNT_DESCRIPTION,
    entry_date: leg.date,
    date_encoding: "derived",
    journal_ref: leg.ref,
    journal_group_key: leg.key,
    line_display_reference: leg.displayReference,
    particulars: leg.particulars,
    cheque_reference: "",
    debit_cents: String(leg.debit),
    credit_cents: String(leg.credit),
    running_balance_cents: "",
    provenance: DERIVED_PROVENANCE,
    repaired: "true",
    repair_reason: DERIVED_REPAIR_REASON,
    special_case: DERIVED_SPECIAL_CASE,
  });
});

// ---------------------------------------------------------------------------
// Prove the model - this is the part that makes the derivation falsifiable
// ---------------------------------------------------------------------------
/** @type {Record<string, number>} */
const anchorCents = {};
for (const row of outputRows) {
  if (row.record_kind !== "opening") continue;
  anchorCents[row.account_code] =
    (anchorCents[row.account_code] ?? 0) + Number(row.running_balance_cents);
}

const anchorAccounts = Object.keys(anchorCents).sort();
const anchorSum = Object.values(anchorCents).reduce((a, b) => a + b, 0);

require_(anchorAccounts.length === 501, `${anchorAccounts.length} anchor accounts, expected 501`);
require_(
  anchorSum === 0,
  `the opening anchor set sums to ${anchorSum} cents; Green Target's must be EXACTLY zero`
);
require_(
  anchorCents[CASH_ACCOUNT] === CASH_OPENING_CENTS,
  `${CASH_ACCOUNT} anchors at ${anchorCents[CASH_ACCOUNT]} cents, expected ${CASH_OPENING_CENTS}`
);
require_(
  !anchorAccounts.some((code) => NO_ANCHOR.has(code)),
  "DEBTOR or BTFS reached the anchor set"
);

/** Walk every account to each of the six month-ends. */
const monthEndBalances = MONTH_ENDS.map((asOf) => {
  /** @type {Record<string, number>} */
  const balance = { ...anchorCents };
  for (const row of outputRows) {
    if (row.record_kind !== "transaction") continue;
    if (row.entry_date > asOf) continue;
    balance[row.account_code] =
      (balance[row.account_code] ?? 0) + Number(row.debit_cents) - Number(row.credit_cents);
  }
  return balance;
});

const debtorCodes = new Set(
  openingRows.filter((r) => r.source_kind === "GTDB").map((r) => r.account_code)
);
require_(debtorCodes.size === 28, `${debtorCodes.size} GTDB debtor sections, expected 28`);

/** @type {{asOf:string, debitCents:number, creditCents:number, printedGrandTotalCents:number, nettingCents:number, debtorControlCents:number, printedDebtorControlCents:number, cashAccountCents:number, expectedCashAccountCents:number}[]} */
const monthEndReport = [];
monthEndBalances.forEach((balance, index) => {
  let debit = 0;
  let credit = 0;
  for (const value of Object.values(balance)) {
    if (value > 0) debit += value;
    else credit += -value;
  }
  const debtorControl = [...debtorCodes].reduce((sum, code) => sum + (balance[code] ?? 0), 0);
  const asOf = MONTH_ENDS[index];

  require_(debit === credit, `${asOf} trial balance does not balance: DR ${debit} vs CR ${credit}`);
  require_(
    debit - PRINTED_GRAND_TOTAL_CENTS[index] === DEBTOR_NETTING_CENTS,
    `${asOf} per-account total is ${debit - PRINTED_GRAND_TOTAL_CENTS[index]} cents above the printed grand total, expected ${DEBTOR_NETTING_CENTS}`
  );
  require_(
    debtorControl === PRINTED_DEBTOR_CONTROL_CENTS[index],
    `${asOf} debtor children sum to ${debtorControl}, printed control is ${PRINTED_DEBTOR_CONTROL_CENTS[index]}`
  );
  require_(
    balance[CASH_ACCOUNT] === CASH_MONTH_END_CENTS[index],
    `${asOf} ${CASH_ACCOUNT} closes at ${balance[CASH_ACCOUNT]}, expected ${CASH_MONTH_END_CENTS[index]}`
  );

  monthEndReport.push({
    asOf,
    debitCents: debit,
    creditCents: credit,
    printedGrandTotalCents: PRINTED_GRAND_TOTAL_CENTS[index],
    nettingCents: debit - PRINTED_GRAND_TOTAL_CENTS[index],
    debtorControlCents: debtorControl,
    printedDebtorControlCents: PRINTED_DEBTOR_CONTROL_CENTS[index],
    cashAccountCents: balance[CASH_ACCOUNT],
    expectedCashAccountCents: CASH_MONTH_END_CENTS[index],
  });
});

/** Monthly batch shapes, which post-monthly-journals.sql asserts. */
const monthlyShapes = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map(
  (month) => {
    const rows = outputRows.filter(
      (r) => r.record_kind === "transaction" && r.entry_date.startsWith(month)
    );
    const keys = new Set(rows.map((r) => r.journal_group_key));
    return {
      monthStart: `${month}-01`,
      journals: keys.size,
      lines: rows.length,
      derivedLines: rows.filter((r) => r.source_kind === "DERIVED").length,
      debitCents: rows.reduce((s, r) => s + Number(r.debit_cents), 0),
      creditCents: rows.reduce((s, r) => s + Number(r.credit_cents), 0),
    };
  }
);
for (const shape of monthlyShapes) {
  require_(
    shape.debitCents === shape.creditCents,
    `${shape.monthStart} batch does not balance: DR ${shape.debitCents} vs CR ${shape.creditCents}`
  );
}

if (failures.length > 0) {
  console.error("Derivation gates failed:\n  " + failures.join("\n  "));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Render the outputs
// ---------------------------------------------------------------------------
outputRows.sort((a, b) => Number(a.stage_sequence) - Number(b.stage_sequence));
const outputCsv = writeCsv(OUT_HEADER, outputRows);
const outputHash = sha256(outputCsv);

/** @param {string} value */
const sqlLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

function renderAnchorMigration() {
  const rows = anchorAccounts.map((code) => {
    const cents = anchorCents[code];
    let note;
    if (code === CASH_ACCOUNT) {
      note =
        "Legacy Jan-Jun 2026 opening. The GTDB section prints 65,705.40 dated " +
        "2026-06-30 (its close, the only C/FWD in either workbook not dated " +
        "2026-01-01); G1 proved from all six Trial Balance scans that it also " +
        "carries 10,710.00 of unbanked counter cash at 1 January. Anchored at " +
        "the evidenced 76,415.40, which is what makes the opening set balance " +
        "to exactly zero.";
    } else if (cents !== 0) {
      note = "Legacy Jan-Jun 2026 opening from the hash-validated ledger export";
    } else {
      note = "Zero opening fence for active Jan-Jun 2026 legacy account";
    }
    return { code, cents, note };
  });

  const values = rows
    .map((r) => `  (${sqlLiteral(r.code)}, ${(r.cents / 100).toFixed(2)}, ${sqlLiteral(r.note)})`)
    .join(",\n");

  return `-- Green Target Phase G4 - 2026-01-01 opening anchors (handover decision R4).
--
-- GENERATED FILE - do not hand-edit.
--   node dev/import/greentarget-legacy/build-import-staging.mjs
--   node dev/import/greentarget-legacy/build-import-staging.mjs --check-only
--
-- ${anchorAccounts.length} anchors, one per legacy ledger section, summing to EXACTLY 0.00.
-- Unlike Tien Hock, which shipped a named RM1,456,480.37 opening residue, Green
-- Target's opening set balances with no residue at all once CD_SD carries its
-- evidenced 76,415.40 (see that row's note).
--
-- DEBTOR and BTFS deliberately get NO anchor. DEBTOR is a control parent whose
-- 28 children carry the balances; BTFS is the one account the six Trial Balance
-- scans print with DEBIT and CREDIT genuinely BLANK rather than .00, and the
-- report engines only surface accounts with an anchor or a posted line - so its
-- absence here is precisely what reproduces that printing (G3 decision 4).
--
-- Anchor semantics (R4): a row at as_of_date <= a report period start seeds the
-- balance and everything before it is ignored. Never a synthetic opening journal.

\\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regclass('greentarget.account_opening_balances') IS NULL THEN
    RAISE EXCEPTION 'greentarget.account_opening_balances is missing - apply the G2 foundation migration first';
  END IF;

  IF (SELECT COUNT(*) FROM greentarget.account_codes) <> 503 THEN
    RAISE EXCEPTION 'greentarget.account_codes holds % rows, expected the 503-account G3 chart',
      (SELECT COUNT(*) FROM greentarget.account_codes);
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.account_opening_balances
     WHERE as_of_date <> DATE '2026-01-01'
  ) THEN
    RAISE EXCEPTION 'greentarget.account_opening_balances already holds an anchor outside 2026-01-01';
  END IF;
END
$guard$;

CREATE TEMP TABLE gt_desired_anchors (
  account_code varchar(50) PRIMARY KEY,
  amount       numeric(15,2) NOT NULL,
  notes        text NOT NULL
) ON COMMIT DROP;

INSERT INTO gt_desired_anchors (account_code, amount, notes) VALUES
${values};

DO $preflight$
DECLARE
  v_count bigint;
  v_cents bigint;
  v_missing text;
BEGIN
  SELECT COUNT(*), SUM(ROUND(amount * 100))::bigint INTO v_count, v_cents
    FROM gt_desired_anchors;

  IF (v_count, v_cents) IS DISTINCT FROM (${anchorAccounts.length}::bigint, 0::bigint) THEN
    RAISE EXCEPTION 'The generated anchor set is % rows summing to % cents, expected ${anchorAccounts.length} summing to 0',
      v_count, v_cents;
  END IF;

  SELECT string_agg(desired.account_code, ', ' ORDER BY desired.account_code)
    INTO v_missing
    FROM gt_desired_anchors desired
    LEFT JOIN greentarget.account_codes accounts
      ON accounts.code = desired.account_code
   WHERE accounts.code IS NULL OR accounts.is_active IS DISTINCT FROM true;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Anchor accounts missing or inactive in the G3 chart: %', v_missing;
  END IF;

  IF EXISTS (SELECT 1 FROM gt_desired_anchors WHERE account_code IN ('DEBTOR', 'BTFS')) THEN
    RAISE EXCEPTION 'DEBTOR or BTFS reached the generated anchor set';
  END IF;

  -- When staging is loaded, the anchors must agree with it account for account.
  IF (SELECT COUNT(*) FROM greentarget.import_legacy_rows) > 0
     AND EXISTS (
       WITH staged AS (
         SELECT account_code, SUM(running_balance_cents)::bigint AS cents
           FROM greentarget.import_legacy_rows
          WHERE record_kind = 'opening'
          GROUP BY account_code
       )
       SELECT 1
         FROM staged
         FULL JOIN gt_desired_anchors desired USING (account_code)
        WHERE staged.cents IS DISTINCT FROM ROUND(desired.amount * 100)::bigint
     ) THEN
    RAISE EXCEPTION 'The generated anchors disagree with the loaded staging opening set';
  END IF;
END
$preflight$;

INSERT INTO greentarget.account_opening_balances (
  account_code, as_of_date, amount, notes, created_by
)
SELECT desired.account_code, DATE '2026-01-01', desired.amount, desired.notes,
       'legacy-import'
  FROM gt_desired_anchors desired
ON CONFLICT (account_code, as_of_date) DO UPDATE
   SET amount     = EXCLUDED.amount,
       notes      = EXCLUDED.notes,
       created_by = EXCLUDED.created_by,
       updated_at = CURRENT_TIMESTAMP
 WHERE (greentarget.account_opening_balances.amount,
        greentarget.account_opening_balances.notes,
        greentarget.account_opening_balances.created_by)
   IS DISTINCT FROM
       (EXCLUDED.amount, EXCLUDED.notes, EXCLUDED.created_by);

DO $verify$
DECLARE
  v_count bigint;
  v_cents bigint;
  v_th_accounts bigint;
  v_th_journals bigint;
BEGIN
  SELECT COUNT(*), SUM(ROUND(amount * 100))::bigint INTO v_count, v_cents
    FROM greentarget.account_opening_balances;

  IF (v_count, v_cents) IS DISTINCT FROM (${anchorAccounts.length}::bigint, 0::bigint) THEN
    RAISE EXCEPTION 'After insert the anchor set is % rows summing to % cents', v_count, v_cents;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM gt_desired_anchors desired
      FULL JOIN greentarget.account_opening_balances actual
        ON actual.account_code = desired.account_code
       AND actual.as_of_date = DATE '2026-01-01'
     WHERE actual.account_code IS NULL
        OR desired.account_code IS NULL
        OR actual.amount IS DISTINCT FROM desired.amount
        OR actual.notes  IS DISTINCT FROM desired.notes
  ) THEN
    RAISE EXCEPTION 'A persisted anchor differs from the generated set';
  END IF;

  IF (SELECT ROUND(amount * 100)::bigint
        FROM greentarget.account_opening_balances
       WHERE account_code = '${CASH_ACCOUNT}') <> ${CASH_OPENING_CENTS} THEN
    RAISE EXCEPTION '${CASH_ACCOUNT} is not anchored at the evidenced ${(CASH_OPENING_CENTS / 100).toFixed(2)}';
  END IF;

  SELECT (SELECT COUNT(*) FROM public.account_codes),
         (SELECT COUNT(*) FROM public.journal_entries)
    INTO v_th_accounts, v_th_journals;
  IF (v_th_accounts, v_th_journals) IS DISTINCT FROM (2825::bigint, 8188::bigint) THEN
    RAISE EXCEPTION 'Tien Hock moved: account_codes %, journal_entries %', v_th_accounts, v_th_journals;
  END IF;

  RAISE NOTICE 'G4 anchors OK: % rows at 2026-01-01 summing to 0.00', v_count;
END
$verify$;

COMMIT;
`;
}

const anchorSql = renderAnchorMigration();

const report = {
  generatedBy: "dev/import/greentarget-legacy/build-import-staging.mjs",
  phase: "G4",
  sourceStaging: { filename: path.basename(SOURCE_CSV), sha256: sourceHash, rows: sourceRows.length },
  importStaging: {
    filename: path.basename(OUT_CSV),
    sha256: outputHash,
    byteLength: Buffer.byteLength(outputCsv),
    rows: outputRows.length,
    openingRows: outputRows.filter((r) => r.record_kind === "opening").length,
    transactionRows: outputRows.filter((r) => r.record_kind === "transaction").length,
    derivedRows: outputRows.filter((r) => r.source_kind === "DERIVED").length,
  },
  derivation: {
    rule:
      "One CD_SD line per unbalanced (entry_date, journal_ref) group, for that " +
      "group's own imbalance. No RV group is mixed, so the amount is forced.",
    approvedBy: "user, 26 Jul 2026",
    legs: derivedLegs.length,
    debitCents: derivedDebit,
    creditCents: derivedCredit,
    netCents: derivedDebit - derivedCredit,
    byFamily: familyBreakdown,
    openingCorrectionCents: CASH_OPENING_CORRECTION_CENTS,
    cashAccount: CASH_ACCOUNT,
    cashAccountOpeningCents: CASH_OPENING_CENTS,
  },
  journalGroups: {
    total: groups.size,
    balancedInSource: groups.size - derivedLegs.length,
    derivedInG4: derivedLegs.length,
    refDateCollisionsMerged: 4,
    collisionNote:
      "The 4 (ref, date) collisions are one invoice printed on two rows - same " +
      "reference, same date, same revenue account, identical particulars. R3's " +
      "merge is confirmed (user, 26 Jul 2026).",
  },
  monthlyShapes,
  monthEnds: monthEndReport,
  anchors: {
    accounts: anchorAccounts.length,
    sumCents: anchorSum,
    nonZero: Object.values(anchorCents).filter((v) => v !== 0).length,
    withoutAnchor: [...NO_ANCHOR],
    migration: path.relative(REPO, OUT_ANCHORS).split(path.sep).join("/"),
    migrationSha256: sha256(anchorSql),
  },
};

const reportJson = JSON.stringify(report, null, 2) + "\n";

if (CHECK_ONLY) {
  /** @param {string} file @param {string} expected @param {string} label */
  const compare = (file, expected, label) => {
    if (!fs.existsSync(file)) {
      failures.push(`${label} is missing: ${file}`);
      return;
    }
    if (fs.readFileSync(file, "utf8") !== expected) {
      failures.push(`${label} on disk no longer matches what the sources derive: ${file}`);
    }
  };
  compare(OUT_CSV, outputCsv, "import staging CSV");
  compare(OUT_ANCHORS, anchorSql, "opening-anchor migration");
  compare(OUT_REPORT, reportJson, "derivation report");

  if (failures.length > 0) {
    console.error("--check-only failed:\n  " + failures.join("\n  "));
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED (--check-only): every generated artifact is still derivable from the pinned sources.");
} else {
  fs.mkdirSync(GENERATED, { recursive: true });
  fs.writeFileSync(OUT_CSV, outputCsv);
  fs.writeFileSync(OUT_ANCHORS, anchorSql);
  fs.writeFileSync(OUT_REPORT, reportJson);
  console.log(`wrote ${path.relative(REPO, OUT_CSV)}      sha256 ${outputHash}`);
  console.log(`wrote ${path.relative(REPO, OUT_ANCHORS)}`);
  console.log(`wrote ${path.relative(REPO, OUT_REPORT)}`);
}

console.log("");
console.log(`source rows          ${sourceRows.length}`);
console.log(`derived legs         ${derivedLegs.length}  (DR ${(derivedDebit / 100).toFixed(2)} / CR ${(derivedCredit / 100).toFixed(2)})`);
console.log(`import staging rows  ${outputRows.length}`);
console.log(`opening anchors      ${anchorAccounts.length}, summing to ${anchorSum} cents`);
console.log(`${CASH_ACCOUNT} month-ends     ${monthEndReport.map((m) => (m.cashAccountCents / 100).toFixed(2)).join(" / ")}`);
console.log("all six month-end trial balances balance, and every printed control total is reproduced");

#!/usr/bin/env node
/**
 * Green Target Phase G3 - chart-of-accounts verifier.
 *
 * Written BEFORE the loader, on purpose. This is the authority on whether the
 * 503 immutable legacy account identities remain a faithful, complete subset
 * of `greentarget.account_codes`. Live post-cutover accounts are allowed beside
 * that subset and are excluded from evidence-derived population assertions.
 * `build-chart.mjs` only has to satisfy the legacy contract.
 *
 * The checks are PROPERTIES read out of the database and compared against the
 * two independently-validated sources, not a re-run of the generator's
 * derivation - so a bug in the generator cannot hide behind agreeing with
 * itself.
 *
 *   source A  dev/import/greentarget-legacy/generated/validation-report.json
 *             (G0: 502 section chains - code, description, opening, six
 *             month-ends, close. The ledger authority.)
 *   source B  dev/import/greentarget-report-fixtures/data/gt-tb-2026-{01..06}.csv
 *             (G1: the printed chart WITH the APPX note per account.)
 *   source C  dev/import/greentarget-report-fixtures/source-manifest.json
 *             (G1: the printed Income Statement / Balance Sheet expectations.)
 *
 * Usage:  node dev/import/greentarget-legacy/verify-chart.mjs
 * Exit 0 = ALL CHECKS PASSED. Exit 1 = at least one gate failed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const LEGACY = path.join(REPO, "dev", "import", "greentarget-legacy");
const FIXTURES = path.join(REPO, "dev", "import", "greentarget-report-fixtures");

const PERIODS = ["01", "02", "03", "04", "05", "06"];

/** Expected population, from the handover's confirmed arithmetic. */
const EXPECT = {
  tbAccountRows: 475, // 474 printed accounts + the netted DEBTOR control line
  gtldSections: 474, // 473 real + the excluded static DEBTOR snapshot
  gtdbSections: 28,
  chartRows: 503, // 473 real GTLD + BTFS + DEBTOR + 28 GTDB debtors
  notes: 34,
};

/** Seeds deliberately removed from the live chart after the G3 load. The
 *  historical payload (fixtures, G0 chains, staging, journals) still contains
 *  them - only the live account row and its zero opening fence were deleted,
 *  so the verifier treats their absence as approved, not corruption. */
const REMOVED_SEEDS = new Map([
  [
    "PBB1",
    "Removed 2026-07-30: dormant duplicate of PBB_1 (identical printed description, zero journal lines, single 0.00 opening fence). User-directed; dev/migrations/2026-07-30_greentarget_remove_pbb1.sql.",
  ],
]);

/** ledger_type rule (G3 decision 5) - keyed on the PRINTED APPX so it is
 *  stable regardless of how fs_note is interpreted. */
const BK_NOTE = "19"; // Cash At Bank
const TC_NOTE = "13"; // Trade Payable
const G3_CREATED_BY = "G3_CHART_LOAD";

/** The three accounts whose TB APPX disagrees with their statement placement.
 *  fs_note stores the APPX (1:1 with the legacy account master); the statement
 *  placement is recorded on the row so G5 cannot miss it. */
const APPX_STATEMENT_DIVERGENCES = {
  "INPUT.TAX": { appx: "10", statement: "BS note 17 (INPUT TAX)" },
  FC_TL: { appx: "11", statement: "IS note 23 (TERM LOAN)" },
  FC_HP: { appx: "16", statement: "IS 'HIRE PURCHASE INTEREST' - no note printed" },
};

let failures = 0;
let checks = 0;
const fail = (msg) => {
  failures++;
  console.log(`FAIL  ${msg}`);
};
const pass = (msg) => {
  checks++;
  console.log(`ok    ${msg}`);
};
const check = (cond, msg, detail = "") => (cond ? pass(msg) : fail(`${msg}${detail ? ` - ${detail}` : ""}`));

const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// CSV / helpers
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

/** Printed code -> ledger code. Space becomes underscore; see
 *  source-manifest.json accountCodeNormalization. NEVER applied to GTDB codes. */
const normalizePrinted = (code) => code.replace(/ /g, "_");

// ---------------------------------------------------------------------------
// Database access (CLAUDE.md rule 12)
// ---------------------------------------------------------------------------
const SEP = ""; // ASCII unit separator - cannot occur in the data

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
    .filter((l) => l.length > 0)
    .map((l) => {
      const parts = l.split(SEP);
      return Object.fromEntries(columns.map((c, i) => [c, parts[i] ?? ""]));
    });
}

const scalar = (sql) => psql(sql).trim();

// ---------------------------------------------------------------------------
// Load the sources
// ---------------------------------------------------------------------------
const report = JSON.parse(
  fs.readFileSync(path.join(LEGACY, "generated", "validation-report.json"), "utf8")
);
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, "source-manifest.json"), "utf8"));

const tbByPeriod = {};
for (const p of PERIODS) {
  const file = path.join(FIXTURES, "data", `gt-tb-2026-${p}.csv`);
  if (!fs.existsSync(file)) {
    console.error(`Missing fixture ${file}. Run G1 first.`);
    process.exit(1);
  }
  tbByPeriod[p] = parseCsv(fs.readFileSync(file, "utf8")).filter((r) => r.record_type === "account");
}

const sections = new Map(report.perSectionChains.map((s) => [s.code, s]));
const gtld = report.perSectionChains.filter((s) => s.sourceKind === "GTLD");
const gtdb = report.perSectionChains.filter((s) => s.sourceKind === "GTDB");

console.log("Green Target G3 - chart of accounts verification\n");
console.log(
  `sources: ${report.perSectionChains.length} ledger sections (${gtld.length} GTLD / ${gtdb.length} GTDB), ` +
    `${tbByPeriod["06"].length} printed TB rows\n`
);

// ---------------------------------------------------------------------------
// 0. Source sanity - the sources themselves are what G0/G1 said they were
// ---------------------------------------------------------------------------
console.log("-- 0. source sanity ------------------------------------------------");
check(gtld.length === EXPECT.gtldSections, `G0 has ${EXPECT.gtldSections} GTLD sections`, `found ${gtld.length}`);
check(gtdb.length === EXPECT.gtdbSections, `G0 has ${EXPECT.gtdbSections} GTDB sections`, `found ${gtdb.length}`);
check(
  tbByPeriod["06"].length === EXPECT.tbAccountRows,
  `June TB has ${EXPECT.tbAccountRows} account rows`,
  `found ${tbByPeriod["06"].length}`
);

// APPX, description and print order must be identical across all six months,
// otherwise there is no single "the chart" to load.
{
  const drift = [];
  const first = tbByPeriod["01"];
  for (const p of PERIODS.slice(1)) {
    const cur = tbByPeriod[p];
    if (cur.length !== first.length) {
      drift.push(`${p}: ${cur.length} rows vs ${first.length}`);
      continue;
    }
    for (let i = 0; i < cur.length; i++) {
      if (cur[i].acc_code !== first[i].acc_code) drift.push(`${p} row ${i + 1}: code ${cur[i].acc_code} vs ${first[i].acc_code}`);
      else if (cur[i].appx !== first[i].appx) drift.push(`${p} ${cur[i].acc_code}: APPX ${cur[i].appx} vs ${first[i].appx}`);
      else if (cur[i].particular !== first[i].particular)
        drift.push(`${p} ${cur[i].acc_code}: description drift`);
    }
  }
  check(drift.length === 0, "printed code/description/APPX/order identical across all six TBs", drift.slice(0, 5).join("; "));
}

// GTDB codes must not collide with GTLD codes - the chart is one flat namespace.
{
  const ldCodes = new Set(gtld.map((s) => s.code));
  const collisions = gtdb.filter((s) => ldCodes.has(s.code)).map((s) => s.code);
  check(collisions.length === 0, "no GTDB code collides with a GTLD code", collisions.join(", "));
}

// ---------------------------------------------------------------------------
// Build the EXPECTED chart directly from the sources (property, not derivation:
// this restates what the printed page and the ledger say, in one place, so the
// comparisons below are against evidence rather than against build-chart.mjs).
// ---------------------------------------------------------------------------
/** @type {Map<string, {code:string, description:string, fsNote:string|null, sortOrder:number, level:number, parent:string|null, ledgerType:string, source:string}>} */
const expected = new Map();

for (let i = 0; i < tbByPeriod["06"].length; i++) {
  const r = tbByPeriod["06"][i];
  const code = normalizePrinted(r.acc_code);
  const ledgerType = code === "DEBTOR" ? "TD" : r.appx === BK_NOTE ? "BK" : r.appx === TC_NOTE ? "TC" : "GL";
  expected.set(code, {
    code,
    description: r.particular,
    fsNote: r.appx,
    sortOrder: i + 1,
    level: 1,
    parent: null,
    ledgerType,
    source: code === "DEBTOR" ? "tb-control" : sections.has(code) ? "gtld" : "tb-only",
  });
}
gtdb.forEach((s, i) => {
  expected.set(s.code, {
    code: s.code,
    description: s.description,
    fsNote: "22",
    sortOrder: 1000 + i + 1,
    level: 2,
    parent: "DEBTOR",
    ledgerType: "TD",
    source: "gtdb",
  });
});

check(
  expected.size === EXPECT.chartRows,
  `expected chart is ${EXPECT.chartRows} accounts`,
  `built ${expected.size}`
);

// ---------------------------------------------------------------------------
// 1. Coverage - all 503 legacy identities are a required subset
// ---------------------------------------------------------------------------
console.log("\n-- 1. coverage -----------------------------------------------------");
const dbRows = query(
  `SELECT code, description, ledger_type, COALESCE(parent_code,''), level, sort_order,
          COALESCE(fs_note,''), is_active, is_system, COALESCE(notes,''),
          COALESCE(created_by,''), COALESCE(updated_by,'')
     FROM greentarget.account_codes ORDER BY code`,
  [
    "code",
    "description",
    "ledger_type",
    "parent_code",
    "level",
    "sort_order",
    "fs_note",
    "is_active",
    "is_system",
    "notes",
    "created_by",
    "updated_by",
  ]
);
const db = new Map(dbRows.map((r) => [r.code, r]));
const legacyDbRows = dbRows.filter((row) => expected.has(row.code));
const isUntouchedSeed = (row) =>
  row.created_by === G3_CREATED_BY && row.updated_by === G3_CREATED_BY;

check(
  db.size >= EXPECT.chartRows - REMOVED_SEEDS.size,
  `database holds at least the ${EXPECT.chartRows - REMOVED_SEEDS.size} required legacy accounts (${REMOVED_SEEDS.size} approved removal(s))`,
  `found ${db.size}`
);

{
  const missing = [...expected.keys()].filter((c) => !db.has(c) && !REMOVED_SEEDS.has(c));
  const extra = [...db.keys()].filter((c) => !expected.has(c));
  check(missing.length === 0, "every source account exists in the chart", missing.slice(0, 10).join(", "));
  check(
    dbRows.length === db.size,
    `every live account code is unique; ${extra.length} post-cutover account(s) coexist with the legacy subset`
  );

  const wrongOwner = legacyDbRows.filter((row) => row.created_by !== G3_CREATED_BY);
  check(
    wrongOwner.length === 0,
    "all 503 legacy identities retain their G3_CHART_LOAD creation provenance",
    wrongOwner.slice(0, 10).map((row) => `${row.code}:${row.created_by || "(blank)"}`).join(", ")
  );
}

// Every one of the 474 printed TB accounts resolves to a chart row.
{
  const unresolved = tbByPeriod["06"]
    .map((r) => normalizePrinted(r.acc_code))
    .filter((c) => !db.has(c) && !REMOVED_SEEDS.has(c));
  check(unresolved.length === 0, "all 474 printed TB accounts + DEBTOR resolve", unresolved.join(", "));
}

// Every non-excluded GTLD ledger section has a chart row (the import needs one).
{
  const orphan = gtld.filter((s) => !s.excluded && !db.has(s.code) && !REMOVED_SEEDS.has(s.code)).map((s) => s.code);
  check(orphan.length === 0, "every non-excluded GTLD ledger section has a chart row", orphan.join(", "));
}
// Every GTDB debtor section has a chart row (G4 journal lines FK to these).
{
  const orphan = gtdb.filter((s) => !db.has(s.code)).map((s) => s.code);
  check(orphan.length === 0, "all 28 GTDB debtor sections have a chart row", orphan.join(", "));
}

// ---------------------------------------------------------------------------
// 2. Field fidelity - code, description, note, order, hierarchy, ledger_type
// ---------------------------------------------------------------------------
console.log("\n-- 2. field fidelity -----------------------------------------------");
{
  const bad = { description: [], fsNote: [], sortOrder: [], level: [], parent: [], ledgerType: [], inactive: [] };
  const overridden = [];
  for (const [code, e] of expected) {
    const a = db.get(code);
    if (!a) continue;
    if (!isUntouchedSeed(a)) {
      overridden.push(a);
      continue;
    }
    if (a.description !== e.description) bad.description.push(`${code}: "${a.description}" vs "${e.description}"`);
    if (a.fs_note !== e.fsNote) bad.fsNote.push(`${code}: ${a.fs_note} vs ${e.fsNote}`);
    if (Number(a.sort_order) !== e.sortOrder) bad.sortOrder.push(`${code}: ${a.sort_order} vs ${e.sortOrder}`);
    if (Number(a.level) !== e.level) bad.level.push(`${code}: ${a.level} vs ${e.level}`);
    if ((a.parent_code || null) !== e.parent) bad.parent.push(`${code}: ${a.parent_code || "null"} vs ${e.parent || "null"}`);
    if (a.ledger_type !== e.ledgerType) bad.ledgerType.push(`${code}: ${a.ledger_type} vs ${e.ledgerType}`);
    if (a.is_active !== "t") bad.inactive.push(code);
  }
  check(bad.description.length === 0, "untouched seed descriptions match the printed evidence verbatim", bad.description.slice(0, 5).join("; "));
  check(bad.fsNote.length === 0, "untouched seed fs_note values equal the printed APPX (debtors: 22)", bad.fsNote.slice(0, 5).join("; "));
  check(bad.sortOrder.length === 0, "untouched seed sort_order values reproduce the printed order", bad.sortOrder.slice(0, 5).join("; "));
  check(bad.level.length === 0, "untouched seed levels are 1 for the GL chart and 2 for debtor children", bad.level.slice(0, 5).join("; "));
  check(bad.parent.length === 0, "untouched seed parent values match the evidence-derived hierarchy", bad.parent.slice(0, 5).join("; "));
  check(bad.ledgerType.length === 0, "untouched seed ledger types follow the GTDB/APPX-19/APPX-13 rule", bad.ledgerType.slice(0, 5).join("; "));
  check(bad.inactive.length === 0, "every untouched seed account remains active", bad.inactive.slice(0, 5).join(", "));

  const malformedOverrides = overridden.filter(
    (row) =>
      row.updated_by === "" ||
      row.description.trim() === "" ||
      row.fs_note === "" ||
      row.sort_order === "" ||
      !Number.isFinite(Number(row.sort_order))
  );
  check(
    malformedOverrides.length === 0,
    `${overridden.length} intentional seed override(s) are preserved and structurally complete`,
    malformedOverrides.slice(0, 10).map((row) => row.code).join(", ")
  );
}

// The three named traps.
{
  const pbb1 = db.get("PBB1");
  const pbb_1 = db.get("PBB_1");
  // PBB1 was deliberately removed from the live chart on 2026-07-30 (see
  // REMOVED_SEEDS). If it is ever re-created, the original duplicate-identity
  // assertion applies again.
  check(
    !!pbb_1 &&
      (!pbb1 ||
        !isUntouchedSeed(pbb1) ||
        !isUntouchedSeed(pbb_1) ||
        (pbb1.description === pbb_1.description && pbb1.description === "PBB-A/C:3137836814 (BW)")),
    "trap 2: PBB_1 survives; PBB1 is an approved removal (or, if re-created, keeps the evidenced duplicate identity)"
  );
  const genuineSpace = ["AE ENTERPRISE", "LEE DECOR", "RUMAH MERAH", "SUN TARGET"];
  const kept = genuineSpace.filter((c) => db.has(c));
  check(kept.length === 4, "trap 1: the 4 GTDB codes with genuine spaces are stored unchanged", `kept ${kept.join(", ")}`);
  check(db.has("CD_SD"), "trap 1: CD_SD keeps its genuine underscore");
  const spaced = [...expected.keys()].filter((c) => c.includes(" ") && db.has(c));
  check(
    spaced.length === 4 && spaced.every((c) => genuineSpace.includes(c)),
    "trap 1: no printed-with-a-space GTLD code leaked a space into the chart",
    spaced.join(", ")
  );
  // trap 3: descriptions are NOT unique - prove the loader keyed on code.
  const byDesc = new Map();
  for (const row of expected.values()) {
    byDesc.set(row.description, (byDesc.get(row.description) || 0) + 1);
  }
  const shared = [...byDesc.values()].filter((n) => n > 1).length;
  check(
    shared > 0 && legacyDbRows.length === EXPECT.chartRows - REMOVED_SEEDS.size,
    `trap 3: ${shared} legacy descriptions are shared by >1 code and no seed identity was deduped`
  );
}

// ---------------------------------------------------------------------------
// 3. Notes - no account leaks out of the statements
// ---------------------------------------------------------------------------
console.log("\n-- 3. note integrity -----------------------------------------------");
{
  const ledgerTypeRows = query(
    `SELECT code, is_active FROM greentarget.ledger_types ORDER BY code`,
    ["code", "is_active"]
  );
  const activeLedgerTypes = new Set(
    ledgerTypeRows.filter((row) => row.is_active === "t").map((row) => row.code)
  );
  const invalidLedgerTypes = dbRows.filter(
    (row) => !activeLedgerTypes.has(row.ledger_type)
  );
  check(
    invalidLedgerTypes.length === 0,
    "every live account uses an ACTIVE GT ledger type",
    invalidLedgerTypes.map((row) => `${row.code}->${row.ledger_type}`).join(", ")
  );

  const blankDescriptions = dbRows.filter((row) => row.description.trim() === "");
  check(
    blankDescriptions.length === 0,
    "every live account has a non-empty description",
    blankDescriptions.map((row) => row.code).join(", ")
  );

  const noteRows = query(
    `SELECT code, is_active, report_section, statement_block FROM greentarget.financial_statement_notes ORDER BY code`,
    ["code", "is_active", "report_section", "statement_block"]
  );
  check(noteRows.length === EXPECT.notes, `note catalogue still holds ${EXPECT.notes} notes`, `found ${noteRows.length}`);
  const activeNotes = new Set(noteRows.filter((n) => n.is_active === "t").map((n) => n.code));

  const nullNote = dbRows.filter((r) => r.fs_note === "");
  check(nullNote.length === 0, "no account has a NULL fs_note", nullNote.map((r) => r.code).join(", "));

  const inactiveNote = dbRows.filter((r) => r.fs_note && !activeNotes.has(r.fs_note));
  check(inactiveNote.length === 0, "every account reaches an ACTIVE note", inactiveNote.map((r) => `${r.code}->${r.fs_note}`).join(", "));

  // The FK guarantees resolution; assert it is actually still there.
  const fk = scalar(
    `SELECT count(*) FROM information_schema.table_constraints
      WHERE constraint_schema='greentarget' AND table_name='account_codes'
        AND constraint_type='FOREIGN KEY' AND constraint_name='account_codes_fs_note_fkey'`
  );
  check(fk === "1", "the fs_note FOREIGN KEY is still in place (it was not dropped to force the load through)");

  // Statement-only notes: 17 and 23 legitimately carry zero accounts under the
  // APPX reading. Assert that is still exactly the set, so a future drift is loud.
  const used = new Set([...expected.values()].map((row) => row.fsNote));
  const unused = noteRows.map((n) => n.code).filter((c) => !used.has(c));
  check(
    unused.length === 2 && unused.includes("17") && unused.includes("23"),
    "exactly notes 17 and 23 are statement-only (no accounts) - the documented consequence of the APPX reading",
    `unused = ${unused.join(", ")}`
  );
}

// The three APPX-vs-statement divergences must be recorded on the row itself.
{
  const bad = [];
  for (const [code, d] of Object.entries(APPX_STATEMENT_DIVERGENCES)) {
    const r = db.get(code);
    if (!r) bad.push(`${code} missing`);
    else if (isUntouchedSeed(r) && r.fs_note !== d.appx) bad.push(`${code} fs_note ${r.fs_note} != APPX ${d.appx}`);
    else if (isUntouchedSeed(r) && !/statement/i.test(r.notes)) bad.push(`${code} has no statement-divergence note`);
  }
  check(bad.length === 0, "all 3 untouched APPX-vs-statement divergences carry their evidence on the account row", bad.join("; "));

  // They are dormant TODAY, which is why the choice is arithmetically free.
  // If this ever fails, G5's note->line mapping is no longer optional.
  const live = Object.keys(APPX_STATEMENT_DIVERGENCES).filter((c) => {
    const s = sections.get(c);
    return s && (s.openingCents !== 0 || s.closingCents !== 0 || s.transactionRows !== 0);
  });
  check(live.length === 0, "the 3 divergent accounts are .00 in all six months with 0 ledger rows", live.join(", "));
}

// ---------------------------------------------------------------------------
// 4. Hierarchy
// ---------------------------------------------------------------------------
console.log("\n-- 4. hierarchy ----------------------------------------------------");
{
  const hier = query(
    `SELECT code, depth, path FROM greentarget.account_codes_hierarchy ORDER BY code`,
    ["code", "depth", "path"]
  );
  check(
    hier.length === db.size,
    `the hierarchy VIEW surfaces all ${db.size} live accounts, including the ${EXPECT.chartRows} legacy identities`,
    `found ${hier.length}`
  );
  const expectedChildren = gtdb.map((s) => s.code).sort();
  const evidenceChildren = [...expected.values()]
    .filter((row) => row.parent === "DEBTOR")
    .map((row) => row.code)
    .sort();
  check(evidenceChildren.length === 28, "the immutable source payload retains all 28 legacy debtor children", `found ${evidenceChildren.length}`);
  check(
    JSON.stringify(evidenceChildren) === JSON.stringify(expectedChildren),
    "the source payload's debtor children are exactly the 28 GTDB debtor codes"
  );
  const orphans = query(
    `SELECT code FROM greentarget.account_codes ac
      WHERE parent_code IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM greentarget.account_codes p WHERE p.code = ac.parent_code)`,
    ["code"]
  );
  check(orphans.length === 0, "no account points at a missing parent", orphans.map((r) => r.code).join(", "));
  const debtorRow = db.get("DEBTOR");
  check(
    debtorRow &&
      debtorRow.is_system === "t" &&
      debtorRow.ledger_type === "TD" &&
      debtorRow.fs_note === "22" &&
      debtorRow.parent_code === "",
    "DEBTOR remains the protected system TD/22 control account"
  );
}

// ---------------------------------------------------------------------------
// 5. THE HEADLINE GATE - group the June closes by the immutable evidence-
//    derived fs_note and reproduce every printed statement line. Live fs_note
//    is intentionally editable after cutover, so the historical proof must use
//    the source payload rather than treating an approved override as corruption.
// ---------------------------------------------------------------------------
console.log("\n-- 5. printed-statement reconciliation (June 2026) -----------------");
{
  /** note -> { close, ytdMove, accounts[] } using the legacy payload fs_note. */
  const groups = new Map();
  let missingChain = [];
  for (const [code, evidence] of expected) {
    if (code === "DEBTOR" || code === "BTFS") continue; // no ledger movement by design
    if (REMOVED_SEEDS.has(code)) continue; // approved removal - its G0 section chain stays in the historical payload
    const s = sections.get(code);
    if (!s) {
      missingChain.push(code);
      continue;
    }
    const g = groups.get(evidence.fsNote) || { close: 0, move: 0, accounts: [] };
    g.close += s.closingCents;
    g.move += s.closingCents - s.openingCents;
    g.accounts.push(code);
    groups.set(evidence.fsNote, g);
  }
  check(missingChain.length === 0, "every legacy payload account except DEBTOR/BTFS has a ledger chain", missingChain.join(", "));

  const CREDIT_PRESENTED = new Set(["13", "1", "10", "16", "11", "21", "20", "12"]);
  const IS_CREDIT_NOTES = new Set(["7", "18-2", "18-3"]);

  // --- Income Statement (year to date, Jan-Jun 2026)
  let isFails = 0;
  for (const line of manifest.printedIncomeStatementExpectations.lines) {
    if (!line.note) continue;
    const g = groups.get(line.note);
    const raw = g ? g.move : 0;
    const derived = IS_CREDIT_NOTES.has(line.note) ? -raw : raw;
    if (derived !== line.amountCents) {
      isFails++;
      fail(
        `IS note ${line.note} "${line.key}": printed ${money(line.amountCents)} but the chart derives ` +
          `${money(derived)} from the legacy payload (residual ${money(derived - line.amountCents)}; ${g ? g.accounts.length : 0} accounts)`
      );
    }
  }
  check(isFails === 0, "every printed Income Statement line reproduces from the immutable legacy fs_note grouping");

  // --- Balance Sheet (30 June 2026). Note 22 = the GL note-22 accounts plus
  //     the 28 debtor children, which is exactly how the printed control works.
  let bsFails = 0;
  for (const line of manifest.printedBalanceSheetExpectations.lines) {
    if (!line.note || line.note === "DN") continue;
    const g = groups.get(line.note);
    const raw = g ? g.close : 0;
    const derived = CREDIT_PRESENTED.has(line.note) ? -raw : raw;
    if (derived !== line.amountCents) {
      bsFails++;
      fail(
        `BS note ${line.note} "${line.key}": printed ${money(line.amountCents)} but the chart derives ` +
          `${money(derived)} from the legacy payload (residual ${money(derived - line.amountCents)}; ${g ? g.accounts.length : 0} accounts)`
      );
    }
  }
  check(bsFails === 0, "every printed Balance Sheet line reproduces from the immutable legacy fs_note grouping");

  // --- Trade receivable, spelled out: the debtor children ARE note 22.
  const n22 = groups.get("22");
  check(
    n22 && n22.close === manifest.printedBalanceSheetExpectations.lines.find((l) => l.key === "TRADE RECEIVABLE").amountCents,
    `note 22 closes at the printed trade receivable 156,782.22`,
    n22 ? money(n22.close) : "no accounts"
  );

  // --- The printed DEBTOR control line, all six months.
  for (let m = 0; m < 6; m++) {
    const sum = gtdb.reduce((a, s) => a + s.monthEndCents[m], 0);
    const printed = manifest.printedTrialBalanceExpectations.periods[m].debtorControlCents;
    // Jan-May carry the unbanked counter cash that G1 proved sits inside CD_SD;
    // G0 staged CD_SD verbatim, so the difference is the known, named cash gap.
    const gap = printed - sum;
    const expectedGap = report.cashInHandGap.impliedMonthEndCents[m].cashInHandCents;
    check(
      gap === expectedGap,
      `2026-${PERIODS[m]} debtor children sum to the printed control less the named CD_SD cash gap`,
      `gap ${money(gap)} vs expected ${money(expectedGap)}`
    );
  }
}

// ---------------------------------------------------------------------------
// 6. The immutable G4 import stays pinned; organic growth and TH are isolated
// ---------------------------------------------------------------------------
console.log("\n-- 6. phase boundaries ---------------------------------------------");
{
  // Updated by G4 (27 Jul 2026). These four gates used to assert the tables
  // were EMPTY, which was the G3 boundary. G4 filled them, so the gate is now
  // the exact G4 legacy subset - still four gates, still a loud failure if
  // anything posts into or disappears from the imported evidence. Organic
  // journals are deliberately outside the first two counts.
  const je = scalar("SELECT count(*) FROM greentarget.journal_entries WHERE source_type = 'legacy_import'");
  const jel = scalar(`SELECT count(*) FROM greentarget.journal_entry_lines jel
    JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
   WHERE je.source_type = 'legacy_import'`);
  const aob = scalar(
    "SELECT count(*) FROM greentarget.account_opening_balances WHERE as_of_date = DATE '2026-01-01'"
  );
  const ilr = scalar("SELECT count(*) FROM greentarget.import_legacy_rows");
  check(je === "1705", "greentarget.journal_entries holds the 1,705 G4 legacy journals", `found ${je}`);
  check(jel === "4401", "greentarget.journal_entry_lines holds the 4,401 G4 lines", `found ${jel}`);
  check(
    aob === "500",
    "greentarget.account_opening_balances holds the 500 G4 anchors at 2026-01-01 after the approved PBB1 zero-fence removal",
    `found ${aob}`
  );
  check(ilr === "4903", "greentarget.import_legacy_rows holds the 4,903 G4 staging rows", `found ${ilr}`);

  // public.account_codes grows with ordinary Tien Hock keying (debtorSync adds
  // a DEBTOR child per new customer), so this is a floor, not an equality.
  const thAc = Number(scalar("SELECT count(*) FROM public.account_codes"));
  const thNotes = scalar("SELECT count(*) FROM public.financial_statement_notes");
  check(
    thAc >= 2827,
    "public.account_codes never shrinks below the 2,827 G8 floor",
    `found ${thAc}`
  );
  check(thNotes === "33", "public.financial_statement_notes unmoved at 33", `found ${thNotes}`);
  // TH's ledger is live and grows with ordinary Tien Hock keying, so this is a
  // floor, not an equality (see verify-import.mjs section 6).
  const thJe = Number(scalar("SELECT count(*) FROM public.journal_entries"));
  check(
    thJe >= 8238,
    "public.journal_entries never shrinks below the 8,238 G8 floor",
    `found ${thJe}`
  );

  // BTFS: carried as a chart entry with NO ledger movement. G4 must give it no
  // opening anchor - that absence is what reproduces its blank/blank printing,
  // because the report engines only surface accounts with an anchor or a line.
  const btfs = db.get("BTFS");
  check(
    btfs &&
      (!isUntouchedSeed(btfs) ||
        (btfs.is_active === "t" && btfs.fs_note === "2-10" && /blank/i.test(btfs.notes))),
    "untouched BTFS retains APPX 2-10 and its blank-balance evidence; an intentional override is preserved"
  );
  check(!sections.has("BTFS"), "BTFS still has no G0 ledger section (the reason it prints blank, not .00)");
}

// ---------------------------------------------------------------------------
console.log("");
if (failures === 0) {
  console.log(`ALL CHECKS PASSED  (${checks} gates)`);
  process.exit(0);
}
console.log(`${failures} CHECK(S) FAILED  (${checks} passed)`);
process.exit(1);

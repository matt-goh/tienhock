#!/usr/bin/env node
/**
 * Green Target Phase G3 - chart-of-accounts generator.
 *
 * The GT chart is DERIVED, never hand-typed: 473 codes, their descriptions,
 * their printed APPX notes and their printed order are already machine-readable
 * in two independently-validated sources, and a typed chart could not be
 * re-verified against them. Re-run this script and diff its output to prove the
 * migration is still exactly what the sources say.
 *
 *   node dev/import/greentarget-legacy/build-chart.mjs
 *   node dev/import/greentarget-legacy/build-chart.mjs --check-only
 *
 * Outputs (both deterministic - a rerun is byte-identical):
 *   generated/gt-chart-of-accounts.csv                       (gitignored)
 *   dev/migrations/2026-07-26_greentarget_chart_of_accounts.sql   (tracked)
 *
 * Then prove it with:  node dev/import/greentarget-legacy/verify-chart.mjs
 *
 * ---------------------------------------------------------------------------
 * THE FOUR G3 DECISIONS THIS SCRIPT ENCODES (see handover section 9, G3)
 *
 * 1. fs_note = the printed Trial Balance APPX, VERBATIM, for all 474 printed
 *    accounts. The legacy system's per-account note field IS the APPX - the TB
 *    prints it straight from the account master, while the BS/IS line notes are
 *    a separate statement layout (proved by the IS printing "HIRE PURCHASE
 *    INTEREST" with no note at all). Storing the APPX keeps account_codes 1:1
 *    with the legacy account master and reproduces all seven printed reports
 *    with zero exceptions. The three accounts whose statement placement differs
 *    (INPUT.TAX, FC TL, FC HP) carry that fact in `notes`; G5's note->line
 *    mapping MUST NOT assume APPX = statement note.
 * 2. DEBTOR is a real is_system TD/22 control account and the 28 GTDB debtors
 *    are its parent_code children - the only hierarchy GT's chart has.
 * 3. The 28 debtor children are created HERE, from the GTDB ledger sections
 *    (R6: from the ledger, never from greentarget.customers), so G4 is purely
 *    about journals and its journal lines have accounts to point at.
 * 4. BTFS is carried as an ordinary active account under its printed APPX 2-10
 *    with no ledger movement. G4 must give it NO opening anchor: the report
 *    engines only surface accounts that have an anchor or a posted line, so
 *    that absence is exactly what reproduces its blank/blank printing.
 *
 * ledger_type rule, keyed on the printed APPX so it is stable under any reading
 * of fs_note:  GTDB section -> TD (+ DEBTOR) | APPX 19 -> BK | APPX 13 -> TC |
 * everything else -> GL. CS/OS stay seeded but unused (R5: GT has no stock).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const FIXTURES = path.join(REPO, "dev", "import", "greentarget-report-fixtures");
const GENERATED = path.join(HERE, "generated");
const MIGRATION = path.join(REPO, "dev", "migrations", "2026-07-26_greentarget_chart_of_accounts.sql");

const CHECK_ONLY = process.argv.includes("--check-only");
const PERIODS = ["01", "02", "03", "04", "05", "06"];
const BK_NOTE = "19";
const TC_NOTE = "13";
const DEBTOR_NOTE = "22";
const CREATED_BY = "G3_CHART_LOAD";

const die = (msg) => {
  console.error(`ABORT: ${msg}`);
  process.exit(1);
};

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

const normalizePrinted = (code) => code.replace(/ /g, "_");
const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
const report = JSON.parse(fs.readFileSync(path.join(GENERATED, "validation-report.json"), "utf8"));
const tb = {};
for (const p of PERIODS) {
  tb[p] = parseCsv(fs.readFileSync(path.join(FIXTURES, "data", `gt-tb-2026-${p}.csv`), "utf8")).filter(
    (r) => r.record_type === "account"
  );
}

const sections = new Map(report.perSectionChains.map((s) => [s.code, s]));
const gtld = report.perSectionChains.filter((s) => s.sourceKind === "GTLD");
const gtdb = report.perSectionChains.filter((s) => s.sourceKind === "GTDB");

// --- source gates: refuse to generate anything from a source that drifted ----
if (gtld.length !== 474) die(`expected 474 GTLD sections, got ${gtld.length}`);
if (gtdb.length !== 28) die(`expected 28 GTDB sections, got ${gtdb.length}`);
if (tb["06"].length !== 475) die(`expected 475 June TB account rows, got ${tb["06"].length}`);
for (const p of PERIODS.slice(1)) {
  if (tb[p].length !== tb["01"].length) die(`TB 2026-${p} has ${tb[p].length} rows, 2026-01 has ${tb["01"].length}`);
  for (let i = 0; i < tb[p].length; i++) {
    const a = tb["01"][i];
    const b = tb[p][i];
    if (a.acc_code !== b.acc_code || a.appx !== b.appx || a.particular !== b.particular) {
      die(`printed chart drifts at row ${i + 1}: 2026-01 ${a.acc_code}/${a.appx} vs 2026-${p} ${b.acc_code}/${b.appx}`);
    }
  }
}
{
  const ld = new Set(gtld.map((s) => s.code));
  const clash = gtdb.filter((s) => ld.has(s.code)).map((s) => s.code);
  if (clash.length) die(`GTDB/GTLD code collision - the flat namespace assumption is broken: ${clash.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Per-account provenance notes. Only the accounts that genuinely need one.
// ---------------------------------------------------------------------------
const ACCOUNT_NOTES = {
  "INPUT.TAX":
    "fs_note holds the printed Trial Balance APPX 10 (Other Creditors), which is the legacy account master's own note field. " +
    "The June 2026 Balance Sheet prints this account on its own CURRENT ASSET line \"INPUT TAX\" under note 17. " +
    "G5's note->line mapping must not assume APPX = statement note. .00 in all six months, 0 ledger transaction rows.",
  FC_TL:
    "fs_note holds the printed Trial Balance APPX 11 (Term Loans), which is the legacy account master's own note field. " +
    "The June 2026 Income Statement prints this expense on \"TERM LOAN\" under note 23, inside LESS:FINANCE COSTS. " +
    "G5's note->line mapping must not assume APPX = statement note. .00 in all six months, 0 ledger transaction rows.",
  FC_HP:
    "fs_note holds the printed Trial Balance APPX 16 (Hire Purchase Payable), which is the legacy account master's own note field. " +
    "The June 2026 Income Statement prints this expense on \"HIRE PURCHASE INTEREST\" with NO note number at all - GT's note 23 is " +
    "Term Loan (TH's 23 is Hire Purchase Interest), so the GT catalogue has no code for this line. " +
    "G5's note->line mapping must place it in finance costs explicitly. .00 in all six months, 0 ledger transaction rows.",
  BTFS:
    "Printed on all six Trial Balances (APPX 2-10, immediately after BTJCB) with DEBIT and CREDIT genuinely blank - not '.00' " +
    "like every other zero-balance row, and the only account printed that way anywhere in the six TBs. It has NO GTLD ledger " +
    "section (confirmed by grep against the raw staging CSV in G1), so it is a 2026 chart entry that was never exercised. " +
    "G4 must give it NO opening anchor and no journal line: the report engines only surface accounts with an anchor or a posted " +
    "line, so that absence is exactly what reproduces the blank/blank printing.",
  DEBTOR:
    "Netted trade-debtor control line, printed as the LAST row of every Trial Balance (APPX 22) after WS SBR, outside the " +
    "alphabetical chart. Its own GTLD ledger section is a stale 2026-06-30 snapshot and was excluded in G0; the real balances " +
    "live in the 28 GTDB debtor children that hang off this account. Carries no journal line and no opening anchor of its own.",
  CD_SD:
    "GTDB debtor section printing only a static 2026-06-30 C/FWD of 65,705.40 with no transaction detail. G1 proved its true " +
    "2026-01-01 opening is 76,415.40 (65,705.40 + the 10,710.00 unbanked counter-sale cash that the printed DEBTOR control " +
    "carries), month-end path 85,915.40 / 72,895.40 / 69,377.40 / 71,955.40 / 66,445.40 / 65,705.40. G4 anchors it at " +
    "76,415.40 and derives its movement rows; CH_REV2 is genuinely dormant and is NOT the answer.",
  ADD:
    "Allowance for doubtful debts. Carries APPX 22 like the DEBTOR control but is a GL contra account, NOT a member of the " +
    "debtor subledger - it stays ledger_type GL and outside DEBTOR's children so it can never distort the debtor control.",
};

// ---------------------------------------------------------------------------
// Derive the chart
// ---------------------------------------------------------------------------
/** @type {{code:string,description:string,ledgerType:string,parent:string|null,level:number,sortOrder:number,isSystem:boolean,fsNote:string,notes:string|null,origin:string}[]} */
const chart = [];

tb["06"].forEach((r, i) => {
  const code = normalizePrinted(r.acc_code);
  const isDebtorControl = code === "DEBTOR";
  chart.push({
    code,
    description: r.particular,
    ledgerType: isDebtorControl ? "TD" : r.appx === BK_NOTE ? "BK" : r.appx === TC_NOTE ? "TC" : "GL",
    parent: null,
    level: 1,
    sortOrder: i + 1, // the printed order, 1..475
    isSystem: isDebtorControl,
    fsNote: r.appx,
    notes: ACCOUNT_NOTES[code] ?? null,
    origin: isDebtorControl ? "tb-control" : sections.has(code) ? "gtld-ledger" : "tb-only",
  });
});

gtdb.forEach((s, i) => {
  chart.push({
    code: s.code, // GTDB codes are stored EXACTLY as the ledger holds them
    description: s.description,
    ledgerType: "TD",
    parent: "DEBTOR",
    level: 2,
    sortOrder: 1000 + i + 1,
    isSystem: false,
    fsNote: DEBTOR_NOTE,
    notes: ACCOUNT_NOTES[s.code] ?? null,
    origin: "gtdb-ledger",
  });
});

// --- payload gates -----------------------------------------------------------
if (chart.length !== 503) die(`expected 503 chart rows, derived ${chart.length}`);
{
  const seen = new Set();
  const dup = chart.filter((r) => (seen.has(r.code) ? true : (seen.add(r.code), false)));
  if (dup.length) die(`duplicate code(s) in the derived chart: ${dup.map((r) => r.code).join(", ")}`);
}
{
  // Trap 1: only the four genuine GTDB codes may contain a space.
  const GENUINE = new Set(["AE ENTERPRISE", "LEE DECOR", "RUMAH MERAH", "SUN TARGET"]);
  const spaced = chart.filter((r) => r.code.includes(" ")).map((r) => r.code);
  if (spaced.length !== 4 || !spaced.every((c) => GENUINE.has(c))) {
    die(`space-in-code rule violated - expected exactly the 4 genuine GTDB codes, got: ${spaced.join(", ")}`);
  }
  // Trap 2: PBB1 and PBB_1 are two different accounts and must both survive.
  for (const c of ["PBB1", "PBB_1"]) if (!chart.some((r) => r.code === c)) die(`trap 2: ${c} is missing`);
  // Every non-excluded GTLD section must have a row; every GTDB section too.
  const codes = new Set(chart.map((r) => r.code));
  const missingLd = gtld.filter((s) => !s.excluded && !codes.has(s.code)).map((s) => s.code);
  if (missingLd.length) die(`GTLD sections with no chart row: ${missingLd.join(", ")}`);
  const missingDb = gtdb.filter((s) => !codes.has(s.code)).map((s) => s.code);
  if (missingDb.length) die(`GTDB sections with no chart row: ${missingDb.join(", ")}`);
  // Every parent must exist in the payload.
  const orphan = chart.filter((r) => r.parent && !codes.has(r.parent)).map((r) => r.code);
  if (orphan.length) die(`rows pointing at a missing parent: ${orphan.join(", ")}`);
}

const byType = chart.reduce((a, r) => ((a[r.ledgerType] = (a[r.ledgerType] || 0) + 1), a), {});
const byNote = chart.reduce((a, r) => ((a[r.fsNote] = (a[r.fsNote] || 0) + 1), a), {});

// ---------------------------------------------------------------------------
// Output 1 - the reviewable CSV
// ---------------------------------------------------------------------------
const csvEscape = (v) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv =
  "code,description,ledger_type,parent_code,level,sort_order,is_system,fs_note,origin,notes\n" +
  chart
    .map((r) =>
      [r.code, r.description, r.ledgerType, r.parent, r.level, r.sortOrder, r.isSystem, r.fsNote, r.origin, r.notes]
        .map(csvEscape)
        .join(",")
    )
    .join("\n") +
  "\n";

// ---------------------------------------------------------------------------
// Output 2 - the migration
// ---------------------------------------------------------------------------
const values = chart
  .map(
    (r) =>
      `  (${q(r.code)}, ${q(r.description)}, ${q(r.ledgerType)}, ${r.parent ? q(r.parent) : "NULL"}, ` +
      `${r.level}, ${r.sortOrder}, ${r.isSystem ? "TRUE" : "FALSE"}, ${q(r.fsNote)}, ${r.notes ? q(r.notes) : "NULL"})`
  )
  .join(",\n");

const sql = `-- ============================================================================
-- Green Target chart of accounts - Phase G3
-- Doc: docs/Account/GT_ACCOUNTING_HANDOVER.md (section 9, G3)
--
-- GENERATED FILE - DO NOT EDIT BY HAND.
--   Regenerate: node dev/import/greentarget-legacy/build-chart.mjs
--   Verify:     node dev/import/greentarget-legacy/verify-chart.mjs
-- The 503 rows below are derived from two independently-validated sources:
--   * dev/import/greentarget-report-fixtures/data/gt-tb-2026-{01..06}.csv
--     (G1: the printed chart with each account's APPX note; identical across
--     all six months, 2,838 exact balance comparisons against the ledger)
--   * dev/import/greentarget-legacy/generated/validation-report.json
--     (G0: 502 ledger section chains, 502/502 balance chains walked)
-- A hand-typed chart could not be re-verified against them; this one can.
--
-- WHAT THIS MIGRATION LOADS
--   503 accounts = 473 real GTLD ledger accounts
--                + BTFS   (printed on all six TBs, no ledger section)
--                + DEBTOR (the netted trade-debtor control line)
--                + 28 GTDB debtor children hanging off DEBTOR
--
-- WHAT IT DOES NOT DO
--   * NO journals, NO journal lines, NO opening anchors - that is G4, and this
--     migration never writes or rewrites those later-phase tables.
--   * It touches NO \`public\` table. GT accounting data is completely isolated
--     from Tien Hock's, and the tail asserts the TH baseline is unmoved.
--
-- THE FOUR DECISIONS ENCODED HERE (full reasoning in the handover, section 9)
--   1. fs_note = the printed Trial Balance APPX, verbatim. The legacy system's
--      per-account note field IS the APPX; the Balance Sheet / Income Statement
--      line notes are a separate statement layout (proved by the IS printing
--      "HIRE PURCHASE INTEREST" with no note at all). This keeps account_codes
--      1:1 with the legacy account master. Consequence, deliberate and
--      documented: notes 17 and 23 carry zero accounts, and the three accounts
--      whose statement placement differs from their APPX - INPUT.TAX, FC TL,
--      FC HP, all .00 in all six months with 0 ledger rows - record that fact
--      in \`notes\`. G5's note->line mapping MUST NOT assume APPX = statement note.
--   2. DEBTOR is a real is_system TD/22 control account; the 28 GTDB debtors are
--      its parent_code children. That is the only hierarchy GT's chart has, and
--      greentarget.account_codes_hierarchy (a VIEW) surfaces it directly.
--   3. The 28 debtor children are created here, from the GTDB ledger sections
--      (R6: from the ledger, never from greentarget.customers), so G4's journal
--      lines have accounts to FK to and G4 is purely about journals.
--   4. BTFS is carried active under its printed APPX 2-10 with no ledger
--      movement. G4 must give it NO opening anchor - the report engines only
--      surface accounts with an anchor or a posted line, so that absence is
--      what reproduces its blank/blank printing.
--
--   ledger_type rule, keyed on the printed APPX so it is stable under any
--   reading of fs_note:
--      GTDB section -> TD (+ DEBTOR) | APPX 19 -> BK | APPX 13 -> TC | else GL
--   CS/OS remain seeded but unused (R5: GT is a service company, no stock).
--   Distribution: ${Object.entries(byType)
    .sort()
    .map(([k, v]) => `${k} ${v}`)
    .join(" / ")}.
--
-- IDEMPOTENCY
--   The 503 evidence-derived codes are a REQUIRED LEGACY SUBSET, not the
--   forever-size of the live chart. ON CONFLICT DO NOTHING preserves every
--   existing row byte-for-byte, including user-managed descriptions, mapping,
--   hierarchy, status and notes. A rerun inserts only a missing legacy code;
--   it never updates, deletes or renames an account and it ignores legitimate
--   post-cutover accounts outside this payload.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guards - assert the world is what we think it is, abort otherwise
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_notes INT;
BEGIN
  IF to_regclass('greentarget.account_codes') IS NULL
     OR to_regclass('greentarget.financial_statement_notes') IS NULL
     OR to_regclass('greentarget.ledger_types') IS NULL THEN
    RAISE EXCEPTION 'G3 guard: the G2 foundation is missing - run 2026-07-26_greentarget_accounting_foundation.sql first';
  END IF;

  SELECT count(*) INTO v_notes FROM greentarget.financial_statement_notes;
  IF v_notes <> 34 THEN
    RAISE EXCEPTION 'G3 guard: expected the 34-note G2 catalogue, found %', v_notes;
  END IF;

  -- The fs_note FOREIGN KEY is the whole point of G2's divergence from TH: an
  -- account whose APPX does not resolve must abort the load, loudly.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_schema = 'greentarget' AND table_name = 'account_codes'
       AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'account_codes_fs_note_fkey'
  ) THEN
    RAISE EXCEPTION 'G3 guard: greentarget.account_codes.fs_note has no FOREIGN KEY - refusing to load a chart that cannot fail loudly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'greentarget' AND table_name = 'account_codes_hierarchy' AND table_type = 'VIEW'
  ) THEN
    RAISE EXCEPTION 'G3 guard: greentarget.account_codes_hierarchy is not a VIEW';
  END IF;
END $$;

-- Snapshot the TH baseline so the tail of this migration can prove it never moved.
CREATE TEMP TABLE g3_th_baseline ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.account_codes)             AS account_codes,
       (SELECT count(*) FROM public.journal_entries)           AS journal_entries,
       (SELECT count(*) FROM public.journal_entry_lines)       AS journal_entry_lines,
       (SELECT count(*) FROM public.financial_statement_notes) AS fs_notes,
       (SELECT count(*) FROM public.account_opening_balances)  AS opening_balances;

-- ---------------------------------------------------------------------------
-- 1. The derived chart, staged so the payload can be checked before it lands
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE g3_chart (
  code        VARCHAR(50)  NOT NULL,
  description VARCHAR(255) NOT NULL,
  ledger_type VARCHAR(10)  NOT NULL,
  parent_code VARCHAR(50),
  level       INT          NOT NULL,
  sort_order  INT          NOT NULL,
  is_system   BOOLEAN      NOT NULL,
  fs_note     VARCHAR(10)  NOT NULL,
  notes       TEXT
) ON COMMIT DROP;

INSERT INTO g3_chart (code, description, ledger_type, parent_code, level, sort_order, is_system, fs_note, notes) VALUES
${values};

-- ---------------------------------------------------------------------------
-- 2. Payload gates - fail before writing, not after
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows INT; v_codes INT; v_bad TEXT;
BEGIN
  SELECT count(*), count(DISTINCT code) INTO v_rows, v_codes FROM g3_chart;
  IF v_rows <> 503 THEN
    RAISE EXCEPTION 'G3 payload: expected 503 accounts, staged %', v_rows;
  END IF;
  IF v_codes <> v_rows THEN
    RAISE EXCEPTION 'G3 payload: % duplicate code(s) staged - descriptions are NOT unique in this chart, everything must be keyed on code', v_rows - v_codes;
  END IF;

  SELECT string_agg(code || '->' || fs_note, ', ') INTO v_bad
    FROM g3_chart c
   WHERE NOT EXISTS (
     SELECT 1 FROM greentarget.financial_statement_notes n
      WHERE n.code = c.fs_note AND n.is_active = TRUE);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 payload: account(s) whose note does not resolve to an ACTIVE GT note: %', v_bad;
  END IF;

  SELECT string_agg(code || '->' || ledger_type, ', ') INTO v_bad
    FROM g3_chart c
   WHERE NOT EXISTS (SELECT 1 FROM greentarget.ledger_types t WHERE t.code = c.ledger_type);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 payload: unknown ledger_type(s): %', v_bad;
  END IF;

  SELECT string_agg(code, ', ') INTO v_bad
    FROM g3_chart c
   WHERE c.parent_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM g3_chart p WHERE p.code = c.parent_code);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 payload: account(s) pointing at a parent that is not in the payload: %', v_bad;
  END IF;

END $$;

-- ---------------------------------------------------------------------------
-- 3. Load. ORDER BY level so DEBTOR exists before its 28 children FK to it.
-- ---------------------------------------------------------------------------
INSERT INTO greentarget.account_codes
  (code, description, ledger_type, parent_code, level, sort_order,
   is_active, is_system, notes, fs_note, created_by, updated_by)
SELECT code, description, ledger_type, parent_code, level, sort_order,
       TRUE, is_system, notes, fs_note, ${q(CREATED_BY)}, ${q(CREATED_BY)}
  FROM g3_chart
 ORDER BY level, sort_order
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Verify - assert the loaded chart, then assert Tien Hock never moved
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INT; v_td INT; v_bk INT; v_tc INT; v_gl INT;
  v_children INT; v_hier INT; v_unused INT; v_bad TEXT;
  v_th g3_th_baseline%ROWTYPE;
BEGIN
  SELECT count(*) INTO v_total FROM greentarget.account_codes;

  -- Account codes are immutable. All 503 evidence-derived identities must be
  -- present, while their user-managed fields and any extra live accounts are
  -- deliberately outside this rerun's ownership.
  SELECT string_agg(c.code, ', ' ORDER BY c.code) INTO v_bad
    FROM g3_chart c
    LEFT JOIN greentarget.account_codes a ON a.code = c.code
   WHERE a.code IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 verify: required legacy account code(s) are missing: %', left(v_bad, 400);
  END IF;

  SELECT string_agg(c.code, ', ' ORDER BY c.code) INTO v_bad
    FROM g3_chart c
    JOIN greentarget.account_codes a ON a.code = c.code
   WHERE a.created_by IS DISTINCT FROM ${q(CREATED_BY)};
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 verify: legacy account code(s) lost G3_CHART_LOAD creation provenance: %', left(v_bad, 400);
  END IF;

  -- Rows that still carry the untouched G3 marker must remain byte-faithful
  -- to the payload. A real UI/API edit changes updated_by and is deliberately
  -- preserved by ON CONFLICT DO NOTHING instead of reaching this gate.
  SELECT string_agg(c.code, ', ' ORDER BY c.code) INTO v_bad
    FROM g3_chart c
    JOIN greentarget.account_codes a ON a.code = c.code
   WHERE a.created_by = ${q(CREATED_BY)}
     AND a.updated_by = ${q(CREATED_BY)}
     AND (a.description, a.ledger_type, a.parent_code, a.level, a.sort_order,
          a.is_active, a.is_system, a.notes, a.fs_note)
         IS DISTINCT FROM
         (c.description, c.ledger_type, c.parent_code, c.level, c.sort_order,
          TRUE, c.is_system, c.notes, c.fs_note);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'G3 verify: untouched legacy account row(s) differ from the evidence payload: %', left(v_bad, 400);
  END IF;

  SELECT count(*) FILTER (WHERE ledger_type = 'TD'),
         count(*) FILTER (WHERE ledger_type = 'BK'),
         count(*) FILTER (WHERE ledger_type = 'TC'),
         count(*) FILTER (WHERE ledger_type = 'GL')
    INTO v_td, v_bk, v_tc, v_gl
    FROM g3_chart;
  IF v_td <> 29 OR v_bk <> 5 OR v_tc <> 29 OR v_gl <> 440 THEN
    RAISE EXCEPTION 'G3 verify: ledger_type distribution is TD % / BK % / TC % / GL %, expected 29 / 5 / 29 / 440',
      v_td, v_bk, v_tc, v_gl;
  END IF;

  -- Exactly notes 17 and 23 are statement-only. This is the DOCUMENTED
  -- consequence of the evidence-derived payload. Live accounts may later use
  -- either note, so this gate is intentionally scoped to g3_chart.
  SELECT count(*) INTO v_unused
    FROM greentarget.financial_statement_notes n
   WHERE NOT EXISTS (SELECT 1 FROM g3_chart a WHERE a.fs_note = n.code);
  IF v_unused <> 2
     OR EXISTS (SELECT 1 FROM g3_chart WHERE fs_note IN ('17','23')) THEN
    RAISE EXCEPTION 'G3 verify: expected exactly notes 17 and 23 to carry zero accounts, found % noteless note(s)', v_unused;
  END IF;

  -- The evidence payload contains the DEBTOR control and its 28 children.
  -- The live hierarchy may also contain manually approved post-cutover rows.
  SELECT count(*) INTO v_children FROM g3_chart WHERE parent_code = 'DEBTOR';
  IF v_children <> 28 THEN
    RAISE EXCEPTION 'G3 verify: DEBTOR must have exactly 28 children, found %', v_children;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM g3_chart
                  WHERE code = 'DEBTOR' AND ledger_type = 'TD' AND fs_note = '22'
                    AND is_system = TRUE AND parent_code IS NULL) THEN
    RAISE EXCEPTION 'G3 verify: DEBTOR must be a root is_system TD/22 control account';
  END IF;
  -- ADD carries APPX 22 too but is a GL contra account, never a debtor child.
  IF NOT EXISTS (SELECT 1 FROM g3_chart
                  WHERE code = 'ADD' AND ledger_type = 'GL' AND parent_code IS NULL) THEN
    RAISE EXCEPTION 'G3 verify: ADD must stay a flat GL account, outside the debtor subledger';
  END IF;

  -- The named traps.
  IF NOT EXISTS (SELECT 1 FROM g3_chart WHERE code = 'PBB1')
     OR NOT EXISTS (SELECT 1 FROM g3_chart WHERE code = 'PBB_1') THEN
    RAISE EXCEPTION 'G3 verify: PBB1 and PBB_1 are two different accounts with the identical description - both must exist';
  END IF;
  SELECT string_agg(code, ', ' ORDER BY code) INTO v_bad FROM g3_chart WHERE code LIKE '% %';
  IF v_bad IS DISTINCT FROM 'AE ENTERPRISE, LEE DECOR, RUMAH MERAH, SUN TARGET' THEN
    RAISE EXCEPTION 'G3 verify: only the 4 genuine GTDB codes may contain a space, found: %', COALESCE(v_bad, '(none)');
  END IF;

  -- The hierarchy VIEW must surface the whole live chart, including extras.
  SELECT count(*) INTO v_hier FROM greentarget.account_codes_hierarchy;
  IF v_hier <> v_total THEN
    RAISE EXCEPTION 'G3 verify: the hierarchy view surfaces % of % live accounts', v_hier, v_total;
  END IF;

  -- ZERO IMPACT ON TIEN HOCK.
  SELECT * INTO v_th FROM g3_th_baseline;
  IF (SELECT count(*) FROM public.account_codes)             <> v_th.account_codes
  OR (SELECT count(*) FROM public.journal_entries)           <> v_th.journal_entries
  OR (SELECT count(*) FROM public.journal_entry_lines)       <> v_th.journal_entry_lines
  OR (SELECT count(*) FROM public.financial_statement_notes) <> v_th.fs_notes
  OR (SELECT count(*) FROM public.account_opening_balances)  <> v_th.opening_balances THEN
    RAISE EXCEPTION 'G3 verify: a public/Tien Hock accounting table changed - aborting';
  END IF;

  RAISE NOTICE 'G3 OK: all 503 legacy identities are present inside % live GT accounts; evidence payload TD % / BK % / TC % / GL %, DEBTOR + % legacy children; % surfaced by the hierarchy view; existing rows preserved; TH tables unchanged.',
    v_total, v_td, v_bk, v_tc, v_gl, v_children, v_hier;
END $$;

COMMIT;
`;

// ---------------------------------------------------------------------------
if (CHECK_ONLY) {
  const csvOk = fs.existsSync(path.join(GENERATED, "gt-chart-of-accounts.csv"))
    ? sha(fs.readFileSync(path.join(GENERATED, "gt-chart-of-accounts.csv"), "utf8")) === sha(csv)
    : false;
  const sqlOk = fs.existsSync(MIGRATION) ? sha(fs.readFileSync(MIGRATION, "utf8")) === sha(sql) : false;
  console.log(`csv on disk matches derivation: ${csvOk}`);
  console.log(`migration on disk matches derivation: ${sqlOk}`);
  process.exit(csvOk && sqlOk ? 0 : 1);
}

fs.mkdirSync(GENERATED, { recursive: true });
fs.writeFileSync(path.join(GENERATED, "gt-chart-of-accounts.csv"), csv);
fs.writeFileSync(MIGRATION, sql);

console.log("Green Target G3 - chart of accounts generated\n");
console.log(`  accounts        ${chart.length}  (473 GTLD + BTFS + DEBTOR + 28 GTDB debtors)`);
console.log(
  `  ledger_type     ${Object.entries(byType)
    .sort()
    .map(([k, v]) => `${k} ${v}`)
    .join("  ")}`
);
console.log(`  distinct notes  ${Object.keys(byNote).length} of 34 (17 and 23 are statement-only by design)`);
console.log(`  per-account provenance notes  ${chart.filter((r) => r.notes).length}`);
console.log(`\n  generated/gt-chart-of-accounts.csv  sha256 ${sha(csv)}`);
console.log(`  ${path.relative(REPO, MIGRATION).replace(/\\/g, "/")}  sha256 ${sha(sql)}`);
console.log(`\nNext: apply the migration, then node dev/import/greentarget-legacy/verify-chart.mjs`);

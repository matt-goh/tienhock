// Phase V1 + V2 harness — machine-compares the transcribed legacy report fixtures
// against the dev DB (docs/Account/LEGACY_REPORT_VERIFICATION_PLAN.md §5).
// Read-only: every DB access is a SELECT through docker exec psql.
//
//   node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs [stage...]
//
// Stages (default: all implemented stages, in order):
//   map   V1 step 1 — printed TB code -> ERP account code mapping
//         (normalization -> account_codes exact -> import alias table ->
//         named exception list). Writes generated/account-map.json.
//   tb    V1 step 2 / V2 final state — scanned TB balance vs ERP derived balance per account
//         per month-end (report semantics: latest anchor <= period end +
//         posted movement from the anchor date, TD children collapsed into
//         DEBTOR). Classifies exact / constant offset / non-constant offset,
//         hard-gates 880/880 exact accounts plus the 2 named GP-202604-0001
//         drift rows (LGP, TP — the genuine April invoice keyed 20 Jul 2026,
//         after the scans), the DEBTOR controls, and the balanced V2 January
//         opening-anchor state.
//         Writes generated/tb-comparison.json.
//   tdl   V1 step 3 — scanned Trade Debtor List vs each ERP debtor-child
//         ledger at 31 May. Proves BAL B/F, May debits/credits, TOTAL DUE and
//         the independent 1 June anchors; compares the legacy aging buckets
//         with the current Debtors-report calendar-month rules.
//         Writes generated/tdl-comparison.json.
//   statements
//         V1 step 4 / V2 final state — scanned May BS / IS / CoGM note lines
//         vs the three
//         financial-report engines, reproduced query-for-query. Attributes
//         with the exact 1 January opening-stock semantics. Requires 28/40
//         exact lines plus 2 named GP-202604-0001 drift lines (BS note 13,
//         IS note 5); the remaining ten must be only the V3 closing-stock
//         lines and their profit/CoGM cross-totals.
//         Writes generated/statements-comparison.json.
//   regressions
//         V2 immutable-surface gates — the audited IMP accounting projection,
//         all 1,571 June checkpoints, and the frozen June five-ledger movement.
//         Writes generated/v2-regression.json.
//
// One green run keeps proving scan parity forever, like verify-import.sql
// did for the import.
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "data");
const genDir = path.join(here, "generated");

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`FAIL  ${msg}`);
};
const ok = (msg) => console.log(`ok    ${msg}`);
const note = (msg) => console.log(`note  ${msg}`);
const fmt = (c) => (c / 100).toLocaleString("en-MY", { minimumFractionDigits: 2 });

// Same strict CSV parser as validate-fixtures.mjs (quoted fields, doubled
// quotes, no embedded newlines).
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === "") continue;
    const fields = [];
    let cur = "", inQ = false, i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 2; continue; }
        if (ch === '"') { inQ = false; i++; continue; }
        cur += ch; i++;
      } else if (ch === '"') { inQ = true; i++; }
      else if (ch === ",") { fields.push(cur); cur = ""; i++; }
      else { cur += ch; i++; }
    }
    if (inQ) throw new Error(`Unterminated quote: ${line}`);
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}
const cents = (s, where) => {
  if (s === "" || s === undefined) return null;
  if (!/^-?\d+$/.test(s)) throw new Error(`Non-integer cents "${s}" at ${where}`);
  return parseInt(s, 10);
};

// Read-only SQL against the dev DB (CLAUDE.md rule 12). Returns array of
// objects keyed by the query's column names. VERIFY_DB overrides the database
// for rehearsals on throwaway clones (default: the dev `tienhock`).
const VERIFY_DB = process.env.VERIFY_DB || "tienhock";
function query(sql) {
  const out = execFileSync(
    "docker",
    ["exec", "-i", "tienhock_dev_db", "psql", "-U", "postgres", "-d", VERIFY_DB,
     "--csv", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const rows = parseCsv(out.trimEnd());
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// ---- Load TB fixtures ------------------------------------------------------
// month -> Map(printedCode -> { particular, appx, net (cents) })
const TB_MONTHS = ["01", "02", "03", "04", "05"];
function loadTbFixtures() {
  const byMonth = {};
  for (const mm of TB_MONTHS) {
    const file = path.join(dataDir, `tb_2026-${mm}.csv`);
    const rows = parseCsv(fs.readFileSync(file, "utf8"));
    const header = rows.shift().join(",");
    if (header !== "page,row_on_page,acc_code_printed,particular,appx,debit_cents,credit_cents")
      throw new Error(`tb_2026-${mm}: unexpected header ${header}`);
    const byCode = new Map();
    for (const r of rows) {
      const [page, rowOn, code, particular, appx, d, c] = r;
      const where = `tb_2026-${mm} p${page} r${rowOn} ${code}`;
      const net = (cents(d, where) ?? 0) - (cents(c, where) ?? 0);
      byCode.set(code, { particular, appx, net, page, rowOn });
    }
    byMonth[mm] = byCode;
  }
  return byMonth;
}

// ---- Load Trade Debtor List fixture ----------------------------------------
function loadTdlFixture() {
  const file = path.join(dataDir, "trade_debtor_list_2026-05-31.csv");
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const header = rows.shift().join(",");
  const expected = "page,row_on_page,account_no,particular,bal_bf_cents,current_cents,payment_cents,total_due_cents,age_current_cents,age_1m_cents,age_2m_cents,age_3m_plus_cents";
  if (header !== expected)
    throw new Error(`trade_debtor_list_2026-05-31: unexpected header ${header}`);

  const seen = new Set();
  const fixture = [];
  for (const r of rows) {
    const [page, rowOn, accountNo, particular, bf, current, payment, due,
      ageCurrent, age1m, age2m, age3mPlus] = r;
    const where = `tdl p${page} r${rowOn} ${accountNo}`;
    if (seen.has(accountNo)) fail(`${where}: duplicate account number`);
    seen.add(accountNo);
    const item = {
      accountNo,
      particular,
      page: parseInt(page, 10),
      rowOnPage: parseInt(rowOn, 10),
      balBfCents: cents(bf, where) ?? 0,
      currentCents: cents(current, where) ?? 0,
      paymentCents: cents(payment, where) ?? 0,
      totalDueCents: cents(due, where) ?? 0,
      ageCurrentCents: cents(ageCurrent, where) ?? 0,
      age1mCents: cents(age1m, where) ?? 0,
      age2mCents: cents(age2m, where) ?? 0,
      age3mPlusCents: cents(age3mPlus, where) ?? 0,
    };
    if (item.balBfCents + item.currentCents + item.paymentCents !== item.totalDueCents)
      fail(`${where}: BAL B/F + CURRENT + PAYMENT does not equal TOTAL DUE`);
    if (item.ageCurrentCents + item.age1mCents + item.age2mCents + item.age3mPlusCents !== item.totalDueCents)
      fail(`${where}: aging buckets do not equal TOTAL DUE`);
    fixture.push(item);
  }
  return fixture;
}

// Normalization rule (plan §1): trim, then internal whitespace -> underscore.
// No other transformation; no fuzzy matching (house rule).
const normalizeCode = (printed) => printed.trim().replace(/\s+/g, "_");

// ---- Mapping core (used by stages map and tb) -------------------------------
let mappingCache = null;
function computeMapping() {
  if (mappingCache) return mappingCache;
  const tb = loadTbFixtures();

  // The account set must be identical across all five months (V0 TB-c).
  const mayCodes = [...tb["05"].keys()].sort();
  for (const mm of TB_MONTHS) {
    const codes = [...tb[mm].keys()].sort();
    if (codes.length !== mayCodes.length || codes.some((c, i) => c !== mayCodes[i]))
      fail(`tb_2026-${mm}: account set differs from May`);
  }

  // ERP chart of accounts (all codes, active or not — inactive matches are
  // flagged, not hidden).
  const erpAccounts = new Map(
    query("SELECT code, description, ledger_type, is_active FROM account_codes")
      .map((r) => [r.code, r])
  );

  // Import alias table + scan exception list.
  const aliasFile = path.join(here, "..", "legacy-jan-may", "account-aliases.json");
  const aliases = new Map(
    JSON.parse(fs.readFileSync(aliasFile, "utf8")).aliases.map((a) => [a.sourceCode, a])
  );
  const exceptions = new Map(
    JSON.parse(fs.readFileSync(path.join(here, "scan-code-exceptions.json"), "utf8"))
      .exceptions.map((e) => [e.printedCode, e])
  );

  const mappings = [];
  const unmatched = [];
  const counts = { exact: 0, alias: 0, exception: 0, unmatched: 0 };

  for (const printed of mayCodes) {
    const normalized = normalizeCode(printed);
    const may = tb["05"].get(printed);
    // Nonzero anywhere Jan–May? (an unmatched all-zero code is a cosmetic
    // chart difference; an unmatched nonzero code is a finding — plan §5-1)
    const nets = TB_MONTHS.map((mm) => tb[mm].get(printed)?.net ?? 0);
    const everNonzero = nets.some((n) => n !== 0);

    let erpCode = null, method = null, reason = null;
    if (exceptions.has(printed)) {
      const e = exceptions.get(printed);
      erpCode = e.erpCode;
      method = `exception:${e.kind}`;
      reason = e.reason;
    } else if (erpAccounts.has(normalized)) {
      erpCode = normalized;
      method = "exact";
    } else if (aliases.has(normalized)) {
      const a = aliases.get(normalized);
      erpCode = a.targetCode;
      method = "alias";
      reason = a.reason;
      if (!erpAccounts.has(erpCode))
        fail(`alias target ${erpCode} (from ${printed}) not in account_codes`);
    }

    if (erpCode === null) {
      counts.unmatched++;
      unmatched.push({
        printed, normalized,
        particular: may.particular, appx: may.appx,
        everNonzero, netsCentsJanToMay: nets,
        mayPage: may.page, mayRow: may.rowOn,
      });
      continue;
    }

    const erp = erpCode === "DEBTOR" && !erpAccounts.has("DEBTOR")
      ? { ledger_type: "TD", is_active: "t", description: "synthetic TD control row" }
      : erpAccounts.get(erpCode);
    counts[method.startsWith("exception") ? "exception" : method]++;
    if (erp && erp.is_active === "f")
      note(`${printed} -> ${erpCode} is INACTIVE in account_codes`);
    mappings.push({
      printed, normalized, erpCode, method,
      ...(reason ? { reason } : {}),
      erpLedgerType: erp?.ledger_type ?? null,
      erpActive: erp ? erp.is_active === "t" : null,
      everNonzero,
    });
  }

  // No two printed codes may land on the same ERP code (double-count guard).
  const byTarget = new Map();
  for (const m of mappings) {
    if (byTarget.has(m.erpCode))
      fail(`ERP code ${m.erpCode} targeted by both "${byTarget.get(m.erpCode)}" and "${m.printed}"`);
    byTarget.set(m.erpCode, m.printed);
  }

  mappingCache = { tb, mayCodes, erpAccounts, mappings, unmatched, counts };
  return mappingCache;
}

// ---- Stage: map -------------------------------------------------------------
function stageMap() {
  console.log("\n=== stage map: printed TB codes -> ERP account codes ===");
  const { tb, mayCodes, erpAccounts, mappings, unmatched, counts } = computeMapping();
  if (failures === 0) ok(`account set identical across 5 months (${mayCodes.length} printed codes)`);
  ok(`loaded ${erpAccounts.size} ERP account codes`);
  if ([...new Set(mappings.map((m) => m.erpCode))].length === mappings.length)
    ok("no two printed codes map to the same ERP code");

  // Report
  console.log(`\nmapping: ${counts.exact} exact, ${counts.alias} alias, ${counts.exception} exception, ${counts.unmatched} unmatched of ${mayCodes.length}`);
  const findings = unmatched.filter((u) => u.everNonzero);
  const cosmetic = unmatched.filter((u) => !u.everNonzero);
  if (cosmetic.length)
    note(`${cosmetic.length} unmatched codes are zero in all five months (cosmetic chart differences)`);
  if (findings.length) {
    console.log(`\n${findings.length} unmatched codes with NONZERO balances (findings needing review):`);
    for (const u of findings)
      console.log(`  ${u.printed.padEnd(14)} appx ${String(u.appx).padEnd(5)} May ${fmt(u.netsCentsJanToMay[4]).padStart(14)}  "${u.particular}" (p${u.mayPage} r${u.mayRow})`);
  } else {
    ok("every nonzero printed code maps to an ERP account");
  }

  const outFile = path.join(genDir, "account-map.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    normalizationRule: "trim; internal whitespace -> underscore; exact match only",
    counts, mappings, unmatched,
  }, null, 2));
  ok(`wrote ${path.relative(process.cwd(), outFile)}`);
}

// ---- Stage: tb ---------------------------------------------------------------
// Scanned TB balance vs ERP derived balance, per account, per month-end.
// ERP derivation reproduces the trial-balance endpoint exactly
// (ANCHORED_ACCOUNT_BALANCES_CTES in src/routes/accounting/financial-reports.js):
// latest anchor <= period end, plus posted movement from the anchor date
// (else Jan 1) through period end; active accounts with an anchor or movement;
// all TD accounts collapsed into one DEBTOR row.
const MONTH_ENDS = { "01": "2026-01-31", "02": "2026-02-28", "03": "2026-03-31", "04": "2026-04-30", "05": "2026-05-31" };
// Printed DEBTOR controls (V0 finding: the control moves monthly).
const DEBTOR_CONTROLS_CENTS = { "01": 53453147, "02": 56171082, "03": 46679100, "04": 57866195, "05": 50769772 };
// Historical V1 evidence. V2 resolves this residue exactly; it is retained in
// generated output to keep the approved correction arithmetic auditable.
const PRE_V2_RESIDUE_CENTS = 145648037;
const V2_EXPECTED_TB_ACCOUNTS = 880;
// Approved post-scan business drift (user-confirmed genuine 20 Jul 2026):
// GP-202604-0001 (journal 11829), self-billed April purchase SB2026070025
// from SHANDONG STANDARD METAL PRODUCTS CO.,LTD, keyed in production on
// 20 Jul 2026 with entry_date 2026-04-30 — DR LGP / CR TP RM7,261.51 (the
// debit was OP until dev/migrations/2026-07-20_gp_op_to_lgp.sql). The May
// scans were exported before this invoice was keyed, so they can never
// contain it; every ±7,261.51 expectation shift below is this one document.
const GP_DRIFT_REFERENCE = "GP-202604-0001";
const GP_DRIFT_CENTS = 726151;
const GP_DRIFT_ATTRIBUTION =
  "Genuine April supplier invoice GP-202604-0001 (SB2026070025, Shandong " +
  "Standard Metal Products) keyed 20 Jul 2026, after the May scans were " +
  "exported: DR LGP / CR TP 7,261.51. User-confirmed genuine 20 Jul 2026.";
// Expected scan−ERP diffs per TB month (Jan..May) for the two touched accounts.
const GP_DRIFT_TB_PROFILE = {
  LGP: [0, 0, 0, -726151, -726151],
  TP: [0, 0, 0, 726151, 726151],
};
const V2_EXPECTED_JANUARY_ANCHORS = {
  total: 642,
  nonzero: 290,
  debitRows: 230,
  creditRows: 60,
  zero: 352,
  debitCents: 1318068118,
  creditCents: 1318068118,
  netCents: 0,
};
const V2_EXPECTED_CS_CODES = new Set([
  "CS_B21", "CS_B23", "CS_B24", "CS_B31", "CS_B32", "CS_B33",
  "CS_B34", "CS_B36", "CS_B37", "CS_B3UD", "CS_B5KG1", "CS_B600G",
  "CS_BBER1", "CS_BBER2", "CS_BBER4", "CS_BBER5", "CS_BJAG1",
  "CS_BLS1", "CS_BNL3", "CS_BNL5", "CS_BP1", "CS_BP2", "CS_BP600",
  "CS_BPB1", "CS_BPB2", "CS_BPT1", "CS_BSDM1", "CS_BTAP1",
  "CS_BTM1", "CS_BUP1", "CS_M2", "CS_M21", "CS_M25", "CS_M2UD",
  "CS_M31", "CS_M32", "CS_M33", "CS_M39", "CS_M3UD", "CS_M41",
  "CS_M42", "CS_M43", "CS_M45", "CS_M46", "CS_M47", "CS_M48",
  "CS_M49", "CS_M50", "CS_M51", "CS_M52", "CS_MGRM1", "CS_MK5",
  "CS_ML1", "CS_MM1", "CS_MM2", "CS_MNL1", "CS_MP1", "CS_MP2",
  "CS_MSOD1", "CS_MT1", "CS_MTAP1", "CS_MTEP1", "CS_MTEP3",
]);

let v2OpeningAnchorStateCache = null;

function verifyV2OpeningAnchorState() {
  if (v2OpeningAnchorStateCache !== null) return v2OpeningAnchorStateCache;

  const { tb, mappings } = computeMapping();
  const januaryRows = query(`
    SELECT account_code,
           ROUND(amount * 100)::bigint AS amount_cents
    FROM account_opening_balances
    WHERE as_of_date = DATE '2026-01-01'`);
  const januaryByCode = new Map(
    januaryRows.map((r) => [r.account_code, parseInt(r.amount_cents, 10)])
  );
  const summary = query(`
    SELECT COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE ROUND(amount * 100)::bigint <> 0)::bigint AS nonzero,
           COUNT(*) FILTER (WHERE ROUND(amount * 100)::bigint > 0)::bigint AS debit_rows,
           COUNT(*) FILTER (WHERE ROUND(amount * 100)::bigint < 0)::bigint AS credit_rows,
           COUNT(*) FILTER (WHERE ROUND(amount * 100)::bigint = 0)::bigint AS zero,
           COALESCE(SUM(ROUND(amount * 100)) FILTER (WHERE amount > 0), 0)::bigint AS debit_cents,
           COALESCE(-SUM(ROUND(amount * 100)) FILTER (WHERE amount < 0), 0)::bigint AS credit_cents,
           COALESCE(SUM(ROUND(amount * 100)), 0)::bigint AS net_cents
    FROM account_opening_balances
    WHERE as_of_date = DATE '2026-01-01'`)[0];
  const actualSummary = {
    total: parseInt(summary.total, 10),
    nonzero: parseInt(summary.nonzero, 10),
    debitRows: parseInt(summary.debit_rows, 10),
    creditRows: parseInt(summary.credit_rows, 10),
    zero: parseInt(summary.zero, 10),
    debitCents: parseInt(summary.debit_cents, 10),
    creditCents: parseInt(summary.credit_cents, 10),
    netCents: parseInt(summary.net_cents, 10),
  };
  for (const [field, expected] of Object.entries(V2_EXPECTED_JANUARY_ANCHORS))
    if (actualSummary[field] !== expected)
      fail(`V2 January anchors ${field} ${actualSummary[field]} != ${expected}`);

  const mappingByCode = new Map(mappings.map((m) => [m.erpCode, m]));
  const csTargets = [];
  for (const code of [...V2_EXPECTED_CS_CODES].sort()) {
    const mapping = mappingByCode.get(code);
    const appx = mapping ? (tb["05"].get(mapping.printed)?.appx ?? "").trim() : "";
    if (!mapping || !STMT_CLOSING_NOTES.has(appx)) {
      fail(`${code}: expected V2 CS target is absent from the printed closing-stock family`);
      continue;
    }
    const actualCents = januaryByCode.get(code);
    if (actualCents === undefined) fail(`${code}: missing explicit V2 zero anchor at 2026-01-01`);
    else if (actualCents !== 0) fail(`${code}: V2 CS anchor ${fmt(actualCents)} != explicit zero`);
    csTargets.push({ code, appx, actualCents: actualCents ?? null });
  }
  if (csTargets.length !== 63)
    fail(`V2 CS target count ${csTargets.length} != 63`);

  const osTargets = mappings
    .map((m) => {
      const may = tb["05"].get(m.printed);
      return { code: m.erpCode, printed: m.printed, appx: (may?.appx ?? "").trim(), expectedCents: may?.net ?? 0 };
    })
    .filter((r) => STMT_OPENING_NOTES.has(r.appx) && r.expectedCents !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
  if (osTargets.length !== 62)
    fail(`V2 nonzero OS target count ${osTargets.length} != 62`);
  for (const target of osTargets) {
    for (const mm of TB_MONTHS)
      if ((tb[mm].get(target.printed)?.net ?? 0) !== target.expectedCents)
        fail(`${target.printed}: printed OS balance varies in ${mm}`);
    const actualCents = januaryByCode.get(target.code);
    if (actualCents === undefined)
      fail(`${target.code}: missing V2 OS anchor at 2026-01-01`);
    else if (actualCents !== target.expectedCents)
      fail(`${target.code}: V2 OS anchor ${fmt(actualCents)} != scan ${fmt(target.expectedCents)}`);
    target.actualCents = actualCents ?? null;
  }
  const osTotalCents = osTargets.reduce((sum, r) => sum + r.expectedCents, 0);
  if (osTotalCents !== 62687515)
    fail(`V2 OS target total ${fmt(osTotalCents)} != 626,875.15`);

  const correctionCodes = new Set([...V2_EXPECTED_CS_CODES, ...osTargets.map((r) => r.code)]);
  if (correctionCodes.size !== 125)
    fail(`V2 anchor-correction union ${correctionCodes.size} != 125 accounts`);
  const juneTargets = query(`
    SELECT account_code, as_of_date::text AS as_of_date,
           ROUND(amount * 100)::bigint AS amount_cents
    FROM account_opening_balances
    WHERE as_of_date = DATE '2026-06-01'`)
    .filter((r) => correctionCodes.has(r.account_code));
  if (juneTargets.length !== 0)
    fail(`${juneTargets.length} V2 stock target(s) unexpectedly have a 1 June checkpoint anchor`);

  if (Object.entries(V2_EXPECTED_JANUARY_ANCHORS)
    .every(([field, expected]) => actualSummary[field] === expected)
    && csTargets.length === 63 && osTargets.length === 62
    && osTotalCents === 62687515 && juneTargets.length === 0) {
    ok("V2 January anchors are exact: 642 rows (290 nonzero / 352 zero), DR = CR 13,180,681.18");
    ok("63 CS targets are explicit zero, 62 OS targets equal the scans, and none has a 1 June checkpoint anchor");
  }

  v2OpeningAnchorStateCache = {
    summary: actualSummary,
    csTargets,
    osTargets,
    osTotalCents,
    correctionCodes: [...correctionCodes].sort(),
    juneTargets,
  };
  return v2OpeningAnchorStateCache;
}

function erpBalancesAt(periodEnd) {
  const sql = `
    WITH latest_anchors AS (
      SELECT DISTINCT ON (aob.account_code)
        aob.account_code, aob.as_of_date, aob.amount
      FROM account_opening_balances aob
      WHERE aob.as_of_date <= DATE '${periodEnd}'
      ORDER BY aob.account_code, aob.as_of_date DESC
    ),
    account_periods AS (
      SELECT ac.code, ac.ledger_type,
             la.as_of_date AS anchor_date, la.amount AS anchor_amount,
             COALESCE(la.as_of_date, DATE '2026-01-01') AS movement_start
      FROM account_codes ac
      LEFT JOIN latest_anchors la ON la.account_code = ac.code
      WHERE ac.is_active = true
    ),
    account_movements AS (
      SELECT ap.code,
             SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) AS net
      FROM account_periods ap
      JOIN journal_entry_lines jel ON jel.account_code = ap.code
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.status = 'posted'
        AND je.entry_date >= ap.movement_start
        AND je.entry_date <= DATE '${periodEnd}'
      GROUP BY ap.code
    ),
    account_balances AS (
      SELECT ap.code, ap.ledger_type,
             COALESCE(ap.anchor_amount, 0) + COALESCE(am.net, 0) AS net
      FROM account_periods ap
      LEFT JOIN account_movements am ON am.code = ap.code
      WHERE ap.anchor_date IS NOT NULL OR am.code IS NOT NULL
    )
    SELECT CASE WHEN ledger_type = 'TD' THEN 'DEBTOR' ELSE code END AS code,
           ROUND(SUM(net) * 100)::bigint AS cents
    FROM account_balances
    GROUP BY 1`;
  return new Map(query(sql).map((r) => [r.code, parseInt(r.cents, 10)]));
}

function stageTb() {
  console.log("\n=== stage tb: scanned TB vs ERP derived balance, per account per month ===");
  const { tb, erpAccounts, mappings, unmatched } = computeMapping();
  const nonzeroUnmatched = unmatched.filter((u) => u.everNonzero);
  if (nonzeroUnmatched.length)
    fail(`stage map left ${nonzeroUnmatched.length} nonzero printed codes unmapped — resolve before tb`);

  // Scan side: erpCode -> cents per month.
  const printedByErp = new Map(mappings.map((m) => [m.erpCode, m.printed]));
  const scan = {}; // mm -> Map(erpCode -> cents)
  for (const mm of TB_MONTHS) {
    scan[mm] = new Map(
      mappings.map((m) => [m.erpCode, tb[mm].get(m.printed)?.net ?? 0])
    );
  }

  // ERP side.
  const erp = {}; // mm -> Map(code -> cents)
  for (const mm of TB_MONTHS) {
    erp[mm] = erpBalancesAt(MONTH_ENDS[mm]);
    console.log(`  derived ${erp[mm].size} ERP TB rows at ${MONTH_ENDS[mm]}`);
  }

  // Union of ERP codes seen in any month + all mapped scan codes.
  const allCodes = new Set(mappings.map((m) => m.erpCode));
  for (const mm of TB_MONTHS) for (const code of erp[mm].keys()) allCodes.add(code);

  const rows = [];
  for (const code of [...allCodes].sort()) {
    const scanCents = {}, erpCents = {}, diffCents = {};
    let anyDiff = false;
    for (const mm of TB_MONTHS) {
      scanCents[mm] = scan[mm].get(code) ?? 0;
      erpCents[mm] = erp[mm].get(code) ?? 0;
      diffCents[mm] = scanCents[mm] - erpCents[mm];
      if (diffCents[mm] !== 0) anyDiff = true;
    }
    const diffs = TB_MONTHS.map((mm) => diffCents[mm]);
    const classification = !anyDiff
      ? "exact"
      : diffs.every((d) => d === diffs[0])
        ? "constant_offset"
        : "non_constant_offset";
    const inScan = printedByErp.has(code);
    const inErp = TB_MONTHS.some((mm) => erp[mm].has(code));
    const presence = inScan && inErp ? "both" : inScan ? "scan_only" : "erp_only";
    const mayFix = inScan ? tb["05"].get(printedByErp.get(code)) : null;
    rows.push({
      erpCode: code,
      printed: printedByErp.get(code) ?? null,
      appx: mayFix?.appx ?? null,
      particular: mayFix?.particular ?? erpAccounts.get(code)?.description ?? null,
      evidencePage: mayFix ? `p${mayFix.page} r${mayFix.rowOn}` : null,
      classification, presence, scanCents, erpCents, diffCents,
    });
  }

  // Reclassify the two approved GP-202604-0001 drift rows before bucketing:
  // their exact Jan..May diff profile is pinned in GP_DRIFT_TB_PROFILE.
  for (const r of rows) {
    if (r.classification !== "non_constant_offset") continue;
    const profile = GP_DRIFT_TB_PROFILE[r.erpCode];
    if (profile && TB_MONTHS.every((mm, i) => r.diffCents[mm] === profile[i])) {
      r.classification = "post_scan_gp_drift";
      r.attribution = GP_DRIFT_ATTRIBUTION;
    }
  }

  // ---- Gates and report ----
  const byClass = { exact: [], constant_offset: [], non_constant_offset: [], post_scan_gp_drift: [] };
  for (const r of rows) byClass[r.classification].push(r);
  console.log(`\n${rows.length} compared accounts: ${byClass.exact.length} exact, ${byClass.constant_offset.length} constant offset, ${byClass.non_constant_offset.length} non-constant offset, ${byClass.post_scan_gp_drift.length} named GP drift`);

  // DEBTOR control must match at every month-end (V0 finding).
  const debtor = rows.find((r) => r.erpCode === "DEBTOR");
  for (const mm of TB_MONTHS) {
    if (debtor.scanCents[mm] !== DEBTOR_CONTROLS_CENTS[mm])
      fail(`DEBTOR scan ${MONTH_ENDS[mm]}: ${fmt(debtor.scanCents[mm])} != pinned control ${fmt(DEBTOR_CONTROLS_CENTS[mm])}`);
    if (debtor.diffCents[mm] !== 0)
      fail(`DEBTOR ${MONTH_ENDS[mm]}: ERP collapsed TD row ${fmt(debtor.erpCents[mm])} != printed control ${fmt(debtor.scanCents[mm])}`);
  }
  if (TB_MONTHS.every((mm) => debtor.diffCents[mm] === 0))
    ok(`DEBTOR control matches ERP collapsed TD row at all five month-ends`);

  // V2 final state: every compared account and every global month-end total is
  // exact. The pre-V2 residue remains historical evidence only.
  for (const mm of TB_MONTHS) {
    const total = rows.reduce((s, r) => s + r.diffCents[mm], 0);
    if (total === 0)
      ok(`${MONTH_ENDS[mm]}: Σ(scan − ERP) = 0.00`);
    else
      fail(`${MONTH_ENDS[mm]}: Σ(scan − ERP) ${fmt(total)} != 0.00`);
  }

  if (rows.length === V2_EXPECTED_TB_ACCOUNTS + 2
    && byClass.exact.length === V2_EXPECTED_TB_ACCOUNTS
    && byClass.constant_offset.length === 0
    && byClass.non_constant_offset.length === 0
    && byClass.post_scan_gp_drift.length === 2) {
    ok("V2 TB final state is exact: 880 compared / 880 exact / 0 constant / 0 non-constant, plus the 2 named GP-202604-0001 drift rows (LGP, TP)");
  } else {
    fail(`V2 TB final counts ${rows.length}/${byClass.exact.length}/${byClass.constant_offset.length}/${byClass.non_constant_offset.length}+${byClass.post_scan_gp_drift.length}d != 882/880/0/0+2d`);
  }

  const v2OpeningAnchors = verifyV2OpeningAnchorState();

  // Any reappearance here is a post-V2 regression.
  if (byClass.constant_offset.length) {
    console.log(`\nCONSTANT OFFSETS (unexpected after V2):`);
    let sum = 0;
    for (const r of byClass.constant_offset) {
      sum += r.diffCents["05"];
      console.log(`  ${r.erpCode.padEnd(14)} ${fmt(r.diffCents["05"]).padStart(14)}  appx ${String(r.appx ?? "-").padEnd(5)} ${r.presence.padEnd(9)} "${r.particular}" ${r.evidencePage ?? ""}`);
    }
    console.log(`  ${"TOTAL".padEnd(14)} ${fmt(sum).padStart(14)}`);
  }
  if (byClass.non_constant_offset.length) {
    console.log(`\nNON-CONSTANT offsets (re-inspect scan page first, then explain):`);
    for (const r of byClass.non_constant_offset)
      console.log(`  ${r.erpCode.padEnd(14)} Jan..May diffs: ${TB_MONTHS.map((mm) => fmt(r.diffCents[mm])).join(" / ")}  "${r.particular}" ${r.evidencePage ?? ""}`);
  }
  const erpOnlyNonzero = rows.filter((r) => r.presence === "erp_only" && r.classification !== "exact");
  if (erpOnlyNonzero.length) {
    console.log(`\nERP-only accounts with nonzero balance (no printed TB row):`);
    for (const r of erpOnlyNonzero)
      console.log(`  ${r.erpCode.padEnd(14)} May ERP ${fmt(r.erpCents["05"]).padStart(14)}  "${r.particular}"`);
  }

  const outFile = path.join(genDir, "tb-comparison.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    monthEnds: MONTH_ENDS,
    finalExpectedResidueCents: 0,
    preV2Evidence: {
      residueCents: PRE_V2_RESIDUE_CENTS,
      correctionIdentity: "82960522 CS credits zeroed + 62687515 OS debits inserted = 145648037 cents",
    },
    debtorControlsCents: DEBTOR_CONTROLS_CENTS,
    counts: {
      compared: rows.length,
      exact: byClass.exact.length,
      constantOffset: byClass.constant_offset.length,
      nonConstantOffset: byClass.non_constant_offset.length,
    },
    v2OpeningAnchors,
    // Full detail for every non-exact account; V2 requires this to be empty.
    nonExact: rows.filter((r) => r.classification !== "exact"),
    exactCodes: byClass.exact.map((r) => r.erpCode),
  }, null, 2));
  ok(`wrote ${path.relative(process.cwd(), outFile)}`);
}

// ---- Stage: regressions ----------------------------------------------------
// Standing V2 guards for surfaces the correction package is not authorized to
// change. These are portable semantic checks (no database IDs in fingerprints).
const V2_EXPECTED_JUNE_CHECKPOINT_FINGERPRINT = "147c022cef7b4a4c90735718860a60eb";
const V2_EXPECTED_IMP_ACCOUNTING_FINGERPRINT = "9c0d5c6b141af5d102f5a31c590f6f82";
const V2_EXPECTED_JUNE_FIVE_LEDGER_FINGERPRINT = "c27dbd5a5db93bf08823ae4e0f22cad4";
const V2_EXPECTED_LEGACY_TYPES = {
  S: 2121, PUR: 83, B: 383, C: 45, RV: 410,
  REC: 758, J: 53, JVDR: 5, JVSL: 5,
};
const V2_EXPECTED_JUNE_FIVE_LEDGER = {
  BANK_PBB: { lines: 278, zeroLines: 0, debitCents: 68538869, creditCents: 64493848 },
  CASH_SALES: { lines: 236, zeroLines: 29, debitCents: 0, creditCents: 21333110 },
  CH_REV1: { lines: 306, zeroLines: 29, debitCents: 21333110, creditCents: 21478490 },
  CH_REV2: { lines: 20, zeroLines: 0, debitCents: 720270, creditCents: 814520 },
  CR_SALES: { lines: 190, zeroLines: 5, debitCents: 15835, creditCents: 51309680 },
};

function stageRegressions() {
  console.log("\n=== stage regressions: V2 immutable IMP / June checkpoint / five-ledger state ===");
  const openingAnchors = verifyV2OpeningAnchorState();

  const staging = query(`
    SELECT COUNT(*)::bigint AS rows,
           COUNT(*) FILTER (WHERE record_kind = 'opening')::bigint AS opening_rows,
           COUNT(*) FILTER (WHERE record_kind = 'transaction')::bigint AS transaction_rows,
           COUNT(DISTINCT journal_group_key)
             FILTER (WHERE record_kind = 'transaction')::bigint AS groups,
           COALESCE(SUM(debit_cents) FILTER (WHERE record_kind = 'transaction'), 0)::bigint AS debit_cents,
           COALESCE(SUM(credit_cents) FILTER (WHERE record_kind = 'transaction'), 0)::bigint AS credit_cents,
           COUNT(*) FILTER (WHERE repaired)::bigint AS repaired_rows,
           COUNT(*) FILTER (WHERE source_kind = 'DERIVED')::bigint AS derived_rows,
           MIN(stage_sequence)::bigint AS min_sequence,
           MAX(stage_sequence)::bigint AS max_sequence,
           COUNT(DISTINCT source_sha256)::bigint AS source_hashes,
           COUNT(*) FILTER (WHERE source_sha256 NOT IN (
             '6230d4613768f3f1b51c6195852560446103e39b57b2deb8ac575d8c8ecaa918',
             '6ef5ee949cca9b7903cff5ede201bea5d6e6bc8d341c45e91ea060aeac905a81'
           ))::bigint AS unapproved_source_rows,
           MD5(COALESCE(STRING_AGG(
             JSONB_BUILD_ARRAY(
               stage_sequence, record_kind, source_kind, source_sha256,
               source_physical_line, account_code, entry_date::text,
               journal_ref, journal_group_key, line_display_reference,
               particulars, cheque_reference, debit_cents, credit_cents,
               running_balance_cents, repaired, special_case
             )::text,
             E'\n' ORDER BY stage_sequence
           ), '')) AS fingerprint
    FROM import_legacy_rows`)[0];
  const stagingState = {
    rows: parseInt(staging.rows, 10),
    openingRows: parseInt(staging.opening_rows, 10),
    transactionRows: parseInt(staging.transaction_rows, 10),
    groups: parseInt(staging.groups, 10),
    debitCents: parseInt(staging.debit_cents, 10),
    creditCents: parseInt(staging.credit_cents, 10),
    repairedRows: parseInt(staging.repaired_rows, 10),
    derivedRows: parseInt(staging.derived_rows, 10),
    minSequence: parseInt(staging.min_sequence, 10),
    maxSequence: parseInt(staging.max_sequence, 10),
    sourceHashes: parseInt(staging.source_hashes, 10),
    unapprovedSourceRows: parseInt(staging.unapproved_source_rows, 10),
    fingerprint: staging.fingerprint,
  };
  const expectedStaging = {
    rows: 12635, openingRows: 2567, transactionRows: 10068, groups: 3863,
    debitCents: 1350351615, creditCents: 1350351615,
    repairedRows: 8, derivedRows: 2, minSequence: 1, maxSequence: 12635,
    sourceHashes: 2, unapprovedSourceRows: 0,
    fingerprint: "70865390988ff2205b08ce4a972a0f96",
  };
  const stagingStartFailures = failures;
  for (const [field, expected] of Object.entries(expectedStaging))
    if (stagingState[field] !== expected)
      fail(`legacy staging ${field} ${stagingState[field]} != ${expected}`);
  if (failures === stagingStartFailures)
    ok("legacy staging remains exact: 12,635 fingerprinted rows from the two approved source hashes");

  const imp = query(`
    WITH imported_headers AS (
      SELECT * FROM journal_entries WHERE source_type = 'legacy_import'
    ), imported_lines AS (
      SELECT headers.*, lines.id AS line_id, lines.line_number,
             lines.display_order, lines.account_code, lines.debit_amount,
             lines.credit_amount, lines.particulars, lines.cheque_reference,
             lines.display_reference AS line_display_reference,
             lines.reference AS line_reference
      FROM imported_headers headers
      LEFT JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
    ), staged_movement AS (
      SELECT account_code,
             SUM(debit_cents - credit_cents)::bigint AS movement_cents
      FROM import_legacy_rows
      WHERE record_kind = 'transaction'
      GROUP BY account_code
    ), posted_movement AS (
      SELECT account_code,
             SUM(ROUND(debit_amount * 100) - ROUND(credit_amount * 100))::bigint AS movement_cents
      FROM imported_lines
      GROUP BY account_code
    ), movement_differences AS (
      SELECT 1
      FROM staged_movement
      FULL JOIN posted_movement USING (account_code)
      WHERE staged_movement.movement_cents IS DISTINCT FROM posted_movement.movement_cents
    ), type_counts AS (
      SELECT legacy_entry_type, COUNT(*)::integer AS count
      FROM imported_headers
      GROUP BY legacy_entry_type
    )
    SELECT (SELECT COUNT(*) FROM imported_headers)::bigint AS headers,
           COUNT(line_id)::bigint AS lines,
           COALESCE(SUM(ROUND(debit_amount * 100)), 0)::bigint AS debit_cents,
           COALESCE(SUM(ROUND(credit_amount * 100)), 0)::bigint AS credit_cents,
           MD5(COALESCE(STRING_AGG(
             JSONB_BUILD_ARRAY(
               reference_no, entry_date::text, display_reference,
               ROUND(total_debit * 100)::bigint,
               ROUND(total_credit * 100)::bigint,
               line_number, display_order, account_code,
               ROUND(debit_amount * 100)::bigint,
               ROUND(credit_amount * 100)::bigint,
               particulars, cheque_reference, line_display_reference
             )::text,
             E'\n' ORDER BY reference_no, line_number, line_id
           ), '')) AS accounting_fingerprint,
           (SELECT COUNT(*) FROM imported_headers
             WHERE entry_type IS DISTINCT FROM 'IMP'
                OR status IS DISTINCT FROM 'posted'
                OR source_id IS NULL
                OR manual_override IS DISTINCT FROM false)::bigint AS bad_headers,
           (SELECT COUNT(source_id) - COUNT(DISTINCT source_id) FROM imported_headers)::bigint AS duplicate_source_ids,
           (SELECT COUNT(*) FROM journal_entries
             WHERE entry_type = 'IMP'
               AND source_type IS DISTINCT FROM 'legacy_import')::bigint AS imp_without_legacy_source,
           (SELECT COUNT(*) FROM imported_headers
             WHERE description IS NULL OR BTRIM(description) = ''
                OR description LIKE 'Legacy import %')::bigint AS bad_descriptions,
           COUNT(line_id) FILTER (
             WHERE line_reference IS DISTINCT FROM line_display_reference
           )::bigint AS line_reference_mismatches,
           (SELECT COUNT(*) FROM imported_headers headers
             WHERE EXISTS (
               SELECT 1 FROM journal_entry_lines lines
               WHERE lines.journal_entry_id = headers.id
               GROUP BY lines.journal_entry_id
               HAVING SUM(lines.debit_amount) IS DISTINCT FROM headers.total_debit
                   OR SUM(lines.credit_amount) IS DISTINCT FROM headers.total_credit
                   OR SUM(lines.debit_amount) IS DISTINCT FROM SUM(lines.credit_amount)
             ))::bigint AS unbalanced_headers,
           (SELECT COUNT(*) FROM movement_differences)::bigint AS staged_movement_mismatches,
           (SELECT COALESCE(JSONB_OBJECT_AGG(legacy_entry_type, count), '{}'::jsonb)::text FROM type_counts) AS legacy_type_counts
    FROM imported_lines`)[0];
  const impState = {
    headers: parseInt(imp.headers, 10),
    lines: parseInt(imp.lines, 10),
    debitCents: parseInt(imp.debit_cents, 10),
    creditCents: parseInt(imp.credit_cents, 10),
    accountingFingerprint: imp.accounting_fingerprint,
    badHeaders: parseInt(imp.bad_headers, 10),
    duplicateSourceIds: parseInt(imp.duplicate_source_ids, 10),
    impWithoutLegacySource: parseInt(imp.imp_without_legacy_source, 10),
    badDescriptions: parseInt(imp.bad_descriptions, 10),
    lineReferenceMismatches: parseInt(imp.line_reference_mismatches, 10),
    unbalancedHeaders: parseInt(imp.unbalanced_headers, 10),
    stagedMovementMismatches: parseInt(imp.staged_movement_mismatches, 10),
    legacyTypeCounts: JSON.parse(imp.legacy_type_counts),
  };
  const impStartFailures = failures;
  const expectedImpScalars = {
    headers: 3863,
    lines: 10068,
    debitCents: 1350351615,
    creditCents: 1350351615,
    accountingFingerprint: V2_EXPECTED_IMP_ACCOUNTING_FINGERPRINT,
    badHeaders: 0,
    duplicateSourceIds: 0,
    impWithoutLegacySource: 0,
    badDescriptions: 0,
    lineReferenceMismatches: 0,
    unbalancedHeaders: 0,
    stagedMovementMismatches: 0,
  };
  for (const [field, expected] of Object.entries(expectedImpScalars))
    if (impState[field] !== expected)
      fail(`immutable IMP ${field} ${impState[field]} != ${expected}`);
  if (Object.keys(impState.legacyTypeCounts).length !== Object.keys(V2_EXPECTED_LEGACY_TYPES).length
    || Object.entries(V2_EXPECTED_LEGACY_TYPES)
      .some(([type, expected]) => impState.legacyTypeCounts[type] !== expected))
    fail(`immutable IMP legacy type counts ${JSON.stringify(impState.legacyTypeCounts)} != ${JSON.stringify(V2_EXPECTED_LEGACY_TYPES)}`);
  if (failures === impStartFailures)
    ok(`immutable IMP projection remains exact: 3,863 headers / 10,068 lines / ${V2_EXPECTED_IMP_ACCOUNTING_FINGERPRINT}`);

  const juneRows = query(`
    SELECT account_code, ROUND(amount * 100)::bigint AS amount_cents
    FROM account_opening_balances
    WHERE as_of_date = DATE '2026-06-01'
    ORDER BY account_code`)
    .map((r) => [r.account_code, parseInt(r.amount_cents, 10)]);
  const juneCheckpointFingerprint = createHash("md5")
    .update(JSON.stringify(juneRows))
    .digest("hex");
  const juneSummary = {
    total: juneRows.length,
    nonzero: juneRows.filter(([, amountCents]) => amountCents !== 0).length,
    zero: juneRows.filter(([, amountCents]) => amountCents === 0).length,
    netCents: juneRows.reduce((sum, [, amountCents]) => sum + amountCents, 0),
    fingerprint: juneCheckpointFingerprint,
  };
  const juneSourceProof = query(`
    WITH expected_cn(entry_date, debtor_account, amount_cents) AS (
      VALUES
        (DATE '2026-01-09', 'MYSHOP(KM)'::varchar, 2290::bigint),
        (DATE '2026-01-17', 'MYSHOP-QL', 2565),
        (DATE '2026-02-05', 'YTF', 105660),
        (DATE '2026-02-06', 'MYSHOP-KD1', 2565),
        (DATE '2026-02-14', 'MYSHOP-QL', 1540),
        (DATE '2026-02-26', 'MYSHOP-LK', 6755),
        (DATE '2026-03-10', 'MYSHOP-KM2', 3350),
        (DATE '2026-03-10', 'MYSHOP(KM)', 1180),
        (DATE '2026-03-18', 'C-CARE(6)', 19572),
        (DATE '2026-04-08', 'MYSHOP-QL', 3340),
        (DATE '2026-04-08', 'MYSHOP-QL', 3300),
        (DATE '2026-04-08', 'MYSHOP(KM)', 1200),
        (DATE '2026-05-20', 'MEEWOO-K', 21875),
        (DATE '2026-05-28', 'MYSHOP-SKT', 5130),
        (DATE '2026-05-28', 'MYSHOP(KM)', 685),
        (DATE '2026-05-28', 'MYSHOP-KM2', 2485)
    ), staged_opening AS (
      SELECT account_code, SUM(running_balance_cents)::bigint AS opening_cents
      FROM import_legacy_rows
      WHERE record_kind = 'opening'
      GROUP BY account_code
    ), staged_movement AS (
      SELECT account_code, SUM(debit_cents - credit_cents)::bigint AS movement_cents
      FROM import_legacy_rows
      WHERE record_kind = 'transaction' AND entry_date <= DATE '2026-05-31'
      GROUP BY account_code
    ), cn_projection AS (
      SELECT 'CR_SALES'::varchar AS account_code, amount_cents AS movement_cents
      FROM expected_cn
      UNION ALL
      SELECT debtor_account, -amount_cents FROM expected_cn
    ), cn_movement AS (
      SELECT account_code, SUM(movement_cents)::bigint AS movement_cents
      FROM cn_projection GROUP BY account_code
    ), source_accounts AS (
      SELECT account_code FROM staged_opening
      UNION SELECT account_code FROM staged_movement
      UNION SELECT account_code FROM cn_movement
    ), expected_source_close AS (
      SELECT accounts.account_code,
             COALESCE(opening.opening_cents, 0)
               + COALESCE(movement.movement_cents, 0)
               + COALESCE(cn.movement_cents, 0) AS close_cents
      FROM source_accounts accounts
      LEFT JOIN staged_opening opening USING (account_code)
      LEFT JOIN staged_movement movement USING (account_code)
      LEFT JOIN cn_movement cn USING (account_code)
    ), june AS (
      SELECT account_code, ROUND(amount * 100)::bigint AS amount_cents
      FROM account_opening_balances
      WHERE as_of_date = DATE '2026-06-01'
    )
    SELECT (SELECT COUNT(*) FROM expected_source_close)::bigint AS source_accounts,
           (SELECT SUM(close_cents) FROM expected_source_close)::bigint AS source_net_cents,
           COUNT(*) FILTER (
             WHERE COALESCE(source.close_cents, 0) IS DISTINCT FROM june.amount_cents
           )::bigint AS checkpoint_mismatches
    FROM june
    LEFT JOIN expected_source_close source USING (account_code)`)[0];
  const juneSourceState = {
    sourceAccounts: parseInt(juneSourceProof.source_accounts, 10),
    sourceNetCents: parseInt(juneSourceProof.source_net_cents, 10),
    checkpointMismatches: parseInt(juneSourceProof.checkpoint_mismatches, 10),
  };
  const juneStartFailures = failures;
  const expectedJune = {
    total: 1571, nonzero: 155, zero: 1416, netCents: -261795905,
    fingerprint: V2_EXPECTED_JUNE_CHECKPOINT_FINGERPRINT,
  };
  for (const [field, expected] of Object.entries(expectedJune))
    if (juneSummary[field] !== expected)
      fail(`1 June checkpoint ${field} ${juneSummary[field]} != ${expected}`);
  if (juneSourceState.sourceAccounts !== 2568)
    fail(`source-derived close population ${juneSourceState.sourceAccounts} != 2568`);
  if (juneSourceState.sourceNetCents !== -PRE_V2_RESIDUE_CENTS)
    fail(`source-derived close net ${juneSourceState.sourceNetCents} != ${-PRE_V2_RESIDUE_CENTS}`);
  if (juneSourceState.checkpointMismatches !== 0)
    fail(`${juneSourceState.checkpointMismatches} of the 1,571 June checkpoints differ from their source-derived close`);
  if (failures === juneStartFailures)
    ok(`all 1,571 June checkpoints retain their exact source-derived values (${juneCheckpointFingerprint})`);

  const juneTb = erpBalancesAt("2026-06-30");
  const juneTbNetCents = [...juneTb.values()].reduce((sum, amountCents) => sum + amountCents, 0);
  if (juneTbNetCents === 0) ok("30 June derived Trial Balance remains globally balanced");
  else fail(`30 June derived Trial Balance net ${fmt(juneTbNetCents)} != 0.00`);

  const fiveLedger = query(`
    WITH canonical AS (
      SELECT lines.account_code,
             ROUND(lines.debit_amount * 100)::bigint AS debit_cents,
             ROUND(lines.credit_amount * 100)::bigint AS credit_cents,
             JSONB_BUILD_ARRAY(
               lines.account_code, journals.entry_date::text,
               journals.entry_type, COALESCE(journals.legacy_entry_type, ''),
               journals.reference_no, COALESCE(journals.display_reference, ''),
               COALESCE(journals.cheque_no, ''), COALESCE(journals.source_type, ''),
               COALESCE(journals.source_id, ''), journals.manual_override,
               lines.line_number, COALESCE(lines.display_order, lines.line_number),
               ROUND(lines.debit_amount * 100)::bigint,
               ROUND(lines.credit_amount * 100)::bigint,
               COALESCE(lines.reference, ''), COALESCE(lines.display_reference, ''),
               COALESCE(lines.particulars, ''), COALESCE(lines.cheque_reference, '')
             )::text AS row_text
      FROM journal_entries journals
      JOIN journal_entry_lines lines ON lines.journal_entry_id = journals.id
      WHERE journals.status = 'posted'
        AND journals.entry_date BETWEEN DATE '2026-06-01' AND DATE '2026-06-30'
        AND lines.account_code IN ('BANK_PBB', 'CASH_SALES', 'CH_REV1', 'CH_REV2', 'CR_SALES')
    ), summary AS (
      SELECT account_code, COUNT(*)::bigint AS lines,
             COUNT(*) FILTER (WHERE debit_cents = 0 AND credit_cents = 0)::bigint AS zero_lines,
             SUM(debit_cents)::bigint AS debit_cents,
             SUM(credit_cents)::bigint AS credit_cents
      FROM canonical GROUP BY account_code
    )
    SELECT (SELECT COUNT(*) FROM canonical)::bigint AS total_lines,
           (SELECT MD5(COALESCE(STRING_AGG(row_text, E'\n' ORDER BY row_text), '')) FROM canonical) AS fingerprint,
           JSONB_AGG(JSONB_BUILD_OBJECT(
             'accountCode', account_code, 'lines', lines, 'zeroLines', zero_lines,
             'debitCents', debit_cents, 'creditCents', credit_cents
           ) ORDER BY account_code)::text AS accounts
    FROM summary`)[0];
  const fiveLedgerRows = JSON.parse(fiveLedger.accounts);
  const fiveLedgerState = Object.fromEntries(fiveLedgerRows.map((r) => [r.accountCode, {
    lines: r.lines,
    zeroLines: r.zeroLines,
    debitCents: r.debitCents,
    creditCents: r.creditCents,
  }]));
  const fiveLedgerStartFailures = failures;
  if (parseInt(fiveLedger.total_lines, 10) !== 1030)
    fail(`June five-ledger lines ${fiveLedger.total_lines} != 1030`);
  if (fiveLedger.fingerprint !== V2_EXPECTED_JUNE_FIVE_LEDGER_FINGERPRINT)
    fail(`June five-ledger fingerprint ${fiveLedger.fingerprint} != ${V2_EXPECTED_JUNE_FIVE_LEDGER_FINGERPRINT}`);
  if (JSON.stringify(fiveLedgerState) !== JSON.stringify(V2_EXPECTED_JUNE_FIVE_LEDGER))
    fail(`June five-ledger aggregates ${JSON.stringify(fiveLedgerState)} != frozen ${JSON.stringify(V2_EXPECTED_JUNE_FIVE_LEDGER)}`);
  if (failures === fiveLedgerStartFailures)
    ok(`frozen June five-ledger movement remains exact: 1,030 lines / ${fiveLedger.fingerprint}`);

  const outFile = path.join(genDir, "v2-regression.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    openingAnchors,
    staging: stagingState,
    immutableImp: impState,
    juneCheckpoints: { ...juneSummary, ...juneSourceState, juneTbNetCents },
    juneFiveLedger: {
      totalLines: parseInt(fiveLedger.total_lines, 10),
      fingerprint: fiveLedger.fingerprint,
      accounts: fiveLedgerState,
    },
  }, null, 2));
  ok(`wrote ${path.relative(process.cwd(), outFile)}`);
}

// ---- Stage: tdl -------------------------------------------------------------
// The scan is a month statement as at 31 May: BAL B/F is the debtor-child
// close before 1 May, CURRENT + PAYMENT is signed May net movement, and TOTAL
// DUE is the 31 May close. The legacy report classifies CNs and one wrong-bank
// contra differently from raw GL debit/credit columns, so that split is named
// separately below. The 1 June anchors independently checkpoint the close.
const TDL_PERIOD_START = "2026-05-01";
const TDL_PERIOD_END = "2026-05-31";
const TDL_CHECKPOINT_DATE = "2026-06-01";
const TDL_CONTROL_CENTS = 50769772;
const TDL_EXPECTED_CUSTOMERS = 150;
const TDL_EXPECTED_CREDITORS = 3;
const TDL_EXPECTED_ERP_ONLY_ZERO_CLOSE = 41;
const TDL_PRINTED_TOTALS_CENTS = {
  balBf: 57866195,
  current: 31637689,
  payment: -51808673,
  totalDue: 50769772,
  ageCurrent: 24541266,
  age1m: 12474050,
  age2m: 2405571,
  age3mPlus: 4252462,
};
const TDL_FULL_POPULATION_EXPECTED_CENTS = {
  balBf: 57866195,
  legacySemanticCurrent: 44712250,
  legacySemanticPayment: -51808673,
  totalDue: 50769772,
};
// Full-population (all 191 debtor children) signed-ledger FIFO aging buckets —
// the V3 endpoint's printed aging totals, reconciling to TOTAL DUE exactly.
const TDL_FULL_POPULATION_AGING_EXPECTED_CENTS = {
  ageCurrent: 31637689,
  age1m: 12474050,
  age2m: 2405571,
  age3mPlus: 4252462,
};
// V3: the ERP general statement now uses the legacy column semantics
// (current = S/DN/RN debits − CN credits; payment = S+REC credits − REC debits)
// and the same signed-ledger FIFO aging as the scans (computeLegacyFifoAging in
// src/routes/accounting/debtors.js). The harness therefore expects ZERO
// per-customer column and aging differences; any regression fails outright.

function debtorLedgerRows() {
  const sql = `
    WITH children AS (
      SELECT DISTINCT ON (ac.code)
             ac.code AS child_code,
             c.id AS customer_id,
             c.name AS customer_name
        FROM account_codes ac
        JOIN customers c
          ON ac.code = c.id OR ac.code LIKE c.id || '-D%'
       WHERE ac.parent_code = 'DEBTOR'
       ORDER BY ac.code, (ac.code = c.id) DESC
    ),
    anchors AS (
      SELECT DISTINCT ON (aob.account_code)
             aob.account_code, aob.amount, aob.as_of_date
        FROM account_opening_balances aob
        JOIN children ch ON ch.child_code = aob.account_code
       WHERE aob.as_of_date <= DATE '${TDL_PERIOD_START}'
       ORDER BY aob.account_code, aob.as_of_date DESC
    ),
    movement AS (
      SELECT jel.account_code,
             SUM(CASE WHEN je.entry_date < DATE '${TDL_PERIOD_START}'
                       AND (a.as_of_date IS NULL OR je.entry_date >= a.as_of_date)
                      THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS pre_movement,
             SUM(CASE WHEN je.entry_date >= DATE '${TDL_PERIOD_START}'
                       AND je.entry_date <= DATE '${TDL_PERIOD_END}'
                      THEN jel.debit_amount ELSE 0 END) AS period_debits,
             SUM(CASE WHEN je.entry_date >= DATE '${TDL_PERIOD_START}'
                       AND je.entry_date <= DATE '${TDL_PERIOD_END}'
                      THEN jel.credit_amount ELSE 0 END) AS period_credits
             ,SUM(CASE WHEN je.entry_date >= DATE '${TDL_PERIOD_START}'
                        AND je.entry_date <= DATE '${TDL_PERIOD_END}'
                        AND COALESCE(je.legacy_entry_type, je.entry_type) IN ('S', 'DN', 'RN')
                       THEN jel.debit_amount ELSE 0 END)
              - SUM(CASE WHEN je.entry_date >= DATE '${TDL_PERIOD_START}'
                          AND je.entry_date <= DATE '${TDL_PERIOD_END}'
                          AND COALESCE(je.legacy_entry_type, je.entry_type) = 'CN'
                         THEN jel.credit_amount ELSE 0 END) AS legacy_current,
             SUM(CASE WHEN je.entry_date >= DATE '${TDL_PERIOD_START}'
                       AND je.entry_date <= DATE '${TDL_PERIOD_END}'
                       AND COALESCE(je.legacy_entry_type, je.entry_type) = 'REC'
                      THEN jel.debit_amount - jel.credit_amount ELSE 0 END)
              - SUM(CASE WHEN je.entry_date >= DATE '${TDL_PERIOD_START}'
                          AND je.entry_date <= DATE '${TDL_PERIOD_END}'
                          AND COALESCE(je.legacy_entry_type, je.entry_type) = 'S'
                         THEN jel.credit_amount ELSE 0 END) AS legacy_payment
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        JOIN children ch ON ch.child_code = jel.account_code
        LEFT JOIN anchors a ON a.account_code = jel.account_code
       WHERE je.status = 'posted'
         AND je.entry_date <= DATE '${TDL_PERIOD_END}'
       GROUP BY jel.account_code
    ),
    checkpoint AS (
      SELECT aob.account_code, aob.amount
        FROM account_opening_balances aob
       WHERE aob.as_of_date = DATE '${TDL_CHECKPOINT_DATE}'
    )
    SELECT ch.child_code, ch.customer_id, ch.customer_name,
           ROUND((COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0)) * 100)::bigint AS bal_bf_cents,
           ROUND(COALESCE(m.period_debits, 0) * 100)::bigint AS period_debits_cents,
           ROUND(COALESCE(m.period_credits, 0) * 100)::bigint AS period_credits_cents,
           ROUND(COALESCE(m.legacy_current, 0) * 100)::bigint AS legacy_current_cents,
           ROUND(COALESCE(m.legacy_payment, 0) * 100)::bigint AS legacy_payment_cents,
           ROUND((COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0)
                  + COALESCE(m.period_debits, 0) - COALESCE(m.period_credits, 0)) * 100)::bigint AS close_cents,
           CASE WHEN cp.account_code IS NULL THEN NULL
                ELSE ROUND(cp.amount * 100)::bigint END AS checkpoint_cents
      FROM children ch
      LEFT JOIN anchors a ON a.account_code = ch.child_code
      LEFT JOIN movement m ON m.account_code = ch.child_code
      LEFT JOIN checkpoint cp ON cp.account_code = ch.child_code
     ORDER BY ch.customer_id, ch.child_code`;

  return query(sql).map((r) => ({
    childCode: r.child_code,
    customerId: r.customer_id,
    customerName: r.customer_name,
    balBfCents: parseInt(r.bal_bf_cents, 10),
    periodDebitsCents: parseInt(r.period_debits_cents, 10),
    periodCreditsCents: parseInt(r.period_credits_cents, 10),
    legacyCurrentCents: parseInt(r.legacy_current_cents, 10),
    legacyPaymentCents: parseInt(r.legacy_payment_cents, 10),
    closeCents: parseInt(r.close_cents, 10),
    checkpointCents: r.checkpoint_cents === "" ? null : parseInt(r.checkpoint_cents, 10),
  }));
}

// Reconstructs the legacy scan's aging from the debtor ledger alone — signed
// monthly document buckets carried forward and consumed FIFO. Since V3 this is
// also the ERP endpoint model: computeLegacyFifoAging in
// src/routes/accounting/debtors.js is a port of this reference.
function debtorLegacyFifoAgingRows() {
  const sql = `
    WITH children AS (
      SELECT DISTINCT ON (ac.code)
             ac.code AS child_code,
             c.id AS customer_id
        FROM account_codes ac
        JOIN customers c
          ON ac.code = c.id OR ac.code LIKE c.id || '-D%'
       WHERE ac.parent_code = 'DEBTOR'
       ORDER BY ac.code, (ac.code = c.id) DESC
    ),
    months(month_no, month_key) AS (
      VALUES (1, '2026-01'), (2, '2026-02'), (3, '2026-03'),
             (4, '2026-04'), (5, '2026-05')
    ),
    anchors AS (
      SELECT aob.account_code,
             COUNT(*)::integer AS anchor_count,
             ROUND(SUM(aob.amount) * 100)::bigint AS anchor_cents
        FROM account_opening_balances aob
       WHERE aob.as_of_date = DATE '2026-01-01'
       GROUP BY aob.account_code
    ),
    monthly AS (
      SELECT jel.account_code,
             EXTRACT(MONTH FROM je.entry_date)::integer AS month_no,
             ROUND((
               SUM(CASE
                     WHEN COALESCE(je.legacy_entry_type, je.entry_type) IN ('S', 'DN', 'RN')
                     THEN jel.debit_amount ELSE 0 END)
               + SUM(CASE
                       WHEN COALESCE(je.legacy_entry_type, je.entry_type) = 'CN'
                       THEN jel.debit_amount - jel.credit_amount ELSE 0 END)
             ) * 100)::bigint AS current_cents,
             ROUND((
               SUM(CASE
                     WHEN COALESCE(je.legacy_entry_type, je.entry_type) = 'S'
                     THEN jel.credit_amount ELSE 0 END)
               + SUM(CASE
                       WHEN COALESCE(je.legacy_entry_type, je.entry_type) = 'REC'
                       THEN jel.credit_amount - jel.debit_amount ELSE 0 END)
             ) * 100)::bigint AS payment_cents
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        JOIN children ch ON ch.child_code = jel.account_code
       WHERE je.status = 'posted'
         AND je.entry_date >= DATE '2026-01-01'
         AND je.entry_date <= DATE '2026-05-31'
       GROUP BY jel.account_code, EXTRACT(MONTH FROM je.entry_date)
    )
    SELECT ch.customer_id, ch.child_code, m.month_key,
           COALESCE(a.anchor_count, 0) AS anchor_count,
           COALESCE(a.anchor_cents, 0) AS anchor_cents,
           COALESCE(tx.current_cents, 0) AS current_cents,
           COALESCE(tx.payment_cents, 0) AS payment_cents
      FROM children ch
      CROSS JOIN months m
      LEFT JOIN anchors a ON a.account_code = ch.child_code
      LEFT JOIN monthly tx
        ON tx.account_code = ch.child_code AND tx.month_no = m.month_no
     ORDER BY ch.customer_id, ch.child_code, m.month_no`;

  const inputs = new Map();
  for (const r of query(sql)) {
    if (!inputs.has(r.customer_id)) {
      inputs.set(r.customer_id, {
        childCode: r.child_code,
        anchorCount: parseInt(r.anchor_count, 10),
        anchorCents: parseInt(r.anchor_cents, 10),
        months: new Map(),
      });
    }
    inputs.get(r.customer_id).months.set(r.month_key, {
      currentCents: parseInt(r.current_cents, 10),
      paymentCents: parseInt(r.payment_cents, 10),
    });
  }

  const result = new Map();
  const monthKeys = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
  for (const [customerId, input] of inputs) {
    const buckets = [{ month: "old", amountCents: input.anchorCents }];
    for (const month of monthKeys) {
      const movement = input.months.get(month) || { currentCents: 0, paymentCents: 0 };
      let currentCents = movement.currentCents;
      let paymentCents = movement.paymentCents;
      if (paymentCents < 0) {
        fail(`${customerId} ${month}: legacy FIFO input has negative payment ${fmt(paymentCents)}`);
        currentCents += paymentCents;
        paymentCents = 0;
      }
      if (paymentCents > 0) {
        // The legacy engine normalizes carried credits only in a month that
        // has a payment, then consumes remaining positive buckets oldest-first.
        for (const negative of buckets.filter((b) => b.amountCents < 0)) {
          for (const positive of buckets) {
            if (negative.amountCents >= 0) break;
            if (positive.amountCents <= 0) continue;
            const used = Math.min(-negative.amountCents, positive.amountCents);
            negative.amountCents += used;
            positive.amountCents -= used;
          }
        }
        let remainingPaymentCents = paymentCents;
        for (const bucket of buckets) {
          if (remainingPaymentCents <= 0) break;
          if (bucket.amountCents <= 0) continue;
          const used = Math.min(remainingPaymentCents, bucket.amountCents);
          bucket.amountCents -= used;
          remainingPaymentCents -= used;
        }
        currentCents -= remainingPaymentCents;
      }
      if (currentCents !== 0)
        buckets.push({ month, amountCents: currentCents });
    }

    const sumBucket = (wanted) => buckets
      .filter((b) => wanted.has(b.month))
      .reduce((sum, b) => sum + b.amountCents, 0);
    result.set(customerId, {
      anchorCount: input.anchorCount,
      anchorCents: input.anchorCents,
      ageCurrentCents: sumBucket(new Set(["2026-05"])),
      age1mCents: sumBucket(new Set(["2026-04"])),
      age2mCents: sumBucket(new Set(["2026-03"])),
      age3mPlusCents: sumBucket(new Set(["old", "2026-01", "2026-02"])),
    });
  }
  return result;
}

function stageTdl() {
  console.log("\n=== stage tdl: scanned Trade Debtor List vs ERP debtor children ===");
  const fixture = loadTdlFixture();
  const ledgerRows = debtorLedgerRows();
  const legacyFifoAgingByCustomer = debtorLegacyFifoAgingRows();

  if (fixture.length === TDL_EXPECTED_CUSTOMERS)
    ok(`loaded ${fixture.length} unique debtor rows from the scan fixture`);
  else
    fail(`loaded ${fixture.length} debtor rows; expected ${TDL_EXPECTED_CUSTOMERS}`);

  const ledgerByCustomer = new Map();
  for (const r of ledgerRows) {
    if (ledgerByCustomer.has(r.customerId))
      fail(`customer ${r.customerId} resolves to multiple debtor children (${ledgerByCustomer.get(r.customerId).childCode}, ${r.childCode})`);
    ledgerByCustomer.set(r.customerId, r);
  }

  const importAliases = new Map(
    JSON.parse(fs.readFileSync(path.join(here, "..", "legacy-jan-may", "account-aliases.json"), "utf8"))
      .aliases.filter((a) => a.source === "THDB")
      .map((a) => [a.sourceCode, a])
  );
  const scanExceptions = new Map(
    JSON.parse(fs.readFileSync(path.join(here, "scan-code-exceptions.json"), "utf8"))
      .exceptions.map((e) => [e.printedCode, e])
  );

  const comparisons = [];
  const missingCustomers = [];
  const nameDifferences = [];
  const accountMappings = [];
  const mappedCustomerIds = new Set();
  for (const scan of fixture) {
    let resolvedCustomerId = scan.accountNo;
    let mappingMethod = "exact";
    let mappingReason = null;
    if (!ledgerByCustomer.has(resolvedCustomerId) && importAliases.has(scan.accountNo)) {
      const alias = importAliases.get(scan.accountNo);
      resolvedCustomerId = alias.targetCode;
      mappingMethod = "import_alias";
      mappingReason = alias.reason;
    }
    if (!ledgerByCustomer.has(resolvedCustomerId) && scanExceptions.has(scan.accountNo)) {
      const exception = scanExceptions.get(scan.accountNo);
      resolvedCustomerId = exception.erpCode;
      mappingMethod = `exception:${exception.kind}`;
      mappingReason = exception.reason;
    }
    const erp = ledgerByCustomer.get(resolvedCustomerId);
    if (!erp) {
      missingCustomers.push({
        accountNo: scan.accountNo,
        attemptedErpCustomerId: resolvedCustomerId,
        particular: scan.particular,
        evidencePage: `p${scan.page} r${scan.rowOnPage}`,
      });
      continue;
    }
    if (mappedCustomerIds.has(resolvedCustomerId))
      fail(`multiple printed debtor rows resolve to ERP customer ${resolvedCustomerId}`);
    mappedCustomerIds.add(resolvedCustomerId);
    accountMappings.push({
      printedAccountNo: scan.accountNo,
      erpCustomerId: resolvedCustomerId,
      childCode: erp.childCode,
      method: mappingMethod,
      ...(mappingReason ? { reason: mappingReason } : {}),
    });
    if (scan.particular !== erp.customerName)
      nameDifferences.push({ accountNo: scan.accountNo, erpCustomerId: resolvedCustomerId, scan: scan.particular, erp: erp.customerName });

    // The endpoint's general-statement columns ARE the legacy semantics since
    // V3, so this structural diff is also the report-column diff.
    const structuralLedgerDiffCents = {
      balBf: scan.balBfCents - erp.balBfCents,
      current: scan.currentCents - erp.legacyCurrentCents,
      payment: scan.paymentCents - erp.legacyPaymentCents,
      netMay: scan.currentCents + scan.paymentCents
        - (erp.periodDebitsCents - erp.periodCreditsCents),
      totalDue: scan.totalDueCents - erp.closeCents,
      checkpoint: scan.totalDueCents - (erp.checkpointCents ?? 0),
    };

    const legacyFifoAging = legacyFifoAgingByCustomer.get(resolvedCustomerId) || {
      anchorCount: 0,
      anchorCents: 0,
      ageCurrentCents: 0,
      age1mCents: 0,
      age2mCents: 0,
      age3mPlusCents: 0,
    };
    const legacyFifoAgingDiffCents = {
      current: scan.ageCurrentCents - legacyFifoAging.ageCurrentCents,
      oneMonth: scan.age1mCents - legacyFifoAging.age1mCents,
      twoMonths: scan.age2mCents - legacyFifoAging.age2mCents,
      threeMonthsPlus: scan.age3mPlusCents - legacyFifoAging.age3mPlusCents,
    };

    comparisons.push({
      accountNo: scan.accountNo,
      erpCustomerId: resolvedCustomerId,
      mappingMethod,
      particular: scan.particular,
      childCode: erp.childCode,
      evidencePage: `p${scan.page} r${scan.rowOnPage}`,
      scanCents: {
        balBf: scan.balBfCents,
        current: scan.currentCents,
        payment: scan.paymentCents,
        totalDue: scan.totalDueCents,
        ageCurrent: scan.ageCurrentCents,
        age1m: scan.age1mCents,
        age2m: scan.age2mCents,
        age3mPlus: scan.age3mPlusCents,
      },
      erpLedgerCents: {
        balBf: erp.balBfCents,
        legacySemanticCurrent: erp.legacyCurrentCents,
        legacySemanticPayment: erp.legacyPaymentCents,
        currentReportRawDebits: erp.periodDebitsCents,
        currentReportSignedCredits: -erp.periodCreditsCents,
        totalDue: erp.closeCents,
        checkpoint: erp.checkpointCents,
      },
      structuralLedgerDiffCents,
      erpLegacyFifoAgingCents: legacyFifoAging,
      legacyFifoAgingDiffCents,
    });
  }

  if (missingCustomers.length)
    fail(`${missingCustomers.length} scan account(s) have no unique ERP debtor-child mapping`);
  else
    ok("all 150 printed account numbers resolve to one ERP customer/debtor child");

  const structuralNonExact = comparisons.filter((r) => Object.values(r.structuralLedgerDiffCents).some((v) => v !== 0));
  if (structuralNonExact.length)
    fail(`${structuralNonExact.length} printed debtor row(s) differ in BAL B/F, legacy-semantic May columns/net, TOTAL DUE, or 1 June checkpoint`);
  else
    ok("all 150 rows exactly match BAL B/F + legacy-semantic May CURRENT/PAYMENT = 31 May close = 1 June anchor");

  // The ERP general-statement columns ARE the legacy semantics since V3, so
  // any column difference is a regression, not a named gap.
  const columnNonExact = comparisons.filter((r) =>
    r.structuralLedgerDiffCents.current !== 0 || r.structuralLedgerDiffCents.payment !== 0);
  if (columnNonExact.length)
    fail(`${columnNonExact.length} ERP general-statement CURRENT/PAYMENT split(s) differ from the legacy columns`);
  else
    ok("the ERP General Statement CURRENT/PAYMENT split matches the legacy columns");

  const erpOnlyActive = ledgerRows.filter((r) => !mappedCustomerIds.has(r.customerId)
    && (r.balBfCents !== 0 || r.periodDebitsCents !== 0 || r.periodCreditsCents !== 0 || r.closeCents !== 0));
  const erpOnlyNonzeroClose = erpOnlyActive.filter((r) => r.closeCents !== 0);
  if (erpOnlyNonzeroClose.length)
    fail(`${erpOnlyNonzeroClose.length} ERP-only debtor child(ren) have a nonzero 31 May close`);
  if (erpOnlyActive.length === TDL_EXPECTED_ERP_ONLY_ZERO_CLOSE)
    note(`${erpOnlyActive.length} ERP-only debtor child(ren) have May activity but close at zero (the scan omits zero-due rows)`);
  else
    fail(`${erpOnlyActive.length} ERP-only activity rows found; expected ${TDL_EXPECTED_ERP_ONLY_ZERO_CLOSE} zero-close rows`);

  const fixtureDue = fixture.reduce((sum, r) => sum + r.totalDueCents, 0);
  const erpDue = comparisons.reduce((sum, r) => sum + r.erpLedgerCents.totalDue, 0);
  const checkpointDue = comparisons.reduce((sum, r) => sum + (r.erpLedgerCents.checkpoint ?? 0), 0);
  for (const [label, value] of [["scan TOTAL DUE", fixtureDue], ["ERP 31 May close", erpDue], ["1 June anchors", checkpointDue]]) {
    if (value === TDL_CONTROL_CENTS) ok(`${label} = ${fmt(value)}`);
    else fail(`${label} ${fmt(value)} != printed control ${fmt(TDL_CONTROL_CENTS)}`);
  }

  const invalidLegacyAgingAnchors = comparisons.filter((r) =>
    r.erpLegacyFifoAgingCents.anchorCount !== 1);
  if (invalidLegacyAgingAnchors.length)
    fail(`${invalidLegacyAgingAnchors.length} printed debtor(s) do not have exactly one 1 January aging anchor`);
  else
    ok("all 150 legacy-aging simulations start from exactly one 1 January debtor anchor");
  const legacyFifoAgingNonExact = comparisons.filter((r) =>
    Object.values(r.legacyFifoAgingDiffCents).some((v) => v !== 0));
  if (legacyFifoAgingNonExact.length)
    fail(`${legacyFifoAgingNonExact.length} ERP FIFO aging row(s) differ from the scan`);
  else
    ok("all 150 scan aging rows exactly match the ERP signed-ledger FIFO aging (the V3 endpoint model)");

  // Full-population FIFO aging totals: the endpoint prints every active child,
  // so its aging buckets reconcile to TOTAL DUE exactly. The scan's printed
  // current-aging total omits the zero-close rows' current buckets and stays
  // informational only.
  const fifoAgingTotals = {
    ageCurrentCents: 0,
    age1mCents: 0,
    age2mCents: 0,
    age3mPlusCents: 0,
  };
  for (const aging of legacyFifoAgingByCustomer.values())
    for (const field of Object.keys(fifoAgingTotals))
      fifoAgingTotals[field] += aging[field];
  for (const [label, actual, expected] of [
    ["current", fifoAgingTotals.ageCurrentCents, TDL_FULL_POPULATION_AGING_EXPECTED_CENTS.ageCurrent],
    ["1 month", fifoAgingTotals.age1mCents, TDL_FULL_POPULATION_AGING_EXPECTED_CENTS.age1m],
    ["2 months", fifoAgingTotals.age2mCents, TDL_FULL_POPULATION_AGING_EXPECTED_CENTS.age2m],
    ["3 months+", fifoAgingTotals.age3mPlusCents, TDL_FULL_POPULATION_AGING_EXPECTED_CENTS.age3mPlus],
  ]) {
    if (actual === expected) ok(`full-population FIFO aging ${label} = ${fmt(actual)}`);
    else fail(`full-population FIFO aging ${label} ${fmt(actual)} != pinned ${fmt(expected)}`);
  }
  const fifoAgingGrandTotal = Object.values(fifoAgingTotals).reduce((s, v) => s + v, 0);
  if (fifoAgingGrandTotal === TDL_CONTROL_CENTS)
    ok(`full-population FIFO aging reconciles to TOTAL DUE ${fmt(TDL_CONTROL_CENTS)}`);
  else
    fail(`full-population FIFO aging total ${fmt(fifoAgingGrandTotal)} != TOTAL DUE ${fmt(TDL_CONTROL_CENTS)}`);
  note(`the printed CURRENT aging total ${fmt(TDL_PRINTED_TOTALS_CENTS.ageCurrent)} omits zero-close rows' current buckets; the full-population FIFO current is ${fmt(fifoAgingTotals.ageCurrentCents)}`);

  const creditorFile = path.join(dataDir, "trade_creditor_list_2026-05-31.csv");
  const creditorRows = parseCsv(fs.readFileSync(creditorFile, "utf8"));
  creditorRows.shift();
  if (creditorRows.length === TDL_EXPECTED_CREDITORS)
    note(`${creditorRows.length} creditor rows from page 1 remain informational (AP is outside V1 step 3)`);
  else
    fail(`creditor fixture has ${creditorRows.length} rows; expected ${TDL_EXPECTED_CREDITORS}`);

  const sumFields = (rows, fields) => Object.fromEntries(fields.map((field) => [
    field,
    rows.reduce((sum, r) => sum + r[field], 0),
  ]));
  const listedFields = ["balBfCents", "currentCents", "paymentCents", "totalDueCents",
    "ageCurrentCents", "age1mCents", "age2mCents", "age3mPlusCents"];
  const fixtureTotalsCents = sumFields(fixture, listedFields);
  const erpAllChildTotalsCents = {
    balBfCents: ledgerRows.reduce((sum, r) => sum + r.balBfCents, 0),
    legacySemanticCurrentCents: ledgerRows.reduce((sum, r) => sum + r.legacyCurrentCents, 0),
    legacySemanticPaymentCents: ledgerRows.reduce((sum, r) => sum + r.legacyPaymentCents, 0),
    currentReportRawDebitsCents: ledgerRows.reduce((sum, r) => sum + r.periodDebitsCents, 0),
    currentReportSignedCreditsCents: ledgerRows.reduce((sum, r) => sum - r.periodCreditsCents, 0),
    totalDueCents: ledgerRows.reduce((sum, r) => sum + r.closeCents, 0),
  };
  const erpOnlyZeroCloseTotalsCents = {
    balBfCents: erpOnlyActive.reduce((sum, r) => sum + r.balBfCents, 0),
    legacySemanticCurrentCents: erpOnlyActive.reduce((sum, r) => sum + r.legacyCurrentCents, 0),
    legacySemanticPaymentCents: erpOnlyActive.reduce((sum, r) => sum + r.legacyPaymentCents, 0),
    totalDueCents: erpOnlyActive.reduce((sum, r) => sum + r.closeCents, 0),
  };
  const fullPopulationChecks = [
    ["BAL B/F", erpAllChildTotalsCents.balBfCents, TDL_FULL_POPULATION_EXPECTED_CENTS.balBf],
    ["legacy-semantic CURRENT", erpAllChildTotalsCents.legacySemanticCurrentCents, TDL_FULL_POPULATION_EXPECTED_CENTS.legacySemanticCurrent],
    ["legacy-semantic PAYMENT", erpAllChildTotalsCents.legacySemanticPaymentCents, TDL_FULL_POPULATION_EXPECTED_CENTS.legacySemanticPayment],
    ["TOTAL DUE", erpAllChildTotalsCents.totalDueCents, TDL_FULL_POPULATION_EXPECTED_CENTS.totalDue],
  ];
  for (const [label, actual, expected] of fullPopulationChecks) {
    if (actual === expected) ok(`all-child ${label} = ${fmt(actual)}`);
    else fail(`all-child ${label} ${fmt(actual)} != pinned ${fmt(expected)}`);
  }
  note(`the printed CURRENT total ${fmt(TDL_PRINTED_TOTALS_CENTS.current)} is internally invalid; the 191-row legacy-semantic total is ${fmt(erpAllChildTotalsCents.legacySemanticCurrentCents)}`);

  console.log(`\nledger comparison: ${comparisons.length - structuralNonExact.length} exact, ${structuralNonExact.length} non-exact`);
  console.log(`ERP legacy-semantic column split: ${comparisons.length - columnNonExact.length} exact, ${columnNonExact.length} non-exact`);
  console.log(`ERP FIFO aging (the V3 endpoint model): ${comparisons.length - legacyFifoAgingNonExact.length} exact, ${legacyFifoAgingNonExact.length} non-exact`);

  const outFile = path.join(genDir, "tdl-comparison.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    period: { start: TDL_PERIOD_START, end: TDL_PERIOD_END, checkpoint: TDL_CHECKPOINT_DATE },
    agingRules: {
      current: "document month 2026-05 (after FIFO consumption)",
      oneMonth: "document month 2026-04",
      twoMonths: "document month 2026-03",
      threeMonthsPlus: "1 January opening anchor plus January/February document buckets",
      allocation: "signed 1 January debtor anchor plus monthly S/DN/RN/CN document buckets; REC/S cash collections normalize carried credits and consume positive buckets FIFO; excess payment becomes a credit in its document month. Identical for the legacy scan and the V3 ERP endpoint (computeLegacyFifoAging, src/routes/accounting/debtors.js)",
    },
    counts: {
      fixtureDebtors: fixture.length,
      mappedDebtors: comparisons.length,
      exactLedger: comparisons.length - structuralNonExact.length,
      nonExactLedger: structuralNonExact.length,
      exactColumnSplit: comparisons.length - columnNonExact.length,
      nonExactColumnSplit: columnNonExact.length,
      exactFifoAging: comparisons.length - legacyFifoAgingNonExact.length,
      nonExactFifoAging: legacyFifoAgingNonExact.length,
      erpOnlyZeroCloseActivity: erpOnlyActive.length - erpOnlyNonzeroClose.length,
      erpOnlyNonzeroClose: erpOnlyNonzeroClose.length,
      informationalCreditors: creditorRows.length,
    },
    controlCents: TDL_CONTROL_CENTS,
    legacyPrintedTotalsCents: TDL_PRINTED_TOTALS_CENTS,
    fixtureTotalsCents,
    erpAllChildTotalsCents,
    erpFullPopulationFifoAgingTotalsCents: fifoAgingTotals,
    erpOnlyZeroCloseTotalsCents,
    informationalCreditorFixture: {
      rows: creditorRows.length,
      comparedToDb: false,
      reason: "The PDF's bonus creditor page is outside Trade Debtor List V1 step 3 and remains file-arithmetic evidence only.",
    },
    missingCustomers,
    accountMappings,
    nameDifferences,
    nonExactLedger: structuralNonExact,
    nonExactColumnSplit: columnNonExact,
    nonExactFifoAging: legacyFifoAgingNonExact,
    exactLedgerAccountNos: comparisons.filter((r) => !structuralNonExact.includes(r)).map((r) => r.accountNo),
    exactFifoAgingAccountNos: comparisons.filter((r) => !legacyFifoAgingNonExact.includes(r)).map((r) => r.accountNo),
    erpOnlyZeroCloseActivity: erpOnlyActive.filter((r) => r.closeCents === 0),
    erpOnlyNonzeroClose,
  }, null, 2));
  ok(`wrote ${path.relative(process.cwd(), outFile)}`);
}

// ---- Stage: statements ------------------------------------------------------
// Scanned May BS / IS / CoGM note lines vs the three financial-report engines
// (GET /api/financial-reports/{balance-sheet,income-statement,cogm}/2026/5 in
// src/routes/accounting/financial-reports.js), reproduced query-for-query:
// the Balance Sheet reads anchored balances grouped by effective fs_note plus
// a synthetic Current Year Profit row; the Income Statement and CoGM add only
// exact fiscal-start 3-1/3-3/3-7 anchors to posted YTD movement. Since V3 all
// three engines also inject the exact-month closing_stock_values rows (keyed
// on the Material Stock page) at report level: BS 14-* assets, IS all three
// notes as negative cogs, CoGM 14-2/14-3 as negative materials.
const STMT_PERIOD_START = "2026-01-01";
const STMT_PERIOD_END = "2026-05-31";
const STMT_OPENING_NOTES = new Set(["3-1", "3-3", "3-7"]);
const STMT_CLOSING_NOTES = new Set(["14-1", "14-2", "14-3"]);
const STMT_SECTIONS = new Set(["balance_sheet", "income_statement", "cogm"]);
// Historical V1 stock decomposition and the V2 final-state targets.
const STMT_OS_OPENING_TOTAL_CENTS = 62687515;
const PRE_V2_STMT_CS_ANCHOR_TOTAL_CENTS = -82960522;
// The V3 closing-stock injection: exact-month closing_stock_values rows,
// pinned to the scanned May statement figures.
const STMT_EXPECTED_CLOSING_BY_NOTE_CENTS = {
  "14-1": 18897960,
  "14-2": 33690982,
  "14-3": 18219443,
};
const STMT_EXPECTED_CLOSINGS_CENTS = 70808385;
const STMT_EXPECTED_RAW_PACKING_CLOSINGS_CENTS = 51910425;
// The engine totals/net-assets pins below are the audited V3 final state
// (closing stock injected) shifted by exactly the approved GP-202604-0001
// drift (RM7,261.51 of April expense and trade payable keyed 20 Jul 2026,
// after the scans): profit/net assets = scan figure − drift.
const STMT_EXPECTED_NET_PROFIT_CENTS = 28482501 - GP_DRIFT_CENTS;
const STMT_EXPECTED_COGM_CENTS = 247903027;
const STMT_EXPECTED_NET_ASSETS_CENTS = 609769111 - GP_DRIFT_CENTS;
const STMT_EXPECTED_REVENUE_CENTS = 333464933;
const STMT_EXPECTED_COGS_CENTS = 237444387;
const STMT_EXPECTED_EXPENSE_CENTS = 67538045 + GP_DRIFT_CENTS;
// Statement note lines whose scan−ERP diff is exactly the GP-202604-0001
// drift: BS note 13 (CR TP) and IS note 5 (DR LGP).
const GP_DRIFT_NOTES = new Set(["bs:13", "is:5"]);
// The only non-exact compared lines after V3, keyed report:lineNo: the two
// GP-drift note lines plus the two profit cross-totals they flow into.
const STMT_EXPECTED_RESIDUAL_KEYS = new Set([
  "bs:11", "bs:23",
  "is:12", "is:20",
]);
// Category (c): accounts whose ERP fs_note differs from the printed TB APPX.
// Every nonzero non-stock difference must be named here; the complete set is
// fingerprint-pinned below. The printed statements are the 1:1 target (user
// decision §8-1), so these are candidate fs_note corrections for V2 sign-off.
const STMT_NOTE_MAPPING_REASONS = {
  CL_ABB: "Alliance Bank term-loan account with a debit balance: the printed TB files it under APPX 11 (TERM LOANS); the ERP fs_note is 10 (Other Creditors).",
  CL_AFI: "Allowance for impairment: the printed BS shows note 22 as gross trade debtors and nets the allowance inside APPX 8; the ERP nets it inside note 22.",
  CL_GF: "Green Family related-company DEBIT balance: printed under APPX 8 (other debtors); the ERP keeps it in note 10 (Other Creditors). Settles the old CL_GF classification question (plan §9).",
  CL_GT: "Green Target related-company DEBIT balance: printed under APPX 8 (other debtors); the ERP keeps it in note 10 (Other Creditors). Settles the old CL_GT classification question (plan §9).",
  OC_CMK: "Printed TB files this other-creditor debit balance under APPX 1 (ACCRUALS); the ERP fs_note is 10.",
  OC_MIL: "Printed TB files this other-creditor account under APPX 1 (ACCRUALS); the ERP fs_note is 10.",
};
const STMT_PAYROLL_SPLIT_REASON =
  "The printed TB assigns this payroll cost account to the factory/admin salary split (APPX 5-1 vs 5) differently from the ERP fs_note; the 25-account family nets to the 310,329.96 IS/CoGM salary difference.";
const STMT_PAYROLL_SPLIT_CODES = new Set([
  "BS_IL", "BS_SM", "MBE_IL", "MBE_M", "MBE_SM", "MBE_TS",
  "MBL_IL", "MBL_M", "MBL_SM", "MBL_TS", "MBS_ILO", "MBS_M",
  "MBS_SMO", "MBS_TS", "MBSC_IL", "MBSC_M", "MBSC_SM", "MBSC_TS",
  "MBSIP_IL", "MBSIP_M", "MBSIP_SM", "MBSIP_TS", "MBSM_K", "MS_IL", "MS_SM",
]);
// Historical V1 evidence: the complete 125-row actionable mapping set before
// the approved V2 correction. It is no longer the live mismatch expectation.
const PRE_V2_STMT_MAPPING_DIFF_FINGERPRINT =
  "c83f4ef40c85ea3716fdecdace37dbfffbc53f51d23d8b2da02fc006fd8d2088";

function loadStatementFixture(basename) {
  const file = path.join(dataDir, `${basename}_2026-05.csv`);
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const header = rows.shift().join(",");
  if (header !== "line_no,section,particular,note,amount_cents,is_subtotal")
    throw new Error(`${basename}_2026-05: unexpected header ${header}`);
  return rows.map((r) => ({
    lineNo: parseInt(r[0], 10),
    section: r[1],
    particular: r[2],
    note: r[3],
    amountCents: cents(r[4], `${basename} line ${r[0]}`) ?? 0,
    isSubtotal: r[5] === "true",
  }));
}

const STMT_EFFECTIVE_NOTES_CTES = `
    note_walk AS (
      SELECT code AS origin, parent_code, fs_note, 0 AS depth
      FROM account_codes
      UNION ALL
      SELECT w.origin, p.parent_code, p.fs_note, w.depth + 1
      FROM note_walk w
      JOIN account_codes p ON p.code = w.parent_code
      WHERE w.fs_note IS NULL
    ),
    effective_fs_notes AS (
      SELECT DISTINCT ON (origin) origin AS code, fs_note
      FROM note_walk
      WHERE fs_note IS NOT NULL
      ORDER BY origin, depth
    )`;
const STMT_ANCHORED_BALANCES_CTES = `
    latest_anchors AS (
      SELECT DISTINCT ON (aob.account_code)
        aob.account_code, aob.as_of_date, aob.amount
      FROM account_opening_balances aob
      WHERE aob.as_of_date <= DATE '${STMT_PERIOD_END}'
      ORDER BY aob.account_code, aob.as_of_date DESC
    ),
    account_periods AS (
      SELECT ac.code,
             la.as_of_date AS anchor_date, la.amount AS anchor_amount,
             COALESCE(la.as_of_date, DATE '${STMT_PERIOD_START}') AS movement_start
      FROM account_codes ac
      LEFT JOIN latest_anchors la ON la.account_code = ac.code
      WHERE ac.is_active = true
    ),
    account_movements AS (
      SELECT ap.code,
             SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) AS net
      FROM account_periods ap
      JOIN journal_entry_lines jel ON jel.account_code = ap.code
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.status = 'posted'
        AND je.entry_date >= ap.movement_start
        AND je.entry_date <= DATE '${STMT_PERIOD_END}'
      GROUP BY ap.code
    ),
    account_balances AS (
      SELECT ap.code,
             COALESCE(ap.anchor_amount, 0) + COALESCE(am.net, 0) AS net
      FROM account_periods ap
      LEFT JOIN account_movements am ON am.code = ap.code
      WHERE ap.anchor_date IS NOT NULL OR am.code IS NOT NULL
    )`;

function stmtNotesMetadata() {
  return new Map(
    query(`SELECT code, name, category, report_section, normal_balance, is_active
           FROM financial_statement_notes`)
      .map((r) => [r.code, {
        name: r.name,
        category: r.category,
        section: r.report_section === "" ? null : r.report_section,
        normalBalance: r.normal_balance,
        active: r.is_active === "t",
      }])
  );
}

// The balance-sheet engine's per-note output (anchored balances, sign per the
// note's normal balance), for every active balance_sheet note.
function stmtErpBalanceSheetNotes() {
  const sql = `
    WITH RECURSIVE ${STMT_EFFECTIVE_NOTES_CTES},
    ${STMT_ANCHORED_BALANCES_CTES},
    statement_balances AS (
      SELECT efn.fs_note, SUM(ab.net) AS net
      FROM account_balances ab
      JOIN effective_fs_notes efn ON efn.code = ab.code
      GROUP BY efn.fs_note
    )
    SELECT fsn.code, fsn.category,
           ROUND((CASE WHEN fsn.normal_balance = 'credit' THEN -COALESCE(sb.net, 0)
                       ELSE COALESCE(sb.net, 0) END) * 100)::bigint AS balance_cents
    FROM financial_statement_notes fsn
    LEFT JOIN statement_balances sb ON sb.fs_note = fsn.code
    WHERE fsn.report_section = 'balance_sheet' AND fsn.is_active = true`;
  return new Map(query(sql).map((r) => [r.code, {
    category: r.category,
    balanceCents: parseInt(r.balance_cents, 10),
  }]));
}

// The income-statement/CoGM engines' per-note output: posted YTD movement plus
// only exact fiscal-start anchors for the approved 3-1/3-3/3-7 opening notes.
function stmtErpPnlNotes() {
  const sql = `
    WITH RECURSIVE ${STMT_EFFECTIVE_NOTES_CTES},
    period_movements AS (
      SELECT efn.fs_note,
             SUM(COALESCE(jel.debit_amount, 0)
               - COALESCE(jel.credit_amount, 0)) AS net
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      JOIN effective_fs_notes efn ON jel.account_code = efn.code
      WHERE je.status = 'posted'
        AND je.entry_date BETWEEN DATE '${STMT_PERIOD_START}' AND DATE '${STMT_PERIOD_END}'
      GROUP BY efn.fs_note
    ), fiscal_start_opening_stock AS (
      SELECT efn.fs_note, SUM(aob.amount) AS net
      FROM account_opening_balances aob
      JOIN effective_fs_notes efn ON efn.code = aob.account_code
      WHERE aob.as_of_date = DATE '${STMT_PERIOD_START}'
        AND efn.fs_note IN ('3-1', '3-3', '3-7')
      GROUP BY efn.fs_note
    )
    SELECT fsn.code, fsn.category, fsn.report_section,
           ROUND((CASE WHEN fsn.normal_balance = 'debit'
                        THEN COALESCE(pm.net, 0) + COALESCE(os.net, 0)
                        ELSE -(COALESCE(pm.net, 0) + COALESCE(os.net, 0))
                   END) * 100)::bigint AS balance_cents
    FROM financial_statement_notes fsn
    LEFT JOIN period_movements pm ON fsn.code = pm.fs_note
    LEFT JOIN fiscal_start_opening_stock os ON fsn.code = os.fs_note
    WHERE fsn.report_section IN ('income_statement', 'cogm') AND fsn.is_active = true`;
  return new Map(query(sql).map((r) => [r.code, {
    category: r.category,
    section: r.report_section,
    balanceCents: parseInt(r.balance_cents, 10),
  }]));
}

// Every account in the balance-sheet population (anchor or movement) with its
// anchor/movement split and note resolution — the audit surface for leaks and
// the closing-stock note contributors.
function stmtErpAccountRows() {
  const sql = `
    WITH RECURSIVE ${STMT_EFFECTIVE_NOTES_CTES},
    ${STMT_ANCHORED_BALANCES_CTES}
    SELECT ap.code, ac.description, ac.ledger_type,
           COALESCE(efn.fs_note, '') AS effective_note,
           COALESCE(fsn.report_section, '') AS note_section,
           COALESCE(fsn.is_active::text, '') AS note_active,
           ROUND(COALESCE(ap.anchor_amount, 0) * 100)::bigint AS anchor_cents,
           ROUND(COALESCE(am.net, 0) * 100)::bigint AS movement_cents,
           ROUND((COALESCE(ap.anchor_amount, 0) + COALESCE(am.net, 0)) * 100)::bigint AS balance_cents
    FROM account_periods ap
    JOIN account_codes ac ON ac.code = ap.code
    LEFT JOIN account_movements am ON am.code = ap.code
    LEFT JOIN effective_fs_notes efn ON efn.code = ap.code
    LEFT JOIN financial_statement_notes fsn ON fsn.code = efn.fs_note
    WHERE ap.anchor_date IS NOT NULL OR am.code IS NOT NULL`;
  return query(sql).map((r) => ({
    code: r.code,
    description: r.description,
    ledgerType: r.ledger_type,
    effectiveNote: r.effective_note === "" ? null : r.effective_note,
    noteSection: r.note_section === "" ? null : r.note_section,
    noteActive: r.note_active === "true",
    anchorCents: parseInt(r.anchor_cents, 10),
    movementCents: parseInt(r.movement_cents, 10),
    balanceCents: parseInt(r.balance_cents, 10),
  }));
}

// Effective fs_note for EVERY account (including zero/absent balances) — the
// scan-APPX vs ERP-note audit surface.
function stmtErpEffectiveNoteByCode() {
  const sql = `
    WITH RECURSIVE ${STMT_EFFECTIVE_NOTES_CTES}
    SELECT ac.code, COALESCE(efn.fs_note, '') AS effective_note
    FROM account_codes ac
    LEFT JOIN effective_fs_notes efn ON efn.code = ac.code`;
  return new Map(query(sql).map((r) => [
    r.code,
    r.effective_note === "" ? null : r.effective_note,
  ]));
}

// The V3 report-level injection: exact-month closing_stock_values rows keyed
// on the Material Stock page (mirrors getClosingStockValues in
// src/routes/accounting/financial-reports.js).
function stmtClosingStockValues() {
  const sql = `
    SELECT fs_note, ROUND(amount * 100)::bigint AS amount_cents
      FROM closing_stock_values
     WHERE year = 2026 AND month = 5`;
  return new Map(query(sql).map((r) => [r.fs_note, parseInt(r.amount_cents, 10)]));
}

function stageStatements() {
  console.log("\n=== stage statements: scanned May BS / IS / CoGM vs the ERP report engines ===");
  if (STMT_OS_OPENING_TOTAL_CENTS - PRE_V2_STMT_CS_ANCHOR_TOTAL_CENTS !== PRE_V2_RESIDUE_CENTS)
    fail("static: the approved V2 stock correction no longer equals the historical V1 residue");

  const bs = loadStatementFixture("bs");
  const isf = loadStatementFixture("is");
  const cogmf = loadStatementFixture("cogm");
  if (bs.length === 24 && isf.length === 20 && cogmf.length === 14)
    ok("loaded 24 BS / 20 IS / 14 CoGM fixture lines");
  else
    fail(`fixture line counts ${bs.length}/${isf.length}/${cogmf.length} != pinned 24/20/14`);

  const { tb, mappings } = computeMapping();
  const v2OpeningAnchors = verifyV2OpeningAnchorState();

  // Scan-side TB rollup by printed APPX (May), raw debit-minus-credit cents.
  const scanAppxNetCents = new Map();
  for (const row of tb["05"].values()) {
    const appx = (row.appx ?? "").trim();
    if (!appx) continue;
    scanAppxNetCents.set(appx, (scanAppxNetCents.get(appx) ?? 0) + row.net);
  }

  const notesMeta = stmtNotesMetadata();
  const erpBs = stmtErpBalanceSheetNotes();
  const erpPnl = stmtErpPnlNotes();
  const erpAccountRows = stmtErpAccountRows();
  const effectiveNoteByCode = stmtErpEffectiveNoteByCode();
  ok(`loaded ${notesMeta.size} fs notes, ${erpBs.size} BS notes, ${erpPnl.size} P&L notes, ${erpAccountRows.length} ERP balance rows`);

  // V3 closing stock: the keyed May values must equal the scanned statement
  // figures, then enter the reproductions exactly as the engines inject them —
  // BS 14-* note balances, IS all three as negative cogs, CoGM 14-2/14-3.
  const closingStock = stmtClosingStockValues();
  {
    const closingStartFailures = failures;
    for (const noteCode of STMT_CLOSING_NOTES) {
      const keyed = closingStock.get(noteCode) ?? null;
      const expected = STMT_EXPECTED_CLOSING_BY_NOTE_CENTS[noteCode];
      if (keyed !== expected)
        fail(`closing_stock_values 2026-05 ${noteCode} ${keyed === null ? "missing" : fmt(keyed)} != pinned ${fmt(expected)}`);
    }
    const keyedTotal = [...STMT_CLOSING_NOTES].reduce((sum, n) => sum + (closingStock.get(n) ?? 0), 0);
    if (keyedTotal !== STMT_EXPECTED_CLOSINGS_CENTS)
      fail(`keyed May closing stock total ${fmt(keyedTotal)} != ${fmt(STMT_EXPECTED_CLOSINGS_CENTS)}`);
    if (failures === closingStartFailures)
      ok(`closing_stock_values 2026-05 = the scanned figures (${fmt(STMT_EXPECTED_CLOSINGS_CENTS)} across 14-1/14-2/14-3)`);
  }
  // BS engine injection: keyed amounts land on the (GL-zero) 14-* note items.
  for (const noteCode of STMT_CLOSING_NOTES) {
    const n = erpBs.get(noteCode);
    if (!n) {
      fail(`BS engine does not serve closing-stock note ${noteCode}`);
      continue;
    }
    n.balanceCents += closingStock.get(noteCode) ?? 0;
  }

  // Statement sign convention (both engines): credit-normal notes flip net.
  const statementSign = (noteCode, netCents) =>
    notesMeta.get(noteCode)?.normalBalance === "credit" ? -netCents : netCents;

  // --- Note metadata gates: every printed note is live, and the six stock
  // notes retain the exact V2 section/category/normal-balance contract. ---
  const fixtureNoteCodes = new Set();
  for (const line of [...bs, ...isf, ...cogmf])
    if (line.note && line.note !== "DN" && line.note !== "CH")
      fixtureNoteCodes.add(line.note);
  for (const noteCode of [...fixtureNoteCodes].sort()) {
    const meta = notesMeta.get(noteCode);
    if (!meta) fail(`fixture note ${noteCode} is missing from financial_statement_notes`);
    else if (!meta.active) fail(`fixture note ${noteCode} is inactive in financial_statement_notes`);
  }
  for (const noteCode of [...STMT_OPENING_NOTES, ...STMT_CLOSING_NOTES])
    if (!fixtureNoteCodes.has(noteCode))
      fail(`stock note ${noteCode} unexpectedly absent from the statement fixtures`);
  const expectedStockMetadata = {
    "3-1": { category: "cogs", section: "income_statement", normalBalance: "debit", active: true },
    "3-3": { category: "cogs", section: "cogm", normalBalance: "debit", active: true },
    "3-7": { category: "cogs", section: "cogm", normalBalance: "debit", active: true },
    "14-1": { category: "asset", section: "balance_sheet", normalBalance: "debit", active: true },
    "14-2": { category: "asset", section: "balance_sheet", normalBalance: "debit", active: true },
    "14-3": { category: "asset", section: "balance_sheet", normalBalance: "debit", active: true },
  };
  const metadataStartFailures = failures;
  for (const [noteCode, expected] of Object.entries(expectedStockMetadata)) {
    const actual = notesMeta.get(noteCode);
    for (const [field, value] of Object.entries(expected))
      if (actual?.[field] !== value)
        fail(`stock note ${noteCode} ${field} ${actual?.[field] ?? "missing"} != ${value}`);
  }
  if (failures === metadataStartFailures)
    ok("stock-note metadata is exact: 3-1 IS; 3-3/3-7 CoGM; 14-* Balance Sheet");
  // Every nonzero printed-TB APPX group must be a real note code, else the
  // scan-side backing sums below would silently drop value.
  for (const [appx, net] of scanAppxNetCents)
    if (net !== 0 && !notesMeta.has(appx))
      fail(`printed TB APPX "${appx}" carries ${fmt(net)} but is not a known fs note`);

  // --- Stock families, defined by the printed APPX (not by code prefix:
  // e.g. CS_SD is a trade creditor, not closing stock) ---
  const csFamily = [];
  const osFamily = [];
  for (const m of mappings) {
    const mayRow = tb["05"].get(m.printed);
    const appx = (mayRow.appx ?? "").trim();
    if (STMT_CLOSING_NOTES.has(appx))
      csFamily.push({ printed: m.printed, erpCode: m.erpCode, appx });
    else if (STMT_OPENING_NOTES.has(appx))
      osFamily.push({ printed: m.printed, erpCode: m.erpCode, appx, netCents: mayRow.net });
  }
  for (const f of csFamily)
    for (const mm of TB_MONTHS)
      if ((tb[mm].get(f.printed)?.net ?? 0) !== 0)
        fail(`${f.printed}: printed closing-stock TB row is nonzero in month ${mm}`);
  for (const f of osFamily)
    for (const mm of TB_MONTHS)
      if ((tb[mm].get(f.printed)?.net ?? 0) !== f.netCents)
        fail(`${f.printed}: printed opening-inventory TB balance varies across months`);

  const osScanByNote = { "3-1": 0, "3-3": 0, "3-7": 0 };
  for (const f of osFamily) osScanByNote[f.appx] += f.netCents;
  const osScanTotal = Object.values(osScanByNote).reduce((s, v) => s + v, 0);
  if (osScanTotal === STMT_OS_OPENING_TOTAL_CENTS)
    ok(`printed OS openings total ${fmt(osScanTotal)} across ${osFamily.length} TB rows (${csFamily.length} closing-stock rows all print .00)`);
  else
    fail(`printed OS openings total ${fmt(osScanTotal)} != pinned ${fmt(STMT_OS_OPENING_TOTAL_CENTS)}`);

  // ERP stock state after V2: the 63 retained CS anchors are explicit zero;
  // the 62 inserted OS anchors equal the scans; neither family has movement.
  const csByErpCode = new Map(csFamily.map((f) => [f.erpCode, f]));
  const osTargetByCode = new Map(v2OpeningAnchors.osTargets.map((f) => [f.code, f]));
  const erpRowByCode = new Map(erpAccountRows.map((r) => [r.code, r]));
  const csAnchorByNote = new Map();
  let csAnchorTotal = 0;
  const stockAppxVsNoteMismatches = [];
  for (const code of [...V2_EXPECTED_CS_CODES].sort()) {
    const row = erpRowByCode.get(code);
    const scanAppx = csByErpCode.get(code)?.appx ?? null;
    if (!row) {
      fail(`${code}: explicit V2 CS zero anchor is absent from the ERP balance population`);
      continue;
    }
    if (row.anchorCents !== 0 || row.movementCents !== 0 || row.balanceCents !== 0)
      fail(`${code}: expected zero anchor/movement/balance, got ${fmt(row.anchorCents)} / ${fmt(row.movementCents)} / ${fmt(row.balanceCents)}`);
    if (scanAppx !== row.effectiveNote)
      stockAppxVsNoteMismatches.push({
        code, scanAppx, erpNote: row.effectiveNote, anchorCents: row.anchorCents,
      });
    csAnchorTotal += row.anchorCents;
    if (row.effectiveNote)
      csAnchorByNote.set(row.effectiveNote, (csAnchorByNote.get(row.effectiveNote) ?? 0) + row.anchorCents);
  }
  for (const [code, target] of osTargetByCode) {
    const row = erpRowByCode.get(code);
    if (!row) {
      fail(`${code}: inserted V2 OS anchor is absent from the ERP balance population`);
      continue;
    }
    if (row.anchorCents !== target.expectedCents
      || row.movementCents !== 0
      || row.balanceCents !== target.expectedCents) {
      fail(`${code}: OS anchor/movement/balance ${fmt(row.anchorCents)} / ${fmt(row.movementCents)} / ${fmt(row.balanceCents)} != ${fmt(target.expectedCents)} / 0.00 / ${fmt(target.expectedCents)}`);
    }
  }
  const nonzeroClosingContributors = erpAccountRows.filter((r) =>
    STMT_CLOSING_NOTES.has(r.effectiveNote)
      && (r.anchorCents !== 0 || r.movementCents !== 0 || r.balanceCents !== 0));
  if (nonzeroClosingContributors.length !== 0)
    fail(`${nonzeroClosingContributors.length} account(s) still contribute a nonzero value to a 14-* closing-stock note`);
  if (csAnchorTotal === 0 && nonzeroClosingContributors.length === 0)
    ok("all 63 CS anchors are explicit zero; the GL closing-stock notes stay zero (V3 injects at report level only)");

  // --- Scan-APPX vs ERP effective-note audit across the whole mapped chart.
  // Gate the complete approved target set explicitly: after CS anchors become
  // zero, a nonzero-only audit could otherwise hide a missing stock mapping. ---
  const nonStockTargetCodes = new Set([
    ...Object.keys(STMT_NOTE_MAPPING_REASONS),
    ...STMT_PAYROLL_SPLIT_CODES,
  ]);
  const stockTargetCodes = new Set(v2OpeningAnchors.correctionCodes);
  const allV2TargetCodes = new Set([...stockTargetCodes, ...nonStockTargetCodes]);
  if (stockTargetCodes.size !== 125 || nonStockTargetCodes.size !== 31 || allV2TargetCodes.size !== 156)
    fail(`V2 mapping target shape ${stockTargetCodes.size} stock / ${nonStockTargetCodes.size} non-stock / ${allV2TargetCodes.size} union != 125/31/156`);
  const mappingByErpCode = new Map(mappings.map((m) => [m.erpCode, m]));
  const targetMappingMismatches = [];
  for (const code of [...allV2TargetCodes].sort()) {
    const mapping = mappingByErpCode.get(code);
    const scanAppx = mapping ? (tb["05"].get(mapping.printed)?.appx ?? "").trim() || null : null;
    const erpNote = effectiveNoteByCode.get(code) ?? null;
    if (!mapping || scanAppx === null || erpNote !== scanAppx)
      targetMappingMismatches.push({ code, scanAppx, erpNote });
  }
  if (targetMappingMismatches.length === 0)
    ok("all 156 approved V2 accounts resolve to their exact printed APPX notes");
  else
    fail(`${targetMappingMismatches.length} approved V2 account(s) do not resolve to their printed APPX note`);

  const appxAudit = [];
  for (const m of mappings) {
    const mayRow = tb["05"].get(m.printed);
    const scanAppx = (mayRow.appx ?? "").trim() || null;
    const erpNote = effectiveNoteByCode.get(m.erpCode) ?? null;
    if (scanAppx === erpNote) continue;
    appxAudit.push({
      printed: m.printed,
      erpCode: m.erpCode,
      scanAppx,
      erpEffectiveNote: erpNote,
      scanMayCents: mayRow.net,
      erpNetCents: erpRowByCode.get(m.erpCode)?.balanceCents ?? 0,
    });
  }
  const isStockNote = (n) => n !== null && (STMT_OPENING_NOTES.has(n) || STMT_CLOSING_NOTES.has(n));
  const nonzeroMismatches = appxAudit.filter((r) => r.scanMayCents !== 0 || r.erpNetCents !== 0);
  const stockSplitMismatches = appxAudit.filter((r) =>
    stockTargetCodes.has(r.erpCode)
      || (isStockNote(r.scanAppx) && isStockNote(r.erpEffectiveNote)
        && (r.scanMayCents !== 0 || r.erpNetCents !== 0)));
  const namedMoves = appxAudit.filter((r) => nonStockTargetCodes.has(r.erpCode));
  const canonicalMismatches = nonzeroMismatches
    .map((r) => ({ erpCode: r.erpCode, scanAppx: r.scanAppx, erpNote: r.erpEffectiveNote, netCents: r.erpNetCents, scanCents: r.scanMayCents }))
    .sort((a, b) => (a.erpCode < b.erpCode ? -1 : a.erpCode > b.erpCode ? 1 : 0));
  const mappingDiffFingerprint = createHash("sha256")
    .update(JSON.stringify(canonicalMismatches))
    .digest("hex");

  // --- Engine totals (the IS endpoint's category math; the BS engine's
  // synthetic Current Year Profit row computes the identical figure) ---
  let erpRevenueTotal = 0, erpExpenseTotal = 0, erpCogsTotal = 0, erpCogmTotal = 0;
  for (const n of erpPnl.values()) {
    if (n.category === "revenue") erpRevenueTotal += n.balanceCents;
    else if (n.category === "expense") erpExpenseTotal += n.balanceCents;
    else if (n.category === "cogs") erpCogsTotal += n.balanceCents;
    if (n.section === "cogm") erpCogmTotal += n.balanceCents;
  }
  // V3 injection: the IS engine pushes all three closing notes as negative
  // cogs items; the CoGM engine pushes 14-2/14-3 as negative materials.
  const closingTotalCents = [...STMT_CLOSING_NOTES]
    .reduce((sum, n) => sum + (closingStock.get(n) ?? 0), 0);
  const closingRawPackingCents = (closingStock.get("14-2") ?? 0) + (closingStock.get("14-3") ?? 0);
  if (closingRawPackingCents !== STMT_EXPECTED_RAW_PACKING_CLOSINGS_CENTS)
    fail(`keyed raw+packing closing ${fmt(closingRawPackingCents)} != pinned ${fmt(STMT_EXPECTED_RAW_PACKING_CLOSINGS_CENTS)}`);
  erpCogsTotal -= closingTotalCents;
  erpCogmTotal -= closingRawPackingCents;
  const erpNetProfitCents = erpRevenueTotal - erpCogsTotal - erpExpenseTotal;
  const engineTotalStartFailures = failures;
  const expectedEngineTotals = {
    revenue: STMT_EXPECTED_REVENUE_CENTS,
    cogs: STMT_EXPECTED_COGS_CENTS,
    expenses: STMT_EXPECTED_EXPENSE_CENTS,
    netProfit: STMT_EXPECTED_NET_PROFIT_CENTS,
    cogm: STMT_EXPECTED_COGM_CENTS,
  };
  const actualEngineTotals = {
    revenue: erpRevenueTotal,
    cogs: erpCogsTotal,
    expenses: erpExpenseTotal,
    netProfit: erpNetProfitCents,
    cogm: erpCogmTotal,
  };
  for (const [field, expected] of Object.entries(expectedEngineTotals))
    if (actualEngineTotals[field] !== expected)
      fail(`V3 ${field} ${fmt(actualEngineTotals[field])} != ${fmt(expected)}`);
  if (failures === engineTotalStartFailures)
    ok("V3 report totals are exact: profit 277,563.50 and CoGM 2,479,030.27 (closing stock injected; profit includes the named GP-202604-0001 drift)");

  // --- Per-line comparisons ---
  const lineComparisons = [];
  const noteDiagnostics = (noteCode) => ({
    scanTbRows: [...tb["05"].entries()]
      .filter(([, r]) => (r.appx ?? "").trim() === noteCode && r.net !== 0)
      .map(([printed, r]) => ({ printed, netCents: r.net })),
    erpAccounts: erpAccountRows
      .filter((r) => r.effectiveNote === noteCode && r.balanceCents !== 0)
      .map((r) => ({ code: r.code, balanceCents: r.balanceCents })),
  });
  const pushLine = (report, line, erpCents, classification, attribution) => {
    const row = {
      report,
      lineNo: line.lineNo,
      particular: line.particular,
      note: line.note || null,
      scanCents: line.amountCents,
      erpCents,
      diffCents: erpCents === null ? null : line.amountCents - erpCents,
      classification,
      ...(attribution ? { attribution } : {}),
    };
    if (classification === "unexplained") {
      fail(`${report.toUpperCase()} line ${line.lineNo} "${line.particular}" (note ${line.note}): scan ${fmt(line.amountCents)} != ERP ${fmt(erpCents)}`);
      if (line.note) row.diagnostics = noteDiagnostics(line.note);
    }
    lineComparisons.push(row);
    return row;
  };
  // Every compared line must be exact after V3. The only tolerated
  // differences carry the named GP-202604-0001 drift: the two note lines in
  // GP_DRIFT_NOTES, and the two profit cross-totals the drift flows into.
  const compareNoteLine = (report, line, erpCents) => {
    if (line.amountCents === erpCents)
      return pushLine(report, line, erpCents, "exact");
    if (GP_DRIFT_NOTES.has(`${report}:${line.note}`)
      && line.amountCents - erpCents === -GP_DRIFT_CENTS)
      return pushLine(report, line, erpCents, "post_scan_gp_drift", GP_DRIFT_ATTRIBUTION);
    return pushLine(report, line, erpCents, "unexplained");
  };
  // Profit cross-totals: the scans predate GP-202604-0001, so scan − ERP is
  // exactly +GP_DRIFT_CENTS (the drift expense sits in ERP profit only).
  const compareCrossTotalLine = (report, line, erpCents) => {
    if (line.amountCents === erpCents)
      return pushLine(report, line, erpCents, "exact");
    if (line.amountCents - erpCents === GP_DRIFT_CENTS)
      return pushLine(report, line, erpCents, "post_scan_gp_drift", GP_DRIFT_ATTRIBUTION);
    return pushLine(report, line, erpCents, "unexplained");
  };

  // Balance Sheet
  for (const line of bs) {
    if (line.note === "DN") {
      compareCrossTotalLine("bs", line, erpNetProfitCents);
      continue;
    }
    if (line.isSubtotal || !line.note) continue;
    const erp = erpBs.get(line.note);
    if (!erp) {
      fail(`BS note ${line.note} is not served by the balance-sheet engine`);
      continue;
    }
    if (STMT_CLOSING_NOTES.has(line.note)) {
      // The GL 14-* notes stay zero (63 explicit-zero CS anchors); the keyed
      // value enters only through the report-level injection above, so the
      // line itself must now be exact.
      const anchored = csAnchorByNote.get(line.note) ?? 0;
      if (anchored !== 0)
        fail(`BS note ${line.note}: GL closing-stock anchor ${fmt(anchored)} != 0.00 (injection is report-level only)`);
      compareNoteLine("bs", line, erp.balanceCents);
      continue;
    }
    compareNoteLine("bs", line, erp.balanceCents);
  }

  // Income Statement
  let isProfitLine = null;
  for (const line of isf) {
    if (line.note === "CH") {
      compareNoteLine("is", line, erpCogmTotal);
      continue;
    }
    if (line.isSubtotal) {
      if (line.particular === "PROFIT FOR THE FINANCIAL YEAR") {
        isProfitLine = compareCrossTotalLine("is", line, erpNetProfitCents);
      }
      continue;
    }
    if (!line.note) continue;
    if (STMT_OPENING_NOTES.has(line.note)) {
      const erpCents = erpPnl.get(line.note)?.balanceCents ?? 0;
      if (line.note !== "3-1")
        fail(`IS unexpectedly renders opening-stock note ${line.note}; only 3-1 belongs here`);
      compareNoteLine("is", line, erpCents);
      continue;
    }
    if (STMT_CLOSING_NOTES.has(line.note)) {
      if (erpPnl.has(line.note))
        fail(`closing-stock note ${line.note} is unexpectedly served by the P&L engines`);
      // The fixture stores the printed LESS magnitude (positive); the engine
      // renders the keyed value negated. The parity quantity is the keyed
      // month-end value itself.
      compareNoteLine("is", line, closingStock.get(line.note) ?? 0);
      continue;
    }
    const erp = erpPnl.get(line.note);
    if (!erp) {
      fail(`IS note ${line.note} is not served by the income-statement engine`);
      continue;
    }
    compareNoteLine("is", line, erp.balanceCents);
  }

  // CoGM
  let cogmTotalLine = null;
  for (const line of cogmf) {
    if (line.isSubtotal) {
      if (line.particular === "TOTAL COST OF GOODS MANUFACTURED") {
        cogmTotalLine = compareNoteLine("cogm", line, erpCogmTotal);
      }
      continue;
    }
    if (!line.note) continue;
    if (STMT_OPENING_NOTES.has(line.note)) {
      const erpCents = erpPnl.get(line.note)?.balanceCents ?? 0;
      if (line.note !== "3-3" && line.note !== "3-7")
        fail(`CoGM unexpectedly renders opening-stock note ${line.note}; only 3-3/3-7 belong here`);
      compareNoteLine("cogm", line, erpCents);
      continue;
    }
    if (STMT_CLOSING_NOTES.has(line.note)) {
      if (erpPnl.has(line.note))
        fail(`closing-stock note ${line.note} is unexpectedly served by the P&L engines`);
      // Same printed-LESS convention as the IS: compare against the keyed
      // month-end value.
      compareNoteLine("cogm", line, closingStock.get(line.note) ?? 0);
      continue;
    }
    const erp = erpPnl.get(line.note);
    if (!erp) {
      fail(`CoGM note ${line.note} is not served by the CoGM engine`);
      continue;
    }
    compareNoteLine("cogm", line, erp.balanceCents);
  }

  // --- Fixture-derived stock identities ---
  const fx = (rows, noteCode) => rows.find((l) => !l.isSubtotal && l.note === noteCode)?.amountCents ?? 0;
  const openingsTotal = fx(isf, "3-1") + fx(cogmf, "3-3") + fx(cogmf, "3-7");
  const closingsTotal = fx(bs, "14-1") + fx(bs, "14-2") + fx(bs, "14-3");
  if (fx(bs, "14-1") !== fx(isf, "14-1") || fx(bs, "14-2") !== fx(cogmf, "14-2") || fx(bs, "14-3") !== fx(cogmf, "14-3"))
    fail("closing inventories disagree across BS/IS/CoGM fixtures (V0 tie broken)");
  if (openingsTotal !== STMT_OS_OPENING_TOTAL_CENTS)
    fail(`statement opening inventories ${fmt(openingsTotal)} != pinned OS total ${fmt(STMT_OS_OPENING_TOTAL_CENTS)}`);
  if (closingsTotal !== STMT_EXPECTED_CLOSINGS_CENTS)
    fail(`statement closing inventories ${fmt(closingsTotal)} != pinned ${fmt(STMT_EXPECTED_CLOSINGS_CENTS)}`);
  for (const noteCode of STMT_CLOSING_NOTES)
    if ((closingStock.get(noteCode) ?? 0) !== fx(bs, noteCode))
      fail(`keyed closing stock ${noteCode} ${fmt(closingStock.get(noteCode) ?? 0)} != scanned BS line ${fmt(fx(bs, noteCode))}`);
  for (const [noteCode, scanCents] of Object.entries(osScanByNote)) {
    const stmtCents = noteCode === "3-1" ? fx(isf, "3-1") : fx(cogmf, noteCode);
    if (scanCents !== stmtCents)
      fail(`printed TB OS APPX ${noteCode} total ${fmt(scanCents)} != statement line ${fmt(stmtCents)}`);
  }

  const scanProfit = bs.find((l) => l.note === "DN")?.amountCents ?? 0;
  if (isProfitLine === null || scanProfit !== isProfitLine.scanCents)
    fail("BS profit line and IS profit line disagree (V0 tie broken)");
  const profitDiff = scanProfit - erpNetProfitCents;
  if (profitDiff === GP_DRIFT_CENTS)
    ok(`profit: scan ${fmt(scanProfit)} − ERP ${fmt(erpNetProfitCents)} = ${fmt(profitDiff)} = the named GP-202604-0001 drift exactly`);
  else
    fail(`profit difference ${fmt(profitDiff)} != GP drift ${fmt(GP_DRIFT_CENTS)}`);

  // After V3 the raw/packing closing-stock deductions are injected into the
  // CoGM engine, so the total is exact.
  if (cogmTotalLine === null) fail("CoGM total line not found");
  else if (cogmTotalLine.diffCents === 0)
    ok(`CoGM: scan = ERP = ${fmt(erpCogmTotal)} (raw/packing closings injected)`);
  else
    fail(`CoGM total difference ${fmt(cogmTotalLine?.diffCents ?? 0)} != 0.00`);
  const chLine = lineComparisons.find((l) => l.report === "is" && l.note === "CH");
  if (!chLine || !cogmTotalLine || chLine.scanCents !== cogmTotalLine.scanCents)
    fail("IS CoGM cross-reference line != CoGM statement total (V0 tie broken)");

  // --- ERP-only nonzero notes (nothing the engines serve may be missing from
  // the scans) ---
  const bsFixtureNotes = new Set(bs.filter((l) => !l.isSubtotal && l.note && l.note !== "DN").map((l) => l.note));
  const isFixtureNotes = new Set(isf.filter((l) => !l.isSubtotal && l.note && l.note !== "CH").map((l) => l.note));
  const cogmFixtureNotes = new Set(cogmf.filter((l) => !l.isSubtotal && l.note).map((l) => l.note));
  for (const [noteCode, n] of erpBs)
    if (n.balanceCents !== 0 && !bsFixtureNotes.has(noteCode))
      fail(`ERP balance-sheet note ${noteCode} carries ${fmt(n.balanceCents)} but is not printed on the scan BS`);
  for (const [noteCode, n] of erpPnl) {
    if (n.balanceCents === 0) continue;
    if (n.section === "income_statement" && !isFixtureNotes.has(noteCode))
      fail(`ERP income-statement note ${noteCode} carries ${fmt(n.balanceCents)} but is not printed on the scan IS`);
    if (n.section === "cogm" && !cogmFixtureNotes.has(noteCode))
      fail(`ERP CoGM note ${noteCode} carries ${fmt(n.balanceCents)} but is not printed on the scan CoGM`);
  }

  // --- Leak audit: every nonzero 31-May balance must reach the statements
  // through an active note in one of the three report sections ---
  const leaks = erpAccountRows.filter((r) => r.balanceCents !== 0
    && (!r.effectiveNote || !r.noteActive || !STMT_SECTIONS.has(r.noteSection)));
  if (leaks.length) {
    fail(`${leaks.length} nonzero-balance account(s) are invisible to the statement engines:`);
    for (const r of leaks)
      console.error(`      ${r.code.padEnd(14)} ${fmt(r.balanceCents).padStart(14)}  note ${r.effectiveNote ?? "-"} section ${r.noteSection ?? "-"} "${r.description}"`);
  } else {
    ok("every nonzero 31-May balance reaches the statements through an active BS/IS/CoGM note");
  }

  // --- V3 Balance Sheet boundary: balanced with the keyed closing stock
  // injected, legacy-format net assets equal to financed-by. ---
  let erpAssets = 0, erpLiabilities = 0, erpEquity = 0;
  for (const n of erpBs.values()) {
    if (n.category === "asset") erpAssets += n.balanceCents;
    else if (n.category === "liability") erpLiabilities += n.balanceCents;
    else if (n.category === "equity") erpEquity += n.balanceCents;
  }
  const erpImbalance = erpAssets - erpLiabilities - (erpEquity + erpNetProfitCents);
  const erpNetAssets = erpAssets - erpLiabilities;
  const erpFinancedBy = erpEquity + erpNetProfitCents;
  if (erpImbalance !== 0)
    fail(`V3 May BS imbalance ${fmt(erpImbalance)} != 0.00`);
  if (erpNetAssets !== STMT_EXPECTED_NET_ASSETS_CENTS)
    fail(`V3 May net assets ${fmt(erpNetAssets)} != ${fmt(STMT_EXPECTED_NET_ASSETS_CENTS)}`);
  if (erpFinancedBy !== STMT_EXPECTED_NET_ASSETS_CENTS)
    fail(`V3 May financed-by ${fmt(erpFinancedBy)} != ${fmt(STMT_EXPECTED_NET_ASSETS_CENTS)}`);
  if (erpImbalance === 0
    && erpNetAssets === STMT_EXPECTED_NET_ASSETS_CENTS
    && erpFinancedBy === STMT_EXPECTED_NET_ASSETS_CENTS)
    ok("V3 May BS balances: net assets = financed-by = 6,090,429.60 (scan 6,097,691.11 less the named GP-202604-0001 drift)");

  // --- ST-b closure: which printed statement lines are backed by printed TB
  // rows. Expected: every compared line except the closing-inventory lines ---
  const stBackingStartFailures = failures;
  const unbackedLines = [];
  for (const c of lineComparisons) {
    if (!c.note || c.note === "DN" || c.note === "CH") continue;
    const backedCents = statementSign(c.note, scanAppxNetCents.get(c.note) ?? 0);
    c.scanTbBackedCents = backedCents;
    const isBacked = backedCents === c.scanCents;
    if (STMT_CLOSING_NOTES.has(c.note)) {
      if (isBacked && c.scanCents !== 0)
        fail(`${c.report} note ${c.note} is unexpectedly TB-backed`);
      unbackedLines.push(`${c.report} ${c.note}`);
    } else if (!isBacked) {
      fail(`${c.report} note ${c.note}: printed statement ${fmt(c.scanCents)} is not backed by printed TB rows (${fmt(backedCents)})`);
    }
  }
  const expectedUnbackedLines = [
    "bs 14-1", "bs 14-2", "bs 14-3",
    "is 14-1", "cogm 14-2", "cogm 14-3",
  ];
  if (JSON.stringify([...unbackedLines].sort()) !== JSON.stringify([...expectedUnbackedLines].sort()))
    fail(`ST-b unbacked lines ${unbackedLines.join(", ")} != exact six V3 closing-stock lines`);
  if (failures === stBackingStartFailures)
    ok(`ST-b: every printed statement note is TB-backed except the exact six V3 closing-stock lines`);

  // --- Final APPX state. The historical 125-row fingerprint is evidence of
  // what V2 corrected, not a live mismatch target. ---
  const cosmeticAppxMismatches = appxAudit.filter((r) => r.scanMayCents === 0 && r.erpNetCents === 0);
  if (appxAudit.length !== 91 || cosmeticAppxMismatches.length !== 91)
    fail(`post-V2 APPX audit has ${appxAudit.length} differences / ${cosmeticAppxMismatches.length} zero cosmetics; expected 91/91`);
  if (nonzeroMismatches.length !== 0)
    fail(`${nonzeroMismatches.length} nonzero APPX-vs-fs_note difference(s) remain after V2`);
  if (namedMoves.length !== 0)
    fail(`${namedMoves.length} approved non-stock mapping move(s) remain unapplied`);
  if (stockSplitMismatches.length !== 0)
    fail(`${stockSplitMismatches.length} approved stock mapping move(s) remain unapplied`);
  if (stockAppxVsNoteMismatches.length !== 0)
    fail(`${stockAppxVsNoteMismatches.length} zero CS anchor(s) still resolve to the wrong 14-* note`);
  if (appxAudit.length === 91 && cosmeticAppxMismatches.length === 91
    && nonzeroMismatches.length === 0 && namedMoves.length === 0
    && stockSplitMismatches.length === 0 && stockAppxVsNoteMismatches.length === 0)
    ok("APPX mapping is final: 0 actionable differences; 91 all-zero cosmetic rows remain");

  // --- Report ---
  const byClass = {};
  for (const c of lineComparisons) byClass[c.classification] = (byClass[c.classification] ?? 0) + 1;
  console.log(`\n${lineComparisons.length} compared statement lines: ${Object.entries(byClass).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  const residualLines = lineComparisons.filter((c) => c.classification === "post_scan_gp_drift");
  const residualKeys = residualLines.map((c) => `${c.report}:${c.lineNo}`).sort();
  const expectedResidualKeys = [...STMT_EXPECTED_RESIDUAL_KEYS].sort();
  const expectedResidualDiffs = {
    "bs:11": -GP_DRIFT_CENTS, "bs:23": GP_DRIFT_CENTS,
    "is:12": -GP_DRIFT_CENTS, "is:20": GP_DRIFT_CENTS,
  };
  if (lineComparisons.length !== 40 || (byClass.exact ?? 0) !== 36
    || (byClass.post_scan_gp_drift ?? 0) !== 4)
    fail(`statement final counts ${lineComparisons.length}/${byClass.exact ?? 0}+${byClass.post_scan_gp_drift ?? 0}d != 40/36+4d`);
  if (JSON.stringify(residualKeys) !== JSON.stringify(expectedResidualKeys))
    fail(`post-scan drift keys ${residualKeys.join(", ")} != ${expectedResidualKeys.join(", ")}`);
  for (const line of residualLines) {
    const key = `${line.report}:${line.lineNo}`;
    if (line.diffCents !== expectedResidualDiffs[key])
      fail(`${key} drift ${fmt(line.diffCents)} != ${fmt(expectedResidualDiffs[key])}`);
  }
  if (lineComparisons.length === 40 && (byClass.exact ?? 0) === 36
    && (byClass.post_scan_gp_drift ?? 0) === 4
    && JSON.stringify(residualKeys) === JSON.stringify(expectedResidualKeys)
    && residualLines.every((line) => line.diffCents === expectedResidualDiffs[`${line.report}:${line.lineNo}`]))
    ok("statement boundary is exact: 36/40 lines match the scans; the only differences are the 4 named GP-202604-0001 drift lines (BS note 13, IS note 5, and both profit cross-totals)");

  const outFile = path.join(genDir, "statements-comparison.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    period: { start: STMT_PERIOD_START, end: STMT_PERIOD_END },
    engineSemantics: {
      balanceSheet: "latest anchor <= period end + posted movement from anchor date, grouped by effective fs_note (active balance_sheet notes), plus the keyed exact-month closing_stock_values on the 14-* notes and Current Year Profit from the V3 P&L calculation",
      incomeStatementAndCogm: "posted YTD movement plus exact fiscal-start anchors for only 3-1/3-3/3-7 (3-1 is IS, 3-3/3-7 are CoGM); the IS injects all three keyed closing notes as negative cogs, CoGM injects keyed 14-2/14-3 as negative materials",
    },
    counts: { comparedLines: lineComparisons.length, byClassification: byClass },
    noteMetadata: Object.fromEntries([...fixtureNoteCodes].sort().map((c) => [c, notesMeta.get(c) ?? null])),
    stockFamily: {
      csRows: csFamily.length,
      osRows: osFamily.length,
      csAnchorTotalCents: csAnchorTotal,
      csAnchorByNoteCents: Object.fromEntries([...csAnchorByNote.entries()].sort()),
      osScanByNoteCents: osScanByNote,
      osScanTotalCents: osScanTotal,
      stockAppxVsNoteMismatches,
      appxVsNoteWithinStockFamily: stockSplitMismatches,
    },
    erpTotalsCents: {
      revenue: erpRevenueTotal,
      cogs: erpCogsTotal,
      expenses: erpExpenseTotal,
      netProfit: erpNetProfitCents,
      cogmTotal: erpCogmTotal,
      bsAssets: erpAssets,
      bsLiabilities: erpLiabilities,
      bsEquityExProfit: erpEquity,
      bsImbalance: erpImbalance,
      bsNetAssets: erpNetAssets,
      bsFinancedBy: erpFinancedBy,
    },
    identitiesCents: {
      scanProfit,
      profitDiff,
      openingsTotal,
      closingsTotal,
      cogmDiff: cogmTotalLine?.diffCents ?? null,
    },
    namedNoteMappingMoves: namedMoves,
    mappingDiffFingerprint,
    targetMappingMismatches,
    preV2Evidence: {
      residueCents: PRE_V2_RESIDUE_CENTS,
      csAnchorTotalCents: PRE_V2_STMT_CS_ANCHOR_TOTAL_CENTS,
      actionableMappingFingerprint: PRE_V2_STMT_MAPPING_DIFF_FINGERPRINT,
    },
    v3FinalState: {
      netProfitCents: erpNetProfitCents,
      cogmCents: erpCogmTotal,
      bsImbalanceCents: erpImbalance,
      netAssetsCents: erpNetAssets,
      financedByCents: erpFinancedBy,
      exactStatementLines: byClass.exact ?? 0,
      postScanGpDriftLines: byClass.post_scan_gp_drift ?? 0,
    },
    closingStock: {
      source: "closing_stock_values 2026-05, keyed on the Material Stock page (Closing Stock (Financial Statements) card); injected at report level, never posted to the GL",
      keyedByNoteCents: Object.fromEntries([...STMT_CLOSING_NOTES].sort().map((n) => [n, closingStock.get(n) ?? 0])),
      keyedTotalCents: closingTotalCents,
      keyedRawPackingCents: closingRawPackingCents,
      scanBsTotalCents: bs.find((l) => l.particular === "TOTAL")?.amountCents ?? 0,
      driftResidualKeys: residualKeys,
    },
    lineComparisons,
    leaks,
    appxAudit,
  }, null, 2));
  ok(`wrote ${path.relative(process.cwd(), outFile)}`);
}

// ---- Run --------------------------------------------------------------------
const STAGES = { map: stageMap, tb: stageTb, tdl: stageTdl, statements: stageStatements, regressions: stageRegressions };
const requested = process.argv.slice(2);
const toRun = requested.length ? requested : Object.keys(STAGES);
for (const s of toRun) {
  if (!STAGES[s]) throw new Error(`Unknown stage "${s}" (have: ${Object.keys(STAGES).join(", ")})`);
  STAGES[s]();
}
if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL STAGES GREEN");

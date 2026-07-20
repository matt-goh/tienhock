// Phase V1 harness — machine-compares the transcribed legacy report fixtures
// against the dev DB (docs/Account/LEGACY_REPORT_VERIFICATION_PLAN.md §5).
// Read-only: every DB access is a SELECT through docker exec psql.
//
//   node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs [stage...]
//
// Stages (default: all implemented stages, in order):
//   map   V1 step 1 — printed TB code -> ERP account code mapping
//         (normalization -> account_codes exact -> import alias table ->
//         named exception list). Writes generated/account-map.json.
//   tb    V1 step 2 — scanned TB balance vs ERP derived balance per account
//         per month-end (report semantics: latest anchor <= period end +
//         posted movement from the anchor date, TD children collapsed into
//         DEBTOR). Classifies exact / constant offset / non-constant offset,
//         hard-gates the DEBTOR controls and the RM1,456,480.37 residue.
//         Writes generated/tb-comparison.json.
//   tdl   V1 step 3 — scanned Trade Debtor List vs each ERP debtor-child
//         ledger at 31 May. Proves BAL B/F, May debits/credits, TOTAL DUE and
//         the independent 1 June anchors; compares the legacy aging buckets
//         with the current Debtors-report calendar-month rules.
//         Writes generated/tdl-comparison.json.
//   statements
//         V1 step 4 — scanned May BS / IS / CoGM note lines vs the three
//         financial-report engines, reproduced query-for-query. Attributes
//         every difference to (a) the CS_*/OS_* opening set from stage tb,
//         (b) legacy report-level stock injection (ST-b), or (c) a named
//         fs_note mapping issue; anything else fails.
//         Writes generated/statements-comparison.json.
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
// objects keyed by the query's column names.
function query(sql) {
  const out = execFileSync(
    "docker",
    ["exec", "-i", "tienhock_dev_db", "psql", "-U", "postgres", "-d", "tienhock",
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
// The named import residue: missing DR RM1,456,480.37 in the opening anchors.
const RESIDUE_CENTS = 145648037;

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

  // ---- Gates and report ----
  const byClass = { exact: [], constant_offset: [], non_constant_offset: [] };
  for (const r of rows) byClass[r.classification].push(r);
  console.log(`\n${rows.length} compared accounts: ${byClass.exact.length} exact, ${byClass.constant_offset.length} constant offset, ${byClass.non_constant_offset.length} non-constant offset`);

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

  // Global: Σ(scan − ERP) must equal the named residue at every month-end.
  for (const mm of TB_MONTHS) {
    const total = rows.reduce((s, r) => s + r.diffCents[mm], 0);
    if (total === RESIDUE_CENTS)
      ok(`${MONTH_ENDS[mm]}: Σ offsets = ${fmt(total)} = the named DR residue`);
    else
      fail(`${MONTH_ENDS[mm]}: Σ offsets ${fmt(total)} != residue ${fmt(RESIDUE_CENTS)} (unexplained ${fmt(total - RESIDUE_CENTS)})`);
  }

  // Constant offsets = the opening-correction candidate set.
  if (byClass.constant_offset.length) {
    console.log(`\nconstant offsets (scan − ERP identical Jan–May) — opening-correction candidates:`);
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
    residueCents: RESIDUE_CENTS,
    debtorControlsCents: DEBTOR_CONTROLS_CENTS,
    counts: {
      compared: rows.length,
      exact: byClass.exact.length,
      constantOffset: byClass.constant_offset.length,
      nonConstantOffset: byClass.non_constant_offset.length,
    },
    // Full detail for every non-exact account; exact accounts summarized.
    nonExact: rows.filter((r) => r.classification !== "exact"),
    exactCodes: byClass.exact.map((r) => r.erpCode),
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
// Filled after the first inspected comparison. A non-exact aging population is
// allowed only when its complete per-customer diff remains byte-for-byte the
// named V3 parity gap; any future data/rule change must fail this V1 gate.
const EXPECTED_TDL_COLUMN_DIFF_FINGERPRINT = "3a9168d26b25a45e8e0048e7758ccf16f95409253fc58c5cddd461eb1d68c61b";
const EXPECTED_TDL_AGING_DIFF_FINGERPRINT = "4514569fc2c30814ef505e0737e26fc1c02cbf22a057110f5b8013ea6f0d9817";
const TDL_COLUMN_DIFF_REASONS = {
  GUI: "Legacy excludes wrong-bank-in RV078/05 and its reversing contra PBE066/05 from both columns; the GL report includes the equal credit/debit.",
  "MEEWOO-K": "Legacy nets May credit note THCN/26/13 out of CURRENT; the GL report puts its credit in PAYMENT.",
  "MYSHOP(KM)": "Legacy nets May credit note THCN/26/15 out of CURRENT; the GL report puts its credit in PAYMENT.",
  "MYSHOP-KM2": "Legacy nets May credit note THCN/26/16 out of CURRENT; the GL report puts its credit in PAYMENT.",
  "MYSHOP-SKT": "Legacy nets May credit note THCN/26/14 out of CURRENT; the GL report puts its credit in PAYMENT.",
};
const TDL_AGING_DEFAULT_REASON = "Legacy rolls signed debtor-ledger documents through the month buckets and applies receipts FIFO; ERP uses explicit invoice allocations and puts the remaining ledger bridge in 3 months+.";
const TDL_AGING_DIFF_REASONS = {
  "MEEWOO-K": "Legacy puts May credit note THCN/26/13 in CURRENT; ERP applies it to its linked April invoice, reducing 1 month instead.",
  "MYSHOP(K2)": "Legacy carries the April -60.00 credit in 1 month; ERP has no positive invoice outstanding and puts the ledger bridge in 3 months+.",
  "MYSHOP(P)": "Legacy FIFO clears the older 54.15 first and leaves March debt in 2 months; ERP's explicit payment allocation clears March and leaves the older invoice in 3 months+.",
  "MYSHOP-P4": "Legacy FIFO clears January first and leaves 984.60 of March debt in 2 months; ERP's explicit payment allocation clears March and leaves January in 3 months+.",
  SENANG: "ERP invoice aging includes unjournaled May invoice 2004882 (870.00), then offsets it through the oldest ledger bridge; the legacy ledger-based scan has only one 870.00 current balance.",
};

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

// Reproduces agingSql + reconcileAgingToLedger in
// src/routes/accounting/debtors.js. Buckets are calendar months relative to
// the selected report month, not rolling 30-day bands.
function debtorAgingRows() {
  const sql = `
    WITH invoice_outstanding AS (
      SELECT i0.customerid,
             (to_timestamp(i0.createddate::bigint / 1000)
                AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS inv_date,
             i0.totalamountpayable
             - COALESCE((
                 SELECT SUM(p.amount_paid)
                   FROM payments p
                   LEFT JOIN receipt_allocations ra ON ra.id = p.receipt_allocation_id
                   LEFT JOIN receipts r ON r.id = ra.receipt_id
                  WHERE p.invoice_id = i0.id
                    AND (p.status IS NULL OR p.status = 'active')
                    AND COALESCE(r.posting_date, p.payment_date)::date
                          <= DATE '${TDL_PERIOD_END}'
               ), 0)
             - COALESCE((
                 SELECT SUM(ad.totalamountpayable)
                   FROM adjustment_documents ad
                  WHERE ad.original_invoice_id = i0.id
                    AND ad.type = 'credit_note'
                    AND ad.status = 'active'
                    AND COALESCE(ad.is_consolidated, false) = false
                    AND (to_timestamp(ad.createddate::bigint / 1000)
                           AT TIME ZONE 'Asia/Kuala_Lumpur')::date
                          <= DATE '${TDL_PERIOD_END}'
               ), 0)
             + COALESCE((
                 SELECT SUM(ad.totalamountpayable)
                   FROM adjustment_documents ad
                  WHERE ad.original_invoice_id = i0.id
                    AND ad.type = 'debit_note'
                    AND ad.status = 'active'
                    AND COALESCE(ad.is_consolidated, false) = false
                    AND (to_timestamp(ad.createddate::bigint / 1000)
                           AT TIME ZONE 'Asia/Kuala_Lumpur')::date
                          <= DATE '${TDL_PERIOD_END}'
               ), 0) AS outstanding
        FROM invoices i0
       WHERE i0.invoice_status <> 'cancelled'
         AND COALESCE(i0.is_consolidated, false) = false
         AND (to_timestamp(i0.createddate::bigint / 1000)
                AT TIME ZONE 'Asia/Kuala_Lumpur')::date
               <= DATE '${TDL_PERIOD_END}'
    )
    SELECT customerid,
           ROUND(COALESCE(SUM(CASE
             WHEN inv_date >= DATE '${TDL_PERIOD_START}' THEN outstanding ELSE 0 END), 0) * 100)::bigint AS age_current_cents,
           ROUND(COALESCE(SUM(CASE
             WHEN inv_date >= DATE '${TDL_PERIOD_START}' - INTERVAL '1 month'
              AND inv_date < DATE '${TDL_PERIOD_START}' THEN outstanding ELSE 0 END), 0) * 100)::bigint AS age_1m_cents,
           ROUND(COALESCE(SUM(CASE
             WHEN inv_date >= DATE '${TDL_PERIOD_START}' - INTERVAL '2 months'
              AND inv_date < DATE '${TDL_PERIOD_START}' - INTERVAL '1 month'
             THEN outstanding ELSE 0 END), 0) * 100)::bigint AS age_2m_cents,
           ROUND(COALESCE(SUM(CASE
             WHEN inv_date < DATE '${TDL_PERIOD_START}' - INTERVAL '2 months'
             THEN outstanding ELSE 0 END), 0) * 100)::bigint AS age_3m_plus_cents
      FROM invoice_outstanding
     WHERE outstanding > 0.01
     GROUP BY customerid
     ORDER BY customerid`;

  return new Map(query(sql).map((r) => [r.customerid, {
    ageCurrentCents: parseInt(r.age_current_cents, 10),
    age1mCents: parseInt(r.age_1m_cents, 10),
    age2mCents: parseInt(r.age_2m_cents, 10),
    age3mPlusCents: parseInt(r.age_3m_plus_cents, 10),
  }]));
}

// Reconstructs the legacy scan's aging from the debtor ledger alone. The
// legacy report does not honor explicit payment -> invoice links: it carries
// signed monthly document buckets forward and consumes them FIFO.
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
  const agingByCustomer = debtorAgingRows();
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

    const structuralLedgerDiffCents = {
      balBf: scan.balBfCents - erp.balBfCents,
      current: scan.currentCents - erp.legacyCurrentCents,
      payment: scan.paymentCents - erp.legacyPaymentCents,
      netMay: scan.currentCents + scan.paymentCents
        - (erp.periodDebitsCents - erp.periodCreditsCents),
      totalDue: scan.totalDueCents - erp.closeCents,
      checkpoint: scan.totalDueCents - (erp.checkpointCents ?? 0),
    };
    const currentReportColumnDiffCents = {
      current: scan.currentCents - erp.periodDebitsCents,
      payment: scan.paymentCents - (-erp.periodCreditsCents),
    };

    const rawAging = agingByCustomer.get(resolvedCustomerId) || {
      ageCurrentCents: 0,
      age1mCents: 0,
      age2mCents: 0,
      age3mPlusCents: 0,
    };
    const rawAgingTotal = rawAging.ageCurrentCents + rawAging.age1mCents
      + rawAging.age2mCents + rawAging.age3mPlusCents;
    const ledgerBridgeCents = erp.closeCents - rawAgingTotal;
    const reconciledAging = {
      ageCurrentCents: rawAging.ageCurrentCents,
      age1mCents: rawAging.age1mCents,
      age2mCents: rawAging.age2mCents,
      age3mPlusCents: rawAging.age3mPlusCents + ledgerBridgeCents,
    };
    const agingDiffCents = {
      current: scan.ageCurrentCents - reconciledAging.ageCurrentCents,
      oneMonth: scan.age1mCents - reconciledAging.age1mCents,
      twoMonths: scan.age2mCents - reconciledAging.age2mCents,
      threeMonthsPlus: scan.age3mPlusCents - reconciledAging.age3mPlusCents,
    };
    const hasAgingDifference = Object.values(agingDiffCents).some((v) => v !== 0);
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
      currentReportColumnDiffCents,
      currentReportColumnDifferenceReason: TDL_COLUMN_DIFF_REASONS[scan.accountNo] ?? null,
      erpLegacyFifoAgingCents: legacyFifoAging,
      legacyFifoAgingDiffCents,
      erpRawInvoiceAgingCents: rawAging,
      ledgerBridgeToOldestCents: ledgerBridgeCents,
      erpReconciledAgingCents: reconciledAging,
      agingDiffCents,
      agingDifferenceReason: hasAgingDifference
        ? (TDL_AGING_DIFF_REASONS[scan.accountNo] ?? TDL_AGING_DEFAULT_REASON)
        : null,
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

  const currentReportColumnNonExact = comparisons.filter((r) =>
    Object.values(r.currentReportColumnDiffCents).some((v) => v !== 0));
  const canonicalColumnDiff = currentReportColumnNonExact
    .map((r) => ({ accountNo: r.accountNo, diffCents: r.currentReportColumnDiffCents }))
    .sort((a, b) => a.accountNo < b.accountNo ? -1 : a.accountNo > b.accountNo ? 1 : 0);
  const currentReportColumnFingerprint = createHash("sha256")
    .update(JSON.stringify(canonicalColumnDiff))
    .digest("hex");
  const unnamedColumnDifferences = currentReportColumnNonExact.filter((r) =>
    r.currentReportColumnDifferenceReason === null);
  if (unnamedColumnDifferences.length)
    fail(`${unnamedColumnDifferences.length} current-report column difference(s) lack a named reason`);
  if (currentReportColumnNonExact.length === 0) {
    ok("the current ERP General Statement CURRENT/PAYMENT split matches the legacy columns");
  } else if (EXPECTED_TDL_COLUMN_DIFF_FINGERPRINT === null) {
    fail(`${currentReportColumnNonExact.length} current-report column split(s) differ; inspect and pin fingerprint ${currentReportColumnFingerprint}`);
  } else if (currentReportColumnFingerprint === EXPECTED_TDL_COLUMN_DIFF_FINGERPRINT) {
    note(`${currentReportColumnNonExact.length} rows retain the named V3 CURRENT/PAYMENT classification gap (${currentReportColumnFingerprint})`);
  } else {
    fail(`current-report column diff fingerprint ${currentReportColumnFingerprint} != pinned ${EXPECTED_TDL_COLUMN_DIFF_FINGERPRINT}`);
  }

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
    fail(`${legacyFifoAgingNonExact.length} legacy FIFO aging reconstruction(s) differ from the scan`);
  else
    ok("all 150 scan aging rows exactly match the reconstructed signed-ledger FIFO rules");

  const agingNonExact = comparisons.filter((r) => Object.values(r.agingDiffCents).some((v) => v !== 0));
  const canonicalAgingDiff = agingNonExact
    .map((r) => ({ accountNo: r.accountNo, diffCents: r.agingDiffCents }))
    .sort((a, b) => a.accountNo < b.accountNo ? -1 : a.accountNo > b.accountNo ? 1 : 0);
  const agingFingerprint = createHash("sha256")
    .update(JSON.stringify(canonicalAgingDiff))
    .digest("hex");
  if (agingNonExact.length === 0) {
    ok("the current ERP invoice-aging output matches all scan buckets");
  } else if (EXPECTED_TDL_AGING_DIFF_FINGERPRINT === null) {
    fail(`${agingNonExact.length} current ERP aging row(s) differ; inspect and pin fingerprint ${agingFingerprint}`);
  } else if (agingFingerprint === EXPECTED_TDL_AGING_DIFF_FINGERPRINT) {
    note(`${agingNonExact.length} aging row(s) retain the named V3 allocation-model gap (${agingFingerprint})`);
  } else {
    fail(`aging diff fingerprint ${agingFingerprint} != pinned ${EXPECTED_TDL_AGING_DIFF_FINGERPRINT}`);
  }

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
  console.log(`current ERP column split: ${comparisons.length - currentReportColumnNonExact.length} exact, ${currentReportColumnNonExact.length} named classification differences`);
  console.log(`legacy FIFO aging reconstruction: ${comparisons.length - legacyFifoAgingNonExact.length} exact, ${legacyFifoAgingNonExact.length} non-exact`);
  console.log(`current ERP invoice aging: ${comparisons.length - agingNonExact.length} exact, ${agingNonExact.length} allocation-model differences`);
  if (agingNonExact.length) {
    const agingDiffTotals = {
      current: agingNonExact.reduce((sum, r) => sum + r.agingDiffCents.current, 0),
      oneMonth: agingNonExact.reduce((sum, r) => sum + r.agingDiffCents.oneMonth, 0),
      twoMonths: agingNonExact.reduce((sum, r) => sum + r.agingDiffCents.twoMonths, 0),
      threeMonthsPlus: agingNonExact.reduce((sum, r) => sum + r.agingDiffCents.threeMonthsPlus, 0),
    };
    console.log(`  scan - ERP aging totals: current ${fmt(agingDiffTotals.current)}, 1m ${fmt(agingDiffTotals.oneMonth)}, 2m ${fmt(agingDiffTotals.twoMonths)}, 3m+ ${fmt(agingDiffTotals.threeMonthsPlus)}`);
  }

  const outFile = path.join(genDir, "tdl-comparison.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    period: { start: TDL_PERIOD_START, end: TDL_PERIOD_END, checkpoint: TDL_CHECKPOINT_DATE },
    agingRules: {
      current: "invoice date 2026-05-01..2026-05-31",
      oneMonth: "invoice date 2026-04-01..2026-04-30",
      twoMonths: "invoice date 2026-03-01..2026-03-31",
      threeMonthsPlus: "opening/January/February for the legacy reconstruction; invoice date before 2026-03-01 plus the ledger bridge for the current ERP report",
      legacyScanAllocation: "signed 1 January debtor anchor plus monthly S/DN/RN/CN document buckets; REC/S cash collections normalize carried credits and consume positive buckets FIFO; excess payment becomes a credit in its document month",
      currentErpAllocation: "positive per-invoice outstanding as at 2026-05-31; explicit invoice-linked payments/CN/DN, then the complete debtor-ledger reconciliation bridge forced into 3 months+",
    },
    counts: {
      fixtureDebtors: fixture.length,
      mappedDebtors: comparisons.length,
      exactLedger: comparisons.length - structuralNonExact.length,
      nonExactLedger: structuralNonExact.length,
      exactCurrentReportColumnSplit: comparisons.length - currentReportColumnNonExact.length,
      nonExactCurrentReportColumnSplit: currentReportColumnNonExact.length,
      exactLegacyFifoAging: comparisons.length - legacyFifoAgingNonExact.length,
      nonExactLegacyFifoAging: legacyFifoAgingNonExact.length,
      exactCurrentErpAging: comparisons.length - agingNonExact.length,
      nonExactCurrentErpAging: agingNonExact.length,
      erpOnlyZeroCloseActivity: erpOnlyActive.length - erpOnlyNonzeroClose.length,
      erpOnlyNonzeroClose: erpOnlyNonzeroClose.length,
      informationalCreditors: creditorRows.length,
    },
    controlCents: TDL_CONTROL_CENTS,
    legacyPrintedTotalsCents: TDL_PRINTED_TOTALS_CENTS,
    fixtureTotalsCents,
    erpAllChildTotalsCents,
    erpOnlyZeroCloseTotalsCents,
    informationalCreditorFixture: {
      rows: creditorRows.length,
      comparedToDb: false,
      reason: "The PDF's bonus creditor page is outside Trade Debtor List V1 step 3 and remains file-arithmetic evidence only.",
    },
    currentReportColumnDifferenceFingerprint: currentReportColumnFingerprint,
    agingDifferenceFingerprint: agingFingerprint,
    missingCustomers,
    accountMappings,
    nameDifferences,
    nonExactLedger: structuralNonExact,
    namedCurrentReportColumnDifferences: currentReportColumnNonExact,
    nonExactLegacyFifoAging: legacyFifoAgingNonExact,
    namedCurrentErpAgingDifferences: agingNonExact,
    exactLedgerAccountNos: comparisons.filter((r) => !structuralNonExact.includes(r)).map((r) => r.accountNo),
    exactLegacyFifoAgingAccountNos: comparisons.filter((r) => !legacyFifoAgingNonExact.includes(r)).map((r) => r.accountNo),
    exactCurrentErpAgingAccountNos: comparisons.filter((r) => !agingNonExact.includes(r)).map((r) => r.accountNo),
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
// a synthetic movement-only Current Year Profit row; the Income Statement and
// CoGM read posted journal movement only, grouped by effective fs_note.
const STMT_PERIOD_START = "2026-01-01";
const STMT_PERIOD_END = "2026-05-31";
const STMT_OPENING_NOTES = new Set(["3-1", "3-3", "3-7"]);
const STMT_CLOSING_NOTES = new Set(["14-1", "14-2", "14-3"]);
const STMT_SECTIONS = new Set(["balance_sheet", "income_statement", "cogm"]);
// The stock decomposition of the named DR residue (plan §2): printed OS_*
// openings the ERP lacks minus the superseded THLD CS_* credit anchors the
// ERP still carries.
const STMT_OS_OPENING_TOTAL_CENTS = 62687515;
const STMT_CS_ANCHOR_TOTAL_CENTS = -82960522;
const STMT_ATTRIBUTIONS = {
  csAnchor:
    "ERP value is the THLD CS_* credit opening-anchor set, superseded per user decision §8-4 (printed TB = truth); V2 zeroes these anchors.",
  osAnchorEngineGap:
    "Scan opening-inventory line is backed by printed TB OS_* rows; the ERP has no OS anchors yet (V2 inserts them) and the IS/CoGM engines read journal movement only, so per plan §8-2 the engines must additionally learn to render anchor-backed opening notes.",
  stockInjection:
    "Scan closing-inventory value has no printed-TB backing (the CS_* rows print .00): the legacy system injects month-end stock at report level from its stock module. The ERP equivalent is the V3 monthly closing-stock mechanism (plan §7-1).",
  profitIdentity:
    "Profit differs by exactly closing minus opening inventories (the net stock injection); it resolves when the V2 opening set and the V3 closing-stock mechanism land.",
  cogmIdentity:
    "CoGM differs by exactly its opening-inventory lines minus its closing-inventory lines; same resolution path as the profit difference.",
};
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
// Pinned after inspection of the first run, like the tdl fingerprints: the
// complete nonzero APPX-vs-fs_note difference set must stay byte-identical.
const EXPECTED_STMT_MAPPING_DIFF_FINGERPRINT =
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

// The income-statement/CoGM engines' per-note output (posted journal movement
// in the YTD period only), for every active income_statement/cogm note.
function stmtErpPnlNotes() {
  const sql = `
    WITH RECURSIVE ${STMT_EFFECTIVE_NOTES_CTES},
    period_balances AS (
      SELECT efn.fs_note,
             SUM(COALESCE(jel.debit_amount, 0)) AS total_debit,
             SUM(COALESCE(jel.credit_amount, 0)) AS total_credit
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      JOIN effective_fs_notes efn ON jel.account_code = efn.code
      WHERE je.status = 'posted'
        AND je.entry_date BETWEEN DATE '${STMT_PERIOD_START}' AND DATE '${STMT_PERIOD_END}'
      GROUP BY efn.fs_note
    )
    SELECT fsn.code, fsn.category, fsn.report_section,
           ROUND((CASE WHEN fsn.normal_balance = 'debit'
                       THEN COALESCE(pb.total_debit, 0) - COALESCE(pb.total_credit, 0)
                       ELSE COALESCE(pb.total_credit, 0) - COALESCE(pb.total_debit, 0)
                  END) * 100)::bigint AS balance_cents
    FROM financial_statement_notes fsn
    LEFT JOIN period_balances pb ON fsn.code = pb.fs_note
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

function stageStatements() {
  console.log("\n=== stage statements: scanned May BS / IS / CoGM vs the ERP report engines ===");
  if (STMT_OS_OPENING_TOTAL_CENTS - STMT_CS_ANCHOR_TOTAL_CENTS !== RESIDUE_CENTS)
    fail("static: OS openings minus CS anchors do not equal the named residue");

  const bs = loadStatementFixture("bs");
  const isf = loadStatementFixture("is");
  const cogmf = loadStatementFixture("cogm");
  if (bs.length === 24 && isf.length === 20 && cogmf.length === 14)
    ok("loaded 24 BS / 20 IS / 14 CoGM fixture lines");
  else
    fail(`fixture line counts ${bs.length}/${isf.length}/${cogmf.length} != pinned 24/20/14`);

  const { tb, mappings } = computeMapping();

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

  // Statement sign convention (both engines): credit-normal notes flip net.
  const statementSign = (noteCode, netCents) =>
    notesMeta.get(noteCode)?.normalBalance === "credit" ? -netCents : netCents;

  // --- Note metadata gates (plan §5-3: the six stock notes must exist; every
  // printed note code must be a live ERP note) ---
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
  if (failures === 0)
    ok("all printed note codes exist and are active, including 3-1/3-3/3-7 and 14-1/14-2/14-3");
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

  // ERP side of the closing-stock notes: every contributor must be a printed
  // CS-family account carrying its THLD anchor and nothing else.
  const csByErpCode = new Map(csFamily.map((f) => [f.erpCode, f]));
  const osErpCodes = new Set(osFamily.map((f) => f.erpCode));
  const csAnchorByNote = new Map();
  let csAnchorTotal = 0;
  const stockAppxVsNoteMismatches = [];
  for (const r of erpAccountRows) {
    if (r.effectiveNote && STMT_CLOSING_NOTES.has(r.effectiveNote)) {
      if (!csByErpCode.has(r.code)) {
        fail(`${r.code}: non-CS account contributes ${fmt(r.balanceCents)} to closing-stock note ${r.effectiveNote}`);
        continue;
      }
      if (r.movementCents !== 0)
        fail(`${r.code}: closing-stock account has posted movement ${fmt(r.movementCents)} (expected anchor-only)`);
      csAnchorTotal += r.balanceCents;
      csAnchorByNote.set(r.effectiveNote, (csAnchorByNote.get(r.effectiveNote) ?? 0) + r.balanceCents);
      const scanAppx = csByErpCode.get(r.code).appx;
      if (scanAppx !== r.effectiveNote)
        stockAppxVsNoteMismatches.push({
          code: r.code, scanAppx, erpNote: r.effectiveNote, anchorCents: r.anchorCents,
        });
    }
    if (osErpCodes.has(r.code))
      fail(`${r.code}: printed opening-inventory account unexpectedly carries ERP anchor/movement (${fmt(r.balanceCents)})`);
  }
  if (csAnchorTotal === STMT_CS_ANCHOR_TOTAL_CENTS)
    ok(`ERP closing-stock notes carry exactly the superseded CS anchors: ${fmt(csAnchorTotal)}`);
  else
    fail(`ERP closing-stock note total ${fmt(csAnchorTotal)} != pinned CS anchor set ${fmt(STMT_CS_ANCHOR_TOTAL_CENTS)}`);

  // --- Scan-APPX vs ERP effective-note audit across the whole mapped chart.
  // Computed before the line comparisons because the named non-stock moves
  // define the expected note values for the affected statement lines ---
  const erpRowByCode = new Map(erpAccountRows.map((r) => [r.code, r]));
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
  const stockSplitMismatches = nonzeroMismatches.filter((r) =>
    isStockNote(r.scanAppx) && isStockNote(r.erpEffectiveNote));
  const namedMoves = [];
  for (const r of nonzeroMismatches) {
    if (stockSplitMismatches.includes(r)) continue;
    const reason = STMT_NOTE_MAPPING_REASONS[r.erpCode]
      ?? (STMT_PAYROLL_SPLIT_CODES.has(r.erpCode) ? STMT_PAYROLL_SPLIT_REASON : null);
    if (reason === null) {
      fail(`${r.erpCode}: nonzero balance printed under APPX ${r.scanAppx} but ERP note ${r.erpEffectiveNote} — no named reason`);
      continue;
    }
    // The account balance itself is TB-proven (stage tb): only its note differs.
    if (r.scanMayCents !== r.erpNetCents)
      fail(`${r.erpCode}: named note move has scan ${fmt(r.scanMayCents)} != ERP ${fmt(r.erpNetCents)} — that is a balance difference, not a classification difference`);
    const bucket = (n) => notesMeta.get(n)?.section === "balance_sheet" ? "bs" : "pnl";
    if (!notesMeta.has(r.scanAppx) || !notesMeta.has(r.erpEffectiveNote)
      || bucket(r.scanAppx) !== bucket(r.erpEffectiveNote))
      fail(`${r.erpCode}: named note move ${r.erpEffectiveNote} -> ${r.scanAppx} crosses the BS/P&L boundary — it would break the profit identity`);
    namedMoves.push({ ...r, reason });
  }
  const moveAdjustNetByNote = new Map();
  let moveIntoCogmNetCents = 0;
  for (const mv of namedMoves) {
    moveAdjustNetByNote.set(mv.erpEffectiveNote,
      (moveAdjustNetByNote.get(mv.erpEffectiveNote) ?? 0) - mv.erpNetCents);
    moveAdjustNetByNote.set(mv.scanAppx,
      (moveAdjustNetByNote.get(mv.scanAppx) ?? 0) + mv.erpNetCents);
    const sec = (n) => notesMeta.get(n)?.section;
    moveIntoCogmNetCents += mv.erpNetCents
      * ((sec(mv.scanAppx) === "cogm" ? 1 : 0) - (sec(mv.erpEffectiveNote) === "cogm" ? 1 : 0));
  }
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
  const erpNetProfitCents = erpRevenueTotal - erpCogsTotal - erpExpenseTotal;

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
  // Exact-required note lines: exact, or exactly explained by the named
  // fs_note classification moves, or a failing unexplained difference.
  const compareNoteLine = (report, line, erpCents) => {
    if (line.amountCents === erpCents)
      return pushLine(report, line, erpCents, "exact");
    const moveNet = moveAdjustNetByNote.get(line.note) ?? 0;
    const adjustedCents = erpCents + statementSign(line.note, moveNet);
    if (moveNet !== 0 && adjustedCents === line.amountCents) {
      const row = pushLine(report, line, erpCents, "named_note_mapping_difference",
        "The printed TB APPX and the ERP fs_note classify the movedAccounts under different notes; the printed statements are the 1:1 target (user decision §8-1). See namedNoteMappingMoves.");
      row.adjustedErpCents = adjustedCents;
      row.movedAccounts = namedMoves
        .filter((mv) => mv.erpEffectiveNote === line.note || mv.scanAppx === line.note)
        .map((mv) => ({ code: mv.erpCode, netCents: mv.erpNetCents, from: mv.erpEffectiveNote, to: mv.scanAppx }));
      return row;
    }
    return pushLine(report, line, erpCents, "unexplained");
  };

  // Balance Sheet
  for (const line of bs) {
    if (line.note === "DN") {
      pushLine("bs", line, erpNetProfitCents, "profit_cross_reference", STMT_ATTRIBUTIONS.profitIdentity);
      continue;
    }
    if (line.isSubtotal || !line.note) continue;
    const erp = erpBs.get(line.note);
    if (!erp) {
      fail(`BS note ${line.note} is not served by the balance-sheet engine`);
      continue;
    }
    if (STMT_CLOSING_NOTES.has(line.note)) {
      const row = pushLine("bs", line, erp.balanceCents, "stock_closing_note",
        `${STMT_ATTRIBUTIONS.csAnchor} Scan side: ${STMT_ATTRIBUTIONS.stockInjection}`);
      const anchored = csAnchorByNote.get(line.note) ?? 0;
      if (erp.balanceCents !== anchored)
        fail(`BS note ${line.note}: ERP ${fmt(erp.balanceCents)} != its CS anchor set ${fmt(anchored)} — something else pollutes the note`);
      row.csAnchorCents = anchored;
      continue;
    }
    compareNoteLine("bs", line, erp.balanceCents);
  }

  // Income Statement
  let isProfitLine = null;
  for (const line of isf) {
    if (line.note === "CH") {
      pushLine("is", line, erpCogmTotal, "cogm_cross_reference", STMT_ATTRIBUTIONS.cogmIdentity);
      continue;
    }
    if (line.isSubtotal) {
      if (line.particular === "PROFIT FOR THE FINANCIAL YEAR") {
        isProfitLine = pushLine("is", line, erpNetProfitCents, "profit_cross_reference", STMT_ATTRIBUTIONS.profitIdentity);
      }
      continue;
    }
    if (!line.note) continue;
    if (STMT_OPENING_NOTES.has(line.note)) {
      const erpCents = erpPnl.get(line.note)?.balanceCents ?? 0;
      if (erpCents !== 0)
        fail(`IS opening-inventory note ${line.note} has ERP movement ${fmt(erpCents)} (expected 0)`);
      pushLine("is", line, erpCents, "stock_opening_note", STMT_ATTRIBUTIONS.osAnchorEngineGap);
      continue;
    }
    if (STMT_CLOSING_NOTES.has(line.note)) {
      if (erpPnl.has(line.note))
        fail(`closing-stock note ${line.note} is unexpectedly served by the P&L engines`);
      pushLine("is", line, null, "stock_closing_scan_only", STMT_ATTRIBUTIONS.stockInjection);
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
        cogmTotalLine = pushLine("cogm", line, erpCogmTotal, "cogm_cross_reference", STMT_ATTRIBUTIONS.cogmIdentity);
      }
      continue;
    }
    if (!line.note) continue;
    if (STMT_OPENING_NOTES.has(line.note)) {
      const erpCents = erpPnl.get(line.note)?.balanceCents ?? 0;
      if (erpCents !== 0)
        fail(`CoGM opening-inventory note ${line.note} has ERP movement ${fmt(erpCents)} (expected 0)`);
      pushLine("cogm", line, erpCents, "stock_opening_note", STMT_ATTRIBUTIONS.osAnchorEngineGap);
      continue;
    }
    if (STMT_CLOSING_NOTES.has(line.note)) {
      if (erpPnl.has(line.note))
        fail(`closing-stock note ${line.note} is unexpectedly served by the P&L engines`);
      pushLine("cogm", line, null, "stock_closing_scan_only", STMT_ATTRIBUTIONS.stockInjection);
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
  for (const [noteCode, scanCents] of Object.entries(osScanByNote)) {
    const stmtCents = noteCode === "3-1" ? fx(isf, "3-1") : fx(cogmf, noteCode);
    if (scanCents !== stmtCents)
      fail(`printed TB OS APPX ${noteCode} total ${fmt(scanCents)} != statement line ${fmt(stmtCents)}`);
  }

  const scanProfit = bs.find((l) => l.note === "DN")?.amountCents ?? 0;
  if (isProfitLine === null || scanProfit !== isProfitLine.scanCents)
    fail("BS profit line and IS profit line disagree (V0 tie broken)");
  const profitDiff = scanProfit - erpNetProfitCents;
  if (profitDiff === closingsTotal - openingsTotal)
    ok(`profit: scan ${fmt(scanProfit)} − ERP ${fmt(erpNetProfitCents)} = ${fmt(profitDiff)} = closings − openings exactly`);
  else
    fail(`profit difference ${fmt(profitDiff)} != closings − openings ${fmt(closingsTotal - openingsTotal)}`);

  // The CoGM total identity: openings − closings (the stock injection) plus
  // the named salary-split moves that cross between the IS and CoGM sections.
  const cogmOpenClose = fx(cogmf, "3-3") + fx(cogmf, "3-7") - fx(cogmf, "14-2") - fx(cogmf, "14-3");
  const cogmExpectedDiff = cogmOpenClose + moveIntoCogmNetCents;
  if (cogmTotalLine === null) fail("CoGM total line not found");
  else if (cogmTotalLine.diffCents === cogmExpectedDiff)
    ok(`CoGM: scan ${fmt(cogmTotalLine.scanCents)} − ERP ${fmt(erpCogmTotal)} = ${fmt(cogmTotalLine.diffCents)} = openings − closings ${fmt(cogmOpenClose)} + named salary moves ${fmt(moveIntoCogmNetCents)} exactly`);
  else
    fail(`CoGM total difference ${fmt(cogmTotalLine?.diffCents ?? 0)} != openings − closings + named moves ${fmt(cogmExpectedDiff)}`);
  const chLine = lineComparisons.find((l) => l.report === "is" && l.classification === "cogm_cross_reference");
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

  // --- The residue identity at statement level: the ERP May BS must be out
  // of balance by exactly the named opening residue and nothing else ---
  let erpAssets = 0, erpLiabilities = 0, erpEquity = 0;
  for (const n of erpBs.values()) {
    if (n.category === "asset") erpAssets += n.balanceCents;
    else if (n.category === "liability") erpLiabilities += n.balanceCents;
    else if (n.category === "equity") erpEquity += n.balanceCents;
  }
  const erpImbalance = erpAssets - erpLiabilities - (erpEquity + erpNetProfitCents);
  if (erpImbalance === -RESIDUE_CENTS)
    ok(`ERP May BS is out of balance by exactly the named residue: assets short ${fmt(RESIDUE_CENTS)}`);
  else
    fail(`ERP May BS imbalance ${fmt(erpImbalance)} != -residue ${fmt(-RESIDUE_CENTS)}`);

  // --- ST-b closure: which printed statement lines are backed by printed TB
  // rows. Expected: every compared line except the closing-inventory lines ---
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
  if (failures === 0)
    ok(`ST-b: every printed statement line is TB-backed except the closing-inventory lines (${unbackedLines.join(", ")})`);

  // --- The APPX-vs-fs_note difference set must be complete, named, and
  // byte-identical to the pinned fingerprint (tdl precedent) ---
  if (namedMoves.length) {
    console.log(`\nnamed fs_note classification differences (nonzero, non-stock — V2 correction candidates):`);
    for (const r of namedMoves)
      console.log(`  ${r.erpCode.padEnd(14)} printed APPX ${String(r.scanAppx).padEnd(5)} ERP note ${String(r.erpEffectiveNote).padEnd(5)} ${fmt(r.erpNetCents).padStart(14)}`);
  }
  note(`${appxAudit.length} of ${mappings.length} mapped accounts print an APPX differing from the ERP effective fs_note: ${namedMoves.length} named non-stock moves, ${stockSplitMismatches.length} within the stock family, ${appxAudit.length - nonzeroMismatches.length} with zero balances (cosmetic)`);
  if (stockAppxVsNoteMismatches.length)
    note(`${stockAppxVsNoteMismatches.length} anchored CS account(s) sit under a different 14-* note than their printed APPX (affects only the per-note split of the superseded anchors)`);
  if (nonzeroMismatches.length === 0) {
    ok("no nonzero APPX-vs-fs_note differences");
  } else if (EXPECTED_STMT_MAPPING_DIFF_FINGERPRINT === null) {
    fail(`${nonzeroMismatches.length} nonzero APPX-vs-fs_note difference(s); inspect and pin fingerprint ${mappingDiffFingerprint}`);
  } else if (mappingDiffFingerprint === EXPECTED_STMT_MAPPING_DIFF_FINGERPRINT) {
    note(`${nonzeroMismatches.length} nonzero APPX-vs-fs_note differences retain the pinned classification set (${mappingDiffFingerprint})`);
  } else {
    fail(`APPX-vs-fs_note diff fingerprint ${mappingDiffFingerprint} != pinned ${EXPECTED_STMT_MAPPING_DIFF_FINGERPRINT}`);
  }

  // --- Report ---
  const byClass = {};
  for (const c of lineComparisons) byClass[c.classification] = (byClass[c.classification] ?? 0) + 1;
  console.log(`\n${lineComparisons.length} compared statement lines: ${Object.entries(byClass).map(([k, v]) => `${v} ${k}`).join(", ")}`);

  const outFile = path.join(genDir, "statements-comparison.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    period: { start: STMT_PERIOD_START, end: STMT_PERIOD_END },
    engineSemantics: {
      balanceSheet: "latest anchor <= period end + posted movement from anchor date, grouped by effective fs_note (active balance_sheet notes), plus a synthetic movement-only Current Year Profit row",
      incomeStatementAndCogm: "posted journal movement in the YTD period only, grouped by effective fs_note (active income_statement/cogm notes); anchors are never read",
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
    },
    identitiesCents: {
      scanProfit,
      profitDiff,
      openingsTotal,
      closingsTotal,
      moveIntoCogmNet: moveIntoCogmNetCents,
      residue: RESIDUE_CENTS,
    },
    namedNoteMappingMoves: namedMoves,
    mappingDiffFingerprint,
    v2DesignProjection: {
      note: "Derived arithmetic for the V2 sign-off package (plan §6/§8-2), not live gates.",
      postV2TbResidueCents: RESIDUE_CENTS + STMT_CS_ANCHOR_TOTAL_CENTS - STMT_OS_OPENING_TOTAL_CENTS,
      postV2BsImbalanceWithoutEngineChangeCents: erpImbalance - STMT_CS_ANCHOR_TOTAL_CENTS,
      postV2BsImbalanceWithAnchorRenderingCents: erpImbalance - STMT_CS_ANCHOR_TOTAL_CENTS + openingsTotal,
      postV2MayBsTotalWithoutClosingInjectionCents: (bs.find((l) => l.particular === "TOTAL")?.amountCents ?? 0) - closingsTotal,
      scanMayBsTotalCents: bs.find((l) => l.particular === "TOTAL")?.amountCents ?? 0,
      fullParityRequires: [
        "V2: zero the 63 CS_* credit anchors and insert the printed OS_* openings as 2026-01-01 anchors (per-account amounts in tb-comparison.json)",
        "V2: user-approved fs_note corrections for the namedNoteMappingMoves accounts (printed APPX = target) — closes the note 22/8/1/10/11 and 5/5-1 statement differences",
        "V2: align the stock-family fs_notes with the printed APPX (appxVsNoteWithinStockFamily) so the V2 OS anchors render under the correct 3-1/3-3/3-7 note",
        "§8-2: the IS/CoGM engines (and the BS Current Year Profit row) must render anchor-backed opening-inventory notes 3-1/3-3/3-7",
        "V3-1: monthly closing-stock injection for BS 14-1/14-2/14-3 and the IS/CoGM LESS: CLOSING INVENTORIES lines (May targets 188,979.60 / 336,909.82 / 182,194.43)",
      ],
    },
    lineComparisons,
    leaks,
    appxAudit,
  }, null, 2));
  ok(`wrote ${path.relative(process.cwd(), outFile)}`);
}

// ---- Run --------------------------------------------------------------------
const STAGES = { map: stageMap, tb: stageTb, tdl: stageTdl, statements: stageStatements };
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

// Monthly legacy-vs-ERP Trial Balance tie-out.
//
//   node dev/import/legacy-tieout/tie-out.mjs --month 2026-07 --legacy legacy-tb-july.csv
//   node dev/import/legacy-tieout/tie-out.mjs --month 2026-07 --legacy july.csv --prev-legacy june.csv
//
// WHAT IT DOES
//   Joins the legacy program's month-end Trial Balance (one row per account:
//   code, debit, credit — YTD balances) against the ERP's per-account YTD at
//   the same month-end, computed anchor-aware from account_opening_balances +
//   posted journal lines. Writes a diff CSV and prints a summary. Any non-zero
//   row is a keying difference to chase THIS month, while receipts are fresh.
//
//   With --prev-legacy (the previous month's legacy TB) it also compares the
//   month's MOVEMENT per account (legacy movement = this YTD - prev YTD), which
//   isolates the current month's differences even when an older month has a
//   known, documented residual.
//
// INPUT FORMATS
//   CSV: header row with a code column (code / acc/code / account) plus debit
//   and credit columns; or no header, columns exactly: code,debit,credit.
//   Amounts may carry thousand separators. The legacy print renders account
//   codes with spaces for underscores ("ACD EPF" = ACD_EPF) — codes are
//   normalised to the underscore form before joining.
//   JSON: an array of { code, debit, credit } objects (the Phase-0 June
//   transcription shape; extra fields are ignored).
//
// DATABASE
//   Defaults to the dev Docker DB host/port/name/user. DB_PASSWORD is required.
//   Override the other values with DB_HOST / DB_PORT / DB_NAME / DB_USER. Run
//   it against whichever database holds the books being tallied (dev is
//   refreshed from prod regularly).
//
// This tool only READS the ERP database. It never writes.
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import pg from "pg";

const args = process.argv.slice(2);
function opt(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
}
const month = opt("month"); // YYYY-MM
const legacyPath = opt("legacy");
const prevPath = opt("prev-legacy");
const outDir = opt("out") ?? path.join(process.cwd(), "dev/import/legacy-tieout/out");

if (!month || !/^\d{4}-\d{2}$/.test(month) || !legacyPath) {
  console.error("usage: node dev/import/legacy-tieout/tie-out.mjs --month YYYY-MM --legacy <csv|json> [--prev-legacy <csv|json>] [--out <dir>]");
  process.exit(2);
}
const [year, mon] = month.split("-").map(Number);
const monthEnd = new Date(Date.UTC(year, mon, 0)); // last day of the month
const monthEndStr = monthEnd.toISOString().slice(0, 10);

// ---------- legacy input ----------
const normCode = (c) => String(c ?? "").trim().toUpperCase().replace(/\s+/g, "_");
const cents = (n) => Math.round(Number(String(n ?? "0").replace(/,/g, "")) * 100);

function parseAmount(s) {
  const n = Number(String(s ?? "").replace(/[,"]/g, "").trim());
  if (Number.isNaN(n)) throw new Error(`bad amount: ${s}`);
  return n;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function loadLegacy(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const map = new Map(); // code -> balance cents (debit - credit)
  const add = (code, balCents) => {
    const c = normCode(code);
    if (!c) return;
    map.set(c, (map.get(c) ?? 0) + balCents);
  };
  if (file.endsWith(".json")) {
    for (const r of JSON.parse(text)) add(r.code, cents(r.debit) - cents(r.credit));
    return map;
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const first = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = first.some((h) => /code|account|debit|credit/.test(h));
  let ci = 0, di = 1, ki = 2, start = 0;
  if (hasHeader) {
    ci = first.findIndex((h) => /code|account/.test(h));
    di = first.findIndex((h) => /debit/.test(h));
    ki = first.findIndex((h) => /credit/.test(h));
    if (ci === -1 || di === -1 || ki === -1) throw new Error("CSV header needs code, debit and credit columns");
    start = 1;
  }
  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= Math.max(ci, di, ki)) continue;
    add(cols[ci], cents(parseAmount(cols[di])) - cents(parseAmount(cols[ki])));
  }
  return map;
}

// ---------- ERP side ----------
const fold = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "dev/import/legacy-tieout/fold-map.json"), "utf8")
);
const aliasOf = (c) => fold.aliases[c] ?? c;

const databasePassword = process.env.DB_PASSWORD;
if (!databasePassword) {
  throw new Error("DB_PASSWORD must be configured");
}

const pool = new pg.Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5434),
  user: process.env.DB_USER ?? "postgres",
  password: databasePassword,
  database: process.env.DB_NAME ?? "tienhock",
});

const { rows: erpRows } = await pool.query(
  `WITH anchors AS (
     SELECT DISTINCT ON (account_code) account_code, as_of_date, amount
     FROM account_opening_balances
     WHERE as_of_date <= $1
     ORDER BY account_code, as_of_date DESC
   ),
   movement AS (
     SELECT jel.account_code,
            SUM(jel.debit_amount - jel.credit_amount) AS net,
            SUM(jel.debit_amount - jel.credit_amount)
              FILTER (WHERE je.entry_date >= date_trunc('month', $1::date)) AS month_net
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     LEFT JOIN anchors a ON a.account_code = jel.account_code
     WHERE je.status = 'posted'
       AND je.entry_date <= $1
       AND (a.as_of_date IS NULL OR je.entry_date >= a.as_of_date)
     GROUP BY jel.account_code
   )
   SELECT ac.code, ac.parent_code,
          COALESCE(a.amount, 0) + COALESCE(m.net, 0) AS ytd_balance,
          COALESCE(m.month_net, 0) AS month_movement
   FROM account_codes ac
   LEFT JOIN anchors a ON a.account_code = ac.code
   LEFT JOIN movement m ON m.account_code = ac.code
   WHERE COALESCE(a.amount, 0) + COALESCE(m.net, 0) <> 0 OR COALESCE(m.month_net, 0) <> 0`,
  [monthEndStr]
);
await pool.end();

// Fold ERP children of printed control accounts (e.g. DEBTOR) into the parent,
// matching the legacy TB's presentation.
const erpYtd = new Map();
const erpMove = new Map();
const addTo = (map, code, centsVal) => map.set(code, (map.get(code) ?? 0) + centsVal);
for (const r of erpRows) {
  const target = r.parent_code && fold.foldIntoParent.includes(r.parent_code) ? r.parent_code : r.code;
  addTo(erpYtd, target, cents(r.ytd_balance));
  addTo(erpMove, target, cents(r.month_movement));
}

// ---------- diff ----------
const legacyRaw = loadLegacy(legacyPath);
const prevRaw = prevPath ? loadLegacy(prevPath) : null;
// Re-key legacy rows through the alias map (legacy printed code -> ERP code).
const realias = (m) => {
  const out = new Map();
  for (const [code, bal] of m) addTo(out, aliasOf(code), bal);
  return out;
};
const legacy = realias(legacyRaw);
const prev = prevRaw ? realias(prevRaw) : null;

const money = (c) => (c / 100).toFixed(2);
const codes = new Set([...legacy.keys(), ...erpYtd.keys(), ...(prev ? prev.keys() : [])]);
const rows = [];
for (const code of codes) {
  const lYtd = legacy.get(code) ?? 0;
  const eYtd = erpYtd.get(code) ?? 0;
  const ytdDiff = eYtd - lYtd;
  let lMove = null, moveDiff = null;
  if (prev) {
    lMove = lYtd - (prev.get(code) ?? 0);
    moveDiff = (erpMove.get(code) ?? 0) - lMove;
  }
  if (ytdDiff === 0 && (moveDiff === null || moveDiff === 0)) continue;
  rows.push({
    code,
    legacy_ytd: lYtd,
    erp_ytd: eYtd,
    ytd_diff: ytdDiff,
    legacy_movement: lMove,
    erp_movement: prev ? erpMove.get(code) ?? 0 : null,
    movement_diff: moveDiff,
  });
}
rows.sort((a, b) => Math.abs(b.movement_diff ?? b.ytd_diff) - Math.abs(a.movement_diff ?? a.ytd_diff));

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `tie-out-${month}.csv`);
const header = prev
  ? "code,legacy_ytd,erp_ytd,ytd_diff,legacy_movement,erp_movement,movement_diff"
  : "code,legacy_ytd,erp_ytd,ytd_diff";
const csv = [header]
  .concat(
    rows.map((r) =>
      prev
        ? `${r.code},${money(r.legacy_ytd)},${money(r.erp_ytd)},${money(r.ytd_diff)},${money(r.legacy_movement)},${money(r.erp_movement)},${money(r.movement_diff)}`
        : `${r.code},${money(r.legacy_ytd)},${money(r.erp_ytd)},${money(r.ytd_diff)}`
    )
  )
  .join("\n");
fs.writeFileSync(outFile, csv + "\n");

// ---------- summary ----------
const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
const legacyTotal = [...legacy.values()].reduce((s, v) => s + Math.abs(v), 0);
const erpTotal = [...erpYtd.values()].reduce((s, v) => s + Math.abs(v), 0);
console.log(`month-end: ${monthEndStr}   DB rows: ${erpRows.length}   legacy rows: ${legacyRaw.size}`);
console.log(`differing accounts: ${rows.length}`);
console.log(`ytd diff:     +${money(sum((r) => Math.max(r.ytd_diff, 0)))} / -${money(-sum((r) => Math.min(r.ytd_diff, 0)))} (erp - legacy)`);
if (prev) {
  console.log(`movement diff: +${money(sum((r) => Math.max(r.movement_diff, 0)))} / -${money(-sum((r) => Math.min(r.movement_diff, 0)))} (erp - legacy)`);
}
console.log(`TB abs totals: legacy ${money(legacyTotal)}  erp(folded) ${money(erpTotal)}  (each = 2x the per-side grand total)`);
console.log(`\nwrote ${outFile}`);
if (rows.length) {
  console.log(`\ntop differences:`);
  for (const r of rows.slice(0, 20)) {
    console.log(prev
      ? `  ${r.code.padEnd(14)} ytd ${money(r.ytd_diff).padStart(12)}   movement ${money(r.movement_diff).padStart(12)}`
      : `  ${r.code.padEnd(14)} ytd ${money(r.ytd_diff).padStart(12)}`);
  }
  console.log(rows.length > 20 ? `  ... and ${rows.length - 20} more in the CSV` : "");
}

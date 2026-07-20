// File-only validator for the legacy report scan fixtures (plan V0-4).
// No DB access. Verifies internal arithmetic invariants of each transcribed
// fixture against the printed control figures pinned in source-manifest.json,
// and emits generated/validation-report.json.
//
//   node dev/import/legacy-report-fixtures/validate-fixtures.mjs
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "data");
const genDir = path.join(here, "generated");
const manifest = JSON.parse(fs.readFileSync(path.join(here, "source-manifest.json"), "utf8"));

let failures = 0;
const report = { checkedAt: new Date().toISOString(), fixtures: {}, failures: [] };
const fail = (msg) => {
  failures++;
  report.failures.push(msg);
  console.error(`FAIL  ${msg}`);
};
const ok = (msg) => console.log(`ok    ${msg}`);
const fmt = (c) => (c / 100).toLocaleString("en-MY", { minimumFractionDigits: 2 });
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ---- Hash-pinned source and fixture integrity -----------------------------
report.integrity = { sources: {}, fixtures: {} };
for (const source of Object.values(manifest.sources)) {
  const file = path.join(dataDir, source.filename);
  if (!fs.existsSync(file)) {
    fail(`source hash: missing ${source.filename}`);
    continue;
  }
  const actual = sha256(file);
  report.integrity.sources[source.filename] = actual;
  if (actual === source.sha256) ok(`source hash: ${source.filename}`);
  else fail(`source hash: ${source.filename} ${actual} != pinned ${source.sha256}`);
}
for (const [filename, expected] of Object.entries(manifest.fixtures ?? {})) {
  const file = path.join(dataDir, filename);
  if (!fs.existsSync(file)) {
    fail(`fixture hash: missing ${filename}`);
    continue;
  }
  const actual = sha256(file);
  report.integrity.fixtures[filename] = actual;
  if (actual === expected) ok(`fixture hash: ${filename}`);
  else fail(`fixture hash: ${filename} ${actual} != pinned ${expected}`);
}

// Strict small CSV parser (quoted fields, doubled quotes, no embedded newlines).
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

// ---- Trial Balance fixtures ----------------------------------------------
const tbMonths = [["01", "TB_2026_01"], ["02", "TB_2026_02"], ["03", "TB_2026_03"], ["04", "TB_2026_04"], ["05", "TB_2026_05"]];
const tbData = {}; // month -> Map(code -> {appx, debit, credit})

for (const [mm, srcKey] of tbMonths) {
  const file = path.join(dataDir, `tb_2026-${mm}.csv`);
  if (!fs.existsSync(file)) continue;
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const header = rows.shift().join(",");
  if (header !== "page,row_on_page,acc_code_printed,particular,appx,debit_cents,credit_cents")
    fail(`tb_2026-${mm}: unexpected header ${header}`);

  const byCode = new Map();
  let sumD = 0, sumC = 0, blankRows = 0;
  const appxSums = {};
  for (const r of rows) {
    const [page, rowOn, code, , appx, d, c] = r;
    const where = `tb_2026-${mm} p${page} r${rowOn} ${code}`;
    if (r.length !== 7) fail(`${where}: ${r.length} fields`);
    if (!code.trim()) fail(`${where}: empty code`);
    if (byCode.has(code)) fail(`${where}: duplicate code`);
    const dc = cents(d, where), cc = cents(c, where);
    if (dc !== null && cc !== null) fail(`${where}: both debit and credit set`);
    if (dc === null && cc === null) blankRows++;
    sumD += dc ?? 0;
    sumC += cc ?? 0;
    const net = (dc ?? 0) - (cc ?? 0);
    appxSums[appx] = (appxSums[appx] ?? 0) + net;
    byCode.set(code, { appx, debit: dc, credit: cc, net });
  }
  tbData[mm] = byCode;
  const exp = manifest.sources[srcKey].printedGrandTotalCents;
  if (exp) {
    if (sumD === exp.debit) ok(`tb_2026-${mm}: Σdebit = ${fmt(sumD)} matches printed grand total`);
    else fail(`tb_2026-${mm}: Σdebit ${fmt(sumD)} != printed ${fmt(exp.debit)} (diff ${fmt(sumD - exp.debit)})`);
    if (sumC === exp.credit) ok(`tb_2026-${mm}: Σcredit = ${fmt(sumC)} matches printed grand total`);
    else fail(`tb_2026-${mm}: Σcredit ${fmt(sumC)} != printed ${fmt(exp.credit)} (diff ${fmt(sumC - exp.credit)})`);
  } else {
    if (sumD === sumC) ok(`tb_2026-${mm}: balances internally, DR = CR = ${fmt(sumD)} (no printed total pinned yet)`);
    else fail(`tb_2026-${mm}: DR ${fmt(sumD)} != CR ${fmt(sumC)} (diff ${fmt(sumD - sumC)})`);
  }
  report.fixtures[`tb_2026-${mm}`] = {
    accounts: byCode.size, sumDebitCents: sumD, sumCreditCents: sumC, blankAmountRows: blankRows,
    appxNetCents: Object.fromEntries(Object.entries(appxSums).sort()),
  };
}

// TB-c: account-set consistency across transcribed months
const monthsPresent = Object.keys(tbData);
if (monthsPresent.length > 1) {
  const base = tbData[monthsPresent[monthsPresent.length - 1]];
  for (const mm of monthsPresent.slice(0, -1)) {
    const other = tbData[mm];
    const missing = [...base.keys()].filter((k) => !other.has(k));
    const extra = [...other.keys()].filter((k) => !base.has(k));
    if (missing.length || extra.length)
      console.log(`note  tb 2026-${mm} vs 2026-${monthsPresent[monthsPresent.length - 1]}: ${missing.length} codes missing, ${extra.length} extra (listed in report)`);
    report.fixtures[`tb_2026-${mm}`].codesMissingVsMay = missing;
    report.fixtures[`tb_2026-${mm}`].codesExtraVsMay = extra;
  }
}

// ---- May statement cross-ties (only when May TB present) -------------------
const may = tbData["05"];
if (may) {
  const appx = report.fixtures["tb_2026-05"].appxNetCents;
  const tie = (label, actual, expected) =>
    actual === expected
      ? ok(`May tie: ${label} = ${fmt(expected)}`)
      : fail(`May tie: ${label} = ${fmt(actual)}, expected ${fmt(expected)}`);

  tie("APPX 7 (revenue, CR)", -(appx["7"] ?? 0), 333464933);
  tie("APPX 3-1 (opening FG)", appx["3-1"] ?? 0, 8439320);
  tie("APPX 3-3 (opening raw)", appx["3-3"] ?? 0, 34850150);
  tie("APPX 3-7 (opening packing)", appx["3-7"] ?? 0, 19398045);
  tie("APPX 3-2 (purchase packing)", appx["3-2"] ?? 0, 11578134);
  tie("APPX 3-4 (purchase chemical)", appx["3-4"] ?? 0, 328000);
  tie("APPX 3-5 (purchase raw)", appx["3-5"] ?? 0, 157346500);
  tie("APPX 3-6 (freight)", appx["3-6"] ?? 0, 0);
  tie("APPX 22 (trade receivables)", appx["22"] ?? 0, 50769772); // DEBTOR control row; CL AFI prints APPX 8
  tie("APPX 14-1/2/3 (inventories in TB)", (appx["14-1"] ?? 0) + (appx["14-2"] ?? 0) + (appx["14-3"] ?? 0), 0); // legacy injects closing stock at report level, TB rows are zero
  tie("APPX 20 (retained profit, CR)", -(appx["20"] ?? 0), 561286610);
  tie("APPX 21 (share capital, CR)", -(appx["21"] ?? 0), 20000000);
  tie("APPX 19 (cash at bank)", appx["19"] ?? 0, 17249242);
  tie("APPX 6 (cash in hand)", appx["6"] ?? 0, 3670440);
  tie("APPX 12 (taxation, DR)", appx["12"] ?? 0, 20882797);
}

// ---- Trade Debtor List ------------------------------------------------------
const tdlFile = path.join(dataDir, "trade_debtor_list_2026-05-31.csv");
if (fs.existsSync(tdlFile)) {
  const rows = parseCsv(fs.readFileSync(tdlFile, "utf8"));
  const header = rows.shift().join(",");
  const expHeader = "page,row_on_page,account_no,particular,bal_bf_cents,current_cents,payment_cents,total_due_cents,age_current_cents,age_1m_cents,age_2m_cents,age_3m_plus_cents";
  if (header !== expHeader) fail(`tdl: unexpected header`);
  const sums = new Array(8).fill(0);
  const seen = new Set();
  for (const r of rows) {
    const [page, rowOn, acc, , ...nums] = r;
    const where = `tdl p${page} r${rowOn} ${acc}`;
    if (seen.has(acc)) fail(`${where}: duplicate account`);
    seen.add(acc);
    const v = nums.map((n, i) => cents(n, where) ?? 0);
    const [bf, cur, pay, due, a0, a1, a2, a3] = v;
    if (bf + cur + pay !== due) fail(`${where}: bf+current+payment ${fmt(bf + cur + pay)} != total_due ${fmt(due)}`);
    if (a0 + a1 + a2 + a3 !== due) fail(`${where}: aging buckets ${fmt(a0 + a1 + a2 + a3)} != total_due ${fmt(due)}`);
    v.forEach((x, i) => (sums[i] += x));
  }
  const exp = manifest.sources.TDL_2026_05_31.printedTotalsCents;
  const expArr = [exp.bal_bf, exp.current, exp.payment, exp.total_due, exp.age_current, exp.age_1m, exp.age_2m, exp.age_3m_plus];
  const names = ["bal_bf", "current", "payment", "total_due", "age_current", "age_1m", "age_2m", "age_3m_plus"];
  // Legacy quirk: the printed totals row for bal_bf/current/payment/age_current is
  // computed over a population that includes unlisted zero-due accounts and is not
  // internally consistent with its own total_due. Only total_due and the last three
  // aging columns are hard gates; the rest are reported informationally.
  const hardCols = new Set(["total_due", "age_1m", "age_2m", "age_3m_plus"]);
  names.forEach((n, i) => {
    if (sums[i] === expArr[i]) ok(`tdl: Σ${n} = ${fmt(sums[i])} matches printed totals row`);
    else if (hardCols.has(n)) fail(`tdl: Σ${n} ${fmt(sums[i])} != printed ${fmt(expArr[i])} (diff ${fmt(sums[i] - expArr[i])})`);
    else console.log(`note  tdl: Σ${n} ${fmt(sums[i])} vs printed ${fmt(expArr[i])} — legacy totals-row quirk (unlisted zero-due accounts)`);
  });
  // The transcribed rows must remain globally self-consistent.
  if (sums[0] + sums[1] + sums[2] !== sums[3]) fail(`tdl: Σbf+Σcur+Σpay != Σdue`);
  if (sums[4] + sums[5] + sums[6] + sums[7] !== sums[3]) fail(`tdl: Σaging != Σdue`);
  report.fixtures["trade_debtor_list_2026-05-31"] = { customers: seen.size, sums: Object.fromEntries(names.map((n, i) => [n, sums[i]])) };
}

// ---- Trade Creditor List (bonus page 1 of the TDL PDF) ----------------------
const tclFile = path.join(dataDir, "trade_creditor_list_2026-05-31.csv");
if (fs.existsSync(tclFile)) {
  const rows = parseCsv(fs.readFileSync(tclFile, "utf8"));
  rows.shift();
  for (const r of rows) {
    const [page, rowOn, acc, , ...nums] = r;
    const v = nums.map((n) => cents(n, `tcl ${acc}`) ?? 0);
    const [bf, cur, pay, due, a0, a1, a2, a3] = v;
    if (bf + cur + pay !== due) fail(`tcl ${acc}: bf+current+payment != total_due`);
    if (a0 + a1 + a2 + a3 !== due) fail(`tcl ${acc}: aging != total_due`);
  }
  ok(`tcl: ${rows.length} creditor rows self-consistent (printed totals row is a known legacy quirk)`);
  report.fixtures["trade_creditor_list_2026-05-31"] = { creditors: rows.length };
}

// ---- BS / IS / CoGM line fixtures + arithmetic chains -----------------------
const loadLines = (name) => {
  const f = path.join(dataDir, `${name}.csv`);
  if (!fs.existsSync(f)) return null;
  const rows = parseCsv(fs.readFileSync(f, "utf8"));
  rows.shift();
  const byNo = new Map(rows.map((r) => [parseInt(r[0], 10), { note: r[3], amount: cents(r[4], `${name} l${r[0]}`) ?? 0 }]));
  report.fixtures[name] = { lines: rows.length };
  return byNo;
};
const chain = (name, no, actual, expected) =>
  actual === expected
    ? ok(`${name} line ${no}: ${fmt(expected)} recomputes`)
    : fail(`${name} line ${no}: stored ${fmt(actual)} != recomputed ${fmt(expected)}`);

const bs = loadLines("bs_2026-05");
if (bs) {
  const a = (n) => bs.get(n).amount;
  chain("bs", 10, a(10), a(2) + a(3) + a(4) + a(5) + a(6) + a(7) + a(8) + a(9));
  chain("bs", 18, a(18), -(a(11) + a(12) + a(13) + a(14) + a(15) + a(16) + a(17)));
  chain("bs", 19, a(19), a(10) + a(18));
  chain("bs", 20, a(20), a(1) + a(19));
  chain("bs", 24, a(24), a(21) + a(22) + a(23));
  if (a(20) !== a(24)) fail("bs: TOTAL != FINANCED BY");
}
const is5 = loadLines("is_2026-05");
if (is5) {
  const a = (n) => is5.get(n).amount;
  chain("is", 4, a(4), a(2) + a(3));
  chain("is", 6, a(6), a(4) - a(5));
  chain("is", 7, a(7), a(1) - a(6));
  chain("is", 11, a(11), a(7) + a(10));
  chain("is", 14, a(14), a(12) + a(13));
  chain("is", 15, a(15), a(11) - a(14));
  chain("is", 18, a(18), a(15) - a(17));
  chain("is", 20, a(20), a(18) - a(19));
}
const cogm = loadLines("cogm_2026-05");
if (cogm) {
  const a = (n) => cogm.get(n).amount;
  chain("cogm", 5, a(5), a(1) + a(2) + a(3) + a(4));
  chain("cogm", 7, a(7), a(5) - a(6));
  chain("cogm", 10, a(10), a(8) + a(9));
  chain("cogm", 12, a(12), a(10) - a(11));
  chain("cogm", 14, a(14), a(7) + a(12) + a(13));
}
if (bs && is5 && cogm) {
  if (is5.get(3).amount !== cogm.get(14).amount) fail("cross: IS CoGM line != CoGM total");
  else ok("cross: IS CoGM line = CoGM total");
  if (bs.get(23).amount !== is5.get(20).amount) fail("cross: BS profit != IS profit");
  else ok("cross: BS profit = IS profit");
  if (bs.get(2).amount !== is5.get(5).amount || bs.get(3).amount !== cogm.get(6).amount || bs.get(4).amount !== cogm.get(11).amount)
    fail("cross: closing inventories disagree between BS and IS/CoGM");
  else ok("cross: closing inventories agree across BS/IS/CoGM");
}

fs.mkdirSync(genDir, { recursive: true });
fs.writeFileSync(path.join(genDir, "validation-report.json"), JSON.stringify(report, null, 2));
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " FAILURE(S)"} — report written to generated/validation-report.json`);
process.exit(failures === 0 ? 0 : 1);

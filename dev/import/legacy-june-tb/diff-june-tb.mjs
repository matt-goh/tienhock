// Join the transcribed legacy June-2026 Trial Balance against our dev June YTD
// balances and write the account-level difference list.
//
//   node dev/import/legacy-june-tb/diff-june-tb.mjs
//
// Legacy balance = printed debit - printed credit (positive = debit balance),
// matching the sign convention of dev-june-2026-ytd.json.
// The printed ACC/CODE column renders the stored account code's underscores as
// spaces ("ACD EPF" on paper = "ACD_EPF" in account_codes), so codes are joined
// on the underscore form.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "dev/import/legacy-june-tb");
const legacy = JSON.parse(fs.readFileSync(path.join(dir, "june-2026-legacy-tb.json"), "utf8"));
const dev = JSON.parse(fs.readFileSync(path.join(dir, "dev-june-2026-ytd.json"), "utf8"));

const norm = (c) => c.trim().replace(/\s+/g, "_");
const cents = (n) => Math.round(n * 100);

const legacyByCode = new Map();
for (const r of legacy) {
  const code = norm(r.code);
  const prev = legacyByCode.get(code);
  const bal = cents(r.debit) - cents(r.credit);
  if (prev) {
    prev.balance += bal;
    prev.margin_mark = prev.margin_mark || r.margin_mark;
  } else {
    legacyByCode.set(code, { balance: bal, margin_mark: r.margin_mark });
  }
}
const devByCode = new Map(dev.map((r) => [r.code, cents(r.ytd_balance)]));

const codes = new Set([...legacyByCode.keys(), ...devByCode.keys()]);
const rows = [];
for (const code of codes) {
  const l = legacyByCode.get(code);
  const legacyBal = l ? l.balance : 0;
  const devBal = devByCode.get(code) ?? 0;
  const diff = devBal - legacyBal;
  if (Math.abs(diff) === 0) continue;
  rows.push({
    code,
    legacy_balance: legacyBal / 100,
    dev_balance: devBal / 100,
    diff: diff / 100,
    margin_mark: l ? l.margin_mark : false,
    in_legacy: !!l,
  });
}
rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

const posSum = rows.filter((r) => r.diff > 0).reduce((a, r) => a + cents(r.diff), 0);
const negSum = rows.filter((r) => r.diff < 0).reduce((a, r) => a + cents(r.diff), 0);
const markPos = rows.filter((r) => r.diff > 0 && r.margin_mark).reduce((a, r) => a + cents(r.diff), 0);
const markNeg = rows.filter((r) => r.diff < 0 && r.margin_mark).reduce((a, r) => a + cents(r.diff), 0);

let legacyDr = 0, legacyCr = 0;
for (const r of legacy) { legacyDr += cents(r.debit); legacyCr += cents(r.credit); }
let devDr = 0, devCr = 0;
for (const r of dev) { const v = cents(r.ytd_balance); if (v > 0) devDr += v; else devCr -= v; }

const lines = ["code,legacy_balance,dev_balance,diff,margin_mark"];
for (const r of rows) {
  lines.push([r.code, r.legacy_balance.toFixed(2), r.dev_balance.toFixed(2), r.diff.toFixed(2), r.margin_mark].join(","));
}
lines.push("");
lines.push(`# rows with |diff| >= 0.005: ${rows.length}`);
lines.push(`# total positive diff (dev higher): ${(posSum / 100).toFixed(2)}`);
lines.push(`# total negative diff (dev lower):  ${(negSum / 100).toFixed(2)}`);
lines.push(`# net diff (dev - legacy):          ${((posSum + negSum) / 100).toFixed(2)}`);
lines.push(`# of which on margin-marked rows:   positive ${(markPos / 100).toFixed(2)} / negative ${(markNeg / 100).toFixed(2)}`);
lines.push(`# codes in dev but not on the printed TB: ${rows.filter((r) => !r.in_legacy).length}`);
lines.push("#");
lines.push(`# column totals  legacy debit  ${(legacyDr / 100).toFixed(2)}   dev debit  ${(devDr / 100).toFixed(2)}   dev-legacy ${((devDr - legacyDr) / 100).toFixed(2)}`);
lines.push(`# column totals  legacy credit ${(legacyCr / 100).toFixed(2)}   dev credit ${(devCr / 100).toFixed(2)}   dev-legacy ${((devCr - legacyCr) / 100).toFixed(2)}`);
lines.push("#");
lines.push("# The printed grand total is 17,102,880.87 per side and the printed DEBIT column foots");
lines.push("# to it exactly. The printed CREDIT column foots to 17,102,920.87, i.e. 40.00 over its own");
lines.push("# grand total. The only credit-side account where the print and dev disagree is CR_LD");
lines.push("# (printed 25,492.43 / dev 25,452.43) - see margin-marks.md for the verification trail.");

fs.writeFileSync(path.join(dir, "june-tb-diff.csv"), lines.join("\n") + "\n");
console.log(lines.slice(-6).join("\n"));
console.log(`rows=${rows.length}  -> june-tb-diff.csv`);

// Standing gate for june-2026-legacy-ledgers.json (transcribed from
// JUNE_LEDGERS_FOR_FIXING_DISCREPENCIES.pdf, 23 pages, 05 AUG 2026).
//
//   node dev/import/legacy-june-tb/verify-ledgers.mjs
//
// Re-runs the three checks the transcription was gated on:
//   (a) every printed running BALANCE equals the previous balance +debit -credit;
//   (b) opening + sum(debit) - sum(credit) == the printed closing balance;
//   (c) the closing balance equals that account's YTD balance in the already
//       validated Trial Balance fixture june-2026-legacy-tb.json.
// Exit code 1 on any failure. Re-run this after touching either fixture.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "dev/import/legacy-june-tb");
const cents = (n) => Math.round(n * 100);
const norm = (c) => c.trim().replace(/\s+/g, "_");

const tb = JSON.parse(fs.readFileSync(path.join(dir, "june-2026-legacy-tb.json"), "utf8"));
const tbByCode = new Map(tb.map((r) => [norm(r.code), cents(r.debit) - cents(r.credit)]));
const accounts = JSON.parse(fs.readFileSync(path.join(dir, "june-2026-legacy-ledgers.json"), "utf8"));

const failures = [];
for (const a of accounts) {
  const code = norm(a.account_code_normalized || a.account);
  let running = cents(a.opening_balance);
  for (const l of a.lines) {
    running += cents(l.debit) - cents(l.credit);
    if (running !== cents(l.balance)) {
      failures.push(`${code} line ${l.seq}: running ${(running / 100).toFixed(2)} != printed ${l.balance.toFixed(2)}`);
    }
  }
  if (running !== cents(a.closing_balance)) {
    failures.push(`${code}: computed closing ${(running / 100).toFixed(2)} != printed ${a.closing_balance.toFixed(2)}`);
  }
  const declared = cents(a.june_movement);
  const computed = cents(a.closing_balance) - cents(a.opening_balance);
  if (declared !== computed) {
    failures.push(`${code}: june_movement ${a.june_movement.toFixed(2)} != closing - opening ${(computed / 100).toFixed(2)}`);
  }
  const tbBal = tbByCode.get(code);
  if (tbBal === undefined) failures.push(`${code}: not present in june-2026-legacy-tb.json`);
  else if (tbBal !== cents(a.closing_balance)) {
    failures.push(`${code}: ledger closing ${a.closing_balance.toFixed(2)} != TB ${(tbBal / 100).toFixed(2)}`);
  }
}

console.log(`accounts=${accounts.length}  lines=${accounts.reduce((s, a) => s + a.lines.length, 0)}`);
for (const a of accounts) {
  const code = norm(a.account_code_normalized || a.account).padEnd(9);
  console.log(
    `  ${code} pages ${String(a.pages.join("+")).padEnd(8)} lines=${String(a.lines.length).padStart(3)}` +
      `  opening ${a.opening_balance.toFixed(2).padStart(10)}` +
      `  June movement ${a.june_movement.toFixed(2).padStart(9)}` +
      `  closing ${a.closing_balance.toFixed(2).padStart(10)}`
  );
}
if (failures.length) {
  console.error(`\nFAILED ${failures.length} check(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\nAll checks passed: running balances, closing balances, declared movements, and TB tie-out.");

#!/usr/bin/env node
// Compares t() keys containing non-ASCII characters in the given TSX files
// against the ms/jellypolly.json keys, reporting mismatches (e.g. keys that
// were mangled by a pipe during merging).
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const ms = JSON.parse(
  readFileSync("src/i18n/locales/ms/jellypolly.json", "utf8")
);
const tsxKeys = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const re = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src))) {
    if (/[^\x00-\x7F]/.test(m[1])) tsxKeys.add(m[1]);
  }
}
let bad = 0;
for (const k of tsxKeys) {
  if (!(k in ms)) {
    console.log("MISSING:", JSON.stringify(k));
    bad++;
  }
}
for (const k of Object.keys(ms)) {
  if (k.includes("?")) console.log("MANGLED IN JSON:", JSON.stringify(k));
}
if (process.env.DUMP_LINE) {
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const i = src.indexOf(process.env.DUMP_LINE);
    if (i >= 0) console.log("DUMP:", JSON.stringify(src.slice(i, i + 100)));
  }
}
console.log(`Checked ${tsxKeys.size} non-ASCII t() keys, ${bad} missing.`);

#!/usr/bin/env node
// dev/i18n-merge-keys.mjs
// Copies existing translations for the given keys from the other namespaces
// into ms/jellypolly.json and zh-Hans/jellypolly.json, and prints the keys
// that exist in NO other namespace (they need fresh translations).
// Usage: node dev/i18n-merge-keys.mjs < keys.txt
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const nsPriority = [
  "invoice",
  "greentarget",
  "payments",
  "adjustments",
  "sales",
  "catalogue",
  "stock",
  "payroll",
  "accounting",
  "common",
  "nav",
  "home",
  "auth",
];

const load = (lang, ns) =>
  JSON.parse(
    readFileSync(join("src/i18n/locales", lang, `${ns}.json`), "utf8")
  );

const msJp = load("ms", "jellypolly");
const zhJp = load("zh-Hans", "jellypolly");

const keyList = readFileSync(0, "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("DYN:"));

let copied = 0;
const missing = [];
for (const key of keyList) {
  let found = false;
  for (const ns of nsPriority) {
    const ms = load("ms", ns);
    const zh = load("zh-Hans", ns);
    if (key in ms && key in zh) {
      msJp[key] = ms[key];
      zhJp[key] = zh[key];
      copied++;
      found = true;
      break;
    }
  }
  if (!found) missing.push(key);
}

writeFileSync(
  "src/i18n/locales/ms/jellypolly.json",
  JSON.stringify(msJp, null, 2) + "\n"
);
writeFileSync(
  "src/i18n/locales/zh-Hans/jellypolly.json",
  JSON.stringify(zhJp, null, 2) + "\n"
);

console.log(`Copied ${copied} keys from other namespaces.`);
console.log(`\nKeys needing fresh translations (${missing.length}):`);
for (const k of missing) console.log(JSON.stringify(k));

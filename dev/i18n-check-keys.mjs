#!/usr/bin/env node
// Reports t() literal keys used in the given files that are missing from
// ms/jellypolly.json (or asymmetric with zh-Hans). Usage:
//   node dev/i18n-check-keys.mjs file1.tsx file2.tsx ...
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const ms = JSON.parse(
  readFileSync("src/i18n/locales/ms/jellypolly.json", "utf8")
);
const zh = JSON.parse(
  readFileSync("src/i18n/locales/zh-Hans/jellypolly.json", "utf8")
);
const used = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const re = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src))) used.add(m[1]);
}
const missing = [...used].filter((k) => !(k in ms) || !(k in zh)).sort();
for (const k of missing) {
  console.log(
    `${k in ms ? "zh-only" : k in zh ? "ms-only" : "missing"}: ${JSON.stringify(k)}`
  );
}
console.log(`\n${used.size} keys used, ${missing.length} missing/asymmetric.`);

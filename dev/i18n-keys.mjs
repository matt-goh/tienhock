#!/usr/bin/env node
// dev/i18n-keys.mjs
// Lists every literal key passed to t() in the given files (one per line,
// sorted, deduped). Dynamic t(expr) lookups are printed as DYN:<expr>.
// Usage: node dev/i18n-keys.mjs file1.tsx file2.tsx ...
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const keys = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  // t() literals are double-quoted; handle \" escapes and apostrophes.
  const literalRe = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = literalRe.exec(src))) keys.add(m[1]);
  const dynRe = /\bt\(\s*([A-Za-z_$][A-Za-z0-9_$.]*(?:\([^)]*\))?)/g;
  while ((m = dynRe.exec(src))) {
    if (m[1].startsWith("(") || m[1] === "true" || m[1] === "false") continue;
    keys.add("DYN:" + m[1]);
  }
}
console.log([...keys].sort().join("\n"));

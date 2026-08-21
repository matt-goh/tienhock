#!/usr/bin/env node
// Prints a compact inventory of candidate user-facing strings in a TSX file:
// JSX text, string literals (quoted), template-literal expressions with
// interpolation, and common attribute patterns. Heuristic only.
import { readFileSync } from "node:fs";

for (const f of process.argv.slice(2)) {
  const src = readFileSync(f, "utf8");
  const lines = src.split(/\r?\n/);
  console.log(`\n===== ${f} (${lines.length} lines) =====`);
  const jsxText = />([^<>{}]*[A-Za-z][^<>{}]*)</g;
  let m;
  while ((m = jsxText.exec(src))) {
    const text = m[1].trim();
    if (text && !/^[0-9:.,%+\-/\\()\s]+$/.test(text)) {
      console.log(`JSX: ${JSON.stringify(text)}`);
    }
  }
  const litRe = /(["'`])((?:[^\\\1]|\\.)*)\1/g;
  while ((m = litRe.exec(src))) {
    const text = m[2];
    if (
      text.length >= 2 &&
      text.length <= 160 &&
      /[A-Za-z]/.test(text) &&
      !/^(https?:\/\/|\/api\/|class:|text-|bg-|border-|flex|grid|md:|sm:|lg:|xl:|w-|h-|p-|m-|gap-|top-|left-|right-|bottom-|hover:|focus:|dark:|rounded|shadow|z-|overflow|whitespace|items-|justify-|self-|content-|leading-|tracking-|font-|text-default)/.test(text) &&
      !/^[a-z][a-zA-Z0-9_]*$/.test(text)
    ) {
      console.log(`LIT: ${JSON.stringify(text)}`);
    }
  }
}

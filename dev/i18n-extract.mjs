#!/usr/bin/env node
// dev/i18n-extract.mjs
// Quick coverage inventory for a batch: extracts candidate user-facing string
// literals from TSX files and reports which ones are already keys in the
// batch namespace and which are missing. It is a heuristic helper only - the
// actual conversion still needs the human-in-the-loop judgement described in
// docs/I18N_HANDOVER.md.
//
// Usage:
//   node dev/i18n-extract.mjs [--ns payroll] [--glob "src/pages/Payroll/**/*.tsx"]
//   node dev/i18n-extract.mjs --files file1.tsx file2.tsx
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const nsFlag = args.indexOf("--ns");
const ns = nsFlag >= 0 ? args[nsFlag + 1] : "payroll";
const globFlag = args.indexOf("--glob");
const filesFlag = args.indexOf("--files");

let files = [];
if (filesFlag >= 0) {
  files = args.slice(filesFlag + 1).filter((a) => !a.startsWith("--"));
} else if (globFlag >= 0) {
  const glob = args[globFlag + 1];
  const base = glob.split("*")[0];
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = join(dir, d.name);
      if (d.isDirectory()) return walk(p);
      if (d.isFile() && d.name.endsWith(".tsx")) return [p];
      return [];
    });
  const globRegex = new RegExp(
    "^" +
      glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\u0000/g, ".*") +
      "$",
  );
  files = walk(base).filter((p) =>
    globRegex.test(p.replaceAll("\\", "/")),
  );
} else {
  console.error("Pass --glob <pattern> or --files <paths>");
  process.exit(1);
}

const msPath = `src/i18n/locales/ms/${ns}.json`;
const zhPath = `src/i18n/locales/zh-Hans/${ns}.json`;
const msKeys = new Set(Object.keys(JSON.parse(readFileSync(msPath, "utf8"))));
const zhKeys = new Set(Object.keys(JSON.parse(readFileSync(zhPath, "utf8"))));

// Heuristic: keep any literal that contains a space (sentences and phrases),
// plus short single-word UI labels. Exclude identifiers, paths, URLs, date
// formats, classnames, and pure symbol strings.
const SINGLE_WORDS = new Set([
  "Save", "Cancel", "Delete", "Edit", "Search", "Back", "Add", "Submit",
  "Confirm", "Close", "Open", "View", "Print", "Download", "Total", "Date",
  "Status", "Actions", "Notes", "Name", "Amount", "Quantity", "Rate",
  "Pending", "Processed", "Submitted", "Summary", "History", "Preview",
  "Loading", "Reset", "Apply", "Remove", "Update", "Create", "Select",
  "Import", "Export", "Refresh", "Yes", "No", "All", "None", "Today",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  "Sunday", "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
]);
const EXCLUDE = /^[a-z][a-zA-Z0-9_]*$/; // camelCase / snake_case identifiers
const PATH_LIKE = /(^\.{0,2}\/)|(\.tsx$)|(\.json$)|(\.css$)|(\.js$)/;
const HAS_SPACE = /\s/;

function extractLiterals(src) {
  const out = [];
  const jsxRe = />([^<{][^<]*?)</g;
  let jm;
  while ((jm = jsxRe.exec(src))) {
    const text = jm[1].trim();
    if (!text || text.length < 2 || text.length > 140) continue;
    if (!/[A-Za-z]/.test(text)) continue;
    if (/[;\r\n=()\[\]{}`$&|<>]/.test(text)) continue;
    if (/\/\*|\/\//.test(text)) continue;
    if (/^[0-9:.%+\-/\\,()]+$/.test(text)) continue;
    out.push(text);
  }
  const re = /(?:`([^`$]*)`|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = re.exec(src))) {
    const raw = (m[1] ?? m[2] ?? m[3]).replace(/\\(["'`\\])/g, "$1");
    if (!raw || raw.length < 2 || raw.length > 140) continue;
    if (/[\r\n{}]/.test(raw)) continue;
    if (!HAS_SPACE.test(raw) && !SINGLE_WORDS.has(raw)) continue;
    if (!/[A-Za-z]/.test(raw)) continue;
    if (PATH_LIKE.test(raw)) continue;
    if (EXCLUDE.test(raw)) continue;
    if (/^(https?:\/\/|\/api\/|class:|text-|bg-|border-|flex|grid|md:|sm:|lg:|xl:|w-|h-|p-|m-|gap-|top-|left-|right-|bottom-|hover:|focus:|dark:|rounded|shadow|z-|overflow|whitespace|items-|justify-|self-|content-|leading-|tracking-|font-|text-default)/.test(raw)) continue;
    if (/^[0-9:.%+\-/\\,()]+$/.test(raw)) continue;
    out.push(raw);
  }
  return [...new Set(out)];
}

const missing = new Map(); // file -> [strings]
const present = new Map(); // file -> count
for (const f of files) {
  if (!statSync(f).isFile()) continue;
  const src = readFileSync(f, "utf8");
  const literals = extractLiterals(src);
  const miss = literals.filter((s) => !msKeys.has(s) && !zhKeys.has(s));
  if (miss.length) missing.set(f, miss);
  present.set(f, literals.length);
}

let totalMissing = 0;
for (const [f, miss] of [...missing.entries()].sort()) {
  console.log(`\n== ${relative(process.cwd(), f)}: ${present.get(f)} candidates, ${miss.length} missing`);
  for (const s of miss) console.log(`  ${JSON.stringify(s)}`);
  totalMissing += miss.length;
}
console.log(`\nTotal missing candidates: ${totalMissing}`);

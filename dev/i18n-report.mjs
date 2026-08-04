#!/usr/bin/env node
// dev/i18n-report.mjs
// Compares translation key sets across languages per namespace.
// A key translated in one language but missing in another is reported.
// English-as-key means en files are intentionally sparse (common.* only),
// so `en` is never reported as "missing". Usage: npm run i18n:report
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = join(dirname(fileURLToPath(import.meta.url)), "../src/i18n/locales");
const languages = readdirSync(localesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// namespace -> language -> keys
const table = new Map();
for (const lang of languages) {
  for (const file of readdirSync(join(localesDir, lang))) {
    if (!file.endsWith(".json")) continue;
    const ns = file.replace(/\.json$/, "");
    const keys = Object.keys(JSON.parse(readFileSync(join(localesDir, lang, file), "utf8")));
    if (!table.has(ns)) table.set(ns, {});
    table.get(ns)[lang] = new Set(keys);
  }
}

let problems = 0;
for (const [ns, byLang] of [...table.entries()].sort()) {
  const allKeys = new Set();
  for (const keys of Object.values(byLang)) for (const k of keys) allKeys.add(k);
  for (const key of [...allKeys].sort()) {
    const present = languages.filter((l) => byLang[l]?.has(key));
    const missing = languages.filter((l) => l !== "en" && !byLang[l]?.has(key));
    if (missing.length > 0) {
      problems++;
      console.log(`MISSING  ${ns}  ${JSON.stringify(key)}  present: [${present}] missing: [${missing}]`);
    }
  }
}

if (problems === 0) {
  console.log(`i18n OK: all keys symmetric across [${languages.filter((l) => l !== "en")}] in ${table.size} namespace(s).`);
} else {
  console.log(`\n${problems} key(s) missing a translation.`);
  process.exitCode = 1;
}

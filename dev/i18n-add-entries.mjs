#!/usr/bin/env node
// Merges entries from a tmp JSON file into ms/jellypolly.json and
// zh-Hans/jellypolly.json. Usage:
//   node dev/i18n-add-entries.mjs dev/.tmp-jp-ms.json dev/.tmp-jp-zh.json
import { readFileSync, writeFileSync } from "node:fs";

const [msTmp, zhTmp] = process.argv.slice(2);
const apply = (lang, tmp) => {
  const jp = JSON.parse(
    readFileSync(`src/i18n/locales/${lang}/jellypolly.json`, "utf8")
  );
  const extra = JSON.parse(readFileSync(tmp, "utf8"));
  for (const [k, v] of Object.entries(extra)) jp[k] = v;
  writeFileSync(
    `src/i18n/locales/${lang}/jellypolly.json`,
    JSON.stringify(jp, null, 2) + "\n"
  );
};
apply("ms", msTmp);
apply("zh-Hans", zhTmp);
console.log("merged");

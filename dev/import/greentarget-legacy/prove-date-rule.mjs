import { readWorksheet, excelSerialToParts } from "./read-xlsx.mjs";
import fs from "node:fs";
let naiveOut = 0, swapOut = 0, total = 0, naiveSamples = [];
for (const f of ["EXCEL_GTLD_(JAN-JUNE_2026).xlsx", "EXCEL_GTDB_(JAN-JUNE_2026).xlsx"]) {
  const r = readWorksheet(fs.readFileSync(new URL("./data/" + f, import.meta.url)));
  for (const row of r.rows) {
    if (row.rowNumber <= 2) continue;
    const b = row.cells.get("B");
    if (!b || b.type !== "n") continue;
    total++;
    const p = excelSerialToParts(Number(b.raw));
    const naive = p.year + "-" + String(p.month).padStart(2,"0") + "-" + String(p.day).padStart(2,"0");
    const swap  = p.year + "-" + String(p.day).padStart(2,"0") + "-" + String(p.month).padStart(2,"0");
    if (naive < "2026-01-01" || naive > "2026-06-30") { naiveOut++; if (naiveSamples.length < 5) naiveSamples.push(b.raw + " -> naive " + naive + " / swapped " + swap); }
    if (swap  < "2026-01-01" || swap  > "2026-06-30") swapOut++;
  }
}
console.log("numeric date cells                     : " + total);
console.log("outside Jan-Jun 2026 WITHOUT the swap  : " + naiveOut + "  <- what a cellDates:true reader would produce");
console.log("outside Jan-Jun 2026 WITH the swap     : " + swapOut);
console.log("samples:"); for (const s of naiveSamples) console.log("  serial " + s);

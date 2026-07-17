// Render scanned legacy-report PDF pages to PNG for transcription.
// Uses the repo's existing pdfjs-dist + canvas packages — no system tools
// (poppler/tesseract) and no cloud OCR; the scans contain customer data and
// must never leave the machine.
//
// Usage:
//   node dev/import/legacy-report-fixtures/render-pdf.mjs <pdf> <outPrefix> [pages] [scale]
//     pages: comma list ("1,2,5") or "all"   (default "1")
//     scale: render scale                     (default 2 ≈ 1190x1684 per A4 page)
//
// Proven 2026-07-17 against all nine scans (see LEGACY_REPORT_VERIFICATION_PLAN.md).
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(repoRoot, "package.json"));
const pdfjsPath = path.join(repoRoot, "node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const pdfjs = await import(`file:///${pdfjsPath.replace(/\\/g, "/")}`);
const { createCanvas } = require("canvas");

const [, , pdfPath, outPrefix, pagesArg = "1", scaleArg = "2"] = process.argv;
if (!pdfPath || !outPrefix) {
  console.error("Usage: node render-pdf.mjs <pdf> <outPrefix> [pageList|all] [scale]");
  process.exit(1);
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
console.log(`${path.basename(pdfPath)}: ${doc.numPages} pages`);

const pages =
  pagesArg === "all"
    ? Array.from({ length: doc.numPages }, (_, i) => i + 1)
    : pagesArg.split(",").map(Number);

for (const p of pages) {
  if (p < 1 || p > doc.numPages) continue;
  const page = await doc.getPage(p);
  const viewport = page.getViewport({ scale: Number(scaleArg) });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const out = `${outPrefix}-p${String(p).padStart(2, "0")}.png`;
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`  wrote ${out} (${Math.round(viewport.width)}x${Math.round(viewport.height)})`);
}

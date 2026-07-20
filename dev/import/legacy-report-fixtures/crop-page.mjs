// Crop a horizontal band of a PDF page at high scale, for resolving
// double-struck digits during transcription review.
// Usage: node crop-page.mjs <pdf> <page> <yFrac0> <yFrac1> <out.png> [scale=5]
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(repoRoot, "package.json"));
const pdfjs = await import(`file:///${path.join(repoRoot, "node_modules/pdfjs-dist/legacy/build/pdf.mjs").replace(/\\/g, "/")}`);
const { createCanvas } = require("canvas");

const [, , pdfPath, pageNo, y0s, y1s, out, scaleArg = "5"] = process.argv;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), useSystemFonts: true }).promise;
const page = await doc.getPage(Number(pageNo));
const viewport = page.getViewport({ scale: Number(scaleArg) });
const canvas = createCanvas(viewport.width, viewport.height);
await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
const y0 = Math.floor(viewport.height * Number(y0s));
const h = Math.max(1, Math.floor(viewport.height * (Number(y1s) - Number(y0s))));
const cropped = createCanvas(viewport.width, h);
cropped.getContext("2d").drawImage(canvas, 0, y0, viewport.width, h, 0, 0, viewport.width, h);
fs.writeFileSync(out, cropped.toBuffer("image/png"));
console.log(`wrote ${out} (${Math.round(viewport.width)}x${h})`);

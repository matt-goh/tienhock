// Render scanned PDF pages to PNGs for visual reading (pdfjs-dist + node-canvas).
// Usage: node dev/pdf-render/render-pdf.mjs <pdfPath> <outDir> [scale] [fromPage] [toPage]
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";
import fs from "node:fs";
import path from "node:path";

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(pair, width, height) {
    pair.canvas.width = width;
    pair.canvas.height = height;
  }
  destroy(pair) {
    pair.canvas.width = 0;
    pair.canvas.height = 0;
  }
}

const [pdfPath, outDir, scaleArg, fromArg, toArg] = process.argv.slice(2);
const scale = Number(scaleArg || 2);
const from = Number(fromArg || 1);

fs.mkdirSync(outDir, { recursive: true });
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await getDocument({
  data,
  canvasFactory: new NodeCanvasFactory(),
  isEvalSupported: false,
}).promise;

const to = Math.min(Number(toArg || pdf.numPages), pdf.numPages);
console.log(`pages=${pdf.numPages} rendering ${from}..${to} @scale ${scale}`);

for (let p = from; p <= to; p++) {
  const page = await pdf.getPage(p);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: context,
    viewport,
    canvasFactory: new NodeCanvasFactory(),
  }).promise;
  const out = path.join(outDir, `page-${String(p).padStart(2, "0")}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`${out} ${canvas.width}x${canvas.height}`);
  page.cleanup();
}
await pdf.destroy();

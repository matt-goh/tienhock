// Crop and rotate a region of a PNG for closer inspection.
// Usage: node dev/pdf-render/crop-rotate.mjs <inPng> <outPng> <x> <y> <w> <h> <rotateDeg>
import { createCanvas, loadImage } from "canvas";
import fs from "node:fs";

const [inPng, outPng, xArg, yArg, wArg, hArg, rotArg] = process.argv.slice(2);
const x = Number(xArg), y = Number(yArg), w = Number(wArg), h = Number(hArg);
const rot = (Number(rotArg || 0) * Math.PI) / 180;

const img = await loadImage(inPng);
const swap = Math.abs(Math.sin(rot)) > 0.5; // 90/270 swaps dimensions
const outW = swap ? h : w;
const outH = swap ? w : h;
const canvas = createCanvas(outW, outH);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, outW, outH);
ctx.translate(outW / 2, outH / 2);
ctx.rotate(rot);
ctx.drawImage(img, x, y, w, h, -w / 2, -h / 2, w, h);
fs.writeFileSync(outPng, canvas.toBuffer("image/png"));
console.log(`${outPng} ${outW}x${outH}`);

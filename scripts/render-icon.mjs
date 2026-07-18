// Rasterise the Signal app icon from public/brand/icon.svg to PNGs.
//
// Uses the `sharp` already present in node_modules (Next bundles it). Run with:
//   node scripts/render-icon.mjs
// Oversamples the vector to 2048² once, then downsamples to each target size so
// even the small icons stay crisp. 1024 is the size Meta App Review requires.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const brandDir = join(here, "..", "public", "brand");
const svg = readFileSync(join(brandDir, "icon.svg"));

const SIZES = [1024, 512, 180];

const base = await sharp(svg, { density: 288 }).resize(2048, 2048).png().toBuffer();

for (const size of SIZES) {
  const out = join(brandDir, `app-icon-${size}.png`);
  await sharp(base).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`wrote ${out}  (${meta.width}x${meta.height}, ${meta.channels}ch)`);
}

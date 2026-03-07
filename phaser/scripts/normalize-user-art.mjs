#!/usr/bin/env node
/**
 * Safe asset normalization pipeline (no runtime wiring).
 * Input:  phaser/public/user_art_raw/*.png
 * Output: phaser/public/user_art_clean/*.png
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.resolve(ROOT, 'public', 'user_art_raw');
const OUT = path.resolve(ROOT, 'public', 'user_art_clean');

if (!fs.existsSync(RAW)) {
  console.error(`Missing input folder: ${RAW}`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Please install sharp in phaser/: npm i -D sharp');
  process.exit(1);
}

const files = fs.readdirSync(RAW).filter(f => f.toLowerCase().endsWith('.png'));
if (!files.length) {
  console.log('No PNG files in user_art_raw');
  process.exit(0);
}

for (const f of files) {
  const inPath = path.join(RAW, f);
  const outPath = path.join(OUT, f);

  const img = sharp(inPath).ensureAlpha();
  const meta = await img.metadata();
  const { width, height } = meta;

  // Remove near-white backgrounds (simple key for now), then trim and fit to 128x128
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 240 && g > 240 && b > 240) data[i + 3] = 0;
  }

  await sharp(data, { raw: info })
    .trim({ threshold: 8 })
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'nearest' })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`normalized ${f}`);
}

console.log(`\nDone. Output: ${OUT}`);

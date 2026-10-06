import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** Aya's sheet still matched the PNG at 45. WebP is written beside the PNG in dist/. */
const NEAR = 45;
const DIRS = ['sprites', 'stages', 'icons'];

function pngs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...pngs(path));
    else if (name.endsWith('.png')) out.push(path);
  }
  return out;
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) await fn(items[i++]);
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
}

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const files = DIRS.flatMap(dir => {
  const path = join(dist, dir);
  return existsSync(path) ? pngs(path) : [];
});
if (!files.length) {
  console.error('compress-images: no pngs under dist/. Run vite build first.');
  process.exit(1);
}

let pngBytes = 0;
let webpBytes = 0;
await pool(files, 4, async file => {
  const info = await sharp(file).webp({
    lossless: true,
    nearLossless: true,
    quality: NEAR,
    effort: 6,
    alphaQuality: 100,
  }).toFile(file.slice(0, -4) + '.webp');
  pngBytes += statSync(file).size;
  webpBytes += info.size;
});

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + 'MB';
console.log(`webp near-lossless ${NEAR}: ${files.length} pngs, ${mb(pngBytes)} -> ${mb(webpBytes)}`);

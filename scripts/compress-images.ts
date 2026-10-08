import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** Near-lossless WebP quality. Sprite sheets stay here: a smeared cell reads as a wrong pose. */
const NEAR = 22;
/** Stage backdrops are illustrations. Lossy q80 is several times smaller than near-lossless. */
const STAGE_Q = 80;
/** clips.ts CELL. The select screen only paints this top-left cell. */
const IDLE = 256;
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

const near = { lossless: true, nearLossless: true, quality: NEAR, effort: 6, alphaQuality: 100 } as const;

let pngBytes = 0;
let webpBytes = 0;
await pool(files, 4, async file => {
  const rel = file.replaceAll('\\', '/');
  pngBytes += statSync(file).size;
  if (rel.includes('/stages/')) {
    const info = await sharp(file).webp({ quality: STAGE_Q, effort: 5, alphaQuality: 90 }).toFile(file.slice(0, -4) + '.webp');
    await sharp(file).resize({ width: 480, withoutEnlargement: true }).webp({ quality: STAGE_Q, effort: 4, alphaQuality: 80 }).toFile(file.slice(0, -4) + '-thumb.webp');
    webpBytes += info.size;
    return;
  }
  const info = await sharp(file).webp(near).toFile(file.slice(0, -4) + '.webp');
  webpBytes += info.size;
  if (!rel.endsWith('/common.png')) return;
  const meta = await sharp(file).metadata();
  if ((meta.width ?? 0) < IDLE || (meta.height ?? 0) < IDLE) return;
  await sharp(file).extract({ left: 0, top: 0, width: IDLE, height: IDLE }).webp(near).toFile(file.slice(0, -'common.png'.length) + 'idle.webp');
});

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + 'MB';
console.log(`webp: ${files.length} pngs, ${mb(pngBytes)} -> ${mb(webpBytes)} (sheets near-lossless ${NEAR}, stages q${STAGE_Q})`);

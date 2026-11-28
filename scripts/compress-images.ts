/* PNG → WebP for the production build, behind a content-addressed cache (asset-cache/, committed to git).

   Each png gets a key = sha1(RECIPE + kind + png bytes). The encoded outputs live in asset-cache/<key>.<role>.webp,
   and asset-cache/<key>.json is written last as the "complete" marker. A hit is a file copy; only new or edited
   pngs pay for sharp. Same png → same bytes every build, so asset-manifest hashes (and players' caches) stay put.

   Two modes:
   - default (npm run build): read dist/, copy hits, encode misses into the cache. Never deletes from the cache:
     the Toy release moves unreleased characters out of public/sprites before building, and their entries must
     survive that build.
   - --warm (npm run assets): read public/, fill the cache, then delete entries no png in public/ maps to.
     Run it locally after adding or changing art and commit asset-cache/ with the art.

   Bump RECIPE whenever an encode setting below changes: every key changes and the cache rebuilds. */
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RECIPE = 'v1';
/** Near-lossless WebP quality. Avatars, icons, and the 256px idle crop stay here. */
const NEAR = 22;
/** Large artwork. Lossy q80 is several times smaller than near-lossless. */
const STAGE_Q = 80;
/** clips.ts CELL. The select screen only paints this top-left cell. */
const IDLE = 256;
/** Slow-link stand-in: half size, lossy. Soft, but a fight can start on it; the q80 sheet replaces it. */
const LITE_Q = 70;
const DIRS = ['sprites', 'stages', 'icons', 'avatars', 'finale', 'musou'];

const warm = process.argv.includes('--warm');
const root = fileURLToPath(new URL(warm ? '../public/' : '../dist/', import.meta.url));
const cacheDir = fileURLToPath(new URL('../asset-cache/', import.meta.url));
mkdirSync(cacheDir, { recursive: true });
if (!lstatSync(cacheDir).isDirectory()) throw new Error('asset-cache must be a regular directory');

function pngs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pngs(path));
    else if (entry.isFile() && entry.name.endsWith('.png')) out.push(path);
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

const files = DIRS.flatMap(dir => {
  const path = join(root, dir);
  return existsSync(path) ? pngs(path) : [];
});
if (!files.length) {
  console.error(`compress-images: no pngs under ${warm ? 'public' : 'dist'}/.${warm ? '' : ' Run vite build first.'}`);
  process.exit(1);
}

const near = { lossless: true, nearLossless: true, quality: NEAR, effort: 6, alphaQuality: 100 } as const;
const art = { quality: STAGE_Q, effort: 5, alphaQuality: 90 } as const;

type Role = 'main' | 'thumb' | 'lite' | 'idle';
type Kind = 'finale' | 'stage' | 'mask' | 'sheet' | 'flat' | 'art';

function kindOf(rel: string): Kind {
  if (rel.startsWith('finale/')) return 'finale';
  if (rel.startsWith('stages/')) return 'stage';
  if (rel.endsWith('-hair-mask.png')) return 'mask';
  if (rel.startsWith('sprites/')) return 'sheet';
  if (rel.startsWith('musou/bg/')) return rel.endsWith('-neon.png') ? 'mask' : 'art';
  if (rel.startsWith('musou/mobs/') || rel.startsWith('musou/objects/giant-')) return 'art';
  return 'flat';
}

/** Where each role lands next to the png in dist/. */
function target(file: string, rel: string, role: Role): string {
  const stem = file.slice(0, -4);
  if (role === 'main') return stem + '.webp';
  if (role === 'thumb') return stem + '-thumb.webp';
  if (role === 'lite') return stem + '-lite.webp';
  // Standing sheets only. common.png stays idle.webp; another body (michelle.png) is <name>-idle.webp.
  return rel.endsWith('/common.png') ? file.slice(0, -'common.png'.length) + 'idle.webp' : stem + '-idle.webp';
}

function writeCache(file: string, body: string | Buffer): void {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, body, { flag: 'wx' });
    renameSync(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function encode(bytes: Buffer, kind: Kind, key: string, roles: Role[], width: number): Promise<void> {
  const put = async (role: Role, img: sharp.Sharp) => {
    writeCache(join(cacheDir, `${key}.${role}.webp`), await img.toBuffer());
  };
  if (kind === 'finale') {
    // 终幕 illustrations: full-screen paintings, lossy like the stages, no thumbnail.
    await put('main', sharp(bytes).webp({ quality: STAGE_Q, effort: 5 }));
    return;
  }
  if (kind === 'stage') {
    await put('main', sharp(bytes).webp(art));
    await put('thumb', sharp(bytes).resize({ width: 480, withoutEnlargement: true }).webp({ quality: STAGE_Q, effort: 4, alphaQuality: 80 }));
    return;
  }
  if (kind === 'mask') {
    // Keep the hair dye weights in RGB and the neon silhouette in alpha intact.
    await put('main', sharp(bytes).webp({ lossless: true, effort: 6 }));
    return;
  }
  await put('main', sharp(bytes).webp(kind === 'sheet' || kind === 'art' ? art : near));
  if (kind !== 'sheet') return;
  await put('lite', sharp(bytes).resize({ width: Math.max(1, Math.round(width / 2)) }).webp({ quality: LITE_Q, effort: 5, alphaQuality: 80 }));
  if (roles.includes('idle')) {
    await put('idle', sharp(bytes).extract({ left: 0, top: 0, width: IDLE, height: IDLE }).webp(near));
  }
}

function cached(key: string, roles: Role[]): boolean {
  const marker = join(cacheDir, key + '.json');
  try {
    const info = lstatSync(marker);
    if (!info.isFile() || info.size > 128) return false;
    const saved: unknown = JSON.parse(readFileSync(marker, 'utf8'));
    return Array.isArray(saved) && saved.length === roles.length && roles.every((role, i) => {
      if (saved[i] !== role) return false;
      const output = lstatSync(join(cacheDir, `${key}.${role}.webp`));
      return output.isFile() && output.size > 0;
    });
  } catch {
    return false;
  }
}

// Identical PNGs can share a key even when two workers reach them together.
const entries = new Map<string, Promise<Role[]>>();
let hits = 0;
let misses = 0;
let pngBytes = 0;
let webpBytes = 0;
const t0 = Date.now();

async function fill(bytes: Buffer, kind: Kind, key: string): Promise<Role[]> {
  const roles: Role[] = ['main'];
  const size = kind === 'sheet' ? await sharp(bytes).metadata() : null;
  if (kind === 'stage') roles.push('thumb');
  if (size) {
    roles.push('lite');
    if (size.width >= IDLE * 8 && size.height >= IDLE) roles.push('idle');
  }
  if (cached(key, roles)) hits++;
  else {
    misses++;
    await encode(bytes, kind, key, roles, size?.width ?? 2);
    writeCache(join(cacheDir, key + '.json'), JSON.stringify(roles));
  }
  return roles;
}

await pool(files, Math.max(2, availableParallelism()), async file => {
  const rel = relative(root, file).replaceAll('\\', '/');
  const kind = kindOf(rel);
  const bytes = readFileSync(file);
  pngBytes += bytes.length;
  const key = createHash('sha1').update(RECIPE + '\0' + kind + '\0').update(bytes).digest('hex');
  let entry = entries.get(key);
  if (entry) hits++;
  else {
    entry = fill(bytes, kind, key);
    entries.set(key, entry);
  }
  for (const role of await entry) {
    const src = join(cacheDir, `${key}.${role}.webp`);
    if (role === 'main') webpBytes += statSync(src).size;
    if (!warm) copyFileSync(src, target(file, rel, role));
  }
});

let pruned = 0;
if (warm) {
  for (const { name } of readdirSync(cacheDir, { withFileTypes: true })) {
    const match = /^([a-f0-9]{40})\.(?:json|(?:main|thumb|lite|idle)\.webp)$/.exec(name);
    if (!match || entries.has(match[1])) continue;
    try {
      unlinkSync(join(cacheDir, name));
      pruned++;
    } catch (e) {
      console.warn('compress-images: could not delete asset-cache/' + name + ': ' + (e as Error).message);
    }
  }
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + 'MB';
console.log(
  `webp: ${files.length} pngs, ${mb(pngBytes)} -> ${mb(webpBytes)}; cache ${hits} hit / ${misses} encoded` +
  (warm ? ` / ${pruned} stale files removed` : '') + ` in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);

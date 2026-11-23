/* Writes dist/asset-manifest.json after compress-images: every file the running game can ask for,
   with its size and content hash, grouped for 设置 → 资源 and the background downloader (src/assets/prefetch.ts).
   v2: [path, bytes, hash]. hash = first 8 hex of SHA-256; public/sw.js keeps a cached copy only while it matches,
   so a deploy re-downloads just the files whose bytes changed.
   Portraits are listed as the URL the game requests (?v=<fingerprint>, src/data/portraits.ts): the cache key is the URL.
   `extra` = files only fetched on demand (lite sheets, PNG twins): the worker keeps them, the downloader skips them.
   A png that has a webp twin is listed as the webp (that is what production requests, and the Toy pack
   drops the png). -lite.webp is skipped: only a slow link asks for it, and the full sheet replaces it.
   scripts/pack-toy.py rewrites bgm and portrait size/hash after it re-encodes those zip entries. */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const GROUPS = ['sprites', 'avatars', 'portraits', 'stages', 'finale', 'bgm', 'sfx', 'frames', 'albums', 'fonts', 'icons', 'assets'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const hashOf = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);

/** portraits/<id>.webp → the ?v= the game appends (portraits.gen.ts `h`). */
function portraitQuery(): Map<string, string> {
  const out = new Map<string, string>();
  const src = readFileSync(fileURLToPath(new URL('../src/data/portraits.gen.ts', import.meta.url)), 'utf8');
  for (const m of src.matchAll(/"([a-z0-9-]+)":\s*\{[^}]*?"h":\s*"([0-9a-f]+)"/g)) out.set(m[1], m[2]);
  return out;
}
const pq = portraitQuery();

const files: [string, number, string][] = [];
const extra: [string, number, string][] = [];
for (const group of GROUPS) {
  const dir = join(dist, group);
  if (!existsSync(dir)) continue;
  for (const path of walk(dir)) {
    let rel = relative(dist, path).replace(/\\/g, '/');
    if (/\.(txt|md|map|json)$/i.test(rel)) continue;
    const pm = /^portraits\/([a-z0-9-]+)\.webp$/.exec(rel);
    if (pm) {
      const v = pq.get(pm[1]);
      if (!v) continue; // not wired in portraits.gen.ts: the game never asks for it
      rel += '?v=' + v;
    }
    const entry: [string, number, string] = [rel, statSync(path).size, hashOf(path)];
    if (rel.endsWith('-lite.webp') || (rel.endsWith('.png') && existsSync(path.slice(0, -4) + '.webp'))) extra.push(entry);
    else files.push(entry);
  }
}
files.sort((a, b) => a[0].localeCompare(b[0]));
extra.sort((a, b) => a[0].localeCompare(b[0]));
const total = files.reduce((n, f) => n + f[1], 0);
// build: changes whenever any listed byte changes, so the worker can skip a sweep when nothing moved.
const build = createHash('sha256').update(JSON.stringify([files, extra])).digest('hex').slice(0, 10);
writeFileSync(join(dist, 'asset-manifest.json'), JSON.stringify({ v: 2, build, files, extra, ...(process.env.MF_NO_SW ? { sw: false } : {}) }));
console.log(`asset-manifest: ${files.length} files, ${(total / 1048576).toFixed(1)} MB (+${extra.length} on-demand)`);

/* Writes dist/asset-manifest.json after compress-images: every file the running game can ask for,
   with its size, grouped for 设置 → 资源 → 预载全部资源.
   A png that has a webp twin is listed as the webp (that is what production requests, and the Toy pack
   drops the png). -lite.webp is skipped: only a slow link asks for it, and the full sheet replaces it.
   scripts/pack-toy.py rewrites the bgm sizes after it re-encodes them. */
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

const files: [string, number][] = [];
for (const group of GROUPS) {
  const dir = join(dist, group);
  if (!existsSync(dir)) continue;
  for (const path of walk(dir)) {
    const rel = relative(dist, path).replace(/\\/g, '/');
    if (/\.(txt|md|map|json)$/i.test(rel)) continue;
    if (rel.endsWith('-lite.webp')) continue;
    if (rel.endsWith('.png') && existsSync(path.slice(0, -4) + '.webp')) continue;
    files.push([rel, statSync(path).size]);
  }
}
files.sort((a, b) => a[0].localeCompare(b[0]));
const total = files.reduce((n, f) => n + f[1], 0);
writeFileSync(join(dist, 'asset-manifest.json'), JSON.stringify({ v: 1, files }));
console.log(`asset-manifest: ${files.length} files, ${(total / 1048576).toFixed(1)} MB`);

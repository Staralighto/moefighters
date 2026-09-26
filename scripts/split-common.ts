import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CELL, decodePng, encodePng, type Image } from './align-down.ts';

/* Splits a character's 2048×768 common sheet into two 1024×768 img2img test halves:
   common-a.png (columns 0-3) and common-b.png (columns 4-7). gpt-image2-low draws
   1024 much sharper than 2048; the game keeps reading the full common.png.
   Dev-only artifact: the halves are always derived from common.png, so they are
   overwritten freely and carry no placeholder stamp of their own. */

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites');

function run(id: string): void {
  const src = join(dir, id, 'common.png');
  const img = decodePng(readFileSync(src));
  if (img.w !== 8 * CELL || img.h !== 3 * CELL) {
    throw Error(`${src} 是 ${img.w}×${img.h}，只认 2048×768 的 common 表`);
  }
  for (const [name, col0] of [['common-a.png', 0], ['common-b.png', 4]] as const) {
    const out: Image = { w: 4 * CELL, h: 3 * CELL, rgba: Buffer.alloc(4 * CELL * 3 * CELL * 4) };
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const si = (y * img.w + col0 * CELL + x) * 4;
        const di = (y * out.w + x) * 4;
        out.rgba[di] = img.rgba[si];
        out.rgba[di + 1] = img.rgba[si + 1];
        out.rgba[di + 2] = img.rgba[si + 2];
        out.rgba[di + 3] = img.rgba[si + 3];
      }
    }
    const dest = join(dir, id, name);
    writeFileSync(dest, encodePng(out));
    console.log('wrote ' + dest);
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const id = process.argv[2];
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    console.log('用法: node --experimental-strip-types scripts/split-common.ts <角色id>');
    console.log('      例: node --experimental-strip-types scripts/split-common.ts taki');
    process.exit(1);
  }
  run(id);
}

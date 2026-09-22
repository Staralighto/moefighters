import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

/* Shifts the knockdown and KO cells so the body sits on the shared foot line.
   Writes a sibling preview. --accept moves the original into 素材/archive and renames the preview.
   ponytail: RGBA-8 sheets only. Anything else throws instead of guessing a color type. */

export const CELL = 256;
export const FOOT = 12;
/** Last content row. Rows 244..255 are the 12px margin, so the bottom edge is y=244. */
export const TARGET = CELL - FOOT - 1;
const SHEET_W = 2048;
const SHEET_H = 768;
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CELLS = [
  { name: '倒地', col: 1, row: 1 },
  { name: '倒下', col: 0, row: 2 },
] as const;

export interface Image {
  w: number;
  h: number;
  rgba: Buffer;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
  return out;
}

export function decodePng(buf: Buffer): Image {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('不是 PNG');
  let w = 0, h = 0, color = 0;
  const idats: Buffer[] = [];
  let o = 8;
  while (o + 12 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (o + 12 + len > buf.length) throw new Error('PNG 被截断');
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[10] !== 0) throw new Error('只接受 8 位、不交错的 PNG');
      color = data[9];
      if (color !== 2 && color !== 6) throw new Error('只接受 RGB 或 RGBA，当前颜色类型 ' + color);
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (!w || !idats.length) throw new Error('PNG 缺少图像数据');
  const bpp = color === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idats));
  const rgba = Buffer.alloc(w * h * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[src++];
    const row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[src++];
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = x;
      if (filter === 1) v = (x + a) & 255;
      else if (filter === 2) v = (x + b) & 255;
      else if (filter === 3) v = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (x + pr) & 255;
      } else if (filter !== 0) throw new Error('不认识的 PNG 过滤 ' + filter);
      row[i] = v;
    }
    prev = row;
    for (let x = 0; x < w; x++) {
      const s = x * bpp;
      const d = (y * w + x) * 4;
      rgba[d] = row[s];
      rgba[d + 1] = row[s + 1];
      rgba[d + 2] = row[s + 2];
      rgba[d + 3] = bpp === 4 ? row[s + 3] : 255;
    }
  }
  return { w, h, rgba };
}

export function encodePng(img: Image): Buffer {
  const stride = img.w * 4;
  const raw = Buffer.alloc((stride + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    const at = (stride + 1) * y;
    raw[at] = 0;
    img.rgba.copy(raw, at + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Character pixel. Green, the magenta grid, and the dark sheet fill are empty. */
export function ink(rgba: Buffer, i: number): boolean {
  const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
  if (a <= 24) return false;
  if (g > 240 && r < 20 && b < 20) return false;
  if (Math.abs(r - 255) <= 8 && Math.abs(g - 54) <= 12 && Math.abs(b - 200) <= 12) return false;
  if (Math.abs(r - 26) <= 3 && Math.abs(g - 21) <= 3 && Math.abs(b - 40) <= 3) return false;
  return true;
}

export interface Shift {
  name: string;
  dy: number;
  from: number;
  empty?: boolean;
}

/** Move one cell straight down or up so its lowest pixel lands on the foot line. Other pixels in the cell stay. */
export function alignCell(img: Image, col: number, row: number, name: string): Shift {
  const x0 = col * CELL, y0 = row * CELL;
  let minY = CELL, maxY = -1;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 4;
      if (!ink(img.rgba, i)) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxY < 0) return { name, dy: 0, from: -1, empty: true };
  const dy = TARGET - maxY;
  if (minY + dy < 0) {
    throw new Error(`${name} 下移 ${dy}px 会把头顶切掉 ${-(minY + dy)}px，已停止，原图未改`);
  }
  let bg = -1;
  const corner = (y0 * img.w + x0) * 4;
  if (!ink(img.rgba, corner)) bg = corner;
  else {
    for (let y = 0; y < CELL && bg < 0; y++) {
      for (let x = 0; x < CELL; x++) {
        const i = ((y0 + y) * img.w + x0 + x) * 4;
        if (!ink(img.rgba, i)) { bg = i; break; }
      }
    }
  }
  if (bg < 0) throw new Error(`${name} 整格都是角色，没有可填充的底色`);
  const next = Buffer.alloc(CELL * CELL * 4);
  for (let p = 0; p < next.length; p += 4) {
    next[p] = img.rgba[bg];
    next[p + 1] = img.rgba[bg + 1];
    next[p + 2] = img.rgba[bg + 2];
    next[p + 3] = img.rgba[bg + 3];
  }
  for (let y = 0; y < CELL; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= CELL) continue;
    for (let x = 0; x < CELL; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 4;
      if (!ink(img.rgba, i)) continue;
      img.rgba.copy(next, (ny * CELL + x) * 4, i, i + 4);
    }
  }
  for (let y = 0; y < CELL; y++) {
    const i = ((y0 + y) * img.w + x0) * 4;
    next.copy(img.rgba, i, y * CELL * 4, (y + 1) * CELL * 4);
  }
  return { name, dy, from: maxY };
}

function previewPath(src: string): string {
  const dir = dirname(src);
  const base = basename(src).replace(/\.png$/i, '');
  return join(dir, base + '.aligned.png');
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

/** Original goes to 素材/archive/<id>/. A name already there is kept and this one gets a time suffix. */
export function archiveDest(src: string, root = repoRoot()): string {
  const id = basename(dirname(src));
  const dir = join(root, '素材', 'archive', id);
  const file = basename(src);
  const plain = join(dir, file);
  if (!existsSync(plain)) return plain;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const stem = file.replace(/\.png$/i, '');
  return join(dir, `${stem}-${stamp}.png`);
}

function alignFile(src: string): string {
  const abs = resolve(src);
  const img = decodePng(readFileSync(abs));
  if (img.w !== SHEET_W || img.h !== SHEET_H) {
    throw new Error(`通用表必须是 ${SHEET_W}×${SHEET_H}，这张是 ${img.w}×${img.h}`);
  }
  const out = previewPath(abs);
  const notes = CELLS.map(c => alignCell(img, c.col, c.row, c.name));
  if (notes.every(n => n.empty)) throw new Error('倒地和倒下两格都是空的');
  writeFileSync(out, encodePng(img));
  for (const n of notes) {
    if (n.empty) console.log(`${n.name} 是空格，跳过`);
    else console.log(`${n.name} 底边 ${n.from} → ${TARGET}（y=244 以下留 ${FOOT}px），${n.dy >= 0 ? '下移' : '上移'} ${Math.abs(n.dy)}px`);
  }
  console.log('写出 ' + out);
  console.log('原图未改。看过之后：node --experimental-strip-types scripts/align-down.ts "' + src + '" --accept');
  return out;
}

function acceptFile(src: string): void {
  const abs = resolve(src);
  const preview = previewPath(abs);
  if (!existsSync(abs)) throw new Error('找不到原图 ' + abs);
  if (!existsSync(preview)) throw new Error('还没有预览图。先不加 --accept 跑一次。');
  const dest = archiveDest(abs);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(abs, dest);
  renameSync(preview, abs);
  console.log('原图移到 ' + dest);
  console.log('预览图改名为 ' + abs);
}

function selfCheck(): void {
  const img: Image = { w: SHEET_W, h: SHEET_H, rgba: Buffer.alloc(SHEET_W * SHEET_H * 4, 0) };
  for (let i = 3; i < img.rgba.length; i += 4) img.rgba[i] = 0;
  const paint = (col: number, row: number, y: number) => {
    const i = ((row * CELL + y) * SHEET_W + col * CELL + 20) * 4;
    img.rgba[i] = 255; img.rgba[i + 1] = 80; img.rgba[i + 2] = 120; img.rgba[i + 3] = 255;
  };
  paint(1, 1, 100);
  paint(0, 2, 40);
  const down = alignCell(img, 1, 1, '倒地');
  const ko = alignCell(img, 0, 2, '倒下');
  if (down.dy !== TARGET - 100 || ko.dy !== TARGET - 40) throw new Error('位移算错');
  const at = (col: number, row: number, y: number) => {
    const i = ((row * CELL + y) * SHEET_W + col * CELL + 20) * 4;
    return img.rgba[i + 3];
  };
  if (at(1, 1, TARGET) !== 255 || at(1, 1, 100) !== 0) throw new Error('倒地没有落到脚线');
  if (at(0, 2, TARGET) !== 255 || at(1, 1, 244) !== 0) throw new Error('留白被画上了');
  const idle = (0 * SHEET_W + 30) * 4;
  img.rgba[idle + 3] = 255;
  alignCell(img, 1, 1, '倒地');
  if (img.rgba[idle + 3] !== 255) throw new Error('动到了别的格子');
  const round = decodePng(encodePng({ w: 1, h: 1, rgba: Buffer.from([1, 2, 3, 4]) }));
  if (round.rgba[0] !== 1 || round.rgba[3] !== 4) throw new Error('PNG 往返失败');
  const dir = join(tmpdir(), 'align-down-' + process.pid);
  mkdirSync(join(dir, 'anon'), { recursive: true });
  const src = join(dir, 'anon', 'common.png');
  writeFileSync(src, 'orig');
  writeFileSync(join(dir, 'anon', 'common.png'), 'orig');
  const first = archiveDest(src, dir);
  mkdirSync(dirname(first), { recursive: true });
  writeFileSync(first, 'keep');
  const second = archiveDest(src, dir);
  if (second === first) throw new Error('归档会盖掉上一张原图');
  console.log('align-down check ok');
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2).filter(a => a !== '--accept');
  const accept = process.argv.includes('--accept');
  if (args.includes('--check')) {
    selfCheck();
  } else if (args.length !== 1) {
    console.log('用法: node --experimental-strip-types scripts/align-down.ts <common.png> [--accept]');
    console.log('      不加 --accept 时写出同目录的 common.aligned.png，不覆盖原图。');
    console.log('      --accept 把原图移到 素材/archive/<角色>/，预览图改回原名。');
    process.exit(args.includes('--help') ? 0 : 1);
  } else if (accept) {
    acceptFile(args[0]);
  } else {
    alignFile(args[0]);
  }
}

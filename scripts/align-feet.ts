import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CELL, FOOT, TARGET, archiveDest, decodePng, encodePng, ink,
  type Image,
} from './align-down.ts';

/* Slides a whole common sheet so idle, the four walks and block share the foot line.
   Jumps and knockdowns keep their offset from those feet. Writes a sibling preview.
   ponytail: one vertical shift. Outliers inside the sheet stay outliers. */

const SHEET_W = 2048;
const SHEET_H = 768;

const FEET = [
  { name: '站立', col: 0 },
  { name: '走1', col: 1 },
  { name: '走2', col: 2 },
  { name: '走3', col: 3 },
  { name: '走4', col: 4 },
  { name: '格挡', col: 6 },
] as const;

export function cellBottom(img: Image, col: number, row: number): number {
  const x0 = col * CELL;
  const y0 = row * CELL;
  let max = -1;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 4;
      if (ink(img.rgba, i) && y > max) max = y;
    }
  }
  return max;
}

/** Even counts round the two middle values. 253 and 254 become 254. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  if (s.length % 2 === 1) return s[mid];
  return Math.round((s[mid - 1] + s[mid]) / 2);
}

export function footShift(img: Image): { bottoms: { name: string; y: number }[]; mid: number; dy: number } {
  const bottoms = FEET.map(f => ({ name: f.name, y: cellBottom(img, f.col, 0) }));
  const present = bottoms.filter(b => b.y >= 0);
  if (present.length < 4) throw new Error('站立、走路、格挡里能用的脚线不足 4 格');
  const mid = median(present.map(b => b.y));
  return { bottoms, mid, dy: TARGET - mid };
}

function backgroundAt(img: Image): number {
  const empty = ((2 * CELL) * img.w + 7 * CELL) * 4;
  if (empty + 3 < img.rgba.length && !ink(img.rgba, empty)) return empty;
  for (let i = 0; i < img.rgba.length; i += 4) if (!ink(img.rgba, i)) return i;
  throw new Error('整张表都是角色，没有可填充的底色');
}

/** Positive dy moves the picture down. Throws instead of clipping. */
export function shiftSheet(img: Image, dy: number): void {
  if (dy === 0) return;
  for (let y = 0; y < img.h; y++) {
    const ny = y + dy;
    if (ny >= 0 && ny < img.h) continue;
    for (let x = 0; x < img.w; x++) {
      if (ink(img.rgba, (y * img.w + x) * 4)) {
        throw new Error(`平移 ${dy}px 会把像素切出表外，已停止，原图未改`);
      }
    }
  }
  const bg = backgroundAt(img);
  const next = Buffer.alloc(img.rgba.length);
  for (let p = 0; p < next.length; p += 4) {
    next[p] = img.rgba[bg];
    next[p + 1] = img.rgba[bg + 1];
    next[p + 2] = img.rgba[bg + 2];
    next[p + 3] = img.rgba[bg + 3];
  }
  for (let y = 0; y < img.h; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= img.h) continue;
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      if (!ink(img.rgba, i)) continue;
      img.rgba.copy(next, (ny * img.w + x) * 4, i, i + 4);
    }
  }
  img.rgba = next;
}

function previewPath(src: string): string {
  const base = basename(src).replace(/\.png$/i, '');
  return join(dirname(src), base + '.feet.png');
}

function alignFile(src: string): void {
  const abs = resolve(src);
  const img = decodePng(readFileSync(abs));
  if (img.w !== SHEET_W || img.h !== SHEET_H) {
    throw new Error(`通用表必须是 ${SHEET_W}×${SHEET_H}，这张是 ${img.w}×${img.h}`);
  }
  const plan = footShift(img);
  for (const b of plan.bottoms) console.log(`${b.name} 底边 ${b.y < 0 ? '空' : b.y}`);
  const way = plan.dy > 0 ? '下移' : '上移';
  console.log(`六格中位数 ${plan.mid} → ${TARGET}（y=244 以下留 ${FOOT}px），${plan.dy === 0 ? '已经对齐' : way + ' ' + Math.abs(plan.dy) + 'px'}`);
  if (plan.dy === 0) {
    console.log('未写预览图。');
    return;
  }
  shiftSheet(img, plan.dy);
  const out = previewPath(abs);
  writeFileSync(out, encodePng(img));
  console.log('写出 ' + out);
  console.log('原图未改。看过之后：node --experimental-strip-types scripts/align-feet.ts "' + src + '" --accept');
  console.log('倒地和倒下相对这个人偏高，确认这张之后再跑 align-down.ts。');
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
  if (median([244, 249, 249, 246, 249, 249]) !== 249) throw new Error('爱音中位数');
  if (median([252, 253, 253, 254, 254, 254]) !== 254) throw new Error('祥子中位数');
  const img: Image = { w: SHEET_W, h: SHEET_H, rgba: Buffer.alloc(SHEET_W * SHEET_H * 4) };
  const paint = (col: number, row: number, y: number) => {
    const i = ((row * CELL + y) * SHEET_W + col * CELL + 8) * 4;
    img.rgba[i] = 255; img.rgba[i + 1] = 40; img.rgba[i + 2] = 80; img.rgba[i + 3] = 255;
  };
  paint(0, 0, 249); paint(1, 0, 244); paint(2, 0, 249); paint(3, 0, 246); paint(4, 0, 249); paint(6, 0, 249);
  paint(5, 0, 197);
  paint(1, 1, 233);
  const plan = footShift(img);
  if (plan.mid !== 249 || plan.dy !== TARGET - 249) throw new Error('脚线位移算错');
  shiftSheet(img, plan.dy);
  const at = (col: number, row: number, y: number) => img.rgba[((row * CELL + y) * SHEET_W + col * CELL + 8) * 4 + 3];
  if (at(0, 0, TARGET) !== 255 || at(5, 0, 197 + plan.dy) !== 255) throw new Error('跳跃没有跟着脚一起走');
  if (at(1, 1, 233 + plan.dy) !== 255 || at(1, 1, TARGET) === 255) throw new Error('倒地被拉到了脚线上');
  console.log('align-feet check ok');
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2).filter(a => a !== '--accept');
  const accept = process.argv.includes('--accept');
  if (args.includes('--check')) {
    selfCheck();
  } else if (args.length !== 1) {
    console.log('用法: node --experimental-strip-types scripts/align-feet.ts <common.png> [--accept]');
    console.log('      不加 --accept 时写出同目录的 common.feet.png，不覆盖原图。');
    console.log('      --accept 把原图移到 素材/archive/<角色>/，预览图改回原名。');
    process.exit(args.includes('--help') ? 0 : 1);
  } else if (accept) {
    acceptFile(args[0]);
  } else {
    alignFile(args[0]);
  }
}

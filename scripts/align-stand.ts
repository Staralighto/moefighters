import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CELL, FOOT, TARGET, archiveDest, decodePng, encodePng, ink, type Image, type Shift } from './align-down.ts';

/* Per-cell foot line. Each listed cell slides on its own so its lowest ink pixel lands on
   y=243. A common sheet's default list is every cell with a foot on the ground: all 24
   except jump (6), knockdown (10), KO and the six aerials (17–23), and the empty cell.
   Any other sheet needs --cells.
   ponytail: one vertical slide per cell. A raised foot keeps its offset from the planted one. */

const COMMON_W = 2048;
const COMMON_H = 768;

export interface StandCell {
  name: string;
  col: number;
  row: number;
}

/** Grounded cells of the 8×3 common sheet, numbered left to right, top to bottom from 1.
    Left out: 6 跳, 10 倒地, 17–23 倒下和空中, 24 空格. */
export const COMMON_STANDING: StandCell[] = [
  { name: '站立', col: 0, row: 0 },
  { name: '走1', col: 1, row: 0 },
  { name: '走2', col: 2, row: 0 },
  { name: '走3', col: 3, row: 0 },
  { name: '走4', col: 4, row: 0 },
  { name: '格挡', col: 6, row: 0 },
  { name: '闪避', col: 7, row: 0 },
  { name: '受击', col: 0, row: 1 },
  { name: '轻击前摇', col: 2, row: 1 },
  { name: '轻击命中', col: 3, row: 1 },
  { name: '轻击收势', col: 4, row: 1 },
  { name: '重击前摇', col: 5, row: 1 },
  { name: '重击命中', col: 6, row: 1 },
  { name: '重击收势', col: 7, row: 1 },
];

function span(img: Image, col: number, row: number): { foot: number; top: number } {
  const x0 = col * CELL, y0 = row * CELL;
  let foot = -1, top = CELL;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 4;
      if (img.rgba[i + 3] === 0) continue;
      if (y < top) top = y;
      if (ink(img.rgba, i) && y > foot) foot = y;
    }
  }
  return { foot, top };
}

function leavingInk(img: Image, col: number, row: number, dy: number): number {
  const x0 = col * CELL, y0 = row * CELL;
  let n = 0;
  for (let y = 0; y < CELL; y++) {
    const ny = y + dy;
    if (ny >= 0 && ny < CELL) continue;
    for (let x = 0; x < CELL; x++) {
      if (ink(img.rgba, ((y0 + y) * img.w + x0 + x) * 4)) n++;
    }
  }
  return n;
}

/** Slide one cell. Faint edge pixels move with the ink, so the fringe is not left behind. */
function shiftCell(img: Image, col: number, row: number, dy: number): void {
  if (dy === 0) return;
  const x0 = col * CELL, y0 = row * CELL;
  const next = Buffer.alloc(CELL * CELL * 4);
  for (let y = 0; y < CELL; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= CELL) continue;
    const src = ((y0 + y) * img.w + x0) * 4;
    img.rgba.copy(next, ny * CELL * 4, src, src + CELL * 4);
  }
  for (let y = 0; y < CELL; y++) {
    next.copy(img.rgba, ((y0 + y) * img.w + x0) * 4, y * CELL * 4, (y + 1) * CELL * 4);
  }
}

export function alignStanding(img: Image, cells: StandCell[], force = false): Shift[] {
  const cols = img.w / CELL, rows = img.h / CELL;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    throw new Error(`这张是 ${img.w}×${img.h}，不是 ${CELL} 格的整数倍`);
  }
  const seen = new Set<string>();
  const plans: { cell: StandCell; dy: number; from: number; cut: number }[] = [];
  for (const cell of cells) {
    const key = `${cell.col},${cell.row}`;
    if (seen.has(key)) throw new Error(`${cell.name} 和另一格是同一格`);
    seen.add(key);
    if (cell.col < 0 || cell.row < 0 || cell.col >= cols || cell.row >= rows) {
      throw new Error(`${cell.name} 不在这张 ${cols} 列 × ${rows} 行的表里`);
    }
    const box = span(img, cell.col, cell.row);
    if (box.foot < 0) throw new Error(`${cell.name} 是空格`);
    const dy = TARGET - box.foot;
    const cut = leavingInk(img, cell.col, cell.row, dy);
    if (cut > 0 && !force) {
      const way = dy > 0 ? '下移' : '上移';
      throw new Error(`${cell.name} ${way} ${Math.abs(dy)}px 会把像素切出格子，已停止，原图未改`);
    }
    plans.push({ cell, dy, from: box.foot, cut });
  }
  for (const plan of plans) {
    if (plan.cut > 0) {
      const way = plan.dy > 0 ? '下移' : '上移';
      console.log(`${plan.cell.name} 强行${way} ${Math.abs(plan.dy)}px，切掉 ${plan.cut} 个不透明像素`);
    }
    shiftCell(img, plan.cell.col, plan.cell.row, plan.dy);
  }
  return plans.map(plan => ({ name: plan.cell.name, dy: plan.dy, from: plan.from }));
}

function cellsFor(img: Image, listed: StandCell[] | null): StandCell[] {
  if (listed) return listed;
  if (img.w === COMMON_W && img.h === COMMON_H) return COMMON_STANDING;
  throw new Error('这张表没有内置的站立格。用 --cells 列,行 指定，例如 --cells 2,1 0,2');
}

function parseCells(tokens: string[]): StandCell[] {
  return tokens.map(token => {
    const m = /^(\d+),(\d+)$/.exec(token);
    if (!m) throw new Error(`格子写成 列,行，例如 2,1，不能是 ${token}`);
    const col = Number(m[1]), row = Number(m[2]);
    return { name: `列${col}行${row}`, col, row };
  });
}

function previewPath(src: string): string {
  const base = basename(src).replace(/\.png$/i, '');
  return join(dirname(src), base + '.stand.png');
}

function alignFile(src: string, listed: StandCell[] | null, force: boolean): void {
  const abs = resolve(src);
  const img = decodePng(readFileSync(abs));
  const cells = cellsFor(img, listed);
  const notes = alignStanding(img, cells, force);
  for (const n of notes) {
    const way = n.dy > 0 ? '下移' : '上移';
    console.log(`${n.name} 底边 ${n.from} → ${TARGET}（y=244 以下留 ${FOOT}px）${n.dy === 0 ? '，已经对齐' : '，' + way + ' ' + Math.abs(n.dy) + 'px'}`);
  }
  if (notes.every(n => n.dy === 0)) {
    console.log('未写预览图。');
    return;
  }
  const out = previewPath(abs);
  writeFileSync(out, encodePng(img));
  console.log('写出 ' + out);
  console.log('原图未改。看过之后：node --experimental-strip-types scripts/align-stand.ts "' + src + '"' + (listed ? ' --cells ' + listed.map(c => `${c.col},${c.row}`).join(' ') : '') + ' --accept');
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
  const img: Image = { w: COMMON_W, h: COMMON_H, rgba: Buffer.alloc(COMMON_W * COMMON_H * 4) };
  const paint = (col: number, row: number, x: number, y: number, a = 255) => {
    const i = ((row * CELL + y) * COMMON_W + col * CELL + x) * 4;
    img.rgba[i] = 20; img.rgba[i + 1] = 180; img.rgba[i + 2] = 190; img.rgba[i + 3] = a;
  };
  paint(0, 0, 40, 100);
  paint(0, 0, 40, 250);
  paint(0, 0, 41, 252, 10);
  paint(1, 0, 40, 230);
  paint(2, 0, 40, 248);
  paint(3, 0, 40, 236);
  paint(4, 0, 40, 251);
  paint(6, 0, 40, TARGET);
  paint(7, 0, 40, 246);
  paint(0, 1, 40, 240);
  for (let col = 2; col < 8; col++) paint(col, 1, 40, 228 + col);
  paint(5, 0, 40, 180);
  paint(1, 1, 40, 200);
  paint(0, 2, 40, 190);
  const notes = alignStanding(img, COMMON_STANDING.map(c => ({ ...c })));
  const at = (col: number, row: number, x: number, y: number) => img.rgba[((row * CELL + y) * COMMON_W + col * CELL + x) * 4 + 3];
  if (COMMON_STANDING.length !== 14) throw new Error('着地格应为 14');
  if (notes[0].dy !== TARGET - 250 || at(0, 0, 40, TARGET) !== 255 || at(0, 0, 40, 93) !== 255) throw new Error('站立没有整格落到脚线');
  if (at(0, 0, 41, TARGET + 2) !== 10) throw new Error('发丝边缘被丢掉了');
  if (at(1, 0, 40, TARGET) !== 255) throw new Error('走1 没有单独落下');
  if (at(6, 0, 40, TARGET) !== 255) throw new Error('已经对齐的格挡被挪动了');
  if (at(0, 1, 40, TARGET) !== 255 || at(7, 1, 40, TARGET) !== 255) throw new Error('受击或重击收势没有落到脚线');
  if (at(5, 0, 40, 180) !== 255 || at(1, 1, 40, 200) !== 255 || at(0, 2, 40, 190) !== 255) throw new Error('跳、倒地或倒下被拉到了脚线上');
  const tall: Image = { w: COMMON_W, h: COMMON_H, rgba: Buffer.alloc(COMMON_W * COMMON_H * 4) };
  const tallPaint = (y: number) => {
    const i = (y * COMMON_W + 8) * 4;
    tall.rgba[i + 3] = 255;
  };
  tallPaint(5);
  tallPaint(255);
  let threw = false;
  try { alignStanding(tall, [{ name: '站立', col: 0, row: 0 }]); } catch { threw = true; }
  if (!threw || tall.rgba[(255 * COMMON_W + 8) * 4 + 3] !== 255) throw new Error('头顶出格没有停在原图上');
  const forced: Image = { w: 1024, h: COMMON_H, rgba: Buffer.alloc(1024 * COMMON_H * 4) };
  forced.rgba[(0 * 1024 + 8) * 4 + 3] = 255;
  forced.rgba[(255 * 1024 + 8) * 4 + 3] = 255;
  alignStanding(forced, [{ name: '列0行0', col: 0, row: 0 }], true);
  if (forced.rgba[(TARGET * 1024 + 8) * 4 + 3] !== 255 || forced.rgba[(0 * 1024 + 8) * 4 + 3] !== 0) throw new Error('强行对齐没有切掉出格像素');
  const four: Image = { w: 1024, h: COMMON_H, rgba: Buffer.alloc(1024 * COMMON_H * 4) };
  const paint4 = (col: number, row: number, y: number) => {
    const i = ((row * CELL + y) * 1024 + col * CELL + 8) * 4;
    four.rgba[i + 3] = 255;
  };
  paint4(2, 1, 220);
  paint4(0, 0, 200);
  alignStanding(four, [{ name: '列2行1', col: 2, row: 1 }]);
  if (four.rgba[((1 * CELL + TARGET) * 1024 + 2 * CELL + 8) * 4 + 3] !== 255) throw new Error('指定格没有落到脚线');
  if (four.rgba[(200 * 1024 + 8) * 4 + 3] !== 255) throw new Error('没点名的格被挪了');
  let refused = false;
  try { cellsFor(four, null); } catch { refused = true; }
  if (!refused) throw new Error('没有内置站立格的表被放行了');
  console.log('align-stand check ok');
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const accept = argv.includes('--accept');
  const check = argv.includes('--check');
  const force = argv.includes('--force');
  const cellAt = argv.indexOf('--cells');
  const listed = cellAt < 0 ? null : parseCells(argv.slice(cellAt + 1).filter(token => /^\d+,\d+$/.test(token)));
  const src = argv.find(token => token !== '--accept' && token !== '--check' && token !== '--force' && token !== '--cells' && !/^\d+,\d+$/.test(token));
  if (check) {
    selfCheck();
  } else if (!src || (cellAt >= 0 && !listed?.length)) {
    console.log('用法: node --experimental-strip-types scripts/align-stand.ts <sheet.png> [--cells 列,行 ...] [--force] [--accept]');
    console.log('      2048×768 的通用表不用 --cells：除去跳、倒地、倒下、空中和空格，每格各自落到脚线。');
    console.log('      必杀表和其他表要自己点名，例如 --cells 2,1 0,2');
    console.log('      不加 --accept 时写出同目录的 <名>.stand.png，不覆盖原图。');
    console.log('      --force 在会切出格子时仍对齐，并记下切掉的不透明像素。');
    console.log('      --check 跑自测。');
    process.exit(argv.includes('--help') ? 0 : 1);
  } else if (accept) {
    acceptFile(src);
  } else {
    alignFile(src, listed, force);
  }
}

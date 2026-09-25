import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CELL, TARGET, archiveDest, decodePng, encodePng, ink, type Image } from './align-down.ts';
import { cellBottom, median } from './align-feet.ts';
import { isPlaceholderPng } from './sprite-guard.ts';

/* Rescales a finished sheet about its foot line with one factor for every cell, then re-lands
   that line on y=244. Premultiplied bilinear on the transparent background, so edges blend
   toward nothing instead of toward green. Cells that would leave their 256 box slide aside;
   aerial cells slide down as a whole combo so the three phases stay at one height (at most
   MAX_LIFT), anything worse stops with the original untouched.
   Writes a sibling preview. --accept archives the original into 素材/archive and renames the preview.
   Colour blocks (placeholder-marked) are refused: change the sheet script's SCALE and re-raster. */

const MAX_LIFT = 8;
const ROW0 = ['站立', '走1', '走2', '走3', '走4', '跳', '格挡', '闪'];
/* Aerial cells of the 8×3 common sheet, grouped as they play: the jump, the three air-light
   phases, the three air-heavy phases. One lift per group keeps the combo from wobbling. */
const AIR_GROUPS: { col: number; row: number }[][] = [
  [{ col: 5, row: 0 }],
  [{ col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 }],
  [{ col: 4, row: 2 }, { col: 5, row: 2 }, { col: 6, row: 2 }],
];

interface Note { name: string; dx: number; dy: number }
interface Layout { cols: number; rows: number; refs: { col: number; row: number }[] }

function layoutOf(img: Image): Layout {
  if (img.w === 2048 && img.h === 768) {
    const refs = [0, 1, 2, 3, 4, 6].map(col => ({ col, row: 0 }));
    return { cols: 8, rows: 3, refs };
  }
  if (img.w === 1024 && img.h === 768) {
    const refs: { col: number; row: number }[] = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      if (cellBottom(img, col, row) >= 0) refs.push({ col, row });
    }
    if (refs.length < 4) throw new Error('非空格不足 4 个，定不出脚线');
    return { cols: 4, rows: 3, refs };
  }
  throw new Error(`只认 2048×768 通用表或 1024×768 四格表，这张是 ${img.w}×${img.h}`);
}

function cellName(img: Image, col: number, row: number): string {
  if (img.w === 2048 && row === 0) return ROW0[col];
  return `第${row + 1}行第${col + 1}格`;
}

function cellBBox(img: Image, col: number, row: number) {
  const x0 = col * CELL, y0 = row * CELL;
  let minX = CELL, maxX = -1, minY = CELL, maxY = -1;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 4;
      if (!ink(img.rgba, i)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY, empty: maxX < 0 };
}

/** One resampled cell pasted into `out` at its final place. Float dx/dy fold into the sampling,
    so the content moves and scales in a single resample. */
function scaleCell(out: Buffer, img: Image, col: number, row: number, k: number, ax: number, ay: number, dx: number, dy: number, globalUp: number): void {
  const x0 = col * CELL, y0 = row * CELL;
  const w = img.w;
  for (let y = 0; y < CELL; y++) {
    const sy = ay + (y - ay - dy + globalUp) / k;
    const yi = Math.floor(sy);
    const fy = sy - yi;
    for (let x = 0; x < CELL; x++) {
      const sx = ax + (x - ax - dx) / k;
      const xi = Math.floor(sx);
      const fx = sx - xi;
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let sy2 = yi; sy2 <= yi + 1; sy2++) {
        if (sy2 < 0 || sy2 >= CELL) continue;
        const wy = sy2 === yi ? 1 - fy : fy;
        for (let sx2 = xi; sx2 <= xi + 1; sx2++) {
          if (sx2 < 0 || sx2 >= CELL) continue;
          const wx = sx2 === xi ? 1 - fx : fx;
          const wgt = wx * wy;
          if (wgt === 0) continue;
          const i = ((y0 + sy2) * w + x0 + sx2) * 4;
          const a = img.rgba[i + 3];
          pr += img.rgba[i] * a * wgt;
          pg += img.rgba[i + 1] * a * wgt;
          pb += img.rgba[i + 2] * a * wgt;
          pa += a * wgt;
        }
      }
      const d = ((y0 + y) * w + x0 + x) * 4;
      if (pa <= 0) continue;
      const a = Math.min(255, Math.round(pa));
      out[d] = Math.min(255, Math.round(pr / pa));
      out[d + 1] = Math.min(255, Math.round(pg / pa));
      out[d + 2] = Math.min(255, Math.round(pb / pa));
      out[d + 3] = a;
    }
  }
}

export function scaleSheet(img: Image, k: number): { notes: Note[]; footBefore: number; footAfter: number; idleBefore: number; idleAfter: number } {
  /* k=1 is a lossless foot-line alignment: the bilinear taps land on whole pixels. */
  if (!Number.isFinite(k) || k < 1 || k > 1.3) throw new Error('缩放系数要在 [1, 1.3] 里');
  const layout = layoutOf(img);
  const bottoms = layout.refs.map(r => cellBottom(img, r.col, r.row)).filter(y => y >= 0);
  if (bottoms.length < 4) throw new Error('能用的脚线不足 4 格，定不出锚点');
  const footBefore = median(bottoms);
  const idle = cellBBox(img, 0, 0);
  const idleBefore = idle.empty ? -1 : idle.maxY - idle.minY + 1;
  const globalUp = footBefore - TARGET;
  const rgba = Buffer.alloc(img.rgba.length);
  const notes: Note[] = [];
  /* Pass 1: scaled extents, the horizontal slide, and the per-cell lift need. */
  interface Plan { col: number; row: number; dx: number; need: number }
  const plans: Plan[] = [];
  const groupOf = new Map<string, number>();
  AIR_GROUPS.forEach((g, gi) => g.forEach(c => groupOf.set(`${c.col},${c.row}`, gi)));
  const groups = AIR_GROUPS.map(() => ({ need: 0, worst: '' }));
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const b = cellBBox(img, col, row);
      if (b.empty) continue;
      const ax = 128, ay = footBefore;
      const sMinX = ax + (b.minX - ax) * k, sMaxX = ax + (b.maxX - ax) * k;
      const sMinY = ay + (b.minY - ay) * k, sMaxY = ay + (b.maxY - ay) * k;
      if (sMaxX - sMinX > CELL - 1) throw new Error(`${cellName(img, col, row)} 放大后宽 ${Math.round(sMaxX - sMinX)}px，超出 256 格`);
      if (sMaxY - sMinY > CELL - 1) throw new Error(`${cellName(img, col, row)} 放大后高 ${Math.round(sMaxY - sMinY)}px，超出 256 格`);
      let dx = 0;
      if (sMinX < 0) dx = -sMinX;
      else if (sMaxX > CELL - 1) dx = (CELL - 1) - sMaxX;
      const need = Math.max(0, globalUp - sMinY);
      const gi = groupOf.get(`${col},${row}`);
      if (gi === undefined) {
        if (need > MAX_LIFT) throw new Error(`${cellName(img, col, row)} 放大后头顶要下压 ${Math.ceil(need)}px，超过 ${MAX_LIFT}px 上限，原图未改`);
        plans.push({ col, row, dx, need });
      } else {
        const g = groups[gi];
        if (need > g.need) { g.need = need; g.worst = cellName(img, col, row); }
        plans.push({ col, row, dx, need: -1 });
      }
    }
  }
  for (const g of groups) {
    if (g.need > MAX_LIFT) throw new Error(`${g.worst} 放大后头顶要下压 ${Math.ceil(g.need)}px，超过 ${MAX_LIFT}px 上限，原图未改`);
  }
  /* Pass 2: rasterize. Aerial groups share one lift; every other cell lifts only itself. */
  for (const p of plans) {
    let dy = 0;
    if (p.need >= 0) dy = Math.ceil(p.need);
    else dy = Math.ceil(groups[groupOf.get(`${p.col},${p.row}`)!].need);
    const b = cellBBox(img, p.col, p.row);
    const sMaxY = footBefore + (b.maxY - footBefore) * k;
    if (sMaxY + dy - globalUp > CELL - 1) throw new Error(`${cellName(img, p.col, p.row)} 放大后脚底出格，原图未改`);
    if (dy !== 0 || Math.round(p.dx) !== 0) {
      notes.push({ name: cellName(img, p.col, p.row), dx: Math.round(p.dx), dy });
    }
    scaleCell(rgba, img, p.col, p.row, k, 128, footBefore, p.dx, dy, globalUp);
  }
  img.rgba = rgba;
  const footAfter = median(layout.refs.map(r => cellBottom(img, r.col, r.row)).filter(y => y >= 0));
  if (Math.abs(footAfter - TARGET) > 1) throw new Error(`脚线落在 ${footAfter}，预期 ${TARGET} 附近`);
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const b = cellBBox(img, col, row);
      if (b.empty) continue;
      if (b.minX < 0 || b.maxX > CELL - 1 || b.minY < 0 || b.maxY > CELL - 1) {
        throw new Error(`${cellName(img, col, row)} 缩放后出格 [${b.minX}-${b.maxX}, ${b.minY}-${b.maxY}]`);
      }
    }
  }
  const idleA = cellBBox(img, 0, 0);
  const idleAfter = idleA.empty ? -1 : idleA.maxY - idleA.minY + 1;
  return { notes, footBefore, footAfter, idleBefore, idleAfter };
}

function previewPath(src: string): string {
  const base = basename(src).replace(/\.png$/i, '');
  return join(dirname(src), base + '.scaled.png');
}

function run(src: string, k: number): void {
  const abs = resolve(src);
  const raw = readFileSync(abs);
  if (isPlaceholderPng(raw)) throw new Error('这是带占位标记的色块：改对应 sheet 脚本里的 SCALE 重新光栅化，不要缩放色块');
  const img = decodePng(raw);
  const info = scaleSheet(img, k);
  for (const n of info.notes) {
    const parts = [];
    if (n.dx !== 0) parts.push(`${n.dx > 0 ? '右' : '左'}移 ${Math.abs(n.dx)}px`);
    if (n.dy !== 0) parts.push(`下压 ${n.dy}px`);
    console.log(`${n.name} ${parts.join('、')}（防出格）`);
  }
  console.log(`缩放 ${k}，脚线 ${info.footBefore} → ${info.footAfter}（y=244 以下留 12px），站高 ${info.idleBefore} → ${info.idleAfter}`);
  const out = previewPath(abs);
  writeFileSync(out, encodePng(img));
  console.log('写出 ' + out);
  console.log('原图未改。看过之后：node --experimental-strip-types scripts/scale-sheet.ts "' + src + '" ' + k + ' --accept');
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
  const paint = (img: Image, col: number, row: number, x1: number, y1: number, x2: number, y2: number) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const i = ((row * CELL + y) * img.w + col * CELL + x) * 4;
      img.rgba[i] = 220; img.rgba[i + 1] = 60; img.rgba[i + 2] = 90; img.rgba[i + 3] = 255;
    }
  };
  const mk = (w: number, h: number): Image => ({ w, h, rgba: Buffer.alloc(w * h * 4) });
  const img = mk(2048, 768);
  paint(img, 0, 0, 120, 100, 136, 251);
  for (const col of [1, 2, 3, 4, 6]) paint(img, col, 0, 120, 200, 136, 251);
  paint(img, 5, 0, 40, 230, 254, 251);
  paint(img, 2, 1, 60, 28, 200, 251);
  paint(img, 1, 2, 80, 24, 180, 251);
  paint(img, 2, 2, 80, 40, 180, 251);
  paint(img, 3, 2, 80, 30, 180, 251);
  const info = scaleSheet(img, 1.1);
  if (info.footBefore !== 251 || info.footAfter !== TARGET) throw new Error(`脚线 ${info.footBefore} → ${info.footAfter}`);
  if (info.idleBefore !== 152 || info.idleAfter < 165 || info.idleAfter > 169) throw new Error(`站高 ${info.idleBefore} → ${info.idleAfter}`);
  const at = (col: number, row: number, x: number, y: number) => img.rgba[((row * CELL + y) * img.w + col * CELL + x) * 4 + 3];
  if (at(0, 0, 128, TARGET) !== 255) throw new Error('站立没有落到脚线');
  if (at(0, 0, 120, TARGET) !== 255 || at(0, 0, 136, TARGET) !== 255) throw new Error('站立脚下宽度没跟着放大');
  const jump = cellBBox(img, 5, 0);
  if (jump.maxX > 255 || jump.minX < 0) throw new Error('出格横条没有被推回来');
  if (!info.notes.some(n => n.name === '跳' && n.dx < 0)) throw new Error('出格横条没有报告右移');
  const lift = cellBBox(img, 2, 1);
  if (lift.minY < 0 || lift.minY > 1) throw new Error('下压量不对，顶边 ' + lift.minY);
  if (lift.maxY !== 246) throw new Error('下压格的脚底 ' + lift.maxY);
  const airA = cellBBox(img, 1, 2), airB = cellBBox(img, 2, 2);
  if (airA.maxY !== airB.maxY || airA.maxY !== 250) throw new Error(`空轻组下压不一致：${airA.maxY} vs ${airB.maxY}`);
  if (airA.minY < 0 || airA.minY > 1) throw new Error('空轻组顶边 ' + airA.minY);
  const big = mk(2048, 768);
  for (const col of [0, 1, 2, 3, 4, 6]) paint(big, col, 0, 120, 200, 136, 251);
  paint(big, 1, 1, 60, 10, 200, 251);
  let threw = false;
  try { scaleSheet(big, 1.1); } catch { threw = true; }
  if (!threw) throw new Error('头顶出格超限没有被拒绝');
  const few = mk(2048, 768);
  paint(few, 0, 0, 120, 200, 136, 251);
  threw = false;
  try { scaleSheet(few, 1.1); } catch { threw = true; }
  if (!threw) throw new Error('脚线不足 4 格没有被拒绝');
  const four = mk(1024, 768);
  paint(four, 0, 0, 100, 200, 140, 251);
  paint(four, 1, 0, 100, 200, 140, 251);
  paint(four, 2, 1, 100, 200, 140, 251);
  paint(four, 1, 2, 100, 200, 140, 251);
  const info4 = scaleSheet(four, 1.08);
  if (info4.footAfter !== TARGET) throw new Error('四格表脚线没归位');
  /* k=1: pure alignment. The tall cell keeps its pixels (lifted 8), the rest move up 8. */
  const one = mk(1024, 768);
  paint(one, 0, 0, 100, 200, 140, 251);
  paint(one, 1, 0, 100, 200, 140, 251);
  paint(one, 2, 1, 100, 200, 140, 251);
  paint(one, 2, 1, 100, 0, 140, 253);
  paint(one, 1, 2, 100, 200, 140, 251);
  const info1 = scaleSheet(one, 1);
  if (info1.footBefore !== 251 || info1.footAfter !== TARGET) throw new Error('k=1 脚线没归位');
  const tall = cellBBox(one, 2, 1);
  if (tall.minY !== 0 || tall.maxY !== 253) throw new Error(`k=1 顶格被移动了 [${tall.minY}-${tall.maxY}]`);
  if (cellBBox(one, 0, 0).maxY !== TARGET) throw new Error('k=1 普通格没落到脚线');
  console.log('scale-sheet check ok');
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2).filter(a => a !== '--accept');
  const accept = process.argv.includes('--accept');
  if (args.includes('--check')) {
    selfCheck();
  } else if (args.length !== 2) {
    console.log('用法: node --experimental-strip-types scripts/scale-sheet.ts <sheet.png> <系数> [--accept]');
    console.log('      例: node --experimental-strip-types scripts/scale-sheet.ts public/sprites/soyo/common.png 1.08');
    console.log('      不加 --accept 时写出同目录的 <名>.scaled.png，不覆盖原图。');
    console.log('      --accept 把原图移到 素材/archive/<角色>/，预览图改回原名。');
    console.log('      --check 跑自测。');
    process.exit(args.includes('--help') ? 0 : 1);
  } else if (accept) {
    acceptFile(args[0]);
  } else {
    run(args[0], Number(args[1]));
  }
}

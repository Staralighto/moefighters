import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { CELL, type Image } from './align-down.ts';
import { median } from './align-feet.ts';

// Detect at source resolution before any cell crop. This command writes previews only.
const COLS = 8, ROWS = 3, SIDE = 1, TOP = 4;
const TARGET = CELL - 3; // Last content row 253; rows 254 and 255 stay empty.
const NAMES = [
  '站立', '走1', '走2', '走3', '走4', '跳', '格挡', '闪避',
  '受击', '倒地', '轻击前摇', '轻击命中', '轻击收势', '重击前摇', '重击命中', '重击收势',
  'KO', '空轻前摇', '空轻命中', '空轻收势', '空重前摇', '空重命中', '空重收势', '空格',
];
const FOOT_REFS = [0, 1, 2, 3, 4, 6];
const AIR = [[5], [17, 18, 19], [20, 21, 22]];
const nameOf = (cell: number, cols: number) => cols === COLS ? NAMES[cell] : `动作${cell + 1}`;

interface Box { x0: number; y0: number; x1: number; y1: number }
interface Component extends Box {
  id: number; pixels: number; strong: number; overlap: number[];
}
interface Subject extends Box { cell: number; components: number[]; pixels: number }
interface Detection {
  labels: Int32Array; components: Component[]; subjects: Subject[];
  owner: Int32Array; issues: string[]; warnings: string[]; pixels: number;
}
interface Sprite {
  subject: Subject; image: Image; bounds: Box; left: number; top: number; dx: number; dy: number;
}

function bounds(rgba: Buffer, w: number, h: number): Box {
  const b = { x0: w, y0: h, x1: -1, y1: -1 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!rgba[(y * w + x) * 4 + 3]) continue;
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  }
  return b;
}

function union(a: Box, b: Box): void {
  a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0);
  a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
}

function distance(a: Box, b: Box): number {
  return Math.hypot(Math.max(0, a.x0 - b.x1 - 1, b.x0 - a.x1 - 1),
    Math.max(0, a.y0 - b.y1 - 1, b.y0 - a.y1 - 1));
}

function detect(img: Image, cols = COLS): Detection {
  const { w, h, rgba } = img, step = w / cols;
  const labels = new Int32Array(w * h), queue = new Int32Array(w * h);
  const components: Component[] = [];
  let pixels = 0;
  for (let start = 0; start < labels.length; start++) {
    if (!rgba[start * 4 + 3] || labels[start]) continue;
    const c: Component = { id: components.length + 1, pixels: 0, strong: 0,
      overlap: Array(cols * ROWS).fill(0), x0: w, y0: h, x1: -1, y1: -1 };
    let head = 0, tail = 0;
    labels[start] = c.id; queue[tail++] = start;
    while (head < tail) {
      const p = queue[head++], x = p % w, y = Math.floor(p / w);
      c.pixels++; pixels++;
      c.x0 = Math.min(c.x0, x); c.y0 = Math.min(c.y0, y);
      c.x1 = Math.max(c.x1, x); c.y1 = Math.max(c.y1, y);
      if (rgba[p * 4 + 3] > 24) {
        c.strong++;
        c.overlap[Math.min(ROWS - 1, Math.floor(y / step)) * cols + Math.min(cols - 1, Math.floor(x / step))]++;
      }
      for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) {
          const q = ny * w + nx;
          if (labels[q] || !rgba[q * 4 + 3]) continue;
          labels[q] = c.id; queue[tail++] = q;
        }
      }
    }
    components.push(c);
  }
  const issues: string[] = [], warnings: string[] = [], subjects: Subject[] = [];
  const owner = new Int32Array(components.length + 1).fill(-1);
  const primary = components.filter(c => c.strong >= Math.max(1, step * step * 0.02));
  const add = (c: Component, cell: number) => {
    const existing = subjects.find(s => s.cell === cell);
    if (existing) {
      existing.components.push(c.id); existing.pixels += c.pixels; union(existing, c);
    } else subjects.push({ cell, components: [c.id], pixels: c.pixels, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 });
    owner[c.id] = cell;
  };
  for (const c of primary) {
    const max = Math.max(...c.overlap), cell = c.overlap.indexOf(max);
    if (max / c.strong < 0.65) (cols === COLS ? issues : warnings).push(`主体 C${c.id} 跨格归属不明确，最大重叠仅 ${(max / c.strong * 100).toFixed(1)}%，可能粘连`);
    if (cols === COLS && cell === 23) issues.push(`主体 C${c.id} 被分到应为空白的第24格`);
    if (cols === COLS && subjects.some(s => s.cell === cell)) issues.push(`第${cell + 1}格有多个大主体，无法自动合并`);
    // shortcut: 4-column sheets group all pieces in one cell; touching characters need user review.
    add(c, cell);
  }
  // Fragments are matched against primary bodies, not against other fragments in a growing chain.
  for (const c of components.filter(c => owner[c.id] < 0)) {
    const near = primary.map(p => ({ p, d: distance(c, p) })).sort((a, b) => a.d - b.d);
    const best = near[0];
    if (cols !== COLS) {
      const cell = best && best.d <= step * 0.12 ? owner[best.p.id]
        : c.strong ? c.overlap.indexOf(Math.max(...c.overlap))
        : Math.min(ROWS - 1, Math.floor((c.y0 + c.y1) / 2 / step)) * cols + Math.min(cols - 1, Math.floor((c.x0 + c.x1) / 2 / step));
      add(c, cell);
      continue;
    }
    if (!best || best.d > step * 0.12 || (near[1] && near[1].d - best.d < step * 0.01)) {
      issues.push(`碎片 C${c.id}（${c.pixels}px）归属不明确，保留原图等待检查`);
      continue;
    }
    add(c, owner[best.p.id]);
  }
  for (let cell = 0; cols === COLS && cell < 23; cell++) {
    if (!subjects.some(s => s.cell === cell)) issues.push(`第${cell + 1}格 ${NAMES[cell]} 未找到主体`);
  }
  for (const s of subjects) {
    if (s.x0 === 0 || s.y0 === 0 || s.x1 === w - 1 || s.y1 === h - 1) {
      warnings.push(`第${s.cell + 1}格主体接触原图外边界，无法判断源图是否已截断`);
    }
  }
  assert.equal(subjects.reduce((sum, s) => sum + s.pixels, 0) +
    components.filter(c => owner[c.id] < 0).reduce((sum, c) => sum + c.pixels, 0), pixels);
  return { labels, components, subjects, owner, issues, warnings, pixels };
}

async function rasterize(img: Image, d: Detection, cols = COLS): Promise<Sprite[]> {
  const k = CELL / (img.w / cols), pad = 4;
  const sprites: Sprite[] = [];
  for (const s of d.subjects) {
    const w = s.x1 - s.x0 + 1 + pad * 2, h = s.y1 - s.y0 + 1 + pad * 2;
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
      const p = y * img.w + x;
      if (d.owner[d.labels[p]] !== s.cell || !img.rgba[p * 4 + 3]) continue;
      img.rgba.copy(rgba, ((y - s.y0 + pad) * w + x - s.x0 + pad) * 4, p * 4, p * 4 + 4);
    }
    const { data, info } = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .resize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)))
      .raw().toBuffer({ resolveWithObject: true });
    const b = bounds(data, info.width, info.height);
    if (b.x1 < 0) throw new Error(`第${s.cell + 1}格缩放后没有可见内容`);
    sprites.push({ subject: s, image: { w: info.width, h: info.height, rgba: data }, bounds: b,
      left: Math.round((s.x0 - pad - (s.cell % cols) * img.w / cols) * k),
      top: Math.round((s.y0 - pad - Math.floor(s.cell / cols) * img.h / ROWS) * k), dx: 0, dy: 0 });
  }
  return sprites;
}

function place(sprites: Sprite[], issues: string[], warnings: string[], cols = COLS): void {
  const side = cols === COLS ? SIDE : 0, top = cols === COLS ? TOP : 0;
  for (const s of sprites) {
    const { x0, x1, y0, y1 } = s.bounds, label = `第${s.subject.cell + 1}格 ${nameOf(s.subject.cell, cols)}`;
    const lo = side - (s.left + x0), hi = CELL - 1 - side - (s.left + x1);
    if (lo > hi || y1 - y0 + 1 > TARGET - top + 1) {
      issues.push(`${label} 完整主体为 ${x1 - x0 + 1}×${y1 - y0 + 1}，安全空间为 ${CELL - 2 * side}×${TARGET - top + 1}，未裁切或单独缩小`);
      continue;
    }
    s.dx = Math.max(lo, Math.min(hi, 0));
    s.dy = TARGET - (s.top + y1);
  }
  if (cols !== COLS) return; // 4×3: every non-empty pose lands on the same baseline.
  const foot = median(FOOT_REFS.map(cell => {
    const s = sprites.find(s => s.subject.cell === cell)!;
    return s.top + s.bounds.y1;
  }));
  for (const cells of AIR) {
    const group = cells.map(cell => sprites.find(s => s.subject.cell === cell)!);
    const lo = Math.max(...group.map(s => TOP - s.top - s.bounds.y0));
    const hi = Math.min(...group.map(s => TARGET - s.top - s.bounds.y1));
    if (lo > hi) {
      issues.push(`空中组 ${cells.map(c => c + 1).join('/')} 无法在保持相对高度时完整容纳`);
      continue;
    }
    const desired = TARGET - foot, dy = Math.max(lo, Math.min(hi, desired));
    if (dy !== desired) warnings.push(`空中组 ${cells.map(c => c + 1).join('/')} 为防出格统一额外平移 ${dy - desired}px，需目视检查悬空高度`);
    for (const s of group) s.dy = dy;
  }
}

function signature(rgba: Buffer): number[] {
  const sums = [0, 0, 0, 0, 0];
  for (let p = 0; p < rgba.length; p += 4) {
    if (!rgba[p + 3]) continue;
    sums[0]++;
    for (let c = 0; c < 4; c++) sums[c + 1] += rgba[p + c];
  }
  return sums;
}

function pack(sprites: Sprite[], cols = COLS): { image: Image; before: number[]; after: number[] } {
  const w = cols * CELL, h = ROWS * CELL, rgba = Buffer.alloc(w * h * 4), before = [0, 0, 0, 0, 0];
  const side = cols === COLS ? SIDE : 0, top = cols === COLS ? TOP : 0;
  for (const s of sprites) {
    signature(s.image.rgba).forEach((n, i) => before[i] += n);
    for (let y = 0; y < s.image.h; y++) for (let x = 0; x < s.image.w; x++) {
      const p = (y * s.image.w + x) * 4;
      if (!s.image.rgba[p + 3]) continue;
      const lx = s.left + s.dx + x, ly = s.top + s.dy + y;
      assert.ok(lx >= side && lx < CELL - side && ly >= top && ly <= TARGET,
        `第${s.subject.cell + 1}格出界，拒绝截断`);
      const q = ((Math.floor(s.subject.cell / cols) * CELL + ly) * w + (s.subject.cell % cols) * CELL + lx) * 4;
      assert.equal(rgba[q + 3], 0, '主体目标像素重叠');
      s.image.rgba.copy(rgba, q, p, p + 4);
    }
  }
  const after = signature(rgba);
  assert.deepEqual(after, before, '放回格子丢失像素或改变颜色');
  return { image: { w, h, rgba }, before, after };
}

const COLORS = ['#ffbd69', '#54d6ff', '#bd98ff', '#66e0a3', '#ff8fb5', '#e4dc6c'];
async function diagnostic(img: Image, subjects: Subject[] = [], cols = COLS): Promise<Buffer> {
  const cw = img.w / cols, ch = img.h / ROWS, unit = cw / CELL;
  const lines: string[] = [];
  for (let c = 0; c <= cols; c++) lines.push(`<path d="M${c * cw} 0V${img.h}"/>`);
  for (let r = 0; r <= ROWS; r++) lines.push(`<path d="M0 ${r * ch}H${img.w}"/>`);
  const feet = Array.from({ length: ROWS }, (_, r) => `<path d="M0 ${r * ch + TARGET * unit}H${img.w}"/>`).join('');
  const labels = Array.from({ length: cols * ROWS }, (_, cell) => `<text x="${(cell % cols) * cw + 5 * unit}" y="${Math.floor(cell / cols) * ch + 18 * unit}">${cell + 1} ${nameOf(cell, cols)}</text>`).join('');
  const boxes = subjects.map(s => {
    const color = COLORS[s.cell % COLORS.length];
    return `<g stroke="${color}" fill="none"><rect x="${s.x0}" y="${s.y0}" width="${s.x1 - s.x0 + 1}" height="${s.y1 - s.y0 + 1}"/></g><text fill="${color}" x="${s.x0}" y="${Math.max(36 * unit, s.y0 - 4 * unit)}">#${s.cell + 1} C${s.components.join('+')}</text>`;
  }).join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${img.w}" height="${img.h}"><g stroke="#9aa0aa" stroke-width="${unit}" opacity=".7" fill="none">${lines.join('')}</g><g stroke="#ff7070" stroke-width="${unit}" stroke-dasharray="${4 * unit} ${4 * unit}">${feet}</g><g font-family="sans-serif" font-size="${13 * unit}" fill="#ffffff" stroke="#20232a" stroke-width="${0.5 * unit}" paint-order="stroke">${labels}${boxes}</g></svg>`);
  return sharp({ create: { width: img.w, height: img.h, channels: 4, background: '#20232a' } })
    .composite([{ input: img.rgba, raw: { width: img.w, height: img.h, channels: 4 } }, { input: svg }]).png().toBuffer();
}

async function run(src: string, outputDir?: string): Promise<void> {
  const source = resolve(src), original = readFileSync(source);
  const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
  if ((await sharp(original).metadata()).format !== 'png') throw new Error('只接受已去绿幕的 PNG');
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error('请使用 RGB/RGBA PNG，暂不支持灰度图');
  const cols = Math.abs(info.width / COLS - info.height / ROWS) <= 0.01 ? COLS : 4;
  if (Math.abs(info.width / cols - info.height / ROWS) > 0.01) throw new Error(`只接受8×3 common或4×3动作表，这张是 ${info.width}×${info.height}`);
  const img: Image = { w: info.width, h: info.height, rgba: data };
  const d = detect(img, cols);
  if (!d.pixels || d.pixels === img.w * img.h) throw new Error('需要已去绿幕、有透明背景和非空主体的 PNG');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const stamp = new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = outputDir ? resolve(outputDir) : join(root, '素材', 'sprite-repack', basename(dirname(source)), basename(source, '.png') + '-' + stamp);
  const files = ['subjects.png', 'before.grid.png', 'after.grid.png', 'repacked.png', 'report.json'];
  if (files.some(f => existsSync(join(out, f)))) throw new Error('输出目录已有结果，请换一个新目录，禁止覆盖历史预览');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'subjects.png'), await diagnostic(img, d.subjects, cols));
  const beforeData = await sharp(data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .resize(cols * CELL, ROWS * CELL).raw().toBuffer();
  writeFileSync(join(out, 'before.grid.png'), await diagnostic({ w: cols * CELL, h: ROWS * CELL, rgba: beforeData }, [], cols));
  let sprites: Sprite[] = [], result: ReturnType<typeof pack> | undefined;
  if (!d.issues.length) {
    sprites = await rasterize(img, d, cols);
    place(sprites, d.issues, d.warnings, cols);
    if (!d.issues.length) {
      result = pack(sprites, cols);
      await sharp(result.image.rgba, { raw: { width: result.image.w, height: result.image.h, channels: 4 } }).png().toFile(join(out, 'repacked.png'));
      writeFileSync(join(out, 'after.grid.png'), await diagnostic(result.image, [], cols));
    }
  }
  const report = {
    source, sourceSHA256: sha256(original), sourceSize: [img.w, img.h], outputSize: [cols * CELL, ROWS * CELL],
    layout: [cols, ROWS], alignment: cols === COLS ? 'common-air-offsets' : 'all-to-baseline',
    status: result ? 'preview-ready' : 'needs-review', target: TARGET,
    sideMargin: cols === COLS ? SIDE : 0, topMargin: cols === COLS ? TOP : 0,
    scale: CELL / (img.w / cols), components: d.components.length, subjects: d.subjects.length,
    sourcePixels: d.pixels, assignedSourcePixels: d.subjects.reduce((n, s) => n + s.pixels, 0),
    placementBefore: result?.before, placementAfter: result?.after,
    issues: d.issues, warnings: d.warnings,
    notes: ['仅输出预览，不替换源图或游戏图片。', '先识别完整主体，再统一缩放；不逐格缩小，不按格线裁主体。',
      '落地与倒地使用最低可见像素作为接地近似；长衣摆等情况须目视确认。',
      '纯平移核对全部alpha>0像素数及RGBA和；缩放前后像素数不同是正常的。'],
    cells: sprites.map(s => ({ cell: s.subject.cell + 1, name: nameOf(s.subject.cell, cols), components: s.subject.components,
      sourceBounds: [s.subject.x0, s.subject.y0, s.subject.x1, s.subject.y1], dx: s.dx, dy: s.dy,
      finalBounds: [s.left + s.bounds.x0 + s.dx, s.top + s.bounds.y0 + s.dy, s.left + s.bounds.x1 + s.dx, s.top + s.bounds.y1 + s.dy] })),
  };
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  assert.equal(sha256(readFileSync(source)), sha256(original), '源图不应变化');
  console.log(`识别 ${d.subjects.length}${cols === COLS ? '/23' : ''} 个非空格主体（${cols}×${ROWS}）；${d.components.length} 个连通块；原始非透明像素全部${report.assignedSourcePixels === d.pixels ? '归属完成' : '尚未归属'}。`);
  for (const issue of d.issues) console.log('需检查：' + issue);
  for (const warning of d.warnings) console.log('提示：' + warning);
  console.log(`输出：${out}`);
  if (result) console.log(`预览：${join(out, 'after.grid.png')}\n透明成表：${join(out, 'repacked.png')}\n纯平移像素及RGBA和守恒；源图未改。`);
  else process.exitCode = 2;
}

async function selfCheck(): Promise<void> {
  const w = COLS * CELL, h = ROWS * CELL, rgba = Buffer.alloc(w * h * 4);
  const rect = (x0: number, y0: number, x1: number, y1: number, alpha = 255) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const p = (y * w + x) * 4;
      rgba[p] = 220; rgba[p + 1] = 90; rgba[p + 2] = 40; rgba[p + 3] = alpha;
    }
  };
  for (let cell = 0; cell < 23; cell++) {
    const x = (cell % COLS) * CELL, y = Math.floor(cell / COLS) * CELL;
    if (cell === 3) rect(x + 180, y + 190, x + 266, y + 265); // Cross right AND bottom before extraction.
    else if (cell === 9 || cell === 16) rect(x + 80, y + 220, x + 179, y + 239);
    else rect(x + 110, y + (AIR.flat().includes(cell) ? 100 : 160), x + 129, y + (AIR.flat().includes(cell) ? 179 : 239));
  }
  rect(109, 180, 109, 180, 1); // Keep even a faint edge pixel.
  rect(133, 185, 134, 186); // Detached accessory: group it, never erase it.
  const img = { w, h, rgba }, d = detect(img);
  assert.deepEqual(d.issues, []);
  assert.equal(d.subjects.length, 23);
  assert.equal(d.subjects.find(s => s.cell === 0)!.components.length, 2);
  const crossing = d.subjects.find(s => s.cell === 3)!;
  assert.ok(crossing.x1 >= 4 * CELL && crossing.y1 >= CELL);
  assert.equal(d.subjects.reduce((n, s) => n + s.pixels, 0), d.pixels);
  const sprites = await rasterize(img, d);
  place(sprites, d.issues, d.warnings);
  assert.deepEqual(d.issues, []);
  const result = pack(sprites);
  assert.deepEqual(result.before, signature(rgba), '1:1测试不能丢掉半透明边缘或饰品');
  const moved = sprites.find(s => s.subject.cell === 3)!;
  assert.ok(moved.dx < 0 && moved.dy < 0);
  assert.equal(moved.top + moved.dy + moved.bounds.y1, TARGET);
  const air = sprites.find(s => s.subject.cell === 5)!;
  assert.equal(air.top + air.dy + air.bounds.y1, TARGET - 60, '空中格必须保留60px悬空差');
  assert.equal(signature(result.image.rgba).at(0), d.pixels);
  const wide: Sprite = { ...moved, bounds: { x0: 0, y0: 0, x1: 253, y1: 80 } };
  const wideIssues: string[] = [];
  place(sprites.map(s => s === moved ? wide : s), wideIssues, []);
  assert.deepEqual(wideIssues, [], '254px宽主体应满足左右各1px留白');
  const oversized: Sprite = { ...moved, bounds: { x0: 0, y0: 0, x1: 254, y1: 80 } };
  const tooBig: string[] = [];
  place(sprites.map(s => s === moved ? oversized : s), tooBig, []);
  assert.ok(tooBig.some(i => i.includes('未裁切或单独缩小')));
  const four: Image = { w: 4 * CELL, h, rgba: Buffer.alloc(4 * CELL * h * 4) };
  const paint4 = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const p = (y * four.w + x) * 4;
      four.rgba[p] = 180; four.rgba[p + 1] = 100; four.rgba[p + 2] = 50; four.rgba[p + 3] = 255;
    }
  };
  paint4(180, 190, 266, 265); // Cross both boundaries; neighboring cells are intentionally empty.
  for (const cell of [5, 11]) {
    const x = (cell % 4) * CELL, y = Math.floor(cell / 4) * CELL;
    paint4(x + 110, y + 30, x + 129, y + 109); // Looks airborne but must still land.
  }
  paint4(CELL + 180, CELL + 30, CELL + 199, CELL + 109); // Separate large prop in cell 6.
  paint4(8, 2 * CELL + 180, 255, 2 * CELL + 199); // 248px-wide pose must fit a 4×3 sheet.
  const d4 = detect(four, 4);
  assert.deepEqual(d4.issues, []);
  assert.equal(d4.subjects.length, 4, '4×3允许任意空格及非空最后一格');
  assert.equal(d4.subjects.find(s => s.cell === 5)!.components.length, 2, '同格道具直接合并');
  const s4 = await rasterize(four, d4, 4);
  place(s4, d4.issues, d4.warnings, 4);
  assert.deepEqual(d4.issues, []);
  assert.ok(s4.every(s => s.top + s.dy + s.bounds.y1 === TARGET), '4×3每个非空格都落到脚线');
  const packed4 = pack(s4, 4);
  assert.equal(packed4.image.w, 1024);
  assert.deepEqual(packed4.after, signature(four.rgba), '4×3搬运保持所有主体像素');
  for (let y = 0; y < CELL; y++) for (let x = CELL; x < 2 * CELL; x++) {
    assert.equal(packed4.image.rgba[(y * four.w + x) * 4 + 3], 0, '原本空格必须仍为空');
  }
  // Touch the next body: both cells must no longer be silently accepted as independent people.
  rect(3 * CELL + 266, 170, 4 * CELL + 110, 190);
  const stuck = detect(img);
  assert.ok(stuck.issues.length > 0, '粘连/缺主体必须报告');
  console.log('repack-common check ok：common悬空偏移、4×3全格落地/任意空格/同格道具、跨右下边界、半透明像素守恒、超宽及粘连报告');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--check') await selfCheck();
    else if (args.length >= 1 && args.length <= 2 && !args[0].startsWith('--')) await run(args[0], args[1]);
    else {
      console.log('用法：node --experimental-strip-types scripts/repack-common.ts <透明8×3或4×3动作表.png> [新输出目录]\n      node --experimental-strip-types scripts/repack-common.ts --check\n8×3保留common空中偏移；4×3所有非空格统一脚线。只写预览，不提供 --accept。');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

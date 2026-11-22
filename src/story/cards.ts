/* 纸板立牌烘焙（设计记录第 3 节「纸板切边（刀模）」）。
   切线不沿轮廓整圈膨胀（那样会贴着每根发丝走，像贴纸）：alpha 膨胀 → 闭运算补平腿缝、腋下 →
   描外轮廓 → 折线化（每段直线，容差约 5px）。正面、背面、投影都用同一个切形；每格加载时算一次。 */

import { CELL } from '../render/clips.ts';
import type { Pose } from './script.ts';

export const PAD = 22;
const S = CELL + PAD * 2;
const GROW = 8;
const CLOSE = 11;
const TOL = 5;
const EDGE = '#a99f8f';
const FACE = '#fbf9f4';
const BACK = '#f1ede4';

export const POSE_CELL: Record<Pose, [number, number]> = { idle: [0, 0], jump: [5, 0], block: [6, 0], hurt: [0, 1], down: [1, 1] };

export interface Card {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  /** 复制体的背面：近黑加紫色裂纹。 */
  copyBack: HTMLCanvasElement;
  /** 纯黑切形，投在背景上的柔影用。 */
  sil: HTMLCanvasElement;
  /** 脚底在烘焙图里的 y（像素，含 PAD）。 */
  foot: number;
  /** 头顶（不透明像素的最上一行，含 PAD）：漫符贴在这上面。 */
  top: number;
}

const canvas = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
};

let grain: HTMLCanvasElement | null = null;
function grainTex(): HTMLCanvasElement {
  if (grain) return grain;
  const [c, x] = canvas();
  const d = x.createImageData(S, S);
  let seed = 7;
  for (let i = 0; i < d.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = 120 + (seed % 135);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 22;
  }
  x.putImageData(d, 0, 0);
  return (grain = c);
}

/** 两遍倒角距离变换：每个格到最近「种子」格的近似欧氏距离。 */
function distance(seed: Uint8Array): Float32Array {
  const d = new Float32Array(S * S);
  const INF = 1e9, D = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : INF;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) {
      v = Math.min(v, d[i - S] + 1);
      if (x > 0) v = Math.min(v, d[i - S - 1] + D);
      if (x < S - 1) v = Math.min(v, d[i - S + 1] + D);
    }
    d[i] = v;
  }
  for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
    const i = y * S + x;
    let v = d[i];
    if (x < S - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < S - 1) {
      v = Math.min(v, d[i + S] + 1);
      if (x < S - 1) v = Math.min(v, d[i + S + 1] + D);
      if (x > 0) v = Math.min(v, d[i + S - 1] + D);
    }
    d[i] = v;
  }
  return d;
}

/** Moore 邻域描一条外轮廓（从 start 出发，顺时针）。 */
function trace(m: Uint8Array, start: number): [number, number][] {
  const dx = [1, 1, 0, -1, -1, -1, 0, 1], dy = [0, 1, 1, 1, 0, -1, -1, -1];
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && m[y * S + x] === 1;
  const sx = start % S, sy = (start / S) | 0;
  const out: [number, number][] = [[sx, sy]];
  let x = sx, y = sy, dir = 6;
  for (let guard = 0; guard < S * S * 2; guard++) {
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const nd = (dir + 6 + k) % 8;
      const nx = x + dx[nd], ny = y + dy[nd];
      if (at(nx, ny)) { x = nx; y = ny; dir = nd; moved = true; break; }
    }
    if (!moved || (x === sx && y === sy)) break;
    out.push([x, y]);
  }
  return out;
}

function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      const dd = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (dd > fd) { fd = dd; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** 一格的切形（若干条折线多边形）和脚底。 */
function cutOf(sheet: CanvasImageSource, col: number, row: number): { polys: [number, number][][]; foot: number; top: number } {
  const [, x] = canvas();
  x.drawImage(sheet, col * CELL, row * CELL, CELL, CELL, PAD, PAD, CELL, CELL);
  let px: Uint8ClampedArray;
  try { px = x.getImageData(0, 0, S, S).data; }
  catch {
    // 跨域图读不了像素：退回一块圆角矩形纸板。
    const r = (a: number, b: number): [number, number] => [a, b];
    return { polys: [[r(PAD + 30, PAD), r(PAD + CELL - 30, PAD), r(PAD + CELL - 10, PAD + CELL), r(PAD + 10, PAD + CELL)]], foot: PAD + CELL - 4, top: PAD + 20 };
  }
  const fg = new Uint8Array(S * S);
  let foot = PAD + CELL - 1, found = false;
  for (let i = 0; i < fg.length; i++) if (px[i * 4 + 3] > 40) { fg[i] = 1; found = true; }
  const rowHit = (y: number) => { for (let xx = 0; xx < S; xx++) if (fg[y * S + xx]) return true; return false; };
  let top = PAD;
  if (found) {
    for (let y = S - 1; y >= 0; y--) if (rowHit(y)) { foot = y; break; }
    for (let y = 0; y < S; y++) if (rowHit(y)) { top = y; break; }
  }
  // 膨胀（GROW + CLOSE）再腐蚀 CLOSE：闭运算把缝隙填平，留下一圈约 GROW 的白边。
  const out = distance(fg);
  const wide = new Uint8Array(S * S);
  for (let i = 0; i < wide.length; i++) wide[i] = out[i] <= GROW + CLOSE ? 0 : 1; // 1 = 外面
  const inward = distance(wide);
  const m = new Uint8Array(S * S);
  for (let i = 0; i < m.length; i++) m[i] = inward[i] > CLOSE ? 1 : 0;
  // 每个连通块描一条外轮廓（小碎块不要）。
  const seen = new Uint8Array(S * S);
  const polys: [number, number][][] = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || seen[i]) continue;
    const q = [i]; seen[i] = 1; let area = 0;
    while (q.length) {
      const j = q.pop()!; area++;
      const jx = j % S;
      for (const n of [j - 1, j + 1, j - S, j + S]) {
        if (n < 0 || n >= m.length || seen[n] || !m[n]) continue;
        if ((n === j - 1 && jx === 0) || (n === j + 1 && jx === S - 1)) continue;
        seen[n] = 1; q.push(n);
      }
    }
    if (area > 300) polys.push(simplify(trace(m, i), TOL));
  }
  return { polys, foot, top };
}

function fillCut(polys: [number, number][][], color: string): HTMLCanvasElement {
  const [c, x] = canvas();
  x.fillStyle = color;
  x.lineJoin = 'miter';
  for (const p of polys) {
    x.beginPath();
    x.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) x.lineTo(p[i][0], p[i][1]);
    x.closePath();
    x.fill();
  }
  return c;
}

function backOf(polys: [number, number][][], copy: boolean): HTMLCanvasElement {
  const [b, x] = canvas();
  x.drawImage(fillCut(polys, copy ? '#4a3566' : EDGE), 2, 3);
  x.drawImage(fillCut(polys, copy ? '#120c1a' : BACK), 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.drawImage(grainTex(), 0, 0);
  if (copy) {
    const g = x.createRadialGradient(S / 2, S * .45, 4, S / 2, S * .45, S * .45);
    g.addColorStop(0, '#8a3cff40'); g.addColorStop(1, '#00000000');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.strokeStyle = '#c98bff'; x.lineWidth = 2; x.globalAlpha = .85; x.shadowColor = '#b55cff'; x.shadowBlur = 6;
    x.beginPath();
    x.moveTo(S * .5, S * .2); x.lineTo(S * .46, S * .36); x.lineTo(S * .55, S * .47); x.lineTo(S * .49, S * .66);
    x.moveTo(S * .46, S * .36); x.lineTo(S * .38, S * .42);
    x.moveTo(S * .55, S * .47); x.lineTo(S * .63, S * .52);
    x.stroke();
  }
  return b;
}

export function bakeCard(sheet: CanvasImageSource, pose: Pose): Card {
  const [col, row] = POSE_CELL[pose];
  const { polys, foot, top } = cutOf(sheet, col, row);
  const [front, f] = canvas();
  f.drawImage(fillCut(polys, EDGE), 2, 3); // 纸板厚度：右下一侧的纸芯色
  f.drawImage(fillCut(polys, FACE), 0, 0);
  f.globalCompositeOperation = 'source-atop';
  f.drawImage(grainTex(), 0, 0);
  f.globalCompositeOperation = 'source-over';
  f.drawImage(sheet, col * CELL, row * CELL, CELL, CELL, PAD, PAD, CELL, CELL);
  return { front, back: backOf(polys, false), copyBack: backOf(polys, true), sil: fillCut(polys, '#000'), foot, top };
}

export const CARD_SIZE = S;

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block Taki special sheet only (the common sheet is transfer-generated, see SOP 附录 A;
   its 1024 test halves come from scripts/split-common.ts). Do not import write-sheets.ts.
   Special columns are U 离灯远点 (cast), I 哈？ (spread shout), O 我要拉黑他 (dash),
   L 一辈子 (reach / both arms coiled back / slam — the cells the beat loop cycles). */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; prone?: boolean;
  /** Horizontal shift of the whole figure, so a cycle can travel inside the cell. */
  ox?: number;
  /** Head angle. Defaults to the spine, so a crawl can keep the chest low and the face up. */
  neck?: number;
  /** L column only: a drumstick continues out of the front hand along the forearm. */
  stick?: boolean;
}

const IDLE: Pose = { lean: 0, crouch: 0, armF: [.45, 1.9], armB: [.25, 2.0], legF: [.25, 0], legB: [-.25, 0] };
const CAST_WIND: Pose = { lean: -.1, crouch: 2, armF: [-.3, -2.4], armB: [-.5, -2.3], legF: [.3, 0], legB: [-.3, 0] };
const CAST_HIT: Pose = { lean: .1, crouch: 2, armF: [1.4, 0], armB: [1.2, .15], legF: [.5, 0], legB: [-.35, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
  };
}

/* SVG stand-in only. Re-running this script redraws the whole special sheet. */

/* I 哈？: inhale with both arms pulled in, then burst out with both arms splayed. */
const HUH_W: Pose = { lean: -.12, crouch: 3, armF: [-.5, -2.2], armB: [-.4, -2.1], legF: [.3, 0], legB: [-.3, 0], look: -.05 };
const HUH_H: Pose = { lean: -.08, crouch: 1, armF: [2.5, .35], armB: [-2.2, -.3], legF: [.35, 0], legB: [-.35, 0], look: .1 };
/* O 我要拉黑他: a deep lunge, leading hand out to catch. */
const BAN_W: Pose = { lean: -.15, crouch: 12, armF: [-.9, -.9], armB: [-.6, -.8], legF: [.4, -.4], legB: [-.5, .3], ox: -2 };
const BAN_H: Pose = { lean: .5, crouch: 8, look: .6, armF: [1.5, 0], armB: [-1.0, -.7], legF: [1.15, -.2], legB: [-1.05, .55], ox: 4 };
const BAN_R: Pose = { lean: .15, crouch: 2, armF: [1.0, .3], armB: [.8, .2], legF: [.4, 0], legB: [-.25, 0] };
/* L 一辈子: reach for the wrist, coil both arms back, then slam down with the whole body —
   the cells the beat loop cycles (coil 1 ↔ slam 2). */
const VOW_W: Pose = { lean: .4, crouch: 6, armF: [1.45, .1], armB: [1.3, .25], legF: [.6, -.2], legB: [-.5, .35], stick: true };
const VOW_H: Pose = { lean: -.3, crouch: 4, armF: [-2.35, -.25], armB: [-2.55, -.2], legF: [.45, -.15], legB: [-.45, .25], stick: true };
const VOW_R: Pose = { lean: .5, crouch: 12, armF: [1.35, .35], armB: [1.25, .3], legF: [.75, -.25], legB: [-.55, .4], stick: true };

const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const FOOT = 12;
const COLOR = '#7777AA';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${ch(n >> 16 & 255)},${ch(n >> 8 & 255)},${ch(n & 255)})`;
}

interface Mark { x: number; y: number; r: number }

function stroke(x1: number, y1: number, x2: number, y2: number, w: number, c: string): string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`;
}

function poly(pts: Pt[], fill: string): string {
  return `<polygon points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="${fill}"/>`;
}

function figure(pose: Pose): { svg: string; marks: Mark[] } {
  const d = DIMS.slim;
  const s = SHEET_SCALE;
  const dark = shade(COLOR, .6);
  const light = shade(COLOR, 1.35);
  const legLen = (d.thigh + d.shin) * s;
  const hip = { x: 0, y: -legLen + pose.crouch * s };
  const torsoH = d.torsoH * s;
  const shoulder = { x: hip.x + Math.sin(pose.lean) * torsoH, y: hip.y - Math.cos(pose.lean) * torsoH };
  const bend = pose.prone ? 0 : pose.crouch * .03;
  const parts: string[] = [];
  const marks: Mark[] = [];
  const limb = (from: Pt, [a1, a2]: Limb, l1: number, l2: number, col: string) => {
    const mid = { x: from.x + Math.sin(a1) * l1, y: from.y + Math.cos(a1) * l1 };
    const end = { x: mid.x + Math.sin(a1 + a2) * l2, y: mid.y + Math.cos(a1 + a2) * l2 };
    const w = d.limb * s;
    parts.push(stroke(from.x, from.y, mid.x, mid.y, w + 4, OUTLINE));
    parts.push(stroke(mid.x, mid.y, end.x, end.y, w + 4, OUTLINE));
    parts.push(stroke(from.x, from.y, mid.x, mid.y, w, col));
    parts.push(stroke(mid.x, mid.y, end.x, end.y, w, col));
    const rad = (w + 4) / 2;
    marks.push({ x: from.x, y: from.y, r: rad }, { x: mid.x, y: mid.y, r: rad }, { x: end.x, y: end.y, r: rad });
  };
  // A drumstick continues out of the hand along the forearm direction.
  const stickIn = (from: Pt, [a1, a2]: Limb) => {
    const u = d.upperArm * s, f = d.foreArm * s;
    const hx = from.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f;
    const hy = from.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f;
    const len = f * 1.5;
    const tx = hx + Math.sin(a1 + a2) * len, ty = hy + Math.cos(a1 + a2) * len;
    parts.push(stroke(hx, hy, tx, ty, 4, OUTLINE));
    marks.push({ x: tx, y: ty, r: 3 });
  };
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
  if (pose.stick) stickIn(shoulder, pose.armB);
  const radii = torsoRadii(d.torsoW).map(n => n * s) as [number, number, number];
  const shell = torsoPoints(hip, shoulder, radii, 2);
  parts.push(poly(shell, OUTLINE));
  parts.push(poly(torsoPoints(hip, shoulder, radii, 0), COLOR));
  for (const p of shell) marks.push({ x: p.x, y: p.y, r: 0 });
  const r = d.headR * s;
  const neck = pose.neck ?? pose.lean;
  const cx = shoulder.x + Math.sin(neck) * (r + NECK * s);
  const cy = shoulder.y - Math.cos(neck) * (r + NECK * s);
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 2).toFixed(1)}" fill="${OUTLINE}"/>`);
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${light}"/>`);
  const gaze = Math.max(-.2, Math.min(.62, pose.look ?? .28 + pose.lean));
  const ex = cx + r * gaze, ey = cy - r * .08, er = Math.max(2.4, r * .42);
  parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${er.toFixed(1)}" fill="${OUTLINE}"/>`);
  parts.push(`<circle cx="${(ex + er * .35).toFixed(1)}" cy="${(ey - er * .2).toFixed(1)}" r="${(er * .38).toFixed(1)}" fill="${light}"/>`);
  marks.push({ x: cx, y: cy, r: r + 2 });
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  if (pose.stick) stickIn(shoulder, pose.armF);
  const ox = pose.ox ?? 0;
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + ox},${CELL - FOOT})`;
  return { svg: `<g transform="${origin}">${parts.join('')}</g>`, marks };
}

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (!pose.lying) return { x: CELL / 2 + (pose.ox ?? 0) + m.x, y: CELL - FOOT + m.y, r: m.r };
  const sx = m.x * 0.78, sy = m.y * 0.78;
  return { x: CELL - 16 + sy, y: CELL / 2 - sx, r: m.r * 0.78 };
}

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const p = cellPoint(pose, m);
      const over = Math.max(-p.x + p.r, p.x + p.r - CELL, -p.y + p.r, p.y + p.r - CELL);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)}px`);
    }
  }
  const text = label ? `<text x="4" y="13" fill="${GRID}" font-size="10" font-family="monospace">${label}</text>` : '';
  return `<g transform="translate(${col * CELL},${row * CELL})"><clipPath id="${clip}"><rect width="${CELL}" height="${CELL}"/></clipPath><g clip-path="url(#${clip})"><rect width="${CELL}" height="${CELL}" fill="${BG}"/>${drawn?.svg ?? ''}</g><rect width="${CELL}" height="${CELL}" fill="none" stroke="${GRID}" stroke-width="1"/>${text}</g>`;
}

function sheet(cols: number, rows: number, poseAt: (c: number, r: number) => Pose | null, labelAt: (c: number, r: number) => string): string {
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push(cell(labelAt(c, r), poseAt(c, r), c, r));
  }
  const w = cols * CELL, h = rows * CELL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}

const SPECIAL: Pose[][] = [
  [CAST_WIND, CAST_HIT, mix(CAST_HIT, IDLE, .55)],
  [HUH_W, HUH_H, mix(HUH_H, IDLE, .55)],
  [BAN_W, BAN_H, BAN_R],
  [VOW_W, VOW_H, VOW_R],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'taki');
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* common.png is user art now, and the 1024 test halves come from scripts/split-common.ts,
   so this script only rasters what is still placeholder-marked here. */
const targets = [join(dir, 'special.png')];
assertAllWritable(targets);
rasterSheet(targets[0], special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
console.log('wrote taki special sheet');

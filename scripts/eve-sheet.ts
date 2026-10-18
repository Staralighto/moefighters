import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, isPlaceholderPng, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Eve. Common is the shared empty-hand set. Special columns are
   U 剑道三连 (bokken), I 请你喝茶 (cup), O 忍法·隐身术, L 武士道 (katana).
   super.png is twelve cuts; windup and sheathe stay on the L column. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; prone?: boolean; ox?: number; neck?: number;
  blade?: 'wood' | 'steel'; len?: number; cup?: boolean; fade?: number; arc?: number;
}

const IDLE: Pose = { lean: 0, crouch: 0, armF: [.45, 1.9], armB: [.25, 2.0], legF: [.25, 0], legB: [-.25, 0] };
const BLOCK: Pose = { lean: -.05, crouch: 8, armF: [1.1, 1.5], armB: [.9, 1.7], legF: [.35, 0], legB: [-.2, 0] };
const HURT: Pose = { lean: -.3, crouch: 4, look: -.15, armF: [-.6, -.4], armB: [-.9, -.3], legF: [.4, 0], legB: [-.3, 0] };
const LYING: Pose = { ...HURT, crouch: 0, legF: [.1, 0], legB: [-.1, 0], lying: true };
const JUMP: Pose = { lean: .05, crouch: 0, armF: [2.4, -.4], armB: [-1.2, -.6], legF: [.9, -1.4], legB: [.3, -1.0] };
const PUNCH_WIND: Pose = { lean: -.08, crouch: 2, armF: [-.4, -1.9], armB: [.9, -1.6], legF: [.3, 0], legB: [-.3, 0] };
const PUNCH_HIT: Pose = { lean: .15, crouch: 2, look: .58, armF: [1.57, 0], armB: [.5, -1.8], legF: [.5, 0], legB: [-.4, 0] };
const KICK_WIND: Pose = { lean: -.1, crouch: 4, armF: [.5, -1.6], armB: [.8, -1.4], legF: [-.5, .8], legB: [0, 0] };
const KICK_HIT: Pose = { lean: -.25, crouch: 0, look: .5, armF: [-.3, -1.2], armB: [1.0, -1.2], legF: [1.5, .2], legB: [-.1, 0] };
const DODGE: Pose = { lean: -.35, crouch: 8, look: -.12, armF: [-.6, -.6], armB: [-.9, -.4], legF: [.9, -.4], legB: [-.7, .2] };

const WOOD_W: Pose = { lean: -.12, crouch: 4, look: .4, armF: [2.2, .4], armB: [.4, -.5], legF: [.4, 0], legB: [-.35, 0], blade: 'wood', len: 58, ox: -14 };
const WOOD_H: Pose = { lean: .35, crouch: 4, look: .55, armF: [1.15, .15], armB: [-.6, -.4], legF: [.7, -.15], legB: [-.45, .2], blade: 'wood', len: 62, ox: -22 };
const WOOD_R: Pose = { lean: .05, crouch: 2, armF: [.7, 1.2], armB: [.2, .4], legF: [.3, 0], legB: [-.28, 0], blade: 'wood', len: 52, ox: -8 };
const TEA_W: Pose = { lean: .35, crouch: 6, look: .5, armF: [1.35, .1], armB: [.2, -.3], legF: [.85, -.2], legB: [-.55, .25], ox: -8 };
const TEA_H: Pose = { lean: .08, crouch: 2, look: .55, armF: [1.45, .05], armB: [.35, .2], legF: [.4, 0], legB: [-.3, 0], cup: true, ox: -10 };
const TEA_R: Pose = { lean: .45, crouch: 10, look: .2, armF: [.9, .8], armB: [.55, .6], legF: [.35, 0], legB: [-.3, 0] };
const SEAL_W: Pose = { lean: 0, crouch: 6, look: .35, armF: [.9, 1.6], armB: [.7, 1.7], legF: [.3, 0], legB: [-.28, 0] };
const SEAL_H: Pose = { ...SEAL_W, fade: .35 };
const SEAL_R: Pose = { ...IDLE };
const KAT_W: Pose = { lean: -.2, crouch: 3, look: .15, armF: [2.55, .05], armB: [.15, -.2], legF: [.35, 0], legB: [-.3, 0], blade: 'steel', len: 54, ox: -10 };
const KAT_H: Pose = { lean: .4, crouch: 5, look: .55, armF: [1.05, .1], armB: [-.7, -.3], legF: [.65, -.1], legB: [-.5, .25], blade: 'steel', len: 64, ox: -24 };
const KAT_R: Pose = { lean: .05, crouch: 2, armF: [.55, 1.35], armB: [.15, .3], legF: [.3, 0], legB: [-.25, 0], blade: 'steel', len: 50, ox: -6 };

/* Twelve cuts. Each one changes the arm, the lean and the arc so they do not read as one pose. */
const SLASH: Pose[] = [
  { lean: .2, crouch: 2, look: .5, armF: [2.35, .2], armB: [-.3, -.4], legF: [.45, 0], legB: [-.35, 0], blade: 'steel', len: 56, arc: -1.2, ox: -16 },
  { lean: .05, crouch: 2, look: .5, armF: [1.57, 0], armB: [.4, -.6], legF: [.55, -.1], legB: [-.4, .1], blade: 'steel', len: 64, arc: .1, ox: -22 },
  { lean: -.15, crouch: 4, look: .45, armF: [2.0, -.5], armB: [.6, -.2], legF: [.3, 0], legB: [-.4, .15], blade: 'steel', len: 54, arc: -2.2, ox: -14 },
  { lean: .45, crouch: 8, look: .6, armF: [.85, .15], armB: [-.8, -.2], legF: [.7, -.2], legB: [-.55, .3], blade: 'steel', len: 60, arc: .7, ox: -20 },
  { lean: .55, crouch: 6, look: .6, armF: [1.57, -.1], armB: [-1.0, -.5], legF: [1.05, -.25], legB: [-.7, .4], blade: 'steel', len: 58, arc: .15, ox: -18 },
  { lean: -.1, crouch: 8, look: .35, armF: [2.35, .25], armB: [.8, -.3], legF: [.3, 0], legB: [-.4, .1], blade: 'steel', len: 46, arc: -1.4, ox: -12 },
  { lean: .15, crouch: 16, look: .4, armF: [.55, .2], armB: [.2, .4], legF: [.8, -.3], legB: [-.2, 0], blade: 'steel', len: 58, arc: 1.1, ox: -16 },
  { lean: .3, crouch: 4, look: .55, armF: [1.9, .35], armB: [-.4, -.5], legF: [.6, -.1], legB: [-.4, .15], blade: 'steel', len: 56, arc: -.6, ox: -16 },
  { lean: -.35, crouch: 5, look: .2, armF: [2.15, .8], armB: [.9, -.3], legF: [.2, 0], legB: [-.55, .2], blade: 'steel', len: 52, arc: -1.8, ox: -10 },
  { lean: .1, crouch: 3, look: .5, armF: [1.2, 1.1], armB: [-.2, -.6], legF: [.4, 0], legB: [-.35, 0], blade: 'steel', len: 50, arc: .4, ox: -12 },
  { lean: .4, crouch: 7, look: .55, armF: [1.7, .45], armB: [-.9, -.2], legF: [.95, -.3], legB: [-.65, .35], blade: 'steel', len: 56, arc: -.4, ox: -18 },
  { lean: .25, crouch: 10, look: .5, armF: [1.0, .4], armB: [.8, 1.2], legF: [.5, -.1], legB: [-.4, .15], blade: 'steel', len: 54, arc: .9, ox: -14 },
];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
  };
}

const RUN: Pose[] = [
  { ox: -3, lean: .22, crouch: 8, look: .5, armF: [-1.05, -.3], armB: [.95, -.2], legF: [.41, -.2], legB: [-.92, 1] },
  { ox: 5, lean: .06, crouch: 1, look: .5, armF: [-.25, -1.15], armB: [.35, -1.05], legF: [.24, -.42], legB: [1.23, -1.69] },
  { ox: -3, lean: .22, crouch: 8, look: .5, armF: [.95, -.2], armB: [-1.05, -.3], legF: [-.92, 1], legB: [.41, -.2] },
  { ox: 5, lean: .06, crouch: 1, look: .5, armF: [.35, -1.05], armB: [-.25, -1.15], legF: [1.23, -1.69], legB: [.24, -.42] },
];

const LOCO: Record<string, Pose> = {
  idle: IDLE, run0: RUN[0], run1: RUN[1], run2: RUN[2], run3: RUN[3],
  jump: JUMP, block: BLOCK, dodge: DODGE, hurt: HURT, down: LYING, ko: LYING,
};

const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const FOOT = 12;
const COLOR = '#DDBBFF';

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

function handOf(from: Pt, [a1, a2]: Limb, d: typeof DIMS.slim, s: number): Pt {
  const u = d.upperArm * s, f = d.foreArm * s;
  return { x: from.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f, y: from.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f };
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
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
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
  const hand = handOf(shoulder, pose.armF, d, s);
  if (pose.blade) {
    const dir = pose.armF[0] + pose.armF[1];
    const ux = Math.sin(dir), uy = Math.cos(dir);
    const len = pose.len ?? 56;
    const tip = { x: hand.x + ux * len, y: hand.y + uy * len };
    const px = -uy, py = ux;
    const half = pose.blade === 'wood' ? 4.5 : 2.6;
    const fill = pose.blade === 'wood' ? '#e6d4a8' : '#f7f4ff';
    parts.push(poly([
      { x: hand.x + px * half, y: hand.y + py * half },
      { x: tip.x + px * .6, y: tip.y + py * .6 },
      { x: tip.x - px * .6, y: tip.y - py * .6 },
      { x: hand.x - px * half, y: hand.y - py * half },
    ], OUTLINE));
    parts.push(poly([
      { x: hand.x + px * (half - 1.2), y: hand.y + py * (half - 1.2) },
      { x: tip.x, y: tip.y },
      { x: hand.x - px * (half - 1.2), y: hand.y - py * (half - 1.2) },
    ], fill));
    parts.push(stroke(hand.x - px * 8, hand.y - py * 8, hand.x + px * 8, hand.y + py * 8, 3.5, OUTLINE));
    marks.push({ x: tip.x, y: tip.y, r: 4 });
  }
  if (pose.cup) {
    parts.push(`<ellipse cx="${hand.x.toFixed(1)}" cy="${(hand.y + 4).toFixed(1)}" rx="8" ry="5" fill="#f3e2c4" stroke="${OUTLINE}" stroke-width="2"/>`);
    marks.push({ x: hand.x, y: hand.y, r: 8 });
  }
  if (pose.arc != null && pose.blade) {
    const dir = pose.armF[0] + pose.armF[1];
    const ux = Math.sin(dir), uy = Math.cos(dir);
    const len = (pose.len ?? 56) * .55;
    const ax = hand.x + ux * len, ay = hand.y + uy * len;
    const a0 = pose.arc - .7, a1 = pose.arc + .7;
    parts.push(`<path d="M ${(ax + Math.cos(a0) * 22).toFixed(1)} ${(ay + Math.sin(a0) * 22).toFixed(1)} A 22 22 0 0 1 ${(ax + Math.cos(a1) * 22).toFixed(1)} ${(ay + Math.sin(a1) * 22).toFixed(1)}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`);
  }
  const ox = pose.ox ?? 0;
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + ox},${CELL - FOOT})`;
  const fade = pose.fade ?? 1;
  return { svg: `<g opacity="${fade}" transform="${origin}">${parts.join('')}</g>`, marks };
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

function commonPose(label: string): Pose | null {
  if (!label) return null;
  if (label in LOCO) return LOCO[label];
  const [name, phase] = label.split('-');
  const air = name.startsWith('air');
  const heavy = name.endsWith('Heavy') || name === 'heavy';
  const wind = heavy ? (air ? KICK_WIND : PUNCH_WIND) : (air ? JUMP : PUNCH_WIND);
  const hit = heavy ? (air ? KICK_HIT : PUNCH_HIT) : PUNCH_HIT;
  const rest = air ? JUMP : IDLE;
  return phase === 'windup' ? wind : phase === 'active' ? hit : mix(hit, rest, .55);
}

const SPECIAL: Pose[][] = [
  [WOOD_W, WOOD_H, WOOD_R],
  [TEA_W, TEA_H, TEA_R],
  [SEAL_W, SEAL_H, SEAL_R],
  [KAT_W, KAT_H, KAT_R],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'eve');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const superSheet = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SLASH[r * 4 + c], (c, r) => 'S' + (r * 4 + c));
const outs: [string, () => string, number, number][] = [
  [join(dir, 'common.png'), () => common, COMMON_COLS * CELL, COMMON_ROWS * CELL],
  [join(dir, 'special.png'), () => special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL],
  [join(dir, 'super.png'), () => superSheet, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL],
];
const writable = outs.filter(([p]) => !existsSync(p) || isPlaceholderPng(readFileSync(p)));
assertAllWritable(writable.map(([p]) => p));
for (const [p, svg, w, h] of writable) rasterSheet(p, svg(), w, h);
console.log(`wrote ${writable.length} of ${outs.length} eve files`);
